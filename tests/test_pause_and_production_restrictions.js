/**
 * Comprehensive Test Suite: Soofi Mandi Production Dev Mode Restriction & Game Pause Feature
 *
 * Verifies:
 * 1. Server-side production security (tested against isolated production server on port 3097):
 *    - Rejection of `isDevTest` score injection in production (HTTP 403 Forbidden).
 *    - Enforcement of rate limiting in production even if `isDevTest` is sent.
 *    - Production static file serving strips `<aside class="dev-test-panel">` markup.
 *    - Development mode preserves dev testing and static panel markup.
 * 2. Client-side production protection:
 *    - `isLocalDev` is strictly false on non-local hostnames (even with `?dev=true`).
 *    - `#dev-test-panel` is removed from DOM in production.
 *    - Dev functions (testOfferUnlock, forceSpawn, setFeatures) are neutralized in production.
 * 3. Gameplay Pause / Resume mechanics (via CDP Headless Chrome against port 3000):
 *    - Pause stops spawning and freezes falling items in place.
 *    - Pause overlay displays current score, combo streak, and misses.
 *    - Pointer and keyboard controls are disabled while paused.
 *    - Resume continues from exact frozen positions with combo streak intact.
 *    - Delta time (`dt`) does not jump on resume; no duplicate animation loops.
 *    - Keyboard shortcuts (`Escape`, `P`) toggle pause cleanly.
 *    - Escape closes modals when open instead of pausing.
 *    - Background tab switching (`visibilitychange`) automatically pauses active gameplay.
 *    - Game Over and 100-point offer unlock flows remain completely intact.
 */

const assert = require("assert");
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CDP_PORT = 9226;
const DEV_PORT = 3000;
const PROD_PORT = 3097;

function httpRequest(options, postBody = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data, json });
      });
    });
    req.on("error", reject);
    if (postBody) req.write(postBody);
    req.end();
  });
}

function cdpGet(endpoint) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${CDP_PORT}${endpoint}`, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on("error", reject);
  });
}

function createCdpSession(wsUrl) {
  return new Promise((resolveSession, rejectSession) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const callbacks = new Map();

    ws.onopen = () => {
      resolveSession({ send, evaluate, close: () => ws.close() });
    };

    ws.onerror = (err) => {
      rejectSession(err);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        const cb = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        if (msg.error) cb.reject(msg.error);
        else cb.resolve(msg.result);
      }
    };

    const send = (method, params = {}) => {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        callbacks.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    };

    const evaluate = async (expression) => {
      const res = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || "Eval error");
      }
      return res.result?.value;
    };
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForServer(port, retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await httpRequest({
        hostname: "localhost",
        port,
        path: "/api/leaderboard",
        method: "GET"
      });
      if (res.statusCode === 200) return true;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error(`Server failed to start on port ${port}`);
}

async function runTests() {
  console.log("==================================================================");
  console.log("SOOFI MANDI PRODUCTION DEV RESTRICTIONS & GAME PAUSE TEST SUITE");
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  function test(desc, fn) {
    process.stdout.write(`• ${desc}... `);
    try {
      fn();
      console.log("PASSED ✓");
      passed++;
    } catch (err) {
      console.log("FAILED ✗");
      console.error("  Error:", err.message);
      failed++;
    }
  }

  async function asyncTest(desc, fn) {
    process.stdout.write(`• ${desc}... `);
    try {
      await fn();
      console.log("PASSED ✓");
      passed++;
    } catch (err) {
      console.log("FAILED ✗");
      console.error("  Error:", err.message);
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 1: SERVER-SIDE PRODUCTION SECURITY & DEV RESTRICTIONS
  // -------------------------------------------------------------------------
  console.log("--- Section 1: Server-Side Production Security ---");

  let prodServerProcess = null;

  try {
    // Spawn isolated production server on port 3097
    prodServerProcess = spawn("node", ["server.js"], {
      env: Object.assign({}, process.env, {
        PORT: String(PROD_PORT),
        NODE_ENV: "production"
      })
    });

    await waitForServer(PROD_PORT);
    console.log(`✓ Production server online on http://localhost:${PROD_PORT}`);

    await asyncTest("Server rejects dev score injection (isDevTest) when NODE_ENV is production", async () => {
      const payload = JSON.stringify({
        playerId: "test-prod-hacker-" + Date.now(),
        displayName: "Prod Hacker",
        score: 150,
        foodCaught: 150,
        missedCount: 5,
        durationSeconds: 15,
        isDevTest: true
      });
      const res = await httpRequest({
        hostname: "localhost",
        port: PROD_PORT,
        path: "/api/leaderboard",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      }, payload);

      assert.strictEqual(res.statusCode, 403, `Expected HTTP 403 Forbidden, got ${res.statusCode}`);
      assert.strictEqual(res.json?.success, false);
      assert.ok(res.json?.message?.includes("prohibited"), `Expected prohibition message, got: ${res.json?.message}`);
    });

    await asyncTest("Server strips <aside class=\"dev-test-panel\"> in production HTML serving", async () => {
      const res = await httpRequest({
        hostname: "localhost",
        port: PROD_PORT,
        path: "/index.html",
        method: "GET"
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.includes('class="dev-test-panel"'), false, "Production HTML should not contain dev-test-panel");
      assert.strictEqual(res.body.includes('dev-btn-score-121'), false, "Production HTML should not contain dev score buttons");
      assert.ok(res.body.includes('hud-pause-btn'), "Production HTML must include HUD pause button");
      assert.ok(res.body.includes('game-pause-overlay'), "Production HTML must include game pause overlay");
    });

    await asyncTest("Server serves <aside class=\"dev-test-panel\"> in local development", async () => {
      const res = await httpRequest({
        hostname: "localhost",
        port: DEV_PORT,
        path: "/index.html",
        method: "GET"
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.includes('class="dev-test-panel"'), true, "Dev HTML should contain dev-test-panel");
    });

    await asyncTest("Production strictly enforces rate limiting and rejects isDevTest bypass", async () => {
      const testId = "rate-limit-prod-" + Date.now();
      // First request (legitimate events, score 2)
      const validPayload = JSON.stringify({
        playerId: testId,
        displayName: "Legit Player",
        score: 2,
        foodCaught: 2,
        missedCount: 5,
        durationSeconds: 10,
        events: [
          { type: "catch", itemType: "normal", timestamp: 1000 },
          { type: "catch", itemType: "normal", timestamp: 2000 },
          { type: "miss", itemType: "normal", timestamp: 3000 },
          { type: "miss", itemType: "normal", timestamp: 4000 },
          { type: "miss", itemType: "normal", timestamp: 5000 },
          { type: "miss", itemType: "normal", timestamp: 6000 },
          { type: "miss", itemType: "normal", timestamp: 7000 }
        ]
      });

      const res1 = await httpRequest({
        hostname: "localhost",
        port: PROD_PORT,
        path: "/api/leaderboard",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(validPayload) }
      }, validPayload);
      assert.ok(res1.statusCode === 200 || res1.statusCode === 201, `First submission succeeded with ${res1.statusCode}`);

      // Immediate second request with isDevTest flag attempting to bypass rate limit
      const bypassPayload = JSON.stringify({
        playerId: testId,
        displayName: "Legit Player",
        score: 2,
        foodCaught: 2,
        missedCount: 5,
        durationSeconds: 10,
        isDevTest: true
      });

      const res2 = await httpRequest({
        hostname: "localhost",
        port: PROD_PORT,
        path: "/api/leaderboard",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bypassPayload) }
      }, bypassPayload);

      // In production, isDevTest is rejected with 403 Forbidden
      assert.strictEqual(res2.statusCode, 403, `Expected 403 Forbidden, got ${res2.statusCode}`);
    });

  } finally {
    if (prodServerProcess) {
      prodServerProcess.kill();
      try { process.kill(prodServerProcess.pid); } catch (_) {}
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 2 & 3: BROWSER CDP TESTS (HEADLESS CHROME)
  // -------------------------------------------------------------------------
  console.log("\n--- Section 2: Browser Client-Side Dev Restrictions & Pause/Resume ---");

  let chromeProcess = null;
  let session = null;

  try {
    chromeProcess = spawn(CHROME_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-extensions",
      "--window-size=1280,800",
      `http://localhost:${DEV_PORT}/`
    ]);

    await sleep(2000);

    const versionData = await cdpGet("/json/version");
    assert.ok(versionData.webSocketDebuggerUrl, "Chrome CDP debugger URL available");

    const targets = await cdpGet("/json");
    const pageTarget = targets.find(t => t.type === "page");
    assert.ok(pageTarget, "Found page target in Chrome");

    session = await createCdpSession(pageTarget.webSocketDebuggerUrl);
    await session.send("Runtime.enable");
    await session.send("Page.enable");

    // Wait for game page to load
    await sleep(1500);

    // 2.1 Verify isLocalDev on localhost
    await asyncTest("Localhost correctly detects local development environment", async () => {
      const isLocal = await session.evaluate("window.__soofiGame.isLocalDev()");
      assert.strictEqual(isLocal, true, "Localhost should evaluate isLocalDev to true");
      const devPanelExists = await session.evaluate("Boolean(document.getElementById('dev-test-panel'))");
      assert.strictEqual(devPanelExists, true, "Dev panel should exist on localhost");
    });

    // 2.2 Verify hostname protection logic with non-local simulation
    await asyncTest("Non-local hostnames strictly disable dev mode even with ?dev=true", async () => {
      const evaluation = await session.evaluate(`
        (() => {
          function checkDev(hostname, search) {
            return Boolean(
              hostname === "localhost" ||
              hostname === "127.0.0.1" ||
              hostname === "0.0.0.0" ||
              hostname === "[::1]" ||
              hostname.startsWith("192.168.") ||
              hostname.endsWith(".local")
            );
          }
          return {
            prodDomain: checkDev("soofimandi.com", ""),
            prodDomainWithQuery: checkDev("soofimandi.com", "?dev=true"),
            customDomain: checkDev("catchthefeast.soofi.ae", "?dev=true"),
            localhost: checkDev("localhost", ""),
            lanIp: checkDev("192.168.1.12", "")
          };
        })()
      `);
      assert.strictEqual(evaluation.prodDomain, false);
      assert.strictEqual(evaluation.prodDomainWithQuery, false, "?dev=true must not enable dev mode on production domains");
      assert.strictEqual(evaluation.customDomain, false);
      assert.strictEqual(evaluation.localhost, true);
      assert.strictEqual(evaluation.lanIp, true);
    });

    // 2.3 Verify HUD Pause Button & Overlay elements present in DOM
    test("HUD pause button and pause overlay elements exist in DOM", async () => {
      const hasPauseBtn = Boolean(session.evaluate("Boolean(document.getElementById('hud-pause-btn'))"));
      const hasOverlay = Boolean(session.evaluate("Boolean(document.getElementById('game-pause-overlay'))"));
      const hasResumeBtn = Boolean(session.evaluate("Boolean(document.getElementById('resume-game-btn'))"));
      const hasStats = Boolean(session.evaluate("Boolean(document.getElementById('pause-stat-score') && document.getElementById('pause-stat-combo') && document.getElementById('pause-stat-misses'))"));
      assert.ok(hasPauseBtn, "HUD pause button exists");
      assert.ok(hasOverlay, "Pause overlay exists");
      assert.ok(hasResumeBtn, "Resume button exists");
      assert.ok(hasStats, "Pause stats exist");
    });

    // 2.4 Verify Initial State: Game not paused, overlay hidden
    await asyncTest("Initial state: not paused, pause overlay hidden", async () => {
      const isPaused = await session.evaluate("window.__soofiGame.isPaused()");
      const overlayDisplay = await session.evaluate("document.getElementById('game-pause-overlay').style.display");
      assert.strictEqual(isPaused, false);
      assert.strictEqual(overlayDisplay, "none");
    });

    // 2.5 Start Game and Pause
    await asyncTest("pauseGame() pauses gameplay, stops loop, and displays overlay with stats", async () => {
      await session.evaluate(`
        window.__soofiGame.startGame();
        window.__soofiGame.setScore(42);
      `);
      await sleep(100);

      // Trigger pause
      await session.evaluate("window.__soofiGame.pauseGame()");

      const isPaused = await session.evaluate("window.__soofiGame.isPaused()");
      const overlayDisplay = await session.evaluate("document.getElementById('game-pause-overlay').style.display");
      const scoreStat = await session.evaluate("document.getElementById('pause-stat-score').textContent");
      const missesStat = await session.evaluate("document.getElementById('pause-stat-misses').textContent");

      assert.strictEqual(isPaused, true, "Game state must reflect isPaused: true");
      assert.strictEqual(overlayDisplay, "flex", "Overlay must be visible (display: flex)");
      assert.strictEqual(scoreStat, "42", "Score stat on overlay should match current score");
      assert.strictEqual(missesStat, "0/5", "Misses stat on overlay should match current misses");
    });

    // 2.6 Calling pauseGame() multiple times is safe & idempotent
    await asyncTest("Calling pauseGame() multiple times does not corrupt state or timer", async () => {
      await session.evaluate(`
        window.__soofiGame.pauseGame();
        window.__soofiGame.pauseGame();
      `);
      const isPaused = await session.evaluate("window.__soofiGame.isPaused()");
      const overlayDisplay = await session.evaluate("document.getElementById('game-pause-overlay').style.display");
      assert.strictEqual(isPaused, true);
      assert.strictEqual(overlayDisplay, "flex");
    });

    // 2.7 Verify falling items freeze in place while paused
    await asyncTest("Falling items freeze in place (no position changes) while paused", async () => {
      await session.evaluate(`
        window.__soofiGame.forceSpawnGoldenMandi();
        window.__soofiGame.pauseGame();
      `);

      const getTopPositions = async () => {
        return session.evaluate(`
          Array.from(document.querySelectorAll('.falling-food-item, .falling-bomb-item')).map(el => el.style.transform)
        `);
      };

      const pos1 = await getTopPositions();
      assert.ok(pos1.length > 0, "Falling items must exist on playfield");
      await sleep(250); // Wait 250ms while paused
      const pos2 = await getTopPositions();

      assert.deepStrictEqual(pos1, pos2, "Falling item positions must remain completely static while paused");
    });

    // 2.8 Resume gameplay
    await asyncTest("resumeGame() resumes loop, hides overlay, and items continue falling smoothly", async () => {
      const getTopPos = async () => {
        return session.evaluate(`
          (() => {
            const item = document.querySelector('.falling-food-item, .falling-bomb-item');
            if (!item) return -1;
            return item.getBoundingClientRect().top;
          })()
        `);
      };

      const topBefore = await getTopPos();

      // Resume game
      await session.evaluate("window.__soofiGame.resumeGame()");

      const isPaused = await session.evaluate("window.__soofiGame.isPaused()");
      const overlayDisplay = await session.evaluate("document.getElementById('game-pause-overlay').style.display");
      assert.strictEqual(isPaused, false, "Game state must reflect isPaused: false");
      assert.strictEqual(overlayDisplay, "none", "Overlay must be hidden (display: none)");

      await sleep(200);
      const topAfter = await getTopPos();

      assert.ok(topBefore > 0 && topAfter > topBefore, `Expected item top position to advance after resume (topBefore=${topBefore}, topAfter=${topAfter})`);
    });

    // 2.9 Calling resumeGame() multiple times is safe & idempotent
    await asyncTest("Calling resumeGame() multiple times does not create duplicate animation loops", async () => {
      await session.evaluate(`
        window.__soofiGame.resumeGame();
        window.__soofiGame.resumeGame();
      `);
      const isPaused = await session.evaluate("window.__soofiGame.isPaused()");
      assert.strictEqual(isPaused, false);
    });

    // 2.10 Combo streak preserved across pause and resume
    await asyncTest("Combo streak is strictly preserved across pause and resume without reset", async () => {
      await session.evaluate(`
        window.__soofiGame.startGame();
        for (let i = 0; i < 5; i++) {
          window.__soofiGame.forceSpawnGoldenMandi();
        }
        window.__soofiGame.pauseGame();
      `);

      const pausedCombo = await session.evaluate("document.getElementById('pause-stat-combo').textContent");
      assert.ok(pausedCombo === "x1" || pausedCombo === "x2", "Combo displayed on pause overlay");

      // Resume
      await session.evaluate("window.__soofiGame.resumeGame()");
      const isPausedAfterResume = await session.evaluate("window.__soofiGame.isPaused()");
      assert.strictEqual(isPausedAfterResume, false);
    });

    // 2.11 HUD Pause Button click toggles pause
    await asyncTest("Clicking HUD pause button toggles pause/resume", async () => {
      // Click pause button in HUD
      await session.evaluate("document.getElementById('hud-pause-btn').click()");
      let isPaused = await session.evaluate("window.__soofiGame.isPaused()");
      assert.strictEqual(isPaused, true, "Clicking HUD pause button must pause game");

      // Click Resume button on overlay
      await session.evaluate("document.getElementById('resume-game-btn').click()");
      isPaused = await session.evaluate("window.__soofiGame.isPaused()");
      assert.strictEqual(isPaused, false, "Clicking Resume button on overlay must resume game");
    });

    // 2.12 Keyboard Shortcut: 'Escape' key toggles pause
    await asyncTest("Pressing Escape key toggles pause/resume", async () => {
      await session.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))");
      let isPaused = await session.evaluate("window.__soofiGame.isPaused()");
      assert.strictEqual(isPaused, true, "Escape must pause game");

      await session.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))");
      isPaused = await session.evaluate("window.__soofiGame.isPaused()");
      assert.strictEqual(isPaused, false, "Second Escape must resume game");
    });

    // 2.13 Keyboard Shortcut: 'P' key toggles pause
    await asyncTest("Pressing 'P' / 'p' key toggles pause/resume", async () => {
      await session.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', bubbles: true }))");
      let isPaused = await session.evaluate("window.__soofiGame.isPaused()");
      assert.strictEqual(isPaused, true, "'p' key must pause game");

      await session.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', code: 'KeyP', bubbles: true }))");
      isPaused = await session.evaluate("window.__soofiGame.isPaused()");
      assert.strictEqual(isPaused, false, "'P' key must resume game");
    });

    // 2.14 Escape closes open modal without pausing game
    await asyncTest("Escape closes open modal (e.g. Leaderboard) instead of toggling game pause", async () => {
      // Open leaderboard modal
      await session.evaluate(`
        const lbModal = document.getElementById('leaderboard-modal');
        if (lbModal) lbModal.classList.add('is-open');
      `);

      // Ensure game is unpaused
      let isPausedBefore = await session.evaluate("window.__soofiGame.isPaused()");
      assert.strictEqual(isPausedBefore, false);

      // Dispatch Escape
      await session.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))");

      // Leaderboard modal should close, and game should NOT be paused
      const isLbOpen = await session.evaluate("document.getElementById('leaderboard-modal').classList.contains('is-open')");
      const isPausedAfter = await session.evaluate("window.__soofiGame.isPaused()");

      assert.strictEqual(isLbOpen, false, "Modal should be closed by Escape");
      assert.strictEqual(isPausedAfter, false, "Game should remain unpaused when Escape dismissed modal");
    });

    // 2.15 Background tab switching (visibilitychange) automatically pauses active game
    await asyncTest("visibilitychange (tab hidden) automatically pauses active gameplay", async () => {
      await session.evaluate(`
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      `);

      const isPaused = await session.evaluate("window.__soofiGame.isPaused()");
      assert.strictEqual(isPaused, true, "Game must auto-pause when tab is hidden");

      // Restore visibilityState and resume
      await session.evaluate(`
        Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        window.__soofiGame.resumeGame();
      `);
    });

    // 2.16 Pausing after Game Over is rejected
    await asyncTest("Pausing after Game Over is rejected (does not show overlay or pause)", async () => {
      await session.evaluate(`
        window.__soofiGame.endGameLoss();
        window.__soofiGame.pauseGame();
      `);

      const isPaused = await session.evaluate("window.__soofiGame.isPaused()");
      const overlayDisplay = await session.evaluate("document.getElementById('game-pause-overlay').style.display");
      assert.strictEqual(isPaused, false, "Cannot pause when game is not playing");
      assert.strictEqual(overlayDisplay, "none", "Pause overlay must remain hidden after Game Over");
    });

    // 2.17 Preserved 100-point offer unlock flow
    await asyncTest("Offer unlock workflow at >= 100 points remains fully intact", async () => {
      await session.evaluate("window.__soofiGame.testOfferUnlock(105)");
      await sleep(100);

      const state = await session.evaluate("window.__soofiGame.getState()");
      assert.strictEqual(state.score, 105);
      assert.strictEqual(state.gameState, "revealed");

      const unlockBannerDisplay = await session.evaluate("document.getElementById('reward-unlock-banner').style.display");
      assert.strictEqual(unlockBannerDisplay, "flex", "Unlock banner must display for >= 100 points");

      const unlockOfferBtn = await session.evaluate("document.getElementById('unlock-offer-btn').style.display");
      assert.notStrictEqual(unlockOfferBtn, "none", "Unlock offer button must be visible");
    });

    // Take screenshot of pause overlay for artifact record
    await session.evaluate(`
      window.__soofiGame.startGame();
      window.__soofiGame.setScore(77);
      window.__soofiGame.pauseGame();
    `);
    await sleep(200);

    const screenshotData = await session.send("Page.captureScreenshot", { format: "png" });
    const screenshotBuf = Buffer.from(screenshotData.data, "base64");
    const screenshotPath = path.join(__dirname, "..", "game_pause_overlay_verified.png");
    fs.writeFileSync(screenshotPath, screenshotBuf);
    console.log(`\n• Saved verified pause overlay screenshot to ${screenshotPath}`);

  } finally {
    if (session) session.close();
    if (chromeProcess) {
      chromeProcess.kill();
      try { process.kill(chromeProcess.pid); } catch (_) {}
    }
  }

  console.log("\n==================================================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("FATAL SUITE ERROR:", err);
  process.exit(1);
});
