import { TeamRole } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const rank: Record<TeamRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  LEAD: 2,
  ADMIN: 3,
};

export function roleAtLeast(role: TeamRole, minimum: TeamRole) {
  return rank[role] >= rank[minimum];
}

export async function getItemForUser(itemId: string, user: CurrentUser) {
  const item = await prisma.workItem.findFirst({
    where: { id: itemId, team: { memberships: { some: { userId: user.id } } } },
  });
  if (!item) throw new ApiError(404, "Work item not found.");
  const membership = user.memberships.find((entry) => entry.team.id === item.teamId);
  if (!membership) throw new ApiError(404, "Work item not found.");
  return { item, role: membership.role };
}

export function requireMinimumRole(role: TeamRole, minimum: TeamRole) {
  if (!roleAtLeast(role, minimum)) {
    throw new ApiError(403, `This action requires the ${minimum.toLowerCase()} role or higher.`);
  }
}
