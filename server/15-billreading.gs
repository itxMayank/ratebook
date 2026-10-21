/* ======================= Bill reading + calculation check (Google Gemini) =======================
 * Owner pastes a Gemini API key (Settings → Bill reading; kept in script property GEMINI_KEY, never sent to phones).
 * vRead: read bill photos/PDFs (already in Drive) → extracted numbers (ex). vCheck: read + store on the entry.
 * vCheckCalc_ does the arithmetic (line qty × rate, sum, GST, total, entered amount) — the AI only reads, never judges.
 * These run outside the script lock (Gemini takes seconds); only the final write takes the lock. */
const AI_MODEL_DEFAULT = 'gemini-2.5-flash';
function aiKey_() { return PropertiesService.getScriptProperties().getProperty('GEMINI_KEY') || ''; }
const AI_SCHEMA = { type: 'OBJECT', properties: {
  readable: { type: 'BOOLEAN' }, confidence: { type: 'NUMBER' }, billNo: { type: 'STRING' }, date: { type: 'STRING' }, sellerName: { type: 'STRING' },
  lines: { type: 'ARRAY', items: { type: 'OBJECT', properties: { desc: { type: 'STRING' }, qty: { type: 'NUMBER' }, unit: { type: 'STRING' }, rate: { type: 'NUMBER' }, per: { type: 'NUMBER' },
    discPct: { type: 'NUMBER' }, discAmt: { type: 'NUMBER' }, amount: { type: 'NUMBER' }, unclear: { type: 'BOOLEAN' } } } },
  subtotal: { type: 'NUMBER' }, discount: { type: 'NUMBER' }, charges: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, amount: { type: 'NUMBER' } } } },
  taxes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, rate: { type: 'NUMBER' }, amount: { type: 'NUMBER' } } } },
  taxTotal: { type: 'NUMBER' }, tcs: { type: 'NUMBER' }, roundOff: { type: 'NUMBER' }, total: { type: 'NUMBER' }, previousBalance: { type: 'NUMBER' }, netPayable: { type: 'NUMBER' } }, required: ['readable', 'confidence'] };
const AI_PROMPT = 'You read Indian purchase bills / tax invoices / kacha bills / estimates. They may be printed, thermal, PDF or handwritten, in English, Hindi or a mix, in any layout. ' +
  'Copy exactly what is WRITTEN. Never fix, recompute or guess any arithmetic: if a line says 25 x 185 = 4652, report amount 4652. Numbers as plain numbers (no commas, no currency). Leave out anything not written. ' +
  'lines: one per item row. qty = quantity, unit = its unit (kg, pcs, bag, box, dozen…), rate = the price written, per = how many units that rate is for when the bill says so (e.g. 100 for "per 100 pcs" or "/100"), otherwise leave per out. ' +
  'discPct / discAmt = a discount written on that line. amount = the line amount written. unclear = true if any number on that line is hard to read. Weights like "25 kg" are the qty. ' +
  'subtotal = total of the items before bill discount, charges and tax, if written. discount = bill-level discount (positive). charges = extra lines like freight, cartage, packing, loading, labour, hamali, transport. ' +
  'Bills can run over several pages: read EVERY page; the subtotal, tax lines and grand total are often on the last pages. ' +
  'taxes = each tax line added to the bill (CGST, SGST, IGST, GST, cess) with its rate in percent (leave rate out if not written next to it) and amount, each line once. Do NOT copy the rows of the HSN / tax summary table into taxes. ' +
  'taxTotal = the total tax amount if written (e.g. "Total Tax Amount" or the total of the tax summary table). tcs = TCS amount. roundOff = round off written (negative if subtracted). ' +
  'total = the grand total of THIS bill. previousBalance = old balance / previous dues written on the bill, if any. netPayable = the final amount payable if the bill adds previous balance or subtracts amount paid. date as YYYY-MM-DD. ' +
  'readable = false if this is not a bill or the amounts cannot be read reliably. confidence = 0 to 1, how sure you are that every number you returned is read correctly.';
let AI_T0 = 0;   // start of this request's bill reading: stop trying more models before Apps Script's time runs out
function aiCall_(parts, schema) { const key = aiKey_(); if (!key) throw new Error('ai_off'); if (!AI_T0) AI_T0 = Date.now();
  const pref = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL');
  const models = (pref ? [pref] : []).concat(['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest']).filter((m, i, a) => a.indexOf(m) === i);
  let last = '', why = '';
  const gmsg = body => { try { const e = JSON.parse(body).error || {}; return String((e.status ? e.status + ': ' : '') + (e.message || '')).slice(0, 220); } catch (x) { return String(body || '').slice(0, 160); } };
  for (const m of models) { if (Date.now() - AI_T0 > 80000) { last = last || 'ai_slow'; break; }   /* each model has its own free quota: if one is used up or not offered to this key, try the next */
    const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(key), { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ contents: [{ role: 'user', parts: parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema || AI_SCHEMA } }) });
    const code = res.getResponseCode(), body = res.getContentText();
    if (code === 400 && /API key not valid|API_KEY_INVALID/i.test(body)) throw new Error('ai_key');
    if (code === 403 && /API key|API_KEY|has not been used|is disabled|SERVICE_DISABLED|blocked/i.test(body)) throw new Error('ai_http|403|' + gmsg(body));
    if (code === 404 || code === 403) { last = last || 'ai_model'; why = why || code + ' ' + gmsg(body); continue; }
    if (code === 429) { last = 'ai_limit'; continue; }
    if (code !== 200) { last = 'ai_http|' + code + '|' + gmsg(body); continue; }
    const j = JSON.parse(body); const txt = (((j.candidates || [])[0] || {}).content || {}).parts; const s = txt && txt[0] && txt[0].text;
    const fin = (((j.candidates || [])[0] || {}).finishReason) || '';
    try { PropertiesService.getScriptProperties().setProperty('AI_LAST', JSON.stringify({ at: new Date().toISOString(), model: m, finish: fin, text: String(s || '').slice(0, 7000) })); } catch (x) {}
    if (!s) { last = 'ai_empty'; continue; }
    let out; try { out = JSON.parse(s); } catch (x) { last = 'ai_cut'; continue; }   /* reply cut off (e.g. MAX_TOKENS): try the next model */
    out.__model = m; return out; }
  if (last === 'ai_model') last = 'ai_http|' + why.replace(' ', '|');
  throw new Error(last || 'ai_fail'); }
/** Read the bill files (Drive ids) → normalised extraction. */
function vRead_(fileIds) { if (!aiKey_()) throw new Error('ai_off'); const parts = [{ text: AI_PROMPT }];
  const own = vDocIds_(); (fileIds || []).slice(0, 6).forEach(f => { const b = vOwnFile_(f, own).getBlob(); const mime = b.getContentType();
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(mime)) return; parts.push({ inline_data: { mime_type: mime, data: Utilities.base64Encode(b.getBytes()) } }); });
  if (parts.length < 2) return { readable: false, confidence: 0 };
  AI_T0 = Date.now(); const raw = aiCall_(parts);
  /* Totals read but no item rows (lighter models often skip them on long invoices): ask once more for the rows only. */
  if (raw && raw.readable && !(raw.lines || []).length && Date.now() - AI_T0 < 45000) {
    try { const more = aiCall_([{ text: AI_LINES_PROMPT }].concat(parts.slice(1)), AI_LINES_SCHEMA); if (more && (more.lines || []).length) raw.lines = more.lines; } catch (e) {} }
  return vExClean_(raw); }
const AI_LINES_SCHEMA = { type: 'OBJECT', properties: { lines: AI_SCHEMA.properties.lines }, required: ['lines'] };
const AI_LINES_PROMPT = 'This is a purchase bill / tax invoice, possibly over several pages. List ONLY its item rows, from every page, as lines: desc (item description), qty, unit, rate, per (only if the rate is per 10/100/1000/dozen), discPct, discAmt, amount. ' +
  'Copy numbers exactly as written (no commas, no currency), never recompute. Skip totals, tax lines, HSN summary rows and headings. unclear = true if a number on that row is hard to read.';
function vExClean_(x) { const n = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Math.round(Number(v) * 1000) / 1000;
  x = x || {}; const pos = v => { const k = n(v); return k != null && k > 0 ? k : null; };   /* a total of 0 means it wasn't read */
  return { model: str_(x.__model || '', 40), readable: !!x.readable, confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0)), billNo: str_(x.billNo || '', 40), date: /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || '')) ? String(x.date) : '',
    seller: str_(x.sellerName || '', 80), lines: (Array.isArray(x.lines) ? x.lines : []).slice(0, 120).map(l => ({ d: str_(l.desc || '', 60), q: n(l.qty), un: str_(l.unit || '', 12), r: n(l.rate), per: n(l.per), dp: n(l.discPct), da: n(l.discAmt), a: n(l.amount), u: !!l.unclear })),
    sub: pos(x.subtotal), disc: n(x.discount), charges: (Array.isArray(x.charges) ? x.charges : []).slice(0, 10).map(c => ({ n: str_(c.name || '', 30), a: n(c.amount) })),
    taxes: (Array.isArray(x.taxes) ? x.taxes : []).slice(0, 10).map(t => ({ n: str_(t.name || '', 20), r: n(t.rate), a: n(t.amount) })), tt: n(x.taxTotal), tcs: n(x.tcs), ro: n(x.roundOff), total: pos(x.total), prev: n(x.previousBalance), net: n(x.netPayable) }; }
/** The same reading sent back by the phone (already in the short form): re-check every field. */
function vExSafe_(e) { if (!e || typeof e !== 'object') return null;
  return vExClean_({ __model: e.model, readable: e.readable, confidence: e.confidence, billNo: e.billNo, date: e.date, sellerName: e.seller, subtotal: e.sub, discount: e.disc, taxTotal: e.tt, tcs: e.tcs, roundOff: e.ro, total: e.total, previousBalance: e.prev, netPayable: e.net,
    lines: (e.lines || []).map(l => ({ desc: l.d, qty: l.q, unit: l.un, rate: l.r, per: l.per, discPct: l.dp, discAmt: l.da, amount: l.a, unclear: l.u })), charges: (e.charges || []).map(c => ({ name: c.n, amount: c.a })), taxes: (e.taxes || []).map(t => ({ name: t.n, rate: t.r, amount: t.a })) }); }
/** The arithmetic (the AI only reads). Identical to vCheckJS in vendors.js; keep them the same. */
function vCheckCalc_(ex, entered) {
  if (!ex || !ex.readable || ex.confidence < 0.6 || ex.total == null) return { st: 'unread' };
  const r2 = v => Math.round(v * 100) / 100, near = (a, b, t) => Math.abs(a - b) <= t, tol = v => Math.max(1, Math.abs(v) * 0.002);
  const issues = [], done = [], notes = [], all = ex.lines || [], lines = all.filter(l => !l.u);
  let nLine = 0;
  lines.forEach(l => { if (l.a == null || l.q == null || l.r == null) return; const per = l.per > 0 ? l.per : 1;
    let e = l.q * l.r / per; if (l.dp) e *= 1 - l.dp / 100; if (l.da) e -= l.da; e = r2(e); nLine++;
    if (near(e, l.a, tol(l.a))) return;
    /* other usual ways a line is written: rate per 10/100/1000/dozen, rate with GST included, amount before GST */
    const alts = [10, 100, 1000, 12].map(p => l.q * l.r / p).concat([5, 12, 18, 28].map(g => e * (1 + g / 100)), [5, 12, 18, 28].map(g => e / (1 + g / 100)));
    if (alts.some(x => near(r2(x), l.a, tol(l.a)))) return;
    issues.push({ t: 'line', i: all.indexOf(l) + 1, d: l.d, q: l.q, r: l.r, a: l.a, e: e }); });
  if (nLine) done.push('lines');
  const complete = all.length > 0 && all.every(l => l.a != null && !l.u);
  const sum = r2(all.reduce((s, l) => s + (l.a || 0), 0));
  if (complete && ex.sub != null) { done.push('sum'); if (!near(sum, ex.sub, 1)) issues.push({ t: 'sum', s: sum, sub: ex.sub }); }
  const base = ex.sub != null ? ex.sub : (complete ? sum : null);
  const disc = ex.disc || 0, chg = r2((ex.charges || []).reduce((s, c) => s + (c.a || 0), 0));
  const taxes = (ex.taxes || []).filter(x => x.a != null), T = r2(taxes.reduce((s, x) => s + x.a, 0)), tcs = ex.tcs || 0, ro = ex.ro || 0;
  if (base != null && taxes.length) {
    const rates = {}; taxes.forEach(x => { const k = /igst/i.test(x.n) ? 'i' : 'cs'; (rates[k] = rates[k] || new Set()).add(x.r); });
    const mixed = Object.values(rates).some(s => s.size > 1);   /* several GST rates on one bill: the split per rate isn't known, so only the totals are checked */
    if (!mixed) { const bases = [r2(base - disc), r2(base - disc + chg)];
      taxes.forEach(x => { if (!(x.r > 0)) return; const es = bases.map(b => r2(b * x.r / 100)); if (!es.some(e => near(e, x.a, tol(e)))) issues.push({ t: 'tax', n: x.n, r: x.r, b: bases[0], a: x.a, e: es[0] }); });
      if (taxes.some(x => x.r > 0)) done.push('tax'); } }
  const c = taxes.filter(x => /cgst/i.test(x.n)).reduce((s, x) => s + x.a, 0), sg = taxes.filter(x => /sgst|utgst/i.test(x.n)).reduce((s, x) => s + x.a, 0);
  if (c && sg) { if (!near(c, sg, 1)) issues.push({ t: 'cs', c: r2(c), s: r2(sg) }); if (done.indexOf('tax') < 0) done.push('tax'); }
  if (base != null) { const b = base - disc;
    /* GST as read can be incomplete or doubled on multi-page / tabular bills: only CGST or only SGST found (the other half on
       another page), the HSN tax-summary rows copied as well as the tax lines, or only a "total tax" figure. Try those too. */
    const one = taxes.length > 0 && !taxes.some(x => /igst/i.test(x.n)) && (!c !== !sg);
    const Ts = [T]; if (ex.tt != null) Ts.push(ex.tt); if (one) Ts.push(r2(T * 2)); if (T) Ts.push(r2(T / 2));
    const waysFor = t => [b + chg + t + tcs + ro, b + t + tcs + ro, b + chg + tcs + ro, b + ro, b + chg + t + tcs, b + chg + t + tcs - ro].map(r2);   /* charges/GST already inside the subtotal, round-off sign */
    if (Ts.some(t => waysFor(t).some(w => near(w, ex.total, 1.01)))) done.push('total');
    else if (!taxes.length && ex.tt == null && ex.total > b && (ex.total - b - chg - tcs - ro) / (b || 1) <= 0.285) {
      /* no GST was read at all and the gap is what GST could be (up to 28%): say so, don't flag */
      const gap = r2(ex.total - b - chg - tcs - ro); notes.push({ t: 'gst', a: gap, p: Math.round(gap / (b || 1) * 1000) / 10 }); }
    else { done.push('total'); issues.push({ t: 'total', e: waysFor(T)[0], tot: ex.total }); } }
  if (entered != null && !isNaN(entered)) { done.push('entry'); const en = Number(entered);
    if (!near(en, ex.total, 1)) { if (ex.prev && near(en, r2(ex.total + ex.prev), 1)) issues.push({ t: 'prev', ent: en, tot: ex.total, prev: ex.prev });
      else if (!(ex.net != null && near(en, ex.net, 1))) issues.push({ t: 'entry', ent: en, tot: ex.total }); } }
  const deep = done.some(d => d === 'lines' || d === 'sum' || d === 'total');
  return { st: issues.length ? 'issues' : deep ? 'ok' : 'basic', issues: issues, done: done, notes: notes, total: ex.total, tax: T || (ex.tt != null ? ex.tt : null), lines: nLine };
}
/** Read an entry's photos and store the check on it (outside the lock while Gemini works). */
function vCheck_(id, by) { let A = vAll_(); let e = A.entries.find(x => x.id === String(id)); if (!e) throw new Error('no_entry');
  const files = (e.photos || []).map(p => p.f); let ex = null, err = '';
  try { ex = files.length ? vRead_(files) : null; } catch (er) { err = String(er && er.message || er); if (err === 'ai_off') throw er; }
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { A = vAll_(); const r = A.L.rows.find(o => String(o.id) === String(id)); if (!r) throw new Error('no_entry');
    /* "Check again" never makes things worse: a failed or poorer reading (no total / fewer lines, e.g. from the lighter
       fallback model when the main one's free quota is used up) keeps the earlier reading for the same photos. */
    const old = vjson_(r.ex, null), q = x => !x || !x.readable ? 0 : (x.total != null ? 4 : 0) + (x.sub != null ? 1 : 0) + Math.min(3, ((x.lines || []).filter(l => l.a != null).length));
    let kept = false; if (old && old.readable && (err || q(ex) < q(old))) { ex = vExSafe_(old); err = ''; kept = true; }
    const chk = err ? { st: 'error', err: err } : vCheckCalc_(ex, num_(r.amount)); chk.at = Date.now(); chk.by = by; if (kept) chk.kept = 1; if (ex && ex.model) chk.m = ex.model;
    const oldSt = (vjson_(r.check, {}) || {}).st;
    if (ex) r.ex = JSON.stringify(ex).slice(0, 45000); r.check = JSON.stringify(chk); vwrite_(A.L.s, VLED_COLS, r); vSet_(A, r);
    vCheckNote_(r, oldSt, A.vendors.find(o => String(o.id) === String(r.vendorId)) || {}, by); vbump_(); return vOne_(A, r.vendorId); }
  finally { lock.releaseLock(); } }
function vAck_(id, on, by) { const A = vAll_(); const r = A.L.rows.find(o => String(o.id) === String(id)); if (!r) throw new Error('no_entry');
  const c = vjson_(r.check, {}); if (on) c.ack = { by: by, at: Date.now() }; else delete c.ack; r.check = JSON.stringify(c); vwrite_(A.L.s, VLED_COLS, r); vSet_(A, r); vbump_(); return vOne_(A, r.vendorId); }
/* ======================= Notifications (vendors, for the owner and managers) =======================
 * Written at the moment a vendor change is saved (so a change sent later from an offline phone still notifies), one tab per
 * mode (Notices / Test Notices), last ~500 kept. Phones learn of new ones from the 25-second rev check (nl / nt = notices
 * version) and fetch them with `notices`; read state is per person (lower-case name in `read`). Text is built on the phone in
 * its own language from these fields. A notice never stops a save (errors are swallowed). */
const NOTE_COLS = ['id', 'at', 'kind', 'vendorId', 'entryId', 'vname', 'amount', 'billNo', 'extra', 'by', 'read'];
const NOTE_KINDS_ = { vendor: 1, bill: 1, pay: 1, adj: 1, paid: 1, rm: 1, check: 1, move: 1, below: 1 };
function nrevC_(en) { const c = CacheService.getScriptCache(); let v = c.get('nrev_' + en); if (!v) { v = PropertiesService.getScriptProperties().getProperty('nrev_' + en) || '0'; cPut_('nrev_' + en, v); } return v; }
function nbump_() { return chg_(['nrev_' + ENV_]); }
function notice_(kind, o) {
  try { const s = sheet_(tab_('Notices'), NOTE_COLS);
    s.appendRow(NOTE_COLS.map(k => k === 'id' ? 'n' + Utilities.getUuid().replace(/-/g, '').slice(0, 12) : k === 'at' ? Date.now() : k === 'kind' ? kind
      : k === 'extra' ? JSON.stringify(o.extra || {}).slice(0, 2000) : k === 'read' ? JSON.stringify(o.by ? [mkey_(o.by)] : []) : k === 'vname' ? str_(o.vname, 80) : k === 'billNo' ? (o.billNo ? "'" + str_(o.billNo, 40) : '') : (o[k] == null ? '' : o[k])));
    const n = s.getLastRow() - 1; if (n > 600) s.deleteRows(2, n - 500);
    nbump_(); } catch (e) { softErr_('notice', e); } }
function vBillNo_(G, id) { const b = G.calc.bills.find(x => x.id === id); return b ? (b.opening ? 'Opening' : String(b.billNo || '')) || '—' : ''; }
/** Bills that a payment / advance / edit just cleared. */
function vClearedNotes_(G, G2, by) { const was = {}; G.calc.bills.forEach(b => was[b.id] = b.status);
  G2.calc.bills.filter(b => b.status === 'paid' && was[b.id] && was[b.id] !== 'paid').forEach(b =>
    notice_('paid', { vendorId: G2.vendor.id, entryId: b.opening ? '' : b.id, vname: G2.vendor.name, amount: b.amount, billNo: b.opening ? 'Opening' : String(b.billNo || ''), by: by })); }
/** The bill check found a calculation issue it didn't show before. */
function vCheckNote_(r, oldSt, v, by) { const c = vjson_(r.check, {}) || {};
  if (c.st === 'issues' && oldSt !== 'issues' && !c.ack) notice_('check', { vendorId: r.vendorId, entryId: r.id, vname: v.name, amount: num_(r.amount), billNo: String(r.billNo || ''), extra: { n: (c.issues || []).length }, by: by }); }
function notices_(who) { const me = mkey_(who.name), s = sheet_(tab_('Notices'), NOTE_COLS), n = s.getLastRow() - 1;
  const rows = n > 0 ? s.getRange(Math.max(2, n - 99 + 1), 1, Math.min(n, 100), NOTE_COLS.length).getValues() : [];
  const list = rows.map(r => { const o = {}; NOTE_COLS.forEach((k, j) => o[k] = r[j]); const rd = vjson_(o.read, []);
    return { id: String(o.id), at: num_(o.at), kind: String(o.kind), vendorId: String(o.vendorId || ''), entryId: String(o.entryId || ''), vname: String(o.vname || ''), amount: o.amount === '' ? null : num_(o.amount),
      billNo: String(o.billNo || ''), extra: vjson_(o.extra, {}), by: String(o.by || ''), read: rd.indexOf(me) >= 0 }; }).filter(o => o.id && (o.kind !== 'below' || buyOk_(who))).reverse();
  return { nrev: nrevC_(ENV_), list: list }; }
function noticeRead_(who, ids) { const me = mkey_(who.name), s = sheet_(tab_('Notices'), NOTE_COLS), n = s.getLastRow() - 1; if (n < 1) return notices_(who);
  const want = ids ? ids.reduce((m, id) => (m[id] = 1, m), {}) : null, c = NOTE_COLS.indexOf('read') + 1, idc = NOTE_COLS.indexOf('id') + 1;
  const from = Math.max(2, n - 199 + 1), cnt = n - from + 2, ids_ = s.getRange(from, idc, cnt, 1).getValues(), rd = s.getRange(from, c, cnt, 1).getValues(); let ch = false;
  ids_.forEach((x, i) => { if (want && !want[String(x[0])]) return; const a = vjson_(rd[i][0], []); if (a.indexOf(me) < 0) { a.push(me); rd[i][0] = JSON.stringify(a.slice(-30)); ch = true; } });
  if (ch) { s.getRange(from, c, cnt, 1).setValues(rd); nbump_(); }
  return notices_(who); }
/* ======================= Bill lines → items, buy prices, purchase history (#Bill) =======================
 * vEx: the reading of one bill (lines etc.) for the phone to show. vApply: the owner matched the lines to items; save one
 * Purchases row per matched line (replacing earlier rows of that bill), remember the match per vendor (map: description →
 * item + how many bill units make one of the item's units) and update the ticked items' buy price (before GST). */
const vKey_ = d => String(d || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim().slice(0, 80);
function vEx_(id) { const L = vtab_('VendorLedger', VLED_COLS); const r = L.rows.find(o => String(o.id) === String(id)); if (!r) throw new Error('no_entry');
  return { ex: vjson_(r.ex, null), applied: vjson_(r.applied, null) }; }
function vApply_(x, by) { const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { const A = vAll_(), e = A.L.rows.find(o => String(o.id) === String(x.entryId)); if (!e || String(e.type) !== 'bill') throw new Error('no_entry');
    const vr = A.V.rows.find(o => String(o.id) === String(e.vendorId)); if (!vr) throw new Error('no_vendor');
    const { s: is, values } = rows_(); const rowOf = {}; values.forEach((r, i) => { if (r[C.id]) rowOf[String(r[C.id])] = i; });
    const now = Date.now(), map = vjson_(vr.map, {}), rows = (Array.isArray(x.rows) ? x.rows : []).slice(0, 120);
    const P = vtab_('Purchases', PUR_COLS); for (let i = P.rows.length - 1; i >= 0; i--) if (String(P.rows[i].entryId) === String(e.id)) P.s.deleteRow(P.rows[i]._r);
    const add = [], upd = [], PL = []; let matched = 0;
    rows.forEach(r => { const k = vKey_(r.d); if (!k) return;
      if (r.skip) { map[k] = { skip: 1 }; return; }
      const id = String(r.itemId || ''); if (rowOf[id] === undefined) return;
      const f = num_(r.f) > 0 ? num_(r.f) : 1, buy = Math.round(num_(r.buy) * 1000) / 1000; if (!(buy > 0)) return;
      map[k] = { id: id, f: f }; matched++;
      add.push([String(e.id), String(e.vendorId), id, "'" + vday_(e.date), str_(r.d, 80), num_(r.q) || '', str_(r.un, 12), num_(r.r) || '', f, buy, now, by]);
      if (r.upd) { const v = values[rowOf[id]]; phPush_(PL, now, v, 'buy', v[C.buy], buy, by, 'vendor'); v[C.buy] = buy; v[C.updatedAt] = now; v[C.updatedBy] = by; is.getRange(rowOf[id] + 2, 1, 1, COLS.length).setValues([v]); upd.push(id); } });
    if (add.length) P.s.getRange(P.s.getLastRow() + 1, 1, add.length, PUR_COLS.length).setValues(add);
    phWrite_(PL);
    const keys = Object.keys(map); if (keys.length > 400) keys.slice(0, keys.length - 400).forEach(k => delete map[k]);   // keep the map small
    vr.map = JSON.stringify(map).slice(0, 45000); vwrite_(A.V.s, VEND_COLS, vr);
    e.applied = JSON.stringify({ at: now, by: by, n: matched, u: upd.length }); vwrite_(A.L.s, VLED_COLS, e); vSet_(A, e);
    vbump_(); return Object.assign(vOne_(A, String(e.vendorId)), { updated: upd, matched: matched }); }
  finally { lock.releaseLock(); } }
