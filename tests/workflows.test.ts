import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient, type WorkItem } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createWorkItem, updateWorkItem, claimWorkItem, transitionWorkItem } from "../src/lib/items";
import { getItemForUser } from "../src/lib/permissions";
import type { CurrentUser } from "../src/lib/auth";

const prisma = new PrismaClient();
const passwordHash = "not-used-by-service-tests";
let teamId = "";
let testUserIds: string[] = [];
let member: CurrentUser;
let secondMember: CurrentUser;
let lead: CurrentUser;
let viewer: CurrentUser;
let outsider: CurrentUser;

async function makeItem(overrides: Partial<Pick<WorkItem, "status" | "priority" | "assigneeId">> = {}) {
  const item = await prisma.workItem.create({
    data: {
      title: `Concurrency test ${randomUUID().slice(0, 8)}`,
      description: "A focused test fixture for operational workflow safety.",
      type: "TASK",
      teamId,
      createdById: member.id,
      ...overrides,
    },
  });
  await prisma.activityEvent.create({
    data: { itemId: item.id, actorId: member.id, type: "CREATED", message: "Created test fixture." },
  });
  return item;
}

beforeAll(async () => {
  const team = await prisma.team.create({ data: { name: `Test team ${randomUUID()}` } });
  teamId = team.id;
  const users = await Promise.all(
    ["member-a", "member-b", "lead", "viewer", "outsider"].map((name) =>
      prisma.user.create({
        data: { name, email: `${name}-${randomUUID()}@test.invalid`, passwordHash },
      }),
    ),
  );
  testUserIds = users.map(({ id }) => id);
  const [memberUser, secondMemberUser, leadUser, viewerUser, outsiderUser] = users;
  await prisma.membership.createMany({
    data: [
      { userId: memberUser.id, teamId, role: "MEMBER" },
      { userId: secondMemberUser.id, teamId, role: "MEMBER" },
      { userId: leadUser.id, teamId, role: "LEAD" },
      { userId: viewerUser.id, teamId, role: "VIEWER" },
    ],
  });
  const loadUser = async (id: string) => prisma.user.findUniqueOrThrow({
    where: { id },
    select: {
      id: true, name: true, email: true,
      memberships: { select: { role: true, team: { select: { id: true, name: true } } } },
    },
  });
  [member, secondMember, lead, viewer, outsider] = await Promise.all(users.map(({ id }) => loadUser(id)));
});

afterAll(async () => {
  if (teamId) {
    await prisma.workItem.deleteMany({ where: { teamId } });
    await prisma.team.delete({ where: { id: teamId } });
  }
  if (testUserIds.length) await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  await prisma.$disconnect();
});

describe("operational work correctness", () => {
  it("allows only one of two simultaneous teammates to claim an item", async () => {
    const item = await makeItem();
    const attempts = await Promise.allSettled([
      claimWorkItem(member, item.id, item.version),
      claimWorkItem(secondMember, item.id, item.version),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    expect(await prisma.workItem.count({ where: { id: item.id, assigneeId: { not: null } } })).toBe(1);
    expect(await prisma.activityEvent.count({ where: { itemId: item.id, type: "CLAIMED" } })).toBe(1);
    expect(await prisma.outboxJob.count({ where: { itemId: item.id, kind: "ITEM_CLAIMED" } })).toBe(1);
  });

  it("rejects stale edits without changing the newer value", async () => {
    const item = await makeItem();
    await updateWorkItem(member, item.id, { version: 1, title: "Updated with a current version" });
    await expect(updateWorkItem(member, item.id, { version: 1, title: "A stale edit" }))
      .rejects.toMatchObject({ status: 409 });
    await expect(prisma.workItem.findUniqueOrThrow({ where: { id: item.id } }))
      .resolves.toMatchObject({ title: "Updated with a current version", version: 2 });
    expect(await prisma.activityEvent.count({ where: { itemId: item.id, type: "UPDATED" } })).toBe(1);
  });

  it("creates one item when a request is retried with the same idempotency key", async () => {
    const input = {
      title: `Idempotent request ${randomUUID()}`,
      description: "Retried network requests must not create duplicate operational work.",
      type: "INCIDENT",
      priority: "HIGH",
      teamId,
    };
    const [first, retry] = await Promise.all([
      createWorkItem(member, input, "stable-client-request-key"),
      createWorkItem(member, input, "stable-client-request-key"),
    ]);
    expect(first.item.id).toBe(retry.item.id);
    expect([first.replayed, retry.replayed].sort()).toEqual([false, true]);
    expect(await prisma.workItem.count({ where: { id: first.item.id } })).toBe(1);
  });

  it("does not leak items outside a user's team and blocks viewer mutations", async () => {
    const item = await makeItem();
    await expect(getItemForUser(item.id, outsider)).rejects.toMatchObject({ status: 404 });
    await expect(updateWorkItem(viewer, item.id, { version: item.version, title: "Viewer edit" }))
      .rejects.toMatchObject({ status: 403 });
    await expect(claimWorkItem(viewer, item.id, item.version))
      .rejects.toMatchObject({ status: 403 });
  });

  it("enforces approval and state-machine rules in the service layer", async () => {
    const item = await makeItem({ status: "AWAITING_APPROVAL" });
    await expect(transitionWorkItem(member, item.id, item.version, "RESOLVED"))
      .rejects.toMatchObject({ status: 403 });
    await expect(transitionWorkItem(lead, item.id, item.version, "CLOSED"))
      .rejects.toMatchObject({ status: 422 });
    const resolved = await transitionWorkItem(lead, item.id, item.version, "RESOLVED");
    expect(resolved.status).toBe("RESOLVED");
    expect(await prisma.activityEvent.count({ where: { itemId: item.id, type: "STATUS_CHANGED" } })).toBe(1);
  });

  it("fails clearly with a conflict when the claim version is stale", async () => {
    const item = await makeItem();
    await updateWorkItem(lead, item.id, { version: item.version, priority: "URGENT" });
    await expect(claimWorkItem(member, item.id, item.version)).rejects.toMatchObject({ status: 409 });
  });

});
