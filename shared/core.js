// Shared between the server and the browser. Pure functions only — no Node or DOM APIs.

import { ION } from './icons.js';
import { legalEs } from './legal-es.js';

export const PLATFORM = 'Processor Freedom';

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Text only: a number becomes its digits, anything else that is not text (a list, an object) becomes nothing.
export const str = (v, max = 5000) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').slice(0, max);
export const arr = (v) => (Array.isArray(v) ? v : []);

/* ---------- Names → web addresses ---------- */

const RESERVED = new Set(
  'www app api admin sites site mail email ftp smtp pop imap ns1 ns2 cdn static assets u s login signup dashboard billing support help status blog docs dev staging test demo root processorfreedom pf'.split(' ')
);

const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "Joe's Pizza & Pasta" → "joespizzaandpasta" */
export function slugify(name) {
  return fold(name).replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '').slice(0, 40);
}

/** Cleans an address the person typed themselves; hyphens are kept. */
export function cleanSlug(input) {
  return fold(input).replace(/&/g, 'and').replace(/['’]/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

export function slugProblem(slug) {
  if (!slug) return 'Enter a name using letters or numbers.';
  if (slug.length < 3) return 'Use at least 3 characters.';
  if (RESERVED.has(slug)) return 'That address is reserved.';
  return '';
}

export function slugSuggestions(name) {
  const hyph = cleanSlug(name);
  const base = slugify(name);
  const out = [hyph, `${base}co`, `get${base}`, `${base}shop`, `visit${base}`, `${base}hq`];
  return [...new Set(out)].filter((s) => s && s !== base && !slugProblem(s)).map((s) => s.slice(0, 40));
}

export function cleanDomain(input) {
  const d = String(input || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  return /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(d) ? d : '';
}

/* ---------- Safe values ---------- */

export function safeUrl(u) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  if (/^#[\w-]*$/.test(s)) return s;
  if (/^\/(?!\/)/.test(s)) return s;
  if (/^(https?:\/\/|mailto:|tel:|sms:)/i.test(s)) return s;
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s)) return `mailto:${s}`;
  if (/^\+?[\d\s().-]{7,}$/.test(s)) return `tel:${s.replace(/[^\d+]/g, '')}`;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) return `https://${s}`;
  return '';
}

export function safeImg(u) {
  const s = String(u ?? '').trim();
  return /^\/u\/[\w.-]+$/.test(s) || /^\/assets\/demo\/[\w-]+\.jpg$/.test(s) || /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}

export const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ''));

/* ---------- Colour ---------- */

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('');
export const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };

/** Nudges the chosen brand colour until text set in it is readable on the page background. */
export function readableAccent(accent, bg) {
  const toward = lum(bg) > 0.5 ? '#000000' : '#ffffff';
  let c = accent;
  for (let i = 1; i <= 10 && contrast(c, bg) < 4.5; i++) c = mix(accent, toward, i / 10);
  return c;
}
export const onColor = (c) => (contrast(c, '#ffffff') >= contrast(c, '#1d1d1f') ? '#ffffff' : '#1d1d1f');

/* ---------- Design options ---------- */

export const ACCENTS = [
  { name: 'Graphite', value: '#1d1d1f' },
  { name: 'Blue', value: '#0071e3' },
  { name: 'Indigo', value: '#4f46c8' },
  { name: 'Purple', value: '#8944ab' },
  { name: 'Pink', value: '#d6336c' },
  { name: 'Red', value: '#d1372f' },
  { name: 'Orange', value: '#c2570c' },
  { name: 'Gold', value: '#9a7400' },
  { name: 'Green', value: '#1e8e3e' },
  { name: 'Teal', value: '#0d8389' },
];

const SF = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const FONTS = {
  sans: { name: 'San Francisco', note: 'Clean and modern', head: SF, body: SF },
  serif: { name: 'New York', note: 'Editorial and warm', head: '"New York", ui-serif, "Iowan Old Style", "Palatino Linotype", Georgia, serif', body: SF },
  rounded: { name: 'SF Rounded', note: 'Friendly and soft', head: `ui-rounded, "SF Pro Rounded", ${SF}`, body: `ui-rounded, "SF Pro Rounded", ${SF}` },
};
export const RADII = { sharp: { name: 'Crisp', r: 6, btn: 8 }, soft: { name: 'Soft', r: 18, btn: 12 }, round: { name: 'Round', r: 28, btn: 980 } };
export const HERO_LAYOUTS = { center: 'Centered', split: 'Side by side', cover: 'Full image' };
export const BACKGROUNDS = [{ name: 'White', value: '#ffffff' }, { name: 'Cream', value: '#faf6ef' }, { name: 'Mist', value: '#f2f4f7' }, { name: 'Charcoal', value: '#1c1c1e' }, { name: 'Black', value: '#000000' }];
export const SECTION_BACKGROUNDS = { '': 'Plain', soft: 'Soft', brand: 'Brand colour' };
export const HEADER_LAYOUTS = { left: 'Logo left', center: 'Logo centred', mid: 'Menu centred' };
export const HEADER_STYLES = { glass: 'Light', brand: 'Brand colour', dark: 'Dark' };
export const FOOTER_STYLES = { columns: 'Columns', simple: 'Centred' };
export const FOOTER_COLORS = { soft: 'Soft', plain: 'Plain', brand: 'Brand colour', dark: 'Dark' };
/** One-click looks. Each sets where the brand colour is used across the site. */
export const QUICK_STYLES = {
  clean: { name: 'Clean', blurb: 'White and airy', header: 'glass', footer: 'soft', bg: () => '' },
  soft: { name: 'Soft', blurb: 'Gentle grey bands', header: 'glass', footer: 'soft', bg: (type, i) => (type === 'hero' || i % 2 === 0 ? 'soft' : '') },
  bold: { name: 'Bold', blurb: 'Your colour, front and centre', header: 'brand', footer: 'brand', bg: (type) => (type === 'hero' || type === 'cta' ? 'brand' : '') },
};
export function applyQuickStyle(site, key) {
  const q = QUICK_STYLES[key];
  if (!q) return;
  site.header.style = q.header; site.footer.color = q.footer;
  site.sections.forEach((x, i) => { x.bg = q.bg(x.type, i); });
}

export const SECTION_TYPES = {
  hero: { name: 'Hero', blurb: 'The first thing visitors see' },
  about: { name: 'About', blurb: 'Your story, with optional photo and numbers' },
  services: { name: 'Services or menu', blurb: 'What you offer, with prices' },
  menu: { name: 'Online menu', blurb: 'Your item list, always up to date' },
  features: { name: 'Highlights', blurb: 'Reasons to choose you' },
  gallery: { name: 'Gallery', blurb: 'A grid of photos' },
  testimonials: { name: 'Reviews', blurb: 'What customers say' },
  faq: { name: 'Questions', blurb: 'Answers to common questions' },
  cta: { name: 'Call to action', blurb: 'One clear next step' },
  contact: { name: 'Contact', blurb: 'Details, hours and a message form' },
};

export const ICONS = Object.fromEntries(['star', 'clock', 'shield', 'heart', 'leaf', 'bolt', 'pin', 'phone', 'card', 'check', 'sparkle', 'tool', 'truck', 'users', 'calendar', 'gift', 'cup', 'scissors'].map((k) => [k, ION[`f_${k}`]]));

/* ---------- Templates ---------- */

let seq = 0;
export const uid = (p = 's') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const sec = (type, nav, data) => ({ id: uid(type.slice(0, 2)), type, enabled: true, nav, bg: '', data });
const link = (label, href) => ({ label, href });

export const SECTION_DEFAULTS = {
  hero: () => ({ eyebrow: '', title: 'A headline that says what you do', subtitle: 'One or two sentences about who you help and why it matters.', primary: link('Get in touch', '#contact'), secondary: link('', ''), image: '', layout: 'center', showLogo: false }),
  about: () => ({ title: 'About us', body: 'Tell your story here. How you started, what you care about, and what customers can expect when they work with you.', image: '', stats: [] }),
  services: () => ({ title: 'What we offer', subtitle: '', layout: 'cards', items: [{ name: 'First service', desc: 'A short description of what is included.', price: '', image: '' }, { name: 'Second service', desc: 'A short description of what is included.', price: '', image: '' }, { name: 'Third service', desc: 'A short description of what is included.', price: '', image: '' }] }),
  menu: () => ({ title: 'Our menu', subtitle: '', showPhotos: true }),
  features: () => ({ title: 'Why choose us', subtitle: '', items: [{ icon: 'star', title: 'Quality first', desc: 'We sweat the details so you do not have to.' }, { icon: 'clock', title: 'On your schedule', desc: 'Fast, reliable and respectful of your time.' }, { icon: 'shield', title: 'Guaranteed', desc: 'If something is not right, we make it right.' }] }),
  gallery: () => ({ title: 'Gallery', images: [] }),
  testimonials: () => ({ title: 'What customers say', items: [{ quote: 'Add a favourite review from a customer here.', name: 'Customer name', role: '' }] }),
  faq: () => ({ title: 'Questions, answered', items: [{ q: 'A common question?', a: 'A clear, friendly answer.' }] }),
  cta: () => ({ title: 'Ready when you are', subtitle: 'Reach out today and we will take it from there.', button: link('Contact us', '#contact') }),
  contact: () => ({ title: 'Get in touch', subtitle: 'Send a message and we will get back to you shortly.', showForm: true, showHours: true }),
};

const feats = (title, items) => sec('features', '', { title, subtitle: '', items: items.map(([icon, t, desc]) => ({ icon, title: t, desc })) });
const reviews = (items) => sec('testimonials', 'Reviews', { title: 'Loved by our customers', items: items.map(([quote, name, role]) => ({ quote, name, role: role || '' })) });
const faq = (items) => ({ ...sec('faq', 'FAQ', { title: 'Questions, answered', items: items.map(([q, a]) => ({ q, a })) }), enabled: false });
const offer = (nav, title, subtitle, layout, items) => sec('services', nav, { title, subtitle, layout, items: items.map(([name, desc]) => ({ name, desc, price: '', image: '' })) });
const hero = (eyebrow, title, subtitle, primary, secondary, layout = 'center') => sec('hero', '', { eyebrow, title, subtitle, primary, secondary: secondary || link('', ''), image: '', layout });
const about = (title, body, stats = []) => sec('about', 'About', { title, body, image: '', stats: stats.map(([value, label]) => ({ value, label })) });
const cta = (title, subtitle, button) => sec('cta', '', { title, subtitle, button });
const contact = (title, subtitle) => sec('contact', 'Contact', { title, subtitle, showForm: true, showHours: true });
const gallery = () => ({ ...sec('gallery', 'Gallery', { title: 'A closer look', images: [] }), enabled: false });
const hours = (...rows) => rows.map(([label, value]) => ({ label, value }));

export const TEMPLATES = [
  {
    id: 'restaurant', name: 'Restaurant', blurb: 'Menus, hours and reservations', accent: '#c2570c', font: 'serif', radius: 'soft',
    build: (n) => ({
      tagline: 'Fresh, local, made from scratch',
      cta: link('Reserve a table', '#contact'),
      hours: hours(['Tuesday – Thursday', '5:00 – 9:30 PM'], ['Friday – Saturday', '5:00 – 10:30 PM'], ['Sunday', '4:00 – 9:00 PM'], ['Monday', 'Closed']),
      sections: [
        hero('Neighborhood kitchen', 'Good food, made with care.', `${n} serves seasonal dishes cooked from scratch, in a room built for long dinners and good company.`, link('Reserve a table', '#contact'), link('See the menu', '#menu')),
        about('Our story', `${n} began with a simple idea: cook honest food with the best ingredients we can find, and treat every guest like a regular. We work with nearby farms and change the menu as the seasons do.`),
        offer('Menu', 'The menu', 'A few favourites. Ask your server about tonight’s specials.', 'list', [['Wood-fired flatbread', 'Roasted garlic, mozzarella, basil, olive oil', '$14'], ['Market salad', 'Greens, shaved fennel, citrus, toasted almonds', '$12'], ['Handmade pappardelle', 'Slow-braised short rib ragù, parmesan', '$24'], ['Pan-roasted salmon', 'Lemon butter, asparagus, herbed potatoes', '$28'], ['Half roasted chicken', 'Pan jus, charred broccolini, garlic mash', '$25'], ['Olive oil cake', 'Whipped mascarpone, seasonal fruit', '$10']]),
        gallery(),
        { ...reviews([['Add a favourite review from a customer here.', 'Customer name']]), enabled: false },
        cta('Planning something special?', 'Ask us about private dinners, celebrations and team events.', link('Ask about events', '#contact')),
        contact('Visit us', 'Reserve a table or ask us anything. We reply within a few hours.'),
      ],
    }),
  },
  {
    id: 'cafe', name: 'Café & Bakery', blurb: 'Coffee, pastries and pickup', accent: '#9a7400', font: 'rounded', radius: 'round',
    build: (n) => ({
      tagline: 'Coffee and fresh bakes, every morning',
      cta: link('Order ahead', '#contact'),
      hours: hours(['Monday – Friday', '6:30 AM – 5:00 PM'], ['Saturday – Sunday', '7:30 AM – 4:00 PM']),
      sections: [
        hero('Baked fresh daily', 'Your morning, done right.', `${n} pours carefully sourced coffee and bakes everything in-house, every single morning.`, link('See what’s baking', '#menu'), link('Find us', '#contact')),
        feats('Made the slow way', [['cup', 'Small-batch coffee', 'Roasted weekly and dialed in each morning.'], ['leaf', 'Real ingredients', 'Butter, flour, fruit. Nothing you cannot pronounce.'], ['gift', 'Catering and gifts', 'Pastry boxes and coffee for meetings and celebrations.']]),
        offer('Menu', 'On the counter', 'Our everyday favourites.', 'list', [['Drip coffee', 'Rotating single-origin roast', '$3.50'], ['Oat milk latte', 'Double shot, steamed oat milk', '$5.50'], ['Butter croissant', 'Laminated over three days', '$4.25'], ['Morning bun', 'Orange zest and cinnamon sugar', '$4.75'], ['Avocado toast', 'Sourdough, chili, lemon, sea salt', '$9'], ['Seasonal fruit galette', 'Ask what came in this week', '$6']]),
        about('A neighborhood ritual', `We opened ${n} to be the kind of place we wanted on our own block: unhurried, welcoming, and serious about quality without being fussy about it.`),
        gallery(),
        { ...reviews([['Add a favourite review from a customer here.', 'Customer name']]), enabled: false },
        contact('Come say hello', 'Ordering for a group? Send us a note at least a day ahead.'),
      ],
    }),
  },
  {
    id: 'retail', name: 'Retail & Boutique', blurb: 'Collections, story and store info', accent: '#1d1d1f', font: 'sans', radius: 'sharp',
    build: (n) => ({
      tagline: 'Thoughtfully chosen goods',
      cta: link('Visit the shop', '#contact'),
      hours: hours(['Monday – Saturday', '10:00 AM – 7:00 PM'], ['Sunday', '11:00 AM – 5:00 PM']),
      sections: [
        hero('New arrivals in store', 'Things worth keeping.', `${n} is an independent shop with a carefully edited collection of pieces made to last.`, link('Browse collections', '#collections'), link('Visit the shop', '#contact'), 'split'),
        offer('Collections', 'Collections', 'A look at what is on the shelves right now.', 'cards', [['Everyday essentials', 'Well-made basics you will reach for daily.', 'From $28'], ['Home and living', 'Ceramics, textiles and objects with character.', 'From $18'], ['Gifts', 'Wrapped and ready, for every occasion.', 'From $12']]),
        feats('Shopping, made easy', [['gift', 'Gift wrap', 'Ask us to wrap your purchase.'], ['truck', 'Local delivery', 'Ask about delivery in your area.'], ['card', 'Returns', 'Ask us about returns and exchanges.']]),
        about('Independent and proud of it', `Every item at ${n} is chosen by hand. We work directly with small makers and only stock what we would bring home ourselves.`),
        gallery(),
        { ...reviews([['Add a favourite review from a customer here.', 'Customer name']]), enabled: false },
        contact('Find us', 'Looking for something specific? Ask and we will check the stockroom.'),
      ],
    }),
  },
  {
    id: 'salon', name: 'Salon & Spa', blurb: 'Services, pricing and booking', accent: '#d6336c', font: 'serif', radius: 'round',
    build: (n) => ({
      tagline: 'Hair, skin and time for yourself',
      cta: link('Book now', '#contact'),
      hours: hours(['Tuesday – Friday', '9:00 AM – 7:00 PM'], ['Saturday', '9:00 AM – 5:00 PM'], ['Sunday – Monday', 'Closed']),
      sections: [
        hero('By appointment', 'Leave feeling like yourself, only better.', `${n} is a calm, modern studio for hair, skin and nails, with stylists who listen first.`, link('Book an appointment', '#contact'), link('View services', '#services')),
        offer('Services', 'Services', 'Every visit starts with a consultation.', 'list', [['Signature cut and style', 'Consultation, wash, cut and finish', '$65+'], ['Color and gloss', 'Single process with a shine treatment', '$95+'], ['Balayage', 'Hand-painted, lived-in color', '$180+'], ['Classic facial', 'Cleanse, exfoliate, mask and massage', '$85'], ['Gel manicure', 'Shape, cuticle care and long-wear polish', '$45'], ['Blowout', 'Wash and style', '$45']]),
        feats('The details matter', [['sparkle', 'Expert stylists', 'Continuously trained in the latest techniques.'], ['leaf', 'Gentle products', 'Professional-grade care for hair and skin.'], ['calendar', 'Easy booking', 'Appointments that start on time.']]),
        about('A studio built around you', `At ${n} we believe great service starts with listening. Tell us how you live, and we will give you a look that works every day, not just the day you leave the chair.`),
        gallery(),
        { ...reviews([['Add a favourite review from a customer here.', 'Customer name']]), enabled: false },
        faq([['How do I book?', 'Send us a message or call during business hours and we will find a time that works.'], ['What if I need to cancel?', 'Please let us know as early as you can, so we can offer the time to another guest.'], ['Do you offer gift cards?', 'Ask at the front desk or send us a message.']]),
        contact('Book your visit', 'Tell us what you are looking for and when you would like to come in.'),
      ],
    }),
  },
  {
    id: 'services', name: 'Professional Services', blurb: 'Expertise, process and consultations', accent: '#0071e3', font: 'sans', radius: 'soft',
    build: (n) => ({
      tagline: 'Clear advice. Real results.',
      cta: link('Book a consultation', '#contact'),
      hours: hours(['Monday – Friday', '9:00 AM – 5:30 PM']),
      sections: [
        hero('Trusted advisors', 'Expert guidance, without the runaround.', `${n} helps individuals and growing businesses make confident decisions, with straight answers and a plan you can act on.`, link('Book a consultation', '#contact'), link('What we do', '#services')),
        offer('Services', 'How we help', '', 'cards', [['Consulting', 'Practical strategy shaped around your goals and budget.'], ['Planning', 'A clear roadmap with milestones you can measure.'], ['Ongoing support', 'A dedicated point of contact who knows your situation.']]),
        about('Experience you can rely on', `For years, ${n} has been the first call for clients who want things done properly. We keep our client list small so every engagement gets senior attention.`),
        feats('Working with us', [['users', 'Senior attention', 'You work directly with the people doing the work.'], ['check', 'Plain language', 'No jargon, no surprises on the invoice.'], ['shield', 'Confidential', 'Your information is protected at every step.']]),
        { ...reviews([['Add a favourite review from a customer here.', 'Customer name']]), enabled: false },
        faq([['How does the first consultation work?', 'We start with a conversation to understand your situation.'], ['How do you bill?', 'You receive a clear written quote before any work begins.'], ['Do you work remotely?', 'Yes. We meet in person, by phone or by video, whichever you prefer.']]),
        cta('Let’s talk about what you need.', 'Tell us a little about your situation.', link('Book a consultation', '#contact')),
        contact('Contact us', 'Tell us a little about your situation and we will be in touch within one business day.'),
      ],
    }),
  },
  {
    id: 'home', name: 'Home Services', blurb: 'Quotes, service areas and trust', accent: '#1e8e3e', font: 'sans', radius: 'soft',
    build: (n) => ({
      tagline: 'Repairs and installations, done right',
      cta: link('Get a free quote', '#contact'),
      hours: hours(['Monday – Friday', '7:00 AM – 6:00 PM'], ['Saturday', '8:00 AM – 2:00 PM'], ['Emergencies', '24 / 7']),
      sections: [
        hero('Home repairs and installations', 'Done right, the first time.', `${n} provides repairs, installations and maintenance for homes and small businesses.`, link('Get a quote', '#contact'), link('Our services', '#services'), 'split'),
        feats('Why homeowners call us', [['clock', 'On-time arrival', 'We give you a real appointment window and keep it.'], ['card', 'Upfront pricing', 'You approve the price before we start.'], ['shield', 'Work you can count on', 'We stand behind the work we do.']]),
        offer('Services', 'Services', 'No job too small.', 'cards', [['Repairs', 'Fast diagnosis and lasting fixes.'], ['Installations', 'Done to code with quality materials.'], ['Maintenance plans', 'Seasonal checkups that prevent expensive surprises.']]),
        about('About us', `${n} takes care of homes and small businesses in this community, and treats every home with respect.`),
        gallery(),
        { ...reviews([['Add a favourite review from a customer here.', 'Customer name']]), enabled: false },
        faq([['How do I get an estimate?', 'Send us a message with a few details about the job and we will get back to you.'], ['Which areas do you serve?', 'Send us your address and we will confirm.'], ['How soon can you come out?', 'Call us or send a message, and we will tell you the earliest time we can be there.']]),
        contact('Request a quote', 'Describe the job and we will get back to you the same day.'),
      ],
    }),
  },
  {
    id: 'fitness', name: 'Fitness & Wellness', blurb: 'Classes, memberships and trials', accent: '#4f46c8', font: 'sans', radius: 'round',
    build: (n) => ({
      tagline: 'Stronger every week',
      cta: link('Book a class', '#contact'),
      hours: hours(['Monday – Friday', '5:30 AM – 9:00 PM'], ['Saturday – Sunday', '7:00 AM – 5:00 PM']),
      sections: [
        hero('Classes for every level', 'Feel stronger. Move better.', `${n} is a welcoming studio with expert coaching, small classes and programs for every level.`, link('Book a class', '#contact'), link('See memberships', '#memberships')),
        feats('Built around you', [['users', 'Small classes', 'Coaches who know your name and your goals.'], ['bolt', 'Smart programming', 'Structured training that keeps you progressing.'], ['heart', 'Supportive community', 'All levels welcome, always.']]),
        offer('Memberships', 'Memberships', 'Find the option that fits you.', 'cards', [['Drop-in', 'A single class, whenever you like.', '$22'], ['Unlimited', 'Every class, every day.', '$149 / mo'], ['Personal training', 'One-on-one sessions with a dedicated coach.', 'From $75']]),
        about('More than a workout', `${n} was founded on the idea that fitness should fit your life. Whether you are just starting or training for something big, we will meet you where you are.`),
        gallery(),
        { ...reviews([['Add a favourite review from a customer here.', 'Customer name']]), enabled: false },
        contact('Come in for a class', 'Tell us a bit about your goals and we will recommend where to start.'),
      ],
    }),
  },
  {
    id: 'auto', name: 'Auto Repair', blurb: 'Repairs, estimates and scheduling', accent: '#d1372f', font: 'sans', radius: 'sharp',
    build: (n) => ({
      tagline: 'Honest repairs, fair prices',
      cta: link('Schedule service', '#contact'),
      hours: hours(['Monday – Friday', '7:30 AM – 6:00 PM'], ['Saturday', '8:00 AM – 1:00 PM']),
      sections: [
        hero('Repairs and maintenance', 'Back on the road, with confidence.', `${n} handles everything from oil changes to major repairs, and explains every recommendation in plain language.`, link('Schedule service', '#contact'), link('What we fix', '#services')),
        offer('Services', 'Services', 'All makes and models.', 'cards', [['Maintenance', 'Oil, filters, fluids and factory-scheduled service.', 'From $49'], ['Brakes and tires', 'Inspection, replacement, alignment and balancing.'], ['Diagnostics and repair', 'Check-engine lights, electrical, engine and transmission.']]),
        feats('The shop you can trust', [['tool', 'Experienced technicians', 'Equipped with the right tools for the job.'], ['check', 'Written estimates', 'You approve every repair before we begin.'], ['shield', 'Straight answers', 'We explain what needs doing and what can wait.']]),
        about('Family owned and operated', `${n} has kept this community moving for years. We only recommend what your vehicle actually needs.`),
        { ...reviews([['Add a favourite review from a customer here.', 'Customer name']]), enabled: false },
        contact('Schedule service', 'Tell us your vehicle’s year, make and model, and what is going on.'),
      ],
    }),
  },
  {
    id: 'order', name: 'Online ordering', blurb: 'A menu customers can order from', accent: '#1d1d1f', font: 'sans', radius: 'soft',
    build: (n) => ({
      tagline: 'Order online for pickup or delivery',
      cta: link('Order online', '/order'),
      hours: hours(['Monday – Friday', '11:00 AM – 9:00 PM'], ['Saturday – Sunday', '10:00 AM – 9:00 PM']),
      sections: [
        hero('Order online', `${n}, ready when you are.`, 'Order ahead and skip the wait. Choose pickup, curbside or delivery and we will have it ready.', link('Order online', '/order'), link('See the menu', '#menu')),
        sec('menu', 'Menu', SECTION_DEFAULTS.menu()),
        about('About us', `Welcome to ${n}. Tell customers who you are, what you make, and what makes it worth coming back for.`),
        gallery(),
        { ...reviews([['Add a favourite review from a customer here.', 'Customer name']]), enabled: false },
        contact('Find us', 'Questions about an order? Send us a message or give us a call.'),
      ],
    }),
  },
  {
    id: 'simple', name: 'Simple', blurb: 'A clean start for any business', accent: '#0d8389', font: 'sans', radius: 'soft',
    build: (n) => ({
      tagline: '',
      cta: link('Contact us', '#contact'),
      hours: hours(['Monday – Friday', '9:00 AM – 5:00 PM']),
      sections: [
        hero('', `Welcome to ${n}.`, 'A short, friendly sentence about what you do and who you do it for.', link('Get in touch', '#contact'), link('Learn more', '#about')),
        about('About us', SECTION_DEFAULTS.about().body),
        offer('Services', 'What we offer', '', 'cards', [['First service', 'A short description of what is included.'], ['Second service', 'A short description of what is included.'], ['Third service', 'A short description of what is included.']]),
        contact('Get in touch', 'Send a message and we will get back to you shortly.'),
      ],
    }),
  },
];

export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[TEMPLATES.length - 1];

const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

/** Builds a complete, ready-to-publish site from a business name and a template. */
/** Business hours as the rows the website shows: days with the same hours run together. */
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export function hoursText(week, lang = 'en') {
  const order = [1, 2, 3, 4, 5, 6, 0], rows = [], es = lang === 'es', names = es ? DIAS : DAYS;
  const clock12 = (t) => { const [hh, mm] = String(t).split(':').map(Number); return `${hh % 12 || 12}:${String(mm || 0).padStart(2, '0')} ${es ? (hh < 12 ? 'a. m.' : 'p. m.') : hh < 12 ? 'AM' : 'PM'}`; };
  for (const d of order) {
    const x = week[d], value = x.closed ? (es ? 'Cerrado' : 'Closed') : `${clock12(x.open)} – ${clock12(x.close)}`, last = rows[rows.length - 1];
    if (last && last.value === value) last.to = d; else rows.push({ from: d, to: d, value });
  }
  return rows.map((r) => ({ label: r.from === r.to ? names[r.from] : `${names[r.from]} – ${names[r.to]}`, value: r.value }));
}
export function createSite(name, templateId, o = {}) {
  const t = getTemplate(templateId);
  const n = str(name, 80).trim() || 'My Business';
  const b = t.build(n);
  if (o.kind === 'ordering') {
    // An ordering site leads with the live menu and an Order online button.
    const order = link('Order online', '/order');
    b.cta = order;
    const at = b.sections.findIndex((x) => x.type === 'services');
    const menu = sec('menu', 'Menu', SECTION_DEFAULTS.menu());
    if (b.sections.some((x) => x.type === 'menu')) { /* already has one */ } else if (at >= 0) b.sections.splice(at, 1, menu); else b.sections.splice(1, 0, menu);
    const h0 = b.sections.find((x) => x.type === 'hero');
    if (h0) { h0.data.primary = order; h0.data.secondary = link('See the menu', '#menu'); }
  }
  return {
    v: 1,
    template: t.id,
    lang: o.lang === 'es' ? 'es' : 'en',
    brand: { name: n, tagline: b.tagline, logo: '', logoMode: 'text' },
    theme: { accent: isHex(o.accent) ? o.accent : t.accent, mode: o.mode === 'dark' ? 'dark' : 'light', bg: '', font: Object.hasOwn(FONTS, o.font) ? o.font : t.font, radius: Object.hasOwn(RADII, o.radius) ? o.radius : t.radius },
    business: { legalName: '', email: str(o.email, 200), phone: str(o.phone, 40), address1: str(o.address1, 200), city: str(o.city, 80), state: str(o.state, 80), zip: str(o.zip, 20), hours: hoursText(defaultOrdering().hours, o.lang === 'es' ? 'es' : 'en'), payUrl: '' },
    social: { instagram: '', facebook: '', tiktok: '', x: '', youtube: '', linkedin: '' },
    header: { sticky: true, cta: b.cta, showPhone: false, layout: 'left', style: 'glass' },
    announcement: { enabled: false, text: '', href: '' },
    sections: b.sections,
    footer: { blurb: '', showPayments: true, showCredit: true, showMode: true, style: 'columns', color: 'soft' },
    seo: { title: '', description: '', keywords: '', image: '' },
    legal: {
      effective: today(),
      privacy: { enabled: true, custom: '' },
      terms: { enabled: true, custom: '' },
      policies: { enabled: true, custom: '' },
      accessibility: { enabled: true, custom: '' },
    },
  };
}

/* ---------- Validation applied before anything is stored ---------- */

function scrub(v, depth = 0) {
  if (depth > 8) return null;
  if (typeof v === 'string') return v.slice(0, depth <= 3 && v.length > 5000 ? 60000 : 5000);
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean' || v == null) return v ?? null;
  if (Array.isArray(v)) return v.slice(0, 60).map((x) => scrub(x, depth + 1));
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).slice(0, 60)) if (!/^(__proto__|constructor|prototype)$/.test(k)) out[k.slice(0, 40)] = scrub(v[k], depth + 1);
    return out;
  }
  return null;
}
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Returns a well-formed site no matter what it is given. */
export function normalizeSite(input) {
  const s = obj(scrub(input));
  const base = createSite(str(obj(s.brand).name, 80), str(s.template, 40));
  const out = { ...base };
  for (const k of ['brand', 'theme', 'business', 'social', 'header', 'announcement', 'footer', 'seo']) out[k] = { ...base[k], ...obj(s[k]) };
  out.lang = s.lang === 'es' ? 'es' : 'en';
  out.brand.name = str(out.brand.name, 80).trim() || base.brand.name;
  if (!isHex(out.theme.accent)) out.theme.accent = base.theme.accent;
  if (!Object.hasOwn(FONTS, out.theme.font)) out.theme.font = base.theme.font;
  if (!Object.hasOwn(RADII, out.theme.radius)) out.theme.radius = base.theme.radius;
  out.theme.mode = out.theme.mode === 'dark' ? 'dark' : 'light';
  out.theme.bg = isHex(out.theme.bg) ? out.theme.bg : '';
  if (!Object.hasOwn(HEADER_LAYOUTS, out.header.layout)) out.header.layout = 'left';
  if (!Object.hasOwn(HEADER_STYLES, out.header.style)) out.header.style = 'glass';
  if (!Object.hasOwn(FOOTER_STYLES, out.footer.style)) out.footer.style = 'columns';
  if (!Object.hasOwn(FOOTER_COLORS, out.footer.color)) out.footer.color = 'soft';
  out.business.hours = arr(out.business.hours).map(obj);
  out.header.cta = { label: '', href: '', ...obj(out.header.cta) };
  const L = obj(s.legal);
  out.legal = { effective: str(L.effective, 60) || base.legal.effective };
  for (const k of Object.keys(LEGAL_PAGES)) out.legal[k] = { enabled: obj(L[k]).enabled !== false, custom: str(obj(L[k]).custom, 60000) };
  if (Array.isArray(s.sections)) {
    out.sections = s.sections.filter((x) => x && Object.hasOwn(SECTION_TYPES, x.type)).slice(0, 30).map((x) => ({
      id: /^[\w-]{1,40}$/.test(str(x.id)) ? x.id : uid('s'),
      type: x.type,
      enabled: x.enabled !== false,
      nav: str(x.nav, 30),
      bg: SECTION_BACKGROUNDS[x.bg] ? x.bg : '',
      data: { ...SECTION_DEFAULTS[x.type](), ...obj(x.data) },
    }));
  }
  return out;
}

/* ---------- Legal pages ---------- */

export const LEGAL_PAGES = { privacy: 'Privacy Policy', terms: 'Terms of Service', policies: 'Store Policies', accessibility: 'Accessibility' };
export const SERVICE_LAYOUTS = { cards: 'Cards', tiles: 'Tiles with photo', list: 'Simple list' };

export function legalText(kind, site) {
  const custom = str(site.legal?.[kind]?.custom, 60000).trim();
  if (custom) return custom;
  if (site.lang === 'es') return legalEs(kind, site, str);
  const b = site.business || {};
  const name = site.brand?.name || 'This business';
  const legal = str(b.legalName).trim() || name;
  const where = [b.address1, b.city, [b.state, b.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const reach = [b.email && `email ${b.email}`, b.phone && `call ${b.phone}`, where && `write to ${legal}, ${where}`].filter(Boolean);
  const contactLine = reach.length ? `You can ${reach.join(', or ')}.` : 'You can reach us using the contact form on this website.';
  const state = str(b.state).trim();

  if (kind === 'privacy') return `${legal} ("${name}", "we", "us") respects your privacy. This policy explains what information we collect through this website, how we use it, and the choices you have.

## Information we collect
- Information you give us, such as your name, email address, phone number and the contents of any message you send through our contact form.
- Information collected automatically, such as your browser type, device type, pages viewed and approximate location derived from your IP address.
- Payment information. Payments are processed by a PCI DSS compliant payment processor. We do not store full card numbers or security codes on our systems.

## How we use information
- To respond to your questions and requests.
- To provide, schedule and bill for our products and services.
- To operate, secure and improve this website.
- To send service-related notices. We send marketing messages only where you have agreed to receive them, and you can opt out at any time.
- To comply with the law and protect our rights.

## How we share information
We do not sell your personal information. We share it only with service providers who help us run our business, such as website hosting, payment processing and email delivery, and only as needed to perform those services. We may also disclose information when required by law, or in connection with a sale or reorganization of our business.

## Cookies
This website uses only the cookies and similar technologies needed for it to function and to understand how it is used in aggregate. You can block cookies in your browser settings; some features may not work as intended if you do.

## Data retention and security
We keep personal information only as long as needed for the purposes described above or as the law requires. We use reasonable administrative, technical and physical safeguards to protect it. No method of transmission or storage is completely secure.

## Your choices and rights
Depending on where you live, you may have the right to request access to, correction of, or deletion of your personal information, and to opt out of certain uses. To make a request, contact us using the details below. We will not discriminate against you for exercising these rights.

## Children
This website is not directed to children under 13, and we do not knowingly collect personal information from them.

## Changes to this policy
We may update this policy from time to time. The effective date below shows when it was last revised.

## Contact us
Questions about this policy? ${contactLine}`;

  if (kind === 'terms') return `These terms govern your use of this website, operated by ${legal} ("${name}", "we", "us"). By using the website you agree to these terms. If you do not agree, please do not use the website.

## Use of this website
You may use this website for lawful purposes only. You agree not to interfere with its operation, attempt to gain unauthorized access to it, or use it to transmit harmful or unlawful material.

## Products, services and pricing
We make every effort to describe our products, services and prices accurately. Descriptions, availability and prices may change without notice, and we reserve the right to correct errors. Any quote, booking or order is subject to our confirmation.

## Payments
Payments are processed securely by a third-party payment processor. By submitting payment information you confirm that you are authorized to use the payment method. Refunds and cancellations are handled according to the policy communicated at the time of purchase.

## Intellectual property
The content on this website, including text, images, logos and design, belongs to ${legal} or its licensors and is protected by law. You may not copy or reuse it without our written permission.

## Third-party links
This website may link to websites we do not control. We are not responsible for their content or practices.

## Disclaimer
This website is provided "as is" and "as available". To the fullest extent permitted by law, we disclaim all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose and non-infringement.

## Limitation of liability
To the fullest extent permitted by law, ${legal} will not be liable for any indirect, incidental, special or consequential damages arising from your use of this website.

## Governing law
These terms are governed by the laws of ${state ? `the State of ${state}` : 'the state in which we operate'}, without regard to its conflict of law rules.

## Changes to these terms
We may update these terms from time to time. Your continued use of the website after changes are posted means you accept the revised terms.

## Contact us
Questions about these terms? ${contactLine}`;

  if (kind === 'policies') return `These policies explain how ${name} handles orders, payments, cancellations and refunds. If anything here is unclear, please ask before you buy or book.

## Orders and bookings
Orders and appointments are confirmed once you receive a confirmation from us. If we cannot fulfil a request, we will let you know promptly and refund any amount already paid.

## Payments
We accept Visa, Mastercard, American Express and Discover. Unless we have agreed otherwise, you pay when you pick up or receive your order, or online through our payment link where we offer one. Prices are shown in U.S. dollars and may be subject to applicable taxes.

## Cancellations and changes
Please give us as much notice as you can if you need to cancel or reschedule. We ask for at least 24 hours' notice for appointments and reservations. Late cancellations and missed appointments may be subject to a fee.

## Returns and refunds
If you are not satisfied with a purchase, contact us within 30 days and we will work with you to make it right. Approved refunds are returned to the original payment method, usually within 5 to 10 business days. Custom, perishable and final-sale items cannot be returned unless they arrive damaged or defective.

## Pickup and delivery
Where pickup or delivery is offered, estimated times are provided in good faith and may vary. Please check your order when you receive it and tell us right away about any problem.

## Contact us
Questions about an order or these policies? ${contactLine}`;

  return `${name} is committed to making this website usable by everyone, including people with disabilities.

## Our standard
We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA. This website is built with readable type, sufficient colour contrast, keyboard-accessible navigation and layouts that adapt to any screen size and zoom level.

## Ongoing effort
Accessibility is an ongoing effort. We review this website regularly and work to resolve issues as we find them.

## Feedback
If you have difficulty using any part of this website, or need information in another format, please let us know and we will do our best to help. ${contactLine}`;
}

/* ---------- Online ordering ---------- */

export const ORDER_METHODS = {
  pickup: { name: 'Pickup', blurb: 'Takeout orders collected at the counter' },
  curbside: { name: 'Curbside', blurb: 'You bring the order out to their car' },
  delivery: { name: 'Delivery', blurb: 'You deliver to their address' },
};
export const ORDER_STATUSES = { new: 'Received', confirmed: 'Confirmed', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled' };
export const readyLabel = (method, lang = 'en') => { const T = STRINGS[lang] || STRINGS.en; return method === 'delivery' ? T.outDelivery : method === 'curbside' ? T.readyCurb : T.readyPickup; };

export const money = (cents) => { const c = Math.round(Number(cents) || 0); return `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`; };

/** "$1,234.50", "12", "9,50", "Free" → cents. Returns null when it is not a price. */
export function parsePrice(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  if (/^(free|no charge|n\/c)$/i.test(raw)) return 0;
  if (/-\s*\d|\(\s*\$?\d/.test(raw)) return null;
  let t = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return null;
  const last = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
  if (last >= 0) {
    const decimals = t.length - last - 1, seps = t.match(/[.,]/g).length;
    // Three digits after a lone dot could be cents typed wrong (1.250), so it is not guessed; a comma there, or several groups, means thousands.
    if (decimals === 3 && seps === 1 && t[last] === '.') return null;
    if (decimals > 3) return null;
    t = decimals >= 1 && decimals <= 2 ? `${t.slice(0, last).replace(/[.,]/g, '')}.${t.slice(last + 1)}` : t.replace(/[.,]/g, '');
  }
  const n = Math.round(parseFloat(t) * 100);
  return Number.isFinite(n) && n >= 0 && n <= 100_000_00 ? n : null;
}

/** Reads CSV text into rows. Handles quotes, line breaks inside quotes, and comma, semicolon or tab separators. */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] || '';
  const count = (ch) => first.split(ch).length - 1;
  const sep = count('\t') > count(',') && count('\t') >= count(';') ? '\t' : count(';') > count(',') ? ';' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
    } else if (c === '"' && cell.trim() === '') { cell = ''; quoted = true; }
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ''));
}

const COLS = [
  ['category', /^(menu\s*)?(categor(y|ies)|section|group|department|type)$/i],
  ['name', /^((item|product|menu\s*item|dish)(\s*name)?|name|title)$/i],
  ['cost', /^(unit\s*|item\s*)?cost$/i],
  ['price', /price|cost|amount|^\$$/i],
  ['desc', /desc|details|notes?$/i],
  ['stock', /stock|qty|quantity|inventory|on\s*hand|count/i],
  ['image', /image|photo|picture|img/i],
  ['available', /availab|active|enabled|in\s*stock|visible/i],
  ['taxable', /tax/i],
];

export const MENU_TEMPLATE_CSV = `Category,Item name,Price,Description,Stock,Photo URL
Tacos,Taco al pastor,3.50,"Marinated pork, pineapple, onion and cilantro",,
Tacos,Carne asada taco,3.75,"Grilled steak, onion and cilantro",,
Plates,Enchiladas verdes,12.99,"Three chicken enchiladas with rice and beans",,
Drinks,Horchata,3.00,House-made rice and cinnamon drink,40,
Desserts,Churros,5.50,"Cinnamon sugar, chocolate sauce",12,
`;

/** Turns an uploaded item list into menu items. Only a name and a price are required on each row. */
export function parseMenuCsv(text) {
  const rows = parseCsv(text);
  const out = { items: [], errors: [], rows: 0 };
  if (!rows.length) { out.errors.push({ row: 0, reason: 'The file is empty.' }); return out; }
  let map = {};
  const head = rows[0];
  head.forEach((h, i) => { const hit = COLS.find(([key, re]) => map[key] === undefined && re.test(h)); if (hit) map[hit[0]] = i; });
  if (map.price === undefined && map.cost !== undefined) { map.price = map.cost; delete map.cost; }
  let body = rows.slice(1);
  let offset = 2;
  if (map.name === undefined || map.price === undefined) {
    // No header row: work out which column holds prices from the data itself.
    const width = Math.max(...rows.map((r) => r.length));
    const score = (i) => rows.filter((r) => /\d/.test(r[i] || '') && parsePrice(r[i]) !== null && !/[a-z]{3,}/i.test(r[i])).length;
    let priceCol = -1;
    for (let i = 1; i < width; i++) if (score(i) >= rows.length * 0.6 && (priceCol < 0 || score(i) > score(priceCol))) priceCol = i;
    if (priceCol < 0) { out.errors.push({ row: 1, reason: 'We could not find a column of item names and a column of prices. Download the template to see the layout.' }); return out; }
    map = { name: priceCol - 1, price: priceCol, category: priceCol >= 2 ? priceCol - 2 : undefined, desc: priceCol + 1 < width ? priceCol + 1 : undefined };
    const firstIsHeader = parsePrice(head[priceCol]) === null || !/\d/.test(head[priceCol] || '');
    body = firstIsHeader ? rows.slice(1) : rows; offset = firstIsHeader ? 2 : 1;
  }
  const get = (r, k) => (map[k] === undefined ? '' : str(r[map[k]], 2000).trim());
  let category = '';
  body.forEach((r, i) => {
    out.rows++;
    const row = i + offset;
    const name = get(r, 'name');
    const priceText = get(r, 'price');
    if (get(r, 'category')) category = get(r, 'category').slice(0, 60);
    if (!name && !priceText) return;
    if (!name) return out.errors.push({ row, reason: 'Missing item name.' });
    const price = parsePrice(priceText);
    if (price === null) return out.errors.push({ row, reason: priceText ? `“${priceText.slice(0, 20)}” is not a price.` : `No price for “${name.slice(0, 40)}”.` });
    if (out.items.length >= 1000) return out.errors.push({ row, reason: 'Only the first 1,000 items are imported.' });
    const stockText = get(r, 'stock');
    const stock = /^\d{1,6}$/.test(stockText) ? Number(stockText) : null;
    const avail = get(r, 'available');
    const costText = get(r, 'cost');
    out.items.push({
      category: category || 'Menu', name: name.slice(0, 120), price, desc: get(r, 'desc').slice(0, 500), stock,
      image: /^https:\/\/\S+$/i.test(get(r, 'image')) ? get(r, 'image').slice(0, 500) : '',
      available: !/^(no|n|false|0|off|hidden|unavailable|sold\s*out)$/i.test(avail),
      taxable: !/^(no|n|false|0|off|exempt|none|non-?taxable)$/i.test(get(r, 'taxable')),
      cost: costText ? parsePrice(costText) : null,
    });
  });
  if (!out.items.length && !out.errors.length) out.errors.push({ row: 0, reason: 'No items were found in the file.' });
  return out;
}

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const TIMEZONES = { 'America/New_York': 'Eastern', 'America/Chicago': 'Central', 'America/Denver': 'Mountain', 'America/Phoenix': 'Arizona', 'America/Los_Angeles': 'Pacific', 'America/Anchorage': 'Alaska', 'Pacific/Honolulu': 'Hawaii' };
const hhmm = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? v : d);
const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export function defaultOrdering() {
  return {
    enabled: false, accepting: true,
    methods: { pickup: true, curbside: false, delivery: false },
    prepMinutes: 20, deliveryMinutes: 45, deliveryFee: 0, deliveryMin: 0, deliveryArea: '',
    pickupNote: '', curbsideNote: 'Park in a curbside space and call us when you arrive.',
    taxRate: 0, tips: true, allowNotes: true, notifyEmail: '',
    useHours: false, timezone: 'America/Chicago', scheduling: false,
    hours: DAYS.map(() => ({ closed: false, open: '11:00', close: '21:00' })),
    promos: [], cats: [], zones: [], loyalty: { enabled: false, every: 10, type: 'amount', value: 500 },
    slotLimit: 0, deals: [], dailySummary: true, lowStockAt: 5,
    modGroups: [], menus: [], dayparts: [], labels: [], revClasses: [], discounts: [],
    booking: { enabled: false, title: 'Book online', note: '', perSlot: 2, services: [] },
  };
}
const ID_CHARS = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';
/** A 13-character id that stays the same for the same text (used for categories until one is stored). */
export function steadyId(text) {
  let a = 0x811c9dc5, b = 0x01000193;
  for (const ch of String(text)) { const c = ch.codePointAt(0); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ (c * 31), 0x5bd1e995) >>> 0; }
  let out = '', n = BigInt(a) * 4294967296n + BigInt(b);
  for (let i = 0; i < 13; i++) { out += ID_CHARS[Number(n % 31n)]; n /= 31n; }
  return out;
}
const int = (v, min, max, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
export function normalizeOrdering(input) {
  const d = defaultOrdering();
  const o = input && typeof input === 'object' ? input : {};
  const m = o.methods && typeof o.methods === 'object' ? o.methods : d.methods;
  const rate = Number(o.taxRate);
  const dayparts = arr(o.dayparts).slice(0, 20).map((x, i) => ({ id: str(x?.id, 24) || `p${i}`, name: str(x?.name, 40).trim(), days: DAYS.map((_, dd) => arr(x?.days)[dd] !== false), from: hhmm(x?.from, ''), to: hhmm(x?.to, '') })).filter((x) => x.name);
  const partIds = new Set(dayparts.map((x) => x.id));
  const catIds = new Set();
  // A stored category ID is kept only if it looks like one; two categories never share an ID.
  const catId = (c, name) => { let cid = typeof c?.id === 'string' && /^[A-Z0-9]{13}$/.test(c.id) ? c.id : steadyId(name.toLowerCase()); for (let n = 2; catIds.has(cid); n++) cid = steadyId(`${name.toLowerCase()}#${n}`); catIds.add(cid); return cid; };
  return {
    enabled: o.enabled === true, accepting: o.accepting !== false,
    methods: { pickup: m.pickup === true, curbside: m.curbside === true, delivery: m.delivery === true },
    prepMinutes: int(o.prepMinutes, 0, 600, d.prepMinutes), deliveryMinutes: int(o.deliveryMinutes, 0, 600, d.deliveryMinutes),
    deliveryFee: int(o.deliveryFee, 0, 1_000_00, 0), deliveryMin: int(o.deliveryMin, 0, 10_000_00, 0), deliveryArea: str(o.deliveryArea, 300),
    pickupNote: str(o.pickupNote, 300), curbsideNote: str(o.curbsideNote ?? d.curbsideNote, 300),
    taxRate: Number.isFinite(rate) ? Math.min(30, Math.max(0, Math.round(rate * 1000) / 1000)) : 0,
    tips: o.tips !== false, allowNotes: o.allowNotes !== false, notifyEmail: str(o.notifyEmail, 200).trim(),
    useHours: o.useHours === true, timezone: Object.hasOwn(TIMEZONES, o.timezone) ? o.timezone : d.timezone, scheduling: o.scheduling === true,
    hours: DAYS.map((_, i) => { const h = arr(o.hours)[i] || {}; return { closed: h.closed === true, open: hhmm(h.open, '11:00'), close: hhmm(h.close, '21:00') }; }),
    promos: arr(o.promos).slice(0, 30).map((x) => ({ code: str(x?.code, 24).toUpperCase().replace(/[^A-Z0-9]/g, ''), type: x?.type === 'amount' ? 'amount' : 'percent', value: x?.type === 'amount' ? int(x?.value, 0, 1_000_00, 0) : int(x?.value, 0, 100, 10), active: x?.active !== false })).filter((x) => x.code),
    cats: arr(o.cats).slice(0, 200).map((c) => ({ name: str(c?.name, 60).trim(), c })).filter((x) => x.name).map(({ name, c }) => ({ id: catId(c, name), name, hidden: c?.hidden === true, from: hhmm(c?.from, ''), to: hhmm(c?.to, '') })),   // kept even when plain, so a new empty category stays until items are added
    zones: arr(o.zones).slice(0, 30).map((z) => ({ zips: [...new Set((Array.isArray(z?.zips) ? z.zips.join(' ') : str(z?.zips, 2000)).match(/\b\d{5}\b/g) || [])].slice(0, 200), fee: int(z?.fee, 0, 1_000_00, 0) })).filter((z) => z.zips.length),
    loyalty: { enabled: o.loyalty?.enabled === true, every: int(o.loyalty?.every, 2, 50, 10), type: o.loyalty?.type === 'percent' ? 'percent' : 'amount', value: o.loyalty?.type === 'percent' ? int(o.loyalty?.value, 1, 100, 10) : int(o.loyalty?.value, 1, 1_000_00, 500) },
    slotLimit: int(o.slotLimit, 0, 500, 0),
    deals: arr(o.deals).slice(0, 20).map((x) => ({ name: str(x?.name, 40).trim() || 'Happy hour', percent: int(x?.percent, 1, 90, 10), from: hhmm(x?.from, '15:00'), to: hhmm(x?.to, '18:00'), days: DAYS.map((_, i) => arr(x?.days)[i] !== false), category: str(x?.category, 60).trim(), active: x?.active !== false })),
    dailySummary: o.dailySummary !== false, lowStockAt: int(o.lowStockAt, 0, 9999, 5),
    // Inventory lists: reusable modifier groups, menus, printer labels, revenue classes and named discounts.
    modGroups: arr(o.modGroups).slice(0, 100).map((g, i) => ({ id: str(g?.id, 24) || `g${i}`, name: str(g?.name, 60).trim(), onlineName: str(g?.onlineName, 60).trim(), required: g?.required === true, multi: g?.multi === true, choices: cleanChoices(g?.choices) })).filter((g) => g.name),
    menus: arr(o.menus).slice(0, 30).map((m2, i) => ({ id: str(m2?.id, 24) || `m${i}`, name: str(m2?.name, 60).trim(), cats: [...new Set(arr(m2?.cats).map((c) => str(c, 60).trim()).filter(Boolean))].slice(0, 100), from: hhmm(m2?.from, ''), to: hhmm(m2?.to, ''), days: DAYS.map((_, d) => arr(m2?.days)[d] !== false), dayparts: [...new Set(arr(m2?.dayparts).map((x) => str(x, 24)).filter((x) => partIds.has(x)))], active: m2?.active !== false })).filter((m2) => m2.name),
    dayparts,
    labels: [...new Set(arr(o.labels).map((x) => str(x, 40).trim()).filter(Boolean))].slice(0, 40),
    revClasses: [...new Set(arr(o.revClasses).map((x) => str(x, 40).trim()).filter(Boolean))].slice(0, 40),
    discounts: arr(o.discounts).slice(0, 60).map((x, i) => ({ id: str(x?.id, 24) || `d${i}`, name: str(x?.name, 60).trim(), type: x?.type === 'amount' ? 'amount' : 'percent', value: x?.type === 'amount' ? int(x?.value, 0, 1_000_000_00, 0) : int(x?.value, 0, 100, 10) })).filter((x) => x.name),
    booking: { enabled: o.booking?.enabled === true, title: str(o.booking?.title ?? 'Book online', 60).trim() || 'Book online', note: str(o.booking?.note, 300), perSlot: int(o.booking?.perSlot, 1, 200, 2), services: arr(o.booking?.services).slice(0, 40).map((x, i2) => ({ id: str(x?.id, 24) || `s${i2}`, name: str(x?.name, 80).trim(), minutes: int(x?.minutes, 0, 600, 60), price: int(x?.price, 0, 1_000_000_00, 0) })).filter((x) => x.name) },
  };
}
export const openMethods = (o) => Object.keys(ORDER_METHODS).filter((k) => o?.methods && Object.hasOwn(o.methods, k) && o.methods[k]);

export const findPromo = (o, code) => { const c = str(code, 24).toUpperCase().replace(/[^A-Z0-9]/g, ''); return (c && arr(o?.promos).find((x) => x.active && x.code === c)) || null; };

/** The one place order totals are calculated. Amounts are in cents. */
export function orderTotals(lines, method, ordering, tipPercent = 0, promo = null, zoneFee = null) {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const discount = !promo ? 0 : promo.type === 'amount' ? Math.min(subtotal, promo.value) : Math.round((subtotal * promo.value) / 100);
  // Tax applies only to taxable items; a discount is spread evenly across the order.
  const taxable = lines.reduce((sum, l) => sum + (l.taxable === false ? 0 : l.price * l.qty), 0);
  const tax = subtotal ? Math.round(((taxable - (discount * taxable) / subtotal) * (ordering.taxRate || 0)) / 100) : 0;
  const fee = method === 'delivery' ? (zoneFee ?? ordering.deliveryFee ?? 0) : 0;
  const tip = ordering.tips ? Math.round((subtotal * Math.min(100, Math.max(0, Number(tipPercent) || 0))) / 100) : 0;
  return { subtotal, discount, tax, fee, tip, total: subtotal - discount + tax + fee + tip };
}

/* Opening hours work on "wall clock" time in the business's time zone. */
const WALL_FORMAT = new Map(), WALL_SHIFT = new Map();
export function wallNow(ordering, nowMs = Date.now()) {
  // The clock difference only changes on the hour at most, so it is worked out once per hour and reused: reports call this for every order.
  const zone = ordering.timezone || 'America/Chicago', hour = Math.floor(nowMs / 3600000), key = `${zone}|${hour}`;
  let shift = WALL_SHIFT.get(key);
  if (shift === undefined) {
    let f = WALL_FORMAT.get(zone);
    if (!f) WALL_FORMAT.set(zone, f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }));
    const at = hour * 3600000;
    const p = Object.fromEntries(f.formatToParts(new Date(at)).map((x) => [x.type, Number(x.value)]));
    shift = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - at;
    if (WALL_SHIFT.size > 50000) WALL_SHIFT.clear();
    WALL_SHIFT.set(key, shift);
  }
  return Math.floor(nowMs / 60000) * 60000 + shift;
}
export function openAtWall(ordering, wall) {
  if (!ordering.useHours) return true;
  const d = new Date(wall);
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  const today = ordering.hours[d.getUTCDay()], prev = ordering.hours[(d.getUTCDay() + 6) % 7];
  const late = (h) => mins(h.close) <= mins(h.open);   // closes after midnight
  if (!today.closed && m >= mins(today.open) && (late(today) || m < mins(today.close))) return true;
  return !prev.closed && late(prev) && m < mins(prev.close);
}
export const isOpenNow = (ordering, nowMs) => openAtWall(ordering, wallNow(ordering, nowMs));
export const slotValue = (wall) => new Date(wall).toISOString().slice(0, 16);
const clock = (wall) => { const d = new Date(wall); const h = d.getUTCHours(), m = d.getUTCMinutes(); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
export function slotLabel(value, ordering, lang = 'en', nowMs = Date.now()) {
  const wall = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wall)) return '';
  const day = Math.floor(wall / 86400000) - Math.floor(wallNow(ordering, nowMs) / 86400000);
  const T = STRINGS[lang] || STRINGS.en;
  return `${day === 0 ? T.today : day === 1 ? T.tomorrow : new Date(wall).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })} ${clock(wall)}`;
}
/** Times a customer may schedule an order for: every 15 minutes, today and tomorrow, while open. */
/** The timed price (happy hour) that applies to an item right now, if any. The biggest saving wins. */
export function dealFor(item, ordering, nowMs = Date.now()) {
  const deals = arr(ordering?.deals).filter((x) => x.active !== false);
  if (!deals.length) return null;
  const d = new Date(wallNow(ordering, nowMs));
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  let best = null;
  for (const x of deals) {
    if (x.category && x.category !== item.category) continue;
    const a = mins(x.from), b = mins(x.to);
    // A window that runs past midnight belongs to the day it started on.
    const on = a <= b ? m >= a && m < b && x.days[d.getUTCDay()] !== false : (m >= a && x.days[d.getUTCDay()] !== false) || (m < b && x.days[(d.getUTCDay() + 6) % 7] !== false);
    if (on && (!best || x.percent > best.percent)) best = x;
  }
  return best;
}
/** The menu with timed prices applied, so every page and every total uses the same price. */
export function pricedMenu(menu, ordering, nowMs = Date.now()) {
  if (!arr(ordering?.deals).length) return arr(menu);
  return arr(menu).map((it) => { const deal = dealFor(it, ordering, nowMs); return deal && deal.percent > (it.sale || 0) ? { ...it, sale: deal.percent, deal: deal.name } : it; });
}
/** Counts toward the kitchen limit: `taken` maps a time slot to the orders already booked for it. */
export function orderSlots(ordering, method = 'pickup', nowMs = Date.now(), taken = null) {
  if (!ordering.scheduling) return [];
  const now = wallNow(ordering, nowMs);
  const lead = (method === 'delivery' ? ordering.deliveryMinutes : ordering.prepMinutes) || 0;
  const first = Math.ceil((now + lead * 60000) / 900000) * 900000;
  const end = (Math.floor(now / 86400000) + 2) * 86400000;
  const out = [];
  const cap = ordering.slotLimit || 0;
  for (let w = first; w < end && out.length < 200; w += 900000) if (openAtWall(ordering, w) && !(cap && taken && (taken[slotValue(w)] || 0) >= cap)) out.push(slotValue(w));
  return out;
}

/** The delivery zone for a ZIP code, or null when delivery is limited to zones and this one is not covered. */
export const zoneFor = (o, zip) => arr(o?.zones).find((z) => z.zips.includes((String(zip ?? '').match(/\d{5}/) || [''])[0])) || null;
export const rewardText = (l) => (l.type === 'percent' ? `${l.value}%` : money(l.value));

/** Items customers can see right now: hidden categories and categories outside their hours are left out. */
export function visibleMenu(menu, ordering, nowMs = Date.now()) {
  // An item switched off ('Available to order' off, or hidden from the menu) is not shown to customers at all; sold out is only for stock 0.
  const items = arr(menu).filter((x) => x.available !== false);
  const metas = arr(ordering?.cats), menus = arr(ordering?.menus).filter((x) => x.cats.length);
  if (!metas.length && !menus.length) return items;
  const d = new Date(wallNow(ordering, nowMs));
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  const inWindow = (from, to) => !from || !to || (mins(from) <= mins(to) ? m >= mins(from) && m < mins(to) : m >= mins(from) || m < mins(to));
  const off = new Set(metas.filter((c) => c.hidden || !inWindow(c.from, c.to)).map((c) => c.name));
  // A category placed in one or more published menus shows only while one of those menus is on. A menu not published yet changes nothing.
  const listed = new Set(menus.filter((x) => x.active).flatMap((x) => x.cats));
  // A menu with dayparts is on during any of them; one without keeps its own days and times.
  const parts = arr(ordering?.dayparts), day = d.getUTCDay();
  // A window that runs past midnight counts after midnight as part of the day it started.
  const onDay = (days, from, to) => (!from || !to || mins(from) <= mins(to) ? days[day] !== false && inWindow(from, to) : (m >= mins(from) && days[day] !== false) || (m < mins(to) && days[(day + 6) % 7] !== false));
  const live = (x) => { const own = arr(x.dayparts).map((pid) => parts.find((p) => p.id === pid)).filter(Boolean); return own.length ? own.some((p) => onDay(p.days, p.from, p.to)) : onDay(x.days, x.from, x.to); };
  const on = new Set(menus.filter((x) => x.active && live(x)).flatMap((x) => x.cats));
  return items.filter((x) => !off.has(x.category) && (!listed.has(x.category) || on.has(x.category)));
}
/** Adds the choices of any modifier groups an item is linked to, after the item's own options. */
export function applyMods(menu, ordering) {
  const groups = arr(ordering?.modGroups);
  if (!groups.length) return arr(menu);
  // Carts and "Order again" remember choices by position, so positions never move: a modifier hidden online stays in the list marked
  // hidden, groups keep the item's own order, and rank (the place in the modifier group layout) is the order customers see them in.
  const shown = (g, rank) => {
    const choices = arr(g.choices).map((c) => (c.online === false ? { ...c, hidden: true } : c.inStock === false ? { ...c, soldOut: true } : c));
    return { name: g.onlineName || g.name, required: g.required && choices.some((c) => !c.hidden), multi: g.multi, rank, choices };
  };
  return arr(menu).map((it) => {
    const extra = arr(it.mods).map((gid) => groups.findIndex((g) => g.id === gid)).filter((i) => i >= 0).map((i) => shown(groups[i], i));
    // A required group whose shown choices are all sold out leaves nothing to pick, so the item cannot be ordered right now.
    const blocked = extra.some((g) => g.required && !g.choices.some((c) => !c.hidden && !c.soldOut));
    return extra.length ? { ...it, options: [...arr(it.options), ...extra], ...(blocked ? { blocked: true } : {}) } : it;
  });
}

/** What an item costs right now, after any sale discount. */
export const itemPrice = (it) => (it.sale > 0 ? Math.round((it.price * (100 - Math.min(90, it.sale))) / 100) : it.price);
export const DEFAULT_STOCK = 100;

/* Item options: sizes, add-ons and choices. */
/** Modifiers: name and price; "online: false" hides one on the order page, "inStock: false" shows it as sold out. */
export const cleanChoices = (input) => arr(input).slice(0, 30).map((c) => ({ name: str(c?.name, 80).trim(), price: int(c?.price, 0, 1_000_00, 0), online: c?.online !== false, inStock: c?.inStock !== false })).filter((c) => c.name);
export function cleanOptions(input) {
  return arr(input).slice(0, 12).map((g) => ({
    name: str(g?.name, 60).trim(), required: g?.required === true, multi: g?.multi === true, choices: cleanChoices(g?.choices),
  })).filter((g) => g.name && g.choices.length);
}
/** "Large +1.50" per line → choices. */
export const parseChoices = (text) => str(text, 4000).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)[\s,;:-]*\+?\s*\$?\s*(\d+(?:[.,]\d{1,2})?)\s*$/); return m && m[1].trim() ? { name: m[1].trim(), price: parsePrice(m[2]) || 0 } : { name: l, price: 0 }; });
export const choicesText = (choices) => arr(choices).map((c) => (c.price ? `${c.name} +${(c.price / 100).toFixed(2)}` : c.name)).join('\n');
/** Checks a customer's picks against an item. Returns { price, labels } or an error message. */
export function resolveOptions(item, picks, lang = 'en') {
  const groups = arr(item.options), es = lang === 'es';
  let extra = 0; const labels = [];
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g], gn = grp.name.toLowerCase();
    const chosen = [...new Set(arr(arr(picks)[g]).map(Number))].filter((i) => Number.isInteger(i) && grp.choices[i]);
    if (grp.required && !chosen.length) return { error: es ? `Elige ${gn} para ${item.name}.` : `Choose ${gn} for ${item.name}.` };
    if (!grp.multi && chosen.length > 1) return { error: es ? `Elige solo una opción de ${gn} para ${item.name}.` : `Choose only one ${gn} for ${item.name}.` };
    for (const i of chosen) { const cn = grp.choices[i].name; if (grp.choices[i].hidden) return { error: es ? `${cn} no está disponible.` : `${cn} is not available.` }; if (grp.choices[i].soldOut) return { error: es ? `${cn} está agotado.` : `${cn} is sold out.` }; extra += grp.choices[i].price; labels.push(grp.choices[i].name); }
  }
  return { price: itemPrice(item) + extra, labels };
}

/* Words that appear on merchant sites, in English and Spanish. */
export const LANGS = { en: 'English', es: 'Español' };
export const STRINGS = {
  en: {
    orderOnline: 'Order online', bookOnline: 'Book online', add: 'Add', added: 'Added', soldOut: 'Sold out', onlyLeft: 'Only {n} left', yourOrder: 'Your order', emptyCart: 'Add items from the menu to get started.', paused: 'Online ordering is paused right now.',
    closedNow: 'We are closed right now.', busyNow: 'We have as many orders as we can make right now. Please try again in a few minutes.', busySchedule: 'We have as many orders as we can make right now. You can choose a later time.', search: 'Search the menu', noMatch: 'Nothing on the menu matches that.', closedSchedule: 'We are closed right now. You can schedule an order for later.', notTaking: 'We are not taking online orders right now. Please check back soon or give us a call.',
    name: 'Name', phone: 'Phone', emailConfirm: 'Email for your confirmation', address: 'Delivery address', vehicle: 'Vehicle make, model and colour', notes: 'Notes for us', tip: 'Add a tip', none: 'None',
    subtotal: 'Subtotal', discount: 'Discount', tax: 'Tax', delivery: 'Delivery', tipLine: 'Tip', total: 'Total', place: 'Place order', placing: 'Placing order…', pausedBtn: 'Ordering is paused',
    pickup: 'Pickup', curbside: 'Curbside', when: 'When', asap: 'As soon as possible', today: 'Today', tomorrow: 'Tomorrow', inAbout: 'in about {n} minutes',
    promo: 'Promo code or gift card', apply: 'Apply', promoBad: 'That code is not valid.', giftCard: 'Gift card', toPay: 'Left to pay', giftLeft: 'Left on gift card', giftPaid: 'Paid in full with your gift card.', refunded: 'Refunded', giftBack: 'Your gift card balance was put back.', nothingOwed: 'Nothing is owed for this order.', paidWith: 'Paid · {method}', pricesChanged: 'Prices just changed. Updating your order…', minOrder: 'Delivery orders start at {a}. Add {b} more.', fillAll: 'Please fill in every field so we can get your order to you.', badEmail: 'Enter a valid email address for your confirmation.',
    failed: 'We could not place your order. Please try again or call us.', viewOrder: 'View order', item: 'item', items: 'items', choose: 'Choose', required: 'Required', optional: 'Optional', noChoice: 'None', badEmailPlain: 'Enter a valid email address.', formFailed: 'Something went wrong. Please try again, or contact us directly.', addToOrder: 'Add to order', cancel: 'Cancel', close: 'Close',
    orderAhead: 'Order ahead for {ways}.', readyIn: 'Most orders are ready in about {n} minutes.', or: 'or', menuSoon: 'Our menu is being updated. Please check back soon.',
    payLater: 'Payment is collected when you receive your order.', payEither: 'You can pay online after placing your order, or when you receive it.', payOnline: 'Pay online', orPayLater: 'Or pay when you receive your order.',
    order: 'Order', received: 'Received', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', readyPickup: 'Ready for pickup', readyCurb: 'Ready for curbside', outDelivery: 'Out for delivery',
    h_new: 'We have your order.', h_confirmed: 'Your order is confirmed.', h_ready: 'Your order is ready.', h_way: 'Your order is on its way.', h_done: 'Thank you. Enjoy!', h_cancel: 'This order was cancelled.',
    s_newQuiet: 'Thanks, {name}. We will update this page as your order moves along.',
    s_new: 'Thanks, {name}. We sent a confirmation to {email} and will update this page as your order moves along.', s_live: 'This page updates automatically.', s_cancel: 'If this is a surprise, please get in touch with us.',
    details: 'details', yourItems: 'Your items', deliverTo: 'Deliver to', vehicleShort: 'Vehicle', notesShort: 'Notes', scheduledFor: 'Scheduled for', call: 'Call', backHome: 'Back to home', orderAgain: 'Order again',
    explore: 'Explore', contact: 'Contact', legal: 'Legal', location: 'Location', hours: 'Hours', directions: 'Get directions', rights: 'All rights reserved.', cards: 'Visa · Mastercard · American Express · Discover accepted', websiteBy: 'Website by',
    email: 'Email', message: 'Message', send: 'Send message', sent: 'Message sent', sentSub: 'Thank you. We will be in touch soon.', agree: 'By sending this message you agree to our', onlyReply: 'We only use your details to reply to you.',
    invCancelled: 'This invoice was cancelled', voidTotal: 'Total (cancelled)', validUntil: 'Valid until', estimate: 'Estimate', estTotal: 'Estimated total', invoice: 'Invoice', billTo: 'Bill to', issued: 'Issued', dueDate: 'Due', paidOn: 'Paid on', invItem: 'Description', qty: 'Qty', priceEach: 'Price', amount: 'Amount', amountDue: 'Amount due', invPaidTotal: 'Total paid', invPaid: 'Paid', invVoid: 'Cancelled', invLate: 'Past due', invOpen: 'Awaiting payment', invThanks: 'Paid. Thank you.', payNow: 'Pay {a} now', printSave: 'Print or save', payRef: 'Please include invoice {n} with your payment.', payContact: 'To pay this invoice, please contact {name}.',
    from: 'From {price}', enterZip: 'Enter your ZIP code', zip: 'ZIP code', noDelivery: 'Sorry, we do not deliver to that ZIP code.', stamps: '{n} of {m} orders toward your next reward.', rewardEarned: 'You earned a reward', rewardUse: 'Use code {code} on your next order for {value} off.',
    privacy: 'Privacy Policy', terms: 'Terms of Service', policies: 'Store Policies', accessibility: 'Accessibility', effective: 'Effective', skip: 'Skip to content', menu: 'Menu', notFound: 'Page not found.', notFoundSub: 'The page you are looking for does not exist or has moved.', learnMore: 'Learn more',
  },
  es: {
    orderOnline: 'Ordenar en línea', bookOnline: 'Reservar en línea', add: 'Agregar', added: 'Agregado', soldOut: 'Agotado', onlyLeft: 'Solo quedan {n}', yourOrder: 'Tu pedido', emptyCart: 'Agrega artículos del menú para comenzar.', paused: 'Los pedidos en línea están en pausa.',
    closedNow: 'Estamos cerrados en este momento.', busyNow: 'Tenemos todos los pedidos que podemos preparar ahora. Inténtalo de nuevo en unos minutos.', busySchedule: 'Tenemos todos los pedidos que podemos preparar ahora. Puedes elegir una hora más tarde.', search: 'Buscar en el menú', noMatch: 'Nada en el menú coincide.', closedSchedule: 'Estamos cerrados en este momento. Puedes programar un pedido para más tarde.', notTaking: 'No estamos tomando pedidos en línea en este momento. Vuelve pronto o llámanos.',
    name: 'Nombre', phone: 'Teléfono', emailConfirm: 'Correo para tu confirmación', address: 'Dirección de entrega', vehicle: 'Marca, modelo y color del vehículo', notes: 'Notas para nosotros', tip: 'Agregar propina', none: 'Ninguna',
    subtotal: 'Subtotal', discount: 'Descuento', tax: 'Impuesto', delivery: 'Entrega', tipLine: 'Propina', total: 'Total', place: 'Hacer pedido', placing: 'Enviando pedido…', pausedBtn: 'Pedidos en pausa',
    pickup: 'Para recoger', curbside: 'En la acera', when: 'Cuándo', asap: 'Lo antes posible', today: 'Hoy', tomorrow: 'Mañana', inAbout: 'en unos {n} minutos',
    promo: 'Código de promoción o tarjeta de regalo', apply: 'Aplicar', promoBad: 'Ese código no es válido.', giftCard: 'Tarjeta de regalo', toPay: 'Por pagar', giftLeft: 'Queda en la tarjeta', giftPaid: 'Pagado por completo con tu tarjeta de regalo.', refunded: 'Reembolsado', giftBack: 'El saldo de tu tarjeta de regalo fue devuelto.', nothingOwed: 'No se debe nada por este pedido.', paidWith: 'Pagado · {method}', pricesChanged: 'Los precios acaban de cambiar. Actualizando tu pedido…', minOrder: 'Los pedidos a domicilio comienzan en {a}. Agrega {b} más.', fillAll: 'Completa todos los campos para poder entregarte tu pedido.', badEmail: 'Ingresa un correo válido para tu confirmación.',
    failed: 'No pudimos enviar tu pedido. Inténtalo de nuevo o llámanos.', viewOrder: 'Ver pedido', item: 'artículo', items: 'artículos', choose: 'Elige', required: 'Obligatorio', optional: 'Opcional', noChoice: 'Ninguno', badEmailPlain: 'Ingresa un correo electrónico válido.', formFailed: 'Algo salió mal. Inténtalo de nuevo o comunícate con nosotros directamente.', addToOrder: 'Agregar al pedido', cancel: 'Cancelar', close: 'Cerrar',
    orderAhead: 'Ordena con anticipación: {ways}.', readyIn: 'La mayoría de los pedidos están listos en unos {n} minutos.', or: 'o', menuSoon: 'Estamos actualizando nuestro menú. Vuelve pronto.',
    payLater: 'El pago se realiza al recibir tu pedido.', payEither: 'Puedes pagar en línea después de ordenar, o al recibir tu pedido.', payOnline: 'Pagar en línea', orPayLater: 'O paga al recibir tu pedido.',
    order: 'Pedido', received: 'Recibido', confirmed: 'Confirmado', completed: 'Completado', cancelled: 'Cancelado', readyPickup: 'Listo para recoger', readyCurb: 'Listo en la acera', outDelivery: 'En camino',
    h_new: 'Recibimos tu pedido.', h_confirmed: 'Tu pedido está confirmado.', h_ready: 'Tu pedido está listo.', h_way: 'Tu pedido va en camino.', h_done: '¡Gracias! Que lo disfrutes.', h_cancel: 'Este pedido fue cancelado.',
    s_newQuiet: 'Gracias, {name}. Actualizaremos esta página conforme avance tu pedido.',
    s_new: 'Gracias, {name}. Enviamos una confirmación a {email} y actualizaremos esta página conforme avance tu pedido.', s_live: 'Esta página se actualiza automáticamente.', s_cancel: 'Si esto es una sorpresa, por favor contáctanos.',
    details: 'detalles', yourItems: 'Tus artículos', deliverTo: 'Entregar en', vehicleShort: 'Vehículo', notesShort: 'Notas', scheduledFor: 'Programado para', call: 'Llamar', backHome: 'Volver al inicio', orderAgain: 'Pedir de nuevo',
    explore: 'Explorar', contact: 'Contacto', legal: 'Legal', location: 'Ubicación', hours: 'Horario', directions: 'Cómo llegar', rights: 'Todos los derechos reservados.', cards: 'Aceptamos Visa · Mastercard · American Express · Discover', websiteBy: 'Sitio web por',
    email: 'Correo', message: 'Mensaje', send: 'Enviar mensaje', sent: 'Mensaje enviado', sentSub: 'Gracias. Nos pondremos en contacto pronto.', agree: 'Al enviar este mensaje aceptas nuestra', onlyReply: 'Solo usamos tus datos para responderte.',
    invCancelled: 'Esta factura fue cancelada', voidTotal: 'Total (cancelada)', validUntil: 'Válido hasta', estimate: 'Presupuesto', estTotal: 'Total estimado', invoice: 'Factura', billTo: 'Facturar a', issued: 'Emitida', dueDate: 'Vence', paidOn: 'Pagada el', invItem: 'Descripción', qty: 'Cant.', priceEach: 'Precio', amount: 'Importe', amountDue: 'Total a pagar', invPaidTotal: 'Total pagado', invPaid: 'Pagada', invVoid: 'Cancelada', invLate: 'Vencida', invOpen: 'Pendiente de pago', invThanks: 'Pagada. Gracias.', payNow: 'Pagar {a} ahora', printSave: 'Imprimir o guardar', payRef: 'Incluye la factura {n} con tu pago.', payContact: 'Para pagar esta factura, comunícate con {name}.',
    from: 'Desde {price}', enterZip: 'Ingresa tu código postal', zip: 'Código postal', noDelivery: 'Lo sentimos, no entregamos en ese código postal.', stamps: '{n} de {m} pedidos para tu próxima recompensa.', rewardEarned: 'Ganaste una recompensa', rewardUse: 'Usa el código {code} en tu próximo pedido para obtener {value} de descuento.',
    privacy: 'Política de privacidad', terms: 'Términos del servicio', policies: 'Políticas de la tienda', accessibility: 'Accesibilidad', effective: 'Vigente desde', skip: 'Ir al contenido', menu: 'Menú', notFound: 'Página no encontrada.', notFoundSub: 'La página que buscas no existe o fue movida.', learnMore: 'Más información',
  },
};
export const strings = (lang) => STRINGS[lang] || STRINGS.en;
export const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? ''));

/* ---------- invoices ---------- */
export const INVOICE_STATUSES = { draft: 'Draft', sent: 'Sent', paid: 'Paid', void: 'Void' };
/** Totals for an invoice. Tax applies to taxable lines only, after the discount. */
export function invoiceTotals(lines, taxRate = 0, discount = 0) {
  const ls = arr(lines);
  const subtotal = ls.reduce((a, l) => a + Math.round(l.price * l.qty), 0);
  const d = Math.max(0, Math.min(subtotal, Math.round(Number(discount)) || 0));
  const taxable = ls.reduce((a, l) => a + (l.taxable === false ? 0 : Math.round(l.price * l.qty)), 0);
  const tax = subtotal ? Math.round(((taxable - (d * taxable) / subtotal) * (Number(taxRate) || 0)) / 100) : 0;
  return { subtotal, discount: d, tax, total: subtotal - d + tax };
}
export const invoiceLate = (inv, today = new Date().toISOString().slice(0, 10)) => inv.status === 'sent' && !!inv.due && inv.due < today;

export const APPT_STATUSES = { pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', noshow: 'No-show' };
