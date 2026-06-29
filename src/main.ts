import './styles.css';
import { FaceLandmarkerEngine } from './lib/faceLandmarker';
import { BlinkDetector, faceSideHudAnchor } from './lib/eyeBlink';
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
      <div id="video-wrap" class="video-wrap">
        <video id="video" playsinline muted autoplay></video>
        <div id="ear-label" class="ear-label" hidden>EAR —</div>
        <div id="camera-prompt" class="camera-prompt" hidden>Tap to start camera</div>
        <div id="camera-error" class="camera-error" hidden></div>
      </div>

      <label class="field-label" for="output">Output text</label>
      <textarea id="output" rows="6" placeholder="Blink to type Morse code…" spellcheck="false"></textarea>
    </main>
  </div>
`;

const videoWrap = document.querySelector<HTMLDivElement>('#video-wrap')!;
const video = document.querySelector<HTMLVideoElement>('#video')!;
const output = document.querySelector<HTMLTextAreaElement>('#output')!;
const earLabel = document.querySelector<HTMLDivElement>('#ear-label')!;
const cameraPrompt = document.querySelector<HTMLDivElement>('#camera-prompt')!;
const cameraError = document.querySelector<HTMLDivElement>('#camera-error')!;

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

function showCameraError(message: string): void {
  cameraError.textContent = message;
  cameraError.hidden = false;
  cameraPrompt.hidden = true;
  earLabel.hidden = true;
}

function hideOverlays(): void {
  cameraError.hidden = true;
  cameraPrompt.hidden = true;
}

async function loadModel(): Promise<void> {
  if (modelReady || engine) return;
  try {
    engine = new FaceLandmarkerEngine();
    await engine.init();
    modelReady = true;
  } catch (err) {
    engine?.close();
    engine = null;
    modelReady = false;
    earLabel.textContent =
      err instanceof Error ? `Model error: ${err.message}` : 'Model error';
    earLabel.style.left = '50%';
    earLabel.style.top = '12px';
    earLabel.style.transform = 'translate(-50%, 0)';
    earLabel.hidden = false;
  }
}

async function loop(): Promise<void> {
  if (stream) {
    const now = performance.now();
    if (modelReady && engine) {
      const frame = engine.detect(video, now);
      if (frame) {
        earLabel.textContent = `EAR ${frame.ear.toFixed(3)}`;
        positionEarLabel(frame.landmarks);

        const blink = blinkDetector.update(frame.ear, now);
        if (blink) {
          morseMachine.onBlink(blink, now);
        }
      } else {
        earLabel.hidden = true;
      }
    }
  }

  rafId = requestAnimationFrame(loop);
}

async function startCamera(): Promise<void> {
  if (starting || stream) return;
  starting = true;
  cameraPrompt.hidden = true;
  cameraError.hidden = true;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    video.muted = true;

    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 2) {
        resolve();
        return;
      }
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Video failed to load'));
    });

    await video.play();
    hideOverlays();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);

    void loadModel();
  } catch (err) {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;

    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      cameraPrompt.hidden = false;
      cameraError.hidden = true;
    } else {
      showCameraError(err instanceof Error ? err.message : 'Camera error');
    }
  } finally {
    starting = false;
  }
}

videoWrap.addEventListener('click', () => {
  if (!stream && !starting) void startCamera();
});

output.addEventListener('input', onUserEdit);

void startCamera();
