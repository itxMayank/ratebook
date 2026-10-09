const fs=require('fs'), vm=require('vm'), crypto=require('crypto');
const props={}, cache={};
const ctx={ console, PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];}})},
  CacheService:{getScriptCache:()=>({get:k=>cache[k]??null,put:(k,v)=>{cache[k]=v;}})},
  Utilities:{ getUuid:()=>crypto.randomUUID(), DigestAlgorithm:{SHA_256:'sha256'}, computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()], base64Encode:b=>Buffer.from(b.map(x=>x&255)).toString('base64') },
  SpreadsheetApp:{}, DriveApp:{}, LockService:{} };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','..','Code.gs'),'utf8'),ctx);
const R=c=>vm.runInContext(c,ctx), ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
props.PIN='9999';
R("saveUser_({name:'Sanjay',pin:'1111',role:'staff'}); saveUser_({name:'Dad',pin:'2222',role:'manager',testOk:false});");
const sanjay=R("auth_({pin:'1111',dev:'a'})"), dad=R("auth_({pin:'2222',dev:'b'})"), owner=R("auth_({pin:'9999',by:'Mayank',dev:'c'})");
ok(sanjay.testOk===true && dad.testOk===false && owner.master, 'auth carries testOk');
ctx.S1=sanjay; ctx.D1=dad; ctx.O1=owner;
let r=R("setMyPrefs_(S1,{mode:'test',showProfit:true,hideBuy:true})");
ok(r.prefs.mode==='test' && r.prefs.hideBuy===true && r.prefs.showProfit===undefined, 'staff: own test mode + hide buy saved, profit refused');
r=R("setMyPrefs_(D1,{mode:'test',showProfit:true})"); ok(r.prefs.mode==='live' && r.prefs.showProfit===true && r.testOk===false, 'kept out of test mode: stays live; manager profit saved');
r=R("setMyPrefs_(O1,{mode:'live'})"); ok(R("prefsOf_(O1)").mode==='live' && JSON.parse(props.MPREFS).mayank.mode==='live', 'shop-PIN owner prefs kept by name');
ok(R("prefsOf_(S1)").mode==='test' && R("prefsOf_(D1)").mode==='live', 'each person keeps their own mode');
r=R("setMyPrefs_(S1,{mode:'bogus',hideBuy:'yes'})"); ok(r.prefs.mode==='test' && r.prefs.hideBuy===true, 'bad values ignored, earlier ones kept');
const id=JSON.parse(props.USERS).find(u=>u.name==='Sanjay').id; ctx.ID=id;
R("saveUser_({id:ID,name:'Sanjay',role:'staff',testOk:false})");
ok(R("prefsOf_(S1)").mode==='live' && R("listUsers_()").users.find(u=>u.id===id).testOk===false, 'owner turns test off: person moved to live');
ok(JSON.parse(props.USERS).every(u=>u.h), 'PIN hashes untouched');
