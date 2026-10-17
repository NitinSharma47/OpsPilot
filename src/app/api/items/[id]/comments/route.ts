import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, ApiError, parseJson } from "@/lib/http";
import { getItemForUser, requireMinimumRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { commentSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "Authentication required.");
    const { id } = await params;
    const parsed = commentSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(422, "Comments must contain 1–4,000 characters.");
    const { item, role } = await getItemForUser(id, user);
    requireMinimumRole(role, "MEMBER");
    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { itemId: id, authorId: user.id, body: parsed.data.body },
        include: { author: { select: { id: true, name: true } } },
      });
      await tx.activityEvent.create({
        data: { itemId: id, actorId: user.id, type: "COMMENTED", message: "Added a comment." },
      });
      return created;
    });
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
