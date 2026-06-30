import {
  MORSE_DOT_DASH_THRESHOLD_MS,
  MIN_BLINK_MS_DEFAULT,
  COOLDOWN_MS_DEFAULT,
  EAR_CLOSED_DEFAULT,
  EAR_REARM_DELTA,
} from './morseTiming';

const LEFT_EYE = [33, 160, 158, 133, 153, 144] as const;
const RIGHT_EYE = [362, 385, 387, 263, 373, 380] as const;

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

export function averageEar(landmarks: Point2D[]): number {
  return (eyeAspectRatio(landmarks, LEFT_EYE) + eyeAspectRatio(landmarks, RIGHT_EYE)) / 2;
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
    ear: eyeAspectRatio(landmarks, LEFT_EYE),
    outer: landmarks[33],
    centerY: leftEyeCenterY(landmarks),
  };
}

function mpRightEye(landmarks: Point2D[]): ScreenEye {
  return {
    ear: eyeAspectRatio(landmarks, RIGHT_EYE),
    outer: landmarks[263],
    centerY: rightEyeCenterY(landmarks),
  };
}

/**
 * Selfie preview: screen-left / screen-right eye slots for HUD placement.
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
  rearmThreshold: number;
  /** Ignore blinks shorter than this (noise). */
  minBlinkMs: number;
  /** Closed duration at or below this → dot; longer → dash. */
  dotMaxMs: number;
  cooldownMs: number;
}

export const DEFAULT_BLINK_CONFIG: BlinkDetectorConfig = {
  closedThreshold: EAR_CLOSED_DEFAULT / 1000,
  rearmThreshold: EAR_CLOSED_DEFAULT / 1000 + EAR_REARM_DELTA,
  minBlinkMs: MIN_BLINK_MS_DEFAULT,
  dotMaxMs: MORSE_DOT_DASH_THRESHOLD_MS,
  cooldownMs: COOLDOWN_MS_DEFAULT,
};

export type BlinkSymbol = 'dot' | 'dash';

export interface BlinkEvent {
  symbol: BlinkSymbol;
  durationMs: number;
}

export class BlinkDetector {
  private inBlink = false;
  private blinkStartedAt = 0;
  private lastEventAt = 0;

  constructor(private config: BlinkDetectorConfig = DEFAULT_BLINK_CONFIG) {}

  /** One or both eyes: short close = dot, long close = dash. */
  update(leftEar: number, rightEar: number, now = performance.now()): BlinkEvent | null {
    const { closedThreshold, rearmThreshold } = this.config;
    const anyClosed = leftEar < closedThreshold || rightEar < closedThreshold;
    const allOpen = leftEar > rearmThreshold && rightEar > rearmThreshold;

    if (!this.inBlink && anyClosed) {
      this.inBlink = true;
      this.blinkStartedAt = now;
      return null;
    }

    if (this.inBlink && allOpen) {
      this.inBlink = false;
      const durationMs = now - this.blinkStartedAt;
      if (durationMs < this.config.minBlinkMs) return null;
      if (now - this.lastEventAt < this.config.cooldownMs) return null;

      this.lastEventAt = now;
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
