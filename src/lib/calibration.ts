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

export interface PatternStats {
  dotMs: number;
  dashMs: number;
  symbolGapMs: number;
  letterGapMs: number;
  blinkCount: number;
  expectedSymbols: number;
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
  pattern: PatternStats;
}

type SymbolSlot = { ch: '.' | '-'; letterIdx: number };

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function roundStep(n: number, step: number): number {
  return Math.round(n / step) * step;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.floor(sorted.length * p), 0, sorted.length - 1);
  return sorted[idx];
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function buildSymbolMap(word: string): SymbolSlot[] {
  const out: SymbolSlot[] = [];
  encodeWordMorse(word).forEach((morse, letterIdx) => {
    for (const ch of morse) out.push({ ch: ch as '.' | '-', letterIdx });
  });
  return out;
}

function gapBetween(blinks: BlinkEvent[], i: number): number {
  const endPrev = blinks[i].endedAt;
  const startNext = blinks[i + 1].endedAt - blinks[i + 1].durationMs;
  return Math.max(0, startNext - endPrev);
}

/** Assign blink durations to dot/dash using expected morse or duration clustering. */
function classifyDurations(
  blinks: BlinkEvent[],
  symbolMap: SymbolSlot[],
): { dotDurations: number[]; dashDurations: number[] } {
  const dotDurations: number[] = [];
  const dashDurations: number[] = [];

  if (blinks.length === symbolMap.length) {
    for (let i = 0; i < blinks.length; i++) {
      if (symbolMap[i].ch === '.') dotDurations.push(blinks[i].durationMs);
      else dashDurations.push(blinks[i].durationMs);
    }
    return { dotDurations, dashDurations };
  }

  const durations = blinks.map((b) => b.durationMs).sort((a, b) => a - b);
  const expectedDots = symbolMap.filter((s) => s.ch === '.').length;
  const expectedDashes = symbolMap.filter((s) => s.ch === '-').length;

  if (durations.length >= 2 && expectedDots > 0 && expectedDashes > 0) {
    let bestSplit = durations[0];
    let bestScore = Infinity;
    for (let i = 1; i < durations.length; i++) {
      const split = (durations[i - 1] + durations[i]) / 2;
      const short = durations.filter((d) => d <= split);
      const long = durations.filter((d) => d > split);
      const score =
        Math.abs(short.length - expectedDots) + Math.abs(long.length - expectedDashes);
      if (score < bestScore) {
        bestScore = score;
        bestSplit = split;
      }
    }
    for (const d of durations) {
      if (d <= bestSplit) dotDurations.push(d);
      else dashDurations.push(d);
    }
    return { dotDurations, dashDurations };
  }

  for (let i = 0; i < Math.min(blinks.length, symbolMap.length); i++) {
    if (symbolMap[i].ch === '.') dotDurations.push(blinks[i].durationMs);
    else dashDurations.push(blinks[i].durationMs);
  }
  return { dotDurations, dashDurations };
}

function measureGaps(
  blinks: BlinkEvent[],
  symbolMap: SymbolSlot[],
): { symbolGaps: number[]; letterGaps: number[] } {
  const symbolGaps: number[] = [];
  const letterGaps: number[] = [];

  for (let i = 0; i < blinks.length - 1; i++) {
    const gap = gapBetween(blinks, i);
    const cur = symbolMap[Math.min(i, symbolMap.length - 1)];
    const next = symbolMap[Math.min(i + 1, symbolMap.length - 1)];
    if (!cur || !next) continue;

    if (cur.letterIdx === next.letterIdx) symbolGaps.push(gap);
    else letterGaps.push(gap);
  }

  return { symbolGaps, letterGaps };
}

export function analyzeBlinkPattern(
  word: string,
  blinks: BlinkEvent[],
  baseline: TimingSnapshot,
): { tuning: TimingSnapshot; pattern: PatternStats } {
  const symbolMap = buildSymbolMap(word);
  const emptyPattern: PatternStats = {
    dotMs: 0,
    dashMs: 0,
    symbolGapMs: 0,
    letterGapMs: 0,
    blinkCount: blinks.length,
    expectedSymbols: symbolMap.length,
  };

  if (blinks.length === 0) {
    return { tuning: { ...baseline }, pattern: emptyPattern };
  }

  const { dotDurations, dashDurations } = classifyDurations(blinks, symbolMap);
  const { symbolGaps, letterGaps } = measureGaps(blinks, symbolMap);

  const dotMs = dotDurations.length ? Math.round(avg(dotDurations)) : 0;
  const dashMs = dashDurations.length ? Math.round(avg(dashDurations)) : 0;
  const symbolGapMs = symbolGaps.length ? Math.round(percentile(symbolGaps, 0.5)) : 0;
  const measuredLetterGap = letterGaps.length ? Math.round(percentile(letterGaps, 0.5)) : 0;

  let dotMaxMs = baseline.dotMaxMs;
  if (dotDurations.length > 0 && dashDurations.length > 0) {
    const dotRef = percentile(dotDurations, 0.75);
    const dashRef = percentile(dashDurations, 0.25);
    dotMaxMs = clamp(
      roundStep((dotRef + dashRef) / 2, 10),
      DOT_MAX_MS_SLIDER_MIN,
      DOT_MAX_MS_SLIDER_MAX,
    );
  } else if (dotDurations.length > 1) {
    dotMaxMs = clamp(
      roundStep(percentile(dotDurations, 0.9) * 1.1, 10),
      DOT_MAX_MS_SLIDER_MIN,
      DOT_MAX_MS_SLIDER_MAX,
    );
  } else if (dashDurations.length > 1) {
    dotMaxMs = clamp(
      roundStep(percentile(dashDurations, 0.1) * 0.9, 10),
      DOT_MAX_MS_SLIDER_MIN,
      DOT_MAX_MS_SLIDER_MAX,
    );
  }

  const minBlinkMs = dotDurations.length
    ? clamp(
        roundStep(Math.min(percentile(dotDurations, 0.1), dotMs * 0.7), 5),
        MIN_BLINK_MS_SLIDER_MIN,
        MIN_BLINK_MS_SLIDER_MAX,
      )
    : baseline.minBlinkMs;

  const cooldownMs = symbolGaps.length
    ? clamp(
        roundStep(percentile(symbolGaps, 0.15) * 0.45, 10),
        COOLDOWN_MS_SLIDER_MIN,
        COOLDOWN_MS_SLIDER_MAX,
      )
    : baseline.cooldownMs;

  let letterGapMs = baseline.letterGapMs;
  if (measuredLetterGap > 0) {
    letterGapMs = clamp(
      roundStep(measuredLetterGap, LETTER_GAP_MS_SLIDER_STEP),
      LETTER_GAP_MS_SLIDER_MIN,
      LETTER_GAP_MS_SLIDER_MAX,
    );
  }

  let earClosed = baseline.earClosed;
  if (blinks.length < symbolMap.length) {
    earClosed = clamp(earClosed + 12, EAR_CLOSED_SLIDER_MIN, EAR_CLOSED_SLIDER_MAX);
  } else if (blinks.length > symbolMap.length) {
    earClosed = clamp(earClosed - 8, EAR_CLOSED_SLIDER_MIN, EAR_CLOSED_SLIDER_MAX);
  }

  return {
    tuning: { dotMaxMs, letterGapMs, cooldownMs, minBlinkMs, earClosed },
    pattern: {
      dotMs,
      dashMs,
      symbolGapMs,
      letterGapMs: measuredLetterGap,
      blinkCount: blinks.length,
      expectedSymbols: symbolMap.length,
    },
  };
}

/** Blend measured timing into running calibration average. */
export function mergeTimingSnapshots(
  prev: TimingSnapshot,
  next: TimingSnapshot,
  roundIndex: number,
): TimingSnapshot {
  const w = 1 / roundIndex;
  const blend = (a: number, b: number, step: number) =>
    roundStep(a * (1 - w) + b * w, step);

  return {
    dotMaxMs: clamp(
      blend(prev.dotMaxMs, next.dotMaxMs, 10),
      DOT_MAX_MS_SLIDER_MIN,
      DOT_MAX_MS_SLIDER_MAX,
    ),
    letterGapMs: clamp(
      blend(prev.letterGapMs, next.letterGapMs, LETTER_GAP_MS_SLIDER_STEP),
      LETTER_GAP_MS_SLIDER_MIN,
      LETTER_GAP_MS_SLIDER_MAX,
    ),
    cooldownMs: clamp(
      blend(prev.cooldownMs, next.cooldownMs, 10),
      COOLDOWN_MS_SLIDER_MIN,
      COOLDOWN_MS_SLIDER_MAX,
    ),
    minBlinkMs: clamp(
      blend(prev.minBlinkMs, next.minBlinkMs, 5),
      MIN_BLINK_MS_SLIDER_MIN,
      MIN_BLINK_MS_SLIDER_MAX,
    ),
    earClosed: clamp(
      Math.round(prev.earClosed * (1 - w) + next.earClosed * w),
      EAR_CLOSED_SLIDER_MIN,
      EAR_CLOSED_SLIDER_MAX,
    ),
  };
}

export function formatPatternStats(p: PatternStats): string {
  const parts: string[] = [];
  if (p.dotMs > 0) parts.push(`dot ${p.dotMs}ms`);
  if (p.dashMs > 0) parts.push(`dash ${p.dashMs}ms`);
  if (p.symbolGapMs > 0) parts.push(`sym gap ${p.symbolGapMs}ms`);
  if (p.letterGapMs > 0) parts.push(`letter gap ${p.letterGapMs}ms`);
  parts.push(`${p.blinkCount}/${p.expectedSymbols} blinks`);
  return parts.join(' · ');
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
    return this.attempts.length > 0 || this.allBlinks.length > 0;
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
    const { tuning: measured, pattern } = analyzeBlinkPattern(word, this.allBlinks, baseline);
    const roundIndex = this.rounds.length + 1;
    const tuning = mergeTimingSnapshots(baseline, measured, roundIndex);
    const result: CalibrationRoundResult = {
      word,
      attempts: [...this.attempts],
      allBlinks: [...this.allBlinks],
      accuracy,
      tuning,
      pattern,
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
