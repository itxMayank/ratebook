/* Rate Book: Past bills (Tools → Past bills): the list with month/day groups and filters, the copy of recent bills kept on
   the phone (BLC, kept fresh in the background), and a bill's own screen with its payment box. Split out of app.js on
   11 Oct 2026. A plain script in global scope, loaded before app.js: while loading it only declares things, so it needs
   nothing from app.js until something is called. app.js (sync, bill page) and customers.js call blcAdd / blcBg /
   blcRefresh / showBill… only after start-up. Run  node tools/stamp.js  after editing. */
"use strict";
/* ---------------- Past bills ---------------- */
function oldBillText(b){
  const d=b.date?new Date(b.date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"";
  let s=""; if(S.cfg.shopName) s+=`*${S.cfg.shopName}*\n`;
  s+=`${t("billNoLine",b.n)}${d?` · ${d}`:""}\n`; if(b.customer) s+=`${t("custL")}: ${b.customer}\n`; if(b.mobile) s+=`${t("mobL")}: ${b.mobile}\n`;
  const parts=String(b.items||"").split("; ").filter(Boolean);
  s+="\n"+parts.map((x,i)=>{ const m=x.match(/^(.*) ([\d.]+) (\S+) x ([\d.]+)(?: \[(.*)\])?$/);
    if(!m) return `${i+1}. ${x}`;
    const qty=+m[2], rate=+m[4];
    return `${i+1}. ${m[1].trim()}${m[5]?` (${m[5]})`:""} — ${qtyText(qty,m[3])} × ${rs(rate)}${isPart(qty,m[3])?"/"+unitL(m[3]):""} = ${rs(r2(qty*rate))}`; }).join("\n");
  if(b.gst && b.taxable!=null){ s+=`\n\n${t("taxable")}: ${rs2(b.taxable)}`; if(b.tax!=null) s+=`\nGST${b.igst?" (IGST)":" (CGST+SGST)"}: ${rs2(b.tax)}`; s+=`\n*${t("grandTotal")}: ${rs(b.total)}*\n_${t("inWordsL")}: ${inWords(b.total)}_`; }
  else s+=`\n\n*${t("total")}: ${rs(b.total)}*`;
  return s;
}
function billProfit(b){
  if(b.cost!=null && b.profit!=null){ const sale=r2(+b.cost + +b.profit); return { cost:+b.cost, profit:+b.profit, sale, pct: +b.cost>0 ? Math.round(b.profit/b.cost*1000)/10 : null, est:false, per: (b.lines&&b.lines.length)?profitOf(b.lines).per:[] }; }
  const lines=(b.lines&&b.lines.length)?b.lines:linesFromItems(b); if(!lines.length) return null;
  const pf=profitOf(lines); if(!pf.known) return null; return { ...pf, est:true };
}
function profitBox(pf){
  if(!pf) return "";
  const neg=pf.profit<0;
  return `<div class="profitbox num">
    <div class="r"><span>${esc(t("profitL"))}</span><span class="big${neg?" neg":""}">${rs(pf.profit)}${pf.pct!=null?` · ${pf.pct}%`:""}</span></div>
    <div class="r"><span>${esc(t("saleExGst"))}</span><b>${rs(pf.sale)}</b></div>
    <div class="r"><span>${esc(t("costL"))}</span><b>${rs(pf.cost)}</b></div>
    ${pf.per&&pf.per.length?`<details><summary>${esc(t("perItem"))}</summary>${pf.per.map(x=>`<div class="pl"><span>${esc(x.name)}</span><span>${x.p==null?"—":rs(x.p)}</span></div>`).join("")}</details>`:""}
    ${pf.est?`<div class="note" style="font-size:12px">* ${esc(t("estNote"))}</div>`:""}
  </div>`;
}
function profitChip(pf){ if(!pf) return ""; return `<span class="profit${pf.profit<0?" neg":""}">${esc(t("profitShort",rs(pf.profit),pf.pct))}${pf.est?" *":""}</span>`; }
function billWa(text,mob){ const m=normMobile(mob); return (m?`https://wa.me/${m}`:"https://wa.me/")+"?text="+encodeURIComponent(text); }
let billsServer=false, billsCache=[], billsReq=0, billsDays={}, billsMonths={}, billsMore=false, billsAll=null;
const BL={q:"", year:"", date:"", f:"", col:{}};   // f: quick filter chip (gst | normal | due | cancelled | edited)
const BL_F=["gst","normal","due","cancelled","edited"];
/** Quick filter chips on Past bills. */
function blF(b){ switch(BL.f){ case "gst": return !!b.gst; case "normal": return !b.gst; case "due": return !b.cancelled && (+b.due||0)>0;
  case "cancelled": return !!b.cancelled; case "edited": return !!b.editedAt; default: return true; } }   // col: month/day groups you opened or closed            // past-bills filters, kept while you open a bill and come back
const calIcon=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`;
function dayKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function dayLabel(k){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(k)) return t("blNoDate");
  const now=new Date(), y=new Date(now); y.setDate(now.getDate()-1);
  if(k===dayKey(now)) return t("blToday"); if(k===dayKey(y)) return t("blYesterday");
  const d=new Date(+k.slice(0,4), +k.slice(5,7)-1, +k.slice(8));
  return d.toLocaleDateString(S.lang==="hi"?"hi-IN":"en-IN",{weekday:"short",day:"2-digit",month:"short",...(d.getFullYear()!==now.getFullYear()?{year:"numeric"}:{})});
}
function monthLabel(k){
  if(!/^\d{4}-\d{2}$/.test(k)) return t("blNoDate");
  return new Date(+k.slice(0,4), +k.slice(5,7)-1, 1).toLocaleDateString(S.lang==="hi"?"hi-IN":"en-IN",{month:"long",year:"numeric"});
}
function openBills(){
  if(!S.canWrite){ toast(t("billsNeedPin")); openUnlock(); return; }
  billBackFn=openBills;
  const body=`<div class="bl-bar" id="bl-bar">
      <input id="bl-q" type="search" placeholder="${esc(t("billsSearchPh"))}" autocomplete="off" value="${esc(BL.q)}">
      <div class="bl-chips">
        <label class="bl-chip${BL.year?" on":""}" id="bl-yc"><select id="bl-year" aria-label="${esc(t("blYear"))}"><option value="">${esc(t("blAllYears"))}</option>${BL.year?`<option value="${esc(BL.year)}" selected>${esc(BL.year)}</option>`:""}</select></label>
        <span class="bl-chip${BL.date?" on":""}" id="bl-dc">${calIcon}<span id="bl-dl">${esc(BL.date?dayLabel(BL.date):t("blDate"))}</span><input type="date" id="bl-date" aria-label="${esc(t("blDate"))}" value="${esc(BL.date)}"></span>
        <button type="button" class="bl-clear" id="bl-clr" aria-label="${esc(t("blClear"))}" ${BL.year||BL.date||BL.f?"":"hidden"}>✕</button>
        <span class="bl-fsep" aria-hidden="true"></span>${BL_F.map(k=>`<button type="button" class="bl-chip bl-f" data-blf="${k}" aria-pressed="${BL.f===k}">${esc(t("blf_"+k))}</button>`).join("")}
        <span class="bl-sync" id="bl-sync" hidden><span class="ld"></span>${esc(t("blSyncing"))}</span>
      </div>
    </div>
    <div class="bills-list" id="bl-list">${skelCards(5,true)}</div>`;
  sheetKey("bills"), openSheet(t("pastBills"), body, "", {full:true});
  let tm; $("#bl-q").addEventListener("input",e=>{ clearTimeout(tm); tm=setTimeout(()=>{ BL.q=e.target.value; loadBills(); },120); });
  const sync=()=>{ $("#bl-yc").classList.toggle("on",!!BL.year); $("#bl-dc").classList.toggle("on",!!BL.date); $("#bl-dl").textContent=BL.date?dayLabel(BL.date):t("blDate"); $("#bl-clr").hidden=!(BL.year||BL.date||BL.f);
    document.querySelectorAll("[data-blf]").forEach(b=>{ b.setAttribute("aria-pressed",String(BL.f===b.dataset.blf)); b.classList.toggle("on",BL.f===b.dataset.blf); }); };
  document.querySelectorAll("[data-blf]").forEach(b=>b.onclick=()=>{ BL.f = BL.f===b.dataset.blf ? "" : b.dataset.blf; sync(); loadBills(); });
  sync();
  $("#bl-year").onchange=e=>{ BL.year=e.target.value; if(BL.date && BL.date.slice(0,4)!==BL.year){ BL.date=""; $("#bl-date").value=""; } sync(); loadBills(); };
  $("#bl-date").onchange=e=>{ BL.date=e.target.value||""; sync(); loadBills(); };
  $("#bl-dc").onclick=e=>{ const inp=$("#bl-date"); if(e.target!==inp && inp.showPicker){ try{ inp.showPicker(); }catch{} } };
  $("#bl-clr").onclick=()=>{ BL.year=""; BL.date=""; BL.f=""; $("#bl-year").value=""; $("#bl-date").value=""; sync(); loadBills(); };
  $("#bl-list").addEventListener("click",e=>{ if(e.target.closest("#bl-more")){ loadBills(true); return; } if(e.target.closest("#bl-older")){ loadBillsServer(); return; }
    const g=e.target.closest("[data-tg]"); if(g){ const k=g.dataset.tg; BL.col[k]=!g.closest(".bl-grp").classList.contains("shut")?true:false; const st=$("#sheet-body").scrollTop; renderBills(); $("#sheet-body").scrollTop=st; return; } const c=e.target.closest("[data-bi]"); if(c) showBill(billsCache[+c.dataset.bi]); });
  loadBills();
}
function billFilter(){
  if(BL.date) return {from:BL.date, to:BL.date};
  if(BL.year) return {from:`${BL.year}-01-01`, to:`${BL.year}-12-31`};
  return {};
}
/* ---------------- Past bills: searched on the phone ----------------
 * The phone keeps a copy of the recent bills (up to 3000, IndexedDB, per test/real mode). Searching and the year/date
 * filters run on that copy, so results show as you type. The copy is refreshed in the background each time Past bills
 * opens, and right after any change to bills. Older bills beyond the copy can still be searched on the sheet. */
let BLC=null, blcLoading=null, blcLoadingEnv="", blcFreshAt=0;
const blcKey=()=>"bills:"+S.cfg.mode;
function blcDirty(){ blcFreshAt=0; }
/** A bill made on this phone shows in Past bills straight away, even before it reaches the sheet and even if Past bills was
 *  never opened. It's kept in a small list (rb_bloc_<mode>) until the phone's copy of bills includes it (or 30 min pass). */
const blocKey=env=>"rb_bloc_"+env;
function blocGet(env){ const a=ls.get(blocKey(env),[]); return Array.isArray(a)?a:[]; }
function blcAdd(rec){ try{ const env=rec.env||S.cfg.mode, now=new Date(), due=+rec.due||0, L=blocGet(env).filter(x=>x.id!==rec.id), prev=blocGet(env).find(x=>x.id===rec.id);
  const at=prev?new Date(prev.date):now;
  L.unshift({ n:rec.n, date:at.toISOString(), day:dayKey(at), customer:rec.customer, mobile:rec.mobile, total:rec.total, items:rec.items, by:byName(), gst:rec.gst,
    taxable:rec.gst?rec.taxable:null, tax:rec.gst?rec.tax:null, custGstin:rec.custGstin, igst:rec.igst, id:rec.id, row:0, editedAt:"", editedBy:"", edits:0, cost:rec.cost, profit:rec.profit,
    paidBy:rec.paidBy||"", pay:rec.pay==="credit"?"Credit":rec.pay==="part"?"Part paid":"Paid", paid:r2((+rec.total||0)-due), due, payments:[], clearedAt:"", fy:curFY(), cancelled:false, pos:rec.pos||"", po:rec.po||null, custAddr:rec.custAddr||"", text:rec.text, lines:rec.lines, _t:Date.now() });
  ls.set(blocKey(env), L.slice(0,60)); blcBump(); }catch{} }
/* Keep Past bills fresh in the background: after this phone sends bills or changes one, and when the 25-second check says
 * bills changed on another phone. Several quick bills are batched into one small "what changed" request. Only for phones
 * that already keep a copy (Past bills opened once); the copy downloads on first open otherwise. */
let blcT=0, blcWant="";
function blcSoon(ms,want){ blcWant=want||""; clearTimeout(blcT); blcT=setTimeout(blcBg, ms==null?1200:ms); }
async function blcBg(){
  if(!S.canWrite || document.hidden || !apiUrl() || navigator.onLine===false) return;
  if(flushing || S.billQ.length) return blcSoon(2500);           // wait until this phone's bills have reached the sheet
  const C=await blcGet(); if(!C) return;
  if(blcWant && C.brev===blcWant){ blcWant=""; return; }          // already up to date
  blcWant="";
  try{ const C2=await blcRefresh(); if(C2) blcShow(C2); }catch{}
}
/** Redraw Past bills (if open) from the copy, keeping the scroll position and flashing bills that just appeared. */
function blcShow(C){
  const l=$("#bl-list"); if(!l || billsServer) return;
  const had=new Set(billsCache.map(b=>b.id)), sc=$("#sheet-body"), st=sc?sc.scrollTop:0;
  renderLocalBills(C,true); if(sc) sc.scrollTop=st;
  if(had.size) l.querySelectorAll("[data-bid]").forEach(el=>{ if(!had.has(el.dataset.bid)) el.classList.add("bl-new"); });
}
/** Something on this phone changed the list (new bill, sent bill): redraw if Past bills is open. */
function blcBump(){ if(BLC && $("#bl-list") && !billsServer) blcShow(BLC); }
function blcSyncUi(on){ const e=$("#bl-sync"); if(e) e.hidden=!on; }
async function blcGet(){ if(BLC && BLC.env===S.cfg.mode) return BLC; const v=await idb.get("images",blcKey()); if(v && Array.isArray(v.bills) && v.env===S.cfg.mode) BLC=v; return BLC && BLC.env===S.cfg.mode ? BLC : null; }
function blcRefresh(){
  if(blcLoading && blcLoadingEnv!==S.cfg.mode) return blcLoading.catch(()=>{}).then(()=>blcRefresh());   // started before a test/real switch
  if(blcLoading) return blcLoading;
  const env=S.cfg.mode; blcLoadingEnv=env;
  const have=BLC && BLC.env===env ? BLC : null;
  blcSyncUi(true);
  blcLoading=(async()=>{ const j=await apiPost0({action:"listBills",q:"",limit:3000,full:true,tz:new Date().getTimezoneOffset(),brev:have&&have.brev||""});
      if(!j.full) return null;                                   // older Apps Script: no full copy, search on the sheet instead
      if(j.same && have){ have.at=Date.now(); if(env===S.cfg.mode) blcFreshAt=Date.now(); return have; }   // nothing changed on any phone: nothing downloaded
      if(j.delta && have){                                                 // only the bills that changed: swap them in, new ones on top
        const at=new Map(have.bills.map((x,i)=>[x.id,i])), fresh=[];
        (j.bills||[]).forEach(x=>{ if(x.id && at.has(x.id)) have.bills[at.get(x.id)]=x; else fresh.push(x); });
        have.bills=fresh.concat(have.bills); if(have.bills.length>3000){ have.bills.length=3000; have.more=true; }
        have.brev=j.brev||""; have.years=j.years||have.years; have.at=Date.now();
        if(env===S.cfg.mode){ BLC=have; blcFreshAt=Date.now(); } idb.set("images","bills:"+env,have); return have; }
      const C={env, at:Date.now(), brev:j.brev||"", bills:j.bills||[], more:!!j.more, years:j.years||[]};
      if(env===S.cfg.mode){ BLC=C; blcFreshAt=Date.now(); }
      idb.set("images","bills:"+env,C); return C; })().finally(()=>{ blcLoading=null; blcSyncUi(false); });
  return blcLoading;
}
function blcQuery(C){
  const ids=new Set(C.bills.map(b=>b.id)), pend=(S.billQ||[]).filter(q=>(q.env||"test")===C.env && !ids.has(q.id)).map(q=>{ const d=q.at?new Date(q.at):new Date(), due=+q.due||0;
    return { n:q.n, date:d.toISOString(), day:dayKey(d), customer:q.customer, mobile:q.mobile, total:q.total, items:q.items, gst:q.gst, custGstin:q.custGstin, igst:q.igst, id:q.id, row:0, edits:0,
      cost:q.cost, profit:q.profit, paidBy:q.paidBy||"", pay:q.pay==="credit"?"Credit":q.pay==="part"?"Part paid":"Paid", paid:r2((+q.total||0)-due), due, payments:[], fy:curFY(), cancelled:false, pos:q.pos||"", po:q.po||null, custAddr:q.custAddr||"", text:q.text, lines:q.lines, pending:true }; });
  const pids=new Set(pend.map(x=>x.id)), L0=blocGet(C.env), keep=L0.filter(x=>!ids.has(x.id) && Date.now()-(x._t||0)<30*60000);
  if(keep.length!==L0.length) ls.set(blocKey(C.env),keep);                 // the copy has them now (or they're old): drop
  const loc=keep.filter(x=>!pids.has(x.id)).map(x=>({...x, pending:(S.billQ||[]).some(q=>q.id===x.id)}));
  const top=pend.reverse().concat(loc).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const src=top.length ? top.concat(C.bills) : C.bills;
  const needle=BL.q.trim().toLowerCase(), digits=needle.replace(/\D/g,""), f=billFilter();
  const days={}, months={}, all={count:0,total:0}, out=[];
  for(const b of src){ const k=b.day||"unknown";
    if((f.from && (k==="unknown"||k<f.from)) || (f.to && (k==="unknown"||k>f.to))) continue;
    if(BL.f && !blF(b)) continue;
    if(needle){ const ds=k!=="unknown"?`${k.slice(8)}/${k.slice(5,7)}/${k.slice(0,4)} ${k.slice(8)}-${k.slice(5,7)}-${k.slice(0,4)}`:"";
      const hay=[b.n,dispNo(b.n,b.gst,b.fy),b.customer,b.mobile,b.custGstin,b.items,ds].join(" ").toLowerCase(), mob=String(b.mobile||"").replace(/\D/g,"");
      if(!(hay.includes(needle) || String(b.n)===needle || (digits.length>=4 && mob.includes(digits)))) continue; }
    if(!b.cancelled){ const t2=+b.total||0, mk=k.slice(0,7);
      (days[k]=days[k]||{count:0,total:0}); days[k].count++; days[k].total=r2(days[k].total+t2);
      (months[mk]=months[mk]||{count:0,total:0}); months[mk].count++; months[mk].total=r2(months[mk].total+t2);
      all.count++; all.total=r2(all.total+t2); all.due=r2((all.due||0)+(+b.due||0)); }
    out.push(b); }
  return {out,days,months,all};
}
function renderLocalBills(C,keep){
  if(!$("#bl-list")) return;
  const r=blcQuery(C);
  billsCache=r.out.slice(0,BL.shown||60); billsDays=r.days; billsMonths=r.months; billsAll=r.all;
  billsMore=r.out.length>billsCache.length; billsServer=false;
  if(!keep) BL.col={};
  const ys=C.years||[], sel=$("#bl-year");
  if(sel) sel.innerHTML=`<option value="">${esc(t("blAllYears"))}</option>`+[...new Set(BL.year?[BL.year,...ys]:ys)].sort().reverse().map(y=>`<option value="${esc(y)}"${y===BL.year?" selected":""}>${esc(y)}</option>`).join("");
  renderBills();
  if(C.more && BL.q.trim()){ const l=$("#bl-list"); if(l) l.insertAdjacentHTML("beforeend",`<button type="button" class="btn ghost" id="bl-older">${esc(t("blOlder"))}</button>`); }
}
async function loadBills(more){
  const list=$("#bl-list"); if(!list) return;
  if(billsServer && more) return loadBillsServer(true);
  BL.shown = more ? (BL.shown||60)+60 : 60;
  const C=await blcGet();
  if(C){ renderLocalBills(C,more);
    if(!more){ blcSyncUi(true); blcRefresh().then(C2=>{ if(C2) blcShow(C2); }).catch(()=>{}).finally(()=>blcSyncUi(!!blcLoading)); }
    return; }
  list.innerHTML=skelCards(5,true);
  try{ const C2=await blcRefresh(); if(!$("#bl-list")) return; if(C2) renderLocalBills(C2); else return loadBillsServer(more); }
  catch(e){ if($("#bl-list")) $("#bl-list").innerHTML=`<p class="err">${esc(e&&e.code==="bad_pin"?t("wrongPin"):t("billsFail"))}</p>`; }
}
async function loadBillsServer(more){
  const my=++billsReq, list=$("#bl-list"); if(!list) return;
  if(more) btnBusy($("#bl-more"),true);
  else list.innerHTML=skelCards(5,true);
  try{
    const req={action:"listBills",q:BL.q,limit:60,tz:new Date().getTimezoneOffset(),...billFilter()};
    if(more && billsCache.length) req.before=billsCache[billsCache.length-1].row;
    const j=await apiPost(req); if(my!==billsReq || !$("#bl-list")) return;
    const got=(j.bills||[]).filter(blF);
    billsCache = more ? billsCache.concat(got) : got;
    billsDays = more ? {...billsDays, ...(j.days||{})} : (j.days||{});
    billsMonths = more ? {...billsMonths, ...(j.months||{})} : (j.months||{});
    if(!more) BL.col={};
    billsMore = !!j.more; billsAll = j.all||null; billsServer = true;
    const ys=j.years||[], sel=$("#bl-year");
    if(sel) sel.innerHTML=`<option value="">${esc(t("blAllYears"))}</option>`+[...new Set(BL.year?[BL.year,...ys]:ys)].sort().reverse().map(y=>`<option value="${esc(y)}"${y===BL.year?" selected":""}>${esc(y)}</option>`).join("");
    renderBills();
  }catch(e){ if(my===billsReq && $("#bl-list")) $("#bl-list").innerHTML=`<p class="err">${esc(e&&e.code==="bad_pin"?t("wrongPin"):t("billsFail"))}</p>`; }
}
function renderBills(){
  const list=$("#bl-list"); if(!list) return;
  const showP=S.cfg.showProfit, filtered=!!(BL.q.trim()||(BL.year&&!BL.date)||BL.f);
  let head="";
  if(billsCache.length && filtered){
    const cnt=billsAll?billsAll.count:billsCache.length, tot=billsAll?billsAll.total:billsCache.reduce((a,b)=>a+(+b.total||0),0);
    let pSum=0, cSum=0; if(showP) billsCache.forEach(b=>{ const pf=billProfit(b); if(pf){ pSum+=pf.profit; cSum+=pf.cost; } });
    head=`<div class="bl-sum">${esc(t("blSummary",cnt,rs(tot)))}${BL.f==="due"&&billsAll&&billsAll.due?` · <b class="due">${esc(t("dueAmt",rs(billsAll.due)))}</b>`:""}${showP&&!billsMore?` · ${profitChip({profit:r2(pSum),pct:cSum>0?Math.round(pSum/cSum*1000)/10:null})}`:""}</div>`;
  }
  if(!billsCache.length){ list.innerHTML=`<p class="note">${esc(t("billsNone"))}</p>`; return; }
  // group: month → day → bills. Older months start closed (unless searching/filtering); tap a header to open or close it.
  const chev=`<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
  const anyFilter=!!(BL.q.trim()||BL.year||BL.date||BL.f);
  const months=[]; const byM={};
  billsCache.forEach((b,i)=>{ const d=b.date?new Date(b.date):null, k=b.day||(d?dayKey(d):"unknown"), m=k==="unknown"?"unknown":k.slice(0,7);
    if(!byM[m]){ byM[m]={days:[],byD:{}}; months.push(m); }
    const M=byM[m]; if(!M.byD[k]){ M.byD[k]=[]; M.days.push(k); } M.byD[k].push(i); });
  let html=head;
  months.forEach((m,mi)=>{
    const mt=billsMonths[m]||{count:0,total:0}, mShut = m in BL.col ? BL.col[m] : (!anyFilter && mi>0);
    html+=`<section class="bl-grp bl-month${mShut?" shut":""}"><button type="button" class="bl-mh" data-tg="${esc(m)}" aria-expanded="${!mShut}">${chev}<span class="bl-ml">${esc(monthLabel(m))}</span><span class="num">${esc(t("blSummary",mt.count,rs(mt.total)))}</span></button><div class="bl-gb">`;
    byM[m].days.forEach(k=>{
      const dd=billsDays[k]||{count:0,total:0}, dShut = !!BL.col[k];
      html+=`<div class="bl-grp bl-dgrp${dShut?" shut":""}"><button type="button" class="bl-day" data-tg="${esc(k)}" aria-expanded="${!dShut}">${chev}<span class="bl-ml">${esc(dayLabel(k))}</span><span class="num">${esc(t("blSummary",dd.count,rs(dd.total)))}</span></button><div class="bl-gb">`;
      byM[m].byD[k].forEach(i=>{ const b=billsCache[i], d=b.date?new Date(b.date):null;
        html+=`<button type="button" class="billcard${b.cancelled?" cancelled":""}" data-bi="${i}" data-bid="${esc(b.id||"")}"><b>${b.gst?"GST ":""}${esc(t("billNoL"))} ${esc(dispNo(b.n,b.gst,b.fy))}${b.customer?` · ${esc(b.customer)}`:""}</b><span class="amt num">${rs(b.total)}</span>
        <span class="meta2">${d?esc(d.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})):""}${b.mobile?` · ${esc(b.mobile)}`:""}${b.gst?` <span class="pill gst">${esc(t("gstShort"))}</span>`:""}${b.editedAt?` <span class="pill edited">${esc(t("editedPill"))}</span>`:""}${b.cancelled?` <span class="pill cancel">${esc(t("cancelledPill"))}</span>`:payPill(b)}${b.paidBy&&pmLabel(String(b.paidBy).toLowerCase())?` <span class="pill pmp">${esc(pmLabel(String(b.paidBy).toLowerCase()))}</span>`:""}${b.by?` · ${esc(t("madeBy",b.by))}`:""}${showP&&billProfit(b)?` · ${profitChip(billProfit(b))}`:""}</span></button>`; });
      html+=`</div></div>`;
    });
    html+=`</div></section>`;
  });
  if(billsMore) html+=`<button type="button" class="btn ghost" id="bl-more">${esc(t("blMore"))}</button>`;
  list.innerHTML=html;
  const bar=$("#bl-bar"); if(bar) list.style.setProperty("--blh",(bar.offsetHeight-4)+"px");
}
/** Bills saved before line details were kept: rebuild lines from the "Name 2 kg x 46" summary when possible. */
function linesFromItems(b){
  const out=[]; for(const part of String(b.items||"").split("; ")){ const m=part.match(/^(.*) ([\d.]+) (\S+) x ([\d.]+)/); if(!m) return [];
    const it=findDup(m[1].trim()); out.push({id:it?it.id:"", name:m[1].trim(), unit:m[3], rate:+m[4], qty:+m[2], hsn:it?itemHsn(it):undefined, gst:it?itemGst(it):undefined}); }
  return out;
}
async function showBill(b){
  if(!b) return;
  if(b.row && (b.text===undefined || Date.now()-(b._at||0)>30000)){   // read the sheet's latest copy (other phones may have changed it)
    sheetKey("bill:"+(b.id||b.n)), openSheet(`${t("billNoL")} ${dispNo(b.n,b.gst,b.fy)}`, ldBlock(t("billOpening")), "", {full:true});
    try{ const j=await apiPost({action:"getBill",row:b.row,id:b.id,n:b.n}); const g=j.bill||{}; b.text=g.text||""; b.lines=g.lines||[]; b._at=Date.now();
      ["edits","fy","igst","custGstin","custAddr","pos","po","total","items","cancelled","cancelReason","cancelledBy","cancelledAt","editedAt","editedBy","pay","paid","due","payments","clearedAt"].forEach(k=>{ if(g[k]!==undefined) b[k]=g[k]; });   // always the sheet's latest: payments, cancel and edits made on other phones   // the saved values, so an edit keeps GST details and knows the edit count
      if(g.gst!==undefined) b.gst=g.gst; if(!b.customer && g.customer) b.customer=g.customer; if(!b.mobile && g.mobile) b.mobile=g.mobile; }
    catch(e){ $("#sheet-body").innerHTML=`<p class="err">${esc(t("billsFail"))}</p><button class="btn ghost" id="bd-back2">← ${esc(t("back"))}</button>`; $("#bd-back2").onclick=()=>billBack(); return; }
  }
  if((!b.lines||!b.lines.length) && b.items) b.lines=linesFromItems(b);
  const text=(b.cancelled?t("cancelledText")+"\n":"")+(b.text||oldBillText(b))+payUpdateText(b);
  const body=`<div style="display:grid;gap:12px">
    <div><button type="button" class="btn ghost" id="bd-back">← ${esc(t("back"))}</button></div>
    ${b.cancelled?`<div class="cancelnote">${esc(t("cancelledInfo",b.cancelledAt?fmtDT(b.cancelledAt):"",b.cancelledBy,b.cancelReason))}</div>`:""}
    ${b.editedAt?`<div class="editnote">${esc(t("editedInfo",fmtDT(b.editedAt),b.editedBy,b.edits))}</div>`:""}
    ${b.cancelled?"":payBoxHTML(b)}
    <pre class="billtext" id="bd-text">${esc(text)}</pre>
    ${S.cfg.showProfit?profitBox(billProfit(b)):""}
    <div class="sendrow"><div class="field"><label for="bd-mob">${esc(t("sendTo"))}</label><input id="bd-mob" type="tel" inputmode="tel" value="${esc(b.mobile||"")}" maxlength="20"></div>
      <a class="btn wa" id="bd-wa" target="_blank" rel="noopener">WhatsApp</a></div>
    <span class="err" id="bd-err"></span>
    <div class="row-btns" style="justify-content:flex-start"><button type="button" class="btn ghost" id="bd-copy">${esc(t("copy"))}</button><button type="button" class="btn ghost" id="bd-pdf">${esc(t("pdfBtn"))}</button><button type="button" class="btn ghost" id="bd-print">${esc(t("printBtn"))}</button>${(b.lines&&b.lines.length)?`<button type="button" class="btn primary" id="bd-edit">${esc(t("editBill"))}</button><button type="button" class="btn ghost" id="bd-repeat">${esc(t("repeatBill"))}</button>`:""}</div>
    ${(b.lines&&b.lines.length)?"":`<p class="note" style="margin:0">${esc(t("oldNoEdit"))}</p>`}
    ${can("manager")?(b.cancelled?`<div><button type="button" class="btn ghost" id="bd-restore">${esc(t("restoreBill"))}</button></div>`:`<div><button type="button" class="btn danger" id="bd-cancel">${esc(t("cancelBill"))}</button></div>
      <div class="confirm" id="bd-cq" hidden><b>${esc(t("cancelQ"))}</b><div class="chips" id="bd-cr"><button type="button">${esc(t("cancelR1"))}</button><button type="button">${esc(t("cancelR2"))}</button><button type="button">${esc(t("cancelR3"))}</button></div>
        <input id="bd-reason" placeholder="${esc(t("cancelReasonPh"))}" maxlength="120" style="border:0;background:var(--surface);border-radius:var(--r-md);padding:10px 12px">
        <div class="row-btns" style="justify-content:flex-start"><button type="button" class="btn danger" id="bd-cy">${esc(t("cancelYes"))}</button><button type="button" class="btn ghost" id="bd-cn">${esc(t("cancel"))}</button></div></div>`):""}
    <div class="confirm" id="bd-rq" hidden><span>${esc(t("repeatQ"))}</span><div class="row-btns" style="justify-content:flex-start"><button type="button" class="btn primary" id="bd-ry">${esc(t("repeatBill"))}</button><button type="button" class="btn ghost" id="bd-rn">${esc(t("cancel"))}</button></div></div>
  </div>`;
  sheetKey("bill:"+(b.id||b.n)), openSheet(`${b.gst?"GST ":""}${t("billNoL")} ${dispNo(b.n,b.gst,b.fy)}`, body, "", {full:true});
  const upd=()=>{ const m=$("#bd-mob").value; const bad=normMobile(m)===null; $("#bd-err").textContent=bad?t("mobBad"):""; $("#bd-wa").href=billWa(text,bad?"":m); };
  $("#bd-mob").addEventListener("input",upd); upd();
  $("#bd-wa").addEventListener("click",e=>{ if(normMobile($("#bd-mob").value)===null){ e.preventDefault(); $("#bd-mob").focus(); } });
  $("#bd-back").onclick=()=>billBack();
  $("#bd-pdf").onclick=()=>pdfFor(invFromBill(b), $("#bd-pdf"));
  $("#bd-print").onclick=()=>printInv(invFromBill(b), $("#bd-print"));
  if(b.cancelled){ ["#bd-edit"].forEach(k=>{ const el=$(k); if(el) el.remove(); }); }
  if($("#bd-cancel")){ $("#bd-cancel").onclick=()=>{ $("#bd-cq").hidden=false; $("#bd-cancel").hidden=true; setTimeout(()=>$("#bd-cq").scrollIntoView({block:"center",behavior:"smooth"}),30); };
    $("#bd-cn").onclick=()=>{ $("#bd-cq").hidden=true; $("#bd-cancel").hidden=false; };
    $("#bd-cr").onclick=e=>{ const c=e.target.closest("button"); if(c) $("#bd-reason").value=c.textContent; };
    $("#bd-cy").onclick=async()=>{ const reason=$("#bd-reason").value.trim(); if(!reason){ toast(t("needReason")); $("#bd-reason").focus(); return; } const btn=$("#bd-cy"); btnBusy(btn,true);
      try{ await apiPost({action:"cancelBill",id:b.id,row:b.row,n:b.n,reason}); toast(t("cancelDone",dispNo(b.n,b.gst,b.fy))); Object.assign(b,{cancelled:true,cancelReason:reason,cancelledBy:byName(),cancelledAt:new Date().toISOString()}); duesDirty=true; showBill(b); }
      catch(er){ btnBusy(btn,false); toast(errMsg(er)); } }; }
  if($("#bd-restore")) $("#bd-restore").onclick=async()=>{ const btn=$("#bd-restore"); btnBusy(btn,true);
    try{ await apiPost({action:"restoreBill",id:b.id,row:b.row,n:b.n}); toast(t("restoreDone",dispNo(b.n,b.gst,b.fy))); Object.assign(b,{cancelled:false,cancelReason:"",cancelledBy:"",cancelledAt:""}); duesDirty=true; showBill(b); }
    catch(er){ btnBusy(btn,false); toast(errMsg(er)); } };
  if($("#pb-rec")) $("#pb-rec").onclick=()=>openRecordPay({ name:b.customer, mobile:b.mobile, bill:b, due:+b.due||0, bills:[b] });
  if($("#pb-undo")) $("#pb-undo").onclick=async()=>{ const btn=$("#pb-undo"); btnBusy(btn,true);
    try{ const r=await apiPost({action:"undoPayment",billId:b.id,row:b.row,n:b.n}); toast(t("undoDone",rs(r.removed))); Object.assign(b,{pay:r.pay,paid:r.paid,due:r.due}); b.payments=(b.payments||[]).slice(); for(let x=b.payments.length-1;x>=0;x--) if(!b.payments[x].at){ b.payments.splice(x,1); break; } duesDirty=true; showBill(b); }
    catch(e){ btnBusy(btn,false); toast(errMsg(e)); } };
  $("#bd-copy").onclick=async()=>{ try{ await navigator.clipboard.writeText(text); toast(t("copied")); }catch{ const r=document.createRange(); r.selectNodeContents($("#bd-text")); const sel=getSelection(); sel.removeAllRanges(); sel.addRange(r); toast(t("copyFail")); } };
  const doRepeat=()=>{ if(S.editing){ S.editing=null; ls.set("rb_editing",null); ls.set("rb_stash",null); } S.bill=b.lines.map(l=>({id:l.id,name:l.name,nameHi:l.nameHi,unit:l.unit,rate:+l.rate||0,qty:+l.qty||1,hsn:l.hsn,gst:l.gst,alt:!!l.alt,buy:l.buy}));
    S.cust=b.customer||""; S.mob=b.mobile||""; S.gst=!!b.gst; S.igst=!!b.igst; S.custGstin=b.custGstin||""; caddrSet(b.custAddr||""); S.billNoOvr=null; poSet(null); S.poOpen=false;   // a repeat is a new order: no PO carried over
    ls.set("rb_cust",S.cust); ls.set("rb_mob",S.mob); ls.set("rb_gst",S.gst); ls.set("rb_igst",S.igst); ls.set("rb_cgstin",S.custGstin); ls.set("rb_billno",null);
    $("#cust").value=S.cust; $("#cust-mob").value=S.mob; $("#cust-gstin").value=S.custGstin;
    saveBill(); closeSheet(); setTab("bill"); toast(t("repeated")); };
  if($("#bd-edit")) $("#bd-edit").onclick=()=>startEdit(b);
  if($("#bd-repeat")){ $("#bd-repeat").onclick=()=>{ if(S.bill.length) $("#bd-rq").hidden=false; else doRepeat(); }; $("#bd-ry").onclick=doRepeat; $("#bd-rn").onclick=()=>{ $("#bd-rq").hidden=true; }; }
}

function billBack(){ (billBackFn||openBills)(); }

function payPill(b){ if(b.pay==="Credit"||b.pay==="Part paid") return ` <span class="pill due">${esc(t("pillDue",rs(b.due)))}</span>`; if(b.pay==="Cleared") return ` <span class="pill cleared">${esc(t("pillCleared"))}</span>`; return ""; }
function payUpdateText(b){ const later=(b.payments||[]).filter(p=>!p.at); if(!later.length) return "";
  const last=later[later.length-1]; const d=fmtDate(last.d);
  return "\n\n"+(b.pay==="Cleared" ? t("payUpdateDone",d) : t("payUpdate",d,rs(b.paid),rs(b.due))); }
function payBoxHTML(b){
  if(!b.pay || b.pay==="Paid") return "";
  const hist=(b.payments||[]).map(p=>`<div><span>${esc(fmtDate(p.d))}${p.at?` · ${esc(t("atBilling"))}`:""}${p.by?` · ${esc(p.by)}`:""}${p.note?` · ${esc(p.note)}`:""}</span><b class="num">${rs(p.a)}</b></div>`).join("");
  const canUndo=(b.payments||[]).some(p=>!p.at);
  return `<div class="paybox"><div style="display:flex;align-items:center;gap:8px"><b>${esc(t("payL"))}</b>${payPill(b)}${b.pay==="Cleared"&&b.clearedAt?`<span class="note" style="margin:0">${esc(t("clearedOn",fmtDate(b.clearedAt)))}</span>`:""}</div>
    <div class="kv3"><div><span>${esc(t("total"))}</span><b class="num">${rs(b.total)}</b></div><div><span>${esc(t("waPaid"))}</span><b class="num">${rs(b.paid)}</b></div><div><span>${esc(t("dueL"))}</span><b class="num d">${rs(b.due)}</b></div></div>
    ${hist?`<div class="payhist"><b style="font-size:13px;color:var(--muted)">${esc(t("payHist"))}</b>${hist}</div>`:""}
    <div class="row-btns" style="justify-content:flex-start">${b.due>0?`<button type="button" class="btn primary" id="pb-rec">${esc(t("recordPay"))}</button>`:""}${canUndo?`<button type="button" class="btn ghost" id="pb-undo">${esc(t("undoPay"))}</button>`:""}</div></div>`;
}
