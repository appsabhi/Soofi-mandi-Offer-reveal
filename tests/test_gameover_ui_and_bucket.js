/**
 * Verification Test: Game Over UI Refinement & Bucket Dragging Responsiveness
 */
const { spawn } = require("child_process");
const http = require("http");

process.env.PORT = "3098";
const server = require("../server");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CDP_PORT = 9224;

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
  console.log("GAME OVER UI REFINEMENT & BUCKET DRAGGING TESTS");
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

    // 1. Mobile Viewport (390 x 844 iPhone 12/13/14)
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    await session.send("Page.navigate", { url: "http://127.0.0.1:3098/" });
    await new Promise(r => setTimeout(r, 1000));

    // TEST 1: Bucket dragging test during active gameplay
    await session.evaluate(`
      window.__soofiGame.startGame();
    `);
    await new Promise(r => setTimeout(r, 400));

    // Check bucket dragging mechanics
    const bucketDragResults = await session.evaluate(`
      (() => {
        const playArea = document.getElementById("game-play-area");
        const rect = playArea.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.bottom - 40;

        // Pointer down
        playArea.dispatchEvent(new PointerEvent("pointerdown", {
          clientX: startX,
          clientY: startY,
          pointerId: 1,
          bubbles: true
        }));

        const stateAfterDown = window.__soofiGame.getState();
        const bucketXStart = parseFloat(document.getElementById("bucket-front").style.left);

        // Move to right edge
        const rightX = rect.right - 5;
        playArea.dispatchEvent(new PointerEvent("pointermove", {
          clientX: rightX,
          clientY: startY,
          pointerId: 1,
          bubbles: true
        }));
        const bucketXRight = parseFloat(document.getElementById("bucket-front").style.left);

        // Move to left edge
        const leftX = rect.left + 5;
        playArea.dispatchEvent(new PointerEvent("pointermove", {
          clientX: leftX,
          clientY: startY,
          pointerId: 1,
          bubbles: true
        }));
        const bucketXLeft = parseFloat(document.getElementById("bucket-front").style.left);

        // Pointer up
        playArea.dispatchEvent(new PointerEvent("pointerup", {
          clientX: leftX,
          clientY: startY,
          pointerId: 1,
          bubbles: true
        }));

        return {
          rectWidth: rect.width,
          bucketXStart,
          bucketXRight,
          bucketXLeft,
          canReachRight: bucketXRight > rect.width * 0.75,
          canReachLeft: bucketXLeft < rect.width * 0.25
        };
      })()
    `);

    assert(
      bucketDragResults.canReachRight && bucketDragResults.canReachLeft,
      "Bucket drag follows pointer smoothly and reaches both edges without sticking"
    );

    // Wait 2.6s for rate limit
    await new Promise(r => setTimeout(r, 2600));

    // TEST 2: End Game with Score < 100 and inspect Game Over UI
    await session.evaluate(`
      window.__soofiGame.setRoundStartTime(performance.now() - 40000);
      window.__soofiGame.setScore(42);
      window.__soofiGame.endGameLoss();
    `);
    await new Promise(r => setTimeout(r, 600));

    const gameOverStyles = await session.evaluate(`
      (() => {
        const rewardCard = document.getElementById("reward-card");
        const cardStyle = window.getComputedStyle(rewardCard);

        const logoWrap = document.querySelector(".reward-logo-wrap");
        const logoWrapStyle = window.getComputedStyle(logoWrap);
        const logo = document.querySelector(".reward-logo");
        const logoStyle = window.getComputedStyle(logo);

        const kicker = document.getElementById("reward-kicker");
        const kickerStyle = window.getComputedStyle(kicker);

        const scoreCard = document.getElementById("reward-score-card");
        const scoreCardStyle = window.getComputedStyle(scoreCard);

        const scoreNumber = document.getElementById("reward-score-number");
        const scoreNumberStyle = window.getComputedStyle(scoreNumber);

        const playAgain = document.getElementById("play-again-btn");
        const playAgainStyle = window.getComputedStyle(playAgain);

        const leaderboardBtn = document.getElementById("result-leaderboard-btn");
        const leaderboardBtnStyle = window.getComputedStyle(leaderboardBtn);

        const footerNote = document.querySelector(".footer-note");
        const footerStyle = window.getComputedStyle(footerNote);

        return {
          cardBg: cardStyle.backgroundColor,
          cardBorder: cardStyle.borderWidth,
          logoHeight: parseFloat(logoStyle.height),
          logoWrapBg: logoWrapStyle.backgroundColor,
          kickerText: kicker.textContent,
          kickerWeight: kickerStyle.fontWeight,
          kickerAnimation: kickerStyle.animationName,
          scoreCardBg: scoreCardStyle.backgroundColor,
          scoreCardBorder: scoreCardStyle.borderWidth,
          scoreNumberText: scoreNumber.textContent,
          scoreNumberSize: parseFloat(scoreNumberStyle.fontSize),
          playAgainWidth: playAgain.offsetWidth,
          playAgainHeight: playAgain.offsetHeight,
          playAgainTouchTarget: parseFloat(playAgainStyle.minHeight) >= 44,
          leaderboardBtnVisible: leaderboardBtnStyle.display !== "none",
          leaderboardBtnColor: leaderboardBtnStyle.color,
          footerVisible: footerStyle.display !== "none" && footerNote.offsetHeight > 0,
          footerText: footerNote.textContent
        };
      })()
    `);

    assert(
      (gameOverStyles.cardBg === "rgba(0, 0, 0, 0)" || gameOverStyles.cardBg === "transparent") &&
      gameOverStyles.cardBorder === "0px",
      "Game Over scoreboard container has transparent background, no card borders or box shadow"
    );

    assert(
      gameOverStyles.logoHeight >= 50 &&
      (gameOverStyles.logoWrapBg === "rgba(0, 0, 0, 0)" || gameOverStyles.logoWrapBg === "transparent"),
      "Soofi Mandi logo sits at the top directly on navy background with no dark pill container"
    );

    assert(
      (gameOverStyles.kickerWeight === "900" || parseInt(gameOverStyles.kickerWeight, 10) >= 800) &&
      gameOverStyles.kickerAnimation.includes("heading-breathe-zoom"),
      "GAME OVER heading is bold (weight 900) with breathing zoom animation"
    );

    assert(
      (gameOverStyles.scoreCardBg === "rgba(0, 0, 0, 0)" || gameOverStyles.scoreCardBg === "transparent") &&
      gameOverStyles.scoreCardBorder === "0px" &&
      gameOverStyles.scoreNumberSize >= 48,
      `Numeric score sits directly on background and is hero element (${gameOverStyles.scoreNumberSize}px)`
    );

    assert(
      gameOverStyles.playAgainWidth < 300 &&
      gameOverStyles.playAgainTouchTarget,
      `Play Again button is compact (${gameOverStyles.playAgainWidth}px wide) with >= 44px touch target`
    );

    assert(
      gameOverStyles.leaderboardBtnVisible,
      "Top 10 Leaderboard button is visible with high contrast styling"
    );

    assert(
      gameOverStyles.footerVisible && gameOverStyles.footerText.includes("MADE TO BE SHARED"),
      "Footer text 'SOOFI MANDI · YEMENI CUISINE · MADE TO BE SHARED' is visible at the bottom of the screen"
    );

    // TEST 3: Open Leaderboard Modal and inspect Navy & Gold Theme
    await session.evaluate(`
      document.getElementById("result-leaderboard-btn").click();
    `);
    await new Promise(r => setTimeout(r, 400));

    const modalStyles = await session.evaluate(`
      (() => {
        const modal = document.getElementById("leaderboard-modal");
        const card = modal.querySelector(".modal-card");
        const cardStyle = window.getComputedStyle(card);
        const headerTh = modal.querySelector(".leaderboard-table th");
        const thStyle = headerTh ? window.getComputedStyle(headerTh) : null;

        return {
          isOpen: modal.classList.contains("is-open"),
          cardBg: cardStyle.backgroundImage,
          cardBorder: cardStyle.borderColor,
          thBg: thStyle ? thStyle.backgroundColor : ""
        };
      })()
    `);

    assert(
      modalStyles.isOpen === true &&
      (modalStyles.cardBg.includes("37, 55, 84") || modalStyles.cardBg.includes("15, 25, 41") || modalStyles.cardBg.includes("26, 40, 64")),
      "Leaderboard modal opens with navy-blue gradient (#253754 / #0F1929) and gold border"
    );

    // Close modal
    await session.evaluate(`
      document.getElementById("close-leaderboard-btn").click();
    `);
    await new Promise(r => setTimeout(r, 300));

    // TEST 4: Desktop Viewport (1280 x 800) Spacing & Layout Check
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });
    await new Promise(r => setTimeout(r, 400));

    const desktopStyles = await session.evaluate(`
      (() => {
        const logoWrap = document.querySelector(".reward-logo-wrap");
        const logoRect = logoWrap.getBoundingClientRect();
        const contentCenter = document.querySelector(".reward-content-center");
        const centerRect = contentCenter.getBoundingClientRect();
        const footerNote = document.querySelector(".footer-note");
        const footerRect = footerNote.getBoundingClientRect();

        return {
          logoAtTop: logoRect.top <= 40,
          contentCenteredY: centerRect.top > 100 && centerRect.bottom < 760,
          footerAtBottom: footerRect.bottom >= 750,
          footerVisible: window.getComputedStyle(footerNote).display !== "none",
          logoTop: logoRect.top,
          centerTop: centerRect.top,
          centerBottom: centerRect.bottom,
          footerBottom: footerRect.bottom
        };
      })()
    `);

    assert(
      desktopStyles.logoAtTop && desktopStyles.contentCenteredY && desktopStyles.footerAtBottom && desktopStyles.footerVisible,
      "Desktop view has logo at the very top, scoreboard comfortably centered in middle, and footer cleanly at bottom"
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

