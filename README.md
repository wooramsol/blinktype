# Blinktype

A web app that detects **eye blinks** via webcam, interprets them as **Morse code**, and types characters into a text field.

Live: https://wooramsol.github.io/blinktype/

## Usage

1. Open the page and allow webcam access — the camera starts automatically.
2. **Short blink** → `·` (dot), **long blink** → `−` (dash).
3. After a letter gap, Morse is decoded into a character. A longer gap inserts a space.
4. The output field supports normal keyboard typing and editing.

## Local development

```bash
npm install
npm run dev
```

## Deployment

Pushes to `main` automatically deploy to https://wooramsol.github.io/blinktype/ via GitHub Actions.

## License

MIT
