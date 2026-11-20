import { TEMPLATES, ACCENTS, FONTS, createSite, getTemplate, slugify, cleanSlug } from '/shared/core.js';
import { h, api, go, state, toast, thumb, ic, addressChecker, showAddress } from './ui.js';
import { topbar, sampleName } from './main.js';

export function wizard(mount, title) {
  title('New site');
  const q = new URLSearchParams(location.search);
  const d = {
    name: q.get('name') || '', slug: '', slugEdited: false, template: q.get('template') || '', accent: '', font: '', mode: 'light',
    email: state.user.email, phone: '', address1: '', city: '', state: '', zip: '',
  };
  let step = 0;
  let addrState = { available: false, problem: '', suggestions: [] };
  const STEPS = ['name', 'template', 'style', 'details'];

  const tpl = () => getTemplate(d.template || 'restaurant');
  const sample = () => createSite(d.name.trim() || sampleName(tpl().id), tpl().id, { ...d, accent: d.accent || tpl().accent, font: d.font || tpl().font });
  const side = thumb(sample());
  const repaint = () => side.paint(sample());

  const main = h('div', { class: 'wiz-main' });
  const foot = h('div', { class: 'wiz-foot' });
  const shell = h('div', { class: 'wiz' }, main, h('aside', { class: 'wiz-side' }, side));

  const check = addressChecker((r) => { addrState = r; if (!d.slugEdited) d.slug = r.slug; paintAddr(); });
  let addrLine = h('div');
  function paintAddr() {
    const slug = d.slug;
    if (!slug) return addrLine.replaceChildren(h('span', { class: 'muted' }, 'Your web address appears as you type.'));
    addrLine.replaceChildren(
      h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('b', { style: 'font-size:17px' }, showAddress(slug)),
        h('span', { class: `status ${addrState.slug === slug ? (addrState.available ? 'ok' : 'bad') : ''}` }, addrState.slug !== slug ? 'Checking…' : addrState.available ? 'Available' : addrState.problem)),
      addrState.slug === slug && !addrState.available && addrState.suggestions.length > 0 && h('div', { class: 'row', style: 'flex-wrap:wrap;margin-top:10px' }, h('span', { class: 'small muted' }, 'Try'),
        addrState.suggestions.map((s) => h('button', { class: 'chip', type: 'button', onclick: () => { d.slug = s; d.slugEdited = true; check({ slug: s, name: d.name }); paintAddr(); } }, showAddress(s)))));
  }

  const field = (label, key, attrs = {}) => h('label', { class: 'field' }, h('span', {}, label), h('input', { value: d[key], oninput: (e) => { d[key] = e.target.value; repaint(); }, ...attrs }));
  const seg = (options, get, set) => { const el = h('div', { class: 'seg' }); const draw = () => el.replaceChildren(...options.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(get() === v), onclick: () => { set(v); draw(); repaint(); } }, l))); draw(); return el; };

  const views = {
    name() {
      addrLine = h('div', { 'aria-live': 'polite', style: 'min-height:48px' });
      paintAddr();
      const input = h('input', { class: 'input lg', value: d.name, placeholder: 'e.g. Los Socios Café', maxlength: 80, autofocus: true, 'aria-label': 'Business name', oninput: () => {
        d.name = input.value;
        if (!d.slugEdited) { d.slug = slugify(d.name); check({ name: d.name }); }
        paintAddr(); repaint(); paintFoot();
      } });
      if (d.name && !d.slug) { d.slug = slugify(d.name); check({ name: d.name }); paintAddr(); }
      return [h('h1', {}, 'What’s your business called?'), h('p', { class: 'sub' }, 'We’ll use it across your site and to create your web address.'), h('div', { class: 'stack' }, input, addrLine)];
    },
    template() {
      const grid = h('div', { class: 'pick' });
      const draw = () => grid.replaceChildren(...TEMPLATES.map((t) => h('button', { type: 'button', 'aria-pressed': String(d.template === t.id), onclick: () => { d.template = t.id; d.accent = ''; d.font = ''; draw(); repaint(); paintFoot(); } },
        thumb(createSite(d.name.trim() || sampleName(t.id), t.id)), h('b', {}, t.name), h('span', {}, t.blurb))));
      draw();
      return [h('h1', {}, 'Choose a starting point.'), h('p', { class: 'sub' }, 'Each one comes with pages, sections and wording written for that kind of business. Everything can be changed.'), grid];
    },
    style() {
      const sw = h('div', { class: 'swatches' });
      const cur = () => d.accent || tpl().accent;
      const draw = () => sw.replaceChildren(...ACCENTS.map((a) => h('button', { type: 'button', class: 'swatch', style: `background:${a.value}`, title: a.name, 'aria-label': a.name, 'aria-pressed': String(cur().toLowerCase() === a.value), onclick: () => { d.accent = a.value; draw(); repaint(); } })),
        h('label', { class: 'swatch custom', title: 'Custom colour' }, h('input', { type: 'color', value: cur(), 'aria-label': 'Custom colour', oninput: (e) => { d.accent = e.target.value; repaint(); }, onchange: draw })));
      draw();
      return [h('h1', {}, 'Make it look like you.'), h('p', { class: 'sub' }, 'Pick a brand colour and a typeface. You can upload your logo in the next step.'),
        h('div', { class: 'stack', style: 'gap:28px' },
          h('div', { class: 'field' }, h('span', {}, 'Brand colour'), sw),
          h('div', { class: 'field' }, h('span', {}, 'Typeface'), seg(Object.entries(FONTS).map(([k, f]) => [k, f.name]), () => d.font || tpl().font, (v) => { d.font = v; })),
          h('div', { class: 'field' }, h('span', {}, 'Appearance'), seg([['light', 'Light'], ['dark', 'Dark']], () => d.mode, (v) => { d.mode = v; })))];
    },
    details() {
      return [h('h1', {}, 'How can customers reach you?'), h('p', { class: 'sub' }, 'These appear in your contact section, footer and policies. Skip anything you don’t have yet.'),
        h('div', { class: 'stack' },
          h('div', { class: 'pair' }, field('Email', 'email', { type: 'email', autocomplete: 'email' }), field('Phone', 'phone', { type: 'tel', autocomplete: 'tel', placeholder: '(555) 123-4567' })),
          field('Street address', 'address1', { autocomplete: 'address-line1' }),
          h('div', { class: 'pair' }, field('City', 'city', { autocomplete: 'address-level2' }), h('div', { class: 'pair' }, field('State', 'state', { autocomplete: 'address-level1', maxlength: 30 }), field('ZIP', 'zip', { autocomplete: 'postal-code', maxlength: 12 }))))];
    },
  };

  const canContinue = () => (step === 0 ? d.name.trim().length > 0 : step === 1 ? !!d.template : true);
  async function create(btn) {
    btn.disabled = true; btn.textContent = 'Building your site…';
    try {
      const { site } = await api('POST', '/api/sites', { ...d, slug: cleanSlug(d.slug), accent: d.accent || tpl().accent, font: d.font || tpl().font });
      toast('Your site is ready. Make it yours, then publish.');
      go(`/app/site/${site.id}`);
    } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = 'Create my site'; }
  }
  function paintFoot() {
    const last = step === STEPS.length - 1;
    const next = h('button', { class: 'btn lg', disabled: !canContinue(), onclick: () => (last ? create(next) : show(step + 1)) }, last ? 'Create my site' : 'Continue');
    foot.replaceChildren(step ? h('button', { class: 'btn soft', onclick: () => show(step - 1) }, 'Back') : h('button', { class: 'btn soft', onclick: () => go('/app') }, 'Cancel'), next);
  }
  function show(n) {
    step = n;
    shell.classList.toggle('wide', STEPS[step] === 'template');
    main.replaceChildren(h('div', { class: 'dots', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': STEPS.length, 'aria-valuenow': step + 1, 'aria-label': `Step ${step + 1} of ${STEPS.length}` }, STEPS.map((_, i) => h('i', { class: i <= step ? 'on' : '' }))),
      h('form', { onsubmit: (e) => { e.preventDefault(); if (canContinue()) foot.lastChild.click(); } }, views[STEPS[step]](), h('button', { type: 'submit', class: 'hide' })));
    paintFoot(); repaint();
    main.querySelector('[autofocus]')?.focus();
    window.scrollTo(0, 0);
  }

  mount(topbar(), shell, foot);
  show(0);
  return () => {};
}
