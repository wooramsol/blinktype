import { decodeMorse } from './morse';
import type { BlinkEvent } from './eyeBlink';
import { durationsToMorse, dotDurationsFromMorse, nextDotBaseline } from './morseClassify';
import { DASH_RATIO_DEFAULT, MORSE_LETTER_GAP_MS } from './morseTiming';

export interface MorseTimingConfig {
  letterGapMs: number;
  dashRatio: number;
}

export const DEFAULT_MORSE_TIMING: MorseTimingConfig = {
  letterGapMs: MORSE_LETTER_GAP_MS,
  dashRatio: DASH_RATIO_DEFAULT,
};

export interface MorseCommitEvent {
  type: 'letter' | 'unknown';
  morse: string;
  char: string;
  dotDurationsMs: number[];
}

export class MorseStateMachine {
  private durations: number[] = [];
  private priorDotBaseline: number | undefined;
  private dotSamples: number[] = [];
  /** When > 0, commit the buffer once performance.now() reaches this time. */
  private letterDeadline = 0;

  constructor(
    private timing: MorseTimingConfig = DEFAULT_MORSE_TIMING,
    private onCommit: (event: MorseCommitEvent) => void,
  ) {}

  onBlink(event: BlinkEvent, now = performance.now()): void {
    this.durations.push(event.durationMs);
    this.letterDeadline = now + this.timing.letterGapMs;
  }

  /** Call every animation frame; letter gap is fixed and never shortens over time. */
  tick(now = performance.now()): void {
    if (this.letterDeadline > 0 && now >= this.letterDeadline) {
      this.letterDeadline = 0;
      this.commitLetter();
    }
  }

  private commitLetter(): void {
    if (this.durations.length === 0) return;

    const morse = durationsToMorse(
      this.durations,
      this.timing.dashRatio,
      this.priorDotBaseline,
    );
    const dotDurationsMs = dotDurationsFromMorse(this.durations, morse);
    for (const ms of dotDurationsMs) {
      this.dotSamples.push(ms);
    }
    this.priorDotBaseline = nextDotBaseline(
      this.durations,
      morse,
      this.timing.dashRatio,
      this.priorDotBaseline,
    );
    this.durations = [];

    const decoded = decodeMorse(morse);
    if (decoded) {
      this.onCommit({ type: 'letter', morse, char: decoded, dotDurationsMs });
    } else {
      this.onCommit({ type: 'unknown', morse, char: '?', dotDurationsMs });
    }
  }

  /** Commit any in-progress letter immediately (e.g. before inserting a space). */
  flush(): void {
    if (this.durations.length === 0) return;
    this.letterDeadline = 0;
    this.commitLetter();
  }

  reset(): void {
    this.letterDeadline = 0;
    this.durations = [];
  }

  hasPendingLetter(): boolean {
    return this.durations.length > 0;
  }

  getAverageDotMs(): number | null {
    if (this.dotSamples.length === 0) return null;
    const sum = this.dotSamples.reduce((a, b) => a + b, 0);
    return sum / this.dotSamples.length;
  }

  setTiming(timing: Partial<MorseTimingConfig>): void {
    this.timing = { ...this.timing, ...timing };
  }
}

export { morseToDisplay } from './morse';
