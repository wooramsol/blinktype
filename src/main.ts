import './styles.css';
import { FaceLandmarkerEngine } from './lib/faceLandmarker';
import { BlinkDetector } from './lib/eyeBlink';
import {
  MorseStateMachine,
  DEFAULT_MORSE_TIMING,
  morseToDisplay,
  type MorseCommitEvent,
} from './lib/morseStateMachine';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="layout">
    <header class="header">
      <h1>Blinktype</h1>
      <p class="subtitle">Detect eye blinks via webcam and type text using Morse code</p>
    </header>

    <main class="main">
      <section class="camera-panel">
        <div class="video-wrap">
          <video id="video" playsinline muted autoplay></video>
          <canvas id="overlay"></canvas>
          <div id="eye-status" class="eye-status">Waiting for camera</div>
        </div>
        <div class="camera-actions">
          <button id="start-btn" class="btn primary">Start camera</button>
          <button id="stop-btn" class="btn" disabled>Stop</button>
          <button id="calibrate-btn" class="btn" disabled>Calibrate (close eyes)</button>
        </div>
        <p class="hint">
          Short blink = <strong>·</strong> (dot) &nbsp;|&nbsp;
          Long blink = <strong>−</strong> (dash) &nbsp;|&nbsp;
          Auto-commit after letter gap
        </p>
      </section>

      <section class="io-panel">
        <div class="status-grid">
          <div class="stat">
            <span class="label">EAR (eye openness)</span>
            <span id="ear-value" class="value">—</span>
          </div>
          <div class="stat">
            <span class="label">Eye state</span>
            <span id="eye-state" class="value">—</span>
          </div>
          <div class="stat wide">
            <span class="label">Current Morse</span>
            <span id="morse-buffer" class="value mono">—</span>
          </div>
          <div class="stat wide">
            <span class="label">Last input</span>
            <span id="last-commit" class="value mono">—</span>
          </div>
        </div>

        <label class="field-label" for="output">Output text</label>
        <textarea id="output" rows="8" placeholder="Decoded Morse text appears here…" spellcheck="false"></textarea>

        <div class="io-actions">
          <button id="backspace-btn" class="btn">Backspace</button>
          <button id="clear-btn" class="btn">Clear all</button>
          <button id="copy-btn" class="btn">Copy</button>
        </div>
      </section>
    </main>

    <details class="settings">
      <summary>Sensitivity settings</summary>
      <div class="settings-grid">
        <label>Closed threshold (EAR) <input id="closed-threshold" type="range" min="0.10" max="0.30" step="0.01" /></label>
        <label>Open threshold (EAR) <input id="open-threshold" type="range" min="0.15" max="0.35" step="0.01" /></label>
        <label>Dot max duration (ms) <input id="dot-max" type="range" min="120" max="500" step="10" /></label>
        <label>Letter gap (ms) <input id="letter-gap" type="range" min="400" max="2000" step="50" /></label>
        <label>Word gap (ms) <input id="word-gap" type="range" min="1200" max="5000" step="100" /></label>
      </div>
    </details>

    <footer class="footer">
      <p>Browser security prevents sending keystrokes to other apps. Text accumulates in this page's input field.</p>
      <p class="cheatsheet">e.g. <code>I</code> = ··· &nbsp; <code>S</code> = ··· &nbsp; <code>O</code> = −−− &nbsp; <code>SOS</code> = ··· −−− ···</p>
    </footer>
  </div>
`;

const video = document.querySelector<HTMLVideoElement>('#video')!;
const overlay = document.querySelector<HTMLCanvasElement>('#overlay')!;
const ctx = overlay.getContext('2d')!;
const output = document.querySelector<HTMLTextAreaElement>('#output')!;
const startBtn = document.querySelector<HTMLButtonElement>('#start-btn')!;
const stopBtn = document.querySelector<HTMLButtonElement>('#stop-btn')!;
const calibrateBtn = document.querySelector<HTMLButtonElement>('#calibrate-btn')!;
const backspaceBtn = document.querySelector<HTMLButtonElement>('#backspace-btn')!;
const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!;
const copyBtn = document.querySelector<HTMLButtonElement>('#copy-btn')!;
const earValue = document.querySelector<HTMLSpanElement>('#ear-value')!;
const eyeState = document.querySelector<HTMLSpanElement>('#eye-state')!;
const morseBufferEl = document.querySelector<HTMLSpanElement>('#morse-buffer')!;
const lastCommitEl = document.querySelector<HTMLSpanElement>('#last-commit')!;
const eyeStatus = document.querySelector<HTMLDivElement>('#eye-status')!;

const closedThresholdInput = document.querySelector<HTMLInputElement>('#closed-threshold')!;
const openThresholdInput = document.querySelector<HTMLInputElement>('#open-threshold')!;
const dotMaxInput = document.querySelector<HTMLInputElement>('#dot-max')!;
const letterGapInput = document.querySelector<HTMLInputElement>('#letter-gap')!;
const wordGapInput = document.querySelector<HTMLInputElement>('#word-gap')!;

let stream: MediaStream | null = null;
let rafId = 0;
let engine: FaceLandmarkerEngine | null = null;
let blinkDetector = new BlinkDetector();
let calibrating = false;
let calibrationSamples: number[] = [];

function insertAtCursor(text: string): void {
  const start = output.selectionStart ?? output.value.length;
  const end = output.selectionEnd ?? output.value.length;
  output.value = output.value.slice(0, start) + text + output.value.slice(end);
  const pos = start + text.length;
  output.selectionStart = pos;
  output.selectionEnd = pos;
  output.focus();
}

const morseMachine = new MorseStateMachine(
  DEFAULT_MORSE_TIMING,
  (event: MorseCommitEvent) => {
    if (event.type === 'space') {
      insertAtCursor(' ');
      lastCommitEl.textContent = '[space]';
    } else {
      insertAtCursor(event.char);
      lastCommitEl.textContent = `${morseToDisplay(event.morse)} → ${event.char}`;
    }
  },
  (buffer) => {
    morseBufferEl.textContent = buffer ? morseToDisplay(buffer) : '—';
  },
);

function applySettingsFromInputs(): void {
  blinkDetector.setConfig({
    closedThreshold: Number(closedThresholdInput.value),
    openThreshold: Number(openThresholdInput.value),
    dotMaxMs: Number(dotMaxInput.value),
  });
  morseMachine.setTiming({
    letterGapMs: Number(letterGapInput.value),
    wordGapMs: Number(wordGapInput.value),
  });
}

function initSettingsInputs(): void {
  const cfg = blinkDetector.getConfig();
  closedThresholdInput.value = String(cfg.closedThreshold);
  openThresholdInput.value = String(cfg.openThreshold);
  dotMaxInput.value = String(cfg.dotMaxMs);
  letterGapInput.value = String(DEFAULT_MORSE_TIMING.letterGapMs);
  wordGapInput.value = String(DEFAULT_MORSE_TIMING.wordGapMs);
  for (const input of [closedThresholdInput, openThresholdInput, dotMaxInput, letterGapInput, wordGapInput]) {
    input.addEventListener('input', applySettingsFromInputs);
  }
}

function resizeOverlay(): void {
  overlay.width = video.videoWidth || 640;
  overlay.height = video.videoHeight || 480;
}

function drawOverlay(ear: number, closed: boolean): void {
  resizeOverlay();
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.fillStyle = closed ? 'rgba(239, 68, 68, 0.35)' : 'rgba(34, 197, 94, 0.2)';
  ctx.fillRect(0, 0, overlay.width, overlay.height);
  const barW = Math.min(overlay.width * 0.5, 220);
  const x = (overlay.width - barW) / 2;
  const y = overlay.height - 28;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x - 4, y - 14, barW + 8, 22);
  ctx.fillStyle = closed ? '#ef4444' : '#22c55e';
  ctx.fillRect(x, y - 10, barW * Math.min(ear / 0.4, 1), 14);
}

async function loop(): Promise<void> {
  if (!engine || !stream) return;
  const now = performance.now();
  const frame = engine.detect(video, now);

  if (frame) {
    const { ear } = frame;
    earValue.textContent = ear.toFixed(3);

    if (calibrating) {
      calibrationSamples.push(ear);
      eyeState.textContent = 'Calibrating (keep eyes closed)';
      eyeStatus.textContent = 'Calibrating…';
    } else {
      const closed = blinkDetector.isClosed() || ear < blinkDetector.getConfig().closedThreshold;
      eyeState.textContent = closed ? 'Closed' : 'Open';
      eyeStatus.textContent = closed ? 'Eyes closed' : 'Eyes open';
      eyeStatus.classList.toggle('closed', closed);

      const blink = blinkDetector.update(ear, now);
      if (blink) {
        morseMachine.onBlink(blink, now);
        lastCommitEl.textContent = `${blink.symbol === 'dot' ? '·' : '−'} (${Math.round(blink.durationMs)}ms)`;
      }
      drawOverlay(ear, closed);
    }
  }
  rafId = requestAnimationFrame(loop);
}

async function startCamera(): Promise<void> {
  startBtn.disabled = true;
  eyeStatus.textContent = 'Loading model…';
  try {
    engine = new FaceLandmarkerEngine();
    await engine.init();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    resizeOverlay();
    stopBtn.disabled = false;
    calibrateBtn.disabled = false;
    eyeStatus.textContent = 'Ready';
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  } catch (err) {
    eyeStatus.textContent = err instanceof Error ? err.message : 'Camera error';
    startBtn.disabled = false;
    stopCamera();
  }
}

function stopCamera(): void {
  cancelAnimationFrame(rafId);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  engine?.close();
  engine = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  calibrateBtn.disabled = true;
  calibrating = false;
  eyeStatus.textContent = 'Stopped';
  ctx.clearRect(0, 0, overlay.width, overlay.height);
}

function startCalibration(): void {
  calibrating = true;
  calibrationSamples = [];
  calibrateBtn.textContent = 'Finish calibration (open eyes)';
  calibrateBtn.onclick = finishCalibration;
}

function finishCalibration(): void {
  calibrating = false;
  calibrateBtn.textContent = 'Calibrate (close eyes)';
  calibrateBtn.onclick = startCalibration;
  if (calibrationSamples.length < 5) return;
  const sorted = [...calibrationSamples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const closed = median + 0.02;
  const open = closed + 0.04;
  blinkDetector.setConfig({ closedThreshold: closed, openThreshold: open });
  closedThresholdInput.value = closed.toFixed(2);
  openThresholdInput.value = open.toFixed(2);
  lastCommitEl.textContent = `Calibration done (closed ${closed.toFixed(2)})`;
}

startBtn.addEventListener('click', () => void startCamera());
stopBtn.addEventListener('click', stopCamera);
calibrateBtn.addEventListener('click', startCalibration);

backspaceBtn.addEventListener('click', () => {
  const start = output.selectionStart ?? output.value.length;
  const end = output.selectionEnd ?? output.value.length;
  if (start === end && start > 0) {
    output.value = output.value.slice(0, start - 1) + output.value.slice(end);
    output.selectionStart = output.selectionEnd = start - 1;
  } else if (start !== end) {
    output.value = output.value.slice(0, start) + output.value.slice(end);
    output.selectionStart = output.selectionEnd = start;
  }
  output.focus();
});

clearBtn.addEventListener('click', () => {
  output.value = '';
  morseMachine.reset();
  morseBufferEl.textContent = '—';
  lastCommitEl.textContent = '—';
  output.focus();
});

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(output.value);
  lastCommitEl.textContent = 'Copied to clipboard';
});

initSettingsInputs();
output.focus();
