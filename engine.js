/* Pure game logic, shared by the browser UI (game.js) and the headless harness (test/harness.js). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else Object.assign(root, api, { Engine: api });
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SIZE = 10;
  const SHIP_TYPES = [
    { name: "Carrier", length: 5 },
    { name: "Battleship", length: 4 },
    { name: "Cruiser", length: 3 },
    { name: "Submarine", length: 3 },
    { name: "Destroyer", length: 2 },
  ];

  const idx = (r, c) => r * SIZE + c;
  const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  const coordName = (r, c) => String.fromCharCode(65 + c) + (r + 1);

  /* Deterministic PRNG so a seed reproduces an entire game. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const makeFleet = () => SHIP_TYPES.map((t) => ({ ...t, cells: [], hits: 0, sunk: false }));
  const emptyGrid = () => Array.from({ length: SIZE * SIZE }, () => null);

  function shipCells(row, col, length, horizontal) {
    const cells = [];
    for (let i = 0; i < length; i++) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;
      if (!inBounds(r, c)) return null;
      cells.push(idx(r, c));
    }
    return cells;
  }

  const canPlace = (grid, cells) => cells !== null && cells.every((i) => grid[i] === null);

  function placeShip(grid, ship, cells) {
    ship.cells = cells;
    cells.forEach((i) => (grid[i] = ship));
  }

  function randomFleet(rng = Math.random) {
    const grid = emptyGrid();
    const fleet = makeFleet();
    for (const ship of fleet) {
      let cells = null;
      while (!canPlace(grid, cells)) {
        const horizontal = rng() < 0.5;
        const row = Math.floor(rng() * SIZE);
        const col = Math.floor(rng() * SIZE);
        cells = shipCells(row, col, ship.length, horizontal);
      }
      placeShip(grid, ship, cells);
    }
    return { grid, fleet };
  }

  function fire(grid, shots, shot) {
    shots.add(shot);
    const ship = grid[shot];
    if (!ship) return { hit: false, sunk: false, ship: null };
    ship.hits += 1;
    if (ship.hits >= ship.length) ship.sunk = true;
    return { hit: true, sunk: ship.sunk, ship };
  }

  /* Hunt/target search: parity lattice while hunting, neighbours after a hit,
     then extend along the line once two hits are collinear. */
  class AI {
    constructor(rng = Math.random) {
      this.rng = rng;
      this.tried = new Set();
      this.targets = [];
      this.currentHits = [];
    }

    nextShot(remainingLengths) {
      while (this.targets.length) {
        const t = this.targets.shift();
        if (!this.tried.has(t)) return t;
      }
      const minLen = Math.min(...remainingLengths, 2);
      const candidates = [];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const i = idx(r, c);
          if (this.tried.has(i)) continue;
          if ((r + c) % minLen === 0) candidates.push(i);
        }
      }
      const pool = candidates.length
        ? candidates
        : [...Array(SIZE * SIZE).keys()].filter((i) => !this.tried.has(i));
      return pool[Math.floor(this.rng() * pool.length)];
    }

    record(shot, hit, sunk) {
      this.tried.add(shot);
      if (!hit) return;
      this.currentHits.push(shot);
      if (sunk) {
        this.currentHits = [];
        this.targets = [];
        return;
      }
      this.queueNeighbors();
    }

    queueNeighbors() {
      const hits = this.currentHits;
      const rows = hits.map((i) => Math.floor(i / SIZE));
      const cols = hits.map((i) => i % SIZE);
      const next = [];

      if (hits.length > 1 && rows.every((r) => r === rows[0])) {
        const sorted = [...cols].sort((a, b) => a - b);
        next.push([rows[0], sorted[0] - 1], [rows[0], sorted[sorted.length - 1] + 1]);
      } else if (hits.length > 1 && cols.every((c) => c === cols[0])) {
        const sorted = [...rows].sort((a, b) => a - b);
        next.push([sorted[0] - 1, cols[0]], [sorted[sorted.length - 1] + 1, cols[0]]);
      } else {
        next.push([rows[0] - 1, cols[0]], [rows[0] + 1, cols[0]], [rows[0], cols[0] - 1], [rows[0], cols[0] + 1]);
      }

      this.targets = next
        .filter(([r, c]) => inBounds(r, c))
        .map(([r, c]) => idx(r, c))
        .filter((i) => !this.tried.has(i))
        .concat(this.targets.filter((i) => !this.tried.has(i)));
    }
  }

  return {
    SIZE,
    SHIP_TYPES,
    idx,
    inBounds,
    coordName,
    mulberry32,
    makeFleet,
    emptyGrid,
    shipCells,
    canPlace,
    placeShip,
    randomFleet,
    fire,
    AI,
  };
});
