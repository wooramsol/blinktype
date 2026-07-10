import wordListRaw from './wordList.json';

const wordList = (wordListRaw as string[]).filter(
  (word) => word.length > 1 || word === 'a' || word === 'i',
);

const WORDS = new Set<string>(wordList);
const MAX_WORD_LEN = wordList.reduce((max, word) => Math.max(max, word.length), 1);

function longestWordAt(s: string, start: number): string | null {
  const maxLen = Math.min(MAX_WORD_LEN, s.length - start);
  for (let len = maxLen; len >= 1; len--) {
    const word = s.slice(start, start + len);
    if (WORDS.has(word)) return word;
  }
  return null;
}

/**
 * Left-to-right spacing: known words get spaces; unknown letter runs stay merged
 * until a later known word is found (e.g. helloxyzworld → hello xyz world).
 */
export function segmentIncremental(run: string): string {
  const s = run.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s) return '';

  const parts: string[] = [];
  let i = 0;

  while (i < s.length) {
    const matched = longestWordAt(s, i);
    if (matched) {
      parts.push(matched);
      i += matched.length;
      continue;
    }

    let nextStart = -1;
    let nextWord = '';
    for (let j = i + 1; j < s.length; j++) {
      const word = longestWordAt(s, j);
      if (word) {
        nextStart = j;
        nextWord = word;
        break;
      }
    }

    if (nextStart < 0) {
      parts.push(s.slice(i));
      break;
    }

    parts.push(s.slice(i, nextStart));
    parts.push(nextWord);
    i = nextStart + nextWord.length;
  }

  return parts.join(' ');
}

/** Apply incremental segmentation per manual-space chunk. */
export function formatCommittedText(committed: string): string {
  if (!committed) return '';
  return committed
    .split(' ')
    .map((chunk) => segmentIncremental(chunk))
    .join(' ');
}

/** Strip everything except letters and digits; used when the user edits the textarea. */
export function lettersOnly(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}
