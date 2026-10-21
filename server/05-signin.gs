/* ---------- people, roles and PINs ----------
 * The shop PIN (script property PIN) always works and means "owner" (the name is typed on the phone).
 * Personal PINs live in script property USERS as [{id, name, h (salted SHA-256), role, active}]; the name comes from the PIN.
 * Roles: owner (everything), manager (prices, bills, credit, reports), staff (bills and credit only).
 * Wrong PINs lock only that phone (dev id) after MAX_FAILS in 15 min; GLOBAL_MAX_FAILS per hour locks everyone.
 */
const ROLE_RANK = { staff: 1, manager: 2, owner: 3 };
const NEEDS = { verify: 'staff', list: 'staff', thumbs: 'staff', image: 'staff', images: 'staff', listBills: 'staff', findCustomer: 'staff', listCustomers: 'staff', saveCustomer: 'manager', getBill: 'staff', getBills: 'staff', updateBill: 'staff', listDues: 'staff', recordPayment: 'staff',
  upsert: 'manager', setGroups: 'manager', delete: 'manager', setImage: 'manager', setImages: 'manager', undoPayment: 'manager', cancelBill: 'manager', restoreBill: 'manager', report: 'manager',
  setConfig: 'owner', setPin: 'owner', vToLive: 'owner', notices: 'manager', noticeRead: 'manager', backupInfo: 'owner', backupNow: 'owner', restoreBackup: 'owner', setBackupEmail: 'owner',
  vList: 'manager', vSync: 'manager', vGet: 'manager', vSaveVendor: 'manager', vLink: 'manager', vSave: 'manager', vRemove: 'manager', vUseAdvance: 'manager', vUpload: 'manager', vPreviews: 'manager', vFile: 'manager', vRead: 'manager', vCheck: 'manager', vAck: 'manager', vEx: 'manager', vApply: 'manager', itemBuys: 'manager', priceHist: 'staff', aiSetKey: 'owner',
  setMyPrefs: 'staff', setMyPin: 'staff', signOut: 'staff', boot: 'staff', perfIn: 'staff', insights: 'owner', listSessions: 'owner', endSession: 'owner', approveSession: 'owner', listUsers: 'owner', saveUser: 'owner', removeUser: 'owner', getAccess: 'owner', setAccess: 'owner' };
function users_() { try { const a = JSON.parse(PropertiesService.getScriptProperties().getProperty('USERS') || '[]'); return Array.isArray(a) ? a : []; } catch (err) { return []; } }
function saveUsers_(list) { PropertiesService.getScriptProperties().setProperty('USERS', JSON.stringify(list)); }
function salt_() { const p = PropertiesService.getScriptProperties(); let v = p.getProperty('SALT'); if (!v) { v = Utilities.getUuid(); p.setProperty('SALT', v); } return v; }
function hashPin_(pin) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt_() + ':' + pin)); }
function auth_(body) {
  const cache = CacheService.getScriptCache();
  const dev = String(body.dev || 'nodev').replace(/[^\w-]/g, '').slice(0, 40) || 'nodev';
  const tok = String(body.tok || '');
  if (tok) return sessWho_(tok);         // a signed-in phone: never held up by someone else's wrong PINs (before v44 the hourly lock blocked everyone); not counted as a wrong PIN, a 128-bit token can't be guessed
  const g = Number(cache.get('gfails') || 0), d = Number(cache.get('fails_' + dev) || 0);
  if (g >= GLOBAL_MAX_FAILS || d >= MAX_FAILS) return { error: 'locked' };
  const nm0 = String(body.by || '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 60);
  const nk = nm0 ? 'pfails_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, nm0)).slice(0, 22) : 'nfails';
  const nf = Number(cache.get(nk) || 0);
  if (nf >= (nm0 ? NAME_MAX_FAILS : NONAME_MAX_FAILS)) return { error: 'locked' };
  const pin = String(body.pin || '');
  if (pin) {
    if (shopPinIs_(pin)) { if (shopPinOff_()) return { error: 'shop_pin_off' };   // the owner has their own PIN: the shop PIN no longer opens anything
      return { name: str_(body.by, 60), role: 'owner', master: true, viaPin: true }; }
    /* (v51) A personal PIN opens only its own person's account. When a name comes with it (the lock screen's name, or the name
       typed on the sign-in screen), it must be that person's PIN: before, the name was ignored, so a PIN that happened to be
       someone else's (e.g. your old PIN, later given to your dad) signed you in as them. A name that doesn't match is a wrong PIN. */
    const h = hashPin_(pin), nm = String(body.by || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const u = users_().filter(x => x.active !== false && x.h === h && (!nm || String(x.name || '').trim().replace(/\s+/g, ' ').toLowerCase() === nm))[0];
    if (u) return { name: u.name, role: ROLE_RANK[u.role] ? u.role : 'staff', id: u.id, testOk: u.testOk !== false, viaPin: true };
  }
  cache.put('fails_' + dev, String(d + 1), FAIL_WINDOW_SEC);
  cache.put('gfails', String(g + 1), 3600);
  cache.put(nk, String(nf + 1), 3600);
  return { error: 'bad_pin' };
}
/** Kept for older callers: 'ok' or an error code. */
function checkPin_(pin) { const a = auth_({ pin: pin }); return a.error || 'ok'; }

function listUsers_() { return { shopPinOff: shopPinOff_(), users: users_().map(u => ({ id: u.id, name: u.name, role: u.role, active: u.active !== false, testOk: u.testOk !== false })) }; }

/* ---------- sign-in tokens ----------
   After a PIN sign-in the phone keeps a random token instead of the PIN. SESS (script property, cached) maps the token's
   SHA-256 to {u: user id or 'm:<name>' for the shop PIN, n: name, l: phone label, c: created, s: last used}. The person is
   looked up again on every request, so a removed or switched-off person is out at once. Unused for SESS_DAYS = signed out. */
const SESS_DAYS = 90;
function tokKey_(t) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'tok:' + t)).replace(/=+$/, ''); }
function sessAll_() { const c = CacheService.getScriptCache(); let v = c.get('SESS'); if (!v) { v = PropertiesService.getScriptProperties().getProperty('SESS') || '{}'; cPut_('SESS', v); }
  try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
/** Change SESS under its own short lock (sign-ins can happen outside the main write lock). */
let LOCKED_ = false;   // doPost holds the script lock: don't take (and release) it a second time
function sessEdit_(fn, wait) { const l = LOCKED_ ? null : LockService.getScriptLock(); if (l && !l.tryLock(wait || 10000)) return false;
  try { CacheService.getScriptCache().remove('SESS'); const all = sessAll_(); fn(all); const old = Date.now() - SESS_DAYS * 864e5;
    Object.keys(all).forEach(k => { if ((all[k].s || all[k].c || 0) < old) delete all[k]; });
    const v = JSON.stringify(all); PropertiesService.getScriptProperties().setProperty('SESS', v); cPut_('SESS', v); return true; }
  finally { if (l) l.releaseLock(); } }
function sessNew_(who, body) { const t = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''), k = tokKey_(t), now = Date.now();
  const dev = String(body.dev || '').replace(/[^\w-]/g, '').slice(0, 40), approve = who.role !== 'owner' && approveOn_(); let pending = false;
  if (!sessEdit_(all => {
    /* New-phone approval (owner setting): a phone that hasn't had an approved sign-in here waits until the owner approves it.
       Owners never wait (they are the ones who approve). */
    /* (v46) Approval is for this person on this phone: the phone's id is chosen by the phone and can be copied from an approved one,
       so it only counts together with the same person who was approved on it. */
    const uid = who.master ? 'm:' + mkey_(who.name) : who.id;
    if (approve && !Object.keys(all).some(x => !all[x].p && dev && all[x].d === dev && all[x].u === uid)) pending = true;
    all[k] = { u: uid, n: who.name, l: str_(body.dl || '', 60), c: now, s: now, d: dev };
    if (pending) all[k].p = 1; })) throw new Error('busy');
  return { tok: t, pending: pending }; }
function sessEnd_(pick) { sessEdit_(all => Object.keys(all).forEach(k => { if (pick(k, all[k])) delete all[k]; })); }
function sessWho_(tok) { const k = tokKey_(tok), x = sessAll_()[k];
  if (!x || (x.s || x.c || 0) < Date.now() - SESS_DAYS * 864e5) return { error: 'bad_session' };
  let who = null;
  if (x.u.indexOf('m:') === 0) { if (shopPinOff_()) return { error: 'shop_pin_off' }; who = { name: x.n, role: 'owner', master: true }; }   // phones signed in with the shop PIN are signed out once it's switched off
  else { const u = users_().filter(y => y.id === x.u && y.active !== false)[0]; if (u) who = { name: u.name, role: ROLE_RANK[u.role] ? u.role : 'staff', id: u.id, testOk: u.testOk !== false }; }
  if (!who) return { error: 'bad_session' };
  if (x.p) return { error: 'pending' };          // waiting for the owner to approve this phone
  if (Date.now() - (x.s || 0) > 3600e3) sessEdit_(all => { if (all[k]) all[k].s = Date.now(); }, 300);   // last used, at most hourly, never waits long
  who.sess = k; return who; }
function listSessions_(who) { const all = sessAll_();
  return { approveNew: approveOn_(), sessions: Object.keys(all).map(k => ({ id: k.slice(0, 12), name: all[k].n, label: all[k].l || '', made: all[k].c, seen: all[k].s, me: k === who.sess, shopPin: all[k].u.indexOf('m:') === 0, pending: !!all[k].p }))
    .sort((a, b) => (b.seen || 0) - (a.seen || 0)) }; }

