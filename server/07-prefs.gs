/* ---------- per-person settings: test mode, profit, hide buy rates ----------
   Kept with the person (USERS[].prefs), so they follow them to any phone. People who unlock with the shop PIN are kept by
   name in MPREFS. A setting not set falls back to the shop's (Config mode / showProfit) or the phone's (hide buy). */
function prefsClean_(p) { const o = {}; p = p || {};
  if (p.mode === 'live' || p.mode === 'test') o.mode = p.mode;
  if (typeof p.showProfit === 'boolean') o.showProfit = p.showProfit;
  if (typeof p.hideBuy === 'boolean') o.hideBuy = p.hideBuy;
  if (Array.isArray(p.noff)) o.noff = p.noff.map(k => String(k).slice(0, 12)).filter(k => NOTE_KINDS_[k]).slice(0, 12);
  if (p.ui && typeof p.ui === 'object') { const u = uiClean_(p.ui); if (Object.keys(u).length) o.ui = u; }
  return o; }
/* v57: display choices that follow the person to every phone and laptop (language, theme, appearance, search bar, best match,
   recent items style, sort, cash row). Text size and printer stay per device. Only known values are kept. */
const UI_OK_ = { lang: ['en', 'hi'], palette: ['ink', 'maroon', 'forest', 'indigo', 'saffron'], appear: ['auto', 'light', 'dark'], spos: ['bottom', 'top'],
  sres: ['near', 'top'], rcstyle: ['list', 'pills'], sort: ['pop', 'az'] };
function uiClean_(u) { const o = {}; u = u || {};
  Object.keys(UI_OK_).forEach(k => { if (UI_OK_[k].indexOf(u[k]) >= 0) o[k] = u[k]; });
  if (typeof u.cashopen === 'boolean') o.cashopen = u.cashopen;
  return o; }
function mprefs_() { try { const o = JSON.parse(PropertiesService.getScriptProperties().getProperty('MPREFS') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function mkey_(name) { return String(name || '').trim().toLowerCase().slice(0, 60) || '-'; }
function prefsOf_(who) { if (who.master) return prefsClean_(mprefs_()[mkey_(who.name)]); const u = users_().filter(x => x.id === who.id)[0]; const o = prefsClean_(u && u.prefs);
  /* someone who once signed in with the shop PIN under this name keeps those display choices on their own account (v57) */
  if (u && !o.ui) { const m = prefsClean_(mprefs_()[mkey_(u.name)]); if (m.ui) o.ui = m.ui; }
  return o; }
function setMyPrefs_(who, p) {
  const cur = prefsOf_(who), oldUi = cur.ui || {}, add = prefsClean_(p), next = Object.assign(cur, add);
  if (add.ui) next.ui = uiClean_(Object.assign({}, oldUi, add.ui));   // one choice changed: the others stay
  if (next.mode === 'test' && who.testOk === false) next.mode = 'live';
  if (ROLE_RANK[who.role] < ROLE_RANK.manager) delete next.showProfit;     // profit is for managers and the owner
  if (who.master) { const m = mprefs_(); m[mkey_(who.name)] = next; PropertiesService.getScriptProperties().setProperty('MPREFS', JSON.stringify(m)); }
  else { const list = users_(), u = list.filter(x => x.id === who.id)[0]; if (u) { u.prefs = next; saveUsers_(list); } }
  return { prefs: next, testOk: who.testOk !== false }; }
function saveUser_(u, by) {   // by = who is saving (v58: changing your own PIN keeps the device you're on signed in)
  const list = users_();
  const name = str_(u.name || '', 40).trim(); if (!name) throw new Error('need_name');
  const role = ROLE_RANK[u.role] ? u.role : 'staff';
  let x = u.id ? list.filter(y => y.id === u.id)[0] : null;
  const pin = String(u.pin || '');
  if (!x && !/^\d{4,8}$/.test(pin)) throw new Error('bad_new_pin');
  if (pin) {
    pinRule_(pin, role);
    const h = hashPin_(pin);
    if (shopPinIs_(pin) || list.some(y => y.h === h && (!x || y.id !== x.id))) throw new Error('pin_taken');
    if (x && x.h !== h) { x.h = h; const keep = by && by.id === x.id ? by.sess : ''; sessEnd_((k, y) => y.u === x.id && k !== keep); }   // new PIN: that person signs in again everywhere (except the device they changed it on)
  }
  if (x) { if (u.active === false && x.active !== false) sessEnd_((k, y) => y.u === x.id); x.name = name; x.role = role; x.active = u.active !== false; x.testOk = u.testOk !== false; if (x.testOk === false && x.prefs && x.prefs.mode === 'test') x.prefs.mode = 'live'; }
  else { list.push({ id: Utilities.getUuid().slice(0, 8), name: name, h: hashPin_(pin), role: role, active: true, testOk: u.testOk !== false }); }
  saveUsers_(list);
  return listUsers_();
}
/* ---- PINs (v46) ----
   The shop PIN is kept as a salted digest (PINH), never as plain text; an old plain PIN is converted the first time it's used.
   It is switched off for good once the shop has an owner with their own PIN (people then sign in only with their own PINs, so
   every bill and change shows who really made it); removing the last such owner turns it back on, so nobody is locked out.
   New PINs: owner and manager 6–8 digits, staff 4–8; no repeated digits, runs (1234, 9876), common picks or 4-digit years. */
function shopPinOff_() { return users_().some(u => u.active !== false && u.role === 'owner'); }
/** Does the starting PIN (Shop.gs) still sign in? Checked without converting a plain PIN (health only reads). */
function startPinWorks_(pin) { const P = PropertiesService.getScriptProperties(), h = P.getProperty('PINH'); pin = String(pin || '');
  return !!pin && (h ? hashPin_(pin) === h : pin === (P.getProperty('PIN') || String(DEFAULT_PIN))); }
function shopPinIs_(pin) { pin = String(pin || ''); if (!pin) return false; const P = PropertiesService.getScriptProperties(), h = P.getProperty('PINH');
  if (h) return hashPin_(pin) === h;
  if (pin !== (P.getProperty('PIN') || String(DEFAULT_PIN))) return false;
  P.setProperty('PINH', hashPin_(pin)); P.deleteProperty('PIN'); return true; }
const EASY_PINS_ = { '1212': 1, '1122': 1, '1313': 1, '2580': 1, '0852': 1, '1379': 1, '6969': 1, '1004': 1, '121212': 1, '112233': 1, '123123': 1, '696969': 1, '159753': 1, '147258': 1, '258369': 1, '102030': 1, '101010': 1, '123321': 1, '789456': 1, '456789': 1 };
function pinEasy_(p) { if (/^(\d)\1+$/.test(p) || EASY_PINS_[p]) return true;
  const up = '01234567890', dn = '09876543210'; if (up.indexOf(p) >= 0 || dn.indexOf(p) >= 0) return true;
  return p.length === 4 && /^(19|20)\d\d$/.test(p); }
function pinRule_(p, role) { p = String(p || ''); if (!/^\d{4,8}$/.test(p)) throw new Error('bad_new_pin');
  if ((role === 'owner' || role === 'manager') && p.length < 6) throw new Error('pin_short');
  if (pinEasy_(p)) throw new Error('pin_easy'); }
/** v57: the signed-in person changes their own PIN (Settings → Just for you). Needs their current PIN; the new one follows the
 *  PIN rules and can't be anyone else's or the shop PIN. Their other phones and laptops are signed out (they sign in again with
 *  the new PIN), this one stays signed in. People signed in with the shop PIN have no own PIN to change. */
function setMyPin_(who, oldPin, newPin) {
  if (who.master || !who.id) throw new Error('not_personal');
  const list = users_(), x = list.filter(y => y.id === who.id)[0]; if (!x) throw new Error('bad_session');
  if (hashPin_(String(oldPin || '')) !== x.h) throw new Error('bad_old_pin');
  newPin = String(newPin || ''); pinRule_(newPin, x.role);
  const h = hashPin_(newPin); if (h === x.h) throw new Error('pin_same');
  if (shopPinIs_(newPin) || list.some(y => y.h === h && y.id !== x.id)) throw new Error('pin_taken');
  x.h = h; saveUsers_(list);
  sessEnd_((k, y) => y.u === x.id && k !== who.sess);
  return { pinLen: newPin.length };
}
function removeUser_(id) { saveUsers_(users_().filter(u => u.id !== id)); return listUsers_(); }

/* ---------- shop code: hides buy rates and blocks bill saving for anyone who only has the link ---------- */
function viewCode_() { return PropertiesService.getScriptProperties().getProperty('VIEW_CODE') || ''; }
function getAccess_() { const c = viewCode_(); return { access: { on: !!c, code: c } }; }
function setAccess_(on, regen) {
  const p = PropertiesService.getScriptProperties();
  if (!on) { p.deleteProperty('VIEW_CODE'); return getAccess_(); }
  if (regen || !viewCode_()) {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = '';
    for (let i = 0; i < 6; i++) c += abc.charAt(Math.floor(Math.random() * abc.length));
    p.setProperty('VIEW_CODE', c);
  }
  return getAccess_();
}
function codeOk_(k) { const c = viewCode_(); return !c || String(k || '').toUpperCase() === c; }

/* ---------- hand edits in the sheet: a 5-minute check tells phones to reload ---------- */
function ensureTriggers_() {
  const cache = CacheService.getScriptCache();
  if (cache.get('TRIG_OK') === '1') return;
  if (PropertiesService.getScriptProperties().getProperty('RETIRED')) return;   // shop being deleted: never put its jobs back
  try {
    try { editTrigger_(); } catch (e) { softErr_('editTrigger', e); }   // without it, watchSheet stays at every 5 / 15 minutes
    /* (v66) watchSheet is only the fallback for hand edits once the sheet's own edit trigger is there (it fires for every hand
       edit), so it runs hourly then instead of every 5 / 15 minutes. Timed jobs of every shop count against one Google account's
       daily limit (see "How many shops" in CLAUDE.md). */
    const P = PropertiesService.getScriptProperties(), hourly = !!P.getProperty('EDIT_TRIG');
    const ws = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'watchSheet');
    if (hourly && ws.length && P.getProperty('WATCH_H') !== '1') { ws.forEach(t => ScriptApp.deleteTrigger(t)); ws.length = 0; }
    if (!ws.length) { const tb = ScriptApp.newTrigger('watchSheet').timeBased(); (hourly ? tb.everyHours(1) : tb.everyMinutes(boot_() ? 15 : 5)).create(); if (hourly) P.setProperty('WATCH_H', '1'); }
    cache.put('TRIG_OK', '1', 21600);
  } catch (err) { cache.put('TRIG_OK', '1', 3600); }   // needs the one-time setupBackups permission; try again in an hour
}
/* An edit trigger on the sheet itself: it fires for every hand edit (never for the script's own writes), so a hand edit is
   noticed even when an app save lands right after it (watchSheet alone compares only Drive's latest time, which that save hides).
   Re-made when the sheet changes (backup restore). */
function editTrigger_() {
  const P = PropertiesService.getScriptProperties(), id = ss_().getId();
  const have = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'onSheetEdit');
  if (have.length && P.getProperty('EDIT_TRIG') === id) return;
  have.forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(id).onEdit().create();
  P.setProperty('EDIT_TRIG', id);
}
/** Hand edit: tell phones to re-read only what that tab feeds (prices + settings, bills, or vendors). */
function onSheetEdit(e) {
  try {
    const n = String(e && e.range ? e.range.getSheet().getName() : '').replace(/^Test /, '');
    try { const g = e.range; if (n === ITEMS && g.getRow() > 1 && g.getNumRows() === 1 && g.getNumColumns() === 1 && e.oldValue !== undefined) {   // one price typed in the sheet
      const f = ['buy', 'sell', 'altSell'].filter(k => C[k] + 1 === g.getColumn())[0];
      if (f) { const r = g.getSheet().getRange(g.getRow(), 1, 1, COLS.length).getValues()[0]; const L = []; phPush_(L, Date.now(), r, f, e.oldValue, e.value, 'sheet', 'sheet'); phWrite_(L); } } } catch (err) { softErr_('onSheetEdit', err); }
    if (n === CONFIG) cfgCacheDrop_();   // (v67) bill numbers or who sees buy rates typed in the sheet: read them from the tab
    if (/^(Bills|BillHistory|Customers|BillYears)( \d{4}-\d{2})?$/.test(n)) bumpB_(true);   // (v67) archive tabs too
    else if (/^(Vendors|VendorLedger|VendorDocs|Purchases)$/.test(n)) vbumpAll_();
    else { bump_(); if (n !== ITEMS && n !== CONFIG && n !== IMAGES) { bumpB_(true); vbumpAll_(); } }
    popReset_();
  } catch (err) { softErr_('onSheetEdit', err); }
}
function watchSheet() {
  const changed = DriveApp.getFileById(ss_().getId()).getLastUpdated().getTime();
  const P = PropertiesService.getScriptProperties();
  // the app's last write of any kind (prices, bills or vendors); a newer Drive time means someone edited the sheet by hand
  const last = Math.max.apply(null, ['rev', 'brev_live', 'brev_test', 'vrev_live', 'vrev_test'].map(k => Number(P.getProperty(k) || 0)));
  if (changed > last + 15000) { cfgCacheDrop_(); bump_(); bumpB_(true); vbumpAll_(); }
  try { arcMaybe_(); } catch (e) { softErr_('archive', e); }   // (v67) once a year, at night: last-but-one year's bills to their own tab
}

