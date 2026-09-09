import { createCallerFactory, router } from "./trpc";
import { healthRouter } from "./routers/health";
import { invitationsRouter } from "./routers/invitations";
import { membershipsRouter } from "./routers/memberships";
import { organizationsRouter } from "./routers/organizations";
import { intakesRouter } from "./routers/intakes";
import { evaluationsRouter } from "./routers/evaluations";

export const appRouter = router({
  health: healthRouter,
  invitations: invitationsRouter,
  memberships: membershipsRouter,
  organizations: organizationsRouter,
  intakes: intakesRouter,
  evaluations: evaluationsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
