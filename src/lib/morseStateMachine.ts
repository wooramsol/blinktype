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
  /** When > 0, commit the buffer once performance.now() reaches this time. */
  private letterDeadline = 0;

  constructor(
    private timing: MorseTimingConfig = DEFAULT_MORSE_TIMING,
    private onCommit: (event: MorseCommitEvent) => void,
    private onBufferChange: (buffer: string) => void,
  ) {}

  onBlink(event: BlinkEvent, now = performance.now()): void {
    this.buffer += event.symbol === 'dot' ? '.' : '-';
    this.onBufferChange(this.buffer);
    this.letterDeadline = now + this.timing.letterGapMs;
  }

  onMouthSpace(_now = performance.now()): void {
    this.letterDeadline = 0;
    this.commitLetter();
    this.onCommit({ type: 'space', morse: '', char: ' ' });
  }

  /** Call every animation frame; letter gap is fixed and never shortens over time. */
  tick(now = performance.now()): void {
    if (this.letterDeadline > 0 && now >= this.letterDeadline) {
      this.letterDeadline = 0;
      this.commitLetter();
    }
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
  }

  reset(): void {
    this.letterDeadline = 0;
    this.buffer = '';
    this.onBufferChange('');
  }

  setTiming(timing: Partial<MorseTimingConfig>): void {
    this.timing = { ...this.timing, ...timing };
  }
}

export { morseToDisplay } from './morse';
