# Blinktype

A web app that detects **eye blinks** via webcam, interprets them as **Morse code**, and types characters into a text field.

Live: https://wooramsol.github.io/blinktype/

## Usage

1. **Start camera** — Allow front-facing webcam access.
2. (Recommended) **Calibrate (close eyes)** — Press the button with eyes closed, then open your eyes and press **Finish calibration**.
3. Focus the input field and blink:
   - **Short blink** → `·` (dot)
   - **Long blink** → `−` (dash)
4. After a letter gap, characters are entered automatically. A longer gap inserts a space.

## Local development

```bash
npm install
npm run dev
```

## Deployment

Pushes to `main` automatically deploy to https://wooramsol.github.io/blinktype/ via GitHub Actions.

## Limitations

Browser security prevents sending keystrokes to other apps. Text is entered only in this page's text area.

## License

MIT
