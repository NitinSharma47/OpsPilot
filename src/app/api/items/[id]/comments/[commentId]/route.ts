import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, ApiError } from "@/lib/http";
import { deleteWorkComment } from "@/lib/items";

type Context = { params: Promise<{ id: string; commentId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "Authentication required.");
    const { id, commentId } = await params;
    return NextResponse.json(await deleteWorkComment(user, id, commentId));
  } catch (error) {
    return apiError(error);
  }
}
