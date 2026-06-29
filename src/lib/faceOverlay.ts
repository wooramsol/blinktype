import { FaceLandmarker } from '@mediapipe/tasks-vision';
import {
  EYE_OVERLAY_EXPAND,
  expandLandmarkRegion,
  type Point2D,
} from './eyeBlink';

type Connection = { start: number; end: number };

const EYE_CONTOURS: Connection[] = [
  ...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
  ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
];

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

const LEFT_EYE_INDICES = uniqueIndices(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE);
const RIGHT_EYE_INDICES = uniqueIndices(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE);
const LOWER_BROW_INDICES = uniqueIndices(LOWER_EYEBROW_CONTOURS);

function uniqueIndices(connections: Connection[]): number[] {
  const set = new Set<number>();
  for (const { start, end } of connections) {
    set.add(start);
    set.add(end);
  }
  return [...set];
}

function expandedLandmarks(landmarks: Point2D[]): Map<number, Point2D> {
  const leftEye = expandLandmarkRegion(landmarks, LEFT_EYE_INDICES, EYE_OVERLAY_EXPAND);
  const rightEye = expandLandmarkRegion(landmarks, RIGHT_EYE_INDICES, EYE_OVERLAY_EXPAND);
  return new Map([...leftEye, ...rightEye]);
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

  const expanded = expandedLandmarks(landmarks);

  drawConnections(ctx, landmarks, EYE_CONTOURS, w, h, '#fff', 1, expanded);
  drawConnections(ctx, landmarks, LOWER_EYEBROW_CONTOURS, w, h, '#fff', 1);
  drawConnections(ctx, landmarks, INNER_LIP_CONTOURS, w, h, '#fff', 1);

  for (const i of [...LEFT_EYE_INDICES, ...RIGHT_EYE_INDICES]) {
    const p = expanded.get(i) ?? landmarks[i];
    drawPoint(ctx, p, w, h, '#fff', 2);
  }
  for (const i of LOWER_BROW_INDICES) {
    drawPoint(ctx, landmarks[i], w, h, '#fff', 2);
  }
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
