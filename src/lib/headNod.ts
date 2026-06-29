import type { Point2D } from './eyeBlink';

export interface HeadNodSample {
  y: number;
  t: number;
}

export interface HeadNodConfig {
  windowMs: number;
  minAmplitude: number;
  minReversals: number;
  minDelta: number;
  cooldownMs: number;
}

export const DEFAULT_HEAD_NOD_CONFIG: HeadNodConfig = {
  windowMs: 600,
  minAmplitude: 0.1,
  minReversals: 2,
  minDelta: 0.007,
  cooldownMs: 700,
};

/** Nose offset from face vertical center, normalized by face height. */
export function noseOffsetY(landmarks: Point2D[]): number {
  const nose = landmarks[1];
  const forehead = landmarks[10];
  const chin = landmarks[152];
  const center = (forehead.y + chin.y) / 2;
  const height = Math.abs(chin.y - forehead.y) || 1;
  return (nose.y - center) / height;
}

export class HeadNodDetector {
  private samples: HeadNodSample[] = [];
  private lastNodAt = 0;

  constructor(private config: HeadNodConfig = DEFAULT_HEAD_NOD_CONFIG) {}

  update(offsetY: number, now = performance.now()): boolean {
    this.samples.push({ y: offsetY, t: now });
    this.samples = this.samples.filter((s) => now - s.t <= this.config.windowMs);

    if (now - this.lastNodAt < this.config.cooldownMs) return false;
    if (!this.isNod(this.samples)) return false;

    this.lastNodAt = now;
    this.samples = [];
    return true;
  }

  private isNod(samples: HeadNodSample[]): boolean {
    if (samples.length < 6) return false;

    const ys = samples.map((s) => s.y);
    const amplitude = Math.max(...ys) - Math.min(...ys);
    if (amplitude < this.config.minAmplitude) return false;

    let reversals = 0;
    let dir = 0;
    for (let i = 1; i < ys.length; i++) {
      const dy = ys[i] - ys[i - 1];
      if (Math.abs(dy) < this.config.minDelta) continue;
      const nextDir = dy > 0 ? 1 : -1;
      if (dir !== 0 && nextDir !== dir) reversals++;
      dir = nextDir;
    }

    return reversals >= this.config.minReversals;
  }
}
