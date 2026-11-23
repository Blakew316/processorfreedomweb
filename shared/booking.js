// The public booking page: a customer asks for a time, the business confirms it.

import { esc, arr, money } from './core.js';

const CSS = `
.book{padding:64px 0 96px}
.book .wrap{max-width:640px}
.book h1{font-size:clamp(34px,5vw,52px);letter-spacing:-.03em}
.book .lede{color:var(--muted);font-size:18px;margin-top:10px}
.book form{display:grid;gap:16px;margin-top:32px;background:var(--bg);border-radius:20px;box-shadow:inset 0 0 0 1px var(--line);padding:28px}
.book label{display:grid;gap:6px;font-size:14px;color:var(--muted);font-weight:500}
.book input,.book select,.book textarea{font:inherit;font-size:16px;color:var(--ink);background:var(--bg2);border:1px solid transparent;border-radius:12px;padding:13px 14px;width:100%}
.book input:focus,.book select:focus,.book textarea:focus{outline:0;background:var(--bg);border-color:var(--accent)}
.book .two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.book .btn{width:100%;padding:16px;font-size:17px;border:0;cursor:pointer}
.book .err{color:#d1372f;font-size:14px}
.book .done{background:var(--bg2);border-radius:20px;padding:32px;margin-top:28px;font-size:18px}
@media (max-width:560px){.book{padding:32px 0 64px}.book form{padding:20px}.book .two{grid-template-columns:1fr}}
`;

const WORDS = {
  en: { title: 'Book online', what: 'What would you like to book', date: 'Date', time: 'Time', name: 'Name', people: 'Number of people', phone: 'Phone', email: 'Email', notes: 'Anything we should know', send: 'Request booking', sent: 'Request sent.', thanks: 'Thank you. We have your request and will email you as soon as it is confirmed.', closed: 'Closed that day', preview: 'This is a preview. Bookings can be made once your site is published.', failed: 'We could not send your request. Please try again or call us.' },
  es: { title: 'Reservar en línea', what: '¿Qué te gustaría reservar?', date: 'Fecha', time: 'Hora', name: 'Nombre', people: 'Número de personas', phone: 'Teléfono', email: 'Correo electrónico', notes: '¿Algo que debamos saber?', send: 'Solicitar reserva', sent: 'Solicitud enviada.', thanks: 'Gracias. Recibimos tu solicitud y te escribiremos en cuanto esté confirmada.', closed: 'Cerrado ese día', preview: 'Esta es una vista previa. Las reservas se podrán hacer cuando el sitio esté publicado.', failed: 'No pudimos enviar tu solicitud. Inténtalo de nuevo o llámanos.' },
};

/* Runs in the visitor's browser: offers only times the business is open, and sends the request. */
function bookClient() {
  var d = document, f = d.getElementById('pf-book'); if (!f) return;
  var c = JSON.parse(d.getElementById('pf-book-conf').textContent);
  var day = f.elements.date, time = f.elements.time, err = f.querySelector('.err');
  var mins = function (t) { return Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); };
  function fill() {
    var wd = new Date(day.value + 'T12:00:00Z').getUTCDay(), h = c.hours[wd], out = '';
    for (var m = 0; m < 1440; m += 30) {
      var open = !h.closed && (mins(h.close) > mins(h.open) ? m >= mins(h.open) && m < mins(h.close) : m >= mins(h.open));
      if (!open) continue;
      var hh = Math.floor(m / 60), label = (hh % 12 || 12) + ':' + (m % 60 ? '30' : '00') + (hh < 12 ? ' AM' : ' PM');
      out += '<option value="' + String(hh).padStart(2, '0') + ':' + (m % 60 ? '30' : '00') + '">' + label + '</option>';
    }
    time.innerHTML = out || '<option value="">' + c.t.closed + '</option>';
  }
  day.addEventListener('change', fill); fill();
  f.addEventListener('submit', function (e) {
    e.preventDefault(); err.textContent = '';
    if (d.documentElement.hasAttribute('data-preview')) { err.textContent = c.t.preview; return; }
    var b = {}; [].forEach.call(f.elements, function (el) { if (el.name) b[el.name] = el.value; });
    var btn = f.querySelector('button'); btn.disabled = true;
    fetch(c.post, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(b) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'x'); return j; }); })
      .then(function () { location.href = c.done; })
      .catch(function (x) { btn.disabled = false; err.textContent = x.message && x.message !== 'x' ? x.message : c.t.failed; });
  });
}

export function bookingPage({ ordering, base, done, today, lang }) {
  const b = ordering.booking;
  const T = WORDS[lang] || WORDS.en;
  if (done) return `<style>${CSS}</style><section class="book"><div class="wrap"><h1>${T.sent}</h1><div class="done">${T.thanks}</div></div></section>`;
  const conf = { post: `${base}/_book`, done: `${base}/book?done=1`, hours: ordering.hours, t: { closed: T.closed, preview: T.preview, failed: T.failed } };
  return `<style>${CSS}</style><section class="book"><div class="wrap"><h1>${esc(b.title && b.title !== WORDS.en.title ? b.title : T.title)}</h1>${b.note ? `<p class="lede">${esc(b.note)}</p>` : ''}
<form id="pf-book" novalidate>
<label>${T.what}<select name="service">${arr(b.services).map((s) => `<option value="${esc(s.id)}">${esc(s.name)}${s.minutes ? ` · ${s.minutes} min` : ''}${s.price ? ` · ${money(s.price)}` : ''}</option>`).join('')}</select></label>
<div class="two"><label>${T.date}<input type="date" name="date" required min="${esc(today)}" value="${esc(today)}"></label><label>${T.time}<select name="time" required></select></label></div>
<div class="two"><label>${T.name}<input name="name" required maxlength="120" autocomplete="name"></label><label>${T.people}<input name="party" type="number" min="1" max="100" value="2"></label></div>
<div class="two"><label>${T.phone}<input name="phone" type="tel" required autocomplete="tel"></label><label>${T.email}<input name="email" type="email" required autocomplete="email"></label></div>
<label>${T.notes}<textarea name="notes" rows="3" maxlength="500"></textarea></label>
<p class="err" role="alert"></p><button class="btn" type="submit">${T.send}</button>
</form></div></section>
<script type="application/json" id="pf-book-conf">${JSON.stringify(conf).replace(/</g, '\\u003c')}</script><script>(${bookClient.toString()})();</script>`;
}
