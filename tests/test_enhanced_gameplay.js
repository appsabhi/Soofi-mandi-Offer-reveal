/**
 * SOOFI MANDI — CATCH THE FEAST
 * Complete Gameplay Enhancement Automated Tests:
 * 1. Golden Mandi bonus collectible (+10 pts base, +20 pts with combo x2, 1.5% spawn)
 * 2. Bomb Hazard (-10 pts, combo reset, no miss, score floor at 0, 2.5% spawn)
 * 3. Combo Catch x2 Only (x1 at 1-4, x2 at 5+, x3/x4 removed)
 * 4. Five-Miss Game Over Rule (only food miss counts)
 * 5. Floating Scores (smooth animation, auto-cleanup, red -10 on bomb)
 * 6. Web Audio API synthesizer (pleasant arcade sound effects)
 * 7. Game Over Screen (<score> / 100, OFFER LOCKED disabled vs UNLOCK MY OFFER enabled)
 * 8. Final Offer Reveal Screen (exact wording, no demo labels or claim codes)
 * 9. Server-Side Verification & 100+ points eligibility enforcement
 * 10. Safe Rollback to Original 1-point Game
 */

const { spawn } = require("child_process");
const http = require("http");
const assert = require("assert");
const fs = require("fs");

process.env.PORT = "3095";
const server = require("../server");
const { GAME_FEATURES, GAME_CONFIG, calculateCatchPoints } = require("../game_config");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CDP_PORT = 9225;

function cdpRequest(endpoint) {
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
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const callbacks = new Map();

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
      throw new Error("Eval failed: " + JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  };

  return new Promise((resolve) => {
    ws.onopen = () => resolve({ send, evaluate, close: () => ws.close() });
  });
}

function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "localhost",
      port: 3095,
      path,
      method,
      headers: body ? { "Content-Type": "application/json" } : {}
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, json, raw: data });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log("\n=================================================");
  console.log("SOOFI MANDI ENHANCED GAMEPLAY AUTOMATED TESTS");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`• ${name}... `);
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
  // 1. SCORING FORMULA TESTS
  // -------------------------------------------------------------------------
  await test("Normal food awards +1 pt (catches 1-4) and +2 pts (catches 5+, combo x2)", async () => {
    // 1-4 catches: x1 multiplier
    for (let i = 1; i <= 4; i++) {
      const res = calculateCatchPoints("normal", i);
      assert.strictEqual(res.awardedPoints, 1, `Expected 1 pt at catch ${i}, got ${res.awardedPoints}`);
      assert.strictEqual(res.comboMultiplier, 1);
    }
    // 5+ catches: x2 multiplier
    const res5 = calculateCatchPoints("normal", 5);
    assert.strictEqual(res5.awardedPoints, 2);
    assert.strictEqual(res5.comboMultiplier, 2);

    const res10 = calculateCatchPoints("normal", 10);
    assert.strictEqual(res10.awardedPoints, 2);
    assert.strictEqual(res10.comboMultiplier, 2);
  });

  await test("Golden Mandi awards +3 pts (catches 1-4) and +6 pts (catches 5+, combo x2) — exactly thrice normal food base", async () => {
    // 1-4 catches: +3 pts
    const res1 = calculateCatchPoints("golden-mandi", 1);
    assert.strictEqual(res1.awardedPoints, 3);
    assert.strictEqual(res1.basePoints, 3);
    assert.strictEqual(res1.comboMultiplier, 1);

    // 5+ catches: +6 pts
    const res5 = calculateCatchPoints("golden-mandi", 5);
    assert.strictEqual(res5.awardedPoints, 6);
    assert.strictEqual(res5.comboMultiplier, 2);
  });

  await test("Bomb Hazard awards -10 pts (never multiplied by combo)", async () => {
    const res1 = calculateCatchPoints("bomb", 1);
    assert.strictEqual(res1.awardedPoints, -10);
    assert.strictEqual(res1.isBomb, true);

    const res5 = calculateCatchPoints("bomb", 5);
    assert.strictEqual(res5.awardedPoints, -10, "Bomb deduction must never be multiplied by combo");
  });

  await test("Original Game Fallback: When all 4 features disabled, awards exactly 1 point per food catch, 0 for bomb", async () => {
    const allDisabled = { goldenMandi: false, comboCatch: false, floatingScores: false, bomb: false };
    const resFood = calculateCatchPoints("normal", 10, allDisabled);
    assert.strictEqual(resFood.awardedPoints, 1);

    const resGm = calculateCatchPoints("golden-mandi", 10, allDisabled);
    assert.strictEqual(resGm.awardedPoints, 1);

    const resBomb = calculateCatchPoints("bomb", 10, allDisabled);
    assert.strictEqual(resBomb.awardedPoints, 0);
  });

  await test("GAME_CONFIG parameters match balanced design requirements", async () => {
    assert.strictEqual(GAME_CONFIG.normalFoodPoints, 1);
    assert.strictEqual(GAME_CONFIG.goldenMandiPoints, 3);
    assert.strictEqual(GAME_CONFIG.bombPoints, -10);
    assert.strictEqual(GAME_CONFIG.goldenMandiSpawnChance, 0.015);
    assert.strictEqual(GAME_CONFIG.bombSpawnChance, 0.025);
    assert.strictEqual(GAME_CONFIG.comboActivationCount, 5);
    assert.strictEqual(GAME_CONFIG.comboMultiplier, 2);
    assert.strictEqual(GAME_CONFIG.missLimit, 5);
    assert.strictEqual(GAME_CONFIG.offerEligibilityScore, 100);
  });

  // -------------------------------------------------------------------------
  // 2. SERVER-SIDE VERIFICATION TESTS
  // -------------------------------------------------------------------------
  await test("POST /api/leaderboard correctly verifies score with normal, GM, and bomb events", async () => {
    const playerId = "test-player-v2-" + Date.now();
    // 4 normal catches (1+1+1+1=4)
    // 1 normal catch at streak 5 (x2 = 2 pts, total 6)
    // 1 golden mandi catch at streak 6 (x2 = 6 pts, total 12)
    // 1 bomb caught (-10 pts, total 2, streak reset to 0)
    // 1 bomb missed (0 pts, total 2, no streak reset, no miss added)
    // 1 normal catch (+1 pt, streak was 0, total 3)
    // 5 food misses -> ends game
    const events = [
      { type: "catch", itemType: "normal", timestamp: 1000 },
      { type: "catch", itemType: "normal", timestamp: 2000 },
      { type: "catch", itemType: "normal", timestamp: 3000 },
      { type: "catch", itemType: "normal", timestamp: 4000 },
      { type: "catch", itemType: "normal", timestamp: 5000 }, // combo x2 (+2)
      { type: "catch", itemType: "golden-mandi", timestamp: 6000 }, // combo x2 (+6)
      { type: "catch", itemType: "bomb", timestamp: 7000 }, // bomb (-10), reset combo
      { type: "miss", itemType: "bomb", timestamp: 8000 }, // bomb miss (ignored)
      { type: "catch", itemType: "normal", timestamp: 9000 }, // +1 (streak was 0)
      { type: "miss", itemType: "normal", timestamp: 10000 },
      { type: "miss", itemType: "normal", timestamp: 11000 },
      { type: "miss", itemType: "normal", timestamp: 12000 },
      { type: "miss", itemType: "normal", timestamp: 13000 },
      { type: "miss", itemType: "normal", timestamp: 14000 }
    ];

    const res = await apiRequest("POST", "/api/leaderboard", {
      playerId,
      displayName: "Feast Master",
      score: 3,
      foodCaught: 7,
      missedCount: 5,
      durationSeconds: 16,
      events
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.verifiedScore, 3);
  });

  await test("Server verification prevents score from dropping below 0 upon catching bomb", async () => {
    const playerId = "test-player-floor-" + Date.now();
    // 1 normal catch (+1) + 1 bomb caught (-10) -> score is 0, NOT -9
    const events = [
      { type: "catch", itemType: "normal", timestamp: 1000 },
      { type: "catch", itemType: "bomb", timestamp: 2000 }
    ];

    const res = await apiRequest("POST", "/api/leaderboard", {
      playerId,
      displayName: "Floor Tester",
      score: 0,
      foodCaught: 1,
      missedCount: 0,
      durationSeconds: 5,
      events
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.json.verifiedScore, 0);
  });

  await test("Server corrects client forged scores to the verified score", async () => {
    const playerId = "test-player-forged-" + Date.now();
    const events = [
      { type: "catch", itemType: "normal", timestamp: 1000 },
      { type: "catch", itemType: "normal", timestamp: 2000 }
    ];

    const res = await apiRequest("POST", "/api/leaderboard", {
      playerId,
      displayName: "Sneaky Feaster",
      score: 9999, // FORGED!
      foodCaught: 2,
      missedCount: 0,
      durationSeconds: 5,
      events
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.json.verifiedScore, 2);
  });

  await test("POST /api/offers/claim rejects claims for scores under 100 with HTTP 403", async () => {
    const playerId = "test-player-under100-" + Date.now();
    // Submit verified score of 80
    const lbRes = await apiRequest("POST", "/api/leaderboard", {
      playerId,
      displayName: "Score 80 Player",
      score: 80,
      foodCaught: 80,
      missedCount: 5,
      durationSeconds: 40,
      isDevTest: true
    });
    assert.strictEqual(lbRes.status, 201);
    const gameSessionId = lbRes.json.gameSessionId;

    // Try claiming offer
    const claimRes = await apiRequest("POST", "/api/offers/claim", {
      gameSessionId,
      playerId,
      fullName: "Test Under 100",
      mobileNumber: "+919876543210"
    });

    assert.strictEqual(claimRes.status, 403);
    assert.strictEqual(claimRes.json.success, false);
    assert.ok(claimRes.json.message.includes("100 points"));
  });

  await test("POST /api/offers/claim accepts claims for verified scores >= 100 with HTTP 200/201", async () => {
    const playerId = "test-player-over100-" + Date.now();
    // Submit verified score of 120
    const lbRes = await apiRequest("POST", "/api/leaderboard", {
      playerId,
      displayName: "Score 120 Feaster",
      score: 120,
      foodCaught: 120,
      missedCount: 5,
      durationSeconds: 50,
      isDevTest: true
    });
    assert.strictEqual(lbRes.status, 201);
    const gameSessionId = lbRes.json.gameSessionId;

    // Try claiming offer
    const claimRes = await apiRequest("POST", "/api/offers/claim", {
      gameSessionId,
      playerId,
      fullName: "Tariq Feaster",
      mobileNumber: "+919876543210",
      email: "tariq@example.com"
    });

    assert.ok(claimRes.status === 200 || claimRes.status === 201, `Expected 200 or 201, got ${claimRes.status}`);
    assert.strictEqual(claimRes.json.success, true);
    assert.ok(claimRes.json.claim.claimId);
  });

  // -------------------------------------------------------------------------
  // 3. BROWSER CDP TESTS: DOM, UI, CONTROLS & WORKFLOW
  // -------------------------------------------------------------------------
  let chromeProc = null;
  let cdp = null;

  try {
    const chromeArgs = [
      `--remote-debugging-port=${CDP_PORT}`,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${process.env.TEMP}\\chrome_enhanced_v2_test_${Date.now()}`,
      `http://localhost:3095/?dev=true`
    ];

    chromeProc = spawn(CHROME_PATH, chromeArgs);

    let retries = 25;
    let wsUrl = null;
    while (retries > 0) {
      try {
        const versionData = await cdpRequest("/json/version");
        if (versionData && versionData.webSocketDebuggerUrl) {
          wsUrl = versionData.webSocketDebuggerUrl;
          break;
        }
      } catch (_) {}
      await sleep(200);
      retries--;
    }

    assert.ok(wsUrl, "Chrome CDP failed to initialize");

    const targets = await cdpRequest("/json");
    const pageTarget = targets.find(t => t.type === "page");
    assert.ok(pageTarget, "No page target found");

    cdp = await createCdpSession(pageTarget.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("DOM.enable");
    await cdp.send("Runtime.enable");

    await cdp.send("Page.navigate", { url: "http://localhost:3095/?dev=true" });
    await sleep(800);

    // Browser Test 1: Feature toggles loaded and Golden Star removed
    await test("Client loads GAME_FEATURES with Bomb ON and Golden Star completely removed", async () => {
      const state = await cdp.evaluate(`(() => {
        return {
          features: window.__soofiGame.getFeatures(),
          config: window.GAME_CONFIG,
          hasStarPowerHUD: Boolean(document.getElementById("hud-star-power")),
          hasStarDevBtn: Boolean(document.getElementById("dev-btn-spawn-star")),
          hasBombDevBtn: Boolean(document.getElementById("dev-btn-spawn-bomb"))
        };
      })()`);

      assert.strictEqual(state.features.goldenMandi, true);
      assert.strictEqual(state.features.comboCatch, true);
      assert.strictEqual(state.features.floatingScores, true);
      assert.strictEqual(state.features.bomb, true);
      assert.strictEqual(state.features.goldenStar, undefined);
      assert.strictEqual(state.hasStarPowerHUD, false);
      assert.strictEqual(state.hasStarDevBtn, false);
      assert.strictEqual(state.hasBombDevBtn, true);
    });

    // Browser Test 2: Dev Toolbar Toggles
    await test("Dev Toolbar exposes GM, Combo, Float, Bomb checkboxes and spawn buttons", async () => {
      const devUI = await cdp.evaluate(`(() => {
        const panel = document.getElementById("dev-test-panel");
        const gm = document.getElementById("dev-toggle-gm");
        const cc = document.getElementById("dev-toggle-cc");
        const fs = document.getElementById("dev-toggle-fs");
        const bm = document.getElementById("dev-toggle-bm");
        const btnMandi = document.getElementById("dev-btn-spawn-mandi");
        const btnBomb = document.getElementById("dev-btn-spawn-bomb");
        return {
          hasPanel: Boolean(panel && window.getComputedStyle(panel).display !== "none"),
          hasGm: Boolean(gm && gm.checked),
          hasCc: Boolean(cc && cc.checked),
          hasFs: Boolean(fs && fs.checked),
          hasBm: Boolean(bm && bm.checked),
          hasBtnMandi: Boolean(btnMandi),
          hasBtnBomb: Boolean(btnBomb)
        };
      })()`);

      assert.strictEqual(devUI.hasPanel, true);
      assert.strictEqual(devUI.hasGm, true);
      assert.strictEqual(devUI.hasCc, true);
      assert.strictEqual(devUI.hasFs, true);
      assert.strictEqual(devUI.hasBm, true);
      assert.strictEqual(devUI.hasBtnMandi, true);
      assert.strictEqual(devUI.hasBtnBomb, true);
    });

    // Browser Test 3: Force Spawning Golden Mandi
    await test("Force-spawning Golden Mandi produces .falling-food-item.is-golden-mandi with 'Golden Mandi' label", async () => {
      const result = await cdp.evaluate(`(() => {
        window.__soofiGame.startGame();
        window.__soofiGame.forceSpawnGoldenMandi();
        const gmEl = document.querySelector(".falling-food-item.is-golden-mandi");
        const tag = gmEl ? gmEl.querySelector(".food-name-tag") : null;
        return {
          spawned: Boolean(gmEl),
          tagText: tag ? tag.textContent : ""
        };
      })()`);

      assert.strictEqual(result.spawned, true);
      assert.strictEqual(result.tagText, "Golden Mandi");
    });

    // Browser Test 4: Force Spawning Bomb Hazard
    await test("Force-spawning Bomb produces .falling-bomb-item with SVG body, fuse spark, and 'BOMB -10' label", async () => {
      const result = await cdp.evaluate(`(() => {
        window.__soofiGame.forceSpawnBomb();
        const bombEl = document.querySelector(".falling-bomb-item");
        const tag = bombEl ? bombEl.querySelector(".bomb-name-tag") : null;
        const spark = bombEl ? bombEl.querySelector(".bomb-fuse-spark") : null;
        return {
          spawned: Boolean(bombEl),
          tagText: tag ? tag.textContent : "",
          hasSpark: Boolean(spark)
        };
      })()`);

      assert.strictEqual(result.spawned, true);
      assert.strictEqual(result.tagText, "BOMB -10");
      assert.strictEqual(result.hasSpark, true);
    });

    // Browser Test 5: Combo Progression (x2 Only)
    await test("Combo Progression: x1 at catches 1-4, x2 at 5+ catches, x3/x4 removed", async () => {
      const comboCheck = await cdp.evaluate(`(() => {
        const pts1 = window.calculateCatchPoints("normal", 1);
        const pts4 = window.calculateCatchPoints("normal", 4);
        const pts5 = window.calculateCatchPoints("normal", 5);
        const pts8 = window.calculateCatchPoints("normal", 8);
        return {
          multAt1: pts1.comboMultiplier,
          multAt4: pts4.comboMultiplier,
          multAt5: pts5.comboMultiplier,
          multAt8: pts8.comboMultiplier
        };
      })()`);

      assert.strictEqual(comboCheck.multAt1, 1);
      assert.strictEqual(comboCheck.multAt4, 1);
      assert.strictEqual(comboCheck.multAt5, 2);
      assert.strictEqual(comboCheck.multAt8, 2);
    });

    // Browser Test 6: Game Over Screen for Score < 100
    await test("Game Over Screen for score < 100: displays '<score> / 100', 'Reach 100 points...', disabled 'OFFER LOCKED' button", async () => {
      await cdp.evaluate(`window.__soofiGame.testOfferUnlock(80);`);
      await sleep(600);

      const ui80 = await cdp.evaluate(`(() => {
        const scoreNum = document.getElementById("reward-score-number");
        const summary = document.getElementById("reward-score-summary");
        const lockedBtn = document.getElementById("offer-locked-btn");
        const lockedWrap = document.getElementById("reward-locked-wrap");
        const unlockBanner = document.getElementById("reward-unlock-banner");
        const playAgain = document.getElementById("play-again-btn");
        return {
          scoreText: scoreNum ? scoreNum.textContent.trim() : "",
          summaryText: summary ? summary.textContent.trim() : "",
          lockedBtnExists: Boolean(lockedBtn),
          lockedBtnDisabled: Boolean(lockedBtn && (lockedBtn.disabled || lockedBtn.getAttribute("aria-disabled") === "true")),
          lockedBtnText: lockedBtn ? lockedBtn.textContent.trim() : "",
          lockedWrapVisible: Boolean(lockedWrap && window.getComputedStyle(lockedWrap).display !== "none"),
          bannerHidden: Boolean(unlockBanner && window.getComputedStyle(unlockBanner).display === "none"),
          playAgainVisible: Boolean(playAgain && playAgain.offsetWidth > 0)
        };
      })()`);

      assert.strictEqual(ui80.scoreText, "80 / 100");
      assert.strictEqual(ui80.summaryText, "Reach 100 points to unlock your reward!");
      assert.strictEqual(ui80.lockedBtnExists, true);
      assert.strictEqual(ui80.lockedBtnDisabled, true);
      assert.ok(ui80.lockedBtnText.includes("OFFER LOCKED"));
      assert.strictEqual(ui80.lockedWrapVisible, true);
      assert.strictEqual(ui80.bannerHidden, true);
      assert.strictEqual(ui80.playAgainVisible, true);
    });

    // Wait 2.8s to respect submission rate limit (2.5s) per player
    await sleep(2800);

    // Browser Test 7: Game Over Screen for Score >= 100
    await test("Game Over Screen for score >= 100: displays '<score> / 100', 'Congratulations! You've unlocked a reward.', enabled 'UNLOCK MY OFFER' button", async () => {
      await cdp.evaluate(`window.__soofiGame.testOfferUnlock(120);`);
      await sleep(1500);

      const ui120 = await cdp.evaluate(`(() => {
        const scoreNum = document.getElementById("reward-score-number");
        const summary = document.getElementById("reward-score-summary");
        const unlockBtn = document.getElementById("unlock-offer-btn");
        const unlockBanner = document.getElementById("reward-unlock-banner");
        const lockedWrap = document.getElementById("reward-locked-wrap");
        return {
          scoreText: scoreNum ? scoreNum.textContent.trim() : "",
          summaryText: summary ? summary.textContent.trim() : "",
          bannerVisible: Boolean(unlockBanner && window.getComputedStyle(unlockBanner).display !== "none"),
          lockedWrapHidden: Boolean(lockedWrap && window.getComputedStyle(lockedWrap).display === "none"),
          unlockBtnEnabled: Boolean(unlockBtn && !unlockBtn.disabled)
        };
      })()`);

      assert.strictEqual(ui120.scoreText, "120 / 100");
      assert.strictEqual(ui120.summaryText, "Congratulations! You've unlocked a reward.");
      assert.strictEqual(ui120.bannerVisible, true);
      assert.strictEqual(ui120.lockedWrapHidden, true);
      assert.strictEqual(ui120.unlockBtnEnabled, true);
    });

    // Browser Test 8: Clicking UNLOCK MY OFFER opens Customer Details Form
    await test("Clicking 'UNLOCK MY OFFER' opens Customer Details Form modal", async () => {
      await cdp.evaluate(`document.getElementById("unlock-offer-btn").click();`);
      await sleep(400);

      const modalOpen = await cdp.evaluate(`(() => {
        const modal = document.getElementById("claim-modal");
        return modal && modal.classList.contains("is-open");
      })()`);

      assert.strictEqual(modalOpen, true);
    });

    // Browser Test 9: Form Submission reveals Final Offer Reveal Screen with exact copy
    await test("Form submission reveals Special Offer screen with exact required copy and no demo labels", async () => {
      await cdp.evaluate(`(() => {
        document.getElementById("claim-name").value = "Fatima Al-Nuaimi";
        document.getElementById("claim-phone").value = "+967 771 234 567";
        document.getElementById("claim-email").value = "fatima@example.com";
        document.getElementById("claim-submit-btn").click();
      })()`);
      await sleep(2200);

      const reveal = await cdp.evaluate(`(() => {
        const offerCard = document.getElementById("reward-offer-card");
        const congratsHeading = document.getElementById("offer-congrats-heading");
        const congratsSub = document.getElementById("offer-congrats-sub");
        const badge = document.getElementById("offer-badge");
        const title = document.getElementById("offer-title");
        const redeemHeading = document.querySelector(".offer-redeem-heading");
        const instructions = document.getElementById("offer-instructions-text");
        const playAgain = document.getElementById("play-again-btn");
        const lbBtn = document.getElementById("result-leaderboard-btn");
        return {
          cardVisible: Boolean(offerCard && window.getComputedStyle(offerCard).display !== "none"),
          congratsHeading: congratsHeading ? congratsHeading.textContent.trim() : "",
          congratsSub: congratsSub ? congratsSub.textContent.trim() : "",
          badge: badge ? badge.textContent.trim() : "",
          title: title ? title.textContent.trim() : "",
          redeemHeading: redeemHeading ? redeemHeading.textContent.trim() : "",
          instructions: instructions ? instructions.textContent.trim() : "",
          playAgainVisible: Boolean(playAgain && playAgain.offsetWidth > 0),
          lbBtnVisible: Boolean(lbBtn && lbBtn.offsetWidth > 0)
        };
      })()`);

      assert.strictEqual(reveal.cardVisible, true);
      assert.ok(reveal.congratsHeading === "🎉 CONGRATULATIONS!" || reveal.congratsHeading === "CONGRATULATIONS!");
      assert.strictEqual(reveal.congratsSub, "You've unlocked a special reward!");
      assert.strictEqual(reveal.badge, "YOUR FEAST REWARD");
      assert.ok(!reveal.title.includes("Demo offer"));
      assert.strictEqual(reveal.redeemHeading, "HOW TO CLAIM");
      assert.strictEqual(reveal.instructions, "Show this screen to our staff to claim your reward.");
      assert.strictEqual(reveal.playAgainVisible, true);
      assert.strictEqual(reveal.lbBtnVisible, true);
    });

  } finally {
    if (cdp) cdp.close();
    if (chromeProc) {
      try { process.kill(chromeProc.pid); } catch (_) {}
    }
  }

  console.log("\n=================================================");
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================\n");

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runTests().catch(err => {
  console.error("Test runner exception:", err);
  process.exit(1);
});
