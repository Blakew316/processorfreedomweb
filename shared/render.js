// Turns a site definition into finished HTML. The same code draws the live preview
// in the builder and the published site, so what people see is what goes live.

import { invoicePage } from './invoice.js';
import { ORDER_CSS, ORDER_JS, menuSection, orderPage, orderStatusPage } from './order.js';
import { ION } from './icons.js';
import { esc, str, arr, safeUrl, safeImg, isHex, readableAccent, onColor, lum, mix, contrast, FONTS, RADII, ICONS, LEGAL_PAGES, legalText, PLATFORM, strings } from './core.js';

const icon = (name, size = 24) => `<svg viewBox="0 0 512 512" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${ICONS[name] || ICONS.star}</svg>`;

const SOCIAL = {
  instagram: ['Instagram', 'https://instagram.com/', ION.s_instagram],
  facebook: ['Facebook', 'https://facebook.com/', ION.s_facebook],
  tiktok: ['TikTok', 'https://tiktok.com/@', ION.s_tiktok],
  x: ['X', 'https://x.com/', ION.s_x],
  youtube: ['YouTube', 'https://youtube.com/@', ION.s_youtube],
  linkedin: ['LinkedIn', 'https://linkedin.com/company/', ION.s_linkedin],
};

export function socialUrl(key, value) {
  const v = str(value, 300).trim();
  if (!v || !SOCIAL[key]) return '';
  if (/^https?:\/\//i.test(v) || /\.[a-z]{2,}\//i.test(v)) return safeUrl(v);
  const handle = v.replace(/^@/, '').replace(/[^\w.-]/g, '');
  return handle ? SOCIAL[key][1] + handle : '';
}

function surface(bg, raw) {
  const dark = lum(bg) < 0.35;
  const ink = dark ? '#f5f5f7' : '#1d1d1f';
  // A brand colour that all but disappears against the page (graphite on black) falls back to the text colour.
  const accent = contrast(raw, bg) < 1.6 ? ink : readableAccent(raw, bg);
  const a = (n) => (dark ? `rgba(255,255,255,${n})` : `rgba(0,0,0,${n})`);
  const [gr, gg, gb] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
  return `color-scheme:${dark ? 'dark' : 'light'};--bg:${bg};--bg2:${mix(bg, ink, dark ? 0.09 : 0.045)};--ink:${ink};--muted:${mix(ink, bg, 0.42)};--line:${a(dark ? 0.16 : 0.1)};--glass:rgba(${gr},${gg},${gb},.8);--accent:${accent};--on-accent:${onColor(accent)}`;
}
export function themeVars(site) {
  const t = site.theme || {};
  const bg = isHex(t.bg) ? t.bg.toLowerCase() : t.mode === 'dark' ? '#000000' : '#ffffff';
  const raw = isHex(t.accent) ? t.accent : '#0071e3';
  const f = FONTS[t.font] || FONTS.sans;
  const r = RADII[t.radius] || RADII.soft;
  // The second block is the opposite appearance, used when a visitor flips the light/dark switch.
  return `:root{${surface(bg, raw)};--brand:${raw};--on-brand:${onColor(raw)};--font:${f.body};--font-head:${f.head};--r:${r.r}px;--r-sm:${Math.min(r.r, 14)}px;--r-btn:${r.btn}px}html[data-alt]{${surface(lum(bg) < 0.35 ? '#ffffff' : '#0b0b0c', raw)}}`;
}

export const SITE_CSS = `
*,*::before,*::after{box-sizing:border-box}
*{margin:0}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:76px}
body{font-family:var(--font);background:var(--bg);color:var(--ink);font-size:17px;line-height:1.5;letter-spacing:-.011em;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden}
img{max-width:100%;display:block}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px}
h1,h2,h3{font-family:var(--font-head);font-weight:600;letter-spacing:-.022em;line-height:1.08;text-wrap:balance}
p{text-wrap:pretty}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:6px}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px}
.narrow{max-width:720px}
.skip{position:absolute;left:-999px;top:8px;background:var(--bg);padding:10px 16px;border-radius:10px;z-index:50}
.skip:focus{left:8px}
.bar{background:var(--bg2);color:var(--ink);text-align:center;font-size:14px;padding:10px 20px}
.bar a{margin-left:6px}
.hdr{position:relative;z-index:20;background:var(--glass);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid var(--line)}
.hdr.sticky{position:sticky;top:0}
.hdr .wrap{display:flex;align-items:center;gap:24px;min-height:56px}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);font-family:var(--font-head);font-weight:600;font-size:19px;letter-spacing:-.02em;margin-right:auto;min-width:0}
.brand:hover{text-decoration:none}
.brand img{height:30px;width:auto;max-width:160px;object-fit:contain}
.brand span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav{display:flex;align-items:center;gap:26px}
.nav a:not(.btn){color:var(--ink);font-size:14px;opacity:.82}
.nav a:not(.btn):hover{opacity:1;text-decoration:none}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font:inherit;font-size:17px;font-weight:500;line-height:1.2;padding:13px 24px;border-radius:var(--r-btn);border:1px solid transparent;background:var(--accent);color:var(--on-accent);cursor:pointer;transition:opacity .2s,transform .2s;text-align:center}
.btn:hover{opacity:.86;text-decoration:none}
.btn:active{transform:scale(.98)}
.btn.ghost{background:transparent;color:var(--accent);border-color:var(--line)}
.btn.sm{font-size:14px;padding:8px 16px}
.menu-btn{display:none;background:none;border:0;color:var(--ink);padding:8px;margin-right:-8px;cursor:pointer}
section{padding:84px 0}
section+section{border-top:1px solid var(--line)}
.eyebrow{color:var(--accent);font-size:15px;font-weight:600;letter-spacing:0;margin-bottom:14px}
.sec-head{max-width:720px;margin:0 auto 44px;text-align:center}
.sec-head h2{font-size:clamp(32px,4.6vw,48px)}
.sec-head p{color:var(--muted);font-size:19px;margin-top:14px}
.lede{color:var(--muted);font-size:clamp(19px,2.2vw,22px);line-height:1.42;max-width:680px}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.hero{padding:92px 0 88px}
.hero h1{font-size:clamp(42px,7.4vw,84px);letter-spacing:-.032em;line-height:1.03}
.hero .lede{margin-top:22px}
.hero.center{text-align:center}
.hero.center .lede{margin-left:auto;margin-right:auto}
.hero.center .actions{justify-content:center}
.hero.center .shot{margin-top:72px}
.hero.split .wrap{display:grid;grid-template-columns:1.05fr 1fr;gap:64px;align-items:center}
.hero.split h1{font-size:clamp(40px,5.4vw,68px)}
.shot{border-radius:var(--r);overflow:hidden;background:var(--bg2);aspect-ratio:16/10}
.hero.split .shot{aspect-ratio:4/5}
.shot img{width:100%;height:100%;object-fit:cover}
.ph{display:grid;place-items:center;width:100%;height:100%;color:var(--muted);font-family:var(--font-head);font-size:clamp(56px,10vw,120px);font-weight:600;opacity:.28;letter-spacing:-.04em}
.hero.cover{position:relative;padding:0;color:#fff;background:#111;border-top:0}
.hero.cover .bgimg{position:absolute;inset:0}
.hero.cover .bgimg img{width:100%;height:100%;object-fit:cover}
.hero.cover .bgimg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,.62))}
.hero.cover .wrap{position:relative;min-height:min(86vh,760px);display:flex;flex-direction:column;justify-content:flex-end;padding-top:140px;padding-bottom:88px}
.hero.cover .lede,.hero.cover .eyebrow{color:rgba(255,255,255,.88)}
.hero.cover .btn{background:#fff;color:#1d1d1f}
.hero.cover .btn.ghost{background:transparent;color:#fff;border-color:rgba(255,255,255,.5)}
.about .wrap{display:grid;gap:64px;align-items:center}
.about.has-img .wrap{grid-template-columns:1fr 1fr}
.about:not(.has-img) .copy{max-width:760px;margin:0 auto;text-align:center}
.about h2{font-size:clamp(32px,4.6vw,48px);margin-bottom:22px}
.about p{color:var(--muted);font-size:19px;line-height:1.55}
.about p+p{margin-top:16px}
.about .shot{aspect-ratio:4/5}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;margin-top:52px;background:var(--line);border-block:1px solid var(--line);grid-column:1/-1}
.stat{background:var(--bg);padding:32px 16px;text-align:center}
.stat b{display:block;font-family:var(--font-head);font-size:clamp(34px,4.4vw,48px);font-weight:600;letter-spacing:-.03em;line-height:1.1}
.stat span{color:var(--muted);font-size:15px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
.card{background:var(--bg2);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column;transition:transform .3s,box-shadow .3s}
.card:hover,.quote:hover{transform:translateY(-3px);box-shadow:0 18px 40px -24px rgba(0,0,0,.25)}
.quote{transition:transform .3s,box-shadow .3s}
.card .pic{aspect-ratio:3/2;background:var(--line)}
.card .pic img{width:100%;height:100%;object-fit:cover}
.card .body{padding:30px;display:flex;flex-direction:column;gap:8px;flex:1}
.card h3{font-size:22px}
.card p{color:var(--muted);font-size:16px}
.card .price{margin-top:auto;padding-top:14px;font-weight:600;font-size:16px}
.tiles{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.tile{display:flex;gap:18px;justify-content:space-between;border:1px solid var(--line);border-radius:var(--r-sm);padding:20px}
.tile>div:first-child{min-width:0;flex:1}
.tile .tl{display:flex;justify-content:space-between;gap:16px;align-items:baseline}
.tile h3{font-size:18px;font-family:var(--font);letter-spacing:-.015em;line-height:1.3}
.tile .price{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.tile p{color:var(--muted);font-size:15px;margin-top:6px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.tile .pic{flex:none;width:112px;height:88px;border-radius:calc(var(--r-sm) - 4px);overflow:hidden;background:var(--bg2)}
.tile .pic img{width:100%;height:100%;object-fit:cover}
.rows{max-width:780px;margin:0 auto}
.row{display:grid;grid-template-columns:1fr auto;gap:6px 24px;padding:22px 0;border-bottom:1px solid var(--line)}
.row:first-child{border-top:1px solid var(--line)}
.row h3{font-size:19px;font-family:var(--font);letter-spacing:-.015em;line-height:1.3}
.row .price{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.row p{color:var(--muted);font-size:16px;grid-column:1}
.feat{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:48px 40px}
.feat>div{text-align:center}
.feat .ic{color:var(--accent);margin-bottom:16px;display:inline-flex}
.feat h3{font-size:21px;margin-bottom:8px}
.feat p{color:var(--muted);font-size:16px}
.gal{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.gal figure{border-radius:var(--r-sm);overflow:hidden;background:var(--bg2);aspect-ratio:1}
.gal figure:first-child:nth-last-child(n+5){grid-column:span 2;grid-row:span 2}
.gal img{width:100%;height:100%;object-fit:cover}
.quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
.quote{background:var(--bg2);border-radius:var(--r);padding:34px;display:flex;flex-direction:column;gap:22px}
.quote blockquote{font-family:var(--font-head);font-size:21px;line-height:1.36;letter-spacing:-.015em;font-weight:500}
.quote .stars{color:var(--accent);display:flex;gap:2px}
.quote figcaption{margin-top:auto;font-size:15px;font-weight:600}
.quote figcaption span{display:block;color:var(--muted);font-weight:400}
.faq{max-width:780px;margin:0 auto}
.faq details{border-bottom:1px solid var(--line)}
.faq details:first-child{border-top:1px solid var(--line)}
.faq summary{list-style:none;cursor:pointer;padding:24px 0;font-size:19px;font-weight:600;letter-spacing:-.015em;display:flex;justify-content:space-between;gap:20px;align-items:center}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"";flex:none;width:10px;height:10px;border-right:1.6px solid var(--muted);border-bottom:1.6px solid var(--muted);transform:rotate(45deg) translate(-3px,-3px);transition:transform .25s}
.faq details[open] summary::after{transform:rotate(-135deg) translate(-3px,-3px)}
.faq details p{color:var(--muted);padding:0 40px 26px 0}
.cta .panel{background:var(--bg2);border-radius:calc(var(--r) + 8px);padding:68px 32px;text-align:center}
.cta h2{font-size:clamp(32px,4.6vw,52px)}
.cta p{color:var(--muted);font-size:20px;margin:16px auto 0;max-width:560px}
.cta .actions{justify-content:center}
.contact .cols{display:grid;grid-template-columns:1fr 1.1fr;gap:72px;align-items:start}
.contact .cols.one{grid-template-columns:1fr;max-width:640px;margin:0 auto;text-align:center}
.contact h2{font-size:clamp(32px,4.6vw,48px)}
.contact .sub{color:var(--muted);font-size:19px;margin-top:14px}
.info{margin-top:40px;display:grid;gap:26px}
.cols.one .info{justify-items:center}
.info h3{font-family:var(--font);font-size:13px;font-weight:600;color:var(--muted);letter-spacing:.02em;text-transform:uppercase;margin-bottom:6px}
.info p,.info address{font-style:normal;font-size:17px}
.hours{display:grid;grid-template-columns:auto auto;gap:4px 28px;font-size:16px;justify-content:start}
.hours dt{color:var(--muted)}
.hours dd{font-variant-numeric:tabular-nums}
form.msg{background:var(--bg2);border-radius:var(--r);padding:34px;display:grid;gap:16px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
label.f{display:grid;gap:7px;font-size:14px;font-weight:500}
.f input,.f textarea{font:inherit;font-size:17px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:var(--r-sm);padding:13px 15px;width:100%;transition:border-color .2s,box-shadow .2s}
.f textarea{min-height:130px;resize:vertical}
.f input:focus,.f textarea:focus{outline:0;border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 18%,transparent)}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.note{font-size:13px;color:var(--muted)}
.sent{text-align:center;padding:40px 10px}
.sent .ic{color:var(--accent);display:inline-flex;margin-bottom:12px}
.sent h3{font-size:24px;margin-bottom:6px}
.sent p{color:var(--muted)}
.ftr{border-top:1px solid var(--line);background:var(--bg2);padding:64px 0 36px;font-size:14px;color:var(--muted)}
.ftr .top{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:40px}
.ftr .brand{font-size:18px;margin-bottom:12px}
.ftr h3{font-family:var(--font);font-size:13px;font-weight:600;color:var(--ink);letter-spacing:0;margin-bottom:12px}
.ftr ul{list-style:none;padding:0;display:grid;gap:9px}
.ftr a{color:var(--muted)}
.ftr a:hover{color:var(--ink)}
.soc{display:flex;gap:14px;margin-top:20px}
.soc a{display:inline-flex}
.ftr .base{display:flex;flex-wrap:wrap;gap:8px 24px;justify-content:space-between;border-top:1px solid var(--line);margin-top:48px;padding-top:22px;font-size:13px}
.legal{padding:88px 0 104px}
.legal h1{font-size:clamp(36px,5.4vw,56px);margin-bottom:10px}
.legal .date{color:var(--muted);margin-bottom:44px}
.legal h2{font-size:24px;margin:44px 0 12px}
.legal p,.legal li{color:var(--muted);font-size:17px;line-height:1.62}
.legal p+p{margin-top:14px}
.legal ul{padding-left:22px;display:grid;gap:8px;margin-top:8px}
.empty{border:1.5px dashed var(--line);border-radius:var(--r);padding:56px 20px;text-align:center;color:var(--muted)}
.on-brand,.on-dark{--bg:var(--brand);--ink:var(--on-brand);--muted:color-mix(in srgb,var(--on-brand) 76%,transparent);--accent:var(--on-brand);--on-accent:var(--brand);--bg2:color-mix(in srgb,var(--on-brand) 11%,transparent);--line:color-mix(in srgb,var(--on-brand) 22%,transparent);--glass:var(--brand);background:var(--bg);color:var(--ink)}
.on-dark{--brand:#111113;--on-brand:#f5f5f7}
section.bg-soft{background:var(--bg2)}
section.bg-soft .card,section.bg-soft .quote,section.bg-soft form.msg,section.bg-soft .cta .panel,section.bg-soft.cta .panel{background:var(--bg)}
section.on-brand,section.bg-soft,section.on-brand+section,section.bg-soft+section{border-top-color:transparent}
section.on-brand.cta .panel{background:var(--bg2)}
.on-brand .f input,.on-brand .f textarea{background:var(--on-brand);color:var(--brand);border-color:transparent}
.hdr.on-brand,.hdr.on-dark{border-bottom-color:transparent;-webkit-backdrop-filter:none;backdrop-filter:none}
.hdr.center .wrap{flex-direction:column;gap:6px;padding-top:16px;padding-bottom:12px}
.hdr.center .brand{margin:0;font-size:24px}
.hdr.center .brand img{height:44px;max-width:220px}
.hdr.mid .nav{flex:1}
.hdr.mid .nav>a:first-child{margin-left:auto}
.hdr.mid .nav .btn{margin-left:auto}
.hdr.mid .nav>a:first-child.btn{margin-left:auto}
.hero .hlogo{height:72px;width:auto;max-width:240px;object-fit:contain;margin:0 0 26px}
.hero.center .hlogo{margin-left:auto;margin-right:auto}
.ftr.plain{background:var(--bg)}
.ftr.on-brand,.ftr.on-dark{border-top-color:transparent}
.ftr.on-brand h3,.ftr.on-dark h3,.ftr.on-brand a:hover,.ftr.on-dark a:hover{color:var(--ink)}
.ftr.simple{text-align:center;padding:52px 0 32px}
.ftr.simple .brand{margin:0 0 8px;justify-content:center;font-size:20px}
.ftr.simple .links{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 22px;margin:22px 0 0;padding:0;list-style:none}
.ftr.simple .soc{justify-content:center}
.ftr.simple .base{justify-content:center;text-align:center;flex-direction:column;align-items:center;margin-top:28px}
.mode{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;border:0;background:color-mix(in srgb,currentColor 8%,transparent);color:var(--ink);cursor:pointer;opacity:.85;transition:opacity .2s,background .2s;vertical-align:middle;margin-left:6px}
.mode:hover{opacity:1;background:color-mix(in srgb,currentColor 10%,transparent)}
.mode .moon,html[data-alt] .mode .sun{display:none}
html[data-alt] .mode .moon{display:block}
html{transition:background-color .3s}
[data-preview] .pf-flash{animation:pfflash 1.4s ease-out}
@keyframes pfflash{0%,35%{box-shadow:inset 0 0 0 3px color-mix(in srgb,var(--accent) 70%,transparent)}100%{box-shadow:inset 0 0 0 3px transparent}}
[data-preview] [data-sec]{cursor:pointer;transition:box-shadow .15s}
[data-preview] [data-sec]:hover{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--accent) 55%,transparent)}
@media (max-width:860px){
  section{padding:60px 0}
  .hero{padding:60px 0}
  .hero.split .wrap,.about.has-img .wrap,.contact .cols{grid-template-columns:1fr;gap:40px}
  .hero.split .shot,.about .shot{aspect-ratio:4/3}
  .menu-btn{display:inline-flex}
  .hdr.center .wrap{flex-direction:row;padding-top:0;padding-bottom:0}
  .hdr.center .brand{margin-right:auto;font-size:19px}
  .hdr.center .brand img{height:30px}
  .hdr.mid .nav>a:first-child,.hdr.mid .nav .btn{margin-left:0}
  .nav{display:none;position:absolute;left:0;right:0;top:100%;flex-direction:column;align-items:stretch;gap:0;background:var(--bg);border-bottom:1px solid var(--line);padding:8px 24px 24px}
  .nav.open{display:flex}
  .nav a:not(.btn){font-size:19px;padding:14px 0;border-bottom:1px solid var(--line);opacity:1}
  .nav .btn{margin-top:18px;font-size:17px;padding:13px 24px}
  .gal{grid-template-columns:repeat(2,1fr)}
  .tiles{grid-template-columns:1fr}
  .ftr .top{grid-template-columns:1fr 1fr}
  .ftr .top>:first-child{grid-column:1/-1}
  .two{grid-template-columns:1fr}
  .cta .panel{padding:56px 24px}
  form.msg{padding:24px}
}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}
`;

// Runs on every page. Uses event delegation so it keeps working when the builder swaps the page body.
const SITE_JS = `(function(){var d=document,P=d.documentElement.hasAttribute('data-preview');
try{if(!P&&localStorage.getItem('pf-mode')==='alt')d.documentElement.setAttribute('data-alt','')}catch(e){}
d.addEventListener('click',function(e){var b=e.target.closest('.mode');if(!b)return;e.stopPropagation();var on=d.documentElement.toggleAttribute('data-alt');try{if(!P)localStorage.setItem('pf-mode',on?'alt':'')}catch(x){}},true);
d.addEventListener('click',function(e){var t=e.target;
var m=t.closest('.menu-btn');if(m){var n=d.querySelector('.nav');var o=n.classList.toggle('open');m.setAttribute('aria-expanded',o);return}
var a=t.closest('a');
if(a&&a.closest('.nav')){var nv=d.querySelector('.nav');nv&&nv.classList.remove('open')}
if(!P)return;
if(a){var h=a.getAttribute('href')||'';var pg=a.getAttribute('data-page');e.preventDefault();
if(pg){parent.postMessage({pf:'page',page:pg,hash:a.getAttribute('data-hash')||''},'*');return}
if(h.charAt(0)==='#'){var el=d.getElementById(h.slice(1));el&&el.scrollIntoView({behavior:'smooth'})}return}
if(t.closest('button,input,textarea,summary,label'))return;
var s=t.closest('[data-sec]');if(s)parent.postMessage({pf:'section',id:s.getAttribute('data-sec')},'*')});
d.addEventListener('submit',function(e){var f=e.target;if(!f.classList.contains('msg'))return;e.preventDefault();
var done=function(){var h=d.createElement('h3');h.textContent=f.dataset.sent||'Message sent';var q=d.createElement('p');q.textContent=f.dataset.sub||'';var w=d.createElement('div');w.className='sent';w.setAttribute('role','status');w.appendChild(h);w.appendChild(q);f.innerHTML='';f.appendChild(w)};
if(P){done();return}
var b=f.querySelector('button');var bt=b.textContent;b.disabled=true;b.textContent='…';
var body={};new FormData(f).forEach(function(v,k){body[k]=v});
fetch(f.action,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)}).then(function(r){if(!r.ok)throw 0;done()}).catch(function(){b.disabled=false;b.textContent=bt;var n=f.querySelector('.note');n.textContent='Something went wrong. Please try again, or contact us directly.';n.style.color='#d1372f'})});
})();`;

const paras = (text) => str(text, 60000).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

/** Small text format for legal pages: "## Heading", "- list item", blank line between paragraphs. */
export function richText(text) {
  const out = [];
  let list = [];
  let para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.join('<br>')}</p>`);
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${l}</li>`).join('')}</ul>`);
    para = []; list = [];
  };
  for (const raw of str(text, 60000).split('\n')) {
    const line = raw.trim();
    if (!line) flush();
    else if (/^#{1,3}\s+/.test(line)) { flush(); out.push(`<h2>${esc(line.replace(/^#{1,3}\s+/, ''))}</h2>`); }
    else if (/^[-•*]\s+/.test(line)) { if (para.length) flush(); list.push(esc(line.replace(/^[-•*]\s+/, ''))); }
    else { if (list.length) flush(); para.push(esc(line)); }
  }
  flush();
  return out.join('\n');
}

const anchorFor = (s) => (s.nav ? str(s.nav, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '') || s.id;

export function renderPage(site, page = 'home', opts = {}) {
  const base = str(opts.base, 200).replace(/\/$/, '');
  const preview = !!opts.preview;
  const home = `${base}/`;
  const isHome = page === 'home';
  const brand = site.brand || {};
  const biz = site.business || {};
  const name = str(brand.name, 80) || 'My Business';
  const sections = arr(site.sections).filter((s) => s && s.enabled !== false);
  const lang = site.lang === 'es' ? 'es' : 'en';
  const T = strings(lang);
  const ordering = opts.ordering || null;
  const menu = arr(opts.menu);
  const legalOn = Object.keys(LEGAL_PAGES).filter((k) => site.legal?.[k]?.enabled !== false);

  // Links: "#anchor" stays on the home page; from a legal page it points back home.
  const href = (u) => {
    const s = safeUrl(u);
    if (!s) return '';
    if (s === '/order') return ordering?.enabled ? pageHref('order') : '';
    if (s[0] === '#') return isHome ? `href="${esc(s)}"` : `href="${esc(home + s)}" data-page="home" data-hash="${esc(s.slice(1))}"`;
    return /^https?:/i.test(s) ? `href="${esc(s)}" target="_blank" rel="noopener"` : `href="${esc(s)}"`;
  };
  const pageHref = (p) => `href="${esc(p === 'home' ? home : `${base}/${p}`)}" data-page="${p}"`;
  const btn = (l, cls = '') => (l && str(l.label).trim() && href(l.href) ? `<a class="btn ${cls}" ${href(l.href)}>${esc(l.label)}</a>` : '');
  const img = (src, alt, eager) => `<img src="${esc(safeImg(src))}" alt="${esc(alt || '')}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
  const head = (d) => (str(d.title).trim() || str(d.subtitle).trim() ? `<div class="sec-head">${d.title ? `<h2>${esc(d.title)}</h2>` : ''}${d.subtitle ? `<p>${esc(d.subtitle)}</p>` : ''}</div>` : '');
  const emptyBox = (text) => (preview ? `<div class="empty">${esc(text)}</div>` : '');

  const address = [biz.address1, [biz.city, [biz.state, biz.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].map((x) => str(x).trim()).filter(Boolean);
  const mapUrl = address.length ? `https://maps.apple.com/?q=${encodeURIComponent(address.join(', '))}` : '';
  const hoursRows = arr(biz.hours).filter((h) => h && (str(h.label).trim() || str(h.value).trim()));
  const hoursHtml = hoursRows.length ? `<dl class="hours">${hoursRows.map((h) => `<dt>${esc(h.label)}</dt><dd>${esc(h.value)}</dd>`).join('')}</dl>` : '';

  const R = {
    hero(d, s, first) {
      const src = safeImg(d.image);
      const layout = ['center', 'split', 'cover'].includes(d.layout) ? d.layout : 'center';
      const H = first ? 'h1' : 'h2';
      const text = `${d.showLogo && safeImg(brand.logo) ? `<img class="hlogo" src="${esc(safeImg(brand.logo))}" alt="${esc(name)}">` : ''}${d.eyebrow ? `<p class="eyebrow">${esc(d.eyebrow)}</p>` : ''}<${H}${first ? '' : ' style="font-size:clamp(36px,6vw,64px)"'}>${esc(d.title)}</${H}>${d.subtitle ? `<p class="lede">${esc(d.subtitle)}</p>` : ''}<div class="actions">${btn(d.primary)}${btn(d.secondary, 'ghost')}</div>`;
      if (layout === 'cover' && src) return `<div class="bgimg">${img(src, '', first)}</div><div class="wrap"><div>${text}</div></div>`;
      const shot = src ? `<div class="shot">${img(src, name, first)}</div>` : layout === 'split' ? `<div class="shot"><div class="ph">${esc(name.slice(0, 1).toUpperCase())}</div></div>` : '';
      return `<div class="wrap"><div>${text}</div>${shot}</div>`;
    },
    about(d) {
      const src = safeImg(d.image);
      const stats = arr(d.stats).filter((x) => x && str(x.value).trim());
      return `<div class="wrap"><div class="copy">${d.title ? `<h2>${esc(d.title)}</h2>` : ''}${paras(d.body)}</div>${src ? `<div class="shot">${img(src, d.title)}</div>` : ''}${stats.length ? `<div class="stats">${stats.map((x) => `<div class="stat"><b>${esc(x.value)}</b><span>${esc(x.label)}</span></div>`).join('')}</div>` : ''}</div>`;
    },
    services(d) {
      const items = arr(d.items).filter((x) => x && str(x.name).trim());
      const body = !items.length ? emptyBox('Add your first item in the editor.')
        : d.layout === 'tiles'
          ? `<div class="tiles">${items.map((x) => `<article class="tile"><div><div class="tl"><h3>${esc(x.name)}</h3>${x.price ? `<span class="price">${esc(x.price)}</span>` : ''}</div>${x.desc ? `<p>${esc(x.desc)}</p>` : ''}</div>${safeImg(x.image) ? `<div class="pic">${img(x.image, x.name)}</div>` : preview ? '<div class="pic"></div>' : ''}</article>`).join('')}</div>`
        : d.layout === 'list'
          ? `<div class="rows">${items.map((x) => `<div class="row"><h3>${esc(x.name)}</h3>${x.price ? `<span class="price">${esc(x.price)}</span>` : '<span></span>'}${x.desc ? `<p>${esc(x.desc)}</p>` : ''}</div>`).join('')}</div>`
          : `<div class="grid">${items.map((x) => `<article class="card">${safeImg(x.image) ? `<div class="pic">${img(x.image, x.name)}</div>` : ''}<div class="body"><h3>${esc(x.name)}</h3>${x.desc ? `<p>${esc(x.desc)}</p>` : ''}${x.price ? `<div class="price">${esc(x.price)}</div>` : ''}</div></article>`).join('')}</div>`;
      return `<div class="wrap">${head(d)}${body}</div>`;
    },
    menu(d) { return menuSection(d, { menu, ordering, preview, orderHref: pageHref('order'), lang }); },
    features(d) {
      const items = arr(d.items).filter((x) => x && str(x.title).trim());
      return `<div class="wrap">${head(d)}<div class="feat">${items.map((x) => `<div><div class="ic">${icon(x.icon, 34)}</div><h3>${esc(x.title)}</h3>${x.desc ? `<p>${esc(x.desc)}</p>` : ''}</div>`).join('')}</div></div>`;
    },
    gallery(d) {
      const imgs = arr(d.images).filter((x) => x && safeImg(x.src));
      if (!imgs.length && !preview) return '';
      return `<div class="wrap">${head(d)}${imgs.length ? `<div class="gal">${imgs.map((x) => `<figure>${img(x.src, x.alt)}</figure>`).join('')}</div>` : emptyBox('Upload photos in the editor to fill your gallery.')}</div>`;
    },
    testimonials(d) {
      const items = arr(d.items).filter((x) => x && str(x.quote).trim());
      const stars = `<div class="stars" aria-label="5 out of 5 stars">${`<svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true">${ION.starfill}</svg>`.repeat(5)}</div>`;
      return `<div class="wrap">${head(d)}<div class="quotes">${items.map((x) => `<figure class="quote">${stars}<blockquote>“${esc(x.quote)}”</blockquote><figcaption>${esc(x.name)}${x.role ? `<span>${esc(x.role)}</span>` : ''}</figcaption></figure>`).join('')}</div></div>`;
    },
    faq(d) {
      const items = arr(d.items).filter((x) => x && str(x.q).trim());
      return `<div class="wrap">${head(d)}<div class="faq">${items.map((x) => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join('')}</div></div>`;
    },
    cta(d) {
      return `<div class="wrap"><div class="panel"><h2>${esc(d.title)}</h2>${d.subtitle ? `<p>${esc(d.subtitle)}</p>` : ''}<div class="actions">${btn(d.button)}</div></div></div>`;
    },
    contact(d) {
      const info = [
        address.length ? `<div><h3>${esc(T.location)}</h3><address>${address.map(esc).join('<br>')}</address>${mapUrl ? `<p><a href="${esc(mapUrl)}" target="_blank" rel="noopener">${esc(T.directions)}</a></p>` : ''}</div>` : '',
        biz.phone || biz.email ? `<div><h3>${esc(T.contact)}</h3>${biz.phone ? `<p><a ${href(biz.phone)}>${esc(biz.phone)}</a></p>` : ''}${biz.email ? `<p><a ${href(biz.email)}>${esc(biz.email)}</a></p>` : ''}</div>` : '',
        d.showHours !== false && hoursHtml ? `<div><h3>${esc(T.hours)}</h3>${hoursHtml}</div>` : '',
      ].join('');
      const form = d.showForm === false ? '' : opts.sent
        ? `<div class="msg"><div class="sent" role="status"><h3>${esc(T.sent)}</h3><p>${esc(T.sentSub)}</p></div></div>`
        : `<form class="msg" method="post" action="${esc(base)}/_forms/contact" data-sent="${esc(T.sent)}" data-sub="${esc(T.sentSub)}"><div class="two"><label class="f">${esc(T.name)}<input name="name" autocomplete="name" required maxlength="120"></label><label class="f">${esc(T.email)}<input name="email" type="email" autocomplete="email" required maxlength="200"></label></div><label class="f">${esc(T.phone)} <input name="phone" type="tel" autocomplete="tel" maxlength="40"></label><label class="f">${esc(T.message)}<textarea name="message" required maxlength="4000"></textarea></label><div class="hp" aria-hidden="true"><label>Leave this empty<input name="company_website" tabindex="-1" autocomplete="off"></label></div><button class="btn" type="submit">${esc(T.send)}</button><p class="note">${legalOn.includes('privacy') ? `${esc(T.agree)} <a ${pageHref('privacy')}>${esc(T.privacy)}</a>.` : esc(T.onlyReply)}</p></form>`;
      return `<div class="wrap"><div class="cols${form ? '' : ' one'}"><div><h2>${esc(d.title)}</h2>${d.subtitle ? `<p class="sub">${esc(d.subtitle)}</p>` : ''}<div class="info">${info}</div></div>${form}</div></div>`;
    },
  };

  /* Header */
  const logo = safeImg(brand.logo);
  const mode = logo ? brand.logoMode || 'image' : 'text';
  const brandHtml = `${logo && mode !== 'text' ? `<img src="${esc(logo)}" alt="${mode === 'image' ? esc(name) : ''}">` : ''}${mode !== 'image' ? `<span>${esc(name)}</span>` : ''}`;
  const navLinks = sections.filter((s) => str(s.nav).trim()).map((s) => `<a ${href('#' + anchorFor(s))}>${esc(s.nav)}</a>`).join('');
  const hc = site.header || {};
  const ann = site.announcement || {};
  const header = `<a class="skip" href="#main">${esc(T.skip)}</a>${ann.enabled && str(ann.text).trim() ? `<div class="bar">${esc(ann.text)}${href(ann.href) ? `<a ${href(ann.href)}>${esc(T.learnMore)} ›</a>` : ''}</div>` : ''}
<header class="hdr${hc.sticky === false ? '' : ' sticky'}${hc.layout === 'center' ? ' center' : hc.layout === 'mid' ? ' mid' : ''}${hc.style === 'brand' ? ' on-brand' : hc.style === 'dark' ? ' on-dark' : ''}"><div class="wrap"><a class="brand" ${pageHref('home')}>${brandHtml}</a><nav class="nav" id="nav" aria-label="Main">${navLinks}${hc.showPhone && biz.phone ? `<a ${href(biz.phone)}>${esc(biz.phone)}</a>` : ''}${btn(hc.cta, 'sm')}</nav><button class="menu-btn" aria-label="${esc(T.menu)}" aria-controls="nav" aria-expanded="false"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 8h16M4 16h16"/></svg></button></div></header>`;

  /* Body */
  let main;
  let pageTitle = '';
  let status = 200;
  if (isHome) {
    main = sections.map((s, i) => {
      const fn = R[s.type];
      if (!fn) return '';
      const d = s.data || {};
      const inner = fn(d, s, i === 0);
      if (!inner) return '';
      const cls = s.type === 'hero' ? `hero ${d.layout === 'cover' && safeImg(d.image) ? 'cover' : d.layout === 'split' ? 'split' : 'center'}` : s.type === 'about' ? `about${safeImg(d.image) ? ' has-img' : ''}` : s.type;
      return `<section class="${cls}${s.bg === 'soft' ? ' bg-soft' : s.bg === 'brand' && !cls.includes('cover') ? ' on-brand' : ''}" id="${esc(anchorFor(s))}" data-sec="${esc(s.id)}">${inner}</section>`;
    }).join('\n');
    if (!main && preview) main = `<section><div class="wrap">${emptyBox('Your page is empty. Add a section to get started.')}</div></section>`;
  } else if (page === 'order' && ordering?.enabled) {
    pageTitle = T.orderOnline;
    main = orderPage({ menu, ordering, base, preview, siteKey: str(opts.siteKey, 60) || 'site', hasPayUrl: !!safeUrl(biz.payUrl), lang, now: opts.now, taken: opts.taken, busy: opts.busy });
  } else if (page === 'order-status' && opts.order) {
    pageTitle = `${T.order} #${opts.order.number}`;
    main = orderStatusPage({ order: opts.order, ordering, payUrl: safeUrl(biz.payUrl), phoneHtml: biz.phone ? `<a class="btn" ${href(biz.phone)}>${esc(T.call)} ${esc(biz.phone)}</a>` : '', homeHref: pageHref('home'), orderHref: pageHref('order'), siteKey: str(opts.siteKey, 60) || 'site', lang, loyalty: opts.loyalty });
  } else if (page === 'invoice' && opts.invoice) {
    pageTitle = `${T.invoice} ${opts.invoice.label}`;
    main = invoicePage({ invoice: opts.invoice, business: { name: site.brand?.name || '', address: [biz.address1, biz.city, biz.state, biz.zip].filter(Boolean).join(', '), phone: str(biz.phone) }, payUrl: safeUrl(opts.invoice.payUrl) || safeUrl(biz.payUrl), lang });
  } else if (LEGAL_PAGES[page] && legalOn.includes(page)) {
    pageTitle = T[page] || LEGAL_PAGES[page];
    main = `<section class="legal"><div class="wrap narrow"><h1>${esc(pageTitle)}</h1><p class="date">${esc(T.effective)} ${esc(site.legal?.effective || '')}</p>${richText(legalText(page, site))}</div></section>`;
  } else {
    status = 404;
    pageTitle = 'Page not found';
    main = `<section class="hero center"><div class="wrap"><p class="eyebrow">404</p><h1>${esc(T.notFound)}</h1><p class="lede">${esc(T.notFoundSub)}</p><div class="actions"><a class="btn" ${pageHref('home')}>${esc(T.backHome)}</a></div></div></section>`;
  }

  /* Footer */
  const socials = Object.keys(SOCIAL).map((k) => { const u = socialUrl(k, site.social?.[k]); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener" aria-label="${SOCIAL[k][0]}"><svg viewBox="0 0 512 512" width="21" height="21" fill="currentColor">${SOCIAL[k][2]}</svg></a>` : ''; }).join('');
  const ft = site.footer || {};
  const payUrl = safeUrl(biz.payUrl);
  const footCols = `<div class="top">
<div><a class="brand" ${pageHref('home')}>${brandHtml}</a><p>${esc(str(ft.blurb).trim() || brand.tagline || '')}</p>${socials ? `<div class="soc">${socials}</div>` : ''}</div>
<div><h3>${esc(T.explore)}</h3><ul>${sections.filter((s) => str(s.nav).trim()).map((s) => `<li><a ${href('#' + anchorFor(s))}>${esc(s.nav)}</a></li>`).join('')}${ordering?.enabled ? `<li><a ${pageHref('order')}>${esc(T.orderOnline)}</a></li>` : ''}${payUrl ? `<li><a ${href(payUrl)}>${esc(T.payOnline)}</a></li>` : ''}</ul></div>
<div><h3>${esc(T.contact)}</h3><ul>${biz.phone ? `<li><a ${href(biz.phone)}>${esc(biz.phone)}</a></li>` : ''}${biz.email ? `<li><a ${href(biz.email)}>${esc(biz.email)}</a></li>` : ''}${address.length ? `<li>${address.map(esc).join('<br>')}</li>` : ''}</ul></div>
<div><h3>${esc(T.legal)}</h3><ul>${legalOn.map((k) => `<li><a ${pageHref(k)}>${esc(T[k] || LEGAL_PAGES[k])}</a></li>`).join('')}</ul></div>
</div>`;
  const footLinks = [...sections.filter((x) => str(x.nav).trim()).map((x) => `<li><a ${href('#' + anchorFor(x))}>${esc(x.nav)}</a></li>`), ordering?.enabled ? `<li><a ${pageHref('order')}>${esc(T.orderOnline)}</a></li>` : '', ...legalOn.map((k) => `<li><a ${pageHref(k)}>${esc(T[k] || LEGAL_PAGES[k])}</a></li>`)].join('');
  const footSimple = `<a class="brand" ${pageHref('home')}>${brandHtml}</a><p>${esc(str(ft.blurb).trim() || brand.tagline || '')}</p>${socials ? `<div class="soc">${socials}</div>` : ''}<ul class="links">${footLinks}</ul>`;
  const footCls = `${ft.style === 'simple' ? ' simple' : ''}${ft.color === 'brand' ? ' on-brand' : ft.color === 'dark' ? ' on-dark' : ft.color === 'plain' ? ' plain' : ''}`;
  const footer = `<footer class="ftr${footCls}"><div class="wrap">${ft.style === 'simple' ? footSimple : footCols}<div class="base"><span>© ${new Date().getFullYear()} ${esc(str(biz.legalName).trim() || name)}. ${esc(T.rights)}</span><span>${ft.showPayments !== false ? esc(T.cards) : ''}${ft.showPayments !== false && ft.showCredit !== false ? ' · ' : ''}${ft.showCredit !== false ? `${esc(T.websiteBy)} <a href="https://processorfreedom.com" target="_blank" rel="noopener">${PLATFORM}</a>` : ''}${ft.showMode !== false ? `<button class="mode" type="button" aria-label="Light or dark" title="Light / dark"><svg class="sun" viewBox="0 0 512 512" width="18" height="18" fill="currentColor">${ION.moon}</svg><svg class="moon" viewBox="0 0 512 512" width="18" height="18" fill="currentColor">${ION.sun}</svg></button>` : ''}</span></div></div></footer>`;

  /* Head */
  const seo = site.seo || {};
  const heroData = sections.find((s) => s.type === 'hero')?.data || {};
  const title = pageTitle ? `${pageTitle} · ${name}` : str(seo.title).trim() || (brand.tagline ? `${name} · ${brand.tagline}` : name);
  const desc = str(seo.description).trim() || str(heroData.subtitle).trim() || str(brand.tagline);
  const url = str(opts.url, 500);
  const origin = url.replace(/^(https?:\/\/[^/]+).*$/, '$1');
  const abs = (u) => (u && u[0] === '/' ? origin + u : u);
  const ogImg = abs(safeImg(seo.image) || safeImg(heroData.image));
  const letter = esc(name.slice(0, 1).toUpperCase());
  const accent = isHex(site.theme?.accent) ? site.theme.accent : '#1d1d1f';
  const favicon = logo && !/\.svg$/i.test(logo) ? esc(logo) : `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${accent}"/><text x="32" y="44" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="36" font-weight="600" text-anchor="middle" fill="${onColor(accent)}">${letter}</text></svg>`)}`;
  const ld = isHome && !preview ? `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'LocalBusiness', name, url: url || undefined, description: desc || undefined, image: ogImg || undefined,
    telephone: str(biz.phone) || undefined, email: str(biz.email) || undefined,
    address: address.length ? { '@type': 'PostalAddress', streetAddress: str(biz.address1) || undefined, addressLocality: str(biz.city) || undefined, addressRegion: str(biz.state) || undefined, postalCode: str(biz.zip) || undefined } : undefined,
  }).replace(/</g, '\\u003c')}</script>` : '';

  const vars = themeVars(site);
  const headHtml = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${desc ? `<meta name="description" content="${esc(desc)}">` : ''}
${str(seo.keywords).trim() ? `<meta name="keywords" content="${esc(str(seo.keywords, 300))}">` : ''}${url ? `<link rel="canonical" href="${esc(url)}">` : ''}${status === 404 || preview || page === 'order-status' || page === 'invoice' ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}">${desc ? `<meta property="og:description" content="${esc(desc)}">` : ''}${url ? `<meta property="og:url" content="${esc(url)}">` : ''}${ogImg ? `<meta property="og:image" content="${esc(ogImg)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="theme-color" content="${site.theme?.mode === 'dark' ? '#000000' : '#ffffff'}"><link rel="icon" href="${favicon}">
<style id="pf-vars">${vars}</style><style>${SITE_CSS}${ordering?.enabled || menu.length ? ORDER_CSS : ''}</style>${ld}${page === 'order-status' && !['completed', 'cancelled'].includes(opts.order?.status) ? '<meta http-equiv="refresh" content="30">' : ''}`;
  const body = `${header}\n<main id="main">${main}</main>\n${footer}`;
  const html = `<!doctype html><html lang="${lang}"${preview ? ' data-preview' : ''}><head>${headHtml}</head><body>${body}<script>${SITE_JS}</script>${ordering?.enabled ? `<script>${ORDER_JS}</script>` : ''}</body></html>`;
  return { html, body, vars, title, status };
}
