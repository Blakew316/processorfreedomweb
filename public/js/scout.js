// Scout: the assistant behind Insights > "Ask a question". This file draws the chat; the answers come from the server.
// The layout follows the owner's reference photo (ui-reference/iphone/IMG_3712_clover-chat-with-vera.png): the title bar
// with one X (the page behind already says Insights), the greeting, the notice, starter questions to tap, the question box and the line under it.

import { h, api, state, ic, link } from './ui.js';

// Short labels to tap; each sends the full question, so Scout reads the same words as before.
const STARTERS = [
  ["Today's sales", 'What are my total sales for today?'],
  ['Troubleshoot my device', 'Can you help me troubleshoot my device?'],
  ['Recent deposits', 'How do I view my recent deposits?'],
  ['Set up a terminal', 'How do I set up my new terminal?'],
  ['Run a refund', 'How do I run a refund?'],
];

const MARK = '<svg viewBox="0 0 64 64" width="60" height="60" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M36 12H12a4 4 0 0 0-4 4v26a4 4 0 0 0 4 4h4v9l10-9h22a4 4 0 0 0 4-4V32"/><path d="M48 6c1 6 3 8 9 9-6 1-8 3-9 9-1-6-3-8-9-9 6-1 8-3 9-9z"/></svg>';

/** The person's first name, for the greeting. Nothing when the account has only an email address. */
const firstName = () => String(state.user?.name || '').trim().split(/\s+/)[0] || '';

/**
 * Opens the chat over the page. `siteId` is the business being asked about; `goTab` takes the person to a section of the
 * back office when an answer points there.
 */
export function openScout({ siteId, goTab }) {
  if (document.querySelector('.scout')) return;
  const turns = [];                       // what has been said, oldest first: { role: 'user' | 'assistant', text, actions }
  let waiting = false;
  let chatId = '';                        // names this conversation on the server, once the first answer is back
  const name = firstName();
  const list = h('div', { class: 'scout-turns', role: 'log', 'aria-live': 'polite' });
  const box = h('textarea', { class: 'scout-box', rows: 3, placeholder: 'Ask Scout', 'aria-label': 'Ask Scout', maxlength: 2000 });
  const send = h('button', { class: 'scout-send', type: 'button', 'aria-label': 'Send', disabled: true }, h('span', { style: 'display:inline-flex', html: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>' }));
  const close = () => { root.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const bubble = (t) => h('div', { class: `scout-msg ${t.role === 'user' ? 'me' : 'sc'}` },
    h('p', {}, t.text),
    (t.actions || []).length > 0 && h('div', { class: 'scout-acts' }, t.actions.map((a) => (a.tab
      ? h('button', { class: 'btn sm', type: 'button', onclick: () => { close(); goTab(a.tab); } }, a.label)
      : a.callback ? h('button', { class: 'btn sm', type: 'button', onclick: (e) => callback(a.callback, e.currentTarget) }, a.label)
        : h('a', { class: 'btn sm', href: a.href }, a.label)))));

  function paint() {
    list.replaceChildren(...(turns.length ? turns.map(bubble) : [
      h('div', { class: 'scout-hello' }, h('span', { class: 'scout-mark', html: MARK }), h('h2', {}, name ? `Hi ${name}, how can I help?` : 'Hi, how can I help?')),
      h('p', { class: 'scout-note' }, 'Your use of this AI-powered chatbot is subject to our ', link('/terms', {}, 'Terms'), '. This chat may be monitored, recorded and stored with our service provider. ', link('/privacy', {}, 'Privacy policy')),
      h('div', { class: 'scout-starters' }, STARTERS.map(([label, q]) => h('button', { class: 'scout-pill', type: 'button', onclick: () => ask(q) }, label))),
    ]), ...(waiting ? [h('div', { class: 'scout-msg sc scout-wait', 'aria-label': 'Scout is answering' }, h('i'), h('i'), h('i'))] : []));
    list.scrollTop = list.scrollHeight;
  }

  // Asks for a call back. The server texts the request with what was already asked, so nobody has to repeat it.
  async function callback(department, button) {
    button.disabled = true;
    try { await api('POST', `/api/sites/${siteId}/scout/callback`, { department, chatId }); turns.push({ role: 'assistant', text: 'Done. Your callback request has been sent.' }); } catch (e) { turns.push({ role: 'assistant', text: e.message }); button.disabled = false; }
    paint();
  }

  async function ask(text) {
    const q = String(text || '').trim();
    if (!q || waiting) return;
    turns.push({ role: 'user', text: q }); box.value = ''; send.disabled = true; waiting = true; paint();
    try {
      const r = await api('POST', `/api/sites/${siteId}/scout/chat`, { chatId, messages: turns.map((t) => ({ role: t.role, text: t.text })) });
      chatId = r.chatId || chatId;
      turns.push({ role: 'assistant', text: r.text, actions: r.actions || [] });
    } catch (e) {
      turns.push({ role: 'assistant', text: e.message || 'Scout could not answer just now. Please try again.' });
    }
    waiting = false; paint(); box.focus();
  }

  box.addEventListener('input', () => { send.disabled = !box.value.trim() || waiting; });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(box.value); } });
  send.addEventListener('click', () => ask(box.value));

  const root = h('div', { class: 'scout', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Chat with Scout' },
    h('div', { class: 'scout-page' },
      h('div', { class: 'scout-bar' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close chat', onclick: close }, ic('x', 20)), h('b', {}, 'Chat with Scout'), h('span', {})),
      list,
      h('div', { class: 'scout-ask' }, box, send),
      h('p', { class: 'scout-foot' }, 'Scout is AI and can make mistakes.')));
  document.body.append(root);
  document.addEventListener('keydown', onKey);
  paint(); box.focus();
}
