import wordListRaw from './wordList.json';

const wordList = (wordListRaw as string[]).filter(
  (word) => word.length > 1 || word === 'a' || word === 'i',
);

const WORDS = new Set<string>(wordList);
const WORD_SCORE = new Map<string, number>(
  wordList.map((word, index) => [word, wordList.length - index]),
);

type SegState = { words: string[]; score: number };

/**
 * Split concatenated letters into spaced words (e.g. helloitsme → hello its me).
 * Uses dictionary DP; maximizes total word frequency score.
 */
export function segmentWords(input: string): string {
  const s = input.toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return '';

  const n = s.length;
  const dp: (SegState | null)[] = Array(n + 1).fill(null);
  dp[0] = { words: [], score: 0 };

  for (let i = 1; i <= n; i++) {
    for (let j = 0; j < i; j++) {
      const prev = dp[j];
      if (!prev) continue;

      const word = s.slice(j, i);
      if (!WORDS.has(word)) continue;

      const score = prev.score + (WORD_SCORE.get(word) ?? 1);
      const cand: SegState = { words: [...prev.words, word], score };
      const cur = dp[i];

      if (!cur || cand.score > cur.score) {
        dp[i] = cand;
      }
    }
  }

  const best = dp[n];
  if (best) return best.words.join(' ');
  return s;
}

/** Strip display spaces and non-letters for raw letter storage. */
export function lettersOnly(input: string): string {
  return input.toLowerCase().replace(/[^a-z]/g, '');
}
