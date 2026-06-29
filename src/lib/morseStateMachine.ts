import { decodeMorse } from './morse';
import type { BlinkEvent } from './eyeBlink';

export interface MorseTimingConfig {
  letterGapMs: number;
  wordGapMs: number;
}

export const DEFAULT_MORSE_TIMING: MorseTimingConfig = {
  letterGapMs: 900,
  wordGapMs: 2400,
};

export interface MorseCommitEvent {
  type: 'letter' | 'space' | 'unknown';
  morse: string;
  char: string;
}

export class MorseStateMachine {
  private buffer = '';
  private lastEventAt = 0;
  private letterTimer: ReturnType<typeof setTimeout> | null = null;
  private wordTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private timing: MorseTimingConfig = DEFAULT_MORSE_TIMING,
    private onCommit: (event: MorseCommitEvent) => void,
    private onBufferChange: (buffer: string) => void,
  ) {}

  onBlink(event: BlinkEvent, now = performance.now()): void {
    this.clearTimers();
    this.buffer += event.symbol === 'dot' ? '.' : '-';
    this.lastEventAt = now;
    this.onBufferChange(this.buffer);
    this.scheduleLetterCommit();
    this.scheduleWordGap();
  }

  private scheduleLetterCommit(): void {
    this.letterTimer = setTimeout(() => this.commitLetter(), this.timing.letterGapMs);
  }

  private scheduleWordGap(): void {
    this.wordTimer = setTimeout(() => {
      const idle = performance.now() - this.lastEventAt;
      if (idle >= this.timing.wordGapMs && !this.buffer) {
        this.onCommit({ type: 'space', morse: '', char: ' ' });
      }
    }, this.timing.wordGapMs);
  }

  private commitLetter(): void {
    if (!this.buffer) return;
    const morse = this.buffer;
    const decoded = decodeMorse(morse);
    this.buffer = '';
    this.onBufferChange('');
    this.lastEventAt = performance.now();

    if (decoded) {
      this.onCommit({ type: 'letter', morse, char: decoded });
    } else {
      this.onCommit({ type: 'unknown', morse, char: '?' });
    }
  }

  reset(): void {
    this.clearTimers();
    this.buffer = '';
    this.onBufferChange('');
  }

  setTiming(timing: Partial<MorseTimingConfig>): void {
    this.timing = { ...this.timing, ...timing };
  }

  private clearTimers(): void {
    if (this.letterTimer) clearTimeout(this.letterTimer);
    if (this.wordTimer) clearTimeout(this.wordTimer);
    this.letterTimer = null;
    this.wordTimer = null;
  }
}

export { morseToDisplay } from './morse';
