import { NextResponse } from "next/server";

type HeadersInitLike = HeadersInit | undefined;

export function apiError(
  message: string,
  status = 400,
  headers?: HeadersInitLike,
) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    { status, headers },
  );
}

export function apiOk<T extends Record<string, unknown>>(
  data: T,
  status = 200,
  headers?: HeadersInitLike,
) {
  return NextResponse.json(
    {
      ok: true,
      ...data,
    },
    { status, headers },
  );
}

export async function readJsonObject(req: Request) {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};
