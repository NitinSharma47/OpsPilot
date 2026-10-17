import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, ApiError } from "@/lib/http";
import { getItemForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Context = { params: Promise<{ id: string }> };
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(30),
  cursor: z.string().min(1).max(100).optional(),
});

export async function GET(request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "Authentication required.");
    const { id } = await params;
    await getItemForUser(id, user);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if (!parsed.success) throw new ApiError(400, "Activity page parameters are invalid.", parsed.error.flatten());
    const { limit, cursor } = parsed.data;
    if (cursor && !(await prisma.activityEvent.findFirst({ where: { id: cursor, itemId: id }, select: { id: true } }))) {
      throw new ApiError(400, "This activity cursor expired. Refresh the item to continue.");
    }
    const events = await prisma.activityEvent.findMany({
      where: { itemId: id },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { actor: { select: { id: true, name: true } } },
    });
    const hasMore = events.length > limit;
    if (hasMore) events.pop();
    return NextResponse.json({ events, nextCursor: hasMore ? events.at(-1)?.id ?? null : null });
  } catch (error) {
    return apiError(error);
  }
}
