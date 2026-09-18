import type { Stats } from "../types";

export interface DifficultySegment {
  label: string;
  count: number;
  cssVar: string;
}

/**
 * Easy → Hard is an ordered scale, so the three steps are one blue ramp
 * (light → dark) rather than three unrelated hues: the reader sees the
 * ordering in the color itself. The exact steps are validated per mode
 * against the popup's own surfaces — see the ramp tokens in popup.html.
 */
export function difficultySegments(stats: Stats): DifficultySegment[] {
  return [
    { label: "Easy", count: stats.easy, cssVar: "--diff-easy" },
    { label: "Medium", count: stats.medium, cssVar: "--diff-medium" },
    { label: "Hard", count: stats.hard, cssVar: "--diff-hard" },
  ];
}

const SIZE = 160;
const CENTER = SIZE / 2;
const RADIUS = 64;
const THICKNESS = 20;
/** Surface showing through between arcs — negative space, never a stroke. */
const GAP_PX = 2;

export function renderDonut(stats: Stats): string {
  const total = stats.solved;
  if (total <= 0) return "";

  const segments = difficultySegments(stats).filter((s) => s.count > 0);
  const circumference = 2 * Math.PI * RADIUS;

  // A lone full-circle segment gets no gap: there's no neighbour to separate
  // it from, and a notch cut into a complete ring reads as missing data.
  const gap = segments.length > 1 ? GAP_PX : 0;

  let offset = 0;
  const arcs = segments.map((segment) => {
    const rawLength = (segment.count / total) * circumference;
    const drawn = Math.max(rawLength - gap, 0.5);
    const arc = `<circle cx="${CENTER}" cy="${CENTER}" r="${RADIUS}" fill="none"
        stroke="var(${segment.cssVar})" stroke-width="${THICKNESS}"
        stroke-dasharray="${drawn.toFixed(2)} ${(circumference - drawn).toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}"
      ><title>${segment.label}: ${segment.count} of ${total}</title></circle>`;
    offset += rawLength;
    return arc;
  });

  const description = segments
    .map((s) => `${s.label} ${s.count}`)
    .join(", ");

  return `<svg viewBox="0 0 ${SIZE} ${SIZE}" role="img"
      aria-label="Solved by difficulty: ${description}">
      <g transform="rotate(-90 ${CENTER} ${CENTER})">${arcs.join("")}</g>
    </svg>`;
}
