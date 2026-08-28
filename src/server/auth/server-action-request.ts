const SERVER_ACTION_HEADER = "next-action";

function parseExactOrigin(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    const normalizedInput = value.endsWith("/") ? value.slice(0, -1) : value;

    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      normalizedInput !== url.origin
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function hasTrustedMutationOrigin(
  origin: string | null,
  configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL,
): boolean {
  const requestOrigin = parseExactOrigin(origin);
  const appOrigin = parseExactOrigin(configuredAppUrl);

  return requestOrigin !== null && requestOrigin === appOrigin;
}

export function shouldRejectServerActionRequest(request: {
  method: string;
  headers: Pick<Headers, "get" | "has">;
}): boolean {
  if (!request.headers.has(SERVER_ACTION_HEADER)) return false;

  return (
    request.method !== "POST" ||
    !hasTrustedMutationOrigin(request.headers.get("origin"))
  );
}

/**
 * Protects direct Server Action execution when middleware is bypassed.
 * Next.js supplies the HTTP method boundary. This check requires an exact origin.
 */
export function requireTrustedServerActionOrigin(origin: string | null): void {
  if (!hasTrustedMutationOrigin(origin)) {
    throw new Error("Server Action request rejected");
  }
}
