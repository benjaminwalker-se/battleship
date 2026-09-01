#!/usr/bin/env node
/* Browser-level checks: the Node harness in run.js only sees the engine, so
   nothing there can catch a board that renders off the side of a phone screen.
   Usage: node test/ui.js [--headful] */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
};

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  path.join(process.env.HOME || "", ".local/bin/google-chrome"),
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

/* Phone widths the game has to survive, plus the desktop sizes it was designed at. */
const WIDTHS = [320, 360, 375, 390, 414, 480, 560, 768, 900, 1024, 1440];
const MIN_CELL = 20; // below this a cell is not a reliable tap target

function chromePath() {
  const found = CHROME_CANDIDATES.find((p) => p && fs.existsSync(p));
  if (!found) throw new Error("no Chrome binary found; set CHROME_PATH");
  return found;
}

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    if (rel === "favicon.ico") {
      res.writeHead(204).end();
      return;
    }
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function main() {
  const puppeteer = await import("puppeteer-core");
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await puppeteer.default.launch({
    executablePath: chromePath(),
    headless: !process.argv.includes("--headful"),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"],
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // isMobile emulation widens the layout viewport to fit overflowing content,
  // which hides exactly the overflow these checks are looking for.
  const resize = async (width) => {
    await page.setViewport({ width, height: 800, hasTouch: width < 700 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  };

  console.log("layout");

  await test("boards fit the viewport at every width (no clipped columns)", async () => {
    await page.goto(base, { waitUntil: "load" });
    for (const width of WIDTHS) {
      await resize(width);
      const m = await page.evaluate(() => {
        const rects = [...document.querySelectorAll(".board")].map((b) => b.getBoundingClientRect());
        const cell = document.querySelector(".cell").getBoundingClientRect();
        return {
          right: Math.max(...rects.map((r) => r.right)),
          left: Math.min(...rects.map((r) => r.left)),
          cell: cell.width,
          inner: window.innerWidth,
          scrollW: document.documentElement.scrollWidth,
        };
      });
      assert(m.left >= -0.5, `at ${width}px a board starts off-screen (left ${m.left})`);
      assert(m.right <= m.inner + 0.5, `at ${width}px a board runs ${Math.round(m.right - m.inner)}px past the viewport`);
      assert(m.scrollW <= m.inner + 0.5, `at ${width}px the page scrolls horizontally (${m.scrollW} > ${m.inner})`);
      assert(m.cell >= MIN_CELL, `at ${width}px cells shrink to ${m.cell.toFixed(1)}px, below the ${MIN_CELL}px tap target`);
    }
  });

  await test("every placed ship cell is visible and hit-testable on a phone", async () => {
    await resize(375);
    await page.goto(base, { waitUntil: "load" });
    await resize(375);
    // Deterministic worst case: a Carrier along the right edge and one down it.
    await page.evaluate(() => {
      const board = document.getElementById("playerBoard");
      Game.state.horizontal = true;
      Game.state.selectedShip = 0;
      board.children[5].click(); // F1-J1
      Game.state.horizontal = false;
      Game.state.selectedShip = 1;
      board.children[29].click(); // J3-J6
    });
    const bad = await page.evaluate(() => {
      const board = document.getElementById("playerBoard");
      const out = [];
      for (const ship of Game.state.playerFleet) {
        for (const i of ship.cells) {
          const cell = board.children[i];
          cell.scrollIntoView({ block: "center" });
          // A cell only reachable by scrolling sideways counts as off-screen.
          document.scrollingElement.scrollLeft = 0;
          const r = cell.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (r.right > window.innerWidth + 0.5 || r.left < -0.5) out.push([ship.name, i, "off-screen"]);
          else if (hit !== cell) out.push([ship.name, i, `covered by ${hit && (hit.id || hit.tagName)}`]);
        }
      }
      return out;
    });
    assert(bad.length === 0, `ship cells not usable at 375px: ${JSON.stringify(bad.slice(0, 5))}`);
  });

  await test("hero art loads and keeps the commanders in frame on phones", async () => {
    for (const width of [320, 375, 390, 414, 560, 1024, 1440]) {
      await resize(width);
      await page.goto(base, { waitUntil: "networkidle0" });
      await resize(width);
      const hero = await page.evaluate(() => {
        const img = document.querySelector("#hero img");
        const band = document.getElementById("hero").getBoundingClientRect();
        return {
          loaded: img.complete && img.naturalWidth > 0,
          src: img.currentSrc,
          band: band.height,
          top: band.top,
          // fraction of the artwork's height the band actually shows
          shown: band.height / ((band.width * img.naturalHeight) / img.naturalWidth),
        };
      });
      assert(hero.loaded, `at ${width}px the hero image did not load (${hero.src})`);
      assert(hero.top <= 0.5, `at ${width}px the hero band does not start at the top of the page`);
      // Phones get the full-bleed art, so the band has to be tall enough to hold
      // both commanders; wider screens crop to a band on purpose.
      const floor = width <= 560 ? 0.65 : 0.3;
      assert(hero.shown >= floor, `at ${width}px the band shows only ${(hero.shown * 100).toFixed(0)}% of the art`);
    }
  });

  console.log("\nplacement through the UI");

  await test("manual placement never runs off the grid or wraps a row", async () => {
    await resize(1280);
    await page.goto(base, { waitUntil: "load" });
    const bad = await page.evaluate(() => {
      const board = document.getElementById("playerBoard");
      const out = [];
      for (const horizontal of [true, false]) {
        for (let i = 0; i < 100; i++) {
          Game.resetFleet();
          Game.state.horizontal = horizontal;
          Game.state.selectedShip = 0;
          board.children[i].click();
          const cells = Game.state.playerFleet[0].cells;
          if (!cells.length) continue;
          const line = horizontal ? cells.map((c) => Math.floor(c / 10)) : cells.map((c) => c % 10);
          const step = horizontal ? 1 : 10;
          const contiguous = cells.every((c, k) => k === 0 || c - cells[k - 1] === step);
          const onBoard = cells.every((c) => c >= 0 && c < 100);
          if (!onBoard || !contiguous || new Set(line).size !== 1) out.push({ horizontal, i, cells });
        }
      }
      Game.resetFleet();
      return out;
    });
    assert(bad.length === 0, `illegal placements accepted: ${JSON.stringify(bad.slice(0, 5))}`);
  });

  await test("edge cells that cannot hold the ship are refused, not clamped", async () => {
    const result = await page.evaluate(() => {
      const board = document.getElementById("playerBoard");
      const place = (i, horizontal) => {
        Game.resetFleet();
        Game.state.horizontal = horizontal;
        Game.state.selectedShip = 0; // Carrier, 5 cells
        board.children[i].click();
        return Game.state.playerFleet[0].cells.length;
      };
      return { rightEdge: place(6, true), bottomEdge: place(60, false), valid: place(5, true) };
    });
    assert(result.rightEdge === 0, "a Carrier starting at G1 must be refused, not trimmed");
    assert(result.bottomEdge === 0, "a Carrier starting at A7 vertically must be refused");
    assert(result.valid === 5, "a Carrier starting at F1 should still place");
  });

  console.log("\nmusic");

  await test("theme starts from a real tap and keeps scheduling loops", async () => {
    await page.goto(base, { waitUntil: "load" });
    await page.click("#musicToggle");
    await page.waitForFunction(() => Music.stats().state === "running", { timeout: 5000 });
    const stats = await page.evaluate(() => Music.stats());
    assert(stats.playing, "toggle did not put the player into the playing state");
    assert(stats.loopsScheduled > 0, "no audio loop was scheduled after the tap");
    const pressed = await page.$eval("#musicToggle", (b) => b.getAttribute("aria-pressed"));
    assert(pressed === "true", `button should report aria-pressed=true, got ${pressed}`);
  });

  await test("pause then resume does not double-schedule the loop", async () => {
    const before = await page.evaluate(() => Music.stats().loopsScheduled);
    await page.click("#musicToggle");
    await page.click("#musicToggle");
    await page.click("#musicToggle");
    await page.click("#musicToggle");
    await page.waitForFunction(() => Music.stats().state === "running", { timeout: 5000 });
    const after = await page.evaluate(() => Music.stats().loopsScheduled);
    assert(after - before <= 1, `rapid toggles scheduled ${after - before} extra loops`);
  });

  await test("no console errors while playing a turn", async () => {
    await page.goto(base, { waitUntil: "load" });
    await page.click("#randomBtn");
    await page.click("#startBtn");
    await page.evaluate(() => document.querySelector("#aiBoard").children[0].click());
    await page.waitForFunction(() => !Game.state.busy, { timeout: 5000 });
    assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(" | ")}`);
  });

  await browser.close();
  server.close();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
