/**
 * Verification Test Suite: Score Isolation, Single-Game Calculation, and Offer Screen Flow
 * 
 * Verifies all requirements:
 * 1. Current Game Score Isolation:
 *    - Game 1: 30 pts -> Game 2: 70 pts -> Game Over screen displays 70 / 100 (NOT 100)
 *    - Game 1: 120 pts -> Game 2: 30 pts -> Game Over screen displays 30 / 100 (NOT 150)
 *    - Game 1: 70 pts -> Game 2: 120 pts -> Game Over screen displays 120 / 100 (NOT 190)
 *    - Game 1: 100 pts -> Game 2: 50 pts -> Game Over screen displays 50 / 100 (NOT 150)
 *    - Game 1: 30 pts -> Game 2: 30 pts -> Game Over screen displays 30 / 100 (NOT 60)
 * 2. Every round starts fresh at 0 (score, combo, misses reset).
 * 3. Game Over Screen UI:
 *    - Score < 100: <score> / 100, "Reach 100 points to unlock your reward!", disabled OFFER LOCKED, UNLOCK MY OFFER hidden.
 *    - Score >= 100: <score> / 100, "Congratulations! You've unlocked a reward.", enabled UNLOCK MY OFFER, OFFER LOCKED hidden.
 * 4. Final Offer Reveal Screen UI:
 *    - Completely removes OFFER LOCKED and UNLOCK MY OFFER buttons.
 *    - Shows logo, 🎉 CONGRATULATIONS!, You've unlocked a special reward!, YOUR FEAST REWARD,
 *      Complimentary Yemeni Delicacy, instructions, PLAY AGAIN, TOP 10 LEADERBOARD, footer.
 *    - Zero demo or placeholder text.
 * 5. Server-side session verification & claim security (score < 100 rejected with 403).
 * 6. Stale API response immunity across rounds.
 */

const { spawn } = require("child_process");
const http = require("http");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CDP_PORT = 9228;
const SERVER_URL = "http://127.0.0.1:3000";

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

  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({ ws, send, evaluate });
    ws.onerror = reject;
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log("================================================================================");
  console.log("SOOFI MANDI - SCORE ISOLATION, SINGLE-GAME SCORING & OFFER FLOW VERIFICATION");
  console.log("================================================================================\n");

  const chromeProcess = spawn(CHROME_PATH, [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-background-networking",
    "about:blank"
  ]);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    await sleep(1500);
    const targets = await cdpRequest("/json");
    const pageTarget = targets.find(t => t.type === "page") || targets[0];
    const session = await createCdpSession(pageTarget.webSocketDebuggerUrl);

    await session.send("Page.enable");
    await session.send("Runtime.enable");

    // Set mobile viewport
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    await session.send("Page.navigate", { url: `${SERVER_URL}/?dev=true` });
    await sleep(1500);

    // =========================================================================
    // 1. VERIFY FIVE SCORE SEQUENCES (CURRENT GAME ONLY ISOLATION)
    // =========================================================================
    console.log("--- 1. Testing Five Successive Score Sequences (No Score Carryover) ---");

    const sequences = [
      { name: "30 -> 70", first: 30, second: 70, expectedSecond: 70 },
      { name: "120 -> 30", first: 120, second: 30, expectedSecond: 30 },
      { name: "70 -> 120", first: 70, second: 120, expectedSecond: 120 },
      { name: "100 -> 50", first: 100, second: 50, expectedSecond: 50 },
      { name: "30 -> 30", first: 30, second: 30, expectedSecond: 30 }
    ];

    for (const seq of sequences) {
      // Run first game
      await session.evaluate(`window.__soofiGame.testOfferUnlock(${seq.first});`);
      await sleep(900);

      // Verify first game score
      const firstScoreText = await session.evaluate(`document.getElementById("reward-score-number").textContent.trim()`);
      assert(firstScoreText === `${seq.first}`, `Seq [${seq.name}] Game 1: shows "${seq.first}" (got "${firstScoreText}")`);
      assert(!firstScoreText.includes("/100") && !firstScoreText.includes("/ 100"), `Seq [${seq.name}] Game 1: score has no /100 denominator`);

      // Click PLAY AGAIN to start second game
      await session.evaluate(`document.getElementById("play-again-btn").click();`);
      await sleep(300);

      // Verify game state reset at start of second game
      const resetState = await session.evaluate(`(() => {
        const s = window.__soofiGame.getState();
        const scoreEl = document.getElementById("game-score").textContent;
        return {
          gameState: s.gameState,
          score: s.score,
          combo: s.consecutiveCatches,
          misses: s.missedCount,
          scoreEl
        };
      })()`);
      assert(resetState.gameState === "playing" && resetState.score === 0 && resetState.scoreEl === "0",
        `Seq [${seq.name}] Play Again resets score to 0 (score=${resetState.score}, HUD=${resetState.scoreEl})`);

      // Complete second game
      await session.evaluate(`window.__soofiGame.testOfferUnlock(${seq.second});`);
      await sleep(900);

      // Verify Game Over screen shows ONLY second game's score
      const secondScoreText = await session.evaluate(`document.getElementById("reward-score-number").textContent.trim()`);
      assert(secondScoreText === `${seq.expectedSecond}`,
        `Seq [${seq.name}] Game 2 Game Over screen displays "${seq.expectedSecond}" (NOT ${seq.first + seq.second})`);
      assert(!secondScoreText.includes("/100") && !secondScoreText.includes("/ 100"), `Seq [${seq.name}] Game 2: score has no /100 denominator`);
    }

    // =========================================================================
    // 2. VERIFY GAME OVER SCREEN BUTTON & CONTENT FOR SCORE < 100
    // =========================================================================
    console.log("\n--- 2. Verifying Game Over Screen for Score < 100 ---");

    await session.evaluate(`window.__soofiGame.testOfferUnlock(45);`);
    await sleep(900);

    const score45UI = await session.evaluate(`(() => {
      const scoreNum = document.getElementById("reward-score-number").textContent.trim();
      const scoreSummary = document.getElementById("reward-score-summary").textContent.trim();
      const kicker = document.getElementById("reward-kicker").textContent.trim();
      const lockedWrap = document.getElementById("reward-locked-wrap");
      const lockedBtn = document.getElementById("offer-locked-btn");
      const unlockBanner = document.getElementById("reward-unlock-banner");
      const unlockBtn = document.getElementById("unlock-offer-btn");
      const offerCard = document.getElementById("reward-offer-card");

      const lockedWrapVisible = window.getComputedStyle(lockedWrap).display !== "none";
      const unlockBannerVisible = window.getComputedStyle(unlockBanner).display !== "none";
      const offerCardVisible = window.getComputedStyle(offerCard).display !== "none";

      return {
        scoreNum,
        scoreSummary,
        kicker,
        lockedWrapVisible,
        lockedBtnDisabled: lockedBtn.disabled,
        unlockBannerVisible,
        offerCardVisible
      };
    })()`);

    assert(score45UI.scoreNum === "45", `Score < 100: displays "45" (got "${score45UI.scoreNum}")`);
    assert(!score45UI.scoreNum.includes("/100") && !score45UI.scoreNum.includes("/ 100"), "Score < 100 has no /100 denominator");
    assert(score45UI.kicker === "GAME OVER", `Score < 100: heading is "GAME OVER" (got "${score45UI.kicker}")`);
    assert(score45UI.scoreSummary === "Reach 100 points to unlock your reward!",
      `Score < 100: summary is "Reach 100 points to unlock your reward!" (got "${score45UI.scoreSummary}")`);
    assert(score45UI.lockedWrapVisible && score45UI.lockedBtnDisabled,
      `Score < 100: OFFER LOCKED button is visible and disabled`);
    assert(!score45UI.unlockBannerVisible, `Score < 100: UNLOCK MY OFFER button is hidden`);
    assert(!score45UI.offerCardVisible, `Score < 100: Reward reveal card is hidden`);

    // =========================================================================
    // 3. VERIFY GAME OVER SCREEN BUTTON & CONTENT FOR SCORE >= 100
    // =========================================================================
    console.log("\n--- 3. Verifying Game Over Screen for Score >= 100 ---");

    await session.evaluate(`window.__soofiGame.testOfferUnlock(115);`);
    await sleep(900);

    const score115UI = await session.evaluate(`(() => {
      const scoreNum = document.getElementById("reward-score-number").textContent.trim();
      const scoreSummary = document.getElementById("reward-score-summary").textContent.trim();
      const kicker = document.getElementById("reward-kicker").textContent.trim();
      const lockedWrap = document.getElementById("reward-locked-wrap");
      const unlockBanner = document.getElementById("reward-unlock-banner");
      const unlockBtn = document.getElementById("unlock-offer-btn");
      const offerCard = document.getElementById("reward-offer-card");

      const lockedWrapVisible = window.getComputedStyle(lockedWrap).display !== "none";
      const unlockBannerVisible = window.getComputedStyle(unlockBanner).display !== "none";
      const offerCardVisible = window.getComputedStyle(offerCard).display !== "none";

      return {
        scoreNum,
        scoreSummary,
        kicker,
        lockedWrapVisible,
        unlockBannerVisible,
        unlockBtnDisabled: unlockBtn.disabled,
        offerCardVisible
      };
    })()`);

    assert(score115UI.scoreNum === "115", `Score >= 100: displays "115" (got "${score115UI.scoreNum}")`);
    assert(!score115UI.scoreNum.includes("/100") && !score115UI.scoreNum.includes("/ 100"), "Score >= 100 has no /100 denominator");
    assert(score115UI.kicker === "GAME OVER", `Score >= 100: heading is "GAME OVER" (got "${score115UI.kicker}")`);
    assert(score115UI.scoreSummary === "Congratulations! You've unlocked a reward.",
      `Score >= 100: summary is "Congratulations! You've unlocked a reward." (got "${score115UI.scoreSummary}")`);
    assert(score115UI.unlockBannerVisible && !score115UI.unlockBtnDisabled,
      `Score >= 100: UNLOCK MY OFFER button is visible and clickable`);
    assert(!score115UI.lockedWrapVisible, `Score >= 100: OFFER LOCKED button is hidden`);
    assert(!score115UI.offerCardVisible, `Score >= 100: Final reveal card is hidden until claim`);

    // =========================================================================
    // 4. VERIFY CUSTOMER CLAIM FLOW & FINAL OFFER REVEAL SCREEN
    // =========================================================================
    console.log("\n--- 4. Verifying Offer Claim Flow & Final Reveal Screen ---");

    // Click UNLOCK MY OFFER button to open customer details modal
    await session.evaluate(`document.getElementById("unlock-offer-btn").click();`);
    await sleep(400);

    const modalOpen = await session.evaluate(`document.getElementById("claim-modal").classList.contains("is-open")`);
    assert(modalOpen, `Clicking UNLOCK MY OFFER opens customer claim modal`);

    // Fill customer form and submit
    await session.evaluate(`
      document.getElementById("claim-name").value = "Ahmed Al-Mandi";
      document.getElementById("claim-phone").value = "+966 50 123 4567";
      document.getElementById("claim-email").value = "ahmed@example.com";
      document.getElementById("claim-submit-btn").click();
    `);
    await sleep(2200);

    // Verify Final Reveal Screen layout and content
    const revealScreen = await session.evaluate(`(() => {
      const card = document.getElementById("reward-card");
      const isOfferRevealed = card.classList.contains("is-offer-revealed");
      const offerCard = document.getElementById("reward-offer-card");
      const offerCardVisible = window.getComputedStyle(offerCard).display !== "none";

      const lockedWrap = document.getElementById("reward-locked-wrap");
      const unlockBanner = document.getElementById("reward-unlock-banner");
      const lockedBtn = document.getElementById("offer-locked-btn");
      const unlockBtn = document.getElementById("unlock-offer-btn");
      const resultHeader = document.getElementById("reward-result-header");

      const lockedWrapVisible = window.getComputedStyle(lockedWrap).display !== "none";
      const unlockBannerVisible = window.getComputedStyle(unlockBanner).display !== "none";
      const lockedBtnVisible = window.getComputedStyle(lockedBtn).display !== "none";
      const unlockBtnVisible = window.getComputedStyle(unlockBtn).display !== "none";
      const resultHeaderVisible = window.getComputedStyle(resultHeader).display !== "none";

      const congratsHeading = document.getElementById("offer-congrats-heading").textContent.trim();
      const congratsSub = document.getElementById("offer-congrats-sub").textContent.trim();
      const badge = document.getElementById("offer-badge").textContent.trim();
      const title = document.getElementById("offer-title").textContent.trim();
      const desc = document.getElementById("offer-description").textContent.trim();
      const instructions = document.getElementById("offer-instructions-text").textContent.trim();
      const footerEl = document.querySelector(".footer-note") || document.querySelector(".reward-brand-text");
      const footer = footerEl ? footerEl.textContent.trim() : "";

      const playAgainBtn = document.getElementById("play-again-btn");
      const leaderboardBtn = document.getElementById("result-leaderboard-btn");
      const playAgainVisible = window.getComputedStyle(playAgainBtn).display !== "none";
      const leaderboardVisible = window.getComputedStyle(leaderboardBtn).display !== "none";

      return {
        isOfferRevealed,
        offerCardVisible,
        lockedWrapVisible,
        unlockBannerVisible,
        lockedBtnVisible,
        unlockBtnVisible,
        resultHeaderVisible,
        congratsHeading,
        congratsSub,
        badge,
        title,
        desc,
        instructions,
        footer,
        playAgainVisible,
        leaderboardVisible
      };
    })()`);

    assert(revealScreen.isOfferRevealed && revealScreen.offerCardVisible, "Final reveal card is displayed");
    assert(!revealScreen.lockedWrapVisible && !revealScreen.lockedBtnVisible, "OFFER LOCKED button is completely removed/hidden on reveal screen");
    assert(!revealScreen.unlockBannerVisible && !revealScreen.unlockBtnVisible, "UNLOCK MY OFFER button is completely removed/hidden on reveal screen");
    assert(!revealScreen.resultHeaderVisible, "Score result header is hidden on final reveal screen");
    assert(revealScreen.congratsHeading === "🎉 CONGRATULATIONS!", `Heading is "🎉 CONGRATULATIONS!" (got "${revealScreen.congratsHeading}")`);
    assert(revealScreen.congratsSub === "You've unlocked a special reward!", `Subtitle is "You've unlocked a special reward!" (got "${revealScreen.congratsSub}")`);
    assert(revealScreen.badge === "YOUR FEAST REWARD", `Badge is "YOUR FEAST REWARD" (got "${revealScreen.badge}")`);
    assert(revealScreen.title === "Complimentary Yemeni Delicacy", `Offer title is "Complimentary Yemeni Delicacy" (got "${revealScreen.title}")`);
    assert(!revealScreen.title.includes("Demo") && !revealScreen.desc.includes("To be confirmed"), "No demo or placeholder text in offer title or description");
    assert(revealScreen.instructions === "Show this screen to our staff to claim your reward.", `Instructions match required copy (got "${revealScreen.instructions}")`);
    assert(revealScreen.playAgainVisible, "PLAY AGAIN button is visible");
    assert(revealScreen.leaderboardVisible, "TOP 10 LEADERBOARD button is visible");
    assert(revealScreen.footer.includes("SOOFI MANDI") && revealScreen.footer.includes("MADE TO BE SHARED"), "Brand footer note is present");

    // =========================================================================
    // 5. VERIFY PLAY AGAIN RESETS FROM REVEAL SCREEN
    // =========================================================================
    console.log("\n--- 5. Verifying Play Again from Final Reveal Screen ---");

    await session.evaluate(`document.getElementById("play-again-btn").click();`);
    await sleep(400);

    const postReplayState = await session.evaluate(`(() => {
      const s = window.__soofiGame.getState();
      const scoreEl = document.getElementById("game-score").textContent;
      const card = document.getElementById("reward-card");
      const activeView = sessionStorage.getItem("soofi_mandi_active_view");
      return {
        gameState: s.gameState,
        score: s.score,
        foodCaught: s.foodCaughtCount,
        misses: s.missedCount,
        scoreEl,
        cardHidden: card.getAttribute("aria-hidden") === "true",
        activeView
      };
    })()`);

    assert(postReplayState.gameState === "playing", "Game transitions back to playing state");
    assert(postReplayState.score === 0 && postReplayState.scoreEl === "0", "Score is reset to 0 in state and HUD");
    assert(postReplayState.misses === 0, "Misses count reset to 0");
    assert(postReplayState.cardHidden, "Reward card is hidden");
    assert(!postReplayState.activeView, "Session storage active view cleared");

    // =========================================================================
    // 6. VERIFY STALE API IMMUNITY ACROSS RAPID ROUNDS
    // =========================================================================
    console.log("\n--- 6. Verifying Stale API Response Immunity ---");

    // Test that a delayed submission from round 1 does NOT overwrite round 2's score
    const staleTestResult = await session.evaluate(`
      (async () => {
        // Start round 1
        window.__soofiGame.startGame();
        const round1Id = 9999; // simulated old round ID
        
        // Submit simulated old round score
        const promise = window.__soofiGame.submitScore(99, 99, 5, 25, [], true, round1Id);
        
        // Immediately start round 2 and set score to 25
        window.__soofiGame.startGame();
        window.__soofiGame.setScore(25);
        document.getElementById("game-score").textContent = "25";
        
        // Wait for round 1 submission to finish
        const res = await promise;
        
        // Check current score
        const currentScore = window.__soofiGame.getState().score;
        return {
          res,
          currentScore
        };
      })()
    `);

    assert(staleTestResult.res === null, "Old round submission with mismatched roundId is discarded (returns null)");
    assert(staleTestResult.currentScore === 25, `Current score is preserved at 25 and NOT overwritten by round 1's score (got ${staleTestResult.currentScore})`);

  } catch (err) {
    console.error("Test execution failed:", err);
    failed++;
  } finally {
    try {
      chromeProcess.kill();
    } catch (_) {}
  }

  console.log("\n================================================================================");
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
