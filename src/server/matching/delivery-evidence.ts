import { z } from "zod";
import { featureCoverageSchema } from "./masked-publication-details";

const deliveryEvidenceKey = z.string().regex(/^[a-z][a-z0-9_]{0,99}$/).refine((key) =>
  !/^(commission|payout|referral|payment_status|commercial|sponsorship|advertising|paid_placement|partner_status)/.test(key));

export const deliveryCoverageMapSchema = z.record(deliveryEvidenceKey, featureCoverageSchema);
export const deliveryBooleanMapSchema = z.record(deliveryEvidenceKey, z.boolean());
