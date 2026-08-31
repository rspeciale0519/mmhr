import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  authorizePermission,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";
import {
  isPermissionKey,
  isPermissionScopeAllowed,
  parsePermissionScope,
  type PermissionKey,
  type PermissionScope,
} from "@/server/auth/permission-registry";
import { hasTrustedMutationOrigin } from "@/server/auth/server-action-request";
import {
  parseVerifiedIdentity,
  type VerifiedIdentity,
} from "@/server/auth/verified-identity";

export type AuthedUser = VerifiedIdentity;

export type RequestTransport = Readonly<{
  method: string;
  origin: string | null;
}>;

export type Context = {
  user: AuthedUser | null;
  supabase?: RequestSupabaseClient;
  transport?: RequestTransport;
};

/**
 * The fetch adapter supplies its Request. Direct query callers can omit it;
 * mutations without request transport facts remain denied.
 */
export async function createContext(options?: { req: Request }): Promise<Context> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  return {
    user: error ? null : parseVerifiedIdentity(data?.claims),
    supabase,
    ...(options && {
      transport: Object.freeze({
        method: options.req.method,
        origin: options.req.headers.get("origin"),
      }),
    }),
  };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

// All exported builders inherit this check, including identity-only mutations.
const baseProcedure = t.procedure.use(({ ctx, type, next }) => {
  if (type === "mutation") {
    const transport = ctx.transport;
    if (
      !transport ||
      transport.method !== "POST" ||
      !hasTrustedMutationOrigin(transport.origin)
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Mutation request rejected",
      });
    }
  }

  return next();
});

/** Open to anyone; mutations still require an exact-origin POST request. */
export const publicProcedure = baseProcedure;

/**
 * Requires a verified session. This is authentication only — it says nothing
 * about what the user may touch. Protected operations use permissionProcedure
 * and fixed JWT-scoped database functions in addition to this boundary.
 */
export const identityProcedure = baseProcedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

type PermissionProcedureOptions<TInput, TParsedInput> = {
  permission: PermissionKey;
  input: z.ZodType<TParsedInput, TInput>;
  resolveScope: (input: TParsedInput) => PermissionScope;
};

/** Validates input before resolving scope and rechecks the caller through SQL. */
export function permissionProcedure<TInput, TParsedInput>(
  options: PermissionProcedureOptions<TInput, TParsedInput>,
) {
  const procedure = identityProcedure.input(options.input).use(async ({ ctx, input, next }) => {
    const scope = parsePermissionScope(options.resolveScope(input));
    if (!scope) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid authorization scope",
      });
    }

    const denied = () =>
      new TRPCError({
        code: scope.kind === "organization" ? "NOT_FOUND" : "FORBIDDEN",
        message: scope.kind === "organization" ? "Resource not found" : "Permission denied",
      });

    if (
      !isPermissionKey(options.permission) ||
      !isPermissionScopeAllowed(options.permission, scope)
    ) {
      throw denied();
    }

    const authorization = await authorizePermission(options.permission, scope, {
      supabase: ctx.supabase,
    });
    if (!authorization) throw denied();

    return next({ ctx: { ...ctx, supabase: authorization.supabase, authorization } });
  });

  // A later input parser or middleware could replace the authorized scope.
  // The complete input schema must therefore precede these terminal methods.
  return Object.freeze({ query: procedure.query, mutation: procedure.mutation });
}
