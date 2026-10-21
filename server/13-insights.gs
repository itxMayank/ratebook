/* ======================= Insights: the owner's business page (13 Oct 2026, v48) =======================
 * One pass over the last 180 days of this mode's bills, plus the price list, Purchases (bill lines matched to items), vendors
 * and dues. Plain rules, no AI; every estimate is marked as one. Only bills that weren't cancelled count. The phone turns
 * the result into text in its own language (keys and numbers only here). Cached until prices, bills or vendors change, or
 * the day changes (rcRead_). Owner only (NEEDS). */
const INS_DAYS_ = 180;
function insights_(body) {
  const tz = isFinite(Number(body.tz)) ? Math.round(Number(body.tz)) : -330;
  const dayOf = d => isNaN(d) ? '' : new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
  const today = dayOf(new Date());
  try { phEnsure_(); } catch (e) { softErr_('insights:priceHistory', e); }   // the price history's one-time start from past bills
  return rcRead_('ins:' + ENV_ + ':' + tz, () => getRev_() + ':' + brevC_(ENV_) + ':' + vrevC_(ENV_) + ':' + today, () => insightsBuild_(dayOf, today)); }
/** The admin dashboard asks for a shop's business page with the shop's own health key (the Directory holds it), real or test mode. */
function insightsKey_(p) { const P = PropertiesService.getScriptProperties(), b = boot_(), want = P.getProperty('HEALTH_KEY') || (b && b.healthKey) || '';
  if (!want || !keyEq_(p.key, want)) return { ok: false, error: 'bad_key' };
  ENV_ = p.env === 'test' ? 'test' : 'live'; return insights_({ tz: p.tz }); }
/** The charts' day-by-day figures: arrays from `from`, one value per day; `due` = what customers owed at the end of each day. */
function insSeries_(SR, from, base) { let o = base; const due = SR.given.map((g, i) => (o = r2_(Math.max(0, o + g - SR.got[i])))); return Object.assign({ from, due }, SR); }
function insDay_(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function insGap_(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
function insightsBuild_(dayOf, today) {
  const cfg = readConfig_(), roundTo = cfg.roundTo === undefined || cfg.roundTo === '' ? 1 : Number(cfg.roundTo) || 0;
  const rnd = v => roundTo > 0 ? Math.round(v / roundTo) * roundTo : r2_(v);
  const d30 = insDay_(today, -29), p30 = insDay_(today, -59), d60 = insDay_(today, -59), d90 = insDay_(today, -89), start = insDay_(today, -(INS_DAYS_ - 1));
  const mStart = today.slice(0, 8) + '01', dayN = Number(today.slice(8, 10));
  const lmStart = insDay_(mStart, -1).slice(0, 8) + '01', lmEndFull = insDay_(mStart, -1), lmEnd = insDay_(lmStart, dayN - 1) < lmEndFull ? insDay_(lmStart, dayN - 1) : lmEndFull;
  /* price list */
  const ITEMS_ = (listCached_().items || []), byId = {}, byName = {};
  ITEMS_.forEach(it => { byId[it.id] = it; const nm = String(it.name || '').trim().toLowerCase(); if (nm && !byName[nm]) byName[nm] = it; });
  const ref = it => ({ id: it.id, name: it.name, unit: it.unit });
  /* price history: each item's latest buy-price change (earlier price and when) */
  const PHR = phRows_(), PHI = {}; PHR.filter(x => x.f === 'buy' && x.o > 0).sort((a, b) => a.at - b.at).forEach(x => { PHI[x.id] = { pb: x.o, on: x.day, n: x.n }; });
  /* purchases (matched vendor-bill lines): per item, by date, in the item's own unit */
  const SS = ss_(), has = nm => !!SS.getSheetByName(tab_(nm));   // read only what exists: this page never adds tabs to the sheet
  const pur = {}; if (has('Purchases')) try { const P = vtab_('Purchases', PUR_COLS);
    P.rows.forEach(r => { const id = String(r.itemId || ''); if (!id || !byId[id]) return; const d = vday_(r.date); if (!d || d < start) return; const f = num_(r.f) || 1;
      (pur[id] = pur[id] || []).push({ d, q: r2_(num_(r.qty) / f), buy: num_(r.buy), v: String(r.vendorId || '') }); });
    Object.keys(pur).forEach(id => pur[id].sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0)); } catch (e) {}
  const lastPur = {}; Object.keys(pur).forEach(id => { const L = pur[id], last = L[L.length - 1].d; lastPur[id] = { d: last, q: r2_(L.filter(p => p.d === last).reduce((t, p) => t + p.q, 0)), v: L[L.length - 1].v }; });
  /* bills: from the first row in the window (rows are added in date order) */
  const s = SS.getSheetByName(tab_('Bills')), n = s ? s.getLastRow() - 1 : 0, B = BILL_COLS.reduce((m, k, i) => (m[k] = i, m), {});
  const P = { today: { sales: 0, bills: 0, pSale: 0, pCost: 0 }, mtd: { sales: 0, bills: 0, pSale: 0, pCost: 0 }, lm: { sales: 0, bills: 0, pSale: 0, pCost: 0 }, d30: { sales: 0, bills: 0, pSale: 0, pCost: 0, lineSale: 0, noBuy: 0 } };
  const IT = {}, CUS = {}, STAFF = {}, GRP = {}, modes = {}; let given30 = 0, collected30 = 0;
  /* day by day for the charts (v49): the last 90 days; credit owed is rebuilt from every credit bill, also older ones */
  const SN = 90, sFrom = insDay_(today, -(SN - 1)), z = () => new Array(SN).fill(0);
  const SR = { sales: z(), bills: z(), pSale: z(), pCost: z(), given: z(), got: z() }; let dueBase = 0;
  const sIdx = day => { const i = insGap_(sFrom, day); return i >= 0 && i < SN ? i : -1; };
  const creditEv = (day, total, pay, pays) => { if (pay !== 'Credit' && pay !== 'Part paid' && pay !== 'Cleared') return;
    const L = payList_(pays), owed = r2_(total - L.filter(p => p.at).reduce((x, p) => x + num_(p.a), 0)); if (!(owed > 0)) return;
    const i = sIdx(day); if (day < sFrom) dueBase = r2_(dueBase + owed); else if (i >= 0) SR.given[i] = r2_(SR.given[i] + owed);
    L.forEach(p => { if (p.at) return; const pd = dayOf(new Date(p.d)), j = pd ? sIdx(pd) : -1; if (pd && pd < sFrom) dueBase = r2_(dueBase - num_(p.a)); else if (j >= 0) SR.got[j] = r2_(SR.got[j] + num_(p.a)); }); };
  const modesT = {}, addMode = (k, a, d) => { k = paidBy_(k) || (String(k || '') === 'Bank' ? 'Bank' : ''); modes[k] = r2_((modes[k] || 0) + num_(a)); if (d === today) modesT[k] = r2_((modesT[k] || 0) + num_(a)); };   // modesT: today only (v50, the owner's daily summary)
  if (n > 0) {
    const dates = s.getRange(2, B.date + 1, n, 1).getValues(); let i0 = n;
    for (let i = 0; i < n; i++) { const d = dates[i][0] instanceof Date ? dates[i][0] : new Date(dates[i][0]); if (dayOf(d) >= start) { i0 = i; break; } }
    const rows = i0 < n ? s.getRange(2 + i0, 1, n - i0, BILL_COLS.length).getValues() : [];
    if (i0 > 0) { const col = k => s.getRange(2, B[k] + 1, i0, 1).getValues(), st0 = col('status'), pa0 = col('payment'), to0 = col('total'), ps0 = col('payments');
      for (let i = 0; i < i0; i++) { if (st0[i][0] === 'Cancelled') continue; const p0 = String(pa0[i][0] || ''); if (p0 !== 'Credit' && p0 !== 'Part paid' && p0 !== 'Cleared') continue;
        const d = dates[i][0] instanceof Date ? dates[i][0] : new Date(dates[i][0]); creditEv(dayOf(d), num_(to0[i][0]), p0, ps0[i][0]); } }
    rows.forEach(r => {
      const d = r[B.date] instanceof Date ? r[B.date] : new Date(r[B.date]), day = dayOf(d); if (!day) return;
      const by = String(r[B.by] || '').trim() || '?', in30 = day >= d30, isCan = r[B.status] === 'Cancelled', st = String(r[B.payment] || '');
      const sf = STAFF[by] || (STAFF[by] = { name: by, bills: 0, edited: 0, cancelled: 0, sales: 0 });
      payList_(r[B.payments]).forEach(p => { const pd = dayOf(new Date(p.d)); if (!p.at && pd >= d30 && !isCan) { collected30 = r2_(collected30 + num_(p.a)); addMode(p.note, p.a, pd); } });
      if (isCan) { if (in30) sf.cancelled++; return; }
      const total = num_(r[B.total]), si = sIdx(day);
      creditEv(day, total, st, r[B.payments]); if (si >= 0) { SR.sales[si] = r2_(SR.sales[si] + total); SR.bills[si]++; }
      if (in30) { sf.bills++; sf.sales = r2_(sf.sales + total); if (num_(r[B.edits]) > 0) sf.edited++;
        const atB = (!st || st === 'Paid' || st === 'Cleared') ? total : payList_(r[B.payments]).filter(p => p.at).reduce((x, p) => x + num_(p.a), 0); if (atB > 0) addMode(r[B.paidBy], atB, day);
        if (st === 'Credit' || st === 'Part paid') given30 = r2_(given30 + total - payList_(r[B.payments]).filter(p => p.at).reduce((x, p) => x + num_(p.a), 0)); }
      const per = [];
      if (day === today) per.push(P.today); if (day >= mStart) per.push(P.mtd); if (day >= lmStart && day <= lmEnd) per.push(P.lm); if (in30) per.push(P.d30);
      per.forEach(x => { x.sales = r2_(x.sales + total); x.bills++; });
      /* customers */
      const mob = mob10_(r[B.mobile]), nm = String(r[B.customer] || '').trim(), ck = mob || (nm ? 'name:' + nm.toLowerCase() : '');
      if (ck) { const c = CUS[ck] || (CUS[ck] = { mobile: mob, name: nm, recent: 0, before: 0, last: '', total: 0, paidDays: [] });
        if (nm) c.name = nm; if (day >= d60) c.recent++; else c.before++; if (day > c.last) c.last = day; c.total = r2_(c.total + total);
        const ca = num_(r[B.clearedAt]); if (ca) c.paidDays.push(Math.max(0, insGap_(day, dayOf(new Date(ca))))); }
      /* lines */
      let lines = []; try { lines = JSON.parse(r[B.lines] || '[]'); } catch (e) {}
      const seen = {};
      lines.forEach(l => {
        const it = byId[String(l.id || '')] || byName[String(l.name || '').trim().toLowerCase()]; const q = num_(l.qty), rt = num_(l.rate), amt = r2_(q * rt);
        const alt = !!(l.alt && it && it.altQty > 0), qM = alt ? q / it.altQty : q, rM = alt ? rt * it.altQty : rt;
        let lb = num_(l.buy); if (!(lb > 0) && it && it.buy > 0) lb = alt ? it.buy / it.altQty : it.buy;
        per.forEach(x => { if (lb > 0) { x.pSale = r2_(x.pSale + amt); x.pCost = r2_(x.pCost + q * lb); } });
        if (si >= 0 && lb > 0) { SR.pSale[si] = r2_(SR.pSale[si] + amt); SR.pCost[si] = r2_(SR.pCost[si] + q * lb); }
        if (in30) { P.d30.lineSale = r2_(P.d30.lineSale + amt); if (!(lb > 0)) P.d30.noBuy = r2_(P.d30.noBuy + amt); }
        if (!it) return;
        const a = IT[it.id] || (IT[it.id] = { q30: 0, a30: 0, qP: 0, aP: 0, a90: 0, a180: 0, q180: 0, last: '', bills30: 0, rates: {}, below: 0, belowAmt: 0, leak: 0, pSale30: 0, pCost30: 0, noBuy30: 0, sinceBuy: 0 });
        a.a180 = r2_(a.a180 + amt); a.q180 = r2_(a.q180 + qM); if (day > a.last) a.last = day;
        { const sbl = num_(l.buy); if (sbl > 0) { const sbM = r2_(alt ? sbl * it.altQty : sbl); if (Math.abs(sbM - (+it.buy || 0)) >= 0.005 && (!a.pbD || day >= a.pbD)) { a.pb = sbM; a.pbD = day; } } }
        if (day >= d90) a.a90 = r2_(a.a90 + amt);
        if (lastPur[it.id] && day >= lastPur[it.id].d) a.sinceBuy = r2_(a.sinceBuy + qM);
        if (in30) { a.q30 = r2_(a.q30 + qM); a.a30 = r2_(a.a30 + amt); if (!seen[it.id]) { seen[it.id] = 1; a.bills30++; }
          /* (v53) sold below cost: judged by the buy price saved on the line when it was billed (a buy price raised later
             doesn't turn an old sale into a loss); lines that saved none use today's, counted separately as an estimate */
          const sb = num_(l.buy);
          if (sb > 0) { if (rt < sb - 0.005) { a.below++; a.belowAmt = r2_(a.belowAmt + (sb - rt) * q); a.belowBuy = alt ? r2_(sb * it.altQty) : sb; } }
          else if (it.buy > 0 && rM < it.buy - 0.005) { a.below++; const d = r2_((it.buy - rM) * qM); a.belowAmt = r2_(a.belowAmt + d); a.belowEst = r2_((a.belowEst || 0) + d); a.belowBuy = it.buy; }
          /* "below your list price": compared with the list price saved on the line when it was billed (lp, per main unit, from
             v52), else today's list price (older bills: counted separately as an estimate, since the price may have changed) */
          const lpS = num_(l.lp), lpM = lpS > 0 ? lpS : it.sell, rk = String(r2_(rM)), bk = String(r[B.billId] || r[B.billNo]);
          const RR = a.rates[rk] || (a.rates[rk] = { r: r2_(rM), q: 0, n: 0, lk: 0, _b: {} }); RR.q = r2_(RR.q + qM); if (!RR._b[bk]) { RR._b[bk] = 1; RR.n++; }
          if (lpM > 0 && rM < lpM - 0.005) { const d = r2_((lpM - rM) * qM); a.leak = r2_(a.leak + d); RR.lk = r2_(RR.lk + d); if (!(lpS > 0)) a.leakEst = r2_((a.leakEst || 0) + d); }
          if (lb > 0) { a.pSale30 = r2_(a.pSale30 + amt); a.pCost30 = r2_(a.pCost30 + q * lb); } else a.noBuy30 = r2_(a.noBuy30 + amt);
          const g = it.cat || '', G = GRP[g] || (GRP[g] = { cat: g, sales: 0, pSale: 0, pCost: 0, items: 0 }); G.sales = r2_(G.sales + amt); if (lb > 0) { G.pSale = r2_(G.pSale + amt); G.pCost = r2_(G.pCost + q * lb); } }
        else if (day >= p30) { a.qP = r2_(a.qP + qM); a.aP = r2_(a.aP + amt); }
      });
    });
  }
  const pct = (sale, cost) => cost > 0 ? Math.round((sale - cost) / cost * 1000) / 10 : null;
  const pulse = {}; ['today', 'mtd', 'lm', 'd30'].forEach(k => { const x = P[k]; pulse[k] = { sales: x.sales, bills: x.bills, avg: x.bills ? r2_(x.sales / x.bills) : 0, profit: r2_(x.pSale - x.pCost), pct: pct(x.pSale, x.pCost) }; });
  pulse.d30.noBuy = P.d30.noBuy; pulse.d30.lineSale = P.d30.lineSale; pulse.lmTo = lmEnd;
  /* items */
  const sold = Object.keys(IT).map(id => Object.assign({ it: byId[id] }, IT[id]));
  const tot90 = sold.reduce((t, x) => t + x.a90, 0); let cum = 0;
  const abc = sold.filter(x => x.a90 > 0).sort((a, b) => b.a90 - a.a90).filter(x => { const keep = cum < tot90 * 0.8; cum += x.a90; return keep; }).slice(0, 30).map(x => x.it.id);
  const tot30 = P.d30.lineSale, floor = Math.max(500, tot30 * 0.02);
  const trend = sold.filter(x => Math.max(x.a30, x.aP) >= floor && x.aP > 0).map(x => ({ ...ref(x.it), a30: x.a30, aP: x.aP, ch: Math.round((x.a30 - x.aP) / x.aP * 100) }));
  const rising = trend.filter(x => x.ch >= 30).sort((a, b) => (b.a30 - b.aP) - (a.a30 - a.aP)).slice(0, 8), falling = trend.filter(x => x.ch <= -30).sort((a, b) => (a.a30 - a.aP) - (b.a30 - b.aP)).slice(0, 8);
  const stopped = sold.filter(x => x.last && x.last < d60 && x.a180 > 0).sort((a, b) => b.a180 - a.a180).slice(0, 10).map(x => ({ ...ref(x.it), last: x.last, a180: x.a180 }));
  const oldEnough = it => !it.updatedAt || dayOf(new Date(it.updatedAt)) < d60;
  const unsoldAll = ITEMS_.filter(it => !IT[it.id] && oldEnough(it)), unsold = { n: unsoldAll.length, items: unsoldAll.slice(0, 20).map(ref) };
  const top = sold.filter(x => x.a30 > 0).sort((a, b) => b.a30 - a.a30).slice(0, 10).map(x => ({ ...ref(x.it), q30: x.q30, a30: x.a30, bills30: x.bills30, profit30: x.pSale30 ? r2_(x.pSale30 - x.pCost30) : null, pct: pct(x.pSale30, x.pCost30), abc: abc.indexOf(x.it.id) >= 0 }));
  /* margins */
  const groups = Object.keys(GRP).map(k => { const g = GRP[k]; return { cat: g.cat, sales: g.sales, profit: g.pSale ? r2_(g.pSale - g.pCost) : null, pct: pct(g.pSale, g.pCost), share: tot30 ? Math.round(g.sales / tot30 * 1000) / 10 : 0 }; }).sort((a, b) => b.sales - a.sales);
  const mg = it => it.buy > 0 && it.sell > 0 ? Math.round((it.sell - it.buy) / it.buy * 1000) / 10 : null;
  const belowList = ITEMS_.filter(it => it.buy > 0 && it.sell > 0 && it.sell < it.buy).map(it => ({ ...ref(it), buy: it.buy, sell: it.sell, a30: IT[it.id] ? IT[it.id].a30 : 0 })).sort((a, b) => b.a30 - a.a30).slice(0, 15);
  const soldBelow = sold.filter(x => x.below > 0).sort((a, b) => b.belowAmt - a.belowAmt).slice(0, 10).map(x => ({ ...ref(x.it), lines: x.below, lost: x.belowAmt, buy: x.belowBuy || x.it.buy, est: x.belowEst || 0 }));
  const thin = ITEMS_.filter(it => { const m = mg(it); return m !== null && m >= 0 && m < 5 && IT[it.id] && IT[it.id].a30 > 0; }).map(it => ({ ...ref(it), buy: it.buy, sell: it.sell, pct: mg(it), a30: IT[it.id].a30 })).sort((a, b) => b.a30 - a.a30).slice(0, 10);
  /* each rate charged: qty (in the item's own unit), bills, and how much below the list price at that rate; most sold first */
  const spread = sold.filter(x => Object.keys(x.rates).length >= 3 && x.leak > 0).sort((a, b) => b.leak - a.leak).slice(0, 10).map(x => { const R = Object.keys(x.rates).map(k => x.rates[k]), rs = R.map(v => v.r);
    return { ...ref(x.it), rates: rs.length, min: Math.min(...rs), max: Math.max(...rs), sell: x.it.sell, leak: x.leak, est: x.leakEst || 0,
      brk: R.sort((a, b) => b.q - a.q || b.r - a.r).slice(0, 12).map(v => ({ r: v.r, q: v.q, n: v.n, lk: v.lk })) }; });
  const noBuyItems = sold.filter(x => x.noBuy30 > 0).sort((a, b) => b.noBuy30 - a.noBuy30).slice(0, 10).map(x => ({ ...ref(x.it), a30: x.noBuy30 }));
  /* buy price went up on a vendor bill but the selling price didn't follow: suggest the price at the item's earlier margin */
  const buyUp = [];
  Object.keys(pur).forEach(id => { const L = pur[id].filter(p => p.buy > 0), it = byId[id]; if (L.length < 2 || !(it.sell > 0)) return;
    const last = L[L.length - 1]; let prev = null; for (let i = L.length - 2; i >= 0; i--) if (L[i].d < last.d) { prev = L[i]; break; } if (!prev || insGap_(last.d, today) > 60) return;
    const up = (last.buy - prev.buy) / prev.buy; if (up < 0.03) return; const m = (it.sell - prev.buy) / prev.buy; if (m <= 0) return;
    const want = rnd(last.buy * (1 + m)); if (!(want > it.sell)) return;
    buyUp.push({ ...ref(it), was: r2_(prev.buy), now: r2_(last.buy), up: Math.round(up * 1000) / 10, on: last.d, sell: it.sell, suggest: want, pctNow: Math.round((it.sell - last.buy) / last.buy * 1000) / 10, pctWas: Math.round(m * 1000) / 10, q30: IT[id] ? IT[id].q30 : 0 }); });
  buyUp.sort((a, b) => (b.suggest - b.sell) * (b.q30 || 1) - (a.suggest - a.sell) * (a.q30 || 1));
  /* (v53) the buy price is now at or above the sell price (often just raised): "check the sell price", with the price at the
     earlier margin when an earlier buy price is known (from bill lines; from v53's price history too) */
  const checkSell = ITEMS_.filter(it => it.buy > 0 && it.sell > 0 && it.sell <= it.buy + 0.005).map(it => { const a = IT[it.id] || {}, ph = PHI[it.id] && Math.abs(PHI[it.id].n - it.buy) < 0.005 ? PHI[it.id] : null;
    const pb = ph && ph.pb > 0 ? ph.pb : a.pb > 0 ? a.pb : 0, pbOn = ph && ph.pb > 0 ? ph.on : (a.pbD || '');
    const m = pb > 0 && pb < it.buy && it.sell > pb ? (it.sell - pb) / pb : 0, suggest = m > 0 ? rnd(it.buy * (1 + m)) : 0;
    return { ...ref(it), buy: it.buy, sell: it.sell, was: pb || null, on: pbOn, pctWas: m > 0 ? Math.round(m * 1000) / 10 : null, suggest: suggest > it.sell ? suggest : 0,
      q30: a.q30 || 0, a30: a.a30 || 0, lost: a.belowAmt || 0 }; }).sort((a, b) => b.a30 - a.a30 || b.buy - b.sell - (a.buy - a.sell));
  const chk = {}; checkSell.forEach(x => chk[x.id] = 1);
  /* price changes in the last 30 days (price history): per item, buy and sell from → to, and the margin then and now */
  const pch = {}; PHR.filter(x => x.day >= d30 && (x.f === 'buy' || x.f === 'sell') && byId[x.id]).sort((a, b) => a.at - b.at).forEach(x => {
    const c = pch[x.id] || (pch[x.id] = { ...ref(byId[x.id]), buy: null, sell: null, on: '', est: true });
    if (!c[x.f]) c[x.f] = { o: x.o, n: x.n }; else c[x.f].n = x.n; c.on = x.day; if (x.src !== 'bills') c.est = false; });
  const mOf = (b, s) => b > 0 && s > 0 ? Math.round((s - b) / b * 1000) / 10 : null;
  const priceChanges = Object.keys(pch).map(id => { const c = pch[id], it = byId[id], b0 = c.buy && c.buy.o != null ? c.buy.o : it.buy, s0 = c.sell && c.sell.o != null ? c.sell.o : it.sell;
    return Object.assign(c, { buyNow: it.buy, sellNow: it.sell, mWas: mOf(b0, s0), mNow: mOf(it.buy, it.sell) }); })
    .sort((a, b) => a.on < b.on ? 1 : a.on > b.on ? -1 : 0).slice(0, 30);
  /* restock (estimate, no stock counting): what came in on the last vendor bill, minus what was sold since; habit = usual gap between purchases */
  const vNames = {}; let VA = null; if (has('Vendors') && has('VendorLedger')) try { VA = vAll_(); VA.vendors.forEach(v => vNames[String(v.id)] = String(v.name)); } catch (e) {}
  const restock = [];
  Object.keys(lastPur).forEach(id => { const it = byId[id], lp = lastPur[id], a = IT[id] || { q30: 0, sinceBuy: 0 }, rate = a.q30 / 30; if (!(lp.q > 0)) return;
    const left = r2_(lp.q - a.sinceBuy), daysLeft = rate > 0 ? Math.max(0, Math.floor(left / rate)) : null;
    const ds = [...new Set(pur[id].map(p => p.d))], gaps = ds.slice(1).map((d, i) => insGap_(ds[i], d)).sort((x, y) => x - y), gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null, since = insGap_(lp.d, today);
    const st = left <= 0 ? 'out' : daysLeft !== null && daysLeft <= 7 ? 'soon' : gap && since >= gap ? 'habit' : 'ok';
    restock.push({ ...ref(it), bought: lp.q, on: lp.d, sold: a.sinceBuy, left, perDay: r2_(rate), daysLeft, gap, since, st, vendorId: lp.v, vendor: vNames[lp.v] || '', abc: abc.indexOf(id) >= 0 }); });
  const stRank = { out: 0, soon: 1, habit: 2, ok: 3 };
  restock.sort((a, b) => stRank[a.st] - stRank[b.st] || (b.abc ? 1 : 0) - (a.abc ? 1 : 0) || (a.daysLeft === null ? 1e9 : a.daysLeft) - (b.daysLeft === null ? 1e9 : b.daysLeft));
  const byVendor = {}; restock.filter(r => r.st !== 'ok').forEach(r => { const k = r.vendorId || '?'; (byVendor[k] = byVendor[k] || { vendorId: r.vendorId, vendor: r.vendor, items: [] }).items.push({ id: r.id, name: r.name, unit: r.unit, st: r.st }); });
  const unknownStock = abc.filter(id => !lastPur[id]).length;
  /* cheaper elsewhere: the same item bought from two vendors in 180 days at different prices */
  const cheaper = [];
  Object.keys(pur).forEach(id => { const per = {}; pur[id].forEach(p => { if (p.buy > 0 && p.v) per[p.v] = p; }); const vs = Object.keys(per); if (vs.length < 2) return;
    const last = lastPur[id].v, lb = per[last] ? per[last].buy : null; if (!lb) return; const best = vs.reduce((m, v) => per[v].buy < per[m].buy ? v : m, vs[0]); if (best === last) return;
    const diff = Math.round((lb - per[best].buy) / lb * 1000) / 10; if (diff < 5) return;
    cheaper.push({ ...ref(byId[id]), usual: vNames[last] || '', usualBuy: lb, best: vNames[best] || '', bestBuy: per[best].buy, bestOn: per[best].d, diff }); });
  cheaper.sort((a, b) => b.diff - a.diff);
  /* customer credit (all open bills, not only the window) */
  const dues = s ? rcRead_('dues:' + ENV_, brev_, listDues_) : { customers: [], total: 0 }, buckets = [0, 0, 0, 0];
  const debtors = (dues.customers || []).map(c => { let old = 0, newDue = 0;
    c.bills.forEach(b => { const bd = b.date ? dayOf(new Date(b.date)) : today, age = insGap_(bd, today); buckets[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3] = r2_(buckets[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3] + b.due); if (age > old) old = age; if (bd >= d30) newDue = r2_(newDue + b.due); });
    const paid30 = c.bills.some(b => (b.payments || []).some(p => !p.at && dayOf(new Date(p.d)) >= d30)), k = c.mobile || ('name:' + String(c.name).toLowerCase()), hist = CUS[k];
    const usual = hist && hist.paidDays.length ? Math.round(hist.paidDays.reduce((t, x) => t + x, 0) / hist.paidDays.length) : null;
    return { name: c.name, mobile: c.mobile, due: c.due, bills: c.bills.length, oldest: old, newDue, paid30, usual }; });
  const growing = debtors.filter(c => c.newDue > 0 && !c.paid30 && c.due > c.newDue).sort((a, b) => b.due - a.due).slice(0, 8);
  const remind = debtors.filter(c => c.oldest >= 15 && (c.usual === null || c.oldest > c.usual)).sort((a, b) => b.due * b.oldest - a.due * a.oldest).slice(0, 5);
  const lost = Object.keys(CUS).map(k => CUS[k]).filter(c => c.before >= 3 && c.recent === 0 && c.last).sort((a, b) => b.total - a.total).slice(0, 10).map(c => ({ name: c.name, mobile: c.mobile, last: c.last, total: c.total, bills: c.before }));
  const credit = { total: dues.total || 0, customers: debtors.length, buckets, debtors: debtors.slice(0, 10), growing, remind, given30, collected30, lost };
  /* vendors */
  const vend = { owed: 0, overdue: 0, due7: 0, due30: 0, list: [], flagged: 0, cheaper: cheaper.slice(0, 10), sched: [0, 0, 0, 0, 0] };   // sched: overdue, next 7 days, 8–14, 15–30, later or no due date
  if (VA) { const by = {}; VA.entries.forEach(e => { (by[e.vendorId] = by[e.vendorId] || []).push(e); if (!e.removed && e.check && e.check.st === 'issues' && !e.check.ack) vend.flagged++; });
    const in7 = insDay_(today, 7), in30 = insDay_(today, 30);
    VA.vendors.forEach(v0 => { const v = vVendorOut_(v0), c = vCalc_(v, by[v.id] || []); if (!(c.balance > 0)) return; let od = 0, due7 = 0, due30 = 0;
      c.bills.forEach(b => { if (!(b.due > 0)) return; const g = b.overdue ? 0 : !b.dueDate ? 4 : insGap_(today, b.dueDate) <= 7 ? 1 : insGap_(today, b.dueDate) <= 14 ? 2 : insGap_(today, b.dueDate) <= 30 ? 3 : 4; vend.sched[g] = r2_(vend.sched[g] + b.due);
        if (b.overdue) od = r2_(od + b.due); else if (b.dueDate && b.dueDate <= in7) due7 = r2_(due7 + b.due); else if (!b.dueDate || b.dueDate <= in30) due30 = r2_(due30 + b.due); });
      vend.owed = r2_(vend.owed + c.balance); vend.overdue = r2_(vend.overdue + od); vend.due7 = r2_(vend.due7 + due7); vend.due30 = r2_(vend.due30 + due30);
      vend.list.push({ id: v.id, name: v.name, mobile: v.mobile, balance: c.balance, overdue: od, due7, oldest: c.oldest }); });
    vend.list.sort((a, b) => b.overdue - a.overdue || b.balance - a.balance); vend.list = vend.list.slice(0, 15); }
  /* do this today: up to 5, at most 2 of a kind, biggest money first */
  const cand = [];
  checkSell.slice(0, 3).forEach(x => cand.push({ k: 'checkSell', score: Math.max(x.lost, x.suggest ? (x.suggest - x.sell) * Math.max(1, x.q30) : 0, x.a30 * 0.2, 1), ...x }));
  buyUp.filter(x => !chk[x.id]).slice(0, 3).forEach(x => cand.push({ k: 'raise', score: (x.suggest - x.sell) * Math.max(1, x.q30), ...x }));
  soldBelow.filter(x => !chk[x.id]).slice(0, 3).forEach(x => cand.push({ k: 'below', score: x.lost, ...x }));
  remind.slice(0, 3).filter(c => c.oldest >= 30).forEach(c => cand.push({ k: 'remind', score: c.due, ...c }));
  restock.filter(r => r.abc && (r.st === 'out' || r.st === 'soon')).slice(0, 3).forEach(r => cand.push({ k: 'reorder', score: (IT[r.id] ? IT[r.id].a30 : 0), ...r }));
  vend.list.filter(v => v.overdue > 0).slice(0, 2).forEach(v => cand.push({ k: 'payVendor', score: v.overdue * 0.5, ...v }));
  if (tot30 > 0 && P.d30.noBuy / tot30 > 0.2) cand.push({ k: 'noBuy', score: P.d30.noBuy * 0.1, amt: P.d30.noBuy, share: Math.round(P.d30.noBuy / tot30 * 100), items: noBuyItems.slice(0, 3) });
  cand.sort((a, b) => b.score - a.score); const kinds = {}, todo = [];
  cand.forEach(c => { if (todo.length >= 5 || (kinds[c.k] || 0) >= 2) return; kinds[c.k] = (kinds[c.k] || 0) + 1; c.score = Math.round(c.score); todo.push(c); });
  const staff = Object.keys(STAFF).map(k => STAFF[k]).filter(x => x.bills || x.cancelled).sort((a, b) => b.bills - a.bills);
  return { ok: true, at: Date.now(), env: ENV_, today, shopName: String(cfg.shopName || ''), pulse, todo,
    margins: { groups, below: belowList, soldBelow, checkSell: checkSell.slice(0, 10), priceChanges, thin, buyUp: buyUp.slice(0, 10), spread, noBuy: { amt: P.d30.noBuy, items: noBuyItems } },
    items: { abc: abc, top, rising, falling, stopped, unsold, noBuy: ITEMS_.filter(it => !(it.buy > 0)).length, noCat: ITEMS_.filter(it => !it.cat).length, total: ITEMS_.length },
    restock: { items: restock.slice(0, 40), byVendor: Object.keys(byVendor).map(k => byVendor[k]), unknown: unknownStock, purchases: Object.keys(pur).length },
    credit, vendors: vend, money: { modes30: modes, modesToday: modesT }, staff, series: insSeries_(SR, sFrom, dueBase) };
}

const PUR_COLS = ['entryId', 'vendorId', 'itemId', 'date', 'desc', 'qty', 'unit', 'rate', 'f', 'buy', 'at', 'by'];   // Purchases tab: one row per bill line matched to an item
