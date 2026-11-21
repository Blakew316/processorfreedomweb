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
import { createApp } from '../server/app.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROUTES = [...readFileSync(join(here, '../server/app.js'), 'utf8').matchAll(/route\('(GET|POST|PUT|DELETE)', '(\/api\/sites\/:id[^']*)'/g)].map((m) => [m[1], m[2]]);
const env = { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test' };
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
    for (const [m, p, body] of [['PUT', '', { draft: beforeA[''].site.draft }], ['PUT', '/ordering', { ordering: { enabled: false } }], ['DELETE', '', undefined], ['POST', '/team', { email: 'x@y.test', role: 'owner' }], ['GET', '/invoices', undefined], ['GET', '/customers', undefined], ['POST', '/unpublish', {}], ['DELETE', `/menu/${ids.item}`, undefined], ['POST', '/gift-cards', { amount: 100 }]]) {
      assert.equal((await cook(m, `/api/sites/${siteA.id}${p}`, body)).status, 403, `kitchen login: ${m} ${p || '/'}`);
    }
    assert.equal((await cook('GET', `/api/sites/${siteB.id}/orders`)).status, 404, 'a team member of A is nobody on B');

    // Signing out ends the session for good, even if someone kept the cookie.
    const kept = b.cookie();
    await b('POST', '/api/auth/logout', {});
    assert.equal((await client(kept)('GET', '/api/sites')).status, 401);
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
