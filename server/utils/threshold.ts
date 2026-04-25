// server/utils/threshold.ts

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * We want: threshold only affects "passesThreshold", not whether we return results.
 * Always return top results, then UI can hide those below threshold if desired.
 */
export function annotateThreshold<T extends { match?: number | null }>(
  items: T[],
  threshold: number
) {
  const t = clamp(Number(threshold || 0), 0, 100);
  return items.map((it) => ({
    ...it,
    passesThreshold: typeof it.match === "number" ? it.match >= t : false,
  }));
}