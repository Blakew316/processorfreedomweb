import { BACKGROUNDS, SECTION_BACKGROUNDS, HEADER_LAYOUTS, HEADER_STYLES, FOOTER_STYLES, FOOTER_COLORS, QUICK_STYLES, applyQuickStyle, ACCENTS, FONTS, RADII, HERO_LAYOUTS, SERVICE_LAYOUTS, SECTION_TYPES, SECTION_DEFAULTS, ICONS, LEGAL_PAGES, legalText, uid, cleanSlug, str, ORDER_METHODS, ORDER_STATUSES, MENU_TEMPLATE_CSV, readyLabel, parseMenuCsv, parsePrice, money, openMethods, DAYS, TIMEZONES, LANGS, parseChoices, choicesText, slotLabel } from '/shared/core.js';
import { renderPage } from '/shared/render.js';
import { h, api, go, state, toast, sheet, confirmSheet, ic, svg, uploadImage, pickFiles, debounce, fmtDate, qrCanvas, readSheetFile, SHEET_TYPES, alertsOn, setAlerts, announceOrders, printTicket, pushSupported, pushOn, enablePush, disablePush, themeButton } from './ui.js';

// Everything a merchant can change, always one click away.
const TABS = [
  ['start', 'Get started', 'rocket'], ['menu', 'Menu', 'menu'], ['design', 'Look and feel', 'brush'], ['sections', 'Home page', 'home'], ['business', 'Business info', 'store'],
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
      box.replaceChildren(h('span', {}, label), zone, a.hint && h('small', {}, a.hint));
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
      const it = editItem && menu.find((x) => x.id === editItem);
      if (it) {
        const saveItem = debounce(async () => { try { await api('PUT', `/api/sites/${id}/menu/${it.id}`, it); paint(true); } catch (e) { toast(e.message, true); } }, 500);
        notify = saveItem;
        const priceIn = h('input', { value: (it.price / 100).toFixed(2), inputmode: 'decimal', 'aria-label': 'Price', oninput: () => { const c = parsePrice(priceIn.value); if (c !== null) { it.price = c; saveItem(); } priceIn.style.borderColor = c === null ? 'var(--red)' : ''; } });
        const stockBox = h('div', { class: 'stack' });
        const drawStock = () => stockBox.replaceChildren(
          h('label', { class: 'switch' }, h('span', {}, 'Track how many are left'), h('input', { type: 'checkbox', checked: it.stock != null, onchange: (e) => { it.stock = e.target.checked ? 10 : null; saveItem(); drawStock(); } }), h('i')),
          it.stock != null && wrap('In stock', h('input', { type: 'number', min: 0, max: 999999, value: it.stock, oninput: (e) => { it.stock = Math.max(0, Math.round(Number(e.target.value)) || 0); saveItem(); } }), 'Goes down with every order. The item shows as sold out at zero.'));
        drawStock();
        it.options = Array.isArray(it.options) ? it.options : [];
        const optBox = h('div', { class: 'stack' });
        const drawOpts = () => optBox.replaceChildren(...it.options.map((g, gi) => h('div', { class: 'item' }, h('div', { class: 'in', style: 'padding-top:12px' },
          h('div', { class: 'row' }, h('label', { class: 'field grow' }, h('input', { value: g.name, placeholder: 'e.g. Size', 'aria-label': 'Option name', oninput: (e) => { g.name = e.target.value; saveItem(); } })), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove option', onclick: () => { it.options.splice(gi, 1); saveItem(); drawOpts(); } }, ic('trash', 16))),
          wrap('Choices', h('textarea', { rows: 4, value: choicesText(g.choices), placeholder: 'Small\nLarge +1.50', oninput: (e) => { g.choices = parseChoices(e.target.value); saveItem(); } })),
          h('label', { class: 'switch' }, h('span', {}, 'Customer must choose'), h('input', { type: 'checkbox', checked: g.required, onchange: (e) => { g.required = e.target.checked; saveItem(); } }), h('i')),
          h('label', { class: 'switch' }, h('span', {}, 'Can pick more than one'), h('input', { type: 'checkbox', checked: g.multi, onchange: (e) => { g.multi = e.target.checked; saveItem(); } }), h('i'))))),
          h('button', { type: 'button', class: 'btn soft sm', style: 'justify-self:start', onclick: () => { it.options.push({ name: it.options.length ? 'Add-ons' : 'Size', required: !it.options.length, multi: !!it.options.length, choices: [] }); drawOpts(); } }, ic('plus', 14), 'Add option'));
        drawOpts();
        const listId = uid('dl');
        const out = [h('button', { class: 'back', onclick: () => { saveItem.flush(); editItem = null; paintPanel(); } }, ic('back', 16), 'All items'), h('h2', {}, it.name || 'Item'),
          group('', text('Item name', it, 'name', { maxlength: 120 }), h('div', { class: 'pair' }, wrap('Price', priceIn), text('Category', it, 'category', { list: listId, maxlength: 60 })), h('datalist', { id: listId }, cats.map((c) => h('option', { value: c }))),
            area('Description', it, 'desc', { rows: 3, maxlength: 500 }), image('Photo', it, 'image', { hint: 'Shown beside the item on your menu and order page.' })),
          group('Options', h('p', { class: 'hint' }, 'Sizes, add-ons and choices. Put one choice per line, with an extra charge if there is one, like “Large +1.50”.'), optBox),
          group('Availability', toggle('Available to order', it, 'available', (v) => v !== false), stockBox),
          group('Position', h('div', { class: 'row' }, ...[[-1, 'up', 'Move up'], [1, 'down', 'Move down']].map(([by, icon, label]) => h('button', { class: 'btn soft sm', disabled: !menu[menu.indexOf(it) + by], onclick: async () => {
            const i = menu.indexOf(it), j = i + by; saveItem.flush();
            [menu[i], menu[j]] = [menu[j], menu[i]];
            if (menu[i].category !== it.category) { it.category = menu[i].category; await api('PUT', `/api/sites/${id}/menu/${it.id}`, it).catch(() => {}); }
            try { menu = (await api('PUT', `/api/sites/${id}/menu-order`, { ids: menu.map((x) => x.id) })).items; } catch (e) { toast(e.message, true); }
            paintPanel(); paint(true);
          } }, ic(icon, 14), label)))),
          group('', h('button', { class: 'btn danger', style: 'justify-self:start', onclick: async () => { menu = (await api('DELETE', `/api/sites/${id}/menu/${it.id}`)).items; editItem = null; paintPanel(); paint(true); } }, 'Delete item'))];
        notify = null;
        return out;
      }
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
      const stockText = (x) => (x.available === false ? 'Hidden' : x.stock === 0 ? 'Sold out' : x.stock != null ? `${x.stock} left` : '');
      return [
        group('Menu and inventory', h('p', { class: 'hint' }, 'Upload your item list and we build your menu. Changes here appear on your live site right away, with no need to publish.'),
          h('button', { class: 'drop', onclick: importCsv }, ic('up2', 24), h('b', {}, menu.length ? 'Upload a new item list' : 'Upload your item list'), h('span', { class: 'small' }, 'Excel or CSV file with item names and prices')),
          h('div', { class: 'row', style: 'flex-wrap:wrap' },
            h('a', { class: 'btn soft sm', download: 'menu-template.csv', href: `data:text/csv;charset=utf-8,${encodeURIComponent(MENU_TEMPLATE_CSV)}` }, ic('dl', 14), 'Download template'),
            menu.length > 0 && h('button', { class: 'btn soft sm', onclick: bulkPhotos }, ic('image', 14), 'Add photos in bulk'),
            h('button', { class: 'btn soft sm', onclick: async () => { try { const before = new Set(menu.map((x) => x.id)); menu = (await api('POST', `/api/sites/${id}/menu`, { name: 'New item', price: 0, category: cats.at(-1) || 'Menu' })).items; editItem = menu.find((x) => !before.has(x.id))?.id; paintPanel(); paint(true); } catch (e) { toast(e.message, true); } } }, ic('plus', 14), 'Add item'))),
        ...cats.map((c) => group('', catHead(c), h('div', { class: 'slist' }, menu.filter((x) => x.category === c).map((x) => h('div', { class: `srow mrow ${x.available === false ? 'off' : ''}`, draggable: 'true', ondragstart: (e) => { dragId = x.id; e.dataTransfer.effectAllowed = 'move'; }, ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }, ondragleave: (e) => e.currentTarget.classList.remove('over'), ondrop: (e) => { e.preventDefault(); dropOn(x); } },
          h('span', { class: 'grip', title: 'Drag to reorder' }, ic('grip', 16)),
          h('div', { class: 'pv', style: x.image ? `background-image:url("${x.image}")` : '' }),
          h('button', { class: 't', onclick: () => { editItem = x.id; paintPanel(); } }, h('b', {}, x.name), h('span', {}, [money(x.price), stockText(x)].filter(Boolean).join(' · '))),
          h('label', { class: 'switch', title: 'Available to order' }, h('input', { type: 'checkbox', 'aria-label': `${x.name} available`, checked: x.available !== false, onchange: async (e) => { x.available = e.target.checked; await api('PUT', `/api/sites/${id}/menu/${x.id}`, x); paintPanel(); paint(true); } }), h('i'))))))),
        menu.length > 0 && group('', h('p', { class: 'hint' }, `${menu.length} item${menu.length === 1 ? '' : 's'} in ${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}. Drag an item to move it.`),
          !ordering.enabled && note('Online ordering is off, so customers can browse this menu but not order. Turn it on in ', h('b', {}, 'Ordering options'), '.'),
          h('button', { class: 'btn danger sm', style: 'justify-self:start', onclick: async () => { if (!await confirmSheet({ title: 'Remove every item?', text: 'Your whole menu will be deleted. Past orders are kept.', action: 'Remove all', danger: true })) return; menu = (await api('DELETE', `/api/sites/${id}/menu/all`)).items; paintPanel(); paint(true); } }, 'Remove all items')),
      ];
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
      if (!stats) { api('GET', `/api/sites/${id}/stats`).then((r) => { stats = r; if (tab === 'sales') paintPanel(); }).catch((e) => toast(e.message, true)); return [h('div', { class: 'loading', style: 'min-height:200px' }, h('div', { class: 'spinner' }))]; }
      const st = stats;
      const peak = Math.max(1, ...st.days.map((d) => d.sales));
      const card = (label, value) => h('div', { class: 'kpi' }, h('span', { class: 'small muted' }, label), h('b', {}, value));
      const totalMethods = Object.values(st.methods).reduce((a, b) => a + b, 0) || 1;
      return [group('Last 30 days', h('div', { class: 'kpis' }, card('Sales', money(st.sales)), card('Orders', st.orders), card('Average order', money(st.average)), card('Tips', money(st.tips))),
        h('div', { class: 'bars', role: 'img', 'aria-label': 'Sales per day for the last 30 days' }, st.days.map((d) => h('i', { title: `${d.date}: ${money(d.sales)} · ${d.orders} order${d.orders === 1 ? '' : 's'}`, style: `height:${Math.max(2, (d.sales / peak) * 100)}%`, class: d.sales ? 'on' : '' }))),
        h('div', { class: 'row small muted', style: 'justify-content:space-between' }, h('span', {}, st.days[0].date.slice(5)), h('span', {}, 'Today'))),
        group('Best sellers', st.top.length ? h('table', { class: 'ptable' }, h('tbody', {}, st.top.map((t) => h('tr', {}, h('td', {}, t.name), h('td', { class: 'muted' }, `${t.qty} sold`), h('td', {}, money(t.sales)))))) : note('No sales yet. Your best-selling items appear here once orders come in.')),
        group('How customers order', Object.keys(ORDER_METHODS).filter((m) => st.methods[m]).map((m) => h('div', { class: 'split' }, h('span', {}, ORDER_METHODS[m].name), h('div', {}, h('i', { style: `width:${(st.methods[m] / totalMethods) * 100}%` })), h('b', {}, st.methods[m]))), !Object.keys(st.methods).length && note('Nothing to show yet.')),
        h('button', { class: 'btn soft sm', style: 'justify-self:start', onclick: () => { stats = null; paintPanel(); } }, 'Refresh')];
    },

    history() {
      if (!versions) { api('GET', `/api/sites/${id}/versions`).then((r) => { versions = r.versions; if (tab === 'history') paintPanel(); }).catch((e) => toast(e.message, true)); return [h('div', { class: 'loading', style: 'min-height:200px' }, h('div', { class: 'spinner' }))]; }
      const when = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      return [group('Published versions', h('p', { class: 'hint' }, 'Every time you publish, we keep a copy. Restore one to bring your design and text back to how they were. Your menu, orders and settings are not affected.'),
        versions.length ? h('div', { class: 'slist' }, versions.map((v, i) => h('div', { class: 'srow', style: 'padding:10px 10px 10px 14px' }, h('div', { class: 't', style: 'display:grid' }, h('b', {}, when(v.createdAt)), h('span', {}, i === 0 ? 'Latest published version' : `${versions.length - i} of ${versions.length}`)),
          h('button', { class: 'btn soft sm', onclick: async () => {
            if (!await confirmSheet({ title: 'Restore this version?', text: 'Your current draft is replaced. You can undo it, and nothing goes live until you publish.', action: 'Restore' })) return;
            try { const r = await api('GET', `/api/sites/${id}/versions/${v.id}`); for (const k of Object.keys(draft)) delete draft[k]; Object.assign(draft, r.draft); changed(); toast('Version restored. Publish to make it live.'); goTab('design'); } catch (e) { toast(e.message, true); }
          } }, 'Restore')))) : note('Nothing published yet. Versions appear here each time you publish.'))];
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
          const r = await api('POST', `/api/sites/${id}/menu/import`, { csv, replace });
          menu = r.items; close(); toast(`${r.imported} item${r.imported === 1 ? '' : 's'} added to your menu`); editItem = null; paintPanel(); paint(true);
        } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = 'Try again'; }
      };
      const cats = new Set(p.items.map((x) => x.category)).size;
      return [h('h2', {}, p.items.length ? `${p.items.length} item${p.items.length === 1 ? '' : 's'} found` : 'We could not read that file'),
        h('p', { class: 'muted' }, p.items.length ? `From ${file.name}, in ${cats} categor${cats === 1 ? 'y' : 'ies'}. Check a few before we build your menu.` : p.errors[0]?.reason || 'No items were found.'),
        p.items.length > 0 && h('table', { class: 'ptable' }, h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', {}, 'Category'), h('th', {}, 'Price'))), h('tbody', {}, p.items.slice(0, 6).map((x) => h('tr', {}, h('td', {}, x.name), h('td', { class: 'muted' }, x.category), h('td', {}, money(x.price)))))),
        p.items.length > 6 && h('p', { class: 'small muted' }, `and ${p.items.length - 6} more`),
        p.items.length > 0 && p.errors.length > 0 && h('div', { class: 'note' }, h('b', {}, `${p.errors.length} row${p.errors.length === 1 ? '' : 's'} will be skipped. `), p.errors.slice(0, 3).map((e) => h('div', {}, `${e.row ? `Row ${e.row}: ` : ''}${e.reason}`))),
        !p.items.length && h('p', { class: 'hint' }, 'Your file needs a column of item names and a column of prices. Download the template to see the layout.'),
        h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Cancel'),
          p.items.length > 0 && menu.length > 0 && h('button', { class: 'btn soft', onclick: (e) => run(false, e.currentTarget) }, 'Add to my menu'),
          p.items.length > 0 && h('button', { class: 'btn', onclick: (e) => run(menu.length > 0, e.currentTarget) }, menu.length ? 'Replace my menu' : 'Build my menu'))];
    });
  }

  const goTab = (k) => { tab = k; sel = null; editItem = null; panel.scrollTop = 0; paintPanel(); panel.classList.remove('enter'); void panel.offsetWidth; panel.classList.add('enter'); };
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

  return () => { window.removeEventListener('keydown', onKey); stageWatch.disconnect(); clearInterval(poll); window.removeEventListener('message', onMessage); window.removeEventListener('beforeunload', onLeave); if (saveState !== 'saved') save.flush(); };
}
