export function displayDemoTime(value: string, zone: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(new Date(value));
}
