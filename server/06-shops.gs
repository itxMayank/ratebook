/* ---------- shops made from the admin Directory: pause, new-phone approval, health, one-time setup ---------- */
/** Paused shops (subscription) stay readable: these still work, everything that makes or changes bills/prices doesn't. */
const NOLOCK_ = { verify: 1, listSessions: 1, listUsers: 1, getAccess: 1, backupInfo: 1, report: 1, getBill: 1, getBills: 1, vPreviews: 1, vFile: 1, vEx: 1, itemBuys: 1 };
const PAUSE_OK_ = { perfIn: 1, insights: 1, verify: 1, setMyPrefs: 1, setMyPin: 1, signOut: 1, boot: 1, list: 1, thumbs: 1, image: 1, images: 1, listBills: 1, getBill: 1, getBills: 1, findCustomer: 1, listCustomers: 1, listDues: 1,
  recordPayment: 1, report: 1, listUsers: 1, listSessions: 1, endSession: 1, approveSession: 1, backupInfo: 1, backupNow: 1,
  vList: 1, vSync: 1, vGet: 1, vPreviews: 1, vFile: 1, vEx: 1, itemBuys: 1, priceHist: 1, getAccess: 1, notices: 1, noticeRead: 1 };
/** Asks the Directory at most once an hour. If the Directory can't be reached, the shop keeps working (never blocks business). */
function shopPaused_() { const b = boot_(); if (!b || !b.dirUrl) return false;
  const c = CacheService.getScriptCache(); let v = c.get('SHOP_STATUS');
  if (v === null) { v = 'live';
    try { const r = UrlFetchApp.fetch(b.dirUrl + '?action=shopStatus&code=' + encodeURIComponent(b.code) + '&key=' + encodeURIComponent(b.healthKey || ''), { muteHttpExceptions: true, followRedirects: true });
      const j = JSON.parse(r.getContentText()); if (j && j.ok && j.status === 'paused') v = 'paused'; } catch (e) {}
    c.put('SHOP_STATUS', v, 3600); }
  return v === 'paused'; }
/** "New phones need my approval": on by default for shops made by the Directory, off for the original shop until turned on. */
function approveOn_(cfg) { let v;
  try { v = (cfg || readConfig_()).approveNew; } catch (e) { return !!boot_(); }   // can't read settings: the shop's default
  if (v === true || v === false) return v;
  if (v === '' || v === undefined || v === null) return !!boot_();
  return String(v).toLowerCase() === 'true'; }
/** App start in one request: price list (cached), who's signed in, and every version the phone compares. */
function bootReply_(who, body) {
  ensureEnv_(); dedupeOnce_(); stripFyPrefixOnce_(); ensureTriggers_();
  let L = listCached_(); if (!buyOk_(who)) L = itemsNoBuy_(L);
  L.codeOn = !!viewCode_(); L.sv = SCRIPT_VERSION; L.shop = shopCode_(); L.view = viewCode_();
  L.me = { name: who.name, role: who.role, personal: !who.master, prefs: prefsOf_(who), testOk: who.testOk !== false, buyOk: buyOk_(who) };
  L.bl = brevC_('live'); L.bt = brevC_('test'); L.vl = vrevC_('live'); L.vt = vrevC_('test');
  return L; }
/** For the admin dashboard: needs the shop's health key. Counts and timings only, no customer data. Kept 50 s. */
/** The admin Directory deleting this shop: remove this script's timed jobs first (backups, hand-edit check) so nothing runs
 *  against files that are about to go. Only for Directory-made shops (never the original shop), with this shop's own key and code. */
function retire_(key, code) {
  const b = boot_(); if (!b) return { ok: false, error: 'not_a_shop' };
  const P = PropertiesService.getScriptProperties(), want = P.getProperty('HEALTH_KEY') || b.healthKey || '';
  if (!want || !keyEq_(key, want) || String(code || '') !== String(b.code)) return { ok: false, error: 'bad_key' };
  let n = 0; try { ScriptApp.getProjectTriggers().forEach(t => { ScriptApp.deleteTrigger(t); n++; }); } catch (e) { return { ok: false, error: 'triggers|' + (e && e.message) }; }
  P.setProperty('RETIRED', String(Date.now())); CacheService.getScriptCache().remove('TRIG_OK');
  return { ok: true, triggers: n, sheetId: P.getProperty('SHEET_ID') || b.sheetId || '' }; }

/** Compares two secret keys by their digests, so the time taken doesn't hint at how much of a guess was right. */
function keyEq_(a, b) { const d = x => Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(x || ''))); return !!b && d(a) === d(b); }
function health_(key, full) {
  const P = PropertiesService.getScriptProperties(), b = boot_();
  const want = P.getProperty('HEALTH_KEY') || (b && b.healthKey) || '';
  if (!want || !keyEq_(key, want)) return { ok: false, error: 'bad_key' };
  const c = CacheService.getScriptCache(), HK = 'HEALTH:' + SCRIPT_VERSION + (full ? ':f' : ''), hit = c.get(HK); if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  const now = Date.now(), out = { ok: true, shop: shopCode_(), sv: SCRIPT_VERSION, now: now };
  out.changes = chgLog_().slice(-20);   // (v67) the shared change log: what changed lately, newest last
  out.lastChange = Math.max(Number(getRev_()) || 0, Number(brevC_('live')) || 0, Number(brevC_('test')) || 0, Number(vrevC_('live')) || 0, Number(vrevC_('test')) || 0);
  const ss = ss_(); let cells = 0;   // the sheet's id isn't sent (v45): the dashboard doesn't need it, and an id is a key to a file in the owner's Drive ss.getSheets().forEach(sh => { cells += sh.getMaxRows() * sh.getMaxColumns(); }); out.cells = cells;
  const it = ss.getSheetByName(ITEMS); out.items = it ? Math.max(0, it.getLastRow() - 1) : 0;
  /* Bills today / this month (India time) for real bills and, separately, test bills (new shops start in test mode). Cancelled bills
     don't count. Rebuilt only when that mode's bills change or the day changes. */
  const tz = 'Asia/Kolkata', today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const stats = (tabName, env) => rcRead_('hstats:' + env, () => brevC_(env) + ':' + today, () => {
    const bs = ss.getSheetByName(tabName), r = { ok: true, today: 0, month: 0, todayAmt: 0, monthAmt: 0, all: 0 }; if (!bs || bs.getLastRow() < 2) return r;
    const n = bs.getLastRow() - 1, d = bs.getRange(2, 2, n, 4).getValues(), stc = bs.getLastColumn() > B.status ? bs.getRange(2, B.status + 1, n, 1).getValues() : null;
    d.forEach((x, i) => { if (stc && stc[i][0] === 'Cancelled') return; r.all++; const dt = x[0] instanceof Date ? x[0] : new Date(x[0]); if (isNaN(dt)) return; const k = Utilities.formatDate(dt, tz, 'yyyy-MM-dd');
      if (k === today) { r.today++; r.todayAmt += num_(x[3]); } if (k.slice(0, 7) === today.slice(0, 7)) { r.month++; r.monthAmt += num_(x[3]); } });
    return r; });
  out.bills = stats('Bills', 'live'); out.tbills = stats('Test Bills', 'test');
  try { out.mode = readConfig_().mode === 'live' ? 'live' : 'test'; } catch (e) {}
  const all = sessAll_(); let ses = 0, pend = 0, fresh = 0; Object.keys(all).forEach(k => { if (all[k].p) pend++; else ses++; if ((all[k].c || 0) > now - 864e5) fresh++; });
  out.sessions = ses; out.pending = pend; out.newPhones24h = fresh;
  out.users = users_().filter(u => u.active !== false).length;
  out.wrongPins = Number(c.get('gfails') || 0);
  let perf = []; try { perf = JSON.parse(c.get('PERF') || '[]'); } catch (e) {}
  const by = {}; perf.forEach(p => { (by[p[0]] = by[p[0]] || []).push(p[1]); });
  const q = (a, f) => { const x = a.slice().sort((m, n2) => m - n2); return x[Math.min(x.length - 1, Math.floor(f * x.length))]; };
  out.perf = Object.keys(by).map(k => ({ a: k, n: by[k].length, p50: q(by[k], 0.5), p95: q(by[k], 0.95) })).sort((m, n2) => n2.n - m.n);
  const allMs = perf.map(p => p[1]); out.p50 = allMs.length ? q(allMs, 0.5) : null; out.p95 = allMs.length ? q(allMs, 0.95) : null; out.reqs = perf.length;
  try { out.errors = JSON.parse(c.get('ERRS') || '[]').slice(-30); } catch (e) { out.errors = []; }
  try { out.cerrors = JSON.parse(c.get('CERRS') || '[]'); } catch (e) { out.cerrors = []; }
  try { out.triggers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()); } catch (e) { out.triggers = null; }
  out.paused = shopPaused_(); out.approveNew = approveOn_(); out.noCache = rcOff_();
  if (b && b.initPin) out.startPin = shopPinOff_() ? 'off' : startPinWorks_(b.initPin) ? 'on' : 'changed';   // v62: the dashboard shows the starting PIN only while it still signs in
  out.backupLast = Number(P.getProperty('BK_LAST') || 0) || null;
  if (full) {   // a shop's own page on the dashboard: 14 days of speed, and how big the main tabs are (for "What to fix")
    out.perfDays = perfDays_(); out.rows = {};
    ['Items', 'Bills', 'Test Bills', 'Customers', 'VendorLedger', 'Purchases', 'Images'].forEach(n => { const sh = ss.getSheetByName(n); if (sh) out.rows[n] = Math.max(0, sh.getLastRow() - 1); }); }
  try { c.put(HK, JSON.stringify(out), 50); } catch (e) {}
  return out; }
/**
 * Run ONCE in the Apps Script editor for a shop made by the admin Directory (Run → setupShop → allow). Safe to run again.
 * Points the script at its own sheet and folders, sets the starting shop PIN, timed jobs (backups every 4 h, hand-edit check every
 * 15 min) and makes the first backup. The original shop never needs this (it has no Shop.gs).
 */
function setupShop() {
  const b = boot_(); if (!b) throw new Error('This script has no Shop.gs. Only shops made from the admin Directory use setupShop.');
  const P = PropertiesService.getScriptProperties(), set = (k, v) => { if (v && !P.getProperty(k)) P.setProperty(k, String(v)); };
  set('SHEET_ID', b.sheetId); if (!P.getProperty('PINH')) set('PIN', b.initPin); set('BK_FOLDER', b.bkFolder); set('VD_FOLDER_live', b.vdFolder); set('VD_FOLDER_test', b.vdFolderTest); set('HEALTH_KEY', b.healthKey);
  ['ENV_OK', 'DEDUP_OK', 'FYPFX_OFF'].forEach(k => set(k, '1'));   // a new sheet has nothing old to move or clean
  sheet_(ITEMS, COLS); sheet_(CONFIG, ['key', 'value']); sheet_(IMAGES, ['id', 'data']);
  ['live', 'test'].forEach(en => { ENV_ = en; sheet_(tab_('Bills'), BILL_COLS); }); ENV_ = 'live';
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'autoBackup' || t.getHandlerFunction() === 'watchSheet').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('autoBackup').timeBased().everyHours(4).create();
  ScriptApp.newTrigger('watchSheet').timeBased().everyHours(1).create(); PropertiesService.getScriptProperties().setProperty('WATCH_H', '1');   // (v66) hourly: the edit trigger catches hand edits
  editTrigger_();
  if (b.dirUrl) { try { UrlFetchApp.fetch(b.dirUrl + '?action=ping', { muteHttpExceptions: true }); } catch (e) {} }   // asks for the "connect to an external service" permission now
  DriveApp.getFolderById(b.folderId || b.bkFolder);   // Drive permission now
  const bk = backupNow_('first');
  bump_(); bumpB_(true); vbumpAll_();
  ['TRIG_OK', 'SHEET_ID', 'HEALTH', 'HEALTH:' + SCRIPT_VERSION, 'SHOP_STATUS'].forEach(k => { try { CacheService.getScriptCache().remove(k); } catch (e) {} });
  Logger.log('Shop ' + b.code + ' is ready. First backup: ' + (bk && bk.name) + '. The admin dashboard will show it as live in a minute.');
}

