import type { Point2D } from './eyeBlink';

export interface MouthMorseConfig {
  /** Below this open ratio = neutral / closed. */
  neutralMax: number;
  /** Open ratio band for rounded O shape (dot). */
  oMin: number;
  oMax: number;
  /** Open ratio at or above this = wide A shape (dash). */
  aMin: number;
  minHoldMs: number;
  cooldownMs: number;
}

export const DEFAULT_MOUTH_MORSE_CONFIG: MouthMorseConfig = {
  neutralMax: 0.1,
  oMin: 0.11,
  oMax: 0.21,
  aMin: 0.22,
  minHoldMs: 80,
  cooldownMs: 120,
};

export type MouthShape = 'neutral' | 'o' | 'a';

export interface MouthMorseEvent {
  symbol: 'dot' | 'dash';
  shape: 'o' | 'a';
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

/** Classify mouth as neutral, O (rounded), or A (wide open). */
export function classifyMouthShape(
  landmarks: Point2D[],
  config: MouthMorseConfig = DEFAULT_MOUTH_MORSE_CONFIG,
): MouthShape {
  const ratio = mouthOpenRatio(landmarks);
  if (ratio < config.neutralMax) return 'neutral';
  if (ratio >= config.aMin) return 'a';
  if (ratio >= config.oMin && ratio < config.oMax) return 'o';
  return 'neutral';
}

export function mouthShapeLabel(shape: MouthShape): string {
  if (shape === 'o') return 'O';
  if (shape === 'a') return 'A';
  return '—';
}

export class MouthMorseDetector {
  private activeShape: 'o' | 'a' | null = null;
  private shapeStartedAt = 0;
  private lastEventAt = 0;

  constructor(private config: MouthMorseConfig = DEFAULT_MOUTH_MORSE_CONFIG) {}

  /** Emit dot/dash when an O or A shape is held, then released. */
  update(landmarks: Point2D[], now = performance.now()): MouthMorseEvent | null {
    const shape = classifyMouthShape(landmarks, this.config);

    if (shape === 'neutral') {
      if (this.activeShape && now - this.shapeStartedAt >= this.config.minHoldMs) {
        if (now - this.lastEventAt >= this.config.cooldownMs) {
          const held = this.activeShape;
          this.activeShape = null;
          this.lastEventAt = now;
          return {
            symbol: held === 'o' ? 'dot' : 'dash',
            shape: held,
          };
        }
      }
      this.activeShape = null;
      return null;
    }

    if (this.activeShape !== shape) {
      this.activeShape = shape;
      this.shapeStartedAt = now;
    }

    return null;
  }
}
