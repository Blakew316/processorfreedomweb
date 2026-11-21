// Web Push without dependencies: VAPID (RFC 8292) and aes128gcm message encryption (RFC 8291).

import { createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, createCipheriv, randomBytes, sign } from 'node:crypto';

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const un64 = (s) => Buffer.from(String(s), 'base64url');

export function newVapidKeys() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  return { publicKey: b64(Buffer.concat([Buffer.from([4]), un64(jwk.x), un64(jwk.y)])), jwk };
}

/** Encrypts a message for one subscription. Returns the request body. */
export function encryptPush(payload, p256dh, auth, salt = randomBytes(16)) {
  const local = createECDH('prime256v1');
  local.generateKeys();
  const clientKey = un64(p256dh);
  const serverKey = local.getPublicKey();
  const secret = local.computeSecret(clientKey);
  const ikm = Buffer.from(hkdfSync('sha256', secret, un64(auth), Buffer.concat([Buffer.from('WebPush: info\0'), clientKey, serverKey]), 32));
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = createCipheriv('aes-128-gcm', key, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0); header.writeUInt32BE(4096, 16); header.writeUInt8(serverKey.length, 20);
  return Buffer.concat([header, serverKey, body]);
}

export function vapidHeader(endpoint, keys, contact = 'mailto:support@processorfreedom.com') {
  const part = (o) => b64(JSON.stringify(o));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contact })}`;
  const sig = sign('sha256', Buffer.from(unsigned), { key: createPrivateKey({ key: keys.jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64(sig)}, k=${keys.publicKey}`;
}

/** Sends one notification. Resolves to 'gone' when the subscription should be deleted. */
export async function sendPush(sub, message, keys, fetcher = fetch) {
  const res = await fetcher(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: vapidHeader(sub.endpoint, keys), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: 'high' },
    body: encryptPush(JSON.stringify(message), sub.p256dh, sub.auth),
  });
  if (res.status === 404 || res.status === 410) return 'gone';
  if (!res.ok) throw new Error(`Push service answered ${res.status}`);
  return 'sent';
}
