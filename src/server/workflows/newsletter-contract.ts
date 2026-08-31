import "server-only";

import { z } from "zod";

const normalizedEmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const consentTimestampSchema = z.iso.datetime({ offset: true })
  .transform((value) => new Date(value).toISOString())
  .refine((value) => new Date(value).getTime() <= Date.now(), {
    message: "Consent cannot be in the future",
  });

/** The only data accepted by the public newsletter registration boundary. */
export const newsletterRegistrationInputSchema = z.strictObject({
  email: normalizedEmailSchema,
  consentAt: consentTimestampSchema,
  idempotencyKey: z.uuid().transform((value) => value.toLowerCase()),
});

export const newsletterRegistrationSchema = newsletterRegistrationInputSchema;

export type NewsletterRegistrationInput = z.input<typeof newsletterRegistrationInputSchema>;
export type NewsletterRegistrationRequest = z.output<typeof newsletterRegistrationInputSchema>;

export const newsletterRegistrationResultSchema = z.strictObject({
  outcome: z.enum(["created", "replayed", "idempotency_conflict"]),
  correlationId: z.uuid(),
});

export type NewsletterRegistrationResult = z.output<typeof newsletterRegistrationResultSchema>;

export class NewsletterServiceError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super(code === "INVALID_INPUT" ? "Newsletter input is invalid" : "Newsletter service is unavailable");
    this.name = "NewsletterServiceError";
  }
}

/** Provider-neutral newsletter boundary. Implementations must upsert idempotently. */
export interface NewsletterService {
  addOrUpdateSubscriber(
    request: NewsletterRegistrationRequest,
  ): Promise<NewsletterRegistrationResult>;
}

/** No provider is configured yet, so public writes fail closed without a network call. */
export const unavailableNewsletterService: NewsletterService = {
  async addOrUpdateSubscriber(): Promise<NewsletterRegistrationResult> {
    throw new NewsletterServiceError("UNAVAILABLE");
  },
};

export type NewsletterRegistrationOptions = Readonly<{
  service?: NewsletterService;
}>;

/** Validates the fixed DTO before handing it to a provider-neutral service. */
export async function registerNewsletterSubscriber(
  input: unknown,
  options: NewsletterRegistrationOptions = {},
): Promise<NewsletterRegistrationResult> {
  const parsed = newsletterRegistrationInputSchema.safeParse(input);
  if (!parsed.success) throw new NewsletterServiceError("INVALID_INPUT");

  const result = await (options.service ?? unavailableNewsletterService).addOrUpdateSubscriber(parsed.data);
  const validated = newsletterRegistrationResultSchema.safeParse(result);
  if (!validated.success) throw new NewsletterServiceError("INVALID_RESPONSE");
  return validated.data;
}
