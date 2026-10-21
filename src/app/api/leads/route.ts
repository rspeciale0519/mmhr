import { createLead, LeadCreateError } from "@/server/commands/lead-create";
import { hasTrustedMutationOrigin } from "@/server/auth/server-action-request";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (request.method !== "POST" || !hasTrustedMutationOrigin(request.headers.get("origin"))) {
    return Response.json({ error: "request_rejected" }, { status: 403, headers: noStore });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "invalid_input" }, { status: 400, headers: noStore });
  }

  try {
    const result = await createLead(input);
    if (result.outcomeCode === "rate_limited") {
      return Response.json(
        { accepted: false, error: "rate_limited" },
        { status: 429, headers: { ...noStore, "Retry-After": "900" } },
      );
    }
    return Response.json(
      result.outcomeCode === "idempotency_conflict"
        ? { accepted: false, error: "request_not_accepted" }
        : { accepted: true },
      {
        status: result.outcomeCode === "idempotency_conflict" ? 409 : 200,
        headers: noStore,
      },
    );
  } catch (error) {
    if (error instanceof LeadCreateError && error.code === "INVALID_INPUT") {
      return Response.json({ error: "invalid_input" }, { status: 400, headers: noStore });
    }
    return Response.json({ error: "unavailable" }, { status: 503, headers: noStore });
  }
}
