import { demoTimeZoneSchema } from "./demo-planning";

/** Reject ambiguous or missing local times instead of silently shifting a meeting. */
export function demoLocalTimeToIso(localTime: string, timeZone: string): string {
  demoTimeZoneSchema.parse(timeZone);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.0{1,3})?)?$/.exec(localTime);
  if (!match) throw new Error("Enter a complete date and time.");
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const second = Number(match[6] ?? 0);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  const normalized = match[6] === undefined ? `${localTime}:00` : localTime.replace(/\.0{1,3}$/, "");
  if (year < 2000 || new Date(wallClock).toISOString().slice(0, 19) !== normalized) throw new Error("Enter a valid date and time.");
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const localParts = (instant: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]));
    return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  };
  const candidates = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const probe = wallClock + delta;
    const offset = localParts(probe) - probe;
    const candidate = wallClock - offset;
    if (localParts(candidate) === wallClock) candidates.add(candidate);
  }
  if (candidates.size === 0) throw new Error("This time does not exist in that time zone. Choose another time.");
  if (candidates.size !== 1) throw new Error("This time occurs twice. Choose UTC and enter the corresponding UTC time.");
  return new Date([...candidates][0]!).toISOString();
}
