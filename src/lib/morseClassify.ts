/** Classify blink durations into morse within one letter (relative lengths). */

function dotBaseline(durations: number[]): number {
  const sorted = [...durations].sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor(sorted.length * 0.3));
  return sorted[idx] ?? sorted[0] ?? 0;
}

function isDot(durationMs: number, baseline: number, dashRatio: number): boolean {
  return durationMs < baseline * dashRatio;
}

/**
 * Map blink durations to a morse string.
 * 2+ blinks: compare each duration to this letter's relative baseline.
 * 1 blink: compare to priorDotBaseline from earlier letters (default dot if unknown).
 */
export function durationsToMorse(
  durations: number[],
  dashRatio: number,
  priorDotBaseline?: number,
): string {
  if (durations.length === 0) return '';

  if (durations.length === 1) {
    const d = durations[0];
    if (priorDotBaseline === undefined) return '.';
    return isDot(d, priorDotBaseline, dashRatio) ? '.' : '-';
  }

  const baseline = dotBaseline(durations);
  return durations
    .map((d) => (isDot(d, baseline, dashRatio) ? '.' : '-'))
    .join('');
}

/** Update dot baseline from classified morse + raw durations. */
export function nextDotBaseline(
  durations: number[],
  morse: string,
  dashRatio: number,
  priorDotBaseline?: number,
): number | undefined {
  const dotDurations = durations.filter((_, i) => morse[i] === '.');
  if (dotDurations.length > 0) {
    return Math.min(...dotDurations);
  }

  if (durations.length === 1 && morse === '-') {
    return durations[0] / dashRatio;
  }

  return priorDotBaseline;
}
