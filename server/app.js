import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { promises as fs, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { promises as dnsp } from 'node:dns';
import { join, extname, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, newId } from './db.js';
import { createSite, normalizeSite, slugify, cleanSlug, slugProblem, slugSuggestions, cleanDomain, str, esc, safeImg, LEGAL_PAGES, PLATFORM, parseMenuCsv, parsePrice, normalizeOrdering, defaultOrdering, openMethods, orderTotals, ORDER_METHODS, ORDER_STATUSES, cleanOptions, resolveOptions, findPromo, isOpenNow, orderSlots, slotLabel, money, visibleMenu, zoneFor, rewardText, DEFAULT_STOCK, wallNow, openAtWall, pricedMenu, invoiceTotals, safeUrl, applyMods } from '../shared/core.js';
import { createMailer, orderEmail, resetEmail, summaryEmail, lowStockEmail, inviteEmail, invoiceEmail, giftEmail, bookingEmail } from './mail.js';
import { scanMenu, scanEnabled } from './scan.js';
import { newVapidKeys, sendPush } from './push.js';
import { renderPage } from '../shared/render.js';

const scryptAsync = promisify(scrypt);
const ROOT = resolvePath(fileURLToPath(new URL('..', import.meta.url)));
const MIME = { '.mp4': 'video/mp4', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.json': 'application/json' };
const DAY = 86400000;
const SESSION_DAYS = 30;
const MAX_SITES = 25;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (status, message) => { throw new HttpError(status, message); };
const sha = (s) => createHash('sha256').update(s).digest('hex');

async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}
async function checkPassword(pw, stored) {
  const [salt, key] = String(stored).split(':');
  if (!salt || !key) return false;
  const got = await scryptAsync(pw, Buffer.from(salt, 'hex'), 64);
  const want = Buffer.from(key, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

function sniffImage(buf) {
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return '.png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length > 6 && buf.toString('latin1', 0, 4) === 'GIF8') return '.gif';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return '.webp';
  const start = buf.toString('utf8', 0, 600).trimStart().toLowerCase();
  if ((start.startsWith('<svg') || start.startsWith('<?xml')) && start.includes('<svg')) return '.svg';
  return '';
}

export function createApp(options = {}) {
  const env = options.env || process.env;
  const dataDir = options.dataDir || env.DATA_DIR || join(ROOT, 'data');
  const db = openDb(dataDir);
  const uploadDir = dataDir === ':memory:' ? options.uploadDir : join(dataDir, 'uploads');
  if (uploadDir) mkdirSync(uploadDir, { recursive: true });
  const dns = options.dns || dnsp;
  const mailer = options.mailer || createMailer(env);
  const pusher = options.pusher || sendPush;
  const scanner = options.scanner || (scanEnabled(env) ? (buf, type) => scanMenu(env, buf, type) : null);
  // Notification keys are made once and kept with the data, so there is nothing to configure.
  const vapid = (() => {
    const saved = db.get("SELECT value FROM settings WHERE key = 'vapid'");
    if (saved) return JSON.parse(saved.value);
    const made = newVapidKeys();
    db.run("INSERT INTO settings (key, value) VALUES ('vapid', ?)", JSON.stringify(made));
    return made;
  })();
  // The owner and everyone on the site's team hear about it.
  function notifySite(site, message) {
    for (const sub of db.all('SELECT * FROM push_subs WHERE user_id = ? OR user_id IN (SELECT user_id FROM members WHERE site_id = ?)', site.user_id, site.id)) {
      Promise.resolve().then(() => pusher(sub, message, vapid)).then((r) => { if (r === 'gone') db.run('DELETE FROM push_subs WHERE endpoint = ?', sub.endpoint); }).catch((e) => console.error('Push failed:', e.message));
    }
  }

  const SITES_DOMAIN = cleanDomain(env.SITES_DOMAIN || '');
  const APP_URL = String(env.APP_URL || '').replace(/\/$/, '');
  const APP_HOST = APP_URL.replace(/^https?:\/\//, '').toLowerCase();
  const ADMINS = new Set(String(env.ADMIN_EMAILS || '').toLowerCase().split(/[\s,]+/).filter(Boolean));
  // Staff powers need more than the right email: the address must be confirmed, by opening a link that was sent to it.
  const isAdmin = (u) => !!u && ADMINS.has(u.email) && !!u.verified;
  // Links that go out by email always point at our own address, never at whatever address the request claimed.
  const FIXED_ORIGIN = APP_URL || String(env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');

  const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

  // What the app itself may load and talk to: its own files, the two libraries it uses, and nothing else. It cannot be framed by another site or post a form elsewhere.
  const APP_CSP = ["default-src 'self'", "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self' data:", "connect-src 'self'", "frame-src 'self' https:", "worker-src 'self'", "manifest-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'"].join('; ');

  /* ---------- small helpers ---------- */

  const hits = new Map();
  function limit(key, max, windowMs) {
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || rec.until < now) {
      if (hits.size > 50000) for (const [k, v] of hits) if (v.until < now) hits.delete(k);
      hits.set(key, { n: 1, until: now + windowMs }); return;
    }
    if (++rec.n > max) bad(429, 'Too many attempts. Please wait a few minutes and try again.');
  }
  const sweep = setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.until < now) hits.delete(k); db.run('DELETE FROM sessions WHERE expires_at < ?', now); }, 10 * 60000);
  sweep.unref();

  const ipOf = (req) => String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
  const protoOf = (req) => (String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' ? 'https' : 'http');
  const hostOf = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim().toLowerCase();
  const appOrigin = (req) => APP_URL || `${protoOf(req)}://${hostOf(req)}`;
  const cnameTarget = (req) => cleanDomain(env.CNAME_TARGET || '') || APP_HOST || SITES_DOMAIN || hostOf(req).split(':')[0];

  function send(res, status, body, headers = {}) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''));
    res.writeHead(status, { 'Content-Length': buf.length, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN', ...(protoOf(res.req) === 'https' ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}), ...headers });
    res.end(res.req.method === 'HEAD' ? undefined : buf);
  }
  const json = (res, status, data, headers) => send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  const html = (res, status, body, headers) => send(res, status, body, { 'Content-Type': MIME['.html'], ...headers });
  const redirect = (res, to, status = 302) => send(res, status, '', { Location: to });

  function readBody(req, max) {
    return new Promise((ok, fail) => {
      const chunks = [];
      let size = 0;
      // Anything over the limit is read and thrown away, so the person gets a clear answer instead of a dropped connection.
      req.on('data', (c) => {
        size += c.length;
        if (size > max) { chunks.length = 0; if (size > max * 8 + 4_000_000) { fail(new HttpError(413, 'That is too large to upload.')); req.destroy(); } } else chunks.push(c);
      });
      req.on('end', () => (size > max ? fail(new HttpError(413, 'That is too large to upload.')) : ok(Buffer.concat(chunks))));
      req.on('error', fail);
    });
  }
  async function readJson(req, max = 600_000) {
    const buf = await readBody(req, max);
    if (!buf.length) return {};
    try { const v = JSON.parse(buf.toString('utf8')); return v && typeof v === 'object' ? v : {}; } catch { bad(400, 'Could not read that request.'); }
  }

  /* ---------- sessions ---------- */

  function cookie(req, name) {
    const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return m ? m[1] : '';
  }
  function startSession(req, res, userId) {
    const token = randomBytes(32).toString('base64url');
    db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha(token), userId, Date.now() + SESSION_DAYS * DAY);
    res.setHeader('Set-Cookie', `pf_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${protoOf(req) === 'https' ? '; Secure' : ''}`);
  }
  function currentUser(req) {
    const token = cookie(req, 'pf_session');
    if (!token) return null;
    const u = db.get('SELECT u.id, u.email, u.name, u.verified FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?', sha(token), Date.now());
    return u ? { id: u.id, email: u.email, name: u.name, admin: isAdmin(u) } : null;
  }
  const requireUser = (req) => currentUser(req) || bad(401, 'Please sign in to continue.');

  /* ---------- sites ---------- */

  const slugFree = (slug, exceptId = '') => !slugProblem(slug) && !db.get('SELECT 1 FROM sites WHERE slug = ? AND id != ?', slug, exceptId);
  function freeSlug(wanted) {
    let base = wanted || 'site';
    if (base.length < 3) base = `${base}site`;
    if (slugFree(base)) return base;
    for (let i = 2; i < 500; i++) { const s = `${base.slice(0, 36)}${i}`; if (slugFree(s)) return s; }
    return `${base.slice(0, 30)}${newId(4).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  }
  function siteUrl(req, site) {
    if (site.custom_domain && site.domain_verified) return `https://${site.custom_domain}`;
    if (SITES_DOMAIN) return `https://${site.slug}.${SITES_DOMAIN}`;
    return `${appOrigin(req)}/s/${site.slug}/`;
  }
  const addressFor = (req, slug) => (SITES_DOMAIN ? `${slug}.${SITES_DOMAIN}` : `${hostOf(req)}/s/${slug}`);
  // A short fingerprint of what is saved. A device sends back the one it last saw; if someone else saved since, it is told instead of overwriting them.
  const revOf = (text) => sha(text || '').slice(0, 16);
  const STALE = 'This was changed on another device or in another tab. Loading the latest version.';
  function present(req, s, full = false) {
    const out = {
      id: s.id, slug: s.slug, name: s.name, url: siteUrl(req, s), address: addressFor(req, s.slug),
      live: !!s.published, publishedAt: s.published_at, updatedAt: s.updated_at, createdAt: s.created_at,
      dirty: !!s.published && s.published !== s.draft,
      customDomain: s.custom_domain || '', domainVerified: !!s.domain_verified,
    };
    out.ordering = orderingOf(s);
    out.orderingRev = revOf(s.ordering); out.draftRev = revOf(s.draft);
    if (full) out.draft = JSON.parse(s.draft);
    return out;
  }
  const orderingOf = (s) => normalizeOrdering(s.ordering ? JSON.parse(s.ordering) : defaultOrdering());
  const toItem = (r) => ({ id: r.id, category: r.category, name: r.name, price: r.price, desc: r.description, image: r.image, available: !!r.available, stock: r.stock ?? 0, restock: r.restock ?? null, mods: r.mods ? JSON.parse(r.mods) : [], label: r.label || '', revclass: r.revclass || '', taxable: r.taxable !== 0, sale: r.sale || 0, options: r.options ? cleanOptions(JSON.parse(r.options)) : [] });
  const menuOf = (siteId) => db.all('SELECT * FROM menu_items WHERE site_id = ? ORDER BY sort, rowid', siteId).map(toItem);
  const toOrder = (r) => ({ id: r.id, number: r.number, token: r.token, status: r.status, method: r.method, name: r.name, email: r.email, phone: r.phone, address: r.address, vehicle: r.vehicle, notes: r.notes, items: JSON.parse(r.items), subtotal: r.subtotal, discount: r.discount || 0, promo: r.promo || '', scheduled: r.scheduled || '', tax: r.tax, fee: r.fee, tip: r.tip, total: r.total, createdAt: r.created_at, paidAt: r.paid_at || null, paidMethod: r.paid_method || '', refunded: r.refunded || 0, refundNote: r.refund_note || '', refundedAt: r.refunded_at || null, handledBy: r.handled_by || '' });
  function cleanItem(b, prev = {}) {
    const price = typeof b.price === 'number' ? Math.round(b.price) : b.price === undefined ? prev.price : parsePrice(b.price);
    const name = str(b.name ?? prev.name, 120).trim();
    if (!name) bad(400, 'Give the item a name.');
    if (price == null || !(price >= 0) || price > 100_000_00) bad(400, 'Enter a price like 9.99.');
    const stock = b.stock === undefined || b.stock === null || b.stock === '' ? prev.stock ?? DEFAULT_STOCK : Math.max(0, Math.min(999999, Math.round(Number(b.stock)) || 0));
    const restock = b.restock === undefined ? prev.restock ?? null : b.restock === null || b.restock === '' ? null : Math.max(0, Math.min(999999, Math.round(Number(b.restock)) || 0));
    const sale = b.sale === undefined ? prev.sale || 0 : Math.max(0, Math.min(90, Math.round(Number(b.sale)) || 0));
    return { category: str(b.category ?? prev.category, 60).trim() || 'Menu', name, price, description: str(b.desc ?? prev.description, 500).trim(), image: safeImg(b.image ?? prev.image), available: (b.available ?? prev.available ?? 1) ? 1 : 0, taxable: (b.taxable ?? prev.taxable ?? 1) ? 1 : 0, stock, restock, sale, mods: JSON.stringify(Array.isArray(b.mods) ? b.mods.slice(0, 30).map((x) => str(x, 24)) : prev.mods ? JSON.parse(prev.mods) : []), label: str(b.label ?? prev.label, 40).trim(), revclass: str(b.revclass ?? prev.revclass, 40).trim(), options: JSON.stringify(cleanOptions(b.options ?? (prev.options ? JSON.parse(prev.options) : []))) };
  }
  function insertItems(siteId, items, startStock = DEFAULT_STOCK) {
    let sort = (db.get('SELECT MAX(sort) AS m FROM menu_items WHERE site_id = ?', siteId).m || 0) + 1;
    for (const it of items) db.run('INSERT INTO menu_items (id, site_id, category, name, price, description, image, available, taxable, sale, stock, restock, options, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', newId(), siteId, it.category, it.name, it.price, it.description ?? it.desc ?? '', safeImg(it.image), it.available === false || it.available === 0 ? 0 : 1, it.taxable === false || it.taxable === 0 ? 0 : 1, it.sale || 0, it.stock ?? startStock, it.restock ?? null, typeof it.options === 'string' ? it.options : JSON.stringify(cleanOptions(it.options)), sort++);
  }
  // A promo code is either one the merchant created or an unused loyalty reward.
  function promoFor(site, ordering, code) {
    const mine = findPromo(ordering, code);
    if (mine) return mine;
    const c = str(code, 24).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const r = c && db.get('SELECT code, type, value FROM rewards WHERE site_id = ? AND code = ? AND used_order IS NULL', site.id, c);
    if (r) return { ...r, reward: true };
    // A gift card works like money off, up to what is left on it.
    const g = c && db.get('SELECT code, balance FROM gift_cards WHERE site_id = ? AND code = ? AND balance > 0', site.id, c);
    return g ? { code: g.code, type: 'amount', value: g.balance, gift: true } : null;
  }
  function businessOf(site) {
    const c = JSON.parse(site.published || site.draft);
    const b = c.business || {};
    return { name: c.brand?.name || site.name, phone: str(b.phone), email: str(b.email), payUrl: safeUrl(str(b.payUrl)), address: [b.address1, b.city, b.state].filter(Boolean).join(', ') };
  }
  function mail(kind, req, site, order, to) {
    const business = businessOf(site);
    const when = order.scheduled ? slotLabel(order.scheduled, orderingOf(site)) : '';
    const lang = kind === 'merchant' ? 'en' : JSON.parse(site.published || site.draft).lang === 'es' ? 'es' : 'en';
    const msg = orderEmail(kind, { business, order, when, lang, statusUrl: `${siteUrl(req, site).replace(/\/$/, '')}/order/${order.token}`, manageUrl: `${appOrigin(req)}/app/site/${site.id}?tab=orders`, eta: order.method === 'delivery' ? orderingOf(site).deliveryMinutes : orderingOf(site).prepMinutes });
    Promise.resolve().then(() => mailer.send({ to, ...msg, fromName: business.name, replyTo: kind === 'merchant' ? order.email : business.email })).catch((e) => console.error('Order email failed:', e.message));
  }

  // Who may do what: the owner everything, a manager everything except the team and deleting the site, kitchen staff only orders.
  const LEVEL = { kitchen: 1, manager: 2, owner: 3 };
  const roleOn = (site, user) => (site.user_id === user.id || user.admin ? 'owner' : db.get('SELECT role FROM members WHERE site_id = ? AND user_id = ?', site.id, user.id)?.role || '');
  function ownSite(req, id, need = 'manager') {
    const user = requireUser(req);
    const site = db.get('SELECT * FROM sites WHERE id = ?', id);
    const role = site ? roleOn(site, user) : '';
    if (!role) bad(404, 'We could not find that site.');
    if (LEVEL[role] < LEVEL[need]) bad(403, 'Your login does not allow that. Ask the owner of this site.');
    return { user, site, role };
  }
  const teamOf = (site) => db.all('SELECT u.id, u.name, u.email, m.role, m.created_at AS createdAt FROM members m JOIN users u ON u.id = m.user_id WHERE m.site_id = ? ORDER BY m.created_at', site.id);

  /* Kitchen capacity: how many orders are already booked for each time, and whether "as soon as possible" is full. */
  const takenSlots = (siteId) => Object.fromEntries(db.all("SELECT scheduled, COUNT(*) AS n FROM orders WHERE site_id = ? AND scheduled != '' AND status != 'cancelled' AND created_at > ? GROUP BY scheduled", siteId, Date.now() - 3 * DAY).map((r) => [r.scheduled, r.n]));
  const busyNow = (siteId, ordering) => ordering.slotLimit > 0 && db.get("SELECT COUNT(*) AS n FROM orders WHERE site_id = ? AND scheduled = '' AND status != 'cancelled' AND created_at > ?", siteId, Date.now() - 15 * 60000).n >= ordering.slotLimit;

  /* Once a day, a little after closing time, each site's day is wrapped up: the summary goes out and quantities refill. */
  const bizDay = (ordering, ms = Date.now()) => new Date(wallNow(ordering, ms) - 4 * 3600000).toISOString().slice(0, 10);
  function closeDay(site, nowMs) {
    const ordering = orderingOf(site);
    const today = bizDay(ordering, nowMs);
    if (site.day === today) return;
    if (site.day) {
      const rows = db.all("SELECT * FROM orders WHERE site_id = ? AND status != 'cancelled' AND created_at > ?", site.id, nowMs - 4 * DAY).map(toOrder).filter((o) => bizDay(ordering, o.createdAt) === site.day);
      const totals = { orders: rows.length, net: 0, tax: 0, tips: 0, total: 0 };
      const sold = new Map();
      for (const o of rows) {
        totals.net += o.subtotal - o.discount; totals.tax += o.tax; totals.tips += o.tip; totals.total += o.total;
        for (const l of o.items) { const it = sold.get(l.name) || sold.set(l.name, { name: l.name, qty: 0, sales: 0 }).get(l.name); it.qty += l.qty; it.sales += l.price * l.qty; }
      }
      const restocked = Number(db.run('UPDATE menu_items SET stock = restock WHERE site_id = ? AND restock IS NOT NULL AND stock != restock', site.id).changes) || 0;
      const low = db.all('SELECT name, stock FROM menu_items WHERE site_id = ? AND available = 1 AND stock <= ? ORDER BY stock, name LIMIT 30', site.id, ordering.lowStockAt);
      if (ordering.enabled && ordering.dailySummary && (totals.orders || low.length)) {
        const owner = db.get('SELECT email FROM users WHERE id = ?', site.user_id);
        const business = businessOf(site);
        const msg = summaryEmail({ business, totals, low, restocked, top: [...sold.values()].sort((a, b) => b.qty - a.qty).slice(0, 5), dayLabel: new Date(`${site.day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }), manageUrl: APP_URL ? `${APP_URL}/app/site/${site.id}?tab=sales` : '' });
        Promise.resolve().then(() => mailer.send({ to: ordering.notifyEmail || business.email || owner?.email, ...msg })).catch((e) => console.error('Summary email failed:', e.message));
      }
    }
    db.run('UPDATE sites SET day = ? WHERE id = ?', today, site.id);
  }
  let recurring = null;
  function tick(nowMs = Date.now()) {
    for (const site of db.all('SELECT * FROM sites')) { try { closeDay(site, nowMs); if (recurring) recurring(site, new Date(wallNow(orderingOf(site), nowMs)).toISOString().slice(0, 10)); } catch (e) { console.error('Daily wrap-up failed for', site.id, e.message); } }
  }
  /* A full copy of the database is written beside it once a day, and the last seven are kept. */
  function backup(nowMs = Date.now()) {
    if (dataDir === ':memory:') return '';
    const folder = join(dataDir, 'backups'), file = join(folder, `sites-${new Date(nowMs).toISOString().slice(0, 10)}.db`);
    mkdirSync(folder, { recursive: true });
    if (existsSync(file)) return file;
    db.run(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    for (const old of readdirSync(folder).filter((f) => /^sites-\d{4}-\d\d-\d\d\.db$/.test(f)).sort().slice(0, -7)) rmSync(join(folder, old), { force: true });
    return file;
  }
  const daily = setInterval(() => { tick(); try { backup(); } catch (e) { console.error('Backup failed:', e.message); } }, 5 * 60000);
  daily.unref();
  setTimeout(tick, 4000).unref();
  function packDraft(input) {
    const draft = JSON.stringify(normalizeSite(input));
    if (draft.length > 400_000) bad(413, 'This site has more content than we can save. Try shortening some text.');
    return draft;
  }

  async function checkDns(domain, target) {
    const targetIps = await dns.resolve4(target).catch(() => []);
    const details = [];
    for (const name of [domain, `www.${domain}`]) {
      const cnames = (await dns.resolveCname(name).catch(() => [])).map((c) => c.toLowerCase().replace(/\.$/, ''));
      const ips = await dns.resolve4(name).catch(() => []);
      const ok = cnames.includes(target) || (targetIps.length > 0 && ips.some((ip) => targetIps.includes(ip)));
      details.push({ name, ok, found: cnames[0] || ips[0] || '' });
    }
    return { ok: details.some((d) => d.ok), details };
  }

  // Optional: when the service runs on Render, attach the domain so it gets a certificate automatically.
  async function attachToHost(domain) {
    if (!env.RENDER_API_KEY || !env.RENDER_SERVICE_ID) return;
    for (const name of [domain, `www.${domain}`]) {
      await fetch(`https://api.render.com/v1/services/${env.RENDER_SERVICE_ID}/custom-domains`, {
        method: 'POST', headers: { Authorization: `Bearer ${env.RENDER_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      }).catch((e) => console.error('Could not attach domain to host:', name, e.message));
    }
  }

  /* ---------- API ---------- */

  const routes = [];
  const route = (method, pattern, fn) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn });

  route('GET', '/api/config', (req, res) => json(res, 200, {
    sitesDomain: SITES_DOMAIN, addressPrefix: SITES_DOMAIN ? '' : `${hostOf(req)}/s/`, addressSuffix: SITES_DOMAIN ? `.${SITES_DOMAIN}` : '', cnameTarget: cnameTarget(req), emailEnabled: !!mailer.enabled, pushKey: vapid.publicKey, scanEnabled: !!scanner,
  }));

  route('GET', '/api/me', (req, res) => json(res, 200, { user: currentUser(req) }));

  route('POST', '/api/auth/signup', async (req, res) => {
    limit(`signup:${ipOf(req)}`, 10, 3600000);
    limit('signup:all', 400, 3600000);
    const b = await readJson(req);
    const email = str(b.email, 200).trim().toLowerCase();
    const name = str(b.name, 80).trim();
    const password = str(b.password, 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad(400, 'Enter a valid email address.');
    if (password.length < 8) bad(400, 'Use at least 8 characters for your password.');
    if (db.get('SELECT 1 FROM users WHERE email = ?', email)) bad(409, 'An account with that email already exists. Try signing in.');
    const id = newId();
    db.run('INSERT INTO users (id, email, name, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)', id, email, name, await hashPassword(password), Date.now());
    startSession(req, res, id);
    json(res, 201, { user: { id, email, name, admin: false } });
  });

  route('POST', '/api/auth/login', async (req, res) => {
    limit(`login:${ipOf(req)}`, 12, 15 * 60000);
    const b = await readJson(req);
    const email = str(b.email, 200).trim().toLowerCase();
    // Counted per account as well, so guessing one person's password cannot be spread across many addresses.
    limit(`login-as:${email}`, 10, 15 * 60000);
    const u = db.get('SELECT * FROM users WHERE email = ?', email);
    const ok = await checkPassword(str(b.password, 200), u ? u.pass_hash : '00:00');
    if (!u || !ok) bad(401, 'That email and password do not match.');
    startSession(req, res, u.id);
    json(res, 200, { user: { id: u.id, email: u.email, name: u.name, admin: isAdmin(u) } });
  });

  // Signs this account out on every phone, tablet and computer at once.
  route('POST', '/api/auth/logout-all', (req, res) => {
    const user = requireUser(req);
    db.run('DELETE FROM sessions WHERE user_id = ?', user.id);
    db.run('DELETE FROM push_subs WHERE user_id = ?', user.id);
    res.setHeader('Set-Cookie', 'pf_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    json(res, 200, { ok: true });
  });

  route('POST', '/api/auth/logout', (req, res) => {
    const token = cookie(req, 'pf_session');
    if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', sha(token));
    res.setHeader('Set-Cookie', 'pf_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    json(res, 200, { ok: true });
  });

  route('POST', '/api/auth/password', async (req, res) => {
    const user = requireUser(req);
    limit(`pw:${user.id}`, 8, 15 * 60000);
    const b = await readJson(req);
    const row = db.get('SELECT pass_hash FROM users WHERE id = ?', user.id);
    if (!await checkPassword(str(b.current, 200), row.pass_hash)) bad(401, 'Your current password is not right.');
    if (str(b.next, 200).length < 8) bad(400, 'Use at least 8 characters for your new password.');
    db.run('UPDATE users SET pass_hash = ? WHERE id = ?', await hashPassword(str(b.next, 200)), user.id);
    // Sign out every other device.
    db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', user.id, sha(cookie(req, 'pf_session')));
    json(res, 200, { ok: true });
  });

  function resetLinkFor(req, userId, hours = 2) {
    const token = randomBytes(32).toString('base64url');
    db.run('DELETE FROM resets WHERE user_id = ?', userId);
    db.run('INSERT INTO resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha(token), userId, Date.now() + hours * 3600000);
    return `${FIXED_ORIGIN || appOrigin(req)}/reset?token=${token}`;
  }
  route('POST', '/api/auth/forgot', async (req, res) => {
    limit(`forgot:${ipOf(req)}`, 6, 3600000);
    const email = str((await readJson(req)).email, 200).trim().toLowerCase();
    limit(`forgot-for:${email}`, 4, 3600000);
    const u = db.get('SELECT id, name, email FROM users WHERE email = ?', email);
    if (u) { const msg = resetEmail({ name: u.name, link: resetLinkFor(req, u.id) }); mailer.send({ to: u.email, ...msg }).catch((e) => console.error('Reset email failed:', e.message)); }
    // The same answer either way, so this cannot be used to find out who has an account.
    json(res, 200, { ok: true, emailEnabled: !!mailer.enabled });
  });
  route('POST', '/api/auth/reset', async (req, res) => {
    limit(`reset:${ipOf(req)}`, 10, 3600000);
    const b = await readJson(req);
    const row = db.get('SELECT * FROM resets WHERE token_hash = ? AND expires_at > ?', sha(str(b.token, 200)), Date.now());
    if (!row) bad(400, 'This reset link has expired or was already used. Ask for a new one.');
    if (str(b.password, 200).length < 8) bad(400, 'Use at least 8 characters for your password.');
    db.run('UPDATE users SET pass_hash = ?, verified = 1 WHERE id = ?', await hashPassword(str(b.password, 200)), row.user_id);
    db.run('DELETE FROM resets WHERE user_id = ?', row.user_id);
    db.run('DELETE FROM sessions WHERE user_id = ?', row.user_id);
    startSession(req, res, row.user_id);
    const u = db.get('SELECT id, email, name, verified FROM users WHERE id = ?', row.user_id);
    json(res, 200, { user: { id: u.id, email: u.email, name: u.name, admin: isAdmin(u) } });
  });

  route('GET', '/api/address', (req, res, p, url) => {
    const typed = url.searchParams.get('slug');
    const name = str(url.searchParams.get('name'), 80);
    const slug = typed != null ? cleanSlug(typed) : slugify(name);
    const except = str(url.searchParams.get('site'), 40);
    const problem = slugProblem(slug);
    const available = !problem && slugFree(slug, except);
    const suggestions = available ? [] : slugSuggestions(name || slug).filter((s) => slugFree(s, except)).slice(0, 3);
    json(res, 200, { slug, available, problem: problem || (available ? '' : 'That address is taken.'), address: addressFor(req, slug), suggestions });
  });

  route('GET', '/api/sites', (req, res) => {
    const user = requireUser(req);
    const rows = db.all('SELECT s.*, (SELECT COUNT(*) FROM leads l WHERE l.site_id = s.id) AS leads FROM sites s WHERE user_id = ? OR id IN (SELECT site_id FROM members WHERE user_id = ?) ORDER BY updated_at DESC', user.id, user.id);
    json(res, 200, { sites: rows.map((s) => ({ ...present(req, s, true), role: s.user_id === user.id ? 'owner' : roleOn(s, { id: user.id }), leads: s.leads, menu: menuOf(s.id).slice(0, 12), newOrders: db.get("SELECT COUNT(*) AS n FROM orders WHERE site_id = ? AND status = 'new'", s.id).n })) });
  });

  route('POST', '/api/sites', async (req, res) => {
    const user = requireUser(req);
    const b = await readJson(req);
    const name = str(b.name, 80).trim();
    if (!name) bad(400, 'Give your business a name to continue.');
    if (db.get('SELECT COUNT(*) AS n FROM sites WHERE user_id = ?', user.id).n >= MAX_SITES) bad(400, `You can have up to ${MAX_SITES} sites.`);
    const slug = freeSlug(b.slug ? cleanSlug(b.slug) : slugify(name));
    const ordering = b.kind === 'ordering';
    const draft = packDraft(createSite(name, str(b.template, 40), { ...b, kind: ordering ? 'ordering' : 'website', email: b.email ?? user.email }));
    const id = newId();
    const now = Date.now();
    const settings = normalizeOrdering({ ...defaultOrdering(), enabled: ordering, methods: b.methods && typeof b.methods === 'object' ? b.methods : defaultOrdering().methods, notifyEmail: user.email });
    if (ordering && !openMethods(settings).length) settings.methods.pickup = true;
    db.run('INSERT INTO sites (id, user_id, slug, name, draft, ordering, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, user.id, slug, name, draft, JSON.stringify(settings), now, now);
    if (typeof b.csv === 'string' && b.csv.trim()) insertItems(id, parseMenuCsv(b.csv.slice(0, 1_000_000)).items);
    json(res, 201, { site: present(req, db.get('SELECT * FROM sites WHERE id = ?', id), true) });
  });

  route('GET', '/api/sites/:id', (req, res, p) => { const { site, role } = ownSite(req, p.id, 'kitchen'); json(res, 200, { site: { ...present(req, site, true), role } }); });

  route('PUT', '/api/sites/:id', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const b = await readJson(req);
    if (b.rev && b.rev !== revOf(site.draft)) bad(412, STALE);
    const draft = packDraft(b.draft);
    db.run('UPDATE sites SET draft = ?, name = ?, updated_at = ? WHERE id = ?', draft, JSON.parse(draft).brand.name, Date.now(), site.id);
    json(res, 200, { site: present(req, db.get('SELECT * FROM sites WHERE id = ?', site.id)) });
  });

  route('DELETE', '/api/sites/:id', (req, res, p) => {
    const { site } = ownSite(req, p.id, 'owner');
    db.run('DELETE FROM sites WHERE id = ?', site.id);
    json(res, 200, { ok: true });
  });

  route('POST', '/api/sites/:id/publish', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const b = await readJson(req);
    const draft = b.draft ? packDraft(b.draft) : site.draft;
    const now = Date.now();
    db.run('UPDATE sites SET draft = ?, name = ?, published = ?, published_at = ?, updated_at = ? WHERE id = ?', draft, JSON.parse(draft).brand.name, draft, now, now, site.id);
    if (draft !== site.published) {
      db.run('INSERT INTO versions (id, site_id, draft, created_at) VALUES (?, ?, ?, ?)', newId(), site.id, draft, now);
      db.run('DELETE FROM versions WHERE site_id = ? AND id NOT IN (SELECT id FROM versions WHERE site_id = ? ORDER BY created_at DESC LIMIT 20)', site.id, site.id);
    }
    json(res, 200, { site: present(req, db.get('SELECT * FROM sites WHERE id = ?', site.id)) });
  });

  route('POST', '/api/sites/:id/unpublish', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    db.run('UPDATE sites SET published = NULL, published_at = NULL, updated_at = ? WHERE id = ?', Date.now(), site.id);
    json(res, 200, { site: present(req, db.get('SELECT * FROM sites WHERE id = ?', site.id)) });
  });

  route('PUT', '/api/sites/:id/address', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const slug = cleanSlug((await readJson(req)).slug);
    if (slugProblem(slug)) bad(400, slugProblem(slug));
    if (!slugFree(slug, site.id)) bad(409, 'That address is taken. Try another.');
    db.run('UPDATE sites SET slug = ?, updated_at = ? WHERE id = ?', slug, Date.now(), site.id);
    json(res, 200, { site: present(req, db.get('SELECT * FROM sites WHERE id = ?', site.id)) });
  });

  route('POST', '/api/sites/:id/domain', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const domain = cleanDomain((await readJson(req)).domain).replace(/^www\./, '');
    if (!domain) bad(400, 'Enter a domain like yourbusiness.com.');
    if (SITES_DOMAIN && (domain === SITES_DOMAIN || domain.endsWith(`.${SITES_DOMAIN}`))) bad(400, 'That address belongs to us. Change your free address above instead.');
    if (db.get('SELECT 1 FROM sites WHERE custom_domain = ? AND id != ? AND domain_verified = 1', domain, site.id)) bad(409, 'That domain is already connected to another site.');
    // A claim nobody proved does not hold the domain: whoever can actually point it here gets it.
    db.run('UPDATE sites SET custom_domain = NULL WHERE custom_domain = ? AND id != ? AND domain_verified = 0', domain, site.id);
    db.run('UPDATE sites SET custom_domain = ?, domain_verified = 0, updated_at = ? WHERE id = ?', domain, Date.now(), site.id);
    json(res, 200, { site: present(req, db.get('SELECT * FROM sites WHERE id = ?', site.id)) });
  });

  route('POST', '/api/sites/:id/domain/verify', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    if (!site.custom_domain) bad(400, 'Add a domain first.');
    limit(`dns:${site.id}`, 20, 10 * 60000);
    const result = await checkDns(site.custom_domain, cnameTarget(req));
    if (result.ok && !site.domain_verified) {
      db.run('UPDATE sites SET domain_verified = 1, updated_at = ? WHERE id = ?', Date.now(), site.id);
      await attachToHost(site.custom_domain);
    }
    json(res, 200, { ...result, site: present(req, db.get('SELECT * FROM sites WHERE id = ?', site.id)) });
  });

  route('DELETE', '/api/sites/:id/domain', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    db.run('UPDATE sites SET custom_domain = NULL, domain_verified = 0, updated_at = ? WHERE id = ?', Date.now(), site.id);
    json(res, 200, { site: present(req, db.get('SELECT * FROM sites WHERE id = ?', site.id)) });
  });

  route('POST', '/api/sites/:id/domain-request', async (req, res, p) => {
    const { site, user } = ownSite(req, p.id);
    const b = await readJson(req);
    const desired = str(b.desired, 200).trim();
    if (!desired) bad(400, 'Tell us the domain you would like.');
    db.run("UPDATE domain_requests SET status = 'replaced' WHERE site_id = ? AND status = 'open'", site.id);
    db.run('INSERT INTO domain_requests (id, site_id, user_id, desired, note, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), site.id, user.id, desired, str(b.note, 1000).trim(), Date.now());
    json(res, 201, { ok: true });
  });

  route('GET', '/api/sites/:id/domain-request', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    json(res, 200, { request: db.get('SELECT desired, note, status, created_at AS createdAt FROM domain_requests WHERE site_id = ? ORDER BY created_at DESC LIMIT 1', site.id) || null });
  });

  route('GET', '/api/sites/:id/leads', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    json(res, 200, { leads: db.all('SELECT id, name, email, phone, message, created_at AS createdAt FROM leads WHERE site_id = ? ORDER BY created_at DESC LIMIT 500', site.id) });
  });

  route('DELETE', '/api/sites/:id/leads/:lead', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    db.run('DELETE FROM leads WHERE id = ? AND site_id = ?', p.lead, site.id);
    json(res, 200, { ok: true });
  });

  /* Menu and inventory. Changes here apply to the live site straight away. */
  route('GET', '/api/sites/:id/menu', (req, res, p) => json(res, 200, { items: menuOf(ownSite(req, p.id, 'kitchen').site.id) }));

  /* The team: extra logins for a site. */
  route('GET', '/api/sites/:id/team', (req, res, p) => {
    const { site } = ownSite(req, p.id, 'owner');
    json(res, 200, { members: teamOf(site), owner: db.get('SELECT name, email FROM users WHERE id = ?', site.user_id) });
  });
  route('POST', '/api/sites/:id/team', async (req, res, p) => {
    const { site, user } = ownSite(req, p.id, 'owner');
    const b = await readJson(req);
    const email = str(b.email, 200).trim().toLowerCase();
    const role = b.role === 'manager' ? 'manager' : 'kitchen';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad(400, 'Enter a valid email address.');
    const owner = db.get('SELECT email FROM users WHERE id = ?', site.user_id);
    if (email === owner.email) bad(400, 'That is the owner of this site, who already has full access.');
    let person = db.get('SELECT id FROM users WHERE email = ?', email);
    let link = '';
    if (!person) {
      if (teamOf(site).length >= 25) bad(400, 'A site can have up to 25 team logins.');
      person = { id: newId() };
      // A password nobody knows; the person chooses their own from the link.
      db.run('INSERT INTO users (id, email, name, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)', person.id, email, str(b.name, 80).trim(), await hashPassword(randomBytes(24).toString('hex')), Date.now());
      link = resetLinkFor(req, person.id, 72);
    }
    db.run('INSERT INTO members (site_id, user_id, role, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(site_id, user_id) DO UPDATE SET role = excluded.role', site.id, person.id, role, Date.now());
    const msg = inviteEmail({ business: site.name, role, link: link || `${appOrigin(req)}/login`, inviter: user.name || user.email, fresh: !!link });
    Promise.resolve().then(() => mailer.send({ to: email, ...msg })).catch((e) => console.error('Invite email failed:', e.message));
    json(res, 201, { members: teamOf(site), link, emailed: !!mailer.enabled });
  });
  route('DELETE', '/api/sites/:id/team/:user', (req, res, p) => {
    const { site } = ownSite(req, p.id, 'owner');
    db.run('DELETE FROM members WHERE site_id = ? AND user_id = ?', site.id, p.user);
    json(res, 200, { members: teamOf(site) });
  });

  /* Everyone who has ordered, newest first. */
  route('GET', '/api/sites/:id/customers', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const people = new Map();
    for (const o of db.all('SELECT name, email, phone, total, status, items, created_at FROM orders WHERE site_id = ? ORDER BY created_at DESC LIMIT 20000', site.id)) {
      const key = o.email.toLowerCase();
      const c = people.get(key) || people.set(key, { name: o.name, email: key, phone: o.phone, orders: 0, spent: 0, last: o.created_at, first: o.created_at, items: new Map() }).get(key);
      c.first = o.created_at;
      if (o.status === 'cancelled') continue;
      c.orders++; c.spent += o.total;
      for (const l of JSON.parse(o.items)) c.items.set(l.name, (c.items.get(l.name) || 0) + l.qty);
    }
    const customers = [...people.values()].map((c) => ({ ...c, items: undefined, favourite: [...c.items].sort((a, b) => b[1] - a[1])[0]?.[0] || '' }));
    const byEmail = new Map(customers.map((c) => [c.email, c]));
    // People the merchant added by hand, for invoices, sit in the same list.
    for (const k of contactsOf(site.id)) {
      const hit = k.email && byEmail.get(k.email.toLowerCase());
      if (hit) Object.assign(hit, { contactId: k.id, company: k.company, address: k.address });
      else customers.push({ name: k.name, company: k.company, email: k.email, phone: k.phone, address: k.address, orders: 0, spent: 0, last: null, first: k.createdAt, favourite: '', contactId: k.id });
    }
    json(res, 200, { customers });
  });

  /* Contacts and invoices, for catering and other large orders billed outside the order page. */
  const contactsOf = (siteId) => db.all('SELECT id, name, company, email, phone, address, created_at AS createdAt FROM contacts WHERE site_id = ? ORDER BY name', siteId);
  const cleanContact = (b) => {
    const c = { name: str(b?.name, 120).trim(), company: str(b?.company, 120).trim(), email: str(b?.email, 200).trim().toLowerCase(), phone: str(b?.phone, 40).trim(), address: str(b?.address, 300).trim() };
    if (!c.name && !c.company) bad(400, 'Add the customer’s name or company.');
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) bad(400, 'That email address does not look right.');
    if (!c.name) c.name = c.company;
    return c;
  };
  function keepContact(siteId, c) {
    const old = c.email ? db.get('SELECT id FROM contacts WHERE site_id = ? AND email = ?', siteId, c.email) : db.get('SELECT id FROM contacts WHERE site_id = ? AND email = ? AND lower(name) = lower(?)', siteId, '', c.name);
    if (old) db.run('UPDATE contacts SET name = ?, company = ?, phone = ?, address = ? WHERE id = ?', c.name, c.company, c.phone, c.address, old.id);
    else if (db.get('SELECT COUNT(*) AS n FROM contacts WHERE site_id = ?', siteId).n < 5000) db.run('INSERT INTO contacts (id, site_id, name, company, email, phone, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', newId(), siteId, c.name, c.company, c.email, c.phone, c.address, Date.now());
  }
  route('POST', '/api/sites/:id/contacts', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    keepContact(site.id, cleanContact(await readJson(req)));
    json(res, 201, { contacts: contactsOf(site.id) });
  });
  route('DELETE', '/api/sites/:id/contacts/:contact', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    db.run('DELETE FROM contacts WHERE id = ? AND site_id = ?', p.contact, site.id);
    json(res, 200, { contacts: contactsOf(site.id) });
  });

  const invoiceUrl = (req, site, token) => `${siteUrl(req, site).replace(/\/$/, '')}/invoice/${token}`;
  const toInvoice = (r, req, site) => ({ id: r.id, number: r.number, kind: r.kind === 'estimate' ? 'estimate' : 'invoice', label: `${r.kind === 'estimate' ? 'EST' : 'INV'}-${r.number}`, status: r.status, customer: JSON.parse(r.customer), items: JSON.parse(r.items), notes: r.notes, due: r.due, taxRate: r.tax_rate, discount: r.discount, subtotal: r.subtotal, tax: r.tax, total: r.total,
    project: r.project || '', payUrl: r.pay_url, paidMethod: r.paid_method, paidNote: r.paid_note, reminders: r.reminders, createdAt: r.created_at, sentAt: r.sent_at, viewedAt: r.viewed_at, paidAt: r.paid_at, ...(req ? { url: invoiceUrl(req, site, r.token) } : {}) });
  const invoicesOf = (req, site) => db.all('SELECT * FROM invoices WHERE site_id = ? ORDER BY created_at DESC LIMIT 2000', site.id).map((r) => toInvoice(r, req, site));
  function cleanInvoice(b) {
    const customer = cleanContact(b.customer);
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 200).map((l) => ({ name: str(l?.name, 160).trim(), qty: Math.max(1, Math.min(100000, Math.round(Number(l?.qty)) || 1)), price: Math.max(0, Math.min(1_000_000_00, Math.round(Number(l?.price)) || 0)), taxable: l?.taxable !== false })).filter((l) => l.name);
    const rate = Number(b.taxRate);
    const taxRate = Number.isFinite(rate) ? Math.min(30, Math.max(0, Math.round(rate * 1000) / 1000)) : 0;
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due)) && !Number.isNaN(Date.parse(`${b.due}T00:00:00Z`)) ? b.due : '';
    return { customer, items, notes: str(b.notes, 2000).trim(), project: str(b.project, 80).trim(), due, taxRate, payUrl: safeUrl(str(b.payUrl, 500).trim()), ...invoiceTotals(items, taxRate, b.discount) };
  }
  const ownInvoice = (site, invId) => db.get('SELECT * FROM invoices WHERE id = ? AND site_id = ?', invId, site.id) || bad(404, 'We could not find that invoice.');
  const saveInvoice = (rowId, v) => db.run('UPDATE invoices SET customer = ?, items = ?, notes = ?, due = ?, tax_rate = ?, discount = ?, subtotal = ?, tax = ?, total = ?, pay_url = ?, project = ?, updated_at = ? WHERE id = ?', JSON.stringify(v.customer), JSON.stringify(v.items), v.notes, v.due, v.taxRate, v.discount, v.subtotal, v.tax, v.total, v.payUrl, v.project || '', Date.now(), rowId);

  route('POST', '/api/sites/:id/contacts/import', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const rows = (await readJson(req, 1_500_000)).rows;
    let added = 0, skipped = 0;
    for (const r of Array.isArray(rows) ? rows.slice(0, 5000) : []) { try { keepContact(site.id, cleanContact(r)); added++; } catch { skipped++; } }
    json(res, 200, { added, skipped, contacts: contactsOf(site.id) });
  });

  /* Gift cards: a code with a balance, spent like money off at checkout or at the counter. */
  const giftsOf = (site) => db.all('SELECT code, initial, balance, name, email, note, created_at AS createdAt FROM gift_cards WHERE site_id = ? ORDER BY created_at DESC LIMIT 2000', site.id);
  route('GET', '/api/sites/:id/gift-cards', (req, res, p) => json(res, 200, { cards: giftsOf(ownSite(req, p.id).site) }));
  route('POST', '/api/sites/:id/gift-cards', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const b = await readJson(req);
    const amount = Math.round(Number(b.amount));
    if (!(amount >= 100) || amount > 100_000_00) bad(400, 'Enter an amount of at least $1.00.');
    const email = str(b.email, 200).trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad(400, 'That email address does not look right.');
    const code = `GC${randomBytes(5).toString('hex').toUpperCase()}`;
    db.run('INSERT INTO gift_cards (code, site_id, initial, balance, name, email, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', code, site.id, amount, amount, str(b.name, 120).trim(), email, str(b.note, 200).trim(), Date.now());
    if (email) Promise.resolve().then(() => mailer.send({ to: email, ...giftEmail({ business: site.name, code, amount, name: str(b.name, 120).trim(), url: `${siteUrl(req, site).replace(/\/$/, '')}/order` }), fromName: site.name })).catch((e) => console.error('Gift card email failed:', e.message));
    json(res, 201, { code, emailed: !!(email && mailer.enabled), cards: giftsOf(site) });
  });
  // Spend from a card at the counter, or top it up.
  route('POST', '/api/sites/:id/gift-cards/:code', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const card = db.get('SELECT * FROM gift_cards WHERE site_id = ? AND code = ?', site.id, str(p.code, 24).toUpperCase()) || bad(404, 'We could not find that gift card.');
    const change = Math.round(Number((await readJson(req)).change));
    if (!change || card.balance + change < 0) bad(400, `This card has ${money(card.balance)} left.`);
    db.run('UPDATE gift_cards SET balance = balance + ? WHERE site_id = ? AND code = ?', change, site.id, card.code);
    json(res, 200, { cards: giftsOf(site) });
  });

  /* Recurring payments: a plan sends the customer a fresh invoice on a schedule. */
  const EVERY = { weekly: 7, biweekly: 14, monthly: 'm1', quarterly: 'm3', yearly: 'm12' };
  const plansOf = (site) => db.all('SELECT * FROM plans WHERE site_id = ? ORDER BY created_at DESC', site.id).map((r) => ({ id: r.id, name: r.name, customer: JSON.parse(r.customer), amount: r.amount, taxRate: r.tax_rate, every: r.every, nextDate: r.next_date, status: r.status, billed: r.billed }));
  const stepDate = (day, every) => { const d = new Date(`${day}T12:00:00Z`); const e = EVERY[every]; if (typeof e === 'number') d.setUTCDate(d.getUTCDate() + e); else d.setUTCMonth(d.getUTCMonth() + Number(e.slice(1))); return d.toISOString().slice(0, 10); };
  route('GET', '/api/sites/:id/plans', (req, res, p) => json(res, 200, { plans: plansOf(ownSite(req, p.id).site) }));
  route('POST', '/api/sites/:id/plans', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const b = await readJson(req);
    const customer = cleanContact(b.customer);
    if (!customer.email) bad(400, 'Add the customer’s email address, so each invoice can be sent.');
    if (db.get('SELECT COUNT(*) AS n FROM plans WHERE site_id = ?', site.id).n >= 200) bad(400, 'A site can have up to 200 recurring payments.');
    const name = str(b.name, 120).trim() || bad(400, 'Give the plan a name, such as Weekly lunch order.');
    const amount = Math.round(Number(b.amount));
    if (!(amount > 0) || amount > 100_000_000) bad(400, 'Enter an amount above zero, up to $1,000,000.');
    if (!EVERY[b.every]) bad(400, 'Choose how often to bill.');
    const start = /^\d{4}-\d{2}-\d{2}$/.test(String(b.start)) ? b.start : new Date(wallNow(orderingOf(site))).toISOString().slice(0, 10);
    const rate = Number(b.taxRate);
    db.run('INSERT INTO plans (id, site_id, name, customer, amount, tax_rate, every, next_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', newId(), site.id, name, JSON.stringify(customer), amount, Number.isFinite(rate) ? Math.min(30, Math.max(0, rate)) : 0, b.every, start, Date.now());
    keepContact(site.id, customer);
    json(res, 201, { plans: plansOf(site) });
  });
  route('POST', '/api/sites/:id/plans/:plan', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const status = (await readJson(req)).status === 'paused' ? 'paused' : 'active';
    db.run('UPDATE plans SET status = ? WHERE id = ? AND site_id = ?', status, p.plan, site.id);
    json(res, 200, { plans: plansOf(site) });
  });
  route('DELETE', '/api/sites/:id/plans/:plan', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    db.run('DELETE FROM plans WHERE id = ? AND site_id = ?', p.plan, site.id);
    json(res, 200, { plans: plansOf(site) });
  });
  // Run with the daily wrap-up: any plan that is due gets its invoice made and sent.
  function billPlans(site, today) {
    const fake = { headers: { host: APP_HOST || 'localhost' }, socket: {} };
    for (const plan of db.all("SELECT * FROM plans WHERE site_id = ? AND status = 'active' AND next_date <= ?", site.id, today)) {
      const customer = JSON.parse(plan.customer);
      const v = { customer, items: [{ name: plan.name, qty: 1, price: plan.amount, taxable: true }], notes: '', project: '', due: stepDate(today, 'weekly'), taxRate: plan.tax_rate, payUrl: '' };
      Object.assign(v, invoiceTotals(v.items, v.taxRate, 0));
      const invId = newId(), now = Date.now();
      const number = (db.get('SELECT MAX(number) AS n FROM invoices WHERE site_id = ?', site.id).n || 1000) + 1;
      db.run("INSERT INTO invoices (id, site_id, number, token, kind, status, customer, items, created_at, updated_at, sent_at) VALUES (?, ?, ?, ?, 'invoice', 'sent', ?, ?, ?, ?, ?)", invId, site.id, number, newId(18), '{}', '[]', now, now, now);
      saveInvoice(invId, v);
      let next = stepDate(plan.next_date, plan.every); while (next <= today) next = stepDate(next, plan.every);
      db.run('UPDATE plans SET next_date = ?, billed = billed + ? WHERE id = ?', next, v.total, plan.id);
      const inv = toInvoice(ownInvoice(site, invId), fake, site), business = businessOf(site);
      Promise.resolve().then(() => mailer.send({ to: customer.email, ...invoiceEmail({ business, invoice: inv, url: inv.url }), fromName: business.name, replyTo: business.email })).catch((e) => console.error('Plan invoice email failed:', e.message));
    }
  }
  recurring = billPlans;

  /* Appointments: customers ask for a time on the booking page; the business confirms or declines. */
  const toAppt = (r) => ({ id: r.id, service: r.service, minutes: r.minutes, at: r.at, name: r.name, email: r.email, phone: r.phone, party: r.party, notes: r.notes, status: r.status, createdAt: r.created_at });
  const apptWhen = (at) => new Date(`${at}:00Z`).toLocaleString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  function makeAppt(site, ordering, b, viaPublic) {
    const svc = ordering.booking.services.find((x) => x.id === b.service) || (viaPublic ? bad(400, 'Choose what you would like to book.') : { name: str(b.serviceName, 80).trim() || 'Booking', minutes: 0 });
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) ? b.date : bad(400, 'Choose a date.');
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.time)) ? b.time : bad(400, 'Choose a time.');
    const at = `${day}T${time}`, wall = Date.parse(`${at}:00Z`);
    const name = str(b.name, 120).trim(), email = str(b.email, 200).trim().toLowerCase(), phone = str(b.phone, 40).trim();
    if (!name) bad(400, 'Please add your name.');
    if (viaPublic) {
      if (phone.replace(/\D/g, '').length < 7 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad(400, 'Please add your phone number and a valid email address.');
      const now = wallNow(ordering);
      if (!(wall > now)) bad(400, 'Please choose a time in the future.');
      if (wall > now + 90 * DAY) bad(400, 'Please choose a date in the next three months.');
      if (!openAtWall(ordering, wall)) bad(409, 'We are closed at that time. Please choose another.');
      if (db.get("SELECT COUNT(*) AS n FROM appointments WHERE site_id = ? AND at = ? AND status IN ('pending','confirmed')", site.id, at).n >= ordering.booking.perSlot) bad(409, 'That time is fully booked. Please choose another.');
    }
    const id = newId();
    db.run('INSERT INTO appointments (id, site_id, service, minutes, at, name, email, phone, party, notes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, site.id, svc.name, svc.minutes, at, name, email, phone, Math.max(1, Math.min(100, Math.round(Number(b.party)) || 1)), str(b.notes, 500).trim(), viaPublic ? 'pending' : 'confirmed', Date.now());
    return toAppt(db.get('SELECT * FROM appointments WHERE id = ?', id));
  }
  route('GET', '/api/sites/:id/appointments', (req, res, p) => {
    const { site } = ownSite(req, p.id, 'kitchen');
    const ordering = orderingOf(site);
    const today = new Date(wallNow(ordering)).toISOString().slice(0, 10);
    json(res, 200, { today, appointments: db.all('SELECT * FROM appointments WHERE site_id = ? AND at >= ? ORDER BY at LIMIT 2000', site.id, new Date(Date.parse(`${today}T00:00:00Z`) - 30 * DAY).toISOString().slice(0, 10)).map(toAppt) });
  });
  route('POST', '/api/sites/:id/appointments', async (req, res, p) => {
    const { site } = ownSite(req, p.id, 'kitchen');
    json(res, 201, { appointment: makeAppt(site, orderingOf(site), await readJson(req), false) });
  });
  route('POST', '/api/sites/:id/appointments/:appt', async (req, res, p) => {
    const { site } = ownSite(req, p.id, 'kitchen');
    const row = db.get('SELECT * FROM appointments WHERE id = ? AND site_id = ?', p.appt, site.id) || bad(404, 'We could not find that appointment.');
    const status = str((await readJson(req)).status, 20);
    if (!['pending', 'confirmed', 'completed', 'cancelled', 'noshow'].includes(status)) bad(400, 'Unknown status.');
    db.run('UPDATE appointments SET status = ? WHERE id = ?', status, row.id);
    if (status !== row.status && ['confirmed', 'cancelled'].includes(status) && row.email) { const business = businessOf(site); Promise.resolve().then(() => mailer.send({ to: row.email, ...bookingEmail(status, { business, appt: toAppt(row), when: apptWhen(row.at) }), fromName: business.name, replyTo: business.email })).catch((e) => console.error('Booking email failed:', e.message)); }
    json(res, 200, { appointment: toAppt(db.get('SELECT * FROM appointments WHERE id = ?', row.id)) });
  });

  /* Staff schedule and time clock. */
  route('GET', '/api/sites/:id/shifts', (req, res, p) => {
    const { site } = ownSite(req, p.id, 'kitchen');
    const today = new Date(wallNow(orderingOf(site))).toISOString().slice(0, 10);
    const people = [db.get('SELECT name, email FROM users WHERE id = ?', site.user_id), ...teamOf(site)].map((u) => u.name || u.email);
    json(res, 200, { today, people, shifts: db.all('SELECT id, name, day, start, finish, note FROM shifts WHERE site_id = ? AND day >= ? ORDER BY day, start LIMIT 2000', site.id, new Date(Date.parse(`${today}T00:00:00Z`) - 7 * DAY).toISOString().slice(0, 10)) });
  });
  route('POST', '/api/sites/:id/shifts', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const b = await readJson(req);
    const ok = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t));
    if (!str(b.name, 80).trim()) bad(400, 'Choose who is working.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.day)) || !ok(b.start) || !ok(b.finish)) bad(400, 'Choose a day, a start time and an end time.');
    db.run('INSERT INTO shifts (id, site_id, name, day, start, finish, note) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), site.id, str(b.name, 80).trim(), b.day, b.start, b.finish, str(b.note, 120).trim());
    json(res, 201, { ok: true });
  });
  route('DELETE', '/api/sites/:id/shifts/:shift', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    db.run('DELETE FROM shifts WHERE id = ? AND site_id = ?', p.shift, site.id);
    json(res, 200, { ok: true });
  });
  const clockOf = (site, user) => ({ entries: db.all('SELECT id, user_id AS userId, name, in_at AS inAt, out_at AS outAt FROM timeclock WHERE site_id = ? AND in_at > ? ORDER BY in_at DESC LIMIT 2000', site.id, Date.now() - 45 * DAY), mine: db.get('SELECT id, in_at AS inAt FROM timeclock WHERE site_id = ? AND user_id = ? AND out_at IS NULL', site.id, user.id) || null });
  route('GET', '/api/sites/:id/timeclock', (req, res, p) => { const { site, user } = ownSite(req, p.id, 'kitchen'); json(res, 200, clockOf(site, user)); });
  route('POST', '/api/sites/:id/timeclock', async (req, res, p) => {
    const { site, user } = ownSite(req, p.id, 'kitchen');
    const open = db.get('SELECT id FROM timeclock WHERE site_id = ? AND user_id = ? AND out_at IS NULL', site.id, user.id);
    if ((await readJson(req)).action === 'out') { if (!open) bad(400, 'You are not clocked in.'); db.run('UPDATE timeclock SET out_at = ? WHERE id = ?', Date.now(), open.id); }
    else { if (open) bad(400, 'You are already clocked in.'); db.run('INSERT INTO timeclock (id, site_id, user_id, name, in_at) VALUES (?, ?, ?, ?, ?)', newId(), site.id, user.id, user.name || user.email, Date.now()); }
    json(res, 200, clockOf(site, user));
  });
  route('DELETE', '/api/sites/:id/timeclock/:entry', (req, res, p) => {
    const { site, user } = ownSite(req, p.id);
    db.run('DELETE FROM timeclock WHERE id = ? AND site_id = ?', p.entry, site.id);
    json(res, 200, clockOf(site, user));
  });

  /* Devices that get new-order notifications for this site. */
  route('GET', '/api/sites/:id/devices', (req, res, p) => {
    const { site } = ownSite(req, p.id, 'owner');
    json(res, 200, { devices: db.all('SELECT s.endpoint, s.created_at AS createdAt, u.name, u.email FROM push_subs s JOIN users u ON u.id = s.user_id WHERE s.user_id = ? OR s.user_id IN (SELECT user_id FROM members WHERE site_id = ?) ORDER BY s.created_at DESC', site.user_id, site.id).map((d) => ({ id: sha(d.endpoint).slice(0, 16), service: new URL(d.endpoint).hostname.replace(/^.*?([^.]+\.[^.]+)$/, '$1'), createdAt: d.createdAt, name: d.name, email: d.email })) });
  });
  route('DELETE', '/api/sites/:id/devices/:device', (req, res, p) => {
    const { site } = ownSite(req, p.id, 'owner');
    for (const d of db.all('SELECT endpoint FROM push_subs WHERE user_id = ? OR user_id IN (SELECT user_id FROM members WHERE site_id = ?)', site.user_id, site.id)) if (sha(d.endpoint).slice(0, 16) === p.device) db.run('DELETE FROM push_subs WHERE endpoint = ?', d.endpoint);
    json(res, 200, { ok: true });
  });

  route('GET', '/api/sites/:id/invoices', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    json(res, 200, { invoices: invoicesOf(req, site), contacts: contactsOf(site.id), payUrl: businessOf(site).payUrl });
  });
  route('POST', '/api/sites/:id/invoices', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const raw = await readJson(req, 200_000);
    const v = cleanInvoice(raw);
    const id = newId(), now = Date.now();
    const number = (db.get('SELECT MAX(number) AS n FROM invoices WHERE site_id = ?', site.id).n || 1000) + 1;
    db.run('INSERT INTO invoices (id, site_id, number, token, kind, customer, items, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, site.id, number, newId(18), raw.kind === 'estimate' ? 'estimate' : 'invoice', '{}', '[]', now, now);
    saveInvoice(id, v);
    keepContact(site.id, v.customer);
    json(res, 201, { invoice: toInvoice(ownInvoice(site, id), req, site), invoices: invoicesOf(req, site), contacts: contactsOf(site.id) });
  });
  route('PUT', '/api/sites/:id/invoices/:inv', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const row = ownInvoice(site, p.inv);
    if (row.status === 'paid' || row.status === 'void') bad(409, 'A paid or cancelled invoice cannot be changed. Duplicate it instead.');
    const v = cleanInvoice(await readJson(req, 200_000));
    saveInvoice(row.id, v);
    keepContact(site.id, v.customer);
    json(res, 200, { invoice: toInvoice(ownInvoice(site, row.id), req, site), invoices: invoicesOf(req, site), contacts: contactsOf(site.id) });
  });
  // Emails the invoice. The first send makes it official; later sends are reminders.
  route('POST', '/api/sites/:id/invoices/:inv/send', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const row = ownInvoice(site, p.inv);
    if (row.status === 'paid' || row.status === 'void') bad(409, 'This invoice is already closed.');
    const inv = toInvoice(row, req, site);
    if (!inv.items.length) bad(400, 'Add at least one line before sending.');
    if (!inv.customer.email) bad(400, 'Add the customer’s email address before sending.');
    limit(`invoice:${site.id}`, 60, 3600000);
    const reminder = row.status === 'sent';
    const business = businessOf(site);
    await mailer.send({ to: inv.customer.email, ...invoiceEmail({ business, invoice: inv, url: inv.url, reminder, estimate: inv.kind === 'estimate' }), fromName: business.name, replyTo: business.email || orderingOf(site).notifyEmail }).catch((e) => { console.error('Invoice email failed:', e.message); bad(502, 'We could not send that email just now. Please try again, or copy the link and send it yourself.'); });
    db.run("UPDATE invoices SET status = 'sent', sent_at = COALESCE(sent_at, ?), reminders = reminders + ?, updated_at = ? WHERE id = ?", Date.now(), reminder ? 1 : 0, Date.now(), row.id);
    json(res, 200, { invoice: toInvoice(ownInvoice(site, row.id), req, site), invoices: invoicesOf(req, site), emailed: !!mailer.enabled });
  });
  route('POST', '/api/sites/:id/invoices/:inv/status', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const row = ownInvoice(site, p.inv);
    const b = await readJson(req);
    const now = Date.now();
    if (b.status === 'paid' && row.kind === 'estimate') bad(400, 'Convert this estimate to an invoice before taking payment.');
    if (b.status === 'paid') db.run("UPDATE invoices SET status = 'paid', paid_at = ?, paid_method = ?, paid_note = ?, sent_at = COALESCE(sent_at, ?), updated_at = ? WHERE id = ?", now, str(b.method, 40).trim(), str(b.note, 300).trim(), now, now, row.id);
    else if (b.status === 'sent') db.run("UPDATE invoices SET status = 'sent', paid_at = NULL, paid_method = '', paid_note = '', sent_at = COALESCE(sent_at, ?), updated_at = ? WHERE id = ?", now, now, row.id);
    else if (b.status === 'void') db.run("UPDATE invoices SET status = 'void', updated_at = ? WHERE id = ?", now, row.id);
    else bad(400, 'Unknown status.');
    json(res, 200, { invoice: toInvoice(ownInvoice(site, row.id), req, site), invoices: invoicesOf(req, site) });
  });
  // An accepted estimate becomes an invoice, ready to send for payment.
  route('POST', '/api/sites/:id/invoices/:inv/convert', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const row = ownInvoice(site, p.inv);
    if (row.kind !== 'estimate') bad(400, 'This is already an invoice.');
    db.run("UPDATE invoices SET kind = 'invoice', status = 'draft', sent_at = NULL, viewed_at = NULL, reminders = 0, updated_at = ? WHERE id = ?", Date.now(), row.id);
    json(res, 200, { invoice: toInvoice(ownInvoice(site, row.id), req, site), invoices: invoicesOf(req, site) });
  });

  /* Payments taken at the counter are recorded here, so the books add up. Nothing is charged by this system. */
  const TENDERS = ['Cash', 'Card', 'Online payment', 'Check', 'Gift card', 'Other'];
  route('POST', '/api/sites/:id/orders/:order/payment', async (req, res, p) => {
    const { site, user, role } = ownSite(req, p.id, 'kitchen');
    const row = db.get('SELECT * FROM orders WHERE id = ? AND site_id = ?', p.order, site.id) || bad(404, 'We could not find that order.');
    const b = await readJson(req);
    const now = Date.now();
    if (b.refund !== undefined) {
      if (role === 'kitchen') bad(403, 'Your login does not allow refunds. Ask a manager.');
      if (!row.paid_at) bad(400, 'This order has no payment recorded, so there is nothing to refund.');
      const amount = Math.round(Number(b.refund));
      if (!(amount > 0) || amount > row.total - row.refunded) bad(400, `Enter an amount up to ${money(row.total - row.refunded)}.`);
      db.run('UPDATE orders SET refunded = refunded + ?, refund_note = ?, refunded_at = ?, updated_at = ? WHERE id = ?', amount, str(b.note, 300).trim(), now, now, row.id);
    } else if (b.clear === true) {
      if (role === 'kitchen') bad(403, 'Your login does not allow removing a payment. Ask a manager.');
      if (row.refunded) bad(400, 'This payment has a refund against it and cannot be removed.');
      db.run("UPDATE orders SET paid_at = NULL, paid_method = '', updated_at = ? WHERE id = ?", now, row.id);
    } else {
      const method = TENDERS.includes(b.method) ? b.method : bad(400, 'Choose how the customer paid.');
      if (role === 'kitchen' && row.paid_at && method !== row.paid_method) bad(403, 'Your login does not allow changing a payment. Ask a manager.');
      db.run('UPDATE orders SET paid_at = COALESCE(paid_at, ?), paid_method = ?, handled_by = CASE WHEN handled_by = \'\' THEN ? ELSE handled_by END, updated_at = ? WHERE id = ?', now, method, user.name || user.email, now, row.id);
    }
    json(res, 200, { order: toOrder(db.get('SELECT * FROM orders WHERE id = ?', row.id)) });
  });

  // A period chosen the same way as the sales report: today, yesterday, week, month, last30 or custom days.
  function period(url, ordering) {
    const dayOf = (ms) => new Date(wallNow(ordering, ms)).toISOString().slice(0, 10);
    const shift = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
    const today = dayOf(Date.now());
    const range = str(url.searchParams.get('range'), 20) || 'today';
    let from = today, to = today;
    if (range === 'yesterday') from = to = shift(today, -1);
    else if (range === 'week') from = shift(today, -new Date(`${today}T00:00:00Z`).getUTCDay());
    else if (range === 'month') from = `${today.slice(0, 8)}01`;
    else if (range === 'last30') from = shift(today, -29);
    else if (range === 'custom') { const f = url.searchParams.get('from'), t = url.searchParams.get('to'); if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(t))) bad(400, 'Choose a start and end date.'); [from, to] = f <= t ? [f, t] : [t, f]; }
    const lo = Date.parse(`${from}T00:00:00Z`) - 2 * DAY, hi = Date.parse(`${to}T00:00:00Z`) + 3 * DAY;
    return { range, from, to, today, lo, hi, within: (ms) => { const d = dayOf(ms); return d >= from && d <= to; }, dayOf, timeOf: (ms) => { const w = new Date(wallNow(ordering, ms)); return `${String(w.getUTCHours()).padStart(2, '0')}:${String(w.getUTCMinutes()).padStart(2, '0')}`; } };
  }
  // Every recorded payment and refund between two moments: orders paid at the counter and invoices marked paid.
  function moneyMoves(site, lo, hi) {
    const payments = [], refunds = [];
    for (const o of db.all('SELECT * FROM orders WHERE site_id = ? AND ((paid_at >= ? AND paid_at < ?) OR (refunded_at >= ? AND refunded_at < ?))', site.id, lo, hi, lo, hi)) {
      if (o.paid_at >= lo && o.paid_at < hi) payments.push({ at: o.paid_at, source: 'Order', ref: `#${o.number}`, customer: o.name, method: o.paid_method || 'Other', amount: o.total, tip: o.tip, by: o.handled_by });
      if (o.refunded && o.refunded_at >= lo && o.refunded_at < hi) refunds.push({ at: o.refunded_at, source: 'Order', ref: `#${o.number}`, customer: o.name, method: o.paid_method || 'Other', amount: o.refunded, note: o.refund_note });
    }
    for (const v of db.all("SELECT * FROM invoices WHERE site_id = ? AND status = 'paid' AND paid_at >= ? AND paid_at < ?", site.id, lo, hi)) payments.push({ at: v.paid_at, source: 'Invoice', ref: `INV-${v.number}`, customer: JSON.parse(v.customer).name || '', method: v.paid_method || 'Other', amount: v.total, tip: 0, by: '' });
    return { payments, refunds };
  }
  const tally = ({ payments, refunds }) => {
    const tenders = new Map();
    for (const x of payments) { const t = tenders.get(x.method) || tenders.set(x.method, { method: x.method, count: 0, amount: 0, refunds: 0 }).get(x.method); t.count++; t.amount += x.amount; }
    for (const x of refunds) { const t = tenders.get(x.method) || tenders.set(x.method, { method: x.method, count: 0, amount: 0, refunds: 0 }).get(x.method); t.refunds += x.amount; }
    const paid = payments.reduce((a, x) => a + x.amount, 0), back = refunds.reduce((a, x) => a + x.amount, 0);
    return { tenders: [...tenders.values()].sort((a, b) => b.amount - a.amount), totals: { payments: paid, count: payments.length, refunds: back, refundCount: refunds.length, net: paid - back } };
  };
  route('GET', '/api/sites/:id/transactions', (req, res, p, url) => {
    const { site } = ownSite(req, p.id);
    const pr = period(url, orderingOf(site));
    const moves = moneyMoves(site, pr.lo, pr.hi);
    const keep = (x) => pr.within(x.at);
    const stamp = (x) => ({ ...x, date: pr.dayOf(x.at), time: pr.timeOf(x.at) });
    const picked = { payments: moves.payments.filter(keep).map(stamp).sort((a, b) => b.at - a.at), refunds: moves.refunds.filter(keep).map(stamp).sort((a, b) => b.at - a.at) };
    json(res, 200, { range: pr.range, from: pr.from, to: pr.to, ...picked, ...tally(picked), tenderList: TENDERS });
  });

  /* The cash drawer: money put in and taken out, beside the cash sales recorded on orders. */
  const cashRows = (site, lo, hi) => db.all('SELECT id, kind, amount, note, by_name AS by, created_at AS at FROM cash_log WHERE site_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC', site.id, lo, hi);
  route('GET', '/api/sites/:id/cash', (req, res, p, url) => {
    const { site } = ownSite(req, p.id);
    const pr = period(url, orderingOf(site));
    const entries = cashRows(site, pr.lo, pr.hi).filter((x) => pr.within(x.at)).map((x) => ({ ...x, date: pr.dayOf(x.at), time: pr.timeOf(x.at) }));
    const moves = moneyMoves(site, pr.lo, pr.hi);
    const cashSales = moves.payments.filter((x) => x.method === 'Cash' && pr.within(x.at)).reduce((a, x) => a + x.amount, 0);
    const cashRefunds = moves.refunds.filter((x) => x.method === 'Cash' && pr.within(x.at)).reduce((a, x) => a + x.amount, 0);
    const sum = (k) => entries.filter((x) => x.kind === k).reduce((a, x) => a + x.amount, 0);
    json(res, 200, { range: pr.range, from: pr.from, to: pr.to, entries, totals: { cashSales, cashRefunds, paidIn: sum('in'), paidOut: sum('out'), expected: cashSales - cashRefunds + sum('in') - sum('out') } });
  });
  route('POST', '/api/sites/:id/cash', async (req, res, p) => {
    const { site, user } = ownSite(req, p.id);
    const b = await readJson(req);
    const amount = Math.round(Number(b.amount));
    if (!(amount > 0) || amount > 100_000_000) bad(400, 'Enter an amount above zero.');
    db.run('INSERT INTO cash_log (id, site_id, kind, amount, note, by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), site.id, b.kind === 'out' ? 'out' : 'in', amount, str(b.note, 200).trim(), user.name || user.email, Date.now());
    json(res, 201, { ok: true });
  });
  route('DELETE', '/api/sites/:id/cash/:entry', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    db.run('DELETE FROM cash_log WHERE id = ? AND site_id = ?', p.entry, site.id);
    json(res, 200, { ok: true });
  });

  /* Closeout: everything recorded since the last closeout is the open batch. Closing it files the totals away. */
  function openBatch(site) {
    const last = db.get('SELECT created_at, number FROM closeouts WHERE site_id = ? ORDER BY created_at DESC LIMIT 1', site.id);
    const since = last ? last.created_at : 0, now = Date.now() + 1;
    const moves = moneyMoves(site, since, now);
    const cash = cashRows(site, since, now);
    const sum = (k) => cash.filter((x) => x.kind === k).reduce((a, x) => a + x.amount, 0);
    return { since, number: (last?.number || 0) + 1, ...tally(moves), paidIn: sum('in'), paidOut: sum('out') };
  }
  route('GET', '/api/sites/:id/closeouts', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    json(res, 200, { open: openBatch(site), history: db.all('SELECT id, number, from_at AS fromAt, created_at AS createdAt, by_name AS by, totals FROM closeouts WHERE site_id = ? ORDER BY created_at DESC LIMIT 200', site.id).map((r) => ({ ...r, totals: JSON.parse(r.totals) })) });
  });
  route('POST', '/api/sites/:id/closeouts', (req, res, p) => {
    const { site, user } = ownSite(req, p.id);
    const open = openBatch(site);
    if (!open.totals.count && !open.totals.refundCount && !open.paidIn && !open.paidOut) bad(400, 'There is nothing in the open batch to close out.');
    db.run('INSERT INTO closeouts (id, site_id, number, from_at, created_at, by_name, totals) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), site.id, open.number, open.since, Date.now(), user.name || user.email, JSON.stringify({ ...open.totals, tenders: open.tenders, paidIn: open.paidIn, paidOut: open.paidOut }));
    json(res, 201, { ok: true });
  });

  route('DELETE', '/api/sites/:id/invoices/:inv', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    db.run('DELETE FROM invoices WHERE id = ? AND site_id = ?', p.inv, site.id);
    json(res, 200, { invoices: invoicesOf(req, site) });
  });

  /* Reads a photo or PDF of a paper menu. Nothing is saved until the merchant confirms the list. */
  route('POST', '/api/sites/:id/menu/scan', async (req, res, p) => {
    const { user } = ownSite(req, p.id);
    if (!scanner) bad(503, 'Menu scanning is not switched on yet.');
    limit(`scan:${user.id}`, 20, 3600000);
    const buf = await readBody(req, 12 * 1024 * 1024);
    const type = buf.toString('latin1', 0, 5) === '%PDF-' ? 'application/pdf' : { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[sniffImage(buf)];
    if (!type) bad(415, 'Upload a photo (JPG or PNG) or a PDF of your menu.');
    let out;
    try { out = await scanner(buf, type); } catch (e) { console.error('Menu scan failed:', e.message); bad(502, 'We could not read that menu just now. Please try again.'); }
    json(res, 200, { items: (out.items || []).slice(0, 1000), reason: out.reason || '' });
  });

  route('POST', '/api/sites/:id/menu', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    if (db.get('SELECT COUNT(*) AS n FROM menu_items WHERE site_id = ?', site.id).n >= 1000) bad(400, 'A menu can hold up to 1,000 items.');
    insertItems(site.id, [cleanItem(await readJson(req))]);
    json(res, 201, { items: menuOf(site.id) });
  });

  route('POST', '/api/sites/:id/menu/import', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const b = await readJson(req, 1_500_000);
    // Either a spreadsheet, or a list the merchant has already checked (from a scanned menu).
    const parsed = Array.isArray(b.items)
      ? { errors: [], items: b.items.slice(0, 1000).map((x) => { try { const it = cleanItem({ category: x?.category, name: x?.name, price: typeof x?.price === 'number' ? x.price : 0, desc: x?.desc }); return { ...it, stock: undefined }; } catch { return null; } }).filter(Boolean) }
      : parseMenuCsv(str(b.csv, 1_000_000));
    if (!parsed.items.length) bad(400, parsed.errors[0]?.reason || 'No items were found in the file.');
    const existing = b.replace ? 0 : db.get('SELECT COUNT(*) AS n FROM menu_items WHERE site_id = ?', site.id).n;
    const room = Math.max(0, 1000 - existing);
    db.raw.exec('BEGIN');
    try {
      if (b.replace) db.run('DELETE FROM menu_items WHERE site_id = ?', site.id);
      insertItems(site.id, parsed.items.slice(0, room), b.startStock === undefined ? DEFAULT_STOCK : Math.max(0, Math.min(999999, Math.round(Number(b.startStock)) || 0)));
      db.raw.exec('COMMIT');
    } catch (e) { db.raw.exec('ROLLBACK'); throw e; }
    json(res, 200, { imported: Math.min(room, parsed.items.length), skipped: parsed.errors, items: menuOf(site.id) });
  });

  route('PUT', '/api/sites/:id/menu/:item', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const prev = db.get('SELECT * FROM menu_items WHERE id = ? AND site_id = ?', p.item, site.id) || bad(404, 'That item no longer exists.');
    const it = cleanItem(await readJson(req), prev);
    db.run('UPDATE menu_items SET category = ?, name = ?, price = ?, description = ?, image = ?, available = ?, taxable = ?, sale = ?, stock = ?, restock = ?, options = ?, mods = ?, label = ?, revclass = ? WHERE id = ?', it.category, it.name, it.price, it.description, it.image, it.available, it.taxable, it.sale, it.stock, it.restock, it.options, it.mods, it.label, it.revclass, prev.id);
    json(res, 200, { items: menuOf(site.id) });
  });

  route('DELETE', '/api/sites/:id/menu/:item', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    if (p.item === 'all') db.run('DELETE FROM menu_items WHERE site_id = ?', site.id);
    else db.run('DELETE FROM menu_items WHERE id = ? AND site_id = ?', p.item, site.id);
    json(res, 200, { items: menuOf(site.id) });
  });

  route('GET', '/api/sites/:id/versions', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    json(res, 200, { versions: db.all('SELECT id, created_at AS createdAt FROM versions WHERE site_id = ? ORDER BY created_at DESC', site.id) });
  });
  route('GET', '/api/sites/:id/versions/:version', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const v = db.get('SELECT draft, created_at AS createdAt FROM versions WHERE id = ? AND site_id = ?', p.version, site.id) || bad(404, 'That version is no longer kept.');
    json(res, 200, { draft: JSON.parse(v.draft), createdAt: v.createdAt });
  });

  // Renames a category everywhere it is used, including its hours and visibility.
  route('POST', '/api/sites/:id/menu/category', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const b = await readJson(req);
    const from = str(b.from, 60).trim(), to = str(b.to, 60).trim();
    if (!from || !to) bad(400, 'Give the category a name.');
    db.run('UPDATE menu_items SET category = ? WHERE site_id = ? AND category = ?', to, site.id, from);
    const o = orderingOf(site);
    o.cats = o.cats.filter((c) => c.name !== to).map((c) => (c.name === from ? { ...c, name: to } : c));
    db.run('UPDATE sites SET ordering = ? WHERE id = ?', JSON.stringify(normalizeOrdering(o)), site.id);
    const saved = db.get('SELECT * FROM sites WHERE id = ?', site.id);
    json(res, 200, { items: menuOf(site.id), ordering: orderingOf(saved), orderingRev: revOf(saved.ordering) });
  });

  route('POST', '/api/push/subscribe', async (req, res) => {
    const user = requireUser(req);
    const sub = (await readJson(req)).subscription || {};
    const endpoint = str(sub.endpoint, 1000), p256dh = str(sub.keys?.p256dh, 200), auth = str(sub.keys?.auth, 100);
    // Only the notification services browsers really use, so this can never be pointed at some other server.
    let pushHost = ''; try { pushHost = new URL(endpoint).hostname; } catch { /* not an address */ }
    if (!/^https:\/\//.test(endpoint) || !PUSH_HOSTS.test(pushHost) || !p256dh || !auth) bad(400, 'This device could not be set up for notifications.');
    db.run('INSERT INTO push_subs (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth', endpoint, user.id, p256dh, auth, Date.now());
    json(res, 201, { ok: true });
  });
  route('POST', '/api/push/unsubscribe', async (req, res) => {
    const user = requireUser(req);
    db.run('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?', str((await readJson(req)).endpoint, 1000), user.id);
    json(res, 200, { ok: true });
  });

  // Change or delete many items at once.
  route('POST', '/api/sites/:id/menu/bulk', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const b = await readJson(req);
    const ids = (Array.isArray(b.ids) ? b.ids : []).slice(0, 1000).map((x) => str(x, 40));
    if (!ids.length) bad(400, 'Select at least one item.');
    const set = b.set && typeof b.set === 'object' ? b.set : {};
    const num = (v, min, max) => Math.max(min, Math.min(max, Math.round(Number(v)) || 0));
    db.raw.exec('BEGIN');
    try {
      for (const itemId of ids) {
        const row = db.get('SELECT * FROM menu_items WHERE id = ? AND site_id = ?', itemId, site.id);
        if (!row) continue;
        if (b.delete === true) { db.run('DELETE FROM menu_items WHERE id = ?', row.id); continue; }
        if (typeof set.taxable === 'boolean') db.run('UPDATE menu_items SET taxable = ? WHERE id = ?', set.taxable ? 1 : 0, row.id);
        if (typeof set.available === 'boolean') db.run('UPDATE menu_items SET available = ? WHERE id = ?', set.available ? 1 : 0, row.id);
        if (set.stock !== undefined) db.run('UPDATE menu_items SET stock = ? WHERE id = ?', num(set.stock, 0, 999999), row.id);
        if (set.addStock !== undefined) db.run('UPDATE menu_items SET stock = MAX(0, MIN(999999, stock + ?)) WHERE id = ?', num(set.addStock, -999999, 999999), row.id);
        if (set.restock !== undefined) db.run('UPDATE menu_items SET restock = ? WHERE id = ?', set.restock === null || set.restock === '' ? null : num(set.restock, 0, 999999), row.id);
        if (typeof set.label === 'string') db.run('UPDATE menu_items SET label = ? WHERE id = ?', str(set.label, 40).trim(), row.id);
        if (typeof set.revclass === 'string') db.run('UPDATE menu_items SET revclass = ? WHERE id = ?', str(set.revclass, 40).trim(), row.id);
        if (typeof set.addMod === 'string' || typeof set.removeMod === 'string') { const cur = (row.mods ? JSON.parse(row.mods) : []).filter((x) => x !== set.removeMod && x !== set.addMod); if (typeof set.addMod === 'string') cur.push(str(set.addMod, 24)); db.run('UPDATE menu_items SET mods = ? WHERE id = ?', JSON.stringify(cur.slice(0, 30)), row.id); }
        if (set.sale !== undefined) db.run('UPDATE menu_items SET sale = ? WHERE id = ?', num(set.sale, 0, 90), row.id);
        if (str(set.category, 60).trim()) db.run('UPDATE menu_items SET category = ? WHERE id = ?', str(set.category, 60).trim(), row.id);
        if (set.pricePercent !== undefined) db.run('UPDATE menu_items SET price = ? WHERE id = ?', Math.max(0, Math.min(100_000_00, Math.round((row.price * (100 + num(set.pricePercent, -90, 500))) / 100))), row.id);
      }
      db.raw.exec('COMMIT');
    } catch (e) { db.raw.exec('ROLLBACK'); throw e; }
    json(res, 200, { items: menuOf(site.id) });
  });

  route('PUT', '/api/sites/:id/menu-order', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const ids = (await readJson(req)).ids;
    if (!Array.isArray(ids)) bad(400, 'Could not read that request.');
    ids.slice(0, 1000).forEach((itemId, i) => db.run('UPDATE menu_items SET sort = ? WHERE id = ? AND site_id = ?', i + 1, str(itemId, 40), site.id));
    json(res, 200, { items: menuOf(site.id) });
  });

  // The sales report. Dates are days in the business's own time zone.
  route('GET', '/api/sites/:id/stats', (req, res, p, url) => {
    const { site } = ownSite(req, p.id);
    const ordering = orderingOf(site);
    const wall = (ms) => wallNow(ordering, ms);
    const dayOf = (ms) => new Date(wall(ms)).toISOString().slice(0, 10);
    const shift = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
    const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
    const today = dayOf(Date.now());
    const range = str(url.searchParams.get('range'), 20) || 'today';
    let from = today, to = today;
    if (range === 'yesterday') from = to = shift(today, -1);
    else if (range === 'week') from = shift(today, -new Date(`${today}T00:00:00Z`).getUTCDay());
    else if (range === 'last7') from = shift(today, -6);
    else if (range === 'month') from = `${today.slice(0, 8)}01`;
    else if (range === 'last30') from = shift(today, -29);
    else if (range === 'custom') {
      const f = url.searchParams.get('from'), t = url.searchParams.get('to');
      if (!isDay(f) || !isDay(t)) bad(400, 'Choose a start and end date.');
      [from, to] = f <= t ? [f, t] : [t, f];
      if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY > 731) bad(400, 'Choose a range of two years or less.');
    }
    const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
    const prevTo = shift(from, -1), prevFrom = shift(from, -days);
    // Fetch a little wider than needed, then keep exactly the days asked for.
    const rows = db.all('SELECT * FROM orders WHERE site_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at', site.id, Date.parse(`${prevFrom}T00:00:00Z`) - 2 * DAY, Date.parse(`${to}T00:00:00Z`) + 3 * DAY).map(toOrder);
    const catOf = Object.fromEntries(db.all('SELECT id, category FROM menu_items WHERE site_id = ?', site.id).map((r) => [r.id, r.category]));
    const blank = () => ({ orders: 0, gross: 0, discounts: 0, net: 0, tax: 0, fees: 0, tips: 0, total: 0, taxable: 0, nontaxable: 0, units: 0 });
    const add = (t, o) => {
      const taxableLines = o.items.reduce((a, l) => a + (l.taxable === false ? 0 : l.price * l.qty), 0);
      const taxable = o.subtotal ? Math.round(taxableLines - (o.discount * taxableLines) / o.subtotal) : 0;
      t.orders++; t.gross += o.subtotal; t.discounts += o.discount; t.net += o.subtotal - o.discount; t.tax += o.tax; t.fees += o.fee; t.tips += o.tip; t.total += o.total;
      t.taxable += taxable; t.nontaxable += o.subtotal - o.discount - taxable; t.units += o.items.reduce((a, l) => a + l.qty, 0);
    };
    const totals = blank(), prev = blank();
    const byHour = days === 1;
    const series = new Map();
    if (byHour) for (let h = 0; h < 24; h++) series.set(String(h).padStart(2, '0'), { key: String(h).padStart(2, '0'), orders: 0, net: 0, tax: 0, tips: 0 });
    else for (let i = 0; i < days; i++) { const d = shift(from, i); series.set(d, { key: d, orders: 0, net: 0, tax: 0, tips: 0 }); }
    const methods = Object.fromEntries(Object.keys(ORDER_METHODS).map((m) => [m, { method: m, orders: 0, net: 0, total: 0 }]));
    const items = new Map(), cats = new Map(), revs = new Map(), list = [], staff = new Map(), tenders = new Map(), promos = new Map(), removed = new Map();
    const bump = (map, key, o) => { const r = map.get(key) || map.set(key, { name: key, orders: 0, net: 0, tips: 0, total: 0 }).get(key); r.orders++; r.net += o.subtotal - o.discount; r.tips += o.tip; r.total += o.total; };
    let cancelled = 0;
    for (const o of rows) {
      const day = dayOf(o.createdAt);
      if (day >= prevFrom && day <= prevTo && o.status !== 'cancelled') add(prev, o);
      if (day < from || day > to) continue;
      const w = new Date(wall(o.createdAt));
      list.push({ number: o.number, date: day, time: `${String(w.getUTCHours()).padStart(2, '0')}:${String(w.getUTCMinutes()).padStart(2, '0')}`, method: o.method, name: o.name, status: o.status, subtotal: o.subtotal, discount: o.discount, promo: o.promo, tax: o.tax, fee: o.fee, tip: o.tip, total: o.total, paid: o.paidAt ? o.paidMethod || 'Other' : '', by: o.handledBy });
      if (o.status === 'cancelled') { cancelled++; for (const l of o.items) { const rm = removed.get(l.name) || removed.set(l.name, { name: l.name, qty: 0, value: 0 }).get(l.name); rm.qty += l.qty; rm.value += l.price * l.qty; } continue; }
      add(totals, o);
      const s1 = series.get(byHour ? String(w.getUTCHours()).padStart(2, '0') : day);
      if (s1) { s1.orders++; s1.net += o.subtotal - o.discount; s1.tax += o.tax; s1.tips += o.tip; }
      bump(staff, o.handledBy || 'Not recorded', o); bump(tenders, o.paidAt ? o.paidMethod || 'Other' : 'Not paid yet', o);
      if (o.discount) { const pk = o.promo || 'Other discount'; const pr = promos.get(pk) || promos.set(pk, { name: pk, uses: 0, amount: 0 }).get(pk); pr.uses++; pr.amount += o.discount; }
      const m = methods[o.method] || (methods[o.method] = { method: o.method, orders: 0, net: 0, total: 0 });
      m.orders++; m.net += o.subtotal - o.discount; m.total += o.total;
      for (const l of o.items) {
        const category = catOf[l.id] || 'No longer on the menu';
        const it = items.get(l.name) || items.set(l.name, { name: l.name, category, qty: 0, sales: 0 }).get(l.name);
        it.qty += l.qty; it.sales += l.price * l.qty;
        const c = cats.get(category) || cats.set(category, { name: category, qty: 0, sales: 0 }).get(category);
        c.qty += l.qty; c.sales += l.price * l.qty;
        const rk = l.rev || 'No revenue class'; const rv = revs.get(rk) || revs.set(rk, { name: rk, qty: 0, sales: 0 }).get(rk); rv.qty += l.qty; rv.sales += l.price * l.qty;
      }
    }
    json(res, 200, {
      range, from, to, today, days, unit: byHour ? 'hour' : 'day', timezone: ordering.timezone, taxRate: ordering.taxRate,
      totals: { ...totals, average: totals.orders ? Math.round(totals.total / totals.orders) : 0, cancelled },
      previous: { from: prevFrom, to: prevTo, orders: prev.orders, net: prev.net, total: prev.total, tax: prev.tax },
      methods: Object.values(methods), series: [...series.values()],
      items: [...items.values()].sort((a, b) => b.qty - a.qty || b.sales - a.sales), categories: [...cats.values()].sort((a, b) => b.sales - a.sales), revenue: [...revs.values()].sort((a, b) => b.sales - a.sales), employees: [...staff.values()].sort((a, b) => b.net - a.net), tenders: [...tenders.values()].sort((a, b) => b.total - a.total), promos: [...promos.values()].sort((a, b) => b.amount - a.amount), removed: [...removed.values()].sort((a, b) => b.value - a.value),
      orders: list.reverse().slice(0, 2000),
    });
  });

  route('PUT', '/api/sites/:id/ordering', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const body = await readJson(req);
    if (body.rev && body.rev !== revOf(site.ordering)) bad(412, STALE);
    const o = normalizeOrdering(body.ordering);
    if (o.enabled && !openMethods(o).length) bad(400, 'Turn on at least one way to order: pickup, curbside or delivery.');
    db.run('UPDATE sites SET ordering = ?, updated_at = ? WHERE id = ?', JSON.stringify(o), Date.now(), site.id);
    json(res, 200, { ordering: o, rev: revOf(JSON.stringify(o)) });
  });

  route('GET', '/api/sites/:id/orders', (req, res, p) => {
    const { site } = ownSite(req, p.id, 'kitchen');
    json(res, 200, { orders: db.all('SELECT * FROM orders WHERE site_id = ? ORDER BY created_at DESC LIMIT 300', site.id).map(toOrder) });
  });

  route('POST', '/api/sites/:id/orders/:order', async (req, res, p) => {
    const { site } = ownSite(req, p.id, 'kitchen');
    const row = db.get('SELECT * FROM orders WHERE id = ? AND site_id = ?', p.order, site.id) || bad(404, 'We could not find that order.');
    const status = str((await readJson(req)).status, 20);
    if (!ORDER_STATUSES[status]) bad(400, 'Unknown status.');
    if (status !== row.status) {
      if (row.status === 'cancelled') bad(400, 'A cancelled order cannot be reopened. Take a new order instead.');
      const who = requireUser(req);
      db.run('UPDATE orders SET status = ?, handled_by = ?, updated_at = ? WHERE id = ?', status, who.name || who.email, Date.now(), row.id);
      if (status === 'cancelled') for (const l of JSON.parse(row.items)) db.run('UPDATE menu_items SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL', l.qty, l.id);
      const order = toOrder({ ...row, status });
      if (['confirmed', 'ready', 'cancelled'].includes(status)) mail(status, req, site, order, order.email);
    }
    json(res, 200, { order: toOrder(db.get('SELECT * FROM orders WHERE id = ?', row.id)) });
  });

  route('POST', '/api/uploads', async (req, res) => {
    const user = requireUser(req);
    if (!uploadDir) bad(503, 'Uploads are not available.');
    limit(`upload:${user.id}`, 120, 3600000);
    const buf = await readBody(req, 8 * 1024 * 1024);
    const ext = sniffImage(buf);
    if (!ext) bad(415, 'Upload a PNG, JPG, WebP, GIF or SVG image.');
    const name = `${newId(12)}${ext}`;
    await fs.writeFile(join(uploadDir, name), buf);
    json(res, 201, { url: `/u/${name}` });
  });

  /* Staff tools */
  const requireAdmin = (req) => { const u = requireUser(req); if (!u.admin) bad(403, 'This area is for Processor Freedom staff.'); return u; };

  route('GET', '/api/admin', (req, res) => {
    requireAdmin(req);
    const n = (sql, ...a) => db.get(sql, ...a).n || 0;
    const day = Date.now() - DAY;
    const sites = db.all('SELECT s.*, u.email AS owner, (SELECT COUNT(*) FROM leads l WHERE l.site_id = s.id) AS leads, (SELECT COUNT(*) FROM orders o WHERE o.site_id = s.id) AS orders FROM sites s JOIN users u ON u.id = s.user_id ORDER BY s.updated_at DESC LIMIT 500');
    const requests = db.all("SELECT r.id, r.desired, r.note, r.status, r.created_at AS createdAt, r.site_id AS siteId, s.name AS siteName, u.email AS owner FROM domain_requests r JOIN sites s ON s.id = r.site_id JOIN users u ON u.id = r.user_id WHERE r.status != 'replaced' ORDER BY r.status = 'open' DESC, r.created_at DESC LIMIT 200");
    json(res, 200, {
      stats: {
        users: n('SELECT COUNT(*) AS n FROM users'), newUsers: n('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', Date.now() - 7 * DAY),
        sites: n('SELECT COUNT(*) AS n FROM sites'), live: n('SELECT COUNT(*) AS n FROM sites WHERE published IS NOT NULL'), leads: n('SELECT COUNT(*) AS n FROM leads'),
        orders: n('SELECT COUNT(*) AS n FROM orders'), ordersToday: n('SELECT COUNT(*) AS n FROM orders WHERE created_at > ?', day),
        sales7: n("SELECT SUM(total) AS n FROM orders WHERE status != 'cancelled' AND created_at > ?", Date.now() - 7 * DAY), sales30: n("SELECT SUM(total) AS n FROM orders WHERE status != 'cancelled' AND created_at > ?", Date.now() - 30 * DAY),
        sales: n("SELECT SUM(total) AS n FROM orders WHERE status != 'cancelled'"), salesToday: n("SELECT SUM(total) AS n FROM orders WHERE status != 'cancelled' AND created_at > ?", day),
        items: n('SELECT COUNT(*) AS n FROM menu_items'), orderingSites: sites.filter((s) => orderingOf(s).enabled).length,
      },
      sites: sites.map((s) => ({ ...present(req, s), owner: s.owner, leads: s.leads, orders: s.orders, items: n('SELECT COUNT(*) AS n FROM menu_items WHERE site_id = ?', s.id),
        sales30: n("SELECT SUM(total) AS n FROM orders WHERE site_id = ? AND status != 'cancelled' AND created_at > ?", s.id, Date.now() - 30 * DAY), lastOrderAt: n('SELECT MAX(created_at) AS n FROM orders WHERE site_id = ?', s.id) })),
      orders: db.all('SELECT o.number, o.name, o.method, o.status, o.total, o.created_at AS createdAt, s.name AS siteName FROM orders o JOIN sites s ON s.id = o.site_id ORDER BY o.created_at DESC LIMIT 50'),
      users: db.all('SELECT u.id, u.name, u.email, u.created_at AS createdAt, (SELECT COUNT(*) FROM sites s WHERE s.user_id = u.id) AS sites FROM users u ORDER BY u.created_at DESC LIMIT 500'),
      requests,
    });
  });

  // For when a merchant is locked out: staff create a one-time link and pass it on.
  route('POST', '/api/admin/users/:id/reset-link', (req, res, p) => {
    requireAdmin(req);
    const target = db.get('SELECT id FROM users WHERE id = ?', p.id) || bad(404, 'That account no longer exists.');
    json(res, 200, { link: resetLinkFor(req, target.id) });
  });

  // Removes an account and everything it owns: sites, menus, orders and messages.
  route('DELETE', '/api/admin/users/:id', (req, res, p) => {
    const me = requireAdmin(req);
    const target = db.get('SELECT id, email FROM users WHERE id = ?', p.id) || bad(404, 'That account no longer exists.');
    if (target.id === me.id) bad(400, 'You cannot delete the account you are signed in with.');
    if (ADMINS.has(target.email)) bad(400, 'Staff accounts cannot be deleted here.');
    db.run('DELETE FROM users WHERE id = ?', target.id);
    json(res, 200, { ok: true });
  });

  // Staff register a domain for the customer, then attach it here. It goes live immediately.
  route('POST', '/api/admin/sites/:id/domain', async (req, res, p) => {
    requireAdmin(req);
    const site = db.get('SELECT * FROM sites WHERE id = ?', p.id) || bad(404, 'We could not find that site.');
    const b = await readJson(req);
    const domain = cleanDomain(b.domain).replace(/^www\./, '');
    if (!domain) bad(400, 'Enter a domain like yourbusiness.com.');
    if (db.get('SELECT 1 FROM sites WHERE custom_domain = ? AND id != ?', domain, site.id)) bad(409, 'That domain is already connected to another site.');
    db.run('UPDATE sites SET custom_domain = ?, domain_verified = 1, updated_at = ? WHERE id = ?', domain, Date.now(), site.id);
    db.run("UPDATE domain_requests SET status = 'done' WHERE site_id = ? AND status = 'open'", site.id);
    await attachToHost(domain);
    json(res, 200, { ok: true });
  });

  route('POST', '/api/admin/requests/:id', async (req, res, p) => {
    requireAdmin(req);
    const status = (await readJson(req)).status === 'done' ? 'done' : 'open';
    db.run('UPDATE domain_requests SET status = ? WHERE id = ?', status, p.id);
    json(res, 200, { ok: true });
  });

  /* ---------- published sites ---------- */

  const simplePage = (title, text) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif;background:#fff;color:#1d1d1f;text-align:center;padding:24px;-webkit-font-smoothing:antialiased}h1{font-size:40px;letter-spacing:-.025em;margin:0 0 10px;font-weight:600}p{color:#6e6e73;font-size:19px;margin:0}@media(prefers-color-scheme:dark){body{background:#000;color:#f5f5f7}p{color:#a1a1a6}}</style></head><body><div><h1>${esc(title)}</h1><p>${esc(text)}</p></div></body></html>`;

  async function serveSite(req, res, site, base, sub, origin, draft = false) {
    const config = site && JSON.parse(draft ? site.draft : site.published || 'null');
    if (!config) return html(res, 404, simplePage('Coming soon', 'This website has not been published yet.'));
    const path = sub.replace(/\/+$/, '') || '/';
    const home = `${origin}${base}/`;

    if (path === '/_forms/contact' && req.method === 'POST' && !draft) {
      limit(`form:${site.id}:${ipOf(req)}`, 6, 10 * 60000); limit(`form:${site.id}`, 60, 10 * 60000);
      const raw = await readBody(req, 20_000);
      const isJson = String(req.headers['content-type'] || '').includes('json');
      let b = {};
      try { b = isJson ? JSON.parse(raw.toString('utf8')) : Object.fromEntries(new URLSearchParams(raw.toString('utf8'))); } catch { bad(400, 'Could not read that message.'); }
      const lead = { name: str(b.name, 120).trim(), email: str(b.email, 200).trim(), phone: str(b.phone, 40).trim(), message: str(b.message, 4000).trim() };
      const spam = str(b.company_website).trim() !== '';
      if (!spam) {
        if (!lead.name || !lead.message || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) bad(400, 'Please add your name, a valid email and a message.');
        db.run('INSERT INTO leads (id, site_id, name, email, phone, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), site.id, lead.name, lead.email, lead.phone, lead.message, Date.now());
      }
      return isJson ? json(res, 200, { ok: true }) : redirect(res, `${base}/?sent=1#contact`, 303);
    }
    const ordering = orderingOf(site);
    if (path === '/_book' && req.method === 'POST' && !draft) {
      limit(`book:${site.id}:${ipOf(req)}`, 8, 10 * 60000); limit(`book:${site.id}`, 80, 10 * 60000);
      if (!ordering.booking.enabled) bad(409, 'Online booking is not available right now. Please call us.');
      const appt = makeAppt(site, ordering, await readJson(req, 20_000), true);
      const business = businessOf(site), owner = db.get('SELECT email FROM users WHERE id = ?', site.user_id);
      const send = (to, kind) => Promise.resolve().then(() => mailer.send({ to, ...bookingEmail(kind, { business, appt, when: apptWhen(appt.at), manageUrl: `${appOrigin(req)}/app/site/${site.id}?tab=appts` }), fromName: business.name, replyTo: kind === 'merchant' ? appt.email : business.email })).catch((e) => console.error('Booking email failed:', e.message));
      send(appt.email, 'request'); send(ordering.notifyEmail || business.email || owner?.email, 'merchant');
      notifySite(site, { title: 'New booking request', body: `${site.name} · ${appt.name} · ${apptWhen(appt.at)}`, url: `/app/site/${site.id}?tab=appts`, tag: `appt-${appt.id}` });
      return json(res, 201, { ok: true });
    }
    if (path === '/_promo' && req.method === 'GET' && !draft) {
      limit(`promo:${site.id}:${ipOf(req)}`, 20, 10 * 60000); limit(`promo:${site.id}`, 300, 10 * 60000);
      const promo = ordering.enabled && promoFor(site, ordering, new URL(req.url, 'http://x').searchParams.get('code'));
      return promo ? json(res, 200, { code: promo.code, type: promo.type, value: promo.value }) : json(res, 404, { error: 'That code is not valid.' });
    }
    if (path === '/_order' && req.method === 'POST' && !draft) {
      limit(`order:${site.id}:${ipOf(req)}`, 12, 10 * 60000); limit(`order:${site.id}`, 200, 10 * 60000);
      const b = await readJson(req, 50_000);
      if (!ordering.enabled || !ordering.accepting) bad(409, 'Online ordering is paused right now. Please call us to order.');
      const method = str(b.method, 20);
      if (!ordering.methods[method]) bad(400, 'Choose how you would like to receive your order.');
      const scheduled = str(b.when, 20);
      if (scheduled) { if (!orderSlots(ordering, method, undefined, takenSlots(site.id)).includes(scheduled)) bad(409, 'That time is no longer available. Please choose another.'); }
      else if (!isOpenNow(ordering)) bad(409, ordering.scheduling ? 'We are closed right now. Please choose a time for your order.' : 'We are closed right now. Please order during our opening hours.');
      const who = { name: str(b.name, 120).trim(), phone: str(b.phone, 40).trim(), email: str(b.email, 200).trim(), address: method === 'delivery' ? str(b.address, 300).trim() : '', vehicle: method === 'curbside' ? str(b.vehicle, 120).trim() : '', notes: ordering.allowNotes ? str(b.notes, 500).trim() : '' };
      if (!who.name || who.phone.replace(/\D/g, '').length < 7 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(who.email)) bad(400, 'Please add your name, phone number and a valid email address.');
      if (method === 'delivery' && !who.address) bad(400, 'Please add your delivery address.');
      if (method === 'curbside' && !who.vehicle) bad(400, 'Please describe your vehicle so we can find you.');
      const wanted = (Array.isArray(b.items) ? b.items.slice(0, 100) : []).map((l) => ({ id: str(l?.id, 40), qty: Math.round(Number(l?.qty)), picks: Array.isArray(l?.opts) ? l.opts.slice(0, 12).map((g) => (Array.isArray(g) ? g.slice(0, 30).map(Number) : [])) : [] })).filter((l) => l.qty > 0 && l.qty <= 50);
      if (!wanted.length) bad(400, 'Your order is empty.');
      const promo = str(b.promo).trim() ? promoFor(site, ordering, b.promo) || bad(400, 'That promo code is not valid.') : null;
      const zone = method === 'delivery' && ordering.zones.length ? zoneFor(ordering, b.zip) || bad(400, 'Sorry, we do not deliver to that ZIP code.') : null;
      if (zone) who.address = `${who.address} ${(String(b.zip).match(/\d{5}/) || [''])[0]}`.trim();
      let order;
      db.raw.exec('BEGIN IMMEDIATE');
      try {
        // Checked again here, inside the transaction, so two orders cannot take the last place.
        if (!scheduled && busyNow(site.id, ordering)) bad(409, ordering.scheduling ? 'We have as many orders as we can make right now. Please choose a later time.' : 'We have as many orders as we can make right now. Please try again in a few minutes.');
        if (scheduled && ordering.slotLimit > 0 && (takenSlots(site.id)[scheduled] || 0) >= ordering.slotLimit) bad(409, 'That time just filled up. Please choose another.');
        const lines = []; const need = new Map(); const before = new Map();
        for (const w of wanted) {
          const row = db.get('SELECT * FROM menu_items WHERE id = ? AND site_id = ?', w.id, site.id);
          if (!row || !row.available || row.stock === 0 || !visibleMenu([toItem(row)], ordering).length) bad(409, `${row ? row.name : 'One of your items'} is no longer available. Please remove it and try again.`);
          const it = applyMods(pricedMenu([toItem(row)], ordering), ordering)[0];
          before.set(it.id, { name: it.name, stock: it.stock });
          const picked = resolveOptions(it, w.picks);
          if (picked.error) bad(400, picked.error);
          need.set(it.id, (need.get(it.id) || 0) + w.qty);
          if (it.stock != null && it.stock < need.get(it.id)) bad(409, `Only ${it.stock} of ${it.name} left. Please lower the quantity and try again.`);
          lines.push({ id: it.id, name: it.name, price: picked.price, qty: w.qty, opts: picked.labels, picks: w.picks, taxable: it.taxable, label: it.label, rev: it.revclass });
        }
        const t = orderTotals(lines, method, ordering, [0, 10, 15, 20].includes(Number(b.tip)) ? Number(b.tip) : 0, promo, zone ? zone.fee : null);
        if (method === 'delivery' && t.subtotal < ordering.deliveryMin) bad(400, 'Your order is below the delivery minimum.');
        for (const [itemId, qty] of need) db.run('UPDATE menu_items SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL', qty, itemId);
        const number = (db.get('SELECT MAX(number) AS n FROM orders WHERE site_id = ?', site.id).n || 1000) + 1;
        const oid = newId(); const now = Date.now();
        db.run('INSERT INTO orders (id, site_id, number, token, method, name, email, phone, address, vehicle, notes, items, subtotal, discount, promo, scheduled, tax, fee, tip, total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          oid, site.id, number, newId(18), method, who.name, who.email, who.phone, who.address, who.vehicle, who.notes, JSON.stringify(lines), t.subtotal, t.discount, promo ? promo.code : '', scheduled, t.tax, t.fee, t.tip, t.total, now, now);
        if (promo?.gift) db.run('UPDATE gift_cards SET balance = MAX(0, balance - ?) WHERE site_id = ? AND code = ?', t.discount, site.id, promo.code);
        if (promo?.reward) db.run('UPDATE rewards SET used_order = ? WHERE site_id = ? AND code = ? AND used_order IS NULL', oid, site.id, promo.code);
        // Every Nth order earns a one-time reward code for next time.
        const L = ordering.loyalty;
        if (L.enabled) {
          const count = db.get("SELECT COUNT(*) AS n FROM orders WHERE site_id = ? AND lower(email) = lower(?) AND status != 'cancelled'", site.id, who.email).n;
          if (count > 0 && count % L.every === 0) db.run('INSERT INTO rewards (code, site_id, email, type, value, earned_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', `THANKS${randomBytes(4).toString('hex').toUpperCase()}`, site.id, who.email.toLowerCase(), L.type, L.value, oid, now);
        }
        db.raw.exec('COMMIT');
        order = toOrder(db.get('SELECT * FROM orders WHERE id = ?', oid));
        order.low = [...need].map(([itemId, qty]) => ({ name: before.get(itemId).name, was: before.get(itemId).stock, stock: Math.max(0, before.get(itemId).stock - qty) })).filter((x) => x.was > ordering.lowStockAt && x.stock <= ordering.lowStockAt);
      } catch (e) { db.raw.exec('ROLLBACK'); throw e; }
      mail('placed', req, site, order, order.email);
      const owner = db.get('SELECT email FROM users WHERE id = ?', site.user_id);
      mail('merchant', req, site, order, ordering.notifyEmail || businessOf(site).email || owner?.email);
      notifySite(site, { title: `New order #${order.number} · ${money(order.total)}`, body: `${site.name} · ${ORDER_METHODS[method].name} · ${order.name}`, url: `/app/site/${site.id}?tab=orders`, tag: `order-${order.id}` });
      if (order.low.length) {
        const text = order.low.map((x) => (x.stock === 0 ? `${x.name} is sold out` : `${x.name}: ${x.stock} left`)).join(' · ');
        notifySite(site, { title: order.low.some((x) => x.stock === 0) ? 'Sold out' : 'Running low', body: `${site.name} · ${text}`, url: `/app/site/${site.id}?tab=items`, tag: `stock-${site.id}` });
        const msg = lowStockEmail({ business: businessOf(site), items: order.low, manageUrl: `${appOrigin(req)}/app/site/${site.id}?tab=items` });
        Promise.resolve().then(() => mailer.send({ to: ordering.notifyEmail || businessOf(site).email || owner?.email, ...msg })).catch((e) => console.error('Low stock email failed:', e.message));
      }
      return json(res, 201, { number: order.number, url: `${base}/order/${order.token}` });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });

    const shared = { base, ordering, menu: ordering.enabled || config.sections?.some((x) => x.type === 'menu') ? applyMods(pricedMenu(visibleMenu(menuOf(site.id), ordering), ordering), ordering) : [], siteKey: site.id, taken: ordering.slotLimit ? takenSlots(site.id) : null, busy: busyNow(site.id, ordering) };
    const tracked = path.match(/^\/order\/([\w-]{10,40})$/);
    if (tracked) {
      const row = db.get('SELECT * FROM orders WHERE token = ? AND site_id = ?', tracked[1], site.id);
      let loyalty;
      if (row && ordering.loyalty.enabled) {
        const count = db.get("SELECT COUNT(*) AS n FROM orders WHERE site_id = ? AND lower(email) = lower(?) AND status != 'cancelled' AND created_at <= ?", site.id, row.email, row.created_at).n;
        const earned = db.get('SELECT code, type, value FROM rewards WHERE site_id = ? AND earned_order = ? AND used_order IS NULL', site.id, row.id);
        loyalty = { every: ordering.loyalty.every, have: earned ? ordering.loyalty.every : count % ordering.loyalty.every, code: earned?.code, value: earned ? rewardText(earned) : '' };
      }
      const out = renderPage(config, row ? 'order-status' : 'missing', { ...shared, order: row && toOrder(row), loyalty });
      return html(res, out.status, out.html, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    }

    const billed = path.match(/^\/invoice\/([\w-]{10,40})$/);
    if (billed) {
      const row = db.get('SELECT * FROM invoices WHERE token = ? AND site_id = ?', billed[1], site.id);
      // The first time the customer opens it is worth knowing; the merchant's own looks are not counted.
      if (row && row.status === 'sent' && !row.viewed_at && req.method === 'GET' && !draft && !currentUser(req)) db.run('UPDATE invoices SET viewed_at = ? WHERE id = ?', Date.now(), row.id);
      const out = renderPage(config, row ? 'invoice' : 'missing', { ...shared, invoice: row && toInvoice(row) });
      return html(res, out.status, out.html, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    }

    const pages = ['', ...(ordering.enabled ? ['order'] : []), ...(ordering.booking.enabled && ordering.booking.services.length ? ['book'] : []), ...Object.keys(LEGAL_PAGES).filter((k) => config.legal?.[k]?.enabled !== false)];
    // Lets customers add the shop to their Home Screen under its own name.
    if (path === '/manifest.webmanifest') {
      const name = str(config.brand?.name || site.name, 60), logo = str(config.brand?.logo);
      const kind = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[(logo.match(/^\/u\/[\w.-]+\.(png|jpg|webp)$/) || [])[1]];
      return send(res, 200, JSON.stringify({ name, short_name: name.slice(0, 12), start_url: `${base}/${ordering.enabled ? 'order' : ''}`, scope: `${base}/`, display: 'standalone', background_color: '#ffffff', theme_color: '#ffffff', icons: kind ? [{ src: logo, sizes: '512x512', type: kind, purpose: 'any' }] : [] }), { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=300' });
    }
    if (path === '/robots.txt') return send(res, 200, draft ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${home}sitemap.xml\n`, { 'Content-Type': 'text/plain; charset=utf-8' });
    if (path === '/sitemap.xml') {
      const mod = new Date(site.published_at || site.updated_at).toISOString().slice(0, 10);
      return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((pg) => `  <url><loc>${esc(home + pg)}</loc><lastmod>${mod}</lastmod></url>`).join('\n')}\n</urlset>\n`, { 'Content-Type': 'application/xml; charset=utf-8' });
    }
    const page = path === '/' ? 'home' : path.slice(1);
    const sent = new URL(req.url, 'http://x').searchParams.get('sent') === '1';
    const out = renderPage(config, page, { ...shared, url: page === 'home' ? home : `${home}${page}`, sent, booked: new URL(req.url, 'http://x').searchParams.get('done') === '1', today: new Date(wallNow(ordering)).toISOString().slice(0, 10) });
    return html(res, out.status, out.html, { 'Cache-Control': draft || shared.menu.length ? 'no-store' : 'public, max-age=60', ...(draft ? { 'X-Robots-Tag': 'noindex' } : {}) });
  }

  function siteForHost(host) {
    const h = host.split(':')[0];
    if (!h || h === APP_HOST.split(':')[0]) return undefined;
    if (SITES_DOMAIN && h.endsWith(`.${SITES_DOMAIN}`)) {
      const sub = h.slice(0, -(SITES_DOMAIN.length + 1));
      return sub === 'www' ? undefined : db.get('SELECT * FROM sites WHERE slug = ?', sub) || null;
    }
    if (h === SITES_DOMAIN) return undefined;
    return db.get('SELECT * FROM sites WHERE custom_domain = ? AND domain_verified = 1', h.replace(/^www\./, '')) || undefined;
  }

  /* ---------- static files ---------- */

  async function sendFile(res, dir, rel, headers = {}) {
    const full = resolvePath(dir, `.${sep}${rel}`);
    if (!full.startsWith(resolvePath(dir) + sep)) return false;
    try {
      const buf = await fs.readFile(full);
      const type = MIME[extname(full).toLowerCase()] || 'application/octet-stream';
      // Phones ask for video a piece at a time; answer with just the piece they asked for.
      const range = /^bytes=(\d*)-(\d*)$/.exec(String(res.req.headers.range || ''));
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, buf.length - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), buf.length - 1) : buf.length - 1;
        if (!(start <= end) || start >= buf.length) { send(res, 416, '', { 'Content-Range': `bytes */${buf.length}` }); return true; }
        send(res, 206, buf.subarray(start, end + 1), { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${buf.length}`, ...headers });
        return true;
      }
      send(res, 200, buf, { 'Content-Type': type, 'Accept-Ranges': 'bytes', ...headers });
      return true;
    } catch { return false; }
  }

  /* ---------- request handler ---------- */

  let shell;
  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const path = decodeURIComponent(url.pathname);
    const method = req.method;

    // Uploaded images are served on every host so published sites can use them.
    if (path.startsWith('/u/') && uploadDir && (method === 'GET' || method === 'HEAD')) {
      const ok = /^\/u\/[\w.-]+$/.test(path) && await sendFile(res, uploadDir, path.slice(3), { 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
      return ok || send(res, 404, 'Not found');
    }

    const hosted = siteForHost(hostOf(req));
    if (hosted !== undefined) {
      if (hosted === null) return html(res, 404, simplePage('Nothing here yet', 'There is no website at this address.'));
      return serveSite(req, res, hosted, '', path, `${protoOf(req)}://${hostOf(req)}`);
    }

    let m;
    if ((m = path.match(/^\/s\/([a-z0-9-]+)(\/.*)?$/))) {
      if (!m[2]) return redirect(res, `/s/${m[1]}/`, 301);
      const site = db.get('SELECT * FROM sites WHERE slug = ?', m[1]);
      if (!site) return html(res, 404, simplePage('Nothing here yet', 'There is no website at this address.'));
      return serveSite(req, res, site, `/s/${m[1]}`, m[2], appOrigin(req));
    }
    if ((m = path.match(/^\/preview\/([\w-]+)(\/.*)?$/))) {
      if (!m[2]) return redirect(res, `/preview/${m[1]}/`, 302);
      const user = currentUser(req);
      const site = user && db.get('SELECT * FROM sites WHERE id = ?', m[1]);
      if (!site || !(LEVEL[roleOn(site, user)] >= LEVEL.manager)) return redirect(res, '/login');
      return serveSite(req, res, site, `/preview/${m[1]}`, m[2], appOrigin(req), true);
    }

    if (path.startsWith('/api/')) {
      if (method !== 'GET' && method !== 'HEAD') {
        // Browsers always send Origin on cross-site writes; refuse any that do not match us.
        const origin = req.headers.origin;
        if (origin && origin.replace(/^https?:\/\//, '').toLowerCase() !== hostOf(req)) bad(403, 'That request was blocked.');
      }
      for (const r of routes) {
        const hit = r.method === method && path.match(r.re);
        if (hit) return r.fn(req, res, hit.groups || {}, url);
      }
      bad(404, 'Not found.');
    }

    if (method !== 'GET' && method !== 'HEAD') return send(res, 405, 'Method not allowed');
    if (path === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
    if (path === '/favicon.ico') return (await sendFile(res, join(ROOT, 'public'), 'icon-32.png', { 'Cache-Control': 'public, max-age=86400' })) || send(res, 404, '');
    if (path === '/sw.js') return (await sendFile(res, join(ROOT, 'public'), 'sw.js', { 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' })) || send(res, 404, 'Not found');
    if (path === '/manifest.webmanifest') return (await sendFile(res, join(ROOT, 'public'), 'manifest.webmanifest', { 'Cache-Control': 'no-cache', 'Content-Type': 'application/manifest+json' })) || send(res, 404, 'Not found');
    const cache = { 'Cache-Control': 'no-cache' };
    if (path.startsWith('/assets/demo/')) return (await sendFile(res, join(ROOT, 'public'), path.slice(8), { 'Cache-Control': 'public, max-age=604800' })) || send(res, 404, 'Not found');
    if (path.startsWith('/assets/')) return (await sendFile(res, join(ROOT, 'public'), path.slice(8), cache)) || send(res, 404, 'Not found');
    if (path.startsWith('/shared/')) return (await sendFile(res, join(ROOT, 'shared'), path.slice(8), cache)) || send(res, 404, 'Not found');
    if (path === '/robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /app\nDisallow: /api\nDisallow: /preview\n', { 'Content-Type': 'text/plain' });
    if (path === '/' || /^\/(login|signup|forgot|reset|app(\/.*)?)$/.test(path)) {
      // Link previews need absolute image addresses, so the shell is filled in per request.
      shell ??= await fs.readFile(join(ROOT, 'public', 'index.html'), 'utf8');
      return html(res, 200, shell.replaceAll('__ORIGIN__', esc(appOrigin(req))), { ...cache, 'Content-Security-Policy': APP_CSP, 'Permissions-Policy': 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)' });
    }
    return html(res, 404, simplePage('Page not found', `This page does not exist on ${PLATFORM} Sites.`));
  }

  const handler = (req, res) => {
    res.req = req;
    handle(req, res).catch((err) => {
      const status = err instanceof HttpError ? err.status : err instanceof URIError ? 400 : 500;
      if (status === 500) console.error(err);
      if (res.headersSent) return res.end();
      const message = status === 500 ? 'Something went wrong on our side. Please try again.' : err.message || 'Bad request';
      const wantsJson = req.url.startsWith('/api/') || String(req.headers.accept || '').includes('json') || String(req.headers['content-type'] || '').includes('json');
      wantsJson ? json(res, status, { error: message }) : html(res, status, simplePage(status === 429 ? 'Slow down' : 'Something went wrong', message));
    });
  };
  handler.db = db;
  handler.tick = tick;
  handler.backup = backup;
  handler.close = () => { clearInterval(sweep); clearInterval(daily); db.close(); };
  return handler;
}
