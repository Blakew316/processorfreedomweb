import { renderPage } from '/shared/render.js';
import { ION, ionSvg } from '/shared/icons.js';
export { ION };

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'srcdoc') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}

const P = {
  back: '<path d="M15 5l-7 7 7 7"/>', up: '<path d="M6 14l6-6 6 6"/>', down: '<path d="M6 10l6 6 6-6"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', trash: '<path d="M5 7h14M10 7V4.500h4V7M7 7l1 12.500h8L17 7"/>', check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
  eye: '<path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z"/><circle cx="12" cy="12" r="2.800"/>',
  out: '<path d="M14 5h5v5M19 5l-8 8M11 6H6.500A1.500 1.500 0 005 7.500v10A1.500 1.500 0 006.500 19h10a1.500 1.500 0 001.500-1.500V13"/>',
  image: '<rect x="3.500" y="5" width="17" height="14" rx="2.500"/><circle cx="9" cy="10" r="1.500"/><path d="M4 17l5-4.500 3.500 3 3-2.500 4.500 4"/>',
  chev: '<path d="M9 5l7 7-7 7"/>', search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.500-4.500"/>', dot: '<circle cx="12" cy="12" r="8.500"/>', ok: '<circle cx="12" cy="12" r="8.500"/><path d="M8.500 12.200l2.400 2.400 4.600-5"/>',
  wand: '<path d="M5 19L16 8M14 5.500l.800 1.700 1.700.800-1.700.800L14 10.500l-.800-1.700L11.500 8l1.700-.800zM18.500 12.500l.500 1 1 .500-1 .500-.500 1-.500-1-1-.500 1-.500z"/>',
  globe: '<circle cx="12" cy="12" r="8.500"/><path d="M3.500 12h17M12 3.500c2.500 2.500 3.500 5.500 3.500 8.500s-1 6-3.500 8.500c-2.500-2.500-3.500-5.500-3.500-8.500s1-6 3.500-8.500z"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.500"/><path d="M11 18h2"/>', lock: '<rect x="5" y="10.500" width="14" height="9.500" rx="2.500"/><path d="M8.500 10.500V8a3.500 3.500 0 017 0v2.500"/>',
  bag: '<path d="M6 8h12l1 12H5z"/><path d="M9 8V6.500a3 3 0 016 0V8"/>', list: '<path d="M8.500 7h11M8.500 12h11M8.500 17h11M4.500 7h.010M4.500 12h.010M4.500 17h.010"/>', sliders: '<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/>', brush: '<path d="M14 4l6 6-8.500 8.500H5.500V12.500z"/>', store: '<path d="M4 9.500l1.500-5h13l1.500 5M5 9.500V20h14V9.500M4 9.500h16M10 20v-5.500h4V20"/>', up2: '<path d="M12 16V5M7.500 9.500L12 5l4.500 4.500M5 19h14"/>', dl: '<path d="M12 5v11M7.500 11.500L12 16l4.500-4.500M5 19h14"/>',
  undo: '<path d="M8.500 8H15a4.500 4.500 0 010 9H9.500"/><path d="M11.500 5l-3 3 3 3"/>', redo: '<path d="M15.500 8H9a4.500 4.500 0 000 9h5.500"/><path d="M12.500 5l3 3-3 3"/>', print: '<path d="M7 9V4.500h10V9M7 16.500H5a1.500 1.500 0 01-1.500-1.500v-4.500A1.500 1.500 0 015 9h14a1.500 1.500 0 011.500 1.500V15a1.500 1.500 0 01-1.500 1.500h-2"/><path d="M7 13.500h10v6H7z"/>', bell: '<path d="M6.500 16.500V11a5.500 5.500 0 0111 0v5.500l1.500 1.500H5z"/><path d="M10 20.500a2.200 2.200 0 004 0"/>', chart: '<path d="M5 19V11M10 19V5M15 19v-6M20 19V9"/>', grip: '<path d="M9 7h.010M15 7h.010M9 12h.010M15 12h.010M9 17h.010M15 17h.010"/>',
  clock: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>',
  inbox: '<path d="M4 13l2.500-7.500h11L20 13v5a1.500 1.500 0 01-1.500 1.500h-13A1.500 1.500 0 014 18z"/><path d="M4 13h4.500l1 2.500h5l1-2.500H20"/>', doc: '<path d="M7 3.500h7l4 4V20a.500.500 0 01-.500.500h-10.500A.500.500 0 016.500 20V4a.500.500 0 01.500-.500z"/><path d="M9.500 12h5M9.500 15.500h5"/>',
};
export const ic = (name, size = 18) => h('span', { style: 'display:inline-flex', html: ION[name] ? ionSvg(name, size) : `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>` });
/** Wraps raw icon markup. Understands both the icon set (512 grid) and hand-written 24-grid paths. */
export const svg = (inner, size = 22) => (/stroke-width="32"|scale\(32\)/.test(inner) || /^<path d="M\d{3}/.test(inner)
  ? `<svg viewBox="0 0 512 512" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${inner}</svg>`
  : `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`);

/* Light or dark. Light unless the person chooses otherwise. */
export const getTheme = () => { try { return localStorage.getItem('pf-theme') || 'light'; } catch { return 'light'; } };
export function setTheme(t) {
  try { localStorage.setItem('pf-theme', t); } catch { /* ignore */ }
  document.documentElement.dataset.theme = t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
  document.querySelectorAll('.theme-btn').forEach((b) => b.replaceChildren(ic(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 18)));
}
export const themeButton = () => h('button', { class: 'icon-btn theme-btn', title: 'Switch between light and dark', 'aria-label': 'Switch between light and dark', onclick: () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') }, ic(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 18));

export const LOGO = '<img src="/assets/logo.png" alt="" width="28" height="28">';

export const state = { user: null, config: { addressPrefix: '', addressSuffix: '', cnameTarget: '', emailEnabled: false } };

export async function api(method, path, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof Blob) { opts.body = body; opts.headers['Content-Type'] = body.type || 'application/octet-stream'; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  let res;
  try { res = await fetch(path, opts); } catch { throw new Error('You appear to be offline. Check your connection and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Please try again.'); e.status = res.status; throw e; }
  return data;
}

export function go(path) { history.pushState(null, '', path); window.dispatchEvent(new Event('popstate')); }
export const link = (href, attrs, ...kids) => h('a', { href, ...attrs, onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); go(href); } }, ...kids);

let toasts;
export function toast(text, bad = false) {
  if (!toasts || !toasts.isConnected) document.body.append((toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })));
  const t = h('div', { class: `toast${bad ? ' bad' : ''}` }, text);
  toasts.append(t);
  setTimeout(() => t.remove(), bad ? 5000 : 2800);
}

export function sheet(build, cls = '', onClose) {
  let open = true;
  const close = () => { if (!open) return; open = false; scrim.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => e.key === 'Escape' && close();
  const box = h('div', { class: `sheet ${cls}`, role: 'dialog', 'aria-modal': 'true' });
  const scrim = h('div', { class: 'scrim', onmousedown: (e) => e.target === scrim && close() }, box);
  box.append(...[build(close)].flat());
  document.body.append(scrim);
  document.addEventListener('keydown', onKey);
  (box.querySelector('[autofocus]') || box.querySelector('button, input'))?.focus();
  return close;
}

export function confirmSheet({ title, text, action = 'Continue', danger = false }) {
  return new Promise((done) => sheet((close) => [
    h('h2', {}, title), h('p', { class: 'muted' }, text),
    h('div', { class: 'acts' },
      h('button', { class: 'btn soft', onclick: () => { close(); done(false); } }, 'Cancel'),
      h('button', { class: 'btn', style: danger ? 'background:var(--red)' : '', autofocus: true, onclick: () => { close(); done(true); } }, action)),
  ]));
}

/* A real page, scaled down to a thumbnail. */
const ro = new ResizeObserver((entries) => { for (const e of entries) e.target.style.setProperty('--s', e.contentRect.width / (e.target._w || 1280)); });
export function thumb(site, page = 'home', extra = {}, size = null) {
  const frame = h('iframe', { tabindex: '-1', 'aria-hidden': 'true', scrolling: 'no', loading: 'lazy', title: '' });
  const wrap = h('div', { class: 'thumb' }, frame);
  if (size) { wrap._w = size.w; wrap.style.aspectRatio = `${size.w}/${size.h}`; frame.style.width = `${size.w}px`; frame.style.height = `${size.h}px`; }
  wrap.paint = (s) => { frame.srcdoc = renderPage(s, page, { preview: true, ...extra }).html; };
  wrap.paint(site);
  ro.observe(wrap);
  return wrap;
}

/* Images are resized in the browser before upload, so phone photos stay fast. */
export async function uploadImage(file) {
  if (!file) return '';
  if (!/^image\//.test(file.type)) throw new Error('Choose an image file.');
  let blob = file;
  if (!/svg|gif/.test(file.type)) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      if (scale < 1 || file.size > 600_000) {
        const c = h('canvas', { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const png = file.type === 'image/png';
        blob = await new Promise((r) => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.86)) || file;
      }
    } catch { /* fall back to the original file */ }
  }
  if (blob.size > 8 * 1024 * 1024) throw new Error('That image is too large. Try one under 8 MB.');
  return (await api('POST', '/api/uploads', blob)).url;
}

export function pickFiles(multiple = false, accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml') {
  return new Promise((done) => {
    const input = h('input', { type: 'file', accept, multiple, onchange: () => done([...input.files]) });
    input.click();
  });
}

export const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); return fn(...a); }; return d; };
export const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
export const showAddress = (slug) => `${state.config.addressPrefix}${slug}${state.config.addressSuffix}`;

/* Live "is this address free" lookup shared by the landing page, the wizard and the editor. */
export function addressChecker(onResult) {
  let n = 0;
  return debounce(async (params) => {
    const mine = ++n;
    try {
      const r = await api('GET', `/api/address?${new URLSearchParams(params)}`);
      if (mine === n) onResult(r);
    } catch { /* ignore; the server re-checks on save */ }
  }, 220);
}

let qrLoading;
export function qrCanvas(text) {
  qrLoading ||= new Promise((ok, fail) => {
    const s = h('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', onload: ok, onerror: fail });
    document.head.append(s);
  });
  return qrLoading.then(() => {
    const qr = window.qrcode(0, 'M');
    qr.addData(text); qr.make();
    const n = qr.getModuleCount(), cell = 12, pad = 2;
    const c = h('canvas', { width: (n + pad * 2) * cell, height: (n + pad * 2) * cell });
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#1d1d1f';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) g.fillRect((x + pad) * cell, (y + pad) * cell, cell, cell);
    return c;
  });
}

export const SHEET_TYPES = '.csv,.tsv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
let sheetLib;
/** Reads an uploaded item list as CSV text. Excel files are converted in the browser. */
export async function readSheetFile(file) {
  if (!/\.(xlsx|xls)$/i.test(file.name)) return file.text();
  sheetLib ||= new Promise((ok, fail) => document.head.append(h('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', onload: ok, onerror: () => { sheetLib = null; fail(new Error('We could not open Excel files right now. Save the file as CSV and try again.')); } })));
  await sheetLib;
  const book = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
  // Use the first sheet that has anything in it.
  for (const name of book.SheetNames) { const csv = window.XLSX.utils.sheet_to_csv(book.Sheets[name], { blankrows: false }); if (csv.trim()) return csv; }
  return '';
}

/* A short two-note chime for new orders. */
let audio;
export function chime() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    [[880, 0], [1175, 0.16]].forEach(([freq, at]) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, audio.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + 0.5);
      o.connect(g).connect(audio.destination); o.start(audio.currentTime + at); o.stop(audio.currentTime + at + 0.55);
    });
  } catch { /* sound is a nicety */ }
}
export const alertsOn = () => { try { return localStorage.getItem('pf-alerts') !== 'off'; } catch { return true; } };
export function setAlerts(on) { try { localStorage.setItem('pf-alerts', on ? 'on' : 'off'); } catch { /* ignore */ } if (on) { chime(); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } }
export function announceOrders(list, siteName) {
  if (!list.length || !alertsOn()) return;
  chime();
  try { if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') new Notification(list.length === 1 ? `New order #${list[0].number}` : `${list.length} new orders`, { body: `${siteName} · ${list.map((o) => o.name).join(', ')}`, icon: '/assets/logo.png' }); } catch { /* ignore */ }
}
export function printTicket(o, siteName, extra) {
  const e = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return toast('Allow pop-ups to print tickets.', true);
  w.document.write(`<!doctype html><title>Order #${e(o.number)}</title><style>body{font:15px/1.4 -apple-system,Helvetica,Arial,sans-serif;margin:18px;color:#000}h1{font-size:30px;margin:0}h2{font-size:17px;margin:2px 0 14px;font-weight:600}.l{display:flex;gap:10px;font-size:19px;font-weight:600;padding:8px 0;border-top:1px dashed #999}.l b{min-width:34px}.o{font-size:15px;font-weight:400;display:block}p{margin:4px 0}.n{border:2px solid #000;padding:8px;margin-top:12px;font-weight:600}</style><h1>#${e(o.number)} · ${e(extra.method)}</h1><h2>${e(siteName)} · ${e(extra.when)}</h2>${o.items.map((l) => `<div class="l"><b>${l.qty}×</b><span>${e(l.name)}${l.opts?.length ? `<span class="o">${e(l.opts.join(', '))}</span>` : ''}</span></div>`).join('')}${o.notes ? `<div class="n">${e(o.notes)}</div>` : ''}<p style="margin-top:14px"><b>${e(o.name)}</b> · ${e(o.phone)}</p>${o.address ? `<p>Deliver to: ${e(o.address)}</p>` : ''}${o.vehicle ? `<p>Vehicle: ${e(o.vehicle)}</p>` : ''}<p>Total ${e(extra.total)}</p><script>onload=()=>{print()}<\/script>`);
  w.document.close();
}

/* Notifications that arrive even when the builder is closed. */
const keyBytes = (k) => Uint8Array.from(atob(k.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export async function pushOn() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return !!(reg && await reg.pushManager.getSubscription());
}
export async function enablePush() {
  if (!pushSupported()) throw new Error('This browser cannot show these notifications. On iPhone or iPad, add this page to your Home Screen first, then open it from there and try again.');
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser settings and try again.');
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(state.config.pushKey) });
  await api('POST', '/api/push/subscribe', { subscription: sub.toJSON() });
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) { await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
}
