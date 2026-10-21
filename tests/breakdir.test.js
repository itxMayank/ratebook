/* Break pass (21 Oct 2026): the Directory (admin side of many shops) attacked from outside and with odd input. Same stand-ins as directory.test.js. Run: node tests/breakdir.test.js */
const path = require('path'), fs = require('fs');
const { gas } = require('./gas-mock');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const CODE = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
// --- tiny in-memory Sheets/Drive ---
let nid = 0; const files = {}, sheetsById = {};
function mkSheet(name) { const rows = []; return { name, rows, getName: () => name, setName(n) { this.name = n; name = n; },
  getLastRow: () => rows.length, getRange(r, c, nr = 1, nc = 1) { return { setValues(v) { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; }); }); return this; },
    getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))); }, getValue() { return (rows[r - 1] || [])[c - 1] ?? ''; }, setFontWeight() { return this; } }; },
  appendRow(row) { rows.push(row); }, deleteRow(r) { rows.splice(r - 1, 1); }, deleteRows(r, n) { rows.splice(r - 1, n); }, setFrozenRows() {} }; }
function mkSS(title) { const id = 'ss' + (++nid); const sh = [mkSheet('Sheet1')]; const ss = { id, title, getId: () => id, getUrl: () => 'https://docs/' + id, getSheets: () => sh, getSheetByName: n => sh.find(s => s.getName() === n) || null, insertSheet(n) { const s = mkSheet(n); sh.push(s); return s; } };
  sheetsById[id] = ss; files[id] = { id, name: title, parent: 'root' }; return ss; }
function mkFolder(name, parent) { const id = 'f' + (++nid); files[id] = { id, name, parent, folder: true }; return { getId: () => id, isTrashed: () => false, createFolder: n => mkFolder(n, id), getName: () => name }; }
const gone = id => { if (!files[id]) throw new Error('File not found: ' + id); return files[id]; };
const DriveApp = { createFolder: n => mkFolder(n, 'root'), getFolderById: id => ({ getId: () => id, isTrashed: () => !!(files[id] || {}).trashed, createFolder: n => mkFolder(n, id),
    getParents: () => { const ps = [gone(id).parent]; return { hasNext: () => ps.length > 0, next: () => ({ getId: () => ps.shift() }) }; }, setTrashed: v => { gone(id).trashed = v; } }),
  getFileById: id => ({ moveTo: f => { (files[id] = files[id] || { id }).parent = f.getId(); }, getName: () => gone(id).name, setTrashed: v => { gone(id).trashed = v; } }) };
let retireReply = null, driveDeleted = [];
const SpreadsheetApp = { create: t => mkSS(t), openById: id => sheetsById[id] };
// --- Apps Script API + GitHub + shop endpoints ---
const projects = {}; let healthUrls = [], apiOn = true, shopAlive = true, authed = false, log = [], hx = {}, pings = 0, pingSvs = [];
function respond(code, obj) { const txt = typeof obj === 'string' ? obj : JSON.stringify(obj); return { getResponseCode: () => code, getContentText: () => txt }; }
function fetch(url, o = {}) { const m = (o.method || 'get').toLowerCase(), body = o.payload ? JSON.parse(o.payload) : null; log.push(m + ' ' + url.replace(/\?.*$/, ''));
  if (url.startsWith('https://raw.githubusercontent.com/')) return respond(200, CODE);
  if (url.startsWith('https://script.googleapis.com/v1/projects')) { if (!apiOn) return respond(403, { error: { message: 'Apps Script API has not been used in project 123 before or it is disabled.' } });
    const p = url.replace('https://script.googleapis.com/v1/projects', '').split('/').filter(Boolean);
    if (!p.length && m === 'post') { const id = 'scr' + (++nid); projects[id] = { files: [], versions: 0, deps: {} }; files[id] = { id, name: body.title, parent: 'root' }; return respond(200, { scriptId: id }); }
    const pr = projects[p[0]];
    if (p.length === 1 && m === 'get') return respond(200, { scriptId: p[0] });
    if (p[1] === 'content' && m === 'put') { pr.files = body.files; return respond(200, {}); }
    if (p[1] === 'content' && m === 'get') return respond(200, { files: pr.files });
    if (p[1] === 'versions') { pr.versions++; return respond(200, { versionNumber: pr.versions }); }
    if (p[1] === 'deployments' && m === 'post') { const d = 'dep' + (++nid); pr.deps[d] = body.versionNumber; return respond(200, { deploymentId: d, entryPoints: [{ entryPointType: 'WEB_APP', webApp: { url: 'https://script.google.com/macros/s/' + d + '/exec' } }] }); }
    if (p[1] === 'deployments' && m === 'get') return respond(200, { deploymentConfig: { versionNumber: pr.deps[p[2]] } });
    if (p[1] === 'deployments' && m === 'delete') { delete pr.deps[p[2]]; return respond(200, {}); }
    if (p[1] === 'deployments' && m === 'put') { pr.deps[p[2]] = body.deploymentConfig.versionNumber; return respond(200, {}); } }
  if (url.startsWith('https://www.googleapis.com/drive/v3/files/') && m === 'delete') { const id = decodeURIComponent(url.split('/files/')[1].split('?')[0]); if (!files[id]) return respond(404, '');
    const rm = i => { driveDeleted.push(i); delete files[i]; Object.values(files).filter(f => f.parent === i).forEach(f => rm(f.id)); }; rm(id); return respond(204, ''); }
  if (/action=retire/.test(url)) return respond(200, retireReply || { ok: true, triggers: 2, sheetId: '' });
  if (/action=ping/.test(url)) { pings++; const v = pingSvs.length ? pingSvs.shift() : null; return respond(200, shopAlive ? (v ? { ok: true, sv: v } : { ok: true }) : '<html>error</html>'); }
  if (/action=list/.test(url)) return respond(200, { ok: true, config: { units: [{ code: 'kg', hi: 'किलो' }, { code: 'pc', hi: 'पीस' }], defaultUnit: 'kg', defaultHsn: '3923' } });
  if (/action=health/.test(url)) { healthUrls.push(url); } if (/action=health/.test(url)) return respond(200, authed ? Object.assign({ ok: true, sv: 35 }, /MAIN/.test(url) ? hx : {}) : '<html>Authorisation needed</html>');
  return respond(404, ''); }
const g = gas([path.join(__dirname, '..', 'admin', 'Directory.gs')], { DriveApp, SpreadsheetApp, UrlFetchApp: { fetch, fetchAll: rs => rs.map(r => fetch(r.url, r)) },
  ScriptApp: { getOAuthToken: () => 'tok', getScriptId: () => 'dirscript', getService: () => ({ getUrl: () => 'https://dir/exec' }) } });
g.Utilities.sleep = () => {}; const R = g.R; const shopGet = c => R('shopGet_(' + JSON.stringify(c) + ')');
// setup + admin sign-in
R('setupDirectory()'); const pinH = g.props.ADMIN_PIN_H; ok(!!pinH && !!g.props.DIR_SHEET_ID, 'setupDirectory: sheet made, admin PIN stored only as a hash');
const post = b => JSON.parse(R('doPost(' + JSON.stringify({ postData: { contents: JSON.stringify(b) } }) + ').text'));
const get = q => JSON.parse(R('doGet(' + JSON.stringify({ parameter: q }) + ').text'));
R("P_().setProperty('ADMIN_PIN_H', hash_('48261937'))");
// ---------- A. admin sign-in ----------
ok(['list', 'create', 'deleteShop', 'startPin', 'update', 'setStatus', 'errors', 'shopInsights'].every(a => post({ action: a }).error === 'bad_session' && post({ action: a, tok: 'f'.repeat(64) }).error === 'bad_session'), 'A1 every admin action without a sign-in, or with a made-up one: refused');
ok(['__proto__', 'constructor', 'toString', 'nope'].every(a => post({ action: a, tok: 'x' }).error === 'bad_action'), 'A2 unknown actions (incl. JavaScript internals): refused');
ok(post({ action: 'signIn' }).error === 'bad_pin' && post({ action: 'signIn', pin: '' }).error === 'bad_pin', 'A3 sign-in with no PIN: refused');
const tok = post({ action: 'signIn', pin: '48261937', dev: 'mylaptop' }).tok; ok(!!tok, 'A4 the right admin PIN signs in');
R(`(function(){ const all = adminSess_(); Object.keys(all).forEach(k => all[k] = Date.now() - 31 * 864e5); P_().setProperty('ADMIN_SESS', JSON.stringify(all)); })()`);
ok(post({ action: 'list', tok }).error === 'bad_session', 'A5 a dashboard sign-in unused for 31 days stops working');
const T = post({ action: 'signIn', pin: '48261937', dev: 'mylaptop' }).tok;
// ---------- B. making shops with odd input ----------
log = [];
const cr = post({ action: 'create', tok: T, shop: { name: '<img src=x onerror=alert(1)> =IMPORTXML("x") Shop', owner: '=HYPERLINK("http://evil")', phone: '+cmd' } });
const code = cr.shop && cr.shop.code;
ok(cr.ok && /^[A-Z0-9]{1,10}-[A-Z2-9]{10}$/.test(code), 'B1 a shop named with HTML and a sheet formula: its code is plain letters and digits (' + code + ')');
const row = g.SpreadsheetApp.openById(g.props.DIR_SHEET_ID).getSheetByName('Shops').rows.find(r => r[0] === code);
ok(/^'/.test(row[2]) && /^'/.test(row[3]), 'B2 the owner and phone typed as formulas are stored as plain text in the Directory sheet');
const bad = ['../../evil/repo/main', 'main/../../x', 'http://evil', 'main?x=1', 'a b', '%2e%2e/x'];
const refs = bad.map(ref => [post({ action: 'latest', tok: T, ref }).error, post({ action: 'create', tok: T, ref, shop: { name: 'X' } }).error, post({ action: 'update', tok: T, code, ref }).error]);
ok(refs.every(r => r.every(e => e === 'bad_ref')) && !log.some(u => /evil|\.\./.test(u)), 'B3 a script "branch" that points elsewhere (../../evil/repo, a URL, junk): refused before anything is fetched, so no shop can be given someone else\'s code');
ok(post({ action: 'latest', tok: T, ref: 'claude/friendly-ramanujan-vd1vb8' }).ok && post({ action: 'latest', tok: T }).ok, 'B4 a real branch name (or none = main) still works');
ok(post({ action: 'create', tok: T, shop: { name: '   ' } }).error === 'need_name', 'B5 a shop with no name: refused');

// ---------- C. the public lookup ----------
R(`(function(){ const x = shopGet_('${code}'); x.status = 'live'; x.apiUrl = 'https://script.google.com/macros/s/AAA/exec'; shopSave_(x); })()`);
const L = get({ action: 'shop', code: code.toLowerCase(), dev: 'p1' });
ok(L.ok && Object.keys(L).filter(k => k !== 'ms').sort().join() === 'api,code,name,ok,status', 'C1 the lookup (code typed in small letters) answers only code, link, name and status: no key, sheet, folder, owner or phone');
ok(get({ action: 'shop', code: 'main', dev: 'p1' }).error === 'bad_code' && get({ action: 'shop', code: 'MAIN', dev: 'p1' }).error === 'bad_code', 'C2 the original shop can\'t be looked up by "main"');
ok(get({ action: 'shop', code: '', dev: 'p1' }).error === 'bad_code' && get({ action: 'shop', code: "' OR 1=1 --", dev: 'p1' }).error === 'bad_code', 'C3 empty or injection-looking codes: "wrong code"');
for (let i = 0; i < 10; i++) get({ action: 'shop', code: 'GUESS-' + i, dev: 'guesser' });
ok(get({ action: 'shop', code: code, dev: 'guesser' }).error === 'dir_locked', 'C4 10 wrong codes from one phone: it waits 15 minutes, even for a right code');
ok(get({ action: 'shop', code: code, dev: 'p2' }).ok, 'C5 …other phones aren\'t held up');
R(`(function(){ const x = shopGet_('${code}'); x.status = 'paused'; shopSave_(x); })()`);
ok(get({ action: 'shop', code: code, dev: 'p3' }).status === 'paused', 'C6 a paused shop still opens (read-only), so its phones can see their data');
const hk = R(`shopGet_('${code}').healthKey`);
ok(get({ action: 'shopStatus', code, key: 'wrong' }).error === 'bad_key' && get({ action: 'shopStatus', code, key: '' }).error === 'bad_key' && get({ action: 'shopStatus', code, key: hk }).status === 'paused', 'C7 a shop asking "am I paused?" needs its own key');
// ---------- D. admin actions with odd input ----------
const lst = post({ action: 'list', tok: T });
ok(lst.ok && !JSON.stringify(lst).includes(hk) && lst.shops.every(s => !('healthKey' in s)), 'D1 the shop list sent to the dashboard never carries a shop\'s secret key');
ok(post({ action: 'setStatus', tok: T, code, status: 'deleted' }).error === 'bad_status' && post({ action: 'setStatus', tok: T, code, status: '__proto__' }).error === 'bad_status', 'D2 a made-up status: refused');
ok(post({ action: 'deleteShop', tok: T, code: 'main', confirm: 'main' }).ok === false, 'D3 the original shop can\'t be deleted from the dashboard');
ok(post({ action: 'deleteShop', tok: T, code, confirm: 'WRONG' }).error === 'confirm_code' && !!shopGet(code), 'D4 delete without typing the shop\'s code: refused, nothing deleted');
ok(post({ action: 'startPin', tok: T, code: 'main' }).ok === false, 'D5 "starting PIN" for the original shop: refused (it has none)');
const sn = post({ action: 'setNotes', tok: T, code, notes: '=IMPORTXML("http://evil","//a")', plan: '<b>x</b>' });
const row2 = g.SpreadsheetApp.openById(g.props.DIR_SHEET_ID).getSheetByName('Shops').rows.find(r => r[0] === code);
ok(sn.ok && /^'/.test(row2[14]), 'D6 notes typed as a formula are stored as plain text');
