import { WebSocketServer } from 'ws';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const PORT = 8765;

async function typeText(text: string): Promise<void> {
  const platform = process.platform;

  if (platform === 'linux') {
    await exec('xdotool', ['type', '--delay', '12', '--', text]);
    return;
  }

  if (platform === 'darwin') {
    for (const ch of text) {
      if (ch === ' ') {
        await exec('osascript', [
          '-e',
          'tell application "System Events" to keystroke space',
        ]);
        continue;
      }
      if (ch === '\n') {
        await exec('osascript', ['-e', 'tell application "System Events" to key code 36']);
        continue;
      }
      const escaped = ch.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await exec('osascript', [
        '-e',
        `tell application "System Events" to keystroke "${escaped}"`,
      ]);
    }
    return;
  }

  if (platform === 'win32') {
    const escaped = text
      .replace(/'/g, "''")
      .replace(/[+^%~()[\]{}]/g, '{$&}');
    await exec('powershell', [
      '-NoProfile',
      '-Command',
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('" +
        escaped +
        "')",
    ]);
    return;
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

const server = new WebSocketServer({ host: '127.0.0.1', port: PORT });

server.on('connection', (socket) => {
  socket.on('message', async (raw) => {
    try {
      const message = JSON.parse(String(raw)) as { type?: string; text?: string };
      if (message.type !== 'type' || !message.text) return;
      await typeText(message.text);
      socket.send(JSON.stringify({ ok: true }));
    } catch (err) {
      socket.send(
        JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : 'Type failed',
        }),
      );
    }
  });
});

console.log(`Blinktype type bridge listening on ws://127.0.0.1:${PORT}`);
