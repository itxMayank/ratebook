/* ---------- price history (v53) ----------
   PriceHistory tab (shared by test and real mode, like the price list): one row per change of an item's buy, sell or pack price,
   written by every save (Edit item, Bulk add/edit, wand, a vendor bill's "update buy price", one price typed in the sheet).
   src: edit / bulk / bulkAdd / wand / app / new / vendor / sheet, or 'bills' for rows worked out once from past bills
   (phBackfill_), which are estimates. Never stops a save. */
const PH_TAB = 'PriceHistory', PH_COLS = ['at', 'day', 'itemId', 'name', 'unit', 'field', 'old', 'new', 'by', 'src'];
const phDay_ = ms => Utilities.formatDate(new Date(ms), BK_TZ, 'yyyy-MM-dd');
function phPush_(L, at, r, f, o, n, by, src) { const oo = o === '' || o === null || o === undefined ? '' : num_(o), nn = n === '' || n === null || n === undefined ? '' : num_(n);
  if (oo === nn || (oo !== '' && nn !== '' && Math.abs(oo - nn) < 0.0005) || (oo === '' && !(nn > 0))) return;
  L.push([at, "'" + phDay_(at), String(r[C.id]), str_(r[C.name], 200), str_(r[C.unit], 30), f, oo, nn, str_(by, 60), str_(src || 'app', 12)]); }
function phWrite_(L) { if (!L || !L.length) return; try { const s = sheet_(PH_TAB, PH_COLS); s.getRange(s.getLastRow() + 1, 1, L.length, PH_COLS.length).setValues(L); } catch (e) { softErr_('priceHistory:write', e); } }
function phRows_() { const s = ss_().getSheetByName(PH_TAB); if (!s) return []; const n = s.getLastRow() - 1; if (n <= 0) return [];
  return s.getRange(2, 1, n, PH_COLS.length).getValues().map(r => ({ at: num_(r[0]), day: String(r[1]).replace(/^'/, ''), id: String(r[2]), name: String(r[3]), unit: String(r[4]),
    f: String(r[5]), o: r[6] === '' ? null : num_(r[6]), n: r[7] === '' ? null : num_(r[7]), by: String(r[8]), src: String(r[9]) })); }
/** Once per shop: work out earlier price changes from past bills (both modes). Buy: the buy price each bill line saved, which is
    the item's buy price on that day. Sell: the list price saved on the line (from v52), else the rate charged; a different rate
    counts as a new price only when it holds (2+ bills that day, the next day with sales, or it's today's price), so a one-off
    discount isn't taken for a price change. Finally, a price that differs from the last one seen on bills changed when the item
    was last edited. Only bills from before the history began are read; rows are marked src 'bills'. */
/** (v66) A failure that mustn't stop the save it happens in (a customer's totals, dues, a notice, price history…) is still written
    to the script's error log (the dashboard's error list), so it can be found and fixed; before, these were swallowed silently. */
function softErr_(where, e) { try { const c = CacheService.getScriptCache(); let a = []; try { a = JSON.parse(c.get('ERRS') || '[]'); } catch (x) { a = []; }
  a.push(['soft:' + where, String(e && e.message || e).slice(0, 200), Date.now()]); c.put('ERRS', JSON.stringify(a.slice(-50)), 21600); } catch (x) { /* the log itself can't be written: nothing more to do */ } }
function phEnsure_() { const P = PropertiesService.getScriptProperties(); if (P.getProperty('PH_BF')) return;
  /* v58: the start from past bills reads every bill; it no longer holds the script lock meanwhile (that made every other
     request wait and fail with "Lock timeout"); only writing its rows takes the lock, briefly. One run at a time (cache
     marker), and after a failure not again for an hour. */
  const c = CacheService.getScriptCache(); if (c.get('PH_RUN')) return; c.put('PH_RUN', '1', 3600);
  try { phBackfill_(); P.setProperty('PH_BF', String(Date.now())); c.remove('PH_RUN'); }
  catch (e) { try { let a = []; try { a = JSON.parse(c.get('ERRS') || '[]'); } catch (x) {} a.push(['phBackfill', String(e && e.message || e).slice(0, 200), Date.now()]); c.put('ERRS', JSON.stringify(a.slice(-50)), 21600); } catch (x) {} } }
function phBackfill_() {
  const live = phRows_(), start = live.length ? Math.min.apply(null, live.map(x => x.at)) : Date.now(), liveIds = {}; live.forEach(x => liveIds[x.id + '|' + x.f] = 1);
  const { values } = rows_(); const items = {}, byName = {}; values.forEach(r => { if (!r[C.id]) return; items[String(r[C.id])] = r; byName[String(r[C.name]).trim().toLowerCase()] = r; });
  const obs = {};   // itemId -> [{at, day, buy, sell, lp, bill}]
  ['Bills', 'Test Bills'].forEach(tn => { const s = ss_().getSheetByName(tn); if (!s) return; const n = s.getLastRow() - 1; if (n <= 0) return;
    const col = k => BILL_COLS.indexOf(k) + 1, read = k => s.getRange(2, col(k), n, 1).getValues();
    const D = read('date'), Ls = read('lines'), Id = read('billId'), No = read('billNo');
    for (let i = 0; i < n; i++) { const d = D[i][0], at = d && typeof d.getTime === 'function' ? d.getTime() : num_(d); if (!(at > 0) || at >= start) continue;
      let lines = []; try { lines = JSON.parse(Ls[i][0] || '[]'); } catch (e) {} if (!Array.isArray(lines)) continue;
      const bill = tn + ':' + (Id[i][0] || No[i][0] || i);
      lines.forEach(ln => { const r = items[String(ln.id || '')] || byName[String(ln.name || '').trim().toLowerCase()]; if (!r) return;
        const aq = num_(r[C.altQty]), alt = !!ln.alt && aq > 0, b = num_(ln.buy), rt = num_(ln.rate), lp = num_(ln.lp);
        (obs[String(r[C.id])] = obs[String(r[C.id])] || []).push({ at, day: phDay_(at), bill, buy: b > 0 ? Math.round((alt ? b * aq : b) * 1000) / 1000 : 0,
          sell: !alt && rt > 0 ? rt : 0, lp: lp > 0 ? lp : 0 }); }); } });
  const out = [];
  Object.keys(obs).forEach(id => { const r = items[id], O = obs[id].sort((a, b) => a.at - b.at), push = (at, f, o, nv) => phPush_(out, at, r, f, o, nv, '', 'bills');
    /* buy: every change of the saved buy price */
    let cb = null, lastBuyAt = 0; O.forEach(x => { if (!(x.buy > 0)) return; if (cb !== null && Math.abs(x.buy - cb) >= 0.0005) push(x.at, 'buy', cb, x.buy); cb = x.buy; lastBuyAt = x.at; });
    const curBuy = num_(r[C.buy]), upd = num_(r[C.updatedAt]);
    if (cb !== null && curBuy > 0 && Math.abs(curBuy - cb) >= 0.0005 && !liveIds[id + '|buy']) push(Math.max(upd, lastBuyAt + 1), 'buy', cb, curBuy);
    /* sell: one value a day (the list price saved on the line, else the most common rate, the higher on a tie) */
    const days = []; O.forEach(x => { const v = x.lp || x.sell; if (!(v > 0)) return; let d = days[days.length - 1]; if (!d || d.day !== x.day) days.push(d = { day: x.day, at: x.at, c: {}, lp: !!x.lp });
      const k = String(v); (d.c[k] = d.c[k] || { v, n: 0, bills: {} }).n++; d.c[k].bills[x.bill] = 1; if (x.lp) d.lp = true; });
    days.forEach(d => { const best = Object.keys(d.c).map(k => d.c[k]).sort((a, b) => b.n - a.n || b.v - a.v)[0]; d.v = best.v; d.nb = Object.keys(best.bills).length; });
    const curSell = num_(r[C.sell]); let cs = null, lastSellAt = 0;
    days.forEach((d, i) => { if (cs === null) { cs = d.v; lastSellAt = d.at; return; }
      if (Math.abs(d.v - cs) >= 0.005) { const nx = days[i + 1], holds = d.lp || d.nb >= 2 || (nx && Math.abs(nx.v - d.v) < 0.005) || (!nx && Math.abs(d.v - curSell) < 0.005);
        if (holds) { push(d.at, 'sell', cs, d.v); cs = d.v; } }
      if (Math.abs(d.v - cs) < 0.005) lastSellAt = d.at; });
    if (cs !== null && curSell > 0 && Math.abs(curSell - cs) >= 0.005 && !liveIds[id + '|sell']) push(Math.max(upd, lastSellAt + 1), 'sell', cs, curSell); });
  out.sort((a, b) => a[0] - b[0]);
  if (LOCKED_) phWrite_(out);
  else { const l = LockService.getScriptLock(); if (!l.tryLock(20000)) throw new Error('busy'); try { if (!PropertiesService.getScriptProperties().getProperty('PH_BF')) phWrite_(out); } finally { l.releaseLock(); } }
  return out.length; }
/** One item's price history, newest first. Staff see sell and pack prices only. */
function priceHist_(id, role) { phEnsure_(); const buyOk = typeof role === 'boolean' ? role : ROLE_RANK[role] >= ROLE_RANK.manager;
  const L = phRows_().filter(x => x.id === String(id) && (buyOk || x.f !== 'buy')).sort((a, b) => b.at - a.at);
  return { hist: L.slice(0, 60).map(x => ({ at: x.at, day: x.day, f: x.f, o: x.o, n: x.n, by: x.by, src: x.src })), count: L.length }; }
/** Last purchases of one item (both from every vendor), newest first, for the item screen. */
function itemBuys_(id) { const P = vtab_('Purchases', PUR_COLS), V = vtab_('Vendors', VEND_COLS); const name = {}; V.rows.forEach(v => name[String(v.id)] = String(v.name));
  const list = P.rows.filter(r => String(r.itemId) === String(id)).map(r => ({ date: vday_(r.date), vendor: name[String(r.vendorId)] || '', vendorId: String(r.vendorId), qty: num_(r.qty), unit: String(r.unit || ''), rate: num_(r.rate), f: num_(r.f) || 1, buy: num_(r.buy), at: num_(r.at) }))
    .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : b.at - a.at);
  return { buys: list.slice(0, 8), count: list.length }; }
function aiSetKey_(key) { key = String(key || '').trim(); const p = PropertiesService.getScriptProperties();
  if (!key) { p.deleteProperty('GEMINI_KEY'); bump_(); return { aiOn: false }; }
  const had = p.getProperty('GEMINI_KEY'); p.setProperty('GEMINI_KEY', key);
  try { aiCall_([{ text: 'This is a connection test, not a bill. Return readable false and confidence 0.' }]); }
  catch (e) { const m = String(e && e.message || e);
    if (m === 'ai_limit') { bump_(); return { aiOn: true, warn: 'ai_limit' }; }   /* key is fine, today's free quota is used up */
    if (had) p.setProperty('GEMINI_KEY', had); else p.deleteProperty('GEMINI_KEY');   /* don't keep a key that didn't work */
    /* Only Apps Script's own "no permission for UrlFetchApp" error means setupVendorDocs is needed; anything else goes back as it is. */
    if (/UrlFetchApp|script\.external_request|Required permissions/i.test(m)) throw new Error('ai_auth');
    throw new Error(/^ai_/.test(m) ? m : 'ai_http|0|' + m.slice(0, 220)); }
  bump_(); return { aiOn: true }; }
/** Run in the editor (choose showLastBillReading → Run) to see exactly what Gemini returned for the last bill read. */
function showLastBillReading() { const v = PropertiesService.getScriptProperties().getProperty('AI_LAST'); Logger.log(v || 'No bill read yet since this update.'); }
/** Run this in the Apps Script editor (choose testBillReading → Run) to see exactly what Google says about the saved key. */
function testBillReading() { const key = aiKey_(); if (!key) { Logger.log('No key saved yet. Paste it in the app: Settings → Bill reading.'); return; }
  ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest'].forEach(m => {
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(key), { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }] }) });
    Logger.log(m + ' → ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 400)); }); }
