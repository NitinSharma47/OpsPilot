import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, ApiError, parseJson } from "@/lib/http";
import { transitionWorkItem } from "@/lib/items";
import { transitionSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "Authentication required.");
    const parsed = transitionSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(422, "A valid status and version are required.");
    const { id } = await params;
    return NextResponse.json(await transitionWorkItem(user, id, parsed.data.version, parsed.data.status));
  } catch (error) {
    return apiError(error);
  }
}
