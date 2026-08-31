import { registerNewsletterSubscriber, NewsletterServiceError } from "@/server/workflows/newsletter-contract";
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
    const result = await registerNewsletterSubscriber(input);
    return Response.json(
      result.outcome === "idempotency_conflict"
        ? { accepted: false, error: "request_not_accepted" }
        : { accepted: true },
      {
        status: result.outcome === "idempotency_conflict" ? 409 : 200,
        headers: noStore,
      },
    );
  } catch (error) {
    if (error instanceof NewsletterServiceError && error.code === "INVALID_INPUT") {
      return Response.json({ error: "invalid_input" }, { status: 400, headers: noStore });
    }
    return Response.json({ error: "unavailable" }, { status: 503, headers: noStore });
  }
}
