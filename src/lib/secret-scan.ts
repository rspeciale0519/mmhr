export type SecretMatch = Readonly<{
  line: number;
  kind: "private-key" | "aws-access-key" | "github-token" | "slack-token" | "stripe-key" | "credential-url";
}>;

const secretPatterns: readonly [SecretMatch["kind"], RegExp][] = [
  ["private-key", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/],
  ["slack-token", /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/],
  ["stripe-key", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/],
  ["credential-url", /\b(?:postgres(?:ql)?|mysql|redis):\/\/[^/\s:@]+:[^@\s]+@/],
];

/** Finds high-confidence credential formats in one text file. */
export function findSecretMatches(text: string): SecretMatch[] {
  const matches: SecretMatch[] = [];

  for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
    for (const [kind, pattern] of secretPatterns) {
      if (pattern.test(line)) matches.push({ line: lineIndex + 1, kind });
    }
  }

  return matches;
}
