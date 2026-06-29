import type { Point2D } from './eyeBlink';

export interface MouthMorseConfig {
  openThreshold: number;
  closeThreshold: number;
  /** Ignore opens shorter than this (noise). */
  minOpenMs: number;
  /** Open duration at or below this → dot; longer → dash. */
  dotMaxMs: number;
  cooldownMs: number;
}

export const DEFAULT_MOUTH_MORSE_CONFIG: MouthMorseConfig = {
  openThreshold: 0.2,
  closeThreshold: 0.15,
  minOpenMs: 55,
  dotMaxMs: 220,
  cooldownMs: 100,
};

export interface MouthMorseEvent {
  symbol: 'dot' | 'dash';
  durationMs: number;
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Mouth open ratio from lip landmarks, normalized by mouth width. */
export function mouthOpenRatio(landmarks: Point2D[]): number {
  const vertical =
    dist(landmarks[13], landmarks[14]) +
    dist(landmarks[82], landmarks[87]) +
    dist(landmarks[312], landmarks[317]);
  const horizontal = dist(landmarks[61], landmarks[291]) || 1;
  return vertical / (3 * horizontal);
}

export class MouthMorseDetector {
  private mouthOpen = false;
  private openStartedAt = 0;
  private lastEventAt = 0;

  constructor(private config: MouthMorseConfig = DEFAULT_MOUTH_MORSE_CONFIG) {}

  /** Returns dot/dash when the mouth closes after an open gesture. */
  update(ratio: number, now = performance.now()): MouthMorseEvent | null {
    if (!this.mouthOpen && ratio >= this.config.openThreshold) {
      this.mouthOpen = true;
      this.openStartedAt = now;
      return null;
    }

    if (this.mouthOpen && ratio <= this.config.closeThreshold) {
      this.mouthOpen = false;
      const durationMs = now - this.openStartedAt;
      if (durationMs < this.config.minOpenMs) return null;
      if (now - this.lastEventAt < this.config.cooldownMs) return null;

      this.lastEventAt = now;
      return {
        symbol: durationMs <= this.config.dotMaxMs ? 'dot' : 'dash',
        durationMs,
      };
    }

    return null;
  }
}
