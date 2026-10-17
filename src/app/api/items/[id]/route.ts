import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, ApiError, parseJson } from "@/lib/http";
import { updateWorkItem } from "@/lib/items";
import { getItemForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "Authentication required.");
    const { id } = await params;
    await getItemForUser(id, user);
    const item = await prisma.workItem.findUniqueOrThrow({
      where: { id },
      include: {
        team: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        activities: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 51,
          include: { actor: { select: { id: true, name: true } } },
        },
        comments: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 100,
          include: { author: { select: { id: true, name: true } } },
        },
      },
    });
    const teamMembers = await prisma.membership.findMany({
      where: { teamId: item.teamId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    });
    const activities = [...item.activities];
    const hasMoreActivities = activities.length > 50;
    if (hasMoreActivities) activities.pop();
    const comments = [...item.comments].reverse();
    return NextResponse.json({
      ...item,
      activities,
      nextActivityCursor: hasMoreActivities ? activities.at(-1)?.id ?? null : null,
      comments,
      teamMembers: teamMembers.map(({ user: member, role }) => ({ ...member, role })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "Authentication required.");
    const { id } = await params;
    return NextResponse.json(await updateWorkItem(user, id, await parseJson(request)));
  } catch (error) {
    return apiError(error);
  }
}
