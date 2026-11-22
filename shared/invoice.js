// The invoice a customer sees when they open the link from their email.

import { esc, arr, money, strings, fill } from './core.js';

const CSS = `
.inv-page{padding:64px 0 96px}
.inv-page .wrap{max-width:820px}
.inv-sheet{background:var(--bg);border-radius:calc(var(--r) + 6px);box-shadow:0 0 0 1px var(--line),0 30px 80px -40px rgba(0,0,0,.35);padding:48px;display:grid;gap:32px}
.inv-top2{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;align-items:flex-start}
.inv-top2 h1{font-size:clamp(30px,4.6vw,44px);letter-spacing:-.03em}
.inv-top2 .who{color:var(--muted);font-size:15px;line-height:1.5;margin-top:8px}
.inv-state{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;border-radius:980px;padding:7px 14px;background:var(--bg2)}
.inv-state i{width:8px;height:8px;border-radius:50%;background:var(--muted)}
.inv-state.paid i{background:#1d4f9e}.inv-state.late i{background:#d1372f}.inv-state.open i{background:var(--accent)}
.inv-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:20px}
.inv-meta dt{font-size:13px;color:var(--muted);font-weight:500;margin-bottom:4px}
.inv-meta dd{margin:0;font-size:16px;line-height:1.45}
.inv-lines{width:100%;border-collapse:collapse;font-size:16px;font-variant-numeric:tabular-nums}
.inv-lines th{font-size:13px;color:var(--muted);font-weight:500;text-align:left;padding:0 0 10px;border-bottom:1px solid var(--line)}
.inv-lines td{padding:14px 0;border-bottom:1px solid var(--line);vertical-align:top}
.inv-lines th:not(:first-child),.inv-lines td:not(:first-child){text-align:right;padding-left:16px;white-space:nowrap}
.inv-sum{display:grid;grid-template-columns:1fr auto;gap:8px 32px;justify-content:end;margin-left:auto;min-width:min(100%,280px);font-size:16px;font-variant-numeric:tabular-nums}
.inv-sum span:nth-child(even){text-align:right}
.inv-sum .g{font-weight:600;font-size:24px;letter-spacing:-.02em;padding-top:12px;border-top:1px solid var(--line);margin-top:4px}
.inv-note{background:var(--bg2);border-radius:var(--r-sm);padding:16px 20px;font-size:15px;line-height:1.5;white-space:pre-wrap}
.inv-acts{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.inv-acts .btn{padding:16px 30px;font-size:17px}
.inv-acts button.btn{font:inherit;font-size:17px;cursor:pointer}
@media (max-width:640px){.inv-page{padding:28px 0 64px}.inv-sheet{padding:26px 20px;gap:24px}.inv-lines .q,.inv-lines .p{display:none}}
@media print{.header,.footer,.announce,.inv-acts,.modebtn{display:none!important}.inv-page{padding:0}.inv-sheet{box-shadow:none;padding:0}}
`;

export function invoicePage({ invoice, business, payUrl, lang }) {
  const T = strings(lang);
  const c = invoice.customer || {};
  const est = invoice.kind === 'estimate';
  const day = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === 'es' ? 'es' : 'en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }) : '');
  const issued = new Date(invoice.sentAt || invoice.createdAt).toISOString().slice(0, 10);
  const late = invoice.status === 'sent' && invoice.due && invoice.due < new Date().toISOString().slice(0, 10);
  const state = est ? ['open', T.estimate] : invoice.status === 'paid' ? ['paid', T.invPaid] : invoice.status === 'void' ? ['', T.invVoid] : late ? ['late', T.invLate] : ['open', T.invOpen];
  const lines = arr(invoice.items).map((l) => `<tr><td>${esc(l.name)}</td><td class="q">${esc(l.qty)}</td><td class="p">${money(l.price)}</td><td>${money(l.price * l.qty)}</td></tr>`).join('');
  const canPay = payUrl && invoice.status === 'sent' && !est;
  return `<style>${CSS}</style><section class="inv-page"><div class="wrap"><div class="inv-sheet">
<div class="inv-top2"><div><p class="eyebrow">${esc(est ? T.estimate : T.invoice)} ${esc(invoice.label)}</p><h1>${esc(invoice.status === 'paid' ? T.invThanks : money(invoice.total))}</h1><p class="who">${esc(business.name)}${business.address ? `<br>${esc(business.address)}` : ''}${business.phone ? `<br>${esc(business.phone)}` : ''}</p></div><span class="inv-state ${state[0]}"><i></i>${esc(state[1])}</span></div>
<dl class="inv-meta"><div><dt>${esc(T.billTo)}</dt><dd>${[c.company, c.name, c.address, c.email, c.phone].filter(Boolean).map(esc).join('<br>')}</dd></div><div><dt>${esc(T.issued)}</dt><dd>${esc(day(issued))}</dd></div>${invoice.due ? `<div><dt>${esc(T.dueDate)}</dt><dd>${esc(day(invoice.due))}</dd></div>` : ''}${invoice.status === 'paid' && invoice.paidAt ? `<div><dt>${esc(T.paidOn)}</dt><dd>${esc(day(new Date(invoice.paidAt).toISOString().slice(0, 10)))}</dd></div>` : ''}</dl>
<table class="inv-lines"><thead><tr><th>${esc(T.invItem)}</th><th class="q">${esc(T.qty)}</th><th class="p">${esc(T.priceEach)}</th><th>${esc(T.amount)}</th></tr></thead><tbody>${lines}</tbody></table>
<div class="inv-sum"><span>${esc(T.subtotal)}</span><span>${money(invoice.subtotal)}</span>${invoice.discount ? `<span>${esc(T.discount)}</span><span>−${money(invoice.discount)}</span>` : ''}${invoice.tax ? `<span>${esc(T.tax)}${invoice.taxRate ? ` (${esc(invoice.taxRate)}%)` : ''}</span><span>${money(invoice.tax)}</span>` : ''}<span class="g">${esc(est ? T.estTotal : invoice.status === 'paid' ? T.invPaidTotal : T.amountDue)}</span><span class="g">${money(invoice.total)}</span></div>
${invoice.notes ? `<div class="inv-note">${esc(invoice.notes)}</div>` : ''}
<div class="inv-acts">${canPay ? `<a class="btn" href="${esc(payUrl)}" target="_blank" rel="noopener">${esc(fill(T.payNow, { a: money(invoice.total) }))}</a>` : ''}<button class="btn ghost" type="button" onclick="print()">${esc(T.printSave)}</button></div>
${canPay ? `<p class="note">${esc(fill(T.payRef, { n: invoice.label }))}</p>` : invoice.status === 'sent' && !est ? `<p class="note">${esc(fill(T.payContact, { name: business.name }))}</p>` : ''}
</div></div></section>`;
}
