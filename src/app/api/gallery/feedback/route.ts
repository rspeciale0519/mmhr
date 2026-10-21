import { handleReview, readReviewJson, requireSameOrigin, ReviewRequestError, reviewJson } from "@/gallery/review/http";
import { feedbackIdSchema, feedbackInputSchema, reviewTargets } from "@/gallery/review/model";
import { listFeedback, removePick, saveFeedback } from "@/gallery/review/store";

export async function POST(request: Request) {
  return handleReview(async () => {
    requireSameOrigin(request);
    const input = await readReviewJson(request, feedbackInputSchema, 12_000);
    return reviewJson(await saveFeedback(input), 201);
  });
}

/** Comments and notes for one design, so reviewers can see pins left earlier. */
export async function GET(request: Request) {
  return handleReview(async () => {
    const design = new URL(request.url).searchParams.get("design") ?? "";
    const target = reviewTargets.find((item) => item === design);
    if (!target) throw new ReviewRequestError(400, "Unknown design.");
    return reviewJson({ items: await listFeedback(target) });
  });
}

export async function DELETE(request: Request) {
  return handleReview(async () => {
    requireSameOrigin(request);
    const id = feedbackIdSchema.safeParse(new URL(request.url).searchParams.get("id"));
    if (!id.success) throw new ReviewRequestError(400, "A valid pick id is required.");
    await removePick(id.data);
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  });
}
