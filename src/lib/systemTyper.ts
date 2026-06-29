const BRIDGE_URL = 'ws://127.0.0.1:8765';
const RETRY_MS = 3000;

let socket: WebSocket | null = null;
let retryTimer = 0;
let connected = false;

type StatusListener = (connected: boolean) => void;
const listeners = new Set<StatusListener>();

function notify(): void {
  for (const listener of listeners) {
    listener(connected);
  }
}

function scheduleReconnect(): void {
  if (retryTimer) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = 0;
    connectSystemTyper();
  }, RETRY_MS);
}

export function onSystemTyperStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  listener(connected);
  return () => listeners.delete(listener);
}

export function isSystemTyperConnected(): boolean {
  return connected;
}

export function connectSystemTyper(): void {
  if (socket && socket.readyState === WebSocket.OPEN) return;

  try {
    socket = new WebSocket(BRIDGE_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.addEventListener('open', () => {
    connected = true;
    notify();
  });

  socket.addEventListener('close', () => {
    connected = false;
    notify();
    socket = null;
    scheduleReconnect();
  });

  socket.addEventListener('error', () => {
    socket?.close();
  });
}

export function typeSystemText(text: string): boolean {
  if (!text || !socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({ type: 'type', text }));
  return true;
}

export function insertIntoFocusedField(text: string, skip?: HTMLElement): boolean {
  const el = document.activeElement;
  if (!el || el === skip) return false;

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const pos = start + text.length;
    el.selectionStart = pos;
    el.selectionEnd = pos;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  if (el instanceof HTMLElement && el.isContentEditable) {
    el.focus();
    document.execCommand('insertText', false, text);
    return true;
  }

  return false;
}
