import './styles.css';
import { FaceLandmarkerEngine } from './lib/faceLandmarker';
import { BlinkDetector, eyeHudAnchor, minEar, averageEar } from './lib/eyeBlink';
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
        <div id="ear-label" class="ear-label" hidden>EAR —</div>
        <div id="camera-error" class="camera-error" hidden></div>
      </div>

      <label class="field-label" for="output">Output text</label>
      <textarea id="output" rows="6" placeholder="Blink to type Morse code…" spellcheck="false"></textarea>
    </main>
  </div>
`;

const video = document.querySelector<HTMLVideoElement>('#video')!;
const output = document.querySelector<HTMLTextAreaElement>('#output')!;
const earLabel = document.querySelector<HTMLDivElement>('#ear-label')!;
const cameraError = document.querySelector<HTMLDivElement>('#camera-error')!;

let stream: MediaStream | null = null;
let rafId = 0;
let engine: FaceLandmarkerEngine | null = null;
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
    if (event.type === 'space') {
      committedText += ' ';
    } else {
      committedText += event.char;
    }
    pendingBuffer = '';
    syncOutput();
  },
  (buffer) => {
    pendingBuffer = buffer;
    syncOutput();
  },
);

function positionEarLabel(landmarks: { x: number; y: number }[]): void {
  const anchor = eyeHudAnchor(landmarks);
  earLabel.style.left = `${(1 - anchor.x) * 100}%`;
  earLabel.style.top = `${anchor.y * 100}%`;
  earLabel.hidden = false;
}

async function loop(): Promise<void> {
  if (!engine || !stream) return;
  const now = performance.now();
  const frame = engine.detect(video, now);

  if (frame) {
    const displayEar = averageEar(frame.landmarks);
    const trackEar = minEar(frame.landmarks);

    earLabel.textContent = `EAR ${displayEar.toFixed(3)}`;
    positionEarLabel(frame.landmarks);

    const blink = blinkDetector.update(trackEar, now);
    if (blink) {
      morseMachine.onBlink(blink, now);
    }
  } else {
    earLabel.hidden = true;
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
    cameraError.hidden = true;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  } catch (err) {
    cameraError.textContent = err instanceof Error ? err.message : 'Camera error';
    cameraError.hidden = false;
    earLabel.hidden = true;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    engine?.close();
    engine = null;
  }
}

output.addEventListener('input', onUserEdit);

void startCamera();
