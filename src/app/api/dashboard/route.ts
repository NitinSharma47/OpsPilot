import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const teamIds = user.memberships.map((membership) => membership.team.id);
  const teamFilter = { teamId: { in: teamIds } };
  const [assignedToMe, urgentUnassigned, awaitingApproval] = await Promise.all([
    prisma.workItem.count({ where: { ...teamFilter, assigneeId: user.id, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
    prisma.workItem.count({ where: { ...teamFilter, assigneeId: null, priority: "URGENT", status: { notIn: ["RESOLVED", "CLOSED"] } } }),
    prisma.workItem.count({
      where: {
        ...teamFilter,
        status: "AWAITING_APPROVAL",
        team: { memberships: { some: { userId: user.id, role: { in: ["LEAD", "ADMIN"] } } } },
      },
    }),
  ]);
  return NextResponse.json({ assignedToMe, urgentUnassigned, awaitingApproval });
}
