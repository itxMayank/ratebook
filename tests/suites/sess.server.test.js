const fs=require('fs'), vm=require('vm'), crypto=require('crypto');
const props={}, cache={}; let locks=0;
const ctx={ console, PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];}})},
  CacheService:{getScriptCache:()=>({get:k=>cache[k]??null,put:(k,v)=>{cache[k]=v;},remove:k=>{delete cache[k];}})},
  LockService:{getScriptLock:()=>({tryLock:()=>{locks++;return true;},waitLock:()=>{locks++;},releaseLock:()=>{locks--;}})},
  Utilities:{ getUuid:()=>crypto.randomUUID(), DigestAlgorithm:{SHA_256:'sha256'}, computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()],
    base64Encode:b=>Buffer.from(b.map(x=>x&255)).toString('base64'), base64EncodeWebSafe:b=>Buffer.from(b.map(x=>x&255)).toString('base64url')+'=' },
  SpreadsheetApp:{}, DriveApp:{} };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','..','Code.gs'),'utf8'),ctx);
const R=c=>vm.runInContext(c,ctx), ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
props.PIN='9999';
R("saveUser_({name:'Sanjay',pin:'1111',role:'staff'})");
const sid=JSON.parse(props.USERS)[0].id; ctx.SID=sid;
const tS=R("sessNew_(auth_({pin:'1111',dev:'a'}),{dl:'Android · Chrome'}).tok"), tO=R("sessNew_(auth_({pin:'9999',by:'Mayank',dev:'b'}),{dl:'iPhone'}).tok");
ok(/^[0-9a-f]{64}$/.test(tS), 'token is 64 random hex chars');
ok(!props.SESS.includes(tS), 'sheet stores only a hash of the token');
ctx.TS=tS; ctx.TO=tO;
let w=R("auth_({tok:TS})"); ok(w.name==='Sanjay' && w.role==='staff' && w.sess, 'token signs in as the person');
w=R("auth_({tok:TO})"); ok(w.master && w.name==='Mayank' && w.role==='owner', 'shop-PIN token = owner by name');
ok(R("auth_({tok:'f'.repeat(64)})").error==='bad_session' && !cache['fails_nodev'], 'wrong token refused, not counted as a wrong PIN');
const L=R("listSessions_(auth_({tok:TO}))").sessions; ok(L.length===2 && L.find(x=>x.me).name==='Mayank' && L.find(x=>x.name==='Sanjay').label==='Android · Chrome', 'owner sees both phones, own marked');
R("saveUser_({id:SID,name:'Sanjay',role:'staff',active:false})"); ok(R("auth_({tok:TS})").error==='bad_session', 'switched-off person is out at once');
R("saveUser_({id:SID,name:'Sanjay',role:'staff',active:true})"); 
const tS2=R("sessNew_(auth_({pin:'1111'}),{}).tok"); ctx.TS2=tS2; ok(!R("auth_({tok:TS2})").error, 'can sign in again');
R("saveUser_({id:SID,name:'Sanjay',role:'staff',pin:'3333'})"); ok(R("auth_({tok:TS2})").error==='bad_session', 'new PIN signs that person out everywhere');
ok(!R("auth_({tok:TO})").error, '…but not other people');
const id=R("listSessions_(auth_({tok:TO}))").sessions[0].id; ctx.ID=id; R("sessEnd_(k=>k.indexOf(ID)===0)"); ok(R("auth_({tok:TO})").error==='bad_session', 'owner can sign a phone out');
const old=R("sessNew_(auth_({pin:'3333'}),{}).tok"); ctx.OLD=old; const all=JSON.parse(props.SESS); Object.values(all)[0].s=Date.now()-91*864e5; Object.values(all)[0].c=Date.now()-91*864e5; props.SESS=JSON.stringify(all); delete cache.SESS;
ok(R("auth_({tok:OLD})").error==='bad_session', 'unused for 90 days = signed out');
ok(locks===0, 'every lock released');
R("LOCKED_=true"); const before=locks; R("sessEnd_(()=>false)"); ok(locks===before, 'inside the request lock: no second lock taken'); R("LOCKED_=false");
