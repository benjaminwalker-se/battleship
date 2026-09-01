# Benjamin Walker's Battleship Royale

Browser Battleship, styled after cognition.com, against an AI opponent. No build step, no backend — open `index.html` (or serve the folder statically).

## Play

- Place each ship by selecting it and clicking your board; press `R` or the Rotate button to switch orientation, or use "Random fleet".
- Click "Start battle", then fire at enemy waters. You and the AI alternate shots until one fleet is gone.

Fleet: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2) on a 10x10 grid.

## AI

Hunt/target search: in hunt mode it samples untried cells on a parity lattice (no 2-cell ship can hide between them); after a hit it queues the neighbouring cells, and once two hits line up it extends along that line only. It clears a full fleet in ~60 shots on average versus ~95 for uniform random fire.

## Music

`music.js` synthesises a NES-style naval march in WebAudio (two pulse voices, a triangle bass and noise percussion) — no audio files, no dependencies. Play/pause and volume live in the header; volume persists in `localStorage`. `Music.render()` renders one loop offline and returns its peak amplitude, so the audio can be checked without speakers.

## Artwork

`assets/hero.png` is the 8-bit commanders illustration, used as a decorative header band (`#hero`): `background-size: cover` with a gradient mask that fades it into the paper background before the title, `pointer-events: none` and `aria-hidden` so it never intercepts clicks or reaches screen readers. Height and crop shrink at the 900px and 560px breakpoints.

## Debugging test chassis

Rules and AI live in `engine.js`, shared verbatim by the browser (`window.Engine`) and Node (`require`), so tests exercise the code that actually ships. All randomness goes through a seeded Mulberry32 PRNG, so a seed reproduces both fleets and every AI choice.

```bash
npm test                      # engine suite, then the browser suite
npm run test:engine           # unit tests, invariant checks, seeded games, replay, AI benchmark (no dependencies)
npm run test:ui               # real Chrome: layout, placement through the UI, music
npm run bench                 # benchmark over 1000 games
node test/run.js --games 200  # benchmark size
node test/run.js --replay 4   # print the full shot-by-shot history of seed 4
node test/ui.js --headful     # watch the browser suite run
```

Invariants checked after every simulated shot: ships are straight, contiguous, in bounds and non-overlapping; the grid agrees with the fleet; hit counts and `sunk` flags match the shots fired; no cell is fired at twice; games terminate; and the same seed replays identically.

`test/ui.js` drives the real page in headless Chrome (`puppeteer-core`, pointed at an installed Chrome via `CHROME_PATH`) because the engine suite cannot see the DOM: it asserts that both boards fit inside the viewport at widths from 320px up with cells still large enough to tap, that placed ships stay on-screen without sideways scrolling, that clicking every cell in both orientations either places a legal ship or refuses it, and that the theme starts from a real click without double-scheduling loops.

In the browser, add `?debug=1` (optionally `&seed=7`) or press `d` for a debug panel: start a seeded game, set the AI delay, reveal the enemy fleet, step the AI one shot, auto-play a full game, run the same invariant checks as Node, benchmark the AI over 200 games, and dump live state (phase, seed, shot counts, AI target queue and mode, fleet damage).
