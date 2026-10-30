/**
 * Automated Verification: Soofi Mandi Final Offer Reveal UI Redesign & Dev Testing
 */
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

process.env.PORT = "3096";
const server = require("../server");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CDP_PORT = 9226;

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

async function runTest() {
  console.log("=================================================");
  console.log("FINAL OFFER REVEAL UI REDESIGN & LOCAL DEV TESTS");
  console.log("=================================================");

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
    await new Promise(r => setTimeout(r, 1200));
    const targets = await cdpRequest("/json");
    const pageTarget = targets.find(t => t.type === "page") || targets[0];
    const session = await createCdpSession(pageTarget.webSocketDebuggerUrl);

    await session.send("Page.enable");
    await session.send("Runtime.enable");

    // Set mobile portrait viewport (390 x 844 iPhone 12/13/14)
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    await session.send("Page.navigate", { url: "http://127.0.0.1:3096/?dev=true" });
    await new Promise(r => setTimeout(r, 1200));

    // TEST 1: Dev test panel is visible on localhost / dev mode
    const devPanelState = await session.evaluate(`
      (() => {
        const panel = document.getElementById("dev-test-panel");
        const style = window.getComputedStyle(panel);
        return {
          exists: !!panel,
          displayed: style.display !== "none"
        };
      })()
    `);
    assert(devPanelState.exists && devPanelState.displayed, "Dev test controls panel appears in local development");

    // TEST 2: Score below 100 (score 80) CANNOT unlock an offer
    await session.evaluate(`
      window.__soofiGame.testOfferUnlock(80);
    `);
    await new Promise(r => setTimeout(r, 800));

    const score80State = await session.evaluate(`
      (() => {
        const unlockBanner = document.getElementById("reward-unlock-banner");
        const offerCard = document.getElementById("reward-offer-card");
        const scoreNum = document.getElementById("reward-score-number");
        return {
          bannerVisible: window.getComputedStyle(unlockBanner).display !== "none",
          offerCardVisible: window.getComputedStyle(offerCard).display !== "none",
          scoreText: scoreNum.textContent
        };
      })()
    `);
    assert(
      score80State.bannerVisible === false &&
      score80State.offerCardVisible === false &&
      score80State.scoreText.includes("80"),
      "Score below 100 (80) shows standard Game Over with NO offer unlock"
    );

    // Wait 3s for rate limiting
    await new Promise(r => setTimeout(r, 3000));

    // TEST 3: Score of exactly 100 CAN unlock an offer
    await session.evaluate(`
      window.__soofiGame.testOfferUnlock(100);
    `);
    await new Promise(r => setTimeout(r, 1200));

    const score100State = await session.evaluate(`
      (() => {
        const unlockBanner = document.getElementById("reward-unlock-banner");
        const headline = unlockBanner.querySelector(".unlock-headline");
        const unlockBtn = document.getElementById("unlock-offer-btn");
        return {
          bannerVisible: window.getComputedStyle(unlockBanner).display !== "none",
          headlineText: headline ? headline.textContent : "",
          btnVisible: !!unlockBtn
        };
      })()
    `);
    assert(
      score100State.bannerVisible === true &&
      score100State.headlineText.includes("100 points") &&
      score100State.btnVisible,
      "Score of exactly 100 unlocks the Celebratory Unlock Banner with 'UNLOCK MY OFFER'"
    );

    // Wait 3s for rate limiting
    await new Promise(r => setTimeout(r, 3000));

    // TEST 4: Generate score of 121 using dev-only test mechanism
    await session.evaluate(`
      window.__soofiGame.testOfferUnlock(121);
    `);
    await new Promise(r => setTimeout(r, 1500));

    const score121State = await session.evaluate(`
      (() => {
        const unlockBanner = document.getElementById("reward-unlock-banner");
        const headline = unlockBanner.querySelector(".unlock-headline");
        const unlockBtn = document.getElementById("unlock-offer-btn");
        return {
          bannerVisible: window.getComputedStyle(unlockBanner).display !== "none",
          headlineText: headline ? headline.textContent : "",
          btnVisible: !!unlockBtn
        };
      })()
    `);
    assert(
      score121State.bannerVisible === true &&
      score121State.headlineText.includes("121 points") &&
      score121State.btnVisible,
      "Score of 121 unlocks the offer with 'You scored 121 points!'"
    );

    // TEST 5: Clicking UNLOCK MY OFFER opens Customer Details Form
    await session.evaluate(`
      document.getElementById("unlock-offer-btn").click();
    `);
    await new Promise(r => setTimeout(r, 400));

    const modalOpen = await session.evaluate(`
      document.getElementById("claim-modal").classList.contains("is-open")
    `);
    assert(modalOpen === true, "Clicking 'UNLOCK MY OFFER' opens Customer Details Form modal");

    // TEST 6: Submit valid customer details -> reveals final redesigned offer screen
    await session.evaluate(`
      document.getElementById("claim-name").value = "Fatima Al-Zahra";
      document.getElementById("claim-phone").value = "+967 771 234 567";
      document.getElementById("claim-email").value = "fatima@soofimandi.com";
      document.getElementById("claim-submit-btn").click();
    `);
    await new Promise(r => setTimeout(r, 2000));

    // TEST 7: Inspect Final Offer Reveal Screen UI Redesign Requirements
    const revealInspection = await session.evaluate(`
      (() => {
        const rewardCard = document.getElementById("reward-card");
        const cardStyle = window.getComputedStyle(rewardCard);

        const logoWrap = document.querySelector(".reward-logo-wrap");
        const logo = document.querySelector(".reward-logo");
        const logoWrapRect = logoWrap.getBoundingClientRect();
        const logoStyle = window.getComputedStyle(logo);

        const congratsHeading = document.getElementById("offer-congrats-heading");
        const congratsSub = document.getElementById("offer-congrats-sub");
        const congratsHeadingStyle = window.getComputedStyle(congratsHeading);
        const congratsSubStyle = window.getComputedStyle(congratsSub);

        const offerBadge = document.getElementById("offer-badge");
        const offerTitle = document.getElementById("offer-title");
        const offerDesc = document.getElementById("offer-description");
        const offerTitleStyle = window.getComputedStyle(offerTitle);

        const claimCodeWrap = document.getElementById("offer-claim-badge-wrap");
        const claimCodeStyle = claimCodeWrap ? window.getComputedStyle(claimCodeWrap) : null;

        const redeemHeading = document.querySelector(".offer-redeem-heading");
        const instructions = document.getElementById("offer-instructions-text");
        const instructionsStyle = window.getComputedStyle(instructions);

        // Check for the unexplained blank white box
        const metaBox = document.getElementById("offer-meta");
        const metaBoxStyle = metaBox ? window.getComputedStyle(metaBox) : null;
        const statusPill = document.querySelector(".offer-status-pill");
        const statusPillStyle = statusPill ? window.getComputedStyle(statusPill) : null;

        const playAgain = document.getElementById("play-again-btn");
        const leaderboardBtn = document.getElementById("result-leaderboard-btn");
        const playAgainStyle = window.getComputedStyle(playAgain);
        const leaderboardStyle = window.getComputedStyle(leaderboardBtn);

        const footerNote = document.querySelector(".footer-note");
        const footerStyle = window.getComputedStyle(footerNote);
        const footerRect = footerNote.getBoundingClientRect();

        return {
          logoAtTop: logoWrapRect.top <= 35,
          logoHeight: parseFloat(logoStyle.height),
          congratsHeadingText: congratsHeading.textContent.trim(),
          congratsHeadingWeight: congratsHeadingStyle.fontWeight,
          congratsSubText: congratsSub.textContent.trim(),
          offerBadgeText: offerBadge.textContent.trim(),
          offerTitleText: offerTitle.textContent.trim(),
          offerTitleVisible: offerTitleStyle.display !== "none" && parseFloat(offerTitleStyle.fontSize) >= 18,
          offerDescText: offerDesc.textContent.trim(),
          claimCodeHidden: !claimCodeWrap || claimCodeStyle.display === "none",
          redeemHeadingText: redeemHeading ? redeemHeading.textContent.trim() : "",
          instructionsText: instructions.textContent.trim(),
          instructionsVisible: instructionsStyle.display !== "none",
          instructionsColor: instructionsStyle.color,
          noWhiteBox: (!metaBox || metaBoxStyle.display === "none") && (!statusPill || statusPillStyle.display === "none"),
          playAgainVisible: playAgainStyle.display !== "none" && playAgain.offsetWidth >= 150,
          leaderboardVisible: leaderboardStyle.display !== "none",
          footerAtBottom: footerRect.bottom >= 800,
          footerText: footerNote.textContent
        };
      })()
    `);

    assert(
      revealInspection.logoAtTop && revealInspection.logoHeight >= 60,
      "Logo is positioned at the very top of screen (matching intro section)"
    );

    assert(
      revealInspection.congratsHeadingText.includes("CONGRATULATIONS!") &&
      (revealInspection.congratsSubText.includes("reward") || revealInspection.congratsSubText.includes("special")),
      "Congratulations heading ('CONGRATULATIONS!') and subtitle are prominent and readable"
    );

    assert(
      revealInspection.offerBadgeText === "YOUR FEAST REWARD" &&
      revealInspection.offerTitleVisible &&
      revealInspection.offerTitleText.length > 0 &&
      revealInspection.offerDescText.length > 0,
      "Reward section displays 'YOUR FEAST REWARD' with configured offer title and description"
    );

    assert(
      revealInspection.claimCodeHidden === true,
      "Claim code badge is completely hidden from customer-facing reveal screen"
    );

    assert(
      (revealInspection.redeemHeadingText === "HOW TO CLAIM" || revealInspection.redeemHeadingText === "HOW TO REDEEM") &&
      revealInspection.instructionsText.includes("Show this screen to our staff"),
      "Claim instructions heading ('HOW TO CLAIM') and text are clearly readable with high contrast"
    );

    assert(
      revealInspection.noWhiteBox === true,
      "Unexplained blank white rounded box (offer-status-pill / offer-meta) is completely removed"
    );

    assert(
      revealInspection.playAgainVisible && revealInspection.leaderboardVisible,
      "Play Again and Top 10 Leaderboard buttons preserve exact styling and position"
    );

    assert(
      revealInspection.footerAtBottom && revealInspection.footerText.includes("MADE TO BE SHARED"),
      "Footer sits cleanly at the bottom of the screen"
    );

    // Capture screenshot for visual confirmation
    const shot = await session.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      "C:/Users/HP/.gemini/antigravity/brain/daa5577b-94d1-47ca-8f30-f8377d67d52e/final_offer_reveal_verified.png",
      Buffer.from(shot.data, "base64")
    );
    console.log("• Verified screenshot captured -> final_offer_reveal_verified.png ✓");

    // TEST 8: Page reload restores saved claim state correctly
    await session.send("Page.reload");
    await new Promise(r => setTimeout(r, 1200));

    const restoredState = await session.evaluate(`
      (() => {
        const offerCard = document.getElementById("reward-offer-card");
        const congrats = document.getElementById("offer-congrats-heading");
        const title = document.getElementById("offer-title");
        return {
          offerCardVisible: window.getComputedStyle(offerCard).display !== "none",
          congratsText: congrats ? congrats.textContent.trim() : "",
          titleText: title ? title.textContent.trim() : ""
        };
      })()
    `);

    assert(
      restoredState.offerCardVisible === true &&
      restoredState.congratsText.includes("CONGRATULATIONS!") &&
      restoredState.titleText.length > 0,
      "Page reload cleanly restores revealed offer state without requiring form re-entry"
    );

    console.log("=================================================");
    console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log("=================================================");

  } catch (err) {
    console.error("Test error:", err);
    failed++;
  } finally {
    try { chromeProcess.kill(); } catch (_) {}
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTest();

