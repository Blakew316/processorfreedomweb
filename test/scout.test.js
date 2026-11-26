/* Scout: what it finds in the library, what it refuses to discuss, who it hands off to, and the routes around it.
   The model is a stand-in here: these tests are about the rules the server enforces whatever the model says. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { loadLibrary, search, answer, supportOpen, isMoneyQuestion, devicesNamed, topicsOf, rules, SCOUT_PHONE } from '../server/scout.js';

const lib = loadLibrary();
const reply = (over = {}) => async () => ({ text: 'Try this.', department: 'none', section: 'none', offer_brand_line: false, solved: false, ...over });
const ask = (text, extra = {}) => answer({ lib, turns: [{ role: 'user', text }], business: "Joe's Pizza", firstName: 'Maria', model: reply(), ...extra });

test('the library is there and holds no password entries', () => {
  assert.ok(lib.entries.length > 4000, `only ${lib.entries.length} entries`);
  assert.equal(lib.devices.length, 85);
  assert.equal(lib.entries.filter((e) => /82567729/.test(e.steps.join(' '))).length, 0, 'the Valor master passcode is in the library');
});

test('a question finds entries for the device it names, and the merchant\'s own device ranks first', () => {
  const named = devicesNamed(lib, 'my VP550E is frozen');
  assert.ok(named.includes('valor-vp550e'), JSON.stringify(named));
  const found = search(lib, 'Valor VP550E will not connect to wifi');
  assert.ok(found.length > 0 && found.slice(0, 5).every((e) => e.devices.some((d) => d.startsWith('valor'))), found.slice(0, 5).map((e) => e.id).join(', '));
  const mine = search(lib, 'printer is out of paper', ['clover-flex']);
  assert.ok(mine.slice(0, 3).every((e) => e.devices.includes('clover-flex')), mine.slice(0, 3).map((e) => e.id).join(', '));
  assert.deepEqual(search(lib, ''), []);
  // A device is found by its everyday name, and the longer name wins.
  assert.deepEqual(devicesNamed(lib, 'My Clover Flex will not turn on'), ['clover-flex']);
  assert.deepEqual(devicesNamed(lib, 'my clover flex pocket is dead'), ['clover-flex-pocket']);
  assert.deepEqual(topicsOf("it won't turn on"), ['power']);
  // A fault brings its other fixes along, so there is a next step when the first one fails, and nothing off the subject.
  const power = search(lib, 'My Clover Flex will not turn on. no, it still will not turn on');
  assert.ok(power.every((e) => e.devices.includes('clover-flex')), power.filter((e) => !e.devices.includes('clover-flex')).map((e) => e.id).join(', '));
  assert.ok(power.filter((e) => e.topic === 'power').length >= 6, `only ${power.filter((e) => e.topic === 'power').length} power fixes for the Flex`);
  assert.ok(power.slice(0, 5).every((e) => e.topic === 'power'), power.slice(0, 5).map((e) => `${e.topic}:${e.title}`).join(' | '));
  assert.ok(power.length <= 30);
});

test('rates, fees, holds, contracts and cancelling never reach the model', async () => {
  for (const q of ['Why is my rate higher this month?', 'what fees am I paying', 'there is a hold on my funds', 'I want to cancel my contract', 'where is my deposit']) {
    assert.ok(isMoneyQuestion(q), q);
    let called = false;
    const out = await answer({ lib, turns: [{ role: 'user', text: q }], model: async () => { called = true; return {}; } });
    assert.equal(called, false, `${q}: the model was asked`);
    assert.equal(out.department, 'client-services');
    assert.match(out.text, /Processor Freedom Client Services/);
    assert.ok(out.actions.some((a) => a.href === 'tel:+12104806345'));
  }
  for (const q of ['How do I run a refund?', 'my terminal will not turn on', 'What are my total sales for today?']) assert.equal(isMoneyQuestion(q), false, q);
});

test('a reply that quotes a rate is replaced, even if the model wrote it', async () => {
  const out = await ask('tell me about my account', { model: reply({ text: 'Your rate is 2.9% plus fees.' }) });
  assert.equal(out.department, 'client-services');
  assert.doesNotMatch(out.text, /2\.9/);
});

test('hand-offs name the right desk; a section opens by its tab', async () => {
  const tech = await ask('still broken', { model: reply({ department: 'tech' }) });
  assert.equal(tech.department, 'tech');
  assert.ok(tech.actions.some((a) => a.callback === 'tech') && tech.actions.some((a) => /210-480-6345/.test(a.label)));
  const where = await ask('where are my statements', { model: reply({ section: 'stmts', text: 'They are under Finances > Statements.' }) });
  assert.deepEqual(where.actions[0], { label: 'Open Statements', tab: 'stmts' });
  const junk = await ask('hello', { model: reply({ department: 'sales', section: 'admin' }) });
  assert.equal(junk.department, 'none');
  assert.deepEqual(junk.actions, []);
});

test('support hours are 9 to 5 Central on weekdays; after hours the brand line comes last', async () => {
  assert.equal(supportOpen(Date.parse('2026-11-24T16:00:00Z')), true);   // Tuesday 10:00 Central
  assert.equal(supportOpen(Date.parse('2026-11-24T23:30:00Z')), false);  // Tuesday 5:30 PM Central
  assert.equal(supportOpen(Date.parse('2026-11-28T18:00:00Z')), false);  // Saturday noon Central
  const night = Date.parse('2026-11-28T08:07:00Z');                      // Saturday 2:07 AM Central
  const out = await ask('Card reader is dead', { deviceIds: ['clover-flex'], at: night, model: reply({ text: 'That is every step.', department: 'tech', offer_brand_line: true }) });
  assert.match(out.text, /If you can't wait: Clover Support, 1-855-853-8340\.$/);
  assert.ok(out.actions.some((a) => /when they open/.test(a.label)));
  assert.match(rules({ open: false, business: 'X', firstName: '', devices: [] }), /support is CLOSED/);
  const said = rules({ open: true, business: 'X', firstName: 'Maria', devices: [] });
  assert.match(said, /first name once/);
  assert.match(said, /Never say you have opened/);
  assert.match(said, /Processing statements are not in this back office yet/);
  assert.doesNotMatch(rules({ open: false, business: 'X', firstName: '', devices: [] }), /reach out to your (local|sales)/i);
  const noBrand = await ask('it is broken', { at: night, model: reply({ offer_brand_line: true }) });
  assert.doesNotMatch(noBrand.text, /If you can't wait/);
});

test('the routes: off without a key, owner only, the question is kept, another account cannot ask', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pf-scout-'));
  const boot = async (options) => {
    const app = createApp({ dataDir: dir, env: { SITES_DOMAIN: 'pfsites.test', APP_URL: 'http://app.pfsites.test', TRUST_PROXY: '1' }, mailer: { enabled: true, send: async () => {} }, ...options });
    const srv = createServer(app); await new Promise((r) => srv.listen(0, r));
    const base = `http://127.0.0.1:${srv.address().port}`;
    const client = () => { let cookie = ''; return async (method, path, body) => {
      const res = await fetch(base + path, { method, headers: { 'X-Forwarded-Host': 'app.pfsites.test', ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
      const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; } return { status: res.status, data };
    }; };
    return { client, stop: async () => { await new Promise((r) => srv.close(r)); app.close(); } };
  };
  let seen = null;
  const on = await boot({ scoutModel: async (system, turns, entries) => { seen = { system, turns, entries }; return { text: 'Hold the power button.', department: 'none', section: 'none', offer_brand_line: false, solved: false }; } });
  try {
    const me = on.client(), other = on.client();
    await me('POST', '/api/auth/signup', { email: 'owner@shop.test', name: 'Maria Lopez', password: 'long-enough-pw' });
    await other('POST', '/api/auth/signup', { email: 'other@shop.test', password: 'long-enough-pw' });
    const site = (await me('POST', '/api/sites', { name: "Joe's Pizza", template: 'restaurant' })).data.site;
    const S = `/api/sites/${site.id}/scout`;
    assert.deepEqual((await me('GET', S)).data, { enabled: true, devices: [] });
    assert.equal((await me('POST', `${S}/chat`, { messages: [] })).status, 400);
    assert.equal((await me('POST', `${S}/chat`, { messages: [{ role: 'assistant', text: 'hi' }] })).status, 400);
    const r = await me('POST', `${S}/chat`, { messages: [{ role: 'user', text: 'My Clover Flex will not turn on' }] });
    assert.equal(r.status, 200); assert.equal(r.data.text, 'Hold the power button.'); assert.ok(r.data.chatId);
    assert.match(seen.system, /Joe's Pizza, speaking with Maria/);
    assert.match(seen.system, /Today so far: net sales \$0\.00 from 0 orders/);
    assert.match(seen.system, /The last 7 days: net sales/);
    assert.match(seen.entries, /Clover Flex/);
    assert.ok((await other('POST', `${S}/chat`, { messages: [{ role: 'user', text: 'hello' }] })).status >= 403);
    assert.ok((await on.client()('GET', S)).status === 401);
    assert.equal((await me('POST', `${S}/callback`, { department: 'tech', chatId: r.data.chatId })).status, 503);
  } finally { await on.stop(); }
  const off = await boot({});
  try {
    const me = off.client();
    await me('POST', '/api/auth/login', { email: 'owner@shop.test', password: 'long-enough-pw' });
    const sites = (await me('GET', '/api/sites')).data.sites;
    assert.equal((await me('GET', `/api/sites/${sites[0].id}/scout`)).data.enabled, false);
    assert.equal((await me('POST', `/api/sites/${sites[0].id}/scout/chat`, { messages: [{ role: 'user', text: 'hello' }] })).status, 503);
  } finally { await off.stop(); rmSync(dir, { recursive: true, force: true }); }
  assert.equal(SCOUT_PHONE, '210-480-6345');
});
