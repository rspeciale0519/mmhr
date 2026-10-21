import { z } from "zod";

const adapterId = z.string().trim().regex(/^[a-z][a-z0-9._-]{0,127}$/);
export const vendorAcquisitionRequestSchema = z.strictObject({ sourceId: z.uuid(), mode: z.enum(["manual", "automated"]), adapterId: adapterId.nullable() }).superRefine((value, context) => {
  if (value.mode === "manual" && value.adapterId !== null) context.addIssue({ code: "custom", path: ["adapterId"], message: "Manual acquisition cannot select an adapter" });
  if (value.mode === "automated" && value.adapterId === null) context.addIssue({ code: "custom", path: ["adapterId"], message: "Automated acquisition requires an adapter" });
});
export type VendorAcquisitionRequest = z.infer<typeof vendorAcquisitionRequestSchema>;
export type VendorAcquisitionAdapter = Readonly<{ adapterId: string; acquire: (request: Readonly<{ sourceId: string }>) => Promise<Readonly<{ artifactReferences: readonly string[] }>> }>;

export function selectVendorAcquisitionAdapter(adapters: readonly VendorAcquisitionAdapter[], request: VendorAcquisitionRequest): VendorAcquisitionAdapter | null {
  if (request.mode === "manual" || request.adapterId === null) return null;
  const matches = adapters.filter((adapter) => adapter.adapterId === request.adapterId);
  if (matches.length !== 1) throw new Error("Vendor acquisition adapter unavailable");
  return matches[0]!;
}
