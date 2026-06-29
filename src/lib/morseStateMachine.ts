import { decodeMorse } from './morse';
import type { BlinkEvent } from './eyeBlink';

export interface MorseTimingConfig {
  letterGapMs: number;
}

export const DEFAULT_MORSE_TIMING: MorseTimingConfig = {
  letterGapMs: 350,
};

export interface MorseCommitEvent {
  type: 'letter' | 'space' | 'unknown';
  morse: string;
  char: string;
}

export class MorseStateMachine {
  private buffer = '';
  private letterTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private timing: MorseTimingConfig = DEFAULT_MORSE_TIMING,
    private onCommit: (event: MorseCommitEvent) => void,
    private onBufferChange: (buffer: string) => void,
  ) {}

  onBlink(event: BlinkEvent, _now = performance.now()): void {
    this.clearTimers();
    this.buffer += event.symbol === 'dot' ? '.' : '-';
    this.onBufferChange(this.buffer);
    this.scheduleLetterCommit();
  }

  onMouthSpace(_now = performance.now()): void {
    this.commitLetter();
    this.onCommit({ type: 'space', morse: '', char: ' ' });
    this.clearTimers();
  }

  private scheduleLetterCommit(): void {
    this.letterTimer = setTimeout(() => this.commitLetter(), this.timing.letterGapMs);
  }

  private commitLetter(): void {
    if (!this.buffer) return;
    const morse = this.buffer;
    const decoded = decodeMorse(morse);
    this.buffer = '';
    this.onBufferChange('');

    if (decoded) {
      this.onCommit({ type: 'letter', morse, char: decoded });
    } else {
      this.onCommit({ type: 'unknown', morse, char: '?' });
    }

    this.clearTimers();
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
    this.letterTimer = null;
  }
}

export { morseToDisplay } from './morse';
