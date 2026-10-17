import { Prisma, type WorkItem, type WorkStatus } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { createItemSchema, updateItemSchema, type CreateItemInput, type UpdateItemInput } from "@/lib/schemas";
import { getItemForUser, requireMinimumRole } from "@/lib/permissions";
import { assertClaimEligible, assertTransition } from "@/lib/workflow";

export async function createWorkItem(user: CurrentUser, input: unknown, key: string | null) {
  const parsed = createItemSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(422, "Please check the work item details.", parsed.error.flatten());
  if (!key || key.length > 200) throw new ApiError(400, "A valid Idempotency-Key header is required.");
  const data: CreateItemInput = parsed.data;
  const membership = user.memberships.find((entry) => entry.team.id === data.teamId);
  if (!membership) throw new ApiError(404, "Team not found.");
  requireMinimumRole(membership.role, "MEMBER");

  const previous = await prisma.idempotencyKey.findUnique({
    where: { userId_key: { userId: user.id, key } },
    include: { item: true },
  });
  if (previous) return { item: previous.item, replayed: true };

  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.workItem.create({
        data: {
          title: data.title,
          description: data.description,
          type: data.type,
          priority: data.priority,
          teamId: data.teamId,
          createdById: user.id,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
        },
      });
      await tx.activityEvent.create({
        data: { itemId: created.id, actorId: user.id, type: "CREATED", message: "Created this work item." },
      });
      await tx.outboxJob.create({
        data: {
          itemId: created.id,
          kind: "ITEM_CREATED",
          payload: { itemId: created.id, teamId: created.teamId, title: created.title },
        },
      });
      await tx.idempotencyKey.create({ data: { userId: user.id, key, itemId: created.id } });
      return created;
    });
    return { item, replayed: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.idempotencyKey.findUnique({
        where: { userId_key: { userId: user.id, key } },
        include: { item: true },
      });
      if (duplicate) return { item: duplicate.item, replayed: true };
    }
    throw error;
  }
}

export async function updateWorkItem(user: CurrentUser, itemId: string, input: unknown) {
  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(422, "Please check the fields to update.", parsed.error.flatten());
  const data: UpdateItemInput = parsed.data;
  const { item, role } = await getItemForUser(itemId, user);
  requireMinimumRole(role, data.assigneeId !== undefined || data.priority !== undefined ? "LEAD" : "MEMBER");
  if (data.assigneeId) {
    const teammate = await prisma.membership.findUnique({
      where: { userId_teamId: { userId: data.assigneeId, teamId: item.teamId } },
    });
    if (!teammate) throw new ApiError(422, "Assignee must belong to the work item's team.");
  }

  const { version, dueAt, ...fields } = data;
  const changes = Object.keys(fields).filter((key) => fields[key as keyof typeof fields] !== item[key as keyof WorkItem]);
  const dueDateChanged = dueAt !== undefined &&
    (dueAt === null ? item.dueAt !== null : item.dueAt?.toISOString() !== dueAt);
  if (changes.length === 0 && !dueDateChanged) return item;

  const result = await prisma.$transaction(async (tx) => {
    const changed = await tx.workItem.updateMany({
      where: { id: itemId, teamId: item.teamId, version },
      data: {
        ...fields,
        ...(dueAt === undefined ? {} : { dueAt: dueAt ? new Date(dueAt) : null }),
        version: { increment: 1 },
      },
    });
    if (changed.count === 0) {
      const latest = await tx.workItem.findUnique({ where: { id: itemId } });
      throw new ApiError(409, "This item changed while you were editing. Reload and try again.", latest);
    }

    const updated = await tx.workItem.findUniqueOrThrow({ where: { id: itemId } });
    if (fields.priority && fields.priority !== item.priority) {
      await tx.activityEvent.create({
        data: {
          itemId, actorId: user.id, type: "PRIORITY_CHANGED",
          message: `Changed priority from ${item.priority} to ${fields.priority}.`,
          metadata: { from: item.priority, to: fields.priority },
        },
      });
    }
    if (fields.assigneeId !== undefined && fields.assigneeId !== item.assigneeId) {
      await tx.activityEvent.create({
        data: {
          itemId, actorId: user.id, type: "ASSIGNED",
          message: fields.assigneeId ? "Changed the assignee." : "Unassigned this item.",
          metadata: { from: item.assigneeId, to: fields.assigneeId },
        },
      });
      if (fields.assigneeId) {
        await tx.outboxJob.create({
          data: {
            itemId, kind: "ITEM_ASSIGNED",
            payload: { itemId, assigneeId: fields.assigneeId, title: updated.title },
          },
        });
      }
    }
    if (["title", "description"].some((field) => changes.includes(field)) || dueDateChanged) {
      await tx.activityEvent.create({
        data: { itemId, actorId: user.id, type: "UPDATED", message: "Updated work item details." },
      });
    }
    return updated;
  });
  return result;
}

export async function claimWorkItem(user: CurrentUser, itemId: string, version: number) {
  const { item, role } = await getItemForUser(itemId, user);
  requireMinimumRole(role, "MEMBER");
  assertClaimEligible(item.status);
  if (item.assigneeId === user.id) return item;
  if (item.assigneeId) throw new ApiError(409, "This item has already been claimed.", item);

  return prisma.$transaction(async (tx) => {
    const result = await tx.workItem.updateMany({
      where: { id: itemId, teamId: item.teamId, assigneeId: null, version },
      data: { assigneeId: user.id, version: { increment: 1 } },
    });
    if (!result.count) {
      const latest = await tx.workItem.findUnique({ where: { id: itemId } });
      throw new ApiError(
        409,
        latest?.assigneeId ? "Another teammate claimed this item first." : "This item changed. Reload before claiming.",
        latest,
      );
    }
    const updated = await tx.workItem.findUniqueOrThrow({ where: { id: itemId } });
    await tx.activityEvent.create({
      data: { itemId, actorId: user.id, type: "CLAIMED", message: "Claimed this work item." },
    });
    await tx.outboxJob.create({
      data: { itemId, kind: "ITEM_CLAIMED", payload: { itemId, assigneeId: user.id } },
    });
    return updated;
  });
}

export async function transitionWorkItem(
  user: CurrentUser,
  itemId: string,
  version: number,
  nextStatus: WorkStatus,
) {
  const { item, role } = await getItemForUser(itemId, user);
  requireMinimumRole(role, "MEMBER");
  assertTransition(item.status, nextStatus, role);

  return prisma.$transaction(async (tx) => {
    const result = await tx.workItem.updateMany({
      where: { id: itemId, teamId: item.teamId, version, status: item.status },
      data: { status: nextStatus, version: { increment: 1 } },
    });
    if (!result.count) {
      const latest = await tx.workItem.findUnique({ where: { id: itemId } });
      throw new ApiError(409, "This item changed before the transition was saved. Reload and try again.", latest);
    }
    const updated = await tx.workItem.findUniqueOrThrow({ where: { id: itemId } });
    await tx.activityEvent.create({
      data: {
        itemId, actorId: user.id, type: "STATUS_CHANGED",
        message: `Moved this item from ${item.status.replaceAll("_", " ").toLowerCase()} to ${nextStatus.replaceAll("_", " ").toLowerCase()}.`,
        metadata: { from: item.status, to: nextStatus },
      },
    });
    return updated;
  });
}
