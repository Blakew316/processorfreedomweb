// Reads a photo or PDF of a paper menu and returns its items. Uses the Claude API when ANTHROPIC_API_KEY is set.

const PROMPT = `This is a restaurant or shop menu. List every item a customer can order.
For each item give: the category it is printed under (use "Menu" if there are no headings), the item name as written, the price in dollars as a number (0 if no price is shown), and the description if one is printed (otherwise an empty string).
If an item has several sizes or prices, list it once with the lowest price and put the other sizes and prices in the description.
Keep the order the menu is printed in. Do not invent items, prices or descriptions that are not on the menu.`;

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['category', 'name', 'price', 'description'],
    properties: { category: { type: 'string' }, name: { type: 'string' }, price: { type: 'number' }, description: { type: 'string' } } } } },
};

export const scanEnabled = (env) => !!env.ANTHROPIC_API_KEY;

export async function scanMenu(env, buf, mediaType) {
  const source = { type: 'base64', media_type: mediaType, data: buf.toString('base64') };
  const body = {
    model: env.MENU_SCAN_MODEL || 'claude-opus-5-5', max_tokens: 16000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: [mediaType === 'application/pdf' ? { type: 'document', source } : { type: 'image', source }, { type: 'text', text: PROMPT }] }],
  };
  const call = (extra, beta) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(240000),
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2026-10-21', ...(beta ? { 'anthropic-beta': beta } : {}) },
    body: JSON.stringify({ ...body, ...extra }),
  });
  // If the model declines, let the API retry on a fallback model. Should that option be rejected, ask again without it.
  let res = await call({ fallbacks: 'default' }, 'server-side-fallback-2026-07-01');
  if (res.status === 400) res = await call({});
  if (!res.ok) throw new Error(`Menu scan answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const msg = await res.json();
  if (msg.stop_reason === 'refusal') return { items: [], reason: 'We could not read that file. Try a clearer photo of the menu.' };
  if (msg.stop_reason === 'max_tokens') return { items: [], reason: 'That menu is too long to read in one go. Upload one page at a time.' };
  const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let items = [];
  try { items = JSON.parse(text).items || []; } catch { /* handled below */ }
  return { items: items.map((x) => ({ category: String(x.category || 'Menu'), name: String(x.name || ''), price: Math.max(0, Math.round((Number(x.price) || 0) * 100)), desc: String(x.description || '') })).filter((x) => x.name.trim()) };
}
