const LEFT_EYE = [33, 160, 158, 133, 153, 144] as const;
const RIGHT_EYE = [362, 385, 387, 263, 373, 380] as const;
/** Brow arc above each eye — included in blink openness. */
const LEFT_BROW_NEAR = [107, 66, 105] as const;
const RIGHT_BROW_NEAR = [336, 296, 334] as const;

export interface Point2D {
  x: number;
  y: number;
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroid(points: Point2D[]): Point2D {
  const n = points.length || 1;
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / n, y: y / n };
}

export function eyeAspectRatio(landmarks: Point2D[], indices: readonly number[]): number {
  const [p1, p2, p3, p4, p5, p6] = indices.map((i) => landmarks[i]);
  const vertical = dist(p2, p6) + dist(p3, p5);
  const horizontal = dist(p1, p4);
  if (horizontal === 0) return 1;
  return vertical / (2 * horizontal);
}

/** How open the lid is relative to the brow — drops when winking/squinting. */
export function eyeBrowSquintRatio(
  landmarks: Point2D[],
  eye: readonly number[],
  brow: readonly number[],
): number {
  const [, p2, p3, , p5, p6] = eye.map((i) => landmarks[i]);
  const lidVertical = dist(p2, p6) + dist(p3, p5);

  const browCenter = centroid(brow.map((i) => landmarks[i]));
  const upperLid = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  const browGap = dist(browCenter, upperLid);

  if (lidVertical + browGap === 0) return 1;
  return lidVertical / (lidVertical + browGap);
}

/** Eye + brow combined openness (used for wink detection and HUD). */
export function eyeOpenness(
  landmarks: Point2D[],
  eye: readonly number[],
  brow: readonly number[],
): number {
  const ear = eyeAspectRatio(landmarks, eye);
  const squint = eyeBrowSquintRatio(landmarks, eye, brow);
  return ear * 0.45 + squint * 0.55;
}

export function averageEar(landmarks: Point2D[]): number {
  return (
    eyeOpenness(landmarks, LEFT_EYE, LEFT_BROW_NEAR) +
    eyeOpenness(landmarks, RIGHT_EYE, RIGHT_BROW_NEAR)
  ) / 2;
}

/** Push landmark indices outward from their region centroid (overlay). */
export function expandLandmarkRegion(
  landmarks: Point2D[],
  indices: readonly number[],
  scale: number,
): Map<number, Point2D> {
  const pts = indices.map((i) => landmarks[i]);
  const center = centroid(pts);
  const out = new Map<number, Point2D>();
  for (const i of indices) {
    const p = landmarks[i];
    out.set(i, {
      x: center.x + (p.x - center.x) * scale,
      y: center.y + (p.y - center.y) * scale,
    });
  }
  return out;
}

export const EYE_OVERLAY_EXPAND = 1.1;

type ScreenEye = {
  ear: number;
  /** Outer canthus (eye tail) in normalized landmark space. */
  outer: Point2D;
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

/** Map landmark x to selfie preview x (video is mirrored). */
function selfieViewX(landmarkX: number): number {
  return 1 - landmarkX;
}

function mpLeftEye(landmarks: Point2D[]): ScreenEye {
  return {
    ear: eyeOpenness(landmarks, LEFT_EYE, LEFT_BROW_NEAR),
    outer: landmarks[33],
    centerY: leftEyeCenterY(landmarks),
  };
}

function mpRightEye(landmarks: Point2D[]): ScreenEye {
  return {
    ear: eyeOpenness(landmarks, RIGHT_EYE, RIGHT_BROW_NEAR),
    outer: landmarks[263],
    centerY: rightEyeCenterY(landmarks),
  };
}

/**
 * Selfie preview: screen-left = viewer's left = subject's left eye (L, dot).
 * screen-right = viewer's right = subject's right eye (R, dash).
 */
export function selfieScreenEyes(landmarks: Point2D[]): {
  screenLeft: ScreenEye;
  screenRight: ScreenEye;
} {
  const mpLeft = mpLeftEye(landmarks);
  const mpRight = mpRightEye(landmarks);

  const leftOnScreen = selfieViewX(eyeCenterX(landmarks, 133, 33));
  const rightOnScreen = selfieViewX(eyeCenterX(landmarks, 362, 263));

  if (leftOnScreen < rightOnScreen) {
    return { screenLeft: mpLeft, screenRight: mpRight };
  }
  return { screenLeft: mpRight, screenRight: mpLeft };
}

/**
 * Pixel positions in video-wrap (outside the mirror layer).
 * Anchors sit just outside each eye's outer canthus and follow head movement.
 */
export function selfieEarHudPixels(
  landmarks: Point2D[],
  width: number,
  height: number,
  eyes = selfieScreenEyes(landmarks),
): { screenLeft: Point2D; screenRight: Point2D } {
  const noseX = selfieViewX(landmarks[1].x) * width;
  const noseY = landmarks[1].y * height;
  const pad = Math.max(12, width * 0.032);

  const pushOut = (eye: ScreenEye): Point2D => {
    const ox = selfieViewX(eye.outer.x) * width;
    const oy = eye.centerY * height;
    const dx = ox - noseX;
    const dy = oy - noseY;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: ox + (dx / len) * pad,
      y: oy + (dy / len) * pad,
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
  closedThreshold: 0.26,
  openThreshold: 0.28,
  minBlinkMs: 55,
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

  /** Selfie L wink = dot, selfie R wink = dash. Other eye must stay open. */
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
      otherEar > this.config.closedThreshold
    ) {
      state.closed = true;
      state.closeStartedAt = now;
      return null;
    }

    if (state.closed && ear > this.config.openThreshold) {
      state.closed = false;
      const durationMs = now - state.closeStartedAt;
      if (durationMs < this.config.minBlinkMs) return null;
      if (otherEar <= this.config.closedThreshold) return null;
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
