/* Browser UI. All rules and AI live in engine.js. */
const {
  SIZE,
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
} = Engine;

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
  seed: null,
  rng: Math.random,
  aiDelayMs: 650,
  events: [],
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

function setSeed(seed) {
  state.seed = seed === null || seed === undefined || seed === "" ? null : Number(seed);
  state.rng = state.seed === null ? Math.random : mulberry32(state.seed);
}

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
  state.events.push({ turn: state.events.length, message, kind: cls || "system" });
  const line = document.createElement("div");
  line.textContent = message;
  if (cls) line.className = cls;
  el.log.prepend(line);
  document.dispatchEvent(new CustomEvent("battleship:update"));
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
  const reveal = state.phase === "over" || document.body.classList.contains("reveal-enemy");
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = aiCells[i];
    cell.className = "cell";
    const ship = state.aiGrid[i];
    if (state.playerShots.has(i)) {
      cell.classList.add(ship ? (ship.sunk ? "sunk" : "hit") : "miss");
    } else {
      if (ship && reveal) cell.classList.add("ship");
      if (state.phase === "playing") cell.classList.add("clickable");
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

function checkWinner() {
  if (state.aiFleet.every((s) => s.sunk)) return "player";
  if (state.playerFleet.every((s) => s.sunk)) return "ai";
  return null;
}

function playerShoot(i) {
  if (state.phase !== "playing" || state.busy || state.playerShots.has(i)) return;
  const name = coordName(Math.floor(i / SIZE), i % SIZE);
  const res = fire(state.aiGrid, state.playerShots, i);
  log(`You fired at ${name}: ${res.sunk ? `SUNK the enemy ${res.ship.name}!` : res.hit ? "hit!" : "miss."}`, "you");
  renderBoards();
  renderScoreboard();

  if (checkWinner() === "player") return endGame("player");

  state.busy = true;
  setStatus("Enemy is taking aim...");
  if (state.aiDelayMs > 0) setTimeout(aiTurn, state.aiDelayMs);
  else aiTurn();
}

function aiTurn() {
  if (state.phase !== "playing") return;
  const remaining = state.playerFleet.filter((s) => !s.sunk).map((s) => s.length);
  const shot = state.ai.nextShot(remaining);
  const name = coordName(Math.floor(shot / SIZE), shot % SIZE);
  const res = fire(state.playerGrid, state.aiShots, shot);
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
  setStatus(winner === "player" ? "Victory! You sank the enemy fleet." : "Defeat. Your fleet is gone.");
  log(winner === "player" ? "=== You win ===" : "=== AI wins ===");
}

function startBattle() {
  if (!state.playerFleet.every((s) => s.cells.length)) return;
  const enemy = randomFleet(state.rng);
  state.aiGrid = enemy.grid;
  state.aiFleet = enemy.fleet;
  state.ai = new AI(state.rng);
  state.phase = "playing";
  el.setup.hidden = true;
  el.scoreboard.hidden = false;
  clearPreview();
  renderBoards();
  renderScoreboard();
  setStatus("Your turn — fire at enemy waters.");
  log(`Battle started${state.seed === null ? "" : ` (seed ${state.seed})`}. Good hunting.`);
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
  const { grid, fleet } = randomFleet(state.rng);
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
  state.events = [];
  state.busy = false;
  if (state.seed !== null) setSeed(state.seed);
  state.ai = new AI(state.rng);
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
  if (e.target.tagName === "INPUT") return;
  if (e.key.toLowerCase() === "r") el.rotateBtn.click();
});

buildBoard(el.playerBoard, handlePlacement, previewPlacement, clearPreview);
buildBoard(el.aiBoard, playerShoot);
renderBoards();
renderFleetPanels();

/* Handle for the debug chassis (debug.js) and for console poking. */
window.Game = {
  state,
  el,
  setSeed,
  newGame,
  startBattle,
  randomizePlayerFleet,
  resetFleet,
  playerShoot,
  aiTurn,
  checkWinner,
  renderBoards,
  renderScoreboard,
  renderFleetPanels,
  log,
  setStatus,
};
