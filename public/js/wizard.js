import { slugify, cleanSlug } from '/shared/core.js';
import { h, api, go, toast, addressChecker, showAddress } from './ui.js';
import { topbar } from './main.js';

/* One question, then straight into the editor. */
export function wizard(mount, title) {
  title('New site');
  const q = new URLSearchParams(location.search);
  const d = { name: q.get('name') || '', slug: '', edited: false };
  // A style chosen on the home page carries through.
  const style = /^[a-z]{2,20}$/.test(q.get('template') || '') ? q.get('template') : '';
  let found = { slug: '', available: false, problem: '', suggestions: [] };

  const line = h('div', { 'aria-live': 'polite', style: 'min-height:52px' });
  const button = h('button', { class: 'btn lg', type: 'submit' }, 'Create my site');
  const check = addressChecker((r) => { found = r; if (!d.edited) d.slug = r.slug; draw(); });
  function draw() {
    button.disabled = !d.name.trim();
    if (!d.slug) return line.replaceChildren(h('span', { class: 'muted' }, 'Your web address appears as you type.'));
    const known = found.slug === d.slug;
    line.replaceChildren(
      h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('b', { style: 'font-size:17px' }, showAddress(d.slug)), h('span', { class: `status ${known ? (found.available ? 'ok' : 'bad') : ''}` }, !known ? 'Checking…' : found.available ? 'Available' : found.problem)),
      known && !found.available && found.suggestions.length > 0 && h('div', { class: 'row', style: 'flex-wrap:wrap;margin-top:10px' }, h('span', { class: 'small muted' }, 'Try'),
        found.suggestions.map((s) => h('button', { class: 'chip', type: 'button', onclick: () => { d.slug = s; d.edited = true; check({ slug: s, name: d.name }); draw(); } }, showAddress(s)))));
  }
  const input = h('input', { class: 'input lg', value: d.name, placeholder: 'e.g. Los Socios Café', maxlength: 80, autofocus: true, 'aria-label': 'Business name', oninput: () => {
    d.name = input.value;
    if (!d.edited) { d.slug = slugify(d.name); check({ name: d.name }); }
    draw();
  } });
  if (d.name) { d.slug = slugify(d.name); check({ name: d.name }); }
  draw();

  const form = h('form', { class: 'one', onsubmit: async (e) => {
    e.preventDefault();
    if (!d.name.trim()) return;
    button.disabled = true;
    // A short, calm moment while the site is put together.
    const steps = ['Creating your pages', 'Setting up online ordering', 'Writing your policies', 'Getting your address ready'].map((t) => h('li', {}, h('i', { html: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.500 4.500L19 7.500"/></svg>' }), t));
    const veil = h('div', { class: 'building', role: 'status' }, h('div', {}, h('img', { src: '/assets/logo.svg', alt: '' }), h('h2', {}, `Building ${d.name.trim()}`), h('ul', {}, steps)));
    document.body.append(veil);
    steps.forEach((li, i) => setTimeout(() => li.classList.add('on'), 150 + i * 380));
    try {
      const [{ site }] = await Promise.all([api('POST', '/api/sites', { name: d.name, slug: cleanSlug(d.slug), ...(style && style !== 'order' ? { template: style } : { template: 'order', kind: 'ordering' }) }), new Promise((r) => setTimeout(r, 1900))]);
      go(`/app/site/${site.id}`);
      setTimeout(() => veil.remove(), 250);
    } catch (ex) { veil.remove(); toast(ex.message, true); button.disabled = false; }
  } },
    h('img', { class: 'mark', src: '/assets/logo.svg', alt: '' }),
    h('h1', {}, 'What’s your business called?'),
    h('p', { class: 'sub' }, 'That’s all we need to start. You’ll add your menu, logo and details on the next screen, and nothing goes live until you publish.'),
    input, line,
    h('div', { class: 'row' }, button, h('button', { type: 'button', class: 'btn soft lg', onclick: () => go('/app') }, 'Cancel')));

  mount(topbar(), h('main', { class: 'one-wrap' }, form));
  input.focus();
  return () => {};
}
