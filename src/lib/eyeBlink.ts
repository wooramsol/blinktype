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

export function minEar(landmarks: Point2D[]): number {
  return Math.min(eyeAspectRatio(landmarks, LEFT_EYE), eyeAspectRatio(landmarks, RIGHT_EYE));
}

/** Normalized anchor above the eyes for HUD placement (mirrored display uses 1 - x). */
export function eyeHudAnchor(landmarks: Point2D[]): Point2D {
  const left = landmarks[33];
  const right = landmarks[263];
  return {
    x: (left.x + right.x) / 2,
    y: Math.min(left.y, right.y) - 0.04,
  };
}

export interface BlinkDetectorConfig {
  closedThreshold: number;
  openThreshold: number;
  dotMaxMs: number;
  minBlinkMs: number;
  closeRatio: number;
  openRatio: number;
  baselineAlpha: number;
}

export const DEFAULT_BLINK_CONFIG: BlinkDetectorConfig = {
  closedThreshold: 0.19,
  openThreshold: 0.21,
  dotMaxMs: 420,
  minBlinkMs: 50,
  closeRatio: 0.72,
  openRatio: 0.88,
  baselineAlpha: 0.08,
};

export type BlinkSymbol = 'dot' | 'dash';

export interface BlinkEvent {
  symbol: BlinkSymbol;
  durationMs: number;
}

export class BlinkDetector {
  private eyesClosed = false;
  private closeStartedAt = 0;
  private baselineEar = 0.28;

  constructor(private config: BlinkDetectorConfig = DEFAULT_BLINK_CONFIG) {}

  update(ear: number, now = performance.now()): BlinkEvent | null {
    if (!this.eyesClosed) {
      this.baselineEar += this.config.baselineAlpha * (ear - this.baselineEar);
    }

    const closeAt = Math.min(
      this.config.closedThreshold,
      this.baselineEar * this.config.closeRatio,
    );
    const openAt = Math.max(
      this.config.openThreshold,
      this.baselineEar * this.config.openRatio,
    );

    if (!this.eyesClosed && ear < closeAt) {
      this.eyesClosed = true;
      this.closeStartedAt = now;
      return null;
    }

    if (this.eyesClosed && ear > openAt) {
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
