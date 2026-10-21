/* ---------- yearly archive of bills (v67) ----------
   At the end of each financial year, bills from two years back (FY 2025-26 once FY 2027-28 starts) move out of the Bills tab
   into their own tab, "Bills 2025-26" ("Test Bills 2025-26" in test mode), so everyday work (dues, most-sold, customer totals,
   bill numbers, bill edits) reads two years of bills at most instead of every bill ever made. Bills with money still owed stay,
   and so do credit bills paid off in the last year (the credit charts look back that far); they move a year later.
   Before anything moves a backup copy of the whole sheet is made; rows are copied first, checked, and only then removed, so a run
   that stops half-way just runs again (rows already copied aren't copied twice). Archived bills open, search, print, share and
   repeat like any other, but can't be changed (their GST returns are filed). The small "BillYears" tab keeps a summary per
   archived year (bills, sales, tax, profit, bills per item, month totals): most-sold order still counts old years from it;
   reports for an old period and customer recounts read the archive tabs themselves. Runs by itself at night from watchSheet
   (hourly); editor function archiveNow runs it at once. */
const ARC_COLS = ['fy', 'bills', 'sales', 'tax', 'profit', 'items', 'months', 'rows', 'at'];
function arcTab_(fy) { return tab_('Bills') + ' ' + fy; }
function fyAdd_(fy, k) { const y = Number(String(fy).slice(0, 4)) + k; return y + '-' + String(y + 1).slice(2); }
function fyRange_(fy) { const y = Number(String(fy).slice(0, 4)); return { from: y + '-04-01', to: (y + 1) + '-03-31' }; }
/** The archived financial years of this mode, oldest first (script property ARC_<mode>, written when a year is archived). */
function arcList_() { try { const a = JSON.parse(PropertiesService.getScriptProperties().getProperty('ARC_' + ENV_) || '[]');
  return Array.isArray(a) ? a.filter(f => /^\d{4}-\d{2}$/.test(f)).sort() : []; } catch (e) { return []; } }
/** Calendar years that have archived bills (Past bills' Year filter asks the sheet for these). */
function arcYears_() { const y = {}; arcList_().forEach(fy => { const a = Number(fy.slice(0, 4)); y[a] = 1; y[a + 1] = 1; }); return Object.keys(y); }
/** Archive tabs holding bills between from and to (yyyy-mm-dd, either may be empty), newest year first. */
function arcSheets_(from, to) { const SS = ss_();
  return arcList_().reverse().filter(fy => { const r = fyRange_(fy); return (!from || r.to >= from) && (!to || r.from <= to); })
    .map(fy => ({ fy: fy, s: SS.getSheetByName(arcTab_(fy)) })).filter(x => x.s && x.s.getLastRow() > 1); }
/** Every row of those archive tabs, oldest year first (for reports and recounts, which read rows in date order). */
function arcRows_(from, to) { const out = []; arcSheets_(from, to).reverse().forEach(x => { x.s.getRange(2, 1, x.s.getLastRow() - 1, BILL_COLS.length).getValues().forEach(r => out.push(r)); }); return out; }
/** Is this bill id in an archive tab? (an edit, cancel or payment sent for an archived bill says so instead of "not found") */
function arcHas_(id) { if (!id) return false; const k = BILL_COLS.indexOf('billId') + 1;
  return arcSheets_('', '').some(x => x.s.getRange(2, k, x.s.getLastRow() - 1, 1).getValues().some(r => String(r[0]) === String(id))); }
/** Summary per archived year (the BillYears tab), {fy: {bills, sales, tax, profit, items:{id: bills}, months:{yyyy-mm:{count,total}}}}. */
function arcSums_() { const s = ss_().getSheetByName(tab_('BillYears')), out = {}; if (!s || s.getLastRow() < 2) return out;
  s.getRange(2, 1, s.getLastRow() - 1, ARC_COLS.length).getValues().forEach(r => { const fy = String(r[0] || ''); if (!/^\d{4}-\d{2}$/.test(fy)) return;
    let items = {}, months = {}; try { items = JSON.parse(r[5] || '{}') || {}; } catch (e) {} try { months = JSON.parse(r[6] || '{}') || {}; } catch (e) {}
    out[fy] = { bills: num_(r[1]), sales: num_(r[2]), tax: num_(r[3]), profit: num_(r[4]), items: items, months: months, rows: num_(r[7]) }; });
  return out; }

/** Move what's due this year (both modes). Returns {live: n, test: n} bills moved. */
function archiveBills_(now) {
  now = now || new Date(); const cut = fyAdd_(fy_(now), -2), keep = ENV_, out = {};
  try { ['live', 'test'].forEach(en => { ENV_ = en; out[en] = arcRun_(cut, now); }); } finally { ENV_ = keep; }
  return out;
}
function arcRun_(cut, now) {
  const SS = ss_(), src = SS.getSheetByName(tab_('Bills'));
  const P = PropertiesService.getScriptProperties(), listKey = 'ARC_' + ENV_;
  const fromTabs = () => SS.getSheets().map(s => s.getName()).map(nm => { const m = nm.match(/^(Test )?Bills (\d{4}-\d{2})$/); return m && !!m[1] === (ENV_ === 'test') ? m[2] : null; }).filter(Boolean).sort();
  if (!src || src.getLastRow() < 2) { P.setProperty(listKey, JSON.stringify(fromTabs())); return 0; }
  const n = src.getLastRow() - 1, W = Math.max(BILL_COLS.length, src.getLastColumn());
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {}), v = src.getRange(2, 1, n, BILL_COLS.length).getValues();
  const yearAgo = now.getTime() - 365 * 864e5, byFy = {}; let moved = 0;
  const key = r => String(r[B.billId] || '') || ('n:' + r[B.billNo] + ':' + (r[B.date] instanceof Date ? r[B.date].getTime() : String(r[B.date])));
  v.forEach((r, i) => {
    const d = r[B.date] instanceof Date ? r[B.date] : new Date(r[B.date]); if (isNaN(d)) return;
    const fy = fy_(d); if (!(fy <= cut)) return;
    if (r[B.status] !== 'Cancelled') {
      const pay = String(r[B.payment] || ''); if (pay === 'Credit' || pay === 'Part paid' || num_(r[B.due]) > 0) return;   // money still owed: stays
      const last = payList_(r[B.payments]).reduce((m, p) => Math.max(m, Date.parse(p.d) || 0), 0), cl = r[B.clearedAt] ? new Date(r[B.clearedAt]).getTime() || 0 : 0;
      if (Math.max(last, cl) > yearAgo) return; }   // paid off within the last year: the credit charts still look at it
    (byFy[fy] = byFy[fy] || []).push(i);
  });
  const fys = Object.keys(byFy).sort();
  fys.forEach(fy => {
    const dst = sheet_(arcTab_(fy), BILL_COLS), have = {};
    const keysOf = () => { const o = {}, dn = dst.getLastRow() - 1; if (dn > 0) dst.getRange(2, 1, dn, BILL_COLS.length).getValues().forEach(r => o[key(r)] = 1); return o; };
    Object.assign(have, keysOf());
    const todo = byFy[fy].filter(i => !have[key(v[i])]);
    arcRunsOf_(todo).forEach(g => { const to = dst.getLastRow() + 1; src.getRange(g[0] + 2, 1, g[1], W).copyTo(dst.getRange(to, 1, g[1], W)); });
    const got = keysOf(); if (byFy[fy].some(i => !got[key(v[i])])) throw new Error('archive_copy_failed');   // nothing is removed unless every bill is in the archive
  });
  /* everything copied and checked: remove those rows, bottom first (row numbers above stay right) */
  const all = [].concat.apply([], fys.map(fy => byFy[fy])).sort((a, b) => a - b);
  arcRunsOf_(all).reverse().forEach(g => { src.deleteRows(g[0] + 2, g[1]); moved += g[1]; });
  const list = fromTabs(); P.setProperty(listKey, JSON.stringify(list));
  fys.forEach(fy => arcSumWrite_(fy));
  if (moved) { bumpB_(); popReset_(); }
  return moved;
}
/** Sorted row indexes → [[start, count], …] of rows next to each other. */
function arcRunsOf_(ix) { const out = []; ix.slice().sort((a, b) => a - b).forEach(i => { const g = out[out.length - 1]; if (g && g[0] + g[1] === i) g[1]++; else out.push([i, 1]); }); return out; }
/** Work out one archived year's summary from its tab and write it to BillYears (replacing that year's row). */
function arcSumWrite_(fy) {
  const s = ss_().getSheetByName(arcTab_(fy)); if (!s) return;
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {}), n = s.getLastRow() - 1;
  const t = { bills: 0, sales: 0, tax: 0, profit: 0 }, items = {}, months = {};
  if (n > 0) s.getRange(2, 1, n, BILL_COLS.length).getValues().forEach(r => {
    if (r[B.status] === 'Cancelled' || (r[B.billNo] === '' && r[B.total] === '')) return;
    const d = r[B.date] instanceof Date ? r[B.date] : new Date(r[B.date]), mk = isNaN(d) ? 'unknown' : Utilities.formatDate(d, BK_TZ, 'yyyy-MM');
    t.bills++; t.sales = r2_(t.sales + num_(r[B.total])); t.tax = r2_(t.tax + num_(r[B.tax])); t.profit = r2_(t.profit + num_(r[B.profit]));
    const m = months[mk] || (months[mk] = { count: 0, total: 0 }); m.count++; m.total = r2_(m.total + num_(r[B.total]));
    let L = []; try { L = JSON.parse(r[B.lines] || '[]'); } catch (e) {} const seen = {};
    (Array.isArray(L) ? L : []).forEach(l => { const id = l && l.id ? String(l.id) : ''; if (id && !seen[id] && id.indexOf('tmp_') !== 0) { seen[id] = 1; items[id] = (items[id] || 0) + 1; } });
  });
  let itJ = '{'; Object.keys(items).sort((a, b) => items[b] - items[a]).forEach(id => { const p = (itJ.length > 1 ? ',' : '') + JSON.stringify(id) + ':' + items[id]; if (itJ.length + p.length < 45000) itJ += p; }); itJ += '}';
  const row = [fy, t.bills, t.sales, t.tax, t.profit, itJ, JSON.stringify(months).slice(0, 45000), Math.max(0, n), new Date()];
  const ys = sheet_(tab_('BillYears'), ARC_COLS), yn = ys.getLastRow() - 1;
  const at = yn > 0 ? ys.getRange(2, 1, yn, 1).getValues().findIndex(r => String(r[0]) === fy) : -1;
  if (at >= 0) ys.getRange(at + 2, 1, 1, ARC_COLS.length).setValues([row]); else ys.appendRow(row);
}
/** From watchSheet (hourly): once a financial year, at night, archive what's due. A backup of the whole sheet comes first;
 *  if it can't be made, nothing moves (and the reason goes to the error log). */
function arcMaybe_(now) {
  now = now || new Date(); const P = PropertiesService.getScriptProperties(), cut = fyAdd_(fy_(now), -2);
  if (P.getProperty('RETIRED') || String(P.getProperty('ARC_DONE') || '') >= cut) return null;
  if (Number(Utilities.formatDate(now, BK_TZ, 'H')) >= 6) return null;   // between midnight and 6 am India time, when nobody is billing
  return archiveNow_(now);
}
function archiveNow_(now) {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return null;
  const was = LOCKED_; LOCKED_ = true;
  try { now = now || new Date();
    try { backupNow_('before-archive'); } catch (e) { softErr_('archive:backup', e); throw new Error('archive_no_backup'); }
    const r = archiveBills_(now); PropertiesService.getScriptProperties().setProperty('ARC_DONE', fyAdd_(fy_(now), -2)); return r; }
  finally { LOCKED_ = was; lock.releaseLock(); }
}
/** Editor: archive now (normally it runs by itself, at night after a new financial year starts). View → Logs shows how many moved. */
function archiveNow() { const r = archiveNow_(); Logger.log(r ? 'Bills moved to the archive: real ' + r.live + ', test ' + r.test : 'Busy, try again in a minute'); return r; }

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** Change a saved bill. Keeps the original date and number, records who edited it and when, and keeps the old text in BillHistory. */
function updateBill_(b, by, who) {
  popReset_();
  const s = sheet_(tab_('Bills'), BILL_COLS);
  const n = s.getLastRow() - 1;
  if (n < 1) throw new Error('bill_not_found');
  const vals = s.getRange(2, 1, n, BILL_COLS.length).getValues();
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  let i = -1;
  if (b.id) i = vals.findIndex(r => String(r[B.billId]) === String(b.id));
  if (i < 0 && b.row) { const k = Number(b.row) - 2; if (k >= 0 && k < vals.length && num_(vals[k][B.billNo]) === num_(b.n)) i = k; }
  if (i < 0) throw new Error(arcHas_(b.id) ? 'bill_archived' : 'bill_not_found');   // (v67) archived bills can't be changed
  const r = vals[i];
  if (r[B.status] === 'Cancelled') throw new Error('bill_cancelled');
  if (!totalOk_(b.total)) throw new Error('bad_total');
  let oldLines = []; try { oldLines = JSON.parse(r[B.lines] || '[]'); } catch (err) {}
  if (who && !buyOk_(who)) fillBuy_(b, oldLines);   // (v65) their copy of the bill had no buy rates: keep the ones it had (before the resend check, so a resend matches)
  if (b.baseEdits !== undefined && b.baseEdits !== null && num_(r[B.edits]) !== num_(b.baseEdits)) {
    /* (v59) a resend of a change already saved (the phone lost the reply): the bill already holds exactly this text and these lines */
    if (b.oid && String(r[B.text] || '').replace(/^'/, '') === String(b.text || '').slice(0, 45000) && String(r[B.lines] || '') === linesJson_(b.lines))
      return { dup: true, bill: { id: String(r[B.billId]), n: num_(r[B.billNo]), editedAt: r[B.editedAt] instanceof Date ? r[B.editedAt].toISOString() : String(r[B.editedAt] || ''), edits: r[B.edits] } };
    throw new Error('bill_changed'); }   // someone else saved it after this phone opened it   // someone else saved it after this phone opened it
  { const bad = billSums_(b); if (bad) throw new Error(bad.error); }   // (v66) after the conflict check, so an edit on an old copy still says so
  { const badT = billTextCheck_(b, num_(r[B.billNo])); if (badT) throw new Error(badT.error); }   // (v67) its text still matches it
  /* (v46) "fresh" (tweaks right after sharing, not marked Edited) only for the person who made the bill, within 30 minutes of
     making it; anything later or by someone else is an edit and shows as one. Staff can't change the total or the payment of a
     bill that is on credit or has payments recorded (that would quietly wipe a customer's due): a manager or the owner can,
     and money received goes through Record payment. */
  const madeAt = r[B.date] instanceof Date ? r[B.date].getTime() : Date.parse(r[B.date]) || 0;
  const freshOk = !!b.fresh && String(r[B.by] || '').trim().toLowerCase() === String(by || '').trim().toLowerCase() && Date.now() - madeAt < 30 * 60e3;
  b.fresh = freshOk;
  if (who && ROLE_RANK[who.role] < ROLE_RANK.manager && !freshOk) {
    const oldPays = payList_(r[B.payments]), oldMode = modeOf_(r[B.payment], oldPays), hasMoney = num_(r[B.due]) > 0 || oldPays.some(p => !p.at);
    /* (v66) a paid bill's total too: before, staff could lower a paid bill's total later (marked Edited, but the money taken
       no longer matched). The maker's own tweaks within 30 minutes ("fresh") are still fine. */
    if (Math.abs(num_(b.total) - num_(r[B.total])) > 0.004) throw new Error('needs_manager');
    if (hasMoney && (Math.abs(num_(b.total) - num_(r[B.total])) > 0.004 || mob10_(b.mobile) !== mob10_(r[B.mobile]) || (b.pay && b.pay !== oldMode) || (b.received !== undefined && b.pay === oldMode && oldMode === 'part' && Math.abs(num_(b.received) - oldPays.filter(p => p.at).reduce((x, p) => x + num_(p.a), 0)) > 0.004))) throw new Error('needs_manager');
  }
  sheet_(tab_('BillHistory'), HISTORY_COLS).appendRow([String(r[B.billId] || ''), r[B.billNo], new Date(), by, String(r[B.text] || r[B.items] || '').slice(0, 45000)]);
  const safe = t => /^[=+@-]/.test(t) ? "'" + t : t;
  r[B.customer] = str_(b.customer, 80); r[B.mobile] = str_(b.mobile, 20); r[B.total] = num_(b.total);
  r[B.items] = str_(b.items, 3000); r[B.gstBill] = b.gst ? 'Yes' : 'No';
  r[B.taxable] = b.gst ? num_(b.taxable) : ''; r[B.tax] = b.gst ? num_(b.tax) : '';
  r[B.customerGstin] = str_(b.custGstin, 20); r[B.igst] = b.gst ? (b.igst ? 'IGST' : 'CGST+SGST') : '';
  if (b.pos !== undefined) r[B.pos] = str_(b.pos || '', 40);
  if (b.paidBy !== undefined) r[B.paidBy] = b.pay === 'credit' ? '' : paidBy_(b.paidBy);
  if (b.po !== undefined) r[B.po] = poCell_(b.po);
  if (b.custAddr !== undefined) r[B.custAddr] = str_(String(b.custAddr || '').trim(), 300);
  r[B.text] = safe(String(b.text || '').slice(0, 45000));
  r[B.lines] = linesJson_(b.lines);
  if (!r[B.billId]) r[B.billId] = str_(b.id || Utilities.getUuid().replace(/-/g, '').slice(0, 16), 40);
  r[B.cost] = costOut_(b.cost); r[B.profit] = costOut_(b.profit);
  if (!b.fresh) { r[B.editedAt] = new Date(); r[B.editedBy] = by; }   // fresh: tweaks right after sharing, not an edit of an old bill
  r[B.edits] = num_(r[B.edits]) + 1;
  const oldMob = vals[i][B.mobile];
  { const pays = payList_(r[B.payments]), later = pays.filter(p => !p.at), atBill = pays.filter(p => p.at).reduce((x, p) => x + num_(p.a), 0);
    const mode = b.pay ? b.pay : modeOf_(r[B.payment], pays);
    const pc = payCalc_(r[B.total], mode, b.pay ? b.received : atBill, later, by, String(r[B.paidBy] || ''));
    if (pc.status !== 'Paid' && !mob10_(r[B.mobile])) throw new Error('credit_needs_mobile');
    const pr = payRow_(pc); for (let j = 0; j < pr.length; j++) r[B.payment + j] = pr[j];
    if (pc.status === 'Cleared' && vals[i][B.clearedAt]) r[B.clearedAt] = vals[i][B.clearedAt]; }
  s.getRange(i + 2, 1, 1, BILL_COLS.length).setValues([r]);
  try { belowNote_(b, num_(r[B.billNo]), by, oldLines, i + 2); } catch (err) { softErr_('updateBill:belowNote', err); }
  try { touchCustomer_(b.mobile, b.customer, b.custGstin, num_(b.total), num_(r[B.billNo]), false); } catch (err) { softErr_('updateBill:customer', err); }
  try { refreshDue_(b.mobile); if (mob10_(oldMob) !== mob10_(b.mobile)) refreshDue_(oldMob); } catch (err) { softErr_('updateBill:due', err); }
  return { bill: { id: String(r[B.billId]), n: num_(r[B.billNo]), editedAt: r[B.editedAt] instanceof Date ? r[B.editedAt].toISOString() : String(r[B.editedAt] || ''), edits: r[B.edits] } };
}

