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

/** Default dash/dot length ratio threshold (relative, not absolute ms). */
export const DASH_RATIO_DEFAULT = 2;

/** Slider stores ratio ×10 (15 = 1.5×, 35 = 3.5×). */
export const DASH_RATIO_SLIDER_MIN = 15;
export const DASH_RATIO_SLIDER_MAX = 35;
export const DASH_RATIO_SLIDER_STEP = 1;

export const sliderToDashRatio = (v: number): number => v / 10;
export const dashRatioToSlider = (r: number): number => Math.round(r * 10);

/** @deprecated legacy name — use DASH_RATIO_* */
export const MORSE_DOT_DASH_THRESHOLD_MS = dashRatioToSlider(DASH_RATIO_DEFAULT);

/** @deprecated legacy name */
export const DOT_MAX_MS_SLIDER_MIN = DASH_RATIO_SLIDER_MIN;
export const DOT_MAX_MS_SLIDER_MAX = DASH_RATIO_SLIDER_MAX;

export const LETTER_GAP_MS_SLIDER_MIN = MORSE_UNIT_MS;
export const LETTER_GAP_MS_SLIDER_MAX = MORSE_UNIT_MS * 15;
export const LETTER_GAP_MS_SLIDER_STEP = 50;

/** Ignore blinks shorter than this (noise filter). */
export const MIN_BLINK_MS_DEFAULT = Math.round(MORSE_UNIT_MS * 0.55);
export const MIN_BLINK_MS_SLIDER_MIN = 0;
export const MIN_BLINK_MS_SLIDER_MAX = 150;
export const MIN_BLINK_MS_SLIDER_STEP = 5;

/** Refractory period after each accepted blink (rapid ·-.· needs this low). */
export const COOLDOWN_MS_DEFAULT = 60;
export const COOLDOWN_MS_SLIDER_MIN = 0;
export const COOLDOWN_MS_SLIDER_MAX = 300;
export const COOLDOWN_MS_SLIDER_STEP = 10;

/** EAR below this counts as eye closed (×1000 for slider). */
export const EAR_CLOSED_DEFAULT = 240;
export const EAR_CLOSED_SLIDER_MIN = 0;
export const EAR_CLOSED_SLIDER_MAX = 300;
export const EAR_CLOSED_SLIDER_STEP = 2;
export const EAR_REARM_DELTA = 0.006;
