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
    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      category TEXT NOT NULL DEFAULT 'Menu', name TEXT NOT NULL, price INTEGER NOT NULL, description TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '', available INTEGER NOT NULL DEFAULT 1, stock INTEGER, sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS menu_site ON menu_items(site_id, sort);
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, number INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'new', method TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '', vehicle TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', items TEXT NOT NULL,
      subtotal INTEGER NOT NULL, tax INTEGER NOT NULL, fee INTEGER NOT NULL, tip INTEGER NOT NULL, total INTEGER NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS orders_site ON orders(site_id, created_at);
  `);
  // Added after the first release; older databases gain the column here.
  const addColumn = (table, column, type) => { if (!db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`); };
  addColumn('sites', 'ordering', 'TEXT');
  addColumn('menu_items', 'options', 'TEXT');
  addColumn('menu_items', 'taxable', 'INTEGER NOT NULL DEFAULT 1');
  addColumn('orders', 'discount', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('orders', 'promo', "TEXT NOT NULL DEFAULT ''");
  addColumn('orders', 'scheduled', "TEXT NOT NULL DEFAULT ''");
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, draft TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS versions_site ON versions(site_id, created_at);
    CREATE TABLE IF NOT EXISTS rewards (code TEXT NOT NULL, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, email TEXT NOT NULL, type TEXT NOT NULL, value INTEGER NOT NULL, earned_order TEXT NOT NULL, used_order TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (site_id, code));
  `);
  db.exec('CREATE TABLE IF NOT EXISTS resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL)');
  const q = (sql) => db.prepare(sql);
  return {
    raw: db,
    get: (sql, ...a) => q(sql).get(...a),
    all: (sql, ...a) => q(sql).all(...a),
    run: (sql, ...a) => q(sql).run(...a),
    close: () => db.close(),
  };
}
