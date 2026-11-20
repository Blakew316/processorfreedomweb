import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const newId = (n = 9) => randomBytes(n).toString('base64url');

export function openDb(dataDir) {
  const file = dataDir === ':memory:' ? ':memory:' : (mkdirSync(dataDir, { recursive: true }), join(dataDir, 'sites.db'));
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '',
      pass_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, draft TEXT NOT NULL, published TEXT, published_at INTEGER,
      custom_domain TEXT UNIQUE, domain_verified INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sites_user ON sites(user_id);
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', message TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS leads_site ON leads(site_id, created_at);
    CREATE TABLE IF NOT EXISTS domain_requests (
      id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, user_id TEXT NOT NULL,
      desired TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL
    );
  `);
  const q = (sql) => db.prepare(sql);
  return {
    raw: db,
    get: (sql, ...a) => q(sql).get(...a),
    all: (sql, ...a) => q(sql).all(...a),
    run: (sql, ...a) => q(sql).run(...a),
    close: () => db.close(),
  };
}
