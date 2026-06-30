/** Classic morse tone timing — dash is 3× dot length (1:3 ratio). */
import { MORSE_DASH_MS, MORSE_DOT_MS } from './morseTiming';

const MORSE_FREQ_HZ = 700;
const DOT_MS = MORSE_DOT_MS;
const DASH_MS = MORSE_DASH_MS;
const PEAK_GAIN = 0.22;

export class MorseAudio {
  private ctx: AudioContext | null = null;

  /** Call from a user gesture so playback is allowed (camera click, etc.). */
  unlock(): void {
    const ctx = this.getContext();
    if (ctx?.state === 'suspended') {
      void ctx.resume();
    }
  }

  play(symbol: 'dot' | 'dash'): void {
    const ctx = this.getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const durationSec = (symbol === 'dot' ? DOT_MS : DASH_MS) / 1000;
    const start = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = MORSE_FREQ_HZ;

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, start + 0.004);
    gain.gain.setValueAtTime(PEAK_GAIN, start + durationSec - 0.008);
    gain.gain.linearRampToValueAtTime(0, start + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + durationSec + 0.02);
  }

  private getContext(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }
}
