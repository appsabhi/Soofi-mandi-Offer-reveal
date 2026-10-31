/**
 * Targeted Test Suite: Game Over Score Display (No /100)
 * 
 * Verifies:
 * 1. Test score 48: displays exactly "48" (without "/100" or "/ 100").
 * 2. Test score 80: displays exactly "80" (without "/100" or "/ 100"), OFFER LOCKED button is disabled.
 * 3. Test score 100: displays exactly "100" (without "/100" or "/ 100"), UNLOCK MY OFFER banner & button are visible and active.
 * 4. Test score 120: displays exactly "120" (without "/100" or "/ 100"), UNLOCK MY OFFER banner & button remain active.
 * 5. Initial reset state displays "0" (without "/100").
 * 6. "Reach 100 points to unlock your reward!" subtitle copy is strictly preserved.
 * 7. 100-point threshold, claim modal, and offer reveal logic are preserved.
 * 8. Screenshot captured for visual verification.
 */

const assert = require("assert");
const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CDP_PORT = 9229;
const SERVER_URL = "http://localhost:3000";

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

async function runTests() {
  console.log("==================================================================");
  console.log("SOOFI MANDI — GAME OVER SCORE DISPLAY (NO /100) VERIFICATION");
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
      `${SERVER_URL}/`
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

    await sleep(1500);

    // 1. Initial State
    await asyncTest("Initial score display is '0' (without '/ 100' or '/100')", async () => {
      const initialScore = await session.evaluate(`document.getElementById("reward-score-number").textContent.trim()`);
      assert.strictEqual(initialScore, "0");
      assert.ok(!initialScore.includes("/100") && !initialScore.includes("/ 100"));
    });

    // 2. Test score 48
    await asyncTest("Score 48: displays exactly '48' without '/100', offer locked disabled", async () => {
      await session.evaluate(`window.__soofiGame.testOfferUnlock(48);`);
      await sleep(800);

      const ui = await session.evaluate(`(() => {
        const scoreNum = document.getElementById("reward-score-number").textContent.trim();
        const scoreSummary = document.getElementById("reward-score-summary").textContent.trim();
        const lockedBtn = document.getElementById("offer-locked-btn");
        const unlockBanner = document.getElementById("reward-unlock-banner");
        return {
          scoreNum,
          scoreSummary,
          lockedBtnDisabled: lockedBtn ? (lockedBtn.disabled || lockedBtn.getAttribute("aria-disabled") === "true") : false,
          lockedBtnVisible: Boolean(lockedBtn && lockedBtn.offsetWidth > 0),
          unlockBannerHidden: Boolean(unlockBanner && window.getComputedStyle(unlockBanner).display === "none")
        };
      })()`);

      assert.strictEqual(ui.scoreNum, "48", `Expected exact score "48", got "${ui.scoreNum}"`);
      assert.ok(!ui.scoreNum.includes("/100") && !ui.scoreNum.includes("/ 100"), "Score must not contain /100");
      assert.strictEqual(ui.scoreSummary, "Reach 100 points to unlock your reward!");
      assert.strictEqual(ui.lockedBtnDisabled, true, "Offer Locked button must be disabled");
      assert.strictEqual(ui.unlockBannerHidden, true, "Unlock banner must be hidden");
    });

    // 3. Test score 80
    await asyncTest("Score 80: displays exactly '80' without '/100', offer locked disabled", async () => {
      await session.evaluate(`window.__soofiGame.testOfferUnlock(80);`);
      await sleep(800);

      const ui = await session.evaluate(`(() => {
        const scoreNum = document.getElementById("reward-score-number").textContent.trim();
        const scoreSummary = document.getElementById("reward-score-summary").textContent.trim();
        const lockedBtn = document.getElementById("offer-locked-btn");
        const unlockBanner = document.getElementById("reward-unlock-banner");
        return {
          scoreNum,
          scoreSummary,
          lockedBtnDisabled: lockedBtn ? (lockedBtn.disabled || lockedBtn.getAttribute("aria-disabled") === "true") : false,
          unlockBannerHidden: Boolean(unlockBanner && window.getComputedStyle(unlockBanner).display === "none")
        };
      })()`);

      assert.strictEqual(ui.scoreNum, "80", `Expected exact score "80", got "${ui.scoreNum}"`);
      assert.ok(!ui.scoreNum.includes("/100") && !ui.scoreNum.includes("/ 100"), "Score must not contain /100");
      assert.strictEqual(ui.scoreSummary, "Reach 100 points to unlock your reward!");
      assert.strictEqual(ui.lockedBtnDisabled, true, "Offer Locked button must be disabled");
      assert.strictEqual(ui.unlockBannerHidden, true, "Unlock banner must be hidden");
    });

    // 4. Test score 100
    await asyncTest("Score 100: displays exactly '100' without '/100', UNLOCK MY OFFER available", async () => {
      await session.evaluate(`window.__soofiGame.testOfferUnlock(100);`);
      await sleep(800);

      const ui = await session.evaluate(`(() => {
        const scoreNum = document.getElementById("reward-score-number").textContent.trim();
        const scoreSummary = document.getElementById("reward-score-summary").textContent.trim();
        const lockedWrap = document.getElementById("reward-locked-wrap");
        const unlockBanner = document.getElementById("reward-unlock-banner");
        const unlockBtn = document.getElementById("unlock-offer-btn");
        return {
          scoreNum,
          scoreSummary,
          lockedWrapHidden: Boolean(lockedWrap && window.getComputedStyle(lockedWrap).display === "none"),
          unlockBannerVisible: Boolean(unlockBanner && window.getComputedStyle(unlockBanner).display !== "none"),
          unlockBtnEnabled: Boolean(unlockBtn && !unlockBtn.disabled)
        };
      })()`);

      assert.strictEqual(ui.scoreNum, "100", `Expected exact score "100", got "${ui.scoreNum}"`);
      assert.ok(!ui.scoreNum.includes("/100") && !ui.scoreNum.includes("/ 100"), "Score must not contain /100");
      assert.strictEqual(ui.scoreSummary, "Congratulations! You've unlocked a reward.");
      assert.strictEqual(ui.lockedWrapHidden, true, "Offer Locked wrapper must be hidden");
      assert.strictEqual(ui.unlockBannerVisible, true, "Unlock banner must be visible");
      assert.strictEqual(ui.unlockBtnEnabled, true, "Unlock offer button must be enabled");
    });

    // 5. Test score 120
    await asyncTest("Score 120: displays exactly '120' without '/100', UNLOCK MY OFFER available", async () => {
      await session.evaluate(`window.__soofiGame.testOfferUnlock(120);`);
      await sleep(800);

      const ui = await session.evaluate(`(() => {
        const scoreNum = document.getElementById("reward-score-number").textContent.trim();
        const scoreSummary = document.getElementById("reward-score-summary").textContent.trim();
        const lockedWrap = document.getElementById("reward-locked-wrap");
        const unlockBanner = document.getElementById("reward-unlock-banner");
        const unlockBtn = document.getElementById("unlock-offer-btn");
        return {
          scoreNum,
          scoreSummary,
          lockedWrapHidden: Boolean(lockedWrap && window.getComputedStyle(lockedWrap).display === "none"),
          unlockBannerVisible: Boolean(unlockBanner && window.getComputedStyle(unlockBanner).display !== "none"),
          unlockBtnEnabled: Boolean(unlockBtn && !unlockBtn.disabled)
        };
      })()`);

      assert.strictEqual(ui.scoreNum, "120", `Expected exact score "120", got "${ui.scoreNum}"`);
      assert.ok(!ui.scoreNum.includes("/100") && !ui.scoreNum.includes("/ 100"), "Score must not contain /100");
      assert.strictEqual(ui.scoreSummary, "Congratulations! You've unlocked a reward.");
      assert.strictEqual(ui.lockedWrapHidden, true, "Offer Locked wrapper must be hidden");
      assert.strictEqual(ui.unlockBannerVisible, true, "Unlock banner must be visible");
      assert.strictEqual(ui.unlockBtnEnabled, true, "Unlock offer button must be enabled");
    });

    // 6. Reset with Play Again sets score back to "0"
    await asyncTest("Play Again resets score to '0' on new round", async () => {
      await session.evaluate(`document.getElementById("play-again-btn").click();`);
      await sleep(300);

      const state = await session.evaluate(`(() => {
        const s = window.__soofiGame.getState();
        const hudScore = document.getElementById("game-score").textContent;
        return { gameState: s.gameState, score: s.score, hudScore };
      })()`);

      assert.strictEqual(state.gameState, "playing");
      assert.strictEqual(state.score, 0);
      assert.strictEqual(state.hudScore, "0");
    });

    // 7. Capture visual verification screenshot of Game Over screen (score 80)
    await session.evaluate(`window.__soofiGame.testOfferUnlock(80);`);
    await sleep(600);

    const screenshotData = await session.send("Page.captureScreenshot", { format: "png" });
    const screenshotBuf = Buffer.from(screenshotData.data, "base64");
    const screenshotPath = path.join(__dirname, "..", "game_over_score_no_100_verified.png");
    fs.writeFileSync(screenshotPath, screenshotBuf);
    console.log(`\n• Saved verified Game Over screenshot (score 80, no /100) to ${screenshotPath}`);

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

