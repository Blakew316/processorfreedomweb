import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { promises as fs, mkdirSync } from 'node:fs';
import { promises as dnsp } from 'node:dns';
import { join, extname, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, newId } from './db.js';
import { createSite, normalizeSite, slugify, cleanSlug, slugProblem, slugSuggestions, cleanDomain, str, esc, safeImg, LEGAL_PAGES, PLATFORM, parseMenuCsv, parsePrice, normalizeOrdering, defaultOrdering, openMethods, orderTotals, ORDER_METHODS, ORDER_STATUSES, cleanOptions, resolveOptions, findPromo, isOpenNow, orderSlots, slotLabel, money, visibleMenu, zoneFor, rewardText, DEFAULT_STOCK } from '../shared/core.js';
import { createMailer, orderEmail, resetEmail } from './mail.js';
import { newVapidKeys, sendPush } from './push.js';
import { renderPage } from '../shared/render.js';

const scryptAsync = promisify(scrypt);
const ROOT = resolvePath(fileURLToPath(new URL('..', import.meta.url)));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.json': 'application/json' };
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
  // Notification keys are made once and kept with the data, so there is nothing to configure.
  const vapid = (() => {
    const saved = db.get("SELECT value FROM settings WHERE key = 'vapid'");
    if (saved) return JSON.parse(saved.value);
    const made = newVapidKeys();
    db.run("INSERT INTO settings (key, value) VALUES ('vapid', ?)", JSON.stringify(made));
    return made;
  })();
  function notifyOwner(userId, message) {
    for (const sub of db.all('SELECT * FROM push_subs WHERE user_id = ?', userId)) {
      Promise.resolve().then(() => pusher(sub, message, vapid)).then((r) => { if (r === 'gone') db.run('DELETE FROM push_subs WHERE endpoint = ?', sub.endpoint); }).catch((e) => console.error('Push failed:', e.message));
    }
  }

  const SITES_DOMAIN = cleanDomain(env.SITES_DOMAIN || '');
  const APP_URL = String(env.APP_URL || '').replace(/\/$/, '');
  const APP_HOST = APP_URL.replace(/^https?:\/\//, '').toLowerCase();
  const ADMINS = new Set(String(env.ADMIN_EMAILS || '').toLowerCase().split(/[\s,]+/).filter(Boolean));

  /* ---------- small helpers ---------- */

  const hits = new Map();
  function limit(key, max, windowMs) {
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || rec.until < now) { hits.set(key, { n: 1, until: now + windowMs }); return; }
    if (++rec.n > max) bad(429, 'Too many attempts. Please wait a few minutes and try again.');
  }
  const sweep = setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.until < now) hits.delete(k); db.run('DELETE FROM sessions WHERE expires_at < ?', now); }, 10 * 60000);
  sweep.unref();

  const ipOf = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
  const protoOf = (req) => (String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' ? 'https' : 'http');
  const hostOf = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim().toLowerCase();
  const appOrigin = (req) => APP_URL || `${protoOf(req)}://${hostOf(req)}`;
  const cnameTarget = (req) => cleanDomain(env.CNAME_TARGET || '') || APP_HOST || SITES_DOMAIN || hostOf(req).split(':')[0];

  function send(res, status, body, headers = {}) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''));
    res.writeHead(status, { 'Content-Length': buf.length, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN', ...headers });
    res.end(res.req.method === 'HEAD' ? undefined : buf);
  }
  const json = (res, status, data, headers) => send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  const html = (res, status, body, headers) => send(res, status, body, { 'Content-Type': MIME['.html'], ...headers });
  const redirect = (res, to, status = 302) => send(res, status, '', { Location: to });

  function readBody(req, max) {
    return new Promise((ok, fail) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > max) { fail(new HttpError(413, 'That is too large to upload.')); req.destroy(); } else chunks.push(c);
      });
      req.on('end', () => ok(Buffer.concat(chunks)));
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
    const u = db.get('SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?', sha(token), Date.now());
    return u ? { ...u, admin: ADMINS.has(u.email) } : null;
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
  function present(req, s, full = false) {
    const out = {
      id: s.id, slug: s.slug, name: s.name, url: siteUrl(req, s), address: addressFor(req, s.slug),
      live: !!s.published, publishedAt: s.published_at, updatedAt: s.updated_at, createdAt: s.created_at,
      dirty: !!s.published && s.published !== s.draft,
      customDomain: s.custom_domain || '', domainVerified: !!s.domain_verified,
    };
    out.ordering = orderingOf(s);
    if (full) out.draft = JSON.parse(s.draft);
    return out;
  }
  const orderingOf = (s) => normalizeOrdering(s.ordering ? JSON.parse(s.ordering) : defaultOrdering());
  const toItem = (r) => ({ id: r.id, category: r.category, name: r.name, price: r.price, desc: r.description, image: r.image, available: !!r.available, stock: r.stock ?? 0, taxable: r.taxable !== 0, sale: r.sale || 0, options: r.options ? cleanOptions(JSON.parse(r.options)) : [] });
  const menuOf = (siteId) => db.all('SELECT * FROM menu_items WHERE site_id = ? ORDER BY sort, rowid', siteId).map(toItem);
  const toOrder = (r) => ({ id: r.id, number: r.number, token: r.token, status: r.status, method: r.method, name: r.name, email: r.email, phone: r.phone, address: r.address, vehicle: r.vehicle, notes: r.notes, items: JSON.parse(r.items), subtotal: r.subtotal, discount: r.discount || 0, promo: r.promo || '', scheduled: r.scheduled || '', tax: r.tax, fee: r.fee, tip: r.tip, total: r.total, createdAt: r.created_at });
  function cleanItem(b, prev = {}) {
    const price = typeof b.price === 'number' ? Math.round(b.price) : b.price === undefined ? prev.price : parsePrice(b.price);
    const name = str(b.name ?? prev.name, 120).trim();
    if (!name) bad(400, 'Give the item a name.');
    if (price == null || !(price >= 0) || price > 100_000_00) bad(400, 'Enter a price like 9.99.');
    const stock = b.stock === undefined || b.stock === null || b.stock === '' ? prev.stock ?? DEFAULT_STOCK : Math.max(0, Math.min(999999, Math.round(Number(b.stock)) || 0));
    const sale = b.sale === undefined ? prev.sale || 0 : Math.max(0, Math.min(90, Math.round(Number(b.sale)) || 0));
    return { category: str(b.category ?? prev.category, 60).trim() || 'Menu', name, price, description: str(b.desc ?? prev.description, 500).trim(), image: safeImg(b.image ?? prev.image), available: (b.available ?? prev.available ?? 1) ? 1 : 0, taxable: (b.taxable ?? prev.taxable ?? 1) ? 1 : 0, stock, sale, options: JSON.stringify(cleanOptions(b.options ?? (prev.options ? JSON.parse(prev.options) : []))) };
  }
  function insertItems(siteId, items, startStock = DEFAULT_STOCK) {
    let sort = (db.get('SELECT MAX(sort) AS m FROM menu_items WHERE site_id = ?', siteId).m || 0) + 1;
    for (const it of items) db.run('INSERT INTO menu_items (id, site_id, category, name, price, description, image, available, taxable, sale, stock, options, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', newId(), siteId, it.category, it.name, it.price, it.description ?? it.desc ?? '', safeImg(it.image), it.available === false || it.available === 0 ? 0 : 1, it.taxable === false || it.taxable === 0 ? 0 : 1, it.sale || 0, it.stock ?? startStock, typeof it.options === 'string' ? it.options : JSON.stringify(cleanOptions(it.options)), sort++);
  }
  // A promo code is either one the merchant created or an unused loyalty reward.
  function promoFor(site, ordering, code) {
    const mine = findPromo(ordering, code);
    if (mine) return mine;
    const c = str(code, 24).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const r = c && db.get('SELECT code, type, value FROM rewards WHERE site_id = ? AND code = ? AND used_order IS NULL', site.id, c);
    return r ? { ...r, reward: true } : null;
  }
  function businessOf(site) {
    const c = JSON.parse(site.published || site.draft);
    const b = c.business || {};
    return { name: c.brand?.name || site.name, phone: str(b.phone), email: str(b.email), address: [b.address1, b.city, b.state].filter(Boolean).join(', ') };
  }
  function mail(kind, req, site, order, to) {
    const business = businessOf(site);
    const when = order.scheduled ? slotLabel(order.scheduled, orderingOf(site)) : '';
    const lang = kind === 'merchant' ? 'en' : JSON.parse(site.published || site.draft).lang === 'es' ? 'es' : 'en';
    const msg = orderEmail(kind, { business, order, when, lang, statusUrl: `${siteUrl(req, site).replace(/\/$/, '')}/order/${order.token}`, manageUrl: `${appOrigin(req)}/app/site/${site.id}?tab=orders`, eta: order.method === 'delivery' ? orderingOf(site).deliveryMinutes : orderingOf(site).prepMinutes });
    Promise.resolve().then(() => mailer.send({ to, ...msg, fromName: business.name, replyTo: kind === 'merchant' ? order.email : business.email })).catch((e) => console.error('Order email failed:', e.message));
  }

  function ownSite(req, id) {
    const user = requireUser(req);
    const site = db.get('SELECT * FROM sites WHERE id = ?', id);
    if (!site || (site.user_id !== user.id && !user.admin)) bad(404, 'We could not find that site.');
    return { user, site };
  }
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
    sitesDomain: SITES_DOMAIN, addressPrefix: SITES_DOMAIN ? '' : `${hostOf(req)}/s/`, addressSuffix: SITES_DOMAIN ? `.${SITES_DOMAIN}` : '', cnameTarget: cnameTarget(req), emailEnabled: !!mailer.enabled, pushKey: vapid.publicKey,
  }));

  route('GET', '/api/me', (req, res) => json(res, 200, { user: currentUser(req) }));

  route('POST', '/api/auth/signup', async (req, res) => {
    limit(`signup:${ipOf(req)}`, 10, 3600000);
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
    json(res, 201, { user: { id, email, name, admin: ADMINS.has(email) } });
  });

  route('POST', '/api/auth/login', async (req, res) => {
    limit(`login:${ipOf(req)}`, 12, 15 * 60000);
    const b = await readJson(req);
    const email = str(b.email, 200).trim().toLowerCase();
    const u = db.get('SELECT * FROM users WHERE email = ?', email);
    const ok = await checkPassword(str(b.password, 200), u ? u.pass_hash : '00:00');
    if (!u || !ok) bad(401, 'That email and password do not match.');
    startSession(req, res, u.id);
    json(res, 200, { user: { id: u.id, email: u.email, name: u.name, admin: ADMINS.has(u.email) } });
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

  function resetLinkFor(req, userId) {
    const token = randomBytes(32).toString('base64url');
    db.run('DELETE FROM resets WHERE user_id = ?', userId);
    db.run('INSERT INTO resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha(token), userId, Date.now() + 2 * 3600000);
    return `${appOrigin(req)}/reset?token=${token}`;
  }
  route('POST', '/api/auth/forgot', async (req, res) => {
    limit(`forgot:${ipOf(req)}`, 6, 3600000);
    const email = str((await readJson(req)).email, 200).trim().toLowerCase();
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
    db.run('UPDATE users SET pass_hash = ? WHERE id = ?', await hashPassword(str(b.password, 200)), row.user_id);
    db.run('DELETE FROM resets WHERE user_id = ?', row.user_id);
    db.run('DELETE FROM sessions WHERE user_id = ?', row.user_id);
    startSession(req, res, row.user_id);
    const u = db.get('SELECT id, email, name FROM users WHERE id = ?', row.user_id);
    json(res, 200, { user: { ...u, admin: ADMINS.has(u.email) } });
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
    const rows = db.all('SELECT s.*, (SELECT COUNT(*) FROM leads l WHERE l.site_id = s.id) AS leads FROM sites s WHERE user_id = ? ORDER BY updated_at DESC', user.id);
    json(res, 200, { sites: rows.map((s) => ({ ...present(req, s, true), leads: s.leads, menu: menuOf(s.id).slice(0, 12), newOrders: db.get("SELECT COUNT(*) AS n FROM orders WHERE site_id = ? AND status = 'new'", s.id).n })) });
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

  route('GET', '/api/sites/:id', (req, res, p) => json(res, 200, { site: present(req, ownSite(req, p.id).site, true) }));

  route('PUT', '/api/sites/:id', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const b = await readJson(req);
    const draft = packDraft(b.draft);
    db.run('UPDATE sites SET draft = ?, name = ?, updated_at = ? WHERE id = ?', draft, JSON.parse(draft).brand.name, Date.now(), site.id);
    json(res, 200, { site: present(req, db.get('SELECT * FROM sites WHERE id = ?', site.id)) });
  });

  route('DELETE', '/api/sites/:id', (req, res, p) => {
    const { site } = ownSite(req, p.id);
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
    if (db.get('SELECT 1 FROM sites WHERE custom_domain = ? AND id != ?', domain, site.id)) bad(409, 'That domain is already connected to another site.');
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
  route('GET', '/api/sites/:id/menu', (req, res, p) => json(res, 200, { items: menuOf(ownSite(req, p.id).site.id) }));

  route('POST', '/api/sites/:id/menu', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    if (db.get('SELECT COUNT(*) AS n FROM menu_items WHERE site_id = ?', site.id).n >= 1000) bad(400, 'A menu can hold up to 1,000 items.');
    insertItems(site.id, [cleanItem(await readJson(req))]);
    json(res, 201, { items: menuOf(site.id) });
  });

  route('POST', '/api/sites/:id/menu/import', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const b = await readJson(req, 1_500_000);
    const parsed = parseMenuCsv(str(b.csv, 1_000_000));
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
    db.run('UPDATE menu_items SET category = ?, name = ?, price = ?, description = ?, image = ?, available = ?, taxable = ?, sale = ?, stock = ?, options = ? WHERE id = ?', it.category, it.name, it.price, it.description, it.image, it.available, it.taxable, it.sale, it.stock, it.options, prev.id);
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
    json(res, 200, { items: menuOf(site.id), ordering: orderingOf(db.get('SELECT * FROM sites WHERE id = ?', site.id)) });
  });

  route('POST', '/api/push/subscribe', async (req, res) => {
    const user = requireUser(req);
    const sub = (await readJson(req)).subscription || {};
    const endpoint = str(sub.endpoint, 1000), p256dh = str(sub.keys?.p256dh, 200), auth = str(sub.keys?.auth, 100);
    if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) bad(400, 'This device could not be set up for notifications.');
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

  route('GET', '/api/sites/:id/stats', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const since = Date.now() - 30 * DAY;
    const rows = db.all("SELECT * FROM orders WHERE site_id = ? AND status != 'cancelled' AND created_at > ? ORDER BY created_at", site.id, since).map(toOrder);
    const tz = orderingOf(site).timezone;
    const dayOf = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    const days = {}; const items = {}; const methods = {};
    for (let i = 29; i >= 0; i--) days[dayOf(Date.now() - i * DAY)] = { orders: 0, sales: 0 };
    for (const o of rows) {
      const d = days[dayOf(o.createdAt)]; if (d) { d.orders++; d.sales += o.total; }
      methods[o.method] = (methods[o.method] || 0) + 1;
      for (const l of o.items) { items[l.name] ||= { name: l.name, qty: 0, sales: 0 }; items[l.name].qty += l.qty; items[l.name].sales += l.price * l.qty; }
    }
    const sales = rows.reduce((a, o) => a + o.total, 0);
    json(res, 200, { orders: rows.length, sales, average: rows.length ? Math.round(sales / rows.length) : 0, tips: rows.reduce((a, o) => a + o.tip, 0), days: Object.entries(days).map(([date, v]) => ({ date, ...v })), top: Object.values(items).sort((a, b) => b.qty - a.qty).slice(0, 8), methods });
  });

  route('PUT', '/api/sites/:id/ordering', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const o = normalizeOrdering((await readJson(req)).ordering);
    if (o.enabled && !openMethods(o).length) bad(400, 'Turn on at least one way to order: pickup, curbside or delivery.');
    db.run('UPDATE sites SET ordering = ?, updated_at = ? WHERE id = ?', JSON.stringify(o), Date.now(), site.id);
    json(res, 200, { ordering: o });
  });

  route('GET', '/api/sites/:id/orders', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    json(res, 200, { orders: db.all('SELECT * FROM orders WHERE site_id = ? ORDER BY created_at DESC LIMIT 300', site.id).map(toOrder) });
  });

  route('POST', '/api/sites/:id/orders/:order', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const row = db.get('SELECT * FROM orders WHERE id = ? AND site_id = ?', p.order, site.id) || bad(404, 'We could not find that order.');
    const status = str((await readJson(req)).status, 20);
    if (!ORDER_STATUSES[status]) bad(400, 'Unknown status.');
    if (status !== row.status) {
      db.run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', status, Date.now(), row.id);
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
        sales: n("SELECT SUM(total) AS n FROM orders WHERE status != 'cancelled'"), salesToday: n("SELECT SUM(total) AS n FROM orders WHERE status != 'cancelled' AND created_at > ?", day),
        items: n('SELECT COUNT(*) AS n FROM menu_items'), orderingSites: sites.filter((s) => orderingOf(s).enabled).length,
      },
      sites: sites.map((s) => ({ ...present(req, s), owner: s.owner, leads: s.leads, orders: s.orders })),
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
      limit(`form:${site.id}:${ipOf(req)}`, 6, 10 * 60000);
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
    if (path === '/_promo' && req.method === 'GET' && !draft) {
      limit(`promo:${site.id}:${ipOf(req)}`, 20, 10 * 60000);
      const promo = ordering.enabled && promoFor(site, ordering, new URL(req.url, 'http://x').searchParams.get('code'));
      return promo ? json(res, 200, { code: promo.code, type: promo.type, value: promo.value }) : json(res, 404, { error: 'That code is not valid.' });
    }
    if (path === '/_order' && req.method === 'POST' && !draft) {
      limit(`order:${site.id}:${ipOf(req)}`, 12, 10 * 60000);
      const b = await readJson(req, 50_000);
      if (!ordering.enabled || !ordering.accepting) bad(409, 'Online ordering is paused right now. Please call us to order.');
      const method = str(b.method, 20);
      if (!ordering.methods[method]) bad(400, 'Choose how you would like to receive your order.');
      const scheduled = str(b.when, 20);
      if (scheduled) { if (!orderSlots(ordering, method).includes(scheduled)) bad(409, 'That time is no longer available. Please choose another.'); }
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
        const lines = []; const need = new Map();
        for (const w of wanted) {
          const row = db.get('SELECT * FROM menu_items WHERE id = ? AND site_id = ?', w.id, site.id);
          if (!row || !row.available || row.stock === 0 || !visibleMenu([toItem(row)], ordering).length) bad(409, `${row ? row.name : 'One of your items'} is no longer available. Please remove it and try again.`);
          const it = toItem(row);
          const picked = resolveOptions(it, w.picks);
          if (picked.error) bad(400, picked.error);
          need.set(it.id, (need.get(it.id) || 0) + w.qty);
          if (it.stock != null && it.stock < need.get(it.id)) bad(409, `Only ${it.stock} of ${it.name} left. Please lower the quantity and try again.`);
          lines.push({ id: it.id, name: it.name, price: picked.price, qty: w.qty, opts: picked.labels, picks: w.picks, taxable: it.taxable });
        }
        const t = orderTotals(lines, method, ordering, [0, 10, 15, 20].includes(Number(b.tip)) ? Number(b.tip) : 0, promo, zone ? zone.fee : null);
        if (method === 'delivery' && t.subtotal < ordering.deliveryMin) bad(400, 'Your order is below the delivery minimum.');
        for (const [itemId, qty] of need) db.run('UPDATE menu_items SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL', qty, itemId);
        const number = (db.get('SELECT MAX(number) AS n FROM orders WHERE site_id = ?', site.id).n || 1000) + 1;
        const oid = newId(); const now = Date.now();
        db.run('INSERT INTO orders (id, site_id, number, token, method, name, email, phone, address, vehicle, notes, items, subtotal, discount, promo, scheduled, tax, fee, tip, total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          oid, site.id, number, newId(18), method, who.name, who.email, who.phone, who.address, who.vehicle, who.notes, JSON.stringify(lines), t.subtotal, t.discount, promo ? promo.code : '', scheduled, t.tax, t.fee, t.tip, t.total, now, now);
        if (promo?.reward) db.run('UPDATE rewards SET used_order = ? WHERE site_id = ? AND code = ? AND used_order IS NULL', oid, site.id, promo.code);
        // Every Nth order earns a one-time reward code for next time.
        const L = ordering.loyalty;
        if (L.enabled) {
          const count = db.get("SELECT COUNT(*) AS n FROM orders WHERE site_id = ? AND lower(email) = lower(?) AND status != 'cancelled'", site.id, who.email).n;
          if (count > 0 && count % L.every === 0) db.run('INSERT INTO rewards (code, site_id, email, type, value, earned_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', `THANKS${randomBytes(4).toString('hex').toUpperCase()}`, site.id, who.email.toLowerCase(), L.type, L.value, oid, now);
        }
        db.raw.exec('COMMIT');
        order = toOrder(db.get('SELECT * FROM orders WHERE id = ?', oid));
      } catch (e) { db.raw.exec('ROLLBACK'); throw e; }
      mail('placed', req, site, order, order.email);
      const owner = db.get('SELECT email FROM users WHERE id = ?', site.user_id);
      mail('merchant', req, site, order, ordering.notifyEmail || businessOf(site).email || owner?.email);
      notifyOwner(site.user_id, { title: `New order #${order.number} · ${money(order.total)}`, body: `${site.name} · ${ORDER_METHODS[method].name} · ${order.name}`, url: `/app/site/${site.id}?tab=orders`, tag: `order-${order.id}` });
      return json(res, 201, { number: order.number, url: `${base}/order/${order.token}` });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });

    const shared = { base, ordering, menu: ordering.enabled || config.sections?.some((x) => x.type === 'menu') ? visibleMenu(menuOf(site.id), ordering) : [], siteKey: site.id };
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

    const pages = ['', ...(ordering.enabled ? ['order'] : []), ...Object.keys(LEGAL_PAGES).filter((k) => config.legal?.[k]?.enabled !== false)];
    if (path === '/robots.txt') return send(res, 200, draft ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${home}sitemap.xml\n`, { 'Content-Type': 'text/plain; charset=utf-8' });
    if (path === '/sitemap.xml') {
      const mod = new Date(site.published_at || site.updated_at).toISOString().slice(0, 10);
      return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((pg) => `  <url><loc>${esc(home + pg)}</loc><lastmod>${mod}</lastmod></url>`).join('\n')}\n</urlset>\n`, { 'Content-Type': 'application/xml; charset=utf-8' });
    }
    const page = path === '/' ? 'home' : path.slice(1);
    const sent = new URL(req.url, 'http://x').searchParams.get('sent') === '1';
    const out = renderPage(config, page, { ...shared, url: page === 'home' ? home : `${home}${page}`, sent });
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
      send(res, 200, buf, { 'Content-Type': MIME[extname(full).toLowerCase()] || 'application/octet-stream', ...headers });
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
      if (!site || (site.user_id !== user.id && !user.admin)) return redirect(res, '/login');
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
    if (path === '/sw.js') return (await sendFile(res, join(ROOT, 'public'), 'sw.js', { 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' })) || send(res, 404, 'Not found');
    if (path === '/manifest.webmanifest') return (await sendFile(res, join(ROOT, 'public'), 'manifest.webmanifest', { 'Cache-Control': 'no-cache', 'Content-Type': 'application/manifest+json' })) || send(res, 404, 'Not found');
    const cache = { 'Cache-Control': 'no-cache' };
    if (path.startsWith('/assets/')) return (await sendFile(res, join(ROOT, 'public'), path.slice(8), cache)) || send(res, 404, 'Not found');
    if (path.startsWith('/shared/')) return (await sendFile(res, join(ROOT, 'shared'), path.slice(8), cache)) || send(res, 404, 'Not found');
    if (path === '/robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /app\nDisallow: /api\nDisallow: /preview\n', { 'Content-Type': 'text/plain' });
    if (path === '/' || /^\/(login|signup|forgot|reset|app(\/.*)?)$/.test(path)) {
      // Link previews need absolute image addresses, so the shell is filled in per request.
      shell ??= await fs.readFile(join(ROOT, 'public', 'index.html'), 'utf8');
      return html(res, 200, shell.replaceAll('__ORIGIN__', esc(appOrigin(req))), cache);
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
  handler.close = () => { clearInterval(sweep); db.close(); };
  return handler;
}
