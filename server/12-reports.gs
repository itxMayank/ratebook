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
  if (i < 0) throw new Error(arcHas_(body.id) ? 'bill_archived' : 'bill_not_found');   // (v67) archived bills can't be changed
  const r = vals[i];
  if (!cancel && /^Moved to No\. /.test(String(r[B.cancelReason] || ''))) throw new Error('bill_moved');   // (v63) its sale now lives on the new bill
  if (cancel) {
    if (r[B.status] === 'Cancelled') throw new Error('bill_cancelled');   // (v64) keeps who cancelled it and why ("Moved to No. X" could be overwritten, then restored)
    const reason = str_(body.reason || '', 120).trim(); if (!reason) throw new Error('need_reason');
    s.getRange(i + 2, B.status + 1, 1, 4).setValues([['Cancelled', new Date(), by, reason]]);
  } else s.getRange(i + 2, B.status + 1, 1, 4).setValues([['', '', '', '']]);
  sheet_(tab_('BillHistory'), HISTORY_COLS).appendRow([String(r[B.billId] || ''), r[B.billNo], new Date(), by, (cancel ? 'CANCELLED: ' + str_(body.reason || '', 120) : 'RESTORED') ]);
  try { recountCustomers_(); } catch (err) { softErr_('cancelBill:recount', err); }
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
  let received = 0, creditGiven = 0, outstanding = 0; const modes = {};   // money that came in during the period, by how it was paid ('' = not marked)
  const addMode = (k, a) => { k = paidBy_(k) || (String(k || '') === 'Bank' ? 'Bank' : ''); modes[k] = r2_((modes[k] || 0) + num_(a)); };
  /* (v67) a period that reaches into archived years reads those tabs too (one year earlier as well: money received in the
     period on a bill from the year before) */
  const yb = /^\d{4}-\d{2}-\d{2}$/.test(from) ? (Number(from.slice(0, 4)) - 1) + from.slice(4) : '';
  arcRows_(yb, to).concat(n > 0 ? s.getRange(2, 1, n, BILL_COLS.length).getValues() : []).forEach(r => {
    const d = r[B.date] instanceof Date ? r[B.date] : new Date(r[B.date]);
    const day = dayOf(d);
    const st = String(r[B.payment] || '');
    const isCan = r[B.status] === 'Cancelled';
    if (!isCan && (st === 'Credit' || st === 'Part paid')) outstanding = r2_(outstanding + num_(r[B.due]));
    payList_(r[B.payments]).forEach(p => { const pd = dayOf(new Date(p.d)); if (!p.at && pd && (!from || pd >= from) && (!to || pd <= to) && !isCan) { received = r2_(received + num_(p.a)); addMode(p.note, p.a); } });
    if (!day || (from && day < from) || (to && day > to)) return;
    const gst = r[B.gstBill] === 'Yes';
    if (isCan) { T.cancelled++; if (gst) register.push({ date: day, no: num_(r[B.billNo]), fy: String(r[B.fy] || ''), customer: String(r[B.customer] || ''), gstin: String(r[B.customerGstin] || ''), pos: String(r[B.pos] || ''), taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0, status: 'Cancelled' }); return; }
    const total = num_(r[B.total]);
    T.bills++; T.sales = r2_(T.sales + total);
    { const atB = (!st || st === 'Paid') ? total : payList_(r[B.payments]).filter(p => p.at).reduce((x, p) => x + num_(p.a), 0); if (atB > 0) addMode(r[B.paidBy], atB); }
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
    received: received, creditGiven: r2_(creditGiven), outstanding: outstanding, modes: modes, register: register.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.no - b.no) } };
}

