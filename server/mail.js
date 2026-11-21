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

const shell = (inner) => `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1d1d1f;-webkit-font-smoothing:antialiased"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:18px"><tr><td style="padding:36px 32px">${inner}</td></tr></table></td></tr></table></body></html>`;
const button = (url, label) => (url ? `<p style="margin:24px 0 0"><a href="${esc(url)}" style="display:inline-block;background:#1d1d1f;color:#fff;text-decoration:none;border-radius:980px;padding:12px 24px;font-size:15px;font-weight:500">${esc(label)}</a></p>` : '');
const rowsHtml = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(([k, v]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e8e8ed;font-size:15px">${esc(k)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #e8e8ed;font-size:15px;font-weight:600">${esc(v)}</td></tr>`).join('')}</table>`;

/** The end-of-day report for the owner: sales, best sellers and what is running low. */
export function summaryEmail({ business, dayLabel, totals, top, low, restocked, manageUrl }) {
  const head = totals.orders ? `${money(totals.net)} from ${totals.orders} order${totals.orders === 1 ? '' : 's'}` : 'No orders';
  const sums = [['Orders', String(totals.orders)], ['Net sales', money(totals.net)], ['Sales tax', money(totals.tax)], ['Tips', money(totals.tips)], ['Total collected', money(totals.total)]];
  const h3 = (t) => `<h2 style="margin:26px 0 6px;font-size:17px;font-weight:600">${esc(t)}</h2>`;
  const html = shell(`<p style="margin:0 0 20px;font-size:14px;color:#6e6e73;font-weight:600">${esc(business.name)} · ${esc(dayLabel)}</p><h1 style="margin:0 0 20px;font-size:28px;line-height:1.15;letter-spacing:-.02em;font-weight:600">${esc(head)}</h1>${rowsHtml(sums)}${top.length ? h3('Best sellers') + rowsHtml(top.map((i) => [`${i.qty} × ${i.name}`, money(i.sales)])) : ''}${low.length ? h3('Running low') + rowsHtml(low.map((i) => [i.name, i.stock === 0 ? 'Sold out' : `${i.stock} left`])) : ''}${restocked ? `<p style="margin:18px 0 0;font-size:14px;color:#6e6e73">${restocked} item${restocked === 1 ? ' was' : 's were'} refilled to ${restocked === 1 ? 'its' : 'their'} daily quantity this morning.</p>` : ''}${button(manageUrl, 'Open sales')}`);
  const text = [`${business.name} · ${dayLabel}`, '', head, '', ...sums.map(([k, v]) => `${k}: ${v}`), ...(top.length ? ['', 'Best sellers', ...top.map((i) => `${i.qty} x ${i.name}  ${money(i.sales)}`)] : []), ...(low.length ? ['', 'Running low', ...low.map((i) => `${i.name}: ${i.stock === 0 ? 'sold out' : `${i.stock} left`}`)] : []), '', manageUrl || ''].join('\n');
  return { subject: `${dayLabel}: ${head} · ${business.name}`, html, text };
}

export function lowStockEmail({ business, items, manageUrl }) {
  const title = items.length === 1 ? `${items[0].name} is ${items[0].stock === 0 ? 'sold out' : 'running low'}` : `${items.length} items are running low`;
  const html = shell(`<p style="margin:0 0 20px;font-size:14px;color:#6e6e73;font-weight:600">${esc(business.name)}</p><h1 style="margin:0 0 10px;font-size:26px;line-height:1.15;letter-spacing:-.02em;font-weight:600">${esc(title)}</h1><p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#6e6e73">Sold-out items come off your order page on their own. Update the quantity when you have more.</p>${rowsHtml(items.map((i) => [i.name, i.stock === 0 ? 'Sold out' : `${i.stock} left`]))}${button(manageUrl, 'Open items')}`);
  return { subject: `${title} · ${business.name}`, html, text: [business.name, '', title, '', ...items.map((i) => `${i.name}: ${i.stock === 0 ? 'sold out' : `${i.stock} left`}`), '', manageUrl || ''].join('\n') };
}

export function inviteEmail({ business, role, link, inviter, fresh = true }) {
  const what = role === 'kitchen' ? 'see and update orders' : 'help manage the site, menu and orders';
  return {
    subject: `You have been added to ${business} on Processor Freedom Sites`,
    text: `${inviter || 'The owner'} added you to ${business} so you can ${what}.\n\n${fresh ? 'Choose your password and sign in here. The link works once and expires in 3 days.' : 'Sign in with your existing account to get started.'}\n\n${link}`,
    html: shell(`<h1 style="margin:0 0 10px;font-size:26px;letter-spacing:-.02em;font-weight:600">You have been added to ${esc(business)}</h1><p style="margin:0;font-size:16px;line-height:1.5;color:#6e6e73">${esc(inviter || 'The owner')} added you so you can ${what}. ${fresh ? 'Choose your password to sign in. The link works once and expires in 3 days.' : 'Sign in with your existing account to get started.'}</p>${button(link, fresh ? 'Choose my password' : 'Sign in')}`),
  };
}

/** The email that carries an invoice: the amount, when it is due and one button to view and pay. */
export function invoiceEmail({ business, invoice, url, reminder }) {
  const first = (invoice.customer.name || '').split(' ')[0];
  const due = invoice.due ? new Date(`${invoice.due}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const title = reminder ? `Reminder: invoice ${invoice.label} for ${money(invoice.total)}` : `Invoice ${invoice.label} for ${money(invoice.total)}`;
  const intro = `${first ? `Hi ${first}, here` : 'Here'} is ${reminder ? 'a reminder about ' : ''}your invoice from ${business.name}.${due ? ` Payment is due ${due}.` : ''}`;
  const rows = [...invoice.items.map((l) => [`${l.qty} × ${l.name}`, money(l.price * l.qty)]), ...(invoice.discount ? [['Discount', `−${money(invoice.discount)}`]] : []), ...(invoice.tax ? [['Tax', money(invoice.tax)]] : []), ['Amount due', money(invoice.total)]];
  return {
    subject: `${title} · ${business.name}`,
    text: [intro, '', ...rows.map(([k, v]) => `${k}  ${v}`), '', `View and pay: ${url}`, '', [business.name, business.phone].filter(Boolean).join(' · ')].join('\n'),
    html: shell(`<p style="margin:0 0 20px;font-size:14px;color:#6e6e73;font-weight:600">${esc(business.name)} · Invoice ${esc(invoice.label)}</p><h1 style="margin:0 0 10px;font-size:34px;line-height:1.1;letter-spacing:-.025em;font-weight:600">${money(invoice.total)}</h1><p style="margin:0 0 22px;font-size:16px;line-height:1.5;color:#6e6e73">${esc(intro)}</p>${rowsHtml(rows)}${invoice.notes ? `<p style="margin:18px 0 0;font-size:15px;line-height:1.5;color:#1d1d1f;white-space:pre-wrap">${esc(invoice.notes)}</p>` : ''}${button(url, 'View and pay invoice')}<p style="margin:26px 0 0;font-size:13px;line-height:1.5;color:#86868b">${esc([business.name, business.address, business.phone].filter(Boolean).join(' · '))}</p>`),
  };
}
