"use client";

export class RequestError extends Error {
  constructor(readonly status: number, message: string, readonly details?: unknown) {
    super(message);
  }
}

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  let body: { error?: unknown; details?: unknown };
  try {
    body = await response.json();
  } catch {
    throw new RequestError(response.status, "The server returned an invalid response.");
  }
  if (!response.ok) {
    throw new RequestError(
      response.status,
      typeof body.error === "string" ? body.error : "The request could not be completed.",
      body.details,
    );
  }
  return body as T;
}
