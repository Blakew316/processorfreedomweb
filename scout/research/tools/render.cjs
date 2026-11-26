// Renders a page in a real browser and prints its visible text. Used by fetch.py --browser.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  try {
    const p = await b.newPage({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' });
    await p.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(1500);
    process.stdout.write(await p.evaluate(() => document.body ? document.body.innerText : ''));
  } catch (e) { console.error(String(e).slice(0, 300)); process.exitCode = 1; } finally { await b.close(); }
})();
