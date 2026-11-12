import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const dir = path.dirname(config.dbPath);
fs.mkdirSync(dir, { recursive: true });
export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_snapshots_created ON snapshots(created_at DESC);
`);

export function saveSnapshot(payload) {
  const stmt = db.prepare('INSERT INTO snapshots(created_at,payload_json,status,message) VALUES(?,?,?,?)');
  stmt.run(new Date().toISOString(), JSON.stringify(payload), 'success', null);
}
export function latestSnapshot() {
  const row = db.prepare("SELECT * FROM snapshots WHERE status='success' ORDER BY id DESC LIMIT 1").get();
  if (!row) return null;
  return { createdAt: row.created_at, payload: JSON.parse(row.payload_json) };
}
export function saveFailure(message) {
  db.prepare('INSERT INTO snapshots(created_at,payload_json,status,message) VALUES(?,?,?,?)')
    .run(new Date().toISOString(), '{}', 'failed', String(message).slice(0, 1000));
}
export function latestStatus() {
  return db.prepare('SELECT created_at,status,message FROM snapshots ORDER BY id DESC LIMIT 1').get() || null;
}
