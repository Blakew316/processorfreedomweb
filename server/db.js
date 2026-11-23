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
  // Accounts that existed before email confirmation was tracked are trusted as they are.
  if (!db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'verified'").get()) { db.exec('ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 0'); db.exec('UPDATE users SET verified = 1'); }
  addColumn('users', 'phone', "TEXT NOT NULL DEFAULT ''");
  addColumn('users', 'totp_secret', "TEXT NOT NULL DEFAULT ''");
  addColumn('users', 'totp_on', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('users', 'recovery', "TEXT NOT NULL DEFAULT ''");
  addColumn('users', 'totp_step', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('sessions', 'seen_at', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('users', 'last_seen', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('sites', 'ordering', 'TEXT');
  addColumn('menu_items', 'options', 'TEXT');
  addColumn('menu_items', 'taxable', 'INTEGER NOT NULL DEFAULT 1');
  addColumn('menu_items', 'sale', 'INTEGER NOT NULL DEFAULT 0');
  // Every item carries a real quantity. Items saved before that rule get a starting count.
  db.exec('UPDATE menu_items SET stock = 100 WHERE stock IS NULL');
  addColumn('orders', 'discount', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('orders', 'promo', "TEXT NOT NULL DEFAULT ''");
  addColumn('orders', 'scheduled', "TEXT NOT NULL DEFAULT ''");
  addColumn('orders', 'paid_at', 'INTEGER');
  addColumn('orders', 'paid_method', "TEXT NOT NULL DEFAULT ''");
  addColumn('orders', 'refunded', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('orders', 'refund_note', "TEXT NOT NULL DEFAULT ''");
  addColumn('orders', 'refunded_at', 'INTEGER');
  addColumn('orders', 'handled_by', "TEXT NOT NULL DEFAULT ''");
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, draft TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS versions_site ON versions(site_id, created_at);
    CREATE TABLE IF NOT EXISTS rewards (code TEXT NOT NULL, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, email TEXT NOT NULL, type TEXT NOT NULL, value INTEGER NOT NULL, earned_order TEXT NOT NULL, used_order TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (site_id, code));
  `);
  addColumn('menu_items', 'restock', 'INTEGER');
  addColumn('menu_items', 'mods', 'TEXT');
  addColumn('menu_items', 'label', "TEXT NOT NULL DEFAULT ''");
  addColumn('menu_items', 'revclass', "TEXT NOT NULL DEFAULT ''");
  addColumn('menu_items', 'cost', 'INTEGER');
  addColumn('sites', 'day', 'TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (site_id, user_id));
    CREATE INDEX IF NOT EXISTS members_user ON members(user_id);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, name TEXT NOT NULL, company TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS contacts_site ON contacts(site_id);
    CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, number INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'draft',
      customer TEXT NOT NULL, items TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', due TEXT NOT NULL DEFAULT '', tax_rate REAL NOT NULL DEFAULT 0, discount INTEGER NOT NULL DEFAULT 0, subtotal INTEGER NOT NULL DEFAULT 0, tax INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
      pay_url TEXT NOT NULL DEFAULT '', paid_method TEXT NOT NULL DEFAULT '', paid_note TEXT NOT NULL DEFAULT '', reminders INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, sent_at INTEGER, viewed_at INTEGER, paid_at INTEGER);
    CREATE INDEX IF NOT EXISTS invoices_site ON invoices(site_id, created_at);
  `);
  addColumn('invoices', 'kind', "TEXT NOT NULL DEFAULT 'invoice'");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cash_log (id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, kind TEXT NOT NULL, amount INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', by_name TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS cash_site ON cash_log(site_id, created_at);
    CREATE TABLE IF NOT EXISTS closeouts (id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, number INTEGER NOT NULL, from_at INTEGER NOT NULL, created_at INTEGER NOT NULL, by_name TEXT NOT NULL DEFAULT '', totals TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS closeouts_site ON closeouts(site_id, created_at);
  `);
  addColumn('invoices', 'project', "TEXT NOT NULL DEFAULT ''");
  db.exec(`
    CREATE TABLE IF NOT EXISTS gift_cards (code TEXT NOT NULL, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, initial INTEGER NOT NULL, balance INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, PRIMARY KEY (site_id, code));
    CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, name TEXT NOT NULL, customer TEXT NOT NULL, amount INTEGER NOT NULL, tax_rate REAL NOT NULL DEFAULT 0, every TEXT NOT NULL, next_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', billed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, service TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', party INTEGER NOT NULL DEFAULT 1, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS appts_site ON appointments(site_id, at);
    CREATE TABLE IF NOT EXISTS shifts (id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, name TEXT NOT NULL, day TEXT NOT NULL, start TEXT NOT NULL, finish TEXT NOT NULL, note TEXT NOT NULL DEFAULT '');
    CREATE INDEX IF NOT EXISTS shifts_site ON shifts(site_id, day);
    CREATE TABLE IF NOT EXISTS timeclock (id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, user_id TEXT NOT NULL, name TEXT NOT NULL, in_at INTEGER NOT NULL, out_at INTEGER);
    CREATE INDEX IF NOT EXISTS timeclock_site ON timeclock(site_id, in_at);
  `);
  addColumn('appointments', 'employee', "TEXT NOT NULL DEFAULT ''");
  addColumn('appointments', 'total', 'INTEGER NOT NULL DEFAULT 0');
  // Which statuses the customer was already emailed about, so flipping a booking back and forth never emails them again.
  addColumn('appointments', 'mailed', "TEXT NOT NULL DEFAULT ''");
  addColumn('appointments', 'paid_at', 'INTEGER');
  addColumn('appointments', 'paid_method', "TEXT NOT NULL DEFAULT ''");
  addColumn('members', 'details', "TEXT NOT NULL DEFAULT '{}'");
  addColumn('contacts', 'more', "TEXT NOT NULL DEFAULT '{}'");
  db.exec('CREATE TABLE IF NOT EXISTS resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL)');
  // Links staff make for a locked-out merchant sign in even with two-step on; links from the email do not.
  addColumn('resets', 'staff', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('push_subs', 'fails', 'INTEGER NOT NULL DEFAULT 0');
  // Addresses an account has signed in from, so a right password from one of them gets through even while strangers are guessing.
  db.exec('CREATE TABLE IF NOT EXISTS user_ips (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, ip TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, ip))');
  // The money ledger: one row for every payment, refund and reversal, never changed afterwards. Reports, the cash drawer and closeouts
  // read only this, so money filed in a closed batch never moves and a second refund never shifts the first one to another day.
  const ledgerIsNew = !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'money_log'").get();
  db.exec(`
    CREATE TABLE IF NOT EXISTS money_log (id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, kind TEXT NOT NULL, source TEXT NOT NULL,
      ref_id TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '', customer TEXT NOT NULL DEFAULT '', channel TEXT NOT NULL DEFAULT '', method TEXT NOT NULL DEFAULT 'Other',
      amount INTEGER NOT NULL, tip INTEGER NOT NULL DEFAULT 0, tax INTEGER NOT NULL DEFAULT 0, fee INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', by_name TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS money_site ON money_log(site_id, at);
    CREATE INDEX IF NOT EXISTS money_ref ON money_log(site_id, ref_id);
  `);
  if (ledgerIsNew) {
    // What was recorded before the ledger existed: each paid order and invoice once, and each order's refunds as one row.
    const add = db.prepare('INSERT INTO money_log (id, site_id, kind, source, ref_id, ref, customer, channel, method, amount, tip, tax, fee, note, by_name, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    db.exec('BEGIN');
    for (const o of db.prepare('SELECT * FROM orders WHERE paid_at IS NOT NULL OR refunded > 0').all()) {
      if (o.paid_at) add.run(newId(), o.site_id, 'payment', 'Order', o.id, `#${o.number}`, o.name, o.method, o.paid_method || 'Other', o.total, o.tip, o.tax, o.fee, '', o.handled_by || '', o.paid_at);
      if (o.refunded > 0) add.run(newId(), o.site_id, 'refund', 'Order', o.id, `#${o.number}`, o.name, o.method, o.paid_method || 'Other', o.refunded, 0, 0, 0, o.refund_note || '', '', o.refunded_at || o.updated_at);
    }
    for (const v of db.prepare("SELECT * FROM invoices WHERE status = 'paid' AND paid_at IS NOT NULL").all()) {
      let name = ''; try { name = JSON.parse(v.customer).name || ''; } catch { /* kept blank */ }
      add.run(newId(), v.site_id, 'payment', 'Invoice', v.id, `INV-${v.number}`, name, '', v.paid_method || 'Other', v.total, 0, v.tax, 0, v.paid_note || '', '', v.paid_at);
    }
    db.exec('COMMIT');
  }
  // A gift card pays for an order like money: the part it paid, and which card, are kept on the order.
  addColumn('orders', 'gift', 'INTEGER NOT NULL DEFAULT 0');
  // The day of the month a plan started on, so monthly bills stay on it (the 31st bills on the 30th in a short month, then the 31st again).
  addColumn('plans', 'anchor', 'INTEGER NOT NULL DEFAULT 0');
  // The tax rate the order was taxed at, so the Taxes report groups sales by the rate really used.
  addColumn('orders', 'tax_rate', 'REAL');
  addColumn('orders', 'gift_code', "TEXT NOT NULL DEFAULT ''");
  // Every change to a gift card's balance: issued, loaded, spent, or given back. The method says how a load was paid, or 'Complimentary'.
  const movesAreNew = !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'gift_moves'").get();
  db.exec(`
    CREATE TABLE IF NOT EXISTS gift_moves (id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, code TEXT NOT NULL, kind TEXT NOT NULL,
      amount INTEGER NOT NULL, method TEXT NOT NULL DEFAULT '', order_id TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS gift_moves_card ON gift_moves(site_id, code);
  `);
  if (movesAreNew) {
    // Cards made before this was kept: what they were issued with, and whatever has changed since as one move.
    const add = db.prepare('INSERT INTO gift_moves (id, site_id, code, kind, amount, method, order_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    db.exec('BEGIN');
    for (const g of db.prepare('SELECT * FROM gift_cards').all()) {
      add.run(newId(), g.site_id, g.code, 'issue', g.initial, '', '', g.created_at);
      if (g.balance !== g.initial) add.run(newId(), g.site_id, g.code, g.balance < g.initial ? 'spend' : 'load', Math.abs(g.initial - g.balance), '', '', g.created_at);
    }
    db.exec('COMMIT');
  }
  // Every uploaded photo, so storage can be counted per account and files nothing uses any more can be cleared away.
  db.exec('CREATE TABLE IF NOT EXISTS uploads (name TEXT PRIMARY KEY, user_id TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS uploads_user ON uploads(user_id);');
  // Only a link that went to the mailbox alone proves the address. Links handed to an inviter or made by staff set a password but confirm nothing.
  if (!db.prepare("SELECT 1 FROM pragma_table_info('resets') WHERE name = 'kind'").get()) {
    db.exec("ALTER TABLE resets ADD COLUMN kind TEXT NOT NULL DEFAULT 'email'");
    db.exec("UPDATE resets SET kind = CASE WHEN staff = 1 THEN 'staff' ELSE 'invite' END");
  }
  const q = (sql) => db.prepare(sql);
  // Reports look orders up by when they were paid or refunded, and customers by email.
  db.exec(`
    CREATE INDEX IF NOT EXISTS orders_paid ON orders(site_id, paid_at);
    CREATE INDEX IF NOT EXISTS orders_refunded ON orders(site_id, refunded_at);
  `);
  return {
    raw: db,
    get: (sql, ...a) => q(sql).get(...a),
    all: (sql, ...a) => q(sql).all(...a),
    run: (sql, ...a) => q(sql).run(...a),
    close: () => db.close(),
  };
}
