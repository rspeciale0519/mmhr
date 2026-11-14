import { createCallerFactory, router } from "./trpc";
import { healthRouter } from "./routers/health";
import { invitationsRouter } from "./routers/invitations";
import { membershipsRouter } from "./routers/memberships";
import { organizationsRouter } from "./routers/organizations";
import { intakesRouter } from "./routers/intakes";
import { evaluationsRouter } from "./routers/evaluations";
import { rfpsRouter } from "./routers/rfps";
import { vendorEvidenceRouter } from "./routers/vendor-evidence";
import { responsesRouter } from "./routers/responses";
import { clarificationsRouter } from "./routers/clarifications";
import { demosRouter } from "./routers/demos";
import { documentsRouter } from "./routers/documents";
import { proposalsRouter } from "./routers/proposals";
import { contractsRouter } from "./routers/contracts";
import { tasksRouter } from "./routers/tasks";
import { auditRouter } from "./routers/audit";

export const appRouter = router({
  health: healthRouter,
  invitations: invitationsRouter,
  memberships: membershipsRouter,
  organizations: organizationsRouter,
  intakes: intakesRouter,
  evaluations: evaluationsRouter,
  rfps: rfpsRouter,
  vendorEvidence: vendorEvidenceRouter,
  responses: responsesRouter,
  clarifications: clarificationsRouter,
  demos: demosRouter,
  documents: documentsRouter,
  proposals: proposalsRouter,
  contracts: contractsRouter,
  tasks: tasksRouter,
  audit: auditRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
