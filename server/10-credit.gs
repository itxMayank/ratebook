/* ---------- credit (udhaar) ----------
 * Each bill has: payment ('Paid' | 'Credit' | 'Part paid' | 'Cleared'; blank on old bills = Paid), paid, due,
 * payments (JSON [{d: ISO date, a: amount, by, at: 1 if received at billing, note}]) and clearedAt (when the last of it was paid).
 */
function r2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
/** How the money at billing was taken (bill page tiles): Cash / UPI / Cheque, or '' when not marked. */
/** The customer's purchase order (PO) a bill is made against (v54): number + date, saved as one cell "number|yyyy-mm-dd" (written as text). */
function poClean_(po) { po = po && typeof po === 'object' ? po : {}; const no = String(po.no == null ? '' : po.no).trim().slice(0, 40), d = String(po.date || '').trim(); return { no: no, date: /^\d{4}-\d\d-\d\d$/.test(d) ? d : '' }; }
function poCell_(po) { const p = poClean_(po); return p.no || p.date ? "'" + p.no.replace(/\|/g, '/') + '|' + p.date : ''; }
function poOut_(v) { const t = String(v || ''); if (!t) return null; const i = t.lastIndexOf('|'); return i < 0 ? { no: t, date: '' } : { no: t.slice(0, i), date: t.slice(i + 1) }; }
function paidBy_(v) { const k = String(v || '').trim().toLowerCase(); return k === 'cash' ? 'Cash' : k === 'upi' ? 'UPI' : k === 'cheque' || k === 'check' ? 'Cheque' : ''; }
function payList_(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (err) { return []; } }
/* (v64) A bill's payment history and its lines are kept as readable data, never cut mid-way. Before, they were cut at 20,000 /
   45,000 characters: after ~250 payments the history stopped being readable, so it started again from nothing, and an undo then
   worked the paid amount out from that part only (seen in the break pass: undo of ₹1 added ₹241 back to the customer's due).
   Payments: past the limit, the oldest later payments are merged into one line with the same total (m = how many). */
const CELL_MAX_ = 45000;
function payJson_(pays) { if (!pays || !pays.length) return ''; let s = JSON.stringify(pays); if (s.length <= CELL_MAX_) return s;
  let at = pays.filter(p => p.at), later = pays.filter(p => !p.at);
  while (later.length > 2 && s.length > CELL_MAX_) {
    const k = Math.max(2, Math.ceil(later.length / 4)), old = later.slice(0, k);
    const m = { d: old[0].d, a: r2_(old.reduce((x, p) => x + num_(p.a), 0)), by: '', m: old.reduce((x, p) => x + (Number(p.m) || 1), 0), note: 'earlier payments' };
    later = [m].concat(later.slice(k)); s = JSON.stringify(at.concat(later)); }
  return s; }
/** Bill lines (up to 200) as readable data: past the cell size the Hindi names go, then long names are shortened, then the last lines. */
function linesJson_(lines) { let a = Array.isArray(lines) ? lines.slice(0, 200) : [], s = JSON.stringify(a); if (s.length <= CELL_MAX_) return s;
  a = a.map(l => { const o = Object.assign({}, l); delete o.nameHi; return o; }); s = JSON.stringify(a); if (s.length <= CELL_MAX_) return s;
  a = a.map(l => Object.assign({}, l, { name: String(l.name || '').slice(0, 60) })); s = JSON.stringify(a);
  while (s.length > CELL_MAX_ && a.length > 1) { a = a.slice(0, -1); s = JSON.stringify(a); }
  return s; }
/** (v64) A bill total must be a number, not below 0 (a minus total would take money off the day's sales). */
/* ==== money.js: copied by tools/stamp.js, edit money.js instead ==== */
/** A bill's sums from its lines ({qty, rate, gst}). Normal bill: total = lines added up (paise kept). GST bill: tax added on top,
    grouped by rate, half CGST + half SGST (or IGST), total rounded to the rupee with a round-off. rateOf: a line's GST %. */
function billMath_(lines, gst, igst, rateOf) {
  const r2 = n => Math.round((+n || 0) * 100) / 100, L = Array.isArray(lines) ? lines : [];
  if (!gst) { const total = r2(L.reduce((a, l) => a + (+(l && l.qty) || 0) * (+(l && l.rate) || 0), 0)); return { taxable: total, tax: 0, groups: [], roundOff: 0, total: total }; }
  rateOf = rateOf || (l => +l.gst || 0);
  const by = {}; let taxable = 0;
  L.forEach(l => { const amt = r2((+l.qty || 0) * (+l.rate || 0)), g = rateOf(l); taxable += amt; by[g] = (by[g] || 0) + amt; });
  taxable = r2(taxable);
  const groups = []; let tax = 0;
  Object.keys(by).map(Number).sort((a, b) => a - b).forEach(rate => { if (!rate) return;
    if (igst) { const v = r2(by[rate] * rate / 100); tax += v; groups.push({ rate: rate, v: v, kind: 'I' }); }
    else { const v = r2(by[rate] * (rate / 2) / 100); tax += 2 * v; groups.push({ rate: rate, v: v, kind: 'C' }); } });
  tax = r2(tax); const exact = r2(taxable + tax), total = Math.round(exact);
  return { taxable: taxable, tax: tax, groups: groups, roundOff: r2(total - exact), total: total };
}
/** Profit on the sale before GST. Lines without a buy rate (missing or 0) are left out of both sale and cost. % is on cost, the
    same way margins are shown on price cards. buyOf: a line's buy rate per its unit (null when unknown). */
function billCost_(lines, buyOf) {
  const r2 = n => Math.round((+n || 0) * 100) / 100; buyOf = buyOf || (l => l.buy);
  let sale = 0, csale = 0, cost = 0, known = true, any = false; const per = [];
  (Array.isArray(lines) ? lines : []).forEach(l => { const q = +l.qty || 0, amt = r2(q * (+l.rate || 0)), b = buyOf(l); sale += amt;
    if (b == null || !(+b > 0)) { known = false; per.push({ name: l.name, amt: amt, cost: null, p: null }); return; }
    const c = r2(q * b); cost += c; csale += amt; any = true; per.push({ name: l.name, amt: amt, cost: c, p: r2(amt - c) }); });
  sale = r2(sale); csale = r2(csale); cost = r2(cost); const p = r2(csale - cost);
  return { sale: sale, cost: cost, profit: p, pct: cost > 0 ? Math.round(p / cost * 1000) / 10 : null, known: known, any: any, per: per };
}
/** What's wrong with a bill's lines and sums, or null when it adds up. Every line needs a quantity above 0 and a rate of 0 or more
    (and a GST % of 0–100 on a GST bill); the total (and on a GST bill the taxable value and tax) must match the lines to the
    paisa. expect: the sums the lines give. */
function billCheck_(b) {
  const L = b && Array.isArray(b.lines) ? b.lines : null, ok = v => typeof v === 'number' ? isFinite(v) : (String(v == null ? '' : v).trim() !== '' && isFinite(Number(v)));
  if (!L || !L.length) return { error: 'no_lines' };
  for (let i = 0; i < L.length; i++) { const l = L[i];
    if (!l || typeof l !== 'object' || !ok(l.qty) || !ok(l.rate) || !(Number(l.qty) > 0) || Number(l.rate) < 0 || Number(l.qty) >= 1e7 || Number(l.rate) >= 1e9 ||
      (b.gst && (!ok(l.gst) || Number(l.gst) < 0 || Number(l.gst) > 100))) return { error: 'bad_line', line: i + 1 }; }
  const m = billMath_(L, !!b.gst, !!b.igst), n = v => Number(String(v == null ? '' : v).replace(/[₹,\s]/g, '')), off = (a, x) => !(Math.abs(n(a) - x) < 0.005);
  if (off(b.total, m.total) || (b.gst && (off(b.taxable, m.taxable) || off(b.tax, m.tax)))) return { error: 'total_mismatch', expect: { total: m.total, taxable: m.taxable, tax: m.tax } };
  return null;
}
/** (v67) An amount as the app writes it on bills: Indian commas (1,25,000), up to 2 decimals, no trailing zeros. The app's
    screen and bill text (fmtN / rs) use this too, so the sheet can check a bill's text against its sums character for character. */
function inrN_(n) {
  let x = Number(n || 0); if (!isFinite(x)) return String(x);
  const neg = x < 0; x = Math.round(Math.abs(x) * 100) / 100;
  const p = x.toFixed(2).split('.'); let i = p[0]; const f = p[1].replace(/0+$/, '');
  if (i.length > 3) i = i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + i.slice(-3);
  return (neg && (i !== '0' || f) ? '-' : '') + i + (f ? '.' + f : '');
}
/** (v67) What's wrong with a bill's text (the WhatsApp / invoice text saved with it), or null when it matches the bill: it must
    show the bill's number, every line's amount ("= ₹…") and the total. The text is written on the phone; this stops a changed
    copy of the app (or a bug) from saving a bill whose text tells the customer something else. No text at all is fine (Past bills
    then builds it from the lines). no: the bill number the text should carry (0 = don't check). */
function billTextCheck_(b, no) {
  const tx = String(b && b.text || ''); if (!tx.trim()) return null;
  if (no > 0 && !new RegExp('(^|[^0-9])' + Math.floor(no) + '([^0-9]|$)').test(tx)) return { error: 'text_mismatch', what: 'no' };
  const L = b && Array.isArray(b.lines) ? b.lines : [];
  /* (v68) an amount counts only as a whole figure: "₹5" isn't found inside "₹50", "₹5,000" or "₹5.50" */
  const has = (pre, amt) => new RegExp(pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + String(amt).replace(/[.,]/g, '\\$&') + '(?![0-9,]|\\.[0-9])').test(tx);
  for (let i = 0; i < L.length; i++) { const l = L[i] || {}; if (!has('= ₹', inrN_((+l.qty || 0) * (+l.rate || 0)))) return { error: 'text_mismatch', what: 'line', line: i + 1 }; }
  if (!has('₹', inrN_(b.total))) return { error: 'text_mismatch', what: 'total' };
  return null;
}
/* ==== end of money.js ==== */
/** (v66) The sheet adds every bill up itself (money.js, the same code the phone uses): a bill whose total, taxable value or tax
    doesn't match its lines is refused (total_mismatch, with what the lines give), and its cost and profit are always worked out
    here from the lines' buy rates, never taken from the phone. Before, the phone's figures were saved as sent. */
function billSums_(b) { const bad = billCheck_(b); if (bad) return bad;
  const c = billCost_(b.lines); b.cost = c.any ? c.cost : ''; b.profit = c.any ? c.profit : ''; return null; }
function totalOk_(v) { const n = Number(String(v == null ? '' : v).replace(/[₹,\s]/g, '')); return String(v == null ? '' : v).trim() !== '' && isFinite(n) && n >= 0; }
function modeOf_(status, pays) {
  const atBill = pays.filter(p => p.at).reduce((x, p) => x + num_(p.a), 0);
  if (!status || status === 'Paid') return 'paid';
  return atBill > 0 ? 'part' : 'credit';
}
/** mode: paid | credit | part. received: amount taken at billing (part). later: payments recorded after the bill. */
function payCalc_(total, mode, received, later, by, note) {
  total = r2_(num_(total)); later = later || [];
  mode = mode === 'credit' || mode === 'part' ? mode : 'paid';
  const laterSum = r2_(later.reduce((x, p) => x + num_(p.a), 0));
  let atBill = mode === 'paid' ? Math.max(0, total - laterSum) : mode === 'credit' ? 0 : Math.max(0, Math.min(r2_(num_(received)), total));
  atBill = r2_(atBill);
  const paid = r2_(atBill + laterSum), due = r2_(Math.max(0, total - paid));
  const status = due > 0 ? (paid > 0 ? 'Part paid' : 'Credit') : (mode === 'paid' && !later.length ? 'Paid' : 'Cleared');
  const pays = (atBill > 0 && (mode !== 'paid' || later.length) ? [Object.assign({ d: new Date().toISOString(), a: atBill, by: by || '', at: 1 }, note ? { note: note } : {})] : []).concat(later);
  return { status: status, paid: paid, due: due, pays: pays, clearedAt: status === 'Cleared' ? new Date() : '' };
}
function payRow_(pc) { return [pc.status, pc.status === 'Paid' ? '' : pc.paid, pc.status === 'Paid' ? '' : pc.due, payJson_(pc.pays), pc.clearedAt]; }
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
      edits: num_(r[B.edits]), fy: String(r[B.fy] || ''), igst: r[B.igst] === 'IGST', custGstin: String(r[B.customerGstin] || ''), pos: String(r[B.pos] || ''), paidBy: String(r[B.paidBy] || ''), po: poOut_(r[B.po]), custAddr: String(r[B.custAddr] || '') });
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
  /* (v59) a payment carries the phone's id (pid): a resend after a lost reply finds it already recorded and changes nothing */
  const pid = /^[\w-]{6,40}$/.test(String(body.pid || '')) ? String(body.pid) : '';
  if (pid) { let used0 = 0, hit = false, cl0 = 0;
    vals.forEach(r => { payList_(r[B.payments]).forEach(p => { if (p.id === pid) { hit = true; used0 = r2_(used0 + num_(p.a)); if (num_(r[B.due]) <= 0) cl0++; } }); });
    if (hit) return { used: used0, left: r2_(Math.max(0, amount - used0)), cleared: cl0, dup: true }; }
  let targets = [];
  if (body.billId || body.row) {
    let i = body.billId ? vals.findIndex(r => String(r[B.billId]) === String(body.billId)) : -1;
    if (i < 0 && body.row) { const k = Number(body.row) - 2; if (k >= 0 && k < n && num_(vals[k][B.billNo]) === num_(body.n)) i = k; }
    if (i < 0) throw new Error(arcHas_(body.id) ? 'bill_archived' : 'bill_not_found');   // (v67) archived bills can't be changed
    if (vals[i][B.status] === 'Cancelled') throw new Error('bill_cancelled');   // (v64) e.g. queued on an offline phone while it was cancelled or moved
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
    const pays = payList_(r[B.payments]), pe = { d: new Date().toISOString(), a: take, by: by }; if (note) pe.note = note; if (pid) pe.id = pid; pays.push(pe);
    const paid = r2_(num_(r[B.paid]) + take), nd = r2_(Math.max(0, num_(r[B.total]) - paid));
    const st = nd > 0 ? 'Part paid' : 'Cleared'; if (st === 'Cleared') cleared++;
    s.getRange(i + 2, B.payment + 1, 1, 5).setValues([[st, paid, nd, payJson_(pays), st === 'Cleared' ? new Date() : '']]);
    mob = r[B.mobile];
  });
  if (left === amount) throw new Error('nothing_due');
  try { refreshDue_(mob); } catch (err) { softErr_('recordPayment:due', err); }
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
  if (i < 0) throw new Error(arcHas_(body.id) ? 'bill_archived' : 'bill_not_found');   // (v67) archived bills can't be changed
  const r = vals[i], pays = payList_(r[B.payments]);
  let j = -1; for (let x = pays.length - 1; x >= 0; x--) if (!pays[x].at) { j = x; break; }
  if (j < 0) throw new Error('nothing_to_undo');
  const gone = pays.splice(j, 1)[0];
  const paid = r2_(pays.reduce((x, p) => x + num_(p.a), 0)), due = r2_(Math.max(0, num_(r[B.total]) - paid));
  const st = due > 0 ? (paid > 0 ? 'Part paid' : 'Credit') : 'Cleared';
  s.getRange(i + 2, B.payment + 1, 1, 5).setValues([[st, paid, due, payJson_(pays), st === 'Cleared' ? r[B.clearedAt] : '']]);
  try { refreshDue_(r[B.mobile]); } catch (err) { softErr_('undoPayment:due', err); }
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
  return { customer: { address: String(r[8] || ''), note: String(r[9] || ''), name: String(r[1] || ''), gstin: String(r[2] || ''), count: num_(r[3]), total: num_(r[4]), last: isNaN(d) ? '' : d.toISOString(), lastBillNo: num_(r[6]), due: num_(r[7]) } };
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
    const m = mob10_(r[0]), id = m ? '' : custId_(r[0]); if (!m && !id) return;
    const d = r[5] instanceof Date ? r[5] : new Date(r[5]);
    out.push([m, String(r[1] || ''), String(r[2] || ''), num_(r[3]), num_(r[4]), isNaN(d) ? '' : d.toISOString(), num_(r[7]), String(r[8] || ''), String(r[9] || ''), num_(r[6]), String(r[12] || ''), String(r[13] || ''), id]);   // + address, note, last bill no.; v55: contact, email, id (customers without a mobile)
  });
  return { customers: out, brev: v };
}

/** Add or edit a customer (Customers page). Name is needed; mobile, GSTIN, address, contact person, email and note are optional.
 *  x.key = the customer being edited (their mobile, or 'c-…' for one saved without a mobile); no key = a new customer.
 *  Name/GSTIN/address/… change only the customer, never past bills (they keep what was sent). A new mobile moves this mode's
 *  bills to it (their mobile column) and joins the two customers if the new number already exists. */
function saveCustomer_(x, by) {
  const isNew = !x.key && x.newMobile === undefined;   // older apps edit with {mobile, newMobile}
  const key = String(x.key || x.mobile || '').trim(), k = isNew ? '' : (mob10_(key) || custId_(key));
  if (!isNew && !k) throw new Error('bad_mobile');
  const nmIn = x.newMobile !== undefined ? String(x.newMobile || '').trim() : (isNew ? String(x.mobile || '').trim() : (mob10_(key) ? key : ''));
  const k2 = nmIn ? mob10_(nmIn) : '';
  if (nmIn && !k2) throw new Error('bad_mobile');
  const name = String(x.name || '').trim(); if (!name && (isNew || x.key)) throw new Error('bad_name');
  const g = String(x.gstin || '').trim().toUpperCase();
  if (g && !/^\d{2}[A-Z0-9]{13}$/.test(g)) throw new Error('bad_gstin');
  const email = String(x.email || '').trim(); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('bad_email');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { const s = customersSheet_();
    let i;
    if (isNew) {
      const dup = k2 ? custRow_(s, k2) : (g ? custRowBy_(s, r => !mob10_(r[0]) && String(r[2] || '').trim().toUpperCase() === g) : -1);
      /* (v59) a phone saving in the background names the new customer itself (cid), so a resend after a lost reply finds it
         instead of adding a second one */
      const cid = /^c-[a-z]{10}$/.test(String(x.cid || '')) ? String(x.cid) : '';
      if (cid) { const was0 = custRowBy_(s, r => String(r[0]) === cid); if (was0 > 0) return { key: k2 || cid, dup: true }; }
      if (dup > 0) { const o = s.getRange(dup, 1, 1, CUST_COLS.length).getValues()[0];
        if (cid && k2 && String(o[1] || '').trim() === name && String(o[11] || '').trim() === String(by || '').trim()) return { key: k2, dup: true };   // the same new customer sent again
        const e = new Error('cust_exists'); e.extra = { name: String(o[1] || ''), key: mob10_(o[0]) || custId_(o[0]) }; throw e; }
      s.appendRow(CPAD_([k2 ? "'" + k2 : (cid || custNewId_()), '', '', 0, 0, '', '', 0])); i = s.getLastRow();
    } else {
      i = mob10_(k) ? custRow_(s, k) : custRowBy_(s, r => String(r[0]) === k);
      if (i < 0) { if (!mob10_(k)) throw new Error('cust_not_found'); s.appendRow(CPAD_(["'" + k, '', '', 0, 0, '', '', 0])); i = custRow_(s, k); }
    }
    const r = CPAD_(s.getRange(i, 1, 1, CUST_COLS.length).getValues()[0]);
    r[1] = str_(name, 80); r[2] = g; r[8] = str_(String(x.address || '').trim(), 300); r[9] = str_(String(x.note || '').trim(), 300); r[10] = new Date(); r[11] = by;
    if (x.contact !== undefined) r[12] = str_(String(x.contact || '').trim(), 80);
    if (x.email !== undefined) r[13] = str_(email, 100);
    const was = mob10_(r[0]);
    let moved = 0, keyOut;
    if (!isNew && k2 && k2 !== was) {   // a new (or first) mobile for this customer
      if (was) { const B = BILL_COLS.reduce((m, c, j) => (m[c] = j, m), {});
        [sheet_(tab_('Bills'), BILL_COLS)].concat(arcSheets_('', '').map(x => x.s)).forEach(bs => { const n = bs.getLastRow() - 1; let m2 = 0;   // (v67) archived bills too, so the customer's count stays whole
          if (n > 0) { const col = bs.getRange(2, B.mobile + 1, n, 1).getValues(); col.forEach(c => { if (mob10_(c[0]) === was) { c[0] = "'" + k2; m2++; } }); if (m2) bs.getRange(2, B.mobile + 1, n, 1).setValues(col); moved += m2; } }); }
      const j = custRow_(s, k2);
      if (j > 0 && j !== i) { const o = CPAD_(s.getRange(j, 1, 1, CUST_COLS.length).getValues()[0]); [1, 2, 8, 9, 12, 13].forEach(c => { if (!r[c]) r[c] = o[c]; }); r[0] = "'" + k2; s.getRange(j, 1, 1, CUST_COLS.length).setValues([r]); s.deleteRow(i); }
      else { r[0] = "'" + k2; s.getRange(i, 1, 1, CUST_COLS.length).setValues([r]); }
      recountCustomers_(); bumpB_(true); keyOut = k2;
    } else {
      if (!isNew && !nmIn && was && x.newMobile !== undefined) throw new Error('bad_mobile');   // a mobile can be changed, not removed
      if (was) r[0] = "'" + was; s.getRange(i, 1, 1, CUST_COLS.length).setValues([r]);
      keyOut = was || String(r[0]);
      if (isNew) recountCustomers_();   // a company saved after billing it: its earlier bills (by GSTIN) count
      bumpB_(false, 'cust:' + keyOut);    // customers list refreshes; no bills to resend
    }
    const out = mob10_(keyOut) ? findCustomer_(keyOut) : { customer: null };
    return Object.assign(out, { mobile: mob10_(keyOut), key: keyOut, moved: moved }); }
  catch (e) { if (e.extra) return { ok: false, error: e.message, existing: e.extra }; throw e; }
  finally { lock.releaseLock(); } }
function custId_(v) { const t = String(v || '').trim(); return /^c-[a-z]{6,20}$/.test(t) ? t : ''; }
function custNewId_() { let t = 'c-'; const L = 'abcdefghijkmnpqrstuvwxyz'; for (let n = 0; n < 10; n++) t += L.charAt(Math.floor(Math.random() * L.length)); return t; }   // letters only: never mistaken for a mobile
function custRowBy_(s, f) { const n = s.getLastRow() - 1; if (n < 1) return -1; const v = s.getRange(2, 1, n, CUST_COLS.length).getValues(); for (let i = 0; i < n; i++) if (f(v[i])) return i + 2; return -1; }
function mob10_(m) { const d = String(m || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? d : ''; }

/** The Customers tab: one row per mobile. Built once from existing bills the first time it's needed. */
function customersSheet_() {
  const ss = ss_();
  let s = ss.getSheetByName(tab_('Customers'));
  if (s) return s;
  s = sheet_(tab_('Customers'), CUST_COLS);
  const bs = sheet_(tab_('Bills'), BILL_COLS);
  const n = bs.getLastRow() - 1, ar = arcRows_('', '');   // (v67) archived years too
  if (n < 1 && !ar.length) return s;
  const B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const v = ar.map(r => r.slice(0, B.igst + 1)).concat(n > 0 ? bs.getRange(2, 1, n, B.igst + 1).getValues() : []);
  let dueV = null; try { dueV = ar.map(r => r.slice(B.payment, B.payment + 3)).concat(n > 0 ? bs.getRange(2, B.payment + 1, n, 3).getValues() : []); } catch (err) {}
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
  const rows = order.map(k => CPAD_(map[k]));
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
  const k = mob10_(mobile);
  if (!k) { const g = String(gstin || '').trim().toUpperCase(); if (!g) return; const s0 = customersSheet_(), j = custRowBy_(s0, r => String(r[2] || '').trim().toUpperCase() === g); if (j < 0) return;   // a saved company without a mobile (v55)
    const r = s0.getRange(j, 1, 1, CUST_COLS.length).getValues()[0]; if (newBill) { r[3] = num_(r[3]) + 1; r[4] = r2_(num_(r[4]) + num_(total)); r[5] = new Date(); r[6] = billNo; s0.getRange(j, 1, 1, CUST_COLS.length).setValues([r]); } return; }
  const s = customersSheet_();
  const i = custRow_(s, k);
  name = String(name || '').trim(); gstin = String(gstin || '').trim();
  if (i < 0) { s.appendRow(CPAD_(["'" + k, str_(name, 80), str_(gstin, 20), 1, num_(total), new Date(), billNo, 0])); return; }
  const r = s.getRange(i, 1, 1, CUST_COLS.length).getValues()[0];
  if (name) r[1] = str_(name, 80);
  if (gstin) r[2] = str_(gstin, 20);
  if (newBill) { r[3] = num_(r[3]) + 1; r[4] = Math.round((num_(r[4]) + num_(total)) * 100) / 100; r[5] = new Date(); r[6] = billNo; }
  r[0] = "'" + k;
  s.getRange(i, 1, 1, CUST_COLS.length).setValues([r]);
}


