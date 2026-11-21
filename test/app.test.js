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
  assert.deepEqual(orderTotals([{ price: 350, qty: 3 }, { price: 1299, qty: 1 }], 'delivery', o, 15), { subtotal: 2349, discount: 0, tax: 194, fee: 399, tip: 352, total: 3294 });
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
  const app3 = createApp({ dataDir: dir3, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', ADMIN_EMAILS: 'boss@pf.test' }, mailer: { enabled: true, send: async (m) => { sent.push(m); } } });
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
    r = await me('GET', `/api/sites/${site.id}/stats`);
    assert.equal(r.data.orders, 2);
    assert.equal(r.data.days.length, 30);
    assert.equal(r.data.top[0].name, 'Burrito');
    assert.equal((await client()('GET', `/api/sites/${site.id}/stats`)).status, 401);

    // Spanish
    const draft = (await me('GET', `/api/sites/${site.id}`)).data.site.draft;
    draft.lang = 'es';
    await me('POST', `/api/sites/${site.id}/publish`, { draft });
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
  const app4 = createApp({ dataDir: dir4, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test' }, mailer: { enabled: true, send: async (m) => { sent.push(m); } }, pusher: async (sub, message) => { pushed.push({ sub, message }); return sub.endpoint.includes('dead') ? 'gone' : 'sent'; } });
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
    assert.equal((await me('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://push.example.com/live', keys: { p256dh: 'a', auth: 'b' } } })).status, 201);
    assert.equal((await me('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://push.example.com/dead', keys: { p256dh: 'a', auth: 'b' } } })).status, 201);
    assert.equal((await client()('POST', '/api/push/subscribe', { subscription: {} })).status, 401);

    const settings = { ...site.ordering, methods: { pickup: true, delivery: true }, deliveryFee: 999, zones: [{ zips: '75751 75752', fee: 300 }, { zips: '75758', fee: 500 }], loyalty: { enabled: true, every: 2, type: 'amount', value: 400 }, cats: [{ name: 'Secret', hidden: true }] };
    const saved = (await me('PUT', `/api/sites/${site.id}/ordering`, { ordering: settings })).data.ordering;
    assert.equal(saved.zones.length, 2);

    // Version history: each publish that changes something is kept
    const draft = (await me('GET', `/api/sites/${site.id}`)).data.site.draft;
    await me('POST', `/api/sites/${site.id}/publish`, {});
    await me('POST', `/api/sites/${site.id}/publish`, {});
    draft.brand.tagline = 'Second version'; draft.lang = 'es';
    await me('POST', `/api/sites/${site.id}/publish`, { draft });
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

    // Loyalty: the second order earned a one-time code worth $4
    orders = (await me('GET', `/api/sites/${site.id}/orders`)).data.orders;
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
    assert.deepEqual(r.data.ordering.cats, [{ name: 'Specials', hidden: true, from: '', to: '' }]);

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
  items = (await me('PUT', `/api/sites/${site.id}/menu/${items[0].id}`, { stock: 3 })).data.items;
  assert.deepEqual([items[0].taxable, items[0].stock], [true, 3], 'other fields are kept when one changes');
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
