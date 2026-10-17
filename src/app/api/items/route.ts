import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, ApiError, parseJson } from "@/lib/http";
import { createWorkItem } from "@/lib/items";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { priorities, statuses, workTypes } from "@/lib/schemas";
import { z } from "zod";

const filtersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(statuses).optional(),
  priority: z.enum(priorities).optional(),
  type: z.enum(workTypes).optional(),
  view: z.enum(["assigned", "urgent", "approval"]).optional(),
  q: z.string().trim().max(100).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "Authentication required.");
    const params = new URL(request.url).searchParams;
    const parsed = filtersSchema.safeParse(Object.fromEntries(params.entries()));
    if (!parsed.success) throw new ApiError(400, "One or more filters are invalid.", parsed.error.flatten());
    const { limit, status, priority, type, view, q: query } = parsed.data;
    const teamId = params.get("teamId");
    const assignee = params.get("assignee");
    if (assignee && assignee !== "me" && assignee !== "unassigned") {
      throw new ApiError(400, "Assignee filter must be 'me' or 'unassigned'.");
    }
    const teamIds = user.memberships.map((membership) => membership.team.id);
    const where: Prisma.WorkItemWhereInput = {
      teamId: { in: teamIds },
    };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (type) where.type = type;
    if (teamId) where.teamId = { in: teamIds.includes(teamId) ? [teamId] : [] };
    if (assignee === "me" || view === "assigned") where.assigneeId = user.id;
    if (assignee === "unassigned") where.assigneeId = null;
    if (view === "urgent") {
      where.assigneeId = null;
      where.priority = "URGENT";
      where.status = { notIn: ["RESOLVED", "CLOSED"] };
    }
    if (view === "approval") {
      const leadTeamIds = user.memberships.filter(({ role }) => role === "LEAD" || role === "ADMIN").map(({ team }) => team.id);
      where.teamId = { in: leadTeamIds };
      where.status = "AWAITING_APPROVAL";
    }
    if (query) {
      where.OR = [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ];
    }
    const cursor = params.get("cursor");
    if (cursor) {
      const cursorItem = await prisma.workItem.findFirst({
        where: { ...where, id: cursor },
        select: { id: true },
      });
      if (!cursorItem) throw new ApiError(400, "This page cursor expired. Refresh the queue to continue.");
    }
    const items = await prisma.workItem.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        team: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    const hasMore = items.length > limit;
    if (hasMore) items.pop();
    return NextResponse.json({ items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "Authentication required.");
    const result = await createWorkItem(user, await parseJson(request), request.headers.get("idempotency-key"));
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
