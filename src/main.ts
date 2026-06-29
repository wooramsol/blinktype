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
      <p class="subtitle">웹캠으로 눈 깜빡임을 모스 부호로 인식해 텍스트를 입력합니다</p>
    </header>

    <main class="main">
      <section class="camera-panel">
        <div class="video-wrap">
          <video id="video" playsinline muted autoplay></video>
          <canvas id="overlay"></canvas>
          <div id="eye-status" class="eye-status">카메라 대기 중</div>
        </div>
        <div class="camera-actions">
          <button id="start-btn" class="btn primary">카메라 시작</button>
          <button id="stop-btn" class="btn" disabled>중지</button>
          <button id="calibrate-btn" class="btn" disabled>눈 감고 보정</button>
        </div>
        <p class="hint">
          짧게 깜빡임 = <strong>·</strong> (닷) &nbsp;|&nbsp;
          길게 깜빡임 = <strong>−</strong> (대시) &nbsp;|&nbsp;
          문자 간격 후 자동 입력
        </p>
      </section>

      <section class="io-panel">
        <div class="status-grid">
          <div class="stat">
            <span class="label">EAR (눈 개폐)</span>
            <span id="ear-value" class="value">—</span>
          </div>
          <div class="stat">
            <span class="label">눈 상태</span>
            <span id="eye-state" class="value">—</span>
          </div>
          <div class="stat wide">
            <span class="label">현재 모스</span>
            <span id="morse-buffer" class="value mono">—</span>
          </div>
          <div class="stat wide">
            <span class="label">마지막 입력</span>
            <span id="last-commit" class="value mono">—</span>
          </div>
        </div>

        <label class="field-label" for="output">입력 텍스트</label>
        <textarea id="output" rows="8" placeholder="여기에 모스 부호가 해독되어 입력됩니다…" spellcheck="false"></textarea>

        <div class="io-actions">
          <button id="backspace-btn" class="btn">백스페이스</button>
          <button id="clear-btn" class="btn">전체 지우기</button>
          <button id="copy-btn" class="btn">복사</button>
        </div>
      </section>
    </main>

    <details class="settings">
      <summary>감도 설정</summary>
      <div class="settings-grid">
        <label>닫힘 임계값 (EAR) <input id="closed-threshold" type="range" min="0.10" max="0.30" step="0.01" /></label>
        <label>열림 임계값 (EAR) <input id="open-threshold" type="range" min="0.15" max="0.35" step="0.01" /></label>
        <label>닷 최대 시간 (ms) <input id="dot-max" type="range" min="120" max="500" step="10" /></label>
        <label>문자 간격 (ms) <input id="letter-gap" type="range" min="400" max="2000" step="50" /></label>
        <label>단어 간격 (ms) <input id="word-gap" type="range" min="1200" max="5000" step="100" /></label>
      </div>
    </details>

    <footer class="footer">
      <p>브라우저 보안상 다른 앱으로 키 입력을 보낼 수 없습니다. 이 페이지의 입력창에 텍스트가 쌓입니다.</p>
      <p class="cheatsheet">예: <code>I</code> = ··· &nbsp; <code>S</code> = ··· &nbsp; <code>O</code> = −−− &nbsp; <code>SOS</code> = ··· −−− ···</p>
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
      lastCommitEl.textContent = '[공백]';
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
      eyeState.textContent = '보정 중 (눈 감은 상태 유지)';
      eyeStatus.textContent = '보정 중…';
    } else {
      const closed = blinkDetector.isClosed() || ear < blinkDetector.getConfig().closedThreshold;
      eyeState.textContent = closed ? '감음' : '뜸';
      eyeStatus.textContent = closed ? '눈 감음' : '눈 뜸';
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
  eyeStatus.textContent = '모델 로딩 중…';
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
    eyeStatus.textContent = '준비 완료';
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  } catch (err) {
    eyeStatus.textContent = err instanceof Error ? err.message : '카메라 오류';
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
  eyeStatus.textContent = '중지됨';
  ctx.clearRect(0, 0, overlay.width, overlay.height);
}

function startCalibration(): void {
  calibrating = true;
  calibrationSamples = [];
  calibrateBtn.textContent = '보정 완료 (눈 뜨기)';
  calibrateBtn.onclick = finishCalibration;
}

function finishCalibration(): void {
  calibrating = false;
  calibrateBtn.textContent = '눈 감고 보정';
  calibrateBtn.onclick = startCalibration;
  if (calibrationSamples.length < 5) return;
  const sorted = [...calibrationSamples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const closed = median + 0.02;
  const open = closed + 0.04;
  blinkDetector.setConfig({ closedThreshold: closed, openThreshold: open });
  closedThresholdInput.value = closed.toFixed(2);
  openThresholdInput.value = open.toFixed(2);
  lastCommitEl.textContent = `보정 완료 (닫힘 ${closed.toFixed(2)})`;
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
  lastCommitEl.textContent = '클립보드에 복사됨';
});

initSettingsInputs();
output.focus();
