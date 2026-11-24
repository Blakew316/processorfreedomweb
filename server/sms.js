// Text messages for two-step sign-in codes. Sending uses Twilio's HTTP API when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either
// TWILIO_FROM (a number such as +19035550100) or TWILIO_MESSAGING_SERVICE_SID are set; without them, text codes are not offered at all.

export function createSms(env, fetcher = (...a) => fetch(...a)) {
  const sid = String(env.TWILIO_ACCOUNT_SID || '').trim();
  const token = String(env.TWILIO_AUTH_TOKEN || '').trim();
  const from = String(env.TWILIO_FROM || '').trim();
  const service = String(env.TWILIO_MESSAGING_SERVICE_SID || '').trim();
  const enabled = !!(sid && token && (from || service));
  return {
    enabled,
    // Resolves once Twilio has taken the message. The message itself is never logged: it carries the code.
    async send(to, body) {
      if (!enabled) throw new Error('Text messages are not set up.');
      if (!/^\+\d{8,15}$/.test(String(to))) throw new Error('That is not a number a text can be sent to.');
      // A messaging service picks its own sending number; otherwise the one number set up here sends.
      const form = new URLSearchParams({ To: String(to), ...(service ? { MessagingServiceSid: service } : { From: from }), Body: String(body) });
      const res = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: form.toString(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        // Twilio says why in its own words. Phone numbers in them are blanked, so they do not end up in the logs.
        let why = ''; try { why = String((await res.json()).message || ''); } catch { /* not JSON */ }
        throw new Error(`Twilio answered ${res.status}${why ? `: ${why.replace(/\+?\d[\d\s().-]{5,}\d/g, '[number]').slice(0, 200)}` : ''}`);
      }
      return { sent: true };
    },
  };
}

// A mobile number the way Twilio takes it (+ and the country code), or '' when it does not look like one.
// Takes +44 20 7946 0958, (903) 555-0100 (ten digits are a US number, so +1 goes in front) and 1 903 555 0100.
export function normalizePhone(raw) {
  const s = String(raw ?? '').trim();
  if (!/^\+?[\d\s().-]+$/.test(s)) return '';
  const d = s.replace(/\D/g, '');
  if (s.startsWith('+')) return /^\d{8,15}$/.test(d) ? `+${d}` : '';
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d[0] === '1') return `+${d}`;
  return '';
}

// Only the last four digits of a number are ever shown back.
export const maskPhone = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return d ? `•••• ${d.slice(-4)}` : ''; };
