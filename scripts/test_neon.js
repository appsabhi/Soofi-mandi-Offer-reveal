const fs = require('fs');
const { Pool } = require('pg');

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

console.log('Connecting to Neon URL:', databaseUrl ? databaseUrl.replace(/:[^:]*@/, ':***@') : 'NONE');

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query('SELECT NOW() as now, version() as version;');
    console.log('SUCCESS! Neon Server time:', res.rows[0].now);
    console.log('Neon PostgreSQL Version:', res.rows[0].version);

    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
    console.log('Existing tables in Neon:');
    console.table(tables.rows);
  } catch (err) {
    console.error('FAILED TO CONNECT TO NEON:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();

