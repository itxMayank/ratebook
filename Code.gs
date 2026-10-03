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
const BILL_COLS = ['billNo', 'date', 'customer', 'mobile', 'total', 'items', 'by', 'gstBill', 'taxable', 'tax', 'customerGstin', 'igst', 'text', 'lines', 'billId', 'editedAt', 'editedBy', 'edits', 'cost', 'profit', 'payment', 'paid', 'due', 'payments', 'clearedAt'];

const CUST_COLS = ['mobile', 'name', 'gstin', 'bills', 'total', 'lastDate', 'lastBillNo', 'due'];
const HISTORY_COLS = ['billId', 'billNo', 'changedAt', 'by', 'oldText'];
const COLS = ['id', 'name', 'nameHi', 'unit', 'buy', 'sell', 'thumb', 'imgV', 'updatedAt', 'updatedBy', 'hsn', 'gst', 'altUnit', 'altQty', 'altSell', 'imgs'];
const MAX_PHOTOS = 5;   // photos per item; each is its own cell in the Images tab (under 48,000 characters, below Google's 50,000 per cell)
const C = COLS.reduce((m, k, i) => (m[k] = i, m), {});
const MAX_FAILS = 8;           // wrong PIN tries allowed …
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
function bump_() { const v = String(Date.now()); PropertiesService.getScriptProperties().setProperty('rev', v); CacheService.getScriptCache().put('rev', v, 21600); }

/** Someone edited the sheet by hand: tell the apps to refresh. */
function onEdit(e) { try { bump_(); } catch (err) {} }

function hsn_(v) { const h = String(v == null ? '' : v).replace(/[^0-9A-Za-z]/g, '').slice(0, 10); return h; }
function gstOut_(v) { return v === '' || v === null || v === undefined ? null : num_(v); }
function num_(v) { const n = Number(String(v).replace(/[₹,\s]/g, '')); return isFinite(n) ? n : 0; }
function str_(v, max) { let s = String(v == null ? '' : v).slice(0, max || 200); if (/^[=+@]/.test(s)) s = "'" + s; return s; }

/* ---------- reads ---------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case 'rev': return out_({ ok: true, rev: getRev_() });
      case 'list': ensureEnv_(); return out_(list_());
      case 'thumbs': return out_(thumbs_(String(p.ids || '').split(',').filter(String)));
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
      imgs: num_(r[C.imgV]) ? (num_(r[C.imgs]) || 1) : 0
    });
  });
  if (fixed) bump_();
  return { ok: true, rev: getRev_(), items, config: readConfig_() };
}

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

function readConfig_() {
  const s = sheet_(CONFIG, ['key', 'value']);
  const n = s.getLastRow() - 1;
  const cfg = {};
  if (n > 0) s.getRange(2, 1, n, 2).getValues().forEach(r => { if (r[0]) cfg[String(r[0])] = r[1]; });
  if (cfg.units) { try { cfg.units = JSON.parse(cfg.units); } catch (err) { delete cfg.units; } }
  if (cfg.roundTo !== undefined && cfg.roundTo !== '') cfg.roundTo = Number(cfg.roundTo);
  cfg.nextBill = Math.max(1, Math.floor(num_(cfg.nextBill)) || 1);
  cfg.nextGstBill = Math.max(1, Math.floor(num_(cfg.nextGstBill)) || 1);
  cfg.testNextBill = Math.max(1, Math.floor(num_(cfg.testNextBill)) || 1);
  cfg.testNextGstBill = Math.max(1, Math.floor(num_(cfg.testNextGstBill)) || 1);
  cfg.mode = cfg.mode === 'live' ? 'live' : 'test';
  cfg.showProfit = cfg.showProfit === true || String(cfg.showProfit).toLowerCase() === 'true';
  cfg.defaultGst = (cfg.defaultGst === undefined || cfg.defaultGst === '') ? 18 : num_(cfg.defaultGst);
  cfg.defaultHsn = (cfg.defaultHsn === undefined || cfg.defaultHsn === '') ? '3923' : hsn_(cfg.defaultHsn);
  return cfg;
}

/* ---------- writes (need PIN) ---------- */

function doPost(e) {
  let body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return out_({ ok: false, error: 'bad_json' }); }
  try { ensureEnv_(); setEnv_(body.env); } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
  if (body.action === 'takeBill') return out_(takeBill_(body));   // anyone making a bill can do this, no PIN
  const auth = checkPin_(body.pin);
  if (auth !== 'ok') return out_({ ok: false, error: auth });
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const by = str_(body.by, 60);
    let res = {};
    switch (body.action) {
      case 'verify': break;
      case 'upsert': res = upsert_(body.items || [], by); break;
      case 'delete': res = delete_(body.ids || []); break;
      case 'setImage': res = setImage_(str_(body.id, 40), String(body.thumb || ''), String(body.full || ''), by); break;
      case 'setImages': res = setImages_(str_(body.id, 40), String(body.thumb || ''), body.photos, by); break;
      case 'setConfig': res = setConfig_(body.config || {}); break;
      case 'setPin': res = setPin_(String(body.newPin || '')); break;
      case 'listBills': res = listBills_(String(body.q || ''), Number(body.limit) || 50, { tz: body.tz, from: String(body.from || ''), to: String(body.to || ''), before: body.before }); break;
      case 'findCustomer': res = findCustomer_(String(body.mobile || '')); break;
      case 'getBill': res = getBill_(body.row, str_(body.id, 40), body.n); break;
      case 'updateBill': res = updateBill_(body.bill || {}, str_(body.by, 60)); break;
      case 'listDues': res = listDues_(); break;
      case 'recordPayment': res = recordPayment_(body, str_(body.by, 60)); break;
      case 'undoPayment': res = undoPayment_(body); break;
      default: return out_({ ok: false, error: 'bad_action' });
    }
    if (body.action !== 'verify' && body.action !== 'listBills' && body.action !== 'findCustomer' && body.action !== 'getBill' && body.action !== 'listDues') bump_();
    return out_(Object.assign({ ok: true, rev: getRev_() }, res));
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function checkPin_(pin) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fails') || 0);
  if (fails >= MAX_FAILS) return 'locked';
  const real = PropertiesService.getScriptProperties().getProperty('PIN') || String(DEFAULT_PIN);
  if (String(pin || '') === real) return 'ok';
  cache.put('fails', String(fails + 1), FAIL_WINDOW_SEC);
  return 'bad_pin';
}

function upsert_(items, by) {
  const { s, values } = rows_();
  const rowOf = {};
  values.forEach((r, i) => { if (r[C.id]) rowOf[String(r[C.id])] = i; });
  const now = Date.now();
  const saved = [];
  const appended = [];
  items.slice(0, 300).forEach(it => {
    if (!it || typeof it !== 'object') return;
    const id = it.id && rowOf[it.id] !== undefined ? String(it.id) : null;
    if (id) {
      const r = values[rowOf[id]];
      ['name', 'nameHi', 'unit'].forEach(k => { if (it[k] !== undefined) r[C[k]] = str_(it[k], k === 'unit' ? 30 : 200); });
      ['buy', 'sell'].forEach(k => { if (it[k] !== undefined && it[k] !== null) r[C[k]] = num_(it[k]); });
      if (it.hsn !== undefined) { const h = hsn_(it.hsn); r[C.hsn] = h ? "'" + h : ''; }
      if (it.gst !== undefined && it.gst !== null && it.gst !== '') r[C.gst] = num_(it.gst);
      if (it.altUnit !== undefined) r[C.altUnit] = str_(it.altUnit, 30);
      if (it.altQty !== undefined) r[C.altQty] = num_(it.altQty) || '';
      if (it.altSell !== undefined) r[C.altSell] = (it.altSell === null || it.altSell === '') ? '' : num_(it.altSell);
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
      r[C.updatedAt] = now; r[C.updatedBy] = by;
      appended.push(r); saved.push(pub_(r, it.tmp));
    }
  });
  if (appended.length) s.getRange(s.getLastRow() + 1, 1, appended.length, COLS.length).setValues(appended);
  return { items: saved };
}

function pub_(r, tmp) {
  return { id: String(r[C.id]), tmp: tmp || null, name: str_(r[C.name]), nameHi: str_(r[C.nameHi]), unit: str_(r[C.unit], 30),
    buy: num_(r[C.buy]), sell: num_(r[C.sell]), imgV: r[C.thumb] ? (num_(r[C.imgV]) || 1) : 0, updatedAt: num_(r[C.updatedAt]), updatedBy: str_(r[C.updatedBy], 60),
    hsn: hsn_(r[C.hsn]), gst: gstOut_(r[C.gst]),
    altUnit: str_(r[C.altUnit], 30), altQty: num_(r[C.altQty]) || 0, altSell: gstOut_(r[C.altSell]),
    imgs: num_(r[C.imgV]) ? (num_(r[C.imgs]) || 1) : 0 };
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

function setConfig_(cfg) {
  const s = sheet_(CONFIG, ['key', 'value']);
  const allowed = { shopName: 1, units: 1, defaultUnit: 1, roundTo: 1, billFooter: 1, nextBill: 1, nextGstBill: 1, testNextBill: 1, testNextGstBill: 1, mode: 1, showProfit: 1, shopGstin: 1, shopAddress: 1, defaultGst: 1, defaultHsn: 1 };
  const n = s.getLastRow() - 1;
  const keys = n > 0 ? s.getRange(2, 1, n, 1).getValues().map(r => String(r[0])) : [];
  Object.keys(cfg).forEach(k => {
    if (!allowed[k]) return;
    let val = k === 'units' ? JSON.stringify(cfg[k]).slice(0, 5000) : str_(cfg[k], 300);
    if (k === 'showProfit') val = cfg[k] === true || cfg[k] === 'true' ? 'true' : 'false';
    if (k === 'mode') val = cfg[k] === 'live' ? 'live' : 'test';
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
    const used = Math.floor(num_(body.n));
    let key = (body.bill && body.bill.gst) ? 'nextGstBill' : 'nextBill';   // GST and normal bills have separate numbers
    if (ENV_ === 'test') key = key === 'nextBill' ? 'testNextBill' : 'testNextGstBill';      // and test mode has its own
    const cur = readConfig_()[key];
    const next = used >= cur ? used + 1 : cur;
    if (next !== cur) { const o = {}; o[key] = next; setConfig_(o); }
    const b = body.bill || {};
    if (used > 0) {
      try { if (mob10_(b.mobile)) customersSheet_(); } catch (err) {}   // build the Customers tab before this bill lands, so it isn't counted twice
      sheet_(tab_('Bills'), BILL_COLS).appendRow([used, new Date(), str_(b.customer, 80), str_(b.mobile, 20), num_(b.total), str_(b.items, 3000), str_(body.by, 60),
        b.gst ? 'Yes' : 'No', b.gst ? num_(b.taxable) : '', b.gst ? num_(b.tax) : '', str_(b.custGstin, 20), b.gst ? (b.igst ? 'IGST' : 'CGST+SGST') : '',
        (function (t) { return /^[=+@-]/.test(t) ? "'" + t : t; })(String(b.text || '').slice(0, 45000)), JSON.stringify(Array.isArray(b.lines) ? b.lines.slice(0, 200) : []).slice(0, 45000),
        str_(b.id, 40), '', '', 0, costOut_(b.cost), costOut_(b.profit)].concat(payRow_(payCalc_(b.total, b.pay, b.received, [], str_(body.by, 60)))));
      try { touchCustomer_(b.mobile, b.customer, b.custGstin, b.total, used, true); } catch (err) {}
      try { refreshDue_(b.mobile); } catch (err) {}
    }
    bump_();
    return { ok: true, rev: getRev_(), config: readConfig_() };
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
  const max = Math.min(limit, 200);
  const out = [], days = {}, months = {}, years = {}, all = { count: 0, total: 0 };
  let more = false;
  for (let i = n - 1; i >= 0; i--) {
    const r = a[i].concat(['', ''], b[i]);
    if (r[B.billNo] === '' && r[B.total] === '') continue;
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
    if (!days[k]) days[k] = { count: 0, total: 0 };
    days[k].count += 1; days[k].total = Math.round((days[k].total + num_(r[B.total])) * 100) / 100;
    const mk = k.slice(0, 7);
    if (!months[mk]) months[mk] = { count: 0, total: 0 };
    months[mk].count += 1; months[mk].total = Math.round((months[mk].total + num_(r[B.total])) * 100) / 100;
    all.count += 1; all.total = Math.round((all.total + num_(r[B.total])) * 100) / 100;
    if (before && i + 2 >= before) continue;
    if (out.length >= max) { more = true; continue; }
    out.push({ n: num_(r[B.billNo]), date: isNaN(d) ? '' : d.toISOString(), day: k, customer: String(r[B.customer] || ''), mobile: String(r[B.mobile] || ''),
      total: num_(r[B.total]), items: String(r[B.items] || ''), by: String(r[B.by] || ''), gst: r[B.gstBill] === 'Yes',
      taxable: r[B.taxable] === '' ? null : num_(r[B.taxable]), tax: r[B.tax] === '' ? null : num_(r[B.tax]), custGstin: String(r[B.customerGstin] || ''),
      igst: r[B.igst] === 'IGST',
      id: String(r[B.billId] || ''), row: i + 2, editedAt: r[B.editedAt] instanceof Date ? r[B.editedAt].toISOString() : (r[B.editedAt] ? String(r[B.editedAt]) : ''),
      editedBy: String(r[B.editedBy] || ''), edits: num_(r[B.edits]),
      cost: r[B.cost] === '' ? null : num_(r[B.cost]), profit: r[B.profit] === '' ? null : num_(r[B.profit]), ...payOut_(r, B) });
  }
  const shown = {}, shownM = {}; out.forEach(x => { shown[x.day] = days[x.day]; shownM[x.day.slice(0, 7)] = months[x.day.slice(0, 7)]; });
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
  return { bill: { text: String(r[B.text] || ''), lines: lines } };
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** Change a saved bill. Keeps the original date and number, records who edited it and when, and keeps the old text in BillHistory. */
function updateBill_(b, by) {
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
  sheet_(tab_('BillHistory'), HISTORY_COLS).appendRow([String(r[B.billId] || ''), r[B.billNo], new Date(), by, String(r[B.text] || r[B.items] || '').slice(0, 45000)]);
  const safe = t => /^[=+@-]/.test(t) ? "'" + t : t;
  r[B.customer] = str_(b.customer, 80); r[B.mobile] = str_(b.mobile, 20); r[B.total] = num_(b.total);
  r[B.items] = str_(b.items, 3000); r[B.gstBill] = b.gst ? 'Yes' : 'No';
  r[B.taxable] = b.gst ? num_(b.taxable) : ''; r[B.tax] = b.gst ? num_(b.tax) : '';
  r[B.customerGstin] = str_(b.custGstin, 20); r[B.igst] = b.gst ? (b.igst ? 'IGST' : 'CGST+SGST') : '';
  r[B.text] = safe(String(b.text || '').slice(0, 45000));
  r[B.lines] = JSON.stringify(Array.isArray(b.lines) ? b.lines.slice(0, 200) : []).slice(0, 45000);
  if (!r[B.billId]) r[B.billId] = str_(b.id || Utilities.getUuid().replace(/-/g, '').slice(0, 16), 40);
  r[B.cost] = costOut_(b.cost); r[B.profit] = costOut_(b.profit);
  r[B.editedAt] = new Date(); r[B.editedBy] = by; r[B.edits] = num_(r[B.edits]) + 1;
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
  return { bill: { id: String(r[B.billId]), n: num_(r[B.billNo]), editedAt: r[B.editedAt].toISOString(), edits: r[B.edits] } };
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
  const a = s.getRange(2, 1, n, B.total + 1).getValues();                                        // billNo … total
  const b = s.getRange(2, B.billId + 1, n, BILL_COLS.length - B.billId).getValues();             // billId … clearedAt
  const map = {}, list = [];
  let total = 0, count = 0;
  for (let i = 0; i < n; i++) {
    const r = a[i].concat(new Array(B.billId - B.total - 1).fill(''), b[i]);
    const st = String(r[B.payment] || '');
    if (st !== 'Credit' && st !== 'Part paid') continue;
    const due = num_(r[B.due]); if (!(due > 0)) continue;
    const k = mob10_(r[B.mobile]) || ('name:' + String(r[B.customer]).trim().toLowerCase());
    if (!map[k]) { map[k] = { mobile: mob10_(r[B.mobile]), name: '', due: 0, bills: [] }; list.push(map[k]); }
    const c = map[k];
    if (String(r[B.customer]).trim()) c.name = String(r[B.customer]).trim();
    const d = r[B.date] instanceof Date ? r[B.date] : new Date(r[B.date]);
    c.due = r2_(c.due + due); total = r2_(total + due); count++;
    c.bills.push({ row: i + 2, id: String(r[B.billId] || ''), n: num_(r[B.billNo]), date: isNaN(d) ? '' : d.toISOString(), total: num_(r[B.total]), paid: num_(r[B.paid]), due: due, pay: st, payments: payList_(r[B.payments]) });
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
    for (let i = 0; i < n; i++) if (mob10_(vals[i][B.mobile]) === want && num_(vals[i][B.due]) > 0 && (vals[i][B.payment] === 'Credit' || vals[i][B.payment] === 'Part paid')) targets.push(i);
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
    for (let i = 0; i < n; i++) if (mob10_(mobs[i][0]) === k && (pd[i][0] === 'Credit' || pd[i][0] === 'Part paid')) due += num_(pd[i][2]);
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
