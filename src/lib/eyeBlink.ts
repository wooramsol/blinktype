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
  dotMaxMs: number;
  minBlinkMs: number;
  closeRatio: number;
  openRatio: number;
  reopenDelta: number;
  baselineAlpha: number;
  initialBaseline: number;
}

export const DEFAULT_BLINK_CONFIG: BlinkDetectorConfig = {
  dotMaxMs: 360,
  minBlinkMs: 35,
  closeRatio: 0.78,
  openRatio: 0.9,
  reopenDelta: 0.05,
  baselineAlpha: 0.05,
  initialBaseline: 0.52,
};

export type BlinkSymbol = 'dot' | 'dash';

export interface BlinkEvent {
  symbol: BlinkSymbol;
  durationMs: number;
}

export class BlinkDetector {
  private eyesClosed = false;
  private closeStartedAt = 0;
  private valleyEar = 1;
  private baselineEar: number;

  constructor(private config: BlinkDetectorConfig = DEFAULT_BLINK_CONFIG) {
    this.baselineEar = config.initialBaseline;
  }

  update(ear: number, now = performance.now()): BlinkEvent | null {
    if (!this.eyesClosed) {
      this.baselineEar += this.config.baselineAlpha * (ear - this.baselineEar);
    }

    const closeAt = this.baselineEar * this.config.closeRatio;
    const openAt = this.baselineEar * this.config.openRatio;

    if (!this.eyesClosed && ear < closeAt) {
      this.eyesClosed = true;
      this.closeStartedAt = now;
      this.valleyEar = ear;
      return null;
    }

    if (this.eyesClosed) {
      this.valleyEar = Math.min(this.valleyEar, ear);
      const recoveredFromValley = ear >= this.valleyEar + this.config.reopenDelta;
      const fullyOpen = ear >= openAt;

      if (recoveredFromValley || fullyOpen) {
        this.eyesClosed = false;
        const durationMs = now - this.closeStartedAt;
        if (durationMs < this.config.minBlinkMs) return null;
        return {
          symbol: durationMs <= this.config.dotMaxMs ? 'dot' : 'dash',
          durationMs,
        };
      }
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
