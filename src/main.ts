import './styles.css';
import { CalibrationSession, openCalibrationTiming, type TimingSnapshot } from './lib/calibration';
import { FaceLandmarkerEngine } from './lib/faceLandmarker';
import { BlinkDetector, averageEar, selfieEarHudPixels, selfieScreenEyes } from './lib/eyeBlink';
import { clearFaceOverlay, drawFaceOverlay, resizeOverlayCanvas } from './lib/faceOverlay';
import { HeadShakeDetector, noseOffsetX } from './lib/headShake';
import { wordMorseHint } from './lib/morse';
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
      <div class="title-actions">
        <button type="button" id="calibrate-btn" class="calibrate-btn">cal</button>
        <span class="credit">@wooramsol</span>
      </div>
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
      <div id="calibration-hud" class="calibration-hud" hidden>
        <div id="cal-target" class="cal-target"></div>
        <div id="cal-morse" class="cal-morse"></div>
        <div id="cal-meta" class="cal-meta"></div>
      </div>
      <div class="video-mirror">
        <video id="video" autoplay muted playsinline webkit-playsinline></video>
        <canvas id="overlay"></canvas>
      </div>
      <div id="ear-label" class="ear-label ear-hud-left" hidden>E —</div>
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
const calibrateBtn = document.querySelector<HTMLButtonElement>('#calibrate-btn')!;
const calibrationHud = document.querySelector<HTMLDivElement>('#calibration-hud')!;
const calTarget = document.querySelector<HTMLDivElement>('#cal-target')!;
const calMorse = document.querySelector<HTMLDivElement>('#cal-morse')!;
const calMeta = document.querySelector<HTMLDivElement>('#cal-meta')!;
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

function setSlider(
  input: HTMLInputElement,
  valEl: HTMLSpanElement,
  key: string,
  value: number,
  onChange: (ms: number) => void,
  persist: boolean,
): void {
  input.value = String(value);
  valEl.textContent = String(value);
  onChange(value);
  if (persist) localStorage.setItem(key, String(value));
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
  setSlider(input, valEl, key, initial, onChange, false);
  input.addEventListener('input', () => {
    const ms = Number(input.value);
    setSlider(input, valEl, key, ms, onChange, true);
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
const calibrationSession = new CalibrationSession();
let calibrationActive = false;
let savedTimingBeforeCal: TimingSnapshot | null = null;
let accumulatedTuning: TimingSnapshot | null = null;
let committedText = '';
let pendingBuffer = '';

function getTimingSnapshot(): TimingSnapshot {
  return {
    dotMaxMs: Number(dotMaxMsInput.value),
    letterGapMs: Number(letterGapMsInput.value),
    cooldownMs: Number(cooldownMsInput.value),
    minBlinkMs: Number(minBlinkMsInput.value),
    earClosed: Number(earClosedInput.value),
  };
}

function applyDetection(snapshot: TimingSnapshot): void {
  const closed = snapshot.earClosed / 1000;
  blinkDetector.setConfig({
    dotMaxMs: snapshot.dotMaxMs,
    cooldownMs: snapshot.cooldownMs,
    minBlinkMs: snapshot.minBlinkMs,
    closedThreshold: closed,
    rearmThreshold: closed + EAR_REARM_DELTA,
  });
  morseMachine.setTiming({ letterGapMs: snapshot.letterGapMs });
}

function applyTimingSnapshot(snapshot: TimingSnapshot, persist = true): void {
  applyDetection(snapshot);
  setSlider(
    dotMaxMsInput,
    dotMaxMsVal,
    DOT_MAX_MS_KEY,
    snapshot.dotMaxMs,
    (ms) => blinkDetector.setConfig({ dotMaxMs: ms }),
    persist,
  );
  setSlider(
    letterGapMsInput,
    letterGapMsVal,
    LETTER_GAP_MS_KEY,
    snapshot.letterGapMs,
    (ms) => morseMachine.setTiming({ letterGapMs: ms }),
    persist,
  );
  setSlider(
    cooldownMsInput,
    cooldownMsVal,
    COOLDOWN_MS_KEY,
    snapshot.cooldownMs,
    (ms) => blinkDetector.setConfig({ cooldownMs: ms }),
    persist,
  );
  setSlider(
    minBlinkMsInput,
    minBlinkMsVal,
    MIN_BLINK_MS_KEY,
    snapshot.minBlinkMs,
    (ms) => blinkDetector.setConfig({ minBlinkMs: ms }),
    persist,
  );
  setSlider(
    earClosedInput,
    earClosedVal,
    EAR_CLOSED_KEY,
    snapshot.earClosed,
    (v) => {
      const c = v / 1000;
      blinkDetector.setConfig({
        closedThreshold: c,
        rearmThreshold: c + EAR_REARM_DELTA,
      });
    },
    persist,
  );
}

function applyOpenCalibrationDetection(): void {
  applyDetection(openCalibrationTiming());
}

function updateCalibrationHud(note = ''): void {
  if (!calibrationActive) return;
  const word = calibrationSession.currentWord;
  calTarget.textContent = word ? `type: ${word}` : 'done';
  calMorse.textContent = word ? wordMorseHint(word) : '';
  calMeta.textContent = [
    `round ${calibrationSession.roundNumber}/${calibrationSession.totalRounds}`,
    calibrationSession.progressLabel,
    note,
  ]
    .filter(Boolean)
    .join('  ·  ');
}

function startCalibration(): void {
  calibrationActive = true;
  savedTimingBeforeCal = getTimingSnapshot();
  accumulatedTuning = { ...savedTimingBeforeCal };
  calibrationSession.reset();
  morseMachine.reset();
  pendingBuffer = '';
  syncOutput();
  applyOpenCalibrationDetection();
  calibrationHud.hidden = false;
  videoWrap.classList.add('calibrating');
  calibrateBtn.textContent = 'done';
  calibrateBtn.classList.add('active');
  updateCalibrationHud('blink the word · Enter when done');
}

function submitCalibrationRound(): void {
  if (!calibrationActive) return;

  morseMachine.flush();

  if (!calibrationSession.hasAttempts()) {
    updateCalibrationHud('blink the word, then press Enter');
    return;
  }

  const baseline = accumulatedTuning ?? getTimingSnapshot();
  const result = calibrationSession.finishRound(baseline);
  accumulatedTuning = result.tuning;
  applyTimingSnapshot(result.tuning, true);
  applyOpenCalibrationDetection();
  morseMachine.reset();
  pendingBuffer = '';
  updateCalibrationHud(`${result.accuracy}% · sliders updated`);

  if (!calibrationSession.active) {
    stopCalibration(`calibration complete · avg ${calibrationSession.overallAccuracy()}%`);
    return;
  }

  window.setTimeout(() => {
    if (calibrationActive) updateCalibrationHud('blink the word · Enter when done');
  }, 1200);
}

function stopCalibration(message = ''): void {
  const hadRounds = calibrationSession.results.length > 0;
  calibrationActive = false;
  calibrationHud.hidden = true;
  videoWrap.classList.remove('calibrating');
  calibrateBtn.textContent = 'cal';
  calibrateBtn.classList.remove('active');
  morseMachine.reset();
  pendingBuffer = '';

  if (hadRounds && accumulatedTuning) {
    applyTimingSnapshot(accumulatedTuning, true);
  } else if (savedTimingBeforeCal) {
    applyTimingSnapshot(savedTimingBeforeCal, false);
  }

  savedTimingBeforeCal = null;
  accumulatedTuning = null;
  syncOutput();

  if (message) {
    calMeta.textContent = message;
    calibrationHud.hidden = false;
    window.setTimeout(() => {
      if (!calibrationActive) calibrationHud.hidden = true;
    }, 2800);
  }
}

function onCalibrationLetter(event: MorseCommitEvent): void {
  calibrationSession.onLetterCommit(event.char, event.morse);
  updateCalibrationHud();
}

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
  if (calibrationActive) return;

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
    if (calibrationActive) {
      onCalibrationLetter(event);
      pendingBuffer = '';
      return;
    }
    committedText += event.char.toLowerCase();
    pendingBuffer = '';
    syncOutput();
  },
  (buffer) => {
    pendingBuffer = buffer;
    if (calibrationActive) return;
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
  if (calibrationActive) {
    morseMachine.reset();
    pendingBuffer = '';
    updateCalibrationHud();
    return;
  }

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
  const { screenLeft } = selfieEarHudPixels(landmarks, w, h);

  earLabel.textContent = `E ${ear.toFixed(3)}`;
  earLabel.style.left = `${screenLeft.x}px`;
  earLabel.style.top = `${screenLeft.y}px`;
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
        if (calibrationActive) calibrationSession.recordBlink(blink);
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

calibrateBtn.addEventListener('click', () => {
  morseAudio.unlock();
  if (calibrationActive) {
    stopCalibration();
    return;
  }
  startCalibration();
});

document.addEventListener('keydown', (e) => {
  if (!calibrationActive || e.key !== 'Enter' || e.repeat) return;
  e.preventDefault();
  submitCalibrationRound();
});

videoWrap.addEventListener('click', () => {
  morseAudio.unlock();
  if (!stream && !starting) void startCamera();
});

output.addEventListener('input', onUserEdit);

void startCamera();
