export type TaskRequestMigrationEntry = {
  idx: number; version: string; when: number; tag: string; breakpoints: boolean;
};
export type TaskRequestMigrationJournal = {
  version: string; dialect: "postgresql"; entries: TaskRequestMigrationEntry[];
};

/** Finds reviewed semantics rather than assuming the next generated index. */
export function selectTaskRequestMigration(journalText: string, sqlByTag: ReadonlyMap<string, string>) {
  const unknown: unknown = JSON.parse(journalText);
  if (!unknown || typeof unknown !== "object" || !("entries" in unknown) || !Array.isArray(unknown.entries)
    || !("version" in unknown) || unknown.version !== "7" || !("dialect" in unknown) || unknown.dialect !== "postgresql") {
    throw new Error("Invalid task request migration journal");
  }
  const entries: TaskRequestMigrationEntry[] = [], tags = new Set<string>(); let previousTime = 0;
  for (const [index, entry] of unknown.entries.entries()) {
    if (!entry || typeof entry !== "object" || entry.idx !== index || entry.version !== "7"
      || !Number.isSafeInteger(entry.when) || entry.when <= previousTime || entry.breakpoints !== true
      || typeof entry.tag !== "string" || !/^\d{4}_[a-z0-9_-]+$/.test(entry.tag) || tags.has(entry.tag)
      || !sqlByTag.has(entry.tag)) throw new Error("Invalid reviewed task request migration sequence");
    previousTime = entry.when; tags.add(entry.tag); entries.push(entry as TaskRequestMigrationEntry);
  }
  const declaration = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+mmhr_private\.r8_task_assert_request_evidence\s*\(/g;
  const candidates = entries.flatMap((entry, index) => {
    const count = (sqlByTag.get(entry.tag)!.match(declaration) ?? []).length;
    if (count > 1) throw new Error("Ambiguous task request evidence migration");
    return count === 1 ? [index] : [];
  });
  const baseline = entries.findIndex(entry => entry.tag === "0159_r8_deal_follow_ups");
  if (candidates.length !== 1 || baseline < 0 || candidates[0]! <= baseline) {
    throw new Error("One additive task request evidence migration is required");
  }
  const boundary = candidates[0]!, additive = sqlByTag.get(entries[boundary]!.tag)!;
  if (!/ALTER\s+TABLE\s+(?:public\.)?(?:"deal_follow_up_events"|deal_follow_up_events)\s+ADD\s+COLUMN\s+"?original_request"?\s+jsonb\s*;/i.test(additive)
    || !additive.includes("PERFORM mmhr_private.r8_task_assert_request_evidence(NEW)")
    || !additive.includes("correlation_id,payload);")) {
    throw new Error("Task request evidence expansion requires review");
  }
  const journal: TaskRequestMigrationJournal = { version: "7", dialect: "postgresql", entries };
  return { journal, boundary, boundaryTag: entries[boundary]!.tag };
}
