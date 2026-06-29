import { FaceLandmarker } from '@mediapipe/tasks-vision';
import type { Point2D } from './eyeBlink';

const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

type Connection = { start: number; end: number };

const EYE_CONTOURS: Connection[] = [
  ...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
  ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
];

const INNER_LIP_INDICES = new Set([
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308,
  191, 80, 81, 82, 13, 312, 311, 310, 415,
]);

const INNER_LIP_CONTOURS: Connection[] = FaceLandmarker.FACE_LANDMARKS_LIPS.filter(
  (connection) =>
    INNER_LIP_INDICES.has(connection.start) && INNER_LIP_INDICES.has(connection.end),
);

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

  drawConnections(ctx, landmarks, EYE_CONTOURS, w, h, '#fff', 1);
  drawConnections(ctx, landmarks, INNER_LIP_CONTOURS, w, h, '#fff', 1);

  for (const i of [...LEFT_EYE, ...RIGHT_EYE]) {
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
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const { start, end } of connections) {
    const a = landmarks[start];
    const b = landmarks[end];
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
