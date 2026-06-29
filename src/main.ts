import './styles.css';
import { FaceLandmarkerEngine } from './lib/faceLandmarker';
import { BlinkDetector, averageEar, selfieScreenEyes } from './lib/eyeBlink';
import { clearFaceOverlay, drawFaceOverlay, resizeOverlayCanvas } from './lib/faceOverlay';
import { HeadShakeDetector, noseOffsetX } from './lib/headShake';
import {
  MorseStateMachine,
  morseToDisplay,
  type MorseCommitEvent,
} from './lib/morseStateMachine';
import { MorseAudio } from './lib/morseAudio';
import {
  COOLDOWN_MS_DEFAULT,
  COOLDOWN_MS_SLIDER_MAX,
  COOLDOWN_MS_SLIDER_MIN,
  COOLDOWN_MS_SLIDER_STEP,
  DOT_MAX_MS_SLIDER_MAX,
  DOT_MAX_MS_SLIDER_MIN,
  EAR_CLOSED_DEFAULT,
  EAR_CLOSED_SLIDER_MAX,
  EAR_CLOSED_SLIDER_MIN,
  EAR_CLOSED_SLIDER_STEP,
  EAR_REARM_DELTA,
  LETTER_GAP_MS_SLIDER_MAX,
  LETTER_GAP_MS_SLIDER_MIN,
  LETTER_GAP_MS_SLIDER_STEP,
  MIN_BLINK_MS_DEFAULT,
  MIN_BLINK_MS_SLIDER_MAX,
  MIN_BLINK_MS_SLIDER_MIN,
  MIN_BLINK_MS_SLIDER_STEP,
  MORSE_DOT_DASH_THRESHOLD_MS,
  MORSE_LETTER_GAP_MS,
} from './lib/morseTiming';
import { formatCommittedText, lettersOnly } from './lib/wordSegment';
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
      <div class="video-controls">
        <div class="timing-control">
          <label for="dot-max-ms">·/− ms</label>
          <input type="range" id="dot-max-ms" min="${DOT_MAX_MS_SLIDER_MIN}" max="${DOT_MAX_MS_SLIDER_MAX}" step="10" value="${MORSE_DOT_DASH_THRESHOLD_MS}" />
          <span id="dot-max-ms-val" class="timing-val">${MORSE_DOT_DASH_THRESHOLD_MS}</span>
        </div>
        <div class="timing-control">
          <label for="letter-gap-ms">letter ms</label>
          <input type="range" id="letter-gap-ms" min="${LETTER_GAP_MS_SLIDER_MIN}" max="${LETTER_GAP_MS_SLIDER_MAX}" step="${LETTER_GAP_MS_SLIDER_STEP}" value="${MORSE_LETTER_GAP_MS}" />
          <span id="letter-gap-ms-val" class="timing-val">${MORSE_LETTER_GAP_MS}</span>
        </div>
        <div class="timing-control">
          <label for="cooldown-ms">gap ms</label>
          <input type="range" id="cooldown-ms" min="${COOLDOWN_MS_SLIDER_MIN}" max="${COOLDOWN_MS_SLIDER_MAX}" step="${COOLDOWN_MS_SLIDER_STEP}" value="${COOLDOWN_MS_DEFAULT}" />
          <span id="cooldown-ms-val" class="timing-val">${COOLDOWN_MS_DEFAULT}</span>
        </div>
        <div class="timing-control">
          <label for="min-blink-ms">min ms</label>
          <input type="range" id="min-blink-ms" min="${MIN_BLINK_MS_SLIDER_MIN}" max="${MIN_BLINK_MS_SLIDER_MAX}" step="${MIN_BLINK_MS_SLIDER_STEP}" value="${MIN_BLINK_MS_DEFAULT}" />
          <span id="min-blink-ms-val" class="timing-val">${MIN_BLINK_MS_DEFAULT}</span>
        </div>
        <div class="timing-control">
          <label for="ear-closed">EAR</label>
          <input type="range" id="ear-closed" min="${EAR_CLOSED_SLIDER_MIN}" max="${EAR_CLOSED_SLIDER_MAX}" step="${EAR_CLOSED_SLIDER_STEP}" value="${EAR_CLOSED_DEFAULT}" />
          <span id="ear-closed-val" class="timing-val">${EAR_CLOSED_DEFAULT}</span>
        </div>
      </div>
      <div class="video-mirror">
        <video id="video" autoplay muted playsinline webkit-playsinline></video>
        <canvas id="overlay"></canvas>
      </div>
      <div id="ear-label" class="ear-label mouth-hud" hidden>E —</div>
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
const dotMaxMsInput = document.querySelector<HTMLInputElement>('#dot-max-ms')!;
const dotMaxMsVal = document.querySelector<HTMLSpanElement>('#dot-max-ms-val')!;
const letterGapMsInput = document.querySelector<HTMLInputElement>('#letter-gap-ms')!;
const letterGapMsVal = document.querySelector<HTMLSpanElement>('#letter-gap-ms-val')!;
const cooldownMsInput = document.querySelector<HTMLInputElement>('#cooldown-ms')!;
const cooldownMsVal = document.querySelector<HTMLSpanElement>('#cooldown-ms-val')!;
const minBlinkMsInput = document.querySelector<HTMLInputElement>('#min-blink-ms')!;
const minBlinkMsVal = document.querySelector<HTMLSpanElement>('#min-blink-ms-val')!;
const earClosedInput = document.querySelector<HTMLInputElement>('#ear-closed')!;
const earClosedVal = document.querySelector<HTMLSpanElement>('#ear-closed-val')!;

function loadSavedMs(
  key: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const saved = Number(localStorage.getItem(key));
  return Number.isFinite(saved) && saved >= min && saved <= max ? saved : fallback;
}

function bindMsSlider(
  input: HTMLInputElement,
  valEl: HTMLSpanElement,
  key: string,
  min: number,
  max: number,
  fallback: number,
  onChange: (ms: number) => void,
): number {
  const initial = loadSavedMs(key, min, max, fallback);
  input.value = String(initial);
  valEl.textContent = String(initial);
  onChange(initial);
  input.addEventListener('input', () => {
    const ms = Number(input.value);
    valEl.textContent = String(ms);
    onChange(ms);
    localStorage.setItem(key, String(ms));
  });
  return initial;
}

let stream: MediaStream | null = null;
let rafId = 0;
let engine: FaceLandmarkerEngine | null = null;
let modelReady = false;
let starting = false;

const DOT_MAX_MS_KEY = 'blinktype-dotMaxMs';
const LETTER_GAP_MS_KEY = 'blinktype-letterGapMs';
const COOLDOWN_MS_KEY = 'blinktype-cooldownMs';
const MIN_BLINK_MS_KEY = 'blinktype-minBlinkMs';
const EAR_CLOSED_KEY = 'blinktype-earClosed';

const blinkDetector = new BlinkDetector();
bindMsSlider(
  dotMaxMsInput,
  dotMaxMsVal,
  DOT_MAX_MS_KEY,
  DOT_MAX_MS_SLIDER_MIN,
  DOT_MAX_MS_SLIDER_MAX,
  MORSE_DOT_DASH_THRESHOLD_MS,
  (ms) => blinkDetector.setConfig({ dotMaxMs: ms }),
);

const initialLetterGapMs = loadSavedMs(
  LETTER_GAP_MS_KEY,
  LETTER_GAP_MS_SLIDER_MIN,
  LETTER_GAP_MS_SLIDER_MAX,
  MORSE_LETTER_GAP_MS,
);

bindMsSlider(
  cooldownMsInput,
  cooldownMsVal,
  COOLDOWN_MS_KEY,
  COOLDOWN_MS_SLIDER_MIN,
  COOLDOWN_MS_SLIDER_MAX,
  COOLDOWN_MS_DEFAULT,
  (ms) => blinkDetector.setConfig({ cooldownMs: ms }),
);

bindMsSlider(
  minBlinkMsInput,
  minBlinkMsVal,
  MIN_BLINK_MS_KEY,
  MIN_BLINK_MS_SLIDER_MIN,
  MIN_BLINK_MS_SLIDER_MAX,
  MIN_BLINK_MS_DEFAULT,
  (ms) => blinkDetector.setConfig({ minBlinkMs: ms }),
);

bindMsSlider(
  earClosedInput,
  earClosedVal,
  EAR_CLOSED_KEY,
  EAR_CLOSED_SLIDER_MIN,
  EAR_CLOSED_SLIDER_MAX,
  EAR_CLOSED_DEFAULT,
  (v) => {
    const closed = v / 1000;
    blinkDetector.setConfig({
      closedThreshold: closed,
      rearmThreshold: closed + EAR_REARM_DELTA,
    });
  },
);
const headShakeDetector = new HeadShakeDetector();
const morseAudio = new MorseAudio();
let committedText = '';
let pendingBuffer = '';

function displayValue(): string {
  const spaced = committedText ? formatCommittedText(committedText) : '';
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
  { letterGapMs: initialLetterGapMs },
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

bindMsSlider(
  letterGapMsInput,
  letterGapMsVal,
  LETTER_GAP_MS_KEY,
  LETTER_GAP_MS_SLIDER_MIN,
  LETTER_GAP_MS_SLIDER_MAX,
  MORSE_LETTER_GAP_MS,
  (ms) => morseMachine.setTiming({ letterGapMs: ms }),
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

function positionEarLabel(landmarks: { x: number; y: number }[]): void {
  const w = videoWrap.clientWidth;
  const h = videoWrap.clientHeight;
  if (w === 0 || h === 0) return;

  const ear = averageEar(landmarks);
  earLabel.textContent = `E ${ear.toFixed(3)}`;
  earLabel.style.left = `${w * 0.5}px`;
  earLabel.style.top = `${h * 0.88}px`;
  earLabel.hidden = false;
}

function hideEarLabel(): void {
  earLabel.hidden = true;
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

      positionEarLabel(frame.landmarks);

      const eyes = selfieScreenEyes(frame.landmarks);
      const blink = blinkDetector.update(eyes.screenLeft.ear, eyes.screenRight.ear, now);
      if (blink) {
        morseAudio.play(blink.symbol);
        morseMachine.onBlink(blink, now);
      } else if (headShakeDetector.update(noseOffsetX(frame.landmarks), now)) {
        backspaceOutput();
      }
    } else {
      hideEarLabel();
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
