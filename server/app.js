import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { promises as fs, mkdirSync } from 'node:fs';
import { promises as dnsp } from 'node:dns';
import { join, extname, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, newId } from './db.js';
import { createSite, normalizeSite, slugify, cleanSlug, slugProblem, slugSuggestions, cleanDomain, str, esc, safeImg, LEGAL_PAGES, PLATFORM, parseMenuCsv, parsePrice, normalizeOrdering, defaultOrdering, openMethods, orderTotals, ORDER_METHODS, ORDER_STATUSES } from '../shared/core.js';
import { createMailer, orderEmail } from './mail.js';
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
  const toItem = (r) => ({ id: r.id, category: r.category, name: r.name, price: r.price, desc: r.description, image: r.image, available: !!r.available, stock: r.stock });
  const menuOf = (siteId) => db.all('SELECT * FROM menu_items WHERE site_id = ? ORDER BY sort, rowid', siteId).map(toItem);
  const toOrder = (r) => ({ id: r.id, number: r.number, token: r.token, status: r.status, method: r.method, name: r.name, email: r.email, phone: r.phone, address: r.address, vehicle: r.vehicle, notes: r.notes, items: JSON.parse(r.items), subtotal: r.subtotal, tax: r.tax, fee: r.fee, tip: r.tip, total: r.total, createdAt: r.created_at });
  function cleanItem(b, prev = {}) {
    const price = typeof b.price === 'number' ? Math.round(b.price) : b.price === undefined ? prev.price : parsePrice(b.price);
    const name = str(b.name ?? prev.name, 120).trim();
    if (!name) bad(400, 'Give the item a name.');
    if (price == null || !(price >= 0) || price > 100_000_00) bad(400, 'Enter a price like 9.99.');
    const stock = b.stock === undefined ? prev.stock ?? null : b.stock === null || b.stock === '' ? null : Math.max(0, Math.min(999999, Math.round(Number(b.stock)) || 0));
    return { category: str(b.category ?? prev.category, 60).trim() || 'Menu', name, price, description: str(b.desc ?? prev.description, 500).trim(), image: safeImg(b.image ?? prev.image), available: (b.available ?? prev.available ?? 1) ? 1 : 0, stock };
  }
  function insertItems(siteId, items) {
    let sort = (db.get('SELECT MAX(sort) AS m FROM menu_items WHERE site_id = ?', siteId).m || 0) + 1;
    for (const it of items) db.run('INSERT INTO menu_items (id, site_id, category, name, price, description, image, available, stock, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', newId(), siteId, it.category, it.name, it.price, it.description ?? it.desc ?? '', safeImg(it.image), it.available === false || it.available === 0 ? 0 : 1, it.stock ?? null, sort++);
  }
  function businessOf(site) {
    const c = JSON.parse(site.published || site.draft);
    const b = c.business || {};
    return { name: c.brand?.name || site.name, phone: str(b.phone), email: str(b.email), address: [b.address1, b.city, b.state].filter(Boolean).join(', ') };
  }
  function mail(kind, req, site, order, to) {
    const business = businessOf(site);
    const msg = orderEmail(kind, { business, order, statusUrl: `${siteUrl(req, site).replace(/\/$/, '')}/order/${order.token}`, manageUrl: `${appOrigin(req)}/app/site/${site.id}?tab=orders`, eta: order.method === 'delivery' ? orderingOf(site).deliveryMinutes : orderingOf(site).prepMinutes });
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
    sitesDomain: SITES_DOMAIN, addressPrefix: SITES_DOMAIN ? '' : `${hostOf(req)}/s/`, addressSuffix: SITES_DOMAIN ? `.${SITES_DOMAIN}` : '', cnameTarget: cnameTarget(req), emailEnabled: !!mailer.enabled,
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
      insertItems(site.id, parsed.items.slice(0, room));
      db.raw.exec('COMMIT');
    } catch (e) { db.raw.exec('ROLLBACK'); throw e; }
    json(res, 200, { imported: Math.min(room, parsed.items.length), skipped: parsed.errors, items: menuOf(site.id) });
  });

  route('PUT', '/api/sites/:id/menu/:item', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const prev = db.get('SELECT * FROM menu_items WHERE id = ? AND site_id = ?', p.item, site.id) || bad(404, 'That item no longer exists.');
    const it = cleanItem(await readJson(req), prev);
    db.run('UPDATE menu_items SET category = ?, name = ?, price = ?, description = ?, image = ?, available = ?, stock = ? WHERE id = ?', it.category, it.name, it.price, it.description, it.image, it.available, it.stock, prev.id);
    json(res, 200, { items: menuOf(site.id) });
  });

  route('DELETE', '/api/sites/:id/menu/:item', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    if (p.item === 'all') db.run('DELETE FROM menu_items WHERE site_id = ?', site.id);
    else db.run('DELETE FROM menu_items WHERE id = ? AND site_id = ?', p.item, site.id);
    json(res, 200, { items: menuOf(site.id) });
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
    const sites = db.all('SELECT s.*, u.email AS owner, (SELECT COUNT(*) FROM leads l WHERE l.site_id = s.id) AS leads FROM sites s JOIN users u ON u.id = s.user_id ORDER BY s.updated_at DESC LIMIT 500');
    const requests = db.all("SELECT r.id, r.desired, r.note, r.status, r.created_at AS createdAt, r.site_id AS siteId, s.name AS siteName, u.email AS owner FROM domain_requests r JOIN sites s ON s.id = r.site_id JOIN users u ON u.id = r.user_id WHERE r.status != 'replaced' ORDER BY r.status = 'open' DESC, r.created_at DESC LIMIT 200");
    json(res, 200, {
      stats: { users: db.get('SELECT COUNT(*) AS n FROM users').n, sites: db.get('SELECT COUNT(*) AS n FROM sites').n, live: db.get('SELECT COUNT(*) AS n FROM sites WHERE published IS NOT NULL').n, leads: db.get('SELECT COUNT(*) AS n FROM leads').n },
      sites: sites.map((s) => ({ ...present(req, s), owner: s.owner, leads: s.leads })),
      requests,
    });
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
    if (path === '/_order' && req.method === 'POST' && !draft) {
      limit(`order:${site.id}:${ipOf(req)}`, 12, 10 * 60000);
      const b = await readJson(req, 50_000);
      if (!ordering.enabled || !ordering.accepting) bad(409, 'Online ordering is paused right now. Please call us to order.');
      const method = str(b.method, 20);
      if (!ordering.methods[method]) bad(400, 'Choose how you would like to receive your order.');
      const who = { name: str(b.name, 120).trim(), phone: str(b.phone, 40).trim(), email: str(b.email, 200).trim(), address: method === 'delivery' ? str(b.address, 300).trim() : '', vehicle: method === 'curbside' ? str(b.vehicle, 120).trim() : '', notes: ordering.allowNotes ? str(b.notes, 500).trim() : '' };
      if (!who.name || who.phone.replace(/\D/g, '').length < 7 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(who.email)) bad(400, 'Please add your name, phone number and a valid email address.');
      if (method === 'delivery' && !who.address) bad(400, 'Please add your delivery address.');
      if (method === 'curbside' && !who.vehicle) bad(400, 'Please describe your vehicle so we can find you.');
      const want = new Map();
      for (const l of Array.isArray(b.items) ? b.items.slice(0, 100) : []) { const q = Math.round(Number(l?.qty)); if (q > 0 && q <= 50) want.set(str(l.id, 40), (want.get(str(l.id, 40)) || 0) + q); }
      if (!want.size) bad(400, 'Your order is empty.');
      let order;
      db.raw.exec('BEGIN IMMEDIATE');
      try {
        const lines = [];
        for (const [itemId, qty] of want) {
          const it = db.get('SELECT * FROM menu_items WHERE id = ? AND site_id = ?', itemId, site.id);
          if (!it || !it.available || it.stock === 0) bad(409, `${it ? it.name : 'One of your items'} is no longer available. Please remove it and try again.`);
          if (it.stock != null && it.stock < qty) bad(409, `Only ${it.stock} of ${it.name} left. Please lower the quantity and try again.`);
          lines.push({ id: it.id, name: it.name, price: it.price, qty });
        }
        const t = orderTotals(lines, method, ordering, [0, 10, 15, 20].includes(Number(b.tip)) ? Number(b.tip) : 0);
        if (method === 'delivery' && t.subtotal < ordering.deliveryMin) bad(400, 'Your order is below the delivery minimum.');
        for (const l of lines) db.run('UPDATE menu_items SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL', l.qty, l.id);
        const number = (db.get('SELECT MAX(number) AS n FROM orders WHERE site_id = ?', site.id).n || 1000) + 1;
        const oid = newId(); const now = Date.now();
        db.run('INSERT INTO orders (id, site_id, number, token, method, name, email, phone, address, vehicle, notes, items, subtotal, tax, fee, tip, total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          oid, site.id, number, newId(18), method, who.name, who.email, who.phone, who.address, who.vehicle, who.notes, JSON.stringify(lines), t.subtotal, t.tax, t.fee, t.tip, t.total, now, now);
        db.raw.exec('COMMIT');
        order = toOrder(db.get('SELECT * FROM orders WHERE id = ?', oid));
      } catch (e) { db.raw.exec('ROLLBACK'); throw e; }
      mail('placed', req, site, order, order.email);
      const owner = db.get('SELECT email FROM users WHERE id = ?', site.user_id);
      mail('merchant', req, site, order, ordering.notifyEmail || businessOf(site).email || owner?.email);
      return json(res, 201, { number: order.number, url: `${base}/order/${order.token}` });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });

    const shared = { base, ordering, menu: ordering.enabled || config.sections?.some((x) => x.type === 'menu') ? menuOf(site.id) : [], siteKey: site.id };
    const tracked = path.match(/^\/order\/([\w-]{10,40})$/);
    if (tracked) {
      const row = db.get('SELECT * FROM orders WHERE token = ? AND site_id = ?', tracked[1], site.id);
      const out = renderPage(config, row ? 'order-status' : 'missing', { ...shared, order: row && toOrder(row) });
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
    const cache = { 'Cache-Control': 'no-cache' };
    if (path.startsWith('/assets/')) return (await sendFile(res, join(ROOT, 'public'), path.slice(8), cache)) || send(res, 404, 'Not found');
    if (path.startsWith('/shared/')) return (await sendFile(res, join(ROOT, 'shared'), path.slice(8), cache)) || send(res, 404, 'Not found');
    if (path === '/robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /app\nDisallow: /api\nDisallow: /preview\n', { 'Content-Type': 'text/plain' });
    if (path === '/' || /^\/(login|signup|app(\/.*)?)$/.test(path)) {
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
