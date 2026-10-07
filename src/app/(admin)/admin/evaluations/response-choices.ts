export type ResponseChoice = { path: string[]; label: string };

/** Enumerate only object paths supported by the publication comparator. */
export function responseChoices(value: unknown, path: string[] = []): ResponseChoice[] {
  if (path.length > 5) return [];
  if (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
    const answer = String(value);
    return [{ path, label: `${path.length ? path.join(" / ") : "Answer"}: ${answer.length > 100 ? `${answer.slice(0, 100)}…` : answer}` }];
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => responseChoices(child, [...path, key]));
}
