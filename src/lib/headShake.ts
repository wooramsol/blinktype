import type { Point2D } from './eyeBlink';

export interface HeadShakeSample {
  x: number;
  t: number;
}

export interface HeadShakeConfig {
  windowMs: number;
  minAmplitude: number;
  minReversals: number;
  minDelta: number;
  cooldownMs: number;
}

export const DEFAULT_HEAD_SHAKE_CONFIG: HeadShakeConfig = {
  windowMs: 600,
  minAmplitude: 0.12,
  minReversals: 2,
  minDelta: 0.008,
  cooldownMs: 800,
};

/** Nose offset from face center, normalized by face width. */
export function noseOffsetX(landmarks: Point2D[]): number {
  const nose = landmarks[1];
  const left = landmarks[234];
  const right = landmarks[454];
  const center = (left.x + right.x) / 2;
  const width = Math.abs(right.x - left.x) || 1;
  return (nose.x - center) / width;
}

export class HeadShakeDetector {
  private samples: HeadShakeSample[] = [];
  private lastShakeAt = 0;

  constructor(private config: HeadShakeConfig = DEFAULT_HEAD_SHAKE_CONFIG) {}

  update(offsetX: number, now = performance.now()): boolean {
    this.samples.push({ x: offsetX, t: now });
    this.samples = this.samples.filter((s) => now - s.t <= this.config.windowMs);

    if (now - this.lastShakeAt < this.config.cooldownMs) return false;
    if (!this.isShake(this.samples)) return false;

    this.lastShakeAt = now;
    this.samples = [];
    return true;
  }

  private isShake(samples: HeadShakeSample[]): boolean {
    if (samples.length < 6) return false;

    const xs = samples.map((s) => s.x);
    const amplitude = Math.max(...xs) - Math.min(...xs);
    if (amplitude < this.config.minAmplitude) return false;

    let reversals = 0;
    let dir = 0;
    for (let i = 1; i < xs.length; i++) {
      const dx = xs[i] - xs[i - 1];
      if (Math.abs(dx) < this.config.minDelta) continue;
      const nextDir = dx > 0 ? 1 : -1;
      if (dir !== 0 && nextDir !== dir) reversals++;
      dir = nextDir;
    }

    return reversals >= this.config.minReversals;
  }
}
