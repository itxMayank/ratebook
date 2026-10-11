/* Design pass C (11 Oct 2026): one set of motion and corner tokens, report bars animate with transform, line icons
   instead of emoji, full app icon set (maskable 192/512 inside the 80% safe circle, monochrome, SVG favicon).
   Run: node tests/designc.test.js */
const fs = require('fs'), path = require('path'), http = require('http');
const { launch, ok, done } = require('./browser');
const ROOT = path.join(__dirname, '..'), html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = html.slice(0, html.indexOf('</head>'));
(async () => {
  const curves = (css.match(/cubic-bezier\([^)]*\)/g) || []);
  ok(/--ease-out:cubic-bezier/.test(css) && curves.length <= 5, `motion: easing comes from tokens (${curves.length} curves, all in :root)`);
  const radii = [...css.matchAll(/border-radius:([^;}"!]*)/g)].map(m => m[1].trim()).filter(v => /\d+px/.test(v) && !/^(0|[234]px|3px 3px 1px 1px)$/.test(v));
  ok(radii.length === 0, 'corners: only the token scale (plus hairline 2–4 px): ' + radii.slice(0, 5).join(' | '));
  ok(!/[🔒📄🧾📎📷🔗⚠]/u.test(html), 'no emoji used as icons in the app (line icons instead)');
  const tiny = [...css.matchAll(/([^{}]*)\{[^}]*font(?:-size)?:[^;}]*?\b(\d+(?:\.\d+)?)px/g)].filter(m => +m[2] < 11 && !/printroot|rp-chart|@page/.test(m[1]));
  ok(tiny.length === 0, 'screen text is never under 11 px: ' + tiny.map(m => m[1].trim().slice(-40)).join(' | '));
  const drops = [...css.matchAll(/box-shadow:([^;}"]*)/g)].map(m => m[1]).filter(v => /rgba/.test(v) && !/^inset/.test(v));
  ok(drops.length === 0, 'shadows: only the tokens --shadow-sm / --shadow / --shadow-lg / --shadow-up (rings and hairlines aside): ' + drops.slice(0, 3).join(' | '));
  const SCALE = [11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32];
  const off = [...html.matchAll(/([^{}]*)\{[^{}]*?(?:font-size:\s*|font:\s*(?:[a-z0-9]+ )*?)(\d+(?:\.\d+)?)px/g)].filter(m => !SCALE.includes(+m[2]) && !/printroot|rp-chart|vv-pdf|@page/.test(m[1]));
  const offInline = [...html.slice(html.indexOf('</head>')).matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].filter(m => !SCALE.includes(+m[1]));
  ok(off.length === 0 && offInline.length === 0, 'font sizes on the type scale 11·12·13·14·15·16·18·20·22·24·28·32: ' + off.map(m => m[2] + ' ' + m[1].trim().slice(-30)).join(' | '));
  ok(/\.rph-d\{[^}]*transform:scaleY/.test(css) && !/transition:[^;}]*\b(width|height|left|top)\b/.test(css.replace(/\.rph-seg\{[^}]*\}/, '')), 'animations use transform, not width/height/left/top (split bar excepted)');
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8')), has = (p, sz) => man.icons.some(i => i.purpose === p && i.sizes === sz && fs.existsSync(path.join(ROOT, i.src)));
  ok(has('any', '192x192') && has('any', '512x512') && has('maskable', '192x192') && has('maskable', '512x512') && has('monochrome', '512x512'), 'manifest: any + maskable at 192 and 512, plus a monochrome icon; files exist');
  ok(/rel="icon" type="image\/svg\+xml" href="icon.svg"/.test(html) && fs.existsSync(path.join(ROOT, 'icon.svg')), 'sharp SVG favicon');
  // maskable: everything outside the centred 80% circle is plain background
  const srv = http.createServer((q, r) => { if (q.url === '/') { r.writeHead(200, { 'Content-Type': 'text/html' }); return r.end('<!doctype html><title>t</title>'); } const f = path.join(ROOT, q.url.slice(1)); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': 'image/png' }); r.end(fs.readFileSync(f)); }).listen(0);
  const port = srv.address().port, b = await launch(), p = await b.newPage(); await p.goto(`http://localhost:${port}/`);
  for (const f of ['icon-maskable-512.png', 'icon-maskable-192.png']) {
    const out = await p.evaluate(async u => { const im = new Image(); im.src = u; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data, W = c.width, bg = [d[0], d[1], d[2]]; let bad = 0;
      for (let y = 0; y < W; y++) for (let i = 0; i < W; i++) { const r = Math.hypot(i + .5 - W / 2, y + .5 - W / 2) / W; if (r > .4) { const k = (y * W + i) * 4; if (Math.abs(d[k] - bg[0]) + Math.abs(d[k + 1] - bg[1]) + Math.abs(d[k + 2] - bg[2]) > 12) bad++; } }
      return { bad, bg }; }, `http://localhost:${port}/${f}`);
    ok(out.bad === 0 && out.bg.join() === '79,70,229', `${f}: artwork inside the safe circle on an Iris background`);
  }
  await b.close(); srv.close(); done();
})();
