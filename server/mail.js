// Order emails. Sending uses Resend's HTTP API when RESEND_API_KEY and EMAIL_FROM are set;
// without them, messages are skipped and logged so the rest of the system keeps working.

import { esc, money, ORDER_METHODS, readyLabel } from '../shared/core.js';

export function createMailer(env) {
  const key = env.RESEND_API_KEY;
  const from = String(env.EMAIL_FROM || '').trim();
  const address = (from.match(/<([^>]+)>/) || [, from])[1];
  const enabled = !!(key && address);
  return {
    enabled,
    async send({ to, subject, html, text, fromName, replyTo }) {
      if (!to) return { skipped: true };
      if (!enabled) { console.log(`[email not configured] to ${to}: ${subject}`); return { skipped: true }; }
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromName ? `${fromName.replace(/[<>"]/g, '')} <${address}>` : from, to: [to], subject, html, text, reply_to: replyTo || undefined }),
      });
      if (!res.ok) throw new Error(`Email provider answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { sent: true };
    },
  };
}

const WORDS = {
  en: { order: 'Order', sub: 'Subtotal', disc: 'Discount', tax: 'Tax', del: 'Delivery', tip: 'Tip', total: 'Total', view: 'View your order', about: (n) => `About ${n} minutes`, sched: (w) => `Scheduled for ${w}`, to: 'Deliver to', car: 'Vehicle', notes: 'Notes', pickup: 'Pickup', curbside: 'Curbside', delivery: 'Delivery' },
  es: { order: 'Pedido', sub: 'Subtotal', disc: 'Descuento', tax: 'Impuesto', del: 'Entrega', tip: 'Propina', total: 'Total', view: 'Ver tu pedido', about: (n) => `Unos ${n} minutos`, sched: (w) => `Programado para ${w}`, to: 'Entregar en', car: 'Vehículo', notes: 'Notas', pickup: 'Para recoger', curbside: 'En la acera', delivery: 'Entrega' },
};
const HEAD = {
  en: {
    placed: (o) => ['We have your order', `Thanks, ${o.name.split(' ')[0]}. We received your order and will confirm it shortly.`],
    confirmed: () => ['Your order is confirmed', 'We are preparing your order now.'],
    ready: (o) => [o.method === 'delivery' ? 'Your order is on its way' : `Your order is ${readyLabel(o.method).toLowerCase()}`, o.method === 'delivery' ? 'Your order has left and will be with you soon.' : o.method === 'curbside' ? 'Pull up and let us know you are here. We will bring it out.' : 'Come on in. Your order is waiting at the counter.'],
    cancelled: () => ['Your order was cancelled', 'Your order has been cancelled. Please contact us if you have any questions.'],
    merchant: (o) => [`New ${ORDER_METHODS[o.method].name.toLowerCase()} order`, `${o.name} placed an order for ${money(o.total)}.`],
  },
  es: {
    placed: (o) => ['Recibimos tu pedido', `Gracias, ${o.name.split(' ')[0]}. Recibimos tu pedido y lo confirmaremos en breve.`],
    confirmed: () => ['Tu pedido está confirmado', 'Estamos preparando tu pedido.'],
    ready: (o) => [o.method === 'delivery' ? 'Tu pedido va en camino' : 'Tu pedido está listo', o.method === 'delivery' ? 'Tu pedido ya salió y llegará pronto.' : o.method === 'curbside' ? 'Acércate y avísanos que llegaste. Te lo llevamos al auto.' : 'Pasa cuando quieras. Tu pedido te espera en el mostrador.'],
    cancelled: () => ['Tu pedido fue cancelado', 'Tu pedido ha sido cancelado. Contáctanos si tienes alguna pregunta.'],
  },
};

/** Builds one order email. `kind` is placed, confirmed, ready, cancelled or merchant. */
export function orderEmail(kind, { business, order, statusUrl, manageUrl, eta, when, lang = 'en' }) {
  const L = kind !== 'merchant' && lang === 'es' ? 'es' : 'en';
  const W = WORDS[L];
  const [title, intro] = HEAD[L][kind](order);
  const forMerchant = kind === 'merchant';
  const rows = order.items.map((l) => [`${l.qty} × ${l.name}${l.opts?.length ? ` (${l.opts.join(', ')})` : ''}`, money(l.price * l.qty)]);
  const totals = [[W.sub, order.subtotal], [`${W.disc}${order.promo ? ` (${order.promo})` : ''}`, -order.discount], [W.tax, order.tax], [W.del, order.fee], [W.tip, order.tip]].filter(([, v]) => v).map(([k, v]) => [k, v < 0 ? `−${money(-v)}` : money(v)]);
  const details = [
    [W[order.method] || ORDER_METHODS[order.method].name, when ? W.sched(when) : kind === 'placed' && eta ? W.about(eta) : ''],
    forMerchant && ['Customer', `${order.name} · ${order.phone} · ${order.email}`],
    order.address && [W.to, order.address], order.vehicle && [W.car, order.vehicle], order.notes && [W.notes, order.notes],
  ].filter(Boolean);
  const url = forMerchant ? manageUrl : statusUrl;
  const td = 'padding:8px 0;border-bottom:1px solid #e8e8ed;font-size:15px';
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1d1d1f;-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:18px"><tr><td style="padding:36px 32px">
<p style="margin:0 0 20px;font-size:14px;color:#6e6e73;font-weight:600">${esc(business.name)} · ${W.order} #${esc(order.number)}</p>
<h1 style="margin:0 0 10px;font-size:28px;line-height:1.15;letter-spacing:-.02em;font-weight:600">${esc(title)}</h1>
<p style="margin:0 0 24px;font-size:17px;line-height:1.45;color:#6e6e73">${esc(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">${details.map(([k, v]) => `<tr><td style="${td};color:#6e6e73;width:110px;vertical-align:top">${esc(k)}</td><td style="${td}">${esc(v)}</td></tr>`).join('')}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(([k, v]) => `<tr><td style="${td}">${esc(k)}</td><td align="right" style="${td}">${v}</td></tr>`).join('')}${totals.map(([k, v]) => `<tr><td style="padding:6px 0;font-size:14px;color:#6e6e73">${k}</td><td align="right" style="padding:6px 0;font-size:14px;color:#6e6e73">${v}</td></tr>`).join('')}<tr><td style="padding:10px 0;font-size:17px;font-weight:600">${W.total}</td><td align="right" style="padding:10px 0;font-size:17px;font-weight:600">${money(order.total)}</td></tr></table>
${url ? `<p style="margin:24px 0 0"><a href="${esc(url)}" style="display:inline-block;background:#1d1d1f;color:#fff;text-decoration:none;border-radius:980px;padding:12px 24px;font-size:15px;font-weight:500">${forMerchant ? 'Open orders' : W.view}</a></p>` : ''}
${forMerchant ? '' : `<p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:#86868b">${esc([business.name, business.address, business.phone].filter(Boolean).join(' · '))}</p>`}
</td></tr></table></td></tr></table></body></html>`;
  const text = [`${business.name} · ${W.order} #${order.number}`, '', title, intro, '', ...details.map(([k, v]) => `${k}: ${v}`), '', ...rows.map(([k, v]) => `${k}  ${v}`), ...totals.map(([k, v]) => `${k}: ${v}`), `${W.total}: ${money(order.total)}`, '', url || ''].join('\n');
  return { subject: forMerchant ? `${title} #${order.number} · ${money(order.total)}` : `${title} · ${business.name} #${order.number}`, html, text };
}

export function resetEmail({ name, link }) {
  const hello = name ? `Hi ${name.split(' ')[0]},` : 'Hi,';
  return {
    subject: 'Reset your Processor Freedom Sites password',
    text: `${hello}\n\nUse this link to choose a new password. It works once and expires in 2 hours.\n\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1d1d1f"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:18px"><tr><td style="padding:36px 32px"><h1 style="margin:0 0 10px;font-size:26px;letter-spacing:-.02em;font-weight:600">Reset your password</h1><p style="margin:0 0 22px;font-size:16px;line-height:1.5;color:#6e6e73">${esc(hello)} use the button below to choose a new password. The link works once and expires in 2 hours.</p><p style="margin:0 0 22px"><a href="${esc(link)}" style="display:inline-block;background:#0a1f44;color:#fff;text-decoration:none;border-radius:980px;padding:12px 24px;font-size:15px;font-weight:500">Choose a new password</a></p><p style="margin:0;font-size:13px;color:#86868b">If you did not ask for this, you can ignore this email.</p></td></tr></table></td></tr></table></body></html>`,
  };
}
