/* Rate Book: vendor khata (Tools → Vendors). Split out of app.js on 11 Oct 2026. A plain script in global scope, loaded
   before app.js: it only declares things (functions, and consts/lets that need nothing from app.js while loading) plus two
   timers/listeners, so everything here exists when app.js starts. Its functions use app.js helpers ($, S, t, apiPost, openSheet…)
   only when called. Run  node tools/stamp.js  after editing. */
"use strict";
/* ======================= Vendor khata =======================
 * Tools → Vendors (owner + manager). What the shop owes each supplier: purchase bills (with clear photos/PDFs kept in
 * Google Drive), payments (choose which bills they settle, else oldest first), returns/discounts, a statement PDF and a
 * private read-only link for the vendor. Test mode keeps its own vendors. Server: v* actions in Code.gs. */
const VD={ list:null, det:{}, chip:"all", q:"", tab:"ledger", bf:"open", cur:null };
const vKey=k=>`v:${S.cfg.mode}:${k}`;
const vToday=()=>dayKey(new Date());
const vDate=d=>{ if(!d) return ""; const x=new Date(d+"T00:00:00"); return x.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); };
const vDays=d=>Math.max(0,Math.round((new Date(vToday()+"T00:00:00")-new Date(d+"T00:00:00"))/864e5));
const vId=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const vMoney=n=>rs(Math.round((+n||0)*100)/100);
const VMODES=["Cash","UPI","Bank","Cheque"];
function vErr(e){ const c=e&&e.code; if(c==="drive_auth") return t("vDriveAuth"); if(c==="dup_vendor") return t("vDup"); if(c==="not_allowed") return t("vNoAccess"); return errMsg(e); }
async function vCall(body){ try{ return await apiPost(body); }catch(e){ toast(vErr(e)); throw e; } }
/* ---- local copy + outbox (makes Vendors instant) ----
 * VDB.srv = the sheet's vendor data as last synced ({vrev, vendors, entries}, IndexedDB "v:<mode>:all").
 * The outbox (rb_vq_<mode>) holds changes not yet sent. What you see = srv with the outbox applied on top (vRebuild →
 * VD.list / VD.det, balances worked out on the phone by vCalcJS). So opening a vendor and saving take no waiting: the
 * outbox is sent in the background one change at a time, then vSync asks the sheet "anything new?" (tiny reply if not). */
const VDB={mode:null, loaded:false, srv:{vrev:"",vendors:[],entries:[]}};
const vqKey=()=>"rb_vq_"+S.cfg.mode;
const vqGet=()=>{ const a=ls.get(vqKey(),[]); return Array.isArray(a)?a:[]; };
const vqSet=a=>ls.set(vqKey(),a);
async function vdbInit(){ if(VDB.loaded && VDB.mode===S.cfg.mode) return; VDB.mode=S.cfg.mode; VD.det={}; VD.list=null;
  const c=await idb.get("images",vKey("all")); VDB.srv=c&&Array.isArray(c.vendors)?c:{vrev:"",vendors:[],entries:[]}; VDB.loaded=true; vRebuild(); }
function vdbSave(){ idb.set("images",vKey("all"),VDB.srv); }
const vSynced=()=>!!VDB.srv.vrev;
/** Same sums as vCalc_ in Code.gs. */
function vCalcJS(v,entries){ const r2v=x=>Math.round(x*100)/100, today=vToday(), cd=+v.creditDays||0;
  const add=(d,n)=>{ const x=new Date(d+"T00:00:00Z"); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().slice(0,10); };
  const live=entries.filter(e=>!e.removed).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.at||0)-(b.at||0));
  const bills=[]; if(v.opening>0) bills.push({id:"open:"+v.id,date:v.openingDate,amount:+v.opening,billNo:"Opening balance",opening:true,at:0});
  live.filter(e=>e.type==="bill").forEach(e=>bills.push({id:e.id,date:e.date,amount:+e.amount,billNo:e.billNo,at:e.at}));
  const byId={}; bills.forEach(b=>{ b.paid=0; b.by=[]; byId[b.id]=b; });
  let paid=0, alloc=0, billTotal=v.opening>0?+v.opening:0, opNeg=v.opening<0?-v.opening:0;
  live.forEach(e=>{ if(e.type==="bill"){ billTotal+=+e.amount; return; } paid+=+e.amount; let left=+e.amount;
    Object.keys(e.alloc||{}).forEach(id=>{ const b=byId[id]; if(!b) return; const a=Math.min(+e.alloc[id]||0,left,Math.max(0,b.amount-b.paid)); if(a<=0) return; b.paid=r2v(b.paid+a); left-=a; alloc+=a; b.by.push({id:e.id,a:r2v(a)}); }); });
  bills.forEach(b=>{ b.due=Math.max(0,r2v(b.amount-b.paid)); b.status=b.due<=0?"paid":b.paid>0?"part":"open"; b.dueDate=cd?add(b.date,cd):""; b.overdue=!!(b.due>0&&b.dueDate&&b.dueDate<today); });
  const open=bills.filter(b=>b.due>0);
  return { bills, balance:r2v(billTotal-paid-opNeg), advance:Math.max(0,r2v(paid+opNeg-alloc)), openBills:open.length, overdue:open.filter(b=>b.overdue).length, oldest:open.length?open[0].date:"",
    billTotal:r2v(billTotal), paidTotal:r2v(paid), lastAt:live.reduce((m,e)=>Math.max(m,e.at||0),+v.updatedAt||0) }; }
function vApplyJob(vs,es,j){
  if(j.k==="vendor"){ const i=vs.findIndex(v=>v.id===j.v.id); const base=i>=0?vs[i]:{createdAt:j.at,linkOn:false,token:""}; const nv={...base,...j.v,updatedAt:j.at,pending:true}; if(i>=0) vs[i]=nv; else vs.push(nv); }
  else if(j.k==="save"){ const i=es.findIndex(e=>e.id===j.e.id); const nv={...(i>=0?es[i]:{at:j.at,by:byName(),history:[]}),...j.e,alloc:{...(j.e.alloc||{})},pending:true};
    if(nv.type==="bill" && j.e.ex) nv.check=vCheckJS(j.e.ex,nv.amount); else if(nv.type==="bill" && i>=0 && JSON.stringify((es[i].photos||[]).map(p=>p.f))!==JSON.stringify((nv.photos||[]).map(p=>p.f))) nv.check=null;
    delete nv.ex; if(i>=0) es[i]=nv; else es.push(nv);
    if(j.isNew && j.e.type==="bill" && j.e.useAdvance) vApplyJob(vs,es,{k:"adv",vendorId:j.e.vendorId,billId:j.e.id}); }
  else if(j.k==="rm"){ const e=es.find(x=>x.id===j.id); if(e){ e.removed=!!j.on; e.pending=true; } }
  else if(j.k==="check"){ const e=es.find(x=>x.id===j.id); if(e) e.checking=true; }
  else if(j.k==="ack"){ const e=es.find(x=>x.id===j.id); if(e&&e.check){ e.check={...e.check}; if(j.on) e.check.ack={by:byName(),at:j.at}; else delete e.check.ack; } }
  else if(j.k==="adv"){ const v=vs.find(x=>x.id===j.vendorId); if(!v) return; const en=es.filter(e=>e.vendorId===v.id); const c=vCalcJS(v,en); const b=c.bills.find(x=>x.id===j.billId); if(!b||b.due<=0) return; let need=b.due;
    en.filter(e=>!e.removed&&e.type!=="bill").sort((a,b2)=>a.date<b2.date?-1:a.date>b2.date?1:(a.at||0)-(b2.at||0)).forEach(e=>{ if(need<=0) return; const used=Object.values(e.alloc||{}).reduce((s,a)=>s+(+a||0),0), free=Math.round((e.amount-used)*100)/100; if(free<=0) return;
      const a=Math.min(free,need); e.alloc={...(e.alloc||{})}; e.alloc[j.billId]=Math.round(((+e.alloc[j.billId]||0)+a)*100)/100; e.pending=true; need-=a; }); } }
function vRebuild(){ const vs=VDB.srv.vendors.map(v=>({...v})), es=VDB.srv.entries.map(e=>({...e,alloc:{...(e.alloc||{})}}));
  vqGet().forEach(j=>vApplyJob(vs,es,j));
  const det={}, list=[]; vs.filter(v=>!v.removed).forEach(v=>{ const en=es.filter(e=>e.vendorId===v.id).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.at||0)-(b.at||0)); const calc=vCalcJS(v,en); calc.flagged=en.filter(vFlagged).length; det[v.id]={vendor:v,entries:en,calc}; const s={...v,...calc}; delete s.bills; delete s.token; list.push(s); });
  VD.det=det; VD.list={vendors:list, owe:Math.round(list.reduce((a,v)=>a+Math.max(0,v.balance),0)*100)/100}; }
/** Add a change: shown at once, sent in the background. Returns the job id (for Undo). */
function vqAdd(job){ job.jid=vId("j"); job.at=Date.now(); vqSet([...vqGet(),job]); vRebuild(); vRefreshOpen(); setTimeout(vqFlush,30); return job.jid; }
/** Undo: drop the change if it hasn't been sent yet, else send the opposite change. */
function vUndo(jid,inverse){ const q=vqGet(); if(q.some(j=>j.jid===jid) && !(vqBusy && q[0].jid===jid)){ vqSet(q.filter(j=>j.jid!==jid)); vRebuild(); vRefreshOpen(); } else if(inverse) vqAdd(inverse); toast(t("vUndone")); }
let vqBusy=false, vqErr=null, vqTimer=0;
let vMergeN=0;   // counts replies merged from sends, so a vSync that started before one can't overwrite it with older data
function vMerge(r){ if(!r || !r.vendor) return; vMergeN++; const s=VDB.srv; const i=s.vendors.findIndex(v=>v.id===r.vendor.id); if(i>=0) s.vendors[i]=r.vendor; else s.vendors.push(r.vendor);
  s.entries=s.entries.filter(e=>e.vendorId!==r.vendor.id).concat(r.entries||[]); vdbSave(); }
const vNetErr=e=>!e || e.code==="offline" || e.code==="http" || e instanceof TypeError || e.name==="TypeError";
async function vqFlush(){ if(vqBusy || navigator.onLine===false || !S.canWrite || !can("manager") || !vqGet().length) return; vqBusy=true; vqErr=null; vNoteUpd();
  try{ while(vqGet().length){ const q0=vqGet(), job=q0.find(j=>j.k!=="check")||q0[0];   /* bill checks wait behind saves */
      try{ let r;
        if(job.k==="vendor") r=await apiPost0({action:"vSaveVendor",vendor:job.v});
        else if(job.k==="save"){
          for(const k of [...(job.files||[])]){ const d=await idb.get("images","vqf:"+k); if(d){ const u=await apiPost0({action:"vUpload",vendorId:job.e.vendorId,data:d.data,mime:d.mime,preview:d.preview||"",name:d.name||""});
              if(d.preview) idb.set("images","vprev:"+u.f,d.preview); idb.set("images","vfull:"+u.f,{data:d.data,mime:d.mime});
              job.e.photos=(job.e.photos||[]).map(p=>p.f==="local:"+k?{f:u.f,m:u.m}:p); idb.del("images","vqf:"+k); }
            job.files=job.files.filter(x=>x!==k); const q=vqGet(); if(q[0]&&q[0].jid===job.jid){ q[0]=job; vqSet(q); } }
          r=await apiPost0({action:"vSave",entry:{...job.e,photos:(job.e.photos||[]).filter(p=>!String(p.f).startsWith("local:")),isNew:!!job.isNew}}); }
        else if(job.k==="rm") r=await apiPost0({action:"vRemove",id:job.id,on:!!job.on});
        else if(job.k==="adv") r=await apiPost0({action:"vUseAdvance",vendorId:job.vendorId,billId:job.billId});
        else if(job.k==="check"){ VD.chkRun=job.jid;
          try{ r=await Promise.race([apiPost0({action:"vCheck",id:job.id}), new Promise((_,no)=>setTimeout(()=>no({code:"timeout"}),window.RB_CHK_MS||100000))]); }
          catch(e){ const net=vNetErr(e); job.tries=(job.tries||0)+1;
            if(e&&(e.code==="ai_off"||e.code==="no_entry"||e.code==="bad_action")) r=null;
            else if(net && job.tries<2){ const q=vqGet(); const i=q.findIndex(x=>x.jid===job.jid); if(i>=0){ q[i]=job; vqSet(q); } throw e; }   /* one retry on a dropped connection */
            else { VD.chkFail=VD.chkFail||{}; VD.chkFail[job.id]={code:e&&e.code||"fail",at:Date.now()}; r=null; } }
          finally{ VD.chkRun=null; }
          if(VD.chkStop && VD.chkStop[job.jid]){ delete VD.chkStop[job.jid]; r=null; } }
        else if(job.k==="ack") r=await apiPost0({action:"vAck",id:job.id,on:!!job.on});
        vMerge(r); }
      catch(e){ if(vNetErr(e)) throw e; if(e.code==="drive_auth" || e.code==="bad_pin" || e.code==="locked"){ vqErr=e.code; throw e; } toast(vErr(e)); }   // other server refusals: drop this change
      vqSet(vqGet().filter(j=>j.jid!==job.jid)); vRebuild(); vRefreshOpen(); }
    vqBusy=false; vNoteUpd(); vSync(true); }
  catch(e){ clearTimeout(vqTimer); vqTimer=setTimeout(vqFlush,20000); }
  finally{ vqBusy=false; vNoteUpd(); } }
window.addEventListener("online",()=>setTimeout(vqFlush,800));
let vSyncing=null, vSyncAt=0; const VSCHEMA=2;
/** Ask the sheet for changes (from other phones). Shows the local copy meanwhile. At most every 8 s unless forced. */
function vSync(force){ if(vSyncing) return vSyncing; if(!force && Date.now()-vSyncAt<8000 && vSynced()) return Promise.resolve(); vSyncAt=Date.now(); vSyncing=(async()=>{ await vdbInit(); if(!S.canWrite||!can("manager")) return;
    if(vqGet().length) vqFlush();   // send waiting changes, but still fetch: a stuck change must not hide other phones' entries
    vNoteUpd(); const m0=vMergeN;
    /* A copy saved by an older app/script lacks newer fields (e.g. the line count behind "Items on this bill"), and "nothing
       changed" would keep it forever: send no version until the copy is in the current shape (VSCHEMA). */
    try{ const r=await apiPost0({action:"vSync",vrev:VDB.srv.schema===VSCHEMA?(VDB.srv.vrev||""):""}); if(!r.same){ if(vMergeN!==m0){ setTimeout(()=>vSync(true),0); return; }   /* a send finished meanwhile: this reply may predate it, ask again */
        VDB.srv={vrev:r.vrev,schema:VSCHEMA,vendors:r.vendors||[],entries:r.entries||[]}; VD.buys={}; vdbSave(); vRebuild(); vRefreshOpen(); } }
    catch(e){ if(e&&e.code==="bad_action"){ /* old script: fall back to the per-vendor calls */ } } })().finally(()=>{ vSyncing=null; vNoteUpd(); }); return vSyncing; }
function vRefreshOpen(){ if($("#sheet").hidden) return; if($("#vl-list")) vRenderList(); else if($("#vd-page") && VD.cur) vRenderVendor(VD.cur,true);
  else if($("#ve-back") && VD.ent && VD.det[VD.ent.v]){ const sc=$("#sheet-body"), st=sc?sc.scrollTop:0; vEntry(VD.ent.v,VD.ent.e); const sc2=$("#sheet-body"); if(sc2) sc2.scrollTop=st; }   /* a bill's screen: "Checking…" turns into the result */
  vNoteUpd(); }
/** The small "Saving… / waiting to send / photo problem" line. */
function vNoteUpd(){ const el=$("#vq-note"); if(!el) return; const n=vqGet().filter(j=>!VD.cur||!$("#vd-page")||j.k==="vendor"&&j.v.id===VD.cur||(j.e&&j.e.vendorId===VD.cur)||j.vendorId===VD.cur||(j.k==="rm")).length;
  if(!n){ el.classList.remove("err"); if(vSyncing && vSynced()){ el.hidden=false; el.innerHTML=LD("sm")+" "+esc(t("blSyncing")); } else el.hidden=true; return; }   /* fetching other phones' changes */
  el.hidden=false; el.classList.toggle("err",!!vqErr);
  el.innerHTML = vqErr==="drive_auth" ? esc(t("vDriveAuth")) : navigator.onLine===false ? esc(t("vQueueN",n)) : LD("sm")+" "+esc(t("vSaving",n)); }
setTimeout(()=>{ if(S.canWrite && can("manager")) vSync(); },5000);   // warm the copy so Vendors opens instantly
/* ---- bill check (numbers read by Gemini on the script; the sums are done here and in vCheckCalc_ the same way) ---- */
/* Identical to vCheckCalc_ in Code.gs (the sums for the bill check); keep them the same. */
function vCheckJS(ex, entered) {
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
function vIssueText(i){ const m=v=>vMoney(v), n=v=>fmtN(v);
  switch(i.t){ case "line": return t("vi_line",i.i,i.d||"",n(i.q),m(i.r),m(i.e),m(i.a)); case "sum": return t("vi_sum",m(i.s),m(i.sub)); case "tax": return t("vi_tax",i.n||"GST",n(i.r),m(i.b),m(i.e),m(i.a));
    case "cs": return t("vi_cs",m(i.c),m(i.s)); case "total": return t("vi_total",m(i.e),m(i.tot)); case "entry": return t("vi_entry",m(i.ent),m(i.tot)); case "prev": return t("vi_prev",m(i.ent),m(i.prev),m(i.tot)); default: return ""; } }
/** "Checked: 12 lines · total · GST · your amount" — what the check could actually verify on this bill. */
function vDoneText(c){ if(!c) return ""; const d=c.done&&c.done.length ? t("vDoneL")+" "+c.done.map(d=>d==="lines"?t("vd_lines",c.lines||0):t("vd_"+d)).join(" · ") : "";
  const n=(c.notes||[]).map(x=>x.t==="gst"?t("vNoteGst",vMoney(x.a),fmtN(x.p)):"").filter(Boolean).join(" ");   /* GST not read: the gap looks like GST, so it's explained, not flagged */
  return [d,n].filter(Boolean).join(". "); }
/** GST to fill in from a reading: the total-tax figure, or whichever reading of the tax lines makes the bill add up. */
function vGstOf(ex){ if(!ex) return 0; const r2=v=>Math.round(v*100)/100, T=r2((ex.taxes||[]).reduce((a,x)=>a+(+x.a||0),0)), c=(ex.taxes||[]).some(x=>/cgst/i.test(x.n)), sg=(ex.taxes||[]).some(x=>/sgst|utgst/i.test(x.n));
  const b=(ex.sub!=null?ex.sub:0)-(ex.disc||0), rest=(ex.charges||[]).reduce((a,x)=>a+(+x.a||0),0)+(ex.tcs||0)+(ex.ro||0);
  const cands=[ex.tt, T, c!==sg?r2(T*2):null, T?r2(T/2):null].filter(v=>v!=null&&v>0);
  if(ex.sub!=null && ex.total!=null){ const hit=cands.find(v=>Math.abs(b+rest+v-ex.total)<=1.01 || Math.abs(b+v-ex.total)<=1.01); if(hit) return hit; }
  return ex.tt!=null ? ex.tt : T; }
const vFlagged=e=>!!(e&&e.type==="bill"&&!e.removed&&e.check&&e.check.st==="issues"&&!e.check.ack);
function vCheckPill(e){ if(!e||e.type!=="bill") return ""; if(e.checking) return `<span class="pill chk wait">${esc(t("vChecking"))}</span>`; const c=e.check; if(!c) return "";
  if(c.st==="issues") return c.ack?`<span class="pill chk ok">✓ ${esc(t("vMarkedOk"))}</span>`:`<span class="pill chk bad">${IC.warn} ${esc(t("vIssuesN",c.issues.length))}</span>`;
  if(c.st==="ok") return `<span class="pill chk ok">✓ ${esc(t("vChecked"))}</span>`; if(c.st==="basic") return `<span class="pill chk ok">✓ ${esc(t("vTotalOk"))}</span>`; return ""; }
/* ---- photos: previews (small, in the sheet) and full files (Drive), cached on the phone ---- */
async function vPreviews(fids){ const out={}, need=[]; for(const f of fids){ if(String(f).startsWith("local:")){ const d=await idb.get("images","vqf:"+f.slice(6)); if(d&&d.preview) out[f]=d.preview; continue; } const c=await idb.get("images","vprev:"+f); if(c) out[f]=c; else need.push(f); }
  if(need.length){ try{ const r=await apiPost0({action:"vPreviews",ids:need}); Object.entries(r.previews||{}).forEach(([f,d])=>{ out[f]=d; idb.set("images","vprev:"+f,d); }); }catch{} } return out; }
async function vFull(f){ if(String(f).startsWith("local:")){ const d=await idb.get("images","vqf:"+f.slice(6)); if(d) return {data:d.data,mime:d.mime}; } const c=await idb.get("images","vfull:"+f); if(c) return c; const r=await apiPost0({action:"vFile",f}); const d={data:r.data,mime:r.mime}; idb.set("images","vfull:"+f,d); return d; }
function vFillThumbs(root){ const els=[...(root||document).querySelectorAll("[data-vthumb]")]; if(!els.length) return; vPreviews([...new Set(els.map(e=>e.dataset.vthumb))]).then(m=>{ els.forEach(e=>{ const d=m[e.dataset.vthumb]; if(d && e.isConnected) e.style.backgroundImage=`url("${d}")`; }); }); }
/** Bill photo: up to 1600 px, good JPEG quality, optional rotate and "make text clearer". PDFs are kept as they are. */
async function vProcess(file,rot,clear){
  if(file.type==="application/pdf" || /\.pdf$/i.test(file.name||"")){ if(file.size>10*1024*1024) throw {code:"too_big"}; const data=await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(String(fr.result).split(",")[1]); fr.onerror=rej; fr.readAsDataURL(file); }); return {data,mime:"application/pdf",preview:"",name:file.name||"bill.pdf"}; }
  const im=await loadImg(file); const src=im._src||im, w0=im.naturalWidth, h0=im.naturalHeight, r=Math.min(1,1600/Math.max(w0,h0)), w=Math.round(w0*r), h=Math.round(h0*r), q=((rot||0)%360+360)%360, sw=q%180?h:w, sh=q%180?w:h;
  const c=document.createElement("canvas"); c.width=sw; c.height=sh; const x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,sw,sh); x.translate(sw/2,sh/2); x.rotate(q*Math.PI/180); x.drawImage(src,-w/2,-h/2,w,h); x.setTransform(1,0,0,1,0,0);
  if(clear){ const d=x.getImageData(0,0,sw,sh), p=d.data; let lo=255, hi=0; for(let i=0;i<p.length;i+=40){ const l=(p[i]*.3+p[i+1]*.59+p[i+2]*.11); if(l<lo) lo=l; if(l>hi) hi=l; } lo=Math.min(lo+12,120); hi=Math.max(hi-12,150); const k=255/(hi-lo);
    for(let i=0;i<p.length;i+=4){ const l=(p[i]*.3+p[i+1]*.59+p[i+2]*.11); let v=(l-lo)*k; v=v<0?0:v>255?255:v; v=v>200?255:v; p[i]=p[i+1]=p[i+2]=v; } x.putImageData(d,0,0); }
  let qual=0.85, url=c.toDataURL("image/jpeg",qual); while(url.length>900000 && qual>0.55){ qual-=0.08; url=c.toDataURL("image/jpeg",qual); }
  const pc=document.createElement("canvas"), pr=Math.min(1,360/Math.max(sw,sh)); pc.width=Math.round(sw*pr); pc.height=Math.round(sh*pr); pc.getContext("2d").drawImage(c,0,0,pc.width,pc.height);
  return {data:url.split(",")[1],mime:"image/jpeg",preview:pc.toDataURL("image/jpeg",0.62),name:"bill.jpg"}; }
/* ---- viewer: full screen, pinch-zoom, double-tap, swipe between pages, rotate ---- */
function vViewer(items,first){ // items: [{f,m,preview?,label}]
  let i=first||0, sc=1, tx=0, ty=0, rot=0; const ov=document.createElement("div"); ov.className="vview"; ov.id="vview";
  ov.innerHTML=`<div class="vv-top"><span id="vv-lab"></span><span class="vv-n" id="vv-n"></span><button type="button" id="vv-rot" aria-label="${esc(t("vRotate"))}">⟳</button><button type="button" id="vv-dl" aria-label="${esc(t("vDownload"))}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg></button><button type="button" id="vv-x" aria-label="${esc(t("close"))}">✕</button></div><div class="vv-stage" id="vv-stage"><img id="vv-img" alt=""><div class="vv-pdf" id="vv-pdf" hidden></div><span class="vv-load" id="vv-load"></span></div><button type="button" class="vv-nav prev" id="vv-prev" aria-label="‹">‹</button><button type="button" class="vv-nav next" id="vv-next" aria-label="›">›</button>`;
  document.body.appendChild(ov); const img=ov.querySelector("#vv-img"), stage=ov.querySelector("#vv-stage");
  const apply=()=>{ img.style.transform=`translate(${tx}px,${ty}px) scale(${sc}) rotate(${rot}deg)`; };
  let cur=null;
  const show=async()=>{ const it=items[i]; sc=1; tx=ty=0; rot=0; apply(); ov.querySelector("#vv-lab").textContent=it.label||""; ov.querySelector("#vv-n").textContent=items.length>1?`${i+1}/${items.length}`:"";
    ov.querySelector("#vv-prev").hidden=i<=0; ov.querySelector("#vv-next").hidden=i>=items.length-1; const pdf=ov.querySelector("#vv-pdf"), ld=ov.querySelector("#vv-load");
    cur=null; img.hidden=it.m==="application/pdf"; pdf.hidden=it.m!=="application/pdf"; ld.innerHTML=LD();
    if(it.m!=="application/pdf"){ const p=(await vPreviews([it.f]))[it.f]; if(p && items[i]===it) img.src=p; img.classList.add("blur"); }
    else pdf.innerHTML=`<div>${IC.file}</div><p>${esc(t("vPdfFile"))}</p>`;
    try{ const d=await (it.get?it.get():vFull(it.f)); if(items[i]!==it) return; cur=d; const url=`data:${d.mime};base64,${d.data}`;
      if(d.mime==="application/pdf"){ pdf.innerHTML=`<div>${IC.file}</div><p>${esc(t("vPdfFile"))}</p><button type="button" class="btn primary" id="vv-open">${esc(t("vOpenPdf"))}</button>`; ov.querySelector("#vv-open").onclick=()=>{ const b=b64Blob(d.data,d.mime); window.open(URL.createObjectURL(b),"_blank"); }; }
      else { img.src=url; img.classList.remove("blur"); } ld.innerHTML=""; }
    catch{ ld.innerHTML=`<span class="err">${esc(t("vPhotoFail"))}</span>`; } };
  const close=()=>ov.remove();   // the phone's Back button also closes it (popstate handler)
  ov.querySelector("#vv-x").onclick=close;
  ov.addEventListener("keydown",e=>{ if(e.key==="Escape") close(); }); ov.tabIndex=-1; ov.focus();
  ov.querySelector("#vv-prev").onclick=()=>{ if(i>0){ i--; show(); } }; ov.querySelector("#vv-next").onclick=()=>{ if(i<items.length-1){ i++; show(); } };
  ov.querySelector("#vv-rot").onclick=()=>{ rot=(rot+90)%360; apply(); };
  ov.querySelector("#vv-dl").onclick=()=>{ if(!cur) return; shareFile(b64Blob(cur.data,cur.mime), (items[i].label||"bill").replace(/[^\w-]+/g,"-")+(cur.mime==="application/pdf"?".pdf":".jpg")); };
  // gestures
  const pts=new Map(); let start=null, lastTap=0;
  stage.addEventListener("pointerdown",e=>{ stage.setPointerCapture(e.pointerId); pts.set(e.pointerId,{x:e.clientX,y:e.clientY}); const a=[...pts.values()];
    start = a.length===2 ? {d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y), sc, tx, ty} : {x:e.clientX, y:e.clientY, tx, ty, sc, t:Date.now()}; });
  stage.addEventListener("pointermove",e=>{ if(!pts.has(e.pointerId)||!start) return; pts.set(e.pointerId,{x:e.clientX,y:e.clientY}); const a=[...pts.values()];
    if(a.length===2 && start.d){ sc=Math.max(1,Math.min(5,start.sc*Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)/start.d)); apply(); }
    else if(a.length===1 && start.x!=null){ const dx=e.clientX-start.x, dy=e.clientY-start.y; if(sc>1){ tx=start.tx+dx; ty=start.ty+dy; apply(); } else { tx=dx*.6; apply(); } } });
  const up=e=>{ const s=start; pts.delete(e.pointerId); if(pts.size) { const a=[...pts.values()][0]; start={x:a.x,y:a.y,tx,ty,sc}; return; } start=null;
    if(s && s.x!=null && sc<=1){ const dx=e.clientX-s.x; if(Math.abs(dx)>60){ if(dx<0 && i<items.length-1){ i++; show(); return; } if(dx>0 && i>0){ i--; show(); return; } } tx=0; apply();
      if(Math.abs(dx)<8 && Date.now()-s.t<250){ if(Date.now()-lastTap<300){ sc=2.5; apply(); lastTap=0; } else lastTap=Date.now(); } }
    else if(s && s.x!=null && sc>1 && Math.abs(e.clientX-s.x)<8 && Date.now()-s.t<250){ if(Date.now()-lastTap<300){ sc=1; tx=ty=0; apply(); lastTap=0; } else lastTap=Date.now(); } };
  stage.addEventListener("pointerup",up); stage.addEventListener("pointercancel",up);
  stage.addEventListener("wheel",e=>{ e.preventDefault(); sc=Math.max(1,Math.min(5,sc*(e.deltaY<0?1.15:0.87))); if(sc===1){ tx=ty=0; } apply(); },{passive:false});
  show(); }
function b64Blob(b64,mime){ const bin=atob(b64), u=new Uint8Array(bin.length); for(let k=0;k<bin.length;k++) u[k]=bin.charCodeAt(k); return new Blob([u],{type:mime}); }
/* ---- snackbar with Undo (instead of "are you sure?") ---- */
function vSnack(text,undo){ let el=$("#snack"); if(!el){ el=document.createElement("div"); el.id="snack"; el.className="snack"; document.body.appendChild(el); }
  el.innerHTML=`<span>${esc(text)}</span>${undo?`<button type="button">${esc(t("undo"))}</button>`:""}`; el.classList.add("on"); clearTimeout(el._t);
  if(undo) el.querySelector("button").onclick=async()=>{ el.classList.remove("on"); try{ await undo(); }catch{} };
  el.onclick=e=>{ if(!e.target.closest("button")) el.classList.remove("on"); };   // tap the message to hide it
  el._t=setTimeout(()=>el.classList.remove("on"),5000); }
function vSnackHide(){ const el=$("#snack"); if(el){ clearTimeout(el._t); el.classList.remove("on"); } }
/* ======================= Screens ======================= */
const vAmtCls=v=>v.balance>0?"owe":v.balance<0||v.advance>0?"adv":"ok";
function vBalLabel(v){ if(v.balance>0) return {lab:t("vYouOwe"), amt:vMoney(v.balance)}; if(v.balance<0) return {lab:t("vAdvance"), amt:vMoney(-v.balance)}; return {lab:t("vSettled"), amt:"✓"}; }
function openVendors(){
  if(!can("manager")){ toast(t("vNoAccess")); return; }
  billBackFn=null;
  sheetKey("vendors"), openSheet(t("vTitle"), `<div id="vl-list"><div class="vl-top skel" style="height:96px"></div>${skelCards(4,true)}</div>`, "", {full:true});
  vdbInit().then(()=>{ if(vSynced() || vqGet().length) vRenderList();
    vSync().then(()=>{ const b=$("#vl-list"); if(!b) return; if(vSynced() || vqGet().length) vRenderList(); else b.innerHTML=`<p class="err">${esc(t("billsFail"))}</p>`; }); });
}
function vRenderList(){
  const box=$("#vl-list"); if(!box || !VD.list) return; const all=VD.list.vendors.slice().sort((a,b)=>(b.lastAt||0)-(a.lastAt||0));
  const cnt={all:all.length, owe:all.filter(v=>v.balance>0).length, overdue:all.filter(v=>v.overdue>0).length, settled:all.filter(v=>v.balance<=0).length};
  const q=VD.q.trim().toLowerCase(), list=all.filter(v=>(VD.chip==="all"||(VD.chip==="owe"&&v.balance>0)||(VD.chip==="overdue"&&v.overdue>0)||(VD.chip==="settled"&&v.balance<=0)) && (!q||v.name.toLowerCase().includes(q)||String(v.mobile).includes(q)));
  box.innerHTML=`<div class="vl-top"><div><small>${esc(t("vTotalOwe"))}</small><b class="num">${vMoney(VD.list.owe)}</b><span>${esc(t("vVendorsN",all.length))}${cnt.overdue?` · <em>${esc(t("vOverdueN",cnt.overdue))}</em>`:""}</span></div></div>
    <div class="vl-acts"><button type="button" class="btn primary" id="vl-bill">+ ${esc(t("vBill"))}</button><button type="button" class="btn ghost" id="vl-pay">+ ${esc(t("vPayment"))}</button><button type="button" class="btn ghost" id="vl-new">+ ${esc(t("vVendor"))}</button></div>
    <div class="vq-note" id="vq-note" hidden></div>
    ${all.length>4||q?`<input type="search" id="vl-q" placeholder="${esc(t("vSearchPh"))}" value="${esc(VD.q)}" autocomplete="off">`:""}
    ${all.length?`<div class="fchips vl-chips">${["all","owe","overdue","settled"].filter(k=>k==="all"||cnt[k]).map(k=>`<button type="button" class="fchip" data-vchip="${k}" aria-pressed="${VD.chip===k}">${esc(t("vc_"+k))}${k!=="all"?`<span class="n">${cnt[k]}</span>`:""}</button>`).join("")}</div>`:""}
    <div class="vl-cards">${list.map(v=>{ const b=vBalLabel(v); return `<button type="button" class="vcard" data-vid="${esc(v.id)}"><span class="vc-av">${esc((v.name||"?").charAt(0).toUpperCase())}</span><span class="vc-mid"><b>${esc(v.name)}</b><small>${v.openBills?esc(t("vOpenBillsN",v.openBills))+(v.oldest?` · ${esc(t("vOldestD",vDays(v.oldest)))}`:""):esc(t("vNoOpen"))}${v.overdue?` <span class="pill due">${esc(t("vOverdueN",v.overdue))}</span>`:""}${v.flagged?` <span class="pill chk bad">${IC.warn} ${v.flagged}</span>`:""}</small></span><span class="vc-amt ${vAmtCls(v)}"><small>${esc(b.lab)}</small><b class="num">${b.amt}</b></span></button>`; }).join("")
      || `<div class="empty" style="padding:24px 8px"><h2>${esc(t(all.length?"vNoMatch":"vEmptyT"))}</h2>${all.length?"":`<p>${esc(t("vEmptyD"))}</p>`}</div>`}</div>
    ${S.cfg.mode==="test" && can("owner") && all.length ? `<button type="button" class="vmove-link" id="vl-move"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>${esc(t("vmLink"))}</button>`:""}`;
  { const mv=$("#vl-move"); if(mv) mv.onclick=vMoveUI; }
  $("#vl-bill").onclick=()=>vForm("bill",null); $("#vl-pay").onclick=()=>vForm("pay",null); $("#vl-new").onclick=()=>vVendorForm(null);
  const qi=$("#vl-q"); if(qi) qi.oninput=e=>{ VD.q=e.target.value; const pos=e.target.selectionStart; vRenderList(); const n=$("#vl-q"); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch{} } };
  box.querySelectorAll("[data-vchip]").forEach(b=>b.onclick=()=>{ VD.chip=b.dataset.vchip; vRenderList(); });
  box.querySelectorAll("[data-vid]").forEach(b=>b.onclick=()=>openVendor(b.dataset.vid)); vNoteUpd();
}
/* Owner, test mode: move vendors made here by mistake to real mode, with everything they have (server vToLive). */
function vMoveUI(){ if(!can("owner") || S.cfg.mode!=="test" || !VD.list) return;
  const vs=VD.list.vendors.slice().sort((a,b)=>a.name.localeCompare(b.name)), ents=(VDB.srv.entries||[]);
  const cnt=id=>ents.filter(e=>e.vendorId===id && !e.removed).length;
  sheetKey("vmove"), openSheet(t("vmT"), `<div id="vm-page"><button type="button" class="btn ghost bl-back" id="vm-back">← ${esc(t("vTitle"))}</button>
    <div class="vm-warn"><b>${esc(t("vmWarnT"))}</b><p>${esc(t("vmWarnD"))}</p><p>${esc(t("vmWarnLink"))}</p></div>
    <label class="vm-all"><input type="checkbox" id="vm-all" checked> ${esc(t("vmAll",vs.length))}</label>
    <div class="vm-list">${vs.map(v=>`<label class="vm-row"><input type="checkbox" data-vm="${esc(v.id)}" checked><span class="vm-n"><b>${esc(v.name)}</b><small>${esc(t("vmCount",cnt(v.id)))}</small></span><span class="vm-b num">${esc(vBalLabel(v).lab)} ${esc(vBalLabel(v).amt)}</span></label>`).join("")}</div>
    <div class="err" id="vm-err" role="alert"></div></div>`,
    `<button type="button" class="btn ghost" id="vm-cancel">${esc(t("cancel"))}</button><button type="button" class="btn danger" id="vm-go"></button>`, {full:true});
  const picked=()=>[...document.querySelectorAll("#vm-page [data-vm]")].filter(c=>c.checked).map(c=>c.dataset.vm);
  const sync=()=>{ const n=picked().length; $("#vm-go").textContent=t("vmGo",n); $("#vm-go").disabled=!n; $("#vm-all").checked=n===vs.length; };
  $("#vm-back").onclick=()=>openVendors(); $("#vm-cancel").onclick=()=>openVendors();
  $("#vm-all").onchange=e=>{ document.querySelectorAll("#vm-page [data-vm]").forEach(c=>c.checked=e.target.checked); sync(); };
  document.querySelectorAll("#vm-page [data-vm]").forEach(c=>c.onchange=sync); sync();
  $("#vm-go").onclick=async()=>{ const ids=picked(); if(!ids.length) return; const err=$("#vm-err"); err.textContent="";
    if(vqGet().length){ vqFlush(); err.textContent=t("vmWait"); return; }   // changes still being sent would land in test mode
    if(navigator.onLine===false){ err.textContent=t("siNet"); return; }
    if(!confirm(t("vmConfirm",ids.length))) return;
    const b=$("#vm-go"); btnBusy(b,true);
    try{ const r=await apiPost({action:"vToLive",ids});
      await vSync(true);
      openSheet(t("vmT"), `<div id="vm-page"><button type="button" class="btn ghost bl-back" id="vm-back">← ${esc(t("vTitle"))}</button>
        <div class="vm-done"><b>✓ ${esc(t("vmDone",r.moved))}</b><p>${esc((r.names||[]).join(", "))}</p><p>${esc(t("vmDoneD",r.entries||0,r.photos||0,r.purchases||0))}</p>
        ${r.fileFail?`<p class="note">${esc(t("vmFileFail",r.fileFail))}</p>`:""}${(r.skipped||[]).length?`<p class="err">${esc(t("vmSkipped",r.skipped.join(", ")))}</p>`:""}
        <p>${esc(t("vmSee"))}</p></div></div>`,
        `<button type="button" class="btn ghost" id="vm-close">${esc(t("vTitle"))}</button><button type="button" class="btn primary" id="vm-set">${esc(t("vmOpenSet"))}</button>`, {full:true});
      $("#vm-back").onclick=$("#vm-close").onclick=()=>openVendors(); $("#vm-set").onclick=()=>{ closeSheet(); openSettings(); };
    }catch(e){ btnBusy(b,false); err.textContent = e&&e.code==="bad_action" ? t("vmOldScript") : errMsg(e); } };
}
function openVendor(id){ VD.cur=id; VD.tab=VD.tab||"ledger";
  const name=(VD.det[id]&&VD.det[id].vendor.name) || ((VD.list&&VD.list.vendors.find(v=>v.id===id))||{}).name || "";
  sheetKey("vendor:"+id), openSheet(name||t("vTitle"), `<div id="vd-page"><button type="button" class="btn ghost bl-back" id="vd-back">← ${esc(t("vTitle"))}</button><div id="vd-body">${VD.det[id]?"":`<div class="vl-top skel" style="height:140px"></div>${skelCards(4,true)}`}</div></div>`, "", {full:true});
  $("#vd-back").onclick=()=>openVendors();
  vdbInit().then(()=>{ if(VD.det[id]) vRenderVendor(id); vSync(); });
}
/** Ledger rows with the running balance (oldest → newest), shown newest first. */
function vLedger(D){ let bal=0; const rows=[]; const v=D.vendor;
  if(v.opening) { bal=v.opening; rows.push({opening:true, date:v.openingDate, amount:v.opening, bal}); }
  D.entries.filter(e=>!e.removed).forEach(e=>{ bal=Math.round((bal+(e.type==="bill"?e.amount:-e.amount))*100)/100; rows.push({e, date:e.date, bal}); });
  return rows.reverse(); }
function vEntryTitle(e){ if(e.type==="bill") return t("vBill")+(e.billNo?" "+e.billNo:""); if(e.type==="pay") return t("vPaid")+(e.mode?" · "+t("vm_"+e.mode.toLowerCase()):""); return t("vReturn"); }
function vStatusPill(b){ if(!b) return ""; if(b.status==="paid") return `<span class="pill paid">${esc(t("vsPaid"))}</span>`; const o=b.overdue?` <span class="pill due">${esc(t("vsOverdue"))}</span>`:"";
  return `<span class="pill ${b.status==="part"?"part":"open"}">${esc(t(b.status==="part"?"vsPart":"vsOpen"))}</span>${o}`; }
function vRenderVendor(id,keepScroll){ const D=VD.det[id], body=$("#vd-body"); if(!D||!body) return; const v=D.vendor, c=D.calc, sc=$("#sheet-body"), st=sc?sc.scrollTop:0;
  $("#sheet-title").textContent=v.name; const b=vBalLabel({balance:c.balance,advance:c.advance});
  const billMap={}; c.bills.forEach(x=>billMap[x.id]=x);
  const led=vLedger(D);
  const ledHTML=led.map(r=>{ if(r.opening) return `<div class="vrow op"><span class="vr-ic">⊙</span><span class="vr-mid"><b>${esc(t("vOpening"))}</b><small>${esc(vDate(r.date))}</small></span><span class="vr-amt"><b class="num ${r.amount>0?"plus":"minus"}">${r.amount>0?"+":"−"}${vMoney(Math.abs(r.amount))}</b><small class="num">${esc(t("vBal"))} ${vMoney(r.bal)}</small></span></div>`;
      const e=r.e, bl=billMap[e.id];
      return `<button type="button" class="vrow ${e.type}" data-eid="${esc(e.id)}"><span class="vr-ic">${e.type==="bill"?IC.receipt:e.type==="pay"?"₹":"↩"}</span><span class="vr-mid"><b>${esc(vEntryTitle(e))}</b><small>${esc(vDate(e.date))}${e.ref?` · ${esc(e.ref)}`:""}${e.photos&&e.photos.length?` · ${IC.clip}${e.photos.length}`:""}${e.noteP?" · "+IC.lock:""}${e.pending?` · <span class="vpend">${esc(t("vSending"))}</span>`:""}</small>${bl?`<span class="vr-st">${vStatusPill(bl)}${vCheckPill(e)}${bl.status!=="paid"&&bl.status!=="open"?` <small>${esc(t("vDueAmt",vMoney(bl.due)))}</small>`:""}</span>`:""}${e.noteV?`<small class="vr-note">${esc(e.noteV)}</small>`:""}</span><span class="vr-amt"><b class="num ${e.type==="bill"?"plus":"minus"}">${e.type==="bill"?"+":"−"}${vMoney(e.amount)}</b><small class="num">${esc(t("vBal"))} ${vMoney(r.bal)}</small></span></button>`; }).join("");
  const flagN=D.entries.filter(vFlagged).length; if(VD.bf==="flag" && !flagN) VD.bf="open";
  const bills=c.bills.slice().reverse().filter(x=>VD.bf==="all"||(VD.bf==="open"&&x.due>0)||(VD.bf==="paid"&&x.due<=0)||(VD.bf==="flag"&&vFlagged(D.entries.find(y=>y.id===x.id))));
  const billsHTML=bills.map(x=>{ const e=D.entries.find(y=>y.id===x.id);
    return `<button type="button" class="vrow bill" ${x.opening?"data-opening":`data-eid="${esc(x.id)}"`}><span class="vr-ic">${x.opening?"⊙":IC.receipt}</span><span class="vr-mid"><b>${esc(x.opening?t("vOpening"):(t("vBill")+(x.billNo?" "+x.billNo:"")))}</b><small>${esc(vDate(x.date))}${x.dueDate&&x.due>0?` · ${esc(x.overdue?t("vOverdueBy",vDays(x.dueDate)):t("vDueOn",vDate(x.dueDate)))}`:""}${e&&e.photos&&e.photos.length?` · ${IC.clip}${e.photos.length}`:""}</small><span class="vr-st">${vStatusPill(x)}${vCheckPill(e)}</span></span><span class="vr-amt"><b class="num">${vMoney(x.amount)}</b>${x.due>0&&x.due<x.amount?`<small class="num">${esc(t("vDueAmt",vMoney(x.due)))}</small>`:""}</span></button>`; }).join("");
  const openN=c.bills.filter(x=>x.due>0).length;
  body.innerHTML=`<div class="vd-card ${vAmtCls({balance:c.balance,advance:c.advance})}"><small>${esc(b.lab)}</small><b class="num">${b.amt}</b>
      <span class="vd-sub">${c.advance>0&&c.balance>0?`${esc(t("vAdvanceAvail",vMoney(c.advance)))} · `:""}${v.creditDays?esc(t("vCreditDays",v.creditDays)):""}${c.overdue?` · <em>${esc(t("vOverdueN",c.overdue))}</em>`:""}</span>
      <span class="vd-tools">${v.mobile?`<a class="iconbtn" href="${esc(telHref(v.mobile))}" aria-label="${esc(t("call"))}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg></a>`:""}
        <button type="button" class="iconbtn" id="vd-share" aria-label="${esc(t("vShare"))}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg></button>
        <button type="button" class="iconbtn" id="vd-edit" aria-label="${esc(t("vEditVendor"))}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg></button></span></div>
    <div class="vd-acts"><button type="button" class="btn primary" id="vd-bill">+ ${esc(t("vBill"))}</button><button type="button" class="btn ghost" id="vd-pay">+ ${esc(t("vPayment"))}</button><button type="button" class="btn ghost" id="vd-adj">${esc(t("vReturnShort"))}</button></div>
    <div class="vq-note" id="vq-note" hidden></div>
    ${flagN&&VD.tab!=="bills"?`<button type="button" class="vflagbar" id="vd-flags">${IC.warn} ${esc(t("vFlagBar",flagN))}</button>`:""}
    <div class="seg vd-tabs" role="tablist"><button type="button" data-vtab="ledger" aria-pressed="${VD.tab!=="bills"}">${esc(t("vLedger"))}</button><button type="button" data-vtab="bills" aria-pressed="${VD.tab==="bills"}">${esc(t("vBills"))}${openN?` · ${openN} ${esc(t("vsOpen").toLowerCase())}`:""}</button></div>
    ${VD.tab==="bills"?`<div class="fchips vd-bf">${["open","paid","all",...(flagN?["flag"]:[])].map(k=>`<button type="button" class="fchip" data-vbf="${k}" aria-pressed="${VD.bf===k}">${k==="flag"?IC.warn+" ":""}${esc(t("vbf_"+k))}${k==="flag"?`<span class="n">${flagN}</span>`:""}</button>`).join("")}</div><div class="vrows">${billsHTML||`<p class="note">${esc(t("vNoBills"))}</p>`}</div>`
      :`<div class="vrows">${ledHTML||`<div class="empty" style="padding:20px 8px"><p>${esc(t("vLedgerEmpty"))}</p></div>`}</div>`}`;
  $("#vd-bill").onclick=()=>vForm("bill",id); $("#vd-pay").onclick=()=>vForm("pay",id); $("#vd-adj").onclick=()=>vForm("adj",id);
  $("#vd-edit").onclick=()=>vVendorForm(id); $("#vd-share").onclick=()=>vShareSheet(id);
  if($("#vd-flags")) $("#vd-flags").onclick=()=>{ VD.tab="bills"; VD.bf="flag"; vRenderVendor(id); };
  body.querySelectorAll("[data-vtab]").forEach(x=>x.onclick=()=>{ VD.tab=x.dataset.vtab; vRenderVendor(id); });
  body.querySelectorAll("[data-vbf]").forEach(x=>x.onclick=()=>{ VD.bf=x.dataset.vbf; vRenderVendor(id,true); });
  body.querySelectorAll("[data-eid]").forEach(x=>x.onclick=()=>vEntry(id,x.dataset.eid));
  body.querySelectorAll("[data-opening]").forEach(x=>x.onclick=()=>vEntry(id,"open:"+id));
  if(keepScroll && sc) sc.scrollTop=st; vNoteUpd();
}
/* ---- vendor add / edit ---- */
function vVendorForm(id,after){ const v=id&&VD.det[id]?VD.det[id].vendor:{name:"",mobile:"",gstin:"",address:"",creditDays:"",opening:"",openingDate:vToday(),note:""};
  const back=id?()=>openVendor(id):()=>openVendors();
  openSheet(id?t("vEditVendor"):t("vNewVendor"), `<form class="form" id="vf" novalidate><button type="button" class="btn ghost bl-back" id="vf-back">← ${esc(t("back"))}</button>
    <div class="field"><label for="vf-name">${esc(t("vName"))}</label><input id="vf-name" value="${esc(v.name)}" autocomplete="off" maxlength="80"></div>
    <div class="two"><div class="field"><label for="vf-mob">${esc(t("mobL"))}</label><input id="vf-mob" inputmode="tel" value="${esc(v.mobile)}" maxlength="20" autocomplete="off"></div>
      <div class="field"><label for="vf-cd">${esc(t("vCreditL"))}</label><input id="vf-cd" class="num" inputmode="numeric" value="${esc(v.creditDays||"")}" placeholder="30"></div></div>
    <div class="field"><label for="vf-gst">${esc(t("vGstinL"))}</label><input id="vf-gst" value="${esc(v.gstin)}" maxlength="15" style="text-transform:uppercase" autocomplete="off"></div>
    <div class="two"><div class="field"><label for="vf-op">${esc(t("vOpeningL"))}</label><input id="vf-op" class="num money" data-neg inputmode="decimal" value="${esc(v.opening?moneyText(String(v.opening),true):"")}" placeholder="0"></div>
      <div class="field"><label for="vf-opd">${esc(t("vOpeningDate"))}</label><input id="vf-opd" type="date" value="${esc(v.openingDate||vToday())}"></div></div>
    <p class="note" style="margin:0">${esc(t("vOpeningD"))}</p>
    <div class="field"><label for="vf-addr">${esc(t("vAddress"))}</label><input id="vf-addr" value="${esc(v.address)}" maxlength="200" autocomplete="off"></div>
    <div class="err" id="vf-err" role="alert"></div></form>`, `<button class="btn ghost" id="vf-cancel">${esc(t("cancel"))}</button><button class="btn primary" id="vf-save">${esc(t("save"))}</button>`, {full:true});
  $("#vf-back").onclick=back; $("#vf-cancel").onclick=back; if(!id) setTimeout(()=>$("#vf-name")&&$("#vf-name").focus(),250);
  $("#vf-save").onclick=async()=>{ const name=$("#vf-name").value.trim(); if(!name){ $("#vf-err").textContent=t("needName"); return; } const mv=$("#vf-mob").value.trim(); if(mv && normMobile(mv)===null){ $("#vf-err").textContent=t("mobBad"); $("#vf-mob").focus(); return; }
    const op=toNum($("#vf-op").value||"0"); if(isNaN(op)){ $("#vf-err").textContent=t("needRate"); return; }
    if((VD.list?VD.list.vendors:[]).some(x=>x.id!==id && x.name.toLowerCase()===name.toLowerCase())){ $("#vf-err").textContent=t("vDup"); return; }
    const vid=id||vId("v"), cd=Math.max(0,Math.min(365,Math.floor(toNum($("#vf-cd").value||"0"))||0));
    vqAdd({k:"vendor", v:{id:vid,name,mobile:mob10($("#vf-mob").value)||$("#vf-mob").value.trim(),gstin:$("#vf-gst").value.trim().toUpperCase(),creditDays:cd,opening:op||0,openingDate:$("#vf-opd").value||vToday(),address:$("#vf-addr").value.trim()}});
    toast(t("saved")); if(after) after(vid); else openVendor(vid); };
}
/* ---- + Bill / + Payment / Return ---- */
function vVendorPick(sel,onPick){ // typeahead over vendors, recent first; "Add new" inline
  const all=(VD.list?VD.list.vendors:[]).slice().sort((a,b)=>(b.lastAt||0)-(a.lastAt||0));
  const draw=q=>{ const k=q.trim().toLowerCase(); const m=all.filter(v=>!k||v.name.toLowerCase().includes(k)).slice(0,8);
    $("#vp-list").innerHTML=m.map(v=>`<button type="button" class="vp-it" data-pv="${esc(v.id)}"><b>${esc(v.name)}</b>${v.balance>0?`<small class="num">${esc(t("vYouOwe"))} ${vMoney(v.balance)}</small>`:""}</button>`).join("")+(k&&!all.some(v=>v.name.toLowerCase()===k)?`<button type="button" class="vp-it new" data-pnew>+ ${esc(t("vAddNamed",q.trim()))}</button>`:""); };
  sel.innerHTML=`<label for="vp-q">${esc(t("vVendor"))}</label><input id="vp-q" type="search" autocomplete="off" placeholder="${esc(t("vPickPh"))}"><div class="vp-list" id="vp-list"></div>`;
  draw(""); $("#vp-q").oninput=e=>draw(e.target.value);
  $("#vp-list").onclick=e=>{ const p=e.target.closest("[data-pv]"); if(p){ onPick(p.dataset.pv); return; } if(e.target.closest("[data-pnew]")){ const name=$("#vp-q").value.trim();
      const vid=vId("v"); vqAdd({k:"vendor", v:{id:vid,name,mobile:"",gstin:"",creditDays:0,opening:0,openingDate:vToday(),address:""}}); onPick(vid); } };
}
function vForm(type,vendorId,edit,opts){ opts=opts||{};
  const D=vendorId?VD.det[vendorId]:null;
  if(vendorId && !D){ if(!VDB.loaded) vdbInit().then(()=>{ if(VD.det[vendorId]) vForm(type,vendorId,edit,opts); }); return; }
  const back=()=>{ if(edit) vEntry(vendorId,edit.id); else if(vendorId) openVendor(vendorId); else openVendors(); };
  const title=t(edit?(type==="bill"?"vEditBill":type==="pay"?"vEditPay":"vEditReturn"):(type==="bill"?"vNewBill":type==="pay"?"vNewPay":"vNewReturn"));
  const e=edit||{};
  let photos=(e.photos||[]).map(p=>({...p, keep:true}));      // {f,m} saved | {file, rot, proc, preview}
  let clear=false;
  const body=`<form class="form vform" id="vff" novalidate><button type="button" class="btn ghost bl-back" id="vff-back">← ${esc(t("back"))}</button>
    ${vendorId?`<div class="vff-vendor">${esc(D.vendor.name)}${D.calc.balance>0?` · <span class="num">${esc(t("vYouOwe"))} ${vMoney(D.calc.balance)}</span>`:""}</div>`:`<div class="field" id="vff-pick"></div>`}
    <div id="vff-main" ${vendorId?"":"hidden"}>
    ${type==="bill"?`<div class="field"><label>${esc(t("vPhotos"))}</label><div class="vph" id="vff-ph"></div>
        <div class="row-btns" style="justify-content:flex-start" id="vff-phb"><label class="btn ghost" for="vff-cam">${IC.cam} ${esc(t("takePhoto"))}</label><label class="btn ghost" for="vff-gal">${esc(t("vGalleryPdf"))}</label></div>
        <div class="vread" id="vff-read" hidden></div>
        <label class="switch sm" id="vff-clrw" hidden><span>${esc(t("vClearText"))}</span><input type="checkbox" id="vff-clr"></label>
        <input type="file" id="vff-cam" class="vh" accept="image/*" capture="environment" tabindex="-1"><input type="file" id="vff-gal" class="vh" accept="image/*,application/pdf" multiple tabindex="-1"></div>`:""}
    <div class="field"><label for="vff-amt">${esc(t(type==="bill"?"vBillAmt":type==="pay"?"vPayAmt":"vRetAmt"))}</label><input id="vff-amt" class="num big money" inputmode="decimal" value="${e.amount!=null?esc(moneyText(String(e.amount))):""}" placeholder="₹ 0" autocomplete="off"></div>
    ${type==="pay"?`<div class="field"><label>${esc(t("vHowPaid"))}</label><div class="seg" id="vff-mode">${VMODES.map(m=>`<button type="button" data-mode="${m}" aria-pressed="${(e.mode||"Cash")===m}">${esc(t("vm_"+m.toLowerCase()))}</button>`).join("")}</div></div>
      <div class="field" id="vff-refw"><label for="vff-ref" id="vff-refl"></label><input id="vff-ref" value="${esc(e.ref||"")}" maxlength="60" autocomplete="off"></div>`:""}
    ${type!=="bill"?`<div class="field"><label>${esc(t("vWhichBills"))}</label><div class="vbills" id="vff-bills"></div><p class="vprev" id="vff-prev"></p><div id="vff-extra"></div></div>`:""}
    <div class="two">${type==="bill"?`<div class="field"><label for="vff-no">${esc(t("vBillNo"))}</label><input id="vff-no" value="${esc(e.billNo||"")}" maxlength="40" autocomplete="off"></div>`:""}
      <div class="field"><label for="vff-date">${esc(t("vDateL"))}</label><input id="vff-date" type="date" value="${esc(e.date||vToday())}" max="${vToday()}"></div></div>
    ${type==="bill"?`<div class="field"><label for="vff-gst">${esc(t("vGstPart"))}</label><input id="vff-gst" class="num money" inputmode="decimal" value="${e.gst!=null&&e.gst!==""?esc(moneyText(String(e.gst))):""}" placeholder="${esc(t("optional"))}"></div>`:""}
    <div id="vff-adv"></div>
    <div class="field"><label for="vff-nv">${esc(t("vNoteV"))}</label><textarea id="vff-nv" rows="2" maxlength="500" placeholder="${esc(t("vNoteVPh"))}">${esc(e.noteV||"")}</textarea></div>
    <div class="field"><label for="vff-np">${IC.lock} ${esc(t("vNoteP"))}</label><textarea id="vff-np" rows="2" maxlength="500" placeholder="${esc(t("vNotePPh"))}">${esc(e.noteP||"")}</textarea></div>
    <div class="err" id="vff-err" role="alert"></div></div></form>`;
  openSheet(title, body, `<button class="btn ghost" id="vff-cancel">${esc(t("cancel"))}</button><button class="btn primary" id="vff-save">${esc(t("save"))}</button>`, {full:true});
  $("#vff-back").onclick=back; $("#vff-cancel").onclick=back;
  let V=vendorId;
  if(!vendorId){ vdbInit().then(()=>{ if($("#vff-pick")) vVendorPick($("#vff-pick"),pick); }); }
  function pick(id){ vForm(type,id,null,opts); }
  if(!vendorId) return;
  const amtI=$("#vff-amt");
  // ---- photos (bill)
  const drawPh=()=>{ const box=$("#vff-ph"); if(!box) return;
    box.innerHTML=photos.map((p,i)=>`<div class="vph-t" data-pi="${i}">${p.m==="application/pdf"||(p.file&&/pdf/.test(p.file.type))?`<span class="vph-pdf">PDF</span>`:p.preview?`<img src="${esc(p.preview)}" alt="">`:p.f?`<span class="vph-img" data-vthumb="${esc(p.f)}"></span>`:`<span class="ld sm"></span>`}
      <button type="button" class="vph-x" data-px="${i}" aria-label="${esc(t("removePhoto"))}">✕</button>${p.file&&!/pdf/.test(p.file.type)?`<button type="button" class="vph-r" data-pr="${i}" aria-label="${esc(t("vRotate"))}">⟳</button>`:""}</div>`).join("");
    vFillThumbs(box); $("#vff-phb").hidden=photos.length>=6; $("#vff-clrw").hidden=!photos.some(p=>p.file&&!/pdf/.test(p.file.type)); };
  const proc=async p=>{ p.proc=null; p.preview=null; if(p.file) p.f=null; drawPh(); try{ p.proc=await vProcess(p.file,p.rot,clear); p.preview=p.proc.preview; }catch(err){ toast(err&&err.code==="too_big"?t("vTooBig"):t("imgFail")); photos=photos.filter(x=>x!==p); } drawPh(); readSoon(); };
  /* ---- read the bill (Gemini, on the script) as soon as photos are ready: fill empty fields, show the check ---- */
  let ex=null, readSeq=0, readState="", readTimer=0; const touched=new Set(); const filled=new Set();
  const panel=()=>{ const el=$("#vff-read"); if(!el) return; if(!readState){ el.hidden=true; return; } el.hidden=false;
    if(readState==="reading"){ el.className="vread"; el.innerHTML=`${LD("sm")} <span>${esc(t("vReading"))}</span>`; return; }
    if(readState==="later"){ el.className="vread"; el.innerHTML=`<span>${esc(t("vReadLater"))}</span>`; return; }
    if(readState==="unread"){ el.className="vread muted"; el.innerHTML=`<span>${esc(t("vUnread"))}</span><div class="vread-acts sm">${filled.size?`<button type="button" class="btn ghost" id="vff-undofill">↶ ${esc(t("vUndoFill"))}</button>`:""}<button type="button" class="btn ghost" id="vff-reread">${esc(t("vReadAgain"))}</button></div>`; const u=$("#vff-undofill"); if(u) u.onclick=undoFill; $("#vff-reread").onclick=()=>{ ex=null; readNow(); }; return; }
    const c=vCheckJS(ex,toNum(amtI.value)); el.className="vread "+(c.st==="ok"||c.st==="basic"?"ok":c.st==="issues"?"bad":"muted");
    const acts=`<div class="vread-acts sm">${filled.size?`<button type="button" class="btn ghost" id="vff-undofill">↶ ${esc(t("vUndoFill"))}</button>`:""}<button type="button" class="btn ghost" id="vff-reread">${esc(t("vReadAgain"))}</button></div>`;
    const done=vDoneText(c);
    el.innerHTML = (c.st==="ok" ? `<b>✓ ${esc(t("vAddsUp"))}</b>` : c.st==="basic" ? `<b>✓ ${esc(t("vBasicOk"))}</b>` : c.st==="issues" ? `<b>${IC.warn} ${esc(t("vIssuesN",c.issues.length))}</b><ul>${c.issues.map(i=>`<li>${esc(vIssueText(i))}</li>`).join("")}</ul>` : `<span>${esc(t("vUnread"))}</span>`)
      + (done?`<small>${esc(done)}</small>`:"") + (filled.size?`<small>${esc(t("vFilledFrom"))}</small>`:"")
      + (ex.model&&/lite/i.test(ex.model)&&!(ex.lines||[]).length?`<small>${esc(t("vLiteNoLines"))}</small>`:"")
      + ((ex.lines||[]).length?`<details class="vl-wrap"${c.st==="issues"?" open":""}><summary>${esc(t("vSeeLines",ex.lines.length))}</summary>${vLinesHTML(ex,c)}</details>`:"") + acts;
    const u=$("#vff-undofill"); if(u) u.onclick=undoFill; $("#vff-reread").onclick=()=>{ ex=null; readNow(); }; };
  const orig={};   // values before the bill reading filled them, so "Undo" puts them back
  const undoFill=()=>{ filled.forEach(id=>{ const el=$(id); if(el){ el.value=orig[id]!=null?orig[id]:""; el.classList.remove("autofill"); touched.add(id); } }); filled.clear(); toast(t("vUndoneFill")); panel(); };
  const fill=()=>{ if(!ex||!ex.readable) return; const set=(id,val)=>{ const el=$(id); if(!el||val==null||val==="") return; if(touched.has(id)) return; if(id==="#vff-date"? (el.value&&el.value!==vToday()&&!filled.has(id)) : (el.value.trim()&&!filled.has(id))) return; if(!filled.has(id)) orig[id]=el.value; if(el.classList.contains("money")) moneySet(el,val); else el.value=String(val); el.classList.add("autofill"); filled.add(id); };
    set("#vff-amt",ex.total); set("#vff-no",ex.billNo); if(ex.date && ex.date<=vToday()) set("#vff-date",ex.date); const tx=vGstOf(ex); if(tx>0) set("#vff-gst",Math.round(tx*100)/100); };
  const readNow=async()=>{ const my=++readSeq; const ready=photos.filter(p=>p.f||p.proc); if(!ready.length||photos.some(p=>p.file&&!p.proc)){ if(!photos.length){ ex=null; readState=""; panel(); } return; }
    if(!S.cfg.aiOn || navigator.onLine===false){ readState=S.cfg.aiOn?"later":""; panel(); return; }
    readState="reading"; panel();
    try{ for(const p of photos){ if(!p.f && p.proc){ const u=await apiPost0({action:"vUpload",vendorId,data:p.proc.data,mime:p.proc.mime,preview:p.proc.preview,name:p.proc.name}); p.f=u.f; p.m=u.m; if(p.proc.preview) idb.set("images","vprev:"+u.f,p.proc.preview); idb.set("images","vfull:"+u.f,{data:p.proc.data,mime:p.proc.mime}); } if(my!==readSeq) return; }
      const r=await apiPost0({action:"vRead",files:photos.filter(p=>p.f).map(p=>p.f)}); if(my!==readSeq||!$("#vff-read")) return;
      ex=r.ex; if(!ex||!ex.readable||ex.confidence<0.6){ readState="unread"; ex=ex&&ex.readable?ex:null; } else { readState="done"; fill(); } panel(); }
    catch(e){ if(my!==readSeq) return; ex=null; readState=e&&e.code==="ai_off"?"":"later"; panel(); } };
  const readSoon=()=>{ clearTimeout(readTimer); readTimer=setTimeout(readNow,400); };
  if(type==="bill"){
    drawPh();
    const onFiles=e=>{ const fs=[...(e.target.files||[])].slice(0,6-photos.length); e.target.value=""; fs.forEach(f=>{ const p={file:f,rot:0}; photos.push(p); proc(p); }); };
    $("#vff-cam").onchange=onFiles; $("#vff-gal").onchange=onFiles;
    ["#vff-amt","#vff-no","#vff-date","#vff-gst"].forEach(id=>{ const el=$(id); if(el) el.addEventListener("input",()=>{ touched.add(id); el.classList.remove("autofill"); if(id==="#vff-amt") panel(); }); });
    $("#vff-ph").onclick=ev=>{ const x=ev.target.closest("[data-px]"); if(x){ photos.splice(+x.dataset.px,1); drawPh(); ex=null; readSoon(); return; }
      const r=ev.target.closest("[data-pr]"); if(r){ const p=photos[+r.dataset.pr]; p.rot=(p.rot+90)%360; proc(p); return; }
      const tile=ev.target.closest("[data-pi]"); if(tile){ const p=photos[+tile.dataset.pi]; if(p.f) vViewer(photos.filter(q=>q.f).map(q=>({f:q.f,m:q.m,label:title})), photos.filter(q=>q.f).indexOf(p)); else if(p.proc) vViewer([{f:"local",m:p.proc.mime,label:title,get:()=>Promise.resolve({data:p.proc.data,mime:p.proc.mime})}],0); } };
    $("#vff-clr").onchange=ev=>{ clear=ev.target.checked; photos.filter(p=>p.file&&!/pdf/.test(p.file.type)).forEach(proc); };
    // use advance for a new bill
    if(!edit && D.calc.advance>0) $("#vff-adv").innerHTML=`<label class="switch"><span><b>${esc(t("vUseAdv",vMoney(D.calc.advance)))}</b></span><input type="checkbox" id="vff-useadv" checked></label>`;
  }
  // ---- mode + reference (payment)
  if(type==="pay"){ let mode=e.mode||"Cash";
    const refUpd=()=>{ $("#vff-refl").textContent=t(mode==="Cheque"?"vRefCheque":mode==="Cash"?"vRefCash":"vRefUtr"); };
    $("#vff-mode").onclick=ev=>{ const b=ev.target.closest("[data-mode]"); if(!b) return; mode=b.dataset.mode; $("#vff-mode").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); refUpd(); };
    refUpd(); vForm._mode=()=>mode; }
  // ---- bills to settle (payment / return)
  let ticks=[], extraMode=null, amtAuto=false;
  const own=edit&&edit.alloc?edit.alloc:{};
  const openBills=()=>D.calc.bills.filter(b=>b.due>0 || own[b.id]).map(b=>({...b, due:Math.round((b.due+(+own[b.id]||0))*100)/100}));
  if(type!=="bill"){
    if(edit) ticks=Object.keys(own).filter(id=>D.calc.bills.some(b=>b.id===id));
    if(opts.bill) ticks=[opts.bill];
    const drawBills=()=>{ const ob=openBills(); const box=$("#vff-bills");
      box.innerHTML=ob.length?ob.map(b=>`<label class="vb-it${ticks.includes(b.id)?" on":""}"><input type="checkbox" data-bt="${esc(b.id)}" ${ticks.includes(b.id)?"checked":""}><span class="vb-mid"><b>${esc(b.opening?t("vOpening"):t("vBill")+(b.billNo?" "+b.billNo:""))}</b><small>${esc(vDate(b.date))}${b.overdue?` · <em>${esc(t("vsOverdue"))}</em>`:""}</small></span><span class="vb-amt num">${vMoney(b.due)}</span></label>`).join("")
        :`<p class="note" style="margin:0">${esc(t("vNoOpenBills"))}</p>`;
      preview(); };
    const preview=()=>{ const ob=openBills(), amt=toNum(amtI.value), byId={}; ob.forEach(b=>byId[b.id]=b); const pv=$("#vff-prev"), ex=$("#vff-extra");
      if(!(amt>0)){ pv.textContent=ticks.length?t("vTickTotal",vMoney(ticks.reduce((s,id)=>s+(byId[id]?byId[id].due:0),0))):""; ex.innerHTML=""; return; }
      const al=vAlloc(amt,ticks,ob,extraMode); const parts=Object.entries(al.alloc).map(([id,a])=>{ const b=byId[id]; const nm=b.opening?t("vOpening"):(b.billNo||vDate(b.date)); return a>=b.due-0.001?t("vClears",nm):t("vPartOf",vMoney(a),vMoney(b.due),nm); });
      pv.innerHTML=(parts.length?esc((ticks.length?"":t("vOldestFirst")+" ")+parts.join(" · ")):"")+(al.extra>0&&!al.ask?`${parts.length?"<br>":""}<b>${esc(t("vKeptAdv",vMoney(al.extra)))}</b>`:"");
      if(al.ask){ ex.innerHTML=`<div class="vextra"><p>${esc(t("vExtraQ",vMoney(al.extraRaw)))}</p><label><input type="radio" name="vx" value="adv" ${extraMode==="adv"?"checked":""}> ${esc(t("vExtraAdv"))}</label><label><input type="radio" name="vx" value="old" ${extraMode==="old"?"checked":""}> ${esc(t("vExtraOld"))}</label></div>`;
        ex.querySelectorAll("input").forEach(r=>r.onchange=()=>{ extraMode=r.value; preview(); }); } else ex.innerHTML=""; };
    $("#vff-bills").onchange=ev=>{ const id=ev.target.dataset.bt; if(!id) return; if(ev.target.checked){ if(!ticks.includes(id)) ticks.push(id); } else ticks=ticks.filter(x=>x!==id);
      if(!amtI.value.trim()||amtAuto){ const ob=openBills(); const sum=ticks.reduce((s,x)=>s+((ob.find(b=>b.id===x)||{}).due||0),0); moneySet(amtI, sum||""); amtAuto=!!sum; }
      drawBills(); };
    amtI.addEventListener("input",()=>{ amtAuto=false; preview(); });
    drawBills(); vForm._ticks=()=>ticks; vForm._alloc=()=>vAlloc(toNum(amtI.value),ticks,openBills(),extraMode);
    if(!edit) setTimeout(()=>amtI.focus(),260);
  }
  // ---- save
  $("#vff-save").onclick=async()=>{ const err=$("#vff-err"); err.textContent=""; const amount=toNum(amtI.value);
    if(!(amount>0)){ err.textContent=t("vNeedAmt"); amtI.focus(); return; }
    const gst=type==="bill"?toNum($("#vff-gst").value):NaN;
    if(type==="bill" && photos.some(p=>p.file&&!p.proc)){ err.textContent=t("photoWorking"); return; }
    let alloc={};
    if(type!=="bill"){ const a=vForm._alloc(); if(a.ask && !extraMode){ err.textContent=t("vPickExtra"); return; } alloc=a.alloc; }
    const entry={ id:edit?edit.id:vId("e"), vendorId, type, date:$("#vff-date").value||vToday(), amount, gst:isNaN(gst)?"":gst, billNo:type==="bill"?$("#vff-no").value.trim():"",
      mode:type==="pay"?vForm._mode():"", ref:type==="pay"?$("#vff-ref").value.trim():"", noteV:$("#vff-nv").value.trim(), noteP:$("#vff-np").value.trim(), alloc,
      photos:photos.filter(p=>p.f).map(p=>({f:p.f,m:p.m})), useAdvance:!!($("#vff-useadv")&&$("#vff-useadv").checked) };
    const fresh=photos.filter(p=>p.proc && !p.f), files=[];
    for(const p of fresh){ const k=vId("f"); await idb.set("images","vqf:"+k,{data:p.proc.data,mime:p.proc.mime,preview:p.proc.preview,name:p.proc.name}); files.push(k); entry.photos.push({f:"local:"+k,m:p.proc.mime}); }
    const before=edit?{...edit}:null; delete entry.pending; if(before){ delete before.pending; }
    if(type==="bill" && ex && readState==="done"){ entry.ex=ex; }
    const jid=vqAdd({k:"save", e:entry, files, isNew:!edit});
    const photosChanged = type==="bill" && JSON.stringify((edit&&edit.photos||[]).map(p=>p.f))!==JSON.stringify(entry.photos.map(p=>p.f));
    if(type==="bill" && S.cfg.aiOn && entry.photos.length && !entry.ex && (photosChanged||!edit||!edit.check)) vqAdd({k:"check",id:entry.id});
    openVendor(vendorId);
    vSnack(t(edit?"vSavedEdit":type==="bill"?"vSavedBill":type==="pay"?"vSavedPay":"vSavedRet"), ()=>vUndo(jid, before?{k:"save",e:{...before,vendorId},files:[]}:{k:"rm",id:entry.id,on:true}));
  };
}
/** Split a payment: ticked bills first (in tick order); nothing ticked = oldest first; extra over the ticked bills → ask
 *  (keep as advance / oldest bills) when other open bills exist, else it's an advance. */
function vAlloc(amount,ticks,bills,extraMode){ const out={}; let left=Math.round((+amount||0)*100)/100; const by={}; bills.forEach(b=>by[b.id]=b);
  const put=id=>{ const b=by[id]; if(!b||left<=0) return; const a=Math.min(left,b.due-(out[id]||0)); if(a>0){ out[id]=Math.round(((out[id]||0)+a)*100)/100; left=Math.round((left-a)*100)/100; } };
  const oldest=bills.slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.at||0)-(b.at||0)).map(b=>b.id);
  if(!ticks.length){ oldest.forEach(put); return {alloc:out, extra:left, ask:false}; }
  ticks.forEach(put); const extraRaw=left; const others=oldest.filter(id=>!ticks.includes(id));
  if(left>0 && others.length){ if(extraMode==="old") { others.forEach(put); return {alloc:out, extra:left, ask:true, extraRaw}; } return {alloc:out, extra:left, ask:true, extraRaw}; }
  return {alloc:out, extra:left, ask:false}; }
/* ---- one entry ---- */
function vEntry(vendorId,eid){ const D=VD.det[vendorId]; if(!D) return; const c=D.calc; VD.ent={v:vendorId,e:eid};
  const isOpen=eid.startsWith("open:"); const e=isOpen?null:D.entries.find(x=>x.id===eid); if(!isOpen && !e){ openVendor(vendorId); return; }
  const bill=c.bills.find(b=>b.id===eid); const name=isOpen?t("vOpening"):vEntryTitle(e);
  const payBy=bill?bill.by.map(x=>{ const p=D.entries.find(y=>y.id===x.id); return p?`<div class="vkv"><span>${esc(vDate(p.date))} · ${esc(p.type==="pay"?(t("vPaid")+(p.mode?" · "+t("vm_"+p.mode.toLowerCase()):"")):t("vReturn"))}${p.ref?` · ${esc(p.ref)}`:""}</span><b class="num">${vMoney(x.a)}</b></div>`:""; }).join(""):"";
  const covers=e&&e.type!=="bill"?Object.entries(e.alloc||{}).map(([id,a])=>{ const b=c.bills.find(y=>y.id===id); if(!b) return ""; return `<div class="vkv"><span>${esc(b.opening?t("vOpening"):t("vBill")+(b.billNo?" "+b.billNo:""))} · ${esc(vDate(b.date))}</span><b class="num">${vMoney(a)}</b></div>`; }).join(""):"";
  const used=e&&e.type!=="bill"?Object.values(e.alloc||{}).reduce((s,a)=>s+(+a||0),0):0, adv=e&&e.type!=="bill"?Math.round((e.amount-used)*100)/100:0;
  const hist=e&&e.history&&e.history.length?e.history.slice().reverse().map(h=>`<div class="vkv"><span>${esc(fmtDate(h.at))} · ${esc(h.by||"")}</span><span>${esc(t("vh_"+h.act))}${h.old&&h.old.amount!=null?` (${esc(t("vWas",vMoney(h.old.amount)))})`:""}</span></div>`).join(""):"";
  const photos=e&&e.photos?e.photos:[];
  sheetKey("vent:"+eid), openSheet(name, `<div class="vent"><button type="button" class="btn ghost bl-back" id="ve-back">← ${esc(D.vendor.name)}</button>
    <div class="vent-head"><b class="num ${!e||e.type==="bill"?"plus":"minus"}">${vMoney(isOpen?D.vendor.opening:e.amount)}</b><span>${esc(vDate(isOpen?D.vendor.openingDate:e.date))}${e&&e.billNo?` · ${esc(t("vBillNo"))} ${esc(e.billNo)}`:""}</span>${bill?`<span class="vr-st">${vStatusPill(bill)}${bill.due>0?` <b class="num">${esc(t("vDueAmt",vMoney(bill.due)))}</b>`:""}${bill.dueDate&&bill.due>0?` · ${esc(bill.overdue?t("vOverdueBy",vDays(bill.dueDate)):t("vDueOn",vDate(bill.dueDate)))}`:""}</span>`:""}</div>
    ${photos.length?`<div class="vent-ph">${photos.map((p,i)=>`<button type="button" class="vph-t big" data-vv="${i}">${p.m==="application/pdf"?`<span class="vph-pdf">PDF</span>`:`<span class="vph-img" data-vthumb="${esc(p.f)}"></span>`}</button>`).join("")}</div>`:""}
    ${e&&e.type==="bill"&&(e.photos||[]).length?vCheckBox(e):""}
    ${e&&e.type==="bill"&&e.lines>0&&can("manager")?`<button type="button" class="vi-open" id="ve-items"><span><b>${esc(t("vItemsBtn",e.lines))}</b><small>${esc(e.applied?t("vItemsDone",e.applied.n,e.applied.u):t("vItemsSub"))}</small></span><span aria-hidden="true">›</span></button>`:""}
    ${e&&e.gst!=null&&e.gst!==""?`<div class="vkv"><span>${esc(t("vGstPart"))}</span><b class="num">${vMoney(e.gst)}</b></div>`:""}
    ${e&&e.type==="pay"?`<div class="vkv"><span>${esc(t("vHowPaid"))}</span><b>${esc(t("vm_"+(e.mode||"cash").toLowerCase()))}${e.ref?` · ${esc(e.ref)}`:""}</b></div>`:""}
    ${payBy?`<h4>${esc(t("vPaidBy"))}</h4>${payBy}`:""}
    ${covers?`<h4>${esc(t("vCovers"))}</h4>${covers}`:""}${adv>0?`<div class="vkv"><span>${esc(t("vAdvance"))}</span><b class="num">${vMoney(adv)}</b></div>`:""}
    ${e&&e.noteV?`<h4>${esc(t("vNoteV"))}</h4><p class="vnote">${esc(e.noteV)}</p>`:""}${e&&e.noteP?`<h4>${IC.lock} ${esc(t("vNoteP"))}</h4><p class="vnote priv">${esc(e.noteP)}</p>`:""}
    ${e?`<p class="note" style="margin:8px 0 0">${esc(t("vAddedBy",e.by||"",fmtDate(e.at)))}${e.editedAt?` · ${esc(t("vEditedBy",e.editedBy||"",fmtDate(e.editedAt)))}`:""}</p>`:""}
    ${hist?`<details class="vhist"><summary>${esc(t("vChanges",e.history.length))}</summary>${hist}</details>`:""}
    <div class="vent-acts">${bill&&bill.due>0?`<button type="button" class="btn primary" id="ve-pay">${esc(t("vPayThis"))}</button>`:""}${bill&&bill.due>0&&c.advance>0?`<button type="button" class="btn ghost" id="ve-adv">${esc(t("vUseAdv",vMoney(Math.min(c.advance,bill.due))))}</button>`:""}
      ${e?`<button type="button" class="btn ghost" id="ve-edit">${esc(t("edit"))}</button><button type="button" class="btn ghost danger-t" id="ve-del">${esc(t("vRemove"))}</button>`:`<button type="button" class="btn ghost" id="ve-editv">${esc(t("vEditVendor"))}</button>`}</div></div>`, "", {full:true});
  $("#ve-back").onclick=()=>openVendor(vendorId);
  vFillThumbs($("#sheet-body"));
  $("#sheet-body").querySelectorAll("[data-vv]").forEach(b=>b.onclick=()=>vViewer(photos.map(p=>({f:p.f,m:p.m,label:name})),+b.dataset.vv));
  if($("#ve-pay")) $("#ve-pay").onclick=()=>vForm("pay",vendorId,null,{bill:eid});
  if($("#ve-adv")) $("#ve-adv").onclick=()=>{ vqAdd({k:"adv",vendorId,billId:eid}); vEntry(vendorId,eid); toast(t("saved")); };
  if($("#ve-editv")) $("#ve-editv").onclick=()=>vVendorForm(vendorId);
  if($("#ve-recheck")) $("#ve-recheck").onclick=()=>{ if(VD.chkFail) delete VD.chkFail[e.id]; vqAdd({k:"check",id:e.id}); vEntry(vendorId,eid); };
  if($("#ve-stopchk")) $("#ve-stopchk").onclick=()=>{ const q=vqGet(), j=q.find(x=>x.k==="check"&&x.id===e.id); if(j){ if(VD.chkRun===j.jid){ VD.chkStop=VD.chkStop||{}; VD.chkStop[j.jid]=1; } vqSet(q.filter(x=>x.jid!==j.jid)); vRebuild(); } vEntry(vendorId,eid); toast(t("vChkStopped")); };
  if($("#ve-ack")) $("#ve-ack").onclick=()=>{ vqAdd({k:"ack",id:e.id,on:!(e.check&&e.check.ack)}); vEntry(vendorId,eid); };
  if($("#ve-edit")) $("#ve-edit").onclick=()=>vForm(e.type,vendorId,e);
  if($("#ve-items")) $("#ve-items").onclick=()=>vItems(vendorId,eid);
  if($("#ve-del")) $("#ve-del").onclick=()=>{ const jid=vqAdd({k:"rm",id:e.id,on:true}); openVendor(vendorId); vSnack(t("vRemoved"), ()=>vUndo(jid,{k:"rm",id:e.id,on:false})); };
}
/** "Bill check" box on a bill's screen. */
function vCheckBox(e){ const c=e.check; let h="", cls="muted";
  const fail=VD.chkFail&&VD.chkFail[e.id];
  if(e.checking) h=`<span class="vchk-run">${LD("sm")} <span>${esc(t("vChecking"))}<small>${esc(t("vCheckingWait"))}</small></span><button type="button" class="linkbtn" id="ve-stopchk">${esc(t("vStopChk"))}</button></span>`;
  else if(fail && (!c || !c.at || fail.at>c.at)) h=`<span>${esc(t(fail.code==="timeout"?"vChkSlow":"vChkFail2"))}</span>`;
  else if(!c) h=S.cfg.aiOn?`<span>${esc(t("vNotChecked"))}</span>`:`<span>${esc(t("vAiOff"))}</span>`;
  else if(c.st==="ok"||c.st==="basic"){ cls="ok"; h=`<b>✓ ${esc(t(c.st==="ok"?"vAddsUp":"vBasicOk"))}</b>${vDoneText(c)?`<small>${esc(vDoneText(c))}</small>`:""}${c.total!=null?`<small>${esc(t("vBillTotalRead",vMoney(c.total)))}</small>`:""}`; }
  else if(c.st==="issues"){ cls=c.ack?"muted":"bad"; h=`<b>${IC.warn} ${esc(t("vIssuesN",c.issues.length))}</b><ul>${c.issues.map(i=>`<li>${esc(vIssueText(i))}</li>`).join("")}</ul>${vDoneText(c)?`<small>${esc(vDoneText(c))}</small>`:""}${c.ack?`<small>✓ ${esc(t("vAckBy",c.ack.by||"",fmtDate(c.ack.at)))}</small>`:""}`; }
  else if(c.st==="unread") h=`<span>${esc(t("vUnreadShort"))}</span>`;
  else h=`<span>${esc(t(c.err==="ai_limit"?"vAiBusy":"vCheckFail"))}</span>`;
  if(c && !e.checking && !(fail && (!c.at || fail.at>c.at)) && (c.kept || c.m)) h+=`<small class="vread-m">${c.kept?esc(t("vKept"))+" ":""}${c.m?esc(t("vReadBy",c.m)):""}</small>`;
  if(c && !e.checking && c.m && /lite/i.test(c.m) && !(e.lines>0)) h+=`<small class="vread-m">${esc(t("vLiteNoLines"))}</small>`;   /* why "Items on this bill" isn't there */
  const btns=S.cfg.aiOn&&!e.checking?`<div class="vread-acts"><button type="button" class="btn ghost" id="ve-recheck">${esc(t("vRecheck"))}</button>${c&&c.st==="issues"?`<button type="button" class="btn ghost" id="ve-ack">${esc(t(c.ack?"vUnack":"vAck"))}</button>`:""}</div>`:"";
  return `<h4>${esc(t("vCheckT"))}</h4><div class="vread ${cls}">${h}</div>${btns}`; }
/* ---- #Bill: the lines read from a vendor bill → your items, buy prices (before GST) and purchase history ----
 * vLinesHTML shows what Gemini read (problem lines highlighted). vItems is the review screen: each line is matched to a
 * price-list item (remembered per vendor, else guessed from the name), with "how many bill units make 1 of your unit"
 * (remembered too), giving the new buy price; ticked ones update the item. vApply saves it all in one go. */
const vKeyD=d=>String(d||"").toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g," ").trim().slice(0,80);
function unitCanon(u){ const x=String(u||"").toLowerCase().replace(/[.\s]/g,""); if(!x) return ""; if(["nos","no","number","numbers","pcs","pc"].includes(x)) return "pc"; if(/^rolls?$/.test(x)) return "roll";
  if(/^(doz|dzn)$/.test(x)) return "dozen"; return String(unitFromWord(x)||x).toLowerCase(); }
/** Cost of ONE bill unit before GST, from the line as written (rate ÷ per, line discount; or amount ÷ qty). */
function vUnitCost(l){ const r2=v=>Math.round(v*1e4)/1e4; if(!l) return null;
  if(l.r!=null){ let per=l.per>0?l.per:1;
    if(l.a!=null && l.q>0){ const e=x=>{ let v=l.q*l.r/x; if(l.dp) v*=1-l.dp/100; if(l.da) v-=l.da; return v; };
      if(Math.abs(e(per)-l.a)>Math.max(1,l.a*0.002)){ const p=[10,100,1000,12].find(x=>Math.abs(e(x)-l.a)<=Math.max(1,l.a*0.002)); if(p) per=p; } }   /* "per 100" not written on the bill */
    let c=l.r/per; if(l.dp) c*=1-l.dp/100; if(l.da && l.q>0) c-=l.da/l.q; return c>0?r2(c):null; }
  if(l.a!=null && l.q>0) return r2(l.a/l.q); return null; }
/** Best price-list item for a bill line: most of the item's name words (and every number in it) appear in the line. */
const vTok=x=>phonTokens(String(x||"").replace(/(\d)([a-z\u0900-\u097f])/gi,"$1 $2").replace(/([a-z\u0900-\u097f])(\d)/gi,"$1 $2"));   /* "1kg" and "1 kg" alike */
function vMatchItem(desc){ const dt=vTok(desc); if(!dt.length) return null; const nums=new Set(dt.filter(x=>/^\d/.test(x)));
  let best=null, second=0;
  for(const e of S.index){ for(const src of [e.it.name, e.it.aliases]){ if(!src) continue;
      for(const part of String(src).split(",")){ const it=vTok(part); if(!it.length) continue;
        if(it.some(x=>/^\d/.test(x) && !nums.has(x))) continue;   /* a size like 250 must be on the bill line too */
        const hit=it.filter(x=>tokScore(x,dt)>=60).length, sc=hit/it.length + Math.min(hit,4)*0.01;
        if(hit/it.length<0.75) continue;
        if(!best || sc>best.sc){ if(best && best.it.id!==e.it.id) second=Math.max(second,best.sc); best={it:e.it,sc}; } else if(e.it.id!==best.it.id) second=Math.max(second,sc); } } }
  return best && best.sc-second>=0.05 ? best.it : null; }
/** Bill units in 1 of the item's units: same unit → 1; the item's pack unit → packs per main unit; else unknown. */
function vGuessF(it,billUnit){ const b=unitCanon(billUnit); if(!it) return null; if(!b || b===unitCanon(it.unit)) return 1;
  if(hasAlt(it) && b===unitCanon(it.altUnit) && +it.altQty>0) return +it.altQty; return null; }
function vLinesHTML(ex,chk){ if(!ex||!(ex.lines||[]).length) return "";
  const bad={}; ((chk&&chk.issues)||[]).forEach(i=>{ if(i.t==="line") bad[i.i]=i; });
  const q=l=>l.q!=null?`${fmtN(l.q)}${l.un?" "+esc(l.un):""}`:"", rows=ex.lines.map((l,k)=>{ const b=bad[k+1];
    return `<div class="vl${b?" bad":""}${l.u?" unclear":""}"><span class="vl-n">${k+1}</span><span class="vl-d"><b>${esc(l.d||"—")}</b><small>${q(l)}${l.r!=null?` × ${vMoney(l.r)}${l.per>1?"/"+fmtN(l.per):""}`:""}${l.dp?` −${fmtN(l.dp)}%`:""}${l.u?` · ${esc(t("vlUnclear"))}`:""}</small>${b?`<small class="vl-bad">${esc(t("vlShould",vMoney(b.e)))}</small>`:""}</span><b class="num">${l.a!=null?vMoney(l.a):"—"}</b></div>`; }).join("");
  const tot=(k,v,cls)=>v==null||v===""?"":`<div class="vl-t${cls?" "+cls:""}"><span>${esc(k)}</span><b class="num">${vMoney(v)}</b></div>`;
  const iss=new Set(((chk&&chk.issues)||[]).map(i=>i.t));
  return `<div class="vlines">${rows}${tot(t("vlSub"),ex.sub,iss.has("sum")?"bad":"")}${ex.disc?tot(t("vlDisc"),-ex.disc):""}${(ex.charges||[]).map(c=>tot(c.n||t("vlCharge"),c.a)).join("")}${(ex.taxes||[]).map(x=>tot((x.n||"GST")+(x.r?` ${fmtN(x.r)}%`:""),x.a)).join("")}${ex.tt!=null&&!(ex.taxes||[]).length?tot(t("vlTax"),ex.tt):""}${ex.ro?tot(t("vlRo"),ex.ro):""}${tot(t("vlTotal"),ex.total,"big"+(iss.has("total")?" bad":""))}</div>`; }
async function vExGet(id){ VD.ex=VD.ex||{}; if(VD.ex[id]) return VD.ex[id]; const r=await apiPost({action:"vEx",id}); VD.ex[id]=r; return r; }
async function vItems(vendorId,eid){ const D=VD.det[vendorId]; if(!D) return; const e=D.entries.find(x=>x.id===eid); if(!e) return;
  openSheet(t("vItemsT"), `<div class="vent"><button type="button" class="btn ghost" id="vi-back">← ${esc(vEntryTitle(e))}</button><div id="vi-body">${ldBlock(t("vLoadingLines"))}</div></div>`, "", {full:true});
  $("#vi-back").onclick=()=>vEntry(vendorId,eid);
  let X; try{ X=await vExGet(eid); }catch(err){ const b=$("#vi-body"); if(b) b.innerHTML=`<p class="err">${esc(navigator.onLine===false?t("vNeedNet"):errMsg(err))}</p>`; return; }
  const body=$("#vi-body"); if(!body) return; const ex=X.ex; if(!ex||!(ex.lines||[]).length){ body.innerHTML=`<p class="note">${esc(t("vNoLines"))}</p>`; return; }
  const map=(D.vendor&&D.vendor.map)||{}, chk=e.check;
  const st=ex.lines.map(l=>{ const m=map[vKeyD(l.d)], uc=vUnitCost(l); let it=null, f=null, auto=false, skip=false;
    if(m&&m.skip) skip=true; else if(m&&m.id&&S.byId.get(m.id)){ it=S.byId.get(m.id); f=+m.f||1; } else { it=vMatchItem(l.d); auto=!!it; f=vGuessF(it,l.un); }
    return { l, uc, it, f, auto, skip, upd:null, pick:false }; });
  const bad={}; ((chk&&chk.issues)||[]).forEach(i=>{ if(i.t==="line") bad[i.i]=i; });
  const buyOf=x=>x.it&&x.uc!=null&&x.f>0?Math.round(x.uc*x.f*1000)/1000:null;
  const defUpd=x=>{ const nb=buyOf(x), cur=+(x.it&&x.it.buy)||0; if(nb==null) return false; if(!cur) return true; const ch=Math.abs(nb-cur)/cur; return ch>=0.005 && ch<=0.5; };
  st.forEach(x=>{ x.upd=defUpd(x); });
  const draw=()=>{ const nU=st.filter(x=>x.upd&&buyOf(x)!=null&&!x.skip).length, nM=st.filter(x=>x.it&&!x.skip).length;
    body.innerHTML=`${X.applied?`<p class="vi-done">✓ ${esc(t("vAppliedOn",X.applied.n,X.applied.u,fmtDate(X.applied.at),X.applied.by||""))}</p>`:""}
      <p class="note" style="margin:0">${esc(t("vItemsD"))}</p>
      ${st.map((x,k)=>{ const l=x.l, nb=buyOf(x), cur=+(x.it&&x.it.buy)||0, ch=nb!=null&&cur?(nb-cur)/cur*100:null, b=bad[k+1];
        return `<div class="vi${b?" bad":""}${x.skip?" skip":""}" data-k="${k}">
          <div class="vi-h"><b>${k+1}. ${esc(l.d||"—")}</b><b class="num">${l.a!=null?vMoney(l.a):""}</b></div>
          <small class="vi-s">${l.q!=null?`${fmtN(l.q)} ${esc(l.un||"")}`:""}${l.r!=null?` × ${vMoney(l.r)}${l.per>1?"/"+fmtN(l.per):""}`:""}${l.dp?` −${fmtN(l.dp)}%`:""}${x.uc!=null?` · ${esc(t("vPerUnit",vMoney(x.uc),l.un||t("vUnitWord")))}`:""}${l.u?` · ${esc(t("vlUnclear"))}`:""}</small>
          ${b?`<small class="vl-bad">${esc(t("vlShould",vMoney(b.e)))}</small>`:""}
          ${x.skip?`<div class="vi-row"><span class="note">${esc(t("vSkipped"))}</span><button type="button" class="linkbtn" data-unskip="${k}">${esc(t("vUnskip"))}</button></div>`
          : x.pick||!x.it?`<div class="vi-pick"><input type="search" data-q="${k}" placeholder="${esc(t("vPickPh"))}" autocomplete="off"><div class="vi-res" data-res="${k}"></div><div class="vi-row"><button type="button" class="linkbtn" data-skip="${k}">${esc(t("vSkip"))}</button>${x.it?`<button type="button" class="linkbtn" data-cancel="${k}">${esc(t("cancel"))}</button>`:""}</div></div>`
          : `<div class="vi-row"><span class="vi-it">→ <b>${esc(itemTitle(x.it))}</b>${x.auto?` <span class="pill open">${esc(t("vAutoTag"))}</span>`:""}</span><button type="button" class="linkbtn" data-change="${k}">${esc(t("vChange"))}</button></div>
             ${unitCanon(l.un)&&unitCanon(l.un)!==unitCanon(x.it.unit)||x.f!==1?`<div class="vi-row vi-f"><span>1 ${esc(unitL(x.it.unit))} =</span><input class="num money" data-dp="3" inputmode="decimal" data-f="${k}" value="${x.f?esc(moneyVal(x.f,3)):""}" placeholder="?"><span>${esc(l.un||t("vUnitWord"))}</span></div>`:""}
             ${nb!=null?`<label class="vi-row vi-buy"><input type="checkbox" data-upd="${k}" ${x.upd?"checked":""}><span>${esc(t("vNewBuy",vMoney(nb),unitL(x.it.unit)))}${cur?` <small class="${ch!=null&&Math.abs(ch)>50?"warn":""}">${esc(t("vNowBuy",vMoney(cur),(ch>0?"+":"")+fmtN(Math.round(ch*10)/10)))}</small>`:""}</span></label>${ch!=null&&Math.abs(ch)>50?`<small class="warn">${esc(t("vBigChange"))}</small>`:""}`
             :`<small class="note">${esc(x.uc==null?t("vNoRate"):t("vNeedF"))}</small>`}`}
        </div>`; }).join("")}
      <div class="vi-foot"><button type="button" class="btn primary" id="vi-save" ${nM?"":"disabled"}>${esc(nU?t("vSaveUpd",nM,nU):t("vSaveOnly",nM))}</button></div>`;
    bindRows(); };
  const bindRows=()=>{ body.querySelectorAll("[data-change]").forEach(b=>b.onclick=()=>{ st[+b.dataset.change].pick=true; draw(); const i=body.querySelector(`[data-q="${b.dataset.change}"]`); if(i) i.focus(); });
    body.querySelectorAll("[data-cancel]").forEach(b=>b.onclick=()=>{ st[+b.dataset.cancel].pick=false; draw(); });
    body.querySelectorAll("[data-skip]").forEach(b=>b.onclick=()=>{ const x=st[+b.dataset.skip]; x.skip=true; x.pick=false; draw(); });
    body.querySelectorAll("[data-unskip]").forEach(b=>b.onclick=()=>{ const x=st[+b.dataset.unskip]; x.skip=false; x.pick=!x.it; draw(); });
    body.querySelectorAll("[data-upd]").forEach(c=>c.onchange=()=>{ st[+c.dataset.upd].upd=c.checked; draw(); });
    body.querySelectorAll("[data-f]").forEach(i=>i.onchange=()=>{ const x=st[+i.dataset.f], v=toNum(i.value); x.f=v>0?v:null; x.upd=defUpd(x); draw(); });
    body.querySelectorAll("[data-q]").forEach(i=>{ const k=+i.dataset.q, res=body.querySelector(`[data-res="${k}"]`);
      const show=()=>{ const q=i.value.trim(); const list=(q?runSearch(q).res.map(o=>o.e.it):[]).slice(0,5);
        res.innerHTML=list.map(it=>`<button type="button" class="vi-opt" data-pick="${esc(it.id)}"><b>${esc(itemTitle(it))}</b><small>${esc(unitL(it.unit))}${hideBuy()?"":` · ${esc(t("buy"))} ${rs(it.buy)}`}</small></button>`).join("")||(q?`<small class="note">${esc(t("noMatch",q))}</small>`:"");
        res.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>{ const x=st[k]; x.it=S.byId.get(b.dataset.pick); x.auto=false; x.pick=false; x.skip=false; x.f=vGuessF(x.it,x.l.un); x.upd=defUpd(x); draw(); }); };
      i.addEventListener("input",show); if(!i.value) i.value=st[k].l.d?String(st[k].l.d).split(/\s+/).slice(0,2).join(" "):""; show(); });
    const sv=$("#vi-save"); if(sv) sv.onclick=async()=>{ if(navigator.onLine===false){ toast(t("vNeedNet")); return; }
      const rows=st.map(x=>x.skip?{d:x.l.d,skip:1}:x.it&&buyOf(x)!=null?{d:x.l.d,itemId:x.it.id,f:x.f,buy:buyOf(x),upd:!!x.upd,q:x.l.q,un:x.l.un,r:x.l.r}:null).filter(Boolean);
      btnBusy(sv,true); try{ const r=await apiPost({action:"vApply",entryId:eid,rows}); vMerge(r); vRebuild(); VD.ex[eid]=null;
        (r.updated||[]).forEach(id=>{ const it=S.byId.get(id), row=rows.find(z=>z.itemId===id); if(it&&row){ it.buy=row.buy; it.updatedAt=Date.now(); } }); if((r.updated||[]).length){ saveCache(); renderList(); }
        toast(t("vApplied",r.matched||0,(r.updated||[]).length)); VD.buys={}; vEntry(vendorId,eid); }
      catch(err){ btnBusy(sv,false); toast(errMsg(err)); } }; };
  draw(); }
/** Item screen: where and at what price this item was last bought (from matched vendor bills). */
async function itemBuysInto(id,el){ if(!el) return; VD.buys=VD.buys||{}; try{ const r=VD.buys[id]||(VD.buys[id]=await apiPost0({action:"itemBuys",id})); if(!r.buys||!r.buys.length){ el.remove(); return; }
  const it=S.byId.get(id); el.innerHTML=`<h4>${esc(t("vBoughtT"))}</h4>`+r.buys.map(b=>`<div class="vkv"><span>${esc(vDate(b.date))} · ${esc(b.vendor||"")}<small>${b.qty!=null?`${fmtN(b.qty)} ${esc(b.unit)} × ${vMoney(b.rate)}`:""}${b.f&&b.f!==1?` · ${esc(t("vPerF",fmtN(b.f),b.unit,unitL(it?it.unit:"")))}`:""}</small></span><b class="num">${vMoney(b.buy)}<small>/${esc(unitL(it?it.unit:""))}</small></b></div>`).join(""); el.hidden=false; }
  catch{ el.remove(); } }
/* ---- share: statement PDF / vendor link / WhatsApp ---- */
function vLinkSet(id,r){ const sv=VDB.srv.vendors.find(v=>v.id===id); if(sv){ sv.token=r.token; sv.linkOn=r.linkOn; vdbSave(); } vRebuild(); }
function vLinkUrl(tok){ const b=location.href.split("#")[0].split("?")[0].replace(/[^/]*$/,""); return b+"vendor.html?t="+encodeURIComponent(tok)+(SHOP_MAIN?"":"&s="+encodeURIComponent(SHOP.code)); }
function vShareSheet(id){ const D=VD.det[id]; if(!D) return; const v=D.vendor, c=D.calc;
  const fy=curFY(), fyStart=`20${fy.slice(2,4)}-04-01`, wa=v.mobile?`https://wa.me/${normMobile(v.mobile)||""}`:"";
  const balTxt=c.balance>0?vMoney(c.balance):c.balance<0?t("vAdvance")+" "+vMoney(-c.balance):t("vSettled");
  openSheet(t("vShare"), `<div class="vshare"><button type="button" class="btn ghost bl-back" id="vs-back">← ${esc(v.name)}</button>
    <div class="vs-bal"><span>${esc(v.name)}</span><b class="num">${esc(balTxt)}</b></div>
    <section class="vs-card"><div class="vs-h"><span class="vs-ic">${IC.file}</span><div><h4>${esc(t("vStatement"))}</h4><p>${esc(t("vStatementD"))}</p></div></div>
      <div class="seg vs-seg" id="vs-per"><button type="button" data-per="all" aria-pressed="true">${esc(t("vPerAll"))}</button><button type="button" data-per="fy" aria-pressed="false">${esc(t("vPerFy"))}</button><button type="button" data-per="custom" aria-pressed="false">${esc(t("vPerCustom"))}</button></div>
      <div class="vs-dates" id="vs-dates" hidden><label><span>${esc(t("rpFrom"))}</span><input type="date" id="vs-from" value="${fyStart}"></label><label><span>${esc(t("rpTo"))}</span><input type="date" id="vs-to" value="${vToday()}"></label></div>
      <label class="vs-row"><span>${esc(t("vInclPhotos"))}</span><input type="checkbox" class="vs-tog" id="vs-ph" checked></label>
      <button type="button" class="btn primary vs-big" id="vs-pdf">${esc(t("vMakePdf"))}</button>
      ${wa?`<button type="button" class="btn ghost vs-big vs-wa" id="vs-wa"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.4-.7-2.8-1.1-4.6-4-4.8-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.3.1.2.1.8-.1 1.4z"/></svg> ${esc(t("vSendBal"))}</button>`:""}</section>
    <section class="vs-card"><div class="vs-h"><span class="vs-ic">${IC.link}</span><div><h4>${esc(t("vLinkT"))}</h4><p>${esc(t("vLinkD"))}</p></div></div>
      <label class="vs-row"><span><b>${esc(t("vLinkOn"))}</b></span><input type="checkbox" class="vs-tog" id="vs-on" ${v.linkOn?"checked":""}></label>
      <div id="vs-link" class="vs-link"></div></section></div>`, "", {full:true});
  $("#vs-back").onclick=()=>openVendor(id);
  let per="all"; $("#vs-per").onclick=e=>{ const b=e.target.closest("[data-per]"); if(!b) return; per=b.dataset.per; $("#vs-per").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); $("#vs-dates").hidden=per!=="custom"; };
  const range=()=>per==="fy"?{from:fyStart,to:vToday()}:per==="custom"?{from:$("#vs-from").value,to:$("#vs-to").value}:{from:"",to:""};
  $("#vs-pdf").onclick=()=>vStatementPdf(id,{...range(),photos:$("#vs-ph").checked},$("#vs-pdf"));
  if($("#vs-wa")) $("#vs-wa").onclick=()=>{ const vv=VD.det[id].vendor; const txt=`${S.cfg.shopName?`*${S.cfg.shopName}*\n`:""}${t("vWaLine",v.name,vDate(vToday()),balTxt)}${vv.linkOn&&vv.token?`\n${t("vWaLink")} ${vLinkUrl(vv.token)}`:""}`; window.open(`${wa}?text=${encodeURIComponent(txt)}`,"_blank"); };
  const drawLink=()=>{ const box=$("#vs-link"), vv=VD.det[id].vendor;
    if(vv.linkOn && !vv.token){ box.innerHTML=`<p class="note" style="margin:0">${esc(t("vWaitSync"))}</p>`; return; } if(!vv.linkOn||!vv.token){ box.innerHTML=""; return; } const url=vLinkUrl(vv.token);
    box.innerHTML=`<div class="vs-url"><span>${esc(url)}</span><button type="button" id="vs-copy" aria-label="${esc(t("copy"))}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg><span>${esc(t("copy"))}</span></button></div>
      ${wa?`<a class="btn primary vs-big vs-wa" target="_blank" rel="noopener" href="${wa}?text=${encodeURIComponent(t("vWaLinkMsg",S.cfg.shopName||"")+" "+url)}"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.4-.7-2.8-1.1-4.6-4-4.8-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.3.1.2.1.8-.1 1.4z"/></svg> ${esc(t("vSendLink"))}</a>`:""}
      <button type="button" class="btn ghost vs-big" id="vs-new">${esc(t("vNewLink"))}</button>`;
    $("#vs-copy").onclick=()=>{ try{ navigator.clipboard.writeText(url); toast(t("copied")); }catch{} };
    $("#vs-new").onclick=async()=>{ btnBusy($("#vs-new"),true); try{ const r=await vCall({action:"vLink",id,on:true,regen:true}); vLinkSet(id,r); toast(t("vNewLinkDone")); drawLink(); }catch{ btnBusy($("#vs-new"),false); } }; };
  $("#vs-on").onchange=async e=>{ const on=e.target.checked; if(vqGet().some(j=>j.k==="vendor"&&j.v.id===id)){ e.target.checked=!on; toast(t("vWaitSync")); return; } try{ const r=await vCall({action:"vLink",id,on}); vLinkSet(id,r); drawLink(); }catch{ e.target.checked=!on; } };
  drawLink();
}
async function vStatementPdf(id,o,btn){ const D=VD.det[id]; if(!D) return; btnBusy(btn,true);
  try{ const lib=await loadPdf(); const doc=new lib.jsPDF({unit:"pt",format:"a4"}); const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight(), M=40;
    const asc=s=>String(s||"").replace(/₹/g,"Rs.").replace(/[^\x20-\x7E]/g,""); const R=n=>Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
    const v=D.vendor, from=o.from||"", to=o.to||"9999-12-31";
    let opening=0; const rows=[]; let bal=0;
    const all=[]; if(v.opening) all.push({date:v.openingDate, part:"Opening balance", dr:v.opening>0?v.opening:0, cr:v.opening<0?-v.opening:0});
    D.entries.filter(e=>!e.removed).forEach(e=>{ const part=e.type==="bill"?`Bill${e.billNo?" "+e.billNo:""}${e.gst?` (GST ${R(e.gst)})`:""}`:e.type==="pay"?`Payment - ${e.mode||"Cash"}${e.ref?" ref "+e.ref:""}`:"Return / discount";
      all.push({date:e.date, part:part+(e.noteV?` - ${e.noteV}`:""), dr:e.type==="bill"?e.amount:0, cr:e.type==="bill"?0:e.amount, e}); });
    all.forEach(r=>{ if(from && r.date<from){ opening+=r.dr-r.cr; return; } if(r.date>to) return; rows.push(r); });
    bal=opening; const body=[]; if(from) body.push([vDateA(from),"Opening balance","","",R(opening)]);
    rows.forEach(r=>{ bal+=r.dr-r.cr; body.push([vDateA(r.date),asc(r.part),r.dr?R(r.dr):"",r.cr?R(r.cr):"",R(bal)]); });
    let y=46; doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.text(asc(S.cfg.shopName)||"Rate Book",M,y); doc.setFontSize(11); doc.text("ACCOUNT STATEMENT",W-M,y,{align:"right"});
    doc.setFont("helvetica","normal"); doc.setFontSize(9.5); y+=14; if(S.cfg.shopAddress){ doc.text(asc(S.cfg.shopAddress),M,y); } doc.text(`Date: ${vDateA(vToday())}`,W-M,y,{align:"right"}); y+=13;
    if(S.cfg.shopGstin){ doc.text("GSTIN: "+S.cfg.shopGstin,M,y); } doc.text(`Period: ${from?vDateA(from):"Start"} to ${o.to?vDateA(o.to):vDateA(vToday())}`,W-M,y,{align:"right"}); y+=10;
    if(S.cfg.mode==="test"){ y+=12; doc.setTextColor(184,122,11); doc.setFont("helvetica","bold"); doc.text("TEST DATA - practice only",W/2,y,{align:"center"}); doc.setTextColor(0); doc.setFont("helvetica","normal"); }
    y+=10; doc.setDrawColor(200); doc.line(M,y,W-M,y); y+=16; doc.setFont("helvetica","bold"); doc.text("Vendor",M,y); doc.setFont("helvetica","normal"); y+=13;
    [asc(v.name), v.mobile?"Mobile: "+v.mobile:"", v.gstin?"GSTIN: "+v.gstin:"", v.address?asc(v.address):"", v.creditDays?`Credit period: ${v.creditDays} days`:""].filter(Boolean).forEach(l=>{ doc.text(l,M,y); y+=12; });
    doc.autoTable({ startY:y+4, margin:{left:M,right:M}, head:[["Date","Particulars","Bill (Rs.)","Paid / Return (Rs.)","Balance (Rs.)"]], body, styles:{fontSize:8.6,cellPadding:4}, headStyles:{fillColor:[22,23,26],textColor:255},
      columnStyles:{0:{cellWidth:62},2:{halign:"right",cellWidth:70},3:{halign:"right",cellWidth:84},4:{halign:"right",cellWidth:76}}, didParseCell:d=>{ if(d.section==="head"&&d.column.index>=2) d.cell.styles.halign="right"; } });
    y=doc.lastAutoTable.finalY+14; const tot=rows.reduce((a,r)=>({dr:a.dr+r.dr,cr:a.cr+r.cr}),{dr:0,cr:0});
    doc.autoTable({ startY:y, margin:{left:W/2,right:M}, theme:"plain", styles:{fontSize:9.5,cellPadding:3}, columnStyles:{1:{halign:"right"}},
      body:[...(from?[["Opening balance",R(opening)]]:[]),["Total bills",R(tot.dr)],["Total paid / returns",R(tot.cr)],[bal>=0?"Balance payable":"Advance with vendor",R(Math.abs(bal))]], didParseCell:d=>{ if(d.row.index===d.table.body.length-1) d.cell.styles.fontStyle="bold"; } });
    y=doc.lastAutoTable.finalY+14;
    const open=D.calc.bills.filter(b=>b.due>0 && (!from||b.date>=from||true));
    if(open.length){ doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("Open bills",M,y); doc.setFont("helvetica","normal");
      doc.autoTable({ startY:y+6, margin:{left:M,right:M}, head:[["Bill","Date","Amount","Paid","Due","Due date"]], body:open.map(b=>[asc(b.opening?"Opening balance":(b.billNo||"-")),vDateA(b.date),R(b.amount),R(b.paid),R(b.due),b.dueDate?vDateA(b.dueDate)+(b.overdue?" (overdue)":""):"-"]),
        styles:{fontSize:8.6,cellPadding:3.5}, headStyles:{fillColor:[238,240,243],textColor:20}, columnStyles:{2:{halign:"right"},3:{halign:"right"},4:{halign:"right"}}, didParseCell:d=>{ if(d.section==="head"&&d.column.index>=2&&d.column.index<=4) d.cell.styles.halign="right"; } });
      y=doc.lastAutoTable.finalY+14; }
    doc.setFontSize(8.5); doc.setTextColor(110); doc.text("This is a computer-generated statement.",M,Math.min(y,H-30)); doc.setTextColor(0);
    if(o.photos){ const list=[]; rows.forEach(r=>{ if(r.e && r.e.photos) r.e.photos.forEach(p=>list.push({p,e:r.e})); });
      for(let k=0;k<list.length;k++){ const {p,e}=list[k]; btn.innerHTML=LD("sm on-dark")+esc(t("vPdfPhotos",k+1,list.length));
        doc.addPage(); doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.text(asc(`Bill${e.billNo?" "+e.billNo:""} - ${vDateA(e.date)} - Rs. ${R(e.amount)}`),M,36); doc.setFont("helvetica","normal");
        if(p.m==="application/pdf"){ doc.text("(PDF attachment - open it in the app or the vendor link)",M,56); continue; }
        try{ const d=await vFull(p.f); const im=await new Promise((res,rej)=>{ const x=new Image(); x.onload=()=>res(x); x.onerror=rej; x.src=`data:${d.mime};base64,${d.data}`; });
          const mw=W-2*M, mh=H-90, r=Math.min(mw/im.width,mh/im.height); doc.addImage(im,"JPEG",M+(mw-im.width*r)/2,50,im.width*r,im.height*r); }catch{ doc.text("(photo could not be loaded)",M,56); } } }
    const blob=doc.output("blob"); await shareFile(blob,`Statement-${v.name.replace(/[^\w]+/g,"-")}.pdf`);
  }catch(e){ toast(t("pdfFail")); } finally{ btnBusy(btn,false); } }
const vDateA=d=>{ if(!d) return ""; const x=new Date(d+"T00:00:00"); return x.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}); };
