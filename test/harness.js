/* Simulation harness: runs seeded games with the real engine and checks invariants
   after every shot. Loaded by the Node test runner and by the in-page debug panel. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../engine.js"));
  else root.Harness = factory(root.Engine);
})(typeof globalThis !== "undefined" ? globalThis : this, function (E) {

class InvariantError extends Error {
  constructor(message, context) {
    super(message);
    this.name = "InvariantError";
    this.context = context;
  }
}

function checkFleetPlacement(grid, fleet, who) {
  const seen = new Set();
  for (const ship of fleet) {
    if (ship.cells.length !== ship.length) {
      throw new InvariantError(`${who}: ${ship.name} occupies ${ship.cells.length} cells, expected ${ship.length}`);
    }
    for (const cell of ship.cells) {
      if (cell < 0 || cell >= E.SIZE * E.SIZE) throw new InvariantError(`${who}: ${ship.name} is off the board`);
      if (seen.has(cell)) throw new InvariantError(`${who}: ${ship.name} overlaps another ship at cell ${cell}`);
      seen.add(cell);
      if (grid[cell] !== ship) throw new InvariantError(`${who}: grid cell ${cell} does not point at ${ship.name}`);
    }
    const rows = new Set(ship.cells.map((c) => Math.floor(c / E.SIZE)));
    const cols = new Set(ship.cells.map((c) => c % E.SIZE));
    const straight = rows.size === 1 || cols.size === 1;
    const span = rows.size === 1 ? Math.max(...cols) - Math.min(...cols) : Math.max(...rows) - Math.min(...rows);
    if (!straight || span !== ship.length - 1) {
      throw new InvariantError(`${who}: ${ship.name} is not a contiguous straight line`);
    }
  }
  if (seen.size !== fleet.reduce((n, s) => n + s.length, 0)) {
    throw new InvariantError(`${who}: fleet cell count mismatch`);
  }
}

function checkAfterShot(grid, fleet, shots, who) {
  for (const ship of fleet) {
    const hitCells = ship.cells.filter((c) => shots.has(c)).length;
    if (ship.hits !== hitCells) {
      throw new InvariantError(`${who}: ${ship.name} records ${ship.hits} hits but ${hitCells} of its cells were shot`);
    }
    if (ship.sunk !== (ship.hits >= ship.length)) {
      throw new InvariantError(`${who}: ${ship.name} sunk flag (${ship.sunk}) disagrees with ${ship.hits}/${ship.length}`);
    }
  }
  const shipCellsHit = [...shots].filter((s) => grid[s]).length;
  const totalHits = fleet.reduce((n, s) => n + s.hits, 0);
  if (shipCellsHit !== totalHits) {
    throw new InvariantError(`${who}: ${shipCellsHit} ship cells shot but fleets record ${totalHits} hits`);
  }
}

/* Plays one full game. `player` is "random" (uniform fire) or "ai" (same search as the opponent). */
function simulate({ seed, player = "random", maxTurns = 400 } = {}) {
  const rng = E.mulberry32(seed);
  const human = E.randomFleet(rng);
  const enemy = E.randomFleet(rng);
  checkFleetPlacement(human.grid, human.fleet, "player");
  checkFleetPlacement(enemy.grid, enemy.fleet, "enemy");

  const aiOpponent = new E.AI(rng);
  const playerBrain = player === "ai" ? new E.AI(rng) : null;
  const playerShots = new Set();
  const aiShots = new Set();
  const history = [];
  let turns = 0;
  let winner = null;

  const alive = (fleet) => fleet.filter((s) => !s.sunk).map((s) => s.length);

  while (!winner) {
    if (++turns > maxTurns) throw new InvariantError(`game did not finish within ${maxTurns} turns`, { seed });

    const shot = playerBrain
      ? playerBrain.nextShot(alive(enemy.fleet))
      : pickRandomOpen(playerShots, rng);
    if (playerShots.has(shot)) throw new InvariantError(`player repeated a shot at ${shot}`, { seed });
    const pRes = E.fire(enemy.grid, playerShots, shot);
    if (playerBrain) playerBrain.record(shot, pRes.hit, pRes.sunk);
    history.push({ by: "player", cell: shot, hit: pRes.hit, sunk: pRes.sunk });
    checkAfterShot(enemy.grid, enemy.fleet, playerShots, "enemy");
    if (enemy.fleet.every((s) => s.sunk)) {
      winner = "player";
      break;
    }

    const aiShot = aiOpponent.nextShot(alive(human.fleet));
    if (aiShots.has(aiShot)) throw new InvariantError(`AI repeated a shot at ${aiShot}`, { seed });
    const aRes = E.fire(human.grid, aiShots, aiShot);
    aiOpponent.record(aiShot, aRes.hit, aRes.sunk);
    history.push({ by: "ai", cell: aiShot, hit: aRes.hit, sunk: aRes.sunk });
    checkAfterShot(human.grid, human.fleet, aiShots, "player");
    if (human.fleet.every((s) => s.sunk)) winner = "ai";
  }

  return { seed, winner, turns, playerShotCount: playerShots.size, aiShotCount: aiShots.size, history };
}

function pickRandomOpen(shots, rng) {
  const open = [];
  for (let i = 0; i < E.SIZE * E.SIZE; i++) if (!shots.has(i)) open.push(i);
  return open[Math.floor(rng() * open.length)];
}

/* Only the AI fires; measures shots needed to clear a fleet. */
function benchmarkAI({ games = 500, startSeed = 1 } = {}) {
  const shots = [];
  for (let g = 0; g < games; g++) {
    const seed = startSeed + g;
    const rng = E.mulberry32(seed);
    const target = E.randomFleet(rng);
    const ai = new E.AI(rng);
    const fired = new Set();
    while (!target.fleet.every((s) => s.sunk)) {
      if (fired.size > E.SIZE * E.SIZE) throw new InvariantError(`AI exhausted the board without winning`, { seed });
      const shot = ai.nextShot(target.fleet.filter((s) => !s.sunk).map((s) => s.length));
      const res = E.fire(target.grid, fired, shot);
      ai.record(shot, res.hit, res.sunk);
    }
    shots.push(fired.size);
  }
  shots.sort((a, b) => a - b);
  const sum = shots.reduce((a, b) => a + b, 0);
  return {
    games,
    mean: +(sum / games).toFixed(2),
    median: shots[Math.floor(games / 2)],
    p90: shots[Math.floor(games * 0.9)],
    best: shots[0],
    worst: shots[shots.length - 1],
  };
}

function formatHistory(history) {
  return history
    .map((h, n) => {
      const r = Math.floor(h.cell / E.SIZE);
      const c = h.cell % E.SIZE;
      const outcome = h.sunk ? "SUNK" : h.hit ? "hit" : "miss";
      return `${String(n + 1).padStart(3)} ${h.by.padEnd(6)} ${E.coordName(r, c).padEnd(3)} ${outcome}`;
    })
    .join("\n");
}

return { simulate, benchmarkAI, checkFleetPlacement, checkAfterShot, formatHistory, InvariantError };
});
