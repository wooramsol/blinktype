import './styles.css';
import { FaceLandmarkerEngine } from './lib/faceLandmarker';
import { clearFaceOverlay, drawFaceOverlay, resizeOverlayCanvas } from './lib/faceOverlay';
import { HeadShakeDetector, noseOffsetX } from './lib/headShake';
import { MouthMorseDetector, mouthOpenRatio } from './lib/mouthOpen';
import {
  MorseStateMachine,
  DEFAULT_MORSE_TIMING,
  morseToDisplay,
  type MorseCommitEvent,
} from './lib/morseStateMachine';
import { MorseAudio } from './lib/morseAudio';
import { lettersOnly, segmentWords } from './lib/wordSegment';
import pkg from '../package.json';
import { versionLabel } from './buildRef';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="layout">
    <div class="title-row">
      <h1 class="title"># BlinkType ${versionLabel(pkg.version)}</h1>
      <span class="credit">@wooramsol</span>
    </div>
    <div id="video-wrap" class="video-wrap">
      <div class="video-mirror">
        <video id="video" autoplay muted playsinline webkit-playsinline></video>
        <canvas id="overlay"></canvas>
      </div>
      <div id="mouth-label" class="ear-label mouth-hud" hidden>M —</div>
    </div>
    <textarea id="output" rows="8" spellcheck="false"></textarea>
  </div>
`;

const videoWrap = document.querySelector<HTMLDivElement>('#video-wrap')!;
const video = document.querySelector<HTMLVideoElement>('#video')!;
const overlay = document.querySelector<HTMLCanvasElement>('#overlay')!;
const overlayCtx = overlay.getContext('2d')!;
const output = document.querySelector<HTMLTextAreaElement>('#output')!;
const mouthLabel = document.querySelector<HTMLDivElement>('#mouth-label')!;

let stream: MediaStream | null = null;
let rafId = 0;
let engine: FaceLandmarkerEngine | null = null;
let modelReady = false;
let starting = false;
const mouthMorseDetector = new MouthMorseDetector();
const headShakeDetector = new HeadShakeDetector();
const morseAudio = new MorseAudio();
let committedText = '';
let pendingBuffer = '';

function displayValue(): string {
  const spaced = committedText ? segmentWords(committedText) : '';
  return spaced + (pendingBuffer ? morseToDisplay(pendingBuffer) : '');
}

function parseCommittedDisplay(display: string): string {
  return lettersOnly(display);
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
    committedText = parseCommittedDisplay(val.slice(0, -pendingDisplay.length));
    return;
  }

  committedText = parseCommittedDisplay(val);
  pendingBuffer = '';
  morseMachine.reset();
}

const morseMachine = new MorseStateMachine(
  DEFAULT_MORSE_TIMING,
  (event: MorseCommitEvent) => {
    committedText += event.char.toLowerCase();
    pendingBuffer = '';
    syncOutput();
  },
  (buffer) => {
    pendingBuffer = buffer;
    syncOutput();
  },
);

function backspaceOutput(): void {
  if (pendingBuffer) {
    pendingBuffer = '';
    morseMachine.reset();
  } else if (committedText.length > 0) {
    committedText = committedText.slice(0, -1);
  }
  syncOutput();
}

function positionMouthLabel(ratio: number): void {
  const w = videoWrap.clientWidth;
  const h = videoWrap.clientHeight;
  if (w === 0 || h === 0) return;

  mouthLabel.textContent = `M ${ratio.toFixed(3)}`;
  mouthLabel.style.left = `${w * 0.5}px`;
  mouthLabel.style.top = `${h * 0.88}px`;
  mouthLabel.hidden = false;
}

function hideMouthLabel(): void {
  mouthLabel.hidden = true;
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
      const now = performance.now();
      resizeOverlayCanvas(overlay, video);
      drawFaceOverlay(overlayCtx, frame.landmarks);

      const ratio = mouthOpenRatio(frame.landmarks);
      positionMouthLabel(ratio);

      const mouth = mouthMorseDetector.update(ratio, now);
      if (mouth) {
        morseAudio.play(mouth.symbol);
        morseMachine.onMorseSymbol(mouth.symbol, now);
      } else if (headShakeDetector.update(noseOffsetX(frame.landmarks), now)) {
        backspaceOutput();
      }
    } else {
      hideMouthLabel();
      clearFaceOverlay(overlayCtx);
    }

    morseMachine.tick(performance.now());
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
  morseAudio.unlock();
  if (!stream && !starting) void startCamera();
});

output.addEventListener('input', onUserEdit);

void startCamera();
