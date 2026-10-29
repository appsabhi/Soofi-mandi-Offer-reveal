-- Soofi Mandi "Catch the Feast" Database Schema
-- Version: 001_init.sql
-- Compatible with SQLite3 / node:sqlite

-- 1. Players table (Anonymous Browser-Identified Players)
CREATE TABLE IF NOT EXISTS players (
  player_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  highest_score INTEGER NOT NULL DEFAULT 0,
  total_games INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 2. Leaderboard table (Verified Game Submissions)
CREATE TABLE IF NOT EXISTS leaderboard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  food_caught INTEGER NOT NULL,
  missed_count INTEGER NOT NULL,
  duration_seconds REAL NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(player_id)
);

-- Index for deterministic Top 10 ranking: highest score first, then earliest submission date
CREATE INDEX IF NOT EXISTS idx_leaderboard_score_date ON leaderboard (score DESC, submitted_at ASC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_player ON leaderboard (player_id);

-- 3. Analytics Events table (Privacy-Conscious Usage Events)
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_metadata TEXT, -- JSON payload of minimal event metadata
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_player ON analytics_events (player_id);
CREATE INDEX IF NOT EXISTS idx_events_session ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_events_name ON analytics_events (event_name);
CREATE INDEX IF NOT EXISTS idx_events_created ON analytics_events (created_at DESC);

-- 4. Admin Sessions table (Protected Analytics Access)
CREATE TABLE IF NOT EXISTS admin_sessions (
  session_token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

