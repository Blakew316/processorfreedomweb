// Walks a help centre in a real browser and saves every page's visible text for the Scout research.
// usage: node tools/crawl.cjs <family> <start-url> <url-regex> [max-pages]
// Saves raw/<family>/c-<slug>.txt and logs each page in raw/<family>/index.tsv (same columns as fetch.py).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [family, start, pattern, maxArg] = process.argv.slice(2);
const want = new RegExp(pattern), max = Number(maxArg || 400);
const dir = path.join(__dirname, '..', 'raw', family); fs.mkdirSync(dir, { recursive: true });
const clean = (u) => { try { const x = new URL(u); x.hash = ''; x.search = ''; return x.toString().replace(/\/$/, ''); } catch { return null; } };
const slug = (u) => 'c-' + new URL(u).pathname.replace(/^\/+|\/+$/g, '').replace(/[^A-Za-z0-9]+/g, '-').slice(-90);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' });
  const queue = [clean(start)], seen = new Set(queue); let done = 0, saved = 0;
  const day = new Date(Number(process.env.CRAWL_DAY_MS || 0) || undefined).toISOString().slice(0, 10);
  async function worker(once) {
    let idle = 0;
    while (done < max) {
      if (!queue.length) { if (once || ++idle > 12) return; await new Promise((r) => setTimeout(r, 2500)); continue; }
      idle = 0;
      const url = queue.shift(); done++;
      const p = await ctx.newPage();
      try {
        await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await p.waitForTimeout(1200);
        const { text, links } = await p.evaluate(() => ({ text: document.body ? document.body.innerText : '', links: [...document.querySelectorAll('a[href]')].map((a) => a.href) }));
        for (const l of links) { const c = clean(l); if (c && want.test(c) && !seen.has(c)) { seen.add(c); queue.push(c); } }
        const words = text.split(/\s+/).filter(Boolean).length;
        if (words > 60) {
          const name = slug(url); fs.writeFileSync(path.join(dir, name + '.txt'), text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim() + '\n');
          fs.appendFileSync(path.join(dir, 'index.tsv'), [name, url, 'browser', String(text.length), crypto.createHash('sha256').update(text).digest('hex').slice(0, 16), 'text', String(words), day].join('\t') + '\n');
          saved++;
        }
      } catch (e) { fs.appendFileSync(path.join(dir, 'crawl-errors.txt'), url + '  ' + String(e).slice(0, 120) + '\n'); } finally { await p.close(); }
      if (done % 25 === 0) console.log(`visited ${done}, saved ${saved}, queued ${queue.length}`);
      if (once) return;
    }
  }
  await worker(true);                                // the first page seeds the queue
  await Promise.all(Array.from({ length: 6 }, () => worker(false)));
  console.log(`DONE visited ${done}, saved ${saved}, left in queue ${queue.length}, known urls ${seen.size}`);
  await b.close();
})();
