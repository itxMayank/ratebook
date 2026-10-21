/* ---------- writes (need PIN) ---------- */

function doPost(e) {
  let body;
  T0_ = Date.now(); ACT_ = ''; RC_HIT_ = false;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return out_({ ok: false, error: 'bad_json' }); }
  ACT_ = String(body.action || '');
  /* A request meant for another shop (wrong saved link, two shops on one phone) is never written here. */
  if (body.shop && String(body.shop) !== shopCode_()) return out_({ ok: false, error: 'wrong_shop', shop: shopCode_() });
  if (body.action === 'clientErr') return out_(clientErr_(body));   // a phone reporting its own error: memory only, no sheet, no lock
  try { ensureEnv_(); dedupeOnce_(); setEnv_(body.env); } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
  if (body.action === 'takeBill') {      // anyone making a bill can do this (with the shop code if one is set)
    if (shopPaused_()) return out_({ ok: false, error: 'paused' });   // the phone keeps the bill queued; nothing is lost
    const a0 = auth_(body);      // since v44 only a signed-in person can save a bill (before: anyone with the link when no shop code was set)
    if (a0.error) return out_({ ok: false, error: a0.error });
    if (a0.viaPin && approveOn_()) return out_({ ok: false, error: 'need_signin' });
    if (ENV_ === 'test' && a0.testOk === false) return out_({ ok: false, error: 'no_test' });
    body.by = a0.name;   // the name on the bill is the signed-in person's (from their sign-in), not what the phone sends
    body.role = a0.role; body.buyOk = buyOk_(a0);
    const tb = takeBill_(body); try { if (tb && tb.ok !== false) { bumpB_(false, body.bill && body.bill.id); if (tb.moved) bumpB_(false, tb.moved.id || ('row:' + tb.moved.row)); } } catch (err) { softErr_('moveBump', err); }
    return out_(tb);
  }
  const who = auth_(body);
  if (who.error) return out_({ ok: false, error: who.error });
  if (!Object.prototype.hasOwnProperty.call(NEEDS, String(body.action))) return out_({ ok: false, error: 'bad_action' });   // own names only ("constructor" isn't an action)
  if (ROLE_RANK[who.role] < ROLE_RANK[NEEDS[body.action]]) return out_({ ok: false, error: 'not_allowed' });
  if (ENV_ === 'test' && who.testOk === false && body.action !== 'verify' && body.action !== 'setMyPrefs' && body.action !== 'setMyPin') return out_({ ok: false, error: 'no_test' });
  if (who.viaPin && approveOn_() && body.action !== 'verify') return out_({ ok: false, error: 'need_signin' });   // new-phone approval: only signed-in phones
  if (shopPaused_() && !PAUSE_OK_[body.action]) return out_({ ok: false, error: 'paused' });
  if (body.action === 'list' || body.action === 'thumbs' || body.action === 'image' || body.action === 'images') {   // reads (v44), no lock
    try { if (body.action === 'list') { ensureEnv_(); dedupeOnce_(); stripFyPrefixOnce_(); ensureTriggers_(); let L = listCached_(); if (!buyOk_(who)) L = itemsNoBuy_(L); L.codeOn = !!viewCode_(); L.sv = SCRIPT_VERSION; L.shop = shopCode_(); return out_(L); }
      if (body.action === 'thumbs') return out_(thumbs_((Array.isArray(body.ids) ? body.ids : String(body.ids || '').split(',')).map(String).filter(String).slice(0, 60)));
      return out_(body.action === 'image' ? image_(str_(body.id, 60)) : images_(str_(body.id, 60))); }
    catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); } }
  if (body.action === 'priceHist') {   // an item's price history: read-only (the one-time backfill takes the lock itself)
    try { return out_(Object.assign({ ok: true }, priceHist_(str_(body.id, 40), buyOk_(who)))); } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); } }
  if (body.action === 'insights') {  // the owner's business page: read-only, a few seconds on a big sheet, so no lock
    try { return out_(insights_(body)); } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); } }
  if (body.action === 'boot') {      // app start in one request; read-only, so no lock
    try { return out_(bootReply_(who, body)); } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); } }
  if (body.action === 'vRead' || body.action === 'vCheck') {      // Gemini takes seconds: don't hold the script lock while it reads
    try { const by0 = who.name || str_(body.by, 60);
      if (body.action === 'vRead') return out_({ ok: true, ex: vRead_(body.files) });
      return out_(Object.assign({ ok: true }, vCheck_(str_(body.id, 40), by0))); }
    catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); } }
  const lock = LockService.getScriptLock();
  try {
    /* v58: pure reads don't wait for the script lock. Before, opening Settings fired ~6 requests that all queued behind the lock
       (backupInfo lists Drive files, seconds), and right after a script update every saved reply is rebuilt inside it, so the
       queue passed the wait and everything failed with "Lock timeout" (16 Oct 2026, shown on phones as "check your connection").
       Writes, and the lists phones keep copies of (bills, customers, credit, vendors), stay inside the lock. A sign-in that makes
       a token takes the lock itself (sessEdit_). */
    if (!NOLOCK_[body.action]) {
      try { lock.waitLock(25000); } catch (e) { return out_({ ok: false, error: 'busy' }); }   // nothing was done: the phone may simply try again
      LOCKED_ = true; }
    const by = who.name || str_(body.by, 60);
    let res = {};
    switch (body.action) {
      case 'verify': res = { me: { name: who.name, role: who.role, personal: !who.master, prefs: prefsOf_(who), testOk: who.testOk !== false, buyOk: buyOk_(who) }, view: viewCode_(), shop: shopCode_() };
        if (body.wantTok && !who.sess) { const t = sessNew_(who, body); res.tok = t.tok; if (t.pending) res.pending = true; } break;
      case 'approveSession': { const id = String(body.id || ''); if (id.length < 8) throw new Error('bad_id'); sessEdit_(all => Object.keys(all).forEach(k => { if (k.indexOf(id) === 0) delete all[k].p; })); res = listSessions_(who); break; }
      case 'signOut': sessEnd_(k => k === who.sess); res = {}; break;
      case 'listSessions': res = listSessions_(who); break;
      case 'endSession': { const id = String(body.id || ''); if (id.length < 8) throw new Error('bad_id'); sessEnd_(k => k.indexOf(id) === 0); res = listSessions_(who); break; }
      case 'setMyPrefs': res = setMyPrefs_(who, body.prefs || {}); break;
      case 'setMyPin': res = setMyPin_(who, body.oldPin, body.newPin); break;
      case 'perfIn': res = perfIn_(body); break;
      case 'upsert': if (!buyOk_(who)) body.items = (body.items || []).map(it => { if (!it || typeof it !== 'object') return it; const o = Object.assign({}, it); delete o.buy; return o; });   // (v65) never changes a buy rate it can't see
        res = upsert_(body.items || [], by, str_(body.src || 'app', 12)); break;
      case 'delete': res = delete_(body.ids || []); break;
      case 'setImage': res = setImage_(str_(body.id, 40), String(body.thumb || ''), String(body.full || ''), by); break;
      case 'setImages': res = setImages_(str_(body.id, 40), String(body.thumb || ''), body.photos, by); break;
      case 'setConfig': res = setConfig_(body.config || {}); break;
      case 'setGroups': res = setGroups_(body.groups); break;
      case 'setPin': res = setPin_(String(body.newPin || '')); sessEnd_((k, x) => x.u.indexOf('m:') === 0 && k !== who.sess); break;   // other phones signed in with the old shop PIN
      case 'listBills': res = listBills_(String(body.q || ''), Number(body.limit) || 50, { tz: body.tz, from: String(body.from || ''), to: String(body.to || ''), before: body.before, full: !!body.full, brev: String(body.brev || ''), arc: !!body.arc, skip: body.skip }); break;
      case 'findCustomer': res = findCustomer_(String(body.mobile || '')); break;
      case 'listCustomers': { const have = String(body.brev || ''); res = have && have === brev_() ? { same: true, brev: brev_() } : rcRead_('cust:' + ENV_, brev_, () => listCustomers_('')); break; }
      case 'saveCustomer': res = saveCustomer_(body.customer || {}, by); break;
      case 'getBill': res = getBill_(body.row, str_(body.id, 40), body.n, str_(body.arc, 7)); break;
      case 'getBills': res = getBills_(body.rows); break;
      case 'updateBill': res = updateBill_(body.bill || {}, by, who); bumpB_(false, res && res.bill && res.bill.id || (body.bill || {}).id); break;
      case 'listDues': res = rcRead_('dues:' + ENV_, brev_, listDues_); break;
      case 'recordPayment': res = recordPayment_(body, by); bumpB_(false, body.billId); break;
      case 'undoPayment': res = undoPayment_(body); bumpB_(false, body.billId); break;
      case 'backupInfo': res = backupInfo_(); break;
      case 'backupNow': res = { backup: backupNow_('manual') , info: backupInfo_() }; break;
      case 'restoreBackup': res = restoreBackup_(String(body.id || ''), by); bumpB_(true); vbumpAll_(); break;
      case 'cancelBill': res = cancelBill_(body, by, true); bumpB_(false, body.id); break;
      case 'restoreBill': res = cancelBill_(body, by, false); bumpB_(false, body.id); break;
      case 'report': res = report_(body); break;
      case 'listUsers': res = listUsers_(); break;
      case 'saveUser': res = saveUser_(body.user || {}, who); break;
      case 'removeUser': { const rid = String(body.id || ''); res = removeUser_(rid); sessEnd_((k, x) => x.u === rid); break; }
      case 'getAccess': res = getAccess_(); break;
      case 'setAccess': res = setAccess_(!!body.on, !!body.regen); break;
      case 'setBackupEmail': res = setBackupEmail_(String(body.email || '')); break;
      case 'vList': res = vList_(); break;
      case 'vSync': { const have = String(body.vrev || ''); res = have && have === vrev_() ? { same: true, vrev: vrev_() } : rcRead_('vsync:' + ENV_, vrev_, () => vSync_('')); break; }
      case 'vGet': res = vGet_(str_(body.id, 40)); break;
      case 'vSaveVendor': res = vSaveVendor_(body.vendor || {}, by); break;
      case 'vLink': res = vLink_(str_(body.id, 40), !!body.on, !!body.regen); break;
      case 'vToLive': res = vToLive_((body.ids || []).map(x => str_(x, 40)), by); break;
      case 'notices': res = notices_(who); break;
      case 'noticeRead': res = noticeRead_(who, body.all ? null : (body.ids || []).map(x => str_(x, 40))); break;
      case 'vSave': res = vSave_(body.entry || {}, by); break;
      case 'vRemove': res = vRemove_(str_(body.id, 40), body.on !== false, by); break;
      case 'vUseAdvance': res = vUseAdvance_(str_(body.vendorId, 40), str_(body.billId, 60), by); break;
      case 'vUpload': res = vUpload_(body); break;
      case 'vPreviews': res = vPreviews_(body.ids); break;
      case 'vFile': res = vFile_(str_(body.f, 80)); break;
      case 'vAck': res = vAck_(str_(body.id, 40), body.on !== false, by); break;
      case 'vEx': res = vEx_(str_(body.id, 40)); break;
      case 'vApply': res = vApply_(body, by); break;
      case 'itemBuys': if (!buyOk_(who)) throw new Error('not_allowed'); res = itemBuys_(str_(body.id, 40)); break;
      case 'aiSetKey': res = aiSetKey_(body.key); break;
      default: return out_({ ok: false, error: 'bad_action' });
    }
    if (!buyOk_(who) && (body.action === 'getBill' || body.action === 'getBills' || body.action === 'listBills' || body.action === 'report')) res = noBuyRes_(body.action, res);
    if (['verify', 'listBills', 'findCustomer', 'listCustomers', 'getBill', 'getBills', 'listDues', 'backupInfo', 'backupNow', 'setBackupEmail', 'report', 'listUsers', 'saveUser', 'removeUser', 'getAccess', 'setAccess', 'vList', 'vSync', 'vGet', 'vSaveVendor', 'vLink', 'vSave', 'vRemove', 'vUseAdvance', 'vUpload', 'vPreviews', 'vFile', 'vAck', 'vEx', 'itemBuys', 'aiSetKey', 'saveCustomer', 'setMyPrefs', 'setMyPin', 'signOut', 'listSessions', 'endSession', 'approveSession', 'vRead', 'vCheck', 'recordPayment', 'undoPayment', 'vToLive', 'notices', 'noticeRead', 'perfIn'].indexOf(body.action) < 0) bump_();   // these change only bills/vendors, which have their own versions
    return out_(Object.assign({ ok: true, rev: getRev_() }, res));
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    LOCKED_ = false; try { lock.releaseLock(); } catch (err) {}
  }
}

