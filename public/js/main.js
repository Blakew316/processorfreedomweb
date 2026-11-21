import { TEMPLATES, createSite, slugify, ICONS, parseMenuCsv, MENU_TEMPLATE_CSV, defaultOrdering, money, ORDER_METHODS, ORDER_STATUSES } from '/shared/core.js';
import { h, api, go, link, state, toast, thumb, LOGO, svg, ic, fmtDate, addressChecker, showAddress, confirmSheet, sheet, ION, themeButton, getTheme, setTheme, labelTables, canOfferInstall, installApp } from './ui.js';

const root = document.getElementById('app');
let cleanup = null;
const mount = (...nodes) => { root.replaceChildren(...nodes); window.scrollTo(0, 0); };
// The browser tab always carries our name and nothing else.
const title = () => { document.title = 'Processor Freedom'; };

export function topbar(...right) {
  // Inside the app the brand sits in the middle, the same as in the back office.
  const inApp = location.pathname.startsWith('/app');
  return h('header', { class: `top${inApp ? ' app' : ''}` }, h('div', { class: 'in' },
    inApp ? link('/app', { class: 'logo mid' }, h('img', { src: '/assets/icon-192.png', alt: '', width: 30, height: 30 }), h('span', {}, 'PF Sites'))
      : link(state.user ? '/app' : '/', { class: 'logo' }, h('span', { html: LOGO }), h('span', {}, 'Processor Freedom ', h('em', {}, 'Sites'))),
    h('nav', {}, ...right, themeButton())));
}

function changePassword() {
  sheet((close) => {
    const err = h('p', { class: 'error', role: 'alert' });
    const f = (label, name, ac) => h('label', { class: 'field' }, h('span', {}, label), h('input', { name, type: 'password', autocomplete: ac, required: true, minlength: name === 'next' ? 8 : 1 }));
    const form = h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      try { await api('POST', '/api/auth/password', Object.fromEntries(new FormData(form))); close(); toast('Password updated'); } catch (ex) { err.textContent = ex.message; }
    } }, f('Current password', 'current', 'current-password'), f('New password', 'next', 'new-password'), h('p', { class: 'hint' }, 'At least 8 characters.'), err,
      h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn soft', onclick: close }, 'Cancel'), h('button', { class: 'btn' }, 'Update password')));
    return [h('h2', {}, 'Change password'), form];
  });
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
      state.user.admin && h('button', { onclick: () => { close(); go('/app/admin'); } }, 'Staff dashboard'),
      h('button', { onclick: () => { close(); changePassword(); } }, 'Change password'),
      h('div', { style: 'padding:8px 12px 10px' }, h('small', { class: 'muted' }, 'Appearance'), h('div', { class: 'seg', style: 'margin-top:6px' }, [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']].map(([k, l]) => h('button', { 'aria-pressed': String(getTheme() === k), onclick: () => { setTheme(k); close(); } }, l)))),
      canOfferInstall() && h('button', { onclick: () => { close(); installApp(); } }, 'Install app'),
      h('button', { onclick: async () => { await api('POST', '/api/auth/logout'); state.user = null; go('/'); } }, 'Sign out'),
      h('button', { onclick: async () => { close(); if (!await confirmSheet({ title: 'Sign out everywhere?', text: 'This signs your account out on every phone, tablet and computer, including this one. Use it if a device was lost or shared.', action: 'Sign out everywhere' })) return; await api('POST', '/api/auth/logout-all'); state.user = null; go('/login'); } }, 'Sign out everywhere'));
    wrap.append(menu);
    setTimeout(() => document.addEventListener('click', away));
  } }, state.user.name || 'Account'));
  return wrap;
}

/* ---------- Landing ---------- */

const DEMO_MENU = parseMenuCsv(MENU_TEMPLATE_CSV).items.map((x, i) => ({ ...x, id: `d${i}` }));
const DEMO_ORDERING = { ...defaultOrdering(), enabled: true, methods: { pickup: true, curbside: true, delivery: true } };
const tile = (color, icon, size = 22) => h('span', { class: 'itile', style: `--c:${color}`, html: svg(icon, size) });
const I = { bag: ION.bag, list: ION.menu, globe: ION.globe, inbox: ION.inbox, search: ION.search, brush: ION.brush, mail: ION.mail, check: ION.check, person: ION.person, cash: ION.cash, items: ION.list };

function landing() {
  title('');
  const addr = h('div', { class: 'addr', 'aria-live': 'polite' }, 'Your web address appears as you type.');
  const check = addressChecker((r) => {
    if (!input.value.trim()) return;
    addr.replaceChildren(h('b', {}, r.address), r.available ? ' is available' : ` is taken${r.suggestions[0] ? `. Try ${showAddress(r.suggestions[0])}` : ''}`);
  });
  // The preview below becomes the visitor's own business as they type.
  let liveT = 0;
  const showName = (name) => { clearTimeout(liveT); liveT = setTimeout(() => { const made = heroSite(name || 'Harbor & Vine'); desk.paint(made); phone.paint(made); barUrl.textContent = `${slugify(name || 'Harbor & Vine') || 'yourbusiness'}.com`; }, 220); };
  const input = h('input', { placeholder: 'Your business name', 'aria-label': 'Business name', maxlength: 80, autocomplete: 'organization', oninput: () => {
    const name = input.value.trim();
    showName(name);
    if (!name) return addr.replaceChildren('Your web address appears as you type.');
    addr.replaceChildren(h('b', {}, showAddress(slugify(name) || '…')));
    check({ name });
  } });
  const start = (name = input.value.trim()) => {
    const q = new URLSearchParams();
    if (name) q.set('name', name);
    go(`${state.user ? '/app/new' : '/signup'}${q.size ? `?${q}` : ''}`);
  };

  const heroSite = (name) => { const made = createSite(name, 'order', { kind: 'ordering', accent: '#0a1f44' }); for (const sec of made.sections) if (sec.type === 'hero') { sec.data.image = '/assets/demo/restaurant-3.jpg'; sec.data.layout = 'split'; } return made; };
  const demoSite = heroSite('Harbor & Vine');
  const desk = thumb(demoSite, 'home', { menu: DEMO_MENU, ordering: DEMO_ORDERING });
  const phone = thumb(demoSite, 'order', { menu: DEMO_MENU, ordering: DEMO_ORDERING }, { w: 390, h: 800 });
  const chip = (cls, ...kids) => h('div', { class: `float ${cls}` }, ...kids);
  const bento = (cls, color, icon, t, d, extra) => h('div', { class: `bento ${cls} reveal` }, tile(color, icon), h('h3', {}, t), h('p', {}, d), extra);
  const tick = (t) => h('span', {}, h('i', { html: svg(I.check, 14) }), t);
  /* The banner film: silent, looping, behind the headline. A still shows first, and stays for anyone who prefers no motion or is saving data. */
  const heroVideo = () => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData;
    const film = !still && h('video', { class: 'hero-film', poster: '/assets/demo/hero.jpg', muted: true, loop: true, autoplay: true, playsinline: true, preload: 'metadata', 'aria-hidden': 'true', tabindex: '-1', disablepictureinpicture: true },
      h('source', { src: '/assets/demo/hero-720.mp4', type: 'video/mp4', media: '(max-width: 900px)' }), h('source', { src: '/assets/demo/hero-1080.mp4', type: 'video/mp4' }));
    if (film) { film.muted = true; film.defaultMuted = true; film.loop = true; film.setAttribute('muted', ''); film.setAttribute('playsinline', ''); film.setAttribute('webkit-playsinline', '');
      const go = () => film.play().catch(() => {}); film.addEventListener('canplay', go, { once: true }); film.addEventListener('ended', () => { film.currentTime = 0; go(); }); document.addEventListener('visibilitychange', () => { if (!document.hidden && film.isConnected) go(); }); }
    return h('div', { class: 'hero-bg', 'aria-hidden': 'true' }, film || h('img', { class: 'hero-film', src: '/assets/demo/hero.jpg', alt: '' }), h('i'));
  };
  const barUrl = h('span', {}, 'harborandvine.com');

  /* Real sites, drawn live from the same templates people start with. */
  // Each example is dressed the way a real owner would: a photo up top, more through the page.
  const PHOTOS = { restaurant: 3, cafe: 3, retail: 2, salon: 3, services: 3, home: 3, fitness: 2, auto: 2, order: 2, simple: 1 };
  const LAYOUT = { restaurant: 'cover', cafe: 'split', retail: 'cover', salon: 'split', services: 'split', home: 'cover', fitness: 'cover', auto: 'split', order: 'cover', simple: 'cover' };
  const DARK = new Set(['fitness', 'auto']);
  const dress = (site, id) => {
    const pic = (n) => `/assets/demo/${id}${n > 1 ? `-${n}` : ''}.jpg`, count = PHOTOS[id] || 0;
    if (!count) return site;
    for (const sec of site.sections) {
      if (sec.type === 'hero') { sec.data.image = pic(1); sec.data.layout = LAYOUT[id] || 'cover'; }
      if (sec.type === 'about' && count > 1) sec.data.image = pic(2);
      if (sec.type === 'gallery' && count > 1) { sec.enabled = true; sec.data.images = Array.from({ length: count }, (_, i) => ({ src: pic(count - i), alt: '' })); }
    }
    return site;
  };
  const example = (id, name = sampleName(id)) => dress(createSite(name, id, { ...(id === 'order' ? { kind: 'ordering' } : {}), ...(DARK.has(id) ? { mode: 'dark' } : {}) }), id);
  const extraFor = (id) => (id === 'order' ? { menu: DEMO_MENU, ordering: DEMO_ORDERING } : {});
  const card = (id) => { const t = TEMPLATES.find((x) => x.id === id); return h('button', { class: 'show-card', type: 'button', 'aria-label': `${sampleName(id)}, ${t.name}. Use this style`, onclick: () => startWith(id) },
    h('div', { class: 'bar' }, h('i'), h('i'), h('i'), h('span', {}, `${slugify(sampleName(id))}.com`)), thumb(example(id), 'home', extraFor(id), { w: 1280, h: 800 }),
    h('div', { class: 'cap' }, h('b', {}, sampleName(id)), h('span', {}, t.name))); };
  const rowA = ['restaurant', 'fitness', 'salon', 'retail', 'home'], rowB = ['cafe', 'auto', 'order', 'services', 'simple'];

  const startWith = (id) => { const q = new URLSearchParams({ template: id }); if (input.value.trim()) q.set('name', input.value.trim()); go(`${state.user ? '/app/new' : '/signup'}?${q}`); };

  /* One benefit: what it does for the business on one side, a look at it on the other. */
  const gain = (num, headline, body, art, flip, photo) => h('div', { class: `gain reveal${flip ? ' flip' : ''}` },
    h('div', { class: 'gain-copy' }, h('span', { class: 'gain-num', 'aria-hidden': 'true' }, num), h('h3', {}, headline), h('p', {}, body)),
    h('div', { class: 'gain-art', style: `--photo:url(/assets/demo/${photo}.jpg)` }, art()));
  const endInput = h('input', { placeholder: 'Your business name', 'aria-label': 'Business name', maxlength: 80, autocomplete: 'organization' });
  const pill = (t, cls = '') => h('i', { class: `st ${cls}` }, t);
  const mockOrders = () => office;
  const mockInvoice = () => h('div', { class: 'mock inv-mock' },
    h('div', { class: 'mk-head' }, h('div', {}, h('small', {}, 'Invoice'), h('b', {}, 'INV-1018')), pill('Paid', 'ready')),
    h('div', { class: 'mk-to' }, h('small', {}, 'Bill to'), h('b', {}, 'Acme Co'), h('span', {}, 'Office lunch for 40')),
    [['Taco trays × 4', '$640.00'], ['Drinks × 40', '$120.00'], ['Delivery', '$40.00']].map(([n, v]) => h('div', { class: 'mk-line' }, h('span', {}, n), h('span', {}, v))),
    h('div', { class: 'mk-line total' }, h('span', {}, 'Total'), h('b', { 'data-count': '$864.00' }, '$864.00')),
    h('div', { class: 'mk-foot' }, h('i', { html: svg(I.check, 14) }), 'Opened Tuesday 9:14 AM · Paid Wednesday'));
  const mockLoyalty = () => h('div', { class: 'mock loyal-mock' },
    h('div', { class: 'gcard' }, h('small', {}, 'Gift card'), h('b', { 'data-count': '$50.00' }, '$50.00'), h('span', {}, 'Harbor & Vine'), h('u', {}, 'HV-7K2M-9QX4')),
    h('div', { class: 'stamps-mock' }, h('div', {}, h('b', {}, 'Ana Ruiz'), h('span', {}, '9 orders · favourite: Taco al pastor')), h('div', { class: 'dots' }, Array.from({ length: 10 }, (_, i) => h('i', { class: i < 9 ? 'on' : '' })))),
    h('div', { class: 'mk-foot' }, h('i', { html: svg(I.check, 14) }), 'One more order and the next one is on the house'));

  /* The back office, shown with believable numbers. */
  const stat = (label, value, note) => h('div', { class: 'bo-kpi' }, h('small', {}, label), h('b', { 'data-count': value }, value), h('span', {}, note));
  const orderRow = (n, who, what, state) => h('div', { class: 'bo-row' }, h('b', {}, `#${n}`), h('span', {}, who), h('em', {}, what), h('i', { class: `st ${state[1]}` }, state[0]));
  const office = h('div', { class: 'bo reveal' },
    h('div', { class: 'bo-main' },
      h('div', { class: 'bo-head' }, h('b', {}, 'Today'), h('span', {}, 'Harbor & Vine')),
      h('div', { class: 'bo-kpis' }, stat('Sales', '$1,284.50', '+12% on last week'), stat('Orders', '37', '5 waiting'), stat('Average order', '$34.72', 'per ticket')),
      h('div', { class: 'bo-chart', 'aria-hidden': 'true' }, [34, 52, 41, 68, 59, 86, 74].map((v, i) => h('i', { style: `--h:${v}%;--d:${i * 70}ms` }, h('u', {}, 'SMTWTFS'[i])))),
      h('div', { class: 'bo-list' }, orderRow(1042, 'Ana Ruiz', 'Pickup · 3 items', ['New', 'new']), orderRow(1041, 'James T.', 'Delivery · 5 items', ['Confirmed', 'ok']), orderRow(1040, 'Maria S.', 'Curbside · 2 items', ['Ready', 'ready']))),
    h('div', { class: 'bo-side' },
      h('div', { class: 'bo-chip' }, tile('', I.mail, 18), h('div', {}, h('b', {}, 'Invoice INV-1018 paid'), h('span', {}, 'Acme Co · $864.00'))),
      h('div', { class: 'bo-chip' }, tile('', ION.clock || I.list, 18), h('div', {}, h('b', {}, 'Table for 4 · 7:30 PM'), h('span', {}, 'Booking request'))),
      h('div', { class: 'bo-chip' }, tile('', I.cash, 18), h('div', {}, h('b', {}, 'Gift card · $50.00'), h('span', {}, 'Sent to gia@example.com'))),
      h('div', { class: 'bo-chip' }, tile('', I.person, 18), h('div', {}, h('b', {}, '212 customers'), h('span', {}, '38 regulars this month')))));

  mount(
    topbar(h('a', { class: 'opt', href: '#examples' }, 'Examples'), h('a', { class: 'opt', href: '#features' }, 'Why PF Sites'),
      state.user ? link('/app', { class: 'btn sm' }, 'My sites') : [link('/login', {}, 'Sign in'), link('/signup', { class: 'btn sm' }, 'Get started')]),
    h('main', { class: 'film-main' },
      h('section', { class: 'l-hero has-video' }, heroVideo(), h('div', { class: 'page' },
        h('h1', {}, 'Your business, ', h('span', { class: 'grad' }, 'beautifully online.')),
        h('div', { class: 'ticks' }, tick('No code'), tick('Live in minutes'), tick('Pickup, curbside and delivery'), tick('Your own domain')),
        h('div', { class: 'stage' },
          h('div', { class: 'browser' }, h('div', { class: 'bar' }, h('i'), h('i'), h('i'), barUrl), desk),
          h('div', { class: 'phone' }, phone),
          chip('f1', tile('', I.bag, 18), h('div', {}, h('b', {}, 'New order #1042'), h('span', {}, 'Pickup · 3 items · $27.03'))),
          chip('f2', h('i', { class: 'live' }), h('div', {}, h('b', {}, 'You’re live'), h('span', {}, 'Published just now'))),
          chip('f3', tile('', I.list, 18), h('div', {}, h('b', {}, '48 items imported'), h('span', {}, 'menu.csv')))))),

      h('section', { class: 'l-sec l-show', id: 'examples' },
        h('div', { class: 'page' }, h('p', { class: 'kicker' }, 'Examples'), h('h2', {}, 'One builder. Any kind of business.'),
          h('p', { class: 'sub' }, 'Restaurants, salons, shops, gyms, garages. Tap any site to start from it.')),
        h('div', { class: 'show', 'aria-label': 'Example websites' }, h('div', { class: 'show-row a' }, rowA.map(card)), h('div', { class: 'show-row b' }, rowB.map(card)))),

      h('div', { class: 'ticker', 'aria-hidden': 'true' }, h('div', { class: 'ticker-in' }, [0, 1].map(() => h('span', {}, ['Restaurants', 'Cafés', 'Salons', 'Boutiques', 'Gyms', 'Garages', 'Studios', 'Food trucks', 'Bakeries', 'Contractors'].flatMap((w) => [w, h('i', {}, '✦')]))))),

      h('section', { class: 'l-sec l-gains', id: 'features' }, h('div', { class: 'page' },
        h('p', { class: 'kicker' }, 'Why it pays for itself'), h('h2', {}, 'Three things it does for your business.'),
        gain('01', 'More orders. Fewer phone calls.', 'Customers order straight from your own site, day or night, and you keep the whole ticket.', mockOrders, false, 'restaurant'),
        gain('02', 'Get paid faster.', 'Send a clean invoice in a minute and see the moment it is opened and paid.', mockInvoice, true, 'services-3'),
        gain('03', 'Customers who come back.', 'Rewards and gift cards are built in, so a first visit turns into a habit.', mockLoyalty, false, 'cafe-2'))),

      h('section', { class: 'page' }, h('div', { class: 'l-close reveal' },
        h('div', { class: 'l-close-copy' },
          h('img', { src: '/assets/icon-192.png', alt: '', width: 56, height: 56 }),
          h('h2', {}, 'Open for business online, this afternoon.'),
          h('p', {}, 'Name it, add your menu, publish. Nothing is public until you say so.'),
          h('form', { class: 'namer', onsubmit: (e) => { e.preventDefault(); start(endInput.value.trim() || input.value.trim()); } }, h('div', { class: 'box' }, endInput, h('button', { class: 'btn', type: 'submit' }, 'Build my website')))),
        h('div', { class: 'l-close-art', 'aria-hidden': 'true' }))),
      h('footer', { class: 'page' }, h('div', { class: 'l-foot' }, h('span', {}, `© ${new Date().getFullYear()} Processor Freedom. All rights reserved.`), h('span', {}, 'Their software. Your processor.')))));

  // Numbers run up to their value the first time they come into view.
  const countUp = (el) => { const full = el.dataset.count, m = full.match(/^(\D*)([\d,]+)(\.\d+)?(.*)$/); if (!m || matchMedia('(prefers-reduced-motion: reduce)').matches) return; const end = Number((m[2] + (m[3] || '')).replace(/,/g, '')), dec = m[3] ? m[3].length - 1 : 0, t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 1100), v = end * (1 - Math.pow(1 - k, 3)); el.textContent = k === 1 ? full : `${m[1]}${v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${m[4]}`; if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); e.target.querySelectorAll('[data-count]').forEach(countUp); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  // Over the film the top bar is clear glass; once the page scrolls past it, it turns solid.
  const bar = document.querySelector('header.top'); bar?.classList.add('glass-bar'); const onScroll = () => bar?.classList.toggle('over-film', window.scrollY < 520 && location.pathname === '/');
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  // The example rows only drift while they are on screen.
  const show = document.querySelector('.show');
  if (show) new IntersectionObserver((es) => es.forEach((e) => show.classList.toggle('run', e.isIntersecting)), { rootMargin: '200px' }).observe(show);
}

const SAMPLE = { order: 'Corner Taqueria', restaurant: 'Harbor & Vine', cafe: 'Morning Ritual', retail: 'Field & Thread', salon: 'Studio Lumen', services: 'Northbridge Advisors', home: 'Summit Home Pros', fitness: 'Form Studio', auto: 'Main Street Auto', simple: 'Oak & Ember' };
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
    h('p', { class: 'sub' }, signup ? 'Then name your business and start building.' : 'Sign in to manage your site and orders.'),
    signup && f('Your name', { name: 'name', autocomplete: 'name', required: true, maxlength: 80, autofocus: true }),
    f('Email', { name: 'email', type: 'email', autocomplete: 'email', required: true, autofocus: !signup }),
    f(signup ? 'Create a password' : 'Password', { name: 'password', type: 'password', autocomplete: signup ? 'new-password' : 'current-password', required: true, minlength: signup ? 8 : 1 }),
    signup && h('p', { class: 'hint', style: 'margin-top:-8px' }, 'At least 8 characters.'),
    !signup && h('p', { class: 'small', style: 'margin-top:-8px' }, link('/forgot', {}, 'Forgot your password?')),
    err, button,
    h('p', { class: 'center muted' }, signup ? 'Already have an account? ' : 'New here? ', link(`${signup ? '/login' : '/signup'}${q}`, {}, signup ? 'Sign in' : 'Create an account')));
  mount(topbar(), h('main', { class: 'auth' }, h('div', { class: 'auth-card' }, form,
    h('aside', { class: 'auth-side' }, h('img', { src: '/assets/logo.png', alt: '', width: 48, height: 48 }),
      h('h2', {}, 'A website and online ordering, live in minutes.'),
      h('ul', {}, ['Menu built from your Excel or CSV file', 'Pickup, curbside and delivery', 'Your logo, colours and domain', 'Publish with one click'].map((t) => h('li', {}, h('i', { html: svg('<path d="M5 12.500l4.500 4.500L19 7.500"/>', 14) }), t)))))));
}

function forgot() {
  title('Reset password');
  const done = h('div', {});
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    try {
      const r = await api('POST', '/api/auth/forgot', Object.fromEntries(new FormData(form)));
      form.replaceChildren(h('h1', {}, 'Check your email'), h('p', { class: 'sub' }, r.emailEnabled ? 'If an account exists for that address, a reset link is on its way. It works once and expires in 2 hours.' : 'Email is not switched on for this service yet, so no link could be sent. Contact Processor Freedom and we will send you a reset link directly.'), link('/login', { class: 'btn lg' }, 'Back to sign in'));
    } catch (ex) { done.replaceChildren(h('p', { class: 'error', role: 'alert' }, ex.message)); }
  } }, h('h1', {}, 'Reset your password'), h('p', { class: 'sub' }, 'Enter your email and we will send you a link.'),
    h('label', { class: 'field' }, h('span', {}, 'Email'), h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true, autofocus: true })), done,
    h('button', { class: 'btn lg', type: 'submit' }, 'Send reset link'), h('p', { class: 'center muted' }, link('/login', {}, 'Back to sign in')));
  mount(topbar(), h('main', { class: 'auth' }, h('div', { class: 'auth-card', style: 'grid-template-columns:1fr;max-width:460px' }, form)));
}

function reset() {
  title('Choose a new password');
  const token = new URLSearchParams(location.search).get('token') || '';
  const err = h('p', { class: 'error', role: 'alert' });
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    try { state.user = (await api('POST', '/api/auth/reset', { token, password: new FormData(form).get('password') })).user; toast('Password updated'); go('/app'); } catch (ex) { err.textContent = ex.message; }
  } }, h('h1', {}, 'Choose a new password'), h('p', { class: 'sub' }, 'You will be signed in straight away.'),
    h('label', { class: 'field' }, h('span', {}, 'New password'), h('input', { name: 'password', type: 'password', autocomplete: 'new-password', required: true, minlength: 8, autofocus: true })), h('p', { class: 'hint', style: 'margin-top:-8px' }, 'At least 8 characters.'), err,
    h('button', { class: 'btn lg', type: 'submit' }, 'Save password'));
  mount(topbar(), h('main', { class: 'auth' }, h('div', { class: 'auth-card', style: 'grid-template-columns:1fr;max-width:460px' }, form)));
}

/* ---------- Dashboard ---------- */

async function dashboard() {
  title('My sites');
  mount(topbar(accountMenu()), h('main', { class: 'page dash' }, h('div', { class: 'dash-head' }, h('h1', {}, 'My sites')), h('div', { class: 'sgrid', 'aria-busy': 'true' }, Array.from({ length: 3 }, () => h('div', { class: 'skel sk-site' })))));
  const { sites } = await api('GET', '/api/sites');
  const ROLE = { manager: 'Manager', kitchen: 'Kitchen' };
  const card = (s) => h('article', { class: 'scard' },
    Object.assign(thumb(s.draft, 'home', { menu: s.menu, ordering: s.ordering }), { onclick: () => go(s.role === 'kitchen' ? `/app/site/${s.id}/kitchen` : `/app/site/${s.id}`) }),
    h('div', { class: 'meta' },
      h('div', { class: 'grow' }, h('h3', {}, s.name), s.live ? h('a', { class: 'url', href: s.url, target: '_blank', rel: 'noopener' }, s.url.replace(/^https?:\/\//, '').replace(/\/$/, '')) : h('span', { class: 'url' }, `Edited ${fmtDate(s.updatedAt)}`)),
      ROLE[s.role] ? h('span', { class: 'status' }, `${ROLE[s.role]} login`) : h('span', { class: `status ${s.live ? (s.dirty ? 'warn' : 'ok') : ''}` }, s.live ? (s.dirty ? 'Unpublished changes' : 'Live') : 'Draft')),
    s.role === 'kitchen' ? h('div', { class: 'row' }, link(`/app/site/${s.id}/kitchen`, { class: 'btn sm' }, 'Open kitchen screen'), s.newOrders > 0 && h('span', { class: 'status warn' }, `${s.newOrders} new order${s.newOrders === 1 ? '' : 's'}`))
    : h('div', { class: 'row' },
      link(`/app/site/${s.id}`, { class: 'btn sm' }, 'Edit site'),
      s.leads > 0 && link(`/app/site/${s.id}?tab=inbox`, { class: 'btn soft sm' }, `${s.leads} message${s.leads === 1 ? '' : 's'}`),
      s.newOrders > 0 && link(`/app/site/${s.id}?tab=orders`, { class: 'btn soft sm' }, `${s.newOrders} new order${s.newOrders === 1 ? '' : 's'}`),
      h('span', { class: 'grow' }),
      s.role === 'owner' && h('button', { class: 'icon-btn', 'aria-label': `Delete ${s.name}`, title: 'Delete site', onclick: async () => {
        if (!await confirmSheet({ title: `Delete ${s.name}?`, text: 'The site, its messages and its web address will be removed. This cannot be undone.', action: 'Delete site', danger: true })) return;
        await api('DELETE', `/api/sites/${s.id}`); toast('Site deleted'); dashboard();
      } }, ic('trash'))));
  mount(topbar(state.user.admin && link('/app/admin', {}, 'Staff dashboard'), accountMenu()), h('main', { class: 'page dash' },
    h('div', { class: 'dash-head' }, h('h1', {}, 'My sites'), sites.length > 0 && link('/app/new', { class: 'btn' }, ic('plus', 16), 'New site')),
    installBanner(),
    sites.length
      ? h('div', { class: 'sgrid' }, sites.map(card), h('div', {}, h('button', { class: 'newcard', onclick: () => go('/app/new') }, 'Create another site')))
      : h('div', { class: 'empty' }, h('h2', {}, 'Let’s build your website.'), h('p', {}, 'It takes about two minutes, and you can change everything later.'), link('/app/new', { class: 'btn lg' }, 'Create your site'))));
}

/* Offered once on phones and tablets, until installed or dismissed. */
function installBanner() {
  let hidden = false;
  try { hidden = !!localStorage.getItem('pf-install-hide'); } catch { /* private mode */ }
  if (hidden || !canOfferInstall() || !matchMedia('(max-width:900px)').matches) return null;
  const el = h('div', { class: 'ins-banner' }, h('img', { src: '/assets/icon-192.png', alt: '', width: 48, height: 48 }),
    h('div', { class: 'grow' }, h('b', {}, 'Get the app'), h('span', {}, 'Add it to your Home Screen for full screen and order alerts.')),
    h('button', { class: 'btn sm', onclick: installApp }, 'Install'),
    h('button', { class: 'icon-btn', 'aria-label': 'Not now', onclick: () => { try { localStorage.setItem('pf-install-hide', '1'); } catch { /* fine */ } el.remove(); } }, ic('x', 16)));
  return el;
}

/* ---------- Staff dashboard ---------- */

async function admin() {
  title('Staff dashboard');
  const data = await api('GET', '/api/admin');
  const attach = (siteId, suggested = '') => {
    const input = h('input', { class: 'input', value: suggested, placeholder: 'theirbusiness.com', style: 'max-width:240px' });
    return h('form', { class: 'row', onsubmit: async (e) => {
      e.preventDefault();
      try { await api('POST', `/api/admin/sites/${siteId}/domain`, { domain: input.value }); toast('Domain attached and live'); admin(); } catch (ex) { toast(ex.message, true); }
    } }, input, h('button', { class: 'btn sm' }, 'Attach'));
  };
  const open = data.requests.filter((r) => r.status === 'open');
  const st = data.stats;
  const stat = (color, icon, label, value, sub) => h('div', { class: 'scard2' }, h('span', { class: 'itile', style: `--c:${color}`, html: svg(icon, 20) }), h('span', { class: 'muted small' }, label), h('b', {}, value), h('span', { class: 'small muted' }, sub || ' '));
  const table = (heads, rows, empty) => (rows.length ? h('div', { class: 'tscroll card' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, heads.map((t) => h('th', {}, t)))), h('tbody', {}, rows))) : h('p', { class: 'note' }, empty));
  const when = (ms) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  // Which merchants need a nudge: signed up but never published, or live with no orders yet.
  const DAY = 86400000;
  const health = (s2) => (!s2.live ? (Date.now() - s2.createdAt > 2 * DAY ? 'stalled' : 'new') : !s2.orders ? 'quiet' : 'selling');
  const HEALTH = { stalled: ['Never published', 'warn'], new: ['Just started', ''], quiet: ['Live, no orders yet', ''], selling: ['Taking orders', 'ok'] };
  const counts = { all: data.sites.length }; for (const s2 of data.sites) counts[health(s2)] = (counts[health(s2)] || 0) + 1;
  const noSite = data.users.filter((u) => !u.sites).length;
  let siteFilter = 'all';
  const sitesBody = h('tbody', {});
  const chips = h('div', { class: 'inv-chips', style: 'margin-bottom:14px' });
  const drawSites = () => {
    chips.replaceChildren(...[['all', 'All'], ['stalled', 'Never published'], ['quiet', 'Live, no orders yet'], ['selling', 'Taking orders'], ['new', 'Just started']].filter(([k]) => k === 'all' || counts[k]).map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': String(siteFilter === k), onclick: () => { siteFilter = k; drawSites(); } }, `${l} · ${counts[k] || 0}`)));
    const rows = data.sites.filter((s2) => siteFilter === 'all' || health(s2) === siteFilter);
    queueMicrotask(labelTables);
    sitesBody.replaceChildren(...rows.map((s2) => h('tr', {}, h('td', {}, h('b', {}, s2.name), h('div', { class: 'small muted' }, `Created ${fmtDate(s2.createdAt)}`)), h('td', {}, s2.owner), h('td', {}, h('a', { href: s2.url, target: '_blank', rel: 'noopener' }, s2.customDomain && s2.domainVerified ? s2.customDomain : s2.address)),
      h('td', {}, h('span', { class: `status ${HEALTH[health(s2)][1]}` }, HEALTH[health(s2)][0])), h('td', {}, s2.ordering.enabled ? (s2.ordering.accepting ? 'On' : 'Paused') : 'Off'), h('td', {}, s2.items), h('td', {}, s2.orders), h('td', {}, h('b', {}, money(s2.sales30))), h('td', { class: 'muted' }, s2.lastOrderAt ? when(s2.lastOrderAt) : '—'),
      h('td', {}, link(`/app/site/${s2.id}`, { class: 'btn soft sm', title: 'Open this site exactly as the merchant sees it' }, 'View as merchant')))));
    if (!rows.length) sitesBody.replaceChildren(h('tr', {}, h('td', { colspan: 10, class: 'muted', style: 'text-align:center;padding:24px' }, 'No sites in this group.')));
  };
  drawSites();
  mount(topbar(link('/app', {}, 'My sites'), accountMenu()), h('main', { class: 'page dash' },
    h('div', { class: 'dash-head' }, h('div', {}, h('h1', {}, 'Staff dashboard'), h('p', { class: 'muted', style: 'margin-top:6px' }, 'Everything happening across Processor Freedom Sites.')), h('div', { class: 'row' }, h('input', { class: 'input', type: 'search', placeholder: 'Search sites, owners, orders…', 'aria-label': 'Search', style: 'width:260px;max-width:60vw', oninput: (e) => { const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('.dash .table tbody tr').forEach((tr) => { tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? '' : 'none'; }); } }), h('button', { class: 'btn soft', onclick: admin }, 'Refresh'))),
    h('div', { class: 'sgrid2' },
      stat('', I.globe, 'Sites', st.sites, `${st.live} live`), stat('', I.person, 'Accounts', st.users, `${st.newUsers} this week`),
      stat('', I.bag, 'Orders', st.orders, `${st.ordersToday} today`), stat('', I.cash, 'Sales through sites', money(st.sales), `${money(st.salesToday)} today`),
      stat('', I.cash, 'Last 7 days', money(st.sales7), 'in orders'), stat('', I.cash, 'Last 30 days', money(st.sales30), 'in orders'),
      stat('', I.person, 'Need a nudge', (counts.stalled || 0) + noSite, `${counts.stalled || 0} never published · ${noSite} with no site`),
      stat('', I.inbox, 'Messages', st.leads, 'from contact forms'), stat('', I.items, 'Menu items', st.items, `${st.orderingSites} ordering sites`)),
    h('h2', { class: 'h2' }, 'Domain requests', open.length > 0 && h('span', { class: 'badge', style: 'margin-left:10px;vertical-align:middle' }, open.length)),
    h('p', { class: 'muted', style: 'margin-bottom:14px' }, `Register the domain, point it at ${state.config.cnameTarget}, then attach it here. The site goes live on it immediately.`),
    table(['Site', 'Owner', 'Wants', 'Requested', 'Attach'], open.map((r) => h('tr', {}, h('td', {}, r.siteName), h('td', {}, r.owner), h('td', {}, h('b', {}, r.desired), r.note && h('div', { class: 'small muted' }, r.note)), h('td', {}, fmtDate(r.createdAt)), h('td', {}, attach(r.siteId, /\./.test(r.desired) ? r.desired : '')))), 'No open requests.'),
    h('h2', { class: 'h2' }, 'Recent orders'),
    table(['Order', 'Site', 'Customer', 'Type', 'Status', 'Total', 'Placed'], data.orders.map((o) => h('tr', {}, h('td', {}, h('b', {}, `#${o.number}`)), h('td', {}, o.siteName), h('td', {}, o.name), h('td', {}, ORDER_METHODS[o.method]?.name || o.method),
      h('td', {}, h('span', { class: `status ${o.status === 'cancelled' ? 'bad' : o.status === 'new' ? 'warn' : 'ok'}` }, ORDER_STATUSES[o.status] || o.status)), h('td', {}, money(o.total)), h('td', {}, when(o.createdAt)))), 'No orders yet.'),
    h('h2', { class: 'h2' }, 'All sites'),
    chips,
    h('div', { class: 'tscroll card' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ['Site', 'Owner', 'Address', 'Health', 'Ordering', 'Items', 'Orders', 'Sales, 30 days', 'Last order', ''].map((t) => h('th', {}, t)))), sitesBody)),
    h('h2', { class: 'h2' }, 'Accounts'),
    table(['Name', 'Email', 'Sites', 'Joined', ''], data.users.map((u) => h('tr', {}, h('td', {}, u.name || '—'), h('td', {}, u.email), h('td', {}, u.sites || h('span', { class: 'status warn' }, 'No site yet')), h('td', {}, fmtDate(u.createdAt)),
      h('td', { style: 'text-align:right;white-space:nowrap' }, h('button', { class: 'btn soft sm', onclick: async () => {
        try {
          const { link: url } = await api('POST', `/api/admin/users/${u.id}/reset-link`);
          sheet((close) => [h('h2', {}, 'Password reset link'), h('p', { class: 'muted' }, `Send this to ${u.email}. It works once and expires in 2 hours.`), h('div', { class: 'note', style: 'overflow-wrap:anywhere;color:var(--ink)' }, url),
            h('div', { class: 'acts' }, h('button', { class: 'btn soft', onclick: close }, 'Done'), h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast('Copy the link from the box above', true); } } }, 'Copy link'))]);
        } catch (ex) { toast(ex.message, true); }
      } }, 'Reset link'), ' ', u.id !== state.user.id && h('button', { class: 'btn danger sm', onclick: async () => {
        if (!await confirmSheet({ title: `Delete ${u.email}?`, text: u.sites ? `This removes the account and its ${u.sites} site${u.sites === 1 ? '' : 's'}, including menus, orders and messages. Any published site goes offline. This cannot be undone.` : 'This removes the account. This cannot be undone.', action: 'Delete account', danger: true })) return;
        try { await api('DELETE', `/api/admin/users/${u.id}`); toast('Account deleted'); admin(); } catch (ex) { toast(ex.message, true); }
      } }, 'Delete')))), 'No accounts yet.')));
  labelTables();
}

/* ---------- Router ---------- */

async function render() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  // Moving between the pages of the site already open (Back, Forward, a link) just turns the page; nothing reloads.
  const same = path.match(/^\/app\/site\/([\w-]+)(?:\/([\w-]+))?$/);
  if (same && same[2] !== 'kitchen' && cleanup?.siteId === same[1]) return cleanup.nav(same[2] || 'start');
  cleanup?.(); cleanup = null; window.scrollTo(0, 0);
  const needsUser = path.startsWith('/app');
  if (needsUser && !state.user) return go(`/login${location.search}`);
  try {
    let m;
    if (path === '/') landing();
    else if (path === '/login' || path === '/signup') auth(path.slice(1));
    else if (path === '/forgot') forgot();
    else if (path === '/reset') reset();
    else if ((m = path.match(/^\/app\/site\/([\w-]+)\/kitchen$/))) cleanup = await (await import('./kitchen.js')).kitchen(m[1], mount, title);
    else if (path === '/app') await dashboard();
    else if (path === '/app/admin') await admin();
    else if (path === '/app/new') cleanup = (await import('./wizard.js')).wizard(mount, title);
    else if ((m = path.match(/^\/app\/site\/([\w-]+)(?:\/([\w-]+))?$/))) cleanup = await (await import('./editor.js')).editor(m[1], mount, title, m[2] || '');
    else go(state.user ? '/app' : '/');
  } catch (e) {
    if (e.status === 401) { state.user = null; return go('/login'); }
    mount(topbar(), h('main', { class: 'page dash' }, h('div', { class: 'empty' }, h('h2', {}, 'Something went wrong.'), h('p', {}, e.message), link(state.user ? '/app' : '/', { class: 'btn' }, 'Go back'))));
  }
}

window.addEventListener('popstate', render);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
Promise.all([api('GET', '/api/me'), api('GET', '/api/config')])
  .then(([me, config]) => { state.user = me.user; state.config = config; })
  .catch(() => {})
  .finally(render);
