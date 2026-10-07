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
 *   4. Copy the Web app URL into index.html (API_URL at the top of the script).
 *
 * Anyone with the app can VIEW prices. Adding or changing anything needs the shop PIN.
 */

const DEFAULT_PIN = '1234';
const SCRIPT_VERSION = 24;   // the app compares this and asks the owner to deploy a New version when it's older

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
const BILL_COLS = ['billNo', 'date', 'customer', 'mobile', 'total', 'items', 'by', 'gstBill', 'taxable', 'tax', 'customerGstin', 'igst', 'text', 'lines', 'billId', 'editedAt', 'editedBy', 'edits', 'cost', 'profit', 'payment', 'paid', 'due', 'payments', 'clearedAt', 'fy', 'status', 'cancelledAt', 'cancelledBy', 'cancelReason', 'pos'];

const CUST_COLS = ['mobile', 'name', 'gstin', 'bills', 'total', 'lastDate', 'lastBillNo', 'due'];
const HISTORY_COLS = ['billId', 'billNo', 'changedAt', 'by', 'oldText'];
const COLS = ['id', 'name', 'nameHi', 'unit', 'buy', 'sell', 'thumb', 'imgV', 'updatedAt', 'updatedBy', 'hsn', 'gst', 'altUnit', 'altQty', 'altSell', 'imgs', 'aliases', 'cat'];
const MAX_PHOTOS = 5;   // photos per item; each is its own cell in the Images tab (under 48,000 characters, below Google's 50,000 per cell)
const C = COLS.reduce((m, k, i) => (m[k] = i, m), {});
const MAX_FAILS = 8;           // wrong PIN tries allowed per phone …
const GLOBAL_MAX_FAILS = 60;   // … and for the whole shop per hour (stops guessing by rotating phones)
const FAIL_WINDOW_SEC = 900;   // … per 15 minutes

/* ---------- setup & helpers ---------- */

function setup() {
  const props = PropertiesService.getScriptProperties();
  ss_();
  if (!props.getProperty('PIN')) props.setProperty('PIN', String(DEFAULT_PIN));
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
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* The change counter is read on every phone's 25-second check, so keep it in the short-term cache (saves daily quota). */
function getRev_() {
  const cache = CacheService.getScriptCache();
  let v = cache.get('rev');
  if (!v) { v = PropertiesService.getScriptProperties().getProperty('rev') || '0'; cache.put('rev', v, 21600); }
  return v;
}
/* Bills version per mode: changes whenever any bill changes, so phones only download their copy of bills when needed. */
function brev_() { return PropertiesService.getScriptProperties().getProperty('brev_' + ENV_) || '0'; }
/* With each change, a short log notes which bill changed (by id), so a phone can fetch just those bills. Anything else (sheet edited
   by hand, restore, a payment spread over several bills) is logged as "full" and that phone downloads its whole copy again. */
function blog_(env) { try { const a = JSON.parse(PropertiesService.getScriptProperties().getProperty('blog_' + env) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function bumpB_(both, id) {
  const p = PropertiesService.getScriptProperties(), v = String(Date.now());
  (both ? ['live', 'test'] : [ENV_]).forEach(en => {
    p.setProperty('brev_' + en, v); try { CacheService.getScriptCache().put('brev_' + en, v, 21600); } catch (e) {}
    let L = blog_(en); L.push(id ? { v: v, id: String(id) } : { v: v, full: 1 }); if (L.length > 150) L = L.slice(-150);
    try { p.setProperty('blog_' + en, JSON.stringify(L)); } catch (e) { p.deleteProperty('blog_' + en); }
  });
}
/* Bills version for the 25-second check: from the short-term cache, so it costs no Properties quota. */
function brevC_(en) { const c = CacheService.getScriptCache(); let v = c.get('brev_' + en); if (!v) { v = PropertiesService.getScriptProperties().getProperty('brev_' + en) || '0'; c.put('brev_' + en, v, 21600); } return v; }
function bump_() { const v = String(Date.now()); PropertiesService.getScriptProperties().setProperty('rev', v); CacheService.getScriptCache().put('rev', v, 21600); }

/** Someone edited the sheet by hand: tell the apps to refresh. */
function onEdit(e) { try { bump_(); bumpB_(true); } catch (err) {} }

function hsn_(v) { const h = String(v == null ? '' : v).replace(/[^0-9A-Za-z]/g, '').slice(0, 10); return h; }
function gstOut_(v) { return v === '' || v === null || v === undefined ? null : num_(v); }
function num_(v) { const n = Number(String(v).replace(/[₹,\s]/g, '')); return isFinite(n) ? n : 0; }
function str_(v, max) { let s = String(v == null ? '' : v).slice(0, max || 200); if (/^[=+@]/.test(s)) s = "'" + s; return s; }

/* ---------- reads ---------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case 'rev': return out_({ ok: true, rev: getRev_(), bl: brevC_('live'), bt: brevC_('test') });
      case 'list': { ensureEnv_(); dedupeOnce_(); stripFyPrefixOnce_(); ensureTriggers_(); const L = list_(); if (!codeOk_(p.k)) { L.items.forEach(it => { it.buy = null; }); L.limited = true; } L.codeOn = !!viewCode_(); L.sv = SCRIPT_VERSION; return out_(L); }
      case 'thumbs': return out_(thumbs_(String(p.ids || '').split(',').filter(String)));
      case 'vpub': return out_(vPub_(p.t));
      case 'vpubprev': return out_(vPubPrev_(p.t));
      case 'vpubfile': return out_(vPubFile_(p.t, p.f));
      case 'image': return out_(image_(String(p.id || '')));
      case 'images': return out_(images_(String(p.id || '')));
      default: return out_({ ok: true, app: 'ratebook', rev: getRev_() });
    }
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

function rows_() {
  const s = sheet_(ITEMS, COLS);
  const n = s.getLastRow() - 1;
  if (n < 1) return { s, values: [] };
  return { s, values: s.getRange(2, 1, n, COLS.length).getValues() };
}

/** Items without the thumbnail column (photos are fetched separately, only when they changed). */
function list_() {
  const s = sheet_(ITEMS, COLS);
  const n = s.getLastRow() - 1;
  const values = [];
  if (n > 0) {
    const a = s.getRange(2, 1, n, C.thumb).getValues();                                   // id … sell
    const b = s.getRange(2, C.imgV + 1, n, COLS.length - C.imgV).getValues();              // imgV … end
    for (let i = 0; i < n; i++) values.push(a[i].concat([''], b[i]));
  }
  const items = [];
  let fixed = false;
  values.forEach((r, i) => {
    if (!String(r[C.name]).trim()) return;
    if (!r[C.id]) { r[C.id] = Utilities.getUuid().replace(/-/g, '').slice(0, 16); s.getRange(i + 2, C.id + 1).setValue(r[C.id]); fixed = true; }
    items.push({
      id: String(r[C.id]), name: str_(r[C.name]), nameHi: str_(r[C.nameHi]), unit: str_(r[C.unit], 30),
      buy: num_(r[C.buy]), sell: num_(r[C.sell]),
      imgV: num_(r[C.imgV]),
      updatedAt: num_(r[C.updatedAt]), updatedBy: str_(r[C.updatedBy], 60),
      hsn: hsn_(r[C.hsn]), gst: gstOut_(r[C.gst]),
      altUnit: str_(r[C.altUnit], 30), altQty: num_(r[C.altQty]) || 0, altSell: gstOut_(r[C.altSell]),
      imgs: num_(r[C.imgV]) ? (num_(r[C.imgs]) || 1) : 0,
      aliases: str_(r[C.aliases], 300), cat: str_(r[C.cat], 40)
    });
  });
  if (fixed) bump_();
  let pop = {}; try { pop = pop_(); } catch (err) {}
  return { ok: true, rev: getRev_(), items, config: readConfig_(), pop };
}

/**
 * Most-sold order: for each item, the number of real bills it appears on (not the quantity).
 * Always read from the real Bills tab, so test bills never change the order. Cancelled bills don't count.
 * Kept in the cache for 30 minutes, keyed by the number of bill rows, so a new bill refreshes it.
 */
function pop_() {
  const s = ss_().getSheetByName('Bills');   // ss_(): the app's sheet, also when the script isn't attached to it
  if (!s) return {};
  const n = s.getLastRow() - 1; if (n < 1) return {};
  const cache = CacheService.getScriptCache(), key = 'pop:' + n;
  const hit = cache.get(key); if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const width = s.getLastColumn();
  const lines = s.getRange(2, B.lines + 1, n, 1).getValues();
  const status = width > B.status ? s.getRange(2, B.status + 1, n, 1).getValues() : null;
  const pop = {};
  for (let i = 0; i < n; i++) {
    if (status && String(status[i][0]).toLowerCase() === 'cancelled') continue;
    let arr; try { arr = JSON.parse(lines[i][0] || '[]'); } catch (e) { continue; }
    if (!Array.isArray(arr)) continue;
    const seen = {};
    arr.forEach(l => { const id = l && l.id ? String(l.id) : ''; if (id && !seen[id] && id.indexOf('tmp_') !== 0) { seen[id] = 1; pop[id] = (pop[id] || 0) + 1; } });
  }
  try { cache.put(key, JSON.stringify(pop), 1800); } catch (e) {}
  return pop;
}

/** Current buy price per item (by id and by name), for report lines that were saved without one. */
function curBuyMap_() {
  const s = sheet_(ITEMS, COLS), n = s.getLastRow() - 1, out = { byId: {}, byName: {} };
  if (n < 1) return out;
  const a = s.getRange(2, 1, n, C.buy + 1).getValues(), q = s.getRange(2, C.altQty + 1, n, 1).getValues();
  for (let i = 0; i < n; i++) { const v = { buy: num_(a[i][C.buy]), altQty: num_(q[i][0]) };
    if (a[i][C.id]) out.byId[String(a[i][C.id])] = v; const nm = String(a[i][C.name] || '').trim().toLowerCase(); if (nm && !out.byName[nm]) out.byName[nm] = v; }
  return out;
}

/**
 * Once: take the financial-year prefix out of saved GST bill texts ("Invoice No: 26-27/7" -> "Invoice No: 7"), both modes.
 * Only touches GST bills, and only the NN-NN/number pattern where the second year follows the first (a financial year).
 */
function stripFyPrefixOnce_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FYPFX_OFF') === '1') return;
  const keep = ENV_, B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {}); let changed = 0;
  try {
    ['live', 'test'].forEach(env => {
      ENV_ = env;
      const s = ss_().getSheetByName(tab_('Bills')); if (!s) return;
      const n = s.getLastRow() - 1; if (n < 1) return;
      const g = s.getRange(2, B.gstBill + 1, n, 1).getValues(), rg = s.getRange(2, B.text + 1, n, 1), tx = rg.getValues();
      let any = false;
      for (let i = 0; i < n; i++) {
        if (g[i][0] !== 'Yes') continue;
        const t0 = String(tx[i][0] || '');
        const t1 = t0.replace(/\b(\d{2})-(\d{2})\/(\d+)\b/g, (m0, a, b, no) => ((Number(a) + 1) % 100 === Number(b) ? no : m0));
        if (t1 !== t0) { tx[i][0] = t1; any = true; changed++; }
      }
      if (any) rg.setValues(tx);
    });
    props.setProperty('FYPFX_OFF', '1');
    if (changed) bumpB_(true);
  } catch (err) {} finally { ENV_ = keep; }
}

function popReset_() { try { const b = ss_().getSheetByName('Bills'); if (b) CacheService.getScriptCache().remove('pop:' + (b.getLastRow() - 1)); } catch (e) {} }

function thumbs_(ids) {
  const want = {}; ids.slice(0, 60).forEach(id => want[id] = 1);
  const s = sheet_(ITEMS, COLS);
  const n = s.getLastRow() - 1;
  const res = [];
  if (n < 1) return { ok: true, thumbs: res };
  const idc = s.getRange(2, C.id + 1, n, 1).getValues();
  const tv = s.getRange(2, C.thumb + 1, n, 2).getValues();                                  // thumb, imgV
  for (let i = 0; i < n; i++) if (want[idc[i][0]]) res.push({ id: String(idc[i][0]), thumb: String(tv[i][0] || ''), imgV: num_(tv[i][1]) || 1 });
  return { ok: true, thumbs: res };
}

function image_(id) {
  const s = sheet_(IMAGES, ['id', 'data']);
  const n = s.getLastRow() - 1;
  if (n < 1 || !id) return { ok: true, data: '' };
  const vals = s.getRange(2, 1, n, 2).getValues();
  for (const r of vals) if (String(r[0]) === id) return { ok: true, data: String(r[1] || '') };
  return { ok: true, data: '' };
}

/**
 * One time, when this version first runs: every bill made so far was practice, so its tabs become the test tabs
 * (Bills → Test Bills, BillHistory → Test BillHistory, Customers → Test Customers) and the test bill numbers carry on from where they were.
 * Real mode starts empty at bill No. 1. Customer names, mobiles and GSTINs are copied into the real Customers tab (without the counts).
 */
function ensureEnv_() {
  const cache = CacheService.getScriptCache();
  if (cache.get('ENV_OK') === '1') return;
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ENV_OK') === '1') { cache.put('ENV_OK', '1', 21600); return; }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (props.getProperty('ENV_OK') === '1') return;
    const ss = ss_();
    const ren = (from, to) => { const x = ss.getSheetByName(from); if (x && !ss.getSheetByName(to)) x.setName(to); return x; };
    ren('Bills', 'Test Bills');
    ren('BillHistory', 'Test BillHistory');
    const oldCust = ren('Customers', 'Test Customers');
    if (oldCust && !ss.getSheetByName('Customers')) {
      const live = ss.insertSheet('Customers');
      live.getRange(1, 1, 1, CUST_COLS.length).setValues([CUST_COLS]).setFontWeight('bold'); live.setFrozenRows(1);
      const n = oldCust.getLastRow() - 1;
      if (n > 0) {
        const rows = oldCust.getRange(2, 1, n, 3).getValues().filter(r => String(r[0]).replace(/\D/g, '')).map(r => ["'" + String(r[0]).replace(/\D/g, '').slice(-10), r[1], r[2], 0, 0, '', '', 0]);
        if (rows.length) live.getRange(2, 1, rows.length, CUST_COLS.length).setValues(rows);
      }
    }
    const cfg = readConfig_();
    const raw = sheet_(CONFIG, ['key', 'value']);
    const keys = raw.getLastRow() > 1 ? raw.getRange(2, 1, raw.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
    if (keys.indexOf('mode') < 0) setConfig_({ mode: 'test', testNextBill: cfg.nextBill, testNextGstBill: cfg.nextGstBill, nextBill: 1, nextGstBill: 1 });
    props.setProperty('ENV_OK', '1');
    cache.put('ENV_OK', '1', 21600);
    bump_();
  } finally { lock.releaseLock(); }
}

/**
 * One time: remove bills saved twice (same billId — the phone re-sent a bill whose reply got lost), in both modes,
 * keeping the first copy. Only exact repeats are removed; two different bills that share a number are left alone.
 * Afterwards the customer counts, totals and dues are recounted from the remaining bills (names and GSTINs are kept).
 */
function dedupeOnce_() {
  const cache = CacheService.getScriptCache();
  if (cache.get('DEDUP_OK') === '1') return;
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('DEDUP_OK') === '1') { cache.put('DEDUP_OK', '1', 21600); return; }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  const keep = ENV_;
  try {
    if (props.getProperty('DEDUP_OK') === '1') return;
    const report = {};
    ['test', 'live'].forEach(env => {
      ENV_ = env;
      const s = ss_().getSheetByName(tab_('Bills'));
      if (!s) return;
      const n = s.getLastRow() - 1;
      if (n < 1) return;
      const ids = s.getRange(2, BILL_COLS.indexOf('billId') + 1, n, 1).getValues();
      const seen = {}, gone = [];
      ids.forEach((r, i) => { const k = String(r[0] || ''); if (!k) return; if (seen[k]) gone.push(i + 2); else seen[k] = 1; });
      for (let j = gone.length - 1; j >= 0; j--) s.deleteRow(gone[j]);
      if (gone.length) bumpB_(true);
      report[env] = gone.length;
      if (gone.length) recountCustomers_();
    });
    props.setProperty('DEDUP_OK', '1');
    props.setProperty('DEDUP_RESULT', JSON.stringify(report));
    cache.put('DEDUP_OK', '1', 21600);
    if (report.test || report.live) bump_();
  } finally { ENV_ = keep; lock.releaseLock(); }
}

/** Recount every customer's bills, total, last bill and dues from this mode's Bills tab. Names and GSTINs stay as they are. */
function recountCustomers_() {
  const cs = ss_().getSheetByName(tab_('Customers'));
  if (!cs) return;   // built fresh from the bills the next time it's needed
  const bs = sheet_(tab_('Bills'), BILL_COLS);
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const n = bs.getLastRow() - 1;
  const stat = {};
  if (n > 0) bs.getRange(2, 1, n, BILL_COLS.length).getValues().forEach(r => {
    const k = mob10_(r[B.mobile]); if (!k) return;
    if (r[B.status] === 'Cancelled') return;
    const x = stat[k] || (stat[k] = { bills: 0, total: 0, last: '', lastNo: '', due: 0 });
    x.bills++; x.total = r2_(x.total + num_(r[B.total])); x.last = r[B.date]; x.lastNo = r[B.billNo];
    if (r[B.payment] === 'Credit' || r[B.payment] === 'Part paid') x.due = r2_(x.due + num_(r[B.due]));
  });
  const m = cs.getLastRow() - 1;
  if (m < 1) return;
  const rows = cs.getRange(2, 1, m, CUST_COLS.length).getValues().map(r => {
    const x = stat[mob10_(r[0])] || { bills: 0, total: 0, last: '', lastNo: '', due: 0 };
    return [mob10_(r[0]) ? "'" + mob10_(r[0]) : r[0], r[1], r[2], x.bills, x.total, x.last, x.lastNo, x.due];
  });
  cs.getRange(2, 1, m, CUST_COLS.length).setValues(rows);
}

function readConfig_() {
  const s = sheet_(CONFIG, ['key', 'value']);
  const n = s.getLastRow() - 1;
  const cfg = {};
  if (n > 0) s.getRange(2, 1, n, 2).getValues().forEach(r => { if (r[0]) cfg[String(r[0])] = r[1]; });
  if (cfg.units) { try { cfg.units = JSON.parse(cfg.units); } catch (err) { delete cfg.units; } }
  try { cfg.groups = cfg.groups ? JSON.parse(cfg.groups) : []; if (!Array.isArray(cfg.groups)) cfg.groups = []; } catch (err) { cfg.groups = []; }
  cfg.bizType = String(cfg.bizType || '');
  if (cfg.roundTo !== undefined && cfg.roundTo !== '') cfg.roundTo = Number(cfg.roundTo);
  cfg.nextBill = Math.max(1, Math.floor(num_(cfg.nextBill)) || 1);
  cfg.nextGstBill = Math.max(1, Math.floor(num_(cfg.nextGstBill)) || 1);
  cfg.testNextBill = Math.max(1, Math.floor(num_(cfg.testNextBill)) || 1);
  cfg.testNextGstBill = Math.max(1, Math.floor(num_(cfg.testNextGstBill)) || 1);
  cfg.mode = cfg.mode === 'live' ? 'live' : 'test';
  cfg.fyReset = !(cfg.fyReset === false || String(cfg.fyReset).toLowerCase() === 'false');
  cfg.gstFy = String(cfg.gstFy || ''); cfg.testGstFy = String(cfg.testGstFy || '');
  cfg.fyNow = fy_(new Date());
  cfg.shopState = String(cfg.shopState || '');
  cfg.showProfit = cfg.showProfit === true || String(cfg.showProfit).toLowerCase() === 'true';
  cfg.defaultGst = (cfg.defaultGst === undefined || cfg.defaultGst === '') ? 18 : num_(cfg.defaultGst);
  cfg.aiOn = !!PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
  cfg.defaultHsn = (cfg.defaultHsn === undefined || cfg.defaultHsn === '') ? '3923' : hsn_(cfg.defaultHsn);
  return cfg;
}

/* ---------- writes (need PIN) ---------- */

function doPost(e) {
  let body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return out_({ ok: false, error: 'bad_json' }); }
  try { ensureEnv_(); dedupeOnce_(); setEnv_(body.env); } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
  if (body.action === 'takeBill') {      // anyone making a bill can do this (with the shop code if one is set)
    if (!codeOk_(body.k)) { const a0 = body.pin ? auth_(body) : { error: 'x' }; if (a0.error) return out_({ ok: false, error: 'need_code' }); }
    const tb = takeBill_(body); try { if (tb && tb.ok !== false) bumpB_(false, body.bill && body.bill.id); } catch (err) {}
    return out_(tb);
  }
  const who = auth_(body);
  if (who.error) return out_({ ok: false, error: who.error });
  if (!NEEDS[body.action]) return out_({ ok: false, error: 'bad_action' });
  if (ROLE_RANK[who.role] < ROLE_RANK[NEEDS[body.action]]) return out_({ ok: false, error: 'not_allowed' });
  if (body.action === 'vRead' || body.action === 'vCheck') {      // Gemini takes seconds: don't hold the script lock while it reads
    try { const by0 = who.name || str_(body.by, 60);
      if (body.action === 'vRead') return out_({ ok: true, ex: vRead_(body.files) });
      return out_(Object.assign({ ok: true }, vCheck_(str_(body.id, 40), by0))); }
    catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); } }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const by = who.name || str_(body.by, 60);
    let res = {};
    switch (body.action) {
      case 'verify': res = { me: { name: who.name, role: who.role, personal: !who.master }, view: viewCode_() }; break;
      case 'upsert': res = upsert_(body.items || [], by); break;
      case 'delete': res = delete_(body.ids || []); break;
      case 'setImage': res = setImage_(str_(body.id, 40), String(body.thumb || ''), String(body.full || ''), by); break;
      case 'setImages': res = setImages_(str_(body.id, 40), String(body.thumb || ''), body.photos, by); break;
      case 'setConfig': res = setConfig_(body.config || {}); break;
      case 'setGroups': res = setGroups_(body.groups); break;
      case 'setPin': res = setPin_(String(body.newPin || '')); break;
      case 'listBills': res = listBills_(String(body.q || ''), Number(body.limit) || 50, { tz: body.tz, from: String(body.from || ''), to: String(body.to || ''), before: body.before, full: !!body.full, brev: String(body.brev || '') }); break;
      case 'findCustomer': res = findCustomer_(String(body.mobile || '')); break;
      case 'listCustomers': res = listCustomers_(String(body.brev || '')); break;
      case 'getBill': res = getBill_(body.row, str_(body.id, 40), body.n); break;
      case 'updateBill': res = updateBill_(body.bill || {}, by); bumpB_(false, res && res.bill && res.bill.id || (body.bill || {}).id); break;
      case 'listDues': res = listDues_(); break;
      case 'recordPayment': res = recordPayment_(body, by); bumpB_(false, body.billId); break;
      case 'undoPayment': res = undoPayment_(body); bumpB_(false, body.billId); break;
      case 'backupInfo': res = backupInfo_(); break;
      case 'backupNow': res = { backup: backupNow_('manual') , info: backupInfo_() }; break;
      case 'restoreBackup': res = restoreBackup_(String(body.id || ''), by); bumpB_(true); break;
      case 'cancelBill': res = cancelBill_(body, by, true); bumpB_(false, body.id); break;
      case 'restoreBill': res = cancelBill_(body, by, false); bumpB_(false, body.id); break;
      case 'report': res = report_(body); break;
      case 'listUsers': res = listUsers_(); break;
      case 'saveUser': res = saveUser_(body.user || {}); break;
      case 'removeUser': res = removeUser_(String(body.id || '')); break;
      case 'getAccess': res = getAccess_(); break;
      case 'setAccess': res = setAccess_(!!body.on, !!body.regen); break;
      case 'setBackupEmail': res = setBackupEmail_(String(body.email || '')); break;
      case 'vList': res = vList_(); break;
      case 'vSync': res = vSync_(String(body.vrev || '')); break;
      case 'vGet': res = vGet_(str_(body.id, 40)); break;
      case 'vSaveVendor': res = vSaveVendor_(body.vendor || {}, by); break;
      case 'vLink': res = vLink_(str_(body.id, 40), !!body.on, !!body.regen); break;
      case 'vSave': res = vSave_(body.entry || {}, by); break;
      case 'vRemove': res = vRemove_(str_(body.id, 40), body.on !== false, by); break;
      case 'vUseAdvance': res = vUseAdvance_(str_(body.vendorId, 40), str_(body.billId, 60)); break;
      case 'vUpload': res = vUpload_(body); break;
      case 'vPreviews': res = vPreviews_(body.ids); break;
      case 'vFile': res = vFile_(str_(body.f, 80)); break;
      case 'vAck': res = vAck_(str_(body.id, 40), body.on !== false, by); break;
      case 'aiSetKey': res = aiSetKey_(body.key); break;
      default: return out_({ ok: false, error: 'bad_action' });
    }
    if (['verify', 'listBills', 'findCustomer', 'listCustomers', 'getBill', 'listDues', 'backupInfo', 'backupNow', 'setBackupEmail', 'report', 'listUsers', 'saveUser', 'removeUser', 'getAccess', 'setAccess', 'vList', 'vSync', 'vGet', 'vSaveVendor', 'vLink', 'vSave', 'vRemove', 'vUseAdvance', 'vUpload', 'vPreviews', 'vFile', 'vAck', 'aiSetKey'].indexOf(body.action) < 0) bump_();
    return out_(Object.assign({ ok: true, rev: getRev_() }, res));
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

/* ---------- people, roles and PINs ----------
 * The shop PIN (script property PIN) always works and means "owner" (the name is typed on the phone).
 * Personal PINs live in script property USERS as [{id, name, h (salted SHA-256), role, active}]; the name comes from the PIN.
 * Roles: owner (everything), manager (prices, bills, credit, reports), staff (bills and credit only).
 * Wrong PINs lock only that phone (dev id) after MAX_FAILS in 15 min; GLOBAL_MAX_FAILS per hour locks everyone.
 */
const ROLE_RANK = { staff: 1, manager: 2, owner: 3 };
const NEEDS = { verify: 'staff', listBills: 'staff', findCustomer: 'staff', listCustomers: 'staff', getBill: 'staff', updateBill: 'staff', listDues: 'staff', recordPayment: 'staff',
  upsert: 'manager', setGroups: 'manager', delete: 'manager', setImage: 'manager', setImages: 'manager', undoPayment: 'manager', cancelBill: 'manager', restoreBill: 'manager', report: 'manager',
  setConfig: 'owner', setPin: 'owner', backupInfo: 'owner', backupNow: 'owner', restoreBackup: 'owner', setBackupEmail: 'owner',
  vList: 'manager', vSync: 'manager', vGet: 'manager', vSaveVendor: 'manager', vLink: 'manager', vSave: 'manager', vRemove: 'manager', vUseAdvance: 'manager', vUpload: 'manager', vPreviews: 'manager', vFile: 'manager', vRead: 'manager', vCheck: 'manager', vAck: 'manager', aiSetKey: 'owner',
  listUsers: 'owner', saveUser: 'owner', removeUser: 'owner', getAccess: 'owner', setAccess: 'owner' };
function users_() { try { const a = JSON.parse(PropertiesService.getScriptProperties().getProperty('USERS') || '[]'); return Array.isArray(a) ? a : []; } catch (err) { return []; } }
function saveUsers_(list) { PropertiesService.getScriptProperties().setProperty('USERS', JSON.stringify(list)); }
function salt_() { const p = PropertiesService.getScriptProperties(); let v = p.getProperty('SALT'); if (!v) { v = Utilities.getUuid(); p.setProperty('SALT', v); } return v; }
function hashPin_(pin) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt_() + ':' + pin)); }
function auth_(body) {
  const cache = CacheService.getScriptCache();
  const dev = String(body.dev || 'nodev').replace(/[^\w-]/g, '').slice(0, 40) || 'nodev';
  const g = Number(cache.get('gfails') || 0), d = Number(cache.get('fails_' + dev) || 0);
  if (g >= GLOBAL_MAX_FAILS || d >= MAX_FAILS) return { error: 'locked' };
  const pin = String(body.pin || '');
  if (pin) {
    const real = PropertiesService.getScriptProperties().getProperty('PIN') || String(DEFAULT_PIN);
    if (pin === real) return { name: str_(body.by, 60), role: 'owner', master: true };
    const h = hashPin_(pin), u = users_().filter(x => x.active !== false && x.h === h)[0];
    if (u) return { name: u.name, role: ROLE_RANK[u.role] ? u.role : 'staff', id: u.id };
  }
  cache.put('fails_' + dev, String(d + 1), FAIL_WINDOW_SEC);
  cache.put('gfails', String(g + 1), 3600);
  return { error: 'bad_pin' };
}
/** Kept for older callers: 'ok' or an error code. */
function checkPin_(pin) { const a = auth_({ pin: pin }); return a.error || 'ok'; }

function listUsers_() { return { users: users_().map(u => ({ id: u.id, name: u.name, role: u.role, active: u.active !== false })) }; }
function saveUser_(u) {
  const list = users_();
  const name = str_(u.name || '', 40).trim(); if (!name) throw new Error('need_name');
  const role = ROLE_RANK[u.role] ? u.role : 'staff';
  let x = u.id ? list.filter(y => y.id === u.id)[0] : null;
  const pin = String(u.pin || '');
  if (!x && !/^\d{4,8}$/.test(pin)) throw new Error('bad_new_pin');
  if (pin) {
    if (!/^\d{4,8}$/.test(pin)) throw new Error('bad_new_pin');
    const real = PropertiesService.getScriptProperties().getProperty('PIN') || String(DEFAULT_PIN);
    const h = hashPin_(pin);
    if (pin === real || list.some(y => y.h === h && (!x || y.id !== x.id))) throw new Error('pin_taken');
    if (x) x.h = h;
  }
  if (x) { x.name = name; x.role = role; x.active = u.active !== false; }
  else { list.push({ id: Utilities.getUuid().slice(0, 8), name: name, h: hashPin_(pin), role: role, active: true }); }
  saveUsers_(list);
  return listUsers_();
}
function removeUser_(id) { saveUsers_(users_().filter(u => u.id !== id)); return listUsers_(); }

/* ---------- shop code: hides buy rates and blocks bill saving for anyone who only has the link ---------- */
function viewCode_() { return PropertiesService.getScriptProperties().getProperty('VIEW_CODE') || ''; }
function getAccess_() { const c = viewCode_(); return { access: { on: !!c, code: c } }; }
function setAccess_(on, regen) {
  const p = PropertiesService.getScriptProperties();
  if (!on) { p.deleteProperty('VIEW_CODE'); return getAccess_(); }
  if (regen || !viewCode_()) {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = '';
    for (let i = 0; i < 6; i++) c += abc.charAt(Math.floor(Math.random() * abc.length));
    p.setProperty('VIEW_CODE', c);
  }
  return getAccess_();
}
function codeOk_(k) { const c = viewCode_(); return !c || String(k || '').toUpperCase() === c; }

/* ---------- hand edits in the sheet: a 5-minute check tells phones to reload ---------- */
function ensureTriggers_() {
  const cache = CacheService.getScriptCache();
  if (cache.get('TRIG_OK') === '1') return;
  try {
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'watchSheet')) ScriptApp.newTrigger('watchSheet').timeBased().everyMinutes(5).create();
    cache.put('TRIG_OK', '1', 21600);
  } catch (err) { cache.put('TRIG_OK', '1', 3600); }   // needs the one-time setupBackups permission; try again in an hour
}
function watchSheet() {
  const changed = DriveApp.getFileById(ss_().getId()).getLastUpdated().getTime();
  const rev = Number(PropertiesService.getScriptProperties().getProperty('rev') || 0);
  if (changed > rev + 15000) { bump_(); bumpB_(true); }     // edited by hand after the app's last change
}

/* ---------- financial year (April–March, India) ---------- */
function fy_(d) {
  const s = Utilities.formatDate(d || new Date(), BK_TZ, 'yyyy-MM');
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return start + '-' + String(start + 1).slice(2);
}

function upsert_(items, by) {
  const { s, values } = rows_();
  const rowOf = {};
  values.forEach((r, i) => { if (r[C.id]) rowOf[String(r[C.id])] = i; });
  const now = Date.now();
  const saved = [];
  const appended = [];
  const conflicts = [];
  items.slice(0, 300).forEach(it => {
    if (!it || typeof it !== 'object') return;
    const id = it.id && rowOf[it.id] !== undefined ? String(it.id) : null;
    if (id) {
      const r = values[rowOf[id]];
      if (it.base && num_(r[C.updatedAt]) > num_(it.base)) { conflicts.push({ id: id, by: str_(r[C.updatedBy], 60), at: num_(r[C.updatedAt]) }); return; }
      ['name', 'nameHi', 'unit'].forEach(k => { if (it[k] !== undefined) r[C[k]] = str_(it[k], k === 'unit' ? 30 : 200); });
      ['buy', 'sell'].forEach(k => { if (it[k] !== undefined && it[k] !== null) r[C[k]] = num_(it[k]); });
      if (it.hsn !== undefined) { const h = hsn_(it.hsn); r[C.hsn] = h ? "'" + h : ''; }
      if (it.gst !== undefined && it.gst !== null && it.gst !== '') r[C.gst] = num_(it.gst);
      if (it.altUnit !== undefined) r[C.altUnit] = str_(it.altUnit, 30);
      if (it.altQty !== undefined) r[C.altQty] = num_(it.altQty) || '';
      if (it.altSell !== undefined) r[C.altSell] = (it.altSell === null || it.altSell === '') ? '' : num_(it.altSell);
      if (it.aliases !== undefined) r[C.aliases] = str_(it.aliases, 300);
      if (it.cat !== undefined) r[C.cat] = str_(it.cat, 40).trim();
      r[C.updatedAt] = now; r[C.updatedBy] = by;
      s.getRange(rowOf[id] + 2, 1, 1, COLS.length).setValues([r]);
      saved.push(pub_(r, it.tmp));
    } else {
      if (!str_(it.name).trim()) return;
      const r = new Array(COLS.length).fill('');
      r[C.id] = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
      r[C.name] = str_(it.name).trim(); r[C.nameHi] = str_(it.nameHi); r[C.unit] = str_(it.unit, 30);
      r[C.buy] = num_(it.buy); r[C.sell] = num_(it.sell); r[C.imgV] = 0;
      const h = hsn_(it.hsn); r[C.hsn] = h ? "'" + h : '';
      r[C.gst] = (it.gst === undefined || it.gst === null || it.gst === '') ? '' : num_(it.gst);
      r[C.altUnit] = str_(it.altUnit || '', 30); r[C.altQty] = num_(it.altQty) || '';
      r[C.altSell] = (it.altSell === undefined || it.altSell === null || it.altSell === '') ? '' : num_(it.altSell);
      r[C.aliases] = str_(it.aliases || '', 300); r[C.cat] = str_(it.cat || '', 40).trim();
      r[C.updatedAt] = now; r[C.updatedBy] = by;
      appended.push(r); saved.push(pub_(r, it.tmp));
    }
  });
  if (appended.length) s.getRange(s.getLastRow() + 1, 1, appended.length, COLS.length).setValues(appended);
  return { items: saved, conflicts: conflicts };
}

function pub_(r, tmp) {
  return { id: String(r[C.id]), tmp: tmp || null, name: str_(r[C.name]), nameHi: str_(r[C.nameHi]), unit: str_(r[C.unit], 30),
    buy: num_(r[C.buy]), sell: num_(r[C.sell]), imgV: r[C.thumb] ? (num_(r[C.imgV]) || 1) : 0, updatedAt: num_(r[C.updatedAt]), updatedBy: str_(r[C.updatedBy], 60),
    hsn: hsn_(r[C.hsn]), gst: gstOut_(r[C.gst]),
    altUnit: str_(r[C.altUnit], 30), altQty: num_(r[C.altQty]) || 0, altSell: gstOut_(r[C.altSell]),
    imgs: num_(r[C.imgV]) ? (num_(r[C.imgs]) || 1) : 0,
    aliases: str_(r[C.aliases], 300), cat: str_(r[C.cat], 40) };
}

function delete_(ids) {
  const want = {}; ids.forEach(id => want[String(id)] = 1);
  const { s, values } = rows_();
  for (let i = values.length - 1; i >= 0; i--) if (want[values[i][C.id]]) s.deleteRow(i + 2);
  const im = sheet_(IMAGES, ['id', 'data']);
  const n = im.getLastRow() - 1;
  if (n > 0) { const v = im.getRange(2, 1, n, 1).getValues(); for (let i = v.length - 1; i >= 0; i--) if (want[String(v[i][0]).split('#')[0]]) im.deleteRow(i + 2); }
  return { deleted: Object.keys(want).length };
}

/** Older app versions: one photo. Same as setImages_ with a single photo (or none). */
function setImage_(id, thumb, full, by) {
  return setImages_(id, thumb, full ? [{ data: full }] : [], by);
}

/**
 * Save an item's photos (up to MAX_PHOTOS). photos: in order, each {data: 'data:image/jpeg…'} for a new photo or {k: key} to keep an
 * existing one. The first is the cover: its small version (thumb) goes in the Items row. Images rows are keyed id, id#2, id#3 …
 */
function setImages_(id, thumb, photos, by) {
  photos = (Array.isArray(photos) ? photos : []).slice(0, MAX_PHOTOS);
  if (thumb.length > 20000) throw new Error('image_too_large');
  const { s, values } = rows_();
  const i = values.findIndex(r => String(r[C.id]) === id);
  if (i < 0) throw new Error('not_found');
  const im = sheet_(IMAGES, ['id', 'data']);
  const n = im.getLastRow() - 1;
  const old = {}, oldRows = [];
  if (n > 0) im.getRange(2, 1, n, 2).getValues().forEach((r, j) => { const k = String(r[0]); if (k === id || k.indexOf(id + '#') === 0) { old[k] = String(r[1] || ''); oldRows.push(j + 2); } });
  const datas = [];
  photos.forEach(p => {
    const d = p && p.data ? String(p.data) : (p && p.k ? (old[String(p.k)] || '') : '');
    if (!d) return;
    if (d.length > 48000 || !/^data:image\//.test(d)) throw new Error('image_too_large');
    datas.push(d);
  });
  if (datas.length && !thumb) throw new Error('thumb_missing');
  if (!datas.length) thumb = '';
  const rows = datas.map((d, j) => [j ? id + '#' + (j + 1) : id, d]);
  const reuse = Math.min(rows.length, oldRows.length);
  for (let j = 0; j < reuse; j++) im.getRange(oldRows[j], 1, 1, 2).setValues([rows[j]]);
  for (let j = oldRows.length - 1; j >= reuse; j--) im.deleteRow(oldRows[j]);
  if (rows.length > reuse) im.getRange(im.getLastRow() + 1, 1, rows.length - reuse, 2).setValues(rows.slice(reuse));
  const v = datas.length ? Date.now() : 0;
  const r = values[i];
  r[C.thumb] = thumb; r[C.imgV] = v; r[C.imgs] = datas.length || ''; r[C.updatedAt] = Date.now(); r[C.updatedBy] = by;
  s.getRange(i + 2, 1, 1, COLS.length).setValues([r]);
  return { imgV: v, imgs: datas.length };
}

/** All photos of one item, in order: [{k, data}]. */
function images_(id) {
  const im = sheet_(IMAGES, ['id', 'data']);
  const n = im.getLastRow() - 1;
  if (n < 1 || !id) return { ok: true, images: [] };
  const out = [];
  im.getRange(2, 1, n, 2).getValues().forEach(r => { const k = String(r[0]); if (k === id || k.indexOf(id + '#') === 0) out.push({ k: k, i: k === id ? 1 : Number(k.split('#')[1]) || 99, data: String(r[1] || '') }); });
  out.sort((a, b) => a.i - b.i);
  return { ok: true, images: out.map(x => ({ k: x.k, data: x.data })) };
}

/* Item groups list (Config "groups", JSON). Managers can change it (they edit items); renaming/removing is done by the app
   re-saving the items and then sending the new list. */
function setGroups_(list) {
  const clean = []; (Array.isArray(list) ? list : []).forEach(g => { const v = str_(g, 40).replace(/\s+/g, ' ').trim(); if (v && !clean.some(x => x.toLowerCase() === v.toLowerCase())) clean.push(v); });
  const s = sheet_(CONFIG, ['key', 'value']); const n = s.getLastRow() - 1;
  const keys = n > 0 ? s.getRange(2, 1, n, 1).getValues().map(r => String(r[0])) : [];
  const val = JSON.stringify(clean.slice(0, 120)).slice(0, 5000), i = keys.indexOf('groups');
  if (i >= 0) s.getRange(i + 2, 2).setValue(val); else s.appendRow(['groups', val]);
  return { config: readConfig_() };
}
function setConfig_(cfg) {
  const s = sheet_(CONFIG, ['key', 'value']);
  const allowed = { shopName: 1, units: 1, defaultUnit: 1, roundTo: 1, billFooter: 1, nextBill: 1, nextGstBill: 1, testNextBill: 1, testNextGstBill: 1, mode: 1, showProfit: 1, fyReset: 1, gstFy: 1, testGstFy: 1, shopState: 1, bizType: 1, shopGstin: 1, shopAddress: 1, defaultGst: 1, defaultHsn: 1 };
  const n = s.getLastRow() - 1;
  const keys = n > 0 ? s.getRange(2, 1, n, 1).getValues().map(r => String(r[0])) : [];
  Object.keys(cfg).forEach(k => {
    if (!allowed[k]) return;
    let val = k === 'units' ? JSON.stringify(cfg[k]).slice(0, 5000) : str_(cfg[k], 300);
    if (k === 'showProfit') val = cfg[k] === true || cfg[k] === 'true' ? 'true' : 'false';
    if (k === 'mode') val = cfg[k] === 'live' ? 'live' : 'test';
    if (k === 'fyReset') val = cfg[k] === false || cfg[k] === 'false' ? 'false' : 'true';
    if (k === 'nextBill' || k === 'nextGstBill' || k === 'testNextBill' || k === 'testNextGstBill') val = Math.max(1, Math.floor(num_(cfg[k])) || 1);
    if (k === 'defaultGst') val = Math.max(0, Math.min(100, num_(cfg[k])));
    if (k === 'defaultHsn') { const h = hsn_(cfg[k]); val = h ? "'" + h : ''; }
    const i = keys.indexOf(k);
    if (i >= 0) s.getRange(i + 2, 2).setValue(val); else { s.appendRow([k, val]); keys.push(k); }
  });
  return { config: readConfig_() };
}

function setPin_(p) {
  if (!/^\d{4,8}$/.test(p)) throw new Error('bad_new_pin');
  PropertiesService.getScriptProperties().setProperty('PIN', p);
  return {};
}

/** A bill was shared or marked done: record it and move the bill number on. */
function takeBill_(body) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const b0 = body.bill || {};
    if (b0.id) {   // the phone may send the same bill again if the reply got lost: record it only once
      const bs = sheet_(tab_('Bills'), BILL_COLS), bn = bs.getLastRow() - 1;
      if (bn > 0) {
        const from = Math.max(0, bn - 500), ids = bs.getRange(2 + from, BILL_COLS.indexOf('billId') + 1, bn - from, 1).getValues();
        if (ids.some(r => String(r[0]) === String(b0.id))) return { ok: true, dup: true, rev: getRev_(), config: readConfig_() };
      }
    }
    let used = Math.floor(num_(body.n));
    const isGst = !!(body.bill && body.bill.gst);
    let key = isGst ? 'nextGstBill' : 'nextBill';   // GST and normal bills have separate numbers
    if (ENV_ === 'test') key = key === 'nextBill' ? 'testNextBill' : 'testNextGstBill';      // and test mode has its own
    const cfg0 = readConfig_(), fyNow = fy_(new Date());
    let cur = cfg0[key];
    const fyKey = ENV_ === 'test' ? 'testGstFy' : 'gstFy';
    if (isGst && cfg0.fyReset && cfg0[fyKey] !== fyNow) {
      if (!cfg0[fyKey]) { const o = {}; o[fyKey] = fyNow; setConfig_(o); }                  // first run: just note the current year
      else { cur = 1; const o = {}; o[key] = 1; o[fyKey] = fyNow; setConfig_(o); }          // new financial year: GST invoices start again from 1
    }
    // Two phones (or a hand-typed number) can pick a number that's already used in this series: give the next free one
    let renumbered = null;
    if (used > 0) {
      const bs = sheet_(tab_('Bills'), BILL_COLS), bn = bs.getLastRow() - 1;
      if (bn > 0) {
        const BI = BILL_COLS.reduce((m, k2, i2) => (m[k2] = i2, m), {});
        const nos = bs.getRange(2, 1, bn, 2).getValues(), gcol = bs.getRange(2, BI.gstBill + 1, bn, 1).getValues(), fcol = bs.getRange(2, BI.fy + 1, bn, 1).getValues();
        const taken = {};
        for (let i = 0; i < bn; i++) {
          if ((gcol[i][0] === 'Yes') !== isGst) continue;
          if (isGst && cfg0.fyReset && (String(fcol[i][0] || '') || fy_(nos[i][1] instanceof Date ? nos[i][1] : new Date(nos[i][1]))) !== fyNow) continue;
          taken[num_(nos[i][0])] = 1;
        }
        if (taken[used]) {
          let nn = Math.max(cur, used + 1); while (taken[nn]) nn++;
          renumbered = { from: used, to: nn };
          const b1 = body.bill;
          if (b1.text && b1.noLine) b1.text = String(b1.text).replace(String(b1.noLine), String(b1.noLine).replace(String(b1.noToken || used), String(b1.noToken || used).replace(new RegExp(used + '$'), String(nn))));
          used = nn;
        }
      }
    }
    const next = used >= cur ? used + 1 : cur;
    if (next !== cur) { const o = {}; o[key] = next; setConfig_(o); }
    const b = body.bill || {};
    if (used > 0) {
      try { if (mob10_(b.mobile)) customersSheet_(); } catch (err) {}   // build the Customers tab before this bill lands, so it isn't counted twice
      sheet_(tab_('Bills'), BILL_COLS).appendRow([used, new Date(), str_(b.customer, 80), str_(b.mobile, 20), num_(b.total), str_(b.items, 3000), str_(body.by, 60),
        b.gst ? 'Yes' : 'No', b.gst ? num_(b.taxable) : '', b.gst ? num_(b.tax) : '', str_(b.custGstin, 20), b.gst ? (b.igst ? 'IGST' : 'CGST+SGST') : '',
        (function (t) { return /^[=+@-]/.test(t) ? "'" + t : t; })(String(b.text || '').slice(0, 45000)), JSON.stringify(Array.isArray(b.lines) ? b.lines.slice(0, 200) : []).slice(0, 45000),
        str_(b.id, 40), '', '', 0, costOut_(b.cost), costOut_(b.profit)].concat(payRow_(payCalc_(b.total, b.pay, b.received, [], str_(body.by, 60))), [fyNow, '', '', '', '', str_(b.pos || '', 40)]));
      try { touchCustomer_(b.mobile, b.customer, b.custGstin, b.total, used, true); } catch (err) {}
      try { refreshDue_(b.mobile); } catch (err) {}
    }
    bump_();
    return { ok: true, rev: getRev_(), config: readConfig_(), renumbered: renumbered };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

/**
 * Past bills, newest first, without the big text/lines columns (those come from getBill when a bill is opened). Needs the PIN.
 * opt: q (search), limit, tz (phone's getTimezoneOffset, so "which day" matches the phone), from/to ('yyyy-mm-dd', inclusive),
 * before (sheet row: return only older rows, for "Show more").
 * Also returns: months {yyyy-mm: {count, total}} and days {day: {count, total}} for every matching bill on the days shown (exact even past the page), years (all years with bills), more.
 */
function listBills_(q, limit, opt) {
  opt = opt || {};
  if (opt.full && opt.brev && opt.brev === brev_()) return { same: true, full: true, brev: opt.brev };   // the phone's copy is already up to date
  let dIds = null;                                                                                          // only these bills changed since the phone's copy
  if (opt.full && opt.brev) { const L = blog_(ENV_), k = L.findIndex(e => e.v === opt.brev), later = k >= 0 ? L.slice(k + 1) : [];
    if (later.length && !later.some(e => e.full || !e.id)) { dIds = {}; later.forEach(e => dIds[e.id] = 1); } }
  const s = sheet_(tab_('Bills'), BILL_COLS);
  const n = s.getLastRow() - 1;
  if (n < 1) return { bills: [], days: {}, months: {}, all: { count: 0, total: 0 }, years: [], more: false };
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const a = s.getRange(2, 1, n, B.text).getValues();                                      // billNo … igst
  const b = s.getRange(2, B.billId + 1, n, BILL_COLS.length - B.billId).getValues();       // billId … profit
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  const tz = isFinite(Number(opt.tz)) ? Number(opt.tz) : -330;                             // default India
  const dayOf = d => isNaN(d) ? '' : new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(opt.from || '') ? opt.from : '';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(opt.to || '') ? opt.to : '';
  const before = Number(opt.before) || 0;
  const max = opt.full ? 3000 : Math.min(limit, 200);   // full: the phone keeps its own copy of recent bills and searches it instantly
  const out = [], days = {}, months = {}, years = {}, all = { count: 0, total: 0 };
  let more = false;
  for (let i = n - 1; i >= 0; i--) {
    const r = a[i].concat(['', ''], b[i]);
    if (r[B.billNo] === '' && r[B.total] === '') continue;
    if (dIds && !dIds[String(r[B.billId])]) { const d0 = r[B.date] instanceof Date ? r[B.date] : new Date(r[B.date]), dy = dayOf(d0); if (dy) years[dy.slice(0, 4)] = 1; continue; }
    const d = r[B.date] instanceof Date ? r[B.date] : new Date(r[B.date]);
    const day = dayOf(d);
    if (day) years[day.slice(0, 4)] = 1;
    if ((from && (!day || day < from)) || (to && (!day || day > to))) continue;
    if (needle) {
      const ds = day ? [day.slice(8) + '/' + day.slice(5, 7) + '/' + day.slice(0, 4), day.slice(8) + '-' + day.slice(5, 7) + '-' + day.slice(0, 4)].join(' ') : '';
      const hay = [r[B.billNo], r[B.customer], r[B.mobile], r[B.customerGstin], r[B.items], ds].join(' ').toLowerCase();
      const mob = String(r[B.mobile]).replace(/\D/g, '');
      const hit = hay.indexOf(needle) >= 0 || String(r[B.billNo]) === needle || (digits.length >= 4 && mob.indexOf(digits) >= 0);
      if (!hit) continue;
    }
    const k = day || 'unknown';
    const cancelled = r[B.status] === 'Cancelled';
    if (!cancelled) {
    if (!days[k]) days[k] = { count: 0, total: 0 };
    days[k].count += 1; days[k].total = Math.round((days[k].total + num_(r[B.total])) * 100) / 100;
    const mk = k.slice(0, 7);
    if (!months[mk]) months[mk] = { count: 0, total: 0 };
    months[mk].count += 1; months[mk].total = Math.round((months[mk].total + num_(r[B.total])) * 100) / 100;
    all.count += 1; all.total = Math.round((all.total + num_(r[B.total])) * 100) / 100;
    }
    if (before && i + 2 >= before) continue;
    if (out.length >= max) { more = true; continue; }
    out.push({ n: num_(r[B.billNo]), date: isNaN(d) ? '' : d.toISOString(), day: k, customer: String(r[B.customer] || ''), mobile: String(r[B.mobile] || ''),
      total: num_(r[B.total]), items: String(r[B.items] || ''), by: String(r[B.by] || ''), gst: r[B.gstBill] === 'Yes',
      taxable: r[B.taxable] === '' ? null : num_(r[B.taxable]), tax: r[B.tax] === '' ? null : num_(r[B.tax]), custGstin: String(r[B.customerGstin] || ''),
      igst: r[B.igst] === 'IGST',
      id: String(r[B.billId] || ''), row: i + 2, editedAt: r[B.editedAt] instanceof Date ? r[B.editedAt].toISOString() : (r[B.editedAt] ? String(r[B.editedAt]) : ''),
      editedBy: String(r[B.editedBy] || ''), edits: num_(r[B.edits]),
      cost: r[B.cost] === '' ? null : num_(r[B.cost]), profit: r[B.profit] === '' ? null : num_(r[B.profit]), ...payOut_(r, B),
      fy: String(r[B.fy] || ''), cancelled: cancelled, cancelReason: String(r[B.cancelReason] || ''), cancelledBy: String(r[B.cancelledBy] || ''), cancelledAt: r[B.cancelledAt] instanceof Date ? r[B.cancelledAt].toISOString() : String(r[B.cancelledAt] || ''), pos: String(r[B.pos] || '') });
  }
  const shown = {}, shownM = {}; out.forEach(x => { shown[x.day] = days[x.day] || { count: 0, total: 0 }; shownM[x.day.slice(0, 7)] = months[x.day.slice(0, 7)] || { count: 0, total: 0 }; });
  if (dIds) return { bills: out, delta: true, full: true, brev: brev_(), years: Object.keys(years).sort().reverse() };
  if (opt.full) return { bills: out, days: days, months: months, all: all, years: Object.keys(years).sort().reverse(), more: more, full: true, brev: brev_() };
  return { bills: out, days: shown, months: shownM, all: all, years: Object.keys(years).sort().reverse(), more: more };
}

/** The full text and lines of one bill, read only when it's opened. */
function getBill_(row, id, billNo) {
  const s = sheet_(tab_('Bills'), BILL_COLS);
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  row = Math.floor(Number(row));
  if (!(row >= 2) || row > s.getLastRow()) throw new Error('bill_not_found');
  const r = s.getRange(row, 1, 1, BILL_COLS.length).getValues()[0];
  if ((id && String(r[B.billId]) !== String(id)) || (!id && num_(r[B.billNo]) !== num_(billNo))) throw new Error('bill_moved');
  let lines = [];
  try { lines = JSON.parse(r[B.lines] || '[]'); } catch (err) {}
  return { bill: { text: String(r[B.text] || ''), lines: lines, edits: num_(r[B.edits]), fy: String(r[B.fy] || ''), gst: r[B.gstBill] === 'Yes',
    igst: r[B.igst] === 'IGST', custGstin: String(r[B.customerGstin] || ''), pos: String(r[B.pos] || ''), customer: String(r[B.customer] || ''), mobile: String(r[B.mobile] || ''),
    total: num_(r[B.total]), items: String(r[B.items] || ''), cancelled: r[B.status] === 'Cancelled', cancelReason: String(r[B.cancelReason] || ''), cancelledBy: String(r[B.cancelledBy] || ''),
    cancelledAt: r[B.cancelledAt] instanceof Date ? r[B.cancelledAt].toISOString() : String(r[B.cancelledAt] || ''),
    editedAt: r[B.editedAt] instanceof Date ? r[B.editedAt].toISOString() : String(r[B.editedAt] || ''), editedBy: String(r[B.editedBy] || ''), ...payOut_(r, B) } };
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** Change a saved bill. Keeps the original date and number, records who edited it and when, and keeps the old text in BillHistory. */
function updateBill_(b, by) {
  popReset_();
  const s = sheet_(tab_('Bills'), BILL_COLS);
  const n = s.getLastRow() - 1;
  if (n < 1) throw new Error('bill_not_found');
  const vals = s.getRange(2, 1, n, BILL_COLS.length).getValues();
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  let i = -1;
  if (b.id) i = vals.findIndex(r => String(r[B.billId]) === String(b.id));
  if (i < 0 && b.row) { const k = Number(b.row) - 2; if (k >= 0 && k < vals.length && num_(vals[k][B.billNo]) === num_(b.n)) i = k; }
  if (i < 0) throw new Error('bill_not_found');
  const r = vals[i];
  if (r[B.status] === 'Cancelled') throw new Error('bill_cancelled');
  if (b.baseEdits !== undefined && b.baseEdits !== null && num_(r[B.edits]) !== num_(b.baseEdits)) throw new Error('bill_changed');   // someone else saved it after this phone opened it
  sheet_(tab_('BillHistory'), HISTORY_COLS).appendRow([String(r[B.billId] || ''), r[B.billNo], new Date(), by, String(r[B.text] || r[B.items] || '').slice(0, 45000)]);
  const safe = t => /^[=+@-]/.test(t) ? "'" + t : t;
  r[B.customer] = str_(b.customer, 80); r[B.mobile] = str_(b.mobile, 20); r[B.total] = num_(b.total);
  r[B.items] = str_(b.items, 3000); r[B.gstBill] = b.gst ? 'Yes' : 'No';
  r[B.taxable] = b.gst ? num_(b.taxable) : ''; r[B.tax] = b.gst ? num_(b.tax) : '';
  r[B.customerGstin] = str_(b.custGstin, 20); r[B.igst] = b.gst ? (b.igst ? 'IGST' : 'CGST+SGST') : '';
  if (b.pos !== undefined) r[B.pos] = str_(b.pos || '', 40);
  r[B.text] = safe(String(b.text || '').slice(0, 45000));
  r[B.lines] = JSON.stringify(Array.isArray(b.lines) ? b.lines.slice(0, 200) : []).slice(0, 45000);
  if (!r[B.billId]) r[B.billId] = str_(b.id || Utilities.getUuid().replace(/-/g, '').slice(0, 16), 40);
  r[B.cost] = costOut_(b.cost); r[B.profit] = costOut_(b.profit);
  if (!b.fresh) { r[B.editedAt] = new Date(); r[B.editedBy] = by; }   // fresh: tweaks right after sharing, not an edit of an old bill
  r[B.edits] = num_(r[B.edits]) + 1;
  const oldMob = vals[i][B.mobile];
  { const pays = payList_(r[B.payments]), later = pays.filter(p => !p.at), atBill = pays.filter(p => p.at).reduce((x, p) => x + num_(p.a), 0);
    const mode = b.pay ? b.pay : modeOf_(r[B.payment], pays);
    const pc = payCalc_(r[B.total], mode, b.pay ? b.received : atBill, later, by);
    if (pc.status !== 'Paid' && !mob10_(r[B.mobile])) throw new Error('credit_needs_mobile');
    const pr = payRow_(pc); for (let j = 0; j < pr.length; j++) r[B.payment + j] = pr[j];
    if (pc.status === 'Cleared' && vals[i][B.clearedAt]) r[B.clearedAt] = vals[i][B.clearedAt]; }
  s.getRange(i + 2, 1, 1, BILL_COLS.length).setValues([r]);
  try { touchCustomer_(b.mobile, b.customer, b.custGstin, num_(b.total), num_(r[B.billNo]), false); } catch (err) {}
  try { refreshDue_(b.mobile); if (mob10_(oldMob) !== mob10_(b.mobile)) refreshDue_(oldMob); } catch (err) {}
  return { bill: { id: String(r[B.billId]), n: num_(r[B.billNo]), editedAt: r[B.editedAt] instanceof Date ? r[B.editedAt].toISOString() : String(r[B.editedAt] || ''), edits: r[B.edits] } };
}

/* ---------- credit (udhaar) ----------
 * Each bill has: payment ('Paid' | 'Credit' | 'Part paid' | 'Cleared'; blank on old bills = Paid), paid, due,
 * payments (JSON [{d: ISO date, a: amount, by, at: 1 if received at billing, note}]) and clearedAt (when the last of it was paid).
 */
function r2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function payList_(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (err) { return []; } }
function modeOf_(status, pays) {
  const atBill = pays.filter(p => p.at).reduce((x, p) => x + num_(p.a), 0);
  if (!status || status === 'Paid') return 'paid';
  return atBill > 0 ? 'part' : 'credit';
}
/** mode: paid | credit | part. received: amount taken at billing (part). later: payments recorded after the bill. */
function payCalc_(total, mode, received, later, by) {
  total = r2_(num_(total)); later = later || [];
  mode = mode === 'credit' || mode === 'part' ? mode : 'paid';
  const laterSum = r2_(later.reduce((x, p) => x + num_(p.a), 0));
  let atBill = mode === 'paid' ? Math.max(0, total - laterSum) : mode === 'credit' ? 0 : Math.max(0, Math.min(r2_(num_(received)), total));
  atBill = r2_(atBill);
  const paid = r2_(atBill + laterSum), due = r2_(Math.max(0, total - paid));
  const status = due > 0 ? (paid > 0 ? 'Part paid' : 'Credit') : (mode === 'paid' && !later.length ? 'Paid' : 'Cleared');
  const pays = (atBill > 0 && (mode !== 'paid' || later.length) ? [{ d: new Date().toISOString(), a: atBill, by: by || '', at: 1 }] : []).concat(later);
  return { status: status, paid: paid, due: due, pays: pays, clearedAt: status === 'Cleared' ? new Date() : '' };
}
function payRow_(pc) { return [pc.status, pc.status === 'Paid' ? '' : pc.paid, pc.status === 'Paid' ? '' : pc.due, pc.pays.length ? JSON.stringify(pc.pays).slice(0, 20000) : '', pc.clearedAt]; }
function payOut_(r, B) {
  const st = String(r[B.payment] || '') || 'Paid', total = num_(r[B.total]);
  return { pay: st, paid: st === 'Paid' ? total : num_(r[B.paid]), due: st === 'Paid' ? 0 : num_(r[B.due]), payments: payList_(r[B.payments]),
    clearedAt: r[B.clearedAt] instanceof Date ? r[B.clearedAt].toISOString() : (r[B.clearedAt] ? String(r[B.clearedAt]) : '') };
}

/** Everyone who owes money, biggest first, with their open bills (oldest first). Needs the PIN. */
function listDues_() {
  const s = sheet_(tab_('Bills'), BILL_COLS);
  const n = s.getLastRow() - 1;
  if (n < 1) return { customers: [], total: 0, bills: 0 };
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const a = s.getRange(2, 1, n, B.gstBill + 1).getValues();                                      // billNo … gstBill
  const b = s.getRange(2, B.billId + 1, n, BILL_COLS.length - B.billId).getValues();             // billId … clearedAt
  const map = {}, list = [];
  let total = 0, count = 0;
  for (let i = 0; i < n; i++) {
    const r = a[i].concat(new Array(B.billId - B.gstBill - 1).fill(''), b[i]);
    const st = String(r[B.payment] || '');
    if (st !== 'Credit' && st !== 'Part paid') continue;
    if (r[B.status] === 'Cancelled') continue;
    const due = num_(r[B.due]); if (!(due > 0)) continue;
    const k = mob10_(r[B.mobile]) || ('name:' + String(r[B.customer]).trim().toLowerCase());
    if (!map[k]) { map[k] = { mobile: mob10_(r[B.mobile]), name: '', due: 0, bills: [] }; list.push(map[k]); }
    const c = map[k];
    if (String(r[B.customer]).trim()) c.name = String(r[B.customer]).trim();
    const d = r[B.date] instanceof Date ? r[B.date] : new Date(r[B.date]);
    c.due = r2_(c.due + due); total = r2_(total + due); count++;
    c.bills.push({ row: i + 2, id: String(r[B.billId] || ''), n: num_(r[B.billNo]), date: isNaN(d) ? '' : d.toISOString(), total: num_(r[B.total]), paid: num_(r[B.paid]), due: due, pay: st, payments: payList_(r[B.payments]), items: String(r[B.items] || ''), gst: r[B.gstBill] === 'Yes',
      edits: num_(r[B.edits]), fy: String(r[B.fy] || ''), igst: r[B.igst] === 'IGST', custGstin: String(r[B.customerGstin] || ''), pos: String(r[B.pos] || '') });
  }
  list.forEach(c => { c.oldest = c.bills.length ? c.bills[0].date : ''; });
  list.sort((x, y) => y.due - x.due);
  return { customers: list, total: total, bills: count };
}

/**
 * Record money received. With billId (or row + n): only that bill. Otherwise across the customer's open bills, oldest first.
 * Returns how much was used, anything left over (more than was owed), and how many bills were cleared.
 */
function recordPayment_(body, by) {
  const amount = r2_(num_(body.amount));
  if (!(amount > 0)) throw new Error('bad_amount');
  const s = sheet_(tab_('Bills'), BILL_COLS);
  const n = s.getLastRow() - 1;
  if (n < 1) throw new Error('bill_not_found');
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const vals = s.getRange(2, 1, n, BILL_COLS.length).getValues();
  let targets = [];
  if (body.billId || body.row) {
    let i = body.billId ? vals.findIndex(r => String(r[B.billId]) === String(body.billId)) : -1;
    if (i < 0 && body.row) { const k = Number(body.row) - 2; if (k >= 0 && k < n && num_(vals[k][B.billNo]) === num_(body.n)) i = k; }
    if (i < 0) throw new Error('bill_not_found');
    targets = [i];
  } else {
    const want = mob10_(body.mobile); if (!want) throw new Error('bad_mobile');
    for (let i = 0; i < n; i++) if (mob10_(vals[i][B.mobile]) === want && num_(vals[i][B.due]) > 0 && vals[i][B.status] !== 'Cancelled' && (vals[i][B.payment] === 'Credit' || vals[i][B.payment] === 'Part paid')) targets.push(i);
  }
  let left = amount, cleared = 0, mob = '';
  const note = str_(body.note || '', 120);
  targets.forEach(i => {
    if (!(left > 0)) return;
    const r = vals[i], due = num_(r[B.due]);
    if (!(due > 0)) return;
    const take = r2_(Math.min(due, left)); left = r2_(left - take);
    const pays = payList_(r[B.payments]); pays.push(note ? { d: new Date().toISOString(), a: take, by: by, note: note } : { d: new Date().toISOString(), a: take, by: by });
    const paid = r2_(num_(r[B.paid]) + take), nd = r2_(Math.max(0, num_(r[B.total]) - paid));
    const st = nd > 0 ? 'Part paid' : 'Cleared'; if (st === 'Cleared') cleared++;
    s.getRange(i + 2, B.payment + 1, 1, 5).setValues([[st, paid, nd, JSON.stringify(pays).slice(0, 20000), st === 'Cleared' ? new Date() : '']]);
    mob = r[B.mobile];
  });
  if (left === amount) throw new Error('nothing_due');
  try { refreshDue_(mob); } catch (err) {}
  return { used: r2_(amount - left), left: left, cleared: cleared };
}

/** Take back the last payment recorded after billing (for a mistake). */
function undoPayment_(body) {
  const s = sheet_(tab_('Bills'), BILL_COLS);
  const n = s.getLastRow() - 1;
  if (n < 1) throw new Error('bill_not_found');
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const vals = s.getRange(2, 1, n, BILL_COLS.length).getValues();
  let i = body.billId ? vals.findIndex(r => String(r[B.billId]) === String(body.billId)) : -1;
  if (i < 0 && body.row) { const k = Number(body.row) - 2; if (k >= 0 && k < n && num_(vals[k][B.billNo]) === num_(body.n)) i = k; }
  if (i < 0) throw new Error('bill_not_found');
  const r = vals[i], pays = payList_(r[B.payments]);
  let j = -1; for (let x = pays.length - 1; x >= 0; x--) if (!pays[x].at) { j = x; break; }
  if (j < 0) throw new Error('nothing_to_undo');
  const gone = pays.splice(j, 1)[0];
  const paid = r2_(pays.reduce((x, p) => x + num_(p.a), 0)), due = r2_(Math.max(0, num_(r[B.total]) - paid));
  const st = due > 0 ? (paid > 0 ? 'Part paid' : 'Credit') : 'Cleared';
  s.getRange(i + 2, B.payment + 1, 1, 5).setValues([[st, paid, due, pays.length ? JSON.stringify(pays) : '', st === 'Cleared' ? r[B.clearedAt] : '']]);
  try { refreshDue_(r[B.mobile]); } catch (err) {}
  return { removed: num_(gone.a), pay: st, paid: paid, due: due };
}

/** Recount what one customer owes and store it in the Customers tab. */
function refreshDue_(mobile) {
  const k = mob10_(mobile); if (!k) return;
  const s = sheet_(tab_('Bills'), BILL_COLS);
  const n = s.getLastRow() - 1;
  const B = BILL_COLS.reduce((m, x, i) => (m[x] = i, m), {});
  let due = 0;
  if (n > 0) {
    const mobs = s.getRange(2, B.mobile + 1, n, 1).getValues();
    const pd = s.getRange(2, B.payment + 1, n, 3).getValues();                 // payment, paid, due
    const stc = s.getRange(2, B.status + 1, n, 1).getValues();
    for (let i = 0; i < n; i++) if (mob10_(mobs[i][0]) === k && stc[i][0] !== 'Cancelled' && (pd[i][0] === 'Credit' || pd[i][0] === 'Part paid')) due += num_(pd[i][2]);
  }
  const cs = customersSheet_(), row = custRow_(cs, k);
  if (row > 0) cs.getRange(row, CUST_COLS.indexOf('due') + 1).setValue(r2_(due));
}

function costOut_(v) { return v === undefined || v === null || v === '' || !isFinite(Number(v)) ? '' : Math.round(Number(v) * 100) / 100; }

/** Look up a returning customer by mobile (last 10 digits) from past bills. Needs the PIN. */
/** Look up a returning customer by mobile (last 10 digits) in the Customers tab. Needs the PIN. */
function findCustomer_(mobile) {
  const want = mob10_(mobile);
  if (!want) return { customer: null };
  const s = customersSheet_();
  const i = custRow_(s, want);
  if (i < 0) return { customer: null };
  const r = s.getRange(i, 1, 1, CUST_COLS.length).getValues()[0];
  const d = r[5] instanceof Date ? r[5] : new Date(r[5]);
  return { customer: { name: String(r[1] || ''), gstin: String(r[2] || ''), count: num_(r[3]), total: num_(r[4]), last: isNaN(d) ? '' : d.toISOString(), lastBillNo: num_(r[6]), due: num_(r[7]) } };
}

/**
 * Every customer (one per mobile) for the suggestions while typing on the bill: [mobile, name, gstin, bills, total, lastISO, due].
 * Uses the same bills version as Past bills, since customer totals only change when bills change; "same" means the phone's copy is current.
 */
function listCustomers_(brev) {
  const v = brev_();
  if (brev && brev === v) return { same: true, brev: v };
  const s = customersSheet_(), n = s.getLastRow() - 1, out = [];
  if (n > 0) s.getRange(2, 1, n, CUST_COLS.length).getValues().forEach(r => {
    const m = mob10_(r[0]); if (!m) return;
    const d = r[5] instanceof Date ? r[5] : new Date(r[5]);
    out.push([m, String(r[1] || ''), String(r[2] || ''), num_(r[3]), num_(r[4]), isNaN(d) ? '' : d.toISOString(), num_(r[7])]);
  });
  return { customers: out, brev: v };
}

function mob10_(m) { const d = String(m || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? d : ''; }

/** The Customers tab: one row per mobile. Built once from existing bills the first time it's needed. */
function customersSheet_() {
  const ss = ss_();
  let s = ss.getSheetByName(tab_('Customers'));
  if (s) return s;
  s = sheet_(tab_('Customers'), CUST_COLS);
  const bs = sheet_(tab_('Bills'), BILL_COLS);
  const n = bs.getLastRow() - 1;
  if (n < 1) return s;
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const v = bs.getRange(2, 1, n, B.igst + 1).getValues();
  let dueV = null; try { dueV = bs.getRange(2, B.payment + 1, n, 3).getValues(); } catch (err) {}
  const map = {}, order = [];
  v.forEach((r, ix) => {
    const k = mob10_(r[B.mobile]); if (!k) return;
    if (!map[k]) { map[k] = ["'" + k, '', '', 0, 0, '', '', 0]; order.push(k); }
    const c = map[k];
    if (String(r[B.customer]).trim()) c[1] = String(r[B.customer]).trim();
    if (String(r[B.customerGstin]).trim()) c[2] = String(r[B.customerGstin]).trim();
    c[3] += 1; c[4] = Math.round((c[4] + num_(r[B.total])) * 100) / 100; c[5] = r[B.date]; c[6] = r[B.billNo];
    if (dueV && (dueV[ix][0] === 'Credit' || dueV[ix][0] === 'Part paid')) c[7] = r2_(c[7] + num_(dueV[ix][2]));
  });
  const rows = order.map(k => map[k]);
  if (rows.length) s.getRange(2, 1, rows.length, CUST_COLS.length).setValues(rows);
  return s;
}
function custRow_(s, k) {
  const n = s.getLastRow() - 1;
  if (n < 1) return -1;
  const col = s.getRange(2, 1, n, 1).getValues();
  for (let i = 0; i < n; i++) if (String(col[i][0]).replace(/\D/g, '').slice(-10) === k) return i + 2;
  return -1;
}
/** Keep the Customers tab current. newBill: count it; otherwise just refresh name/GSTIN (an edited bill). */
function touchCustomer_(mobile, name, gstin, total, billNo, newBill) {
  const k = mob10_(mobile); if (!k) return;
  const s = customersSheet_();
  const i = custRow_(s, k);
  name = String(name || '').trim(); gstin = String(gstin || '').trim();
  if (i < 0) { s.appendRow(["'" + k, str_(name, 80), str_(gstin, 20), 1, num_(total), new Date(), billNo, 0]); return; }
  const r = s.getRange(i, 1, 1, CUST_COLS.length).getValues()[0];
  if (name) r[1] = str_(name, 80);
  if (gstin) r[2] = str_(gstin, 20);
  if (newBill) { r[3] = num_(r[3]) + 1; r[4] = Math.round((num_(r[4]) + num_(total)) * 100) / 100; r[5] = new Date(); r[6] = billNo; }
  r[0] = "'" + k;
  s.getRange(i, 1, 1, CUST_COLS.length).setValues([r]);
}


/* =====================================================================
 * Backups
 * - setupBackups(): run ONCE from the Apps Script editor (choose it in the toolbar, press Run, allow the permissions).
 *   It turns on autoBackup() every 4 hours and makes the first backup.
 * - Each backup is a full copy of the spreadsheet (items, photos, bills, settings) in the Drive folder "Rate Book backups".
 *   A copy is skipped when the sheet hasn't changed since the last one.
 * - Kept: every copy from the last 2 days, then the newest copy of each day for 30 days, then the newest of each month
 *   for 12 months. Older copies go to Drive's Trash (recoverable there for 30 days).
 * - Restore (from the app, PIN): backs up the current sheet first, makes a fresh copy of the chosen backup and switches
 *   the app to it. Nothing is deleted, so a restore can always be undone by restoring the "before restore" copy.
 * - Optional weekly Excel copy by email (set in the app), ideally to someone else's address, in case the Google account itself is lost.
 * ===================================================================== */
const BACKUP_FOLDER = 'Rate Book backups';
const BACKUP_PREFIX = 'Rate Book backup ';
const BK_TZ = 'Asia/Kolkata';

function setupBackups() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'autoBackup').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('autoBackup').timeBased().everyHours(4).create();
  const b = backupNow_('first');
  Logger.log('Automatic backups are on (every 4 hours). First backup: ' + b.name);
}

/** Runs every 4 hours. */
function autoBackup() {
  const props = PropertiesService.getScriptProperties();
  const changed = DriveApp.getFileById(ss_().getId()).getLastUpdated().getTime();
  const last = Number(props.getProperty('BK_SRC_TIME') || 0);
  if (changed > last) backupNow_('auto');
  try { weeklyMail_(); } catch (err) { props.setProperty('BK_MAIL_ERR', String(err && err.message || err)); }
}

function backupFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('BK_FOLDER');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (err) {} }
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  props.setProperty('BK_FOLDER', f.getId());
  return f;
}

function backupNow_(why) {
  const props = PropertiesService.getScriptProperties();
  const src = DriveApp.getFileById(ss_().getId());
  const now = new Date();
  const label = why === 'before-restore' ? ' (before restore)' : why === 'manual' ? ' (manual)' : '';
  const name = BACKUP_PREFIX + Utilities.formatDate(now, BK_TZ, 'yyyy-MM-dd HH:mm') + label;
  const copy = src.makeCopy(name, backupFolder_());
  props.setProperty('BK_LAST', now.toISOString());
  props.setProperty('BK_SRC_TIME', String(src.getLastUpdated().getTime()));
  try { pruneBackups_(); } catch (err) {}
  return { id: copy.getId(), name: name, date: now.toISOString() };
}

/** Which backups to keep: all from the last 2 days, newest per day for 30 days, newest per month for 12 months. Manual and before-restore copies count like any other. */
function pruneBackups_() {
  const files = backupFiles_();
  const now = Date.now(), day = 864e5, keep = {}, perDay = {}, perMonth = {};
  files.forEach(f => {
    const age = now - f.t, d = Utilities.formatDate(new Date(f.t), BK_TZ, 'yyyy-MM-dd');
    if (age <= 2 * day) { keep[f.id] = 1; return; }
    if (age <= 30 * day) { if (!perDay[d]) { perDay[d] = 1; keep[f.id] = 1; } return; }
    if (age <= 366 * day) { const m = d.slice(0, 7); if (!perMonth[m]) { perMonth[m] = 1; keep[f.id] = 1; } }
  });
  let trashed = 0;
  files.forEach(f => { if (!keep[f.id]) { try { f.file.setTrashed(true); trashed++; } catch (err) {} } });
  return trashed;
}

/** Backup files, newest first. */
function backupFiles_() {
  const out = [];
  const it = backupFolder_().getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const name = f.getName();
    if (name.indexOf(BACKUP_PREFIX) !== 0 || f.isTrashed()) continue;
    out.push({ id: f.getId(), name: name, t: f.getDateCreated().getTime(), file: f });
  }
  out.sort((a, b) => b.t - a.t);
  return out;
}

function backupInfo_() {
  const props = PropertiesService.getScriptProperties();
  const auto = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'autoBackup');
  let list = [];
  try { list = backupFiles_().slice(0, 40).map(f => ({ id: f.id, name: f.name, date: new Date(f.t).toISOString(), url: 'https://docs.google.com/spreadsheets/d/' + f.id })); } catch (err) {}
  return { backups: { auto: auto, last: props.getProperty('BK_LAST') || '', count: list.length, list: list,
    email: props.getProperty('BK_EMAIL') || '', lastMail: props.getProperty('BK_MAIL_LAST') || '', mailError: props.getProperty('BK_MAIL_ERR') || '',
    restoredAt: props.getProperty('BK_RESTORED_AT') || '', restoredFrom: props.getProperty('BK_RESTORED_FROM') || '',
    current: 'https://docs.google.com/spreadsheets/d/' + ss_().getId() } };
}

function restoreBackup_(id, by) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const files = backupFiles_();
    const f = files.filter(x => x.id === id)[0];
    if (!f) throw new Error('backup_not_found');
    backupNow_('before-restore');
    const fresh = f.file.makeCopy('Rate Book prices (restored from ' + f.name.slice(BACKUP_PREFIX.length) + ')');
    const props = PropertiesService.getScriptProperties();
    props.setProperty('SHEET_ID', fresh.getId());
    CacheService.getScriptCache().put('SHEET_ID', fresh.getId(), 21600);
    props.setProperty('BK_RESTORED_AT', new Date().toISOString());
    props.setProperty('BK_RESTORED_FROM', 'the backup of ' + f.name.slice(BACKUP_PREFIX.length) + (by ? ' · by ' + by : ''));
    props.setProperty('BK_SRC_TIME', String(fresh.getLastUpdated().getTime()));
    for (const k in HEADERS_OK_) delete HEADERS_OK_[k];
    bump_();
    return { restored: { from: f.name, url: 'https://docs.google.com/spreadsheets/d/' + fresh.getId() } };
  } finally { lock.releaseLock(); }
}

function setBackupEmail_(email) {
  email = email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('bad_email');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('BK_EMAIL', email);
  if (email) props.deleteProperty('BK_MAIL_LAST');      // send the first one with the next backup run
  props.deleteProperty('BK_MAIL_ERR');
  return backupInfo_();
}

/** Once a week: email an Excel copy of the whole sheet to the backup address (if one is set). */
function weeklyMail_(force) {
  const props = PropertiesService.getScriptProperties();
  const to = props.getProperty('BK_EMAIL');
  if (!to) return false;
  const last = Number(new Date(props.getProperty('BK_MAIL_LAST') || 0).getTime()) || 0;
  if (!force && Date.now() - last < 7 * 864e5 - 3600e3) return false;
  const id = ss_().getId();
  const blob = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }).getBlob();
  const stamp = Utilities.formatDate(new Date(), BK_TZ, 'dd MMM yyyy');
  blob.setName('Rate Book backup ' + Utilities.formatDate(new Date(), BK_TZ, 'yyyy-MM-dd') + '.xlsx');
  const body = 'Weekly backup of the Rate Book sheet (' + stamp + '), attached as an Excel file.\n\nKeep this email. If the Google sheet is ever lost, this file has every item, bill and setting up to today.';
  if (blob.getBytes().length < 20 * 1024 * 1024) MailApp.sendEmail(to, 'Rate Book weekly backup · ' + stamp, body, { attachments: [blob] });
  else MailApp.sendEmail(to, 'Rate Book weekly backup · ' + stamp, 'The backup is too large to attach this week. Latest copies are in the "Rate Book backups" folder in Google Drive.');
  props.setProperty('BK_MAIL_LAST', new Date().toISOString());
  props.deleteProperty('BK_MAIL_ERR');
  return true;
}


/* ---------- cancel a bill (GST-friendly: the number stays used, the bill is marked Cancelled with a reason) ---------- */
function cancelBill_(body, by, cancel) {
  popReset_();
  const s = sheet_(tab_('Bills'), BILL_COLS);
  const n = s.getLastRow() - 1;
  if (n < 1) throw new Error('bill_not_found');
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const vals = s.getRange(2, 1, n, BILL_COLS.length).getValues();
  let i = body.id ? vals.findIndex(r => String(r[B.billId]) === String(body.id)) : -1;
  if (i < 0 && body.row) { const k = Number(body.row) - 2; if (k >= 0 && k < n && num_(vals[k][B.billNo]) === num_(body.n)) i = k; }
  if (i < 0) throw new Error('bill_not_found');
  const r = vals[i];
  if (cancel) {
    const reason = str_(body.reason || '', 120).trim(); if (!reason) throw new Error('need_reason');
    s.getRange(i + 2, B.status + 1, 1, 4).setValues([['Cancelled', new Date(), by, reason]]);
  } else s.getRange(i + 2, B.status + 1, 1, 4).setValues([['', '', '', '']]);
  sheet_(tab_('BillHistory'), HISTORY_COLS).appendRow([String(r[B.billId] || ''), r[B.billNo], new Date(), by, (cancel ? 'CANCELLED: ' + str_(body.reason || '', 120) : 'RESTORED') ]);
  try { recountCustomers_(); } catch (err) {}
  return { bill: { id: String(r[B.billId] || ''), cancelled: cancel } };
}

/* ---------- reports: sales, items, GST summary and the invoice register for a date range ---------- */
function report_(body) {
  const tz = isFinite(Number(body.tz)) ? Number(body.tz) : -330;
  const dayOf = d => isNaN(d) ? '' : new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
  const from = String(body.from || ''), to = String(body.to || '');
  const s = sheet_(tab_('Bills'), BILL_COLS);
  const n = s.getLastRow() - 1;
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const T = { bills: 0, sales: 0, taxable: 0, tax: 0, profit: 0, cost: 0, profitBills: 0, cancelled: 0, gstBills: 0, pSale: 0, pCost: 0, pBills: 0, noBuyAmt: 0, lineSale: 0, estAmt: 0 };
  const curBuy = curBuyMap_();   // today's buy prices, used for old bill lines that saved none
  const byDay = {}, items = {}, rates = {}, hsn = {};
  const g = { b2b: { count: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }, b2c: { count: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 } };
  const register = [];
  let received = 0, creditGiven = 0, outstanding = 0;
  if (n > 0) s.getRange(2, 1, n, BILL_COLS.length).getValues().forEach(r => {
    const d = r[B.date] instanceof Date ? r[B.date] : new Date(r[B.date]);
    const day = dayOf(d);
    const st = String(r[B.payment] || '');
    const isCan = r[B.status] === 'Cancelled';
    if (!isCan && (st === 'Credit' || st === 'Part paid')) outstanding = r2_(outstanding + num_(r[B.due]));
    payList_(r[B.payments]).forEach(p => { const pd = dayOf(new Date(p.d)); if (!p.at && pd && (!from || pd >= from) && (!to || pd <= to) && !isCan) received = r2_(received + num_(p.a)); });
    if (!day || (from && day < from) || (to && day > to)) return;
    const gst = r[B.gstBill] === 'Yes';
    if (isCan) { T.cancelled++; if (gst) register.push({ date: day, no: num_(r[B.billNo]), fy: String(r[B.fy] || ''), customer: String(r[B.customer] || ''), gstin: String(r[B.customerGstin] || ''), pos: String(r[B.pos] || ''), taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0, status: 'Cancelled' }); return; }
    const total = num_(r[B.total]);
    T.bills++; T.sales = r2_(T.sales + total);
    if (r[B.profit] !== '' && r[B.profit] !== null) { T.profit = r2_(T.profit + num_(r[B.profit])); T.cost = r2_(T.cost + num_(r[B.cost])); T.profitBills++; }
    if ((st === 'Credit' || st === 'Part paid')) { const pays = payList_(r[B.payments]); creditGiven = r2_(creditGiven + total - pays.filter(p => p.at).reduce((x, p) => x + num_(p.a), 0)); }
    if (!byDay[day]) byDay[day] = { d: day, sales: 0, bills: 0 };
    byDay[day].sales = r2_(byDay[day].sales + total); byDay[day].bills++;
    let lines = []; try { lines = JSON.parse(r[B.lines] || '[]'); } catch (err) {}
    const seenItem = {};
    lines.forEach(l => {
      const q = num_(l.qty), rt = num_(l.rate), amt = r2_(q * rt), key = String(l.name || '?') + '|' + String(l.unit || '');
      if (!items[key]) items[key] = { name: String(l.name || '?'), unit: String(l.unit || ''), qty: 0, amount: 0, bills: 0, cost: 0, costQty: 0, costAmt: 0, gstQty: 0, min: null, max: null, rates: {} };
      const it = items[key];
      it.qty = r2_(it.qty + q); it.amount = r2_(it.amount + amt);
      if (!seenItem[key]) { seenItem[key] = 1; it.bills++; }
      if (gst) it.gstQty = r2_(it.gstQty + q);
      if (it.min === null || rt < it.min) it.min = rt; if (it.max === null || rt > it.max) it.max = rt;
      const rk = String(rt); if (!it.rates[rk]) it.rates[rk] = { rate: rt, qty: 0, bills: 0, _b: {} };
      const rr = it.rates[rk]; rr.qty = r2_(rr.qty + q); const bk = String(r[B.billId] || r[B.billNo]); if (!rr._b[bk]) { rr._b[bk] = 1; rr.bills++; }
      T.lineSale = r2_(T.lineSale + amt);
      let lb = (l.buy !== undefined && l.buy !== null && l.buy !== '') ? num_(l.buy) : 0, est = false;
      if (!(lb > 0)) { const cb = curBuy.byId[String(l.id || '')] || curBuy.byName[String(l.name || '').trim().toLowerCase()];
        if (cb && cb.buy > 0) { lb = l.alt && cb.altQty > 0 ? r2_(cb.buy / cb.altQty) : cb.buy; est = true; } }
      if (lb > 0) { l = Object.assign({}, l, { buy: lb }); if (est) { T.estAmt = r2_(T.estAmt + amt); it.estQty = r2_((it.estQty || 0) + q); } }
      if (l.buy !== undefined && l.buy !== null && l.buy !== '' && num_(l.buy) > 0) { it.cost = r2_(it.cost + q * num_(l.buy)); it.costQty = r2_(it.costQty + q); it.costAmt = r2_(it.costAmt + amt);
        T.pSale = r2_(T.pSale + amt); T.pCost = r2_(T.pCost + q * num_(l.buy)); if (!seenItem.__p) { seenItem.__p = 1; T.pBills++; } }
      else T.noBuyAmt = r2_(T.noBuyAmt + amt);
    });
    if (gst) {
      T.gstBills++;
      const taxable = num_(r[B.taxable]), tax = num_(r[B.tax]), igst = r[B.igst] === 'IGST';
      T.taxable = r2_(T.taxable + taxable); T.tax = r2_(T.tax + tax);
      const bucket = String(r[B.customerGstin] || '').trim() ? g.b2b : g.b2c;
      bucket.count++; bucket.taxable = r2_(bucket.taxable + taxable); bucket.total = r2_(bucket.total + total);
      if (igst) bucket.igst = r2_(bucket.igst + tax); else { bucket.cgst = r2_(bucket.cgst + tax / 2); bucket.sgst = r2_(bucket.sgst + tax / 2); }
      lines.forEach(l => {
        const amt = r2_(num_(l.qty) * num_(l.rate)), rate = num_(l.gst), t = r2_(amt * rate / 100);
        const rk = String(rate);
        if (!rates[rk]) rates[rk] = { rate: rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        rates[rk].taxable = r2_(rates[rk].taxable + amt);
        if (igst) rates[rk].igst = r2_(rates[rk].igst + t); else { rates[rk].cgst = r2_(rates[rk].cgst + t / 2); rates[rk].sgst = r2_(rates[rk].sgst + t / 2); }
        const hk = String(l.hsn || '') + '|' + rk;
        if (!hsn[hk]) hsn[hk] = { hsn: String(l.hsn || ''), rate: rate, qty: 0, taxable: 0, tax: 0 };
        hsn[hk].qty = r2_(hsn[hk].qty + num_(l.qty)); hsn[hk].taxable = r2_(hsn[hk].taxable + amt); hsn[hk].tax = r2_(hsn[hk].tax + t);
      });
      register.push({ date: day, no: num_(r[B.billNo]), fy: String(r[B.fy] || ''), customer: String(r[B.customer] || ''), gstin: String(r[B.customerGstin] || ''), pos: String(r[B.pos] || ''),
        taxable: taxable, cgst: igst ? 0 : r2_(tax / 2), sgst: igst ? 0 : r2_(tax / 2), igst: igst ? tax : 0, total: total, status: '' });
    }
  });
  const itemList = Object.keys(items).map(k => { const it = items[k];
    it.rates = Object.keys(it.rates).map(x => { const v = it.rates[x]; return { rate: v.rate, qty: v.qty, bills: v.bills }; }).sort((a, b) => b.qty - a.qty).slice(0, 8);
    it.profit = it.costQty ? r2_(it.costAmt - it.cost) : null; return it; }).sort((a, b) => b.amount - a.amount);
  return { report: { from: from, to: to, totals: T, byDay: Object.keys(byDay).sort().map(k => byDay[k]), items: itemList.slice(0, 100), itemCount: itemList.length,
    gst: { b2b: g.b2b, b2c: g.b2c, rates: Object.keys(rates).map(k => rates[k]).sort((a, b) => a.rate - b.rate), hsn: Object.keys(hsn).map(k => hsn[k]) },
    received: received, creditGiven: r2_(creditGiven), outstanding: outstanding, register: register.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.no - b.no) } };
}

/* ======================= Vendor khata (purchases and payments to suppliers) =======================
 * Tabs (separate in test mode via tab_): Vendors, VendorLedger, VendorDocs (small previews of bill photos).
 * Full-quality bill photos / PDFs are files in a private Drive folder ("Rate Book vendor bills", test: "… (test)").
 * Balance = opening + bills − payments − returns. Payments/returns store which bills they cover (alloc {billId: amount});
 * what isn't allocated is an advance, which can later be used against a bill (vUseAdvance).
 * A vendor's private read-only link (token) is served by doGet vpub / vpubprev / vpubfile. Owner + manager only otherwise. */
const VEND_COLS = ['id', 'name', 'mobile', 'gstin', 'address', 'creditDays', 'opening', 'openingDate', 'token', 'linkOn', 'note', 'createdAt', 'updatedAt', 'by', 'removed'];
const VLED_COLS = ['id', 'vendorId', 'type', 'date', 'amount', 'gst', 'billNo', 'mode', 'ref', 'noteV', 'noteP', 'photos', 'alloc', 'by', 'at', 'editedAt', 'editedBy', 'removed', 'history', 'ex', 'check'];
const VDOC_COLS = ['fileId', 'vendorId', 'preview', 'mime', 'at'];
const VD_FOLDER_NAME = 'Rate Book vendor bills';
function vjson_(v, d) { try { const x = JSON.parse(v || ''); return x == null ? d : x; } catch (e) { return d; } }
function vtab_(name, cols) { const s = sheet_(tab_(name), cols), n = s.getLastRow() - 1; const rows = n > 0 ? s.getRange(2, 1, n, cols.length).getValues() : [];
  return { s, rows: rows.map((r, i) => { const o = { _r: i + 2 }; cols.forEach((k, j) => o[k] = r[j]); return o; }) }; }
const VTXT_ = { date: 1, openingDate: 1, billNo: 1, ref: 1, mobile: 1, gstin: 1, token: 1 };   // kept as text, so Sheets doesn't turn them into dates/numbers
function vwrite_(s, cols, o) { const row = cols.map(k => { const v = o[k] === undefined || o[k] === null ? '' : o[k]; return VTXT_[k] && v !== '' && !String(v).startsWith("'") ? "'" + v : v; }); if (o._r) s.getRange(o._r, 1, 1, cols.length).setValues([row]); else s.appendRow(row); }
const vday_ = v => { if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Kolkata', 'yyyy-MM-dd'); const x = String(v || ''); return /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : ''; };
function vVendorOut_(v) { return { id: String(v.id), name: String(v.name), mobile: String(v.mobile || ''), gstin: String(v.gstin || ''), address: String(v.address || ''), creditDays: num_(v.creditDays) || 0,
  opening: num_(v.opening) || 0, openingDate: vday_(v.openingDate) || vday_(new Date(num_(v.createdAt) || Date.now())), linkOn: String(v.linkOn) === '1' || v.linkOn === true, token: String(v.token || ''), note: String(v.note || ''),
  createdAt: num_(v.createdAt), updatedAt: num_(v.updatedAt) }; }
function vEntryOut_(e, pub) { const o = { id: String(e.id), vendorId: String(e.vendorId), type: String(e.type), date: vday_(e.date), amount: num_(e.amount), gst: e.gst === '' ? null : num_(e.gst),
  billNo: String(e.billNo || ''), mode: String(e.mode || ''), ref: String(e.ref || ''), noteV: String(e.noteV || ''), photos: vjson_(e.photos, []), alloc: vjson_(e.alloc, {}), at: num_(e.at),
  removed: String(e.removed) === '1', check: vjson_(e.check, null) };
  if (o.check && pub) { delete o.check.by; delete o.check.err; }
  if (!pub) { o.noteP = String(e.noteP || ''); o.by = String(e.by || ''); o.editedAt = num_(e.editedAt); o.editedBy = String(e.editedBy || ''); o.history = vjson_(e.history, []); }
  return o; }
/** Work out bills (with paid/due/status), advance and balance for one vendor from its (non-removed) entries. */
function vCalc_(v, entries) {
  const today = vday_(new Date()), cd = num_(v.creditDays) || 0, add = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const live = entries.filter(e => !e.removed).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.at - b.at);
  const bills = []; if (v.opening > 0) bills.push({ id: 'open:' + v.id, date: v.openingDate, amount: v.opening, billNo: 'Opening balance', opening: true, at: 0 });
  live.filter(e => e.type === 'bill').forEach(e => bills.push({ id: e.id, date: e.date, amount: e.amount, billNo: e.billNo, at: e.at }));
  const byId = {}; bills.forEach(b => { b.paid = 0; b.by = []; byId[b.id] = b; });
  let paidTotal = 0, allocTotal = 0, billTotal = v.opening > 0 ? v.opening : 0, openingNeg = v.opening < 0 ? -v.opening : 0;
  live.forEach(e => { if (e.type === 'bill') { billTotal += e.amount; return; }
    paidTotal += e.amount; let left = e.amount;
    Object.keys(e.alloc || {}).forEach(id => { const b = byId[id]; if (!b) return; const a = Math.min(num_(e.alloc[id]), left, Math.max(0, b.amount - b.paid)); if (a <= 0) return; b.paid = Math.round((b.paid + a) * 100) / 100; left -= a; allocTotal += a; b.by.push({ id: e.id, a: Math.round(a * 100) / 100 }); }); });
  bills.forEach(b => { b.due = Math.max(0, Math.round((b.amount - b.paid) * 100) / 100); b.status = b.due <= 0 ? 'paid' : b.paid > 0 ? 'part' : 'open'; b.dueDate = cd ? add(b.date, cd) : ''; b.overdue = !!(b.due > 0 && b.dueDate && b.dueDate < today); });
  const balance = Math.round((billTotal - paidTotal - openingNeg) * 100) / 100, advance = Math.max(0, Math.round((paidTotal + openingNeg - allocTotal) * 100) / 100);
  const open = bills.filter(b => b.due > 0);
  return { bills, balance, advance, openBills: open.length, overdue: open.filter(b => b.overdue).length, oldest: open.length ? open[0].date : '', billTotal: Math.round(billTotal * 100) / 100, paidTotal: Math.round(paidTotal * 100) / 100,
    lastAt: live.reduce((m, e) => Math.max(m, e.at || 0), num_(v.updatedAt) || 0) };
}
/* Each request reads the two tabs once (vAll_) and passes that around; writes reply with just that vendor's data, and
   every change bumps a vendors version (vrev_<mode>) so phones can ask "anything new?" (vSync) without reading tabs. */
function vAll_() { const V = vtab_('Vendors', VEND_COLS), L = vtab_('VendorLedger', VLED_COLS);
  return { V, L, vendors: V.rows.filter(r => r.id && String(r.removed) !== '1'), entries: L.rows.filter(r => r.id).map(r => vEntryOut_(r)) }; }
function vbump_() { const v = String(Date.now()); PropertiesService.getScriptProperties().setProperty('vrev_' + ENV_, v); try { CacheService.getScriptCache().put('vrev_' + ENV_, v, 21600); } catch (e) {} return v; }
function vrev_() { const c = CacheService.getScriptCache(); let v = c.get('vrev_' + ENV_); if (!v) { v = PropertiesService.getScriptProperties().getProperty('vrev_' + ENV_) || '0'; c.put('vrev_' + ENV_, v, 21600); } return v; }
/** Everything for this mode, or {same:true} when the phone's copy is current (no sheet read at all). */
function vSync_(have) { const v = vrev_(); if (have && String(have) === v) return { same: true, vrev: v };
  const A = vAll_(); return { vrev: v, vendors: A.vendors.map(vVendorOut_), entries: A.entries }; }
function vOne_(A, id) { const r = A.vendors.find(x => String(x.id) === String(id)); if (!r) throw new Error('no_vendor');
  const v = vVendorOut_(r), entries = A.entries.filter(e => e.vendorId === v.id).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.at - b.at);
  return { vendor: v, entries: entries, calc: vCalc_(v, entries) }; }
function vList_() { const A = vAll_(); const by = {}; A.entries.forEach(e => (by[e.vendorId] = by[e.vendorId] || []).push(e));
  const list = A.vendors.map(r => { const v = vVendorOut_(r); delete v.token; const c = vCalc_(v, by[v.id] || []); delete c.bills; return Object.assign(v, c); });
  return { vendors: list, owe: Math.round(list.reduce((s, v) => s + Math.max(0, v.balance), 0) * 100) / 100 }; }
function vGet_(id) { return vOne_(vAll_(), id); }
function vToken_() { return (ENV_ === 'test' ? 't' : 'l') + Utilities.getUuid().replace(/-/g, '').slice(0, 22); }
function vSaveVendor_(x, by) { const A = vAll_(), V = A.V, now = Date.now();
  const name = str_(x.name, 80).trim(); if (!name) throw new Error('need_name');
  let r = x.id ? V.rows.find(o => String(o.id) === String(x.id)) : null;
  if (!r) { if (V.rows.some(o => String(o.removed) !== '1' && String(o.name).toLowerCase() === name.toLowerCase())) throw new Error('dup_vendor');
    r = { id: str_(x.id, 40) || ('v' + Utilities.getUuid().replace(/-/g, '').slice(0, 12)), createdAt: now, token: vToken_(), linkOn: '1' }; A.vendors.push(r); }
  r.name = name; r.mobile = str_(x.mobile, 20); r.gstin = str_(x.gstin, 15).toUpperCase(); r.address = str_(x.address, 200); r.creditDays = Math.max(0, Math.min(365, Math.floor(num_(x.creditDays)) || 0));
  r.opening = num_(x.opening) || 0; r.openingDate = vday_(x.openingDate) || r.openingDate || vday_(new Date()); r.note = str_(x.note, 300); r.updatedAt = now; r.by = by; if (x.removed !== undefined) r.removed = x.removed ? '1' : '';
  vwrite_(V.s, VEND_COLS, r); vbump_(); return vOne_(A, r.id); }
function vLink_(id, on, regen) { const V = vtab_('Vendors', VEND_COLS); const r = V.rows.find(o => String(o.id) === String(id)); if (!r) throw new Error('no_vendor');
  if (regen || !r.token) r.token = vToken_(); r.linkOn = on ? '1' : ''; r.updatedAt = Date.now(); vwrite_(V.s, VEND_COLS, r); vbump_(); return { token: String(r.token), linkOn: !!on }; }
function vAllocClean_(alloc, billIds, amount) { const out = {}; let left = num_(amount);
  Object.keys(alloc || {}).forEach(k => { if (!billIds[k]) return; const a = Math.max(0, Math.min(num_(alloc[k]), left)); if (a > 0) { out[k] = Math.round(a * 100) / 100; left -= a; } }); return out; }
function vSet_(A, row) { const i = A.entries.findIndex(e => e.id === String(row.id)), o = vEntryOut_(row); if (i >= 0) A.entries[i] = o; else A.entries.push(o); }
function vSave_(x, by) { const A = vAll_(), L = A.L, now = Date.now();
  const G = vOne_(A, x.vendorId); const type = ['bill', 'pay', 'adj'].indexOf(x.type) >= 0 ? x.type : null; if (!type) throw new Error('bad_type');
  const amount = Math.round(num_(x.amount) * 100) / 100; if (!(amount > 0)) throw new Error('need_amount');
  let r = x.id ? L.rows.find(o => String(o.id) === String(x.id)) : null;
  const billIds = {}; G.calc.bills.forEach(b => billIds[b.id] = 1); if (type !== 'bill' && x.id) Object.keys(x.alloc || {}).forEach(k => { if (A.entries.some(e => e.id === k && e.vendorId === G.vendor.id && e.type === 'bill')) billIds[k] = 1; });
  const fields = { vendorId: G.vendor.id, type: type, date: vday_(x.date) || vday_(new Date()), amount: amount, gst: (x.gst === '' || x.gst == null) ? '' : Math.max(0, num_(x.gst)), billNo: str_(x.billNo, 40), mode: str_(x.mode, 20),
    ref: str_(x.ref, 60), noteV: str_(x.noteV, 500), noteP: str_(x.noteP, 500), photos: JSON.stringify((Array.isArray(x.photos) ? x.photos : []).filter(p => p && p.f && !/^local:/.test(p.f)).slice(0, 6).map(p => ({ f: str_(p.f, 80), m: str_(p.m, 40) }))),
    alloc: type === 'bill' ? '' : JSON.stringify(vAllocClean_(x.alloc, billIds, amount)) };
  if (type === 'bill') {   // bill check: from what the phone already read, else the stored reading (re-done with the new amount), cleared when photos change
    const exIn = vExSafe_(x.ex);
    const photosSame = r && String(r.photos) === fields.photos, oldEx = r && photosSame ? vjson_(r.ex, null) : null, ex = exIn || oldEx, oldChk = r ? vjson_(r.check, null) : null;
    fields.ex = ex ? JSON.stringify(ex).slice(0, 45000) : '';
    fields.check = ex ? JSON.stringify(Object.assign(vCheckCalc_(ex, amount), { at: Date.now(), by: by }, oldChk && oldChk.ack && photosSame && !exIn ? { ack: oldChk.ack } : {})) : (photosSame && oldChk && oldChk.st === 'error' ? r.check : ''); }
  if (r) { if (String(r.vendorId) !== G.vendor.id) throw new Error('bad_vendor');
    if (x.isNew) return vOne_(A, G.vendor.id);   // a new entry that was already saved (queue resent it): keep it as it is
    const old = {}; ['date', 'amount', 'gst', 'billNo', 'mode', 'ref', 'noteV', 'noteP', 'alloc', 'photos'].forEach(k => { if (String(r[k]) !== String(fields[k])) old[k] = r[k]; });
    if (Object.keys(old).length) { const h = vjson_(r.history, []); h.push({ at: now, by: by, act: 'edit', old: old }); r.history = JSON.stringify(h.slice(-20)).slice(0, 40000); }
    Object.assign(r, fields); r.editedAt = now; r.editedBy = by; }
  else { r = Object.assign({ id: str_(x.id, 40) || ('e' + Utilities.getUuid().replace(/-/g, '').slice(0, 14)), by: by, at: now, history: '[]' }, fields); }
  vwrite_(L.s, VLED_COLS, r); if (!r._r) r._r = L.s.getLastRow(); vSet_(A, r);
  if (type === 'bill' && x.useAdvance) vUseAdv_(A, G.vendor.id, String(r.id));
  vbump_(); return vOne_(A, G.vendor.id); }
function vRemove_(id, on, by) { const A = vAll_(), L = A.L; const r = L.rows.find(o => String(o.id) === String(id)); if (!r) throw new Error('no_entry');
  r.removed = on ? '1' : ''; const h = vjson_(r.history, []); h.push({ at: Date.now(), by: by, act: on ? 'remove' : 'restore' }); r.history = JSON.stringify(h.slice(-20)); vwrite_(L.s, VLED_COLS, r); vSet_(A, r);
  vbump_(); return vOne_(A, r.vendorId); }
/** Use the vendor's advance (unallocated payments, oldest first) against one bill. */
function vUseAdv_(A, vendorId, billId) { const G = vOne_(A, vendorId); const b = G.calc.bills.find(x => x.id === billId); if (!b || b.due <= 0) return;
  let need = b.due;
  G.entries.filter(e => !e.removed && e.type !== 'bill').forEach(e => { if (need <= 0) return;
    const used = Object.keys(e.alloc).reduce((s, k) => s + num_(e.alloc[k]), 0), free = Math.round((e.amount - used) * 100) / 100; if (free <= 0) return;
    const a = Math.min(free, need); const r = A.L.rows.find(o => String(o.id) === e.id); const al = vjson_(r.alloc, {}); al[billId] = Math.round(((num_(al[billId]) || 0) + a) * 100) / 100; r.alloc = JSON.stringify(al); vwrite_(A.L.s, VLED_COLS, r); vSet_(A, r); need -= a; }); }
function vUseAdvance_(vendorId, billId) { const A = vAll_(); vUseAdv_(A, vendorId, billId); vbump_(); return vOne_(A, vendorId); }
function vFolder_() { const key = 'VD_FOLDER_' + ENV_, p = PropertiesService.getScriptProperties(), id = p.getProperty(key);
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (err) {} }
  const name = VD_FOLDER_NAME + (ENV_ === 'test' ? ' (test)' : ''), it = DriveApp.getFoldersByName(name); const f = it.hasNext() ? it.next() : DriveApp.createFolder(name); p.setProperty(key, f.getId()); return f; }
function vUpload_(x) { const mime = /^(image\/jpeg|image\/png|application\/pdf)$/.test(String(x.mime)) ? String(x.mime) : 'image/jpeg';
  const data = String(x.data || ''); if (!data || data.length > 14000000) throw new Error('bad_file');
  let file; try { file = vFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(data), mime, str_(x.name, 80) || ('bill-' + Date.now() + (mime === 'application/pdf' ? '.pdf' : '.jpg')))); }
  catch (err) { if (/permission|authori|access/i.test(String(err && err.message || err))) throw new Error('drive_auth'); throw err; }
  const D = vtab_('VendorDocs', VDOC_COLS); vwrite_(D.s, VDOC_COLS, { fileId: file.getId(), vendorId: str_(x.vendorId, 40), preview: String(x.preview || '').slice(0, 48000), mime: mime, at: Date.now() });
  return { f: file.getId(), m: mime }; }
function vPreviews_(ids) { const want = {}; (ids || []).forEach(i => want[String(i)] = 1); const out = {};
  vtab_('VendorDocs', VDOC_COLS).rows.forEach(r => { if (want[r.fileId] && r.preview) out[r.fileId] = String(r.preview); }); return { previews: out }; }
function vFile_(f) { const file = DriveApp.getFileById(String(f)); const b = file.getBlob(); return { data: Utilities.base64Encode(b.getBytes()), mime: b.getContentType() }; }
/* ---- the vendor's own read-only page ---- */
function vPubFind_(t) { t = String(t || ''); if (!/^[tl][0-9a-f]{22}$/.test(t)) return null; ENV_ = t[0] === 't' ? 'test' : 'live';
  const V = vtab_('Vendors', VEND_COLS); const r = V.rows.find(o => String(o.token) === t && String(o.linkOn) === '1' && String(o.removed) !== '1'); return r || null; }
function vPub_(t) { const r = vPubFind_(t); if (!r) return { ok: false, error: 'link_off' }; const G = vGet_(r.id), cfg = readConfig_();
  const entries = G.entries.filter(e => !e.removed).map(e => { const o = vEntryOut_(Object.assign({}, e, { photos: JSON.stringify(e.photos), alloc: JSON.stringify(e.alloc), check: e.check ? JSON.stringify(e.check) : '' }), true); delete o.removed; return o; });
  return { ok: true, test: ENV_ === 'test', shop: { name: cfg.shopName || '', address: cfg.shopAddress || '', gstin: cfg.shopGstin || '' },
    vendor: { name: G.vendor.name, gstin: G.vendor.gstin, creditDays: G.vendor.creditDays, opening: G.vendor.opening, openingDate: G.vendor.openingDate }, entries, calc: G.calc, at: Date.now() }; }
function vPubFiles_(t) { const r = vPubFind_(t); if (!r) return null; const G = vGet_(r.id); const set = {}; G.entries.filter(e => !e.removed).forEach(e => e.photos.forEach(p => set[p.f] = 1)); return set; }
function vPubPrev_(t) { const set = vPubFiles_(t); if (!set) return { ok: false, error: 'link_off' }; return Object.assign({ ok: true }, vPreviews_(Object.keys(set))); }
function vPubFile_(t, f) { const set = vPubFiles_(t); if (!set || !set[String(f)]) return { ok: false, error: 'link_off' }; return Object.assign({ ok: true }, vFile_(f)); }
/** Run once from the Apps Script editor (choose it → Run → allow) so the script may save bill photos in Drive. */
function setupVendorDocs() { ['live', 'test'].forEach(en => { ENV_ = en; vFolder_(); }); ENV_ = 'live';
  try { UrlFetchApp.fetch('https://generativelanguage.googleapis.com/', { muteHttpExceptions: true }); } catch (e) {}   /* asks once for "connect to an external service" (bill reading) */
  Logger.log('Vendor bill photos folder is ready in your Google Drive: ' + VD_FOLDER_NAME); }

/* ======================= Bill reading + calculation check (Google Gemini) =======================
 * Owner pastes a Gemini API key (Settings → Bill reading; kept in script property GEMINI_KEY, never sent to phones).
 * vRead: read bill photos/PDFs (already in Drive) → extracted numbers (ex). vCheck: read + store on the entry.
 * vCheckCalc_ does the arithmetic (line qty × rate, sum, GST, total, entered amount) — the AI only reads, never judges.
 * These run outside the script lock (Gemini takes seconds); only the final write takes the lock. */
const AI_MODEL_DEFAULT = 'gemini-2.5-flash';
function aiKey_() { return PropertiesService.getScriptProperties().getProperty('GEMINI_KEY') || ''; }
const AI_SCHEMA = { type: 'OBJECT', properties: {
  readable: { type: 'BOOLEAN' }, confidence: { type: 'NUMBER' }, billNo: { type: 'STRING' }, date: { type: 'STRING' }, sellerName: { type: 'STRING' },
  lines: { type: 'ARRAY', items: { type: 'OBJECT', properties: { desc: { type: 'STRING' }, qty: { type: 'NUMBER' }, unit: { type: 'STRING' }, rate: { type: 'NUMBER' }, per: { type: 'NUMBER' },
    discPct: { type: 'NUMBER' }, discAmt: { type: 'NUMBER' }, amount: { type: 'NUMBER' }, unclear: { type: 'BOOLEAN' } } } },
  subtotal: { type: 'NUMBER' }, discount: { type: 'NUMBER' }, charges: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, amount: { type: 'NUMBER' } } } },
  taxes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, rate: { type: 'NUMBER' }, amount: { type: 'NUMBER' } } } },
  tcs: { type: 'NUMBER' }, roundOff: { type: 'NUMBER' }, total: { type: 'NUMBER' }, previousBalance: { type: 'NUMBER' }, netPayable: { type: 'NUMBER' } }, required: ['readable', 'confidence'] };
const AI_PROMPT = 'You read Indian purchase bills / tax invoices / kacha bills / estimates. They may be printed, thermal, PDF or handwritten, in English, Hindi or a mix, in any layout. ' +
  'Copy exactly what is WRITTEN. Never fix, recompute or guess any arithmetic: if a line says 25 x 185 = 4652, report amount 4652. Numbers as plain numbers (no commas, no currency). Leave out anything not written. ' +
  'lines: one per item row. qty = quantity, unit = its unit (kg, pcs, bag, box, dozen…), rate = the price written, per = how many units that rate is for when the bill says so (e.g. 100 for "per 100 pcs" or "/100"), otherwise leave per out. ' +
  'discPct / discAmt = a discount written on that line. amount = the line amount written. unclear = true if any number on that line is hard to read. Weights like "25 kg" are the qty. ' +
  'subtotal = total of the items before bill discount, charges and tax, if written. discount = bill-level discount (positive). charges = extra lines like freight, cartage, packing, loading, labour, hamali, transport. ' +
  'taxes = each tax line (CGST, SGST, IGST, GST, cess) with its rate in percent and amount. tcs = TCS amount. roundOff = round off written (negative if subtracted). ' +
  'total = the grand total of THIS bill. previousBalance = old balance / previous dues written on the bill, if any. netPayable = the final amount payable if the bill adds previous balance or subtracts amount paid. date as YYYY-MM-DD. ' +
  'readable = false if this is not a bill or the amounts cannot be read reliably. confidence = 0 to 1, how sure you are that every number you returned is read correctly.';
function aiCall_(parts) { const key = aiKey_(); if (!key) throw new Error('ai_off');
  const pref = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL');
  const models = (pref ? [pref] : []).concat(['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest']).filter((m, i, a) => a.indexOf(m) === i);
  let last = '', why = '';
  const gmsg = body => { try { const e = JSON.parse(body).error || {}; return String((e.status ? e.status + ': ' : '') + (e.message || '')).slice(0, 220); } catch (x) { return String(body || '').slice(0, 160); } };
  for (const m of models) {   /* each model has its own free quota: if one is used up or not offered to this key, try the next */
    const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(key), { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ contents: [{ role: 'user', parts: parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: AI_SCHEMA } }) });
    const code = res.getResponseCode(), body = res.getContentText();
    if (code === 400 && /API key not valid|API_KEY_INVALID/i.test(body)) throw new Error('ai_key');
    if (code === 403 && /API key|API_KEY|has not been used|is disabled|SERVICE_DISABLED|blocked/i.test(body)) throw new Error('ai_http|403|' + gmsg(body));
    if (code === 404 || code === 403) { last = last || 'ai_model'; why = why || code + ' ' + gmsg(body); continue; }
    if (code === 429) { last = 'ai_limit'; continue; }
    if (code !== 200) { last = 'ai_http|' + code + '|' + gmsg(body); continue; }
    const j = JSON.parse(body); const txt = (((j.candidates || [])[0] || {}).content || {}).parts; const s = txt && txt[0] && txt[0].text;
    if (!s) { last = 'ai_empty'; continue; } return JSON.parse(s); }
  if (last === 'ai_model') last = 'ai_http|' + why.replace(' ', '|');
  throw new Error(last || 'ai_fail'); }
/** Read the bill files (Drive ids) → normalised extraction. */
function vRead_(fileIds) { if (!aiKey_()) throw new Error('ai_off'); const parts = [{ text: AI_PROMPT }];
  (fileIds || []).slice(0, 6).forEach(f => { const b = DriveApp.getFileById(String(f)).getBlob(); const mime = b.getContentType();
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(mime)) return; parts.push({ inline_data: { mime_type: mime, data: Utilities.base64Encode(b.getBytes()) } }); });
  if (parts.length < 2) return { readable: false, confidence: 0 };
  return vExClean_(aiCall_(parts)); }
function vExClean_(x) { const n = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Math.round(Number(v) * 1000) / 1000;
  x = x || {}; return { readable: !!x.readable, confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0)), billNo: str_(x.billNo || '', 40), date: /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || '')) ? String(x.date) : '',
    seller: str_(x.sellerName || '', 80), lines: (Array.isArray(x.lines) ? x.lines : []).slice(0, 120).map(l => ({ d: str_(l.desc || '', 60), q: n(l.qty), un: str_(l.unit || '', 12), r: n(l.rate), per: n(l.per), dp: n(l.discPct), da: n(l.discAmt), a: n(l.amount), u: !!l.unclear })),
    sub: n(x.subtotal), disc: n(x.discount), charges: (Array.isArray(x.charges) ? x.charges : []).slice(0, 10).map(c => ({ n: str_(c.name || '', 30), a: n(c.amount) })),
    taxes: (Array.isArray(x.taxes) ? x.taxes : []).slice(0, 10).map(t => ({ n: str_(t.name || '', 20), r: n(t.rate), a: n(t.amount) })), tcs: n(x.tcs), ro: n(x.roundOff), total: n(x.total), prev: n(x.previousBalance), net: n(x.netPayable) }; }
/** The same reading sent back by the phone (already in the short form): re-check every field. */
function vExSafe_(e) { if (!e || typeof e !== 'object') return null;
  return vExClean_({ readable: e.readable, confidence: e.confidence, billNo: e.billNo, date: e.date, sellerName: e.seller, subtotal: e.sub, discount: e.disc, tcs: e.tcs, roundOff: e.ro, total: e.total, previousBalance: e.prev, netPayable: e.net,
    lines: (e.lines || []).map(l => ({ desc: l.d, qty: l.q, unit: l.un, rate: l.r, per: l.per, discPct: l.dp, discAmt: l.da, amount: l.a, unclear: l.u })), charges: (e.charges || []).map(c => ({ name: c.n, amount: c.a })), taxes: (e.taxes || []).map(t => ({ name: t.n, rate: t.r, amount: t.a })) }); }
/** The arithmetic (the AI only reads). Identical to vCheckJS in index.html; keep them the same. */
function vCheckCalc_(ex, entered) {
  if (!ex || !ex.readable || ex.confidence < 0.6 || ex.total == null) return { st: 'unread' };
  const r2 = v => Math.round(v * 100) / 100, near = (a, b, t) => Math.abs(a - b) <= t, tol = v => Math.max(1, Math.abs(v) * 0.002);
  const issues = [], done = [], all = ex.lines || [], lines = all.filter(l => !l.u);
  let nLine = 0;
  lines.forEach(l => { if (l.a == null || l.q == null || l.r == null) return; const per = l.per > 0 ? l.per : 1;
    let e = l.q * l.r / per; if (l.dp) e *= 1 - l.dp / 100; if (l.da) e -= l.da; e = r2(e); nLine++;
    if (near(e, l.a, tol(l.a))) return;
    /* other usual ways a line is written: rate per 10/100/1000/dozen, rate with GST included, amount before GST */
    const alts = [10, 100, 1000, 12].map(p => l.q * l.r / p).concat([5, 12, 18, 28].map(g => e * (1 + g / 100)), [5, 12, 18, 28].map(g => e / (1 + g / 100)));
    if (alts.some(x => near(r2(x), l.a, tol(l.a)))) return;
    issues.push({ t: 'line', i: all.indexOf(l) + 1, d: l.d, q: l.q, r: l.r, a: l.a, e: e }); });
  if (nLine) done.push('lines');
  const complete = all.length > 0 && all.every(l => l.a != null && !l.u);
  const sum = r2(all.reduce((s, l) => s + (l.a || 0), 0));
  if (complete && ex.sub != null) { done.push('sum'); if (!near(sum, ex.sub, 1)) issues.push({ t: 'sum', s: sum, sub: ex.sub }); }
  const base = ex.sub != null ? ex.sub : (complete ? sum : null);
  const disc = ex.disc || 0, chg = r2((ex.charges || []).reduce((s, c) => s + (c.a || 0), 0));
  const taxes = (ex.taxes || []).filter(x => x.a != null), T = r2(taxes.reduce((s, x) => s + x.a, 0)), tcs = ex.tcs || 0, ro = ex.ro || 0;
  if (base != null && taxes.length) {
    const rates = {}; taxes.forEach(x => { const k = /igst/i.test(x.n) ? 'i' : 'cs'; (rates[k] = rates[k] || new Set()).add(x.r); });
    const mixed = Object.values(rates).some(s => s.size > 1);   /* several GST rates on one bill: the split per rate isn't known, so only the totals are checked */
    if (!mixed) { const bases = [r2(base - disc), r2(base - disc + chg)];
      taxes.forEach(x => { if (!(x.r > 0)) return; const es = bases.map(b => r2(b * x.r / 100)); if (!es.some(e => near(e, x.a, tol(e)))) issues.push({ t: 'tax', n: x.n, r: x.r, b: bases[0], a: x.a, e: es[0] }); });
      done.push('tax'); } }
  const c = taxes.filter(x => /cgst/i.test(x.n)).reduce((s, x) => s + x.a, 0), sg = taxes.filter(x => /sgst|utgst/i.test(x.n)).reduce((s, x) => s + x.a, 0);
  if (c && sg) { if (!near(c, sg, 1)) issues.push({ t: 'cs', c: r2(c), s: r2(sg) }); if (done.indexOf('tax') < 0) done.push('tax'); }
  if (base != null) { done.push('total'); const b = base - disc;
    const ways = [b + chg + T + tcs + ro, b + T + tcs + ro, b + chg + tcs + ro, b + ro, b + chg + T + tcs, b + chg + T + tcs - ro].map(r2);   /* charges/GST already inside the subtotal, round-off sign */
    if (!ways.some(w => near(w, ex.total, 1.01))) issues.push({ t: 'total', e: ways[0], tot: ex.total }); }
  if (entered != null && !isNaN(entered)) { done.push('entry'); const en = Number(entered);
    if (!near(en, ex.total, 1)) { if (ex.prev && near(en, r2(ex.total + ex.prev), 1)) issues.push({ t: 'prev', ent: en, tot: ex.total, prev: ex.prev });
      else if (!(ex.net != null && near(en, ex.net, 1))) issues.push({ t: 'entry', ent: en, tot: ex.total }); } }
  const deep = done.some(d => d === 'lines' || d === 'sum' || d === 'total');
  return { st: issues.length ? 'issues' : deep ? 'ok' : 'basic', issues: issues, done: done, total: ex.total, tax: T || null, lines: nLine };
}
/** Read an entry's photos and store the check on it (outside the lock while Gemini works). */
function vCheck_(id, by) { let A = vAll_(); let e = A.entries.find(x => x.id === String(id)); if (!e) throw new Error('no_entry');
  const files = (e.photos || []).map(p => p.f); let ex = null, err = '';
  try { ex = files.length ? vRead_(files) : null; } catch (er) { err = String(er && er.message || er); if (err === 'ai_off') throw er; }
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { A = vAll_(); const r = A.L.rows.find(o => String(o.id) === String(id)); if (!r) throw new Error('no_entry');
    const chk = err ? { st: 'error', err: err } : vCheckCalc_(ex, num_(r.amount)); chk.at = Date.now(); chk.by = by;
    r.ex = ex ? JSON.stringify(ex).slice(0, 45000) : ''; r.check = JSON.stringify(chk); vwrite_(A.L.s, VLED_COLS, r); vSet_(A, r); vbump_(); return vOne_(A, r.vendorId); }
  finally { lock.releaseLock(); } }
function vAck_(id, on, by) { const A = vAll_(); const r = A.L.rows.find(o => String(o.id) === String(id)); if (!r) throw new Error('no_entry');
  const c = vjson_(r.check, {}); if (on) c.ack = { by: by, at: Date.now() }; else delete c.ack; r.check = JSON.stringify(c); vwrite_(A.L.s, VLED_COLS, r); vSet_(A, r); vbump_(); return vOne_(A, r.vendorId); }
function aiSetKey_(key) { key = String(key || '').trim(); const p = PropertiesService.getScriptProperties();
  if (!key) { p.deleteProperty('GEMINI_KEY'); bump_(); return { aiOn: false }; }
  const had = p.getProperty('GEMINI_KEY'); p.setProperty('GEMINI_KEY', key);
  try { aiCall_([{ text: 'This is a connection test, not a bill. Return readable false and confidence 0.' }]); }
  catch (e) { const m = String(e && e.message || e);
    if (m === 'ai_limit') { bump_(); return { aiOn: true, warn: 'ai_limit' }; }   /* key is fine, today's free quota is used up */
    if (had) p.setProperty('GEMINI_KEY', had); else p.deleteProperty('GEMINI_KEY');   /* don't keep a key that didn't work */
    /* Only Apps Script's own "no permission for UrlFetchApp" error means setupVendorDocs is needed; anything else goes back as it is. */
    if (/UrlFetchApp|script\.external_request|Required permissions/i.test(m)) throw new Error('ai_auth');
    throw new Error(/^ai_/.test(m) ? m : 'ai_http|0|' + m.slice(0, 220)); }
  bump_(); return { aiOn: true }; }
/** Run this in the Apps Script editor (choose testBillReading → Run) to see exactly what Google says about the saved key. */
function testBillReading() { const key = aiKey_(); if (!key) { Logger.log('No key saved yet. Paste it in the app: Settings → Bill reading.'); return; }
  ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest'].forEach(m => {
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(key), { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }] }) });
    Logger.log(m + ' → ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 400)); }); }
