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

function mirrorScreenX(landmarkX: number): number {
  return 1 - landmarkX;
}

/** Resolve which eye is on the selfie screen-left vs screen-right. */
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

  const leftOnScreen = mirrorScreenX(eyeCenterX(landmarks, 133, 33));
  const rightOnScreen = mirrorScreenX(eyeCenterX(landmarks, 362, 263));

  if (leftOnScreen < rightOnScreen) {
    return { screenLeft: mpLeft, screenRight: mpRight };
  }
  return { screenLeft: mpRight, screenRight: mpLeft };
}

/** Selfie screen positions for L/R labels, pushed outside each eye. */
export function selfieEarLabelPoints(
  landmarks: Point2D[],
  width: number,
  height: number,
): { screenLeft: Point2D; screenRight: Point2D } {
  const eyes = selfieScreenEyes(landmarks);
  const toScreen = (x: number, y: number): Point2D => ({
    x: mirrorScreenX(x) * width,
    y: y * height,
  });
  const nose = toScreen(landmarks[1].x, landmarks[1].y);
  const pad = Math.max(20, width * 0.045);

  const pushOut = (eye: ScreenEye): Point2D => {
    const outer = toScreen(eye.outerX, eye.centerY);
    const dx = outer.x - nose.x;
    const dy = outer.y - nose.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: outer.x + (dx / len) * pad,
      y: outer.y + (dy / len) * pad,
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
  minBlinkMs: number;
}

export const DEFAULT_BLINK_CONFIG: BlinkDetectorConfig = {
  closedThreshold: 0.21,
  openThreshold: 0.24,
  minBlinkMs: 80,
};

export type BlinkSymbol = 'dot' | 'dash';
export type SelfieEye = 'left' | 'right';

export interface BlinkEvent {
  symbol: BlinkSymbol;
  eye: SelfieEye;
  durationMs: number;
}

type EyeState = {
  closed: boolean;
  closeStartedAt: number;
};

export class BlinkDetector {
  private left: EyeState = { closed: false, closeStartedAt: 0 };
  private right: EyeState = { closed: false, closeStartedAt: 0 };

  constructor(private config: BlinkDetectorConfig = DEFAULT_BLINK_CONFIG) {}

  /** Selfie left eye = dot, selfie right eye = dash. Requires the other eye to stay open (wink). */
  update(leftEar: number, rightEar: number, now = performance.now()): BlinkEvent | null {
    const leftEvent = this.updateEye('left', leftEar, rightEar, this.left, now);
    const rightEvent = this.updateEye('right', rightEar, leftEar, this.right, now);

    if (leftEvent && rightEvent) return null;
    return leftEvent ?? rightEvent;
  }

  private updateEye(
    eye: SelfieEye,
    ear: number,
    otherEar: number,
    state: EyeState,
    now: number,
  ): BlinkEvent | null {
    if (
      !state.closed &&
      ear < this.config.closedThreshold &&
      otherEar > this.config.openThreshold
    ) {
      state.closed = true;
      state.closeStartedAt = now;
      return null;
    }

    if (state.closed && ear > this.config.openThreshold) {
      state.closed = false;
      const durationMs = now - state.closeStartedAt;
      if (durationMs < this.config.minBlinkMs) return null;
      if (otherEar <= this.config.openThreshold) return null;
      return {
        symbol: eye === 'left' ? 'dot' : 'dash',
        eye,
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
