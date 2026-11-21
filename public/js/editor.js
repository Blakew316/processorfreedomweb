import { BACKGROUNDS, SECTION_BACKGROUNDS, HEADER_LAYOUTS, HEADER_STYLES, FOOTER_STYLES, FOOTER_COLORS, QUICK_STYLES, applyQuickStyle, ACCENTS, FONTS, RADII, HERO_LAYOUTS, SERVICE_LAYOUTS, SECTION_TYPES, SECTION_DEFAULTS, ICONS, LEGAL_PAGES, legalText, uid, cleanSlug, str, ORDER_METHODS, ORDER_STATUSES, MENU_TEMPLATE_CSV, readyLabel, parseMenuCsv, parseCsv, parsePrice, money, openMethods, DAYS, TIMEZONES, LANGS, parseChoices, choicesText, slotLabel, itemPrice, DEFAULT_STOCK, pricedMenu, invoiceTotals, invoiceLate, applyMods } from '/shared/core.js';
import { renderPage } from '/shared/render.js';
import { h, api, go, state, toast, sheet, confirmSheet, ic, svg, uploadImage, pickFiles, debounce, fmtDate, qrCanvas, readSheetFile, SHEET_TYPES, alertsOn, setAlerts, announceOrders, printTicket, pushSupported, pushOn, enablePush, disablePush, themeButton, skel, emptyState, labelTables, canOfferInstall, installApp, setTheme, navIcon, getTheme } from './ui.js';

// Two separate sides. The back office is for running the business day to day; the website side is for how the site looks.
const TABS = [
  ['start', 'Dashboard', 'home', 'office'], ['orders', 'Orders', 'bag', 'office'], ['tx', 'Transactions', 'cash', 'office'], ['cash', 'Cash log', 'cash', 'office'], ['close', 'Closeout', 'cash', 'office'], ['est', 'Estimates', 'doc', 'office'], ['tips', 'Tips', 'cash', 'office'],
  ['r-full', 'Sales report', 'chart', 'office'], ['r-emp', 'Employee sales', 'chart', 'office'], ['r-tender', 'Tender types', 'chart', 'office'], ['r-disc', 'Discounts report', 'chart', 'office'], ['r-removed', 'Removed items', 'chart', 'office'], ['r-exports', 'Exports', 'dl', 'office'], ['insights', 'Insights', 'chart', 'office'], ['appts', 'Appointments', 'clock', 'office'], ['calendar', 'Calendar', 'clock', 'office'], ['booking', 'Online booking', 'clock', 'office'], ['schedule', 'Scheduling', 'f_users', 'office'], ['timesheets', 'Timesheets', 'f_users', 'office'], ['projects', 'Projects', 'doc', 'office'], ['plans', 'Recurring payments', 'doc', 'office'], ['gift', 'Gift cards', 'tag', 'office'], ['bizinfo', 'Business information', 'store', 'office'], ['devices', 'Devices', 'bell', 'office'], ['appearance', 'Appearance', 'brush', 'office'], ['settings', 'Settings', 'settings', 'office'], ['profile', 'Profile', 'person', 'office'],
  ['items', 'Items', 'tag', 'office'], ['menu', 'Categories', 'menu', 'office'], ['mods', 'Modifier groups', 'tag', 'office'], ['menus', 'Menus', 'menu', 'office'], ['labels', 'Printer labels', 'tag', 'office'], ['revs', 'Revenue classes', 'tag', 'office'], ['discs', 'Discounts', 'tag', 'office'],
  ['sales', 'Sales overview', 'chart', 'office'], ['r-items', 'Item sales', 'chart', 'office'], ['r-types', 'Order types', 'chart', 'office'], ['r-taxes', 'Taxes', 'chart', 'office'],
  ['customers', 'Customers', 'person', 'office'], ['invoices', 'Invoices', 'doc', 'office'],
  ['promos', 'Promo codes', 'tag', 'office'], ['deals', 'Happy hour', 'tag', 'office'], ['rewards', 'Rewards', 'tag', 'office'],
  ['inbox', 'Feedback', 'inbox', 'office'], ['team', 'Employees', 'f_users', 'office'],
  ['ordering', 'Online ordering', 'sliders', 'office'], ['hours', 'Business hours', 'clock', 'office'], ['alerts', 'Alerts and emails', 'bell', 'office'],
  ['design', 'Look and feel', 'brush', 'site'], ['sections', 'Home page', 'layers', 'site'], ['business', 'Business info', 'store', 'site'],
  ['domain', 'Web address', 'globe', 'site'], ['policies', 'Policies', 'lock', 'site'], ['seo', 'Search', 'search', 'site'], ['history', 'History', 'clock', 'site'],
];
const WIDE = new Set(['appts', 'calendar', 'schedule', 'timesheets', 'insights', 'projects', 'plans', 'gift', 'tx', 'cash', 'close', 'est', 'tips', 'r-full', 'r-emp', 'r-tender', 'r-disc', 'r-removed', 'r-exports', 'mods', 'menus', 'labels', 'revs', 'discs', 'start', 'items', 'sales', 'r-items', 'r-types', 'r-taxes', 'customers', 'invoices']);
const SALES_TABS = { sales: 'overview', 'r-items': 'items', 'r-types': 'types', 'r-taxes': 'taxes', 'r-full': 'full', 'r-emp': 'emp', 'r-tender': 'tender', 'r-disc': 'disc', 'r-removed': 'removed', tips: 'tips' };
// Which settings cards belong on which screen.
const SETUP_VIEWS = { ordering: ['Online ordering', 'Pickup', 'Curbside', 'Delivery', 'Checkout'], hours: ['Opening hours', 'Kitchen capacity'], promos: ['Promo codes'], deals: ['Happy hour and timed prices'], rewards: ['Loyalty rewards'], alerts: ['Alerts and reports', 'Order emails'] };
const MODES = { office: 'Back office', site: 'Website' };
const NAV_NAMES = new Set(['calendar', 'insights', 'home', 'orders', 'menu', 'sales', 'customers', 'settings', 'design', 'page', 'business', 'address', 'invoice', 'promo', 'feedback', 'team']);
// The sidebar: a short list of sections. A section with more than one screen opens to show them underneath it.
const NAV = {
  office: [
    { label: 'Dashboard', icon: 'home', tabs: ['start'] },
    { label: 'Insights', icon: 'insights', tabs: ['insights'] },
    { label: 'Appointments', icon: 'calendar', tabs: ['appts', 'calendar'], subs: ['Overview', 'Calendar'] },
    { label: 'Sales activity', short: 'Sales', icon: 'orders', tabs: ['orders', 'tx', 'cash', 'close', 'invoices', 'est', 'projects', 'plans', 'tips'], subs: ['Orders', 'Transactions', 'Cash log', 'Closeout', 'Invoices', 'Estimates', 'Projects', 'Recurring payments', 'Tips'] },
    { label: 'Reports', icon: 'sales', tabs: ['sales', 'r-full', 'r-items', 'r-emp', 'r-tender', 'r-disc', 'r-removed', 'r-types', 'r-taxes', 'r-exports'], subs: ['Sales overview', 'Sales report', 'Item sales', 'Employee sales', 'Tender types', 'Discounts', 'Removed items', 'Order types', 'Taxes', 'Exports'] },
    { label: 'Inventory', short: 'Items', icon: 'menu', tabs: ['items', 'menu', 'mods', 'menus', 'labels', 'revs', 'discs'], subs: ['Items', 'Categories', 'Modifier groups', 'Menus', 'Printer labels', 'Revenue classes', 'Discounts'] },
    { label: 'Employees', icon: 'team', tabs: ['team', 'schedule', 'timesheets'], subs: ['Employees', 'Scheduling', 'Timesheets'] },
    { label: 'Customers', icon: 'customers', tabs: ['customers'] },
    { label: 'Promotions', icon: 'promo', tabs: ['promos', 'deals', 'rewards', 'gift'], subs: ['Promo codes', 'Happy hour', 'Rewards', 'Gift cards'] },
    { label: 'Feedback', icon: 'feedback', tabs: ['inbox'] },
    { label: 'Setup', icon: 'settings', tabs: ['bizinfo', 'hours', 'ordering', 'booking', 'alerts', 'devices', 'appearance'], subs: ['Business information', 'Business hours', 'Online ordering', 'Online booking', 'Alerts and emails', 'Devices', 'Appearance'] },
  ],
  site: [
    { label: 'Design', icon: 'design', tabs: ['design', 'history'], subs: ['Look and feel', 'Earlier versions'] },
    { label: 'Home page', icon: 'page', tabs: ['sections', 'policies'], subs: ['Sections', 'Policies'] },
    { label: 'Business info', icon: 'business', tabs: ['business'] },
    { label: 'Web address', icon: 'address', tabs: ['domain', 'seo'], subs: ['Web address', 'Google listing'] },
  ],
};
// What each back-office screen is for, shown as its heading.
const HEAD = {
  orders: ['Orders', 'New orders appear here on their own. Confirm each one, then mark it ready.'],
  menu: ['Categories', 'Group your menu and set the order customers see it in.'],
  inbox: ['Feedback', 'Messages customers send through the contact form on your site.'],
  ordering: ['Online ordering', 'How customers can order from you: pickup, curbside, delivery, tax and tips.'],
  hours: ['Business hours', 'When you take orders, ordering ahead, and how many orders the kitchen can handle.'],
  alerts: ['Alerts and emails', 'What you are told about, and where order emails go.'],
  promos: ['Promo codes', 'Codes customers type at checkout for money off.'],
  deals: ['Happy hour', 'Lower prices automatically at set times.'],
  rewards: ['Rewards', 'Thank regulars with a reward after a set number of orders.'],
  bizinfo: ['Business information', 'Your phone, address and hours as customers see them on your website and receipts. Publish your site after changing these.'],
  booking: ['Online booking', 'Let customers ask for a table, a class or any other booking from your website. You confirm each request.'],
  devices: ['Devices', 'Phones, tablets and computers that get a notification for every new order.'],
  appearance: ['Appearance', 'Light or dark. This is remembered on this device only.'],
  settings: ['Settings', 'Everything you can set up for your business, in one place.'],
  profile: ['Profile', 'Your own sign-in details. These follow you across every site you can open.'],
  team: ['Employees', 'Give each person their own login, with only what they need.'],
};
// On a phone the first four sections of each side sit in the tab bar; the rest is under More.
const PHONE_COUNT = { office: 4, site: 3 };

// Item photos are trimmed to one shape so every tile on the menu lines up.
const ITEM_PHOTO = { ratio: 4 / 3, max: 1400 };

export async function editor(id, mount, title, startTab = '') {
  const loaded = (await api('GET', `/api/sites/${id}`)).site;
  // Kitchen logins only work with orders, so they go straight to the kitchen screen.
  if (loaded.role === 'kitchen') { setTimeout(() => go(`/app/site/${id}/kitchen`)); return () => {}; }
  const isOwner = loaded.role === 'owner';
  const tabs = TABS.filter(([k]) => k !== 'team' || isOwner);
  const draft = loaded.draft;
  let meta = { ...loaded, draft: undefined };
  title(meta.name);

  const q = new URLSearchParams(location.search);
  // Every page of the back office has its own address, so Back, Forward, refresh and bookmarks all work.
  const known = (k) => tabs.some(([t]) => t === k);
  const pathFor = (k) => `/app/site/${id}${k === 'start' ? '' : `/${k}`}`;
  let tab = known(startTab) ? startTab : known(q.get('tab')) ? q.get('tab') : 'start';
  if (location.pathname !== pathFor(tab) || q.has('tab')) window.history.replaceState(null, '', pathFor(tab));
  let sel = null;            // id of the section being edited
  let page = 'home';
  let device = 'desktop';
  let saveState = 'saved';   // saved | dirty | saving | error
  let leads = null;
  let request;               // latest "get me a domain" request
  const openItems = new Set();
  let ordering = loaded.ordering;
  /* Someone else saved since this screen loaded: say so and load their version, rather than overwrite it. */
  let staleSeen = false, draftRev = loaded.draftRev, orderingRev = loaded.orderingRev;
  function stale() { if (staleSeen) return; staleSeen = true; setTimeout(() => location.reload(), 1600); }
  /* Settings are sent one at a time and in order, so two quick changes can never cross on the way to the server. */
  let ordSeq = 0, ordQueue = Promise.resolve();
  function sendOrdering(o) {
    const seq = ++ordSeq;
    const run = ordQueue.then(async () => {
      const r = await api('PUT', `/api/sites/${id}/ordering`, { ordering: o, rev: orderingRev });
      orderingRev = r.rev;
      if (seq === ordSeq) { for (const k of Object.keys(o)) if (!(k in r.ordering)) delete o[k]; Object.assign(o, r.ordering); }
      return o;
    });
    ordQueue = run.catch(() => {});
    return run.catch((e) => { if (e.status === 412) stale(); throw e; });
  }
  // Coming back to this tab after a change was made somewhere else loads that change, unless something here is still unsaved.
  const onVisible = async () => {
    if (document.hidden || staleSeen || saveState !== 'saved' || !location.pathname.includes(`/site/${id}`)) return;
    try {
      const now = (await api('GET', `/api/sites/${id}`)).site;
      if (saveState === 'saved' && (now.draftRev !== draftRev || now.orderingRev !== orderingRev)) stale();
    } catch { /* offline or signed out: the next action will say so */ }
  };
  document.addEventListener('visibilitychange', onVisible);
  let menu = (await api('GET', `/api/sites/${id}/menu`)).items;
  let orders = null;
  let editItem = null;       // menu item being edited
  let orderFilter = 'active';
  let stats = null;
  let salesRange = 'today', salesFrom = '', salesTo = '', salesBusy = false;
  let invQ = '', invFilter = 'all';
  const invSel = new Set();
  const itemSavers = new Map();
  let versions = null;
  let customers = null, custQ = '';
  let dash = null;
  let txData = null, txFilter = 'all', cashData = null, closeData = null;
  let insightData = null, planData = null, giftData = null, deviceData = null;
  let apptData = null, shiftData = null, clockData = null;
  let bills = null, billFilter = 'all', billQ = '';
  const lastTab = { office: 'start', site: 'design' };
  const modeOf = (k) => (tabs.find(([t]) => t === k) || tabs[0])[3];
  let team = null;
  let pushIsOn = null;
  pushOn().then((v) => { pushIsOn = v; }).catch(() => { pushIsOn = false; });
  let notify = null;         // set while building a form whose changes are not part of the site draft

  /* ---------- saving and preview ---------- */

  const frame = h('iframe', { title: 'Live preview of your site' });
  const stageIn = h('div', { class: 'stage-in' }, frame);
  const holder = h('div', { class: 'holder' }, stageIn);
  const stage = h('div', { class: 'ed-stage' }, holder);
  let painted = '';
  function paint(force) {
    const out = renderPage(draft, page, { preview: true, base: '', menu: applyMods(pricedMenu(menu, ordering), ordering), ordering, siteKey: id });
    const doc = frame.contentDocument;
    const vars = doc?.getElementById('pf-vars');
    if (!force && vars && painted === page && doc.body) {
      vars.textContent = out.vars;
      doc.body.innerHTML = out.body;
      frame.contentWindow.pfOrderInit?.();
    } else {
      frame.srcdoc = out.html;
      painted = page;
    }
  }
  let raf = 0;
  const repaint = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => paint()); };

  const save = debounce(async () => {
    if (saveState === 'saving') return save();
    saveState = 'saving'; paintTop();
    try {
      const body = JSON.stringify(draft);
      const r = await api('PUT', `/api/sites/${id}`, { draft: JSON.parse(body), rev: draftRev });
      meta = { ...meta, ...r.site }; draftRev = r.site.draftRev;
      if (saveState === 'saving') saveState = 'saved';
      title(meta.name);
    } catch (e) { saveState = 'error'; toast(e.message, true); if (e.status === 412) stale(); }
    paintTop();
  }, 800);
  const draftChanged = () => changed();
  const history = [JSON.stringify(draft)];
  let at = 0;
  const snap = debounce(() => { const now = JSON.stringify(draft); if (now === history[at]) return; history.splice(at + 1); history.push(now); if (history.length > 80) history.shift(); at = history.length - 1; paintTop(); }, 500);
  function travel(by) {
    snap.flush();
    if (at + by < 0 || at + by >= history.length) return;
    at += by;
    const was = JSON.parse(history[at]);
    for (const k of Object.keys(draft)) delete draft[k];
    Object.assign(draft, was);
    sel = null; saveState = 'dirty'; if (meta.live) meta.dirty = true;
    repaint(); save(); paintPanel(); paintTop();
  }
  function changed() { saveState = 'dirty'; if (meta.live) meta.dirty = true; repaint(); save(); snap(); paintTop(); }
  const flush = async () => { if (saveState !== 'saved') await save.flush(); };

  /* ---------- form controls ---------- */

  const wrap = (label, control, hint) => h('label', { class: 'field' }, label && h('span', {}, label), control, hint && h('small', {}, hint));
  const text = (label, o, k, { hint, ...a } = {}, fire = notify || changed) => wrap(label, h('input', { value: str(o[k]), oninput: (e) => { o[k] = e.target.value; fire(); }, ...a }), hint);
  const area = (label, o, k, { hint, ...a } = {}, fire = notify || changed) => wrap(label, h('textarea', { rows: 3, value: str(o[k], 60000), oninput: (e) => { o[k] = e.target.value; fire(); }, ...a }), hint);
  const toggle = (label, o, k, on = (v) => v !== false, after, fire = notify || changed) => h('label', { class: 'switch' }, h('span', {}, label), h('input', { type: 'checkbox', checked: (on || ((v) => v !== false))(o[k]), onchange: (e) => { o[k] = e.target.checked; fire(); after?.(); } }), h('i'));
  function seg(label, o, k, options, after) {
    const el = h('div', { class: 'seg', role: 'group', 'aria-label': label });
    const draw = () => el.replaceChildren(...Object.entries(options).map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String((o[k] ?? '') === v), onclick: () => { o[k] = v; draw(); changed(); after?.(); } }, l.name || l)));
    draw();
    return h('div', { class: 'field' }, h('span', {}, label), el);
  }
  function image(label, o, k, a = {}) {
    const changed = notify || draftChanged;
    const box = h('div', { class: 'field' });
    const take = async (file, zone) => {
      if (!file) return;
      zone.classList.add('busy');
      try { o[k] = await uploadImage(file, a.crop); a.after?.(); changed(); } catch (ex) { toast(ex.message, true); }
      draw();
    };
    const draw = () => {
      const has = !!o[k];
      const zone = h('div', { class: `imgz ${a.logo ? 'logo' : ''} ${has ? 'has' : ''}`, role: 'button', tabindex: '0', 'aria-label': has ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`,
        style: has ? `background-image:url("${o[k]}")` : '',
        onclick: async () => take((await pickFiles())[0], zone), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zone.click(); } },
        ondragover: (e) => { e.preventDefault(); zone.classList.add('over'); }, ondragleave: () => zone.classList.remove('over'),
        ondrop: (e) => { e.preventDefault(); zone.classList.remove('over'); take(e.dataTransfer.files[0], zone); } },
        !has && h('span', { class: 'ph' }, ic('image', 22), h('b', {}, 'Add a photo'), h('small', {}, 'Click or drop an image here')),
        has && h('span', { class: 'bar' }, h('em', {}, 'Replace'), h('button', { type: 'button', onclick: (e) => { e.stopPropagation(); o[k] = ''; a.after?.(); changed(); draw(); } }, 'Remove')),
        h('span', { class: 'spin' }, h('i', { class: 'spinner' })));
      box.replaceChildren(...[h('span', {}, label), zone, a.hint && h('small', {}, a.hint)].filter(Boolean));
    };
    draw();
    return box;
  }
  /* A picker that shows what each choice looks like. */
  function pick(label, o, k, options, art, after) {
    const el = h('div', { class: 'picks', role: 'group', 'aria-label': label, style: `--n:${Math.min(Object.keys(options).length, 4)}` });
    const draw = () => el.replaceChildren(...Object.entries(options).map(([v, l]) => h('button', { type: 'button', class: 'pk', 'aria-pressed': String((o[k] ?? '') === v), onclick: () => { o[k] = v; draw(); changed(); after?.(); } },
      h('span', { class: 'art', html: art(v) }), h('small', {}, l.name || l))));
    draw();
    return h('div', { class: 'field' }, h('span', {}, label), el);
  }
  const ac = () => draft.theme.accent;
  const ART = {
    headerLayout: (v) => ({ left: '<span class="dg bar"><em class="lg"></em><i></i><em class="ln"></em><em class="ln"></em><em class="bt"></em></span>', center: '<span class="dg bar col"><em class="lg"></em><span><em class="ln"></em><em class="ln"></em><em class="ln"></em></span></span>', mid: '<span class="dg bar"><em class="lg"></em><i></i><em class="ln"></em><em class="ln"></em><i></i><em class="bt"></em></span>' }[v]),
    surface: (v) => `<span class="dg chip" style="background:${{ glass: '#fff', plain: '#fff', '': '#fff', soft: '#f0f0f3', brand: ac(), dark: '#111113' }[v]};${v === 'brand' || v === 'dark' ? 'color:#fff' : ''}"><em class="ln"></em><em class="ln s"></em></span>`,
    footer: (v) => (v === 'simple' ? '<span class="dg foot col"><em class="lg"></em><span><em class="ln"></em><em class="ln"></em><em class="ln"></em></span></span>' : '<span class="dg foot"><span><em class="lg"></em><em class="ln"></em></span><span><em class="ln"></em><em class="ln"></em></span><span><em class="ln"></em><em class="ln"></em></span></span>'),
    font: (v) => `<span class="dg aa" style="font-family:${FONTS[v].head.replace(/"/g, '&quot;')}">Aa</span>`,
    radius: (v) => `<span class="dg shape"><em style="border-radius:${RADII[v].btn > 30 ? 8 : Math.round(RADII[v].btn / 3)}px"></em><i style="border-radius:${Math.round(RADII[v].r / 2.6)}px"></i></span>`,
    hero: (v) => ({ center: '<span class="dg hero c"><em class="h"></em><em class="ln"></em><em class="bt"></em></span>', split: '<span class="dg hero s"><span><em class="h"></em><em class="ln"></em><em class="bt"></em></span><i></i></span>', cover: '<span class="dg hero f"><em class="h"></em><em class="ln"></em><em class="bt"></em></span>' }[v]),
    items: (v) => ({ cards: '<span class="dg its cards"><i></i><i></i><i></i></span>', tiles: '<span class="dg its tiles"><span><em class="ln"></em><i></i></span><span><em class="ln"></em><i></i></span></span>', list: '<span class="dg its list"><em class="ln"></em><em class="ln"></em><em class="ln"></em></span>' }[v]),
  };
  const SECTION_ICONS = { hero: 'megaphone', about: 'text', services: 'layers', menu: 'menu', features: 'wand', gallery: 'images', testimonials: 'quote', faq: 'help', cta: 'flag', contact: 'call' };
  function linkField(label, o, k) {
    o[k] = o[k] && typeof o[k] === 'object' ? o[k] : { label: '', href: '' };
    const targets = draft.sections.filter((s) => s.enabled && s.nav).map((s) => [`#${s.nav.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, `${s.nav} section`]);
    const listId = uid('dl');
    return h('div', { class: 'field' }, h('span', {}, label), h('div', { class: 'pair' },
      h('input', { placeholder: 'Button text', 'aria-label': `${label} text`, value: str(o[k].label), oninput: (e) => { o[k].label = e.target.value; changed(); } }),
      h('input', { placeholder: 'Link or #section', 'aria-label': `${label} link`, list: listId, value: str(o[k].href), oninput: (e) => { o[k].href = e.target.value; changed(); } })),
      h('datalist', { id: listId }, targets.map(([v, l]) => h('option', { value: v }, l)), draft.business.phone && h('option', { value: draft.business.phone }, 'Call us'), draft.business.payUrl && h('option', { value: draft.business.payUrl }, 'Pay online')),
      h('small', {}, 'Leave the text empty to hide this button.'));
  }
  function move(list, i, by) { const j = i + by; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; changed(); paintPanel(); }
  function list(label, o, k, { make, name, fields, add = 'Add item', max = 40 }) {
    o[k] = Array.isArray(o[k]) ? o[k] : [];
    const items = o[k];
    return h('div', { class: 'field' }, h('span', {}, label),
      items.map((it, i) => {
        const key = `${k}:${i}:${sel || tab}`;
        const open = openItems.has(key);
        const head = h('button', { type: 'button', class: 't', 'aria-expanded': String(open), onclick: () => { open ? openItems.delete(key) : openItems.add(key); paintPanel(); } }, name(it) || 'Untitled');
        return h('div', { class: 'item', oninput: () => { head.textContent = name(it) || 'Untitled'; } },
          h('header', {},
            head,
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { openItems.clear(); move(items, i, -1); } }, ic('up', 16)),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move down', disabled: i === items.length - 1, onclick: () => { openItems.clear(); move(items, i, 1); } }, ic('down', 16)),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove', onclick: () => { items.splice(i, 1); openItems.clear(); changed(); paintPanel(); } }, ic('trash', 16))),
          open && h('div', { class: 'in' }, fields(it)));
      }),
      items.length < max && h('button', { type: 'button', class: 'btn soft sm', style: 'justify-self:start', onclick: () => { items.push(make()); openItems.add(`${k}:${items.length - 1}:${sel || tab}`); changed(); paintPanel(); } }, ic('plus', 14), add));
  }
  function iconPick(o, k) {
    const el = h('div', { class: 'icons' });
    const draw = () => el.replaceChildren(...Object.keys(ICONS).map((name) => h('button', { type: 'button', 'aria-label': name, 'aria-pressed': String(o[k] === name), html: svg(ICONS[name], 19), onclick: () => { o[k] = name; draw(); changed(); } })));
    draw();
    return h('div', { class: 'field' }, h('span', {}, 'Icon'), el);
  }
  function galleryField(d) {
    d.images = Array.isArray(d.images) ? d.images : [];
    return h('div', { class: 'field' }, h('span', {}, 'Photos'), h('div', { class: 'gal-ed' },
      d.images.map((im, i) => h('div', { class: 'g', style: `background-image:url("${im.src}")` }, h('button', { type: 'button', 'aria-label': 'Remove photo', onclick: () => { d.images.splice(i, 1); changed(); paintPanel(); } }, ic('x', 12)))),
      d.images.length < 24 && h('button', { type: 'button', class: 'add', onclick: async (e) => {
        const files = await pickFiles(true);
        if (!files.length) return;
        e.target.textContent = 'Uploading…'; e.target.disabled = true;
        for (const f of files.slice(0, 24 - d.images.length)) { try { d.images.push({ src: await uploadImage(f), alt: '' }); } catch (ex) { toast(ex.message, true); } }
        changed(); paintPanel();
      } }, '+ Add')), h('small', {}, 'Square photos look best. Add at least five for the featured layout.'));
  }
  const group = (titleText, ...kids) => h('div', { class: 'group' }, titleText && h('h3', {}, titleText), ...kids);
  const note = (...kids) => h('p', { class: 'note' }, ...kids);

  /* ---------- section forms ---------- */

  const FORMS = {
    hero: (d) => [text('Small label', d, 'eyebrow', { hint: 'Optional. Appears above the headline.' }), area('Headline', d, 'title', { rows: 2 }), area('Supporting text', d, 'subtitle'),
      linkField('Main button', d, 'primary'), linkField('Second button', d, 'secondary'), pick('Layout', d, 'layout', HERO_LAYOUTS, ART.hero, paintPanel), toggle('Show my logo above the headline', d, 'showLogo', (v) => v === true), image('Photo', d, 'image', { hint: d.layout === 'cover' ? 'Full image needs a photo. Wide photos work best.' : 'Optional.' })],
    about: (d) => [text('Heading', d, 'title'), area('Your story', d, 'body', { rows: 7, hint: 'Leave an empty line between paragraphs.' }), image('Photo', d, 'image', { hint: 'Optional. Portrait photos work best.' }),
      list('Numbers', d, 'stats', { add: 'Add a number', max: 4, make: () => ({ value: '10+', label: 'Years in business' }), name: (x) => `${x.value} ${x.label}`.trim(), fields: (x) => [h('div', { class: 'pair' }, text('Number', x, 'value'), text('Label', x, 'label'))] })],
    services: (d) => [text('Heading', d, 'title'), text('Supporting text', d, 'subtitle'), pick('Item style', d, 'layout', SERVICE_LAYOUTS, ART.items, paintPanel),
      list('Items', d, 'items', { add: 'Add item', make: () => ({ name: 'New item', desc: '', price: '', image: '' }), name: (x) => x.name,
        fields: (x) => [text('Name', x, 'name'), area('Description', x, 'desc', { rows: 2 }), text('Price', x, 'price', { placeholder: '$0.00', hint: 'Optional. Type it exactly as it should appear.' }), d.layout !== 'list' && image('Photo', x, 'image')] })],
    features: (d) => [text('Heading', d, 'title'), text('Supporting text', d, 'subtitle'),
      list('Highlights', d, 'items', { add: 'Add highlight', max: 9, make: () => ({ icon: 'star', title: 'New highlight', desc: '' }), name: (x) => x.title, fields: (x) => [text('Title', x, 'title'), area('Description', x, 'desc', { rows: 2 }), iconPick(x, 'icon')] })],
    gallery: (d) => [text('Heading', d, 'title'), galleryField(d)],
    testimonials: (d) => [text('Heading', d, 'title'),
      list('Reviews', d, 'items', { add: 'Add review', max: 12, make: () => ({ quote: '', name: '', role: '' }), name: (x) => x.name || 'New review', fields: (x) => [area('Review', x, 'quote'), h('div', { class: 'pair' }, text('Name', x, 'name'), text('Detail', x, 'role', { placeholder: 'Optional' }))] })],
    faq: (d) => [text('Heading', d, 'title'),
      list('Questions', d, 'items', { add: 'Add question', make: () => ({ q: '', a: '' }), name: (x) => x.q || 'New question', fields: (x) => [text('Question', x, 'q'), area('Answer', x, 'a')] })],
    cta: (d) => [area('Heading', d, 'title', { rows: 2 }), area('Supporting text', d, 'subtitle', { rows: 2 }), linkField('Button', d, 'button')],
    menu: (d) => [text('Heading', d, 'title'), text('Supporting text', d, 'subtitle'), toggle('Show item photos', d, 'showPhotos'),
      note('This section shows your live item list. Edit items, prices and stock in ', h('b', {}, 'Menu and inventory'), '.')],
    contact: (d) => [text('Heading', d, 'title'), area('Supporting text', d, 'subtitle', { rows: 2 }), toggle('Message form', d, 'showForm'), toggle('Show opening hours', d, 'showHours'),
      note('Your address, phone, email and hours come from the ', h('b', {}, 'Business'), ' tab. Messages arrive in your ', h('b', {}, 'Inbox'), '.')],
  };

  /* ---------- panels ---------- */

  const PANELS = {
    design() {
      const sw = h('div', { class: 'swatches' });
      const t = draft.theme;
      const drawSw = () => sw.replaceChildren(...ACCENTS.map((a) => h('button', { type: 'button', class: 'swatch', style: `background:${a.value}`, title: a.name, 'aria-label': a.name, 'aria-pressed': String(t.accent.toLowerCase() === a.value), onclick: () => { t.accent = a.value; drawSw(); syncHex(); changed(); } })),
        h('label', { class: 'swatch custom', title: 'Custom colour', 'aria-pressed': String(!ACCENTS.some((a) => a.value === t.accent.toLowerCase())) }, h('input', { type: 'color', value: t.accent, 'aria-label': 'Custom colour', oninput: (e) => { t.accent = e.target.value; syncHex(); changed(); }, onchange: drawSw })));
      const syncHex = () => { const box = panel.querySelector('.hexrow'); if (box) { box.firstChild.style.background = t.accent; box.children[1].value = t.accent.toUpperCase(); } };
      drawSw();
      const hexIn = h('div', { class: 'hexrow' }, h('i', { style: `background:${t.accent}` }), h('input', { value: t.accent.toUpperCase(), maxlength: 7, spellcheck: 'false', 'aria-label': 'Brand colour hex code', oninput: (e) => { let v = e.target.value.trim(); if (v && v[0] !== '#') v = `#${v}`; if (/^#[0-9a-f]{6}$/i.test(v)) { t.accent = v.toLowerCase(); e.target.previousSibling.style.background = v; drawSw(); changed(); } } }), h('small', {}, 'Have a brand colour code? Paste it here.'));
      const bgSw = h('div', { class: 'swatches' });
      const curBg = () => (t.bg || (t.mode === 'dark' ? '#000000' : '#ffffff')).toLowerCase();
      const drawBg = () => bgSw.replaceChildren(...BACKGROUNDS.map((b) => h('button', { type: 'button', class: 'swatch', style: `background:${b.value}`, title: b.name, 'aria-label': b.name, 'aria-pressed': String(curBg() === b.value), onclick: () => { t.bg = b.value; drawBg(); changed(); } })),
        h('label', { class: 'swatch custom', title: 'Custom background', 'aria-pressed': String(!BACKGROUNDS.some((b) => b.value === curBg())) }, h('input', { type: 'color', value: curBg(), 'aria-label': 'Custom background colour', oninput: (e) => { t.bg = e.target.value; changed(); }, onchange: drawBg })));
      drawBg();
      const looks = h('div', { class: 'looks' }, Object.entries(QUICK_STYLES).map(([k, q]) => h('button', { type: 'button', class: `look look-${k}`, onclick: () => { applyQuickStyle(draft, k); changed(); paintPanel(); toast(`${q.name} style applied`); } },
        h('span', { class: 'lk', style: `--b:${t.accent}` }, h('i'), h('i'), h('i')), h('b', {}, q.name), h('small', {}, q.blurb))));
      return [
        group('Quick style', h('p', { class: 'hint' }, 'One tap sets where your brand colour appears across the whole site. Fine-tune anything below.'), looks),
        group('Brand', text('Business name', draft.brand, 'name', { maxlength: 80 }), text('Tagline', draft.brand, 'tagline', { hint: 'A short line shown in your footer and search results.' }),
          image('Logo', draft.brand, 'logo', { logo: true, hint: 'PNG or SVG with a transparent background works best.', after: () => { if (draft.brand.logo && draft.brand.logoMode === 'text') draft.brand.logoMode = 'image'; paintPanel(); } }),
          draft.brand.logo && seg('Show in header', draft.brand, 'logoMode', { image: 'Logo', both: 'Logo and name', text: 'Name only' }),
          seg('Site language', draft, 'lang', LANGS), h('small', { class: 'hint' }, 'Changes the built-in words on your site, such as buttons, the order page and form labels. Your own text stays as you wrote it.')),
        group('Colours', h('div', { class: 'field' }, h('span', {}, 'Brand colour'), sw, hexIn, h('small', {}, 'Buttons, links and any part set to “Brand colour”.')),
          h('div', { class: 'field' }, h('span', {}, 'Page background'), bgSw, h('small', {}, 'Text switches between dark and light automatically so it stays readable.'))),
        group('Header', pick('Layout', draft.header, 'layout', HEADER_LAYOUTS, ART.headerLayout), pick('Colour', draft.header, 'style', HEADER_STYLES, ART.surface), linkField('Header button', draft.header, 'cta'),
          toggle('Keep header visible while scrolling', draft.header, 'sticky'), toggle('Show phone number', draft.header, 'showPhone', (v) => v === true)),
        group('Sections', h('p', { class: 'hint' }, 'Give any part of your home page its own background.'),
          h('div', { class: 'slist' }, draft.sections.filter((x) => x.enabled).map((x) => h('div', { class: 'srow', style: 'padding:8px 8px 8px 14px;gap:10px' }, h('b', { class: 'grow', style: 'font-weight:500;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, SECTION_TYPES[x.type].name),
            h('div', { class: 'seg', style: 'flex:none' }, Object.entries(SECTION_BACKGROUNDS).map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String((x.bg || '') === k), onclick: () => { x.bg = k; changed(); paintPanel(); } }, l.split(' ')[0])))))),
          h('button', { class: 'btn text sm', style: 'justify-self:start', onclick: () => goTab('sections') }, 'Edit, reorder or add sections')),
        group('Footer', pick('Layout', draft.footer, 'style', FOOTER_STYLES, ART.footer), pick('Colour', draft.footer, 'color', FOOTER_COLORS, ART.surface), area('Footer text', draft.footer, 'blurb', { rows: 2, placeholder: draft.brand.tagline || 'A short line about your business' }),
          toggle('Let visitors switch between light and dark', draft.footer, 'showMode'), toggle('Show accepted cards', draft.footer, 'showPayments'), toggle('Show “Website by Processor Freedom”', draft.footer, 'showCredit')),
        group('Type and shape', pick('Typeface', t, 'font', FONTS, ART.font), pick('Corners', t, 'radius', RADII, ART.radius)),
        group('Announcement bar', toggle('Show a message above the header', draft.announcement, 'enabled', (v) => v === true, paintPanel),
          draft.announcement.enabled && [text('Message', draft.announcement, 'text', { placeholder: 'Now open Sundays' }), text('Link', draft.announcement, 'href', { placeholder: 'Optional' })]),
      ];
    },

    sections() {
      let dragSec = null;
      const s = sel && draft.sections.find((x) => x.id === sel);
      if (s) {
        return [h('button', { class: 'back', onclick: () => { sel = null; paintPanel(); } }, ic('back', 16), 'All sections'),
          h('h2', {}, SECTION_TYPES[s.type].name),
          group('', ...FORMS[s.type](s.data).filter(Boolean)),
          group('Background', pick('Section background', s, 'bg', SECTION_BACKGROUNDS, ART.surface)),
          group('Position', h('div', { class: 'row' }, h('button', { class: 'btn soft sm', disabled: draft.sections.indexOf(s) === 0, onclick: () => { const i = draft.sections.indexOf(s); move(draft.sections, i, -1); scrollPreview(s.id); } }, ic('up', 14), 'Move up'), h('button', { class: 'btn soft sm', disabled: draft.sections.indexOf(s) === draft.sections.length - 1, onclick: () => { const i = draft.sections.indexOf(s); move(draft.sections, i, 1); scrollPreview(s.id); } }, ic('down', 14), 'Move down'))),
          group('Menu', text('Menu label', s, 'nav', { maxlength: 24, hint: 'Shown in your site’s navigation. Leave empty to keep this section out of the menu.' })),
          group('', h('button', { class: 'btn danger', style: 'justify-self:start', onclick: async () => {
            if (!await confirmSheet({ title: 'Remove this section?', text: 'Its content will be deleted from your draft.', action: 'Remove', danger: true })) return;
            draft.sections = draft.sections.filter((x) => x.id !== s.id); sel = null; changed(); paintPanel();
          } }, 'Remove section'))];
      }
      return [
        group('Home page', h('p', { class: 'hint' }, 'Sections appear on your page in this order. Drag to rearrange, switch one off to hide it, or select it to edit. You can also click anything in the preview.'),
          h('div', { class: 'slist' }, draft.sections.map((x, i) => h('div', { class: `srow secrow ${x.enabled ? '' : 'off'}`, draggable: 'true',
            ondragstart: (e) => { dragSec = i; e.dataTransfer.effectAllowed = 'move'; }, ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }, ondragleave: (e) => e.currentTarget.classList.remove('over'),
            ondrop: (e) => { e.preventDefault(); if (dragSec === null || dragSec === i) return paintPanel(); const [moved] = draft.sections.splice(dragSec, 1); draft.sections.splice(i, 0, moved); dragSec = null; changed(); paintPanel(); } },
            h('span', { class: 'grip', title: 'Drag to reorder' }, ic('grip', 16)), h('span', { class: 'sico' }, ic(SECTION_ICONS[x.type] || 'doc', 16)),
            h('button', { class: 't', onclick: () => { sel = x.id; openItems.clear(); goTab('sections'); sel = x.id; paintPanel(); scrollPreview(x.id); } }, h('b', {}, SECTION_TYPES[x.type].name), h('span', {}, str(x.data.title) || SECTION_TYPES[x.type].blurb)),
            h('label', { class: 'switch', title: x.enabled ? 'Shown' : 'Hidden' }, h('input', { type: 'checkbox', 'aria-label': `Show ${SECTION_TYPES[x.type].name}`, checked: x.enabled, onchange: (e) => { x.enabled = e.target.checked; changed(); paintPanel(); } }), h('i'))))),
          h('button', { class: 'btn soft', style: 'justify-self:start', onclick: addSection }, ic('plus', 16), 'Add section')),
      ];
    },

    business() {
      const b = draft.business;
      return [
        group('Business information', text('Email', b, 'email', { type: 'email' }), text('Phone', b, 'phone', { type: 'tel' }), text('Street address', b, 'address1'),
          h('div', { class: 'pair' }, text('City', b, 'city'), h('div', { class: 'pair' }, text('State', b, 'state'), text('ZIP', b, 'zip')))),
        group('Opening hours', list('', b, 'hours', { add: 'Add hours', max: 10, make: () => ({ label: 'Monday – Friday', value: '9:00 AM – 5:00 PM' }), name: (x) => `${x.label}  ·  ${x.value}`, fields: (x) => [h('div', { class: 'pair' }, text('Days', x, 'label'), text('Hours', x, 'value'))] })),
        group('Payments', text('Online payment link', b, 'payUrl', { placeholder: 'https://', hint: 'Your Processor Freedom payment page. Adds “Pay online” to your footer and makes it available for buttons.' })),
        group('Social profiles', ...[['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['x', 'X'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn']].map(([k, l]) => text(l, draft.social, k, { placeholder: '@username or link' }))),
      ];
    },

    policies() {
      const L = draft.legal;
      return [
        group('Store policies', h('p', { class: 'hint' }, 'These pages are written for you from your business details and linked in your footer. They update automatically until you choose to write your own.'),
          text('Legal business name', draft.business, 'legalName', { placeholder: draft.brand.name, hint: 'If different from your business name, e.g. “Los Socios LLC”.' }), text('Effective date', L, 'effective')),
        ...Object.entries(LEGAL_PAGES).map(([k, name]) => {
          const p = L[k];
          const own = !!str(p.custom).trim();
          return group(name, toggle('Include this page', p, 'enabled', undefined, () => { if (page === k && !p.enabled) setPage('home'); paintPanel(); paintTop(); }),
            p.enabled && h('div', { class: 'row', style: 'flex-wrap:wrap' },
              h('button', { class: 'btn soft sm', onclick: () => setPage(k) }, 'View page'),
              own ? h('button', { class: 'btn text sm', onclick: () => { p.custom = ''; changed(); paintPanel(); } }, 'Use the generated version')
                : h('button', { class: 'btn text sm', onclick: () => { p.custom = legalText(k, draft); setPage(k); changed(); paintPanel(); } }, 'Write my own')),
            p.enabled && own && area('', p, 'custom', { rows: 14, 'aria-label': `${name} text`, hint: 'Start a line with ## for a heading or - for a bullet. Leave an empty line between paragraphs.' }));
        }),
        note('These are starting templates, not legal advice. Have a professional review them for your business and location.'),
      ];
    },

    seo() {
      const s = draft.seo;
      const hero = draft.sections.find((x) => x.type === 'hero' && x.enabled)?.data || {};
      const autoTitle = draft.brand.tagline ? `${draft.brand.name} · ${draft.brand.tagline}` : draft.brand.name;
      const autoDesc = str(hero.subtitle) || draft.brand.tagline;
      const pv = h('div', { class: 'note', style: 'background:#fff;color:#1d1d1f;box-shadow:inset 0 0 0 1px var(--line)' });
      const count = (o, k, max) => { const el = h('small', {}); const draw = () => { el.textContent = `${str(o[k]).length}/${max} characters`; }; draw(); return [el, draw]; };
      const [dc, drawDc] = count(s, 'description', 200);
      const [kc, drawKc] = count(s, 'keywords', 200);
      const drawPv = () => pv.replaceChildren(h('div', { class: 'small', style: 'color:#1e8e3e' }, meta.url.replace(/^https?:\/\//, '').replace(/\/$/, '')), h('div', { style: 'color:#1a0dab;font-size:17px;margin:2px 0' }, str(s.title).trim() || autoTitle), h('div', { class: 'small' }, str(s.description).trim() || autoDesc));
      drawPv();
      const on = (fn) => ({ oninput: (e) => { s[e.target.dataset.k] = e.target.value; fn?.(); drawPv(); changed(); } });
      return [
        group('Search engine optimization', h('p', { class: 'hint' }, 'Help customers find you by describing your business for search engines.'),
          h('div', { class: 'field' }, h('span', {}, 'Search preview'), pv),
          wrap('Page title', h('input', { value: str(s.title), placeholder: autoTitle, maxlength: 70, 'data-k': 'title', ...on() })),
          wrap('Meta description', h('textarea', { rows: 4, value: str(s.description), placeholder: autoDesc, maxlength: 200, 'data-k': 'description', ...on(drawDc) }), ''), dc,
          wrap('Meta keywords', h('textarea', { rows: 3, value: str(s.keywords), placeholder: 'Comma separated keywords you would like to be known for', maxlength: 200, 'data-k': 'keywords', ...on(drawKc) }), ''), kc),
        group('Sharing', image('Social sharing image', s, 'image', { hint: 'Shown when your site is shared in messages and on social media. Defaults to your hero photo.' })),
      ];
    },

    domain() {
      const out = [];
      /* Free address */
      const result = h('div', { 'aria-live': 'polite' });
      const rules = h('div', { class: 'note stack', style: 'gap:8px' });
      const input = h('input', { value: meta.slug, 'aria-label': 'Web address', maxlength: 40, autocapitalize: 'none', spellcheck: 'false', oninput: () => { drawRules(); result.replaceChildren(); } });
      const checkBtn = h('button', { class: 'btn soft sm', onclick: async () => {
        const slug = cleanSlug(input.value); input.value = slug; drawRules();
        const r = await api('GET', `/api/address?${new URLSearchParams({ slug, site: id })}`);
        if (slug === meta.slug) return result.replaceChildren(h('span', { class: 'status ok' }, 'This is your current address'));
        result.replaceChildren(h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('span', { class: `status ${r.available ? 'ok' : 'bad'}` }, r.available ? `${r.address} is available` : r.problem),
          r.available && h('button', { class: 'btn sm', onclick: async () => {
            if (meta.live && !await confirmSheet({ title: 'Change your address?', text: `Your site will move to ${r.address}. The old address will stop working right away.`, action: 'Change address' })) return;
            try { meta = { ...meta, ...(await api('PUT', `/api/sites/${id}/address`, { slug })).site }; toast('Address updated'); paintPanel(); paintTop(); } catch (e) { toast(e.message, true); }
          } }, 'Use this address')),
          !r.available && r.suggestions.length > 0 && h('div', { class: 'row', style: 'flex-wrap:wrap;margin-top:8px' }, r.suggestions.map((sug) => h('button', { class: 'chip', onclick: () => { input.value = sug; checkBtn.click(); } }, sug))));
      } }, ic('search', 14), 'Check availability');
      function drawRules() {
        const v = input.value.trim().toLowerCase();
        const checks = [[v.length >= 3 && v.length <= 40, 'Between 3 and 40 characters'], [/^[a-z0-9-]*$/.test(v) && v.length > 0, 'Only letters, numbers and hyphens'], [v.length > 0 && !/^-|-$|--/.test(v), 'No hyphen at the start or end, and none in a row']];
        rules.replaceChildren(h('b', {}, 'Address rules'), ...checks.map(([ok, t]) => h('div', { class: 'row', style: `gap:8px;color:${ok ? 'var(--green)' : 'var(--muted)'}` }, ic(ok ? 'ok' : 'dot', 16), h('span', { style: 'color:var(--ink)' }, t))));
        checkBtn.disabled = !checks.every(([ok]) => ok);
      }
      drawRules();
      out.push(group('Your free address', h('p', { class: 'hint' }, 'Choose the address for your website. Do not add “www”.'),
        h('div', { class: 'addrbox' }, state.config.addressPrefix && h('span', { class: 'pre' }, state.config.addressPrefix), input, state.config.addressSuffix && h('span', {}, state.config.addressSuffix)),
        rules, h('div', { class: 'row' }, checkBtn), result));

      /* Own domain */
      if (!meta.customDomain) {
        const dom = h('input', { placeholder: 'yourbusiness.com', 'aria-label': 'Your domain', autocapitalize: 'none', spellcheck: 'false' });
        out.push(group('Use a domain you own', h('p', { class: 'hint' }, 'Already have a domain? Connect it and your site will answer there too.'),
          h('form', { class: 'row', onsubmit: async (e) => { e.preventDefault(); try { meta = { ...meta, ...(await api('POST', `/api/sites/${id}/domain`, { domain: dom.value })).site }; paintPanel(); } catch (ex) { toast(ex.message, true); } } }, h('label', { class: 'field grow' }, dom), h('button', { class: 'btn sm' }, 'Connect'))));
      } else {
        const res = h('div', { 'aria-live': 'polite' });
        out.push(group('Your domain', h('div', { class: 'row' }, h('b', { class: 'grow', style: 'font-size:17px;overflow-wrap:anywhere' }, meta.customDomain), h('span', { class: `status ${meta.domainVerified ? 'ok' : 'warn'}` }, meta.domainVerified ? 'Connected' : 'Waiting for DNS')),
          !meta.domainVerified && [h('p', { class: 'hint' }, 'Sign in where you bought your domain and add these two DNS records. Changes can take up to an hour to appear.'),
            h('table', { class: 'dns' }, h('thead', {}, h('tr', {}, h('th', {}, 'Type'), h('th', {}, 'Name'), h('th', {}, 'Value'))), h('tbody', {},
              h('tr', {}, h('td', {}, 'CNAME'), h('td', {}, 'www'), h('td', {}, state.config.cnameTarget)),
              h('tr', {}, h('td', {}, 'ALIAS'), h('td', {}, '@'), h('td', {}, state.config.cnameTarget)))),
            h('p', { class: 'hint' }, 'If your provider does not offer ALIAS or ANAME records, forward the bare domain to the www address instead.')],
          h('div', { class: 'row' },
            !meta.domainVerified && h('button', { class: 'btn sm', onclick: async (e) => {
              e.target.disabled = true; e.target.textContent = 'Checking…';
              try {
                const r = await api('POST', `/api/sites/${id}/domain/verify`);
                meta = { ...meta, ...r.site };
                if (r.ok) { toast('Your domain is connected'); paintPanel(); paintTop(); return; }
                res.replaceChildren(h('p', { class: 'status warn' }, 'We could not see the records yet. Give it a few minutes and check again.'));
              } catch (ex) { toast(ex.message, true); }
              e.target.disabled = false; e.target.textContent = 'Check connection';
            } }, 'Check connection'),
            h('button', { class: 'btn danger sm', onclick: async () => {
              if (!await confirmSheet({ title: 'Disconnect this domain?', text: 'Your site will stay available at your free address.', action: 'Disconnect', danger: true })) return;
              meta = { ...meta, ...(await api('DELETE', `/api/sites/${id}/domain`)).site }; paintPanel(); paintTop();
            } }, 'Disconnect')), res));
      }

      /* Concierge */
      if (!meta.customDomain || !meta.domainVerified) {
        if (request === undefined) api('GET', `/api/sites/${id}/domain-request`).then((r) => { request = r.request; if (tab === 'domain') paintPanel(); }).catch(() => { request = null; });
        const want = h('input', { placeholder: 'e.g. lossocioscafe.com', 'aria-label': 'Domain you would like', value: request?.status === 'open' ? request.desired : '' });
        out.push(group('Let us set one up for you', h('p', { class: 'hint' }, 'Don’t have a domain? Tell us the name you’d like and the Processor Freedom team will register and connect it for you.'),
          request?.status === 'open' && note(h('b', {}, 'Request received. '), `We’re working on ${request.desired} and will be in touch.`),
          h('form', { class: 'row', onsubmit: async (e) => { e.preventDefault(); try { await api('POST', `/api/sites/${id}/domain-request`, { desired: want.value }); request = { desired: want.value, status: 'open' }; toast('Request sent'); paintPanel(); } catch (ex) { toast(ex.message, true); } } },
            h('label', { class: 'field grow' }, want), h('button', { class: 'btn soft sm' }, request?.status === 'open' ? 'Update request' : 'Request domain'))));
      }
      return out;
    },

    menu() {
      const cats = [...new Set(menu.map((x) => x.category))];
      const metaOf = (c) => ordering.cats.find((x) => x.name === c);
      const catHead = (c) => { const m = metaOf(c); return h('div', { class: 'cathead' }, h('b', {}, c), m?.hidden && h('span', { class: 'tag' }, 'Hidden'), m?.from && h('span', { class: 'tag' }, `${m.from} – ${m.to}`), h('span', { class: 'grow' }), h('button', { class: 'btn text sm', onclick: () => editCategory(c, cats) }, 'Edit')); };
      let dragId = null;
      const dropOn = async (target) => {
        const moved = menu.find((x) => x.id === dragId);
        if (!moved || moved.id === target.id) return paintPanel();
        menu = menu.filter((x) => x.id !== moved.id);
        menu.splice(menu.findIndex((x) => x.id === target.id), 0, moved);
        try {
          if (moved.category !== target.category) { moved.category = target.category; await api('PUT', `/api/sites/${id}/menu/${moved.id}`, moved); }
          menu = (await api('PUT', `/api/sites/${id}/menu-order`, { ids: menu.map((x) => x.id) })).items;
        } catch (e) { toast(e.message, true); }
        paintPanel(); paint(true);
      };
      const stockText = (x) => (x.available === false ? 'Hidden' : x.stock === 0 ? 'Sold out' : `${x.stock} in stock`);
      return [
        group('Add items', h('p', { class: 'hint' }, 'Upload your item list and we build your menu. Changes here appear on your live site right away, with no need to publish.'),
          h('button', { class: 'drop', onclick: importCsv }, ic('up2', 24), h('b', {}, menu.length ? 'Upload a new item list' : 'Upload your item list'), h('span', { class: 'small' }, 'Excel or CSV file with item names and prices')),
          state.config.scanEnabled && h('button', { class: 'drop', onclick: scanMenu }, ic('camera', 24), h('b', {}, 'Scan a paper menu'), h('span', { class: 'small' }, 'Take a photo or upload a PDF and we read the items and prices')),
          h('div', { class: 'row', style: 'flex-wrap:wrap' },
            h('a', { class: 'btn soft sm', download: 'menu-template.csv', href: `data:text/csv;charset=utf-8,${encodeURIComponent(MENU_TEMPLATE_CSV)}` }, ic('dl', 14), 'Download template'),
            menu.length > 0 && h('button', { class: 'btn soft sm', onclick: bulkPhotos }, ic('image', 14), 'Add photos in bulk'),
            h('button', { class: 'btn soft sm', onclick: async () => { try { const before = new Set(menu.map((x) => x.id)); menu = (await api('POST', `/api/sites/${id}/menu`, { name: 'New item', price: 0, category: cats.at(-1) || 'Menu' })).items; paintPanel(); paint(true); openItem(menu.find((x) => !before.has(x.id))?.id); } catch (e) { toast(e.message, true); } } }, ic('plus', 14), 'Add item'))),
        ...cats.map((c) => group('', catHead(c), h('div', { class: 'slist' }, menu.filter((x) => x.category === c).map((x) => h('div', { class: `srow mrow ${x.available === false ? 'off' : ''}`, draggable: 'true', ondragstart: (e) => { dragId = x.id; e.dataTransfer.effectAllowed = 'move'; }, ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }, ondragleave: (e) => e.currentTarget.classList.remove('over'), ondrop: (e) => { e.preventDefault(); dropOn(x); } },
          h('span', { class: 'grip', title: 'Drag to reorder' }, ic('grip', 16)),
          h('div', { class: 'pv', style: x.image ? `background-image:url("${x.image}")` : '' }),
          h('button', { class: 't', onclick: () => openItem(x.id) }, h('b', {}, x.name), h('span', {}, [money(itemPrice(x)), stockText(x)].filter(Boolean).join(' · '))),
          h('label', { class: 'switch', title: 'Available to order' }, h('input', { type: 'checkbox', 'aria-label': `${x.name} available`, checked: x.available !== false, onchange: async (e) => { x.available = e.target.checked; await api('PUT', `/api/sites/${id}/menu/${x.id}`, x); paintPanel(); paint(true); } }), h('i'))))))),
        menu.length > 0 && group('', h('p', { class: 'hint' }, `${menu.length} item${menu.length === 1 ? '' : 's'} in ${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}. Drag an item to move it.`),
          !ordering.enabled && note('Online ordering is off, so customers can browse this menu but not order. Turn it on in ', h('b', {}, 'Ordering options'), '.'),
          h('button', { class: 'btn danger sm', style: 'justify-self:start', onclick: async () => { if (!await confirmSheet({ title: 'Remove every item?', text: 'Your whole menu will be deleted. Past orders are kept.', action: 'Remove all', danger: true })) return; menu = (await api('DELETE', `/api/sites/${id}/menu/all`)).items; paintPanel(); paint(true); } }, 'Remove all items')),
      ];
    },

    items() {
      const cats = [...new Set(menu.map((x) => x.category))];
      for (const sid of [...invSel]) if (!menu.some((x) => x.id === sid)) invSel.delete(sid);
      const saveOf = (it) => { if (!itemSavers.has(it.id)) itemSavers.set(it.id, debounce(async () => { try { await api('PUT', `/api/sites/${id}/menu/${it.id}`, it); } catch (e) { toast(e.message, true); } }, 450)); return itemSavers.get(it.id); };
      const stateOf = (it) => (it.available === false ? 'hidden' : it.stock === 0 ? 'out' : it.stock <= 5 ? 'low' : 'ok');
      const LABEL = { hidden: 'Hidden', out: 'Sold out', low: 'Low stock' };
      const shown = () => menu.filter((it) => (!invQ || `${it.name} ${it.category}`.toLowerCase().includes(invQ)) && (invFilter === 'all' || (invFilter === 'sale' ? it.sale > 0 : stateOf(it) === invFilter)));
      const list = h('div', { class: 'inv-list' });
      const chips = h('div', { class: 'inv-chips' });
      const kpis = h('div', { class: 'inv-kpis' });
      const bar = h('div', { class: 'bulk', role: 'region', 'aria-label': 'Bulk actions' });
      const drawTop = () => {
        const n = (k) => menu.filter((it) => stateOf(it) === k).length;
        const onSale = menu.filter((it) => it.sale > 0).length;
        kpis.replaceChildren(...[['Items', menu.length, 'tag'], ['Units in stock', menu.reduce((a, it) => a + (it.stock || 0), 0), 'cube'], ['Low stock', n('low'), 'alert'], ['Sold out', n('out'), 'x']].map(([l, v, icon]) => h('div', { class: 'kpi' }, h('span', { class: 'kico' }, ic(icon, 17)), h('span', { class: 'small muted' }, l), h('b', {}, v))));
        chips.replaceChildren(...[['all', `All · ${menu.length}`], ['low', `Low stock · ${n('low')}`], ['out', `Sold out · ${n('out')}`], ['hidden', `Hidden · ${n('hidden')}`], ...(onSale ? [['sale', `On sale · ${onSale}`]] : [])].map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': String(invFilter === k), onclick: () => { invFilter = k; drawTop(); drawList(); } }, l)));
      };
      const bulk = async (body, note) => {
        try { menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids: [...invSel], ...body })).items; if (body.delete) invSel.clear(); toast(note); drawTop(); drawList(); }
        catch (e) { toast(e.message, true); }
      };
      const drawBar = () => {
        const n = invSel.size;
        bar.hidden = !n;
        if (!n) return;
        const b = (label, fn, cls = 'soft') => h('button', { class: `btn ${cls} sm`, type: 'button', onclick: fn }, label);
        const pair = (label, onL, onFn, offL, offFn) => h('div', { class: 'bgroup' }, h('span', {}, label), h('div', { class: 'seg' }, h('button', { type: 'button', onclick: onFn }, onL), h('button', { type: 'button', onclick: offFn }, offL)));
        const items = n === 1 ? '1 item' : `${n} items`;
        bar.replaceChildren(h('b', {}, `${n} selected`),
          pair('Sales tax', 'On', () => bulk({ set: { taxable: true } }, `Sales tax on for ${items}`), 'Off', () => bulk({ set: { taxable: false } }, `Sales tax off for ${items}`)),
          pair('On the menu', 'Show', () => bulk({ set: { available: true } }, `${items} shown`), 'Hide', () => bulk({ set: { available: false } }, `${items} hidden`)),
          b('Quantity', async () => { const v = await ask({ title: `Set quantity for ${items}`, label: 'In stock', type: 'number', value: '', hint: 'Every selected item is set to this number.' }); if (v !== null && v !== '') bulk({ set: { stock: v } }, `Quantity set for ${items}`); }),
          b('Daily refill', async () => { const v = await ask({ title: `Refill ${items} every morning`, label: 'Refill to', type: 'number', value: '', hint: 'Each morning the quantity goes back to this number. Leave it empty to switch daily refill off.' }); if (v !== null) bulk({ set: { restock: v === '' ? null : v } }, v === '' ? `Daily refill off for ${items}` : `${items} will refill to ${Number(v)} each morning`); }),
          b('Sale', async () => { const v = await ask({ title: `Put ${items} on sale`, label: 'Percent off', type: 'number', value: '10', hint: 'Enter 0 to end a sale. Customers see the old price crossed out.' }); if (v !== null && v !== '') bulk({ set: { sale: v } }, Number(v) > 0 ? `${items} now ${Number(v)}% off` : `Sale ended for ${items}`); }),
          b('Price', async () => { const v = await ask({ title: `Change the price of ${items}`, label: 'Percent change', type: 'number', value: '5', hint: 'Use a minus sign to lower prices, for example -10.' }); if (v !== null && v !== '' && Number(v)) bulk({ set: { pricePercent: v } }, `Prices updated for ${items}`); }),
          b('Category', async () => { const v = await ask({ title: `Move ${items}`, label: 'Category', value: cats[0] || '', hint: 'Type an existing category or a new one.' }); if (v) bulk({ set: { category: v } }, `${items} moved to ${v}`); }),
          b('Delete', async () => { if (await confirmSheet({ title: `Delete ${items}?`, text: 'They are removed from your menu straight away. Past orders are kept.', action: 'Delete', danger: true })) bulk({ delete: true }, `${items} deleted`); }, 'danger'),
          h('span', { class: 'grow' }), h('button', { class: 'btn text sm', type: 'button', onclick: () => { invSel.clear(); drawList(); } }, 'Clear'));
      };
      const row = (it) => {
        const save = saveOf(it);
        const el = h('div', { class: `inv-row ${invSel.has(it.id) ? 'sel' : ''}` });
        const tag = h('span', { class: 'tag' });
        const refresh = () => { const st = stateOf(it); el.dataset.state = st; tag.textContent = LABEL[st] || ''; tag.hidden = !LABEL[st]; drawTop(); };
        const setPhoto = async (f) => { if (!f) return; photo.classList.add('busy'); try { it.image = await uploadImage(f, ITEM_PHOTO); photo.style.backgroundImage = `url("${it.image}")`; photo.replaceChildren(); save(); } catch (e) { toast(e.message, true); } photo.classList.remove('busy'); };
        const photo = h('button', { class: 'inv-photo', type: 'button', title: it.image ? 'Replace photo' : 'Add a photo', 'aria-label': `${it.image ? 'Replace' : 'Add'} photo for ${it.name}`, style: it.image ? `background-image:url("${it.image}")` : '',
          onclick: async () => setPhoto((await pickFiles())[0]), ondragover: (e) => { e.preventDefault(); photo.classList.add('over'); }, ondragleave: () => photo.classList.remove('over'), ondrop: (e) => { e.preventDefault(); photo.classList.remove('over'); setPhoto(e.dataTransfer.files[0]); } }, !it.image && ic('camera', 18));
        const price = h('input', { class: 'inv-in num', value: (it.price / 100).toFixed(2), inputmode: 'decimal', 'aria-label': `Price of ${it.name}`, oninput: () => { const c = parsePrice(price.value); price.classList.toggle('bad', c === null); if (c !== null) { it.price = c; save(); } }, onblur: () => { price.value = (it.price / 100).toFixed(2); price.classList.remove('bad'); } });
        const num = h('input', { class: 'inv-in num', type: 'number', min: 0, max: 999999, value: it.stock, 'aria-label': `Quantity of ${it.name}`, oninput: () => { it.stock = Math.max(0, Math.round(Number(num.value)) || 0); save(); refresh(); } });
        const bump = (by) => () => { it.stock = Math.max(0, (it.stock || 0) + by); num.value = it.stock; save(); refresh(); };
        const sw = (label, key) => h('label', { class: 'switch', title: label }, h('input', { type: 'checkbox', 'aria-label': `${label}: ${it.name}`, checked: it[key] !== false, onchange: (e) => { it[key] = e.target.checked; save(); refresh(); } }), h('i'));
        const open = async () => { await save.flush(); openItem(it.id); };
        el.append(
          h('input', { type: 'checkbox', class: 'cb', 'aria-label': `Select ${it.name}`, checked: invSel.has(it.id), onchange: (e) => { e.target.checked ? invSel.add(it.id) : invSel.delete(it.id); el.classList.toggle('sel', e.target.checked); drawBar(); syncAll(); } }),
          photo,
          h('button', { class: 'inv-name', type: 'button', title: 'Edit item', onclick: open }, h('span', {}, h('b', {}, it.name), it.sale > 0 && h('span', { class: 'tag sale' }, `${it.sale}% off`), tag), h('small', {}, it.restock != null ? `${it.category} · refills to ${it.restock} daily` : it.category)),
          h('div', { class: 'inv-price', 'data-l': 'Price' }, price),
          h('div', { 'data-l': 'In stock', class: 'inv-cell' }, h('div', { class: 'inv-qty' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'One fewer', onclick: bump(-1) }, ic('minus', 16)), num, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'One more', onclick: bump(1) }, ic('plus', 16)))),
          h('div', { 'data-l': 'Tax', class: 'inv-cell' }, sw('Charge sales tax', 'taxable')), h('div', { 'data-l': 'Available', class: 'inv-cell' }, sw('Available to order', 'available')),
          h('div', { class: 'inv-acts' }, h('button', { class: 'icon-btn', type: 'button', title: 'Edit item', 'aria-label': `Edit ${it.name}`, onclick: open }, ic('create', 18))));
        const st = stateOf(it); el.dataset.state = st; tag.textContent = LABEL[st] || ''; tag.hidden = !LABEL[st];
        return el;
      };
      let allBox = null;
      const syncAll = () => { if (!allBox) return; const rows = shown(); const on = rows.filter((it) => invSel.has(it.id)).length; allBox.checked = rows.length > 0 && on === rows.length; allBox.indeterminate = on > 0 && on < rows.length; };
      const drawList = () => {
        const rows = shown();
        allBox = h('input', { type: 'checkbox', class: 'cb', 'aria-label': 'Select all', title: 'Select all', onchange: (e) => { rows.forEach((it) => (e.target.checked ? invSel.add(it.id) : invSel.delete(it.id))); drawList(); } });
        list.replaceChildren(...(rows.length ? [h('div', { class: 'inv-head' }, allBox, ...['', 'Item', 'Price', 'In stock', 'Tax', 'Available', ''].map((t) => h('span', {}, t))), ...rows.map(row)]
          : [h('div', { class: 'inv-empty' }, ic('cube', 30), h('b', {}, menu.length ? 'Nothing matches' : 'No items yet'), h('p', {}, menu.length ? 'Try a different search or filter.' : 'Upload your item list or add your first item to start managing your inventory.'))]));
        syncAll(); drawBar();
      };
      drawTop(); drawList();
      const addItem = async () => {
        try {
          const before = new Set(menu.map((x) => x.id));
          menu = (await api('POST', `/api/sites/${id}/menu`, { name: 'New item', price: 0, category: cats.at(-1) || 'Menu' })).items;
          invQ = ''; invFilter = 'all'; drawTop(); drawList();
          openItem(menu.find((x) => !before.has(x.id))?.id);
        } catch (e) { toast(e.message, true); }
      };
      return [h('div', { class: 'inv' },
        h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Items'), h('p', { class: 'muted' }, 'Click an item to edit it, or tick several to change them together. Quantities go down on their own as orders come in.')),
          h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('button', { class: 'btn soft', onclick: importCsv }, ic('up2', 16), 'Upload list'), state.config.scanEnabled && h('button', { class: 'btn soft', onclick: scanMenu }, ic('camera', 16), 'Scan menu'), menu.length > 0 && h('button', { class: 'btn soft', onclick: bulkPhotos }, ic('images', 16), 'Add photos'), h('button', { class: 'btn', onclick: addItem }, ic('plus', 16), 'Add item'))),
        kpis,
        h('div', { class: 'inv-bar' }, h('label', { class: 'inv-search' }, ic('search', 16), h('input', { type: 'search', placeholder: 'Search items', value: invQ, 'aria-label': 'Search items', oninput: (e) => { invQ = e.target.value.trim().toLowerCase(); drawList(); } })), chips),
        list, bar,
        !ordering.taxRate && menu.length > 0 && h('p', { class: 'hint', style: 'margin-top:4px' }, 'The Tax switch only has an effect once you set a sales tax rate under Ordering.'))];
    },

    ordering(view = 'ordering') {
      const o = ordering;
      const saveOrdering = debounce(async () => {
        try { await sendOrdering(o); ordering = o; if (page === 'order' && !o.enabled) page = 'home'; paint(true); paintTop(); }
        catch (e) { toast(e.message, true); }
      }, 450);
      notify = saveOrdering;
      const redraw = () => { paintPanel(); };
      const num = (label, k, suffix, hint) => wrap(label, h('input', { type: 'number', min: 0, value: o[k], inputmode: 'decimal', oninput: (e) => { o[k] = Number(e.target.value) || 0; saveOrdering(); } }), hint || suffix);
      const cash = (label, k, hint) => { const el = h('input', { value: (o[k] / 100).toFixed(2), inputmode: 'decimal', oninput: () => { const c = parsePrice(el.value || '0'); if (c !== null) { o[k] = c; saveOrdering(); } el.style.borderColor = c === null ? 'var(--red)' : ''; } }); return wrap(label, el, hint); };
      const method = (k, ...fields) => group(ORDER_METHODS[k].name, h('label', { class: 'switch' }, h('span', {}, ORDER_METHODS[k].blurb), h('input', { type: 'checkbox', checked: o.methods[k], onchange: (e) => {
        if (!e.target.checked && o.enabled && openMethods(o).length === 1) { e.target.checked = true; return toast('Keep at least one way to order turned on.', true); }
        o.methods[k] = e.target.checked; saveOrdering(); redraw();
      } }), h('i')), o.methods[k] && fields);
      const out = [
        group('Online ordering', toggle('Take orders on my website', o, 'enabled', (v) => v === true, () => { if (o.enabled && !openMethods(o).length) o.methods.pickup = true; redraw(); }),
          o.enabled && toggle('Accepting orders right now', o, 'accepting', undefined, redraw),
          o.enabled && !o.accepting && note('Ordering is paused. Customers can see your menu but cannot place orders.'),
          o.enabled && !menu.length && note(h('b', {}, 'Your menu is empty. '), 'Add items in Menu and inventory so customers have something to order.'),
          o.enabled && h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('button', { class: 'btn soft sm', onclick: async () => { const w = window.open('', '_blank'); await flush(); if (w) w.location = `/preview/${id}/order`; } }, 'Preview order page', ic('out', 14)), meta.live && h('a', { class: 'btn soft sm', href: `${meta.url.replace(/\/$/, '')}/order`, target: '_blank', rel: 'noopener' }, 'Open as a customer', ic('out', 14)))),
        ...(o.enabled ? [
          method('pickup', num('Ready in (minutes)', 'prepMinutes'), text('Pickup instructions', o, 'pickupNote', { placeholder: 'Collect at the front counter', maxlength: 300 })),
          method('curbside', text('Curbside instructions', o, 'curbsideNote', { maxlength: 300, hint: 'Customers are asked for their vehicle make, model and colour.' })),
          method('delivery', h('div', { class: 'pair' }, cash('Delivery fee', 'deliveryFee'), cash('Minimum order', 'deliveryMin')), num('Delivered in (minutes)', 'deliveryMinutes'), text('Delivery area', o, 'deliveryArea', { placeholder: 'Within 5 miles of the restaurant', maxlength: 300 }),
            h('div', { class: 'field' }, h('span', {}, 'Delivery zones by ZIP code'), h('div', { class: 'stack' }, o.zones.map((z, i) => h('div', { class: 'zrow' },
              h('input', { value: Array.isArray(z.zips) ? z.zips.join(', ') : z.zips, placeholder: '75751, 75752', 'aria-label': 'ZIP codes', oninput: (e) => { z.zips = e.target.value; saveOrdering(); } }),
              h('input', { value: (z.fee / 100).toFixed(2), inputmode: 'decimal', 'aria-label': 'Delivery fee for these ZIP codes', oninput: (e) => { const c = parsePrice(e.target.value || '0'); if (c !== null) { z.fee = c; saveOrdering(); } } }),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove zone', onclick: () => { o.zones.splice(i, 1); saveOrdering(); redraw(); } }, ic('trash', 16))))),
              h('button', { type: 'button', class: 'btn soft sm', style: 'justify-self:start', onclick: () => { o.zones.push({ zips: '', fee: o.deliveryFee || 0 }); redraw(); } }, ic('plus', 14), 'Add zone'),
              h('small', {}, o.zones.length ? 'Customers enter their ZIP code. You only deliver to the ZIP codes listed, at the fee beside them.' : 'Optional. List the ZIP codes you deliver to and a fee for each group. Without zones, the single delivery fee above applies everywhere.'))),
          group('Checkout', wrap('Sales tax (%)', h('input', { type: 'number', min: 0, max: 30, step: '0.001', value: o.taxRate, oninput: (e) => { o.taxRate = Number(e.target.value) || 0; saveOrdering(); } }), 'Added to every order. Enter 0 if your prices include tax.'),
            toggle('Let customers add a tip', o, 'tips'), toggle('Let customers add notes', o, 'allowNotes'),
            note(h('b', {}, 'Payment. '), draft.business.payUrl ? 'Customers can pay through your online payment link after ordering, or pay when they receive their order.' : 'Customers pay when they receive their order. Add your Processor Freedom payment link in Business details to offer online payment.')),
          group('Opening hours', toggle('Only take orders during set hours', o, 'useHours', (v) => v === true, redraw),
            o.useHours && [wrap('Time zone', h('select', { onchange: (e) => { o.timezone = e.target.value; saveOrdering(); } }, Object.entries(TIMEZONES).map(([k, l]) => h('option', { value: k, selected: o.timezone === k }, l)))),
              h('div', { class: 'hours' }, DAYS.map((day, i) => { const hr = o.hours[i]; return h('div', { class: `hrow ${hr.closed ? 'off' : ''}` }, h('b', {}, day.slice(0, 3)),
                h('input', { type: 'time', value: hr.open, disabled: hr.closed, 'aria-label': `${day} opens`, onchange: (e) => { hr.open = e.target.value || hr.open; saveOrdering(); } }), h('span', {}, 'to'),
                h('input', { type: 'time', value: hr.close, disabled: hr.closed, 'aria-label': `${day} closes`, onchange: (e) => { hr.close = e.target.value || hr.close; saveOrdering(); } }),
                h('label', { class: 'switch', title: 'Open this day' }, h('input', { type: 'checkbox', 'aria-label': `${day} open`, checked: !hr.closed, onchange: (e) => { hr.closed = !e.target.checked; saveOrdering(); redraw(); } }), h('i'))); })),
              h('small', { class: 'hint' }, 'A closing time earlier than the opening time means you close after midnight.')],
            toggle('Let customers order ahead for a later time', o, 'scheduling', (v) => v === true), h('small', { class: 'hint' }, 'Offers pickup and delivery times every 15 minutes, today and tomorrow.')),
          group('Kitchen capacity', wrap('Most orders in any 15 minutes', h('input', { type: 'number', min: 0, max: 500, value: o.slotLimit || '', placeholder: 'No limit', style: 'max-width:160px', oninput: (e) => { o.slotLimit = Math.max(0, Math.round(Number(e.target.value)) || 0); saveOrdering(); } }), 'Stops the kitchen being overbooked. Once a time is full, customers are offered the next one. Leave empty for no limit.')),
          group('Happy hour and timed prices', h('p', { class: 'hint' }, 'Lower prices automatically at set times. Customers see the old price crossed out while it is on.'),
            h('div', { class: 'stack' }, o.deals.map((dl, i) => h('div', { class: 'deal' },
              h('div', { class: 'row' }, h('input', { class: 'grow', value: dl.name, maxlength: 40, placeholder: 'Happy hour', 'aria-label': 'Name', oninput: (e) => { dl.name = e.target.value; saveOrdering(); } }),
                h('label', { class: 'switch', title: 'Active' }, h('input', { type: 'checkbox', 'aria-label': 'Active', checked: dl.active !== false, onchange: (e) => { dl.active = e.target.checked; saveOrdering(); } }), h('i')),
                h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove', onclick: () => { o.deals.splice(i, 1); saveOrdering(); redraw(); } }, ic('trash', 16))),
              h('div', { class: 'deal-grid' },
                h('label', { class: 'field' }, h('span', {}, 'Percent off'), h('input', { type: 'number', min: 1, max: 90, value: dl.percent, oninput: (e) => { dl.percent = Math.max(1, Math.min(90, Math.round(Number(e.target.value)) || 10)); saveOrdering(); } })),
                h('label', { class: 'field' }, h('span', {}, 'From'), h('input', { type: 'time', value: dl.from, onchange: (e) => { dl.from = e.target.value || dl.from; saveOrdering(); } })),
                h('label', { class: 'field' }, h('span', {}, 'Until'), h('input', { type: 'time', value: dl.to, onchange: (e) => { dl.to = e.target.value || dl.to; saveOrdering(); } }))),
              h('label', { class: 'field' }, h('span', {}, 'Applies to'), h('select', { onchange: (e) => { dl.category = e.target.value; saveOrdering(); } }, h('option', { value: '' }, 'Everything on the menu'), [...new Set(menu.map((x) => x.category))].map((c) => h('option', { value: c, selected: dl.category === c }, c)))),
              h('div', { class: 'daypick', role: 'group', 'aria-label': 'Days' }, DAYS.map((day, di) => h('button', { type: 'button', title: day, 'aria-label': day, 'aria-pressed': String(dl.days[di] !== false), onclick: (e) => { dl.days[di] = dl.days[di] === false; e.currentTarget.setAttribute('aria-pressed', String(dl.days[di])); saveOrdering(); } }, day.slice(0, 2))))))),
            h('button', { type: 'button', class: 'btn soft sm', style: 'justify-self:start', onclick: () => { o.deals.push({ name: 'Happy hour', percent: 20, from: '15:00', to: '18:00', days: DAYS.map(() => true), category: '', active: true }); saveOrdering(); redraw(); } }, ic('plus', 14), 'Add a timed price'),
            h('small', { class: 'hint' }, 'To show a whole category only at certain times, such as breakfast until 11, open Menu and press Edit beside the category.')),
          group('Promo codes', h('div', { class: 'stack' }, o.promos.map((pr, i) => h('div', { class: 'prow2' },
            h('input', { value: pr.code, placeholder: 'CODE', 'aria-label': 'Promo code', maxlength: 24, style: 'text-transform:uppercase', oninput: (e) => { pr.code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); saveOrdering(); } }),
            h('input', { value: pr.type === 'amount' ? (pr.value / 100).toFixed(2) : pr.value, inputmode: 'decimal', 'aria-label': 'Amount off', oninput: (e) => { const n = pr.type === 'amount' ? parsePrice(e.target.value || '0') : Math.round(Number(e.target.value)); if (n !== null && Number.isFinite(n)) { pr.value = n; saveOrdering(); } } }),
            h('button', { type: 'button', class: 'btn soft sm', title: 'Switch between percent and dollars', onclick: () => { pr.type = pr.type === 'amount' ? 'percent' : 'amount'; pr.value = pr.type === 'amount' ? 500 : 10; saveOrdering(); redraw(); } }, pr.type === 'amount' ? '$' : '%'),
            h('label', { class: 'switch', title: 'Active' }, h('input', { type: 'checkbox', 'aria-label': 'Active', checked: pr.active, onchange: (e) => { pr.active = e.target.checked; saveOrdering(); } }), h('i')),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove code', onclick: () => { o.promos.splice(i, 1); saveOrdering(); redraw(); } }, ic('trash', 16))))),
            h('button', { type: 'button', class: 'btn soft sm', style: 'justify-self:start', onclick: () => { o.promos.push({ code: o.promos.length ? '' : 'WELCOME10', type: 'percent', value: 10, active: true }); saveOrdering(); redraw(); } }, ic('plus', 14), 'Add promo code')),
          group('Loyalty rewards', toggle('Reward repeat customers', o.loyalty, 'enabled', (v) => v === true, redraw),
            o.loyalty.enabled && [h('div', { class: 'pair' }, wrap('Reward after this many orders', h('input', { type: 'number', min: 2, max: 50, value: o.loyalty.every, oninput: (e) => { o.loyalty.every = Math.round(Number(e.target.value)) || 10; saveOrdering(); } })),
              wrap(o.loyalty.type === 'percent' ? 'Percent off' : 'Dollars off', h('div', { class: 'row' }, h('input', { style: 'flex:1;min-width:0', value: o.loyalty.type === 'percent' ? o.loyalty.value : (o.loyalty.value / 100).toFixed(2), inputmode: 'decimal', oninput: (e) => { const n = o.loyalty.type === 'percent' ? Math.round(Number(e.target.value)) : parsePrice(e.target.value || '0'); if (n) { o.loyalty.value = n; saveOrdering(); } } }),
                h('button', { type: 'button', class: 'btn soft sm', title: 'Switch between percent and dollars', onclick: () => { o.loyalty.type = o.loyalty.type === 'percent' ? 'amount' : 'percent'; o.loyalty.value = o.loyalty.type === 'percent' ? 10 : 500; saveOrdering(); redraw(); } }, o.loyalty.type === 'percent' ? '%' : '$')))),
              h('small', { class: 'hint' }, 'Orders are counted by the customer’s email. After the qualifying order they see a one-time code on their order page, good for their next order.')]),
          group('Alerts and reports', toggle('Email me a summary each morning', o, 'dailySummary'), h('small', { class: 'hint' }, 'Yesterday’s sales, best sellers and anything running low.'),
            wrap('Warn me when an item drops to', h('input', { type: 'number', min: 0, max: 9999, value: o.lowStockAt, style: 'max-width:160px', oninput: (e) => { o.lowStockAt = Math.max(0, Math.round(Number(e.target.value)) || 0); saveOrdering(); } }), 'You get a notification on your devices, and an email, the moment an order takes an item to this number or below. Use 0 to hear only when something sells out.')),
          group('Order emails', text('Send new orders to', o, 'notifyEmail', { type: 'email', placeholder: draft.business.email || state.user.email }),
            note(state.config.emailEnabled ? 'Customers get an email when their order is received, confirmed, ready and if it is cancelled. You get an email for every new order.' : h('span', {}, h('b', {}, 'Email is not switched on yet. '), 'Orders still arrive in your Orders list. Processor Freedom needs to connect an email service before confirmations are sent.'))),
        ] : [note('Turn this on to add an order page to your site. Customers choose items from your menu, pick how they want to receive them, and you get the order here and by email.')]),
      ];
      notify = null;
      if (!o.enabled && view !== 'ordering') return [emptyState('sliders', 'Online ordering is off', 'Turn on online ordering first, then set this up.', ['Open online ordering', () => goTab('ordering')])];
      const want = SETUP_VIEWS[view];
      return out.flat(Infinity).filter(Boolean).filter((el) => { const t = el.querySelector?.(':scope > h3')?.textContent; return t ? want.includes(t) : view === 'ordering'; });
    },

    orders() {
      if (!orders) { loadOrders(); return [group('', skel(3, 'card'))]; }
      const active = orders.filter((x) => !['completed', 'cancelled'].includes(x.status));
      const shown = orderFilter === 'active' ? active : orders;
      const setStatus = async (x, status) => { try { const r = await api('POST', `/api/sites/${id}/orders/${x.id}`, { status }); putOrder(x, r.order); paintPanel(); } catch (e) { toast(e.message, true); } };
      const next = { new: ['confirmed', 'Confirm order'], confirmed: ['ready', 'Mark ready'], ready: ['completed', 'Complete'] };
      const seg = h('div', { class: 'seg' }, [['active', `Active · ${active.length}`], ['all', 'All orders']].map(([k, l]) => h('button', { 'aria-pressed': String(orderFilter === k), onclick: () => { orderFilter = k; paintPanel(); } }, l)));
      const alertBox = h('label', { class: 'switch' }, h('span', {}, h('b', { style: 'font-weight:500' }, 'Sound and pop-up alerts'), h('div', { class: 'small muted' }, 'Chime on every new order while this page is open.')), h('input', { type: 'checkbox', checked: alertsOn(), onchange: (e) => setAlerts(e.target.checked) }), h('i'));
      const pushBox = h('label', { class: 'switch' }, h('span', {}, h('b', { style: 'font-weight:500' }, 'Notify this device'), h('div', { class: 'small muted' }, 'Get new orders as notifications, even when this page is closed. On iPhone and iPad, add this page to your Home Screen first.')),
        h('input', { type: 'checkbox', checked: pushIsOn === true, onchange: async (e) => {
          const want = e.target.checked;
          try { if (want) { await enablePush(); toast('This device will be notified of new orders'); } else { await disablePush(); } pushIsOn = want; } catch (ex) { e.target.checked = !want; toast(ex.message, true); }
        } }), h('i'));
      return [group('Alerts', alertBox, pushBox, h('a', { class: 'btn soft sm', style: 'justify-self:start', href: `/app/site/${id}/kitchen`, target: '_blank' }, 'Open kitchen screen', ic('out', 14)), seg,
        !shown.length && (orders.length ? emptyState('check', 'All caught up', 'No active orders right now. New ones appear here on their own.')
          : !ordering.enabled ? emptyState('bag', 'No orders yet', 'Turn on online ordering to start taking orders.', ['Open ordering', () => goTab('ordering')])
            : emptyState('bag', 'No orders yet', meta.live ? 'Place a test order from your own site to see exactly what customers see. It arrives here within seconds.' : 'Publish your site, then place a test order to see the whole flow.', meta.live ? ['Open my order page', () => window.open(`${meta.url.replace(/\/$/, '')}/order`, '_blank', 'noopener')] : null)),
        shown.map((x) => h('article', { class: `ocard ${x.status === 'new' ? 'new' : ''}` },
          h('header', {}, h('b', {}, `#${x.number} · ${x.name}`), h('span', { class: `status ${x.status === 'cancelled' ? 'bad' : x.status === 'completed' ? '' : x.status === 'new' ? 'warn' : 'ok'}` }, x.status === 'ready' ? readyLabel(x.method) : ORDER_STATUSES[x.status])),
          h('div', { class: 'small muted' }, `${ORDER_METHODS[x.method]?.name || x.method} · ${new Date(x.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`),
          h('div', { class: 'its' }, x.items.map((l) => h('div', {}, h('span', {}, `${l.qty} × ${l.name}`, l.opts?.length > 0 && h('span', { class: 'muted', style: 'display:block;font-size:13px' }, l.opts.join(', '))), h('span', {}, money(l.price * l.qty)))), x.discount > 0 && h('div', { class: 'muted' }, h('span', {}, `Discount ${x.promo}`), h('span', {}, `−${money(x.discount)}`)), h('div', { style: 'font-weight:600;margin-top:4px' }, h('span', {}, 'Total'), h('span', {}, money(x.total)))),
          h('div', { class: 'small' }, h('a', { href: `tel:${x.phone.replace(/[^\d+]/g, '')}` }, x.phone), ' · ', h('a', { href: `mailto:${x.email}` }, x.email)),
          x.scheduled && h('div', { class: 'small' }, h('b', {}, 'Scheduled for '), slotLabel(x.scheduled, ordering)),
          x.address && h('div', { class: 'small' }, h('b', {}, 'Deliver to '), x.address), x.vehicle && h('div', { class: 'small' }, h('b', {}, 'Vehicle '), x.vehicle), x.notes && h('div', { class: 'small' }, h('b', {}, 'Notes '), x.notes),
          x.status !== 'cancelled' && h('div', { class: 'row payline', style: 'flex-wrap:wrap' }, x.paidAt ? h('span', { class: 'status ok' }, `Paid · ${x.paidMethod}`) : h('span', { class: 'status' }, 'Not paid yet'), x.refunded > 0 && h('span', { class: 'status bad' }, `Refunded ${money(x.refunded)}`), h('span', { class: 'grow' }),
            !x.paidAt && h('button', { class: 'btn soft sm', onclick: () => takePayment(x) }, 'Record payment'), x.paidAt && x.refunded < x.total && h('button', { class: 'btn text sm', onclick: () => refundOrder(x) }, 'Refund')),
          next[x.status] && h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => setStatus(x, next[x.status][0]) }, next[x.status][0] === 'ready' ? `Mark ${readyLabel(x.method).toLowerCase()}` : next[x.status][1]),
            h('button', { class: 'btn soft sm', onclick: () => printTicket(x, meta.name, { method: ORDER_METHODS[x.method]?.name || x.method, when: x.scheduled ? slotLabel(x.scheduled, ordering) : 'As soon as possible', total: money(x.total) }) }, ic('print', 14), 'Print'),
            h('button', { class: 'btn danger sm', onclick: async () => { if (await confirmSheet({ title: `Cancel order #${x.number}?`, text: 'The customer is told by email and any stock is returned.', action: 'Cancel order', danger: true })) setStatus(x, 'cancelled'); } }, 'Cancel')))))];
    },

    sales(V = 'overview') {
      const TITLES = { overview: 'Sales overview', items: 'Item sales', types: 'Order types', taxes: 'Taxes', full: 'Sales report', emp: 'Employee sales', tender: 'Tender types', disc: 'Discounts', removed: 'Removed items', tips: 'Tips' };
      const tableCard = (title, heads, rows, emptyText) => h('div', { class: 'scard' }, h('h3', {}, title), rows.length ? h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, heads.map((x) => h('th', {}, x)))), h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => h('td', {}, i === 0 ? h('b', {}, c) : c))))))) : h('p', { class: 'muted', style: 'padding:0 22px 20px' }, emptyText));
      const load = async () => {
        if (salesBusy) return;
        salesBusy = true;
        try { stats = await api('GET', `/api/sites/${id}/stats?${new URLSearchParams(salesRange === 'custom' ? { range: 'custom', from: salesFrom, to: salesTo } : { range: salesRange })}`); }
        catch (e) { toast(e.message, true); stats = stats || { failed: true }; }
        salesBusy = false;
        if (SALES_TABS[tab]) paintPanel();
      };
      const pick = (r) => { salesRange = r; paintPanel(); };
      if (stats && !stats.failed && !salesBusy && salesRange !== 'custom' && stats.range !== salesRange) load();
      const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['last30', 'Last 30 days'], ['custom', 'Custom']];
      const day = (d, o = { month: 'short', day: 'numeric' }) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', ...o });
      const head = (st) => h('div', { class: 'inv-top' },
        h('div', {}, h('h2', {}, TITLES[V]), h('p', { class: 'muted' }, st && st.from ? (st.from === st.to ? day(st.from, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : `${day(st.from, { month: 'long', day: 'numeric' })} to ${day(st.to, { month: 'long', day: 'numeric', year: 'numeric' })}`) : 'Your sales, tax and best sellers.')),
        h('div', { class: 'row', style: 'flex-wrap:wrap' },
          st && st.orders && st.orders.length > 0 && h('button', { class: 'btn soft', onclick: () => exportCsv(st) }, ic('dl', 16), 'Export'),
          h('button', { class: 'btn soft', onclick: () => window.print() }, ic('print', 16), 'Print'),
          h('button', { class: 'btn soft', onclick: () => { stats = null; paintPanel(); } }, 'Refresh')));
      const fromIn = h('input', { type: 'date', value: salesFrom, 'aria-label': 'From', onchange: (e) => { salesFrom = e.target.value; } });
      const toIn = h('input', { type: 'date', value: salesTo, 'aria-label': 'To', onchange: (e) => { salesTo = e.target.value; } });
      const filter = h('div', { class: 'inv-bar' }, h('div', { class: 'inv-chips' }, RANGES.map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': String(salesRange === k), onclick: () => { if (k === 'custom') { salesRange = 'custom'; paintPanel(); } else pick(k); } }, l))),
        salesRange === 'custom' && h('form', { class: 'dates', onsubmit: (e) => { e.preventDefault(); if (!salesFrom || !salesTo) return toast('Choose a start and end date.', true); stats = null; paintPanel(); } }, fromIn, h('span', { class: 'muted' }, 'to'), toIn, h('button', { class: 'btn sm' }, 'Show')));
      if (salesRange === 'custom' && (!salesFrom || !salesTo) && !stats) return [h('div', { class: 'inv' }, head(null), filter, h('div', { class: 'inv-list' }, h('div', { class: 'inv-empty' }, ic('chart', 30), h('b', {}, 'Choose your dates'), h('p', {}, 'Pick a start and end date above, then press Show.'))))];
      if (!stats) { load(); return [h('div', { class: 'inv' }, head(null), filter, h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(1, 'chart'), skel(5, 'row'))]; }
      if (stats.failed) return [h('div', { class: 'inv' }, head(null), filter, h('div', { class: 'inv-list' }, h('div', { class: 'inv-empty' }, ic('alert', 30), h('b', {}, 'We could not load your sales'), h('p', {}, 'Nothing is lost. Press Refresh to try again.'))))];

      const st = stats, t = st.totals;
      const change = (now, was) => { if (!was) return now ? h('span', { class: 'delta up' }, 'New') : null; const pct = Math.round(((now - was) / was) * 100); return h('span', { class: `delta ${pct >= 0 ? 'up' : 'down'}`, title: `Compared with ${day(st.previous.from)}${st.previous.from === st.previous.to ? '' : ` to ${day(st.previous.to)}`}` }, `${pct >= 0 ? '+' : ''}${pct}%`); };
      const kpi = (label, value, extra, sub, icon) => h('div', { class: 'kpi big' }, h('span', { class: 'kico' }, ic(icon, 18)), h('span', { class: 'small muted' }, label), h('b', {}, value, extra), sub && h('span', { class: 'small muted' }, sub));
      const peak = Math.max(1, ...st.series.map((x) => x.net));
      const hour = (k) => { const n = Number(k); return `${n % 12 || 12}${n < 12 ? 'a' : 'p'}`; };
      const busy = st.series.filter((x) => x.orders);
      const shownSeries = st.unit === 'hour' ? st.series.slice(Math.max(0, Math.min(6, busy.length ? Number(busy[0].key) : 6)), Math.min(24, Math.max(23, busy.length ? Number(busy.at(-1).key) + 1 : 23))) : st.series;
      const every = Math.ceil(shownSeries.length / 12);
      const chart = h('div', { class: 'chart' }, h('div', { class: 'chart-bars', role: 'img', 'aria-label': `Sales by ${st.unit}` }, shownSeries.map((x) => h('div', { class: 'cbar', title: `${st.unit === 'hour' ? `${hour(x.key)}m` : day(x.key, { weekday: 'short', month: 'short', day: 'numeric' })}: ${money(x.net)} · ${x.orders} order${x.orders === 1 ? '' : 's'}` }, x.net > 0 && h('em', {}, money(x.net).replace(/\.00$/, '')), h('i', { class: x.net ? 'on' : '', style: `height:${Math.max(x.net ? 4 : 1.5, (x.net / peak) * 100)}%` })))),
        h('div', { class: 'chart-x' }, shownSeries.map((x, i) => h('span', {}, i % every === 0 ? (st.unit === 'hour' ? hour(x.key) : day(x.key)) : ''))));
      const line = (label, value, cls = '') => h('div', { class: `rline ${cls}` }, h('span', {}, label), h('b', {}, value));
      const mTotal = st.methods.reduce((a, m) => a + m.orders, 0) || 1;
      const topSales = Math.max(1, ...st.items.map((i) => i.sales));
      const none = !t.orders;
      return [h('div', { class: 'inv sales' }, head(st), filter,
        h('div', { class: 'inv-kpis' },
          kpi('Net sales', money(t.net), change(t.net, st.previous.net), `${money(t.gross)} in items${t.discounts ? `, ${money(t.discounts)} discounts` : ''}`, 'cash'),
          kpi('Orders', t.orders, change(t.orders, st.previous.orders), t.cancelled ? `${t.cancelled} cancelled, not counted` : `${t.units} item${t.units === 1 ? '' : 's'} sold`, 'bag'),
          kpi('Average order', money(t.average), null, 'Including tax, fees and tips', 'chart'),
          kpi('Sales tax collected', money(t.tax), null, st.taxRate ? `At ${st.taxRate}%` : 'No tax rate set', 'doc')),
        none && !['removed', 'disc', 'emp', 'tender', 'tips'].includes(V) && h('div', { class: 'inv-list' }, h('div', { class: 'inv-empty' }, ic('chart', 30), h('b', {}, st.range === 'today' ? 'No sales yet today' : 'No sales in this period'), h('p', {}, meta.live ? 'Orders appear here the moment they are placed.' : 'Publish your site to start taking orders. Sales appear here as they come in.'))),
        !none && V === 'overview' && h('div', { class: 'scard' }, h('h3', {}, st.unit === 'hour' ? 'Sales by hour' : 'Sales by day'), chart),
        !none && V !== 'items' && h('div', { class: 'sgrid3 solo' },
          (V === 'overview' || V === 'full') && h('div', { class: 'scard' }, h('h3', {}, 'Where the money went'),
            line('Item sales', money(t.gross)), t.discounts > 0 && line('Discounts and promo codes', `−${money(t.discounts)}`), line('Net sales', money(t.net), 'strong'),
            line('Sales tax', money(t.tax)), line('Delivery fees', money(t.fees)), line('Tips', money(t.tips)), line('Total collected', money(t.total), 'total')),
          V === 'taxes' && h('div', { class: 'scard' }, h('h3', {}, 'Sales tax'),
            line('Taxable sales', money(t.taxable)), line('Non-taxable sales', money(t.nontaxable)), line('Tax collected', money(t.tax), 'total'),
            h('p', { class: 'hint' }, st.taxRate ? `Your rate is ${st.taxRate}%. Taxable sales are after discounts. Items with tax switched off are counted as non-taxable.` : 'You have no sales tax rate set. Add one under Ordering.')),
          V === 'types' && h('div', { class: 'scard' }, h('h3', {}, 'How customers ordered'),
            st.methods.map((m) => h('div', { class: 'mrow2' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, ORDER_METHODS[m.method]?.name || m.method), h('span', {}, `${m.orders} order${m.orders === 1 ? '' : 's'} · ${money(m.net)}`)), h('div', { class: 'track2' }, h('i', { style: `width:${(m.orders / mTotal) * 100}%` })), h('span', { class: 'small muted' }, `${Math.round((m.orders / mTotal) * 100)}% of orders`))))),
        !none && V === 'items' && h('div', { class: 'scard' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, 'Item sales'), h('span', { class: 'small muted' }, `${st.items.length} item${st.items.length === 1 ? '' : 's'} · ${t.units} sold`)),
          h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['', 'Item', 'Category', 'Sold', 'Sales', 'Share of sales'].map((x) => h('th', {}, x)))),
            h('tbody', {}, st.items.map((it, i) => h('tr', {}, h('td', { class: 'muted' }, i + 1), h('td', {}, h('b', {}, it.name), i === 0 && h('span', { class: 'tag sale', style: 'margin-left:8px' }, 'Most popular')), h('td', { class: 'muted' }, it.category), h('td', {}, it.qty), h('td', {}, money(it.sales)),
              h('td', {}, h('div', { class: 'share' }, h('div', { class: 'track2' }, h('i', { style: `width:${(it.sales / topSales) * 100}%` })), h('span', { class: 'small muted' }, `${t.gross ? Math.round((it.sales / t.gross) * 100) : 0}%`))))))))),
        !none && V === 'items' && (st.revenue || []).some((r) => r.name !== 'No revenue class') && h('div', { class: 'scard' }, h('h3', {}, 'Sales by revenue class'), st.revenue.map((c) => h('div', { class: 'mrow2' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, c.name), h('span', {}, `${c.qty} sold · ${money(c.sales)}`)), h('div', { class: 'track2' }, h('i', { style: `width:${t.gross ? (c.sales / t.gross) * 100 : 0}%` }))))),
        !none && V === 'items' && st.categories.length > 1 && h('div', { class: 'scard' }, h('h3', {}, 'Sales by category'), st.categories.map((c) => h('div', { class: 'mrow2' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, c.name), h('span', {}, `${c.qty} sold · ${money(c.sales)}`)), h('div', { class: 'track2' }, h('i', { style: `width:${t.gross ? (c.sales / t.gross) * 100 : 0}%` }))))),
        V === 'emp' && tableCard('Sales by employee', ['Employee', 'Orders', 'Net sales', 'Tips', 'Total collected'], (st.employees || []).map((e) => [e.name, e.orders, money(e.net), money(e.tips), money(e.total)]), 'No orders in this period. An order is credited to whoever confirms it or takes its payment.'),
        V === 'tender' && tableCard('Sales by tender type', ['Tender', 'Orders', 'Tips', 'Total'], (st.tenders || []).map((e) => [e.name, e.orders, money(e.tips), money(e.total)]), 'No orders in this period. Record how each order was paid from the Orders screen.'),
        V === 'disc' && tableCard('Discounts given', ['Discount or promo code', 'Times used', 'Amount'], (st.promos || []).map((e) => [e.name, e.uses, money(e.amount)]), 'No discounts were used in this period.'),
        V === 'removed' && tableCard('Items on cancelled orders', ['Item', 'Quantity', 'Value'], (st.removed || []).map((e) => [e.name, e.qty, money(e.value)]), 'No orders were cancelled in this period.'),
        V === 'tips' && tableCard(`Tips · ${money(t.tips)} in this period`, ['Order', 'When', 'Customer', 'Handled by', 'Tip'], st.orders.filter((o) => o.tip > 0 && o.status !== 'cancelled').map((o) => [`#${o.number}`, `${st.from === st.to ? '' : `${day(o.date)} `}${o.time}`, o.name, o.by || '—', money(o.tip)]), 'No tips in this period. Customers can add a tip at checkout when tips are switched on under Setup.'),
        (V === 'overview' || V === 'full') && st.orders.length > 0 && h('div', { class: 'scard' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, 'Orders in this period'), h('span', { class: 'small muted' }, `${st.orders.length} order${st.orders.length === 1 ? '' : 's'}`)),
          h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Order', 'When', 'Type', 'Customer', 'Items', 'Tax', 'Total', 'Status'].map((x) => h('th', {}, x)))),
            h('tbody', {}, st.orders.slice(0, 200).map((o) => h('tr', { class: o.status === 'cancelled' ? 'void' : '' }, h('td', {}, h('b', {}, `#${o.number}`)), h('td', { class: 'muted' }, `${st.from === st.to ? '' : `${day(o.date)} `}${o.time}`), h('td', {}, ORDER_METHODS[o.method]?.name || o.method), h('td', {}, o.name), h('td', {}, money(o.subtotal - o.discount)), h('td', {}, money(o.tax)), h('td', {}, h('b', {}, money(o.total))),
              h('td', {}, h('span', { class: `status ${o.status === 'cancelled' ? 'bad' : o.status === 'new' ? 'warn' : 'ok'}` }, ORDER_STATUSES[o.status] || o.status))))))),
          st.orders.length > 200 && h('p', { class: 'hint' }, `Showing the latest 200. Export to see all ${st.orders.length}.`)))];
    },

    inbox() {
      if (!leads) {
        api('GET', `/api/sites/${id}/leads`).then((r) => { leads = r.leads; if (tab === 'inbox') paintPanel(); });
        return [group('', skel(3, 'card'))];
      }
      if (!leads.length) return [group('', emptyState('inbox', 'No messages yet', 'When someone uses the contact form on your site, their message appears here.'))];
      return [group(`${leads.length} message${leads.length === 1 ? '' : 's'}`, leads.map((l) => h('article', { class: 'lead' },
        h('header', {}, h('b', {}, l.name), h('span', { class: 'small muted' }, fmtDate(l.createdAt))),
        h('div', { class: 'small' }, h('a', { href: `mailto:${l.email}` }, l.email), l.phone && [' · ', h('a', { href: `tel:${l.phone.replace(/[^\d+]/g, '')}` }, l.phone)]),
        h('p', {}, l.message),
        h('div', { class: 'row' }, h('a', { class: 'btn soft sm', href: `mailto:${l.email}?subject=${encodeURIComponent(`Re: your message to ${meta.name}`)}` }, 'Reply'),
          h('button', { class: 'btn danger sm', onclick: async () => { await api('DELETE', `/api/sites/${id}/leads/${l.id}`); leads = leads.filter((x) => x.id !== l.id); paintPanel(); } }, 'Delete')))))];
    },

    customers() {
      const head = (extra) => h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Customers'), h('p', { class: 'muted' }, 'Everyone who has ordered from you, with what they spend and when they last came back.')), extra);
      if (!customers) {
        api('GET', `/api/sites/${id}/customers`).then((r) => { customers = r.customers; if (tab === 'customers') paintPanel(); }).catch((e) => { toast(e.message, true); customers = []; if (tab === 'customers') paintPanel(); });
        return [h('div', { class: 'inv' }, head(), h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(6, 'row'))];
      }
      if (!customers.length) return [h('div', { class: 'inv' }, head(h('button', { class: 'btn', onclick: addCustomer }, ic('plus', 16), 'Add customer')), h('div', { class: 'inv-list' }, emptyState('person', 'No customers yet', 'People appear here after their first order. You can also add catering and wholesale customers yourself, ready to invoice.', ['Add customer', addCustomer])))];
      const repeat = customers.filter((c) => c.orders > 1).length;
      const spent = customers.reduce((a, c) => a + c.spent, 0), count = customers.reduce((a, c) => a + c.orders, 0);
      const kpi = (label, value, sub, icon) => h('div', { class: 'kpi big' }, h('span', { class: 'kico' }, ic(icon, 18)), h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      const when = (ms) => { const days = Math.floor((Date.now() - ms) / 86400000); return days < 1 ? 'Today' : days === 1 ? 'Yesterday' : days < 30 ? `${days} days ago` : fmtDate(ms); };
      const tbody = h('tbody', {});
      const draw = () => {
        const rows = customers.filter((c) => !custQ || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(custQ));
        tbody.replaceChildren(...(rows.length ? rows.slice(0, 500).map((c) => h('tr', {}, h('td', {}, h('b', {}, c.name), c.orders > 1 && h('span', { class: 'tag sale', style: 'margin-left:8px' }, 'Regular'), c.company && h('div', { class: 'small muted' }, c.company)), h('td', {}, c.email ? h('a', { href: `mailto:${c.email}` }, c.email) : '—'), h('td', {}, c.phone ? h('a', { href: `tel:${c.phone.replace(/[^\d+]/g, '')}` }, c.phone) : '—'), h('td', {}, c.orders), h('td', {}, h('b', {}, money(c.spent))), h('td', { class: 'muted' }, c.last ? when(c.last) : 'Not yet'), h('td', { class: 'muted' }, c.favourite || '—'), h('td', { style: 'text-align:right' }, h('button', { class: 'btn soft sm', onclick: () => openInvoice(null, c) }, 'Invoice'))))
          : [h('tr', {}, h('td', { colspan: 8, class: 'muted', style: 'text-align:center;padding:28px' }, 'Nobody matches that search.'))]));
      };
      draw();
      const exportList = () => {
        const q2 = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = [['Name', 'Email', 'Phone', 'Orders', 'Total spent', 'First order', 'Last order', 'Favourite item'], ...customers.map((c) => [c.name, c.email, c.phone, c.orders, (c.spent / 100).toFixed(2), new Date(c.first).toISOString().slice(0, 10), c.last ? new Date(c.last).toISOString().slice(0, 10) : '', c.favourite])];
        const url = URL.createObjectURL(new Blob([`\ufeff${rows.map((r) => r.map(q2).join(',')).join('\r\n')}`], { type: 'text/csv' }));
        h('a', { href: url, download: `${meta.slug}-customers.csv` }).click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      };
      return [h('div', { class: 'inv' },
        head(h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('button', { class: 'btn soft', onclick: exportList }, ic('dl', 16), 'Export'), h('button', { class: 'btn soft', onclick: () => { customers = null; paintPanel(); } }, 'Refresh'), h('button', { class: 'btn soft', onclick: importCustomers }, ic('up2', 16), 'Import'), h('button', { class: 'btn', onclick: addCustomer }, ic('plus', 16), 'Add customer'))),
        h('div', { class: 'inv-kpis' }, kpi('Customers', customers.length, 'have ordered at least once', 'person'), kpi('Regulars', repeat, `${customers.length ? Math.round((repeat / customers.length) * 100) : 0}% came back`, 'f_users'), kpi('Average per customer', money(customers.length ? spent / customers.length : 0), 'across all their orders', 'cash'), kpi('Orders', count, 'not counting cancelled', 'bag')),
        h('div', { class: 'inv-bar' }, h('label', { class: 'inv-search' }, ic('search', 16), h('input', { type: 'search', placeholder: 'Search by name, email or phone', value: custQ, 'aria-label': 'Search customers', oninput: (e) => { custQ = e.target.value.trim().toLowerCase(); draw(); } }))),
        h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Customer', 'Email', 'Phone', 'Orders', 'Spent', 'Last order', 'Favourite', ''].map((x) => h('th', {}, x)))), tbody)),
          customers.length > 500 && h('p', { class: 'hint' }, `Showing the latest 500. Export to see all ${customers.length}.`)))];
    },

    invoices(kind = 'invoice') {
      const est = kind === 'estimate';
      const head = (extra) => h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, est ? 'Estimates' : 'Invoices'), h('p', { class: 'muted' }, est ? 'Send professional estimates to your customers, track their status and convert them into invoices.' : 'Bill catering, wholesale and other large orders. Customers get an email with a link to view and pay.')), extra);
      const newBtn = h('button', { class: 'btn', onclick: () => openInvoice(null, null, kind) }, ic('plus', 16), est ? 'New estimate' : 'New invoice');
      if (!bills) {
        api('GET', `/api/sites/${id}/invoices`).then((r) => { bills = r; if (tab === 'invoices' || tab === 'est') paintPanel(); }).catch((e) => { toast(e.message, true); bills = { invoices: [], contacts: [], payUrl: '' }; if (tab === 'invoices' || tab === 'est') paintPanel(); });
        return [h('div', { class: 'inv' }, head(), h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(5, 'row'))];
      }
      const all = bills.invoices.filter((v) => (v.kind || 'invoice') === kind);
      if (!all.length) return [h('div', { class: 'inv' }, head(newBtn), h('div', { class: 'inv-list' }, est ? emptyState('doc', 'Your first estimate', 'Build a professional estimate to send to your customers. When they say yes, convert it to an invoice in one tap.', ['Get started', () => openInvoice(null, null, 'estimate')]) : emptyState('doc', 'No invoices yet', 'Create one for a catering order or a business customer. Add what they ordered, press send, and track when it is opened and paid.', ['Create an invoice', () => openInvoice()])))];
      const stateOf = (v) => (invoiceLate(v) ? 'late' : v.status);
      const LABEL = est ? { draft: ['Draft', ''], sent: ['Sent', 'warn'], late: ['Expired', 'bad'], paid: ['Paid', 'ok'], void: ['Cancelled', ''] } : { draft: ['Draft', ''], sent: ['Awaiting payment', 'warn'], late: ['Past due', 'bad'], paid: ['Paid', 'ok'], void: ['Cancelled', ''] };
      const sum = (list) => list.reduce((a, v) => a + v.total, 0);
      const open = all.filter((v) => v.status === 'sent'), late = all.filter((v) => stateOf(v) === 'late');
      const month = new Date().toISOString().slice(0, 7);
      const paidNow = all.filter((v) => v.status === 'paid' && new Date(v.paidAt).toISOString().slice(0, 7) === month);
      const kpi = (label, value, sub, icon) => h('div', { class: 'kpi big' }, h('span', { class: 'kico' }, ic(icon, 18)), h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      const n = (k) => all.filter((v) => (k === 'open' ? v.status === 'sent' : stateOf(v) === k)).length;
      const day = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '—');
      const rows = all.filter((v) => (billFilter === 'all' || (billFilter === 'open' ? v.status === 'sent' : stateOf(v) === billFilter)) && (!billQ || `${v.label} ${v.customer.name} ${v.customer.company} ${v.customer.email}`.toLowerCase().includes(billQ)));
      const exportBills = () => {
        const q2 = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
        const out = [['Invoice', 'Status', 'Customer', 'Company', 'Email', 'Created', 'Sent', 'Due', 'Paid', 'Paid by', 'Subtotal', 'Discount', 'Tax', 'Total'], ...all.map((v) => [v.label, LABEL[stateOf(v)][0], v.customer.name, v.customer.company, v.customer.email, new Date(v.createdAt).toISOString().slice(0, 10), v.sentAt ? new Date(v.sentAt).toISOString().slice(0, 10) : '', v.due, v.paidAt ? new Date(v.paidAt).toISOString().slice(0, 10) : '', v.paidMethod, ...[v.subtotal, v.discount, v.tax, v.total].map((c) => (c / 100).toFixed(2))])];
        const url = URL.createObjectURL(new Blob([`\ufeff${out.map((r) => r.map(q2).join(',')).join('\r\n')}`], { type: 'text/csv' }));
        h('a', { href: url, download: `${meta.slug}-invoices.csv` }).click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      };
      return [h('div', { class: 'inv' },
        head(h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('button', { class: 'btn soft', onclick: exportBills }, ic('dl', 16), 'Export'), newBtn)),
        h('div', { class: 'inv-kpis' }, kpi('Awaiting payment', money(sum(open)), `${open.length} invoice${open.length === 1 ? '' : 's'} sent`, 'clock'), kpi('Past due', money(sum(late)), late.length ? `${late.length} need${late.length === 1 ? 's' : ''} a reminder` : 'Nothing overdue', 'alert'), kpi('Paid this month', money(sum(paidNow)), `${paidNow.length} invoice${paidNow.length === 1 ? '' : 's'}`, 'cash'), kpi('Drafts', n('draft'), 'not sent yet', 'doc')),
        h('div', { class: 'inv-bar' }, h('label', { class: 'inv-search' }, ic('search', 16), h('input', { type: 'search', placeholder: 'Search by number, name or email', value: billQ, 'aria-label': 'Search invoices', oninput: (e) => { billQ = e.target.value.trim().toLowerCase(); paintPanel(); const el = panel.querySelector('.inv-search input'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); } })),
          h('div', { class: 'inv-chips' }, [['all', `All · ${all.length}`], ['draft', `Drafts · ${n('draft')}`], ['open', `Awaiting payment · ${n('open')}`], ['late', `Past due · ${n('late')}`], ['paid', `Paid · ${n('paid')}`]].map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': String(billFilter === k), onclick: () => { billFilter = k; paintPanel(); } }, l)))),
        h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable bills' }, h('thead', {}, h('tr', {}, ['Invoice', 'Customer', 'Sent', 'Due', 'Total', 'Status', ''].map((x) => h('th', {}, x)))),
          h('tbody', {}, rows.length ? rows.map((v) => h('tr', { class: v.status === 'void' ? 'void' : '', onclick: (e) => { if (!e.target.closest('button,a')) openInvoice(v); } }, h('td', {}, h('b', {}, v.label)), h('td', {}, h('b', { style: 'font-weight:500' }, v.customer.company || v.customer.name), v.customer.company && v.customer.name !== v.customer.company && h('div', { class: 'small muted' }, v.customer.name)),
            h('td', { class: 'muted' }, v.sentAt ? fmtDate(v.sentAt) : '—'), h('td', { class: 'muted' }, day(v.due)), h('td', {}, h('b', {}, money(v.total))),
            h('td', {}, h('span', { class: `status ${LABEL[stateOf(v)][1]}` }, LABEL[stateOf(v)][0]), v.status === 'sent' && h('div', { class: 'small muted' }, v.viewedAt ? 'Opened by customer' : 'Not opened yet')),
            h('td', { style: 'text-align:right;white-space:nowrap' }, v.status === 'sent' && !est && h('button', { class: 'btn soft sm', onclick: () => markPaid(v) }, 'Mark paid'), est && v.status !== 'void' && h('button', { class: 'btn soft sm', onclick: () => convertEstimate(v) }, 'Convert to invoice'), ' ', h('button', { class: 'btn soft sm', onclick: () => openInvoice(v) }, v.status === 'draft' ? 'Edit' : 'Open'))))
            : [h('tr', {}, h('td', { colspan: 7, class: 'muted', style: 'text-align:center;padding:28px' }, 'No invoices match.'))])))),
        h('p', { class: 'hint' }, 'Invoices are tracked here on their own and are not added to the Sales screen, which covers orders placed on your site.'))];
    },

    insights() {
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Insights'), h('p', { class: 'muted' }, 'Your business snapshot for the last seven days, worked out from your own orders.')), h('button', { class: 'btn soft', onclick: async () => { await reload('insights'); paintPanel(); toast('Up to date'); } }, 'Refresh'));
      if (!insightData) { api('GET', `/api/sites/${id}/stats?range=last7`).then((r) => { insightData = r; if (tab === 'insights') paintPanel(); }).catch((e) => { toast(e.message, true); insightData = { failed: true }; if (tab === 'insights') paintPanel(); }); return [h('div', { class: 'inv' }, head, h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(4, 'row'))]; }
      const st = insightData;
      if (st.failed || !st.totals) return [h('div', { class: 'inv' }, head, h('div', { class: 'inv-list' }, emptyState('alert', 'We could not load your insights', 'Press Refresh to try again.')))];
      const t = st.totals, day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
      const kpi = (label, value, sub) => h('div', { class: 'kpi big' }, h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      const pct = (now, was) => (was ? `${now >= was ? 'up' : 'down'} ${Math.abs(Math.round(((now - was) / was) * 100))}% on the week before` : now ? 'no sales the week before to compare' : 'no change');
      if (!t.orders) return [h('div', { class: 'inv' }, head, h('div', { class: 'inv-kpis' }, kpi('Net sales', money(0), 'last 7 days'), kpi('Orders', 0, 'last 7 days'), kpi('Average order', money(0), ''), kpi('Discounts', money(0), '')), h('div', { class: 'inv-list' }, emptyState('chart', 'Not enough to go on yet', 'Insights appear once you have taken a few orders.')))];
      const best = [...st.series].sort((a, b) => b.net - a.net)[0], quiet = [...st.series].sort((a, b) => a.net - b.net)[0];
      const top = st.items[0], cat = st.categories[0], way = [...st.methods].sort((a, b) => b.orders - a.orders)[0];
      const low = menu.filter((x) => x.available !== false && x.stock <= (ordering.lowStockAt ?? 5));
      const notes = [
        ['Sales', `Net sales were ${money(t.net)} from ${t.orders} order${t.orders === 1 ? '' : 's'}, ${pct(t.net, st.previous.net)}. The average order was ${money(t.average)}.`],
        best && best.net > 0 && ['Busiest day', `${day(best.key)} brought in ${money(best.net)}, ${Math.round((best.net / (t.net || 1)) * 100)}% of the week.${quiet && quiet.key !== best.key ? ` The quietest was ${day(quiet.key)} with ${money(quiet.net)}.` : ''}`],
        top && ['Best seller', `${top.name} sold ${top.qty} time${top.qty === 1 ? '' : 's'} for ${money(top.sales)}${cat ? `. ${cat.name} was your strongest category at ${money(cat.sales)}` : ''}.`],
        way && way.orders > 0 && ['How people ordered', `${ORDER_METHODS[way.method]?.name || way.method} made up ${Math.round((way.orders / t.orders) * 100)}% of orders.`],
        ['Discounts and tips', `You gave ${money(t.discounts)} in discounts and customers added ${money(t.tips)} in tips.${t.cancelled ? ` ${t.cancelled} order${t.cancelled === 1 ? ' was' : 's were'} cancelled.` : ''}`],
        low.length > 0 && ['Stock', `${low.length} item${low.length === 1 ? ' is' : 's are'} running low: ${low.slice(0, 4).map((x) => x.name).join(', ')}${low.length > 4 ? ' and more' : ''}.`],
      ].filter(Boolean);
      return [h('div', { class: 'inv' }, head,
        h('div', { class: 'inv-kpis' }, kpi('Net sales', money(t.net), pct(t.net, st.previous.net)), kpi('Orders', t.orders, pct(t.orders, st.previous.orders)), kpi('Average order', money(t.average), 'including tax and tips'), kpi('Discounts', money(t.discounts), 'given this week')),
        h('div', { class: 'scard', style: 'padding:10px 24px' }, notes.map(([k, text2]) => h('div', { class: 'insight' }, h('b', {}, k), h('p', {}, text2)))),
        h('div', { class: 'row' }, h('button', { class: 'btn soft', onclick: () => goTab('sales') }, 'Open sales overview'), h('button', { class: 'btn soft', onclick: () => goTab('r-items') }, 'Open item sales')))];
    },
    projects() {
      const head = (extra) => h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Projects'), h('p', { class: 'muted' }, 'Group the estimates and invoices for one job, such as a wedding or a monthly catering contract, and see what has been billed and paid.')), extra);
      const create = async () => { const name = await ask({ title: 'Create project', label: 'Project name', hint: 'An estimate opens next, already filed under this project.', action: 'Create' }); if (name) openInvoice(null, { project: name }, 'estimate'); };
      const btn = h('button', { class: 'btn', onclick: create }, ic('plus', 16), 'Create project');
      if (!bills) { api('GET', `/api/sites/${id}/invoices`).then((r) => { bills = r; if (tab === 'projects') paintPanel(); }).catch(() => { bills = { invoices: [], contacts: [], payUrl: '' }; if (tab === 'projects') paintPanel(); }); return [h('div', { class: 'inv' }, head(), skel(4, 'row'))]; }
      const groups = new Map();
      for (const v of bills.invoices) { if (!v.project || v.status === 'void') continue; const g = groups.get(v.project) || groups.set(v.project, { name: v.project, who: new Set(), est: 0, inv: 0, billed: 0, paid: 0 }).get(v.project); g.who.add(v.customer.company || v.customer.name); if (v.kind === 'estimate') g.est++; else { g.inv++; g.billed += v.total; if (v.status === 'paid') g.paid += v.total; } }
      if (!groups.size) return [h('div', { class: 'inv' }, head(btn), h('div', { class: 'inv-list' }, emptyState('doc', 'Create a new project to get started', 'Give an estimate or invoice a project name and it is collected here.', ['Create project', create])))];
      return [h('div', { class: 'inv' }, head(btn), h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Project', 'Customer', 'Estimates', 'Invoices', 'Billed', 'Paid', 'Outstanding'].map((x) => h('th', {}, x)))),
        h('tbody', {}, [...groups.values()].map((g) => h('tr', {}, h('td', {}, h('b', {}, g.name)), h('td', {}, [...g.who].join(', ')), h('td', {}, g.est), h('td', {}, g.inv), h('td', {}, money(g.billed)), h('td', {}, money(g.paid)), h('td', {}, h('b', {}, money(g.billed - g.paid))))))))))];
    },
    plans() {
      const FREQ = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
      const add = () => formSheet('New recurring payment', [['name', 'Plan name', { maxlength: 120, placeholder: 'e.g. Weekly office lunch' }], ['who', 'Customer name', { maxlength: 120 }], ['email', 'Customer email', { type: 'email', hint: 'Each invoice is emailed here.' }], ['amount', 'Amount each time', { inputmode: 'decimal', placeholder: '0.00' }], ['every', 'How often', { options: FREQ }], ['start', 'First invoice on', { type: 'date' }], ['tax', 'Sales tax (%)', { inputmode: 'decimal' }]],
        { name: '', who: '', email: '', amount: '', every: 'monthly', start: new Date().toISOString().slice(0, 10), tax: String(ordering.taxRate || 0) },
        async (v) => { const c = parsePrice(v.amount || ''); if (!c) throw new Error('Enter an amount above zero.'); planData = await api('POST', `/api/sites/${id}/plans`, { name: v.name, customer: { name: v.who, email: v.email }, amount: c, every: v.every, start: v.start, taxRate: Number(v.tax) || 0 }); });
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Recurring payments'), h('p', { class: 'muted' }, 'Bill a customer the same amount on a schedule. Each time it is due, an invoice is created and emailed for you.')), h('button', { class: 'btn', onclick: add }, ic('plus', 16), 'New plan'));
      if (!planData) { api('GET', `/api/sites/${id}/plans`).then((r) => { planData = r; if (tab === 'plans') paintPanel(); }).catch((e) => { toast(e.message, true); planData = { plans: [] }; if (tab === 'plans') paintPanel(); }); return [h('div', { class: 'inv' }, head, h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(3, 'row'))]; }
      const all = planData.plans, live = all.filter((x) => x.status === 'active');
      const kpi = (label, value, sub) => h('div', { class: 'kpi big' }, h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      const act = async (fn, note) => { try { planData = await fn(); toast(note); paintPanel(); } catch (e) { toast(e.message, true); } };
      return [h('div', { class: 'inv' }, head,
        h('div', { class: 'inv-kpis' }, kpi('Total recurring amount', money(live.reduce((a, x) => a + x.amount, 0)), 'per billing, before tax'), kpi('Billed so far', money(all.reduce((a, x) => a + x.billed, 0)), 'across all plans'), kpi('Active plans', live.length, 'sending invoices'), kpi('Paused plans', all.length - live.length, 'on hold')),
        all.length ? h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Plan', 'Customer', 'Amount', 'Frequency', 'Next invoice', 'Status', 'Action'].map((x) => h('th', {}, x)))),
          h('tbody', {}, all.map((x) => h('tr', {}, h('td', {}, h('b', {}, x.name)), h('td', {}, x.customer.name, h('div', { class: 'small muted' }, x.customer.email)), h('td', {}, money(x.amount)), h('td', {}, FREQ[x.every]), h('td', {}, x.status === 'active' ? x.nextDate : '—'), h('td', {}, h('span', { class: `status ${x.status === 'active' ? 'ok' : ''}` }, x.status === 'active' ? 'Active' : 'Paused')),
            h('td', { style: 'white-space:nowrap' }, h('button', { class: 'btn soft sm', onclick: () => act(() => api('POST', `/api/sites/${id}/plans/${x.id}`, { status: x.status === 'active' ? 'paused' : 'active' }), x.status === 'active' ? 'Plan paused' : 'Plan resumed') }, x.status === 'active' ? 'Pause' : 'Resume'), ' ', h('button', { class: 'btn text sm', style: 'color:var(--red)', onclick: async () => { if (await confirmSheet({ title: `Delete ${x.name}?`, text: 'No more invoices are created. Invoices already sent are kept.', action: 'Delete', danger: true })) act(() => api('DELETE', `/api/sites/${id}/plans/${x.id}`), 'Plan deleted'); } }, 'Delete'))))))))
          : h('div', { class: 'inv-list' }, emptyState('doc', 'No recurring payments yet', 'Set one up for a standing order, a subscription or a retainer.', ['New plan', add])))];
    },
    gift() {
      const issue = () => formSheet('Issue a gift card', [['amount', 'Amount', { inputmode: 'decimal', placeholder: '25.00' }], ['name', 'For (name)', { maxlength: 120, placeholder: 'Optional' }], ['email', 'Email the code to', { type: 'email', placeholder: 'Optional' }], ['note', 'Note', { maxlength: 200, placeholder: 'Optional, e.g. Paid in cash' }]], { amount: '', name: '', email: '', note: '' },
        async (v) => { const c = parsePrice(v.amount || ''); if (!c) throw new Error('Enter an amount.'); const r = await api('POST', `/api/sites/${id}/gift-cards`, { amount: c, name: v.name, email: v.email, note: v.note }); giftData = r; setTimeout(() => sheet((close) => [h('h2', {}, 'Gift card ready'), h('p', { class: 'muted' }, r.emailed ? `We emailed the code to ${v.email}.` : 'Give this code to your customer. They type it in the promo code box at checkout, or you can redeem it for them here.'), h('div', { class: 'urlbox', style: 'font-size:24px;letter-spacing:.06em;text-align:center' }, r.code), h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: close }, 'Done'))]), 300); });
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Gift cards'), h('p', { class: 'muted' }, 'Issue digital gift cards. Customers spend them online by typing the code at checkout, or you can redeem them at the counter.')), h('button', { class: 'btn', onclick: issue }, ic('plus', 16), 'Issue gift card'));
      if (!giftData) { api('GET', `/api/sites/${id}/gift-cards`).then((r) => { giftData = r; if (tab === 'gift') paintPanel(); }).catch((e) => { toast(e.message, true); giftData = { cards: [] }; if (tab === 'gift') paintPanel(); }); return [h('div', { class: 'inv' }, head, h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(3, 'row'))]; }
      const cards = giftData.cards;
      const kpi = (label, value, sub) => h('div', { class: 'kpi big' }, h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      const sold = cards.reduce((a, c) => a + c.initial, 0), left = cards.reduce((a, c) => a + c.balance, 0);
      const change = async (c, sign) => { const v = await ask({ title: sign < 0 ? `Redeem from ${c.code}` : `Top up ${c.code}`, label: 'Amount', hint: sign < 0 ? `${money(c.balance)} is left on this card.` : 'Adds to the balance.', action: sign < 0 ? 'Redeem' : 'Top up' }); const cents = v && parsePrice(v); if (!cents) return; try { giftData = await api('POST', `/api/sites/${id}/gift-cards/${c.code}`, { change: sign * cents }); toast(sign < 0 ? 'Redeemed' : 'Topped up'); paintPanel(); } catch (e) { toast(e.message, true); } };
      return [h('div', { class: 'inv' }, head,
        h('div', { class: 'inv-kpis' }, kpi('Cards issued', cards.length, 'in total'), kpi('Value issued', money(sold), 'loaded onto cards'), kpi('Redeemed', money(sold - left), 'spent so far'), kpi('Outstanding', money(left), 'still to be spent')),
        cards.length ? h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Code', 'For', 'Balance', 'Loaded', 'Issued', 'Action'].map((x) => h('th', {}, x)))),
          h('tbody', {}, cards.map((c) => h('tr', {}, h('td', {}, h('b', { style: 'letter-spacing:.04em' }, c.code)), h('td', {}, c.name || c.email || '—', c.note && h('div', { class: 'small muted' }, c.note)), h('td', {}, h('b', {}, money(c.balance))), h('td', {}, money(c.initial)), h('td', { class: 'muted' }, fmtDate(c.createdAt)),
            h('td', { style: 'white-space:nowrap' }, c.balance > 0 && h('button', { class: 'btn soft sm', onclick: () => change(c, -1) }, 'Redeem'), ' ', h('button', { class: 'btn text sm', onclick: () => change(c, 1) }, 'Top up'))))))))
          : h('div', { class: 'inv-list' }, emptyState('tag', 'Grow your business with gift cards', 'Issue a card for any amount. The balance goes down each time it is used.', ['Issue gift card', issue])))];
    },
    settings() {
      const links = (...items) => items.filter(([, k]) => known(k)).map(([t, k]) => h('a', { href: pathFor(k), onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); goTab(k); } }, t));
      const card = (title, ...kids) => h('div', { class: 'set-card' }, h('h3', {}, title), ...kids);
      const u = state.user;
      return [h('div', { class: 'set-grid' },
        card('Profile', h('p', {}, h('b', {}, u.name || 'No name yet'), `, ${roleName}`), h('p', { class: 'muted' }, [u.phone, u.email].filter(Boolean).join(' | ')), h('p', { class: 'set-2fa' }, h('i', { class: u.twoFactor ? 'on' : '' }), 'Two-step sign-in is ', h('b', {}, u.twoFactor ? 'on' : 'off')), ...links(['Edit your profile', 'profile'])),
        card('About your business', ...links(['Business information', 'bizinfo'], ['Business hours', 'hours'], ['Closeout', 'close'])),
        card('Employees', ...links(['Team and logins', 'team'], ['Scheduling', 'schedule'], ['Timesheets', 'timesheets'])),
        card('Business operations', ...links(['Online ordering', 'ordering'], ['Online booking', 'booking'], ['Alerts and emails', 'alerts'], ['Devices', 'devices'], ['Tips', 'tips'], ['Taxes', 'r-taxes'], ['Appearance', 'appearance'])),
        card('Transactions', ...links(['Orders', 'orders'], ['Transactions', 'tx'], ['Cash log', 'cash'], ['Invoices', 'invoices'], ['Estimates', 'est'], ['Recurring payments', 'plans'])),
        card('Inventory', ...links(['Items', 'items'], ['Categories', 'menu'], ['Modifier groups', 'mods'], ['Menus', 'menus'], ['Printer labels', 'labels'], ['Revenue classes', 'revs'], ['Discounts', 'discs'])),
        card('Customers and promotions', ...links(['Customers', 'customers'], ['Promo codes', 'promos'], ['Happy hour', 'deals'], ['Rewards', 'rewards'], ['Gift cards', 'gift'])),
        card('Website', ...links(['Look and feel', 'design'], ['Home page', 'sections'], ['Business info on the site', 'business'], ['Web address', 'domain'], ['Policies', 'policies'], ['Search listing', 'seo'])))];
    },
    profile() {
      const u = state.user;
      const refresh = (user) => { state.user = { ...state.user, ...user }; paintPanel(); };
      const ask = (title, fields, send, note) => sheet((close) => {
        const err = h('p', { class: 'error', role: 'alert' });
        const form = h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); err.textContent = ''; try { await send(Object.fromEntries(new FormData(form))); close(); toast('Saved'); } catch (ex) { err.textContent = ex.message; } } },
          fields.map(([label, attrs]) => h('label', { class: 'field' }, h('span', {}, label), h('input', attrs))), note && h('p', { class: 'hint' }, note), err,
          h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn' }, 'Save')));
        return [h('h2', {}, title), form];
      });
      const card = (title, value, action, onclick, note) => h('div', { class: 'prof-card' }, h('div', {}, h('h3', {}, title), value && h('p', {}, value), note && h('small', {}, note)), h('button', { class: 'btn soft sm', type: 'button', onclick }, action));
      const twoStep = () => sheet((close) => {
        const err = h('p', { class: 'error', role: 'alert' }), qr = h('div', { class: 'qr-box' }, skel(1)), key = h('code', { class: 'totp-key' }, '…');
        api('POST', '/api/me/2fa/setup').then((r) => { key.textContent = r.secret.replace(/(.{4})/g, '$1 ').trim(); qrCanvas(r.uri).then((c) => qr.replaceChildren(c)).catch(() => qr.replaceChildren(h('p', { class: 'hint' }, 'Type the key below into your authenticator app instead.'))); }).catch((ex) => { err.textContent = ex.message; });
        const form = h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); err.textContent = ''; try { refresh((await api('POST', '/api/me/2fa/enable', Object.fromEntries(new FormData(form)))).user); close(); toast('Two-step sign-in is on'); } catch (ex) { err.textContent = ex.message; } } },
          h('ol', { class: 'steps-list' }, h('li', {}, 'Open an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password.'), h('li', {}, 'Scan this code, or type the key underneath it.'), h('li', {}, 'Enter the 6-digit code the app shows.')),
          qr, h('p', { class: 'center' }, key),
          h('label', { class: 'field' }, h('span', {}, '6-digit code'), h('input', { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 8, required: true, placeholder: '123 456' })), err,
          h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn' }, 'Turn on')));
        return [h('h2', {}, 'Turn on two-step sign-in'), h('p', { class: 'muted' }, 'After this, signing in needs your password and a code from your phone. Other devices will be signed out.'), form];
      });
      return [h('div', { class: 'prof' },
        card('Full name', u.name || 'Not added yet', u.name ? 'Edit' : 'Add', () => ask('Your name', [['Full name', { name: 'name', value: u.name || '', maxlength: 80, autocomplete: 'name', required: true, autofocus: true }]], async (d) => refresh((await api('PUT', '/api/me', d)).user))),
        card('Email address', u.email, 'Edit', () => ask('Change your email address', [['New email address', { name: 'email', type: 'email', value: u.email, required: true, autocomplete: 'email' }], ['Your password, to confirm', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' }]], async (d) => refresh((await api('POST', '/api/me/email', d)).user), 'You will sign in with the new address from now on.'), 'This is what you sign in with.'),
        card('Mobile number', u.phone || '', u.phone ? 'Edit' : 'Add', () => ask('Your mobile number', [['Mobile number', { name: 'phone', type: 'tel', value: u.phone || '', autocomplete: 'tel', maxlength: 40 }]], async (d) => refresh((await api('PUT', '/api/me', d)).user)), 'So Processor Freedom can reach you about your account.'),
        card('Password', '••••••••••', 'Edit', () => ask('Change your password', [['Current password', { name: 'current', type: 'password', required: true, autocomplete: 'current-password' }], ['New password', { name: 'next', type: 'password', required: true, minlength: 8, autocomplete: 'new-password' }]], (d) => api('POST', '/api/auth/password', d), 'At least 8 characters. Other devices are signed out.')),
        card('Two-step sign-in', u.twoFactor ? 'On' : 'Off', u.twoFactor ? 'Turn off' : 'Turn on', u.twoFactor ? () => ask('Turn off two-step sign-in', [['Your password, to confirm', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' }]], async (d) => refresh((await api('POST', '/api/me/2fa/disable', d)).user), 'Signing in will need only your password again.') : twoStep, u.twoFactor ? 'Signing in needs your password and a code from your authenticator app.' : 'Add a second step when you sign in: a code from an app on your phone.'),
        card('Signed in elsewhere?', '', 'Sign out everywhere', async () => { if (!await confirmSheet({ title: 'Sign out everywhere?', text: 'This signs your account out on every phone, tablet and computer, including this one.', action: 'Sign out everywhere' })) return; await api('POST', '/api/auth/logout-all'); state.user = null; go('/login'); }, 'Use this if a phone or computer was lost or shared.'))];
    },
    appearance() {
      const now = getTheme();
      const choice = (k, label, note) => h('button', { class: 'look-opt', type: 'button', 'aria-pressed': String(now === k), onclick: () => { setTheme(k); paintPanel(); } }, h('span', { class: `look-prev ${k}`, 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('b', {}, label), h('small', {}, note));
      return [group('Light or dark', h('div', { class: 'look-opts' }, choice('light', 'Light', 'Bright background, dark text.'), choice('dark', 'Dark', 'Dark background, easier at night.'), choice('auto', 'Match this device', 'Follows the setting on your phone or computer.')))];
    },
    devices() {
      if (!deviceData) { api('GET', `/api/sites/${id}/devices`).then((r) => { deviceData = r; if (tab === 'devices') paintPanel(); }).catch((e) => { toast(e.message, true); deviceData = { devices: [] }; if (tab === 'devices') paintPanel(); }); return [group('', skel(3, 'row'))]; }
      const here = h('button', { class: 'btn', style: 'justify-self:start', onclick: async () => { try { await enablePush(); pushIsOn = true; await reload('devices'); toast('This device will be notified of new orders'); paintPanel(); } catch (e) { toast(e.message, true); } } }, ic('bell', 16), 'Notify this device');
      return [group('Notified devices', deviceData.devices.length ? h('div', { class: 'slist' }, deviceData.devices.map((d) => h('div', { class: 'srow', style: 'padding:12px 12px 12px 16px;gap:10px' }, h('span', { class: 'sico' }, ic('phone', 16)), h('div', { class: 'grow', style: 'min-width:0' }, h('b', { style: 'font-weight:500;font-size:15px;display:block' }, d.name || d.email), h('span', { class: 'small muted' }, `Added ${fmtDate(d.createdAt)} · via ${d.service}`)),
        h('button', { class: 'btn text sm', style: 'color:var(--red)', onclick: async () => { if (!await confirmSheet({ title: 'Stop notifying this device?', text: 'It will no longer get new-order notifications.', action: 'Remove', danger: true })) return; try { await api('DELETE', `/api/sites/${id}/devices/${d.id}`); await reload('devices'); paintPanel(); } catch (e) { toast(e.message, true); } } }, 'Remove'))))
        : emptyState('phone', 'No devices yet', 'Turn on notifications on the phone, tablet or computer you keep at the counter.'), pushIsOn !== true && here,
        h('small', { class: 'hint' }, 'On iPhone and iPad, add PF Sites to your Home Screen first, then turn notifications on from there.'))];
    },
    appts(asCalendar = false) {
      const tabNow = asCalendar ? 'calendar' : 'appts';
      const b = ordering.booking;
      const add = () => formSheet('Add appointment', [['serviceName', 'What for', { maxlength: 80, placeholder: b.services[0]?.name || 'e.g. Table for dinner' }], ['date', 'Date', { type: 'date' }], ['time', 'Time', { type: 'time' }], ['name', 'Customer name', { maxlength: 120 }], ['phone', 'Phone', { type: 'tel' }], ['party', 'Number of people', { type: 'number', min: 1 }], ['notes', 'Notes', { maxlength: 500 }]],
        { serviceName: b.services[0]?.name || '', date: apptData?.today || new Date().toISOString().slice(0, 10), time: '18:00', name: '', phone: '', party: '2', notes: '' }, async (v) => { await api('POST', `/api/sites/${id}/appointments`, v); await reload('appts'); });
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, asCalendar ? 'Calendar' : 'Appointments'), h('p', { class: 'muted' }, asCalendar ? 'Every booking for the next two weeks, day by day.' : 'Booking requests from your website, and appointments you add yourself.')),
        h('div', { class: 'row' }, !b.enabled && h('button', { class: 'btn soft', onclick: () => goTab('booking') }, 'Set up online booking'), h('button', { class: 'btn', onclick: add }, ic('plus', 16), 'Add appointment')));
      if (!apptData) { api('GET', `/api/sites/${id}/appointments`).then((r) => { apptData = r; if (tab === tabNow) paintPanel(); }).catch((e) => { toast(e.message, true); apptData = { today: '', appointments: [] }; if (tab === tabNow) paintPanel(); }); return [h('div', { class: 'inv' }, head, h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(4, 'row'))]; }
      const all = apptData.appointments, today = apptData.today;
      const setStatus = async (a, status) => { try { Object.assign(a, (await api('POST', `/api/sites/${id}/appointments/${a.id}`, { status })).appointment); paintPanel(); } catch (e) { toast(e.message, true); } };
      const NAME = { pending: ['Pending', 'warn'], confirmed: ['Confirmed', 'ok'], completed: ['Completed', ''], cancelled: ['Cancelled', 'bad'], noshow: ['No-show', 'bad'] };
      const clock = (at) => { const [hh, mm] = at.slice(11).split(':').map(Number); return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
      const dayName = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
      const acts = (a) => h('div', { class: 'row', style: 'flex-wrap:wrap;justify-content:flex-end' }, a.status === 'pending' && h('button', { class: 'btn sm', onclick: () => setStatus(a, 'confirmed') }, 'Confirm'), a.status === 'pending' && h('button', { class: 'btn soft sm', onclick: () => setStatus(a, 'cancelled') }, 'Decline'),
        a.status === 'confirmed' && h('button', { class: 'btn soft sm', onclick: () => setStatus(a, 'completed') }, 'Complete'), a.status === 'confirmed' && h('button', { class: 'btn text sm', onclick: () => setStatus(a, 'noshow') }, 'No-show'), a.status === 'confirmed' && h('button', { class: 'btn text sm', style: 'color:var(--red)', onclick: () => setStatus(a, 'cancelled') }, 'Cancel'));
      const row = (a, withDay) => h('div', { class: 'appt' }, h('div', { class: 'appt-t' }, h('b', {}, clock(a.at)), withDay && h('small', {}, dayName(a.at.slice(0, 10)))), h('div', { class: 'grow', style: 'min-width:0' }, h('b', {}, `${a.name} · ${a.party} ${a.party === 1 ? 'person' : 'people'}`), h('div', { class: 'small muted' }, [a.service, a.phone, a.notes].filter(Boolean).join(' · '))), h('span', { class: `status ${NAME[a.status][1]}` }, NAME[a.status][0]), acts(a));
      const kpi = (label, value, sub) => h('div', { class: 'kpi big' }, h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      const upcoming = all.filter((a) => a.at.slice(0, 10) >= today), n = (st2) => all.filter((a) => a.status === st2).length;
      if (asCalendar) {
        const days = Array.from({ length: 14 }, (_, i) => new Date(Date.parse(`${today}T12:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
        return [h('div', { class: 'inv' }, head, days.map((d) => { const list = all.filter((a) => a.at.slice(0, 10) === d && a.status !== 'cancelled'); return h('div', { class: 'scard', style: 'padding:18px 24px' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, d === today ? `Today · ${dayName(d)}` : dayName(d)), h('span', { class: 'small muted' }, `${list.length} booking${list.length === 1 ? '' : 's'}`)), list.length ? list.map((a) => row(a)) : h('p', { class: 'muted', style: 'padding:6px 0 2px' }, 'Nothing booked.')); }))];
      }
      const pending = all.filter((a) => a.status === 'pending'), todays = all.filter((a) => a.at.slice(0, 10) === today && a.status !== 'cancelled');
      return [h('div', { class: 'inv' }, head,
        h('div', { class: 'inv-kpis' }, kpi('Today', todays.length, 'appointments'), kpi('Pending', pending.length, pending.length ? 'need a reply' : 'all answered'), kpi('Confirmed', upcoming.filter((a) => a.status === 'confirmed').length, 'coming up'), kpi('Completed', n('completed'), `${n('noshow')} no-show · ${n('cancelled')} cancelled`)),
        h('div', { class: 'scard', style: 'padding:18px 24px' }, h('h3', {}, 'Pending requests'), pending.length ? pending.map((a) => row(a, true)) : h('p', { class: 'muted', style: 'padding:6px 0 2px' }, 'Pending appointments need to be confirmed or declined. There are none right now.')),
        h('div', { class: 'scard', style: 'padding:18px 24px' }, h('h3', {}, "Today's appointments"), todays.length ? todays.map((a) => row(a)) : h('p', { class: 'muted', style: 'padding:6px 0 2px' }, 'There are no appointments scheduled for today.')),
        h('div', { class: 'scard', style: 'padding:18px 24px' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, 'Coming up'), h('button', { class: 'btn text sm', onclick: () => goTab('calendar') }, 'Open calendar')), upcoming.filter((a) => a.at.slice(0, 10) > today && a.status === 'confirmed').slice(0, 12).map((a) => row(a, true)), !upcoming.some((a) => a.at.slice(0, 10) > today && a.status === 'confirmed') && h('p', { class: 'muted', style: 'padding:6px 0 2px' }, 'No confirmed bookings after today.')))];
    },
    booking() {
      const b = ordering.booking;
      const sv = debounce(async () => { try { await putOrdering(); } catch (e) { toast(e.message, true); } }, 450);
      const inp = (label, value, on, a = {}, hint) => h('label', { class: 'field' }, h('span', {}, label), h('input', { value, oninput: (e) => { on(e.target.value); sv(); }, ...a }), hint && h('small', {}, hint));
      const url = `${meta.url.replace(/\/$/, '')}/book`;
      return [
        group('Booking page', h('label', { class: 'switch' }, h('span', {}, 'Take booking requests on my website'), h('input', { type: 'checkbox', checked: b.enabled, onchange: async (e) => { b.enabled = e.target.checked; try { await putOrdering(); } catch (ex) { toast(ex.message, true); } paintPanel(); } }), h('i')),
          b.enabled && !b.services.length && note(h('b', {}, 'Add at least one thing to book below. '), 'The page appears once there is something to choose.'),
          b.enabled && b.services.length > 0 && h('div', { class: 'note', style: 'overflow-wrap:anywhere' }, h('b', {}, 'Your booking page: '), meta.live ? h('a', { href: url, target: '_blank', rel: 'noopener' }, url.replace(/^https?:\/\//, '')) : 'publish your site to make it public.', h('div', { class: 'small', style: 'margin-top:6px' }, 'To link to it from your site, set any button’s link to /book under Website.')),
          inp('Page heading', b.title, (v) => { b.title = v; }, { maxlength: 60 }), inp('Short message', b.note, (v) => { b.note = v; }, { maxlength: 300, placeholder: 'e.g. We hold tables for 15 minutes.' }),
          inp('Bookings allowed at the same time', b.perSlot, (v) => { b.perSlot = Math.max(1, Math.round(Number(v)) || 1); }, { type: 'number', min: 1, max: 200, style: 'max-width:160px' }, 'Once a time has this many bookings, customers are asked to choose another.')),
        group('What customers can book', h('div', { class: 'stack' }, b.services.map((x, i) => h('div', { class: 'zrow svc' }, h('input', { value: x.name, placeholder: 'e.g. Table for dinner', 'aria-label': 'Name', maxlength: 80, oninput: (e) => { x.name = e.target.value; sv(); } }), h('input', { type: 'number', min: 0, value: x.minutes, 'aria-label': 'Minutes', title: 'Minutes', oninput: (e) => { x.minutes = Math.max(0, Math.round(Number(e.target.value)) || 0); sv(); } }), h('input', { value: (x.price / 100).toFixed(2), inputmode: 'decimal', 'aria-label': 'Price', title: 'Price (0 for free)', oninput: (e) => { const c = parsePrice(e.target.value || '0'); if (c !== null) { x.price = c; sv(); } } }),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove', onclick: async () => { b.services.splice(i, 1); try { await putOrdering(); } catch (ex) { toast(ex.message, true); } paintPanel(); } }, ic('trash', 16))))),
          h('button', { type: 'button', class: 'btn soft sm', style: 'justify-self:start', onclick: () => { b.services.push({ id: uid('s'), name: b.services.length ? '' : 'Table booking', minutes: 60, price: 0 }); sv(); paintPanel(); } }, ic('plus', 14), 'Add something to book'),
          h('small', { class: 'hint' }, 'Name, length in minutes, and price (0 if it is free). Times offered follow your business hours.')),
      ];
    },
    schedule() {
      const add = () => formSheet('Add a shift', [['name', 'Who', { list: 'pf-people', maxlength: 80 }], ['day', 'Day', { type: 'date' }], ['start', 'Starts', { type: 'time' }], ['finish', 'Ends', { type: 'time' }], ['note', 'Note', { maxlength: 120, placeholder: 'Optional, e.g. Opening' }]],
        { name: shiftData?.people[0] || '', day: shiftData?.today || '', start: '09:00', finish: '17:00', note: '' }, async (v) => { await api('POST', `/api/sites/${id}/shifts`, v); await reload('schedule'); }, () => h('datalist', { id: 'pf-people' }, (shiftData?.people || []).map((x) => h('option', { value: x }))));
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Scheduling'), h('p', { class: 'muted' }, 'Plan who is working and when, for the week ahead.')), h('button', { class: 'btn', onclick: add }, ic('plus', 16), 'Add shift'));
      if (!shiftData) { api('GET', `/api/sites/${id}/shifts`).then((r) => { shiftData = r; if (tab === 'schedule') paintPanel(); }).catch((e) => { toast(e.message, true); shiftData = { today: new Date().toISOString().slice(0, 10), people: [], shifts: [] }; if (tab === 'schedule') paintPanel(); }); return [h('div', { class: 'inv' }, head, skel(5, 'row'))]; }
      const { today, shifts } = shiftData;
      const t12 = (t) => { const [hh, mm] = t.split(':').map(Number); return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
      const hours = (x) => { const m = (Number(x.finish.slice(0, 2)) * 60 + Number(x.finish.slice(3))) - (Number(x.start.slice(0, 2)) * 60 + Number(x.start.slice(3))); return ((m <= 0 ? m + 1440 : m) / 60); };
      const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${today}T12:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
      const week = shifts.filter((x) => days.includes(x.day));
      const kpi = (label, value, sub) => h('div', { class: 'kpi big' }, h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      return [h('div', { class: 'inv' }, head,
        h('div', { class: 'inv-kpis' }, kpi('Shifts this week', week.length, 'next 7 days'), kpi('Hours scheduled', week.reduce((a, x) => a + hours(x), 0).toFixed(1), 'next 7 days'), kpi('People scheduled', new Set(week.map((x) => x.name)).size, 'this week'), kpi('Today', shifts.filter((x) => x.day === today).length, 'shifts')),
        days.map((d) => { const list = shifts.filter((x) => x.day === d); return h('div', { class: 'scard', style: 'padding:18px 24px' }, h('h3', {}, `${d === today ? 'Today · ' : ''}${new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })}`),
          list.length ? list.map((x) => h('div', { class: 'appt' }, h('div', { class: 'appt-t' }, h('b', {}, t12(x.start)), h('small', {}, `to ${t12(x.finish)}`)), h('div', { class: 'grow' }, h('b', {}, x.name), h('div', { class: 'small muted' }, [`${hours(x).toFixed(1)} hours`, x.note].filter(Boolean).join(' · '))), h('button', { class: 'btn text sm', style: 'color:var(--red)', onclick: async () => { try { await api('DELETE', `/api/sites/${id}/shifts/${x.id}`); await reload('schedule'); paintPanel(); } catch (e) { toast(e.message, true); } } }, 'Remove'))) : h('p', { class: 'muted', style: 'padding:6px 0 2px' }, 'Nobody scheduled.')); }))];
    },
    timesheets() {
      const head = (btn) => h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Timesheets'), h('p', { class: 'muted' }, 'Clock in when you start and out when you finish. Hours add up here for payroll.')), btn);
      if (!clockData) { api('GET', `/api/sites/${id}/timeclock`).then((r) => { clockData = r; if (tab === 'timesheets') paintPanel(); }).catch((e) => { toast(e.message, true); clockData = { entries: [], mine: null }; if (tab === 'timesheets') paintPanel(); }); return [h('div', { class: 'inv' }, head(), h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(4, 'row'))]; }
      const { entries, mine } = clockData;
      const punch = h('button', { class: `btn ${mine ? 'soft' : ''}`, onclick: async () => { try { clockData = await api('POST', `/api/sites/${id}/timeclock`, { action: mine ? 'out' : 'in' }); toast(mine ? 'Clocked out' : 'Clocked in'); paintPanel(); } catch (e) { toast(e.message, true); } } }, ic('clock', 16), mine ? 'Clock out' : 'Clock in');
      const hrs = (x) => ((x.outAt || Date.now()) - x.inAt) / 3600000;
      const weekAgo = Date.now() - 7 * 86400000;
      const week = entries.filter((x) => x.inAt > weekAgo);
      const per = new Map(); for (const x of week) per.set(x.name, (per.get(x.name) || 0) + hrs(x));
      const when = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const kpi = (label, value, sub) => h('div', { class: 'kpi big' }, h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      return [h('div', { class: 'inv' }, head(punch),
        h('div', { class: 'inv-kpis' }, kpi('On the clock now', entries.filter((x) => !x.outAt).length, mine ? `you clocked in ${when(mine.inAt)}` : 'you are clocked out'), kpi('Hours, last 7 days', week.reduce((a, x) => a + hrs(x), 0).toFixed(1), 'everyone'), kpi('People', per.size, 'worked this week'), kpi('Shifts', week.length, 'last 7 days')),
        per.size > 0 && h('div', { class: 'scard', style: 'padding:18px 24px' }, h('h3', {}, 'Hours by person, last 7 days'), [...per].sort((a, b) => b[1] - a[1]).map(([name, v]) => h('div', { class: 'rline' }, h('span', { style: 'color:var(--ink)' }, name), h('b', {}, `${v.toFixed(2)} hours`)))),
        entries.length ? h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Name', 'Clocked in', 'Clocked out', 'Hours', 'Action'].map((x) => h('th', {}, x)))),
          h('tbody', {}, entries.slice(0, 200).map((x) => h('tr', {}, h('td', {}, h('b', {}, x.name)), h('td', {}, when(x.inAt)), h('td', {}, x.outAt ? when(x.outAt) : h('span', { class: 'status ok' }, 'Working now')), h('td', {}, hrs(x).toFixed(2)), h('td', {}, h('button', { class: 'btn text sm', style: 'color:var(--red)', onclick: async () => { if (!await confirmSheet({ title: 'Delete this entry?', text: 'It is removed from the timesheet.', action: 'Delete', danger: true })) return; try { clockData = await api('DELETE', `/api/sites/${id}/timeclock/${x.id}`); paintPanel(); } catch (e) { toast(e.message, true); } } }, 'Delete'))))))))
          : h('div', { class: 'inv-list' }, emptyState('clock', 'No time recorded yet', 'Press Clock in when your shift starts. Staff with their own login can do the same.')))];
    },
    tx() {
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Transactions'), h('p', { class: 'muted' }, 'Every payment and refund you have recorded, from orders and invoices.')), h('div', { class: 'row' }, h('button', { class: 'btn soft', onclick: () => window.print() }, ic('print', 16), 'Print'), h('button', { class: 'btn soft', onclick: async () => { await reload('tx'); paintPanel(); toast('Up to date'); } }, 'Refresh')));
      if (!txData) { api('GET', `/api/sites/${id}/transactions?${rq()}`).then((r) => { txData = r; if (tab === 'tx') paintPanel(); }).catch((e) => { toast(e.message, true); txData = { payments: [], refunds: [], tenders: [], totals: { payments: 0, count: 0, refunds: 0, refundCount: 0, net: 0 } }; if (tab === 'tx') paintPanel(); }); return [h('div', { class: 'inv' }, head, rangeBar(), h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(5, 'row'))]; }
      if (txData.range && txData.range !== rq().get('range')) reload('tx', true);
      const d = txData, t = d.totals;
      const kpi = (label, value, sub) => h('div', { class: 'kpi big' }, h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      const rows = [...(txFilter !== 'refunds' ? d.payments.map((x) => ({ ...x, type: 'Payment' })) : []), ...(txFilter !== 'payments' ? d.refunds.map((x) => ({ ...x, type: 'Refund' })) : [])].sort((a, b) => b.at - a.at);
      return [h('div', { class: 'inv' }, head, rangeBar(),
        h('div', { class: 'inv-kpis' }, kpi('Payments', money(t.payments), `${t.count} recorded`), kpi('Refunds', money(t.refunds), `${t.refundCount} recorded`), kpi('Net collected', money(t.net), 'payments less refunds'), kpi('Tender types', d.tenders.length, d.tenders.map((x) => x.method).join(', ') || 'none yet')),
        h('div', { class: 'inv-bar' }, h('div', { class: 'inv-chips' }, [['all', 'All'], ['payments', `Payments · ${t.count}`], ['refunds', `Refunds · ${t.refundCount}`]].map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': String(txFilter === k), onclick: () => { txFilter = k; paintPanel(); } }, l)))),
        rows.length ? h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Time', 'Type', 'For', 'Customer', 'Tender', 'Amount', 'Note'].map((x) => h('th', {}, x)))),
          h('tbody', {}, rows.map((x) => h('tr', {}, h('td', {}, `${d.from === d.to ? '' : `${x.date} `}${x.time}`), h('td', {}, h('span', { class: `status ${x.type === 'Refund' ? 'bad' : 'ok'}` }, x.type)), h('td', {}, h('b', {}, `${x.source} ${x.ref}`)), h('td', {}, x.customer || '—'), h('td', {}, x.method), h('td', {}, h('b', {}, `${x.type === 'Refund' ? '−' : ''}${money(x.amount)}`)), h('td', { class: 'muted' }, x.note || x.by || '')))))))
          : h('div', { class: 'inv-list' }, emptyState('cash', 'No transactions in this period', 'Record a payment on an order, or mark an invoice as paid, and it appears here.', ['Go to orders', () => goTab('orders')])))];
    },
    cash() {
      const add = (kind) => formSheet(kind === 'in' ? 'Cash in' : 'Cash out', [['amount', 'Amount', { inputmode: 'decimal', placeholder: '0.00' }], ['note', 'What for', { maxlength: 200, placeholder: kind === 'in' ? 'e.g. Opening float' : 'e.g. Bank deposit' }]], { amount: '', note: '' }, async (v) => { const c = parsePrice(v.amount || ''); if (!c) throw new Error('Enter an amount above zero.'); await api('POST', `/api/sites/${id}/cash`, { kind, amount: c, note: v.note }); await reload('cash'); });
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Cash log'), h('p', { class: 'muted' }, 'Money put into and taken out of the drawer, beside the cash payments recorded on orders.')), h('div', { class: 'row' }, h('button', { class: 'btn soft', onclick: () => add('out') }, ic('minus', 16), 'Cash out'), h('button', { class: 'btn', onclick: () => add('in') }, ic('plus', 16), 'Cash in')));
      if (!cashData) { api('GET', `/api/sites/${id}/cash?${rq()}`).then((r) => { cashData = r; if (tab === 'cash') paintPanel(); }).catch((e) => { toast(e.message, true); cashData = { entries: [], totals: { cashSales: 0, cashRefunds: 0, paidIn: 0, paidOut: 0, expected: 0 } }; if (tab === 'cash') paintPanel(); }); return [h('div', { class: 'inv' }, head, rangeBar(), h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(4, 'row'))]; }
      if (cashData.range && cashData.range !== rq().get('range')) reload('cash', true);
      const d = cashData, t = d.totals;
      const kpi = (label, value, sub) => h('div', { class: 'kpi big' }, h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      return [h('div', { class: 'inv' }, head, rangeBar(),
        h('div', { class: 'inv-kpis' }, kpi('Cash sales', money(t.cashSales), t.cashRefunds ? `${money(t.cashRefunds)} refunded in cash` : 'orders paid in cash'), kpi('Cash in', money(t.paidIn), 'added to the drawer'), kpi('Cash out', money(t.paidOut), 'taken from the drawer'), kpi('Expected in drawer', money(t.expected), 'for this period')),
        d.entries.length ? h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Time', 'Type', 'Amount', 'What for', 'By', 'Action'].map((x) => h('th', {}, x)))),
          h('tbody', {}, d.entries.map((x) => h('tr', {}, h('td', {}, `${d.from === d.to ? '' : `${x.date} `}${x.time}`), h('td', {}, h('span', { class: `status ${x.kind === 'in' ? 'ok' : 'warn'}` }, x.kind === 'in' ? 'Cash in' : 'Cash out')), h('td', {}, h('b', {}, money(x.amount))), h('td', {}, x.note || '—'), h('td', { class: 'muted' }, x.by), h('td', {}, h('button', { class: 'btn text sm', style: 'color:var(--red)', onclick: async () => { if (!await confirmSheet({ title: 'Delete this entry?', text: 'It is removed from the cash log.', action: 'Delete', danger: true })) return; try { await api('DELETE', `/api/sites/${id}/cash/${x.id}`); await reload('cash'); paintPanel(); } catch (e) { toast(e.message, true); } } }, 'Delete'))))))))
          : h('div', { class: 'inv-list' }, emptyState('cash', 'No cash entries in this period', 'Log your opening float, bank deposits and anything else that goes in or out of the drawer.', ['Cash in', () => add('in')])))];
    },
    close() {
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Closeout'), h('p', { class: 'muted' }, 'Your open batch is every payment and refund recorded since the last closeout. Close it out at the end of the day to file the totals away.')));
      if (!closeData) { api('GET', `/api/sites/${id}/closeouts`).then((r) => { closeData = r; if (tab === 'close') paintPanel(); }).catch((e) => { toast(e.message, true); closeData = { open: { tenders: [], totals: { payments: 0, count: 0, refunds: 0, refundCount: 0, net: 0 }, paidIn: 0, paidOut: 0, number: 1, since: 0 }, history: [] }; if (tab === 'close') paintPanel(); }); return [h('div', { class: 'inv' }, head, h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(3, 'row'))]; }
      const o = closeData.open, t = o.totals;
      const kpi = (label, value, sub) => h('div', { class: 'kpi big' }, h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      const line = (label, value, cls = '') => h('div', { class: `rline ${cls}` }, h('span', {}, label), h('b', {}, value));
      const empty = !t.count && !t.refundCount && !o.paidIn && !o.paidOut;
      const when = (ms) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      return [h('div', { class: 'inv' }, head,
        h('div', { class: 'inv-kpis' }, kpi('Batch total', money(t.net), o.since ? `since ${when(o.since)}` : 'since you started'), kpi(`Payments (${t.count})`, money(t.payments), 'recorded'), kpi(`Refunds (${t.refundCount})`, money(t.refunds), 'recorded'), kpi('Status', 'Open', `batch ${o.number}`)),
        h('div', { class: 'scard', style: 'padding:22px 24px' }, h('h3', {}, 'Current batch'), o.tenders.length ? o.tenders.map((x) => line(`${x.method} · ${x.count} payment${x.count === 1 ? '' : 's'}`, money(x.amount - x.refunds))) : h('p', { class: 'muted', style: 'padding:8px 0' }, 'No payments recorded in this batch yet.'), o.paidIn > 0 && line('Cash in (not part of the batch total)', money(o.paidIn)), o.paidOut > 0 && line('Cash out (not part of the batch total)', `−${money(o.paidOut)}`), line('Batch total', money(t.net), 'total'),
          h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn', disabled: empty, onclick: async () => { if (!await confirmSheet({ title: `Close out batch ${o.number}?`, text: `${money(t.net)} from ${t.count} payment${t.count === 1 ? '' : 's'} will be filed under Batch history, and a new batch starts.`, action: 'Close out' })) return; try { await api('POST', `/api/sites/${id}/closeouts`); await reload('close'); toast('Batch closed out'); paintPanel(); } catch (e) { toast(e.message, true); } } }, 'Close out'))),
        h('div', { class: 'scard' }, h('h3', {}, 'Batch history'), closeData.history.length ? h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Batch', 'Closed', 'By', 'Payments', 'Refunds', 'Amount'].map((x) => h('th', {}, x)))),
          h('tbody', {}, closeData.history.map((b2) => h('tr', {}, h('td', {}, h('b', {}, `Batch ${b2.number}`)), h('td', {}, when(b2.createdAt)), h('td', { class: 'muted' }, b2.by), h('td', {}, `${b2.totals.count} · ${money(b2.totals.payments)}`), h('td', {}, `${b2.totals.refundCount} · ${money(b2.totals.refunds)}`), h('td', {}, h('b', {}, money(b2.totals.net)))))))) : h('p', { class: 'muted', style: 'padding:0 22px 20px' }, 'No batches closed yet.')))];
    },
    'r-exports'() {
      const grab = async (label, fn) => { try { const [name, rows] = await fn(); csvFile(name, rows); toast(`${label} downloaded`); } catch (e) { toast(e.message, true); } };
      const iso = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
      const cash = (c) => (c / 100).toFixed(2);
      const list = [
        ['Orders, last 30 days', 'Every order with its totals, tax, tip, tender and who handled it.', async () => { const st = await api('GET', `/api/sites/${id}/stats?range=last30`); return [`${meta.slug}-orders`, [['Order', 'Date', 'Time', 'Type', 'Customer', 'Status', 'Net sales', 'Tax', 'Tip', 'Total', 'Paid by', 'Handled by'], ...st.orders.map((o) => [o.number, o.date, o.time, o.method, o.name, o.status, cash(o.subtotal - o.discount), cash(o.tax), cash(o.tip), cash(o.total), o.paid, o.by])]]; }],
        ['Item sales, last 30 days', 'Units sold and sales for each item.', async () => { const st = await api('GET', `/api/sites/${id}/stats?range=last30`); return [`${meta.slug}-item-sales`, [['Item', 'Category', 'Sold', 'Sales'], ...st.items.map((i) => [i.name, i.category, i.qty, cash(i.sales)])]]; }],
        ['Transactions, last 30 days', 'Recorded payments and refunds.', async () => { const d = await api('GET', `/api/sites/${id}/transactions?range=last30`); return [`${meta.slug}-transactions`, [['Date', 'Time', 'Type', 'For', 'Customer', 'Tender', 'Amount', 'Note'], ...d.payments.map((x) => [x.date, x.time, 'Payment', `${x.source} ${x.ref}`, x.customer, x.method, cash(x.amount), '']), ...d.refunds.map((x) => [x.date, x.time, 'Refund', `${x.source} ${x.ref}`, x.customer, x.method, `-${cash(x.amount)}`, x.note])]]; }],
        ['Item list', 'Your whole inventory with prices and quantities.', async () => [`${meta.slug}-items`, [['Category', 'Item name', 'Price', 'Description', 'Stock', 'Taxable', 'Printer label', 'Revenue class'], ...menu.map((x) => [x.category, x.name, cash(x.price), x.desc, x.stock, x.taxable === false ? 'no' : 'yes', x.label, x.revclass])]]],
        ['Customers', 'Everyone who has ordered or been invoiced.', async () => { const r = await api('GET', `/api/sites/${id}/customers`); return [`${meta.slug}-customers`, [['Name', 'Company', 'Email', 'Phone', 'Orders', 'Total spent', 'Last order'], ...r.customers.map((c) => [c.name, c.company || '', c.email, c.phone, c.orders, cash(c.spent), iso(c.last)])]]; }],
        ['Invoices and estimates', 'Every invoice and estimate with its status.', async () => { const r = await api('GET', `/api/sites/${id}/invoices`); return [`${meta.slug}-invoices`, [['Number', 'Kind', 'Status', 'Customer', 'Email', 'Created', 'Due', 'Paid', 'Total'], ...r.invoices.map((v) => [v.label, v.kind, v.status, v.customer.name, v.customer.email, iso(v.createdAt), v.due, iso(v.paidAt), cash(v.total)])]]; }],
      ];
      return [h('div', { class: 'inv' }, h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Exports'), h('p', { class: 'muted' }, 'Download your records as spreadsheet files for your accountant or your own books.'))),
        h('div', { class: 'scard', style: 'padding:8px 24px' }, list.map(([label, hint2, fn]) => h('div', { class: 'rline', style: 'align-items:center;padding:14px 0' }, h('span', {}, h('b', { style: 'color:var(--ink);font-weight:500;display:block' }, label), hint2), h('button', { class: 'btn soft sm', onclick: () => grab(label, fn) }, ic('dl', 14), 'Download')))))];
    },

    /* Inventory lists kept with the ordering settings: modifier groups, menus, printer labels, revenue classes, discounts. */
    mods() {
      return listPage({ title: 'Modifier groups', hint: 'Modifier groups are used for add-ons, options or other customisations, such as sizes or toppings. Make one once and use it on as many items as you like.', add: 'Add modifier group', heads: ['Modifier group name', 'Choices', 'Used on'], rows: ordering.modGroups,
        cells: (g) => [h('b', {}, g.name), g.choices.map((c) => (c.price ? `${c.name} +${money(c.price)}` : c.name)).join(', '), `${menu.filter((x) => (x.mods || []).includes(g.id)).length} items`],
        empty: ['You do not have any modifier groups', 'Add one for sizes, toppings or sides, then tick the items it applies to.'], edit: editModGroup, remove: async (g) => { const ids = menu.filter((x) => (x.mods || []).includes(g.id)).map((x) => x.id); if (ids.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids, set: { removeMod: g.id } })).items; ordering.modGroups = ordering.modGroups.filter((x) => x.id !== g.id); } });
    },
    menus() {
      const when = (m2) => `${m2.days.every(Boolean) ? 'Every day' : DAYS.filter((_, i) => m2.days[i]).map((d) => d.slice(0, 3)).join(', ')}${m2.from && m2.to ? ` · ${m2.from} to ${m2.to}` : ' · all day'}`;
      return listPage({ title: 'Menus', hint: 'A menu is a set of categories shown at certain times, such as Breakfast or Lunch. Categories that are not in any menu are always shown.', add: 'Add menu', heads: ['Menu name', 'Categories', 'When', 'Status'], rows: ordering.menus,
        cells: (m2) => [h('b', {}, m2.name), m2.cats.join(', ') || 'None yet', when(m2), h('span', { class: `status ${m2.active ? 'ok' : ''}` }, m2.active ? 'Published' : 'Off')],
        empty: ['You do not have any menus', 'Without menus, your whole item list is shown all day.'], edit: editMenuSet, remove: (m2) => { ordering.menus = ordering.menus.filter((x) => x.id !== m2.id); } });
    },
    labels() { return namePage('labels', 'label', { title: 'Printer labels', hint: 'Printer labels sort items by where they are made, such as Kitchen or Bar. The kitchen screen can show one label at a time, so each station sees only its own items.', add: 'Add label', head: 'Label name', empty: ['You do not have any printer labels', 'Add labels like Kitchen, Bar or Bakery, then choose a label on each item.'] }); },
    revs() { return namePage('revClasses', 'revclass', { title: 'Revenue classes', hint: 'Revenue classes let you track and compare revenue streams, such as Food, Drinks and Merchandise. They appear in Reporting › Item sales.', add: 'Add revenue class', head: 'Revenue class name', empty: ['You do not have any revenue classes', 'Add classes like Food and Drinks, then choose one on each item.'] }); },
    discs() {
      return listPage({ title: 'Discounts', hint: 'Saved discounts you can apply with one tap when you write an invoice. For codes customers type at checkout, use Promotions › Promo codes.', add: 'Add discount', heads: ['Discount name', 'Discount value'], rows: ordering.discounts,
        cells: (x) => [h('b', {}, x.name), x.type === 'amount' ? `${money(x.value)} off` : `${x.value}% off`], empty: ['No discounts found', 'Add discounts such as Staff 20% or $5 off.'],
        edit: (x) => formSheet(x ? 'Edit discount' : 'Add discount', [['name', 'Discount name', { maxlength: 60 }], ['type', 'Type', { options: { percent: 'Percent off', amount: 'Dollars off' } }], ['value', 'Amount', { inputmode: 'decimal', hint: 'A percent such as 10, or dollars such as 5.00.' }]],
          x ? { name: x.name, type: x.type, value: x.type === 'amount' ? (x.value / 100).toFixed(2) : String(x.value) } : { name: '', type: 'percent', value: '10' },
          (v) => { if (!v.name.trim()) throw new Error('Give the discount a name.'); const value = v.type === 'amount' ? parsePrice(v.value || '0') : Math.round(Number(v.value)); if (value === null || !(value > 0)) throw new Error('Enter an amount above zero.'); const row = { id: x?.id || uid('d'), name: v.name.trim(), type: v.type, value }; ordering.discounts = x ? ordering.discounts.map((y) => (y.id === x.id ? row : y)) : [...ordering.discounts, row]; }),
        remove: (x) => { ordering.discounts = ordering.discounts.filter((y) => y.id !== x.id); } });
    },

    history() {
      if (!versions) {
        api('GET', `/api/sites/${id}/versions`).then((r) => { versions = r.versions; if (tab === 'history') paintPanel(); }).catch((e) => { toast(e.message, true); versions = []; if (tab === 'history') paintPanel(); });
        return [group('History', skel(4, 'row'))];
      }
      if (!versions.length) return [group('History', emptyState('clock', 'No versions yet', 'Each time you publish, a copy of your site is kept here so you can go back to it.'))];
      const stamp = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      return [group('History', h('p', { class: 'hint' }, 'Every published version of your site, newest first. Restoring one puts it back in the editor; nothing changes for visitors until you publish.'),
        h('div', { class: 'slist' }, versions.map((v, i) => h('div', { class: 'srow', style: 'padding:12px 12px 12px 16px;gap:10px' }, h('div', { class: 'grow' }, h('b', { style: 'font-weight:500;font-size:15px;display:block' }, stamp(v.createdAt)), h('span', { class: 'small muted' }, i === 0 && meta.live ? 'Live now' : 'Earlier version')),
          h('button', { class: 'btn soft sm', onclick: async () => {
            if (!await confirmSheet({ title: 'Restore this version?', text: `Your editor goes back to how the site looked on ${stamp(v.createdAt)}. You can undo this, and nothing is public until you publish.`, action: 'Restore' })) return;
            try { const r = await api('GET', `/api/sites/${id}/versions/${v.id}`); for (const k of Object.keys(draft)) delete draft[k]; Object.assign(draft, r.draft); sel = null; changed(); paintPanel(); toast('Version restored. Publish to make it live.'); } catch (e) { toast(e.message, true); }
          } }, 'Restore')))))];
    },

    team() {
      if (!team) {
        api('GET', `/api/sites/${id}/team`).then((r) => { team = r; if (tab === 'team') paintPanel(); }).catch((e) => { toast(e.message, true); team = { members: [], owner: { email: state.user.email, name: state.user.name } }; if (tab === 'team') paintPanel(); });
        return [group('', skel(3, 'row'))];
      }
      const ROLES = { kitchen: ['Kitchen', 'Sees and updates orders on the kitchen screen. Nothing else.'], manager: ['Manager', 'Everything except the team and deleting the site.'] };
      const nameIn = h('input', { placeholder: 'Name', 'aria-label': 'Name', maxlength: 80 });
      const emailIn = h('input', { type: 'email', placeholder: 'Email address', 'aria-label': 'Email address', required: true });
      const roleIn = h('select', { 'aria-label': 'Role' }, Object.entries(ROLES).map(([k, [l]]) => h('option', { value: k }, l)));
      const add = async (e) => {
        e.preventDefault();
        try {
          const r = await api('POST', `/api/sites/${id}/team`, { name: nameIn.value, email: emailIn.value, role: roleIn.value });
          team.members = r.members; paintPanel();
          if (!r.link) return toast('They can now sign in with their existing account');
          sheet((close) => [h('h2', {}, 'Login created'), h('p', { class: 'muted' }, r.emailed ? `We emailed ${emailIn.value} a link to choose a password. You can also pass this link on yourself. It works once and lasts 3 days.` : `Send this link to ${emailIn.value} so they can choose a password. It works once and lasts 3 days.`),
            h('div', { class: 'note', style: 'overflow-wrap:anywhere;color:var(--ink)' }, r.link),
            h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Done'), h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(r.link); toast('Link copied'); } catch { toast('Copy the link from the box above', true); } } }, 'Copy link'))]);
        } catch (ex) { toast(ex.message, true); }
      };
      const person = (name, email, right) => h('div', { class: 'srow', style: 'padding:12px 12px 12px 16px;gap:10px' }, h('span', { class: 'sico' }, ic('person', 16)), h('div', { class: 'grow', style: 'min-width:0' }, h('b', { style: 'font-weight:500;font-size:15px;display:block;overflow:hidden;text-overflow:ellipsis' }, name || email), name && h('span', { class: 'small muted', style: 'display:block;overflow:hidden;text-overflow:ellipsis' }, email)), right);
      return [
        group('People with access',
          h('div', { class: 'slist' }, person(team.owner.name, team.owner.email, h('span', { class: 'tag' }, 'Owner')),
            team.members.map((m) => person(m.name, m.email, [
              h('select', { 'aria-label': `Role for ${m.email}`, class: 'mini', onchange: async (e) => { try { team.members = (await api('POST', `/api/sites/${id}/team`, { email: m.email, role: e.target.value })).members; toast('Role updated'); } catch (ex) { toast(ex.message, true); } paintPanel(); } }, Object.entries(ROLES).map(([k, [l]]) => h('option', { value: k, selected: m.role === k }, l))),
              h('button', { class: 'icon-btn', 'aria-label': `Remove ${m.email}`, title: 'Remove', onclick: async () => { if (!await confirmSheet({ title: `Remove ${m.name || m.email}?`, text: 'They lose access to this site straight away.', action: 'Remove', danger: true })) return; try { team.members = (await api('DELETE', `/api/sites/${id}/team/${m.id}`)).members; } catch (ex) { toast(ex.message, true); } paintPanel(); } }, ic('trash', 16))])))),
        group('Add someone', h('form', { class: 'stack', onsubmit: add }, h('label', { class: 'field' }, nameIn), h('label', { class: 'field' }, emailIn), h('label', { class: 'field' }, h('span', {}, 'Role'), roleIn),
          h('div', { class: 'note stack', style: 'gap:6px' }, Object.values(ROLES).map(([l, d]) => h('div', {}, h('b', {}, `${l}. `), d))),
          h('button', { class: 'btn', style: 'justify-self:start' }, ic('plus', 16), 'Add to team'))),
      ];
    },
  };

  async function loadOrders(quiet) {
    try {
      const fresh = (await api('GET', `/api/sites/${id}/orders`)).orders;
      const had = orders ? new Set(orders.map((x) => x.id)) : null;
      const arrived = had ? fresh.filter((x) => !had.has(x.id)).length : 0;
      const changed = !orders || JSON.stringify(fresh) !== JSON.stringify(orders);
      if (changed) orders = fresh;
      if (arrived) { toast(arrived === 1 ? 'New order received' : `${arrived} new orders received`); announceOrders(fresh.filter((x) => !had.has(x.id)), meta.name); }
      if (changed && (tab === 'orders' || tab === 'start')) paintPanel(); else if (changed) paintPanel();
    } catch (e) { if (!quiet) toast(e.message, true); }
  }
  const poll = setInterval(() => { if (document.visibilityState !== 'visible') return; if (ordering.enabled) loadOrders(true); loadNotes(); }, 20000);
  const salesTick = setInterval(() => { if (SALES_TABS[tab] && stats && !stats.failed && stats.to === stats.today && document.visibilityState === 'visible') api('GET', `/api/sites/${id}/stats?${new URLSearchParams(salesRange === 'custom' ? { range: 'custom', from: salesFrom, to: salesTo } : { range: salesRange })}`).then((r) => { if (SALES_TABS[tab] && JSON.stringify(r) !== JSON.stringify(stats)) { stats = r; paintPanel(); } }).catch(() => {}); }, 30000);
  if (ordering.enabled) loadOrders(true);

  async function putOrdering() { await sendOrdering(ordering); }
  function editCategory(c, cats) {
    const cur = ordering.cats.find((x) => x.name === c) || { name: c, hidden: false, from: '', to: '' };
    const d = { ...cur, name: c };
    sheet((close) => {
      const field = (label, el, hint) => h('label', { class: 'field' }, h('span', {}, label), el, hint && h('small', {}, hint));
      const nameIn = h('input', { value: c, maxlength: 60 });
      const fromIn = h('input', { type: 'time', value: d.from }), toIn = h('input', { type: 'time', value: d.to });
      const hide = h('input', { type: 'checkbox', checked: d.hidden });
      const shift = async (by) => {
        const i = cats.indexOf(c), j = i + by; if (j < 0 || j >= cats.length) return;
        const order = [...cats]; [order[i], order[j]] = [order[j], order[i]];
        try { menu = (await api('PUT', `/api/sites/${id}/menu-order`, { ids: order.flatMap((n) => menu.filter((x) => x.category === n).map((x) => x.id)) })).items; close(); paintPanel(); paint(true); } catch (e) { toast(e.message, true); }
      };
      return [h('h2', {}, 'Edit category'),
        field('Name', nameIn),
        h('label', { class: 'switch' }, h('span', {}, h('b', { style: 'font-weight:500' }, 'Hide from customers'), h('div', { class: 'small muted' }, 'Keeps the items but takes the whole category off your site.')), hide, h('i')),
        h('div', { class: 'field' }, h('span', {}, 'Only available between'), h('div', { class: 'pair' }, fromIn, toIn), h('small', {}, 'For example breakfast from 06:00 to 11:00. Leave both empty for all day.')),
        h('div', { class: 'row' }, h('button', { class: 'btn soft sm', disabled: cats.indexOf(c) === 0, onclick: () => shift(-1) }, ic('up', 14), 'Move up'), h('button', { class: 'btn soft sm', disabled: cats.indexOf(c) === cats.length - 1, onclick: () => shift(1) }, ic('down', 14), 'Move down')),
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try {
            const name = nameIn.value.trim() || c;
            if (name !== c) { const r = await api('POST', `/api/sites/${id}/menu/category`, { from: c, to: name }); menu = r.items; for (const k of Object.keys(ordering)) if (!(k in r.ordering)) delete ordering[k]; Object.assign(ordering, r.ordering); orderingRev = r.orderingRev; }
            const both = fromIn.value && toIn.value;
            ordering.cats = [...ordering.cats.filter((x) => x.name !== name), { name, hidden: hide.checked, from: both ? fromIn.value : '', to: both ? toIn.value : '' }];
            await putOrdering();
            close(); paintPanel(); paint(true);
          } catch (ex) { toast(ex.message, true); e.currentTarget.disabled = false; }
        } }, 'Save'))];
    });
  }
  /* Matches photo file names to item names: "taco-al-pastor.jpg" goes on "Taco al pastor". */
  async function bulkPhotos() {
    const files = await pickFiles(true);
    if (!files.length) return;
    const norm = (t) => t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '');
    const left = new Set(menu.map((x) => x.id));
    const done = [], missed = [];
    toast(`Matching ${files.length} photo${files.length === 1 ? '' : 's'}…`);
    for (const f of files.slice(0, 200)) {
      const key = norm(f.name);
      const hit = menu.find((x) => left.has(x.id) && norm(x.name) === key) || menu.find((x) => left.has(x.id) && key.length > 3 && (norm(x.name).includes(key) || key.includes(norm(x.name))));
      if (!hit) { missed.push(f.name); continue; }
      try { hit.image = await uploadImage(f, ITEM_PHOTO); await api('PUT', `/api/sites/${id}/menu/${hit.id}`, hit); left.delete(hit.id); done.push(hit.name); } catch { missed.push(f.name); }
    }
    paintPanel(); paint(true);
    sheet((close) => [h('h2', {}, `${done.length} photo${done.length === 1 ? '' : 's'} added`), h('p', { class: 'muted' }, done.length ? 'Photos were matched to items by file name.' : 'None of the file names matched an item name.'),
      missed.length > 0 && h('div', { class: 'note' }, h('b', {}, `${missed.length} not matched. `), 'Name each file after its item, for example “taco-al-pastor.jpg”, or add it from the item itself.', h('div', { class: 'small', style: 'margin-top:6px;overflow-wrap:anywhere' }, missed.slice(0, 8).join(', '), missed.length > 8 && ` and ${missed.length - 8} more`)),
      h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: close }, 'Done'))]);
  }

  /* Everything about one item, in a window over the page. */
  function openItem(itemId) {
    const it = menu.find((x) => x.id === itemId);
    if (!it) return;
    const cats = [...new Set(menu.map((x) => x.category))];
    it.options = Array.isArray(it.options) ? it.options : [];
    const status = h('span', { class: 'status ok', 'aria-live': 'polite' }, 'Saved');
    const save = debounce(async () => {
      status.className = 'status'; status.textContent = 'Saving…';
      try { await api('PUT', `/api/sites/${id}/menu/${it.id}`, it); status.className = 'status ok'; status.textContent = 'Saved'; }
      catch (e) { status.className = 'status bad'; status.textContent = 'Not saved'; toast(e.message, true); }
    }, 400);
    let gone = false;
    sheet((close) => {
      notify = save;
      const priceIn = h('input', { value: (it.price / 100).toFixed(2), inputmode: 'decimal', oninput: () => { const c = parsePrice(priceIn.value); priceIn.style.borderColor = c === null ? 'var(--red)' : ''; if (c !== null) { it.price = c; save(); drawNow(); } } });
      const saleIn = h('input', { type: 'number', min: 0, max: 90, value: it.sale || '', placeholder: '0', oninput: () => { it.sale = Math.max(0, Math.min(90, Math.round(Number(saleIn.value)) || 0)); save(); drawNow(); } });
      const now = h('small', {});
      const drawNow = () => { now.textContent = it.sale > 0 ? `Customers pay ${money(itemPrice(it))} while the sale is on.` : 'Leave empty for no sale.'; };
      drawNow();
      const qtyIn = h('input', { type: 'number', min: 0, max: 999999, value: it.stock, 'aria-label': 'Quantity in stock', oninput: () => { it.stock = Math.max(0, Math.round(Number(qtyIn.value)) || 0); save(); } });
      const bump = (by) => () => { it.stock = Math.max(0, (it.stock || 0) + by); qtyIn.value = it.stock; save(); };
      const optBox = h('div', { class: 'stack' });
      const drawOpts = () => optBox.replaceChildren(...it.options.map((g, gi) => h('div', { class: 'item' }, h('div', { class: 'in', style: 'padding-top:12px' },
        h('div', { class: 'row' }, h('label', { class: 'field grow' }, h('input', { value: g.name, placeholder: 'e.g. Size', 'aria-label': 'Option name', oninput: (e) => { g.name = e.target.value; save(); } })), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove option', onclick: () => { it.options.splice(gi, 1); save(); drawOpts(); } }, ic('trash', 16))),
        wrap('Choices, one per line', h('textarea', { rows: 3, value: choicesText(g.choices), placeholder: 'Small\nLarge +1.50', oninput: (e) => { g.choices = parseChoices(e.target.value); save(); } })),
        h('div', { class: 'pair' }, h('label', { class: 'switch' }, h('span', {}, 'Must choose'), h('input', { type: 'checkbox', checked: g.required, onchange: (e) => { g.required = e.target.checked; save(); } }), h('i')),
          h('label', { class: 'switch' }, h('span', {}, 'Pick several'), h('input', { type: 'checkbox', checked: g.multi, onchange: (e) => { g.multi = e.target.checked; save(); } }), h('i')))))),
        h('button', { type: 'button', class: 'btn soft sm', style: 'justify-self:start', onclick: () => { it.options.push({ name: it.options.length ? 'Add-ons' : 'Size', required: !it.options.length, multi: !!it.options.length, choices: [] }); drawOpts(); } }, ic('plus', 14), it.options.length ? 'Add another option' : 'Add sizes or add-ons'));
      drawOpts();
      const listId = uid('dl');
      const out = [
        h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Edit item'), status, h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, ic('x', 20))),
        h('div', { class: 'isheet-top' },
          image('Photo', it, 'image', { crop: ITEM_PHOTO }),
          h('div', { class: 'stack' }, text('Name', it, 'name', { maxlength: 120, autofocus: true }),
            h('div', { class: 'pair' }, wrap('Price', priceIn), wrap('Sale, percent off', saleIn)), now,
            text('Category', it, 'category', { list: listId, maxlength: 60 }), h('datalist', { id: listId }, cats.map((c) => h('option', { value: c }))))),
        area('Description', it, 'desc', { rows: 2, maxlength: 500 }),
        h('div', { class: 'isheet-row' },
          h('div', { class: 'field' }, h('span', {}, 'In stock'), h('div', { class: 'inv-qty' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'One fewer', onclick: bump(-1) }, ic('minus', 16)), qtyIn, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'One more', onclick: bump(1) }, ic('plus', 16)))),
          toggle('Charge sales tax', it, 'taxable', (v) => v !== false), toggle('Available to order', it, 'available', (v) => v !== false)),
        wrap('Refill every morning to', h('input', { type: 'number', min: 0, max: 999999, value: it.restock ?? '', placeholder: 'Off', style: 'max-width:160px', oninput: (e) => { it.restock = e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value)) || 0); save(); } }), 'For things you make fresh each day. The quantity goes back to this number every morning. Leave empty to keep counting down.'),
        (ordering.labels.length > 0 || ordering.revClasses.length > 0) && h('div', { class: 'pair' },
          ordering.labels.length > 0 && wrap('Printer label', h('select', { onchange: (e) => { it.label = e.target.value; save(); } }, h('option', { value: '' }, 'None'), ordering.labels.map((l) => h('option', { value: l, selected: it.label === l }, l)))),
          ordering.revClasses.length > 0 && wrap('Revenue class', h('select', { onchange: (e) => { it.revclass = e.target.value; save(); } }, h('option', { value: '' }, 'None'), ordering.revClasses.map((l) => h('option', { value: l, selected: it.revclass === l }, l))))),
        ordering.modGroups.length > 0 && h('div', { class: 'field' }, h('span', {}, 'Modifier groups'), h('div', { class: 'checks' }, ordering.modGroups.map((g) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: (it.mods || []).includes(g.id), onchange: (e) => { it.mods = (it.mods || []).filter((x) => x !== g.id); if (e.target.checked) it.mods.push(g.id); save(); } }), h('span', {}, g.name, h('small', {}, ` ${g.choices.length} choice${g.choices.length === 1 ? '' : 's'}`))))), h('small', {}, 'Shared sets of choices, managed under Inventory › Modifier groups.')),
        h('div', { class: 'field' }, h('span', {}, 'Options'), optBox),
        h('div', { class: 'acts', style: 'justify-content:space-between' },
          h('button', { class: 'btn danger', onclick: async () => {
            if (!await confirmSheet({ title: `Delete ${it.name}?`, text: 'It is removed from your menu straight away. Past orders are kept.', action: 'Delete', danger: true })) return;
            try { menu = (await api('DELETE', `/api/sites/${id}/menu/${it.id}`)).items; gone = true; invSel.delete(it.id); close(); } catch (e) { toast(e.message, true); }
          } }, 'Delete item'),
          h('button', { class: 'btn', onclick: close }, 'Done'))];
      notify = null;
      return out;
    }, 'wide isheet', async () => { if (!gone) await save.flush(); paintPanel(); paint(true); });
  }
  const ask = ({ title, label, value = '', hint, action = 'Apply', type = 'text' }) => new Promise((done) => {
    let answered = false;
    sheet((close) => {
      const input = h('input', { value, type, autofocus: true });
      return [h('h2', {}, title), h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); answered = true; close(); done(input.value.trim()); } }, h('label', { class: 'field' }, h('span', {}, label), input, hint && h('small', {}, hint)),
        h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn' }, action)))];
    }, '', () => { if (!answered) done(null); });
  });

  function exportCsv(st) {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cash = (c) => (c / 100).toFixed(2);
    const rows = [['Order', 'Date', 'Time', 'Type', 'Customer', 'Status', 'Item sales', 'Discount', 'Promo code', 'Net sales', 'Sales tax', 'Delivery fee', 'Tip', 'Total'],
      ...st.orders.map((o) => [o.number, o.date, o.time, ORDER_METHODS[o.method]?.name || o.method, o.name, ORDER_STATUSES[o.status] || o.status, cash(o.subtotal), cash(o.discount), o.promo, cash(o.subtotal - o.discount), cash(o.tax), cash(o.fee), cash(o.tip), cash(o.total)]),
      [], ['Totals (cancelled orders left out)'], ['Orders', st.totals.orders], ['Item sales', cash(st.totals.gross)], ['Discounts', cash(st.totals.discounts)], ['Net sales', cash(st.totals.net)], ['Taxable sales', cash(st.totals.taxable)], ['Non-taxable sales', cash(st.totals.nontaxable)], ['Sales tax collected', cash(st.totals.tax)], ['Delivery fees', cash(st.totals.fees)], ['Tips', cash(st.totals.tips)], ['Total collected', cash(st.totals.total)],
      [], ['Item', 'Category', 'Sold', 'Sales'], ...st.items.map((i) => [i.name, i.category, i.qty, cash(i.sales)])];
    const url = URL.createObjectURL(new Blob([`﻿${rows.map((r) => r.map(q).join(',')).join('\r\n')}`], { type: 'text/csv' }));
    h('a', { href: url, download: `${meta.slug}-sales-${st.from}${st.from === st.to ? '' : `-to-${st.to}`}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function importCsv() {
    const [file] = await pickFiles(false, SHEET_TYPES);
    if (!file) return;
    let csv;
    try { csv = await readSheetFile(file); } catch (e) { return toast(e.message, true); }
    const p = parseMenuCsv(csv);
    sheet((close) => {
      const run = async (replace, btn) => {
        btn.disabled = true; btn.textContent = 'Building your menu…';
        try {
          const r = await api('POST', `/api/sites/${id}/menu/import`, { csv, replace, startStock: Math.max(0, Math.round(Number(qtyIn.value)) || 0) });
          menu = r.items; close(); toast(`${r.imported} item${r.imported === 1 ? '' : 's'} added to your menu`); editItem = null; paintPanel(); paint(true);
        } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = 'Try again'; }
      };
      const cats = new Set(p.items.map((x) => x.category)).size;
      const missing = p.items.filter((x) => x.stock == null).length;
      const qtyIn = h('input', { type: 'number', min: 0, max: 999999, value: DEFAULT_STOCK, style: 'max-width:120px' });
      return [h('h2', {}, p.items.length ? `${p.items.length} item${p.items.length === 1 ? '' : 's'} found` : 'We could not read that file'),
        h('p', { class: 'muted' }, p.items.length ? `From ${file.name}, in ${cats} categor${cats === 1 ? 'y' : 'ies'}. Check a few before we build your menu.` : p.errors[0]?.reason || 'No items were found.'),
        p.items.length > 0 && h('table', { class: 'ptable' }, h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', {}, 'Category'), h('th', {}, 'Price'))), h('tbody', {}, p.items.slice(0, 6).map((x) => h('tr', {}, h('td', {}, x.name), h('td', { class: 'muted' }, x.category), h('td', {}, money(x.price)))))),
        p.items.length > 6 && h('p', { class: 'small muted' }, `and ${p.items.length - 6} more`),
        p.items.length > 0 && p.errors.length > 0 && h('div', { class: 'note' }, h('b', {}, `${p.errors.length} row${p.errors.length === 1 ? '' : 's'} will be skipped. `), p.errors.slice(0, 3).map((e) => h('div', {}, `${e.row ? `Row ${e.row}: ` : ''}${e.reason}`))),
        missing > 0 && h('label', { class: 'field' }, h('span', {}, missing === p.items.length ? 'How many of each item do you have?' : `Starting quantity for the ${missing} item${missing === 1 ? '' : 's'} without one`), qtyIn, h('small', {}, 'Every item needs a quantity. You can change any of them afterwards, one at a time or all together.')),
        !p.items.length && h('p', { class: 'hint' }, 'Your file needs a column of item names and a column of prices. Download the template to see the layout.'),
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'),
          p.items.length > 0 && menu.length > 0 && h('button', { class: 'btn soft', onclick: (e) => run(false, e.currentTarget) }, 'Add to my menu'),
          p.items.length > 0 && h('button', { class: 'btn', onclick: (e) => run(menu.length > 0, e.currentTarget) }, menu.length ? 'Replace my menu' : 'Build my menu'))];
    });
  }

  /* ---------- payments recorded at the counter ---------- */
  const rq = () => new URLSearchParams(salesRange === 'custom' && salesFrom && salesTo ? { range: 'custom', from: salesFrom, to: salesTo } : { range: salesRange === 'custom' ? 'today' : salesRange });
  const rangeBar = () => h('div', { class: 'inv-bar' }, h('div', { class: 'inv-chips' }, [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['last30', 'Last 30 days']].map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': String((salesRange === 'custom' ? 'today' : salesRange) === k), onclick: () => { salesRange = k; paintPanel(); } }, l))));
  function csvFile(name, rows) {
    const q2 = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const url = URL.createObjectURL(new Blob([`\ufeff${rows.map((r) => r.map(q2).join(',')).join('\r\n')}`], { type: 'text/csv' }));
    h('a', { href: url, download: `${name}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const putOrder = (x, fresh) => { Object.assign(x, fresh); const live = (orders || []).find((o) => o.id === fresh.id); if (live && live !== x) Object.assign(live, fresh); };
  const TENDERS = ['Cash', 'Card', 'Online payment', 'Check', 'Gift card', 'Other'];
  function takePayment(x) {
    sheet((close) => [h('h2', {}, `Record payment for #${x.number}`), h('p', { class: 'muted' }, `${money(x.total)} from ${x.name}. This records how they paid; it does not charge a card.`),
      h('div', { class: 'tender-grid' }, TENDERS.map((m) => h('button', { class: 'btn soft', onclick: async () => { try { putOrder(x, (await api('POST', `/api/sites/${id}/orders/${x.id}/payment`, { method: m })).order); close(); toast(`#${x.number} paid by ${m.toLowerCase()}`); paintPanel(); } catch (e) { toast(e.message, true); } } }, m))),
      h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'))]);
  }
  function refundOrder(x) {
    sheet((close) => {
      const left = x.total - x.refunded;
      const amt = h('input', { value: (left / 100).toFixed(2), inputmode: 'decimal', autofocus: true }), noteIn = h('input', { placeholder: 'Reason (optional)', maxlength: 300 }), err = h('p', { class: 'error', role: 'alert' });
      return [h('h2', {}, `Refund order #${x.number}`), h('p', { class: 'muted' }, `Up to ${money(left)} can be refunded. This records the refund; give the money back the same way the customer paid (${x.paidMethod.toLowerCase()}).`),
        h('label', { class: 'field' }, h('span', {}, 'Amount'), amt), h('label', { class: 'field' }, h('span', {}, 'Note'), noteIn), err,
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn', onclick: async () => { const c = parsePrice(amt.value || ''); if (!c) { err.textContent = 'Enter an amount above zero.'; return; } try { putOrder(x, (await api('POST', `/api/sites/${id}/orders/${x.id}/payment`, { refund: c, note: noteIn.value })).order); close(); toast('Refund recorded'); paintPanel(); } catch (e) { err.textContent = e.message; } } }, 'Record refund'))];
    });
  }

  /* ---------- simple lists: a table, an Add button, and a pop-up to edit one row ---------- */
  const saveLists = async () => { await putOrdering(); paintPanel(); paint(true); };
  function listPage({ title, hint, add, heads, rows, cells, empty, edit, remove }) {
    return [h('div', { class: 'inv' },
      h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, title), h('p', { class: 'muted' }, hint)), h('button', { class: 'btn', onclick: () => edit(null) }, ic('plus', 16), add)),
      rows.length ? h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable bills' }, h('thead', {}, h('tr', {}, [...heads, 'Action'].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.map((r) => h('tr', { onclick: (e) => { if (!e.target.closest('button')) edit(r); } }, cells(r).map((c) => h('td', {}, c)),
          h('td', { style: 'white-space:nowrap' }, h('button', { class: 'btn soft sm', onclick: () => edit(r) }, 'Edit'), ' ', h('button', { class: 'btn text sm', style: 'color:var(--red)', onclick: async () => { if (!await confirmSheet({ title: `Delete ${r.name || r}?`, text: 'It is removed straight away.', action: 'Delete', danger: true })) return; try { await remove(r); await saveLists(); toast('Deleted'); } catch (e) { toast(e.message, true); } } }, 'Delete'))))))))
        : h('div', { class: 'inv-list' }, emptyState('cube', empty[0], empty[1], [add, () => edit(null)])))];
  }
  /* A pop-up form built from a list of fields. `apply` changes the data and may throw a message to show. */
  function formSheet(title, fields, values, apply, extra) {
    const v = { ...values };
    sheet((close) => {
      const err = h('p', { class: 'error', role: 'alert' });
      const control = ([k, label, a = {}]) => {
        const { options, hint, area: isArea, ...attrs } = a;
        const el = options ? h('select', { onchange: (e) => { v[k] = e.target.value; } }, Object.entries(options).map(([val, l]) => h('option', { value: val, selected: v[k] === val }, l)))
          : isArea ? h('textarea', { rows: 4, value: v[k], oninput: (e) => { v[k] = e.target.value; }, ...attrs })
            : attrs.type === 'checkbox' ? null : h('input', { value: v[k], oninput: (e) => { v[k] = e.target.value; }, ...attrs });
        if (attrs.type === 'checkbox') return h('label', { class: 'switch' }, h('span', {}, label), h('input', { type: 'checkbox', checked: !!v[k], onchange: (e) => { v[k] = e.target.checked; } }), h('i'));
        return h('label', { class: 'field' }, h('span', {}, label), el, hint && h('small', {}, hint));
      };
      return [h('h2', {}, title), h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); err.textContent = ''; try { await apply(v); await saveLists(); close(); toast('Saved'); } catch (ex) { err.textContent = ex.message; } } },
        fields.map(control), extra && extra(v), err,
        h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn' }, 'Save')))];
    }, 'wide');
  }
  const pickList = (label, all, chosen, hint) => h('div', { class: 'field' }, h('span', {}, label), all.length ? h('div', { class: 'checks' }, all.map(([val, text2]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: chosen.has(val), onchange: (e) => { e.target.checked ? chosen.add(val) : chosen.delete(val); } }), h('span', {}, text2)))) : h('small', {}, 'Nothing to choose from yet.'), hint && h('small', {}, hint));
  function editModGroup(g) {
    const on = new Set(menu.filter((x) => g && (x.mods || []).includes(g.id)).map((x) => x.id)); const before = new Set(on);
    formSheet(g ? 'Edit modifier group' : 'Add modifier group', [['name', 'Modifier group name', { maxlength: 60, placeholder: 'e.g. Size' }], ['choices', 'Choices, one per line', { area: true, placeholder: 'Small\nLarge +1.50', hint: 'Add a plus sign and a price for choices that cost extra.' }], ['required', 'Customer must choose', { type: 'checkbox' }], ['multi', 'Customer can pick several', { type: 'checkbox' }]],
      g ? { name: g.name, choices: choicesText(g.choices), required: g.required, multi: g.multi } : { name: '', choices: '', required: false, multi: false },
      async (v) => {
        const choices = parseChoices(v.choices);
        if (!v.name.trim()) throw new Error('Give the group a name.');
        if (!choices.length) throw new Error('Add at least one choice.');
        const row = { id: g?.id || uid('g'), name: v.name.trim(), required: !!v.required, multi: !!v.multi, choices };
        ordering.modGroups = g ? ordering.modGroups.map((y) => (y.id === g.id ? row : y)) : [...ordering.modGroups, row];
        const addTo = [...on].filter((x) => !before.has(x)), dropFrom = [...before].filter((x) => !on.has(x));
        if (addTo.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids: addTo, set: { addMod: row.id } })).items;
        if (dropFrom.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids: dropFrom, set: { removeMod: row.id } })).items;
      }, () => pickList('Use on these items', menu.map((x) => [x.id, `${x.name} · ${x.category}`]), on));
  }
  function editMenuSet(m2) {
    const cats = new Set(m2 ? m2.cats : []); const days = m2 ? [...m2.days] : DAYS.map(() => true);
    formSheet(m2 ? 'Edit menu' : 'Add menu', [['name', 'Menu name', { maxlength: 60, placeholder: 'e.g. Breakfast' }], ['from', 'Shown from', { type: 'time' }], ['to', 'Until', { type: 'time', hint: 'Leave both times empty to show it all day.' }], ['active', 'Published', { type: 'checkbox' }]],
      m2 ? { name: m2.name, from: m2.from, to: m2.to, active: m2.active } : { name: '', from: '', to: '', active: true },
      (v) => { if (!v.name.trim()) throw new Error('Give the menu a name.'); if (!cats.size) throw new Error('Choose at least one category for this menu.'); const row = { id: m2?.id || uid('m'), name: v.name.trim(), cats: [...cats], from: v.from && v.to ? v.from : '', to: v.from && v.to ? v.to : '', days, active: !!v.active }; ordering.menus = m2 ? ordering.menus.map((y) => (y.id === m2.id ? row : y)) : [...ordering.menus, row]; },
      () => [h('div', { class: 'field' }, h('span', {}, 'Days'), h('div', { class: 'daypick', role: 'group' }, DAYS.map((day, di) => h('button', { type: 'button', title: day, 'aria-pressed': String(days[di]), onclick: (e) => { days[di] = !days[di]; e.currentTarget.setAttribute('aria-pressed', String(days[di])); } }, day.slice(0, 2))))),
        pickList('Categories in this menu', [...new Set(menu.map((x) => x.category))].map((c) => [c, c]), cats)]);
  }
  /* Printer labels and revenue classes are plain names, each chosen on items. */
  function namePage(listKey, itemKey, { title, hint, add, head, empty }) {
    const count = (n) => menu.filter((x) => x[itemKey] === n).length;
    const edit = (old) => {
      const on = new Set(menu.filter((x) => old && x[itemKey] === old).map((x) => x.id)); const before = new Set(on);
      formSheet(old ? `Edit ${old}` : add, [['name', head, { maxlength: 40 }]], { name: old || '' }, async (v) => {
        const name = v.name.trim();
        if (!name) throw new Error('Enter a name.');
        if (name !== old && ordering[listKey].includes(name)) throw new Error('That name is already in use.');
        ordering[listKey] = old ? ordering[listKey].map((y) => (y === old ? name : y)) : [...ordering[listKey], name];
        const setTo = [...on], clear = [...before].filter((x) => !on.has(x));
        if (setTo.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids: setTo, set: { [itemKey]: name } })).items;
        if (clear.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids: clear, set: { [itemKey]: '' } })).items;
      }, () => pickList('Use on these items', menu.map((x) => [x.id, `${x.name}${x[itemKey] && x[itemKey] !== old ? ` (now ${x[itemKey]})` : ''}`]), on));
    };
    return listPage({ title, hint, add, heads: [head, 'Used on'], rows: ordering[listKey].map((n) => ({ name: n })), cells: (r) => [h('b', {}, r.name), `${count(r.name)} items`], empty, edit: (r) => edit(r ? r.name : null),
      remove: async (r) => { const ids = menu.filter((x) => x[itemKey] === r.name).map((x) => x.id); if (ids.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids, set: { [itemKey]: '' } })).items; ordering[listKey] = ordering[listKey].filter((y) => y !== r.name); } });
  }

  /* ---------- invoices ---------- */
  const setBills = (r) => { bills = { ...bills, ...Object.fromEntries(Object.entries(r).filter(([k]) => ['invoices', 'contacts'].includes(k))) }; customers = null; if (tab === 'invoices' || tab === 'est' || tab === 'customers') paintPanel(); };
  async function importCustomers() {
    const [file] = await pickFiles(false, SHEET_TYPES);
    if (!file) return;
    let rows;
    try { rows = parseCsv(await readSheetFile(file)); } catch (e) { return toast(e.message, true); }
    const heads = (rows.shift() || []).map((x) => String(x).toLowerCase().trim());
    const col = (...names) => heads.findIndex((x) => names.some((n) => x.includes(n)));
    const at = { first: col('first'), last: col('last'), name: heads.findIndex((x) => x === 'name' || x.includes('full name') || x.includes('customer')), company: col('company', 'business'), email: col('email', 'e-mail'), phone: col('phone', 'mobile', 'tel'), address: col('address', 'street') };
    const pick = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '');
    const people = rows.map((r) => ({ name: pick(r, at.name) || [pick(r, at.first), pick(r, at.last)].filter(Boolean).join(' '), company: pick(r, at.company), email: pick(r, at.email), phone: pick(r, at.phone), address: pick(r, at.address) })).filter((c) => c.name || c.company || c.email);
    for (const c of people) if (!c.name && !c.company) c.name = c.email;
    sheet((close) => [h('h2', {}, people.length ? `${people.length} customer${people.length === 1 ? '' : 's'} found` : 'We could not read that file'),
      h('p', { class: 'muted' }, people.length ? `From ${file.name}. People already on your list are updated, not duplicated.` : 'The file needs a heading row with columns such as Name, Email and Phone.'),
      people.length > 0 && h('table', { class: 'ptable' }, h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Email'), h('th', {}, 'Phone'))), h('tbody', {}, people.slice(0, 6).map((c) => h('tr', {}, h('td', {}, c.name || c.company), h('td', { class: 'muted' }, c.email), h('td', { class: 'muted' }, c.phone))))),
      people.length > 6 && h('p', { class: 'small muted' }, `and ${people.length - 6} more`),
      h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'), people.length > 0 && h('button', { class: 'btn', onclick: async (e) => { e.currentTarget.disabled = true; try { const r = await api('POST', `/api/sites/${id}/contacts/import`, { rows: people }); customers = null; bills = null; close(); toast(`${r.added} customer${r.added === 1 ? '' : 's'} imported${r.skipped ? `, ${r.skipped} skipped` : ''}`); paintPanel(); } catch (ex) { toast(ex.message, true); e.currentTarget.disabled = false; } } }, 'Import'))]);
  }
  function addCustomer() {
    const c = { name: '', company: '', email: '', phone: '', address: '' };
    sheet((close) => {
      const f = (label, k, a = {}) => h('label', { class: 'field' }, h('span', {}, label), h('input', { value: c[k], oninput: (e) => { c[k] = e.target.value; }, ...a }));
      return [h('h2', {}, 'Add a customer'), h('p', { class: 'muted' }, 'For catering, wholesale and other customers you bill by invoice.'),
        h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); try { await api('POST', `/api/sites/${id}/contacts`, c); customers = null; bills = null; close(); toast('Customer added'); paintPanel(); } catch (ex) { toast(ex.message, true); } } },
          h('div', { class: 'pair' }, f('Name', 'name', { autofocus: true, maxlength: 120 }), f('Company', 'company', { maxlength: 120, placeholder: 'Optional' })),
          h('div', { class: 'pair' }, f('Email', 'email', { type: 'email' }), f('Phone', 'phone', { type: 'tel' })), f('Billing address', 'address', { maxlength: 300, placeholder: 'Optional' }),
          h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn' }, 'Add customer')))];
    }, 'wide');
  }
  function markPaid(v) {
    sheet((close) => {
      const how = h('select', {}, ['Card', 'Online payment', 'Check', 'Cash', 'Bank transfer', 'Other'].map((m) => h('option', {}, m)));
      const noteIn = h('input', { placeholder: 'Check number or reference (optional)', maxlength: 300 });
      return [h('h2', {}, `Mark ${v.label} as paid?`), h('p', { class: 'muted' }, `${money(v.total)} from ${v.customer.company || v.customer.name}. The customer’s invoice page will show it as paid.`),
        h('label', { class: 'field' }, h('span', {}, 'How they paid'), how), h('label', { class: 'field' }, h('span', {}, 'Note'), noteIn),
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn', autofocus: true, onclick: async () => { try { setBills(await api('POST', `/api/sites/${id}/invoices/${v.id}/status`, { status: 'paid', method: how.value, note: noteIn.value })); close(); toast(`${v.label} marked as paid`); } catch (e) { toast(e.message, true); } } }, 'Mark as paid'))];
    });
  }
  async function convertEstimate(v) {
    if (!await confirmSheet({ title: `Convert ${v.label} to an invoice?`, text: 'It moves to Invoices as a draft, ready to send for payment.', action: 'Convert' })) return;
    try { setBills(await api('POST', `/api/sites/${id}/invoices/${v.id}/convert`)); toast('Converted. Find it under Invoices.'); goTab('invoices'); } catch (e) { toast(e.message, true); }
  }
  async function openInvoice(existing, person, kind = existing?.kind || 'invoice') {
    const est = kind === 'estimate';
    if (!bills) { try { bills = await api('GET', `/api/sites/${id}/invoices`); } catch (e) { return toast(e.message, true); } }
    if (!customers) { try { customers = (await api('GET', `/api/sites/${id}/customers`)).customers; } catch { customers = []; } }
    const v = existing ? JSON.parse(JSON.stringify(existing)) : { status: 'draft', customer: { name: person?.name || '', company: person?.company || '', email: person?.email || '', phone: person?.phone || '', address: person?.address || '' }, items: [{ name: '', qty: 1, price: 0, taxable: true }], project: person?.project || '', notes: '', due: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), taxRate: ordering.taxRate || 0, discount: 0, payUrl: '' };
    const locked = v.status === 'paid' || v.status === 'void';
    const copyLink = async (url) => { try { await navigator.clipboard.writeText(url); toast('Invoice link copied'); } catch { toast('Copy the link from the address bar after pressing View', true); } };
    sheet((close) => {
      const act = async (fn, done) => { try { const r = await fn(); setBills(r); close(); if (done) done(r); } catch (e) { toast(e.message, true); } };
      const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
      if (locked) {
        return [h('div', { class: 'row' }, h('h2', { class: 'grow' }, v.label), h('span', { class: `status ${v.status === 'paid' ? 'ok' : ''}` }, v.status === 'paid' ? 'Paid' : 'Cancelled'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, ic('x', 20))),
          h('p', { class: 'muted' }, `${v.customer.company || v.customer.name}${v.customer.email ? ` · ${v.customer.email}` : ''}`),
          h('div', { class: 'bill-lines ro' }, v.items.map((l) => h('div', { class: 'rline' }, h('span', {}, `${l.qty} × ${l.name}`), h('b', {}, money(l.price * l.qty)))), v.discount > 0 && h('div', { class: 'rline' }, h('span', {}, 'Discount'), h('b', {}, `−${money(v.discount)}`)), v.tax > 0 && h('div', { class: 'rline' }, h('span', {}, 'Tax'), h('b', {}, money(v.tax))), h('div', { class: 'rline total' }, h('span', {}, 'Total'), h('b', {}, money(v.total)))),
          v.status === 'paid' && h('div', { class: 'note' }, h('b', {}, `Paid ${fmtDate(v.paidAt)}`), v.paidMethod && ` by ${v.paidMethod.toLowerCase()}`, v.paidNote && ` · ${v.paidNote}`),
          h('div', { class: 'acts', style: 'justify-content:space-between;flex-wrap:wrap' },
            h('div', { class: 'row' }, v.status === 'paid' && h('button', { class: 'btn text sm', onclick: () => act(() => api('POST', `/api/sites/${id}/invoices/${v.id}/status`, { status: 'sent' })) }, 'Undo paid'), h('button', { class: 'btn danger sm', onclick: async () => { if (await confirmSheet({ title: `Delete ${v.label}?`, text: 'It is removed from your records and the customer’s link stops working.', action: 'Delete', danger: true })) act(() => api('DELETE', `/api/sites/${id}/invoices/${v.id}`)); } }, 'Delete')),
            h('div', { class: 'row' }, h('button', { class: 'btn soft', onclick: () => { close(); dup(v); } }, 'Duplicate'), h('a', { class: 'btn', href: v.url, target: '_blank', rel: 'noopener' }, 'View invoice', ic('out', 15))))];
      }
      const people = [...new Map([...bills.contacts, ...customers].filter((c) => c.name).map((c) => [`${c.name}|${c.email}`, c])).values()];
      const cust = v.customer;
      const ins = {};
      const cf = (label, k, a = {}) => { ins[k] = h('input', { value: cust[k], oninput: (e) => { cust[k] = e.target.value; if (k === 'name') { const hit = people.find((c) => c.name === e.target.value); if (hit) { for (const kk of ['company', 'email', 'phone', 'address']) if (hit[kk] && !cust[kk]) { cust[kk] = hit[kk]; ins[kk].value = hit[kk]; } } } }, ...a }); return h('label', { class: 'field' }, h('span', {}, label), ins[k]); };
      const pid = uid('dl'), mid = uid('dl');
      const linesBox = h('div', { class: 'bill-lines' });
      const totalsBox = h('div', { class: 'bill-sum' });
      const drawTotals = () => { const t = invoiceTotals(v.items.filter((l) => l.name.trim()), v.taxRate, v.discount); totalsBox.replaceChildren(...[h('div', { class: 'rline' }, h('span', {}, 'Subtotal'), h('b', {}, money(t.subtotal))), t.discount > 0 && h('div', { class: 'rline' }, h('span', {}, 'Discount'), h('b', {}, `−${money(t.discount)}`)), h('div', { class: 'rline' }, h('span', {}, `Tax${v.taxRate ? ` (${v.taxRate}%)` : ''}`), h('b', {}, money(t.tax))), h('div', { class: 'rline total' }, h('span', {}, 'Amount due'), h('b', {}, money(t.total)))].filter(Boolean)); };
      const drawLines = () => {
        linesBox.replaceChildren(h('div', { class: 'bill-head' }, h('span', {}, 'Description'), h('span', {}, 'Qty'), h('span', {}, 'Price each'), h('span', {}, 'Tax'), h('span', {})),
          ...v.items.map((l, i) => {
            const priceIn = h('input', { value: (l.price / 100).toFixed(2), inputmode: 'decimal', 'aria-label': 'Price each', oninput: () => { const c = parsePrice(priceIn.value || '0'); priceIn.classList.toggle('bad', c === null); if (c !== null) { l.price = c; drawTotals(); } } });
            return h('div', { class: 'bill-row' },
              h('input', { value: l.name, placeholder: 'What they ordered', 'aria-label': 'Description', list: mid, maxlength: 160, oninput: (e) => { l.name = e.target.value; const hit = menu.find((x) => x.name === l.name); if (hit) { l.price = itemPrice(hit); l.taxable = hit.taxable !== false; priceIn.value = (l.price / 100).toFixed(2); drawLines(); } drawTotals(); } }),
              h('input', { type: 'number', min: 1, max: 100000, value: l.qty, 'aria-label': 'Quantity', oninput: (e) => { l.qty = Math.max(1, Math.round(Number(e.target.value)) || 1); drawTotals(); } }),
              priceIn,
              h('label', { class: 'switch', title: 'Charge sales tax on this line' }, h('input', { type: 'checkbox', 'aria-label': 'Charge sales tax', checked: l.taxable !== false, onchange: (e) => { l.taxable = e.target.checked; drawTotals(); } }), h('i')),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove line', disabled: v.items.length === 1, onclick: () => { v.items.splice(i, 1); drawLines(); drawTotals(); } }, ic('x', 16)));
          }),
          h('button', { type: 'button', class: 'btn soft sm', style: 'justify-self:start', onclick: () => { v.items.push({ name: '', qty: 1, price: 0, taxable: true }); drawLines(); linesBox.querySelector('.bill-row:last-of-type input').focus(); } }, ic('plus', 14), 'Add a line'));
      };
      drawLines(); drawTotals();
      const discIn = h('input', { value: (v.discount / 100).toFixed(2), inputmode: 'decimal', oninput: () => { const c = parsePrice(discIn.value || '0'); if (c !== null) { v.discount = c; drawTotals(); } } });
      const body = () => ({ kind, project: v.project || '', customer: cust, items: v.items.filter((l) => l.name.trim()), notes: v.notes, due: v.due, taxRate: v.taxRate, discount: v.discount, payUrl: v.payUrl });
      const save = () => (v.id ? api('PUT', `/api/sites/${id}/invoices/${v.id}`, body()) : api('POST', `/api/sites/${id}/invoices`, body()));
      const send = async (btn) => {
        btn.disabled = true;
        try {
          const kept = await save(); v.id = kept.invoice.id; setBills(kept);
          const r = await api('POST', `/api/sites/${id}/invoices/${v.id}/send`);
          setBills(r); close();
          if (r.emailed) return toast(`${r.invoice.label} sent to ${r.invoice.customer.email}`);
          sheet((c2) => [h('h2', {}, `${r.invoice.label} is ready`), h('p', { class: 'muted' }, 'Email is not switched on yet, so we could not send it for you. Copy this link and send it to your customer yourself. Everything else works: they can view it, pay and print it.'), h('div', { class: 'note', style: 'overflow-wrap:anywhere;color:var(--ink)' }, r.invoice.url),
            h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: c2 }, 'Done'), h('button', { class: 'btn', onclick: () => copyLink(r.invoice.url) }, 'Copy link'))]);
        } catch (e) { toast(e.message, true); btn.disabled = false; }
      };
      const sent = v.status === 'sent';
      return [h('div', { class: 'row' }, h('h2', { class: 'grow' }, v.id ? v.label : est ? 'New estimate' : 'New invoice'), sent && !est && h('span', { class: `status ${invoiceLate(v) ? 'bad' : 'warn'}` }, invoiceLate(v) ? 'Past due' : 'Awaiting payment'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, ic('x', 20))),
        sent && h('p', { class: 'muted' }, `Sent ${fmtDate(v.sentAt)}${v.reminders ? ` · ${v.reminders} reminder${v.reminders === 1 ? '' : 's'}` : ''} · ${v.viewedAt ? `opened ${fmtDate(v.viewedAt)}` : 'not opened yet'}`),
        h('div', { class: 'bill-sec' }, h('h3', {}, 'Bill to'),
          h('div', { class: 'pair' }, cf('Name', 'name', { list: pid, maxlength: 120, autofocus: !v.id, placeholder: 'Start typing to find a customer' }), cf('Company', 'company', { maxlength: 120, placeholder: 'Optional' })),
          h('div', { class: 'pair' }, cf('Email', 'email', { type: 'email', placeholder: 'Where the invoice is sent' }), cf('Phone', 'phone', { type: 'tel' })), cf('Billing address', 'address', { maxlength: 300, placeholder: 'Optional' }),
          h('datalist', { id: pid }, people.map((c) => h('option', { value: c.name }, [c.company, c.email].filter(Boolean).join(' · ')))), h('datalist', { id: mid }, menu.map((x) => h('option', { value: x.name }, money(itemPrice(x)))))),
        h('div', { class: 'bill-sec' }, h('h3', {}, 'What they ordered'), h('p', { class: 'hint' }, 'Type anything, or start typing a menu item to fill in its price.'), linesBox),
        h('div', { class: 'bill-grid' },
          h('div', { class: 'stack' },
            h('div', { class: 'pair' }, h('label', { class: 'field' }, h('span', {}, 'Due date'), h('input', { type: 'date', value: v.due, onchange: (e) => { v.due = e.target.value; } })), h('label', { class: 'field' }, h('span', {}, 'Sales tax (%)'), h('input', { type: 'number', min: 0, max: 30, step: '0.001', value: v.taxRate, oninput: (e) => { v.taxRate = Number(e.target.value) || 0; drawTotals(); } }))),
            h('label', { class: 'field' }, h('span', {}, 'Discount ($)'), discIn, ordering.discounts.length > 0 && h('select', { 'aria-label': 'Use a saved discount', style: 'margin-top:8px', onchange: (e) => { const dd = ordering.discounts.find((x) => x.id === e.target.value); if (!dd) return; const sub = invoiceTotals(v.items.filter((l) => l.name.trim()), 0, 0).subtotal; v.discount = dd.type === 'amount' ? Math.min(sub, dd.value) : Math.round((sub * dd.value) / 100); discIn.value = (v.discount / 100).toFixed(2); drawTotals(); } }, h('option', { value: '' }, 'Use a saved discount…'), ordering.discounts.map((dd) => h('option', { value: dd.id }, `${dd.name} (${dd.type === 'amount' ? money(dd.value) : `${dd.value}%`})`)))),
            h('label', { class: 'field' }, h('span', {}, 'Project'), h('input', { value: v.project || '', maxlength: 80, placeholder: 'Optional, e.g. Smith wedding', list: 'pf-projects', oninput: (e) => { v.project = e.target.value; } }), h('datalist', { id: 'pf-projects' }, [...new Set(bills.invoices.map((x) => x.project).filter(Boolean))].map((x) => h('option', { value: x })))),
            h('label', { class: 'field' }, h('span', {}, 'Note to customer'), h('textarea', { rows: 2, maxlength: 2000, value: v.notes, placeholder: 'Delivery details, thanks, payment terms…', oninput: (e) => { v.notes = e.target.value; } })),
            h('label', { class: 'field' }, h('span', {}, 'Pay link'), h('input', { value: v.payUrl, placeholder: bills.payUrl || 'https://', oninput: (e) => { v.payUrl = e.target.value; } }), h('small', {}, bills.payUrl ? 'Leave empty to use your Processor Freedom payment link from Business info. The invoice shows a Pay now button that opens it.' : 'Paste your Processor Freedom payment link and the invoice shows a Pay now button. Add it once under Website → Business info to use it on every invoice.'))),
          totalsBox),
        h('div', { class: 'acts', style: 'justify-content:space-between;flex-wrap:wrap' },
          h('div', { class: 'row' }, v.id && h('button', { class: 'btn danger sm', onclick: async () => { if (await confirmSheet(sent ? { title: `Cancel ${v.label}?`, text: 'It stays in your records as cancelled, and the customer’s page shows it is no longer due.', action: 'Cancel invoice', danger: true } : { title: `Delete ${v.label}?`, text: 'This draft is removed for good.', action: 'Delete', danger: true })) act(() => (sent ? api('POST', `/api/sites/${id}/invoices/${v.id}/status`, { status: 'void' }) : api('DELETE', `/api/sites/${id}/invoices/${v.id}`))); } }, sent ? 'Cancel invoice' : 'Delete'),
            sent && h('button', { class: 'btn text sm', onclick: () => copyLink(v.url) }, 'Copy link'), sent && h('a', { class: 'btn text sm', href: v.url, target: '_blank', rel: 'noopener' }, 'View')),
          h('div', { class: 'row' }, h('button', { class: 'btn soft', onclick: () => act(save, () => toast('Invoice saved')) }, sent ? 'Save changes' : 'Save draft'),
            sent && !est && h('button', { class: 'btn soft', onclick: () => { close(); markPaid(v); } }, 'Mark paid'),
            est && v.id && h('button', { class: 'btn soft', onclick: () => { close(); convertEstimate(v); } }, 'Convert to invoice'),
            h('button', { class: 'btn', onclick: (e) => send(e.currentTarget) }, ic('mail', 16), sent ? (est ? 'Send again' : 'Send reminder') : est ? 'Send estimate' : 'Send invoice')))];
    }, 'wide bill');
  }
  const dup = (v) => openInvoice({ ...v, id: undefined, label: undefined, status: 'draft', url: undefined, sentAt: null, viewedAt: null, paidAt: null, reminders: 0, due: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) });

  /* Reads a photo or PDF of a paper menu, then lets the merchant check the list before anything is saved. */
  async function scanMenu() {
    const [file] = await pickFiles(false, 'image/jpeg,image/png,image/webp,application/pdf');
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) return toast('That file is too large. Try one under 12 MB.', true);
    let found = null, failed = '';
    const closeBusy = sheet(() => [h('div', { class: 'scanning' }, h('i', { class: 'spinner' })), h('h2', {}, 'Reading your menu…'), h('p', { class: 'muted' }, 'This usually takes under a minute. Keep this page open.')], 'live');
    try { const r = await api('POST', `/api/sites/${id}/menu/scan`, file); found = r.items; failed = r.reason; } catch (e) { failed = e.message; }
    closeBusy();
    if (!found || !found.length) return sheet((close) => [h('h2', {}, 'We could not read that menu'), h('p', { class: 'muted' }, failed || 'No items were found. Try a sharper, well-lit photo taken straight on, or upload one page at a time.'), h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Close'), h('button', { class: 'btn', onclick: () => { close(); scanMenu(); } }, 'Try another file'))]);
    const rows = found.map((x) => ({ ...x }));
    sheet((close) => {
      const qtyIn = h('input', { type: 'number', min: 0, max: 999999, value: DEFAULT_STOCK, style: 'max-width:120px' });
      const list = h('div', { class: 'scanlist' });
      const title = h('h2', {});
      const draw = () => {
        title.textContent = `${rows.length} item${rows.length === 1 ? '' : 's'} found`;
        list.replaceChildren(...rows.map((x, i) => h('div', { class: 'scanrow' },
          h('input', { value: x.name, 'aria-label': 'Item name', maxlength: 120, oninput: (e) => { x.name = e.target.value; } }),
          h('input', { value: x.category, 'aria-label': 'Category', maxlength: 60, oninput: (e) => { x.category = e.target.value; } }),
          h('input', { value: (x.price / 100).toFixed(2), inputmode: 'decimal', 'aria-label': 'Price', oninput: (e) => { const c = parsePrice(e.target.value || '0'); e.target.classList.toggle('bad', c === null); if (c !== null) x.price = c; } }),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove ${x.name}`, onclick: () => { rows.splice(i, 1); draw(); } }, ic('x', 16)))));
      };
      draw();
      const run = async (replace, btn) => {
        const good = rows.filter((x) => x.name.trim());
        if (!good.length) return toast('There is nothing to add.', true);
        btn.disabled = true; btn.textContent = 'Building your menu…';
        try {
          const r = await api('POST', `/api/sites/${id}/menu/import`, { items: good, replace, startStock: Math.max(0, Math.round(Number(qtyIn.value)) || 0) });
          menu = r.items; close(); toast(`${r.imported} item${r.imported === 1 ? '' : 's'} added to your menu`); paintPanel(); paint(true);
        } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = 'Try again'; }
      };
      return [title, h('p', { class: 'muted' }, `Read from ${file.name}. Check the names and prices, fix anything that looks off, and remove what you do not sell.`),
        h('div', { class: 'scanhead' }, h('span', {}, 'Item'), h('span', {}, 'Category'), h('span', {}, 'Price'), h('span', {})), list,
        h('label', { class: 'field' }, h('span', {}, 'How many of each item do you have?'), qtyIn, h('small', {}, 'Every item needs a quantity. You can change any of them afterwards.')),
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'),
          menu.length > 0 && h('button', { class: 'btn soft', onclick: (e) => run(false, e.currentTarget) }, 'Add to my menu'),
          h('button', { class: 'btn', onclick: (e) => run(menu.length > 0, e.currentTarget) }, menu.length ? 'Replace my menu' : 'Build my menu'))];
    }, 'wide');
  }

  /* Quick find: one box that jumps to any screen, setting, item or order. */
  const SETTINGS = [['Logo', 'design'], ['Brand colour', 'design'], ['Page background', 'design'], ['Typeface and corners', 'design'], ['Header', 'design'], ['Footer', 'design'], ['Announcement bar', 'design'], ['Site language', 'design'], ['Quick style', 'design'],
    ['Phone, address and email', 'business'], ['Social profiles', 'business'], ['Online payment link', 'business'],
    ['Pickup, curbside and delivery', 'ordering'], ['Delivery fee and zones', 'ordering'], ['Sales tax rate', 'ordering'], ['Tips', 'ordering'], ['Opening hours for orders', 'hours'], ['Order ahead and scheduling', 'hours'], ['Kitchen capacity', 'hours'], ['Happy hour and timed prices', 'deals'], ['Promo codes', 'promos'], ['Loyalty rewards', 'rewards'], ['Low stock alerts', 'alerts'], ['Daily summary email', 'alerts'], ['Order emails', 'alerts'], ['Pause ordering', 'ordering'],
    ['Notifications on this device', 'orders'], ['Kitchen screen', 'orders'], ['Sales tax collected', 'r-taxes'], ['Best sellers', 'r-items'], ['Export sales', 'sales'], ['Export customers', 'customers'], ['Send an invoice', 'invoices'], ['Catering and bulk orders', 'invoices'], ['Unpaid invoices', 'invoices'],
    ['Free web address', 'domain'], ['Connect my own domain', 'domain'], ['Privacy policy and terms', 'policies'], ['Google search description', 'seo'], ['Sharing image', 'seo'], ['Earlier versions', 'history'], ['Staff logins', 'team'], ['Daily refill', 'items'], ['Upload item list', 'menu'], ['Categories', 'menu']];
  let finding = false;
  function quickFind() {
    if (finding) return;
    finding = true;
    sheet((close) => {
      const input = h('input', { type: 'search', placeholder: 'Find a screen, setting, item or order', 'aria-label': 'Quick find', autofocus: true, autocomplete: 'off', spellcheck: 'false' });
      const list = h('div', { class: 'qf-list', role: 'listbox' });
      let hits = [], at = 0;
      const run = (fn) => { close(); fn(); };
      const search = () => {
        const q2 = input.value.trim().toLowerCase();
        const has = (t) => !q2 || String(t).toLowerCase().includes(q2);
        const out = [];
        for (const [k, label, icon] of tabs) if (has(label)) out.push({ icon, label, kind: 'Screen', go: () => goTab(k) });
        if (q2) {
          for (const [label, k] of SETTINGS) if (has(label) && tabs.some(([t]) => t === k)) out.push({ icon: tabs.find(([t]) => t === k)[2], label, kind: tabs.find(([t]) => t === k)[1], go: () => goTab(k) });
          for (const it of menu) if (has(`${it.name} ${it.category}`)) out.push({ icon: 'tag', label: it.name, kind: `Item · ${money(itemPrice(it))}`, go: () => { goTab('items'); openItem(it.id); } });
          for (const o of orders || []) if (has(`#${o.number} ${o.name} ${o.email} ${o.phone}`)) out.push({ icon: 'bag', label: `Order #${o.number} · ${o.name}`, kind: `${ORDER_STATUSES[o.status] || o.status} · ${money(o.total)}`, go: () => { orderFilter = 'all'; goTab('orders'); } });
        }
        hits = out.slice(0, 40); at = 0; draw();
      };
      const draw = () => {
        list.replaceChildren(...(hits.length ? hits.map((x, i) => h('button', { type: 'button', role: 'option', class: 'qf-row', 'aria-selected': String(i === at), onclick: () => run(x.go), onmousemove: () => { if (at !== i) { at = i; mark(); } } }, h('span', { class: 'sico' }, ic(x.icon, 16)), h('b', {}, x.label), h('span', { class: 'small muted' }, x.kind)))
          : [h('p', { class: 'muted', style: 'padding:22px;text-align:center' }, 'Nothing matches. Try a different word.')]));
      };
      const mark = () => [...list.children].forEach((el, i) => { el.setAttribute?.('aria-selected', String(i === at)); if (i === at) el.scrollIntoView?.({ block: 'nearest' }); });
      input.addEventListener('input', search);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (hits.length) { at = (at + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length; mark(); } }
        if (e.key === 'Enter' && hits[at]) { e.preventDefault(); run(hits[at].go); }
      });
      search();
      return [h('label', { class: 'qf-in' }, ic('search', 18), input, h('kbd', {}, 'esc')), list];
    }, 'qf', () => { finding = false; });
  }

  /* A short tour the first time someone opens the editor. */
  function tour() {
    const steps = [
      [() => top.querySelector('.mode-seg'), 'Two sides, kept apart', 'Back office is where you run the business: orders, menu, sales and settings. Website is where you change how your site looks.', 'below'],
      [() => rail, 'Everything is in this list', 'Each line says what it is for. Start at Home and work down.', 'right'],
      [() => top.querySelector('.qf-btn'), 'Find anything fast', 'Search for any setting, item or order. On a keyboard, press Ctrl or ⌘ and K.', 'below'],
      [() => top.lastElementChild, 'Publish when you are ready', 'Nothing is public until you publish. After that, menu and stock changes go live on their own.', 'below'],
    ];
    let i = 0;
    const ring = h('div', { class: 'coach-ring' });
    const card = h('div', { class: 'coach', role: 'dialog', 'aria-live': 'polite' });
    const layer = h('div', { class: 'coach-layer' }, ring, card);
    const end = () => { layer.remove(); window.removeEventListener('resize', place); try { localStorage.setItem('pf-tour', '1'); } catch { /* fine */ } };
    function place() {
      const [get, title2, text2, side] = steps[i];
      const el = get();
      if (!el || !el.offsetParent) { if (++i >= steps.length) return end(); return place(); }
      const r = el.getBoundingClientRect(), pad = 6;
      Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      card.replaceChildren(h('span', { class: 'small muted' }, `${i + 1} of ${steps.length}`), h('b', {}, title2), h('p', {}, text2),
        h('div', { class: 'row', style: 'justify-content:space-between;margin-top:6px' }, h('button', { class: 'btn text sm', onclick: end }, 'Skip'), h('button', { class: 'btn sm', onclick: () => { if (++i >= steps.length) end(); else place(); } }, i === steps.length - 1 ? 'Done' : 'Next')));
      const w = 300, gap = 16;
      let x = side === 'right' ? r.right + gap : side === 'left' ? r.left + 28 : r.left + r.width / 2 - w / 2;
      let y = side === 'below' ? r.bottom + gap : r.top + 28;
      x = Math.max(12, Math.min(innerWidth - w - 12, x)); y = Math.max(12, Math.min(innerHeight - 200, y));
      Object.assign(card.style, { left: `${x}px`, top: `${y}px`, width: `${w}px` });
      card.querySelector('.btn:not(.text)').focus();
    }
    document.body.append(layer);
    window.addEventListener('resize', place);
    place();
  }

  // Invoices change without the merchant doing anything (a customer opens one), so the list is refreshed on each visit.
  const refreshBills = () => { if (bills) api('GET', `/api/sites/${id}/invoices`).then((r) => { if (JSON.stringify(r) !== JSON.stringify(bills)) { bills = r; if ((tab === 'invoices' || tab === 'est') && !document.querySelector('.scrim')) paintPanel(); } }).catch(() => {}); };
  // What each screen loads, so a visit can refresh it quietly instead of clearing the page and drawing it again.
  const FEEDS = {
    start: [() => 'stats?range=today', (v) => { dash = v; }, () => (dash && dash.totals ? dash : null)],
    tx: [() => `transactions?${rq()}`, (v) => { txData = v; }, () => txData], cash: [() => `cash?${rq()}`, (v) => { cashData = v; }, () => cashData],
    close: [() => 'closeouts', (v) => { closeData = v; }, () => closeData], insights: [() => 'stats?range=last7', (v) => { insightData = v; }, () => insightData],
    appts: [() => 'appointments', (v) => { apptData = v; }, () => apptData], calendar: [() => 'appointments', (v) => { apptData = v; }, () => apptData],
    schedule: [() => 'shifts', (v) => { shiftData = v; }, () => shiftData], timesheets: [() => 'timeclock', (v) => { clockData = v; }, () => clockData],
    plans: [() => 'plans', (v) => { planData = v; }, () => planData], gift: [() => 'gift-cards', (v) => { giftData = v; }, () => giftData], devices: [() => 'devices', (v) => { deviceData = v; }, () => deviceData],
  };
  // Fetches a screen's data again and swaps it in. The page only redraws if something actually changed.
  async function reload(k, quiet) {
    const f = FEEDS[k]; if (!f) return;
    try { const fresh = await api('GET', `/api/sites/${id}/${f[0]()}`); const same = JSON.stringify(fresh) === JSON.stringify(f[2]()); f[1](fresh); if (quiet && !same && tab === k && !document.querySelector('.scrim')) paintPanel(); }
    catch (e) { if (!quiet) toast(e.message, true); }
  }
  const goTab = (k, fromHistory = false) => { if (!known(k)) k = 'start'; if (!fromHistory && location.pathname !== pathFor(k)) window.history.pushState(null, '', pathFor(k)); if (k === 'invoices' || k === 'est' || k === 'projects') refreshBills(); if (FEEDS[k] && FEEDS[k][2]()) reload(k, true); if (tab === 'items' && k !== 'items') paint(true); tab = k; sel = null; editItem = null; panel.scrollTop = 0; paintPanel(); };
  function startPanel() {
    const b = draft.business;
    const steps = [
      [menu.length > 0, 'Add your menu', menu.length ? `${menu.length} item${menu.length === 1 ? '' : 's'} on your menu.` : 'Upload an Excel or CSV file of item names and prices and we build the menu for you.', menu.length ? ['Edit menu', () => goTab('menu')] : ['Upload item list', importCsv], !menu.length && (state.config.scanEnabled ? ['Scan a paper menu', scanMenu] : ['Add items by hand', () => goTab('menu')])],
      [!!draft.brand.logo, 'Add your logo and colour', 'Make the site look like your business.', ['Open look and feel', () => goTab('design')]],
      [!!(str(b.phone).trim() && str(b.address1).trim()), 'Add your business details', 'Phone, address and opening hours, so customers can find you.', ['Open business info', () => goTab('business')]],
      [ordering.enabled && openMethods(ordering).length > 0, 'Choose how customers order', ordering.enabled ? `${openMethods(ordering).map((m) => ORDER_METHODS[m].name).join(', ')} ${openMethods(ordering).length === 1 ? 'is' : 'are'} on. Add curbside, delivery, tax and tips here.` : 'Online ordering is off.', ['Open ordering', () => goTab('ordering')]],
      [meta.live && !meta.dirty, meta.live ? 'Published' : 'Publish your site', meta.live ? (meta.dirty ? 'You have changes that are not live yet.' : `Live at ${meta.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}`) : 'Nothing is public until you publish. You can keep editing afterwards.', meta.live && !meta.dirty ? ['View live site', () => window.open(meta.url, '_blank', 'noopener')] : [meta.live ? 'Publish changes' : 'Publish', (e) => publish(e)]],
    ];
    steps.push([!!(orders && orders.length), 'Place a test order', meta.live ? 'Order from your own site to see exactly what customers see, then watch it arrive under Orders.' : 'Once you publish, order from your own site to see the whole flow.', ['Open my order page', () => (meta.live ? window.open(`${meta.url.replace(/\/$/, '')}/order`, '_blank', 'noopener') : toast('Publish your site first.', true))]]);
    const done = steps.filter(([ok]) => ok).length;
    const next = steps.findIndex(([ok]) => !ok);
    // Today's numbers, fetched each time the dashboard is opened.
    if (!dash) { dash = { loading: true }; api('GET', `/api/sites/${id}/stats?range=today`).then((r) => { dash = r; if (tab === 'start') paintPanel(); }).catch(() => { dash = { failed: true }; }); }
    const t = dash.totals;
    const kpi = (label, value, sub, icon) => h('div', { class: 'kpi big' }, h('span', { class: 'kico' }, ic(icon, 18)), h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
    const waiting = (orders || []).filter((x) => !['completed', 'cancelled'].includes(x.status));
    const low = menu.filter((x) => x.available !== false && x.stock <= (ordering.lowStockAt ?? 5));
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const setup = done < steps.length && h('div', { class: 'scard setup' },
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:baseline' }, h('h3', {}, 'Finish setting up'), h('span', { class: 'small muted' }, `${done} of ${steps.length} done`)),
      h('div', { class: 'prog', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': steps.length, 'aria-valuenow': done }, h('i', { style: `width:${(done / steps.length) * 100}%` })),
      h('div', { class: 'todo' }, steps.map(([ok, name, text, main, alt], i) => !ok && h('div', { class: `todo-row ${i === next ? 'next' : ''}` },
        h('span', { class: 'tick' }, String(i + 1)),
        h('div', { class: 'grow' }, h('b', {}, name), h('p', {}, text),
          h('div', { class: 'row', style: 'flex-wrap:wrap;margin-top:10px' }, h('button', { class: `btn sm ${i === next ? '' : 'soft'}`, onclick: main[1] }, main[0]), alt && h('button', { class: 'btn text sm', onclick: alt[1] }, alt[0])))))));
    return [h('div', { class: 'inv dashb' },
      h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Dashboard'), h('p', { class: 'muted' }, today)),
        h('div', { class: 'row', style: 'flex-wrap:wrap' }, meta.live && h('a', { class: 'btn soft', href: `${meta.url.replace(/\/$/, '')}/order`, target: '_blank', rel: 'noopener' }, 'Open my order page', ic('out', 15)), h('button', { class: 'btn soft', onclick: async () => { loadOrders(true); await reload('start'); paintPanel(); toast('Up to date'); } }, 'Refresh'))),
      setup,
      h('div', { class: 'inv-kpis' }, ...(t ? [kpi('Net sales today', money(t.net), `${t.orders} order${t.orders === 1 ? '' : 's'}`, 'cash'), kpi('Orders waiting', waiting.length, waiting.length ? 'need your attention' : 'all caught up', 'bag'), kpi('Average order', money(t.average), 'including tax and tips', 'chart'), kpi('Running low', low.length, low.length ? 'items to restock' : 'stock looks good', 'cube')] : dash.failed ? [kpi('Net sales today', '—', 'could not load', 'cash')] : skel(4, 'kpi'))),
      h('div', { class: 'sgrid2x' },
        h('div', { class: 'scard' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, 'Orders waiting'), h('button', { class: 'btn text sm', onclick: () => goTab('orders') }, 'View all orders')),
          waiting.length ? waiting.slice(0, 5).map((x) => h('div', { class: 'rline click', onclick: () => goTab('orders') }, h('span', {}, h('b', { style: 'color:var(--ink)' }, `#${x.number} · ${x.name}`), h('div', { class: 'small' }, `${ORDER_METHODS[x.method]?.name || x.method} · ${x.status === 'ready' ? readyLabel(x.method) : ORDER_STATUSES[x.status]}`)), h('b', {}, money(x.total))))
            : h('p', { class: 'muted', style: 'padding:14px 0' }, ordering.enabled ? 'No orders waiting. New ones appear here on their own.' : 'Online ordering is off. Turn it on under Setup.')),
        h('div', { class: 'scard' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, 'Top sellers today'), h('button', { class: 'btn text sm', onclick: () => goTab('r-items') }, 'Item sales')),
          t && dash.items.length ? dash.items.slice(0, 5).map((it) => h('div', { class: 'rline' }, h('span', { style: 'color:var(--ink)' }, it.name), h('b', {}, `${it.qty} sold · ${money(it.sales)}`)))
            : h('p', { class: 'muted', style: 'padding:14px 0' }, 'Nothing sold yet today.')),
        h('div', { class: 'scard' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, 'Running low'), h('button', { class: 'btn text sm', onclick: () => goTab('items') }, 'Manage items')),
          low.length ? low.slice(0, 5).map((it) => h('div', { class: 'rline click', onclick: () => openItem(it.id) }, h('span', { style: 'color:var(--ink)' }, it.name), h('b', {}, it.stock === 0 ? 'Sold out' : `${it.stock} left`)))
            : h('p', { class: 'muted', style: 'padding:14px 0' }, menu.length ? 'Nothing is running low.' : 'Add your menu to start tracking stock.')),
        h('div', { class: 'scard' }, h('h3', {}, 'Shortcuts'),
          h('div', { class: 'shortcuts' }, [['Add an item', 'tag', () => goTab('items')], ['Send an invoice', 'doc', () => openInvoice()], ['Kitchen screen', 'bell', () => go(`/app/site/${id}/kitchen`)], ['Edit my website', 'brush', () => goTab(lastTab.site)]].map(([l, icon, fn]) => h('button', { class: 'btn soft', onclick: fn }, ic(icon, 16), l))))))];
  }

  function addSection() {
    sheet((close) => [h('h2', {}, 'Add a section'),
      h('div', { class: 'slist' }, Object.entries(SECTION_TYPES).map(([type, t]) => h('div', { class: 'srow' }, h('button', { class: 't', onclick: () => {
        const s = { id: uid(type.slice(0, 2)), type, enabled: true, nav: '', data: SECTION_DEFAULTS[type]() };
        const at = draft.sections.findIndex((x) => x.type === 'contact');
        draft.sections.splice(at < 0 || type === 'contact' ? draft.sections.length : at, 0, s);
        sel = s.id; close(); changed(); paintPanel(); setTimeout(() => scrollPreview(s.id), 80);
      } }, h('b', {}, t.name), h('span', {}, t.blurb)), ic('plus', 16), h('span', { style: 'width:8px' })))),
      h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'))]);
  }

  /* ---------- chrome ---------- */

  const tabsEl = h('div', { class: 'phead' });
  const railPub = h('div', { class: 'rail-pub' });
  const subnav = h('div', { class: 'seg subnav', role: 'group', 'aria-label': 'In this section', hidden: true });
  const lastIn = {};
  const rail = h('nav', { class: 'rail', 'aria-label': 'Site settings' });
  const panel = h('div', { class: 'panel' });
  const top = h('header', { class: 'ed-top' });
  const body = h('div', { class: 'ed-body', 'data-view': 'edit', 'data-mode': '' }, rail, h('aside', { class: 'ed-side' }, tabsEl, subnav, panel), stage);

  const openNav = new Set(); let navFor = null;
  function paintPanel() {
    const y = panel.scrollTop;
    const cur = tabs.find(([k]) => k === tab) || tabs[0];
    const fresh = orders ? orders.filter((x) => x.status === 'new').length : 0;
    const mode = cur[3];
    lastTab[mode] = cur[0];
    if (body.dataset.mode !== mode) { body.dataset.mode = mode; if (mode === 'office') body.dataset.view = 'edit'; paintTop(); requestAnimationFrame(fit); }
    panel.classList.toggle('narrow', mode === 'office' && !WIDE.has(cur[0]));
    const has = (k) => tabs.some(([t]) => t === k);
    const groups = NAV[mode].map((g) => ({ ...g, tabs: g.tabs.filter(has), subs: (g.subs || []).filter((_, i) => has(g.tabs[i])) })).filter((g) => g.tabs.length);
    const group = groups.find((g) => g.tabs.includes(cur[0])) || { label: cur[1], icon: cur[2], tabs: [cur[0]], subs: [cur[1]] };   // Settings and Profile are reached from the top right, not the sidebar
    const pick = (g) => goTab(g.tabs.includes(lastIn[g.label]) ? lastIn[g.label] : g.tabs[0]);
    // A section with several pages only opens or closes when pressed; choosing a page underneath is what takes you there.
    if (navFor !== cur[0]) { navFor = cur[0]; openNav.add(group.label); }
    rail.replaceChildren(...[mode === 'site' && h('button', { class: 'nav-row nav-back', onclick: () => goTab(lastTab.office) }, navIcon('back', 23), h('b', {}, 'Back office')), mode === 'office' ? h('button', { class: 'rail-new', onclick: () => openInvoice() }, ic('plus', 16), 'New invoice') : h('button', { class: 'rail-new', onclick: async () => { const w = window.open('', '_blank'); await flush(); if (w) w.location = `/preview/${id}/`; } }, ic('eye', 16), 'Preview site'), ...groups.flatMap((g) => {
      const many = g.tabs.length > 1, open = many ? openNav.has(g.label) : g === group;
      const kids = many && h('div', { class: 'nav-kids', 'data-shut': open ? null : '1' }, h('div', { class: 'nav-kids-in' }, g.tabs.map((k, i) => h('button', { 'aria-current': k === cur[0] ? 'page' : null, onclick: () => goTab(k) }, g.subs[i]))));
      const toggle = (btn) => { const now = !openNav.has(g.label); if (now) openNav.add(g.label); else openNav.delete(g.label); btn.setAttribute('aria-expanded', String(now)); if (now) btn.dataset.open = '1'; else delete btn.dataset.open; if (now) delete kids.dataset.shut; else kids.dataset.shut = '1'; };
      return [
        h('button', { class: 'nav-row', 'aria-current': open && !many ? 'page' : null, 'aria-expanded': many ? String(open) : null, 'data-open': open ? '1' : null, 'data-here': many && g === group ? '1' : null, onclick: (e) => (many ? toggle(e.currentTarget) : pick(g)) }, navIcon(g.icon, 23), h('b', {}, g.label), g.tabs.includes('orders') && fresh > 0 && h('em', { class: 'badge' }, fresh), many && h('span', { class: 'nav-chev' }, navIcon('chev', 14))),
        kids,
      ];
    }).filter(Boolean),
      mode === 'office' && h('hr'),
      mode === 'office' && h('button', { class: 'nav-row nav-swap', onclick: () => goTab(lastTab.site) }, navIcon('address', 23), h('b', {}, 'Website')),
      mode === 'office' && h('button', { class: 'nav-row', onclick: () => go(`/app/site/${id}/kitchen`) }, navIcon('orders', 23), h('b', {}, 'Kitchen screen')),
      h('span', { class: 'grow' }),
      mode === 'site' && railPub,
      h('small', { class: 'rail-foot' }, h('b', {}, meta.name), h('br'), `© ${new Date().getFullYear()} Processor Freedom`)].filter(Boolean));
    lastIn[group.label] = cur[0];
    // Phones have no sidebar, so a section's screens are switched with two clear buttons at the top.
    subnav.replaceChildren(...(group.tabs.length > 1 ? group.tabs.map((k, i) => h('button', { type: 'button', 'aria-pressed': String(k === cur[0]), onclick: () => goTab(k) }, group.subs[i])) : []));
    subnav.hidden = group.tabs.length < 2;
    tabsEl.replaceChildren(h('b', {}, cur[1]));
    body.dataset.wide = String(mode === 'office');
    panel.replaceChildren(...[crumbs(), HEAD[cur[0]] && h('div', { class: 'inv-top page-head' }, h('div', {}, h('h2', {}, HEAD[cur[0]][0]), h('p', { class: 'muted' }, HEAD[cur[0]][1]))), cur[0] === 'start' ? startPanel() : cur[0] === 'est' ? PANELS.invoices('estimate') : cur[0] === 'bizinfo' ? PANELS.business() : cur[0] === 'calendar' ? PANELS.appts(true) : SALES_TABS[cur[0]] ? PANELS.sales(SALES_TABS[cur[0]]) : SETUP_VIEWS[cur[0]] ? PANELS.ordering(cur[0]) : PANELS[cur[0]]()].flat(Infinity).filter(Boolean));
    panel.dataset.tab = cur[0];
    labelTables(panel);
    panel.scrollTop = y;
    const title2 = top.querySelector('.m-title b');
    if (title2 && title2.textContent !== group.label && body.dataset.view !== 'preview') paintTop(); else paintTabbar();
  }
  /* ---------- phone navigation ---------- */
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main screens' });
  function paintTabbar() {
    const mode = modeOf(tab);
    const fresh = orders ? orders.filter((x) => x.status === 'new').length : 0;
    const previewing = mode === 'site' && body.dataset.view === 'preview';
    const has = (k) => tabs.some(([t]) => t === k);
    const groups = NAV[mode].map((g) => ({ ...g, tabs: g.tabs.filter(has) })).filter((g) => g.tabs.length);
    const primary = groups.slice(0, PHONE_COUNT[mode]);
    const item = (icon, label, on, fn, badge) => h('button', { type: 'button', 'aria-current': on ? 'page' : null, onclick: fn }, h('span', { class: 'tb-ic' }, navIcon(icon, 24), badge > 0 && h('em', { class: 'badge' }, badge)), h('span', {}, label));
    tabbar.replaceChildren(...[
      ...primary.map((g) => item(g.icon, g.short || g.label, g.tabs.includes(tab) && !previewing, () => { body.dataset.view = 'edit'; goTab(g.tabs.includes(lastIn[g.label]) ? lastIn[g.label] : g.tabs[0]); paintTop(); }, g.tabs.includes('orders') ? fresh : 0)),
      mode === 'site' && item('preview', 'Preview', previewing, () => { body.dataset.view = previewing ? 'edit' : 'preview'; paintTop(); requestAnimationFrame(fit); }),
      item('more', 'More', !previewing && !primary.some((g) => g.tabs.includes(tab)), moreSheet, mode === 'site' ? fresh : 0)].filter(Boolean));
  }
  function moreSheet() {
    sheet((close) => {
      const fresh = orders ? orders.filter((x) => x.status === 'new').length : 0;
      const row = (icon, label, fn, extra) => h('button', { type: 'button', class: 'more-row', onclick: () => { close(); fn(); } }, NAV_NAMES.has(icon) ? navIcon(icon, 21) : h('span', { class: 'nav-ic' }, ic(icon, 20)), h('b', {}, label), extra, navIcon('chev', 14));
      const has = (k) => tabs.some(([t]) => t === k);
      const group = (mode) => h('div', { class: 'more-group' }, h('h3', {}, mode === 'office' ? 'Run your business' : 'Edit your website'), h('div', { class: 'more-list' }, NAV[mode].filter((g) => g.tabs.some(has)).flatMap((g) => (g.tabs.filter(has).length > 1 ? g.tabs.filter(has).map((k) => row(g.icon, g.subs[g.tabs.indexOf(k)] === g.label ? g.label : `${g.label}: ${g.subs[g.tabs.indexOf(k)]}`, () => { body.dataset.view = 'edit'; goTab(k); paintTop(); }, [k === tab && h('span', { class: 'tag' }, 'Open')]))
        : [row(g.icon, g.label, () => { body.dataset.view = 'edit'; goTab(g.tabs.filter(has)[0]); paintTop(); }, [g.tabs.includes(tab) && h('span', { class: 'tag' }, 'Open'), g.label === 'Orders' && fresh > 0 && h('em', { class: 'badge' }, fresh)])]))));
      return [h('div', { class: 'row' }, h('h2', { class: 'grow' }, meta.name), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, ic('x', 20))),
        group(modeOf(tab)), group(modeOf(tab) === 'office' ? 'site' : 'office'),
        h('div', { class: 'more-group' }, h('h3', {}, 'More'), h('div', { class: 'more-list' },
          meta.live && row('out', 'View my live site', () => window.open(meta.url, '_blank', 'noopener')),
          row('bell', 'Kitchen screen', () => go(`/app/site/${id}/kitchen`)),
          canOfferInstall() && row('phone', 'Install the app on this device', installApp),
          row('back', 'All my sites', async () => { await flush(); go('/app'); })))];
    }, 'more');
  }

  function setPage(p) { page = p; paint(true); paintTop(); if (body.dataset.view === 'edit' && matchMedia('(max-width:900px)').matches) body.dataset.view = 'preview'; }
  function scrollPreview(secId) {
    if (page !== 'home') return setPage('home');
    const el = frame.contentDocument?.querySelector(`[data-sec="${secId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.remove('pf-flash'); void el.offsetWidth; el.classList.add('pf-flash');
  }
  // Each device is drawn at its true size and scaled to fit, centred, like a simulator.
  const DEVICES = { phone: [390, 844, 14], tablet: [820, 1180, 16] };
  function fit() {
    // On a phone or small tablet the preview simply fills the screen: the device is the frame.
    const small = matchMedia('(max-width:900px)').matches;
    stageIn.className = `stage-in ${small || device === 'desktop' ? (small ? 'bare' : '') : device}`;
    const pad = small ? 0 : device === 'desktop' ? 18 : 28;
    const W = stage.clientWidth - pad * 2, H = stage.clientHeight - pad * 2;
    if (W <= 0 || H <= 0) return;
    let w, h2, k, bezel = 0;
    if (small) { w = W; h2 = H; k = 1; }
    else if (DEVICES[device]) { [w, h2, bezel] = DEVICES[device]; k = Math.min(1, W / (w + bezel * 2), H / (h2 + bezel * 2)); }
    else { w = Math.max(W, 1240); k = W / w; h2 = H / k; }
    const fw = w + bezel * 2, fh = h2 + bezel * 2;
    Object.assign(stageIn.style, { width: `${fw}px`, height: `${fh}px`, transform: `scale(${k})` });
    Object.assign(holder.style, { width: `${fw * k}px`, height: `${fh * k}px` });
  }
  const stageWatch = new ResizeObserver(fit);
  stageWatch.observe(stage);
  function setDevice(d) { device = d; fit(); paintTop(); }

  /* ---------- top right: notifications, settings, profile ---------- */
  const TI = {
    bell: '<path d="M6.500 10a5.500 5.500 0 0111 0c0 4 1.500 5.500 2 6.500H4.500c.500-1 2-2.500 2-6.500z"/><path d="M10 19.500a2.200 2.200 0 004 0"/>',
    gear: '<circle cx="12" cy="12" r="2.800"/><path d="M12 3.200l1.300 2.300 2.600-.500.900 2.500 2.500.900-.500 2.600 2.300 1.300-2.300 1.300.500 2.600-2.500.900-.900 2.500-2.600-.500L12 20.800l-1.300-2.300-2.600.500-.900-2.500-2.500-.900.500-2.600L3.200 12l2.300-1.300-.500-2.600 2.500-.900.900-2.500 2.600.500z"/>',
    x: '<path d="M6.500 6.500l11 11M17.500 6.500l-11 11"/>',
    user: '<circle cx="12" cy="12" r="8.700"/><circle cx="12" cy="10" r="2.800"/><path d="M6.700 18.300a6 6 0 0110.600 0"/>',
  };
  const tIcon = (k, n = 21) => h('i', { class: 'tb-ic', 'aria-hidden': 'true', html: svg(TI[k], n) });
  const roleName = { owner: 'Owner', manager: 'Manager', kitchen: 'Kitchen' }[loaded.role] || 'Owner';
  const seenKey = `pf-seen-${id}`;
  let notes = null, popEl = null;
  const lastSeen = () => { try { return Number(localStorage.getItem(seenKey)) || 0; } catch { return 0; } };
  const unread = () => !!notes && notes.some((x) => x.at > lastSeen());
  async function loadNotes() { try { notes = (await api('GET', `/api/sites/${id}/notifications`)).notifications; const dot = document.querySelector('.tb-dot'); if (dot) dot.hidden = !unread(); } catch { /* shown as empty */ } }
  // A small panel that hangs from one of the top-right buttons and closes when you click away.
  function popover(anchor, build) {
    if (popEl) { const same = popEl._for === anchor; popEl._close(); if (same) return; }
    const el = h('div', { class: 'tb-pop', role: 'dialog' }); el._for = anchor;
    const close = () => { el.remove(); popEl = null; document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); anchor.setAttribute('aria-expanded', 'false'); };
    const away = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    el._close = close; el.append(...[build(close)].flat(Infinity).filter(Boolean));
    document.body.append(el); popEl = el; anchor.setAttribute('aria-expanded', 'true');
    const r = anchor.getBoundingClientRect(); el.style.top = `${Math.round(r.bottom + 10)}px`; el.style.right = `${Math.max(12, Math.round(window.innerWidth - r.right))}px`;
    setTimeout(() => { document.addEventListener('mousedown', away); document.addEventListener('keydown', esc); });
  }
  const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`; };
  function openNotes(btn) {
    popover(btn, (close) => {
      const list = h('div', { class: 'tb-notes' }, skel(3));
      const draw = () => list.replaceChildren(...(notes && notes.length ? notes.map((x) => h('button', { class: `tb-note${x.at > seenAt || (x.open && !x.at) ? ' new' : ''}`, type: 'button', onclick: () => { close(); goTab(x.tab); } }, h('span', { class: `tb-kind ${x.kind}` }), h('span', {}, h('b', {}, x.title), h('small', {}, x.text)), h('em', {}, x.at ? ago(x.at) : 'Now'))) : [h('p', { class: 'tb-empty' }, 'Nothing new. Orders, messages and booking requests show up here.')]));
      const seenAt = lastSeen();
      loadNotes().then(() => { draw(); try { localStorage.setItem(seenKey, String(Date.now())); } catch { /* private mode */ } const dot = document.querySelector('.tb-dot'); if (dot) dot.hidden = true; });
      return [h('div', { class: 'tb-pop-h' }, h('b', {}, 'Notifications'), h('button', { class: 'btn text sm', type: 'button', onclick: () => { close(); goTab('alerts'); } }, 'Alert settings')), list];
    });
  }
  function openProfileMenu(btn) {
    popover(btn, (close) => [
      h('button', { class: 'tb-who', type: 'button', onclick: () => { close(); goTab('profile'); } }, tIcon('user', 22), h('span', {}, h('b', {}, state.user.name || state.user.email), h('small', {}, roleName))),
      h('button', { class: 'tb-item', type: 'button', onclick: () => { close(); goTab('profile'); } }, 'Profile and sign-in'),
      h('button', { class: 'tb-item', type: 'button', onclick: async () => { close(); await flush(); go('/app'); } }, 'All my sites'),
      h('button', { class: 'tb-item', type: 'button', onclick: async () => { close(); await flush(); await api('POST', '/api/auth/logout'); state.user = null; go('/'); } }, 'Log out'),
    ]);
  }
  // The settings drawer: the handful of settings people open most, and a way to all of them.
  function openSettings() {
    sheet((close) => {
      const row = (t, d, k) => h('button', { class: 'set-row', type: 'button', onclick: () => { close(); goTab(k); } }, h('b', {}, t), h('small', {}, d));
      return [h('div', { class: 'drawer-h' }, h('h2', {}, tIcon('gear', 22), 'Settings'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, tIcon('x', 18))),
        h('p', { class: 'drawer-k' }, 'Frequently used'),
        row('Business information', 'Your business name, address, phone number and logo.', 'bizinfo'),
        row('Business hours', 'When you are open, and when online orders are taken.', 'hours'),
        row('Online ordering', 'Pickup, curbside and delivery, tax, tips and order limits.', 'ordering'),
        row('Online booking', 'What customers can book, how long it takes and how many at once.', 'booking'),
        row('Alerts and emails', 'How you hear about new orders and what customers are sent.', 'alerts'),
        row('Profile and sign-in', 'Your name, email, password and two-step sign-in.', 'profile'),
        h('div', { class: 'drawer-f' }, h('button', { class: 'btn', type: 'button', onclick: () => { close(); goTab('settings'); } }, 'View all settings'))];
    }, 'drawer');
  }
  const topRight = () => {
    const bell = h('button', { class: 'icon-btn tb-btn', type: 'button', title: 'Notifications', 'aria-label': 'Notifications', 'aria-haspopup': 'dialog', onclick: () => openNotes(bell) }, tIcon('bell'), h('span', { class: 'tb-dot', hidden: !unread() }));
    const gear = h('button', { class: 'icon-btn tb-btn', type: 'button', title: 'Settings', 'aria-label': 'Settings', onclick: openSettings }, tIcon('gear'));
    const me = h('button', { class: 'icon-btn tb-btn', type: 'button', title: 'Profile', 'aria-label': 'Profile', 'aria-haspopup': 'dialog', onclick: () => openProfileMenu(me) }, tIcon('user'));
    return h('div', { class: 'tb-right' }, bell, gear, me);
  };
  loadNotes();

  /* Where am I: Dashboard › Sales activity › Orders. Each step is a link back up. */
  function crumbs() {
    if (tab === 'start' || modeOf(tab) === 'site') return null;
    const mode = modeOf(tab), g = NAV[mode].find((x) => x.tabs.includes(tab));
    const step = (label, to) => (to ? h('a', { href: pathFor(to), onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); goTab(to); } }, label) : h('span', {}, label));
    const page = g && g.subs ? g.subs[g.tabs.indexOf(tab)] : (tabs.find(([k]) => k === tab) || [])[1];
    const steps = [step('Dashboard', 'start'), mode === 'site' && step('Website', NAV.site[0].tabs[0] === tab ? '' : NAV.site[0].tabs[0]), g && g.tabs.length > 1 && step(g.label, g.tabs[0] === tab ? '' : g.tabs[0]), step(page || (g && g.label) || '', '')].filter(Boolean);
    const last = steps[steps.length - 1]; steps[steps.length - 1] = h('b', { 'aria-current': 'page' }, last.textContent);
    return h('nav', { class: 'crumbs', 'aria-label': 'You are here' }, steps.flatMap((x, i) => (i ? [h('i', { 'aria-hidden': 'true' }, '›'), x] : [x])));
  }

  function paintTop() {
    const label = { saved: 'Saved', dirty: 'Saving…', saving: 'Saving…', error: 'Not saved' }[saveState];
    const pubButton = () => (!meta.live ? h('button', { class: 'btn', onclick: publish }, 'Publish')
      : meta.dirty ? h('button', { class: 'btn', onclick: publish }, 'Publish changes')
        : h('button', { class: 'btn soft pub-btn', onclick: () => liveSheet(false) }, ic('check', 15), h('span', {}, 'Published')));
    const pub = h('span', { class: 'pub-top' }, pubButton());
    // On a computer, publishing lives at the bottom of the website sidebar.
    railPub.replaceChildren(h('small', {}, !meta.live ? 'Not public yet' : meta.dirty ? 'You have changes that are not live' : 'Your site is live and up to date'), pubButton());
    top.dataset.mode = modeOf(tab); top.dataset.view = body.dataset.view;
    paintTabbar();
    top.replaceChildren(...[
      h('button', { class: 'icon-btn', title: modeOf(tab) === 'site' ? 'Back to back office' : 'All my sites', 'aria-label': modeOf(tab) === 'site' ? 'Back to back office' : 'All my sites', onclick: async () => { if (modeOf(tab) === 'site') return goTab(lastTab.office); await flush(); go('/app'); } }, ic('back')),
      h('a', { class: 'tb-brand', href: pathFor('start'), title: 'Dashboard', onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); goTab('start'); } }, h('img', { class: 'tb-logo', src: '/assets/logo.svg', alt: 'PF Sites', width: 42, height: 42 })),
      h('span', { class: 'm-title' }, h('small', {}, meta.name), h('b', {}, body.dataset.view === 'preview' && modeOf(tab) === 'site' ? 'Preview' : (Object.values(NAV).flat().find((g) => g.tabs.includes(tab)) || { label: '' }).label)),
      h('div', { class: 'seg mode-seg', role: 'group', 'aria-label': 'Which side to work on' }, Object.entries(MODES).map(([k, l]) => h('button', { 'aria-pressed': String(modeOf(tab) === k), title: k === 'office' ? 'Orders, menu, sales and settings' : 'How your website looks', onclick: () => { if (modeOf(tab) !== k) goTab(lastTab[k]); } }, ic(k === 'office' ? 'store' : 'brush', 15), h('span', {}, l)))),
      modeOf(tab) === 'site' && [h('button', { class: 'icon-btn', title: 'Undo', 'aria-label': 'Undo', disabled: at === 0 && JSON.stringify(draft) === history[0], onclick: () => travel(-1) }, ic('undo')), h('button', { class: 'icon-btn redo-btn', title: 'Redo', 'aria-label': 'Redo', disabled: at >= history.length - 1, onclick: () => travel(1) }, ic('redo')), h('span', { class: `status ${saveState === 'error' ? 'bad' : saveState === 'saved' ? 'ok' : ''}`, 'aria-live': 'polite' }, label)],
      modeOf(tab) === 'site' && h('div', { class: 'seg dev-seg', role: 'group', 'aria-label': 'Preview size' }, [['desktop', 'Desktop'], ['tablet', 'Tablet'], ['phone', 'Phone']].map(([k, l]) => h('button', { 'aria-pressed': String(device === k), onclick: () => setDevice(k) }, l))),
      h('span', { class: 'grow' }),
      modeOf(tab) === 'office' && meta.live && h('a', { class: 'btn soft view-site', href: meta.url, target: '_blank', rel: 'noopener' }, h('span', {}, 'View site'), ic('out', 15)),
      modeOf(tab) === 'office' && topRight(),
      modeOf(tab) === 'site' && h('div', { class: 'mid' },
        h('select', { 'aria-label': 'Page', onchange: (e) => setPage(e.target.value) }, [['home', 'Home'], ...(ordering.enabled ? [['order', 'Order online']] : []), ...Object.entries(LEGAL_PAGES).filter(([k]) => draft.legal[k]?.enabled !== false)].map(([k, l]) => h('option', { value: k, selected: page === k }, l))),
        h('div', { class: 'seg mob-toggle', role: 'group', 'aria-label': 'View' }, [['edit', 'Edit'], ['preview', 'Preview']].map(([k, l]) => h('button', { 'aria-pressed': String(body.dataset.view === k), onclick: () => { body.dataset.view = k; paintTop(); requestAnimationFrame(fit); } }, l)))),
      modeOf(tab) === 'site' && h('button', { class: 'btn soft open-draft', title: 'Open your draft in a new tab', onclick: async () => { const w = window.open('', '_blank'); await flush(); if (w) w.location = `/preview/${id}/`; } }, ic('eye', 16), h('span', { class: 'dev-seg' }, 'Preview')),
      pub].flat(Infinity).filter(Boolean));
  }

  /* ---------- publishing ---------- */

  async function doPublish(btn) {
    btn.disabled = true; btn.textContent = 'Publishing…';
    try {
      const r = await api('POST', `/api/sites/${id}/publish`, { draft: JSON.parse(JSON.stringify(draft)) });
      meta = { ...meta, ...r.site }; draftRev = r.site.draftRev; saveState = 'saved'; versions = null; paintTop(); if (tab === 'start' || tab === 'history') paintPanel();
      return true;
    } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = 'Publish'; return false; }
  }
  function publish(e) {
    if (meta.live) return doPublish(e.currentTarget).then((ok) => ok && liveSheet(true));
    sheet((close) => {
      const agree = h('input', { type: 'checkbox', onchange: () => { btn.disabled = !agree.checked; } });
      const btn = h('button', { class: 'btn', disabled: true, onclick: async () => { if (await doPublish(btn)) { close(); liveSheet(true); } } }, 'Publish');
      const missing = [!draft.business.email && !draft.business.phone && 'contact details', !draft.business.address1 && 'address'].filter(Boolean);
      return [h('h2', {}, 'Ready to go live?'), h('p', { class: 'muted' }, 'Your site will be published at'), h('div', { class: 'note', style: 'font-weight:600;color:var(--ink);overflow-wrap:anywhere' }, meta.url.replace(/^https?:\/\//, '').replace(/\/$/, '')),
        missing.length > 0 && h('p', { class: 'hint' }, `Tip: you have not added your ${missing.join(' or ')} yet. You can publish now and add them later in the Business tab.`),
        h('label', { class: 'row', style: 'align-items:flex-start;font-size:14px;cursor:pointer' }, agree, h('span', {}, 'I confirm I have the right to publish this content, and I agree to the Processor Freedom Sites terms of service and acceptable use policy.')),
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Not yet'), btn)];
    });
  }
  function liveSheet(fresh) {
    sheet((close) => {
      const qr = h('div', { class: 'qr hide' });
      const dl = h('button', { class: 'btn text sm hide' }, 'Download QR code');
      qrCanvas(meta.url).then((c) => { qr.append(c); qr.classList.remove('hide'); dl.classList.remove('hide'); dl.onclick = () => { h('a', { href: c.toDataURL('image/png'), download: `${meta.slug}-qr.png` }).click(); }; }).catch(() => {});
      const share = encodeURIComponent(meta.url);
      return [h('div', { class: 'tick' }, ic('check', 28)), h('h2', {}, fresh ? 'You’re live.' : 'Your site is live.'), h('p', { class: 'muted' }, fresh ? 'Your website is published and ready to share.' : `Last published ${fmtDate(meta.publishedAt)}.`),
        h('div', { class: 'urlbox' }, meta.url.replace(/^https?:\/\//, '').replace(/\/$/, '')),
        h('div', { class: 'row', style: 'flex-wrap:wrap;justify-content:center' },
          h('a', { class: 'btn', href: meta.url, target: '_blank', rel: 'noopener' }, 'Visit site', ic('out', 15)),
          h('button', { class: 'btn soft', onclick: async () => { try { await navigator.clipboard.writeText(meta.url); toast('Link copied'); } catch { toast('Copy the link from the box above', true); } } }, 'Copy link')),
        qr, dl,
        h('div', { class: 'row small', style: 'flex-wrap:wrap;justify-content:center' }, h('span', { class: 'muted' }, 'Share on'),
          h('a', { href: `https://www.facebook.com/sharer/sharer.php?u=${share}`, target: '_blank', rel: 'noopener' }, 'Facebook'), h('a', { href: `https://x.com/intent/post?url=${share}&text=${encodeURIComponent(meta.name)}`, target: '_blank', rel: 'noopener' }, 'X'),
          h('a', { href: `mailto:?subject=${encodeURIComponent(meta.name)}&body=${share}` }, 'Email')),
        h('p', { class: 'hint' }, 'Most customers find restaurants on Google. Add this link as your website and ordering link in your ', h('a', { href: 'https://business.google.com/', target: '_blank', rel: 'noopener' }, 'Google Business Profile'), '.'),
        !meta.customDomain && h('p', { class: 'hint' }, 'Want your own domain? Open the ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); close(); tab = 'domain'; paintPanel(); } }, 'Domain'), ' tab.'),
        h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'btn text sm', onclick: close }, 'Done'),
          h('button', { class: 'btn danger sm', onclick: async () => {
            if (!await confirmSheet({ title: 'Take your site offline?', text: 'Visitors will see a “coming soon” page until you publish again. Your content stays saved.', action: 'Unpublish', danger: true })) return;
            meta = { ...meta, ...(await api('POST', `/api/sites/${id}/unpublish`)).site }; close(); paintTop(); toast('Your site is offline');
          } }, 'Unpublish'))];
    }, 'live');
  }

  /* ---------- wiring ---------- */

  const onMessage = (e) => {
    if (e.source !== frame.contentWindow || !e.data?.pf) return;
    if (e.data.pf === 'section' && draft.sections.some((s) => s.id === e.data.id)) { tab = 'sections'; sel = e.data.id; openItems.clear(); body.dataset.view = 'edit'; paintPanel(); paintTop(); }
    if (e.data.pf === 'page') {
      const target = e.data.page === 'home' || LEGAL_PAGES[e.data.page] || (e.data.page === 'order' && ordering.enabled) ? e.data.page : 'home';
      const jump = () => e.data.hash && frame.contentDocument?.getElementById(e.data.hash)?.scrollIntoView();
      if (target !== page) { frame.addEventListener('load', jump, { once: true }); setPage(target); } else { e.data.hash ? jump() : frame.contentWindow.scrollTo({ top: 0, behavior: 'smooth' }); }
    }
  };
  const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { e.preventDefault(); travel(e.shiftKey ? 1 : -1); } };
  window.addEventListener('keydown', onKey);
  const onLeave = (e) => { if (saveState !== 'saved' && !staleSeen) { save.flush(); e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('message', onMessage);
  window.addEventListener('beforeunload', onLeave);

  mount(h('div', { class: 'ed' }, top, body, tabbar));
  paintTop(); paintPanel(); paint(true);

  const leave = () => { staleSeen = true; document.removeEventListener('visibilitychange', onVisible); clearInterval(salesTick); window.removeEventListener('keydown', onKey); stageWatch.disconnect(); clearInterval(poll); window.removeEventListener('message', onMessage); window.removeEventListener('beforeunload', onLeave); if (saveState !== 'saved') save.flush(); };
  leave.siteId = id; leave.nav = (k) => goTab(k, true);
  return leave;
}
