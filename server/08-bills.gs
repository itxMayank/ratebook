/* ---------- financial year (April–March, India) ---------- */
function fy_(d) {
  const s = Utilities.formatDate(d || new Date(), BK_TZ, 'yyyy-MM');
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return start + '-' + String(start + 1).slice(2);
}

function upsert_(items, by, src) {
  const { s, values } = rows_(); const plog = [];
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
      const was = { buy: r[C.buy], sell: r[C.sell], altSell: r[C.altSell] };
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
      ['buy', 'sell', 'altSell'].forEach(f => phPush_(plog, now, r, f, was[f], r[C[f]], by, src));
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
      ['buy', 'sell', 'altSell'].forEach(f => phPush_(plog, now, r, f, '', r[C[f]], by, src || 'new'));
    }
  });
  if (appended.length) s.getRange(s.getLastRow() + 1, 1, appended.length, COLS.length).setValues(appended);
  phWrite_(plog);
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
  const allowed = { shopName: 1, units: 1, defaultUnit: 1, roundTo: 1, billFooter: 1, nextBill: 1, nextGstBill: 1, testNextBill: 1, testNextGstBill: 1, mode: 1, showProfit: 1, fyReset: 1, gstFy: 1, testGstFy: 1, shopState: 1, bizType: 1, shopGstin: 1, shopAddress: 1, defaultGst: 1, defaultHsn: 1, approveNew: 1 , buyView: 1, lowMargin: 1 };
  const n = s.getLastRow() - 1;
  const keys = n > 0 ? s.getRange(2, 1, n, 1).getValues().map(r => String(r[0])) : [];
  Object.keys(cfg).forEach(k => {
    if (!allowed[k]) return;
    let val = k === 'units' ? JSON.stringify(cfg[k]).slice(0, 5000) : str_(cfg[k], 300);
    if (k === 'showProfit' || k === 'approveNew') val = cfg[k] === true || cfg[k] === 'true' ? 'true' : 'false';
    if (k === 'mode') val = cfg[k] === 'live' ? 'live' : 'test';
    if (k === 'fyReset') val = cfg[k] === false || cfg[k] === 'false' ? 'false' : 'true';
    if (k === 'nextBill' || k === 'nextGstBill' || k === 'testNextBill' || k === 'testNextGstBill') val = Math.max(1, Math.floor(num_(cfg[k])) || 1);
    if (k === 'defaultGst') val = Math.max(0, Math.min(100, num_(cfg[k])));
    if (k === 'buyView') val = BUYV_[cfg[k]] ? String(cfg[k]) : 'manager';
    if (k === 'lowMargin') val = Math.max(0, Math.min(100, num_(cfg[k])));
    if (k === 'defaultHsn') { const h = hsn_(cfg[k]); val = h ? "'" + h : ''; }
    const i = keys.indexOf(k);
    if (i >= 0) s.getRange(i + 2, 2).setValue(val); else { s.appendRow([k, val]); keys.push(k); }
  });
  const c = readConfig_(); nbPut_(c); return { config: c };
}

function setPin_(p) {
  if (shopPinOff_()) throw new Error('shop_pin_off');
  pinRule_(p, 'owner');
  const h = hashPin_(p); if (users_().some(u => u.h === h)) throw new Error('pin_taken');   // (v51) never the same as someone's own PIN
  const P = PropertiesService.getScriptProperties(); P.setProperty('PINH', hashPin_(p)); P.deleteProperty('PIN');   // kept only as a digest
  return {};
}

/** A bill was shared or marked done: record it and move the bill number on. */
/** (v68) When a bill was made, from the phone's madeAt (ms): taken if within the last 7 days, never later than now; else now. */
function madeAt_(v) {
  const now = Date.now(), t = Number(v);
  if (!(t > 0) || t < now - 7 * 864e5) return new Date();
  return new Date(Math.min(t, now));
}
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
    { const bb = body.bill || {};   /* (v64) checks a phone already makes, here too (an older or tampered copy) */
      if (!totalOk_(bb.total)) return { ok: false, error: 'bad_total' };
      if ((bb.pay === 'credit' || bb.pay === 'part') && !mob10_(bb.mobile)) return { ok: false, error: 'credit_needs_mobile' };
      if (body.buyOk === false) fillBuy_(bb, null);   // (v65) made by someone who can't see buy rates: the sheet adds them
      const bad = billSums_(bb); if (bad) return { ok: false, error: bad.error, line: bad.line, expect: bad.expect };
      const badT = billTextCheck_(bb, used > 0 ? used : 0); if (badT) return { ok: false, error: badT.error, what: badT.what, line: badT.line }; }   // (v67) the text shows this bill's number, items and total
    let key = isGst ? 'nextGstBill' : 'nextBill';   // GST and normal bills have separate numbers
    if (ENV_ === 'test') key = key === 'nextBill' ? 'testNextBill' : 'testNextGstBill';      // and test mode has its own
    /* (v68) The bill's own date: a bill made offline is sent later (next morning, or after 31 March). The phone sends when it was
       made (madeAt); up to 7 days back is taken (never later than now), so day totals and the financial year are the bill's own. */
    const billDate = madeAt_(body.bill && body.bill.madeAt);
    const cfg0 = readConfig_(), fyToday = fy_(new Date()), fyNow = fy_(billDate);
    let cur = cfg0[key];
    const fyKey = ENV_ === 'test' ? 'testGstFy' : 'gstFy';
    let fyNew = false;
    /* (v68) a GST bill from last financial year arriving after the new year's series started: its number belongs to last year's
       series, so the counter (now the new year's) is neither reset nor moved by it */
    const lateFy = isGst && cfg0.fyReset && fyNow !== fyToday && cfg0[fyKey] && cfg0[fyKey] !== fyNow;
    if (isGst && cfg0.fyReset && cfg0[fyKey] !== fyNow && fyNow === fyToday) {
      if (!cfg0[fyKey]) { const o = {}; o[fyKey] = fyNow; setConfig_(o); }                  // first run: just note the current year
      else { cur = 1; fyNew = true; const o = {}; o[key] = 1; o[fyKey] = fyNow; setConfig_(o); }          // new financial year: GST invoices start again from 1
    }
    // Two phones (or a hand-typed number) can pick a number that's already used in this series: give the next free one
    let renumbered = null;
    cur = Math.max(1, Math.floor(num_(cur)) || 1);
    /* (v64) no number (blank or 0): before, such a bill was quietly not saved while the phone was told it was. It takes the next one. */
    if (!(used > 0)) { renumbered = { from: used || 0, to: cur }; used = cur; }
    /* (v64) a typo with extra digits (17760 for 1776) would move the series on for good (GST invoice numbers must run on). A jump of
       up to 1,000 (a new bill book) is fine; the phone asks first from 50 up. */
    else if (used > cur + 1000 && !fyNew && !lateFy) return { ok: false, error: 'bill_no_jump', next: cur };
    if (used > 0) {
      const bs = sheet_(tab_('Bills'), BILL_COLS), bn0 = bs.getLastRow() - 1;
      /* (v60) the usual case, the next number or above: only bills made lately can hold it, so read the last 600 rows instead of
         the whole tab (3 columns of every bill ever made, on every bill). A number typed below the next one still checks them all. */
      const from = used >= cur && !lateFy ? Math.max(0, bn0 - 600) : 0, bn = bn0 - from;
      if (bn > 0) {
        const BI = BILL_COLS.reduce((m, k2, i2) => (m[k2] = i2, m), {});
        const nos = bs.getRange(2 + from, 1, bn, 2).getValues(), gcol = bs.getRange(2 + from, BI.gstBill + 1, bn, 1).getValues(), fcol = bs.getRange(2 + from, BI.fy + 1, bn, 1).getValues();
        const taken = {};
        for (let i = 0; i < bn; i++) {
          if ((gcol[i][0] === 'Yes') !== isGst) continue;
          if (isGst && cfg0.fyReset && (String(fcol[i][0] || '') || fy_(nos[i][1] instanceof Date ? nos[i][1] : new Date(nos[i][1]))) !== fyNow) continue;
          taken[num_(nos[i][0])] = 1;
        }
        /* (v67) a number typed below the next one may belong to an archived bill too (GST numbers that restart each April can't) */
        if (!from && !(isGst && cfg0.fyReset)) arcSheets_('', '').forEach(x => { const an = x.s.getLastRow() - 1, ar = x.s.getRange(2, 1, an, 1).getValues(), ag = x.s.getRange(2, BI.gstBill + 1, an, 1).getValues();
          for (let i = 0; i < an; i++) if ((ag[i][0] === 'Yes') === isGst) taken[num_(ar[i][0])] = 1; });
        if (taken[used]) {
          let nn = lateFy ? used + 1 : Math.max(cur, used + 1); while (taken[nn]) nn++;
          renumbered = { from: used, to: nn };
          const b1 = body.bill;
          if (b1.text && b1.noLine) b1.text = String(b1.text).replace(String(b1.noLine), String(b1.noLine).replace(String(b1.noToken || used), String(b1.noToken || used).replace(new RegExp(used + '$'), String(nn))));
          used = nn;
        }
      }
    }
    const next = used >= cur ? used + 1 : cur;
    if (next !== cur && !lateFy) { const o = {}; o[key] = next; setConfig_(o); }
    const b = body.bill || {};
    if (used > 0) {
      try { if (mob10_(b.mobile)) customersSheet_(); } catch (err) { softErr_('takeBill:customers', err); }   // build the Customers tab before this bill lands, so it isn't counted twice
      sheet_(tab_('Bills'), BILL_COLS).appendRow([used, billDate, str_(b.customer, 80), str_(b.mobile, 20), num_(b.total), str_(b.items, 3000), str_(body.by, 60),
        b.gst ? 'Yes' : 'No', b.gst ? num_(b.taxable) : '', b.gst ? num_(b.tax) : '', str_(b.custGstin, 20), b.gst ? (b.igst ? 'IGST' : 'CGST+SGST') : '',
        (function (t) { return /^[=+@-]/.test(t) ? "'" + t : t; })(String(b.text || '').slice(0, 45000)), linesJson_(b.lines),
        str_(b.id, 40), '', '', 0, costOut_(b.cost), costOut_(b.profit)].concat(payRow_(payCalc_(b.total, b.pay, b.received, [], str_(body.by, 60), b.pay === 'credit' ? '' : paidBy_(b.paidBy))), [fyNow, '', '', '', '', str_(b.pos || '', 40), b.pay === 'credit' ? '' : paidBy_(b.paidBy), poCell_(b.po), str_(String(b.custAddr || '').trim(), 300)]));
      try { belowNote_(b, used, body.by, null, sheet_(tab_('Bills'), BILL_COLS).getLastRow()); } catch (err) { softErr_('takeBill:belowNote', err); }
      try { touchCustomer_(b.mobile, b.customer, b.custGstin, b.total, used, true); } catch (err) { softErr_('takeBill:customer', err); }
      if (b.pay === 'credit' || b.pay === 'part') { try { refreshDue_(b.mobile); } catch (err) { softErr_('takeBill:due', err); } }   // (v60) a paid bill adds nothing due: no need to read every bill
    }
    /* (v63) Transfer to another number: this new bill replaces an older one (e.g. its number was already used in the paper bill
       book). Only once the new bill is saved is the old one cancelled, "Moved to No. X", and kept as a copy (not counted anywhere).
       Manager or owner. If the old bill can't be cancelled, the new one is still saved and the phone is told. */
    let moved = null, moveErr = '';
    const mf = b.moveFrom;
    if (used > 0 && mf && (mf.id || mf.row)) {
      if (ROLE_RANK[body.role] < ROLE_RANK.manager) moveErr = 'not_allowed';
      else { try {
        const ms = sheet_(tab_('Bills'), BILL_COLS), mn = ms.getLastRow() - 1, MB = BILL_COLS.reduce((m, k2, i2) => (m[k2] = i2, m), {});
        const mv = mn > 0 ? ms.getRange(2, 1, mn, BILL_COLS.length).getValues() : [];
        let k = mf.id ? mv.findIndex(r => String(r[MB.billId]) === String(mf.id)) : -1;
        if (k < 0 && mf.row) { const j = Number(mf.row) - 2; if (j >= 0 && j < mn && num_(mv[j][MB.billNo]) === num_(mf.n)) k = j; }
        if (k < 0) moveErr = 'bill_not_found';
        else if (mv[k][MB.status] === 'Cancelled') moveErr = 'bill_cancelled';
        else { cancelBill_({ id: mv[k][MB.billId] || '', row: k + 2, n: mv[k][MB.billNo], reason: 'Moved to No. ' + used }, body.by, true);
          moved = { id: String(mv[k][MB.billId] || ''), row: k + 2, from: num_(mv[k][MB.billNo]), to: used }; }
      } catch (err) { moveErr = String(err && err.message || err).slice(0, 60); } }
    }
    /* (v60) no price-list bump: phones learned the next bill number by reloading the whole price list after every bill. They now
       get it from the 25-second check (nb), kept in the cache here. */
    const cfgOut = readConfig_(); nbPut_(cfgOut);
    return { ok: true, rev: getRev_(), config: cfgOut, renumbered: renumbered, moved: moved, moveErr: moveErr || undefined };
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
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  const tz = isFinite(Number(opt.tz)) ? Number(opt.tz) : -330;                             // default India
  const dayOf = d => isNaN(d) ? '' : new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(opt.from || '') ? opt.from : '';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(opt.to || '') ? opt.to : '';
  const before = Number(opt.before) || 0;
  const max = opt.full ? 3000 : Math.min(limit, 200);   // full: the phone keeps its own copy of recent bills and searches it instantly
  const out = [], days = {}, months = {}, years = {}, all = { count: 0, total: 0 };
  arcYears_().forEach(y => years[y] = 1);   // (v67) years whose bills are (partly) in the archive still show in the Year filter
  /* (v67) a search on the sheet (not the phone's copy) also looks through the archived years, when the phone asks for them
     (arc): newest first, the Bills tab, then each archive tab. Those pages go on by count (skip) rather than by row. */
  const srcs = [{ s: s, arc: '' }]; if (!opt.full && opt.arc) arcSheets_(from, to).forEach(x => srcs.push({ s: x.s, arc: x.fy }));
  const useSkip = opt.skip !== undefined && opt.skip !== null && opt.skip !== '', skip = Math.max(0, Math.floor(Number(opt.skip) || 0)); let seq = 0;
  let more = false;
  srcs.forEach(src => {
  const n = src.s.getLastRow() - 1; if (n < 1) return;
  const a = src.s.getRange(2, 1, n, B.text).getValues();                                      // billNo … igst
  const b = src.s.getRange(2, B.billId + 1, n, BILL_COLS.length - B.billId).getValues();       // billId … profit
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
    if (useSkip) { if (seq++ < skip) continue; } else if (before && !src.arc && i + 2 >= before) continue;
    if (out.length >= max) { more = true; continue; }
    out.push({ n: num_(r[B.billNo]), date: isNaN(d) ? '' : d.toISOString(), day: k, customer: String(r[B.customer] || ''), mobile: String(r[B.mobile] || ''),
      total: num_(r[B.total]), items: String(r[B.items] || ''), by: String(r[B.by] || ''), gst: r[B.gstBill] === 'Yes',
      taxable: r[B.taxable] === '' ? null : num_(r[B.taxable]), tax: r[B.tax] === '' ? null : num_(r[B.tax]), custGstin: String(r[B.customerGstin] || ''),
      igst: r[B.igst] === 'IGST',
      id: String(r[B.billId] || ''), row: i + 2, editedAt: r[B.editedAt] instanceof Date ? r[B.editedAt].toISOString() : (r[B.editedAt] ? String(r[B.editedAt]) : ''),
      editedBy: String(r[B.editedBy] || ''), edits: num_(r[B.edits]),
      cost: r[B.cost] === '' ? null : num_(r[B.cost]), profit: r[B.profit] === '' ? null : num_(r[B.profit]), ...payOut_(r, B),
      fy: String(r[B.fy] || ''), cancelled: cancelled, cancelReason: String(r[B.cancelReason] || ''), cancelledBy: String(r[B.cancelledBy] || ''), cancelledAt: r[B.cancelledAt] instanceof Date ? r[B.cancelledAt].toISOString() : String(r[B.cancelledAt] || ''), pos: String(r[B.pos] || ''), paidBy: String(r[B.paidBy] || ''), po: poOut_(r[B.po]), custAddr: String(r[B.custAddr] || ''), ...(src.arc ? { arc: src.arc } : {}) });
  }
  });
  const arcY = arcYears_(), next = useSkip ? skip + out.length : undefined;
  const shown = {}, shownM = {}; out.forEach(x => { shown[x.day] = days[x.day] || { count: 0, total: 0 }; shownM[x.day.slice(0, 7)] = months[x.day.slice(0, 7)] || { count: 0, total: 0 }; });
  if (dIds) return { bills: out, delta: true, full: true, brev: brev_(), years: Object.keys(years).sort().reverse(), arcY: arcY };
  if (opt.full) return { bills: out, days: days, months: months, all: all, years: Object.keys(years).sort().reverse(), more: more, full: true, brev: brev_(), arcY: arcY };
  return { bills: out, days: shown, months: shownM, all: all, years: Object.keys(years).sort().reverse(), more: more, arcY: arcY, next: next };
}

/** The full text and lines of one bill, read only when it's opened. */
function getBill_(row, id, billNo, arc) {
  /* (v67) arc: the financial year of an archived bill: it's read from that year's tab */
  const s = arc ? (/^\d{4}-\d{2}$/.test(String(arc)) ? ss_().getSheetByName(arcTab_(String(arc))) : null) : sheet_(tab_('Bills'), BILL_COLS);
  if (!s) throw new Error('bill_not_found');
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  row = Math.floor(Number(row));
  const at = rw => rw >= 2 && rw <= s.getLastRow() ? s.getRange(rw, 1, 1, BILL_COLS.length).getValues()[0] : null;
  const same = x => !!x && ((id && String(x[B.billId]) === String(id)) || (!id && num_(x[B.billNo]) === num_(billNo)));
  let r = at(row);
  /* (v67) rows move up when a year is archived: a phone with an older copy still finds the bill by its id */
  if (!same(r) && id && s.getLastRow() > 1) { const k = s.getRange(2, B.billId + 1, s.getLastRow() - 1, 1).getValues().findIndex(x => String(x[0]) === String(id)); if (k >= 0) r = at(k + 2); }
  if (!r) throw new Error('bill_not_found');
  if (!same(r)) throw new Error('bill_moved');
  let lines = [];
  try { lines = JSON.parse(r[B.lines] || '[]'); } catch (err) {}
  return { bill: { text: String(r[B.text] || ''), lines: lines, edits: num_(r[B.edits]), fy: String(r[B.fy] || ''), gst: r[B.gstBill] === 'Yes',
    igst: r[B.igst] === 'IGST', custGstin: String(r[B.customerGstin] || ''), pos: String(r[B.pos] || ''), paidBy: String(r[B.paidBy] || ''), po: poOut_(r[B.po]), custAddr: String(r[B.custAddr] || ''), customer: String(r[B.customer] || ''), mobile: String(r[B.mobile] || ''),
    total: num_(r[B.total]), items: String(r[B.items] || ''), cancelled: r[B.status] === 'Cancelled', cancelReason: String(r[B.cancelReason] || ''), cancelledBy: String(r[B.cancelledBy] || ''),
    cancelledAt: r[B.cancelledAt] instanceof Date ? r[B.cancelledAt].toISOString() : String(r[B.cancelledAt] || ''),
    editedAt: r[B.editedAt] instanceof Date ? r[B.editedAt].toISOString() : String(r[B.editedAt] || ''), editedBy: String(r[B.editedBy] || ''), ...payOut_(r, B) } };
}

/** (v61) Several bills' text and lines in one request, so a phone can keep them ready and open a past bill at once.
 *  rows: [{row, id, n}] (up to 40). Reads one block of rows (the newest bills sit together at the bottom) and checks each
 *  bill id, like getBill_. Bills that moved or are missing are left out; the phone then reads them one at a time. */
function getBills_(rows) {
  const want = (Array.isArray(rows) ? rows : []).slice(0, 40).map(x => ({ row: Math.floor(Number(x && x.row)), id: str_(x && x.id, 40), n: x && x.n }))
    .filter(x => x.row >= 2);
  if (!want.length) return { bills: [] };
  const s = sheet_(tab_('Bills'), BILL_COLS), last = s.getLastRow();
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const ok = want.filter(x => x.row <= last), out = [];
  if (!ok.length) return { bills: [] };
  ok.sort((a, b) => a.row - b.row);
  /* one read for rows close together, separate reads for far-off ones (never more than 400 rows at once) */
  const groups = []; let g = null;
  ok.forEach(x => { if (g && x.row - g.from < 400) { g.to = x.row; g.items.push(x); } else { g = { from: x.row, to: x.row, items: [x] }; groups.push(g); } });
  groups.forEach(gr => {
    const vals = s.getRange(gr.from, 1, gr.to - gr.from + 1, BILL_COLS.length).getValues();
    gr.items.forEach(x => { const r = vals[x.row - gr.from];
      if ((x.id && String(r[B.billId]) !== String(x.id)) || (!x.id && num_(r[B.billNo]) !== num_(x.n))) return;
      let lines = []; try { lines = JSON.parse(r[B.lines] || '[]'); } catch (err) {}
      out.push({ id: String(r[B.billId] || ''), row: x.row, n: num_(r[B.billNo]), text: String(r[B.text] || ''), lines: lines, edits: num_(r[B.edits]),
        editedAt: r[B.editedAt] instanceof Date ? r[B.editedAt].toISOString() : String(r[B.editedAt] || '') }); });
  });
  return { bills: out };
}

