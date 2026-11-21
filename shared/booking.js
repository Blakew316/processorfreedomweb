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

/* Runs in the visitor's browser: offers only times the business is open, and sends the request. */
function bookClient() {
  var d = document, f = d.getElementById('pf-book'); if (!f) return;
  var c = JSON.parse(d.getElementById('pf-book-conf').textContent);
  var day = f.elements.date, time = f.elements.time, err = f.querySelector('.err');
  var mins = function (t) { return Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); };
  function fill() {
    var wd = new Date(day.value + 'T12:00:00Z').getUTCDay(), h = c.hours[wd], out = '';
    for (var m = 0; m < 1440; m += 30) {
      var open = !c.useHours || (!h.closed && (mins(h.close) > mins(h.open) ? m >= mins(h.open) && m < mins(h.close) : m >= mins(h.open)));
      if (!c.useHours && (m < 360 || m > 1380)) open = false;
      if (!open) continue;
      var hh = Math.floor(m / 60), label = (hh % 12 || 12) + ':' + (m % 60 ? '30' : '00') + (hh < 12 ? ' AM' : ' PM');
      out += '<option value="' + String(hh).padStart(2, '0') + ':' + (m % 60 ? '30' : '00') + '">' + label + '</option>';
    }
    time.innerHTML = out || '<option value="">Closed that day</option>';
  }
  day.addEventListener('change', fill); fill();
  f.addEventListener('submit', function (e) {
    e.preventDefault(); err.textContent = '';
    if (d.documentElement.hasAttribute('data-preview')) { err.textContent = 'This is a preview. Bookings can be made once your site is published.'; return; }
    var b = {}; [].forEach.call(f.elements, function (el) { if (el.name) b[el.name] = el.value; });
    var btn = f.querySelector('button'); btn.disabled = true;
    fetch(c.post, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(b) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'x'); return j; }); })
      .then(function () { location.href = c.done; })
      .catch(function (x) { btn.disabled = false; err.textContent = x.message && x.message !== 'x' ? x.message : 'We could not send your request. Please try again or call us.'; });
  });
}

export function bookingPage({ ordering, base, done, today }) {
  const b = ordering.booking;
  if (done) return `<style>${CSS}</style><section class="book"><div class="wrap"><h1>Request sent.</h1><div class="done">Thank you. We have your request and will email you as soon as it is confirmed.</div></div></section>`;
  const conf = { post: `${base}/_book`, done: `${base}/book?done=1`, hours: ordering.hours, useHours: ordering.useHours };
  return `<style>${CSS}</style><section class="book"><div class="wrap"><h1>${esc(b.title || 'Book online')}</h1>${b.note ? `<p class="lede">${esc(b.note)}</p>` : ''}
<form id="pf-book" novalidate>
<label>What would you like to book<select name="service">${arr(b.services).map((s) => `<option value="${esc(s.id)}">${esc(s.name)}${s.minutes ? ` · ${s.minutes} min` : ''}${s.price ? ` · ${money(s.price)}` : ''}</option>`).join('')}</select></label>
<div class="two"><label>Date<input type="date" name="date" required min="${esc(today)}" value="${esc(today)}"></label><label>Time<select name="time" required></select></label></div>
<div class="two"><label>Name<input name="name" required maxlength="120" autocomplete="name"></label><label>Number of people<input name="party" type="number" min="1" max="100" value="2"></label></div>
<div class="two"><label>Phone<input name="phone" type="tel" required autocomplete="tel"></label><label>Email<input name="email" type="email" required autocomplete="email"></label></div>
<label>Anything we should know<textarea name="notes" rows="3" maxlength="500"></textarea></label>
<p class="err" role="alert"></p><button class="btn" type="submit">Request booking</button>
</form></div></section>
<script type="application/json" id="pf-book-conf">${JSON.stringify(conf).replace(/</g, '\\u003c')}</script><script>(${bookClient.toString()})();</script>`;
}
