/* Debug chassis. Enable with ?debug=1 (or press "d"). Uses the same engine and the
   same invariant checks as the Node harness in test/. */
(function () {
  const params = new URLSearchParams(location.search);
  let panel = null;

  function ensureHarness() {
    if (window.Harness) return Promise.resolve(window.Harness);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "test/harness.js";
      s.onload = () => resolve(window.Harness);
      s.onerror = () => reject(new Error("could not load test/harness.js"));
      document.head.appendChild(s);
    });
  }

  function build() {
    if (panel) {
      panel.hidden = !panel.hidden;
      return;
    }
    panel = document.createElement("section");
    panel.id = "debugPanel";
    panel.innerHTML = `
      <h3>Debug chassis</h3>
      <div class="dbg-row">
        <label>Seed <input id="dbgSeed" type="number" value="${params.get("seed") || 1}" /></label>
        <button id="dbgSeeded">Seeded game</button>
      </div>
      <div class="dbg-row">
        <label>AI delay <input id="dbgDelay" type="number" min="0" step="50" value="${Game.state.aiDelayMs}" /> ms</label>
      </div>
      <div class="dbg-row">
        <button id="dbgReveal">Reveal enemy fleet</button>
        <button id="dbgStep">Step AI</button>
        <button id="dbgAuto">Auto-play game</button>
      </div>
      <div class="dbg-row">
        <button id="dbgCheck">Check invariants</button>
        <button id="dbgBench">Benchmark AI x200</button>
        <button id="dbgDump">Dump state</button>
      </div>
      <pre id="dbgOut">ready</pre>
    `;
    const host = document.getElementById("panel");
    host.insertBefore(panel, host.firstChild);

    const out = panel.querySelector("#dbgOut");
    const write = (text) => {
      out.textContent = typeof text === "string" ? text : JSON.stringify(text, null, 2);
    };
    const seedValue = () => Number(panel.querySelector("#dbgSeed").value);

    panel.querySelector("#dbgSeed").addEventListener("change", () => Game.setSeed(seedValue()));
    panel.querySelector("#dbgDelay").addEventListener("change", (e) => {
      Game.state.aiDelayMs = Number(e.target.value);
    });

    panel.querySelector("#dbgSeeded").addEventListener("click", () => {
      Game.setSeed(seedValue());
      Game.newGame();
      Game.randomizePlayerFleet();
      Game.startBattle();
      write(`seeded game ${seedValue()} started — both fleets and every AI choice are reproducible`);
    });

    panel.querySelector("#dbgReveal").addEventListener("click", () => {
      document.body.classList.toggle("reveal-enemy");
      Game.renderBoards();
      write(`enemy fleet ${document.body.classList.contains("reveal-enemy") ? "revealed" : "hidden"}`);
    });

    panel.querySelector("#dbgStep").addEventListener("click", () => {
      Game.state.busy = false;
      Game.aiTurn();
      write(Game.state.events.slice(-1)[0]?.message || "no move");
    });

    panel.querySelector("#dbgAuto").addEventListener("click", () => {
      if (Game.state.phase !== "playing") return write("start a battle first");
      const delay = Game.state.aiDelayMs;
      Game.state.aiDelayMs = 0;
      let guard = 0;
      while (Game.state.phase === "playing" && guard++ < 300) {
        Game.state.busy = false;
        const open = [];
        for (let i = 0; i < Engine.SIZE * Engine.SIZE; i++) if (!Game.state.playerShots.has(i)) open.push(i);
        Game.playerShoot(open[Math.floor(Game.state.rng() * open.length)]);
      }
      Game.state.aiDelayMs = delay;
      write(`auto-play finished in ${guard} rounds — ${Game.el.status.textContent}`);
    });

    panel.querySelector("#dbgCheck").addEventListener("click", () => {
      ensureHarness().then((H) => {
        const s = Game.state;
        try {
          if (s.playerFleet.every((f) => f.cells.length)) {
            H.checkFleetPlacement(s.playerGrid, s.playerFleet, "player");
            H.checkAfterShot(s.playerGrid, s.playerFleet, s.aiShots, "player");
          }
          if (s.phase !== "setup") {
            H.checkFleetPlacement(s.aiGrid, s.aiFleet, "enemy");
            H.checkAfterShot(s.aiGrid, s.aiFleet, s.playerShots, "enemy");
          }
          write("invariants hold: placements legal, hit counts and sunk flags consistent");
        } catch (err) {
          write(`INVARIANT VIOLATION\n${err.message}`);
        }
      }, (err) => write(err.message));
    });

    panel.querySelector("#dbgBench").addEventListener("click", () => {
      ensureHarness().then((H) => write(H.benchmarkAI({ games: 200, startSeed: seedValue() })), (err) => write(err.message));
    });

    panel.querySelector("#dbgDump").addEventListener("click", () => {
      const s = Game.state;
      const fleetInfo = (fleet) => fleet.map((f) => `${f.name} ${f.hits}/${f.length}${f.sunk ? " SUNK" : ""}`);
      write({
        phase: s.phase,
        seed: s.seed,
        shots: { player: s.playerShots.size, ai: s.aiShots.size },
        aiSearch: {
          queuedTargets: s.ai.targets.map((i) => Engine.coordName(Math.floor(i / Engine.SIZE), i % Engine.SIZE)),
          currentHits: s.ai.currentHits.map((i) => Engine.coordName(Math.floor(i / Engine.SIZE), i % Engine.SIZE)),
          mode: s.ai.targets.length ? "target" : "hunt",
        },
        playerFleet: fleetInfo(s.playerFleet),
        enemyFleet: fleetInfo(s.aiFleet),
      });
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key.toLowerCase() === "d") build();
  });

  if (params.get("debug") === "1") {
    build();
    if (params.has("seed")) Game.setSeed(Number(params.get("seed")));
  }
})();
