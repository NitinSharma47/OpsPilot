import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { createSession, setSessionCookie } from "@/lib/auth";
import { ApiError, apiError, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase().trim()),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    const parsed = loginSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(422, "Enter a valid email and password.");
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
      throw new ApiError(401, "Email or password is incorrect.");
    }
    await setSessionCookie(await createSession(user.id));
    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  } catch (error) {
    return apiError(error);
  }
}
