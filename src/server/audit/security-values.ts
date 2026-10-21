import "server-only";
import { z } from "zod";

export const securityUuidSchema = z.uuid().transform((value) => value.toLowerCase());

export const securityTimestampSchema = z.iso.datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

export { securityReasonSchema } from "@/lib/security-reason";
