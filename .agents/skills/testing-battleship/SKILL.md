---
name: testing-battleship
description: How to run and test the static Battleship Royale app locally (serving, debug chassis, music controls, responsive/visual checks).
---

# Testing the Battleship app

## Serving
Static site, no build step, no backend:

```bash
cd <repo root> && setsid python3 -m http.server 8080 >/tmp/serv.log 2>&1 < /dev/null &
```

Open `http://localhost:8080/index.html`. Backgrounding with plain `&` from the agent
shell can get killed — use `setsid ... < /dev/null &` and verify with `curl`.

## UI paths
- Fleet placement: click a ship in the Fleet list (`#fleetList li`), then a cell in
  "Your waters". `#rotateBtn` toggles "Rotate: Horizontal/Vertical", `#randomBtn`,
  `#resetBtn` (Clear), `#startBtn` (enabled only when all 5 ships are placed).
- Music controls are injected by `music.js` into `<header>`: `#musicToggle`
  ("▶ Theme" / "❚❚ Theme", `aria-pressed`) and `#musicVolume` (range). Autoplay is
  blocked until a click on the Theme button — expected, not a bug.
- Debug chassis: `?debug=1` in the URL **or** press `d` anywhere outside an input.
  Pressing `d` is better mid-game since it keeps the current state. Useful buttons:
  "Auto-play game" (drives a game to win/loss in <1s), "Check invariants"
  (expects "invariants hold: ..."), "Seeded game", "Reveal enemy fleet", "Dump state".
- Headless suite: `npm test` (no dependencies to install).

## Responsive / visual testing
- Resize the real window instead of devtools: `wmctrl -r :ACTIVE: -e 0,0,0,<W>,1100`.
  `innerWidth ≈ window width - 32`. Chrome's minimum window width is ~532px, so for
  narrower CSS widths use browser zoom (`ctrl+equal`, focus the page first — the
  shortcut is ignored while focus is in the omnibox). Zoom out (`ctrl+minus`) to
  simulate ultrawide viewports (e.g. 67% of a 1600px window ≈ 2400 CSS px).
- Check `document.documentElement.scrollWidth` vs `window.innerWidth` at each width.
- To test late/cold image loads without devtools throttling, run a second
  `http.server` subclass on another port that `time.sleep()`s on the image path and
  sends `Cache-Control: no-store` (see /tmp/slowserv.py pattern), then compare
  `getBoundingClientRect().top` of `h1` before and after the image paints.
- Decorative overlays: verify `document.elementFromPoint` at the centre of each
  control returns the control (not the overlay) — `#hero` uses `pointer-events: none`
  so overlap with `<header>` is expected and harmless.

## Known visual caveat
The `#hero` band uses `background: ... center 24% / cover`. Above roughly 2100 CSS px
viewport width the cover scaling clips the tops of the illustrated heads. If artwork
crop looks wrong, check the viewport width first before suspecting the asset.

## Devin Secrets Needed
None — the app is fully local and unauthenticated.
