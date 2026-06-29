# Blinktype

A web app that detects **eye blinks** via webcam, interprets them as **Morse code**, and types characters.

Live: https://wooramsol.github.io/blinktype/

## Usage

1. Open the page and allow webcam access — the camera starts automatically.
2. **Short blink** → `·` (dot), **long blink** → `−` (dash).
3. After a letter gap, Morse is decoded into a character. A longer gap inserts a space.
4. The output field supports normal keyboard typing and editing.

## Global typing (other apps)

Browsers cannot send keystrokes to other apps by themselves. Run the local type bridge:

```bash
npm install
npm run type-bridge
```

Keep it running, then focus any app (editor, chat, browser tab). Decoded characters are typed there like a real keyboard.

- **Linux:** requires `xdotool`
- **macOS:** uses AppleScript (Accessibility permission may be required)
- **Windows:** uses PowerShell `SendKeys`

## Local development

```bash
npm install
npm run dev
```

## Deployment

Pushes to `main` automatically deploy to https://wooramsol.github.io/blinktype/ via GitHub Actions.

## License

MIT
