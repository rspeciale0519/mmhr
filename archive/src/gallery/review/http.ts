import "server-only";

import type { z } from "zod";

import { ReviewStorageMissingError } from "./store";

const noStore = { "Cache-Control": "private, no-store" };

export class ReviewRequestError extends Error {
  constructor(readonly status: 400 | 403 | 413, message: string) {
    super(message);
    this.name = "ReviewRequestError";
  }
}

export const reviewJson = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

function originHost(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    return url.origin === origin ? url.host : null;
  } catch {
    return null;
  }
}

/**
 * Review saves come only from the gallery pages on the same deployment. The
 * browser's Origin host must equal the host the request was sent to, and the
 * JSON content type forces a browser preflight for any cross-site attempt.
 */
export function requireSameOrigin(request: Request): void {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const contentType = request.headers.get("content-type") ?? "";
  if (originHost(request.headers.get("origin")) !== host) {
    throw new ReviewRequestError(403, "This request must come from the gallery.");
  }
  if (request.method !== "DELETE" && !contentType.toLowerCase().startsWith("application/json")) {
    throw new ReviewRequestError(403, "This request must come from the gallery.");
  }
}

export async function readReviewJson<T extends z.ZodType>(request: Request, schema: T, maxBytes: number): Promise<z.output<T>> {
  const raw = await request.text();
  if (raw.length > maxBytes) throw new ReviewRequestError(413, "This is too long to save.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ReviewRequestError(400, "The request was not valid.");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const message = parsed.error.issues.find((issue) => issue.code === "custom")?.message;
    throw new ReviewRequestError(400, message ?? "Some details are missing or too long. Check them and try again.");
  }
  return parsed.data;
}

/** Turns known failures into clear JSON errors. Unknown failures are logged and reported as 500. */
export async function handleReview(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ReviewRequestError) return reviewJson({ error: error.message }, error.status);
    if (error instanceof ReviewStorageMissingError) {
      return reviewJson({ error: "Review storage is not set up on this deployment yet." }, 503);
    }
    console.error("gallery review request failed", error);
    return reviewJson({ error: "The server could not save this. Try again in a moment." }, 500);
  }
}
