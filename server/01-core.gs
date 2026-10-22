/**
 * Rate Book: shared price list backend on a Google Sheet.
 *
 * One-time setup (see README):
 *   1. Go to script.google.com → New project (or from a Google Sheet: Extensions → Apps Script).
 *      Paste this whole file. If made at script.google.com, a sheet called "Rate Book prices"
 *      is created in your Google Drive the first time the app connects.
 *   2. Change DEFAULT_PIN below if you like (you can also change it later from the app).
 *   3. Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone → Deploy.
 *      Allow access when Google asks. (The tabs are created automatically on first use.)
 *   4. Copy the Web app URL into app.js (API_URL at the top).
 *
 * Anyone with the app can VIEW prices. Adding or changing anything needs the shop PIN.
 *
 * This file is built: the source is server/*.gs (one file per area, joined in name order by `node tools/stamp.js`).
 * Edit those, never Code.gs; it is what gets pasted into Apps Script and what the Directory installs on every shop.
 */

const DEFAULT_PIN = '1234';
const SCRIPT_VERSION = 69;   // the app compares this and asks the owner to deploy a New version when it's older

const ITEMS = 'Items';
const CONFIG = 'Config';
const IMAGES = 'Images';
/*
 * Test and real data: bills, edit history and customer stats live in separate tabs per mode.
 * Real: Bills, BillHistory, Customers. Test: Test Bills, Test BillHistory, Test Customers. Items, photos and settings are shared.
 * The mode comes with each request (env: 'test' | 'live'), so a bill made in test mode always lands in the test tabs.
 */
let ENV_ = 'live';
function tab_(name) { return ENV_ === 'test' ? 'Test ' + name : name; }
function setEnv_(env) { ENV_ = env === 'test' ? 'test' : env === 'live' ? 'live' : (readConfig_().mode === 'live' ? 'live' : 'test'); }
const BILL_COLS = ['billNo', 'date', 'customer', 'mobile', 'total', 'items', 'by', 'gstBill', 'taxable', 'tax', 'customerGstin', 'igst', 'text', 'lines', 'billId', 'editedAt', 'editedBy', 'edits', 'cost', 'profit', 'payment', 'paid', 'due', 'payments', 'clearedAt', 'fy', 'status', 'cancelledAt', 'cancelledBy', 'cancelReason', 'pos', 'paidBy', 'po', 'custAddr'];

const CUST_COLS = ['mobile', 'name', 'gstin', 'bills', 'total', 'lastDate', 'lastBillNo', 'due', 'address', 'note', 'updatedAt', 'updatedBy', 'contact', 'email'];   // mobile = the 10 digits, or 'c-…' for a customer saved without one (v55)
const CPAD_ = r => { while (r.length < CUST_COLS.length) r.push(''); return r.slice(0, CUST_COLS.length); };   // rows always as wide as the header
const HISTORY_COLS = ['billId', 'billNo', 'changedAt', 'by', 'oldText'];
const COLS = ['id', 'name', 'nameHi', 'unit', 'buy', 'sell', 'thumb', 'imgV', 'updatedAt', 'updatedBy', 'hsn', 'gst', 'altUnit', 'altQty', 'altSell', 'imgs', 'aliases', 'cat'];
const MAX_PHOTOS = 5;   // photos per item; each is its own cell in the Images tab (under 48,000 characters, below Google's 50,000 per cell)
const C = COLS.reduce((m, k, i) => (m[k] = i, m), {});
const MAX_FAILS = 8;           // wrong PIN tries allowed per phone …
const GLOBAL_MAX_FAILS = 60;   // … and for the whole shop per hour (stops guessing by rotating phones)
const FAIL_WINDOW_SEC = 900;   // … per 15 minutes
/* (v66) The phone id is chosen by the phone, so a stranger can change it on every try. Two more limits that can't be dodged that
   way: wrong PINs typed with one person's name (10 an hour, then that name waits an hour: a 4-digit PIN would take months to
   guess, a 6-digit one years), and wrong PINs typed with no name at all, which could match anyone (20 an hour for the shop).
   Phones already signed in are never held up by either. */
const NAME_MAX_FAILS = 10, NONAME_MAX_FAILS = 20;

/* ---------- setup & helpers ---------- */

function setup() {
  const props = PropertiesService.getScriptProperties();
  ss_();
  if (!props.getProperty('PIN') && !props.getProperty('PINH')) props.setProperty('PIN', String(DEFAULT_PIN));
  sheet_(ITEMS, COLS);
  sheet_(CONFIG, ['key', 'value']);
  sheet_(IMAGES, ['id', 'data']);
  sheet_(tab_('Bills'), BILL_COLS);
  bump_();
  Logger.log('Rate Book is ready. Now deploy it as a web app.');
}

function ss_() {
  const cache = CacheService.getScriptCache();
  let id = cache.get('SHEET_ID');
  if (!id) {
    const props = PropertiesService.getScriptProperties();
    id = props.getProperty('SHEET_ID');
    if (!id && boot_() && boot_().sheetId) { id = String(boot_().sheetId); props.setProperty('SHEET_ID', id); }   // a shop made by the admin Directory
    if (!id) {
      let ss = null;
      try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (err) {}
      if (!ss) ss = SpreadsheetApp.create('Rate Book prices');   // script made at script.google.com: make its own sheet
      id = ss.getId();
      props.setProperty('SHEET_ID', id);
    }
    cache.put('SHEET_ID', id, 21600);
  }
  return SpreadsheetApp.openById(id);
}

const HEADERS_OK_ = {};
function sheet_(name, headers) {
  const ss = ss_();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    s.setFrozenRows(1);
  } else if (!HEADERS_OK_[name]) {
    HEADERS_OK_[name] = true;
    const have = s.getRange(1, 1, 1, headers.length).getValues()[0];
    if (String(have[headers.length - 1]) !== headers[headers.length - 1]) {
      s.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');   // columns added in an update
    }
  }
  return s;
}

function out_(obj) {
  if (T0_ && obj && typeof obj === 'object' && !Array.isArray(obj)) { obj.ms = Date.now() - T0_; perfNote_(obj); }
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- this shop's built-in settings ----------
   A shop made from the admin Directory gets a generated Shop.gs with
   SHOP_BOOT = {code, sheetId, folderId, vdFolder, vdFolderTest, bkFolder, dirUrl, healthKey, initPin}.
   The original shop has no Shop.gs: boot_() is null and everything falls back to how it always worked. */
function boot_() { try { return (typeof SHOP_BOOT !== 'undefined' && SHOP_BOOT) ? SHOP_BOOT : null; } catch (e) { return null; } }
function shopCode_() { const b = boot_(); return b && b.code ? String(b.code) : 'main'; }

/* ---------- request timings and errors (for the admin dashboard's health view) ---------- */
let T0_ = 0, ACT_ = '';
const PERF_SKIP_ = { rev: 1, health: 1, ping: 1, shopStatus: 1, clientErr: 1, perfIn: 1 };
const ERR_QUIET_ = { bad_pin: 1, shop_pin_off: 1, needs_manager: 1, pin_short: 1, pin_easy: 1, bad_session: 1, pending: 1, need_code: 1, need_signin: 1, locked: 1, not_allowed: 1, no_test: 1, paused: 1, wrong_shop: 1, bill_changed: 1, ai_off: 1 };
let RC_HIT_ = false;   // this request's reply came from the reply cache (rcRead_)
function perfNote_(obj) {
  if (!ACT_) return;
  try { const c = CacheService.getScriptCache(), now = Date.now();
    /* "Cold": the first request after 10+ quiet minutes, when Google has to start the script again (slower). Every request
       counts as activity (the phones' 25-second check too), but only real actions are timed. */
    const last = Number(c.get('lastReq') || 0), cold = last && now - last > 600000 ? 1 : 0; if (now - last > 30000) c.put('lastReq', String(now), 21600);
    if (PERF_SKIP_[ACT_]) return;
    let a = []; try { a = JSON.parse(c.get('PERF') || '[]'); } catch (e) {}
    a.push([ACT_, obj.ms, now, obj.ok === false ? 0 : 1]); if (a.length > 200) a = a.slice(-200); c.put('PERF', JSON.stringify(a), 21600);
    let q = []; try { q = JSON.parse(c.get('PERFQ') || '[]'); } catch (e) {}
    q.push([ACT_, obj.ms, now, obj.ok === false ? 0 : 1, RC_HIT_ ? 1 : 0, cold]); if (q.length > 400) q = q.slice(-400); c.put('PERFQ', JSON.stringify(q), 21600);
    if (q.length >= 40 || now - q[0][2] > 600000) perfRoll_();
    if (obj.ok === false && !ERR_QUIET_[String(obj.error || '').split('|')[0]]) {
      let e = []; try { e = JSON.parse(c.get('ERRS') || '[]'); } catch (x) {}
      e.push([ACT_, String(obj.error || '').slice(0, 200), now]); if (e.length > 50) e = e.slice(-50); c.put('ERRS', JSON.stringify(e), 21600); }
  } catch (e) {}
}

/* ---------- speed history (admin dashboard → a shop's Speed section) ----------
   One script property per India day, PERFD_yyyy-MM-dd (kept 14 days), small enough for the 9 KB limit:
   a: script side, per action  [n, failed, from cache, cold, cold ms total, warm ms total, ...8 time buckets]
   p: the phones' side, per action  [n, script ms total, whole-wait ms total, ...8 buckets of the whole wait, ...8 buckets of the wait outside the script]
   l: per phone type  [n, whole-wait ms total]
   Timings are counted into buckets (≤0.3 s, 0.6, 1, 1.5, 2.5, 4, 7, more) so typical and slow times can be read back without
   keeping every request. Script timings are first queued in the short-term cache and moved here in batches (perfRoll_). */
const PB_ = [300, 600, 1000, 1500, 2500, 4000, 7000];
function pb_(ms) { ms = Number(ms) || 0; for (let i = 0; i < PB_.length; i++) if (ms <= PB_[i]) return i; return PB_.length; }
function perfDay_(t) { return Utilities.formatDate(new Date(t), 'Asia/Kolkata', 'yyyy-MM-dd'); }
function perfGet_(P, d) { try { const o = JSON.parse(P.getProperty('PERFD_' + d) || '{}'); return { a: o.a || {}, p: o.p || {}, l: o.l || {} }; } catch (e) { return { a: {}, p: {}, l: {} }; } }
function perfPut_(P, d, o) { let s = JSON.stringify(o);
  if (s.length > 8500) { const keep = k => Object.keys(o[k]).sort((x, y) => o[k][y][0] - o[k][x][0]).slice(0, 12); ['a', 'p', 'l'].forEach(k => { const ks = keep(k), n = {}; ks.forEach(x => n[x] = o[k][x]); o[k] = n; }); s = JSON.stringify(o); }
  P.setProperty('PERFD_' + d, s);
  if (P.getProperty('PERFD_LAST') !== d) { P.setProperty('PERFD_LAST', d); const cut = perfDay_(Date.now() - 14 * 864e5);
    P.getKeys().forEach(k => { if (k.indexOf('PERFD_2') === 0 && k.slice(6) < cut) P.deleteProperty(k); }); } }
/** Move queued script timings into the day summaries. Needs the script lock (doPost may already hold it); skips if busy. */
function perfRoll_() {
  const l = LOCKED_ ? null : LockService.getScriptLock(); if (l && !l.tryLock(100)) return;
  try { const c = CacheService.getScriptCache(); let q = []; try { q = JSON.parse(c.get('PERFQ') || '[]'); } catch (e) {} if (!q.length) return;
    c.remove('PERFQ'); const P = PropertiesService.getScriptProperties(), days = {};
    q.forEach(r => { const d = perfDay_(r[2]), o = days[d] || (days[d] = perfGet_(P, d)), k = String(r[0]).slice(0, 30), x = o.a[k] || (o.a[k] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), ms = Math.max(0, Math.round(r[1]) || 0);
      x[0]++; if (!r[3]) x[1]++; if (r[4]) x[2]++; if (r[5]) { x[3]++; x[4] += ms; } else x[5] += ms; x[6 + pb_(ms)]++; });
    Object.keys(days).forEach(d => perfPut_(P, d, days[d])); }
  catch (e) {} finally { if (l) try { l.releaseLock(); } catch (e) {} } }
/** A phone's own timings since it last sent them: [action, whole wait ms, script ms or null, time]. */
function perfIn_(b) {
  const rows = Array.isArray(b.rows) ? b.rows.slice(-150) : [], P = PropertiesService.getScriptProperties(), days = {}, now = Date.now(), lab = String(b.dl || '?').replace(/[^\w ·.-]/g, '').slice(0, 40) || '?';
  rows.forEach(r => { if (!Array.isArray(r)) return; const t = Number(r[3]) || 0, tot = Number(r[1]); if (!(t > now - 15 * 864e5 && t < now + 6e5) || !(tot >= 0 && tot < 6e5)) return;
    const k = String(r[0] || '').replace(/[^\w]/g, '').slice(0, 30); if (!k) return; const d = perfDay_(t), o = days[d] || (days[d] = perfGet_(P, d)), srv = r[2] == null ? null : Math.max(0, Number(r[2]) || 0);
    const x = o.p[k] || (o.p[k] = [0, 0, 0].concat(new Array(16).fill(0))); x[0]++; x[1] += srv == null ? tot : Math.min(srv, tot); x[2] += Math.round(tot); x[3 + pb_(tot)]++; x[11 + pb_(srv == null ? 0 : Math.max(0, tot - srv))]++;
    const y = o.l[lab] || (o.l[lab] = [0, 0]); y[0]++; y[1] += Math.round(tot); });
  Object.keys(days).forEach(d => perfPut_(P, d, days[d]));
  return { n: rows.length }; }
/** The last 14 days of speed summaries (today includes what's still queued). */
function perfDays_() {
  perfRoll_(); const P = PropertiesService.getScriptProperties(), out = [];
  for (let i = 13; i >= 0; i--) { const d = perfDay_(Date.now() - i * 864e5), o = perfGet_(P, d); if (Object.keys(o.a).length || Object.keys(o.p).length) out.push(Object.assign({ d: d }, o)); }
  return out; }

/** Errors on the phones (the app reports its own script errors). Kept in CacheService only (6 h; the Directory copies them into
 *  its Errors tab whenever it checks health, so they're kept longer there). Never touches the sheet. At most 20 per phone per hour.
 *  The name is what the phone says; it's for finding the phone, not proof of who it was. */
function clientErr_(b) {
  try { const c = CacheService.getScriptCache(), d = String(b.dev || 'nodev').replace(/[^\w-]/g, '').slice(0, 40) || 'nodev', rk = 'cerr_' + d, n = Number(c.get(rk) || 0);
    if (n >= 20) return { ok: true, skipped: true }; c.put(rk, String(n + 1), 3600);
    const ga = Number(c.get('cerr_all') || 0); if (ga >= 60) return { ok: true, skipped: true }; c.put('cerr_all', String(ga + 1), 3600);   // (v46) at most 60 an hour in all: the phone id is the phone's own choice
    let by = ''; if (b.tok) { const w = sessWho_(String(b.tok)); if (w && !w.error) by = w.name; } if (!by) by = '? ' + String(b.by == null ? '' : b.by);   // a name is trusted only from a sign-in; anything else is marked "?" 
    const s = (v, m) => String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').slice(0, m), e = b.e || {};
    let a = []; try { a = JSON.parse(c.get('CERRS') || '[]'); } catch (x) {}
    a.push({ t: Date.now(), m: s(e.m, 300), w: s(e.w, 160), st: s(e.st, 500), by: s(by, 40), d: d.slice(0, 6), ua: s(e.ua, 90), tab: s(e.tab, 30) });
    if (a.length > 40) a = a.slice(-40); c.put('CERRS', JSON.stringify(a), 21600);
  } catch (x) {}
  return { ok: true }; }

/* ---------- reply cache: answers read-mostly requests from memory instead of re-reading the sheet ----------
   Safe for money data because every key includes the version that changes on each write (rev / brev_<mode> / vrev_<mode>),
   versions are bumped AFTER the data is written, and a reply is stored only if its version didn't change while it was built.
   Big replies are split into pieces with a checksum; anything missing or broken = read the sheet again.
   Script property NO_CACHE=1 turns this off at once (no deploy needed). */
const RC_PIECE_ = 30000;   // characters per piece (CacheService allows 100 KB per value; Hindi text is up to 3 bytes a character)
function rcOff_() { const c = CacheService.getScriptCache(); let v = c.get('NO_CACHE_F');
  if (v === null) { v = PropertiesService.getScriptProperties().getProperty('NO_CACHE') === '1' ? '1' : '0'; c.put('NO_CACHE_F', v, 300); }
  return v === '1'; }
function rcSum_(s) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8)); }
function rcGet_(key) {
  if (rcOff_()) return null;
  try { const c = CacheService.getScriptCache(), head = c.get('rc:' + key); if (!head) return null;
    const h = JSON.parse(head), keys = []; for (let i = 0; i < h.n; i++) keys.push('rc:' + key + ':' + i);
    const got = c.getAll(keys); let s = ''; for (let i = 0; i < h.n; i++) { const part = got[keys[i]]; if (part === undefined || part === null) return null; s += part; }
    if (s.length !== h.len || rcSum_(s) !== h.sum) return null;
    return JSON.parse(s); } catch (e) { return null; } }
function rcPut_(key, obj) {
  if (rcOff_()) return;
  try { const s = JSON.stringify(obj), c = CacheService.getScriptCache(), parts = {}; let n = 0;
    for (let i = 0; i < s.length; i += RC_PIECE_) parts['rc:' + key + ':' + (n++)] = s.slice(i, i + RC_PIECE_);
    if (n > 60) return;   // over ~1.8 MB: don't cache
    c.putAll(parts, 21600); c.put('rc:' + key, JSON.stringify({ n: n, len: s.length, sum: rcSum_(s) }), 21600); } catch (e) {} }
/** Cached reply for `name` at version `ver()`: read the version first, build, store only if the version is unchanged. */
function rcRead_(name, ver, build) {
  const v1 = ver(), key = name + ':' + SCRIPT_VERSION + ':' + v1;
  const hit = rcGet_(key); if (hit) { RC_HIT_ = true; return hit; }
  const out = build();
  try { if (out && out.ok !== false && ver() === v1) rcPut_(key, out); } catch (e) {}
  return out; }

/* (v67) The short-term cache is only ever a faster copy: script properties and the Config tab hold the real values. Google
   can empty the cache at any time, and a put can fail; a failed put now removes the old cached value, so the next read falls
   back to the real one instead of serving a value that's out of date for up to 6 hours. */
function cPut_(k, v, secs) { const c = CacheService.getScriptCache(); try { c.put(k, String(v), secs || 21600); } catch (e) { try { c.remove(k); } catch (e2) {} } }
/** Hand edits and restores: drop the cached copies of Config values (the next request reads the Config tab). */
function cfgCacheDrop_() { try { const c = CacheService.getScriptCache(); ['NB', 'BUYV'].forEach(k => c.remove(k)); } catch (e) {} }
/* The change counter is read on every phone's 25-second check, so keep it in the short-term cache (saves daily quota). */
function getRev_() {
  const cache = CacheService.getScriptCache();
  let v = cache.get('rev');
  if (!v) { v = PropertiesService.getScriptProperties().getProperty('rev') || '0'; cPut_('rev', v); }
  return v;
}
/* Bills version per mode: changes whenever any bill changes, so phones only download their copy of bills when needed. */
function brev_() { return PropertiesService.getScriptProperties().getProperty('brev_' + ENV_) || '0'; }
/* With each change, a short log notes which bill changed (by id), so a phone can fetch just those bills. Anything else (sheet edited
   by hand, restore, a payment spread over several bills) is logged as "full" and that phone downloads its whole copy again. */
function blog_(env) { try { const a = JSON.parse(PropertiesService.getScriptProperties().getProperty('blog_' + env) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
/* ---------- one change log (v67) ----------
   Every change phones must learn about goes through chg_: the price list and settings ('rev'), bills per mode ('brev_<mode>'),
   vendors ('vrev_<mode>') and notices ('nrev_<mode>'). It writes the new version (script property, then the cache copy) and one
   line in the shared change log CHG (last 60: {v, k}), which the dashboard's health reply carries, so there is one place that
   shows what changed and when. A version is always higher than the one before, also for two changes in the same millisecond
   (before, those got the same number and a phone could miss the second). bump_, bumpB_, vbump_, vbumpAll_ and nbump_ are the
   names the rest of the script uses; they only call chg_. */
function chg_(keys, at) {
  const p = PropertiesService.getScriptProperties();
  let v = Math.max(Number(at) || Date.now(), 0); keys.forEach(k => { v = Math.max(v, (Number(p.getProperty(k)) || 0) + 1); });
  const vs = String(v); keys.forEach(k => { p.setProperty(k, vs); cPut_(k, vs); });
  try { let L = []; try { L = JSON.parse(p.getProperty('CHG') || '[]'); } catch (e) {} if (!Array.isArray(L)) L = [];
    L.push({ v: v, k: keys.join(',') }); p.setProperty('CHG', JSON.stringify(L.slice(-60))); } catch (e) { p.deleteProperty('CHG'); }
  return vs;
}
function chgLog_() { try { const a = JSON.parse(PropertiesService.getScriptProperties().getProperty('CHG') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function bumpB_(both, id) {
  const p = PropertiesService.getScriptProperties(), envs = both ? ['live', 'test'] : [ENV_], v = chg_(envs.map(en => 'brev_' + en));
  envs.forEach(en => {
    let L = blog_(en); L.push(id ? { v: v, id: String(id) } : { v: v, full: 1 }); if (L.length > 150) L = L.slice(-150);
    try { p.setProperty('blog_' + en, JSON.stringify(L)); } catch (e) { p.deleteProperty('blog_' + en); }
  });
}
/* Bills version for the 25-second check: from the short-term cache, so it costs no Properties quota. */
function brevC_(en) { const c = CacheService.getScriptCache(); let v = c.get('brev_' + en); if (!v) { v = PropertiesService.getScriptProperties().getProperty('brev_' + en) || '0'; cPut_('brev_' + en, v); } return v; }
/** The next bill numbers, for the 25-second check (v60). */
function nbPut_(c) { try { c = c || readConfig_(); cPut_('NB', JSON.stringify({ nextBill: c.nextBill, nextGstBill: c.nextGstBill, testNextBill: c.testNextBill, testNextGstBill: c.testNextGstBill, gstFy: c.gstFy || '', testGstFy: c.testGstFy || '' }), 21600); } catch (err) {} }
function nbGet_() { try { const v = CacheService.getScriptCache().get('NB'); if (v) return JSON.parse(v); } catch (err) {}
  try { readConfig_(); const v = CacheService.getScriptCache().get('NB'); return v ? JSON.parse(v) : null; } catch (err) { return null; } }   // (v67) not cached (emptied by Google, or a hand edit): from the Config tab
function bump_() { return chg_(['rev']); }

/** Someone edited the sheet by hand: tell the apps to refresh. */
function onEdit(e) { try { cfgCacheDrop_(); bump_(); bumpB_(true); vbumpAll_(); } catch (err) { softErr_('onEdit', err); } }

function hsn_(v) { const h = String(v == null ? '' : v).replace(/[^0-9A-Za-z]/g, '').slice(0, 10); return h; }
function gstOut_(v) { return v === '' || v === null || v === undefined ? null : num_(v); }
function num_(v) { const n = Number(String(v).replace(/[₹,\s]/g, '')); return isFinite(n) ? n : 0; }
function str_(v, max) { let s = String(v == null ? '' : v).slice(0, max || 200); if (/^[=+@\-]/.test(s)) s = "'" + s; return s; }   // a cell starting = + @ - would be read by Sheets as a formula

