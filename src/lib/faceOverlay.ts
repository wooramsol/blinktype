import { FaceLandmarker } from '@mediapipe/tasks-vision';
import {
  EYE_OVERLAY_EXPAND,
  expandLandmarkRegion,
  type Point2D,
} from './eyeBlink';

const OVERLAY_OPACITY = 0.5;
const EYE_GRID_COLS = 4;
const EYE_GRID_ROWS = 3;
/** Expand eye bbox before drawing the surrounding grid. */
const EYE_GRID_PAD = 0.4;

type Connection = { start: number; end: number };

/** MediaPipe names are camera-left/right; each eye contour is lower arc then upper arc. */
const MP_EYE_A = FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE;
const MP_EYE_B = FaceLandmarker.FACE_LANDMARKS_LEFT_EYE;

/** Lower brow arc (eye-facing edge) per side — not the full eyebrow. */
const LOWER_EYEBROW_CONTOURS: Connection[] = [
  { start: 70, end: 63 },
  { start: 63, end: 105 },
  { start: 105, end: 66 },
  { start: 66, end: 107 },
  { start: 300, end: 293 },
  { start: 293, end: 334 },
  { start: 334, end: 296 },
  { start: 296, end: 336 },
];

const LOWER_BROW_INDICES = uniqueIndices(LOWER_EYEBROW_CONTOURS);

function uniqueIndices(connections: Connection[]): number[] {
  const set = new Set<number>();
  for (const { start, end } of connections) {
    set.add(start);
    set.add(end);
  }
  return [...set];
}

function splitEyeArcs(connections: Connection[]): [Connection[], Connection[]] {
  const mid = connections.length / 2;
  return [connections.slice(0, mid), connections.slice(mid)];
}

function arcAvgY(landmarks: Point2D[], arc: Connection[]): number {
  const ids = uniqueIndices(arc);
  let sum = 0;
  for (const i of ids) sum += landmarks[i].y;
  return sum / (ids.length || 1);
}

/** Upper eyelid = arc with smaller average y (higher on the face). */
function upperEyelidArc(connections: Connection[], landmarks: Point2D[]): Connection[] {
  const [a, b] = splitEyeArcs(connections);
  return arcAvgY(landmarks, a) < arcAvgY(landmarks, b) ? a : b;
}

function upperEyelidContours(landmarks: Point2D[]): Connection[] {
  return [
    ...upperEyelidArc(MP_EYE_A, landmarks),
    ...upperEyelidArc(MP_EYE_B, landmarks),
  ];
}

function upperEyelidArcs(landmarks: Point2D[]): Connection[][] {
  return [upperEyelidArc(MP_EYE_A, landmarks), upperEyelidArc(MP_EYE_B, landmarks)];
}

function expandedLandmarks(landmarks: Point2D[]): Map<number, Point2D> {
  const out = new Map<number, Point2D>();
  for (const arc of upperEyelidArcs(landmarks)) {
    const indices = uniqueIndices(arc);
    const expanded = expandLandmarkRegion(landmarks, indices, EYE_OVERLAY_EXPAND);
    for (const [i, p] of expanded) out.set(i, p);
  }
  return out;
}

function eyeGridPoints(connections: Connection[], landmarks: Point2D[]): Point2D[] {
  return uniqueIndices(connections).map((i) => landmarks[i]);
}

function drawEyeGrid(
  ctx: CanvasRenderingContext2D,
  points: Point2D[],
  w: number,
  h: number,
): void {
  if (points.length === 0) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const padX = (maxX - minX) * EYE_GRID_PAD;
  const padY = (maxY - minY) * EYE_GRID_PAD;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;

  ctx.save();
  ctx.globalAlpha = OVERLAY_OPACITY * 0.45;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 0.75;

  for (let c = 0; c <= EYE_GRID_COLS; c++) {
    const x = (minX + ((maxX - minX) * c) / EYE_GRID_COLS) * w;
    ctx.beginPath();
    ctx.moveTo(x, minY * h);
    ctx.lineTo(x, maxY * h);
    ctx.stroke();
  }

  for (let r = 0; r <= EYE_GRID_ROWS; r++) {
    const y = (minY + ((maxY - minY) * r) / EYE_GRID_ROWS) * h;
    ctx.beginPath();
    ctx.moveTo(minX * w, y);
    ctx.lineTo(maxX * w, y);
    ctx.stroke();
  }

  ctx.restore();
}

export function resizeOverlayCanvas(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): void {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

export function drawFaceOverlay(
  ctx: CanvasRenderingContext2D,
  landmarks: Point2D[],
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);

  const eyelids = upperEyelidContours(landmarks);
  const eyelidIndices = uniqueIndices(eyelids);
  const expanded = expandedLandmarks(landmarks);

  ctx.save();
  ctx.globalAlpha = OVERLAY_OPACITY;

  drawEyeGrid(ctx, eyeGridPoints(MP_EYE_A, landmarks), w, h);
  drawEyeGrid(ctx, eyeGridPoints(MP_EYE_B, landmarks), w, h);

  drawConnections(ctx, landmarks, eyelids, w, h, '#fff', 1, expanded);
  drawConnections(ctx, landmarks, LOWER_EYEBROW_CONTOURS, w, h, '#fff', 1);

  for (const i of eyelidIndices) {
    const p = expanded.get(i) ?? landmarks[i];
    drawPoint(ctx, p, w, h, '#fff', 2);
  }
  for (const i of LOWER_BROW_INDICES) {
    drawPoint(ctx, landmarks[i], w, h, '#fff', 2);
  }

  ctx.restore();
}

function drawConnections(
  ctx: CanvasRenderingContext2D,
  landmarks: Point2D[],
  connections: Connection[],
  w: number,
  h: number,
  color: string,
  width: number,
  expanded?: Map<number, Point2D>,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const { start, end } of connections) {
    const a = expanded?.get(start) ?? landmarks[start];
    const b = expanded?.get(end) ?? landmarks[end];
    if (!a || !b) continue;
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
  }
  ctx.stroke();
}

function drawPoint(
  ctx: CanvasRenderingContext2D,
  point: Point2D,
  w: number,
  h: number,
  color: string,
  radius: number,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x * w, point.y * h, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function clearFaceOverlay(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
