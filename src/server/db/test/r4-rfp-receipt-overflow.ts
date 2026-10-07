import { expect, test } from "vitest";
import type { RfpReceiptPage } from "@/lib/rfp-receipt";
import type { SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";

type Context = { fixture: SecurityCommandApiFixtures; vendorOrganizationId: string; intakeId: string;
  freshRequest(): Promise<unknown>; status(view: "vendor" | "staff" | "customer", client?: undefined, afterId?: string): Promise<RfpReceiptPage> };
export function registerRfpReceiptOverflow(context: () => Context) {
  test("traverses genuine 26-row vendor, staff and customer overflow without duplicates or crossed deliveries", async () => {
    const current = context();
    const [count] = await current.fixture.owner<{ count: number }[]>`SELECT count(*)::integer count FROM public.rfp_recipients rr
      JOIN public.rfp_versions r ON r.id=rr.rfp_version_id AND r.organization_id=rr.organization_id
      WHERE rr.vendor_organization_id=${current.vendorOrganizationId}::uuid AND r.source_intake_id=${current.intakeId}::uuid
        AND r.status IN ('distributed','closed') AND rr.state IN ('distributed','acknowledged','responded')`;
    // At most 26 deliveries use four unchanged RPCs each. Their request deadlines remain eight seconds.
    for (let index = count!.count; index < 26; index++) await current.freshRequest();
    for (const view of ["vendor", "staff", "customer"] as const) {
      const [stored] = await current.fixture.owner<{ ids: string[] }[]>`SELECT array_agg(rr.id::text ORDER BY rr.id) ids
        FROM public.rfp_recipients rr JOIN public.rfp_versions r ON r.id=rr.rfp_version_id AND r.organization_id=rr.organization_id
        JOIN public.vendor_profiles vp ON vp.id=rr.vendor_profile_id AND vp.organization_id=rr.vendor_organization_id
        WHERE r.source_intake_id=${current.intakeId}::uuid AND r.status IN ('distributed','closed')
          AND rr.sent_at IS NOT NULL AND rr.deadline_at IS NOT NULL AND r.sections->0->>'sectionKey'='questionnaire'
          AND (( ${view}='vendor' AND rr.vendor_organization_id=${current.vendorOrganizationId}::uuid AND vp.status='active'
            AND rr.state IN ('distributed','acknowledged','responded')) OR (${view}<>'vendor'
            AND rr.organization_id=${current.fixture.organizationId}::uuid AND rr.state IN ('distributed','acknowledged','responded','withdrawn')))`;
      expect(stored!.ids.length).toBeGreaterThanOrEqual(26);
      const first = await current.status(view);
      expect(first.items).toHaveLength(25); expect(first.nextCursor).toBe(first.items[24]!.recipientId);
      const observed = first.items.map(row => row.recipientId); let cursor = first.nextCursor;
      for (let page = 0; cursor && page < 100; page++) {
        const next = await current.status(view, undefined, cursor);
        expect(next.items.length).toBeGreaterThan(0);
        expect(next.items.every(row => row.recipientId > cursor!)).toBe(true);
        expect(next.items.every(row => view === "vendor" || !row.canConfirm)).toBe(true);
        observed.push(...next.items.map(row => row.recipientId)); cursor = next.nextCursor;
      }
      expect(cursor).toBeNull(); expect(new Set(observed).size).toBe(observed.length); expect(observed).toEqual(stored!.ids);
      const last = await current.status(view, undefined, observed.at(-1)!);
      expect(last.items).toEqual([]); expect(last.nextCursor).toBeNull();
    }
  }, 900000);
}
