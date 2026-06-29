/**
 * ITU-R M.1677 morse rhythm (in time units):
 * dot = 1u, dash = 3u, intra-letter gap = 1u, letter gap = 3u, word gap = 7u.
 *
 * Unit length ~100ms ≈ 12 WPM (PARIS: 1200 / WPM ms per unit).
 */
export const MORSE_UNIT_MS = 100;

export const MORSE_DOT_MS = MORSE_UNIT_MS;
export const MORSE_DASH_MS = MORSE_UNIT_MS * 3;
export const MORSE_LETTER_GAP_MS = MORSE_UNIT_MS * 3;
export const MORSE_WORD_GAP_MS = MORSE_UNIT_MS * 7;

/** Blink threshold: midpoint between dot (1u) and dash (3u) duration. */
export const MORSE_DOT_DASH_THRESHOLD_MS = MORSE_UNIT_MS * 2;

export const DOT_MAX_MS_SLIDER_MIN = MORSE_UNIT_MS;
export const DOT_MAX_MS_SLIDER_MAX = MORSE_DASH_MS + MORSE_UNIT_MS;
