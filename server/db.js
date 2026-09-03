/**
 * SQLite persistence for enquiries.
 *
 * Uses the built-in node:sqlite module, so there is no native dependency to
 * compile and nothing extra to install. Statements are prepared with bound
 * parameters throughout - never string interpolation - so user input cannot
 * alter the SQL.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = process.env.DB_PATH
  ? resolve(process.env.DB_PATH)
  : resolve(import.meta.dirname, '../data/enquiries.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

// WAL keeps reads from blocking the write that follows a form post.
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS enquiries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    reference   TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL,
    phone       TEXT,
    sector      TEXT,
    message     TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'new',
    user_agent  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_enquiries_created
    ON enquiries (created_at DESC)
`);

const insertStmt = db.prepare(`
  INSERT INTO enquiries (reference, name, email, phone, sector, message, user_agent)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const listStmt = db.prepare(`
  SELECT id, reference, name, email, phone, sector, message, status, created_at
  FROM enquiries
  ORDER BY created_at DESC, id DESC
  LIMIT ? OFFSET ?
`);

const countStmt = db.prepare('SELECT COUNT(*) AS total FROM enquiries');

const findStmt = db.prepare(`
  SELECT id, reference, name, email, phone, sector, message, status, created_at
  FROM enquiries
  WHERE reference = ?
`);

const updateStatusStmt = db.prepare(`
  UPDATE enquiries SET status = ? WHERE reference = ?
`);

/** Human-friendly, non-sequential reference the client can quote back. */
function makeReference() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BFS-${stamp}-${rand}`;
}

export function createEnquiry({ name, email, phone, sector, message, userAgent }) {
  // Retry guards against the (very unlikely) reference collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = makeReference();
    try {
      insertStmt.run(reference, name, email, phone ?? null, sector ?? null, message, userAgent ?? null);
      return findStmt.get(reference);
    } catch (err) {
      const isCollision = String(err?.message ?? '').includes('UNIQUE');
      if (!isCollision) throw err;
    }
  }
  throw new Error('Could not allocate a unique enquiry reference');
}

export function listEnquiries({ limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  return {
    total: countStmt.get().total,
    limit: safeLimit,
    offset: safeOffset,
    items: listStmt.all(safeLimit, safeOffset),
  };
}

export function getEnquiry(reference) {
  return findStmt.get(reference) ?? null;
}

export const ENQUIRY_STATUSES = ['new', 'contacted', 'quoted', 'closed'];

export function setEnquiryStatus(reference, status) {
  if (!ENQUIRY_STATUSES.includes(status)) {
    throw new Error(`Unsupported status: ${status}`);
  }
  const result = updateStatusStmt.run(status, reference);
  return result.changes > 0 ? getEnquiry(reference) : null;
}

export function closeDb() {
  db.close();
}

export { DB_PATH };
