/* One account must never see or change another account's data, and everything must survive a restart.
   The list of routes is read from the server itself, so a route added later is attacked here automatically. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createApp } from '../server/app.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROUTES = [...readFileSync(join(here, '../server/app.js'), 'utf8').matchAll(/route\('(GET|POST|PUT|DELETE)', '(\/api\/sites\/:id[^']*)'/g)].map((m) => [m[1], m[2]]);
const env = { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' };
const mailer = { enabled: true, send: async () => {} };

async function boot(dataDir) {
  const app = createApp({ dataDir, env, mailer, dns: { resolveCname: async () => { throw new Error('ENOTFOUND'); }, resolve4: async () => { throw new Error('ENOTFOUND'); } } });
  const srv = createServer(app);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const client = (cookie = '') => {
    const call = async (method, path, body, { host = 'app.pfsites.test' } = {}) => {
      const res = await fetch(base + path, { method, redirect: 'manual', headers: { 'X-Forwarded-Host': host, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, data, text };
    };
    call.cookie = () => cookie; call.base = base;
    return call;
  };
  return { client, app, stop: async () => { await new Promise((r) => srv.close(r)); app.close(); } };
}

/* Fills one shop with one of everything. Every name carries the marker so a leak is easy to spot. */
async function fillShop(me, anon, mark, slug) {
  const host = { host: `${slug}.pfsites.test` };
  const site = (await me('POST', '/api/sites', { name: `${mark} Cafe`, template: 'order', kind: 'ordering', csv: `Item,Price\n${mark} Taco,10.00` })).data.site;
  const S = `/api/sites/${site.id}`;
  const ok = async (p, what) => { const r = await p; assert.ok(r.status < 300, `${what}: ${r.status} ${r.text.slice(0, 200)}`); return r; };
  await ok(me('PUT', `${S}/ordering`, { ordering: { ...site.ordering, promos: [{ code: `${mark}10`, type: 'percent', value: 10 }], booking: { enabled: true, perSlot: 5, services: [{ id: 's1', name: `${mark} table`, minutes: 60 }] } } }), 'ordering');
  await ok(me('POST', `${S}/publish`, {}), 'publish');
  const [item] = (await me('GET', `${S}/menu`)).data.items;
  await ok(anon('POST', '/_order', { method: 'pickup', name: `${mark} Ana`, phone: '903-555-0100', email: 'ana@example.com', items: [{ id: item.id, qty: 1 }] }, host), 'order');
  await ok(anon('POST', '/_forms/contact', { name: `${mark} Lee`, email: 'lee@example.com', message: `${mark} hello` }, host), 'lead');
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await ok(me('POST', `${S}/contacts`, { name: `${mark} Dana`, email: 'dana@acme.test' }), 'contact');
  await ok(me('POST', `${S}/invoices`, { customer: { name: `${mark} Dana`, email: 'dana@acme.test' }, items: [{ name: `${mark} tray`, qty: 1, price: 5000 }] }), 'invoice');
  await ok(me('POST', `${S}/gift-cards`, { amount: 2500, name: `${mark} Gia` }), 'gift');
  await ok(me('POST', `${S}/plans`, { name: `${mark} plan`, customer: { name: `${mark} Dana`, email: 'dana@acme.test' }, amount: 5000, every: 'weekly' }), 'plan');
  await ok(me('POST', `${S}/appointments`, { serviceName: `${mark} walk-in`, date: day, time: '18:30', name: `${mark} Bo` }), 'appt');
  await ok(me('POST', `${S}/shifts`, { name: `${mark} Bea`, day, start: '09:00', finish: '17:00' }), 'shift');
  await ok(me('POST', `${S}/timeclock`, { action: 'in' }), 'clock');
  await ok(me('POST', `${S}/cash`, { kind: 'in', amount: 10000, note: `${mark} float` }), 'cash');
  await ok(me('POST', `${S}/team`, { email: `${mark.toLowerCase()}cook@shop.test`, name: `${mark} Cook`, role: 'kitchen' }), 'team');
  return site;
}

/* Everything the owner can read about a shop, in one object. */
async function snapshot(me, site) {
  const out = {};
  for (const k of ['', '/menu', '/orders', '/leads', '/customers', '/invoices', '/gift-cards', '/plans', '/appointments', '/shifts', '/timeclock', '/cash', '/closeouts', '/team', '/transactions', '/versions']) {
    const r = await me('GET', `/api/sites/${site.id}${k}`);
    assert.equal(r.status, 200, `owner reads ${k || 'site'}`);
    out[k] = r.data;
  }
  return out;
}
const first = (snap, path, list) => (snap[path][list] || [])[0] || {};
function idsOf(snap) {
  return {
    item: first(snap, '/menu', 'items').id, order: first(snap, '/orders', 'orders').id, lead: first(snap, '/leads', 'leads').id,
    contact: (snap['/customers'].customers || []).find((c) => c.contactId)?.contactId, inv: first(snap, '/invoices', 'invoices').id, code: first(snap, '/gift-cards', 'cards').code,
    plan: first(snap, '/plans', 'plans').id, appt: first(snap, '/appointments', 'appointments').id, shift: first(snap, '/shifts', 'shifts').id,
    entry: first(snap, '/cash', 'entries').id, user: (snap['/team'].team || snap['/team'].members || [])[0]?.id, version: first(snap, '/versions', 'versions').id, device: 'x',
  };
}
const fill = (path, siteId, ids) => path.replace(':id', siteId).replace(/:(\w+)/g, (_, k) => encodeURIComponent(ids[k] ?? 'missing'));

test('one account cannot read or change another account’s shop', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pfiso-'));
  const { client, stop } = await boot(dir);
  try {
    const a = client(), b = client(), anon = client();
    await a('POST', '/api/auth/signup', { email: 'a@shop.test', password: 'long-enough-pw', name: 'Avery' });
    await b('POST', '/api/auth/signup', { email: 'b@shop.test', password: 'long-enough-pw', name: 'Blair' });
    const cook = client();
    await cook('POST', '/api/auth/signup', { email: 'zebracook@shop.test', password: 'long-enough-pw', name: 'Cook' });
    const siteA = await fillShop(a, anon, 'ZEBRA', 'zebracafe');
    const siteB = await fillShop(b, anon, 'OTTER', 'ottercafe');
    const beforeA = await snapshot(a, siteA), beforeB = await snapshot(b, siteB);
    const ids = idsOf(beforeA);
    for (const [k, v] of Object.entries(ids)) if (k !== 'version') assert.ok(v, `shop A has a ${k} to attack`);
    assert.ok(ROUTES.length > 60, 'the route list was read from the server');

    // Each login only lists its own shop.
    assert.deepEqual((await a('GET', '/api/sites')).data.sites.map((s) => s.id), [siteA.id]);
    assert.deepEqual((await b('GET', '/api/sites')).data.sites.map((s) => s.id), [siteB.id]);

    const junk = { name: 'HACKED', role: 'owner', email: 'b@shop.test', status: 'paid', amount: 1, method: 'cash', action: 'in', kind: 'out', draft: beforeB[''].site.draft, ordering: { enabled: false }, slug: 'stolen', domain: 'stolen.example.com', from: 'ZEBRA Taco', to: 'HACKED', ids: [ids.item], order: [ids.item], items: [{ name: 'HACKED', price: 1 }], customer: { name: 'HACKED' }, refund: 1, price: 1, stock: 0, user_id: 'x', site_id: siteB.id };
    for (const [method, path] of ROUTES) {
      const body = method === 'GET' ? undefined : junk;
      // 1. Not signed in at all.
      let r = await anon(method, fill(path, siteA.id, ids), body);
      assert.equal(r.status, 401, `signed out: ${method} ${path}`);
      // 2. Signed in as someone else, aiming straight at shop A.
      r = await b(method, fill(path, siteA.id, ids), body);
      assert.equal(r.status, 404, `other account: ${method} ${path} gave ${r.status}`);
      assert.ok(!r.text.includes('ZEBRA'), `other account saw shop A through ${method} ${path}`);
      // 3. Signed in as someone else, using their own shop's address with shop A's record numbers.
      if (/:\w+/.test(path.replace(':id', ''))) {
        r = await b(method, fill(path, siteB.id, ids), body);
        assert.ok(!r.text.includes('ZEBRA'), `shop A leaked through shop B: ${method} ${path}`);
      }
    }
    // After all of that, shop A is exactly as it was.
    assert.deepEqual(await snapshot(a, siteA), beforeA, 'shop A is untouched');

    // Customer-facing pages: one shop's codes, gift cards, invoices and orders mean nothing on another shop's address.
    const hostB = { host: 'ottercafe.pfsites.test' }, hostA = { host: 'zebracafe.pfsites.test' };
    assert.equal((await anon('GET', '/_promo?code=ZEBRA10', null, hostA)).status, 200);
    assert.equal((await anon('GET', '/_promo?code=ZEBRA10', null, hostB)).status, 404, 'promo code from A on B');
    assert.equal((await anon('GET', `/_promo?code=${ids.code}`, null, hostA)).status, 200);
    assert.equal((await anon('GET', `/_promo?code=${ids.code}`, null, hostB)).status, 404, 'gift card from A on B');
    const inv = first(beforeA, '/invoices', 'invoices'), ord = first(beforeA, '/orders', 'orders');
    const invPath = new URL(inv.url || `http://x/invoice/${inv.token}`).pathname.replace(/^\/s\/[^/]+/, '');
    assert.equal((await anon('GET', invPath, null, hostA)).status, 200, 'invoice opens on its own shop');
    assert.equal((await anon('GET', invPath, null, hostB)).status, 404, 'invoice from A on B');
    const itemB = first(beforeB, '/menu', 'items');
    assert.notEqual((await anon('POST', '/_order', { method: 'pickup', name: 'X', phone: '903-555-0100', email: 'x@example.com', items: [{ id: ids.item, qty: 1 }] }, hostB)).status, 201, 'cannot order shop A’s item from shop B');
    assert.ok(itemB.id && ord.id);

    // A kitchen login can work orders but cannot touch settings, money, the team or the website.
    assert.equal((await cook('GET', `/api/sites/${siteA.id}/orders`)).status, 200);
    for (const [m, p, body] of [['PUT', '', { draft: beforeA[''].site.draft }], ['PUT', '/ordering', { ordering: { enabled: false } }], ['DELETE', '', undefined], ['POST', '/team', { email: 'x@y.test', role: 'owner' }], ['GET', '/invoices', undefined], ['GET', '/customers', undefined], ['POST', '/unpublish', {}], ['DELETE', `/menu/${ids.item}`, undefined], ['POST', '/gift-cards', { amount: 100 }], ['PUT', '/name', { name: 'Kitchen Name' }]]) {
      assert.equal((await cook(m, `/api/sites/${siteA.id}${p}`, body)).status, 403, `kitchen login: ${m} ${p || '/'}`);
    }
    assert.equal((await cook('GET', `/api/sites/${siteB.id}/orders`)).status, 404, 'a team member of A is nobody on B');

    // Signing out ends the session for good, even if someone kept the cookie.
    const kept = b.cookie();
    await b('POST', '/api/auth/logout', {});
    assert.equal((await client(kept)('GET', '/api/sites')).status, 401);
    // "Sign out everywhere" ends every session the account has, on every device.
    const d1 = client(), d2 = client();
    for (const d of [d1, d2]) assert.equal((await d('POST', '/api/auth/login', { email: 'a@shop.test', password: 'long-enough-pw' })).status, 200);
    assert.equal((await d1('POST', '/api/auth/logout-all', {})).status, 200);
    for (const d of [d1, d2, a]) assert.equal((await d('GET', '/api/sites')).status, 401);
    // The app page tells the browser what it may load, and refuses to be framed elsewhere.
    const shell = await fetch(`${a.base}/app`, { headers: { 'X-Forwarded-Host': 'app.pfsites.test' } });
    assert.match(shell.headers.get('content-security-policy'), /frame-ancestors 'self'/);
    assert.match(shell.headers.get('content-security-policy'), /connect-src 'self'/);
    // A made-up cookie is nobody.
    assert.equal((await client('pf_session=' + 'A'.repeat(43))('GET', '/api/sites')).status, 401);
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('everything is still there after the server restarts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pfkeep-'));
  let run = await boot(dir);
  try {
    const a = run.client(), anon = run.client();
    await a('POST', '/api/auth/signup', { email: 'keep@shop.test', password: 'long-enough-pw', name: 'Kai' });
    const site = await fillShop(a, anon, 'KEEP', 'keepcafe');
    const before = await snapshot(a, site);
    const cookie = a.cookie();
    await run.stop();

    run = await boot(dir);
    const again = run.client(cookie);
    assert.equal((await again('GET', '/api/me')).data.user.email, 'keep@shop.test', 'still signed in after a restart');
    assert.deepEqual(await snapshot(again, site), before, 'every record came back');
    const fresh = run.client();
    assert.equal((await fresh('POST', '/api/auth/login', { email: 'keep@shop.test', password: 'long-enough-pw' })).status, 200);
    assert.deepEqual((await fresh('GET', '/api/sites')).data.sites.map((s) => s.id), [site.id], 'a new sign-in loads the right shop');
    assert.match((await run.client()('GET', '/', null, { host: 'keepcafe.pfsites.test' })).text, /KEEP Cafe/, 'the public site is still live');
  } finally { await run.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('two devices cannot silently overwrite each other, and the other safety rules hold', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pfsafe-'));
  const { client, stop, app } = await boot(dir);
  try {
    const a = client(), anon = client(), host = { host: 'safecafe.pfsites.test' };
    await a('POST', '/api/auth/signup', { email: 'safe@shop.test', password: 'long-enough-pw', name: 'Sam' });
    const site = await fillShop(a, anon, 'SAFE', 'safecafe');
    const S = `/api/sites/${site.id}`;

    // Phone and laptop both open the settings. The laptop saves first; the phone is told, not allowed to wipe that out.
    const laptop = (await a('GET', S)).data.site, phone = (await a('GET', S)).data.site;
    let r = await a('PUT', `${S}/ordering`, { ordering: { ...laptop.ordering, prepMinutes: 35 }, rev: laptop.orderingRev });
    assert.equal(r.status, 200);
    assert.equal((await a('PUT', `${S}/ordering`, { ordering: { ...phone.ordering, prepMinutes: 5 }, rev: phone.orderingRev })).status, 412);
    assert.equal((await a('GET', S)).data.site.ordering.prepMinutes, 35, 'the first save is still there');
    assert.equal((await a('PUT', `${S}/ordering`, { ordering: { ...r.data.ordering, prepMinutes: 40 }, rev: r.data.rev })).status, 200, 'saving on from the latest works');
    // The same for the website itself.
    const d1 = { ...laptop.draft, brand: { ...laptop.draft.brand, tagline: 'From the laptop' } };
    r = await a('PUT', S, { draft: d1, rev: laptop.draftRev });
    assert.equal(r.status, 200);
    assert.equal((await a('PUT', S, { draft: phone.draft, rev: phone.draftRev })).status, 412);
    assert.equal((await a('PUT', S, { draft: d1, rev: r.data.site.draftRev })).status, 200);

    // Notifications can only be pointed at real browser notification services.
    const sub = (endpoint) => a('POST', '/api/push/subscribe', { subscription: { endpoint, keys: { p256dh: 'a', auth: 'b' } } });
    assert.equal((await sub('https://internal-host:8443/x')).status, 400);
    assert.equal((await sub('https://fcm.googleapis.com.evil.example/x')).status, 400);
    assert.equal((await sub('https://fcm.googleapis.com/fcm/send/abc')).status, 201);
    assert.equal((await sub('https://web.push.apple.com/abc')).status, 201);

    // A cancelled order stays cancelled, so stock cannot be pumped up by cancelling over and over.
    const [order] = (await a('GET', `${S}/orders`)).data.orders;
    const stockOf = async () => (await a('GET', `${S}/menu`)).data.items[0].stock;
    const before = await stockOf();
    assert.equal((await a('POST', `${S}/orders/${order.id}`, { status: 'cancelled' })).status, 200);
    assert.equal(await stockOf(), before + 1);
    assert.equal((await a('POST', `${S}/orders/${order.id}`, { status: 'confirmed' })).status, 400);
    assert.equal(await stockOf(), before + 1);

    // A kitchen login can record a payment but cannot remove or change one.
    const cook = client();
    await cook('POST', '/api/auth/signup', { email: 'cook2@shop.test', password: 'long-enough-pw' });
    await a('POST', `${S}/team`, { email: 'cook2@shop.test', role: 'kitchen' });
    await anon('POST', '/_order', { method: 'pickup', name: 'Pay Me', phone: '903-555-0100', email: 'p@example.com', items: [{ id: (await a('GET', `${S}/menu`)).data.items[0].id, qty: 1 }] }, host);
    const [fresh] = (await a('GET', `${S}/orders`)).data.orders;
    const pay = (who, body) => who('POST', `${S}/orders/${fresh.id}/payment`, body);
    assert.equal((await pay(cook, { method: 'Cash' })).status, 200);
    assert.equal((await pay(cook, { clear: true })).status, 403);
    assert.equal((await pay(cook, { method: 'Card' })).status, 403);
    assert.equal((await pay(a, { clear: true })).status, 200);

    // Nobody can park on a domain they do not control: an unproven claim gives way to the next site that asks.
    const b = client();
    await b('POST', '/api/auth/signup', { email: 'other@shop.test', password: 'long-enough-pw' });
    const siteB = (await b('POST', '/api/sites', { name: 'Other Shop', template: 'order' })).data.site;
    assert.equal((await b('POST', `/api/sites/${siteB.id}/domain`, { domain: 'safecafe.com' })).status, 200);
    assert.equal((await a('POST', `${S}/domain`, { domain: 'safecafe.com' })).status, 200);
    assert.equal((await b('GET', `/api/sites/${siteB.id}`)).data.site.customDomain, '');

    // Guessing one account's password is cut off, wherever the guesses come from.
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await fetch(`${a.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-Host': 'app.pfsites.test', 'X-Forwarded-For': `10.0.0.${i}` }, body: JSON.stringify({ email: 'safe@shop.test', password: 'wrong-guess-here' }) })).status;
    assert.equal(last, 429);

    // A full copy of the database is written, and it opens and holds the data.
    const file = app.backup();
    const copy = new DatabaseSync(file, { readOnly: true });
    assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 2);
    assert.equal(copy.prepare("SELECT email FROM users WHERE email = 'safe@shop.test'").get().email, 'safe@shop.test');
    copy.close();
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('recovery codes for two-step sign-in', async () => {
  const { totpCode } = await import('../server/app.js');
  const dir = mkdtempSync(join(tmpdir(), 'pfrc-'));
  const { client, stop } = await boot(dir);
  try {
    const a = client(), other = client();
    await a('POST', '/api/auth/signup', { email: 'rc@shop.test', password: 'long-enough-pw', name: 'Rae' });
    await other('POST', '/api/auth/signup', { email: 'plain@shop.test', password: 'long-enough-pw' });
    assert.equal((await client()('POST', '/api/me/2fa/recovery', {})).status, 401, 'signed out cannot make codes');
    assert.equal((await other('POST', '/api/me/2fa/recovery', {})).status, 409, 'no codes without two-step sign-in');
    const { secret } = (await a('POST', '/api/me/2fa/setup', {})).data;
    assert.equal((await a('POST', '/api/me/2fa/enable', { code: totpCode(secret) })).data.user.twoFactor, true);

    // New codes need the password, like turning two-step off does.
    assert.equal((await a('POST', '/api/me/2fa/recovery', {})).status, 401, 'codes need the password');
    assert.equal((await a('POST', '/api/me/2fa/recovery', { password: 'not-my-password' })).status, 401, 'and the right one');

    // Ten different codes, each signs in once in place of the app code.
    const codes = (await a('POST', '/api/me/2fa/recovery', { password: 'long-enough-pw' })).data.codes;
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    for (const c of codes) assert.match(c, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    assert.equal((await client()('POST', '/api/auth/login', { email: 'rc@shop.test', password: 'wrong-password', code: codes[0] })).status, 401, 'a recovery code does not rescue a wrong password');
    const rc = client();
    assert.equal((await rc('POST', '/api/auth/login', { email: 'rc@shop.test', password: 'long-enough-pw', code: ` ${codes[0].toLowerCase()} ` })).status, 200, 'a recovery code signs in, in any case and with spaces');
    assert.equal((await rc('GET', '/api/sites')).status, 200);
    assert.equal((await client()('POST', '/api/auth/login', { email: 'rc@shop.test', password: 'long-enough-pw', code: codes[0] })).status, 401, 'the same code cannot be used twice');
    // Two log ins sent at the same moment with the same code: only one gets in.
    const both = await Promise.all([client(), client()].map((cl) => cl('POST', '/api/auth/login', { email: 'rc@shop.test', password: 'long-enough-pw', code: codes[2] })));
    assert.deepEqual(both.map((r) => r.status).sort(), [200, 401], 'a code cannot be used twice at the same time');
    assert.equal((await client()('POST', '/api/auth/login', { email: 'rc@shop.test', password: 'long-enough-pw', code: 'AAAAA-AAAAA' })).status, 401, 'a made-up code is refused');

    // A new set replaces the old one.
    const fresh = (await a('POST', '/api/me/2fa/recovery', { password: 'long-enough-pw' })).data.codes;
    assert.equal((await client()('POST', '/api/auth/login', { email: 'rc@shop.test', password: 'long-enough-pw', code: codes[1] })).status, 401, 'an old set stops working once a new one is made');
    assert.equal((await client()('POST', '/api/auth/login', { email: 'rc@shop.test', password: 'long-enough-pw', code: fresh[1] })).status, 200);

    // Codes are kept only as hashes, and go away with two-step sign-in.
    const db = new DatabaseSync(join(dir, 'sites.db'));
    const stored = db.prepare("SELECT recovery FROM users WHERE email = 'rc@shop.test'").get().recovery;
    db.close();
    assert.ok(!fresh.some((c) => stored.includes(c) || stored.includes(c.replace('-', ''))), 'codes are not stored as typed');
    assert.equal(JSON.parse(stored).length, 9, 'a used code is taken off the list');
    assert.equal((await a('POST', '/api/me/2fa/disable', { password: 'long-enough-pw' })).data.user.twoFactor, false);
    assert.equal((await a('POST', '/api/me/2fa/recovery', { password: 'long-enough-pw' })).status, 409, 'codes go away with two-step sign-in');
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('changing the business name (DBA) updates everything and emails the owner', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pfdba-'));
  const { client, stop } = await boot(dir);
  const sent = [], was = mailer.send;
  mailer.send = async (m) => { sent.push(m); };
  try {
    const own = client(), other = client(), anon = client();
    await own('POST', '/api/auth/signup', { email: 'own@dba.test', password: 'long-enough-pw', name: 'Olive Owner' });
    await other('POST', '/api/auth/signup', { email: 'other@dba.test', password: 'long-enough-pw' });
    const site = (await own('POST', '/api/sites', { name: 'Old Name Cafe', template: 'order', kind: 'ordering' })).data.site;
    const S = `/api/sites/${site.id}`;
    assert.equal((await own('POST', `${S}/publish`, {})).status, 200);
    sent.length = 0;
    assert.equal((await own('PUT', `${S}/name`, { name: '   ' })).status, 400, 'a name is needed');
    assert.equal((await other('PUT', `${S}/name`, { name: 'Hijack LLC' })).status, 404, 'someone else cannot rename it');
    const r = await own('PUT', `${S}/name`, { name: '  New  Name   Bakery ' });
    assert.equal(r.status, 200);
    assert.equal(r.data.site.name, 'New Name Bakery', 'spaces tidied');
    assert.equal(r.data.emailed, true);
    await new Promise((done) => setTimeout(done, 30));
    assert.equal(sent.length, 1, 'one email, to the owner');
    assert.equal(sent[0].to, 'own@dba.test');
    assert.match(sent[0].subject, /business name was changed/i);
    for (const bit of ['Old Name Cafe', 'New Name Bakery', 'Olive Owner']) assert.ok(sent[0].text.includes(bit), `email mentions ${bit}`);
    // The dashboard, the website and the live site all carry the new name, with no publish needed.
    const full = (await own('GET', S)).data.site;
    assert.equal(full.name, 'New Name Bakery');
    assert.equal(full.draft.brand.name, 'New Name Bakery');
    assert.equal(full.dirty, false, 'the live site changed too');
    assert.ok((await anon('GET', '/', null, { host: `${site.slug}.pfsites.test` })).text.includes('New Name Bakery'), 'live site shows the new name');
    // Saving the website cannot change the name without the email.
    const saved = await own('PUT', S, { draft: { ...full.draft, brand: { ...full.draft.brand, name: 'Sneaky Name' } }, rev: full.draftRev });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.site.name, 'New Name Bakery');
    assert.equal((await own('GET', S)).data.site.draft.brand.name, 'New Name Bakery');
    assert.equal((await own('POST', `${S}/publish`, { draft: { ...full.draft, brand: { ...full.draft.brand, name: 'Sneaky Name' } } })).data.site.name, 'New Name Bakery', 'nor can publishing');
    // The same name again sends nothing.
    sent.length = 0;
    assert.equal((await own('PUT', `${S}/name`, { name: 'New Name Bakery' })).data.emailed, false);
    await new Promise((done) => setTimeout(done, 30));
    assert.equal(sent.length, 0);
  } finally { mailer.send = was; await stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('a session ends after 16 minutes with no requests at all', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pfidle-'));
  const { client, stop } = await boot(dir);
  try {
    const a = client();
    await a('POST', '/api/auth/signup', { email: 'idle@shop.test', password: 'long-enough-pw', name: 'Ida' });
    const who = "(SELECT id FROM users WHERE email = 'idle@shop.test')";
    const run = (fn) => { const db = new DatabaseSync(join(dir, 'sites.db')); try { return fn(db); } finally { db.close(); } };
    const setSeen = (ms) => run((db) => db.prepare(`UPDATE sessions SET seen_at = ? WHERE user_id = ${who}`).run(ms));
    const seen = () => run((db) => db.prepare(`SELECT seen_at FROM sessions WHERE user_id = ${who}`).all());
    // Ten quiet minutes: still logged in, and the clock starts again.
    setSeen(Date.now() - 10 * 60000);
    assert.equal((await a('GET', '/api/sites')).status, 200);
    assert.ok(Date.now() - seen()[0].seen_at < 5000, 'a request starts the clock again');
    // Sessions from before this change have no time recorded: they carry on, and are timed from now.
    setSeen(0);
    assert.equal((await a('GET', '/api/sites')).status, 200);
    assert.ok(seen()[0].seen_at > 0);
    // Seventeen quiet minutes: the session is over and removed.
    setSeen(Date.now() - 17 * 60000);
    assert.equal((await a('GET', '/api/sites')).status, 401, 'a quiet session ends');
    assert.equal(seen().length, 0, 'and is deleted');
    assert.equal((await a('GET', '/api/me')).data.user, null);
    assert.equal((await a('POST', '/api/auth/login', { email: 'idle@shop.test', password: 'long-enough-pw' })).status, 200, 'logging in again works');
    assert.equal((await a('GET', '/api/sites')).status, 200);
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('an authenticator code works only once', async () => {
  const { totpCode } = await import('../server/app.js');
  const dir = mkdtempSync(join(tmpdir(), 'pfotp-'));
  const { client, stop } = await boot(dir);
  try {
    const a = client();
    await a('POST', '/api/auth/signup', { email: 'once@shop.test', password: 'long-enough-pw', name: 'Oni' });
    const { secret } = (await a('POST', '/api/me/2fa/setup', {})).data;
    const used = totpCode(secret);
    assert.equal((await a('POST', '/api/me/2fa/enable', { code: used })).data.user.twoFactor, true);
    const login = (code) => client()('POST', '/api/auth/login', { email: 'once@shop.test', password: 'long-enough-pw', code });
    let r = await login(used);
    assert.deepEqual([r.status, r.data.twoFactor], [401, true], 'the code used to turn it on cannot also log in');
    assert.match(r.data.error, /can’t be used again/);
    const next = totpCode(secret, Date.now(), 1);
    assert.equal((await login(next)).status, 200, 'the next code logs in');
    assert.equal((await login(next)).status, 401, 'and only once');
    assert.equal((await login(totpCode(secret, Date.now(), -1))).status, 401, 'an older code is refused too');
    // Two log ins at the same moment with one code: only one gets in. (A second account, turned on with the previous code, so the current one is fresh.)
    const b = client();
    await b('POST', '/api/auth/signup', { email: 'race@shop.test', password: 'long-enough-pw', name: 'Ray' });
    const s2 = (await b('POST', '/api/me/2fa/setup', {})).data.secret;
    assert.equal((await b('POST', '/api/me/2fa/enable', { code: totpCode(s2, Date.now(), -1) })).data.user.twoFactor, true);
    const fresh = totpCode(s2);
    const both = await Promise.all([client(), client()].map((cl) => cl('POST', '/api/auth/login', { email: 'race@shop.test', password: 'long-enough-pw', code: fresh })));
    assert.deepEqual(both.map((x) => x.status).sort(), [200, 401], 'one code, one log in, even at the same moment');
    assert.equal((await a('POST', '/api/me/2fa/enable', { code: totpCode(secret, Date.now(), -1) })).status, 409, 'turning it on again while it is on is refused');
    assert.equal((await login(next)).status, 401, 'and does not free a used code');
    // Turning it off and on again starts afresh.
    assert.equal((await a('POST', '/api/me/2fa/disable', { password: 'long-enough-pw' })).data.user.twoFactor, false);
    const again = (await a('POST', '/api/me/2fa/setup', {})).data.secret;
    assert.equal((await a('POST', '/api/me/2fa/enable', { code: totpCode(again) })).data.user.twoFactor, true, 'a new app can be set up');
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('typed-in address headers do not get round the attempt limits', async () => {
  // Fourteen wrong log ins to different accounts: the 13th from one visitor is refused (429); different visitors are not (401).
  const run = async (envExtra, headersFor) => {
    const dir = mkdtempSync(join(tmpdir(), 'pfip-'));
    const app = createApp({ dataDir: dir, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', ...envExtra }, mailer });
    const srv = createServer(app); await new Promise((done) => srv.listen(0, done));
    const base = `http://127.0.0.1:${srv.address().port}`;
    try {
      let last = 0;
      for (let i = 0; i < 14; i++) last = (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-Host': 'app.pfsites.test', ...headersFor(i) }, body: JSON.stringify({ email: `nobody${i}@shop.test`, password: 'wrong-guess-here' }) })).status;
      return last;
    } finally { await new Promise((done) => srv.close(done)); app.close(); rmSync(dir, { recursive: true, force: true }); }
  };
  const xff = (v) => ({ 'X-Forwarded-For': v }), cf = (v) => ({ 'CF-Connecting-IP': v });
  // Reached directly: made-up headers are ignored.
  assert.equal(await run({}, (i) => xff(`10.9.${i}.1`)), 429, 'direct: made-up X-Forwarded-For is ignored');
  assert.equal(await run({}, (i) => cf(`10.9.${i}.1`)), 429, 'direct: made-up CF-Connecting-IP is ignored');
  // Behind one ordinary proxy (TRUST_PROXY=1): the entry the proxy added, at the end, is the visitor.
  assert.equal(await run({ TRUST_PROXY: '1' }, (i) => xff(`10.9.${i}.1`)), 401, 'proxy: each visitor counted on their own');
  assert.equal(await run({ TRUST_PROXY: '1' }, (i) => xff(`10.9.${i}.1, 10.0.0.7`)), 429, 'proxy: a made-up entry in front of the proxy\'s does not help');
  assert.equal(await run({ TRUST_PROXY: '1' }, (i) => ({ ...cf(`10.9.${i}.1`), ...xff('10.0.0.7') })), 429, 'proxy: CF-Connecting-IP passed through an ordinary proxy is not believed');
  assert.equal(await run({ TRUST_PROXY: ' On ' }, (i) => xff(`10.9.${i}.1`)), 401, 'yes, true, on and 1 all count, with spaces and any case');
  // Two proxies (TRUST_PROXY=2): the second entry from the end is the visitor.
  assert.equal(await run({ TRUST_PROXY: '2' }, (i) => xff(`1.1.1.${i}, 10.0.0.7, 10.0.0.1`)), 429, 'two proxies: one visitor stays one visitor');
  assert.equal(await run({ TRUST_PROXY: '2' }, (i) => xff(`10.0.${i}.7, 10.0.0.1`)), 401, 'two proxies: different visitors counted apart');
  // Cloudflare in front of your own server, and Render.
  assert.equal(await run({ TRUST_PROXY: 'cloudflare' }, (i) => cf(`10.9.${i}.1`)), 401, 'Cloudflare: its header is believed');
  assert.equal(await run({ RENDER_GIT_COMMIT: 'abc123' }, (i) => cf(`10.9.${i}.1`)), 401, 'Render: CF-Connecting-IP is believed, as before');
  assert.equal(await run({ RENDER_GIT_COMMIT: 'abc123' }, () => cf('10.9.9.9')), 429, 'Render: one visitor is still one visitor');
  // IPv6: a visitor holds a whole /64, so it counts as one; an IPv4 address written as IPv6 is itself.
  assert.equal(await run({ TRUST_PROXY: '1' }, (i) => xff(`2001:db8:71:2::${(i + 1).toString(16)}`)), 429, 'IPv6: one /64 is one visitor');
  assert.equal(await run({ TRUST_PROXY: '1' }, (i) => xff(`2001:db8:${i + 1}::1`)), 401, 'IPv6: different /64s are different visitors');
  const { ipKey } = await import('../server/app.js');
  assert.equal(ipKey('::ffff:192.0.2.7'), '192.0.2.7');
  assert.equal(ipKey('2001:DB8:71:2::5'), ipKey('2001:db8:71:2:abcd:0:0:9'));
  assert.equal(ipKey('[2001:db8::1]'), '2001:db8:0:0::/64');
  assert.ok(ipKey('x'.repeat(5000)).length <= 64, 'odd values are kept short');
});

test('links in emails never follow a host a request made up', async () => {
  const sent = [], mail = { enabled: true, send: async (m) => { sent.push(m); } };
  for (const [envExtra, want] of [[{}, '127.0.0.1'], [{ RENDER_EXTERNAL_URL: 'https://pf-test.onrender.com' }, 'pf-test.onrender.com']]) {
    const dir = mkdtempSync(join(tmpdir(), 'pfhost-'));
    const app = createApp({ dataDir: dir, env: envExtra, mailer: mail });
    const srv = createServer(app); await new Promise((done) => srv.listen(0, done));
    const base = `http://127.0.0.1:${srv.address().port}`;
    try {
      const signup = await fetch(`${base}/api/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'host@shop.test', password: 'long-enough-pw', name: 'Hal' }) });
      assert.ok([200, 201].includes(signup.status), `signup: ${signup.status}`);
      sent.length = 0;
      await fetch(`${base}/api/auth/forgot`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'https' }, body: JSON.stringify({ email: 'host@shop.test' }) });
      await new Promise((done) => setTimeout(done, 30));
      const link = (sent[0] && sent[0].text.match(/https?:\/\/[^\s]+\/reset\?token=\S+/) || [''])[0];
      assert.ok(link && !link.includes('evil.example') && link.includes(want), `reset link uses the real address: ${link}`);
    } finally { await new Promise((done) => srv.close(done)); app.close(); rmSync(dir, { recursive: true, force: true }); }
  }
});

test('a reset link from the email does not get past two-step sign-in', async () => {
  const { totpCode } = await import('../server/app.js');
  const dir = mkdtempSync(join(tmpdir(), 'pfrs-'));
  const { client, stop } = await boot(dir);
  try {
    const a = client();
    await a('POST', '/api/auth/signup', { email: 'rs@shop.test', password: 'long-enough-pw', name: 'Rio' });
    const { secret } = (await a('POST', '/api/me/2fa/setup', {})).data;
    assert.equal((await a('POST', '/api/me/2fa/enable', { code: totpCode(secret) })).data.user.twoFactor, true);
    // A reset link, as if it had been emailed (or, with staff = 1, made by staff for a locked-out merchant).
    const link = (staff) => {
      const token = `tok-${staff}-${Math.random().toString(36).slice(2)}`;
      const db = new DatabaseSync(join(dir, 'sites.db'));
      const id = db.prepare("SELECT id FROM users WHERE email = 'rs@shop.test'").get().id;
      db.prepare('INSERT INTO resets (token_hash, user_id, expires_at, staff) VALUES (?, ?, ?, ?)').run(createHash('sha256').update(token).digest('hex'), id, Date.now() + 3600000, staff);
      db.close();
      return token;
    };
    const r = client();
    const res = await r('POST', '/api/auth/reset', { token: link(0), password: 'brand-new-password' });
    assert.equal(res.status, 200);
    assert.equal(res.data.twoFactor, true, 'says a code is still needed');
    assert.equal(res.data.user, undefined, 'and does not sign in');
    assert.equal((await r('GET', '/api/sites')).status, 401, 'no session from the link');
    assert.equal((await a('GET', '/api/sites')).status, 401, 'other devices are signed out');
    const l = client();
    assert.equal((await l('POST', '/api/auth/login', { email: 'rs@shop.test', password: 'brand-new-password' })).data.twoFactor, true, 'the new password alone is not enough');
    assert.equal((await l('POST', '/api/auth/login', { email: 'rs@shop.test', password: 'brand-new-password', code: totpCode(secret, Date.now(), 1) })).status, 200, 'the new password and the code sign in');
    // Staff links are the way back in for someone who lost the phone.
    const st = client();
    const res2 = await st('POST', '/api/auth/reset', { token: link(1), password: 'another-new-password' });
    assert.equal(res2.status, 200);
    assert.equal(res2.data.user.email, 'rs@shop.test', 'a staff link signs in');
    assert.equal((await st('GET', '/api/sites')).status, 200);
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('profile changes and two-step sign-in', async () => {
  const { totpCode } = await import('../server/app.js');
  const dir = mkdtempSync(join(tmpdir(), 'pfme-'));
  const { client, stop } = await boot(dir);
  try {
    const a = client(), other = client();
    await a('POST', '/api/auth/signup', { email: 'me@shop.test', password: 'long-enough-pw', name: 'Mel' });
    await other('POST', '/api/auth/signup', { email: 'taken@shop.test', password: 'long-enough-pw' });
    assert.equal((await client()('PUT', '/api/me', { name: 'X' })).status, 401, 'signed out cannot change a profile');

    // Name and phone.
    let r = await a('PUT', '/api/me', { name: 'Melanie Ruiz', phone: '+1 (903) 555-0100' });
    assert.deepEqual([r.status, r.data.user.name, r.data.user.phone], [200, 'Melanie Ruiz', '+1 (903) 555-0100']);
    assert.equal((await a('PUT', '/api/me', { phone: 'call me maybe' })).status, 400);
    assert.equal((await a('GET', '/api/me')).data.user.phone, '+1 (903) 555-0100');
    assert.equal((await other('GET', '/api/me')).data.user.name, '', 'someone else is untouched');

    // Email: needs the password, cannot take someone else's address, and the new one is what signs in.
    assert.equal((await a('POST', '/api/me/email', { email: 'new@shop.test', password: 'wrong-password' })).status, 401);
    assert.equal((await a('POST', '/api/me/email', { email: 'taken@shop.test', password: 'long-enough-pw' })).status, 409);
    assert.equal((await a('POST', '/api/me/email', { email: 'New@Shop.test', password: 'long-enough-pw' })).data.user.email, 'new@shop.test');
    assert.equal((await client()('POST', '/api/auth/login', { email: 'me@shop.test', password: 'long-enough-pw' })).status, 401);
    assert.equal((await client()('POST', '/api/auth/login', { email: 'new@shop.test', password: 'long-enough-pw' })).status, 200);

    // Two-step sign-in: off until a real code proves the app is set up.
    const { secret, uri } = (await a('POST', '/api/me/2fa/setup', {})).data;
    assert.match(uri, /^otpauth:\/\/totp\/.*secret=[A-Z2-7]{32}/);
    assert.equal((await a('POST', '/api/me/2fa/enable', { code: '000000' })).status, 400);
    assert.equal((await client()('POST', '/api/auth/login', { email: 'new@shop.test', password: 'long-enough-pw' })).status, 200, 'still password only until it is switched on');
    const stay = client(); await stay('POST', '/api/auth/login', { email: 'new@shop.test', password: 'long-enough-pw' });
    assert.equal((await a('POST', '/api/me/2fa/enable', { code: totpCode(secret) })).data.user.twoFactor, true);
    assert.equal((await stay('GET', '/api/sites')).status, 401, 'other devices are signed out when it is switched on');
    assert.equal((await a('GET', '/api/me')).data.user.twoFactor, true);

    // Now the password alone is refused, a wrong code is refused, the right one works.
    const dev = client();
    r = await dev('POST', '/api/auth/login', { email: 'new@shop.test', password: 'long-enough-pw' });
    assert.deepEqual([r.status, r.data.twoFactor], [401, true]);
    assert.equal((await dev('GET', '/api/sites')).status, 401);
    assert.equal((await dev('POST', '/api/auth/login', { email: 'new@shop.test', password: 'long-enough-pw', code: '123456' })).status, 401);
    assert.equal((await dev('POST', '/api/auth/login', { email: 'new@shop.test', password: 'wrong-password', code: totpCode(secret) })).status, 401, 'a right code does not rescue a wrong password');
    // The code that turned it on counts as used, so the next code is the one that logs in.
    const next = totpCode(secret, Date.now(), 1);
    assert.equal((await dev('POST', '/api/auth/login', { email: 'new@shop.test', password: 'long-enough-pw', code: ` ${next.slice(0, 3)} ${next.slice(3)} ` })).status, 200);
    assert.equal((await dev('GET', '/api/sites')).status, 200);

    // Turning it off needs the password.
    assert.equal((await a('POST', '/api/me/2fa/disable', { password: 'nope-nope-nope' })).status, 401);
    assert.equal((await a('POST', '/api/me/2fa/disable', { password: 'long-enough-pw' })).data.user.twoFactor, false);
    assert.equal((await client()('POST', '/api/auth/login', { email: 'new@shop.test', password: 'long-enough-pw' })).status, 200);

    // Notifications belong to the shop: its owner reads them, a stranger does not.
    const site = (await a('POST', '/api/sites', { name: 'Bell Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price\nTaco,10.00' })).data.site;
    await a('POST', `/api/sites/${site.id}/publish`, {});
    const [item] = (await a('GET', `/api/sites/${site.id}/menu`)).data.items;
    await client()('POST', '/_order', { method: 'pickup', name: 'Ana', phone: '903-555-0100', email: 'ana@example.com', items: [{ id: item.id, qty: 1 }] }, { host: 'bellcafe.pfsites.test' });
    const notes = (await a('GET', `/api/sites/${site.id}/notifications`)).data.notifications;
    assert.ok(notes.some((n) => n.kind === 'order' && n.open && /Ana/.test(n.text)));
    assert.equal((await other('GET', `/api/sites/${site.id}/notifications`)).status, 404);
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('counter sales: saved paid in one step, no fake customers, saved details kept, counted as collected', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pfsale-'));
  const { client, stop } = await boot(dir);
  try {
    const me = client();
    await me('POST', '/api/auth/signup', { email: 'owner@sale.test', password: 'long-enough-pw', name: 'Owner' });
    const site = (await me('POST', '/api/sites', { name: 'Sale Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price\nTaco,3.00' })).data.site;
    const S = `/api/sites/${site.id}`;
    await me('POST', `${S}/contacts`, { name: 'Dana Lee', email: 'dana@acme.test', phone: '903-555-0101', address: '1 Main St' });
    // A walk-in sale: paid straight away, and nobody is added to Customers.
    let r = await me('POST', `${S}/invoices`, { walkIn: true, customer: { name: 'Walk-in customer' }, items: [{ name: 'Sale', qty: 1, price: 1500 }], paidMethod: 'Cash', paidNote: 'Recorded with New sale' });
    assert.equal(r.status, 201); assert.equal(r.data.invoice.status, 'paid'); assert.equal(r.data.invoice.paidMethod, 'Cash');
    assert.ok(!(await me('GET', `${S}/customers`)).text.includes('Walk-in'), 'walk-in not saved as a customer');
    // A sale for a saved customer sending only some details keeps the address and phone already on file.
    await me('POST', `${S}/invoices`, { customer: { name: 'Dana Lee', email: 'dana@acme.test' }, items: [{ name: 'Sale', qty: 1, price: 2500 }], paidMethod: 'Check' });
    const dana = (await me('GET', `${S}/invoices`)).data.contacts.find((c) => c.email === 'dana@acme.test');
    assert.deepEqual([dana.address, dana.phone], ['1 Main St', '903-555-0101']);
    // The money shows as collected today alongside orders.
    const st = (await me('GET', `${S}/stats?range=today`)).data;
    assert.equal(st.money.collected, 4000);
    assert.deepEqual(st.money.tenders.map((t) => t.method).sort(), ['Cash', 'Check']);
    assert.ok(/^[\w.-]{4,40}$/.test((await me('GET', '/version')).text), 'version endpoint');
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});
