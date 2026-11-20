// Shared between the server and the browser. Pure functions only — no Node or DOM APIs.

export const PLATFORM = 'Processor Freedom';

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const str = (v, max = 5000) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
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
  return /^\/u\/[\w.-]+$/.test(s) || /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}

export const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ''));

/* ---------- Colour ---------- */

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('');
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };

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

export const SECTION_TYPES = {
  hero: { name: 'Hero', blurb: 'The first thing visitors see' },
  about: { name: 'About', blurb: 'Your story, with optional photo and numbers' },
  services: { name: 'Services or menu', blurb: 'What you offer, with prices' },
  features: { name: 'Highlights', blurb: 'Reasons to choose you' },
  gallery: { name: 'Gallery', blurb: 'A grid of photos' },
  testimonials: { name: 'Reviews', blurb: 'What customers say' },
  faq: { name: 'Questions', blurb: 'Answers to common questions' },
  cta: { name: 'Call to action', blurb: 'One clear next step' },
  contact: { name: 'Contact', blurb: 'Details, hours and a message form' },
};

export const ICONS = {
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  shield: '<path d="M12 3.5l7 2.5v5.5c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6z"/><path d="M9 12l2.2 2.2L15.2 10"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0112 7.2 4.5 4.5 0 0119.5 10c0 5.4-7.5 10-7.5 10z"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c2-4 5-7 9-9"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0113 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 005.5 5.5l1.5-2 4 1.5v3a2 2 0 01-2 2A15 15 0 014.5 5.5a2 2 0 012-2z"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
  sparkle: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.500l5.2-1.800z"/><path d="M18.500 16v4M16.500 18h4"/>',
  tool: '<path d="M14.500 6a4 4 0 005 5l-9 9a2.100 2.100 0 01-3-3z"/><path d="M14.500 6l3-2.500 3 3-2.500 3"/>',
  truck: '<path d="M3 6.500h10.500v9.500H3zM13.500 10h4l3 3v3h-7z"/><circle cx="7" cy="17.500" r="1.800"/><circle cx="17" cy="17.500" r="1.800"/>',
  users: '<circle cx="9" cy="9" r="3.200"/><path d="M3 19c.500-3.200 3-5 6-5s5.500 1.800 6 5"/><path d="M15.500 6.200a3 3 0 010 5.600M18 14.500c1.700.800 2.700 2.300 3 4.500"/>',
  calendar: '<rect x="3.500" y="5" width="17" height="15" rx="2.500"/><path d="M3.500 10h17M8 3v4M16 3v4"/>',
  gift: '<rect x="3.500" y="9" width="17" height="11" rx="2"/><path d="M3.500 13h17M12 9v11M12 9c-2-4-6-3-5 0M12 9c2-4 6-3 5 0"/>',
  cup: '<path d="M5 8h11v5a5.500 5.500 0 01-11 0z"/><path d="M16 9.500h1.500a2.500 2.500 0 010 5H16M5 20h11"/>',
  scissors: '<circle cx="6.500" cy="7" r="2.500"/><circle cx="6.500" cy="17" r="2.500"/><path d="M8.500 8.500L20 18M8.500 15.500L20 6"/>',
};

/* ---------- Templates ---------- */

let seq = 0;
export const uid = (p = 's') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const sec = (type, nav, data) => ({ id: uid(type.slice(0, 2)), type, enabled: true, nav, data });
const link = (label, href) => ({ label, href });

export const SECTION_DEFAULTS = {
  hero: () => ({ eyebrow: '', title: 'A headline that says what you do', subtitle: 'One or two sentences about who you help and why it matters.', primary: link('Get in touch', '#contact'), secondary: link('', ''), image: '', layout: 'center' }),
  about: () => ({ title: 'About us', body: 'Tell your story here. How you started, what you care about, and what customers can expect when they work with you.', image: '', stats: [] }),
  services: () => ({ title: 'What we offer', subtitle: '', layout: 'cards', items: [{ name: 'First service', desc: 'A short description of what is included.', price: '', image: '' }, { name: 'Second service', desc: 'A short description of what is included.', price: '', image: '' }, { name: 'Third service', desc: 'A short description of what is included.', price: '', image: '' }] }),
  features: () => ({ title: 'Why choose us', subtitle: '', items: [{ icon: 'star', title: 'Quality first', desc: 'We sweat the details so you do not have to.' }, { icon: 'clock', title: 'On your schedule', desc: 'Fast, reliable and respectful of your time.' }, { icon: 'shield', title: 'Guaranteed', desc: 'If something is not right, we make it right.' }] }),
  gallery: () => ({ title: 'Gallery', images: [] }),
  testimonials: () => ({ title: 'What customers say', items: [{ quote: 'Add a favourite review from a customer here.', name: 'Customer name', role: '' }] }),
  faq: () => ({ title: 'Questions, answered', items: [{ q: 'A common question?', a: 'A clear, friendly answer.' }] }),
  cta: () => ({ title: 'Ready when you are', subtitle: 'Reach out today and we will take it from there.', button: link('Contact us', '#contact') }),
  contact: () => ({ title: 'Get in touch', subtitle: 'Send a message and we will get back to you shortly.', showForm: true, showHours: true }),
};

const feats = (title, items) => sec('features', '', { title, subtitle: '', items: items.map(([icon, t, desc]) => ({ icon, title: t, desc })) });
const reviews = (items) => sec('testimonials', 'Reviews', { title: 'Loved by our customers', items: items.map(([quote, name, role]) => ({ quote, name, role: role || '' })) });
const faq = (items) => sec('faq', 'FAQ', { title: 'Questions, answered', items: items.map(([q, a]) => ({ q, a })) });
const offer = (nav, title, subtitle, layout, items) => sec('services', nav, { title, subtitle, layout, items: items.map(([name, desc, price]) => ({ name, desc, price: price || '', image: '' })) });
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
        about('Our story', `${n} began with a simple idea: cook honest food with the best ingredients we can find, and treat every guest like a regular. We work with nearby farms and change the menu as the seasons do.`, [['12', 'Local farm partners'], ['4.9', 'Average guest rating'], ['7', 'Nights of service']]),
        offer('Menu', 'The menu', 'A few favourites. Ask your server about tonight’s specials.', 'list', [['Wood-fired flatbread', 'Roasted garlic, mozzarella, basil, olive oil', '$14'], ['Market salad', 'Greens, shaved fennel, citrus, toasted almonds', '$12'], ['Handmade pappardelle', 'Slow-braised short rib ragù, parmesan', '$24'], ['Pan-roasted salmon', 'Lemon butter, asparagus, herbed potatoes', '$28'], ['Half roasted chicken', 'Pan jus, charred broccolini, garlic mash', '$25'], ['Olive oil cake', 'Whipped mascarpone, seasonal fruit', '$10']]),
        gallery(),
        reviews([['Every plate felt like it was cooked just for us. Our new go-to for date night.', 'Maria S.'], ['Warm service, a great wine list, and the best pasta in town.', 'James T.'], ['We booked the back room for a birthday and they took care of everything.', 'Priya K.']]),
        cta('Planning something special?', 'We host private dinners, celebrations and team events for up to 40 guests.', link('Ask about events', '#contact')),
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
        reviews([['The croissants sell out for a reason. Get there early.', 'Dana R.'], ['My daily stop. They remember my order and my dog’s name.', 'Chris L.']]),
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
        feats('Shopping, made easy', [['gift', 'Complimentary gift wrap', 'On every purchase, all year.'], ['truck', 'Local delivery', 'Same-day delivery within the city.'], ['card', 'Easy returns', '30 days, no questions asked.']]),
        about('Independent and proud of it', `Every item at ${n} is chosen by hand. We work directly with small makers and only stock what we would bring home ourselves.`),
        gallery(),
        reviews([['The best place in town to find a gift that feels personal.', 'Alex M.'], ['Beautiful shop, lovely people, and everything is so well made.', 'Sofia B.']]),
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
        feats('The details matter', [['sparkle', 'Expert stylists', 'Continuously trained in the latest techniques.'], ['leaf', 'Clean products', 'Gentle, professional-grade and cruelty-free.'], ['calendar', 'Easy booking', 'Appointments that start on time.']]),
        about('A studio built around you', `At ${n} we believe great service starts with listening. Tell us how you live, and we will give you a look that works every day, not just the day you leave the chair.`),
        gallery(),
        reviews([['I have never had a colorist get it this right on the first visit.', 'Hannah W.'], ['Relaxing from the moment you walk in. Worth every minute.', 'Leah G.']]),
        faq([['How do I book?', 'Send us a message or call during business hours and we will find a time that works.'], ['What is your cancellation policy?', 'We ask for 24 hours’ notice so we can offer the time to another guest.'], ['Do you offer gift cards?', 'Yes, in any amount. Ask at the front desk or send us a message.']]),
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
        about('Experience you can rely on', `For years, ${n} has been the first call for clients who want things done properly. We keep our client list small so every engagement gets senior attention.`, [['15+', 'Years of experience'], ['500+', 'Clients served'], ['98%', 'Client retention']]),
        feats('Working with us', [['users', 'Senior attention', 'You work directly with the people doing the work.'], ['check', 'Plain language', 'No jargon, no surprises on the invoice.'], ['shield', 'Confidential', 'Your information is protected at every step.']]),
        reviews([['They explained our options clearly and delivered exactly what they promised.', 'Robert D.', 'Business owner'], ['Responsive, thorough, and genuinely invested in our success.', 'Angela P.', 'Operations director']]),
        faq([['How does the first consultation work?', 'We start with a 30-minute conversation to understand your situation. There is no cost and no obligation.'], ['How do you bill?', 'You receive a clear written quote before any work begins.'], ['Do you work remotely?', 'Yes. We meet in person, by phone or by video, whichever you prefer.']]),
        cta('Let’s talk about what you need.', 'The first conversation is free.', link('Book a consultation', '#contact')),
        contact('Contact us', 'Tell us a little about your situation and we will be in touch within one business day.'),
      ],
    }),
  },
  {
    id: 'home', name: 'Home Services', blurb: 'Quotes, service areas and trust', accent: '#1e8e3e', font: 'sans', radius: 'soft',
    build: (n) => ({
      tagline: 'Licensed, insured and on time',
      cta: link('Get a free quote', '#contact'),
      hours: hours(['Monday – Friday', '7:00 AM – 6:00 PM'], ['Saturday', '8:00 AM – 2:00 PM'], ['Emergencies', '24 / 7']),
      sections: [
        hero('Licensed and insured', 'Done right, the first time.', `${n} provides dependable repairs, installations and maintenance for homes and small businesses, with upfront pricing.`, link('Get a free quote', '#contact'), link('Our services', '#services'), 'split'),
        feats('Why homeowners call us', [['clock', 'On-time arrival', 'We give you a real appointment window and keep it.'], ['card', 'Upfront pricing', 'You approve the price before we start.'], ['shield', 'Work guaranteed', 'Every job is backed by a written warranty.']]),
        offer('Services', 'Services', 'No job too small.', 'cards', [['Repairs', 'Fast diagnosis and lasting fixes.'], ['Installations', 'Done to code with quality materials.'], ['Maintenance plans', 'Seasonal checkups that prevent expensive surprises.']]),
        about('Local, family owned', `${n} has served this community for years. Our technicians are background-checked, trained, and treat your home like their own.`, [['2,000+', 'Jobs completed'], ['4.9', 'Average rating'], ['1 hr', 'Typical response']]),
        gallery(),
        reviews([['Showed up when they said they would and finished ahead of schedule.', 'Mark H.'], ['Honest pricing and spotless cleanup. Highly recommend.', 'Linda C.']]),
        faq([['Are estimates free?', 'Yes. We provide free, no-obligation estimates.'], ['Which areas do you serve?', 'We serve the greater metro area. Send your address and we will confirm.'], ['Do you offer emergency service?', 'Yes, around the clock. Call us directly for the fastest response.']]),
        contact('Request a quote', 'Describe the job and we will get back to you the same day.'),
      ],
    }),
  },
  {
    id: 'fitness', name: 'Fitness & Wellness', blurb: 'Classes, memberships and trials', accent: '#4f46c8', font: 'sans', radius: 'round',
    build: (n) => ({
      tagline: 'Stronger every week',
      cta: link('Start a free trial', '#contact'),
      hours: hours(['Monday – Friday', '5:30 AM – 9:00 PM'], ['Saturday – Sunday', '7:00 AM – 5:00 PM']),
      sections: [
        hero('First class free', 'Feel stronger. Move better.', `${n} is a welcoming studio with expert coaching, small classes and programs for every level.`, link('Start a free trial', '#contact'), link('See memberships', '#memberships')),
        feats('Built around you', [['users', 'Small classes', 'Coaches who know your name and your goals.'], ['bolt', 'Smart programming', 'Structured training that keeps you progressing.'], ['heart', 'Supportive community', 'All levels welcome, always.']]),
        offer('Memberships', 'Memberships', 'No contracts. Pause or cancel any time.', 'cards', [['Drop-in', 'A single class, whenever you like.', '$22'], ['Unlimited', 'Every class, every day.', '$149 / mo'], ['Personal training', 'One-on-one sessions with a dedicated coach.', 'From $75']]),
        about('More than a workout', `${n} was founded on the idea that fitness should fit your life. Whether you are just starting or training for something big, we will meet you where you are.`),
        gallery(),
        reviews([['The coaching is on another level. I have never been this consistent.', 'Tyler N.'], ['I was nervous to start and felt at home in my first class.', 'Grace E.']]),
        contact('Try a class on us', 'Tell us a bit about your goals and we will recommend where to start.'),
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
        hero('Certified technicians', 'Back on the road, with confidence.', `${n} handles everything from oil changes to major repairs, and explains every recommendation in plain language.`, link('Schedule service', '#contact'), link('What we fix', '#services')),
        offer('Services', 'Services', 'All makes and models.', 'cards', [['Maintenance', 'Oil, filters, fluids and factory-scheduled service.', 'From $49'], ['Brakes and tires', 'Inspection, replacement, alignment and balancing.'], ['Diagnostics and repair', 'Check-engine lights, electrical, engine and transmission.']]),
        feats('The shop you can trust', [['tool', 'Certified technicians', 'Trained, experienced and equipped with the right tools.'], ['check', 'Written estimates', 'You approve every repair before we begin.'], ['shield', '12-month warranty', 'On parts and labor.']]),
        about('Family owned and operated', `${n} has kept this community moving for years. We only recommend what your vehicle actually needs.`),
        reviews([['They found the problem two other shops missed and charged less than quoted.', 'Kevin R.'], ['Straightforward and honest. I will not take my car anywhere else.', 'Diane F.']]),
        contact('Schedule service', 'Tell us your vehicle’s year, make and model, and what is going on.'),
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
export function createSite(name, templateId, o = {}) {
  const t = getTemplate(templateId);
  const n = str(name, 80).trim() || 'My Business';
  const b = t.build(n);
  return {
    v: 1,
    template: t.id,
    brand: { name: n, tagline: b.tagline, logo: '', logoMode: 'text' },
    theme: { accent: isHex(o.accent) ? o.accent : t.accent, mode: o.mode === 'dark' ? 'dark' : 'light', font: FONTS[o.font] ? o.font : t.font, radius: RADII[o.radius] ? o.radius : t.radius },
    business: { legalName: '', email: str(o.email, 200), phone: str(o.phone, 40), address1: str(o.address1, 200), city: str(o.city, 80), state: str(o.state, 80), zip: str(o.zip, 20), hours: b.hours, payUrl: '' },
    social: { instagram: '', facebook: '', tiktok: '', x: '', youtube: '', linkedin: '' },
    header: { sticky: true, cta: b.cta, showPhone: false },
    announcement: { enabled: false, text: '', href: '' },
    sections: b.sections,
    footer: { blurb: '', showPayments: true, showCredit: true },
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
  out.brand.name = str(out.brand.name, 80).trim() || base.brand.name;
  if (!isHex(out.theme.accent)) out.theme.accent = base.theme.accent;
  if (!FONTS[out.theme.font]) out.theme.font = base.theme.font;
  if (!RADII[out.theme.radius]) out.theme.radius = base.theme.radius;
  out.theme.mode = out.theme.mode === 'dark' ? 'dark' : 'light';
  out.business.hours = arr(out.business.hours).map(obj);
  out.header.cta = { label: '', href: '', ...obj(out.header.cta) };
  const L = obj(s.legal);
  out.legal = { effective: str(L.effective, 60) || base.legal.effective };
  for (const k of Object.keys(LEGAL_PAGES)) out.legal[k] = { enabled: obj(L[k]).enabled !== false, custom: str(obj(L[k]).custom, 60000) };
  if (Array.isArray(s.sections)) {
    out.sections = s.sections.filter((x) => x && SECTION_TYPES[x.type]).slice(0, 30).map((x) => ({
      id: /^[\w-]{1,40}$/.test(str(x.id)) ? x.id : uid('s'),
      type: x.type,
      enabled: x.enabled !== false,
      nav: str(x.nav, 30),
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
We accept Visa, Mastercard, American Express and Discover, along with other methods offered at checkout. Payment is due at the time of purchase unless we have agreed otherwise in writing. Prices are shown in U.S. dollars and may be subject to applicable taxes.

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
