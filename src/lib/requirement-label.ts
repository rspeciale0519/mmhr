export function requirementLabel(key: string, labels: Record<string, string>) {
  if (Object.hasOwn(labels, key)) return labels[key];
  return /^need_[0-9a-f]{32}$/.test(key) ? "Saved requirement details are unavailable" : key.replaceAll("_", " ");
}
