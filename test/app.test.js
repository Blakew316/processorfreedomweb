import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    assert.deepEqual(r.data.ordering.cats.map(({ id, ...rest }) => rest), [{ name: 'Specials', hidden: true, from: '', to: '' }]);
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
    app2.tick(Date.now());
    sent.length = 0;
    app2.tick(Date.now() + 26 * 3600000);
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual((await me('GET', `/api/sites/${site.id}/menu`)).data.items.map((x) => x.stock), [40, 12]);
    const summary = sent.find((m) => /3 orders/.test(m.subject));
    assert.ok(summary, 'summary email');
    assert.equal(summary.to, 'boss@refill.test');
    assert.match(summary.html, /Best sellers/);
    assert.match(summary.html, /refilled/);
    sent.length = 0;
    app2.tick(Date.now() + 27 * 3600000);
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
