/**
 * Soofi Mandi — Database Access Layer
 * Supports Neon PostgreSQL (production / primary) with transparent SQLite local fallback.
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');

// 1. Load environment variables from .env if present
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.substring(0, idx).trim();
            const val = trimmed.substring(idx + 1).trim();
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
    } catch (_) {}
  }
}
loadEnv();

const DATABASE_URL = process.env.DATABASE_URL || '';
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'soofi_mandi.db');

let neonPool = null;
let sqliteDb = null;
let activeEngine = 'none';

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize SQLite fallback
function initSqlite() {
  if (sqliteDb) return sqliteDb;
  sqliteDb = new DatabaseSync(DB_PATH);
  sqliteDb.exec('PRAGMA journal_mode = WAL;');
  sqliteDb.exec('PRAGMA foreign_keys = ON;');

  // Run base SQLite migrations
  const migrationPath = path.join(__dirname, 'migrations', '001_init.sql');
  if (fs.existsSync(migrationPath)) {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    sqliteDb.exec(sql);
  }

  // Ensure offer_claims exists in SQLite for fallback
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS offer_claims (
      claim_id TEXT PRIMARY KEY,
      game_session_id TEXT NOT NULL UNIQUE,
      player_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      mobile_number TEXT NOT NULL,
      email TEXT,
      verified_score INTEGER NOT NULL,
      offer_id TEXT NOT NULL,
      offer_title TEXT NOT NULL,
      offer_badge TEXT NOT NULL,
      claim_status TEXT NOT NULL DEFAULT 'unlocked',
      created_at TEXT NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(player_id)
    );
  `);
  return sqliteDb;
}

// Convert $1, $2, $3 to ? for SQLite
function convertParamsForSqlite(sql) {
  return sql.replace(/\$(\d+)/g, '?');
}

// Initialize Neon Pool
async function init() {
  if (DATABASE_URL) {
    try {
      neonPool = new Pool({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });

      // Probe connection
      const res = await neonPool.query('SELECT NOW() as now, version() as version;');
      activeEngine = 'neon';
      console.log(`✓ Connected to Neon PostgreSQL (${res.rows[0].version.split(' ')[0]})`);

      // Ensure Neon schema is applied
      const neonSchemaPath = path.join(__dirname, 'migrations', '002_neon_schema.sql');
      if (fs.existsSync(neonSchemaPath)) {
        const schemaSql = fs.readFileSync(neonSchemaPath, 'utf8');
        await neonPool.query(schemaSql);
      }
      return;
    } catch (err) {
      console.warn(`! Neon connection failed: ${err.message}. Falling back to SQLite.`);
      if (neonPool) {
        neonPool.end().catch(() => {});
        neonPool = null;
      }
    }
  }

  // SQLite fallback
  initSqlite();
  activeEngine = 'sqlite';
  console.log('✓ Operating on SQLite persistent database storage.');
}

// Execute query returning array of rows
async function query(sql, params = []) {
  if (activeEngine === 'neon' && neonPool) {
    try {
      const res = await neonPool.query(sql, params);
      return res.rows;
    } catch (err) {
      // If Neon fails unexpectedly, log and throw sanitized error
      console.error('Neon query error:', err.message);
      throw err;
    }
  }

  // SQLite fallback
  const db = initSqlite();
  const convertedSql = convertParamsForSqlite(sql);
  const stmt = db.prepare(convertedSql);
  return stmt.all(...params);
}

// Execute query returning single row
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows && rows.length > 0 ? rows[0] : null;
}

// Execute transaction
async function transaction(callback) {
  if (activeEngine === 'neon' && neonPool) {
    const client = await neonPool.connect();
    try {
      await client.query('BEGIN');
      const txHelper = {
        query: async (qSql, qParams = []) => {
          const res = await client.query(qSql, qParams);
          return res.rows;
        },
        queryOne: async (qSql, qParams = []) => {
          const res = await client.query(qSql, qParams);
          return res.rows && res.rows.length > 0 ? res.rows[0] : null;
        }
      };
      const result = await callback(txHelper);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // SQLite fallback
  const db = initSqlite();
  db.exec('BEGIN TRANSACTION');
  try {
    const txHelper = {
      query: async (qSql, qParams = []) => {
        const converted = convertParamsForSqlite(qSql);
        return db.prepare(converted).all(...qParams);
      },
      queryOne: async (qSql, qParams = []) => {
        const converted = convertParamsForSqlite(qSql);
        const rows = db.prepare(converted).all(...qParams);
        return rows && rows.length > 0 ? rows[0] : null;
      }
    };
    const result = await callback(txHelper);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function isNeon() {
  return activeEngine === 'neon';
}

function getActiveEngine() {
  return activeEngine;
}

module.exports = {
  init,
  query,
  queryOne,
  transaction,
  isNeon,
  getActiveEngine
};

