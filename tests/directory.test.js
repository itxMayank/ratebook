/* admin/Directory.gs with stand-ins for Drive, Sheets, the Apps Script API and GitHub. Run: node tests/directory.test.js */
const path = require('path'), fs = require('fs');
const { gas } = require('./gas-mock');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const CODE = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
// --- tiny in-memory Sheets/Drive ---
let nid = 0; const files = {}, sheetsById = {};
function mkSheet(name) { const rows = []; return { name, rows, getName: () => name, setName(n) { this.name = n; name = n; },
  getLastRow: () => rows.length, getRange(r, c, nr = 1, nc = 1) { return { setValues(v) { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; }); }); return this; },
    getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))); }, getValue() { return (rows[r - 1] || [])[c - 1] ?? ''; }, setFontWeight() { return this; } }; },
  appendRow(row) { rows.push(row); }, setFrozenRows() {} }; }
function mkSS(title) { const id = 'ss' + (++nid); const sh = [mkSheet('Sheet1')]; const ss = { id, title, getId: () => id, getUrl: () => 'https://docs/' + id, getSheets: () => sh, getSheetByName: n => sh.find(s => s.getName() === n) || null, insertSheet(n) { const s = mkSheet(n); sh.push(s); return s; } };
  sheetsById[id] = ss; files[id] = { id, parent: 'root' }; return ss; }
function mkFolder(name, parent) { const id = 'f' + (++nid); files[id] = { id, name, parent, folder: true }; return { getId: () => id, isTrashed: () => false, createFolder: n => mkFolder(n, id), getName: () => name }; }
const DriveApp = { createFolder: n => mkFolder(n, 'root'), getFolderById: id => ({ getId: () => id, isTrashed: () => false, createFolder: n => mkFolder(n, id) }),
  getFileById: id => ({ moveTo: f => { (files[id] = files[id] || { id }).parent = f.getId(); } }) };
const SpreadsheetApp = { create: t => mkSS(t), openById: id => sheetsById[id] };
// --- Apps Script API + GitHub + shop endpoints ---
const projects = {}; let apiOn = true, shopAlive = true, log = [];
function respond(code, obj) { const txt = typeof obj === 'string' ? obj : JSON.stringify(obj); return { getResponseCode: () => code, getContentText: () => txt }; }
function fetch(url, o = {}) { const m = (o.method || 'get').toLowerCase(), body = o.payload ? JSON.parse(o.payload) : null; log.push(m + ' ' + url.replace(/\?.*$/, ''));
  if (url.startsWith('https://raw.githubusercontent.com/')) return respond(200, CODE);
  if (url.startsWith('https://script.googleapis.com/v1/projects')) { if (!apiOn) return respond(403, { error: { message: 'Apps Script API has not been used in project 123 before or it is disabled.' } });
    const p = url.replace('https://script.googleapis.com/v1/projects', '').split('/').filter(Boolean);
    if (!p.length && m === 'post') { const id = 'scr' + (++nid); projects[id] = { files: [], versions: 0, deps: {} }; return respond(200, { scriptId: id }); }
    const pr = projects[p[0]];
    if (p.length === 1 && m === 'get') return respond(200, { scriptId: p[0] });
    if (p[1] === 'content' && m === 'put') { pr.files = body.files; return respond(200, {}); }
    if (p[1] === 'content' && m === 'get') return respond(200, { files: pr.files });
    if (p[1] === 'versions') { pr.versions++; return respond(200, { versionNumber: pr.versions }); }
    if (p[1] === 'deployments' && m === 'post') { const d = 'dep' + (++nid); pr.deps[d] = body.versionNumber; return respond(200, { deploymentId: d, entryPoints: [{ entryPointType: 'WEB_APP', webApp: { url: 'https://script.google.com/macros/s/' + d + '/exec' } }] }); }
    if (p[1] === 'deployments' && m === 'get') return respond(200, { deploymentConfig: { versionNumber: pr.deps[p[2]] } });
    if (p[1] === 'deployments' && m === 'put') { pr.deps[p[2]] = body.deploymentConfig.versionNumber; return respond(200, {}); } }
  if (/action=ping/.test(url)) return respond(200, shopAlive ? { ok: true } : '<html>error</html>');
  if (/action=list/.test(url)) return respond(200, { ok: true, config: { units: [{ code: 'kg', hi: 'किलो' }, { code: 'pc', hi: 'पीस' }], defaultUnit: 'kg', defaultHsn: '3923' } });
  if (/action=health/.test(url)) return respond(200, { ok: true, sv: 35 });
  return respond(404, ''); }
const g = gas([path.join(__dirname, '..', 'admin', 'Directory.gs')], { DriveApp, SpreadsheetApp, UrlFetchApp: { fetch, fetchAll: rs => rs.map(r => fetch(r.url, r)) },
  ScriptApp: { getOAuthToken: () => 'tok', getScriptId: () => 'dirscript', getService: () => ({ getUrl: () => 'https://dir/exec' }) } });
g.Utilities.sleep = () => {}; const R = g.R;
// setup + admin sign-in
R('setupDirectory()'); const pinH = g.props.ADMIN_PIN_H; ok(!!pinH && !!g.props.DIR_SHEET_ID, 'setupDirectory: sheet made, admin PIN stored only as a hash');
const post = b => JSON.parse(R('doPost(' + JSON.stringify({ postData: { contents: JSON.stringify(b) } }) + ').text'));
const get = q => JSON.parse(R('doGet(' + JSON.stringify({ parameter: q }) + ').text'));
ok(post({ action: 'list' }).error === 'bad_session', 'admin actions need sign-in');
for (let i = 0; i < 6; i++) post({ action: 'signIn', pin: '0', dev: 'x' }); ok(post({ action: 'signIn', pin: '0', dev: 'x' }).error === 'locked', 'wrong admin PINs lock that device');
R("P_().setProperty('ADMIN_PIN_H', hash_('12345678'))"); const tok = post({ action: 'signIn', pin: '12345678', dev: 'y' }).tok; ok(!!tok, 'right admin PIN signs in');
// register main, then create a shop
const reg = post({ tok, action: 'register', name: 'Gupta Plastics', apiUrl: 'https://script.google.com/macros/s/MAIN/exec', scriptId: 'mainscr', deploymentId: 'maindep' });
ok(reg.ok && reg.healthKey && reg.healthKey.length === 24, 'register main shop: gets a health key to paste');
const cr = post({ tok, action: 'create', shop: { name: 'Sharma Traders', owner: 'Sharma ji', phone: '98', bizType: 'kirana', state: '27', dirUrl: 'https://dir/exec' } });
ok(cr.ok && /^SHARMATRAD-[A-Z2-9]{10}$/.test(cr.shop.code) && cr.shop.status === 'needs-auth' && /^\d{6}$/.test(cr.initPin), 'create shop: random code, waiting for one authorisation, starting PIN');
const sid = cr.shop.sheetId, cfg = sheetsById[sid].getSheetByName('Config').rows; const cv = k => (cfg.find(r => r[0] === k) || [])[1];
ok(cv('shopName') === 'Sharma Traders' && cv('mode') === 'test' && cv('approveNew') === 'true' && cv('nextBill') === 1 && JSON.parse(cv('units')).length === 2 && cv('bizType') === 'kirana', 'new sheet seeded: name, test mode, approval on, numbers from 1, units copied from main');
ok(sheetsById[sid].getSheets().length === 1 && !cfg.some(r => r[0] === 'Items'), 'no items, bills or customers copied');
const pr = projects[cr.shop.scriptId], shopGs = pr.files.find(f => f.name === 'Shop').source, boot = JSON.parse(shopGs.match(/SHOP_BOOT = (\{[\s\S]*?\});/)[1]);
ok(boot.code === cr.shop.code && boot.sheetId === sid && boot.vdFolder && boot.bkFolder && boot.vdFolderTest && boot.dirUrl === 'https://dir/exec' && boot.initPin === cr.initPin, 'Shop.gs: own sheet, own folders (by id), Directory link, keys');
ok(pr.files.find(f => f.name === 'Code').source === CODE && /ANYONE_ANONYMOUS/.test(pr.files.find(f => f.name === 'appsscript').source), 'script: latest Code.gs from GitHub + web-app settings');
ok(Object.values(files).filter(f => f.folder && f.parent === Object.values(files).find(x => x.name === cr.shop.name + ' (' + cr.shop.code + ')').id).length === 3, 'folder with vendor bills / test / backups');
// lookup by code
ok(get({ action: 'shop', code: cr.shop.code }).error === 'bad_code', 'not usable by phones until authorised (setupShop run)');
post({ tok, action: 'recheck' });   // health answers → live
const lk = get({ action: 'shop', code: cr.shop.code.toLowerCase(), dev: 'p1' });
ok(lk.ok && lk.api === cr.shop.apiUrl && lk.name === 'Sharma Traders' && Object.keys(lk).sort().join() === 'code,ms,name,ok,status' .split(',').concat('api').sort().join(), 'after authorising: code → link (only link, name, status)');
ok(get({ action: 'shop', code: 'main' }).error === 'bad_code', 'the original shop is never handed out by code');
for (let i = 0; i < 10; i++) get({ action: 'shop', code: 'GUESS-' + i, dev: 'p2' }); ok(get({ action: 'shop', code: cr.shop.code, dev: 'p2' }).error === 'dir_locked', '10 wrong codes: that phone waits');
// pause, shop status for the shop script
ok(get({ action: 'shopStatus', code: cr.shop.code, key: 'wrong' }).error === 'bad_key', 'shop status needs the shop\'s key');
post({ tok, action: 'setStatus', code: cr.shop.code, status: 'paused' }); ok(get({ action: 'shopStatus', code: cr.shop.code, key: boot.healthKey }).status === 'paused', 'pause: the shop learns it with its key');
post({ tok, action: 'setStatus', code: cr.shop.code, status: 'live' });
// update: keeps link, replaces only the app code; main keeps its file names
projects.mainscr = { files: [{ name: 'appsscript', type: 'JSON', source: '{"timeZone":"Asia/Kolkata","webapp":{"executeAs":"USER_DEPLOYING","access":"ANYONE_ANONYMOUS"}}' }, { name: 'Main', type: 'SERVER_JS', source: 'const SCRIPT_VERSION = 34;' }, { name: 'Notes', type: 'SERVER_JS', source: '// mine' }], versions: 7, deps: { maindep: 7 } };
const up = post({ tok, action: 'update', code: 'main' });
ok(up.ok && projects.mainscr.files.length === 3 && projects.mainscr.files.find(f => f.name === 'Main').source === CODE && projects.mainscr.files.find(f => f.name === 'Notes').source === '// mine' && projects.mainscr.deps.maindep === 8, 'update main: code replaced in its own file, other files kept, same deployment moved to the new version');
shopAlive = false; const bad = post({ tok, action: 'update', code: 'main' });
ok(!bad.ok && /rolled_back/.test(bad.error) && projects.mainscr.deps.maindep === 8, 'shop not answering after an update: previous version put back automatically');
shopAlive = true;
const up2 = post({ tok, action: 'update', code: cr.shop.code }); const sg = projects[cr.shop.scriptId].files.find(f => f.name === 'Shop').source;
ok(up2.ok && JSON.parse(sg.match(/SHOP_BOOT = (\{[\s\S]*?\});/)[1]).sheetId === sid, 'update a made shop: its Shop.gs (sheet, folders, keys) is kept');
apiOn = false; const off = post({ tok, action: 'create', shop: { name: 'X' } }); ok(!off.ok && /^script_api_off/.test(off.error), 'Apps Script API off: a clear message (and the folder/sheet are recorded on the dashboard)');
ok(g.locks.n === 0, 'locks released');
process.exit(fails ? 1 : 0);
