// Apple push for the iPhone app, without dependencies: token authentication (an ES256 JSON Web Token signed with the .p8 key from
// Apple) over one HTTP/2 connection per Apple host and key, kept open between notifications as Apple asks.
// Apple's keys can be made for one environment only, and the app gets tokens for both: a build installed from Xcode has sandbox
// tokens, TestFlight and App Store builds production ones. APNS_KEY_ID and APNS_KEY are the production key, and APNS_SANDBOX_KEY_ID
// and APNS_SANDBOX_KEY the sandbox one; when only one of the two is set (a key made for both environments), it is used for both.
// APNS_TEAM_ID is the team the keys belong to, and APNS_BUNDLE_ID the app's bundle id, if it is not the usual one.
// Notifications are on while at least one key can be used.

import { connect } from 'node:http2';
import { createPrivateKey, sign } from 'node:crypto';

const HOSTS = { production: 'https://api.push.apple.com', development: 'https://api.sandbox.push.apple.com' };
// Apple's answers that mean the phone is not there any more, so the device is dropped instead of tried again.
const GONE = new Set(['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered']);
// Apple's answers that say the key does not fit: not the key the connection's first notification used (Apple ties a connection to
// that one), or not a key for this environment. Either way the notification goes once more on a fresh connection.
const KEY_MISMATCH = new Set(['UnrelatedKeyIdInToken', 'BadEnvironmentKeyIdInToken']);
const b64 = (x) => Buffer.from(x).toString('base64url');
// Keeps text within a number of bytes without cutting a character in half.
const clip = (s, bytes) => { let out = String(s ?? ''); while (Buffer.byteLength(out) > bytes) out = out.slice(0, -1); return out; };

// options.hosts and options.connect stand in for Apple's servers in tests, and options.waits shortens the waits below there.
export function createApns(env, options = {}) {
  const team = String(env.APNS_TEAM_ID || '').trim();
  const topic = String(env.APNS_BUNDLE_ID || '').trim() || 'com.processorfreedomsites.app';
  // One key as pasted into the host's settings: written-out \n become new lines, and a bare key gets its PEM lines back. A key that
  // cannot be read is left out with a note in the log, instead of stopping the whole service. So is one set up only halfway (its id
  // without the key, the key without its id, or either without the team), naming the setting that is missing: else the other key would
  // sign in its place without a word, and Apple refuses a key made for the other environment, so the phones would seem to fail.
  const unusable = [];
  const readKey = (which, idName, keyName) => {
    const id = String(env[idName] || '').trim();
    let pem = String(env[keyName] || '').replace(/\\n/g, '\n').trim();
    if (!id && !pem) return null;
    const missing = [!id && idName, !pem && keyName, !team && 'APNS_TEAM_ID'].filter(Boolean);
    if (missing.length) { unusable.push([which, `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set`]); return null; }
    if (!pem.includes('-----BEGIN')) pem = `-----BEGIN PRIVATE KEY-----\n${pem.replace(/\s+/g, '').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
    let key;
    try { key = createPrivateKey(pem); } catch (e) { unusable.push([which, `${keyName} could not be read (${e.message})`]); return null; }
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') { unusable.push([which, `${keyName} is not the P-256 key Apple gives out`]); return null; }
    return { id, key, jwt: '', at: 0 };
  };
  const keys = { production: readKey('production', 'APNS_KEY_ID', 'APNS_KEY'), development: readKey('sandbox', 'APNS_SANDBOX_KEY_ID', 'APNS_SANDBOX_KEY') };
  const enabled = !!(keys.production || keys.development);
  for (const [which, why] of unusable) console.error(`The ${which} Apple push key could not be used, so ${enabled ? `the ${which === 'production' ? 'sandbox' : 'production'} key signs in its place` : 'iPhone notifications are off'}: ${why}.`);
  // The key each environment uses: its own, or the other one when it has none. If Apple says a key does not fit its environment and
  // the other key then works there, that one is used for it from then on (see send).
  const using = { production: keys.production || keys.development, development: keys.development || keys.production };
  const otherKey = (k) => (k === keys.production ? keys.development : keys.production);
  const hosts = { ...HOSTS, ...options.hosts };
  const dial = options.connect || connect;

  // Apple wants one token used for at least 20 minutes and a new one within the hour, so one is made every 40 minutes, for each key.
  const bearer = (k) => {
    if (!k.jwt || Date.now() - k.at > 40 * 60000) {
      const unsigned = `${b64(JSON.stringify({ alg: 'ES256', kid: k.id }))}.${b64(JSON.stringify({ iss: team, iat: Math.floor(Date.now() / 1000) }))}`;
      k.jwt = `${unsigned}.${b64(sign('sha256', Buffer.from(unsigned), { key: k.key, dsaEncoding: 'ieee-p1363' }))}`;
      k.at = Date.now();
    }
    return k.jwt;
  };

  // How long Apple has to answer a notification, how long a connection may sit unused before it is checked with a ping, and how long
  // that ping may take. A connection can die without a word (a router on the way forgets it), and only a check shows that.
  const { answer: ANSWER_MS = 10000, quiet: QUIET_MS = 60000, ping: PING_MS = 5000 } = options.waits || {};

  // One connection per host and key (Apple ties a connection to the key it was first used with), kept open and used again while it
  // works. One that fails, goes unanswered, or that Apple closes, is dropped, so the next notification opens a fresh one. Connections
  // never keep the process running on their own, so tests and shutdown are not held up. at: the last time the connection was seen to work.
  const sessions = new Map(), checks = new Map();
  const slotOf = (origin, k) => `${origin} ${k.id}`;
  const drop = (slot, s) => { if (sessions.get(slot)?.s === s) sessions.delete(slot); if (!s.destroyed) s.destroy(); };
  // A connection Apple will not take this key on: no new notification goes on it, and any still on their way finish first.
  const retire = (slot) => { const entry = sessions.get(slot); if (!entry) return; sessions.delete(slot); try { entry.s.close(); } catch { /* already closed */ } };
  const open = (slot, origin) => {
    const s = dial(origin), entry = { s, at: Date.now() };
    const forget = () => { if (sessions.get(slot) === entry) sessions.delete(slot); };
    s.on('error', (e) => { forget(); console.error('Apple push connection failed:', e.message); });
    s.on('goaway', forget);
    s.on('close', forget);
    s.unref();
    sessions.set(slot, entry);
    return s;
  };
  const worked = (slot, s) => { const entry = sessions.get(slot); if (entry?.s === s) entry.at = Date.now(); };
  // Resolves true when the connection answers a ping in time, as Apple suggests for checking a connection.
  const answers = (s) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), PING_MS);
    timer.unref();
    const done = (ok) => { clearTimeout(timer); resolve(ok); };
    try { if (!s.ping((err) => done(!err))) done(false); } catch { done(false); }
  });
  // The connection to send on: the open one, pinged first when it has been quiet for a while, or a new one. Notifications that go out
  // together wait for the same check, so one quiet connection is never replaced by several.
  const sessionFor = (slot, origin) => {
    const entry = sessions.get(slot), usable = entry && !entry.s.closed && !entry.s.destroyed;
    if (usable && Date.now() - entry.at < QUIET_MS) return Promise.resolve(entry.s);
    if (checks.has(slot)) return checks.get(slot);
    const check = (async () => {
      if (usable) { if (await answers(entry.s)) { worked(slot, entry.s); return entry.s; } drop(slot, entry.s); }
      return open(slot, origin);
    })().finally(() => checks.delete(slot));
    checks.set(slot, check);
    return check;
  };
  // One try at a notification. Resolves with Apple's answer. A failure before Apple answered is the connection's fault, not the phone's:
  // the connection is dropped and the error marked lost, so the notification can be tried again on a fresh one.
  const attempt = async (slot, origin, headers, body) => {
    const s = await sessionFor(slot, origin);
    return new Promise((resolve, reject) => {
      let req, code = 0, text = '', done = false;
      const lost = (e) => { drop(slot, s); e.lost = true; return e; };
      const finish = (fn, value) => { if (done) return; done = true; clearTimeout(timer); fn(value); };
      const timer = setTimeout(() => finish(reject, lost(new Error('Apple push did not answer in time'))), ANSWER_MS);
      timer.unref();
      try { req = s.request(headers); } catch (e) { finish(reject, lost(e)); return; }
      req.setEncoding('utf8');
      req.on('response', (h) => { code = Number(h[':status']) || 0; worked(slot, s); });
      req.on('data', (c) => { if (text.length < 4000) text += c; });
      req.on('end', () => { let why = ''; try { why = String(JSON.parse(text || '{}').reason || ''); } catch { /* not JSON */ } finish(resolve, { status: code, reason: why }); });
      // Once Apple has answered, its answer stands even if the rest of it is cut off.
      const cut = (e) => (code ? finish(resolve, { status: code, reason: '' }) : finish(reject, lost(e)));
      req.on('error', cut);
      req.on('close', () => cut(new Error('Apple push connection closed')));
      req.end(body);
    });
  };

  return {
    enabled,
    // endpoint: 'apns:<development|production>:<device token>'. Resolves to 'sent', or 'gone' when the device should be dropped.
    // Anything else throws, so the caller counts it as a failure.
    async send(endpoint, message = {}) {
      if (!enabled) throw new Error('Apple push is not set up.');
      const m = /^apns:(development|production):([0-9a-f]{64,200})$/.exec(String(endpoint));
      if (!m) return 'gone';
      const where = m[1], origin = hosts[where], tag = clip(message.tag, 64);
      const body = JSON.stringify({ aps: { alert: { title: clip(message.title, 400), body: clip(message.body, 1600) }, sound: 'default', 'thread-id': clip(message.siteId || 'pf', 64) }, url: clip(message.url, 500) });
      const headersFor = (k) => ({ ':method': 'POST', ':path': `/3/device/${m[2]}`, authorization: `bearer ${bearer(k)}`, 'apns-topic': topic, 'apns-push-type': 'alert', 'apns-priority': '10', 'content-type': 'application/json', ...(tag ? { 'apns-collapse-id': tag } : {}) });
      // A notification lost with its connection goes once more on a fresh one, so only Apple's own answers, or a second failure in a
      // row, count against the phone. Alerts carry a collapse id, so the rare one that got through both times shows once.
      // A key Apple says does not fit also gets one more try on a fresh connection: with the other key, when there is one and Apple
      // said the first is not for this environment, else with the same key.
      let k = using[where], answer, lostAgain = false, keyAgain = false;
      for (;;) {
        try { answer = await attempt(slotOf(origin, k), origin, headersFor(k), body); } catch (e) { if (!e.lost || lostAgain) throw e; lostAgain = true; continue; }
        if (!KEY_MISMATCH.has(answer.reason)) break;
        // That connection is not used again, even when this was the last try, so the next notification starts on a fresh one.
        retire(slotOf(origin, k));
        if (keyAgain) break;
        keyAgain = true;
        if (answer.reason === 'BadEnvironmentKeyIdInToken' && otherKey(k)) k = otherKey(k);
      }
      const { status, reason } = answer;
      // Apple took the key, so it is the one this environment uses from now on.
      if (status === 200 || status === 410 || (status === 400 && GONE.has(reason))) using[where] = k;
      if (status === 200) return 'sent';
      if (status === 410 || (status === 400 && GONE.has(reason))) return 'gone';
      // A token Apple calls expired or wrong is made again for the next notification.
      if (status === 403 && /ProviderToken/.test(reason)) k.jwt = '';
      throw new Error(reason || `Apple push answered ${status}`);
    },
    close() { for (const { s } of sessions.values()) s.close(); sessions.clear(); },
  };
}
