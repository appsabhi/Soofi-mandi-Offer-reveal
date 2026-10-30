/**
 * Browser CDP End-to-End Verification Test
 * Tests UI flows directly in real Chrome:
 * 1. Score < 100: No unlock banner, standard game over.
 * 2. Score >= 100: Unlocks banner with "🎉 You scored 100 points!" and "UNLOCK MY OFFER".
 * 3. Modal opens on click, "Back to Score" closes modal safely.
 * 4. Customer Details Form inline validations (name, phone, email).
 * 5. Form submission, Neon claim creation, confetti, Special Offer reveal view.
 * 6. Page reload restores revealed offer state.
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

process.env.PORT = "3099";
const server = require("../server");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CDP_PORT = 9223;

function cdpRequest(endpoint) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${CDP_PORT}${endpoint}`, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
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

async function runBrowserTest() {
  console.log("=================================================");
  console.log("CHROME BROWSER E2E TESTS — SOOFI MANDI OFFER FLOW");
  console.log("=================================================");

  // Launch headless Chrome
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

  function assert(condition, name) {
    if (condition) {
      console.log(`• ${name}... PASSED ✓`);
      passed++;
    } else {
      console.error(`• ${name}... FAILED ✗`);
      failed++;
    }
  }

  try {
    // Wait for Chrome remote debugging
    await new Promise(r => setTimeout(r, 1200));

    const targets = await cdpRequest("/json");
    const pageTarget = targets.find(t => t.type === "page") || targets[0];
    const session = await createCdpSession(pageTarget.webSocketDebuggerUrl);

    await session.send("Page.enable");
    await session.send("Runtime.enable");

    // Navigate to game
    await session.send("Page.navigate", { url: "http://127.0.0.1:3099/" });
    await new Promise(r => setTimeout(r, 1000));

    // TEST 1: Page Loads on Intro Screen
    const introActive = await session.evaluate(`
      document.getElementById("view-intro").classList.contains("is-active")
    `);
    assert(introActive === true, "Game initializes cleanly on Intro Screen");

    // TEST 2: Simulate Game Round with Score < 100 (e.g. 80)
    await session.evaluate(`
      window.__soofiGame.startGame();
      window.__soofiGame.setRoundStartTime(performance.now() - 40000);
      window.__soofiGame.setScore(80);
      window.__soofiGame.endGameLoss();
    `);
    await new Promise(r => setTimeout(r, 600));

    const scoreUnder100State = await session.evaluate(`
      ({
        unlockBannerVisible: getComputedStyle(document.getElementById("reward-unlock-banner")).display !== "none",
        offerCardVisible: getComputedStyle(document.getElementById("reward-offer-card")).display !== "none",
        scoreNumber: document.getElementById("reward-score-number").textContent,
        kickerText: document.getElementById("reward-kicker").textContent
      })
    `);

    assert(
      scoreUnder100State.unlockBannerVisible === false &&
      scoreUnder100State.offerCardVisible === false &&
      scoreUnder100State.scoreNumber.includes("80") &&
      scoreUnder100State.kickerText === "GAME OVER",
      "Score < 100 displays standard Game Over screen with NO offer unlock banner"
    );

    // Wait 3s to respect submission rate limit (2.5s)
    await new Promise(r => setTimeout(r, 3000));

    // TEST 3: Simulate Game Round with Score >= 100 (e.g. 100)
    await session.evaluate(`
      // Reset and simulate ending game at score 100 with valid physical duration (50s)
      window.__soofiGame.startGame();
      window.__soofiGame.setRoundStartTime(performance.now() - 50000);
      window.__soofiGame.setScore(100);
      window.__soofiGame.endGameLoss();
    `);
    await new Promise(r => setTimeout(r, 1500));

    const score100State = await session.evaluate(`
      ({
        unlockBannerVisible: getComputedStyle(document.getElementById("reward-unlock-banner")).display !== "none",
        unlockHeadline: document.querySelector(".unlock-headline").textContent,
        unlockBtnVisible: !!document.getElementById("unlock-offer-btn"),
        offerCardVisible: getComputedStyle(document.getElementById("reward-offer-card")).display !== "none",
        kickerText: document.getElementById("reward-kicker").textContent
      })
    `);

    assert(
      score100State.unlockBannerVisible === true &&
      score100State.unlockHeadline.includes("You scored 100 points!") &&
      score100State.unlockBtnVisible === true &&
      score100State.offerCardVisible === false,
      "Score 100 displays Celebratory Unlock Banner with 'You scored 100 points!' and 'UNLOCK MY OFFER' button"
    );

    // TEST 4: Clicking "UNLOCK MY OFFER" opens Customer Details Form Modal
    await session.evaluate(`
      document.getElementById("unlock-offer-btn").click();
    `);
    await new Promise(r => setTimeout(r, 300));

    const modalOpen = await session.evaluate(`
      document.getElementById("claim-modal").classList.contains("is-open")
    `);
    assert(modalOpen === true, "Clicking 'UNLOCK MY OFFER' opens Customer Details Form modal");

    // TEST 5: Clicking "← Back to Score" closes modal without losing session
    await session.evaluate(`
      document.getElementById("cancel-claim-btn").click();
    `);
    await new Promise(r => setTimeout(r, 300));

    const modalClosed = await session.evaluate(`
      !document.getElementById("claim-modal").classList.contains("is-open") &&
      getComputedStyle(document.getElementById("reward-unlock-banner")).display !== "none"
    `);
    assert(modalClosed === true, "Clicking '← Back to Score' returns cleanly to score screen without losing session");

    // TEST 6: Re-open modal and submit empty form -> triggers inline validations
    await session.evaluate(`
      document.getElementById("unlock-offer-btn").click();
      document.getElementById("claim-name").value = "";
      document.getElementById("claim-phone").value = "";
      document.getElementById("claim-email").value = "invalid-email";
      document.getElementById("claim-submit-btn").click();
    `);
    await new Promise(r => setTimeout(r, 300));

    const validationErrors = await session.evaluate(`
      ({
        nameError: document.getElementById("claim-name-error").textContent,
        phoneError: document.getElementById("claim-phone-error").textContent,
        emailError: document.getElementById("claim-email-error").textContent,
        modalStillOpen: document.getElementById("claim-modal").classList.contains("is-open")
      })
    `);

    assert(
      validationErrors.nameError.length > 0 &&
      validationErrors.phoneError.length > 0 &&
      validationErrors.emailError.length > 0 &&
      validationErrors.modalStillOpen === true,
      "Invalid inputs trigger inline validation errors and prevent submission"
    );

    // TEST 7: Fill valid details and submit -> reveals special offer
    await session.evaluate(`
      document.getElementById("claim-name").value = "Tariq Al-Mansoor";
      document.getElementById("claim-phone").value = "+91 98765 43210";
      document.getElementById("claim-email").value = "tariq@example.com";
      document.getElementById("claim-submit-btn").click();
    `);
    await new Promise(r => setTimeout(r, 2500));

    const debugState = await session.evaluate(`
      ({
        alertError: document.getElementById("claim-alert-error").textContent,
        alertErrorDisplay: getComputedStyle(document.getElementById("claim-alert-error")).display,
        gameState: window.__soofiGame.getState()
      })
    `);
    console.log("Debug state in Test 7:", JSON.stringify(debugState));

    const offerRevealedState = await session.evaluate(`
      ({
        modalOpen: document.getElementById("claim-modal").classList.contains("is-open"),
        offerCardVisible: getComputedStyle(document.getElementById("reward-offer-card")).display !== "none",
        offerBadgeText: document.getElementById("offer-badge").textContent,
        congratsText: document.getElementById("offer-congrats-headline").textContent,
        offerTitle: document.getElementById("offer-title").textContent,
        claimCode: document.getElementById("offer-claim-code").textContent,
        instructions: document.getElementById("offer-instructions-text").textContent,
        unlockBannerVisible: getComputedStyle(document.getElementById("reward-unlock-banner")).display !== "none"
      })
    `);

    assert(
      offerRevealedState.modalOpen === false &&
      offerRevealedState.offerCardVisible === true &&
      offerRevealedState.offerBadgeText.includes("YOUR SPECIAL OFFER") &&
      offerRevealedState.congratsText.includes("Congratulations! Your Soofi Mandi treat is ready.") &&
      offerRevealedState.claimCode.length > 5 &&
      offerRevealedState.instructions.includes("Show this screen to our staff at Soofi Mandi") &&
      offerRevealedState.unlockBannerVisible === false,
      "Valid submission saves claim to Neon, closes modal, and reveals Special Offer view with instructions and Claim Code"
    );

    // TEST 8: Page Refresh restores the revealed offer view
    await session.send("Page.reload");
    await new Promise(r => setTimeout(r, 1000));

    const restoredState = await session.evaluate(`
      ({
        offerCardVisible: getComputedStyle(document.getElementById("reward-offer-card")).display !== "none",
        congratsText: document.getElementById("offer-congrats-headline").textContent,
        claimCode: document.getElementById("offer-claim-code").textContent
      })
    `);

    assert(
      restoredState.offerCardVisible === true &&
      restoredState.congratsText.includes("Congratulations! Your Soofi Mandi treat is ready.") &&
      restoredState.claimCode.length > 5,
      "Page reload cleanly restores revealed offer state without requiring form re-entry"
    );

    session.ws.close();
  } catch (err) {
    console.error("Browser test exception:", err);
    failed++;
  } finally {
    try {
      chromeProcess.kill();
    } catch (_) {}
  }

  console.log("\n=================================================");
  console.log(`BROWSER E2E TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  server.close(() => {
    process.exit(failed > 0 ? 1 : 0);
  });
}

runBrowserTest();
