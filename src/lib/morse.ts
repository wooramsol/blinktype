export const MORSE_TABLE: Record<string, string> = {
  '.-': 'A',
  '-...': 'B',
  '-.-.': 'C',
  '-..': 'D',
  '.': 'E',
  '..-.': 'F',
  '--.': 'G',
  '....': 'H',
  '..': 'I',
  '.---': 'J',
  '-.-': 'K',
  '.-..': 'L',
  '--': 'M',
  '-.': 'N',
  '---': 'O',
  '.--.': 'P',
  '--.-': 'Q',
  '.-.': 'R',
  '...': 'S',
  '-': 'T',
  '..-': 'U',
  '...-': 'V',
  '.--': 'W',
  '-..-': 'X',
  '-.--': 'Y',
  '--..': 'Z',
  '-----': '0',
  '.----': '1',
  '..---': '2',
  '...--': '3',
  '....-': '4',
  '.....': '5',
  '-....': '6',
  '--...': '7',
  '---..': '8',
  '----.': '9',
  '.-.-.-': '.',
  '--..--': ',',
  '..--..': '?',
  '.----.': "'",
  '-.-.--': '!',
  '-..-.': '/',
  '-.--.': '(',
  '-.--.-': ')',
  '.-...': '&',
  '---...': ':',
  '-.-.-.': ';',
  '-...-': '=',
  '.-.-.': '+',
  '-....-': '-',
  '..--.-': '_',
  '.-..-.': '"',
  '...-..-': '$',
  '.--.-.': '@',
};

export function decodeMorse(sequence: string): string | null {
  if (!sequence) return null;
  return MORSE_TABLE[sequence] ?? null;
}

const CHAR_TO_MORSE: Record<string, string> = {};
for (const [morse, ch] of Object.entries(MORSE_TABLE)) {
  if (ch.length === 1 && /[A-Z]/.test(ch)) {
    CHAR_TO_MORSE[ch] = morse;
  }
}

export function encodeLetter(char: string): string | null {
  return CHAR_TO_MORSE[char.toUpperCase()] ?? null;
}

export function encodeWordMorse(word: string): string[] {
  const out: string[] = [];
  for (const ch of word.toUpperCase()) {
    const morse = encodeLetter(ch);
    if (morse) out.push(morse);
  }
  return out;
}

export function wordMorseHint(word: string): string {
  return encodeWordMorse(word).map(morseToDisplay).join(' ');
}

export function morseToDisplay(sequence: string): string {
  return sequence.replace(/\./g, '·').replace(/-/g, '−');
}
