/* Known orders in, exact totals out: every report, chart and money screen must agree to the cent.
   Expected figures are worked out by hand in the comments, from the published formula:
   tax = round((taxable − share of discount) × rate), tip = round(subtotal × tip%), total = subtotal − discount + tax + fee + tip. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';

const env = { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test' };

test('sales totals, charts, items, tenders, refunds, cash and counter sales all add up', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pfmoney-'));
  const app = createApp({ dataDir: dir, env, mailer: { enabled: false, send: async () => {} }, dns: { resolveCname: async () => { throw new Error('x'); }, resolve4: async () => { throw new Error('x'); } } });
  const srv = createServer(app); await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const call = async (method, path, body, host = 'app.pfsites.test') => {
    const res = await fetch(base + path, { method, headers: { 'X-Forwarded-Host': host, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set && host === 'app.pfsites.test') cookie = set.split(';')[0];
    const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    assert.ok(res.status < 300, `${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
    return data;
  };
  try {
    await call('POST', '/api/auth/signup', { email: 'owner@money.test', password: 'long-enough-pw', name: 'Owner' });
    const site = (await call('POST', '/api/sites', { name: 'Money Cafe', template: 'order', kind: 'ordering', csv: 'Item,Price\nTaco,10.00\nSoda,2.50' })).site;
    const S = `/api/sites/${site.id}`;
    await call('PUT', `${S}/ordering`, { ordering: { ...site.ordering, enabled: true, accepting: true, useHours: false, scheduling: false, slotLimit: 0, taxRate: 8.25, tips: true, deliveryFee: 399, deliveryMin: 0,
      methods: { ...site.ordering.methods, pickup: true, delivery: true }, zones: [], promos: [{ code: 'SAVE10', type: 'percent', value: 10 }] } });
    await call('POST', `${S}/publish`, {});
    const items = (await call('GET', `${S}/menu`)).items, taco = items.find((x) => x.name === 'Taco').id, soda = items.find((x) => x.name === 'Soda').id;
    const host = `${site.slug}.pfsites.test`;
    const order = (b) => call('POST', '/_order', { name: 'Ana', phone: '903-555-0100', email: 'ana@example.com', ...b }, host);
    const O = async (b) => { const n = (await order(b)).number; return (await call('GET', `${S}/orders`)).orders.find((x) => x.number === n); };

    // O1 pickup: 2 Taco + 1 Soda, 15% tip. subtotal 2250, tax round(185.625)=186, tip round(337.5)=338, total 2774. Paid by card.
    const o1 = await O({ method: 'pickup', tip: 15, items: [{ id: taco, qty: 2 }, { id: soda, qty: 1 }] });
    assert.deepEqual([o1.subtotal, o1.tax, o1.tip, o1.total], [2250, 186, 338, 2774]);
    // O2 delivery: 1 Taco, SAVE10. subtotal 1000, discount 100, tax round(74.25)=74, fee 399, total 1373. Paid cash, then 5.00 refunded.
    const o2 = await O({ method: 'delivery', address: '1 Main St', promo: 'SAVE10', items: [{ id: taco, qty: 1 }] });
    assert.deepEqual([o2.subtotal, o2.discount, o2.tax, o2.fee, o2.total], [1000, 100, 74, 399, 1373]);
    // O3 pickup: 1 Soda, cancelled, so left out of sales and shown as removed (2.50).
    const o3 = await O({ method: 'pickup', items: [{ id: soda, qty: 1 }] });
    // O4 pickup: 3 Soda, not paid. subtotal 750, tax round(61.875)=62, total 812.
    const o4 = await O({ method: 'pickup', items: [{ id: soda, qty: 3 }] });
    assert.equal(o4.total, 812);
    const all = (await call('GET', `${S}/orders`)).orders, id = (n) => all.find((x) => x.number === n.number).id;
    await call('POST', `${S}/orders/${id(o1)}/payment`, { method: 'Card' });
    await call('POST', `${S}/orders/${id(o2)}/payment`, { method: 'Cash' });
    await call('POST', `${S}/orders/${id(o2)}/payment`, { refund: 500, note: 'Cold' });
    await call('POST', `${S}/orders/${id(o3)}`, { status: 'cancelled' });
    // A counter sale recorded with New sale: 15.00 by check.
    await call('POST', `${S}/invoices`, { walkIn: true, customer: { name: 'Walk-in customer' }, items: [{ name: 'Sale', qty: 1, price: 1500 }], paidMethod: 'Check' });

    const st = await call('GET', `${S}/stats?range=today`), t = st.totals;
    // Sales (orders): 3 kept, gross 4000, discounts 100, net 3900, tax 322, fees 399, tips 338, total 4959, 7 units, 1 cancelled.
    assert.deepEqual({ orders: t.orders, gross: t.gross, discounts: t.discounts, net: t.net, tax: t.tax, fees: t.fees, tips: t.tips, total: t.total, units: t.units, cancelled: t.cancelled },
      { orders: 3, gross: 4000, discounts: 100, net: 3900, tax: 322, fees: 399, tips: 338, total: 4959, units: 7, cancelled: 1 });
    assert.equal(t.average, Math.round(4959 / 3), 'average order = total ÷ orders');
    assert.equal(t.net, t.gross - t.discounts, 'net = gross − discounts');
    assert.equal(t.total, t.net + t.tax + t.fees + t.tips, 'total = net + tax + fees + tips');
    assert.equal(t.taxable + t.nontaxable, t.net, 'taxable + non-taxable = net');
    // The chart: hours add up to the same net sales and order count; every order lands in today's hour.
    assert.equal(st.unit, 'hour'); assert.equal(st.series.length, 24);
    assert.equal(st.series.reduce((a, x) => a + x.net, 0), 3900); assert.equal(st.series.reduce((a, x) => a + x.orders, 0), 3);
    // Item sales: Taco 3 for 30.00, Soda 4 for 10.00 (cancelled soda not counted). Items add up to gross.
    const it = Object.fromEntries(st.items.map((x) => [x.name, [x.qty, x.sales]]));
    assert.deepEqual(it, { Taco: [3, 3000], Soda: [4, 1000] }); assert.equal(st.items.reduce((a, x) => a + x.sales, 0), t.gross);
    // Order types: pickup 2 orders net 30.00, delivery 1 order net 9.00; together = net sales.
    const m = Object.fromEntries(st.methods.filter((x) => x.orders).map((x) => [x.method, [x.orders, x.net]]));
    assert.deepEqual(m, { pickup: [2, 3000], delivery: [1, 900] });
    // Tender types on orders: card 27.74, cash 13.73, unpaid 8.12; together = total.
    const tn = Object.fromEntries(st.tenders.map((x) => [x.name, x.total]));
    assert.deepEqual(tn, { Card: 2774, Cash: 1373, 'Not paid yet': 812 }); assert.equal(st.tenders.reduce((a, x) => a + x.total, 0), t.total);
    // Discounts, removed items, employee sales.
    assert.deepEqual(st.promos.map((x) => [x.name, x.uses, x.amount]), [['SAVE10', 1, 100]]);
    assert.deepEqual(st.removed.map((x) => [x.name, x.qty, x.value]), [['Soda', 1, 250]]);
    assert.equal(st.employees.reduce((a, x) => a + x.net, 0), t.net, 'employee sales add up to net sales');
    // Home Finances and Refunds: money actually collected today = card 27.74 + cash 13.73 + check 15.00 = 56.47; refunds 5.00.
    assert.equal(st.money.collected, 5647); assert.equal(st.money.refunds, 500);
    const mt = Object.fromEntries(st.money.tenders.map((x) => [x.method, [x.amount, x.refunds]]));
    assert.deepEqual(mt, { Card: [2774, 0], Cash: [1373, 500], Check: [1500, 0] });
    // Transactions screen agrees with Home: payments 56.47, refunds 5.00, net 51.47.
    const tx = await call('GET', `${S}/transactions?range=today`);
    assert.deepEqual([tx.totals.payments, tx.totals.refunds, tx.totals.net, tx.totals.count], [5647, 500, 5147, 3]);
    // Cash drawer: cash sales 13.73 − cash refund 5.00 = 8.73 expected (no paid in/out).
    const cash = await call('GET', `${S}/cash?range=today`);
    assert.deepEqual([cash.totals.cashSales, cash.totals.cashRefunds, cash.totals.expected], [1373, 500, 873]);
    // Closeout open batch counts the same money.
    const close = await call('GET', `${S}/closeouts`);
    const ob = close.open.totals || close.open;
    assert.equal(ob.payments ?? ob.totals?.payments, 5647, `open batch: ${JSON.stringify(ob).slice(0, 200)}`);
    // Yesterday is empty, so the comparison base is zero.
    assert.equal(st.previous.net, 0);
    // Last 30 days includes today's figures exactly once.
    const m30 = (await call('GET', `${S}/stats?range=last30`)).totals;
    assert.deepEqual([m30.orders, m30.net, m30.total], [3, 3900, 4959]);
    const s30 = (await call('GET', `${S}/stats?range=last30`)).series; assert.equal(s30.length, 30); assert.equal(s30.reduce((a, x) => a + x.net, 0), 3900);
  } finally { await new Promise((r) => srv.close(r)); app.close(); rmSync(dir, { recursive: true, force: true }); }
});
