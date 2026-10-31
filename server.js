/**
 * Soofi Mandi — "Catch the Feast" Server & Private Analytics Backend
 * 
 * Features:
 * - Enterprise Database Layer: Neon PostgreSQL with local SQLite fallback
 * - Customer Offer Unlock & Verification Flow (Score 100+ -> Details -> Save Claim -> Reveal)
 * - Public Global Top 10 Leaderboard API with deterministic ranking & anti-cheat verification
 * - Anonymous first-party player identification & tracking
 * - Privacy-conscious analytics event tracking (page visits, game starts, completions, replays, CTAs)
 * - Private Owner Game Analytics Dashboard at /admin/game-analytics
 * - Fast, zero-dependency static file server
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const db = require("./db");
const { DEFAULT_OFFER } = require("./offers");
const { GAME_FEATURES, GAME_CONFIG, calculateCatchPoints } = require("./game_config");

// Verification Engine: Validates chronological event log against server-side feature configuration
function verifyGameSession(events, durationSeconds, features = GAME_FEATURES, config = GAME_CONFIG) {
  let verifiedScore = 0;
  let verifiedCaught = 0;
  let verifiedMissed = 0;
  let consecutiveCatches = 0;
  const maxAllowedDurationMs = Math.max(10000, (durationSeconds + 5) * 1000);

  if (!Array.isArray(events)) {
    return { valid: false, message: "Events must be an array" };
  }

  let lastTimestamp = -1;

  for (const ev of events) {
    if (!ev || typeof ev !== "object" || typeof ev.type !== "string") {
      return { valid: false, message: "Invalid event structure" };
    }

    const t = typeof ev.timestamp === "number" ? ev.timestamp : 0;
    if (t < 0 || t > maxAllowedDurationMs) {
      return { valid: false, message: "Event timestamp out of session bounds" };
    }
    if (t < lastTimestamp) {
      return { valid: false, message: "Event timestamps must be chronological" };
    }
    lastTimestamp = t;

    if (ev.type === "miss") {
      // Safe avoidance for bomb: no penalty, no miss, no combo reset
      if (ev.itemType === "bomb") {
        continue;
      }
      verifiedMissed++;
      // Combo resets on food miss (normal or golden mandi)
      consecutiveCatches = 0;
      continue;
    }

    if (ev.type === "catch") {
      if (ev.itemType === "bomb") {
        // Bomb caught: deducts 10 points (never multiplied), floor at 0, resets combo, does NOT add miss, does NOT increment food caught
        if (features.bomb) {
          const penalty = config.bombPoints !== undefined ? config.bombPoints : -10;
          verifiedScore = Math.max(0, verifiedScore + penalty);
        }
        consecutiveCatches = 0;
        continue;
      }

      verifiedCaught++;
      consecutiveCatches++;

      const scoring = calculateCatchPoints(ev.itemType, consecutiveCatches, features, config);
      verifiedScore += scoring.awardedPoints;
      continue;
    }

    return { valid: false, message: `Unknown event type: ${ev.type}` };
  }

  return {
    valid: true,
    verifiedScore,
    verifiedCaught,
    verifiedMissed
  };
}
const dbReadyPromise = db.init().catch(err => {
  console.error("Database initialization error:", err);
});

const PORT = parseInt(process.env.PORT || "3000", 10);

const isProductionServer = (
  process.env.NODE_ENV === "production" ||
  process.env.CONTEXT === "production" ||
  process.env.VERCEL_ENV === "production" ||
  ((Boolean(process.env.NETLIFY) || Boolean(process.env.VERCEL)) && process.env.NODE_ENV !== "test" && process.env.LOCAL_DEV !== "1")
);

const INSECURE_DEFAULT_PASSWORDS = new Set([
  "soofi_admin_2026",
  "admin",
  "password",
  "123456",
  "admin123",
  "root"
]);

function getValidatedAdminPassword() {
  const envPass = process.env.ADMIN_PASSWORD ? String(process.env.ADMIN_PASSWORD).trim() : "";
  if (isProductionServer) {
    if (!envPass) {
      return null;
    }
    if (INSECURE_DEFAULT_PASSWORDS.has(envPass) || envPass.length < 10) {
      return null;
    }
    return envPass;
  }
  return envPass || "soofi_admin_2026";
}

// In-memory rate limiting and event deduplication
const submissionRateMap = new Map(); // playerId -> lastSubmissionTimestamp
const playerNameRateMap = new Map(); // playerId -> lastPlayerNameSaveTimestamp
const eventDedupMap = new Map();      // hash -> timestamp

// Helper: Parse JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    // If body was already parsed into object or string by serverless runtime/adapter
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === "object") return resolve(req.body);
      if (typeof req.body === "string") {
        if (!req.body.trim()) return resolve({});
        try {
          return resolve(JSON.parse(req.body));
        } catch (err) {
          return reject(new Error("Invalid JSON"));
        }
      }
    }

    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) { // 1MB limit
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

// Helper: Send JSON response
function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...headers
  });
  res.end(JSON.stringify(data));
}

// Helper: Sanitize string
function sanitizeString(str, maxLen = 32) {
  if (typeof str !== "string") return "";
  return str.replace(/<[^>]*>?/gm, "").trim().substring(0, maxLen);
}

// Helper: Validate Admin Session Token
async function checkAdminAuth(req) {
  let token = null;
  const authHeader = req.headers["authorization"] || "";
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (req.headers["cookie"]) {
    const cookies = req.headers["cookie"].split(";").map(c => c.trim());
    for (const c of cookies) {
      if (c.startsWith("soofi_admin_session=")) {
        token = c.substring("soofi_admin_session=".length).trim();
        break;
      }
    }
  }

  if (!token) return false;

  const nowIso = new Date().toISOString();
  try {
    const row = await db.queryOne(
      "SELECT session_token FROM admin_sessions WHERE session_token = $1 AND expires_at > $2",
      [token, nowIso]
    );
    return !!row;
  } catch (_) {
    return false;
  }
}

// Helper: MIME types for static serving
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff"
};

// Serve static file
function serveStaticFile(req, res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    // In production, strip dev testing controls markup from served HTML completely
    if (process.env.NODE_ENV === "production" && (filePath.endsWith("index.html") || filePath.endsWith("index.htm"))) {
      fs.readFile(filePath, "utf8", (readErr, htmlContent) => {
        if (readErr) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("500 Internal Server Error");
          return;
        }
        const strippedHtml = htmlContent.replace(/<aside\s+class="dev-test-panel"[\s\S]*?<\/aside>/i, "");
        const buf = Buffer.from(strippedHtml, "utf8");
        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": buf.length,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-cache"
        });
        res.end(buf);
      });
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stats.size,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": ext === ".png" || ext === ".jpg" ? "public, max-age=86400" : "no-cache"
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// Serve Private Admin Analytics Dashboard HTML
function serveAdminDashboardHtml(res) {
  const adminHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Game Analytics Dashboard — Soofi Mandi</title>
  <link rel="icon" type="image/png" href="/assets/logo.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --stage-center: #2F405C;
      --stage-edge: #071429;
      --stage-floor: #273958;
      --gold-500: #F5B800;
      --gold-300: #FFD24D;
      --gold-600: #D99E00;
      --cream-50: #FFF8E7;
      --sand-200: #F0E3C4;
      --brown-900: #2A1408;
      --spice-600: #B5532F;
      --text-muted: #9FB3C8;
      --chip-bg: rgba(255, 248, 231, 0.08);
      --chip-line: rgba(245, 184, 0, 0.28);
      --border-gold: rgba(245, 184, 0, 0.35);
      --surface-card: linear-gradient(180deg, #1A2639 0%, #0D1624 100%);
      --surface-inner: rgba(7, 20, 41, 0.85);
      --success: #7BD88F;
      --danger: #FF6B4A;
      --sans: "Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--sans);
      background-color: var(--stage-edge);
      background-image: radial-gradient(circle at 50% 25%, var(--stage-center), var(--stage-edge) 80%);
      background-attachment: fixed;
      color: var(--cream-50);
      min-height: 100vh;
      padding: 24px 20px;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--chip-line);
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .brand-logo { height: 48px; width: auto; object-fit: contain; }
    .title-wrap h1 { font-size: 20px; font-weight: 800; color: var(--gold-500); letter-spacing: 0.02em; }
    .title-wrap p { font-size: 12px; color: var(--text-muted); }
    .header-actions { display: flex; align-items: center; gap: 10px; }
    .btn {
      padding: 8px 18px;
      border-radius: 999px;
      font-family: var(--sans);
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
    }
    .btn-gold {
      background: linear-gradient(135deg, var(--gold-300), var(--gold-500));
      color: var(--brown-900);
      border: none;
    }
    .btn-gold:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(245, 184, 0, 0.45); }
    .btn-outline {
      background: rgba(15, 25, 41, 0.65);
      border: 1px solid var(--border-gold);
      color: var(--cream-50);
    }
    .btn-outline:hover {
      background: rgba(245, 184, 0, 0.15);
      border-color: var(--gold-300);
      color: var(--gold-300);
      box-shadow: 0 0 10px rgba(245, 184, 0, 0.2);
    }

    /* Login Form Card */
    .login-overlay {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60vh;
    }
    .login-card {
      background: var(--surface-card);
      color: var(--cream-50);
      padding: 34px 30px;
      border-radius: 20px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(245, 184, 0, 0.12);
      border: 1px solid var(--border-gold);
    }
    .login-card h2 { font-size: 20px; font-weight: 800; margin-bottom: 8px; color: var(--gold-500); }
    .login-card p { font-size: 13px; color: var(--text-muted); margin-bottom: 22px; line-height: 1.45; }
    .input-field {
      width: 100%;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--surface-inner);
      border: 1.5px solid var(--border-gold);
      font-family: var(--sans);
      font-size: 14px;
      color: var(--gold-300);
      outline: none;
      margin-bottom: 16px;
      box-sizing: border-box;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .input-field:focus {
      border-color: var(--gold-500);
      box-shadow: 0 0 12px rgba(245, 184, 0, 0.35);
    }
    .input-field::placeholder { color: rgba(159, 179, 200, 0.55); }
    .login-btn {
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, var(--gold-300), var(--gold-500));
      color: var(--brown-900);
      border: none;
      border-radius: 12px;
      font-family: var(--sans);
      font-weight: 800;
      font-size: 14px;
      cursor: pointer;
      letter-spacing: 0.05em;
      transition: all 0.2s ease;
    }
    .login-btn:hover { box-shadow: 0 4px 16px rgba(245, 184, 0, 0.45); transform: translateY(-1px); }

    /* Dashboard Main View */
    .dashboard-view { display: none; }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 28px;
    }
    .metric-card {
      background: linear-gradient(180deg, rgba(26, 38, 57, 0.8) 0%, rgba(13, 22, 36, 0.9) 100%);
      border: 1px solid var(--chip-line);
      border-radius: 16px;
      padding: 18px 16px;
      backdrop-filter: blur(8px);
      transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .metric-card:hover {
      transform: translateY(-2px);
      border-color: var(--gold-500);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px rgba(245, 184, 0, 0.15);
    }
    .metric-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-300); margin-bottom: 6px; }
    .metric-val { font-size: 28px; font-weight: 800; color: var(--cream-50); line-height: 1.1; margin-bottom: 4px; }
    .metric-sub { font-size: 11px; color: var(--text-muted); }

    /* Panels & Tables */
    .panel {
      background: linear-gradient(180deg, rgba(26, 38, 57, 0.8) 0%, rgba(13, 22, 36, 0.9) 100%);
      border: 1px solid var(--chip-line);
      border-radius: 18px;
      padding: 22px 20px;
      margin-bottom: 28px;
      backdrop-filter: blur(10px);
      box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4);
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .panel-title { font-size: 16px; font-weight: 700; color: var(--gold-500); display: flex; align-items: center; gap: 8px; }
    .filter-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .filter-select, .filter-input {
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--surface-inner);
      border: 1px solid var(--border-gold);
      color: var(--cream-50);
      font-family: var(--sans);
      font-size: 12px;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .filter-select:focus, .filter-input:focus {
      border-color: var(--gold-500);
      box-shadow: 0 0 8px rgba(245, 184, 0, 0.35);
    }
    .filter-select option { background: #0D1624; color: var(--cream-50); }
    .filter-input::placeholder { color: rgba(159, 179, 200, 0.55); }
    .table-responsive {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border-radius: 10px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; text-align: left; }
    th {
      padding: 11px 14px;
      background: rgba(7, 20, 41, 0.95);
      color: var(--gold-300);
      font-weight: 700;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border-gold);
      white-space: nowrap;
    }
    td {
      padding: 11px 14px;
      border-bottom: 1px solid rgba(245, 184, 0, 0.12);
      color: var(--cream-50);
    }
    tr:hover td { background: rgba(245, 184, 0, 0.05); }
    .badge-rank {
      display: inline-block;
      width: 26px;
      height: 26px;
      line-height: 26px;
      text-align: center;
      border-radius: 50%;
      font-weight: 800;
      font-size: 11px;
    }
    .badge-rank-1 { background: var(--gold-500); color: var(--brown-900); }
    .badge-rank-2 { background: #B0BEC5; color: #0F1929; }
    .badge-rank-3 { background: #D97706; color: #FFFFFF; }
    .badge-event {
      display: inline-block;
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .event-game_complete { background: rgba(123, 216, 143, 0.2); color: var(--success); border: 1px solid rgba(123, 216, 143, 0.4); }
    .event-game_start { background: rgba(77, 166, 255, 0.2); color: #70B8FF; border: 1px solid rgba(77, 166, 255, 0.4); }
    .event-game_replay { background: rgba(255, 210, 77, 0.2); color: var(--gold-300); border: 1px solid rgba(255, 210, 77, 0.4); }
    .event-page_visit { background: rgba(159, 179, 200, 0.15); color: #CFDEEE; border: 1px solid rgba(159, 179, 200, 0.3); }
    .event-cta_click { background: rgba(255, 107, 74, 0.2); color: var(--danger); border: 1px solid rgba(255, 107, 74, 0.4); }
    .event-offer_claim_success { background: rgba(245, 184, 0, 0.2); color: var(--gold-300); border: 1px solid rgba(245, 184, 0, 0.4); }
    .event-player_name_update { background: rgba(123, 216, 143, 0.2); color: var(--success); border: 1px solid rgba(123, 216, 143, 0.4); }

    .player-link {
      color: var(--gold-500);
      cursor: pointer;
      text-decoration: underline;
    }
    .player-link:hover { color: var(--gold-300); }

    /* Timeline Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(3, 10, 20, 0.82);
      backdrop-filter: blur(8px);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 1000;
      padding: 16px;
    }
    .modal-box {
      background: var(--surface-card);
      border: 1px solid var(--border-gold);
      border-radius: 20px;
      max-width: 650px;
      width: 100%;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85), 0 0 35px rgba(245, 184, 0, 0.15);
    }
    .modal-head {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-gold);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-head h3 { font-size: 15px; color: var(--gold-500); font-weight: 700; }
    .modal-close-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 18px;
      cursor: pointer;
      transition: color 0.2s ease;
    }
    .modal-close-btn:hover { color: var(--gold-300); }
    .modal-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
    .timeline-item {
      padding: 10px 0;
      border-bottom: 1px solid rgba(245, 184, 0, 0.12);
      display: flex;
      justify-content: space-between;S
      align-items: center;
      font-size: 12px;
    }

    .privacy-notice {
      padding: 14px 18px;
      background: rgba(15, 25, 41, 0.7);
      border: 1px solid var(--chip-line);
      border-left: 4px solid var(--gold-500);
      border-radius: 8px;
      font-size: 11.5px;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .admin-footer {
      text-align: center;
      font-size: 11px;
      letter-spacing: 0.14em;
      color: var(--gold-500);
      opacity: 0.75;
      padding-top: 28px;
      padding-bottom: 16px;
      font-weight: 600;
    }

    @media (max-width: 768px) {
      body { padding: 16px 14px; }
      .header { flex-direction: column; align-items: flex-start; gap: 12px; }
      .header-actions { width: 100%; justify-content: flex-start; }
      .metrics-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .metric-card { padding: 14px 12px; }
      .metric-val { font-size: 22px; }
      .panel { padding: 16px 14px; }
      .filter-bar { width: 100%; }
      .filter-select, .filter-input { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Navigation Header -->
    <header class="header">
      <div class="header-left">
        <img src="/assets/logo.png" alt="Soofi Mandi Logo" class="brand-logo">
        <div class="title-wrap">
          <h1>Owner Game Analytics Dashboard</h1>
          <p>Private Owner Usage Dashboard · Catch the Feast</p>
        </div>
      </div>
      <div class="header-actions">
        <a href="/" class="btn btn-outline">🎮 Play Game</a>
        <button id="logout-btn" class="btn btn-outline" style="display: none;">Log Out</button>
      </div>
    </header>

    <!-- Login Form Card -->
    <div id="login-section" class="login-overlay">
      <div class="login-card">
        <h2>Owner Authentication</h2>
        <p>Enter administrative secret to inspect game usage analytics.</p>
        <input type="password" id="admin-pass-input" class="input-field" placeholder="Enter admin password..." autocomplete="current-password">
        <button id="admin-login-btn" class="login-btn">ACCESS DASHBOARD</button>
        <p id="login-error" style="color: var(--danger); font-size: 12px; margin-top: 10px; display: none;"></p>
      </div>
    </div>

    <!-- Protected Dashboard View -->
    <div id="dashboard-section" class="dashboard-view">
      <!-- 1. Overview Metrics Cards -->
      <div class="metrics-grid" id="metrics-cards">
        <div class="metric-card"><div class="metric-label">Offers Claimed</div><div class="metric-val" id="metric-claims" style="color: var(--gold-500);">-</div><div class="metric-sub">Score 100+ verified</div></div>
        <div class="metric-card"><div class="metric-label">Unique Players</div><div class="metric-val" id="metric-players">-</div><div class="metric-sub">Anonymous visitors</div></div>
        <div class="metric-card"><div class="metric-label">Page Visits</div><div class="metric-val" id="metric-visits">-</div><div class="metric-sub">Total impressions</div></div>
        <div class="metric-card"><div class="metric-label">Games Started</div><div class="metric-val" id="metric-starts">-</div><div class="metric-sub">Rounds initiated</div></div>
        <div class="metric-card"><div class="metric-label">Games Completed</div><div class="metric-val" id="metric-completes">-</div><div class="metric-sub">Completed rounds</div></div>
        <div class="metric-card"><div class="metric-label">Replays</div><div class="metric-val" id="metric-replays">-</div><div class="metric-sub">Play Again rounds</div></div>
        <div class="metric-card"><div class="metric-label">Abandoned</div><div class="metric-val" id="metric-abandons">-</div><div class="metric-sub">Left before 5 misses</div></div>
        <div class="metric-card"><div class="metric-label">Highest Score</div><div class="metric-val" id="metric-highscore">-</div><div class="metric-sub" id="metric-avgscore">Avg: -</div></div>
      </div>

      <!-- 2. Global Top 10 Leaderboard Panel -->
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title"><span>🏆</span> Global Top 10 Leaderboard</h2>
          <span style="font-size: 12px; color: var(--text-muted);">Tie-breaking: Score DESC, Submission Time ASC</span>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th style="width: 60px;">Rank</th>
                <th>Player Display Name</th>
                <th>Highest Score</th>
                <th>Food Caught</th>
                <th>Submitted Date</th>
              </tr>
            </thead>
            <tbody id="top10-tbody">
              <tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Loading leaderboard...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 3. Recent Activity History Panel -->
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title"><span>📋</span> Website Activity History</h2>
          <div class="filter-bar">
            <select id="event-type-filter" class="filter-select">
              <option value="">All Event Types</option>
              <option value="offer_claim_success">offer_claim_success</option>
              <option value="game_complete">game_complete</option>
              <option value="game_start">game_start</option>
              <option value="game_replay">game_replay</option>
              <option value="game_abandon">game_abandon</option>
              <option value="page_visit">page_visit</option>
              <option value="cta_click">cta_click</option>
              <option value="leaderboard_view">leaderboard_view</option>
            </select>
            <input type="text" id="event-search-input" class="filter-input" placeholder="Search player/session...">
            <button id="refresh-events-btn" class="btn btn-outline">↻ Refresh</button>
          </div>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Anonymous Player ID</th>
                <th>Event Type</th>
                <th>Session ID</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody id="events-tbody">
              <tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Loading events...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Privacy & Retention Notice -->
      <div class="privacy-notice">
        <strong>Privacy & Security Notice:</strong> All metrics and events recorded use pseudonymous, first-party browser identifiers. Customer offer claim information is stored in verified database storage solely for offer fulfillment.
      </div>
    </div>

    <!-- Branded Footer -->
    <footer class="admin-footer">
      SOOFI MANDI · YEMENI CUISINE · MADE TO BE SHARED
    </footer>
  </div>

  <!-- Player Timeline Modal -->
  <div class="modal-overlay" id="timeline-modal">
    <div class="modal-box">
      <div class="modal-head">
        <h3 id="timeline-title">Player Activity Timeline</h3>
        <button class="modal-close-btn" id="close-modal-btn">✕</button>
      </div>
      <div class="modal-body" id="timeline-body">
        <p style="color: var(--text-muted);">Loading player history...</p>
      </div>
    </div>
  </div>

  <script>
    let adminToken = sessionStorage.getItem("soofi_admin_token") || "";

    const loginSection = document.getElementById("login-section");
    const dashboardSection = document.getElementById("dashboard-section");
    const logoutBtn = document.getElementById("logout-btn");
    const passInput = document.getElementById("admin-pass-input");
    const loginBtn = document.getElementById("admin-login-btn");
    const loginError = document.getElementById("login-error");

    async function checkAuth() {
      if (!adminToken) {
        showLogin();
        return;
      }
      try {
        const res = await fetch("/api/admin/analytics/overview", {
          headers: { "Authorization": "Bearer " + adminToken }
        });
        if (res.ok) {
          showDashboard();
          loadOverview();
          loadTop10();
          loadEvents();
        } else {
          sessionStorage.removeItem("soofi_admin_token");
          adminToken = "";
          showLogin();
        }
      } catch (_) {
        showLogin();
      }
    }

    function showLogin() {
      loginSection.style.display = "flex";
      dashboardSection.style.display = "none";
      logoutBtn.style.display = "none";
    }

    function showDashboard() {
      loginSection.style.display = "none";
      dashboardSection.style.display = "block";
      logoutBtn.style.display = "inline-flex";
    }

    loginBtn.addEventListener("click", async () => {
      const password = passInput.value.trim();
      loginError.style.display = "none";
      if (!password) return;

      try {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.success && data.token) {
          adminToken = data.token;
          sessionStorage.setItem("soofi_admin_token", adminToken);
          passInput.value = "";
          showDashboard();
          loadOverview();
          loadTop10();
          loadEvents();
        } else {
          loginError.textContent = data.message || "Invalid password";
          loginError.style.display = "block";
        }
      } catch (_) {
        loginError.textContent = "Network error. Please try again.";
        loginError.style.display = "block";
      }
    });

    logoutBtn.addEventListener("click", () => {
      sessionStorage.removeItem("soofi_admin_token");
      adminToken = "";
      showLogin();
    });

    async function loadOverview() {
      try {
        const res = await fetch("/api/admin/analytics/overview", {
          headers: { "Authorization": "Bearer " + adminToken }
        });
        const data = await res.json();
        if (data.success && data.metrics) {
          const m = data.metrics;
          document.getElementById("metric-claims").textContent = (m.offersClaimed || 0).toLocaleString();
          document.getElementById("metric-players").textContent = (m.uniquePlayers || 0).toLocaleString();
          document.getElementById("metric-visits").textContent = (m.pageVisits || 0).toLocaleString();
          document.getElementById("metric-starts").textContent = (m.gamesStarted || 0).toLocaleString();
          document.getElementById("metric-completes").textContent = (m.gamesCompleted || 0).toLocaleString();
          document.getElementById("metric-replays").textContent = (m.replays || 0).toLocaleString();
          document.getElementById("metric-abandons").textContent = (m.abandoned || 0).toLocaleString();
          document.getElementById("metric-highscore").textContent = (m.highestScore || 0).toLocaleString();
          document.getElementById("metric-avgscore").textContent = "Avg Score: " + (m.averageScore || 0).toFixed(1);
        }
      } catch (_) {}
    }

    async function loadTop10() {
      try {
        const res = await fetch("/api/leaderboard");
        const data = await res.json();
        const tbody = document.getElementById("top10-tbody");
        if (data.success && data.leaderboard && data.leaderboard.length > 0) {
          tbody.innerHTML = data.leaderboard.map((row, i) => {
            const rankBadge = i === 0 ? '<span class="badge-rank badge-rank-1">1</span>' :
                              i === 1 ? '<span class="badge-rank badge-rank-2">2</span>' :
                              i === 2 ? '<span class="badge-rank badge-rank-3">3</span>' :
                              \`<span class="badge-rank">\${i + 1}</span>\`;
            const dateStr = new Date(row.submitted_at).toLocaleString();
            return \`<tr>
              <td>\${rankBadge}</td>
              <td><strong>\${escapeHtml(row.display_name)}</strong> <small style="color:var(--text-muted); opacity:0.7;">(\${row.player_id.substring(0,8)}...)</small></td>
              <td style="color:var(--gold-500); font-weight:800;">\${row.score}</td>
              <td>\${row.food_caught}</td>
              <td>\${dateStr}</td>
            </tr>\`;
          }).join("");
        } else {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No records found.</td></tr>';
        }
      } catch (_) {}
    }

    async function loadEvents() {
      const type = document.getElementById("event-type-filter").value;
      const search = document.getElementById("event-search-input").value.trim();
      const url = \`/api/admin/analytics/events?eventType=\${encodeURIComponent(type)}&search=\${encodeURIComponent(search)}&limit=50\`;
      try {
        const res = await fetch(url, {
          headers: { "Authorization": "Bearer " + adminToken }
        });
        const data = await res.json();
        const tbody = document.getElementById("events-tbody");
        if (data.success && data.events && data.events.length > 0) {
          tbody.innerHTML = data.events.map(ev => {
            const dateStr = new Date(ev.created_at).toLocaleTimeString();
            let meta = "";
            try {
              meta = typeof ev.event_metadata === "object" ? JSON.stringify(ev.event_metadata) : ev.event_metadata;
            } catch (_) {}
            return \`<tr>
              <td>\${dateStr}</td>
              <td><span class="player-link" onclick="inspectPlayer('\${ev.player_id}')">\${ev.player_id.substring(0, 14)}...</span></td>
              <td><span class="badge-event event-\${ev.event_name}">\${ev.event_name}</span></td>
              <td><small style="color:var(--text-muted);">\${ev.session_id.substring(0, 14)}...</small></td>
              <td><code style="font-size:11px; color:var(--text-muted);">\${escapeHtml(meta || "-")}</code></td>
            </tr>\`;
          }).join("");
        } else {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No events found.</td></tr>';
        }
      } catch (_) {}
    }

    window.inspectPlayer = async function(pid) {
      const modal = document.getElementById("timeline-modal");
      const title = document.getElementById("timeline-title");
      const body = document.getElementById("timeline-body");
      title.textContent = \`Timeline for Player: \${pid}\`;
      body.innerHTML = '<p style="color: var(--text-muted);">Loading player history...</p>';
      modal.style.display = "flex";

      try {
        const res = await fetch(\`/api/admin/analytics/player/\${pid}\`, {
          headers: { "Authorization": "Bearer " + adminToken }
        });
        const data = await res.json();
        if (data.success && data.events && data.events.length > 0) {
          body.innerHTML = data.events.map(ev => {
            const time = new Date(ev.created_at).toLocaleString();
            let meta = "";
            try {
              meta = typeof ev.event_metadata === "object" ? JSON.stringify(ev.event_metadata) : ev.event_metadata;
            } catch (_) {}
            return \`<div class="timeline-item">
              <div>
                <span class="badge-event event-\${ev.event_name}">\${ev.event_name}</span>
                <span style="margin-left: 8px; color: var(--text-muted);">\${escapeHtml(meta || "")}</span>
              </div>
              <small style="color: var(--text-muted);">\${time}</small>
            </div>\`;
          }).join("");
        } else {
          body.innerHTML = '<p style="color: var(--text-muted);">No recorded activity for this player.</p>';
        }
      } catch (_) {
        body.innerHTML = '<p style="color: var(--danger);">Failed to load timeline.</p>';
      }
    };

    document.getElementById("close-modal-btn").addEventListener("click", () => {
      document.getElementById("timeline-modal").style.display = "none";
    });

    document.getElementById("refresh-events-btn").addEventListener("click", () => {
      loadOverview();
      loadTop10();
      loadEvents();
    });

    document.getElementById("event-type-filter").addEventListener("change", loadEvents);
    document.getElementById("event-search-input").addEventListener("input", () => {
      clearTimeout(window._searchTimer);
      window._searchTimer = setTimeout(loadEvents, 300);
    });

    function escapeHtml(str) {
      if (!str) return "";
      return String(str).replace(/[&<>"']/g, m => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[m]));
    }

    checkAuth();
  </script>
</body>
</html>`;

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(adminHtml);
}

// Main HTTP Request Handler
async function handleRequest(req, res) {
  await dbReadyPromise;
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS Preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    res.end();
    return;
  }

  // -------------------------------------------------------------------------
  // 1. PUBLIC API: GET /api/leaderboard (Top 10 Global Ranking)
  // -------------------------------------------------------------------------
  if (pathname === "/api/leaderboard" && method === "GET") {
    try {
      const rows = await db.query(`
        SELECT id, game_session_id, player_id, display_name, score, food_caught, missed_count, submitted_at
        FROM leaderboard
        ORDER BY score DESC, submitted_at ASC
        LIMIT 10
      `);
      return sendJson(res, 200, {
        success: true,
        tieBreakingRule: "Score DESC, submitted_at ASC",
        leaderboard: rows
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, message: "Database query error" });
    }
  }

  // -------------------------------------------------------------------------
  // Feature Configuration API: GET /api/config/features & POST /api/config/features
  // -------------------------------------------------------------------------
  if (pathname === "/api/config/features" && method === "GET") {
    return sendJson(res, 200, {
      success: true,
      features: GAME_FEATURES,
      config: GAME_CONFIG
    });
  }

  if (pathname === "/api/config/features" && method === "POST") {
    try {
      const body = await parseJsonBody(req);
      if (body && typeof body === "object") {
        if (body.features && typeof body.features === "object") {
          Object.assign(GAME_FEATURES, body.features);
        }
        if (body.config && typeof body.config === "object") {
          Object.assign(GAME_CONFIG, body.config);
        }
      }
      return sendJson(res, 200, {
        success: true,
        features: GAME_FEATURES,
        config: GAME_CONFIG
      });
    } catch (_) {
      return sendJson(res, 400, { success: false, message: "Invalid config payload" });
    }
  }

  // -------------------------------------------------------------------------
  // 1b. PUBLIC API: POST /api/player/name (Save & Confirm Player Display Name)
  // -------------------------------------------------------------------------
  if ((pathname === "/api/player/name" || pathname === "/api/player") && method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const { playerId, displayName } = body;

      // 1. Validate player ID
      if (!playerId || typeof playerId !== "string" || playerId.length < 8 || playerId.length > 64) {
        return sendJson(res, 400, { success: false, message: "Invalid player ID format" });
      }

      // 2. Validate non-empty display name
      const rawName = typeof displayName === "string" ? displayName.trim() : "";
      if (!rawName) {
        return sendJson(res, 400, { success: false, message: "Display name cannot be empty" });
      }

      const cleanName = sanitizeString(rawName, 20);
      if (!cleanName) {
        return sendJson(res, 400, { success: false, message: "Display name cannot be empty" });
      }

      // 3. Debounce rapid repeat clicks (max 1 save per 250ms per player)
      const now = Date.now();
      const lastPlayerSave = playerNameRateMap.get(playerId) || 0;
      if (now - lastPlayerSave < 250) {
        return sendJson(res, 200, {
          success: true,
          message: "Name saved successfully!",
          displayName: cleanName,
          playerId
        });
      }
      playerNameRateMap.set(playerId, now);

      const nowIso = new Date().toISOString();

      // 4. Upsert players table in Neon PostgreSQL / SQLite
      await db.query(`
        INSERT INTO players (player_id, display_name, highest_score, total_games, created_at, updated_at)
        VALUES ($1, $2, 0, 0, $3, $4)
        ON CONFLICT(player_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          updated_at = EXCLUDED.updated_at
      `, [playerId, cleanName, nowIso, nowIso]);

      // 5. Update existing leaderboard records for this player so their display name stays in sync
      await db.query(`
        UPDATE leaderboard
        SET display_name = $1
        WHERE player_id = $2
      `, [cleanName, playerId]);

      return sendJson(res, 200, {
        success: true,
        message: "Name saved successfully!",
        displayName: cleanName,
        playerId
      });
    } catch (err) {
      console.error("Error saving player display name:", err.message);
      return sendJson(res, 500, {
        success: false,
        message: "Couldn't save your name. Please try again."
      });
    }
  }

  // Optional GET /api/player?playerId=...
  if ((pathname === "/api/player" || pathname === "/api/player/name") && method === "GET") {
    try {
      const pid = parsedUrl.searchParams.get("playerId");
      if (!pid) return sendJson(res, 400, { success: false, message: "Missing playerId" });
      const row = await db.queryOne("SELECT player_id, display_name, highest_score, total_games FROM players WHERE player_id = $1", [pid]);
      if (!row) return sendJson(res, 404, { success: false, message: "Player not found" });
      return sendJson(res, 200, { success: true, player: row });
    } catch (_) {
      return sendJson(res, 500, { success: false, message: "Error fetching player" });
    }
  }

  // -------------------------------------------------------------------------
  // 2. PUBLIC API: POST /api/leaderboard (Submit Verified Game Score)
  // -------------------------------------------------------------------------
  if (pathname === "/api/leaderboard" && method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const { playerId, displayName, score, foodCaught, missedCount, durationSeconds, events } = body;

      // 1. Validate required fields & types
      if (!playerId || typeof playerId !== "string" || playerId.length < 8 || playerId.length > 64) {
        return sendJson(res, 400, { success: false, message: "Invalid player ID format" });
      }

      const numScore = parseInt(score, 10);
      const numCaught = parseInt(foodCaught, 10);
      const numMissed = parseInt(missedCount, 10);
      const numDuration = parseFloat(durationSeconds) || 0;

      if (isNaN(numScore) || numScore < 0 || isNaN(numCaught) || numCaught < 0 || isNaN(numMissed) || numMissed < 0 || numMissed > 10) {
        return sendJson(res, 400, { success: false, message: "Invalid score, caught, or missed food count" });
      }

      let finalVerifiedScore = numScore;
      let finalVerifiedCaught = numCaught;

      // 2. Score Verification: Dev test bypass (dev-only), event log verification, or legacy matching
      if (body.isDevTest) {
        if (process.env.NODE_ENV === "production") {
          return sendJson(res, 403, { success: false, message: "Dev test score injection is strictly prohibited in production." });
        }
        finalVerifiedScore = numScore;
        finalVerifiedCaught = numCaught;
      } else if (Array.isArray(events) && events.length > 0) {
        const verification = verifyGameSession(events, numDuration, GAME_FEATURES, GAME_CONFIG);
        if (!verification.valid) {
          return sendJson(res, 400, { success: false, message: verification.message });
        }

        // Anti-abuse: verify catch physical rate (max 3.5 items/sec)
        if (verification.verifiedCaught > 5 && numDuration > 0 && (verification.verifiedCaught / numDuration) > 3.5) {
          return sendJson(res, 400, { success: false, message: "Submission failed physical sanity verification" });
        }

        // Use the server-verified score
        finalVerifiedScore = verification.verifiedScore;
        finalVerifiedCaught = verification.verifiedCaught;
      } else {
        // Fallback for requests without event logs: score must match food caught count
        if (isNaN(numScore) || numScore < 0 || isNaN(numCaught) || numCaught < 0 || numScore !== numCaught) {
          return sendJson(res, 400, { success: false, message: "Invalid score or caught count mismatch" });
        }

        // Anti-Abuse Sanity Check: Minimum physical catch rate
        if (numCaught > 5 && numDuration > 0 && (numCaught / numDuration) > 3.5) {
          return sendJson(res, 400, { success: false, message: "Submission failed physical sanity verification" });
        }
      }

      // 3. Submission Rate Limiting: Max 1 submission per 800ms per player (bypassed for dev tests in non-production)
      const now = Date.now();
      const lastSub = submissionRateMap.get(playerId) || 0;
      const isDevBypass = Boolean(body.isDevTest && process.env.NODE_ENV !== "production");
      if (!isDevBypass && (now - lastSub < 800)) {
        return sendJson(res, 429, { success: false, message: "Too many submissions. Please wait a moment." });
      }
      submissionRateMap.set(playerId, now);

      // Clean display name and generate unique game session identifier
      const cleanName = sanitizeString(displayName || "Anonymous Feast Guest", 20);
      const nowIso = new Date().toISOString();
      const gameSessionId = "sess_" + crypto.randomUUID();

      // Upsert player record with verified score
      await db.query(`
        INSERT INTO players (player_id, display_name, highest_score, total_games, created_at, updated_at)
        VALUES ($1, $2, $3, 1, $4, $5)
        ON CONFLICT(player_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          highest_score = CASE WHEN players.highest_score > EXCLUDED.highest_score THEN players.highest_score ELSE EXCLUDED.highest_score END,
          total_games = players.total_games + 1,
          updated_at = EXCLUDED.updated_at
      `, [playerId, cleanName, finalVerifiedScore, nowIso, nowIso]);

      // Insert score entry with verified score & game_session_id
      await db.query(`
        INSERT INTO leaderboard (game_session_id, player_id, display_name, score, food_caught, missed_count, duration_seconds, submitted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [gameSessionId, playerId, cleanName, finalVerifiedScore, finalVerifiedCaught, numMissed, numDuration, nowIso]);

      // Query current player's personal best
      const pbRow = await db.queryOne("SELECT highest_score FROM players WHERE player_id = $1", [playerId]);

      // Query rank among all scores
      const rankRow = await db.queryOne(`
        SELECT COUNT(*) + 1 as rank
        FROM leaderboard
        WHERE score > $1 OR (score = $2 AND submitted_at < $3)
      `, [finalVerifiedScore, finalVerifiedScore, nowIso]);

      return sendJson(res, 201, {
        success: true,
        rank: rankRow ? parseInt(rankRow.rank, 10) : 1,
        personalBest: pbRow ? pbRow.highest_score : finalVerifiedScore,
        verifiedScore: finalVerifiedScore,
        gameSessionId
      });
    } catch (err) {
      console.error("Error processing score submission:", err.message);
      return sendJson(res, 500, { success: false, message: "Error processing score submission" });
    }
  }

  // -------------------------------------------------------------------------
  // 3. PUBLIC API: POST /api/offers/claim (Claim Offer for Score 100+)
  // -------------------------------------------------------------------------
  if (pathname === "/api/offers/claim" && method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const { gameSessionId, playerId, fullName, mobileNumber, email } = body;

      if (!gameSessionId || typeof gameSessionId !== "string") {
        return sendJson(res, 400, { success: false, message: "Missing or invalid game session identifier." });
      }
      if (!playerId || typeof playerId !== "string") {
        return sendJson(res, 400, { success: false, message: "Missing or invalid player identifier." });
      }

      // 1. Validate customer input fields
      const cleanName = sanitizeString(fullName || "", 100);
      if (!cleanName || cleanName.length < 2) {
        return sendJson(res, 400, { success: false, message: "Please provide your full name." });
      }

      const rawMobile = typeof mobileNumber === "string" ? mobileNumber.trim() : "";
      const phoneDigits = rawMobile.replace(/\D/g, "");
      if (!rawMobile || phoneDigits.length < 7 || phoneDigits.length > 15 || !/^[+]?[\d\s\-()]+$/.test(rawMobile)) {
        return sendJson(res, 400, { success: false, message: "Please enter a valid mobile phone number (7 to 15 digits)." });
      }

      let cleanEmail = null;
      if (email && typeof email === "string" && email.trim().length > 0) {
        const trimmedEmail = email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) || trimmedEmail.length > 150) {
          return sendJson(res, 400, { success: false, message: "Please enter a valid email address or leave it blank." });
        }
        cleanEmail = trimmedEmail;
      }

      // 2. Look up verified server-side game session record
      const sessionRow = await db.queryOne(
        "SELECT game_session_id, player_id, score, submitted_at FROM leaderboard WHERE game_session_id = $1 AND player_id = $2",
        [gameSessionId, playerId]
      );

      if (!sessionRow) {
        return sendJson(res, 404, { success: false, message: "Game session not found or invalid." });
      }

      // 3. Enforce Server-Side Score Requirement: Minimum 100 points
      const verifiedScore = parseInt(sessionRow.score, 10);
      if (isNaN(verifiedScore) || verifiedScore < 100) {
        return sendJson(res, 403, {
          success: false,
          message: "Offer is only unlocked for verified scores of 100 points or higher."
        });
      }

      // 4. Idempotency Check: Return existing claim if already claimed for this game session
      const existingClaim = await db.queryOne(
        "SELECT claim_id, game_session_id, player_id, full_name, verified_score, offer_id, offer_title, offer_badge, claim_status, created_at FROM offer_claims WHERE game_session_id = $1",
        [gameSessionId]
      );

      if (existingClaim) {
        return sendJson(res, 200, {
          success: true,
          alreadyClaimed: true,
          claim: {
            claimId: existingClaim.claim_id,
            gameSessionId: existingClaim.game_session_id,
            fullName: existingClaim.full_name,
            verifiedScore: existingClaim.verified_score,
            offer: {
              id: existingClaim.offer_id,
              title: existingClaim.offer_title,
              badge: existingClaim.offer_badge,
              description: DEFAULT_OFFER.description,
              brand: DEFAULT_OFFER.brand,
              instructions: DEFAULT_OFFER.instructions
            },
            claimStatus: existingClaim.claim_status,
            createdAt: existingClaim.created_at
          }
        });
      }

      // 5. Save claim in database transaction
      const claimId = "claim_" + crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const offer = DEFAULT_OFFER;

      await db.transaction(async (tx) => {
        await tx.query(`
          INSERT INTO offer_claims (
            claim_id, game_session_id, player_id, full_name, mobile_number, email,
            verified_score, offer_id, offer_title, offer_badge, claim_status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          claimId,
          gameSessionId,
          playerId,
          cleanName,
          rawMobile,
          cleanEmail,
          verifiedScore,
          offer.id,
          offer.title,
          offer.badge,
          "unlocked",
          nowIso
        ]);

        // Record tracking event
        const eventMeta = JSON.stringify({ claimId, offerId: offer.id, verifiedScore });
        await tx.query(`
          INSERT INTO analytics_events (player_id, session_id, event_name, event_metadata, created_at)
          VALUES ($1, $2, 'offer_claim_success', $3, $4)
        `, [playerId, gameSessionId, eventMeta, nowIso]);
      });

      return sendJson(res, 201, {
        success: true,
        claim: {
          claimId,
          gameSessionId,
          fullName: cleanName,
          verifiedScore,
          offer,
          claimStatus: "unlocked",
          createdAt: nowIso
        }
      });
    } catch (err) {
      console.error("Error processing offer claim:", err.message);
      return sendJson(res, 500, { success: false, message: "Unable to record your offer claim. Please try again." });
    }
  }

  // -------------------------------------------------------------------------
  // 4. PUBLIC API: GET /api/offers/claim (Retrieve Existing Claim for Session)
  // -------------------------------------------------------------------------
  if (pathname === "/api/offers/claim" && method === "GET") {
    try {
      const gameSessionId = parsedUrl.searchParams.get("gameSessionId") || "";
      const playerId = parsedUrl.searchParams.get("playerId") || "";

      if (!gameSessionId || !playerId) {
        return sendJson(res, 400, { success: false, message: "Missing gameSessionId or playerId." });
      }

      const claim = await db.queryOne(
        "SELECT claim_id, game_session_id, player_id, full_name, verified_score, offer_id, offer_title, offer_badge, claim_status, created_at FROM offer_claims WHERE game_session_id = $1 AND player_id = $2",
        [gameSessionId, playerId]
      );

      if (!claim) {
        return sendJson(res, 404, { success: false, message: "No offer claim found for this session." });
      }

      return sendJson(res, 200, {
        success: true,
        claim: {
          claimId: claim.claim_id,
          gameSessionId: claim.game_session_id,
          fullName: claim.full_name,
          verifiedScore: claim.verified_score,
          offer: {
            id: claim.offer_id,
            title: claim.offer_title,
            badge: claim.offer_badge,
            description: DEFAULT_OFFER.description,
            brand: DEFAULT_OFFER.brand,
            instructions: DEFAULT_OFFER.instructions
          },
          claimStatus: claim.claim_status,
          createdAt: claim.created_at
        }
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, message: "Error retrieving offer claim." });
    }
  }

  // -------------------------------------------------------------------------
  // 5. PUBLIC API: POST /api/analytics/events (Privacy-Conscious Tracking)
  // -------------------------------------------------------------------------
  if (pathname === "/api/analytics/events" && method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const { playerId, sessionId, eventName, metadata } = body;

      if (!playerId || !sessionId || !eventName) {
        return sendJson(res, 400, { success: false, message: "Missing required tracking attributes" });
      }

      // Event deduplication: prevent duplicate event within 500ms
      const dedupKey = `${playerId}_${sessionId}_${eventName}_${JSON.stringify(metadata || {})}`;
      const now = Date.now();
      const lastSent = eventDedupMap.get(dedupKey) || 0;
      if (now - lastSent < 500) {
        return sendJson(res, 200, { success: true, deduplicated: true });
      }
      eventDedupMap.set(dedupKey, now);

      if (eventDedupMap.size > 2000) {
        for (const [k, ts] of eventDedupMap) {
          if (now - ts > 10000) eventDedupMap.delete(k);
        }
      }

      const cleanEvent = sanitizeString(eventName, 40);
      const nowIso = new Date().toISOString();
      const metaString = typeof metadata === "object" ? JSON.stringify(metadata) : "{}";

      await db.query(`
        INSERT INTO analytics_events (player_id, session_id, event_name, event_metadata, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [playerId, sessionId, cleanEvent, metaString, nowIso]);

      return sendJson(res, 201, { success: true });
    } catch (err) {
      return sendJson(res, 500, { success: false, message: "Error recording event" });
    }
  }

  // -------------------------------------------------------------------------
  // 6. ADMIN API: POST /api/admin/login (Owner Authentication)
  // -------------------------------------------------------------------------
  if (pathname === "/api/admin/login" && method === "POST") {
    try {
      const configuredPassword = getValidatedAdminPassword();
      if (!configuredPassword) {
        return sendJson(res, 503, {
          success: false,
          message: isProductionServer
            ? "Administrative login is disabled in production: A secure ADMIN_PASSWORD environment variable (minimum 10 characters, non-default) must be configured."
            : "Administrative login is currently unconfigured."
        });
      }

      const body = await parseJsonBody(req);
      const { password } = body;

      const inputPass = typeof password === "string" ? password : "";
      const inputBuffer = Buffer.from(inputPass);
      const expectedBuffer = Buffer.from(configuredPassword);
      const isMatch = (
        inputBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(inputBuffer, expectedBuffer)
      );

      if (!isMatch) {
        return sendJson(res, 401, { success: false, message: "Invalid administrative password" });
      }

      const sessionToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const nowIso = new Date().toISOString();

      await db.query("INSERT INTO admin_sessions (session_token, created_at, expires_at) VALUES ($1, $2, $3)", [sessionToken, nowIso, expiresAt]);

      return sendJson(res, 200, {
        success: true,
        token: sessionToken,
        expiresAt
      }, {
        "Set-Cookie": `soofi_admin_session=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, message: "Error during admin authentication" });
    }
  }

  // -------------------------------------------------------------------------
  // 7. ADMIN API: GET /api/admin/analytics/overview (Metrics Aggregation)
  // -------------------------------------------------------------------------
  if (pathname === "/api/admin/analytics/overview" && method === "GET") {
    if (!(await checkAdminAuth(req))) {
      return sendJson(res, 401, { success: false, message: "Unauthorized. Admin authentication required." });
    }

    try {
      const uniquePlayers = (await db.queryOne("SELECT COUNT(DISTINCT player_id) as count FROM analytics_events"))?.count || 0;
      const pageVisits = (await db.queryOne("SELECT COUNT(*) as count FROM analytics_events WHERE event_name = 'page_visit'"))?.count || 0;
      const gamesStarted = (await db.queryOne("SELECT COUNT(*) as count FROM analytics_events WHERE event_name = 'game_start'"))?.count || 0;
      const gamesCompleted = (await db.queryOne("SELECT COUNT(*) as count FROM analytics_events WHERE event_name = 'game_complete'"))?.count || 0;
      const replays = (await db.queryOne("SELECT COUNT(*) as count FROM analytics_events WHERE event_name = 'game_replay'"))?.count || 0;
      const abandoned = (await db.queryOne("SELECT COUNT(*) as count FROM analytics_events WHERE event_name = 'game_abandon'"))?.count || 0;
      const ctaClicks = (await db.queryOne("SELECT COUNT(*) as count FROM analytics_events WHERE event_name = 'cta_click'"))?.count || 0;
      const offersClaimed = (await db.queryOne("SELECT COUNT(*) as count FROM offer_claims"))?.count || 0;

      const scoreStats = await db.queryOne("SELECT MAX(score) as max_score, AVG(score) as avg_score FROM leaderboard");
      const highestScore = scoreStats?.max_score || 0;
      const averageScore = Math.round(Number(scoreStats?.avg_score || 0));

      return sendJson(res, 200, {
        success: true,
        metrics: {
          uniquePlayers: Number(uniquePlayers),
          pageVisits: Number(pageVisits),
          gamesStarted: Number(gamesStarted),
          gamesCompleted: Number(gamesCompleted),
          replays: Number(replays),
          abandoned: Number(abandoned),
          ctaClicks: Number(ctaClicks),
          offersClaimed: Number(offersClaimed),
          highestScore: Number(highestScore),
          averageScore
        }
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, message: "Error computing overview metrics" });
    }
  }

  // -------------------------------------------------------------------------
  // 8. ADMIN API: GET /api/admin/analytics/events (Filterable Event History)
  // -------------------------------------------------------------------------
  if (pathname === "/api/admin/analytics/events" && method === "GET") {
    if (!(await checkAdminAuth(req))) {
      return sendJson(res, 401, { success: false, message: "Unauthorized. Admin authentication required." });
    }

    try {
      const eventType = parsedUrl.searchParams.get("eventType") || "";
      const search = parsedUrl.searchParams.get("search") || "";
      const limit = Math.min(100, parseInt(parsedUrl.searchParams.get("limit") || "50", 10));

      let sql = "SELECT id, player_id, session_id, event_name, event_metadata, created_at FROM analytics_events WHERE 1=1";
      const params = [];
      let paramIdx = 1;

      if (eventType) {
        sql += ` AND event_name = $${paramIdx++}`;
        params.push(eventType);
      }
      if (search) {
        sql += ` AND (player_id LIKE $${paramIdx} OR session_id LIKE $${paramIdx + 1})`;
        params.push(`%${search}%`, `%${search}%`);
        paramIdx += 2;
      }

      sql += ` ORDER BY created_at DESC LIMIT $${paramIdx}`;
      params.push(limit);

      const rows = await db.query(sql, params);
      return sendJson(res, 200, { success: true, events: rows });
    } catch (err) {
      return sendJson(res, 500, { success: false, message: "Error fetching events history" });
    }
  }

  // -------------------------------------------------------------------------
  // 9. ADMIN API: GET /api/admin/analytics/player/:playerId (Timeline)
  // -------------------------------------------------------------------------
  if (pathname.startsWith("/api/admin/analytics/player/") && method === "GET") {
    if (!(await checkAdminAuth(req))) {
      return sendJson(res, 401, { success: false, message: "Unauthorized. Admin authentication required." });
    }

    try {
      const pid = pathname.substring("/api/admin/analytics/player/".length).trim();
      const rows = await db.query(`
        SELECT id, session_id, event_name, event_metadata, created_at
        FROM analytics_events
        WHERE player_id = $1
        ORDER BY created_at DESC
        LIMIT 100
      `, [pid]);

      return sendJson(res, 200, { success: true, events: rows });
    } catch (err) {
      return sendJson(res, 500, { success: false, message: "Error fetching player timeline" });
    }
  }

  // -------------------------------------------------------------------------
  // 10. ADMIN DASHBOARD: GET /admin/game-analytics
  // -------------------------------------------------------------------------
  if ((pathname === "/admin/game-analytics" || pathname === "/admin/game-analytics/") && method === "GET") {
    return serveAdminDashboardHtml(res);
  }

  // -------------------------------------------------------------------------
  // 11. STATIC FILE SERVING
  // -------------------------------------------------------------------------
  let requestedFile = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(requestedFile).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  serveStaticFile(req, res, filePath);
}

const server = http.createServer(handleRequest);

// Start server when run directly or in non-serverless test/dev environments
if (require.main === module || (!process.env.NETLIFY && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.SERVERLESS)) {
  server.listen(PORT, () => {
    console.log(`Soofi Mandi "Catch the Feast" Server listening on http://localhost:${PORT}`);
    console.log(`Admin Game Analytics Dashboard: http://localhost:${PORT}/admin/game-analytics`);
    dbReadyPromise.then(() => {
      console.log(`Database backend: ${db.getActiveEngine().toUpperCase()}`);
    });
  });
}

module.exports = server;
module.exports.server = server;
module.exports.handleRequest = handleRequest;
module.exports.dbReadyPromise = dbReadyPromise;
