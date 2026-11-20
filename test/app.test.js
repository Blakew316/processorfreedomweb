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
const dnsAnswers = { cname: {}, a: {} };
const dns = { resolveCname: async (n) => dnsAnswers.cname[n] || Promise.reject(new Error('ENOTFOUND')), resolve4: async (n) => dnsAnswers.a[n] || Promise.reject(new Error('ENOTFOUND')) };

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pfsites-'));
  app = createApp({ dataDir: dir, dns, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', ADMIN_EMAILS: 'staff@pf.test' } });
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
  assert.equal((await me('PUT', `/api/sites/${site.id}`, { draft: site.draft })).status, 200);
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
  r = await me('PUT', `/api/sites/${site.id}`, { draft: site.draft });
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
  assert.equal((await me('POST', `/api/sites/${site.id}/domain`, { domain: 'https://www.joespizza.com/' })).data.site.customDomain, 'joespizza.com');
  assert.notEqual((await anon('GET', '/privacy', null, { host: 'joespizza.com' })).status, 200);
  assert.equal((await me('POST', `/api/sites/${site.id}/domain/verify`)).data.ok, false);
  dnsAnswers.cname['www.joespizza.com'] = ['app.pfsites.test'];
  r = await me('POST', `/api/sites/${site.id}/domain/verify`);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.site.url, 'https://joespizza.com');
  assert.equal((await anon('GET', '/privacy', null, { host: 'www.joespizza.com' })).status, 200);

  // Domain requests reach staff, who can attach a domain directly
  r = await me('POST', '/api/sites', { name: 'Second Shop', template: 'retail' });
  const second = r.data.site;
  assert.equal((await me('POST', `/api/sites/${second.id}/domain-request`, { desired: 'secondshop.com' })).status, 201);
  const staff = client();
  await staff('POST', '/api/auth/signup', { email: 'staff@pf.test', password: 'long-enough-pw' });
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
  assert.deepEqual(orderTotals([{ price: 350, qty: 3 }, { price: 1299, qty: 1 }], 'delivery', o, 15), { subtotal: 2349, tax: 194, fee: 399, tip: 352, total: 3294 });
  assert.equal(orderTotals([{ price: 350, qty: 1 }], 'pickup', o, 0).fee, 0);
});

test('ordering: build from an item list, take an order, track stock, send emails', async () => {
  const sent = [];
  const dir2 = mkdtempSync(join(tmpdir(), 'pfsites-'));
  const app2 = createApp({ dataDir: dir2, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test' }, mailer: { enabled: true, send: async (m) => { sent.push(m); } } });
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
