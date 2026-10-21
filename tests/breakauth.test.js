/* Break pass (21 Oct 2026): sign-in, roles and the open addresses of a shop's script, attacked from outside and from a staff
   phone. The real Code.gs; requests go through doGet / doPost as from a phone or a stranger. Run: node tests/breakauth.test.js */
const path = require('path'), { gas } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const mk = () => { const g = gas([path.join(__dirname, '..', 'Code.gs')]);
  g.R(`ensureEnv_=()=>{}; dedupeOnce_=()=>{}; stripFyPrefixOnce_=()=>{}; ensureTriggers_=()=>{}; shopPaused_=()=>false; bumpB_=()=>{}; bump_=()=>{};
    var CFG={}; readConfig_=()=>Object.assign({},CFG); var CALLS=[];
    listCached_=()=>({ok:true, rev:'1', items:[{id:'i1',name:'PP Bag',buy:150,sell:180}], config:{shopName:'Gupta', units:[], defaultUnit:'kg', defaultHsn:'3923'}});
    takeBill_=b=>{ CALLS.push('takeBill:'+b.by); return {ok:true}; };`);
  g.post = b => JSON.parse(g.R(`doPost({postData:{contents:${JSON.stringify(typeof b === 'string' ? b : JSON.stringify(b))}}}).text`));
  g.get = q => JSON.parse(g.R(`doGet({parameter:${JSON.stringify(q)}}).text`));
  return g; };
const g = mk(), R = g.R, post = g.post, get = g.get;
R("saveUser_({name:'Mayank',pin:'739164',role:'owner'})"); R("saveUser_({name:'Sanjay',pin:'582917',role:'manager'})"); R("saveUser_({name:'Raju',pin:'5273',role:'staff'})");
const sign = (pin, by, dev) => post({ action: 'verify', pin, by, dev: dev || 'ph-' + by, wantTok: true });
const OWN = sign('739164', 'Mayank').tok, MAN = sign('582917', 'Sanjay').tok, STF = sign('5273', 'Raju').tok;
const NEEDS = R('NEEDS'), RANK = { staff: 1, manager: 2, owner: 3 };

// ---------- A. a staff phone or a manager trying what they're not allowed ----------
const above = r => Object.keys(NEEDS).filter(a => RANK[NEEDS[a]] > RANK[r]);
const leak = (tok, r) => above(r).filter(a => post({ action: a, tok, env: 'live', id: 'x', ids: ['x'], items: [], config: { shopName: 'Hacked' }, user: { name: 'Evil', pin: '918273', role: 'owner' } }).error !== 'not_allowed');
const sl = leak(STF, 'staff'), ml = leak(MAN, 'manager');
ok(!sl.length, `A1 a staff phone is refused every manager and owner action (${above('staff').length} tried)` + (sl.length ? ': ' + sl.join(',') : ''));
ok(!ml.length, `A2 a manager is refused every owner-only action (${above('manager').length} tried: people, PINs, settings, backups, business page…)` + (ml.length ? ': ' + ml.join(',') : ''));
ok(R('CFG.shopName') === undefined && R("users_().some(u=>u.name==='Evil')") === false, 'A3 …and nothing changed (no new owner "Evil", shop name untouched)');
ok(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'].every(a => post({ action: a, tok: STF }).error === 'bad_action'), 'A4 made-up actions named like JavaScript internals (__proto__, constructor…): refused');
ok(post('not json at all').error === 'bad_json' && post({ action: 'list' }).ok === false, 'A5 junk instead of a request, or no sign-in: refused');

// ---------- B. sign-ins that should stop working ----------
const bad = post({ action: 'list', tok: 'z'.repeat(64), pin: '739164', by: 'Mayank' });
ok(bad.error === 'bad_session', 'B1 a wrong sign-in plus the right PIN in the same request: still refused (the PIN is never used as a fallback)');
const sid = R("users_().find(u=>u.name==='Sanjay').id");
R(`saveUser_(Object.assign(users_().find(u=>u.name==='Sanjay'), {role:'staff'}))`);
ok(post({ action: 'report', tok: MAN, env: 'live' }).error === 'not_allowed' || post({ action: 'report', tok: MAN, env: 'live' }).error === 'bad_session', 'B2 the owner makes the manager staff: the same phone loses manager actions at once');
R(`saveUser_(Object.assign(users_().find(u=>u.name==='Sanjay'), {active:false}))`);
ok(post({ action: 'list', tok: MAN }).error === 'bad_session', 'B3 the owner switches the person off: their phone is signed out on its next request');
R(`removeUser_('${sid}')`);
ok(post({ action: 'list', tok: MAN }).error === 'bad_session', 'B4 removed: still signed out');
R("saveUser_({name:'Raju',pin:'6384',role:'staff', id: users_().find(u=>u.name==='Raju').id})");
ok(post({ action: 'list', tok: STF }).error === 'bad_session' && post({ action: 'verify', pin: '5273', by: 'Raju', dev: 'x1' }).error === 'bad_pin', 'B5 the owner gives Raju a new PIN: his old phone is signed out and the old PIN stops working');
// a sign-in older than 90 days
const T2 = sign('6384', 'Raju', 'ph-r2').tok;
R(`(function(){ const all = JSON.parse(props.SESS); Object.keys(all).forEach(k=>{ if(all[k].d==='ph-r2'){ all[k].s = Date.now()-91*864e5; all[k].c = all[k].s; } }); props.SESS = JSON.stringify(all); cache.SESS && delete cache.SESS; })()`);
ok(post({ action: 'list', tok: T2 }).error === 'bad_session', 'B6 a phone not used for 91 days is signed out');
// another shop's sign-in
const g2 = mk(); g2.R("saveUser_({name:'Mayank',pin:'739164',role:'owner'})");
ok(g2.post({ action: 'list', tok: OWN }).error === 'bad_session' && g2.post({ action: 'list', tok: OWN, shop: 'main' }).error === 'bad_session', 'B7 a sign-in from one shop means nothing to another shop\'s script, even with the same name and PIN');
ok(post({ action: 'list', tok: OWN, shop: 'SHARMA-ABCDEFGHJK' }).error === 'wrong_shop', 'B8 a request labelled for another shop is never answered or written here');

// ---------- C. guessing PINs ----------
for (let i = 0; i < 8; i++) post({ action: 'verify', pin: String(830001 + i * 7), by: 'Mayank', dev: 'thief' });
ok(post({ action: 'verify', pin: '739164', by: 'Mayank', dev: 'thief' }).error === 'locked', 'C1 8 wrong PINs from one phone: that phone waits, even with the right PIN');
ok(post({ action: 'verify', pin: '739164', by: 'Mayank', dev: 'owner-laptop' }).ok, 'C2 …the owner on another device isn\'t held up');
ok(post({ action: 'list', tok: OWN, dev: 'thief' }).ok, 'C3 …and phones already signed in keep working');
ok(post({ action: 'verify', pin: '739164', by: 'Raju', dev: 'x2' }).error === 'bad_pin', 'C4 the owner\'s PIN typed with someone else\'s name: wrong PIN (a PIN opens only its own person)');
ok(post({ action: 'verify', pin: '739164', by: 'Mayank', dev: 'a"b<script>' }).ok && !JSON.stringify(R('Object.keys(cache)')).includes('<script>'), 'C5 a phone id full of odd characters is cleaned before it\'s used as a key');

// ---------- D. new-phone approval ----------
R("CFG.approveNew = true");
R("saveUser_({name:'Mohan',pin:'7391',role:'staff'})");
const pend = sign('7391', 'Mohan', 'new-phone');
ok(pend.tok && pend.pending, 'D1 approval on: a new staff phone gets a sign-in that waits');
ok(post({ action: 'list', tok: pend.tok }).error === 'pending' && post({ action: 'takeBill', tok: pend.tok, n: 1, bill: { id: 'pz', total: 1 } }).error === 'pending', 'D2 …it can\'t read prices or save a bill until approved');
ok(post({ action: 'approveSession', tok: pend.tok, id: 'xxxxxxxxxxxx' }).error === 'pending', 'D3 …and can\'t approve itself');
ok(post({ action: 'list', pin: '6384', by: 'Raju', dev: 'old-phone' }).error === 'need_signin', 'D4 a phone still using a bare PIN (no sign-in) is refused while approval is on');
R("CFG.approveNew = false");

// ---------- E. the open addresses (no sign-in) ----------
ok(['list', 'thumbs', 'image', 'images'].every(a => get({ action: a, id: 'i1', ids: 'i1' }).error === 'need_signin'), 'E1 prices and photos by the public address: refused');
ok(['health', 'insights', 'retire'].every(a => get({ action: a }).error === 'bad_key' || get({ action: a }).error === 'not_a_shop'), 'E2 health, business figures and retire without a key: refused');
ok(['health', 'insights'].every(a => get({ action: a, key: '' }).error === 'bad_key'), 'E3 …an empty key when the shop has none set: refused (never "matches")');
g.props.HEALTH_KEY = 'k-' + 'a'.repeat(22);
ok(get({ action: 'health', key: 'k-' + 'a'.repeat(21) + 'b' }).error === 'bad_key' && get({ action: 'insights', key: 'wrong' }).error === 'bad_key', 'E4 a wrong key: refused');
const rv = get({ action: 'rev' });
ok(rv.ok && !JSON.stringify(rv).match(/Mayank|739164|sheet|SHEET|tok|PIN/i), 'E5 the 25-second check answers without a sign-in but carries only version numbers (no names, sheet id or keys)');
R("var CREATED=[]; ss_=()=>({getSheetByName:()=>null, insertSheet:n=>{ CREATED.push(n); return null; }})");
ok(['vpub', 'vpubprev', 'vpubfile'].every(a => get({ action: a, t: '' }).error === 'link_off' && get({ action: a, t: 'l' + '0'.repeat(22) }).error === 'link_off' && get({ action: a, t: "l'); DROP--" }).error === 'link_off') && R('CREATED.length') === 0, 'E6 vendor links with no token, a made-up token or junk: "link off", nothing shown, and no tab is added to the shop\'s sheet');
for (let i = 0; i < 120; i++) post({ action: 'clientErr', dev: 'spam' + i, e: { m: 'x'.repeat(5000) } });
const ce = JSON.parse(R("cache.CERRS || '[]'"));
ok(ce.length <= 40 && ce.every(e => e.m.length <= 300) && R("cache.cerr_all") === '60', 'E7 120 fake error reports from strangers: at most 60 an hour counted, 40 kept, each cut to 300 characters, nothing written to the sheet');
const big = 'x'.repeat(2e6); let t0 = Date.now(); const pb = post({ action: 'verify', pin: big, by: big, dev: big });
ok(pb.error === 'bad_pin' && Date.now() - t0 < 3000, 'E8 a 2 MB PIN / name / phone id: refused quickly, not stored');

// ---------- F. personal settings can't be used to plant data ----------
const T3 = sign('739164', 'Mayank', 'own-2').tok;
post({ action: 'setMyPrefs', tok: T3, prefs: { mode: 'live', showProfit: 'yes<script>', hideBuy: 1, noff: ['bill', '<img>', 'x'.repeat(99)], ui: { lang: 'hi', palette: '<script>', __proto__: { admin: true }, evil: 1 }, role: 'owner' } });
const pf = R("users_().find(u=>u.name==='Mayank').prefs");
ok(JSON.stringify(pf) === JSON.stringify({ mode: 'live', noff: ['bill'], ui: { lang: 'hi' } }), 'F1 junk in personal settings (script tags, a fake role, unknown keys): only the known, allowed values are kept: ' + JSON.stringify(pf));
