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

type ScreenEye = {
  ear: number;
  outerX: number;
  centerY: number;
};

function leftEyeCenterY(landmarks: Point2D[]): number {
  return (landmarks[160].y + landmarks[158].y + landmarks[153].y + landmarks[144].y) / 4;
}

function rightEyeCenterY(landmarks: Point2D[]): number {
  return (landmarks[385].y + landmarks[387].y + landmarks[373].y + landmarks[380].y) / 4;
}

function eyeCenterX(landmarks: Point2D[], inner: number, outer: number): number {
  return (landmarks[inner].x + landmarks[outer].x) / 2;
}

/**
 * Selfie mirror (scaleX -1): higher raw landmark x appears on the viewer's left.
 * screen-left = user's left eye in the selfie preview.
 */
export function selfieScreenEyes(landmarks: Point2D[]): {
  screenLeft: ScreenEye;
  screenRight: ScreenEye;
} {
  const mpLeft: ScreenEye = {
    ear: eyeAspectRatio(landmarks, LEFT_EYE),
    outerX: landmarks[33].x,
    centerY: leftEyeCenterY(landmarks),
  };
  const mpRight: ScreenEye = {
    ear: eyeAspectRatio(landmarks, RIGHT_EYE),
    outerX: landmarks[263].x,
    centerY: rightEyeCenterY(landmarks),
  };

  const mpLeftCenterX = eyeCenterX(landmarks, 133, 33);
  const mpRightCenterX = eyeCenterX(landmarks, 362, 263);

  if (mpLeftCenterX > mpRightCenterX) {
    return { screenLeft: mpLeft, screenRight: mpRight };
  }
  return { screenLeft: mpRight, screenRight: mpLeft };
}

/** Normalized anchor (0–1), same space as the face overlay inside the mirror. */
export function selfieEarLabelAnchors(
  landmarks: Point2D[],
  eyes = selfieScreenEyes(landmarks),
): {
  screenLeft: Point2D;
  screenRight: Point2D;
} {
  const nose = landmarks[1];
  const pad = 0.055;

  const pushOut = (eye: ScreenEye): Point2D => {
    const dx = eye.outerX - nose.x;
    const dy = eye.centerY - nose.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: eye.outerX + (dx / len) * pad,
      y: eye.centerY + (dy / len) * pad,
    };
  };

  return {
    screenLeft: pushOut(eyes.screenLeft),
    screenRight: pushOut(eyes.screenRight),
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

  /** Both eyes: short blink = dot, long blink = dash. */
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
