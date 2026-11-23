import { BACKGROUNDS, SECTION_BACKGROUNDS, HEADER_LAYOUTS, HEADER_STYLES, FOOTER_STYLES, FOOTER_COLORS, QUICK_STYLES, applyQuickStyle, ACCENTS, FONTS, RADII, HERO_LAYOUTS, SERVICE_LAYOUTS, SECTION_TYPES, SECTION_DEFAULTS, ICONS, LEGAL_PAGES, legalText, uid, cleanSlug, str, ORDER_METHODS, ORDER_STATUSES, MENU_TEMPLATE_CSV, readyLabel, parseMenuCsv, parseCsv, parsePrice, money, openMethods, DAYS, TIMEZONES, LANGS, parseChoices, choicesText, slotLabel, itemPrice, DEFAULT_STOCK, pricedMenu, invoiceTotals, invoiceLate, applyMods, isOpenNow, steadyId } from '/shared/core.js';
import { renderPage } from '/shared/render.js';
import { h, api, go, state, toast, sheet, confirmSheet, ic, svg, uploadImage, pickFiles, debounce, fmtDate, qrCanvas, readSheetFile, saveSheetFile, SHEET_TYPES, alertsOn, setAlerts, announceOrders, printTicket, pushSupported, pushOn, enablePush, disablePush, themeButton, skel, emptyState, labelTables, canOfferInstall, installApp, setTheme, navIcon, navTile, getTheme } from './ui.js';

// Two separate sides. The back office is for running the business day to day; the website side is for how the site looks.
const TABS = [
  ['sale', 'Virtual Terminal', 'cash', 'office'], ['sites', 'My sites', 'page', 'office'], ['start', 'Home', 'home', 'office'], ['orders', 'Orders', 'bag', 'office'], ['tx', 'Transactions', 'cash', 'office'], ['cash', 'Cash log', 'cash', 'office'], ['close', 'Closeout', 'cash', 'office'], ['est', 'Estimates', 'doc', 'office'], ['tips', 'Tips', 'cash', 'office'],
  ['r-full', 'Sales report', 'chart', 'office'], ['r-emp', 'Employee sales', 'chart', 'office'], ['r-tender', 'Tender types', 'chart', 'office'], ['r-disc', 'Discounts report', 'chart', 'office'], ['r-removed', 'Removed items', 'chart', 'office'], ['r-exports', 'Exports', 'dl', 'office'], ['insights', 'Insights', 'chart', 'office'], ['appts', 'Appointments', 'clock', 'office'], ['calendar', 'Calendar', 'clock', 'office'], ['booking', 'Online booking', 'clock', 'office'], ['schedule', 'Scheduling', 'f_users', 'office'], ['timesheets', 'Timesheets', 'f_users', 'office'], ['projects', 'Projects', 'doc', 'office'], ['plans', 'Recurring payments', 'doc', 'office'], ['gift', 'Gift cards', 'tag', 'office'], ['bizinfo', 'Business information', 'store', 'office'], ['devices', 'Devices', 'bell', 'office'], ['appearance', 'Appearance', 'brush', 'office'], ['settings', 'Settings', 'settings', 'office'], ['profile', 'Profile', 'person', 'office'],
  ['items', 'Items', 'tag', 'office'], ['menu', 'Categories', 'menu', 'office'], ['mods', 'Modifier groups', 'tag', 'office'], ['menus', 'Menus', 'menu', 'office'], ['labels', 'Printer labels', 'tag', 'office'], ['revs', 'Revenue classes', 'tag', 'office'], ['discs', 'Discounts', 'tag', 'office'],
  ['mod-new', 'Add modifier group', 'tag', 'office'], ['mod-edit', 'Modifier group', 'tag', 'office'], ['menu-view', 'Menu', 'menu', 'office'], ['label-view', 'Printer label', 'tag', 'office'],
  ['sales', 'Sales overview', 'chart', 'office'], ['r-items', 'Item sales', 'chart', 'office'], ['r-types', 'Order types', 'chart', 'office'], ['r-taxes', 'Taxes', 'chart', 'office'],
  ['customers', 'Customers', 'person', 'office'], ['invoices', 'Invoices', 'doc', 'office'],
  ['r-peer', 'Peer insights', 'chart', 'office'], ['r-gift', 'Gift cards report', 'chart', 'office'], ['fin', 'Finances', 'cash', 'office'], ['stmts', 'Statements', 'doc', 'office'], ['disputes', 'Disputes', 'doc', 'office'], ['capital', 'Capital', 'cash', 'office'], ['stax', 'Sales tax', 'doc', 'office'], ['bills', 'Pay bills', 'doc', 'office'],
  ['emp-new', 'New employee', 'f_users', 'office'], ['cust-new', 'Add customer', 'person', 'office'], ['appt-new', 'Create appointment', 'clock', 'office'],
  ['promos', 'Promo codes', 'tag', 'office'], ['deals', 'Happy hour', 'tag', 'office'], ['rewards', 'Rewards', 'tag', 'office'],
  ['inbox', 'Feedback', 'inbox', 'office'], ['team', 'Employees', 'f_users', 'office'],
  ['ordering', 'Online ordering', 'sliders', 'office'], ['hours', 'Business hours', 'clock', 'office'], ['alerts', 'Alerts and emails', 'bell', 'office'],
  ['online', 'Online ordering', 'bag', 'office'], ['outreach', 'Customer outreach', 'person', 'office'],
  ['design', 'Look and feel', 'brush', 'site'], ['sections', 'Home page', 'layers', 'site'], ['business', 'Business info', 'store', 'site'],
  ['domain', 'Web address', 'globe', 'site'], ['policies', 'Policies', 'lock', 'site'], ['seo', 'Search', 'search', 'site'], ['history', 'History', 'clock', 'site'],
];
const WIDE = new Set(['team', 'sale', 'appts', 'calendar', 'schedule', 'timesheets', 'insights', 'projects', 'plans', 'gift', 'tx', 'cash', 'close', 'est', 'tips', 'r-full', 'r-emp', 'r-tender', 'r-disc', 'r-removed', 'r-exports', 'mods', 'menus', 'labels', 'revs', 'discs', 'start', 'items', 'sales', 'r-items', 'r-types', 'r-taxes', 'customers', 'invoices', 'r-peer', 'r-gift', 'fin', 'stmts', 'disputes', 'capital', 'stax', 'bills', 'emp-new', 'cust-new', 'appt-new', 'promos', 'inbox', 'rewards', 'profile', 'online', 'outreach', 'bizinfo']);
const TYPE_TABS = new Set(['sales', 'r-full', 'r-items', 'r-types', 'r-disc', 'r-removed', 'r-taxes', 'r-emp', 'r-tender']);
const SALES_TABS = { sales: 'overview', 'r-items': 'items', 'r-types': 'types', 'r-taxes': 'taxes', 'r-full': 'full', 'r-emp': 'emp', 'r-tender': 'tender', 'r-disc': 'disc', 'r-removed': 'removed', tips: 'tips' };
// Which settings cards belong on which screen.
const SETUP_VIEWS = { ordering: ['Online ordering', 'Food preparation time', 'Pickup', 'Curbside', 'Delivery', 'Checkout'], hours: ['Opening hours', 'Kitchen capacity', 'Dayparts'], promos: ['Promo codes'], deals: ['Happy hour and timed prices'], rewards: ['Loyalty rewards'], alerts: ['Notifications on this device', 'Alerts and reports', 'Order emails'] };
const MODES = { office: 'Back office', site: 'Website' };
const NAV_NAMES = new Set(['calendar', 'insights', 'home', 'orders', 'menu', 'sales', 'customers', 'settings', 'design', 'page', 'business', 'address', 'invoice', 'promo', 'feedback', 'team']);
// Setup lives behind the gear at the top right, in its own section of Settings, not in the sidebar.
const SETUP = { label: 'Setup', icon: 'settings', tabs: ['bizinfo', 'hours', 'ordering', 'booking', 'alerts', 'devices', 'appearance'], subs: ['Business information', 'Business hours', 'Online ordering', 'Online booking', 'Alerts and emails', 'Devices', 'Appearance'] };
// Ordering tools sit at the bottom of the sidebar, under Booking tools.
const TOOLS = { label: 'Ordering tools', icon: 'ordering', tabs: ['online', 'outreach'], subs: ['Online ordering', 'Customer outreach'] };
// The sidebar: a short list of sections. A section with more than one screen opens to show them underneath it.
const NAV = {
  office: [
    { label: 'Home', icon: 'home', tabs: ['start'] },
    { label: 'Insights', icon: 'insights', tabs: ['insights'] },
    { label: 'Appointments', icon: 'calendar', tabs: ['calendar', 'appts'], subs: ['Calendar', 'Overview'] },
    { label: 'Sales activity', short: 'Sales', icon: 'orders', tabs: ['orders', 'tx', 'cash', 'invoices', 'est', 'projects', 'plans'], subs: ['Orders', 'Transactions', 'Cash log', 'Invoices', 'Estimates', 'Projects', 'Recurring payments'] },
    { label: 'Reports', icon: 'sales', tabs: ['sales', 'r-full', 'r-items', 'r-peer', 'r-emp', 'r-tender', 'r-disc', 'r-removed', 'r-gift', 'r-types'], subs: ['Sales overview', 'Sales report', 'Item and Service sales', 'Peer insights', 'Employee sales', 'Tender & card types', 'Discounts', 'Removed items', 'Gift cards', 'Order types'] },
    { label: 'Finances', icon: 'invoice', tabs: ['fin', 'close', 'stmts', 'r-taxes', 'disputes', 'capital', 'stax', 'bills'], subs: ['Overview', 'Closeout', 'Statements', 'Taxes', 'Disputes', 'Capital', 'Sales tax', 'Pay Bills'] },
    { label: 'Items', short: 'Items', icon: 'menu', tabs: ['items', 'menu', 'mods', 'menus', 'labels', 'revs', 'discs'], subs: ['Item list', 'Categories', 'Modifier groups', 'Menus', 'Printer labels', 'Revenue classes', 'Discounts'] },
    { label: 'Employees', icon: 'team', tabs: ['team', 'timesheets', 'schedule', 'tips'], subs: ['Employees list', 'Timesheets', 'Scheduling', 'Tips'] },
    { label: 'Customers', icon: 'customers', tabs: ['customers', 'promos', 'inbox', 'rewards', 'gift'], subs: ['Customers list', 'Promos', 'Feedback', 'Rewards', 'Gift cards'] },
  ],
  site: [
    { label: 'Design', icon: 'design', tabs: ['design', 'history'], subs: ['Look and feel', 'Earlier versions'] },
    { label: 'Home page', icon: 'page', tabs: ['sections', 'policies'], subs: ['Sections', 'Policies'] },
    { label: 'Business info', icon: 'business', tabs: ['business'] },
    { label: 'Web address', icon: 'address', tabs: ['domain', 'seo'], subs: ['Web address', 'Google listing'] },
  ],
};
// Pages opened from a list (a menu, a modifier group, a printer label) keep their list lit in the sidebar.
const PARENT = { 'mod-new': 'mods', 'mod-edit': 'mods', 'menu-view': 'menus', 'label-view': 'labels' };
const navOf = (k) => PARENT[k] || k;
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
  sites: ['My sites'],
  sale: ['New sale', 'Take a payment, record cash or a check, or send an invoice.'],
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
  const tabs = TABS.filter(([k]) => (k !== 'team' && k !== 'emp-new') || isOwner);
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
  let salesRange = (() => { try { return localStorage.getItem(`pf-range-${id}`) || 'today'; } catch { return 'today'; } })(), salesFrom = '', salesTo = '', salesBusy = false;
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
  let sitesData = null, custEdit = '';
  let saleBusy = false, saleCust = false, custAdding = false, teamAdding = false, schedWeek = '', tsEdit = '', tsAdding = false;
  let saleDraft = { type: 'pay', tip: '', note: '', taxOn: true, tender: 'cash', customer: null, q: '', lines: [] };
  let calView = 'day', calDate = '', custFilter = 'all', custSort = 'recent', invCat = '', teamQ = '', teamRole = 'all';
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

  const wrap = (label, control, hint) => h('label', { class: 'field' }, label && h('span', {}, label), control, null);
  /* ---------- business hours: Monday to Sunday, times every half hour ---------- */
  // One set of hours drives both the website and online ordering. Stored Sunday-first (as the ordering code expects), shown Monday-first.
  const WEEK = [1, 2, 3, 4, 5, 6, 0];
  const clock12 = (t) => { const [hh, mm] = String(t).split(':').map(Number); return `${hh % 12 || 12}:${String(mm || 0).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
  const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
  // The website's opening-hours text, worked out from the grid: days with the same times are joined, e.g. "Monday – Friday · 9:00 AM – 5:00 PM".
  function hoursText(week) {
    const rows = [];
    for (const d of WEEK) {
      const x = week[d], value = x.closed ? 'Closed' : `${clock12(x.open)} – ${clock12(x.close)}`, last = rows[rows.length - 1];
      if (last && last.value === value) last.to = d; else rows.push({ from: d, to: d, value });
    }
    return rows.map((r) => ({ label: r.from === r.to ? DAYS[r.from] : `${DAYS[r.from]} – ${DAYS[r.to]}`, value: r.value }));
  }
  function hoursGrid(week, onChange) {
    const pick = (value, label, set, disabled) => h('select', { class: 'hsel', 'aria-label': label, disabled, onchange: (e) => { set(e.target.value); onChange(); } },
      [...new Set([...HALF_HOURS, value])].sort().map((t) => h('option', { value: t, selected: t === value }, clock12(t))));
    const grid = h('div', { class: 'wk' });
    const draw = () => grid.replaceChildren(...WEEK.map((d) => { const x = week[d], day = DAYS[d];
      return h('div', { class: `wk-row${x.closed ? ' off' : ''}` },
        h('b', { class: 'wk-day' }, day),
        h('label', { class: 'switch', title: x.closed ? 'Closed' : 'Open' }, h('input', { type: 'checkbox', 'aria-label': `Open on ${day}`, checked: !x.closed, onchange: (e) => { x.closed = !e.target.checked; draw(); onChange(); } }), h('i')),
        x.closed ? h('span', { class: 'wk-closed' }, 'Closed') : h('div', { class: 'wk-times' }, pick(x.open, `${day} opens`, (v) => { x.open = v; }), h('span', { class: 'wk-to' }, 'to'), pick(x.close, `${day} closes`, (v) => { x.close = v; })));
    }));
    draw();
    return h('div', {}, grid,
      h('div', { class: 'wk-tools' }, h('button', { type: 'button', class: 'btn text sm', onclick: () => { const m = week[1]; for (const d of [2, 3, 4, 5]) Object.assign(week[d], { closed: m.closed, open: m.open, close: m.close }); draw(); onChange(); } }, 'Copy Monday to Tuesday–Friday'), h('button', { type: 'button', class: 'btn text sm', onclick: () => { const m = week[1]; for (const d of [2, 3, 4, 5, 6, 0]) Object.assign(week[d], { closed: m.closed, open: m.open, close: m.close }); draw(); onChange(); } }, 'Copy Monday to every day')),
      null);
  }
  const saveHoursSoon = debounce(() => { putOrdering().catch((e) => toast(e.message, true)); }, 500);

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
      box.replaceChildren(...[h('span', {}, label), zone, null].filter(Boolean));
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
      null);
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
      } }, '+ Add')), null);
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
      ],
    contact: (d) => [text('Heading', d, 'title'), area('Supporting text', d, 'subtitle', { rows: 2 }), toggle('Message form', d, 'showForm'), toggle('Show opening hours', d, 'showHours'),
      ],
  };

  /* ---------- panels ---------- */

  try { localStorage.setItem('pf-last-site', id); } catch { /* private mode */ }
  const PANELS = {
    design() {
      const sw = h('div', { class: 'swatches' });
      const t = draft.theme;
      const drawSw = () => sw.replaceChildren(...ACCENTS.map((a) => h('button', { type: 'button', class: 'swatch', style: `background:${a.value}`, title: a.name, 'aria-label': a.name, 'aria-pressed': String(t.accent.toLowerCase() === a.value), onclick: () => { t.accent = a.value; drawSw(); syncHex(); changed(); } })),
        h('label', { class: 'swatch custom', title: 'Custom colour', 'aria-pressed': String(!ACCENTS.some((a) => a.value === t.accent.toLowerCase())) }, h('input', { type: 'color', value: t.accent, 'aria-label': 'Custom colour', oninput: (e) => { t.accent = e.target.value; syncHex(); changed(); }, onchange: drawSw })));
      const syncHex = () => { const box = panel.querySelector('.hexrow'); if (box) { box.firstChild.style.background = t.accent; box.children[1].value = t.accent.toUpperCase(); } };
      drawSw();
      const hexIn = h('div', { class: 'hexrow' }, h('i', { style: `background:${t.accent}` }), h('input', { value: t.accent.toUpperCase(), maxlength: 7, spellcheck: 'false', 'aria-label': 'Brand colour hex code', oninput: (e) => { let v = e.target.value.trim(); if (v && v[0] !== '#') v = `#${v}`; if (/^#[0-9a-f]{6}$/i.test(v)) { t.accent = v.toLowerCase(); e.target.previousSibling.style.background = v; drawSw(); changed(); } } }), null);
      const bgSw = h('div', { class: 'swatches' });
      const curBg = () => (t.bg || (t.mode === 'dark' ? '#000000' : '#ffffff')).toLowerCase();
      const drawBg = () => bgSw.replaceChildren(...BACKGROUNDS.map((b) => h('button', { type: 'button', class: 'swatch', style: `background:${b.value}`, title: b.name, 'aria-label': b.name, 'aria-pressed': String(curBg() === b.value), onclick: () => { t.bg = b.value; drawBg(); changed(); } })),
        h('label', { class: 'swatch custom', title: 'Custom background', 'aria-pressed': String(!BACKGROUNDS.some((b) => b.value === curBg())) }, h('input', { type: 'color', value: curBg(), 'aria-label': 'Custom background colour', oninput: (e) => { t.bg = e.target.value; changed(); }, onchange: drawBg })));
      drawBg();
      const looks = h('div', { class: 'looks' }, Object.entries(QUICK_STYLES).map(([k, q]) => h('button', { type: 'button', class: `look look-${k}`, onclick: () => { applyQuickStyle(draft, k); changed(); paintPanel(); toast(`${q.name} style applied`); } },
        h('span', { class: 'lk', style: `--b:${t.accent}` }, h('i'), h('i'), h('i')), h('b', {}, q.name), h('small', {}, q.blurb))));
      return [
        group('Quick style', null, looks),
        group('Brand', h('div', { class: 'field' }, h('span', {}, 'Business name'), h('div', { class: 'bi-namerow' }, h('b', {}, draft.brand.name || meta.name), h('button', { type: 'button', class: 'btn soft sm', onclick: () => changeName() }, 'Change business name'))), text('Tagline', draft.brand, 'tagline', { hint: 'A short line shown in your footer and search results.' }),
          image('Logo', draft.brand, 'logo', { logo: true, hint: 'PNG or SVG with a transparent background works best.', after: () => { if (draft.brand.logo && draft.brand.logoMode === 'text') draft.brand.logoMode = 'image'; paintPanel(); } }),
          draft.brand.logo && seg('Show in header', draft.brand, 'logoMode', { image: 'Logo', both: 'Logo and name', text: 'Name only' }),
          seg('Site language', draft, 'lang', LANGS), null),
        group('Colours', h('div', { class: 'field' }, h('span', {}, 'Brand colour'), sw, hexIn, null),
          h('div', { class: 'field' }, h('span', {}, 'Page background'), bgSw, null)),
        group('Header', pick('Layout', draft.header, 'layout', HEADER_LAYOUTS, ART.headerLayout), pick('Colour', draft.header, 'style', HEADER_STYLES, ART.surface), linkField('Header button', draft.header, 'cta'),
          toggle('Keep header visible while scrolling', draft.header, 'sticky'), toggle('Show phone number', draft.header, 'showPhone', (v) => v === true)),
        group('Sections', null,
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
        group('Home page', null,
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
        group('Opening hours', null, hoursGrid(ordering.hours, () => { b.hours = hoursText(ordering.hours); saveHoursSoon(); changed(); })),
        group('Payments', text('Online payment link', b, 'payUrl', { placeholder: 'https://', hint: 'Your Processor Freedom payment page. Adds “Pay online” to your footer and makes it available for buttons.' })),
        group('Social profiles', h('div', { class: 'socials' }, [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['x', 'X'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn']].map(([k, l]) => h('label', { class: 'soc' }, h('span', {}, l), h('input', { value: str(draft.social[k]), placeholder: '@username or link', autocomplete: 'off', oninput: (e) => { draft.social[k] = e.target.value; changed(); } }))))),
      ];
    },

    policies() {
      const L = draft.legal;
      return [
        group('Store policies', null,
          text('Legal business name', draft.business, 'legalName', { placeholder: draft.brand.name, hint: 'If different from your business name.' }), text('Effective date', L, 'effective')),
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
      const drawPv = () => pv.replaceChildren(h('div', { class: 'small', style: 'color:#4d5156' }, meta.url.replace(/^https?:\/\//, '').replace(/\/$/, '')), h('div', { style: 'color:#1a0dab;font-size:17px;margin:2px 0' }, str(s.title).trim() || autoTitle), h('div', { class: 'small' }, str(s.description).trim() || autoDesc));
      drawPv();
      const on = (fn) => ({ oninput: (e) => { s[e.target.dataset.k] = e.target.value; fn?.(); drawPv(); changed(); } });
      return [
        group('Search engine optimization', null,
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
      out.push(group('Your free address', null,
        h('div', { class: 'addrbox' }, state.config.addressPrefix && h('span', { class: 'pre' }, state.config.addressPrefix), input, state.config.addressSuffix && h('span', {}, state.config.addressSuffix)),
        rules, h('div', { class: 'row' }, checkBtn), result));

      /* Own domain */
      if (!meta.customDomain) {
        const dom = h('input', { placeholder: 'yourbusiness.com', 'aria-label': 'Your domain', autocapitalize: 'none', spellcheck: 'false' });
        out.push(group('Use a domain you own', null,
          h('form', { class: 'row', onsubmit: async (e) => { e.preventDefault(); try { meta = { ...meta, ...(await api('POST', `/api/sites/${id}/domain`, { domain: dom.value })).site }; paintPanel(); } catch (ex) { toast(ex.message, true); } } }, h('label', { class: 'field grow' }, dom), h('button', { class: 'btn sm' }, 'Connect'))));
      } else {
        const res = h('div', { 'aria-live': 'polite' });
        out.push(group('Your domain', h('div', { class: 'row' }, h('b', { class: 'grow', style: 'font-size:17px;overflow-wrap:anywhere' }, meta.customDomain), h('span', { class: `status ${meta.domainVerified ? 'ok' : 'warn'}` }, meta.domainVerified ? 'Connected' : 'Waiting for DNS')),
          !meta.domainVerified && [h('p', { class: 'hint' }, 'Sign in where you bought your domain and add these two DNS records. Changes can take up to an hour to appear.'),
            h('table', { class: 'dns' }, h('thead', {}, h('tr', {}, h('th', {}, 'Type'), h('th', {}, 'Name'), h('th', {}, 'Value'))), h('tbody', {},
              h('tr', {}, h('td', {}, 'CNAME'), h('td', {}, 'www'), h('td', {}, state.config.cnameTarget)),
              h('tr', {}, h('td', {}, 'ALIAS'), h('td', {}, '@'), h('td', {}, state.config.cnameTarget)))),
            null],
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
        out.push(group('Let us set one up for you', null,
          request?.status === 'open' && note(h('b', {}, 'Request received. '), `We’re working on ${request.desired} and will be in touch.`),
          h('form', { class: 'row', onsubmit: async (e) => { e.preventDefault(); try { await api('POST', `/api/sites/${id}/domain-request`, { desired: want.value }); request = { desired: want.value, status: 'open' }; toast('Request sent'); paintPanel(); } catch (ex) { toast(ex.message, true); } } },
            h('label', { class: 'field grow' }, want), h('button', { class: 'btn soft sm' }, request?.status === 'open' ? 'Update request' : 'Request domain'))));
      }
      return out;
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
      // Dayparts: named times of day a menu can be shown in. Menus pick them under Menu availability.
      // Dayparts: named times of day a menu can be shown in. Menus pick them under Menu availability.
      // Each change looks its daypart up by ID, because a save swaps in the server's copy of the list.
      const dp = (pid) => o.dayparts.find((x) => x.id === pid);
      const dpTime = (pid, k) => (e) => {
        const cur = dp(pid); if (!cur) return;
        const v = e.target.value, other = k === 'from' ? cur.to : cur.from;
        if (!v) { e.target.value = cur[k]; return toast('Choose a time.', true); }
        if (v === other) { e.target.value = cur[k]; return toast('The start and end times must be different.', true); }
        cur[k] = v; saveOrdering();
      };
      const dayparts = group('Dayparts', null,
        h('div', { class: 'stack' }, o.dayparts.map((p) => h('div', { class: 'deal' },
          h('div', { class: 'row' }, h('input', { class: 'grow', value: p.name, maxlength: 40, placeholder: 'Lunch', 'aria-label': 'Daypart name', oninput: (e) => { const cur = dp(p.id), v = e.target.value.trim(); if (cur && v) { cur.name = v; saveOrdering(); } }, onblur: (e) => { const cur = dp(p.id); if (cur && !e.target.value.trim()) { e.target.value = cur.name; toast('A daypart needs a name.', true); } } }),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove ${p.name || 'daypart'}`, onclick: () => { o.dayparts = o.dayparts.filter((x) => x.id !== p.id); for (const m of o.menus) m.dayparts = m.dayparts.filter((x) => x !== p.id); saveOrdering(); redraw(); } }, ic('trash', 16))),
          h('div', { class: 'deal-grid dp-grid' },
            h('label', { class: 'field' }, h('span', {}, 'From'), h('input', { type: 'time', value: p.from, required: true, onchange: dpTime(p.id, 'from') })),
            h('label', { class: 'field' }, h('span', {}, 'Until'), h('input', { type: 'time', value: p.to, required: true, onchange: dpTime(p.id, 'to') }))),
          h('div', { class: 'daypick', role: 'group', 'aria-label': 'Days' }, DAYS.map((day, di) => h('button', { type: 'button', title: day, 'aria-label': day, 'aria-pressed': String(p.days[di] !== false), onclick: (e) => { const cur = dp(p.id); if (!cur) return; cur.days[di] = cur.days[di] === false; e.currentTarget.setAttribute('aria-pressed', String(cur.days[di])); saveOrdering(); } }, day.slice(0, 2))))))),
        h('button', { type: 'button', class: 'btn soft sm', style: 'justify-self:start', onclick: () => { if (o.dayparts.length >= 20) return toast('You can have up to 20 dayparts.', true); o.dayparts.push({ id: uid('p'), name: 'Lunch', days: DAYS.map(() => true), from: '11:00', to: '14:00' }); saveOrdering(); redraw(); } }, ic('plus', 14), 'Add daypart'));
      const out = [
        group('Online ordering', toggle('Take orders on my website', o, 'enabled', (v) => v === true, () => { if (o.enabled && !openMethods(o).length) o.methods.pickup = true; redraw(); }),
          o.enabled && toggle('Accepting orders right now', o, 'accepting', undefined, redraw),
          o.enabled && !o.accepting && note('Ordering is paused.'),
          o.enabled && !menu.length && note('Your menu is empty.'),
          o.enabled && h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('button', { class: 'btn soft sm', onclick: async () => { const w = window.open('', '_blank'); await flush(); if (w) w.location = `/preview/${id}/order`; } }, 'Preview order page', ic('out', 14)), meta.live && h('a', { class: 'btn soft sm', href: `${meta.url.replace(/\/$/, '')}/order`, target: '_blank', rel: 'noopener' }, 'Open as a customer', ic('out', 14)))),
        ...(o.enabled ? [
          (o.methods.pickup || o.methods.curbside) && group('Food preparation time', num('Ready in (minutes)', 'prepMinutes')),
          method('pickup', text('Pickup instructions', o, 'pickupNote', { placeholder: 'Collect at the front counter', maxlength: 300 })),
          method('curbside', text('Curbside instructions', o, 'curbsideNote', { maxlength: 300, hint: 'Customers are asked for their vehicle make, model and colour.' })),
          method('delivery', h('div', { class: 'pair' }, cash('Delivery fee', 'deliveryFee'), cash('Minimum order', 'deliveryMin')), num('Delivered in (minutes)', 'deliveryMinutes'), text('Delivery area', o, 'deliveryArea', { placeholder: 'Within 5 miles of the restaurant', maxlength: 300 }),
            h('div', { class: 'field' }, h('span', {}, 'Delivery zones by ZIP code'), h('div', { class: 'stack' }, o.zones.map((z, i) => h('div', { class: 'zrow' },
              h('input', { value: Array.isArray(z.zips) ? z.zips.join(', ') : z.zips, placeholder: '75751, 75752', 'aria-label': 'ZIP codes', oninput: (e) => { z.zips = e.target.value; saveOrdering(); } }),
              h('input', { value: (z.fee / 100).toFixed(2), inputmode: 'decimal', 'aria-label': 'Delivery fee for these ZIP codes', oninput: (e) => { const c = parsePrice(e.target.value || '0'); if (c !== null) { z.fee = c; saveOrdering(); } } }),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove zone', onclick: () => { o.zones.splice(i, 1); saveOrdering(); redraw(); } }, ic('trash', 16))))),
              h('button', { type: 'button', class: 'btn soft sm', style: 'justify-self:start', onclick: () => { o.zones.push({ zips: '', fee: o.deliveryFee || 0 }); redraw(); } }, ic('plus', 14), 'Add zone'),
              null)),
          group('Checkout', wrap('Sales tax (%)', h('input', { type: 'number', min: 0, max: 30, step: '0.001', value: o.taxRate, oninput: (e) => { o.taxRate = Number(e.target.value) || 0; saveOrdering(); } }), 'Added to every order. Enter 0 if your prices include tax.'),
            toggle('Let customers add a tip', o, 'tips'), toggle('Let customers add notes', o, 'allowNotes'),
            null),
          group('Opening hours', wrap('Time zone', h('select', { onchange: (e) => { o.timezone = e.target.value; saveOrdering(); } }, Object.entries(TIMEZONES).map(([k, l]) => h('option', { value: k, selected: o.timezone === k }, l)))),
            hoursGrid(o.hours, () => { draft.business.hours = hoursText(o.hours); saveOrdering(); changed(); }),
            toggle('Only take orders during set hours', o, 'useHours', (v) => v === true, redraw),
            toggle('Let customers order ahead for a later time', o, 'scheduling', (v) => v === true), null),
          group('Kitchen capacity', wrap('Most orders in any 15 minutes', h('input', { type: 'number', min: 0, max: 500, value: o.slotLimit || '', placeholder: 'No limit', style: 'max-width:160px', oninput: (e) => { o.slotLimit = Math.max(0, Math.round(Number(e.target.value)) || 0); saveOrdering(); } }), 'Stops the kitchen being overbooked. Once a time is full, customers are offered the next one. Leave empty for no limit.')),
          dayparts,
          group('Happy hour and timed prices', null,
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
            null),
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
              null]),
          group('Notifications on this device', h('label', { class: 'switch' }, h('span', {}, h('b', { style: 'font-weight:500' }, 'Sound and pop-up alerts')), h('input', { type: 'checkbox', checked: alertsOn(), onchange: (e) => setAlerts(e.target.checked) }), h('i')),
            h('label', { class: 'switch' }, h('span', {}, h('b', { style: 'font-weight:500' }, 'Notify this device')), h('input', { type: 'checkbox', checked: pushIsOn === true, onchange: async (e) => { const want = e.target.checked; try { if (want) { await enablePush(); toast('This device will be notified of new orders'); } else { await disablePush(); } pushIsOn = want; } catch (ex) { e.target.checked = !want; toast(ex.message, true); } } }), h('i'))),
          group('Alerts and reports', toggle('Email me a summary each morning', o, 'dailySummary'), null,
            wrap('Warn me when an item drops to', h('input', { type: 'number', min: 0, max: 9999, value: o.lowStockAt, style: 'max-width:160px', oninput: (e) => { o.lowStockAt = Math.max(0, Math.round(Number(e.target.value)) || 0); saveOrdering(); } }), 'You get a notification on your devices, and an email, the moment an order takes an item to this number or below. Use 0 to hear only when something sells out.')),
          group('Order emails', text('Send new orders to', o, 'notifyEmail', { type: 'email', placeholder: draft.business.email || state.user.email }),
            null),
        ] : []),
      ];
      notify = null;
      if (!o.enabled && view !== 'ordering') return [emptyState('sliders', 'Online ordering is off', 'Online ordering is off.', ['Open online ordering', () => goTab('ordering')]), view === 'hours' && dayparts];
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
      const alertBox = h('label', { class: 'switch' }, h('span', {}, h('b', { style: 'font-weight:500' }, 'Sound and pop-up alerts'), null), h('input', { type: 'checkbox', checked: alertsOn(), onchange: (e) => setAlerts(e.target.checked) }), h('i'));
      const pushBox = h('label', { class: 'switch' }, h('span', {}, h('b', { style: 'font-weight:500' }, 'Notify this device'), null),
        h('input', { type: 'checkbox', checked: pushIsOn === true, onchange: async (e) => {
          const want = e.target.checked;
          try { if (want) { await enablePush(); toast('This device will be notified of new orders'); } else { await disablePush(); } pushIsOn = want; } catch (ex) { e.target.checked = !want; toast(ex.message, true); }
        } }), h('i'));
      return [group('', seg,
        !shown.length && (orders.length ? emptyState('check', 'All caught up', 'No active orders.')
          : !ordering.enabled ? emptyState('bag', 'No orders yet', 'Online ordering is off.', ['Open ordering', () => goTab('ordering')])
            : emptyState('bag', 'No orders yet', meta.live ? '' : '', meta.live ? ['Open my order page', () => window.open(`${meta.url.replace(/\/$/, '')}/order`, '_blank', 'noopener')] : null)),
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
      const load = () => loadStats();
      const pick = (r) => { salesRange = r; paintPanel(); };
      if (stats && !stats.failed && statsFor !== rq().toString()) { stats = null; load(); }
      const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['last30', 'Last 30 days'], ['custom', 'Custom']];
      const day = (d, o = { month: 'short', day: 'numeric' }) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', ...o });
      const head = (st) => h('div', { class: 'inv-top' },
        h('div', {}, h('h2', {}, TITLES[V])),
        h('div', { class: 'row', style: 'flex-wrap:wrap' }));
      const filter = h('div', { class: 'inv-bar' }, dateFilter());
      if (salesRange === 'custom' && (!salesFrom || !salesTo) && !stats) return [h('div', { class: 'inv' }, head(null), filter, h('div', { class: 'inv-list' }, h('div', { class: 'inv-empty' }, ic('chart', 30), h('b', {}, 'Choose your dates'), h('p', {}, ''))))];
      if (!stats) { load(); return [h('div', { class: 'inv' }, head(null), filter, h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(1, 'chart'), skel(5, 'row'))]; }
      if (stats.failed) return [h('div', { class: 'inv' }, head(null), filter, h('div', { class: 'inv-list' }, h('div', { class: 'inv-empty' }, ic('alert', 30), h('b', {}, 'We could not load your sales'), h('p', {}, ''))))];

      const st = stats, t = st.totals;
      const change = (now, was) => { if (!was) return now ? h('span', { class: 'delta up' }, 'New') : null; const pct = Math.round(((now - was) / was) * 100); return h('span', { class: `delta ${pct >= 0 ? 'up' : 'down'}`, title: `Compared with ${day(st.previous.from)}${st.previous.from === st.previous.to ? '' : ` to ${day(st.previous.to)}`}` }, `${pct >= 0 ? '+' : ''}${pct}%`); };
      const kpi = (label, value, extra, sub, icon) => h('div', { class: 'kpi big' }, h('span', { class: 'kico' }, ic(icon, 18)), h('span', { class: 'small muted' }, label), h('b', {}, value, extra), sub && h('span', { class: 'small muted' }, sub));
      const peak = Math.max(1, ...st.series.map((x) => x.net));
      const hour = (k) => { const n = Number(k); return `${n % 12 || 12}${n < 12 ? 'a' : 'p'}`; };
      const busy = st.series.filter((x) => x.orders);
      const shownSeries = st.unit === 'hour' ? st.series.slice(Math.max(0, Math.min(6, busy.length ? Number(busy[0].key) : 6)), Math.min(24, Math.max(23, busy.length ? Number(busy.at(-1).key) + 1 : 23))) : st.series;
      const every = Math.ceil(shownSeries.length / 12);
      const yTop = (() => { if (peak <= 1) return 100000; const u = 10 ** Math.floor(Math.log10(peak)); return [1, 2, 2.5, 5, 10].map((m) => m * u).find((v) => v >= peak * 1.05) || 10 * u; })();
      const short = (c) => { const d = c / 100; return d >= 1000 ? `$${(d / 1000).toFixed(d % 1000 ? 1 : 0)}K` : `$${Math.round(d)}`; };
      const nowAt = st.unit === 'hour' && st.to === st.today && shownSeries.length ? (() => { const n = new Date(); const x = n.getHours() + n.getMinutes() / 60 - Number(shownSeries[0].key); return x >= 0 && x <= shownSeries.length ? (x / shownSeries.length) * 100 : null; })() : null;
      const chart = h('div', { class: 'chart g2' },
        h('div', { class: 'chart-y', 'aria-hidden': 'true' }, [4, 3, 2, 1, 0].map((i) => h('span', { style: `bottom:${i * 25}%` }, short((yTop * i) / 4)))),
        h('div', { class: 'chart-plot' }, [1, 2, 3, 4].map((i) => h('i', { class: 'gl', style: `bottom:${i * 25}%` })),
          nowAt != null && h('div', { class: 'now', style: `left:${nowAt}%` }, h('span', {}, 'Now')),
          h('div', { class: 'chart-bars', role: 'img', 'aria-label': `Sales by ${st.unit}` }, shownSeries.map((x) => h('div', { class: 'cbar', title: `${st.unit === 'hour' ? `${hour(x.key)}m` : day(x.key, { weekday: 'short', month: 'short', day: 'numeric' })}: ${money(x.net)} · ${x.orders} order${x.orders === 1 ? '' : 's'}` }, x.net > 0 && h('em', {}, money(x.net).replace(/\.00$/, '')), x.net > 0 && h('i', { class: 'on', style: `height:${Math.max(3, (x.net / yTop) * 100)}%` }))))),
        h('span'), h('div', { class: 'chart-x' }, shownSeries.map((x, i) => h('span', { 'data-k': i % every === 0 && (i / every) % 2 ? '1' : null }, i % every === 0 ? (st.unit === 'hour' ? hour(x.key) : day(x.key)) : ''))));
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
        none && !['overview', 'full', 'removed', 'disc', 'emp', 'tender', 'tips'].includes(V) && h('div', { class: 'inv-list' }, h('div', { class: 'inv-empty' }, ic('chart', 30), h('b', {}, st.range === 'today' ? 'No sales yet today' : 'No sales in this period'), h('p', {}, meta.live ? '' : ''))),
        (V === 'overview' || (V === 'full' && none)) && h('div', { class: 'scard' }, h('h3', {}, st.unit === 'hour' ? 'Sales by hour' : 'Sales by day'), none && h('p', { class: 'small muted', style: 'margin:-6px 0 6px' }, st.range === 'today' ? (meta.live ? 'No sales yet today.' : 'No sales yet.') : 'No sales in this period.'), chart),
        !none && V !== 'items' && h('div', { class: 'sgrid3 solo' },
          (V === 'overview' || V === 'full') && h('div', { class: 'scard' }, h('h3', {}, 'Where the money went'),
            line('Item sales', money(t.gross)), t.discounts > 0 && line('Discounts and promo codes', `−${money(t.discounts)}`), line('Net sales', money(t.net), 'strong'),
            line('Sales tax', money(t.tax)), line('Delivery fees', money(t.fees)), line('Tips', money(t.tips)), line('Total collected', money(t.total), 'total')),
          V === 'taxes' && h('div', { class: 'scard' }, h('h3', {}, 'Sales tax'),
            line('Taxable sales', money(t.taxable)), line('Non-taxable sales', money(t.nontaxable)), line('Tax collected', money(t.tax), 'total'),
            h('p', { class: 'hint' }, st.taxRate ? `Your rate is ${st.taxRate}%. Taxable sales are after discounts. Items with tax switched off are counted as non-taxable.` : 'No sales tax rate set.')),
          V === 'types' && h('div', { class: 'scard' }, h('h3', {}, 'How customers ordered'),
            st.methods.map((m) => h('div', { class: 'mrow2' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, ORDER_METHODS[m.method]?.name || m.method), h('span', {}, `${m.orders} order${m.orders === 1 ? '' : 's'} · ${money(m.net)}`)), h('div', { class: 'track2' }, h('i', { style: `width:${(m.orders / mTotal) * 100}%` })), h('span', { class: 'small muted' }, `${Math.round((m.orders / mTotal) * 100)}% of orders`))))),
        !none && V === 'items' && h('div', { class: 'scard' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, 'Item sales'), h('span', { class: 'small muted' }, `${st.items.length} item${st.items.length === 1 ? '' : 's'} · ${t.units} sold`)),
          h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['', 'Item', 'Category', 'Sold', 'Sales', 'Share of sales'].map((x) => h('th', {}, x)))),
            h('tbody', {}, st.items.map((it, i) => h('tr', {}, h('td', { class: 'muted' }, i + 1), h('td', {}, h('b', {}, it.name), i === 0 && h('span', { class: 'tag sale', style: 'margin-left:8px' }, 'Most popular')), h('td', { class: 'muted' }, it.category), h('td', {}, it.qty), h('td', {}, money(it.sales)),
              h('td', {}, h('div', { class: 'share' }, h('div', { class: 'track2' }, h('i', { style: `width:${(it.sales / topSales) * 100}%` })), h('span', { class: 'small muted' }, `${t.gross ? Math.round((it.sales / t.gross) * 100) : 0}%`))))))))),
        !none && V === 'items' && (st.revenue || []).some((r) => r.name !== 'No revenue class') && h('div', { class: 'scard' }, h('h3', {}, 'Sales by revenue class'), st.revenue.map((c) => h('div', { class: 'mrow2' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, c.name), h('span', {}, `${c.qty} sold · ${money(c.sales)}`)), h('div', { class: 'track2' }, h('i', { style: `width:${t.gross ? (c.sales / t.gross) * 100 : 0}%` }))))),
        !none && V === 'items' && st.categories.length > 1 && h('div', { class: 'scard' }, h('h3', {}, 'Sales by category'), st.categories.map((c) => h('div', { class: 'mrow2' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, c.name), h('span', {}, `${c.qty} sold · ${money(c.sales)}`)), h('div', { class: 'track2' }, h('i', { style: `width:${t.gross ? (c.sales / t.gross) * 100 : 0}%` }))))),
        V === 'emp' && tableCard('Sales by employee', ['Employee', 'Orders', 'Net sales', 'Tips', 'Total collected'], (st.employees || []).map((e) => [e.name, e.orders, money(e.net), money(e.tips), money(e.total)]), 'No orders in this period. An order is credited to whoever confirms it or takes its payment.'),
        V === 'tender' && tableCard('Sales by tender type', ['Tender', 'Orders', 'Tips', 'Total'], (st.tenders || []).map((e) => [e.name, e.orders, money(e.tips), money(e.total)]), 'No orders in this period.'),
        V === 'disc' && tableCard('Discounts given', ['Discount or promo code', 'Times used', 'Amount'], (st.promos || []).map((e) => [e.name, e.uses, money(e.amount)]), 'No discounts were used in this period.'),
        V === 'removed' && tableCard('Items on cancelled orders', ['Item', 'Quantity', 'Value'], (st.removed || []).map((e) => [e.name, e.qty, money(e.value)]), 'No orders were cancelled in this period.'),
        V === 'tips' && tableCard(`Tips · ${money(t.tips)} in this period`, ['Order', 'When', 'Customer', 'Handled by', 'Tip'], st.orders.filter((o) => o.tip > 0 && o.status !== 'cancelled').map((o) => [`#${o.number}`, `${st.from === st.to ? '' : `${day(o.date)} `}${o.time}`, o.name, o.by || '—', money(o.tip)]), 'No tips in this period.'),
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
      if (!leads.length) return [group('', emptyState('inbox', 'No messages yet', ''))];
      return [group(`${leads.length} message${leads.length === 1 ? '' : 's'}`, leads.map((l) => h('article', { class: 'lead' },
        h('header', {}, h('b', {}, l.name), h('span', { class: 'small muted' }, fmtDate(l.createdAt))),
        h('div', { class: 'small' }, h('a', { href: `mailto:${l.email}` }, l.email), l.phone && [' · ', h('a', { href: `tel:${l.phone.replace(/[^\d+]/g, '')}` }, l.phone)]),
        h('p', {}, l.message),
        h('div', { class: 'row' }, h('a', { class: 'btn soft sm', href: `mailto:${l.email}?subject=${encodeURIComponent(`Re: your message to ${meta.name}`)}` }, 'Reply'),
          h('button', { class: 'btn danger sm', onclick: async () => { await api('DELETE', `/api/sites/${id}/leads/${l.id}`); leads = leads.filter((x) => x.id !== l.id); paintPanel(); } }, 'Delete')))))];
    },

    customers() {
      const head = (extra) => h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Customers'), null), extra);
      if (!customers) {
        api('GET', `/api/sites/${id}/customers`).then((r) => { customers = r.customers; if (tab === 'customers') paintPanel(); }).catch((e) => { toast(e.message, true); customers = []; if (tab === 'customers') paintPanel(); });
        return [h('div', { class: 'inv' }, head(), h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(6, 'row'))];
      }
      if (!customers.length) return [h('div', { class: 'inv' }, head(h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('button', { class: 'btn soft', onclick: importCustomers }, ic('up2', 16), 'Import customers'), h('button', { class: 'btn', onclick: () => { custAdding = true; paintPanel(); } }, ic('plus', 16), 'Add customer'))), custAdding && h('div', { class: 'scard inline-card' }, customerRow(() => { custAdding = false; paintPanel(); }, () => { custAdding = false; paintPanel(); })), !custAdding && h('div', { class: 'inv-list' }, emptyState('person', 'No customers yet', '', ['Add customer', () => { custAdding = true; paintPanel(); }])))];
      const repeat = customers.filter((c) => c.orders > 1).length;
      const spent = customers.reduce((a, c) => a + c.spent, 0), count = customers.reduce((a, c) => a + c.orders, 0);
      const kpi = (label, value, sub, icon) => h('div', { class: 'kpi big' }, h('span', { class: 'kico' }, ic(icon, 18)), h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      const when = (ms) => { const days = Math.floor((Date.now() - ms) / 86400000); return days < 1 ? 'Today' : days === 1 ? 'Yesterday' : days < 30 ? `${days} days ago` : fmtDate(ms); };
      const tbody = h('tbody', {});
      const draw = () => {
        const rows = customers.filter((c) => (!custQ || `${c.name} ${c.email} ${c.phone} ${c.company || ''}`.toLowerCase().includes(custQ)) && (custFilter === 'all' || (custFilter === 'regular' ? c.orders > 1 : custFilter === 'new' ? c.orders <= 1 : custFilter === 'email' ? !!c.email : !!c.phone)));
        if (custSort !== 'recent') rows.sort((a, b) => (custSort === 'name' ? a.name.localeCompare(b.name) : custSort === 'spent' ? b.spent - a.spent : b.orders - a.orders));
        const editRow = (c) => { const v = { name: c.name, company: c.company || '', email: c.email || '', phone: c.phone || '' }; const f = (k, ph, a = {}) => h('input', { value: v[k], placeholder: ph, 'aria-label': ph, oninput: (e) => { v[k] = e.target.value; }, ...a });
          return h('tr', { class: 'inline-tr' }, h('td', { colspan: 8 }, h('form', { class: 'inline-add', onsubmit: async (e) => { e.preventDefault(); try { await api('POST', `/api/sites/${id}/contacts`, v); customers = null; custEdit = ''; toast('Saved'); paintPanel(); } catch (ex) { toast(ex.message, true); } } }, f('name', 'Name', { required: true }), f('company', 'Company'), f('email', 'Email', { type: 'email' }), f('phone', 'Phone', { type: 'tel' }),
            h('div', { class: 'inline-acts' }, h('button', { type: 'button', class: 'btn text', onclick: () => openInvoice(null, c) }, 'Invoice'), h('button', { type: 'button', class: 'btn soft', onclick: () => { custEdit = ''; draw(); } }, 'Cancel'), h('button', { class: 'btn' }, 'Save'))))); };
        tbody.replaceChildren(...(rows.length ? rows.slice(0, 500).map((c) => (custEdit === (c.email || c.name) ? editRow(c) : h('tr', { class: 'click', onclick: (e) => { if (e.target.closest('a, button')) return; custEdit = c.email || c.name; draw(); } }, h('td', {}, h('b', {}, c.name), c.orders > 1 && h('span', { class: 'tag sale', style: 'margin-left:8px' }, 'Regular'), c.company && h('div', { class: 'small muted' }, c.company)), h('td', {}, c.email ? h('a', { href: `mailto:${c.email}` }, c.email) : '—'), h('td', {}, c.phone ? h('a', { href: `tel:${c.phone.replace(/[^\d+]/g, '')}` }, c.phone) : '—'), h('td', {}, c.orders), h('td', {}, h('b', {}, money(c.spent))), h('td', { class: 'muted' }, c.last ? when(c.last) : 'Not yet'), h('td', { class: 'muted' }, c.favourite || '—'), h('td', { style: 'text-align:right' }, h('button', { class: 'btn soft sm', onclick: () => openInvoice(null, c) }, 'Invoice')))))
          : [h('tr', {}, h('td', { colspan: 8, class: 'muted', style: 'text-align:center;padding:28px' }, 'Nobody matches that search.'))]));
      };
      draw();
      return [h('div', { class: 'inv' },
        head(h('div', { class: 'row' }, moreBtn([['Import customers (Excel or CSV)', importCustomers], ['Export customers', exportCustomers]]))),
        h('div', { class: 'inv-kpis' }, kpi('Customers', customers.length, 'have ordered at least once', 'person'), kpi('Regulars', repeat, `${customers.length ? Math.round((repeat / customers.length) * 100) : 0}% came back`, 'f_users'), kpi('Average per customer', money(customers.length ? spent / customers.length : 0), 'across all their orders', 'cash'), kpi('Orders', count, 'not counting cancelled', 'bag')),
        toolbar(custQ, 'Search customers', (v) => { custQ = v; draw(); }, filtersButton([{ title: 'Show', value: custFilter, set: (k) => { custFilter = k; }, options: [['all', 'Everyone'], ['regular', 'Regulars'], ['new', 'One order'], ['email', 'Has email'], ['phone', 'Has phone']] }, { title: 'Sort by', value: custSort, set: (k) => { custSort = k; }, options: [['recent', 'Latest order'], ['name', 'Name'], ['spent', 'Most spent'], ['orders', 'Most orders']] }]), h('button', { class: 'btn', onclick: () => { custAdding = true; paintPanel(); } }, ic('plus', 16), 'Add customer')),
        custAdding && h('div', { class: 'scard inline-card' }, customerRow(() => { custAdding = false; paintPanel(); }, () => { custAdding = false; paintPanel(); })),
        h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Customer', 'Email', 'Phone', 'Orders', 'Spent', 'Last order', 'Favourite', ''].map((x) => h('th', {}, x)))), tbody)),
          customers.length > 500 && h('p', { class: 'hint' }, `Showing the latest 500. Export to see all ${customers.length}.`)))];
    },

    invoices(kind = 'invoice') {
      const est = kind === 'estimate';
      const head = (extra) => h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, est ? 'Estimates' : 'Invoices')), extra);
      const newBtn = h('button', { class: 'btn', onclick: () => openInvoice(null, null, kind) }, ic('plus', 16), est ? 'New estimate' : 'New invoice');
      if (!bills) {
        api('GET', `/api/sites/${id}/invoices`).then((r) => { bills = r; if (tab === 'invoices' || tab === 'est') paintPanel(); }).catch((e) => { toast(e.message, true); bills = { invoices: [], contacts: [], payUrl: '' }; if (tab === 'invoices' || tab === 'est') paintPanel(); });
        return [h('div', { class: 'inv' }, head(), h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(5, 'row'))];
      }
      const all = bills.invoices.filter((v) => (v.kind || 'invoice') === kind);
      if (!all.length) return [h('div', { class: 'inv' }, head(newBtn), h('div', { class: 'inv-list' }, est ? emptyState('doc', 'Your first estimate', '', ['Get started', () => openInvoice(null, null, 'estimate')]) : emptyState('doc', 'No invoices yet', '', ['Create an invoice', () => openInvoice()])))];
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
        null)];
    },

    insights() {
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Insights'), null));
      if (!insightData) { api('GET', `/api/sites/${id}/stats?range=last7`).then((r) => { insightData = r; if (tab === 'insights') paintPanel(); }).catch((e) => { toast(e.message, true); insightData = { failed: true }; if (tab === 'insights') paintPanel(); }); return [h('div', { class: 'inv' }, head, h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(4, 'row'))]; }
      const st = insightData;
      if (st.failed || !st.totals) return [h('div', { class: 'inv' }, head, h('div', { class: 'inv-list' }, emptyState('alert', 'We could not load your insights', 'Press Refresh to try again.')))];
      const t = st.totals, day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
      const kpi = (label, value, sub) => h('div', { class: 'kpi big' }, h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      const pct = (now, was) => (was ? `${now >= was ? 'up' : 'down'} ${Math.abs(Math.round(((now - was) / was) * 100))}% on the week before` : now ? 'no sales the week before to compare' : 'no change');
      if (!t.orders) return [h('div', { class: 'inv' }, head, h('div', { class: 'inv-kpis' }, kpi('Net sales', money(0), 'last 7 days'), kpi('Orders', 0, 'last 7 days'), kpi('Average order', money(0), ''), kpi('Discounts', money(0), '')), h('div', { class: 'inv-list' }, emptyState('chart', 'Not enough to go on yet', '')))];
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
      const head = (extra) => h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Projects'), null), extra);
      const create = async () => { const name = await ask({ title: 'Create project', label: 'Project name', hint: 'An estimate opens next, already filed under this project.', action: 'Create' }); if (name) openInvoice(null, { project: name }, 'estimate'); };
      const btn = h('button', { class: 'btn', onclick: create }, ic('plus', 16), 'Create project');
      if (!bills) { api('GET', `/api/sites/${id}/invoices`).then((r) => { bills = r; if (tab === 'projects') paintPanel(); }).catch(() => { bills = { invoices: [], contacts: [], payUrl: '' }; if (tab === 'projects') paintPanel(); }); return [h('div', { class: 'inv' }, head(), skel(4, 'row'))]; }
      const groups = new Map();
      for (const v of bills.invoices) { if (!v.project || v.status === 'void') continue; const g = groups.get(v.project) || groups.set(v.project, { name: v.project, who: new Set(), est: 0, inv: 0, billed: 0, paid: 0 }).get(v.project); g.who.add(v.customer.company || v.customer.name); if (v.kind === 'estimate') g.est++; else { g.inv++; g.billed += v.total; if (v.status === 'paid') g.paid += v.total; } }
      if (!groups.size) return [h('div', { class: 'inv' }, head(btn), h('div', { class: 'inv-list' }, emptyState('doc', 'Create a new project to get started', '', ['Create project', create])))];
      return [h('div', { class: 'inv' }, head(btn), h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Project', 'Customer', 'Estimates', 'Invoices', 'Billed', 'Paid', 'Outstanding'].map((x) => h('th', {}, x)))),
        h('tbody', {}, [...groups.values()].map((g) => h('tr', {}, h('td', {}, h('b', {}, g.name)), h('td', {}, [...g.who].join(', ')), h('td', {}, g.est), h('td', {}, g.inv), h('td', {}, money(g.billed)), h('td', {}, money(g.paid)), h('td', {}, h('b', {}, money(g.billed - g.paid))))))))))];
    },
    plans() {
      const FREQ = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
      const add = () => formSheet('New recurring payment', [['name', 'Plan name', { maxlength: 120, placeholder: 'e.g. Weekly office lunch' }], ['who', 'Customer name', { maxlength: 120 }], ['email', 'Customer email', { type: 'email', hint: 'Each invoice is emailed here.' }], ['amount', 'Amount each time', { inputmode: 'decimal', placeholder: '0.00' }], ['every', 'How often', { options: FREQ }], ['start', 'First invoice on', { type: 'date' }], ['tax', 'Sales tax (%)', { inputmode: 'decimal' }]],
        { name: '', who: '', email: '', amount: '', every: 'monthly', start: new Date().toISOString().slice(0, 10), tax: String(ordering.taxRate || 0) },
        async (v) => { const c = parsePrice(v.amount || ''); if (!c) throw new Error('Enter an amount above zero.'); planData = await api('POST', `/api/sites/${id}/plans`, { name: v.name, customer: { name: v.who, email: v.email }, amount: c, every: v.every, start: v.start, taxRate: Number(v.tax) || 0 }); });
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Recurring payments'), null), h('button', { class: 'btn', onclick: add }, ic('plus', 16), 'New plan'));
      if (!planData) { api('GET', `/api/sites/${id}/plans`).then((r) => { planData = r; if (tab === 'plans') paintPanel(); }).catch((e) => { toast(e.message, true); planData = { plans: [] }; if (tab === 'plans') paintPanel(); }); return [h('div', { class: 'inv' }, head, h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(3, 'row'))]; }
      const all = planData.plans, live = all.filter((x) => x.status === 'active');
      const kpi = (label, value, sub) => h('div', { class: 'kpi big' }, h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      const act = async (fn, note) => { try { planData = await fn(); toast(note); paintPanel(); } catch (e) { toast(e.message, true); } };
      return [h('div', { class: 'inv' }, head,
        h('div', { class: 'inv-kpis' }, kpi('Total recurring amount', money(live.reduce((a, x) => a + x.amount, 0)), 'per billing, before tax'), kpi('Billed so far', money(all.reduce((a, x) => a + x.billed, 0)), 'across all plans'), kpi('Active plans', live.length, 'sending invoices'), kpi('Paused plans', all.length - live.length, 'on hold')),
        all.length ? h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Plan', 'Customer', 'Amount', 'Frequency', 'Next invoice', 'Status', 'Action'].map((x) => h('th', {}, x)))),
          h('tbody', {}, all.map((x) => h('tr', {}, h('td', {}, h('b', {}, x.name)), h('td', {}, x.customer.name, h('div', { class: 'small muted' }, x.customer.email)), h('td', {}, money(x.amount)), h('td', {}, FREQ[x.every]), h('td', {}, x.status === 'active' ? x.nextDate : '—'), h('td', {}, h('span', { class: `status ${x.status === 'active' ? 'ok' : ''}` }, x.status === 'active' ? 'Active' : 'Paused')),
            h('td', { style: 'white-space:nowrap' }, h('button', { class: 'btn soft sm', onclick: () => act(() => api('POST', `/api/sites/${id}/plans/${x.id}`, { status: x.status === 'active' ? 'paused' : 'active' }), x.status === 'active' ? 'Plan paused' : 'Plan resumed') }, x.status === 'active' ? 'Pause' : 'Resume'), ' ', h('button', { class: 'btn text sm', style: 'color:var(--red)', onclick: async () => { if (await confirmSheet({ title: `Delete ${x.name}?`, text: 'No more invoices are created. Invoices already sent are kept.', action: 'Delete', danger: true })) act(() => api('DELETE', `/api/sites/${id}/plans/${x.id}`), 'Plan deleted'); } }, 'Delete'))))))))
          : h('div', { class: 'inv-list' }, emptyState('doc', 'No recurring payments yet', '', ['New plan', add])))];
    },
    gift() {
      const issue = () => formSheet('Issue a gift card', [['amount', 'Amount', { inputmode: 'decimal', placeholder: '25.00' }], ['name', 'For (name)', { maxlength: 120, placeholder: 'Optional' }], ['email', 'Email the code to', { type: 'email', placeholder: 'Optional' }], ['note', 'Note', { maxlength: 200, placeholder: 'Optional, e.g. Paid in cash' }]], { amount: '', name: '', email: '', note: '' },
        async (v) => { const c = parsePrice(v.amount || ''); if (!c) throw new Error('Enter an amount.'); const r = await api('POST', `/api/sites/${id}/gift-cards`, { amount: c, name: v.name, email: v.email, note: v.note }); giftData = r; setTimeout(() => sheet((close) => [h('h2', {}, 'Gift card ready'), h('p', { class: 'muted' }, r.emailed ? `We emailed the code to ${v.email}.` : 'Give this code to your customer. They type it in the promo code box at checkout, or you can redeem it for them here.'), h('div', { class: 'urlbox', style: 'font-size:24px;letter-spacing:.06em;text-align:center' }, r.code), h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: close }, 'Done'))]), 300); });
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Gift cards'), null), h('button', { class: 'btn', onclick: issue }, ic('plus', 16), 'Issue gift card'));
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
          : h('div', { class: 'inv-list' }, emptyState('tag', 'Grow your business with gift cards', '', ['Issue gift card', issue])))];
    },
    sale() {
      const d = saleDraft;
      if (!['pay', 'preauth', 'verify'].includes(d.type)) d.type = 'pay';
      for (const [k, v] of Object.entries({ sub: '', taxSel: 'none', note: '', tip: '', receipt: 'none', email: '', q: '' })) if (d[k] == null) d[k] = v;
      if (!d.card) d.card = { number: '', holder: '', exp: '', cvv: '', zip: '', street: '' };
      if (!customers && !saleCust) { saleCust = true; api('GET', `/api/sites/${id}/customers`).then((r) => { customers = r.customers; if (tab === 'sale') paintPanel(); }).catch(() => {}).finally(() => { saleCust = false; }); }
      const rate = Number(ordering.taxRate) || 0;
      const cents = (v) => { const c = parsePrice(String(v || '0')); return c == null ? 0 : c; };
      const TYPES = [['pay', 'Take payment'], ['preauth', 'Pre-authorization'], ['invoice', 'Invoice'], ['verify', 'Card verification']];
      const sums = () => { const sub = d.type === 'verify' ? 0 : cents(d.sub), tax = d.type === 'pay' && d.taxSel === 'tax' ? Math.round((sub * rate) / 100) : 0, tip = d.type === 'pay' ? cents(d.tip) : 0; return { sub, tax, tip, total: sub + tax + tip }; };
      const fl = (label, input, help, cls = '') => h('div', { class: `vt-f ${cls}` }, h('label', { class: 'vt-box' }, h('span', { class: 'vt-lab' }, label), input), help && h('small', { class: 'vt-help' }, help));
      const totalEls = [], btn = h('button', { type: 'button', class: 'btn vt-go' });
      let touched = false;
      const subErr = h('p', { class: 'vt-err', role: 'alert', hidden: true }, h('span', { class: 'vt-erri' }, '!'), 'Total must be between $0.01 and $999,999.99');
      const subBox = h('div', { class: 'vt-subbox' });
      const ready = () => { const t = sums(), c = d.card; const cardOk = c.number.replace(/\D/g, '').length >= 12 && /^\d{2}\/\d{4}$/.test(c.exp) && /^\d{3,4}$/.test(c.cvv) && c.zip.trim(); return cardOk && (d.type === 'verify' || (t.sub >= 1 && t.sub <= 99999999)); };
      const refresh = () => {
        const t = sums();
        totalEls.forEach((el) => { el.textContent = money(t.total); });
        taxVal.textContent = `+${money(t.tax)}`;
        const bad = d.type !== 'verify' && !(t.sub >= 1 && t.sub <= 99999999);
        const show = bad && touched; subErr.hidden = !show; subBox.classList.toggle('bad', show);
        btn.disabled = !ready();
      };
      btn.textContent = d.type === 'preauth' ? 'Pre-authorize Payment' : d.type === 'verify' ? 'Verify Card' : 'Complete Payment';
      btn.onclick = () => toast('Card payments are not connected yet. Nothing was charged.', true);
      // Transaction type
      const typeBtn = h('button', { type: 'button', class: 'vt-type', 'aria-haspopup': 'listbox', onclick: () => popover(typeBtn, (close) => h('div', { class: 'cl-menu vt-menu', role: 'listbox' }, TYPES.map(([k, l]) => h('button', { type: 'button', role: 'option', 'aria-selected': String(d.type === k), onclick: () => { close(); if (k === 'invoice') { goTab('invoices'); return; } d.type = k; paintPanel(); } }, h('span', {}, l)))), 'left') },
        h('span', { class: 'vt-lab' }, 'Transaction Type'), h('b', {}, (TYPES.find(([k]) => k === d.type) || TYPES[0])[1]), h('i', { class: 'chv d', 'aria-hidden': 'true' }));
      // Sale detail
      // Typing works like a register: digits fill in from the right ($0.00, $0.01, $0.12, $1.23).
      const cashIn = (key, label) => h('input', { inputmode: 'numeric', 'aria-label': label, value: money(cents(d[key])), oninput: (e) => { const c = Math.min(99999999, Number(e.target.value.replace(/\D/g, '').slice(-9)) || 0); d[key] = c ? (c / 100).toFixed(2) : ''; e.target.value = money(c); const n = e.target.value.length; e.target.setSelectionRange(n, n); refresh(); }, onfocus: (e) => { const n = e.target.value.length; requestAnimationFrame(() => e.target.setSelectionRange(n, n)); } });
      const subIn = cashIn('sub', 'Subtotal');
      subIn.addEventListener('input', () => { subIn.dataset.typed = '1'; if (touched) refresh(); });
      subIn.addEventListener('blur', () => { if (subIn.dataset.typed) { touched = true; refresh(); } });
      subBox.replaceChildren(h('label', {}, h('span', { class: 'vt-lab' }, 'Subtotal *'), subIn));
      const taxVal = h('b', {}, '+$0.00');
      const taxBtn = h('button', { type: 'button', class: 'vt-tax', onclick: () => popover(taxBtn, (close) => h('div', { class: 'cl-menu' }, [['none', 'No tax'], ['tax', rate ? `Sales tax (${rate}%)` : 'Sales tax (no rate set)']].map(([k, l]) => h('button', { type: 'button', class: d.taxSel === k ? 'on' : '', onclick: () => { close(); d.taxSel = k; refresh(); } }, h('span', {}, l), d.taxSel === k && h('i', { class: 'cl-tick' }, '✓')))), 'left') },
        h('span', { class: 'vt-lab' }, rate ? `Tax (Sales tax ${rate}%)` : 'Tax'), h('span', { class: 'vt-taxrow' }, taxVal, h('i', { class: 'chv d', 'aria-hidden': 'true' })));
      const detail = d.type !== 'verify' && [h('h2', { class: 'vt-h' }, 'Sale detail'),
        h('div', { class: 'vt-card' },
          h('div', { class: `vt-top ${d.type === 'pay' ? 'two' : ''}` }, h('div', { class: 'vt-subwrap' }, subBox, subErr), d.type === 'pay' && h('div', { class: 'vt-taxcol' }, taxBtn)),
          h('div', { class: 'vt-sec' }, fl('Note for item or service', h('input', { value: d.note, maxlength: 500, placeholder: ' ', oninput: (e) => { d.note = e.target.value; } }))),
        ),
        d.type === 'pay' && h('div', { class: 'vt-tipbox' }, h('div', { class: 'vt-sec' }, fl('Tip', cashIn('tip', 'Tip'))),
          h('div', { class: 'vt-tiptotal' }, h('span', {}, 'Total'), (() => { const b = h('b', {}, '$0.00'); totalEls.push(b); return b; })()))];
      // Payment information
      const who = h('div', { class: 'vt-who' });
      const drawWho = () => {
        if (d.customer) return who.replaceChildren(h('div', { class: 'vt-picked' }, h('div', {}, h('b', {}, d.customer.name), h('div', { class: 'small muted' }, [d.customer.email, d.customer.phone].filter(Boolean).join(' · '))), h('button', { class: 'btn text sm', type: 'button', onclick: () => { d.customer = null; drawWho(); paintCardNote(); } }, 'Remove')));
        const res = h('div', { class: 'ns-hits' });
        const find = () => { const q = d.q.toLowerCase(); res.replaceChildren(...(q ? (customers || []).filter((c) => `${c.name} ${c.email} ${c.phone} ${c.company || ''}`.toLowerCase().includes(q)).slice(0, 6) : []).map((c) => h('button', { type: 'button', onclick: () => { d.customer = c; d.q = ''; if (!d.email && c.email) d.email = c.email; drawWho(); paintCardNote(); } }, h('span', {}, c.name), h('small', {}, c.email || c.phone || '')))); };
        who.replaceChildren(h('label', { class: 'vt-search' }, h('input', { type: 'search', placeholder: 'Search customer or business name', value: d.q, 'aria-label': 'Search customer or business name', oninput: (e) => { d.q = e.target.value; find(); } }), ic('search', 20)), res);
        find();
      };
      const addCust = h('button', { type: 'button', class: 'vt-link', onclick: () => { who.replaceChildren(customerRow((c) => { d.customer = { name: c.name, email: c.email, phone: c.phone, company: c.company }; drawWho(); paintCardNote(); }, drawWho)); } }, 'ADD NEW CUSTOMER');
      const cardIn = (k, a = {}) => h('input', { value: d.card[k], placeholder: ' ', autocomplete: 'off', oninput: (e) => { let v = e.target.value; if (k === 'number') v = v.replace(/[^\d ]/g, '').slice(0, 23); if (k === 'cvv') v = v.replace(/\D/g, '').slice(0, 4); if (k === 'exp') { v = v.replace(/[^\d/]/g, ''); if (/^\d{3,}$/.test(v)) v = `${v.slice(0, 2)}/${v.slice(2, 6)}`; v = v.slice(0, 7); } e.target.value = v; d.card[k] = v; refresh(); }, ...a });
      const cardNote = h('div', { class: 'vt-onfile' });
      const paintCardNote = () => cardNote.replaceChildren(d.customer ? h('label', { class: 'vt-check' }, h('input', { type: 'checkbox', disabled: true }), h('span', {}, `Save card on file for ${d.customer.name}`)) : h('span', {}, 'Add a customer to save a card on file'));
      paintCardNote(); drawWho();
      const pay = [h('h2', { class: 'vt-h' }, 'Payment information'),
        h('div', { class: 'vt-card' },
          h('div', { class: 'vt-sec' }, h('div', { class: 'vt-custh' }, h('b', {}, 'Customer'), addCust), who),
          h('div', { class: 'vt-sec vt-cardf' },
            h('div', { class: 'vt-row2' }, fl('Card Number *', cardIn('number', { inputmode: 'numeric', autocomplete: 'cc-number' }), '12- to 19-digit card number'), fl('Card holder name', cardIn('holder', { autocomplete: 'cc-name', maxlength: 80 }))),
            h('div', { class: 'vt-row3' }, fl('Expiration *', cardIn('exp', { inputmode: 'numeric', autocomplete: 'cc-exp' }), 'MM/YYYY'), fl('CVV *', cardIn('cvv', { inputmode: 'numeric', autocomplete: 'cc-csc' }), '3-digit security code'), fl('Zip / Postal Code *', cardIn('zip', { autocomplete: 'postal-code', maxlength: 10 }))),
            fl('Card holder street address', cardIn('street', { autocomplete: 'street-address', maxlength: 127 }), 'Address must be 127 characters or less'),
            cardNote))];
      // Receipt delivery
      const emailBox = d.receipt === 'email' && h('div', { class: 'vt-sec', style: 'padding-top:0' }, fl('Email address', h('input', { type: 'email', value: d.email, placeholder: ' ', oninput: (e) => { d.email = e.target.value; } })));
      const receipt = [h('h2', { class: 'vt-h' }, 'Receipt delivery'),
        h('div', { class: 'vt-card' }, h('div', { class: 'vt-sec vt-radios' }, [['email', 'Email'], ['none', 'None']].map(([k, l]) => h('label', {}, h('input', { type: 'radio', name: 'vt-receipt', checked: d.receipt === k, onchange: () => { d.receipt = k; paintPanel(); } }), h('span', {}, l)))), emailBox)];
      const bar = h('div', { class: 'cl-bar vt-bar' }, h('div', { class: 'vt-bartotal' }, h('span', {}, 'Total'), (() => { const b = h('b', {}, '$0.00'); totalEls.push(b); return b; })()), h('span', { class: 'grow' }), btn);
      setTimeout(refresh);
      return [h('div', { class: 'vt' },
        h('h1', { class: 'vt-title' }, 'Virtual Terminal'), h('p', { class: 'vt-req' }, '* Required field'),
        typeBtn, detail, pay, receipt, bar)];
    },
    settings() {
      const links = (...items) => items.filter(([, k]) => known(k)).map(([t, k]) => h('a', { href: pathFor(k), onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); goTab(k); } }, t));
      const ICON = { Setup: 'settings', Profile: 'customers', 'About your business': 'business', Employees: 'team', 'Business operations': 'settings', Transactions: 'orders', Ecommerce: 'address', Inventory: 'menu', 'Customers and promotions': 'promo', Website: 'address' };
      // On a computer every card is open; on a phone each one folds open with its arrow.
      const card = (title, ...kids) => { const el = h('div', { class: 'set-card' }); const head = h('button', { type: 'button', class: 'set-head', 'aria-expanded': 'false', onclick: () => { const now = head.getAttribute('aria-expanded') !== 'true'; head.setAttribute('aria-expanded', String(now)); el.toggleAttribute('data-open', now); } }, navTile(ICON[title] || 'page', 32), h('span', {}, title), h('i', { class: 'fold-chev', 'aria-hidden': 'true' })); el.append(h('h3', {}, head), h('div', { class: 'set-body' }, h('div', {}, ...kids))); return el; };
      const u = state.user;
      // Same cards, order and names as the reference. Items with nothing behind them yet are shown greyed out, not linked.
      const L = (t, k) => (typeof k === 'function' ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); k(); } }, t) : k && known(k) ? h('a', { href: pathFor(k), onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); goTab(k); } }, t) : h('span', { class: 'set-off', 'aria-disabled': 'true' }, t));
      const box = (title, ...kids) => h('div', { class: 'set-card' }, h('h3', {}, h('span', { class: 'set-head' }, h('span', {}, title))), h('div', { class: 'set-body' }, h('div', {}, ...kids)));
      return [h('div', { class: 'set-grid set-clover' },
        box('Profile', h('p', {}, `${u.name || u.email}, ${roleName}`), h('p', {}, [u.phone, u.email].filter(Boolean).join(' | ')), h('p', { class: 'set-2fa' }, h('i', { class: u.twoFactor ? 'on' : '' }), 'Two-factor authentication is ', h('b', {}, u.twoFactor ? 'on' : 'off')), L('Edit your profile', 'profile')),
        box('Employees', L('Employee jobs', 'schedule'), L('Employee roles', 'team'), L('Employee permissions', 'team'), L('Device passcode', null)),
        box('About your business', L('Business information', 'bizinfo'), L('Merchants', 'sites'), L('Closeout settings', 'close')),
        box('Billing and statements', L('Monthly statements', 'r-exports'), L('Service plan', null)),
        box('Business operations', L('Notification preferences', 'alerts'), L('Online ordering', 'ordering'), L('Customer communication preferences', 'alerts'), L('Reporting', () => reportSettings()), L('Taxes and fees', 'ordering'), L('Additional charges', 'ordering'), L('Tips', 'tips'), L('Business hours', 'hours'), L('Devices and printers', 'devices'), L('Online booking', 'booking'), L('Appearance', 'appearance'), L('Accounting Sync', () => quickbooks()), L('API tokens', null), L('Cellular data', null), L('Inventory', 'items'), L('Enterprise Wi-Fi', null)),
        box('Transactions', L('Orders', 'orders'), L('Order receipts', 'alerts'), L('Order types', 'ordering'), L('Payments', 'tx'), L('Payment receipts', 'alerts'), L('Virtual Terminal', 'sale'), L('Invoices and estimates', 'invoices')),
        box('My sites', L('All my sites', 'sites'), L('Create another site', async () => { await flush(); go('/app/new'); }), state.user.admin && L('Staff dashboard', async () => { await flush(); go('/app/admin'); })),
        box('Website', L('Edit my website', () => goTab(lastTab.site)), L('Look and feel', 'design'), L('Home page', 'sections'), L('Web address', 'domain'), L('Policies', 'policies'), L('Search listing', 'seo'), meta.live && L('View my live site', () => window.open(meta.url, '_blank', 'noopener'))),
        box('Ecommerce', L('Ecommerce payments', null), L('Ecommerce API tokens', null), L('Hosted checkout', null), L('Custom fields', null), L('Payment links', 'business'), L('Fraud tools', null)))];
    },
    profile() {
      const u = state.user;
      const refresh = (user) => { state.user = { ...state.user, ...user }; paintPanel(); };
      const ask = (title, fields, send, note) => sheet((close) => {
        const err = h('p', { class: 'error', role: 'alert' });
        const form = h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); err.textContent = ''; try { await send(Object.fromEntries(new FormData(form))); close(); toast('Saved'); } catch (ex) { err.textContent = ex.message; } } },
          fields.map(([label, attrs]) => h('label', { class: 'field' }, h('span', {}, label), h('input', attrs))), null, err,
          h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn' }, 'Save')));
        return [h('h2', {}, title), form];
      });
      const card = (title, value, action, onclick, note) => h('div', { class: 'prof-card' }, h('div', {}, h('h3', {}, title), value && h('p', {}, value), null), h('button', { class: 'btn soft sm', type: 'button', onclick }, action));
      const twoStep = () => sheet((close) => {
        const err = h('p', { class: 'error', role: 'alert' }), qr = h('div', { class: 'qr-box' }, skel(1)), key = h('code', { class: 'totp-key' }, '…');
        api('POST', '/api/me/2fa/setup').then((r) => { key.textContent = r.secret.replace(/(.{4})/g, '$1 ').trim(); qrCanvas(r.uri).then((c) => qr.replaceChildren(c)).catch(() => qr.replaceChildren(h('p', { class: 'hint' }, 'Type the key below into your authenticator app instead.'))); }).catch((ex) => { err.textContent = ex.message; });
        const form = h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); err.textContent = ''; try { refresh((await api('POST', '/api/me/2fa/enable', Object.fromEntries(new FormData(form)))).user); close(); toast('Two-step sign-in is on'); } catch (ex) { err.textContent = ex.message; } } },
          h('ol', { class: 'steps-list' }, h('li', {}, 'Open an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password.'), h('li', {}, 'Scan this code, or type the key underneath it.'), h('li', {}, 'Enter the 6-digit code the app shows.')),
          qr, h('p', { class: 'center' }, key),
          h('label', { class: 'field' }, h('span', {}, '6-digit code'), h('input', { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 8, required: true, placeholder: '123 456' })), err,
          h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn' }, 'Turn on')));
        return [h('h2', {}, 'Turn on two-step sign-in'), null, form];
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
        : emptyState('phone', 'No devices yet', ''), pushIsOn !== true && here,
        null)];
    },
    appts(asCalendar = false) {
      const tabNow = asCalendar ? 'calendar' : 'appts';
      const b = ordering.booking;
      const add = (pre = {}) => formSheet('Add appointment', [['serviceName', 'What for', { maxlength: 80, placeholder: b.services[0]?.name || 'e.g. Table for dinner' }], ['date', 'Date', { type: 'date' }], ['time', 'Time', { type: 'time' }], ['name', 'Customer name', { maxlength: 120 }], ['phone', 'Phone', { type: 'tel' }], ['party', 'Number of people', { type: 'number', min: 1 }], ['notes', 'Notes', { maxlength: 500 }]],
        { serviceName: b.services[0]?.name || '', date: apptData?.today || new Date().toISOString().slice(0, 10), time: '18:00', name: '', phone: '', party: '2', notes: '', ...pre }, async (v) => { await api('POST', `/api/sites/${id}/appointments`, v); await reload('appts'); });
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, asCalendar ? 'Calendar' : 'Appointments')),
        h('div', { class: 'row' }, !b.enabled && h('button', { class: 'btn soft', onclick: () => goTab('booking') }, 'Set up online booking'), h('button', { class: 'btn', onclick: () => add() }, ic('plus', 16), 'Add appointment')));
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
        if (!calDate) calDate = today;
        const live = all.filter((a) => a.status !== 'cancelled');
        const on = (d) => live.filter((a) => a.at.slice(0, 10) === d);
        const mins = (a) => { const [hh, mm] = a.at.slice(11, 16).split(':').map(Number); return hh * 60 + mm; };
        const len = (a) => Math.max(30, a.minutes || 60);
        const short2 = (a) => clock(a.at).replace(':00', '').replace(' ', '').toLowerCase();
        const open = (a) => sheet((close) => [h('h2', {}, a.name), h('p', { class: 'muted' }, `${dayName(a.at.slice(0, 10))} · ${clock(a.at)}${a.minutes ? ` · ${a.minutes} min` : ''}`),
          h('div', { class: 'stack', style: 'gap:8px' }, h('div', {}, h('span', { class: `status ${NAME[a.status][1]}` }, NAME[a.status][0])), h('div', {}, h('b', {}, 'What for: '), a.service || 'Booking'), h('div', {}, h('b', {}, 'People: '), String(a.party)),
            a.phone && h('div', {}, h('b', {}, 'Phone: '), h('a', { href: `tel:${a.phone.replace(/[^\d+]/g, '')}` }, a.phone)), a.email && h('div', {}, h('b', {}, 'Email: '), h('a', { href: `mailto:${a.email}` }, a.email)), a.notes && h('div', {}, h('b', {}, 'Notes: '), a.notes)),
          h('div', { class: 'acts' }, h('div', { onclick: (e) => { if (e.target.closest('button')) close(); } }, acts(a)), h('button', { class: 'btn soft', onclick: close }, 'Close'))]);
        const week = (() => { const wd = (new Date(`${calDate}T12:00:00Z`).getUTCDay() + 6) % 7; return Array.from({ length: 7 }, (_, i) => addDays(calDate, i - wd)); })();
        const DAYS = calView === 'week' ? week : [calDate];
        const inView = calView === 'month' ? live.filter((a) => a.at.slice(0, 7) === calDate.slice(0, 7)) : DAYS.flatMap(on);
        const title = calView === 'month' ? monthName(calDate.slice(0, 7)) : calView === 'week' ? `${longDay(week[0], { month: 'short', day: 'numeric' })} – ${longDay(week[6], { month: 'short', day: 'numeric', year: 'numeric' })}` : longDay(calDate);
        const move = (n) => { if (calView === 'month') calDate = new Date(Date.UTC(Number(calDate.slice(0, 4)), Number(calDate.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 10); else calDate = addDays(calDate, n * (calView === 'week' ? 7 : 1)); paintPanel(); };
        const titleBtn = h('button', { type: 'button', class: 'c2-title', 'aria-haspopup': 'dialog', title: 'Pick a date', onclick: () => popover(titleBtn, (close) => h('div', { class: 'dpop one' }, monthPicker(calDate.slice(0, 7), (d) => { calDate = d; close(); paintPanel(); }, () => ({ from: calDate, to: calDate }))), 'left') }, title, h('span', { class: 'chv d', 'aria-hidden': 'true' }));
        const bar = h('div', { class: 'c2-bar' },
          h('div', { class: 'c2-nav' },
            h('button', { type: 'button', class: 'c2-today', disabled: calDate === today && calView !== 'month', onclick: () => { calDate = today; paintPanel(); } }, 'Today'),
            h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Previous', onclick: () => move(-1) }, chev('l')),
            h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Next', onclick: () => move(1) }, chev('r')),
            titleBtn),
          h('div', { class: 'c2-right' },
            h('span', { class: 'c2-count' }, inView.length ? `${inView.length} booked` : 'Nothing booked'),
            h('div', { class: 'c2-seg', role: 'group', 'aria-label': 'View' }, [['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(calView === k), onclick: () => { calView = k; paintPanel(); } }, l))),
            h('button', { type: 'button', class: 'c2-add', title: 'Add appointment', 'aria-label': 'Add appointment', onclick: () => add({ date: calDate }) }, ic('plus', 20))));
        const meta2 = (a) => [clock(a.at), a.service || 'Booking', a.party > 1 ? `${a.party} people` : ''].filter(Boolean).join(' · ');
        if (calView === 'month') {
          const ym = calDate.slice(0, 7), [y, m] = ym.split('-').map(Number);
          const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7, start = addDays(`${ym}-01`, -lead);
          const cells = Array.from({ length: Math.ceil((lead + new Date(Date.UTC(y, m, 0)).getUTCDate()) / 7) * 7 }, (_, i) => addDays(start, i));
          return [h('div', { class: 'inv' }, head, h('div', { class: 'scard c2' }, bar,
            h('div', { class: 'c2-month' }, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => h('span', { class: `c2-wd${i > 4 ? ' we' : ''}` }, d)),
              cells.map((d, i) => { const list = on(d).sort((a, b) => mins(a) - mins(b)); return h('div', { class: `c2-cell${i % 7 > 4 ? ' we' : ''}`, role: 'button', tabindex: '0', 'aria-label': `${dayName(d)}, ${list.length} booked`, 'data-out': d.slice(0, 7) !== ym ? '1' : null, 'data-today': d === today ? '1' : null, 'data-past': d < today ? '1' : null,
                onclick: (e) => { if (e.target.closest('.c2-pill')) return; calDate = d; calView = 'day'; paintPanel(); }, onkeydown: (e) => { if (e.key === 'Enter') { calDate = d; calView = 'day'; paintPanel(); } } },
                h('span', { class: 'c2-num' }, String(Number(d.slice(8)))),
                h('div', { class: 'c2-pills' }, list.slice(0, 3).map((a) => h('button', { type: 'button', class: `c2-pill ${a.status}`, title: `${a.name} · ${meta2(a)}`, onclick: () => open(a) }, h('i'), h('b', {}, short2(a)), h('span', {}, a.name))), list.length > 3 && h('small', { class: 'c2-more' }, `+${list.length - 3} more`))); }))))];
        }
        // Day and week: the whole day, scrolled to the morning or the current time; closed hours shaded from Business hours.
        const HOUR = 52, hrs = Array.from({ length: 24 }, (_, i) => i);
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        const at = (d, m) => add({ date: d, time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` });
        const toMin = (t) => { const [hh, mm] = String(t || '0:0').split(':').map(Number); return hh * 60 + (mm || 0); };
        const closedBands = (d) => {
          const x = ordering.hours && ordering.hours[new Date(`${d}T12:00:00Z`).getUTCDay()];
          if (!x) return [];
          if (x.closed) return [[0, 1440]];
          const o = toMin(x.open), c = toMin(x.close);
          return c > o ? [[0, o], [c, 1440]].filter(([a, b]) => b > a) : [[c, o]].filter(([a, b]) => b > a);   // closing after midnight
        };
        const col = (d) => {
          // Side by side only where bookings actually overlap; everything else keeps the full width.
          const placed = []; let group = [], ends = [], groupEnd = -1;
          const flush = () => { for (const g of group) g.push(ends.length); group = []; ends = []; };
          for (const a of on(d).sort((x, y) => mins(x) - mins(y))) {
            if (mins(a) >= groupEnd) { flush(); groupEnd = -1; }
            let l = ends.findIndex((e) => e <= mins(a)); if (l < 0) l = ends.length; ends[l] = mins(a) + len(a);
            const row = [a, l]; group.push(row); placed.push(row); groupEnd = Math.max(groupEnd, mins(a) + len(a));
          }
          flush();
          return h('div', { class: 'c2-col', style: `height:${24 * HOUR}px`, 'data-today': d === today ? '1' : null, 'data-past': d < today ? '1' : null, title: 'Press an empty time to book it',
            onclick: (e) => { if (e.target.closest('.c2-ev')) return; const r = e.currentTarget.getBoundingClientRect(); at(d, Math.max(0, Math.min(1410, Math.floor(((e.clientY - r.top) / HOUR) * 2) * 30))); } },
            closedBands(d).map(([a, b]) => h('i', { class: 'c2-off', style: `top:${(a / 60) * HOUR}px;height:${((b - a) / 60) * HOUR}px` })),
            d === today && h('i', { class: 'c2-now', style: `top:${(nowMin / 60) * HOUR}px` }),
            placed.map(([a, l, n]) => { const tall = (len(a) / 60) * HOUR - 4; return h('button', { type: 'button', class: `c2-ev ${a.status}${tall < 44 ? ' thin' : ''}`, title: `${a.name} · ${meta2(a)}`, style: `top:${(mins(a) / 60) * HOUR + 2}px;height:${Math.max(22, tall)}px;left:calc(${(l / n) * 100}% + 4px);width:calc(${100 / n}% - 8px)`, onclick: () => open(a) },
              h('b', {}, a.name), h('small', {}, meta2(a))); }));
        };
        const body = h('div', { class: 'c2-body' },
          h('div', { class: 'c2-gut', style: `height:${24 * HOUR}px` }, hrs.slice(1).map((x) => h('span', { style: `top:${x * HOUR}px` }, `${x % 12 || 12} ${x < 12 ? 'AM' : 'PM'}`)),
            DAYS.includes(today) && h('span', { class: 'c2-nowlab', style: `top:${(nowMin / 60) * HOUR}px` }, clock(`0000-00-00T${String(Math.floor(nowMin / 60)).padStart(2, '0')}:${String(nowMin % 60).padStart(2, '0')}`))),
          DAYS.map(col));
        // Open on the first booking, the current time, or 8 in the morning, whichever comes first in view.
        const firstAt = Math.min(...inView.map(mins), DAYS.includes(today) ? nowMin : 1440, 8 * 60);
        requestAnimationFrame(() => { body.scrollTop = Math.max(0, Math.floor(firstAt / 60 - 1) * HOUR - 12); });
        return [h('div', { class: 'inv' }, head, h('div', { class: 'scard c2' }, bar,
          h('div', { class: 'c2-grid', style: `--cols:${DAYS.length}` },
            h('div', { class: 'c2-head' }, h('span', { class: 'c2-tz' }, calView === 'week' ? `Week ${Math.ceil(((Date.parse(`${week[3]}T12:00:00Z`) - Date.UTC(Number(week[3].slice(0, 4)), 0, 1)) / 86400000 + 1) / 7)}` : ''),
              DAYS.map((d) => h('button', { type: 'button', class: 'c2-day', 'data-today': d === today ? '1' : null, 'data-past': d < today ? '1' : null, onclick: () => { calDate = d; calView = 'day'; paintPanel(); } }, h('small', {}, longDay(d, { weekday: 'short' })), h('b', {}, String(Number(d.slice(8))))))),
            body),
          !inView.length && null))];
      }
      const pending = all.filter((a) => a.status === 'pending'), todays = all.filter((a) => a.at.slice(0, 10) === today && a.status !== 'cancelled').sort((x, y) => (x.at < y.at ? -1 : 1));
      const later = upcoming.filter((a) => a.at.slice(0, 10) > today && a.status === 'confirmed').slice(0, 10);
      const nowHM = `${today}T${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
      const next = todays.find((a) => a.at >= nowHM && a.status === 'confirmed');
      const acts2 = (a) => moreBtn([a.status === 'pending' && ['Confirm', () => setStatus(a, 'confirmed')], a.status === 'pending' && ['Decline', () => setStatus(a, 'cancelled'), true], a.status === 'confirmed' && ['Complete', () => setStatus(a, 'completed')], a.status === 'confirmed' && ['No-show', () => setStatus(a, 'noshow')], a.status === 'confirmed' && ['Cancel', () => setStatus(a, 'cancelled'), true]]);
      const aRow = (a, withDay) => h('div', { class: 'ap-row' }, h('div', { class: 'ap-t' }, h('b', {}, clock(a.at)), withDay && h('small', {}, longDay(a.at.slice(0, 10), { weekday: 'short', month: 'short', day: 'numeric' }))),
        h('div', { class: 'ap-who' }, h('b', {}, a.name), h('small', {}, [a.service, `${a.party} ${a.party === 1 ? 'person' : 'people'}`, a.phone].filter(Boolean).join(' · '))),
        h('span', { class: `status ${NAME[a.status][1]}` }, NAME[a.status][0]), a.status === 'pending' ? h('button', { class: 'btn sm', onclick: () => setStatus(a, 'confirmed') }, 'Confirm') : null, ['pending', 'confirmed'].includes(a.status) ? acts2(a) : h('span'));
      const card = (title, count, list, empty, withDay) => h('div', { class: 'scard ap-card' }, h('div', { class: 'ap-h' }, h('h3', {}, title), count != null && h('span', { class: 'ap-n' }, String(count))),
        list.length ? h('div', { class: 'ap-list' }, list.map((a) => aRow(a, withDay))) : h('p', { class: 'ap-empty' }, empty));
      return [h('div', { class: 'inv' }, head,
        h('div', { class: 'inv-kpis' }, kpi('Today', todays.length, next ? `next at ${clock(next.at)}` : 'nothing else today'), kpi('Waiting for you', pending.length, pending.length ? 'to confirm' : 'all answered'), kpi('Coming up', later.length, 'confirmed'), kpi('Completed', n('completed'), `${n('noshow')} no-show`)),
        pending.length > 0 && card('Waiting for you', pending.length, pending, '', true),
        h('div', { class: 'ap-two' }, card('Today', todays.length, todays, 'Nothing booked today.'), card('Coming up', later.length, later, 'No confirmed bookings after today.', true)),
        h('button', { class: 'btn soft', style: 'justify-self:start', onclick: () => goTab('calendar') }, ic('calendar', 16), 'Open calendar'))];
    },
    booking() {
      const b = ordering.booking;
      const sv = debounce(async () => { try { await putOrdering(); } catch (e) { toast(e.message, true); } }, 450);
      const inp = (label, value, on, a = {}, hint) => h('label', { class: 'field' }, h('span', {}, label), h('input', { value, oninput: (e) => { on(e.target.value); sv(); }, ...a }), null);
      const url = `${meta.url.replace(/\/$/, '')}/book`;
      return [
        group('Booking page', h('label', { class: 'switch' }, h('span', {}, 'Take booking requests on my website'), h('input', { type: 'checkbox', checked: b.enabled, onchange: async (e) => { b.enabled = e.target.checked; try { await putOrdering(); } catch (ex) { toast(ex.message, true); } paintPanel(); } }), h('i')),
          b.enabled && !b.services.length && note('Add at least one thing to book.'),
          b.enabled && b.services.length > 0 && h('div', { class: 'note', style: 'overflow-wrap:anywhere' }, h('b', {}, 'Your booking page: '), meta.live ? h('a', { href: url, target: '_blank', rel: 'noopener' }, url.replace(/^https?:\/\//, '')) : 'publish your site to make it public.', h('div', { class: 'small', style: 'margin-top:6px' }, 'To link to it from your site, set any button’s link to /book under Website.')),
          inp('Page heading', b.title, (v) => { b.title = v; }, { maxlength: 60 }), inp('Short message', b.note, (v) => { b.note = v; }, { maxlength: 300, placeholder: 'e.g. We hold tables for 15 minutes.' }),
          inp('Bookings allowed at the same time', b.perSlot, (v) => { b.perSlot = Math.max(1, Math.round(Number(v)) || 1); }, { type: 'number', min: 1, max: 200, style: 'max-width:160px' }, 'Once a time has this many bookings, customers are asked to choose another.')),
        group('What customers can book', h('div', { class: 'stack' }, b.services.map((x, i) => h('div', { class: 'zrow svc' }, h('input', { value: x.name, placeholder: 'e.g. Table for dinner', 'aria-label': 'Name', maxlength: 80, oninput: (e) => { x.name = e.target.value; sv(); } }), h('input', { type: 'number', min: 0, value: x.minutes, 'aria-label': 'Minutes', title: 'Minutes', oninput: (e) => { x.minutes = Math.max(0, Math.round(Number(e.target.value)) || 0); sv(); } }), h('input', { value: (x.price / 100).toFixed(2), inputmode: 'decimal', 'aria-label': 'Price', title: 'Price (0 for free)', oninput: (e) => { const c = parsePrice(e.target.value || '0'); if (c !== null) { x.price = c; sv(); } } }),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove', onclick: async () => { b.services.splice(i, 1); try { await putOrdering(); } catch (ex) { toast(ex.message, true); } paintPanel(); } }, ic('trash', 16))))),
          h('button', { type: 'button', class: 'btn soft sm', style: 'justify-self:start', onclick: () => { b.services.push({ id: uid('s'), name: b.services.length ? '' : 'Table booking', minutes: 60, price: 0 }); sv(); paintPanel(); } }, ic('plus', 14), 'Add something to book'),
          null),
      ];
    },
    schedule() {
      if (!shiftData) { api('GET', `/api/sites/${id}/shifts`).then((r) => { shiftData = r; if (tab === 'schedule') paintPanel(); }).catch((e) => { toast(e.message, true); shiftData = { today: isoDay(new Date()), people: [], shifts: [] }; if (tab === 'schedule') paintPanel(); }); return [h('div', { class: 'inv' }, skel(1, 'chart'))]; }
      const { today, shifts } = shiftData;
      if (!schedWeek) schedWeek = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
      const days = Array.from({ length: 7 }, (_, i) => addDays(schedWeek, i));
      const t12 = (t) => { const [hh, mm] = t.split(':').map(Number); return `${hh % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${hh < 12 ? 'a' : 'p'}`; };
      const hrs = (x) => { const m = (Number(x.finish.slice(0, 2)) * 60 + Number(x.finish.slice(3))) - (Number(x.start.slice(0, 2)) * 60 + Number(x.start.slice(3))); return (m <= 0 ? m + 1440 : m) / 60; };
      const week = shifts.filter((x) => days.includes(x.day));
      const people = [...new Set([...shiftData.people, ...week.map((x) => x.name)])];
      const reloadShifts = async () => { shiftData = await api('GET', `/api/sites/${id}/shifts`); paintPanel(); };
      // Adding or removing a shift happens in a small box beside the cell, not a window.
      const cellPop = (cell, name, day, x) => popover(cell, (close) => {
        const st = h('input', { type: 'time', value: x ? x.start : '', 'aria-label': 'Starts' }), en = h('input', { type: 'time', value: x ? x.finish : '', 'aria-label': 'Ends' }), note = h('input', { placeholder: 'Note', 'aria-label': 'Note', maxlength: 120, value: x ? x.note || '' : '' });
        const save = async () => { if (!st.value || !en.value) return toast('Enter a start and end time.', true); try { if (x) await api('DELETE', `/api/sites/${id}/shifts/${x.id}`); await api('POST', `/api/sites/${id}/shifts`, { name, day, start: st.value, finish: en.value, note: note.value }); close(); await reloadShifts(); } catch (e) { toast(e.message, true); } };
        return h('div', { class: 'sh-pop' }, h('b', {}, `${name} · ${longDay(day, { weekday: 'short', month: 'short', day: 'numeric' })}`), h('div', { class: 'sh-times' }, st, h('span', {}, 'to'), en), note,
          h('div', { class: 'inline-acts' }, x && h('button', { type: 'button', class: 'btn text sm', style: 'color:var(--red);margin-right:auto', onclick: async () => { try { await api('DELETE', `/api/sites/${id}/shifts/${x.id}`); close(); await reloadShifts(); } catch (e) { toast(e.message, true); } } }, 'Remove'), h('button', { type: 'button', class: 'btn soft sm', onclick: close }, 'Cancel'), h('button', { type: 'button', class: 'btn sm', onclick: save }, x ? 'Save' : 'Add shift')));
      }, 'left');
      const nameIn = h('input', { placeholder: 'Add a person to the roster', 'aria-label': 'Add a person', maxlength: 80, onkeydown: (e) => { if (e.key === 'Enter' && nameIn.value.trim()) { shiftData.people = [...shiftData.people, nameIn.value.trim()]; paintPanel(); } } });
      const total = week.reduce((a, x) => a + hrs(x), 0);
      return [h('div', { class: 'inv' },
        h('div', { class: 'scard sh' },
          h('div', { class: 'c2-bar' }, h('div', { class: 'c2-nav' },
            h('button', { type: 'button', class: 'c2-today', disabled: days.includes(today), onclick: () => { schedWeek = ''; paintPanel(); } }, 'This week'),
            h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Previous week', onclick: () => { schedWeek = addDays(schedWeek, -7); paintPanel(); } }, chev('l')),
            h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Next week', onclick: () => { schedWeek = addDays(schedWeek, 7); paintPanel(); } }, chev('r')),
            h('span', { class: 'c2-title', style: 'cursor:default' }, `${longDay(days[0], { month: 'short', day: 'numeric' })} – ${longDay(days[6], { month: 'short', day: 'numeric', year: 'numeric' })}`)),
            h('div', { class: 'c2-right' }, h('span', { class: 'c2-count' }, `${week.length} shift${week.length === 1 ? '' : 's'} · ${total.toFixed(1)} hours`))),
          h('div', { class: 'sh-grid', role: 'table' },
            h('div', { class: 'sh-row sh-headrow', role: 'row' }, h('span', { class: 'sh-who' }, 'Team'), days.map((d) => h('span', { class: 'sh-dh', 'data-today': d === today ? '1' : null }, h('small', {}, longDay(d, { weekday: 'short' })), h('b', {}, String(Number(d.slice(8)))))), h('span', { class: 'sh-tot' }, 'Hours')),
            people.map((name) => { const mine = week.filter((x) => x.name === name); return h('div', { class: 'sh-row', role: 'row' }, h('span', { class: 'sh-who' }, h('i', { class: 'sh-av' }, name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()), h('b', {}, name)),
              days.map((d) => { const xs = mine.filter((x) => x.day === d); const cell = h('div', { class: 'sh-cell', 'data-today': d === today ? '1' : null, 'data-past': d < today ? '1' : null });
                cell.append(...xs.map((x) => h('button', { type: 'button', class: 'sh-chip', title: x.note || '', onclick: (e) => { e.stopPropagation(); cellPop(e.currentTarget, name, d, x); } }, `${t12(x.start)}–${t12(x.finish)}`)), h('button', { type: 'button', class: 'sh-add', 'aria-label': `Add a shift for ${name} on ${longDay(d)}`, onclick: (e) => cellPop(e.currentTarget, name, d, null) }, ic('plus', 14)));
                return cell; }),
              h('span', { class: 'sh-tot' }, mine.reduce((a, x) => a + hrs(x), 0).toFixed(1))); }),
            h('div', { class: 'sh-row sh-newrow' }, h('label', { class: 'sh-who' }, ic('plus', 16), nameIn)))))];
    },
    timesheets() {
      if (!clockData) { api('GET', `/api/sites/${id}/timeclock`).then((r) => { clockData = r; if (tab === 'timesheets') paintPanel(); }).catch((e) => { toast(e.message, true); clockData = { entries: [], mine: null }; if (tab === 'timesheets') paintPanel(); }); return [h('div', { class: 'inv' }, h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(5, 'row'))]; }
      const { entries } = clockData;
      const hrs = (x) => ((x.outAt || Date.now()) - x.inAt) / 3600000;
      const weekAgo = Date.now() - 7 * 86400000, week = entries.filter((x) => x.inAt > weekAgo);
      const per = new Map(); for (const x of week) per.set(x.name, (per.get(x.name) || 0) + hrs(x));
      const local = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${isoDay(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
      const when = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const kpi = (label, value, sub) => h('div', { class: 'kpi big' }, h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      const editRow = (x) => { const nm = h('input', { value: x ? x.name : '', placeholder: 'Name', 'aria-label': 'Name', maxlength: 80, list: 'pf-staff' }), i1 = h('input', { type: 'datetime-local', value: local(x ? x.inAt : Date.now() - 8 * 3600000), 'aria-label': 'Clocked in' }), o1 = h('input', { type: 'datetime-local', value: local(x ? x.outAt : Date.now()), 'aria-label': 'Clocked out' });
        const save = async () => { if (!nm.value.trim()) return toast('Enter a name.', true); if (!i1.value) return toast('Enter when they clocked in.', true); try { const body = { name: nm.value, inAt: Date.parse(i1.value), outAt: o1.value ? Date.parse(o1.value) : null }; clockData = x ? await api('PUT', `/api/sites/${id}/timeclock/${x.id}`, body) : await api('POST', `/api/sites/${id}/timeclock/entries`, body); tsEdit = ''; tsAdding = false; toast('Saved'); paintPanel(); } catch (e) { toast(e.message, true); } };
        return h('tr', { class: 'inline-tr' }, h('td', {}, nm), h('td', {}, i1), h('td', {}, o1), h('td', {}, ''), h('td', { style: 'text-align:right;white-space:nowrap' }, h('button', { class: 'btn soft sm', onclick: () => { tsEdit = ''; tsAdding = false; paintPanel(); } }, 'Cancel'), ' ', h('button', { class: 'btn sm', onclick: save }, 'Save'))); };
      return [h('div', { class: 'inv' },
        h('datalist', { id: 'pf-staff' }, [...new Set(entries.map((x) => x.name))].map((n) => h('option', { value: n }))),
        h('div', { class: 'inv-kpis' }, kpi('On the clock now', entries.filter((x) => !x.outAt).length, 'people'), kpi('Hours, last 7 days', week.reduce((a, x) => a + hrs(x), 0).toFixed(1), 'everyone'), kpi('People', per.size, 'this week'), kpi('Entries', week.length, 'this week')),
        per.size > 0 && h('div', { class: 'scard', style: 'padding:18px 24px' }, h('h3', {}, 'Hours by person, last 7 days'), [...per].sort((a2, b2) => b2[1] - a2[1]).map(([name, v]) => h('div', { class: 'rline' }, h('span', { style: 'color:var(--ink)' }, name), h('b', {}, `${v.toFixed(2)} hours`)))),
        h('div', { class: 'tbar' }, h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => { tsAdding = true; tsEdit = ''; paintPanel(); } }, ic('plus', 16), 'Add time')),
        h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Name', 'Clocked in', 'Clocked out', 'Hours', ''].map((x) => h('th', {}, x)))),
          h('tbody', {}, tsAdding && editRow(null), entries.slice(0, 300).map((x) => (tsEdit === x.id ? editRow(x) : h('tr', {}, h('td', {}, h('b', {}, x.name)), h('td', {}, when(x.inAt)), h('td', {}, x.outAt ? when(x.outAt) : h('span', { class: 'status ok' }, 'Working now')), h('td', {}, hrs(x).toFixed(2)),
            h('td', { style: 'text-align:right;white-space:nowrap' }, h('button', { class: 'btn text sm', onclick: () => { tsEdit = x.id; tsAdding = false; paintPanel(); } }, 'Edit'), h('button', { class: 'btn text sm', style: 'color:var(--red)', onclick: async () => { if (!await confirmSheet({ title: 'Delete this entry?', text: `${x.name}, ${when(x.inAt)}`, action: 'Delete', danger: true })) return; try { clockData = await api('DELETE', `/api/sites/${id}/timeclock/${x.id}`); paintPanel(); } catch (e) { toast(e.message, true); } } }, 'Delete')))))),
            !entries.length && !tsAdding && h('tr', {}, h('td', { colspan: 5, class: 'muted', style: 'text-align:center;padding:28px' }, 'No time recorded yet.'))))))];
    },
    tx() {
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Transactions'), null), h('div', { class: 'row' }, h('button', { class: 'btn soft', onclick: () => window.print() }, ic('print', 16), 'Print')));
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
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Cash log'), null));
      if (!cashData) { api('GET', `/api/sites/${id}/cash?${rq()}`).then((r) => { cashData = r; if (tab === 'cash') paintPanel(); }).catch((e) => { toast(e.message, true); cashData = { entries: [], totals: { cashSales: 0, cashRefunds: 0, paidIn: 0, paidOut: 0, expected: 0 } }; if (tab === 'cash') paintPanel(); }); return [h('div', { class: 'inv' }, head, rangeBar(), h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(4, 'row'))]; }
      if (cashData.range && cashData.range !== rq().get('range')) reload('cash', true);
      const d = cashData, t = d.totals;
      const kpi = (label, value, sub) => h('div', { class: 'kpi big' }, h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      return [h('div', { class: 'inv' }, head, rangeBar(),
        h('div', { class: 'inv-kpis' }, kpi('Cash sales', money(t.cashSales), t.cashRefunds ? `${money(t.cashRefunds)} refunded in cash` : 'orders paid in cash'), kpi('Cash refunds', money(t.cashRefunds), 'given back in cash'), kpi('Expected in drawer', money(t.expected), 'for this period')),
        d.entries.length ? h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Time', 'Type', 'Amount', 'What for', 'By', 'Action'].map((x) => h('th', {}, x)))),
          h('tbody', {}, d.entries.map((x) => h('tr', {}, h('td', {}, `${d.from === d.to ? '' : `${x.date} `}${x.time}`), h('td', {}, h('span', { class: `status ${x.kind === 'in' ? 'ok' : 'warn'}` }, x.kind === 'in' ? 'Cash in' : 'Cash out')), h('td', {}, h('b', {}, money(x.amount))), h('td', {}, x.note || '—'), h('td', { class: 'muted' }, x.by), h('td', {}, h('button', { class: 'btn text sm', style: 'color:var(--red)', onclick: async () => { if (!await confirmSheet({ title: 'Delete this entry?', text: 'It is removed from the cash log.', action: 'Delete', danger: true })) return; try { await api('DELETE', `/api/sites/${id}/cash/${x.id}`); await reload('cash'); paintPanel(); } catch (e) { toast(e.message, true); } } }, 'Delete'))))))))
          : h('div', { class: 'inv-list' }, emptyState('cash', 'No cash entries in this period', 'Log your opening float, bank deposits and anything else that goes in or out of the drawer.')))];
    },
    close() {
      const head = h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Closeout'), null));
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
      return [h('div', { class: 'inv' }, h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, 'Exports'), null)),
        h('div', { class: 'scard', style: 'padding:8px 24px' }, list.map(([label, hint2, fn]) => h('div', { class: 'rline', style: 'align-items:center;padding:14px 0' }, h('span', {}, h('b', { style: 'color:var(--ink);font-weight:500;display:block' }, label), hint2), h('button', { class: 'btn soft sm', onclick: () => grab(label, fn) }, ic('dl', 14), 'Download')))))];
    },

    rewardsDash() {
      if (!PANELS._rw) { PANELS._rw = 'loading'; api('GET', `/api/sites/${id}/rewards`).then((r) => { PANELS._rw = r.rewards; if (tab === 'rewards') paintPanel(); }).catch(() => { PANELS._rw = []; if (tab === 'rewards') paintPanel(); }); }
      const list = Array.isArray(PANELS._rw) ? PANELS._rw : [];
      const used = list.filter((r) => r.usedOrder), given = used.reduce((a, r) => a + r.discount, 0);
      const kpi = (label, value, sub) => h('div', { class: 'kpi big' }, h('span', { class: 'small muted' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub));
      const today = isoDay(new Date()), days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
      const by = (pick) => days.map((d) => list.filter((r) => pick(r) && isoDay(new Date(pick(r))) === d).length);
      const earned = by((r) => r.createdAt), redeemed = by((r) => r.usedAt);
      const top = Math.max(4, ...earned, ...redeemed); const every = 5;
      const L = ordering.loyalty || {};
      const chart = h('div', { class: 'chart g2 rw-chart' },
        h('div', { class: 'chart-y', 'aria-hidden': 'true' }, [4, 3, 2, 1, 0].map((i) => h('span', { style: `bottom:${i * 25}%` }, String(Math.round((top * i) / 4))))),
        h('div', { class: 'chart-plot' }, [1, 2, 3, 4].map((i) => h('i', { class: 'gl', style: `bottom:${i * 25}%` })),
          h('div', { class: 'rw-bars' }, days.map((d, i) => h('div', { class: 'rw-day', title: `${longDay(d, { month: 'short', day: 'numeric' })}: ${earned[i]} earned, ${redeemed[i]} used` }, h('i', { class: 'e', style: `height:${(earned[i] / top) * 100}%` }), h('i', { class: 'u', style: `height:${(redeemed[i] / top) * 100}%` }))))),
        h('span'), h('div', { class: 'chart-x' }, days.map((d, i) => h('span', { 'data-k': i % every === 0 && (i / every) % 2 ? '1' : null }, i % every === 0 ? longDay(d, { month: 'short', day: 'numeric' }) : ''))));
      return [h('div', { class: 'inv' },
        h('div', { class: 'inv-kpis' }, kpi('Rewards earned', list.length, 'all time'), kpi('Rewards used', used.length, list.length ? `${Math.round((used.length / list.length) * 100)}% used` : 'none yet'), kpi('Discount given', money(given), 'on reward orders'), kpi('Reward', L.enabled ? (L.type === 'percent' ? `${L.value}% off` : `${money(L.value)} off`) : 'Off', L.enabled ? `every ${L.every} orders` : 'switched off')),
        h('div', { class: 'scard hcard' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', { class: 'hc-h' }, 'Last 30 days'), h('div', { class: 'hl-key' }, h('span', {}, h('i', { class: 'k-now' }), 'Earned'), h('span', {}, h('i', { class: 'k-used' }), 'Used'))), chart),
        h('div', { class: 'scard' }, h('h3', {}, 'Reward codes'), list.length ? h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Code', 'Customer', 'Earned', 'Reward', 'Status'].map((x) => h('th', {}, x)))),
          h('tbody', {}, list.slice(0, 200).map((r) => h('tr', {}, h('td', {}, h('b', {}, r.code)), h('td', {}, r.email), h('td', {}, longDay(isoDay(new Date(r.createdAt)), { month: 'short', day: 'numeric', year: 'numeric' })), h('td', {}, r.type === 'percent' ? `${r.value}% off` : `${money(r.value)} off`), h('td', {}, h('span', { class: `status ${r.usedOrder ? 'ok' : ''}` }, r.usedOrder ? `Used · ${money(r.discount)}` : 'Not used yet'))))))) : h('p', { class: 'muted', style: 'padding:6px 0 4px' }, 'No rewards earned yet.')),
        PANELS.ordering('rewards'))];
    },
    sites() {
      if (!sitesData) { api('GET', '/api/sites').then((r) => { sitesData = r.sites; if (tab === 'sites') paintPanel(); }).catch((e) => { toast(e.message, true); sitesData = []; }); return [h('div', { class: 'inv' }, skel(3, 'row'))]; }
      const open = async (s2) => { await flush(); go(s2.role === 'kitchen' ? `/app/site/${s2.id}/kitchen` : `/app/site/${s2.id}`); };
      return [h('div', { class: 'inv' },
        h('div', { class: 'tbar' }, h('span', { class: 'grow' }), state.user.admin && h('button', { class: 'btn soft', onclick: async () => { await flush(); go('/app/admin'); } }, 'Staff dashboard'), h('button', { class: 'btn', onclick: async () => { await flush(); go('/app/new'); } }, ic('plus', 16), 'Create another site')),
        h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Site', 'Web address', 'Status', ''].map((x) => h('th', {}, x)))),
          h('tbody', {}, sitesData.map((s2) => h('tr', { class: 'click', onclick: (e) => { if (e.target.closest('a, button')) return; open(s2); } },
            h('td', {}, h('b', {}, s2.name), s2.id === id && h('span', { class: 'tag', style: 'margin-left:8px' }, 'Open now')),
            h('td', {}, s2.live ? h('a', { href: s2.url, target: '_blank', rel: 'noopener' }, s2.url.replace(/^https?:\/\//, '').replace(/\/$/, '')) : '—'),
            h('td', {}, h('span', { class: `status ${s2.live ? 'ok' : ''}` }, s2.live ? 'Live' : 'Draft')),
            h('td', { style: 'text-align:right;white-space:nowrap' }, s2.id !== id && h('button', { class: 'btn soft sm', onclick: () => open(s2) }, 'Open'), s2.role === 'owner' && s2.id !== id && h('button', { class: 'btn text sm', style: 'color:var(--red)', onclick: async () => { if (!await confirmSheet({ title: `Delete ${s2.name}?`, text: 'The site, its messages and its web address will be removed. This cannot be undone.', action: 'Delete site', danger: true })) return; try { await api('DELETE', `/api/sites/${s2.id}`); sitesData = null; paintPanel(); toast('Site deleted'); } catch (ex) { toast(ex.message, true); } } }, 'Delete')))))))))];
    },
    history() {
      if (!versions) {
        api('GET', `/api/sites/${id}/versions`).then((r) => { versions = r.versions; if (tab === 'history') paintPanel(); }).catch((e) => { toast(e.message, true); versions = []; if (tab === 'history') paintPanel(); });
        return [group('History', skel(4, 'row'))];
      }
      if (!versions.length) return [group('History', emptyState('clock', 'No versions yet', 'Each time you publish, a copy of your site is kept here so you can go back to it.'))];
      const stamp = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      return [group('History', null,
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
      const ROLES = { kitchen: ['Kitchen', 'Sees and updates orders. Nothing else.'], manager: ['Manager', 'Everything except the team and deleting the site.'] };
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
      const NAMES = { owner: 'Owner', manager: 'Manager', kitchen: 'Kitchen' };
      const people = [{ id: '', name: team.owner.name, email: team.owner.email, role: 'owner', active: 1 }, ...team.members];
      const setRole = async (m, role) => { try { team.members = (await api('POST', `/api/sites/${id}/team`, { email: m.email, role })).members; toast('Role updated'); } catch (ex) { toast(ex.message, true); } paintPanel(); };
      const remove = async (m) => { if (!await confirmSheet({ title: `Remove ${m.name || m.email}?`, text: 'They lose access to this site straight away.', action: 'Remove', danger: true })) return; try { team.members = (await api('DELETE', `/api/sites/${id}/team/${m.id}`)).members; } catch (ex) { toast(ex.message, true); } paintPanel(); };
      const addSheetUnused = () => sheet((close) => [h('h2', {}, 'Add employee'), null,
        h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); if (!emailIn.value) return; close(); add(e); } }, h('label', { class: 'field' }, h('span', {}, 'Name'), nameIn), h('label', { class: 'field' }, h('span', {}, 'Email'), emailIn), h('label', { class: 'field' }, h('span', {}, 'Role'), roleIn),
          h('div', { class: 'note stack', style: 'gap:6px' }, Object.values(ROLES).map(([l, d]) => h('div', {}, h('b', {}, `${l}. `), d))),
          h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn' }, 'Add employee')))]);
      const tbody = h('tbody', {});
      const draw = () => {
        const rows = people.filter((p) => (!teamQ || `${p.name} ${p.email}`.toLowerCase().includes(teamQ)) && (teamRole === 'all' || p.role === teamRole));
        const addRow = teamAdding && h('tr', { class: 'inline-tr' }, h('td', { colspan: 5 }, h('form', { class: 'inline-add emp-add', onsubmit: async (e) => { e.preventDefault(); teamAdding = false; await add(e); } }, nameIn, emailIn, roleIn, h('div', { class: 'inline-acts' }, h('button', { type: 'button', class: 'btn soft', onclick: () => { teamAdding = false; draw(); } }, 'Cancel'), h('button', { class: 'btn' }, 'Add')))));
        if (addRow) setTimeout(() => nameIn.focus());
        tbody.replaceChildren(...[addRow].filter(Boolean), ...(rows.length ? rows.map((p) => h('tr', {},
          h('td', {}, h('b', { class: 'emp-n' }, p.name || p.email.split('@')[0]), h('div', { class: 'small muted' }, p.email)),
          h('td', {}, h('span', { class: 'pill' }, NAMES[p.role] || p.role)),
          h('td', {}, h('span', { class: `pill ${p.active ? 'ok' : 'wait'}`, title: p.active ? 'Has signed in' : 'Has not signed in yet' }, p.active ? 'Active' : 'Invited')),
          h('td', { style: 'text-align:right' }, h('button', { class: 'btn text sm', onclick: () => goTab('r-emp') }, 'View report')),
          h('td', { style: 'text-align:right;width:52px' }, p.role !== 'owner' && moreBtn([p.role !== 'manager' && ['Make manager', () => setRole(p, 'manager')], p.role !== 'kitchen' && ['Make kitchen staff', () => setRole(p, 'kitchen')], ['Remove', () => remove(p), true]]))))
          : [h('tr', {}, h('td', { colspan: 5, class: 'muted', style: 'text-align:center;padding:28px' }, 'Nobody matches that search.'))]));
      };
      draw();
      return [h('div', { class: 'inv' },
        toolbar(teamQ, 'Search employees', (v) => { teamQ = v; draw(); }, filtersButton([{ title: 'Role', value: teamRole, set: (k) => { teamRole = k; }, options: [['all', 'Everyone'], ['owner', 'Owner'], ['manager', 'Managers'], ['kitchen', 'Kitchen']] }]), h('button', { class: 'btn', onclick: () => { teamAdding = true; draw(); } }, ic('plus', 16), 'Add employee')),
        h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable emp' }, h('thead', {}, h('tr', {}, ['Name', 'Role', 'Status', '', ''].map((x) => h('th', {}, x)))), tbody))))];
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
  // Pages that show money or lists keep themselves up to date while open.
  const liveTick = setInterval(() => {
    if (document.visibilityState !== 'visible' || document.querySelector('.sheet, .tb-pop, .inline-add, .inline-tr, input:focus, textarea:focus')) return;
    const want = { tx: [() => `transactions?${rq()}`, (v) => { txData = v; }, () => txData], cash: [() => `cash?${rq()}`, (v) => { cashData = v; }, () => cashData], close: [() => 'closeouts', (v) => { closeData = v; }, () => closeData], appts: [() => 'appointments', (v) => { apptData = v; }, () => apptData], calendar: [() => 'appointments', (v) => { apptData = v; }, () => apptData], timesheets: [() => 'timeclock', (v) => { clockData = v; }, () => clockData], schedule: [() => 'shifts', (v) => { shiftData = v; }, () => shiftData], customers: [() => 'customers', (v) => { customers = v.customers; }, () => customers] }[tab];
    if (!want || !want[2]()) return;
    const t0 = tab;
    api('GET', `/api/sites/${id}/${want[0]()}`).then((r) => { if (tab !== t0) return; const before = JSON.stringify(want[2]()); want[1](r); if (JSON.stringify(want[2]()) !== before) paintPanel(); }).catch(() => {});
  }, 20000);
  const salesTick = setInterval(() => { if ((SALES_TABS[tab] || tab === 'start') && stats && !stats.failed && stats.to === stats.today && !salesBusy && document.visibilityState === 'visible') { const want = rq().toString(); api('GET', `/api/sites/${id}/stats?${want}`).then((r) => { if ((SALES_TABS[tab] || tab === 'start') && statsFor === want && JSON.stringify(r) !== JSON.stringify(stats)) { stats = r; paintPanel(); } }).catch(() => {}); } }, 30000);
  if (ordering.enabled) loadOrders(true);

  async function putOrdering() { await sendOrdering(ordering); }
  function addCategory(cats) {
    sheet((close) => {
      const nameIn = h('input', { maxlength: 60, placeholder: 'e.g. Breakfast', autofocus: true });
      const fromIn = h('input', { type: 'time' }), toIn = h('input', { type: 'time' });
      const hide = h('input', { type: 'checkbox' });
      const save = async (btn) => {
        const name = nameIn.value.trim();
        if (!name) { nameIn.focus(); return toast('Give the category a name.', true); }
        if (cats.some((c) => c.toLowerCase() === name.toLowerCase())) return toast('That category already exists.', true);
        if ((fromIn.value && !toIn.value) || (!fromIn.value && toIn.value)) return toast('Choose both times, or leave both empty.', true);
        if (cats.length >= 200) return toast('You can have up to 200 categories.', true);
        btn.disabled = true;
        const known = new Map(ordering.cats.map((x) => [x.name, x])), before = ordering.cats;
        ordering.cats = [...cats.map((m) => known.get(m) || { name: m, hidden: false, from: '', to: '' }), { name, hidden: hide.checked, from: fromIn.value, to: toIn.value }];
        try { await putOrdering(); close(); if (clState.itq) clState.itq.cats = ''; paintPanel(); toast('Category added'); } catch (e) { ordering.cats = before; toast(e.message, true); btn.disabled = false; }
      };
      const saveBtn = h('button', { type: 'button', class: 'btn cl-blue' }, 'Add category'); saveBtn.onclick = () => save(saveBtn);
      nameIn.onkeydown = (e) => { if (e.key === 'Enter') save(saveBtn); };
      return [h('div', { class: 'swb-h' }, h('h2', {}, 'Add category'), h('button', { type: 'button', class: 'ss-x', 'aria-label': 'Close', onclick: close }, ic('x', 20))),
        h('div', { class: 'cl-promoform' },
          h('label', { class: 'field cl-field' }, h('span', {}, 'Category name'), nameIn),
          h('label', { class: 'switch' }, h('span', {}, 'Hide from customers'), hide, h('i')),
          h('div', { class: 'field cl-field' }, h('span', {}, 'Only available between (optional)'), h('div', { class: 'cl-grid2' }, fromIn, toIn))),
        h('div', { class: 'swb-f' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), saveBtn)];
    }, 'swb');
  }
  function editCategory(c, cats) {
    const cur = ordering.cats.find((x) => x.name === c) || { name: c, hidden: false, from: '', to: '' };
    const d = { ...cur, name: c };
    sheet((close) => {
      const field = (label, el, hint) => h('label', { class: 'field' }, h('span', {}, label), el, null);
      const nameIn = h('input', { value: c, maxlength: 60 });
      const fromIn = h('input', { type: 'time', value: d.from }), toIn = h('input', { type: 'time', value: d.to });
      const hide = h('input', { type: 'checkbox', checked: d.hidden });
      const shift = async (by) => {
        const i = cats.indexOf(c), j = i + by; if (j < 0 || j >= cats.length) return;
        const order = [...cats]; [order[i], order[j]] = [order[j], order[i]];
        try { await saveCatOrder(order); close(); } catch (e) { toast(e.message, true); }
      };
      return [h('h2', {}, 'Edit category'),
        field('Name', nameIn),
        h('label', { class: 'switch' }, h('span', {}, h('b', { style: 'font-weight:500' }, 'Hide from customers'), null), hide, h('i')),
        h('div', { class: 'field' }, h('span', {}, 'Only available between'), h('div', { class: 'pair' }, fromIn, toIn), null),
        h('div', { class: 'row' }, h('button', { class: 'btn soft sm', disabled: cats.indexOf(c) === 0, onclick: () => shift(-1) }, ic('up', 14), 'Move up'), h('button', { class: 'btn soft sm', disabled: cats.indexOf(c) === cats.length - 1, onclick: () => shift(1) }, ic('down', 14), 'Move down')),
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try {
            const name = nameIn.value.trim() || c;
            if (name.toLowerCase() !== c.toLowerCase() && cats.some((x) => x.toLowerCase() === name.toLowerCase())) { e.currentTarget.disabled = false; return toast('That category already exists.', true); }
            if (name !== c) { const r = await api('POST', `/api/sites/${id}/menu/category`, { from: c, to: name }); menu = r.items; for (const k of Object.keys(ordering)) if (!(k in r.ordering)) delete ordering[k]; Object.assign(ordering, r.ordering); orderingRev = r.orderingRev; }
            const both = fromIn.value && toIn.value;
            const at = ordering.cats.findIndex((x) => x.name === name);
            const row = { ...(at >= 0 ? ordering.cats[at] : { id: steadyId(c.toLowerCase()) }), name, hidden: hide.checked, from: both ? fromIn.value : '', to: both ? toIn.value : '' };
            if (at >= 0) ordering.cats[at] = row; else ordering.cats.push(row);
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
      const costIn = h('input', { value: it.cost == null ? '' : (it.cost / 100).toFixed(2), inputmode: 'decimal', oninput: () => { const v = costIn.value.trim(); const c = v ? parsePrice(v) : null; costIn.style.borderColor = v && c === null ? 'var(--red)' : ''; if (!v || c !== null) { it.cost = v ? c : null; save(); } } });
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
            h('div', { class: 'pair' }, wrap('Price', priceIn), wrap('Cost', costIn)), wrap('Sale, percent off', saleIn), now,
            text('Category', it, 'category', { list: listId, maxlength: 60 }), h('datalist', { id: listId }, cats.map((c) => h('option', { value: c }))))),
        area('Description', it, 'desc', { rows: 2, maxlength: 500 }),
        h('div', { class: 'isheet-row' },
          h('div', { class: 'field' }, h('span', {}, 'In stock'), h('div', { class: 'inv-qty' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'One fewer', onclick: bump(-1) }, ic('minus', 16)), qtyIn, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'One more', onclick: bump(1) }, ic('plus', 16)))),
          toggle('Charge sales tax', it, 'taxable', (v) => v !== false), toggle('Available to order', it, 'available', (v) => v !== false)),
        wrap('Refill every morning to', h('input', { type: 'number', min: 0, max: 999999, value: it.restock ?? '', placeholder: 'Off', style: 'max-width:160px', oninput: (e) => { it.restock = e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value)) || 0); save(); } }), 'For things you make fresh each day. The quantity goes back to this number every morning. Leave empty to keep counting down.'),
        (ordering.labels.length > 0 || ordering.revClasses.length > 0) && h('div', { class: 'pair' },
          ordering.labels.length > 0 && wrap('Printer label', h('select', { onchange: (e) => { it.label = e.target.value; save(); } }, h('option', { value: '' }, 'None'), ordering.labels.map((l) => h('option', { value: l, selected: it.label === l }, l)))),
          ordering.revClasses.length > 0 && wrap('Revenue class', h('select', { onchange: (e) => { it.revclass = e.target.value; save(); } }, h('option', { value: '' }, 'None'), ordering.revClasses.map((l) => h('option', { value: l, selected: it.revclass === l }, l))))),
        ordering.modGroups.length > 0 && h('div', { class: 'field' }, h('span', {}, 'Modifier groups'), h('div', { class: 'checks' }, ordering.modGroups.map((g) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: (it.mods || []).includes(g.id), onchange: (e) => { it.mods = (it.mods || []).filter((x) => x !== g.id); if (e.target.checked) it.mods.push(g.id); save(); } }), h('span', {}, g.name, h('small', {}, ` ${g.choices.length} choice${g.choices.length === 1 ? '' : 's'}`))))), null),
        h('div', { class: 'field' }, h('span', {}, 'Options'), optBox),
        h('div', { class: 'acts', style: 'justify-content:space-between' },
          h('button', { class: 'btn danger', onclick: async () => {
            if (!await confirmSheet({ title: `Delete ${it.name}?`, text: 'It is removed from your menu straight away. Past orders are kept.', action: 'Delete', danger: true })) return;
            try { menu = (await api('DELETE', `/api/sites/${id}/menu/${it.id}`)).items; gone = true; close(); } catch (e) { toast(e.message, true); }
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
      return [h('h2', {}, title), h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); answered = true; close(); done(input.value.trim()); } }, h('label', { class: 'field' }, h('span', {}, label), input, null),
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
        h('p', { class: 'muted' }, p.items.length ? `From ${file.name}, in ${cats} categor${cats === 1 ? 'y' : 'ies'}.` : p.errors[0]?.reason || 'No items were found.'),
        p.items.length > 0 && h('table', { class: 'ptable' }, h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', {}, 'Category'), h('th', {}, 'Price'))), h('tbody', {}, p.items.slice(0, 6).map((x) => h('tr', {}, h('td', {}, x.name), h('td', { class: 'muted' }, x.category), h('td', {}, money(x.price)))))),
        p.items.length > 6 && h('p', { class: 'small muted' }, `and ${p.items.length - 6} more`),
        p.items.length > 0 && p.errors.length > 0 && h('div', { class: 'note' }, h('b', {}, `${p.errors.length} row${p.errors.length === 1 ? '' : 's'} will be skipped. `), p.errors.slice(0, 3).map((e) => h('div', {}, `${e.row ? `Row ${e.row}: ` : ''}${e.reason}`))),
        missing > 0 && h('label', { class: 'field' }, h('span', {}, missing === p.items.length ? 'How many of each item do you have?' : `Starting quantity for the ${missing} item${missing === 1 ? '' : 's'} without one`), qtyIn, null),
        !p.items.length && null,
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'),
          p.items.length > 0 && menu.length > 0 && h('button', { class: 'btn soft', onclick: (e) => run(false, e.currentTarget) }, 'Add to my menu'),
          p.items.length > 0 && h('button', { class: 'btn', onclick: (e) => run(menu.length > 0, e.currentTarget) }, menu.length ? 'Replace my menu' : 'Build my menu'))];
    });
  }

  /* ---------- payments recorded at the counter ---------- */
  const rq = () => { const q = new URLSearchParams(salesRange === 'custom' && salesFrom && salesTo ? { range: 'custom', from: salesFrom, to: salesTo } : { range: salesRange === 'custom' ? 'today' : salesRange }); if (TYPE_TABS.has(tab) && clState.type) q.set('type', clState.type); return q; };
  const rangeBar = () => h('div', { class: 'inv-bar' }, dateFilter());
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (d0, n) => new Date(Date.parse(`${d0}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const longDay = (d0, o = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) => new Date(`${d0}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', ...o });
  const monthName = (ym) => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const chev = (d) => h('span', { class: `chv ${d}`, 'aria-hidden': 'true' });
  const RANGE_NAMES = { today: 'Today', yesterday: 'Yesterday', week: 'This week', month: 'This month', last30: 'Last 30 days' };
  const rangeData = () => (SALES_TABS[tab] || tab === 'start' ? stats : tab === 'tx' ? txData : tab === 'cash' ? cashData : null);
  let statsFor = '';
  function loadStats() {
    const want = rq().toString();
    if (salesBusy && statsFor === want) return;
    salesBusy = true; statsFor = want;
    api('GET', `/api/sites/${id}/stats?${want}`).then((r) => { if (statsFor === want) stats = r; }).catch((e) => { if (statsFor === want) { toast(e.message, true); stats = { failed: true }; } })
      .finally(() => { if (statsFor !== want) return; salesBusy = false; if (SALES_TABS[tab] || tab === 'start' || CL[tab]) paintPanel(); });
  }
  function setRange(k, from = '', to = '') { salesRange = k; salesFrom = from; salesTo = to; stats = null; txData = null; cashData = null; paintPanel(); }
  // A real month to click through: press a day, or a start day then an end day.
  function monthGrid(ym, pick, sel, max) {
    const [y, m] = ym.split('-').map(Number);
    const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7, days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)];
    const today = isoDay(new Date());
    return h('div', { class: 'mcal' }, ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => h('span', { class: 'mcal-h' }, d)),
      cells.map((d) => (d ? h('button', { type: 'button', class: 'mcal-d', disabled: !!(max && d > max), 'data-today': d === today ? '1' : null, 'data-sel': sel && sel.from && (d === sel.from || d === sel.to) ? '1' : sel && sel.from && sel.to && d > sel.from && d < sel.to ? 'mid' : null, onclick: () => pick(d) }, String(Number(d.slice(8)))) : h('span'))));
  }
  function monthPicker(ym0, onPick, sel, max, extra) {
    let ym = ym0;
    const w = h('div', { class: 'dpop-cal' });
    const draw = () => {
      const [y, m] = ym.split('-').map(Number);
      const step = (n) => { ym = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); draw(); };
      w.replaceChildren(h('div', { class: 'dpop-m' }, h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Previous month', onclick: () => step(-1) }, chev('l')), h('b', {}, monthName(ym)), h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Next month', disabled: !!(max && ym >= max.slice(0, 7)), onclick: () => step(1) }, chev('r'))),
        monthGrid(ym, (d) => { onPick(d); draw(); }, sel(), max), ...(extra ? [extra()] : []));
    };
    draw(); return w;
  }
  function calPop(anchor, today) {
    let a = salesRange === 'custom' ? salesFrom : '', b = salesRange === 'custom' && salesTo !== salesFrom ? salesTo : '';
    popover(anchor, (close) => h('div', { class: 'dpop' },
      h('div', { class: 'dpop-pre' }, Object.entries(RANGE_NAMES).map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(salesRange === k), onclick: () => { close(); setRange(k); } }, l))),
      monthPicker((salesRange === 'custom' && salesTo ? salesTo : today).slice(0, 7), (d) => { if (!a || b) { a = d; b = ''; } else if (d < a) { b = a; a = d; } else if (d > a) b = d; }, () => ({ from: a, to: b || a }), today,
        () => h('div', {}, h('p', { class: 'small muted', style: 'margin:8px 2px' }, !a ? 'Press a day, or a start day and an end day.' : b ? `${longDay(a)} – ${longDay(b)}` : `${longDay(a)}. Press an end day for a range.`),
          h('div', { class: 'acts', style: 'margin-top:4px' }, h('button', { type: 'button', class: 'btn soft sm', onclick: close }, 'Cancel'), h('button', { type: 'button', class: 'btn sm', disabled: !a, onclick: () => { close(); setRange('custom', a, b || a); } }, 'Apply'))))), 'left');
  }
  function dateFilter() {
    const k = rangeData(), today = (k && k.today) || isoDay(new Date());
    const custom = salesRange === 'custom' && salesFrom && salesTo;
    const from = custom ? salesFrom : k && k.from, to = custom ? salesTo : k && k.to;
    const label = custom ? (salesFrom === salesTo ? longDay(salesFrom, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Custom dates') : RANGE_NAMES[salesRange] || 'Today';
    const btn = h('button', { type: 'button', class: 'dsel', 'aria-haspopup': 'dialog', onclick: () => calPop(btn, today) }, ic('calendar', 18), h('span', {}, label), h('span', { class: 'chv d', 'aria-hidden': 'true' }));
    const span = from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 : 0;
    const shift = (dir) => { let f = addDays(from, dir * span), t = addDays(to, dir * span); if (t > today) { t = today; f = addDays(today, 1 - span); } setRange('custom', f, t); };
    return h('div', { class: 'dfilter' }, btn, from && to && h('div', { class: 'dspan' }, h('b', {}, from === to ? longDay(from) : `${longDay(from, { month: 'short', day: 'numeric' })} – ${longDay(to, { month: 'short', day: 'numeric', year: 'numeric' })}`),
      h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Earlier', title: 'Earlier', onclick: () => shift(-1) }, chev('l')), h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Later', title: 'Later', disabled: to >= today, onclick: () => shift(1) }, chev('r'))));
  }
  // Search, a Filters button and the main action on one line, like a list in Settings.
  function filtersButton(sections) {
    const on = sections.filter((x) => x.value !== x.options[0][0]).length;
    const btn = h('button', { type: 'button', class: 'fbtn', 'aria-haspopup': 'dialog', onclick: () => popover(btn, (close) => [
      h('div', { class: 'tb-pop-h' }, h('b', {}, 'Filters'), on > 0 && h('button', { class: 'btn text sm', type: 'button', onclick: () => { close(); sections.forEach((x) => x.set(x.options[0][0], true)); paintPanel(); } }, 'Clear all')),
      ...sections.map((x) => h('div', { class: 'fsec' }, h('small', {}, x.title), h('div', { class: 'fopts' }, x.options.map(([k, l]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(x.value === k), onclick: () => { close(); x.set(k); paintPanel(); } }, l)))))], 'right') },
    ic('sliders', 18), h('span', {}, 'Filters'), on > 0 && h('em', {}, String(on)));
    return btn;
  }
  const toolbar = (q, ph, onq, filters, action) => h('div', { class: 'tbar' }, h('label', { class: 'tsearch' }, ic('search', 18), h('input', { type: 'search', placeholder: ph, value: q, 'aria-label': ph, oninput: (e) => onq(e.target.value.trim().toLowerCase()) })), filters, action);
  const moreBtn = (items) => { const b = h('button', { type: 'button', class: 'icon-btn rep-more', 'aria-label': 'More', title: 'More', 'aria-haspopup': 'menu', onclick: () => popover(b, (close) => items.filter(Boolean).map(([l, fn, danger]) => h('button', { class: 'tb-item', type: 'button', style: danger ? 'color:var(--red)' : null, onclick: () => { close(); fn(); } }, h('span', {}, l)))) }, h('span', { class: 'rep-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))); return b; };
  function csvFile(name, rows) {
    const q2 = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const url = URL.createObjectURL(new Blob([`\ufeff${rows.map((r) => r.map(q2).join(',')).join('\r\n')}`], { type: 'text/csv' }));
    h('a', { href: url, download: `${name}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const putOrder = (x, fresh) => { Object.assign(x, fresh); const live = (orders || []).find((o) => o.id === fresh.id); if (live && live !== x) Object.assign(live, fresh); };
  const TENDERS = ['Cash', 'Card', 'Online payment', 'Check', 'Gift card', 'Other'];
  function takePayment(x) {
    sheet((close) => [h('h2', {}, `Record payment for #${x.number}`), h('p', { class: 'muted' }, `${money(x.total)} from ${x.name}.`),
      h('div', { class: 'tender-grid' }, TENDERS.map((m) => h('button', { class: 'btn soft', onclick: async () => { try { putOrder(x, (await api('POST', `/api/sites/${id}/orders/${x.id}/payment`, { method: m })).order); close(); toast(`#${x.number} paid by ${m.toLowerCase()}`); paintPanel(); } catch (e) { toast(e.message, true); } } }, m))),
      h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'))]);
  }
  function refundOrder(x) {
    sheet((close) => {
      const left = x.total - x.refunded;
      const amt = h('input', { value: (left / 100).toFixed(2), inputmode: 'decimal', autofocus: true }), noteIn = h('input', { placeholder: 'Reason (optional)', maxlength: 300 }), err = h('p', { class: 'error', role: 'alert' });
      return [h('h2', {}, `Refund order #${x.number}`), h('p', { class: 'muted' }, `Up to ${money(left)}.`),
        h('label', { class: 'field' }, h('span', {}, 'Amount'), amt), h('label', { class: 'field' }, h('span', {}, 'Note'), noteIn), err,
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn', onclick: async () => { const c = parsePrice(amt.value || ''); if (!c) { err.textContent = 'Enter an amount above zero.'; return; } try { putOrder(x, (await api('POST', `/api/sites/${id}/orders/${x.id}/payment`, { refund: c, note: noteIn.value })).order); close(); toast('Refund recorded'); paintPanel(); } catch (e) { err.textContent = e.message; } } }, 'Record refund'))];
    });
  }

  /* ---------- simple lists: a table, an Add button, and a pop-up to edit one row ---------- */
  const saveLists = async () => { await putOrdering(); paintPanel(); paint(true); };
  function listPage({ title, hint, add, heads, rows: all, cells, empty, edit, remove }) {
    // Every list has a search bar for what is in it, beside the Add button.
    const key = `list:${title}`, q = (clState.listQ[key] || '').trim().toLowerCase();
    const rows = q ? all.filter((r) => String(r.name || r).toLowerCase().includes(q)) : all;
    const noun = title.toLowerCase();
    return [h('div', { class: 'inv' },
      h('div', { class: 'inv-top' }, h('div', {}, h('h2', {}, title))),
      all.length > 0 && h('div', { class: 'tbar cat-tools' }, cSearch(`Search ${noun}`, clState.listQ[key] || '', (v) => { clState.listQ[key] = v; }), h('button', { type: 'button', class: 'btn cl-blue', onclick: () => edit(null) }, ic('plus', 18), add)),
      all.length > 0 && !rows.length ? h('div', { class: 'inv-list' }, h('p', { class: 'hint', style: 'text-align:center;padding:28px 0' }, `No ${noun} match that search.`))
      : rows.length ? h('div', { class: 'scard' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable bills' }, h('thead', {}, h('tr', {}, [...heads, 'Action'].map((x) => h('th', {}, x)))),
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
        return h('label', { class: 'field' }, h('span', {}, label), el, null);
      };
      return [h('h2', {}, title), h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); err.textContent = ''; try { await apply(v); await saveLists(); close(); toast('Saved'); } catch (ex) { err.textContent = ex.message; } } },
        fields.map(control), extra && extra(v), err,
        h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn' }, 'Save')))];
    }, 'wide');
  }
  const pickList = (label, all, chosen, hint) => h('div', { class: 'field' }, h('span', {}, label), all.length ? h('div', { class: 'checks' }, all.map(([val, text2]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: chosen.has(val), onchange: (e) => { e.target.checked ? chosen.add(val) : chosen.delete(val); } }), h('span', {}, text2)))) : h('small', {}, 'Nothing to choose from yet.'), null);
  /* ---------- invoices ---------- */
  // With no discounts of their own, invoices offer these.
  const DEFAULT_DISCOUNTS = [['p10', 10], ['p25', 25], ['p50', 50]].map(([k, v]) => ({ id: k, name: `${v}%`, type: 'percent', value: v })).concat([['a1', 100], ['a5', 500], ['a10', 1000]].map(([k, v]) => ({ id: k, name: `${money(v)} off`, type: 'amount', value: v })));
  const discList = () => (ordering.discounts.length ? ordering.discounts : DEFAULT_DISCOUNTS);
  const setBills = (r) => { bills = { ...bills, ...Object.fromEntries(Object.entries(r).filter(([k]) => ['invoices', 'contacts'].includes(k))) }; customers = null; if (tab === 'invoices' || tab === 'est' || tab === 'customers') paintPanel(); };
  // Export everyone, in the same columns Import reads, so a list can go out and come back in.
  function exportCustomers() {
    if (!customers || !customers.length) return toast('There are no customers to export yet.', true);
    const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
    const rows = [['Name', 'Company', 'Email', 'Phone', 'Address', 'Orders', 'Total spent', 'First order', 'Last order', 'Favourite item'],
      ...customers.map((c) => [c.name, c.company || '', c.email || '', c.phone || '', c.address || '', c.orders, Number((c.spent / 100).toFixed(2)), day(c.first), day(c.last), c.favourite || ''])];
    sheet((close) => {
      const go2 = async (kind, btn) => { btn.disabled = true; try { await saveSheetFile(`${meta.slug}-customers`, rows, kind); close(); toast(`${customers.length} customer${customers.length === 1 ? '' : 's'} exported`); } catch (e) { btn.disabled = false; toast(e.message, true); } };
      return [h('h2', {}, 'Export customers'), h('p', { class: 'muted' }, `${customers.length} customer${customers.length === 1 ? '' : 's'}: name, company, email, phone, address, orders and spend. The file can be imported again here or into another system.`),
        h('div', { class: 'xport' },
          h('button', { class: 'xport-opt', type: 'button', onclick: (e) => go2('xlsx', e.currentTarget) }, h('b', {}, 'Excel'), null),
          h('button', { class: 'xport-opt', type: 'button', onclick: (e) => go2('csv', e.currentTarget) }, h('b', {}, 'CSV'), null)),
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'))];
    });
  }
  async function importCustomers() {
    const [file] = await pickFiles(false, SHEET_TYPES);
    if (!file) return;
    let rows;
    try { rows = parseCsv(await readSheetFile(file)); } catch (e) { return toast(e.message, true); }
    const heads = (rows.shift() || []).map((x) => String(x).toLowerCase().trim());
    const col = (...names) => heads.findIndex((x) => names.some((n) => x.includes(n)));
    const exact = (...names) => heads.findIndex((x) => names.includes(x));
    const at = { first: exact('first', 'first name', 'firstname', 'given name'), last: exact('last', 'last name', 'lastname', 'surname', 'family name'), name: heads.findIndex((x) => x === 'name' || x.includes('full name') || x.includes('customer')), company: col('company', 'business'), email: col('email', 'e-mail'), phone: col('phone', 'mobile', 'tel'), address: col('address', 'street') };
    const pick = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '');
    const people = rows.map((r) => ({ name: pick(r, at.name) || [pick(r, at.first), pick(r, at.last)].filter(Boolean).join(' '), company: pick(r, at.company), email: pick(r, at.email), phone: pick(r, at.phone), address: pick(r, at.address) })).filter((c) => c.name || c.company || c.email);
    for (const c of people) if (!c.name && !c.company) c.name = c.email;
    sheet((close) => [h('h2', {}, people.length ? `${people.length} customer${people.length === 1 ? '' : 's'} found` : 'We could not read that file'),
      h('p', { class: 'muted' }, people.length ? `From ${file.name}.` : 'No customers found in that file.'),
      people.length > 0 && h('table', { class: 'ptable' }, h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Email'), h('th', {}, 'Phone'))), h('tbody', {}, people.slice(0, 6).map((c) => h('tr', {}, h('td', {}, c.name || c.company), h('td', { class: 'muted' }, c.email), h('td', { class: 'muted' }, c.phone))))),
      people.length > 6 && h('p', { class: 'small muted' }, `and ${people.length - 6} more`),
      h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'), people.length > 0 && h('button', { class: 'btn', onclick: async (e) => { e.currentTarget.disabled = true; try { const r = { added: 0, skipped: 0 }; for (let k = 0; k < people.length; k += 1000) { const part = await api('POST', `/api/sites/${id}/contacts/import`, { rows: people.slice(k, k + 1000) }); r.added += part.added; r.skipped += part.skipped; r.contacts = part.contacts; } customers = null; bills = null; close(); toast(`${r.added} customer${r.added === 1 ? '' : 's'} imported${r.skipped ? `, ${r.skipped} skipped` : ''}`); paintPanel(); } catch (ex) { toast(ex.message, true); e.currentTarget.disabled = false; } } }, 'Import'))]);
  }
  // A customer added in place: a row of fields inside the page, no window.
  function customerRow(done, cancel) {
    const c = { name: '', company: '', email: '', phone: '' };
    const f = (ph, k, a = {}) => h('input', { placeholder: ph, 'aria-label': ph, value: '', oninput: (e) => { c[k] = e.target.value; }, ...a });
    const form = h('form', { class: 'inline-add', onsubmit: async (e) => { e.preventDefault(); try { await api('POST', `/api/sites/${id}/contacts`, c); customers = null; bills = null; toast('Customer added'); done(c); } catch (ex) { toast(ex.message, true); } } },
      f('Name', 'name', { maxlength: 120, required: true }), f('Company', 'company', { maxlength: 120 }), f('Email', 'email', { type: 'email', maxlength: 200 }), f('Phone', 'phone', { type: 'tel', maxlength: 40 }),
      h('div', { class: 'inline-acts' }, h('button', { type: 'button', class: 'btn soft', onclick: cancel }, 'Cancel'), h('button', { class: 'btn' }, 'Save')));
    setTimeout(() => form.querySelector('input')?.focus());
    return form;
  }
  function addCustomer() {
    const c = { name: '', company: '', email: '', phone: '', address: '' };
    sheet((close) => {
      const f = (label, k, a = {}) => h('label', { class: 'field' }, h('span', {}, label), h('input', { value: c[k], oninput: (e) => { c[k] = e.target.value; }, ...a }));
      return [h('h2', {}, 'Add a customer'), null,
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
      return [h('h2', {}, `Mark ${v.label} as paid?`), h('p', { class: 'muted' }, `${money(v.total)} from ${v.customer.company || v.customer.name}.`),
        h('label', { class: 'field' }, h('span', {}, 'How they paid'), how), h('label', { class: 'field' }, h('span', {}, 'Note'), noteIn),
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn', autofocus: true, onclick: async () => { try { setBills(await api('POST', `/api/sites/${id}/invoices/${v.id}/status`, { status: 'paid', method: how.value, note: noteIn.value })); close(); toast(`${v.label} marked as paid`); } catch (e) { toast(e.message, true); } } }, 'Mark as paid'))];
    });
  }
  async function convertEstimate(v) {
    if (!await confirmSheet({ title: `Convert ${v.label} to an invoice?`, text: 'It moves to Invoices as a draft, ready to send for payment.', action: 'Convert' })) return;
    try { setBills(await api('POST', `/api/sites/${id}/invoices/${v.id}/convert`)); toast('Converted. Find it under Invoices.'); goTab('invoices'); } catch (e) { toast(e.message, true); }
  }
  async function openInvoice(existing, person, kind = existing?.kind || 'invoice', lines = null) {
    const est = kind === 'estimate';
    if (!bills) { try { bills = await api('GET', `/api/sites/${id}/invoices`); } catch (e) { return toast(e.message, true); } }
    if (!customers) { try { customers = (await api('GET', `/api/sites/${id}/customers`)).customers; } catch { customers = []; } }
    const v = existing ? JSON.parse(JSON.stringify(existing)) : { status: 'draft', customer: { name: person?.name || '', company: person?.company || '', email: person?.email || '', phone: person?.phone || '', address: person?.address || '' }, items: lines || [{ name: '', qty: 1, price: 0, taxable: true }], project: person?.project || '', notes: '', due: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), taxRate: ordering.taxRate || 0, discount: 0, payUrl: '' };
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
        h('div', { class: 'bill-sec' }, h('h3', {}, 'What they ordered'), null, linesBox),
        h('div', { class: 'bill-grid' },
          h('div', { class: 'stack' },
            h('div', { class: 'pair' }, h('label', { class: 'field' }, h('span', {}, 'Due date'), h('input', { type: 'date', value: v.due, onchange: (e) => { v.due = e.target.value; } })), h('label', { class: 'field' }, h('span', {}, 'Sales tax (%)'), h('input', { type: 'number', min: 0, max: 30, step: '0.001', value: v.taxRate, oninput: (e) => { v.taxRate = Number(e.target.value) || 0; drawTotals(); } }))),
            h('label', { class: 'field' }, h('span', {}, 'Discount ($)'), discIn, h('select', { 'aria-label': 'Use a saved discount', style: 'margin-top:8px', onchange: (e) => { const dd = discList().find((x) => x.id === e.target.value); if (!dd) return; const sub = invoiceTotals(v.items.filter((l) => l.name.trim()), 0, 0).subtotal; v.discount = dd.type === 'amount' ? Math.min(sub, dd.value) : Math.round((sub * dd.value) / 100); discIn.value = (v.discount / 100).toFixed(2); e.target.value = ''; drawTotals(); } }, h('option', { value: '' }, 'Use a saved discount…'), discList().map((dd) => { const val = dd.type === 'amount' ? `${money(dd.value)} off` : `${dd.value}%`; return h('option', { value: dd.id }, dd.name === val ? dd.name : `${dd.name} (${val})`); }))),
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
    const closeBusy = sheet(() => [h('div', { class: 'scanning' }, h('i', { class: 'spinner' })), h('h2', {}, 'Reading your menu…'), null], 'live');
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
      return [title, h('p', { class: 'muted' }, `Read from ${file.name}.`),
        h('div', { class: 'scanhead' }, h('span', {}, 'Item'), h('span', {}, 'Category'), h('span', {}, 'Price'), h('span', {})), list,
        h('label', { class: 'field' }, h('span', {}, 'How many of each item do you have?'), qtyIn, null),
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'),
          menu.length > 0 && h('button', { class: 'btn soft', onclick: (e) => run(false, e.currentTarget) }, 'Add to my menu'),
          h('button', { class: 'btn', onclick: (e) => run(menu.length > 0, e.currentTarget) }, menu.length ? 'Replace my menu' : 'Build my menu'))];
    }, 'wide');
  }

  /* Quick find: one box that jumps to any screen, setting, item or order. */
  const SETTINGS = [['Logo', 'design'], ['Brand colour', 'design'], ['Page background', 'design'], ['Typeface and corners', 'design'], ['Header', 'design'], ['Footer', 'design'], ['Announcement bar', 'design'], ['Site language', 'design'], ['Quick style', 'design'],
    ['Phone, address and email', 'business'], ['Social profiles', 'business'], ['Online payment link', 'business'],
    ['Pickup, curbside and delivery', 'ordering'], ['Delivery fee and zones', 'ordering'], ['Sales tax rate', 'ordering'], ['Tips', 'ordering'], ['Opening hours for orders', 'hours'], ['Order ahead and scheduling', 'hours'], ['Kitchen capacity', 'hours'], ['Happy hour and timed prices', 'deals'], ['Promo codes', 'promos'], ['Loyalty rewards', 'rewards'], ['Low stock alerts', 'alerts'], ['Daily summary email', 'alerts'], ['Order emails', 'alerts'], ['Pause ordering', 'ordering'],
    ['Notifications on this device', 'orders'], ['Sales tax collected', 'r-taxes'], ['Best sellers', 'r-items'], ['Export sales', 'sales'], ['Export customers', 'customers'], ['Send an invoice', 'invoices'], ['Catering and bulk orders', 'invoices'], ['Unpaid invoices', 'invoices'],
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
          : [h('p', { class: 'muted', style: 'padding:22px;text-align:center' }, 'Nothing matches.')]));
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
    start: [() => `stats?${rq()}`, (v) => { stats = v; statsFor = rq().toString(); }, () => (stats && stats.totals ? stats : null)],
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
  const goTab = (k, fromHistory = false, replace = false) => { if (!known(k)) k = 'start'; if (k === 'online') forget('devices'); if (k === 'outreach') forget('customers'); noteVisit(k); if (!fromHistory && location.pathname !== pathFor(k)) window.history[replace ? 'replaceState' : 'pushState'](null, '', pathFor(k)); if (k === 'invoices' || k === 'est' || k === 'projects') refreshBills(); if (FEEDS[k] && FEEDS[k][2]()) reload(k, true); if (tab === 'items' && k !== 'items') paint(true); tab = k; sel = null; editItem = null; panel.scrollTop = 0; paintPanel(); };
  // What the merchant still has to do. Shown in Notifications, not on the dashboard.
  function setupTodos() {
    const b = draft.business;
    const steps = [
      [menu.length > 0, 'Add your menu', menu.length ? `${menu.length} item${menu.length === 1 ? '' : 's'} on your menu.` : 'Upload an Excel or CSV file of item names and prices and we build the menu for you.', menu.length ? ['Edit menu', () => goTab('menu')] : ['Upload item list', importCsv], !menu.length && (state.config.scanEnabled ? ['Scan a paper menu', scanMenu] : ['Add items by hand', () => goTab('menu')])],
      [!!draft.brand.logo, 'Add your logo and colour', 'Make the site look like your business.', ['Open look and feel', () => goTab('design')]],
      [!!(str(b.phone).trim() && str(b.address1).trim()), 'Add your business details', 'Phone, address and opening hours, so customers can find you.', ['Open business info', () => goTab('business')]],
      [ordering.enabled && openMethods(ordering).length > 0, 'Choose how customers order', ordering.enabled ? `${openMethods(ordering).map((m) => ORDER_METHODS[m].name).join(', ')} ${openMethods(ordering).length === 1 ? 'is' : 'are'} on. Add curbside, delivery, tax and tips here.` : 'Online ordering is off.', ['Open ordering', () => goTab('ordering')]],
      [meta.live && !meta.dirty, meta.live ? 'Publish your changes' : 'Publish your site', meta.live ? (meta.dirty ? 'You have changes that are not live yet.' : `Live at ${meta.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}`) : 'Nothing is public until you publish. You can keep editing afterwards.', meta.live && !meta.dirty ? ['View live site', () => window.open(meta.url, '_blank', 'noopener')] : [meta.live ? 'Publish changes' : 'Publish', (e) => publish(e)]],
    ];
    if (ordering.enabled) steps.push([!!(orders && orders.length), 'Place a test order', meta.live ? 'Order from your own site to see exactly what customers see, then watch it arrive under Orders.' : 'Once you publish, order from your own site to see the whole flow.', ['Open my order page', () => (meta.live ? window.open(`${meta.url.replace(/\/$/, '')}/order`, '_blank', 'noopener') : toast('Publish your site first.', true))]]);
    setupTodos.total = steps.length; setupTodos.steps = steps;
    return steps.filter(([ok]) => !ok).map(([, name, text, main]) => ({ name, text, act: main }));
  }
  const setupSteps = () => { setupTodos(); return setupTodos.steps || []; };
  let prevStats = null;
  function startPanel() {
    // The same numbers as Reports, for the period picked at the top.
    if (!stats || (!stats.failed && statsFor && statsFor !== rq().toString())) { stats = null; loadStats(); }
    const st = stats && !stats.failed ? stats : null;
    if (st && (!prevStats || prevStats.key !== `${st.previous.from}|${st.previous.to}`)) {
      const key = `${st.previous.from}|${st.previous.to}`; prevStats = { key, loading: true };
      api('GET', `/api/sites/${id}/stats?range=custom&from=${st.previous.from}&to=${st.previous.to}`).then((r) => { prevStats = { key, ...r }; if (tab === 'start') paintPanel(); }).catch(() => { prevStats = { key, failed: true }; });
    }
    const t = st ? st.totals : null, pv = st ? st.previous : null;
    const prevName = pv ? (pv.from === pv.to ? (st.from === st.today ? `last ${longDay(pv.from, { weekday: 'long' })}` : longDay(pv.from, { weekday: 'short', month: 'short', day: 'numeric' })) : `${longDay(pv.from, { month: 'short', day: 'numeric' })} – ${longDay(pv.to, { month: 'short', day: 'numeric' })}`) : '';
    const nowName = st ? (st.range === 'today' ? 'Today' : RANGE_NAMES[st.range] || 'This period') : 'Today';
    const pct = (now, was) => (was ? Math.round(((now - was) / was) * 100) : 0);
    const go2 = (k) => () => goTab(k);
    const metric = (label, k, value, sub, big) => h('div', { class: `hm ${big ? 'big' : ''}` }, h('button', { type: 'button', class: 'hm-l', onclick: go2(k) }, label, h('span', { class: 'chv r', 'aria-hidden': 'true' })), h('b', {}, value), sub);
    const waiting = (orders || []).filter((x) => !['completed', 'cancelled'].includes(x.status));
    const short = (c) => { const d = c / 100; return d >= 1000 ? `$${(d / 1000).toFixed(2)}K` : `$${d.toFixed(d % 1 ? 2 : 0)}`; };
    const nice = (v) => { if (v <= 1) return 400000; const u = 10 ** Math.floor(Math.log10(v)); return [1, 2, 2.5, 4, 5, 10].map((m) => m * u).find((x) => x >= v * 1.08) || 10 * u; };
    // Sales line: a running total for the period, against the period before.
    const lineChart = () => {
      const ser = st ? st.series : Array.from({ length: 24 }, (_, i) => ({ key: String(i).padStart(2, '0'), net: 0 }));
      const hourly = !st || st.unit === 'hour';
      const run = (list) => { let a = 0; return list.map((x) => (a += x.net)); };
      const cur = run(ser), prev = prevStats && prevStats.series && prevStats.series.length === ser.length ? run(prevStats.series) : null;
      const n = ser.length, nowH = new Date().getHours() + new Date().getMinutes() / 60;
      const live = st && st.to === st.today && hourly ? Math.min(n - 1, Math.floor(nowH)) : n - 1;
      const top = nice(Math.max(1, ...cur, ...(prev || [0])));
      const X = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100), Y = (v) => 100 - (v / top) * 100;
      const pts = (arr, upto = arr.length - 1) => arr.slice(0, upto + 1).map((v, i) => `${X(i).toFixed(2)},${Y(v).toFixed(2)}`).join(' ');
      const every = hourly ? 2 : Math.ceil(n / 8);
      const lab = (x) => (hourly ? `${Number(x.key) % 12 || 12} ${Number(x.key) < 12 ? 'AM' : 'PM'}` : longDay(x.key, { month: 'short', day: 'numeric' }));
      const nowAt = st && st.to === st.today && hourly ? (nowH / 23) * 100 : null;
      return h('div', { class: 'hl' },
        h('div', { class: 'hl-key' }, h('span', {}, h('i', { class: 'k-now' }), nowName), prevName && h('span', {}, h('i', { class: 'k-was' }), prevName.replace(/^last /, 'Last '))),
        h('div', { class: 'chart g2 hl-chart' },
          h('div', { class: 'chart-y', 'aria-hidden': 'true' }, [4, 3, 2, 1, 0].map((i) => h('span', { style: `bottom:${i * 25}%` }, short((top * i) / 4)))),
          h('div', { class: 'chart-plot', role: 'img', 'aria-label': `Sales ${nowName.toLowerCase()}: ${money(cur[cur.length - 1] || 0)}` }, [1, 2, 3, 4].map((i) => h('i', { class: 'gl', style: `bottom:${i * 25}%` })),
            nowAt != null && h('div', { class: 'now', style: `left:${Math.min(100, nowAt)}%` }, h('span', {}, 'Now')),
            h('div', { class: 'hl-svg', html: `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${prev ? `<polyline class="was" points="${pts(prev)}"/>` : ''}<polyline class="cur" points="${pts(cur, live)}"/></svg>` })),
          h('span'), h('div', { class: 'chart-x' }, ser.map((x, i) => h('span', { 'data-k': i % every === 0 && (i / every) % 2 ? '1' : null }, i % every === 0 ? lab(x) : '')))));
    };
    const pAvg = pv && pv.orders ? Math.round(pv.total / pv.orders) : 0;
    const change = (now, was) => { if (!was) return now ? ['up', 'New'] : ['flat', '0%']; const v = ((now - was) / was) * 100; return [v > 0 ? 'up' : v < 0 ? 'down' : 'flat', `${Math.abs(v).toFixed(2)}%`]; };
    const delta = (now, was, text) => { const [dir, label] = change(now, was); return h('small', { class: 'hm-d' }, h('b', { class: `chg ${dir}` }, dir !== 'flat' && h('i', { 'aria-hidden': 'true' }, dir === 'up' ? '↑' : '↓'), label), text ? ` ${text}` : ''); };
    const salesCard = h('div', { class: 'scard hcard' }, h('h3', { class: 'hc-h' }, 'Sales'),
      h('div', { class: 'hs' },
        h('div', { class: 'hs-l' },
          metric('Net sales', 'sales', t ? money(t.net) : '—', t && delta(t.net, pv.net, `compared to ${prevName}`), true),
          metric('Orders', 'orders', t ? String(t.orders) : '—', t && delta(t.orders, pv.orders)),
          metric('Average order size', 'r-full', t ? money(t.average) : '—', t && delta(t.average, pAvg))),
        lineChart()));
    const openTotal = waiting.reduce((a, x) => a + x.total, 0);
    const summary = h('div', { class: 'scard hcard hsum' },
      metric('Open orders', 'orders', money(openTotal), h('small', { class: 'hm-s' }, `from ${waiting.length} order${waiting.length === 1 ? '' : 's'}`), true),
      metric('Discounts', 'r-disc', t ? money(t.discounts) : '—', null, true),
      metric('Refunds', 'tx', st && st.money ? money(st.money.refunds) : '—', null, true));
    const units = t ? t.units : 0;
    const itemsCard = h('div', { class: 'scard hcard' }, h('button', { type: 'button', class: 'hc-h link', onclick: go2('r-items') }, 'Item sales', h('span', { class: 'chv r', 'aria-hidden': 'true' })),
      h('p', { class: 'hc-sub' }, `${units} item${units === 1 ? '' : 's'} sold ${nowName === 'Today' ? 'today' : nowName.toLowerCase()}`),
      st && st.items.length ? h('div', {}, h('h4', { class: 'hc-k' }, 'Top items'), h('div', { class: 'hi-list' }, [...st.items].sort((a, b) => b.sales - a.sales).slice(0, 5).map((it) => { const was = prevStats && prevStats.items ? prevStats.items.find((x) => x.name === it.name) : null; const [dir, label] = was && was.sales ? change(it.sales, was.sales) : ['none', '--']; return h('div', { class: 'hi' }, h('span', {}, it.name), h('b', {}, money(it.sales)), h('small', { class: `chg ${dir}` }, dir === 'up' || dir === 'down' ? h('i', { 'aria-hidden': 'true' }, dir === 'up' ? '↑' : '↓') : null, label)); }))) : h('p', { class: 'hc-empty' }, menu.length ? 'No items sold yet' : 'No items added'));
    const buckets = { Card: 0, Cash: 0, Other: 0 };
    for (const x of st && st.money ? st.money.tenders : []) { const k = /card/i.test(x.method) ? 'Card' : /cash/i.test(x.method) ? 'Cash' : 'Other'; buckets[k] += x.amount; }   // money taken in; refunds are shown on their own under Activity summary
    const collected = Object.values(buckets).reduce((a, b) => a + b, 0), bTop = nice(Math.max(1, ...Object.values(buckets)));
    const finCard = h('div', { class: 'scard hcard' }, h('button', { type: 'button', class: 'hc-h link', onclick: go2('tx') }, 'Finances', h('span', { class: 'chv r', 'aria-hidden': 'true' })),
      h('p', { class: 'hc-sub' }, `${money(collected)} collected ${nowName === 'Today' ? 'today' : nowName.toLowerCase()}`),
      h('h4', { class: 'hc-k' }, 'Amount collected'),
      h('div', { class: 'chart g2 hb-chart' },
        h('div', { class: 'chart-y', 'aria-hidden': 'true' }, [2, 1, 0].map((i) => h('span', { style: `bottom:${i * 50}%` }, i ? short((bTop * i) / 2) : '0'))),
        h('div', { class: 'chart-plot' }, [1, 2].map((i) => h('i', { class: 'gl', style: `bottom:${i * 50}%` })), h('div', { class: 'hb-bars' }, Object.entries(buckets).map(([k, v]) => h('div', { class: 'hb', title: `${k}: ${money(v)}` }, v > 0 && h('em', {}, money(v)), h('i', { style: `height:${v ? Math.max(2, (v / bTop) * 100) : 0}%` }))))),
        h('span'), h('div', { class: 'chart-x' }, Object.keys(buckets).map((k) => h('span', {}, k)))));
    return [h('div', { class: 'inv home2' },
      h('div', { class: 'home-top' }, h('h2', {}, 'Home'), dateFilter()),
      salesCard,
      h('h2', { class: 'home-h' }, 'Activity summary'),
      summary,
      h('div', { class: 'home-2' }, itemsCard, finCard))];
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
  const body = h('div', { class: 'ed-body', 'data-view': 'edit', 'data-mode': '', 'data-rail': (() => { try { return localStorage.getItem('pf-rail') || null; } catch { return null; } })() }, rail, h('aside', { class: 'ed-side' }, tabsEl, subnav, panel), stage);

  const openNav = new Set(); let navFor = null;
  /* One soft highlight that glides to the page you are on, instead of each row snapping on and off. */
  const glow = h('span', { class: 'rail-glow', 'aria-hidden': 'true' });
  let glowFirst = true;
  function placeGlow(settle) {
    if (!glow.isConnected) rail.prepend(glow);
    const target = rail.querySelector('.nav-kids:not([data-shut]) button[aria-current=page]') || rail.querySelector('.nav-row[aria-current=page]') || rail.querySelector('.nav-row[data-here]');
    if (!target) { glow.style.opacity = '0'; return; }
    const r = rail.getBoundingClientRect(), t = target.getBoundingClientRect();
    if (glowFirst) { glow.style.transition = 'none'; glowFirst = false; requestAnimationFrame(() => { glow.style.transition = ''; }); }
    glow.style.opacity = '1';
    glow.style.transform = `translate(${Math.round(t.left - r.left)}px, ${Math.round(t.top - r.top + rail.scrollTop)}px)`;
    glow.style.width = `${Math.round(t.width)}px`; glow.style.height = `${Math.round(t.height)}px`;
    glow.classList.toggle('sub', !!target.closest('.nav-kids'));
    // Lists open and close with a short glide; follow them as they move.
    if (settle) for (const ms of [120, 260, 420]) setTimeout(() => placeGlow(false), ms);
  }
  /* ---------- Back-office pages laid out like the reference screens ---------- */
  /* ======================= Back-office pages laid out after the reference screens ======================= */
  const CL = {};
  const clState = { txTab: 'payments', txBy: 'pid', txQ: '', txTender: 'All', txCard: 'All', ordTab: 'orders', ordBy: 'customer', ordQ: '', ordPay: 'All', ordStatus: 'All', itemsTab: 'rev', discTab: 'rev', remTab: 'rev', discQ: '', giftLoad: 'all', viewBy: 'hour', metric: 'net', cmp: 'week', allDay: 'all', type: '', cols: {}, sort: {}, peer: 'prev3', peerShift: 0, stmtYear: new Date().getFullYear(), apptEmp: null, apptAttr: null, empPage: 0, tsMode: 'day', tsDay: '', tsQ: '', tsView: 'all', schedSort: 'first', schedQ: '', schedSearch: false, schedRows: new Set(['events', 'open', 'team']), empEdit: '', empRole: 'All', empStatus: 'All', empQ: '', custKey: '', custQ: '', custShow: 'Everyone', apptDraft: null, giftSetup: false, catOpen: new Set(), catSel: new Set(), salesTab: 'trends', catQ: '', listQ: {}, bannerOff: false, ooTab: 'settings', openPromo: false };
  const NORES = 'Try again with a different timeframe, filters or search criteria.';
  const NORES2 = 'Try again with a different timeframe, filter, and search combination.';
  const SVG = {
    cols: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15M14.5 4.5v15"/></svg>',
    users: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.5" cy="9" r="2.6"/><path d="M15.5 14.2c2.4-.3 4.5 1.3 5 4.8"/></svg>',
    find: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M14 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2H9"/><path d="M14 3.5 18.5 8v2"/><circle cx="15" cy="15" r="3.5"/><path d="m17.6 17.6 2.9 2.9"/></svg>',
    list: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/></svg>',
    plusc: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    warn: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.4v.1"/></svg>',
    tri: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.8 2.8 19.5h18.4z"/><path d="M12 9.5v4.5M12 16.8v.1"/></svg>',
    heart: '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M12 20s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    cal: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    half: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>',
    upload: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 16V8M8.5 11.5 12 8l3.5 3.5"/></svg>',
  };
  // Line drawings for empty pages, drawn for this app.
  const CLART = {
    look: '<svg viewBox="0 0 220 180" width="220" height="180" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="110" cy="92" r="70" fill="var(--art-bg)" stroke="none"/><circle cx="98" cy="84" r="30"/><path d="m120 106 26 26"/><path d="M90 76c2-6 14-7 16 0 1 5-8 7-8 13M98 98v1"/><path d="M40 40h10M45 35v10M170 140h10M175 135v10" stroke="var(--brand)"/></svg>',
    person: '<svg viewBox="0 0 240 200" width="240" height="200" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="120" cy="104" r="78" fill="var(--art-bg)" stroke="none"/><circle cx="112" cy="84" r="20"/><path d="M78 158c4-28 20-44 34-44s30 16 34 44"/><path d="M150 72l18-22 20 14 22-30" stroke="var(--brand)"/><rect x="58" y="96" width="26" height="24" rx="3"/><path d="M71 102v12M66 106h10" stroke="var(--brand)"/></svg>',
    stars: '<svg viewBox="0 0 200 180" width="200" height="180"><g stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M70 60l8 10 12-2-4 12 8 9-12 2-4 12-8-10-12 2 4-12-8-9 12-2z" fill="var(--brand)"/><path d="M118 34l8 10 12-2-4 12 8 9-12 2-4 12-8-10-12 2 4-12-8-9 12-2z" fill="var(--art-bg)"/><path d="M122 96l8 10 12-2-4 12 8 9-12 2-4 12-8-10-12 2 4-12-8-9 12-2z" fill="var(--brand)" opacity=".55"/></g><path d="M78 80l4 4 7-8M126 54l4 4 7-8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
    bills: '<svg viewBox="0 0 320 220" width="320" height="220" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="70" y="70" width="90" height="70" rx="8"/><path d="M50 160h130l-14-20H64z"/><rect x="92" y="84" width="30" height="40" rx="4"/><path d="M98 96h18M98 106h4M108 106h4M98 114h4M108 114h4"/><path d="M100 28l60-6 6 40-60 6zM100 28l33 22 27-28" /><rect x="220" y="60" width="44" height="54" rx="4"/><path d="M234 78h16M242 72v24M236 90h12" stroke="var(--brand)"/><rect x="214" y="132" width="50" height="22" rx="11" stroke="var(--brand)"/><circle cx="238" cy="186" r="24"/><path d="m226 186 8 8 16-16" stroke="var(--brand)"/></svg>',
  };
  const TILE_SVG = (d) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const TILES = {
    look: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    tag: '<path d="M3.5 12.2V4.8c0-.7.6-1.3 1.3-1.3h7.4l8.3 8.3a1.3 1.3 0 0 1 0 1.8l-7.4 7.4a1.3 1.3 0 0 1-1.8 0z"/><circle cx="8.3" cy="8.3" r="1.4"/>',
    tip: '<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.2c-.4-.9-1.4-1.5-2.6-1.5-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2.1 2.7.9 2.7 2.2-1.2 2.1-2.7 2.1c-1.3 0-2.4-.6-2.8-1.6M12 6.3v1.4M12 16.3v1.4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v7.5h14V12M12 8v11.5M12 8c-1.5-3-5-3.3-5-1.2C7 8 9 8 12 8zm0 0c1.5-3 5-3.3 5-1.2C17 8 15 8 12 8z"/>',
    chat: '<path d="M4.5 6.5c0-1.1.9-2 2-2h11c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H10l-4 3.5v-3.5h.5c-1.1 0-2-.9-2-2z"/>',
    bank: '<path d="m3.5 9.5 8.5-5 8.5 5M5.5 10v7M10 10v7M14 10v7M18.5 10v7M3.5 19.5h17"/>',
  };
  const clArt = (k) => h('div', { class: 'cl-tile', html: TILE_SVG(TILES[k] || TILES.look) });
  const fmtD = (d) => longDay(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  function periodOf() {
    const t = isoDay(new Date());
    if (salesRange === 'custom' && salesFrom && salesTo) return [salesFrom, salesTo];
    if (salesRange === 'yesterday') { const y = addDays(t, -1); return [y, y]; }
    if (salesRange === 'week') return [addDays(t, -new Date(`${t}T12:00:00Z`).getUTCDay()), t];
    if (salesRange === 'month') return [`${t.slice(0, 8)}01`, t];
    if (salesRange === 'last30') return [addDays(t, -29), t];
    return [t, t];
  }
  const rangeText = () => { const [f, t] = periodOf(); return f === t ? `${fmtD(f)}, 12:00 AM - 11:59 PM` : `${fmtD(f)} - ${fmtD(t)}`; };
  const isTodayOnly = () => { const [f, t] = periodOf(); return f === t && t === isoDay(new Date()); };
  const caret = () => h('i', { class: 'chv d', 'aria-hidden': 'true' });
  // The date row: a period drop-down, any other controls, then the exact dates with arrows underneath.
  function cDates(...extra) {
    const t = isoDay(new Date()), [f, to] = periodOf();
    const label = salesRange === 'custom' && salesFrom ? (salesFrom === salesTo ? longDay(salesFrom, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Custom') : RANGE_NAMES[salesRange] || 'Today';
    const btn = h('button', { type: 'button', class: 'cl-sel', 'aria-haspopup': 'dialog', onclick: () => calPop(btn, t) }, h('span', { class: 'cl-ic', html: SVG.cal }), h('span', { class: 'grow' }, label), caret());
    const span = Math.round((Date.parse(to) - Date.parse(f)) / 86400000) + 1;
    const shift = (dir) => { let a = addDays(f, dir * span), b = addDays(to, dir * span); if (b > t) { b = t; a = addDays(t, 1 - span); } setRange('custom', a, b); };
    return [h('div', { class: 'cl-ctrls' }, btn, ...extra.filter(Boolean)),
      h('div', { class: 'cl-range' }, h('b', {}, rangeText()), h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Earlier', onclick: () => shift(-1) }, chev('l')), h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Later', disabled: to >= t, onclick: () => shift(1) }, chev('r')))];
  }
  function cDrop(options, value, onPick, o = {}) {
    const cur = options.find(([k]) => k === value) || options[0];
    const b = h('button', { type: 'button', class: `cl-sel ${o.cls || ''}`, 'aria-haspopup': 'menu', onclick: () => popover(b, (close) => h('div', { class: 'cl-menu' }, options.map(([k, l]) => h('button', { type: 'button', class: k === value ? 'on' : '', onclick: () => { close(); onPick(k); } }, h('span', {}, l), k === value && h('i', { class: 'cl-tick' }, '✓')))), 'left') },
      o.icon && h('span', { class: 'cl-ic', html: SVG[o.icon] || '' }), h('span', { class: 'grow' }, `${o.prefix || ''}${cur ? cur[1] : ''}`), caret());
    return b;
  }
  const cFilters = (onclick, n) => h('button', { type: 'button', class: 'fbtn', onclick }, ic('sliders', 18), h('span', {}, 'Filters'), n > 0 && h('em', {}, String(n)));
  const cHead = (eyebrow, title, tools, desc) => h('div', { class: 'cl-head' }, h('div', { class: 'cl-titles' }, eyebrow && h('small', { class: 'cl-eyebrow' }, eyebrow), h('h1', {}, title), desc && h('p', { class: 'cl-desc' }, desc)), tools && h('div', { class: 'cl-tools' }, tools));
  const exportBtn = (k) => h('button', { type: 'button', class: 'btn soft cl-btn', onclick: () => exportReport(k) }, ic('dl', 18), 'Export');
  const printBtn = () => h('button', { type: 'button', class: 'btn soft cl-btn', onclick: () => printLight() }, ic('print', 18), 'Print');
  const dots = (k) => moreBtn([['Print', () => printLight()], ['Export to Excel or CSV', () => exportReport(k)], ['Report settings', () => reportSettings()], ['Sync with QuickBooks', () => quickbooks()]]);
  const cFigs = (items) => h('div', { class: 'cl-figs' }, items.filter(Boolean).map(([l, v, sub, dotted]) => h('div', { class: 'cl-fig' }, h('span', { class: dotted ? 'dot' : '' }, l), h('b', {}, v), sub != null && sub !== false && h('small', {}, sub))));
  const cTabs = (opts, val, set) => h('div', { class: 'cl-tabs', role: 'tablist' }, opts.map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === val), onclick: () => { set(k); paintPanel(); } }, l)));
  const cEmpty = (title, text, art) => h('div', { class: 'cl-empty' }, art && clArt(art), h('b', {}, title), text && h('p', {}, text));
  const cH2 = (t, right) => h('div', { class: 'cl-h2' }, h('h2', {}, t), right);
  // Typing in a search box repaints the page; the box keeps focus and the cursor stays at the end.
  function cSearch(ph, val, onq) {
    return h('label', { class: 'tsearch cl-search' }, ic('search', 18), h('input', { type: 'search', placeholder: ph, value: val, 'aria-label': ph, oninput: (e) => { onq(e.target.value); paintPanel(); const el = panel.querySelector(`input[placeholder="${ph}"]`); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } } }));
  }
  function cTable(key, cols, rows, empty) {
    const hidden = clState.cols[key] || new Set();
    const vis = cols.filter((c) => !hidden.has(c.k));
    const s = clState.sort[key];
    let rs = rows;
    if (s) { const c = cols.find((x) => x.k === s.k); if (c && c.sort) rs = [...rows].sort((a, b) => { const x = c.sort(a), y = c.sort(b); return (x > y ? 1 : x < y ? -1 : 0) * s.dir; }); }
    const th = (c) => h('th', { class: `${c.sort ? 'srt' : ''} ${c.r ? 'num' : ''}`, onclick: c.sort ? () => { clState.sort[key] = { k: c.k, dir: s && s.k === c.k ? -s.dir : 1 }; paintPanel(); } : null }, c.l, c.sort && h('span', { class: 'srt-ic' }, s && s.k === c.k ? (s.dir > 0 ? '↑' : '↓') : '↕'));
    return h('div', { class: 'scard cl-table' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, vis.map(th))),
      h('tbody', {}, rs.map((r) => h('tr', { class: r.onclick ? 'click' : '', onclick: r.onclick || null }, vis.map((c) => h('td', { class: c.r ? 'num' : '' }, r[c.k] ?? ''))))))), !rs.length && empty);
  }
  function colsBtn(key, cols) {
    const b = h('button', { type: 'button', class: 'fbtn', onclick: () => popover(b, () => { const hid = (clState.cols[key] ||= new Set()); return h('div', { class: 'cl-menu' }, h('p', { class: 'tb-k' }, 'Columns'), cols.map((c) => h('label', { class: 'rp-opt' }, h('input', { type: 'checkbox', checked: !hid.has(c.k), onchange: (e) => { if (e.target.checked) hid.delete(c.k); else hid.add(c.k); paintPanel(); } }), h('span', {}, c.l)))); }, 'right') }, h('span', { class: 'cl-ic', html: SVG.cols }), h('span', {}, 'Columns'));
    return b;
  }
  // Right-hand panels for filters and choices.
  function rPanel(title, build) {
    sheet((close) => { const body = build(close); return [h('div', { class: 'rp-h' }, h('h2', {}, title), h('button', { type: 'button', class: 'ss-x', 'aria-label': 'Close', onclick: close }, ic('x', 20))), h('div', { class: 'rp-b' }, body.el), h('div', { class: 'rp-f' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), h('button', { type: 'button', class: 'btn', onclick: () => { body.apply(); close(); paintPanel(); } }, 'Apply'))]; }, 'drawer rpanel');
  }
  function rpRadios(title, opts, val, set, search) {
    let v = val; const list = h('div', { class: 'rp-opts' });
    const draw = (q = '') => list.replaceChildren(...opts.filter((o) => !q || o.toLowerCase().includes(q)).map((o) => h('label', { class: 'rp-opt' }, h('input', { type: 'radio', name: title, checked: o === v, onchange: () => { v = o; set(o); } }), h('span', {}, o))));
    draw();
    return rpSec(title, [search && h('label', { class: 'tsearch' }, ic('search', 18), h('input', { type: 'search', placeholder: search, oninput: (e) => draw(e.target.value.trim().toLowerCase()) })), list]);
  }
  function rpChecks(title, opts, chosen, icons) {
    const boxes = opts.map((o) => { const cb = h('input', { type: 'checkbox', checked: chosen.has(o) }); cb.onchange = () => { if (cb.checked) chosen.add(o); else chosen.delete(o); }; return h('label', { class: 'rp-opt' }, cb, icons && icons[o] && h('span', { class: 'rp-oi', html: icons[o] }), h('span', {}, o)); });
    return title ? h('div', { class: 'rp-group' }, h('h3', { class: 'rp-gt' }, title), h('div', { class: 'rp-opts' }, boxes)) : h('div', { class: 'rp-opts' }, boxes);
  }
  function rpSec(title, kids) {
    const body = h('div', { class: 'rp-body' }, ...kids.filter(Boolean));
    const head = h('button', { type: 'button', class: 'rp-head', 'aria-expanded': 'true', onclick: () => { const o = head.getAttribute('aria-expanded') !== 'true'; head.setAttribute('aria-expanded', String(o)); body.hidden = !o; } }, h('b', {}, title), h('i', { class: 'chv u' }));
    return h('div', { class: 'rp-sec' }, head, body);
  }
  // Data the pages share.
  const needStats = () => { if (!stats || (!stats.failed && statsFor && statsFor !== rq().toString())) { stats = null; loadStats(); } return stats && !stats.failed ? stats : null; };
  const needTx = () => { if (!txData) { txData = { loading: true }; api('GET', `/api/sites/${id}/transactions?${rq()}`).then((r) => { txData = r; if (CL[tab]) paintPanel(); }).catch(() => { txData = { payments: [], refunds: [], totals: { payments: 0, count: 0, refunds: 0, refundCount: 0, net: 0 }, tenders: [] }; if (CL[tab]) paintPanel(); }); } return txData.loading ? null : txData; };
  const clCache = {};
  const NEED_FB = { shifts: () => ({ today: isoDay(new Date()), people: [], shifts: [] }), gift: () => ({ cards: [] }), leads: () => ({ leads: [] }), devices: () => ({ devices: [] }), customers: () => ({ customers: [] }) };
  function need(key, path) {
    const c = clCache[key];
    if (!c) { clCache[key] = { loading: true }; api('GET', `/api/sites/${id}/${path}`).then((r) => { clCache[key] = { data: r }; if (CL[tab]) paintPanel(); }).catch(() => { clCache[key] = { data: NEED_FB[key] ? NEED_FB[key]() : {} }; if (CL[tab]) paintPanel(); }); return null; }
    return c.loading ? null : c.data;
  }
  const forget = (...keys) => keys.forEach((k) => delete clCache[k]);
  const cmpCache = {};
  function cmpStats(f, t) {
    const key = `${f}|${t}`;
    if (!cmpCache[key]) { cmpCache[key] = { loading: true }; api('GET', `/api/sites/${id}/stats?range=custom&from=${f}&to=${t}`).then((r) => { cmpCache[key] = r; if (CL[tab]) paintPanel(); }).catch(() => { cmpCache[key] = { failed: true }; }); }
    const c = cmpCache[key]; return c.loading || c.failed ? null : c;
  }
  const loadingPage = (title, eyebrow) => [h('div', { class: 'cl' }, cHead(eyebrow, title), h('div', { class: 'inv-kpis' }, skel(4, 'kpi')), skel(4, 'row'))];
  const shortMoney = (c) => { const d = c / 100; return d >= 1000 ? `$${(d / 1000).toFixed(2)}K` : `$${Math.round(d)}`; };
  const niceTop = (v, isMoney) => { if (v <= 0) return isMoney ? 400000 : 4; const u = 10 ** Math.floor(Math.log10(v)); return [1, 2, 2.5, 4, 5, 10].map((m) => m * u).find((x) => x >= v * 1.08) || 10 * u; };
  function cChart(ser, unit, val, isMoney) {
    const vals = ser.map(val), top = niceTop(Math.max(0, ...vals), isMoney);
    const lab = (x) => (unit === 'hour' ? `${Number(x.key) % 12 || 12} ${Number(x.key) < 12 ? 'AM' : 'PM'}` : longDay(x.key, { month: 'short', day: 'numeric' }));
    const every = unit === 'hour' ? 3 : Math.max(1, Math.ceil(ser.length / 8));
    const nowAt = unit === 'hour' && isTodayOnly() && ser.length === 24 ? ((new Date().getHours() + new Date().getMinutes() / 60) / 24) * 100 : null;
    const yl = (v) => (isMoney ? shortMoney(v) : String(Math.round(v)));
    return h('div', { class: 'chart g2 cl-chart' },
      h('div', { class: 'chart-y', 'aria-hidden': 'true' }, [4, 3, 2, 1, 0].map((i) => h('span', { style: `bottom:${i * 25}%` }, yl((top * i) / 4)))),
      h('div', { class: 'chart-plot' }, [1, 2, 3, 4].map((i) => h('i', { class: 'gl', style: `bottom:${i * 25}%` })), nowAt != null && h('div', { class: 'now', style: `left:${nowAt}%` }, h('span', {}, 'Now')),
        h('div', { class: 'chart-bars' }, ser.map((x, i) => h('div', { class: 'cbar', title: `${lab(x)}: ${isMoney ? money(vals[i]) : vals[i]}` }, vals[i] > 0 && h('i', { class: 'on', style: `height:${Math.max(3, (vals[i] / top) * 100)}%` }))))),
      h('span'), h('div', { class: 'chart-x' }, ser.map((x, i) => h('span', { 'data-k': i % every === 0 && (i / every) % 2 ? '1' : null }, i % every === 0 ? lab(x) : ''))));
  }
  const top5 = (title, k, list, val, fmt) => { const ls = [...list].sort((a, b) => val(b) - val(a)).filter((x) => val(x) > 0); const mx = ls.length ? val(ls[0]) : 1;
    return h('div', { class: 'scard cl-card' }, h('button', { type: 'button', class: 'hc-h link', onclick: () => k && goTab(k) }, title, h('span', { class: 'chv r' })),
      ls.length ? h('div', { class: 'cl-top' }, ls.slice(0, 5).map((x) => h('div', { class: 'cl-topr' }, h('span', {}, x.name), h('i', {}, h('b', { style: `width:${(val(x) / mx) * 100}%` })), h('em', {}, fmt(val(x)))))) : cEmpty('No results found', NORES)); };
  const pill = (t, cls = '') => h('span', { class: `cl-pill ${cls}` }, t);
  const dayOfMs = (ms) => isoDay(new Date(ms));
  const inPeriod = (ms) => { const [f, t] = periodOf(), d = dayOfMs(ms); return d >= f && d <= t; };

  /* ---------- Reports ---------- */
  // Sales overview, Full Report: every sales figure for the period beside the comparison period.
  function fullReport(st, f, to, span) {
    const pf = clState.cmp === 'week' ? addDays(f, -7) : addDays(f, -span), pt = clState.cmp === 'week' ? addDays(to, -7) : addDays(f, -1);
    const pv = cmpStats(pf, pt), t = st.totals, p2 = pv ? pv.totals : null;
    const col = (a, b) => (a || 0) - (b || 0);
    const rows = [
      ['Gross sales', (x) => x.gross, money], ['Discounts', (x) => -(x.discounts || 0), money], ['Refunds', (x) => -(x.refunds || 0), money],
      ['Net sales', (x) => x.net, money, true], ['Taxes', (x) => x.tax, money], ['Fees and service charges', (x) => x.fees, money], ['Tips', (x) => x.tips, money],
      ['Total', (x) => x.total, money, true], ['Orders', (x) => x.orders, String], ['Average ticket size', (x) => (x.orders ? Math.round(x.total / x.orders) : 0), money], ['Items sold', (x) => x.units, String],
    ];
    const pct = (a, b) => (!p2 ? '—' : !b ? (a ? 'New' : '0.00%') : `${(((a - b) / Math.abs(b)) * 100).toFixed(2)}%`);
    const range = (a, b) => (a === b ? longDay(a, { month: 'short', day: 'numeric', year: 'numeric' }) : `${longDay(a, { month: 'short', day: 'numeric' })} – ${longDay(b, { month: 'short', day: 'numeric', year: 'numeric' })}`);
    return [h('div', { class: 'scard cl-table cl-fullrep' }, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Sales'), h('th', { class: 'num' }, range(f, to)), h('th', { class: 'num' }, range(pf, pt)), h('th', { class: 'num' }, 'Change'))),
      h('tbody', {}, rows.map(([label, get, fmt, strong]) => { const a = get(t), b = p2 ? get(p2) : null; const d = b == null ? null : col(a, b);
        return h('tr', { class: strong ? 'tot' : '' }, h('td', {}, strong ? h('b', {}, label) : label), h('td', { class: 'num' }, strong ? h('b', {}, fmt(a)) : fmt(a)), h('td', { class: 'num muted' }, b == null ? '—' : fmt(b)),
          h('td', { class: `num ${d > 0 ? 'up' : d < 0 ? 'down' : ''}` }, b == null ? '—' : pct(a, b))); })))))];
  }
  CL.sales = () => {
    const st = needStats(); if (!st) return loadingPage('Sales', 'Reports');
    const t = st.totals, [f, to] = periodOf();
    const span = Math.round((Date.parse(to) - Date.parse(f)) / 86400000) + 1;
    const typeOpts = [['', 'All order types'], ...Object.entries(ORDER_METHODS).map(([k, m]) => [k, m.name])];
    const metricOpts = [['net', 'Net sales'], ['orders', 'Orders'], ['tips', 'Tips'], ['tax', 'Taxes']];
    return [h('div', { class: 'cl' }, cHead('Reports', 'Sales', [exportBtn('sales'), dots('sales')]),
      cTabs([['trends', 'Trends'], ['full', 'Full Report']], clState.salesTab, (k) => { clState.salesTab = k; }),
      ...cDates(cDrop([['week', span === 1 ? 'This day last week' : 'Same days last week'], ['prev', 'Previous period']], clState.cmp, (k) => { clState.cmp = k; paintPanel(); }, { prefix: 'Compared to:  ' }),
        cFilters(() => rPanel('Filters', () => { let v = clState.type; return { el: rpRadios('Order type', typeOpts.map((x) => x[1]), (typeOpts.find((x) => x[0] === v) || typeOpts[0])[1], (o) => { v = typeOpts.find((x) => x[1] === o)[0]; }), apply: () => { clState.type = v; stats = null; } }; }), clState.type ? 1 : 0)),
      ...(clState.salesTab === 'full' ? fullReport(st, f, to, span) : [cFigs([['Net sales', money(t.net), null, true], ['Gross sales', money(t.gross), null, true], ['Amount collected', money(st.money ? st.money.collected : 0), null, true], ['Average ticket size', money(t.average), null, true], ['Orders', String(t.orders), null, true]]),
      h('div', { class: 'scard cl-card' }, h('div', { class: 'cl-cardh' }, h('button', { type: 'button', class: 'hc-h link', onclick: () => goTab('r-full') }, 'Net sales', h('span', { class: 'chv r' })), cDrop(metricOpts, clState.metric, (k) => { clState.metric = k; paintPanel(); }, { icon: 'list' })),
        t.orders ? cChart(st.series, st.unit, (x) => x[clState.metric] || 0, clState.metric !== 'orders') : cEmpty('No results found', NORES)),
      h('div', { class: 'cl-two' }, top5('Top 5 categories', 'r-items', st.categories, (x) => x.sales, money), top5('Top 5 card types', 'r-tender', (st.money ? st.money.tenders : []).map((x) => ({ name: x.method, amount: x.amount })), (x) => x.amount, money),
        top5('Top 5 items', 'r-items', st.items, (x) => x.sales, money), top5('Top 5 revenue classes', 'r-items', st.revenue, (x) => x.sales, money))]))];
  };
  CL['r-full'] = () => {
    const st = needStats(); if (!st) return loadingPage('Sales Report', 'Reports');
    const t = st.totals;
    const win = { all: [0, 24], morning: [5, 11], midday: [11, 16], evening: [16, 24] }[clState.allDay];
    const ser = st.unit === 'hour' ? st.series.map((x) => (Number(x.key) >= win[0] && Number(x.key) < win[1] ? x : { ...x, net: 0, orders: 0, tax: 0, tips: 0 })) : st.series;
    const hourly = st.unit === 'hour';
    const viewOpts = hourly ? [['hour', 'Hourly sales'], ['type', 'Order type']] : [['day', 'Daily sales'], ['type', 'Order type']];
    if (!viewOpts.some(([k]) => k === clState.viewBy)) clState.viewBy = viewOpts[0][0];
    const lab = (x) => (hourly ? `${Number(x.key) % 12 || 12}:00 ${Number(x.key) < 12 ? 'AM' : 'PM'}` : longDay(x.key, { weekday: 'short', month: 'short', day: 'numeric' }));
    const salesRows = clState.viewBy === 'type' ? st.methods.filter((m) => m.orders).map((m) => ({ when: ORDER_METHODS[m.method]?.name || m.method, orders: String(m.orders), net: money(m.net), total: money(m.total), _n: m.net }))
      : ser.filter((x) => x.orders).map((x) => ({ when: lab(x), orders: String(x.orders), net: money(x.net), tax: money(x.tax), tips: money(x.tips), _n: x.net }));
    const tenders = st.money ? st.money.tenders : [];
    return [h('div', { class: 'cl' }, cHead('Reports', 'Sales Report', [exportBtn('r-full'), dots('r-full')]),
      ...cDates(cDrop([['all', 'All day'], ['morning', 'Morning (5 AM – 11 AM)'], ['midday', 'Midday (11 AM – 4 PM)'], ['evening', 'Evening (4 PM – midnight)']], clState.allDay, (k) => { clState.allDay = k; paintPanel(); }, { icon: 'clock' }), cFilters(() => rPanel('Filters', () => { const typeOpts = [['', 'All order types'], ...Object.entries(ORDER_METHODS).map(([k, m]) => [k, m.name])]; let v = clState.type; return { el: rpRadios('Order type', typeOpts.map((x) => x[1]), (typeOpts.find((x) => x[0] === v) || typeOpts[0])[1], (o) => { v = typeOpts.find((x) => x[1] === o)[0]; }), apply: () => { clState.type = v; stats = null; } }; }), clState.type ? 1 : 0)),
      h('div', { class: 'scard cl-card cl-sum' }, h('div', { class: 'cl-sumL' },
        h('div', { class: 'cl-fig big' }, h('span', { class: 'dot' }, 'Net sales'), h('b', {}, money(t.net)), h('small', { class: 'strong' }, `from ${t.orders} order${t.orders === 1 ? '' : 's'}`)),
        h('div', { class: 'cl-sumrow' }, h('div', { class: 'cl-fig' }, h('span', { class: 'dot' }, 'Amount collected'), h('b', {}, money(st.money ? st.money.collected : 0))), h('div', { class: 'cl-fig' }, h('span', { class: 'dot' }, 'Gross sales'), h('b', {}, money(t.gross))))),
        h('div', { class: 'cl-sumR' }, h('h3', { class: 'cl-sub' }, hourly ? 'Hourly view' : 'Daily view'), cChart(ser, st.unit, (x) => x.net, true))),
      cH2('Sales'), h('label', { class: 'cl-lab' }, 'View by'), h('div', {}, cDrop(viewOpts, clState.viewBy, (k) => { clState.viewBy = k; paintPanel(); })),
      cTable('r-full-sales', clState.viewBy === 'type' ? [{ k: 'when', l: 'Order type' }, { k: 'orders', l: 'Orders', r: 1 }, { k: 'net', l: 'Net sales', r: 1, sort: (r) => r._n }, { k: 'total', l: 'Total', r: 1 }] : [{ k: 'when', l: hourly ? 'Hour' : 'Day' }, { k: 'orders', l: 'Orders', r: 1 }, { k: 'net', l: 'Net sales', r: 1, sort: (r) => r._n }, { k: 'tax', l: 'Tax', r: 1 }, { k: 'tips', l: 'Tips', r: 1 }], salesRows, cEmpty('No results found', NORES2)),
      cH2('Tender types'),
      cTable('r-full-tender', [{ k: 'm', l: 'Tender' }, { k: 'c', l: 'Payments', r: 1 }, { k: 'a', l: 'Amount', r: 1 }, { k: 'rf', l: 'Refunds', r: 1 }], tenders.map((x) => ({ m: x.method, c: String(x.count), a: money(x.amount), rf: money(x.refunds || 0) })), cEmpty('No results found', NORES2)))];
  };
  CL['r-items'] = () => {
    const st = needStats(); if (!st) return loadingPage('Item sales', 'Reports');
    const cols = [{ k: 'n', l: 'Item', sort: (r) => r._name }, { k: 'c', l: 'Category' }, { k: 'q', l: 'Sold', r: 1, sort: (r) => r._q }, { k: 's', l: 'Net sales', r: 1, sort: (r) => r._s }, { k: 'p', l: '% of sales', r: 1 }];
    const rows = clState.itemsTab === 'rev' ? st.items.map((x) => ({ n: h('b', {}, x.name), c: x.category, q: String(x.qty), s: money(x.sales), p: `${st.totals.gross ? Math.round((x.sales / st.totals.gross) * 100) : 0}%`, _name: x.name, _q: x.qty, _s: x.sales })) : [];
    return [h('div', { class: 'cl' }, cHead('Reports', 'Item sales', [exportBtn('r-items'), dots('r-items')]), ...cDates(cFilters(() => rPanel('Filters', () => { let v = clState.type; const typeOpts = [['', 'All order types'], ...Object.entries(ORDER_METHODS).map(([k, m]) => [k, m.name])]; return { el: rpRadios('Order type', typeOpts.map((x) => x[1]), (typeOpts.find((x) => x[0] === v) || typeOpts[0])[1], (o) => { v = typeOpts.find((x) => x[1] === o)[0]; }), apply: () => { clState.type = v; stats = null; } }; }), clState.type ? 1 : 0)),
      cTabs([['rev', 'Revenue items'], ['non', 'Non revenue items']], clState.itemsTab, (k) => { clState.itemsTab = k; }),
      rows.length ? cTable('r-items', cols, rows, null) : cEmpty('No results found', NORES, 'look'))];
  };
  CL['r-peer'] = () => {
    const months = { prev3: 3, prev6: 6, prev12: 12 }[clState.peer];
    const now = new Date(), endM = new Date(Date.UTC(now.getFullYear(), now.getMonth() - clState.peerShift * months, 0)), startM = new Date(Date.UTC(endM.getUTCFullYear(), endM.getUTCMonth() - months + 1, 1));
    const f = startM.toISOString().slice(0, 10), t = endM.toISOString().slice(0, 10);
    return [h('div', { class: 'cl' }, cHead('Reports', 'Peer insights', null, 'Compare your sales with local businesses similar to you in gross sales and business type. This aggregated peer group data helps you compare your business performance to your peers and identify growth opportunities.'),
      h('div', { class: 'cl-ctrls' }, cDrop([['prev3', 'Previous 3 months'], ['prev6', 'Previous 6 months'], ['prev12', 'Previous 12 months']], clState.peer, (k) => { clState.peer = k; clState.peerShift = 0; paintPanel(); }, { icon: 'cal' })),
      h('div', { class: 'cl-range' }, h('b', {}, `${fmtD(f)} - ${fmtD(t)}`), h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Earlier', onclick: () => { clState.peerShift++; paintPanel(); } }, chev('l')), h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Later', disabled: clState.peerShift === 0, onclick: () => { clState.peerShift--; paintPanel(); } }, chev('r'))),
      h('div', { class: 'scard cl-card' }, cEmpty('Not enough businesses to compare yet', 'Peer comparisons appear once enough similar businesses near you use Processor Freedom.', 'look')))];
  };
  CL['r-emp'] = () => {
    const st = needStats(); if (!st) return loadingPage('Employee sales', 'Reports');
    const e = st.employees;
    return [h('div', { class: 'cl' }, cHead('Reports', 'Employee sales', [exportBtn('r-emp'), dots('r-emp')]), ...cDates(),
      cFigs([['Net sales', money(st.totals.net), null, true], ['Orders', String(st.totals.orders), null, true], ['Tips', money(st.totals.tips), null, true], ['Employees', String(e.filter((x) => x.name !== 'Not recorded').length), null, true]]),
      cH2('Employee detail', colsBtn('r-emp', [{ k: 'n', l: 'Employee' }, { k: 'o', l: 'Orders' }, { k: 's', l: 'Net sales' }, { k: 't', l: 'Tips' }, { k: 'a', l: 'Total' }])),
      cTable('r-emp', [{ k: 'n', l: 'Employee', sort: (r) => r._n }, { k: 'o', l: 'Orders', r: 1, sort: (r) => r._o }, { k: 's', l: 'Net sales', r: 1, sort: (r) => r._s }, { k: 't', l: 'Tips', r: 1 }, { k: 'a', l: 'Total', r: 1 }], e.map((x) => ({ n: h('b', {}, x.name), o: String(x.orders), s: money(x.net), t: money(x.tips), a: money(x.total), _n: x.name, _o: x.orders, _s: x.net })), cEmpty('No results found', NORES)))];
  };
  CL['r-tender'] = () => {
    const st = needStats(); if (!st) return loadingPage('Tender & card types', 'Reports');
    const m = st.money || { collected: 0, refunds: 0, tenders: [], count: 0 };
    return [h('div', { class: 'cl' }, cHead('Reports', 'Tender & card types', [exportBtn('r-tender'), dots('r-tender')]), ...cDates(),
      cFigs([['Amount collected', money(m.collected), `from ${m.count || 0} payment${m.count === 1 ? '' : 's'}`, true], ['Refunds', money(m.refunds), null, true], ['Net', money(m.collected - m.refunds), null, true]]),
      cH2('Tender detail', colsBtn('r-tender', [{ k: 't', l: 'Tender type' }, { k: 'c', l: 'Payments' }, { k: 'a', l: 'Amount' }, { k: 'r', l: 'Refunds' }, { k: 'n', l: 'Net' }])),
      cTable('r-tender', [{ k: 't', l: 'Tender type' }, { k: 'c', l: 'Payments', r: 1 }, { k: 'a', l: 'Amount', r: 1, sort: (r) => r._a }, { k: 'r', l: 'Refunds', r: 1 }, { k: 'n', l: 'Net', r: 1 }], m.tenders.map((x) => ({ t: h('b', {}, x.method), c: String(x.count), a: money(x.amount), r: money(x.refunds || 0), n: money(x.amount - (x.refunds || 0)), _a: x.amount })), cEmpty('No results found', NORES)))];
  };
  CL['r-disc'] = () => {
    const st = needStats(); if (!st) return loadingPage('Discounts', 'Reports');
    const uses = st.promos.reduce((a, x) => a + x.uses, 0);
    const kind = (n) => (/^THANKS/.test(n) ? 'Reward' : /^GIFT|^GC/i.test(n) ? 'Gift card' : n === 'Other discount' ? 'Discount' : 'Promo code');
    const q = clState.discQ.trim().toLowerCase();
    const rows = clState.discTab === 'rev' ? st.promos.filter((x) => !q || x.name.toLowerCase().includes(q)).map((x) => ({ n: h('b', {}, x.name), k: kind(x.name), u: String(x.uses), a: money(x.amount), _a: x.amount, _u: x.uses })) : [];
    const cols = [{ k: 'n', l: 'Discount name' }, { k: 'k', l: 'Type' }, { k: 'u', l: 'Times applied', r: 1, sort: (r) => r._u }, { k: 'a', l: 'Amount', r: 1, sort: (r) => r._a }];
    return [h('div', { class: 'cl' }, cHead('Reports', 'Discounts', [exportBtn('r-disc'), dots('r-disc')]), ...cDates(cFilters(() => rPanel('Filters', () => { let v = clState.type; const typeOpts = [['', 'All order types'], ...Object.entries(ORDER_METHODS).map(([k, m2]) => [k, m2.name])]; return { el: rpRadios('Order type', typeOpts.map((x) => x[1]), (typeOpts.find((x) => x[0] === v) || typeOpts[0])[1], (o) => { v = typeOpts.find((x) => x[1] === o)[0]; }), apply: () => { clState.type = v; stats = null; } }; }), clState.type ? 1 : 0)),
      cTabs([['rev', 'Revenue items'], ['non', 'Non revenue items']], clState.discTab, (k) => { clState.discTab = k; }),
      cFigs(clState.discTab === 'rev' ? [['Discounts on orders', money(st.totals.discounts), `${uses} discount${uses === 1 ? '' : 's'} applied`], ['Discounts on items', money(0), '0 discounts applied'], ['Total discounts', money(st.totals.discounts), `${uses} discount${uses === 1 ? '' : 's'} applied`]] : [['Discounts on orders', money(0), '0 discounts applied'], ['Discounts on items', money(0), '0 discounts applied'], ['Total discounts', money(0), '0 discounts applied']]),
      cH2('Discount Detail'), h('div', { class: 'tbar' }, cSearch('Search by discount name', clState.discQ, (v) => { clState.discQ = v; }), colsBtn('r-disc', cols)),
      cTable('r-disc', cols, rows, cEmpty('No results found', NORES)))];
  };
  CL['r-removed'] = () => {
    const st = needStats(); if (!st) return loadingPage('Removed Items', 'Reports');
    const qty = st.removed.reduce((a, x) => a + x.qty, 0), val = st.removed.reduce((a, x) => a + x.value, 0);
    const cols = [{ k: 'n', l: 'Item' }, { k: 'q', l: 'Quantity', r: 1, sort: (r) => r._q }, { k: 'v', l: 'Value', r: 1, sort: (r) => r._v }, { k: 'w', l: 'Reason' }];
    const rows = clState.remTab === 'rev' ? st.removed.map((x) => ({ n: h('b', {}, x.name), q: String(x.qty), v: money(x.value), w: 'Order cancelled', _q: x.qty, _v: x.value })) : [];
    return [h('div', { class: 'cl' }, cHead('Reports', 'Removed Items', [exportBtn('r-removed'), dots('r-removed')]), ...cDates(cFilters(() => rPanel('Filters', () => { let v = clState.type; const typeOpts = [['', 'All order types'], ...Object.entries(ORDER_METHODS).map(([k, m2]) => [k, m2.name])]; return { el: rpRadios('Order type', typeOpts.map((x) => x[1]), (typeOpts.find((x) => x[0] === v) || typeOpts[0])[1], (o) => { v = typeOpts.find((x) => x[1] === o)[0]; }), apply: () => { clState.type = v; stats = null; } }; }), clState.type ? 1 : 0)),
      cTabs([['rev', 'Revenue items'], ['non', 'Non revenue items']], clState.remTab, (k) => { clState.remTab = k; }),
      cFigs(clState.remTab === 'rev' ? [['Printed Items', '0', null, true], ['Unprinted Items', String(qty), null, true], ['Deleted Orders', String(st.totals.cancelled)], ['Total Value Removed', money(val), null, true]] : [['Printed Items', '0', null, true], ['Unprinted Items', '0', null, true], ['Deleted Orders', '0'], ['Total Value Removed', money(0), null, true]]),
      cH2('Removed items detail', colsBtn('r-removed', cols)), cTable('r-removed', cols, rows, cEmpty('No results found', NORES)))];
  };
  CL['r-gift'] = () => {
    const g = need('gift', 'gift-cards'); if (!g) return loadingPage('Gift cards', 'Reports');
    const cards = (g.cards || []).filter((c) => inPeriod(c.createdAt) && (clState.giftLoad === 'all' || clState.giftLoad === 'person'));
    const total = cards.reduce((a, c) => a + c.initial, 0);
    const cols = [{ k: 'c', l: 'Gift card' }, { k: 'n', l: 'Customer' }, { k: 'd', l: 'Issued' }, { k: 'm', l: 'Load method' }, { k: 'a', l: 'Amount', r: 1, sort: (r) => r._a }, { k: 'b', l: 'Balance', r: 1 }];
    return [h('div', { class: 'cl' }, cHead('Reports', 'Gift cards', [exportBtn('r-gift'), dots('r-gift')]),
      ...cDates(h('div', { class: 'cl-labelled' }, h('label', { class: 'cl-lab' }, 'Load method'), cDrop([['all', 'All'], ['person', 'In person'], ['online', 'Online']], clState.giftLoad, (k) => { clState.giftLoad = k; paintPanel(); }))),
      cFigs([['Total', money(total)], ['Paid', money(total)], ['Complimentary', money(0)]]),
      cH2('Gift card reporting', colsBtn('r-gift', cols)),
      cTable('r-gift', cols, cards.map((c) => ({ c: h('b', {}, c.code), n: c.name || '—', d: fmtDate(c.createdAt), m: 'In person', a: money(c.initial), b: money(c.balance), _a: c.initial })), cEmpty('No results found', NORES)))];
  };
  CL['r-types'] = () => {
    const st = needStats(); if (!st) return loadingPage('Order types', 'Reports');
    const typeOpts = [['', 'Order Types'], ...Object.entries(ORDER_METHODS).map(([k, m]) => [k, m.name])];
    const inStore = st.money ? st.money.inStore : 0;
    const rows = [...st.methods.filter((m) => m.orders).map((m) => ({ t: h('b', {}, ORDER_METHODS[m.method]?.name || m.method), o: String(m.orders), n: money(m.net), a: money(m.total), _n: m.net })), ...(inStore && !clState.type ? [{ t: h('b', {}, 'In-store'), o: '—', n: money(inStore), a: money(inStore), _n: inStore }] : [])];
    return [h('div', { class: 'cl' }, cHead('Reports', 'Order types', [exportBtn('r-types'), dots('r-types')]),
      ...cDates(cDrop(typeOpts, clState.type, (k) => { clState.type = k; stats = null; paintPanel(); }, { icon: 'list' }), cFilters(() => rPanel('Filters', () => { let v = clState.type; return { el: rpRadios('Order type', typeOpts.map((x) => x[0] ? x[1] : 'All order types'), (typeOpts.find((x) => x[0] === v) || [0, 'All order types'])[1].replace('Order Types', 'All order types'), (o) => { v = (typeOpts.find((x) => x[1] === o) || [''])[0]; }), apply: () => { clState.type = v; stats = null; } }; }), clState.type ? 1 : 0)),
      cFigs([['Online Net Sales', money(st.totals.net), null, true], ['In-store Net Sales', money(clState.type ? 0 : inStore), null, true]]),
      cTable('r-types', [{ k: 't', l: 'Order type' }, { k: 'o', l: 'Orders', r: 1 }, { k: 'n', l: 'Net sales', r: 1, sort: (r) => r._n }, { k: 'a', l: 'Total', r: 1 }], rows, cEmpty('No results found', NORES)))];
  };
  CL['r-taxes'] = () => {
    const st = needStats(); if (!st) return loadingPage('Taxes Report', 'Finances');
    const t = st.totals;
    const rows = t.orders ? [{ r: `${st.taxRate || 0}%`, a: money(t.taxable), n: money(t.nontaxable), x: money(t.tax) }] : [];
    return [h('div', { class: 'cl' }, cHead('Finances', 'Taxes Report', [exportBtn('r-taxes'), dots('r-taxes')], 'A table view of taxes and fees collected from your customers.'), ...cDates(cFilters(() => rPanel('Filters', () => { let v = clState.type; const typeOpts = [['', 'All order types'], ...Object.entries(ORDER_METHODS).map(([k, m]) => [k, m.name])]; return { el: rpRadios('Order type', typeOpts.map((x) => x[1]), (typeOpts.find((x) => x[0] === v) || typeOpts[0])[1], (o) => { v = typeOpts.find((x) => x[1] === o)[0]; }), apply: () => { clState.type = v; stats = null; } }; }), clState.type ? 1 : 0)),
      cFigs([['Applicable sales', money(t.taxable), null, true], ['Net taxes', money(t.tax), null, true]]),
      cH2('Tax details'), cTable('r-taxes', [{ k: 'r', l: 'Tax rate' }, { k: 'a', l: 'Taxable sales', r: 1 }, { k: 'n', l: 'Non-taxable sales', r: 1 }, { k: 'x', l: 'Tax collected', r: 1 }], rows, cEmpty('No results found', NORES)))];
  };
  SVG.clock = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';

  /* ---------- Sales activity ---------- */
  function orderSheet(row) {
    const x = (orders || []).find((o) => o.number === row.number);
    if (!x) return toast('That order is no longer in the recent list.', true);
    const next = { new: ['confirmed', 'Confirm order'], confirmed: ['ready', 'Mark ready'], ready: ['completed', 'Complete'] };
    const set = async (status, close) => { try { const r = await api('POST', `/api/sites/${id}/orders/${x.id}`, { status }); putOrder(x, r.order); stats = null; close(); paintPanel(); } catch (e) { toast(e.message, true); } };
    sheet((close) => [h('h2', {}, `#${x.number} · ${x.name}`), h('p', { class: 'muted' }, `${ORDER_METHODS[x.method]?.name || x.method} · ${new Date(x.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${x.status === 'ready' ? readyLabel(x.method) : ORDER_STATUSES[x.status]}`),
      h('div', { class: 'cl-lines' }, x.items.map((l) => h('div', {}, h('span', {}, `${l.qty} × ${l.name}`, l.opts?.length > 0 && h('small', {}, l.opts.join(', '))), h('b', {}, money(l.price * l.qty)))),
        x.discount > 0 && h('div', {}, h('span', {}, 'Discount'), h('b', {}, `−${money(x.discount)}`)), x.tax > 0 && h('div', {}, h('span', {}, 'Tax'), h('b', {}, money(x.tax))), x.fee > 0 && h('div', {}, h('span', {}, 'Delivery fee'), h('b', {}, money(x.fee))), x.tip > 0 && h('div', {}, h('span', {}, 'Tip'), h('b', {}, money(x.tip))), h('div', { class: 'tot' }, h('span', {}, 'Total'), h('b', {}, money(x.total)))),
      h('p', { class: 'small' }, h('a', { href: `tel:${(x.phone || '').replace(/[^\d+]/g, '')}` }, x.phone), ' · ', h('a', { href: `mailto:${x.email}` }, x.email)), x.address && h('p', { class: 'small' }, h('b', {}, 'Deliver to '), x.address), x.notes && h('p', { class: 'small' }, h('b', {}, 'Notes '), x.notes),
      h('div', { class: 'acts' }, x.status !== 'cancelled' && x.status !== 'completed' && h('button', { class: 'btn text', style: 'color:var(--red);margin-right:auto', onclick: () => set('cancelled', close) }, 'Cancel order'),
        !x.paidAt && x.status !== 'cancelled' && h('button', { class: 'btn soft', onclick: () => { close(); takePayment(x); } }, 'Record payment'), x.paidAt && x.refunded < x.total && h('button', { class: 'btn soft', onclick: () => { close(); refundOrder(x); } }, 'Refund'),
        next[x.status] && h('button', { class: 'btn', onclick: () => set(next[x.status][0], close) }, next[x.status][1]))], 'wide');
  }
  CL.orders = () => {
    const st = needStats(); if (!orders) loadOrders(true);
    if (!st) return loadingPage('Orders');
    const list = st.orders.map((r) => ({ r, o: (orders || []).find((x) => x.number === r.number) }));
    const done = list.filter((x) => x.r.status === 'completed'), open = list.filter((x) => !['completed', 'cancelled'].includes(x.r.status));
    const q = clState.ordQ.trim().toLowerCase();
    const hit = ({ r, o }) => !q || (clState.ordBy === 'customer' ? `${r.name} ${o?.email || ''} ${o?.phone || ''}`.toLowerCase().includes(q) : clState.ordBy === 'number' ? String(r.number).includes(q.replace('#', '')) : (o?.items || []).some((l) => l.name.toLowerCase().includes(q)));
    const pay = ({ r, o }) => clState.ordPay === 'All' || (clState.ordPay === 'Paid' ? !!(o?.paidAt || r.paidAt) : !(o?.paidAt || r.paidAt));
    const sts = ({ r }) => clState.ordStatus === 'All' || (r.status === 'ready' ? 'Ready' : ORDER_STATUSES[r.status]) === clState.ordStatus;
    const shown = list.filter((x) => hit(x) && pay(x) && sts(x));
    const t12 = (hm) => { const [hh, mm] = hm.split(':').map(Number); return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
    const when = (r) => (periodOf()[0] === periodOf()[1] ? t12(r.time) : `${longDay(r.date, { month: 'short', day: 'numeric' })}, ${t12(r.time)}`);
    const nFilters = (clState.ordPay !== 'All') + (clState.ordStatus !== 'All');
    const empty = cEmpty(isTodayOnly() ? 'No orders yet today' : 'No orders found', 'Find orders with a different search, date range and filter combination.');
    const orderRows = shown.map(({ r, o }) => ({ t: when(r), c: r.name, tot: money(r.total), p: o?.paidAt || r.paidAt ? pill(`Paid · ${o?.paidMethod || r.paidMethod || ''}`.replace(/ · $/, ''), 'ok') : r.status === 'cancelled' ? pill('Cancelled', 'bad') : pill('Open', 'wait'), i: String((o?.items || []).reduce((a, l) => a + l.qty, 0) || '—'), id: `#${r.number}`, e: o?.handledBy || r.handledBy || '—', _t: `${r.date} ${r.time}`, _tot: r.total, onclick: () => orderSheet(r) }));
    const lineRows = shown.flatMap(({ r, o }) => (o?.items || []).map((l) => ({ t: when(r), n: h('b', {}, l.name), q: String(l.qty), pr: money(l.price), a: money(l.price * l.qty), id: `#${r.number}`, onclick: () => orderSheet(r) })));
    return [h('div', { class: 'cl' }, cHead(null, 'Orders', [printBtn(), dots('orders')]), ...cDates(),
      cFigs([['All orders', String(list.length)], ['Completed orders', String(done.length), null, true], ['Incomplete orders', String(open.length), null, true], ['Incomplete order value', money(open.reduce((a, x) => a + x.r.total, 0)), null, true]]),
      cTabs([['orders', 'Orders'], ['lines', 'Line items']], clState.ordTab, (k) => { clState.ordTab = k; }),
      cH2('Order History'),
      h('div', { class: 'tbar' }, cDrop([['customer', 'Customers'], ['number', 'Order ID'], ['item', 'Items']], clState.ordBy, (k) => { clState.ordBy = k; paintPanel(); }, { icon: 'find', cls: 'cl-by' }), cSearch('Search orders', clState.ordQ, (v) => { clState.ordQ = v; }),
        cFilters(() => rPanel('Filters', () => { let p = clState.ordPay, s2 = clState.ordStatus; return { el: h('div', {}, rpRadios('Payment status', ['All', 'Paid', 'Not paid'], p, (v) => { p = v; }), rpRadios('Order status', ['All', 'Received', 'Confirmed', 'Ready', 'Completed', 'Cancelled'], s2, (v) => { s2 = v; })), apply: () => { clState.ordPay = p; clState.ordStatus = s2; } }; }), nFilters)),
      clState.ordTab === 'orders'
        ? cTable('orders', [{ k: 't', l: 'Time', sort: (r) => r._t }, { k: 'c', l: 'Customer' }, { k: 'tot', l: 'Order total', r: 1, sort: (r) => r._tot }, { k: 'p', l: 'Payment status' }, { k: 'i', l: 'Items', r: 1 }, { k: 'id', l: 'Order ID' }, { k: 'e', l: 'Employee' }], orderRows, empty)
        : cTable('orders-lines', [{ k: 't', l: 'Time' }, { k: 'n', l: 'Item' }, { k: 'q', l: 'Qty', r: 1 }, { k: 'pr', l: 'Price', r: 1 }, { k: 'a', l: 'Amount', r: 1 }, { k: 'id', l: 'Order ID' }], lineRows, empty))];
  };
  const TENDER_OPTS = ['All', 'Cash', 'Credit Card', 'Check', 'External Gift Card', 'External PIN Debit', 'Debit Card'];
  const tenderMatch = (opt, m) => opt === 'All' || (opt === 'Credit Card' || opt === 'Debit Card' ? m === 'Card' : opt === 'External Gift Card' ? m === 'Gift card' : opt === 'External PIN Debit' ? false : m === opt);
  CL.tx = () => {
    const d = needTx(); if (!d) return loadingPage('Transactions');
    const byOpts = [['last4', 'Last 4 digits on card'], ['pid', 'Payment ID'], ['ext', 'External Id'], ['inv', 'Invoice Id'], ['custom', 'Custom field value']];
    const byName = byOpts.find(([k]) => k === clState.txBy)[1];
    const q = clState.txQ.trim().toLowerCase();
    const match = (x) => tenderMatch(clState.txTender, x.method) && (!q || (clState.txBy === 'pid' ? x.ref.toLowerCase().includes(q) : clState.txBy === 'inv' ? x.source === 'Invoice' && x.ref.toLowerCase().includes(q) : false));
    const pays = clState.txTab === 'payments' ? d.payments.filter(match) : [], refs = clState.txTab === 'refunds' ? d.refunds.filter(match) : [];
    const sum = (l, k) => l.reduce((a, x) => a + (x[k] || 0), 0);
    const t12 = (hm) => { const [hh, mm] = hm.split(':').map(Number); return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
    const when = (x) => (periodOf()[0] === periodOf()[1] ? t12(x.time) : `${longDay(x.date, { month: 'short', day: 'numeric' })}, ${t12(x.time)}`);
    const src = (x) => (x.source === 'Invoice' ? 'Invoice' : 'Online order');
    const rows = [...pays.map((x) => ({ ...x, kind: 'Payment' })), ...refs.map((x) => ({ ...x, kind: 'Refund' }))].map((x) => ({ t: when(x), y: x.kind, a: money(x.kind === 'Refund' ? -x.amount : x.amount), m: x.method, e: x.by || '—', c: x.customer || '—', s: `${src(x)} ${x.ref}`, _t: x.at, _a: x.amount,
      onclick: () => sheet((close) => [h('h2', {}, `${x.kind} ${money(x.amount)}`), h('div', { class: 'cl-lines' }, h('div', {}, h('span', {}, 'Payment ID'), h('b', {}, x.ref)), h('div', {}, h('span', {}, 'Time'), h('b', {}, `${fmtD(x.date)}, ${t12(x.time)}`)), h('div', {}, h('span', {}, 'Tender type'), h('b', {}, x.method)), h('div', {}, h('span', {}, 'Customer'), h('b', {}, x.customer || '—')), h('div', {}, h('span', {}, 'Employee'), h('b', {}, x.by || '—')), x.tip > 0 && h('div', {}, h('span', {}, 'Tip'), h('b', {}, money(x.tip))), x.note && h('div', {}, h('span', {}, 'Note'), h('b', {}, x.note))), h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: close }, 'Done'))]) }));
    const figs = { payments: [['Payments total', money(sum(pays, 'amount')), `from ${pays.length} payment${pays.length === 1 ? '' : 's'}`, true], ['Tips', money(sum(pays, 'tip')), sum(pays, 'tip') ? `on ${pays.filter((x) => x.tip).length} payments` : '--'], ['Taxes and Fees', money(sum(pays, 'tax')), sum(pays, 'tax') ? `on ${pays.filter((x) => x.tax).length} payments` : '--']],
      refunds: [['Refunds total', money(sum(refs, 'amount')), `from ${refs.length} refund${refs.length === 1 ? '' : 's'}`, true]], manual: [['Manual refunds total', money(0), 'from 0 manual refunds', true]], voids: [['Voids total', money(0), 'from 0 voids', true]], auth: [['Authorizations total', money(0), 'from 0 authorizations', true]] }[clState.txTab];
    const nF = (clState.txTender !== 'All') + (clState.txCard !== 'All');
    return [h('div', { class: 'cl' }, cHead(null, 'Transactions', [printBtn(), dots('tx')]), ...cDates(),
      cTabs([['payments', 'Payments'], ['refunds', 'Refunds'], ['manual', 'Manual Refunds'], ['voids', 'Voids'], ['auth', 'Authorizations']], clState.txTab, (k) => { clState.txTab = k; }),
      cFigs(figs),
      h('div', { class: 'tbar' }, cDrop(byOpts, clState.txBy, (k) => { clState.txBy = k; paintPanel(); }, { icon: 'find', cls: 'cl-by' }), cSearch(`Search by ${byName}`, clState.txQ, (v) => { clState.txQ = v; }),
        cFilters(() => rPanel('Filters', () => { let tn = clState.txTender, cd = clState.txCard; return { el: h('div', {}, rpRadios('Tender type', TENDER_OPTS, tn, (v) => { tn = v; }, 'Search tender type'), rpRadios('Card type', ['All', 'Visa', 'Mastercard', 'American Express', 'Discover'], cd, (v) => { cd = v; }, 'Search card type')), apply: () => { clState.txTender = tn; clState.txCard = cd; } }; }), nF)),
      cTable('tx', [{ k: 't', l: 'Time', sort: (r) => r._t }, { k: 'y', l: 'Type' }, { k: 'a', l: 'Amount', r: 1, sort: (r) => r._a }, { k: 'm', l: 'Tender Type' }, { k: 'e', l: 'Employee' }, { k: 'c', l: 'Customer' }, { k: 's', l: 'Payment Source' }], rows,
        cEmpty(isTodayOnly() ? 'No transactions yet today' : 'No transactions found', 'Find transactions with a different search, timeframe and filter combination.')))];
  };
  CL.tips = () => {
    const st = needStats(); if (!st) return loadingPage('Tips');
    if (!st.totals.tips) return [h('div', { class: 'cl cl-center' }, clArt('tip'), h('h1', {}, 'Tips'), h('p', { class: 'cl-lead' }, 'The recorded tips provide a comprehensive overview of employee tips from transactions, detailing key information such as the source of the tips, the associated card, and the amounts involved.'), h('button', { type: 'button', class: 'btn text cl-strong', onclick: () => goTab('ordering') }, 'Set up tips'))];
    return PANELS.sales('tips');
  };

  /* ---------- Finances ---------- */
  CL.fin = () => {
    const st = needStats(); if (!st) return loadingPage('Finances');
    const [f, to] = periodOf(), span = Math.round((Date.parse(to) - Date.parse(f)) / 86400000) + 1;
    const pf = span === 1 ? addDays(f, -7) : addDays(f, -span), pt = span === 1 ? addDays(to, -7) : addDays(f, -1);
    const pv = cmpStats(pf, pt);
    const m = st.money || { collected: 0, tenders: [], count: 0, tax: 0 }, pm = pv && pv.money ? pv.money : null;
    const pct = (now, was) => (!pm ? '—' : !was ? (now ? 'New' : '0.00%') : `${(((now - was) / was) * 100).toFixed(2)}%`);
    const by = (k) => m.tenders.filter((x) => (k === 'card' ? /card/i.test(x.method) : k === 'cash' ? /cash/i.test(x.method) : !/card|cash/i.test(x.method))).reduce((a, x) => a + x.amount, 0);
    const vs = span === 1 ? `last ${longDay(pf, { weekday: 'long' })}` : 'the period before';
    return [h('div', { class: 'cl' }, cHead(null, 'Finances', null, 'Stay on top of your business finances with snapshots of your receivables and payables.'),
      cH2('Financial activity', cDates()[0].firstChild),
      h('div', { class: 'scard cl-card cl-sum' }, h('div', { class: 'cl-sumL' },
        h('button', { type: 'button', class: 'hc-h link', onclick: () => goTab('tx') }, 'Amount Collected', h('span', { class: 'chv r' })), h('p', { class: 'cl-when' }, f === to ? longDay(f, { weekday: 'short', month: 'short', day: 'numeric' }) : `${longDay(f, { month: 'short', day: 'numeric' })} – ${longDay(to, { month: 'short', day: 'numeric' })}`),
        h('div', { class: 'cl-fig big' }, h('span', {}, 'Total'), h('b', {}, money(m.collected)), h('small', {}, h('strong', {}, pct(m.collected, pm?.collected)), ` compared to ${vs}`)),
        h('p', { class: 'cl-strongline' }, `${money(by('card'))} card, ${money(by('cash'))} cash, and ${money(by('other'))} other`),
        h('div', { class: 'cl-sumrow' }, h('div', { class: 'hm' }, h('button', { type: 'button', class: 'hm-l', onclick: () => goTab('r-taxes') }, 'Taxes', h('span', { class: 'chv r' })), h('b', {}, money(m.tax || 0)), h('small', { class: 'hm-d' }, h('b', {}, pct(m.tax || 0, pm?.tax)))),
          h('div', { class: 'hm' }, h('button', { type: 'button', class: 'hm-l', onclick: () => goTab('tx') }, 'Transactions', h('span', { class: 'chv r' })), h('b', {}, String(m.count || 0)), h('small', { class: 'hm-d' }, h('b', {}, pct(m.count || 0, pm?.count)))))),
        h('div', { class: 'cl-sumR' }, cChart(st.series, st.unit, (x) => x.net, true))))];
  };
  CL.close = () => {
    if (!closeData) { api('GET', `/api/sites/${id}/closeouts`).then((r) => { closeData = r; if (tab === 'close') paintPanel(); }).catch((e) => { toast(e.message, true); closeData = { open: { tenders: [], totals: { payments: 0, count: 0, refunds: 0, refundCount: 0, net: 0 }, number: 1, since: 0 }, history: [] }; if (tab === 'close') paintPanel(); }); return loadingPage('Closeout'); }
    const o = closeData.open, when = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const line = (a, b) => h('div', {}, h('span', {}, a), h('b', {}, b));
    const current = () => sheet((close) => [h('h2', {}, `Current batch ${o.number}`), h('p', { class: 'muted' }, o.since ? `Since ${when(o.since)}` : 'Since you started'),
      h('div', { class: 'cl-lines' }, o.tenders.map((x) => line(`${x.method} · ${x.count}`, money(x.amount - x.refunds))), line('Payments', money(o.totals.payments)), line('Refunds', `−${money(o.totals.refunds)}`), h('div', { class: 'tot' }, h('span', {}, 'Batch total'), h('b', {}, money(o.totals.net)))),
      h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Close'), h('button', { class: 'btn', disabled: !o.totals.count && !o.totals.refundCount, onclick: async () => { try { await api('POST', `/api/sites/${id}/closeouts`); closeData = null; close(); toast('Batch closed'); paintPanel(); } catch (e) { toast(e.message, true); } } }, 'Close out batch'))]);
    const past = (b) => sheet((close) => [h('h2', {}, `Batch ${b.number}`), h('p', { class: 'muted' }, `Closed ${when(b.createdAt)}${b.by ? ` by ${b.by}` : ''}`), h('div', { class: 'cl-lines' }, (b.totals.tenders || []).map((x) => line(`${x.method} · ${x.count}`, money(x.amount - (x.refunds || 0)))), line('Payments', money(b.totals.payments)), line('Refunds', `−${money(b.totals.refunds)}`), h('div', { class: 'tot' }, h('span', {}, 'Batch total'), h('b', {}, money(b.totals.net)))), h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: close }, 'Done'))]);
    const rows = [{ b: 'Current Batch', s: pill('Open', 'warn'), t: 'Standard transactions', c: String(o.totals.count), a: money(o.totals.net), d: h('button', { type: 'button', class: 'cl-link', onclick: current }, 'View Current Batch') },
      ...closeData.history.map((b) => ({ b: when(b.createdAt), s: pill('Closed', 'ok'), t: 'Standard transactions', c: String(b.totals.count), a: money(b.totals.net), d: h('button', { type: 'button', class: 'cl-link', onclick: () => past(b) }, `BATCH${String(b.number).padStart(6, '0')}`) }))];
    return [h('div', { class: 'cl' }, cHead(null, 'Closeout', null, 'A batch consists of your transactions from a given time period. Your open batch consists of all transactions since your last closeout.'), cH2('Batch history'),
      cTable('close', [{ k: 'b', l: 'Batch' }, { k: 's', l: 'Status' }, { k: 't', l: 'Transactions' }, { k: 'c', l: 'Count', r: 1 }, { k: 'a', l: 'Amount', r: 1 }, { k: 'd', l: 'Details' }], rows, null))];
  };
  CL.stmts = () => {
    const nowY = new Date().getFullYear(), nowM = new Date().getMonth();
    const born = new Date(meta.createdAt || Date.now()), firstY = born.getFullYear(), firstM = born.getMonth();
    if (clState.stmtYear < firstY) clState.stmtYear = firstY;
    if (clState.stmtYear > nowY) clState.stmtYear = nowY;
    const y = clState.stmtYear;
    const fromM = y === firstY ? firstM : 0, toM = y === nowY ? nowM : 11;
    const months = Array.from({ length: Math.max(0, toM - fromM + 1) }, (_, i) => fromM + i).reverse();
    const mName = (m) => new Date(Date.UTC(y, m, 15)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const dl = async (m) => { try { const f = `${y}-${String(m + 1).padStart(2, '0')}-01`, t = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10); const s2 = await api('GET', `/api/sites/${id}/stats?range=custom&from=${f}&to=${t}`), tt = s2.totals;
      await saveSheetFile(`${meta.slug}-statement-${f.slice(0, 7)}`, [[`Sales statement · ${mName(m)}`], [meta.name], [], ['Orders', tt.orders], ['Gross sales', (tt.gross / 100).toFixed(2)], ['Discounts', (tt.discounts / 100).toFixed(2)], ['Net sales', (tt.net / 100).toFixed(2)], ['Tax', (tt.tax / 100).toFixed(2)], ['Tips', (tt.tips / 100).toFixed(2)], ['Total', (tt.total / 100).toFixed(2)], ['Amount collected', ((s2.money?.collected || 0) / 100).toFixed(2)], ['Refunds', ((s2.money?.refunds || 0) / 100).toFixed(2)]], 'csv'); } catch (e) { toast(e.message, true); } };
    return [h('div', { class: 'cl' }, cHead(null, 'Monthly Statements', null, 'Review all your monthly statements in one place.'),
      h('div', { class: 'cl-year' }, h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Previous year', disabled: y <= firstY, onclick: () => { clState.stmtYear--; paintPanel(); } }, chev('l')), h('b', {}, String(y)), h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Next year', disabled: y >= nowY, onclick: () => { clState.stmtYear++; paintPanel(); } }, chev('r'))),
      h('div', { class: 'cl-two' }, h('div', { class: 'scard cl-card' }, h('h3', { class: 'cl-ct' }, 'Sales Statement'), h('p', { class: 'cl-cd' }, 'View your sales, taxes, tips and refunds for each month.'),
        h('div', { class: 'cl-months' }, months.map((m) => h('button', { type: 'button', onclick: () => dl(m) }, h('b', {}, mName(m)), y === nowY && m === nowM && pill('Estimated', 'info'), h('span', { class: 'chv r' }))))),
        h('div', { class: 'scard cl-card' }, h('h3', { class: 'cl-ct' }, 'Merchant Processing Statement'), h('p', { class: 'cl-cd' }, 'View your processing fees and adjustments.'), h('p', { class: 'muted', style: 'margin:18px 0 6px' }, 'No processing statements yet.'))))];
  };
  CL.disputes = () => [h('div', { class: 'cl' }, cHead(null, 'Disputes', [h('button', { type: 'button', class: 'cl-link up', onclick: () => goTab('alerts') }, 'SETTINGS'), moreBtn([['Print', () => printLight()]])]),
    h('div', { class: 'cl-dsp' }, h('h3', {}, 'Search for a Dispute'), h('label', { class: 'cl-lab' }, 'Case Number'),
      h('form', { class: 'cl-case', onsubmit: (e) => { e.preventDefault(); const v = e.currentTarget.querySelector('input').value.trim(); if (!v) return; toast('No dispute found with that case number.', true); } }, h('input', { placeholder: 'Case number', 'aria-label': 'Case number' }), h('button', { class: 'btn cl-blue' }, 'Search')),
      h('h3', {}, 'Filter Your Disputes'),
      h('div', { class: 'cl-three' }, ...[['Location', ['Any location', meta.name]], ['Date', ['Any date', 'Last 30 days', 'Last 90 days', 'Last 12 months']], ['Amount', ['Any amount', 'Under $50', '$50 – $250', 'Over $250']]].map(([l, opts]) => h('label', { class: 'field' }, h('span', {}, l), h('select', {}, opts.map((o) => h('option', {}, o)))))),
      h('div', { class: 'scard cl-card' }, cEmpty('No disputes', ''))))];
  CL.capital = () => [h('div', { class: 'cl' }, cHead('Finances', 'Capital'), h('div', { class: 'scard cl-card' }, cEmpty('No funding offers right now', '', 'bank')))];
  const promoPage = (eyebrow, title, brand, headline, text, cta, how, pricing, art) => h('div', { class: 'cl cl-promo' }, cHead(eyebrow, title), brand,
    h('div', { class: 'cl-promo-top' }, h('div', {}, h('h2', { class: 'cl-ph' }, headline), h('p', { class: 'cl-pt' }, text), cta)),
    how && h('h2', { class: 'cl-ph' }, how[0]), how && h('div', { class: 'cl-how' + (art ? ' with-art' : '') }, h('div', {}, how[1].map(([icon, t, d]) => h('div', { class: 'cl-howi' }, h('span', { class: 'cl-howic', html: icon }), h('div', {}, h('b', {}, t), h('p', {}, d))))), art && clArt(art)),
    pricing && h('h2', { class: 'cl-ph' }, 'Pricing'), pricing && h('p', { class: 'cl-pt' }, pricing));
  const ICO = { tax: '<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6h18l8 8v28H12z"/><path d="M30 6v8h8"/><rect x="17" y="26" width="16" height="10"/><path d="M17 31h16M22 26v10M28 26v10"/><path d="M19 12v8M22 14c-1-2-5-2-5 0s5 2 5 4-4 2-5 0" stroke="var(--brand)"/></svg>',
    rec: '<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="6" width="28" height="22" rx="2"/><path d="M14 40h8l6-6V24M30 28l6 6v6"/><path d="M16 12v8M19 14c-1-2-5-2-5 0s5 2 5 4-4 2-5 0" stroke="var(--brand)"/></svg>',
    shield: '<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2"><path d="M24 5 9 11v12c0 9 6 16 15 20 9-4 15-11 15-20V11z"/><path d="M24 16v12M27 19c-1-2-6-2-6 0s6 2 6 4-5 2-6 0" stroke="var(--brand)"/></svg>',
    sync: '<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2"><circle cx="14" cy="12" r="4"/><path d="M8 24c1-4 3-6 6-6M28 12h10l-4-4M36 32H26l4 4"/><circle cx="34" cy="38" r="4"/><path d="M24 20v10M27 22c-1-2-6-2-6 0s6 2 6 4-5 2-6 0" stroke="var(--brand)"/></svg>',
    card: '<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="12" width="38" height="24" rx="3"/><circle cx="15" cy="24" r="5" stroke="var(--brand)"/><path d="M25 20h12M25 26h8"/></svg>',
    redeem: '<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="6" width="22" height="18" rx="2"/><path d="M6 30h26M12 24v6"/><rect x="24" y="30" width="18" height="12" rx="2" stroke="var(--brand)"/><path d="M28 36h10" stroke="var(--brand)"/></svg>',
    manage: '<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="24" height="26" rx="2"/><path d="M12 40l4-8h10l6 8M34 20v14"/><path d="M16 12v10M19 14c-1-2-5-2-5 0s5 2 5 4-4 2-5 0" stroke="var(--brand)"/></svg>',
    hand: '<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 14c3-4 6-4 8 0s5 4 7-1" stroke="var(--brand)"/><path d="M22 40V22a3 3 0 0 1 6 0v8l7 2c3 1 4 3 3 6l-2 6"/></svg>',
    phone: '<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2"><rect x="10" y="4" width="22" height="34" rx="3"/><path d="M18 42l6-6c2-2 6-1 6 2v6"/><rect x="15" y="12" width="12" height="9" rx="1" stroke="var(--brand)"/><path d="M21 12v9M15 16h12" stroke="var(--brand)"/></svg>' };
  CL.stax = () => [promoPage('Finances', 'Sales tax', null, 'Put your sales tax on autopilot', 'Run your business as normal. Sales tax is worked out on every order at your rate and kept in your records.', h('button', { type: 'button', class: 'btn cl-dark', onclick: () => goTab('ordering') }, 'Set up now'),
    ['How it works', [[ICO.tax, 'Automated taxes without the added work', 'As you make sales, sales tax is added at your rate and shown on every receipt.'], [ICO.rec, 'Access records quickly', 'Daily reporting for continued oversight, and quick access to your full tax history in the Taxes Report.']]], 'Sales tax tracking is included in your plan at no extra cost.')];
  CL.bills = () => [promoPage('Finances', 'Pay bills', null, 'Pay your vendors with ease, flexibility, and security', 'Get the flexibility to pay any vendor your way—giving you total control over your business cash flow.', h('a', { class: 'btn cl-dark', href: `mailto:support@processorfreedom.com?subject=${encodeURIComponent(`Pay Bills for ${meta.name}`)}` }, 'Try Pay Bills now'),
    ['Feature highlights', [[ICO.rec, 'Payment flexibility for you and your vendors', 'Pay your usual way. Your vendors get paid their way.'], [ICO.shield, 'Safe and secure online payments', 'We safeguard all transactions using bank-level security.'], [ICO.sync, 'QuickBooks-ready records', 'Download your payments as a file QuickBooks reads, to keep your books accurate.']]], null)];
  /* ---------- Appointments ---------- */
  const A_STATUS = { Pending: 'pending', Confirmed: 'confirmed', Completed: 'completed', Canceled: 'cancelled', 'No show': 'noshow' };
  const A_ICON = { Pending: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>', Confirmed: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>', Completed: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="m6.5 12 3 3 5-6M11 15l5-6"/></svg>', Canceled: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M6 18 18 6"/></svg>', 'No show': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c4362f" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16v.5"/></svg>', Open: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M9 7h6M9 17h6M9.5 7c0 3 5 3 5 5s-5 2-5 5"/></svg>', 'Partially paid': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#1d4f9e" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 6v12M14.5 8.5c-1-1.5-5-1.5-5 .5s5 1.5 5 3.5-4 2-5 .5"/></svg>' };
  const peopleList = () => { const s = need('shifts', 'shifts'); return s ? s.people : []; };
  function apptSheet(a) {
    const t = a.at.slice(11, 16), [hh, mm] = t.split(':').map(Number), tl = `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
    const set = async (status, close) => { try { await api('POST', `/api/sites/${id}/appointments/${a.id}`, { status }); apptData = null; close(); paintPanel(); } catch (e) { toast(e.message, true); } };
    sheet((close) => [h('h2', {}, a.name), h('p', { class: 'muted' }, `${fmtD(a.at.slice(0, 10))} · ${tl}${a.minutes ? ` · ${a.minutes} min` : ''}`),
      h('div', { class: 'cl-lines' }, h('div', {}, h('span', {}, 'Service'), h('b', {}, a.service || 'Booking')), h('div', {}, h('span', {}, 'Employee'), h('b', {}, a.employee || 'Any available')), a.total > 0 && h('div', {}, h('span', {}, 'Total'), h('b', {}, money(a.total))), a.phone && h('div', {}, h('span', {}, 'Phone'), h('b', {}, a.phone)), a.email && h('div', {}, h('span', {}, 'Email'), h('b', {}, a.email)), a.notes && h('div', {}, h('span', {}, 'Notes'), h('b', {}, a.notes))),
      h('div', { class: 'acts' }, ['pending', 'confirmed'].includes(a.status) && h('button', { class: 'btn text', style: 'color:var(--red);margin-right:auto', onclick: () => set('cancelled', close) }, 'Cancel'), a.status === 'confirmed' && h('button', { class: 'btn soft', onclick: () => set('noshow', close) }, 'No show'), a.status === 'pending' && h('button', { class: 'btn', onclick: () => set('confirmed', close) }, 'Confirm'), a.status === 'confirmed' && h('button', { class: 'btn', onclick: () => set('completed', close) }, 'Complete'), !['pending', 'confirmed'].includes(a.status) && h('button', { class: 'btn', onclick: close }, 'Done'))]);
  }
  CL.calendar = () => {
    if (!apptData) { api('GET', `/api/sites/${id}/appointments`).then((r) => { apptData = r; if (tab === 'calendar') paintPanel(); }).catch(() => { apptData = { today: isoDay(new Date()), appointments: [] }; if (tab === 'calendar') paintPanel(); }); return loadingPage('Appointments'); }
    const today = apptData.today; if (!calDate) calDate = today;
    const people = ['Any available', ...peopleList()];
    const chosenEmp = clState.apptEmp || new Set(people), chosenSt = clState.apptAttr || new Set([...Object.keys(A_STATUS), 'Open', 'Partially paid']);
    const live = apptData.appointments.filter((a) => [...chosenSt].some((k) => A_STATUS[k] === a.status));
    const noHours = !ordering.hours || ordering.hours.every((x) => x.closed);
    const banner = noHours && !clState.bannerOff && h('div', { class: 'cl-banner bad' }, h('span', { class: 'cl-bi', html: SVG.warn }), h('div', { class: 'grow' }, h('b', {}, 'Hours of operation are required for an appointment'), h('p', {}, 'You haven’t set your hours of operation. ', h('button', { type: 'button', class: 'cl-link', onclick: () => goTab('hours') }, 'Schedule your operating hours'), ' in order to create an appointment.')), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Dismiss', onclick: () => { clState.bannerOff = true; paintPanel(); } }, ic('x', 18)));
    const move = (n) => { if (calView === 'month') calDate = new Date(Date.UTC(Number(calDate.slice(0, 4)), Number(calDate.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 10); else calDate = addDays(calDate, n * (calView === 'week' ? 7 : 1)); paintPanel(); };
    const dateBtn = h('button', { type: 'button', class: 'cl-date', onclick: () => popover(dateBtn, (close) => h('div', { class: 'dpop one' }, monthPicker(calDate.slice(0, 7), (d) => { calDate = d; close(); paintPanel(); }, () => ({ from: calDate, to: calDate }))), 'left') }, calView === 'month' ? monthName(calDate.slice(0, 7)) : [h('span', { class: 'dl' }, fmtD(calDate)), h('span', { class: 'ds' }, longDay(calDate, { weekday: 'short', month: 'short', day: 'numeric' }))]);
    const cols = people.filter((p) => chosenEmp.has(p)), per = innerWidth < 600 ? 2 : innerWidth < 1000 ? 4 : 6, pages = Math.max(1, Math.ceil(cols.length / per));
    if (clState.empPage >= pages) clState.empPage = 0;
    const empBtn = h('button', { type: 'button', class: 'cl-chip', onclick: () => rPanel('Employee(s)', () => { const set = new Set(chosenEmp); const all = h('input', { type: 'checkbox', checked: set.size === people.length }); const list = rpChecks('', people, set); all.onchange = () => { list.querySelectorAll('input').forEach((cb, i) => { cb.checked = all.checked; if (all.checked) set.add(people[i]); else set.delete(people[i]); }); }; return { el: h('div', {}, h('label', { class: 'rp-opt rp-all' }, all, h('span', {}, 'All')), list), apply: () => { clState.apptEmp = set.size === people.length ? null : set; } }; }) }, h('span', { class: 'cl-ic', html: SVG.users }), chosenEmp.size < people.length && h('em', {}, String(chosenEmp.size)));
    const attrBtn = h('button', { type: 'button', class: 'cl-chip', onclick: () => rPanel('Appointment attributes', () => { const set = new Set(chosenSt); const keys = [...Object.keys(A_STATUS), 'Open', 'Partially paid']; const all = h('input', { type: 'checkbox', checked: set.size === keys.length }); const g1 = rpChecks('Appointment status', Object.keys(A_STATUS), set, A_ICON), g2 = rpChecks('Order status', ['Open', 'Partially paid'], set, A_ICON); all.onchange = () => { [g1, g2].forEach((g) => g.querySelectorAll('input').forEach((cb) => { cb.checked = all.checked; })); keys.forEach((k) => (all.checked ? set.add(k) : set.delete(k))); }; return { el: h('div', {}, h('label', { class: 'rp-opt rp-all' }, all, h('span', {}, 'All')), g1, g2), apply: () => { clState.apptAttr = set.size === keys.length ? null : set; } }; }) }, ic('sliders', 18), chosenSt.size < Object.keys(A_STATUS).length + 2 && h('em', {}, String(chosenSt.size)));
    const bar = h('div', { class: 'cl-calbar' }, cDrop([['day', 'day'], ['week', 'week'], ['month', 'month']], calView, (k) => { calView = k; paintPanel(); }, { cls: 'cl-view' }), dateBtn,
      h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Previous', onclick: () => move(-1) }, chev('l')), h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Next', onclick: () => move(1) }, chev('r')), h('span', { class: 'grow' }),
      calView === 'day' && h('span', { class: 'cl-pages' }, `${clState.empPage + 1} of ${pages}`), calView === 'day' && h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Previous people', disabled: clState.empPage === 0, onclick: () => { clState.empPage--; paintPanel(); } }, chev('l')), calView === 'day' && h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'More people', disabled: clState.empPage >= pages - 1, onclick: () => { clState.empPage++; paintPanel(); } }, chev('r')),
      empBtn, attrBtn, h('button', { type: 'button', class: 'cl-add', 'aria-label': 'Create appointment', onclick: () => { clState.apptDraft = null; goTab('appt-new'); } }, ic('plus', 22)));
    let body;
    if (calView !== 'day') {
      const old = PANELS.appts(true); const grid = old[0].querySelector('.c2-month, .c2-grid');
      body = h('div', { class: 'scard cl-cal' }, grid);
    } else {
      const HOUR = 64, shown = cols.slice(clState.empPage * per, clState.empPage * per + per);
      const mins = (a) => { const [hh, mm] = a.at.slice(11, 16).split(':').map(Number); return hh * 60 + mm; };
      const day = live.filter((a) => a.at.slice(0, 10) === calDate);
      const toMin = (t) => { const [hh, mm] = String(t || '0:0').split(':').map(Number); return hh * 60 + (mm || 0); };
      const x = ordering.hours && ordering.hours[new Date(`${calDate}T12:00:00Z`).getUTCDay()];
      const bands = !x || x.closed ? [[0, 1440]] : toMin(x.close) > toMin(x.open) ? [[0, toMin(x.open)], [toMin(x.close), 1440]] : [[toMin(x.close), toMin(x.open)]];
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      const column = (p) => h('div', { class: 'cl-ccol', style: `height:${24 * HOUR}px`, onclick: (e) => { if (e.target.closest('.c2-ev')) return; const r = e.currentTarget.getBoundingClientRect(); const m = Math.max(0, Math.min(1410, Math.floor(((e.clientY - r.top) / HOUR) * 2) * 30)); clState.apptDraft = null; clState.apptPre = { date: calDate, time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, employee: p === 'Any available' ? '' : p }; goTab('appt-new'); } },
        bands.filter(([a, b]) => b > a).map(([a, b]) => h('i', { class: 'cl-hatch', style: `top:${(a / 60) * HOUR}px;height:${((b - a) / 60) * HOUR}px` })),
        calDate === today && h('i', { class: 'cl-nowl', style: `top:${(nowMin / 60) * HOUR}px` }),
        day.filter((a) => (a.employee || 'Any available') === p).map((a) => h('button', { type: 'button', class: `c2-ev ${a.status}`, style: `top:${(mins(a) / 60) * HOUR + 2}px;height:${Math.max(24, ((a.minutes || 60) / 60) * HOUR - 4)}px;left:4px;right:4px`, onclick: () => apptSheet(a) }, h('b', {}, a.name), h('small', {}, a.service || 'Booking'))));
      const gut = h('div', { class: 'c2-gut', style: `height:${24 * HOUR}px` }, Array.from({ length: 23 }, (_, i) => i + 1).map((hh) => h('span', { style: `top:${hh * HOUR}px` }, `${hh % 12 || 12}:00 ${hh < 12 ? 'AM' : 'PM'}`)));
      const scroller = h('div', { class: 'cl-cbody', style: `--n:${shown.length}`, onscroll: (e) => { const hd = e.currentTarget.parentElement?.querySelector('.cl-chead'); if (hd) hd.scrollLeft = e.currentTarget.scrollLeft; } }, gut, shown.map(column));
      requestAnimationFrame(() => { scroller.scrollTop = Math.max(0, ((calDate === today ? nowMin : 8 * 60) / 60 - 1.5) * HOUR); });
      body = h('div', { class: 'scard cl-cal' }, h('div', { class: 'cl-chead', style: `--n:${shown.length}` }, h('span'), shown.map((p) => h('div', { class: 'cl-who' }, h('i', { class: 'sh-av' }, p === 'Any available' ? '…' : p.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()), h('b', {}, p)))), scroller);
    }
    return [h('div', { class: 'cl' }, cHead(null, 'Appointments'), banner, bar, body)];
  };
  CL['appt-new'] = () => {
    const pre = clState.apptPre || {}; clState.apptPre = null;
    const d = clState.apptDraft ||= { customer: null, q: '', newCust: false, nc: { first: '', last: '', email: '', phone: '' }, services: [{ svc: '', price: '', employee: pre.employee || '' }], date: pre.date || isoDay(new Date()), time: pre.time || (() => { const n = new Date(); const m = Math.ceil((n.getHours() * 60 + n.getMinutes()) / 30) * 30; return `${String(Math.min(23, Math.floor(m / 60))).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; })(), xh: '00', xm: '00', lines: [], discount: 0, charge: 0, notes: '', open: { cust: true, det: true, pay: true, notes: false, hist: false } };
    if (!customers) api('GET', `/api/sites/${id}/customers`).then((r) => { customers = r.customers; if (tab === 'appt-new') paintPanel(); }).catch(() => { customers = []; });
    if (!apptData) api('GET', `/api/sites/${id}/appointments`).then((r) => { apptData = r; }).catch(() => {});
    const svcs = (ordering.booking && ordering.booking.services) || [], people = peopleList(), rate = Number(ordering.taxRate) || 0;
    const cents = (v) => { const c = parsePrice(String(v || '0')); return c == null ? 0 : c; };
    const sub = d.services.reduce((a, s) => a + cents(s.price), 0) + d.lines.reduce((a, l) => a + l.price * l.qty, 0);
    const tax = Math.round((Math.max(0, sub - d.discount) * rate) / 100), total = Math.max(0, sub - d.discount + d.charge + tax);
    const totalEl = h('b', {}, `Total: ${money(total)}`), save = h('button', { type: 'button', class: 'btn cl-dark' }, 'Save');
    const ready = () => (d.customer || (d.newCust && (d.nc.first || d.nc.last))) && d.services.some((s) => s.svc) && d.date && d.time;
    const refresh = () => { save.disabled = !ready(); };
    const sec = (key, title, kids) => h('div', { class: 'scard cl-sec' }, h('div', { class: 'cl-sech' }, h('h2', {}, title), h('button', { type: 'button', class: 'cl-tog', 'aria-expanded': String(d.open[key]), 'aria-label': d.open[key] ? 'Collapse' : 'Expand', onclick: () => { d.open[key] = !d.open[key]; paintPanel(); } }, h('i', { class: `chv ${d.open[key] ? 'u' : 'dn'}` }))), d.open[key] && h('div', { class: 'cl-secb' }, kids));
    const custBox = (() => {
      if (d.customer) return h('div', { class: 'vt-picked' }, h('div', {}, h('b', {}, d.customer.name), h('div', { class: 'small muted' }, [d.customer.email, d.customer.phone].filter(Boolean).join(' · '))), h('button', { type: 'button', class: 'btn text sm', onclick: () => { d.customer = null; paintPanel(); } }, 'Change'));
      if (d.newCust) return h('div', { class: 'cl-grid2' }, ...[['first', 'First name'], ['last', 'Last name'], ['email', 'Email address'], ['phone', 'Phone number']].map(([k, l]) => h('label', { class: 'field' }, h('span', {}, l), h('input', { value: d.nc[k], oninput: (e) => { d.nc[k] = e.target.value; refresh(); } }))));
      const res = h('div', { class: 'ns-hits' });
      const find = () => { const q = d.q.toLowerCase(); res.replaceChildren(...(q ? (customers || []).filter((c) => `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q)).slice(0, 6) : []).map((c) => h('button', { type: 'button', onclick: () => { d.customer = c; d.q = ''; paintPanel(); } }, h('span', {}, c.name), h('small', {}, c.email || c.phone || '')))); };
      setTimeout(find);
      return h('div', {}, h('label', { class: 'cl-lab' }, 'Select customer*'), h('label', { class: 'tsearch cl-csearch' }, ic('search', 18), h('input', { type: 'search', placeholder: 'Search by email, phone or name', value: d.q, oninput: (e) => { d.q = e.target.value; find(); } })), res);
    })();
    const svcCard = (s, i) => h('div', { class: 'cl-svc' },
      h('label', { class: 'field' }, h('span', {}, 'Service'), h('select', { onchange: (e) => { s.svc = e.target.value; const m = svcs.find((x) => x.name === s.svc); if (m && !s.price) s.price = ((m.price || 0) / 100).toFixed(2); paintPanel(); } }, h('option', { value: '' }, svcs.length ? 'Choose a service' : 'No services yet'), svcs.map((x) => h('option', { value: x.name, selected: s.svc === x.name }, `${x.name}${x.minutes ? ` · ${x.minutes} min` : ''}`)))),
      h('label', { class: 'field' }, h('span', {}, 'Price'), h('div', { class: 'ns-price cl-pr' }, h('span', {}, '$'), h('input', { inputmode: 'decimal', value: s.price || '0', onchange: (e) => { s.price = e.target.value; paintPanel(); } }))),
      h('label', { class: 'field' }, h('span', {}, 'Employee'), h('select', { onchange: (e) => { s.employee = e.target.value; } }, h('option', { value: '' }, 'Any available'), people.map((p) => h('option', { value: p, selected: s.employee === p }, p)))),
      d.services.length > 1 && h('button', { type: 'button', class: 'btn text sm', style: 'color:var(--red);justify-self:start', onclick: () => { d.services.splice(i, 1); paintPanel(); } }, 'Remove service'));
    const findAvail = () => { const t0 = new Date(); for (let k = 0; k < 14 * 48; k++) { const dt = new Date(Math.ceil(t0.getTime() / 1800000) * 1800000 + k * 1800000); const ds = isoDay(dt), x = ordering.hours && ordering.hours[dt.getDay()], m = dt.getHours() * 60 + dt.getMinutes(); if (!x || x.closed) continue; const [oh, om] = x.open.split(':').map(Number), [ch, cm] = x.close.split(':').map(Number); if (m >= oh * 60 + om && m < ch * 60 + cm && !(apptData?.appointments || []).some((a) => a.at === `${ds}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`)) { d.date = ds; d.time = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`; return paintPanel(); } } toast('No open times in the next two weeks. Set your business hours first.', true); };
    const addInv = (btn) => popover(btn, (close) => { const list = h('div', { class: 'ns-hits' }); const draw = (q = '') => list.replaceChildren(...menu.filter((x) => !q || x.name.toLowerCase().includes(q)).slice(0, 12).map((x) => h('button', { type: 'button', onclick: () => { d.lines.push({ name: x.name, price: itemPrice(x), qty: 1 }); close(); paintPanel(); } }, h('span', {}, x.name), h('b', {}, money(itemPrice(x)))))); draw(); return h('div', { class: 'cl-menu' }, h('label', { class: 'tsearch' }, ic('search', 18), h('input', { type: 'search', placeholder: 'Search items', oninput: (e) => draw(e.target.value.trim().toLowerCase()) })), list); }, 'left');
    const hist = d.customer ? (apptData?.appointments || []).filter((a) => (d.customer.email && a.email === d.customer.email) || a.name === d.customer.name) : [];
    save.onclick = async () => {
      if (!ready()) return; save.disabled = true;
      try {
        const c = d.customer || { name: `${d.nc.first} ${d.nc.last}`.trim(), email: d.nc.email, phone: d.nc.phone };
        if (!d.customer) await api('POST', `/api/sites/${id}/contacts`, { name: c.name, email: c.email, phone: c.phone });
        const names = d.services.filter((s) => s.svc).map((s) => s.svc), minutes = d.services.reduce((a, s) => a + ((svcs.find((x) => x.name === s.svc) || {}).minutes || 0), 0) + Number(d.xh) * 60 + Number(d.xm);
        await api('POST', `/api/sites/${id}/appointments`, { serviceName: names.join(', '), date: d.date, time: d.time, name: c.name, email: c.email || '', phone: c.phone || '', party: 1, notes: d.notes, employee: (d.services.find((s) => s.employee) || {}).employee || '', minutes, total });
        apptData = null; clState.apptDraft = null; customers = null; toast('Appointment created'); goTab('calendar');
      } catch (e) { toast(e.message, true); save.disabled = false; }
    };
    refresh();
    return [h('div', { class: 'cl cl-form' }, h('button', { type: 'button', class: 'cl-back', onclick: () => goTab('calendar') }, h('span', { html: SVG.back }), 'Calendar'), h('h1', { class: 'cl-ftitle' }, 'Create appointment'),
      !svcs.length && h('div', { class: 'cl-banner bad' }, h('span', { class: 'cl-bi', html: SVG.warn }), h('div', { class: 'grow' }, h('b', {}, 'Services are required for an appointment'), h('p', {}, 'You have no services. ', h('button', { type: 'button', class: 'cl-link', onclick: () => goTab('booking') }, 'Add at least one bookable service'), ' in order to create an appointment.'))),
      sec('cust', 'Customer information', [h('div', { class: 'cl-req' }, h('b', {}, '* Required:'), h('button', { type: 'button', class: 'cl-link u', onclick: () => { d.newCust = !d.newCust; d.customer = null; paintPanel(); } }, d.newCust ? 'Select an existing customer' : '+ Add new customer')), custBox]),
      sec('det', 'Appointment details', [h('p', { class: 'cl-small' }, '*Required'), h('b', { class: 'cl-k' }, 'Services*'), ...d.services.map(svcCard), h('button', { type: 'button', class: 'btn soft cl-pillbtn', onclick: () => { d.services.push({ svc: '', price: '', employee: '' }); paintPanel(); } }, 'Add another service'), h('hr'),
        h('div', { class: 'cl-req' }, h('b', { class: 'cl-k' }, 'Date and time*'), h('button', { type: 'button', class: 'cl-link', onclick: findAvail }, 'Find availability')),
        h('div', { class: 'cl-grid2' }, h('label', { class: 'field' }, h('span', {}, 'Date* (mm/dd/yyyy)'), h('input', { type: 'date', value: d.date, onchange: (e) => { d.date = e.target.value; refresh(); } })), h('label', { class: 'field' }, h('span', {}, 'Time* HH:MM AM/PM'), h('input', { type: 'time', value: d.time, onchange: (e) => { d.time = e.target.value; refresh(); } }))), h('hr'),
        h('b', { class: 'cl-k' }, 'Extra time (optional)'), h('p', { class: 'cl-small' }, 'Add additional time to the end of an appointment.'),
        h('div', { class: 'cl-grid2' }, h('label', { class: 'field' }, h('span', {}, 'Hours'), h('select', { onchange: (e) => { d.xh = e.target.value; } }, Array.from({ length: 9 }, (_, i) => String(i).padStart(2, '0')).map((v) => h('option', { selected: d.xh === v }, v)))), h('label', { class: 'field' }, h('span', {}, 'Minutes'), h('select', { onchange: (e) => { d.xm = e.target.value; } }, ['00', '15', '30', '45'].map((v) => h('option', { selected: d.xm === v }, v))))), h('hr'),
        ...d.lines.map((l, i) => h('div', { class: 'ns-row' }, h('div', { class: 'ns-name' }, h('b', {}, l.name)), h('div', { class: 'ns-qty' }, h('button', { type: 'button', class: 'icon-btn sm', onclick: () => { l.qty--; if (l.qty < 1) d.lines.splice(i, 1); paintPanel(); } }, ic('minus', 16)), h('span', {}, String(l.qty)), h('button', { type: 'button', class: 'icon-btn sm', onclick: () => { l.qty++; paintPanel(); } }, ic('plus', 16))), h('b', { class: 'ns-amt' }, money(l.price * l.qty)), h('button', { type: 'button', class: 'icon-btn sm', onclick: () => { d.lines.splice(i, 1); paintPanel(); } }, ic('x', 16)))),
        h('div', { class: 'cl-req' }, (() => { const b = h('button', { type: 'button', class: 'btn soft cl-pillbtn', onclick: () => addInv(b) }, 'Add inventory item'); return b; })(), h('button', { type: 'button', class: 'cl-link plain', onclick: async () => { const v = await ask({ title: 'Add custom item', label: 'Item name', value: '' }); if (!v) return; const p = await ask({ title: v, label: 'Price', type: 'text', value: '' }); const c = parsePrice(p || ''); if (!c) return; d.lines.push({ name: v, price: c, qty: 1 }); paintPanel(); } }, h('span', { html: SVG.plusc }), 'Add custom item')), h('hr'),
        h('div', { class: 'cl-tot' }, h('div', {}, h('span', {}, 'Subtotal'), h('b', {}, money(sub))), h('div', {}, h('button', { type: 'button', class: 'cl-link u', onclick: async () => { const v = await ask({ title: 'Order discount', label: 'Amount off', value: d.discount ? (d.discount / 100).toFixed(2) : '' }); if (v !== null) { d.discount = cents(v); paintPanel(); } } }, 'Order discount'), h('b', { class: 'neg' }, `-${money(d.discount)}`)), h('div', {}, h('button', { type: 'button', class: 'cl-link u', onclick: async () => { const v = await ask({ title: 'Service charge', label: 'Amount', value: d.charge ? (d.charge / 100).toFixed(2) : '' }); if (v !== null) { d.charge = cents(v); paintPanel(); } } }, 'Service charge'), h('b', {}, money(d.charge))), h('div', {}, h('span', {}, 'Taxes and fees'), h('b', {}, money(tax))))]),
      sec('pay', 'Payment information', [h('p', {}, d.customer || d.newCust ? 'Payment is taken when the appointment is completed.' : 'Select an existing customer or add a new customer to add payment information.')]),
      sec('notes', 'Notes', [h('label', { class: 'field' }, h('span', {}, 'Notes'), h('textarea', { rows: 4, maxlength: 200, placeholder: 'Add information about the customer or appointment.', value: d.notes, oninput: (e) => { d.notes = e.target.value; e.target.parentElement.nextSibling.textContent = `${d.notes.length}/200 characters`; } })), h('small', { class: 'cl-small' }, `${d.notes.length}/200 characters`)]),
      sec('hist', 'Appointment History', [hist.length ? h('div', { class: 'cl-lines' }, hist.map((a) => h('div', {}, h('span', {}, `${fmtD(a.at.slice(0, 10))} · ${a.service}`), h('b', {}, a.status)))) : h('p', {}, 'There is no appointment history.')]),
      h('div', { class: 'cl-bar' }, totalEl, h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn soft', onclick: () => { clState.apptDraft = null; goTab('calendar'); } }, 'Cancel'), save))];
  };
  /* ---------- Employees ---------- */
  const needTeam = () => { if (!team) { team = { loading: true }; api('GET', `/api/sites/${id}/team`).then((r) => { team = r; if (CL[tab]) paintPanel(); }).catch(() => { team = { members: [], owner: { email: state.user.email, name: state.user.name } }; if (CL[tab]) paintPanel(); }); } return team.loading ? null : team; };
  const ROLE_NAME = { owner: 'Owner', manager: 'Manager', kitchen: 'Employee' };
  CL.team = () => {
    const tm = needTeam(); if (!tm) return loadingPage('Employees');
    const people = [{ id: '', name: tm.owner.name, email: tm.owner.email, role: 'owner', active: 1, details: {} }, ...tm.members];
    const q = clState.empQ.trim().toLowerCase();
    const rows = people.filter((p) => (!q || `${p.name} ${p.email} ${p.details?.nickname || ''}`.toLowerCase().includes(q)) && (clState.empRole === 'All' || ROLE_NAME[p.role] === clState.empRole) && (clState.empStatus === 'All' || (p.active ? 'Claimed' : 'Invited') === clState.empStatus))
      .map((p) => ({ n: h('div', {}, h('button', { type: 'button', class: 'cl-name', onclick: () => { if (p.role === 'owner') return goTab('profile'); clState.empEdit = p.id; goTab('emp-new'); } }, p.name || p.email.split('@')[0]), h('div', { class: 'small muted' }, p.details?.nickname || p.email)), j: '- -', r: pill(ROLE_NAME[p.role] || p.role, 'info'), s: pill(p.active ? 'Claimed' : 'Invited', p.active ? 'ok' : 'wait'), v: h('button', { type: 'button', class: 'cl-link dark', onclick: () => goTab('r-emp') }, 'View report'), _n: p.name || p.email }));
    const nF = (clState.empRole !== 'All') + (clState.empStatus !== 'All');
    return [h('div', { class: 'cl' }, cHead(null, 'Employees', [moreBtn([['Export employee list', () => saveSheetFile(`${meta.slug}-employees`, [['Name', 'Email', 'Role', 'Status'], ...people.map((p) => [p.name, p.email, ROLE_NAME[p.role], p.active ? 'Claimed' : 'Invited'])], 'csv')]])]),
      h('div', { class: 'tbar' }, cSearch('Search employee', clState.empQ, (v) => { clState.empQ = v; }), cFilters(() => rPanel('Filters', () => { let r = clState.empRole, s = clState.empStatus; return { el: h('div', {}, rpRadios('Role', ['All', 'Owner', 'Manager', 'Employee'], r, (v) => { r = v; }), rpRadios('Status', ['All', 'Claimed', 'Invited'], s, (v) => { s = v; })), apply: () => { clState.empRole = r; clState.empStatus = s; } }; }), nF),
        h('button', { type: 'button', class: 'btn cl-blue', onclick: () => { clState.empEdit = ''; goTab('emp-new'); } }, ic('plus', 18), 'Add employee')),
      cTable('team', [{ k: 'n', l: 'Name', sort: (r) => r._n }, { k: 'j', l: 'Jobs' }, { k: 'r', l: 'Role' }, { k: 's', l: 'Status' }, { k: 'v', l: '' }], rows, cEmpty('No employees match', '')))];
  };
  CL['emp-new'] = () => {
    const tm = needTeam(); if (!tm) return loadingPage('New employee');
    const ex = clState.empEdit ? tm.members.find((m) => m.id === clState.empEdit) : null;
    const dt = ex ? ex.details || {} : {};
    const v = { name: ex ? ex.name : '', nickname: dt.nickname || '', phone: dt.phone || '', email: ex ? ex.email : '', role: ex ? ex.role : 'kitchen', payType: dt.payType || 'hourly', rate: dt.rate ? (dt.rate / 100).toFixed(2) : '', customId: dt.customId || '', passcode: dt.passcode || '' };
    const f = (label, el, note) => h('label', { class: 'field cl-field' }, h('span', {}, label), el, note && h('small', {}, note));
    const inp = (k, a = {}) => h('input', { value: v[k], oninput: (e) => { v[k] = e.target.value; if (k === 'passcode') drawRules(); }, ...a });
    const rules = h('div', { class: 'cl-rules' });
    const bad = () => { const p = v.passcode; return { len: p && !/^\d{4}$/.test(p), pat: p && (/^(\d)\1{3}$/.test(p) || '0123456789'.includes(p) || '9876543210'.includes(p)) }; };
    const drawRules = () => { const b = bad(), p = v.passcode; rules.replaceChildren(...(p ? [h('div', { class: b.len ? 'no' : 'ok' }, b.len ? '✕' : '✓', ' Must be 4 digits long'), h('div', { class: b.pat ? 'no' : 'ok' }, b.pat ? '✕' : '✓', ' No sequential or repeating patterns (e.g., 1111, 1234, 5678)')] : [])); pass.classList.toggle('bad', !!(b.len || b.pat)); };
    const pass = h('input', { type: 'password', inputmode: 'numeric', maxlength: 4, value: v.passcode, oninput: (e) => { v.passcode = e.target.value.replace(/\D/g, ''); e.target.value = v.passcode; drawRules(); } });
    const eye = h('button', { type: 'button', class: 'cl-eye', 'aria-label': 'Show passcode', html: SVG.eye, onclick: () => { pass.type = pass.type === 'password' ? 'text' : 'password'; } });
    setTimeout(drawRules);
    const randomPass = () => { for (;;) { const p = String(Math.floor(1000 + Math.random() * 9000)); if (!/^(\d)\1{3}$/.test(p) && !'0123456789'.includes(p) && !'9876543210'.includes(p)) return p; } };
    const save = async (btn) => {
      if (!v.name.trim()) return toast('Enter the full name.', true);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) return toast('Enter an email address so they can sign in.', true);
      const b = bad(); if (b.len || b.pat) return toast('Fix the device passcode first.', true);
      btn.disabled = true;
      try {
        const r = await api('POST', `/api/sites/${id}/team`, { name: v.name, email: v.email, role: v.role, details: { nickname: v.nickname, phone: v.phone, payType: v.payType, rate: parsePrice(v.rate || '0') || 0, customId: v.customId, passcode: v.passcode || randomPass() } });
        team = null; toast(ex ? 'Employee saved' : 'Employee added'); goTab('team');
        if (r.link) sheet((close) => [h('h2', {}, 'Login created'), h('p', { class: 'muted' }, `Send this link to ${v.email} so they can choose a password. It works once and lasts 3 days.`), h('div', { class: 'note', style: 'overflow-wrap:anywhere;color:var(--ink)' }, r.link), h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Done'), h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(r.link); toast('Link copied'); } catch { toast('Copy the link from the box above', true); } } }, 'Copy link'))]);
      } catch (e) { toast(e.message, true); btn.disabled = false; }
    };
    const saveBtn = h('button', { type: 'button', class: 'btn cl-blue' }, 'Save'); saveBtn.onclick = () => save(saveBtn);
    return [h('div', { class: 'cl cl-form' }, h('button', { type: 'button', class: 'cl-back', onclick: () => goTab('team') }, h('span', { html: SVG.back }), 'Employees'), h('h1', { class: 'cl-ftitle' }, ex ? 'Edit employee' : 'New employee'),
      h('div', { class: 'scard cl-sec cl-emp' }, h('h2', {}, 'Employee details'), h('p', { class: 'cl-req0' }, '*Indicates a required field'),
        h('h3', {}, 'Personal'), f('Full name*', inp('name', { maxlength: 80 })), f('Nickname', inp('nickname', { maxlength: 60 }), 'Nickname appears wherever the employee is listed. For example, on receipts.'),
        h('div', { class: 'cl-phone' }, f('Country code', h('select', { disabled: true }, h('option', {}, '🇺🇸  +1'))), f('Phone number', inp('phone', { type: 'tel', maxlength: 40 }))),
        f('Email address', inp('email', { type: 'email', disabled: !!ex }), 'Email address is required to give the employee access to the dashboard.'),
        f('Role*', h('select', { onchange: (e) => { v.role = e.target.value; } }, [['kitchen', 'Employee'], ['manager', 'Manager']].map(([k, l]) => h('option', { value: k, selected: v.role === k }, l))), 'Roles allow you to control employee permissions.'),
        h('h3', {}, 'Jobs and wages'), h('h4', {}, 'Jobs'), h('p', { class: 'cl-small' }, 'No jobs created yet.'), h('h4', {}, 'Wages'),
        f('Default pay type', h('select', { onchange: (e) => { v.payType = e.target.value; paintPanel(); } }, [['hourly', 'Hourly'], ['salary', 'Salary']].map(([k, l]) => h('option', { value: k, selected: v.payType === k }, l)))),
        f(v.payType === 'salary' ? 'Default annual salary' : 'Default hourly rate', inp('rate', { inputmode: 'decimal' })),
        h('h3', {}, 'Security'), f('Custom ID', inp('customId', { maxlength: 40 }), 'Custom IDs allow you to group employees by their location or their function.'),
        h('label', { class: 'field cl-field' }, h('span', {}, 'Device passcode (4 digits)'), h('div', { class: 'cl-passw' }, pass, eye), h('small', {}, 'If you do not enter a passcode, one will be assigned.'), rules),
        h('div', { class: 'cl-formf' }, h('button', { type: 'button', class: 'btn soft', onclick: () => goTab('team') }, 'Cancel'), saveBtn)))];
  };
  CL.timesheets = () => {
    if (!clockData) { api('GET', `/api/sites/${id}/timeclock`).then((r) => { clockData = r; if (tab === 'timesheets') paintPanel(); }).catch(() => { clockData = { entries: [] }; if (tab === 'timesheets') paintPanel(); }); return loadingPage('Timesheets'); }
    if (!clState.tsDay) clState.tsDay = isoDay(new Date());
    const tm = isOwner ? needTeam() : null, rateOf = (n) => { const m = tm && tm.members ? tm.members.find((x) => x.name === n) : null; return m && m.details && m.details.payType !== 'salary' ? m.details.rate || 0 : 0; };
    const hrs = (x) => ((x.outAt || Date.now()) - x.inAt) / 3600000;
    const q = clState.tsQ.trim().toLowerCase();
    const day = clState.tsDay, wd = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7, ps = addDays(day, -wd - (Math.floor((Date.parse(`${day}T12:00:00Z`) / 86400000 + 3) / 7) % 2) * 7), pe = addDays(ps, 13);
    const list = clockData.entries.filter((x) => (!q || x.name.toLowerCase().includes(q)) && (clState.tsView === 'all' || !x.outAt) && (clState.tsMode === 'day' ? dayOfMs(x.inAt) === day : dayOfMs(x.inAt) >= ps && dayOfMs(x.inAt) <= pe));
    const step = (n) => { clState.tsDay = addDays(day, n * (clState.tsMode === 'day' ? 1 : 14)); paintPanel(); };
    const dbtn = h('button', { type: 'button', class: 'cl-sel cl-tsdate', onclick: () => popover(dbtn, (close) => h('div', { class: 'dpop one' }, monthPicker(day.slice(0, 7), (dd) => { clState.tsDay = dd; close(); paintPanel(); }, () => ({ from: day, to: day }))), 'left') }, h('span', { class: 'cl-ic', html: SVG.cal }), h('span', { class: 'grow' }, clState.tsMode === 'day' ? [h('span', { class: 'dl' }, longDay(day, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })), h('span', { class: 'ds' }, longDay(day, { weekday: 'short', month: 'short', day: 'numeric' }))] : `${longDay(ps, { month: 'short', day: 'numeric' })} – ${longDay(pe, { month: 'short', day: 'numeric', year: 'numeric' })}`));
    const local = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${isoDay(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const when = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const editRow = (x) => { const nm = h('input', { value: x ? x.name : '', placeholder: 'Name', 'aria-label': 'Name', maxlength: 80 }), i1 = h('input', { type: 'datetime-local', value: x ? local(x.inAt) : '', 'aria-label': 'Clocked in' }), o1 = h('input', { type: 'datetime-local', value: x ? local(x.outAt) : '', 'aria-label': 'Clocked out' });
      const save = async () => { if (!nm.value.trim()) return toast('Enter a name.', true); if (!i1.value) return toast('Enter when they clocked in.', true); try { const body = { name: nm.value, inAt: Date.parse(i1.value), outAt: o1.value ? Date.parse(o1.value) : null }; clockData = x ? await api('PUT', `/api/sites/${id}/timeclock/${x.id}`, body) : await api('POST', `/api/sites/${id}/timeclock/entries`, body); tsEdit = ''; tsAdding = false; toast('Saved'); paintPanel(); } catch (e) { toast(e.message, true); } };
      return h('tr', { class: 'inline-tr' }, h('td', {}, nm), h('td', {}, i1), h('td', {}, o1), h('td', {}, ''), h('td', { style: 'text-align:right;white-space:nowrap' }, h('button', { class: 'btn soft sm', onclick: () => { tsEdit = ''; tsAdding = false; paintPanel(); } }, 'Cancel'), ' ', h('button', { class: 'btn sm', onclick: save }, 'Save'))); };
    let content;
    if (clState.tsMode === 'pay') {
      const per = new Map(); for (const x of list) { const r = per.get(x.name) || per.set(x.name, { h: 0, n: 0 }).get(x.name); r.h += hrs(x); r.n++; }
      content = cTable('ts-pay', [{ k: 'n', l: 'Team member' }, { k: 'e', l: 'Time cards', r: 1 }, { k: 'h', l: 'Hours', r: 1 }, { k: 'p', l: 'Estimated pay', r: 1 }], [...per].map(([n, r]) => ({ n: h('b', {}, n), e: String(r.n), h: r.h.toFixed(2), p: rateOf(n) ? money(Math.round(r.h * rateOf(n))) : '—' })), cEmpty('No time cards this pay period', ''));
    } else if (!list.length && !tsAdding) {
      content = h('div', { class: 'cl-tsempty' }, clArt('clock'), h('b', {}, 'Your team’s day, at a glance'), h('p', {}, 'When your team clocks in, their time cards will show here.'), h('button', { type: 'button', class: 'btn cl-dark', onclick: () => { tsAdding = true; paintPanel(); } }, 'Add a time card'));
    } else {
      content = h('div', {}, h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Team member', 'Clocked in', 'Clocked out', 'Hours', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, tsAdding && editRow(null), list.map((x) => (tsEdit === x.id ? editRow(x) : h('tr', {}, h('td', {}, h('b', {}, x.name)), h('td', {}, when(x.inAt)), h('td', {}, x.outAt ? when(x.outAt) : pill('Working now', 'ok')), h('td', {}, hrs(x).toFixed(2)),
          h('td', { style: 'text-align:right;white-space:nowrap' }, h('button', { class: 'btn text sm', onclick: () => { tsEdit = x.id; tsAdding = false; paintPanel(); } }, 'Edit'), h('button', { class: 'btn text sm', style: 'color:var(--red)', onclick: async () => { if (!await confirmSheet({ title: 'Delete this time card?', text: `${x.name}, ${when(x.inAt)}`, action: 'Delete', danger: true })) return; try { clockData = await api('DELETE', `/api/sites/${id}/timeclock/${x.id}`); paintPanel(); } catch (e) { toast(e.message, true); } } }, 'Delete')))))))),
        h('div', { class: 'cl-tsadd' }, h('button', { type: 'button', class: 'btn soft sm', onclick: () => { tsAdding = true; tsEdit = ''; paintPanel(); } }, ic('plus', 16), 'Add a time card')));
    }
    return [h('div', { class: 'cl cl-ts' }, h('div', { class: 'cl-tshead' }, h('h1', {}, 'Timesheets'), h('div', { class: 'cl-dseg' }, [['day', 'Day'], ['pay', 'Pay period']].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(clState.tsMode === k), onclick: () => { clState.tsMode = k; paintPanel(); } }, l)))),
      h('div', { class: 'scard cl-tscard' }, h('div', { class: 'cl-tsbar' }, cSearch('Search team members', clState.tsQ, (vv) => { clState.tsQ = vv; }), h('div', { class: 'cl-tsnav' }, h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Earlier', onclick: () => step(-1) }, chev('l')), dbtn, h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Later', onclick: () => step(1) }, chev('r'))),
        cDrop([['all', 'View: All time cards'], ['open', 'View: Clocked in now']], clState.tsView, (k) => { clState.tsView = k; paintPanel(); }, { cls: 'cl-plain' })),
        h('div', { class: 'cl-tsf' }, cDrop([['all', 'Filters']], 'all', () => {}, { cls: 'cl-plain' })), h('div', { class: 'cl-tsbody' }, content)))];
  };
  CL.schedule = () => {
    const sd = need('shifts', 'shifts'); if (!sd) return loadingPage('Scheduling');
    if (apptData === null) api('GET', `/api/sites/${id}/appointments`).then((r) => { apptData = r; if (tab === 'schedule') paintPanel(); }).catch(() => {});
    const today = sd.today;
    if (!schedWeek) schedWeek = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => addDays(schedWeek, i));
    const tm = isOwner ? needTeam() : null, rateOf = (n) => { const m = tm && tm.members ? tm.members.find((x) => x.name === n) : null; return m && m.details && m.details.payType !== 'salary' ? m.details.rate || 0 : 0; };
    const hrs = (x) => { const m = (Number(x.finish.slice(0, 2)) * 60 + Number(x.finish.slice(3))) - (Number(x.start.slice(0, 2)) * 60 + Number(x.start.slice(3))); return (m <= 0 ? m + 1440 : m) / 60; };
    const t12 = (t) => { const [hh, mm] = t.split(':').map(Number); return `${hh % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${hh < 12 ? 'a' : 'p'}`; };
    const week = sd.shifts.filter((x) => days.includes(x.day));
    const OPEN = 'Open shift';
    let people = [...new Set([...sd.people, ...week.map((x) => x.name)].filter((n) => n !== OPEN))];
    const q = clState.schedQ.trim().toLowerCase(); if (q) people = people.filter((n) => n.toLowerCase().includes(q));
    people.sort((a, b) => (clState.schedSort === 'last' ? (a.split(' ').pop() || '').localeCompare(b.split(' ').pop() || '') : a.localeCompare(b)));
    const reload2 = () => { forget('shifts'); paintPanel(); };
    const cellPop = (cell, name, d, x) => popover(cell, (close) => {
      const st2 = h('input', { type: 'time', value: x ? x.start : '', 'aria-label': 'Starts' }), en = h('input', { type: 'time', value: x ? x.finish : '', 'aria-label': 'Ends' }), note = h('input', { placeholder: 'Note', 'aria-label': 'Note', maxlength: 120, value: x ? x.note || '' : '' });
      const save = async () => { if (!st2.value || !en.value) return toast('Enter a start and end time.', true); try { if (x) await api('DELETE', `/api/sites/${id}/shifts/${x.id}`); await api('POST', `/api/sites/${id}/shifts`, { name, day: d, start: st2.value, finish: en.value, note: note.value }); close(); reload2(); } catch (e) { toast(e.message, true); } };
      return h('div', { class: 'sh-pop' }, h('b', {}, `${name} · ${longDay(d, { weekday: 'short', month: 'short', day: 'numeric' })}`), h('div', { class: 'sh-times' }, st2, h('span', {}, 'to'), en), note,
        h('div', { class: 'inline-acts' }, x && h('button', { type: 'button', class: 'btn text sm', style: 'color:var(--red);margin-right:auto', onclick: async () => { try { await api('DELETE', `/api/sites/${id}/shifts/${x.id}`); close(); reload2(); } catch (e) { toast(e.message, true); } } }, 'Remove'), h('button', { type: 'button', class: 'btn soft sm', onclick: close }, 'Cancel'), h('button', { type: 'button', class: 'btn sm', onclick: save }, x ? 'Save' : 'Add shift')));
    }, 'left');
    const cells = (name) => days.map((d) => { const xs = week.filter((x) => x.name === name && x.day === d); const c = h('div', { class: 'sh-cell', 'data-today': d === today ? '1' : null });
      c.append(...xs.map((x) => h('button', { type: 'button', class: 'sh-chip', title: x.note || '', onclick: (e) => { e.stopPropagation(); cellPop(e.currentTarget, name, d, x); } }, `${t12(x.start)}–${t12(x.finish)}`)), h('button', { type: 'button', class: 'sh-add', 'aria-label': `Add a shift for ${name}`, onclick: (e) => cellPop(e.currentTarget, name, d, null) }, ic('plus', 14))); return c; });
    const appts = (apptData && apptData.appointments) || [];
    const evCount = (d) => appts.filter((a) => a.at.slice(0, 10) === d && a.status !== 'cancelled').length;
    const openHrs = week.filter((x) => x.name === OPEN).reduce((a, x) => a + hrs(x), 0);
    const rangeBtn = h('button', { type: 'button', class: 'cl-sel cl-tsdate', onclick: () => popover(rangeBtn, (close) => h('div', { class: 'dpop one' }, monthPicker(schedWeek.slice(0, 7), (dd) => { schedWeek = addDays(dd, -((new Date(`${dd}T12:00:00Z`).getUTCDay() + 6) % 7)); close(); paintPanel(); }, () => ({ from: days[0], to: days[6] }))), 'left') }, h('span', { class: 'cl-ic', html: SVG.cal }), h('span', { class: 'grow' }, h('span', { class: 'dl' }, `${longDay(days[0], { month: 'short', day: 'numeric', year: 'numeric' })} - ${longDay(days[6], { month: 'short', day: 'numeric', year: 'numeric' })}`), h('span', { class: 'ds' }, `${longDay(days[0], { month: 'short', day: 'numeric' })} – ${longDay(days[6], days[0].slice(5, 7) === days[6].slice(5, 7) ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`)));
    const fBtn = h('button', { type: 'button', class: 'cl-sel cl-fil', onclick: () => popover(fBtn, () => h('div', { class: 'cl-menu' }, [['events', 'Events'], ['open', 'Open shifts'], ['team', 'Team members']].map(([k, l]) => h('label', { class: 'rp-opt' }, h('input', { type: 'checkbox', checked: clState.schedRows.has(k), onchange: (e) => { if (e.target.checked) clState.schedRows.add(k); else clState.schedRows.delete(k); paintPanel(); } }), h('span', {}, l)))), 'right') }, h('span', {}, clState.schedRows.size < 3 ? `Filters (${clState.schedRows.size})` : 'Filters'), caret());
    const sortSel = cDrop([['first', 'First name'], ['last', 'Last name']], clState.schedSort, (k) => { clState.schedSort = k; paintPanel(); }, { cls: 'cl-small-sel' });
    const total = (n) => { const hh = week.filter((x) => x.name === n).reduce((a, x) => a + hrs(x), 0); return `${hh.toFixed(2)} hrs / ${money(Math.round(hh * rateOf(n)))}`; };
    return [h('div', { class: 'cl' }, cHead(null, 'Scheduling'),
      h('div', { class: 'scard cl-sched' }, h('div', { class: 'cl-schbar' }, h('button', { type: 'button', class: 'btn soft sm cl-today', disabled: days.includes(today), onclick: () => { schedWeek = ''; paintPanel(); } }, 'Today'), rangeBtn, h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Previous week', onclick: () => { schedWeek = addDays(schedWeek, -7); paintPanel(); } }, chev('l')), h('button', { type: 'button', class: 'c2-arrow', 'aria-label': 'Next week', onclick: () => { schedWeek = addDays(schedWeek, 7); paintPanel(); } }, chev('r')), h('span', { class: 'grow' }),
        cDrop([['week', 'Week']], 'week', () => {}, { cls: 'cl-plain' }), fBtn, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Schedule settings', title: 'Business hours', onclick: () => goTab('hours'), html: SVG.gear }), h('button', { type: 'button', class: 'btn soft sm cl-pub', disabled: true }, h('span', { html: SVG.upload }), 'Publish')),
        h('div', { class: 'sh-grid' },
          h('div', { class: 'sh-row sh-headrow' }, h('div', { class: 'sh-who cl-whohead' }, h('span', { class: 'muted' }, 'View'), sortSel, clState.schedSearch ? h('input', { class: 'cl-schq', placeholder: 'Search', value: clState.schedQ, oninput: (e) => { clState.schedQ = e.target.value; paintPanel(); const el = panel.querySelector('.cl-schq'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } } }) : h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Search team members', onclick: () => { clState.schedSearch = true; paintPanel(); setTimeout(() => panel.querySelector('.cl-schq')?.focus()); } }, ic('search', 18))),
            days.map((d) => h('div', { class: 'sh-dh2', 'data-today': d === today ? '1' : null }, h('span', {}, longDay(d, { weekday: 'short', day: 'numeric' }).replace(/(\w+)\s(\d+)/, '$1, $2'))))),
          clState.schedRows.has('events') && h('div', { class: 'sh-row' }, h('div', { class: 'sh-who' }, h('span', { class: 'cl-ic', html: SVG.cal }), h('span', {}, `Events (${days.reduce((a, d) => a + evCount(d), 0)})`)), days.map((d) => h('div', { class: 'sh-cell sh-ev', 'data-today': d === today ? '1' : null }, evCount(d) > 0 && h('button', { type: 'button', class: 'sh-chip ev', onclick: () => { calDate = d; calView = 'day'; goTab('calendar'); } }, `${evCount(d)} appointment${evCount(d) === 1 ? '' : 's'}`)))),
          clState.schedRows.has('open') && h('div', { class: 'sh-row' }, h('div', { class: 'sh-who' }, h('span', { class: 'cl-ic', html: SVG.half }), h('div', {}, h('span', {}, `Open shifts (${week.filter((x) => x.name === OPEN).length})`), h('small', { class: 'muted' }, `${openHrs.toFixed(2)} Hrs`))), cells(OPEN)),
          clState.schedRows.has('team') && [h('div', { class: 'sh-sub' }, `Team members (${people.length}/${sd.people.length})`),
            ...people.map((n) => h('div', { class: 'sh-row' }, h('div', { class: 'sh-who' }, h('i', { class: 'sh-av' }, n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()), h('div', {}, h('b', {}, n), h('small', { class: 'muted' }, total(n)))), cells(n)))])))];
  };

  /* ---------- Customers ---------- */
  CL.customers = () => {
    if (!customers) { api('GET', `/api/sites/${id}/customers`).then((r) => { customers = r.customers; if (tab === 'customers') paintPanel(); }).catch((e) => { toast(e.message, true); customers = []; if (tab === 'customers') paintPanel(); }); return loadingPage('Customers'); }
    const q = clState.custQ.trim().toLowerCase();
    const show = { Everyone: () => true, Regulars: (c) => c.orders > 1, 'One order': (c) => c.orders <= 1, 'Has email': (c) => !!c.email, 'Has phone': (c) => !!c.phone }[clState.custShow];
    const rows = customers.filter((c) => show(c) && (!q || `${c.name} ${c.email} ${c.phone} ${c.company || ''}`.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 1000)
      .map((c) => ({ n: c.name, e: c.email || '', p: c.phone || '', _n: c.name, onclick: () => { clState.custKey = c.email || c.name; goTab('cust-new'); } }));
    return [h('div', { class: 'cl' }, cHead(null, 'Customers', [moreBtn([['Import customers (Excel or CSV)', importCustomers], ['Export customers', exportCustomers]])]),
      h('div', { class: 'tbar' }, cSearch('Search', clState.custQ, (v) => { clState.custQ = v; }), cFilters(() => rPanel('Filters', () => { let s = clState.custShow; return { el: rpRadios('Show', ['Everyone', 'Regulars', 'One order', 'Has email', 'Has phone'], s, (v) => { s = v; }), apply: () => { clState.custShow = s; } }; }), clState.custShow !== 'Everyone' ? 1 : 0),
        h('button', { type: 'button', class: 'btn cl-blue', onclick: () => { clState.custKey = ''; goTab('cust-new'); } }, ic('plus', 18), 'Add customer')),
      cTable('customers', [{ k: 'n', l: 'Name', sort: (r) => r._n }, { k: 'e', l: 'Email address' }, { k: 'p', l: 'Phone number' }], rows, cEmpty(customers.length ? 'Nobody matches that search' : 'No customers yet', '')))];
  };
  CL['cust-new'] = () => {
    if (!customers) { api('GET', `/api/sites/${id}/customers`).then((r) => { customers = r.customers; if (tab === 'cust-new') paintPanel(); }).catch(() => { customers = []; }); return loadingPage('Add customer'); }
    const ex = clState.custKey ? customers.find((c) => (c.email || c.name) === clState.custKey) : null;
    const more = (() => { try { return JSON.parse(ex?.more || '{}'); } catch { return {}; } })();
    const parts = (ex?.name || '').split(' ');
    const v = clState.custDraft && clState.custDraft.key === clState.custKey ? clState.custDraft : (clState.custDraft = { key: clState.custKey, first: parts[0] || '', last: parts.slice(1).join(' '), company: ex?.company || '', emails: [ex?.email || '', ...(more.emails || [])], phones: [ex?.phone || '', ...(more.phones || [])], address: ex?.address || '', note: more.note || '' });
    const f = (label, el) => h('label', { class: 'field cl-field' }, h('span', {}, label), el);
    const inp = (get, set, a = {}) => h('input', { value: get(), oninput: (e) => set(e.target.value), ...a });
    const save = async (btn) => {
      const name = `${v.first} ${v.last}`.trim();
      if (!name && !v.company.trim()) return toast('Add a name or a business name.', true);
      btn.disabled = true;
      try { await api('POST', `/api/sites/${id}/contacts`, { name, company: v.company, email: v.emails[0] || '', phone: v.phones[0] || '', address: v.address, more: { emails: v.emails.slice(1), phones: v.phones.slice(1), note: v.note } }); customers = null; bills = null; clState.custDraft = null; toast(ex ? 'Customer saved' : 'Customer added'); goTab('customers'); } catch (e) { toast(e.message, true); btn.disabled = false; }
    };
    const saveBtn = h('button', { type: 'button', class: 'btn cl-blue' }, 'Save'); saveBtn.onclick = () => save(saveBtn);
    return [h('div', { class: 'cl cl-form cl-cust' }, h('button', { type: 'button', class: 'cl-back', onclick: () => { clState.custDraft = null; goTab('customers'); } }, h('span', { html: SVG.back }), 'Customers'), h('h1', { class: 'cl-ftitle' }, ex ? 'Edit customer' : 'Add customer'),
      h('div', { class: 'cl-grid2' }, f('First name', inp(() => v.first, (x) => { v.first = x; }, { maxlength: 60 })), f('Last name', inp(() => v.last, (x) => { v.last = x; }, { maxlength: 60 }))),
      f('Business name', inp(() => v.company, (x) => { v.company = x; }, { maxlength: 120 })), h('hr'),
      ...v.emails.map((e, i) => h('div', { class: 'cl-multi' }, f(`Email address ${i + 1}`, inp(() => v.emails[i], (x) => { v.emails[i] = x; }, { type: 'email', maxlength: 200 })), i === v.emails.length - 1 && v.emails.length < 6 ? h('button', { type: 'button', class: 'cl-addc', 'aria-label': 'Add another email address', html: SVG.plusc, onclick: () => { v.emails.push(''); paintPanel(); } }) : h('span'))), h('hr'),
      ...v.phones.map((p, i) => h('div', { class: 'cl-multi' }, f(`Phone number ${i + 1}`, h('div', { class: 'cl-phonein' }, h('span', { html: SVG.phone }), inp(() => v.phones[i], (x) => { v.phones[i] = x; }, { type: 'tel', maxlength: 40 }))), i === v.phones.length - 1 && v.phones.length < 6 ? h('button', { type: 'button', class: 'cl-addc', 'aria-label': 'Add another phone number', html: SVG.plusc, onclick: () => { v.phones.push(''); paintPanel(); } }) : h('span'))), h('hr'),
      f('Address', inp(() => v.address, (x) => { v.address = x; }, { maxlength: 300 })), h('hr'),
      f('Note', h('textarea', { rows: 3, maxlength: 500, value: v.note, oninput: (e) => { v.note = e.target.value; } })),
      h('div', { class: 'cl-bar' }, h('span', { class: 'grow' }), ex && h('button', { type: 'button', class: 'btn text', onclick: () => openInvoice(null, ex) }, 'Send invoice'), h('button', { type: 'button', class: 'btn soft', onclick: () => { clState.custDraft = null; goTab('customers'); } }, 'Cancel'), saveBtn))];
  };
  CL.promos = () => {
    const list = ordering.promos || (ordering.promos = []);
    const edit = (pr) => sheet((close) => {
      const v = pr ? { ...pr } : { code: '', type: 'percent', value: 10, active: true };
      const valIn = h('input', { inputmode: 'decimal', value: v.type === 'amount' ? (v.value / 100).toFixed(2) : String(v.value) });
      const typeSel = h('select', { onchange: (e) => { v.type = e.target.value; valIn.value = v.type === 'amount' ? '5.00' : '10'; } }, [['percent', 'Percent off'], ['amount', 'Dollars off']].map(([k, l]) => h('option', { value: k, selected: v.type === k }, l)));
      const codeIn = h('input', { value: v.code, maxlength: 24, placeholder: 'WELCOME10', style: 'text-transform:uppercase', oninput: (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); } });
      const act = h('input', { type: 'checkbox', checked: v.active });
      const save = async () => {
        const code = codeIn.value.trim(); if (!code) return toast('Enter a code.', true);
        if (list.some((x) => x !== pr && x.code === code)) return toast('That code already exists.', true);
        const n = v.type === 'amount' ? parsePrice(valIn.value || '0') : Math.round(Number(valIn.value));
        if (!n || n < 0 || (v.type === 'percent' && n > 100)) return toast(v.type === 'percent' ? 'Enter a percent from 1 to 100.' : 'Enter an amount.', true);
        const next = { code, type: v.type, value: n, active: act.checked };
        if (pr) Object.assign(pr, next); else list.push(next);
        try { await putOrdering(); close(); toast(pr ? 'Promo saved' : 'Promo created'); paintPanel(); } catch (e) { toast(e.message, true); }
      };
      return [h('div', { class: 'swb-h' }, h('h2', {}, pr ? 'Edit promo' : 'Create promo'), h('button', { type: 'button', class: 'ss-x', 'aria-label': 'Close', onclick: close }, ic('x', 20))),
        h('div', { class: 'cl-promoform' }, h('label', { class: 'field cl-field' }, h('span', {}, 'Promo code'), codeIn),
          h('div', { class: 'cl-grid2' }, h('label', { class: 'field cl-field' }, h('span', {}, 'Discount type'), typeSel), h('label', { class: 'field cl-field' }, h('span', {}, 'Amount'), valIn)),
          h('label', { class: 'switch' }, h('span', {}, 'Active'), act, h('i'))),
        h('div', { class: 'swb-f' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), h('button', { type: 'button', class: 'btn cl-blue', onclick: save }, 'Save'))];
    }, 'swb');
    const remove = async (pr) => { if (!await confirmSheet({ title: `Delete ${pr.code}?`, text: 'Customers will no longer be able to use this code.', action: 'Delete', danger: true })) return; list.splice(list.indexOf(pr), 1); try { await putOrdering(); paintPanel(); } catch (e) { toast(e.message, true); } };
    const rows = list.map((pr) => ({ c: h('b', { class: 'cl-code' }, pr.code), d: pr.type === 'amount' ? `${money(pr.value)} off` : `${pr.value}% off`, s: pill(pr.active ? 'Active' : 'Paused', pr.active ? 'ok' : 'wait'),
      a: h('div', { class: 'cl-rowacts' }, isOwner && h('button', { type: 'button', class: 'cl-link', onclick: () => edit(pr) }, 'Edit'), isOwner && h('button', { type: 'button', class: 'cl-link danger', onclick: () => remove(pr) }, 'Delete')) }));
    const create = isOwner && h('button', { type: 'button', class: 'btn cl-blue cl-promobtn', onclick: () => edit(null) }, ic('plus', 18), 'Create promo');
    // Create a promo, pressed on Customer outreach, lands here with the create window already open.
    if (clState.openPromo) { clState.openPromo = false; if (isOwner) setTimeout(() => edit(null)); }
    return [h('div', { class: 'cl cl-promos' }, !isOwner && h('div', { class: 'cl-banner warn' }, h('span', { class: 'cl-bi', html: SVG.tri }), h('div', { class: 'grow' }, h('b', {}, 'Account owner access is required'), h('p', {}, 'Only the account owner can create promotions. Please contact your account owner.'))),
      list.length ? [cHead(null, 'Promos', create && [create]), cTable('promos', [{ k: 'c', l: 'Code' }, { k: 'd', l: 'Discount' }, { k: 's', l: 'Status' }, { k: 'a', l: '' }], rows, null)]
        : h('div', { class: 'cl-hero' }, clArt('tag'), h('h1', {}, 'Boost Sales with Targeted Customer Promotions'), h('p', {}, 'Create promo codes your customers can enter at checkout when they order from your website.'), create))];
  };
  CL.inbox = () => {
    const L = need('leads', 'leads'); if (!L) return loadingPage('Feedback');
    const leads2 = L.leads || [];
    const setBtn = h('button', { type: 'button', class: 'cl-fbset', onclick: () => popover(setBtn, (close) => h('div', { class: 'cl-menu' }, h('button', { type: 'button', onclick: () => { close(); goTab('alerts'); } }, h('span', {}, 'Manage notifications')), h('button', { type: 'button', onclick: () => { close(); goTab('devices'); } }, h('span', {}, 'Manage printing'))), 'right') }, h('span', { html: SVG.gear }), 'Settings', h('i', { class: 'chv d', 'aria-hidden': 'true' }));
    const when = (ms) => new Date(ms).toLocaleString(undefined, isoDay(new Date(ms)) === isoDay(new Date()) ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const heart = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 20s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/></svg>';
    const broken = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 20s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 11 7.6l-1.2 3.6 2.6 1.4-1.6 3.6 3.6-4.3-2.4-1.5 1.4-2.9a4.3 4.3 0 0 1 6.1 2.4C19.5 15.4 12 20 12 20z"/></svg>';
    return [h('div', { class: 'cl' }, h('div', { class: 'cl-fbtop' }, h('div', { class: 'cl-fbtitle' }, h('span', { class: 'cl-fbic', html: SVG.heart }), h('h1', {}, 'Feedback')), setBtn),
      h('div', { class: 'cl-figs cl-fbfigs' }, h('div', { class: 'cl-fig' }, h('span', {}, 'Messages'), h('b', {}, String(leads2.length))), h('div', { class: 'cl-fig' }, h('span', {}, h('i', { class: 'cl-fbh', html: heart }), 'Happy'), h('b', {}, '0')), h('div', { class: 'cl-fig' }, h('span', {}, h('i', { class: 'cl-fbh', html: broken }), 'Unhappy'), h('b', {}, '0'))),
      cTable('feedback', [{ k: 't', l: 'Time', sort: (r) => r._t }, { k: 'c', l: 'Customer' }, { k: 'm', l: 'Mood' }, { k: 'x', l: 'Message' }, { k: 'r', l: 'Reply' }],
        leads2.map((l) => ({ _t: l.createdAt, t: when(l.createdAt), c: h('b', { class: 'cl-fbname' }, l.name || l.email), m: '—', x: h('span', { class: 'cl-fbmsg' }, l.message), r: l.email ? h('a', { class: 'cl-link', href: `mailto:${l.email}?subject=${encodeURIComponent(`Re: your message to ${meta.name}`)}` }, 'Reply') : '' })),
        h('div', { class: 'cl-empty' }, h('b', {}, 'No messages yet'), h('p', {}, 'Messages customers send you from your website will show here.'))))];
  };
  CL.rewards = () => {
    if (ordering.loyalty && ordering.loyalty.enabled) return [cHead(null, 'Rewards'), ...[PANELS.rewardsDash()].flat()];
    const act = h('button', { type: 'button', class: 'btn cl-dark', onclick: async () => { ordering.loyalty = { ...(ordering.loyalty || {}), enabled: true }; try { await putOrdering(); toast('Rewards are on'); paintPanel(); } catch (e) { toast(e.message, true); } } }, 'Activate rewards');
    const faq = [['How does the Rewards program benefit my business?', 'Regulars come back more often when every visit counts toward a reward, and they spend more when a reward is close.'], ['What kinds of rewards can I offer?', 'A percentage off or a fixed amount off their next order. You choose the amount and how many orders earn it.'], ['How many orders do rewards members need?', 'You decide, from 2 to 50 orders. The default is a reward every 10 orders.'], ['How do my customers join?', 'Automatically. Orders are counted by the customer’s email, and the reward code appears on their order page when they earn it.']];
    const L = ordering.loyalty || { every: 10, type: 'percent', value: 5 };
    return [h('div', { class: 'cl cl-promo' }, cHead(null, 'Rewards'), pill('Included in plan', 'outline'),
      h('h2', { class: 'cl-ph' }, 'Drive repeat sales with Rewards'), h('p', { class: 'cl-pt' }, 'Get customers spending more, more often. Reward them automatically every time they order from your business.'), act,
      h('h2', { class: 'cl-ph' }, 'How it works'),
      h('div', { class: 'cl-hiw' }, h('div', { class: 'cl-hiwl' }, h('div', { class: 'scard cl-hcard' }, h('div', { class: 'cl-howt' }, h('span', { html: ICO.hand }), h('b', {}, 'Simple sign-up')), h('p', {}, 'Activate rewards with a simple process that takes just a few minutes.')),
        
        h('div', { class: 'scard cl-hcard' }, h('div', { class: 'cl-howt' }, h('span', { html: ICO.phone }), h('b', {}, 'Order more, earn rewards')), h('p', {}, 'Customers earn toward a reward every time they order from you. Progress is counted automatically.')),
        h('div', { class: 'scard cl-hcard' }, h('div', { class: 'cl-howt' }, h('span', { html: ICO.phone }), h('b', {}, 'Easy to redeem')), h('p', {}, 'Customers use their reward code when they order with you.'))),
        h('div', { class: 'cl-hiwr' }, h('div', { class: 'cl-demo' }, h('div', { class: 'cl-demo1' }, h('small', {}, 'You did it!'), h('b', {}, 'You’ve earned a reward'), h('small', {}, 'Don’t miss out—use your reward on your next order!')), h('div', { class: 'cl-demo2' }, h('div', {}, 'Claim my reward'), h('div', {}, 'No thanks')),
          h('div', { class: 'cl-demo3' }, h('b', {}, L.type === 'percent' ? `${L.value}% off` : `${money(L.value)} off`), h('small', {}, `When you place ${L.every} orders`), h('i', {}, h('em', { style: `width:${Math.round(((L.every - 1) / L.every) * 100)}%` })), h('small', { class: 'r' }, `${L.every - 1}/${L.every}`))))),
      h('h2', { class: 'cl-ph' }, 'Pricing'), h('p', { class: 'cl-pt' }, 'Rewards are included in your plan at no extra cost.'),
      h('h2', { class: 'cl-ph' }, 'Rewards FAQs'), h('div', { class: 'cl-faq' }, faq.map(([qq, a]) => { const body = h('p', { hidden: true }, a); const b = h('button', { type: 'button', 'aria-expanded': 'false', onclick: () => { const o = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(o)); body.hidden = !o; } }, h('i', { class: 'chv d' }), h('b', {}, qq)); return h('div', { class: 'cl-faqi' }, b, body); })),
      h('p', { class: 'cl-pt' }, 'Have additional questions? Visit our ', h('a', { href: '/contact', target: '_blank', rel: 'noopener' }, 'help center'), ' to learn more about rewards.'),
      h('h2', { class: 'cl-ph' }, 'Ready to get started?'), h('p', { class: 'cl-pt' }, 'With a few clicks, your rewards program will be live and available for immediate use.'), (() => { const b = act.cloneNode(true); b.onclick = act.onclick; return b; })())];
  };
  CL.gift = () => {
    if (giftData === null) { api('GET', `/api/sites/${id}/gift-cards`).then((r) => { giftData = r; if (tab === 'gift') paintPanel(); }).catch(() => { giftData = { cards: [] }; if (tab === 'gift') paintPanel(); }); return loadingPage('Gift cards'); }
    if ((giftData.cards || []).length || clState.giftSetup) return PANELS.gift();
    return [promoPage(null, 'Gift cards', pill('Included in plan', 'info'), 'Grow your business with gift cards', 'Sell gift cards online and in person. Set up digital cards in minutes and issue cards for your customers.', h('button', { type: 'button', class: 'btn cl-dark', onclick: () => { clState.giftSetup = true; paintPanel(); } }, 'Set up now'),
      ['How it works', [[ICO.card, 'Offer digital and in-store cards', 'Give your customers the flexibility to buy digital cards online or in-store cards in person.'], [ICO.redeem, 'Easy redemptions', 'Customers can redeem gift cards at your store or on your website.'], [ICO.manage, 'Manage it all in one place', 'Issue new cards, check balances and view reports directly from your dashboard.']]], 'Gift cards are included in your plan at no extra cost.')];
  };

  /* ---------- Switch business, profile ---------- */
  function switchBusiness() {
    let pick = '';
    sheet((close) => {
      const list = h('div', { class: 'swb-list' }, skel(3, 'row')), go2 = h('button', { type: 'button', class: 'btn cl-dark', disabled: true, onclick: async () => { const s = (sitesData || []).find((x) => x.id === pick); if (!s) return; close(); await flush(); go(s.role === 'kitchen' ? `/app/site/${s.id}/kitchen` : `/app/site/${s.id}`); } }, 'Switch business');
      let q = '';
      const draw = () => list.replaceChildren(...(sitesData || []).filter((s) => !q || s.name.toLowerCase().includes(q)).map((s) => h('label', { class: 'swb-item' }, h('input', { type: 'radio', name: 'swb', checked: pick === s.id, disabled: s.id === id, onchange: () => { pick = s.id; go2.disabled = false; } }), h('b', {}, s.name.toUpperCase()), s.id === id && h('small', {}, 'Current'))));
      if (sitesData) draw(); else api('GET', '/api/sites').then((r) => { sitesData = r.sites; draw(); }).catch((e) => toast(e.message, true));
      return [h('div', { class: 'swb-h' }, h('h2', {}, 'Switch your business'), h('button', { type: 'button', class: 'ss-x', 'aria-label': 'Close', onclick: close }, ic('x', 20))),
        h('label', { class: 'tsearch swb-s' }, ic('search', 18), h('input', { type: 'search', placeholder: 'Search', oninput: (e) => { q = e.target.value.trim().toLowerCase(); draw(); } })), list,
        h('div', { class: 'swb-f' }, h('button', { type: 'button', class: 'cl-link', style: 'margin-right:auto', onclick: async () => { close(); await flush(); go('/app/new'); } }, '+ Create another site'), h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), go2)];
    }, 'swb');
  }
  /* ---------- Profile, Online ordering and Customer outreach ---------- */
  const SV = (d, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  // Line drawings; the parts drawn in the accent colour carry class "ac".
  const PI = {
    pen: SV('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>', 18),
    plus: SV('<path d="M12 5v14M5 12h14"/>', 18),
    dl: SV('<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>', 18),
    check: SV('<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/>', 16),
    info: SV('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>', 18),
    ext: SV('<path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10"/>', 15),
    clock: SV('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 18),
    manage: SV('<path d="M8 4v4M8 12v8M16 4v9M16 17v3"/><path d="M5.5 10h5M13.5 15h5"/>', 17),
    trophy: SV('<path d="M7.5 4.5h9V9a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6.5H5a2.5 2.5 0 0 0 2.6 3.4M16.5 6.5H19a2.5 2.5 0 0 1-2.6 3.4M12 13.5V17M8.5 19.5h7M9.5 17h5v2.5h-5z"/>', 24),
    tag: SV('<path d="M3.5 12.2V4.8c0-.7.6-1.3 1.3-1.3h7.4l8.3 8.3a1.3 1.3 0 0 1 0 1.8l-7.4 7.4a1.3 1.3 0 0 1-1.8 0z"/><circle cx="8.3" cy="8.3" r="1.4"/>', 20),
    store: SV('<path d="M4.5 9.5 6 4.5h12l1.5 5"/><path d="M5.5 9.5v10h13v-10M4.5 9.5h15"/><path d="M10 19.5v-5h4v5"/>', 34),
    burst: SV('<path d="M12 3.5v7M12 13.5v7M3.5 12h7M13.5 12h7M6 6l4.9 4.9M13.1 13.1 18 18M18 6l-4.9 4.9M10.9 13.1 6 18"/>', 34),
    megaphone: SV('<path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M16.5 9a4 4 0 0 1 0 6M7.5 15l1.2 4.5"/>', 34),
    prep: SV('<path d="M4 5.5h16v2.2H4z"/><path d="M6.3 7.7 7 16.5M17.7 7.7 17 16.5M5 16.5h14M8 19.5h8"/><path class="ac" d="M10 11v2.6M12 10.5v3.1M14 11v2.6"/>', 34),
    sched: SV('<rect x="3.5" y="5" width="12.5" height="12" rx="1.5"/><path d="M3.5 8.8h12.5M7.2 3.5v3M12.3 3.5v3"/><circle class="ac" cx="17.3" cy="16.8" r="3.9"/><path class="ac" d="M17.3 15.1v1.8l1.2.8"/>', 34),
    menus: SV('<rect x="3.5" y="4" width="17" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/><path class="ac" d="M8 7.6h8M8 10h8M8 12.4h5"/>', 34),
    hours: SV('<rect x="3" y="4" width="14" height="10.5" rx="1.5"/><path d="M7 18.5h6M10 14.5v4"/><circle class="ac" cx="18" cy="15.6" r="3.8"/><path class="ac" d="M18 14v1.7l1.1.8"/>', 34),
    printer: SV('<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 14h10v6H7z"/><path class="ac" d="M9.5 17h5M16.5 11.5h.01"/>', 34),
    notes: SV('<path d="M13.5 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/><path d="M8 8.5h3.5M8 12h2"/><path class="ac" d="m10.5 15.5 1-3.6 6.6-6.6a1.5 1.5 0 0 1 2.1 2.1l-6.6 6.6z"/>', 34),
  };
  const logoTile = (src, name, size, cls = '') => (src ? h('img', { class: `oo-logo ${cls}`, src, alt: '', style: `width:${size}px;height:${size}px` })
    : h('span', { class: `oo-logo oo-ini ${cls}`, style: `width:${size}px;height:${size}px;font-size:${Math.round(size / 3)}px` }, (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()));
  const pfAct = (label, icon, onclick, cls = '', disabled = false) => h('button', { type: 'button', class: `pf-act ${cls}`, onclick, disabled }, icon && h('span', { class: 'pf-ai', html: icon }), label);
  const small = (title, body, actions) => sheet((close) => [h('div', { class: 'swb-h' }, h('h2', {}, title), h('button', { type: 'button', class: 'ss-x', 'aria-label': 'Close', onclick: close }, ic('x', 20))), ...[body(close)].flat(), h('div', { class: 'swb-f' }, ...actions(close))], 'swb');
  const bizOf = () => { const b = draft.business || {}; return { b, name: (draft.brand && draft.brand.name) || meta.name, logo: draft.brand && draft.brand.logo, addr: [b.address1, b.city, [b.state, b.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') }; };
  // Today's opening hours, in the business's own time zone, and whether it is open right now.
  const todayHours = () => {
    const tz = ordering.timezone || 'America/Chicago';
    const dayName = new Date().toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });
    const d = (ordering.hours || [])[DAYS.indexOf(dayName)];
    const t12 = (t) => { const [H, M] = String(t).split(':').map(Number); return `${H % 12 || 12}:${String(M || 0).padStart(2, '0')} ${H < 12 ? 'AM' : 'PM'}`; };
    let open = false; try { open = isOpenNow({ ...ordering, useHours: true }); } catch { open = false; }
    return { open, text: !d || d.closed ? 'Today Closed' : `Today ${t12(d.open)} – ${t12(d.close)}` };
  };

  /* Profile: full name, email, mobile number, password and multi-factor authentication. */
  CL.profile = () => {
    const u = state.user;
    const saveMe = async (patch) => { const user = (await api('PUT', '/api/me', patch)).user; state.user = { ...state.user, ...user }; };
    // One box, Cancel and Save. Enter saves too.
    const editOne = (title, label, value, attrs, save) => {
      const inp = h('input', { value: value || '', autofocus: true, ...attrs });
      const btn = h('button', { type: 'button', class: 'btn cl-blue' }, 'Save');
      small(title, () => h('div', { class: 'cl-promoform' }, h('label', { class: 'field cl-field' }, h('span', {}, label), inp)), (close) => {
        btn.onclick = async () => { btn.disabled = true; try { await save(inp.value); close(); toast('Saved'); paintPanel(); } catch (e) { toast(e.message, true); btn.disabled = false; } };
        inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); btn.click(); } };
        return [h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), btn];
      });
    };
    const editName = () => editOne('Full name', 'Full name', u.name, { maxlength: 80, autocomplete: 'name' }, async (v) => { if (!v.trim()) throw new Error('Enter your name.'); await saveMe({ name: v }); });
    const editPhone = () => editOne('Mobile number', 'Mobile number', u.phone, { type: 'tel', maxlength: 40, autocomplete: 'tel' }, (v) => saveMe({ phone: v }));
    const editPassword = () => {
      const cur = h('input', { type: 'password', autocomplete: 'current-password', autofocus: true }), nxt = h('input', { type: 'password', autocomplete: 'new-password' });
      small('Password', () => h('div', { class: 'cl-promoform' }, h('label', { class: 'field cl-field' }, h('span', {}, 'Current password'), cur), h('label', { class: 'field cl-field' }, h('span', {}, 'New password'), nxt)), (close) => {
        const btn = h('button', { type: 'button', class: 'btn cl-blue' }, 'Save');
        btn.onclick = async () => {
          if (nxt.value.length < 8) return toast('Use at least 8 characters for your new password.', true);
          btn.disabled = true;
          try { await api('POST', '/api/auth/password', { current: cur.value, next: nxt.value }); close(); toast('Password updated'); } catch (e) { toast(e.message, true); btn.disabled = false; }
        };
        nxt.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); btn.click(); } };
        return [h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), btn];
      });
    };
    // Turning the authenticator app on or off uses the same steps as before: a QR code to scan, or the password to switch it off.
    const twoFa = () => { const old = PANELS.profile(); const card = [...old[0].querySelectorAll('.prof-card')].find((c) => c.querySelector('h3')?.textContent === 'Two-step sign-in'); card?.querySelector('button')?.click(); };
    const recovery = () => {
      if (!u.twoFactor) return toast('Turn on the authenticator app first.', true);
      const pw = h('input', { type: 'password', autocomplete: 'current-password', autofocus: true });
      small('Download recovery codes', () => [h('p', { class: 'cl-small' }, 'You will get 10 new recovery codes. Each one works once. Any codes you downloaded before will stop working.'),
        h('div', { class: 'cl-promoform' }, h('label', { class: 'field cl-field' }, h('span', {}, 'Your password, to confirm'), pw))], (close) => {
        const btn = h('button', { type: 'button', class: 'btn cl-blue' }, 'Download');
        pw.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); btn.click(); } };
        btn.onclick = async () => {
          if (!pw.value) return toast('Enter your password.', true);
          btn.disabled = true;
          try {
            const { codes } = await api('POST', '/api/me/2fa/recovery', { password: pw.value });
            const text = ['Processor Freedom recovery codes', `Account: ${u.email}`, `Made: ${new Date().toLocaleString()}`, '', 'Each code works once. Keep them somewhere safe.', '', ...codes, ''].join('\n');
            const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
            const a = h('a', { href: url, download: 'processor-freedom-recovery-codes.txt' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
            close();
            small('Your recovery codes', () => [h('p', { class: 'cl-small' }, 'Keep them somewhere safe. Each one works once.'), h('div', { class: 'pf-codes' }, codes.map((c) => h('code', {}, c)))],
              (c2) => [h('button', { type: 'button', class: 'btn soft', onclick: async () => { try { await navigator.clipboard.writeText(codes.join('\n')); toast('Copied'); } catch { toast('Copy them from the list', true); } } }, 'Copy'), h('button', { type: 'button', class: 'btn cl-blue', onclick: c2 }, 'Done')]);
          } catch (e) { toast(e.message, true); btn.disabled = false; }
        };
        return [h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), btn];
      });
    };
    const status = (on) => h('span', { class: `pf-pill${on ? ' on' : ''}` }, on && h('span', { class: 'pf-ai', html: PI.check }), on ? 'Enabled' : 'Disabled');
    const card = (title, note, value, action) => h('div', { class: 'scard pf-card' },
      h('div', { class: 'pf-top' }, h('div', { class: 'pf-main' }, h('h2', {}, title), note && h('p', { class: 'pf-note' }, note)), action), value && h('p', { class: 'pf-val' }, value));
    // Methods that cannot be used yet are shown, greyed out.
    const row = (title, desc, on, action, off) => h('div', { class: `pf-row${off ? ' off' : ''}`, 'aria-disabled': off ? 'true' : null, title: off ? 'Not available yet' : null },
      h('div', { class: 'pf-main' }, h('h3', {}, title), desc && h('p', { class: 'pf-note' }, desc), on != null && status(on)), action);
    return [h('div', { class: 'cl pf' }, h('h1', { class: 'pf-title' }, 'Profile'),
      card('Full name', null, u.name, pfAct('Edit', PI.pen, editName)),
      card('Email address', null, u.email, null),
      card('Mobile number', 'This number will be used for text message authentication once it is available.', u.phone, u.phone ? pfAct('Edit', PI.pen, editPhone) : pfAct('Add', PI.plus, editPhone)),
      card('Password', 'Use at least 8 characters. Changing it signs you out on your other devices.', null, pfAct('Edit', PI.pen, editPassword)),
      h('div', { class: 'scard pf-card pf-mfa' }, h('h2', {}, 'Multi-factor authentication'),
        row('Text message authentication', null, false, pfAct('Enable', null, null, '', true), true),
        row('Authenticator app', null, !!u.twoFactor, u.twoFactor ? pfAct('Disable', null, twoFa, 'danger') : pfAct('Enable', null, twoFa)),
        row('Processor Freedom app authentication', 'Use the Processor Freedom app to turn on this authentication method.', false, null, true),
        row('Recovery codes', 'If you don’t have your phone, you can enter a recovery code to securely log in to your Processor Freedom account. Select Download to save a set of 10 recovery codes on your device, then store them in a safe location. Enter a unique recovery code each time you log in.', null, pfAct('Download', PI.dl, recovery))))];
  };

  /* Online ordering, under Order tools. Partners that are not connected yet are shown, greyed out. */
  const MARKETS = [
    { name: 'Uber Eats', mono: 'UE', supports: 'Delivery and in-store pickup orders' },
    { name: 'DoorDash', mono: 'DD', supports: 'In-store pickup and scheduled orders' },
    { name: 'Grubhub', mono: 'GH', supports: 'In-store pickup, DoorDash delivery and scheduled orders', note: 'Reach more customers by appearing on Grubhub', more: true },
    { name: 'Order with Google', mono: 'G', supports: 'Pickup orders from Google Search and Maps', info: true },
  ];
  const PARTNERS = ['DoorDash', 'Grubhub', 'Uber Eats', 'Order with Google'].map((n) => MARKETS.find((m) => m.name === n));
  const OFF = { 'aria-disabled': 'true', title: 'Not available yet' };
  const tog = (input, label) => h('label', { class: 'switch oo-sw' }, input, h('i'), h('span', {}, label));
  CL.online = () => {
    const { b, name, logo, addr } = bizOf();
    const launch = h('div', { class: 'scard oo-launch' }, h('div', { class: 'oo-launchtx' }, h('h2', {}, 'Launch your online presence with Processor Freedom'), h('p', {}, 'Create a new branded website or link an online ordering site to your existing website.')), pfAct('Manage', PI.manage, () => goTab(lastTab.site || 'design')));
    const banner = h('div', { class: 'oo-ban off', ...OFF }, h('span', { class: 'oo-bi', html: PI.info }), h('div', {}, h('b', {}, 'New! Delivery for online orders'), h('p', {}, 'Offer customers the option for orders placed through Processor Freedom and Google to be delivered directly to them by DoorDash. ', h('span', { class: 'oo-fake' }, 'Get started'))));
    const tabsBar = cTabs([['partners', 'Partners'], ['settings', 'Settings']], clState.ooTab, (k) => { clState.ooTab = k; });
    let body;
    if (clState.ooTab === 'partners') {
      body = [h('p', { class: 'oo-plabel' }, 'Third-Party Marketplaces'), ...PARTNERS.map((m) => h('div', { class: 'scard oo-prow off', ...OFF },
        h('div', { class: 'oo-plogo' }, h('span', { class: 'oo-mono lg' }, m.mono), h('small', {}, m.name)),
        h('div', { class: 'oo-psup' }, h('b', {}, 'Supports'), h('p', {}, m.supports)), h('button', { type: 'button', class: 'oo-pill', disabled: true }, 'Manage')))];
    } else {
      const dev = isOwner ? need('devices', 'devices') : null;
      const host = meta.live && meta.url ? meta.url.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
      const biz = h('section', { class: 'oo-biz' }, h('h2', { class: 'oo-h' }, 'Business information'),
        h('div', { class: 'scard oo-bizcard' },
          h('div', { class: 'oo-bizrow' }, logoTile(logo, name, 172, 'oo-big'),
            h('div', { class: 'oo-bizinfo' }, host ? h('a', { class: 'oo-bizname', href: meta.url, target: '_blank', rel: 'noopener' }, name) : h('b', { class: 'oo-bizname' }, name),
              addr && h('p', {}, addr), b.phone && h('a', { class: 'oo-link', href: `tel:${String(b.phone).replace(/[^\d+]/g, '')}` }, b.phone),
              host && h('a', { class: 'oo-link oo-web', href: meta.url, target: '_blank', rel: 'noopener' }, h('span', {}, host), h('span', { class: 'oo-ext', html: PI.ext })),
              b.email && h('p', {}, b.email))),
          h('div', { class: 'oo-bizfoot' }, h('span', { class: 'oo-fi', html: PI.info }), h('p', {}, 'This information mirrors your customer-facing business information. To correct any out-of-date details, edit them in the ', h('button', { type: 'button', class: 'oo-inl', onclick: () => goTab('bizinfo') }, 'Business information settings'), ' page.'))));
      const on = !!ordering.enabled, acc = on && ordering.accepting !== false;
      const sw = h('input', { type: 'checkbox', checked: acc, disabled: !on, onchange: async (e) => {
        const box = e.target, want = box.checked;
        box.disabled = true;   // one save at a time, so a failed save can never leave the switch out of step
        ordering.accepting = want;
        try { await putOrdering(); toast(want ? 'Accepting online orders' : 'Online orders paused'); } catch (err) { ordering.accepting = !want; toast(err.message, true); }
        paintPanel(); panel.querySelector('.oo-side .oo-st:not(.off) input')?.focus();
      } });
      const side = h('aside', { class: 'oo-side' },
        h('div', { class: 'oo-st' }, h('div', { class: 'oo-sthead' }, h('img', { class: 'oo-stlogo', src: '/assets/logo-dark.svg', alt: '', width: 26, height: 26 }), h('div', {}, h('b', {}, 'Processor Freedom Online Ordering'), h('p', {}, !on ? 'Online ordering is off.' : acc ? 'Accepting online orders.' : 'Online orders are paused.'))),
          h('div', { class: 'oo-stbody' }, tog(sw, acc ? 'Accepting orders' : 'Not accepting orders'), h('button', { type: 'button', class: 'oo-pill', onclick: () => goTab('ordering') }, h('span', { html: PI.manage }), 'Manage'))),
        h('h3', { class: 'oo-sh' }, 'Third-Party Marketplaces'),
        ...MARKETS.map((m) => h('div', { class: 'oo-st off', ...OFF }, h('div', { class: 'oo-sthead' }, h('span', { class: 'oo-mono' }, m.mono), h('div', {}, h('b', {}, m.name, m.info && h('span', { class: 'oo-i', html: PI.info })), h('p', {}, m.note || 'Not connected.'))),
          h('div', { class: 'oo-stbody' }, m.more ? h('button', { type: 'button', class: 'oo-more', disabled: true }, 'More Info')
            : [tog(h('input', { type: 'checkbox', disabled: true, 'aria-label': `${m.name} orders` }), 'Not accepting orders'), h('button', { type: 'button', class: 'oo-pill', disabled: true }, h('span', { html: PI.manage }), 'Manage')]))));
      const th = todayHours(), menusN = (ordering.menus || []).length, devN = dev && dev.devices ? dev.devices.length : null;
      const op = (icon, title, value, k) => h('div', { class: 'scard oo-op' }, h('div', { class: 'oo-optop' }, h('span', { class: 'oo-opic', html: icon }), k && pfAct('Edit', PI.pen, () => goTab(k))), h('div', { class: 'oo-optx' }, h('b', {}, title), h('p', {}, value)));
      const off = 'Online ordering is off';
      const ops = h('section', { class: 'oo-ops' }, h('h2', { class: 'oo-h' }, 'Operational information'), h('div', { class: 'oo-opgrid' },
        op(PI.prep, 'Food preparation time', `${ordering.prepMinutes || 0} minutes`, 'ordering'),
        op(PI.sched, 'Scheduled orders', !on ? off : ordering.scheduling ? 'Customers can place orders for later today or tomorrow' : 'Customers can only order for as soon as possible', 'hours'),
        op(PI.menus, 'Online menus', menusN ? `${menusN} menu${menusN === 1 ? '' : 's'}` : 'Edit your online menus', 'menus'),
        op(PI.hours, 'Online business hours', !on ? off : ordering.useHours ? th.text : 'Orders are taken at any time', 'hours'),
        isOwner ? op(PI.printer, 'Order printing device', devN == null ? '…' : devN ? `${devN} device${devN === 1 ? '' : 's'} get new orders` : 'No device set up yet', 'devices') : op(PI.printer, 'Order printing device', 'Set up by the account owner', null),
        op(PI.notes, 'Customer requests', !on ? off : ordering.allowNotes !== false ? 'Customers can add special instructions' : 'Special instructions are turned off', 'ordering')));
      body = [h('div', { class: 'oo-grid' }, biz, side, ops)];
    }
    return [h('div', { class: 'cl oo' }, cHead('Order tools', 'Online ordering'), banner, tabsBar, launch, ...body)];
  };

  /* Customer outreach, under Order tools. Every link goes to the page in Settings where that thing already lives. */
  CL.outreach = () => {
    const { b, name, logo, addr } = bizOf();
    const C = need('customers', 'customers');
    const th = todayHours();
    // Rewards count every customer who has ordered, by email, once Rewards is on.
    const rwOn = !!(ordering.loyalty && ordering.loyalty.enabled);
    const members = C && rwOn ? (C.customers || []).filter((c) => c.orders > 0 && c.first) : [];
    const weekAgo = Date.now() - 7 * 86400000, newer = members.filter((c) => c.first >= weekAgo).length;
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long' });
    const pts = Array.from({ length: 7 }, (_, i) => { const end = new Date(); end.setHours(23, 59, 59, 999); end.setDate(end.getDate() - (6 - i)); return { label: `${end.getMonth() + 1}/${end.getDate()}`, n: members.filter((c) => c.first <= end.getTime()).length }; });
    const top = Math.max(1, ...pts.map((p) => p.n));
    const line = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${38 - (p.n / top) * 30}`).join(' ');
    // A phone showing how the listing could look, with this business's own name and logo.
    const phone = (kind) => h('div', { class: `co-phone ${kind}` }, h('i', { class: 'co-notch' }), h('div', { class: 'co-shot' }, logoTile(logo, name, 54)),
      h('div', { class: 'co-ptx' }, h('b', {}, name), addr && h('small', {}, addr)), kind === 'g' && h('div', { class: 'co-ptabs' }, h('span', { class: 'on' }, 'Overview'), h('span', {}, 'Updates'), h('span', {}, 'Reviews'), h('span', {}, 'Photos')));
    const band = (kind, icon) => [h('div', { class: `co-band ${kind}` }), h('span', { class: `co-badge ${kind}`, html: icon })];
    const active = (ordering.promos || []).filter((p) => p.active).slice(0, 2);
    return [h('div', { class: 'cl co' },
      h('div', { class: 'co-head' },
        h('div', { class: 'co-logo' }, logoTile(logo, name, 80, 'co-lg'), h('button', { type: 'button', class: 'co-pen', 'aria-label': 'Change your logo', title: 'Change your logo', html: PI.pen, onclick: () => goTab('design') })),
        h('div', { class: 'co-row' },
          h('div', { class: 'co-info' }, h('h1', {}, name), addr && h('p', {}, addr), b.phone && h('p', {}, b.phone), b.email && h('p', {}, b.email)),
          h('div', { class: 'co-side' }, h('button', { type: 'button', class: 'co-a', onclick: () => goTab('bizinfo') }, 'Edit business information'),
            ordering.useHours && h('p', { class: 'co-open' }, h('span', { html: PI.clock }), th.open ? 'Open' : 'Closed'), h('button', { type: 'button', class: 'co-a lg', onclick: () => goTab('hours') }, 'Edit business hours')))),
      h('h2', { class: 'co-h' }, 'Connect with your customers'),
      h('div', { class: 'co-grid' },
        h('div', { class: 'scard co-card' }, ...band('g', PI.store), h('div', { class: 'co-body' }, h('h3', { class: 'co-gname' }, 'Google Business Profile'),
          h('p', { class: 'co-tx' }, h('b', {}, 'Stand out on Google'), ' and reach customers looking for businesses like yours on Google Search and Maps. Easily manage your business profile and reviews across Google.'), phone('g')),
          h('div', { class: 'co-foot' }, h('a', { class: 'co-claim', href: 'https://business.google.com/', target: '_blank', rel: 'noopener' }, 'Claim your business'))),
        h('div', { class: 'scard co-card' }, ...band('y', PI.burst), h('div', { class: 'co-body' }, h('h3', { class: 'co-yname' }, 'Yelp ', h('span', {}, 'for business')),
          h('p', { class: 'co-tx' }, h('b', {}, 'Get discovered on Yelp'), ' and grow your market.'), phone('y')),
          h('div', { class: 'co-foot' }, h('a', { class: 'co-claim', href: 'https://biz.yelp.com/', target: '_blank', rel: 'noopener' }, 'Claim your business'))),
        h('div', { class: 'scard co-card co-rw' }, h('div', { class: 'co-body' }, h('h3', { class: 'co-title' }, h('span', { class: 'co-trophy', html: PI.trophy }), 'Rewards'),
          h('p', { class: 'co-k' }, 'Loyalty members'), h('b', { class: 'co-big' }, C ? members.length.toLocaleString() : '…'),
          h('p', { class: 'co-delta' }, !rwOn ? 'Rewards are off.' : newer > 0 ? [h('em', {}, `↑${newer}`), ` since last ${today}`] : `No change since last ${today}`),
          h('div', { class: 'co-chart' }, h('div', { class: 'co-line', html: `<svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>` }), h('div', { class: 'co-x' }, pts.map((p) => h('span', {}, p.label))))),
          h('div', { class: 'co-foot' }, h('button', { type: 'button', class: 'co-claim', onclick: () => goTab('rewards') }, 'Manage rewards'))),
        h('div', { class: 'scard co-card' }, ...band('p', PI.megaphone), h('div', { class: 'co-body' }, h('h3', { class: 'co-ptitle' }, 'Promos'),
          h('p', { class: 'co-tx' }, h('b', {}, 'Bring in new customers'), ' by creating custom discounts and special offers that you can share on social media or via email.'),
          active.length > 0 && h('div', { class: 'co-promos' }, active.map((p) => h('div', { class: 'co-promo' }, h('span', { class: 'co-pic', html: PI.tag }), h('div', {}, h('b', {}, p.code), h('small', {}, p.type === 'amount' ? `${money(p.value)} off` : `${p.value}% off`)))))),
          isOwner && h('div', { class: 'co-foot' }, h('button', { type: 'button', class: 'co-claim', onclick: () => { clState.openPromo = true; goTab('promos'); } }, 'Create a promo')))))];
  };
  /* Change business name (DBA): one window, used by Business information and by the website's Business name box.
     The new name is used everywhere straight away, and the account owner gets an email about it. */
  function changeName() {
    const inp = h('input', { value: (draft.brand && draft.brand.name) || meta.name, maxlength: 80, autofocus: true, autocomplete: 'organization' });
    const btn = h('button', { type: 'button', class: 'btn cl-blue' }, 'Save');
    small('Change business name "DBA"', () => h('div', { class: 'cl-promoform' }, h('label', { class: 'field cl-field' }, h('span', {}, 'Business name'), inp)), (close) => {
      btn.onclick = async () => {
        const name = inp.value.replace(/\s+/g, ' ').trim();
        if (!name) return toast('Enter your business name.', true);
        btn.disabled = true;
        try {
          await flush();
          const r = await api('PUT', `/api/sites/${id}/name`, { name });
          meta = { ...meta, ...r.site }; draftRev = r.site.draftRev; draft.brand.name = r.site.name; title(meta.name);
          close();
          toast(!r.emailed ? 'Business name changed' : isOwner ? 'Business name changed. We emailed you about it.' : 'Business name changed. The account owner was emailed.');
          paint(true); paintTop(); paintPanel();
        } catch (e) { toast(e.message, true); btn.disabled = false; }
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); btn.click(); } };
      return [h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), btn];
    });
  }

  /* Business information, laid out like the photo: customer-facing details, logo, privacy policy, locale and currency. */
  CL.bizinfo = () => {
    const b = draft.business || (draft.business = {}), { name, logo } = bizOf();
    const host = meta.live && meta.url ? meta.url.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
    const lines = [b.address1, [b.city, b.state].filter(Boolean).join(', '), b.zip].filter(Boolean);
    // A small window for one or more of the details, saved with the website like before.
    const edit = (title, fields, check) => {
      const boxes = fields.map(([label, k, a = {}], i) => [k, label, h('input', { value: b[k] || '', autofocus: i === 0, ...a })]);
      const btn = h('button', { type: 'button', class: 'btn cl-blue' }, 'Save');
      small(title, () => h('div', { class: 'cl-promoform' }, boxes.map(([, label, el]) => h('label', { class: 'field cl-field' }, h('span', {}, label), el))), (close) => {
        btn.onclick = () => {
          const v = Object.fromEntries(boxes.map(([k, , el]) => [k, el.value.trim()]));
          const bad = check && check(v); if (bad) return toast(bad, true);
          Object.assign(b, v); changed(); close(); toast('Saved'); paintPanel();
        };
        for (const [, , el] of boxes) el.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); btn.click(); } };
        return [h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), btn];
      });
    };
    const pickLogo = async () => {
      const [file] = await pickFiles(); if (!file) return;
      try { draft.brand.logo = await uploadImage(file); if (draft.brand.logoMode === 'text') draft.brand.logoMode = 'image'; changed(); toast('Logo saved'); paintPanel(); } catch (e) { toast(e.message, true); }
    };
    const row = (label, value, action, note) => h('div', { class: 'bi-row' }, h('div', { class: 'bi-top' }, h('h3', {}, label), action), note && h('p', { class: 'pf-note' }, note), h('div', { class: 'bi-val' }, [].concat(value).map((x) => h('p', {}, x))));
    const card = (title, note, action, ...rest) => h('div', { class: 'scard pf-card' }, h('div', { class: 'pf-top' }, h('div', { class: 'pf-main' }, h('h2', {}, title), note && h('p', { class: 'pf-note' }, note)), action), ...rest);
    const priv = draft.legal && draft.legal.privacy, privOn = !!(priv && priv.enabled);
    const camera = SV('<path d="M4 8.5h3l1.6-2.2h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13.3" r="3.3"/><path d="M19 4v4M17 6h4"/>', 24);
    return [h('div', { class: 'cl pf bi' },
      h('button', { type: 'button', class: 'bi-back', onclick: () => goTab('settings') }, h('span', { html: SV('<path d="M19 12H5M11 6l-6 6 6 6"/>', 20) }), 'Settings'),
      h('h1', { class: 'pf-title' }, 'Business information'),
      h('p', { class: 'bi-sub' }, name),
      h('div', { class: 'scard pf-card bi-card' }, h('h2', {}, 'Customer-facing information'),
        h('p', { class: 'pf-note' }, 'This information appears on your website, order pages and ', h('button', { type: 'button', class: 'oo-inl', onclick: () => goTab('alerts') }, 'receipts'), '. It may or may not be the same as your billing and tax-related business information.'),
        row('DBA name', name, pfAct('Edit', PI.pen, changeName)),
        row('Business phone number', b.phone || 'None', pfAct('Edit', PI.pen, () => edit('Business phone number', [['Business phone number', 'phone', { type: 'tel', maxlength: 40, autocomplete: 'tel' }]]))),
        row('Customer contact email address (optional)', b.email || 'None', pfAct('Edit', PI.pen, () => edit('Customer contact email address', [['Email address', 'email', { type: 'email', maxlength: 200, autocomplete: 'email' }]], (v) => (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) ? 'Enter a full email address, like name@example.com.' : ''))),
          'This is the email customers can reach you at. It is separate from the email address you log in with.'),
        row('Business address', lines.length ? lines : 'None', pfAct('Edit', PI.pen, () => edit('Business address', [['Street address', 'address1', { maxlength: 160, autocomplete: 'address-line1' }], ['City', 'city', { maxlength: 80, autocomplete: 'address-level2' }], ['State', 'state', { maxlength: 40, autocomplete: 'address-level1' }], ['ZIP', 'zip', { maxlength: 12, inputmode: 'numeric', autocomplete: 'postal-code' }]]))),
        row('Website (optional)', host || 'None', pfAct('Edit', PI.pen, () => goTab('domain')))),
      card('Logo', 'Your logo appears on your website and order pages.', logo ? pfAct('Edit', PI.pen, pickLogo) : pfAct('Add', PI.plus, pickLogo),
        h('button', { type: 'button', class: `bi-logo${logo ? ' has' : ''}`, 'aria-label': logo ? 'Replace logo' : 'Add a logo', onclick: pickLogo }, logo ? h('img', { src: logo, alt: '' }) : h('span', { html: camera }))),
      card('Privacy policy', ['Learn how to stay compliant with the ', h('a', { href: 'https://oag.ca.gov/privacy/ccpa', target: '_blank', rel: 'noopener' }, 'California Consumer Privacy Act (CCPA)'), ' and include your own privacy policy on your website.'],
        privOn ? pfAct('Edit', PI.pen, () => goTab('policies')) : pfAct('Add', PI.plus, () => goTab('policies')),
        h('p', { class: 'pf-val' }, !privOn ? 'None' : priv.custom && String(priv.custom).trim() ? 'Your own privacy policy, on your website' : 'Shown on your website')),
      h('div', { class: 'scard pf-card' }, h('h2', {}, 'Locale and currency'),
        h('div', { class: 'bi-kv' }, h('b', {}, 'Locale'), h('span', {}, draft.lang === 'es' ? 'es-US' : 'en-US')),
        h('div', { class: 'bi-kv' }, h('b', {}, 'Currency'), h('span', {}, 'USD'))))];
  };

  /* ---------- Items section: Item list, Categories, Modifier groups, Menus, Printer labels, Revenue classes, Discounts.
     Laid out like the owner's photos. Things that cannot work here yet (point of sale, third-party channels) are greyed out. ---------- */
  const II = {
    columns: SV('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15M14.5 4.5v15"/>', 24),
    plus: SV('<path d="M12 5v14M5 12h14"/>', 20),
    layout: SV('<rect x="3" y="4.5" width="13" height="10" rx="1.5"/><path d="M6.5 18.5h6M9.5 14.5v4"/><rect x="14.5" y="9" width="6.5" height="10.5" rx="1.2"/>', 24),
    up: SV('<path d="M12 19V5M6 11l6-6 6 6"/>', 24),
    down: SV('<path d="M12 5v14M6 13l6 6 6-6"/>', 24),
    both: SV('<path d="M8 5v14M4.5 15.5 8 19l3.5-3.5M16 19V5M12.5 8.5 16 5l3.5 3.5"/>', 16),
    info: SV('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/>', 20),
    pencil: SV('<path d="M4.5 19.5h4l10-10a2.8 2.8 0 0 0-4-4l-10 10z"/><path d="m13 7 4 4"/>', 22),
    pub: SV('<path d="M12 15V4M8 8l4-4 4 4M5 18.5h14"/>', 16),
    sliders: SV('<path d="M8 4v8.4M8 17.6V20M16 4v2.4M16 11.6V20"/><circle cx="8" cy="15" r="2.6"/><circle cx="16" cy="9" r="2.6"/>', 26),
    chevD: SV('<path d="m6 9 6 6 6-6"/>', 22),
    chevU: SV('<path d="m6 15 6-6 6 6"/>', 22),
    chevL: SV('<path d="m15 6-6 6 6 6"/>', 18),
    chevR: SV('<path d="m9 6 6 6-6 6"/>', 18),
    back: SV('<path d="M19 12H5M11 6l-6 6 6 6"/>', 24),
    handle: SV('<path d="M5 10h14M5 14h14"/>', 26),
    copy: SV('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>', 22),
    unpub: SV('<path d="M12 4v10M8 10.5l4 4 4-4M5 18.5h14"/>', 16),
    bin: SV('<path d="M5 7h14M10 11v6M14 11v6M7 7l1 12h8l1-12M9.5 7V4.5h5V7"/>', 16),
    reset: SV('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4"/>', 16),
    left: SV('<path d="M19 12H5M11 6l-6 6 6 6"/>', 18),
    right: SV('<path d="M5 12h14M13 6l6 6-6 6"/>', 18),
    upk: SV('<path d="M12 19V5M6 11l6-6 6 6"/>', 18),
  };
  const itBtn = (label, { icon, kind = 'grey', onclick, disabled = false, cls = '' } = {}) => h('button', { type: 'button', class: `it-btn ${kind} ${cls}`, onclick, disabled }, icon && h('span', { class: 'it-bic', html: icon }), label);
  const itHead = (title, ...right) => h('div', { class: 'it-head' }, h('h1', {}, title), right.filter(Boolean).length > 0 && h('div', { class: 'it-tools' }, ...right.filter(Boolean)));
  const itMore = (items) => { const b = moreBtn(items); b.classList.add('it-more'); return b; };
  const itQ = (k) => ((clState.itq ||= {})[k] || '').trim().toLowerCase();
  const itSearch = (ph, k) => { const el = cSearch(ph, (clState.itq ||= {})[k] || '', (v) => { clState.itq[k] = v; const st = (clState.it ||= {})[k]; if (st) st.page = 0; }); el.classList.add('it-search'); return el; };
  // A switch like the photos: filled with a tick when on. Greyed out and disabled where the feature is not available yet.
  const itSw = (checked, onchange, { disabled = false, label = '', soon = false } = {}) => h('label', { class: `it-sw${soon ? ' soon' : ''}`, title: soon ? 'Not available yet' : null, onclick: (e) => e.stopPropagation() },
    h('input', { type: 'checkbox', checked: !!checked, disabled: disabled || soon, 'aria-label': label, onchange }), h('i', { 'aria-hidden': 'true' }));
  const itSwatch = (src) => (src ? h('img', { class: 'it-swatch', src, alt: '', loading: 'lazy' }) : h('span', { class: 'it-swatch none', 'aria-hidden': 'true' }));
  const itLink = (text, onclick) => h('button', { type: 'button', class: 'it-link', onclick: (e) => { e.stopPropagation(); onclick(); } }, text);
  const itSeg = (opts, val, set) => h('div', { class: 'it-seg', role: 'tablist' }, opts.map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === val), onclick: () => { set(k); paintPanel(); panel.querySelector('.it-seg [aria-selected="true"]')?.focus(); } }, l)));
  const itBack = (label, tab) => h('div', { class: 'it-back' }, h('button', { type: 'button', onclick: () => goTab(tab) }, h('span', { html: II.back }), label));
  const itCard = (...kids) => h('div', { class: 'it-card' }, ...kids);
  const csvDownload = (name, rows) => csvFile(`${meta.slug}-${name}`, rows);

  /* A table card like the photos: optional tick boxes, sortable columns with their arrows, rows that open, and a page footer. */
  function itTable({ key, cols, rows, select, sortBy, expand, per, perLabel, empty, onSel, plain }) {
    const st = (clState.it ||= {})[key] ||= { sel: new Set(), sort: sortBy ? { k: sortBy, dir: 1 } : null, page: 0, per: 25, open: new Set() };
    for (const sid of [...st.sel]) if (!rows.some((r) => r.id === sid)) st.sel.delete(sid);
    let rs = rows;
    if (st.sort) { const c = cols.find((x) => x.k === st.sort.k); if (c && c.sort) rs = [...rows].sort((a, b) => { const x = c.sort(a), y = c.sort(b); return (x > y ? 1 : x < y ? -1 : 0) * st.sort.dir; }); }
    const total = rs.length, size = per ? st.per : total || 1, pages = Math.max(1, Math.ceil(total / size));
    if (st.page >= pages) st.page = pages - 1;
    const shown = per ? rs.slice(st.page * size, st.page * size + size) : rs;
    const allOn = shown.length > 0 && shown.every((r) => st.sel.has(r.id));
    const sortIc = (c) => h('span', { class: 'it-sort', html: st.sort && st.sort.k === c.k ? (st.sort.dir > 0 ? II.up : II.down) : II.both });
    const inner = (c) => [h('span', { class: c.tip ? 'it-tip' : '', title: c.tip || null }, c.l), c.sort && sortIc(c)];
    const th = (c) => h('th', { class: `${c.sort ? 'srt' : ''} ${c.cls || ''} ${c.tip ? 'tipc' : ''}`, 'aria-sort': st.sort && st.sort.k === c.k ? (st.sort.dir > 0 ? 'ascending' : 'descending') : null },
      c.sort ? h('button', { type: 'button', class: `it-th it-thb${c.next ? ' next' : ''}`, onclick: () => { st.sort = { k: c.k, dir: st.sort && st.sort.k === c.k ? -st.sort.dir : 1 }; paintPanel(); } }, ...inner(c))
        : h('span', { class: `it-th${c.next ? ' next' : ''}` }, ...inner(c)));
    const head = h('tr', {}, expand && h('th', { class: 'it-ex' }), select && h('th', { class: 'it-cb' }, h('input', { type: 'checkbox', 'aria-label': 'Select all', checked: allOn, onchange: (e) => { for (const r of shown) e.target.checked ? st.sel.add(r.id) : st.sel.delete(r.id); onSel?.(); paintPanel(); } })), cols.map(th));
    const body = shown.flatMap((r) => {
      const open = expand && st.open.has(r.id);
      const tr = h('tr', { class: st.sel.has(r.id) ? 'sel' : '' },
        expand && h('td', { class: 'it-ex' }, h('button', { type: 'button', class: 'it-exb', 'aria-expanded': String(!!open), 'aria-label': open ? 'Hide modifiers' : 'Show modifiers', html: open ? II.chevU : II.chevD, onclick: () => { open ? st.open.delete(r.id) : st.open.add(r.id); paintPanel(); } })),
        select && h('td', { class: 'it-cb' }, h('input', { type: 'checkbox', 'aria-label': `Select ${r.label || ''}`.trim(), checked: st.sel.has(r.id), onchange: (e) => { e.target.checked ? st.sel.add(r.id) : st.sel.delete(r.id); onSel?.(); paintPanel(); } })),
        cols.map((c) => h('td', { class: c.cls || '' }, r.cells[c.k] ?? '')));
      return open ? [tr, h('tr', { class: 'it-sub' }, h('td', { colspan: cols.length + (select ? 1 : 0) + 1 }, expand(r)))] : [tr];
    });
    const foot = per && total > 0 && h('div', { class: 'it-pager' },
      h('label', { class: 'it-per' }, h('span', {}, perLabel || 'Items per page'), h('select', { onchange: (e) => { st.per = Number(e.target.value); st.page = 0; paintPanel(); } }, [10, 25, 50, 100].map((n) => h('option', { value: n, selected: st.per === n }, String(n))))),
      h('span', { class: 'it-pages' }, h('span', { class: 'it-range' }, `${st.page * size + 1} - ${Math.min(total, st.page * size + size)}`),
        h('button', { type: 'button', class: 'it-pg', 'aria-label': 'Previous page', disabled: st.page === 0, html: II.chevL, onclick: () => { st.page -= 1; paintPanel(); } }),
        h('button', { type: 'button', class: 'it-pg', 'aria-label': 'Next page', disabled: st.page >= pages - 1, html: II.chevR, onclick: () => { st.page += 1; paintPanel(); } })));
    const fixed = cols.some((c) => c.w);
    const colgroup = fixed && h('colgroup', {}, expand && h('col', { style: '--w:54px' }), select && h('col', { style: '--w:66px' }), cols.map((c) => h('col', { style: c.w ? `--w:${c.w}` : null })));
    return h('div', { class: `it-table${plain ? ' plain' : ''}` }, h('div', { class: 'tscroll' }, h('table', { class: fixed ? 'fixed' : null }, colgroup, h('thead', {}, head), h('tbody', {}, body))), !total && empty, foot);
  }
  const itSel = (key) => [...(((clState.it || {})[key] || {}).sel || [])];
  const itClear = (key) => { const st = (clState.it || {})[key]; if (st) st.sel.clear(); };
  // What appears when rows are ticked: how many, the actions, and Clear.
  const itBulk = (key, nouns, actions) => { const n = itSel(key).length; const [one, many] = Array.isArray(nouns) ? nouns : [nouns, `${nouns}s`]; return n > 0 && h('div', { class: 'it-bulk', role: 'region', 'aria-label': 'Selected' }, h('div', { class: 'it-bulkn' }, h('b', {}, `${n} ${n === 1 ? one : many} selected`), h('button', { type: 'button', class: 'it-textbtn', onclick: () => { itClear(key); paintPanel(); } }, 'Clear')), ...actions.filter(Boolean)); };

  /* A side panel like the photos' layout panels: header with close, a body that scrolls, Cancel and Save (pale until something changes). */
  function itDrawer(title, build) {
    sheet((close) => {
      const save = h('button', { type: 'button', class: 'it-btn fill', disabled: true }, 'Save');
      const { body, onSave } = build(() => { save.disabled = false; });
      save.onclick = async () => { save.disabled = true; try { await onSave(); close(); } catch (e) { toast(e.message, true); save.disabled = false; } };
      return [h('div', { class: 'itd-h' }, h('h2', {}, title), h('button', { type: 'button', class: 'itd-x', 'aria-label': 'Close', onclick: close }, ic('x', 28))),
        h('div', { class: 'itd-b' }, ...body), h('div', { class: 'itd-f' }, h('button', { type: 'button', class: 'it-btn grey', onclick: close }, 'Cancel'), save)];
    }, 'drawer it-drawer');
  }
  /* Rearrange a list: drag a row by mouse or finger, or tab to a row, press Space to pick it up, move it with the arrow keys and Space to drop it. */
  // entries: [key, name] pairs. Rows are told apart by key, so two groups with the same name can still be moved.
  function layoutDrawer(title, what, entries, onSave) {
    const nameOf = new Map(entries);
    itDrawer(title, (dirty) => {
      let order = entries.map(([k]) => k), picked = null, asc = true;
      const list = h('div', { class: 'itd-list', role: 'list' });
      const draw = (focus) => { list.replaceChildren(...order.map(row)); if (focus != null) [...list.children].find((x) => x.dataset.n === focus)?.focus(); };
      const move = (n, by) => { const i = order.indexOf(n), j = i + by; if (j < 0 || j >= order.length) return; order.splice(i, 1); order.splice(j, 0, n); dirty(); draw(n); };
      function row(n) {
        const label = nameOf.get(n);
        const el = h('div', { class: `itd-row${picked === n ? ' picked' : ''}`, tabindex: 0, role: 'listitem', 'data-n': n, 'aria-label': picked === n ? `${label}, picked up` : label },
          h('span', { class: 'grow' }, label), h('span', { class: 'itd-hd', html: II.handle, 'aria-hidden': 'true' }));
        el.onkeydown = (e) => {
          if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); picked = picked === n ? null : n; draw(n); }
          else if (picked === n && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) { e.preventDefault(); move(n, -1); }
          else if (picked === n && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) { e.preventDefault(); move(n, 1); }
          else if (e.key === 'Escape' && picked === n) { e.stopPropagation(); picked = null; draw(n); }
        };
        el.onpointerdown = (e) => {
          if (e.button !== 0) return;
          // With a finger, only the handle drags, so the rest of the row scrolls the list.
          if (e.pointerType !== 'mouse' && !e.target.closest('.itd-hd')) return;
          const box = el.closest('.itd-b');
          const startY = e.clientY; let dragging = false;
          // Listened for on the window: moving the row in the list would end a pointer capture on the row itself.
          const onMove = (ev) => {
            if (ev.pointerId !== e.pointerId) return;
            if (!dragging && Math.abs(ev.clientY - startY) < 6) return;
            if (!dragging) { dragging = true; el.classList.add('dragging'); }
            ev.preventDefault();
            if (box) { const b = box.getBoundingClientRect(); if (ev.clientY < b.top + 48) box.scrollTop -= 12; else if (ev.clientY > b.bottom - 48) box.scrollTop += 12; }
            const others = [...list.children].filter((x) => x !== el);
            const after = others.find((x) => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; }) || null;
            if (el.nextElementSibling !== after) list.insertBefore(el, after);
          };
          const onUp = (ev) => {
            if (ev.pointerId !== e.pointerId) return;
            window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
            if (!dragging) return;
            el.classList.remove('dragging');
            const next = [...list.children].map((x) => x.dataset.n);
            if (next.join('\n') !== order.join('\n')) { order = next; dirty(); }
          };
          window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
        };
        return el;
      }
      draw();
      const az = h('button', { type: 'button', class: 'it-btn grey itd-az' }, 'A-Z', h('span', { class: 'it-bic', html: II.up }));
      az.onclick = () => { order.sort((a, b) => nameOf.get(a).localeCompare(nameOf.get(b), undefined, { sensitivity: 'base' }) * (asc ? 1 : -1)); az.lastChild.innerHTML = asc ? II.up : II.down; asc = !asc; dirty(); draw(); };
      const key = (t) => h('kbd', {}, t);
      return {
        body: [h('div', { class: 'itd-top' }, h('p', { class: 'itd-lead' }, `Arrange how ${what} appear online.`), h('p', { class: 'itd-k' }, 'Keyboard instructions'),
          h('div', { class: 'itd-keys' }, h('span', {}, 'Pick up, Drop', key('Space')), h('span', {}, 'Move positions', h('kbd', { html: II.left, 'aria-label': 'Left' }), h('kbd', { html: II.upk, 'aria-label': 'Up' }), h('kbd', { html: II.right, 'aria-label': 'Right' }))),
          h('div', { class: 'itd-azrow' }, az)), h('h3', { class: 'itd-h3' }, 'Drag to rearrange'), list],
        onSave: () => onSave(order),
      };
    });
  }
  // Pick items from the whole item list (Assign items).
  function pickItems(title, chosen, done) {
    const sel = new Set(chosen); let q = '';
    sheet((close) => {
      const list = h('div', { class: 'pick-list' });
      const draw = () => list.replaceChildren(...menu.filter((it) => !q || `${it.name} ${it.category}`.toLowerCase().includes(q)).map((it) => h('label', { class: 'pick-row' },
        h('input', { type: 'checkbox', checked: sel.has(it.id), onchange: (e) => { e.target.checked ? sel.add(it.id) : sel.delete(it.id); } }), itSwatch(it.image), h('span', { class: 'grow' }, h('b', {}, it.name), h('small', {}, it.category)), h('span', {}, money(it.price)))));
      draw();
      return [h('div', { class: 'swb-h' }, h('h2', {}, title), h('button', { type: 'button', class: 'ss-x', 'aria-label': 'Close', onclick: close }, ic('x', 20))),
        h('label', { class: 'tsearch' }, ic('search', 18), h('input', { type: 'search', placeholder: 'Search items', 'aria-label': 'Search items', oninput: (e) => { q = e.target.value.trim().toLowerCase(); draw(); } })), list,
        h('div', { class: 'swb-f' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), h('button', { type: 'button', class: 'btn cl-blue', onclick: () => { close(); done(sel); } }, 'Done'))];
    }, 'swb it-pick');
  }
  const newItem = async () => {
    try {
      const before = new Set(menu.map((x) => x.id));
      const cats = [...new Set(menu.map((x) => x.category))];
      menu = (await api('POST', `/api/sites/${id}/menu`, { name: 'New item', price: 0, category: cats.at(-1) || 'Menu' })).items;
      paintPanel(); paint(true);
      const made = menu.find((x) => !before.has(x.id)); if (made) openItem(made.id);
    } catch (e) { toast(e.message, true); }
  };
  const itemsBulk = async (ids, body, note) => { try { menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids, ...body })).items; toast(note); paintPanel(); paint(true); } catch (e) { toast(e.message, true); } };

  /* ---------- Item list ---------- */
  CL.items = () => {
    const f = clState.itf ||= { show: 'all', cat: '' };
    const q = itQ('items'), cats = [...new Set(menu.map((x) => x.category))];
    const groupsOf = (it) => ordering.modGroups.filter((g) => (it.mods || []).includes(g.id)).map((g) => g.name);
    const stateOf = (it) => (it.available === false ? 'hidden' : it.stock === 0 ? 'out' : it.stock != null && it.stock <= 5 ? 'low' : 'ok');
    const list = menu.filter((it) => (!q || `${it.name} ${it.category}`.toLowerCase().includes(q)) && (!f.cat || it.category === f.cat) && (f.show === 'all' || (f.show === 'sale' ? it.sale > 0 : stateOf(it) === f.show)));
    const hid = clState.itcols ||= new Set();
    const ALL = [['price', 'Price'], ['cost', 'Cost'], ['cats', 'Categories'], ['mods', 'Modifier groups'], ['pos', 'Show on POS'], ['stock', 'In stock']];
    const W = { name: '27.5%', price: '10.5%', cost: '9%', cats: '12.5%', mods: '15%', pos: '9.7%', stock: '10%' };
    const cols = [{ k: 'name', l: 'Item name', sort: (r) => r.label.toLowerCase(), cls: 'it-wide', w: W.name }, ...ALL.filter(([k]) => !hid.has(k)).map(([k, l]) => ({ k, l, w: W[k], cls: k === 'pos' || k === 'stock' ? 'it-c' : '', tip: k === 'pos' ? 'Point of sale devices are not available yet.' : null }))];
    // In stock: off marks the item sold out; on puts back its daily refill amount, or the usual starting amount.
    const setStock = (it, on) => itemsBulk([it.id], { set: { stock: on ? (it.restock ?? DEFAULT_STOCK) : 0 } }, on ? `${it.name} is in stock` : `${it.name} is sold out`);
    const rows = list.map((it) => ({ id: it.id, label: it.name, it, cells: {
      name: h('div', { class: 'it-name' }, itSwatch(it.image), itLink(it.name, () => openItem(it.id))),
      price: money(it.price), cost: it.cost == null ? '' : money(it.cost), cats: it.category,
      mods: h('span', { class: 'it-clip' }, groupsOf(it).join(', ')),
      pos: itSw(false, null, { soon: true, label: `${it.name} on point of sale` }),
      stock: itSw(it.stock !== 0, (e) => setStock(it, e.target.checked), { label: `${it.name} in stock` }),
    } }));
    const colsBtn2 = h('button', { type: 'button', class: 'it-btn grey' }, h('span', { class: 'it-bic', html: II.columns }), 'Columns');
    colsBtn2.onclick = () => popover(colsBtn2, () => h('div', { class: 'cl-menu it-cols' }, h('p', { class: 'tb-k' }, 'Columns'), ALL.map(([k, l]) => h('label', { class: 'rp-opt' }, h('input', { type: 'checkbox', checked: !hid.has(k), onchange: (e) => { e.target.checked ? hid.delete(k) : hid.add(k); paintPanel(); } }), h('span', {}, l)))), 'right');
    const filt = filtersButton([{ title: 'Show', value: f.show, set: (k) => { f.show = k; }, options: [['all', 'All items'], ['low', 'Low stock'], ['out', 'Sold out'], ['hidden', 'Hidden'], ['sale', 'On sale']] }, { title: 'Category', value: f.cat, set: (k) => { f.cat = k; }, options: [['', 'All categories'], ...cats.map((c) => [c, c])] }]);
    filt.classList.add('it-btn', 'grey'); filt.firstChild.replaceWith(h('span', { class: 'it-bic', html: II.sliders }));
    const ids = () => itSel('items'), what = () => { const n = ids().length; return n === 1 ? '1 item' : `${n} items`; };
    const pair = (label, onL, onFn, offL, offFn) => h('div', { class: 'bgroup' }, h('span', {}, label), h('div', { class: 'seg' }, h('button', { type: 'button', onclick: onFn }, onL), h('button', { type: 'button', onclick: offFn }, offL)));
    const b = (label, fn, danger) => h('button', { type: 'button', class: `btn soft sm${danger ? ' danger' : ''}`, onclick: fn }, label);
    const bulk = itemsBulk.bind(null);
    return [h('div', { class: 'cl it' }, itHead('Items', itMore([['Upload item list (Excel or CSV)', importCsv], state.config.scanEnabled && ['Scan a paper menu', scanMenu], ['Download item list', () => csvDownload('items', [['Category', 'Item name', 'Price', 'Cost', 'Description', 'Stock', 'Taxable'], ...menu.map((x) => [x.category, x.name, (x.price / 100).toFixed(2), x.cost == null ? '' : (x.cost / 100).toFixed(2), x.desc || '', x.stock ?? '', x.taxable === false ? 'no' : 'yes'])])]])),
      h('div', { class: 'it-bar' }, itSearch('Search items', 'items'), colsBtn2, filt, itBtn('Add item', { icon: II.plus, kind: 'fill', onclick: newItem })),
      itBulk('items', 'item', [
        pair('Sales tax', 'On', () => bulk(ids(), { set: { taxable: true } }, `Sales tax on for ${what()}`), 'Off', () => bulk(ids(), { set: { taxable: false } }, `Sales tax off for ${what()}`)),
        pair('On the menu', 'Show', () => bulk(ids(), { set: { available: true } }, `${what()} shown`), 'Hide', () => bulk(ids(), { set: { available: false } }, `${what()} hidden`)),
        b('Quantity', async () => { const v = await ask({ title: `Set quantity for ${what()}`, label: 'In stock', type: 'number', value: '' }); if (v !== null && v !== '') bulk(ids(), { set: { stock: v } }, `Quantity set for ${what()}`); }),
        b('Daily refill', async () => { const v = await ask({ title: `Refill ${what()} every morning`, label: 'Refill to', type: 'number', value: '', hint: 'Leave it empty to switch daily refill off.' }); if (v !== null) bulk(ids(), { set: { restock: v === '' ? null : v } }, `Daily refill updated for ${what()}`); }),
        b('Sale', async () => { const v = await ask({ title: `Put ${what()} on sale`, label: 'Percent off', type: 'number', value: '10', hint: 'Enter 0 to end a sale.' }); if (v !== null && v !== '') bulk(ids(), { set: { sale: v } }, `Sale updated for ${what()}`); }),
        b('Price', async () => { const v = await ask({ title: `Change the price of ${what()}`, label: 'Percent change', type: 'number', value: '5', hint: 'Use a minus sign to lower prices, for example -10.' }); if (v !== null && v !== '' && Number(v)) bulk(ids(), { set: { pricePercent: v } }, `Prices updated for ${what()}`); }),
        b('Category', async () => { const v = await ask({ title: `Move ${what()}`, label: 'Category', value: cats[0] || '' }); if (v) bulk(ids(), { set: { category: v } }, `${what()} moved to ${v}`); }),
        b('Delete', async () => { if (await confirmSheet({ title: `Delete ${what()}?`, text: 'They are removed from your menu straight away. Past orders are kept.', action: 'Delete', danger: true })) { await bulk(ids(), { delete: true }, `${what()} deleted`); itClear('items'); paintPanel(); } }, true),
      ]),
      itTable({ key: 'items', cols, rows, select: true, sortBy: 'name', per: true, perLabel: 'Items per page', empty: h('div', { class: 'it-none' }, menu.length ? 'No items found' : 'You do not have any items') }))];
  };

  /* ---------- Categories ---------- */
  const catNames = () => {
    const itemCats = [...new Set(menu.map((x) => x.category))], saved = ordering.cats.map((x) => x.name);
    return itemCats.every((c) => saved.includes(c)) ? [...new Set([...saved, ...itemCats])] : [...new Set([...itemCats, ...saved])];
  };
  async function saveCatOrder(order) {
    menu = (await api('PUT', `/api/sites/${id}/menu-order`, { ids: order.flatMap((n) => menu.filter((x) => x.category === n).map((x) => x.id)) })).items;
    const known2 = new Map(ordering.cats.map((x) => [x.name, x]));
    ordering.cats = order.map((n) => known2.get(n) || { name: n, hidden: false, from: '', to: '' });
    await putOrdering(); toast('Category layout saved'); paintPanel(); paint(true);
  }
  CL.menu = () => {
    const cats = catNames(), q = itQ('cats');
    const metaOf = (c) => ordering.cats.find((x) => x.name === c);
    const rows = cats.filter((c) => !q || c.toLowerCase().includes(q)).map((c) => { const n = menu.filter((x) => x.category === c).length; return { id: c, label: c, n, cells: {
      name: h('div', { class: 'it-name' }, itSwatch(''), itLink(c, () => editCategory(c, cats))), sub: '— —', type: 'Category', cid: (metaOf(c) && metaOf(c).id) || steadyId(c.toLowerCase()), items: String(n),
    } }; });
    const sel = () => itSel('cats'), what = () => { const n = sel().length; return n === 1 ? sel()[0] : `${n} categories`; };
    const ids = () => menu.filter((x) => sel().includes(x.category)).map((x) => x.id);
    const bulk = async (body, msg) => { const list = ids(); if (!list.length) return toast('Those categories have no items yet.', true); await itemsBulk(list, body, msg); };
    const pair = (label, onL, onFn, offL, offFn) => h('div', { class: 'bgroup' }, h('span', {}, label), h('div', { class: 'seg' }, h('button', { type: 'button', onclick: onFn }, onL), h('button', { type: 'button', onclick: offFn }, offL)));
    const b = (label, fn) => h('button', { type: 'button', class: 'btn soft sm', onclick: fn }, label);
    return [h('div', { class: 'cl it' }, itHead('Categories', itBtn('Change layout', { icon: II.layout, kind: 'outline', onclick: () => layoutDrawer('Category layout', 'categories', catNames().map((c) => [c, c]), saveCatOrder) }),
      itMore([['Download categories', () => csvDownload('categories', [['Category name', 'Category ID', 'Items'], ...cats.map((c) => [c, (metaOf(c) && metaOf(c).id) || steadyId(c.toLowerCase()), menu.filter((x) => x.category === c).length])])]])),
      h('div', { class: 'it-bar' }, itSearch('Search categories', 'cats'), itBtn('Add category', { icon: II.plus, kind: 'fill', onclick: () => addCategory(cats) })),
      itBulk('cats', ['category', 'categories'], [
        pair('Sales tax', 'On', () => bulk({ set: { taxable: true } }, `Sales tax on for ${what()}`), 'Off', () => bulk({ set: { taxable: false } }, `Sales tax off for ${what()}`)),
        pair('On the menu', 'Show', () => bulk({ set: { available: true } }, `${what()} shown`), 'Hide', () => bulk({ set: { available: false } }, `${what()} hidden`)),
        b('Change prices', async () => { const v = await ask({ title: `Change prices in ${what()}`, label: 'Percent change', type: 'number', value: '5', hint: 'Use a minus sign to lower prices, for example -10.' }); if (v !== null && v !== '' && Number(v)) bulk({ set: { pricePercent: v } }, `Prices updated in ${what()}`); }),
        b('Put on sale', async () => { const v = await ask({ title: `Put ${what()} on sale`, label: 'Percent off', type: 'number', value: '10', hint: 'Enter 0 to end a sale.' }); if (v !== null && v !== '') bulk({ set: { sale: v } }, `Sale updated in ${what()}`); })]),
      itTable({ key: 'cats', cols: [{ k: 'name', l: 'Category name', sort: (r) => r.id.toLowerCase(), cls: 'it-wide', w: '19%' }, { k: 'sub', l: 'Subcategory', w: '19%' }, { k: 'type', l: 'Type', w: '18%' }, { k: 'cid', l: 'Category ID', w: '21%' }, { k: 'items', l: 'Items' }],
        rows, select: true, sortBy: 'name', empty: h('div', { class: 'it-none' }, cats.length ? 'No categories found' : 'You do not have any categories') }))];
  };

  /* ---------- Modifier groups ---------- */
  const usedBy = (g) => menu.filter((x) => (x.mods || []).includes(g.id));
  async function saveModOrder(ids) {
    const byId = new Map(ordering.modGroups.map((g) => [g.id, g]));
    // Any group added meanwhile keeps its place at the end.
    ordering.modGroups = [...ids.map((x) => byId.get(x)).filter(Boolean), ...ordering.modGroups.filter((g) => !ids.includes(g.id))];
    await putOrdering(); toast('Modifier group layout saved'); paintPanel(); paint(true);
  }
  const openGroup = (g) => { clState.modEdit = g.id; clState.modDraft = null; goTab('mod-edit'); };
  CL.mods = () => {
    const tab = clState.modTab ||= 'groups';
    const groups = ordering.modGroups;
    const head = itHead('Modifier groups', itBtn('Change layout', { icon: II.layout, kind: 'outline', onclick: () => layoutDrawer('Modifier group layout', 'modifier groups', groups.map((g) => [g.id, g.name]), saveModOrder) }),
      itMore([['Download modifier groups', () => csvDownload('modifier-groups', [['Modifier group name', 'Modifier ID', 'Modifier', 'Price'], ...groups.flatMap((g) => (g.choices.length ? g.choices : [{ name: '', price: 0 }]).map((c) => [g.name, g.id.toUpperCase(), c.name, c.name ? (c.price / 100).toFixed(2) : '']))])]]));
    const add = itBtn('Add modifier group', { icon: II.plus, kind: 'fill', onclick: () => { clState.modDraft = null; goTab('mod-new'); } });
    const seg = itSeg([['groups', 'Modifier groups'], ['mods', 'Modifiers']], tab, (k) => { clState.modTab = k; });
    let body;
    if (tab === 'groups') {
      const q = itQ('mg');
      const rows = groups.filter((g) => !q || g.name.toLowerCase().includes(q)).map((g) => ({ id: g.id, label: g.name, g, cells: { name: itLink(g.name, () => openGroup(g)), mid: g.id.toUpperCase(), n: String(g.choices.length), items: String(usedBy(g).length) } }));
      const del = async () => {
        const list = groups.filter((g) => itSel('mg').includes(g.id));
        if (!await confirmSheet({ title: list.length === 1 ? `Delete ${list[0].name}?` : `Delete ${list.length} modifier groups?`, text: 'They are taken off every item that uses them.', action: 'Delete', danger: true })) return;
        try { for (const g of list) { const its = usedBy(g).map((x) => x.id); if (its.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids: its, set: { removeMod: g.id } })).items; }
          ordering.modGroups = groups.filter((g) => !list.includes(g)); await putOrdering(); itClear('mg'); toast('Deleted'); paintPanel(); paint(true); } catch (e) { toast(e.message, true); }
      };
      body = [h('div', { class: 'it-bar' }, itSearch('Search modifier groups', 'mg'), add), itBulk('mg', 'modifier group', [h('button', { type: 'button', class: 'btn soft sm danger', onclick: del }, 'Delete')]),
        itTable({ key: 'mg', cols: [{ k: 'name', l: 'Modifier group name', sort: (r) => r.label.toLowerCase(), cls: 'it-wide', w: '22.5%' }, { k: 'mid', l: 'Modifier ID', w: '23%' }, { k: 'n', l: 'Modifiers', w: '22%' }, { k: 'items', l: 'Items' }], rows, select: true, sortBy: 'name',
          expand: (r) => (r.g.choices.length ? h('div', { class: 'it-mods' }, r.g.choices.map((c) => h('div', { class: 'it-modrow' }, h('span', {}, c.name), h('span', {}, money(c.price))))) : h('p', { class: 'it-subnone' }, 'No modifiers yet.')),
          empty: h('div', { class: 'it-none' }, groups.length ? 'No modifier groups found' : 'You do not have any modifier groups') })];
    } else {
      const q = itQ('mm');
      const all = groups.flatMap((g) => g.choices.map((c, i) => ({ g, c, i })));
      const save = async (msg) => { try { await putOrdering(); if (msg) toast(msg); paint(true); } catch (e) { toast(e.message, true); } paintPanel(); };
      const rows = all.filter((x) => !q || `${x.c.name} ${x.g.name}`.toLowerCase().includes(q)).map((x) => ({ id: `${x.g.id}:${x.i}:${x.c.name}`, label: x.c.name, x, cells: {
        name: itLink(x.c.name, () => openGroup(x.g)), group: x.g.name, price: money(x.c.price),
        online: itSw(x.c.online !== false, (e) => { x.c.online = e.target.checked; save(); }, { label: `${x.c.name} shown online` }),
        stock: itSw(x.c.inStock !== false, (e) => { x.c.inStock = e.target.checked; save(); }, { label: `${x.c.name} in stock` }),
      } }));
      const chosen = () => rows.filter((r) => itSel('mm').includes(r.id)).map((r) => r.x.c);
      const setAll = (k, v, msg) => { for (const c of chosen()) c[k] = v; itClear('mm'); save(msg); };
      const pair = (label, onL, onFn, offL, offFn) => h('div', { class: 'bgroup' }, h('span', {}, label), h('div', { class: 'seg' }, h('button', { type: 'button', onclick: onFn }, onL), h('button', { type: 'button', onclick: offFn }, offL)));
      body = [h('div', { class: 'it-bar' }, itSearch('Search modifiers', 'mm'), add),
        itBulk('mm', 'modifier', [pair('Show online', 'On', () => setAll('online', true, 'Shown online'), 'Off', () => setAll('online', false, 'Hidden online')), pair('In stock', 'Yes', () => setAll('inStock', true, 'In stock'), 'No', () => setAll('inStock', false, 'Marked sold out'))]),
        itTable({ key: 'mm', cols: [{ k: 'name', l: 'Modifier name', sort: (r) => r.label.toLowerCase(), cls: 'it-wide', w: '19.5%' }, { k: 'group', l: 'Modifier group', w: '19.5%' }, { k: 'price', l: 'Price', w: '18%' }, { k: 'online', l: 'Show online', cls: 'it-c', w: '18.5%' }, { k: 'stock', l: 'In stock', cls: 'it-c' }], rows, select: true, sortBy: 'name',
          empty: h('div', { class: 'it-none' }, all.length ? 'No modifiers found' : 'You do not have any modifiers') })];
    }
    return [h('div', { class: 'cl it' }, head, seg, ...body)];
  };

  /* Add modifier group, and the same page for changing one. Changes are kept until Save. */
  function modGroupPage(g) {
    const forKey = g ? g.id : 'new';
    if (clState.modDraft && clState.modDraft.for !== forKey) clState.modDraft = null;
    const d = clState.modDraft ||= g ? { for: forKey, name: g.name, onlineName: g.onlineName || '', required: !!g.required, multi: !!g.multi, choices: g.choices.map((c) => ({ ...c })), items: new Set(usedBy(g).map((x) => x.id)) }
      : { for: forKey, name: '', onlineName: '', required: false, multi: false, choices: [], items: new Set() };
    const saveBtn = h('button', { type: 'button', class: 'it-btn fill', disabled: !d.name.trim() }, 'Save');
    const field = (label, input) => h('label', { class: 'it-field' }, h('span', {}, label), input);
    const assignBtn = h('button', { type: 'button', class: 'it-textbtn', disabled: !d.name.trim(), onclick: () => pickItems('Assign items', d.items, (sel) => { d.items = sel; paintPanel(); }) }, 'Assign items');
    const nameIn = h('input', { value: d.name, maxlength: 60, 'aria-required': 'true', oninput: (e) => { d.name = e.target.value; saveBtn.disabled = !d.name.trim(); assignBtn.disabled = !d.name.trim(); } });
    const onlineIn = h('input', { value: d.onlineName, maxlength: 60, oninput: (e) => { d.onlineName = e.target.value; } });
    const leave = () => { clState.modDraft = null; goTab('mods'); };
    const assigned = menu.filter((x) => d.items.has(x.id));
    const choiceRow = (c, i) => h('div', { class: 'it-choice' },
      h('input', { value: c.name, maxlength: 80, 'aria-label': 'Modifier name', placeholder: 'Modifier name', oninput: (e) => { c.name = e.target.value; } }),
      h('input', { value: c.price ? (c.price / 100).toFixed(2) : '', inputmode: 'decimal', 'aria-label': 'Price', placeholder: '0.00', oninput: (e) => { const p = parsePrice(e.target.value || '0'); if (p !== null) c.price = p; } }),
      h('button', { type: 'button', class: 'it-x', 'aria-label': `Remove ${c.name || 'modifier'}`, onclick: () => { d.choices.splice(i, 1); paintPanel(); } }, ic('x', 18)));
    saveBtn.onclick = async () => {
      const name = d.name.trim(); if (!name) return;
      const choices = d.choices.map((c) => ({ ...c, name: c.name.trim() })).filter((c) => c.name);
      if (!g && ordering.modGroups.length >= 100) return toast('You can have up to 100 modifier groups.', true);
      saveBtn.disabled = true;
      const was = g && { name: g.name, onlineName: g.onlineName, required: g.required, multi: g.multi, choices: g.choices };
      try {
        // A retry after a failed save reuses the same new group rather than adding a second one.
        let gid = g ? g.id : (d.newId ||= uid('g'));
        if (g) Object.assign(g, { name, onlineName: d.onlineName.trim(), required: d.required, multi: d.multi, choices });
        else if (!ordering.modGroups.some((x) => x.id === gid)) ordering.modGroups.push({ id: gid, name, onlineName: d.onlineName.trim(), required: false, multi: false, choices: [] });
        // A failed save puts the group back as it was (in place, so this page keeps working with it).
        try { await putOrdering(); } catch (e) { if (g) Object.assign(g, was); else ordering.modGroups = ordering.modGroups.filter((x) => x.id !== gid); throw e; }
        const was = new Set(g ? usedBy(g).map((x) => x.id) : []);
        const add = [...d.items].filter((x) => !was.has(x)), drop = [...was].filter((x) => !d.items.has(x));
        if (add.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids: add, set: { addMod: gid } })).items;
        if (drop.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids: drop, set: { removeMod: gid } })).items;
        paint(true);
        if (g) { toast('Saved'); leave(); } else { toast('Modifier group added'); clState.modEdit = gid; clState.modDraft = null; goTab('mod-edit'); }
      } catch (e) { toast(e.message, true); saveBtn.disabled = false; }
    };
    const del = g && (async () => {
      if (!await confirmSheet({ title: `Delete ${g.name}?`, text: 'It is taken off every item that uses it.', action: 'Delete', danger: true })) return;
      try { const its = usedBy(g).map((x) => x.id); if (its.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids: its, set: { removeMod: g.id } })).items;
        ordering.modGroups = ordering.modGroups.filter((x) => x !== g); await putOrdering(); toast('Deleted'); paint(true); leave(); } catch (e) { toast(e.message, true); }
    });
    return [h('div', { class: 'cl it it-form' }, h('div', { class: 'it-stick' }, itBack('Modifier groups', 'mods')),
      h('div', { class: 'it-formhead' }, h('h1', {}, g ? g.name : 'Add modifier group'), del && itMore([['Delete modifier group', del, true]])),
      h('p', { class: 'it-req' }, '*Required'),
      field('Modifier group name*', nameIn), field('Online modifier group name', onlineIn),
      g && h('section', { class: 'it-sec' }, h('h2', {}, 'Modifiers'), h('div', { class: 'it-choices' }, d.choices.map(choiceRow)),
        h('button', { type: 'button', class: 'it-textbtn on', onclick: () => { d.choices.push({ name: '', price: 0, online: true, inStock: true }); paintPanel(); requestAnimationFrame(() => [...panel.querySelectorAll('.it-choice input[aria-label="Modifier name"]')].at(-1)?.focus()); } }, '+ Add modifier'),
        h('div', { class: 'it-opt' }, h('span', {}, 'Customers must choose one'), itSw(d.required, (e) => { d.required = e.target.checked; }, { label: 'Customers must choose one' })),
        h('div', { class: 'it-opt' }, h('span', {}, 'Customers can choose more than one'), itSw(d.multi, (e) => { d.multi = e.target.checked; }, { label: 'Customers can choose more than one' }))),
      h('section', { class: 'it-sec' }, h('h2', {}, 'Select items to assign to this modifier group'),
        assigned.length > 0 && h('div', { class: 'it-assigned' }, assigned.map((it) => h('div', { class: 'it-arow' }, itSwatch(it.image), h('span', { class: 'grow' }, it.name), h('button', { type: 'button', class: 'it-x', 'aria-label': `Remove ${it.name}`, onclick: () => { d.items.delete(it.id); paintPanel(); } }, ic('x', 16))))),
        h('div', { class: 'it-assignrow' }, assignBtn)),
      h('div', { class: 'it-foot' }, h('button', { type: 'button', class: 'it-btn grey', onclick: leave }, 'Cancel'), saveBtn))];
  }
  CL['mod-new'] = () => modGroupPage(null);
  CL['mod-edit'] = () => { const g = ordering.modGroups.find((x) => x.id === clState.modEdit); if (!g) { setTimeout(() => goTab('mods', false, true)); return [h('div', { class: 'cl it' })]; } return modGroupPage(g); };

  /* ---------- Menus ---------- */
  // A round grey button with a menu of actions. Each action may carry an icon, be shown in red, or be greyed out when it cannot be used.
  function itKebab(items, label = 'More actions') {
    const b = h('button', { type: 'button', class: 'it-more', 'aria-label': label, title: label, 'aria-haspopup': 'menu' }, h('span', { class: 'rep-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
    b.onclick = () => {
      popover(b, (close) => h('div', { class: 'it-menu', role: 'menu' }, items.filter(Boolean).map(([l, icon, fn, kind]) => h('button', { type: 'button', role: 'menuitem', class: kind || '', disabled: !fn, onclick: () => { close(); fn(); } }, icon && h('span', { class: 'it-mi', html: icon }), h('span', {}, l)))), 'right');
      requestAnimationFrame(() => {
        if (!popEl || popEl._for !== b) return;
        const r = b.getBoundingClientRect(), m = popEl.getBoundingClientRect();
        const top = r.top - m.height - 8 > 72 ? r.top - m.height - 8 : r.bottom + 8;
        Object.assign(popEl.style, { top: `${Math.round(top)}px`, right: 'auto', left: `${Math.round(Math.max(12, Math.min(window.innerWidth - 12 - m.width, r.left + r.width / 2 - m.width / 2)))}px` });
        popEl.querySelector('button:not(:disabled)')?.focus();
      });
    };
    return b;
  }
  // Information banners like the photos. A banner for something that is not available yet is greyed out; any banner can be closed.
  const banKey = (k) => `pf-ban-${k}-${id}`;
  const banOff = (k) => { try { return localStorage.getItem(banKey(k)) === '1'; } catch { return !!(clState.bans || {})[k]; } };
  const banHide = (k) => { try { localStorage.setItem(banKey(k), '1'); } catch { (clState.bans ||= {})[k] = true; } paintPanel(); };
  const itBan = (k, title, text, soon) => !banOff(k) && h('div', { class: `it-ban${soon ? ' soon' : ''}`, role: 'note' }, h('span', { class: 'it-bi', html: II.info }), h('div', { class: 'it-bantx' }, h('b', {}, title), h('p', {}, ...text)),
    h('button', { type: 'button', class: 'it-banx', 'aria-label': 'Dismiss', onclick: () => banHide(k) }, ic('x', 20)));
  // A link inside a sentence; it wraps with the words around it. One for something not available yet is greyed out and does nothing.
  const itInl = (text, onclick, disabled) => h('a', { class: 'it-inl', href: disabled ? null : '#', 'aria-disabled': disabled ? 'true' : null, onclick: (e) => { e.preventDefault(); if (!disabled) onclick(); } }, text);
  const t12 = (hm) => { const [hh, mm] = String(hm).split(':').map(Number); return `${hh % 12 || 12}:${String(mm || 0).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
  const whenText = (days, from, to) => `${days.every(Boolean) ? 'Every day' : DAYS.filter((_, i) => days[i]).map((d) => d.slice(0, 3)).join(', ') || 'No days'}${from && to ? `, ${t12(from)} - ${t12(to)}` : ''}`;
  // A menu without dayparts keeps the days and times it was given before dayparts existed; all day, every day shows nothing.
  const oldSchedule = (m) => (m.days.every(Boolean) && !(m.from && m.to) ? '' : whenText(m.days, m.from, m.to));
  const partsOf = (m) => m.dayparts.map((pid) => ordering.dayparts.find((p) => p.id === pid)).filter(Boolean);
  const availText = (m) => { const ps = partsOf(m); return ps.length ? ps.map((p) => p.name).join(', ') : oldSchedule(m); };
  const PF_CHANNEL = 'Processor Freedom Online Ordering';
  const OTHER_CHANNELS = ['UberEats', 'DoorDash', 'Order with Google', 'BentoBox', 'Grubhub'];
  const saveMenus = async (msg) => { try { await putOrdering(); if (msg) toast(msg); paint(true); } catch (e) { toast(e.message, true); } paintPanel(); };
  const openMenu = (m) => { clState.menuView = m.id; clState.menuTab = 'details'; goTab('menu-view'); };
  const setPub = async (m, on) => { const was = m.active; m.active = on; try { await putOrdering(); toast(on ? `${m.name} published` : `${m.name} unpublished`); paint(true); } catch (e) { m.active = was; toast(e.message, true); } paintPanel(); };
  async function dupMenu(m) {
    if (ordering.menus.length >= 30) return toast('You can have up to 30 menus.', true);
    const copy = { ...m, id: uid('m'), name: `${m.name} (copy)`.slice(0, 60), cats: [...m.cats], days: [...m.days], dayparts: [...m.dayparts], active: false };
    ordering.menus = [...ordering.menus, copy];
    try { await putOrdering(); toast('Menu duplicated'); paint(true); openMenu(copy); } catch (e) { ordering.menus = ordering.menus.filter((x) => x !== copy); toast(e.message, true); paintPanel(); }
  }
  async function delMenu(m) {
    if (!await confirmSheet({ title: `Delete ${m.name}?`, text: 'It is removed straight away.', action: 'Delete', danger: true })) return;
    ordering.menus = ordering.menus.filter((x) => x.id !== m.id);
    await saveMenus('Menu deleted');
    if (tab === 'menu-view') goTab('menus');
  }
  const menuActions = (m, dup = true) => [
    dup && ['Duplicate', II.copy, () => dupMenu(m)],
    ['Edit menu price', II.pencil, null, 'soon'],
    m.active ? ['Unpublish', II.unpub, () => setPub(m, false), 'danger'] : ['Publish', II.pub, () => setPub(m, true)],
    ['Delete', II.bin, m.active ? null : () => delMenu(m)],
    ['Reset menu price', II.reset, null, 'soon'],
  ];
  // A small window with one name box: Add menu, Edit on Menu details, and the names of labels, classes and discounts.
  function nameSheet({ title, label, value = '', action = 'Save', save }) {
    sheet((close) => {
      const input = h('input', { value, maxlength: 60, autofocus: true });
      const btn = h('button', { type: 'button', class: 'btn cl-blue' }, action);
      const go3 = async () => { if (btn.disabled) return; const v = input.value.trim(); if (!v) { input.focus(); return toast(`Enter a ${label.toLowerCase()}.`, true); } btn.disabled = true; try { await save(v); close(); } catch (e) { toast(e.message, true); btn.disabled = false; } };
      btn.onclick = go3; input.onkeydown = (e) => { if (e.key === 'Enter') go3(); };
      return [h('div', { class: 'swb-h' }, h('h2', {}, title), h('button', { type: 'button', class: 'ss-x', 'aria-label': 'Close', onclick: close }, ic('x', 20))),
        h('div', { class: 'cl-promoform' }, h('label', { class: 'field cl-field' }, h('span', {}, label), input)),
        h('div', { class: 'swb-f' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), btn)];
    }, 'swb');
  }
  const addMenu = () => (ordering.menus.length >= 30 ? toast('You can have up to 30 menus.', true) : nameSheet({ title: 'Add menu', label: 'Menu name', action: 'Add menu', save: async (name) => {
    const m = { id: uid('m'), name, cats: [], from: '', to: '', days: DAYS.map(() => true), dayparts: [], active: false };
    ordering.menus = [...ordering.menus, m];
    try { await putOrdering(); } catch (e) { ordering.menus = ordering.menus.filter((x) => x !== m); throw e; }
    toast('Menu added'); openMenu(m);
  } }));
  CL.menus = () => {
    const q = itQ('menus');
    const rows = ordering.menus.filter((m) => !q || m.name.toLowerCase().includes(q)).map((m) => ({ id: m.id, label: m.name, m, cells: {
      name: itLink(m.name, () => openMenu(m)), ch: h('span', { class: 'it-clip' }, m.active ? PF_CHANNEL : ''), avail: h('span', { class: 'it-clip' }, availText(m)),
      status: h('span', { class: `it-status${m.active ? ' on' : ''}` }, m.active ? 'Published' : 'Unpublished'), act: itKebab(menuActions(m), `Actions for ${m.name}`),
    } }));
    return [h('div', { class: 'cl it it-menus' },
      itBan('pos-menus', 'Already selling items on your point of sale (POS) devices?', [itInl('Enable menus for POS now', null, true), ' and we will create your first POS menu from your item list.'], true),
      itBan('dayparts', 'Assign dayparts to your online menus to control when your menu is displayed', [itInl('Create dayparts in Business Hours', () => goTab('hours')), ' to schedule when your menus will be displayed online.']),
      h('div', { class: 'it-titles' }, h('h1', { class: 'it-h1' }, 'Menus'), h('p', { class: 'it-lead' }, 'These menus are used for online ordering. To connect your online menu with an online ordering provider, it must be published and enabled for that provider. Once you have a published menu, go to ', itInl('Online Ordering', () => goTab('online')), ' to set it up.')),
      h('div', { class: 'it-bar' }, itSearch('Search menus', 'menus'), itBtn('Add menu', { icon: II.plus, kind: 'fill', onclick: addMenu })),
      itTable({ key: 'menus', cols: [{ k: 'name', l: 'Menu name', sort: (r) => r.label.toLowerCase(), next: true, cls: 'it-mname', w: '38%' }, { k: 'ch', l: 'Channels', sort: (r) => (r.m.active ? PF_CHANNEL : ''), next: true, cls: 'it-mch', w: '21%' }, { k: 'avail', l: 'Menu availability', cls: 'it-mav', w: '15%' }, { k: 'status', l: 'Status', sort: (r) => (r.m.active ? 0 : 1), next: true, w: '12%' }, { k: 'act', l: 'Action', cls: 'it-act' }],
        rows, plain: true, empty: h('div', { class: 'it-none' }, ordering.menus.length ? 'No menus found' : 'You do not have any menus') }))];
  };
  // Choose the categories a menu shows.
  function pickCats(m) {
    const chosen = new Set(m.cats), all = catNames();
    sheet((close) => [h('div', { class: 'swb-h' }, h('h2', {}, 'Categories and items'), h('button', { type: 'button', class: 'ss-x', 'aria-label': 'Close', onclick: close }, ic('x', 20))),
      h('div', { class: 'pick-list' }, all.length ? all.map((c) => { const n = menu.filter((x) => x.category === c).length; return h('label', { class: 'pick-row' }, h('input', { type: 'checkbox', checked: chosen.has(c), onchange: (e) => { e.target.checked ? chosen.add(c) : chosen.delete(c); } }), h('span', { class: 'grow' }, h('b', {}, c), h('small', {}, `${n} item${n === 1 ? '' : 's'}`))); }) : h('p', { class: 'it-subnone' }, 'You do not have any categories')),
      h('div', { class: 'swb-f' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), h('button', { type: 'button', class: 'btn cl-blue', onclick: async (e) => { e.currentTarget.disabled = true; m.cats = all.filter((c) => chosen.has(c)); close(); await saveMenus('Saved'); } }, 'Save'))], 'swb it-pick');
  }
  const itUTabs = (opts, val, set) => h('div', { class: 'it-utabs', role: 'tablist' }, opts.map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === val), onclick: () => { set(k); paintPanel(); } }, l)));
  CL['menu-view'] = () => {
    const m = ordering.menus.find((x) => x.id === clState.menuView);
    if (!m) { setTimeout(() => goTab('menus', false, true)); return [h('div', { class: 'cl it' })]; }
    const t = clState.menuTab ||= 'details';
    const card = (title, right, ...kids) => h('section', { class: 'it-card' }, h('div', { class: 'it-ch' }, h('h2', {}, title), right), ...kids);
    let body;
    if (t === 'details') {
      const parts = ordering.dayparts, old = !partsOf(m).length && oldSchedule(m);
      const togglePart = (p, on) => { m.dayparts = on ? [...m.dayparts, p.id] : m.dayparts.filter((x) => x !== p.id); saveMenus(); };
      body = [
        card('Menu details', itBtn('Edit', { icon: II.pencil, onclick: () => nameSheet({ title: 'Edit menu details', label: 'Name', value: m.name, save: async (name) => { const was = m.name; m.name = name; try { await putOrdering(); } catch (e) { m.name = was; throw e; } toast('Saved'); paint(true); paintPanel(); } }) }),
          h('dl', { class: 'it-dl' }, h('div', {}, h('dt', {}, 'Name'), h('dd', {}, m.name)), h('div', {}, h('dt', {}, 'Menu channels'), h('dd', {}, 'Online')))),
        card('Online ordering channels', null, h('p', { class: 'it-sub' }, 'Enable your online ordering channels.'),
          h('div', { class: 'it-chan tscroll' }, h('table', {}, h('thead', {}, h('tr', {}, OTHER_CHANNELS.map((c) => h('th', { class: 'soon' }, c)), h('th', {}, PF_CHANNEL))),
            h('tbody', {}, h('tr', {}, OTHER_CHANNELS.map((c) => h('td', {}, itSw(false, null, { soon: true, label: c }))), h('td', {}, itSw(m.active, (e) => setPub(m, e.target.checked), { label: PF_CHANNEL }))))))),
        card('Menu availability', null, h('p', { class: 'it-sub' }, 'Assign dayparts to your online menus to control when your menu is displayed.'),
          parts.length ? h('div', { class: 'it-parts' }, parts.map((p) => h('label', { class: 'it-part' }, h('input', { type: 'checkbox', checked: m.dayparts.includes(p.id), onchange: (e) => togglePart(p, e.target.checked) }), h('span', {}, h('b', {}, p.name), h('small', {}, whenText(p.days, p.from, p.to))))))
            : h('div', { class: 'it-empty' }, h('b', {}, 'You do not have any dayparts'), h('p', {}, 'Go to ', itInl('Business hours', () => goTab('hours')), ' to add dayparts.')),
          old && h('p', { class: 'it-old' }, h('b', {}, 'Shown: '), old)),
      ];
    } else {
      const cats = m.cats.filter((c) => catNames().includes(c));
      body = [card('Categories and items', cats.length > 0 && itBtn('Edit', { icon: II.pencil, onclick: () => pickCats(m) }),
        cats.length ? h('div', { class: 'it-mcats' }, cats.map((c) => { const its = menu.filter((x) => x.category === c); return h('div', { class: 'it-mcat' }, h('div', { class: 'it-mcath' }, h('b', {}, c), h('span', {}, `${its.length} item${its.length === 1 ? '' : 's'}`)),
          its.length > 0 && h('div', { class: 'it-mitems' }, its.map((it) => h('div', { class: 'it-mitem' }, itSwatch(it.image), itLink(it.name, () => openItem(it.id)), h('span', {}, money(it.price)))))); }))
          : h('div', { class: 'it-empty' }, h('b', {}, 'You do not have any categories in this menu'), h('div', {}, itBtn('Add categories', { icon: II.plus, kind: 'fill', onclick: () => pickCats(m) }))))];
    }
    return [h('div', { class: 'cl it it-detail' }, itBack('Menus', 'menus'),
      h('div', { class: 'it-dhead' }, h('h1', { class: 'it-h1' }, m.name), h('div', { class: 'it-tools' }, itBtn('Duplicate', { icon: II.copy, onclick: () => dupMenu(m) }), itKebab(menuActions(m, false), `Actions for ${m.name}`))),
      itUTabs([['details', 'Menu details'], ['items', 'Categories and items']], t, (k) => { clState.menuTab = k; }), ...body)];
  };

  /* ---------- Printer labels ---------- */
  const labelCount = (n) => menu.filter((x) => x.label === n).length;
  const openLabel = (n) => { clState.labelEdit = n; clState.labelDraft = null; clState.labelOpen = true; goTab('label-view'); };
  CL.labels = () => {
    const q = itQ('labels');
    const rows = ordering.labels.filter((n) => !q || n.toLowerCase().includes(q)).map((n) => ({ id: n, label: n, cells: { name: itLink(n, () => openLabel(n)), items: String(labelCount(n)) } }));
    const del = async () => {
      const list = itSel('labels'); if (!list.length) return;
      if (!await confirmSheet({ title: list.length === 1 ? `Delete ${list[0]}?` : `Delete ${list.length} labels?`, text: 'They are taken off every item that uses them.', action: 'Delete', danger: true })) return;
      try {
        const ids = menu.filter((x) => list.includes(x.label)).map((x) => x.id);
        if (ids.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids, set: { label: '' } })).items;
        ordering.labels = ordering.labels.filter((n) => !list.includes(n)); await putOrdering(); itClear('labels'); toast('Deleted');
      } catch (e) { toast(e.message, true); }
      paintPanel();
    };
    return [h('div', { class: 'cl it' }, itHead('Printer labels', itMore([['Download printer labels', () => csvDownload('printer-labels', [['Label name', 'Items'], ...ordering.labels.map((n) => [n, labelCount(n)])])]])),
      h('div', { class: 'it-bar' }, itSearch('Search labels', 'labels'), itBtn('Add label', { icon: II.plus, kind: 'fill', onclick: () => openLabel(null) })),
      itBulk('labels', 'label', [h('button', { type: 'button', class: 'btn soft sm danger', onclick: del }, 'Delete')]),
      itTable({ key: 'labels', cols: [{ k: 'name', l: 'Label name', sort: (r) => r.label.toLowerCase(), cls: 'it-wide', w: '47%' }, { k: 'items', l: 'Items' }], rows, select: true, sortBy: 'name', per: true, perLabel: 'Labels per page',
        empty: h('div', { class: 'it-none' }, ordering.labels.length ? 'No labels found' : 'You do not have any printer labels') }))];
  };
  CL['label-view'] = () => {
    const old = clState.labelEdit;
    // Opened from the list only: after a reload there is no label in hand, so the list comes back.
    if (!clState.labelOpen || (old && !ordering.labels.includes(old))) { setTimeout(() => goTab('labels', false, true)); return [h('div', { class: 'cl it' })]; }
    const d = clState.labelDraft ||= { name: old || '', items: new Set(menu.filter((x) => old && x.label === old).map((x) => x.id)), open: true };
    const was = new Set(menu.filter((x) => old && x.label === old).map((x) => x.id));
    const dirty = () => d.name.trim() !== (old || '') || d.items.size !== was.size || [...d.items].some((x) => !was.has(x));
    const saveBtn = h('button', { type: 'button', class: 'it-btn fill', disabled: !dirty() || !d.name.trim() }, 'Save');
    const sync = () => { saveBtn.disabled = !dirty() || !d.name.trim(); };
    const nameIn = h('input', { value: d.name, maxlength: 40, 'aria-label': 'Label name', oninput: (e) => { d.name = e.target.value; sync(); } });
    const leave = () => { clState.labelDraft = null; goTab('labels'); };
    saveBtn.onclick = async () => {
      const name = d.name.trim(); if (!name) return;
      if (name !== old && ordering.labels.includes(name)) return toast('That name is already in use.', true);
      if (!old && ordering.labels.length >= 40) return toast('You can have up to 40 printer labels.', true);
      saveBtn.disabled = true;
      const before = ordering.labels;
      try {
        ordering.labels = old ? ordering.labels.map((n) => (n === old ? name : n)) : [...ordering.labels, name];
        try { await putOrdering(); } catch (e) { ordering.labels = before; throw e; }
        const setTo = menu.filter((x) => d.items.has(x.id) && x.label !== name).map((x) => x.id);
        const clear = menu.filter((x) => !d.items.has(x.id) && (x.label === name || (old && x.label === old))).map((x) => x.id);
        if (setTo.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids: setTo, set: { label: name } })).items;
        if (clear.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids: clear, set: { label: '' } })).items;
        toast(old ? 'Saved' : 'Label added'); leave();
      } catch (e) { toast(e.message, true); saveBtn.disabled = false; }
    };
    const f = clState.lvf ||= { show: 'all', cat: '' };
    const q = itQ('lv'), hid = clState.lvcols ||= new Set();
    const stateOf = (it) => (it.available === false ? 'hidden' : it.stock === 0 ? 'out' : 'ok');
    const assigned = menu.filter((x) => d.items.has(x.id));
    const list = assigned.filter((it) => (!q || it.name.toLowerCase().includes(q)) && (!f.cat || it.category === f.cat) && (f.show === 'all' || stateOf(it) === f.show));
    const ALL = [['price', 'Price'], ['cost', 'Cost'], ['pos', 'Show on POS'], ['stock', 'In stock']];
    const W = { name: '27%', price: '15.5%', cost: '15%', pos: '15%' };
    const cols = [{ k: 'name', l: 'Item name', sort: (r) => r.label.toLowerCase(), cls: 'it-wide', w: W.name }, ...ALL.filter(([k]) => !hid.has(k)).map(([k, l]) => ({ k, l, w: W[k], cls: k === 'pos' || k === 'stock' ? 'it-c' : '', tip: k === 'pos' ? 'Point of sale devices are not available yet.' : null }))];
    const rows = list.map((it) => ({ id: it.id, label: it.name, cells: { name: h('div', { class: 'it-name' }, itSwatch(it.image), itLink(it.name, () => openItem(it.id))), price: money(it.price), cost: it.cost == null ? '' : money(it.cost),
      pos: itSw(false, null, { soon: true, label: `${it.name} on point of sale` }), stock: itSw(it.stock !== 0, (e) => itemsBulk([it.id], { set: { stock: e.target.checked ? (it.restock ?? DEFAULT_STOCK) : 0 } }, e.target.checked ? `${it.name} is in stock` : `${it.name} is sold out`), { label: `${it.name} in stock` }) } }));
    const colsB = h('button', { type: 'button', class: 'it-btn grey' }, h('span', { class: 'it-bic', html: II.columns }), 'Columns');
    colsB.onclick = () => popover(colsB, () => h('div', { class: 'cl-menu it-cols' }, h('p', { class: 'tb-k' }, 'Columns'), ALL.map(([k, l]) => h('label', { class: 'rp-opt' }, h('input', { type: 'checkbox', checked: !hid.has(k), onchange: (e) => { e.target.checked ? hid.delete(k) : hid.add(k); paintPanel(); } }), h('span', {}, l)))), 'right');
    const filt = filtersButton([{ title: 'Show', value: f.show, set: (k) => { f.show = k; }, options: [['all', 'All items'], ['out', 'Sold out'], ['hidden', 'Hidden']] }, { title: 'Category', value: f.cat, set: (k) => { f.cat = k; }, options: [['', 'All categories'], ...[...new Set(assigned.map((x) => x.category))].map((c) => [c, c])] }]);
    filt.classList.add('it-btn', 'grey'); filt.firstChild.replaceWith(h('span', { class: 'it-bic', html: II.sliders }));
    const remove = () => { for (const x of itSel('lv')) d.items.delete(x); itClear('lv'); paintPanel(); };
    const fold = h('button', { type: 'button', class: 'it-fold', 'aria-expanded': String(d.open), 'aria-label': d.open ? 'Hide items' : 'Show items', html: d.open ? II.chevU : II.chevD, onclick: () => { d.open = !d.open; paintPanel(); } });
    return [h('div', { class: 'cl it it-form it-lv' }, h('div', { class: 'it-stick' }, itBack('Printer labels', 'labels')),
      h('section', { class: 'it-card' }, h('h2', {}, old ? 'Printer label details' : 'Add label'), h('label', { class: 'it-field' }, h('span', {}, 'Label name'), nameIn)),
      h('section', { class: 'it-card it-items' }, h('div', { class: 'it-ch it-chline' }, h('div', {}, h('h2', { class: 'it-h3' }, 'Items'), h('p', { class: 'it-sub' }, 'Manage items assigned to this printer label.')), fold),
        d.open && [h('div', { class: 'it-bar' }, itSearch('Search items', 'lv'), colsB, filt, itBtn('Assign items', { icon: II.plus, kind: 'fill', onclick: () => pickItems('Assign items', d.items, (sel) => { d.items = sel; paintPanel(); }) })),
          itBulk('lv', 'item', [h('button', { type: 'button', class: 'btn soft sm', onclick: remove }, 'Remove from label')]),
          itTable({ key: 'lv', cols, rows, select: true, sortBy: 'name', empty: h('div', { class: 'it-none' }, assigned.length ? 'No items found' : 'No items assigned') })]),
      h('div', { class: 'it-foot' }, h('button', { type: 'button', class: 'it-btn grey', onclick: leave }, 'Cancel'), saveBtn))];
  };

  /* ---------- Revenue classes ---------- */
  function editRev(old) {
    const on = new Set(menu.filter((x) => old && x.revclass === old).map((x) => x.id)), before = new Set(on);
    sheet((close) => {
      const input = h('input', { value: old || '', maxlength: 40, autofocus: true });
      const btn = h('button', { type: 'button', class: 'btn cl-blue' }, old ? 'Save' : 'Add revenue class');
      const assignedText = h('small', { class: 'it-count' });
      const count = () => { assignedText.textContent = `${on.size} item${on.size === 1 ? '' : 's'}`; };
      count();
      btn.onclick = async () => {
        const name = input.value.trim();
        if (!name) { input.focus(); return toast('Enter a revenue class name.', true); }
        if (name !== old && ordering.revClasses.includes(name)) return toast('That name is already in use.', true);
        if (!old && ordering.revClasses.length >= 40) return toast('You can have up to 40 revenue classes.', true);
        btn.disabled = true;
        const before = ordering.revClasses;
        try {
          ordering.revClasses = old ? ordering.revClasses.map((n) => (n === old ? name : n)) : [...ordering.revClasses, name];
          try { await putOrdering(); } catch (e) { ordering.revClasses = before; throw e; }
          const setTo = menu.filter((x) => on.has(x.id) && x.revclass !== name).map((x) => x.id);
          const clear = [...before].filter((x) => !on.has(x));
          if (setTo.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids: setTo, set: { revclass: name } })).items;
          if (clear.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids: clear, set: { revclass: '' } })).items;
          close(); toast(old ? 'Saved' : 'Revenue class added'); paintPanel();
        } catch (e) { toast(e.message, true); btn.disabled = false; }
      };
      const del = old && h('button', { type: 'button', class: 'btn text danger it-del', onclick: async () => {
        if (!await confirmSheet({ title: `Delete ${old}?`, text: 'It is taken off every item that uses it.', action: 'Delete', danger: true })) return;
        try { const ids = menu.filter((x) => x.revclass === old).map((x) => x.id); if (ids.length) menu = (await api('POST', `/api/sites/${id}/menu/bulk`, { ids, set: { revclass: '' } })).items;
          ordering.revClasses = ordering.revClasses.filter((n) => n !== old); await putOrdering(); close(); toast('Deleted'); paintPanel(); } catch (e) { toast(e.message, true); }
      } }, 'Delete');
      return [h('div', { class: 'swb-h' }, h('h2', {}, old ? old : 'Add revenue class'), h('button', { type: 'button', class: 'ss-x', 'aria-label': 'Close', onclick: close }, ic('x', 20))),
        h('div', { class: 'cl-promoform' }, h('label', { class: 'field cl-field' }, h('span', {}, 'Revenue class name'), input),
          h('div', { class: 'field cl-field' }, h('span', {}, 'Items'), h('div', { class: 'it-assignrow left' }, assignedText, h('button', { type: 'button', class: 'it-textbtn', onclick: () => pickItems('Assign items', on, (sel) => { on.clear(); sel.forEach((x) => on.add(x)); count(); }) }, 'Assign items')))),
        h('div', { class: 'swb-f' }, del, h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), btn)];
    }, 'swb');
  }
  CL.revs = () => {
    const q = itQ('revs'), list = ordering.revClasses;
    const rows = list.filter((n) => !q || n.toLowerCase().includes(q)).map((n) => ({ id: n, label: n, cells: { name: itLink(n, () => editRev(n)) } }));
    const empty = list.length ? h('div', { class: 'it-none' }, 'No revenue classes found')
      : h('div', { class: 'it-emptybig' }, h('b', {}, 'You do not have any revenue classes'), h('p', {}, 'Revenue classes allow you track and compare revenue streams and sales of items taxed at variable rates. Add revenue classes above. ', itInl('Learn more.', () => goTab('r-items'))));
    return [h('div', { class: 'cl it' }, itHead('Revenue classes'),
      h('div', { class: 'it-bar' }, itSearch('Search revenue class', 'revs'), itBtn('Add revenue class', { icon: II.plus, kind: 'fill', onclick: () => editRev(null) })),
      itTable({ key: 'revs', cols: [{ k: 'name', l: 'Revenue class name', cls: 'it-wide' }], rows, empty }))];
  };

  /* ---------- Discounts ---------- */
  const discValue = (x) => (x.type === 'amount' ? `${money(x.value)} off` : `${x.value}%`);
  function editDisc(x) {
    let type = x ? x.type : 'percent';
    sheet((close) => {
      const nameIn = h('input', { value: x ? x.name : '', maxlength: 60, autofocus: true });
      const valIn = h('input', { value: x ? (x.type === 'amount' ? (x.value / 100).toFixed(2) : String(x.value)) : '', inputmode: 'decimal' });
      const unit = h('span', { class: 'it-unit' }, type === 'amount' ? '$' : '%');
      const seg = h('div', { class: 'seg' }, [['percent', 'Percent'], ['amount', 'Amount']].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(type === k), onclick: (e) => { type = k; unit.textContent = k === 'amount' ? '$' : '%'; [...seg.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, l)));
      const btn = h('button', { type: 'button', class: 'btn cl-blue' }, x ? 'Save' : 'Add discount');
      btn.onclick = async () => {
        const name = nameIn.value.trim();
        if (!name) { nameIn.focus(); return toast('Enter a discount name.', true); }
        const value = type === 'amount' ? parsePrice(valIn.value || '0') : Math.round(Number(valIn.value));
        if (value === null || !Number.isFinite(value) || !(value > 0)) { valIn.focus(); return toast('Enter a discount value above zero.', true); }
        if (type === 'percent' && value > 100) { valIn.focus(); return toast('A percent discount can be at most 100.', true); }
        if (!x && ordering.discounts.length >= 60) return toast('You can have up to 60 discounts.', true);
        const row = { id: x ? x.id : uid('d'), name, type, value };
        const before = ordering.discounts;
        ordering.discounts = x ? before.map((y) => (y.id === x.id ? row : y)) : [...before, row];
        btn.disabled = true;
        try { await putOrdering(); close(); toast(x ? 'Saved' : 'Discount added'); paintPanel(); } catch (e) { ordering.discounts = before; toast(e.message, true); btn.disabled = false; }
      };
      const del = x && h('button', { type: 'button', class: 'btn text danger it-del', onclick: async () => {
        if (!await confirmSheet({ title: `Delete ${x.name}?`, text: 'It is removed straight away.', action: 'Delete', danger: true })) return;
        const before = ordering.discounts; ordering.discounts = before.filter((y) => y.id !== x.id);
        try { await putOrdering(); close(); toast('Deleted'); paintPanel(); } catch (e) { ordering.discounts = before; toast(e.message, true); }
      } }, 'Delete');
      return [h('div', { class: 'swb-h' }, h('h2', {}, x ? x.name : 'Add discount'), h('button', { type: 'button', class: 'ss-x', 'aria-label': 'Close', onclick: close }, ic('x', 20))),
        h('div', { class: 'cl-promoform' }, h('label', { class: 'field cl-field' }, h('span', {}, 'Discount name'), nameIn),
          h('div', { class: 'field cl-field' }, h('span', {}, 'Discount value'), h('div', { class: 'it-valrow' }, seg, h('label', { class: 'it-val' }, unit, valIn)))),
        h('div', { class: 'swb-f' }, del, h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), btn)];
    }, 'swb');
  }
  CL.discs = () => {
    const rows = ordering.discounts.map((x) => ({ id: x.id, label: x.name, cells: { name: itLink(x.name, () => editDisc(x)), value: discValue(x) } }));
    return [h('div', { class: 'cl it it-discs' },
      h('div', { class: 'it-dhead' }, h('h1', { class: 'it-h1' }, 'Discounts'), h('div', { class: 'it-tools' }, itBtn('View report', { onclick: () => goTab('r-disc') }))),
      h('p', { class: 'it-lead' }, 'If you do not have any custom discounts, you will see the following default discounts on your invoices: 10%, 25%, 50%, $1.00 off, $5.00 off, $10.00 off.'),
      h('div', { class: 'it-addrow' }, h('button', { type: 'button', class: 'it-textbtn on', onclick: () => editDisc(null) }, h('span', { class: 'it-bic', html: II.plus }), 'Add discount')),
      itTable({ key: 'discs', cols: [{ k: 'name', l: 'Discount name', cls: 'it-dname', w: '30%' }, { k: 'value', l: 'Discount value' }], rows, empty: h('div', { class: 'it-none' }, 'No discounts found') }))];
  };

  function paintPanel() {
    const y = panel.scrollTop;
    const cur = tabs.find(([k]) => k === tab) || tabs[0];
    const fresh = orders ? orders.filter((x) => x.status === 'new').length : 0;
    const mode = cur[3];
    lastTab[mode] = cur[0];
    noteVisit(cur[0]);
    if (body.dataset.mode !== mode) { body.dataset.mode = mode; if (mode === 'office') body.dataset.view = 'edit'; paintTop(); requestAnimationFrame(fit); }
    panel.classList.toggle('narrow', mode === 'office' && !WIDE.has(cur[0]) && !CL[cur[0]]);
    const has = (k) => tabs.some(([t]) => t === k);
    const groups = NAV[mode].map((g) => ({ ...g, tabs: g.tabs.filter(has), subs: (g.subs || []).filter((_, i) => has(g.tabs[i])) })).filter((g) => g.tabs.length);
    const tools = { ...TOOLS, tabs: TOOLS.tabs.filter(has), subs: TOOLS.subs.filter((_, i) => has(TOOLS.tabs[i])) };
    const here = navOf(cur[0]);
    const group = groups.find((g) => g.tabs.includes(here)) || (mode === 'office' && tools.tabs.includes(cur[0]) ? tools : null) || (SETUP.tabs.includes(cur[0]) ? { ...SETUP, tabs: SETUP.tabs.filter(has), subs: SETUP.subs.filter((_, i) => has(SETUP.tabs[i])) } : { label: cur[1], icon: cur[2], tabs: [cur[0]], subs: [cur[1]] });   // Settings and Profile are reached from the top right, not the sidebar
    const pick = (g) => goTab(g.tabs.includes(lastIn[g.label]) ? lastIn[g.label] : g.tabs[0]);
    // A section with several pages only opens or closes when pressed; choosing a page underneath is what takes you there.
    if (navFor !== here) { navFor = here; openNav.add(group.label); }
    rail.replaceChildren(...[mode === 'site' && h('button', { class: 'nav-row nav-back', onclick: () => goTab(lastTab.office) }, navTile('back', 30), h('b', {}, 'Back office')), mode === 'office' ? h('button', { class: 'rail-new', 'aria-current': cur[0] === 'sale' ? 'page' : null, onclick: () => goTab('sale') }, ic('plus', 16), 'New sale') : h('button', { class: 'rail-new', onclick: async () => { const w = window.open('', '_blank'); await flush(); if (w) w.location = `/preview/${id}/`; } }, ic('eye', 16), 'Preview site'), ...groups.flatMap(navGroup).filter(Boolean),
      h('span', { class: 'grow' }),
      mode === 'office' && h('div', { class: 'rail-tools' }, has('booking') && h('button', { class: 'nav-row', 'aria-current': cur[0] === 'booking' ? 'page' : null, onclick: () => goTab('booking') }, navTile('calendar', 30), h('b', {}, 'Booking tools')), tools.tabs.length > 0 && navGroup(tools)),
      mode === 'site' && railPub,
      h('small', { class: 'rail-foot' }, h('b', {}, meta.name), h('br'), `© ${new Date().getFullYear()} Processor Freedom`)].flat().filter(Boolean));
    function navGroup(g) {
      const many = g.tabs.length > 1, open = many ? openNav.has(g.label) : g === group;
      const kids = many && h('div', { class: 'nav-kids', 'data-shut': open ? null : '1' }, h('div', { class: 'nav-kids-in' }, g.tabs.map((k, i) => h('button', { 'aria-current': k === here ? 'page' : null, onclick: () => goTab(k) }, g.subs[i]))));
      const toggle = (btn) => { const now = !openNav.has(g.label); if (now) openNav.add(g.label); else openNav.delete(g.label); btn.setAttribute('aria-expanded', String(now)); if (now) btn.dataset.open = '1'; else delete btn.dataset.open; if (now) delete kids.dataset.shut; else kids.dataset.shut = '1'; placeGlow(true); if (now) setTimeout(() => kids.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 280); };
      return [
        h('button', { class: 'nav-row', 'aria-current': open && !many ? 'page' : null, 'aria-expanded': many ? String(open) : null, 'data-open': open ? '1' : null, 'data-here': many && g === group ? '1' : null, onclick: (e) => (many ? toggle(e.currentTarget) : pick(g)) }, navTile(g.icon, 30), h('b', {}, g.label), g.tabs.includes('orders') && fresh > 0 && h('em', { class: 'badge' }, fresh), many && h('span', { class: 'nav-chev' }, navIcon('chev', 14))),
        kids,
      ];
    }
    placeGlow(true);
    lastIn[group.label] = here;
    // Phones have no sidebar, so a section's screens are switched with two clear buttons at the top.
    subnav.replaceChildren(...(group.tabs.length > 1 ? group.tabs.map((k, i) => h('button', { type: 'button', 'aria-pressed': String(k === here), onclick: () => goTab(k) }, group.subs[i])) : []));
    subnav.hidden = group.tabs.length < 2;
    // The fade at the right edge only shows while there is more to swipe to; the chosen page is scrolled into view.
    requestAnimationFrame(() => { const on = subnav.querySelector('[aria-pressed="true"]'); if (on && subnav.scrollWidth > subnav.clientWidth) subnav.scrollLeft = Math.max(0, on.offsetLeft - 16); subnav.classList.toggle('at-end', subnav.scrollLeft + subnav.clientWidth >= subnav.scrollWidth - 2); });
    if (!subnav.onscroll) subnav.onscroll = () => subnav.classList.toggle('at-end', subnav.scrollLeft + subnav.clientWidth >= subnav.scrollWidth - 2);
    tabsEl.replaceChildren(h('b', {}, cur[1]));
    body.dataset.wide = String(mode === 'office');
    panel.replaceChildren(...[!CL[cur[0]] && cur[0] !== 'sale' && crumbs(), !CL[cur[0]] && cur[0] !== 'sale' && HEAD[cur[0]] && h('div', { class: 'inv-top page-head' }, h('div', {}, h('h2', {}, HEAD[cur[0]][0]))), CL[cur[0]] ? CL[cur[0]]() : cur[0] === 'start' ? startPanel() : cur[0] === 'est' ? PANELS.invoices('estimate') : cur[0] === 'bizinfo' ? PANELS.business() : cur[0] === 'calendar' ? PANELS.appts(true) : SALES_TABS[cur[0]] ? PANELS.sales(SALES_TABS[cur[0]]) : cur[0] === 'rewards' ? PANELS.rewardsDash() : SETUP_VIEWS[cur[0]] ? PANELS.ordering(cur[0]) : PANELS[cur[0]]()].flat(Infinity).filter(Boolean));
    panel.dataset.tab = cur[0];
    for (const [sel, here] of [['.tb-right button[aria-label="Profile"]', cur[0] === 'profile'], ['.tb-gear', cur[0] === 'settings' || SETUP.tabs.includes(cur[0])]]) { const btn = top.querySelector(sel); if (btn) { if (here) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current'); } }
    if (cur[0] === 'appt-new' || cur[0] === 'cust-new' || cur[0] === 'sale') requestAnimationFrame(() => panel.style.setProperty('--cl-left', `${Math.round(panel.getBoundingClientRect().left)}px`));
    if (REPORT_TABS.has(cur[0]) && !CL[cur[0]]) addReportTools(cur[0]);
    labelTables(panel);
    panel.scrollTop = y;
    const title2 = top.querySelector('.m-title b');
    if (title2 && title2.textContent !== group.label && body.dataset.view !== 'preview') paintTop(); else paintTabbar();
  }
  /* ---------- phone navigation ---------- */
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main screens' });
  const lastQuick = {};
  function paintTabbar() {
    const mode = modeOf(tab);
    const fresh = orders ? orders.filter((x) => x.status === 'new').length : 0;
    const previewing = mode === 'site' && body.dataset.view === 'preview';
    const has = (k) => tabs.some(([t]) => t === k);
    const groups = NAV[mode].map((g) => ({ ...g, tabs: g.tabs.filter(has) })).filter((g) => g.tabs.length);
    const primary = groups.slice(0, PHONE_COUNT[mode]);
    const item = (icon, label, on, fn, badge) => h('button', { type: 'button', 'aria-current': on ? 'page' : null, onclick: fn }, h('span', { class: 'tb-ic' }, navIcon(icon, 24), badge > 0 && h('em', { class: 'badge' }, badge)), h('span', {}, label));
    // On a phone the back office has four fixed places and More; every label is one short word.
    const QUICK = [['home', 'Home', ['start']], ['orders', 'Orders', ['orders']], ['menu', 'Items', ['items', 'menu', 'mods', 'menus', 'labels', 'revs', 'discs']], ['sales', 'Reports', ['sales']]].filter(([, , ks]) => has(ks[0]));
    tabbar.replaceChildren(...[
      ...(mode === 'office' ? QUICK.map(([icon, label, ks]) => item(icon, label, ks.includes(navOf(tab)), () => { body.dataset.view = 'edit'; goTab(ks.includes(lastQuick[label]) ? lastQuick[label] : ks[0]); paintTop(); }, ks[0] === 'orders' ? fresh : 0))
        : primary.map((g) => item(g.icon, g.short || g.label.split(' ')[0], g.tabs.includes(tab) && !previewing, () => { body.dataset.view = 'edit'; goTab(g.tabs.includes(lastIn[g.label]) ? lastIn[g.label] : g.tabs[0]); paintTop(); }, 0))),
      mode === 'site' && item('preview', 'Preview', previewing, () => { body.dataset.view = previewing ? 'edit' : 'preview'; paintTop(); requestAnimationFrame(fit); }),
      item('more', 'More', !previewing && (mode === 'office' ? !QUICK.some(([, , ks]) => ks.includes(navOf(tab))) : !primary.some((g) => g.tabs.includes(tab))), moreSheet, mode === 'site' ? fresh : 0)].filter(Boolean));
    for (const [, label, ks] of QUICK) if (ks.includes(navOf(tab))) lastQuick[label] = navOf(tab);
  }
  function moreSheet() {
    if (modeOf(tab) === 'office') return mobileMenu();
    sheet((close) => {
      const fresh = orders ? orders.filter((x) => x.status === 'new').length : 0;
      const has = (k) => tabs.some(([t]) => t === k);
      const open = (k) => () => { body.dataset.view = 'edit'; goTab(k); paintTop(); };
      const row = (icon, label, fn, extra) => h('button', { type: 'button', class: 'more-row', onclick: () => { close(); fn(); } }, icon && navTile(NAV_NAMES.has(icon) ? icon : { out: 'address', phone: 'page' }[icon] || 'page', 29), h('b', {}, label), extra, navIcon('chev', 14));
      // One list of sections. A section with several pages opens with its arrow; a single page goes straight there.
      const mode = modeOf(tab), other = mode === 'office' ? 'site' : 'office';
      const fold = (g) => {
        const ks = g.tabs.filter(has);
        if (!ks.length) return null;
        const here = g.tabs.includes(navOf(tab)), badge = g.tabs.includes('orders') && fresh > 0 && h('em', { class: 'badge' }, fresh);
        if (ks.length === 1) return h('button', { type: 'button', class: 'more-row', 'aria-current': here ? 'page' : null, onclick: () => { close(); open(ks[0])(); } }, navTile(g.icon, 29), h('b', {}, g.label), badge, navIcon('chev', 14));
        const kids = h('div', { class: 'more-kids', 'data-shut': here ? null : '1' }, h('div', {}, ks.map((k) => h('button', { type: 'button', 'aria-current': k === navOf(tab) ? 'page' : null, onclick: () => { close(); open(k)(); } }, g.subs[g.tabs.indexOf(k)], k === 'orders' && fresh > 0 && h('em', { class: 'badge' }, fresh)))));
        const head = h('button', { type: 'button', class: 'more-row more-fold', 'aria-expanded': String(here), onclick: () => { const now = head.getAttribute('aria-expanded') !== 'true'; head.setAttribute('aria-expanded', String(now)); if (now) delete kids.dataset.shut; else kids.dataset.shut = '1'; } }, navTile(g.icon, 29), h('b', {}, g.label), badge, h('span', { class: 'fold-chev', 'aria-hidden': 'true' }));
        return [head, kids];
      };
      return [h('div', { class: 'more-grab', 'aria-hidden': 'true' }), h('div', { class: 'row more-head' }, h('button', { type: 'button', class: 'more-me', 'aria-label': 'Profile and sign-in', onclick: () => { close(); open('profile')(); } }, (state.user.name || state.user.email || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()), h('div', { class: 'grow' }, h('h2', {}, meta.name), h('small', {}, state.user.name || state.user.email)), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, ic('x', 20))),
        h('div', { class: 'more-group' }, h('div', { class: 'more-list' }, NAV[mode].map(fold))),
        h('div', { class: 'more-group' }, h('div', { class: 'more-list' },
          mode === 'office' && row('address', 'Website', open(lastTab.site)),
          mode === 'office' && has('booking') && row('calendar', 'Booking tools', open('booking')),
          mode === 'office' && row('settings', 'Settings', open('settings')),
          mode === 'office' && row('customers', 'Profile and sign-in', open('profile')),
          mode === 'site' && row('home', 'Back office', open(lastTab.office)),
          meta.live && row('out', 'View my live site', () => window.open(meta.url, '_blank', 'noopener')),
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

  /* ---------- Export, print and more, on every sales and report page ---------- */
  const REPORT_TABS = new Set(['orders', 'tx', 'cash', 'close', 'invoices', 'est', 'projects', 'plans', 'tips', 'sales', 'r-full', 'r-items', 'r-emp', 'r-tender', 'r-disc', 'r-removed', 'r-types', 'r-taxes']);
  const ABOUT = {
    orders: 'Every order taken online, newest first, with what was ordered, how it was collected and whether it has been paid.',
    tx: 'Every payment and refund recorded in the period: orders paid at the counter and invoices marked paid, with the tender used.',
    cash: 'Cash that came in and went out of the drawer, so you can check what should be there at the end of the day.',
    close: 'Closeouts total a day of sales and tenders so the books can be squared and the drawer counted.',
    invoices: 'Invoices you have sent, what is still owed and what has been paid.', est: 'Estimates you have sent and whether they were accepted.', projects: 'Larger jobs with their own invoices and estimates.', plans: 'Customers billed on a schedule, with the next date each one is due.',
    tips: 'Tips added to orders in the period, and who handled each order.',
    sales: 'The headline numbers for the period: net sales, orders, average order and how they compare with the period before.',
    'r-full': 'Gross sales, discounts, refunds, tax and tips for the period, and what you took in each tender.',
    'r-items': 'How many of each item sold and what it brought in.', 'r-emp': 'Sales grouped by the staff member who handled each order.', 'r-tender': 'What was taken in cash, card, gift card and other tenders.',
    'r-disc': 'Promo codes, rewards and gift cards used, and how much they took off.', 'r-removed': 'Items and orders that were cancelled or refunded.', 'r-types': 'Sales split by pickup, curbside and delivery.', 'r-taxes': 'Sales tax collected, and what it was charged on.',
  };
  // Everything on the page as rows: the figures at the top, then each table under its own heading.
  function pageRows(k) {
    const rows = [[nameOf(k)], [meta.name], [`Exported ${new Date().toLocaleString()}`], []];
    // Each figure as label, value, note: the value without its % change, which goes in its own column.
    const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3 || !n.classList?.contains('delta')).map((n) => n.textContent).join('').trim();
    const figs = [...panel.querySelectorAll('.dk, .kpi, .inv-kpis > *, .hm')].map((x) => { const label = x.querySelector(':scope > .small, :scope > .dk-l, :scope > .hm-l'); const val = x.querySelector('b'); const d = x.querySelector('.delta, .hm-d'); const note = [...x.querySelectorAll(':scope > span.small, :scope > .dk-s, :scope > .hm-s')].pop(); return [label && label.textContent.trim(), val && own(val), d ? d.textContent.trim() : '', note && note !== label ? note.textContent.trim() : '']; }).filter((x) => x[0] && x[1]);
    if (figs.length) { rows.push(['Summary', 'Amount', 'Change', 'Note']); for (const f of figs) rows.push(f); rows.push([]); }
    for (const t of panel.querySelectorAll('table')) {
      const title = t.closest('.scard, .group')?.querySelector('h3')?.textContent.trim();
      if (title) rows.push([title]);
      for (const tr of t.querySelectorAll('tr')) { const cells = [...tr.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()); if (cells.some(Boolean)) rows.push(cells); }
      rows.push([]);
    }
    if (rows.length < 6) for (const card of panel.querySelectorAll('.ocard, .inv-row, .rline')) rows.push([card.innerText.replace(/\s*\n\s*/g, ' · ').trim()]);
    return rows;
  }
  function exportReport(k) {
    sheet((close) => {
      const go2 = async (kind, btn) => { btn.disabled = true; try { await saveSheetFile(`${meta.slug}-${nameOf(k).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}`, pageRows(k), kind, nameOf(k)); close(); toast('Exported'); } catch (e) { btn.disabled = false; toast(e.message, true); } };
      return [h('h2', {}, `Export ${nameOf(k).toLowerCase()}`), null,
        h('div', { class: 'xport' }, h('button', { class: 'xport-opt', type: 'button', onclick: (e) => go2('xlsx', e.currentTarget) }, h('b', {}, 'Excel'), null), h('button', { class: 'xport-opt', type: 'button', onclick: (e) => go2('csv', e.currentTarget) }, h('b', {}, 'CSV'), null)),
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'))];
    });
  }
  // QuickBooks Online reads a three-column file (Date, Description, Amount) under Banking › Upload transactions.
  function quickbooks() {
    sheet((close) => {
      const run = async (btn) => { btn.disabled = true; try {
        const r = await api('GET', `/api/sites/${id}/transactions?${rq()}`);
        const us = (d) => { const [y, m, dd] = d.split('-'); return `${m}/${dd}/${y}`; };
        const rows = [['Date', 'Description', 'Amount'], ...r.payments.map((x) => [us(x.date), `${x.source} ${x.ref} · ${x.customer || 'Customer'} · ${x.method}`, ((x.amount) / 100).toFixed(2)]), ...r.refunds.map((x) => [us(x.date), `Refund ${x.ref} · ${x.customer || 'Customer'} · ${x.method}`, (-(x.amount) / 100).toFixed(2)])];
        if (rows.length < 2) { btn.disabled = false; return toast('No payments in this period to send to QuickBooks.', true); }
        await saveSheetFile(`${meta.slug}-quickbooks-${r.from}-to-${r.to}`, rows, 'csv'); close(); toast(`${rows.length - 1} transaction${rows.length === 2 ? '' : 's'} ready for QuickBooks`);
      } catch (e) { btn.disabled = false; toast(e.message, true); } };
      return [h('h2', {}, 'Sync with QuickBooks'), null,
        h('ol', { class: 'steps-list' }, h('li', {}, 'Choose the dates at the top of this page, then download below.'), h('li', {}, 'In QuickBooks Online, go to Transactions › Bank transactions › Link account › Upload from file.'), h('li', {}, 'Pick the downloaded file and the account to put it in. QuickBooks matches the Date, Description and Amount columns for you.')),
        null,
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn', onclick: (e) => run(e.currentTarget) }, 'Download for QuickBooks'))];
    });
  }
  function reportSettings() {
    sheet((close) => {
      const pick = (k, l) => h('button', { class: 'chip', 'aria-pressed': String(salesRange === k), onclick: () => { try { localStorage.setItem(`pf-range-${id}`, k); } catch { /* private mode */ } close(); setRange(k); toast(`Reports open on ${l.toLowerCase()}`); } }, l);
      return [h('h2', {}, 'Report settings'), null, h('div', { class: 'inv-chips', style: 'flex-wrap:wrap' }, [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['last30', 'Last 30 days']].map(([k, l]) => pick(k, l))),
        null, h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: () => { close(); goTab('hours'); } }, 'Time zone and hours'), h('button', { class: 'btn', onclick: close }, 'Done'))];
    });
  }
  // Reports always print on white, whatever the screen theme.
  function printLight() {
    const root = document.documentElement, was = root.dataset.theme;
    root.dataset.theme = 'light';
    const back = () => { if (was) root.dataset.theme = was; else delete root.dataset.theme; window.removeEventListener('afterprint', back); };
    window.addEventListener('afterprint', back);
    setTimeout(() => { window.print(); setTimeout(back, 1000); }, 60);
  }
  function addReportTools(k) {
    const bar = h('div', { class: 'rep-tools' },
      h('button', { class: 'btn soft', type: 'button', onclick: () => exportReport(k) }, ic('dl', 16), 'Export'),
      (() => { const more = h('button', { class: 'icon-btn rep-more', type: 'button', title: 'More', 'aria-label': 'More', 'aria-haspopup': 'menu', onclick: () => popover(more, (close) => [
        h('button', { class: 'tb-item', type: 'button', onclick: () => { close(); printLight(); } }, h('span', {}, 'Print')),
        h('button', { class: 'tb-item', type: 'button', onclick: () => { close(); exportReport(k); } }, h('span', {}, 'Export to Excel or CSV')),
        h('button', { class: 'tb-item', type: 'button', onclick: () => { close(); reportSettings(); } }, h('span', {}, 'Report settings')),
        h('button', { class: 'tb-item', type: 'button', onclick: () => { close(); quickbooks(); } }, h('span', {}, 'Sync with QuickBooks')),
        h('button', { class: 'tb-item', type: 'button', onclick: () => { close(); sheet((c2) => [h('h2', {}, nameOf(k)), h('p', {}, ABOUT[k] || 'What this page shows, for the period chosen at the top.'), null, h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: c2 }, 'Got it'))]); } }, h('span', {}, 'Learn about this report')),
      ]) }, h('span', { class: 'rep-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))); return more; })());
    const head = panel.querySelector('.inv-top, .page-head');
    if (!head) return panel.prepend(bar);
    const row = head.querySelector(':scope > .row');
    if (row) { for (const b of row.querySelectorAll(':scope > button')) if (/^(Export|Print)$/.test(b.textContent.trim())) b.remove(); row.append(...bar.childNodes); } else head.append(bar);
  }

  /* ---------- top right: notifications, settings, profile ---------- */
  const TI = {
    bell: '<path d="M6.500 10a5.500 5.500 0 0111 0c0 4 1.500 5.500 2 6.500H4.500c.500-1 2-2.500 2-6.500z"/><path d="M10 19.500a2.200 2.200 0 004 0"/>',
    gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    x: '<path d="M6.500 6.500l11 11M17.500 6.500l-11 11"/>',
    user: '<circle cx="12" cy="12" r="8.700"/><circle cx="12" cy="10" r="2.800"/><path d="M6.700 18.300a6 6 0 0110.600 0"/>',
  };
  const tIcon = (k, n = 21) => h('i', { class: 'tb-ic', 'aria-hidden': 'true', html: svg(TI[k], n) });
  const roleName = { owner: 'Owner', manager: 'Manager', kitchen: 'Kitchen' }[loaded.role] || 'Owner';
  const seenKey = `pf-seen-${id}`;
  let notes = null, popEl = null;
  const lastSeen = () => { try { return Number(localStorage.getItem(seenKey)) || 0; } catch { return 0; } };
  const unread = () => !!notes && notes.some((x) => x.at > lastSeen());
  const todoKey = `pf-todo-seen-${id}`;
  const newTodos = () => { let seen = []; try { seen = JSON.parse(localStorage.getItem(todoKey) || '[]'); } catch { /* private mode */ } return setupTodos().some((x) => !seen.includes(x.name)); };
  const markTodos = () => { try { localStorage.setItem(todoKey, JSON.stringify(setupTodos().map((x) => x.name))); } catch { /* private mode */ } };
  async function loadNotes() { try { notes = (await api('GET', `/api/sites/${id}/notifications`)).notifications; const dot = document.querySelector('.tb-dot'); if (dot) dot.hidden = !(unread() || newTodos()); } catch { /* shown as empty */ } }
  // A small panel that hangs from one of the top-right buttons and closes when you click away.
  function popover(anchor, build, side = 'right') {
    if (popEl) { const same = popEl._for === anchor; popEl._close(); if (same) return; }
    const el = h('div', { class: 'tb-pop', role: 'dialog' }); el._for = anchor;
    const close = () => { el.remove(); popEl = null; document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); anchor.setAttribute('aria-expanded', 'false'); };
    const away = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    el._close = close; el.append(...[build(close)].flat(Infinity).filter(Boolean));
    document.body.append(el); popEl = el; anchor.setAttribute('aria-expanded', 'true');
    const r = anchor.getBoundingClientRect(); el.style.top = `${Math.round(r.bottom + 8)}px`; if (side === 'left') { el.classList.add('left'); el.style.left = `${Math.max(12, Math.min(Math.round(r.left), window.innerWidth - 300))}px`; } else el.style.right = `${Math.max(12, Math.round(window.innerWidth - r.right))}px`;
    // Keep it inside the window: slide it left or flip it above the button if it would run off the edge.
    requestAnimationFrame(() => { const b = el.getBoundingClientRect(); if (b.right > window.innerWidth - 12) { el.style.right = ''; el.style.left = `${Math.max(12, window.innerWidth - 12 - b.width)}px`; } if (b.left < 12) el.style.left = '12px'; if (b.bottom > window.innerHeight - 12 && r.top - b.height - 8 > 12) el.style.top = `${Math.round(r.top - b.height - 8)}px`; });
    setTimeout(() => { document.addEventListener('mousedown', away); document.addEventListener('keydown', esc); });
  }
  const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`; };
  function openNotes(btn) {
    popover(btn, (close) => {
      const list = h('div', { class: 'tb-notes' }, skel(3));
      const todos = setupTodos();
      const todoBox = todos.length ? h('div', { class: 'tb-todo' }, h('small', { class: 'tb-sec' }, `To do · ${todos.length}`), todos.map((x) => h('button', { class: 'tb-note new', type: 'button', onclick: () => { close(); x.act[1](); } }, h('span', { class: 'todo-dot', 'aria-hidden': 'true' }), h('span', {}, h('b', {}, x.name)), h('em', {}, x.act[0])))) : null;
      const draw = () => list.replaceChildren(...(todoBox ? [todoBox, h('small', { class: 'tb-sec' }, 'Recent')] : []), ...(notes && notes.length ? notes.map((x) => h('button', { class: `tb-note${x.at > seenAt || (x.open && !x.at) ? ' new' : ''}`, type: 'button', onclick: () => { close(); goTab(x.tab); } }, navTile({ order: 'orders', message: 'feedback', booking: 'calendar', stock: 'menu' }[x.kind] || 'page', 32), h('span', {}, h('b', {}, x.title), h('small', {}, x.text)), h('em', {}, x.at ? ago(x.at) : 'Now'))) : [h('p', { class: 'tb-empty' }, 'Nothing new.')]));
      const seenAt = lastSeen();
      loadNotes().then(() => { draw(); try { localStorage.setItem(seenKey, String(Date.now())); } catch { /* private mode */ } markTodos(); const dot = document.querySelector('.tb-dot'); if (dot) dot.hidden = true; });
      return [h('div', { class: 'tb-pop-h' }, h('b', {}, 'Notifications'), h('button', { class: 'btn text sm', type: 'button', onclick: () => { close(); goTab('alerts'); } }, 'Alert settings')), list];
    });
  }
  function openProfileMenu(btn) {
    popover(btn, (close) => [
      h('button', { class: 'tb-who', type: 'button', onclick: () => { close(); goTab('profile'); } }, tIcon('user', 22), h('span', {}, h('b', {}, state.user.name || state.user.email), h('small', {}, roleName))),
      h('button', { class: 'tb-item', type: 'button', onclick: () => { close(); goTab('profile'); } }, 'Profile and sign-in'),
      h('button', { class: 'tb-item', type: 'button', onclick: () => { close(); goTab('settings'); } }, 'Settings'),
      h('button', { class: 'tb-item', type: 'button', onclick: async () => { close(); await flush(); await api('POST', '/api/auth/logout'); state.user = null; go('/login'); } }, 'Log out'),
    ]);
  }
  // The settings drawer: the handful of settings people open most, and a way to all of them.
  // Everything in Settings, so the search box can find any of it.
  const SETTINGS_INDEX = () => [
    ['Business information', 'bizinfo', 'Your business name, address, phone number and logo.'], ['Business hours', 'hours', 'Monday to Sunday, for your website and online ordering.'],
    ['Online ordering', 'ordering', 'Pickup, curbside and delivery, tax, tips and order limits.'], ['Taxes and additional charges', 'ordering', 'Sales tax and fees added to orders.'],
    ['Online booking', 'booking', 'What customers can book, how long it takes and how many at once.'], ['Alerts and emails', 'alerts', 'How you hear about new orders and what customers are sent.'],
    ['Devices and printers', 'devices', 'Phones and tablets told about every new order.'], ['Appearance', 'appearance', 'Light or dark, on this device.'],
    ['Profile and sign-in', 'profile', 'Your name, email, mobile number, password and multi-factor authentication.'], ['Employees', 'team', 'Who can sign in and what they can do.'],
    ['Scheduling', 'schedule', 'Shifts for your team.'], ['Timesheets', 'timesheets', 'Hours worked.'], ['Items', 'items', 'Prices, stock and photos.'], ['Categories', 'menu', 'How your menu is grouped.'],
    ['Modifier groups', 'mods', 'Sizes, add-ons and choices.'], ['Discounts', 'discs', 'Money off on invoices.'], ['Promo codes', 'promos', 'Codes customers enter at checkout.'],
    ['Gift cards', 'gift', 'Sell and redeem gift cards.'], ['Rewards', 'rewards', 'Loyalty points for regulars.'], ['Invoices and estimates', 'invoices', 'Bill customers and send quotes.'],
    ['Look and feel', 'design', 'Colours, fonts, logo and layout of your website.'], ['Web address', 'domain', 'Your free address, or a domain of your own.'], ['Policies', 'policies', 'Privacy, terms and refunds.'],
  ].filter(([, k]) => known(k));
  function openSettings() {
    sheet((close) => {
      const todos = setupTodos(), total = setupTodos.total || todos.length, doneN = total - todos.length;
      const go3 = (k) => () => { close(); goTab(k); };
      const results = h('div', { class: 'ss-list' });
      const freq = h('div', {}, h('p', { class: 'ss-k' }, 'Frequently viewed settings'), h('div', { class: 'ss-list' },
        [['Business information', 'Edit your business name, address, phone number, and more.', go3('bizinfo')], ['Reporting settings', 'Which period your reports open on.', () => { close(); reportSettings(); }],
          ['Business hours', 'Monday to Sunday, for your website and online ordering.', go3('hours')], ['Online ordering', 'Pickup, curbside and delivery, tax, tips and order limits.', go3('ordering')],
          ['Alerts and emails', 'How you hear about new orders and what customers are sent.', go3('alerts')], ['Website', 'Edit your website: look and feel, home page, web address and policies.', go3(lastTab.site)]]
          .map(([t, d, fn]) => h('button', { type: 'button', class: 'ss-row', onclick: fn }, h('b', {}, t), h('small', {}, d)))));
      const allSteps = setupSteps();
      const tasks = h('div', {}, h('p', { class: 'ss-k' }, 'Setup tasks'),
        h('div', { class: 'ss-task' }, h('span', {}, h('b', {}, 'Get ready to take orders'), h('small', {}, 'Add items, set default taxes, and configure other important settings.')), h('em', {}, `${doneN} of ${total} completed`)),
        h('div', { class: 'ss-check' }, allSteps.map(([ok, name, , act]) => h('button', { type: 'button', class: `ss-step${ok ? ' done' : ''}`, disabled: ok, onclick: () => { close(); act[1](); } }, h('i', { 'aria-hidden': 'true' }, ok ? '✓' : ''), h('span', {}, name), !ok && h('em', {}, act[0])))));
      const taskList = h('div', { hidden: true });
      const search = h('input', { type: 'search', placeholder: 'Search settings', 'aria-label': 'Search settings', oninput: () => { const q = search.value.trim().toLowerCase(); const hits = q ? SETTINGS_INDEX().filter(([t, , d]) => `${t} ${d}`.toLowerCase().includes(q)) : [];
        results.replaceChildren(...(q ? (hits.length ? hits.map(([t, k, d]) => h('button', { type: 'button', class: 'ss-row', onclick: go3(k) }, h('b', {}, t))) : [h('p', { class: 'ss-none' }, 'No settings match that.')]) : []));
        freq.hidden = !!q; tasks.hidden = !!q; } });
      return [h('div', { class: 'ss-head' }, h('h2', {}, tIcon('gear', 24), 'Settings'), h('button', { class: 'ss-x', type: 'button', 'aria-label': 'Close', onclick: close }, tIcon('x', 20))),
        h('div', { class: 'ss-body' }, tasks, taskList, freq),
        h('div', { class: 'ss-foot' }, h('button', { class: 'btn', type: 'button', onclick: go3('settings') }, 'View all settings'))];
    }, 'drawer ss');
  }
  // On a phone the whole menu opens full screen: the top-right buttons, New sale, every section and the website tools.
  function mobileMenu() {
    sheet((close) => {
      const fresh = orders ? orders.filter((x) => x.status === 'new').length : 0;
      const has = (k) => tabs.some(([t]) => t === k);
      const go4 = (k) => () => { close(); body.dataset.view = 'edit'; goTab(k); };
      const anchor = top.querySelector('.rail-tog') || top;
      const groups = NAV.office.map((g) => ({ ...g, tabs: g.tabs.filter(has), subs: (g.subs || []).filter((_, i) => has(g.tabs[i])) })).filter((g) => g.tabs.length);
      const row = (g) => {
        const here = g.tabs.includes(navOf(tab)), many = g.tabs.length > 1, badge = g.tabs.includes('orders') && fresh > 0 && h('em', { class: 'badge' }, fresh);
        if (!many) return h('button', { type: 'button', class: 'mm-row', 'aria-current': here ? 'page' : null, onclick: go4(g.tabs[0]) }, navIcon(g.icon, 24), h('b', {}, g.label), badge);
        const kids = h('div', { class: 'mm-kids', 'data-shut': here ? null : '1' }, h('div', {}, g.tabs.map((k, i) => h('button', { type: 'button', 'aria-current': k === navOf(tab) ? 'page' : null, onclick: go4(k) }, g.subs[i]))));
        const btn = h('button', { type: 'button', class: 'mm-row', 'data-here': here ? '1' : null, 'aria-expanded': String(here), onclick: () => { const now = btn.getAttribute('aria-expanded') !== 'true'; btn.setAttribute('aria-expanded', String(now)); if (now) delete kids.dataset.shut; else kids.dataset.shut = '1'; } }, navIcon(g.icon, 24), h('b', {}, g.label), badge, h('span', { class: 'fold-chev', 'aria-hidden': 'true' }));
        return [btn, kids];
      };
      return [h('div', { class: 'mm-head' },
          h('button', { type: 'button', class: 'mm-x', 'aria-label': 'Close menu', onclick: close }, tIcon('x', 22)), h('span', { class: 'grow' }),
          h('button', { type: 'button', class: 'icon-btn tb-btn', 'aria-label': 'Notifications', onclick: () => { close(); setTimeout(() => openNotes(anchor), 200); } }, tIcon('bell'), (unread() || newTodos()) && h('span', { class: 'tb-dot' })),
          h('button', { type: 'button', class: 'icon-btn tb-btn', 'aria-label': 'Settings', onclick: () => { close(); setTimeout(openSettings, 200); } }, tIcon('gear')),
          h('button', { type: 'button', class: 'icon-btn tb-btn', 'aria-label': 'Profile', onclick: () => { close(); setTimeout(() => openProfileMenu(anchor), 200); } }, tIcon('user'))),
        h('div', { class: 'mm-body' },
          h('button', { type: 'button', class: 'rail-new mm-new', onclick: go4('sale') }, ic('plus', 18), 'New sale'),
          h('nav', { class: 'mm-nav', 'aria-label': 'Back office' }, groups.map(row)),
          h('hr', { class: 'mm-hr' }),
          h('nav', { class: 'mm-nav' }, has('booking') && h('button', { type: 'button', class: 'mm-row', 'aria-current': tab === 'booking' ? 'page' : null, onclick: go4('booking') }, navIcon('calendar', 24), h('b', {}, 'Booking tools')), ...[TOOLS].map((g) => ({ ...g, tabs: g.tabs.filter(has), subs: g.subs.filter((_, i) => has(g.tabs[i])) })).filter((g) => g.tabs.length).map(row)),
          h('div', { class: 'mm-foot' }, h('small', {}, `© ${new Date().getFullYear()} Processor Freedom`), h('a', { href: '/terms', target: '_blank', rel: 'noopener' }, 'Terms'), h('a', { href: '/privacy', target: '_blank', rel: 'noopener' }, 'Privacy Policy'), h('a', { href: '/contact', target: '_blank', rel: 'noopener' }, 'Contact')))];
    }, 'mmenu');
  }
  const topRight = () => {
    const bell = h('button', { class: 'icon-btn tb-btn', type: 'button', title: 'Notifications', 'aria-label': 'Notifications', 'aria-haspopup': 'dialog', onclick: () => openNotes(bell) }, tIcon('bell'), h('span', { class: 'tb-dot', hidden: !(unread() || newTodos()) }));
    const gear = h('button', { class: 'icon-btn tb-btn tb-gear', type: 'button', title: 'Settings', 'aria-label': 'Settings', 'aria-current': tab === 'settings' || SETUP.tabs.includes(tab) ? 'page' : null, onclick: openSettings }, tIcon('gear'));
    const me = h('button', { class: 'icon-btn tb-btn', type: 'button', title: 'Profile', 'aria-label': 'Profile', 'aria-current': tab === 'profile' ? 'page' : null, 'aria-haspopup': 'dialog', onclick: () => openProfileMenu(me) }, tIcon('user'));
    return h('div', { class: 'tb-right' }, bell, gear, me);
  };
  loadNotes();

  /* Where am I: Dashboard › Sales activity › Orders. Each step is a link back up. */
  // The pages opened most recently, newest first, remembered on this device.
  function recent() { try { return JSON.parse(localStorage.getItem(`pf-recent-${id}`) || '[]').filter(known); } catch { return []; } }
  function noteVisit(k) { k = navOf(k); if (k === 'start' || modeOf(k) !== 'office') return; try { localStorage.setItem(`pf-recent-${id}`, JSON.stringify([k, ...recent().filter((x) => x !== k)].slice(0, 6))); } catch { /* private mode */ } }
  const nameOf = (k) => { const g = [...NAV.office, SETUP].find((x) => x.tabs.includes(k)); return g && g.subs ? g.subs[g.tabs.indexOf(k)] : (tabs.find(([t]) => t === k) || [])[1] || k; };
  /* Where am I: Dashboard › Setup › Business information. Every step can be pressed.
     "Dashboard" goes home; the section name opens its pages and the ones you used last. */
  function crumbs() {
    if (tab === 'start' || modeOf(tab) === 'site') return null;
    const g = [...NAV.office, SETUP].find((x) => x.tabs.includes(tab));
    const inSettings = g === SETUP || tab === 'profile';
    const home = h('a', { class: 'crumb', href: pathFor('start'), onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); goTab('start'); } }, 'Home');
    const back = (k, label) => h('a', { class: 'crumb', href: pathFor(k), onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); goTab(k); } }, label);
    const prev = recent().find((k) => k !== tab && g && g.tabs.includes(k));
    const sec = g && g.tabs.length > 1 && (g === SETUP ? back('settings', g.label) : back(prev || g.tabs.find((k) => k !== tab && known(k)) || g.tabs[0], g.label));
    const here = h('b', { class: 'crumb now', 'aria-current': 'page' }, nameOf(tab));
    const settingsLink = inSettings && h('a', { class: 'crumb', href: pathFor('settings'), onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); goTab('settings'); } }, 'Settings');
    const steps = [home, settingsLink, sec, here].filter(Boolean);
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
      modeOf(tab) === 'site' ? h('button', { class: 'icon-btn', title: 'Back to back office', 'aria-label': 'Back to back office', onclick: () => goTab(lastTab.office) }, ic('back')) : h('button', { class: 'icon-btn rail-tog', title: body.dataset.rail === 'shut' ? 'Show menu' : 'Hide menu', 'aria-label': body.dataset.rail === 'shut' ? 'Show menu' : 'Hide menu', 'aria-expanded': String(body.dataset.rail !== 'shut'), onclick: () => { if (matchMedia('(max-width:900px)').matches) return mobileMenu(); if (body.dataset.rail === 'shut') delete body.dataset.rail; else body.dataset.rail = 'shut'; try { localStorage.setItem('pf-rail', body.dataset.rail || ''); } catch { /* private mode */ } paintTop(); requestAnimationFrame(fit); } }, h('span', { class: 'tog-ic', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))),
      h('a', { class: 'tb-brand', href: pathFor('start'), title: 'Home', onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); goTab('start'); } }, h('img', { class: 'tb-logo', src: '/assets/logo-dark.svg', alt: 'PF Sites', width: 42, height: 42 })),
      modeOf(tab) === 'office' && h('button', { class: 'tb-biz', type: 'button', title: 'Switch business', onclick: () => switchBusiness() }, h('b', {}, meta.name), h('span', { class: 'swap', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h15l-4-4M20 16H5l4 4"/></svg>' })),
      h('span', { class: 'm-title' }, h('b', {}, body.dataset.view === 'preview' && modeOf(tab) === 'site' ? 'Preview' : (tabs.find(([k]) => k === tab) || [])[1] || ''), modeOf(tab) === 'office' && h('small', { class: 'm-biz' }, meta.name)),
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

  const leave = () => { staleSeen = true; document.removeEventListener('visibilitychange', onVisible); clearInterval(salesTick); clearInterval(liveTick); window.removeEventListener('keydown', onKey); stageWatch.disconnect(); clearInterval(poll); window.removeEventListener('message', onMessage); window.removeEventListener('beforeunload', onLeave); if (saveState !== 'saved') save.flush(); };
  leave.siteId = id; leave.nav = (k) => goTab(k, true);
  return leave;
}
