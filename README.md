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

## Debugging test chassis

Rules and AI live in `engine.js`, shared verbatim by the browser (`window.Engine`) and Node (`require`), so tests exercise the code that actually ships. All randomness goes through a seeded Mulberry32 PRNG, so a seed reproduces both fleets and every AI choice.

Headless (Node, no dependencies):

```bash
npm test                      # unit tests, invariant checks, seeded games, replay, AI benchmark
npm run bench                 # benchmark over 1000 games
node test/run.js --games 200  # benchmark size
node test/run.js --replay 4   # print the full shot-by-shot history of seed 4
```

Invariants checked after every simulated shot: ships are straight, contiguous, in bounds and non-overlapping; the grid agrees with the fleet; hit counts and `sunk` flags match the shots fired; no cell is fired at twice; games terminate; and the same seed replays identically.

In the browser, add `?debug=1` (optionally `&seed=7`) or press `d` for a debug panel: start a seeded game, set the AI delay, reveal the enemy fleet, step the AI one shot, auto-play a full game, run the same invariant checks as Node, benchmark the AI over 200 games, and dump live state (phase, seed, shot counts, AI target queue and mode, fleet damage).
