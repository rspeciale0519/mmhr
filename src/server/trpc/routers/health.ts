import { identityProcedure, publicProcedure, router } from "../trpc";

/**
 * Liveness + context wiring check. Kept in the tree permanently: it is the
 * cheapest way to prove the API layer and its auth context are intact.
 */
export const healthRouter = router({
  ping: publicProcedure.query(() => ({ ok: true as const })),

  whoami: identityProcedure.query(({ ctx }) => ({
    userId: ctx.user?.id ?? null,
  })),
});
