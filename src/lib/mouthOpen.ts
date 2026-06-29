import type { Point2D } from './eyeBlink';

export interface MouthOpenConfig {
  openThreshold: number;
  closeThreshold: number;
  minOpenMs: number;
  cooldownMs: number;
}

export const DEFAULT_MOUTH_OPEN_CONFIG: MouthOpenConfig = {
  openThreshold: 0.22,
  closeThreshold: 0.16,
  minOpenMs: 80,
  cooldownMs: 450,
};

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

export class MouthOpenDetector {
  private mouthOpen = false;
  private openStartedAt = 0;
  private lastSpaceAt = 0;

  constructor(private config: MouthOpenConfig = DEFAULT_MOUTH_OPEN_CONFIG) {}

  /** Returns true after a full open-then-close mouth gesture. */
  update(ratio: number, now = performance.now()): boolean {
    if (now - this.lastSpaceAt < this.config.cooldownMs) return false;

    if (!this.mouthOpen && ratio >= this.config.openThreshold) {
      this.mouthOpen = true;
      this.openStartedAt = now;
      return false;
    }

    if (this.mouthOpen && ratio <= this.config.closeThreshold) {
      this.mouthOpen = false;
      if (now - this.openStartedAt < this.config.minOpenMs) return false;
      this.lastSpaceAt = now;
      return true;
    }

    return false;
  }
}
