// The order page and order status page of a published site, plus the small script that runs the cart.

import { esc, str, arr, safeImg, money, ORDER_METHODS, ORDER_STATUSES, readyLabel, openMethods } from './core.js';

export const ORDER_CSS = `
.order,.ostat{padding:72px 0 104px}
.ord-head h1{font-size:clamp(38px,5.4vw,60px);letter-spacing:-.03em}
.ord-head p{color:var(--muted);font-size:19px;margin-top:12px}
.closed{background:var(--bg2);border-radius:var(--r-sm);padding:16px 20px;margin-top:24px;font-size:16px}
.ord-grid{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:48px;align-items:start;margin-top:40px}
.cats{display:flex;gap:8px;overflow-x:auto;padding:10px 0;position:sticky;top:56px;background:var(--bg);z-index:5;scrollbar-width:none;border-bottom:1px solid var(--line)}
.cats::-webkit-scrollbar{display:none}
.cats a{flex:none;color:var(--ink);font-size:14px;font-weight:500;background:var(--bg2);border-radius:980px;padding:7px 15px}
.cats a:hover{text-decoration:none;opacity:.8}
.cat{padding-top:40px;scroll-margin-top:120px}
.cat h2{font-size:26px;margin-bottom:18px}
.ord-menu .tiles{grid-template-columns:1fr}
.mi .tile,.tile.mi{align-items:stretch}
.tile .act{margin-top:14px;display:flex;align-items:center;gap:12px}
.add{font:inherit;font-size:14px;font-weight:600;border:1px solid var(--line);background:var(--bg);color:var(--accent);border-radius:980px;padding:7px 18px;cursor:pointer;transition:background .2s}
.add:hover{background:var(--bg2)}
.soldout{font-size:14px;color:var(--muted);font-weight:500}
.tile.off h3,.tile.off p,.tile.off .price{opacity:.5}
.cart{position:sticky;top:76px;background:var(--bg2);border-radius:var(--r);padding:26px;display:grid;gap:18px;max-height:calc(100vh - 96px);overflow:auto}
.cart h2{font-size:22px}
.cart .none{color:var(--muted);font-size:15px}
.line{display:grid;grid-template-columns:1fr auto;gap:4px 12px;font-size:15px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.line b{font-weight:600}
.step{display:inline-flex;justify-self:start;align-items:center;gap:2px;background:var(--bg);border-radius:980px;border:1px solid var(--line)}
.step button{font:inherit;width:30px;height:30px;border:0;background:none;color:var(--ink);cursor:pointer;font-size:17px;line-height:1;border-radius:50%}
.step span{min-width:20px;text-align:center;font-variant-numeric:tabular-nums;font-weight:600;font-size:14px}
.oseg{display:flex;background:var(--bg);border-radius:12px;padding:3px;gap:3px;border:1px solid var(--line)}
.oseg button{flex:1;font:inherit;font-size:14px;font-weight:500;border:0;background:none;color:var(--ink);border-radius:9px;padding:8px 6px;cursor:pointer}
.oseg button[aria-pressed=true]{background:var(--accent);color:var(--on-accent)}
#checkout{display:grid;gap:14px}
.cart .f input,.cart .f textarea{font-size:16px;padding:11px 13px}
.cart .f textarea{min-height:70px}
.mnote{font-size:14px;color:var(--muted)}
.tot{display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:15px;font-variant-numeric:tabular-nums}
.tot .g{font-weight:600;font-size:18px;padding-top:8px;border-top:1px solid var(--line);margin-top:4px}
.tot .g+.g{text-align:right}
.tot span:nth-child(even){text-align:right}
.oerr{color:#d1372f;font-size:14px}
.cart .btn{width:100%}
.cart .btn[disabled]{opacity:.45;pointer-events:none}
.cartbar{display:none}
.ostat .wrap{max-width:720px}
.ostat h1{font-size:clamp(34px,5vw,52px);letter-spacing:-.03em}
.ostat .lede{margin-top:12px}
.track{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:44px 0 12px}
.track i{height:5px;border-radius:5px;background:var(--line)}
.track i.on{background:var(--accent)}
.trackl{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:13px;color:var(--muted);margin-bottom:44px}
.trackl b{color:var(--ink);font-weight:600}
.box{background:var(--bg2);border-radius:var(--r);padding:28px;display:grid;gap:14px;margin-top:20px}
.box h2{font-size:20px}
.box .line:last-of-type{border-bottom:0;padding-bottom:0}
.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 24px;font-size:16px}
.kv dt{color:var(--muted)}
@media (max-width:860px){
  .order{padding:48px 0 120px}
  .ord-grid{grid-template-columns:1fr;gap:32px}
  .cart{position:static;max-height:none}
  .cartbar{display:flex;position:fixed;left:16px;right:16px;bottom:16px;z-index:30;justify-content:space-between;align-items:center;background:var(--accent);color:var(--on-accent);border-radius:980px;padding:14px 22px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.22)}
  .cartbar:hover{text-decoration:none}
  .cartbar[hidden]{display:none}
}
`;

/* Runs in the visitor's browser. Written as a real function and embedded as text. */
function orderClient() {
  var d = document, P = d.documentElement.hasAttribute('data-preview');
  var fmt = function (c) { return '$' + (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var h = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var S = { cart: {}, method: '', tip: 0, busy: false, err: '', f: {} };
  var conf = function () { var el = d.getElementById('pf-order'); try { return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; } };
  var key = function (c) { return 'pf-cart-' + c.key; };
  function load(c) { try { var v = JSON.parse(localStorage.getItem(key(c)) || '{}'); S.cart = v.cart || {}; S.method = v.method || ''; S.f = v.f || {}; } catch (e) {} }
  function keep(c) { try { localStorage.setItem(key(c), JSON.stringify({ cart: S.cart, method: S.method, f: S.f })); } catch (e) {} }
  function lines(c) { return Object.keys(S.cart).filter(function (id) { return c.items[id] && S.cart[id] > 0; }).map(function (id) { var it = c.items[id]; var q = Math.min(S.cart[id], it.max); return { id: id, name: it.n, price: it.p, qty: q }; }).filter(function (l) { return l.qty > 0; }); }
  function field(name, label, type, req, ac) { return '<label class="f">' + label + '<input name="' + name + '" type="' + (type || 'text') + '"' + (req ? ' required' : '') + (ac ? ' autocomplete="' + ac + '"' : '') + ' maxlength="200" value="' + h(S.f[name]) + '"></label>'; }
  function draw() {
    var c = conf(), el = d.getElementById('cart'); if (!c || !el) return;
    if (c.methods.indexOf(S.method) < 0) S.method = c.methods[0] || '';
    var L = lines(c), sub = L.reduce(function (s, l) { return s + l.price * l.qty; }, 0), count = L.reduce(function (s, l) { return s + l.qty; }, 0);
    var tax = Math.round(sub * c.tax / 100), fee = S.method === 'delivery' ? c.fee : 0, tip = c.tips ? Math.round(sub * S.tip / 100) : 0, total = sub + tax + fee + tip;
    var bar = d.getElementById('cartbar'); if (bar) { bar.hidden = !count; bar.innerHTML = '<span>View order · ' + count + (count === 1 ? ' item' : ' items') + '</span><span>' + fmt(total) + '</span>'; }
    var out = '<h2>Your order</h2>';
    if (!L.length) { el.innerHTML = out + '<p class="none">' + (c.open ? 'Add items from the menu to get started.' : 'Online ordering is paused right now.') + '</p>'; return; }
    out += L.map(function (l) { return '<div class="line"><b>' + h(l.name) + '</b><span>' + fmt(l.price * l.qty) + '</span><div class="step"><button type="button" data-qty="-1" data-id="' + l.id + '" aria-label="Remove one ' + h(l.name) + '">−</button><span>' + l.qty + '</span><button type="button" data-qty="1" data-id="' + l.id + '" aria-label="Add one ' + h(l.name) + '">+</button></div></div>'; }).join('');
    if (c.methods.length > 1) out += '<div class="oseg" role="group" aria-label="How would you like your order?">' + c.methods.map(function (m) { return '<button type="button" data-method="' + m + '" aria-pressed="' + (S.method === m) + '">' + c.names[m] + '</button>'; }).join('') + '</div>';
    var note = { pickup: 'Pickup' + (c.prep ? ' in about ' + c.prep + ' minutes' : '') + '. ' + c.pickupNote, curbside: 'Curbside' + (c.prep ? ' in about ' + c.prep + ' minutes' : '') + '. ' + c.curbsideNote, delivery: 'Delivery' + (c.dmin ? ' in about ' + c.dmin + ' minutes' : '') + '. ' + c.area }[S.method] || '';
    out += '<p class="mnote">' + h(note) + '</p>';
    out += '<form id="checkout" novalidate>' + field('name', 'Name', 'text', 1, 'name') + field('phone', 'Phone', 'tel', 1, 'tel') + field('email', 'Email for your confirmation', 'email', 1, 'email');
    if (S.method === 'delivery') out += field('address', 'Delivery address', 'text', 1, 'street-address');
    if (S.method === 'curbside') out += field('vehicle', 'Vehicle make, model and colour', 'text', 1);
    if (c.notes) out += '<label class="f">Notes for us<textarea name="notes" maxlength="500">' + h(S.f.notes) + '</textarea></label>';
    if (c.tips) out += '<div><div class="mnote" style="margin-bottom:6px">Add a tip</div><div class="oseg" role="group" aria-label="Tip">' + [0, 10, 15, 20].map(function (t) { return '<button type="button" data-tip="' + t + '" aria-pressed="' + (S.tip === t) + '">' + (t ? t + '%' : 'None') + '</button>'; }).join('') + '</div></div>';
    out += '<div class="tot"><span>Subtotal</span><span>' + fmt(sub) + '</span>' + (tax ? '<span>Tax</span><span>' + fmt(tax) + '</span>' : '') + (fee ? '<span>Delivery</span><span>' + fmt(fee) + '</span>' : '') + (tip ? '<span>Tip</span><span>' + fmt(tip) + '</span>' : '') + '<span class="g">Total</span><span class="g">' + fmt(total) + '</span></div>';
    var short = S.method === 'delivery' && sub < c.min;
    if (short) out += '<p class="mnote">Delivery orders start at ' + fmt(c.min) + '. Add ' + fmt(c.min - sub) + ' more.</p>';
    if (S.err) out += '<p class="oerr" role="alert">' + h(S.err) + '</p>';
    out += '<button class="btn" type="submit"' + (short || !c.open || S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Placing order…' : c.open ? 'Place order · ' + fmt(total) : 'Ordering is paused') + '</button><p class="note">' + h(c.pay) + '</p></form>';
    var a = d.activeElement, an = a && a.form && a.form.id === 'checkout' ? a.name : '';
    el.innerHTML = out;
    if (an) { var n = el.querySelector('[name="' + an + '"]'); if (n) { n.focus(); try { n.setSelectionRange(n.value.length, n.value.length); } catch (e) {} } }
  }
  d.addEventListener('click', function (e) {
    var c = conf(); if (!c) return;
    var t = e.target.closest('[data-add],[data-qty],[data-method],[data-tip]'); if (!t) return;
    if (t.dataset.add) { var it = c.items[t.dataset.add]; if (it) S.cart[t.dataset.add] = Math.min((S.cart[t.dataset.add] || 0) + 1, it.max); }
    if (t.dataset.qty) { var id = t.dataset.id, q = (S.cart[id] || 0) + Number(t.dataset.qty); if (q <= 0) delete S.cart[id]; else S.cart[id] = Math.min(q, c.items[id] ? c.items[id].max : q); }
    if (t.dataset.method) S.method = t.dataset.method;
    if (t.dataset.tip) S.tip = Number(t.dataset.tip);
    S.err = ''; keep(c); draw();
    if (t.dataset.add) { var o = t.textContent; t.textContent = 'Added'; setTimeout(function () { t.textContent = o; }, 900); }
  });
  d.addEventListener('input', function (e) { var c = conf(); if (c && e.target.form && e.target.form.id === 'checkout') { S.f[e.target.name] = e.target.value; keep(c); } });
  d.addEventListener('submit', function (e) {
    if (e.target.id !== 'checkout') return; e.preventDefault();
    var c = conf(), f = e.target; if (!c || S.busy) return;
    var bad = [].filter.call(f.querySelectorAll('[required]'), function (i) { return !i.value.trim(); })[0];
    if (bad) { S.err = 'Please fill in every field so we can get your order to you.'; draw(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(S.f.email || '')) { S.err = 'Enter a valid email address for your confirmation.'; draw(); return; }
    if (P) { S.err = 'This is a preview. Orders can be placed once your site is published.'; draw(); return; }
    S.busy = true; S.err = ''; draw();
    var body = { items: lines(c).map(function (l) { return { id: l.id, qty: l.qty }; }), method: S.method, tip: S.tip, name: S.f.name, phone: S.f.phone, email: S.f.email, address: S.f.address, vehicle: S.f.vehicle, notes: S.f.notes };
    fetch(c.post, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'x'); return j; }); })
      .then(function (j) { S.cart = {}; keep(c); location.href = j.url; })
      .catch(function (x) { S.busy = false; S.err = x.message && x.message !== 'x' ? x.message : 'We could not place your order. Please try again or call us.'; draw(); });
  });
  window.pfOrderInit = function () { var c = conf(); if (c) { if (!S.loaded) { load(c); S.loaded = 1; } draw(); } };
  window.pfOrderInit();
}
export const ORDER_JS = `(${orderClient.toString()})();`;

const tile = (x, { ordering, preview, button }) => {
  const out = x.available === false || x.stock === 0;
  const src = safeImg(x.image);
  return `<article class="tile mi${out ? ' off' : ''}"><div><div class="tl"><h3>${esc(x.name)}</h3><span class="price">${money(x.price)}</span></div>${x.desc ? `<p>${esc(x.desc)}</p>` : ''}${button ? `<div class="act">${out ? '<span class="soldout">Sold out</span>' : `<button class="add" type="button" data-add="${esc(x.id)}"${ordering ? '' : ' disabled'}>Add</button>`}${!out && x.stock != null && x.stock <= 5 ? `<span class="soldout">Only ${x.stock} left</span>` : ''}</div>` : out ? '<div class="act"><span class="soldout">Sold out</span></div>' : ''}</div>${src ? `<div class="pic"><img src="${esc(src)}" alt="${esc(x.name)}" loading="lazy" decoding="async"></div>` : ''}</article>`;
};

export function groupMenu(menu) {
  const cats = [];
  for (const it of arr(menu)) {
    const name = str(it.category, 60) || 'Menu';
    let c = cats.find((x) => x.name === name);
    if (!c) cats.push((c = { name, id: `cat-${cats.length + 1}`, items: [] }));
    c.items.push(it);
  }
  return cats;
}

/** The menu shown as a section on the home page. */
export function menuSection(d, { menu, ordering, preview, orderHref }) {
  const cats = groupMenu(menu);
  if (!cats.length) return preview ? `<div class="wrap">${d.title ? `<div class="sec-head"><h2>${esc(d.title)}</h2></div>` : ''}<div class="empty">Your menu items appear here. Upload your item list in the Menu tab.</div></div>` : '';
  const strip = (x) => (d.showPhotos === false ? { ...x, image: '' } : x);
  return `<div class="wrap">${d.title || d.subtitle ? `<div class="sec-head">${d.title ? `<h2>${esc(d.title)}</h2>` : ''}${d.subtitle ? `<p>${esc(d.subtitle)}</p>` : ''}</div>` : ''}${cats.map((c) => `<div class="cat" style="padding-top:${cats.length > 1 ? 28 : 0}px">${cats.length > 1 ? `<h2 style="font-size:24px;margin-bottom:16px">${esc(c.name)}</h2>` : ''}<div class="tiles">${c.items.map((x) => tile(strip(x), { preview })).join('')}</div></div>`).join('')}${ordering?.enabled ? `<div class="actions" style="justify-content:center;margin-top:44px"><a class="btn" ${orderHref}>Order online</a></div>` : ''}</div>`;
}

export function orderPage({ menu, ordering, base, preview, siteKey, payNote }) {
  const o = ordering;
  const methods = openMethods(o);
  const open = o.accepting && methods.length > 0;
  const cats = groupMenu(menu);
  const items = {};
  for (const it of arr(menu)) if (it.available !== false && it.stock !== 0) items[it.id] = { n: it.name, p: it.price, max: it.stock == null ? 50 : Math.min(50, it.stock) };
  const conf = {
    key: siteKey, post: `${base}/_order`, open, items, methods, names: Object.fromEntries(Object.entries(ORDER_METHODS).map(([k, v]) => [k, v.name])),
    tax: o.taxRate, fee: o.deliveryFee, min: o.deliveryMin, tips: o.tips, notes: o.allowNotes, prep: o.prepMinutes, dmin: o.deliveryMinutes,
    pickupNote: o.pickupNote, curbsideNote: o.curbsideNote, area: o.deliveryArea, pay: payNote,
  };
  const ways = methods.map((m) => ORDER_METHODS[m].name.toLowerCase());
  const lede = ways.length ? `Order ahead for ${ways.length > 1 ? `${ways.slice(0, -1).join(', ')} or ${ways.at(-1)}` : ways[0]}.${o.prepMinutes ? ` Most orders are ready in about ${o.prepMinutes} minutes.` : ''}` : '';
  const body = cats.length
    ? `${cats.length > 1 ? `<nav class="cats" aria-label="Menu categories">${cats.map((c) => `<a href="#${c.id}">${esc(c.name)}</a>`).join('')}</nav>` : ''}${cats.map((c) => `<div class="cat" id="${c.id}"><h2>${esc(c.name)}</h2><div class="tiles">${c.items.map((x) => tile(x, { ordering: open, preview, button: true })).join('')}</div></div>`).join('')}`
    : `<div class="empty">${preview ? 'Your menu is empty. Upload your item list in the Menu tab.' : 'Our menu is being updated. Please check back soon.'}</div>`;
  return `<section class="order"><div class="wrap"><header class="ord-head"><h1>Order online</h1>${lede ? `<p>${esc(lede)}</p>` : ''}${open ? '' : '<p class="closed">We are not taking online orders right now. Please check back soon or give us a call.</p>'}</header>
<div class="ord-grid"><div class="ord-menu">${body}</div><aside class="cart" id="cart" aria-live="polite"></aside></div></div><a class="cartbar" id="cartbar" href="#cart" hidden></a></section>
<script type="application/json" id="pf-order">${JSON.stringify(conf).replace(/</g, '\\u003c')}</script>`;
}

export function orderStatusPage({ order, payUrl, phoneHtml, homeHref }) {
  const steps = ['new', 'confirmed', 'ready', 'completed'];
  const at = steps.indexOf(order.status);
  const cancelled = order.status === 'cancelled';
  const label = (s) => (s === 'ready' ? readyLabel(order.method) : ORDER_STATUSES[s]);
  const headline = cancelled ? 'This order was cancelled.' : { new: 'We have your order.', confirmed: 'Your order is confirmed.', ready: order.method === 'delivery' ? 'Your order is on its way.' : 'Your order is ready.', completed: 'Thank you. Enjoy!' }[order.status];
  const sub = cancelled ? 'If this is a surprise, please get in touch with us.' : order.status === 'new' ? `Thanks, ${order.name.split(' ')[0]}. We sent a confirmation to ${order.email} and will update this page as your order moves along.` : 'This page updates automatically.';
  const lines = arr(order.items).map((l) => `<div class="line"><b>${l.qty} × ${esc(l.name)}</b><span>${money(l.price * l.qty)}</span></div>`).join('');
  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '');
  return `<section class="ostat"><div class="wrap"><p class="eyebrow">Order #${esc(order.number)}</p><h1>${esc(headline)}</h1><p class="lede">${esc(sub)}</p>
${cancelled ? '' : `<div class="track" role="img" aria-label="Order progress: ${esc(label(order.status))}">${steps.map((s, i) => `<i class="${i <= at ? 'on' : ''}"></i>`).join('')}</div><div class="trackl">${steps.map((s, i) => (i === at ? `<b>${esc(label(s))}</b>` : `<span>${esc(label(s))}</span>`)).join('')}</div>`}
<div class="box"><h2>${esc(ORDER_METHODS[order.method]?.name || 'Order')} details</h2><dl class="kv">${row('Name', order.name)}${row('Phone', order.phone)}${row('Deliver to', order.address)}${row('Vehicle', order.vehicle)}${row('Notes', order.notes)}</dl></div>
<div class="box"><h2>Your items</h2>${lines}<div class="tot"><span>Subtotal</span><span>${money(order.subtotal)}</span>${order.tax ? `<span>Tax</span><span>${money(order.tax)}</span>` : ''}${order.fee ? `<span>Delivery</span><span>${money(order.fee)}</span>` : ''}${order.tip ? `<span>Tip</span><span>${money(order.tip)}</span>` : ''}<span class="g">Total</span><span class="g">${money(order.total)}</span></div>
${payUrl && !cancelled ? `<div class="actions" style="margin-top:8px"><a class="btn" href="${esc(payUrl)}" target="_blank" rel="noopener">Pay online</a></div><p class="note">Or pay when you receive your order.</p>` : '<p class="note">Payment is collected when you receive your order.</p>'}</div>
<div class="actions">${phoneHtml}<a class="btn ghost" ${homeHref}>Back to home</a></div></div></section>`;
}
