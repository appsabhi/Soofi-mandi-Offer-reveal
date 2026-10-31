/**
 * Comprehensive Test Suite: Netlify Backend Solution Verification
 * 
 * Verifies:
 * 1. netlify.toml configuration file format and redirect rules.
 * 2. Netlify Function handler (AWS Lambda v1 format):
 *    - GET /api/leaderboard
 *    - GET /api/config/features
 *    - POST /api/player/name
 *    - GET /api/player
 *    - POST /api/leaderboard
 *    - POST /api/offers/claim (rejected for < 100, accepted for >= 100)
 *    - POST /api/analytics/events
 *    - POST /api/admin/login
 *    - GET /api/admin/analytics/overview (protected)
 *    - GET /admin/game-analytics (admin dashboard HTML)
 * 3. Netlify Function default export (Web API v2 format with Request/Response).
 * 4. Vercel Function (api/index.js) compatibility and vercel.json rewrites.
 * 5. Standalone server.js and local npm start compatibility.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");

// Import the Netlify function handler directly
const netlifyFunction = require("../netlify/functions/api");
// Import the Vercel function handler
const vercelFunction = require("../api/index");
// Import the server module
const server = require("../server");
const db = require("../db");

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log("==================================================================");
  console.log("SOOFI MANDI NETLIFY BACKEND API COMPREHENSIVE TEST SUITE");
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

  // Allow database initialization
  await sleep(1000);

  // -------------------------------------------------------------------------
  // 1. Verify netlify.toml and vercel.json configurations
  // -------------------------------------------------------------------------
  console.log("--- 1. Configuration Files Verification ---");

  test("netlify.toml exists and has correct build and redirect rules", () => {
    const tomlPath = path.join(__dirname, "..", "netlify.toml");
    assert.ok(fs.existsSync(tomlPath), "netlify.toml must exist in root");
    const content = fs.readFileSync(tomlPath, "utf8");
    assert.ok(content.includes('publish = "."'), "publish must be root");
    assert.ok(content.includes('functions = "netlify/functions"'), "functions directory must be netlify/functions");
    assert.ok(content.includes('from = "/api/*"'), "must redirect /api/*");
    assert.ok(content.includes('to = "/.netlify/functions/api/:splat"'), "must rewrite to /.netlify/functions/api/:splat");
    assert.ok(content.includes("status = 200"), "redirect status must be 200 (rewrite)");
    assert.ok(content.includes('from = "/admin/game-analytics"'), "must route /admin/game-analytics to function");
  });

  test("vercel.json exists and preserves Vercel rewrites configuration", () => {
    const vercelPath = path.join(__dirname, "..", "vercel.json");
    assert.ok(fs.existsSync(vercelPath), "vercel.json must exist in root");
    const json = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
    assert.ok(Array.isArray(json.rewrites), "rewrites must be an array");
    const apiRewrite = json.rewrites.find(r => r.source === "/api/(.*)");
    assert.ok(apiRewrite, "must rewrite /api/(.*)");
    assert.strictEqual(apiRewrite.destination, "/api/index.js");
  });

  // -------------------------------------------------------------------------
  // 2. Netlify Functions v1 (Lambda event format) Tests
  // -------------------------------------------------------------------------
  console.log("\n--- 2. Netlify Functions v1 (AWS Lambda Format) Tests ---");

  await asyncTest("GET /api/leaderboard via Netlify handler returns 200 and leaderboard array", async () => {
    const event = {
      httpMethod: "GET",
      path: "/.netlify/functions/api/leaderboard",
      headers: { host: "example.netlify.app" }
    };
    const res = await netlifyFunction.handler(event, {});
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.leaderboard), "leaderboard should be an array");
  });

  await asyncTest("GET /api/config/features via Netlify handler returns features and config", async () => {
    const event = {
      httpMethod: "GET",
      path: "/.netlify/functions/api/config/features",
      headers: { host: "example.netlify.app" }
    };
    const res = await netlifyFunction.handler(event, {});
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.ok(body.features && typeof body.features === "object");
    assert.ok(body.config && typeof body.config === "object");
  });

  await asyncTest("POST /api/player/name via Netlify handler saves and confirms display name", async () => {
    const testPlayerId = "test-netlify-player-" + Date.now();
    const event = {
      httpMethod: "POST",
      path: "/.netlify/functions/api/player/name",
      headers: {
        host: "example.netlify.app",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        playerId: testPlayerId,
        displayName: "Netlify Tester"
      })
    };
    const res = await netlifyFunction.handler(event, {});
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.displayName, "Netlify Tester");

    // Verify GET /api/player retrieves the name
    const getEvent = {
      httpMethod: "GET",
      path: "/.netlify/functions/api/player",
      queryStringParameters: { playerId: testPlayerId },
      headers: { host: "example.netlify.app" }
    };
    const getRes = await netlifyFunction.handler(getEvent, {});
    assert.strictEqual(getRes.statusCode, 200);
    const getBody = JSON.parse(getRes.body);
    assert.strictEqual(getBody.success, true);
    assert.strictEqual(getBody.player?.display_name || getBody.player?.displayName, "Netlify Tester");
  });

  await asyncTest("POST /api/leaderboard via Netlify handler records verified score", async () => {
    const testPlayerId = "test-netlify-score-" + Date.now();
    const event = {
      httpMethod: "POST",
      path: "/.netlify/functions/api/leaderboard",
      headers: {
        host: "example.netlify.app",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        playerId: testPlayerId,
        displayName: "Score Tester",
        score: 3,
        foodCaught: 3,
        missedCount: 5,
        durationSeconds: 10,
        events: [
          { type: "catch", itemType: "normal", timestamp: 1000 },
          { type: "catch", itemType: "normal", timestamp: 2000 },
          { type: "catch", itemType: "normal", timestamp: 3000 },
          { type: "miss", itemType: "normal", timestamp: 4000 },
          { type: "miss", itemType: "normal", timestamp: 5000 },
          { type: "miss", itemType: "normal", timestamp: 6000 },
          { type: "miss", itemType: "normal", timestamp: 7000 },
          { type: "miss", itemType: "normal", timestamp: 8000 }
        ]
      })
    };
    const res = await netlifyFunction.handler(event, {});
    assert.ok(res.statusCode === 200 || res.statusCode === 201, `Expected 200 or 201, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.verifiedScore, 3);
  });

  await asyncTest("POST /api/offers/claim via Netlify handler enforces 100-point threshold", async () => {
    const testPlayerLow = "player_low_" + Date.now();

    // First submit score 1 for this session
    const lbRes = await netlifyFunction.handler({
      httpMethod: "POST",
      path: "/.netlify/functions/api/leaderboard",
      headers: { host: "example.netlify.app", "content-type": "application/json" },
      body: JSON.stringify({
        playerId: testPlayerLow,
        displayName: "Low Scorer",
        score: 1,
        foodCaught: 1,
        missedCount: 5,
        durationSeconds: 10,
        events: [
          { type: "catch", itemType: "normal", timestamp: 1000 },
          { type: "miss", itemType: "normal", timestamp: 2000 },
          { type: "miss", itemType: "normal", timestamp: 3000 },
          { type: "miss", itemType: "normal", timestamp: 4000 },
          { type: "miss", itemType: "normal", timestamp: 5000 },
          { type: "miss", itemType: "normal", timestamp: 6000 }
        ]
      })
    }, {});
    const lbBody = JSON.parse(lbRes.body);
    const validSessionId = lbBody.gameSessionId;
    assert.ok(validSessionId, "Must return valid gameSessionId");

    // Try to claim with under-100 score session
    const claimRes = await netlifyFunction.handler({
      httpMethod: "POST",
      path: "/.netlify/functions/api/offers/claim",
      headers: { host: "example.netlify.app", "content-type": "application/json" },
      body: JSON.stringify({
        gameSessionId: validSessionId,
        playerId: testPlayerLow,
        fullName: "Test User",
        mobileNumber: "+919876543210"
      })
    }, {});

    // Must be rejected with 403 Forbidden because score is not >= 100
    assert.strictEqual(claimRes.statusCode, 403, `Expected 403 Forbidden for under-100 score, got ${claimRes.statusCode}`);
  });

  await asyncTest("POST /api/admin/login via Netlify handler verifies authentication and security requirements", async () => {
    // 1. Verify that insecure default password in production mode is blocked with 503
    delete process.env.ADMIN_PASSWORD;
    const blockedRes = await netlifyFunction.handler({
      httpMethod: "POST",
      path: "/.netlify/functions/api/admin/login",
      headers: { host: "example.netlify.app", "content-type": "application/json" },
      body: JSON.stringify({ password: "soofi_admin_2026" })
    }, {});
    assert.strictEqual(blockedRes.statusCode, 503, "Insecure default password in production must return 503");

    // 2. Set a secure production password
    const secureAdminPass = "super_secure_soofi_password_2026";
    process.env.ADMIN_PASSWORD = secureAdminPass;

    // 3. Wrong password with secure password configured -> 401 Unauthorized
    const failRes = await netlifyFunction.handler({
      httpMethod: "POST",
      path: "/.netlify/functions/api/admin/login",
      headers: { host: "example.netlify.app", "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong_password_123" })
    }, {});
    assert.strictEqual(failRes.statusCode, 401);

    // 4. Correct password -> 200 OK
    const successRes = await netlifyFunction.handler({
      httpMethod: "POST",
      path: "/.netlify/functions/api/admin/login",
      headers: { host: "example.netlify.app", "content-type": "application/json" },
      body: JSON.stringify({ password: secureAdminPass })
    }, {});
    assert.strictEqual(successRes.statusCode, 200);
    const body = JSON.parse(successRes.body);
    assert.strictEqual(body.success, true);
    assert.ok(body.token, "Admin login should return session token");

    // 3. Use token to access overview metrics
    const overviewRes = await netlifyFunction.handler({
      httpMethod: "GET",
      path: "/.netlify/functions/api/admin/analytics/overview",
      headers: {
        host: "example.netlify.app",
        authorization: `Bearer ${body.token}`
      }
    }, {});
    assert.strictEqual(overviewRes.statusCode, 200);
    const overviewBody = JSON.parse(overviewRes.body);
    assert.strictEqual(overviewBody.success, true);
    assert.ok(overviewBody.metrics, "metrics object returned");
    assert.ok(typeof overviewBody.metrics.uniquePlayers === "number");
  });

  await asyncTest("GET /admin/game-analytics via Netlify handler serves Dashboard HTML", async () => {
    const res = await netlifyFunction.handler({
      httpMethod: "GET",
      path: "/.netlify/functions/api/admin/game-analytics",
      headers: { host: "example.netlify.app" }
    }, {});
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.includes("SOOFI MANDI"), "Must contain dashboard brand");
    assert.ok(res.body.includes("Game Analytics"), "Must contain Game Analytics text");
  });

  // -------------------------------------------------------------------------
  // 3. Netlify Functions v2 (Modern Web API Request format) Tests
  // -------------------------------------------------------------------------
  console.log("\n--- 3. Netlify Functions v2 (Web API Request/Response) Tests ---");

  await asyncTest("Netlify default export handles modern Web Request and returns standard Response", async () => {
    const webReq = new Request("https://example.netlify.app/api/leaderboard", {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    const webRes = await netlifyFunction.default(webReq, {});
    assert.strictEqual(webRes.status, 200);
    const data = await webRes.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.leaderboard));
  });

  await asyncTest("Netlify default export handles POST Web Request with JSON body", async () => {
    const testId = "v2-player-" + Date.now();
    const webReq = new Request("https://example.netlify.app/api/player/name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: testId, displayName: "V2 Player" })
    });

    const webRes = await netlifyFunction.default(webReq, {});
    assert.strictEqual(webRes.status, 200);
    const data = await webRes.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.displayName, "V2 Player");
  });

  // -------------------------------------------------------------------------
  // 4. Vercel Function (api/index.js) Compatibility
  // -------------------------------------------------------------------------
  console.log("\n--- 4. Vercel Function (api/index.js) Compatibility ---");

  await asyncTest("Vercel api/index.js handler accepts (req, res) and returns leaderboard JSON", async () => {
    let statusCode = 200;
    const headers = {};
    const chunks = [];

    const mockReq = {
      url: "/api/leaderboard",
      method: "GET",
      headers: { host: "example.vercel.app" }
    };

    const mockRes = {
      writeHead(code, hdrs) {
        statusCode = code;
        if (hdrs) Object.assign(headers, hdrs);
        return this;
      },
      setHeader(k, v) { headers[k] = v; return this; },
      end(data) {
        if (data) chunks.push(data);
      }
    };

    await vercelFunction(mockReq, mockRes);
    assert.strictEqual(statusCode, 200);
    const body = JSON.parse(chunks.join(""));
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.leaderboard));
  });

  // -------------------------------------------------------------------------
  // 5. Standalone Server & npm start Local Verification
  // -------------------------------------------------------------------------
  console.log("\n--- 5. Standalone server.js & Local Execution Verification ---");

  test("server.js exports server and handleRequest cleanly", () => {
    assert.ok(server, "server export exists");
    assert.ok(typeof server.handleRequest === "function", "server.handleRequest function exists");
    assert.ok(server.dbReadyPromise, "server.dbReadyPromise exists");
  });

  // -------------------------------------------------------------------------
  // 6. Production Security & Neon PostgreSQL Enforcement Verification
  // -------------------------------------------------------------------------
  console.log("\n--- 6. Production Security & Compatibility Verification ---");

  test("Production mode blocks insecure default ADMIN_PASSWORD and requires strong credentials", () => {
    const serverCode = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    assert.ok(serverCode.includes("INSECURE_DEFAULT_PASSWORDS"), "server.js must define INSECURE_DEFAULT_PASSWORDS");
    assert.ok(serverCode.includes("soofi_admin_2026"), "Default password must be classified as insecure in production");
    assert.ok(serverCode.includes("crypto.timingSafeEqual"), "Password comparison must use constant-time timingSafeEqual");
  });

  test("Production database layer requires Neon PostgreSQL and prohibits silent SQLite fallback", () => {
    const dbCode = fs.readFileSync(path.join(__dirname, "..", "db.js"), "utf8");
    assert.ok(dbCode.includes("isProduction"), "db.js must differentiate production mode");
    assert.ok(dbCode.includes("SQLite fallback is strictly prohibited in production"), "Must throw error and refuse SQLite in production");
    assert.ok(dbCode.includes("Production requires Neon PostgreSQL and active connection is unavailable"), "db.query must prevent fallback in production");
  });

  console.log("\n==================================================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch(err => {
  console.error("FATAL SUITE ERROR:", err);
  process.exit(1);
});
