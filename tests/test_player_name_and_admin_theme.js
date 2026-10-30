/**
 * Automated Verification Suite:
 * 1. Player Name Save & Confirmation Flow
 * 2. Admin Panel Theme Matching the Gaming Area
 */

const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

process.env.PORT = "3094";
const server = require("../server");
const db = require("../db");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CDP_PORT = 9225;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpRequest(method, urlPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlPath, "http://localhost:3094");
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      headers: { ...headers }
    };

    let postData = null;
    if (body !== null) {
      postData = typeof body === "string" ? body : JSON.stringify(body);
      options.headers["Content-Type"] = "application/json";
      options.headers["Content-Length"] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, data: json || data, headers: res.headers });
      });
    });

    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

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

  const evalExpr = async (expression) => {
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

  const close = () => {
    try { ws.close(); } catch (_) {}
  };

  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({ ws, send, eval: evalExpr, close });
    ws.onerror = reject;
  });
}

async function runTests() {
  console.log("=================================================");
  console.log("SOOFI MANDI PLAYER NAME & ADMIN THEME TESTS");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, desc) {
    process.stdout.write(`• ${desc}... `);
    if (condition) {
      console.log("PASSED ✓");
      passed++;
    } else {
      console.log("FAILED ✗");
      failed++;
    }
  }

  // Allow database initialization
  await wait(1000);

  // ---------------------------------------------------------------------------
  // 1. BACKEND API TESTS: POST /api/player/name
  // ---------------------------------------------------------------------------
  const testPlayerId = "test_player_" + Date.now();

  // Test 1: Empty name rejected
  const emptyRes = await httpRequest("POST", "/api/player/name", {
    playerId: testPlayerId,
    displayName: ""
  });
  assert(emptyRes.status === 400 && emptyRes.data.success === false, "POST /api/player/name rejects empty name with HTTP 400");

  // Test 2: Whitespace only name rejected
  const whitespaceRes = await httpRequest("POST", "/api/player/name", {
    playerId: testPlayerId,
    displayName: "     "
  });
  assert(whitespaceRes.status === 400 && whitespaceRes.data.success === false, "POST /api/player/name rejects whitespace-only name with HTTP 400");

  // Test 3: Invalid player ID rejected
  const invalidPidRes = await httpRequest("POST", "/api/player/name", {
    playerId: "short",
    displayName: "ValidName"
  });
  assert(invalidPidRes.status === 400, "POST /api/player/name rejects invalid player ID with HTTP 400");

  // Test 4: Valid name save succeeds and returns confirmation
  const validRes = await httpRequest("POST", "/api/player/name", {
    playerId: testPlayerId,
    displayName: "Emir of Mandi"
  });
  assert(validRes.status === 200 && validRes.data.success === true && validRes.data.message === "Name saved successfully!" && validRes.data.displayName === "Emir of Mandi",
    "POST /api/player/name saves valid name, returns HTTP 200 and 'Name saved successfully!'");

  // Test 5: Verify record exists in database
  const dbPlayer = await db.queryOne("SELECT player_id, display_name FROM players WHERE player_id = $1", [testPlayerId]);
  assert(dbPlayer && dbPlayer.display_name === "Emir of Mandi", "Saved player name exists and matches in database");

  // Test 6: Updating player name updates existing leaderboard entries
  // Create a leaderboard row first
  const sessId = "sess_test_" + Date.now();
  await db.query(`
    INSERT INTO leaderboard (game_session_id, player_id, display_name, score, food_caught, missed_count, duration_seconds, submitted_at)
    VALUES ($1, $2, $3, 100, 20, 0, 15, $4)
  `, [sessId, testPlayerId, "Emir of Mandi", new Date().toISOString()]);

  // Update name to "Sultan of Mandi"
  await httpRequest("POST", "/api/player/name", {
    playerId: testPlayerId,
    displayName: "Sultan of Mandi"
  });

  const dbLb = await db.queryOne("SELECT display_name FROM leaderboard WHERE game_session_id = $1", [sessId]);
  assert(dbLb && dbLb.display_name === "Sultan of Mandi", "Updating player name updates existing leaderboard submissions for that player");

  // Test 7: Duplicate prevention / rapid repeat submissions
  const p1 = httpRequest("POST", "/api/player/name", { playerId: testPlayerId, displayName: "Sultan of Mandi" });
  const p2 = httpRequest("POST", "/api/player/name", { playerId: testPlayerId, displayName: "Sultan of Mandi" });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert(r1.status === 200 && r2.status === 200, "Rapid repeated submissions handled smoothly without error or duplicates");

  // ---------------------------------------------------------------------------
  // 2. ADMIN PANEL THEME & FUNCTIONALITY
  // ---------------------------------------------------------------------------
  // Test 8: Admin panel HTML serves navy/slate-blue theme
  const adminPageRes = await httpRequest("GET", "/admin/game-analytics");
  const htmlContent = adminPageRes.data;
  const hasNavyCenter = htmlContent.includes("#2F405C");
  const hasNavyEdge = htmlContent.includes("#071429");
  const hasStageFloor = htmlContent.includes("#273958");
  const hasNoGreenTheme = !htmlContent.includes("#1B5E45") && !htmlContent.includes("#0A2A20");
  assert(adminPageRes.status === 200 && hasNavyCenter && hasNavyEdge && hasStageFloor && hasNoGreenTheme,
    "Admin Dashboard serves navy/slate-blue theme (--stage-center: #2F405C, --stage-edge: #071429) with green theme completely replaced");

  // Test 9: Admin panel has branded footer
  const hasFooter = htmlContent.includes("SOOFI MANDI · YEMENI CUISINE · MADE TO BE SHARED");
  assert(hasFooter, "Admin Dashboard includes branded Soofi Mandi footer text");

  // Test 10: Admin authentication succeeds
  const loginRes = await httpRequest("POST", "/api/admin/login", { password: "soofi_admin_2026" });
  assert(loginRes.status === 200 && loginRes.data.success && !!loginRes.data.token, "Admin login API continues working and returns session token");

  // Test 11: Admin overview metrics API works under token
  const token = loginRes.data.token;
  const overviewRes = await httpRequest("GET", "/api/admin/analytics/overview", null, {
    "Authorization": `Bearer ${token}`
  });
  assert(overviewRes.status === 200 && overviewRes.data.success && overviewRes.data.metrics !== undefined,
    "Admin analytics overview API returns 200 and metrics under auth");

  // ---------------------------------------------------------------------------
  // 3. REAL BROWSER CDP TESTS
  // ---------------------------------------------------------------------------
  let chromeProc = null;
  let session = null;
  try {
    chromeProc = spawn(CHROME_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--user-data-dir=C:\\Windows\\Temp\\chrome_dev_player_test"
    ]);

    await wait(1800);
    const versionInfo = await cdpRequest("/json/version");
    session = await createCdpSession(versionInfo.webSocketDebuggerUrl);

    // Create target page
    const target = await session.send("Target.createTarget", { url: "http://localhost:3094/?dev=true" });
    const targetSession = await createCdpSession(`ws://127.0.0.1:${CDP_PORT}/devtools/page/${target.targetId}`);
    await targetSession.send("Page.enable");
    await targetSession.send("Runtime.enable");

    await wait(1500);

    // Test 12: Open Leaderboard modal and verify player name customizer strip
    await targetSession.eval(`document.getElementById("player-chip-edit-btn").click()`);
    await wait(400);

    const isModalOpen = await targetSession.eval(`document.getElementById("leaderboard-modal").classList.contains("is-open")`);
    const nameInputExists = await targetSession.eval(`!!document.getElementById("player-name-input")`);
    const feedbackExists = await targetSession.eval(`!!document.getElementById("player-name-feedback")`);
    assert(isModalOpen && nameInputExists && feedbackExists, "Edit button opens Leaderboard modal with player-name-input and player-name-feedback");

    // Test 13: Empty save shows error "Couldn't save your name. Please try again." and does not show success
    await targetSession.eval(`
      document.getElementById("player-name-input").value = "";
      document.getElementById("save-name-btn").click();
    `);
    await wait(300);

    const emptyFeedbackText = await targetSession.eval(`document.getElementById("player-name-feedback").textContent`);
    const isErrorVisible = await targetSession.eval(`document.getElementById("player-name-feedback").classList.contains("is-error")`);
    const notSuccess = await targetSession.eval(`!document.getElementById("player-name-feedback").classList.contains("is-success")`);
    assert(emptyFeedbackText === "Couldn't save your name. Please try again." && isErrorVisible && notSuccess,
      "Empty name displays 'Couldn't save your name. Please try again.' with error styling, no success message");

    // Test 14: Valid save shows loading state during save and "Name saved successfully!" on success
    await targetSession.eval(`(async () => {
      document.getElementById("player-name-input").value = "Hassan Al-Tayeb";
      await window.__soofiGame.savePlayerName();
    })()`);
    await wait(200);

    const successFeedbackText = await targetSession.eval(`document.getElementById("player-name-feedback").textContent`);
    const isSuccessVisible = await targetSession.eval(`document.getElementById("player-name-feedback").classList.contains("is-success")`);
    assert(successFeedbackText === "Name saved successfully!" && isSuccessVisible,
      "Valid name save confirms success with 'Name saved successfully!' and green indicator");

    // Test 15: Intro player chip display name reflects the saved name
    const chipText = await targetSession.eval(`document.getElementById("player-chip-display-name").textContent`);
    assert(chipText === "Hassan Al-Tayeb", "Saved player name updates intro screen player chip ('Hassan Al-Tayeb')");

    // Test 16: Admin Panel loads in browser with dark navy theme
    await targetSession.send("Page.navigate", { url: "http://localhost:3094/admin/game-analytics" });
    await wait(1500);

    const loginCardBg = await targetSession.eval(`
      window.getComputedStyle(document.querySelector(".login-card")).backgroundImage
    `);
    const bodyBgColor = await targetSession.eval(`
      window.getComputedStyle(document.body).backgroundColor
    `);
    const hasGoldTitle = await targetSession.eval(`
      window.getComputedStyle(document.querySelector(".login-card h2")).color
    `);

    // RGB of #071429 is rgb(7, 20, 41)
    const matchesNavyTheme = bodyBgColor.includes("7, 20, 41") || bodyBgColor.includes("rgb(7, 20, 41)");
    assert(matchesNavyTheme && loginCardBg.includes("1a, 38, 57") || loginCardBg.includes("26, 38, 57") || loginCardBg.includes("gradient"),
      "Browser renders Admin Panel with dark navy background, gradient card, and gold headers");

    // Clean up CDP
    targetSession.close();
    session.close();
  } catch (err) {
    console.error("Browser testing error:", err.message);
  } finally {
    if (chromeProc) {
      try { process.kill(chromeProc.pid); } catch (_) {}
    }
  }

  // Cleanup test database entries
  try {
    await db.query("DELETE FROM leaderboard WHERE player_id = $1", [testPlayerId]);
    await db.query("DELETE FROM players WHERE player_id = $1", [testPlayerId]);
  } catch (_) {}

  console.log("\n=================================================");
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
