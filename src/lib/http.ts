import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
      { status: error.status },
    );
  }
  console.error("Unexpected API error", error);
  return NextResponse.json({ error: "An unexpected server error occurred." }, { status: 500 });
}

export async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
}
