/* ======================= Vendor khata (purchases and payments to suppliers) =======================
 * Tabs (separate in test mode via tab_): Vendors, VendorLedger, VendorDocs (small previews of bill photos).
 * Full-quality bill photos / PDFs are files in a private Drive folder ("Rate Book vendor bills", test: "… (test)").
 * Balance = opening + bills − payments − returns. Payments/returns store which bills they cover (alloc {billId: amount});
 * what isn't allocated is an advance, which can later be used against a bill (vUseAdvance).
 * A vendor's private read-only link (token) is served by doGet vpub / vpubprev / vpubfile. Owner + manager only otherwise. */
const VEND_COLS = ['id', 'name', 'mobile', 'gstin', 'address', 'creditDays', 'opening', 'openingDate', 'token', 'linkOn', 'note', 'createdAt', 'updatedAt', 'by', 'removed', 'map'];
const VLED_COLS = ['id', 'vendorId', 'type', 'date', 'amount', 'gst', 'billNo', 'mode', 'ref', 'noteV', 'noteP', 'photos', 'alloc', 'by', 'at', 'editedAt', 'editedBy', 'removed', 'history', 'ex', 'check', 'applied'];
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
  createdAt: num_(v.createdAt), updatedAt: num_(v.updatedAt), map: vjson_(v.map, {}) }; }
function vEntryOut_(e, pub) { const o = { id: String(e.id), vendorId: String(e.vendorId), type: String(e.type), date: vday_(e.date), amount: num_(e.amount), gst: e.gst === '' ? null : num_(e.gst),
  billNo: String(e.billNo || ''), mode: String(e.mode || ''), ref: String(e.ref || ''), noteV: String(e.noteV || ''), photos: vjson_(e.photos, []), alloc: vjson_(e.alloc, {}), at: num_(e.at),
  removed: String(e.removed) === '1', check: vjson_(e.check, null), lines: (vjson_(e.ex, {}).lines || []).length };
  if (o.check && pub) { delete o.check.by; delete o.check.err; }
  if (!pub) { o.applied = vjson_(e.applied, null); o.noteP = String(e.noteP || ''); o.by = String(e.by || ''); o.editedAt = num_(e.editedAt); o.editedBy = String(e.editedBy || ''); o.history = vjson_(e.history, []); }
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
function vbump_() { return chg_(['vrev_' + ENV_]); }
function vrev_() { return vrevC_(ENV_); }
/** Hand edit or restore: vendors in both modes may have changed. */
function vbumpAll_() { return chg_(['vrev_live', 'vrev_test']); }
/** Vendors version for one mode (cache first, so the 25-second rev check from every phone costs no Properties quota). */
function vrevC_(en) { const c = CacheService.getScriptCache(); let v = c.get('vrev_' + en); if (!v) { v = PropertiesService.getScriptProperties().getProperty('vrev_' + en) || '0'; cPut_('vrev_' + en, v); } return v; }
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
/** Owner: move vendors that were made in test mode by mistake to real mode, with everything they have: the vendor row, all ledger
 *  entries (bills, payments, returns, checks, readings), their bill photos/PDFs (rows in VendorDocs, and the files themselves
 *  into the real-mode Drive folder), and their purchase rows. They are removed from the test tabs, so nothing exists twice.
 *  The vendor's link gets a new token (a test token can only open test data). Runs inside doPost's script lock. */
function vToLive_(ids, by) {
  const want = {}; (ids || []).forEach(id => { if (id) want[String(id)] = 1; }); if (!Object.keys(want).length) throw new Error('nothing_chosen');
  const keep = ENV_, toRows = (cols, list) => list.map(o => cols.map(k => { const v = o[k] === undefined || o[k] === null ? '' : o[k]; return VTXT_[k] && v !== '' && !String(v).startsWith("'") ? "'" + v : v; }));
  const append = (s, cols, list) => { if (list.length) s.getRange(s.getLastRow() + 1, 1, list.length, cols.length).setValues(toRows(cols, list)); };
  const drop = (s, rows) => { const rs = rows.map(r => r._r).sort((a, b) => b - a); let i = 0;   // delete from the bottom, in blocks of neighbouring rows
    while (i < rs.length) { let j = i; while (j + 1 < rs.length && rs[j + 1] === rs[j] - 1) j++; s.deleteRows(rs[j], j - i + 1); i = j + 1; } };
  try {
    ENV_ = 'test';
    const TV = vtab_('Vendors', VEND_COLS), TL = vtab_('VendorLedger', VLED_COLS), TD = vtab_('VendorDocs', VDOC_COLS), TP = vtab_('Purchases', PUR_COLS);
    ENV_ = 'live';
    const LV = vtab_('Vendors', VEND_COLS), LL = vtab_('VendorLedger', VLED_COLS), LD = vtab_('VendorDocs', VDOC_COLS), LP = vtab_('Purchases', PUR_COLS);
    const liveV = {}, liveE = {}; LV.rows.forEach(r => liveV[String(r.id)] = 1); LL.rows.forEach(r => liveE[String(r.id)] = 1);
    const vend = TV.rows.filter(r => want[String(r.id)]), skipped = [];
    const go = vend.filter(r => { if (liveV[String(r.id)]) { skipped.push(String(r.name)); return false; } return true; });
    const goIds = {}; go.forEach(r => goIds[String(r.id)] = 1);
    const ents = TL.rows.filter(r => goIds[String(r.vendorId)]).filter(r => !liveE[String(r.id)]);
    const docs = TD.rows.filter(r => goIds[String(r.vendorId)]), purs = TP.rows.filter(r => goIds[String(r.vendorId)]);
    // write to real mode first (new link token per vendor), then remove from test: a failure half-way can't lose anything
    append(LV.s, VEND_COLS, go.map(r => Object.assign({}, r, { token: vToken_(), updatedAt: Date.now(), by: by })));
    append(LL.s, VLED_COLS, ents); append(LD.s, VDOC_COLS, docs); append(LP.s, PUR_COLS, purs);
    // the files themselves go to the real-mode folder (they open by id either way, so a failure here only leaves them where they were)
    let files = 0, fileFail = 0; const fids = {};
    docs.forEach(d => { if (d.fileId) fids[String(d.fileId)] = 1; });   // only files this script made (VendorDocs), never an id written on an entry
    if (Object.keys(fids).length) { let dest = null; try { dest = vFolder_(); } catch (e) {}
      Object.keys(fids).forEach(f => { try { if (dest) { DriveApp.getFileById(f).moveTo(dest); files++; } } catch (e) { fileFail++; } }); }
    ENV_ = 'test';
    drop(TP.s, purs); drop(TD.s, docs); drop(TL.s, ents); drop(TV.s, go);   // only what was copied
    if (go.length) { ENV_ = 'live'; notice_('move', { amount: '', vname: '', extra: { n: go.length, names: go.map(r => String(r.name)).slice(0, 8), entries: ents.length, photos: Object.keys(fids).length }, by: by }); }
    vbumpAll_();
    return { moved: go.length, names: go.map(r => String(r.name)), entries: ents.length, photos: Object.keys(fids).length, files, fileFail, purchases: purs.length, skipped };
  } finally { ENV_ = keep; }
}
function vToken_() { return (ENV_ === 'test' ? 't' : 'l') + Utilities.getUuid().replace(/-/g, '').slice(0, 22); }
function vSaveVendor_(x, by) { const A = vAll_(), V = A.V, now = Date.now();
  const name = str_(x.name, 80).trim(); if (!name) throw new Error('need_name');
  let r = x.id ? V.rows.find(o => String(o.id) === String(x.id)) : null;
  if (!r) { if (V.rows.some(o => String(o.removed) !== '1' && String(o.name).toLowerCase() === name.toLowerCase())) throw new Error('dup_vendor');
    r = { id: str_(x.id, 40) || ('v' + Utilities.getUuid().replace(/-/g, '').slice(0, 12)), createdAt: now, token: vToken_(), linkOn: '1' }; A.vendors.push(r); }
  r.name = name; r.mobile = str_(x.mobile, 20); r.gstin = str_(x.gstin, 15).toUpperCase(); r.address = str_(x.address, 200); r.creditDays = Math.max(0, Math.min(365, Math.floor(num_(x.creditDays)) || 0));
  r.opening = num_(x.opening) || 0; r.openingDate = vday_(x.openingDate) || r.openingDate || vday_(new Date()); if (x.note !== undefined) r.note = str_(x.note, 300); r.updatedAt = now;   // (v56) an older app copy that doesn't send the private note leaves it as it was r.by = by; if (x.removed !== undefined) r.removed = x.removed ? '1' : '';
  const isNew = !r._r; vwrite_(V.s, VEND_COLS, r);
  if (isNew) notice_('vendor', { vendorId: r.id, vname: name, amount: r.opening || '', extra: { mobile: r.mobile, days: r.creditDays }, by: by });
  vbump_(); return vOne_(A, r.id); }
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
    ref: str_(x.ref, 60), noteV: str_(x.noteV, 500), noteP: str_(x.noteP, 500), photos: JSON.stringify((own => (Array.isArray(x.photos) ? x.photos : []).filter(p => p && p.f && !/^local:/.test(p.f) && own[String(p.f)]))(vDocIds_()).slice(0, 6).map(p => ({ f: str_(p.f, 80), m: str_(p.m, 40) }))),
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
  const wasNew = !r, oldSt = r ? (vjson_(r.check, {}) || {}).st : '';
  if (!r) { r = Object.assign({ id: str_(x.id, 40) || ('e' + Utilities.getUuid().replace(/-/g, '').slice(0, 14)), by: by, at: now, history: '[]' }, fields); }
  vwrite_(L.s, VLED_COLS, r); if (!r._r) r._r = L.s.getLastRow(); vSet_(A, r);
  if (type === 'bill' && x.useAdvance) vUseAdv_(A, G.vendor.id, String(r.id));
  const G2 = vOne_(A, G.vendor.id);
  if (wasNew) notice_(type, { vendorId: G.vendor.id, entryId: r.id, vname: G.vendor.name, amount: amount, billNo: fields.billNo,
    extra: type === 'bill' ? { due: (G2.calc.bills.find(b => b.id === String(r.id)) || {}).dueDate || '' } : { mode: fields.mode, bills: Object.keys(vjson_(fields.alloc, {})).map(id => vBillNo_(G2, id)).filter(Boolean).slice(0, 6) }, by: by });
  vClearedNotes_(G, G2, by);
  if (type === 'bill') vCheckNote_(r, oldSt, G.vendor, by);
  vbump_(); return G2; }
function vRemove_(id, on, by) { const A = vAll_(), L = A.L; const r = L.rows.find(o => String(o.id) === String(id)); if (!r) throw new Error('no_entry');
  const was = String(r.removed) === '1';
  r.removed = on ? '1' : ''; const h = vjson_(r.history, []); h.push({ at: Date.now(), by: by, act: on ? 'remove' : 'restore' }); r.history = JSON.stringify(h.slice(-20)); vwrite_(L.s, VLED_COLS, r); vSet_(A, r);
  if (on && !was) { const v = A.vendors.find(o => String(o.id) === String(r.vendorId)) || {}; notice_('rm', { vendorId: r.vendorId, entryId: r.id, vname: v.name, amount: num_(r.amount), billNo: String(r.billNo || ''), extra: { type: String(r.type) }, by: by }); }
  vbump_(); return vOne_(A, r.vendorId); }
/** Use the vendor's advance (unallocated payments, oldest first) against one bill. */
function vUseAdv_(A, vendorId, billId) { const G = vOne_(A, vendorId); const b = G.calc.bills.find(x => x.id === billId); if (!b || b.due <= 0) return;
  let need = b.due;
  G.entries.filter(e => !e.removed && e.type !== 'bill').forEach(e => { if (need <= 0) return;
    const used = Object.keys(e.alloc).reduce((s, k) => s + num_(e.alloc[k]), 0), free = Math.round((e.amount - used) * 100) / 100; if (free <= 0) return;
    const a = Math.min(free, need); const r = A.L.rows.find(o => String(o.id) === e.id); const al = vjson_(r.alloc, {}); al[billId] = Math.round(((num_(al[billId]) || 0) + a) * 100) / 100; r.alloc = JSON.stringify(al); vwrite_(A.L.s, VLED_COLS, r); vSet_(A, r); need -= a; }); }
function vUseAdvance_(vendorId, billId, by) { const A = vAll_(), G = vOne_(A, vendorId); vUseAdv_(A, vendorId, billId); const G2 = vOne_(A, vendorId); vClearedNotes_(G, G2, by); vbump_(); return G2; }
function vFolder_() { const key = 'VD_FOLDER_' + ENV_, p = PropertiesService.getScriptProperties(), id = p.getProperty(key);
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (err) {} }
  const b = boot_(), bid = b && (ENV_ === 'test' ? b.vdFolderTest : b.vdFolder); if (bid) { const f = DriveApp.getFolderById(bid); p.setProperty(key, f.getId()); return f; }   // never another shop's folder by name
  const name = VD_FOLDER_NAME + (ENV_ === 'test' ? ' (test)' : ''), it = DriveApp.getFoldersByName(name); const f = it.hasNext() ? it.next() : DriveApp.createFolder(name); p.setProperty(key, f.getId()); return f; }
function vUpload_(x) { const mime = /^(image\/jpeg|image\/png|application\/pdf)$/.test(String(x.mime)) ? String(x.mime) : 'image/jpeg';
  const data = String(x.data || ''); if (!data || data.length > 14000000) throw new Error('bad_file');
  let file; try { file = vFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(data), mime, str_(x.name, 80) || ('bill-' + Date.now() + (mime === 'application/pdf' ? '.pdf' : '.jpg')))); }
  catch (err) { if (/permission|authori|access/i.test(String(err && err.message || err))) throw new Error('drive_auth'); throw err; }
  const D = vtab_('VendorDocs', VDOC_COLS); vwrite_(D.s, VDOC_COLS, { fileId: file.getId(), vendorId: str_(x.vendorId, 40), preview: vPrevOk_(x.preview), mime: mime, at: Date.now() });
  return { f: file.getId(), m: mime }; }
function vPreviews_(ids) { const want = {}; (ids || []).forEach(i => want[String(i)] = 1); const out = {};
  vtab_('VendorDocs', VDOC_COLS).rows.forEach(r => { const pv = want[r.fileId] && vPrevOk_(r.preview); if (pv) out[r.fileId] = pv; }); return { previews: out }; }
/** Every shop's script runs as the Google account that deployed it, so a file id from a phone must never open just any Drive file
    (another shop's sheet, backups, the Directory). Only files this script made itself for this mode's vendor bills count: those are
    the ones listed in VendorDocs (written by vUpload_ alone, or moved by vToLive_). (v45) */
function vDocIds_() { const set = {}; vtab_('VendorDocs', VDOC_COLS).rows.forEach(r => { if (r.fileId) set[String(r.fileId)] = 1; }); return set; }
function vOwnFile_(f, set) { f = String(f || ''); if (!/^[\w-]{10,100}$/.test(f) || !(set || vDocIds_())[f]) throw new Error('not_found'); return DriveApp.getFileById(f); }
/** A bill photo's small preview must be a real image (it's drawn on the vendor's link page). */
function vPrevOk_(x) { x = String(x || ''); return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(x) && x.length <= 48000 ? x : ''; }
function vFile_(f) { const file = vOwnFile_(f); const b = file.getBlob(); return { data: Utilities.base64Encode(b.getBytes()), mime: b.getContentType() }; }
/* ---- the vendor's own read-only page ---- */
function vPubFind_(t) { t = String(t || ''); if (!/^[tl][0-9a-f]{22}$/.test(t)) return null; ENV_ = t[0] === 't' ? 'test' : 'live';
  if (!ss_().getSheetByName(tab_('Vendors'))) return null;   // (v64) a stranger's made-up link never adds a tab to the shop's sheet
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
  Logger.log('Vendor bill photos folder is ready in your Google Drive: ' + VD_FOLDER_NAME);
  try { UrlFetchApp.fetch('https://generativelanguage.googleapis.com/', { muteHttpExceptions: true }); Logger.log('Connect to Google AI: OK'); }   /* asks once for "connect to an external service" (bill reading) */
  catch (e) { Logger.log('Connect to Google AI: NOT ALLOWED. ' + e.message); } }
/** Run in the editor (choose checkBillReading → Run) when the app says bill reading can't be set up. Every line goes to the Execution log. */
function checkBillReading() {
  Logger.log('1. Running as: ' + Session.getEffectiveUser().getEmail());
  let url = ''; try { url = ScriptApp.getService().getUrl() || '(not deployed as a web app)'; } catch (e) { url = '(could not read: ' + e.message + ')'; }
  Logger.log('2. This project\'s web app link: ' + url + '  ← must match API_URL in app.js');
  try { const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models', { muteHttpExceptions: true }); Logger.log('3. Connect to Google AI: OK (reply ' + r.getResponseCode() + ')'); }
  catch (e) { Logger.log('3. Connect to Google AI: NOT ALLOWED. ' + e.message); return; }
  const key = aiKey_(); if (!key) { Logger.log('4. No Gemini key saved yet (Project Settings → Script properties → GEMINI_KEY).'); return; }
  try { aiCall_([{ text: 'This is a connection test, not a bill. Return readable false and confidence 0.' }]); Logger.log('4. Gemini key works. Bill reading is ready.'); }
  catch (e) { Logger.log('4. Gemini said: ' + e.message); } }

