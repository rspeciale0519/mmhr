/**
 * Cobalt color tokens. Button blues are darker than the mockup so white
 * label text meets WCAG AA 4.5:1. Everything else matches the source CSS.
 */
export const cobaltTokens = {
  sky: "#EDF2FF",
  sky2: "#DCE6FF",
  cobalt: "#2340E8",
  cob2: "#5B74FF",
  navy: "#0D1A4A",
  ink2: "#36416C",
  mute: "#56608A",
  mint: "#8EF0C9",
  canvasTop: "#F4F7FF",
  canvasMid: "#EAF0FF",
  canvasBottom: "#E4ECFF",
  /** Light stop of the primary button gradient (mockup used #3352FF). */
  buttonStart: "#1E3AD4",
  /** Dark stop of the primary button gradient (mockup used #1F38D6). */
  buttonEnd: "#1730C9",
  /** On-primary label. CSS: `--co-on-primary`. Stays white in `.dark`. */
  buttonText: "#FFFFFF",
  mockupButtonStart: "#3352FF",
} as const;

function channelToLinear(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return 0.2126 * channelToLinear(red) + 0.7152 * channelToLinear(green) + 0.0722 * channelToLinear(blue);
}

export function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}
