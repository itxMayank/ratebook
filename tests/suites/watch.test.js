const fs=require('fs'), vm=require('vm');
const props={}, cache={}; let driveTime=0;
const ctx={ PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];}})},
  CacheService:{getScriptCache:()=>({get:k=>cache[k]??null,put:(k,v)=>{cache[k]=v;}})},
  DriveApp:{getFileById:()=>({getLastUpdated:()=>({getTime:()=>driveTime})})}, SpreadsheetApp:{}, Utilities:{}, LockService:{}, console };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','..','Code.gs'),'utf8')+'\nthis.watchSheet=watchSheet; this.ss_=()=>({getId:()=>"x"});',ctx);
vm.runInContext('ss_=()=>({getId:()=>"x"})',ctx);
const T0=1_000_000_000_000;
Object.assign(props,{rev:String(T0),brev_live:String(T0),brev_test:String(T0),vrev_live:String(T0+600000),vrev_test:String(T0)});
driveTime=T0+600000+2000; ctx.watchSheet();   // a vendor save 10 min after the last price change
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
ok(props.rev===String(T0), 'a vendor save is not mistaken for a hand edit');
driveTime=T0+900000; ctx.watchSheet();        // a real hand edit later
ok(props.rev!==String(T0) && props.vrev_live!==String(T0+600000) && props.vrev_test!==String(T0), 'a real hand edit refreshes prices, bills and vendors (both modes)');
