const LEFT_EYE = [33, 160, 158, 133, 153, 144] as const;
const RIGHT_EYE = [362, 385, 387, 263, 373, 380] as const;

export interface Point2D {
  x: number;
  y: number;
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function eyeAspectRatio(landmarks: Point2D[], indices: readonly number[]): number {
  const [p1, p2, p3, p4, p5, p6] = indices.map((i) => landmarks[i]);
  const vertical = dist(p2, p6) + dist(p3, p5);
  const horizontal = dist(p1, p4);
  if (horizontal === 0) return 1;
  return vertical / (2 * horizontal);
}

export function averageEar(landmarks: Point2D[]): number {
  return (eyeAspectRatio(landmarks, LEFT_EYE) + eyeAspectRatio(landmarks, RIGHT_EYE)) / 2;
}

/** Normalized anchor beside the face for HUD placement (mirrored display uses 1 - x). */
export function faceSideHudAnchor(landmarks: Point2D[]): Point2D {
  const nose = landmarks[1];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];
  const useLeft =
    Math.abs(leftCheek.x - nose.x) >= Math.abs(rightCheek.x - nose.x);
  const cheek = useLeft ? leftCheek : rightCheek;
  const outward = cheek.x < nose.x ? -0.06 : 0.06;
  return {
    x: cheek.x + outward,
    y: cheek.y,
  };
}

export interface BlinkDetectorConfig {
  closedThreshold: number;
  openThreshold: number;
  dotMaxMs: number;
  minBlinkMs: number;
}

export const DEFAULT_BLINK_CONFIG: BlinkDetectorConfig = {
  closedThreshold: 0.21,
  openThreshold: 0.24,
  dotMaxMs: 280,
  minBlinkMs: 80,
};

export type BlinkSymbol = 'dot' | 'dash';

export interface BlinkEvent {
  symbol: BlinkSymbol;
  durationMs: number;
}

export class BlinkDetector {
  private eyesClosed = false;
  private closeStartedAt = 0;

  constructor(private config: BlinkDetectorConfig = DEFAULT_BLINK_CONFIG) {}

  update(ear: number, now = performance.now()): BlinkEvent | null {
    if (!this.eyesClosed && ear < this.config.closedThreshold) {
      this.eyesClosed = true;
      this.closeStartedAt = now;
      return null;
    }

    if (this.eyesClosed && ear > this.config.openThreshold) {
      this.eyesClosed = false;
      const durationMs = now - this.closeStartedAt;
      if (durationMs < this.config.minBlinkMs) return null;
      return {
        symbol: durationMs <= this.config.dotMaxMs ? 'dot' : 'dash',
        durationMs,
      };
    }

    return null;
  }

  setConfig(config: Partial<BlinkDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): BlinkDetectorConfig {
    return { ...this.config };
  }
}
