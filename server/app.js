import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { promises as fs, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { promises as dnsp } from 'node:dns';
import { join, extname, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, newId } from './db.js';
import { createSite, normalizeSite, slugify, cleanSlug, slugProblem, slugSuggestions, cleanDomain, str, esc, safeImg, LEGAL_PAGES, PLATFORM, parseMenuCsv, parsePrice, normalizeOrdering, defaultOrdering, openMethods, orderTotals, ORDER_METHODS, ORDER_STATUSES, cleanOptions, resolveOptions, findPromo, isOpenNow, orderSlots, slotLabel, money, visibleMenu, zoneFor, rewardText, DEFAULT_STOCK, wallNow, openAtWall, pricedMenu, invoiceTotals, safeUrl, applyMods, itemPrice, hoursText } from '../shared/core.js';
import { inSpanish } from './es.js';
import { createMailer, orderEmail, resetEmail, summaryEmail, lowStockEmail, inviteEmail, invoiceEmail, giftEmail, bookingEmail, nameChangeEmail, noticeEmail, rewardEmail } from './mail.js';
import { scanMenu, scanEnabled } from './scan.js';
import { newVapidKeys, sendPush } from './push.js';
import { renderPage } from '../shared/render.js';

const scryptAsync = promisify(scrypt);
const ROOT = resolvePath(fileURLToPath(new URL('..', import.meta.url)));
const MIME = { '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.json': 'application/json' };
const DAY = 86400000;
const SESSION_DAYS = 30;
const IDLE_MS = 16 * 60000;   // no requests for this long ends a session (the app warns at 14 and logs out at 15 minutes)
const MAX_SITES = 25;

class HttpError extends Error {
  // code: a short word the page can act on, such as 'prices' when an order's total changed.
  constructor(status, message, code) { super(message); this.status = status; if (code) this.code = code; }
}
const bad = (status, message) => { throw new HttpError(status, message); };
const sha = (s) => createHash('sha256').update(s).digest('hex');

/* Two-step sign-in: the six-digit codes an authenticator app shows (the standard 30-second kind). */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const toB32 = (buf) => { let bits = '', out = ''; for (const x of buf) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; };
const fromB32 = (s) => { let bits = ''; for (const c of String(s).toUpperCase()) { const v = B32.indexOf(c); if (v >= 0) bits += v.toString(2).padStart(5, '0'); } const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(bytes); };
export function totpCode(secret, at = Date.now(), shift = 0) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(Math.floor(at / 30000) + shift));
  const h = createHmac('sha1', fromB32(secret)).update(buf).digest(), o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const recoveryNorm = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const recoveryHash = (userId, code) => createHash('sha256').update(`recovery:${userId}:${recoveryNorm(code)}`).digest('hex');
export function newRecoveryCodes(n = 10) {
  return Array.from({ length: n }, () => { const b = randomBytes(10); const c = [...b].map((x) => RECOVERY_ALPHABET[x % RECOVERY_ALPHABET.length]).join(''); return `${c.slice(0, 5)}-${c.slice(5)}`; });
}
// The 30-second step a code belongs to (the one before, now or the one after, to allow for a phone clock a little off), or -1.
export function ipKey(ip) {
  let a = String(ip || '').trim().toLowerCase().slice(0, 100);
  if (a.startsWith('[')) a = a.slice(1).split(']')[0];
  const v4 = a.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) return v4[1];
  if (!a.includes(':')) return a.slice(0, 64);
  a = a.split('%')[0];
  const [head, tail, extra] = a.split('::');
  if (extra !== undefined) return a.slice(0, 64);
  const h = head ? head.split(':') : [], t = tail === undefined ? null : tail ? tail.split(':') : [];
  const parts = t === null ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  if (parts.length !== 8 || !parts.every((x) => /^[0-9a-f]{1,4}$/.test(x))) return a.slice(0, 64);
  return `${parts.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}
const totpStep = (secret, code) => {
  if (!/^\d{6}$/.test(String(code)) || !secret) return -1;
  const at = Date.now(), base = Math.floor(at / 30000);
  let hit = -1;
  for (const sft of [-1, 0, 1]) if (timingSafeEqual(Buffer.from(totpCode(secret, at, sft)), Buffer.from(String(code)))) hit = base + sft;
  return hit;
};

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

// Attachments on invoices and projects: PDF, PNG or JPG only.
function sniffFile(buf) {
  if (buf.length > 5 && buf.toString('latin1', 0, 5) === '%PDF-') return '.pdf';
  const ext = sniffImage(buf);
  return ext === '.png' || ext === '.jpg' ? ext : '';
}

export function createApp(options = {}) {
  const env = options.env || process.env;
  const BUILD = String(env.RENDER_GIT_COMMIT || Date.now()).slice(0, 12);
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
  // A secret made once and kept with the data. Domain proofs are derived from it, so they need nothing stored per claim.
  const SECRET = (() => {
    const saved = db.get("SELECT value FROM settings WHERE key = 'secret'");
    if (saved) return saved.value;
    const made = randomBytes(32).toString('hex');
    db.run("INSERT INTO settings (key, value) VALUES ('secret', ?)", made);
    return made;
  })();
  // What a site must publish in a TXT record to prove it controls a domain. The same site and domain always get the same value.
  const domainProof = (siteId, domain) => `pf-verify=${createHmac('sha256', SECRET).update(`${siteId}:${domain}`).digest('base64url').slice(0, 32)}`;

  // The owner and everyone on the site's team hear about it.
  // A few at a time, each started on its own turn of the event loop, so signing and encrypting never holds up other requests.
  // A device that keeps failing is dropped, not only one the push service says is gone.
  function notifySite(site, message) {
    const subs = db.all('SELECT * FROM push_subs WHERE user_id = ? OR user_id IN (SELECT user_id FROM members WHERE site_id = ?) LIMIT 300', site.user_id, site.id);
    let i = 0;
    const next = () => {
      const sub = subs[i++];
      if (!sub) return;
      setImmediate(() => Promise.resolve().then(() => pusher(sub, message, vapid))
        .then((r) => { if (r === 'gone') db.run('DELETE FROM push_subs WHERE endpoint = ?', sub.endpoint); else if (sub.fails) db.run('UPDATE push_subs SET fails = 0 WHERE endpoint = ?', sub.endpoint); })
        .catch((e) => { console.error('Push failed:', e.message); db.run('UPDATE push_subs SET fails = fails + 1 WHERE endpoint = ?', sub.endpoint); db.run('DELETE FROM push_subs WHERE endpoint = ? AND fails >= 5', sub.endpoint); })
        .finally(next));
    };
    for (let k = 0; k < 4; k++) next();
  }

  const SITES_DOMAIN = cleanDomain(env.SITES_DOMAIN || '');
  const APP_URL = String(env.APP_URL || '').replace(/\/$/, '');
  const APP_HOST = APP_URL.replace(/^https?:\/\//, '').toLowerCase();
  const ADMINS = new Set(String(env.ADMIN_EMAILS || '').toLowerCase().split(/[\s,]+/).filter(Boolean));
  // Staff powers need more than the right email: the address must be confirmed, by opening a link that was sent to it.
  const isAdmin = (u) => !!u && ADMINS.has(u.email) && !!u.verified;
  // Links that go out by email always point at our own address, never at whatever address the request claimed.
  const FIXED_ORIGIN = APP_URL || String(env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  if (mailer.enabled && !FIXED_ORIGIN) throw new Error('Email is switched on, so set APP_URL to this service\'s public address (for example https://sites.example.com). Emailed links are built from it, never from the address a request names.');
  // The service's own addresses. None of them can be claimed as a merchant's domain or answered with a merchant's site.
  const OWN_HOSTS = [...new Set([APP_HOST, FIXED_ORIGIN.replace(/^https?:\/\//, ''), env.RENDER_EXTERNAL_HOSTNAME, env.CNAME_TARGET, SITES_DOMAIN]
    .map((x) => cleanDomain(String(x || '')).replace(/^www\./, '')).filter(Boolean))];
  const ownHost = (host) => { const h = String(host || '').split(':')[0].toLowerCase().replace(/^www\./, ''); return !!h && OWN_HOSTS.some((o) => h === o || h.endsWith(`.${o}`)); };

  const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

  // What the app itself may load and talk to: its own files, the two libraries it uses, and nothing else. It cannot be framed by another site or post a form elsewhere.
  const APP_CSP = ["default-src 'self'", "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self' data:", "connect-src 'self'", "frame-src 'self' https:", "worker-src 'self'", "manifest-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'"].join('; ');

  const BOOT_HEAD = '<link rel="preload" as="image" href="/assets/demo/hero.jpg" fetchpriority="high"><style>.boot{position:fixed;inset:0;display:grid;align-content:end;justify-items:center;padding:0 20px 38vh;background:#0b1220 url(/assets/demo/hero.jpg) center/cover no-repeat;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif}.boot::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,12,28,.42),rgba(6,12,28,.05) 30%,rgba(6,12,28,.55))}.boot h1{position:relative;margin:0;text-align:center;font-size:clamp(38px,5.3vw,78px);font-weight:600;letter-spacing:-.045em;line-height:1.05}.boot em{font-family:"Instrument Serif",Georgia,serif;font-weight:400;letter-spacing:-.015em}</style>';
  const BOOT_BODY = '<div class="boot"><h1>Your business, <em>beautifully online.</em></h1></div>';

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
  // Email a business sends to other people (gift cards, booking updates, team invites) is capped per hour, so a login can never be
  // used to send mail in bulk from the platform's address. Returns false when the cap is reached; the action itself still happens.
  const mailOk = (site) => { const k = `mail:${site.id}`; if (counted(k) >= 150) return false; bump(k, 3600000); return true; };
  // Counts one more without refusing, and reads a count, for limits that only count failures.
  const bump = (key, windowMs) => { const now = Date.now(), rec = hits.get(key); if (!rec || rec.until < now) hits.set(key, { n: 1, until: now + windowMs }); else rec.n++; };
  const counted = (key) => { const rec = hits.get(key); return rec && rec.until >= Date.now() ? rec.n : 0; };
  const sweep = setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.until < now) hits.delete(k); db.run('DELETE FROM sessions WHERE expires_at < ? OR (seen_at > 0 AND seen_at < ?)', now, now - IDLE_MS); db.run('DELETE FROM user_ips WHERE at < ?', now - 90 * DAY); }, 10 * 60000);
  sweep.unref();

  // Who is asking, for the attempt limits. A visitor can type any address into these headers, so they are only believed
  // when a known proxy in front sets them itself:
  //  - Render: its Cloudflare edge sets CF-Connecting-IP (read exactly as before).
  //  - TRUST_PROXY=cloudflare: Cloudflare is in front of your own server; CF-Connecting-IP is used.
  //  - TRUST_PROXY=1 (or yes/true/on), or a number of proxies such as 2: each proxy adds the address it saw to the end of
  //    X-Forwarded-For, so the entry that many places from the end is the visitor. CF-Connecting-IP is not believed there,
  //    because other proxies pass a visitor's own copy straight through.
  // Anything else: the connecting address, whatever the headers say.
  const ON_RENDER = !!(env.RENDER || env.RENDER_EXTERNAL_URL || env.RENDER_SERVICE_ID || env.RENDER_GIT_COMMIT);
  const TRUST = String(env.TRUST_PROXY || '').trim().toLowerCase();
  const TRUST_CF = !ON_RENDER && TRUST === 'cloudflare';
  const HOPS = ON_RENDER || TRUST_CF ? 0 : /^\d{1,2}$/.test(TRUST) ? Number(TRUST) : /^(true|yes|on|y)$/.test(TRUST) ? 1 : 0;
  const TRUST_PROXY = ON_RENDER || TRUST_CF || HOPS > 0;
  let proxyWarned = false;
  const ipOf = (req) => {
    const socket = req.socket.remoteAddress || '';
    if (ON_RENDER) return ipKey(String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || socket);
    if (TRUST_CF) return ipKey(String(req.headers['cf-connecting-ip'] || '').split(',')[0].trim() || socket);
    if (HOPS) {
      const hops = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
      return ipKey(hops.length >= HOPS ? hops[hops.length - HOPS] : socket);
    }
    if (!proxyWarned && (req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'])) {
      proxyWarned = true;
      console.warn('Requests carry X-Forwarded-For or CF-Connecting-IP, but TRUST_PROXY is not set, so attempt limits count the connecting address. Behind a proxy, set TRUST_PROXY (see README).');
    }
    return ipKey(socket);
  };
  const protoOf = (req) => (TRUST_PROXY ? String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' : !!req.socket.encrypted) ? 'https' : 'http';
  const hostOf = (req) => String((TRUST_PROXY && req.headers['x-forwarded-host']) || req.headers.host || 'localhost').split(',')[0].trim().toLowerCase();
  const appOrigin = (req) => APP_URL || `${protoOf(req)}://${hostOf(req)}`;
  const linkOrigin = (req) => FIXED_ORIGIN || appOrigin(req);
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
    db.run('INSERT INTO sessions (token_hash, user_id, expires_at, seen_at) VALUES (?, ?, ?, ?)', sha(token), userId, Date.now() + SESSION_DAYS * DAY, Date.now());
    db.run('UPDATE users SET last_seen = ? WHERE id = ?', Date.now(), userId);
    db.run('INSERT INTO user_ips (user_id, ip, at) VALUES (?, ?, ?) ON CONFLICT(user_id, ip) DO UPDATE SET at = excluded.at', userId, ipOf(req), Date.now());
    res.setHeader('Set-Cookie', `pf_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${protoOf(req) === 'https' ? '; Secure' : ''}`);
  }
  // For security a session ends after 16 minutes with no requests at all, for example a closed laptop or a phone app left in the background.
  // While a page is open, the app itself logs out after 15 minutes without activity, with a warning a minute before.
  function currentUser(req) {
    const token = cookie(req, 'pf_session');
    if (!token) return null;
    const now = Date.now(), key = sha(token);
    const u = db.get('SELECT u.id, u.email, u.name, u.verified, u.phone, u.totp_on, s.seen_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?', key, now);
    if (u && u.seen_at && now - u.seen_at > IDLE_MS) { db.run('DELETE FROM sessions WHERE token_hash = ?', key); return null; }
    if (u && now - u.seen_at > 30000) db.run('UPDATE sessions SET seen_at = ? WHERE token_hash = ?', now, key);
    return u ? { id: u.id, email: u.email, name: u.name, admin: isAdmin(u), phone: u.phone, twoFactor: !!u.totp_on } : null;
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
    return `${linkOrigin(req)}/s/${site.slug}/`;
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
      domainProof: s.custom_domain && !s.domain_verified ? { name: `_pf-verify.${s.custom_domain}`, value: domainProof(s.id, s.custom_domain) } : null,
    };
    out.ordering = orderingOf(s);
    out.orderingRev = revOf(s.ordering); out.draftRev = revOf(s.draft);
    if (full) out.draft = JSON.parse(s.draft);
    return out;
  }
  const orderingOf = (s) => normalizeOrdering(s.ordering ? JSON.parse(s.ordering) : defaultOrdering());
  const toItem = (r) => ({ id: r.id, category: r.category, name: r.name, color: r.color || '', price: r.price, cost: r.cost ?? null, desc: r.description, image: r.image, available: !!r.available, stock: r.stock ?? 0, restock: r.restock ?? null, mods: r.mods ? JSON.parse(r.mods) : [], label: r.label || '', revclass: r.revclass || '', taxable: r.taxable !== 0, sale: r.sale || 0, options: r.options ? cleanOptions(JSON.parse(r.options)) : [] });
  const menuOf = (siteId) => db.all('SELECT * FROM menu_items WHERE site_id = ? ORDER BY sort, rowid', siteId).map(toItem);
  const toOrder = (r) => ({ id: r.id, number: r.number, token: r.token, status: r.status, method: r.method, name: r.name, email: r.email, phone: r.phone, address: r.address, vehicle: r.vehicle, notes: r.notes, items: JSON.parse(r.items), subtotal: r.subtotal, discount: r.discount || 0, promo: r.promo || '', scheduled: r.scheduled || '', tax: r.tax, fee: r.fee, tip: r.tip, total: r.total, createdAt: r.created_at, paidAt: r.paid_at || null, paidMethod: r.paid_method || '', refunded: r.refunded || 0, refundNote: r.refund_note || '', refundedAt: r.refunded_at || null, handledBy: r.handled_by || '', gift: r.gift || 0, giftCode: r.gift_code ? `…${r.gift_code.slice(-4)}` : '', taxRate: r.tax_rate ?? null });
  function cleanItem(b, prev = {}) {
    const price = typeof b.price === 'number' ? Math.round(b.price) : b.price === undefined ? prev.price : parsePrice(b.price);
    const name = str(b.name ?? prev.name, 120).trim();
    if (!name) bad(400, 'Give the item a name.');
    if (price == null || !(price >= 0) || price > 100_000_00) bad(400, 'Enter a price like 9.99.');
    const stock = b.stock === undefined || b.stock === null || b.stock === '' ? prev.stock ?? DEFAULT_STOCK : Math.max(0, Math.min(999999, Math.round(Number(b.stock)) || 0));
    const restock = b.restock === undefined ? prev.restock ?? null : b.restock === null || b.restock === '' ? null : Math.max(0, Math.min(999999, Math.round(Number(b.restock)) || 0));
    const sale = b.sale === undefined ? prev.sale || 0 : Math.max(0, Math.min(90, Math.round(Number(b.sale)) || 0));
    const cost = b.cost === undefined ? prev.cost ?? null : b.cost === null || b.cost === '' ? null : typeof b.cost === 'number' ? Math.max(0, Math.min(100_000_00, Math.round(b.cost))) : parsePrice(b.cost);
    return { cost: cost == null || !(cost >= 0) ? null : Math.min(100_000_00, cost), category: str(b.category ?? prev.category, 60).trim() || 'Menu', name, price, description: str(b.desc ?? prev.description, 500).trim(), image: safeImg(b.image ?? prev.image), available: (b.available ?? prev.available ?? 1) ? 1 : 0, taxable: (b.taxable ?? prev.taxable ?? 1) ? 1 : 0, stock, restock, sale, mods: JSON.stringify(Array.isArray(b.mods) ? b.mods.slice(0, 30).map((x) => str(x, 24)) : prev.mods ? JSON.parse(prev.mods) : []), label: str(b.label ?? prev.label, 40).trim(), revclass: str(b.revclass ?? prev.revclass, 40).trim(), options: JSON.stringify(cleanOptions(b.options ?? (prev.options ? JSON.parse(prev.options) : []))) };
  }
  // A category typed in another case joins the one that exists ('sides' goes into 'Sides'), never making a near-duplicate.
  const canonCategory = (site, name) => {
    const want = String(name || '').trim();
    if (!want) return want;
    const names = [...db.all('SELECT DISTINCT category FROM menu_items WHERE site_id = ?', site.id).map((r) => r.category), ...orderingOf(site).cats.map((c) => c.name)];
    return names.find((n) => n === want) || names.find((n) => n.toLowerCase() === want.toLowerCase()) || want;
  };
  function insertItems(siteId, items, startStock = DEFAULT_STOCK) {
    let sort = (db.get('SELECT MAX(sort) AS m FROM menu_items WHERE site_id = ?', siteId).m || 0) + 1;
    for (const it of items) db.run('INSERT INTO menu_items (id, site_id, category, name, price, description, image, available, taxable, sale, stock, restock, options, sort, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', newId(), siteId, it.category, it.name, it.price, it.description ?? it.desc ?? '', safeImg(it.image), it.available === false || it.available === 0 ? 0 : 1, it.taxable === false || it.taxable === 0 ? 0 : 1, it.sale || 0, it.stock ?? startStock, it.restock ?? null, typeof it.options === 'string' ? it.options : JSON.stringify(cleanOptions(it.options)), sort++, Number.isInteger(it.cost) && it.cost >= 0 ? Math.min(100_000_00, it.cost) : null);
  }
  // A promo code is either one the merchant created or an unused loyalty reward.
  function promoFor(site, ordering, code) {
    const mine = findPromo(ordering, code);
    if (mine) return mine;
    const c = str(code, 24).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const r = c && db.get('SELECT code, type, value FROM rewards WHERE site_id = ? AND code = ? AND used_order IS NULL', site.id, c);
    if (r) return { ...r, reward: true };
    // A gift card is not money off: it pays for the order like cash, after tax, tip and delivery, up to what is left on it.
    const g = c && db.get('SELECT code, balance FROM gift_cards WHERE site_id = ? AND code = ? AND balance > 0', site.id, c);
    return g ? { code: g.code, type: 'gift', value: g.balance, gift: true } : null;
  }
  const langOf = (site) => { try { return JSON.parse(site.published || site.draft).lang === 'es' ? 'es' : 'en'; } catch { return 'en'; } };
  function businessOf(site) {
    const c = JSON.parse(site.published || site.draft);
    const b = c.business || {};
    return { name: c.brand?.name || site.name, phone: str(b.phone), email: str(b.email), payUrl: safeUrl(str(b.payUrl)), address: [b.address1, b.city, b.state].filter(Boolean).join(', ') };
  }
  function mail(kind, req, site, order, to) {
    const business = businessOf(site);
    const lang = kind === 'merchant' ? 'en' : JSON.parse(site.published || site.draft).lang === 'es' ? 'es' : 'en';
    const when = order.scheduled ? slotLabel(order.scheduled, orderingOf(site), lang) : '';
    const msg = orderEmail(kind, { business, order, when, lang, statusUrl: `${siteUrl(req, site).replace(/\/$/, '')}/order/${order.token}`, manageUrl: `${linkOrigin(req)}/app/site/${site.id}?tab=orders`, eta: order.method === 'delivery' ? orderingOf(site).deliveryMinutes : orderingOf(site).prepMinutes });
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
  // The owner sees what they typed about each person, not the person's own account details (people added before that rule keep the name shown then),
  // and 'active' only once that person has signed in since being added.
  const teamOf = (site) => db.all('SELECT u.id, u.name AS account, u.email, m.details, (u.last_seen > m.created_at OR EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id AND s.seen_at > m.created_at)) AS active, m.role, m.created_at AS createdAt FROM members m JOIN users u ON u.id = m.user_id WHERE m.site_id = ? ORDER BY m.created_at', site.id).map(({ account, ...m }) => {
    let details = {}; try { details = JSON.parse(m.details || '{}') || {}; } catch {}
    return { ...m, name: details.name ?? account, phone: details.phone || '', details };
  });

  // The name a person goes by at this business: what the owner typed on the Employees list, or their own account name.
  const staffName = (site, user) => {
    if (site.user_id !== user.id) {
      const m = db.get('SELECT details FROM members WHERE site_id = ? AND user_id = ?', site.id, user.id);
      let d = {}; try { d = JSON.parse(m?.details || '{}') || {}; } catch {}
      if (str(d.name).trim()) return str(d.name).trim();
    }
    return user.name || user.email;
  };
  // Everyone's current name at this business except one person's: the owner's and each team member's.
  const staffNames = (site) => {
    const out = [];
    const owner = db.get('SELECT id, name, email FROM users WHERE id = ?', site.user_id);
    if (owner) out.push([owner.id, owner.name || owner.email]);
    for (const m of db.all('SELECT m.user_id, m.details, u.name, u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.site_id = ?', site.id)) {
      let d = {}; try { d = JSON.parse(m.details || '{}') || {}; } catch { /* none */ }
      out.push([m.user_id, str(d.name).trim() || m.name || m.email]);
    }
    return out;
  };
  const namesInUse = (site, exceptId) => new Set(staffNames(site).filter(([id]) => id !== exceptId).map(([, n]) => n));
  // The one person who goes by a name here, if exactly one does.
  const idForName = (site, name) => { const n = str(name).trim(), hits = n ? staffNames(site).filter(([, x]) => x === n) : []; return hits.length === 1 ? hits[0][0] : ''; };
  // A person's new name reaches everything they did. Records kept by account follow at once; older ones that only
  // carry a name follow when no one else here goes by that name, so nobody else's work is ever moved.
  const NAMED = [['orders', 'handled_by', 'handled_by_id', 'created_at'], ['money_log', 'by_name', 'by_id', 'at'], ['cash_log', 'by_name', 'by_id', 'created_at'], ['timeclock', 'name', 'user_id', 'in_at'], ['shifts', 'name', 'user_id', 'day'], ['appointments', 'employee', 'employee_id', 'created_at']];
  // since: when the person joined this business. Older records with only a name may belong to someone who went by it before.
  function carryName(site, userId, name, oldNames, since = 0) {
    if (!name) return;
    for (const [t, col, idCol] of NAMED) db.run(`UPDATE ${t} SET ${col} = ? WHERE site_id = ? AND ${idCol} = ?`, name, site.id, userId);
    const taken = namesInUse(site, userId);
    const old = [...new Set(oldNames.map((x) => str(x).trim()).filter((x) => x && x !== name && !taken.has(x)))];
    if (!old.length) return;
    const sinceDay = new Date(since || 0).toISOString().slice(0, 10);
    for (const [t, col, idCol, at] of NAMED) db.run(`UPDATE ${t} SET ${col} = ?, ${idCol} = ? WHERE site_id = ? AND ${idCol} = '' AND ${col} IN (SELECT value FROM json_each(?)) AND ${at} >= ?`, name, userId, site.id, JSON.stringify(old), at === 'day' ? sinceDay : since || 0);
  }
  // An account's own name changed: on every business where people know them by it, their records follow.
  // The businesses where people know this account by its own name: the ones it owns, and teams where it has no list name.
  const knownByAccountName = (user, name) => db.all('SELECT * FROM sites WHERE user_id = ? OR id IN (SELECT site_id FROM members WHERE user_id = ?)', user.id, user.id)
    .filter((site) => staffName(site, { ...user, name: name === user.email ? '' : name }) === name);
  function accountRenamed(user, before, after) {
    if (!after || before === after) return;
    for (const site of knownByAccountName(user, after)) {
      const since = site.user_id === user.id ? site.created_at : db.get('SELECT created_at FROM members WHERE site_id = ? AND user_id = ?', site.id, user.id)?.created_at || 0;
      carryName(site, user.id, after, [before], since);
    }
  }

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
      // The summary covers midnight to midnight of the day that just ended, the same day the reports show.
      const calDay = (ms) => new Date(wallNow(ordering, ms)).toISOString().slice(0, 10);
      const rows = db.all("SELECT * FROM orders WHERE site_id = ? AND status != 'cancelled' AND created_at > ?", site.id, nowMs - 4 * DAY).map(toOrder).filter((o) => calDay(o.createdAt) === site.day);
      const totals = { orders: rows.length, net: 0, tax: 0, tips: 0, total: 0 };
      const sold = new Map();
      // Refunds made that day come off, as in the reports.
      const back = db.all("SELECT m.id, m.ref_id, m.amount, m.tax AS rtax, m.tip AS rtip, m.fee AS rfee, m.at, o.subtotal, o.discount, o.items FROM money_log m JOIN orders o ON o.id = m.ref_id WHERE m.site_id = ? AND m.kind = 'refund' AND m.source = 'Order' AND o.status != 'cancelled' AND m.at > ?", site.id, nowMs - 4 * DAY).filter((r) => calDay(r.at) === site.day);
      totals.refunds = 0; totals.fees = 0;
      // Each line's share of its order after the order's discount; refunded sales come off the same lines.
      const share = (items, subtotal, discount, amount) => { let left = discount, leftA = amount; const net = subtotal - discount; return items.map((l, i) => { const g = l.price * l.qty, last = i === items.length - 1, off = last ? left : subtotal ? Math.round((discount * g) / subtotal) : 0; left -= off; const a = last ? leftA : net ? Math.round((amount * (g - off)) / net) : 0; leftA -= a; return [l, a]; }); };
      for (const o of rows) {
        totals.net += o.subtotal - o.discount; totals.tax += o.tax; totals.tips += o.tip; totals.fees += o.fee; totals.total += o.total;
        for (const [l, a] of share(o.items, o.subtotal, o.discount, o.subtotal - o.discount)) { const it = sold.get(l.name) || sold.set(l.name, { name: l.name, qty: 0, sales: 0 }).get(l.name); it.qty += l.qty; it.sales += a; }
      }
      const pre = new Map();
      if (back.length) { const run = new Map(); for (const r of db.all("SELECT id, ref_id, amount, tax, tip, fee FROM money_log WHERE site_id = ? AND kind = 'refund' AND source = 'Order' AND ref_id IN (SELECT value FROM json_each(?)) ORDER BY at, rowid", site.id, JSON.stringify([...new Set(back.map((r) => r.ref_id))]))) { const was = run.get(r.ref_id) || 0; pre.set(r.id, was); run.set(r.ref_id, was + r.amount - r.tax - r.tip - r.fee); } }
      for (const r of back) {
        const sales = r.amount - r.rtax - r.rtip - r.rfee, items = JSON.parse(r.items || '[]'), was = pre.get(r.id) || 0;
        totals.refunds += sales; totals.net -= sales; totals.tax -= r.rtax; totals.tips -= r.rtip; totals.fees -= r.rfee; totals.total -= r.amount;
        const a0 = share(items, r.subtotal, r.discount, was), a1 = share(items, r.subtotal, r.discount, was + sales);
        a1.forEach(([l, a], i) => { const it = sold.get(l.name); if (it) it.sales -= a - a0[i][1]; });
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
  /* Once a day, photos that no site, version, item, order or invoice mentions, and that are over a week old, are deleted.
     That frees the account's storage and takes photos of deleted sites offline. */
  const UPLOAD_QUOTA = 250 * 1024 * 1024;
  async function sweepUploads(nowMs = Date.now()) {
    if (!uploadDir) return 0;
    const used = new Set();
    const scan = (text) => { for (const m of String(text || '').matchAll(/\/u\/([A-Za-z0-9_-]{6,40}\.[a-z]{3,4})/g)) used.add(m[1]); };
    for (const [table, cols] of [['sites', ['draft', 'published', 'ordering']], ['versions', ['draft']], ['menu_items', ['image', 'options']], ['orders', ['items']], ['invoices', ['items', 'attachments']], ['projects', ['attachments']]]) {
      let after = '';
      for (;;) {
        const rows = db.all(`SELECT rowid AS r, ${cols.join(', ')} FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT 500`, after || 0);
        if (!rows.length) break;
        for (const row of rows) for (const c of cols) scan(row[c]);
        after = rows.at(-1).r;
      }
    }
    let removed = 0;
    for (const name of await fs.readdir(uploadDir).catch(() => [])) {
      if (used.has(name) || !/^[A-Za-z0-9_-]{6,40}\.[a-z]{3,4}$/.test(name)) continue;
      const row = db.get('SELECT created_at FROM uploads WHERE name = ?', name);
      const born = row ? row.created_at : (await fs.stat(join(uploadDir, name)).catch(() => null))?.mtimeMs;
      if (!born || nowMs - born < 7 * DAY) continue;
      await fs.rm(join(uploadDir, name), { force: true });
      db.run('DELETE FROM uploads WHERE name = ?', name);
      removed++;
    }
    return removed;
  }
  let lastSweep = 0;
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
  const daily = setInterval(() => {
    tick(); try { backup(); } catch (e) { console.error('Backup failed:', e.message); }
    if (Date.now() - lastSweep > DAY) { lastSweep = Date.now(); sweepUploads().catch((e) => console.error('Photo clean-up failed:', e.message)); }
  }, 5 * 60000);
  daily.unref();
  const firstTick = setTimeout(tick, 4000);
  firstTick.unref();
  function packDraft(input) {
    const draft = JSON.stringify(normalizeSite(input));
    if (draft.length > 400_000) bad(413, 'This site has more content than we can save. Try shortening some text.');
    return draft;
  }

  // The domain has to point here, and its TXT record has to carry this site's proof: pointing here alone proves nothing, since any domain left pointed here would pass.
  async function checkDns(domain, target, proof) {
    const targetIps = await dns.resolve4(target).catch(() => []);
    const details = [];
    for (const name of [domain, `www.${domain}`]) {
      const cnames = (await dns.resolveCname(name).catch(() => [])).map((c) => c.toLowerCase().replace(/\.$/, ''));
      const ips = await dns.resolve4(name).catch(() => []);
      const ok = cnames.includes(target) || (targetIps.length > 0 && ips.some((ip) => targetIps.includes(ip)));
      details.push({ name, ok, found: cnames[0] || ips[0] || '' });
    }
    const txt = (await (dns.resolveTxt ? dns.resolveTxt(`_pf-verify.${domain}`) : Promise.resolve([])).catch(() => [])).map((parts) => [].concat(parts).join('').trim());
    const proved = txt.includes(proof);
    details.push({ name: `_pf-verify.${domain}`, ok: proved, found: txt[0] || '' });
    return { ok: proved && details.slice(0, 2).some((d) => d.ok), pointed: details.slice(0, 2).some((d) => d.ok), proved, details };
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
    // Failed tries are counted per account as well, so guessing one person's password cannot be spread across many addresses.
    // Strangers' failures cannot lock the owner out: a right password from an address this account signed in from before still works.
    const failKey = `login-fail:${email}`, guessing = counted(failKey) >= 10;
    const u = db.get('SELECT * FROM users WHERE email = ?', email);
    const ok = await checkPassword(str(b.password, 200), u ? u.pass_hash : '00:00');
    if (!u || !ok) { bump(failKey, 15 * 60000); if (guessing) bad(429, 'Too many attempts. Please wait a few minutes and try again.'); bad(401, 'That email and password do not match.'); }
    if (guessing && !db.get('SELECT 1 FROM user_ips WHERE user_id = ? AND ip = ?', u.id, ipOf(req))) bad(429, 'Too many attempts. Please wait a few minutes and try again.');
    // With two-step sign-in on, the password alone is not enough: the code from the authenticator app is needed too.
    if (u.totp_on) {
      const code = str(b.code, 24).replace(/\s/g, '');
      if (!code) return json(res, 401, { error: 'Enter the 6-digit code from your authenticator app.', twoFactor: true });
      limit(`2fa:${u.id}`, 8, 15 * 60000);
      const step = totpStep(u.totp_secret, code);
      if (step >= 0) {
        if (!useTotpStep(u.id, step)) return json(res, 401, { error: 'That code can’t be used again. Wait for your authenticator app to show a new code, then enter it.', twoFactor: true });
      } else if (!useRecoveryCode(u, code)) return json(res, 401, { error: 'That code is not right. Codes change every 30 seconds, so try the newest one, or use one of your recovery codes.', twoFactor: true });
    }
    startSession(req, res, u.id);
    json(res, 200, { user: { id: u.id, email: u.email, name: u.name, admin: isAdmin(u), phone: u.phone || '', twoFactor: !!u.totp_on } });
  });

  // An authenticator code works once: a code from the same 30 seconds as the last one used, or from earlier, is refused.
  // Checked after the password, in one step, so two log ins at the same moment cannot both use one code.
  function useTotpStep(userId, step) {
    // One statement that only moves forward, so it holds even with two servers on one database.
    return db.run('UPDATE users SET totp_step = ? WHERE id = ? AND totp_step < ?', step, userId, step).changes === 1;
  }

  // A recovery code works once: it is taken off the list the moment it is used.
  // The list is read again here, after the password check, so two log ins at the same moment cannot both use one code.
  function useRecoveryCode(u, code) {
    if (recoveryNorm(code).length !== 10) return false;
    const row = db.get('SELECT recovery FROM users WHERE id = ? AND totp_on = 1', u.id);
    if (!row) return false;
    let list = [];
    try { list = JSON.parse(row.recovery || '[]'); } catch { list = []; }
    const want = Buffer.from(recoveryHash(u.id, code));
    const at = list.findIndex((h) => typeof h === 'string' && h.length === want.length && timingSafeEqual(Buffer.from(h), want));
    if (at < 0) return false;
    list.splice(at, 1);
    db.run('UPDATE users SET recovery = ? WHERE id = ?', JSON.stringify(list), u.id);
    return true;
  }

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

  /* The signed-in person's own details. */
  route('PUT', '/api/me', async (req, res) => {
    const user = requireUser(req);
    const b = await readJson(req);
    const name = b.name === undefined ? user.name : str(b.name, 80).trim();
    const phone = b.phone === undefined ? user.phone : str(b.phone, 40).trim();
    if (phone && !/^[+()\d][\d\s().-]{5,}$/.test(phone)) bad(400, 'That phone number does not look right.');
    if (name && name !== user.name) { const clash = knownByAccountName(user, name).find((site) => namesInUse(site, user.id).has(name)); if (clash) bad(400, `Someone at ${clash.name} already goes by that name. Add a last name or an initial.`); }
    db.run('UPDATE users SET name = ?, phone = ? WHERE id = ?', name, phone, user.id);
    accountRenamed(user, user.name || user.email, name || user.email);
    json(res, 200, { user: { ...user, name, phone } });
  });
  // Changing the sign-in email needs the password, and the new address has to be confirmed again before it carries staff powers.
  route('POST', '/api/me/email', async (req, res) => {
    const user = requireUser(req);
    limit(`pw:${user.id}`, 8, 15 * 60000);
    const b = await readJson(req);
    const email = str(b.email, 200).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad(400, 'Enter a valid email address.');
    const row = db.get('SELECT pass_hash FROM users WHERE id = ?', user.id);
    if (!await checkPassword(str(b.password, 200), row.pass_hash)) bad(401, 'Your password is not right.');
    if (email !== user.email) {
      if (db.get('SELECT 1 FROM users WHERE email = ?', email)) bad(409, 'Another account already uses that email address.');
      db.run('UPDATE users SET email = ?, verified = 0 WHERE id = ?', email, user.id);
    }
    json(res, 200, { user: { ...user, email, admin: email === user.email ? user.admin : false } });
  });
  // Two-step sign-in. Step one hands out a secret for the authenticator app; it only takes effect once a code from the app proves it was set up.
  route('POST', '/api/me/2fa/setup', (req, res) => {
    const user = requireUser(req);
    if (user.twoFactor) bad(409, 'Two-step sign-in is already on.');
    const secret = toB32(randomBytes(20));
    db.run('UPDATE users SET totp_secret = ?, totp_on = 0, totp_step = 0 WHERE id = ?', secret, user.id);
    json(res, 200, { secret, uri: `otpauth://totp/${encodeURIComponent(`PF Sites:${user.email}`)}?secret=${secret}&issuer=${encodeURIComponent('PF Sites')}&digits=6&period=30` });
  });
  route('POST', '/api/me/2fa/recovery', async (req, res) => {
    const user = requireUser(req);
    if (!user.twoFactor) bad(409, 'Turn on the authenticator app first, then download your recovery codes.');
    limit(`pw:${user.id}`, 8, 15 * 60000);
    const row = db.get('SELECT pass_hash FROM users WHERE id = ?', user.id);
    if (!await checkPassword(str((await readJson(req)).password, 200), row.pass_hash)) bad(401, 'Your password is not right.');
    limit(`recovery:${user.id}`, 10, 3600000);
    const codes = newRecoveryCodes();
    db.run('UPDATE users SET recovery = ? WHERE id = ?', JSON.stringify(codes.map((c) => recoveryHash(user.id, c))), user.id);
    json(res, 200, { codes });
  });
  route('POST', '/api/me/2fa/enable', async (req, res) => {
    const user = requireUser(req);
    if (user.twoFactor) bad(409, 'Two-step sign-in is already on.');
    limit(`2fa:${user.id}`, 8, 15 * 60000);
    // The code is read before the secret, and the switch-on only happens if the secret checked is still the one on file,
    // so a setup started in another tab meanwhile cannot leave two-step on for an app nobody scanned.
    const body = await readJson(req);
    // A signed-in device alone cannot turn it on: the password is needed too.
    limit(`pw:${user.id}`, 8, 15 * 60000);
    if (!await checkPassword(str(body.password, 200), db.get('SELECT pass_hash FROM users WHERE id = ?', user.id).pass_hash)) bad(401, 'Your password is not right.');
    const code = str(body.code, 12).replace(/\s/g, '');
    const row = db.get('SELECT totp_secret FROM users WHERE id = ?', user.id);
    if (!row.totp_secret) bad(400, 'Start again: the setup code has expired.');
    const step = totpStep(row.totp_secret, code);
    if (step < 0) bad(400, 'That code is not right. Codes change every 30 seconds, so try the newest one.');
    // The code used to turn it on counts as used, so it cannot also be used to log in.
    const done = db.run("UPDATE users SET totp_on = 1, recovery = '', totp_step = ? WHERE id = ? AND totp_on = 0 AND totp_secret = ?", step, user.id, row.totp_secret);
    if (done.changes) Promise.resolve().then(() => mailer.send({ to: user.email, ...noticeEmail({ title: 'Two-step sign-in is on', intro: 'Signing in to your Processor Freedom account now needs a code from your authenticator app as well as your password.', warn: 'If you did not do this, reset your password straight away from the sign-in page, then contact us.', manageUrl: `${linkOrigin(req)}/login` }) })).catch((e) => console.error('Two-step email failed:', e.message));
    if (!done.changes) bad(409, 'Start again: the setup code has expired.');
    // Every other device has to sign in again, now with a code.
    db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', user.id, sha(cookie(req, 'pf_session')));
    json(res, 200, { user: { ...user, twoFactor: true } });
  });
  route('POST', '/api/me/2fa/disable', async (req, res) => {
    const user = requireUser(req);
    limit(`pw:${user.id}`, 8, 15 * 60000);
    const row = db.get('SELECT pass_hash FROM users WHERE id = ?', user.id);
    if (!await checkPassword(str((await readJson(req)).password, 200), row.pass_hash)) bad(401, 'Your password is not right.');
    db.run("UPDATE users SET totp_on = 0, totp_secret = '', recovery = '', totp_step = 0 WHERE id = ?", user.id);
    json(res, 200, { user: { ...user, twoFactor: false } });
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

  // kind: 'email' went only to the person's mailbox, 'invite' was handed to whoever invited them, 'staff' was made by staff for a locked-out merchant.
  function resetLinkFor(req, userId, hours = 2, kind = 'email') {
    const token = randomBytes(32).toString('base64url');
    db.run('DELETE FROM resets WHERE user_id = ?', userId);
    db.run('INSERT INTO resets (token_hash, user_id, expires_at, staff, kind) VALUES (?, ?, ?, ?, ?)', sha(token), userId, Date.now() + hours * 3600000, kind === 'staff' ? 1 : 0, kind);
    return `${FIXED_ORIGIN || appOrigin(req)}/reset?token=${token}`;
  }
  route('POST', '/api/auth/forgot', async (req, res) => {
    limit(`forgot:${ipOf(req)}`, 6, 3600000);
    const email = str((await readJson(req)).email, 200).trim().toLowerCase();
    limit(`forgot-for:${email}:${ipOf(req)}`, 4, 3600000);
    const u = db.get('SELECT id, name, email FROM users WHERE email = ?', email);
    // Past twenty links an hour for one address, only somewhere the account has signed in from before still gets one. The answer is the same either way.
    const known = u && db.get('SELECT 1 FROM user_ips WHERE user_id = ? AND ip = ?', u.id, ipOf(req));
    if (u && (known || counted(`forgot-all:${email}`) < 20)) {
      bump(`forgot-all:${email}`, 3600000); const msg = resetEmail({ name: u.name, link: resetLinkFor(req, u.id) }); mailer.send({ to: u.email, ...msg }).catch((e) => console.error('Reset email failed:', e.message)); }
    // The same answer either way, so this cannot be used to find out who has an account.
    json(res, 200, { ok: true, emailEnabled: !!mailer.enabled });
  });
  route('POST', '/api/auth/reset', async (req, res) => {
    limit(`reset:${ipOf(req)}`, 10, 3600000);
    const b = await readJson(req);
    const row = db.get('SELECT * FROM resets WHERE token_hash = ? AND expires_at > ?', sha(str(b.token, 200)), Date.now());
    if (!row) bad(400, 'This reset link has expired or was already used. Ask for a new one.');
    if (str(b.password, 200).length < 8) bad(400, 'Use at least 8 characters for your password.');
    // Opening a link proves the mailbox only when the link was sent there and nowhere else.
    const before = db.get('SELECT verified FROM users WHERE id = ?', row.user_id);
    db.run(`UPDATE users SET pass_hash = ?${row.kind === 'email' ? ', verified = 1' : ''} WHERE id = ?`, await hashPassword(str(b.password, 200)), row.user_id);
    // Two-step turned on for an address nobody had confirmed is cleared by the first link that proves the mailbox, so someone who
    // signed up with another person's address first cannot lock the real owner out.
    if (row.kind === 'email' && !before.verified) db.run("UPDATE users SET totp_on = 0, totp_secret = '', recovery = '', totp_step = 0 WHERE id = ?", row.user_id);
    db.run('DELETE FROM resets WHERE user_id = ?', row.user_id);
    db.run('DELETE FROM sessions WHERE user_id = ?', row.user_id);
    const u = db.get('SELECT id, email, name, verified, phone, totp_on FROM users WHERE id = ?', row.user_id);
    // With two-step sign-in on, a link from the email only sets the password: logging in still needs the code or a recovery code.
    // A link staff made for a locked-out merchant (who may have lost the phone) signs in as before.
    if (u.totp_on && !row.staff) return json(res, 200, { twoFactor: true });
    startSession(req, res, row.user_id);
    json(res, 200, { user: { id: u.id, email: u.email, name: u.name, admin: isAdmin(u), phone: u.phone || '', twoFactor: !!u.totp_on } });
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

  // The business name (DBA) only changes through Change business name, which emails the owner; saving the website keeps it as it is.
  const keepName = (draft, site) => {
    if (!site.name) return draft;
    const d = JSON.parse(draft);
    if (!d.brand || d.brand.name === site.name) return draft;
    d.brand.name = site.name;
    return JSON.stringify(d);
  };
  // Every save says which saved copy it was made from. The check runs on the row as it is now, after the body has arrived,
  // with nothing in between it and the write, so two overlapping saves can never both pass.
  route('PUT', '/api/sites/:id', async (req, res, p) => {
    const { site: asked } = ownSite(req, p.id);
    const b = await readJson(req);
    const site = db.get('SELECT * FROM sites WHERE id = ?', asked.id) || bad(404, 'That site no longer exists.');
    if (b.rev !== revOf(site.draft)) bad(412, STALE);
    const draft = keepName(packDraft(b.draft), site);
    db.run('UPDATE sites SET draft = ?, name = ?, updated_at = ? WHERE id = ?', draft, JSON.parse(draft).brand.name, Date.now(), site.id);
    json(res, 200, { site: present(req, db.get('SELECT * FROM sites WHERE id = ?', site.id)) });
  });

  // Change business name (DBA): the website, receipts and emails all use the new name straight away, and the owner gets an email.
  route('PUT', '/api/sites/:id/name', async (req, res, p) => {
    const { site: asked, user } = ownSite(req, p.id);
    const name = str((await readJson(req)).name, 80).replace(/\s+/g, ' ').trim();
    // The draft is read again now the body is here, so a save made in the meantime is kept.
    const site = db.get('SELECT * FROM sites WHERE id = ?', asked.id) || bad(404, 'That site no longer exists.');
    if (!name) bad(400, 'Enter your business name.');
    if (name === site.name) return json(res, 200, { site: present(req, site), emailed: false });
    limit(`rename:${site.id}`, 10, 3600000);
    const rename = (raw) => { const d = JSON.parse(raw); d.brand = { ...(d.brand || {}), name }; return JSON.stringify(d); };
    db.run('UPDATE sites SET name = ?, draft = ?, published = ?, updated_at = ? WHERE id = ?', name, rename(site.draft), site.published ? rename(site.published) : null, Date.now(), site.id);
    const owner = db.get('SELECT id, email FROM users WHERE id = ?', site.user_id);
    const tz = orderingOf(site).timezone || 'America/Chicago';
    const msg = nameChangeEmail({
      before: site.name, after: name, by: user.name ? `${user.name} (${user.email})` : user.email,
      when: new Date().toLocaleString('en-US', { timeZone: tz, month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
      manageUrl: `${linkOrigin(req)}/app/site/${site.id}/bizinfo`,
    });
    for (const to of new Set([owner?.email, user.email].filter(Boolean))) Promise.resolve().then(() => mailer.send({ to, ...msg })).catch((e) => console.error('Name change email failed:', e.message));
    json(res, 200, { site: present(req, db.get('SELECT * FROM sites WHERE id = ?', site.id)), emailed: !!mailer.enabled });
  });

  // The business details customers see (phone, email, address, opening hours, logo) go live straight away, like the business name:
  // they are written into the saved draft and the live copy together, so receipts, emails and the order page agree.
  route('PUT', '/api/sites/:id/business', async (req, res, p) => {
    const { site: asked } = ownSite(req, p.id);
    const b = await readJson(req);
    const site = db.get('SELECT * FROM sites WHERE id = ?', asked.id) || bad(404, 'That site no longer exists.');
    if (b.rev !== revOf(site.draft)) bad(412, STALE);
    const KEYS = ['phone', 'email', 'address1', 'city', 'state', 'zip'];
    const hm = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? v : d);
    const week = Array.isArray(b.week) && b.week.length === 7 ? b.week.map((x) => ({ open: hm(x?.open, '09:00'), close: hm(x?.close, '17:00'), closed: !!x?.closed })) : null;
    const patch = (raw) => {
      const d = JSON.parse(raw);
      d.business = { ...(d.business || {}) };
      for (const k of KEYS) if (typeof b.business?.[k] === 'string') d.business[k] = b.business[k];
      if (Array.isArray(b.business?.hours)) d.business.hours = b.business.hours.slice(0, 14).map((r) => ({ label: str(r?.label, 60), value: str(r?.value, 80) }));
      // The week from Business hours, written out in this copy's own language (the draft may be in another language than the live site).
      if (week) d.business.hours = hoursText(week, d.lang === 'es' ? 'es' : 'en');
      if (b.logo !== undefined) d.brand = { ...(d.brand || {}), logo: b.logo, ...(b.logo && d.brand?.logoMode === 'text' ? { logoMode: 'image' } : {}) };
      return packDraft(d);
    };
    db.run('UPDATE sites SET draft = ?, published = ?, updated_at = ? WHERE id = ?', patch(site.draft), site.published ? patch(site.published) : null, Date.now(), site.id);
    json(res, 200, { site: present(req, db.get('SELECT * FROM sites WHERE id = ?', site.id)) });
  });

  route('DELETE', '/api/sites/:id', (req, res, p) => {
    const { site } = ownSite(req, p.id, 'owner');
    db.run('DELETE FROM sites WHERE id = ?', site.id);
    json(res, 200, { ok: true });
  });

  route('POST', '/api/sites/:id/publish', async (req, res, p) => {
    const { site: asked } = ownSite(req, p.id);
    const b = await readJson(req);
    const site = db.get('SELECT * FROM sites WHERE id = ?', asked.id) || bad(404, 'That site no longer exists.');
    // A copy sent along has to be made from the latest saved one, so a tab opened earlier cannot put its old version live.
    if (b.draft && b.rev !== revOf(site.draft)) bad(412, STALE);
    const draft = b.draft ? keepName(packDraft(b.draft), site) : site.draft;
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
    if (ownHost(domain) || domain === hostOf(req).split(':')[0].replace(/^www\./, '')) bad(400, 'That address belongs to us. Change your free address above instead.');
    if (db.get('SELECT 1 FROM sites WHERE custom_domain = ? AND id != ? AND domain_verified = 1', domain, site.id)) bad(409, 'That domain is already connected to another site.');
    // Another site's claim nobody has proved yet is not wiped by anyone who asks: it moves only to whoever shows they control the
    // domain, with this site's own TXT record in place. Until then the other claim stays.
    if (db.get('SELECT 1 FROM sites WHERE custom_domain = ? AND id != ? AND domain_verified = 0', domain, site.id)) {
      limit(`dns:${site.id}`, 20, 10 * 60000);
      const proof = domainProof(site.id, domain);
      const txt = (await (dns.resolveTxt ? dns.resolveTxt(`_pf-verify.${domain}`) : Promise.resolve([])).catch(() => [])).map((parts) => [].concat(parts).join('').trim());
      if (!txt.includes(proof)) bad(409, `Another site is waiting to connect ${domain}. If it is yours, add a TXT record named _pf-verify.${domain} with the value ${proof}, then connect it again.`);
      db.run('UPDATE sites SET custom_domain = NULL WHERE custom_domain = ? AND id != ? AND domain_verified = 0', domain, site.id);
    }
    db.run('UPDATE sites SET custom_domain = ?, domain_verified = 0, updated_at = ? WHERE id = ?', domain, Date.now(), site.id);
    json(res, 200, { site: present(req, db.get('SELECT * FROM sites WHERE id = ?', site.id)) });
  });

  route('POST', '/api/sites/:id/domain/verify', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    if (!site.custom_domain) bad(400, 'Add a domain first.');
    limit(`dns:${site.id}`, 20, 10 * 60000);
    const result = await checkDns(site.custom_domain, cnameTarget(req), domainProof(site.id, site.custom_domain));
    if (result.ok && !site.domain_verified) {
      if (db.get('SELECT 1 FROM sites WHERE custom_domain = ? AND id != ? AND domain_verified = 1', site.custom_domain, site.id)) bad(409, 'That domain is already connected to another site.');
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

  /* What has happened lately at this shop: new orders, messages, booking requests and items running low. */
  route('GET', '/api/sites/:id/notifications', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const o = orderingOf(site), out = [];
    for (const r of db.all('SELECT number, name, method, total, status, created_at FROM orders WHERE site_id = ? ORDER BY created_at DESC LIMIT 15', site.id)) out.push({ kind: 'order', at: r.created_at, title: `Order #${r.number}${r.status === 'new' ? ' is waiting' : ''}`, text: `${r.name} · ${(ORDER_METHODS[r.method] || {}).name || r.method} · ${money(r.total)}`, tab: 'orders', open: r.status === 'new' });
    for (const r of db.all('SELECT name, message, created_at FROM leads WHERE site_id = ? ORDER BY created_at DESC LIMIT 8', site.id)) out.push({ kind: 'message', at: r.created_at, title: `Message from ${r.name}`, text: str(r.message, 90), tab: 'inbox' });
    for (const r of db.all("SELECT name, service, at, created_at FROM appointments WHERE site_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 8", site.id)) out.push({ kind: 'booking', at: r.created_at, title: 'Booking request', text: `${r.name} · ${r.service} · ${apptWhen(r.at)}`, tab: 'appts', open: true });
    out.sort((a, b) => b.at - a.at);
    const low = o.enabled ? db.all('SELECT name, stock FROM menu_items WHERE site_id = ? AND available = 1 AND stock <= ? ORDER BY stock, name LIMIT 6', site.id, o.lowStockAt).map((r) => ({ kind: 'stock', at: 0, title: r.stock <= 0 ? `${r.name} is sold out` : `${r.name} is running low`, text: r.stock <= 0 ? 'Add more to keep selling it.' : `${r.stock} left`, tab: 'items', open: true })) : [];
    json(res, 200, { notifications: [...low, ...out].slice(0, 30) });
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
    const name = str(b.name, 80).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad(400, 'Enter a valid email address.');
    const owner = db.get('SELECT email FROM users WHERE id = ?', site.user_id);
    if (email === owner.email) bad(400, 'That is the owner of this site, who already has full access.');
    // Staff addresses carry powers over every account, so they are never set up through someone's team.
    if (ADMINS.has(email)) bad(400, 'That address cannot be added to a team.');
    let person = db.get('SELECT id FROM users WHERE email = ?', email);
    const member = person && db.get('SELECT details, created_at FROM members WHERE site_id = ? AND user_id = ?', site.id, person.id);
    let details = {}; try { details = JSON.parse(member?.details || '{}') || {}; } catch {}
    if (!member) {
      if (teamOf(site).length >= 25) bad(400, 'A site can have up to 25 team logins.');
      limit(`invite:${site.id}`, 40, 3600000);
    }
    // Every check comes before anything is written, so a refused save leaves no login, membership or role change behind.
    const acct = person ? db.get('SELECT name, email FROM users WHERE id = ?', person.id) : { name, email };
    const before = member ? str(details.name).trim() || acct.name || acct.email : '';
    // Two people with one name could not be told apart in sales, time cards or the schedule.
    if (name && (!member || name !== str(details.name).trim()) && namesInUse(site, person ? person.id : '').has(name)) bad(400, 'Someone at this business already goes by that name. Add a last name or an initial.');
    if (!member || b.name !== undefined) details.name = name;
    if (b.details && typeof b.details === 'object') {
      const d = b.details, pass = str(d.passcode, 4).replace(/\D/g, '');
      if (pass && (pass.length !== 4 || /^(\d)\1{3}$/.test(pass) || '0123456789'.includes(pass) || '9876543210'.includes(pass))) bad(400, 'The passcode must be 4 digits with no sequence or repeat.');
      const phone = str(d.phone, 40).trim();
      if (phone && !/^[+()\d][\d\s().-]{5,}$/.test(phone)) bad(400, 'That phone number does not look right.');
      Object.assign(details, { nickname: str(d.nickname, 60).trim(), phone, payType: d.payType === 'salary' ? 'salary' : 'hourly', rate: Math.max(0, Math.min(100000000, Math.round(Number(d.rate)) || 0)), customId: str(d.customId, 40).trim(), passcode: pass });
    }
    // A password nobody knows; the person chooses their own from the link. Choosing it does not confirm the address.
    const hash = person ? '' : await hashPassword(randomBytes(24).toString('hex'));
    const fresh = !person;
    db.raw.exec('BEGIN');
    try {
      if (fresh) { person = { id: newId() }; db.run('INSERT INTO users (id, email, name, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)', person.id, email, name, hash, Date.now()); }
      db.run('INSERT INTO members (site_id, user_id, role, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(site_id, user_id) DO UPDATE SET role = excluded.role', site.id, person.id, role, Date.now());
      // What the owner knows about the person lives with the membership; another account's own name is never changed.
      db.run('UPDATE members SET details = ? WHERE site_id = ? AND user_id = ?', JSON.stringify(details), site.id, person.id);
      const after = str(details.name).trim() || acct.name || acct.email;
      if (member && after !== before) carryName(site, person.id, after, [before], member.created_at);
      db.raw.exec('COMMIT');
    } catch (e) { db.raw.exec('ROLLBACK'); throw e; }
    const link = fresh ? resetLinkFor(req, person.id, 72, 'invite') : '';
    if (!member && mailOk(site)) {
      const msg = inviteEmail({ business: site.name, role, link: link || `${linkOrigin(req)}/login`, inviter: user.name || user.email, fresh: !!link });
      Promise.resolve().then(() => mailer.send({ to: email, ...msg })).catch((e) => console.error('Invite email failed:', e.message));
    }
    // With email on, the link goes only to the person, and the answer is the same whether or not they already had an account.
    json(res, 201, { members: teamOf(site), link: mailer.enabled ? '' : link, emailed: !!mailer.enabled && !member, added: !member });
  });
  // Anyone on a team can take themselves off it.
  route('DELETE', '/api/sites/:id/membership', (req, res, p) => {
    const user = requireUser(req);
    if (!db.run('DELETE FROM members WHERE site_id = ? AND user_id = ?', str(p.id, 40), user.id).changes) bad(404, 'You are not on this site\'s team.');
    json(res, 200, { ok: true });
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
    // Spent is money really paid: paid orders less what was refunded on them, and paid invoices and appointments to the same address.
    for (const o of db.all('SELECT name, email, phone, total, refunded, paid_at, status, items, created_at FROM orders WHERE site_id = ? ORDER BY created_at DESC LIMIT 20000', site.id)) {
      const key = o.email.toLowerCase();
      const c = people.get(key) || people.set(key, { name: o.name, email: key, phone: o.phone, orders: 0, spent: 0, last: o.created_at, first: o.created_at, items: new Map() }).get(key);
      c.first = o.created_at;
      if (o.status === 'cancelled') continue;
      c.orders++; if (o.paid_at) c.spent += o.total - (o.refunded || 0);
      for (const l of JSON.parse(o.items)) c.items.set(l.name, (c.items.get(l.name) || 0) + l.qty);
    }
    const customers = [...people.values()].map((c) => ({ ...c, items: undefined, favourite: [...c.items].sort((a, b) => b[1] - a[1])[0]?.[0] || '' }));
    const byEmail = new Map(customers.map((c) => [c.email, c]));
    const invoicePaid = new Map();
    for (const v of db.all("SELECT customer, total FROM invoices WHERE site_id = ? AND status = 'paid'", site.id)) { let e = ''; try { e = String(JSON.parse(v.customer).email || '').toLowerCase(); } catch { /* none */ } if (e) invoicePaid.set(e, (invoicePaid.get(e) || 0) + v.total); }
    for (const v of db.all("SELECT lower(email) AS e, SUM(total) AS n FROM appointments WHERE site_id = ? AND paid_at IS NOT NULL AND email != '' GROUP BY lower(email)", site.id)) invoicePaid.set(v.e, (invoicePaid.get(v.e) || 0) + v.n);
    for (const [e, amount] of invoicePaid) { const hit = byEmail.get(e); if (hit) hit.spent += amount; }
    const phoneOnly = new Map();
    for (const r of db.all("SELECT name, phone, total FROM appointments WHERE site_id = ? AND paid_at IS NOT NULL AND email = '' AND phone != ''", site.id)) { const k = `${String(r.name).toLowerCase()}|${r.phone}`; phoneOnly.set(k, (phoneOnly.get(k) || 0) + r.total); }
    // People the merchant added by hand, for invoices, sit in the same list.
    for (const k of contactsOf(site.id)) {
      const hit = k.email && byEmail.get(k.email.toLowerCase());
      if (hit) Object.assign(hit, { contactId: k.id, company: k.company, address: k.address, more: k.more, name: k.name || hit.name, phone: k.phone || hit.phone });
      else customers.push({ name: k.name, company: k.company, email: k.email, phone: k.phone, address: k.address, orders: 0, spent: (k.email ? invoicePaid.get(k.email.toLowerCase()) || 0 : phoneOnly.get(`${String(k.name).toLowerCase()}|${k.phone}`) || 0), last: null, first: k.createdAt, favourite: '', contactId: k.id, more: k.more });
    }
    json(res, 200, { customers });
  });

  /* Contacts and invoices, for catering and other large orders billed outside the order page. */
  const contactsOf = (siteId) => db.all('SELECT id, name, company, email, phone, address, more, created_at AS createdAt FROM contacts WHERE site_id = ? ORDER BY name', siteId);
  const cleanContact = (b) => {
    const c = { name: str(b?.name, 120).trim(), company: str(b?.company, 120).trim(), email: str(b?.email, 200).trim().toLowerCase(), phone: str(b?.phone, 40).trim(), address: str(b?.address, 300).trim(), more: JSON.stringify({ emails: (Array.isArray(b?.more?.emails) ? b.more.emails : []).slice(0, 5).map((x) => str(x, 200).trim().toLowerCase()).filter(Boolean), phones: (Array.isArray(b?.more?.phones) ? b.more.phones : []).slice(0, 5).map((x) => str(x, 40).trim()).filter(Boolean), note: str(b?.more?.note, 500).trim() }) };
    if (!c.name && !c.company) bad(400, 'Add the customer’s name or company.');
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) bad(400, 'That email address does not look right.');
    if (!c.name) c.name = c.company;
    return c;
  };
  const EMPTY_MORE = JSON.stringify({ emails: [], phones: [], note: '' });
  // Returns false when the list is full and nothing was saved.
  const CONTACT_MAX = 5000;
  function keepContact(siteId, c) {
    const old = c.email ? db.get('SELECT id FROM contacts WHERE site_id = ? AND email = ?', siteId, c.email) : db.get('SELECT id FROM contacts WHERE site_id = ? AND email = ? AND lower(name) = lower(?)', siteId, '', c.name);
    // Blank fields never wipe what is saved: invoices and orders only add to a customer's details.
    if (old) { db.run("UPDATE contacts SET name = COALESCE(NULLIF(?, ''), name), company = COALESCE(NULLIF(?, ''), company), phone = COALESCE(NULLIF(?, ''), phone), address = COALESCE(NULLIF(?, ''), address), more = CASE WHEN ? = ? THEN more ELSE ? END WHERE id = ?", c.name, c.company, c.phone, c.address, c.more, EMPTY_MORE, c.more, old.id); return true; }
    if (db.get('SELECT COUNT(*) AS n FROM contacts WHERE site_id = ?', siteId).n >= CONTACT_MAX) return false;
    db.run('INSERT INTO contacts (id, site_id, name, company, email, phone, address, more, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', newId(), siteId, c.name, c.company, c.email, c.phone, c.address, c.more || '{}', Date.now());
    return true;
  }
  // Loyalty rewards earned and used, with how much they took off.
  route('GET', '/api/sites/:id/rewards', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const rows = db.all('SELECT code, email, type, value, earned_order AS earnedOrder, used_order AS usedOrder, created_at AS createdAt FROM rewards WHERE site_id = ? ORDER BY created_at DESC LIMIT 2000', site.id);
    const used = new Map(db.all("SELECT promo, discount, created_at FROM orders WHERE site_id = ? AND promo LIKE 'THANKS%' AND status != 'cancelled'", site.id).map((o) => [o.promo, { discount: o.discount, at: o.created_at }]));
    json(res, 200, { rewards: rows.map((r) => ({ ...r, discount: used.get(r.code)?.discount || 0, usedAt: used.get(r.code)?.at || null })) });
  });
  route('POST', '/api/sites/:id/contacts', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const c = cleanContact(await readJson(req));
    if (!keepContact(site.id, c)) bad(400, `The customer list is full (${CONTACT_MAX.toLocaleString('en-US')} people). Remove some before adding more.`);
    json(res, 201, { contacts: contactsOf(site.id) });
  });
  // Editing one saved customer: exactly what was typed, so a field can be cleared, and the same row even when the email changes.
  route('PUT', '/api/sites/:id/contacts/:contact', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const c = cleanContact(await readJson(req));
    const row = db.get('SELECT id FROM contacts WHERE id = ? AND site_id = ?', str(p.contact, 40), site.id) || bad(404, 'That customer was removed.');
    if (c.email && db.get('SELECT 1 FROM contacts WHERE site_id = ? AND email = ? AND id != ?', site.id, c.email, row.id)) bad(409, 'Another saved customer already uses that email address.');
    db.run('UPDATE contacts SET name = ?, company = ?, email = ?, phone = ?, address = ?, more = ? WHERE id = ?', c.name, c.company, c.email, c.phone, c.address, c.more, row.id);
    json(res, 200, { contacts: contactsOf(site.id) });
  });
  route('DELETE', '/api/sites/:id/contacts/:contact', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    db.run('DELETE FROM contacts WHERE id = ? AND site_id = ?', p.contact, site.id);
    json(res, 200, { contacts: contactsOf(site.id) });
  });

  const invoiceUrl = (req, site, token) => `${siteUrl(req, site).replace(/\/$/, '')}/invoice/${token}`;
  const toInvoice = (r, req, site) => ({ id: r.id, number: r.number, kind: r.kind === 'estimate' ? 'estimate' : 'invoice', label: `${r.kind === 'estimate' ? 'EST' : 'INV'}-${r.number}`, status: r.status, customer: JSON.parse(r.customer), items: JSON.parse(r.items), notes: r.notes, due: r.due, taxRate: r.tax_rate, discountName: r.discount_name || '', discount: r.discount, discountPct: r.discount_pct || 0, subtotal: r.subtotal, tax: r.tax, total: r.total,
    project: r.project || '', terms: r.terms || '', attachments: JSON.parse(r.attachments || '[]'), payUrl: r.pay_url, paidMethod: r.paid_method, paidNote: r.paid_note, reminders: r.reminders, createdAt: r.created_at, sentAt: r.sent_at, viewedAt: r.viewed_at, paidAt: r.paid_at, ...(req ? { url: invoiceUrl(req, site, r.token) } : {}) });
  const invoicesOf = (req, site) => db.all('SELECT * FROM invoices WHERE site_id = ? ORDER BY created_at DESC LIMIT 2000', site.id).map((r) => toInvoice(r, req, site));
  // Files attached to an invoice or project: only files uploaded here by someone who works on this site (or already on it),
  // each listed once, with the size the upload really has. A file's name always ends in its real type, so a download can
  // never be saved as something that runs.
  const MB = 1024 * 1024;
  const worksOn = (site, userId) => site.user_id === userId || !!db.get('SELECT 1 FROM members WHERE site_id = ? AND user_id = ?', site.id, userId);
  const fileName = (name, ext) => `${(str(name, 120).replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ').trim().replace(/\.[A-Za-z0-9]{1,8}$/, '').replace(/[. ]+$/, '').trim() || 'file').slice(0, 110)}.${ext}`;
  const filesOf = (text) => { try { const a = JSON.parse(text || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  function cleanFiles(list, { most, each = 0, total = 0, site, keep = [] }) {
    const out = [], had = new Set(keep.map((f) => f && f.url));
    for (const f of Array.isArray(list) ? list.slice(0, 50) : []) {
      const m = /^\/u\/([A-Za-z0-9_-]{6,40})\.(pdf|png|jpg)$/.exec(typeof f?.url === 'string' ? f.url : '');
      if (!m || out.some((x) => x.url === m[0])) continue;
      const up = db.get('SELECT size, user_id FROM uploads WHERE name = ?', `${m[1]}.${m[2]}`);
      if (up && (had.has(m[0]) || worksOn(site, up.user_id))) out.push({ url: m[0], name: fileName(f.name, m[2]), size: up.size });
    }
    if (out.length > most) bad(400, `Attach at most ${most} files.`);
    if (each && out.some((x) => x.size > each)) bad(400, `Each file can be at most ${each / MB} MB.`);
    if (total && out.reduce((a, x) => a + x.size, 0) > total) bad(400, `Attached files can be at most ${total / MB} MB together.`);
    return out;
  }
  const TERMS = ['receipt', 'net7', 'net15', 'net30', 'net45', 'net60', 'custom'];
  function cleanInvoice(b, site, keep = []) {
    const customer = cleanContact(b.customer);
    // A service charge line is kept as one: never taxed, never discounted.
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 200).map((l) => ({ name: str(l?.name, 160).trim(), qty: Math.max(1, Math.min(100000, Math.round(Number(l?.qty)) || 1)), price: Math.max(0, Math.min(1_000_000_00, Math.round(Number(l?.price)) || 0)), taxable: l?.charge === true ? false : l?.taxable !== false, ...(l?.charge === true ? { charge: true } : {}) })).filter((l) => l.name);
    const rate = Number(b.taxRate);
    const taxRate = Number.isFinite(rate) ? Math.min(30, Math.max(0, Math.round(rate * 1000) / 1000)) : 0;
    const due = realDay(b.due) ? b.due : '';
    // A percentage discount is worked out here from what was sold (never a service charge).
    const pct = Math.max(0, Math.min(100, Math.round((Number(b.discountPct) || 0) * 1000) / 1000));
    const goods = items.reduce((a, l) => a + (l.charge ? 0 : Math.round(l.price * l.qty)), 0);
    const totals = invoiceTotals(items, taxRate, pct ? Math.round((goods * pct) / 100) : b.discount);
    return { customer, items, notes: str(b.notes, 2000).trim(), project: str(b.project, 80).trim(), due, taxRate, payUrl: safeUrl(str(b.payUrl, 500).trim()), ...totals, discountName: totals.discount ? str(b.discountName, 60).trim() : '', discountPct: totals.discount ? pct : 0, terms: TERMS.includes(b.terms) ? b.terms : '', attachments: cleanFiles(b.attachments, { most: 3, total: 25 * MB, site, keep }) };
  }
  const ownInvoice = (site, invId) => db.get('SELECT * FROM invoices WHERE id = ? AND site_id = ?', invId, site.id) || bad(404, 'We could not find that invoice.');
  const saveInvoice = (rowId, v) => db.run('UPDATE invoices SET customer = ?, items = ?, notes = ?, due = ?, tax_rate = ?, discount = ?, discount_name = ?, discount_pct = ?, subtotal = ?, tax = ?, total = ?, pay_url = ?, project = ?, terms = ?, attachments = ?, updated_at = ? WHERE id = ?', JSON.stringify(v.customer), JSON.stringify(v.items), v.notes, v.due, v.taxRate, v.discount, v.discountName || '', v.discountPct || 0, v.subtotal, v.tax, v.total, v.payUrl, v.project || '', v.terms || '', JSON.stringify(v.attachments || []), Date.now(), rowId);

  route('POST', '/api/sites/:id/contacts/import', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const rows = (await readJson(req, 1_500_000)).rows;
    let added = 0, skipped = 0;
    if (Array.isArray(rows) && rows.length > 1000) bad(413, 'Send at most 1,000 customers at a time.');
    let full = 0;
    db.raw.exec('BEGIN');
    try { for (const r of Array.isArray(rows) ? rows : []) { try { if (keepContact(site.id, cleanContact(r))) added++; else full++; } catch { skipped++; } } db.raw.exec('COMMIT'); } catch (e) { db.raw.exec('ROLLBACK'); throw e; }
    // Rows past the limit are counted as skipped, with the reason.
    json(res, 200, { added, skipped: skipped + full, full, limit: CONTACT_MAX, contacts: contactsOf(site.id) });
  });

  /* Gift cards: a code with a balance, spent like money off at checkout or at the counter. */
  // Each card with what was loaded onto it, how much of that was complimentary, and what has been spent (less any given back).
  const giftsOf = (site) => db.all(`SELECT g.code, g.initial, g.balance, g.name, g.email, g.note, g.created_at AS createdAt,
      COALESCE(SUM(CASE WHEN m.kind IN ('issue', 'load') THEN m.amount END), 0) AS loaded,
      COALESCE(SUM(CASE WHEN m.kind IN ('issue', 'load') AND m.method = 'Complimentary' THEN m.amount END), 0) AS comp,
      COALESCE(SUM(CASE WHEN m.kind = 'spend' THEN m.amount WHEN m.kind = 'restore' THEN -m.amount END), 0) AS redeemed,
      COALESCE(MAX(CASE WHEN m.kind = 'issue' THEN m.method END), '') AS paidWith
    FROM gift_cards g LEFT JOIN gift_moves m ON m.site_id = g.site_id AND m.code = g.code WHERE g.site_id = ? GROUP BY g.code ORDER BY g.created_at DESC LIMIT 2000`, site.id);
  const giftLoads = (site) => db.all("SELECT m.code, m.kind, m.amount, m.method, m.at, g.name, g.balance FROM gift_moves m JOIN gift_cards g ON g.site_id = m.site_id AND g.code = m.code WHERE m.site_id = ? AND m.kind IN ('issue', 'load') ORDER BY m.at DESC LIMIT 5000", site.id);
  const GIFT_MAX = 100_000_00, GIFT_PAID = ['Cash', 'Card', 'Check', 'Other', 'Complimentary'];
  const giftMoney = (code, name) => ({ source: 'Gift card', refId: code, ref: `Card …${code.slice(-4)}`, customer: name });
  route('GET', '/api/sites/:id/gift-cards', (req, res, p) => { const { site } = ownSite(req, p.id); json(res, 200, { cards: giftsOf(site), loads: giftLoads(site) }); });
  // Selling a card is money taken, recorded with the tender used, unless the card was given away.
  route('POST', '/api/sites/:id/gift-cards', async (req, res, p) => {
    const { site, user } = ownSite(req, p.id);
    const b = await readJson(req);
    const amount = Math.round(Number(b.amount));
    if (!Number.isFinite(amount) || amount < 100 || amount > GIFT_MAX) bad(400, 'Enter an amount from $1.00 to $100,000.00.');
    const paidWith = GIFT_PAID.includes(b.paidWith) ? b.paidWith : bad(400, 'Choose how the card was paid for.');
    const email = str(b.email, 200).trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad(400, 'That email address does not look right.');
    limit(`gift:${site.id}`, 300, DAY);
    const code = `GC${randomBytes(5).toString('hex').toUpperCase()}`, now = Date.now(), name = str(b.name, 120).trim();
    db.run('INSERT INTO gift_cards (code, site_id, initial, balance, name, email, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', code, site.id, amount, amount, name, email, str(b.note, 200).trim(), now);
    giftMove(site, code, 'issue', amount, paidWith, '', now);
    if (paidWith !== 'Complimentary') logMoney(site, { ...giftMoney(code, name), method: paidWith, amount, note: 'Gift card sold', by: staffName(site, user), byId: user.id, at: now });
    if (email && mailOk(site)) Promise.resolve().then(() => mailer.send({ to: email, ...giftEmail({ business: site.name, code, amount, name: str(b.name, 120).trim(), lang: langOf(site), url: orderingOf(site).enabled && site.published ? `${siteUrl(req, site).replace(/\/$/, '')}/order` : '' }), fromName: site.name })).catch((e) => console.error('Gift card email failed:', e.message));
    json(res, 201, { code, emailed: !!(email && mailer.enabled), cards: giftsOf(site), loads: giftLoads(site) });
  });
  // Spend from a card at the counter, or top it up. The balance check is part of the write, so two at once can never take a card below zero.
  route('POST', '/api/sites/:id/gift-cards/:code', async (req, res, p) => {
    const { site, user } = ownSite(req, p.id);
    const b = await readJson(req);
    const card = db.get('SELECT * FROM gift_cards WHERE site_id = ? AND code = ?', site.id, str(p.code, 24).toUpperCase()) || bad(404, 'We could not find that gift card.');
    const change = Math.round(Number(b.change)), now = Date.now();
    if (!Number.isFinite(change) || !change || Math.abs(change) > GIFT_MAX) bad(400, 'Enter an amount from $0.01 to $100,000.00.');
    if (change > 0) {
      const paidWith = GIFT_PAID.includes(b.paidWith) ? b.paidWith : bad(400, 'Choose how the top-up was paid for.');
      if (!db.run('UPDATE gift_cards SET balance = balance + ? WHERE site_id = ? AND code = ? AND balance + ? <= ?', change, site.id, card.code, change, GIFT_MAX).changes) bad(400, `A card can hold up to ${money(GIFT_MAX)}. This one has ${money(card.balance)}.`);
      giftMove(site, card.code, 'load', change, paidWith, '', now);
      if (paidWith !== 'Complimentary') logMoney(site, { ...giftMoney(card.code, card.name), method: paidWith, amount: change, note: 'Gift card topped up', by: staffName(site, user), byId: user.id, at: now });
    } else {
      if (!db.run('UPDATE gift_cards SET balance = balance + ? WHERE site_id = ? AND code = ? AND balance + ? >= 0', change, site.id, card.code, change).changes) bad(400, `This card has ${money(db.get('SELECT balance FROM gift_cards WHERE site_id = ? AND code = ?', site.id, card.code).balance)} left.`);
      giftMove(site, card.code, 'spend', -change, '', '', now);
    }
    json(res, 200, { cards: giftsOf(site), loads: giftLoads(site) });
  });

  /* Recurring payments: a plan sends the customer a fresh invoice on a schedule. */
  const EVERY = { weekly: 7, biweekly: 14, monthly: 'm1', quarterly: 'm3', yearly: 'm12' };
  const plansOf = (site) => db.all('SELECT * FROM plans WHERE site_id = ? ORDER BY created_at DESC', site.id).map((r) => ({ id: r.id, name: r.name, customer: JSON.parse(r.customer), amount: r.amount, taxRate: r.tax_rate, every: r.every, nextDate: r.next_date, status: r.status, billed: r.billed }));
  // Weeks add days. Months keep the plan's day of the month, or the month's last day when it is shorter, so no month is skipped.
  const stepDate = (day, every, anchor = 0) => {
    const e = EVERY[every];
    if (typeof e === 'number') { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + e); return d.toISOString().slice(0, 10); }
    const [y, m, dd] = day.split('-').map(Number), first = new Date(Date.UTC(y, m - 1 + Number(e.slice(1)), 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(anchor || dd, last)).padStart(2, '0')}`;
  };
  const realDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
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
    if (!Object.hasOwn(EVERY, b.every)) bad(400, 'Choose how often to bill.');
    if (b.start !== undefined && b.start !== '' && !realDay(b.start)) bad(400, 'Choose a real date for the first invoice.');
    const start = b.start ? b.start : new Date(wallNow(orderingOf(site))).toISOString().slice(0, 10);
    const rate = Number(b.taxRate);
    db.run('INSERT INTO plans (id, site_id, name, customer, amount, tax_rate, every, next_date, anchor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', newId(), site.id, name, JSON.stringify(customer), amount, Number.isFinite(rate) ? Math.min(30, Math.max(0, rate)) : 0, b.every, start, Number(start.slice(8, 10)), Date.now());
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
      // Each plan on its own, with its next date worked out before anything is made, so a plan with bad data can never bill
      // again and again, or stop the others.
      let inv;
      try {
        if (!Object.hasOwn(EVERY, plan.every) || !realDay(plan.next_date)) throw new Error(`plan ${plan.id} has an unknown schedule`);
        let next = stepDate(plan.next_date, plan.every, plan.anchor); while (next <= today) next = stepDate(next, plan.every, plan.anchor);
        const customer = JSON.parse(plan.customer);
        const v = { customer, items: [{ name: plan.name, qty: 1, price: plan.amount, taxable: true }], notes: '', project: '', due: stepDate(today, 'weekly'), taxRate: plan.tax_rate, payUrl: '' };
        Object.assign(v, invoiceTotals(v.items, v.taxRate, 0));
        const invId = newId(), now = Date.now();
        db.raw.exec('BEGIN IMMEDIATE');
        try {
          const number = (db.get('SELECT MAX(number) AS n FROM invoices WHERE site_id = ?', site.id).n || 1000) + 1;
          db.run("INSERT INTO invoices (id, site_id, number, token, kind, status, customer, items, created_at, updated_at, sent_at) VALUES (?, ?, ?, ?, 'invoice', 'sent', ?, ?, ?, ?, ?)", invId, site.id, number, newId(18), '{}', '[]', now, now, now);
          saveInvoice(invId, v);
          db.run('UPDATE plans SET next_date = ?, billed = billed + ? WHERE id = ?', next, v.total, plan.id);
          db.raw.exec('COMMIT');
        } catch (e) { db.raw.exec('ROLLBACK'); throw e; }
        inv = { customer, row: toInvoice(ownInvoice(site, invId), fake, site) };
      } catch (e) { console.error('Recurring payment not billed:', e.message); continue; }
      const business = businessOf(site);
      Promise.resolve().then(() => mailer.send({ to: inv.customer.email, ...invoiceEmail({ business, invoice: inv.row, url: inv.row.url, lang: langOf(site) }), fromName: business.name, replyTo: business.email })).catch((e) => console.error('Plan invoice email failed:', e.message));
    }
  }
  recurring = billPlans;

  /* Appointments: customers ask for a time on the booking page; the business confirms or declines. */
  const toAppt = (r) => ({ id: r.id, employee: r.employee || '', total: r.total || 0, tax: r.tax || 0, paidAt: r.paid_at || null, paidMethod: r.paid_method || '', service: r.service, minutes: r.minutes, at: r.at, name: r.name, email: r.email, phone: r.phone, party: r.party, notes: r.notes, status: r.status, createdAt: r.created_at });
  const apptWhen = (at, lang = 'en') => new Date(`${at}:00Z`).toLocaleString(lang === 'es' ? 'es-US' : 'en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  function makeAppt(site, ordering, b, viaPublic) {
    const svc = ordering.booking.services.find((x) => x.id === b.service) || (viaPublic ? bad(400, 'Choose what you would like to book.') : { name: str(b.serviceName, 80).trim() || 'Booking', minutes: 0 });
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) ? b.date : bad(400, 'Choose a date.');
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.time)) ? b.time : bad(400, 'Choose a time.');
    const at = `${day}T${time}`, wall = Date.parse(`${at}:00Z`);
    const name = str(b.name, 120).trim(), email = str(b.email, 200).trim().toLowerCase(), phone = str(b.phone, 40).trim();
    if (!name) bad(400, 'Please add your name.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad(400, 'That email address does not look right.');
    if (viaPublic) {
      if (phone.replace(/\D/g, '').length < 7 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad(400, 'Please add your phone number and a valid email address.');
      const now = wallNow(ordering);
      if (!(wall > now)) bad(400, 'Please choose a time in the future.');
      if (wall > now + 90 * DAY) bad(400, 'Please choose a date in the next three months.');
      // Bookings always follow Business hours; the 'only take orders during business hours' switch is about online orders.
      const len = Math.max(30, svc.minutes || 0), hours = { ...ordering, useHours: true };
      if (!openAtWall(hours, wall)) bad(409, 'We are closed at that time. Please choose another.');
      if (!openAtWall(hours, wall + (len - 1) * 60000)) bad(409, 'That booking would run past closing time. Please choose an earlier time.');
      const startMin = Date.parse(`${at}:00Z`) / 60000;
      const overlapping = db.all("SELECT at, minutes FROM appointments WHERE site_id = ? AND substr(at, 1, 10) IN (?, ?) AND status IN ('pending','confirmed')", site.id, day, new Date(wall - DAY).toISOString().slice(0, 10))
        .filter((x) => { const s0 = Date.parse(`${x.at}:00Z`) / 60000; return s0 < startMin + len && startMin < s0 + Math.max(30, x.minutes || 0); }).length;
      if (overlapping >= ordering.booking.perSlot) bad(409, 'That time is fully booked. Please choose another.');
    }
    const id = newId();
    db.run('INSERT INTO appointments (id, site_id, service, minutes, at, name, email, phone, party, notes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, site.id, svc.name, svc.minutes, at, name, email, phone, Math.max(1, Math.min(100, Math.round(Number(b.party)) || 1)), str(b.notes, 500).trim(), viaPublic ? 'pending' : 'confirmed', Date.now());
    if (viaPublic) {
      if (svc.price > 0) db.run('UPDATE appointments SET total = ? WHERE id = ?', Math.round(svc.price), id);
      // A visitor can add themselves to Customers, but never change a customer the business already saved.
      if (!db.get('SELECT 1 FROM contacts WHERE site_id = ? AND email = ?', site.id, email)) keepContact(site.id, { name, company: '', email, phone, address: '', more: EMPTY_MORE });
    }
    if (!viaPublic) {
      const total = Math.max(0, Math.min(10000000, Math.round(Number(b.total)) || 0));
      const tax = Math.max(0, Math.min(total, Math.round(Number(b.tax)) || 0)), taxable = tax ? Math.max(0, Math.min(total - tax, Math.round(Number(b.taxable)) || total - tax)) : 0;
      db.run('UPDATE appointments SET employee_id = ?, tax = ?, taxable = ?, tax_rate = ? WHERE id = ?', idForName(site, b.employee), tax, taxable, tax ? Number(ordering.taxRate) || 0 : 0, id);
    }
    if (!viaPublic) db.run('UPDATE appointments SET employee = ?, total = ?, minutes = CASE WHEN ? > 0 THEN ? ELSE minutes END WHERE id = ?', str(b.employee, 80).trim(), Math.max(0, Math.min(10000000, Math.round(Number(b.total)) || 0)), Math.round(Number(b.minutes)) || 0, Math.max(0, Math.min(1440, Math.round(Number(b.minutes)) || 0)), id);
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
    const status = str((await readJson(req)).status, 20);
    if (!['pending', 'confirmed', 'completed', 'cancelled', 'noshow'].includes(status)) bad(400, 'Unknown status.');
    const row = db.get('SELECT * FROM appointments WHERE id = ? AND site_id = ?', p.appt, site.id) || bad(404, 'We could not find that appointment.');
    if (row.paid_at && ['cancelled', 'noshow'].includes(status)) bad(409, `This appointment has a payment of ${money(row.total)} recorded. Void it first.`);
    db.run('UPDATE appointments SET status = ? WHERE id = ?', status, row.id);
    // The customer is emailed at most once about each status, within the business's hourly cap.
    const told = row.mailed ? row.mailed.split(',') : [];
    if (status !== row.status && ['confirmed', 'cancelled'].includes(status) && row.email && !told.includes(status) && mailOk(site)) {
      db.run('UPDATE appointments SET mailed = ? WHERE id = ?', [...told, status].join(','), row.id); const business = businessOf(site); Promise.resolve().then(() => mailer.send({ to: row.email, ...bookingEmail(status, { business, appt: toAppt(row), when: apptWhen(row.at, langOf(site)), lang: langOf(site) }), fromName: business.name, replyTo: business.email })).catch((e) => console.error('Booking email failed:', e.message)); }
    json(res, 200, { appointment: toAppt(db.get('SELECT * FROM appointments WHERE id = ?', row.id)) });
  });

  // Recording what the customer paid for an appointment, or voiding it when it was recorded by mistake (a row with the amount negative).
  const APPT_TENDERS = ['Cash', 'Card', 'Online payment', 'Check', 'Other'];
  route('POST', '/api/sites/:id/appointments/:appt/payment', async (req, res, p) => {
    const { site, user, role } = ownSite(req, p.id, 'kitchen');
    const b = await readJson(req);
    const row = db.get('SELECT * FROM appointments WHERE id = ? AND site_id = ?', p.appt, site.id) || bad(404, 'We could not find that appointment.');
    if (b.void === true && role === 'kitchen') bad(403, 'Your login does not allow removing a payment. Ask a manager.');
    const now = Date.now(), by = staffName(site, user), byId = user.id, money1 = { source: 'Appointment', refId: row.id, ref: row.service || 'Booking', customer: row.name, by, byId, at: now };
    if (b.void === true) {
      if (!row.paid_at) bad(400, 'No payment is recorded for this appointment.');
      if (!db.run('UPDATE appointments SET paid_at = NULL, paid_method = \'\' WHERE id = ? AND paid_at = ?', row.id, row.paid_at).changes) bad(409, 'This appointment was just changed on another device. Refresh to see it.');
      logMoney(site, { ...money1, method: row.paid_method || 'Other', amount: -row.total, tax: -(row.tax || 0), note: 'Payment voided' });
    } else {
      const method = APPT_TENDERS.includes(b.method) ? b.method : bad(400, 'Choose how the customer paid.');
      if (['cancelled', 'noshow'].includes(row.status)) bad(400, 'This appointment did not go ahead, so there is nothing to pay.');
      if (!(row.total > 0)) bad(400, 'This appointment has no price to pay.');
      if (!db.run('UPDATE appointments SET paid_at = ?, paid_method = ? WHERE id = ? AND paid_at IS NULL', now, method, row.id).changes) bad(409, 'A payment is already recorded for this appointment.');
      logMoney(site, { ...money1, method, amount: row.total, tax: row.tax || 0 });
    }
    json(res, 200, { appointment: toAppt(db.get('SELECT * FROM appointments WHERE id = ?', row.id)) });
  });

  /* Staff schedule and time clock. */
  route('GET', '/api/sites/:id/shifts', (req, res, p, url) => {
    const { site } = ownSite(req, p.id, 'kitchen');
    // From a week before today by default, or from the week asked for, so earlier weeks can be looked back on.
    const asked = /^\d{4}-\d{2}-\d{2}$/.test(String(url.searchParams.get('from'))) ? url.searchParams.get('from') : '';
    const today = new Date(wallNow(orderingOf(site))).toISOString().slice(0, 10);
    const people = [db.get('SELECT name, email FROM users WHERE id = ?', site.user_id), ...teamOf(site)].map((u) => u.name || u.email);
    json(res, 200, { today, people, shifts: db.all('SELECT id, name, day, start, finish, note FROM shifts WHERE site_id = ? AND day >= ? ORDER BY day, start LIMIT 2000', site.id, asked && asked < today ? asked : new Date(Date.parse(`${today}T00:00:00Z`) - 7 * DAY).toISOString().slice(0, 10)) });
  });
  route('POST', '/api/sites/:id/shifts', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const b = await readJson(req);
    const ok = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t));
    if (!str(b.name, 80).trim()) bad(400, 'Choose who is working.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.day)) || !ok(b.start) || !ok(b.finish)) bad(400, 'Choose a day, a start time and an end time.');
    db.run('INSERT INTO shifts (id, site_id, name, user_id, day, start, finish, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', newId(), site.id, str(b.name, 80).trim(), idForName(site, b.name), b.day, b.start, b.finish, str(b.note, 120).trim());
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
    else { if (open) bad(400, 'You are already clocked in.'); db.run('INSERT INTO timeclock (id, site_id, user_id, name, in_at) VALUES (?, ?, ?, ?, ?)', newId(), site.id, user.id, staffName(site, user), Date.now()); }
    json(res, 200, clockOf(site, user));
  });
  // Managers correct or add time: who, when they started, and when they finished (empty while still working).
  const clockTimes = (b) => {
    const inAt = Number(b.inAt), outAt = b.outAt == null || b.outAt === '' ? null : Number(b.outAt);
    if (!Number.isFinite(inAt) || inAt <= 0) bad(400, 'Enter when the shift started.');
    if (outAt !== null && (!Number.isFinite(outAt) || outAt <= inAt)) bad(400, 'The finish time must be after the start time.');
    if (outAt !== null && outAt - inAt > 24 * 3600000) bad(400, 'A shift can be at most 24 hours.');
    return { inAt, outAt };
  };
  route('PUT', '/api/sites/:id/timeclock/:entry', async (req, res, p) => {
    const { site, user } = ownSite(req, p.id);
    const row = db.get('SELECT id FROM timeclock WHERE id = ? AND site_id = ?', p.entry, site.id) || bad(404, 'We could not find that entry.');
    const b = await readJson(req); const t = clockTimes(b); const name = str(b.name, 80).trim();
    db.run('UPDATE timeclock SET in_at = ?, out_at = ?, name = CASE WHEN ? = \'\' THEN name ELSE ? END, user_id = CASE WHEN ? = \'\' THEN user_id ELSE ? END WHERE id = ?', t.inAt, t.outAt, name, name, name, idForName(site, name), row.id);
    json(res, 200, clockOf(site, user));
  });
  route('POST', '/api/sites/:id/timeclock/entries', async (req, res, p) => {
    const { site, user } = ownSite(req, p.id);
    const b = await readJson(req); const t = clockTimes(b); const name = str(b.name, 80).trim() || bad(400, 'Enter who worked.');
    db.run('INSERT INTO timeclock (id, site_id, user_id, name, in_at, out_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), site.id, idForName(site, name), name, t.inAt, t.outAt);
    json(res, 201, clockOf(site, user));
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
    const { site, user } = ownSite(req, p.id);
    const raw = await readJson(req, 200_000);
    const v = cleanInvoice(raw, site);
    const id = newId(), now = Date.now();
    const number = (db.get('SELECT MAX(number) AS n FROM invoices WHERE site_id = ?', site.id).n || 1000) + 1;
    db.run('INSERT INTO invoices (id, site_id, number, token, kind, customer, items, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, site.id, number, newId(18), raw.kind === 'estimate' ? 'estimate' : 'invoice', '{}', '[]', now, now);
    saveInvoice(id, v);
    if (raw.paidMethod && raw.kind !== 'estimate') {
      // A counter sale is saved already paid, and its payment goes on the ledger like any other.
      const method = [...TENDERS, 'Bank transfer'].includes(str(raw.paidMethod, 40).trim()) ? str(raw.paidMethod, 40).trim() : 'Other', note = str(raw.paidNote, 300).trim();
      db.run("UPDATE invoices SET status = 'paid', paid_at = ?, paid_method = ?, paid_note = ?, sent_at = ? WHERE id = ?", now, method, note, now, id);
      const made = ownInvoice(site, id);
      logMoney(site, { ...invoiceMoney(made), method, amount: made.total, tax: made.tax, ...invoiceTax(made), note, by: staffName(site, user), byId: user.id, at: now });
    }
    if (raw.walkIn !== true) keepContact(site.id, v.customer);   // a counter sale with no customer picked is not added to Customers
    json(res, 201, { invoice: toInvoice(ownInvoice(site, id), req, site), invoices: invoicesOf(req, site), contacts: contactsOf(site.id) });
  });
  route('PUT', '/api/sites/:id/invoices/:inv', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const row = ownInvoice(site, p.inv);
    if (row.status === 'paid' || row.status === 'void') bad(409, 'A paid or cancelled invoice cannot be changed. Duplicate it instead.');
    // A save from a page that does not know about files or payment terms leaves them as they are.
    const raw = await readJson(req, 200_000);
    if (raw.attachments === undefined) raw.attachments = filesOf(row.attachments);
    if (raw.terms === undefined) raw.terms = row.terms;
    const v = cleanInvoice(raw, site, filesOf(row.attachments));
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
    await mailer.send({ to: inv.customer.email, ...invoiceEmail({ business, invoice: inv, url: inv.url, reminder, estimate: inv.kind === 'estimate', lang: langOf(site) }), fromName: business.name, replyTo: business.email || orderingOf(site).notifyEmail }).catch((e) => { console.error('Invoice email failed:', e.message); bad(502, 'We could not send that email just now. Please try again, or copy the link and send it yourself.'); });
    db.run("UPDATE invoices SET status = 'sent', sent_at = COALESCE(sent_at, ?), reminders = reminders + ?, updated_at = ? WHERE id = ?", Date.now(), reminder && mailer.enabled ? 1 : 0, Date.now(), row.id);
    json(res, 200, { invoice: toInvoice(ownInvoice(site, row.id), req, site), invoices: invoicesOf(req, site), emailed: !!mailer.enabled });
  });
  route('POST', '/api/sites/:id/invoices/:inv/status', async (req, res, p) => {
    const { site, user } = ownSite(req, p.id);
    const row = ownInvoice(site, p.inv);
    const b = await readJson(req);
    const now = Date.now(), by = staffName(site, user), byId = user.id;
    const v = ownInvoice(site, row.id), was = v.paid_method || 'Other';
    // Taking the payment back, or recording it as paid another way, moves exactly what the payment standing on the invoice carried.
    const standing = () => {
      const s = db.get("SELECT amount, tax, taxable, rate FROM money_log WHERE site_id = ? AND ref_id = ? AND source = 'Invoice' AND kind = 'payment' AND amount > 0 ORDER BY at DESC, rowid DESC LIMIT 1", site.id, v.id), t = invoiceTax(v);
      return s ? { amount: s.amount, tax: s.tax, taxable: s.taxable ?? t.taxable, rate: s.rate ?? t.rate } : { amount: v.total, tax: v.tax, ...t };
    };
    const reverse = (note) => { const s = standing(); logMoney(site, { ...invoiceMoney(v), method: was, amount: -s.amount, tax: -s.tax, taxable: -s.taxable, rate: s.rate, note, by, byId, at: now }); return s; };
    if (b.status === 'paid') {
      if (v.kind === 'estimate') bad(400, 'Convert this estimate to an invoice before taking payment.');
      if (v.status === 'void') bad(409, 'A cancelled invoice cannot be paid. Duplicate it instead.');
      const method = [...TENDERS, 'Bank transfer'].includes(str(b.method, 40).trim()) ? str(b.method, 40).trim() : 'Other', note = str(b.note, 300).trim();
      if (v.status !== 'paid') {
        db.run("UPDATE invoices SET status = 'paid', paid_at = ?, paid_method = ?, paid_note = ?, sent_at = COALESCE(sent_at, ?), updated_at = ? WHERE id = ?", now, method, note, now, now, v.id);
        logMoney(site, { ...invoiceMoney(v), method, amount: v.total, tax: v.tax, ...invoiceTax(v), note, by, byId, at: now });
      } else {
        // Already paid: the date it was paid stays. A different way of paying is recorded as the old way taken back and the new one added.
        db.run('UPDATE invoices SET paid_method = ?, paid_note = ?, updated_at = ? WHERE id = ?', method, note, now, v.id);
        if (method !== was) { const s = reverse(`Changed to ${method}`); logMoney(site, { ...invoiceMoney(v), method, amount: s.amount, tax: s.tax, taxable: s.taxable, rate: s.rate, note: `Changed from ${was}`, by, byId, at: now }); }
      }
    } else if (b.status === 'sent') {
      if (v.status === 'paid') reverse('Payment removed');
      db.run("UPDATE invoices SET status = 'sent', paid_at = NULL, paid_method = '', paid_note = '', sent_at = COALESCE(sent_at, ?), updated_at = ? WHERE id = ?", now, now, v.id);
    } else if (b.status === 'void') {
      if (v.status === 'paid') reverse('Invoice cancelled');
      db.run("UPDATE invoices SET status = 'void', paid_at = NULL, updated_at = ? WHERE id = ?", now, v.id);
    } else bad(400, 'Unknown status.');
    json(res, 200, { invoice: toInvoice(ownInvoice(site, row.id), req, site), invoices: invoicesOf(req, site) });
  });
  // An accepted estimate becomes an invoice, ready to send for payment.
  route('POST', '/api/sites/:id/invoices/:inv/convert', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const row = ownInvoice(site, p.inv);
    if (row.kind !== 'estimate') bad(400, 'This is already an invoice.');
    // How long an estimate was valid for is not how long the customer has to pay: an invoice starts due on receipt.
    db.run("UPDATE invoices SET kind = 'invoice', status = 'draft', sent_at = NULL, viewed_at = NULL, reminders = 0, terms = 'receipt', due = '', updated_at = ? WHERE id = ?", Date.now(), row.id);
    json(res, 200, { invoice: toInvoice(ownInvoice(site, row.id), req, site), invoices: invoicesOf(req, site) });
  });

  /* Projects: a larger job for one customer. Its invoices and estimates are filed under its name. */
  const PHASES = ['proposal', 'approved', 'in_progress', 'on_hold', 'completed', 'cancelled'];
  const toProject = (r) => ({ id: r.id, name: r.name, phase: r.phase, type: r.type, customer: JSON.parse(r.customer || '{}'), start: r.start, end: r.finish, notes: r.notes, attachments: JSON.parse(r.attachments || '[]'), createdAt: r.created_at, updatedAt: r.updated_at });
  const projectsOf = (siteId) => db.all('SELECT * FROM projects WHERE site_id = ? ORDER BY created_at DESC LIMIT 2000', siteId).map(toProject);
  const ownProject = (site, projId) => db.get('SELECT * FROM projects WHERE id = ? AND site_id = ?', str(projId, 40), site.id) || bad(404, 'That project was removed.');
  function cleanProject(b, site, keep = []) {
    const name = str(b?.name, 50).trim();
    if (!name) bad(400, 'Add a project name.');
    if (!PHASES.includes(b?.phase)) bad(400, 'Choose a phase.');
    const c = cleanContact(b?.customer);
    const start = realDay(b?.start) ? b.start : '', end = realDay(b?.end) ? b.end : '';
    if (start && end && end < start) bad(400, 'The end date is before the start date.');
    return { name, phase: b.phase, type: str(b?.type, 50).trim(), customer: c, who: JSON.stringify({ name: c.name, company: c.company, email: c.email, phone: c.phone, address: c.address }), start, end, notes: str(b?.notes, 1000).trim(), attachments: cleanFiles(b?.attachments, { most: 10, each: 10 * MB, site, keep }) };
  }
  const projectTaken = (siteId, name, except = '') => db.get('SELECT 1 FROM projects WHERE site_id = ? AND lower(name) = lower(?) AND id != ?', siteId, name, except);
  route('GET', '/api/sites/:id/projects', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    json(res, 200, { projects: projectsOf(site.id) });
  });
  route('POST', '/api/sites/:id/projects', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const v = cleanProject(await readJson(req, 100_000), site);
    if (projectTaken(site.id, v.name)) bad(409, 'You already have a project with that name.');
    if (db.get('SELECT COUNT(*) AS n FROM projects WHERE site_id = ?', site.id).n >= 2000) bad(400, 'You have reached the limit of 2,000 projects.');
    const id = newId(), now = Date.now();
    db.run('INSERT INTO projects (id, site_id, name, phase, type, customer, start, finish, notes, attachments, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, site.id, v.name, v.phase, v.type, v.who, v.start, v.end, v.notes, JSON.stringify(v.attachments), now, now);
    keepContact(site.id, v.customer);
    json(res, 201, { project: toProject(ownProject(site, id)), projects: projectsOf(site.id) });
  });
  route('PUT', '/api/sites/:id/projects/:proj', async (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const raw = await readJson(req, 100_000);
    const row = ownProject(site, p.proj);
    const v = cleanProject(raw, site, filesOf(row.attachments));
    if (projectTaken(site.id, v.name, row.id)) bad(409, 'You already have a project with that name.');
    db.raw.exec('BEGIN');
    try {
      db.run('UPDATE projects SET name = ?, phase = ?, type = ?, customer = ?, start = ?, finish = ?, notes = ?, attachments = ?, updated_at = ? WHERE id = ?', v.name, v.phase, v.type, v.who, v.start, v.end, v.notes, JSON.stringify(v.attachments), Date.now(), row.id);
      // Its invoices and estimates are filed under its name, so they follow a rename.
      if (v.name !== row.name) db.run('UPDATE invoices SET project = ? WHERE site_id = ? AND project = ?', v.name, site.id, row.name);
      db.raw.exec('COMMIT');
    } catch (e) { db.raw.exec('ROLLBACK'); throw e; }
    keepContact(site.id, v.customer);
    json(res, 200, { project: toProject(ownProject(site, row.id)), projects: projectsOf(site.id), invoices: invoicesOf(req, site) });
  });
  // Deleting a project keeps its invoices and estimates; they are no longer filed under it.
  route('DELETE', '/api/sites/:id/projects/:proj', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const row = db.get('SELECT id, name FROM projects WHERE id = ? AND site_id = ?', str(p.proj, 40), site.id);
    if (row) { db.run('DELETE FROM projects WHERE id = ?', row.id); db.run("UPDATE invoices SET project = '' WHERE site_id = ? AND project = ?", site.id, row.name); }
    json(res, 200, { projects: projectsOf(site.id), invoices: invoicesOf(req, site) });
  });

  /* Gift card balance changes, one row each, so loads, spending and cards given back can be reported. */
  function giftMove(site, code, kind, amount, method = '', orderId = '', at = Date.now()) {
    db.run('INSERT INTO gift_moves (id, site_id, code, kind, amount, method, order_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', newId(), site.id, code, kind, amount, method, orderId, at);
  }
  // Cancelling gives back what the order took: stock (never above a daily quantity that has refilled since), the gift card's part,
  // and a reward it used. A reward it earned and nobody used is withdrawn.
  function cancelled(site, o, by, now, byId = '') {
    const ordering = orderingOf(site), refilled = bizDay(ordering, o.created_at) !== bizDay(ordering, now);
    for (const l of JSON.parse(o.items)) {
      if (refilled) db.run('UPDATE menu_items SET stock = MIN(stock + ?, MAX(stock, COALESCE(restock, stock + ?))) WHERE id = ? AND site_id = ? AND stock IS NOT NULL', l.qty, l.qty, l.id, site.id);
      else db.run('UPDATE menu_items SET stock = stock + ? WHERE id = ? AND site_id = ? AND stock IS NOT NULL', l.qty, l.id, site.id);
    }
    if (o.gift > 0 && o.gift_code) {
      const back = o.gift - db.get("SELECT COALESCE(SUM(amount), 0) AS n FROM gift_moves WHERE site_id = ? AND order_id = ? AND kind = 'restore'", site.id, o.id).n;
      if (back > 0) {
        db.run('UPDATE gift_cards SET balance = balance + ? WHERE site_id = ? AND code = ?', back, site.id, o.gift_code);
        giftMove(site, o.gift_code, 'restore', back, '', o.id, now);
        db.run("UPDATE orders SET refunded = refunded + ?, refunded_at = ?, refund_note = 'Put back on the gift card' WHERE id = ?", back, now, o.id);
        const part = refundParts(site, o, back, 'Gift card');
        logMoney(site, { ...orderMoney(o), kind: 'refund', method: 'Gift card', amount: back, tax: part.tax, tip: part.tip, fee: part.fee, note: 'Order cancelled: put back on the gift card', by, byId, at: now });
      }
    }
    db.run('UPDATE rewards SET used_order = NULL WHERE site_id = ? AND used_order = ?', site.id, o.id);
    db.run('DELETE FROM rewards WHERE site_id = ? AND earned_order = ? AND used_order IS NULL', site.id, o.id);
  }
  // Every Nth completed order earns a one-time reward code for next time. Orders only placed, or cancelled, never count.
  function earnReward(site, o, now, req) {
    const ordering = orderingOf(site), L = ordering.loyalty;
    if (!L.enabled || db.get('SELECT 1 FROM rewards WHERE site_id = ? AND earned_order = ?', site.id, o.id)) return;
    const count = db.get("SELECT COUNT(*) AS n FROM orders WHERE site_id = ? AND lower(email) = lower(?) AND status = 'completed'", site.id, o.email).n;
    if (!(count > 0 && count % L.every === 0)) return;
    const code = `THANKS${randomBytes(4).toString('hex').toUpperCase()}`;
    db.run('INSERT INTO rewards (code, site_id, email, type, value, earned_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', code, site.id, o.email.toLowerCase(), L.type, L.value, o.id, now);
    // The customer hears about it, so the code is not only on a page they may never open again.
    if (req && mailOk(site)) {
      const business = businessOf(site), lang = JSON.parse(site.published || site.draft).lang || 'en';
      const msg = rewardEmail({ business: business.name, code, value: rewardText(L), lang, url: ordering.enabled && site.published ? `${siteUrl(req, site).replace(/\/$/, '')}/order` : '' });
      Promise.resolve().then(() => mailer.send({ to: o.email, ...msg, fromName: business.name, replyTo: business.email })).catch((e) => console.error('Reward email failed:', e.message));
    }
  }

  /* Payments taken at the counter are recorded here, so the books add up. Nothing is charged by this system. */
  const TENDERS = ['Cash', 'Card', 'Online payment', 'Check', 'Gift card', 'Other'];
  route('POST', '/api/sites/:id/orders/:order/payment', async (req, res, p) => {
    const { site, user, role } = ownSite(req, p.id, 'kitchen');
    const row = db.get('SELECT * FROM orders WHERE id = ? AND site_id = ?', p.order, site.id) || bad(404, 'We could not find that order.');
    const b = await readJson(req);
    const now = Date.now(), by = staffName(site, user), byId = user.id;
    // The order is read again now the body is here, so two taps at once can never record the same payment twice.
    const o = db.get('SELECT * FROM orders WHERE id = ?', row.id);
    // What was paid at the counter: the total, less any gift card the customer paid with when ordering.
    const due = o.total - (o.gift || 0), was = o.paid_method || 'Other';
    // Paid in full by a gift card, when ordering or at the counter.
    const viaCard = o.paid_method === 'Gift card' && !!o.gift_code;
    // A counter payment carries what is left of the order's tax, tip and delivery fee once the gift card's part taken when ordering
    // is counted. Taking it back, or recording it as paid another way, moves exactly what it carried.
    const rest = () => { const c = db.get("SELECT COALESCE(SUM(tax), 0) AS tax, COALESCE(SUM(tip), 0) AS tip, COALESCE(SUM(fee), 0) AS fee FROM money_log WHERE site_id = ? AND ref_id = ? AND source = 'Order' AND kind = 'payment'", site.id, o.id); return { tax: o.tax - c.tax, tip: o.tip - c.tip, fee: o.fee - c.fee }; };
    const standing = () => db.get("SELECT tax, tip, fee FROM money_log WHERE site_id = ? AND ref_id = ? AND source = 'Order' AND kind = 'payment' AND amount > 0 ORDER BY at DESC, rowid DESC LIMIT 1", site.id, o.id) || { tax: o.tax, tip: o.tip, fee: o.fee };
    const reverse = (note) => { const s = standing(); logMoney(site, { ...orderMoney(o), method: was, amount: -due, tip: -s.tip, tax: -s.tax, fee: -s.fee, note, by, byId, at: now }); return s; };
    if (b.refund !== undefined) {
      if (role === 'kitchen') bad(403, 'Your login does not allow refunds. Ask a manager.');
      if (!o.paid_at) bad(400, 'This order has no payment recorded, so there is nothing to refund.');
      const amount = Math.round(Number(b.refund));
      // A refund goes back the way the money came: onto the gift card that paid, or to the counter tender for the part paid there.
      const most = (viaCard ? o.total : o.total - o.gift) - o.refunded;
      if (!(amount > 0) || amount > most) bad(400, most > 0 ? `Enter an amount up to ${money(most)}.` : 'There is nothing left to refund on this order.');
      const note = str(b.note, 300).trim();
      db.run('UPDATE orders SET refunded = refunded + ?, refund_note = ?, refunded_at = ?, updated_at = ? WHERE id = ?', amount, note, now, now, o.id);
      if (viaCard) { db.run('UPDATE gift_cards SET balance = balance + ? WHERE site_id = ? AND code = ?', amount, site.id, o.gift_code); giftMove(site, o.gift_code, 'restore', amount, '', o.id, now); }
      const part = refundParts(site, o, amount, viaCard ? 'Gift card' : was);
      logMoney(site, { ...orderMoney(o), kind: 'refund', method: viaCard ? 'Gift card' : was, amount, tax: part.tax, tip: part.tip, fee: part.fee, note: note || (viaCard ? 'Put back on the gift card' : ''), by, byId, at: now });
    } else if (b.clear === true) {
      if (role === 'kitchen') bad(403, 'Your login does not allow removing a payment. Ask a manager.');
      if (viaCard) bad(400, 'This order was paid with a gift card. Refund it to the card, or cancel the order to give the card its balance back.');
      if (o.refunded) bad(400, 'This payment has a refund against it and cannot be removed.');
      if (!o.paid_at) bad(400, 'This order has no payment recorded.');
      db.run("UPDATE orders SET paid_at = NULL, paid_method = '', updated_at = ? WHERE id = ?", now, o.id);
      // The payment stays on record, with a row taking it back, so a batch already closed out keeps its figures.
      reverse('Payment removed');
    } else {
      const method = TENDERS.includes(b.method) ? b.method : bad(400, 'Choose how the customer paid.');
      // A cancelled order has given its money back, so a payment recorded from a screen that had not caught up is refused.
      if (o.status === 'cancelled') bad(409, 'This order was cancelled, so no payment can be recorded for it.');
      if (role === 'kitchen' && o.paid_at && method !== o.paid_method) bad(403, 'Your login does not allow changing a payment. Ask a manager.');
      if (method === 'Gift card' && !o.paid_at) {
        // Paid at the counter with a gift card: the card has to cover what is due, and pays it now.
        const code = str(b.giftCode, 24).toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!code) bad(400, 'Enter the gift card code.');
        if (o.gift_code && o.gift_code !== code) bad(400, 'This order already used another gift card. Take the rest another way.');
        const card = db.get('SELECT balance FROM gift_cards WHERE site_id = ? AND code = ?', site.id, code) || bad(404, 'We could not find that gift card.');
        if (!db.run('UPDATE gift_cards SET balance = balance - ? WHERE site_id = ? AND code = ? AND balance >= ?', due, site.id, code, due).changes) bad(409, `This card has ${money(card.balance)} left, and ${money(due)} is due.`);
        giftMove(site, code, 'spend', due, '', o.id, now);
        db.run("UPDATE orders SET gift = gift + ?, gift_code = ?, paid_at = ?, paid_method = 'Gift card', handled_by_id = CASE WHEN handled_by = '' THEN ? ELSE handled_by_id END, handled_by = CASE WHEN handled_by = '' THEN ? ELSE handled_by END, updated_at = ? WHERE id = ?", due, code, now, byId, by, now, o.id);
        logMoney(site, { ...orderMoney(o), method: 'Gift card', amount: due, ...rest(), note: `Card …${code.slice(-4)}`, by, byId, at: now });
      } else if (!o.paid_at) {
        db.run('UPDATE orders SET paid_at = ?, paid_method = ?, handled_by_id = CASE WHEN handled_by = \'\' THEN ? ELSE handled_by_id END, handled_by = CASE WHEN handled_by = \'\' THEN ? ELSE handled_by END, updated_at = ? WHERE id = ?', now, method, byId, by, now, o.id);
        logMoney(site, { ...orderMoney(o), method, amount: due, ...rest(), by, byId, at: now });
      } else if (method !== o.paid_method) {
        if (viaCard || method === 'Gift card') bad(400, 'A gift card payment cannot be swapped for another tender. Refund it, then record the payment again.');
        if (o.refunded) bad(400, 'This payment has a refund against it, so how it was paid cannot be changed.');
        // The date it was paid stays. The change is recorded as the old way taken back and the new way added.
        db.run('UPDATE orders SET paid_method = ?, updated_at = ? WHERE id = ?', method, now, o.id);
        const s = reverse(`Changed to ${method}`);
        logMoney(site, { ...orderMoney(o), method, amount: due, tip: s.tip, tax: s.tax, fee: s.fee, note: `Changed from ${was}`, by, byId, at: now });
      }
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
    else if (range === 'last7') from = shift(today, -6);
    else if (range === 'month') from = `${today.slice(0, 8)}01`;
    else if (range === 'last30') from = shift(today, -29);
    else if (range === 'custom') { const f = url.searchParams.get('from'), t = url.searchParams.get('to'); if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(t))) bad(400, 'Choose a start and end date.'); [from, to] = f <= t ? [f, t] : [t, f]; }
    const lo = Date.parse(`${from}T00:00:00Z`) - 2 * DAY, hi = Date.parse(`${to}T00:00:00Z`) + 3 * DAY;
    return { range, from, to, today, lo, hi, within: (ms) => { const d = dayOf(ms); return d >= from && d <= to; }, dayOf, timeOf: (ms) => { const w = new Date(wallNow(ordering, ms)); return `${String(w.getUTCHours()).padStart(2, '0')}:${String(w.getUTCMinutes()).padStart(2, '0')}`; } };
  }
  // Every recorded payment and refund between two moments: orders paid at the counter and invoices marked paid.
  /* The money ledger. Rows are only ever added: a payment taken back or paid another way adds a row with the amount negative. */
  function logMoney(site, x) {
    db.run('INSERT INTO money_log (id, site_id, kind, source, ref_id, ref, customer, channel, method, amount, tip, tax, fee, taxable, rate, note, by_name, by_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      newId(), site.id, x.kind || 'payment', x.source, x.refId || '', x.ref || '', str(x.customer, 120), x.channel || '', x.method || 'Other', Math.round(x.amount), x.tip || 0, x.tax || 0, x.fee || 0, x.taxable ?? null, x.rate ?? null, str(x.note, 300), str(x.by, 120), x.byId || '', x.at || Date.now());
  }
  // What a refund gave back of the order's tax, tip and delivery fee. The refund that gives back the last of the order's money gives
  // back exactly what is left of them, whatever earlier refunds took. Any other takes a share, on the running refunded total, of
  // what was taken the way it goes back (the gift card's part, or what was paid at the counter). An order whose gift card part
  // carries none of the order's tax, tip and fee (recorded before card parts carried their share) is shared on its payments as a
  // whole, as it always was. The rest is sales. The Taxes report shares refunded sales by the same rules.
  const refundParts = (site, o, amount, method) => {
    const sums = (kind, w = '') => db.get(`SELECT COALESCE(SUM(amount), 0) AS a, COALESCE(SUM(tax), 0) AS t, COALESCE(SUM(tip), 0) AS p, COALESCE(SUM(fee), 0) AS f FROM money_log WHERE site_id = ? AND ref_id = ? AND source = 'Order' AND kind = ? ${w}`, site.id, o.id, kind);
    const CARD = "AND method = 'Gift card'", COUNTER = "AND method <> 'Gift card'", paid = sums('payment'), back = sums('refund');
    let tax, tip, fee;
    if (back.a + amount >= paid.a) [tax, tip, fee] = [paid.t - back.t, paid.p - back.p, paid.f - back.f];
    else {
      const card = sums('payment', CARD), counter = sums('payment', COUNTER), w = method === 'Gift card' ? CARD : COUNTER;
      const whole = !(card.a > 0 && counter.a > 0) || (card.t + card.p + card.f === 0 && paid.t + paid.p + paid.f > 0);
      const [p, b] = whole ? [paid, back] : [sums('payment', w), sums('refund', w)];
      const now = p.a > 0 ? [Math.round(((b.a + amount) * p.t) / p.a), Math.round(((b.a + amount) * p.p) / p.a), Math.round(((b.a + amount) * p.f) / p.a)] : [0, 0, 0];
      // Never below nothing, and never more than the refund itself: what does not fit, or what an earlier refund gave back too
      // much of, waits for a later refund. The last one settles exactly what is left.
      [tax, tip, fee] = [now[0] - b.t, now[1] - b.p, now[2] - b.f].map((x) => Math.max(0, x));
      let over = tax + tip + fee - Math.max(0, amount);
      if (over > 0) { const x = Math.min(fee, over); fee -= x; over -= x; }
      if (over > 0) { const x = Math.min(tip, over); tip -= x; over -= x; }
      if (over > 0) tax -= Math.min(tax, over);
    }
    return { sales: amount - tax - tip - fee, tax, tip, fee };
  };
  const orderMoney = (o) => ({ source: 'Order', refId: o.id, ref: `#${o.number}`, customer: o.name, channel: o.method });
  const invoiceMoney = (v) => { let name = ''; try { name = JSON.parse(v.customer).name || ''; } catch { /* blank */ } return { source: 'Invoice', refId: v.id, ref: `INV-${v.number}`, customer: name }; };
  // An invoice's ledger rows keep the taxable part of its sales and its rate as they were when the row was written, so changing or
  // deleting the invoice later never restates a day already reported. A row taking a payment back carries them negated.
  const invoiceTax = (v, k = 1) => {
    // The discount comes off what was sold only; a service charge line is neither discounted nor taxed.
    const lines = JSON.parse(v.items || '[]'), amount = (l) => Math.round(l.price * l.qty);
    const goods = lines.reduce((a, l) => a + (l.charge ? 0 : amount(l)), 0), taxed = lines.reduce((a, l) => a + (l.charge || l.taxable === false ? 0 : amount(l)), 0), net = goods - v.discount;
    return { taxable: k * (goods ? Math.max(0, Math.min(net, Math.round((net * taxed) / goods))) : 0), rate: Number(v.tax_rate) || 0 };
  };
  function moneyMoves(site, lo, hi) {
    const payments = [], refunds = [];
    for (const r of db.all('SELECT * FROM money_log WHERE site_id = ? AND at >= ? AND at < ? ORDER BY at, rowid', site.id, lo, hi)) {
      const x = { id: r.id, at: r.at, source: r.source, ref: r.ref, refId: r.ref_id, customer: r.customer, channel: r.channel, method: r.method, amount: r.amount, tip: r.tip, tax: r.tax, fee: r.fee, taxable: r.taxable, rate: r.rate, note: r.note, by: r.by_name };
      (r.kind === 'refund' ? refunds : payments).push(x);
    }
    return { payments, refunds };
  }
  // A row taking a payment back counts as minus one payment, so counts and amounts stay true after a change.
  const tally = ({ payments, refunds }) => {
    const tenders = new Map();
    const of = (m) => tenders.get(m) || tenders.set(m, { method: m, count: 0, amount: 0, refunds: 0 }).get(m);
    for (const x of payments) { const t = of(x.method); t.count += Math.sign(x.amount); t.amount += x.amount; }
    for (const x of refunds) of(x.method).refunds += x.amount;
    const paid = payments.reduce((a, x) => a + x.amount, 0), back = refunds.reduce((a, x) => a + x.amount, 0);
    return { tenders: [...tenders.values()].filter((t) => t.count || t.amount || t.refunds).sort((a, b) => b.amount - a.amount), totals: { payments: paid, count: payments.reduce((a, x) => a + Math.sign(x.amount), 0), refunds: back, refundCount: refunds.length, net: paid - back } };
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
    db.run('INSERT INTO cash_log (id, site_id, kind, amount, note, by_name, by_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', newId(), site.id, b.kind === 'out' ? 'out' : 'in', amount, str(b.note, 200).trim(), staffName(site, user), user.id, Date.now());
    json(res, 201, { ok: true });
  });
  route('DELETE', '/api/sites/:id/cash/:entry', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    const entry = db.get('SELECT created_at FROM cash_log WHERE id = ? AND site_id = ?', p.entry, site.id) || bad(404, 'That entry was already removed.');
    const closed = db.get('SELECT MAX(created_at) AS at FROM closeouts WHERE site_id = ?', site.id).at;
    if (closed && entry.created_at < closed) bad(409, 'That entry is part of a batch that was already closed out, so it stays on record.');
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
    db.run('INSERT INTO closeouts (id, site_id, number, from_at, created_at, by_name, totals) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), site.id, open.number, open.since, Date.now(), staffName(site, user), JSON.stringify({ ...open.totals, tenders: open.tenders, paidIn: open.paidIn, paidOut: open.paidOut }));
    json(res, 201, { ok: true });
  });

  route('DELETE', '/api/sites/:id/invoices/:inv', (req, res, p) => {
    const { site } = ownSite(req, p.id);
    if (db.get("SELECT 1 FROM invoices WHERE id = ? AND site_id = ? AND status = 'paid'", p.inv, site.id)) bad(409, 'A paid invoice stays in your records. Undo the payment first if it was recorded by mistake.');
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
    const made = cleanItem(await readJson(req));
    made.category = canonCategory(site, made.category);
    insertItems(site.id, [made]);
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
    const b = await readJson(req);
    const prev = db.get('SELECT * FROM menu_items WHERE id = ? AND site_id = ?', p.item, site.id) || bad(404, 'That item no longer exists.');
    // Saving an item never writes back an old stock count: the count changes only when the person changed it (stockWas is what
    // they last saw), and only if nothing sold since then. Otherwise every edit would undo the sales made while the page was open.
    let body = b;
    if (b.stock !== undefined) {
      const seen = b.stockWas === undefined || b.stockWas === null || b.stockWas === '' ? null : Math.round(Number(b.stockWas));
      const want = Math.max(0, Math.min(999999, Math.round(Number(b.stock)) || 0));
      if (seen === null || want === seen) body = { ...b, stock: undefined };
      else if ((prev.stock ?? 0) !== seen) return json(res, 409, { error: `${prev.name} sold while you were editing. It has ${prev.stock ?? 0} left now.`, stock: prev.stock ?? 0 });
    }
    const it = cleanItem(body, prev);
    it.category = canonCategory(site, it.category);
    db.run('UPDATE menu_items SET category = ?, name = ?, price = ?, description = ?, image = ?, available = ?, taxable = ?, sale = ?, stock = ?, restock = ?, options = ?, mods = ?, label = ?, revclass = ?, cost = ? WHERE id = ?', it.category, it.name, it.price, it.description, it.image, it.available, it.taxable, it.sale, it.stock, it.restock, it.options, it.mods, it.label, it.revclass, it.cost, prev.id);
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
    const { site: asked } = ownSite(req, p.id);
    const b = await readJson(req);
    const site = db.get('SELECT * FROM sites WHERE id = ?', asked.id) || bad(404, 'That site no longer exists.');
    const from = str(b.from, 60).trim(), to = str(b.to, 60).trim();
    if (!from || !to) bad(400, 'Give the category a name.');
    const o = orderingOf(site);
    // Renaming onto another category's name would merge the two and lose its settings.
    const taken = new Set([...db.all('SELECT DISTINCT category FROM menu_items WHERE site_id = ?', site.id).map((r) => r.category), ...o.cats.map((c) => c.name)].map((n) => n.toLowerCase()));
    if (to.toLowerCase() !== from.toLowerCase() && taken.has(to.toLowerCase())) bad(409, 'That category already exists.');
    db.run('UPDATE menu_items SET category = ? WHERE site_id = ? AND category = ?', to, site.id, from);
    o.cats = o.cats.filter((c) => c.name !== to).map((c) => (c.name === from ? { ...c, name: to } : c));
    // Menus and timed prices follow the new name.
    o.menus = o.menus.map((m2) => ({ ...m2, cats: [...new Set(m2.cats.map((c) => (c === from ? to : c)))] }));
    o.deals = o.deals.map((x) => (x.category === from ? { ...x, category: to } : x));
    db.run('UPDATE sites SET ordering = ? WHERE id = ?', JSON.stringify(normalizeOrdering(o)), site.id);
    const saved = db.get('SELECT * FROM sites WHERE id = ?', site.id);
    json(res, 200, { items: menuOf(site.id), ordering: orderingOf(saved), orderingRev: revOf(saved.ordering) });
  });

  // Deletes a category. Every item needs one, so its items move to the category chosen. Menus that listed it just lose it, and a
  // happy hour for it is switched off, so no other item changes price or when it can be ordered.
  route('POST', '/api/sites/:id/menu/category/delete', async (req, res, p) => {
    const { site: asked } = ownSite(req, p.id);
    const b = await readJson(req);
    const site = db.get('SELECT * FROM sites WHERE id = ?', asked.id) || bad(404, 'That site no longer exists.');
    const name = str(b.name, 60).trim(), o = orderingOf(site);
    const n = name ? db.get('SELECT COUNT(*) AS n FROM menu_items WHERE site_id = ? AND category = ?', site.id, name).n : 0;
    if (!name || (!n && !o.cats.some((c) => c.name === name))) bad(404, 'We could not find that category.');
    let to = '';
    if (n) {
      to = canonCategory(site, str(b.to, 60));
      if (!to || to === name) bad(400, 'Choose the category its items move to.');
      db.run('UPDATE menu_items SET category = ? WHERE site_id = ? AND category = ?', to, site.id, name);
    }
    o.cats = o.cats.filter((c) => c.name !== name);
    o.menus = o.menus.map((m2) => ({ ...m2, cats: m2.cats.filter((c) => c !== name) }));
    o.deals = o.deals.map((x) => (x.category === name ? { ...x, active: false } : x));
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
    limit(`push:${user.id}`, 30, 3600000);
    db.run('INSERT INTO push_subs (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at, fails = 0', endpoint, user.id, p256dh, auth, Date.now());
    // Ten devices a person; the one used longest ago drops off.
    db.run('DELETE FROM push_subs WHERE user_id = ? AND endpoint NOT IN (SELECT endpoint FROM push_subs WHERE user_id = ? ORDER BY created_at DESC LIMIT 10)', user.id, user.id);
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
    if (set.sale !== undefined && !(Number.isInteger(Number(set.sale)) && Number(set.sale) >= 0 && Number(set.sale) <= 90)) bad(400, 'Enter a whole percent from 0 to 90.');
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
        if (typeof set.color === 'string') db.run('UPDATE menu_items SET color = ? WHERE id = ?', /^#[0-9a-f]{6}$/i.test(set.color) ? set.color.toLowerCase() : '', row.id);
        if (typeof set.addMod === 'string' || typeof set.removeMod === 'string') { const cur = (row.mods ? JSON.parse(row.mods) : []).filter((x) => x !== set.removeMod && x !== set.addMod); if (typeof set.addMod === 'string') cur.push(str(set.addMod, 24)); db.run('UPDATE menu_items SET mods = ? WHERE id = ?', JSON.stringify(cur.slice(0, 30)), row.id); }
        if (set.sale !== undefined) db.run('UPDATE menu_items SET sale = ? WHERE id = ?', num(set.sale, 0, 90), row.id);
        if (str(set.category, 60).trim()) db.run('UPDATE menu_items SET category = ? WHERE id = ?', canonCategory(site, str(set.category, 60)), row.id);
        if (set.pricePercent !== undefined) { const pct = Math.max(-90, Math.min(500, Number(set.pricePercent) || 0)); db.run('UPDATE menu_items SET price = ? WHERE id = ?', Math.max(0, Math.min(100_000_00, Math.round((row.price * (100 + pct)) / 100))), row.id); }
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
    const allRows = db.all('SELECT * FROM orders WHERE site_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at', site.id, Date.parse(`${prevFrom}T00:00:00Z`) - 2 * DAY, Date.parse(`${to}T00:00:00Z`) + 3 * DAY).map(toOrder);
    const onlyType = str(url.searchParams.get('type'), 20), rows = onlyType ? allRows.filter((o) => o.method === onlyType) : allRows;
    const catOf = Object.fromEntries(db.all('SELECT id, category FROM menu_items WHERE site_id = ?', site.id).map((r) => [r.id, r.category]));
    const blank = () => ({ orders: 0, gross: 0, discounts: 0, net: 0, tax: 0, fees: 0, tips: 0, total: 0, taxable: 0, nontaxable: 0, units: 0, refunds: 0, collected: 0, itemDiscounts: 0, itemDiscountLines: 0, rates: new Map() });
    const add = (t, o) => {
      const taxableLines = o.items.reduce((a, l) => a + (l.taxable === false ? 0 : l.price * l.qty), 0);
      const taxable = o.subtotal ? Math.round(taxableLines - (o.discount * taxableLines) / o.subtotal) : 0;
      t.orders++; t.gross += o.subtotal; t.discounts += o.discount; t.net += o.subtotal - o.discount; t.tax += o.tax; t.fees += o.fee; t.tips += o.tip; t.total += o.total;
      t.taxable += taxable; t.nontaxable += o.subtotal - o.discount - taxable; t.units += o.items.reduce((a, l) => a + l.qty, 0); if (o.paidAt) t.collected += o.total;
      t.itemDiscounts += o.items.reduce((a, l) => a + (l.list > l.price ? (l.list - l.price) * l.qty : 0), 0); t.itemDiscountLines += o.items.filter((l) => l.list > l.price).length;
      const rate = o.taxRate ?? ordering.taxRate ?? 0, r = t.rates.get(rate) || t.rates.set(rate, { rate, taxable: 0, nontaxable: 0, tax: 0, orders: 0 }).get(rate);
      r.taxable += taxable; r.nontaxable += o.subtotal - o.discount - taxable; r.tax += o.tax; r.orders++;
    };
    const totals = blank(), prev = blank();
    const byHour = days === 1;
    const series = new Map();
    if (byHour) for (let h = 0; h < 24; h++) series.set(String(h).padStart(2, '0'), { key: String(h).padStart(2, '0'), orders: 0, gross: 0, net: 0, tax: 0, tips: 0, collected: 0, types: {}, paid: {} });
    else for (let i = 0; i < days; i++) { const d = shift(from, i); series.set(d, { key: d, orders: 0, gross: 0, net: 0, tax: 0, tips: 0, collected: 0 }); }
    const methods = new Map(Object.keys(ORDER_METHODS).map((m) => [m, { method: m, orders: 0, net: 0, total: 0 }]));
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
      if (s1) { s1.orders++; s1.gross += o.subtotal; s1.net += o.subtotal - o.discount; s1.tax += o.tax; s1.tips += o.tip; if (s1.types) { const ty = s1.types[o.method] ||= { orders: 0, net: 0, total: 0 }; ty.orders++; ty.net += o.subtotal - o.discount; ty.total += o.total; } }
      bump(staff, o.handledBy || 'Not recorded', o); bump(tenders, o.paidAt ? o.paidMethod || 'Other' : 'Not paid yet', o);
      if (o.discount) { const pk = o.promo || 'Other discount'; const pr = promos.get(pk) || promos.set(pk, { name: pk, uses: 0, amount: 0 }).get(pk); pr.uses++; pr.amount += o.discount; }
      for (const l of o.items) if (l.list > l.price) { const pk = `item:${l.deal || 'Sale'}`; const pr = promos.get(pk) || promos.set(pk, { name: l.deal || 'Sale', uses: 0, amount: 0, item: true }).get(pk); pr.uses++; pr.amount += (l.list - l.price) * l.qty; }
      const m = methods.get(o.method) || methods.set(o.method, { method: o.method, orders: 0, net: 0, total: 0 }).get(o.method);
      m.orders++; m.net += o.subtotal - o.discount; m.total += o.total;
      let left = o.discount;
      o.items.forEach((l, i) => {
        const gross = l.price * l.qty, off = i === o.items.length - 1 ? left : o.subtotal ? Math.round((o.discount * gross) / o.subtotal) : 0;
        left -= off;
        const sale = gross - off, category = catOf[l.id] || 'No longer on the menu';
        const it = items.get(l.name) || items.set(l.name, { name: l.name, category, qty: 0, sales: 0 }).get(l.name);
        it.qty += l.qty; it.sales += sale;
        const c = cats.get(category) || cats.set(category, { name: category, qty: 0, sales: 0 }).get(category);
        c.qty += l.qty; c.sales += sale;
        const rk = l.rev || 'No revenue class'; const rv = revs.get(rk) || revs.set(rk, { name: rk, qty: 0, sales: 0 }).get(rk); rv.qty += l.qty; rv.sales += sale;
      });
    }
    // Money moves over both periods, read once from the ledger. With an order type chosen, only that type's order money counts.
    const mv = moneyMoves(site, Date.parse(`${prevFrom}T00:00:00Z`) - 2 * DAY, Date.parse(`${to}T00:00:00Z`) + 3 * DAY);
    const within = (ms) => { const d = dayOf(ms); return d >= from && d <= to; };
    const ofType = (x) => !onlyType || (x.source === 'Order' && x.channel === onlyType);
    // Refunds count on the day they were made, against the order they belong to, unless it was cancelled (its sales are not counted either).
    // They come off net sales and the total everywhere, so the rows of every report add up.
    const refunds = mv.refunds.filter((x) => x.source === 'Order' && ofType(x));
    // What each order had already had refunded before each refund row, so its shares are worked out on the running total.
    const refundedBefore = new Map();
    if (refunds.length) {
      const run = new Map();
      for (const r of db.all("SELECT id, ref_id, amount, tax, tip, fee FROM money_log WHERE site_id = ? AND kind = 'refund' AND source = 'Order' AND ref_id IN (SELECT value FROM json_each(?)) ORDER BY at, rowid", site.id, JSON.stringify([...new Set(refunds.map((x) => x.refId))]))) {
        const was = run.get(r.ref_id) || 0; refundedBefore.set(r.id, was); run.set(r.ref_id, was + r.amount - r.tax - r.tip - r.fee);
      }
    }
    const refOrders = new Map(refunds.length ? db.all('SELECT id, status, method, handled_by, paid_at, paid_method, subtotal, discount, tax, tip, fee, total, items, tax_rate FROM orders WHERE site_id = ? AND id IN (SELECT value FROM json_each(?))', site.id, JSON.stringify([...new Set(refunds.map((x) => x.refId))])).map((o) => [o.id, o]) : []);
    for (const x of refunds) {
      const o = refOrders.get(x.refId);
      if (!o || o.status === 'cancelled') continue;
      // The refunded sales come off Net sales; the tax, tip and delivery fee given back come off their own lines, so every row still adds up.
      const part = { tax: x.tax || 0, tip: x.tip || 0, fee: x.fee || 0 }, day = dayOf(x.at);
      part.sales = x.amount - part.tax - part.tip - part.fee;
      if (day >= prevFrom && day <= prevTo) { prev.refunds += part.sales; prev.net -= part.sales; prev.tax -= part.tax; prev.total -= x.amount; }
      if (day < from || day > to) continue;
      totals.refunds += part.sales; totals.net -= part.sales; totals.tax -= part.tax; totals.tips -= part.tip; totals.fees -= part.fee; totals.total -= x.amount;
      const lines = JSON.parse(o.items || '[]'), taxedLines = lines.reduce((a, l) => a + (l.taxable === false ? 0 : l.price * l.qty), 0), net0 = o.subtotal - o.discount;
      const taxable0 = o.subtotal ? Math.round(taxedLines - (o.discount * taxedLines) / o.subtotal) : 0, pre = refundedBefore.get(x.id) || 0;
      const cumTaxable = (v) => (net0 ? Math.round((v * taxable0) / net0) : 0), taxablePart = cumTaxable(pre + part.sales) - cumTaxable(pre);
      totals.taxable -= taxablePart; totals.nontaxable -= part.sales - taxablePart;
      // The refunded sales come off the items they were for, in proportion, so Item sales, categories and revenue classes add up to net sales.
      // Shares are taken on the order's running refunded total, so an order refunded in parts ends exactly at zero on every line.
      const lineCum = (v) => { let left = v, leftD = o.discount; return lines.map((l, i) => { const g = l.price * l.qty, last = i === lines.length - 1, off = last ? leftD : o.subtotal ? Math.round((o.discount * g) / o.subtotal) : 0; leftD -= off; const a = last ? left : net0 ? Math.round((v * (g - off)) / net0) : 0; left -= a; return a; }); };
      const was = lineCum(pre), now = lineCum(pre + part.sales);
      lines.forEach((l, i) => {
        const back = now[i] - was[i];
        const category = catOf[l.id] || 'No longer on the menu';
        (items.get(l.name) || items.set(l.name, { name: l.name, category, qty: 0, sales: 0 }).get(l.name)).sales -= back;
        (cats.get(category) || cats.set(category, { name: category, qty: 0, sales: 0 }).get(category)).sales -= back;
        const rk = l.rev || 'No revenue class'; (revs.get(rk) || revs.set(rk, { name: rk, qty: 0, sales: 0 }).get(rk)).sales -= back;
      });
      const s1 = series.get(byHour ? String(new Date(wall(x.at)).getUTCHours()).padStart(2, '0') : day);
      if (s1) { s1.net -= part.sales; s1.tax -= part.tax; s1.tips -= part.tip; if (s1.types) { const ty = s1.types[o.method] ||= { orders: 0, net: 0, total: 0 }; ty.net -= part.sales; ty.total -= x.amount; } }
      const m = methods.get(o.method) || methods.set(o.method, { method: o.method, orders: 0, net: 0, total: 0 }).get(o.method);
      m.net -= part.sales; m.total -= x.amount;
      const who = o.handled_by || 'Not recorded', e = staff.get(who) || staff.set(who, { name: who, orders: 0, net: 0, tips: 0, total: 0 }).get(who);
      e.net -= part.sales; e.tips -= part.tip; e.total -= x.amount;
      const tk = o.paid_at ? o.paid_method || 'Other' : 'Not paid yet', tr = tenders.get(tk) || tenders.set(tk, { name: tk, orders: 0, net: 0, tips: 0, total: 0 }).get(tk);
      tr.net -= part.sales; tr.tips -= part.tip; tr.total -= x.amount;
    }
    const paidNow = mv.payments.filter((x) => within(x.at) && ofType(x));
    const hourOf = (ms) => series.get(byHour ? String(new Date(wall(ms)).getUTCHours()).padStart(2, '0') : dayOf(ms));
    for (const x of paidNow) { const s1 = hourOf(x.at); if (s1) { s1.collected += x.amount; if (s1.paid) { const m = s1.paid[x.method] ||= { count: 0, amount: 0, refunds: 0 }; m.count += Math.sign(x.amount); m.amount += x.amount; } } }
    for (const x of mv.refunds.filter((y) => within(y.at) && ofType(y))) { const s1 = hourOf(x.at); if (s1 && s1.paid) (s1.paid[x.method] ||= { count: 0, amount: 0, refunds: 0 }).refunds += x.amount; }
    const moved = tally({ payments: paidNow, refunds: mv.refunds.filter((x) => within(x.at) && ofType(x)) });
    const invoices = paidNow.filter((x) => x.source === 'Invoice'), inStore = paidNow.filter((x) => x.source === 'Invoice' || x.source === 'Appointment');
    const backNow = mv.refunds.filter((x) => within(x.at) && ofType(x));
    // Paid invoices' sales and tax go into the Taxes report beside orders, by the rate they were taxed at. An invoice paid and then
    // taken back in the same period nets to nothing; one taken back now that was paid earlier counts against this period.
    const invNet = new Map();
    for (const x of invoices) invNet.set(x.refId, (invNet.get(x.refId) || 0) + Math.sign(x.amount));
    const taxRows = new Map();
    const rowFor = (rate) => taxRows.get(rate) || taxRows.set(rate, { rate, taxable: 0, nontaxable: 0, tax: 0, orders: 0, invoices: 0 }).get(rate);
    {
      const orderPaid = paidNow.filter((x) => x.source === 'Order'), orderBack = mv.refunds.filter((x) => x.source === 'Order' && within(x.at) && ofType(x));
      const ids = [...new Set([...orderPaid, ...orderBack].map((x) => x.refId))];
      const ord = new Map(ids.length ? db.all('SELECT id, items, subtotal, discount, tax, total, tax_rate FROM orders WHERE site_id = ? AND id IN (SELECT value FROM json_each(?))', site.id, JSON.stringify(ids)).map((o) => [o.id, o]) : []);
      const cums = new Map();
      const cumOf = (o) => cums.get(o.id) || cums.set(o.id, (() => { const lines = JSON.parse(o.items || '[]'), taxed = lines.reduce((a, l) => a + (l.taxable === false ? 0 : l.price * l.qty), 0), net = o.subtotal - o.discount; const taxable = o.subtotal ? Math.round(taxed - (o.discount * taxed) / o.subtotal) : 0; return (v) => (net ? Math.round((v * taxable) / net) : 0); })()).get(o.id);
      // Every ledger row of these orders, in the order written. A payment's sales (less its tax, tip and fee) are shared between
      // taxable and not on the order's running paid total, so split, removed and changed payments all land exactly; an order counts
      // once, when it becomes paid. A refund's sales are shared by the rules refundParts splits its tax by: exactly what is left for
      // the refund that gives back the last of the order's money, otherwise on what was taken the way it went back, or on the order
      // as a whole when its gift card part carries none of its tax, tip and fee.
      const paidBefore = new Map(), rowTaxable = new Map();
      if (ids.length) {
        const st = new Map(), blank = () => ({ a: 0, parts: 0, sales: 0, taxable: 0, backA: 0, backSales: 0, backTaxable: 0 });
        for (const r of db.all("SELECT id, ref_id, kind, method, amount, tax, tip, fee FROM money_log WHERE site_id = ? AND source = 'Order' AND ref_id IN (SELECT value FROM json_each(?)) ORDER BY at, rowid", site.id, JSON.stringify(ids))) {
          const o = ord.get(r.ref_id); if (!o) continue;
          const s = st.get(r.ref_id) || st.set(r.ref_id, { all: blank(), card: blank(), counter: blank() }).get(r.ref_id);
          const way = r.method === 'Gift card' ? s.card : s.counter, sales = r.amount - r.tax - r.tip - r.fee;
          let taxable;
          if (r.kind === 'payment') {
            const cum = cumOf(o); taxable = cum(s.all.sales + sales) - cum(s.all.sales); paidBefore.set(r.id, s.all.sales);
            for (const t of [s.all, way]) { t.a += r.amount; t.parts += r.tax + r.tip + r.fee; t.sales += sales; t.taxable += taxable; }
          } else {
            if (s.all.backA + r.amount >= s.all.a) taxable = s.all.taxable - s.all.backTaxable;
            else {
              const p = !(s.card.a > 0 && s.counter.a > 0) || (s.card.parts === 0 && s.all.parts > 0) ? s.all : way;
              taxable = (p.sales > 0 ? Math.round(((p.backSales + sales) * p.taxable) / p.sales) : 0) - p.backTaxable;
              taxable = Math.max(Math.min(0, sales), Math.min(Math.max(0, sales), taxable));
            }
            for (const t of [s.all, way]) { t.backA += r.amount; t.backSales += sales; t.backTaxable += taxable; }
          }
          rowTaxable.set(r.id, taxable);
        }
      }
      for (const x of orderPaid) {
        const o = ord.get(x.refId); if (!o || !rowTaxable.has(x.id)) continue;
        const sales = x.amount - (x.tax || 0) - (x.tip || 0) - (x.fee || 0), pre = paidBefore.get(x.id), taxable = rowTaxable.get(x.id), r = rowFor(o.tax_rate ?? ordering.taxRate ?? 0);
        r.taxable += taxable; r.nontaxable += sales - taxable; r.tax += x.tax || 0;
        if (pre <= 0 && pre + sales > 0) r.orders += 1; else if (pre > 0 && pre + sales <= 0) r.orders -= 1;
      }
      // Refunds: the tax each gave back, and its sales shared as worked out above.
      for (const x of orderBack) {
        const o = ord.get(x.refId); if (!o || !rowTaxable.has(x.id)) continue;
        const sales = x.amount - (x.tax || 0) - (x.tip || 0) - (x.fee || 0), taxable = rowTaxable.get(x.id), r = rowFor(o.tax_rate ?? ordering.taxRate ?? 0);
        r.taxable -= taxable; r.nontaxable -= sales - taxable; r.tax -= x.tax || 0; r.refunds = (r.refunds || 0) + 1;
      }
    }
    if (!onlyType && invoices.length) {
      const inv = new Map(db.all('SELECT id, items, tax_rate, discount, discount_name, subtotal, tax FROM invoices WHERE site_id = ? AND id IN (SELECT value FROM json_each(?))', site.id, JSON.stringify([...new Set(invoices.map((x) => x.refId))])).map((v) => [v.id, v]));
      for (const x of invoices) {
        const v = inv.get(x.refId), tax = x.tax || 0, sale = x.amount - tax;
        let taxable, rate;
        if (x.taxable != null) { taxable = x.taxable; rate = x.rate ?? 0; }
        else {
          // A row of an invoice since deleted: all taxable when it carried tax. Either side of zero rounds the same way.
          const taxed = v ? JSON.parse(v.items).reduce((a, l) => a + (l.taxable === false ? 0 : Math.round(l.price * l.qty)), 0) : 0;
          taxable = v ? (v.subtotal ? Math.sign(sale) * Math.round((Math.abs(sale) * taxed) / v.subtotal) : 0) : tax ? sale : 0; rate = v ? v.tax_rate : tax ? Number(ordering.taxRate) || 0 : 0;
        }
        const r = rowFor(rate);
        r.taxable += taxable; r.nontaxable += sale - taxable; r.tax += tax; r.invoices += Math.sign(x.amount);
      }
      // The discount an invoice used is listed once per invoice paid in the period (a payment taken back takes it off again).
      for (const [vid, k0] of invNet) {
        const v = inv.get(vid), k = Math.sign(k0); if (!v || !k || !v.discount) continue;
        const dn = v.discount_name || 'Invoice discount', pk = `invoice:${dn}`, pr = promos.get(pk) || promos.set(pk, { name: dn, uses: 0, amount: 0, invoice: true }).get(pk); pr.uses += k; pr.amount += k * v.discount;
      }
    }
    // Paid appointments join the Taxes report too, at the rate and on the part they were taxed (a void counts against it).
    const apptPaid = paidNow.filter((y) => y.source === 'Appointment');
    const apptRow = new Map(apptPaid.length ? db.all('SELECT id, total, tax, taxable, tax_rate FROM appointments WHERE site_id = ? AND id IN (SELECT value FROM json_each(?))', site.id, JSON.stringify([...new Set(apptPaid.map((x) => x.refId))])).map((a) => [a.id, a]) : []);
    if (!onlyType) for (const x of apptPaid) {
      const a = apptRow.get(x.refId), k = Math.sign(x.amount), tax = Math.abs(x.tax || 0), sale = Math.abs(x.amount) - tax;
      const rate = a && a.tax_rate != null ? a.tax_rate : tax ? Number(ordering.taxRate) || 0 : 0, taxable = a && a.taxable != null ? Math.min(sale, a.taxable) : tax ? sale : 0;
      const r = rowFor(rate);
      r.taxable += k * taxable; r.nontaxable += k * (sale - taxable); r.tax += k * tax; r.appointments = (r.appointments || 0) + k;
    }
    const { rates, ...sums } = totals;
    json(res, 200, {
      // Money actually taken in the period. Taxes and delivery fees are kept apart; in-store sales are paid invoices, with and without their tax.
      money: { collected: moved.totals.payments, refunds: moved.totals.refunds, tenders: moved.tenders, count: moved.totals.count,
        inStore: inStore.reduce((a, x) => a + x.amount, 0), inStoreNet: inStore.reduce((a, x) => a + x.amount - (x.tax || 0), 0), inStoreTax: inStore.reduce((a, x) => a + (x.tax || 0), 0),
        tax: paidNow.reduce((a, x) => a + (x.tax || 0), 0) - backNow.reduce((a, x) => a + (x.tax || 0), 0), fees: paidNow.reduce((a, x) => a + (x.fee || 0), 0) - backNow.reduce((a, x) => a + (x.fee || 0), 0) },
      range, from, to, today, days, unit: byHour ? 'hour' : 'day', timezone: ordering.timezone, taxRate: ordering.taxRate,
      totals: { ...sums, average: totals.orders ? Math.round(totals.total / totals.orders) : 0, cancelled, rates: [...taxRows.values()].sort((a, b) => a.rate - b.rate) },
      previous: { from: prevFrom, to: prevTo, orders: prev.orders, net: prev.net, total: prev.total, tax: prev.tax, discounts: prev.discounts, refunds: prev.refunds },
      methods: [...methods.values()], series: [...series.values()],
      items: [...items.values()].sort((a, b) => b.qty - a.qty || b.sales - a.sales), categories: [...cats.values()].sort((a, b) => b.sales - a.sales), revenue: [...revs.values()].sort((a, b) => b.sales - a.sales), employees: [...staff.values()].sort((a, b) => b.net - a.net), tenders: [...tenders.values()].sort((a, b) => b.total - a.total), promos: [...promos.values()].sort((a, b) => b.amount - a.amount), removed: [...removed.values()].sort((a, b) => b.value - a.value),
      orders: list.reverse().slice(0, 2000),
    });
  });

  route('PUT', '/api/sites/:id/ordering', async (req, res, p) => {
    const { site: asked } = ownSite(req, p.id);
    const body = await readJson(req);
    const site = db.get('SELECT * FROM sites WHERE id = ?', asked.id) || bad(404, 'That site no longer exists.');
    if (body.rev !== undefined && body.rev !== revOf(site.ordering)) bad(412, STALE);
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
    const { site, user } = ownSite(req, p.id, 'kitchen');
    const status = str((await readJson(req)).status, 20);
    if (!Object.hasOwn(ORDER_STATUSES, status)) bad(400, 'Unknown status.');
    // Read now the body is here, and changed only from the status read, so two taps on Cancel can never return the stock twice.
    const row = db.get('SELECT * FROM orders WHERE id = ? AND site_id = ?', p.order, site.id) || bad(404, 'We could not find that order.');
    if (status !== row.status) {
      if (row.status === 'cancelled') bad(400, 'A cancelled order cannot be reopened. Take a new order instead.');
      const by = staffName(site, user), byId = user.id, now = Date.now();
      // Money taken at the counter is refunded first, so the books never keep a payment for an order that did not happen.
      // A gift card is given back by cancelling.
      const counter = row.paid_at && row.paid_method !== 'Gift card' ? row.total - row.gift : 0;
      if (status === 'cancelled' && counter > 0 && row.refunded < counter) bad(409, `This order has a payment of ${money(counter)} recorded. Refund it first, then cancel the order.`);
      // The first person to take the order on is the one credited with it; later status changes do not take it over.
      if (!db.run("UPDATE orders SET status = ?, handled_by_id = CASE WHEN handled_by = '' THEN ? ELSE handled_by_id END, handled_by = CASE WHEN handled_by = '' THEN ? ELSE handled_by END, updated_at = ? WHERE id = ? AND status = ?", status, byId, by, now, row.id, row.status).changes) bad(409, 'This order was just changed on another device. Refresh to see it.');
      if (status === 'cancelled') cancelled(site, row, by, now, byId);
      if (status === 'completed') earnReward(site, row, now, req);
      const order = toOrder({ ...row, status });
      if (['confirmed', 'ready', 'cancelled'].includes(status)) mail(status, req, site, order, order.email);
    }
    json(res, 200, { order: toOrder(db.get('SELECT * FROM orders WHERE id = ?', row.id)) });
  });

  route('POST', '/api/uploads', async (req, res, p, url) => {
    const user = requireUser(req);
    if (!uploadDir) bad(503, 'Uploads are not available.');
    limit(`upload:${user.id}`, 120, 3600000);
    // A file attached to an invoice or project can be a PDF, and as large as an invoice allows (25 MB). Photos stay under 8 MB.
    const file = url.searchParams.get('kind') === 'file';
    const buf = await readBody(req, (file ? 25 : 8) * 1024 * 1024);
    const ext = file ? sniffFile(buf) : sniffImage(buf);
    if (!ext) bad(415, file ? 'Upload a JPG, PNG or PDF file.' : 'Upload a PNG, JPG, WebP, GIF or SVG image.');
    // Each account has room for 250 MB of photos, and another 250 MB for files attached to invoices and projects, so files never
    // take the room photos need. Uploads nothing uses any more are cleared away after a week, which frees the room again.
    const used = db.get("SELECT COALESCE(SUM(size), 0) AS n FROM uploads WHERE user_id = ? AND kind = ?", user.id, file ? 'file' : 'image').n;
    if (used + buf.length > UPLOAD_QUOTA) bad(413, file ? 'Your account has used all of its file storage (250 MB). Files you stop using are cleared away after a week.' : 'Your account has used all of its photo storage (250 MB). Photos you stop using are cleared away after a week.');
    const disk = await fs.statfs(uploadDir).catch(() => null);
    if (disk && disk.bavail * disk.bsize < 64 * 1024 * 1024 + buf.length) bad(507, 'Photo storage is full right now. Please try again later.');
    const name = `${newId(12)}${ext}`;
    await fs.writeFile(join(uploadDir, name), buf);
    db.run('INSERT INTO uploads (name, user_id, size, created_at, kind) VALUES (?, ?, ?, ?, ?)', name, user.id, buf.length, Date.now(), file ? 'file' : 'image');
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
    json(res, 200, { link: resetLinkFor(req, target.id, 2, 'staff') });
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
    if (ownHost(domain)) bad(400, 'That address belongs to the service itself.');
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

  const simplePage = (title, text, lang = 'en') => `<!doctype html><html lang="${lang === 'es' ? 'es' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif;background:#fff;color:#1d1d1f;text-align:center;padding:24px;-webkit-font-smoothing:antialiased}h1{font-size:40px;letter-spacing:-.025em;margin:0 0 10px;font-weight:600}p{color:#6e6e73;font-size:19px;margin:0}@media(prefers-color-scheme:dark){body{background:#000;color:#f5f5f7}p{color:#a1a1a6}}</style></head><body><div><h1>${esc(title)}</h1><p>${esc(text)}</p></div></body></html>`;

  // A Spanish site's customers are told in Spanish when an order, booking or message cannot be sent.
  async function serveSite(req, res, site, base, sub, origin, draft = false) {
    try { return await siteRequest(req, res, site, base, sub, origin, draft); }
    catch (e) {
      if (!site || !(req.method === 'POST' || sub.startsWith('/_'))) throw e;
      let lang = 'en'; try { lang = JSON.parse(draft ? site.draft : site.published || site.draft).lang; } catch { /* English */ }
      if (lang !== 'es') throw e;
      if (!(e instanceof HttpError)) { console.error(e); e = new HttpError(500, 'Something went wrong on our side. Please try again.'); }
      const es = new HttpError(e.status, inSpanish(e.message), e.code);
      if (String(req.headers.accept || '').includes('json') || String(req.headers['content-type'] || '').includes('json')) throw es;
      return html(res, es.status, simplePage(es.status === 429 ? 'Más despacio' : 'Algo salió mal', es.message, 'es'));
    }
  }
  async function siteRequest(req, res, site, base, sub, origin, draft) {
    const path = sub.replace(/\/+$/, '') || '/';
    let config = site && JSON.parse(draft ? site.draft : site.published || 'null');
    // An invoice or an order's tracking page does not depend on the website being live, so links already sent keep working.
    if (!config && site && /^\/(invoice|order)\/[\w-]{10,40}$/.test(path)) config = JSON.parse(site.draft);
    if (!config) { let es = false; try { es = JSON.parse(site.draft).lang === 'es'; } catch { /* English */ } return html(res, 404, es ? simplePage('Próximamente', 'Este sitio web aún no está publicado.', 'es') : simplePage('Coming soon', 'This website has not been published yet.')); }
    const home = `${origin}${base}/`;
    // Search engines are given the site's one public address: a page reached through the free path address names its main address instead.
    const canon = draft || !base.startsWith('/s/') ? home : `${siteUrl(req, site).replace(/\/$/, '')}/`;

    if (path === '/_forms/contact' && req.method === 'POST' && !draft) {
      limit(`form:${site.id}:${ipOf(req)}`, 6, 10 * 60000);
      const raw = await readBody(req, 20_000);
      const isJson = String(req.headers['content-type'] || '').includes('json');
      let b = {};
      try { b = isJson ? JSON.parse(raw.toString('utf8')) : Object.fromEntries(new URLSearchParams(raw.toString('utf8'))); } catch { bad(400, 'Could not read that message.'); }
      if (!b || typeof b !== 'object' || Array.isArray(b)) b = {};
      const lead = { name: str(b.name, 120).trim(), email: str(b.email, 200).trim(), phone: str(b.phone, 40).trim(), message: str(b.message, 4000).trim() };
      const spam = str(b.company_website).trim() !== '';
      if (!spam) {
        if (!lead.name || !lead.message || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) bad(400, 'Please add your name, a valid email and a message.');
        limit(`form:${site.id}`, 60, 10 * 60000);
        db.run('INSERT INTO leads (id, site_id, name, email, phone, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), site.id, lead.name, lead.email, lead.phone, lead.message, Date.now());
      }
      return isJson ? json(res, 200, { ok: true }) : redirect(res, `${base}/?sent=1#contact`, 303);
    }
    const ordering = orderingOf(site);
    if (path === '/_book' && req.method === 'POST' && !draft) {
      limit(`book:${site.id}:${ipOf(req)}`, 8, 10 * 60000);
      if (!ordering.booking.enabled) bad(409, 'Online booking is not available right now. Please call us.');
      // The shop-wide cap counts bookings that went through, so requests that were refused never use it up.
      // The body is read first, so the check, the booking and the count happen together.
      const body = await readJson(req, 20_000);
      if (counted(`book:${site.id}`) >= 80) bad(429, 'Too many attempts. Please wait a few minutes and try again.');
      const appt = makeAppt(site, ordering, body, true);
      bump(`book:${site.id}`, 10 * 60000);
      const business = businessOf(site), owner = db.get('SELECT email FROM users WHERE id = ?', site.user_id);
      const lang = kind => (kind === 'merchant' ? 'en' : langOf(site));
      const send = (to, kind) => Promise.resolve().then(() => mailer.send({ to, ...bookingEmail(kind, { business, appt, when: apptWhen(appt.at, lang(kind)), lang: lang(kind), manageUrl: `${linkOrigin(req)}/app/site/${site.id}?tab=appts` }), fromName: business.name, replyTo: kind === 'merchant' ? appt.email : business.email })).catch((e) => console.error('Booking email failed:', e.message));
      send(appt.email, 'request'); send(ordering.notifyEmail || business.email || owner?.email, 'merchant');
      notifySite(site, { title: 'New booking request', body: `${site.name} · ${appt.name} · ${apptWhen(appt.at)}`, url: `/app/site/${site.id}?tab=appts`, tag: `appt-${appt.id}` });
      return json(res, 201, { ok: true });
    }
    if (path === '/_promo' && req.method === 'GET') {
      limit(`promo:${site.id}:${ipOf(req)}`, 20, 10 * 60000);
      const promo = ordering.enabled && promoFor(site, ordering, new URL(req.url, 'http://x').searchParams.get('code'));
      // Raised as an error, so a Spanish site answers in Spanish.
      if (!promo) bad(404, 'That code is not valid.');
      return json(res, 200, { code: promo.code, type: promo.type, value: promo.value });
    }
    if (path === '/_order' && req.method === 'POST' && !draft) {
      limit(`order:${site.id}:${ipOf(req)}`, 12, 10 * 60000);
      const b = await readJson(req, 50_000);
      if (!ordering.enabled || !ordering.accepting) bad(409, 'Online ordering is paused right now. Please call us to order.');
      const method = str(b.method, 20);
      // Own-property checks only: names like 'constructor' exist on every object and must not pass as an order type.
      if (!openMethods(ordering).includes(method)) bad(400, 'Choose how you would like to receive your order.');
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
      // The shared per-shop cap counts only orders that passed every check, so junk requests cannot shut a shop's ordering.
      limit(`order:${site.id}`, 200, 10 * 60000);
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
          if (it.blocked) bad(409, `${it.name} is sold out right now. Please remove it and try again.`);
          before.set(it.id, { name: it.name, stock: it.stock });
          const picked = resolveOptions(it, w.picks, config.lang === 'es' ? 'es' : 'en');
          if (picked.error) bad(400, picked.error);
          need.set(it.id, (need.get(it.id) || 0) + w.qty);
          if (it.stock != null && it.stock < need.get(it.id)) bad(409, `Only ${it.stock} of ${it.name} left. Please lower the quantity and try again.`);
          // The price before a sale or timed price, so the Discounts report can show what items were discounted by.
          const list = picked.price + it.price - itemPrice(it);
          lines.push({ id: it.id, name: it.name, price: picked.price, qty: w.qty, opts: picked.labels, picks: w.picks, taxable: it.taxable, label: it.label, rev: it.revclass, ...(list > picked.price ? { list, deal: it.deal || 'Sale' } : {}) });
        }
        const t = orderTotals(lines, method, ordering, [0, 10, 15, 20].includes(Number(b.tip)) ? Number(b.tip) : 0, promo?.gift ? null : promo, zone ? zone.fee : null);
        if (method === 'delivery' && t.subtotal < ordering.deliveryMin) bad(400, 'Your order is below the delivery minimum.');
        // The page sends the total it showed. If a price changed since then (a timed price ended), the order is not taken at another total without saying so.
        if (b.expect !== undefined && b.expect !== null && Math.round(Number(b.expect)) !== t.total) throw new HttpError(409, `Prices just changed. Your total is now ${money(t.total)}.`, 'prices');
        // The card is read again here, inside the transaction, so two orders can never spend the same balance.
        let gift = 0;
        if (promo?.gift) {
          gift = Math.min(db.get('SELECT balance FROM gift_cards WHERE site_id = ? AND code = ?', site.id, promo.code)?.balance || 0, t.total);
          if (!(gift > 0)) bad(409, 'That gift card has nothing left on it.');
          db.run('UPDATE gift_cards SET balance = balance - ? WHERE site_id = ? AND code = ?', gift, site.id, promo.code);
        }
        for (const [itemId, qty] of need) db.run('UPDATE menu_items SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL', qty, itemId);
        const number = (db.get('SELECT MAX(number) AS n FROM orders WHERE site_id = ?', site.id).n || 1000) + 1;
        const oid = newId(); const now = Date.now();
        db.run('INSERT INTO orders (id, site_id, number, token, method, name, email, phone, address, vehicle, notes, items, subtotal, discount, promo, scheduled, tax, fee, tip, total, gift, gift_code, tax_rate, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          oid, site.id, number, newId(18), method, who.name, who.email, who.phone, who.address, who.vehicle, who.notes, JSON.stringify(lines), t.subtotal, t.discount, promo && !promo.gift ? promo.code : '', scheduled, t.tax, t.fee, t.tip, t.total, gift, gift ? promo.code : '', ordering.taxRate || 0, now, now);
        if (gift) {
          // The card's part is a payment taken now. If it covers everything, the order is paid.
          giftMove(site, promo.code, 'spend', gift, '', oid, now);
          if (gift === t.total) db.run("UPDATE orders SET paid_at = ?, paid_method = 'Gift card' WHERE id = ?", now, oid);
          // It carries its share of the order's tax, tip and delivery fee, so each day's reports hold the tax that day took.
          const share = (n) => Math.round((gift * n) / t.total);
          logMoney(site, { source: 'Order', refId: oid, ref: `#${number}`, customer: who.name, channel: method, method: 'Gift card', amount: gift, tip: share(t.tip), tax: share(t.tax), fee: share(t.fee), note: `Card …${promo.code.slice(-4)}`, at: now });
        }
        if (promo?.reward) db.run('UPDATE rewards SET used_order = ? WHERE site_id = ? AND code = ? AND used_order IS NULL', oid, site.id, promo.code);
        db.raw.exec('COMMIT');
        order = toOrder(db.get('SELECT * FROM orders WHERE id = ?', oid));
        if (gift) order.giftLeft = db.get('SELECT balance FROM gift_cards WHERE site_id = ? AND code = ?', site.id, promo.code)?.balance ?? null;
        order.low = [...need].map(([itemId, qty]) => ({ name: before.get(itemId).name, was: before.get(itemId).stock, stock: Math.max(0, before.get(itemId).stock - qty) })).filter((x) => x.was > ordering.lowStockAt && x.stock <= ordering.lowStockAt);
      } catch (e) { db.raw.exec('ROLLBACK'); throw e; }
      mail('placed', req, site, order, order.email);
      const owner = db.get('SELECT email FROM users WHERE id = ?', site.user_id);
      mail('merchant', req, site, order, ordering.notifyEmail || businessOf(site).email || owner?.email);
      notifySite(site, { title: `New order #${order.number} · ${money(order.total)}`, body: `${site.name} · ${ORDER_METHODS[method]?.name ?? method} · ${order.name}`, url: `/app/site/${site.id}?tab=orders`, tag: `order-${order.id}` });
      if (order.low.length) {
        const text = order.low.map((x) => (x.stock === 0 ? `${x.name} is sold out` : `${x.name}: ${x.stock} left`)).join(' · ');
        notifySite(site, { title: order.low.some((x) => x.stock === 0) ? 'Sold out' : 'Running low', body: `${site.name} · ${text}`, url: `/app/site/${site.id}?tab=items`, tag: `stock-${site.id}` });
        const msg = lowStockEmail({ business: businessOf(site), items: order.low, manageUrl: `${linkOrigin(req)}/app/site/${site.id}?tab=items` });
        Promise.resolve().then(() => mailer.send({ to: ordering.notifyEmail || businessOf(site).email || owner?.email, ...msg })).catch((e) => console.error('Low stock email failed:', e.message));
      }
      return json(res, 201, { number: order.number, url: `${base}/order/${order.token}` });
    }
    if (draft && req.method === 'POST' && ['/_order', '/_book', '/_forms/contact'].includes(path)) return json(res, 409, { error: 'This is a preview. Orders, bookings and messages can be sent once your site is published.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });

    const shared = { base, ordering, menu: ordering.enabled || config.sections?.some((x) => x.type === 'menu') ? applyMods(pricedMenu(visibleMenu(menuOf(site.id), ordering), ordering), ordering) : [], siteKey: site.id, taken: ordering.slotLimit ? takenSlots(site.id) : null, busy: busyNow(site.id, ordering),
      // The code box shows when there is something to type in it: a promo code, a gift card or a loyalty reward.
      codes: ordering.loyalty.enabled || !!db.get('SELECT 1 FROM gift_cards WHERE site_id = ? AND balance > 0 LIMIT 1', site.id), mailOn: !!mailer.enabled };
    const tracked = path.match(/^\/order\/([\w-]{10,40})$/);
    if (tracked) {
      const row = db.get('SELECT * FROM orders WHERE token = ? AND site_id = ?', tracked[1], site.id);
      let loyalty;
      if (row && ordering.loyalty.enabled) {
        const count = db.get("SELECT COUNT(*) AS n FROM orders WHERE site_id = ? AND lower(email) = lower(?) AND status = 'completed' AND created_at <= ?", site.id, row.email, row.created_at).n;
        const earned = db.get('SELECT code, type, value FROM rewards WHERE site_id = ? AND earned_order = ? AND used_order IS NULL', site.id, row.id);
        loyalty = { every: ordering.loyalty.every, have: earned ? ordering.loyalty.every : count % ordering.loyalty.every, code: earned?.code, value: earned ? rewardText(earned) : '' };
      }
      const giftLeft = row && row.gift_code ? db.get('SELECT balance FROM gift_cards WHERE site_id = ? AND code = ?', site.id, row.gift_code)?.balance ?? null : null;
      const out = renderPage(config, row ? 'order-status' : 'missing', { ...shared, order: row && { ...toOrder(row), giftLeft }, loyalty });
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
    if (path === '/robots.txt') return send(res, 200, draft ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${canon}sitemap.xml\n`, { 'Content-Type': 'text/plain; charset=utf-8' });
    if (path === '/sitemap.xml') {
      const mod = new Date(site.published_at || site.updated_at).toISOString().slice(0, 10);
      return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((pg) => `  <url><loc>${esc(canon + pg)}</loc><lastmod>${mod}</lastmod></url>`).join('\n')}\n</urlset>\n`, { 'Content-Type': 'application/xml; charset=utf-8' });
    }
    const page = path === '/' ? 'home' : path.slice(1);
    const sent = new URL(req.url, 'http://x').searchParams.get('sent') === '1';
    const out = renderPage(config, page, { ...shared, url: page === 'home' ? canon : `${canon}${page}`, sent, booked: new URL(req.url, 'http://x').searchParams.get('done') === '1', today: new Date(wallNow(ordering)).toISOString().slice(0, 10) });
    return html(res, out.status, out.html, { 'Cache-Control': draft || shared.menu.length ? 'no-store' : 'public, max-age=60', ...(draft ? { 'X-Robots-Tag': 'noindex' } : {}) });
  }

  function siteForHost(host) {
    const h = host.split(':')[0];
    if (!h || h === APP_HOST.split(':')[0]) return undefined;
    if (SITES_DOMAIN && h.endsWith(`.${SITES_DOMAIN}`)) {
      const sub = h.slice(0, -(SITES_DOMAIN.length + 1));
      return sub === 'www' ? undefined : db.get('SELECT * FROM sites WHERE slug = ?', sub) || null;
    }
    if (h === SITES_DOMAIN || ownHost(h)) return undefined;
    return db.get('SELECT * FROM sites WHERE custom_domain = ? AND domain_verified = 1', h.replace(/^www\./, '')) || undefined;
  }

  /* ---------- static files ---------- */

  const zipped = new Map();
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
      // Text files travel compressed. The squeezed copy is kept, so the work is done once per file.
      if (/^(text\/|application\/(json|xml|manifest\+json)|image\/svg)/.test(type) && buf.length > 1400 && /\bgzip\b/.test(String(res.req.headers['accept-encoding'] || ''))) {
        let z = zipped.get(full);
        if (!z || z.size !== buf.length) { z = { size: buf.length, gz: gzipSync(buf, { level: 8 }) }; zipped.set(full, z); }
        send(res, 200, z.gz, { 'Content-Type': type, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', ...headers });
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
      // A PDF is handed over as a download, never opened as a page of this site, and only on the app itself or on a site of
      // whoever uploaded it, so a file cannot borrow another business's web address.
      if (path.endsWith('.pdf')) {
        const on = siteForHost(hostOf(req)), up = on && db.get('SELECT user_id FROM uploads WHERE name = ?', path.slice(3));
        const attached = (table) => !!db.get(`SELECT 1 FROM ${table} WHERE site_id = ? AND instr(attachments, ?) > 0`, on.id, `"${path}"`);
        if (on && !(up && worksOn(on, up.user_id)) && !attached('invoices') && !attached('projects')) return send(res, 404, 'Not found');
      }
      const ok = /^\/u\/[\w.-]+$/.test(path) && await sendFile(res, uploadDir, path.slice(3), { 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", ...(path.endsWith('.pdf') ? { 'Content-Disposition': 'attachment' } : {}) });
      return ok || send(res, 404, 'Not found');
    }

    const hosted = siteForHost(hostOf(req));
    if (hosted !== undefined) {
      if (hosted === null) return html(res, 404, simplePage('Nothing here yet', 'There is no website at this address.'));
      // A site with its own domain has one address: the free address and www send page visits there, so search engines
      // see one site, not three. Form posts and anything under /_ are answered where they arrive.
      const host = hostOf(req).split(':')[0];
      if (hosted.custom_domain && hosted.domain_verified && host !== hosted.custom_domain && (req.method === 'GET' || req.method === 'HEAD') && !path.startsWith('/_')) {
        return redirect(res, `https://${hosted.custom_domain}${req.url.startsWith('/') ? req.url : path}`, 301);
      }
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
    if (path === '/version') return send(res, 200, BUILD, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    if (path === '/favicon.ico') return (await sendFile(res, join(ROOT, 'public'), 'icon-32.png', { 'Cache-Control': 'public, max-age=86400' })) || send(res, 404, '');
    if (path === '/sw.js') return (await sendFile(res, join(ROOT, 'public'), 'sw.js', { 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' })) || send(res, 404, 'Not found');
    if (path === '/manifest.webmanifest') return (await sendFile(res, join(ROOT, 'public'), 'manifest.webmanifest', { 'Cache-Control': 'no-cache', 'Content-Type': 'application/manifest+json' })) || send(res, 404, 'Not found');
    const cache = { 'Cache-Control': 'no-cache' };
    if (path.startsWith('/assets/fonts/')) return (await sendFile(res, join(ROOT, 'public'), path.slice(8), { 'Cache-Control': 'public, max-age=31536000, immutable' })) || send(res, 404, 'Not found');
    if (path.startsWith('/assets/demo/')) return (await sendFile(res, join(ROOT, 'public'), path.slice(8), { 'Cache-Control': 'public, max-age=604800' })) || send(res, 404, 'Not found');
    if (path.startsWith('/assets/')) return (await sendFile(res, join(ROOT, 'public'), path.slice(8), cache)) || send(res, 404, 'Not found');
    if (path.startsWith('/shared/')) return (await sendFile(res, join(ROOT, 'shared'), path.slice(8), cache)) || send(res, 404, 'Not found');
    if (path === '/robots.txt') return send(res, 200, `User-agent: *\nDisallow: /app\nDisallow: /api\nDisallow: /preview\nSitemap: ${appOrigin(req)}/sitemap.xml\n`, { 'Content-Type': 'text/plain' });
    if (path === '/sitemap.xml') return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/faq', '/contact', '/privacy', '/terms', '/signup'].map((u) => `<url><loc>${esc(appOrigin(req))}${u}</loc></url>`).join('')}</urlset>`, { 'Content-Type': 'application/xml' });
    if (path === '/' || /^\/(login|signup|forgot|reset|faq|privacy|terms|contact|app(\/.*)?)$/.test(path)) {
      // Link previews need absolute image addresses, so the shell is filled in per request.
      shell ??= await fs.readFile(join(ROOT, 'public', 'index.html'), 'utf8');
      // The home page arrives with its first frame already drawn, so there is something to look at before the scripts run.
      const page = shell.replaceAll('__ORIGIN__', esc(appOrigin(req))).replace('<!--BOOT-HEAD-->', path === '/' ? BOOT_HEAD : '').replace('<!--BOOT-BODY-->', path === '/' ? BOOT_BODY : '');
      return html(res, 200, page, { ...cache, 'Content-Security-Policy': APP_CSP, 'Permissions-Policy': 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)' });
    }
    return html(res, 404, simplePage('Page not found', `This page does not exist on ${PLATFORM} Sites.`));
  }

  const handler = (req, res) => {
    res.req = req;
    handle(req, res).catch((err) => {
      const status = err instanceof HttpError ? err.status : err instanceof URIError ? 400 : 500;
      if (status === 500 && !(err instanceof HttpError)) console.error(err);
      if (res.headersSent) return res.end();
      const message = status === 500 && !(err instanceof HttpError) ? 'Something went wrong on our side. Please try again.' : err.message || 'Bad request';
      const wantsJson = req.url.startsWith('/api/') || String(req.headers.accept || '').includes('json') || String(req.headers['content-type'] || '').includes('json');
      wantsJson ? json(res, status, { error: message, ...(err instanceof HttpError && err.code ? { code: err.code } : {}) }) : html(res, status, simplePage(status === 429 ? 'Slow down' : 'Something went wrong', message));
    });
  };
  handler.db = db;
  handler.tick = tick;
  handler.backup = backup;
  handler.sweepUploads = sweepUploads;
  handler.close = () => { clearInterval(sweep); clearInterval(daily); clearTimeout(firstTick); db.close(); };
  return handler;
}
