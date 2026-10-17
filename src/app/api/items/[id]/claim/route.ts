import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, ApiError, parseJson } from "@/lib/http";
import { claimWorkItem } from "@/lib/items";
import { z } from "zod";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError(401, "Authentication required.");
    const { id } = await params;
    const parsed = z.object({ version: z.number().int().positive() }).safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(422, "A valid item version is required.");
    return NextResponse.json(await claimWorkItem(user, id, parsed.data.version));
  } catch (error) {
    return apiError(error);
  }
}
