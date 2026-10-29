/**
 * Soofi Mandi — "Catch the Feast" Server & Private Analytics Backend
 * 
 * Features:
 * - Real, persistent SQLite database storage (using Node v22 built-in node:sqlite)
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
const { DatabaseSync } = require("node:sqlite");

const PORT = parseInt(process.env.PORT || "3000", 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "soofi_admin_2026";
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "soofi_mandi.db");
const MIGRATION_PATH = path.join(__dirname, "migrations", "001_init.sql");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize SQLite database
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// Execute schema migration
if (fs.existsSync(MIGRATION_PATH)) {
  const schemaSql = fs.readFileSync(MIGRATION_PATH, "utf8");
  db.exec(schemaSql);
}

// In-memory rate limiting and event deduplication
const submissionRateMap = new Map(); // playerId -> lastSubmissionTimestamp
const eventDedupMap = new Map();      // hash -> timestamp

// Helper: Parse JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
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
function checkAdminAuth(req) {
  // Check Authorization header or Cookie
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
  const stmt = db.prepare("SELECT session_token FROM admin_sessions WHERE session_token = ? AND expires_at > ?");
  const row = stmt.get(token, nowIso);
  return !!row;
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
      --stage-center: #1B5E45;
      --stage-edge: #0A2A20;
      --stage-floor: #123F30;
      --gold-500: #F5B800;
      --gold-300: #FFD24D;
      --gold-600: #D99E00;
      --cream-50: #FFF8E7;
      --sand-200: #F0E3C4;
      --brown-900: #2A1408;
      --spice-600: #B5532F;
      --text-muted: #CFE3D8;
      --chip-bg: rgba(255, 248, 231, 0.08);
      --chip-line: rgba(245, 184, 0, 0.35);
      --success: #7BD88F;
      --danger: #FF6B4A;
      --sans: "Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--sans);
      background-color: var(--stage-edge);
      background-image: radial-gradient(circle at 50% 20%, var(--stage-center), var(--stage-edge) 85%);
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
    .brand-logo { height: 50px; width: auto; object-fit: contain; }
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
    .btn-gold:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(245, 184, 0, 0.4); }
    .btn-outline {
      background: var(--chip-bg);
      border: 1px solid var(--chip-line);
      color: var(--cream-50);
    }
    .btn-outline:hover { background: rgba(255, 248, 231, 0.16); }

    /* Login Form Card */
    .login-overlay {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60vh;
    }
    .login-card {
      background: var(--cream-50);
      color: var(--brown-900);
      padding: 32px 28px;
      border-radius: 20px;
      max-width: 380px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      border: 1px solid var(--chip-line);
    }
    .login-card h2 { font-size: 20px; font-weight: 800; margin-bottom: 6px; color: var(--brown-900); }
    .login-card p { font-size: 13px; color: #544436; margin-bottom: 20px; }
    .input-field {
      width: 100%;
      padding: 12px 16px;
      border: 1.5px solid #EDE5D8;
      border-radius: 12px;
      font-family: var(--sans);
      font-size: 14px;
      margin-bottom: 16px;
      outline: none;
    }
    .input-field:focus { border-color: var(--gold-500); }
    .login-btn {
      width: 100%;
      padding: 12px;
      border-radius: 999px;
      background: linear-gradient(135deg, var(--gold-300), var(--gold-500));
      color: var(--brown-900);
      font-weight: 800;
      border: none;
      cursor: pointer;
    }

    /* Dashboard View */
    .dashboard-view { display: none; }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 28px;
    }
    .metric-card {
      background: var(--chip-bg);
      border: 1px solid var(--chip-line);
      border-radius: 16px;
      padding: 18px 20px;
      backdrop-filter: blur(8px);
    }
    .metric-label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
    .metric-val { font-size: 28px; font-weight: 800; color: var(--gold-500); line-height: 1.1; }
    .metric-sub { font-size: 11.5px; color: var(--text-muted); margin-top: 4px; }

    /* Section Panels */
    .panel {
      background: rgba(10, 42, 32, 0.7);
      border: 1px solid var(--chip-line);
      border-radius: 20px;
      padding: 24px 22px;
      margin-bottom: 28px;
      backdrop-filter: blur(8px);
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .panel-title { font-size: 16px; font-weight: 800; color: var(--cream-50); display: flex; align-items: center; gap: 8px; }
    .panel-title span { color: var(--gold-500); }

    /* Filter Bar */
    .filter-bar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
      margin-bottom: 16px;
    }
    .filter-select, .filter-input {
      background: var(--stage-edge);
      border: 1px solid var(--chip-line);
      color: var(--cream-50);
      padding: 7px 14px;
      border-radius: 999px;
      font-family: var(--sans);
      font-size: 12px;
      outline: none;
    }
    .filter-select:focus, .filter-input:focus { border-color: var(--gold-500); }

    /* Table Styles */
    .table-responsive { width: 100%; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th {
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 10px 14px;
      border-bottom: 1px solid var(--chip-line);
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(245, 184, 0, 0.12);
      color: var(--cream-50);
    }
    tr:hover td { background: rgba(255, 248, 231, 0.04); }
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
    .badge-rank-2 { background: #D1D5DB; color: #111827; }
    .badge-rank-3 { background: #D97706; color: #FFFFFF; }
    .badge-event {
      display: inline-block;
      padding: 2.5px 8px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .event-game_complete { background: rgba(123, 216, 143, 0.2); color: var(--success); border: 1px solid rgba(123, 216, 143, 0.4); }
    .event-game_start { background: rgba(245, 184, 0, 0.2); color: var(--gold-500); border: 1px solid var(--chip-line); }
    .event-game_replay { background: rgba(255, 210, 77, 0.2); color: var(--gold-300); border: 1px solid var(--chip-line); }
    .event-page_visit { background: rgba(207, 227, 216, 0.15); color: var(--text-muted); }
    .event-cta_click { background: rgba(255, 107, 74, 0.2); color: var(--danger); border: 1px solid rgba(255, 107, 74, 0.4); }

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
      background: rgba(0, 0, 0, 0.75);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 1000;
      padding: 16px;
    }
    .modal-box {
      background: var(--stage-edge);
      border: 1.5px solid var(--chip-line);
      border-radius: 20px;
      max-width: 650px;
      width: 100%;
      max-height: 85vh;
      overflow-y: auto;
      padding: 24px;
      position: relative;
    }
    .modal-close {
      position: absolute;
      top: 16px;
      right: 18px;
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 20px;
      cursor: pointer;
    }

    /* Privacy Notice */
    .privacy-notice {
      padding: 14px 18px;
      background: rgba(18, 63, 48, 0.6);
      border-radius: 12px;
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 24px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="header-left">
        <img src="/assets/logo.png" alt="Soofi Mandi" class="brand-logo">
        <div class="title-wrap">
          <h1>GAME ANALYTICS</h1>
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
        <div class="metric-card"><div class="metric-label">Unique Players</div><div class="metric-val" id="metric-players">-</div><div class="metric-sub">Anonymous visitors</div></div>
        <div class="metric-card"><div class="metric-label">Page Visits</div><div class="metric-val" id="metric-visits">-</div><div class="metric-sub">Total impressions</div></div>
        <div class="metric-card"><div class="metric-label">Games Started</div><div class="metric-val" id="metric-starts">-</div><div class="metric-sub">Rounds initiated</div></div>
        <div class="metric-card"><div class="metric-label">Games Completed</div><div class="metric-val" id="metric-completes">-</div><div class="metric-sub">Completed rounds</div></div>
        <div class="metric-card"><div class="metric-label">Replays</div><div class="metric-val" id="metric-replays">-</div><div class="metric-sub">Play Again rounds</div></div>
        <div class="metric-card"><div class="metric-label">Abandoned</div><div class="metric-val" id="metric-abandons">-</div><div class="metric-sub">Left before 5 misses</div></div>
        <div class="metric-card"><div class="metric-label">CTA Clicks</div><div class="metric-val" id="metric-ctas">-</div><div class="metric-sub">Button interactions</div></div>
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
        <strong>Privacy & Security Notice:</strong> All metrics and events recorded use pseudonymous, first-party browser identifiers. No personal identifying information (PII), device serials, or invasive fingerprints are stored. The data is retained solely for understanding game engagement and identifying performance improvements.
      </div>
    </div>

    <!-- Timeline Inspector Modal -->
    <div id="player-timeline-modal" class="modal-overlay">
      <div class="modal-box">
        <button id="timeline-close-btn" class="modal-close">&times;</button>
        <h3 style="color: var(--gold-500); margin-bottom: 4px;">Player Activity Timeline</h3>
        <p id="timeline-player-id" style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px; word-break: break-all;"></p>
        <div class="table-responsive">
          <table>
            <thead><tr><th>Time</th><th>Event</th><th>Details</th></tr></thead>
            <tbody id="timeline-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <script>
    (function() {
      let authToken = sessionStorage.getItem("soofi_admin_token") || "";

      const loginSection = document.getElementById("login-section");
      const dashboardSection = document.getElementById("dashboard-section");
      const logoutBtn = document.getElementById("logout-btn");
      const loginBtn = document.getElementById("admin-login-btn");
      const passInput = document.getElementById("admin-pass-input");
      const loginError = document.getElementById("login-error");

      async function attemptLogin() {
        const password = passInput.value.trim();
        if (!password) return;
        loginError.style.display = "none";
        try {
          const res = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password })
          });
          const data = await res.json();
          if (data.success && data.token) {
            authToken = data.token;
            sessionStorage.setItem("soofi_admin_token", authToken);
            showDashboard();
          } else {
            loginError.textContent = data.message || "Invalid password";
            loginError.style.display = "block";
          }
        } catch (e) {
          loginError.textContent = "Network error logging in.";
          loginError.style.display = "block";
        }
      }

      function showDashboard() {
        loginSection.style.display = "none";
        dashboardSection.style.display = "block";
        logoutBtn.style.display = "inline-flex";
        loadOverview();
        loadLeaderboard();
        loadEvents();
      }

      function logout() {
        authToken = "";
        sessionStorage.removeItem("soofi_admin_token");
        dashboardSection.style.display = "none";
        logoutBtn.style.display = "none";
        loginSection.style.display = "flex";
      }

      loginBtn.addEventListener("click", attemptLogin);
      passInput.addEventListener("keydown", (e) => { if (e.key === "Enter") attemptLogin(); });
      logoutBtn.addEventListener("click", logout);

      async function loadOverview() {
        try {
          const res = await fetch("/api/admin/analytics/overview", {
            headers: { "Authorization": "Bearer " + authToken }
          });
          if (res.status === 401) { logout(); return; }
          const data = await res.json();
          if (data.success) {
            const m = data.metrics;
            document.getElementById("metric-players").textContent = (m.uniquePlayers || 0).toLocaleString();
            document.getElementById("metric-visits").textContent = (m.pageVisits || 0).toLocaleString();
            document.getElementById("metric-starts").textContent = (m.gamesStarted || 0).toLocaleString();
            document.getElementById("metric-completes").textContent = (m.gamesCompleted || 0).toLocaleString();
            document.getElementById("metric-replays").textContent = (m.replays || 0).toLocaleString();
            document.getElementById("metric-abandons").textContent = (m.abandoned || 0).toLocaleString();
            document.getElementById("metric-ctas").textContent = (m.ctaClicks || 0).toLocaleString();
            document.getElementById("metric-highscore").textContent = (m.highestScore || 0).toLocaleString();
            document.getElementById("metric-avgscore").textContent = "Avg Score: " + (m.averageScore || 0).toFixed(1);
          }
        } catch (_) {}
      }

      async function loadLeaderboard() {
        try {
          const res = await fetch("/api/leaderboard");
          const data = await res.json();
          const tbody = document.getElementById("top10-tbody");
          tbody.innerHTML = "";
          if (data.success && data.leaderboard && data.leaderboard.length) {
            data.leaderboard.forEach((row, i) => {
              const tr = document.createElement("tr");
              const rankClass = i === 0 ? "badge-rank-1" : i === 1 ? "badge-rank-2" : i === 2 ? "badge-rank-3" : "";
              const dateStr = row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "-";
              tr.innerHTML = \`
                <td><span class="badge-rank \${rankClass}">#\${i+1}</span></td>
                <td><strong>\${escapeHtml(row.display_name)}</strong></td>
                <td style="color: var(--gold-500); font-weight: 800; font-size: 15px;">\${row.score}</td>
                <td>\${row.food_caught} caught</td>
                <td style="font-size: 11px; color: var(--text-muted);">\${dateStr}</td>
              \`;
              tbody.appendChild(tr);
            });
          } else {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align: center;'>No games recorded yet.</td></tr>";
          }
        } catch (_) {}
      }

      async function loadEvents() {
        const type = document.getElementById("event-type-filter").value;
        const search = document.getElementById("event-search-input").value.trim();
        const url = "/api/admin/analytics/events?eventType=" + encodeURIComponent(type) + "&search=" + encodeURIComponent(search);
        try {
          const res = await fetch(url, { headers: { "Authorization": "Bearer " + authToken } });
          if (res.status === 401) { logout(); return; }
          const data = await res.json();
          const tbody = document.getElementById("events-tbody");
          tbody.innerHTML = "";
          if (data.success && data.events && data.events.length) {
            data.events.forEach(evt => {
              const tr = document.createElement("tr");
              const dateStr = new Date(evt.created_at).toLocaleTimeString();
              const maskedId = evt.player_id.substring(0, 8) + "...";
              let metaStr = "-";
              try {
                const meta = JSON.parse(evt.event_metadata || "{}");
                metaStr = Object.entries(meta).map(([k, v]) => \`\${k}: \${v}\`).join(", ");
              } catch (_) {}
              tr.innerHTML = \`
                <td style="white-space: nowrap; color: var(--text-muted); font-size: 11.5px;">\${dateStr}</td>
                <td><span class="player-link" data-pid="\${escapeHtml(evt.player_id)}">\${maskedId}</span></td>
                <td><span class="badge-event event-\${escapeHtml(evt.event_name)}">\${escapeHtml(evt.event_name)}</span></td>
                <td style="font-size: 11px; color: var(--text-muted); font-family: monospace;">\${escapeHtml(evt.session_id.substring(0, 8))}...</td>
                <td style="font-size: 12px; color: var(--sand-200);">\${escapeHtml(metaStr)}</td>
              \`;
              tbody.appendChild(tr);
            });

            // Bind player link clicks
            document.querySelectorAll(".player-link").forEach(el => {
              el.addEventListener("click", () => inspectPlayer(el.getAttribute("data-pid")));
            });
          } else {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align: center;'>No events matching filters.</td></tr>";
          }
        } catch (_) {}
      }

      async function inspectPlayer(playerId) {
        if (!playerId) return;
        document.getElementById("timeline-player-id").textContent = "ID: " + playerId;
        const modal = document.getElementById("player-timeline-modal");
        modal.style.display = "flex";
        const tbody = document.getElementById("timeline-tbody");
        tbody.innerHTML = "<tr><td colspan='3' style='text-align: center;'>Loading player events...</td></tr>";

        try {
          const res = await fetch("/api/admin/analytics/player/" + encodeURIComponent(playerId), {
            headers: { "Authorization": "Bearer " + authToken }
          });
          const data = await res.json();
          tbody.innerHTML = "";
          if (data.success && data.events && data.events.length) {
            data.events.forEach(evt => {
              const tr = document.createElement("tr");
              let metaStr = "-";
              try {
                const meta = JSON.parse(evt.event_metadata || "{}");
                metaStr = Object.entries(meta).map(([k, v]) => \`\${k}: \${v}\`).join(", ");
              } catch (_) {}
              tr.innerHTML = \`
                <td style="font-size: 11px; color: var(--text-muted);">\${new Date(evt.created_at).toLocaleTimeString()}</td>
                <td><span class="badge-event event-\${escapeHtml(evt.event_name)}">\${escapeHtml(evt.event_name)}</span></td>
                <td style="font-size: 12px;">\${escapeHtml(metaStr)}</td>
              \`;
              tbody.appendChild(tr);
            });
          } else {
            tbody.innerHTML = "<tr><td colspan='3' style='text-align: center;'>No events recorded for this player.</td></tr>";
          }
        } catch (_) {
          tbody.innerHTML = "<tr><td colspan='3' style='text-align: center;'>Error loading player timeline.</td></tr>";
        }
      }

      document.getElementById("timeline-close-btn").addEventListener("click", () => {
        document.getElementById("player-timeline-modal").style.display = "none";
      });
      document.getElementById("event-type-filter").addEventListener("change", loadEvents);
      document.getElementById("event-search-input").addEventListener("input", debounce(loadEvents, 300));
      document.getElementById("refresh-events-btn").addEventListener("click", () => { loadOverview(); loadLeaderboard(); loadEvents(); });

      function debounce(fn, delay) {
        let timer = null;
        return function(...args) {
          clearTimeout(timer);
          timer = setTimeout(() => fn.apply(this, args), delay);
        };
      }

      function escapeHtml(str) {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      }

      // Check existing token on load
      if (authToken) {
        showDashboard();
      }
    })();
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
const server = http.createServer(async (req, res) => {
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
      // Deterministic ranking: highest score first, ties broken by earlier submission time
      const stmt = db.prepare(`
        SELECT id, player_id, display_name, score, food_caught, missed_count, submitted_at
        FROM leaderboard
        ORDER BY score DESC, submitted_at ASC
        LIMIT 10
      `);
      const rows = stmt.all();
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
  // 2. PUBLIC API: POST /api/leaderboard (Submit Verified Game Score)
  // -------------------------------------------------------------------------
  if (pathname === "/api/leaderboard" && method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const { playerId, displayName, score, foodCaught, missedCount, durationSeconds } = body;

      // 1. Validate required fields & types
      if (!playerId || typeof playerId !== "string" || playerId.length < 8 || playerId.length > 64) {
        return sendJson(res, 400, { success: false, message: "Invalid player ID format" });
      }

      const numScore = parseInt(score, 10);
      const numCaught = parseInt(foodCaught, 10);
      const numMissed = parseInt(missedCount, 10);
      const numDuration = parseFloat(durationSeconds) || 0;

      if (isNaN(numScore) || numScore < 0 || numScore !== numCaught) {
        return sendJson(res, 400, { success: false, message: "Invalid score or caught count mismatch" });
      }

      if (isNaN(numMissed) || numMissed < 0 || numMissed > 10) {
        return sendJson(res, 400, { success: false, message: "Invalid missed food count" });
      }

      // 2. Anti-Abuse Sanity Check: Minimum physical catch rate
      // Mandi platters spawn at min interval ~0.45s and take ~1.5s to reach the bucket.
      // E.g., catching more than 3.5 items/sec over a round is physically impossible.
      if (numScore > 5 && numDuration > 0 && (numScore / numDuration) > 3.5) {
        return sendJson(res, 400, { success: false, message: "Submission failed physical sanity verification" });
      }

      // 3. Submission Rate Limiting: Max 1 submission per 2.5 seconds per player
      const now = Date.now();
      const lastSub = submissionRateMap.get(playerId) || 0;
      if (now - lastSub < 2500) {
        return sendJson(res, 429, { success: false, message: "Too many submissions. Please wait a moment." });
      }
      submissionRateMap.set(playerId, now);

      // Clean display name
      const cleanName = sanitizeString(displayName || "Anonymous Feast Guest", 20);
      const nowIso = new Date().toISOString();

      // Upsert player record
      const upsertPlayerStmt = db.prepare(`
        INSERT INTO players (player_id, display_name, highest_score, total_games, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)
        ON CONFLICT(player_id) DO UPDATE SET
          display_name = excluded.display_name,
          highest_score = MAX(players.highest_score, excluded.highest_score),
          total_games = players.total_games + 1,
          updated_at = excluded.updated_at
      `);
      upsertPlayerStmt.run(playerId, cleanName, numScore, nowIso, nowIso);

      // Insert score entry
      const insertScoreStmt = db.prepare(`
        INSERT INTO leaderboard (player_id, display_name, score, food_caught, missed_count, duration_seconds, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insertScoreStmt.run(playerId, cleanName, numScore, numCaught, numMissed, numDuration, nowIso);

      // Query current player's personal best
      const pbStmt = db.prepare("SELECT highest_score FROM players WHERE player_id = ?");
      const pbRow = pbStmt.get(playerId);

      // Query rank among all scores
      const rankStmt = db.prepare(`
        SELECT COUNT(*) + 1 as rank
        FROM leaderboard
        WHERE score > ? OR (score = ? AND submitted_at < ?)
      `);
      const rankRow = rankStmt.get(numScore, numScore, nowIso);

      return sendJson(res, 201, {
        success: true,
        rank: rankRow ? rankRow.rank : 1,
        personalBest: pbRow ? pbRow.highest_score : numScore
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, message: "Error processing score submission" });
    }
  }

  // -------------------------------------------------------------------------
  // 3. PUBLIC API: POST /api/analytics/events (Privacy-Conscious Tracking)
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

      // Prune old dedup entries every 1000 items
      if (eventDedupMap.size > 2000) {
        for (const [k, ts] of eventDedupMap) {
          if (now - ts > 10000) eventDedupMap.delete(k);
        }
      }

      const cleanEvent = sanitizeString(eventName, 40);
      const nowIso = new Date().toISOString();
      const metaString = typeof metadata === "object" ? JSON.stringify(metadata) : "{}";

      const stmt = db.prepare(`
        INSERT INTO analytics_events (player_id, session_id, event_name, event_metadata, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(playerId, sessionId, cleanEvent, metaString, nowIso);

      return sendJson(res, 201, { success: true });
    } catch (err) {
      return sendJson(res, 500, { success: false, message: "Error recording event" });
    }
  }

  // -------------------------------------------------------------------------
  // 4. ADMIN API: POST /api/admin/login (Owner Authentication)
  // -------------------------------------------------------------------------
  if (pathname === "/api/admin/login" && method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const { password } = body;

      if (!password || password !== ADMIN_PASSWORD) {
        return sendJson(res, 401, { success: false, message: "Invalid administrative password" });
      }

      const sessionToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
      const nowIso = new Date().toISOString();

      const stmt = db.prepare("INSERT INTO admin_sessions (session_token, created_at, expires_at) VALUES (?, ?, ?)");
      stmt.run(sessionToken, nowIso, expiresAt);

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
  // 5. ADMIN API: GET /api/admin/analytics/overview (Metrics Aggregation)
  // -------------------------------------------------------------------------
  if (pathname === "/api/admin/analytics/overview" && method === "GET") {
    if (!checkAdminAuth(req)) {
      return sendJson(res, 401, { success: false, message: "Unauthorized. Admin authentication required." });
    }

    try {
      const uniquePlayers = db.prepare("SELECT COUNT(DISTINCT player_id) as count FROM analytics_events").get()?.count || 0;
      const pageVisits = db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE event_name = 'page_visit'").get()?.count || 0;
      const gamesStarted = db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE event_name = 'game_start'").get()?.count || 0;
      const gamesCompleted = db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE event_name = 'game_complete'").get()?.count || 0;
      const replays = db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE event_name = 'game_replay'").get()?.count || 0;
      const abandoned = db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE event_name = 'game_abandon'").get()?.count || 0;
      const ctaClicks = db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE event_name = 'cta_click'").get()?.count || 0;

      const scoreStats = db.prepare("SELECT MAX(score) as max_score, AVG(score) as avg_score FROM leaderboard").get();
      const highestScore = scoreStats?.max_score || 0;
      const averageScore = scoreStats?.avg_score || 0;

      return sendJson(res, 200, {
        success: true,
        metrics: {
          uniquePlayers,
          pageVisits,
          gamesStarted,
          gamesCompleted,
          replays,
          abandoned,
          ctaClicks,
          highestScore,
          averageScore
        }
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, message: "Error computing overview metrics" });
    }
  }

  // -------------------------------------------------------------------------
  // 6. ADMIN API: GET /api/admin/analytics/events (Filterable Event History)
  // -------------------------------------------------------------------------
  if (pathname === "/api/admin/analytics/events" && method === "GET") {
    if (!checkAdminAuth(req)) {
      return sendJson(res, 401, { success: false, message: "Unauthorized. Admin authentication required." });
    }

    try {
      const eventType = parsedUrl.searchParams.get("eventType") || "";
      const search = parsedUrl.searchParams.get("search") || "";
      const limit = Math.min(100, parseInt(parsedUrl.searchParams.get("limit") || "50", 10));

      let sql = "SELECT id, player_id, session_id, event_name, event_metadata, created_at FROM analytics_events WHERE 1=1";
      const params = [];

      if (eventType) {
        sql += " AND event_name = ?";
        params.push(eventType);
      }
      if (search) {
        sql += " AND (player_id LIKE ? OR session_id LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
      }

      sql += " ORDER BY created_at DESC LIMIT ?";
      params.push(limit);

      const rows = db.prepare(sql).all(...params);
      return sendJson(res, 200, { success: true, events: rows });
    } catch (err) {
      return sendJson(res, 500, { success: false, message: "Error fetching events history" });
    }
  }

  // -------------------------------------------------------------------------
  // 7. ADMIN API: GET /api/admin/analytics/player/:playerId (Timeline)
  // -------------------------------------------------------------------------
  if (pathname.startsWith("/api/admin/analytics/player/") && method === "GET") {
    if (!checkAdminAuth(req)) {
      return sendJson(res, 401, { success: false, message: "Unauthorized. Admin authentication required." });
    }

    try {
      const pid = pathname.substring("/api/admin/analytics/player/".length).trim();
      const rows = db.prepare(`
        SELECT id, session_id, event_name, event_metadata, created_at
        FROM analytics_events
        WHERE player_id = ?
        ORDER BY created_at DESC
        LIMIT 100
      `).all(pid);

      return sendJson(res, 200, { success: true, events: rows });
    } catch (err) {
      return sendJson(res, 500, { success: false, message: "Error fetching player timeline" });
    }
  }

  // -------------------------------------------------------------------------
  // 8. ADMIN DASHBOARD: GET /admin/game-analytics
  // -------------------------------------------------------------------------
  if ((pathname === "/admin/game-analytics" || pathname === "/admin/game-analytics/") && method === "GET") {
    return serveAdminDashboardHtml(res);
  }

  // -------------------------------------------------------------------------
  // 9. STATIC FILE SERVING
  // -------------------------------------------------------------------------
  let requestedFile = pathname === "/" ? "/index.html" : pathname;
  // Prevent directory traversal
  const safePath = path.normalize(requestedFile).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  serveStaticFile(req, res, filePath);
});

// Start server
server.listen(PORT, () => {
  console.log(`Soofi Mandi "Catch the Feast" Server listening on http://localhost:${PORT}`);
  console.log(`Admin Game Analytics Dashboard: http://localhost:${PORT}/admin/game-analytics`);
});
