-- Soofi Mandi "Catch the Feast" Database Schema
-- Version: 002_neon_schema.sql
-- Compatible with Neon PostgreSQL

-- 1. Players table (Anonymous Browser-Identified Players)
CREATE TABLE IF NOT EXISTS players (
  player_id VARCHAR(64) PRIMARY KEY,
  display_name VARCHAR(64) NOT NULL,
  highest_score INTEGER NOT NULL DEFAULT 0,
  total_games INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- 2. Leaderboard table (Verified Game Submissions)
CREATE TABLE IF NOT EXISTS leaderboard (
  id SERIAL PRIMARY KEY,
  game_session_id VARCHAR(64) UNIQUE,
  player_id VARCHAR(64) NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  display_name VARCHAR(64) NOT NULL,
  score INTEGER NOT NULL,
  food_caught INTEGER NOT NULL,
  missed_count INTEGER NOT NULL,
  duration_seconds REAL NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_score_date ON leaderboard (score DESC, submitted_at ASC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_player ON leaderboard (player_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_session ON leaderboard (game_session_id);

-- 3. Analytics Events table (Privacy-Conscious Usage Events)
CREATE TABLE IF NOT EXISTS analytics_events (
  id SERIAL PRIMARY KEY,
  player_id VARCHAR(64) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  event_name VARCHAR(64) NOT NULL,
  event_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_player ON analytics_events (player_id);
CREATE INDEX IF NOT EXISTS idx_events_session ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_events_name ON analytics_events (event_name);
CREATE INDEX IF NOT EXISTS idx_events_created ON analytics_events (created_at DESC);

-- 4. Admin Sessions table (Protected Analytics Access)
CREATE TABLE IF NOT EXISTS admin_sessions (
  session_token VARCHAR(128) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- 5. Customer Offer Claims table (Offer Unlock & Customer Submission)
CREATE TABLE IF NOT EXISTS offer_claims (
  claim_id VARCHAR(64) PRIMARY KEY,
  game_session_id VARCHAR(64) NOT NULL UNIQUE REFERENCES leaderboard(game_session_id) ON DELETE CASCADE,
  player_id VARCHAR(64) NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  full_name VARCHAR(100) NOT NULL,
  mobile_number VARCHAR(30) NOT NULL,
  email VARCHAR(150),
  verified_score INTEGER NOT NULL,
  offer_id VARCHAR(64) NOT NULL,
  offer_title VARCHAR(150) NOT NULL,
  offer_badge VARCHAR(100) NOT NULL,
  claim_status VARCHAR(32) NOT NULL DEFAULT 'unlocked',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_offer_claims_player ON offer_claims (player_id);
CREATE INDEX IF NOT EXISTS idx_offer_claims_mobile ON offer_claims (mobile_number);
CREATE INDEX IF NOT EXISTS idx_offer_claims_created ON offer_claims (created_at DESC);

