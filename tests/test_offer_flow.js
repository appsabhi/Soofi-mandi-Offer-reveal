/**
 * Comprehensive Offer Unlock & Claim Flow Test Suite
 * Tests eligibility, server-side score verification, Neon PostgreSQL persistence,
 * validation errors, and idempotency.
 */
const http = require("http");
const crypto = require("crypto");

process.env.PORT = "3199";

const server = require("../server");
const db = require("../db");

const BASE_URL = "http://127.0.0.1:3199";

function postJson(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = http.request(BASE_URL + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        ...headers
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch (_) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

function getJson(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(BASE_URL + path, {
      method: "GET",
      headers
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch (_) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function runTests() {
  console.log("=================================================");
  console.log("SOOFI MANDI OFFER UNLOCK FLOW — AUTOMATED TESTS");
  console.log("=================================================");

  // Wait for server and DB
  await new Promise(r => setTimeout(r, 600));

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`• ${testName}... PASSED ✓`);
      passed++;
    } else {
      console.error(`• ${testName}... FAILED ✗`);
      failed++;
    }
  }

  const playerUnder100 = "player_sub99_" + crypto.randomUUID().substring(0, 8);
  const playerOver100 = "player_sub105_" + crypto.randomUUID().substring(0, 8);

  try {
    // TEST 1: Score 99 Rejection (Score < 100 must NOT unlock offer)
    const sub99 = await postJson("/api/leaderboard", {
      playerId: playerUnder100,
      displayName: "UnderHundredPlayer",
      score: 99,
      foodCaught: 99,
      missedCount: 5,
      durationSeconds: 50
    });

    assert((sub99.status === 200 || sub99.status === 201) && sub99.body.gameSessionId, "Score 99 leaderboard submission returns gameSessionId");
    const session99Id = sub99.body.gameSessionId;

    const claim99 = await postJson("/api/offers/claim", {
      gameSessionId: session99Id,
      playerId: playerUnder100,
      fullName: "Zayd Al-Harbi",
      mobileNumber: "+91 98765 43210",
      email: "zayd@example.com"
    });

    assert(claim99.status === 403 && claim99.body.success === false, "Claim with score 99 rejected with HTTP 403 Forbidden");

    // TEST 2: Score 105 Eligible Session
    const sub105 = await postJson("/api/leaderboard", {
      playerId: playerOver100,
      displayName: "FeastChampion",
      score: 105,
      foodCaught: 105,
      missedCount: 5,
      durationSeconds: 60
    });

    assert((sub105.status === 200 || sub105.status === 201) && sub105.body.gameSessionId, "Score 105 leaderboard submission returns gameSessionId");
    const session105Id = sub105.body.gameSessionId;

    // TEST 3: Validation - Missing / Short Full Name
    const claimBadName = await postJson("/api/offers/claim", {
      gameSessionId: session105Id,
      playerId: playerOver100,
      fullName: "A",
      mobileNumber: "+91 98765 43210"
    });
    assert(claimBadName.status === 400 && claimBadName.body.success === false, "Short/empty full name rejected with HTTP 400");

    // TEST 4: Validation - Invalid Phone
    const claimBadPhone = await postJson("/api/offers/claim", {
      gameSessionId: session105Id,
      playerId: playerOver100,
      fullName: "Tariq Mansoor",
      mobileNumber: "123" // Too short (< 7 digits)
    });
    assert(claimBadPhone.status === 400 && claimBadPhone.body.success === false, "Invalid phone number (< 7 digits) rejected with HTTP 400");

    // TEST 5: Validation - Invalid Email
    const claimBadEmail = await postJson("/api/offers/claim", {
      gameSessionId: session105Id,
      playerId: playerOver100,
      fullName: "Tariq Mansoor",
      mobileNumber: "+91 98765 43210",
      email: "not-an-email"
    });
    assert(claimBadEmail.status === 400 && claimBadEmail.body.success === false, "Invalid email format rejected with HTTP 400");

    // TEST 6: Successful Claim with Valid Data
    const claimSuccess = await postJson("/api/offers/claim", {
      gameSessionId: session105Id,
      playerId: playerOver100,
      fullName: "Tariq Al-Mansoor",
      mobileNumber: "+91 98765 43210",
      email: "tariq@example.com"
    });

    assert(
      claimSuccess.status === 201 &&
      claimSuccess.body.success === true &&
      claimSuccess.body.claim &&
      claimSuccess.body.claim.claimId &&
      claimSuccess.body.claim.verifiedScore === 105,
      "Valid claim succeeds with HTTP 201, returns claimId and verifiedScore: 105"
    );

    const createdClaimId = claimSuccess.body.claim.claimId;

    // TEST 7: Neon PostgreSQL Direct Verification
    const dbClaim = await db.queryOne(
      "SELECT claim_id, game_session_id, player_id, full_name, mobile_number, email, verified_score, claim_status FROM offer_claims WHERE claim_id = $1",
      [createdClaimId]
    );

    assert(
      dbClaim &&
      dbClaim.full_name === "Tariq Al-Mansoor" &&
      dbClaim.mobile_number === "+91 98765 43210" &&
      dbClaim.email === "tariq@example.com" &&
      parseInt(dbClaim.verified_score, 10) === 105,
      "Claim record in Neon PostgreSQL matches submitted customer details and verified score"
    );

    // TEST 8: Idempotency (Duplicate Claim submission for same gameSessionId)
    const claimDuplicate = await postJson("/api/offers/claim", {
      gameSessionId: session105Id,
      playerId: playerOver100,
      fullName: "Tariq Al-Mansoor",
      mobileNumber: "+91 98765 43210",
      email: "tariq@example.com"
    });

    assert(
      claimDuplicate.status === 200 &&
      claimDuplicate.body.success === true &&
      claimDuplicate.body.alreadyClaimed === true &&
      claimDuplicate.body.claim.claimId === createdClaimId,
      "Duplicate claim returns existing claim with HTTP 200 (idempotent)"
    );

    // TEST 9: GET /api/offers/claim (Session retrieval)
    const getClaim = await getJson(`/api/offers/claim?gameSessionId=${encodeURIComponent(session105Id)}&playerId=${encodeURIComponent(playerOver100)}`);
    assert(
      getClaim.status === 200 &&
      getClaim.body.success === true &&
      getClaim.body.claim.claimId === createdClaimId,
      "GET /api/offers/claim retrieves claim for session"
    );

    // TEST 10: Admin Analytics Overview reflects offersClaimed
    const loginRes = await postJson("/api/admin/login", { password: process.env.ADMIN_PASSWORD || "soofi_admin_2026" });
    assert(loginRes.status === 200 && loginRes.body.token, "Admin login succeeds");
    const adminToken = loginRes.body.token;

    const overviewRes = await getJson("/api/admin/analytics/overview", {
      "Authorization": `Bearer ${adminToken}`
    });

    assert(
      overviewRes.status === 200 &&
      overviewRes.body.metrics &&
      overviewRes.body.metrics.offersClaimed >= 1,
      "Admin analytics overview reports at least 1 offersClaimed"
    );

  } catch (err) {
    console.error("Test execution exception:", err);
    failed++;
  }

  console.log("\n=================================================");
  console.log(`OFFER FLOW TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  // Cleanup test data to maintain database cleanliness
  try {
    await db.query("DELETE FROM offer_claims WHERE player_id IN ($1, $2)", [playerUnder100, playerOver100]);
    await db.query("DELETE FROM analytics_events WHERE player_id IN ($1, $2)", [playerUnder100, playerOver100]);
    await db.query("DELETE FROM leaderboard WHERE player_id IN ($1, $2)", [playerUnder100, playerOver100]);
    console.log("✓ Test records cleaned up successfully.");
  } catch (_) {}

  server.close(() => {
    process.exit(failed > 0 ? 1 : 0);
  });
}

runTests();
