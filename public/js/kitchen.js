import { ORDER_METHODS, readyLabel, slotLabel, money } from '/shared/core.js';
import { h, api, go, toast, ic, announceOrders, setAlerts, alertsOn, printTicket, themeButton } from './ui.js';

/* A large-type screen for the counter or kitchen tablet: active orders only, one tap to move each along. */
export async function kitchen(id, mount, title) {
  const site = (await api('GET', `/api/sites/${id}`)).site;
  title(`Kitchen · ${site.name}`);
  let orders = null;
  let seen = null;
  const grid = h('div', { class: 'k-grid' });
  const clock = h('span', { class: 'muted' });
  const NEXT = { new: 'confirmed', confirmed: 'ready', ready: 'completed' };
  const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`; };

  function draw() {
    clock.textContent = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    // With a printer label chosen, each station sees only the items made there.
    const active = (orders || []).filter((o) => NEXT[o.status]).map((o) => (station ? { ...o, items: o.items.filter((l) => l.label === station) } : o)).filter((o) => o.items.length).sort((a, b) => a.createdAt - b.createdAt);
    if (!orders) return grid.replaceChildren(...Array.from({ length: 3 }, () => h('div', { class: 'skel sk-ticket', 'aria-hidden': 'true' })));
    if (!active.length) return grid.replaceChildren(h('div', { class: 'k-empty' }, h('span', { class: 'k-ico' }, ic('bag', 30)), h('h2', {}, station ? `Nothing for ${station}` : 'No active orders'), h('p', {}, 'New orders appear here on their own, with a chime.')));
    grid.replaceChildren(...active.map((o) => h('article', { class: `k-card ${o.status}` },
      h('header', {}, h('b', {}, `#${o.number}`), h('span', {}, ORDER_METHODS[o.method]?.name || o.method)),
      h('div', { class: 'k-who' }, o.name, h('span', {}, o.scheduled ? `For ${slotLabel(o.scheduled, site.ordering)}` : ago(o.createdAt))),
      h('ul', {}, o.items.map((l) => h('li', {}, h('b', {}, `${l.qty}×`), h('span', {}, l.name, l.opts?.length > 0 && h('small', {}, l.opts.join(', ')))))),
      o.notes && h('p', { class: 'k-note' }, o.notes),
      (o.vehicle || o.address) && h('p', { class: 'k-meta' }, o.vehicle || o.address),
      h('div', { class: 'k-acts' },
        h('button', { class: 'btn lg', onclick: async (e) => { e.currentTarget.disabled = true; try { Object.assign(o, (await api('POST', `/api/sites/${id}/orders/${o.id}`, { status: NEXT[o.status] })).order); } catch (x) { toast(x.message, true); } draw(); } }, o.status === 'new' ? 'Confirm' : o.status === 'confirmed' ? readyLabel(o.method) : 'Complete'),
        h('button', { class: 'btn soft lg', 'aria-label': 'Print ticket', onclick: () => printTicket(o, site.name, { method: ORDER_METHODS[o.method]?.name || o.method, when: o.scheduled ? slotLabel(o.scheduled, site.ordering) : 'As soon as possible', total: money(o.total) }) }, ic('print', 20))))));
  }
  async function load() {
    try {
      orders = (await api('GET', `/api/sites/${id}/orders`)).orders;
      if (seen) announceOrders(orders.filter((o) => !seen.has(o.id)), site.name);
      seen = new Set(orders.map((o) => o.id));
    } catch { /* keep showing the last list; the next refresh retries */ }
    draw();
  }
  // Staff can clock in and out from the kitchen screen.
  let onClock = null;
  const punch = h('button', { class: 'btn soft', onclick: async () => { try { onClock = (await api('POST', `/api/sites/${id}/timeclock`, { action: onClock ? 'out' : 'in' })).mine; toast(onClock ? 'Clocked in' : 'Clocked out'); punch.lastChild.textContent = onClock ? 'Clock out' : 'Clock in'; } catch (e) { toast(e.message, true); } } }, ic('clock', 16), 'Clock in');
  api('GET', `/api/sites/${id}/timeclock`).then((r) => { onClock = r.mine; punch.lastChild.textContent = onClock ? 'Clock out' : 'Clock in'; }).catch(() => {});
  let station = '';
  const labels = site.ordering.labels || [];
  const stations = labels.length ? h('select', { class: 'k-station', 'aria-label': 'Station', onchange: (e) => { station = e.target.value; draw(); } }, h('option', { value: '' }, 'All stations'), labels.map((l) => h('option', { value: l }, l))) : null;
  const sound = h('button', { class: 'btn soft', onclick: () => { setAlerts(!alertsOn()); sound.replaceChildren(ic('bell', 16), alertsOn() ? 'Sound on' : 'Sound off'); } }, ic('bell', 16), alertsOn() ? 'Sound on' : 'Sound off');
  mount(h('div', { class: 'k' }, h('header', { class: 'k-top' }, h('button', { class: 'btn soft k-back', onclick: () => go(site.role === 'kitchen' ? '/app' : `/app/site/${id}?tab=orders`) }, ic('back', 16), site.role === 'kitchen' ? 'My sites' : 'Back office'), h('img', { src: '/assets/icon-192.png', alt: '', width: 30, height: 30, style: 'border-radius:9px' }), h('b', {}, site.name), clock, h('span', { class: 'grow' }), stations, punch, themeButton(), sound), grid));
  load();
  const timer = setInterval(load, 10000);
  return () => clearInterval(timer);
}
