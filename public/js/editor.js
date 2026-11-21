import { BACKGROUNDS, SECTION_BACKGROUNDS, HEADER_LAYOUTS, HEADER_STYLES, FOOTER_STYLES, FOOTER_COLORS, QUICK_STYLES, applyQuickStyle, ACCENTS, FONTS, RADII, HERO_LAYOUTS, SERVICE_LAYOUTS, SECTION_TYPES, SECTION_DEFAULTS, ICONS, LEGAL_PAGES, legalText, uid, cleanSlug, str, ORDER_METHODS, ORDER_STATUSES, MENU_TEMPLATE_CSV, readyLabel, parseMenuCsv, parsePrice, money, openMethods, DAYS, TIMEZONES, LANGS, parseChoices, choicesText, slotLabel, itemPrice, DEFAULT_STOCK } from '/shared/core.js';
import { renderPage } from '/shared/render.js';
import { h, api, go, state, toast, sheet, confirmSheet, ic, svg, uploadImage, pickFiles, debounce, fmtDate, qrCanvas, readSheetFile, SHEET_TYPES, alertsOn, setAlerts, announceOrders, printTicket, pushSupported, pushOn, enablePush, disablePush, themeButton } from './ui.js';

// Everything a merchant can change, always one click away.
const TABS = [
  ['start', 'Get started', 'rocket'], ['menu', 'Menu', 'menu'], ['items', 'Items', 'tag'], ['design', 'Look and feel', 'brush'], ['sections', 'Home page', 'home'], ['business', 'Business info', 'store'],
  ['ordering', 'Ordering', 'sliders'], ['orders', 'Orders', 'bag'], ['sales', 'Sales', 'chart'], ['inbox', 'Messages', 'inbox'], ['domain', 'Web address', 'globe'], ['policies', 'Policies', 'lock'], ['seo', 'Search', 'search'], ['history', 'History', 'clock'],
];
const DIVIDE_AFTER = new Set(['start', 'business', 'inbox']);

export async function editor(id, mount, title) {
  const loaded = (await api('GET', `/api/sites/${id}`)).site;
  const draft = loaded.draft;
  let meta = { ...loaded, draft: undefined };
  title(meta.name);

  const q = new URLSearchParams(location.search);
  let tab = TABS.some(([k]) => k === q.get('tab')) ? q.get('tab') : 'start';
  let sel = null;            // id of the section being edited
  let page = 'home';
  let device = 'desktop';
  let saveState = 'saved';   // saved | dirty | saving | error
  let leads = null;
  let request;               // latest "get me a domain" request
  const openItems = new Set();
  let ordering = loaded.ordering;
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
    const out = renderPage(draft, page, { preview: true, base: '', menu, ordering, siteKey: id });
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
      const r = await api('PUT', `/api/sites/${id}`, { draft: JSON.parse(body) });
      meta = { ...meta, ...r.site };
      if (saveState === 'saving') saveState = 'saved';
      title(meta.name);
    } catch (e) { saveState = 'error'; toast(e.message, true); }
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
      try { o[k] = await uploadImage(file); a.after?.(); changed(); } catch (ex) { toast(ex.message, true); }
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
      const drawPv = () => pv.replaceChildren(h('div', { class: 'small', style: 'color:var(--green)' }, meta.url.replace(/^https?:\/\//, '').replace(/\/$/, '')), h('div', { style: 'color:#1a0dab;font-size:17px;margin:2px 0' }, str(s.title).trim() || autoTitle), h('div', { class: 'small' }, str(s.description).trim() || autoDesc));
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
        group('Menu and inventory', h('p', { class: 'hint' }, 'Upload your item list and we build your menu. Changes here appear on your live site right away, with no need to publish.'),
          h('button', { class: 'drop', onclick: importCsv }, ic('up2', 24), h('b', {}, menu.length ? 'Upload a new item list' : 'Upload your item list'), h('span', { class: 'small' }, 'Excel or CSV file with item names and prices')),
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
        const setPhoto = async (f) => { if (!f) return; photo.classList.add('busy'); try { it.image = await uploadImage(f); photo.style.backgroundImage = `url("${it.image}")`; photo.replaceChildren(); save(); } catch (e) { toast(e.message, true); } photo.classList.remove('busy'); };
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
          h('button', { class: 'inv-name', type: 'button', title: 'Edit item', onclick: open }, h('span', {}, h('b', {}, it.name), it.sale > 0 && h('span', { class: 'tag sale' }, `${it.sale}% off`), tag), h('small', {}, it.category)),
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
          h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('button', { class: 'btn soft', onclick: importCsv }, ic('up2', 16), 'Upload list'), menu.length > 0 && h('button', { class: 'btn soft', onclick: bulkPhotos }, ic('images', 16), 'Add photos'), h('button', { class: 'btn', onclick: addItem }, ic('plus', 16), 'Add item'))),
        kpis,
        h('div', { class: 'inv-bar' }, h('label', { class: 'inv-search' }, ic('search', 16), h('input', { type: 'search', placeholder: 'Search items', value: invQ, 'aria-label': 'Search items', oninput: (e) => { invQ = e.target.value.trim().toLowerCase(); drawList(); } })), chips),
        list, bar,
        !ordering.taxRate && menu.length > 0 && h('p', { class: 'hint', style: 'margin-top:4px' }, 'The Tax switch only has an effect once you set a sales tax rate under Ordering.'))];
    },

    ordering() {
      const o = ordering;
      const saveOrdering = debounce(async () => {
        try { ordering = (await api('PUT', `/api/sites/${id}/ordering`, { ordering: o })).ordering; Object.assign(o, ordering); ordering = o; if (page === 'order' && !o.enabled) page = 'home'; paint(true); paintTop(); }
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
          o.enabled && h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('button', { class: 'btn soft sm', onclick: () => setPage('order') }, 'Preview order page'), meta.live && h('a', { class: 'btn soft sm', href: `${meta.url.replace(/\/$/, '')}/order`, target: '_blank', rel: 'noopener' }, 'Open as a customer', ic('out', 14)))),
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
          group('Order emails', text('Send new orders to', o, 'notifyEmail', { type: 'email', placeholder: draft.business.email || state.user.email }),
            note(state.config.emailEnabled ? 'Customers get an email when their order is received, confirmed, ready and if it is cancelled. You get an email for every new order.' : h('span', {}, h('b', {}, 'Email is not switched on yet. '), 'Orders still arrive in your Orders list. Processor Freedom needs to connect an email service before confirmations are sent.'))),
        ] : [note('Turn this on to add an order page to your site. Customers choose items from your menu, pick how they want to receive them, and you get the order here and by email.')]),
      ];
      notify = null;
      return out;
    },

    orders() {
      if (!orders) { loadOrders(); return [h('div', { class: 'loading', style: 'min-height:200px' }, h('div', { class: 'spinner' }))]; }
      const active = orders.filter((x) => !['completed', 'cancelled'].includes(x.status));
      const shown = orderFilter === 'active' ? active : orders;
      const setStatus = async (x, status) => { try { const r = await api('POST', `/api/sites/${id}/orders/${x.id}`, { status }); Object.assign(x, r.order); paintPanel(); } catch (e) { toast(e.message, true); } };
      const next = { new: ['confirmed', 'Confirm order'], confirmed: ['ready', 'Mark ready'], ready: ['completed', 'Complete'] };
      const seg = h('div', { class: 'seg' }, [['active', `Active · ${active.length}`], ['all', 'All orders']].map(([k, l]) => h('button', { 'aria-pressed': String(orderFilter === k), onclick: () => { orderFilter = k; paintPanel(); } }, l)));
      const alertBox = h('label', { class: 'switch' }, h('span', {}, h('b', { style: 'font-weight:500' }, 'Sound and pop-up alerts'), h('div', { class: 'small muted' }, 'Chime on every new order while this page is open.')), h('input', { type: 'checkbox', checked: alertsOn(), onchange: (e) => setAlerts(e.target.checked) }), h('i'));
      const pushBox = h('label', { class: 'switch' }, h('span', {}, h('b', { style: 'font-weight:500' }, 'Notify this device'), h('div', { class: 'small muted' }, 'Get new orders as notifications, even when this page is closed. On iPhone and iPad, add this page to your Home Screen first.')),
        h('input', { type: 'checkbox', checked: pushIsOn === true, onchange: async (e) => {
          const want = e.target.checked;
          try { if (want) { await enablePush(); toast('This device will be notified of new orders'); } else { await disablePush(); } pushIsOn = want; } catch (ex) { e.target.checked = !want; toast(ex.message, true); }
        } }), h('i'));
      return [group('Orders', alertBox, pushBox, h('a', { class: 'btn soft sm', style: 'justify-self:start', href: `/app/site/${id}/kitchen`, target: '_blank' }, 'Open kitchen screen', ic('out', 14)), seg,
        !shown.length && note(orders.length ? 'No active orders right now.' : h('span', {}, h('b', {}, 'No orders yet. '), ordering.enabled ? 'New orders appear here as they come in. This list refreshes on its own.' : 'Turn on online ordering in Ordering options to start taking orders.')),
        shown.map((x) => h('article', { class: `ocard ${x.status === 'new' ? 'new' : ''}` },
          h('header', {}, h('b', {}, `#${x.number} · ${x.name}`), h('span', { class: `status ${x.status === 'cancelled' ? 'bad' : x.status === 'completed' ? '' : x.status === 'new' ? 'warn' : 'ok'}` }, x.status === 'ready' ? readyLabel(x.method) : ORDER_STATUSES[x.status])),
          h('div', { class: 'small muted' }, `${ORDER_METHODS[x.method]?.name || x.method} · ${new Date(x.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`),
          h('div', { class: 'its' }, x.items.map((l) => h('div', {}, h('span', {}, `${l.qty} × ${l.name}`, l.opts?.length > 0 && h('span', { class: 'muted', style: 'display:block;font-size:13px' }, l.opts.join(', '))), h('span', {}, money(l.price * l.qty)))), x.discount > 0 && h('div', { class: 'muted' }, h('span', {}, `Discount ${x.promo}`), h('span', {}, `−${money(x.discount)}`)), h('div', { style: 'font-weight:600;margin-top:4px' }, h('span', {}, 'Total'), h('span', {}, money(x.total)))),
          h('div', { class: 'small' }, h('a', { href: `tel:${x.phone.replace(/[^\d+]/g, '')}` }, x.phone), ' · ', h('a', { href: `mailto:${x.email}` }, x.email)),
          x.scheduled && h('div', { class: 'small' }, h('b', {}, 'Scheduled for '), slotLabel(x.scheduled, ordering)),
          x.address && h('div', { class: 'small' }, h('b', {}, 'Deliver to '), x.address), x.vehicle && h('div', { class: 'small' }, h('b', {}, 'Vehicle '), x.vehicle), x.notes && h('div', { class: 'small' }, h('b', {}, 'Notes '), x.notes),
          next[x.status] && h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => setStatus(x, next[x.status][0]) }, next[x.status][0] === 'ready' ? `Mark ${readyLabel(x.method).toLowerCase()}` : next[x.status][1]),
            h('button', { class: 'btn soft sm', onclick: () => printTicket(x, meta.name, { method: ORDER_METHODS[x.method]?.name || x.method, when: x.scheduled ? slotLabel(x.scheduled, ordering) : 'As soon as possible', total: money(x.total) }) }, ic('print', 14), 'Print'),
            h('button', { class: 'btn danger sm', onclick: async () => { if (await confirmSheet({ title: `Cancel order #${x.number}?`, text: 'The customer is told by email and any stock is returned.', action: 'Cancel order', danger: true })) setStatus(x, 'cancelled'); } }, 'Cancel')))))];
    },

    sales() {
      const load = async () => {
        if (salesBusy) return;
        salesBusy = true;
        try { stats = await api('GET', `/api/sites/${id}/stats?${new URLSearchParams(salesRange === 'custom' ? { range: 'custom', from: salesFrom, to: salesTo } : { range: salesRange })}`); }
        catch (e) { toast(e.message, true); stats = stats || { failed: true }; }
        salesBusy = false;
        if (tab === 'sales') paintPanel();
      };
      const pick = (r) => { salesRange = r; stats = null; paintPanel(); };
      const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['last30', 'Last 30 days'], ['custom', 'Custom']];
      const day = (d, o = { month: 'short', day: 'numeric' }) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', ...o });
      const head = (st) => h('div', { class: 'inv-top' },
        h('div', {}, h('h2', {}, 'Sales'), h('p', { class: 'muted' }, st && st.from ? (st.from === st.to ? day(st.from, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : `${day(st.from, { month: 'long', day: 'numeric' })} to ${day(st.to, { month: 'long', day: 'numeric', year: 'numeric' })}`) : 'Your sales, tax and best sellers.')),
        h('div', { class: 'row', style: 'flex-wrap:wrap' },
          st && st.orders && st.orders.length > 0 && h('button', { class: 'btn soft', onclick: () => exportCsv(st) }, ic('dl', 16), 'Export'),
          h('button', { class: 'btn soft', onclick: () => window.print() }, ic('print', 16), 'Print'),
          h('button', { class: 'btn soft', onclick: () => { stats = null; paintPanel(); } }, 'Refresh')));
      const fromIn = h('input', { type: 'date', value: salesFrom, 'aria-label': 'From', onchange: (e) => { salesFrom = e.target.value; } });
      const toIn = h('input', { type: 'date', value: salesTo, 'aria-label': 'To', onchange: (e) => { salesTo = e.target.value; } });
      const filter = h('div', { class: 'inv-bar' }, h('div', { class: 'inv-chips' }, RANGES.map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': String(salesRange === k), onclick: () => { if (k === 'custom') { salesRange = 'custom'; paintPanel(); } else pick(k); } }, l))),
        salesRange === 'custom' && h('form', { class: 'dates', onsubmit: (e) => { e.preventDefault(); if (!salesFrom || !salesTo) return toast('Choose a start and end date.', true); stats = null; paintPanel(); } }, fromIn, h('span', { class: 'muted' }, 'to'), toIn, h('button', { class: 'btn sm' }, 'Show')));
      if (salesRange === 'custom' && (!salesFrom || !salesTo) && !stats) return [h('div', { class: 'inv' }, head(null), filter, h('div', { class: 'inv-list' }, h('div', { class: 'inv-empty' }, ic('chart', 30), h('b', {}, 'Choose your dates'), h('p', {}, 'Pick a start and end date above, then press Show.'))))];
      if (!stats) { load(); return [h('div', { class: 'inv' }, head(null), filter, h('div', { class: 'loading', style: 'min-height:260px' }, h('div', { class: 'spinner' })))]; }
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
        none && h('div', { class: 'inv-list' }, h('div', { class: 'inv-empty' }, ic('chart', 30), h('b', {}, st.range === 'today' ? 'No sales yet today' : 'No sales in this period'), h('p', {}, meta.live ? 'Orders appear here the moment they are placed.' : 'Publish your site to start taking orders. Sales appear here as they come in.'))),
        !none && h('div', { class: 'scard' }, h('h3', {}, st.unit === 'hour' ? 'Sales by hour' : 'Sales by day'), chart),
        !none && h('div', { class: 'sgrid3' },
          h('div', { class: 'scard' }, h('h3', {}, 'Where the money went'),
            line('Item sales', money(t.gross)), t.discounts > 0 && line('Discounts and promo codes', `−${money(t.discounts)}`), line('Net sales', money(t.net), 'strong'),
            line('Sales tax', money(t.tax)), line('Delivery fees', money(t.fees)), line('Tips', money(t.tips)), line('Total collected', money(t.total), 'total')),
          h('div', { class: 'scard' }, h('h3', {}, 'Sales tax'),
            line('Taxable sales', money(t.taxable)), line('Non-taxable sales', money(t.nontaxable)), line('Tax collected', money(t.tax), 'total'),
            h('p', { class: 'hint' }, st.taxRate ? `Your rate is ${st.taxRate}%. Taxable sales are after discounts. Items with tax switched off are counted as non-taxable.` : 'You have no sales tax rate set. Add one under Ordering.')),
          h('div', { class: 'scard' }, h('h3', {}, 'How customers ordered'),
            st.methods.map((m) => h('div', { class: 'mrow2' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, ORDER_METHODS[m.method]?.name || m.method), h('span', {}, `${m.orders} order${m.orders === 1 ? '' : 's'} · ${money(m.net)}`)), h('div', { class: 'track2' }, h('i', { style: `width:${(m.orders / mTotal) * 100}%` })), h('span', { class: 'small muted' }, `${Math.round((m.orders / mTotal) * 100)}% of orders`))))),
        !none && h('div', { class: 'scard' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, 'Item sales'), h('span', { class: 'small muted' }, `${st.items.length} item${st.items.length === 1 ? '' : 's'} · ${t.units} sold`)),
          h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['', 'Item', 'Category', 'Sold', 'Sales', 'Share of sales'].map((x) => h('th', {}, x)))),
            h('tbody', {}, st.items.map((it, i) => h('tr', {}, h('td', { class: 'muted' }, i + 1), h('td', {}, h('b', {}, it.name), i === 0 && h('span', { class: 'tag sale', style: 'margin-left:8px' }, 'Most popular')), h('td', { class: 'muted' }, it.category), h('td', {}, it.qty), h('td', {}, money(it.sales)),
              h('td', {}, h('div', { class: 'share' }, h('div', { class: 'track2' }, h('i', { style: `width:${(it.sales / topSales) * 100}%` })), h('span', { class: 'small muted' }, `${t.gross ? Math.round((it.sales / t.gross) * 100) : 0}%`))))))))),
        !none && st.categories.length > 1 && h('div', { class: 'scard' }, h('h3', {}, 'Sales by category'), st.categories.map((c) => h('div', { class: 'mrow2' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, c.name), h('span', {}, `${c.qty} sold · ${money(c.sales)}`)), h('div', { class: 'track2' }, h('i', { style: `width:${t.gross ? (c.sales / t.gross) * 100 : 0}%` }))))),
        st.orders.length > 0 && h('div', { class: 'scard' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, 'Orders in this period'), h('span', { class: 'small muted' }, `${st.orders.length} order${st.orders.length === 1 ? '' : 's'}`)),
          h('div', { class: 'tscroll' }, h('table', { class: 'table stable' }, h('thead', {}, h('tr', {}, ['Order', 'When', 'Type', 'Customer', 'Items', 'Tax', 'Total', 'Status'].map((x) => h('th', {}, x)))),
            h('tbody', {}, st.orders.slice(0, 200).map((o) => h('tr', { class: o.status === 'cancelled' ? 'void' : '' }, h('td', {}, h('b', {}, `#${o.number}`)), h('td', { class: 'muted' }, `${st.from === st.to ? '' : `${day(o.date)} `}${o.time}`), h('td', {}, ORDER_METHODS[o.method]?.name || o.method), h('td', {}, o.name), h('td', {}, money(o.subtotal - o.discount)), h('td', {}, money(o.tax)), h('td', {}, h('b', {}, money(o.total))),
              h('td', {}, h('span', { class: `status ${o.status === 'cancelled' ? 'bad' : o.status === 'new' ? 'warn' : 'ok'}` }, ORDER_STATUSES[o.status] || o.status))))))),
          st.orders.length > 200 && h('p', { class: 'hint' }, `Showing the latest 200. Export to see all ${st.orders.length}.`)))];
    },

    inbox() {
      if (!leads) {
        api('GET', `/api/sites/${id}/leads`).then((r) => { leads = r.leads; if (tab === 'inbox') paintPanel(); });
        return [h('div', { class: 'loading', style: 'min-height:200px' }, h('div', { class: 'spinner' }))];
      }
      if (!leads.length) return [group('Inbox', note(h('b', {}, 'No messages yet. '), 'When someone uses the contact form on your published site, their message appears here.'))];
      return [group(`Inbox · ${leads.length}`, leads.map((l) => h('article', { class: 'lead' },
        h('header', {}, h('b', {}, l.name), h('span', { class: 'small muted' }, fmtDate(l.createdAt))),
        h('div', { class: 'small' }, h('a', { href: `mailto:${l.email}` }, l.email), l.phone && [' · ', h('a', { href: `tel:${l.phone.replace(/[^\d+]/g, '')}` }, l.phone)]),
        h('p', {}, l.message),
        h('div', { class: 'row' }, h('a', { class: 'btn soft sm', href: `mailto:${l.email}?subject=${encodeURIComponent(`Re: your message to ${meta.name}`)}` }, 'Reply'),
          h('button', { class: 'btn danger sm', onclick: async () => { await api('DELETE', `/api/sites/${id}/leads/${l.id}`); leads = leads.filter((x) => x.id !== l.id); paintPanel(); } }, 'Delete')))))];
    },
  };

  async function loadOrders(quiet) {
    try {
      const fresh = (await api('GET', `/api/sites/${id}/orders`)).orders;
      const had = orders ? new Set(orders.map((x) => x.id)) : null;
      const arrived = had ? fresh.filter((x) => !had.has(x.id)).length : 0;
      const changed = !orders || JSON.stringify(fresh) !== JSON.stringify(orders);
      orders = fresh;
      if (arrived) { toast(arrived === 1 ? 'New order received' : `${arrived} new orders received`); announceOrders(fresh.filter((x) => !had.has(x.id)), meta.name); }
      if (changed && (tab === 'orders' || tab === 'start')) paintPanel(); else if (changed) paintPanel();
    } catch (e) { if (!quiet) toast(e.message, true); }
  }
  const poll = setInterval(() => { if (ordering.enabled && document.visibilityState === 'visible') loadOrders(true); }, 20000);
  const salesTick = setInterval(() => { if (tab === 'sales' && stats && !stats.failed && stats.to === stats.today && document.visibilityState === 'visible') api('GET', `/api/sites/${id}/stats?${new URLSearchParams(salesRange === 'custom' ? { range: 'custom', from: salesFrom, to: salesTo } : { range: salesRange })}`).then((r) => { if (tab === 'sales' && JSON.stringify(r) !== JSON.stringify(stats)) { stats = r; paintPanel(); } }).catch(() => {}); }, 30000);
  if (ordering.enabled) loadOrders(true);

  async function putOrdering() { ordering = (await api('PUT', `/api/sites/${id}/ordering`, { ordering })).ordering; }
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
            if (name !== c) { const r = await api('POST', `/api/sites/${id}/menu/category`, { from: c, to: name }); menu = r.items; ordering = r.ordering; }
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
      try { hit.image = await uploadImage(f); await api('PUT', `/api/sites/${id}/menu/${hit.id}`, hit); left.delete(hit.id); done.push(hit.name); } catch { missed.push(f.name); }
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
          image('Photo', it, 'image'),
          h('div', { class: 'stack' }, text('Name', it, 'name', { maxlength: 120, autofocus: true }),
            h('div', { class: 'pair' }, wrap('Price', priceIn), wrap('Sale, percent off', saleIn)), now,
            text('Category', it, 'category', { list: listId, maxlength: 60 }), h('datalist', { id: listId }, cats.map((c) => h('option', { value: c }))))),
        area('Description', it, 'desc', { rows: 2, maxlength: 500 }),
        h('div', { class: 'isheet-row' },
          h('div', { class: 'field' }, h('span', {}, 'In stock'), h('div', { class: 'inv-qty' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'One fewer', onclick: bump(-1) }, ic('minus', 16)), qtyIn, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'One more', onclick: bump(1) }, ic('plus', 16)))),
          toggle('Charge sales tax', it, 'taxable', (v) => v !== false), toggle('Available to order', it, 'available', (v) => v !== false)),
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

  const goTab = (k) => { if (tab === 'items' && k !== 'items') paint(true); tab = k; sel = null; editItem = null; panel.scrollTop = 0; paintPanel(); panel.classList.remove('enter'); void panel.offsetWidth; panel.classList.add('enter'); };
  function startPanel() {
    const b = draft.business;
    const steps = [
      [menu.length > 0, 'Add your menu', menu.length ? `${menu.length} item${menu.length === 1 ? '' : 's'} on your menu.` : 'Upload an Excel or CSV file of item names and prices and we build the menu for you.', menu.length ? ['Edit menu', () => goTab('menu')] : ['Upload item list', importCsv], !menu.length && ['Add items by hand', () => goTab('menu')]],
      [!!draft.brand.logo, 'Add your logo and colour', 'Make the site look like your business.', ['Open look and feel', () => goTab('design')]],
      [!!(str(b.phone).trim() && str(b.address1).trim()), 'Add your business details', 'Phone, address and opening hours, so customers can find you.', ['Open business info', () => goTab('business')]],
      [ordering.enabled && openMethods(ordering).length > 0, 'Choose how customers order', ordering.enabled ? `${openMethods(ordering).map((m) => ORDER_METHODS[m].name).join(', ')} ${openMethods(ordering).length === 1 ? 'is' : 'are'} on. Add curbside, delivery, tax and tips here.` : 'Online ordering is off.', ['Open ordering', () => goTab('ordering')]],
      [meta.live && !meta.dirty, meta.live ? 'Published' : 'Publish your site', meta.live ? (meta.dirty ? 'You have changes that are not live yet.' : `Live at ${meta.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}`) : 'Nothing is public until you publish. You can keep editing afterwards.', meta.live && !meta.dirty ? ['View live site', () => window.open(meta.url, '_blank', 'noopener')] : [meta.live ? 'Publish changes' : 'Publish', (e) => publish(e)]],
    ];
    steps.push([!!(orders && orders.length), 'Place a test order', meta.live ? 'Order from your own site to see exactly what customers see, then watch it arrive under Orders.' : 'Once you publish, order from your own site to see the whole flow.', ['Open my order page', () => (meta.live ? window.open(`${meta.url.replace(/\/$/, '')}/order`, '_blank', 'noopener') : toast('Publish your site first.', true))]]);
    const done = steps.filter(([ok]) => ok).length;
    const next = steps.findIndex(([ok]) => !ok);
    return [
      h('div', {}, h('h2', {}, done === steps.length ? 'You’re all set.' : 'Let’s get you live.'), h('p', { class: 'muted', style: 'margin-top:6px' }, `${done} of ${steps.length} done. Changes save on their own as you go.`),
        h('div', { class: 'prog', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': steps.length, 'aria-valuenow': done }, h('i', { style: `width:${(done / steps.length) * 100}%` }))),
      h('div', { class: 'todo' }, steps.map(([ok, name, text, main, alt], i) => h('div', { class: `todo-row ${ok ? 'done' : ''} ${i === next ? 'next' : ''}` },
        h('span', { class: 'tick' }, ok ? ic('check', 15) : String(i + 1)),
        h('div', { class: 'grow' }, h('b', {}, name), h('p', {}, text),
          h('div', { class: 'row', style: 'flex-wrap:wrap;margin-top:10px' }, h('button', { class: `btn sm ${i === next ? '' : 'soft'}`, onclick: main[1] }, main[0]), alt && h('button', { class: 'btn text sm', onclick: alt[1] }, alt[0])))))),
      note('Tip: click anything in the preview on the right to edit it.'),
    ];
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
  const rail = h('nav', { class: 'rail', 'aria-label': 'Site settings' });
  const panel = h('div', { class: 'panel' });
  const top = h('header', { class: 'ed-top' });
  const body = h('div', { class: 'ed-body', 'data-view': 'edit' }, rail, h('aside', { class: 'ed-side' }, tabsEl, panel), stage);

  function paintPanel() {
    const y = panel.scrollTop;
    const cur = TABS.find(([k]) => k === tab) || TABS[0];
    const fresh = orders ? orders.filter((x) => x.status === 'new').length : 0;
    rail.replaceChildren(...TABS.flatMap(([k, label, icon]) => [
      h('button', { 'aria-current': k === cur[0] ? 'page' : null, onclick: () => goTab(k) }, ic(icon, 18), h('span', {}, label), k === 'orders' && fresh > 0 && h('em', { class: 'badge' }, fresh)),
      DIVIDE_AFTER.has(k) && h('hr'),
    ]).filter(Boolean));
    tabsEl.replaceChildren(h('b', {}, cur[1]));
    body.dataset.wide = String(cur[0] === 'items' || cur[0] === 'sales');
    panel.replaceChildren(...(cur[0] === 'start' ? startPanel() : PANELS[cur[0]]()).flat(Infinity).filter(Boolean));
    panel.scrollTop = y;
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

  function paintTop() {
    const label = { saved: 'Saved', dirty: 'Saving…', saving: 'Saving…', error: 'Not saved' }[saveState];
    const pub = !meta.live ? h('button', { class: 'btn', onclick: publish }, 'Publish')
      : meta.dirty ? h('button', { class: 'btn', onclick: publish }, 'Publish changes')
        : h('button', { class: 'btn soft', onclick: () => liveSheet(false) }, ic('check', 15), 'Published');
    top.replaceChildren(
      h('button', { class: 'icon-btn', 'aria-label': 'Back to my sites', onclick: async () => { await flush(); go('/app'); } }, ic('back')),
      h('span', { class: 'name' }, meta.name),
      h('button', { class: 'icon-btn', title: 'Undo', 'aria-label': 'Undo', disabled: at === 0 && JSON.stringify(draft) === history[0], onclick: () => travel(-1) }, ic('undo')), h('button', { class: 'icon-btn', title: 'Redo', 'aria-label': 'Redo', disabled: at >= history.length - 1, onclick: () => travel(1) }, ic('redo')), h('span', { class: `status ${saveState === 'error' ? 'bad' : saveState === 'saved' ? 'ok' : ''}`, 'aria-live': 'polite' }, label),
      h('div', { class: 'mid' },
        h('div', { class: 'seg dev-seg', role: 'group', 'aria-label': 'Preview size' }, [['desktop', 'Desktop'], ['tablet', 'Tablet'], ['phone', 'Phone']].map(([k, l]) => h('button', { 'aria-pressed': String(device === k), onclick: () => setDevice(k) }, l))),
        h('select', { 'aria-label': 'Page', onchange: (e) => setPage(e.target.value) }, [['home', 'Home'], ...(ordering.enabled ? [['order', 'Order online']] : []), ...Object.entries(LEGAL_PAGES).filter(([k]) => draft.legal[k]?.enabled !== false)].map(([k, l]) => h('option', { value: k, selected: page === k }, l))),
        h('div', { class: 'seg mob-toggle', role: 'group', 'aria-label': 'View' }, [['edit', 'Edit'], ['preview', 'Preview']].map(([k, l]) => h('button', { 'aria-pressed': String(body.dataset.view === k), onclick: () => { body.dataset.view = k; paintTop(); requestAnimationFrame(fit); } }, l)))),
      themeButton(),
      h('button', { class: 'btn soft', title: 'Open your draft in a new tab', onclick: async () => { const w = window.open('', '_blank'); await flush(); if (w) w.location = `/preview/${id}/`; } }, ic('eye', 16), h('span', { class: 'dev-seg' }, 'Preview')),
      pub);
  }

  /* ---------- publishing ---------- */

  async function doPublish(btn) {
    btn.disabled = true; btn.textContent = 'Publishing…';
    try {
      const r = await api('POST', `/api/sites/${id}/publish`, { draft: JSON.parse(JSON.stringify(draft)) });
      meta = { ...meta, ...r.site }; saveState = 'saved'; versions = null; paintTop(); if (tab === 'start' || tab === 'history') paintPanel();
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
  const onLeave = (e) => { if (saveState !== 'saved') { save.flush(); e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('message', onMessage);
  window.addEventListener('beforeunload', onLeave);

  mount(h('div', { class: 'ed' }, top, body));
  paintTop(); paintPanel(); paint(true);

  return () => { clearInterval(salesTick); window.removeEventListener('keydown', onKey); stageWatch.disconnect(); clearInterval(poll); window.removeEventListener('message', onMessage); window.removeEventListener('beforeunload', onLeave); if (saveState !== 'saved') save.flush(); };
}
