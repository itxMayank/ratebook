/* admin.html against a stand-in Directory: connect, sign in, live shop cards, create a shop. Run: node tests/admin.test.js */
const fs = require('fs'), path = require('path');
const { launch, ok, done, ROOT } = require('./browser');
const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8').replace(/const DIR_URL = "[^"]*";/, 'const DIR_URL = "";');
const DIR = 'https://script.google.com/macros/s/DIRECTORY/exec';
const state = {}; const shops = [{ code: 'main', name: 'Gupta Plastics', status: 'live', version: 34, err24: 2, scriptId: 'm', deploymentId: 'd', apiUrl: 'x', editUrl: 'e' }];
(async () => {
  const b = await launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await p.route(DIR, r => { const bd = JSON.parse(r.request().postData()); const send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, ...o }) });
    if (bd.action === 'signIn') return bd.pin === '12345678' ? send({ tok: 'T' }) : send({ ok: false, error: 'bad_pin' });
    if (bd.tok !== 'T') return send({ ok: false, error: 'bad_session' });
    if (bd.action === 'list') return send({ shops });
    if (bd.action === 'errors') return send({ errors: [{ t: Date.now() - 60000, shop: 'main', kind: 'phone', where: 'index.html:4120:9', m: "Cannot read properties of undefined (reading 'qty')", who: 'Raju', phone: 'k3x9ab · Android', detail: 'screen: bill | TypeError at stepQty' }, { t: Date.now() - 7200e3, shop: 'main', kind: 'sheet', where: 'takeBill', m: 'Exception: Service Spreadsheets timed out' }].filter(e => !bd.code || e.shop === bd.code) });
    if (bd.action === 'deleteShop') { if (bd.confirm.toUpperCase() !== bd.code) return send({ ok: false, error: 'confirm_code' }); shops.splice(shops.findIndex(x => x.code === bd.code), 1); state.del = bd; return send({ steps: ['Timed jobs removed (2)', 'Sheet deleted'], warn: [] }); }
    if (bd.action === 'latest') return send({ latest: { sv: 35 } });
    if (bd.action === 'recheck') return send({ health: { main: { ok: true, sv: 34, items: 412, bills: { today: 23, todayAmt: 18450, month: 410, monthAmt: 512000 }, sessions: 4, pending: 1, p50: 640, p95: 2100, lastChange: Date.now() - 120000, backupLast: Date.now() - 3600e3, approveNew: false, triggers: ['autoBackup', 'watchSheet'], errors: [] } } });
    if (bd.action === 'create') { shops.push({ code: 'SHARMATRAD-ABCDEFGHJK', name: bd.shop.name, status: 'needs-auth', version: 35, editUrl: 'https://script.google.com/d/s/edit', scriptId: 's', deploymentId: 'd2' }); return send({ shop: shops[1], initPin: '482913', shopLink: '?shop=SHARMATRAD-ABCDEFGHJK' }); }
    return send({}); });
  await p.goto('https://rb.test/admin.html'); await p.waitForTimeout(300);
  ok(await p.isVisible('#s-setup'), 'first visit asks for the Directory link');
  await p.fill('#dir-url', DIR); await p.click('#dir-save'); await p.fill('#pin', '1111'); await p.click('#b-signin'); await p.waitForTimeout(400);
  ok((await p.textContent('#signin-err')) === 'Wrong PIN.', 'wrong admin PIN refused');
  await p.fill('#pin', '12345678'); await p.click('#b-signin'); await p.waitForTimeout(900);
  const card = await p.textContent('#shops');
  ok(/Gupta Plastics/.test(card) && /23/.test(card) && /₹18,450/.test(card) && /\+1 waiting/.test(card) && /update to v35/.test(card), 'live card: bills today, amount, waiting phones, update available');
  await p.click('#shops a.errlink'); await p.waitForTimeout(500);
  const el = await p.textContent('#e-list');
  ok(/2 errors in 24 h/.test(card) && /Raju/.test(el) && /reading 'qty'/.test(el) && /timed out/.test(el) && await p.$eval('#e-shop', s => s.value) === 'main', 'errors: count on the card, log of phone + sheet errors for that shop');
  await p.click('#theme button[data-th=dark]'); const dk = await p.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor, localStorage.rbadm_theme]);
  await p.click('#theme button[data-th=""]'); const au = await p.evaluate(() => document.documentElement.dataset.theme || '');
  ok(dk[0] === 'dark' && dk[1] === 'rgb(15, 16, 18)' && dk[2] === '"dark"' && au === '', 'theme switch: dark applies and is remembered; Auto follows the computer');
  ok(await p.$eval('.card', e => getComputedStyle(e).borderRadius) === '0px' && await p.$eval('button', e => getComputedStyle(e).borderRadius) === '0px', 'square corners');
  await p.screenshot({ path: process.env.SHOT || '/tmp/admin.png', fullPage: true });
  await p.click('#b-new'); await p.fill('#f-new input[name=name]', 'Sharma Traders'); await p.selectOption('#f-new select[name=bizType]', 'kirana'); await p.click('#b-create'); await p.waitForTimeout(900);
  const dn = await p.textContent('#new-done');
  ok(/SHARMATRAD-ABCDEFGHJK/.test(dn) && /482913/.test(dn) && /setupShop/.test(dn) && /\?shop=SHARMATRAD-ABCDEFGHJK/.test(dn), 'create: code, starting PIN, the one authorise step and the shop link shown');
  ok(/needs authorising|One step left/.test(await p.textContent('#shops')), 'new shop card shows the remaining step');
  ok(!(await p.$('[data-act=delete][data-code=main]')), 'no delete button on your own shop');
  p.on('dialog', d => d.accept());
  await p.click('[data-act=delete][data-code=SHARMATRAD-ABCDEFGHJK]'); await p.waitForTimeout(200);
  const dis1 = await p.$eval('#b-del', b => b.disabled); await p.fill('#del-in', 'sharmatrad-abcdefghjk'); const dis2 = await p.$eval('#b-del', b => b.disabled);
  await p.click('#b-del'); await p.waitForTimeout(700);
  ok(dis1 && !dis2 && state.del && state.del.permanent === true && /is deleted/.test(await p.textContent('#del-done')) && !/SHARMATRAD/.test(await p.textContent('#shops')), 'delete: button only works once the code is typed, permanent by default, shop gone from the list');
  await b.close(); done();
})();
