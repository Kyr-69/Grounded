/**
 * Vivid accent palette for per-task colors (shadcn OKLCH family).
 * Colors are plain hex so they work in inline styles, box-shadows,
 * and the Rust-side validation (7-char `#rrggbb`).
 */

export const TASK_COLORS = [
  "#34d399", // emerald — default
  "#22d3ee", // cyan
  "#38bdf8", // sky
  "#818cf8", // indigo
  "#c084fc", // purple
  "#f472b6", // pink
  "#fb7185", // rose
  "#fb923c", // orange
  "#fbbf24", // amber
  "#a3e635", // lime
];

export const DEFAULT_TASK_COLOR = TASK_COLORS[0];

/** Guards against malformed colors stored by older builds. */
export function safeColor(c: string | undefined | null): string {
  if (c && /^#[0-9a-fA-F]{6}$/.test(c)) return c;
  return DEFAULT_TASK_COLOR;
}

/** Color with an alpha channel, e.g. withAlpha("#34d399", 0.12). */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
