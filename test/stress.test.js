/* Races and hostile input: the things that only go wrong when many people act at once or send nonsense. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { wallNow } from '../shared/core.js';

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), 'pfstress-'));
  const app = createApp({ dataDir: dir, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: true, send: async () => {} }, pusher: async () => 'ok' });
  const srv = createServer(app);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  let ip = 0;
  const client = () => {
    let cookie = '';
    return async (method, path, body, { host = 'app.pfsites.test', raw = false } = {}) => {
      const res = await fetch(base + path, { method, headers: { 'X-Forwarded-Host': host, 'cf-connecting-ip': `10.1.${(ip >> 8) & 255}.${ip++ & 255}`, ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, data };
    };
  };
  return { client, stop: async () => { await new Promise((r) => srv.close(r)); app.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test('a rush of customers cannot oversell stock, double-spend a gift card or overbook a table', async () => {
  const { client, stop } = await boot();
  try {
    const me = client(), anon = client(), host = { host: 'rushcafe.pfsites.test' };
    await me('POST', '/api/auth/signup', { email: 'rush@shop.test', password: 'long-enough-pw' });
    const site = (await me('POST', '/api/sites', { name: 'Rush Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price\nTaco,10.00\nSoda,2.50' })).data.site;
    const S = `/api/sites/${site.id}`;
    await me('PUT', `${S}/ordering`, { ordering: { ...site.ordering, booking: { enabled: true, perSlot: 1, services: [{ id: 's1', name: 'Table', minutes: 60 }] } } });
    await me('POST', `${S}/publish`, {});
    const [taco, soda] = (await me('GET', `${S}/menu`)).data.items;
    const who = (i) => ({ method: 'pickup', name: `Cust ${i}`, phone: '903-555-0100', email: `c${i}@example.com` });

    await me('PUT', `${S}/menu/${taco.id}`, { stock: 10, stockWas: taco.stock });
    let rs = await Promise.all(Array.from({ length: 40 }, (_, i) => anon('POST', '/_order', { ...who(i), items: [{ id: taco.id, qty: 1 }] }, host)));
    assert.equal(rs.filter((r) => r.status === 201).length, 10, 'exactly the ten in stock were sold');
    assert.equal((await me('GET', `${S}/menu`)).data.items[0].stock, 0);
    const numbers = (await me('GET', `${S}/orders`)).data.orders.map((o) => o.number);
    assert.equal(new Set(numbers).size, numbers.length, 'every order has its own number');

    await me('POST', `${S}/gift-cards`, { amount: 2500, paidWith: 'Cash' });
    const code = (await me('GET', `${S}/gift-cards`)).data.cards[0].code;
    await Promise.all(Array.from({ length: 15 }, (_, i) => anon('POST', '/_order', { ...who(100 + i), promo: code, items: [{ id: soda.id, qty: 4 }] }, host)));
    const given = (await me('GET', `${S}/orders`)).data.orders.filter((o) => o.giftCode === `…${code.slice(-4)}`).reduce((a, o) => a + o.gift, 0);
    // Two spends at the counter at once can never take the card below zero either.
    await Promise.all(Array.from({ length: 6 }, () => me('POST', `${S}/gift-cards/${code}`, { change: -400 })));
    assert.ok((await me('GET', `${S}/gift-cards`)).data.cards[0].balance >= 0);
    const card = (await me('GET', `${S}/gift-cards`)).data.cards[0], left = card.balance;
    assert.equal(given + left + (card.redeemed - given), 2500, 'the card paid out exactly what was on it');
    assert.equal(card.loaded - card.redeemed, left);
    assert.ok(given <= 2500);

    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    rs = await Promise.all(Array.from({ length: 12 }, (_, i) => anon('POST', '/_book', { service: 's1', date: day, time: '12:00', name: `B${i}`, phone: '903-555-0100', email: `b${i}@example.com`, party: 2 }, host)));
    assert.equal(rs.filter((r) => r.status === 201).length, 1, 'one table, one booking');
  } finally { await stop(); }
});

test('nonsense input is refused cleanly and never saved as junk', async () => {
  const { client, stop } = await boot();
  try {
    const me = client();
    await me('POST', '/api/auth/signup', { email: 'junk@shop.test', password: 'long-enough-pw' });
    const site = (await me('POST', '/api/sites', { name: 'Junk Cafe', template: 'order', kind: 'ordering' })).data.site;
    const S = `/api/sites/${site.id}`;
    // A list or an object where a name belongs is not a name.
    assert.equal((await me('POST', `${S}/menu`, { name: { a: 1 }, price: 500 })).status, 400);
    assert.equal((await me('POST', `${S}/shifts`, { name: ['x'], day: '2026-01-01', start: '09:00', finish: '17:00' })).status, 400);
    assert.equal((await me('POST', `${S}/plans`, { name: 'Big', customer: { name: 'D', email: 'd@x.test' }, amount: 1e308, every: 'weekly' })).status, 400);
    // Broken or oversized bodies get an answer, not a dropped connection or a crash.
    assert.equal((await me('POST', `${S}/menu`, '{"name":', { raw: true })).status, 400);
    assert.equal((await me('PUT', `${S}/ordering`, 'x'.repeat(700_000), { raw: true })).status, 413);
    for (const body of [null, [], 'text', 12, { ordering: null }, { ordering: { hours: 'x', promos: [null, 1, {}], cats: {}, booking: [] } }]) assert.ok((await me('PUT', `${S}/ordering`, body)).status < 500);
    for (const body of [{ draft: null }, { draft: [] }, { draft: { sections: 'x', brand: 5, theme: [] } }]) assert.ok((await me('PUT', S, body)).status < 500);
    const menu = (await me('GET', `${S}/menu`)).data.items;
    assert.ok(!JSON.stringify(menu).includes('[object Object]'));
    assert.equal((await me('GET', S)).status, 200, 'the shop is still fine afterwards');
  } finally { await stop(); }
});

test('local time is right across zones and clock changes', () => {
  const at = (zone, iso) => new Date(wallNow({ timezone: zone }, Date.parse(iso))).toISOString().slice(0, 16);
  assert.equal(at('America/Chicago', '2026-01-15T18:30:00Z'), '2026-01-15T12:30');
  assert.equal(at('America/Chicago', '2026-07-15T18:30:00Z'), '2026-07-15T13:30');
  assert.equal(at('America/New_York', '2026-03-08T06:59:00Z'), '2026-03-08T01:59');
  assert.equal(at('America/New_York', '2026-03-08T07:00:00Z'), '2026-03-08T03:00');
  assert.equal(at('Asia/Kolkata', '2026-05-01T00:10:00Z'), '2026-05-01T05:40');
  assert.equal(at('America/Chicago', '2026-01-15T18:30:59Z'), '2026-01-15T12:30', 'seconds are dropped');
});
