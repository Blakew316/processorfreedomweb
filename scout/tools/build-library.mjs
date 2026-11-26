// Compiles the research library (scout/research/library/*.json) into the one file the server loads: server/scout-library.json.
// Run: node scout/tools/build-library.mjs
// Left out on purpose: entries that hold a password, and codes for processing networks Processor Freedom does not use.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'scout', 'research', 'library');
const inventory = JSON.parse(readFileSync(join(root, 'scout', 'research', 'inventory.json'), 'utf8'));
const entries = []; let dropped = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const lib = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const sources = new Map(lib.sources.map((s) => [s.id, s]));
  for (const e of lib.entries) {
    if (e.sensitive || e.not_ours) { dropped++; continue; }
    const src = sources.get(e.source) || {};
    entries.push({
      id: e.id, devices: e.devices[0] === '*' ? lib.devices : e.devices, topic: e.topic, kind: e.kind, title: e.title, steps: e.steps,
      can: e.merchant_can_do, esc: e.escalate_to || null, ...(e.meaning_only ? { meaning: true } : {}), ...(e.note ? { note: e.note } : {}),
      tier: src.tier || 2, by: src.publisher || '', url: /^https?:/.test(src.url || '') ? src.url : '',
    });
  }
}
const devices = inventory.map((d) => ({ id: d.id, name: d.name, brand: d.brand || '', type: d.type || '' }));
writeFileSync(join(root, 'server', 'scout-library.json'), JSON.stringify({ devices, entries }));
console.log(`${entries.length} entries kept, ${dropped} left out (passwords, networks not used), ${devices.length} devices`);
