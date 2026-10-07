import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { hiddenTrpcProcedures } from "@/lib/launch-surface";
import { appRouter } from "@/server/trpc/root";
import { createContext } from "@/server/trpc/trpc";

function handler(req: Request) {
  // Owner decision D2: procedures in hidden launch areas never run.
  if (hiddenTrpcProcedures(new URL(req.url).pathname).length > 0) {
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: { "cache-control": "private, no-store" } },
    );
  }
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
  });
}

export { handler as GET, handler as POST };
