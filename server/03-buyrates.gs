/* ---------- who may see buy rates and margins (v65) ----------
   Config buyView: 'owner' (owner only), 'manager' (owner and managers, the default) or 'all'. For anyone else the sheet never
   sends a buy rate: the price list goes out with buy = null and, per item, only `lo` (the rate below which the bill page shows
   "Low margin", buy × (1 + lowMargin %), rounded up), past bills without line buy rates, cost or profit, reports without profit,
   no purchase history or buy price changes. Their bills get their buy rates on the sheet (fillBuy_), so profit stays right, and
   their item saves never change a buy rate. Before, Hide buy rate was only a personal choice and every phone got the rates. */
const BUYV_ = { owner: 3, manager: 2, all: 1 };
function buyView_() { let v = null; try { v = CacheService.getScriptCache().get('BUYV'); } catch (e) {} if (v === null) { try { v = readConfig_().buyView; } catch (e) { v = ''; } } return BUYV_[v] ? v : 'manager'; }
function buyOk_(who) { return !!who && (ROLE_RANK[who.role] || 0) >= BUYV_[buyView_()]; }
function lowMargin_(cfg) { const v = cfg ? cfg.lowMargin : undefined, m = Number(v); return v === undefined || v === null || v === '' || !isFinite(m) ? 5 : Math.max(0, Math.min(100, m)); }
/** The price list for someone who may not see buy rates. A rate under ₹10 is rounded up to 10 paise, else to the rupee, so the warning doesn't give the exact cost away. */
function loOf_(buy, m) { const b = num_(buy); if (!(b > 0) || !(m > 0)) return null; const x = b * (1 + m / 100); return x < 10 ? Math.ceil(x * 10) / 10 : Math.ceil(x); }
function itemsNoBuy_(L) { const m = lowMargin_(L.config || {});
  return Object.assign({}, L, { noBuy: true, items: (L.items || []).map(it => Object.assign({}, it, { buy: null, lo: loOf_(it.buy, m) })) }); }
/** Replies scrubbed of buy rates, cost and profit for someone who may not see them. */
function noBuyRes_(action, res) {
  const lines = L => Array.isArray(L) ? L.map(l => { if (!l || typeof l !== 'object') return l; const o = Object.assign({}, l); delete o.buy; return o; }) : L;
  const bill = b => { if (!b || typeof b !== 'object') return b; const o = Object.assign({}, b); if (o.lines) o.lines = lines(o.lines); if ('cost' in o) o.cost = null; if ('profit' in o) o.profit = null; return o; };
  if (action === 'getBill' && res.bill) res.bill = bill(res.bill);
  if ((action === 'getBills' || action === 'listBills') && Array.isArray(res.bills)) res.bills = res.bills.map(bill);
  if (action === 'report' && res.report) { const R0 = res.report, T = Object.assign({}, R0.totals || {});
    ['profit', 'cost', 'profitBills', 'pSale', 'pCost', 'pBills', 'noBuyAmt', 'estAmt'].forEach(k => { delete T[k]; });
    res.report = Object.assign({}, R0, { totals: T, noBuy: true, items: (R0.items || []).map(it => { const o = Object.assign({}, it); ['cost', 'costQty', 'costAmt', 'profit', 'estQty'].forEach(k => delete o[k]); return o; }) }); }
  return res; }
/** A bill from someone who may not see buy rates: each line gets the buy rate on the sheet (the one it had before, when edited,
    else the item's), and the bill's cost and profit are worked out here, the same way the phone does (lines without one left out). */
function fillBuy_(b, old) { const L = Array.isArray(b.lines) ? b.lines : []; if (!L.length) return;
  const items = {}; try { (listCached_().items || []).forEach(it => { items[String(it.id)] = it; }); } catch (e) {}
  const prev = Array.isArray(old) ? old : []; let sale = 0, cost = 0, any = false;
  L.forEach(l => { if (!l || typeof l !== 'object') return;
    const o = prev.filter(x => x && String(x.id) === String(l.id) && !!x.alt === !!l.alt && num_(x.buy) > 0)[0];
    let bb = o ? num_(o.buy) : 0;
    if (!(bb > 0)) { const it = items[String(l.id)]; if (it && num_(it.buy) > 0) bb = l.alt && num_(it.altQty) > 0 ? r2_(num_(it.buy) / num_(it.altQty)) : num_(it.buy); }
    if (bb > 0) { l.buy = bb; const q = num_(l.qty), amt = r2_(q * num_(l.rate)); sale += amt; cost += r2_(q * bb); any = true; } else delete l.buy; });
  b.cost = any ? r2_(cost) : ''; b.profit = any ? r2_(sale - cost) : ''; }
/** (v65) The owner (and managers who may see buy rates) get a notice when a bill has a line sold below its buy rate. An edit
    notifies only for a line that wasn't already below cost. */
function belowLines_(lines) { return (Array.isArray(lines) ? lines : []).filter(l => l && typeof l === 'object' && num_(l.buy) > 0 && num_(l.rate) < num_(l.buy) - 0.004); }
function belowNote_(b, no, by, oldLines, row) { const L = belowLines_(b.lines); if (!L.length) return;
  const k = l => String(l.id) + (l.alt ? '#a' : '') + ':' + num_(l.rate);
  if (oldLines) { const was = {}; belowLines_(oldLines).forEach(l => { was[k(l)] = 1; }); if (L.every(l => was[k(l)])) return; }
  notice_('below', { entryId: str_(b.id || '', 40), vname: str_(b.customer || '', 80), amount: num_(b.total), billNo: String(no), by: by,
    extra: { gst: !!b.gst, row: Number(row) || 0, l: L.slice(0, 3).map(l => ({ n: String(l.name || '').slice(0, 60), r: num_(l.rate), u: String(l.unit || '').slice(0, 20) })), more: Math.max(0, L.length - 3) } }); }
function readConfig_() {
  const s = sheet_(CONFIG, ['key', 'value']);
  const n = s.getLastRow() - 1;
  const cfg = {};
  if (n > 0) s.getRange(2, 1, n, 2).getValues().forEach(r => { if (r[0]) cfg[String(r[0])] = r[1]; });
  if (cfg.units) { try { cfg.units = JSON.parse(cfg.units); } catch (err) { delete cfg.units; } }
  cfg.approveNew = approveOn_(cfg);
  try { cfg.groups = cfg.groups ? JSON.parse(cfg.groups) : []; if (!Array.isArray(cfg.groups)) cfg.groups = []; } catch (err) { cfg.groups = []; }
  cfg.bizType = String(cfg.bizType || '');
  if (cfg.roundTo !== undefined && cfg.roundTo !== '') cfg.roundTo = Number(cfg.roundTo);
  cfg.nextBill = Math.max(1, Math.floor(num_(cfg.nextBill)) || 1);
  cfg.nextGstBill = Math.max(1, Math.floor(num_(cfg.nextGstBill)) || 1);
  cfg.testNextBill = Math.max(1, Math.floor(num_(cfg.testNextBill)) || 1);
  cfg.testNextGstBill = Math.max(1, Math.floor(num_(cfg.testNextGstBill)) || 1);
  cfg.mode = cfg.mode === 'live' ? 'live' : 'test';
  cfg.buyView = BUYV_[cfg.buyView] ? String(cfg.buyView) : 'manager'; cfg.lowMargin = lowMargin_(cfg);   // (v65) who sees buy rates; margin warning on the bill
  cPut_('BUYV', cfg.buyView); nbPut_(cfg);   // (v67) every read of the Config tab refreshes both cached copies
  cfg.fyReset = !(cfg.fyReset === false || String(cfg.fyReset).toLowerCase() === 'false');
  cfg.gstFy = String(cfg.gstFy || ''); cfg.testGstFy = String(cfg.testGstFy || '');
  cfg.fyNow = fy_(new Date());
  cfg.shopState = String(cfg.shopState || '');
  cfg.showProfit = cfg.showProfit === true || String(cfg.showProfit).toLowerCase() === 'true';
  cfg.defaultGst = (cfg.defaultGst === undefined || cfg.defaultGst === '') ? 18 : num_(cfg.defaultGst);
  cfg.aiOn = !!PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
  cfg.defaultHsn = (cfg.defaultHsn === undefined || cfg.defaultHsn === '') ? '3923' : hsn_(cfg.defaultHsn);
  return cfg;
}

