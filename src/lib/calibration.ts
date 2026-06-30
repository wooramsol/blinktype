import type { BlinkEvent } from './eyeBlink';
import { encodeLetter, encodeWordMorse, morseToDisplay } from './morse';
import {
  COOLDOWN_MS_DEFAULT,
  COOLDOWN_MS_SLIDER_MAX,
  COOLDOWN_MS_SLIDER_MIN,
  DOT_MAX_MS_SLIDER_MAX,
  DOT_MAX_MS_SLIDER_MIN,
  EAR_CLOSED_DEFAULT,
  EAR_CLOSED_SLIDER_MAX,
  EAR_CLOSED_SLIDER_MIN,
  LETTER_GAP_MS_SLIDER_MAX,
  LETTER_GAP_MS_SLIDER_MIN,
  LETTER_GAP_MS_SLIDER_STEP,
  MIN_BLINK_MS_DEFAULT,
  MIN_BLINK_MS_SLIDER_MAX,
  MIN_BLINK_MS_SLIDER_MIN,
  MORSE_DOT_DASH_THRESHOLD_MS,
  MORSE_LETTER_GAP_MS,
} from './morseTiming';

/** Words that mix dots, dashes, and multi-letter rhythm. */
export const CALIBRATION_WORDS = ['RAT', 'PAR', 'ACE', 'NET', 'MOM'] as const;

export interface TimingSnapshot {
  dotMaxMs: number;
  letterGapMs: number;
  cooldownMs: number;
  minBlinkMs: number;
  earClosed: number;
}

export interface LetterAttempt {
  expected: string;
  expectedMorse: string;
  got: string;
  gotMorse: string;
  blinks: BlinkEvent[];
}

export interface CalibrationRoundResult {
  word: string;
  attempts: LetterAttempt[];
  allBlinks: BlinkEvent[];
  accuracy: number;
  tuning: TimingSnapshot;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function roundStep(n: number, step: number): number {
  return Math.round(n / step) * step;
}

export function defaultTimingSnapshot(): TimingSnapshot {
  return {
    dotMaxMs: MORSE_DOT_DASH_THRESHOLD_MS,
    letterGapMs: MORSE_LETTER_GAP_MS,
    cooldownMs: COOLDOWN_MS_DEFAULT,
    minBlinkMs: MIN_BLINK_MS_DEFAULT,
    earClosed: EAR_CLOSED_DEFAULT,
  };
}

/** Permissive detection during calibration — capture every blink. */
export function openCalibrationTiming(): TimingSnapshot {
  return {
    dotMaxMs: DOT_MAX_MS_SLIDER_MAX,
    letterGapMs: LETTER_GAP_MS_SLIDER_MAX,
    cooldownMs: COOLDOWN_MS_SLIDER_MIN,
    minBlinkMs: MIN_BLINK_MS_SLIDER_MIN,
    earClosed: EAR_CLOSED_SLIDER_MAX,
  };
}

function alignedDurations(
  blinks: BlinkEvent[],
  word: string,
): { dotDurations: number[]; dashDurations: number[] } {
  const expected = encodeWordMorse(word).join('').split('');
  const dotDurations: number[] = [];
  const dashDurations: number[] = [];
  const n = Math.min(blinks.length, expected.length);
  for (let i = 0; i < n; i++) {
    if (expected[i] === '.') dotDurations.push(blinks[i].durationMs);
    else dashDurations.push(blinks[i].durationMs);
  }
  return { dotDurations, dashDurations };
}

export function computeTuning(
  baseline: TimingSnapshot,
  word: string,
  attempts: LetterAttempt[],
  allBlinks: BlinkEvent[],
): TimingSnapshot {
  const next = { ...baseline };

  const { dotDurations, dashDurations } = alignedDurations(allBlinks, word);

  if (dotDurations.length > 0 && dashDurations.length > 0) {
    const maxDot = Math.max(...dotDurations);
    const minDash = Math.min(...dashDurations);
    if (minDash > maxDot) {
      next.dotMaxMs = clamp(
        roundStep((maxDot + minDash) / 2, 10),
        DOT_MAX_MS_SLIDER_MIN,
        DOT_MAX_MS_SLIDER_MAX,
      );
    } else {
      const all = allBlinks.map((b) => b.durationMs).sort((a, b) => a - b);
      const mid = all[Math.floor(all.length / 2)] ?? baseline.dotMaxMs;
      next.dotMaxMs = clamp(roundStep(mid, 10), DOT_MAX_MS_SLIDER_MIN, DOT_MAX_MS_SLIDER_MAX);
    }
  } else if (dotDurations.length > 1) {
    next.dotMaxMs = clamp(
      roundStep(Math.max(...dotDurations) * 1.15, 10),
      DOT_MAX_MS_SLIDER_MIN,
      DOT_MAX_MS_SLIDER_MAX,
    );
  } else if (dashDurations.length > 1) {
    next.dotMaxMs = clamp(
      roundStep(Math.min(...dashDurations) * 0.85, 10),
      DOT_MAX_MS_SLIDER_MIN,
      DOT_MAX_MS_SLIDER_MAX,
    );
  }

  const expectedSymbols = encodeWordMorse(word).join('').length;

  if (allBlinks.length < expectedSymbols) {
    next.cooldownMs = clamp(next.cooldownMs - 25, COOLDOWN_MS_SLIDER_MIN, COOLDOWN_MS_SLIDER_MAX);
    next.minBlinkMs = clamp(next.minBlinkMs - 8, MIN_BLINK_MS_SLIDER_MIN, MIN_BLINK_MS_SLIDER_MAX);
    next.earClosed = clamp(next.earClosed + 15, EAR_CLOSED_SLIDER_MIN, EAR_CLOSED_SLIDER_MAX);
  } else if (allBlinks.length > expectedSymbols) {
    next.cooldownMs = clamp(next.cooldownMs + 20, COOLDOWN_MS_SLIDER_MIN, COOLDOWN_MS_SLIDER_MAX);
    next.minBlinkMs = clamp(next.minBlinkMs + 8, MIN_BLINK_MS_SLIDER_MIN, MIN_BLINK_MS_SLIDER_MAX);
    next.earClosed = clamp(next.earClosed - 10, EAR_CLOSED_SLIDER_MIN, EAR_CLOSED_SLIDER_MAX);
  }

  for (const rec of attempts) {
    if (rec.gotMorse.length > rec.expectedMorse.length) {
      next.cooldownMs = clamp(next.cooldownMs + 15, COOLDOWN_MS_SLIDER_MIN, COOLDOWN_MS_SLIDER_MAX);
      next.minBlinkMs = clamp(next.minBlinkMs + 5, MIN_BLINK_MS_SLIDER_MIN, MIN_BLINK_MS_SLIDER_MAX);
    } else if (rec.gotMorse.length < rec.expectedMorse.length) {
      next.cooldownMs = clamp(next.cooldownMs - 15, COOLDOWN_MS_SLIDER_MIN, COOLDOWN_MS_SLIDER_MAX);
      next.minBlinkMs = clamp(next.minBlinkMs - 5, MIN_BLINK_MS_SLIDER_MIN, MIN_BLINK_MS_SLIDER_MAX);
      next.earClosed = clamp(next.earClosed + 10, EAR_CLOSED_SLIDER_MIN, EAR_CLOSED_SLIDER_MAX);
    }

    if (rec.got === '?' || rec.got.toLowerCase() !== rec.expected) {
      next.letterGapMs = clamp(
        next.letterGapMs - 100,
        LETTER_GAP_MS_SLIDER_MIN,
        LETTER_GAP_MS_SLIDER_MAX,
      );
    }
  }

  const typed = attempts.map((a) => a.got.toLowerCase()).join('');
  const target = word.toLowerCase();
  if (typed.length < target.length) {
    next.letterGapMs = clamp(
      next.letterGapMs - 80,
      LETTER_GAP_MS_SLIDER_MIN,
      LETTER_GAP_MS_SLIDER_MAX,
    );
  } else if (typed === target) {
    next.letterGapMs = clamp(
      roundStep(next.letterGapMs, LETTER_GAP_MS_SLIDER_STEP),
      LETTER_GAP_MS_SLIDER_MIN,
      LETTER_GAP_MS_SLIDER_MAX,
    );
  }

  return next;
}

export function roundAccuracy(word: string, attempts: LetterAttempt[]): number {
  const letters = encodeWordMorse(word);
  if (letters.length === 0) return 0;
  let score = 0;
  for (let i = 0; i < letters.length; i++) {
    const exp = letters[i];
    const rec = attempts[i];
    if (!rec) continue;
    if (rec.got.toLowerCase() === word[i].toLowerCase()) {
      score += 1;
    } else if (rec.gotMorse === exp) {
      score += 0.7;
    } else {
      const overlap = symbolOverlap(exp, rec.gotMorse);
      score += overlap * 0.5;
    }
  }
  return Math.round((score / letters.length) * 100);
}

function symbolOverlap(expected: string, got: string): number {
  if (!expected.length || !got.length) return 0;
  let match = 0;
  const len = Math.min(expected.length, got.length);
  for (let i = 0; i < len; i++) {
    if (expected[i] === got[i]) match++;
  }
  return match / expected.length;
}

export class CalibrationSession {
  private wordIndex = 0;
  private letterIndex = 0;
  private attempts: LetterAttempt[] = [];
  private letterBlinks: BlinkEvent[] = [];
  private allBlinks: BlinkEvent[] = [];
  private rounds: CalibrationRoundResult[] = [];

  constructor(private words: readonly string[] = CALIBRATION_WORDS) {}

  get active(): boolean {
    return this.wordIndex < this.words.length;
  }

  get currentWord(): string {
    return this.words[this.wordIndex] ?? '';
  }

  get targetMorseHint(): string {
    const w = this.currentWord;
    if (!w) return '';
    return encodeWordMorse(w).map(morseToDisplay).join('  ');
  }

  get progressLabel(): string {
    const w = this.currentWord;
    if (!w) return '';
    const exp = w[this.letterIndex]?.toUpperCase() ?? '—';
    const expMorse = encodeLetter(exp) ?? '';
    return `${this.attempts.length}/${w.length} letters  ·  next: ${exp} ${morseToDisplay(expMorse)}  ·  Enter`;
  }

  hasAttempts(): boolean {
    return this.attempts.length > 0;
  }

  get roundNumber(): number {
    return this.wordIndex + 1;
  }

  get totalRounds(): number {
    return this.words.length;
  }

  get results(): readonly CalibrationRoundResult[] {
    return this.rounds;
  }

  reset(): void {
    this.wordIndex = 0;
    this.letterIndex = 0;
    this.attempts = [];
    this.letterBlinks = [];
    this.allBlinks = [];
    this.rounds = [];
  }

  recordBlink(blink: BlinkEvent): void {
    this.letterBlinks.push(blink);
    this.allBlinks.push(blink);
  }

  onLetterCommit(got: string, gotMorse: string): void {
    const word = this.currentWord;
    if (!word || this.letterIndex >= word.length) return;

    const expected = word[this.letterIndex].toLowerCase();
    const expectedMorse = encodeLetter(expected) ?? '';

    this.attempts.push({
      expected,
      expectedMorse,
      got: got.toLowerCase(),
      gotMorse,
      blinks: [...this.letterBlinks],
    });
    this.letterBlinks = [];
    this.letterIndex++;
  }

  finishRound(baseline: TimingSnapshot): CalibrationRoundResult {
    const word = this.currentWord;
    const accuracy = roundAccuracy(word, this.attempts);
    const tuning = computeTuning(baseline, word, this.attempts, this.allBlinks);
    const result: CalibrationRoundResult = {
      word,
      attempts: [...this.attempts],
      allBlinks: [...this.allBlinks],
      accuracy,
      tuning,
    };
    this.rounds.push(result);
    this.wordIndex++;
    this.letterIndex = 0;
    this.attempts = [];
    this.letterBlinks = [];
    this.allBlinks = [];
    return result;
  }

  overallAccuracy(): number {
    if (this.rounds.length === 0) return 0;
    const sum = this.rounds.reduce((a, r) => a + r.accuracy, 0);
    return Math.round(sum / this.rounds.length);
  }
}
