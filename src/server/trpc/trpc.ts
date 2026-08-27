import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import { createClient } from "@/lib/supabase/server";

export type AuthedUser = { id: string; email?: string };

export type Context = {
  user: AuthedUser | null;
};

/**
 * Builds the request context. Identity comes from getClaims() (a verified JWT),
 * never getSession() — an unverified session must not be able to authorize a
 * procedure.
 */
export async function createContext(): Promise<Context> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  const claims = data?.claims;
  if (!claims?.sub) return { user: null };

  return {
    user: { id: String(claims.sub), email: claims.email as string | undefined },
  };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Open to anyone, signed in or not. */
export const publicProcedure = t.procedure;

/**
 * Requires a verified session. This is authentication only — it says nothing
 * about *what* the user may touch. Org-scoped authorization is enforced by RLS
 * plus organization permission middleware, which remains unimplemented.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
