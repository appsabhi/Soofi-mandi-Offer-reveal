const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.join(__dirname, '..', 'data', 'soofi_mandi.db');
const backupPath = path.join(__dirname, '..', 'data', `soofi_mandi_backup_${Date.now()}.db`);

if (fs.existsSync(dbPath)) {
  fs.copyFileSync(dbPath, backupPath);
  console.log(`Backed up ${dbPath} to ${backupPath}`);
}

const db = new DatabaseSync(dbPath);
const playersCount = db.prepare('SELECT COUNT(*) as count FROM players').get().count;
const leaderboardCount = db.prepare('SELECT COUNT(*) as count FROM leaderboard').get().count;
const eventsCount = db.prepare('SELECT COUNT(*) as count FROM analytics_events').get().count;
const adminSessionsCount = db.prepare('SELECT COUNT(*) as count FROM admin_sessions').get().count;

console.log('SQLite current record counts:');
console.log({
  players: playersCount,
  leaderboard: leaderboardCount,
  analytics_events: eventsCount,
  admin_sessions: adminSessionsCount
});

// Sample records
console.log('Sample players:', db.prepare('SELECT * FROM players LIMIT 3').all());
console.log('Sample leaderboard:', db.prepare('SELECT * FROM leaderboard LIMIT 3').all());
