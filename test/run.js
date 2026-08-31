#!/usr/bin/env node
/* Test runner: unit checks on the engine plus seeded full-game simulations.
   Usage: node test/run.js [--games N] [--seed N] [--replay SEED] */
const E = require("../engine.js");
const { simulate, benchmarkAI, checkFleetPlacement, formatHistory } = require("./harness.js");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};

const GAMES = flag("games", 200);
const START_SEED = flag("seed", 1);
const REPLAY = args.includes("--replay") ? flag("replay", 1) : null;

if (REPLAY !== null) {
  const result = simulate({ seed: REPLAY, player: "random" });
  console.log(`Replay of seed ${REPLAY}: ${result.winner} won after ${result.turns} turns\n`);
  console.log(formatHistory(result.history));
  process.exit(0);
}

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

console.log("engine");

test("shipCells stays on the board", () => {
  assert(E.shipCells(0, 0, 5, true).length === 5, "horizontal placement at origin should fit");
  assert(E.shipCells(0, 6, 5, true) === null, "ship running off the right edge must be rejected");
  assert(E.shipCells(6, 0, 5, false) === null, "ship running off the bottom edge must be rejected");
  assert(E.shipCells(9, 9, 1, true)[0] === 99, "single cell at the corner maps to index 99");
});

test("canPlace rejects overlaps", () => {
  const grid = E.emptyGrid();
  const fleet = E.makeFleet();
  E.placeShip(grid, fleet[0], E.shipCells(0, 0, 5, true));
  assert(!E.canPlace(grid, E.shipCells(0, 4, 4, false)), "overlapping placement must be rejected");
  assert(E.canPlace(grid, E.shipCells(1, 0, 4, true)), "adjacent placement is allowed");
});

test("coordName matches the A1 convention", () => {
  assert(E.coordName(0, 0) === "A1", "top-left is A1");
  assert(E.coordName(9, 9) === "J10", "bottom-right is J10");
});

test("fire tracks hits and sinking", () => {
  const grid = E.emptyGrid();
  const fleet = E.makeFleet();
  const destroyer = fleet[4];
  E.placeShip(grid, destroyer, E.shipCells(3, 3, 2, true));
  const shots = new Set();
  assert(E.fire(grid, shots, E.idx(0, 0)).hit === false, "empty water is a miss");
  const first = E.fire(grid, shots, destroyer.cells[0]);
  assert(first.hit && !first.sunk, "first hit does not sink a 2-cell ship");
  const second = E.fire(grid, shots, destroyer.cells[1]);
  assert(second.hit && second.sunk, "second hit sinks the destroyer");
});

test("a seed reproduces the same fleet", () => {
  const a = E.randomFleet(E.mulberry32(42)).fleet.map((s) => s.cells.join(","));
  const b = E.randomFleet(E.mulberry32(42)).fleet.map((s) => s.cells.join(","));
  const c = E.randomFleet(E.mulberry32(43)).fleet.map((s) => s.cells.join(","));
  assert(a.join("|") === b.join("|"), "same seed must produce the same layout");
  assert(a.join("|") !== c.join("|"), "different seeds should differ");
});

test("random fleets are always legal", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const { grid, fleet } = E.randomFleet(E.mulberry32(seed));
    checkFleetPlacement(grid, fleet, `seed ${seed}`);
  }
});

test("AI never repeats a shot and finishes a board", () => {
  const rng = E.mulberry32(7);
  const target = E.randomFleet(rng);
  const ai = new E.AI(rng);
  const fired = new Set();
  while (!target.fleet.every((s) => s.sunk)) {
    const shot = ai.nextShot(target.fleet.filter((s) => !s.sunk).map((s) => s.length));
    assert(!fired.has(shot), `AI repeated the shot at ${shot}`);
    const res = E.fire(target.grid, fired, shot);
    ai.record(shot, res.hit, res.sunk);
    assert(fired.size <= 100, "AI fired more than 100 shots");
  }
});

test("AI extends along a line after two collinear hits", () => {
  const grid = E.emptyGrid();
  const fleet = E.makeFleet();
  const cruiser = fleet[2];
  E.placeShip(grid, cruiser, E.shipCells(4, 4, 3, true));
  const ai = new E.AI(E.mulberry32(1));
  const shots = new Set();
  [E.idx(4, 4), E.idx(4, 5)].forEach((cell) => {
    const res = E.fire(grid, shots, cell);
    ai.record(cell, res.hit, res.sunk);
  });
  const next = ai.nextShot([3]);
  assert(
    next === E.idx(4, 3) || next === E.idx(4, 6),
    `after hits at E5 and F5 the AI should extend the row, got cell ${next}`
  );
});

test("AI clears its target queue once a ship sinks", () => {
  const grid = E.emptyGrid();
  const fleet = E.makeFleet();
  const destroyer = fleet[4];
  E.placeShip(grid, destroyer, E.shipCells(0, 0, 2, true));
  const ai = new E.AI(E.mulberry32(2));
  const shots = new Set();
  destroyer.cells.forEach((cell) => {
    const res = E.fire(grid, shots, cell);
    ai.record(cell, res.hit, res.sunk);
  });
  assert(ai.targets.length === 0, "queued targets must be dropped after a sink");
  assert(ai.currentHits.length === 0, "hit streak must reset after a sink");
});

console.log(`\nsimulation (${GAMES} seeded games, seeds ${START_SEED}-${START_SEED + GAMES - 1})`);

test("every seeded game ends with a legal winner", () => {
  for (let g = 0; g < GAMES; g++) {
    const result = simulate({ seed: START_SEED + g, player: g % 2 ? "ai" : "random" });
    assert(result.winner === "player" || result.winner === "ai", `seed ${result.seed} ended with no winner`);
    assert(result.playerShotCount <= 100 && result.aiShotCount <= 100, `seed ${result.seed} fired past the board`);
  }
});

test("replaying a seed gives an identical game", () => {
  const a = simulate({ seed: 12345, player: "ai" });
  const b = simulate({ seed: 12345, player: "ai" });
  assert(JSON.stringify(a.history) === JSON.stringify(b.history), "same seed produced a different game");
});

const bench = benchmarkAI({ games: Math.max(100, GAMES), startSeed: START_SEED });
console.log(`\nAI benchmark over ${bench.games} games (shots to clear a fleet)`);
console.log(`  mean ${bench.mean}  median ${bench.median}  p90 ${bench.p90}  best ${bench.best}  worst ${bench.worst}`);

test("AI is meaningfully better than random fire (mean < 75 shots)", () => {
  assert(bench.mean < 75, `AI mean of ${bench.mean} shots is no better than random fire`);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
