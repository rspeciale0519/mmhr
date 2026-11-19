import "server-only";

/**
 * Builds the RFP emails sent to a vendor contact.
 *
 * Each function returns a subject, an HTML body, and a plain-text body.
 * The email holds no customer data beyond the customer's name: the details
 * live on the form behind the private link.
 */

export type RfpEmailInput = {
  /** "invitation" is the first email. "follow_up" is a reminder. */
  kind: "invitation" | "follow_up";
  contactName: string;
  vendorName: string;
  customerName: string;
  rfpTitle: string;
  /** The private link to the form. */
  formUrl: string;
  /** When answers are due. */
  dueAt: Date;
  /** Optional extra message from staff, used on follow-ups. */
  note?: string;
  brandName?: string;
};

/**
 * Makes text safe to place inside HTML. Without this, a name containing
 * "<" could break the email or inject markup.
 */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Writes the due date in plain words, e.g. "Wednesday, December 2, 2026". */
function formatDue(dueAt: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: "America/New_York" }).format(dueAt);
}

export function buildRfpEmail(input: RfpEmailInput): { subject: string; html: string; text: string } {
  const brand = input.brandName ?? process.env.NEXT_PUBLIC_BRAND_NAME ?? "MatchMaker HR";
  const due = formatDue(input.dueAt);
  const followUp = input.kind === "follow_up";
  const subject = followUp
    ? `Reminder: request for proposal from ${input.customerName}, due ${due}`
    : `Request for proposal from ${input.customerName}, due ${due}`;

  // The same sentences are used for the text and HTML versions.
  const opening = followUp
    ? `This is a reminder about the request for proposal that ${brand} sent to ${input.vendorName} on behalf of ${input.customerName}.`
    : `${brand} is helping ${input.customerName} choose an HR and payroll provider, and ${input.vendorName} has been selected to receive their request for proposal.`;
  const how = "Use your private link to open the request. No account or password is needed. Your answers save as you go, so you can return to the same link at any time before the due date.";
  const dueLine = `Responses are due by ${due}.`;
  const care = "This link is private to your company. Please share it only with colleagues who are helping you respond.";
  const help = `Questions? Reply to this email and the ${brand} team will help.`;

  const text = [
    `Hello ${input.contactName},`, "", opening, "",
    ...(input.note ? [input.note, ""] : []),
    `${input.rfpTitle}`, dueLine, "", how, "", `Open the request: ${input.formUrl}`, "", care, "", help, "", `${brand}`,
  ].join("\n");

  // Simple, table-free HTML with inline styles, which every mail app shows.
  const paragraph = (content: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937;">${content}</p>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:32px;">
<p style="margin:0 0 24px;font-size:14px;font-weight:bold;letter-spacing:0.04em;text-transform:uppercase;color:#4b5563;">${escapeHtml(brand)}</p>
<h1 style="margin:0 0 8px;font-size:22px;line-height:28px;color:#111827;">${escapeHtml(input.rfpTitle)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#111827;"><strong>${escapeHtml(dueLine)}</strong></p>
${paragraph(`Hello ${escapeHtml(input.contactName)},`)}
${paragraph(escapeHtml(opening))}
${input.note ? paragraph(escapeHtml(input.note)) : ""}
${paragraph(escapeHtml(how))}
<p style="margin:24px 0;"><a href="${escapeHtml(input.formUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 24px;border-radius:6px;">Open the request for proposal</a></p>
${paragraph(`If the button does not work, copy this link into your browser:<br><span style="word-break:break-all;color:#4b5563;">${escapeHtml(input.formUrl)}</span>`)}
${paragraph(escapeHtml(care))}
${paragraph(escapeHtml(help))}
</div></body></html>`;

  return { subject, html, text };
}
