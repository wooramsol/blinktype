import { FaceLandmarker } from '@mediapipe/tasks-vision';
import type { Point2D } from './eyeBlink';

const LEFT_EYE = new Set([33, 160, 158, 133, 153, 144]);
const RIGHT_EYE = new Set([362, 385, 387, 263, 373, 380]);

type Connection = { start: number; end: number };

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

  const contours: Connection[] = [
    ...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
  ];

  drawConnections(ctx, landmarks, contours, w, h, 'rgba(91, 140, 255, 0.75)', 1.25);

  for (let i = 0; i < landmarks.length; i++) {
    const isEye = LEFT_EYE.has(i) || RIGHT_EYE.has(i);
    drawPoint(
      ctx,
      landmarks[i],
      w,
      h,
      isEye ? 'rgba(250, 204, 21, 0.95)' : 'rgba(91, 140, 255, 0.45)',
      isEye ? 2.5 : 1.25,
    );
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
