import { handleReview, readReviewJson, requireSameOrigin, reviewJson } from "@/gallery/review/http";
import { recipeInputSchema } from "@/gallery/review/model";
import { saveRecipe } from "@/gallery/review/store";

/** Saves one final-design recipe: which design each piece should come from. */
export async function POST(request: Request) {
  return handleReview(async () => {
    requireSameOrigin(request);
    const input = await readReviewJson(request, recipeInputSchema, 40_000);
    return reviewJson(await saveRecipe(input), 201);
  });
}
