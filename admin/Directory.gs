/*
 * Rate Book Directory: the admin side of running several shops from one app.
 *
 * - Turns a shop code into that shop's backend link (public, one exact code at a time, wrong codes rate-limited).
 * - Admin dashboard (admin.html): create a shop in one click, see every shop live (health), pause / resume, update scripts.
 *
 * Each shop has its own Google Sheet, Drive folder and Apps Script project (a copy of Code.gs plus a generated Shop.gs that tells
 * it its sheet and folders). Shops never share data: the Directory only knows the links.
 *
 * One-time setup (see CLAUDE.md, "More shops + admin"):
 *   1. New Apps Script project "Rate Book Directory": paste this file, and appsscript.json from admin/ (View → Show manifest).
 *   2. Link it to a standard Google Cloud project with the Apps Script API turned on; turn on the Apps Script API at
 *      script.google.com/home/usersettings.
 *   3. Run setupDirectory once (allow): it makes the Directory sheet and logs your admin PIN (View → Logs).
 *   4. Deploy → New deployment → Web app, Execute as: Me, Who has access: Anyone. Put the link in admin.html, index.html, vendor.html.
 */
const DIR_VERSION = 4;
const REPO_RAW = 'https://raw.githubusercontent.com/itxMayank/ratebook/';   // + <branch>/Code.gs
const SHOP_COLS = ['code', 'name', 'owner', 'phone', 'apiUrl', 'scriptId', 'deploymentId', 'sheetId', 'folderId', 'healthKey', 'status', 'plan', 'paidUntil', 'createdAt', 'notes', 'bizType', 'state', 'gstin', 'version', 'lastUpdate'];
const SC_ = SHOP_COLS.reduce((m, k, i) => (m[k] = i, m), {});
const ADMIN_MAX_FAILS = 6, ADMIN_FAIL_SEC = 900, CODE_MAX_FAILS = 10;
const SCRIPT_API = 'https://script.googleapis.com/v1/projects';
let T0_ = 0;

function out_(o) { if (T0_ && o && typeof o === 'object') o.ms = Date.now() - T0_; return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function P_() { return PropertiesService.getScriptProperties(); }
function str_(v, max) { let s = String(v == null ? '' : v).slice(0, max || 200); if (/^[=+@]/.test(s)) s = "'" + s; return s; }
function rand_(n, abc) { abc = abc || 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; const b = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  for (let i = 0; i < n; i++) s += abc[parseInt(b.substr(i * 2, 2), 16) % abc.length]; return s; }
function hash_(s) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, (P_().getProperty('DIR_SALT') || '') + ':' + s)); }

/* ---------- the Directory sheet ---------- */
function dss_() { const id = P_().getProperty('DIR_SHEET_ID'); if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create('Rate Book Directory'); P_().setProperty('DIR_SHEET_ID', ss.getId()); return ss; }
function shopsSheet_() { const ss = dss_(); let s = ss.getSheetByName('Shops');
  if (!s) { s = ss.getSheets()[0]; s.setName('Shops'); s.getRange(1, 1, 1, SHOP_COLS.length).setValues([SHOP_COLS]).setFontWeight('bold'); s.setFrozenRows(1); }
  else if (String(s.getRange(1, SHOP_COLS.length).getValue()) !== SHOP_COLS[SHOP_COLS.length - 1]) s.getRange(1, 1, 1, SHOP_COLS.length).setValues([SHOP_COLS]);
  return s; }
function shops_() { const s = shopsSheet_(), n = s.getLastRow() - 1; if (n < 1) return [];
  return s.getRange(2, 1, n, SHOP_COLS.length).getValues().map((r, i) => { const o = { _row: i + 2 }; SHOP_COLS.forEach((k, j) => { o[k] = r[j] instanceof Date ? r[j].getTime() : r[j]; }); o.code = String(o.code || ''); return o; }).filter(o => o.code); }
function shopGet_(code) { code = String(code || '').toUpperCase(); return shops_().filter(x => String(x.code).toUpperCase() === code || (code === 'MAIN' && x.code === 'main'))[0] || null; }
function shopSave_(o) { const s = shopsSheet_(), row = SHOP_COLS.map(k => o[k] === undefined || o[k] === null ? '' : (typeof o[k] === 'string' ? str_(o[k], 500) : o[k]));
  if (o._row) s.getRange(o._row, 1, 1, SHOP_COLS.length).setValues([row]); else s.appendRow(row);
  CacheService.getScriptCache().remove('shop:' + String(o.code).toUpperCase()); }

/* ---------- error log: every shop's sheet-script errors and phone errors, kept here for 30 days ----------
 * A shop keeps its errors in memory for 6 hours only; the Directory copies the new ones into its "Errors" tab whenever it checks
 * that shop's health (the dashboard every minute while open, and pullErrors every hour once setupErrorLog has been run). */
const ERR_COLS = ['at', 'shop', 'kind', 'where', 'message', 'who', 'phone', 'detail'];
function errSheet_() { const ss = dss_(); let s = ss.getSheetByName('Errors');
  if (!s) { s = ss.insertSheet('Errors'); s.getRange(1, 1, 1, ERR_COLS.length).setValues([ERR_COLS]).setFontWeight('bold'); s.setFrozenRows(1); }
  return s; }
function errLog_(code, h) {
  if (!h || !h.ok) return; const P = P_(), k = 'ERRSEEN_' + code, seen = Number(P.getProperty(k) || 0); let top = seen; const rows = [];
  (h.errors || []).forEach(e => { const t = Number(e[2]) || 0; if (t > seen) { rows.push([new Date(t), code, 'sheet', str_(e[0], 60), str_(e[1], 300), '', '', '']); top = Math.max(top, t); } });
  (h.cerrors || []).forEach(e => { const t = Number(e.t) || 0; if (t > seen) { rows.push([new Date(t), code, 'phone', str_(e.w, 160), str_(e.m, 300), str_(e.by, 40), str_([e.d, e.ua].filter(Boolean).join(' · '), 120), str_([e.tab ? 'screen: ' + e.tab : '', e.st].filter(Boolean).join(' | '), 600)]); top = Math.max(top, t); } });
  if (!rows.length) return; rows.sort((a, b) => a[0] - b[0]);
  const s = errSheet_(); s.getRange(s.getLastRow() + 1, 1, rows.length, ERR_COLS.length).setValues(rows); P.setProperty(k, String(top));
  const old = s.getLastRow() - 1 - 3000; if (old > 500) s.deleteRows(2, old); }
function errList_(code, days) {
  const s = errSheet_(), n = s.getLastRow() - 1; if (n < 1) return [];
  const from = Date.now() - (Number(days) || 7) * 864e5, out = [];
  s.getRange(2, 1, n, ERR_COLS.length).getValues().forEach(r => { const t = r[0] instanceof Date ? r[0].getTime() : Number(r[0]) || 0;
    if (t >= from && (!code || r[1] === code)) out.push({ t, shop: r[1], kind: r[2], where: r[3], m: r[4], who: r[5], phone: r[6], detail: r[7] }); });
  return out.sort((a, b) => b.t - a.t).slice(0, 300); }
function errCounts_() { const c = {}, day = Date.now() - 864e5; try { errList_('', 1).forEach(e => { if (e.t >= day) c[e.shop] = (c[e.shop] || 0) + 1; }); } catch (e) {} return c; }
/** Hourly (after setupErrorLog): copy every shop's new errors before they expire from the shop's memory. */
function pullErrors() { const lk = LockService.getScriptLock(); if (!lk.tryLock(20000)) return; try { healthAll_(); } finally { lk.releaseLock(); } }
/** Run once in the editor (allow): checks every shop each hour so errors are kept even when the dashboard isn't open. */
function setupErrorLog() {
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'pullErrors')) ScriptApp.newTrigger('pullErrors').timeBased().everyHours(1).create();
  errSheet_(); pullErrors(); Logger.log('Error log: on. Every shop is checked each hour; errors are in the Directory sheet, tab Errors.'); }

/* ---------- public: code → link ---------- */
function doGet(e) {
  T0_ = Date.now(); const p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case 'shop': return out_(lookup_(p.code, p.dev));
      case 'shopStatus': return out_(shopStatus_(p.code, p.key));
      case 'ping': return out_({ ok: true, app: 'ratebook-directory', v: DIR_VERSION });
      default: return out_({ ok: true, app: 'ratebook-directory', v: DIR_VERSION });
    }
  } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
}
/** One exact code → {api, name, status}. Never lists shops. Wrong codes are counted per phone: 10 in 15 minutes = wait. */
function lookup_(code, dev) {
  const c = CacheService.getScriptCache(), d = String(dev || 'nodev').replace(/[^\w-]/g, '').slice(0, 40) || 'nodev', fk = 'cfail_' + d;
  if (Number(c.get(fk) || 0) >= CODE_MAX_FAILS) return { ok: false, error: 'dir_locked' };
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
  const hit = code && c.get('shop:' + code); if (hit) return JSON.parse(hit);
  let x = code ? shopGet_(code) : null;
  /* A shop made but not yet seen answering (setupShop just run, dashboard not refreshed): check it now and turn it live if it
     answers. Not ready yet = say so; it isn't a wrong code, so it doesn't count towards the lockout. */
  if (x && x.code !== 'main' && x.apiUrl && (x.status === 'needs-auth' || x.status === 'setup')) {
    const lk = LockService.getScriptLock();
    if (x.status === 'needs-auth' && x.healthKey && lk.tryLock(10000)) { try { healthAll_(x.code); } finally { lk.releaseLock(); } x = shopGet_(code); }
    if (!x || x.status !== 'live') return { ok: false, error: 'not_ready' }; }
  if (!x || !x.apiUrl || x.code === 'main' || !(x.status === 'live' || x.status === 'paused')) { c.put(fk, String(Number(c.get(fk) || 0) + 1), 900); return { ok: false, error: 'bad_code' }; }
  const r = { ok: true, code: x.code, api: x.apiUrl, name: x.name, status: x.status }; c.put('shop:' + code, JSON.stringify(r), 600); return r; }
/** For a shop's own script (its health key): is it paused? */
function shopStatus_(code, key) { const x = shopGet_(code); if (!x || !key || String(key) !== String(x.healthKey)) return { ok: false, error: 'bad_key' };
  return { ok: true, status: x.status === 'paused' ? 'paused' : 'live' }; }

/* ---------- admin ---------- */
const ADMIN_ACTIONS = { deleteShop: 1, errors: 1, signIn: 1, signOut: 1, list: 1, health: 1, create: 1, setStatus: 1, update: 1, register: 1, setNotes: 1, latest: 1, recheck: 1 };
function doPost(e) {
  T0_ = Date.now(); let b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out_({ ok: false, error: 'bad_json' }); }
  if (!ADMIN_ACTIONS[b.action]) return out_({ ok: false, error: 'bad_action' });
  if (b.action === 'signIn') return out_(adminSignIn_(b));
  if (!adminOk_(b.tok)) return out_({ ok: false, error: 'bad_session' });
  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000);
    switch (b.action) {
      case 'signOut': adminSessEnd_(b.tok); return out_({ ok: true });
      case 'list': { const ec = errCounts_(); return out_({ ok: true, shops: shops_().map(x => Object.assign(pub_(x), { err24: ec[x.code] || 0 })) }); }
      case 'errors': return out_({ ok: true, errors: errList_(b.code ? String(b.code) : '', b.days) });
      case 'health': return out_({ ok: true, health: healthAll_(b.code) });
      case 'latest': return out_({ ok: true, latest: latestVersion_(b.ref) });
      case 'create': return out_(Object.assign({ ok: true }, createShop_(b.shop || {}, b.ref)));
      case 'setStatus': { const x = shopGet_(b.code); if (!x) throw new Error('no_shop'); if (['live', 'paused'].indexOf(b.status) < 0) throw new Error('bad_status');
        x.status = b.status; shopSave_(x); return out_({ ok: true, shop: pub_(x) }); }
      case 'setNotes': { const x = shopGet_(b.code); if (!x) throw new Error('no_shop'); ['notes', 'plan', 'paidUntil', 'owner', 'phone'].forEach(k => { if (b[k] !== undefined) x[k] = b[k]; }); shopSave_(x); return out_({ ok: true, shop: pub_(x) }); }
      case 'register': return out_(Object.assign({ ok: true }, registerMain_(b)));
      case 'recheck': { const h = healthAll_(b.code); return out_({ ok: true, health: h, shops: shops_().map(pub_) }); }
      case 'update': return out_(Object.assign({ ok: true }, updateShop_(b.code, b.ref)));
      case 'deleteShop': return out_(Object.assign({ ok: true }, deleteShop_(b.code, b)));
    }
  } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
  finally { try { lock.releaseLock(); } catch (e2) {} }
}
function pub_(x) { const o = {}; SHOP_COLS.forEach(k => { if (k !== 'healthKey') o[k] = x[k]; }); o.editUrl = x.scriptId ? 'https://script.google.com/d/' + x.scriptId + '/edit' : '';
  o.sheetUrl = x.sheetId ? 'https://docs.google.com/spreadsheets/d/' + x.sheetId + '/edit' : ''; o.folderUrl = x.folderId ? 'https://drive.google.com/drive/folders/' + x.folderId : ''; return o; }

/** Admin PIN (set by setupDirectory) → a token kept by the dashboard. Wrong PINs: 6 per 15 minutes per device, then wait. */
function adminSignIn_(b) {
  const c = CacheService.getScriptCache(), d = String(b.dev || 'nodev').replace(/[^\w-]/g, '').slice(0, 40), fk = 'afail_' + d, g = Number(c.get('afail_all') || 0);
  if (Number(c.get(fk) || 0) >= ADMIN_MAX_FAILS || g >= 30) return { ok: false, error: 'locked' };
  const want = P_().getProperty('ADMIN_PIN_H');
  if (!want || hash_(String(b.pin || '')) !== want) { c.put(fk, String(Number(c.get(fk) || 0) + 1), ADMIN_FAIL_SEC); c.put('afail_all', String(g + 1), 3600); return { ok: false, error: 'bad_pin' }; }
  const t = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); const all = adminSess_(); all[hash_('t:' + t)] = Date.now(); adminSessSave_(all);
  return { ok: true, tok: t }; }
function adminSess_() { try { return JSON.parse(P_().getProperty('ADMIN_SESS') || '{}'); } catch (e) { return {}; } }
function adminSessSave_(all) { const old = Date.now() - 30 * 864e5; Object.keys(all).forEach(k => { if (all[k] < old) delete all[k]; }); P_().setProperty('ADMIN_SESS', JSON.stringify(all)); }
function adminOk_(t) { if (!t) return false; const all = adminSess_(), k = hash_('t:' + t); if (!all[k]) return false;
  if (Date.now() - all[k] > 864e5) { all[k] = Date.now(); adminSessSave_(all); } return true; }
function adminSessEnd_(t) { const all = adminSess_(); delete all[hash_('t:' + t)]; adminSessSave_(all); }

/* ---------- live health (each shop's own report, via its health key) ---------- */
function healthAll_(onlyCode) {
  const list = shops_().filter(x => x.apiUrl && x.healthKey && (!onlyCode || x.code === onlyCode));
  if (!list.length) return {};
  const reqs = list.map(x => ({ url: x.apiUrl + '?action=health&key=' + encodeURIComponent(x.healthKey) + '&_=' + Date.now(), muteHttpExceptions: true, followRedirects: true }));
  let res = []; try { res = UrlFetchApp.fetchAll(reqs); } catch (e) { res = []; }
  const out = {};
  list.forEach((x, i) => { const r = res[i]; let h = null;
    try { const code = r && r.getResponseCode(), txt = r ? r.getContentText() : ''; h = /^\s*\{/.test(txt) ? JSON.parse(txt) : { ok: false, error: code === 200 ? 'needs_auth' : 'http_' + code }; }
    catch (e) { h = { ok: false, error: 'unreachable' }; }
    out[x.code] = h; try { errLog_(x.code, h); } catch (e) {}
    if (h && h.ok) { delete h.errors; delete h.cerrors; }   // the dashboard reads them from the Errors tab
    /* A new shop becomes live as soon as its script answers (after setupShop was run). */
    /* Just after an update, a shop on an older script can still answer health with its old remembered reply (kept 50 s), so a
       lower version within 5 minutes of an update doesn't overwrite the new one. */
    const justUpdated = Number(x.lastUpdate) > Date.now() - 300000, older = h && h.sv && Number(h.sv) < Number(x.version);
    if (h && h.ok && older && justUpdated) h.sv = Number(x.version);
    if (h && h.ok && x.status === 'needs-auth') { x.status = 'live'; x.version = h.sv; shopSave_(x); }
    else if (h && h.ok && h.sv && Number(x.version) !== Number(h.sv)) { x.version = h.sv; shopSave_(x); } });
  return out; }

/* ---------- Apps Script API (needs the one-time Cloud setup) ---------- */
function api_(method, path, body) {
  const r = UrlFetchApp.fetch(SCRIPT_API + path, { method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: body ? JSON.stringify(body) : undefined });
  const code = r.getResponseCode(), txt = r.getContentText(); let j = {}; try { j = JSON.parse(txt || '{}'); } catch (e) {}
  if (code >= 300) { const m = (j.error && j.error.message) || txt.slice(0, 300);
    if (/has not been used|is disabled|not been enabled|SERVICE_DISABLED|User has not enabled the Apps Script API/i.test(m)) throw new Error('script_api_off|' + m);
    throw new Error('script_api|' + code + '|' + m); }
  return j; }
function codeGs_(ref) { const r = UrlFetchApp.fetch(REPO_RAW + (ref || 'main') + '/Code.gs?_=' + Date.now(), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('github|' + r.getResponseCode()); const s = r.getContentText();
  if (s.indexOf('const SCRIPT_VERSION') < 0) throw new Error('github|not Code.gs'); return s; }
function svOf_(src) { const m = String(src).match(/const SCRIPT_VERSION = (\d+)/); return m ? Number(m[1]) : null; }
function latestVersion_(ref) { return { ref: ref || 'main', sv: svOf_(codeGs_(ref)) }; }
function manifest_(old) { let m = {}; try { m = JSON.parse(old || '{}'); } catch (e) {}
  m.timeZone = m.timeZone || 'Asia/Kolkata'; m.runtimeVersion = 'V8'; m.exceptionLogging = m.exceptionLogging || 'STACKDRIVER';
  m.webapp = m.webapp || { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' };   // keeps a shop's link working as a web app
  return JSON.stringify(m, null, 2); }
function shopGs_(boot) { return '/* Made by the Rate Book Directory: this shop\'s own sheet, folders and keys. Don\'t edit; the dashboard rewrites it on updates. */\n' +
  'const SHOP_BOOT = ' + JSON.stringify(boot, null, 2) + ';\n'; }

/* ---------- create a shop (one click) ---------- */
function rootFolder_() { const id = P_().getProperty('ROOT_FOLDER'); if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder('Rate Book Shops'); P_().setProperty('ROOT_FOLDER', f.getId()); return f; }
/** Starting settings for the new sheet: the shop's details plus units copied from the original shop (if registered). */
function seedConfig_(o) {
  let units = null, defUnit = 'kg', defHsn = '';
  const main = shopGet_('main');
  if (main && main.apiUrl) { try { const j = JSON.parse(UrlFetchApp.fetch(main.apiUrl + '?action=list&_=' + Date.now(), { muteHttpExceptions: true }).getContentText());
    if (j && j.config) { units = j.config.units || null; defUnit = j.config.defaultUnit || defUnit; defHsn = j.config.defaultHsn || ''; } } catch (e) {} }
  const rows = [['shopName', o.name], ['defaultUnit', defUnit], ['roundTo', 1], ['defaultGst', 18], ['defaultHsn', defHsn], ['bizType', o.bizType || ''],
    ['shopState', o.state || ''], ['shopGstin', o.gstin || ''], ['shopAddress', o.address || ''], ['nextBill', 1], ['nextGstBill', 1], ['testNextBill', 1], ['testNextGstBill', 1],
    ['fyReset', 'true'], ['mode', 'test'], ['approveNew', 'true'], ['showProfit', 'false'], ['billFooter', '']];
  if (units) rows.splice(1, 0, ['units', JSON.stringify(units)]);
  return rows; }
function createShop_(o, ref) {
  const name = String(o.name || '').trim().slice(0, 60); if (!name) throw new Error('need_name');
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10) || 'SHOP', code = slug + '-' + rand_(10);
  const src = codeGs_(ref);                                   // fail early (before making files) if GitHub can't be read
  // 1. folders
  const shopF = rootFolder_().createFolder(name + ' (' + code + ')'), vd = shopF.createFolder('vendor bills'), vdt = shopF.createFolder('vendor bills (test)'), bk = shopF.createFolder('backups');
  // 2. the sheet, with starting settings (other tabs make themselves with their headers on first use)
  const ss = SpreadsheetApp.create('Rate Book - ' + name), file = DriveApp.getFileById(ss.getId()); file.moveTo(shopF);
  const cfg = ss.getSheets()[0]; cfg.setName('Config'); const seed = seedConfig_({ ...o, name });
  cfg.getRange(1, 1, 1, 2).setValues([['key', 'value']]).setFontWeight('bold'); cfg.setFrozenRows(1); cfg.getRange(2, 1, seed.length, 2).setValues(seed);
  // 3. the shop's own script: Code.gs + Shop.gs, deployed as a web app
  const healthKey = rand_(24, 'abcdefghijkmnpqrstuvwxyz23456789'), initPin = String(100000 + Math.floor(Math.random() * 900000));
  const boot = { code, sheetId: ss.getId(), folderId: shopF.getId(), vdFolder: vd.getId(), vdFolderTest: vdt.getId(), bkFolder: bk.getId(), dirUrl: String(o.dirUrl || P_().getProperty('DIR_URL') || ScriptApp.getService().getUrl() || ''), healthKey, initPin };
  const x = { code, name, owner: str_(o.owner, 60), phone: str_(o.phone, 20), sheetId: ss.getId(), folderId: shopF.getId(), healthKey, status: 'setup', plan: str_(o.plan || '', 30),
    paidUntil: '', createdAt: Date.now(), notes: '', bizType: str_(o.bizType, 20), state: str_(o.state, 4), gstin: str_(o.gstin, 15), version: svOf_(src), lastUpdate: Date.now() };
  shopSave_(x);   // recorded first, so a failure below still shows the shop (and its folder) on the dashboard
  try {
    const proj = api_('post', '', { title: 'Rate Book - ' + name + ' (' + code + ')' });
    x.scriptId = proj.scriptId;
    try { DriveApp.getFileById(proj.scriptId).moveTo(shopF); } catch (e) {}
    api_('put', '/' + proj.scriptId + '/content', { files: [
      { name: 'appsscript', type: 'JSON', source: manifest_('') }, { name: 'Code', type: 'SERVER_JS', source: src }, { name: 'Shop', type: 'SERVER_JS', source: shopGs_(boot) }] });
    const ver = api_('post', '/' + proj.scriptId + '/versions', { description: 'Rate Book ' + svOf_(src) + ' (created)' });
    const dep = api_('post', '/' + proj.scriptId + '/deployments', { versionNumber: ver.versionNumber, manifestFileName: 'appsscript', description: 'Rate Book web app' });
    const web = (dep.entryPoints || []).filter(e => e.entryPointType === 'WEB_APP')[0];
    x.deploymentId = dep.deploymentId; x.apiUrl = web && web.webApp && web.webApp.url || ''; x.status = 'needs-auth';
    const xs = shops_().filter(y => y.code === code)[0]; x._row = xs && xs._row; shopSave_(x);
  } catch (err) { const xs = shops_().filter(y => y.code === code)[0]; x._row = xs && xs._row; x.notes = 'Script not made: ' + String(err.message || err).slice(0, 300); shopSave_(x); throw err; }
  return { shop: pub_(x), initPin, shopLink: '?shop=' + code }; }

/* ---------- register the original shop (made by hand before the Directory) ---------- */
function registerMain_(b) {
  if (!b.apiUrl || !b.scriptId || !b.deploymentId) throw new Error('need_ids');
  const x = shopGet_('main') || { code: 'main', createdAt: Date.now() };
  x.name = str_(b.name || x.name || 'My shop', 60); x.apiUrl = String(b.apiUrl).trim(); x.scriptId = String(b.scriptId).trim(); x.deploymentId = String(b.deploymentId).trim();
  x.healthKey = x.healthKey || rand_(24, 'abcdefghijkmnpqrstuvwxyz23456789'); x.status = 'live'; shopSave_(x);
  return { shop: pub_(x), healthKey: x.healthKey }; }

/* ---------- update a shop's script to the latest Code.gs (the link never changes) ---------- */
/* ---------- delete a shop (never the original one) ----------
 * 1. The shop's script removes its own timed jobs (retire; an older script is updated first so it knows how).
 * 2. Its web app link is switched off (deployment removed).
 * 3. Its files go: the script project, the shop folder (sheet, backups, vendor bills) and its sheet (also a restored copy).
 *    Permanently by default; to the Drive Trash if asked. Only files that are clearly this shop's are touched:
 *    the folder must sit in "Rate Book Shops", the others must be named "Rate Book…", and nothing used by another shop row,
 *    the Directory sheet or the "Rate Book Shops" folder itself is ever touched.
 * 4. Its row, error-log rows and remembered state are removed from the Directory. Creating new shops works as before. */
function retireCall_(x) { try { const r = UrlFetchApp.fetch(x.apiUrl + '?action=retire&key=' + encodeURIComponent(x.healthKey) + '&code=' + encodeURIComponent(x.code) + '&_=' + Date.now(), { muteHttpExceptions: true, followRedirects: true });
  const t = r.getContentText(); return /^\s*\{/.test(t) ? JSON.parse(t) : { ok: false, error: r.getResponseCode() === 200 ? 'needs_auth' : 'http_' + r.getResponseCode() }; } catch (e) { return { ok: false, error: 'unreachable' }; } }
function driveGone_(id, permanent, isFolder) {
  if (permanent) { const r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?supportsAllDrives=true', { method: 'delete', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
    const c = r.getResponseCode(); if (c === 404) return 'gone'; if (c >= 300) throw new Error('drive|' + c + '|' + r.getContentText().slice(0, 200)); return 'deleted'; }
  (isFolder ? DriveApp.getFolderById(id) : DriveApp.getFileById(id)).setTrashed(true); return 'trashed'; }
function deleteShop_(code, b) {
  const x = shopGet_(code); if (!x || x.code === 'main') throw new Error('no_shop');
  if (String(b.confirm || '').trim().toUpperCase() !== String(x.code).toUpperCase()) throw new Error('confirm_code');
  const permanent = b.permanent !== false, out = { steps: [], warn: [] };
  // 1. timed jobs
  if (x.apiUrl && x.healthKey) { let r = retireCall_(x);
    if (!r.ok && r.error === 'bad_action' && x.scriptId && x.deploymentId) { try { updateShop_(x.code); r = retireCall_(x); } catch (e) {} }
    if (r.ok) out.steps.push('Timed jobs removed (' + r.triggers + ')');
    else if (x.status === 'needs-auth' || r.error === 'needs_auth') out.steps.push('No timed jobs (setupShop was never run)');
    else out.warn.push('Couldn\'t reach the shop to remove its timed jobs (' + r.error + ')' + (permanent ? '; they stop when its script is deleted below.' : '; they stop when the Trash is emptied.'));
    if (r.sheetId && r.sheetId !== x.sheetId) x.curSheet = r.sheetId; }
  // 2. web app link
  if (x.scriptId && x.deploymentId) { try { api_('delete', '/' + x.scriptId + '/deployments/' + x.deploymentId); out.steps.push('Shop link switched off'); } catch (e) { out.warn.push('Link not switched off (' + String(e.message).split('|')[0] + ')'); } }
  // 3. files, with safety checks
  const others = {}; shops_().forEach(y => { if (y.code !== x.code) ['scriptId', 'sheetId', 'folderId'].forEach(k => { if (y[k]) others[y[k]] = 1; }); });
  others[P_().getProperty('DIR_SHEET_ID') || '-'] = 1; others[P_().getProperty('ROOT_FOLDER') || '-'] = 1; others[ScriptApp.getScriptId()] = 1;
  const root = P_().getProperty('ROOT_FOLDER');
  const kill = (id, label, isFolder, check) => { if (!id) return; if (others[id]) { out.warn.push(label + ' kept: it is shared with something else'); return; }
    try { if (check && !check()) { out.warn.push(label + ' kept: it doesn\'t look like this shop\'s'); return; }
      const how = driveGone_(id, permanent, isFolder); out.steps.push(label + (how === 'gone' ? ' (already gone)' : how === 'trashed' ? ' moved to Trash' : ' deleted')); }
    catch (e) { if (/not found|No item|does not exist/i.test(String(e.message))) out.steps.push(label + ' (already gone)'); else out.warn.push(label + ': ' + String(e.message).slice(0, 160)); } };
  const named = id => () => /^Rate Book/.test(DriveApp.getFileById(id).getName());
  kill(x.scriptId, 'Shop script', false, named(x.scriptId));
  kill(x.curSheet, 'Restored sheet', false, named(x.curSheet || '-'));
  kill(x.sheetId, 'Sheet', false, named(x.sheetId));
  kill(x.folderId, 'Folder (backups, vendor bills)', true, () => { const it = DriveApp.getFolderById(x.folderId).getParents(); while (it.hasNext()) if (it.next().getId() === root) return true; return false; });
  // 4. the Directory's own records
  try { const es = errSheet_(), n = es.getLastRow() - 1; if (n > 0) { const v = es.getRange(2, 2, n, 1).getValues(); for (let i = n - 1; i >= 0; i--) if (v[i][0] === x.code) es.deleteRow(i + 2); } } catch (e) {}
  shopsSheet_().deleteRow(x._row); P_().deleteProperty('ERRSEEN_' + x.code); CacheService.getScriptCache().remove('shop:' + String(x.code).toUpperCase());
  out.steps.push('Removed from the dashboard');
  return out; }

function updateShop_(code, ref) {
  const x = shopGet_(code); if (!x || !x.scriptId || !x.deploymentId) throw new Error('no_ids');
  const src = codeGs_(ref), sv = svOf_(src);
  const cur = api_('get', '/' + x.scriptId + '/content');
  const files = (cur.files || []).slice();
  const put = (name, type, source) => { const i = files.findIndex(f => f.name === name); const f = { name, type, source }; if (i >= 0) files[i] = f; else files.push(f); };
  const man = files.find(f => f.name === 'appsscript'); put('appsscript', 'JSON', manifest_(man && man.source));
  /* The file holding the app code (named "Code" unless it was renamed): replaced in place, never added twice. */
  const ci = files.findIndex(f => f.type === 'SERVER_JS' && /const SCRIPT_VERSION = /.test(f.source || ''));
  if (ci >= 0) files[ci] = { name: files[ci].name, type: 'SERVER_JS', source: src }; else put('Code', 'SERVER_JS', src);
  if (x.code !== 'main') { const old = files.find(f => f.name === 'Shop'); const boot = bootOf_(old && old.source); if (!boot) throw new Error('no_shop_gs'); put('Shop', 'SERVER_JS', shopGs_(boot)); }
  const before = api_('get', '/' + x.scriptId + '/deployments/' + x.deploymentId);
  const prevVer = before.deploymentConfig && before.deploymentConfig.versionNumber;
  api_('put', '/' + x.scriptId + '/content', { files: files.map(f => ({ name: f.name, type: f.type, source: f.source })) });
  const ver = api_('post', '/' + x.scriptId + '/versions', { description: 'Rate Book ' + sv });
  const cfg = v => ({ deploymentConfig: { versionNumber: v, manifestFileName: 'appsscript', description: 'Rate Book ' + sv } });
  api_('put', '/' + x.scriptId + '/deployments/' + x.deploymentId, cfg(ver.versionNumber));
  /* Check the shop still answers on its link; if not, put the previous version back (the shop keeps running). */
  /* Check the shop answers on its link, and (scripts from v38 on) that it runs the new version; a new version can take a moment to start. */
  let alive = false, runs = null;
  for (let i = 0; i < 4 && !(alive && (runs === null || runs >= sv)); i++) { Utilities.sleep(i ? 2000 : 1500);
    try { const r = UrlFetchApp.fetch(x.apiUrl + '?action=ping&_=' + Date.now(), { muteHttpExceptions: true }), t = r.getContentText(); alive = /"ok":true/.test(t);
      const m = t.match(/"sv":(\d+)/); runs = m ? Number(m[1]) : null; } catch (e) {} }
  if (!alive && prevVer) { api_('put', '/' + x.scriptId + '/deployments/' + x.deploymentId, cfg(prevVer)); throw new Error('rolled_back|The shop did not answer after the update, so its previous version was put back. If the script needs new permissions, open it and run setupShop (or any function) once, then update again.'); }
  x.version = sv; x.lastUpdate = Date.now(); shopSave_(x);
  return { shop: pub_(x), sv: sv, versionNumber: ver.versionNumber }; }
function bootOf_(src) { const m = String(src || '').match(/const SHOP_BOOT = (\{[\s\S]*?\});/); if (!m) return null; try { return JSON.parse(m[1]); } catch (e) { return null; } }

/* ---------- forgot the admin PIN (Run in the editor) ----------
 * The PIN is kept only as a salted hash, so it can't be shown again. This makes a new one and changes nothing else:
 * shops, the Directory sheet, links and the error log stay. Every dashboard is signed out (sign in again with the new PIN),
 * and the "too many wrong PINs" wait is cleared. Only someone who can open this script in Google can do this. */
function newAdminPin() {
  const P = P_(); if (!P.getProperty('DIR_SALT')) P.setProperty('DIR_SALT', Utilities.getUuid());
  const pin = String(10000000 + Math.floor(Math.random() * 90000000)); P.setProperty('ADMIN_PIN_H', hash_(pin)); P.deleteProperty('ADMIN_SESS');
  try { CacheService.getScriptCache().remove('afail_all'); } catch (e) {}
  Logger.log('NEW ADMIN PIN: ' + pin + '   (write it down; every dashboard was signed out, sign in again with this PIN)');
  return pin; }

/* ---------- one-time setup (Run in the editor) ---------- */
function setupDirectory() {
  const P = P_(); if (!P.getProperty('DIR_SALT')) P.setProperty('DIR_SALT', Utilities.getUuid());
  shopsSheet_(); rootFolder_();
  const pin = String(10000000 + Math.floor(Math.random() * 90000000)); P.setProperty('ADMIN_PIN_H', hash_(pin)); P.deleteProperty('ADMIN_SESS');
  let api = 'OK'; try { api_('get', '/' + ScriptApp.getScriptId()); } catch (e) { api = 'NOT READY: ' + e.message; }
  Logger.log('Directory sheet: ' + dss_().getUrl());
  Logger.log('ADMIN PIN (write it down; running setupDirectory again makes a new one): ' + pin);
  Logger.log('Apps Script API: ' + api);
}
