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
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
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

/* Light or dark: always the device's own setting, in a browser as in the iPhone app. */
export const getTheme = () => 'auto';
// iPhone paints the status-bar area from the page colour, so it is kept the same colour as the bar at the top.
// That way the top bar runs right up under the clock and battery with no grey or foggy band above it.
export function syncTopColor() {
  const bar = document.querySelector('.ed-top, .k-top, .top');
  const rgb = (v) => (v.match(/[\d.]+/g) || []).map(Number);
  const under = rgb(getComputedStyle(document.body).backgroundColor);
  let [r, g, b, a = 1] = rgb(bar ? getComputedStyle(bar).backgroundColor : '');
  if (r == null || a === 0) [r, g, b, a] = document.documentElement.dataset.theme === 'dark' ? [0, 0, 0, 1] : [255, 255, 255, 1];
  // A see-through bar is flattened onto the page colour, because iPhone needs one solid colour.
  if (a < 1 && under.length >= 3) [r, g, b] = [r, g, b].map((x, i) => Math.round(x * a + under[i] * (1 - a)));
  const c = `rgb(${r}, ${g}, ${b})`;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', c);
  document.documentElement.style.backgroundColor = c;
}
/* Light or dark follows the device setting, in a browser as in the iPhone app. There is no switch: the whole site,
   Processor Freedom's pages included, is one theme, and a choice kept on one part of it would split a page in two. */
export function followDevice() {
  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  syncTopColor();
}
export const setTheme = () => followDevice();
// The device can switch while a page is open (at sunset, or from Control Center): follow it straight away.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', followDevice);

export const LOGO = '<img src="/assets/logo.svg" alt="" width="28" height="28">';

export const state = { user: null, config: { addressPrefix: '', addressSuffix: '', cnameTarget: '', emailEnabled: false } };

/* Inside the PF Sites iPhone app the back office runs in the app's own web view. Before the page loads, the app marks it with the
   pf-app class and gives it two ways to talk to it: pf for messages that need no answer, and pfAsk for questions that do. */
export const inApp = document.documentElement.classList.contains('pf-app') && !!window.webkit?.messageHandlers?.pf;
export const toApp = (msg) => { try { window.webkit.messageHandlers.pf.postMessage(msg); } catch { /* not in the app */ } };
export const askApp = (msg) => window.webkit.messageHandlers.pfAsk.postMessage(msg);
// The session has ended. The app shows its own lock or sign-in screen, so it is told once, and the page clears itself.
let toldOut = false;
export function signedOut() {
  state.user = null;
  if (toldOut) return;
  toldOut = true;
  toApp({ type: 'signedOut' });
  window.dispatchEvent(new Event('pf-signedout'));
}
// In the app a 401 can mean the session ended, or only that a password was typed wrong; asking who is signed in tells the two apart.
let checking = null;
function checkSession() {
  checking ||= fetch('/api/me', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && !d.user) signedOut(); })
    .catch(() => { /* offline: the app shows that itself */ }).finally(() => { checking = null; });
}
/* Something is in progress: an open window or pop-up, a field being typed in, a sale not sent yet, or a change still saving.
   A sale on the Virtual Terminal counts once something is typed into it or a customer is chosen. An untouched one does not: its amount
   boxes show $0.00 and its Email or None choice holds no typing, so neither is taken for a sale in progress. */
const saleStarted = () => !!document.querySelector('.vt .vt-picked') || [...document.querySelectorAll('.vt input')].some((x) => x.type !== 'checkbox' && x.type !== 'radio' && x.value.trim() && !/^\$?0+(\.0+)?$/.test(x.value.trim()));
export const busy = () => !!document.querySelector('.sheet, .tb-pop, input:focus, textarea:focus, select:focus') || saleStarted() || /Saving/.test(document.querySelector('.ed-top')?.textContent || '');

export async function api(method, path, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof Blob) { opts.body = body; opts.headers['Content-Type'] = body.type || 'application/octet-stream'; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  // The service restarts for a few seconds when it is updated. Wait that out quietly rather than showing an error.
  const waits = method === 'GET' ? [600, 1500, 3000, 5000, 8000] : [1000, 2500, 5000];
  for (let attempt = 0; ; attempt++) {
    let res = null;
    try { res = await fetch(path, opts); } catch { /* network hiccup or mid-restart */ }
    const restarting = !res || [502, 503, 504].includes(res.status);
    if (restarting && attempt < waits.length) { await new Promise((r) => setTimeout(r, waits[attempt])); continue; }
    if (!res) throw new Error('We could not reach the server. Check your connection and try again.');
    if (restarting) throw new Error('We are updating right now. Give it a moment and try again.');
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && inApp) checkSession();
    if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Please try again.'); e.status = res.status; e.data = data; throw e; }
    return data;
  }
}

export function go(path) {
  // The app has its own sign-in screens, so inside it the log in pages are never opened: the app is told the session ended instead.
  if (inApp && /^\/(login|signup|forgot|reset)(?=[/?#]|$)/.test(path)) return signedOut();
  history.pushState(null, '', path); window.dispatchEvent(new Event('popstate'));
}
export const link = (href, attrs, ...kids) => h('a', { href, ...attrs, onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); go(href); } }, ...kids);

let toasts;
export function toast(text, bad = false) {
  if (!toasts || !toasts.isConnected) document.body.append((toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })));
  const t = h('div', { class: `toast${bad ? ' bad' : ''}` }, text);
  toasts.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 220); }, bad ? 5000 : 2800);
}

export function sheet(build, cls = '', onClose) {
  let open = true;
  // Whatever opened the window gets the focus back when it closes, so the keyboard never lands at the top of the page.
  const opener = document.activeElement;
  // The window eases away rather than vanishing; everything else carries on straight away.
  const close = () => { if (!open) return; open = false; scrim.classList.add('out'); setTimeout(() => scrim.remove(), 180); document.removeEventListener('keydown', onKey); onClose?.(); if (opener && opener !== document.body && opener.isConnected && !document.querySelector('.scrim:not(.out)')) opener.focus({ preventScroll: true }); };
  // Escape closes only the window on top, and Tab goes round inside it rather than out to the page behind.
  const onKey = (e) => {
    if ([...document.querySelectorAll('.scrim:not(.out)')].at(-1) !== scrim) return;
    if (e.key === 'Escape') return close();
    if (e.key !== 'Tab') return;
    const f = [...box.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter((x) => x.getClientRects().length);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); } else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  };
  const box = h('div', { class: `sheet ${cls}`, role: 'dialog', 'aria-modal': 'true' });
  const scrim = h('div', { class: 'scrim', onmousedown: (e) => e.target === scrim && close() }, box);
  box.append(...[build(close)].flat(Infinity).filter((x) => x != null && x !== false));
  // The window is named by its heading.
  const title = box.querySelector('h1, h2, h3');
  if (title) { title.id ||= `sh-${Math.random().toString(36).slice(2, 9)}`; box.setAttribute('aria-labelledby', title.id); }
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

/* Soft placeholder shapes shown while something loads, in the shape of what is coming. */
export const skel = (n = 3, kind = 'row') => (kind === 'kpi' ? Array.from({ length: n }, () => h('div', { class: 'skel sk-kpi', 'aria-hidden': 'true' })) : h('div', { class: `skels sk-${kind}s`, 'aria-busy': 'true', 'aria-label': 'Loading' }, Array.from({ length: n }, () => h('div', { class: `skel sk-${kind}` }))));
/* A friendly "nothing here yet", with the next step when there is one. */
export const emptyState = (icon, title, text, action) => h('div', { class: 'inv-empty' }, ic(icon, 30), h('b', {}, title), action && h('button', { class: 'btn sm', style: 'margin-top:14px', onclick: action[1] }, action[0]));

/* Images are resized in the browser before upload, so phone photos stay fast.
   `crop` trims to one shape from the centre: { ratio: width / height, max: longest side }. */
export async function uploadImage(file, crop) {
  if (!file) return '';
  if (!/^image\//.test(file.type)) throw new Error('Choose an image file.');
  let blob = file;
  if (!/svg|gif/.test(file.type)) {
    try {
      const bmp = await createImageBitmap(file);
      let sw = bmp.width, sh = bmp.height;
      if (crop?.ratio) { if (sw / sh > crop.ratio) sw = Math.round(sh * crop.ratio); else sh = Math.round(sw / crop.ratio); }
      const cropped = sw !== bmp.width || sh !== bmp.height;
      const scale = Math.min(1, (crop?.max || 2000) / Math.max(sw, sh));
      if (scale < 1 || cropped || file.size > 600_000) {
        const c = h('canvas', { width: Math.round(sw * scale), height: Math.round(sh * scale) });
        c.getContext('2d').drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
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

const loadSheetLib = () => (sheetLib ||= new Promise((ok, fail) => document.head.append(h('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', onload: ok, onerror: () => { sheetLib = null; fail(new Error('We could not make an Excel file right now. Try CSV instead.')); } }))));
/** Saves rows (the first row is the headings) as a spreadsheet the person downloads: .xlsx for Excel, or .csv. */
export async function saveSheetFile(name, rows, kind = 'csv', sheetName = 'Customers') {
  let blob;
  if (kind === 'xlsx') {
    await loadSheetLib();
    const X = window.XLSX, ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = Array.from({ length: Math.max(...rows.map((r) => r.length)) }, (_, i) => i).map((i) => ({ wch: Math.min(40, Math.max(10, ...rows.slice(0, 200).map((r) => String(r[i] ?? '').length + 2))) }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
    blob = new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  } else {
    const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    blob = new Blob([`\ufeff${rows.map((r) => r.map(q).join(',')).join('\r\n')}`], { type: 'text/csv' });
  }
  const url = URL.createObjectURL(blob);
  h('a', { href: url, download: `${name}.${kind}` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
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
  try { if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') new Notification(list.length === 1 ? `New order #${list[0].number}` : `${list.length} new orders`, { body: `${siteName} · ${list.map((o) => o.name).join(', ')}`, icon: '/assets/icon-192.png' }); } catch { /* ignore */ }
}
/* The app has no pop-up windows. What would print in a window of its own is put into the page, shown only when printing,
   and the app prints the page. The window's styles are kept to the printed part, so the page around it is untouched. */
export function printInApp(title, css, html) {
  document.querySelector('.pf-print')?.remove();
  const scoped = css.replace(/(^|\})([^{}]+)\{/g, (m, end, sel) => `${end}${sel.split(',').map((s) => (s.trim() === 'body' ? '.pf-print' : `.pf-print ${s.trim()}`)).join(',')}{`);
  document.body.append(h('div', { class: 'pf-print', 'aria-hidden': 'true' }, h('style', {}, scoped), h('div', { html })));
  toApp({ type: 'print', title });
}
export function printTicket(o, siteName, extra) {
  const e = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const css = 'body{font:15px/1.4 -apple-system,Helvetica,Arial,sans-serif;margin:18px;color:#000}h1{font-size:30px;margin:0}h2{font-size:17px;margin:2px 0 14px;font-weight:600}.l{display:flex;gap:10px;font-size:19px;font-weight:600;padding:8px 0;border-top:1px dashed #999}.l b{min-width:34px}.o{font-size:15px;font-weight:400;display:block}p{margin:4px 0}.n{border:2px solid #000;padding:8px;margin-top:12px;font-weight:600}';
  const ticket = `<h1>#${e(o.number)} · ${e(extra.method)}</h1><h2>${e(siteName)} · ${e(extra.when)}</h2>${o.items.map((l) => `<div class="l"><b>${l.qty}×</b><span>${e(l.name)}${l.opts?.length ? `<span class="o">${e(l.opts.join(', '))}</span>` : ''}</span></div>`).join('')}${o.notes ? `<div class="n">${e(o.notes)}</div>` : ''}<p style="margin-top:14px"><b>${e(o.name)}</b> · ${e(o.phone)}</p>${o.address ? `<p>Deliver to: ${e(o.address)}</p>` : ''}${o.vehicle ? `<p>Vehicle: ${e(o.vehicle)}</p>` : ''}<p>Total ${e(extra.total)}</p>`;
  if (inApp) return printInApp(`Order #${o.number}`, css, ticket);
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return toast('Allow pop-ups to print tickets.', true);
  w.document.write(`<!doctype html><title>Order #${e(o.number)}</title><style>${css}</style>${ticket}<script>onload=()=>{print()}<\/script>`);
  w.document.close();
}

/* Notifications that arrive even when the builder is closed. */
const keyBytes = (k) => Uint8Array.from(atob(k.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
// In the app, notifications are the app's own (Apple push), so the app is asked. Its last answer is kept, so a switch can be drawn
// straight away: until it says otherwise, they are taken to be available.
let appPush = null;
async function askPush(cmd) {
  let r;
  try { r = await askApp({ cmd }); } catch {
    if (cmd !== 'pushState') throw new Error('Notifications could not be changed. Please try again.');
    r = { supported: false, on: false };
  }
  appPush = { ...appPush, ...(r && typeof r === 'object' ? r : {}) };
  return appPush;
}
export const pushSupported = () => (inApp ? appPush?.supported !== false : 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
export async function pushOn() {
  if (inApp) return !!(await askPush('pushState')).on;
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return !!(reg && await reg.pushManager.getSubscription());
}
export async function enablePush() {
  if (inApp) {
    const r = await askPush('pushEnable');
    if (r.on) return;
    throw new Error(r.supported === false ? 'Notifications are not available in the app yet.' : r.denied ? 'Notifications are turned off for PF Sites. Turn them on in Settings on your iPhone, then try again.' : 'Notifications could not be turned on. Please try again.');
  }
  if (!pushSupported()) throw new Error('This browser cannot show these notifications. On iPhone or iPad, add this page to your Home Screen first, then open it from there and try again.');
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser settings and try again.');
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(state.config.pushKey) });
  await api('POST', '/api/push/subscribe', { subscription: sub.toJSON() });
}
export async function disablePush() {
  if (inApp) { await askPush('pushDisable'); return; }
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) { await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
}

/* ---------- Phone layout helpers ---------- */

/** Copies each column heading onto its cells, so on a phone a table can be shown as a stack of labelled cards. */
export function labelTables(root = document) {
  root.querySelectorAll('table.table').forEach((t) => {
    const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => { if (td.colSpan > 1) td.dataset.l = ''; else td.dataset.l = heads[i] || ''; if (!td.textContent.trim() && !td.querySelector('button,a,input,select')) td.dataset.empty = '1'; }));
  });
}

/* ---------- Install on the Home Screen ---------- */

let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; document.documentElement.dataset.installable = '1'; });
window.addEventListener('appinstalled', () => { installEvent = null; delete document.documentElement.dataset.installable; toast('Installed. Find it on your Home Screen.'); });
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** Whether offering to install makes sense here: not already installed, and on a phone, tablet or a browser that supports it. */
export const canOfferInstall = () => !isStandalone() && (!!installEvent || isIOS() || matchMedia('(max-width:900px)').matches);
export async function installApp() {
  if (installEvent) { const ev = installEvent; installEvent = null; ev.prompt(); try { await ev.userChoice; } catch { /* dismissed */ } return; }
  const share = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3.500M8 7l4-4 4 4M6.500 11H6a1.500 1.500 0 00-1.500 1.500v7A1.500 1.500 0 006 21h12a1.500 1.500 0 001.500-1.500v-7A1.500 1.500 0 0018 11h-.500"/></svg>';
  const plus = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4.500"/><path d="M12 8.500v7M8.500 12h7"/></svg>';
  const step = (n, icon, title, text) => h('div', { class: 'ins-step' }, h('span', { class: 'ins-n' }, n), h('div', {}, h('b', {}, title, icon && h('i', { class: 'ins-ic', html: icon })), h('p', {}, text)));
  const ios = isIOS();
  sheet((close) => [h('img', { class: 'ins-icon', src: '/assets/logo.svg', alt: '', width: 84, height: 84 }), h('h2', { style: 'text-align:center' }, 'Add to your Home Screen'),
    h('p', { class: 'muted', style: 'text-align:center' }, 'Open Processor Freedom Sites like an app: full screen, one tap from your Home Screen, with new-order notifications.'),
    h('div', { class: 'ins-steps' }, ...(ios
      ? [step(1, share, 'Tap Share', 'The square with an arrow, in the bar at the bottom of Safari (or the top on iPad).'), step(2, plus, 'Choose “Add to Home Screen”', 'Scroll down the list if you do not see it straight away.'), step(3, '', 'Tap Add', 'The Processor Freedom icon appears on your Home Screen.')]
      : [step(1, '', 'Open your browser menu', 'The three dots at the top or bottom of the screen.'), step(2, plus, 'Choose “Install app” or “Add to Home screen”', 'The wording depends on your browser.'), step(3, '', 'Confirm', 'The Processor Freedom icon appears with your other apps.')])),
    ios && !/safari/i.test(navigator.userAgent.replace(/crios|fxios|edgios/i, '')) && h('p', { class: 'hint', style: 'text-align:center' }, 'If you do not see Share, open this page in Safari first.'),
    h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: close }, 'Got it'))], 'ins');
}

/* One small, even set of line icons for the navigation: same weight, same size, nothing decorative. */
const NAV_ICONS = {
  home: '<path d="M4 11.200L12 4.500l8 6.700"/><path d="M6.200 9.800V19.500h4.300v-5h3v5h4.300V9.800"/>',
  orders: '<path d="M6.300 8.500h11.400l.900 11H5.400z"/><path d="M9.200 8.500V7a2.800 2.800 0 015.600 0v1.500"/>',
  menu: '<path d="M3.500 17h17M5.300 17a6.700 6.700 0 0113.400 0M12 10.300V8.300M10.200 8.300h3.600M5 20h14"/>',
  sales: '<path d="M5 19.500V12M10 19.500V5M15 19.500v-6M20 19.500V9"/>',
  customers: '<circle cx="12" cy="8.200" r="3.400"/><path d="M5.200 19.500c.700-3.300 3.300-5.200 6.800-5.200s6.100 1.900 6.800 5.200"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',   // gear outline after the Lucide icon set (ISC licence)
  design: '<path d="M12 3.800a8.200 8.200 0 100 16.400c1.200 0 1.800-.800 1.800-1.700 0-1.400-1.300-1.600-1.300-2.800 0-.900.700-1.600 1.700-1.600H16a4.200 4.200 0 004.200-4.200c0-3.500-3.700-6.100-8.200-6.100z"/><circle cx="8.300" cy="11" r=".9"/><circle cx="11.400" cy="7.800" r=".9"/><circle cx="15.400" cy="8.600" r=".9"/>',
  page: '<rect x="4.300" y="4.300" width="15.400" height="15.400" rx="3"/><path d="M4.300 9.500h15.400M10 9.500v10.200"/>',
  business: '<path d="M4.500 9.300l1.300-4.800h12.400l1.300 4.800"/><path d="M5.500 9.300V19.500h13V9.300M4.500 9.300h15M10 19.500v-5h4v5"/>',
  address: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.300 2.400 3.300 5.100 3.300 8s-1 5.600-3.300 8c-2.300-2.400-3.300-5.100-3.300-8s1-5.600 3.300-8z"/>',
  calendar: '<rect x="4" y="5.500" width="16" height="14.500" rx="2.500"/><path d="M4 10h16M8.500 3.500v4M15.500 3.500v4"/>',
  insights: '<path d="M12 3.500l1.900 5.100 5.100 1.900-5.100 1.900L12 17.500l-1.900-5.100L5 10.500l5.100-1.900z"/><path d="M18.500 15.500l.800 2.200 2.200.800-2.200.800-.800 2.200-.800-2.200-2.200-.800 2.200-.800z"/>',
  invoice: '<path d="M7 3.800h10v16.400l-2.500-1.500-2.500 1.500-2.500-1.500L7 20.200z"/><path d="M9.800 8.500h4.400M9.800 12h4.400"/>',
  promo: '<path d="M4 12.300V5.500A1.500 1.500 0 015.500 4h6.800l7.900 7.900-8.300 8.300z"/><circle cx="8.300" cy="8.300" r="1.200"/>',
  feedback: '<path d="M4.500 6.500A2 2 0 016.500 4.500h11a2 2 0 012 2v8a2 2 0 01-2 2h-6l-4.500 3.500v-3.500h-.500a2 2 0 01-2-2z"/>',
  team: '<circle cx="9" cy="8.500" r="3"/><path d="M3.500 19c.500-2.800 2.700-4.500 5.500-4.500s5 1.700 5.500 4.500"/><path d="M15.500 5.800a3 3 0 010 5.600M17.500 14.800c1.700.600 2.800 2 3.100 4.200"/>',
  swap: '<path d="M7 7.500h11.500M15.500 4.500l3 3-3 3M17 16.500H5.500M8.500 13.500l-3 3 3 3"/>',
  more: '<circle cx="6" cy="12" r="1.300"/><circle cx="12" cy="12" r="1.300"/><circle cx="18" cy="12" r="1.300"/>',
  preview: '<path d="M2.800 12S6.200 5.800 12 5.800 21.200 12 21.200 12 17.800 18.200 12 18.200 2.800 12 2.800 12z"/><circle cx="12" cy="12" r="2.700"/>',
  ordering: '<path d="M7.500 4v6.500M5.500 4v4a2 2 0 004 0V4M7.500 10.500V20"/><path d="M16.500 4c-1.900 1.600-2.500 4-2.500 6.200 0 1.500 1 2.300 2.500 2.300V20M16.500 4v8.500"/>',
  booking: '<path d="M12.500 14.500H5A1.500 1.500 0 013.500 13V6A1.500 1.500 0 015 4.500h12A1.500 1.500 0 0118.500 6v2.500"/><path d="M6.500 18.500h5M9 14.500v4"/><rect x="14.500" y="11" width="6" height="9.500" rx="1.300"/><path d="M17 18h1"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
};
/* The same icons the way an iPhone shows them in Settings: a white glyph on a small rounded tile.
   The tiles stay within one family of navy, blue and slate, so a list reads as calm rather than as a rainbow. */
const TILE = { home: 'navy', insights: 'navy', design: 'navy', orders: 'blue', calendar: 'blue', promo: 'blue', business: 'blue', menu: 'steel', invoice: 'steel', page: 'steel', sales: 'ink', team: 'ink', preview: 'ink', customers: 'slate', feedback: 'slate', ordering: 'blue', booking: 'blue', address: 'slate', settings: 'grey', swap: 'grey', more: 'grey', back: 'grey' };
export function navTile(name, size = 30) {
  const el = h('span', { class: `tile-ic t-${TILE[name] || 'steel'}`, style: `width:${size}px;height:${size}px`, 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}" fill="none" stroke="currentColor" stroke-width="2.050" stroke-linecap="round" stroke-linejoin="round">${NAV_ICONS[name] || NAV_ICONS.page}</svg>` });
  // Each drawing is nudged so its ink, not its canvas, sits in the middle of the tile.
  requestAnimationFrame(() => { try { const svg = el.firstElementChild, b = svg.getBBox(); if (b.width) svg.setAttribute('viewBox', `${(b.x + b.width / 2 - 12).toFixed(2)} ${(b.y + b.height / 2 - 12).toFixed(2)} 24 24`); } catch { /* not on screen yet */ } });
  return el;
}
export const navIcon = (name, size = 20) => h('span', { class: 'nav-ic', html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.650" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAV_ICONS[name] || ''}</svg>` });
