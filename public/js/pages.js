// The pages every proper site has: questions, privacy and terms. Plain words, kept honest about what the product does today.
import { h, link } from './ui.js';

export const CONTACT = 'support@processorfreedom.com';
const UPDATED = 'November 21, 2026';

// What customers have said, in their own words. Add entries as { quote, name, business } and the section and its menu links appear by themselves.
// Left empty on purpose: nothing is shown until there are real ones.
export const TESTIMONIALS = [];

/* The menu. It lives at the bottom of the screen, so the top carries only our name. */
const MENU = () => [['Examples', '/#examples'], ['Why us', '/#features'], ...(TESTIMONIALS.length ? [['Testimonials', '/#testimonials']] : []), ['FAQ', '/#faq'], ['Log in', '/login']];
export function dock() {
  const el = h('nav', { class: 'dock', 'aria-label': 'Menu' }, h('div', { class: 'dock-in' }, MENU().map(([t, to]) => link(to, {}, t)), link('/signup', { class: 'btn sm' }, 'Sign up')));
  // On the home page it waits out of sight while the film has the screen, and comes in once you start down the page.
  const rest = () => el.classList.toggle('rest', !!document.querySelector('.film-main') && window.scrollY < Math.min(520, window.innerHeight * 0.55));
  el.classList.add('rest'); requestAnimationFrame(rest); window.addEventListener('scroll', () => { if (el.isConnected) rest(); }, { passive: true });
  // It steps aside when the footer, which has the same menu, comes into view.
  requestAnimationFrame(() => { const foot = document.querySelector('.site-foot'); if (foot && 'IntersectionObserver' in window) new IntersectionObserver((es) => es.forEach((e) => el.classList.toggle('away', e.isIntersecting)), { rootMargin: '0px 0px -40px 0px' }).observe(foot); });
  return el;
}
export const testimonialsSection = () => TESTIMONIALS.length > 0 && h('section', { class: 'l-sec l-said', id: 'testimonials' }, h('div', { class: 'page' },
  h('p', { class: 'kicker' }, 'Testimonials'), h('h2', {}, 'What owners say.'),
  h('div', { class: 'said' }, TESTIMONIALS.map((t) => h('figure', { class: 'said-card reveal' }, h('blockquote', {}, `“${t.quote}”`), h('figcaption', {}, h('b', {}, t.name), h('span', {}, t.business)))))));

export const FAQ = [
  ['What is PF Sites?', 'PF Sites is the website builder and back office from Processor Freedom. You get a website for your business, online ordering from your own menu, and one place to run orders, invoices, bookings, reports and your team.'],
  ['Do I need to know how to build websites?', 'No. You type your business name, choose the kind of business you run, and a complete site is written and laid out for you. Changing a word, a photo or a colour is a tap. There is no code to write and nothing to install.'],
  ['How long until my site is live?', 'Most people publish the same day. The site is ready the moment you create it, and nothing is public until you press Publish, so you can take as long as you like to get it right.'],
  ['Can I use my own domain name?', 'Yes. Every site gets a free web address straight away. You can also connect a domain you already own, or ask us to set one up for you.'],
  ['How do online orders reach me?', 'New orders appear in your back office the moment they are placed, with a chime, and on a kitchen screen made for a tablet. You can also turn on alerts for your phone. You confirm each order and mark it ready, and the customer can follow along on their own order page.'],
  ['How do customers pay?', 'Today, customers pay you when they pick up or receive their order, and you record the payment in the back office so your reports add up. Invoices include a link the customer opens to view what they owe. Talk to your Processor Freedom representative about card payment options.'],
  ['Can my staff use it?', 'Yes. Give each person their own login. Kitchen logins see orders only, managers run the day, and only the owner can manage the team or delete the site. Removing someone ends their access immediately.'],
  ['Does it work on a phone?', 'Yes, for you and for your customers. The back office can be added to your Home Screen like an app, and your customers can do the same with your ordering page.'],
  ['Who owns my content and my customer list?', 'You do. Your words, photos, menu, orders and customer details are yours. We store them to run the service for you and do not sell them.'],
  ['What does it cost?', `Pricing depends on your Processor Freedom account. Ask your representative, or write to ${CONTACT}.`],
  ['Can I take my site down or delete it?', 'Yes, at any time. Unpublish takes the site offline and keeps everything. Deleting the site removes it and its data for good.'],
  ['How do I get help?', `Write to ${CONTACT} and a person will reply.`],
];

const PRIVACY = [
  ['Who we are', [`PF Sites is a service of Processor Freedom ("we", "us"). This policy explains what information we handle when you use PF Sites, and why. Questions go to ${CONTACT}.`]],
  ['Two kinds of people use PF Sites', ['Business owners and their staff, who have an account with us and build a site.', 'Customers of those businesses, who visit a site built with PF Sites, place an order, make a booking or send a message. For that information the business is in charge of it and we handle it on the business’s behalf.']],
  ['What we collect from account holders', ['Your name, email address and a password. Passwords are stored only in scrambled (hashed) form; we cannot read them.', 'What you put into your site and back office: text, photos, menu, prices, hours, settings, invoices, bookings, staff names and shifts.', 'Basic technical information needed to run and protect the service, such as the address your request came from when you sign in.']],
  ['What we handle for a business’s customers', ['What a customer types in when they order, book or get in touch: name, email, phone, delivery address if they give one, the order itself and any note.', 'This is kept in that business’s account. Only that business, its staff and Processor Freedom support staff can see it.']],
  ['Cookies and similar storage', ['We set one essential cookie to keep you signed in. It is not used for advertising.', 'Your browser also remembers small preferences on your device, such as light or dark appearance and, on ordering pages, the contents of the cart.', 'We do not use advertising trackers or sell information to advertisers.']],
  ['How we use information', ['To provide the service: showing your site, taking and delivering orders, bookings and messages, producing your reports.', 'To send messages that are part of the service, such as order updates, invoices and password resets.', 'To keep the service secure and working, and to help you when you ask for support.']],
  ['Who we share it with', ['Companies that run parts of the service for us, such as hosting, network protection and email delivery. They may only use the information to provide that service to us.', 'The business you ordered from or booked with, if you are a customer of a business.', 'Authorities, when the law requires it.', 'We do not sell personal information.']],
  ['How long we keep it', ['Account and site information is kept while the account is open. Deleting a site removes that site and its orders, customers and messages from the live service. Routine safety copies are overwritten within about a week.']],
  ['Security', ['Connections are encrypted. Passwords are hashed. Each business’s information is kept separate from every other business’s, and staff logins are limited to what their role needs. No system is perfectly secure, so please use a strong password and tell us straight away if you think your account has been misused.']],
  ['Your choices', [`You can see and change most of your information in your account. You can ask us for a copy of your information, to correct it, or to delete it, by writing to ${CONTACT}.`, 'If you are a customer of a business that uses PF Sites, please contact that business first, since it is in charge of your information; we will help it respond.']],
  ['Children', ['PF Sites is for businesses. It is not directed at children, and we do not knowingly collect information from children.']],
  ['Changes to this policy', ['If we change this policy we will post the new version here and update the date at the top. If the change is significant we will tell account holders.']],
];

const TERMS = [
  ['Agreeing to these terms', [`These terms are an agreement between you and Processor Freedom ("we", "us") for your use of PF Sites. By creating an account or using the service you agree to them. If you use PF Sites for a business, you agree on its behalf.`]],
  ['Your account', ['You are responsible for your account and for everyone you give a login to. Keep your password private, and tell us straight away if you think someone else has used your account.', 'You must give accurate information and be old enough to enter into a contract.']],
  ['Your content', ['Your content stays yours. You give us permission to store, display and transmit it as needed to run your site and back office.', 'You are responsible for your content: that it is accurate, that you have the right to use it (including photos and logos), and that it is lawful.']],
  ['Your business and your customers', ['You run your business; we provide the tools. You are responsible for your products and services, prices, taxes, opening hours, fulfilling orders and bookings, refunds, food safety and allergen information, and for the policies shown on your site.', 'You are responsible for handling your customers’ information lawfully and for answering their requests about it. We act on your instructions when we handle it for you.', 'Policy pages generated for your site are a starting point written from the details you give. Review them and make sure they are right for your business.']],
  ['Payments', ['PF Sites records payments you tell it about and helps you send invoices. Any card processing is provided under your separate agreement with Processor Freedom, and that agreement governs it.']],
  ['Acceptable use', ['Do not use PF Sites to break the law, to deceive or defraud people, to sell prohibited goods, to send spam, to infringe someone else’s rights, to spread malware, or to attack or overload the service or anyone else’s systems.', 'We may remove content or suspend an account that breaks these rules or puts the service or other people at risk.']],
  ['The service', ['We work to keep PF Sites available and reliable, but it is provided "as is" and may sometimes be unavailable, for example during updates. We may add, change or remove features.', 'You are responsible for keeping your own copies of anything you cannot afford to lose.']],
  ['Fees', ['Fees, if any, are set out in your arrangement with Processor Freedom.']],
  ['Ending the agreement', ['You can stop using PF Sites and delete your sites at any time. We may suspend or close an account that breaks these terms, or if we stop offering the service; where we reasonably can, we will give notice and a chance to export your information.']],
  ['Our responsibility to you', ['To the extent the law allows, we are not liable for indirect or consequential losses, lost profits or lost business, and our total liability for any claim about the service is limited to the amount you paid us for PF Sites in the twelve months before the claim. Nothing in these terms limits liability that cannot be limited by law.']],
  ['Changes to these terms', ['We may update these terms. We will post the new version here with a new date, and continuing to use the service after that means you accept it.']],
  ['Contact', [`Questions about these terms go to ${CONTACT}.`]],
];

/* The foot of every public page. */
export function siteFooter() {
  const col = (title, ...links) => h('div', { class: 'ft-col' }, h('b', {}, title), ...links);
  return h('footer', { class: 'site-foot' }, h('div', { class: 'page' },
    h('div', { class: 'ft-top' },
      h('div', { class: 'ft-brand' }, h('img', { src: '/assets/logo.svg', alt: '', width: 40, height: 40 }), h('div', {}, h('b', {}, 'PF Sites'), h('span', {}, 'Websites and online ordering by Processor Freedom.'))),
      col('Explore', ...MENU().filter(([t]) => t !== 'Log in').map(([t, to]) => link(to, {}, t))),
      col('Account', link('/login', {}, 'Log in'), link('/signup', {}, 'Sign up')),
      col('Help', link('/faq', {}, 'All questions'), link('/contact', {}, 'Contact us')),
      col('Legal', link('/privacy', {}, 'Privacy Policy'), link('/terms', {}, 'Terms and Conditions'))),
    h('div', { class: 'ft-base' }, h('span', {}, `© ${new Date().getFullYear()} Processor Freedom. All rights reserved.`), h('span', {}, 'Their software. Your processor.'))));
}

export const faqList = (items = FAQ) => h('div', { class: 'faq' }, items.map(([q, a]) => h('details', {}, h('summary', {}, h('span', {}, q), h('i', { 'aria-hidden': 'true' })), h('p', {}, a))));

const docPage = (title, intro, sections) => h('main', { class: 'doc' }, h('div', { class: 'page' },
  h('p', { class: 'kicker' }, `Last updated ${UPDATED}`), h('h1', {}, title), h('p', { class: 'doc-intro' }, intro),
  h('nav', { class: 'doc-toc', 'aria-label': 'On this page' }, sections.map(([t], i) => h('a', { href: `#s${i + 1}` }, t))),
  sections.map(([t, paras], i) => h('section', { id: `s${i + 1}` }, h('h2', {}, h('span', {}, String(i + 1).padStart(2, '0')), t), paras.length > 1 ? h('ul', {}, paras.map((x) => h('li', {}, x))) : h('p', {}, paras[0])))));

export const privacyPage = () => docPage('Privacy Policy', 'What we collect, why, and the choices you have. Written to be read.', PRIVACY);
export const termsPage = () => docPage('Terms and Conditions', 'The agreement between you and Processor Freedom for using PF Sites.', TERMS);
export const contactPage = () => h('main', { class: 'doc' }, h('div', { class: 'page' },
  h('p', { class: 'kicker' }, 'Contact'), h('h1', {}, 'Talk to a person.'), h('p', { class: 'doc-intro' }, 'PF Sites is built and supported by Processor Freedom. Whether you are deciding if it fits or you are stuck on something, write to us.'),
  h('div', { class: 'reach' },
    h('a', { class: 'reach-card', href: `mailto:${CONTACT}` }, h('small', {}, 'Email'), h('b', {}, CONTACT), h('span', {}, 'Sales questions and support. Tell us your business name and what you are trying to do.')),
    h('div', { class: 'reach-card' }, h('small', {}, 'Already a Processor Freedom merchant?'), h('b', {}, 'Ask your representative'), h('span', {}, 'They can set up your site with you and answer questions about your account.')),
    link('/faq', { class: 'reach-card' }, h('small', {}, 'Quick answers'), h('b', {}, 'Questions and answers'), h('span', {}, 'The things people ask most, answered in a sentence or two.'))),
  h('section', {}, h('h2', {}, h('span', {}, '01'), 'What helps us help you'), h('ul', {}, ['The web address of your site, if you have one.', 'What you expected to happen and what happened instead.', 'A screenshot, if something looks wrong.'].map((x) => h('li', {}, x)))),
  h('section', {}, h('h2', {}, h('span', {}, '02'), 'About PF Sites'), h('p', {}, 'Processor Freedom helps businesses take payments. PF Sites is the other half: the website, the online ordering and the back office that brings those payments in. One company, one login, one place to call.'))));

export const faqPage = () => h('main', { class: 'doc' }, h('div', { class: 'page' },
  h('p', { class: 'kicker' }, 'Help'), h('h1', {}, 'Questions and answers'), h('p', { class: 'doc-intro' }, 'The things people ask before they start. If yours is not here, write to us.'),
  faqList(), h('div', { class: 'doc-cta' }, h('div', {}, h('b', {}, 'Still have a question?'), h('span', {}, 'A person will reply.')), link('/contact', { class: 'btn' }, 'Contact us'))));
