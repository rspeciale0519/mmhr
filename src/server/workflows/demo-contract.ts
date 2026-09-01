import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const reference = z.string().trim().min(1).max(500).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/);

export const demoStatuses = ["requested", "scheduled", "completed", "cancelled", "no_show"] as const;
export type DemoStatus = (typeof demoStatuses)[number];

const demoRequestSchema = z
  .strictObject({
    demoId: uuid,
    dealId: uuid,
    customerOrganizationId: uuid,
    vendorOrganizationId: uuid,
    requestedByIdentityId: uuid,
    requestedAt: timestamp,
    status: z.enum(demoStatuses),
    revision: z.number().int().min(1),
    scheduledStartAt: timestamp.nullable(),
    scheduledEndAt: timestamp.nullable(),
    meetingReference: reference.nullable(),
  })
  .superRefine((demo, context) => {
    if (demo.customerOrganizationId === demo.vendorOrganizationId) {
      context.addIssue({ code: "custom", path: ["vendorOrganizationId"], message: "Customer and vendor must differ" });
    }
    const scheduled = demo.status === "scheduled";
    if (scheduled && (demo.scheduledStartAt === null || demo.scheduledEndAt === null)) {
      context.addIssue({ code: "custom", path: ["status"], message: "Scheduled demos require start and end times" });
    }
    if (!scheduled && (demo.scheduledStartAt !== null || demo.scheduledEndAt !== null || demo.meetingReference !== null)) {
      context.addIssue({ code: "custom", path: ["status"], message: "Only scheduled demos may contain meeting details" });
    }
    if (demo.scheduledStartAt !== null && demo.scheduledEndAt !== null
      && Date.parse(demo.scheduledEndAt) <= Date.parse(demo.scheduledStartAt)) {
      context.addIssue({ code: "custom", path: ["scheduledEndAt"], message: "Demo end must follow its start" });
    }
  });

const demoTransitionSchema = z.strictObject({
  demoId: uuid,
  fromStatus: z.enum(demoStatuses),
  toStatus: z.enum(demoStatuses),
  expectedRevision: z.number().int().min(1),
  actorIdentityId: uuid,
  occurredAt: timestamp,
  reason: z.string().trim().min(1).max(1_000),
  scheduledStartAt: timestamp.nullable(),
  scheduledEndAt: timestamp.nullable(),
  meetingReference: reference.nullable(),
  correlationId: uuid,
});

export type DemoRequest = z.output<typeof demoRequestSchema>;
export type DemoTransition = z.output<typeof demoTransitionSchema>;

const allowedTransitions: Readonly<Record<DemoStatus, readonly DemoStatus[]>> = {
  requested: ["scheduled", "cancelled"],
  scheduled: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export function parseDemoRequest(value: unknown): DemoRequest {
  const result = demoRequestSchema.safeParse(value);
  if (!result.success) throw new Error("Invalid demo request");
  return result.data;
}

export function createDemoRequest(input: unknown): Readonly<DemoRequest> {
  const request = parseDemoRequest(input);
  if (request.status !== "requested" || request.scheduledStartAt !== null || request.scheduledEndAt !== null || request.meetingReference !== null) {
    throw new Error("New demos must start as requested");
  }
  return deepFreeze({ ...request });
}

/** Applies one audited transition and increments the optimistic revision. */
export function transitionDemoRequest(recordInput: DemoRequest, input: unknown): Readonly<DemoRequest> {
  const record = parseDemoRequest(recordInput);
  const result = demoTransitionSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid demo transition");
  const transition = result.data;
  if (transition.demoId !== record.demoId || transition.fromStatus !== record.status) {
    throw new Error("Demo transition is stale");
  }
  if (transition.expectedRevision !== record.revision) throw new Error("Demo revision is stale");
  if (!allowedTransitions[record.status].includes(transition.toStatus)) throw new Error("Demo transition is not allowed");
  const scheduled = transition.toStatus === "scheduled";
  if (scheduled && (transition.scheduledStartAt === null || transition.scheduledEndAt === null || transition.meetingReference === null)) {
    throw new Error("Scheduled demos require meeting details");
  }
  if (!scheduled && (transition.scheduledStartAt !== null || transition.scheduledEndAt !== null || transition.meetingReference !== null)) {
    throw new Error("Only scheduled demos may contain meeting details");
  }
  if (transition.scheduledStartAt !== null && transition.scheduledEndAt !== null
    && Date.parse(transition.scheduledEndAt) <= Date.parse(transition.scheduledStartAt)) {
    throw new Error("Demo end must follow its start");
  }
  return deepFreeze({
    ...record,
    status: transition.toStatus,
    revision: record.revision + 1,
    scheduledStartAt: transition.scheduledStartAt,
    scheduledEndAt: transition.scheduledEndAt,
    meetingReference: transition.meetingReference,
  });
}

export function canTransitionDemo(from: DemoStatus, to: DemoStatus): boolean {
  return allowedTransitions[from]?.includes(to) ?? false;
}

export { demoRequestSchema, demoTransitionSchema };
