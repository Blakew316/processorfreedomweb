// The order page and order status page of a published site, plus the small script that runs the cart.

import { esc, str, arr, safeImg, money, ORDER_METHODS, readyLabel, openMethods, strings, fill, isOpenNow, orderSlots, slotLabel, itemPrice } from './core.js';

export const ORDER_CSS = `
.order,.ostat{padding:72px 0 104px}
.ord-head h1{font-size:clamp(38px,5.4vw,60px);letter-spacing:-.03em}
.ord-head p{color:var(--muted);font-size:19px;margin-top:12px}
.closed{background:var(--bg2);border-radius:var(--r-sm);padding:16px 20px;margin-top:24px;font-size:16px}
.ord-grid{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:48px;align-items:start;margin-top:40px}
.cats{display:flex;gap:8px;overflow-x:auto;padding:10px 0;position:sticky;top:var(--head-h,56px);background:var(--bg);z-index:5;scrollbar-width:none;border-bottom:1px solid var(--line)}
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
.cart{position:sticky;top:calc(var(--head-h,56px) + 20px);background:var(--bg2);border-radius:var(--r);padding:26px;display:grid;gap:18px;max-height:calc(100vh - var(--head-h,56px) - 40px);overflow:auto}
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
#checkout{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
.cart{grid-template-columns:minmax(0,1fr)}
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
.tile .price s{color:var(--muted);font-weight:400;margin-right:4px}
.lopt{grid-column:1/-1;color:var(--muted);font-size:13px;margin-top:-2px}
.cart select{font:inherit;font-size:16px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:var(--r-sm);padding:11px 13px;width:100%}
.prow{display:flex;gap:8px}
.prow input{flex:1;min-width:0;font:inherit;font-size:16px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 13px;text-transform:uppercase}
.prow button{font:inherit;font-size:14px;font-weight:600;border:1px solid var(--line);background:var(--bg);color:var(--accent);border-radius:var(--r-sm);padding:0 16px;cursor:pointer}
.osheet{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.4);display:grid;place-items:center;padding:16px}
.osheet>div{background:var(--bg);color:var(--ink);border-radius:var(--r);width:100%;max-width:460px;max-height:88vh;overflow:auto;padding:28px;display:grid;gap:18px}
.osheet h2{font-size:24px}
.osheet fieldset{border:0;padding:0;margin:0;display:grid;gap:2px}
.osheet legend{font-weight:600;font-size:16px;padding:0;margin-bottom:6px}
.osheet legend span{font-weight:400;color:var(--muted);font-size:13px;margin-left:8px}
.osheet label{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);font-size:16px;cursor:pointer}
.osheet label input{width:20px;height:20px;accent-color:var(--accent);flex:none}
.osheet label em{margin-left:auto;font-style:normal;color:var(--muted);font-variant-numeric:tabular-nums}
.osheet .acts{display:flex;gap:10px}
.osheet .acts .btn{flex:1}
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

/* Refinements */
.ord-head h1{font-size:clamp(40px,5.6vw,64px);letter-spacing:-.035em;line-height:1.04}
.ord-head p{font-size:20px;max-width:640px}
.closed{border-radius:var(--r-sm);padding:16px 20px;font-weight:500}
.cats{background:var(--glass);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);padding:12px 0;gap:8px}
.cats a{padding:8px 17px;font-size:15px;transition:background .2s,color .2s}
.cats a:hover{background:var(--ink);color:var(--bg);opacity:1}
.cat h2{font-size:28px;letter-spacing:-.025em}
.ord-menu .tiles{gap:14px}
.ord-menu .tile{border:0;background:var(--bg2);border-radius:var(--r);padding:22px;gap:22px;transition:transform .3s cubic-bezier(.25,.1,.25,1),box-shadow .3s}
.ord-menu .tile:not(.off):hover{transform:translateY(-2px);box-shadow:0 18px 40px -26px rgba(0,0,0,.35)}
.ord-menu .tile h3{font-size:19px;letter-spacing:-.02em}
.ord-menu .tile p{font-size:15px;line-height:1.45;-webkit-line-clamp:2}
.ord-menu .tile .price{font-size:17px}
.ord-menu .tile .pic{width:128px;height:108px;border-radius:calc(var(--r-sm) + 2px);background:var(--bg)}
.add{border:0;background:var(--bg);color:var(--ink);padding:9px 22px;font-size:15px;box-shadow:0 0 0 1px var(--line),0 1px 2px rgba(0,0,0,.05);transition:background .2s,color .2s,transform .2s cubic-bezier(.34,1.56,.64,1)}
.add:hover{background:var(--accent);color:var(--on-accent);box-shadow:none}
.add:active{transform:scale(.94)}
.cart{background:var(--bg);box-shadow:0 0 0 1px var(--line),0 30px 70px -36px rgba(0,0,0,.4);border-radius:calc(var(--r) + 4px);padding:28px;gap:20px}
.cart h2{font-size:24px;letter-spacing:-.025em}
.cart .f{font-size:13px;color:var(--muted);font-weight:500;gap:6px}
.cart .f input,.cart .f textarea,.cart select,.prow input{background:var(--bg2);border-color:transparent;color:var(--ink);border-radius:12px;padding:13px 14px;font-size:16px;transition:background .2s,box-shadow .2s,border-color .2s}
.cart .f input:focus,.cart .f textarea:focus,.cart select:focus,.prow input:focus{outline:0;background:var(--bg);border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 16%,transparent)}
.cart select{appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='7'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23888' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;padding-right:36px}
.prow button{border:0;background:var(--bg2);color:var(--ink);border-radius:12px;padding:0 18px}
.oseg{background:var(--bg2);border:0;border-radius:12px;padding:3px}
.oseg button{border-radius:9px;padding:9px 6px;font-size:15px;transition:background .25s,box-shadow .25s}
.oseg button[aria-pressed=true]{background:var(--bg);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.14),0 0 0 .500px rgba(0,0,0,.05)}
.line{padding-bottom:16px;font-size:16px}
.line b{letter-spacing:-.01em}
.step{background:var(--bg2);border:0}
.step button{width:32px;height:32px}
.tot{font-size:15px;gap:8px 12px;padding-top:4px}
.tot .g{font-size:20px;letter-spacing:-.02em;padding-top:12px}
.cart .btn{padding:17px 24px;font-size:17px;font-weight:600;border-radius:max(var(--r-btn),14px)}
.osheet{background:rgba(0,0,0,.32);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);animation:ofade .25s ease}
.osheet>div{border-radius:calc(var(--r) + 6px);padding:32px;box-shadow:0 40px 100px -20px rgba(0,0,0,.45);animation:orise .4s cubic-bezier(.25,.1,.25,1)}
.osheet h2{font-size:28px;letter-spacing:-.03em}
.osheet label{padding:14px 0;font-size:17px}
.osheet label input{width:22px;height:22px}
.osheet .acts .btn{padding:15px 20px}
@keyframes ofade{from{opacity:0}}
@keyframes orise{from{opacity:0;transform:translateY(24px) scale(.98)}}
.track{gap:6px;margin:48px 0 14px}
.track i{height:6px;border-radius:6px;transition:background .6s}
.box{border-radius:calc(var(--r) + 2px);padding:30px}
.stamps{display:flex;flex-wrap:wrap;gap:8px}
.stamps i{width:26px;height:26px;border-radius:50%;box-shadow:inset 0 0 0 1.500px var(--line)}
.stamps i.on{background:var(--accent);box-shadow:none}
.cartbar{-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);padding:16px 24px;font-size:16px}
@media (max-width:860px){
  .osheet{place-items:end center;padding:0}
  .osheet>div{max-width:none;border-radius:28px 28px 0 0;padding:28px 22px calc(22px + env(safe-area-inset-bottom));max-height:86vh;animation:osheet .45s cubic-bezier(.25,.1,.25,1)}
  .ord-menu .tile{padding:18px;gap:14px}
  .ord-menu .tile .pic{width:96px;height:84px}
  .cart{padding:22px}
}
@keyframes osheet{from{transform:translateY(100%)}}
.msearch{position:relative;margin-bottom:6px}
.msearch input{width:100%;font:inherit;font-size:16px;color:var(--ink);background:var(--bg2);border:1px solid transparent;border-radius:14px;padding:13px 16px 13px 44px;transition:background .2s,box-shadow .2s,border-color .2s;-webkit-appearance:none;appearance:none}
.msearch input:focus{outline:0;background:var(--bg);border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 16%,transparent)}
.msearch svg{position:absolute;left:15px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}
[hidden].tile,[hidden].cat,[hidden].cats,.nomatch[hidden]{display:none!important}
.nomatch{color:var(--muted);padding:32px 0;font-size:17px}
.dealtag{font-size:13px;font-weight:600;color:var(--accent)}
.add.ok{background:var(--accent);color:var(--on-accent);box-shadow:none}
.pf-fly{position:fixed;z-index:80;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:var(--accent);pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.25)}
.bump{animation:obump .45s cubic-bezier(.34,1.56,.64,1)}
@keyframes obump{40%{transform:scale(1.045)}}
.line{animation:oline .3s ease}
@keyframes oline{from{opacity:0;transform:translateY(6px)}}
@media (prefers-reduced-motion:reduce){.bump,.line{animation:none}}
/* Same family as the back office: white cards with a hairline border, pill controls. */
.ord-menu .tile{background:var(--bg);box-shadow:inset 0 0 0 1px var(--line);border-radius:16px}
.ord-menu .tile:not(.off):hover{box-shadow:inset 0 0 0 1px var(--line),0 14px 30px -22px rgba(0,0,0,.35)}
.ord-menu .tile .pic{background:var(--bg2)}
.cats a{background:var(--bg);box-shadow:inset 0 0 0 1px var(--line)}
.cats a[aria-current]{box-shadow:none}
.msearch input{background:var(--bg);border-color:var(--line);border-radius:980px}
.add{background:var(--bg2);box-shadow:none}
.cart-h{display:flex;align-items:center;justify-content:space-between;gap:12px}
.cart-x,.cart-scrim{display:none}
.cats a[aria-current]{background:var(--ink);color:var(--bg)}

/* Phones: the menu fills the screen and the order slides up from the bottom, like an app. */
@media (max-width:860px){
  .order{padding:28px 0 calc(110px + env(safe-area-inset-bottom))}
  .ord-head h1{font-size:34px}
  .ord-head p{font-size:17px;margin-top:8px}
  .ord-grid{margin-top:22px;gap:0}
  .msearch input{font-size:16px}
  .cats{top:var(--head-h,56px);margin:0 -20px;padding:10px 20px;gap:8px;scroll-padding:0 20px}
  .cats a{padding:9px 16px;font-size:15px}
  .cat{padding-top:28px;scroll-margin-top:calc(var(--head-h,56px) + 64px)}
  .cat h2{font-size:24px;margin-bottom:12px}
  .ord-menu .tiles{gap:10px}
  .ord-menu .tile{padding:16px;gap:14px;border-radius:20px}
  .ord-menu .tile:not(.off):hover{transform:none;box-shadow:none}
  .ord-menu .tile h3{font-size:17px}
  .ord-menu .tile .price{font-size:16px}
  .ord-menu .tile .pic{width:92px;height:92px;border-radius:14px}
  .tile .act{margin-top:12px}
  .add{padding:10px 22px;min-height:40px}
  .cartbar{left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:calc(12px + env(safe-area-inset-bottom));padding:17px 24px;font-size:17px;border-radius:980px;box-shadow:0 18px 40px -12px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.18);cursor:pointer;-webkit-tap-highlight-color:transparent}
  .cart-open .cartbar{display:none}
  .cart-scrim{display:block;position:fixed;inset:0;z-index:49;background:rgba(0,0,0,.36);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);opacity:0;pointer-events:none;transition:opacity .3s ease}
  .cart-open .cart-scrim{opacity:1;pointer-events:auto}
  .cart{position:fixed;left:0;right:0;bottom:0;top:auto;z-index:50;max-height:calc(100vh - 36px);max-height:calc(100dvh - 36px - env(safe-area-inset-top));overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;
    border-radius:30px 30px 0 0;padding:10px 20px calc(22px + env(safe-area-inset-bottom));gap:18px;box-shadow:0 -20px 60px -20px rgba(0,0,0,.45);
    transform:translateY(104%);visibility:hidden;transition:transform .42s cubic-bezier(.25,.1,.25,1),visibility 0s linear .42s}
  .cart-open .cart{transform:none;visibility:visible;transition:transform .42s cubic-bezier(.25,.1,.25,1),visibility 0s}
  .cart::before{content:"";justify-self:center;width:38px;height:5px;border-radius:5px;background:var(--line);margin-bottom:-4px}
  .cart-x{display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:50%;background:var(--bg2);color:var(--ink);font:inherit;font-size:22px;line-height:1;cursor:pointer}
  .cart .btn[type=submit]{position:sticky;bottom:0;box-shadow:0 -14px 18px 6px var(--bg)}
  .cart-open,.cart-open body{overflow:hidden}
  .osheet>div{padding-bottom:calc(22px + env(safe-area-inset-bottom))}
  .ostat{padding:36px 0 calc(64px + env(safe-area-inset-bottom))}
  .ostat .actions{display:grid;gap:10px}
  .ostat .actions .btn{width:100%;text-align:center;justify-content:center}
  .box{padding:22px 20px;border-radius:22px}
  .trackl{font-size:12px}
  .kv{grid-template-columns:1fr;gap:2px 0}
  .kv dd{margin:0 0 10px}
}
@media (prefers-reduced-motion:reduce){.cart,.cart-scrim{transition:none!important}}
@media (prefers-reduced-motion:reduce){.osheet,.osheet>div{animation:none}}
`;

/* Runs in the visitor's browser. Written as a real function and embedded as text. */
function orderClient() {
  var d = document, P = d.documentElement.hasAttribute('data-preview');
  var fmt = function (c) { return '$' + (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var h = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var S = { lines: [], method: '', tip: 0, when: '', promo: null, perr: '', busy: false, err: '', f: {} };
  var conf = function () { var el = d.getElementById('pf-order'); try { return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; } };
  var key = function (c) { return 'pf-cart-' + c.key; };
  function load(c) { try { var v = JSON.parse(localStorage.getItem(key(c)) || '{}'); S.lines = Array.isArray(v.lines) ? v.lines : []; S.method = v.method || ''; S.f = v.f || {}; } catch (e) {} }
  function keep(c) { try { localStorage.setItem(key(c), JSON.stringify({ lines: S.lines, method: S.method, f: S.f })); } catch (e) {} }
  function price(it, o) { var p = it.p; (it.g || []).forEach(function (g, gi) { ((o || [])[gi] || []).forEach(function (ci) { if (g.c[ci]) p += g.c[ci][1]; }); }); return p; }
  // Groups with something to choose, in the order the owner arranged them; choices keep their positions.
  function shownGroups(it) { return (it.g || []).map(function (g, gi) { return gi; }).filter(function (gi) { return it.g[gi].c.some(Boolean); }).sort(function (a, b) { return ((it.g[a].k == null ? -1 : it.g[a].k) - (it.g[b].k == null ? -1 : it.g[b].k)) || a - b; }); }
  function labels(it, o) { var out = []; (it.g || []).forEach(function (g, gi) { ((o || [])[gi] || []).forEach(function (ci) { if (g.c[ci]) out.push(g.c[ci][0]); }); }); return out.join(', '); }
  function lines(c) { return S.lines.filter(function (l) { return c.items[l.id] && l.q > 0; }).map(function (l, i) { var it = c.items[l.id]; return { i: i, id: l.id, o: l.o || [], name: it.n, opt: labels(it, l.o), price: price(it, l.o), qty: Math.min(l.q, it.max), tx: it.t !== 0 }; }); }
  function inCart(id) { return S.lines.reduce(function (a, l) { return a + (l.id === id ? l.q : 0); }, 0); }
  function put(c, id, o) { var k = JSON.stringify(o || []), it = c.items[id]; if (!it || inCart(id) >= it.max) return false; var hit = S.lines.filter(function (l) { return l.id === id && JSON.stringify(l.o || []) === k; })[0]; if (hit) hit.q += 1; else S.lines.push({ id: id, o: o || [], q: 1 }); return true; }
  function field(name, label, type, req, ac) { return '<label class="f">' + h(label) + '<input name="' + name + '" type="' + (type || 'text') + '"' + (req ? ' required' : '') + (ac ? ' autocomplete="' + ac + '"' : '') + ' maxlength="200" value="' + h(S.f[name]) + '"></label>'; }
  function slots(c) { return c.slots[S.method === 'delivery' ? 'delivery' : 'pickup'] || []; }
  function draw() {
    var c = conf(), el = d.getElementById('cart'); if (!c || !el) return;
    var T = c.T;
    if (c.methods.indexOf(S.method) < 0) S.method = c.methods[0] || '';
    var cut = false, used = {};
    S.lines.forEach(function (l) { var it = c.items[l.id]; if (!it) return; var room = it.max - (used[l.id] || 0); if (l.q > room) { l.q = Math.max(0, room); cut = true; } used[l.id] = (used[l.id] || 0) + l.q; });
    S.lines = S.lines.filter(function (l) { return c.items[l.id] && l.q > 0; });
    if (cut) keep(c);
    var sl = slots(c), can = c.open && (c.asap || sl.length > 0);
    if (S.when && !sl.some(function (x) { return x[0] === S.when; })) S.when = '';
    if (!c.asap && !S.when && sl.length) S.when = sl[0][0];
    var L = lines(c), sub = L.reduce(function (s, l) { return s + l.price * l.qty; }, 0), count = L.reduce(function (s, l) { return s + l.qty; }, 0);
    // A gift card is not money off: it pays after tax, tip and delivery, up to its balance.
    var giftOn = !!(S.promo && S.promo.type === 'gift');
    var disc = !S.promo || giftOn ? 0 : S.promo.type === 'amount' ? Math.min(sub, S.promo.value) : Math.round(sub * S.promo.value / 100);
    var zone = c.zones && S.method === 'delivery' ? c.zones.filter(function (z) { return z[0].indexOf(((S.f.zip || '').match(/\d{5}/) || [''])[0]) >= 0; })[0] : null;
    var txs = L.reduce(function (s, l) { return s + (l.tx ? l.price * l.qty : 0); }, 0);
    var tax = sub ? Math.round((txs - disc * txs / sub) * c.tax / 100) : 0, fee = S.method !== 'delivery' ? 0 : zone ? zone[1] : c.zones ? 0 : c.fee, tip = c.tips ? Math.round(sub * S.tip / 100) : 0, total = sub - disc + tax + fee + tip;
    var gift = giftOn ? Math.min(S.promo.value, total) : 0, due = total - gift; S.total = total;
    var bar = d.getElementById('cartbar'); if (bar) { bar.hidden = !count; bar.innerHTML = '<span>' + h(T.viewOrder) + ' · ' + count + ' ' + h(count === 1 ? T.item : T.items) + '</span><span>' + fmt(due) + '</span>'; }
    var out = '<div class="cart-h"><h2>' + h(T.yourOrder) + '</h2><button type="button" class="cart-x" data-cart-close="1" aria-label="' + h(T.close) + '">×</button></div>';
    if (!L.length) { d.documentElement.classList.remove('cart-open'); el.innerHTML = out + '<p class="none">' + h(can ? T.emptyCart : c.open ? (c.busy ? T.busyNow : T.closedNow) : T.paused) + '</p>'; return; }
    out += L.map(function (l) { return '<div class="line"><b>' + h(l.name) + '</b><span>' + fmt(l.price * l.qty) + '</span>' + (l.opt ? '<span class="lopt">' + h(l.opt) + '</span>' : '') + '<div class="step"><button type="button" data-qty="-1" data-i="' + l.i + '" aria-label="−">−</button><span>' + l.qty + '</span><button type="button" data-qty="1" data-i="' + l.i + '" aria-label="+">+</button></div></div>'; }).join('');
    if (c.methods.length > 1) out += '<div class="oseg" role="group">' + c.methods.map(function (m) { return '<button type="button" data-method="' + m + '" aria-pressed="' + (S.method === m) + '">' + h(c.names[m]) + '</button>'; }).join('') + '</div>';
    var about = function (n) { return n ? ' ' + T.inAbout.replace('{n}', n) : ''; };
    var note = { pickup: c.names.pickup + about(c.prep) + '. ' + c.pickupNote, curbside: c.names.curbside + about(c.prep) + '. ' + c.curbsideNote, delivery: c.names.delivery + about(c.dmin) + '. ' + c.area }[S.method] || '';
    out += '<p class="mnote">' + h(note) + '</p>';
    out += '<form id="checkout" novalidate>';
    if (sl.length) out += '<label class="f">' + h(T.when) + '<select name="when">' + (c.asap ? '<option value="">' + h(T.asap) + '</option>' : '') + sl.map(function (x) { return '<option value="' + x[0] + '"' + (S.when === x[0] ? ' selected' : '') + '>' + h(x[1]) + '</option>'; }).join('') + '</select></label>';
    out += field('name', T.name, 'text', 1, 'name') + field('phone', T.phone, 'tel', 1, 'tel') + field('email', c.mail ? T.emailConfirm : T.email, 'email', 1, 'email');
    if (S.method === 'delivery') out += field('address', T.address, 'text', 1, 'street-address') + (c.zones ? field('zip', T.zip, 'text', 1, 'postal-code') + ((S.f.zip || '').replace(/\D/g, '').length >= 5 && !zone ? '<p class="oerr">' + h(T.noDelivery) + '</p>' : '') : '');
    if (S.method === 'curbside') out += field('vehicle', T.vehicle, 'text', 1);
    if (c.notes) out += '<label class="f">' + h(T.notes) + '<textarea name="notes" maxlength="500">' + h(S.f.notes) + '</textarea></label>';
    if (c.promos) out += '<div><div class="mnote" style="margin-bottom:6px">' + h(T.promo) + '</div><div class="prow"><input name="promo" maxlength="24" autocomplete="off" value="' + h(S.promo ? S.promo.code : S.f.promo) + '"><button type="button" data-promo="1">' + h(T.apply) + '</button></div>' + (S.perr ? '<p class="oerr" style="margin-top:6px">' + h(S.perr) + '</p>' : '') + '</div>';
    if (c.tips) out += '<div><div class="mnote" style="margin-bottom:6px">' + h(T.tip) + '</div><div class="oseg" role="group">' + [0, 10, 15, 20].map(function (t) { return '<button type="button" data-tip="' + t + '" aria-pressed="' + (S.tip === t) + '">' + (t ? t + '%' : h(T.none)) + '</button>'; }).join('') + '</div></div>';
    out += '<div class="tot"><span>' + h(T.subtotal) + '</span><span>' + fmt(sub) + '</span>' + (disc ? '<span>' + h(T.discount) + ' (' + h(S.promo.code) + ')</span><span>−' + fmt(disc) + '</span>' : '') + (tax ? '<span>' + h(T.tax) + '</span><span>' + fmt(tax) + '</span>' : '') + (fee ? '<span>' + h(T.delivery) + '</span><span>' + fmt(fee) + '</span>' : S.method === 'delivery' && c.zones && !zone ? '<span>' + h(T.delivery) + '</span><span>' + h(T.enterZip) + '</span>' : '') + (tip ? '<span>' + h(T.tipLine) + '</span><span>' + fmt(tip) + '</span>' : '') + '<span class="g">' + h(T.total) + '</span><span class="g">' + fmt(total) + '</span>' + (gift ? '<span>' + h(T.giftCard) + ' (' + h(S.promo.code) + ')</span><span>−' + fmt(gift) + '</span><span class="g">' + h(T.toPay) + '</span><span class="g">' + fmt(due) + '</span><span>' + h(T.giftLeft) + '</span><span>' + fmt(S.promo.value - gift) + '</span>' : '') + '</div>';
    var short = S.method === 'delivery' && (sub < c.min || (c.zones && (S.f.zip || '').replace(/\D/g, '').length >= 5 && !zone));
    if (S.method === 'delivery' && sub < c.min) out += '<p class="mnote">' + h(T.minOrder.replace('{a}', fmt(c.min)).replace('{b}', fmt(c.min - sub))) + '</p>';
    if (S.err) out += '<p class="oerr" role="alert">' + h(S.err) + '</p>';
    out += '<button class="btn" type="submit"' + (short || !can || S.busy ? ' disabled' : '') + '>' + h(S.busy ? T.placing : can ? T.place + ' · ' + fmt(due) : c.open ? (c.busy ? T.busyNow : T.closedNow) : T.pausedBtn) + '</button><p class="note">' + h(c.pay) + '</p></form>';
    var a = d.activeElement, an = a && a.form && a.form.id === 'checkout' ? a.name : '';
    el.innerHTML = out;
    if (an) { var n = el.querySelector('[name="' + an + '"]'); if (n) { n.focus(); try { n.setSelectionRange(n.value.length, n.value.length); } catch (e) {} } }
  }
  function choose(c, id, back) {
    var it = c.items[id], T = c.T, box = d.createElement('div'); box.className = 'osheet';
    box.innerHTML = '<div role="dialog" aria-modal="true" aria-labelledby="osheet-h"><h2 id="osheet-h">' + h(it.n) + '</h2><form>' + shownGroups(it).map(function (gi) { var g = it.g[gi]; return '<fieldset><legend>' + h(g.n) + '<span>' + h(g.r ? T.required : T.optional) + '</span></legend>' + (!g.r && !g.m ? '<label><input type="radio" name="g' + gi + '" value="-1" checked>' + h(T.noChoice) + '</label>' : '') + g.c.map(function (ch, ci) { if (!ch) return ''; var first = g.c.findIndex(function (x) { return x && !x[2]; }); return '<label' + (ch[2] ? ' class="out"' : '') + '><input type="' + (g.m ? 'checkbox' : 'radio') + '" name="g' + gi + '" value="' + ci + '"' + (g.r && !g.m && ci === first ? ' checked' : '') + (ch[2] ? ' disabled' : '') + '>' + h(ch[0]) + (ch[2] ? '<em>' + h(T.soldOut) + '</em>' : ch[1] ? '<em>+' + fmt(ch[1]) + '</em>' : '') + '</label>'; }).join('') + '</fieldset>'; }).join('') + '<p class="oerr" hidden></p><div class="acts"><button type="button" class="btn ghost" data-x="1">' + h(T.cancel) + '</button><button class="btn" type="submit">' + h(T.addToOrder) + '</button></div></form></div>';
    var stops = function () { return [].filter.call(box.querySelectorAll('input:not([disabled]),button:not([disabled])'), function (x) { if (x.type !== 'radio') return true; return x === (box.querySelector('input[name="' + x.name + '"]:checked:not([disabled])') || box.querySelector('input[name="' + x.name + '"]:not([disabled])')); }); };
    var onKey = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = stops(), i = f.indexOf(d.activeElement); if (!f.length) return;
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
    };
    var onFocus = function (e) { if (!box.contains(e.target)) { var f = stops(); if (f.length) f[0].focus(); } };
    var close = function () { box.remove(); d.removeEventListener('keydown', onKey, true); d.removeEventListener('focusin', onFocus, true); if (back && back.isConnected) back.focus(); };
    d.addEventListener('keydown', onKey, true); d.addEventListener('focusin', onFocus, true);
    box.addEventListener('click', function (e) { if (e.target === box || e.target.closest('[data-x]')) close(); });
    box.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault(); e.stopPropagation();
      var o = it.g.map(function (g, gi) { return [].map.call(e.target.querySelectorAll('[name=g' + gi + ']:checked'), function (i) { return Number(i.value); }).filter(function (n) { return n >= 0; }); });
      var miss = it.g.filter(function (g, gi) { return g.r && !o[gi].length; })[0];
      if (miss) { var p = e.target.querySelector('.oerr'); p.hidden = false; p.textContent = T.choose + ': ' + miss.n; return; }
      if (!put(c, id, o)) { var q = e.target.querySelector('.oerr'); q.hidden = false; q.textContent = T.upTo.replace('{n}', it.max); return; }
      keep(c); close(); draw();
    });
    d.body.appendChild(box);
    var first = box.querySelector('input:not([disabled]),button[type=submit]'); if (first) first.focus();
  }
  // On a phone the order is a sheet: the bar at the bottom opens it, the cross or a tap outside closes it.
  d.addEventListener('click', function (e) {
    if (e.target.closest('#cartbar')) { e.preventDefault(); d.documentElement.classList.add('cart-open'); var cart = d.getElementById('cart'); if (cart) cart.scrollTop = 0; return; }
    if (e.target.closest('[data-cart-close]') || e.target.classList.contains('cart-scrim')) d.documentElement.classList.remove('cart-open');
  });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape') d.documentElement.classList.remove('cart-open'); });
  // The category chips follow along as the menu scrolls.
  function spy() {
    // The cart and the category bar stick just under the header, whatever its height, or at the top when it does not stick.
    var head = d.querySelector('.hdr');
    var place = function () { d.documentElement.style.setProperty('--head-h', head && head.classList.contains('sticky') ? head.offsetHeight + 'px' : '0px'); };
    place(); if (!S.placed) { S.placed = 1; window.addEventListener('resize', place); }
    var nav = d.querySelector('.cats'); if (!nav || !('IntersectionObserver' in window)) return;
    var links = {}; [].forEach.call(nav.querySelectorAll('a'), function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        [].forEach.call(nav.querySelectorAll('[aria-current]'), function (a) { a.removeAttribute('aria-current'); });
        var a = links[en.target.id]; if (a) { a.setAttribute('aria-current', 'true'); nav.scrollTo({ left: a.offsetLeft - 20, behavior: 'smooth' }); }
      });
    }, { rootMargin: '-25% 0px -65% 0px' });
    [].forEach.call(d.querySelectorAll('.ord-menu .cat'), function (c2) { io.observe(c2); });
  }
  d.addEventListener('click', function (e) {
    var re = e.target.closest('[data-reorder]');
    if (re) { try { var r = JSON.parse(re.getAttribute('data-reorder')); var old = {}; try { old = JSON.parse(localStorage.getItem('pf-cart-' + r.key)) || {}; } catch (y) {} localStorage.setItem('pf-cart-' + r.key, JSON.stringify({ lines: r.lines, method: old.method, f: old.f || {} })); } catch (x) {} return; }
    var c = conf(); if (!c) return;
    var t = e.target.closest('[data-add],[data-qty],[data-method],[data-tip],[data-promo]'); if (!t) return;
    var full = false;
    if (t.dataset.add) { var it = c.items[t.dataset.add]; if (!it) return; if (shownGroups(it).length) { choose(c, t.dataset.add, t); return; } full = !put(c, t.dataset.add, []); }
    if (t.dataset.qty) { var l = S.lines[Number(t.dataset.i)], by = Number(t.dataset.qty); if (l && !(by > 0 && c.items[l.id] && inCart(l.id) >= c.items[l.id].max)) { l.q += by; if (l.q <= 0) S.lines.splice(Number(t.dataset.i), 1); } }
    if (t.dataset.method) S.method = t.dataset.method;
    if (t.dataset.tip) S.tip = Number(t.dataset.tip);
    if (t.dataset.promo) {
      var code = (S.f.promo || '').trim(); S.perr = ''; S.promo = null;
      if (!code) { draw(); return; }
      fetch(c.promoUrl + '?code=' + encodeURIComponent(code), { headers: { Accept: 'application/json' } }).then(function (r) { if (r.status === 429) throw { m: c.T.tooMany }; if (!r.ok) throw 0; return r.json(); }).then(function (j) { S.promo = j; draw(); }).catch(function (e) { S.perr = (e && e.m) || c.T.promoBad; draw(); });
      return;
    }
    S.err = ''; keep(c); draw();
    if (t.dataset.add) { if (!t.dataset.label) t.dataset.label = t.textContent; clearTimeout(t._pf); t.textContent = full ? c.T.maxN.replace('{n}', it.max) : c.T.added; t.classList.toggle('ok', !full); t._pf = setTimeout(function () { t.textContent = t.dataset.label; t.classList.remove('ok'); }, full ? 1600 : 900); if (!full) fly(t); }
  });
  // A small dot travels from the button to the cart, then the cart gives a soft bounce.
  function fly(from) {
    var bar = d.getElementById('cartbar'), to = bar && !bar.hidden && bar.offsetParent ? bar : d.querySelector('#cart h2') || d.getElementById('cart');
    var bump = function () { [bar, d.querySelector('#cart h2')].forEach(function (el) { if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } }); };
    if (!to || !from.animate || (window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches)) { bump(); return; }
    var a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), dot = d.createElement('i'); dot.className = 'pf-fly';
    var x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = Math.max(12, Math.min(innerWidth - 12, b.left + Math.min(b.width / 2, 60))), y1 = Math.max(12, Math.min(innerHeight - 12, b.top + b.height / 2));
    dot.style.left = x0 + 'px'; dot.style.top = y0 + 'px'; d.body.appendChild(dot);
    dot.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + (x1 - x0) * 0.5 + 'px,' + ((y1 - y0) * 0.5 - 60) + 'px) scale(1.15)', opacity: 1, offset: 0.5 }, { transform: 'translate(' + (x1 - x0) + 'px,' + (y1 - y0) + 'px) scale(.4)', opacity: 0.3 }], { duration: 520, easing: 'cubic-bezier(.3,.1,.3,1)' }).onfinish = function () { dot.remove(); bump(); };
  }
  d.addEventListener('input', function (e) {
    if (e.target.id !== 'pf-q') return;
    var q = e.target.value.trim().toLowerCase(), any = false;
    [].forEach.call(d.querySelectorAll('.ord-menu .cat'), function (cat) {
      var shown = 0;
      [].forEach.call(cat.querySelectorAll('.tile'), function (t) { var hit = !q || t.textContent.toLowerCase().indexOf(q) >= 0; t.hidden = !hit; if (hit) shown++; });
      cat.hidden = !shown; if (shown) any = true;
    });
    var nav = d.querySelector('.cats'); if (nav) nav.hidden = !!q;
    var nm = d.getElementById('pf-nomatch'); if (nm) nm.hidden = any;
  });
  d.addEventListener('input', function (e) { var c = conf(); if (c && e.target.form && e.target.form.id === 'checkout') { if (e.target.name === 'when') { S.when = e.target.value; return; } S.f[e.target.name] = e.target.value; keep(c); if (e.target.name === 'zip' && (e.target.value.replace(/\D/g, '').length >= 5 || e.target.value === '')) draw(); } });
  d.addEventListener('submit', function (e) {
    if (e.target.id !== 'checkout') return; e.preventDefault();
    var c = conf(), f = e.target; if (!c || S.busy) return;
    var bad = [].filter.call(f.querySelectorAll('[required]'), function (i) { return !i.value.trim(); })[0];
    if (bad) { S.err = c.T.fillAll; draw(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(S.f.email || '')) { S.err = c.mail ? c.T.badEmail : c.T.badEmailPlain; draw(); return; }
    if (P) { S.err = 'This is a preview. Orders can be placed once your site is published.'; draw(); return; }
    S.busy = true; S.err = ''; draw();
    var body = { items: lines(c).map(function (l) { return { id: l.id, qty: l.qty, opts: l.o }; }), method: S.method, tip: S.tip, when: S.when, promo: S.promo ? S.promo.code : '', expect: S.total, name: S.f.name, phone: S.f.phone, email: S.f.email, address: S.f.address, zip: S.f.zip, vehicle: S.f.vehicle, notes: S.f.notes };
    fetch(c.post, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var er = new Error(j.error || 'x'); er.code = j.code; er.srv = true; throw er; } return j; }); })
      .then(function (j) { S.lines = []; keep(c); location.href = j.url; })
      .catch(function (x) {
        // A price changed while the page was open: keep the cart and load the page again, so the new prices show before anything is sent.
        if (x.code === 'prices') { S.err = c.T.pricesChanged; draw(); keep(c); setTimeout(function () { location.reload(); }, 1800); return; }
        S.busy = false; S.err = x.srv && x.message && x.message !== 'x' ? x.message : c.T.failed; draw();
      });
  });
  window.pfOrderInit = function () { var c = conf(); if (c) { if (!S.loaded) { load(c); S.loaded = 1; } draw(); spy(); } };
  window.pfOrderInit();
}
export const ORDER_JS = `(${orderClient.toString()})();`;

const tile = (x, { ordering, button, T }) => {
  const out = x.available === false || x.stock === 0 || !!x.blocked;
  const src = safeImg(x.image);
  // The lowest price anyone can pay: the item plus the cheapest open choice in every required group.
  const extra = arr(x.options).reduce((sum, g) => { const open = g.choices.filter((c) => !c.hidden && !c.soldOut); return g.required && open.length ? sum + Math.min(...open.map((c) => c.price || 0)) : sum; }, 0);
  const from = extra > 0;
  return `<article class="tile mi${out ? ' off' : ''}"><div><div class="tl"><h3>${esc(x.name)}</h3><span class="price">${x.sale > 0 ? `<s>${money(x.price)}</s> ` : ''}${from ? esc(fill((T && T.from) || 'From {price}', { price: money(itemPrice(x) + extra) })) : money(itemPrice(x))}</span></div>${x.desc ? `<p>${esc(x.desc)}</p>` : ''}${button ? `<div class="act">${out ? `<span class="soldout">${esc(T.soldOut)}</span>` : `<button class="add" type="button" data-add="${esc(x.id)}"${ordering ? '' : ' disabled'}>${esc(T.add)}</button>`}${!out && x.deal ? `<span class="dealtag">${esc(x.deal)}</span>` : ''}${!out && x.stock != null && x.stock <= 5 ? `<span class="soldout">${esc(fill(x.stock === 1 && T.onlyOne ? T.onlyOne : T.onlyLeft, { n: x.stock }))}</span>` : ''}</div>` : out ? `<div class="act"><span class="soldout">${esc(T.soldOut)}</span></div>` : ''}</div>${src ? `<div class="pic"><img src="${esc(src)}" alt="${esc(x.name)}" loading="lazy" decoding="async"></div>` : ''}</article>`;
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
export function menuSection(d, { menu, ordering, preview, orderHref, lang }) {
  const T = strings(lang);
  const cats = groupMenu(menu);
  if (!cats.length) return preview ? `<div class="wrap">${d.title ? `<div class="sec-head"><h2>${esc(d.title)}</h2></div>` : ''}<div class="empty">Your menu items appear here. Upload your item list in the Menu tab.</div></div>` : '';
  const strip = (x) => (d.showPhotos === false ? { ...x, image: '' } : x);
  return `<div class="wrap">${d.title || d.subtitle ? `<div class="sec-head">${d.title ? `<h2>${esc(d.title)}</h2>` : ''}${d.subtitle ? `<p>${esc(d.subtitle)}</p>` : ''}</div>` : ''}${cats.map((c) => `<div class="cat" style="padding-top:${cats.length > 1 ? 28 : 0}px">${cats.length > 1 ? `<h2 style="font-size:24px;margin-bottom:16px">${esc(c.name)}</h2>` : ''}<div class="tiles">${c.items.map((x) => tile(strip(x), { T })).join('')}</div></div>`).join('')}${ordering?.enabled ? `<div class="actions" style="justify-content:center;margin-top:44px"><a class="btn" ${orderHref}>${esc(T.orderOnline)}</a></div>` : ''}</div>`;
}

export function orderPage({ menu, ordering, base, preview, siteKey, hasPayUrl, lang, now, taken, busy, codes, mailOn = true }) {
  const o = ordering;
  const T = strings(lang);
  const methods = openMethods(o);
  const open = o.accepting && methods.length > 0;
  const openNow = isOpenNow(o, now);
  const asap = openNow && !busy;
  const slot = (m) => orderSlots(o, m, now, taken).map((v) => [v, slotLabel(v, o, lang, now)]);
  const slots = { pickup: slot('pickup'), delivery: methods.includes('delivery') ? slot('delivery') : [] };
  const can = open && (asap || slots.pickup.length > 0 || slots.delivery.length > 0);
  const cats = groupMenu(menu);
  const items = {};
  for (const it of arr(menu)) if (it.available !== false && it.stock !== 0 && !it.blocked) items[it.id] = { n: it.name, p: itemPrice(it), max: it.stock == null ? 50 : Math.min(50, it.stock), t: it.taxable === false ? 0 : 1, g: arr(it.options).map((g) => ({ n: g.name, r: g.required ? 1 : 0, m: g.multi ? 1 : 0, k: g.rank ?? -1, c: g.choices.map((c) => (c.hidden ? 0 : [c.name, c.price, c.soldOut ? 1 : 0])) })) };
  const names = { pickup: T.pickup, curbside: T.curbside, delivery: T.delivery };
  const conf = {
    key: siteKey, post: `${base}/_order`, promoUrl: preview && !base ? `/preview/${siteKey}/_promo` : `${base}/_promo`, mail: !!mailOn, open, asap, busy: openNow && !!busy, slots, items, methods, names, T,
    tax: o.taxRate, fee: o.deliveryFee, min: o.deliveryMin, tips: o.tips, notes: o.allowNotes, prep: o.prepMinutes, dmin: o.deliveryMinutes, promos: arr(o.promos).some((x) => x.active) || !!codes,
    zones: arr(o.zones).length ? o.zones.map((z) => [z.zips, z.fee]) : null,
    pickupNote: o.pickupNote, curbsideNote: o.curbsideNote, area: o.deliveryArea, pay: hasPayUrl ? T.payEither : T.payLater,
  };
  const ways = methods.map((m) => names[m].toLowerCase());
  const lede = ways.length ? `${fill(T.orderAhead, { ways: ways.length > 1 ? `${ways.slice(0, -1).join(', ')} ${T.or} ${ways.at(-1)}` : ways[0] })}${o.prepMinutes ? ` ${fill(T.readyIn, { n: o.prepMinutes })}` : ''}` : '';
  const notice = !open ? T.notTaking : !asap ? (openNow ? (can ? T.busySchedule : T.busyNow) : can ? T.closedSchedule : T.closedNow) : '';
  const search = arr(menu).length > 5 ? `<div class="msearch"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.500-4.500"/></svg><input type="search" id="pf-q" placeholder="${esc(T.search)}" aria-label="${esc(T.search)}" autocomplete="off"></div><p class="nomatch" id="pf-nomatch" hidden>${esc(T.noMatch)}</p>` : '';
  const body = cats.length
    ? `${search}${cats.length > 1 ? `<nav class="cats" aria-label="${esc(T.menu)}">${cats.map((c) => `<a href="#${c.id}">${esc(c.name)}</a>`).join('')}</nav>` : ''}${cats.map((c) => `<div class="cat" id="${c.id}"><h2>${esc(c.name)}</h2><div class="tiles">${c.items.map((x) => tile(x, { ordering: can, button: true, T })).join('')}</div></div>`).join('')}`
    : `<div class="empty">${preview ? 'Your menu is empty. Upload your item list in the Menu tab.' : esc(T.menuSoon)}</div>`;
  return `<section class="order"><div class="wrap"><header class="ord-head"><h1>${esc(T.orderOnline)}</h1>${lede ? `<p>${esc(lede)}</p>` : ''}${notice ? `<p class="closed">${esc(notice)}</p>` : ''}</header>
<div class="ord-grid"><div class="ord-menu">${body}</div><aside class="cart" id="cart" aria-live="polite"></aside></div></div><div class="cart-scrim"></div><a class="cartbar" id="cartbar" href="#cart" role="button" hidden></a></section>
<script type="application/json" id="pf-order">${JSON.stringify(conf).replace(/</g, '\\u003c')}</script>`;
}

export function orderStatusPage({ order, ordering, payUrl, phoneHtml, homeHref, orderHref, siteKey, lang, loyalty, mailOn = true }) {
  const T = strings(lang);
  const steps = ['new', 'confirmed', 'ready', 'completed'];
  const at = steps.indexOf(order.status);
  const cancelled = order.status === 'cancelled';
  const label = (s) => (s === 'ready' ? readyLabel(order.method, lang) : { new: T.received, confirmed: T.confirmed, completed: T.completed }[s]);
  const headline = cancelled ? T.h_cancel : { new: T.h_new, confirmed: T.h_confirmed, ready: order.method === 'delivery' ? T.h_way : T.h_ready, completed: T.h_done }[order.status];
  const sub = cancelled ? T.s_cancel : order.status === 'new' ? fill(mailOn ? T.s_new : T.s_newQuiet, { name: order.name.split(' ')[0], email: order.email }) : T.s_live;
  const lines = arr(order.items).map((l) => `<div class="line"><b>${l.qty} × ${esc(l.name)}</b><span>${money(l.price * l.qty)}</span>${arr(l.opts).length ? `<span class="lopt">${esc(l.opts.join(', '))}</span>` : ''}</div>`).join('');
  const row = (k, v) => (v ? `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>` : '');
  const again = JSON.stringify({ key: siteKey, lines: arr(order.items).map((l) => ({ id: l.id, o: l.picks || [], q: l.qty })) });
  const methodName = { pickup: T.pickup, curbside: T.curbside, delivery: T.delivery }[order.method] || T.order;
  // What is still owed: the total less the gift card's part, unless it was paid at the counter or the order was cancelled.
  const paid = !!order.paidAt, refunded = order.refunded || 0, due = cancelled || paid ? 0 : order.total - (order.gift || 0);
  const tender = (m) => (lang === 'es' ? { Cash: 'Efectivo', Card: 'Tarjeta', 'Online payment': 'Pago en línea', Check: 'Cheque', 'Gift card': 'Tarjeta de regalo', 'Bank transfer': 'Transferencia', Other: 'Otro' }[m] : m) || m || '';
  return `<section class="ostat"><div class="wrap"><p class="eyebrow">${esc(T.order)} #${esc(order.number)}</p><h1>${esc(headline)}</h1><p class="lede">${esc(sub)}</p>
${cancelled ? '' : `<div class="track" role="img" aria-label="${esc(label(order.status))}">${steps.map((s, i) => `<i class="${i <= at ? 'on' : ''}"></i>`).join('')}</div><div class="trackl">${steps.map((s, i) => (i === at ? `<b>${esc(label(s))}</b>` : `<span>${esc(label(s))}</span>`)).join('')}</div>`}
<div class="box"><h2>${esc(methodName)} · ${esc(T.details)}</h2><dl class="kv">${row(T.scheduledFor, order.scheduled ? slotLabel(order.scheduled, ordering || {}, lang) : '')}${row(T.name, order.name)}${row(T.phone, order.phone)}${row(T.deliverTo, order.address)}${row(T.vehicleShort, order.vehicle)}${row(T.notesShort, order.notes)}</dl></div>
${loyalty && !cancelled ? `<div class="box">${loyalty.code ? `<h2>${esc(T.rewardEarned)}</h2><p style="font-size:17px">${esc(fill(T.rewardUse, { code: loyalty.code, value: loyalty.value }))}</p>` : ''}<div class="stamps" role="img" aria-label="${esc(fill(T.stamps, { n: loyalty.have, m: loyalty.every }))}">${Array.from({ length: loyalty.every }, (_, i) => `<i class="${i < loyalty.have ? 'on' : ''}"></i>`).join('')}</div><p class="note">${esc(fill(T.stamps, { n: loyalty.have, m: loyalty.every }))}</p></div>` : ''}
<div class="box"><h2>${esc(T.yourItems)}</h2>${lines}<div class="tot"><span>${esc(T.subtotal)}</span><span>${money(order.subtotal)}</span>${order.discount ? `<span>${esc(T.discount)}${order.promo ? ` (${esc(order.promo)})` : ''}</span><span>−${money(order.discount)}</span>` : ''}${order.tax ? `<span>${esc(T.tax)}</span><span>${money(order.tax)}</span>` : ''}${order.fee ? `<span>${esc(T.delivery)}</span><span>${money(order.fee)}</span>` : ''}${order.tip ? `<span>${esc(T.tipLine)}</span><span>${money(order.tip)}</span>` : ''}<span class="g">${esc(T.total)}</span><span class="g">${money(order.total)}</span>${order.gift && !cancelled ? `<span>${esc(T.giftCard)}${order.giftCode ? ` (${esc(order.giftCode)})` : ''}</span><span>−${money(order.gift)}</span>` : ''}${refunded && !cancelled ? `<span>${esc(T.refunded)}</span><span>−${money(refunded)}</span>` : ''}${due > 0 && order.gift ? `<span class="g">${esc(T.toPay)}</span><span class="g">${money(due)}</span>` : ''}${order.giftCode && order.giftLeft != null ? `<span>${esc(T.giftLeft)}</span><span>${money(order.giftLeft)}</span>` : ''}</div>
${cancelled ? `<p class="note">${esc(order.gift ? T.giftBack : T.nothingOwed)}</p>` : paid ? `<p class="note">${esc(fill(T.paidWith, { method: tender(order.paidMethod) }))}</p>` : payUrl ? `<div class="actions" style="margin-top:8px"><a class="btn" href="${esc(payUrl)}" target="_blank" rel="noopener">${esc(T.payOnline)}</a></div><p class="note">${esc(T.orPayLater)}</p>` : `<p class="note">${esc(T.payLater)}</p>`}</div>
<div class="actions">${phoneHtml}${ordering?.enabled ? `<a class="btn${phoneHtml ? ' ghost' : ''}" ${orderHref} data-reorder="${esc(again)}">${esc(T.orderAgain)}</a>` : ''}<a class="btn ghost" ${homeHref}>${esc(T.backHome)}</a></div></div></section>`;
}
