import { describe, expect, test } from "vitest";

import {
  canTransitionDeal,
  createDeal,
  dealInputSchema,
  transitionDeal,
} from "./deal-contract";

const ids = {
  deal: "11111111-1111-4111-8111-111111111111",
  customer: "22222222-2222-4222-8222-222222222222",
  vendor: "33333333-3333-4333-8333-333333333333",
  product: "44444444-4444-4444-8444-444444444444",
  owner: "55555555-5555-4555-8555-555555555555",
  actor: "66666666-6666-4666-8666-666666666666",
  correlation: "77777777-7777-4777-8777-777777777777",
};
const input = {
  dealId: ids.deal,
  customerOrganizationId: ids.customer,
  vendorOrganizationId: ids.vendor,
  productId: ids.product,
  ownerIdentityId: ids.owner,
  stage: "lead" as const,
  status: "open" as const,
  candidateId: null,
  contractId: null,
  expectedCloseAt: "2026-12-31T00:00:00.000Z",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  revision: 1,
  correlationId: ids.correlation,
};
const transition = (fromStage: "lead" | "discovery" | "evaluation" | "proposal" | "selection" | "contracting", toStage: "discovery" | "evaluation" | "proposal" | "selection" | "contracting" | "won" | "lost" | "archived", fromStatus: "open" | "won" | "lost" | "archived", toStatus: "open" | "won" | "lost" | "archived", expectedRevision: number) => ({
  dealId: ids.deal,
  fromStage,
  toStage,
  fromStatus,
  toStatus,
  expectedRevision,
  actorIdentityId: ids.actor,
  occurredAt: "2026-09-01T11:00:00.000Z",
  reason: "Advance the deal",
  correlationId: ids.correlation,
});

describe("R2B deal contract", () => {
  test("creates a normalized immutable lead deal", () => {
    const record = createDeal({ ...input, dealId: input.dealId.toUpperCase() });
    expect(record).toMatchObject({ dealId: ids.deal, stage: "lead", status: "open", revision: 1, history: [] });
    expect(Object.isFrozen(record)).toBe(true);
  });

  test("rejects unknown fields, same-party scope, and product without a vendor", () => {
    expect(dealInputSchema.safeParse({ ...input, unexpected: true }).success).toBe(false);
    expect(() => createDeal({ ...input, vendorOrganizationId: ids.customer })).toThrow("Invalid deal");
    expect(() => createDeal({ ...input, vendorOrganizationId: null, productId: ids.product })).toThrow("Invalid deal");
  });

  test("requires stage and status consistency", () => {
    expect(() => createDeal({ ...input, stage: "won", status: "open" })).toThrow("Invalid deal");
    expect(() => createDeal({ ...input, updatedAt: "2026-08-01T00:00:00.000Z" })).toThrow("Invalid deal");
  });

  test("appends a revision-checked transition and preserves history", () => {
    const initial = createDeal(input);
    const next = transitionDeal(initial, transition("lead", "discovery", "open", "open", 1));
    expect(next.stage).toBe("discovery");
    expect(next.revision).toBe(2);
    expect(next.history).toHaveLength(1);
    expect(initial.stage).toBe("lead");
    expect(Object.isFrozen(next.history)).toBe(true);
  });

  test("rejects stale, skipped, and inconsistent transitions", () => {
    const initial = createDeal(input);
    expect(() => transitionDeal(initial, transition("discovery", "evaluation", "open", "open", 1))).toThrow("stale");
    expect(() => transitionDeal(initial, transition("lead", "proposal", "open", "open", 1) as never)).toThrow("not allowed");
    expect(() => transitionDeal(initial, transition("lead", "discovery", "open", "won", 1))).toThrow("match");
  });

  test("maps terminal stages to terminal statuses", () => {
    const initial = createDeal(input);
    const contracting = transitionDeal(
      transitionDeal(
        transitionDeal(
          transitionDeal(
            transitionDeal(initial, transition("lead", "discovery", "open", "open", 1)),
            transition("discovery", "evaluation", "open", "open", 2),
          ),
          transition("evaluation", "proposal", "open", "open", 3),
        ),
        transition("proposal", "selection", "open", "open", 4),
      ),
      transition("selection", "contracting", "open", "open", 5),
    );
    const won = transitionDeal(contracting, transition("contracting", "won", "open", "won", 6));
    expect(won.status).toBe("won");
    expect(() => transitionDeal(won, transition("contracting", "lost", "open", "lost", 7))).toThrow("stale");
  });

  test("supports lost and archived terminal outcomes", () => {
    const initial = createDeal(input);
    const archived = transitionDeal(initial, transition("lead", "archived", "open", "archived", 1));
    expect(archived.status).toBe("archived");
    const lost = transitionDeal(
      transitionDeal(
        transitionDeal(
          transitionDeal(
            transitionDeal(initial, transition("lead", "discovery", "open", "open", 1)),
            transition("discovery", "evaluation", "open", "open", 2),
          ),
          transition("evaluation", "proposal", "open", "open", 3),
        ),
        transition("proposal", "selection", "open", "open", 4),
      ),
      transition("selection", "archived", "open", "archived", 5),
    );
    expect(lost.status).toBe("archived");
  });

  test("exposes only the forward stage graph", () => {
    expect(canTransitionDeal("lead", "discovery")).toBe(true);
    expect(canTransitionDeal("contracting", "won")).toBe(true);
    expect(canTransitionDeal("won", "lead")).toBe(false);
    expect(canTransitionDeal("lost", "contracting")).toBe(false);
  });
});
