const fs=require('fs'), vm=require('vm'), crypto=require('crypto');
const props={}, cache={}; let locks=0;
const ctx={ console, PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];}})},
  CacheService:{getScriptCache:()=>({get:k=>cache[k]??null,put:(k,v)=>{cache[k]=v;},remove:k=>{delete cache[k];}})},
  LockService:{getScriptLock:()=>({tryLock:()=>{locks++;return true;},waitLock:()=>{locks++;},releaseLock:()=>{locks--;}})},
  Utilities:{ getUuid:()=>crypto.randomUUID(), DigestAlgorithm:{SHA_256:'sha256'}, computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()],
    base64Encode:b=>Buffer.from(b.map(x=>x&255)).toString('base64'), base64EncodeWebSafe:b=>Buffer.from(b.map(x=>x&255)).toString('base64url')+'=' },
  SpreadsheetApp:{}, DriveApp:{} };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','Code.gs'),'utf8'),ctx);
const R=c=>vm.runInContext(c,ctx), ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
props.PIN='9999';
/* v57 (16 Oct 2026): a person changes their own PIN; display choices (ui) follow the person; someone who once used the shop PIN
   under the same name keeps those choices on their own account. Reported: a PIN worked on one device and not another, and the
   laptop didn't have the phone's settings. Run: node tests/mypin.test.js */
R("saveUser_({name:'Mayank',pin:'749163',role:'owner'})"); R("saveUser_({name:'Dad',pin:'815302',role:'owner'})"); R("saveUser_({name:'Sanjay',pin:'5273',role:'staff'})");
const U=()=>JSON.parse(props.USERS), idOf=n=>U().find(u=>u.name===n).id;
const tPhone=R("sessNew_(auth_({pin:'749163',by:'Mayank',dev:'p'}),{dl:'Android'}).tok"), tLap=R("sessNew_(auth_({pin:'749163',by:'Mayank',dev:'l'}),{dl:'Laptop'}).tok"), tDad=R("sessNew_(auth_({pin:'815302',by:'Dad',dev:'d'}),{}).tok");
ctx.TP=tPhone; ctx.TL=tLap; ctx.TD=tDad;
const err=c=>{ try{ R(c); return ''; }catch(e){ return e.message; } };
/* A. change my PIN */
ok(R("NEEDS.setMyPin")==='staff' && R("PAUSE_OK_.setMyPin")===1, 'A1 anyone signed in may change their own PIN, also while the shop is paused');
ok(err("setMyPin_(auth_({tok:TP}),'000000','583917')")==='bad_old_pin', 'A2 the current PIN must be right');
ok(err("setMyPin_(auth_({tok:TP}),'749163','1994')")==='pin_short', 'A3 an owner needs 6–8 digits (a 4-digit PIN is refused)');
ok(err("setMyPin_(auth_({tok:TP}),'749163','123456')")==='pin_easy', 'A4 easy PINs are refused');
ok(err("setMyPin_(auth_({tok:TP}),'749163','815302')")==='pin_taken', 'A5 someone else\'s PIN can\'t be taken');
ok(err("setMyPin_(auth_({tok:TP}),'749163','749163')")==='pin_same', 'A6 the same PIN says so');
const r=R("setMyPin_(auth_({tok:TP}),'749163','583917')");
ok(r.pinLen===6 && !R("auth_({tok:TP})").error, 'A7 changed: this phone stays signed in');
ok(R("auth_({tok:TL})").error==='bad_session', 'A8 …the laptop (same person, other device) is signed out, so the old PIN stops working there');
ok(!R("auth_({tok:TD})").error, 'A9 …other people stay signed in');
ok(R("auth_({pin:'749163',by:'Mayank'})").error==='bad_pin' && R("auth_({pin:'583917',by:'Mayank'})").name==='Mayank', 'A10 old PIN refused, new PIN signs in');
ok(err("setMyPin_(auth_({tok:TD}),'815302','583917')")==='pin_taken', 'A11 Dad can\'t take Mayank\'s new PIN');
const tS=R("sessNew_(auth_({pin:'5273',by:'Sanjay'}),{}).tok"); ctx.TS=tS;
ok(!err("setMyPin_(auth_({tok:TS}),'5273','4826')"), 'A12 staff may keep 4 digits');
/* B. display choices follow the person */
ok(JSON.stringify(R("setMyPrefs_(auth_({tok:TP}),{ui:{lang:'hi',palette:'forest',spos:'top',rcstyle:'pills',sort:'az',cashopen:true,appear:'dark',sres:'top'}})").prefs.ui)===JSON.stringify({lang:'hi',palette:'forest',appear:'dark',spos:'top',sres:'top',rcstyle:'pills',sort:'az',cashopen:true}), 'B1 every display choice is kept with the person');
const tLap2=R("sessNew_(auth_({pin:'583917',by:'Mayank',dev:'l'}),{}).tok"); ctx.TL2=tLap2;
ok(R("prefsOf_(auth_({tok:TL2})).ui.palette")==='forest', 'B2 the laptop signing in gets them');
R("setMyPrefs_(auth_({tok:TL2}),{ui:{palette:'saffron'}})");
const ui=R("prefsOf_(auth_({tok:TP})).ui");
ok(ui.palette==='saffron' && ui.lang==='hi' && ui.rcstyle==='pills', 'B3 one choice changed on the laptop: the others stay');
R("setMyPrefs_(auth_({tok:TP}),{ui:{lang:'fr',palette:'neon',fz:2,cashopen:'yes',sort:'x'}})");
const ui2=R("prefsOf_(auth_({tok:TP})).ui");
ok(ui2.lang==='hi' && ui2.palette==='saffron' && ui2.fz===undefined && ui2.cashopen===true, 'B4 unknown values are ignored (text size is per device)');
ok(R("prefsOf_(auth_({tok:TP})).mode")===undefined && R("setMyPrefs_(auth_({tok:TP}),{mode:'live'}).prefs.ui.lang")==='hi', 'B5 test/real and the display choices live side by side');
ok(R("prefsOf_(auth_({tok:TD})).ui")===undefined, 'B6 Dad\'s choices are his own');
/* C. shop-PIN sign-in under the same name → own account keeps those choices */
props.PINH=R("hashPin_('903817')"); R("removeUser_('"+idOf('Mayank')+"')"); R("removeUser_('"+idOf('Dad')+"')");   // no owner with an own PIN: the shop PIN works
const tM=R("sessNew_(auth_({pin:'903817',by:'Ravi'}),{}).tok"); ctx.TM=tM; R("setMyPrefs_(auth_({tok:TM}),{ui:{lang:'hi',rcstyle:'pills'}})");
R("saveUser_({name:'Ravi',pin:'640519',role:'manager'})");
ok(R("prefsOf_(auth_({pin:'640519',by:'Ravi'})).ui.rcstyle")==='pills', 'C1 Ravi used the shop PIN, then got his own PIN: his choices come with him');
ok(err("setMyPin_(auth_({tok:TM}),'903817','640888')")==='not_personal', 'C2 a shop-PIN sign-in has no own PIN to change');
ok(locks===0, 'every lock released');
