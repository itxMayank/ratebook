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
const BILLS = 'Bills';
const BILL_COLS = ['billNo', 'date', 'customer', 'mobile', 'total', 'items', 'by'];
const COLS = ['id', 'name', 'nameHi', 'unit', 'buy', 'sell', 'thumb', 'imgV', 'updatedAt', 'updatedBy'];
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
  sheet_(BILLS, BILL_COLS);
  bump_();
  Logger.log('Rate Book is ready. Now deploy it as a web app.');
}

function ss_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  let ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (err) {}
  if (!ss) ss = SpreadsheetApp.create('Rate Book prices');   // script made at script.google.com: make its own sheet
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function sheet_(name, headers) {
  const ss = ss_();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getRev_() { return PropertiesService.getScriptProperties().getProperty('rev') || '0'; }
function bump_() { PropertiesService.getScriptProperties().setProperty('rev', String(Date.now())); }

/** Someone edited the sheet by hand: tell the apps to refresh. */
function onEdit(e) { try { bump_(); } catch (err) {} }

function num_(v) { const n = Number(String(v).replace(/[₹,\s]/g, '')); return isFinite(n) ? n : 0; }
function str_(v, max) { let s = String(v == null ? '' : v).slice(0, max || 200); if (/^[=+@]/.test(s)) s = "'" + s; return s; }

/* ---------- reads ---------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case 'rev': return out_({ ok: true, rev: getRev_() });
      case 'list': return out_(list_());
      case 'thumbs': return out_(thumbs_(String(p.ids || '').split(',').filter(String)));
      case 'image': return out_(image_(String(p.id || '')));
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

function list_() {
  const { s, values } = rows_();
  const items = [];
  let fixed = false;
  values.forEach((r, i) => {
    if (!String(r[C.name]).trim()) return;
    if (!r[C.id]) { r[C.id] = Utilities.getUuid().replace(/-/g, '').slice(0, 16); s.getRange(i + 2, C.id + 1).setValue(r[C.id]); fixed = true; }
    items.push({
      id: String(r[C.id]), name: str_(r[C.name]), nameHi: str_(r[C.nameHi]), unit: str_(r[C.unit], 30),
      buy: num_(r[C.buy]), sell: num_(r[C.sell]),
      imgV: r[C.thumb] ? (num_(r[C.imgV]) || 1) : 0,
      updatedAt: num_(r[C.updatedAt]), updatedBy: str_(r[C.updatedBy], 60)
    });
  });
  if (fixed) bump_();
  return { ok: true, rev: getRev_(), items, config: readConfig_() };
}

function thumbs_(ids) {
  const want = {}; ids.slice(0, 60).forEach(id => want[id] = 1);
  const { values } = rows_();
  const res = [];
  values.forEach(r => { if (want[r[C.id]]) res.push({ id: String(r[C.id]), thumb: String(r[C.thumb] || ''), imgV: num_(r[C.imgV]) || 1 }); });
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

function readConfig_() {
  const s = sheet_(CONFIG, ['key', 'value']);
  const n = s.getLastRow() - 1;
  const cfg = {};
  if (n > 0) s.getRange(2, 1, n, 2).getValues().forEach(r => { if (r[0]) cfg[String(r[0])] = r[1]; });
  if (cfg.units) { try { cfg.units = JSON.parse(cfg.units); } catch (err) { delete cfg.units; } }
  if (cfg.roundTo !== undefined && cfg.roundTo !== '') cfg.roundTo = Number(cfg.roundTo);
  cfg.nextBill = Math.max(1, Math.floor(num_(cfg.nextBill)) || 1);
  return cfg;
}

/* ---------- writes (need PIN) ---------- */

function doPost(e) {
  let body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return out_({ ok: false, error: 'bad_json' }); }
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
      case 'setConfig': res = setConfig_(body.config || {}); break;
      case 'setPin': res = setPin_(String(body.newPin || '')); break;
      default: return out_({ ok: false, error: 'bad_action' });
    }
    if (body.action !== 'verify') bump_();
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
      r[C.updatedAt] = now; r[C.updatedBy] = by;
      s.getRange(rowOf[id] + 2, 1, 1, COLS.length).setValues([r]);
      saved.push(pub_(r, it.tmp));
    } else {
      if (!str_(it.name).trim()) return;
      const r = new Array(COLS.length).fill('');
      r[C.id] = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
      r[C.name] = str_(it.name).trim(); r[C.nameHi] = str_(it.nameHi); r[C.unit] = str_(it.unit, 30);
      r[C.buy] = num_(it.buy); r[C.sell] = num_(it.sell); r[C.imgV] = 0;
      r[C.updatedAt] = now; r[C.updatedBy] = by;
      appended.push(r); saved.push(pub_(r, it.tmp));
    }
  });
  if (appended.length) s.getRange(s.getLastRow() + 1, 1, appended.length, COLS.length).setValues(appended);
  return { items: saved };
}

function pub_(r, tmp) {
  return { id: String(r[C.id]), tmp: tmp || null, name: str_(r[C.name]), nameHi: str_(r[C.nameHi]), unit: str_(r[C.unit], 30),
    buy: num_(r[C.buy]), sell: num_(r[C.sell]), imgV: r[C.thumb] ? (num_(r[C.imgV]) || 1) : 0, updatedAt: num_(r[C.updatedAt]), updatedBy: str_(r[C.updatedBy], 60) };
}

function delete_(ids) {
  const want = {}; ids.forEach(id => want[String(id)] = 1);
  const { s, values } = rows_();
  for (let i = values.length - 1; i >= 0; i--) if (want[values[i][C.id]]) s.deleteRow(i + 2);
  const im = sheet_(IMAGES, ['id', 'data']);
  const n = im.getLastRow() - 1;
  if (n > 0) { const v = im.getRange(2, 1, n, 1).getValues(); for (let i = v.length - 1; i >= 0; i--) if (want[v[i][0]]) im.deleteRow(i + 2); }
  return { deleted: Object.keys(want).length };
}

function setImage_(id, thumb, full, by) {
  if (thumb.length > 20000 || full.length > 48000) throw new Error('image_too_large');
  const { s, values } = rows_();
  const i = values.findIndex(r => String(r[C.id]) === id);
  if (i < 0) throw new Error('not_found');
  const v = thumb ? Date.now() : 0;
  s.getRange(i + 2, C.thumb + 1).setValue(thumb);
  s.getRange(i + 2, C.imgV + 1).setValue(v);
  s.getRange(i + 2, C.updatedAt + 1, 1, 2).setValues([[Date.now(), by]]);
  const im = sheet_(IMAGES, ['id', 'data']);
  const n = im.getLastRow() - 1;
  let row = -1;
  if (n > 0) { const ids = im.getRange(2, 1, n, 1).getValues(); row = ids.findIndex(r => String(r[0]) === id); }
  if (full) { if (row >= 0) im.getRange(row + 2, 2).setValue(full); else im.appendRow([id, full]); }
  else if (row >= 0) im.deleteRow(row + 2);
  return { imgV: v };
}

function setConfig_(cfg) {
  const s = sheet_(CONFIG, ['key', 'value']);
  const allowed = { shopName: 1, units: 1, defaultUnit: 1, roundTo: 1, billFooter: 1, nextBill: 1 };
  const n = s.getLastRow() - 1;
  const keys = n > 0 ? s.getRange(2, 1, n, 1).getValues().map(r => String(r[0])) : [];
  Object.keys(cfg).forEach(k => {
    if (!allowed[k]) return;
    let val = k === 'units' ? JSON.stringify(cfg[k]).slice(0, 5000) : str_(cfg[k], 300);
    if (k === 'nextBill') val = Math.max(1, Math.floor(num_(cfg[k])) || 1);
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
    const cur = readConfig_().nextBill;
    const next = used >= cur ? used + 1 : cur;
    if (next !== cur) setConfig_({ nextBill: next });
    const b = body.bill || {};
    if (used > 0) {
      sheet_(BILLS, BILL_COLS).appendRow([used, new Date(), str_(b.customer, 80), str_(b.mobile, 20), num_(b.total), str_(b.items, 3000), str_(body.by, 60)]);
    }
    bump_();
    return { ok: true, rev: getRev_(), config: readConfig_() };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}
