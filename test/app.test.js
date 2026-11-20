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
