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
    </header>

    <main class="main">
      <div class="video-wrap">
        <video id="video" playsinline muted autoplay></video>
        <div class="hud">
          <div id="hud-status" class="hud-line">Waiting for camera</div>
          <div id="hud-ear" class="hud-line">EAR —</div>
          <div id="hud-eye" class="hud-line">Eye —</div>
          <div id="hud-morse" class="hud-line">Morse —</div>
          <div id="hud-last" class="hud-line">Last —</div>
        </div>
        <div class="camera-controls">
          <button id="start-btn" class="btn primary">Start</button>
          <button id="stop-btn" class="btn" disabled>Stop</button>
        </div>
      </div>

      <label class="field-label" for="output">Output text</label>
      <textarea id="output" rows="6" placeholder="Decoded Morse text appears here…" spellcheck="false"></textarea>
    </main>
  </div>
`;

const video = document.querySelector<HTMLVideoElement>('#video')!;
const output = document.querySelector<HTMLTextAreaElement>('#output')!;
const startBtn = document.querySelector<HTMLButtonElement>('#start-btn')!;
const stopBtn = document.querySelector<HTMLButtonElement>('#stop-btn')!;
const hudStatus = document.querySelector<HTMLDivElement>('#hud-status')!;
const hudEar = document.querySelector<HTMLDivElement>('#hud-ear')!;
const hudEye = document.querySelector<HTMLDivElement>('#hud-eye')!;
const hudMorse = document.querySelector<HTMLDivElement>('#hud-morse')!;
const hudLast = document.querySelector<HTMLDivElement>('#hud-last')!;

let stream: MediaStream | null = null;
let rafId = 0;
let engine: FaceLandmarkerEngine | null = null;
const blinkDetector = new BlinkDetector();

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
      hudLast.textContent = 'Last [space]';
    } else {
      insertAtCursor(event.char);
      hudLast.textContent = `Last ${morseToDisplay(event.morse)} → ${event.char}`;
    }
  },
  (buffer) => {
    hudMorse.textContent = buffer ? `Morse ${morseToDisplay(buffer)}` : 'Morse —';
  },
);

async function loop(): Promise<void> {
  if (!engine || !stream) return;
  const now = performance.now();
  const frame = engine.detect(video, now);

  if (frame) {
    const { ear } = frame;
    const closed = blinkDetector.isClosed() || ear < blinkDetector.getConfig().closedThreshold;

    hudEar.textContent = `EAR ${ear.toFixed(3)}`;
    hudEye.textContent = `Eye ${closed ? 'Closed' : 'Open'}`;
    hudEye.classList.toggle('closed', closed);

    const blink = blinkDetector.update(ear, now);
    if (blink) {
      morseMachine.onBlink(blink, now);
      hudLast.textContent = `Last ${blink.symbol === 'dot' ? '·' : '−'} (${Math.round(blink.durationMs)}ms)`;
    }
  }
  rafId = requestAnimationFrame(loop);
}

async function startCamera(): Promise<void> {
  startBtn.disabled = true;
  hudStatus.textContent = 'Loading model…';
  try {
    engine = new FaceLandmarkerEngine();
    await engine.init();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    stopBtn.disabled = false;
    hudStatus.textContent = 'Ready';
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  } catch (err) {
    hudStatus.textContent = err instanceof Error ? err.message : 'Camera error';
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
  hudStatus.textContent = 'Stopped';
  hudEar.textContent = 'EAR —';
  hudEye.textContent = 'Eye —';
  hudEye.classList.remove('closed');
  hudMorse.textContent = 'Morse —';
  hudLast.textContent = 'Last —';
}

startBtn.addEventListener('click', () => void startCamera());
stopBtn.addEventListener('click', stopCamera);

output.focus();
