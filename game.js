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

function makeFleet() {
  return SHIP_TYPES.map((t) => ({ ...t, cells: [], hits: 0, sunk: false }));
}

function emptyGrid() {
  return Array.from({ length: SIZE * SIZE }, () => null);
}

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

function canPlace(grid, cells) {
  return cells !== null && cells.every((i) => grid[i] === null);
}

function placeShip(grid, ship, cells) {
  ship.cells = cells;
  cells.forEach((i) => (grid[i] = ship));
}

function randomFleet() {
  const grid = emptyGrid();
  const fleet = makeFleet();
  for (const ship of fleet) {
    let cells = null;
    while (!canPlace(grid, cells)) {
      const horizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * SIZE);
      const col = Math.floor(Math.random() * SIZE);
      cells = shipCells(row, col, ship.length, horizontal);
    }
    placeShip(grid, ship, cells);
  }
  return { grid, fleet };
}

/* ---------- AI: hunt with parity, target adjacent cells, follow the line ---------- */
class AI {
  constructor() {
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
    return pool[Math.floor(Math.random() * pool.length)];
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
    const sameRow = rows.every((r) => r === rows[0]);
    const sameCol = cols.every((c) => c === cols[0]);
    const next = [];

    if (hits.length > 1 && sameRow) {
      const r = rows[0];
      const sorted = [...cols].sort((a, b) => a - b);
      next.push([r, sorted[0] - 1], [r, sorted[sorted.length - 1] + 1]);
    } else if (hits.length > 1 && sameCol) {
      const c = cols[0];
      const sorted = [...rows].sort((a, b) => a - b);
      next.push([sorted[0] - 1, c], [sorted[sorted.length - 1] + 1, c]);
    } else {
      const r = rows[0];
      const c = cols[0];
      next.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }

    this.targets = next
      .filter(([r, c]) => inBounds(r, c))
      .map(([r, c]) => idx(r, c))
      .filter((i) => !this.tried.has(i))
      .concat(this.targets.filter((i) => !this.tried.has(i)));
  }
}

/* ---------- Game state ---------- */
const state = {
  phase: "setup",
  playerGrid: emptyGrid(),
  playerFleet: makeFleet(),
  aiGrid: emptyGrid(),
  aiFleet: makeFleet(),
  playerShots: new Set(),
  aiShots: new Set(),
  selectedShip: 0,
  horizontal: true,
  ai: new AI(),
  busy: false,
};

const el = {
  playerBoard: document.getElementById("playerBoard"),
  aiBoard: document.getElementById("aiBoard"),
  status: document.getElementById("status"),
  fleetList: document.getElementById("fleetList"),
  aiFleetList: document.getElementById("aiFleetList"),
  playerFleetList: document.getElementById("playerFleetList"),
  setup: document.getElementById("setup"),
  scoreboard: document.getElementById("scoreboard"),
  log: document.getElementById("log"),
  rotateBtn: document.getElementById("rotateBtn"),
  randomBtn: document.getElementById("randomBtn"),
  resetBtn: document.getElementById("resetBtn"),
  startBtn: document.getElementById("startBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
};

function buildBoard(container, onClick, onHover, onLeave) {
  container.innerHTML = "";
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.i = String(i);
    cell.title = coordName(Math.floor(i / SIZE), i % SIZE);
    if (onClick) cell.addEventListener("click", () => onClick(i));
    if (onHover) cell.addEventListener("mouseenter", () => onHover(i));
    if (onLeave) cell.addEventListener("mouseleave", () => onLeave(i));
    container.appendChild(cell);
  }
}

function log(message, cls = "") {
  const line = document.createElement("div");
  line.textContent = message;
  if (cls) line.className = cls;
  el.log.prepend(line);
}

function setStatus(text) {
  el.status.textContent = text;
}

function renderBoards() {
  const playerCells = el.playerBoard.children;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = playerCells[i];
    cell.className = "cell";
    const ship = state.playerGrid[i];
    if (ship) cell.classList.add(ship.sunk ? "sunk" : "ship");
    if (state.aiShots.has(i)) cell.classList.add(ship ? (ship.sunk ? "sunk" : "hit") : "miss");
  }

  const aiCells = el.aiBoard.children;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = aiCells[i];
    cell.className = "cell";
    const ship = state.aiGrid[i];
    if (state.playerShots.has(i)) {
      cell.classList.add(ship ? (ship.sunk ? "sunk" : "hit") : "miss");
    } else if (state.phase === "playing") {
      cell.classList.add("clickable");
    }
  }
}

function renderFleetPanels() {
  el.fleetList.innerHTML = "";
  state.playerFleet.forEach((ship, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${ship.name}</span><span>${"■".repeat(ship.length)}</span>`;
    li.classList.add("selectable");
    if (ship.cells.length) li.classList.add("placed");
    if (i === state.selectedShip) li.classList.add("selected");
    li.addEventListener("click", () => {
      state.selectedShip = i;
      renderFleetPanels();
    });
    el.fleetList.appendChild(li);
  });
  el.startBtn.disabled = !state.playerFleet.every((s) => s.cells.length);
}

function renderScoreboard() {
  const fill = (list, fleet, hideDetail) => {
    list.innerHTML = "";
    fleet.forEach((ship) => {
      const li = document.createElement("li");
      const detail = ship.sunk ? "SUNK" : hideDetail ? `${ship.length} cells` : `${ship.hits}/${ship.length}`;
      li.innerHTML = `<span>${ship.name}</span><span>${detail}</span>`;
      if (ship.sunk) li.classList.add("destroyed");
      list.appendChild(li);
    });
  };
  fill(el.aiFleetList, state.aiFleet, true);
  fill(el.playerFleetList, state.playerFleet, false);
}

function clearPreview() {
  for (const cell of el.playerBoard.children) {
    cell.classList.remove("preview", "invalid");
  }
}

function previewPlacement(i) {
  if (state.phase !== "setup") return;
  clearPreview();
  const ship = state.playerFleet[state.selectedShip];
  if (!ship || ship.cells.length) return;
  const cells = shipCells(Math.floor(i / SIZE), i % SIZE, ship.length, state.horizontal);
  const ok = canPlace(state.playerGrid, cells);
  (cells || [i]).forEach((c) => el.playerBoard.children[c].classList.add(ok ? "preview" : "invalid"));
}

function handlePlacement(i) {
  if (state.phase !== "setup") return;
  const ship = state.playerFleet[state.selectedShip];
  if (!ship || ship.cells.length) return;
  const cells = shipCells(Math.floor(i / SIZE), i % SIZE, ship.length, state.horizontal);
  if (!canPlace(state.playerGrid, cells)) return;
  placeShip(state.playerGrid, ship, cells);
  const nextUnplaced = state.playerFleet.findIndex((s) => !s.cells.length);
  state.selectedShip = nextUnplaced === -1 ? state.selectedShip : nextUnplaced;
  clearPreview();
  renderBoards();
  renderFleetPanels();
  setStatus(nextUnplaced === -1 ? "Fleet ready. Start the battle!" : "Place your fleet to begin.");
}

function fire(grid, fleet, shots, shot) {
  shots.add(shot);
  const ship = grid[shot];
  if (!ship) return { hit: false, sunk: false, ship: null };
  ship.hits += 1;
  if (ship.hits >= ship.length) ship.sunk = true;
  return { hit: true, sunk: ship.sunk, ship };
}

function checkWinner() {
  if (state.aiFleet.every((s) => s.sunk)) return "player";
  if (state.playerFleet.every((s) => s.sunk)) return "ai";
  return null;
}

function playerShoot(i) {
  if (state.phase !== "playing" || state.busy || state.playerShots.has(i)) return;
  const name = coordName(Math.floor(i / SIZE), i % SIZE);
  const res = fire(state.aiGrid, state.aiFleet, state.playerShots, i);
  log(`You fired at ${name}: ${res.sunk ? `SUNK the enemy ${res.ship.name}!` : res.hit ? "hit!" : "miss."}`, "you");
  renderBoards();
  renderScoreboard();

  if (checkWinner() === "player") return endGame("player");

  state.busy = true;
  setStatus("Enemy is taking aim...");
  setTimeout(aiTurn, 650);
}

function aiTurn() {
  const remaining = state.playerFleet.filter((s) => !s.sunk).map((s) => s.length);
  const shot = state.ai.nextShot(remaining);
  const name = coordName(Math.floor(shot / SIZE), shot % SIZE);
  const res = fire(state.playerGrid, state.playerFleet, state.aiShots, shot);
  state.ai.record(shot, res.hit, res.sunk);
  log(`Enemy fired at ${name}: ${res.sunk ? `SUNK your ${res.ship.name}!` : res.hit ? "hit!" : "miss."}`, "ai");
  renderBoards();
  renderScoreboard();

  if (checkWinner() === "ai") return endGame("ai");

  state.busy = false;
  setStatus("Your turn — fire at enemy waters.");
}

function endGame(winner) {
  state.phase = "over";
  state.busy = false;
  renderBoards();
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (state.aiGrid[i] && !state.playerShots.has(i)) el.aiBoard.children[i].classList.add("ship");
  }
  setStatus(winner === "player" ? "Victory! You sank the enemy fleet." : "Defeat. Your fleet is gone.");
  log(winner === "player" ? "=== You win ===" : "=== AI wins ===");
}

function startBattle() {
  if (!state.playerFleet.every((s) => s.cells.length)) return;
  const enemy = randomFleet();
  state.aiGrid = enemy.grid;
  state.aiFleet = enemy.fleet;
  state.phase = "playing";
  el.setup.hidden = true;
  el.scoreboard.hidden = false;
  clearPreview();
  renderBoards();
  renderScoreboard();
  setStatus("Your turn — fire at enemy waters.");
  log("Battle started. Good hunting.");
}

function resetFleet() {
  state.playerGrid = emptyGrid();
  state.playerFleet = makeFleet();
  state.selectedShip = 0;
  clearPreview();
  renderBoards();
  renderFleetPanels();
  setStatus("Place your fleet to begin.");
}

function randomizePlayerFleet() {
  const { grid, fleet } = randomFleet();
  state.playerGrid = grid;
  state.playerFleet = fleet;
  clearPreview();
  renderBoards();
  renderFleetPanels();
  setStatus("Fleet ready. Start the battle!");
}

function newGame() {
  state.phase = "setup";
  state.playerShots = new Set();
  state.aiShots = new Set();
  state.aiGrid = emptyGrid();
  state.aiFleet = makeFleet();
  state.ai = new AI();
  state.busy = false;
  el.setup.hidden = false;
  el.scoreboard.hidden = true;
  el.log.innerHTML = "";
  resetFleet();
}

el.rotateBtn.addEventListener("click", () => {
  state.horizontal = !state.horizontal;
  el.rotateBtn.textContent = `Rotate: ${state.horizontal ? "Horizontal" : "Vertical"}`;
});
el.randomBtn.addEventListener("click", randomizePlayerFleet);
el.resetBtn.addEventListener("click", resetFleet);
el.startBtn.addEventListener("click", startBattle);
el.newGameBtn.addEventListener("click", newGame);
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "r") el.rotateBtn.click();
});

buildBoard(el.playerBoard, handlePlacement, previewPlacement, clearPreview);
buildBoard(el.aiBoard, playerShoot);
renderBoards();
renderFleetPanels();
