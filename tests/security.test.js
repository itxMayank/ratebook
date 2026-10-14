/* Server security rules (Code.gs v44, 12 Oct 2026): the price list, photos and saving a bill need a signed-in phone (before:
   anyone with the script's address could read the list and, with no shop code set, save bills); the name on a saved bill is the
   signed-in person's, not what the phone sends; and wrong PINs lock only PIN guessing, never phones that are already signed in
   (before: 60 wrong PINs an hour from anyone locked the whole shop). Run: node tests/security.test.js */
const path = require('path'), { gas } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const g = gas([path.join(__dirname, '..', 'Code.gs')]), R = g.R;
g.props.PIN = '4821';
// the sheet itself isn't needed here: the list and the bill writer are stand-ins that record what reached them
R(`ensureEnv_=()=>{}; dedupeOnce_=()=>{}; stripFyPrefixOnce_=()=>{}; ensureTriggers_=()=>{}; shopPaused_=()=>false; bumpB_=()=>{};
   readConfig_=()=>({}); var TB=[];
   listCached_=()=>({ok:true, rev:'1', items:[{id:'i1',name:'PP Bag',buy:150,sell:180}], config:{shopName:'Gupta', units:[{code:'kg'}], defaultUnit:'kg', defaultHsn:'3923', nextBill:5}});
   thumbs_=ids=>({ok:true, thumbs:ids.map(id=>({id,thumb:'data:x'}))}); image_=id=>({ok:true,data:'IMG'+id}); images_=id=>({ok:true,photos:['P'+id]});
   takeBill_=b=>{ TB.push(b.by); return {ok:true, n:b.bill.n}; };`);
const get = q => JSON.parse(R(`doGet({parameter:${JSON.stringify(q)}}).text`));
const post = b => JSON.parse(R(`doPost({postData:{contents:${JSON.stringify(JSON.stringify(b))}}}).text`));

// A. reading without signing in
const L = get({ action: 'list' });
ok(L.ok === false && L.error === 'need_signin' && !L.items, 'A1 price list by its public address: refused, no items');
ok(L.config && L.config.units[0].code === 'kg' && L.config.defaultHsn === '3923' && L.config.shopName === undefined && L.config.nextBill === undefined, 'A2 …only the units (the dashboard copies them into a new shop), nothing else');
ok(['thumbs', 'image', 'images'].every(a => get({ action: a, ids: 'i1', id: 'i1' }).error === 'need_signin'), 'A3 photos by the public address: refused');
ok(post({ action: 'list' }).ok === false && post({ action: 'thumbs', ids: ['i1'] }).ok === false, 'A4 asking by POST without a sign-in: refused');
ok(get({ action: 'rev' }).ok === true, 'A5 the change counter (numbers only) still answers, so phones notice changes');

// B. signed in
g.R("saveUser_({name:'Raju',pin:'5273',role:'staff'})");
const tok = R("sessNew_(auth_({pin:'5273',dev:'phoneR'}),{dev:'phoneR'})").tok;
const l2 = post({ action: 'list', tok });
ok(l2.ok && l2.items.length === 1 && l2.items[0].buy === 150 && l2.sv >= 44, 'B1 signed-in phone: full price list (POST)');
ok(post({ action: 'thumbs', ids: ['i1'], tok }).thumbs[0].id === 'i1' && post({ action: 'image', id: 'i1', tok }).data === 'IMGi1' && post({ action: 'images', id: 'i1', tok }).photos[0] === 'Pi1', 'B2 signed-in phone: thumbnails and photos');

// C. saving a bill
const bill = n => ({ action: 'takeBill', n, env: 'live', by: 'Mayank (owner)', bill: { n, id: 'b' + n, total: 100 } });
ok(post(bill(1)).ok === false && R('TB.length') === 0, 'C1 a bill from someone not signed in (no shop code set): not saved');
ok(post({ ...bill(2), k: '' }).ok === false && post({ ...bill(3), pin: '0000' }).error === 'bad_pin' && R('TB.length') === 0, 'C2 …nor with a wrong PIN');
ok(post({ ...bill(4), tok }).ok === true && R('TB[0]') === 'Raju', 'C3 signed in: saved, under the signed-in name (Raju), not the name the phone sent');
ok(post({ ...bill(5), tok: 'x'.repeat(40) }).error === 'bad_session' && R('TB.length') === 1, 'C4 a made-up token: refused');

// D. wrong PINs: only PIN guessing waits
for (let i = 0; i < 70; i++) post({ action: 'verify', pin: String(1000 + i), dev: 'rot' + i });   // a stranger changing the phone id each try
ok(post({ action: 'verify', pin: '5273', dev: 'fresh' }).error === 'locked', 'D1 after 60 wrong PINs in an hour (phone id changed each time): PIN sign-in waits, even with the right PIN');
ok(post({ action: 'list', tok }).ok === true && post({ ...bill(6), tok }).ok === true, 'D2 …but a signed-in phone keeps working: price list and bills (before: the whole shop was locked out)');

// E. vendor bill files: only files this script made itself (v45). Every shop's script runs as the owner's Google account, so a
//    file id from a phone must never open another shop's sheet, a backup or the Directory.
R(`ENV_='live'; var OPENED=[]; DriveApp.getFileById=id=>{ OPENED.push(id); return { getBlob:()=>({getBytes:()=>[1,2,3], getContentType:()=>'image/jpeg'}) }; };
   vtab_=(n)=>({ rows: n==='VendorDocs' ? [{fileId:'OWNBILLPHOTO123', preview:'data:image/jpeg;base64,AAAA'}, {fileId:'EVILPREVIEW1234', preview:"x')\\"><img src=x onerror=alert(1)>"}] : [] });`);
ok(R("vFile_('OWNBILLPHOTO123').mime") === 'image/jpeg', 'E1 a bill photo this shop uploaded opens');
let refused = 0; for (const id of ['OTHERSHOPSHEET1', 'DIRECTORYSHEET1', 'x/../../etc', '']) { try { R(`vFile_(${JSON.stringify(id)})`); } catch (e) { refused++; } }
ok(refused === 4 && R('OPENED.join()') === 'OWNBILLPHOTO123', 'E2 any other Drive id (another shop\'s sheet, the Directory, junk): refused, never opened');
R("aiKey_=()=>'key'; aiCall_=()=>{ throw new Error('should not be asked'); }"); let r2 = 0; try { R("vRead_(['OTHERSHOPSHEET1'])"); } catch (e) { r2 = /not_found/.test(e.message) ? 1 : 0; } ok(r2 === 1 && R('OPENED.length') === 1, 'E3 bill reading can\'t be pointed at another file either');
const pv = R("vPreviews_(['OWNBILLPHOTO123','EVILPREVIEW1234']).previews");
ok(pv.OWNBILLPHOTO123 && !pv.EVILPREVIEW1234, 'E4 a preview that isn\'t a plain image is never handed out (it would run on the vendor\'s link page)');
ok(R("vPrevOk_('data:image/png;base64,iVBOR=')") && !R("vPrevOk_('javascript:alert(1)')") && !R(`vPrevOk_("data:image/png;base64,AA')x")`), 'E5 preview check: real image data only');
ok(R("keyEq_('abc','abc')") === true && R("keyEq_('abd','abc')") === false && R("keyEq_('', '')") === false, 'E6 secret keys compared safely; an empty key never matches');

// F. PINs (v46): the shop PIN is kept only as a digest, switches off once an owner has their own PIN, and easy PINs are refused
const g2 = gas([path.join(__dirname, '..', 'Code.gs')]), R2 = g2.R; g2.props.PIN = '4821';
R2("readConfig_=()=>({}); shopPaused_=()=>false; ensureEnv_=()=>{}; dedupeOnce_=()=>{}");
const v = b => JSON.parse(R2(`doPost({postData:{contents:${JSON.stringify(JSON.stringify(b))}}}).text`));
const sp = v({ action: 'verify', pin: '4821', by: 'Mayank', wantTok: true });
ok(sp.ok && sp.me.role === 'owner' && !g2.props.PIN && g2.props.PINH && g2.props.PINH !== '4821', 'F1 shop PIN still works before anyone has their own PIN, and is now kept only as a digest (plain PIN removed)');
const shopTok = sp.tok;
const bad = [['123456', 'owner'], ['000000', 'manager'], ['1234', 'staff'], ['1999', 'staff'], ['2580', 'staff'], ['98765', 'staff'], ['55555', 'staff'], ['48213', 'owner']];
const errs = bad.map(([pin, role]) => { try { R2(`saveUser_({name:'X',pin:'${pin}',role:'${role}'})`); return 'saved'; } catch (e) { return e.message; } });
ok(errs.join() === 'pin_easy,pin_easy,pin_easy,pin_easy,pin_easy,pin_easy,pin_easy,pin_short', 'F2 easy PINs refused (runs, repeats, years, keypad lines); owner/manager need 6+ digits: ' + errs.join());
let taken = ''; try { R2("saveUser_({name:'X',pin:'4821',role:'staff'})"); } catch (e) { taken = e.message; } ok(taken === 'pin_taken', 'F3 a personal PIN can\'t be the shop PIN');
R2("saveUser_({name:'Raju',pin:'5273',role:'staff'})");
ok(v({ action: 'verify', pin: '4821', by: 'X' }).ok && v({ action: 'verify', tok: shopTok }).ok, 'F4 a staff member alone doesn\'t switch the shop PIN off');
R2("saveUser_({name:'Mayank',pin:'739164',role:'owner'})");
ok(v({ action: 'verify', pin: '4821', by: 'Mayank' }).error === 'shop_pin_off', 'F5 once the owner has their own PIN: the shop PIN no longer signs in');
ok(v({ action: 'verify', tok: shopTok }).error === 'shop_pin_off', 'F6 …and phones signed in with it are signed out');
ok(v({ action: 'verify', pin: '739164' }).me.name === 'Mayank' && R2('listUsers_().shopPinOff') === true, 'F7 the owner\'s own PIN works; People shows the shop PIN as off');
let sp2 = ''; try { R2("setPin_('819273')"); } catch (e) { sp2 = e.message; } ok(sp2 === 'shop_pin_off', 'F8 the switched-off shop PIN can\'t be changed (or brought back that way)');
const oid = R2("users_().find(u=>u.role==='owner').id"); R2(`removeUser_('${oid}')`);
ok(v({ action: 'verify', pin: '4821', by: 'Mayank' }).ok, 'F9 removing the only owner turns the shop PIN back on, so nobody is locked out');
let w = ''; try { R2("setPin_('111111')"); } catch (e) { w = e.message; } ok(w === 'pin_easy', 'F10 a new shop PIN follows the same rules');

// G. editing past bills (v46): staff can't quietly wipe a customer's due; "fresh" only for the maker within 30 minutes
const g3 = gas([path.join(__dirname, '..', 'Code.gs')]), R3 = g3.R;
R3(`readConfig_=()=>({}); popReset_=()=>{}; touchCustomer_=()=>{}; refreshDue_=()=>{}; var HIST=[];
  var ROWS=[]; const mk=(n,o)=>{ const r=BILL_COLS.map(()=> ''); Object.keys(o).forEach(k=>r[BILL_COLS.indexOf(k)]=o[k]); r[BILL_COLS.indexOf('billNo')]=n; return r; };
  ROWS.push(mk(7,{billId:'b7',date:new Date(Date.now()-3*864e5),by:'Raju',total:500,payment:'Credit',paid:0,due:500,payments:'[]',mobile:'9876543210',edits:0}));
  ROWS.push(mk(8,{billId:'b8',date:new Date(Date.now()-5*60e3),by:'Raju',total:300,payment:'Credit',paid:0,due:300,payments:'[]',mobile:'9876543210',edits:0}));
  ROWS.push(mk(9,{billId:'b9',date:new Date(Date.now()-3*864e5),by:'Raju',total:200,payment:'Paid',edits:0}));
  sheet_=(name)=>name.indexOf('BillHistory')>=0 ? {appendRow:r=>HIST.push(r)} : { getLastRow:()=>ROWS.length+1, getRange:(r,c,n,m)=>({ getValues:()=>ROWS.slice(r-2,r-2+n).map(x=>x.slice()), setValues:v=>{ ROWS[r-2]=v[0]; } }) };`);
const ub = (b, by, role) => { try { return R3(`updateBill_(${JSON.stringify(b)}, '${by}', {role:'${role}', name:'${by}'})`) || 'ok'; } catch (e) { return e.message; } };
const col = (n, k) => R3(`ROWS.find(r=>r[BILL_COLS.indexOf('billNo')]===${n})[BILL_COLS.indexOf('${k}')]`);
ok(ub({ id: 'b7', n: 7, total: 500, pay: 'paid', mobile: '9876543210', fresh: true }, 'Raju', 'staff') === 'needs_manager' && col(7, 'due') === 500, 'G1 staff marking an old credit bill as Paid (even claiming "fresh"): refused, the due stays');
ok(ub({ id: 'b7', n: 7, total: 100, pay: 'credit', mobile: '9876543210' }, 'Raju', 'staff') === 'needs_manager', 'G2 staff lowering the total of a bill with money due: refused');
ok(ub({ id: 'b7', n: 7, total: 500, pay: 'credit', mobile: '9876543210', customer: 'Sunil T.' }, 'Raju', 'staff') !== 'needs_manager' && col(7, 'editedBy') === 'Raju', 'G3 staff fixing the name on it: allowed, and marked Edited by Raju');
ok(ub({ id: 'b7', n: 7, total: 500, pay: 'paid', mobile: '9876543210' }, 'Sanjay', 'manager') !== 'needs_manager' && col(7, 'payment') === 'Paid' && col(7, 'editedBy') === 'Sanjay', 'G4 a manager can change it, and it shows as edited by them');
ok(ub({ id: 'b8', n: 8, total: 320, pay: 'credit', mobile: '9876543210', fresh: true }, 'Raju', 'staff') !== 'needs_manager' && !col(8, 'editedBy'), 'G5 the maker tweaking their own bill within 30 minutes: allowed, not marked Edited (as before)');
ok(ub({ id: 'b9', n: 9, total: 150, pay: 'paid', fresh: true }, 'Raju', 'staff') !== 'needs_manager' && col(9, 'editedBy') === 'Raju', 'G6 an old paid bill changed with "fresh": still marked Edited (fresh only counts within 30 minutes)');
ok(R3('HIST.length') >= 4, 'G7 every change keeps the old text in BillHistory');

// H. new-phone approval belongs to the person on that phone (v46): copying an approved phone's id doesn't skip it
const g4 = gas([path.join(__dirname, '..', 'Code.gs')]), R4 = g4.R; g4.props.PIN = '4821';
R4("readConfig_=()=>({approveNew:true}); saveUser_({name:'Raju',pin:'5273',role:'staff'}); saveUser_({name:'Mohan',pin:'6194',role:'staff'})");
const s1 = R4("sessNew_(auth_({pin:'5273',dev:'counterA'}),{dev:'counterA'})"); R4("sessEdit_(all=>Object.keys(all).forEach(k=>{ delete all[k].p; }))");
ok(s1.pending === true, 'H1 Raju on a new phone waits for the owner (then approved)');
ok(R4("sessNew_(auth_({pin:'5273',dev:'counterA'}),{dev:'counterA'})").pending === false, 'H2 Raju signing in again on the same phone: no second wait');
ok(R4("sessNew_(auth_({pin:'6194',dev:'counterA'}),{dev:'counterA'})").pending === true, 'H3 someone else using that phone\'s id (copied, or the same counter phone): waits for approval');

// I. the error log (v46): at most 60 an hour in all (a stranger can change the phone id each time); a name only from a sign-in
const ce = b => JSON.parse(R(`doPost({postData:{contents:${JSON.stringify(JSON.stringify(b))}}}).text`));
for (let i = 0; i < 80; i++) ce({ action: 'clientErr', dev: 'spam' + i, by: 'Owner', e: { m: 'fake ' + i } });
const kept = JSON.parse(g.cache.CERRS || '[]');
ok(kept.length <= 40 && Number(g.cache.cerr_all) === 60, 'I1 80 fake errors from "different phones": only 60 an hour get in');
ok(kept.every(x => /^\? /.test(x.by)), 'I2 a name sent without a sign-in is marked "?", never shown as that person');
ok(R("str_('-cmd|x',20)") === "'-cmd|x" && R("str_('=SUM(A1)',20)") === "'=SUM(A1)", 'I3 text starting with - or = is stored as text, never as a sheet formula');

// J. a PIN opens only its own person's account (v51). Seen 14 Oct 2026: on a laptop showing "Mayank", typing an old PIN that is
//    now Dad's own PIN signed in as Dad (the name sent with the PIN was ignored).
const g5 = gas([path.join(__dirname, '..', 'Code.gs')]), R5 = g5.R; g5.props.PIN = '4821';
R5("readConfig_=()=>({}); shopPaused_=()=>false; ensureEnv_=()=>{}; dedupeOnce_=()=>{}; saveUser_({name:'Mayank',pin:'739164',role:'owner'}); saveUser_({name:'Dad',pin:'582947',role:'owner'})");
const v5 = b => JSON.parse(R5(`doPost({postData:{contents:${JSON.stringify(JSON.stringify(b))}}}).text`));
const j1 = v5({ action: 'verify', pin: '582947', by: 'Mayank', wantTok: true, dev: 'lap' });
ok(j1.ok === false && j1.error === 'bad_pin' && !j1.tok, 'J1 Dad\'s PIN with the name Mayank: wrong PIN, no sign-in, no token');
ok(Object.keys(JSON.parse(g5.props.SESS || '{}')).length === 0, 'J2 …and no session was made for Dad');
ok(Number(g5.cache.fails_lap) === 1, 'J3 …counted as a wrong PIN (so it can\'t be used to try names)');
ok(v5({ action: 'verify', pin: '582947', by: ' dad ' }).me.name === 'Dad' && v5({ action: 'verify', pin: '739164', by: 'MAYANK' }).me.name === 'Mayank', 'J4 the right name (any case, extra spaces) still signs in');
ok(v5({ action: 'verify', pin: '582947' }).me.name === 'Dad', 'J5 no name typed: the PIN alone finds its person (PINs are unique)');
const g6 = gas([path.join(__dirname, '..', 'Code.gs')]), R6 = g6.R; g6.props.PIN = '4821'; R6("readConfig_=()=>({}); saveUser_({name:'Sonu',pin:'615283',role:'staff'})");
let t8 = ''; try { R6("setPin_('615283')"); } catch (e) { t8 = e.message; } let t9 = 'x'; try { R6("setPin_('817364')"); t9 = ''; } catch (e) { t9 = e.message; }
ok(t8 === 'pin_taken' && t9 === '', 'J6 the shop PIN can\'t be changed to someone\'s own PIN (another one is fine)');
