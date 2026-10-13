/* Technical details only for the person who runs Rate Book (13 Oct 2026): on any shop but the original one, owners and staff
   see a plain "Rate Book support will fix this" message instead of Apps Script steps, script versions, error codes or the AI
   model's name, and no "Update the sheet script" note. On the original shop its owner still sees them; its staff don't.
   Run: node tests/techhide.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const SH = 'SHARMA-AB12CD34EF', SH_API = 'https://script.google.com/macros/s/SHARMA/exec';
const html = appHtml('S,t,TECH,errMsg,aiErrText,renderSvNote,appUnlock,vErr');
(async () => {
  const b = await launch(); const errs = [];
  async function phone(shop, role) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => { const req = r.request(), code = /SHARMA/.test(new URL(req.url()).pathname) ? SH : 'main';
      const send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: code, ...o }) }), cfg = { shopName: 'Shop', mode: 'live' };
      if (req.method() === 'GET') return send({ rev: '1' });
      const bd = JSON.parse(req.postData()); if (bd.action === 'boot' || bd.action === 'list') return send({ rev: '1', items: [], config: cfg, sv: 40, me: { name: 'X', role, personal: true, prefs: {} } });
      return send({ me: { name: 'X', role, personal: true, prefs: {} } }); });
    const auth = JSON.stringify({ tok: 't', by: 'X', role, personal: true, pinH: 'x', pinS: 'AAAA' });
    await p.addInitScript(([sh, a, api]) => { if (sessionStorage.d) return; sessionStorage.d = 1;
      if (sh !== 'main') { localStorage.setItem('rb_shop', JSON.stringify({ code: sh, api, name: 'Sharma Traders', at: Date.now() })); localStorage.setItem(sh + ':rb_auth', a); } else localStorage.setItem('rb_auth', a); }, [shop, auth, SH_API]);
    await p.goto('https://rb.test/'); await p.waitForTimeout(1400); await p.evaluate(() => { T.appUnlock(); T.S.sv = 20; T.S.online = true; T.renderSvNote(); }); await p.waitForTimeout(200);
    return p; }
  const msgs = p => p.evaluate(() => [T.errMsg({ code: 'bad_action' }), T.aiErrText({ code: 'ai_auth' }), T.aiErrText({ code: 'weird_thing' }), T.vErr({ code: 'drive_auth' }), T.t('bkOff'), T.t('aiGoogleSaid', '400', 'API key not valid'), T.t('riOld')].join(' | '));
  const TECHY = /Apps Script|setupVendorDocs|setupBackups|testBillReading|Deploy|New version|weird_thing/;

  const a = await phone(SH, 'owner'), am = await msgs(a);
  ok(await a.evaluate(() => T.TECH()) === false && !TECHY.test(am) && /Rate Book support/.test(am), 'A1 another shop\'s owner: plain messages, no Apps Script steps or error codes');
  ok(/API key not valid/.test(am), 'A2 …Google\'s own reason for a refused key is still shown (the owner can act on it)');
  ok(!(await a.isVisible('#sv-note')), 'A3 …and no "Update the sheet script" note (the admin updates their script)');
  await a.evaluate(() => { T.S.lang = 'hi'; }); const ah = await msgs(a);
  ok(/Rate Book सपोर्ट/.test(ah) && !TECHY.test(ah), 'A4 the same in Hindi');

  const m = await phone('main', 'owner'), mm = await msgs(m);
  ok(await m.evaluate(() => T.TECH()) === true && /Apps Script|Deploy/.test(mm) && /setupVendorDocs/.test(mm) && /weird_thing/.test(mm), 'B1 the original shop\'s owner (you) still sees the technical steps and codes');
  ok(await m.isVisible('#sv-note') && /Update the sheet script/.test(await m.textContent('#sv-note')), 'B2 …and the "Update the sheet script" note');

  const s = await phone('main', 'manager'), sm = await msgs(s);
  ok(await s.evaluate(() => T.TECH()) === false && !TECHY.test(sm) && !(await s.isVisible('#sv-note')), 'C1 the original shop\'s managers and staff get the plain versions too');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
