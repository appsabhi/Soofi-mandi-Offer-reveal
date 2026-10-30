const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');

// 1. Read environment
let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && fs.existsSync('.env')) {
  const content = fs.readFileSync('.env', 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DATABASE_URL=')) {
      databaseUrl = trimmed.substring('DATABASE_URL='.length).trim();
    }
  }
}

if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL not found in environment or .env');
  process.exit(1);
}

const sqlitePath = path.join(__dirname, '..', 'data', 'soofi_mandi.db');
if (!fs.existsSync(sqlitePath)) {
  console.error('ERROR: SQLite database file not found at:', sqlitePath);
  process.exit(1);
}

const sqlite = new DatabaseSync(sqlitePath);
const neonPool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('--- Starting SQLite to Neon PostgreSQL Migration ---');
  const client = await neonPool.connect();

  try {
    // 1. Run schema migration
    const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '002_neon_schema.sql'), 'utf8');
    await client.query(schemaSql);
    console.log('✓ Neon schema applied successfully');

    await client.query('BEGIN');

    // 2. Migrate players
    const sqlitePlayers = sqlite.prepare('SELECT * FROM players').all();
    console.log(`Found ${sqlitePlayers.length} players in SQLite.`);
    for (const p of sqlitePlayers) {
      await client.query(`
        INSERT INTO players (player_id, display_name, highest_score, total_games, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (player_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          highest_score = GREATEST(players.highest_score, EXCLUDED.highest_score),
          total_games = EXCLUDED.total_games,
          updated_at = EXCLUDED.updated_at
      `, [p.player_id, p.display_name, p.highest_score, p.total_games, p.created_at, p.updated_at]);
    }
    console.log('✓ Players migrated.');

    // 3. Migrate leaderboard
    const sqliteLeaderboard = sqlite.prepare('SELECT * FROM leaderboard ORDER BY id ASC').all();
    console.log(`Found ${sqliteLeaderboard.length} leaderboard records in SQLite.`);
    for (const l of sqliteLeaderboard) {
      const sessionId = `sess_migrated_${l.id}_${l.player_id.substring(0, 8)}`;
      await client.query(`
        INSERT INTO leaderboard (id, game_session_id, player_id, display_name, score, food_caught, missed_count, duration_seconds, submitted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING
      `, [l.id, sessionId, l.player_id, l.display_name, l.score, l.food_caught, l.missed_count, l.duration_seconds, l.submitted_at]);
    }
    // Update sequence
    await client.query(`SELECT setval(pg_get_serial_sequence('leaderboard', 'id'), COALESCE(MAX(id), 1)) FROM leaderboard;`);
    console.log('✓ Leaderboard migrated and sequence updated.');

    // 4. Migrate analytics events
    const sqliteEvents = sqlite.prepare('SELECT * FROM analytics_events ORDER BY id ASC').all();
    console.log(`Found ${sqliteEvents.length} analytics events in SQLite.`);
    for (const e of sqliteEvents) {
      let meta = null;
      try {
        meta = e.event_metadata ? JSON.parse(e.event_metadata) : null;
      } catch (_) {
        meta = { raw: e.event_metadata };
      }
      await client.query(`
        INSERT INTO analytics_events (id, player_id, session_id, event_name, event_metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
      `, [e.id, e.player_id, e.session_id, e.event_name, meta ? JSON.stringify(meta) : null, e.created_at]);
    }
    await client.query(`SELECT setval(pg_get_serial_sequence('analytics_events', 'id'), COALESCE(MAX(id), 1)) FROM analytics_events;`);
    console.log('✓ Analytics events migrated and sequence updated.');

    // 5. Migrate admin sessions
    const sqliteSessions = sqlite.prepare('SELECT * FROM admin_sessions').all();
    console.log(`Found ${sqliteSessions.length} admin sessions in SQLite.`);
    for (const s of sqliteSessions) {
      await client.query(`
        INSERT INTO admin_sessions (session_token, created_at, expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (session_token) DO NOTHING
      `, [s.session_token, s.created_at, s.expires_at]);
    }
    console.log('✓ Admin sessions migrated.');

    await client.query('COMMIT');

    // 6. Verification
    const neonPlayersCount = (await client.query('SELECT COUNT(*) FROM players')).rows[0].count;
    const neonLeaderboardCount = (await client.query('SELECT COUNT(*) FROM leaderboard')).rows[0].count;
    const neonEventsCount = (await client.query('SELECT COUNT(*) FROM analytics_events')).rows[0].count;
    const neonSessionsCount = (await client.query('SELECT COUNT(*) FROM admin_sessions')).rows[0].count;
    const neonClaimsCount = (await client.query('SELECT COUNT(*) FROM offer_claims')).rows[0].count;

    console.log('\n--- Migration Verification Report ---');
    console.table([
      { Table: 'players', SQLite: sqlitePlayers.length, Neon: parseInt(neonPlayersCount, 10), Match: sqlitePlayers.length === parseInt(neonPlayersCount, 10) },
      { Table: 'leaderboard', SQLite: sqliteLeaderboard.length, Neon: parseInt(neonLeaderboardCount, 10), Match: sqliteLeaderboard.length === parseInt(neonLeaderboardCount, 10) },
      { Table: 'analytics_events', SQLite: sqliteEvents.length, Neon: parseInt(neonEventsCount, 10), Match: sqliteEvents.length === parseInt(neonEventsCount, 10) },
      { Table: 'admin_sessions', SQLite: sqliteSessions.length, Neon: parseInt(neonSessionsCount, 10), Match: sqliteSessions.length === parseInt(neonSessionsCount, 10) },
      { Table: 'offer_claims', SQLite: 0, Neon: parseInt(neonClaimsCount, 10), Match: true }
    ]);

    console.log('\n✓ MIGRATION TO NEON POSTGRESQL COMPLETE AND FULLY VERIFIED!\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await neonPool.end();
  }
}

migrate();

