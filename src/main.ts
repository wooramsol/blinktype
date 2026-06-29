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
          <div id="hud-ear" class="hud-line">EAR —</div>
          <div id="hud-eye" class="hud-line">Eye —</div>
        </div>
      </div>

      <label class="field-label" for="output">Output text</label>
      <textarea id="output" rows="6" placeholder="Blink to type Morse code…" spellcheck="false" readonly></textarea>
    </main>
  </div>
`;

const video = document.querySelector<HTMLVideoElement>('#video')!;
const output = document.querySelector<HTMLTextAreaElement>('#output')!;
const hudEar = document.querySelector<HTMLDivElement>('#hud-ear')!;
const hudEye = document.querySelector<HTMLDivElement>('#hud-eye')!;

let stream: MediaStream | null = null;
let rafId = 0;
let engine: FaceLandmarkerEngine | null = null;
const blinkDetector = new BlinkDetector();
let committedText = '';

function renderOutput(pendingBuffer = ''): void {
  output.value = committedText + (pendingBuffer ? morseToDisplay(pendingBuffer) : '');
  output.scrollTop = output.scrollHeight;
}

const morseMachine = new MorseStateMachine(
  DEFAULT_MORSE_TIMING,
  (event: MorseCommitEvent) => {
    if (event.type === 'space') {
      committedText += ' ';
    } else {
      committedText += event.char;
    }
    renderOutput();
  },
  (buffer) => {
    renderOutput(buffer);
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
    }
  }
  rafId = requestAnimationFrame(loop);
}

async function startCamera(): Promise<void> {
  try {
    engine = new FaceLandmarkerEngine();
    await engine.init();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  } catch (err) {
    hudEye.textContent = err instanceof Error ? err.message : 'Camera error';
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    engine?.close();
    engine = null;
  }
}

void startCamera();
