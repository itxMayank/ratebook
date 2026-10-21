/* ---------- reads ---------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  T0_ = Date.now(); ACT_ = String(p.action || ''); RC_HIT_ = false;
  try {
    switch (p.action) {
      case 'health': return out_(health_(p.key, p.full === '1'));
      case 'insights': return out_(insightsKey_(p));   // the admin dashboard (through the Directory), with this shop's health key
      case 'ping': return out_({ ok: true, shop: shopCode_(), sv: SCRIPT_VERSION });
      case 'retire': return out_(retire_(p.key, p.code));
      case 'rev': return out_({ ok: true, rev: getRev_(), bl: brevC_('live'), bt: brevC_('test'), vl: vrevC_('live'), vt: vrevC_('test'), nl: nrevC_('live'), nt: nrevC_('test'), nb: nbGet_(), sv: SCRIPT_VERSION });
      case 'list': { const c = listCached_().config || {};   /* the price list needs a signed-in phone (POST list, since v44); only the units, which the Directory copies into a new shop */
        return out_({ ok: false, error: 'need_signin', config: { units: c.units, defaultUnit: c.defaultUnit, defaultHsn: c.defaultHsn }, sv: SCRIPT_VERSION, shop: shopCode_() }); }
      case 'thumbs': case 'image': case 'images': return out_({ ok: false, error: 'need_signin' });   // photos: POST with a sign-in since v44
      case 'vpub': return out_(vPub_(p.t));
      case 'vpubprev': return out_(vPubPrev_(p.t));
      case 'vpubfile': return out_(vPubFile_(p.t, p.f));
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

/** The price list from the reply cache. Key: price/settings version + both bills versions (bill numbers live in Config and the
    most-sold order follows bills), so any price change, setting change or bill makes the next read fresh. */
function listCached_() { return rcRead_('list', () => getRev_() + ':' + brevC_('live') + ':' + brevC_('test'), list_); }
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
  let pop = {}; try { pop = pop_(); } catch (err) { softErr_('pop', err); }
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
  const n = s.getLastRow() - 1, keep = ENV_; ENV_ = 'live'; const arc = arcList_(); ENV_ = keep;
  if (n < 1 && !arc.length) return {};
  const cache = CacheService.getScriptCache(), key = 'pop:' + n + (arc.length ? ':' + arc.join(',') : '');
  const hit = cache.get(key); if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const width = s.getLastColumn();
  const lines = n > 0 ? s.getRange(2, B.lines + 1, n, 1).getValues() : [];
  const status = n > 0 && width > B.status ? s.getRange(2, B.status + 1, n, 1).getValues() : null;
  const pop = {};
  if (arc.length) { ENV_ = 'live'; try { const S2 = arcSums_(); arc.forEach(fy => { const it = (S2[fy] || {}).items || {}; Object.keys(it).forEach(id => { pop[id] = (pop[id] || 0) + num_(it[id]); }); }); } finally { ENV_ = keep; } }   // (v67) archived years count from their summary
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
  } catch (err) { softErr_('stripFyPrefix', err); } finally { ENV_ = keep; }
}

function popReset_() { try { const b = ss_().getSheetByName('Bills'), keep = ENV_; ENV_ = 'live'; const arc = arcList_(); ENV_ = keep; if (b) CacheService.getScriptCache().remove('pop:' + (b.getLastRow() - 1) + (arc.length ? ':' + arc.join(',') : '')); } catch (e) {} }

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
        const rows = oldCust.getRange(2, 1, n, 3).getValues().filter(r => String(r[0]).replace(/\D/g, '')).map(r => CPAD_(["'" + String(r[0]).replace(/\D/g, '').slice(-10), r[1], r[2], 0, 0, '', '', 0]));
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
  arcRows_('', '').concat(n > 0 ? bs.getRange(2, 1, n, BILL_COLS.length).getValues() : []).forEach(r => {   // (v67) archived years count too, oldest first
    const g = String(r[B.customerGstin] || '').trim().toUpperCase(), k = mob10_(r[B.mobile]) || (g ? 'g:' + g : ''); if (!k) return;   // no mobile: counted by GSTIN (v55)
    if (r[B.status] === 'Cancelled') return;
    const x = stat[k] || (stat[k] = { bills: 0, total: 0, last: '', lastNo: '', due: 0 });
    x.bills++; x.total = r2_(x.total + num_(r[B.total])); x.last = r[B.date]; x.lastNo = r[B.billNo];
    if (r[B.payment] === 'Credit' || r[B.payment] === 'Part paid') x.due = r2_(x.due + num_(r[B.due]));
  });
  const m = cs.getLastRow() - 1;
  if (m < 1) return;
  const gUsed = {};
  const rows = cs.getRange(2, 1, m, CUST_COLS.length).getValues().map(r => {
    const m0 = mob10_(r[0]), g0 = String(r[2] || '').trim().toUpperCase(), gk = g0 && !gUsed[g0] ? (gUsed[g0] = 1, 'g:' + g0) : '';   // a company's bills made without a mobile count by its GSTIN (once)
    const xs = [stat[m0], stat[gk]].filter(Boolean), x = xs.length ? xs.reduce((a, b) => ({ bills: a.bills + b.bills, total: r2_(a.total + b.total), last: !a.last || (b.last && new Date(b.last) > new Date(a.last)) ? b.last : a.last, lastNo: !a.last || (b.last && new Date(b.last) > new Date(a.last)) ? b.lastNo : a.lastNo, due: r2_(a.due + b.due) }), { bills: 0, total: 0, last: '', lastNo: '', due: 0 }) : { bills: 0, total: 0, last: '', lastNo: '', due: 0 };
    return CPAD_([mob10_(r[0]) ? "'" + mob10_(r[0]) : r[0], r[1], r[2], x.bills, x.total, x.last, x.lastNo, x.due].concat(r.slice(8)));   // keeps address/note
  });
  cs.getRange(2, 1, m, CUST_COLS.length).setValues(rows);
}

