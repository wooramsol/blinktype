/**
 * ITU-R M.1677 morse rhythm (in time units):
 * dot = 1u, dash = 3u, intra-letter gap = 1u, letter gap = 3u, word gap = 7u.
 *
 * Unit length ~100ms ≈ 12 WPM (PARIS: 1200 / WPM ms per unit).
 */
export const MORSE_UNIT_MS = 100;

export const MORSE_DOT_MS = MORSE_UNIT_MS;
export const MORSE_DASH_MS = MORSE_UNIT_MS * 3;
export const MORSE_LETTER_GAP_MS = 1000;
export const MORSE_WORD_GAP_MS = MORSE_UNIT_MS * 7;

/** Blink threshold: midpoint between dot (1u) and dash (3u) duration. */
export const MORSE_DOT_DASH_THRESHOLD_MS = 350;

export const DOT_MAX_MS_SLIDER_MIN = MORSE_UNIT_MS;
export const DOT_MAX_MS_SLIDER_MAX = MORSE_UNIT_MS * 6;

export const LETTER_GAP_MS_SLIDER_MIN = MORSE_UNIT_MS;
export const LETTER_GAP_MS_SLIDER_MAX = MORSE_UNIT_MS * 15;
export const LETTER_GAP_MS_SLIDER_STEP = 50;

/** Ignore blinks shorter than this (noise filter). */
export const MIN_BLINK_MS_DEFAULT = 25;
export const MIN_BLINK_MS_SLIDER_MIN = 0;
export const MIN_BLINK_MS_SLIDER_MAX = 150;
export const MIN_BLINK_MS_SLIDER_STEP = 5;

/** Refractory period after each accepted blink (rapid ·-.· needs this low). */
export const COOLDOWN_MS_DEFAULT = 0;
export const COOLDOWN_MS_SLIDER_MIN = 0;
export const COOLDOWN_MS_SLIDER_MAX = 300;
export const COOLDOWN_MS_SLIDER_STEP = 10;

/** EAR below this counts as eye closed (×1000 for slider). */
export const EAR_CLOSED_DEFAULT = 88;
export const EAR_CLOSED_SLIDER_MIN = 0;
export const EAR_CLOSED_SLIDER_MAX = 300;
export const EAR_CLOSED_SLIDER_STEP = 2;
export const EAR_REARM_DELTA = 0.006;
