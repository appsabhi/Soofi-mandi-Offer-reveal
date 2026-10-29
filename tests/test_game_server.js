/**
 * Automated Test Suite for Soofi Mandi "Catch the Feast" Server
 * Tests:
 * 1. Leaderboard retrieval (GET /api/leaderboard)
 * 2. Verified score submission (POST /api/leaderboard)
 * 3. Anti-abuse validation & tie-breaking rules
 * 4. Privacy-conscious analytics event tracking & deduplication
 * 5. Admin authentication & overview metrics aggregation
 * 6. Admin event history filtering & player timeline inspector
 * 7. Admin dashboard HTML serving
 */

const http = require("node:http");
const assert = require("node:assert");
const path = require("node:path");

// Launch server on a test port
process.env.PORT = "3099";
process.env.ADMIN_PASSWORD = "test_admin_password_2026";

// Require server to start it
require(path.join(__dirname, "..", "server.js"));

const BASE_URL = "http://127.0.0.1:3099";

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    let postData = null;

    if (body !== null) {
      postData = typeof body === "string" ? body : JSON.stringify(body);
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(postData);
    }

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders
      },
      (res) => {
        let resData = "";
        res.on("data", (chunk) => {
          resData += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(resData);
          } catch (_) {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: resData,
            json
          });
        });
      }
    );

    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log("=================================================");
  console.log("SOOFI MANDI CATCH THE FEAST — AUTOMATED TESTS");
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

  // Allow server to bind socket
  await sleep(250);

  // 1. Leaderboard Initial State
  await test("GET /api/leaderboard returns 200 and leaderboard array", async () => {
    const res = await request("GET", "/api/leaderboard");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(Array.isArray(res.json.leaderboard), true);
    assert.strictEqual(res.json.tieBreakingRule, "Score DESC, submitted_at ASC");
  });

  // 2. Score Submission Validation
  await test("POST /api/leaderboard validates required fields and score-caught match", async () => {
    // Score & caught mismatch
    const badRes1 = await request("POST", "/api/leaderboard", {
      playerId: "test-player-uuid-001",
      displayName: "Tester One",
      score: 10,
      foodCaught: 8, // mismatch!
      missedCount: 5,
      durationSeconds: 12
    });
    assert.strictEqual(badRes1.status, 400);

    // Invalid player ID
    const badRes2 = await request("POST", "/api/leaderboard", {
      playerId: "short", // too short
      displayName: "Tester",
      score: 5,
      foodCaught: 5,
      missedCount: 5,
      durationSeconds: 10
    });
    assert.strictEqual(badRes2.status, 400);

    // Physical sanity check failure (e.g. 50 items in 2 seconds)
    const badRes3 = await request("POST", "/api/leaderboard", {
      playerId: "test-player-uuid-cheat",
      displayName: "Cheater",
      score: 50,
      foodCaught: 50,
      missedCount: 5,
      durationSeconds: 2 // 25 catches/sec is impossible
    });
    assert.strictEqual(badRes3.status, 400);
  });

  // 3. Valid Score Submission & Deterministic Tie-Breaking
  await test("POST /api/leaderboard accepts valid scores and applies deterministic tie-breaking", async () => {
    const p1 = "test-player-uuid-alpha";
    const p2 = "test-player-uuid-beta";

    // Player 1 submits score 15
    const res1 = await request("POST", "/api/leaderboard", {
      playerId: p1,
      displayName: "Alpha Feaster",
      score: 15,
      foodCaught: 15,
      missedCount: 5,
      durationSeconds: 20
    });
    assert.strictEqual(res1.status, 201);
    assert.strictEqual(res1.json.success, true);

    await sleep(50); // slight time difference for submission date

    // Player 2 submits identical score 15
    const res2 = await request("POST", "/api/leaderboard", {
      playerId: p2,
      displayName: "Beta Feaster",
      score: 15,
      foodCaught: 15,
      missedCount: 5,
      durationSeconds: 18
    });
    assert.strictEqual(res2.status, 201);

    // Verify tie breaking: Alpha submitted earlier, so Alpha must rank ahead of Beta!
    const lbRes = await request("GET", "/api/leaderboard");
    const top2 = lbRes.json.leaderboard.filter(e => e.score === 15);
    assert.strictEqual(top2.length >= 2, true);
    assert.strictEqual(top2[0].player_id, p1);
    assert.strictEqual(top2[1].player_id, p2);
  });

  // 4. Analytics Tracking & Deduplication
  await test("POST /api/analytics/events tracks events and deduplicates rapid duplicates", async () => {
    const p = "test-player-uuid-analytics";
    const s = "test-session-uuid-001";

    const res1 = await request("POST", "/api/analytics/events", {
      playerId: p,
      sessionId: s,
      eventName: "game_start",
      metadata: { isReplay: false }
    });
    assert.strictEqual(res1.status, 201);

    // Rapid duplicate within 500ms
    const res2 = await request("POST", "/api/analytics/events", {
      playerId: p,
      sessionId: s,
      eventName: "game_start",
      metadata: { isReplay: false }
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.json.deduplicated, true);

    // Track different event name
    const res3 = await request("POST", "/api/analytics/events", {
      playerId: p,
      sessionId: s,
      eventName: "cta_click",
      metadata: { target: "leaderboard_button" }
    });
    assert.strictEqual(res3.status, 201);
  });

  // 5. Admin Authentication
  let adminToken = "";
  await test("POST /api/admin/login validates password and issues session token", async () => {
    // Bad password
    const badLogin = await request("POST", "/api/admin/login", {
      password: "incorrect_password"
    });
    assert.strictEqual(badLogin.status, 401);

    // Good password
    const goodLogin = await request("POST", "/api/admin/login", {
      password: "test_admin_password_2026"
    });
    assert.strictEqual(goodLogin.status, 200);
    assert.strictEqual(goodLogin.json.success, true);
    assert.strictEqual(typeof goodLogin.json.token, "string");
    adminToken = goodLogin.json.token;
  });

  // 6. Admin Overview Metrics
  await test("GET /api/admin/analytics/overview aggregates metrics under admin auth", async () => {
    // Unauthorized without token
    const unauth = await request("GET", "/api/admin/analytics/overview");
    assert.strictEqual(unauth.status, 401);

    // Authorized with token
    const auth = await request("GET", "/api/admin/analytics/overview", null, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.strictEqual(auth.status, 200);
    assert.strictEqual(auth.json.success, true);
    assert.strictEqual(typeof auth.json.metrics.uniquePlayers, "number");
    assert.strictEqual(typeof auth.json.metrics.highestScore, "number");
    assert.strictEqual(auth.json.metrics.highestScore >= 15, true);
  });

  // 7. Admin Events History Filtering & Player Timeline
  await test("GET /api/admin/analytics/events and player timeline filter correctly", async () => {
    const eventsRes = await request("GET", "/api/admin/analytics/events?eventType=cta_click", null, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.strictEqual(eventsRes.status, 200);
    assert.strictEqual(eventsRes.json.success, true);
    assert.strictEqual(eventsRes.json.events.length > 0, true);
    assert.strictEqual(eventsRes.json.events.every(e => e.event_name === "cta_click"), true);

    const timelineRes = await request("GET", "/api/admin/analytics/player/test-player-uuid-analytics", null, {
      Authorization: `Bearer ${adminToken}`
    });
    assert.strictEqual(timelineRes.status, 200);
    assert.strictEqual(timelineRes.json.success, true);
    assert.strictEqual(timelineRes.json.events.length >= 2, true);
  });

  // 8. Admin Dashboard HTML Serving
  await test("GET /admin/game-analytics serves the Owner Dashboard HTML", async () => {
    const dashRes = await request("GET", "/admin/game-analytics");
    assert.strictEqual(dashRes.status, 200);
    assert.strictEqual(dashRes.headers["content-type"].includes("text/html"), true);
    assert.strictEqual(dashRes.data.includes("Game Analytics Dashboard"), true);
    assert.strictEqual(dashRes.data.includes("Soofi Mandi"), true);
  });

  console.log("\n=================================================");
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
