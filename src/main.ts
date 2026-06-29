import './styles.css';
import { FaceLandmarkerEngine } from './lib/faceLandmarker';
import { BlinkDetector, faceSideHudAnchor } from './lib/eyeBlink';
import { clearFaceOverlay, drawFaceOverlay, resizeOverlayCanvas } from './lib/faceOverlay';
import {
  MorseStateMachine,
  DEFAULT_MORSE_TIMING,
  morseToDisplay,
  type MorseCommitEvent,
} from './lib/morseStateMachine';
import pkg from '../package.json';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="layout">
    <div class="title-row">
      <h1 class="title"># BlinkType v${pkg.version}</h1>
      <span class="credit">@wooramsol</span>
    </div>
    <div id="video-wrap" class="video-wrap">
      <div class="video-mirror">
        <video id="video" autoplay muted playsinline webkit-playsinline></video>
        <canvas id="overlay"></canvas>
      </div>
      <div id="ear-label" class="ear-label" hidden>EAR —</div>
    </div>
    <textarea id="output" rows="8" spellcheck="false"></textarea>
  </div>
`;

const videoWrap = document.querySelector<HTMLDivElement>('#video-wrap')!;
const video = document.querySelector<HTMLVideoElement>('#video')!;
const overlay = document.querySelector<HTMLCanvasElement>('#overlay')!;
const overlayCtx = overlay.getContext('2d')!;
const output = document.querySelector<HTMLTextAreaElement>('#output')!;
const earLabel = document.querySelector<HTMLDivElement>('#ear-label')!;

let stream: MediaStream | null = null;
let rafId = 0;
let engine: FaceLandmarkerEngine | null = null;
let modelReady = false;
let starting = false;
const blinkDetector = new BlinkDetector();
let committedText = '';
let pendingBuffer = '';

function displayValue(): string {
  return committedText + (pendingBuffer ? morseToDisplay(pendingBuffer) : '');
}

function syncOutput(): void {
  const next = displayValue();
  if (output.value === next) return;

  const selStart = output.selectionStart ?? next.length;
  const selEnd = output.selectionEnd ?? next.length;
  const hadFocus = document.activeElement === output;
  const pendingDisplay = pendingBuffer ? morseToDisplay(pendingBuffer) : '';
  const editingCommitted =
    hadFocus && pendingDisplay && selEnd <= output.value.length - pendingDisplay.length;

  output.value = next;
  output.scrollTop = output.scrollHeight;

  if (hadFocus) {
    if (editingCommitted) {
      output.setSelectionRange(selStart, selEnd);
    } else {
      output.setSelectionRange(next.length, next.length);
    }
  }
}

function onUserEdit(): void {
  const pendingDisplay = pendingBuffer ? morseToDisplay(pendingBuffer) : '';
  const val = output.value;

  if (pendingDisplay && val.endsWith(pendingDisplay)) {
    committedText = val.slice(0, -pendingDisplay.length);
    return;
  }

  committedText = val;
  pendingBuffer = '';
  morseMachine.reset();
}

const morseMachine = new MorseStateMachine(
  DEFAULT_MORSE_TIMING,
  (event: MorseCommitEvent) => {
    const text = event.type === 'space' ? ' ' : event.char;
    committedText += text;
    pendingBuffer = '';
    syncOutput();
  },
  (buffer) => {
    pendingBuffer = buffer;
    syncOutput();
  },
);

function positionEarLabel(landmarks: { x: number; y: number }[]): void {
  const anchor = faceSideHudAnchor(landmarks);
  const screenX = 1 - anchor.x;
  earLabel.style.left = `${screenX * 100}%`;
  earLabel.style.top = `${anchor.y * 100}%`;
  earLabel.style.transform =
    screenX < 0.5 ? 'translate(-100%, -50%)' : 'translate(8px, -50%)';
  earLabel.hidden = false;
}

function isVideoLive(): boolean {
  return stream !== null && video.videoWidth > 0 && !video.paused;
}

async function waitForVideoFrames(): Promise<void> {
  if (video.videoWidth > 0) return;

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('Camera preview timed out'));
    }, 8000);

    const done = (): void => {
      window.clearTimeout(timeout);
      resolve();
    };

    video.onloadedmetadata = () => {
      if (video.videoWidth > 0) done();
    };
    video.onplaying = () => {
      if (video.videoWidth > 0) done();
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('Video failed to load'));
    };
  });
}

async function loadModel(): Promise<void> {
  if (modelReady || engine) return;
  try {
    engine = new FaceLandmarkerEngine();
    await engine.init();
    modelReady = true;
  } catch {
    engine?.close();
    engine = null;
    modelReady = false;
  }
}

async function loop(): Promise<void> {
  if (stream && video.paused) {
    void video.play().catch(() => undefined);
  }

  if (isVideoLive() && modelReady && engine) {
    const frame = engine.detect(video, performance.now());
    if (frame) {
      resizeOverlayCanvas(overlay, video);
      drawFaceOverlay(overlayCtx, frame.landmarks);

      earLabel.textContent = `EAR ${frame.ear.toFixed(3)}`;
      positionEarLabel(frame.landmarks);

      const blink = blinkDetector.update(frame.ear, performance.now());
      if (blink) {
        morseMachine.onBlink(blink, performance.now());
      }
    } else {
      earLabel.hidden = true;
      clearFaceOverlay(overlayCtx);
    }
  }

  rafId = requestAnimationFrame(loop);
}

async function startCamera(): Promise<void> {
  if (starting || stream) return;
  if (!navigator.mediaDevices?.getUserMedia) return;

  starting = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });

    video.srcObject = stream;
    video.muted = true;

    await video.play();
    await waitForVideoFrames();

    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    void loadModel();
  } catch {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  } finally {
    starting = false;
  }
}

videoWrap.addEventListener('click', () => {
  if (!stream && !starting) void startCamera();
});

output.addEventListener('input', onUserEdit);

void startCamera();
