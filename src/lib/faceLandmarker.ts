import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { averageEar, type Point2D } from './eyeBlink';

const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export interface FaceFrameResult {
  ear: number;
  landmarks: Point2D[];
}

export class FaceLandmarkerEngine {
  private landmarker: FaceLandmarker | null = null;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }

  detect(video: HTMLVideoElement, timestampMs: number): FaceFrameResult | null {
    if (!this.landmarker || video.readyState < 2) return null;

    const result = this.landmarker.detectForVideo(video, timestampMs);
    const face = result.faceLandmarks[0];
    if (!face) return null;

    const landmarks: Point2D[] = face.map((p) => ({ x: p.x, y: p.y }));
    return { ear: averageEar(landmarks), landmarks };
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
