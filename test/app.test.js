import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.js';
import { slugify, cleanSlug, slugProblem, safeUrl, safeImg, cleanDomain, createSite, normalizeSite, readableAccent, contrast, TEMPLATES, LEGAL_PAGES } from '../shared/core.js';
import { renderPage } from '../shared/render.js';

test('business names become web addresses', () => {
  assert.equal(slugify("Joe's Pizza & Pasta"), 'joespizzaandpasta');
  assert.equal(slugify('Los Socios Café'), 'lossocioscafe');
  assert.equal(cleanSlug(' --Los Socios--Cafe! '), 'los-socios-cafe');
  assert.ok(slugProblem('ab'));
  assert.ok(slugProblem('admin'));
  assert.equal(slugProblem('joespizza'), '');
});

test('links, images and domains are restricted to safe values', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('//evil.example'), '');
  assert.equal(safeUrl('#menu'), '#menu');
  assert.equal(safeUrl('example.com/pay'), 'https://example.com/pay');
  assert.equal(safeUrl('(903) 489-0314'), 'tel:9034890314');
  assert.equal(safeUrl('hi@example.com'), 'mailto:hi@example.com');
  assert.equal(safeImg('/u/abc.png'), '/u/abc.png');
  assert.equal(safeImg('/u/../secret'), '');
  assert.equal(safeImg('javascript:x'), '');
  assert.equal(cleanDomain('https://WWW.Example.com/path'), 'www.example.com');
  assert.equal(cleanDomain('not a domain'), '');
});

test('every template renders every page without leaking raw markup', () => {
  for (const t of TEMPLATES) {
    const site = normalizeSite(createSite('<script>alert(1)</script> & Co', t.id));
    for (const page of ['home', ...Object.keys(LEGAL_PAGES)]) {
      const out = renderPage(site, page, { base: '/s/x', url: 'https://x.test/' });
      assert.equal(out.status, 200, `${t.id}/${page}`);
      assert.ok(!out.html.includes('<script>alert(1)'), `${t.id}/${page} escaped`);
      assert.ok(!/\bundefined\b|\[object Object\]/.test(out.html), `${t.id}/${page} clean`);
    }
    assert.equal(renderPage(site, 'missing').status, 404);
  }
});

test('hostile site data is neutralised', () => {
  const site = normalizeSite({ brand: { name: 'X', logo: 'javascript:alert(1)' }, theme: { accent: 'red;}</style><script>' }, sections: [{ type: 'hero', data: { title: '"><img src=x onerror=alert(1)>', primary: { label: 'Go', href: 'javascript:alert(1)' }, image: '" onload="x' } }, { type: 'bogus' }, null] });
  assert.equal(site.sections.length, 1);
  const { html } = renderPage(site, 'home');
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('javascript:alert'));
  assert.ok(!html.includes('red;}'));
});

test('brand colours stay readable in light and dark mode', () => {
  for (const c of ['#ffff00', '#1d1d1f', '#ffffff', '#000000', '#0071e3']) {
    assert.ok(contrast(readableAccent(c, '#ffffff'), '#ffffff') >= 4.5, `${c} on white`);
    assert.ok(contrast(readableAccent(c, '#000000'), '#000000') >= 4.5, `${c} on black`);
  }
});

/* ---------- full flow against a running server ---------- */

let server, base, dir, app;
const mainSent = [];
// Staff powers only switch on once the address is confirmed by opening a link sent to it.
async function confirmEmail(c, email, password, box) {
  await c('POST', '/api/auth/forgot', { email });
  const token = box.filter((m) => m.to === email).at(-1).text.match(/token=([\w-]+)/)[1];
  assert.equal((await c('POST', '/api/auth/reset', { token, password })).status, 200);
}
const dnsAnswers = { cname: {}, a: {}, txt: {} };
const dns = { resolveCname: async (n) => dnsAnswers.cname[n] || Promise.reject(new Error('ENOTFOUND')), resolve4: async (n) => dnsAnswers.a[n] || Promise.reject(new Error('ENOTFOUND')), resolveTxt: async (n) => dnsAnswers.txt[n] || Promise.reject(new Error('ENOTFOUND')) };

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pfsites-'));
  app = createApp({ dataDir: dir, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1', ADMIN_EMAILS: 'staff@pf.test' }, mailer: { enabled: false, send: async (m) => { mainSent.push(m); } } });
  server = createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); app.close(); rmSync(dir, { recursive: true, force: true }); });

function client() {
  let cookie = '';
  return async (method, path, body, { host = 'app.pfsites.test', raw = false, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method, redirect: 'manual',
      headers: { 'X-Forwarded-Host': host, ...(cookie ? { Cookie: cookie } : {}), ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? (raw ? body : JSON.stringify(body)) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
}

test('sign up, build, publish, serve, collect a message, connect a domain', async () => {
  const anon = client();
  const me = client();
  assert.equal((await anon('GET', '/api/sites')).status, 401);
  assert.equal((await me('POST', '/api/auth/signup', { email: 'Owner@Shop.test', password: 'short' })).status, 400);
  assert.equal((await me('POST', '/api/auth/signup', { email: 'Owner@Shop.test', name: 'Owner', password: 'long-enough-pw' })).status, 201);
  assert.equal((await client()('POST', '/api/auth/signup', { email: 'owner@shop.test', password: 'long-enough-pw' })).status, 409);
  assert.equal((await client()('POST', '/api/auth/login', { email: 'owner@shop.test', password: 'wrong-password' })).status, 401);
  assert.equal((await client()('POST', '/api/auth/login', { email: 'owner@shop.test', password: 'long-enough-pw' })).status, 200);

  let r = await me('GET', '/api/address?name=' + encodeURIComponent("Joe's Pizza"));
  assert.deepEqual([r.data.slug, r.data.available, r.data.address], ['joespizza', true, 'joespizza.pfsites.test']);

  r = await me('POST', '/api/sites', { name: "Joe's Pizza", template: 'restaurant', phone: '555-123-4567' });
  assert.equal(r.status, 201);
  const site = r.data.site;
  assert.equal(site.slug, 'joespizza');
  assert.equal(site.url, 'https://joespizza.pfsites.test');
  assert.equal((await me('GET', '/api/address?name=' + encodeURIComponent("Joe's Pizza"))).data.available, false);
  assert.equal((await me('POST', '/api/sites', { name: "Joe's Pizza", template: 'cafe' })).data.site.slug, 'joespizza2');

  // Not visible until published
  assert.equal((await anon('GET', '/', null, { host: 'joespizza.pfsites.test' })).status, 404);
  assert.equal((await anon('GET', '/', null, { host: 'nobody.pfsites.test' })).status, 404);

  site.draft.sections[0].data.title = 'Best pizza in <b>town</b>';
  // A save has to say which saved copy it was made from; an old copy is refused.
  assert.equal((await me('PUT', `/api/sites/${site.id}`, { draft: site.draft })).status, 412);
  assert.equal((await me('PUT', `/api/sites/${site.id}`, { draft: site.draft, rev: 'old' })).status, 412);
  assert.equal((await me('PUT', `/api/sites/${site.id}`, { draft: site.draft, rev: site.draftRev })).status, 200);
  assert.equal((await client()('PUT', `/api/sites/${site.id}`, { draft: site.draft })).status, 401);
  r = await me('POST', `/api/sites/${site.id}/publish`, {});
  assert.equal(r.data.site.live, true);

  r = await anon('GET', '/', null, { host: 'joespizza.pfsites.test' });
  assert.equal(r.status, 200);
  assert.match(r.data, /Best pizza in &lt;b&gt;town/);
  assert.match(r.data, /<link rel="canonical" href="http:\/\/joespizza\.pfsites\.test\/">/);
  for (const p of ['/privacy', '/terms', '/policies', '/accessibility', '/sitemap.xml', '/robots.txt']) assert.equal((await anon('GET', p, null, { host: 'joespizza.pfsites.test' })).status, 200, p);
  assert.equal((await anon('GET', '/nope', null, { host: 'joespizza.pfsites.test' })).status, 404);
  assert.equal((await anon('GET', '/s/joespizza/', null)).status, 200);
  assert.equal((await anon('GET', '/s/joespizza', null)).status, 301);
  // The builder is never served on a customer's address
  assert.equal((await anon('GET', '/api/me', null, { host: 'joespizza.pfsites.test' })).status, 404);

  // Draft edits do not leak to the live site until republished
  site.draft.brand.tagline = 'Unreleased tagline';
  r = await me('PUT', `/api/sites/${site.id}`, { draft: site.draft, rev: (await me('GET', `/api/sites/${site.id}`)).data.site.draftRev });
  assert.equal(r.data.site.dirty, true);
  assert.doesNotMatch((await anon('GET', '/', null, { host: 'joespizza.pfsites.test' })).data, /Unreleased tagline/);
  assert.match((await me('GET', `/preview/${site.id}/`)).data, /Unreleased tagline/);
  assert.equal((await anon('GET', `/preview/${site.id}/`)).status, 302);

  // Contact form
  const form = (b) => anon('POST', '/_forms/contact', b, { host: 'joespizza.pfsites.test' });
  assert.equal((await form({ name: 'Ana', email: 'bad', message: 'Hi' })).status, 400);
  assert.equal((await form({ name: 'Ana', email: 'ana@example.com', message: 'Do you cater?' })).status, 200);
  assert.equal((await form({ name: 'Bot', email: 'bot@example.com', message: 'spam', company_website: 'http://spam' })).status, 200);
  r = await me('GET', `/api/sites/${site.id}/leads`);
  assert.deepEqual(r.data.leads.map((l) => l.name), ['Ana']);

  // Another account cannot touch this site
  const other = client();
  await other('POST', '/api/auth/signup', { email: 'other@shop.test', password: 'long-enough-pw' });
  assert.equal((await other('GET', `/api/sites/${site.id}`)).status, 404);
  assert.equal((await other('DELETE', `/api/sites/${site.id}`)).status, 404);
  assert.equal((await other('GET', '/api/admin')).status, 403);

  // Cross-site writes are refused
  assert.equal((await me('DELETE', `/api/sites/${site.id}`, null, { headers: { Origin: 'https://evil.example' } })).status, 403);

  // Change of address
  assert.equal((await me('PUT', `/api/sites/${site.id}/address`, { slug: 'admin' })).status, 400);
  assert.equal((await me('PUT', `/api/sites/${site.id}/address`, { slug: 'joespizza2' })).status, 409);
  assert.equal((await me('PUT', `/api/sites/${site.id}/address`, { slug: 'Joes Pizzeria' })).data.site.slug, 'joes-pizzeria');
  assert.equal((await anon('GET', '/', null, { host: 'joes-pizzeria.pfsites.test' })).status, 200);

  // Own domain: only served after DNS points at us
  assert.equal((await me('POST', `/api/sites/${site.id}/domain`, { domain: 'x.pfsites.test' })).status, 400);
  // The service's own address can never become a merchant's domain.
  assert.equal((await me('POST', `/api/sites/${site.id}/domain`, { domain: 'app.pfsites.test' })).status, 400);
  assert.equal((await me('POST', `/api/sites/${site.id}/domain`, { domain: 'www.app.pfsites.test' })).status, 400);
  r = await me('POST', `/api/sites/${site.id}/domain`, { domain: 'https://www.joespizza.com/' });
  assert.equal(r.data.site.customDomain, 'joespizza.com');
  const proof = r.data.site.domainProof;
  assert.equal(proof.name, '_pf-verify.joespizza.com');
  assert.match(proof.value, /^pf-verify=[\w-]{32}$/);
  // Until the domain is proven, the business's site is not served there (our own policy page is, like any unknown address).
  assert.notEqual((await anon('GET', '/menu', null, { host: 'joespizza.com' })).status, 200);
  assert.ok(!String((await anon('GET', '/privacy', null, { host: 'joespizza.com' })).data).includes('Joe’s Pizza'));
  assert.ok(!String((await anon('GET', '/privacy', null, { host: 'joespizza.com' })).data).includes("Joe's Pizza"));
  assert.equal((await me('POST', `/api/sites/${site.id}/domain/verify`)).data.ok, false);
  dnsAnswers.cname['www.joespizza.com'] = ['app.pfsites.test'];
  // Pointing the domain here is not enough: anyone could claim a domain that points here. The TXT proof has to match this site.
  r = await me('POST', `/api/sites/${site.id}/domain/verify`);
  assert.equal(r.data.ok, false);
  assert.equal(r.data.pointed, true);
  dnsAnswers.txt['_pf-verify.joespizza.com'] = [['pf-verify=somebody-elses-proof-value-000000']];
  assert.equal((await me('POST', `/api/sites/${site.id}/domain/verify`)).data.ok, false);
  dnsAnswers.txt['_pf-verify.joespizza.com'] = [[proof.value.slice(0, 20), proof.value.slice(20)]];
  r = await me('POST', `/api/sites/${site.id}/domain/verify`);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.site.domainProof, null);
  assert.equal(r.data.site.url, 'https://joespizza.com');
  assert.equal((await anon('GET', '/privacy', null, { host: 'joespizza.com' })).status, 200);
  // One address per site: www and the free address send visitors to the connected domain; form posts are answered where they arrive.
  let moved = await anon('GET', '/privacy?x=1', null, { host: 'www.joespizza.com' });
  assert.deepEqual([moved.status, moved.headers.get('location')], [301, 'https://joespizza.com/privacy?x=1']);
  moved = await anon('GET', '/', null, { host: 'joes-pizzeria.pfsites.test' });
  assert.deepEqual([moved.status, moved.headers.get('location')], [301, 'https://joespizza.com/']);
  assert.notEqual((await anon('POST', '/_forms/contact', { name: 'A', email: 'a@b.test', message: 'Hi' }, { host: 'joes-pizzeria.pfsites.test' })).status, 301);

  // Domain requests reach staff, who can attach a domain directly
  r = await me('POST', '/api/sites', { name: 'Second Shop', template: 'retail' });
  const second = r.data.site;
  assert.equal((await me('POST', `/api/sites/${second.id}/domain-request`, { desired: 'secondshop.com' })).status, 201);
  const staff = client();
  r = await staff('POST', '/api/auth/signup', { email: 'staff@pf.test', password: 'long-enough-pw' });
  assert.equal(r.data.user.admin, false, 'signing up with a staff address is not enough');
  assert.equal((await staff('GET', '/api/admin')).status, 403);
  await confirmEmail(staff, 'staff@pf.test', 'long-enough-pw', mainSent);
  r = await staff('GET', '/api/admin');
  assert.equal(r.data.requests[0].desired, 'secondshop.com');
  assert.equal((await staff('POST', `/api/admin/sites/${second.id}/domain`, { domain: 'joespizza.com' })).status, 409);
  assert.equal((await staff('POST', `/api/admin/sites/${second.id}/domain`, { domain: 'secondshop.com' })).status, 200);
  await me('POST', `/api/sites/${second.id}/publish`, {});
  assert.equal((await anon('GET', '/', null, { host: 'secondshop.com' })).status, 200);

  // Unpublish and delete
  assert.equal((await me('POST', `/api/sites/${site.id}/unpublish`)).data.site.live, false);
  assert.equal((await anon('GET', '/', null, { host: 'joespizza.com' })).status, 404);
  assert.equal((await me('DELETE', `/api/sites/${site.id}`)).status, 200);
  assert.equal((await me('GET', `/api/sites/${site.id}`)).status, 404);
});

test('uploads accept images only and are served safely', async () => {
  const me = client();
  await me('POST', '/api/auth/signup', { email: 'img@shop.test', password: 'long-enough-pw' });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  assert.equal((await client()('POST', '/api/uploads', png, { raw: true })).status, 401);
  assert.equal((await me('POST', '/api/uploads', Buffer.from('<html><script>alert(1)</script>'), { raw: true })).status, 415);
  const r = await me('POST', '/api/uploads', png, { raw: true });
  assert.equal(r.status, 201);
  const got = await client()('GET', r.data.url, null, { host: 'anything.pfsites.test' });
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.match(got.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await client()('GET', '/u/..%2Fsites.db')).status, 404);
});

/* ---------- online ordering ---------- */

import { parsePrice, parseCsv, parseMenuCsv, MENU_TEMPLATE_CSV, orderTotals, defaultOrdering } from '../shared/core.js';

test('prices are read from the formats people actually type', () => {
  const cases = { '$1,234.50': 123450, '12': 1200, '9,50': 950, '1.234,50': 123450, '12.5': 1250, ' $ 3.00 ': 300, 'Free': 0, '4.99 USD': 499, '0': 0, 'abc': null, '': null, '-5': null, 'call': null };
  for (const [text, cents] of Object.entries(cases)) assert.equal(parsePrice(text), cents, text);
});

test('item lists are parsed for name and price', () => {
  assert.deepEqual(parseCsv('a,"b ""q"", c",d\r\n"multi\nline",2,3\n\n'), [['a', 'b "q", c', 'd'], ['multi\nline', '2', '3']]);
  const t = parseMenuCsv(MENU_TEMPLATE_CSV);
  assert.equal(t.errors.length, 0);
  assert.deepEqual(t.items.map((x) => [x.category, x.name, x.price, x.stock]), [['Tacos', 'Taco al pastor', 350, null], ['Tacos', 'Carne asada taco', 375, null], ['Plates', 'Enchiladas verdes', 1299, null], ['Drinks', 'Horchata', 300, 40], ['Desserts', 'Churros', 550, 12]]);
  // Different column order and names, a BOM, quoted prices with commas, and bad rows
  const odd = parseMenuCsv('﻿PRICE,Product Name,Section\n"$1,200.00",Catering tray,Catering\n8,Quesadilla,\nabc,Mystery,\n,No price,\n5.5,,\n');
  assert.deepEqual(odd.items.map((x) => [x.name, x.price, x.category]), [['Catering tray', 120000, 'Catering'], ['Quesadilla', 800, 'Catering']]);
  assert.deepEqual(odd.errors.map((e) => e.row), [4, 5, 6]);
  // No header row at all
  assert.deepEqual(parseMenuCsv('Taco,3.50\nBurrito,$9\nNachos,7.25').items.map((x) => [x.name, x.price]), [['Taco', 350], ['Burrito', 900], ['Nachos', 725]]);
  // Semicolons with decimal commas
  assert.deepEqual(parseMenuCsv('Item;Price\nAgua fresca;2,50').items[0].price, 250);
  assert.equal(parseMenuCsv('just some words\nmore words').items.length, 0);
  assert.equal(parseMenuCsv('').items.length, 0);
});

test('order totals', () => {
  const o = { ...defaultOrdering(), taxRate: 8.25, deliveryFee: 399 };
  assert.deepEqual(orderTotals([{ price: 350, qty: 3 }, { price: 1299, qty: 1 }], 'delivery', o, 15), { subtotal: 2349, discount: 0, tax: 194, fee: 399, tip: 352, total: 3294 });
  assert.equal(orderTotals([{ price: 350, qty: 1 }], 'pickup', o, 0).fee, 0);
});

test('ordering: build from an item list, take an order, track stock, send emails', async () => {
  const sent = [];
  const dir2 = mkdtempSync(join(tmpdir(), 'pfsites-'));
  const app2 = createApp({ dataDir: dir2, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: true, send: async (m) => { sent.push(m); } } });
  const server2 = createServer(app2);
  await new Promise((r) => server2.listen(0, r));
  const prevBase = base; base = `http://127.0.0.1:${server2.address().port}`;
  try {
    const me = client(), anon = client();
    await me('POST', '/api/auth/signup', { email: 'cafe@shop.test', password: 'long-enough-pw' });
    let r = await me('POST', '/api/sites', { name: 'Los Socios', template: 'restaurant', kind: 'ordering', methods: { pickup: true, curbside: true, delivery: true }, csv: MENU_TEMPLATE_CSV, email: 'owner@lossocios.test' });
    const site = r.data.site;
    assert.equal(site.ordering.enabled, true);
    assert.ok(site.draft.sections.some((s) => s.type === 'menu'));
    r = await me('GET', `/api/sites/${site.id}/menu`);
    assert.equal(r.data.items.length, 5);
    const [taco, , , , churros] = r.data.items;
    const host = { host: 'lossocios.pfsites.test' };

    // Import: add, then replace; bad files are refused with a reason
    assert.equal((await me('POST', `/api/sites/${site.id}/menu/import`, { csv: 'nothing useful' })).status, 400);
    assert.equal((await me('POST', `/api/sites/${site.id}/menu/import`, { csv: 'Flan,4.50' })).data.items.length, 6);
    assert.equal((await client()('POST', `/api/sites/${site.id}/menu/import`, { csv: 'Flan,4.50' })).status, 401);

    // Item edits: price text is parsed, photo must be an uploaded or https image
    r = await me('PUT', `/api/sites/${site.id}/menu/${taco.id}`, { price: '$4.25', image: 'javascript:x' });
    assert.deepEqual([r.data.items[0].price, r.data.items[0].image], [425, '']);
    assert.equal((await me('PUT', `/api/sites/${site.id}/menu/${taco.id}`, { price: 'lots' })).status, 400);

    // Settings
    assert.equal((await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { enabled: true, methods: {} } })).status, 400);
    r = await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, taxRate: 8.25, deliveryFee: 399, deliveryMin: 1500 } });
    assert.equal(r.data.ordering.deliveryFee, 399);

    // Nothing is orderable until the site is published
    const place = (b) => anon('POST', '/_order', b, host);
    const who = { name: 'Ana Ruiz', phone: '903-555-0100', email: 'ana@example.com' };
    assert.equal((await place({ ...who, method: 'pickup', items: [{ id: taco.id, qty: 1 }] })).status, 404);
    await me('POST', `/api/sites/${site.id}/publish`, {});
    r = await anon('GET', '/order', null, host);
    assert.equal(r.status, 200);
    assert.match(r.data, /Taco al pastor/);
    assert.match(r.data, /\$4\.25/);
    assert.match((await anon('GET', '/', null, host)).data, /Order online/);
    assert.match((await anon('GET', '/sitemap.xml', null, host)).data, /\/order</);

    // Validation
    assert.equal((await place({ ...who, method: 'pickup', items: [] })).status, 400);
    assert.equal((await place({ ...who, email: 'nope', method: 'pickup', items: [{ id: taco.id, qty: 1 }] })).status, 400);
    assert.equal((await place({ ...who, method: 'dinein', items: [{ id: taco.id, qty: 1 }] })).status, 400);
    assert.equal((await place({ ...who, method: 'delivery', items: [{ id: taco.id, qty: 1 }] })).status, 400, 'delivery needs an address');
    assert.equal((await place({ ...who, method: 'delivery', address: '1 Main St', items: [{ id: taco.id, qty: 1 }] })).status, 400, 'below delivery minimum');
    assert.equal((await place({ ...who, method: 'curbside', items: [{ id: taco.id, qty: 1 }] })).status, 400, 'curbside needs a vehicle');
    assert.equal((await place({ ...who, method: 'pickup', items: [{ id: 'made-up', qty: 1 }] })).status, 409);
    assert.equal((await place({ ...who, method: 'pickup', items: [{ id: churros.id, qty: 13 }] })).status, 409, 'only 12 in stock');
    assert.equal(sent.length, 0);

    // A real order: prices come from the server, never the browser
    r = await place({ ...who, method: 'delivery', address: '14758 FM 59, Athens TX', tip: 15, notes: 'Extra salsa', items: [{ id: taco.id, qty: 2, price: 1 }, { id: churros.id, qty: 2 }] });
    assert.equal(r.status, 201);
    assert.equal(r.data.number, 1001);
    await new Promise((x) => setTimeout(x, 20));
    r = await me('GET', `/api/sites/${site.id}/orders`);
    const order = r.data.orders[0];
    assert.deepEqual([order.subtotal, order.tax, order.fee, order.tip, order.total], [1950, 161, 399, 293, 2803]);
    assert.equal(order.status, 'new');
    assert.equal((await me('GET', `/api/sites/${site.id}/menu`)).data.items.find((x) => x.id === churros.id).stock, 10);

    // Emails: one to the customer, one to the business
    assert.deepEqual(sent.map((m) => m.to).sort(), ['ana@example.com', 'cafe@shop.test']);
    const toCustomer = sent.find((m) => m.to === 'ana@example.com');
    assert.match(toCustomer.subject, /We have your order · Los Socios #1001/);
    assert.match(toCustomer.html, /2 × Taco al pastor/);
    assert.match(toCustomer.html, /\$28\.03/);
    assert.match(toCustomer.html, new RegExp(`https://lossocios\\.pfsites\\.test/order/${order.token}`));
    assert.match(sent.find((m) => m.to === 'cafe@shop.test').subject, /New delivery order #1001/);

    // Customer status page; guessing a token gets nothing
    r = await anon('GET', `/order/${order.token}`, null, host);
    assert.equal(r.status, 200);
    assert.match(r.data, /We have your order/);
    assert.equal((await anon('GET', '/order/aaaaaaaaaaaaaaaaaaaaaaaa', null, host)).status, 404);

    // Confirm, ready, then a second order is cancelled and its stock returns
    sent.length = 0;
    assert.equal((await me('POST', `/api/sites/${site.id}/orders/${order.id}`, { status: 'confirmed' })).data.order.status, 'confirmed');
    await me('POST', `/api/sites/${site.id}/orders/${order.id}`, { status: 'ready' });
    await new Promise((x) => setTimeout(x, 20));
    assert.deepEqual(sent.map((m) => m.subject.split(' · ')[0]), ['Your order is confirmed', 'Your order is on its way']);
    assert.match((await anon('GET', `/order/${order.token}`, null, host)).data, /on its way/);
    assert.equal((await client()('POST', `/api/sites/${site.id}/orders/${order.id}`, { status: 'cancelled' })).status, 401);
    r = await place({ ...who, method: 'curbside', vehicle: 'Blue Tacoma', items: [{ id: churros.id, qty: 10 }] });
    assert.equal(r.data.number, 1002);
    assert.match((await anon('GET', '/order', null, host)).data, /Sold out/);
    assert.equal((await place({ ...who, method: 'pickup', items: [{ id: churros.id, qty: 1 }] })).status, 409);
    const second = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
    await me('POST', `/api/sites/${site.id}/orders/${second.id}`, { status: 'cancelled' });
    assert.equal((await me('GET', `/api/sites/${site.id}/menu`)).data.items.find((x) => x.id === churros.id).stock, 10);

    // Pausing stops new orders
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, accepting: false } });
    assert.equal((await place({ ...who, method: 'pickup', items: [{ id: taco.id, qty: 1 }] })).status, 409);
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, enabled: false } });
    assert.equal((await anon('GET', '/order', null, host)).status, 404);

    // A plain website has no order page
    const plain = (await me('POST', '/api/sites', { name: 'Plain Shop', template: 'retail', kind: 'website' })).data.site;
    assert.equal(plain.ordering.enabled, false);
    await me('POST', `/api/sites/${plain.id}/publish`, {});
    assert.equal((await anon('GET', '/order', null, { host: 'plainshop.pfsites.test' })).status, 404);
  } finally { base = prevBase; server2.close(); app2.close(); rmSync(dir2, { recursive: true, force: true }); }
});

test('staff dashboard and password change', async () => {
  const staff = client();
  let r = await staff('POST', '/api/auth/login', { email: 'staff@pf.test', password: 'long-enough-pw' });
  assert.equal(r.data.user.admin, true);
  r = await staff('GET', '/api/admin');
  assert.equal(r.status, 200);
  for (const k of ['users', 'sites', 'live', 'orders', 'sales', 'leads', 'items']) assert.equal(typeof r.data.stats[k], 'number', k);
  assert.ok(r.data.users.some((u) => u.email === 'owner@shop.test'));
  assert.ok(Array.isArray(r.data.orders));
  assert.equal((await staff('POST', '/api/auth/password', { current: 'wrong', next: 'another-long-pw' })).status, 401);
  assert.equal((await staff('POST', '/api/auth/password', { current: 'long-enough-pw', next: 'short' })).status, 400);
  assert.equal((await staff('POST', '/api/auth/password', { current: 'long-enough-pw', next: 'another-long-pw' })).status, 200);
  assert.equal((await client()('POST', '/api/auth/login', { email: 'staff@pf.test', password: 'long-enough-pw' })).status, 401);
  assert.equal((await client()('POST', '/api/auth/login', { email: 'staff@pf.test', password: 'another-long-pw' })).status, 200);
});

test('design options: backgrounds, header and footer styles, quick styles', async () => {
  const { applyQuickStyle, QUICK_STYLES } = await import('../shared/core.js');
  const { themeVars } = await import('../shared/render.js');
  const site = normalizeSite(createSite('Colour Test', 'order', { kind: 'ordering', accent: '#d1372f' }));
  assert.match(renderPage(site, 'home').html, /class="hdr sticky"/);
  applyQuickStyle(site, 'bold');
  site.header.layout = 'center'; site.footer.style = 'simple'; site.theme.bg = '#1c1c1e';
  const out = renderPage(normalizeSite(site), 'home').html;
  assert.match(out, /class="hdr sticky center on-brand"/);
  assert.match(out, /class="hero center on-brand"/);
  assert.match(out, /class="ftr simple on-brand"/);
  assert.match(themeVars(site), /color-scheme:dark;--bg:#1c1c1e/);
  assert.match(themeVars(site), /--brand:#d1372f;--on-brand:#ffffff/);
  // Unknown values fall back rather than reaching the page
  const bad = normalizeSite({ ...site, theme: { ...site.theme, bg: 'url(x)' }, header: { ...site.header, layout: '"><x', style: 'nope' }, footer: { ...site.footer, color: 'x', style: 'y' }, sections: site.sections.map((s) => ({ ...s, bg: 'evil"' })) });
  assert.deepEqual([bad.theme.bg, bad.header.layout, bad.header.style, bad.footer.color, bad.footer.style, bad.sections[0].bg], ['', 'left', 'glass', 'soft', 'columns', '']);
  for (const k of Object.keys(QUICK_STYLES)) { applyQuickStyle(site, k); assert.equal(renderPage(normalizeSite(site), 'home').status, 200); }
});

test('staff can delete accounts, with their sites', async () => {
  const staff = client(), anon = client(), victim = client();
  await staff('POST', '/api/auth/login', { email: 'staff@pf.test', password: 'another-long-pw' });
  await victim('POST', '/api/auth/signup', { email: 'gone@shop.test', password: 'long-enough-pw' });
  const site = (await victim('POST', '/api/sites', { name: 'Gone Soon', template: 'order', kind: 'ordering' })).data.site;
  await victim('POST', `/api/sites/${site.id}/publish`, {});
  assert.equal((await anon('GET', '/', null, { host: 'gonesoon.pfsites.test' })).status, 200);
  const users = (await staff('GET', '/api/admin')).data.users;
  const target = users.find((u) => u.email === 'gone@shop.test');
  const self = users.find((u) => u.email === 'staff@pf.test');
  assert.equal((await victim('DELETE', `/api/admin/users/${target.id}`)).status, 403);
  assert.equal((await staff('DELETE', `/api/admin/users/${self.id}`)).status, 400);
  assert.equal((await staff('DELETE', '/api/admin/users/nope')).status, 404);
  assert.equal((await staff('DELETE', `/api/admin/users/${target.id}`)).status, 200);
  assert.equal((await anon('GET', '/', null, { host: 'gonesoon.pfsites.test' })).status, 404);
  assert.equal((await victim('GET', '/api/sites')).status, 401);
  assert.ok(!(await staff('GET', '/api/admin')).data.users.some((u) => u.email === 'gone@shop.test'));
});

test('item options, promo codes, opening hours, scheduling, reset links, stats, Spanish', async () => {
  const core = await import('../shared/core.js');
  const sent = [];
  const dir3 = mkdtempSync(join(tmpdir(), 'pfsites-'));
  const app3 = createApp({ dataDir: dir3, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1', ADMIN_EMAILS: 'boss@pf.test' }, mailer: { enabled: true, send: async (m) => { sent.push(m); } } });
  const server3 = createServer(app3);
  await new Promise((r) => server3.listen(0, r));
  const prevBase = base; base = `http://127.0.0.1:${server3.address().port}`;
  try {
    const me = client(), anon = client();
    await me('POST', '/api/auth/signup', { email: 'opt@shop.test', name: 'Opt Owner', password: 'long-enough-pw' });
    const site = (await me('POST', '/api/sites', { name: 'Opt Cafe', template: 'order', kind: 'ordering', csv: 'Taco,3.50\nBurrito,9.00\nSoda,2.00' })).data.site;
    const host = { host: 'optcafe.pfsites.test' };
    let items = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
    const [taco, burrito, soda] = items;

    // Options: a required single choice and optional extras
    items = (await me('PUT', `/api/sites/${site.id}/menu/${burrito.id}`, { options: [{ name: 'Protein', required: true, choices: [{ name: 'Chicken', price: 0 }, { name: 'Steak', price: 200 }] }, { name: 'Extras', multi: true, choices: [{ name: 'Guacamole', price: 150 }, { name: 'Cheese', price: 75 }] }, { name: 'Empty', choices: [] }] })).data.items;
    assert.equal(items.find((x) => x.id === burrito.id).options.length, 2);

    // Reorder
    items = (await me('PUT', `/api/sites/${site.id}/menu-order`, { ids: [soda.id, taco.id, burrito.id] })).data.items;
    assert.deepEqual(items.map((x) => x.name), ['Soda', 'Taco', 'Burrito']);

    const settings = { ...site.ordering, taxRate: 10, promos: [{ code: 'welcome10', type: 'percent', value: 10 }, { code: 'OLD', type: 'amount', value: 500, active: false }] };
    assert.deepEqual((await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: settings })).data.ordering.promos.map((x) => x.code), ['WELCOME10', 'OLD']);
    await me('POST', `/api/sites/${site.id}/publish`, {});

    const who = { name: 'Ana Ruiz', phone: '903-555-0100', email: 'ana@example.com', method: 'pickup' };
    const place = (b) => anon('POST', '/_order', { ...who, ...b }, host);
    assert.equal((await place({ items: [{ id: burrito.id, qty: 1 }] })).status, 400, 'protein is required');
    assert.equal((await place({ items: [{ id: burrito.id, qty: 1, opts: [[0, 1]] }] })).status, 400, 'only one protein');
    assert.equal((await anon('GET', '/_promo?code=nope', null, host)).status, 404);
    assert.equal((await anon('GET', '/_promo?code=old', null, host)).status, 404, 'inactive code');
    assert.deepEqual((await anon('GET', '/_promo?code=Welcome10', null, host)).data, { code: 'WELCOME10', type: 'percent', value: 10 });
    assert.equal((await place({ items: [{ id: taco.id, qty: 1 }], promo: 'BOGUS' })).status, 400);

    let r = await place({ items: [{ id: burrito.id, qty: 2, opts: [[1], [0, 1]] }, { id: taco.id, qty: 1 }], promo: 'welcome10' });
    assert.equal(r.status, 201);
    await new Promise((x) => setTimeout(x, 20));
    const order = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
    // burrito 900 + 200 + 150 + 75 = 1325 ×2 = 2650, + taco 350 = 3000; 10% off = 300; tax 10% of 2700 = 270
    assert.deepEqual([order.subtotal, order.discount, order.promo, order.tax, order.total], [3000, 300, 'WELCOME10', 270, 2970]);
    assert.deepEqual(order.items[0].opts, ['Steak', 'Guacamole', 'Cheese']);
    const mailed = sent.find((m) => m.to === 'ana@example.com');
    assert.match(mailed.html, /Steak, Guacamole, Cheese/);
    assert.match(mailed.html, /Discount \(WELCOME10\)/);
    r = await anon('GET', `/order/${order.token}`, null, host);
    assert.match(r.data, /Steak, Guacamole, Cheese/);
    assert.match(r.data, /Order again/);

    // Opening hours: closed all week means no ASAP orders; scheduling offers nothing either
    const closed = { ...settings, useHours: true, hours: core.DAYS.map(() => ({ closed: true, open: '11:00', close: '21:00' })) };
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: closed });
    assert.equal((await place({ items: [{ id: taco.id, qty: 1 }] })).status, 409);
    assert.match((await anon('GET', '/order', null, host)).data, /We are closed right now/);
    // Open around the clock with scheduling: a valid slot is accepted, a made-up one is not
    const always = { ...settings, useHours: true, scheduling: true, hours: core.DAYS.map(() => ({ closed: false, open: '00:00', close: '00:00' })) };
    const saved = (await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: always })).data.ordering;
    const slots = core.orderSlots(saved, 'pickup');
    assert.ok(slots.length > 50);
    assert.equal((await place({ items: [{ id: taco.id, qty: 1 }], when: '2020-01-01T10:00' })).status, 409);
    assert.equal((await place({ items: [{ id: taco.id, qty: 1 }], when: slots[4] })).status, 201);
    assert.equal((await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0].scheduled, slots[4]);
    assert.match((await anon('GET', '/order', null, host)).data, /"slots":\{"pickup":\[\["20/);

    // Sales summary
    r = await me('GET', `/api/sites/${site.id}/stats?range=last30`);
    assert.equal(r.data.totals.orders, 2);
    assert.equal(r.data.series.length, 30);
    assert.equal(r.data.items[0].name, 'Burrito');
    assert.equal((await client()('GET', `/api/sites/${site.id}/stats`)).status, 401);

    // Spanish
    const { draft, draftRev } = (await me('GET', `/api/sites/${site.id}`)).data.site;
    draft.lang = 'es';
    await me('POST', `/api/sites/${site.id}/publish`, { draft, rev: draftRev });
    r = await anon('GET', '/order', null, host);
    assert.match(r.data, /<html lang="es"/);
    assert.match(r.data, /Ordenar en línea/);
    assert.match((await anon('GET', '/privacy', null, host)).data, /Política de privacidad/);

    // Password reset by email, and a staff-made link
    sent.length = 0;
    assert.equal((await anon('POST', '/api/auth/forgot', { email: 'nobody@shop.test' })).status, 200);
    assert.equal(sent.length, 0);
    await anon('POST', '/api/auth/forgot', { email: 'OPT@shop.test' });
    await new Promise((x) => setTimeout(x, 20));
    const token = sent[0].text.match(/reset\?token=([\w-]+)/)[1];
    assert.equal((await anon('POST', '/api/auth/reset', { token: 'wrong', password: 'brand-new-pw' })).status, 400);
    assert.equal((await anon('POST', '/api/auth/reset', { token, password: 'short' })).status, 400);
    assert.equal((await client()('POST', '/api/auth/reset', { token, password: 'brand-new-pw' })).status, 200);
    assert.equal((await client()('POST', '/api/auth/reset', { token, password: 'again-new-pw' })).status, 400, 'single use');
    assert.equal((await me('GET', '/api/sites')).status, 401, 'old sessions are signed out');
    assert.equal((await client()('POST', '/api/auth/login', { email: 'opt@shop.test', password: 'brand-new-pw' })).status, 200);
    const boss = client();
    await boss('POST', '/api/auth/signup', { email: 'boss@pf.test', password: 'long-enough-pw' });
    await confirmEmail(boss, 'boss@pf.test', 'long-enough-pw', sent);
    const target = (await boss('GET', '/api/admin')).data.users.find((u) => u.email === 'opt@shop.test');
    r = await boss('POST', `/api/admin/users/${target.id}/reset-link`);
    assert.match(r.data.link, /^http:\/\/app\.pfsites\.test\/reset\?token=/);
    assert.equal((await client()('POST', `/api/admin/users/${target.id}/reset-link`)).status, 401);
  } finally { base = prevBase; server3.close(); app3.close(); rmSync(dir3, { recursive: true, force: true }); }
});

test('push messages are encrypted so the receiving browser can read them', async () => {
  const { createECDH, createDecipheriv, hkdfSync, verify, createPublicKey } = await import('node:crypto');
  const { encryptPush, newVapidKeys, vapidHeader } = await import('../server/push.js');
  // Play the browser's part: its own key pair and auth secret.
  const browser = createECDH('prime256v1'); browser.generateKeys();
  const auth = Buffer.from('0123456789abcdef');
  const body = encryptPush('{"title":"New order #1001"}', browser.getPublicKey().toString('base64url'), auth.toString('base64url'));
  const salt = body.subarray(0, 16), keyLen = body[20], serverKey = body.subarray(21, 21 + keyLen), cipherText = body.subarray(21 + keyLen);
  assert.equal(body.readUInt32BE(16), 4096);
  const secret = browser.computeSecret(serverKey);
  const ikm = Buffer.from(hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), browser.getPublicKey(), serverKey]), 32));
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', key, nonce); d.setAuthTag(cipherText.subarray(-16));
  const plain = Buffer.concat([d.update(cipherText.subarray(0, -16)), d.final()]);
  assert.equal(plain.subarray(0, -1).toString(), '{"title":"New order #1001"}');
  assert.equal(plain.at(-1), 2);
  // The signed header names the push service and verifies against the public key.
  const keys = newVapidKeys();
  const header = vapidHeader('https://push.example.com/send/abc', keys);
  const [, jwt, k] = header.match(/^vapid t=([\w.-]+), k=([\w-]+)$/);
  const [h, p, sig] = jwt.split('.');
  assert.equal(JSON.parse(Buffer.from(p, 'base64url')).aud, 'https://push.example.com');
  assert.equal(k, keys.publicKey);
  assert.ok(verify('sha256', Buffer.from(`${h}.${p}`), { key: createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: keys.jwk.x, y: keys.jwk.y }, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
});

test('zones, loyalty, category hours, version history, push on new order, Spanish emails', async () => {
  const core = await import('../shared/core.js');
  const sent = [], pushed = [];
  const dir4 = mkdtempSync(join(tmpdir(), 'pfsites-'));
  const app4 = createApp({ dataDir: dir4, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: true, send: async (m) => { sent.push(m); } }, pusher: async (sub, message) => { pushed.push({ sub, message }); return sub.endpoint.includes('dead') ? 'gone' : 'sent'; } });
  const server4 = createServer(app4);
  await new Promise((r) => server4.listen(0, r));
  const prevBase = base; base = `http://127.0.0.1:${server4.address().port}`;
  try {
    const me = client(), anon = client();
    await me('POST', '/api/auth/signup', { email: 'zone@shop.test', password: 'long-enough-pw' });
    const site = (await me('POST', '/api/sites', { name: 'Zone Cafe', template: 'order', kind: 'ordering', methods: { pickup: true, delivery: true }, csv: 'Category,Item,Price\nBreakfast,Eggs,5.00\nLunch,Taco,4.00\nSecret,Special,9.00' })).data.site;
    const host = { host: 'zonecafe.pfsites.test' };
    const [eggs, taco, special] = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
    assert.match((await me('GET', '/api/config')).data.pushKey, /^[\w-]{80,}$/);

    // Push subscriptions
    assert.equal((await me('POST', '/api/push/subscribe', { subscription: { endpoint: 'http://insecure', keys: { p256dh: 'a', auth: 'b' } } })).status, 400);
    assert.equal((await me('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/live', keys: { p256dh: 'a', auth: 'b' } } })).status, 201);
    assert.equal((await me('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/dead', keys: { p256dh: 'a', auth: 'b' } } })).status, 201);
    assert.equal((await client()('POST', '/api/push/subscribe', { subscription: {} })).status, 401);

    const settings = { ...site.ordering, methods: { pickup: true, delivery: true }, deliveryFee: 999, zones: [{ zips: '75751 75752', fee: 300 }, { zips: '75758', fee: 500 }], loyalty: { enabled: true, every: 2, type: 'amount', value: 400 }, cats: [{ name: 'Secret', hidden: true }] };
    const saved = (await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: settings })).data.ordering;
    assert.equal(saved.zones.length, 2);

    // Version history: each publish that changes something is kept
    const { draft, draftRev } = (await me('GET', `/api/sites/${site.id}`)).data.site;
    await me('POST', `/api/sites/${site.id}/publish`, {});
    await me('POST', `/api/sites/${site.id}/publish`, {});
    draft.brand.tagline = 'Second version'; draft.lang = 'es';
    // Publishing an edited copy needs the copy it was made from, so an older tab can never put its version live.
    assert.equal((await me('POST', `/api/sites/${site.id}/publish`, { draft })).status, 412);
    await me('POST', `/api/sites/${site.id}/publish`, { draft, rev: draftRev });
    let r = await me('GET', `/api/sites/${site.id}/versions`);
    assert.equal(r.data.versions.length, 2);
    const first = await me('GET', `/api/sites/${site.id}/versions/${r.data.versions[1].id}`);
    assert.notEqual(first.data.draft.brand.tagline, 'Second version');
    assert.equal((await client()('GET', `/api/sites/${site.id}/versions`)).status, 401);

    // Hidden categories are not shown and cannot be ordered
    r = await anon('GET', '/order', null, host);
    assert.match(r.data, /Taco/);
    assert.doesNotMatch(r.data, /Special/);
    const who = { name: 'Ana Ruiz', phone: '903-555-0100', email: 'Ana@Example.com' };
    const place = (b) => anon('POST', '/_order', { ...who, ...b }, host);
    assert.equal((await place({ method: 'pickup', items: [{ id: special.id, qty: 1 }] })).status, 409);

    // ZIP zones: unknown ZIP refused, known ZIP charged that zone's fee
    assert.equal((await place({ method: 'delivery', address: '1 Main St', zip: '90210', items: [{ id: taco.id, qty: 1 }] })).status, 400);
    assert.equal((await place({ method: 'delivery', address: '1 Main St', items: [{ id: taco.id, qty: 1 }] })).status, 400);
    assert.equal((await place({ method: 'delivery', address: '1 Main St', zip: '75758', items: [{ id: taco.id, qty: 1 }] })).status, 201);
    await new Promise((x) => setTimeout(x, 30));
    let orders = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders;
    assert.deepEqual([orders[0].fee, orders[0].address], [500, '1 Main St 75758']);

    // Push went to both devices; the dead one is forgotten
    assert.equal(pushed.length, 2);
    assert.match(pushed[0].message.title, /New order #1001/);
    await place({ method: 'pickup', items: [{ id: eggs.id, qty: 1 }] });
    await new Promise((x) => setTimeout(x, 30));
    assert.equal(pushed.length, 3);

    // Spanish emails for the customer, English for the business
    assert.ok(sent.some((m) => m.to === 'Ana@Example.com' && /Recibimos tu pedido/.test(m.subject)));
    assert.ok(sent.some((m) => m.to !== 'Ana@Example.com' && /New pickup order/.test(m.subject)));

    // Loyalty: rewards come from completed orders only. Placing orders earns nothing.
    orders = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders;
    assert.doesNotMatch((await anon('GET', `/order/${orders[0].token}`, null, host)).data, /THANKS/, 'an order only placed earns nothing');
    // Once both are completed, the second one earns a one-time code worth $4.
    await me('POST', `/api/sites/${site.id}/orders/${orders[1].id}`, { status: 'completed' });
    await me('POST', `/api/sites/${site.id}/orders/${orders[0].id}`, { status: 'completed' });
    r = await anon('GET', `/order/${orders[0].token}`, null, host);
    const code = r.data.match(/THANKS[0-9A-F]{8}/)[0];
    assert.match(r.data, /Ganaste una recompensa/);
    assert.doesNotMatch((await anon('GET', `/order/${orders[1].token}`, null, host)).data, /THANKS/);
    assert.deepEqual((await anon('GET', `/_promo?code=${code.toLowerCase()}`, null, host)).data, { code, type: 'amount', value: 400 });
    assert.equal((await place({ method: 'pickup', promo: code, items: [{ id: taco.id, qty: 2 }] })).status, 201);
    orders = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders;
    assert.deepEqual([orders[0].subtotal, orders[0].discount, orders[0].promo], [800, 400, code]);
    assert.equal((await anon('GET', `/_promo?code=${code}`, null, host)).status, 404, 'reward codes work once');
    assert.equal((await place({ method: 'pickup', promo: code, items: [{ id: taco.id, qty: 1 }] })).status, 400);

    // Renaming a category moves its items and its settings
    r = await me('POST', `/api/sites/${site.id}/menu/category`, { from: 'Secret', to: 'Specials' });
    assert.ok(r.data.items.some((x) => x.category === 'Specials'));
    assert.deepEqual(r.data.ordering.cats.map(({ id, ...rest }) => rest), [{ name: 'Specials', onlineName: '', color: '', hidden: true, from: '', to: '' }]);
    assert.match(r.data.ordering.cats[0].id, /^[A-Z0-9]{13}$/, 'each category has an id');

    // Category hours
    assert.deepEqual(core.visibleMenu([{ category: 'Breakfast' }, { category: 'Lunch' }], core.normalizeOrdering({ cats: [{ name: 'Breakfast', from: '06:00', to: '11:00' }] }), Date.parse('2026-11-21T20:00:00Z')).map((x) => x.category), ['Lunch']);

    // Installable app files
    assert.equal((await anon('GET', '/manifest.webmanifest')).data.start_url, '/app');
    assert.match((await anon('GET', '/sw.js')).data, /showNotification/);
  } finally { base = prevBase; server4.close(); app4.close(); rmSync(dir4, { recursive: true, force: true }); }
});

test('sales tax can be switched off per item', async () => {
  const core = await import('../shared/core.js');
  const o = { taxRate: 10, tips: false };
  assert.equal(core.orderTotals([{ price: 1000, qty: 1 }, { price: 500, qty: 2, taxable: false }], 'pickup', o).tax, 100);
  assert.equal(core.orderTotals([{ price: 1000, qty: 1 }, { price: 1000, qty: 1, taxable: false }], 'pickup', o, 0, { type: 'percent', value: 50 }).tax, 50);
  assert.equal(core.orderTotals([{ price: 1000, qty: 1, taxable: false }], 'pickup', o).tax, 0);
  assert.deepEqual(core.parseMenuCsv('Item,Price,Taxable\nTaco,3.50,yes\nGift card,25,no\nSoda,2,').items.map((x) => x.taxable), [true, false, true]);

  const me = client(), anon = client();
  await me('POST', '/api/auth/signup', { email: 'tax@shop.test', password: 'long-enough-pw' });
  const site = (await me('POST', '/api/sites', { name: 'Tax Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price,Taxable\nTaco,10.00,yes\nGift card,25.00,no' })).data.site;
  let items = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
  assert.deepEqual(items.map((x) => x.taxable), [true, false]);
  // A stock change says what count it was made from. A save without that, or made from an old count, never writes stock back.
  assert.equal((await me('PUT', `/api/sites/${site.id}/menu/${items[0].id}`, { stock: 3 })).data.items[0].stock, 100);
  const sold = await me('PUT', `/api/sites/${site.id}/menu/${items[0].id}`, { stock: 3, stockWas: 90 });
  assert.equal(sold.status, 409);
  assert.equal(sold.data.stock, 100);
  items = (await me('PUT', `/api/sites/${site.id}/menu/${items[0].id}`, { stock: 3, stockWas: 100 })).data.items;
  assert.deepEqual([items[0].taxable, items[0].stock], [true, 3], 'other fields are kept when one changes');
  assert.equal((await me('PUT', `/api/sites/${site.id}/menu/${items[0].id}`, { ...items[0], stock: 50, stockWas: 50, name: 'Taco' })).data.items[0].stock, 3, 'a whole item sent back with an old count keeps the real count');
  await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, taxRate: 8 } });
  await me('POST', `/api/sites/${site.id}/publish`, {});
  const r = await anon('POST', '/_order', { method: 'pickup', name: 'Ana', phone: '903-555-0100', email: 'ana@example.com', items: [{ id: items[0].id, qty: 1 }, { id: items[1].id, qty: 1 }] }, { host: 'taxcafe.pfsites.test' });
  assert.equal(r.status, 201);
  const order = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
  assert.deepEqual([order.subtotal, order.tax, order.total], [3500, 80, 3580]);
  assert.equal((await me('GET', `/api/sites/${site.id}/menu`)).data.items[0].stock, 2);
  await me('PUT', `/api/sites/${site.id}/menu/${items[1].id}`, { taxable: true });
  assert.match((await anon('GET', '/order', null, { host: 'taxcafe.pfsites.test' })).data, /"t":1/);
});

test('every item has a quantity; sale prices and bulk edits', async () => {
  const core = await import('../shared/core.js');
  assert.equal(core.itemPrice({ price: 1000, sale: 20 }), 800);
  assert.equal(core.itemPrice({ price: 1000 }), 1000);
  const me = client(), anon = client();
  await me('POST', '/api/auth/signup', { email: 'bulk@shop.test', password: 'long-enough-pw' });
  const site = (await me('POST', '/api/sites', { name: 'Bulk Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price,Stock\nTaco,10.00,\nBurrito,12.00,7\nSoda,2.00,' })).data.site;
  let items = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
  assert.deepEqual(items.map((x) => x.stock), [100, 7, 100], 'items without a quantity get a starting count, never "unlimited"');
  items = (await me('POST', `/api/sites/${site.id}/menu/import`, { csv: 'Flan,4.50', startStock: 25 })).data.items;
  assert.equal(items.at(-1).stock, 25);
  items = (await me('POST', `/api/sites/${site.id}/menu`, { name: 'New', price: 100 })).data.items;
  assert.equal(items.at(-1).stock, 100);
  items = (await me('PUT', `/api/sites/${site.id}/menu/${items[0].id}`, { stock: '', stockWas: items[0].stock })).data.items;
  assert.equal(items[0].stock, 100, 'a blank quantity does not become unlimited');
  const [taco, burrito, soda] = items;

  assert.equal((await me('POST', `/api/sites/${site.id}/menu/bulk`, { ids: [] })).status, 400);
  assert.equal((await client()('POST', `/api/sites/${site.id}/menu/bulk`, { ids: [taco.id], delete: true })).status, 401);
  items = (await me('POST', `/api/sites/${site.id}/menu/bulk`, { ids: [taco.id, burrito.id, 'not-mine'], set: { taxable: false, sale: 25, category: 'Specials', addStock: 5 } })).data.items;
  assert.deepEqual(items.slice(0, 3).map((x) => [x.taxable, x.sale, x.category, x.stock]), [[false, 25, 'Specials', 105], [false, 25, 'Specials', 12], [true, 0, 'Menu', 100]]);
  items = (await me('POST', `/api/sites/${site.id}/menu/bulk`, { ids: [soda.id], set: { pricePercent: 10, stock: 3, available: false } })).data.items;
  assert.deepEqual([items[2].price, items[2].stock, items[2].available], [220, 3, false]);

  await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, taxRate: 10 } });
  await me('POST', `/api/sites/${site.id}/publish`, {});
  const host = { host: 'bulkcafe.pfsites.test' };
  const page = (await anon('GET', '/order', null, host)).data;
  assert.match(page, /<s>\$10\.00<\/s> \$7\.50/);
  const r = await anon('POST', '/_order', { method: 'pickup', name: 'Ana', phone: '903-555-0100', email: 'ana@example.com', items: [{ id: taco.id, qty: 2 }] }, host);
  assert.equal(r.status, 201);
  const order = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
  assert.deepEqual([order.subtotal, order.tax, order.total], [1500, 0, 1500], 'sale price charged, no tax on a non-taxable item');
  items = (await me('POST', `/api/sites/${site.id}/menu/bulk`, { ids: [taco.id, burrito.id], delete: true })).data.items;
  assert.ok(!items.some((x) => x.id === taco.id || x.id === burrito.id));
});

test('sales report: periods, tax, order types, items, cancelled orders', async () => {
  const me = client(), anon = client();
  await me('POST', '/api/auth/signup', { email: 'sales@shop.test', password: 'long-enough-pw' });
  const site = (await me('POST', '/api/sites', { name: 'Sales Cafe', template: 'order', kind: 'ordering', methods: { pickup: true, curbside: true, delivery: true }, csv: 'Category,Item,Price,Taxable\nTacos,Taco,10.00,yes\nGifts,Gift card,25.00,no\nDrinks,Soda,2.00,yes' })).data.site;
  const [taco, gift, soda] = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
  await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, methods: { pickup: true, curbside: true, delivery: true }, taxRate: 10, deliveryFee: 300, promos: [{ code: 'TEN', type: 'percent', value: 10 }] } });
  await me('POST', `/api/sites/${site.id}/publish`, {});
  const host = { host: 'salescafe.pfsites.test' };
  const who = { name: 'Ana', phone: '903-555-0100', email: 'ana@example.com' };
  const place = async (b) => assert.equal((await anon('POST', '/_order', { ...who, ...b }, host)).status, 201);
  await place({ method: 'pickup', items: [{ id: taco.id, qty: 2 }, { id: gift.id, qty: 1 }] });                    // 4500, tax 200
  await place({ method: 'delivery', address: '1 Main', tip: 10, items: [{ id: taco.id, qty: 1 }, { id: soda.id, qty: 5 }] }); // 2000, tax 200, fee 300, tip 200
  await place({ method: 'curbside', vehicle: 'Blue truck', promo: 'TEN', items: [{ id: taco.id, qty: 1 }] });        // 1000 - 100, tax 90
  await place({ method: 'pickup', items: [{ id: soda.id, qty: 1 }] });                                              // cancelled below
  const all = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders;
  await me('POST', `/api/sites/${site.id}/orders/${all[0].id}`, { status: 'cancelled' });

  let r = await me('GET', `/api/sites/${site.id}/stats?range=today`);
  assert.equal(r.status, 200);
  const t = r.data.totals;
  assert.deepEqual([t.orders, t.cancelled, t.gross, t.discounts, t.net, t.tax, t.fees, t.tips, t.total], [3, 1, 7500, 100, 7400, 490, 300, 200, 8390]);
  assert.deepEqual([t.taxable, t.nontaxable, t.units, t.average], [4900, 2500, 10, 2797]);
  assert.equal(t.net + t.tax + t.fees + t.tips, t.total, 'the breakdown adds up to what was collected');
  assert.equal(r.data.unit, 'hour');
  assert.equal(r.data.series.length, 24);
  assert.equal(r.data.series.reduce((a, x) => a + x.net, 0), 7400);
  assert.deepEqual(r.data.methods.map((m) => [m.method, m.orders, m.net]), [['pickup', 1, 4500], ['curbside', 1, 900], ['delivery', 1, 2000]]);
  // Item sales carry their order's discount (1.00 off the curbside taco), so they add up to sales after discounts.
  assert.deepEqual(r.data.items.map((i) => [i.name, i.category, i.qty, i.sales]), [['Soda', 'Drinks', 5, 1000], ['Taco', 'Tacos', 4, 3900], ['Gift card', 'Gifts', 1, 2500]]);
  assert.equal(r.data.items.reduce((a, i) => a + i.sales, 0), t.gross - t.discounts);
  assert.deepEqual(r.data.categories.map((c) => c.name), ['Tacos', 'Gifts', 'Drinks']);
  assert.equal(r.data.orders.length, 4);
  assert.equal(r.data.orders[0].status, 'cancelled');

  // Other periods
  r = await me('GET', `/api/sites/${site.id}/stats?range=yesterday`);
  assert.deepEqual([r.data.totals.orders, r.data.totals.total, r.data.days], [0, 0, 1]);
  r = await me('GET', `/api/sites/${site.id}/stats?range=month`);
  assert.equal(r.data.totals.orders, 3);
  assert.equal(r.data.unit, 'day');
  assert.ok(r.data.from.endsWith('-01'));
  const today = r.data.today;
  const earlier = new Date(Date.parse(`${today}T00:00:00Z`) - 40 * 86400000).toISOString().slice(0, 10);
  r = await me('GET', `/api/sites/${site.id}/stats?range=custom&from=${today}&to=${earlier}`);
  assert.deepEqual([r.data.from, r.data.to, r.data.totals.orders, r.data.days], [earlier, today, 3, 41], 'dates given backwards are put in order');
  assert.equal((await me('GET', `/api/sites/${site.id}/stats?range=custom&from=nope&to=${today}`)).status, 400);
  assert.equal((await me('GET', `/api/sites/${site.id}/stats?range=custom&from=2000-01-01&to=${today}`)).status, 400);
  r = await me('GET', `/api/sites/${site.id}/stats?range=last7`);
  assert.deepEqual([r.data.days, r.data.series.length, r.data.previous.orders], [7, 7, 0]);
  assert.equal((await client()('GET', `/api/sites/${site.id}/stats`)).status, 401);
  // A deleted item still counts in past sales
  await me('DELETE', `/api/sites/${site.id}/menu/${gift.id}`);
  r = await me('GET', `/api/sites/${site.id}/stats?range=today`);
  assert.equal(r.data.items.find((i) => i.name === 'Gift card').category, 'No longer on the menu');
});

test('timed prices, kitchen limits, daily refill, summary, low-stock alerts, customers, team, menu scan', async () => {
  const core = await import('../shared/core.js');
  // Timed prices: Monday 16:00 Central is inside a 15:00-18:00 weekday window, 19:00 is not.
  const o0 = core.normalizeOrdering({ deals: [{ name: 'Happy hour', percent: 25, from: '15:00', to: '18:00', days: [false, true, true, true, true, true, false], category: 'Drinks' }] });
  const mon4pm = Date.parse('2026-11-16T22:00:00Z'), mon7pm = Date.parse('2026-11-17T01:00:00Z'), sun4pm = Date.parse('2026-11-15T22:00:00Z');
  const soda = { id: 'a', name: 'Soda', category: 'Drinks', price: 400, sale: 0 }, taco = { id: 'b', name: 'Taco', category: 'Tacos', price: 400, sale: 0 };
  assert.deepEqual(core.pricedMenu([soda, taco], o0, mon4pm).map((x) => core.itemPrice(x)), [300, 400]);
  assert.equal(core.itemPrice(core.pricedMenu([soda], o0, mon7pm)[0]), 400);
  assert.equal(core.itemPrice(core.pricedMenu([soda], o0, sun4pm)[0]), 400, 'not on a day that is switched off');
  assert.equal(core.itemPrice(core.pricedMenu([{ ...soda, sale: 50 }], o0, mon4pm)[0]), 200, 'a bigger sale on the item wins');
  // Full time slots drop out of the list.
  const sched = core.normalizeOrdering({ scheduling: true, slotLimit: 2 });
  const all = core.orderSlots(sched, 'pickup', mon4pm);
  assert.ok(!core.orderSlots(sched, 'pickup', mon4pm, { [all[0]]: 2 }).includes(all[0]));
  assert.ok(core.orderSlots(sched, 'pickup', mon4pm, { [all[0]]: 1 }).includes(all[0]));

  const d2 = mkdtempSync(join(tmpdir(), 'pfsites2-'));
  const sent = [], pushed = [];
  const app2 = createApp({ dataDir: d2, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1', ADMIN_EMAILS: 'boss@pf.test' }, mailer: { enabled: true, send: async (m) => { sent.push(m); } }, pusher: async (sub, msg) => { pushed.push(msg); },
    scanner: async (buf, type) => ({ items: [{ category: 'Tacos', name: `Scanned ${type}`, price: 425, desc: 'From the photo' }, { category: 'Tacos', name: '', price: 100, desc: '' }] }) });
  const srv = createServer(app2);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const me = client(), anon = client(), host = { host: 'refillcafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'owner@refill.test', password: 'long-enough-pw', name: 'Olga' });
    const site = (await me('POST', '/api/sites', { name: 'Refill Cafe', template: 'order', kind: 'ordering', csv: 'Category,Item,Price\nTacos,Taco,4.00\nDrinks,Soda,2.00' })).data.site;
    let items = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
    const [tacoId, sodaId] = items.map((x) => x.id);
    assert.equal(items[0].restock, null);
    items = (await me('PUT', `/api/sites/${site.id}/menu/${tacoId}`, { stock: 7, stockWas: items[0].stock, restock: 40 })).data.items;
    assert.deepEqual([items[0].stock, items[0].restock], [7, 40]);
    await me('POST', `/api/sites/${site.id}/menu/bulk`, { ids: [sodaId], set: { restock: 12, stock: 9 } });
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, slotLimit: 2, lowStockAt: 5, notifyEmail: 'boss@refill.test' } });
    await me('POST', `/api/sites/${site.id}/publish`, {});
    await me('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'k', auth: 'a' } } });

    const who = { method: 'pickup', name: 'Ana Diaz', phone: '903-555-0100', email: 'Ana@Example.com' };
    const place = (b) => anon('POST', '/_order', { ...who, ...b }, host);
    // 7 tacos, alert at 5: the order that takes it from 7 to 4 raises the alert, the next one does not.
    assert.equal((await place({ items: [{ id: tacoId, qty: 3 }] })).status, 201);
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(sent.some((m) => m.to === 'boss@refill.test' && /running low/i.test(m.subject)), 'low stock email');
    assert.ok(pushed.some((m) => /Running low/.test(m.title) && /Taco: 4 left/.test(m.body)), 'low stock push');
    const lowMails = sent.filter((m) => /running low|sold out/i.test(m.subject)).length;
    assert.equal((await place({ items: [{ id: tacoId, qty: 1 }], email: 'ben@example.com', name: 'Ben' })).status, 201);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sent.filter((m) => /running low|sold out/i.test(m.subject)).length, lowMails, 'no repeat alert while already low');
    // The kitchen limit: two orders in fifteen minutes is the cap.
    const full = await place({ items: [{ id: sodaId, qty: 1 }] });
    assert.equal(full.status, 409);
    assert.match(full.data.error, /as many orders as we can make/);
    assert.match((await anon('GET', '/order', null, host)).data, /as many orders as we can make/);

    // Customers: one row per email, whatever the capitals.
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, slotLimit: 0, lowStockAt: 5, notifyEmail: 'boss@refill.test' } });
    assert.equal((await place({ items: [{ id: sodaId, qty: 2 }], email: 'ana@example.com' })).status, 201);
    let people = (await me('GET', `/api/sites/${site.id}/customers`)).data.customers;
    assert.equal(people.length, 2);
    let ana = people.find((c) => c.email === 'ana@example.com');
    // Spent is money paid: nothing until a payment is recorded, then that order's total less any refund.
    assert.deepEqual([ana.orders, ana.spent, ana.favourite], [2, 0, 'Taco']);
    const anaOrder = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders.find((o) => o.email.toLowerCase() === 'ana@example.com');
    await me('POST', `/api/sites/${site.id}/orders/${anaOrder.id}/payment`, { method: 'Cash' });
    await me('POST', `/api/sites/${site.id}/orders/${anaOrder.id}/payment`, { refund: 100 });
    people = (await me('GET', `/api/sites/${site.id}/customers`)).data.customers;
    ana = people.find((c) => c.email === 'ana@example.com');
    assert.equal(ana.spent, anaOrder.total - 100);

    // The day ends: the summary goes out and quantities refill.
    assert.deepEqual((await me('GET', `/api/sites/${site.id}/menu`)).data.items.map((x) => x.stock), [3, 7]);
    // The business day turns over at 4 AM, so between midnight and 4 AM (Chicago time) the first wrap-up waits for today's business day.
    const hourNow = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
    const lead = hourNow < 4 ? 5 * 3600000 : 0;
    app2.tick(Date.now() + lead);
    sent.length = 0;
    app2.tick(Date.now() + lead + 26 * 3600000);
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual((await me('GET', `/api/sites/${site.id}/menu`)).data.items.map((x) => x.stock), [40, 12]);
    const summary = sent.find((m) => /3 orders/.test(m.subject));
    assert.ok(summary, 'summary email');
    assert.equal(summary.to, 'boss@refill.test');
    assert.match(summary.html, /Best sellers/);
    assert.match(summary.html, /refilled/);
    sent.length = 0;
    app2.tick(Date.now() + lead + 27 * 3600000);
    assert.equal(sent.length, 0, 'only once a day');

    // Team: a kitchen login sees orders and nothing else; a manager cannot touch the team or delete the site.
    const invite = (await me('POST', `/api/sites/${site.id}/team`, { email: 'cook@refill.test', name: 'Cook', role: 'kitchen' })).data;
    // With email on, the link to choose a password goes only to the person, never back to whoever invited them.
    assert.equal(invite.link, '');
    assert.equal(invite.emailed, true);
    const inviteMail = sent.find((m) => m.to === 'cook@refill.test');
    const inviteLink = (inviteMail.text.match(/\/reset\?token=(\S+)/) || [])[1];
    assert.ok(inviteLink, 'the invite email carries the link');
    // An existing account added to the team: the same answer, and the owner sees only what they typed, never the account's own details.
    const known = client();
    await known('POST', '/api/auth/signup', { email: 'known@refill.test', password: 'long-enough-pw', name: 'Private Person' });
    await known('PUT', '/api/me', { phone: '903-555-0199' });
    const joined = (await me('POST', `/api/sites/${site.id}/team`, { email: 'known@refill.test', name: 'Prep cook', role: 'kitchen' })).data;
    assert.deepEqual([joined.link, joined.emailed], [invite.link, invite.emailed], 'no way to tell whether the address already had an account');
    const shown = joined.members.find((m) => m.email === 'known@refill.test');
    assert.deepEqual([shown.name, shown.phone, !!shown.active], ['Prep cook', '', false]);
    assert.equal((await known('GET', '/api/me')).data.user.name, 'Private Person', 'their own name is never changed');
    assert.equal((await me('POST', `/api/sites/${site.id}/team`, { email: 'boss@pf.test', role: 'manager' })).status, 400, 'a staff address can never be set up through a team');
    assert.equal((await known('DELETE', `/api/sites/${site.id}/membership`)).status, 200, 'anyone can leave a team');
    assert.equal((await known('GET', `/api/sites/${site.id}/orders`)).status, 404);
    const cook = client();
    assert.equal((await cook('POST', '/api/auth/reset', { token: inviteLink, password: 'cooks-password' })).status, 200);
    const mine = (await cook('GET', '/api/sites')).data.sites;
    assert.deepEqual(mine.map((s) => [s.name, s.role]), [['Refill Cafe', 'kitchen']]);
    const orders = (await cook('GET', `/api/sites/${site.id}/orders`)).data.orders;
    assert.equal(orders.length, 3);
    assert.equal((await cook('POST', `/api/sites/${site.id}/orders/${orders[0].id}`, { status: 'confirmed' })).status, 200);
    for (const [m, path, body] of [['GET', `/api/sites/${site.id}/stats`], ['GET', `/api/sites/${site.id}/customers`], ['PUT', `/api/sites/${site.id}/menu/${tacoId}`, { price: 1 }], ['PUT', `/api/sites/${site.id}/ordering`, { ordering: {} }], ['DELETE', `/api/sites/${site.id}`], ['GET', `/api/sites/${site.id}/team`]]) {
      assert.equal((await cook(m, path, body)).status, 403, `${m} ${path}`);
    }
    assert.equal((await cook('GET', `/preview/${site.id}/`)).status, 302);
    await me('POST', `/api/sites/${site.id}/team`, { email: 'cook@refill.test', role: 'manager' });
    assert.equal((await cook('GET', `/api/sites/${site.id}/stats`)).status, 200);
    assert.equal((await cook('DELETE', `/api/sites/${site.id}`)).status, 403);
    assert.equal((await cook('POST', `/api/sites/${site.id}/team`, { email: 'x@refill.test' })).status, 403);
    const stranger = client();
    await stranger('POST', '/api/auth/signup', { email: 'else@refill.test', password: 'long-enough-pw' });
    assert.equal((await stranger('GET', `/api/sites/${site.id}/orders`)).status, 404);
    const team = (await me('GET', `/api/sites/${site.id}/team`)).data.members;
    assert.deepEqual(team.map((t) => [t.email, t.role]), [['cook@refill.test', 'manager']]);
    await me('DELETE', `/api/sites/${site.id}/team/${team[0].id}`);
    assert.equal((await cook('GET', `/api/sites/${site.id}/orders`)).status, 404);

    // Menu scan: the file is read, the merchant confirms, then items are added.
    assert.equal((await me('GET', '/api/config')).data.scanEnabled, true);
    assert.equal((await me('POST', `/api/sites/${site.id}/menu/scan`, Buffer.from('not a menu'), { raw: true })).status, 415);
    const scan = await me('POST', `/api/sites/${site.id}/menu/scan`, Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(40)]), { raw: true });
    assert.equal(scan.status, 200);
    assert.equal(scan.data.items[0].name, 'Scanned application/pdf');
    const imp = (await me('POST', `/api/sites/${site.id}/menu/import`, { items: scan.data.items, startStock: 30 })).data;
    assert.equal(imp.imported, 1, 'the nameless row is dropped');
    const added = imp.items.at(-1);
    assert.deepEqual([added.name, added.price, added.stock, added.desc], ['Scanned application/pdf', 425, 30, 'From the photo']);
  } finally {
    base = saved; srv.close(); app2.close(); rmSync(d2, { recursive: true, force: true });
  }
});

test('invoices: create, total, send, view, remind, mark paid, contacts', async () => {
  const core = await import('../shared/core.js');
  assert.deepEqual(core.invoiceTotals([{ price: 1000, qty: 10 }, { price: 500, qty: 2, taxable: false }], 10, 1100), { subtotal: 11000, discount: 1100, tax: 900, total: 10800 });
  const d3 = mkdtempSync(join(tmpdir(), 'pfsites3-'));
  const sent = [];
  const app3 = createApp({ dataDir: d3, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: true, send: async (m) => { sent.push(m); } } });
  const srv = createServer(app3);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const me = client(), anon = client(), host = { host: 'billcafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'owner@bill.test', password: 'long-enough-pw' });
    const site = (await me('POST', '/api/sites', { name: 'Bill Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price\nTaco tray,80.00' })).data.site;
    const draft = site.draft; draft.business.payUrl = 'https://pay.example/billcafe';
    await me('POST', `/api/sites/${site.id}/publish`, { draft, rev: site.draftRev });
    const body = { customer: { name: 'Dana Lee', company: 'Acme Co', email: 'Dana@Acme.test', phone: '903-555-0111', address: '1 Main St' }, items: [{ name: 'Taco tray', qty: 3, price: 8000 }, { name: 'Delivery', qty: 1, price: 2500, taxable: false }, { name: '', qty: 1, price: 1 }], taxRate: 8.25, discount: 1000, due: '2099-01-31', notes: 'Thank you <b>!' };
    assert.equal((await me('POST', `/api/sites/${site.id}/invoices`, { ...body, customer: {} })).status, 400);
    const made = (await me('POST', `/api/sites/${site.id}/invoices`, body)).data;
    const inv = made.invoice;
    assert.deepEqual([inv.label, inv.status, inv.items.length, inv.subtotal, inv.discount, inv.tax, inv.total], ['INV-1001', 'draft', 2, 26500, 1000, 1905, 27405]);
    assert.deepEqual(made.contacts.map((c) => [c.name, c.email]), [['Dana Lee', 'dana@acme.test']]);
    assert.match(inv.url, /^https:\/\/billcafe\.pfsites\.test\/invoice\//);
    const path = new URL(inv.url).pathname;

    // Sending emails the customer a link and makes the invoice official.
    const out = (await me('POST', `/api/sites/${site.id}/invoices/${inv.id}/send`)).data;
    assert.deepEqual([out.invoice.status, out.emailed, out.invoice.reminders], ['sent', true, 0]);
    assert.equal(sent.at(-1).to, 'dana@acme.test');
    assert.match(sent.at(-1).subject, /Invoice INV-1001 for \$274\.05/);
    assert.ok(sent.at(-1).html.includes(inv.url) && !sent.at(-1).html.includes('<b>!'));

    // The customer's page: branded, with the pay link, and it records the first view.
    const page = await anon('GET', path, null, host);
    assert.equal(page.status, 200);
    assert.match(page.data, /INV-1001/);
    assert.match(page.data, /href="https:\/\/pay\.example\/billcafe"/);
    assert.match(page.data, /Pay \$274\.05 now/);
    assert.ok(!page.data.includes('<b>!'), 'notes are escaped');
    assert.match(page.headers.get('x-robots-tag'), /noindex/);
    assert.equal((await anon('GET', '/invoice/nope-nope-nope', null, host)).status, 404);
    let list = (await me('GET', `/api/sites/${site.id}/invoices`)).data.invoices;
    assert.ok(list[0].viewedAt > 0);

    await me('POST', `/api/sites/${site.id}/invoices/${inv.id}/send`);
    assert.match(sent.at(-1).subject, /^Reminder/);
    const edited = (await me('PUT', `/api/sites/${site.id}/invoices/${inv.id}`, { ...body, discount: 0 })).data.invoice;
    assert.deepEqual([edited.total, edited.reminders, edited.status], [28480, 1, 'sent']);

    const paid = (await me('POST', `/api/sites/${site.id}/invoices/${inv.id}/status`, { status: 'paid', method: 'Check', note: '#1042' })).data.invoice;
    assert.deepEqual([paid.status, paid.paidMethod, paid.paidNote], ['paid', 'Check', '#1042']);
    assert.equal((await me('PUT', `/api/sites/${site.id}/invoices/${inv.id}`, body)).status, 409);
    assert.equal((await me('POST', `/api/sites/${site.id}/invoices/${inv.id}/send`)).status, 409);
    const paidPage = (await anon('GET', path, null, host)).data;
    assert.match(paidPage, /Paid\. Thank you\./);
    assert.ok(!paidPage.includes('Pay $'), 'no pay button once paid');

    // A second invoice with no email cannot be sent; contacts show up with customers; strangers are kept out.
    const two = (await me('POST', `/api/sites/${site.id}/invoices`, { customer: { name: 'Walk-in Wedding' }, items: [{ name: 'Catering', qty: 1, price: 50000 }] })).data.invoice;
    assert.equal(two.label, 'INV-1002');
    assert.equal((await me('POST', `/api/sites/${site.id}/invoices/${two.id}/send`)).status, 400);
    const people = (await me('GET', `/api/sites/${site.id}/customers`)).data.customers;
    assert.deepEqual(people.map((c) => c.name).sort(), ['Dana Lee', 'Walk-in Wedding']);
    const other = client();
    await other('POST', '/api/auth/signup', { email: 'else@bill.test', password: 'long-enough-pw' });
    assert.equal((await other('GET', `/api/sites/${site.id}/invoices`)).status, 404);
    list = (await me('DELETE', `/api/sites/${site.id}/invoices/${two.id}`)).data.invoices;
    assert.equal(list.length, 1);
  } finally {
    base = saved; srv.close(); app3.close(); rmSync(d3, { recursive: true, force: true });
  }
});

test('inventory: modifier groups, menus, printer labels, revenue classes', async () => {
  const core = await import('../shared/core.js');
  const o = core.normalizeOrdering({ modGroups: [{ id: 'g1', name: 'Size', required: true, choices: [{ name: 'Small', price: 0 }, { name: 'Large', price: 150 }] }, { id: 'bad', name: '' }],
    menus: [{ id: 'm1', name: 'Breakfast', cats: ['Eggs'], from: '06:00', to: '11:00' }], labels: ['Kitchen', 'Kitchen', ' Bar '], revClasses: ['Food'], discounts: [{ name: 'Staff', type: 'percent', value: 20 }] });
  assert.deepEqual([o.modGroups.length, o.labels, o.discounts[0].value], [1, ['Kitchen', 'Bar'], 20]);
  const items = [{ id: 'a', name: 'Coffee', category: 'Drinks', options: [], mods: ['g1', 'gone'] }, { id: 'b', name: 'Omelette', category: 'Eggs', options: [], mods: [] }];
  assert.deepEqual(core.applyMods(items, o)[0].options.map((g) => g.name), ['Size']);
  const at = (hhmm) => Date.parse(`2026-11-16T${hhmm}:00Z`) + 6 * 3600000; // Central is UTC-6 in November
  assert.deepEqual(core.visibleMenu(items, o, at('08:00')).map((x) => x.name), ['Coffee', 'Omelette']);
  assert.deepEqual(core.visibleMenu(items, o, at('14:00')).map((x) => x.name), ['Coffee'], 'breakfast is over; categories in no menu stay');

  const d4 = mkdtempSync(join(tmpdir(), 'pfsites4-'));
  const app4 = createApp({ dataDir: d4, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: false, send: async () => {} } });
  const srv = createServer(app4);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  try {
  const me = client(), anon = client(), host = { host: 'modcafe.pfsites.test' };
  await me('POST', '/api/auth/signup', { email: 'mods@shop.test', password: 'long-enough-pw' });
  const site = (await me('POST', '/api/sites', { name: 'Mod Cafe', template: 'order', kind: 'ordering', csv: 'Category,Item,Price\nDrinks,Coffee,3.00\nDrinks,Tea,2.00' })).data.site;
  let menu = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
  await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, modGroups: o.modGroups, labels: ['Bar'], revClasses: ['Drinks rev'] } });
  menu = (await me('POST', `/api/sites/${site.id}/menu/bulk`, { ids: [menu[0].id], set: { addMod: 'g1', label: 'Bar', revclass: 'Drinks rev' } })).data.items;
  assert.deepEqual([menu[0].mods, menu[0].label, menu[0].revclass, menu[1].mods], [['g1'], 'Bar', 'Drinks rev', []]);
  await me('POST', `/api/sites/${site.id}/publish`, {});
  assert.match((await anon('GET', '/order', null, host)).data, /"Large",150/);
  const who = { method: 'pickup', name: 'Ana', phone: '903-555-0100', email: 'ana@example.com' };
  assert.equal((await anon('POST', '/_order', { ...who, items: [{ id: menu[0].id, qty: 1 }] }, host)).status, 400, 'a required shared choice must be made');
  assert.equal((await anon('POST', '/_order', { ...who, items: [{ id: menu[0].id, qty: 2, opts: [[1]] }] }, host)).status, 201);
  const order = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
  assert.deepEqual([order.subtotal, order.items[0].opts, order.items[0].label, order.items[0].rev], [900, ['Large'], 'Bar', 'Drinks rev']);
  const st = (await me('GET', `/api/sites/${site.id}/stats?range=today`)).data;
  assert.deepEqual(st.revenue, [{ name: 'Drinks rev', qty: 2, sales: 900 }]);
  menu = (await me('POST', `/api/sites/${site.id}/menu/bulk`, { ids: [menu[0].id], set: { removeMod: 'g1', label: '' } })).data.items;
  assert.deepEqual([menu[0].mods, menu[0].label], [[], '']);
  } finally { base = saved; srv.close(); app4.close(); rmSync(d4, { recursive: true, force: true }); }
});

test('items pages: cost, modifier switches, dayparts, category IDs', async () => {
  const core = await import('../shared/core.js');
  // Category IDs: 13 letters and digits, the same for the same name, kept once stored.
  const id1 = core.steadyId('coffee');
  assert.match(id1, /^[A-Z0-9]{13}$/);
  assert.equal(core.steadyId('coffee'), id1);
  assert.notEqual(core.steadyId('tea'), id1);
  const oc = core.normalizeOrdering({ cats: [{ name: 'Coffee' }, { id: 'ABCDEFGHJKMNP', name: 'Renamed' }, { id: 'nope', name: 'Tea' }] });
  assert.deepEqual(oc.cats.map((c) => c.id), [id1, 'ABCDEFGHJKMNP', core.steadyId('tea')]);
  // Modifier groups: an empty group is kept; the online name is what customers see; a modifier can be hidden online or sold out.
  const o = core.normalizeOrdering({ modGroups: [
    { id: 'g2', name: 'Milk', onlineName: 'Choose your milk', choices: [{ name: 'Oat', price: 75 }, { name: 'Soy', price: 50, online: false }, { name: 'Almond', price: 75, inStock: false }] },
    { id: 'g1', name: 'Size', choices: [{ name: 'Small', price: 0 }] },
    { id: 'g3', name: 'Later', choices: [] }] });
  assert.deepEqual(o.modGroups.map((g) => [g.id, g.name, g.choices.length]), [['g2', 'Milk', 3], ['g1', 'Size', 1], ['g3', 'Later', 0]]);
  assert.deepEqual(o.modGroups[0].choices.map((c) => [c.online, c.inStock]), [[true, true], [false, true], [true, false]]);
  // Carts remember choices by position, so positions never move: groups keep the item's order, hidden modifiers stay as hidden, and rank is the layout order.
  const [latte] = core.applyMods([{ id: 'a', name: 'Latte', category: 'Coffee', price: 450, options: [], mods: ['g1', 'g3', 'g2'] }], o);
  assert.deepEqual(latte.options.map((g) => [g.name, g.rank]), [['Size', 1], ['Later', 2], ['Choose your milk', 0]]);
  assert.deepEqual(latte.options[2].choices.map((c) => [c.name, !!c.hidden, !!c.soldOut]), [['Oat', false, false], ['Soy', true, false], ['Almond', false, true]]);
  assert.match(core.resolveOptions(latte, [[], [], [2]]).error, /Almond is sold out/);
  assert.match(core.resolveOptions(latte, [[], [], [1]]).error, /Soy is not available/);
  assert.equal(core.resolveOptions(latte, [[0], [], [0]]).price, 525);
  const allHidden = core.applyMods([{ id: 'b', name: 'Tea', price: 300, options: [], mods: ['g9'] }], core.normalizeOrdering({ modGroups: [{ id: 'g9', name: 'Sweetener', required: true, choices: [{ name: 'Honey', online: false }] }] }))[0];
  assert.equal(allHidden.options[0].required, false, 'a group with nothing left to choose is not required');
  assert.equal(core.resolveOptions(allHidden, []).price, 300);
  // Dayparts: a menu with dayparts is shown during any of them; its old times no longer apply.
  const od = core.normalizeOrdering({ timezone: 'America/Chicago', dayparts: [{ id: 'p1', name: 'Lunch', from: '11:00', to: '14:00' }, { id: 'p2', name: 'Weekend', days: [true, false, false, false, false, false, true], from: '17:00', to: '20:00' }, { id: 'px', name: '' }],
    menus: [{ id: 'm1', name: 'Lunch menu', cats: ['Sandwiches'], from: '06:00', to: '07:00', dayparts: ['p1', 'p2', 'gone'] }] });
  assert.deepEqual(od.dayparts.map((p) => p.id), ['p1', 'p2'], 'a daypart needs a name');
  const items = [{ id: 'a', name: 'Club', category: 'Sandwiches' }, { id: 'b', name: 'Latte', category: 'Coffee' }];
  const at = (day, hhmm) => Date.parse(`2026-11-${day}T${hhmm}:00Z`) + 6 * 3600000; // Central is UTC-6; the 16th is a Monday, the 21st a Saturday
  assert.deepEqual(core.visibleMenu(items, od, at(16, '12:00')).map((x) => x.name), ['Club', 'Latte']);
  assert.deepEqual(core.visibleMenu(items, od, at(16, '06:30')).map((x) => x.name), ['Latte'], 'the old times are replaced by the dayparts');
  assert.deepEqual(core.visibleMenu(items, od, at(16, '18:00')).map((x) => x.name), ['Latte'], 'the weekend daypart is not on Monday');
  assert.deepEqual(core.visibleMenu(items, od, at(21, '18:00')).map((x) => x.name), ['Club', 'Latte']);
  assert.deepEqual(core.visibleMenu(items, { ...od, menus: [{ ...od.menus[0], active: false }] }, at(16, '12:00')).map((x) => x.name), ['Club', 'Latte'], 'a menu not published yet changes nothing on the order page');
  assert.deepEqual(core.visibleMenu([...items, { id: 'c', name: 'Old soup', category: 'Coffee', available: false }], od, at(16, '12:00')).map((x) => x.name), ['Club', 'Latte'], 'an item switched off is not shown at all');
  const late = core.normalizeOrdering({ timezone: 'America/Chicago', dayparts: [{ id: 'n', name: 'Late night', days: [false, false, false, false, false, true, true], from: '22:00', to: '02:00' }], menus: [{ id: 'm', name: 'Late', cats: ['Sandwiches'], dayparts: ['n'] }] });
  assert.deepEqual(core.visibleMenu(items, late, at(22, '01:00')).map((x) => x.name), ['Club', 'Latte'], 'after midnight on Saturday night is still Saturday');
  assert.deepEqual(core.visibleMenu(items, late, at(20, '01:00')).map((x) => x.name), ['Latte'], 'after midnight on Thursday night is not Friday');
  assert.deepEqual(core.normalizeOrdering({ dayparts: [], menus: [{ id: 'm', name: 'M', dayparts: ['gone'] }] }).menus[0].dayparts, [], 'a menu forgets dayparts that no longer exist');
  const ids = core.normalizeOrdering({ cats: [{ name: 'Drinks', id: 'ABCDEFGHJKMNPQRSTV' }, { name: 'DRINKS' }, { name: 'Tea', id: 5 }] }).cats.map((c) => c.id);
  assert.ok(ids.every((x) => /^[A-Z0-9]{13}$/.test(x)) && new Set(ids).size === 3, 'IDs are checked and never shared');
  assert.deepEqual(core.parseMenuCsv('Item,Category,Cost\nLatte,Coffee,4.50').items.map((x) => [x.name, x.category, x.price, x.cost]), [['Latte', 'Coffee', 450, null]], 'a sheet with only a Cost column uses it as the price');
  // The item list file: Cost is read back, and a Cost column never takes the place of Price.
  const csv = core.parseMenuCsv('Category,Item name,Price,Cost\nCoffee,Latte,4.50,0.90\nCoffee,Tea,3.00,');
  assert.deepEqual(csv.items.map((x) => [x.name, x.price, x.cost]), [['Latte', 450, 90], ['Tea', 300, null]]);
  assert.deepEqual(core.parseMenuCsv('Item,Cost,Price\nMocha,1.25,5.00').items.map((x) => [x.price, x.cost]), [[500, 125]]);

  const d5 = mkdtempSync(join(tmpdir(), 'pfsites5-'));
  const app5 = createApp({ dataDir: d5, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: false, send: async () => {} } });
  const srv = createServer(app5);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const me = client(), anon = client(), host = { host: 'itemcafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'items@shop.test', password: 'long-enough-pw' });
    const site = (await me('POST', '/api/sites', { name: 'Item Cafe', template: 'order', kind: 'ordering', csv: 'Category,Item,Price\nCoffee,Latte,4.50' })).data.site;
    // Cost is kept when an item is added, changed and imported.
    let menu = (await me('POST', `/api/sites/${site.id}/menu`, { name: 'Mocha', price: 500, category: 'Coffee', cost: 125 })).data.items;
    const mocha = menu.find((x) => x.name === 'Mocha');
    assert.equal(mocha.cost, 125);
    menu = (await me('PUT', `/api/sites/${site.id}/menu/${mocha.id}`, { ...mocha, cost: null })).data.items;
    assert.equal(menu.find((x) => x.name === 'Mocha').cost, null);
    menu = (await me('POST', `/api/sites/${site.id}/menu/import`, { csv: 'Category,Item name,Price,Cost\nCoffee,Cortado,3.75,0.80' })).data.items;
    assert.equal(menu.find((x) => x.name === 'Cortado').cost, 80);
    // A modifier hidden online is not on the order page; a sold-out one is shown but cannot be ordered.
    const latte = menu.find((x) => x.name === 'Latte');
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, modGroups: o.modGroups, cats: [{ name: 'Coffee' }] } });
    await me('POST', `/api/sites/${site.id}/menu/bulk`, { ids: [latte.id], set: { addMod: 'g2' } });
    await me('POST', `/api/sites/${site.id}/publish`, {});
    const page = (await anon('GET', '/order', null, host)).data;
    assert.match(page, /Choose your milk/);
    assert.match(page, /"Almond",75,1/);
    assert.doesNotMatch(page, /"Soy"/, 'a hidden modifier is not on the page');
    const who = { method: 'pickup', name: 'Ana', phone: '903-555-0100', email: 'ana@example.com' };
    const no = await anon('POST', '/_order', { ...who, items: [{ id: latte.id, qty: 1, opts: [[2]] }] }, host);
    assert.equal(no.status, 400);
    assert.match(no.data.error, /Almond is sold out/);
    assert.match((await anon('POST', '/_order', { ...who, items: [{ id: latte.id, qty: 1, opts: [[1]] }] }, host)).data.error, /Soy is not available/);
    assert.equal((await anon('POST', '/_order', { ...who, items: [{ id: latte.id, qty: 1, opts: [[0]] }] }, host)).status, 201);
    // Renaming a category keeps its ID.
    const before = (await me('GET', `/api/sites/${site.id}`)).data.site.ordering.cats.find((c) => c.name === 'Coffee').id;
    assert.match(before, /^[A-Z0-9]{13}$/);
    const cur = (await me('GET', `/api/sites/${site.id}`)).data.site.ordering;
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...cur, cats: [...cur.cats, { name: 'Tea' }], menus: [{ id: 'm1', name: 'Day', cats: ['Coffee'] }], deals: [{ name: 'Early', percent: 10, from: '06:00', to: '09:00', category: 'Coffee' }] } });
    assert.equal((await me('POST', `/api/sites/${site.id}/menu/category`, { from: 'Coffee', to: 'tea' })).status, 409, 'renaming onto another category is refused');
    const r = (await me('POST', `/api/sites/${site.id}/menu/category`, { from: 'Coffee', to: 'Hot drinks' })).data;
    assert.equal(r.ordering.cats.find((c) => c.name === 'Hot drinks').id, before);
    assert.deepEqual([r.ordering.menus[0].cats, r.ordering.deals[0].category], [['Hot drinks'], 'Hot drinks'], 'menus and timed prices follow the new name');
  } finally { base = saved; srv.close(); app5.close(); rmSync(d5, { recursive: true, force: true }); }
});

test('sales activity: payments, refunds, transactions, cash log, closeout, estimates', async () => {
  const d5 = mkdtempSync(join(tmpdir(), 'pfsites5-'));
  const app5 = createApp({ dataDir: d5, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: true, send: async () => {} } });
  const srv = createServer(app5);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const me = client(), anon = client(), host = { host: 'tillcafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'till@shop.test', password: 'long-enough-pw', name: 'Tia' });
    const site = (await me('POST', '/api/sites', { name: 'Till Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price\nTaco,10.00' })).data.site;
    const [taco] = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
    await me('POST', `/api/sites/${site.id}/publish`, {});
    const who = { method: 'pickup', name: 'Ana', phone: '903-555-0100', email: 'ana@example.com' };
    for (const qty of [1, 2]) assert.equal((await anon('POST', '/_order', { ...who, items: [{ id: taco.id, qty }] }, host)).status, 201);
    const [o2, o1] = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders;
    const pay = (o, body) => me('POST', `/api/sites/${site.id}/orders/${o.id}/payment`, body);
    assert.equal((await pay(o1, { method: 'Bitcoin' })).status, 400);
    assert.equal((await pay(o1, { refund: 100 })).status, 400, 'nothing to refund before payment');
    assert.deepEqual([(await pay(o1, { method: 'Cash' })).data.order.paidMethod, (await pay(o2, { method: 'Card' })).data.order.handledBy], ['Cash', 'Tia']);
    assert.equal((await pay(o2, { refund: 5000 })).status, 400, 'cannot refund more than was paid');
    const back = (await pay(o2, { refund: 500, note: 'Wrong item' })).data.order;
    assert.deepEqual([back.refunded, back.refundNote], [500, 'Wrong item']);
    assert.equal((await pay(o2, { clear: true })).status, 400, 'a refunded payment stays on the books');

    const tx = (await me('GET', `/api/sites/${site.id}/transactions?range=today`)).data;
    assert.deepEqual([tx.totals.payments, tx.totals.count, tx.totals.refunds, tx.totals.net], [3000, 2, 500, 2500]);
    assert.deepEqual(tx.tenders.map((t) => [t.method, t.amount, t.refunds]), [['Card', 2000, 500], ['Cash', 1000, 0]]);
    const st = (await me('GET', `/api/sites/${site.id}/stats?range=today`)).data;
    assert.deepEqual(st.tenders.map((t) => [t.name, t.orders]).sort(), [['Card', 1], ['Cash', 1]]);
    assert.equal(st.employees[0].name, 'Tia');

    assert.equal((await me('POST', `/api/sites/${site.id}/cash`, { kind: 'in', amount: 0 })).status, 400);
    await me('POST', `/api/sites/${site.id}/cash`, { kind: 'in', amount: 10000, note: 'Float' });
    await me('POST', `/api/sites/${site.id}/cash`, { kind: 'out', amount: 2500, note: 'Bank' });
    const cash = (await me('GET', `/api/sites/${site.id}/cash?range=today`)).data;
    assert.deepEqual(cash.totals, { cashSales: 1000, cashRefunds: 0, paidIn: 10000, paidOut: 2500, expected: 8500 });

    let batches = (await me('GET', `/api/sites/${site.id}/closeouts`)).data;
    assert.deepEqual([batches.open.number, batches.open.totals.net, batches.history.length], [1, 2500, 0]);
    assert.equal((await me('POST', `/api/sites/${site.id}/closeouts`)).status, 201);
    batches = (await me('GET', `/api/sites/${site.id}/closeouts`)).data;
    assert.deepEqual([batches.open.number, batches.open.totals.net, batches.history[0].totals.net], [2, 0, 2500]);
    assert.equal((await me('POST', `/api/sites/${site.id}/closeouts`)).status, 400, 'an empty batch cannot be closed');

    // Estimates: no payment until converted.
    const est = (await me('POST', `/api/sites/${site.id}/invoices`, { kind: 'estimate', customer: { name: 'Dana', email: 'dana@acme.test' }, items: [{ name: 'Catering', qty: 1, price: 50000 }] })).data.invoice;
    assert.deepEqual([est.kind, est.label], ['estimate', 'EST-1001']);
    await me('POST', `/api/sites/${site.id}/invoices/${est.id}/send`);
    const page = (await anon('GET', new URL(est.url).pathname, null, host)).data;
    assert.match(page, /Estimate EST-1001/);
    assert.ok(!page.includes('Pay $'));
    assert.equal((await me('POST', `/api/sites/${site.id}/invoices/${est.id}/status`, { status: 'paid' })).status, 400);
    const inv = (await me('POST', `/api/sites/${site.id}/invoices/${est.id}/convert`)).data.invoice;
    assert.deepEqual([inv.kind, inv.label, inv.status], ['invoice', 'INV-1001', 'draft']);
    assert.equal((await me('POST', `/api/sites/${site.id}/invoices/${est.id}/convert`)).status, 400);
  } finally { base = saved; srv.close(); app5.close(); rmSync(d5, { recursive: true, force: true }); }
});

test('gift cards, recurring payments, customer import, projects', async () => {
  const d6 = mkdtempSync(join(tmpdir(), 'pfsites6-'));
  const sent = [];
  const app6 = createApp({ dataDir: d6, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: true, send: async (m) => { sent.push(m); } } });
  const srv = createServer(app6);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const me = client(), anon = client(), host = { host: 'giftcafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'gift@shop.test', password: 'long-enough-pw' });
    const site = (await me('POST', '/api/sites', { name: 'Gift Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price\nTaco,10.00' })).data.site;
    const [taco] = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
    await me('POST', `/api/sites/${site.id}/publish`, {});
    // A $15 gift card pays for a $10 order and keeps $5. Selling it is money taken, so it says how it was paid.
    assert.equal((await me('POST', `/api/sites/${site.id}/gift-cards`, { amount: 50, paidWith: 'Cash' })).status, 400);
    assert.equal((await me('POST', `/api/sites/${site.id}/gift-cards`, { amount: 1500 })).status, 400, 'how it was paid is required');
    assert.equal((await me('POST', `/api/sites/${site.id}/gift-cards`, { amount: 1e999, paidWith: 'Cash' })).status, 400);
    const made = (await me('POST', `/api/sites/${site.id}/gift-cards`, { amount: 1500, name: 'Ana', email: 'ana@example.com', paidWith: 'Cash' })).data;
    assert.match(made.code, /^GC[0-9A-F]{10}$/);
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(sent.some((m) => m.to === 'ana@example.com' && m.html.includes(made.code)));
    assert.deepEqual((await anon('GET', `/_promo?code=${made.code}`, null, host)).data, { code: made.code, type: 'gift', value: 1500 });
    const who = { method: 'pickup', name: 'Ana', phone: '903-555-0100', email: 'ana@example.com' };
    assert.equal((await anon('POST', '/_order', { ...who, promo: made.code, items: [{ id: taco.id, qty: 1 }] }, host)).status, 201);
    let cards = (await me('GET', `/api/sites/${site.id}/gift-cards`)).data.cards;
    // The card is a payment, not money off: the sale is still $10, and the order is paid by the card.
    const giftOrder = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
    assert.deepEqual([cards[0].balance, giftOrder.total, giftOrder.discount, giftOrder.gift, giftOrder.paidMethod, !!giftOrder.paidAt], [500, 1000, 0, 1000, 'Gift card', true]);
    assert.deepEqual([cards[0].loaded, cards[0].redeemed], [1500, 1000]);
    const giftTx = (await me('GET', `/api/sites/${site.id}/transactions?range=today`)).data;
    assert.deepEqual(giftTx.payments.map((x) => [x.source, x.method, x.amount]).sort(), [['Gift card', 'Cash', 1500], ['Order', 'Gift card', 1000]], 'the card sale and the order it paid are both recorded');
    // Cancelling gives the card its money back.
    assert.equal((await me('POST', `/api/sites/${site.id}/orders/${giftOrder.id}`, { status: 'cancelled' })).status, 200);
    assert.equal((await me('GET', `/api/sites/${site.id}/gift-cards`)).data.cards[0].balance, 1500);
    assert.equal((await anon('POST', '/_order', { ...who, promo: made.code, items: [{ id: taco.id, qty: 1 }] }, host)).status, 201);
    cards = (await me('GET', `/api/sites/${site.id}/gift-cards`)).data.cards;
    assert.equal(cards[0].balance, 500);
    assert.equal((await me('POST', `/api/sites/${site.id}/gift-cards/${made.code}`, { change: -900 })).status, 400, 'cannot spend more than is left');
    cards = (await me('POST', `/api/sites/${site.id}/gift-cards/${made.code}`, { change: -500 })).data.cards;
    assert.equal(cards[0].balance, 0);
    assert.equal((await anon('GET', `/_promo?code=${made.code}`, null, host)).status, 404, 'an empty card no longer works');

    // A weekly plan makes and sends an invoice when it is due, then moves on a week.
    assert.equal((await me('POST', `/api/sites/${site.id}/plans`, { name: 'Lunch', customer: { name: 'Dana' }, amount: 5000, every: 'weekly' })).status, 400, 'needs an email');
    let plans = (await me('POST', `/api/sites/${site.id}/plans`, { name: 'Office lunch', customer: { name: 'Dana', email: 'dana@acme.test' }, amount: 5000, every: 'weekly', start: '2020-01-01', taxRate: 10 })).data.plans;
    assert.equal(plans[0].status, 'active');
    sent.length = 0;
    app6.tick(Date.now());
    await new Promise((r) => setTimeout(r, 20));
    const invs = (await me('GET', `/api/sites/${site.id}/invoices`)).data.invoices;
    assert.deepEqual([invs.length, invs[0].status, invs[0].total, invs[0].items[0].name], [1, 'sent', 5500, 'Office lunch']);
    assert.ok(sent.some((m) => m.to === 'dana@acme.test' && /Invoice INV-1001/.test(m.subject)));
    plans = (await me('GET', `/api/sites/${site.id}/plans`)).data.plans;
    assert.ok(plans[0].nextDate > new Date().toISOString().slice(0, 10) && plans[0].billed === 5500);
    app6.tick(Date.now());
    assert.equal((await me('GET', `/api/sites/${site.id}/invoices`)).data.invoices.length, 1, 'not billed twice');
    // A monthly plan from the 31st stays on the 31st, or the month's last day, so no month is skipped. Bad schedules are refused.
    assert.equal((await me('POST', `/api/sites/${site.id}/plans`, { name: 'Rent', customer: { name: 'Dana', email: 'dana@acme.test' }, amount: 1000, every: 'monthly', start: '2026-00-00' })).status, 400);
    assert.equal((await me('POST', `/api/sites/${site.id}/plans`, { name: 'Rent', customer: { name: 'Dana', email: 'dana@acme.test' }, amount: 1000, every: 'constructor' })).status, 400);
    const monthly = (await me('POST', `/api/sites/${site.id}/plans`, { name: 'Rent', customer: { name: 'Dana', email: 'dana@acme.test' }, amount: 1000, every: 'monthly', start: '2020-01-31' })).data.plans.find((x) => x.name === 'Rent');
    app6.tick(Date.now());
    const after = (await me('GET', `/api/sites/${site.id}/plans`)).data.plans.find((x) => x.id === monthly.id).nextDate;
    const [ny, nm] = after.split('-').map(Number), monthEnd = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    assert.equal(Number(after.slice(8)), Math.min(31, monthEnd), `monthly plan stays on its day: ${after}`);
    await me('DELETE', `/api/sites/${site.id}/plans/${monthly.id}`);
    plans = (await me('POST', `/api/sites/${site.id}/plans/${plans[0].id}`, { status: 'paused' })).data.plans;
    assert.equal(plans[0].status, 'paused');

    const imp = (await me('POST', `/api/sites/${site.id}/contacts/import`, { rows: [{ name: 'Bo', email: 'bo@x.test' }, { name: '', company: '' }, { name: 'Cy', email: 'not-an-email' }] })).data;
    assert.deepEqual([imp.added, imp.skipped], [1, 2]);
    const inv = (await me('POST', `/api/sites/${site.id}/invoices`, { project: 'Smith wedding', customer: { name: 'Sam' }, items: [{ name: 'Catering', qty: 1, price: 1000 }] })).data.invoice;
    assert.equal(inv.project, 'Smith wedding');
  } finally { base = saved; srv.close(); app6.close(); rmSync(d6, { recursive: true, force: true }); }
});

test('online booking, appointments, shifts and the time clock', async () => {
  const d7 = mkdtempSync(join(tmpdir(), 'pfsites7-'));
  const sent = [];
  const app7 = createApp({ dataDir: d7, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: true, send: async (m) => { sent.push(m); } } });
  const srv = createServer(app7);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const me = client(), anon = client(), host = { host: 'bookcafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'book@shop.test', password: 'long-enough-pw', name: 'Bea' });
    const site = (await me('POST', '/api/sites', { name: 'Book Cafe', template: 'order', kind: 'ordering' })).data.site;
    await me('POST', `/api/sites/${site.id}/publish`, {});
    assert.equal((await anon('GET', '/book', null, host)).status, 404, 'no booking page until it is switched on');
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, booking: { enabled: true, perSlot: 1, services: [{ id: 's1', name: 'Table for dinner', minutes: 90 }] } } });
    assert.match((await anon('GET', '/book', null, host)).data, /Table for dinner · 90 min/);
    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const ask = { service: 's1', date: day, time: '18:30', name: 'Ana Ruiz', phone: '903-555-0100', email: 'ana@example.com', party: 4 };
    assert.equal((await anon('POST', '/_book', { ...ask, date: '2020-01-01' }, host)).status, 400, 'not in the past');
    assert.equal((await anon('POST', '/_book', { ...ask, email: 'nope' }, host)).status, 400);
    assert.equal((await anon('POST', '/_book', ask, host)).status, 201);
    assert.equal((await anon('POST', '/_book', ask, host)).status, 409, 'that time is now full');
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(sent.some((m) => m.to === 'ana@example.com' && /booking request/.test(m.subject)) && sent.some((m) => /New booking request/.test(m.subject)));
    let list = (await me('GET', `/api/sites/${site.id}/appointments`)).data.appointments;
    assert.deepEqual([list.length, list[0].status, list[0].party, list[0].service], [1, 'pending', 4, 'Table for dinner']);
    sent.length = 0;
    assert.equal((await me('POST', `/api/sites/${site.id}/appointments/${list[0].id}`, { status: 'confirmed' })).data.appointment.status, 'confirmed');
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(sent.some((m) => m.to === 'ana@example.com' && /confirmed/.test(m.subject)));
    assert.equal((await me('POST', `/api/sites/${site.id}/appointments`, { serviceName: 'Walk-in', date: day, time: '18:30', name: 'Bo' })).data.appointment.status, 'confirmed', 'staff can add one even when the slot is full');

    assert.equal((await me('POST', `/api/sites/${site.id}/shifts`, { name: 'Bea', day, start: '9', finish: '17:00' })).status, 400);
    await me('POST', `/api/sites/${site.id}/shifts`, { name: 'Bea', day, start: '09:00', finish: '17:00' });
    const sh = (await me('GET', `/api/sites/${site.id}/shifts`)).data;
    assert.deepEqual([sh.shifts.length, sh.people], [1, ['Bea']]);
    let clock = (await me('POST', `/api/sites/${site.id}/timeclock`, { action: 'in' })).data;
    assert.ok(clock.mine);
    assert.equal((await me('POST', `/api/sites/${site.id}/timeclock`, { action: 'in' })).status, 400, 'cannot clock in twice');
    clock = (await me('POST', `/api/sites/${site.id}/timeclock`, { action: 'out' })).data;
    assert.deepEqual([clock.mine, clock.entries.length, clock.entries[0].outAt > 0], [null, 1, true]);
  } finally { base = saved; srv.close(); app7.close(); rmSync(d7, { recursive: true, force: true }); }
});

test('strangers guessing a password cannot lock the owner out; business details go live at once', async () => {
  const me = client(), anon = client();
  const ip = (n) => ({ headers: { 'X-Forwarded-For': `198.51.100.${n}` } });
  assert.equal((await me('POST', '/api/auth/signup', { email: 'guard@shop.test', password: 'long-enough-pw' }, ip(7))).status, 201);
  // Guesses from many addresses: after ten, unknown addresses are held off even with the right password, but the owner's own address gets in.
  for (let i = 0; i < 11; i++) await client()('POST', '/api/auth/login', { email: 'guard@shop.test', password: 'wrong-guess' }, ip(20 + i));
  assert.equal((await client()('POST', '/api/auth/login', { email: 'guard@shop.test', password: 'long-enough-pw' }, ip(99))).status, 429);
  assert.equal((await client()('POST', '/api/auth/login', { email: 'guard@shop.test', password: 'long-enough-pw' }, ip(7))).status, 200);

  // Phone, email and address saved on Business information reach the live site straight away, as the name does.
  const site = (await me('POST', '/api/sites', { name: 'Guard Cafe', template: 'cafe' }, ip(7))).data.site;
  await me('POST', `/api/sites/${site.id}/publish`, {}, ip(7));
  const fresh = (await me('GET', `/api/sites/${site.id}`, null, ip(7))).data.site;
  assert.equal((await me('PUT', `/api/sites/${site.id}/business`, { business: { phone: '903-555-0142' }, rev: 'old' }, ip(7))).status, 412, 'a stale copy is refused');
  const r = await me('PUT', `/api/sites/${site.id}/business`, { business: { phone: '903-555-0142', address1: '12 Elm St' }, rev: fresh.draftRev }, ip(7));
  assert.equal(r.status, 200);
  assert.equal(r.data.site.dirty, false, 'nothing is left waiting to be published');
  const live = (await anon('GET', '/contact', null, { host: `${site.slug}.pfsites.test` })).data;
  assert.match(live, /903-555-0142/);
  assert.match(live, /12 Elm St/);
  // New sites show no invented reviews.
  assert.doesNotMatch((await anon('GET', '/', null, { host: `${site.slug}.pfsites.test` })).data, /Dana R\.|Chris L\./);
});

test('appointments take payments, bookings keep their price, renames follow, hours go live, Spanish sites answer in Spanish', async () => {
  const d8 = mkdtempSync(join(tmpdir(), 'pfsites8-'));
  const sent = [];
  const app8 = createApp({ dataDir: d8, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: true, send: async (m) => { sent.push(m); } } });
  const srv = createServer(app8);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const me = client(), anon = client(), host = { host: 'paycafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'pay@shop.test', password: 'long-enough-pw', name: 'Pat Owner' });
    let site = (await me('POST', '/api/sites', { name: 'Pay Cafe', template: 'order', kind: 'ordering', csv: 'Taco,3.50\nSoda,2.00' })).data.site;
    await me('POST', `/api/sites/${site.id}/publish`, {});
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, booking: { enabled: true, perSlot: 2, services: [{ id: 's1', name: 'Haircut', minutes: 45, price: 4500 }] } } });

    // A booking made online keeps the price the customer was shown, and the customer joins Customers.
    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    assert.equal((await anon('POST', '/_book', { service: 's1', date: day, time: '12:00', name: 'Ana Ruiz', phone: '903-555-0100', email: 'ana@example.com', party: 1 }, host)).status, 201);
    let appt = (await me('GET', `/api/sites/${site.id}/appointments`)).data.appointments[0];
    assert.deepEqual([appt.total, appt.paidAt], [4500, null]);
    let people = (await me('GET', `/api/sites/${site.id}/customers`)).data.customers;
    assert.ok(people.some((c) => c.email === 'ana@example.com'), 'the booker is on the customer list');

    // Recording the payment puts it in Transactions and the customer's spend; it cannot be taken twice, and cancelling waits for a void.
    const pay = (b) => me('POST', `/api/sites/${site.id}/appointments/${appt.id}/payment`, b);
    assert.equal((await pay({ method: 'Bitcoin' })).status, 400);
    appt = (await pay({ method: 'Cash' })).data.appointment;
    assert.deepEqual([appt.paidMethod, appt.paidAt > 0], ['Cash', true]);
    assert.equal((await pay({ method: 'Card' })).status, 409, 'already paid');
    assert.equal((await me('POST', `/api/sites/${site.id}/appointments/${appt.id}`, { status: 'cancelled' })).status, 409, 'void the payment first');
    let tx = (await me('GET', `/api/sites/${site.id}/transactions?range=last30`)).data;
    assert.ok(tx.payments.some((x) => x.source === 'Appointment' && x.amount === 4500 && x.method === 'Cash' && x.by === 'Pat Owner'));
    people = (await me('GET', `/api/sites/${site.id}/customers`)).data.customers;
    assert.equal(people.find((c) => c.email === 'ana@example.com').spent, 4500);
    appt = (await pay({ void: true })).data.appointment;
    assert.equal(appt.paidAt, null);
    tx = (await me('GET', `/api/sites/${site.id}/transactions?range=last30`)).data;
    assert.equal(tx.payments.filter((x) => x.source === 'Appointment').reduce((a, x) => a + x.amount, 0), 0, 'a void takes the payment back out');
    assert.equal((await me('POST', `/api/sites/${site.id}/appointments/${appt.id}`, { status: 'cancelled' })).status, 200);

    // Whoever first takes an order on keeps the credit; later status changes do not take it over.
    const items = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
    const taco = items.find((x) => x.name === 'Taco');
    assert.equal((await anon('POST', '/_order', { name: 'Bo Lee', phone: '903-555-0101', email: 'bo@example.com', method: 'pickup', items: [{ id: taco.id, qty: 1 }] }, host)).status, 201);
    let order = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
    const cook = client();
    await cook('POST', '/api/auth/signup', { email: 'cook@paycafe.test', password: 'long-enough-pw', name: 'samuel-account' });
    await me('POST', `/api/sites/${site.id}/team`, { email: 'cook@paycafe.test', name: 'Sam', role: 'manager' });
    await me('POST', `/api/sites/${site.id}/orders/${order.id}`, { status: 'confirmed' });
    order = (await cook('POST', `/api/sites/${site.id}/orders/${order.id}`, { status: 'ready' })).data.order;
    assert.equal(order.handledBy, 'Pat Owner');
    // Work is filed under the name on the Employees list, and a rename carries over to it.
    await cook('POST', `/api/sites/${site.id}/timeclock`, { action: 'in' });
    let clock = (await me('GET', `/api/sites/${site.id}/timeclock`)).data;
    assert.equal(clock.entries[0].name, 'Sam');
    await me('POST', `/api/sites/${site.id}/team`, { email: 'cook@paycafe.test', name: 'Samuel', role: 'manager' });
    clock = (await me('GET', `/api/sites/${site.id}/timeclock`)).data;
    assert.equal(clock.entries[0].name, 'Samuel');

    // Opening hours saved in the back office reach the live website at once.
    site = (await me('GET', `/api/sites/${site.id}`)).data.site;
    const hours = [{ label: 'Monday – Friday', value: '7:00 AM – 3:00 PM' }];
    assert.equal((await me('PUT', `/api/sites/${site.id}/business`, { business: { hours }, rev: site.draftRev })).status, 200);
    assert.match((await anon('GET', '/', null, host)).data, /7:00 AM – 3:00 PM/);

    // A gift card's balance is shown to the customer who paid with it.
    const card = (await me('POST', `/api/sites/${site.id}/gift-cards`, { amount: 1000, paidWith: 'Cash' })).data.code;
    assert.equal((await anon('POST', '/_order', { name: 'Cy Doe', phone: '903-555-0102', email: 'cy@example.com', method: 'pickup', promo: card, items: [{ id: taco.id, qty: 1 }] }, host)).status, 201);
    order = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
    const page = (await anon('GET', `/order/${order.token}`, null, host)).data;
    assert.match(page, new RegExp(`Left on gift card</span><span>\\$${((1000 - order.gift) / 100).toFixed(2)}`));

    // A Spanish site's customers are told what went wrong in Spanish.
    site = (await me('GET', `/api/sites/${site.id}`)).data.site;
    await me('PUT', `/api/sites/${site.id}`, { draft: { ...site.draft, lang: 'es' }, rev: site.draftRev });
    await me('POST', `/api/sites/${site.id}/publish`, { rev: (await me('GET', `/api/sites/${site.id}`)).data.site.draftRev });
    const r = await anon('POST', '/_order', { name: 'Di', phone: '903-555-0103', email: 'di@example.com', method: 'pickup', items: [] }, host);
    assert.deepEqual([r.status, r.data.error], [400, 'Tu pedido está vacío.']);
  } finally { base = saved; srv.close(); app8.close(); rmSync(d8, { recursive: true, force: true }); }
});

test('links on the page only go to sections that are there; templates make no price or promise', () => {
  const site = createSite('Link Cafe', 'restaurant');
  const gal = site.sections.find((s) => s.type === 'gallery');
  gal.enabled = true; gal.nav = 'Photos';
  const hero = site.sections.find((s) => s.type === 'hero');
  hero.data.primary = { label: 'See photos', href: '#photos' };
  const out = (x) => (typeof x === 'string' ? x : x.html);
  assert.doesNotMatch(out(renderPage(site, 'home', {})), /href="#photos"/, 'an empty gallery is not linked');
  gal.data.images = [{ src: 'https://example.com/a.jpg', alt: '' }];
  assert.match(out(renderPage(site, 'home', {})), /href="#photos"/);
  for (const t of TEMPLATES) {
    const s = createSite('X', t.id);
    for (const sec of s.sections.filter((x) => x.type === 'services')) assert.ok(sec.data.items.every((i) => !i.price), `${t.id} has no invented prices`);
    assert.ok(s.sections.filter((x) => x.type === 'faq').every((x) => x.enabled === false), `${t.id} questions start switched off`);
    assert.doesNotMatch(JSON.stringify(s), /from scratch|best ingredients|fresh bakes|single-origin|laminated|made to last|well-made|chosen by hand|handmade|wood-fired|slow-braised|real ingredients|seasons do|carefully edited|quality materials|done to code|lasting fixes|professional-grade|continuously trained|experienced technicians|expert coaching|protected at every step/i, `${t.id} says nothing about how goods are made or sourced, or the business's credentials`);
  }
});

test('a rename follows the person, never anyone else; appointment tax is reported; visitors cannot change saved customers', async () => {
  const d9 = mkdtempSync(join(tmpdir(), 'pfsites9-'));
  const app9 = createApp({ dataDir: d9, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: false, send: async () => {} } });
  const srv = createServer(app9);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const me = client(), anon = client(), host = { host: 'namecafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'own@name.test', password: 'long-enough-pw', name: 'Pat' });
    let site = (await me('POST', '/api/sites', { name: 'Name Cafe', template: 'order', kind: 'ordering', csv: 'Taco,3.50' })).data.site;
    await me('POST', `/api/sites/${site.id}/publish`, {});
    const taco = (await me('GET', `/api/sites/${site.id}/menu`)).data.items[0];
    const order = async (who) => { await anon('POST', '/_order', { name: who, phone: '903-555-0100', email: `${who.toLowerCase()}@x.test`, method: 'pickup', items: [{ id: taco.id, qty: 1 }] }, host); return (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0]; };
    // Two team members whose account names are both 'Sam'; one is listed as 'Sam', the other as 'Samuel Park'.
    const sam = client(), park = client();
    await sam('POST', '/api/auth/signup', { email: 'sam@name.test', password: 'long-enough-pw', name: 'Sam' });
    await park('POST', '/api/auth/signup', { email: 'park@name.test', password: 'long-enough-pw', name: 'Sam' });
    await me('POST', `/api/sites/${site.id}/team`, { email: 'sam@name.test', name: 'Sam', role: 'manager' });
    await me('POST', `/api/sites/${site.id}/team`, { email: 'park@name.test', name: 'Samuel Park', role: 'manager' });
    assert.equal((await me('POST', `/api/sites/${site.id}/team`, { email: 'park@name.test', name: 'Sam', role: 'manager' })).status, 400, 'one name per person');
    const o1 = await order('Ana');
    await sam('POST', `/api/sites/${site.id}/orders/${o1.id}`, { status: 'confirmed' });
    await sam('POST', `/api/sites/${site.id}/orders/${o1.id}/payment`, { method: 'Cash' });
    const o2 = await order('Bo');
    await park('POST', `/api/sites/${site.id}/orders/${o2.id}`, { status: 'confirmed' });
    const o3 = await order('Cy');
    await me('POST', `/api/sites/${site.id}/orders/${o3.id}`, { status: 'confirmed' });
    // Renaming Samuel Park moves his own work only: not Sam's (whose list name is his account name), nor the owner's.
    await me('POST', `/api/sites/${site.id}/team`, { email: 'park@name.test', name: 'Samuel P.', role: 'manager' });
    let orders = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders;
    const by = Object.fromEntries(orders.map((o) => [o.name, o.handledBy]));
    assert.deepEqual(by, { Ana: 'Sam', Bo: 'Samuel P.', Cy: 'Pat' });
    const tx = (await me('GET', `/api/sites/${site.id}/transactions?range=today`)).data;
    assert.equal(tx.payments.find((x) => x.ref === `#${o1.number}`).by, 'Sam', 'the payment stays with whoever took it');
    // The owner renames themselves on Profile: their own records follow.
    await me('PUT', '/api/me', { name: 'Patricia' });
    orders = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders;
    assert.equal(orders.find((o) => o.name === 'Cy').handledBy, 'Patricia');
    assert.equal(orders.find((o) => o.name === 'Ana').handledBy, 'Sam');

    // An appointment's sales tax is recorded with its payment, and reaches Finances and the Taxes report.
    site = (await me('GET', `/api/sites/${site.id}`)).data.site;
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, taxRate: 8.25, booking: { enabled: true, perSlot: 2, services: [{ id: 's1', name: 'Color', minutes: 60, price: 10000 }] } } });
    const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const appt = (await me('POST', `/api/sites/${site.id}/appointments`, { serviceName: 'Color', date: day, time: '10:00', name: 'Dana Walk', phone: '903-555-0199', email: '', employee: 'Sam', minutes: 60, total: 10825, tax: 825 })).data.appointment;
    assert.equal(appt.tax, 825);
    const cook = client();
    await cook('POST', '/api/auth/signup', { email: 'cook@name.test', password: 'long-enough-pw', name: 'Cook' });
    await me('POST', `/api/sites/${site.id}/team`, { email: 'cook@name.test', name: 'Cook', role: 'kitchen' });
    assert.equal((await me('POST', `/api/sites/${site.id}/appointments/${appt.id}/payment`, { method: 'Card' })).status, 200);
    assert.equal((await cook('POST', `/api/sites/${site.id}/appointments/${appt.id}/payment`, { void: true })).status, 403, 'only a manager can take a payment back');
    const st = (await me('GET', `/api/sites/${site.id}/stats?range=today`)).data;
    assert.equal(st.money.tax, 825, 'the appointment tax is in Finances');
    assert.ok(st.totals.rates.some((r) => r.appointments === 1 && r.tax === 825), 'and in the Taxes report');
    // A customer saved with only a phone number gets the appointment in their spend.
    await me('POST', `/api/sites/${site.id}/contacts`, { name: 'Dana Walk', phone: '903-555-0199' });
    assert.equal((await me('GET', `/api/sites/${site.id}/customers`)).data.customers.find((c) => c.name === 'Dana Walk').spent, 10825);

    // A visitor booking online with a saved customer's email cannot change that customer.
    await me('POST', `/api/sites/${site.id}/contacts`, { name: 'Dr. Jane Smith', company: 'Smith Dental', email: 'jane@example.com', phone: '903-555-1111' });
    assert.equal((await anon('POST', '/_book', { service: 's1', date: day, time: '13:00', name: 'Tommy', phone: '903-555-9999', email: 'jane@example.com', party: 1 }, host)).status, 201);
    const jane = (await me('GET', `/api/sites/${site.id}/customers`)).data.customers.find((c) => c.email === 'jane@example.com');
    assert.deepEqual([jane.name, jane.phone], ['Dr. Jane Smith', '903-555-1111']);
  } finally { base = saved; srv.close(); app9.close(); rmSync(d9, { recursive: true, force: true }); }
});

test('a refused employee save leaves nothing behind; refunds in parts add up exactly; cancels give back their tax; appointment tax as charged', async () => {
  const d10 = mkdtempSync(join(tmpdir(), 'pfsites10-'));
  const sent = [];
  const app10 = createApp({ dataDir: d10, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: true, send: async (m) => { sent.push(m); } } });
  const srv = createServer(app10);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const me = client(), anon = client(), host = { host: 'partcafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'own@part.test', password: 'long-enough-pw', name: 'Pat' });
    let site = (await me('POST', '/api/sites', { name: 'Part Cafe', template: 'order', kind: 'ordering', csv: 'Taco,3.50\nSoda,2.00' })).data.site;
    await me('POST', `/api/sites/${site.id}/publish`, {});
    // A refused save adds no one, changes no role, and the corrected save still sends the invite.
    await me('POST', `/api/sites/${site.id}/team`, { email: 'sam@part.test', name: 'Sam', role: 'kitchen' });
    assert.equal((await me('POST', `/api/sites/${site.id}/team`, { email: 'sam2@part.test', name: 'Sam', role: 'manager' })).status, 400);
    assert.equal((await me('POST', `/api/sites/${site.id}/team`, { email: 'sam3@part.test', name: 'Sam C.', role: 'manager', details: { phone: 'ext. 12' } })).status, 400);
    assert.equal((await me('POST', `/api/sites/${site.id}/team`, { email: 'sam@part.test', name: 'Pat', role: 'manager' })).status, 400);
    let team = (await me('GET', `/api/sites/${site.id}/team`)).data.members;
    assert.deepEqual(team.map((m) => [m.email, m.role]), [['sam@part.test', 'kitchen']], 'nothing was added or changed');
    sent.length = 0;
    const ok = (await me('POST', `/api/sites/${site.id}/team`, { email: 'sam2@part.test', name: 'Sam B.', role: 'manager' })).data;
    assert.deepEqual([ok.added, ok.emailed], [true, true]);
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(sent.some((m) => m.to === 'sam2@part.test'), 'the invite goes out');
    // The owner cannot take on a name someone at the business already goes by.
    assert.equal((await me('PUT', '/api/me', { name: 'Sam' })).status, 400);

    // A full refund made in three parts takes back exactly the order's tax: net sales and tax both end at zero.
    site = (await me('GET', `/api/sites/${site.id}`)).data.site;
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, taxRate: 8.25 } });
    const items = (await me('GET', `/api/sites/${site.id}/menu`)).data.items, taco = items.find((x) => x.name === 'Taco');
    const who = { name: 'Ana', phone: '903-555-0100', email: 'ana@part.test', method: 'pickup' };
    await anon('POST', '/_order', { ...who, items: [{ id: taco.id, qty: 1 }] }, host);
    let order = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
    assert.equal(order.total, 379);
    await me('POST', `/api/sites/${site.id}/orders/${order.id}/payment`, { method: 'Cash' });
    for (const part of [126, 126, 127]) assert.equal((await me('POST', `/api/sites/${site.id}/orders/${order.id}/payment`, { refund: part })).status, 200);
    let st = (await me('GET', `/api/sites/${site.id}/stats?range=today`)).data;
    assert.deepEqual([st.totals.net, st.totals.tax, st.totals.total, st.money.tax], [0, 0, 0, 0]);

    // An order paid in full with a gift card, then cancelled, leaves no tax behind in Finances.
    const card = (await me('POST', `/api/sites/${site.id}/gift-cards`, { amount: 5000, paidWith: 'Cash' })).data.code;
    await anon('POST', '/_order', { ...who, promo: card, items: [{ id: taco.id, qty: 2 }] }, host);
    order = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
    assert.ok(order.paidAt && order.tax > 0);
    await me('POST', `/api/sites/${site.id}/orders/${order.id}`, { status: 'cancelled' });
    st = (await me('GET', `/api/sites/${site.id}/stats?range=today`)).data;
    assert.equal(st.money.tax, 0);

    // An appointment's untaxed service charge is not counted as taxable sales.
    site = (await me('GET', `/api/sites/${site.id}`)).data.site;
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, booking: { enabled: true, perSlot: 2, services: [{ id: 's1', name: 'Haircut', minutes: 30, price: 2500 }] } } });
    const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const appt = (await me('POST', `/api/sites/${site.id}/appointments`, { serviceName: 'Haircut', date: day, time: '10:00', name: 'Ángel Núñez', phone: '903-555-0177', email: '', minutes: 30, total: 3706, tax: 206, taxable: 2500 })).data.appointment;
    await me('POST', `/api/sites/${site.id}/appointments/${appt.id}/payment`, { method: 'Card' });
    st = (await me('GET', `/api/sites/${site.id}/stats?range=today`)).data;
    const row = st.totals.rates.find((r) => r.appointments === 1);
    assert.deepEqual([row.rate, row.taxable, row.nontaxable, row.tax], [8.25, 2500, 1000, 206]);
    // A customer saved with only a phone number, accented name and all, gets the appointment in their spend.
    await me('POST', `/api/sites/${site.id}/contacts`, { name: 'Ángel Núñez', phone: '903-555-0177' });
    assert.equal((await me('GET', `/api/sites/${site.id}/customers`)).data.customers.find((c) => c.name === 'Ángel Núñez').spent, 3706);

    // A message form body that is not an object is answered like an empty form.
    const r = await fetch(`${base}/_forms/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Forwarded-Host': 'partcafe.pfsites.test' }, body: 'null' });
    assert.equal(r.status, 400);
  } finally { base = saved; srv.close(); app10.close(); rmSync(d10, { recursive: true, force: true }); }
});

test('the Taxes report counts money taken; refunds in parts end at exactly zero on every row; Spanish promo answers', async () => {
  const d11 = mkdtempSync(join(tmpdir(), 'pfsites11-'));
  const app11 = createApp({ dataDir: d11, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: false, send: async () => {} } });
  const srv = createServer(app11);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const me = client(), anon = client(), host = { host: 'taxcafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'own@tax.test', password: 'long-enough-pw', name: 'Tess' });
    let site = (await me('POST', '/api/sites', { name: 'Tax Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price,Taxable\nTaco,3.50,yes\nTea,2.25,no' })).data.site;
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, taxRate: 8.25 } });
    await me('POST', `/api/sites/${site.id}/publish`, {});
    const [taco, tea] = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
    const who = { name: 'Ana', phone: '903-555-0100', email: 'ana@tax.test', method: 'pickup' };
    // An order nobody has paid for yet is not tax collected.
    await anon('POST', '/_order', { ...who, items: [{ id: taco.id, qty: 1 }] }, host);
    let st = (await me('GET', `/api/sites/${site.id}/stats?range=today`)).data;
    assert.equal(st.totals.rates.reduce((a, r) => a + r.tax, 0), 0, 'unpaid tax is not collected');
    // Paid in cash, its tax is collected and matches Finances.
    await anon('POST', '/_order', { ...who, items: [{ id: taco.id, qty: 1 }, { id: tea.id, qty: 1 }] }, host);
    const order = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
    assert.equal(order.total, 604);
    await me('POST', `/api/sites/${site.id}/orders/${order.id}/payment`, { method: 'Cash' });
    st = (await me('GET', `/api/sites/${site.id}/stats?range=today`)).data;
    let row = st.totals.rates.find((r) => r.rate === 8.25);
    assert.deepEqual([row.taxable, row.nontaxable, row.tax, row.orders, st.money.tax], [350, 225, 29, 1, 29]);
    // Refunded in odd parts: every row, and every item, ends at exactly zero.
    for (const part of [101, 101, 101, 301]) assert.equal((await me('POST', `/api/sites/${site.id}/orders/${order.id}/payment`, { refund: part })).status, 200);
    st = (await me('GET', `/api/sites/${site.id}/stats?range=today`)).data;
    row = st.totals.rates.find((r) => r.rate === 8.25);
    assert.deepEqual([row.taxable, row.nontaxable, row.tax, st.money.tax], [0, 0, 0, 0]);
    assert.deepEqual(st.items.filter((x) => x.name !== 'Taco' || x.qty === 2).map((x) => [x.name, x.sales]).sort(), [['Taco', 350], ['Tea', 0]], 'only the unpaid taco order is left in item sales');

    // A Spanish site's promo lookups answer in Spanish.
    site = (await me('GET', `/api/sites/${site.id}`)).data.site;
    await me('PUT', `/api/sites/${site.id}`, { draft: { ...site.draft, lang: 'es' }, rev: site.draftRev });
    await me('POST', `/api/sites/${site.id}/publish`, { rev: (await me('GET', `/api/sites/${site.id}`)).data.site.draftRev });
    const r = await anon('GET', '/_promo?code=NOPE', null, { ...host, headers: { Accept: 'application/json' } });
    assert.deepEqual([r.status, r.data.error], [404, 'Ese código no es válido.']);
  } finally { base = saved; srv.close(); app11.close(); rmSync(d11, { recursive: true, force: true }); }
});

test('the Taxes report always equals Finances: part gift card orders cancelled, invoices re-priced after a payment was removed', async () => {
  const d12 = mkdtempSync(join(tmpdir(), 'pfsites12-'));
  const app12 = createApp({ dataDir: d12, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: false, send: async () => {} } });
  const srv = createServer(app12);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const me = client(), anon = client(), host = { host: 'eqcafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'own@eq.test', password: 'long-enough-pw', name: 'Eve' });
    const site = (await me('POST', '/api/sites', { name: 'Eq Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price,Taxable\nTaco,3.50,yes\nTea,2.25,no' })).data.site;
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, taxRate: 8.25 } });
    await me('POST', `/api/sites/${site.id}/publish`, {});
    const [taco, tea] = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
    const sum = (st) => { const rows = st.totals.rates; return [rows.reduce((a, r) => a + r.taxable, 0), rows.reduce((a, r) => a + r.nontaxable, 0), rows.reduce((a, r) => a + r.tax, 0), st.money.tax]; };
    // A $3.00 gift card pays part of an order; the order is then cancelled and the card gets its money back.
    const card = (await me('POST', `/api/sites/${site.id}/gift-cards`, { amount: 300, paidWith: 'Cash' })).data.code;
    await anon('POST', '/_order', { name: 'Ana', phone: '903-555-0100', email: 'ana@eq.test', method: 'pickup', promo: card, items: [{ id: taco.id, qty: 1 }, { id: tea.id, qty: 1 }] }, host);
    let order = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
    assert.equal(order.gift, 300);
    await me('POST', `/api/sites/${site.id}/orders/${order.id}`, { status: 'cancelled' });
    let st = (await me('GET', `/api/sites/${site.id}/stats?range=today`)).data;
    assert.deepEqual(sum(st), [0, 0, 0, 0], 'a cancelled order leaves nothing in the Taxes report');
    // The same, with the rest paid at the counter first: once paid it is all there, once refunded and cancelled it is gone.
    const card2 = (await me('POST', `/api/sites/${site.id}/gift-cards`, { amount: 300, paidWith: 'Cash' })).data.code;
    await anon('POST', '/_order', { name: 'Bo', phone: '903-555-0101', email: 'bo@eq.test', method: 'pickup', promo: card2, items: [{ id: taco.id, qty: 1 }, { id: tea.id, qty: 1 }] }, host);
    order = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
    await me('POST', `/api/sites/${site.id}/orders/${order.id}/payment`, { method: 'Cash' });
    st = (await me('GET', `/api/sites/${site.id}/stats?range=today`)).data;
    assert.deepEqual(sum(st), [350, 225, 29, 29]);
    await me('POST', `/api/sites/${site.id}/orders/${order.id}/payment`, { refund: order.total - order.gift });
    await me('POST', `/api/sites/${site.id}/orders/${order.id}`, { status: 'cancelled' });
    st = (await me('GET', `/api/sites/${site.id}/stats?range=today`)).data;
    assert.deepEqual(sum(st), [0, 0, 0, 0]);
    // An invoice paid, unpaid, re-priced and paid again: the report counts what was paid each time, like Finances.
    const inv = (await me('POST', `/api/sites/${site.id}/invoices`, { customer: { name: 'Cy', email: 'cy@eq.test' }, items: [{ name: 'Catering', qty: 1, price: 10000 }], taxRate: 8.25 })).data.invoice;
    await me('POST', `/api/sites/${site.id}/invoices/${inv.id}/status`, { status: 'paid', method: 'Cash' });
    await me('POST', `/api/sites/${site.id}/invoices/${inv.id}/status`, { status: 'sent' });
    await me('PUT', `/api/sites/${site.id}/invoices/${inv.id}`, { customer: { name: 'Cy', email: 'cy@eq.test' }, items: [{ name: 'Catering', qty: 1, price: 20000 }], taxRate: 8.25 });
    await me('POST', `/api/sites/${site.id}/invoices/${inv.id}/status`, { status: 'paid', method: 'Cash' });
    st = (await me('GET', `/api/sites/${site.id}/stats?range=today`)).data;
    const [, , tax, moneyTax] = sum(st);
    assert.equal(tax, moneyTax, 'net taxes equal Finances');
    assert.equal(tax, 1650);
  } finally { base = saved; srv.close(); app12.close(); rmSync(d12, { recursive: true, force: true }); }
});

test('each ledger row keeps its own tax: a gift card part paid on one day and the rest on another; invoices keep the day they were paid', async () => {
  const d13 = mkdtempSync(join(tmpdir(), 'pfsites13-'));
  const app13 = createApp({ dataDir: d13, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: false, send: async () => {} } });
  const srv = createServer(app13);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  const sql = (fn) => { const db = new DatabaseSync(join(d13, 'sites.db')); try { return fn(db); } finally { db.close(); } };
  try {
    const me = client(), anon = client(), host = { host: 'rowcafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'own@row.test', password: 'long-enough-pw', name: 'Rae' });
    const site = (await me('POST', '/api/sites', { name: 'Row Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price,Taxable\nTaco,10.00,yes' })).data.site;
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, taxRate: 8.25, tips: true } });
    await me('POST', `/api/sites/${site.id}/publish`, {});
    const [taco] = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
    const rows = async (ref) => (await me('GET', `/api/sites/${site.id}/transactions?range=today`)).data.payments.filter((x) => x.ref === ref).sort((a, b) => a.at - b.at || 0);
    const stats = async (q) => (await me('GET', `/api/sites/${site.id}/stats?${q}`)).data;
    const rate = (st, r) => { const x = st.totals.rates.find((y) => y.rate === r) || { taxable: 0, nontaxable: 0, tax: 0 }; return [x.taxable, x.nontaxable, x.tax]; };
    const pay = (oid, body) => me('POST', `/api/sites/${site.id}/orders/${oid}/payment`, body);

    // A $6.00 gift card pays part of a $10.00 order with $0.83 tax and a $2.00 tip ($12.83). The card's part carries its share of
    // the tax and tip; the counter payment carries the rest, and every change of tender or removal moves exactly what it carried.
    const card = (await me('POST', `/api/sites/${site.id}/gift-cards`, { amount: 600, paidWith: 'Cash' })).data.code;
    await anon('POST', '/_order', { name: 'Ana', phone: '903-555-0100', email: 'ana@row.test', method: 'pickup', tip: 20, promo: card, items: [{ id: taco.id, qty: 1 }] }, host);
    const order = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
    assert.deepEqual([order.total, order.tax, order.tip, order.gift], [1283, 83, 200, 600]);
    assert.deepEqual((await rows('#1001')).map((x) => [x.amount, x.tax, x.tip]), [[600, 39, 94]]);
    assert.deepEqual(rate(await stats('range=today'), 8.25), [467, 0, 39], 'the card part is taxable sales with its own tax');
    await pay(order.id, { method: 'Cash' });
    await pay(order.id, { method: 'Card' });
    await pay(order.id, { clear: true });
    await pay(order.id, { method: 'Check' });
    assert.deepEqual((await rows('#1001')).map((x) => [x.amount, x.tax, x.tip]), [[600, 39, 94], [683, 44, 106], [-683, -44, -106], [683, 44, 106], [-683, -44, -106], [683, 44, 106]]);
    let st = await stats('range=today');
    assert.deepEqual([rate(st, 8.25), st.money.tax], [[1000, 0, 83], 83]);

    // An invoice whose taxable half ends on half a cent, paid, paid another way and then taken back, leaves nothing behind.
    const inv = (await me('POST', `/api/sites/${site.id}/invoices`, { customer: { name: 'Cy', email: 'cy@row.test' }, items: [{ name: 'Labor', qty: 1, price: 5000, taxable: false }, { name: 'Parts', qty: 1, price: 5000 }], discount: 525, taxRate: 7 })).data.invoice;
    const status = (body) => me('POST', `/api/sites/${site.id}/invoices/${inv.id}/status`, body);
    await status({ status: 'paid', method: 'Cash' });
    await status({ status: 'paid', method: 'Card' });
    await status({ status: 'sent' });
    st = await stats('range=today');
    assert.deepEqual([rate(st, 7), rate(st, 8.25), st.money.tax], [[0, 0, 0], [1000, 0, 83], 83]);
    // Paid again, then moved to another rate after that payment was taken back: what was reported stays as it was paid.
    await status({ status: 'paid', method: 'Cash' });
    await status({ status: 'sent' });
    await me('PUT', `/api/sites/${site.id}/invoices/${inv.id}`, { customer: { name: 'Cy', email: 'cy@row.test' }, items: [{ name: 'Parts', qty: 1, price: 8000 }], taxRate: 10 });
    await status({ status: 'paid', method: 'Check' });
    const invRows = await rows(`INV-${inv.number}`);
    assert.deepEqual(invRows.map((x) => [x.amount, x.tax, x.taxable, x.rate]).slice(-3), [[9807, 332, 4738, 7], [-9807, -332, -4738, 7], [8800, 800, 8000, 10]]);

    // The card's part, and the invoice's payment taken after its first one was removed, are moved two days back: each day reports what it took.
    sql((db) => {
      const back = (id) => db.prepare('UPDATE money_log SET at = at - ? WHERE id = ?').run(2 * 86400000, id);
      back(db.prepare("SELECT id FROM money_log WHERE ref = '#1001' ORDER BY at, rowid LIMIT 1").get().id);
      back(invRows[invRows.length - 3].id);
    });
    const today = (await stats('range=today')).today, day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    const past = await stats(`range=custom&from=${day(-7)}&to=${day(-1)}`), now = await stats('range=today');
    assert.deepEqual([rate(past, 8.25), rate(past, 7), rate(past, 10), past.money.tax], [[467, 0, 39], [4738, 4737, 332], [0, 0, 0], 371]);
    assert.deepEqual([rate(now, 8.25), rate(now, 7), rate(now, 10), now.money.tax], [[533, 0, 44], [-4738, -4737, -332], [8000, 0, 800], 512]);
    for (const s of [past, now]) assert.equal(s.totals.rates.reduce((a, r) => a + r.tax, 0), s.money.tax, 'the Taxes report equals Finances on each day');
  } finally { base = saved; srv.close(); app13.close(); rmSync(d13, { recursive: true, force: true }); }
});

test('older ledger rows get their figures once; a payment taken back mirrors what it carried; refunds give back what their way took', async () => {
  const d14 = mkdtempSync(join(tmpdir(), 'pfsites14-'));
  const opts = { dataDir: d14, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: false, send: async () => {} } };
  let app14 = createApp(opts), srv = createServer(app14);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  const sql = (fn) => { const db = new DatabaseSync(join(d14, 'sites.db')); try { return fn(db); } finally { db.close(); } };
  const restart = async (change) => { srv.close(); app14.close(); sql(change); app14 = createApp(opts); srv = createServer(app14); await new Promise((r) => srv.listen(0, r)); base = `http://127.0.0.1:${srv.address().port}`; };
  try {
    const me = client(), anon = client(), host = { host: 'oldshop.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'own@old.test', password: 'long-enough-pw', name: 'Old' });
    const site = (await me('POST', '/api/sites', { name: 'Old Shop', template: 'order', kind: 'ordering', csv: 'Item,Price,Taxable\nTaco,10.20,yes\nTea,2.25,no' })).data.site;
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, taxRate: 8.25, tips: true } });
    await me('POST', `/api/sites/${site.id}/publish`, {});
    const [taco, tea] = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
    const tx = async () => (await me('GET', `/api/sites/${site.id}/transactions?range=today`)).data;
    const rate = async (r) => { const st = (await me('GET', `/api/sites/${site.id}/stats?range=today`)).data, x = st.totals.rates.find((y) => y.rate === r) || { taxable: 0, nontaxable: 0, tax: 0 }; return [x.taxable, x.nontaxable, x.tax, st.money.tax]; };

    // Invoice rows. Parts $7.00 (taxable) and Labor $3.00 with a $2.75 discount: the taxable part is exactly $5.075.
    const inv = (await me('POST', `/api/sites/${site.id}/invoices`, { customer: { name: 'Cy' }, items: [{ name: 'Parts', qty: 1, price: 700 }, { name: 'Labor', qty: 1, price: 300, taxable: false }], discount: 275, taxRate: 7 })).data.invoice;
    await me('POST', `/api/sites/${site.id}/invoices/${inv.id}/status`, { status: 'paid', method: 'Card' });
    const invRow = () => sql((db) => db.prepare("SELECT amount, tax, taxable, rate FROM money_log WHERE source = 'Invoice' ORDER BY at, rowid").all().map((r) => [r.amount, r.tax, r.taxable, r.rate]));
    assert.deepEqual(invRow(), [[761, 36, 508, 7]]);
    // A row from before rows kept their own figures gets them once, in the same single rounding.
    await restart((db) => db.exec("UPDATE money_log SET taxable = NULL, rate = NULL; DELETE FROM settings WHERE key IN ('invoice_tax_parts', 'invoice_tax_pairs')"));
    assert.deepEqual(invRow(), [[761, 36, 508, 7]]);
    // Whatever a payment row carries, taking it back carries the same, so the pair always cancels.
    sql((db) => db.exec("UPDATE money_log SET taxable = 507 WHERE source = 'Invoice'"));
    await me('POST', `/api/sites/${site.id}/invoices/${inv.id}/status`, { status: 'paid', method: 'Cash' });
    await me('POST', `/api/sites/${site.id}/invoices/${inv.id}/status`, { status: 'void' });
    assert.deepEqual(invRow(), [[761, 36, 507, 7], [-761, -36, -507, 7], [761, 36, 507, 7], [-761, -36, -507, 7]]);
    assert.deepEqual(await rate(7), [0, 0, 0, 0]);
    // A pair written before that rule is matched once.
    await restart((db) => db.exec("UPDATE money_log SET taxable = -508 WHERE source = 'Invoice' AND amount < 0; DELETE FROM settings WHERE key = 'invoice_tax_pairs'"));
    assert.deepEqual(invRow().map((r) => r[2]), [507, -507, 507, -507]);

    // Taco $10.20 (taxable) and Tea $2.25, 8.25% tax and a 20% tip: $15.78. A $7.89 card pays half; its share of the $2.49 tip
    // lands on half a cent, so the card carries $1.25 and the counter $1.24. Refunding the counter part gives back exactly $1.24.
    const card = (await me('POST', `/api/sites/${site.id}/gift-cards`, { amount: 789, paidWith: 'Cash' })).data.code;
    await anon('POST', '/_order', { name: 'Ana', phone: '903-555-0100', email: 'ana@old.test', method: 'pickup', tip: 20, promo: card, items: [{ id: taco.id, qty: 1 }, { id: tea.id, qty: 1 }] }, host);
    const order = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
    assert.deepEqual([order.total, order.tax, order.tip, order.gift], [1578, 84, 249, 789]);
    await me('POST', `/api/sites/${site.id}/orders/${order.id}/payment`, { method: 'Cash' });
    await me('POST', `/api/sites/${site.id}/orders/${order.id}/payment`, { refund: 789 });
    let t = await tx();
    assert.deepEqual(t.payments.filter((x) => x.ref === '#1001').map((x) => [x.method, x.amount, x.tax, x.tip]).sort(), [['Cash', 789, 42, 124], ['Gift card', 789, 42, 125]]);
    assert.deepEqual(t.refunds.map((x) => [x.method, x.amount, x.tax, x.tip]), [['Cash', 789, 42, 124]]);
    assert.deepEqual(await rate(8.25), [510, 112, 42, 42], 'what is left is exactly the card part');
    // Cancelled, the card gets its part back with exactly what that part carried: nothing is left anywhere.
    await me('POST', `/api/sites/${site.id}/orders/${order.id}`, { status: 'cancelled' });
    t = await tx();
    assert.deepEqual(t.refunds.map((x) => [x.method, x.amount, x.tax, x.tip]).sort(), [['Cash', 789, 42, 124], ['Gift card', 789, 42, 125]]);
    assert.deepEqual(await rate(8.25), [0, 0, 0, 0]);

    // Orders recorded before card parts carried their share keep the rows they were recorded with: the card part with no tax, tip
    // or fee, and the counter payment with all of them. A refund then takes the order-wide share, as it always did, and the cancel
    // exactly what is left. An order with a refund written the old way also ends at exactly zero when cancelled.
    const place = async (nm, i) => { const c = (await me('POST', `/api/sites/${site.id}/gift-cards`, { amount: 789, paidWith: 'Cash' })).data.code; await anon('POST', '/_order', { name: nm, phone: `903-555-01${10 + i}`, email: `${nm.toLowerCase()}@old.test`, method: 'pickup', tip: 20, promo: c, items: [{ id: taco.id, qty: 1 }, { id: tea.id, qty: 1 }] }, host); return (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0]; };
    const o2 = await place('Bo', 1), o3 = await place('Cy', 2), o4 = await place('Di', 3);
    await me('POST', `/api/sites/${site.id}/orders/${o3.id}/payment`, { method: 'Cash' });
    await me('POST', `/api/sites/${site.id}/orders/${o4.id}/payment`, { method: 'Cash' });
    sql((db) => {
      db.prepare("UPDATE money_log SET tax = 0, tip = 0, fee = 0 WHERE ref_id IN (?, ?) AND method = 'Gift card'").run(o2.id, o3.id);
      db.prepare("UPDATE money_log SET tax = 84, tip = 249 WHERE ref_id = ? AND method = 'Cash'").run(o3.id);
    });
    const parts = (oid) => sql((db) => db.prepare("SELECT kind, method, amount, tax, tip FROM money_log WHERE ref_id = ? ORDER BY at, rowid").all(oid).map((r) => [r.kind, r.method, r.amount, r.tax, r.tip]));
    await me('POST', `/api/sites/${site.id}/orders/${o2.id}/payment`, { method: 'Card' });
    assert.deepEqual(parts(o2.id), [['payment', 'Gift card', 789, 0, 0], ['payment', 'Card', 789, 84, 249]], 'the counter payment carries what the card part did not');
    await me('POST', `/api/sites/${site.id}/orders/${o3.id}/payment`, { refund: 789 });
    assert.deepEqual(parts(o3.id).slice(-1), [['refund', 'Cash', 789, 42, 125]], 'the order-wide share, not all of it');
    // o4 was recorded the new way, but its counter refund carries the order-wide split an earlier release wrote.
    await me('POST', `/api/sites/${site.id}/orders/${o4.id}/payment`, { refund: 789 });
    sql((db) => db.prepare("UPDATE money_log SET tip = 125 WHERE ref_id = ? AND kind = 'refund'").run(o4.id));
    assert.deepEqual(await rate(8.25), [2041, 450, 168, 168], 'o2 in full, and the kept card halves of o3 and o4 with their share');
    for (const o of [o3, o4]) await me('POST', `/api/sites/${site.id}/orders/${o.id}`, { status: 'cancelled' });
    assert.deepEqual(parts(o3.id).slice(-1), [['refund', 'Gift card', 789, 42, 124]]);
    assert.deepEqual(parts(o4.id).slice(-1), [['refund', 'Gift card', 789, 42, 124]]);
    for (const o of [o3, o4]) { const left = parts(o.id).reduce((a, r) => [a[0] + (r[0] === 'payment' ? 1 : -1) * r[3], a[1] + (r[0] === 'payment' ? 1 : -1) * r[4]], [0, 0]); assert.deepEqual(left, [0, 0], `#${o.number} gives back all its tax and tip`); }
    assert.deepEqual(await rate(8.25), [1020, 225, 84, 84], 'only o2 is left, exactly');
  } finally { base = saved; srv.close(); app14.close(); rmSync(d14, { recursive: true, force: true }); }
});

test('a refund never carries more tax, tip and fee than itself, or less than none; a cancelled order takes no payment', async () => {
  const d15 = mkdtempSync(join(tmpdir(), 'pfsites15-'));
  const app15 = createApp({ dataDir: d15, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: false, send: async () => {} } });
  const srv = createServer(app15);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  const sql = (fn) => { const db = new DatabaseSync(join(d15, 'sites.db')); try { return fn(db); } finally { db.close(); } };
  try {
    const me = client(), anon = client(), host = { host: 'capcafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'own@cap.test', password: 'long-enough-pw', name: 'Cap' });
    const site = (await me('POST', '/api/sites', { name: 'Cap Cafe', template: 'order', kind: 'ordering', methods: { pickup: true, delivery: true }, csv: 'Item,Price,Taxable\nTaco,10.20,yes\nTea,2.25,no' })).data.site;
    await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, methods: { pickup: true, delivery: true }, taxRate: 8.25, tips: true, deliveryFee: 399, deliveryMin: 0, promos: [{ code: 'FREE', type: 'percent', value: 100 }] } });
    await me('POST', `/api/sites/${site.id}/publish`, {});
    const [taco, tea] = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
    const pay = (oid, body) => me('POST', `/api/sites/${site.id}/orders/${oid}/payment`, body);
    const latest = async () => (await me('GET', `/api/sites/${site.id}/orders`)).data.orders[0];
    const back = (oid) => sql((db) => db.prepare("SELECT amount, tax, tip, fee FROM money_log WHERE ref_id = ? AND kind = 'refund' ORDER BY at, rowid").all(oid).map((r) => [r.amount, r.tax, r.tip, r.fee]));
    const left = (oid) => sql((db) => { const r = db.prepare("SELECT SUM(CASE WHEN kind = 'payment' THEN amount ELSE -amount END) AS a, SUM(CASE WHEN kind = 'payment' THEN tax ELSE -tax END) AS t, SUM(CASE WHEN kind = 'payment' THEN tip ELSE -tip END) AS p, SUM(CASE WHEN kind = 'payment' THEN fee ELSE -fee END) AS f FROM money_log WHERE ref_id = ?").get(oid); return [r.a, r.t, r.p, r.f]; });
    const fair = (rows) => rows.every(([amt, tax, tip, fee]) => tax >= 0 && tip >= 0 && fee >= 0 && tax + tip + fee <= amt);
    const deliver = { name: 'Ana', phone: '903-555-0100', email: 'ana@cap.test', method: 'delivery', address: '1 Main St', tip: 20 };

    // Taco delivered with a 20% tip: $17.07 ($0.84 tax, $2.04 tip, $3.99 fee). Refunded $12.00, then one cent, then the rest.
    await anon('POST', '/_order', { ...deliver, items: [{ id: taco.id, qty: 1 }] }, host);
    const a = await latest();
    assert.deepEqual([a.total, a.tax, a.tip, a.fee], [1707, 84, 204, 399]);
    await pay(a.id, { method: 'Cash' });
    for (const amt of [1200, 1, 506]) assert.equal((await pay(a.id, { refund: amt })).status, 200);
    assert.deepEqual(back(a.id), [[1200, 59, 143, 280], [1, 0, 1, 0], [506, 25, 60, 119]]);
    assert.deepEqual(left(a.id), [0, 0, 0, 0]);

    // A free Tea delivered with a tip ($4.44, all tip and fee): refunds give back tip and fee, never sales that were not there.
    await anon('POST', '/_order', { ...deliver, promo: 'FREE', items: [{ id: tea.id, qty: 1 }] }, host);
    const f = await latest();
    assert.deepEqual([f.total, f.tip, f.fee], [444, 45, 399]);
    await pay(f.id, { method: 'Card' });
    await pay(f.id, { refund: 74 });
    await pay(f.id, { refund: 370 });
    assert.deepEqual(back(f.id), [[74, 0, 8, 66], [370, 0, 37, 333]]);
    assert.deepEqual(left(f.id), [0, 0, 0, 0]);

    // An order recorded the old way (card part with no tax, counter payment with all of it), with a counter refund an earlier
    // release split on the counter alone (it gave back half the tax for half the counter money). Later refunds never go below none.
    const card = (await me('POST', `/api/sites/${site.id}/gift-cards`, { amount: 500, paidWith: 'Cash' })).data.code;
    await anon('POST', '/_order', { name: 'Bo', phone: '903-555-0101', email: 'bo@cap.test', method: 'pickup', tip: 0, promo: card, items: [{ id: taco.id, qty: 1 }] }, host);
    const g = await latest();
    assert.deepEqual([g.total, g.tax, g.gift], [1104, 84, 500]);
    await pay(g.id, { method: 'Cash' });
    sql((db) => { db.prepare("UPDATE money_log SET tax = 0 WHERE ref_id = ? AND method = 'Gift card'").run(g.id); db.prepare("UPDATE money_log SET tax = 84 WHERE ref_id = ? AND method = 'Cash'").run(g.id); });
    await pay(g.id, { refund: 302 });
    sql((db) => db.prepare("UPDATE money_log SET tax = 42 WHERE ref_id = ? AND kind = 'refund'").run(g.id));
    await pay(g.id, { refund: 100 });
    await pay(g.id, { refund: 202 });
    await me('POST', `/api/sites/${site.id}/orders/${g.id}`, { status: 'cancelled' });
    const gb = back(g.id);
    assert.ok(fair(gb), JSON.stringify(gb));
    assert.deepEqual(gb.map((r) => r[1]), [42, 0, 4, 38]);
    assert.deepEqual(left(g.id), [0, 0, 0, 0]);

    // A screen that has not caught up cannot record a payment on an order that was cancelled.
    const card2 = (await me('POST', `/api/sites/${site.id}/gift-cards`, { amount: 500, paidWith: 'Cash' })).data.code;
    await anon('POST', '/_order', { name: 'Cy', phone: '903-555-0102', email: 'cy@cap.test', method: 'pickup', tip: 0, promo: card2, items: [{ id: taco.id, qty: 1 }] }, host);
    const c = await latest();
    await me('POST', `/api/sites/${site.id}/orders/${c.id}`, { status: 'cancelled' });
    for (const body of [{ method: 'Cash' }, { method: 'Gift card', giftCode: card2 }]) assert.equal((await pay(c.id, body)).status, 409);
    assert.deepEqual(left(c.id), [0, 0, 0, 0]);
  } finally { base = saved; srv.close(); app15.close(); rmSync(d15, { recursive: true, force: true }); }
});

test('a category keeps its online name and colour, customers see the online name, items take colours, and deleting a category moves its items', async () => {
  const d16 = mkdtempSync(join(tmpdir(), 'pfsites16-'));
  const app16 = createApp({ dataDir: d16, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: false, send: async () => {} } });
  const srv = createServer(app16);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const me = client(), anon = client(), host = { host: 'huecafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'own@hue.test', password: 'long-enough-pw', name: 'Hue' });
    const site = (await me('POST', '/api/sites', { name: 'Hue Cafe', template: 'order', kind: 'ordering', csv: 'Category,Item,Price\nDrinks,Tea,2.00\nDrinks,Soda,1.50\nFood,Taco,3.00' })).data.site;
    // The online name and a colour are kept; a colour that is not one is dropped.
    let r = await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, cats: [{ name: 'Drinks', onlineName: ' Cold drinks ', color: '#C96B9C' }, { name: 'Food', color: 'red' }, { name: 'Empty' }],
      menus: [{ id: 'm1', name: 'All day', cats: ['Drinks', 'Food'] }], deals: [{ name: 'Happy hour', percent: 20, from: '15:00', to: '18:00', category: 'Drinks' }] } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.ordering.cats.map((c) => [c.name, c.onlineName, c.color]), [['Drinks', 'Cold drinks', '#c96b9c'], ['Food', '', ''], ['Empty', '', '']]);
    // Customers see the online name; the business still sees its own.
    await me('POST', `/api/sites/${site.id}/publish`, {});
    const page = (await anon('GET', '/order', null, host)).data;
    assert.match(page, /<h2>Cold drinks<\/h2>/);
    assert.doesNotMatch(page, /<h2>Drinks<\/h2>/);
    assert.match(page, /<h2>Food<\/h2>/);
    assert.match((await anon('GET', '/', null, host)).data, /Cold drinks/, 'the home page menu section shows it too');
    // Items take a colour; anything else clears it.
    let items = (await me('GET', `/api/sites/${site.id}/menu`)).data.items;
    const drinks = items.filter((x) => x.category === 'Drinks').map((x) => x.id);
    items = (await me('POST', `/api/sites/${site.id}/menu/bulk`, { ids: drinks, set: { color: '#3B74D6' } })).data.items;
    assert.deepEqual(items.map((x) => [x.name, x.color]), [['Tea', '#3b74d6'], ['Soda', '#3b74d6'], ['Taco', '']]);
    items = (await me('POST', `/api/sites/${site.id}/menu/bulk`, { ids: drinks.slice(0, 1), set: { color: 'url(x)' } })).data.items;
    assert.equal(items[0].color, '');
    // A category with items needs somewhere for them to go; a missing one is not found.
    assert.equal((await me('POST', `/api/sites/${site.id}/menu/category/delete`, { name: 'Drinks' })).status, 400);
    assert.equal((await me('POST', `/api/sites/${site.id}/menu/category/delete`, { name: 'Drinks', to: 'Drinks' })).status, 400);
    assert.equal((await me('POST', `/api/sites/${site.id}/menu/category/delete`, { name: 'Nope' })).status, 404);
    // Deleting Drinks moves its items to Food; the menu that named it just loses it, and its happy hour is switched off.
    r = await me('POST', `/api/sites/${site.id}/menu/category/delete`, { name: 'Drinks', to: 'food' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.items.map((x) => [x.name, x.category]), [['Tea', 'Food'], ['Soda', 'Food'], ['Taco', 'Food']]);
    assert.deepEqual(r.data.ordering.cats.map((c) => c.name), ['Food', 'Empty']);
    assert.deepEqual(r.data.ordering.menus[0].cats, ['Food']);
    assert.deepEqual([r.data.ordering.deals[0].category, r.data.ordering.deals[0].active], ['Drinks', false], 'no other item gets the discount');
    // An empty category just goes.
    r = await me('POST', `/api/sites/${site.id}/menu/category/delete`, { name: 'Empty' });
    assert.deepEqual([r.status, r.data.ordering.cats.map((c) => c.name)], [200, ['Food']]);
    // Only the business can delete its categories.
    assert.equal((await anon('POST', `/api/sites/${site.id}/menu/category/delete`, { name: 'Food', to: 'Food' })).status, 401);
  } finally { base = saved; srv.close(); app16.close(); rmSync(d16, { recursive: true, force: true }); }
});

test('invoices and projects keep their files: PDFs upload as files, attachments are checked, payment terms are kept, projects carry their invoices, and the sweep keeps attached files', async () => {
  const d17 = mkdtempSync(join(tmpdir(), 'pfsites17-'));
  const app17 = createApp({ dataDir: d17, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: false, send: async () => {} } });
  const srv = createServer(app17);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const me = client(), anon = client(), other = client();
    await me('POST', '/api/auth/signup', { email: 'own@files.test', password: 'long-enough-pw', name: 'Files' });
    const site = (await me('POST', '/api/sites', { name: 'File Works', template: 'restaurant' })).data.site;
    await me('POST', `/api/sites/${site.id}/publish`, {});
    const host = { host: `${site.slug}.pfsites.test` };
    // A PDF uploads only as a file, never as a photo. Files are JPG, PNG or PDF.
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
    assert.equal((await me('POST', '/api/uploads', pdf, { raw: true })).status, 415);
    assert.equal((await me('POST', '/api/uploads?kind=file', gif, { raw: true })).status, 415);
    assert.equal((await anon('POST', '/api/uploads?kind=file', pdf, { raw: true })).status, 401);
    const up = await me('POST', '/api/uploads?kind=file', pdf, { raw: true });
    assert.equal(up.status, 201);
    assert.match(up.data.url, /^\/u\/[\w-]+\.pdf$/);
    const img = (await me('POST', '/api/uploads?kind=file', png, { raw: true })).data.url;
    // A PDF is handed over as a download, sandboxed, never opened as a page of the site, and only on the app or the uploader's own
    // sites: another business's web address does not serve it.
    const got = await anon('GET', up.data.url, null, host);
    assert.equal(got.headers.get('content-type'), 'application/pdf');
    assert.equal(got.headers.get('content-disposition'), 'attachment');
    assert.match(got.headers.get('content-security-policy'), /sandbox/);
    assert.equal((await anon('GET', up.data.url)).status, 200);
    const elsewhere = (await me('POST', '/api/sites', { name: 'Other Place', template: 'cafe' })).data.site;
    await me('POST', `/api/sites/${elsewhere.id}/publish`, {});
    const stranger = client();
    await stranger('POST', '/api/auth/signup', { email: 'stranger@files.test', password: 'long-enough-pw', name: 'Stranger' });
    const strangers = (await stranger('POST', '/api/sites', { name: 'Stranger Shop', template: 'cafe' })).data.site;
    await stranger('POST', `/api/sites/${strangers.id}/publish`, {});
    assert.equal((await anon('GET', up.data.url, null, { host: `${elsewhere.slug}.pfsites.test` })).status, 200);
    assert.equal((await anon('GET', up.data.url, null, { host: `${strangers.slug}.pfsites.test` })).status, 404);
    assert.equal((await anon('GET', img, null, { host: `${strangers.slug}.pfsites.test` })).status, 200);
    // An invoice keeps its files by name with their real size. Links that are not uploads here, and repeats, are dropped.
    // Another account's upload cannot be attached here, even with its link.
    await other('POST', '/api/auth/signup', { email: 'other@files.test', password: 'long-enough-pw', name: 'Other' });
    const theirs = (await other('POST', '/api/uploads?kind=file', pdf, { raw: true })).data.url;
    const body = { customer: { name: 'Ann', email: 'ann@x.test' }, items: [{ name: 'Job', qty: 1, price: 10000 }], terms: 'net15', due: '2026-12-08',
      attachments: [{ url: up.data.url, name: 'Quote.hta', size: 1 }, { url: '/u/nothere123.pdf', name: 'x' }, { url: 'https://evil.test/a.pdf', name: 'y' }, { url: up.data.url, name: 'again' }, { url: [up.data.url], name: 'array' }, { url: theirs, name: 'theirs.pdf' }] };
    let r = await me('POST', `/api/sites/${site.id}/invoices`, body);
    assert.equal(r.status, 201);
    const inv = r.data.invoice;
    // The name always ends in the file's real type, so a download can never be saved as something that runs.
    assert.deepEqual(inv.attachments, [{ url: up.data.url, name: 'Quote.pdf', size: pdf.length }]);
    assert.equal((await me('POST', `/api/sites/${site.id}/invoices`, { ...body, attachments: [{ url: up.data.url, name: 'a/b\\c<d>.pdf.exe ' }] })).data.invoice.attachments[0].name, 'a b c d .pdf.pdf');
    assert.equal((await me('POST', `/api/sites/${site.id}/invoices`, { ...body, attachments: [{ url: up.data.url, name: '...' }] })).data.invoice.attachments[0].name, 'file.pdf');
    assert.equal((await me('POST', `/api/sites/${site.id}/invoices`, { ...body, due: '2026-02-31' })).data.invoice.due, '');
    assert.equal(inv.terms, 'net15');
    assert.equal((await me('POST', `/api/sites/${site.id}/invoices`, { ...body, attachments: [], terms: 'whenever' })).data.invoice.terms, '');
    const four = [];
    for (let i = 0; i < 4; i++) four.push((await me('POST', '/api/uploads?kind=file', pdf, { raw: true })).data.url);
    r = await me('PUT', `/api/sites/${site.id}/invoices/${inv.id}`, { ...body, attachments: four.map((url, i) => ({ url, name: `f${i}.pdf` })) });
    assert.equal(r.status, 400);
    // The customer's page offers the file as a download.
    const page = await anon('GET', `/invoice/${inv.url.split('/invoice/')[1]}`, null, host);
    assert.equal(page.status, 200);
    assert.match(page.data, new RegExp(`href="${up.data.url}" download="Quote.pdf"`));
    // Projects need a name, a phase and a customer; dates must be in order; names are not repeated.
    const pbody = { name: 'Deck', phase: 'in_progress', type: 'Build', customer: { name: 'Ann', email: 'ann@x.test' }, start: '2026-12-01', end: '2026-12-20', notes: 'Back deck', attachments: [{ url: img, name: 'Plan.png' }] };
    assert.equal((await me('POST', `/api/sites/${site.id}/projects`, { ...pbody, name: ' ' })).status, 400);
    assert.equal((await me('POST', `/api/sites/${site.id}/projects`, { ...pbody, phase: 'someday' })).status, 400);
    assert.equal((await me('POST', `/api/sites/${site.id}/projects`, { ...pbody, customer: {} })).status, 400);
    assert.equal((await me('POST', `/api/sites/${site.id}/projects`, { ...pbody, start: '2026-12-21' })).status, 400);
    assert.equal((await me('POST', `/api/sites/${site.id}/projects`, { ...pbody, name: 'Dates', start: '2026-02-31', attachments: [] })).data.project.start, '');
    r = await me('POST', `/api/sites/${site.id}/projects`, pbody);
    assert.equal(r.status, 201);
    const proj = r.data.project;
    assert.deepEqual([proj.name, proj.phase, proj.type, proj.customer.name, proj.start, proj.end, proj.notes, proj.attachments], ['Deck', 'in_progress', 'Build', 'Ann', '2026-12-01', '2026-12-20', 'Back deck', [{ url: img, name: 'Plan.png', size: png.length }]]);
    assert.equal((await me('POST', `/api/sites/${site.id}/projects`, { ...pbody, name: 'deck', attachments: [] })).status, 409);
    // A file over 10 MB, or more than 10 files, is refused on a project.
    const big = Buffer.concat([pdf, Buffer.alloc(10 * 1024 * 1024)]);
    const bigUrl = (await me('POST', '/api/uploads?kind=file', big, { raw: true })).data.url;
    assert.equal((await me('PUT', `/api/sites/${site.id}/projects/${proj.id}`, { ...pbody, attachments: [{ url: bigUrl, name: 'big.pdf' }] })).status, 400);
    // Another business cannot see or change them.
    assert.equal((await other('GET', `/api/sites/${site.id}/projects`)).status, 404);
    assert.equal((await other('PUT', `/api/sites/${site.id}/projects/${proj.id}`, pbody)).status, 404);
    // Its invoices follow a rename, and stay, without the project, when it is deleted.
    await me('PUT', `/api/sites/${site.id}/invoices/${inv.id}`, { ...body, project: 'Deck' });
    r = await me('PUT', `/api/sites/${site.id}/projects/${proj.id}`, { ...pbody, name: 'Deck rebuild' });
    assert.equal(r.status, 200);
    assert.equal(r.data.invoices.find((v) => v.id === inv.id).project, 'Deck rebuild');
    const second = (await me('POST', `/api/sites/${site.id}/projects`, { ...pbody, name: 'Fence' })).data.project;
    await me('DELETE', `/api/sites/${site.id}/projects/${(await me('GET', `/api/sites/${site.id}/projects`)).data.projects.find((x) => x.name === 'Dates').id}`);
    r = await me('DELETE', `/api/sites/${site.id}/projects/${proj.id}`);
    assert.deepEqual(r.data.projects.map((x) => x.id), [second.id]);
    assert.equal(r.data.invoices.find((v) => v.id === inv.id).project, '');
    // A service charge is neither discounted nor taxed: a $100 taxed item, $50 off, a $100 charge and 10% tax is $5 tax, $155 in all.
    const charged = { customer: { name: 'Ann' }, items: [{ name: 'Item', qty: 1, price: 10000 }, { name: 'Service charge', qty: 1, price: 10000, taxable: true, charge: true }], taxRate: 10, discount: 5000 };
    const sc = (await me('POST', `/api/sites/${site.id}/invoices`, charged)).data.invoice;
    assert.deepEqual([sc.subtotal, sc.discount, sc.tax, sc.total], [20000, 5000, 500, 15500]);
    assert.deepEqual(sc.items[1], { name: 'Service charge', qty: 1, price: 10000, taxable: false, charge: true });
    // Paid, the ledger records the taxed part after the discount: $50.
    await me('POST', `/api/sites/${site.id}/invoices/${sc.id}/status`, { status: 'paid', method: 'Cash' });
    const ledger = new DatabaseSync(join(d17, 'sites.db'));
    assert.deepEqual({ ...ledger.prepare('SELECT amount, tax, taxable FROM money_log WHERE ref_id = ?').get(sc.id) }, { amount: 15500, tax: 500, taxable: 5000 });
    ledger.close();
    // A discount bigger than what was sold stops there; the service charge is still owed.
    const capped = (await me('POST', `/api/sites/${site.id}/invoices`, { ...charged, items: [{ name: 'Item', qty: 1, price: 3000 }, { name: 'Service charge', qty: 1, price: 2000, charge: true }], taxRate: 0 })).data.invoice;
    assert.deepEqual([capped.discount, capped.total], [3000, 2000]);
    // A saved percentage discount stays a percentage: worked out on what was sold (never the service charge), kept when changed.
    const pctInv = (await me('POST', `/api/sites/${site.id}/invoices`, { ...charged, taxRate: 0, discount: 999999, discountPct: 20, discountName: 'Staff' })).data.invoice;
    assert.deepEqual([pctInv.discount, pctInv.discountPct, pctInv.discountName, pctInv.total], [2000, 20, 'Staff', 18000]);
    const pctMore = (await me('PUT', `/api/sites/${site.id}/invoices/${pctInv.id}`, { ...charged, items: [{ name: 'Item', qty: 2, price: 10000 }, charged.items[1]], taxRate: 0, discountPct: 20, discountName: 'Staff' })).data.invoice;
    assert.deepEqual([pctMore.discount, pctMore.total], [4000, 26000]);
    // A save from a page that does not know about files or payment terms leaves them as they were.
    const kept = (await me('POST', `/api/sites/${site.id}/invoices`, { ...body, attachments: [{ url: up.data.url, name: 'Keep.pdf' }] })).data.invoice;
    const older = (await me('PUT', `/api/sites/${site.id}/invoices/${kept.id}`, { customer: body.customer, items: body.items, due: body.due })).data.invoice;
    assert.deepEqual([older.terms, older.attachments.map((f) => f.name)], ['net15', ['Keep.pdf']]);
    // The customer's page lists a service charge after the tax, with the subtotal of what was sold.
    const pg = await anon('GET', `/invoice/${sc.url.split('/invoice/')[1]}`, null, host);
    assert.match(pg.data, /<span>Subtotal<\/span><span>\$100\.00<\/span>/);
    assert.match(pg.data, /<span>Service charge<\/span><span>\$100\.00<\/span>/);
    assert.ok(!/<td>Service charge<\/td>/.test(pg.data));
    // An estimate becomes an invoice due on receipt: how long the estimate was valid for is not a payment term.
    const quote = (await me('POST', `/api/sites/${site.id}/invoices`, { kind: 'estimate', customer: { name: 'Ann' }, items: [{ name: 'Job', qty: 1, price: 100 }], terms: 'net30', due: '2027-01-01' })).data.invoice;
    const made = (await me('POST', `/api/sites/${site.id}/invoices/${quote.id}/convert`)).data.invoice;
    assert.deepEqual([made.kind, made.terms, made.due], ['invoice', 'receipt', '']);
    // Files have their own room: when it is full, photos still upload.
    const uid = (await me('GET', '/api/me')).data.user.id;
    const raw17 = new DatabaseSync(join(d17, 'sites.db'));
    raw17.prepare("INSERT INTO uploads (name, user_id, size, created_at, kind) VALUES ('filler00001.pdf', ?, ?, ?, 'file')").run(uid, 250 * 1024 * 1024, Date.now());
    raw17.close();
    assert.equal((await me('POST', '/api/uploads?kind=file', pdf, { raw: true })).status, 413);
    assert.equal((await me('POST', '/api/uploads', png, { raw: true })).status, 201);
    // A week on, files an invoice or a project uses stay; the rest are cleared away.
    await app17.sweepUploads(Date.now() + 8 * 86400000);
    assert.equal((await anon('GET', up.data.url, null, host)).status, 200);
    assert.equal((await anon('GET', img, null, host)).status, 200);
    for (const url of [...four, bigUrl]) assert.equal((await anon('GET', url, null, host)).status, 404, url);
  } finally { srv.close(); app17.close(); base = saved; rmSync(d17, { recursive: true, force: true }); }
});

/* ---------- the iPhone app: devices, passcodes, Face ID, Apple push and text message codes ---------- */

// A server of its own with text messages, Apple push and web push stood in for, so the app's routes can be tried end to end.
// What it would text, push and email is kept to look at.
async function appServer({ sms, apns, env = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pfapp-'));
  const texts = [], pushes = [], web = [], mails = [];
  const app = createApp({
    dataDir: dir, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1', ...env }, mailer: { enabled: false, send: async (m) => { mails.push(m); } },
    pusher: async (sub, message) => { web.push({ sub, message }); return 'sent'; },
    sms: sms || { enabled: true, send: async (to, body) => { texts.push({ to, body }); } },
    apns: apns || { enabled: true, send: async (endpoint, message) => { pushes.push({ endpoint, message }); return endpoint.includes(':dead') ? 'gone' : 'sent'; } },
  });
  const srv = createServer(app);
  await new Promise((r) => srv.listen(0, r));
  const saved = base; base = `http://127.0.0.1:${srv.address().port}`;
  // Reads or changes the database directly, to check what is kept and to age things.
  const sql = (q, ...a) => { const raw = new DatabaseSync(join(dir, 'sites.db')); try { const st = raw.prepare(q); return /^\s*select/i.test(q) ? st.all(...a) : st.run(...a); } finally { raw.close(); } };
  return { texts, pushes, web, mails, sql, stop: () => { srv.close(); app.close(); base = saved; rmSync(dir, { recursive: true, force: true }); } };
}
// Requests that count against an address's limits each come from an address of their own, so those limits stay out of the way here.
let appIps = 0;
const newIp = () => ({ headers: { 'X-Forwarded-For': `10.60.${Math.floor(appIps / 250) % 250}.${(appIps++ % 250) + 1}` } });
// Every answer that carries the signed-in person carries exactly these fields.
const USER_FIELDS = ['admin', 'email', 'id', 'name', 'phone', 'textCodes', 'textPhone', 'twoFactor'];

test('iPhone app: a log in hands out a device; its passcode follows the Employees rules and opens the app again', async () => {
  const { createHash } = await import('node:crypto');
  const s = await appServer();
  try {
    const owner = client(), stranger = client(), cook = client();
    await owner('POST', '/api/auth/signup', { email: 'own@app.test', password: 'long-enough-pw', name: 'Olive' }, newIp());
    await stranger('POST', '/api/auth/signup', { email: 'far@app.test', password: 'long-enough-pw', name: 'Fay' }, newIp());
    await cook('POST', '/api/auth/signup', { email: 'cook@app.test', password: 'long-enough-pw', name: 'Cody' }, newIp());
    const site = (await owner('POST', '/api/sites', { name: 'Pocket Cafe', template: 'restaurant' })).data.site;
    const far = (await stranger('POST', '/api/sites', { name: 'Far Cafe', template: 'restaurant' })).data.site;
    const logIn = (c, email, more = {}) => c('POST', '/api/auth/login', { email, password: 'long-enough-pw', ...more }, newIp());
    const unlock = (body) => client()('POST', '/api/app/unlock', body, newIp());
    const ownerCode = () => s.sql('SELECT owner_passcode FROM sites WHERE id = ?', site.id)[0].owner_passcode;
    const devices = (id) => s.sql('SELECT COUNT(*) AS n FROM app_devices WHERE id = ?', id)[0].n;

    // A log in from the app gets a device of its own: an id and a key, handed over this once. Only the key's hash is kept.
    const phone = client();
    let r = await logIn(phone, 'own@app.test', { device: { name: 'Olive’s iPhone' } });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.data.user).sort(), USER_FIELDS);
    const dev = r.data.device, proof = { device: dev.id, secret: dev.secret };
    assert.match(dev.id, /^[\w-]{16}$/);
    assert.match(dev.secret, /^[\w-]{43}$/);
    assert.equal((await logIn(client(), 'own@app.test')).data.device, undefined, 'a log in from a browser gets none');
    assert.equal((await logIn(client(), 'own@app.test', { password: 'wrong-password', device: { name: 'x' } })).data.device, undefined, 'a wrong password gets nothing');
    const [row] = s.sql('SELECT * FROM app_devices WHERE id = ?', dev.id);
    assert.equal(row.secret_hash, createHash('sha256').update(dev.secret).digest('hex'));
    assert.ok(!JSON.stringify(row).includes(dev.secret), 'the key itself is not kept');
    assert.deepEqual([row.name, row.site_id, row.fails], ['Olive’s iPhone', '', 0]);

    // No passcode yet. Only someone who belongs to the business can ask about it.
    assert.deepEqual((await phone('GET', `/api/app/passcode?site=${site.id}`)).data, { has: false, site: { id: site.id, name: 'Pocket Cafe' } });
    assert.equal((await phone('GET', `/api/app/passcode?site=${far.id}`)).status, 404, 'another business is not found');
    assert.equal((await client()('GET', `/api/app/passcode?site=${site.id}`)).status, 401);

    // The rules are the Employees page's: 4 digits, no digit four times, no run up or down.
    for (const bad of ['1111', '1234', '6789', '4321', '0123', '9876', '123', '12345', '12a4', '']) {
      r = await phone('POST', '/api/app/passcode', { ...proof, site: site.id, passcode: bad });
      assert.deepEqual([r.status, r.data.error], [400, 'The passcode must be 4 digits with no sequence or repeat.'], bad);
    }
    // The device has to be the person's own, with its real key, and the business has to be theirs.
    r = await phone('POST', '/api/app/passcode', { device: dev.id, secret: 'x'.repeat(43), site: site.id, passcode: '2580' });
    assert.deepEqual([r.status, r.data.signIn, r.data.error], [401, true, 'Sign in again on this device.']);
    assert.equal((await stranger('POST', '/api/app/passcode', { ...proof, site: far.id, passcode: '2580' })).data.signIn, true, 'someone else’s device does not work for them');
    assert.equal((await phone('POST', '/api/app/passcode', { ...proof, site: far.id, passcode: '2580' })).status, 404, 'nor a business that is not theirs');
    assert.equal(s.sql('SELECT owner_passcode FROM sites WHERE id = ?', far.id)[0].owner_passcode, '');

    // The first passcode is saved as the owner's own at this business, and links the phone to it.
    assert.deepEqual((await phone('POST', '/api/app/passcode', { ...proof, site: site.id, passcode: '2580' })).data, { ok: true });
    assert.equal((await phone('GET', `/api/app/passcode?site=${site.id}`)).data.has, true);
    assert.equal(ownerCode(), '2580');
    assert.equal(s.sql('SELECT site_id FROM app_devices WHERE id = ?', dev.id)[0].site_id, site.id);

    // The app locks by ending its session; the passcode opens it again with a new session that works.
    await phone('POST', '/api/auth/logout', {});
    assert.equal((await phone('GET', '/api/sites')).status, 401);
    r = await phone('POST', '/api/app/unlock', { ...proof, passcode: '2580' }, newIp());
    assert.deepEqual([r.status, r.data.site, r.data.user.email], [200, site.id, 'own@app.test']);
    assert.deepEqual(Object.keys(r.data.user).sort(), USER_FIELDS);
    assert.deepEqual((await phone('GET', '/api/sites')).data.sites.map((x) => x.id), [site.id]);
    assert.equal((await unlock({ device: dev.id, secret: `${dev.secret.slice(0, -1)}${dev.secret.endsWith('A') ? 'B' : 'A'}`, passcode: '2580' })).data.signIn, true, 'a wrong key opens nothing');
    assert.deepEqual([(await unlock({ ...proof })).status], [400], 'a passcode is needed');

    // A wrong passcode says how many tries are left. Linking again needs the passcode already there, unless a new one is made.
    r = await unlock({ ...proof, passcode: '1357' });
    assert.deepEqual([r.status, r.data.error, r.data.left], [401, 'That passcode is not right.', 4]);
    r = await phone('POST', '/api/app/passcode', { ...proof, site: site.id, passcode: '1357' });
    assert.deepEqual([r.status, r.data.error, r.data.left], [400, 'That passcode is not right.', 3]);
    assert.equal((await phone('POST', '/api/app/passcode', { ...proof, site: site.id, passcode: '2580' })).status, 200, 'the right one links it');
    assert.equal(s.sql('SELECT fails FROM app_devices WHERE id = ?', dev.id)[0].fails, 0, 'and starts the count again');
    assert.equal((await phone('POST', '/api/app/passcode', { ...proof, site: site.id, passcode: '1357', replace: true })).status, 200, 'making a new one replaces it');
    assert.equal(ownerCode(), '1357');
    assert.equal((await unlock({ ...proof, passcode: '2580' })).status, 401, 'the old one stops working');
    assert.equal((await unlock({ ...proof, passcode: '1357' })).status, 200);

    // Five wrong passcodes while linking, and the device is forgotten.
    for (let i = 1; i <= 4; i++) assert.equal((await phone('POST', '/api/app/passcode', { ...proof, site: site.id, passcode: '9512' })).data.left, 5 - i);
    r = await phone('POST', '/api/app/passcode', { ...proof, site: site.id, passcode: '9512' });
    assert.deepEqual([r.status, r.data.signIn, r.data.error], [401, true, 'Too many wrong passcodes. Sign in with your email and password.']);
    assert.equal(devices(dev.id), 0);
    assert.equal((await unlock({ ...proof, passcode: '1357' })).data.signIn, true, 'even the right passcode no longer opens it');
    assert.equal(ownerCode(), '1357', 'the passcode itself is not changed by wrong tries');

    // Five wrong passcodes on the lock screen, the same.
    const dev2 = (await logIn(phone, 'own@app.test', { device: { name: 'Olive’s iPhone' } })).data.device, proof2 = { device: dev2.id, secret: dev2.secret };
    assert.equal((await phone('POST', '/api/app/passcode', { ...proof2, site: site.id, passcode: '1357' })).status, 200);
    for (let i = 1; i <= 4; i++) { r = await unlock({ ...proof2, passcode: '9512' }); assert.deepEqual([r.status, r.data.left], [401, 5 - i]); }
    r = await unlock({ ...proof2, passcode: '9512' });
    assert.deepEqual([r.status, r.data.signIn, r.data.error], [401, true, 'Too many wrong passcodes. Sign in with your email and password.']);
    assert.equal((await unlock({ ...proof2, passcode: '1357' })).data.signIn, true);
    assert.equal(devices(dev2.id), 0);

    // A team member's passcode is the one on the Employees page.
    await owner('POST', `/api/sites/${site.id}/team`, { email: 'cook@app.test', name: 'Cody', role: 'kitchen', details: { nickname: 'Chef', passcode: '4826' } });
    const cdev = (await logIn(cook, 'cook@app.test', { device: { name: 'Cody’s iPhone' } })).data.device, cproof = { device: cdev.id, secret: cdev.secret };
    assert.equal((await cook('GET', `/api/app/passcode?site=${site.id}`)).data.has, true);
    assert.equal((await cook('POST', '/api/app/passcode', { ...cproof, site: site.id, passcode: '1357' })).status, 400, 'the owner’s passcode is not theirs');
    assert.equal((await cook('POST', '/api/app/passcode', { ...cproof, site: site.id, passcode: '4826' })).status, 200);
    assert.equal((await unlock({ ...cproof, passcode: '4826' })).status, 200);
    // A new one made in the app is what the Employees page shows; nothing else the owner typed changes, and the owner's own stays.
    assert.equal((await cook('POST', '/api/app/passcode', { ...cproof, site: site.id, passcode: '7391', replace: true })).status, 200);
    let member = (await owner('GET', `/api/sites/${site.id}/team`)).data.members.find((m) => m.email === 'cook@app.test');
    assert.deepEqual([member.details.passcode, member.details.nickname, member.name, member.role], ['7391', 'Chef', 'Cody', 'kitchen']);
    assert.equal(ownerCode(), '1357');
    // The owner changing it on the Employees page changes what opens the app; the page still refuses a weak one.
    assert.equal((await owner('POST', `/api/sites/${site.id}/team`, { email: 'cook@app.test', role: 'kitchen', details: { nickname: 'Chef', passcode: '1234' } })).status, 400);
    assert.equal((await owner('POST', `/api/sites/${site.id}/team`, { email: 'cook@app.test', role: 'kitchen', details: { nickname: 'Chef', passcode: '5173' } })).status, 201);
    assert.equal((await unlock({ ...cproof, passcode: '7391' })).status, 401);
    assert.equal((await unlock({ ...cproof, passcode: '5173' })).status, 200);
    assert.equal((await cook('POST', '/api/app/passcode', { ...cproof, site: far.id, passcode: '5173', replace: true })).status, 404, 'a business they are not on stays out of reach');

    // Taken off the team, the phone no longer opens the app, and the device is forgotten.
    member = (await owner('GET', `/api/sites/${site.id}/team`)).data.members.find((m) => m.email === 'cook@app.test');
    assert.equal((await owner('DELETE', `/api/sites/${site.id}/team/${member.id}`)).status, 200);
    r = await unlock({ ...cproof, passcode: '5173' });
    assert.deepEqual([r.status, r.data.signIn], [401, true]);
    assert.equal(devices(cdev.id), 0);

    // Thirty tries from one address in fifteen minutes, then a pause.
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await client()('POST', '/api/app/unlock', { device: 'nope', secret: 'nope', passcode: '1357' }, { headers: { 'X-Forwarded-For': '10.99.0.1' } })).status;
    assert.equal(last, 429);
  } finally { s.stop(); }
});

test('iPhone app: Face ID, signing a phone out, and every way a phone is made to sign in again', async () => {
  const { createHash } = await import('node:crypto');
  const s = await appServer();
  try {
    const me = client(), stranger = client();
    await me('POST', '/api/auth/signup', { email: 'face@app.test', password: 'long-enough-pw', name: 'Faye' }, newIp());
    await stranger('POST', '/api/auth/signup', { email: 'else@app.test', password: 'long-enough-pw' }, newIp());
    const site = (await me('POST', '/api/sites', { name: 'Face Cafe', template: 'restaurant' })).data.site;
    let password = 'long-enough-pw';
    const unlock = (body) => client()('POST', '/api/app/unlock', body, newIp());
    const theirDevices = () => s.sql("SELECT id FROM app_devices WHERE user_id = (SELECT id FROM users WHERE email = 'face@app.test')").map((x) => x.id);
    // Signs a phone in from the app and links it with the passcode, as the app does after a log in.
    const setUp = async (c) => {
      const d = (await c('POST', '/api/auth/login', { email: 'face@app.test', password, device: { name: 'iPhone' } }, newIp())).data.device;
      const p = { device: d.id, secret: d.secret };
      assert.equal((await c('POST', '/api/app/passcode', { ...p, site: site.id, passcode: '2580', replace: true })).status, 200);
      return p;
    };

    // Face ID needs the passcode set up first.
    const phone = client();
    const d = (await phone('POST', '/api/auth/login', { email: 'face@app.test', password, device: { name: 'iPhone' } }, newIp())).data.device, proof = { device: d.id, secret: d.secret };
    let r = await phone('POST', '/api/app/biometric', proof);
    assert.deepEqual([r.status, r.data.error], [400, 'Set up your passcode first.']);
    assert.equal((await phone('POST', '/api/app/passcode', { ...proof, site: site.id, passcode: '2580' })).status, 200);
    assert.equal((await stranger('POST', '/api/app/biometric', proof)).data.signIn, true, 'only for the person’s own device');
    assert.equal((await client()('POST', '/api/app/biometric', proof)).status, 401, 'and only signed in');
    const { bio } = (await phone('POST', '/api/app/biometric', proof)).data;
    assert.match(bio, /^[\w-]{43}$/);
    assert.equal(s.sql('SELECT bio_hash FROM app_devices WHERE id = ?', d.id)[0].bio_hash, createHash('sha256').update(bio).digest('hex'), 'only its hash is kept');
    // Face ID opens the app in place of the passcode.
    r = await unlock({ ...proof, bio });
    assert.deepEqual([r.status, r.data.site, r.data.user.email], [200, site.id, 'face@app.test']);
    // A Face ID key that does not match switches Face ID off on that phone; the passcode still opens it.
    r = await unlock({ ...proof, bio: 'x'.repeat(43) });
    assert.deepEqual([r.status, r.data.bioOff, r.data.error], [401, true, 'Face ID could not sign you in. Use your passcode.']);
    assert.equal((await unlock({ ...proof, bio })).data.bioOff, true, 'even the right key is off now');
    assert.equal((await unlock({ ...proof, passcode: '2580' })).status, 200);
    // Turned on again it gets a new key; turned off from the app it stops working.
    const again = (await phone('POST', '/api/app/biometric', proof)).data.bio;
    assert.notEqual(again, bio);
    assert.equal((await unlock({ ...proof, bio: again })).status, 200);
    assert.deepEqual((await phone('DELETE', '/api/app/biometric', proof)).data, { ok: true });
    assert.equal((await unlock({ ...proof, bio: again })).data.bioOff, true);

    // Signing the phone out forgets it and ends its session. Doing it again, or with a session alone, does no harm.
    assert.deepEqual((await phone('POST', '/api/app/signout', proof)).data, { ok: true });
    assert.equal((await phone('GET', '/api/sites')).status, 401, 'the session ended');
    assert.equal((await unlock({ ...proof, passcode: '2580' })).data.signIn, true, 'the device is gone');
    assert.deepEqual((await client()('POST', '/api/app/signout', proof)).data, { ok: true });
    const solo = client();
    await solo('POST', '/api/auth/login', { email: 'face@app.test', password }, newIp());
    assert.equal((await solo('POST', '/api/app/signout', {})).status, 200);
    assert.equal((await solo('GET', '/api/sites')).status, 401);

    // "Sign out everywhere" forgets every phone.
    const a = client(), b = client();
    const pa = await setUp(a), pb = await setUp(b);
    assert.equal((await a('POST', '/api/auth/logout-all', {})).status, 200);
    for (const p of [pa, pb]) assert.equal((await unlock({ ...p, passcode: '2580' })).data.signIn, true);
    assert.deepEqual(theirDevices(), []);
    // So does a new password, made on the profile page...
    const c = client(), pc = await setUp(c);
    assert.equal((await c('POST', '/api/auth/password', { current: password, next: 'another-long-pw' })).status, 200);
    password = 'another-long-pw';
    assert.equal((await c('GET', '/api/sites')).status, 200, 'the session that changed it carries on');
    assert.equal((await unlock({ ...pc, passcode: '2580' })).data.signIn, true);
    // ...or set from a reset link.
    const e = client(), pe = await setUp(e);
    await client()('POST', '/api/auth/forgot', { email: 'face@app.test' }, newIp());
    const token = s.mails.filter((m) => m.to === 'face@app.test').at(-1).text.match(/token=([\w-]+)/)[1];
    r = await client()('POST', '/api/auth/reset', { token, password: 'third-long-pw' }, newIp());
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.data.user).sort(), USER_FIELDS);
    password = 'third-long-pw';
    assert.equal((await unlock({ ...pe, passcode: '2580' })).data.signIn, true);
    assert.deepEqual(theirDevices(), []);

    // Ten phones a person: an eleventh sign-in drops the one used longest ago, and its notifications with it.
    const made = [];
    for (let i = 0; i < 11; i++) {
      const p = client(), dv = (await p('POST', '/api/auth/login', { email: 'face@app.test', password, device: { name: `Phone ${i}` } }, newIp())).data.device;
      if (i === 0) assert.equal((await p('POST', '/api/app/push', { device: dv.id, secret: dv.secret, token: 'c3'.repeat(32), env: 'production' })).status, 201);
      made.push(dv.id);
    }
    const kept = theirDevices();
    assert.equal(kept.length, 10);
    assert.ok(!kept.includes(made[0]) && made.slice(1).every((id) => kept.includes(id)), 'the oldest went');
    assert.equal(s.sql("SELECT COUNT(*) AS n FROM push_subs WHERE endpoint LIKE 'apns:%'")[0].n, 0, 'with its notifications');
    // A long name is cut to 60 characters.
    const named = (await client()('POST', '/api/auth/login', { email: 'face@app.test', password, device: { name: 'N'.repeat(80) } }, newIp())).data.device;
    assert.equal(s.sql('SELECT name FROM app_devices WHERE id = ?', named.id)[0].name, 'N'.repeat(60));
  } finally { s.stop(); }
});

test('iPhone app: notifications go to Apple, show on the Devices page, and phones Apple calls gone are dropped', async () => {
  const s = await appServer();
  try {
    const owner = client(), stranger = client();
    await owner('POST', '/api/auth/signup', { email: 'ring@app.test', password: 'long-enough-pw', name: 'Rin' }, newIp());
    await stranger('POST', '/api/auth/signup', { email: 'nosy@app.test', password: 'long-enough-pw' }, newIp());
    const site = (await owner('POST', '/api/sites', { name: 'Ring Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price\nTaco,10.00' })).data.site;
    await owner('POST', `/api/sites/${site.id}/publish`, {});
    const [item] = (await owner('GET', `/api/sites/${site.id}/menu`)).data.items;
    const order = () => client()('POST', '/_order', { method: 'pickup', name: 'Ana', phone: '903-555-0100', email: 'ana@example.com', items: [{ id: item.id, qty: 1 }] }, { host: 'ringcafe.pfsites.test' });
    const appleRows = () => s.sql("SELECT endpoint FROM push_subs WHERE endpoint LIKE 'apns:%' ORDER BY endpoint").map((x) => x.endpoint);
    const phone = client();
    const d = (await phone('POST', '/api/auth/login', { email: 'ring@app.test', password: 'long-enough-pw', device: { name: 'iPhone' } }, newIp())).data.device;
    const proof = { device: d.id, secret: d.secret }, live = 'a1'.repeat(32), fresh = 'e4'.repeat(32), dead = `dead${'b2'.repeat(30)}`;
    const heldBy = (id) => s.sql('SELECT push_endpoint FROM app_devices WHERE id = ?', id)[0].push_endpoint;

    // Only a real device token, for one of Apple's two services, from the person's own signed-in phone.
    for (const bad of [{ token: 'nothex'.repeat(11), env: 'production' }, { token: live, env: 'staging' }, { token: live }, { token: 'a1'.repeat(31), env: 'production' }, { token: 'a1'.repeat(101), env: 'production' }, { env: 'production' }]) {
      assert.equal((await phone('POST', '/api/app/push', { ...proof, ...bad })).status, 400, JSON.stringify(bad));
    }
    assert.equal((await client()('POST', '/api/app/push', { ...proof, token: live, env: 'production' })).status, 401, 'signed out');
    assert.equal((await stranger('POST', '/api/app/push', { ...proof, token: live, env: 'production' })).data.signIn, true, 'someone else’s device');
    assert.deepEqual(appleRows(), []);
    // Kept as apns:<service>:<token>, the token in small letters, next to the browsers' notifications.
    assert.deepEqual((await phone('POST', '/api/app/push', { ...proof, token: live.toUpperCase(), env: 'production' })).data, { ok: true });
    const endpoint = `apns:production:${live}`;
    assert.deepEqual(s.sql("SELECT endpoint, p256dh, auth, fails FROM push_subs WHERE endpoint LIKE 'apns:%'").map((x) => ({ ...x })), [{ endpoint, p256dh: '', auth: '', fails: 0 }]);
    assert.equal(heldBy(d.id), endpoint);
    // The browser route never takes one.
    assert.equal((await phone('POST', '/api/push/subscribe', { subscription: { endpoint, keys: { p256dh: 'a', auth: 'b' } } })).status, 400);
    // A new token for the same phone replaces its old address.
    assert.equal((await phone('POST', '/api/app/push', { ...proof, token: fresh, env: 'development' })).status, 201);
    assert.deepEqual(appleRows(), [`apns:development:${fresh}`]);
    assert.equal(heldBy(d.id), `apns:development:${fresh}`);

    // A second phone, whose token Apple will call gone, and a browser.
    const phone2 = client();
    const d2 = (await phone2('POST', '/api/auth/login', { email: 'ring@app.test', password: 'long-enough-pw', device: { name: 'Old iPhone' } }, newIp())).data.device;
    assert.equal((await phone2('POST', '/api/app/push', { device: d2.id, secret: d2.secret, token: dead, env: 'production' })).status, 201);
    assert.equal((await owner('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/ring', keys: { p256dh: 'k', auth: 'a' } } })).status, 201);
    // The Devices page names the phones as the iPhone app.
    let listed = (await owner('GET', `/api/sites/${site.id}/devices`)).data.devices;
    assert.deepEqual(listed.map((x) => x.service).sort(), ['googleapis.com', 'iPhone app', 'iPhone app']);

    // A new order: Apple gets each phone, with the business's id to group its alerts by; the browser still goes by web push.
    assert.equal((await order()).status, 201);
    await new Promise((res) => setTimeout(res, 60));
    assert.deepEqual(s.pushes.map((p) => p.endpoint).sort(), [`apns:development:${fresh}`, `apns:production:${dead}`]);
    for (const { message } of s.pushes) {
      assert.match(message.title, /^New order #\d+ · /);
      assert.deepEqual([message.url, message.siteId], [`/app/site/${site.id}?tab=orders`, site.id]);
      assert.match(message.tag, /^order-/);
    }
    assert.deepEqual(s.web.map((w) => w.sub.endpoint), ['https://fcm.googleapis.com/fcm/send/ring']);
    assert.equal(s.web[0].message.siteId, undefined, 'web push messages are as they were');
    // The phone Apple called gone is dropped; the other stays.
    assert.deepEqual(appleRows(), [`apns:development:${fresh}`]);
    listed = (await owner('GET', `/api/sites/${site.id}/devices`)).data.devices;
    assert.equal(listed.filter((x) => x.service === 'iPhone app').length, 1);

    // Removing it on the Devices page works as for a browser.
    const iphone = listed.find((x) => x.service === 'iPhone app');
    assert.deepEqual((await owner('DELETE', `/api/sites/${site.id}/devices/${iphone.id}`)).data, { ok: true });
    assert.ok(!(await owner('GET', `/api/sites/${site.id}/devices`)).data.devices.some((x) => x.service === 'iPhone app'));

    // Turned off from the app, its address goes and the phone forgets it.
    assert.equal((await phone('POST', '/api/app/push', { ...proof, token: fresh, env: 'development' })).status, 201);
    assert.equal((await stranger('DELETE', '/api/app/push', proof)).data.signIn, true, 'not by someone else');
    assert.deepEqual((await phone('DELETE', '/api/app/push', proof)).data, { ok: true });
    assert.deepEqual(appleRows(), []);
    assert.equal(heldBy(d.id), '');

    // Ten notification devices a person, browsers and phones together: the one set up longest ago drops off, and a phone whose
    // address dropped off forgets it.
    await owner('POST', '/api/push/unsubscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/ring' });
    assert.equal((await phone('POST', '/api/app/push', { ...proof, token: fresh, env: 'development' })).status, 201);
    s.sql("UPDATE push_subs SET created_at = created_at - 60000 WHERE endpoint LIKE 'apns:%'");
    for (let i = 0; i < 10; i++) assert.equal((await owner('POST', '/api/push/subscribe', { subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/n${i}`, keys: { p256dh: 'k', auth: 'a' } } })).status, 201);
    assert.deepEqual(appleRows(), []);
    assert.equal(heldBy(d.id), '');
    assert.equal(s.sql('SELECT COUNT(*) AS n FROM push_subs')[0].n, 10);

    // Signing the phone out takes its notifications with it.
    assert.equal((await phone('POST', '/api/app/push', { ...proof, token: fresh, env: 'development' })).status, 201);
    assert.deepEqual(appleRows(), [`apns:development:${fresh}`]);
    assert.equal((await phone('POST', '/api/app/signout', proof)).status, 200);
    assert.deepEqual(appleRows(), []);
  } finally { s.stop(); }
});

test('iPhone app: while Apple push is not set up, phones are skipped, not counted as failing', async () => {
  const s = await appServer({ apns: { enabled: false, send: async () => { throw new Error('Apple push is not set up.'); } } });
  try {
    const owner = client();
    await owner('POST', '/api/auth/signup', { email: 'quiet@app.test', password: 'long-enough-pw' }, newIp());
    const config = (await owner('GET', '/api/config')).data;
    assert.deepEqual([config.smsEnabled, config.appPush], [true, false]);
    const site = (await owner('POST', '/api/sites', { name: 'Quiet Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price\nTaco,10.00' })).data.site;
    await owner('POST', `/api/sites/${site.id}/publish`, {});
    const [item] = (await owner('GET', `/api/sites/${site.id}/menu`)).data.items;
    const phone = client();
    const d = (await phone('POST', '/api/auth/login', { email: 'quiet@app.test', password: 'long-enough-pw', device: { name: 'iPhone' } }, newIp())).data.device;
    assert.equal((await phone('POST', '/api/app/push', { device: d.id, secret: d.secret, token: 'f5'.repeat(32), env: 'production' })).status, 201);
    await owner('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/quiet', keys: { p256dh: 'k', auth: 'a' } } });
    assert.equal((await client()('POST', '/_order', { method: 'pickup', name: 'Ana', phone: '903-555-0100', email: 'ana@example.com', items: [{ id: item.id, qty: 1 }] }, { host: 'quietcafe.pfsites.test' })).status, 201);
    await new Promise((res) => setTimeout(res, 60));
    assert.deepEqual(s.sql("SELECT fails FROM push_subs WHERE endpoint LIKE 'apns:%'").map((x) => x.fails), [0], 'the phone is kept, with no failure counted');
    assert.equal(s.web.length, 1, 'browsers still hear about it');
  } finally { s.stop(); }
});

test('text message codes: set up with the password and a texted code, sign in with one, limits, recovery codes, turning off', async () => {
  const { createHash } = await import('node:crypto');
  const { totpCode } = await import('../server/app.js');
  // Where Twilio and Apple push are not set up, the pages are told, and text codes cannot be set up.
  const plain = client();
  let r = await plain('POST', '/api/auth/signup', { email: 'plain@app.test', password: 'long-enough-pw' }, newIp());
  assert.deepEqual(Object.keys(r.data.user).sort(), USER_FIELDS);
  r = await plain('GET', '/api/config');
  assert.deepEqual([r.data.smsEnabled, r.data.appPush], [false, false]);
  await plain('PUT', '/api/me', { phone: '(903) 555-0100' });
  r = await plain('POST', '/api/me/sms/setup', { password: 'long-enough-pw' });
  assert.deepEqual([r.status, r.data.error], [400, 'Text messages are not available yet.']);
  r = await plain('POST', '/api/me/email', { email: 'plain2@app.test', password: 'long-enough-pw' });
  assert.deepEqual(Object.keys(r.data.user).sort(), USER_FIELDS);

  const s = await appServer();
  // The server's clock is moved on where a test needs time to pass, such as the 30 seconds between texts.
  const realNow = Date.now;
  let shift = 0;
  const later = (ms) => { shift += ms; };
  Date.now = () => realNow() + shift;
  const codeIn = (text) => text.body.match(/code is (\d{6})\./)[1];
  const lastCode = () => codeIn(s.texts.at(-1));
  const otherThan = (code) => (code === '000000' ? '111111' : '000000');
  // Turns text codes on for a signed-in person the way the profile page does, then lets the 30-second gap between texts pass.
  const textsOn = async (c, phone, password = 'long-enough-pw') => {
    await c('PUT', '/api/me', { phone });
    assert.equal((await c('POST', '/api/me/sms/setup', { password }, newIp())).status, 200);
    assert.equal((await c('POST', '/api/me/sms/enable', { code: lastCode() })).data.user.textCodes, true);
    later(31000);
  };
  try {
    r = await client()('GET', '/api/config');
    assert.deepEqual([r.data.smsEnabled, r.data.appPush], [true, true]);
    const me = client(), elsewhere = client();
    await me('POST', '/api/auth/signup', { email: 'txt@app.test', password: 'long-enough-pw', name: 'Tia' }, newIp());
    let u = (await me('GET', '/api/me')).data.user;
    assert.deepEqual(Object.keys(u).sort(), USER_FIELDS);
    assert.deepEqual([u.twoFactor, u.textCodes, u.textPhone], [false, false, '']);

    // Setting up needs a session, the password, and a mobile number on the profile that looks like one.
    assert.equal((await client()('POST', '/api/me/sms/setup', { password: 'long-enough-pw' })).status, 401);
    r = await me('POST', '/api/me/sms/setup', { password: 'wrong-password' });
    assert.deepEqual([r.status, r.data.error], [401, 'Your password is not right.']);
    r = await me('POST', '/api/me/sms/setup', { password: 'long-enough-pw' });
    assert.deepEqual([r.status, r.data.error], [400, 'Add your mobile number first.']);
    await me('PUT', '/api/me', { phone: '555-0100' });
    r = await me('POST', '/api/me/sms/setup', { password: 'long-enough-pw' });
    assert.deepEqual([r.status, r.data.error], [400, 'That phone number does not look right.']);
    u = (await me('PUT', '/api/me', { phone: '(903) 555-0142' })).data.user;
    assert.deepEqual(Object.keys(u).sort(), USER_FIELDS);
    assert.equal(s.texts.length, 0, 'nothing was texted yet');
    r = await me('POST', '/api/me/sms/setup', { password: 'long-enough-pw' }, newIp());
    assert.deepEqual(r.data, { sent: true, phone: '•••• 0142' });
    assert.equal(s.texts.length, 1);
    const setupCode = lastCode();
    assert.equal(s.texts[0].to, '+19035550142');
    // The last line binds the code to this site, so an iPhone offers to fill it in here and nowhere else.
    assert.equal(s.texts[0].body, `Your Processor Freedom code is ${setupCode}. It expires in 10 minutes.\n\n@app.pfsites.test #${setupCode}`);
    // The code is kept only as a hash, for ten minutes.
    const [kept] = s.sql('SELECT * FROM codes');
    assert.deepEqual([kept.purpose, kept.phone, kept.tries], ['setup', '+19035550142', 0]);
    assert.ok(!kept.hash.includes(setupCode) && kept.hash !== createHash('sha256').update(setupCode).digest('hex'));
    assert.ok(Math.abs(kept.expires_at - Date.now() - 10 * 60000) < 5000);
    // Another text within 30 seconds is refused, saying when to ask again.
    r = await me('POST', '/api/me/sms/setup', { password: 'long-enough-pw' }, newIp());
    assert.equal(r.status, 429);
    assert.match(r.data.error, /^Please wait ([1-9]|[12]\d|30) seconds? before asking for another code\.$/);
    assert.equal(s.texts.length, 1);

    // Turning it on takes the texted code, once. Other devices sign in again, now with a code, and the account's email hears about it.
    assert.equal((await elsewhere('POST', '/api/auth/login', { email: 'txt@app.test', password: 'long-enough-pw' }, newIp())).status, 200);
    r = await me('POST', '/api/me/sms/enable', { code: otherThan(setupCode) });
    assert.deepEqual([r.status, r.data.error], [400, 'That code is not right. Check the text message and try again.']);
    u = (await me('POST', '/api/me/sms/enable', { code: setupCode })).data.user;
    assert.deepEqual(Object.keys(u).sort(), USER_FIELDS);
    assert.deepEqual([u.textCodes, u.textPhone, u.twoFactor, u.phone], [true, '•••• 0142', false, '(903) 555-0142']);
    assert.equal((await me('POST', '/api/me/sms/enable', { code: setupCode })).data.error, 'That code has expired. Ask for a new one.', 'a code works once');
    assert.equal(s.sql("SELECT sms_phone FROM users WHERE email = 'txt@app.test'")[0].sms_phone, '+19035550142');
    assert.deepEqual([(await me('GET', '/api/me')).data.user.textCodes, (await me('GET', '/api/sites')).status], [true, 200]);
    assert.equal((await elsewhere('GET', '/api/sites')).status, 401, 'other devices are signed out');
    assert.ok(s.mails.some((m) => m.to === 'txt@app.test' && m.subject === 'Text message codes are on' && m.text.includes('•••• 0142')));

    // Signing in now texts a code; the password alone is not enough.
    later(31000);
    const dev = client(), signIn = (more = {}, c = client()) => c('POST', '/api/auth/login', { email: 'txt@app.test', password: 'long-enough-pw', ...more }, newIp());
    const iphone = { device: { name: 'Tia’s iPhone' } }, theirDevices = () => s.sql("SELECT COUNT(*) AS n FROM app_devices WHERE user_id = (SELECT id FROM users WHERE email = 'txt@app.test')")[0].n;
    r = await signIn(iphone, dev);
    assert.deepEqual([r.status, r.data.error, r.data.twoFactor, r.data.methods, r.data.phone, r.data.sent], [401, 'Enter the 6-digit code we texted to •••• 0142.', true, ['text'], '•••• 0142', true]);
    assert.equal(r.data.device, undefined, 'the iPhone app gets no device until the code is in');
    assert.equal((await dev('GET', '/api/sites')).status, 401);
    const loginCode = lastCode();
    assert.equal(s.texts.at(-1).to, '+19035550142');
    // A wrong code says so and keeps the code step up; a right code does not rescue a wrong password; the right one signs in, spaces and all.
    r = await signIn({ ...iphone, code: otherThan(loginCode) }, dev);
    assert.deepEqual([r.status, r.data.twoFactor, r.data.methods, r.data.phone, r.data.error], [401, true, ['text'], '•••• 0142', 'That code is not right. Check the text message and try again, or use one of your recovery codes.']);
    assert.equal(theirDevices(), 0);
    assert.equal((await signIn({ password: 'wrong-password', code: loginCode })).status, 401);
    r = await signIn({ ...iphone, code: ` ${loginCode.slice(0, 3)} ${loginCode.slice(3)} ` }, dev);
    assert.equal(r.status, 200);
    assert.match(r.data.device.secret, /^[\w-]{43}$/);
    assert.equal(theirDevices(), 1, 'one device, made once the code was right');
    assert.deepEqual(Object.keys(r.data.user).sort(), USER_FIELDS);
    assert.deepEqual([r.data.user.textCodes, r.data.user.textPhone, r.data.user.twoFactor], [true, '•••• 0142', false]);
    assert.equal((await dev('GET', '/api/sites')).status, 200);
    r = await signIn({ code: loginCode });
    assert.deepEqual([r.status, r.data.error], [401, 'That code has expired. Ask for a new code, or use one of your recovery codes.'], 'a code works once');
    // A code older than ten minutes is refused.
    later(31000);
    assert.equal((await signIn()).data.sent, true);
    const stale = lastCode();
    s.sql("UPDATE codes SET expires_at = ? WHERE purpose = 'login'", Date.now() - 1);
    assert.equal((await signIn({ code: stale })).data.error, 'That code has expired. Ask for a new code, or use one of your recovery codes.');

    // Five wrong tries use a code up; the two-step limit counts every try, texted codes included.
    const lim = client();
    await lim('POST', '/api/auth/signup', { email: 'lim@app.test', password: 'long-enough-pw' }, newIp());
    await textsOn(lim, '903 555 0177');
    const limIn = (more = {}) => client()('POST', '/api/auth/login', { email: 'lim@app.test', password: 'long-enough-pw', ...more }, newIp());
    assert.equal((await limIn()).data.sent, true);
    const good = lastCode();
    for (let i = 0; i < 4; i++) assert.equal((await limIn({ code: otherThan(good) })).data.error, 'That code is not right. Check the text message and try again, or use one of your recovery codes.');
    assert.equal((await limIn({ code: otherThan(good) })).data.error, 'That code is not right, and it can’t be tried again. Ask for a new code, or use one of your recovery codes.');
    assert.equal((await limIn({ code: good })).status, 401, 'after five wrong tries even the right code is refused');
    assert.equal(s.sql("SELECT COUNT(*) AS n FROM codes WHERE user_id = (SELECT id FROM users WHERE email = 'lim@app.test')")[0].n, 0, 'and it is gone');
    assert.equal((await limIn({ code: good })).status, 401);
    r = await limIn({ code: good });
    assert.deepEqual([r.status, r.data.twoFactor, r.data.methods, r.data.phone], [429, true, ['text'], '•••• 0177']);
    // Six texts an hour for one person, however they are spread out; then it says how many minutes to wait.
    for (let i = 0; i < 4; i++) { later(31000); assert.equal((await limIn()).data.sent, true); }
    later(31000);
    r = await limIn();
    assert.equal(r.status, 429);
    assert.match(r.data.error, /^Please wait (5\d|60) minutes before asking for another code\.$/);
    assert.deepEqual([r.data.twoFactor, r.data.methods, r.data.phone, r.data.sent], [true, ['text'], '•••• 0177', undefined]);

    // With the authenticator app on as well, its code is asked for first; a text goes out only when the person asks for one.
    const both = client();
    await both('POST', '/api/auth/signup', { email: 'both@app.test', password: 'long-enough-pw' }, newIp());
    const { secret } = (await both('POST', '/api/me/2fa/setup', {})).data;
    u = (await both('POST', '/api/me/2fa/enable', { password: 'long-enough-pw', code: totpCode(secret) })).data.user;
    assert.deepEqual(Object.keys(u).sort(), USER_FIELDS);
    await textsOn(both, '+1 903 555 0958');
    u = (await both('GET', '/api/me')).data.user;
    assert.deepEqual([u.twoFactor, u.textCodes, u.textPhone], [true, true, '•••• 0958']);
    const bothIn = (more = {}) => client()('POST', '/api/auth/login', { email: 'both@app.test', password: 'long-enough-pw', ...more }, newIp());
    const textsBefore = s.texts.length;
    r = await bothIn();
    assert.deepEqual([r.status, r.data.error, r.data.twoFactor, r.data.methods, r.data.phone, r.data.sent], [401, 'Enter the 6-digit code from your authenticator app.', true, ['app', 'text'], '•••• 0958', undefined]);
    assert.equal(s.texts.length, textsBefore, 'nothing is texted until asked');
    r = await bothIn({ sendText: true });
    assert.deepEqual([r.status, r.data.error, r.data.sent], [401, 'Enter the 6-digit code we texted to •••• 0958.', true]);
    assert.equal(s.texts.at(-1).to, '+19035550958');
    // A wrong code names both ways; either right code signs in.
    assert.equal((await bothIn({ code: otherThan(lastCode()) })).data.error, 'That code is not right. Try the newest code from your authenticator app or the text message, or use one of your recovery codes.');
    assert.equal((await bothIn({ code: lastCode() })).status, 200, 'the texted code');
    assert.equal((await bothIn({ code: totpCode(secret, Date.now(), 1) })).status, 200, 'the authenticator app’s code');
    // Turning the authenticator app off while text codes stay on keeps the recovery codes.
    const codes = (await both('POST', '/api/me/2fa/recovery', { password: 'long-enough-pw' })).data.codes;
    assert.equal(codes.length, 10);
    u = (await both('POST', '/api/me/2fa/disable', { password: 'long-enough-pw' })).data.user;
    assert.deepEqual(Object.keys(u).sort(), USER_FIELDS);
    assert.deepEqual([u.twoFactor, u.textCodes], [false, true]);
    later(31000);
    r = await bothIn();
    assert.deepEqual([r.data.methods, r.data.sent], [['text'], true], 'with text codes alone a code is texted straight away');
    assert.equal((await bothIn({ code: codes[0] })).status, 200, 'a recovery code still signs in');
    assert.equal((await bothIn({ code: codes[0] })).status, 401, 'once');
    // Turning text codes off needs the password; with both ways off the recovery codes go, and the password alone signs in.
    assert.equal((await both('POST', '/api/me/sms/disable', { password: 'wrong-password' })).status, 401);
    u = (await both('POST', '/api/me/sms/disable', { password: 'long-enough-pw' })).data.user;
    assert.deepEqual(Object.keys(u).sort(), USER_FIELDS);
    assert.deepEqual([u.twoFactor, u.textCodes, u.textPhone], [false, false, '']);
    assert.deepEqual(s.sql("SELECT sms_on, sms_phone, recovery FROM users WHERE email = 'both@app.test'").map((x) => ({ ...x })), [{ sms_on: 0, sms_phone: '', recovery: '' }]);
    assert.equal((await bothIn()).status, 200);
    assert.equal((await both('POST', '/api/me/2fa/recovery', { password: 'long-enough-pw' })).data.error, 'Turn on two-step sign-in first, then download your recovery codes.');

    // Recovery codes work with only text codes on, and sign in without texting anything.
    const rec = client();
    await rec('POST', '/api/auth/signup', { email: 'rec@app.test', password: 'long-enough-pw' }, newIp());
    assert.equal((await rec('POST', '/api/me/2fa/recovery', { password: 'long-enough-pw' })).status, 409, 'not with two-step sign-in off');
    await textsOn(rec, '9035550199');
    const spare = (await rec('POST', '/api/me/2fa/recovery', { password: 'long-enough-pw' })).data.codes;
    assert.equal(spare.length, 10);
    const recIn = (more = {}, password = 'long-enough-pw') => client()('POST', '/api/auth/login', { email: 'rec@app.test', password, ...more }, newIp());
    const sentBefore = s.texts.length;
    assert.equal((await recIn({ code: spare[3] })).status, 200);
    assert.equal(s.texts.length, sentBefore);
    assert.equal((await recIn({ code: spare[3] })).status, 401, 'once');
    // A code sent for setting up never signs anyone in.
    assert.equal((await rec('POST', '/api/me/sms/setup', { password: 'long-enough-pw' }, newIp())).status, 200);
    assert.equal((await recIn({ code: lastCode() })).status, 401);
    assert.equal(s.sql("SELECT COUNT(*) AS n FROM codes WHERE purpose = 'setup' AND user_id = (SELECT id FROM users WHERE email = 'rec@app.test')")[0].n, 1, 'it is left for setting up');
    // A reset link from the email, for an address nobody had confirmed, turns text codes off too: someone who signed up with another
    // person's address first cannot keep the real owner out with their own phone.
    await client()('POST', '/api/auth/forgot', { email: 'rec@app.test' }, newIp());
    const tokenFor = () => s.mails.filter((m) => m.to === 'rec@app.test').at(-1).text.match(/token=([\w-]+)/)[1];
    r = await client()('POST', '/api/auth/reset', { token: tokenFor(), password: 'reset-long-pw' }, newIp());
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.data.user).sort(), USER_FIELDS);
    assert.deepEqual([r.data.user.textCodes, r.data.user.textPhone], [false, '']);
    assert.deepEqual(s.sql("SELECT sms_on, sms_phone, recovery FROM users WHERE email = 'rec@app.test'").map((x) => ({ ...x })), [{ sms_on: 0, sms_phone: '', recovery: '' }]);
    assert.equal(s.sql("SELECT COUNT(*) AS n FROM codes WHERE user_id = (SELECT id FROM users WHERE email = 'rec@app.test')")[0].n, 0);
    // Once the address is confirmed, a reset link only sets the password: signing in still needs the texted code.
    const rec2 = client();
    assert.equal((await recIn({}, 'reset-long-pw').then((x) => x.status)), 200);
    assert.equal((await rec2('POST', '/api/auth/login', { email: 'rec@app.test', password: 'reset-long-pw' }, newIp())).status, 200);
    later(31000);
    await textsOn(rec2, '9035550199', 'reset-long-pw');
    await client()('POST', '/api/auth/forgot', { email: 'rec@app.test' }, newIp());
    r = await client()('POST', '/api/auth/reset', { token: tokenFor(), password: 'second-reset-pw' }, newIp());
    assert.deepEqual([r.status, r.data], [200, { twoFactor: true }]);
    assert.equal(s.sql("SELECT sms_on FROM users WHERE email = 'rec@app.test'")[0].sms_on, 1, 'text codes stay on');
    r = await recIn({}, 'second-reset-pw');
    assert.deepEqual([r.status, r.data.sent, r.data.methods], [401, true, ['text']]);
    assert.equal((await recIn({ code: lastCode() }, 'second-reset-pw')).status, 200);
  } finally { Date.now = realNow; s.stop(); }
});

test('a text that cannot be sent says so, and leaves no code behind', async () => {
  const s = await appServer({ sms: { enabled: true, send: async () => { throw new Error('Twilio answered 400: [number] is not a valid phone number.'); } } });
  try {
    const me = client();
    await me('POST', '/api/auth/signup', { email: 'nosend@app.test', password: 'long-enough-pw' }, newIp());
    await me('PUT', '/api/me', { phone: '9035550123' });
    const r = await me('POST', '/api/me/sms/setup', { password: 'long-enough-pw' }, newIp());
    assert.deepEqual([r.status, r.data.error], [502, 'We could not send the text message. Please try again in a moment.']);
    assert.equal(s.sql('SELECT COUNT(*) AS n FROM codes')[0].n, 0);
    assert.equal((await me('GET', '/api/me')).data.user.textCodes, false);
  } finally { s.stop(); }
});

test('texts go through Twilio, and phone numbers are read the way people type them', async () => {
  const { createSms, normalizePhone, maskPhone } = await import('../server/sms.js');
  const keys = { TWILIO_ACCOUNT_SID: 'AC0123', TWILIO_AUTH_TOKEN: 'tok-secret' };
  assert.equal(createSms({}).enabled, false);
  assert.equal(createSms(keys).enabled, false, 'a number or a messaging service is needed too');
  assert.equal(createSms({ ...keys, TWILIO_FROM: '+19035550100' }).enabled, true);
  assert.equal(createSms({ ...keys, TWILIO_MESSAGING_SERVICE_SID: 'MG0123' }).enabled, true);
  await assert.rejects(createSms({}).send('+19035550111', 'x'), /not set up/);

  const calls = [];
  const taken = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ sid: 'SM1' }), { status: 201 }); };
  assert.deepEqual(await createSms({ ...keys, TWILIO_FROM: '+19035550100' }, taken).send('+19035550111', 'Your code is 123456.'), { sent: true });
  const [{ url, init }] = calls;
  assert.equal(url, 'https://api.twilio.com/2010-04-01/Accounts/AC0123/Messages.json');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, `Basic ${Buffer.from('AC0123:tok-secret').toString('base64')}`);
  assert.ok(init.signal instanceof AbortSignal, 'it gives up after a while');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), { To: '+19035550111', From: '+19035550100', Body: 'Your code is 123456.' });
  await createSms({ ...keys, TWILIO_FROM: '+19035550100', TWILIO_MESSAGING_SERVICE_SID: 'MG0123' }, taken).send('+19035550111', 'Hi');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[1].init.body)), { To: '+19035550111', MessagingServiceSid: 'MG0123', Body: 'Hi' });
  // A refusal throws with Twilio's reason, numbers blanked out, and never the message itself.
  const refused = createSms({ ...keys, TWILIO_FROM: '+19035550100' }, async () => new Response(JSON.stringify({ code: 21211, message: "The 'To' number +1 903 555 0111 is not a valid phone number." }), { status: 400 }));
  await assert.rejects(refused.send('+19035550111', 'Your code is 123456.'), (e) => e.message === "Twilio answered 400: The 'To' number [number] is not a valid phone number.");
  await assert.rejects(createSms({ ...keys, TWILIO_FROM: '+19035550100' }, taken).send('903-555-0111', 'x'), /not a number/);
  assert.equal(calls.length, 2, 'nothing was sent for a number that is not one');

  for (const [typed, want] of [['+1 (903) 555-0100', '+19035550100'], ['(903) 555-0100', '+19035550100'], ['903.555.0100', '+19035550100'], ['1 903 555 0100', '+19035550100'], ['+44 20 7946 0958', '+442079460958'],
    ['555-0100', ''], ['+1234567', ''], ['+1234567890123456', ''], ['2 903 555 0100', ''], ['call 903 555 0100', ''], ['903+555+0100', ''], ['', '']]) assert.equal(normalizePhone(typed), want, typed);
  assert.equal(maskPhone('+19035550100'), '•••• 0100');
  assert.equal(maskPhone(''), '');
});

test('Apple push: a signed token, one connection kept open per host, and Apple’s answers', async () => {
  const http2 = await import('node:http2');
  const { generateKeyPairSync, verify } = await import('node:crypto');
  const { createApns } = await import('../server/apns.js');
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).trim();
  // Stands in for Apple: records each request and answers as told.
  const got = [];
  let answer = { status: 200 }, opened = 0;
  const srv = http2.createServer();
  srv.on('session', () => { opened++; });
  srv.on('stream', (stream, headers) => {
    let body = '';
    stream.setEncoding('utf8');
    stream.on('data', (c) => { body += c; });
    stream.on('end', () => { got.push({ headers, body }); stream.respond({ ':status': answer.status, 'content-type': 'application/json' }); stream.end(answer.reason ? JSON.stringify({ reason: answer.reason }) : ''); });
  });
  await new Promise((r) => srv.listen(0, r));
  const origin = `http://127.0.0.1:${srv.address().port}`, dialed = [];
  const env = { APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: 'D8D94SXAG6', APNS_KEY: pem.replace(/\n/g, '\\n') };
  const apns = createApns(env, { hosts: { development: origin, production: `${origin}/` }, connect: (o) => { dialed.push(o); return http2.connect(o); } });
  try {
    // Off unless all three keys are set, and off with a key that cannot be used.
    assert.equal(createApns({}).enabled, false);
    assert.equal(createApns({ ...env, APNS_TEAM_ID: '' }).enabled, false);
    assert.equal(createApns({ ...env, APNS_KEY: 'not a key' }).enabled, false);
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
    assert.equal(createApns({ ...env, APNS_KEY: rsa }).enabled, false, 'only the kind of key Apple gives out');
    await assert.rejects(createApns({}).send(`apns:production:${'ab'.repeat(32)}`, {}), /not set up/);
    // The .p8 key works pasted with written-out \n, or bare without its PEM lines.
    assert.equal(apns.enabled, true);
    assert.equal(createApns({ ...env, APNS_KEY: pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '') }).enabled, true);

    const token = 'ab'.repeat(32), msg = { title: 'New order #12 · $9.00', body: 'Ring Cafe · Pickup · Ana', url: '/app/site/s1?tab=orders', tag: 'order-o1', siteId: 's1' };
    assert.equal(await apns.send(`apns:development:${token}`, msg), 'sent');
    const [{ headers, body }] = got;
    assert.deepEqual([headers[':method'], headers[':path'], headers['apns-topic'], headers['apns-push-type'], headers['apns-priority'], headers['apns-collapse-id']], ['POST', `/3/device/${token}`, 'com.processorfreedomsites.app', 'alert', '10', 'order-o1']);
    assert.deepEqual(JSON.parse(body), { aps: { alert: { title: msg.title, body: msg.body }, sound: 'default', 'thread-id': 's1' }, url: msg.url });
    // The token says ES256 and the key's id, is issued by the team, and is signed with the key.
    const [h, c, sig] = headers.authorization.replace(/^bearer /, '').split('.');
    const part = (x) => JSON.parse(Buffer.from(x, 'base64url').toString());
    assert.deepEqual(part(h), { alg: 'ES256', kid: 'ABC123DEFG' });
    assert.equal(part(c).iss, 'D8D94SXAG6');
    assert.ok(Math.abs(part(c).iat - Date.now() / 1000) < 60);
    assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
    // The same token and connection are used again; without a tag there is no collapse id, and alerts group under 'pf'.
    assert.equal(await apns.send(`apns:development:${token}`, { title: 'Again', body: '' }), 'sent');
    assert.equal(got[1].headers.authorization, headers.authorization);
    assert.equal(got[1].headers['apns-collapse-id'], undefined);
    assert.equal(JSON.parse(got[1].body).aps['thread-id'], 'pf');
    // A tag longer than Apple allows is cut to 64 bytes; production goes to its own host.
    await apns.send(`apns:development:${token}`, { ...msg, tag: 'x'.repeat(100) });
    assert.equal(got.at(-1).headers['apns-collapse-id'], 'x'.repeat(64));
    assert.equal(await apns.send(`apns:production:${token}`, msg), 'sent');
    assert.deepEqual(dialed, [origin, `${origin}/`]);
    // Apple's answers: a phone that is gone is dropped; anything else is a failure, counted by the caller.
    for (const [status, reason] of [[410, 'Unregistered'], [400, 'BadDeviceToken'], [400, 'DeviceTokenNotForTopic']]) { answer = { status, reason }; assert.equal(await apns.send(`apns:development:${token}`, msg), 'gone', reason); }
    answer = { status: 400, reason: 'PayloadTooLarge' };
    await assert.rejects(apns.send(`apns:development:${token}`, msg), /PayloadTooLarge/);
    answer = { status: 500 };
    await assert.rejects(apns.send(`apns:development:${token}`, msg), /500/);
    // A token Apple calls expired is made again for the next notification.
    answer = { status: 403, reason: 'ExpiredProviderToken' };
    await assert.rejects(apns.send(`apns:development:${token}`, msg), /ExpiredProviderToken/);
    answer = { status: 200 };
    assert.equal(await apns.send(`apns:development:${token}`, msg), 'sent');
    const renewed = got.at(-1).headers.authorization.replace(/^bearer /, '').split('.');
    assert.notEqual(renewed.join('.'), headers.authorization.replace(/^bearer /, ''));
    assert.ok(verify('sha256', Buffer.from(`${renewed[0]}.${renewed[1]}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(renewed[2], 'base64url')));
    // An address that is not an iPhone token is dropped without asking Apple.
    const asked = got.length;
    assert.equal(await apns.send('apns:development:not-a-token', msg), 'gone');
    assert.equal(await apns.send('https://fcm.googleapis.com/fcm/send/x', msg), 'gone');
    assert.equal(got.length, asked);
    assert.equal(opened, 2, 'one connection per host, kept open');
  } finally { apns.close(); srv.close(); }
});

/* ---------- the iPhone app, after review: two-step and phones, remembered devices, the location list, text caps, Apple push connections ---------- */

test('iPhone app: turning two-step sign-in on makes phones set up with the password alone sign in again, now with a code', async () => {
  const { totpCode } = await import('../server/app.js');
  const s = await appServer();
  const realNow = Date.now;
  let shift = 0;
  Date.now = () => realNow() + shift;
  try {
    const me = client();
    await me('POST', '/api/auth/signup', { email: 'step@app.test', password: 'long-enough-pw', name: 'Stef' }, newIp());
    const site = (await me('POST', '/api/sites', { name: 'Step Cafe', template: 'restaurant' })).data.site;
    const unlock = (p) => client()('POST', '/api/app/unlock', { ...p, passcode: '2580' }, newIp());
    const phones = () => s.sql('SELECT COUNT(*) AS n FROM app_devices')[0].n;
    const textedCode = () => s.texts.at(-1).body.match(/code is (\d{6})\./)[1];
    // Signs a phone in from the app with what the account needs, and links it with the passcode, as the app does.
    const setUp = async (more = {}) => {
      const c = client();
      const r = await c('POST', '/api/auth/login', { email: 'step@app.test', password: 'long-enough-pw', device: { name: 'iPhone' }, ...more }, newIp());
      assert.equal(r.status, 200, JSON.stringify(r.data));
      const p = { device: r.data.device.id, secret: r.data.device.secret };
      assert.equal((await c('POST', '/api/app/passcode', { ...p, site: site.id, passcode: '2580', replace: true })).status, 200);
      return p;
    };

    // A phone set up while the password alone signed in opens with the passcode...
    const early = await setUp();
    assert.equal((await unlock(early)).status, 200);
    // ...until the authenticator app is turned on. Then it has to sign in again, with a code, like every other device.
    const { secret } = (await me('POST', '/api/me/2fa/setup', {})).data;
    assert.equal((await me('POST', '/api/me/2fa/enable', { password: 'long-enough-pw', code: totpCode(secret) })).status, 200);
    let r = await unlock(early);
    assert.deepEqual([r.status, r.data.signIn, r.data.error], [401, true, 'Sign in again on this device.']);
    assert.equal(phones(), 0);
    assert.equal((await me('GET', '/api/sites')).status, 200, 'the session that turned it on carries on');
    // A phone set up with a code opens with the passcode, and adding text codes while the app is on changes nothing for it.
    const coded = await setUp({ code: totpCode(secret, Date.now(), 1) });
    assert.equal((await unlock(coded)).status, 200);
    await me('PUT', '/api/me', { phone: '903 555 0161' });
    assert.equal((await me('POST', '/api/me/sms/setup', { password: 'long-enough-pw' }, newIp())).status, 200);
    assert.equal((await me('POST', '/api/me/sms/enable', { code: textedCode() })).status, 200);
    assert.equal((await unlock(coded)).status, 200);

    // With both ways off again, a phone is set up with the password alone; turning text codes on drops it the same way.
    assert.equal((await me('POST', '/api/me/2fa/disable', { password: 'long-enough-pw' })).status, 200);
    assert.equal((await me('POST', '/api/me/sms/disable', { password: 'long-enough-pw' })).status, 200);
    const plain = await setUp();
    assert.equal((await unlock(plain)).status, 200);
    shift += 31000;
    assert.equal((await me('POST', '/api/me/sms/setup', { password: 'long-enough-pw' }, newIp())).status, 200);
    assert.equal((await me('POST', '/api/me/sms/enable', { code: textedCode() })).status, 200);
    r = await unlock(plain);
    assert.deepEqual([r.status, r.data.signIn], [401, true]);
    assert.equal(phones(), 0);
  } finally { Date.now = realNow; s.stop(); }
});

test('remember this device: after a right code it skips the code for 14 days, until the account is made safe again', async () => {
  const { createHash } = await import('node:crypto');
  const { totpCode } = await import('../server/app.js');
  const s = await appServer();
  const realNow = Date.now;
  let shift = 0;
  Date.now = () => realNow() + shift;
  const later = (ms) => { shift += ms; };
  try {
    let password = 'long-enough-pw';
    const me = client();
    await me('POST', '/api/auth/signup', { email: 'keep@app.test', password, name: 'Kip' }, newIp());
    // The address is confirmed first, so a reset link later only sets the password and leaves two-step sign-in on.
    const resetToken = async () => { await client()('POST', '/api/auth/forgot', { email: 'keep@app.test' }, newIp()); return s.mails.filter((m) => m.to === 'keep@app.test').at(-1).text.match(/token=([\w-]+)/)[1]; };
    assert.equal((await client()('POST', '/api/auth/reset', { token: await resetToken(), password }, newIp())).status, 200);
    await me('POST', '/api/auth/login', { email: 'keep@app.test', password }, newIp());
    // Text codes on, the way the profile page does it.
    await me('PUT', '/api/me', { phone: '903 555 0171' });
    const textedCode = () => s.texts.at(-1).body.match(/code is (\d{6})\./)[1];
    assert.equal((await me('POST', '/api/me/sms/setup', { password }, newIp())).status, 200);
    assert.equal((await me('POST', '/api/me/sms/enable', { code: textedCode() })).status, 200);
    const logIn = (more = {}) => client()('POST', '/api/auth/login', { email: 'keep@app.test', password, ...more }, newIp());
    // Signs in with a texted code and remember, as the app does, an hour on each time so the limits on texts stay out of the way.
    const remember = async () => {
      later(3600000);
      assert.equal((await logIn()).data.sent, true);
      const got = await logIn({ code: textedCode(), remember: true });
      assert.equal(got.status, 200);
      return got.data.trust;
    };
    const signedIn = async (trust) => { const c = client(); assert.equal((await c('POST', '/api/auth/login', { email: 'keep@app.test', password, trust }, newIp())).status, 200); return c; };

    // Nothing is remembered without the right code, or without asking.
    later(31000);
    let r = await logIn({ remember: true });
    assert.deepEqual([r.status, r.data.twoFactor, r.data.trust], [401, true, undefined]);
    r = await logIn({ remember: true, code: textedCode() === '000000' ? '111111' : '000000' });
    assert.deepEqual([r.status, r.data.trust], [401, undefined]);
    r = await logIn({ code: textedCode() });
    assert.deepEqual([r.status, r.data.trust], [200, undefined]);
    assert.equal(s.sql('SELECT COUNT(*) AS n FROM trusts')[0].n, 0);
    // With remember, the answer carries a token for this device; only its hash is kept, for 14 days.
    later(3600000);
    assert.equal((await logIn()).data.sent, true);
    r = await logIn({ code: textedCode(), remember: true, device: { name: 'iPhone' } });
    assert.equal(r.status, 200);
    const trust = r.data.trust;
    assert.match(trust, /^[\w-]{43}$/);
    assert.match(r.data.device.secret, /^[\w-]{43}$/, 'the app still gets its device');
    const [row] = s.sql('SELECT * FROM trusts');
    assert.equal(row.token_hash, createHash('sha256').update(trust).digest('hex'));
    assert.ok(Math.abs(row.expires_at - Date.now() - 14 * 86400000) < 5000);

    // The remembered device signs in with the password alone: no code is asked for and nothing is texted.
    const sent = s.texts.length;
    later(31000);
    r = await logIn({ trust });
    assert.deepEqual([r.status, r.data.trust, r.data.twoFactor], [200, undefined, undefined]);
    assert.deepEqual(Object.keys(r.data.user).sort(), USER_FIELDS);
    assert.equal(s.texts.length, sent);
    // Never with a wrong password, never with a made-up token, and never for someone else.
    assert.equal((await logIn({ trust, password: 'wrong-password' })).status, 401);
    r = await logIn({ trust: 'x'.repeat(43) });
    assert.deepEqual([r.status, r.data.twoFactor], [401, true]);
    const other = client();
    await other('POST', '/api/auth/signup', { email: 'other@app.test', password: 'long-enough-pw' }, newIp());
    const { secret } = (await other('POST', '/api/me/2fa/setup', {})).data;
    assert.equal((await other('POST', '/api/me/2fa/enable', { password: 'long-enough-pw', code: totpCode(secret) })).status, 200);
    const otherIn = (more) => client()('POST', '/api/auth/login', { email: 'other@app.test', password: 'long-enough-pw', ...more }, newIp());
    r = await otherIn({ trust });
    assert.deepEqual([r.status, r.data.twoFactor], [401, true]);
    // A person keeps ten remembered devices: an eleventh pushes out the one remembered longest ago.
    const theirs = [];
    for (let i = 0; i < 11; i++) { later(120000); theirs.push((await otherIn({ code: totpCode(secret), remember: true })).data.trust); }
    assert.ok(theirs.every((x) => /^[\w-]{43}$/.test(x)));
    assert.equal(s.sql("SELECT COUNT(*) AS n FROM trusts WHERE user_id = (SELECT id FROM users WHERE email = 'other@app.test')")[0].n, 10);
    assert.equal((await otherIn({ trust: theirs[0] })).data.twoFactor, true, 'the first one went');
    assert.equal((await otherIn({ trust: theirs[10] })).status, 200);
    // Fourteen days on, it is no use.
    later(14 * 86400000);
    r = await logIn({ trust });
    assert.deepEqual([r.status, r.data.twoFactor], [401, true]);

    // Signing out everywhere ends every remembered device...
    let t = await remember();
    let c = await signedIn(t);
    assert.equal((await c('POST', '/api/auth/logout-all', {})).status, 200);
    later(31000);
    assert.equal((await logIn({ trust: t })).data.twoFactor, true, 'logging out everywhere ends it');
    // ...and so does a new password, made on the profile page or set from a reset link...
    t = await remember();
    c = await signedIn(t);
    assert.equal((await c('POST', '/api/auth/password', { current: password, next: 'another-long-pw' })).status, 200);
    password = 'another-long-pw';
    later(31000);
    assert.equal((await logIn({ trust: t })).data.twoFactor, true, 'a new password ends it');
    t = await remember();
    r = await client()('POST', '/api/auth/reset', { token: await resetToken(), password: 'third-long-pw' }, newIp());
    assert.deepEqual([r.status, r.data], [200, { twoFactor: true }]);
    password = 'third-long-pw';
    later(31000);
    assert.equal((await logIn({ trust: t })).data.twoFactor, true, 'a reset ends it');
    // ...and two-step sign-in turned off and on again.
    t = await remember();
    c = await signedIn(t);
    assert.equal((await c('POST', '/api/me/sms/disable', { password })).status, 200);
    later(31000);
    assert.equal((await c('POST', '/api/me/sms/setup', { password }, newIp())).status, 200);
    assert.equal((await c('POST', '/api/me/sms/enable', { code: textedCode() })).status, 200);
    later(31000);
    assert.equal((await logIn({ trust: t })).data.twoFactor, true, 'turning two-step sign-in on again ends it');

    // With two-step sign-in off there is no code to skip, so nothing is remembered.
    await client()('POST', '/api/auth/signup', { email: 'free@app.test', password: 'long-enough-pw' }, newIp());
    r = await client()('POST', '/api/auth/login', { email: 'free@app.test', password: 'long-enough-pw', remember: true, code: '123456' }, newIp());
    assert.deepEqual([r.status, r.data.trust], [200, undefined]);
  } finally { Date.now = realNow; s.stop(); }
});

test('iPhone app: the location list shows each business with its street and new orders, most recently updated first', async () => {
  const s = await appServer();
  try {
    const owner = client(), boss = client();
    await owner('POST', '/api/auth/signup', { email: 'loc@app.test', password: 'long-enough-pw', name: 'Lou' }, newIp());
    await boss('POST', '/api/auth/signup', { email: 'boss@app.test', password: 'long-enough-pw', name: 'Bo' }, newIp());
    const main = (await owner('POST', '/api/sites', { name: 'Main Street Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price\nTaco,10.00' })).data.site;
    const lot = (await owner('POST', '/api/sites', { name: 'Back Lot', template: 'restaurant' })).data.site;
    const diner = (await boss('POST', '/api/sites', { name: 'Boss Diner', template: 'restaurant' })).data.site;
    assert.equal((await boss('POST', `/api/sites/${diner.id}/team`, { email: 'loc@app.test', name: 'Lou', role: 'manager' })).status, 201);
    await owner('POST', `/api/sites/${main.id}/publish`, {});
    const [item] = (await owner('GET', `/api/sites/${main.id}/menu`)).data.items;
    for (let i = 0; i < 2; i++) assert.equal((await client()('POST', '/_order', { method: 'pickup', name: 'Ana', phone: '903-555-0100', email: 'ana@example.com', items: [{ id: item.id, qty: 1 }] }, { host: 'mainstreetcafe.pfsites.test' })).status, 201);
    // The address the owner typed for the first business, and when each was last changed.
    s.sql("UPDATE sites SET draft = json_set(draft, '$.business.address1', '12 Main St', '$.business.city', 'Tyler', '$.business.state', 'TX', '$.business.zip', '75701') WHERE id = ?", main.id);
    for (const [at, id] of [[3000, lot.id], [2000, diner.id], [1000, main.id]]) s.sql('UPDATE sites SET updated_at = ? WHERE id = ?', at, id);
    const r = await owner('GET', '/api/app/sites');
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.sites, [
      { id: lot.id, name: 'Back Lot', role: 'owner', live: false, url: 'https://backlot.pfsites.test', newOrders: 0, street: '' },
      { id: diner.id, name: 'Boss Diner', role: 'manager', live: false, url: 'https://bossdiner.pfsites.test', newOrders: 0, street: '' },
      { id: main.id, name: 'Main Street Cafe', role: 'owner', live: true, url: 'https://mainstreetcafe.pfsites.test', newOrders: 2, street: '12 Main St, Tyler, TX, 75701' },
    ]);
    assert.equal((await client()('GET', '/api/app/sites')).status, 401);
  } finally { s.stop(); }
});

test('text codes: one number cannot be texted over and over from many accounts, numbers abroad are refused, and setup codes have their own share', async () => {
  const realNow = Date.now;
  let shift = 0;
  Date.now = () => realNow() + shift;
  const later = (ms) => { shift += ms; };
  let n = 0;
  // A new account with this mobile number on its profile.
  const account = async (phone) => { const c = client(); await c('POST', '/api/auth/signup', { email: `caps${n++}@app.test`, password: 'long-enough-pw' }, newIp()); await c('PUT', '/api/me', { phone }); return c; };
  const setUp = (c) => c('POST', '/api/me/sms/setup', { password: 'long-enough-pw' }, newIp());
  const codeOf = (text) => text.body.match(/code is (\d{6})\./)[1];
  const signIn = (i) => client()('POST', '/api/auth/login', { email: `caps${i}@app.test`, password: 'long-enough-pw' }, newIp());
  try {
    const s = await appServer();
    try {
      // Six new accounts all name one person's number. Whoever asks, it is texted once in 30 seconds and five setup codes a day.
      const flood = [];
      for (let i = 0; i < 6; i++) flood.push(await account('(903) 555-0188'));
      assert.equal((await setUp(flood[0])).status, 200);
      let r = await setUp(flood[1]);
      assert.equal(r.status, 429);
      assert.match(r.data.error, /^Please wait ([1-9]|[12]\d|30) seconds? before asking for another code\.$/);
      for (let i = 1; i < 5; i++) { later(31000); assert.equal((await setUp(flood[i])).status, 200, `setup ${i}`); }
      later(31000);
      r = await setUp(flood[5]);
      assert.deepEqual([r.status, r.data.error], [429, 'Please wait 24 hours before asking for another code.']);
      const toThem = s.texts.filter((x) => x.to === '+19035550188');
      assert.equal(toThem.length, 5);
      // Sign-in codes count against the number too: two accounts that share a phone cannot have it texted twice in 30 seconds.
      for (const i of [0, 1]) assert.equal((await flood[i]('POST', '/api/me/sms/enable', { code: codeOf(toThem[i]) })).status, 200);
      later(3600000);
      assert.equal((await signIn(0)).data.sent, true);
      r = await signIn(1);
      assert.deepEqual([r.status, r.data.twoFactor, r.data.methods], [429, true, ['text']]);
      assert.match(r.data.error, /^Please wait ([1-9]|[12]\d|30) seconds? before asking for another code\.$/);
      // Numbers abroad are refused unless SMS_COUNTRIES lets them in, and nothing is texted.
      const before = s.texts.length;
      r = await setUp(await account('+44 20 7946 0958'));
      assert.deepEqual([r.status, r.data.error], [400, 'We can only text numbers that start with +1 for now.']);
      assert.equal(s.texts.length, before);
    } finally { s.stop(); }

    // With SMS_COUNTRIES they can be. Setup codes stop at their share of SMS_PER_HOUR (a sixth, here 2), and sign-in codes still go
    // until all of it (here 12) is used.
    const t = await appServer({ env: { SMS_COUNTRIES: '1, 44', SMS_PER_HOUR: '12' } });
    try {
      const first = n;
      const uk = await account('+44 20 7946 0958'), us = await account('903 555 0144'), third = await account('903 555 0145');
      assert.equal((await setUp(uk)).status, 200);
      assert.equal(t.texts.at(-1).to, '+442079460958');
      assert.equal((await setUp(us)).status, 200);
      let r = await setUp(third);
      assert.equal(r.status, 429, 'setup codes have used their share of the hour');
      assert.match(r.data.error, /^Please wait (5\d|60) minutes before asking for another code\.$/);
      for (const [c, text] of [[uk, t.texts[0]], [us, t.texts[1]]]) assert.equal((await c('POST', '/api/me/sms/enable', { code: codeOf(text) })).status, 200);
      later(31000);
      assert.equal((await signIn(first)).data.sent, true, 'a sign-in code still goes');
      // A new hour: the third account sets up, then sign-ins use the rest of the hour's texts, and then even a person with texts of
      // their own left has to wait.
      later(3600000);
      assert.equal((await third('POST', '/api/auth/login', { email: `caps${first + 2}@app.test`, password: 'long-enough-pw' }, newIp())).status, 200, 'an hour on, signed in again');
      assert.equal((await setUp(third)).status, 200);
      assert.equal((await third('POST', '/api/me/sms/enable', { code: codeOf(t.texts.at(-1)) })).status, 200);
      for (let round = 0; round < 4; round++) {
        later(31000);
        for (const i of round < 3 ? [first, first + 1, first + 2] : [first, first + 1]) assert.equal((await signIn(i)).data.sent, true, `round ${round}, account ${i}`);
      }
      later(31000);
      r = await signIn(first + 2);
      assert.deepEqual([r.status, r.data.twoFactor], [429, true]);
      assert.match(r.data.error, /^Please wait (5\d|60) minutes before asking for another code\.$/);
    } finally { t.stop(); }
  } finally { Date.now = realNow; }
});

test('text codes name the address in APP_URL, never one a request makes up, and cannot be turned on without it', async () => {
  // On Render without APP_URL, Render's own address is all the service knows, and people may well sign in at another one.
  const s = await appServer({ env: { APP_URL: '', SITES_DOMAIN: '', RENDER_EXTERNAL_URL: 'https://pf-sites.onrender.com' } });
  try {
    const me = client();
    await me('POST', '/api/auth/signup', { email: 'host@app.test', password: 'long-enough-pw' }, newIp());
    assert.equal((await me('GET', '/api/config')).data.smsEnabled, false);
    await me('PUT', '/api/me', { phone: '903 555 0191' });
    let r = await me('POST', '/api/me/sms/setup', { password: 'long-enough-pw' }, newIp());
    assert.deepEqual([r.status, r.data.error], [400, 'Text messages are not available yet.']);
    assert.equal(s.texts.length, 0);
    // Someone who turned text codes on before still gets a sign-in code, bound to the service's own address.
    s.sql("UPDATE users SET sms_on = 1, sms_phone = '+19035550191' WHERE email = 'host@app.test'");
    r = await client()('POST', '/api/auth/login', { email: 'host@app.test', password: 'long-enough-pw' }, { host: 'processorfreedomsites.com', ...newIp() });
    assert.deepEqual([r.status, r.data.sent], [401, true]);
    assert.match(s.texts.at(-1).body, /^Your Processor Freedom code is (\d{6})\. It expires in 10 minutes\.\n\n@pf-sites\.onrender\.com #\1$/);
  } finally { s.stop(); }
  // With APP_URL set, the code names it even when a request names another address (a look-alike site passing requests on, say).
  const t = await appServer({ env: { RENDER_EXTERNAL_URL: 'https://pf-sites.onrender.com' } });
  try {
    const me = client();
    await me('POST', '/api/auth/signup', { email: 'bound@app.test', password: 'long-enough-pw' }, newIp());
    assert.equal((await me('GET', '/api/config')).data.smsEnabled, true);
    await me('PUT', '/api/me', { phone: '903 555 0192' });
    assert.equal((await me('POST', '/api/me/sms/setup', { password: 'long-enough-pw' }, { host: 'look-alike.example', ...newIp() })).status, 200);
    assert.match(t.texts.at(-1).body, /^Your Processor Freedom code is (\d{6})\. It expires in 10 minutes\.\n\n@app\.pfsites\.test #\1$/);
  } finally { t.stop(); }
});

test('the iPhone app is tied to this address, so it can offer the codes texted for it', async () => {
  const anon = client();
  const r = await anon('GET', '/.well-known/apple-app-site-association');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(r.data, { webcredentials: { apps: ['D8D94SXAG6.com.processorfreedomsites.app'] } });
  assert.equal((await anon('GET', '/.well-known/apple-app-site-association', null, { host: 'nobody.pfsites.test' })).status, 404, 'a merchant’s site never answers for the app');
  const s = await appServer({ env: { APNS_TEAM_ID: 'ABCDE12345', APNS_BUNDLE_ID: 'com.example.sites' } });
  try { assert.deepEqual((await client()('GET', '/.well-known/apple-app-site-association')).data, { webcredentials: { apps: ['ABCDE12345.com.example.sites'] } }); } finally { s.stop(); }
});

test('iPhone app: a passcode the business gave out opens only that business, with no staff powers', async () => {
  const s = await appServer({ env: { ADMIN_EMAILS: 'hal@app.test' } });
  try {
    const boss = client(), phone = client();
    await boss('POST', '/api/auth/signup', { email: 'bea@app.test', password: 'long-enough-pw', name: 'Bea' }, newIp());
    await client()('POST', '/api/auth/signup', { email: 'hal@app.test', password: 'long-enough-pw', name: 'Hal' }, newIp());
    // Hal is staff with his address confirmed, owns a business of his own, and is on Bea's team, which sets and sees his passcode there.
    await client()('POST', '/api/auth/forgot', { email: 'hal@app.test' }, newIp());
    assert.equal((await client()('POST', '/api/auth/reset', { token: s.mails.filter((m) => m.to === 'hal@app.test').at(-1).text.match(/token=([\w-]+)/)[1], password: 'long-enough-pw' }, newIp())).status, 200);
    const signIn = () => phone('POST', '/api/auth/login', { email: 'hal@app.test', password: 'long-enough-pw', device: { name: 'Hal’s iPhone' } }, newIp());
    let r = await signIn();
    assert.equal(r.data.user.admin, true);
    const proof = { device: r.data.device.id, secret: r.data.device.secret };
    const own = (await phone('POST', '/api/sites', { name: 'Hal Bakery', template: 'restaurant' })).data.site;
    const work = (await boss('POST', '/api/sites', { name: 'Bea Bistro', template: 'restaurant' })).data.site;
    // Staff cannot be added through a team, so this is someone who became staff after joining one.
    s.sql('INSERT INTO members (site_id, user_id, role, created_at, details) VALUES (?, ?, ?, ?, ?)', work.id, r.data.user.id, 'manager', Date.now(), JSON.stringify({ name: 'Hal', passcode: '4826' }));
    assert.equal((await phone('POST', '/api/app/passcode', { ...proof, site: work.id, passcode: '4826' })).status, 200);

    // The phone locks; the passcode Bea gave Hal opens it again, but only at Bea Bistro, and without staff powers.
    await phone('POST', '/api/auth/logout', {});
    r = await phone('POST', '/api/app/unlock', { ...proof, passcode: '4826' }, newIp());
    assert.deepEqual([r.status, r.data.site, r.data.user.admin], [200, work.id, false]);
    assert.deepEqual(Object.keys(r.data.user).sort(), USER_FIELDS);
    assert.equal((await phone('GET', '/api/me')).data.user.admin, false);
    assert.deepEqual((await phone('GET', '/api/sites')).data.sites.map((x) => x.id), [work.id]);
    assert.deepEqual((await phone('GET', '/api/app/sites')).data.sites.map((x) => x.id), [work.id]);
    assert.equal((await phone('GET', `/api/sites/${work.id}`)).status, 200);
    r = await phone('GET', `/api/sites/${own.id}`);
    assert.deepEqual([r.status, r.data.error], [403, 'Sign in with your email and password to open this business.']);
    assert.equal((await phone('GET', `/api/sites/${own.id}/orders`)).status, 403);
    assert.equal((await phone('GET', `/api/app/passcode?site=${own.id}`)).status, 403);
    assert.equal((await phone('POST', '/api/app/passcode', { ...proof, site: own.id, passcode: '1357', replace: true })).status, 403, 'no passcode can be made at his own business from here');
    assert.equal(s.sql('SELECT owner_passcode FROM sites WHERE id = ?', own.id)[0].owner_passcode, '');
    assert.equal((await phone('POST', '/api/sites', { name: 'Another Shop', template: 'restaurant' })).status, 403);
    assert.equal((await phone('GET', '/api/admin')).status, 403);
    assert.equal((await phone('GET', `/preview/${own.id}/`)).headers.get('location'), '/login');
    // A new name would follow him into his own business's records, so it waits for a full sign-in; his phone number can change.
    assert.deepEqual([(await phone('PUT', '/api/me', { name: 'Not Hal' })).status, (await phone('PUT', '/api/me', { phone: '903 555 0133' })).status], [403, 200]);
    assert.equal((await phone('GET', '/api/me')).data.user.name, 'Hal');
    // Face ID set up from here is held to the same business.
    const { bio } = (await phone('POST', '/api/app/biometric', proof)).data;
    await phone('POST', '/api/auth/logout', {});
    assert.equal((await phone('POST', '/api/app/unlock', { ...proof, bio }, newIp())).status, 200);
    assert.equal((await phone('GET', `/api/sites/${own.id}`)).status, 403);

    // Signed in with the email and password, everything is back. Linked to his own business, his own passcode opens everything.
    r = await signIn();
    const proof2 = { device: r.data.device.id, secret: r.data.device.secret };
    assert.deepEqual((await phone('GET', '/api/sites')).data.sites.map((x) => x.id).sort(), [own.id, work.id].sort());
    assert.equal((await phone('POST', '/api/app/passcode', { ...proof2, site: own.id, passcode: '1357' })).status, 200);
    await phone('POST', '/api/auth/logout', {});
    r = await phone('POST', '/api/app/unlock', { ...proof2, passcode: '1357' }, newIp());
    assert.deepEqual([r.status, r.data.site, r.data.user.admin], [200, own.id, true]);
    for (const id of [own.id, work.id]) assert.equal((await phone('GET', `/api/sites/${id}`)).status, 200);
    assert.equal((await phone('GET', '/api/admin')).status, 200);
  } finally { s.stop(); }
});

test('Apple push: a connection that went quiet or dead is replaced, and a notification lost with it goes once more', async () => {
  const http2 = await import('node:http2');
  const net = await import('node:net');
  const { generateKeyPairSync } = await import('node:crypto');
  const { createApns } = await import('../server/apns.js');
  const pem = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  // Stands in for Apple, behind a stand-in for the network: each connection through it can go silent (a router forgot it) or be
  // cut the moment anything more is sent on it.
  let answered = 0, answer = 200, silenceNew = false;
  const apple = http2.createServer();
  apple.on('stream', (stream) => { stream.on('data', () => {}); stream.on('end', () => { answered++; stream.respond({ ':status': answer }); stream.end(answer === 200 ? '' : JSON.stringify({ reason: 'InternalServerError' })); }); });
  await new Promise((r) => apple.listen(0, r));
  const links = [];
  const network = net.createServer((near) => {
    const far = net.connect(apple.address().port), link = { near, far, silent: silenceNew, cut: false };
    links.push(link);
    near.on('data', (d) => { if (link.cut) { near.resetAndDestroy(); far.destroy(); } else if (!link.silent) far.write(d); });
    far.on('data', (d) => { if (!link.silent) near.write(d); });
    near.on('error', () => {}); far.on('error', () => {}); near.on('close', () => far.destroy()); far.on('close', () => near.destroy());
  });
  await new Promise((r) => network.listen(0, r));
  let dialed = 0;
  const origin = `http://127.0.0.1:${network.address().port}`;
  const apns = createApns({ APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: 'D8D94SXAG6', APNS_KEY: pem }, { hosts: { development: origin }, connect: (o) => { dialed++; return http2.connect(o); }, waits: { answer: 600, quiet: 150, ping: 200 } });
  const endpoint = `apns:development:${'ab'.repeat(32)}`, msg = { title: 'New order #1 · $9.00', body: 'Cafe', tag: 'order-1' };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    assert.equal(await apns.send(endpoint, msg), 'sent');
    assert.equal(dialed, 1);
    // Used again straight away, the open connection is used as it is.
    assert.equal(await apns.send(endpoint, msg), 'sent');
    assert.equal(dialed, 1);
    // Quiet for a while and dead without a word: a ping finds out before the notification is sent, and a fresh connection takes it.
    links.at(-1).silent = true;
    await pause(200);
    let at = Date.now();
    assert.equal(await apns.send(endpoint, msg), 'sent');
    assert.equal(dialed, 2);
    assert.ok(Date.now() - at < 550, 'no waiting for an answer that was never coming');
    // Dead while in use: the notification goes unanswered, so it goes once more on a fresh connection.
    links.at(-1).silent = true;
    at = Date.now();
    assert.equal(await apns.send(endpoint, msg), 'sent');
    assert.equal(dialed, 3);
    assert.ok(Date.now() - at >= 590);
    // Cut as it is used: tried once more on a fresh connection as well.
    links.at(-1).cut = true;
    assert.equal(await apns.send(endpoint, msg), 'sent');
    assert.equal(dialed, 4);
    // Apple's own answer is not tried again: it counts, as before.
    const asked = answered;
    answer = 500;
    await assert.rejects(apns.send(endpoint, msg), /InternalServerError/);
    assert.deepEqual([answered, dialed], [asked + 1, 4]);
    // When the fresh connection is no better, the notification fails once, and counts once.
    answer = 200;
    silenceNew = true;
    for (const l of links) l.silent = true;
    await assert.rejects(apns.send(endpoint, msg), /did not answer in time/);
    assert.equal(dialed, 5);
  } finally { apns.close(); for (const l of links) { l.near.destroy(); l.far.destroy(); } network.close(); apple.close(); }
});

/* ---------- the Sale screen's items: variable prices, product codes, the Sale settings, and Apple push keys per environment ---------- */

test('variable-price items: kept with the item, priced at the counter, never offered online or taken in an online order', async () => {
  const core = await import('../shared/core.js');
  const { orderPage, menuSection } = await import('../shared/order.js');
  const s = await appServer();
  try {
    const me = client(), anon = client();
    await me('POST', '/api/auth/signup', { email: 'scale@app.test', password: 'long-enough-pw' }, newIp());
    const site = (await me('POST', '/api/sites', { name: 'Scale Deli', template: 'restaurant', kind: 'ordering', csv: 'Item,Price\nSandwich,8.00\nCheese,4.00' })).data.site;
    const S = `/api/sites/${site.id}`, host = { host: 'scaledeli.pfsites.test' };
    let items = (await me('GET', `${S}/menu`)).data.items;
    assert.deepEqual(items.map((x) => [x.name, x.variable]), [['Sandwich', false], ['Cheese', false]]);
    const [sandwich, cheese] = items;

    // The flag is saved and sent back; a save that does not send it keeps it; the price it had is kept, for if it goes back to fixed.
    items = (await me('PUT', `${S}/menu/${cheese.id}`, { variable: true })).data.items;
    assert.deepEqual([items[1].variable, items[1].price], [true, 400]);
    assert.equal(s.sql('SELECT variable FROM menu_items WHERE id = ?', cheese.id)[0].variable, 1);
    items = (await me('PUT', `${S}/menu/${cheese.id}`, { name: 'Cheese by the pound', price: '' })).data.items;
    assert.deepEqual([items[1].name, items[1].variable, items[1].price], ['Cheese by the pound', true, 400], 'it needs no price, and loses none');
    // A new one may have no price at all; a fixed-price item still needs one.
    items = (await me('POST', `${S}/menu`, { name: 'Catering tray', variable: true })).data.items;
    assert.deepEqual([items.at(-1).name, items.at(-1).variable, items.at(-1).price], ['Catering tray', true, 0]);
    assert.equal((await me('POST', `${S}/menu`, { name: 'No price yet' })).status, 400);
    assert.equal((await me('PUT', `${S}/menu/${sandwich.id}`, { price: '' })).status, 400, 'a fixed price cannot be emptied');

    // Customers never see one: not on the order page, not in what the cart can take, not in the menu on the home page.
    await me('POST', `${S}/publish`, {});
    const page = (await anon('GET', '/order', null, host)).data;
    assert.deepEqual(Object.keys(JSON.parse(page.match(/<script type="application\/json" id="pf-order">([^<]*)<\/script>/)[1]).items), [sandwich.id]);
    assert.match(page, /Sandwich/);
    assert.ok(!/Cheese by the pound|Catering tray/.test(page));
    const home = (await anon('GET', '/', null, host)).data;
    assert.match(home, /Sandwich/);
    assert.ok(!/Cheese by the pound|Catering tray/.test(home), 'the home page menu leaves them out too');

    // An order with one is refused where the lines are priced, and nothing is taken.
    const who = { method: 'pickup', name: 'Ana Ruiz', phone: '903-555-0100', email: 'ana@example.com' };
    let r = await anon('POST', '/_order', { ...who, items: [{ id: sandwich.id, qty: 1 }, { id: cheese.id, qty: 1 }] }, host);
    assert.deepEqual([r.status, r.data.error], [400, "That item is priced at the counter and can't be ordered online."]);
    assert.equal((await me('GET', `${S}/orders`)).data.orders.length, 0);
    assert.deepEqual((await me('GET', `${S}/menu`)).data.items.map((x) => x.stock), [100, 100, 100], 'no stock was taken');

    // Back to a fixed price, it is offered and sold again at the price it kept.
    await me('PUT', `${S}/menu/${cheese.id}`, { variable: false });
    assert.ok((await anon('GET', '/order', null, host)).data.includes('Cheese by the pound'));
    r = await anon('POST', '/_order', { ...who, items: [{ id: cheese.id, qty: 2 }] }, host);
    assert.equal(r.status, 201);
    assert.equal((await me('GET', `${S}/orders`)).data.orders[0].subtotal, 800);

    // Many at once, or from an item list: a "Price type" column (as Clover exports it) or the word in place of the price (as Square does).
    items = (await me('POST', `${S}/menu/bulk`, { ids: [sandwich.id, cheese.id], set: { variable: true } })).data.items;
    assert.deepEqual(items.map((x) => x.variable), [true, true, true]);
    items = (await me('POST', `${S}/menu/bulk`, { ids: [sandwich.id], set: { variable: false } })).data.items;
    assert.deepEqual(items.map((x) => x.variable), [false, true, true]);
    const list = parseMenuCsv('Item name,Price,Price Type\nCoffee,3.00,Fixed\nSalmon,,Variable\nLobster,Market price,\nBread,4.50,VARIABLE\nTea,soon,\n');
    assert.deepEqual(list.items.map((x) => [x.name, x.price, x.variable]), [['Coffee', 300, false], ['Salmon', 0, true], ['Lobster', 0, true], ['Bread', 450, true]]);
    assert.deepEqual(list.errors.map((e) => e.row), [6], 'a word that is not a price still is not one');
    r = await me('POST', `${S}/menu/import`, { csv: 'Item name,Price,Price type\nSalmon,,Variable\n' });
    assert.deepEqual([r.status, r.data.imported, r.data.items.at(-1).name, r.data.items.at(-1).variable, r.data.items.at(-1).price], [200, 1, 'Salmon', true, 0]);

    // Whoever hands the pages a menu: the website editor's preview (visibleMenu), the page itself, and its two parts.
    const ordering = { ...core.defaultOrdering(), enabled: true };
    const fixed = { id: 'f1', name: 'Plain bagel', price: 300, category: 'Menu', available: true, stock: 10, options: [] }, open = { id: 'v1', name: 'Weighed salmon', price: 0, category: 'Menu', available: true, stock: 10, options: [], variable: true };
    assert.deepEqual(core.visibleMenu([fixed, open], ordering).map((x) => x.id), ['f1']);
    const deli = normalizeSite(createSite('Deli', 'restaurant', { kind: 'ordering' }));
    for (const pg of ['order', 'home']) { const { html } = renderPage(deli, pg, { ordering, menu: [fixed, open], base: '/s/deli' }); assert.ok(html.includes('Plain bagel') && !html.includes('Weighed salmon'), pg); }
    const alone = orderPage({ menu: [fixed, open], ordering, base: '', siteKey: 'deli', lang: 'en' });
    assert.ok(alone.includes('Plain bagel') && !alone.includes('Weighed salmon'));
    assert.deepEqual(Object.keys(JSON.parse(alone.match(/id="pf-order">([^<]*)</)[1]).items), ['f1']);
    assert.ok(!menuSection({ title: 'Menu' }, { menu: [fixed, open], ordering, lang: 'en' }).includes('Weighed salmon'));
    // A website that is not taking orders, whose only items are priced at the counter, shows no menu and loads no ordering styles.
    const shop = renderPage(deli, 'home', { ordering: core.defaultOrdering(), menu: [open], base: '/s/deli' }).html;
    assert.ok(!shop.includes('Weighed salmon') && !shop.includes('.ord-menu'));
  } finally { s.stop(); }
});

test('product codes: kept as typed, matched the way a scanner reads them, never on two items, in edits, bulk edits and imports', async () => {
  const core = await import('../shared/core.js');
  // The one rule the server, the website's item search and the app's scanner share.
  assert.equal(core.normalizeCode(' 0 49000-00634 6 '), '049000006346');
  assert.equal(core.normalizeCode('0049000006346'), '049000006346', 'a 13-digit EAN starting with 0 is the 12-digit UPC-A inside it');
  assert.equal(core.normalizeCode('4006381333931'), '4006381333931', 'any other EAN stays as it is');
  assert.equal(core.normalizeCode('00049000006346'), '00049000006346', 'only a 13-digit one loses its 0');
  assert.equal(core.normalizeCode('0ABCDEFGHIJKL'), '0ABCDEFGHIJKL', 'only digits');
  assert.equal(core.normalizeCode('sku–ab 12 x'), 'SKUAB12X', 'any dash or space, and letters in capitals');
  assert.equal(core.cleanCode('  12 34\n '), '12 34');
  assert.equal(core.cleanCode(' - – '), '', 'only dashes and spaces is no code');
  assert.equal(core.cleanCode('x'.repeat(80)), 'x'.repeat(64));
  assert.equal(core.cleanCode({ a: 1 }), '');

  const s = await appServer();
  try {
    const me = client();
    await me('POST', '/api/auth/signup', { email: 'codes@app.test', password: 'long-enough-pw' }, newIp());
    // An item list's barcode column fills in product codes; a row repeating one already on the list is left out.
    const site = (await me('POST', '/api/sites', { name: 'Corner Store', template: 'order', kind: 'ordering', csv: 'Item,Price,UPC\nCola,2.00,0 49000-00634 6\nChips,1.50,\nGum,1.00,\nCola again,2.00,049000006346\n' })).data.site;
    const S = `/api/sites/${site.id}`;
    let items = (await me('GET', `${S}/menu`)).data.items;
    assert.deepEqual(items.map((x) => [x.name, x.code]), [['Cola', '0 49000-00634 6'], ['Chips', ''], ['Gum', '']]);
    const [cola, chips, gum] = items;
    const codes = async () => (await me('GET', `${S}/menu`)).data.items.map((x) => x.code);
    const TAKEN = 'Another item already uses that product code.';

    // Saved as typed, trimmed; a save that does not send it keeps it.
    items = (await me('PUT', `${S}/menu/${chips.id}`, { code: '  SNK-001  ' })).data.items;
    assert.equal(items[1].code, 'SNK-001');
    items = (await me('PUT', `${S}/menu/${chips.id}`, { name: 'Potato chips' })).data.items;
    assert.deepEqual([items[1].name, items[1].code], ['Potato chips', 'SNK-001']);
    // No other item can have a code in use, however it is written.
    for (const code of ['0049000006346', '049000006346', 'snk 001', 'SNK001']) {
      const r = await me('PUT', `${S}/menu/${gum.id}`, { code });
      assert.deepEqual([r.status, r.data.error], [400, TAKEN], code);
    }
    assert.deepEqual([(await me('POST', `${S}/menu`, { name: 'Diet cola', price: 200, code: '0-49000-00634-6' })).status, (await me('GET', `${S}/menu`)).data.items.length], [400, 3], 'a refused item is not added');
    assert.equal((await me('POST', `${S}/menu`, { name: 'Diet cola', price: 200, code: '049000050103' })).status, 201);
    // An item may write its own code another way, or keep it through other edits; items without a code never clash.
    items = (await me('PUT', `${S}/menu/${cola.id}`, { price: 225, code: '0049000006346' })).data.items;
    assert.deepEqual([items[0].price, items[0].code], [225, '0049000006346']);
    assert.equal((await me('PUT', `${S}/menu/${gum.id}`, { code: '' })).status, 200);
    assert.equal((await me('POST', `${S}/menu`, { name: 'Mints', price: 100, code: '   ' })).status, 201);
    assert.deepEqual(await codes(), ['0049000006346', 'SNK-001', '', '049000050103', '']);
    // Should two items ever share a code (put in the database some other way), each can still be saved with it, so nothing is held up.
    s.sql("UPDATE menu_items SET code = 'snk-001' WHERE id = ?", gum.id);
    assert.equal((await me('PUT', `${S}/menu/${gum.id}`, { price: 125 })).status, 200);
    assert.equal((await me('PUT', `${S}/menu/${gum.id}`, { code: 'SNK 001' })).status, 200, 'even written another way');
    assert.equal((await me('POST', `${S}/menu/bulk`, { ids: [gum.id], set: { code: 'snk001' } })).status, 200);
    s.sql("UPDATE menu_items SET code = '' WHERE id = ?", gum.id);

    // Bulk edits: one code on several items is refused, and so is a code in use; a refusal changes nothing; an empty code clears them all.
    let r = await me('POST', `${S}/menu/bulk`, { ids: [cola.id, gum.id], set: { code: 'NEW-1', taxable: false } });
    assert.deepEqual([r.status, r.data.error], [400, TAKEN]);
    assert.deepEqual((await me('GET', `${S}/menu`)).data.items.slice(0, 3).map((x) => [x.code, x.taxable]), [['0049000006346', true], ['SNK-001', true], ['', true]], 'nothing was changed');
    assert.equal((await me('POST', `${S}/menu/bulk`, { ids: [gum.id], set: { code: 'snk-001' } })).status, 400);
    assert.equal((await me('POST', `${S}/menu/bulk`, { ids: [gum.id, gum.id, 'not-mine'], set: { code: 'GUM-1' } })).status, 200, 'the same item sent twice is one item');
    assert.equal((await me('POST', `${S}/menu/bulk`, { ids: [gum.id, gum.id], set: { addStock: 5 } })).data.items[2].stock, 105, 'and gets added stock once');
    assert.equal((await me('POST', `${S}/menu/bulk`, { ids: [cola.id], set: { code: '049000006346' } })).status, 200, 'its own code written another way');
    items = (await me('POST', `${S}/menu/bulk`, { ids: [cola.id, chips.id], set: { code: '' } })).data.items;
    assert.deepEqual(items.map((x) => x.code), ['', '', 'GUM-1', '049000050103', '']);

    // Imports: the file's own repeats, codes already on the menu, and numbers a spreadsheet cut short are left out, each with why.
    const list = parseMenuCsv('Name,Price,Product code,SKU\nA,1,111,\nB,1,,222\nC,1,1-1-1,\nD,1,1.23457E+11,\nE,1,,\n');
    assert.deepEqual(list.items.map((x) => [x.name, x.code]), [['A', '111'], ['B', '222'], ['E', '']]);
    assert.deepEqual(list.errors.map((e) => [e.row, e.reason]), [[4, 'Product code 1-1-1 is already used by “A”.'], [5, 'Product code 1.23457E+11 lost its digits in the spreadsheet. Format that column as text and save the file again.']]);
    r = await me('POST', `${S}/menu/import`, { csv: 'Name,Price,Barcode\nGum refill,1.00,gum 1\nLollipop,0.50,LOL-1\n' });
    assert.deepEqual([r.status, r.data.imported, r.data.skipped], [200, 1, [{ row: 2, reason: 'Product code gum 1 is already used by “Gum”.' }]]);
    assert.deepEqual(r.data.items.map((x) => x.name).slice(-1), ['Lollipop']);
    r = await me('POST', `${S}/menu/import`, { csv: 'Name,Price,Barcode\nCandy,0.50,lol 1\n' });
    assert.deepEqual([r.status, r.data.error], [400, 'Product code lol 1 is already used by “Lollipop”.'], 'nothing left to add');
    // Replacing the menu clears every code first, so the same file goes in whole.
    r = await me('POST', `${S}/menu/import`, { csv: 'Name,Price,Barcode\nGum refill,1.00,gum 1\nLollipop,0.50,LOL-1\n', replace: true });
    assert.deepEqual([r.status, r.data.imported, r.data.items.map((x) => x.code)], [200, 2, ['gum 1', 'LOL-1']]);
  } finally { s.stop(); }
});

test('a variable-price item that never had a price is not made a fixed one at $0.00, in one edit or many', async () => {
  const s = await appServer();
  try {
    const me = client(), anon = client();
    await me('POST', '/api/auth/signup', { email: 'weigh@app.test', password: 'long-enough-pw' }, newIp());
    const site = (await me('POST', '/api/sites', { name: 'Weigh Deli', template: 'restaurant', kind: 'ordering', csv: 'Item,Price,Price type\nBagel,3.00,\nSalmon,,Variable\nCheese,4.00,Variable\n' })).data.site;
    const S = `/api/sites/${site.id}`, host = { host: 'weighdeli.pfsites.test' };
    const [bagel, salmon, cheese, tray] = (await me('POST', `${S}/menu`, { name: 'Catering tray', variable: true })).data.items;
    const now = async () => (await me('GET', `${S}/menu`)).data.items.map((x) => [x.name, x.variable, x.price, x.taxable]);
    const before = [['Bagel', false, 300, true], ['Salmon', true, 0, true], ['Cheese', true, 400, true], ['Catering tray', true, 0, true]];
    assert.deepEqual(await now(), before);

    // Made a fixed price with no price sent, one that never had a price of its own is refused, alone or with others, and nothing changes.
    let r = await me('PUT', `${S}/menu/${tray.id}`, { variable: false });
    assert.deepEqual([r.status, r.data.error], [400, 'Enter a price like 9.99.']);
    r = await me('POST', `${S}/menu/bulk`, { ids: [bagel.id, cheese.id, salmon.id], set: { variable: false, taxable: false } });
    assert.deepEqual([r.status, r.data.error], [400, 'Salmon has no price yet. Give it a price, then make it a fixed price.']);
    assert.deepEqual(await now(), before, 'nothing was changed');

    // So customers are still never offered one at $0.00, and an order with them is still refused.
    await me('POST', `${S}/publish`, {});
    const offered = async () => Object.keys(JSON.parse((await anon('GET', '/order', null, host)).data.match(/id="pf-order">([^<]*)</)[1]).items);
    assert.deepEqual(await offered(), [bagel.id]);
    const who = { method: 'pickup', name: 'Ana Ruiz', phone: '903-555-0100', email: 'ana@example.com' };
    r = await anon('POST', '/_order', { ...who, items: [{ id: salmon.id, qty: 3 }, { id: tray.id, qty: 2 }] }, host);
    assert.deepEqual([r.status, r.data.error], [400, "That item is priced at the counter and can't be ordered online."]);

    // With a price sent it is a fixed price at once; one that kept its price goes back to it; 0 sent on purpose is a free item, as any item may be.
    r = await me('PUT', `${S}/menu/${tray.id}`, { variable: false, price: '45.00' });
    assert.deepEqual([r.status, r.data.items[3].variable, r.data.items[3].price], [200, false, 4500]);
    r = await me('POST', `${S}/menu/bulk`, { ids: [cheese.id], set: { variable: false } });
    assert.deepEqual([r.status, r.data.items[2].variable, r.data.items[2].price], [200, false, 400]);
    r = await me('PUT', `${S}/menu/${salmon.id}`, { variable: false, price: 0 });
    assert.deepEqual([r.status, r.data.items[1].variable, r.data.items[1].price], [200, false, 0]);
    assert.deepEqual(await offered(), [bagel.id, salmon.id, cheese.id, tray.id]);
  } finally { s.stop(); }
});

test('product codes from item lists and pastes: only a code column is read, a 0 a spreadsheet dropped goes back, hidden characters go', async () => {
  const core = await import('../shared/core.js');
  const codesIn = (csv) => parseMenuCsv(csv).items.map((x) => x.code);
  // A column about the code ("Barcode type", "SKU description") is not the code. Read as it, items would get the wrong code, the real
  // code column after it would be passed over, and rows sharing the type would be left out as repeats.
  let list = parseMenuCsv('Name,Price,Barcode type,Barcode\nA,1,UPC-A,036000291452\nB,1,UPC-A,012000001291\nC,1,EAN-13,4006381333931\n');
  assert.deepEqual([list.items.map((x) => [x.name, x.code]), list.errors], [[['A', '036000291452'], ['B', '012000001291'], ['C', '4006381333931']], []]);
  list = parseMenuCsv('Item,Price,SKU Description,SKU\nA,1,Red shirt,RS-1\nB,1,Red shirt,RS-2\n');
  assert.deepEqual([list.items.map((x) => [x.name, x.code, x.desc]), list.errors], [[['A', 'RS-1', 'Red shirt'], ['B', 'RS-2', 'Red shirt']], []]);
  for (const head of ['Barcode format', 'Barcode symbology', 'UPC description', 'Product code type', 'SKU name', 'Item code type', 'Barcode image']) assert.deepEqual(codesIn(`Name,Price,${head}\nA,1,X-1\n`), [''], head);
  for (const head of ['UPC', 'UPC-A', 'EAN 13', 'EAN13', 'GTIN-14', 'UPC/EAN', 'UPC barcode', 'Barcode (UPC)', 'Barcode number', 'Barcode #', 'Product codes', 'Barcode*', 'SKU', 'SKU #', 'SKU No.', 'PLU code', 'Item code']) assert.deepEqual(codesIn(`Name,Price,${head}\nA,1,X-1\n`), ['X-1'], head);

  // A barcode a spreadsheet took for a number has lost its first 0: UPC-A 049000006346 (most US grocery brands start with 0) comes back
  // as 49000006346, UPC-E 04963406 and EAN-8 01234565 with 7 digits. The 0 goes back when it makes a valid barcode again, so the code is
  // the one the scanner reads. Any other number stays as it is.
  assert.deepEqual(codesIn('Item,Price,UPC\nCola,2.00,49000006346\nCan,1.00,4963406\nMints,1.00,1234565\nOwn,1.00,12345678901\nShort,1.00,1234567\nFull,2.00,049000050103\n'), ['049000006346', '04963406', '01234565', '12345678901', '1234567', '049000050103']);
  assert.equal(core.normalizeCode(codesIn('Item,Price,Barcode\nCola,2.00,49000006346\n')[0]), core.normalizeCode('0049000006346'), 'what the scanner reads finds it');
  // Seven digits only in a column named for those barcodes: a business's own codes are often seven digits long.
  assert.deepEqual(codesIn('Item,Price,SKU,Barcode\nCola,2.00,49000006346,\nCan,1.00,4963406,\nMints,1.00,,1234565\n'), ['049000006346', '4963406', '1234565']);
  // Written both ways in one file, it is one barcode, so the second row is left out.
  list = parseMenuCsv('Item,Price,UPC\nCola,2.00,049000006346\nCola again,2.00,49000006346\n');
  assert.deepEqual(list.errors.map((e) => [e.row, e.reason]), [[3, 'Product code 049000006346 is already used by “Cola”.']]);

  // Characters no one can see, which a code pasted from a web page or a document can carry (zero-width space, soft hyphen, byte order
  // mark, word joiner), are taken out: kept, the scanner's reading would never match, and a code in use would not be seen as in use.
  assert.equal(core.cleanCode('4900​0006346'), '49000006346');
  assert.equal(core.cleanCode('﻿049­000⁠006346‍'), '049000006346');
  assert.equal(core.cleanCode('SNK\u0085-001'), 'SNK-001', 'and control characters of every kind');
  assert.equal(core.cleanCode('​⁠ '), '', 'only hidden characters is no code');
  assert.equal(core.normalizeCode('0 4900​0006346­'), '049000006346');

  const s = await appServer();
  try {
    const me = client();
    await me('POST', '/api/auth/signup', { email: 'lists@app.test', password: 'long-enough-pw' }, newIp());
    const site = (await me('POST', '/api/sites', { name: 'Shelf Store', template: 'order', kind: 'ordering', csv: 'Item,Price\nCola,2.00\nChips,1.50\n' })).data.site;
    const S = `/api/sites/${site.id}`, TAKEN = 'Another item already uses that product code.';
    const [cola, chips] = (await me('GET', `${S}/menu`)).data.items;
    assert.equal((await me('PUT', `${S}/menu/${cola.id}`, { code: '049000006346' })).status, 200);
    // From a spreadsheet that dropped the 0, it is the same barcode as the one typed in, so that row is left out, and said why.
    let r = await me('POST', `${S}/menu/import`, { csv: 'Item,Price,UPC\nCola 2 liter,3.00,49000006346\nChips large,2.50,028400090858\n' });
    assert.deepEqual([r.status, r.data.imported, r.data.skipped], [200, 1, [{ row: 2, reason: 'Product code 049000006346 is already used by “Cola”.' }]]);
    // Pasted with a hidden character, a code in use is still seen as in use, in one edit or many, and a new one is kept without it.
    r = await me('PUT', `${S}/menu/${chips.id}`, { code: '0490​00006346' });
    assert.deepEqual([r.status, r.data.error], [400, TAKEN]);
    r = await me('POST', `${S}/menu/bulk`, { ids: [chips.id], set: { code: '0490⁠-0000-6346' } });
    assert.deepEqual([r.status, r.data.error], [400, TAKEN]);
    r = await me('PUT', `${S}/menu/${chips.id}`, { code: '​SNK-2⁠' });
    assert.deepEqual([r.status, r.data.items[1].code], [200, 'SNK-2']);

    // The website's item list download, with its Price type and Product code columns, comes back the same when it is uploaded again to
    // replace the menu (the usual change-it-in-a-spreadsheet round trip): every code, and every variable price, stays as it was.
    r = await me('POST', `${S}/menu/import`, { csv: 'Category,Item name,Price,Cost,Description,Stock,Taxable,Price type,Product code\nDeli,Bagel,3.00,,,100,yes,Fixed,0 12345 67890 5\nDeli,Smoked salmon,0.00,,,100,yes,Variable,SAL-1\n', replace: true });
    assert.deepEqual([r.status, r.data.items.map((x) => [x.name, x.price, x.variable, x.code])], [200, [['Bagel', 300, false, '0 12345 67890 5'], ['Smoked salmon', 0, true, 'SAL-1']]]);
  } finally { s.stop(); }
});

test('the Sale screen settings are kept with the business, so every phone and the website see the same', async () => {
  const core = await import('../shared/core.js');
  assert.deepEqual(core.defaultOrdering().sale, { groupItems: true, stayInCategory: false });
  assert.deepEqual(core.normalizeOrdering({}).sale, { groupItems: true, stayInCategory: false }, 'settings saved before these existed');
  assert.deepEqual(core.normalizeOrdering({ sale: { groupItems: 'no', stayInCategory: 1 } }).sale, { groupItems: true, stayInCategory: false }, 'only true and false count');
  assert.deepEqual(core.normalizeOrdering({ sale: 'x' }).sale, { groupItems: true, stayInCategory: false });
  const s = await appServer();
  try {
    const me = client(), phone = client();
    await me('POST', '/api/auth/signup', { email: 'sale@app.test', password: 'long-enough-pw' }, newIp());
    const site = (await me('POST', '/api/sites', { name: 'Sale Cafe', template: 'order', kind: 'ordering' })).data.site;
    assert.deepEqual(site.ordering.sale, { groupItems: true, stayInCategory: false });
    let r = await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, sale: { groupItems: false, stayInCategory: true } }, rev: site.orderingRev });
    assert.deepEqual([r.status, r.data.ordering.sale], [200, { groupItems: false, stayInCategory: true }]);
    // Seen from another sign-in, and kept by a later save of other settings that sends it back as it was.
    await phone('POST', '/api/auth/login', { email: 'sale@app.test', password: 'long-enough-pw' }, newIp());
    const seen = (await phone('GET', `/api/sites/${site.id}`)).data.site;
    assert.deepEqual(seen.ordering.sale, { groupItems: false, stayInCategory: true });
    r = await phone('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...seen.ordering, allowNotes: false }, rev: seen.orderingRev });
    assert.deepEqual([r.data.ordering.allowNotes, r.data.ordering.sale], [false, { groupItems: false, stayInCategory: true }]);
    // A save made from what an older copy showed is refused, as for every other setting.
    assert.equal((await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: { ...site.ordering, sale: { groupItems: true, stayInCategory: true } }, rev: site.orderingRev })).status, 412);
  } finally { s.stop(); }
});

test('Apple push: each environment signs with its own key, one key serves both, and a key Apple will not take gets a fresh connection', async () => {
  const http2 = await import('node:http2');
  const { generateKeyPairSync, verify } = await import('node:crypto');
  const { createApns } = await import('../server/apns.js');
  const pair = () => { const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' }); return { pem: privateKey.export({ type: 'pkcs8', format: 'pem' }), publicKey }; };
  const prod = pair(), sand = pair();
  // Stands in for one of Apple's hosts. It takes only the keys made for its environment and, as Apple does, ties each connection to
  // the key of the first notification sent on it. Each request is kept with the key that signed it and the connection it came on.
  const appleHost = async (own) => {
    const srv = http2.createServer(), got = [], ids = new WeakMap(), tied = new WeakMap(), host = { srv, got, takes: new Set([own]), force: [], opened: 0 };
    srv.on('session', (session) => { ids.set(session, ++host.opened); });
    srv.on('stream', (stream, headers) => {
      const [h, c, sig] = String(headers.authorization).replace(/^bearer /, '').split('.');
      const kid = JSON.parse(Buffer.from(h, 'base64url').toString()).kid;
      if (!tied.has(stream.session)) tied.set(stream.session, kid);
      stream.on('data', () => {});
      stream.on('end', () => {
        const reason = host.force.shift() || (!host.takes.has(kid) ? 'BadEnvironmentKeyIdInToken' : tied.get(stream.session) !== kid ? 'UnrelatedKeyIdInToken' : '');
        got.push({ kid, conn: ids.get(stream.session), reason, signed: `${h}.${c}`, sig });
        stream.respond({ ':status': reason ? 403 : 200, 'content-type': 'application/json' });
        stream.end(reason ? JSON.stringify({ reason }) : '');
      });
    });
    await new Promise((r) => srv.listen(0, r));
    host.origin = `http://127.0.0.1:${srv.address().port}`;
    return host;
  };
  const sandbox = await appleHost('SANDBOXKID'), production = await appleHost('PRODKEY001');
  const team = { APNS_TEAM_ID: 'D8D94SXAG6' }, prodKey = { APNS_KEY_ID: 'PRODKEY001', APNS_KEY: prod.pem }, sandKey = { APNS_SANDBOX_KEY_ID: 'SANDBOXKID', APNS_SANDBOX_KEY: sand.pem };
  const made = [], start = (env) => { const a = createApns(env, { hosts: { development: sandbox.origin, production: production.origin } }); made.push(a); return a; };
  const dev = `apns:development:${'cd'.repeat(32)}`, live = `apns:production:${'cd'.repeat(32)}`, msg = { title: 'New order #7 · $5.00', body: 'Deli · Pickup', tag: 'order-7' };
  const since = (h, n) => h.got.slice(n).map((x) => [x.kid, x.reason]);
  const signedBy = (x, publicKey) => verify('sha256', Buffer.from(x.signed), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(x.sig, 'base64url'));
  const ownKeysOnly = () => { sandbox.takes = new Set(['SANDBOXKID']); production.takes = new Set(['PRODKEY001']); };
  try {
    // On while either key can be used; off without the team, or with no key that can be read.
    assert.equal(createApns({ ...team, ...prodKey, ...sandKey }).enabled, true);
    assert.equal(createApns({ ...team, ...sandKey }).enabled, true, 'a sandbox key alone is enough');
    assert.equal(createApns({ ...team, ...prodKey }).enabled, true);
    assert.equal(createApns({ ...prodKey, ...sandKey }).enabled, false);
    assert.equal(createApns({ ...team, APNS_KEY_ID: 'PRODKEY001', APNS_KEY: 'not a key', APNS_SANDBOX_KEY_ID: 'SANDBOXKID', APNS_SANDBOX_KEY: 'nor this' }).enabled, false);
    assert.equal(createApns({ ...team, APNS_SANDBOX_KEY: sand.pem }).enabled, false, 'a key needs its id');

    // Both keys: each environment signs with its own, on its own host.
    let apns = start({ ...team, ...prodKey, ...sandKey });
    assert.equal(await apns.send(dev, msg), 'sent');
    assert.equal(await apns.send(live, msg), 'sent');
    assert.deepEqual([since(sandbox, 0), since(production, 0)], [[['SANDBOXKID', '']], [['PRODKEY001', '']]]);
    assert.ok(signedBy(sandbox.got[0], sand.publicKey) && signedBy(production.got[0], prod.publicKey));
    // Only one key set (a key made for both environments): it signs for both, whichever of the two it is.
    for (const [only, kid, key] of [[prodKey, 'PRODKEY001', prod.publicKey], [sandKey, 'SANDBOXKID', sand.publicKey]]) {
      sandbox.takes.add(kid); production.takes.add(kid);
      apns = start({ ...team, ...only });
      assert.equal(await apns.send(dev, msg), 'sent');
      assert.equal(await apns.send(live, msg), 'sent');
      assert.deepEqual([sandbox.got.at(-1).kid, production.got.at(-1).kid], [kid, kid]);
      assert.ok(signedBy(sandbox.got.at(-1), key) && signedBy(production.got.at(-1), key));
      ownKeysOnly();
    }
    // A sandbox key that cannot be read leaves the production key to sign for both.
    sandbox.takes.add('PRODKEY001');
    apns = start({ ...team, ...prodKey, APNS_SANDBOX_KEY_ID: 'SANDBOXKID', APNS_SANDBOX_KEY: 'not a key' });
    assert.equal(await apns.send(dev, msg), 'sent');
    assert.equal(sandbox.got.at(-1).kid, 'PRODKEY001');
    ownKeysOnly();

    // The two keys pasted the wrong way round: Apple says a key is not for its environment, so the notification goes once more, on a
    // fresh connection, with the other key. That key is used there from then on.
    apns = start({ ...team, APNS_KEY_ID: 'SANDBOXKID', APNS_KEY: sand.pem, APNS_SANDBOX_KEY_ID: 'PRODKEY001', APNS_SANDBOX_KEY: prod.pem });
    let n = sandbox.got.length, opened = sandbox.opened;
    assert.equal(await apns.send(dev, msg), 'sent');
    assert.deepEqual(since(sandbox, n), [['PRODKEY001', 'BadEnvironmentKeyIdInToken'], ['SANDBOXKID', '']]);
    assert.equal(sandbox.opened - opened, 2, 'a fresh connection for the other key');
    assert.equal(await apns.send(dev, msg), 'sent');
    assert.deepEqual(since(sandbox, n + 2), [['SANDBOXKID', '']], 'straight to the key that worked, on the same connection');
    assert.equal(sandbox.opened - opened, 2);
    n = production.got.length;
    assert.equal(await apns.send(live, msg), 'sent');
    assert.deepEqual(since(production, n), [['SANDBOXKID', 'BadEnvironmentKeyIdInToken'], ['PRODKEY001', '']]);

    // A key made for one environment only, and no other key: one more try on a fresh connection, then it counts as a failure.
    apns = start({ ...team, ...prodKey });
    n = sandbox.got.length; opened = sandbox.opened;
    await assert.rejects(apns.send(dev, msg), /BadEnvironmentKeyIdInToken/);
    assert.deepEqual(since(sandbox, n), [['PRODKEY001', 'BadEnvironmentKeyIdInToken'], ['PRODKEY001', 'BadEnvironmentKeyIdInToken']]);
    assert.equal(sandbox.opened - opened, 2);

    // A connection Apple has tied to another key is closed, and the notification goes once more on a fresh one; only once.
    apns = start({ ...team, ...prodKey, ...sandKey });
    assert.equal(await apns.send(live, msg), 'sent');
    n = production.got.length; opened = production.opened;
    production.force.push('UnrelatedKeyIdInToken');
    assert.equal(await apns.send(live, msg), 'sent');
    assert.deepEqual(since(production, n), [['PRODKEY001', 'UnrelatedKeyIdInToken'], ['PRODKEY001', '']]);
    assert.equal(production.opened - opened, 1);
    assert.notEqual(production.got.at(-1).conn, production.got.at(-2).conn);
    production.force.push('UnrelatedKeyIdInToken', 'UnrelatedKeyIdInToken');
    await assert.rejects(apns.send(live, msg), /UnrelatedKeyIdInToken/);
    assert.equal(production.got.length - n, 4, 'one more try, not more');
    assert.equal(await apns.send(live, msg), 'sent', 'and the next notification goes as usual');

    // The service says the app can get notifications when only the sandbox key is set.
    const s = await appServer({ apns: start({ ...team, ...sandKey }) });
    try { assert.equal((await client()('GET', '/api/config')).data.appPush, true); } finally { s.stop(); }
  } finally { for (const a of made) a.close(); sandbox.srv.close(); production.srv.close(); }
});

test('Apple push: a key set up only halfway is named in the log, with what is missing and which key signs in its place', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { createApns } = await import('../server/apns.js');
  const pem = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  const team = { APNS_TEAM_ID: 'D8D94SXAG6' }, prodKey = { APNS_KEY_ID: 'PRODKEY001', APNS_KEY: pem }, sandKey = { APNS_SANDBOX_KEY_ID: 'SANDBOXKID', APNS_SANDBOX_KEY: pem };
  // Whether notifications are on with these settings, and what starting up with them says in the log.
  const startup = (env) => { const lines = [], was = console.error; console.error = (...a) => { lines.push(a.join(' ')); }; try { const a = createApns(env); a.close(); return [a.enabled, lines]; } finally { console.error = was; } };
  // Nothing to say when nothing is set, when only the team is (the app's saved passwords need it alone), or when each key is whole.
  assert.deepEqual(startup({}), [false, []]);
  assert.deepEqual(startup(team), [false, []]);
  assert.deepEqual(startup({ ...team, ...prodKey }), [true, []]);
  assert.deepEqual(startup({ ...team, ...prodKey, ...sandKey }), [true, []]);
  // The production key's id without the key, or the key without its id: the sandbox key then signs for TestFlight and App Store builds
  // too, which Apple refuses when it is a sandbox-only key, so the log says which setting is missing.
  const PROD = 'The production Apple push key could not be used, so the sandbox key signs in its place:';
  assert.deepEqual(startup({ ...team, ...sandKey, APNS_KEY_ID: 'PRODKEY001' }), [true, [`${PROD} APNS_KEY is not set.`]]);
  assert.deepEqual(startup({ ...team, ...sandKey, APNS_KEY: pem }), [true, [`${PROD} APNS_KEY_ID is not set.`]]);
  assert.deepEqual(startup({ ...team, ...prodKey, APNS_SANDBOX_KEY: pem }), [true, ['The sandbox Apple push key could not be used, so the production key signs in its place: APNS_SANDBOX_KEY_ID is not set.']]);
  // Keys without the team: notifications are off, and the log says why.
  assert.deepEqual(startup({ ...prodKey, ...sandKey }), [false, ['production', 'sandbox'].map((k) => `The ${k} Apple push key could not be used, so iPhone notifications are off: APNS_TEAM_ID is not set.`)]);
  assert.deepEqual(startup({ APNS_SANDBOX_KEY_ID: 'SANDBOXKID' }), [false, ['The sandbox Apple push key could not be used, so iPhone notifications are off: APNS_SANDBOX_KEY and APNS_TEAM_ID are not set.']]);
  // A key that cannot be read, or is not the kind Apple gives out, is named the same way.
  const [on, [line]] = startup({ ...team, ...sandKey, APNS_KEY_ID: 'PRODKEY001', APNS_KEY: 'garbage' });
  assert.ok(on && line.startsWith(`${PROD} APNS_KEY could not be read (`), line);
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.deepEqual(startup({ ...team, ...prodKey, APNS_SANDBOX_KEY_ID: 'SANDBOXKID', APNS_SANDBOX_KEY: rsa }), [true, ['The sandbox Apple push key could not be used, so the production key signs in its place: APNS_SANDBOX_KEY is not the P-256 key Apple gives out.']]);
});
