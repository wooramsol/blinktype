import { FaceLandmarker } from '@mediapipe/tasks-vision';
import {
  EYE_OVERLAY_EXPAND,
  expandLandmarkRegion,
  type Point2D,
} from './eyeBlink';

const OVERLAY_OPACITY = 0.5;

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

const INNER_LIP_INDICES = new Set([
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308,
  191, 80, 81, 82, 13, 312, 311, 310, 415,
]);

const INNER_LIP_CONTOURS: Connection[] = FaceLandmarker.FACE_LANDMARKS_LIPS.filter(
  (connection) =>
    INNER_LIP_INDICES.has(connection.start) && INNER_LIP_INDICES.has(connection.end),
);

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

/** Lower eyelid = arc with larger average y (lower on the face). */
function lowerEyelidArc(connections: Connection[], landmarks: Point2D[]): Connection[] {
  const [a, b] = splitEyeArcs(connections);
  return arcAvgY(landmarks, a) > arcAvgY(landmarks, b) ? a : b;
}

function lowerEyelidContours(landmarks: Point2D[]): Connection[] {
  return [
    ...lowerEyelidArc(MP_EYE_A, landmarks),
    ...lowerEyelidArc(MP_EYE_B, landmarks),
  ];
}

function expandedLandmarks(landmarks: Point2D[]): Map<number, Point2D> {
  const arcs = [lowerEyelidArc(MP_EYE_A, landmarks), lowerEyelidArc(MP_EYE_B, landmarks)];
  const out = new Map<number, Point2D>();
  for (const arc of arcs) {
    const indices = uniqueIndices(arc);
    const expanded = expandLandmarkRegion(landmarks, indices, EYE_OVERLAY_EXPAND);
    for (const [i, p] of expanded) out.set(i, p);
  }
  return out;
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

  const eyelids = lowerEyelidContours(landmarks);
  const eyelidIndices = uniqueIndices(eyelids);
  const expanded = expandedLandmarks(landmarks);

  ctx.save();
  ctx.globalAlpha = OVERLAY_OPACITY;

  drawConnections(ctx, landmarks, eyelids, w, h, '#fff', 1, expanded);
  drawConnections(ctx, landmarks, LOWER_EYEBROW_CONTOURS, w, h, '#fff', 1);
  drawConnections(ctx, landmarks, INNER_LIP_CONTOURS, w, h, '#fff', 1);

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
