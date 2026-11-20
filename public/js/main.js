import { TEMPLATES, createSite, slugify, ICONS } from '/shared/core.js';
import { h, api, go, link, state, toast, thumb, LOGO, svg, ic, fmtDate, addressChecker, showAddress, confirmSheet } from './ui.js';

const root = document.getElementById('app');
let cleanup = null;
const mount = (...nodes) => { root.replaceChildren(...nodes); window.scrollTo(0, 0); };
const title = (t) => { document.title = t ? `${t} · Processor Freedom Sites` : 'Processor Freedom Sites'; };

export function topbar(...right) {
  return h('header', { class: 'top' }, h('div', { class: 'in' },
    link(state.user ? '/app' : '/', { class: 'logo' }, h('span', { html: LOGO }), h('span', {}, 'Processor Freedom ', h('em', {}, 'Sites'))),
    h('nav', {}, ...right)));
}

function accountMenu() {
  const wrap = h('div', { class: 'rel' });
  let menu;
  const close = () => { menu?.remove(); menu = null; document.removeEventListener('click', away); };
  const away = (e) => !wrap.contains(e.target) && close();
  wrap.append(h('button', { class: 'btn soft sm', 'aria-haspopup': 'menu', onclick: () => {
    if (menu) return close();
    menu = h('div', { class: 'menu', role: 'menu' },
      h('div', { style: 'padding:9px 12px' }, h('small', { class: 'muted' }, 'Signed in as'), h('div', { style: 'font-weight:500;overflow-wrap:anywhere' }, state.user.email)),
      state.user.admin && h('button', { onclick: () => { close(); go('/app/admin'); } }, 'Staff tools'),
      h('button', { onclick: async () => { await api('POST', '/api/auth/logout'); state.user = null; go('/'); } }, 'Sign out'));
    wrap.append(menu);
    setTimeout(() => document.addEventListener('click', away));
  } }, state.user.name || 'Account'));
  return wrap;
}

/* ---------- Landing ---------- */

function landing() {
  title('');
  const addr = h('div', { class: 'addr', 'aria-live': 'polite' }, 'Your web address appears as you type.');
  const check = addressChecker((r) => {
    if (!input.value.trim()) return;
    addr.replaceChildren(h('b', {}, r.address), r.available ? ' is available' : ` is taken${r.suggestions[0] ? `. Try ${showAddress(r.suggestions[0])}` : ''}`);
  });
  const input = h('input', { placeholder: 'Your business name', 'aria-label': 'Business name', maxlength: 80, autocomplete: 'organization', oninput: () => {
    const name = input.value.trim();
    if (!name) return addr.replaceChildren('Your web address appears as you type.');
    addr.replaceChildren(h('b', {}, showAddress(slugify(name) || '…')));
    check({ name });
  } });
  const start = (name = input.value.trim(), template = '') => {
    const q = new URLSearchParams();
    if (name) q.set('name', name);
    if (template) q.set('template', template);
    go(`${state.user ? '/app/new' : '/signup'}${q.size ? `?${q}` : ''}`);
  };
  const feature = (icon, t, d) => h('div', {}, h('span', { html: svg(icon, 28) }), h('h3', {}, t), h('p', {}, d));
  const demo = thumb(createSite('Harbor & Vine', 'restaurant'));
  demo.style.aspectRatio = '16/10';

  mount(
    topbar(h('a', { class: 'opt', href: '#templates' }, 'Templates'), h('a', { class: 'opt', href: '#features' }, 'Features'),
      state.user ? link('/app', { class: 'btn sm' }, 'My sites') : [link('/login', {}, 'Sign in'), link('/signup', { class: 'btn sm' }, 'Get started')]),
    h('main', { class: 'page' },
      h('section', { class: 'l-hero' },
        h('p', { class: 'eyebrow' }, 'Websites for Processor Freedom merchants'),
        h('h1', {}, 'Your business, beautifully online.'),
        h('p', { class: 'lede' }, 'Type your business name. Pick a look. Go live. A complete, professional website in the time it takes to make coffee.'),
        h('form', { class: 'namer', onsubmit: (e) => { e.preventDefault(); start(); } },
          h('div', { class: 'box' }, input, h('button', { class: 'btn', type: 'submit' }, 'Start building')),
          addr)),
      h('div', { class: 'l-shot' }, demo),
      h('section', { class: 'l-sec' },
        h('h2', {}, 'Live in three steps.'),
        h('div', { class: 'steps' },
          h('div', {}, h('p', { class: 'n' }, 'Step 1'), h('h3', {}, 'Name it'), h('p', {}, 'Enter your business name and your web address is ready instantly.')),
          h('div', {}, h('p', { class: 'n' }, 'Step 2'), h('h3', {}, 'Make it yours'), h('p', {}, 'Choose a template, add your logo, colours and photos, and edit every word with a live preview.')),
          h('div', {}, h('p', { class: 'n' }, 'Step 3'), h('h3', {}, 'Go live'), h('p', {}, 'One click publishes your site. Connect your own domain whenever you are ready.')))),
      h('section', { class: 'l-sec', id: 'templates' },
        h('h2', {}, 'Start from something great.'),
        h('p', { class: 'sub' }, 'Every template is written and designed for a real kind of business, and fully yours to change.'),
        h('div', { class: 'tgrid' }, TEMPLATES.map((t) => h('button', { class: 'tcard', onclick: () => start(input.value.trim(), t.id) },
          thumb(createSite(input.value.trim() || sampleName(t.id), t.id)), h('b', {}, t.name), h('span', {}, t.blurb))))),
      h('section', { class: 'l-sec', id: 'features' },
        h('h2', {}, 'Everything a business site needs.'),
        h('p', { class: 'sub' }, 'No plugins to install. No code to write. Nothing to maintain.'),
        h('div', { class: 'fgrid' },
          feature(ICONS.sparkle, 'Your brand, everywhere', 'Logo, colours and typeface apply across every page the moment you choose them.'),
          feature('<rect x="7" y="3" width="10" height="18" rx="2.500"/><path d="M11 18h2"/>', 'Perfect on every screen', 'Layouts adapt to phones, tablets and desktops automatically.'),
          feature(ICONS.shield, 'Policies written for you', 'Privacy policy, terms, store policies and an accessibility statement are generated from your details.'),
          feature('<circle cx="12" cy="12" r="8.500"/><path d="M3.500 12h17M12 3.500c2.500 2.500 3.500 5.500 3.500 8.500s-1 6-3.500 8.500c-2.500-2.500-3.500-5.500-3.500-8.500s1-6 3.500-8.500z"/>', 'Your own domain', 'Use the free address, connect a domain you own, or ask us to set one up for you.'),
          feature('<path d="M4 13l2.500-7.500h11L20 13v5a1.500 1.500 0 01-1.500 1.500h-13A1.500 1.500 0 014 18z"/><path d="M4 13h4.500l1 2.500h5l1-2.500H20"/>', 'Messages in one place', 'Enquiries from your contact form arrive in your inbox inside the builder.'),
          feature('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.500-4.500"/>', 'Ready for search', 'Clean markup, descriptions, a sitemap and business details search engines understand.'))),
      h('section', { class: 'l-end' },
        h('h2', {}, 'Ready when you are.'),
        h('div', { style: 'margin-top:30px' }, h('button', { class: 'btn lg', onclick: () => start() }, 'Build your website'))),
      h('footer', { class: 'l-foot' }, h('span', {}, `© ${new Date().getFullYear()} Processor Freedom. All rights reserved.`), h('span', {}, 'Built for merchants.'))));
  if (new URLSearchParams(location.search).get('name')) input.focus();
}

const SAMPLE = { restaurant: 'Harbor & Vine', cafe: 'Morning Ritual', retail: 'Field & Thread', salon: 'Studio Lumen', services: 'Northbridge Advisors', home: 'Summit Home Pros', fitness: 'Form Studio', auto: 'Main Street Auto', simple: 'Your Business' };
export const sampleName = (id) => SAMPLE[id] || 'Your Business';

/* ---------- Sign in / sign up ---------- */

function auth(mode) {
  const signup = mode === 'signup';
  title(signup ? 'Create your account' : 'Sign in');
  const q = location.search;
  const next = () => go(new URLSearchParams(q).has('name') || new URLSearchParams(q).has('template') ? `/app/new${q}` : '/app');
  if (state.user) return next();
  const err = h('p', { class: 'error center', role: 'alert' });
  const f = (label, attrs) => h('label', { class: 'field' }, h('span', {}, label), h('input', attrs));
  const button = h('button', { class: 'btn lg', type: 'submit' }, signup ? 'Create account' : 'Sign in');
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = ''; button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      state.user = (await api('POST', `/api/auth/${signup ? 'signup' : 'login'}`, data)).user;
      next();
    } catch (ex) { err.textContent = ex.message; button.disabled = false; }
  } },
    h('h1', {}, signup ? 'Create your account' : 'Welcome back'),
    h('p', { class: 'sub' }, signup ? 'One account for all of your websites.' : 'Sign in to manage your websites.'),
    signup && f('Your name', { name: 'name', autocomplete: 'name', required: true, maxlength: 80, autofocus: true }),
    f('Email', { name: 'email', type: 'email', autocomplete: 'email', required: true, autofocus: !signup }),
    f(signup ? 'Create a password' : 'Password', { name: 'password', type: 'password', autocomplete: signup ? 'new-password' : 'current-password', required: true, minlength: signup ? 8 : 1 }),
    signup && h('p', { class: 'hint', style: 'margin-top:-8px' }, 'At least 8 characters.'),
    err, button,
    h('p', { class: 'center muted' }, signup ? 'Already have an account? ' : 'New here? ', link(`${signup ? '/login' : '/signup'}${q}`, {}, signup ? 'Sign in' : 'Create an account')));
  mount(topbar(), h('main', { class: 'auth' }, form));
}

/* ---------- Dashboard ---------- */

async function dashboard() {
  title('My sites');
  mount(topbar(accountMenu()), h('div', { class: 'loading' }, h('div', { class: 'spinner' })));
  const { sites } = await api('GET', '/api/sites');
  const card = (s) => h('article', { class: 'scard' },
    Object.assign(thumb(s.draft), { onclick: () => go(`/app/site/${s.id}`) }),
    h('div', { class: 'meta' },
      h('div', { class: 'grow' }, h('h3', {}, s.name), s.live ? h('a', { class: 'url', href: s.url, target: '_blank', rel: 'noopener' }, s.url.replace(/^https?:\/\//, '').replace(/\/$/, '')) : h('span', { class: 'url' }, `Edited ${fmtDate(s.updatedAt)}`)),
      h('span', { class: `status ${s.live ? (s.dirty ? 'warn' : 'ok') : ''}` }, s.live ? (s.dirty ? 'Unpublished changes' : 'Live') : 'Draft')),
    h('div', { class: 'row' },
      link(`/app/site/${s.id}`, { class: 'btn sm' }, 'Edit site'),
      s.leads > 0 && link(`/app/site/${s.id}?tab=inbox`, { class: 'btn soft sm' }, `${s.leads} message${s.leads === 1 ? '' : 's'}`),
      h('span', { class: 'grow' }),
      h('button', { class: 'icon-btn', 'aria-label': `Delete ${s.name}`, title: 'Delete site', onclick: async () => {
        if (!await confirmSheet({ title: `Delete ${s.name}?`, text: 'The site, its messages and its web address will be removed. This cannot be undone.', action: 'Delete site', danger: true })) return;
        await api('DELETE', `/api/sites/${s.id}`); toast('Site deleted'); dashboard();
      } }, ic('trash'))));
  mount(topbar(accountMenu()), h('main', { class: 'page dash' },
    h('div', { class: 'dash-head' }, h('h1', {}, 'My sites'), sites.length > 0 && link('/app/new', { class: 'btn' }, ic('plus', 16), 'New site')),
    sites.length
      ? h('div', { class: 'sgrid' }, sites.map(card), h('div', {}, h('button', { class: 'newcard', onclick: () => go('/app/new') }, 'Create another site')))
      : h('div', { class: 'empty' }, h('h2', {}, 'Let’s build your website.'), h('p', {}, 'It takes about two minutes, and you can change everything later.'), link('/app/new', { class: 'btn lg' }, 'Create your site'))));
}

/* ---------- Staff tools ---------- */

async function admin() {
  title('Staff tools');
  const data = await api('GET', '/api/admin');
  const attach = (siteId, suggested = '') => {
    const input = h('input', { class: 'input', value: suggested, placeholder: 'theirbusiness.com', style: 'max-width:240px' });
    return h('form', { class: 'row', onsubmit: async (e) => {
      e.preventDefault();
      try { await api('POST', `/api/admin/sites/${siteId}/domain`, { domain: input.value }); toast('Domain attached and live'); admin(); } catch (ex) { toast(ex.message, true); }
    } }, input, h('button', { class: 'btn sm' }, 'Attach'));
  };
  const open = data.requests.filter((r) => r.status === 'open');
  mount(topbar(link('/app', {}, 'My sites'), accountMenu()), h('main', { class: 'page dash' },
    h('div', { class: 'dash-head' }, h('h1', {}, 'Staff tools')),
    h('div', { class: 'stats' }, [['Accounts', data.stats.users], ['Sites', data.stats.sites], ['Live', data.stats.live], ['Messages', data.stats.leads]].map(([l, n]) => h('div', {}, h('b', {}, n), h('span', { class: 'muted' }, l)))),
    h('h2', { style: 'font-size:24px;margin-bottom:6px' }, 'Domain requests'),
    h('p', { class: 'muted', style: 'margin-bottom:16px' }, `Register the domain, point it at ${state.config.cnameTarget}, then attach it here. The site goes live on it immediately.`),
    open.length ? h('div', { class: 'tscroll' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ['Site', 'Owner', 'Wants', 'Requested', 'Attach'].map((t) => h('th', {}, t)))),
      h('tbody', {}, open.map((r) => h('tr', {}, h('td', {}, r.siteName), h('td', {}, r.owner), h('td', {}, h('b', {}, r.desired), r.note && h('div', { class: 'small muted' }, r.note)), h('td', {}, fmtDate(r.createdAt)), h('td', {}, attach(r.siteId, /\./.test(r.desired) ? r.desired : ''))))))) : h('p', { class: 'note' }, 'No open requests.'),
    h('h2', { style: 'font-size:24px;margin:48px 0 16px' }, 'All sites'),
    h('div', { class: 'tscroll' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ['Site', 'Owner', 'Address', 'Status', 'Messages', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, data.sites.map((s) => h('tr', {}, h('td', {}, h('b', {}, s.name)), h('td', {}, s.owner), h('td', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.customDomain && s.domainVerified ? s.customDomain : s.address)),
        h('td', {}, h('span', { class: `status ${s.live ? 'ok' : ''}` }, s.live ? 'Live' : 'Draft')), h('td', {}, s.leads), h('td', {}, link(`/app/site/${s.id}`, { class: 'btn soft sm' }, 'Open')))))))));
}

/* ---------- Router ---------- */

async function render() {
  cleanup?.(); cleanup = null;
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const needsUser = path.startsWith('/app');
  if (needsUser && !state.user) return go(`/login${location.search}`);
  try {
    let m;
    if (path === '/') landing();
    else if (path === '/login' || path === '/signup') auth(path.slice(1));
    else if (path === '/app') await dashboard();
    else if (path === '/app/admin') await admin();
    else if (path === '/app/new') cleanup = (await import('./wizard.js')).wizard(mount, title);
    else if ((m = path.match(/^\/app\/site\/([\w-]+)$/))) cleanup = await (await import('./editor.js')).editor(m[1], mount, title);
    else go(state.user ? '/app' : '/');
  } catch (e) {
    if (e.status === 401) { state.user = null; return go('/login'); }
    mount(topbar(), h('main', { class: 'page dash' }, h('div', { class: 'empty' }, h('h2', {}, 'Something went wrong.'), h('p', {}, e.message), link(state.user ? '/app' : '/', { class: 'btn' }, 'Go back'))));
  }
}

window.addEventListener('popstate', render);
Promise.all([api('GET', '/api/me'), api('GET', '/api/config')])
  .then(([me, config]) => { state.user = me.user; state.config = config; })
  .catch(() => {})
  .finally(render);
