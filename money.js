/* Bill sums: the one place they're worked out (21 Oct 2026). The app uses these for the bill page, the WhatsApp text, PDFs and
   printouts; the sheet script uses the very same code to check every bill it saves, so a bill whose total, taxable value or tax
   doesn't add up from its lines is refused. tools/stamp.js copies everything below "use strict" into Code.gs between the
   "money.js" markers; tests/money.test.js fails if the copies differ. Edit this file only, then run node tools/stamp.js.
   Pure: no names from the app or the script, so it works in both. */
"use strict";
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
