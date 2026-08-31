export type RequirementImportance = "must" | "nice" | "not_applicable";

export type MatchingRequirement = Readonly<{
  key: string;
  importance: RequirementImportance;
  weight: number;
}>;

export type MatchingCandidate = Readonly<{
  id: string;
  capabilities: Readonly<Record<string, boolean>>;
}>;

export type MatchingResult = Readonly<{
  candidateId: string;
  eligible: boolean;
  score: number;
  fitReasons: readonly string[];
  limitations: readonly string[];
}>;

const MAX_INITIAL_CANDIDATES = 5;

function fail(message: string): never {
  throw new Error(`Invalid matching input: ${message}`);
}

function normalizeKey(value: string, field: string) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,99}$/.test(value)) {
    fail(`${field} must be a stable lowercase key`);
  }
  return value;
}

function normalizeRequirements(requirements: readonly MatchingRequirement[]) {
  if (requirements.length === 0) fail("at least one requirement is required");
  const seen = new Set<string>();
  return requirements.map((requirement) => {
    const key = normalizeKey(requirement.key, "requirement key");
    if (seen.has(key)) fail(`duplicate requirement: ${key}`);
    seen.add(key);
    if (!Number.isInteger(requirement.weight) || requirement.weight < 1 || requirement.weight > 100) {
      fail(`weight for ${key} must be an integer from 1 to 100`);
    }
    if (!["must", "nice", "not_applicable"].includes(requirement.importance)) {
      fail(`importance for ${key} is not supported`);
    }
    return { ...requirement, key };
  });
}

/**
 * Calculates a reproducible fit score from approved requirements and vendor capabilities.
 * Commercial fields are intentionally absent from the input contract.
 */
export function rankCandidates(
  requirements: readonly MatchingRequirement[],
  candidates: readonly MatchingCandidate[],
): readonly MatchingResult[] {
  const normalized = normalizeRequirements(requirements).filter(
    (requirement) => requirement.importance !== "not_applicable",
  );
  if (normalized.length === 0) fail("at least one applicable requirement is required");
  const seenCandidates = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate.id !== "string" || candidate.id.trim() === "") {
      fail("candidate id is required");
    }
    if (seenCandidates.has(candidate.id)) fail(`duplicate candidate: ${candidate.id}`);
    seenCandidates.add(candidate.id);
  }
  const totalWeight = normalized.reduce((sum, requirement) => sum + requirement.weight, 0);
  return candidates
    .map((candidate) => {
      const missingMust = normalized.filter(
        (requirement) => requirement.importance === "must" && candidate.capabilities[requirement.key] !== true,
      );
      const satisfied = normalized.filter(
        (requirement) => candidate.capabilities[requirement.key] === true,
      );
      const score = Math.round(
        (satisfied.reduce((sum, requirement) => sum + requirement.weight, 0) / totalWeight) * 10000,
      );
      return {
        candidateId: candidate.id,
        eligible: missingMust.length === 0,
        score,
        fitReasons: satisfied.map((requirement) => requirement.key),
        limitations: missingMust.map((requirement) => requirement.key),
      } satisfies MatchingResult;
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0;
    });
}

/** Selects the bounded initial set. Later review additions use source `review_addition`. */
export function selectInitialCandidates(
  candidates: readonly MatchingCandidate[],
): readonly MatchingCandidate[] {
  if (candidates.length > MAX_INITIAL_CANDIDATES) {
    fail(`initial evaluation supports at most ${MAX_INITIAL_CANDIDATES} candidates`);
  }
  return candidates.slice();
}

export { MAX_INITIAL_CANDIDATES };
