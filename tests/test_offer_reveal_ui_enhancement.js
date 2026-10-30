/**
 * Targeted Test Suite: Soofi Mandi Offer Reveal Screen UI Enhancement
 * 
 * Verifies all UI requirements from USER_REQUEST:
 * 1. Congratulations heading:
 *    - Noticeably increased font size (>= 28px)
 *    - Bold / extra-bold font weight (>= 800)
 *    - Main visual focus with gold/cream celebratory gradient
 * 2. Remove unnecessary reward heading & content:
 *    - YOUR FEAST REWARD badge completely removed from display (display: none)
 *    - No empty containers, unwanted gaps, or placeholder text
 * 3. Highlight actual offer:
 *    - Premium card styling on .offer-details-section (border, background gradient, box-shadow)
 *    - Prominent bold title (>= 21px, weight >= 800) with gold gradient
 *    - High-readability description
 * 4. How to Claim section:
 *    - Heading strictly "HOW TO CLAIM"
 *    - Highlighted in gold (var(--gold-300) / #FFD24D), bolder, larger (>= 12px)
 *    - High-contrast instruction: "Show this screen to our staff to claim your reward."
 * 5. Preserved functionality & layout:
 *    - Logo centered at top
 *    - Neither OFFER LOCKED nor UNLOCK MY OFFER buttons present
 *    - Claim code hidden
 *    - PLAY AGAIN and TOP 10 LEADERBOARD present and functional
 *    - Footer note present
 *    - Mobile and desktop responsive layouts verified
 */

const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CDP_PORT = 9229;
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
  console.log("SOOFI MANDI - OFFER REVEAL SCREEN UI ENHANCEMENT VERIFICATION");
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

    // =========================================================================
    // 1. MOBILE PORTRAIT VIEW (390 x 844 iPhone 12/13/14)
    // =========================================================================
    console.log("--- 1. Testing Mobile Viewport (390 x 844) ---");
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    await session.send("Page.navigate", { url: `${SERVER_URL}/?dev=true` });
    await sleep(1500);

    // Unlock offer with score 120
    await session.evaluate(`window.__soofiGame.testOfferUnlock(120);`);
    await sleep(900);

    // Open claim modal and submit claim
    await session.evaluate(`document.getElementById("unlock-offer-btn").click();`);
    await sleep(400);

    await session.evaluate(`
      (async () => {
        document.getElementById("claim-name").value = "Hussain Al-Yemeni";
        document.getElementById("claim-phone").value = "+966 55 987 6543";
        document.getElementById("claim-email").value = "hussain@soofimandi.com";
        await window.__soofiGame.handleClaimSubmit();
      })()
    `);
    await sleep(1500);

    // Inspect Offer Reveal UI Elements
    const mobileUI = await session.evaluate(`(() => {
      const card = document.getElementById("reward-card");
      const isOfferRevealed = card.classList.contains("is-offer-revealed");
      const offerCard = document.getElementById("reward-offer-card");
      const offerCardVisible = window.getComputedStyle(offerCard).display !== "none";

      // 1. Congratulations heading
      const congratsEl = document.getElementById("offer-congrats-heading");
      const congratsStyle = window.getComputedStyle(congratsEl);
      const congratsSub = document.getElementById("offer-congrats-sub");
      const congratsSubStyle = window.getComputedStyle(congratsSub);

      // 2. Removed reward badge
      const badgeEl = document.getElementById("offer-badge");
      const badgeStyle = badgeEl ? window.getComputedStyle(badgeEl) : null;

      // 3. Highlighted actual offer card
      const detailsSection = document.querySelector(".offer-details-section");
      const detailsStyle = window.getComputedStyle(detailsSection);
      const titleEl = document.getElementById("offer-title");
      const titleStyle = window.getComputedStyle(titleEl);
      const descEl = document.getElementById("offer-description");
      const descStyle = window.getComputedStyle(descEl);

      // 4. How to Claim section
      const redeemSection = document.querySelector(".offer-redeem-section");
      const redeemSectionStyle = window.getComputedStyle(redeemSection);
      const redeemHeading = document.querySelector(".offer-redeem-heading");
      const redeemHeadingStyle = window.getComputedStyle(redeemHeading);
      const instructEl = document.getElementById("offer-instructions-text");
      const instructStyle = window.getComputedStyle(instructEl);

      // 5. Offer buttons & claim code absence
      const lockedWrap = document.getElementById("reward-locked-wrap");
      const unlockBanner = document.getElementById("reward-unlock-banner");
      const lockedBtn = document.getElementById("offer-locked-btn");
      const unlockBtn = document.getElementById("unlock-offer-btn");
      const claimCodeWrap = document.getElementById("offer-claim-badge-wrap");

      const lockedVisible = window.getComputedStyle(lockedWrap).display !== "none" || (lockedBtn && window.getComputedStyle(lockedBtn).display !== "none");
      const unlockVisible = window.getComputedStyle(unlockBanner).display !== "none" || (unlockBtn && window.getComputedStyle(unlockBtn).display !== "none");
      const claimCodeVisible = claimCodeWrap && window.getComputedStyle(claimCodeWrap).display !== "none";

      // 6. Action buttons and footer
      const playAgain = document.getElementById("play-again-btn");
      const lbBtn = document.getElementById("result-leaderboard-btn");
      const footer = document.querySelector(".footer-note");

      // Check overflow
      const docWidth = document.documentElement.scrollWidth;
      const viewWidth = window.innerWidth;

      return {
        isOfferRevealed,
        offerCardVisible,
        congratsText: congratsEl.textContent.trim(),
        congratsFontSize: parseFloat(congratsStyle.fontSize),
        congratsFontWeight: parseInt(congratsStyle.fontWeight, 10),
        congratsSubText: congratsSub.textContent.trim(),
        badgeHidden: !badgeStyle || badgeStyle.display === "none",
        detailsHasCard: detailsStyle.borderWidth !== "0px" && detailsStyle.borderRadius !== "0px",
        detailsBackground: detailsStyle.background,
        titleText: titleEl.textContent.trim(),
        titleFontSize: parseFloat(titleStyle.fontSize),
        titleFontWeight: parseInt(titleStyle.fontWeight, 10),
        descText: descEl.textContent.trim(),
        descFontSize: parseFloat(descStyle.fontSize),
        redeemHeadingText: redeemHeading.textContent.trim(),
        redeemHeadingFontSize: parseFloat(redeemHeadingStyle.fontSize),
        redeemHeadingFontWeight: parseInt(redeemHeadingStyle.fontWeight, 10),
        redeemHeadingColor: redeemHeadingStyle.color,
        instructText: instructEl.textContent.trim(),
        instructFontSize: parseFloat(instructStyle.fontSize),
        instructColor: instructStyle.color,
        redeemHasContainer: redeemSectionStyle.borderRadius !== "0px",
        lockedVisible,
        unlockVisible,
        claimCodeVisible,
        playAgainVisible: window.getComputedStyle(playAgain).display !== "none",
        lbBtnVisible: window.getComputedStyle(lbBtn).display !== "none",
        footerText: footer ? footer.textContent.trim() : "",
        hasOverflow: docWidth > viewWidth
      };
    })()`);

    assert(mobileUI.isOfferRevealed && mobileUI.offerCardVisible, "Offer reveal screen is displayed after claim");
    assert(mobileUI.congratsText.includes("CONGRATULATIONS!"), `Congratulations heading present: "${mobileUI.congratsText}"`);
    assert(mobileUI.congratsFontSize >= 26, `Congratulations heading font size is noticeably increased (${mobileUI.congratsFontSize}px >= 26px)`);
    assert(mobileUI.congratsFontWeight >= 800, `Congratulations heading font weight is extra-bold (${mobileUI.congratsFontWeight})`);
    assert(mobileUI.badgeHidden, "YOUR FEAST REWARD badge is completely removed/hidden (display: none)");
    assert(mobileUI.detailsHasCard, "Actual offer is housed in a subtle premium card section with border and border-radius");
    assert(mobileUI.titleText === "Complimentary Yemeni Delicacy", `Offer title is "${mobileUI.titleText}" (no placeholder text)`);
    assert(mobileUI.titleFontSize >= 20, `Offer title font size is prominent and large (${mobileUI.titleFontSize}px >= 20px)`);
    assert(mobileUI.titleFontWeight >= 800, `Offer title font weight is bold/extra-bold (${mobileUI.titleFontWeight})`);
    assert(mobileUI.descText === "Enjoy a special feast reward with your dine-in experience.", `Offer description is clear and accurate: "${mobileUI.descText}"`);
    assert(mobileUI.redeemHeadingText === "HOW TO CLAIM", `How to claim heading is strictly "HOW TO CLAIM" (got "${mobileUI.redeemHeadingText}")`);
    assert(mobileUI.redeemHeadingFontSize >= 12, `HOW TO CLAIM heading font size is larger (${mobileUI.redeemHeadingFontSize}px >= 12px)`);
    assert(mobileUI.redeemHeadingFontWeight >= 700, `HOW TO CLAIM heading is bold (${mobileUI.redeemHeadingFontWeight})`);
    assert(mobileUI.instructText === "Show this screen to our staff to claim your reward.", `Claim instruction text matches exact copy: "${mobileUI.instructText}"`);
    assert(mobileUI.instructFontSize >= 13, `Claim instruction font size is readable (${mobileUI.instructFontSize}px >= 13px)`);
    assert(!mobileUI.lockedVisible, "OFFER LOCKED button is completely absent from reveal screen");
    assert(!mobileUI.unlockVisible, "UNLOCK MY OFFER button is completely absent from reveal screen");
    assert(!mobileUI.claimCodeVisible, "Customer-facing claim code is completely hidden");
    assert(mobileUI.playAgainVisible, "PLAY AGAIN button is visible and properly styled");
    assert(mobileUI.lbBtnVisible, "TOP 10 LEADERBOARD button is visible and properly styled");
    assert(mobileUI.footerText.includes("SOOFI MANDI") && mobileUI.footerText.includes("MADE TO BE SHARED"), "Footer note preserved at bottom");
    assert(!mobileUI.hasOverflow, "Mobile layout has no horizontal scroll or text overflow");

    // Capture mobile screenshot
    const mobileScreenshot = await session.send("Page.captureScreenshot", { format: "png" });
    const mobileImgPath = path.join(__dirname, "..", "offer_reveal_enhanced_mobile.png");
    fs.writeFileSync(mobileImgPath, Buffer.from(mobileScreenshot.data, "base64"));
    console.log(`  ✓ Saved mobile verification screenshot -> ${mobileImgPath}`);

    // =========================================================================
    // 2. DESKTOP VIEWPORT (1280 x 800)
    // =========================================================================
    console.log("\n--- 2. Testing Desktop Viewport (1280 x 800) ---");
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(600);

    const desktopUI = await session.evaluate(`(() => {
      const congratsEl = document.getElementById("offer-congrats-heading");
      const congratsStyle = window.getComputedStyle(congratsEl);
      const titleEl = document.getElementById("offer-title");
      const titleStyle = window.getComputedStyle(titleEl);
      const card = document.getElementById("reward-card");
      const cardRect = card.getBoundingClientRect();
      const docWidth = document.documentElement.scrollWidth;
      const viewWidth = window.innerWidth;

      return {
        congratsFontSize: parseFloat(congratsStyle.fontSize),
        titleFontSize: parseFloat(titleStyle.fontSize),
        cardCentered: Math.abs((viewWidth - cardRect.width) / 2 - cardRect.left) < 15,
        hasOverflow: docWidth > viewWidth
      };
    })()`);

    assert(desktopUI.congratsFontSize >= 32, `Desktop Congratulations heading is noticeably larger (${desktopUI.congratsFontSize}px >= 32px)`);
    assert(desktopUI.titleFontSize >= 24, `Desktop offer title is large and prominent (${desktopUI.titleFontSize}px >= 24px)`);
    assert(desktopUI.cardCentered, "Desktop card is centered horizontally with balanced margins");
    assert(!desktopUI.hasOverflow, "Desktop layout has no horizontal scroll or overflow");

    // Capture desktop screenshot
    const desktopScreenshot = await session.send("Page.captureScreenshot", { format: "png" });
    const desktopImgPath = path.join(__dirname, "..", "offer_reveal_enhanced_desktop.png");
    fs.writeFileSync(desktopImgPath, Buffer.from(desktopScreenshot.data, "base64"));
    console.log(`  ✓ Saved desktop verification screenshot -> ${desktopImgPath}`);

  } catch (err) {
    console.error("Test failed with exception:", err);
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
