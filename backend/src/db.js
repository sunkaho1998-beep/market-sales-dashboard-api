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
    id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL, status TEXT NOT NULL, message TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_snapshots_created ON snapshots(created_at DESC);
  CREATE TABLE IF NOT EXISTS partner_sessions (
    token_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_partner_sessions_expiry ON partner_sessions(expires_at);
`);
export function saveSnapshot(payload) {
  db.prepare('INSERT INTO snapshots(created_at,payload_json,status,message) VALUES(?,?,?,?)')
    .run(new Date().toISOString(), JSON.stringify(payload), 'success', null);
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
export function createPartnerSession(tokenHash, expiresAt) {
  db.prepare('DELETE FROM partner_sessions WHERE expires_at <= ?').run(new Date().toISOString());
  db.prepare('INSERT INTO partner_sessions(token_hash,created_at,expires_at) VALUES(?,?,?)')
    .run(tokenHash, new Date().toISOString(), expiresAt);
}
export function hasPartnerSession(tokenHash) {
  return !!db.prepare('SELECT 1 FROM partner_sessions WHERE token_hash=? AND expires_at>?').get(tokenHash, new Date().toISOString());
}
export function deletePartnerSession(tokenHash) {
  db.prepare('DELETE FROM partner_sessions WHERE token_hash=?').run(tokenHash);
}
