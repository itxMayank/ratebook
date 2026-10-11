/* Rate Book: Reports (Tools → Reports, managers and owner). Split out of app.js on 11 Oct 2026. A plain script in global
   scope, loaded before app.js: while loading it only declares things, so it needs nothing from app.js until a report is
   opened. Its functions use app.js helpers ($, S, t, apiPost, openSheet, fmtN…) only when called. app.js clears RPC (the
   kept reports) on a test/real switch. Run  node tools/stamp.js  after editing. */
"use strict";
/* ---------------- Reports ---------------- */
const isoDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
function rpRange(k){
  const now=new Date(), d=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const fyStart=y=>new Date(y,3,1), fyy=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;
  if(k==="today") return [isoDay(d),isoDay(d)];
  if(k==="yest"){ const y=new Date(d); y.setDate(d.getDate()-1); return [isoDay(y),isoDay(y)]; }
  if(k==="week"){ const s=new Date(d); s.setDate(d.getDate()-((d.getDay()+6)%7)); return [isoDay(s),isoDay(d)]; }
  if(k==="month") return [isoDay(new Date(d.getFullYear(),d.getMonth(),1)),isoDay(d)];
  if(k==="lastMonth") return [isoDay(new Date(d.getFullYear(),d.getMonth()-1,1)),isoDay(new Date(d.getFullYear(),d.getMonth(),0))];
  if(k==="fy") return [isoDay(fyStart(fyy)),isoDay(d)];
  if(k==="lastFy") return [isoDay(fyStart(fyy-1)),isoDay(new Date(fyy,2,31))];
  return null;
}
let RP={k:"today",from:"",to:"",data:null,allItems:false,open:"",seq:0,hl:""};
function openReports(){
  if(!can("manager")){ toast(t("notAllowed")); return; }
  RP.k="today"; RP.open=""; RP.allItems=false;   // always opens on Today
  const chips=[["today","rpToday"],["yest","rpYest"],["week","rpWeek"],["month","rpMonth"],["lastMonth","rpLastMonth"],["fy","rpFy"],["lastFy","rpLastFy"],["custom","rpCustom"]];
  sheetKey("reports"), openSheet(t("repT"), `<div class="rp">
    <div class="fchips" id="rp-chips">${chips.map(([k,l])=>`<button type="button" class="fchip" data-rp="${k}" aria-pressed="${RP.k===k}">${esc(t(l))}</button>`).join("")}</div>
    <div class="rp-custom" id="rp-custom" ${RP.k==="custom"?"":"hidden"}><label>${esc(t("rpFrom"))} <input type="date" id="rp-from"></label><label>${esc(t("rpTo"))} <input type="date" id="rp-to"></label><button type="button" class="btn primary sm" id="rp-go">${esc(t("rpShow"))}</button></div>
    <div class="rph" id="rp-hero"></div>
    <div id="rp-body"></div></div>`, "", {full:true});
  rpHeroInit();
  $("#rp-chips").onclick=e=>{ const b=e.target.closest("[data-rp]"); if(!b) return; RP.k=b.dataset.rp; $("#rp-chips").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); $("#rp-custom").hidden=RP.k!=="custom"; if(RP.k!=="custom") loadReport(); };
  const r0=rpRange("month"); $("#rp-from").value=RP.from||r0[0]; $("#rp-to").value=RP.to||r0[1];
  $("#rp-go").onclick=()=>loadReport();
  RP.data=null; loadReport().then(rpPrefetch);
}
/* Reports for a period are kept on the phone for a short while, so switching between periods animates at once.
   Money must be current: a copy older than RPC_FRESH is shown and immediately re-read; the card then moves to the fresh figures.
   Keyed by test/real mode as well, so one mode's figures never show in the other. */
const RPC={}, RPC_FRESH=20000;
const rpK=(from,to)=>(S.cfg.mode||"")+"|"+from+"_"+to, rpKey=()=>rpK(RP.from,RP.to);
async function rpFetch(from,to,quiet){ const k=rpK(from,to), body={action:"report",from,to,tz:new Date().getTimezoneOffset()};
  const j = await (quiet ? apiPost0(body) : apiPost(body)); if(!j || j.ok===false) throw j||{}; RPC[k]={r:j.report,at:Date.now()};
  if(k!==rpK(from,to)) throw {code:"mode_changed"}; return j.report; }
async function loadReport(){
  const box=$("#rp-body"); if(!box) return;
  const rg = RP.k==="custom" ? [$("#rp-from").value,$("#rp-to").value] : rpRange(RP.k);
  RP.from=rg[0]; RP.to=rg[1]; RP.hl=""; const seq=++RP.seq, c=RPC[rpKey()];
  if(c){ RP.data=c.r; RP.allItems=false; renderReport(); if(Date.now()-c.at<RPC_FRESH) return; }
  else if(!RP.data) box.innerHTML=skelCards(3,true);
  rpBusy(true);
  try{ const r=await rpFetch(RP.from,RP.to); if(seq!==RP.seq || !$("#rp-body")) return; RP.data=r; if(!c) RP.allItems=false; renderReport(); }
  catch(e){ if(seq===RP.seq && !c && $("#rp-body")) $("#rp-body").innerHTML=`<p class="err">${esc(errMsg(e))}</p>`; }
  finally{ if(seq===RP.seq) rpBusy(false); }
}
/** After the first period shows: quietly load the other common periods, one at a time, while Reports stays open. */
async function rpPrefetch(){ for(const k of ["week","month","yest","lastMonth"]){ if(!$("#rp-body")) return; const rg=rpRange(k), c=RPC[rpK(rg[0],rg[1])];
  if(c && Date.now()-c.at<RPC_FRESH) continue; try{ await rpFetch(rg[0],rg[1],true); }catch{ return; } } }
function rpBusy(on){ const h=$("#rp-hero"); if(h) h.classList.toggle("busy",!!on); }

/* ---- Summary card ---- */
const rmo=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Roll a number to its new value (ease-out, ~0.65 s). The value is kept on the element, so the next change starts from it. */
function tweenNum(el,to,fmt,ms){ if(!el) return; to=+to||0; const from=el.dataset.v===undefined?to:+el.dataset.v; el.dataset.v=to; cancelAnimationFrame(el._raf);
  if(rmo()||from===to||document.hidden){ el.textContent=fmt(to); return; }
  const t0=performance.now(), d=ms||650, ease=x=>1-Math.pow(1-x,3);
  const step=now=>{ const p=Math.min(1,(now-t0)/d); el.textContent=fmt(p<1?from+(to-from)*ease(p):to); if(p<1) el._raf=requestAnimationFrame(step); };
  el._raf=requestAnimationFrame(step); }
const rsR=v=>rs(Math.round(v)), pcR=v=>Math.round(v)+"%", nR=v=>String(Math.round(v));
const RPO=[1,.7,.48,.32,.2,.12];   // shades of the theme colour for the split: darkest = biggest
/** Sales split by item group (from the price list's groups), top 4 + Other; by top items if the shop uses no groups.
    Uses the bill-line amounts (before GST), so the split matches what was sold. */
function rpSplit(R){
  const items=R.items||[], grp=new Map(); let anyCat=false;
  S.items.forEach(it=>{ if(it.cat) anyCat=true; grp.set(String(it.name||"").trim().toLowerCase(), it.cat||""); });
  let rows;
  if(anyCat){ const m=new Map(); items.forEach(i=>{ const c=grp.get(String(i.name).trim().toLowerCase())||""; m.set(c,(m.get(c)||0)+i.amount); });
    rows=[...m].map(([c,v])=>({k:"g:"+c, n:c||t("rpNoGroup"), v})); }
  else rows=items.map(i=>({k:"i:"+i.name+"|"+i.unit, n:i.name, v:i.amount}));
  rows=rows.filter(r=>r.v>0).sort((a,b)=>b.v-a.v);
  const known=rows.reduce((x,r)=>x+r.v,0), all=R.totals.lineSale!=null?Math.max(R.totals.lineSale,known):known;
  const top=rows.slice(0,4), rest=rows.slice(4).reduce((x,r)=>x+r.v,0)+(all-known);
  if(rest>0.5) top.push({k:"~other", n:t("rpOther"), v:rest});
  const sum=top.reduce((x,r)=>x+r.v,0)||1; top.forEach((r,i)=>{ r.p=r.v/sum*100; r.o=RPO[Math.min(i,RPO.length-1)]; });
  return {rows:top, by:anyCat?"group":"item"};
}
/** Every day of the period (empty days as 0); by month when the period is longer than ~2 months. */
function rpPts(days){
  let pts=(days||[]).map(d=>({k:d.d,v:d.sales,b:d.bills}));
  if(RP.from && RP.to){ const a=new Date(RP.from+"T00:00:00"), z=new Date(RP.to+"T00:00:00"), n=Math.round((z-a)/864e5)+1;
    if(n>=1 && n<=62){ const m={}; pts.forEach(p=>m[p.k]=p); pts=[]; for(let i=0;i<n;i++){ const d=new Date(a); d.setDate(a.getDate()+i); const k=isoDay(d); pts.push(m[k]||{k,v:0,b:0}); } } }
  if(pts.length>62){ const m={}; pts.forEach(p=>{ const k=p.k.slice(0,7); m[k]=m[k]||{k,v:0,b:0}; m[k].v+=p.v; m[k].b+=p.b; }); pts=Object.keys(m).sort().map(k=>m[k]); }
  return pts;
}
const rpDayL=(k,long)=>k.length===7?new Date(+k.slice(0,4),+k.slice(5)-1,1).toLocaleDateString(S.lang==="hi"?"hi-IN":"en-IN",{month:"short",year:long?"numeric":undefined})
  :new Date(k+"T00:00:00").toLocaleDateString(S.lang==="hi"?"hi-IN":"en-IN",{day:"numeric",month:"short"});
function rpHeroInit(){ const h=$("#rp-hero"); if(!h) return;
  h.innerHTML=`<div class="rph-top"><span class="rph-per" id="rph-per"></span><span class="ld rph-spin"></span></div>
    <div class="rph-main">
      <div><div class="rph-big" id="rph-sales">₹0</div><div class="rph-sub"><b id="rph-bills">0</b> ${esc(t("rpBillsW"))} · ${esc(t("rpAvgW"))} <b id="rph-avg">₹0</b></div></div>
      <p class="rph-empty" id="rph-empty" hidden>${esc(t("rpNone"))}</p>
      <div id="rph-splitw"><div class="rph-lbl" style="margin-bottom:8px"><span id="rph-by"></span><span id="rph-gstn"></span></div><div class="rph-bar" id="rph-bar"></div><div class="rph-rows" id="rph-rows" style="margin-top:6px"></div></div>
      <div><div class="rph-lbl"><span id="rph-perday"></span><span id="rph-avgday"></span></div><div class="rph-days" id="rph-days"></div><div class="rph-axis"><span id="rph-a0"></span><span id="rph-a1"></span></div></div>
      <div class="rph-meters">
        <div class="rph-m"><span>${esc(t("rpRecv"))}</span><b id="rph-recv">₹0</b><i id="rph-recvp"></i></div>
        <div class="rph-m"><span>${esc(t("rpCredit"))}</span><b id="rph-cred">₹0</b><i id="rph-credp"></i></div>
        <div class="rph-m warn" title="${esc(t("rpOut"))}"><span>${esc(t("rpOutS"))}</span><b id="rph-out">₹0</b><i id="rph-outp"></i></div>
      </div>
      <div class="rph-modes" id="rph-modes" hidden></div>
    </div><div class="rph-tip" id="rph-tip"></div>`;
  // tap (phones) or point (laptop) at a part of the split or a day → highlight it and show its numbers
  const pick=(el,tog)=>{ const k=el?el.dataset.k||el.dataset.dk:""; RP.hl = tog && RP.hl===k ? "" : k; rpHl(); };
  h.addEventListener("click",e=>{ const el=e.target.closest("[data-k],[data-dk]"); pick(el, e.pointerType!=="mouse"); });   // a tap toggles; a mouse click keeps what pointing showed
  h.addEventListener("pointerover",e=>{ if(e.pointerType!=="mouse") return; const el=e.target.closest("[data-k],[data-dk]"); if(el) pick(el,"hover"); });
  h.addEventListener("pointerleave",e=>{ if(e.pointerType==="mouse"){ RP.hl=""; rpHl(); } });
}
function rpHl(){ const h=$("#rp-hero"), tip=$("#rph-tip"); if(!h||!tip) return; const k=RP.hl;
  const isDay=k && k.startsWith("d:");
  h.classList.toggle("hl", !!k && !isDay);
  h.querySelectorAll("[data-k]").forEach(el=>el.classList.toggle("on", el.dataset.k===k));
  h.querySelectorAll("[data-dk]").forEach(el=>el.classList.toggle("on", el.dataset.dk===k));
  const target = k ? (isDay ? h.querySelector(`[data-dk="${CSS.escape(k)}"]`) : h.querySelector(`.rph-seg[data-k="${CSS.escape(k)}"]`)) : null;
  if(!target || !RP.data){ tip.classList.remove("show"); return; }
  const hr=h.getBoundingClientRect(), r=target.getBoundingClientRect();
  if(isDay){ const p=(RP.pts||[]).find(x=>"d:"+x.k===k); if(!p){ tip.classList.remove("show"); return; } tip.textContent=`${rpDayL(p.k,true)} · ${rs(Math.round(p.v))} · ${t("rpBillsN",p.b)}`; }
  else { const s=(RP.split||[]).find(x=>x.k===k); if(!s){ tip.classList.remove("show"); return; } tip.textContent=`${s.n} · ${rs(Math.round(s.v))} · ${Math.round(s.p)}%`; }
  const x=Math.min(Math.max(r.left+r.width/2-hr.left, 70), hr.width-70); tip.style.setProperty("--tx",x+"px"); tip.style.setProperty("--ty",(r.top-hr.top-6)+"px"); tip.classList.add("show"); }
/** Move the card to report R: roll numbers, resize the split, keep rows by key (new ones grow in, gone ones fold away), move days. */
function rpHero(R){ const h=$("#rp-hero"); if(!h||!R) return; const T=R.totals, n=T.bills||0;
  $("#rph-per").textContent = RP.from===RP.to ? rpDayL(RP.from,true) : `${rpDayL(RP.from)} – ${rpDayL(RP.to,true)}`;
  tweenNum($("#rph-sales"),T.sales||0,rsR); tweenNum($("#rph-bills"),n,nR); tweenNum($("#rph-avg"),n?T.sales/n:0,rsR);
  $("#rph-empty").hidden=!!n;
  // split bar + rows
  const sp=rpSplit(R); RP.split=sp.rows;
  $("#rph-by").textContent=t(sp.by==="group"?"rpByGroup":"rpByItem"); $("#rph-gstn").textContent=T.gstBills?t("rpBeforeGst"):"";
  $("#rph-splitw").hidden=!sp.rows.length;
  const bar=$("#rph-bar"), rows=$("#rph-rows"), anim=!rmo();
  const segs=new Map([...bar.children].map(el=>[el.dataset.k,el])), rws=new Map([...rows.children].filter(el=>!el.dataset.gone).map(el=>[el.dataset.k,el]));
  const before=new Map([...rws].map(([k,el])=>[k,el.getBoundingClientRect().top]));
  sp.rows.forEach(r=>{
    let sg=segs.get(r.k); if(sg) segs.delete(r.k); else { sg=document.createElement("div"); sg.className="rph-seg"; sg.dataset.k=r.k; sg.style.width="0%"; }
    bar.appendChild(sg); sg.style.setProperty("--o",r.o);
    let rw=rws.get(r.k), fresh=!rw;
    if(rw) rws.delete(r.k); else { rw=document.createElement("div"); rw.className="rph-rw"+(anim?" out":""); rw.dataset.k=r.k;
      rw.innerHTML=`<div><div class="rph-row" data-k="${esc(r.k)}"><span class="dot"></span><span class="nm"></span><b>₹0</b><span class="pc">0%</span></div></div>`; }
    rows.appendChild(rw); const row=rw.querySelector(".rph-row"); row.style.setProperty("--o",r.o); row.querySelector(".nm").textContent=r.n;
    tweenNum(row.querySelector("b"),r.v,rsR); tweenNum(row.querySelector(".pc"),r.p,pcR);
    if(fresh && anim) requestAnimationFrame(()=>requestAnimationFrame(()=>rw.classList.remove("out")));
  });
  void bar.offsetWidth;   // let new segments start at 0 width
  sp.rows.forEach(r=>{ const sg=bar.querySelector(`.rph-seg[data-k="${CSS.escape(r.k)}"]`); if(sg) sg.style.width=r.p+"%"; });
  segs.forEach(sg=>{ sg.style.width="0%"; setTimeout(()=>sg.remove(), anim?650:0); });
  rws.forEach(rw=>{ rw.dataset.gone="1"; rw.classList.add("out"); rows.appendChild(rw); setTimeout(()=>rw.remove(), anim?420:0); });
  if(anim) [...rows.children].forEach(rw=>{ const t0=before.get(rw.dataset.k); if(t0===undefined||rw.dataset.gone) return; const d=t0-rw.getBoundingClientRect().top; if(!d) return;
    rw.style.transition="none"; rw.style.transform=`translateY(${d}px)`; void rw.offsetWidth; rw.style.transition=""; rw.style.transform=""; });
  // per-day bars
  const pts=rpPts(R.byDay); RP.pts=pts; const days=$("#rph-days"), max=Math.max(...pts.map(p=>p.v),1), monthly=pts.length && pts[0].k.length===7;
  const setH=(el,p,i,stagger)=>{ el.dataset.dk="d:"+p.k; el.classList.toggle("z",!p.v); el.style.setProperty("--dl", stagger?Math.min(i*14,420)+"ms":"0s"); el.style.setProperty("--h", p.v?Math.max(4,p.v/max*100):0); };
  const old=[...days.children];
  if(old.length===pts.length) pts.forEach((p,i)=>setH(old[i],p,i,false));
  else { const build=()=>{ days.innerHTML=pts.map(()=>`<div class="rph-d"></div>`).join(""); const els=[...days.children]; void days.offsetWidth; pts.forEach((p,i)=>setH(els[i],p,i,anim)); };
    if(anim && old.length){ old.forEach(el=>{ el.style.setProperty("--dl","0s"); el.style.setProperty("--h",0); }); clearTimeout(days._t); days._t=setTimeout(build,230); } else build(); }
  $("#rph-perday").textContent=t(monthly?"rpPerMonth":"rpPerDay");
  const avgD=pts.length?(T.sales||0)/pts.length:0, ad=$("#rph-avgday");
  if(pts.length>1){ if(!$("#rph-avgd") || ad.dataset.m!==String(monthly)){ const [a,b]=t(monthly?"rpAvgMonth":"rpAvgDay").split("{v}"); ad.innerHTML=`${esc(a)}<b id="rph-avgd">${esc(rsR(RP.lastAvgD||0))}</b>${esc(b||"")}`; ad.dataset.m=String(monthly); $("#rph-avgd").dataset.v=RP.lastAvgD||0; }
    tweenNum($("#rph-avgd"),avgD,rsR); } else { ad.textContent=""; ad.dataset.m=""; }
  RP.lastAvgD=avgD;
  $("#rph-a0").textContent=pts.length>1?rpDayL(pts[0].k):""; $("#rph-a1").textContent=pts.length>1?rpDayL(pts[pts.length-1].k):"";
  // money meters: received / given on credit / pending, as parts of the larger of sales and pending
  const base=Math.max(T.sales||0,R.outstanding||0,R.received||0,R.creditGiven||0,1);
  tweenNum($("#rph-recv"),R.received||0,rsR); tweenNum($("#rph-cred"),R.creditGiven||0,rsR); tweenNum($("#rph-out"),R.outstanding||0,rsR);
  $("#rph-recvp").style.setProperty("--p",(R.received||0)/base*100); $("#rph-credp").style.setProperty("--p",(R.creditGiven||0)/base*100); $("#rph-outp").style.setProperty("--p",(R.outstanding||0)/base*100);
  // money in by how it was paid (bill page "Paid by" tiles + payment notes); shown once anything is marked
  { const M=R.modes||{}, order=[["Cash","pmCash"],["UPI","pmUpi"],["Cheque","pmCheque"],["Bank","bankL"],["","pmNone"]], el=$("#rph-modes");
    const any=Object.keys(M).some(k=>k && M[k]>0);
    el.hidden=!any; if(any) el.innerHTML=`<span>${esc(t("rpModes"))}</span>`+order.filter(([k])=>M[k]>0).map(([k,l])=>`<span class="c">${esc(k==="Bank"?"Bank":t(l))} <b>${esc(rsR(M[k]))}</b></span>`).join(""); }
  if(RP.hl && !(RP.split||[]).some(x=>x.k===RP.hl) && !(RP.pts||[]).some(x=>"d:"+x.k===RP.hl)) RP.hl="";
  setTimeout(rpHl, anim?680:0);
}
function renderReport(){
  const box=$("#rp-body"), R=RP.data; if(!box||!R) return;
  rpHero(R);
  const T=R.totals;
  if(!T.bills){ box.innerHTML=T.cancelled?`<p class="note">${esc(t("rpCancelled",T.cancelled))}</p>`:""; return; }
  const stat=(l,v,cls)=>`<div class="rp-stat${cls?" "+cls:""}"><span>${esc(l)}</span><b class="num">${esc(v)}</b></div>`;
  const lineP = T.pSale!==undefined, P = lineP ? r2(T.pSale-T.pCost) : T.profit, C = lineP ? T.pCost : T.cost;
  const pf=S.cfg.showProfit&&(lineP?T.pCost>0:T.profitBills) ? `<button type="button" class="rp-stat good rp-pbtn" id="rp-pbtn" aria-expanded="${!!RP.pOpen}"><span>${esc(t("rpProfit"))} <i>ⓘ</i></span><b class="num">${esc(rs(P))}${C>0?` · ${Math.round(P/C*1000)/10}%`:""}</b></button>` : "";
  const pdet = pf && RP.pOpen && lineP ? `<div class="rp-pdet num">
      <div><span>${esc(t("rpPSale"))}</span><b>${rs(T.pSale)}</b></div>
      <div><span>− ${esc(t("rpPCost"))}</span><b>${rs(T.pCost)}</b></div>
      <div class="tot"><span>= ${esc(t("rpProfit"))}</span><b>${rs(P)}</b></div>
      <div><span>${esc(t("rpPOver"))}</span><b>${T.pCost>0?Math.round(P/T.pCost*1000)/10:0}%</b></div>
      <div><span>${esc(t("rpPOfSale"))}</span><b>${T.pSale>0?Math.round(P/T.pSale*1000)/10:0}%</b></div>
      ${T.estAmt>0?`<p class="note">${esc(t("rpPEst",rs(T.estAmt)))}</p>`:""}
      ${T.noBuyAmt>0?`<p class="note">${esc(t("rpPNoBuy",rs(T.noBuyAmt)))}</p>`:""}
      ${T.gstBills||T.sales>T.lineSale+1?`<p class="note">${esc(t("rpPGst",rs(T.sales),rs(T.lineSale)))}</p>`:""}
    </div>` : "";
  const items=RP.allItems?R.items:R.items.slice(0,10);
  const gt=(rows,head)=>`<div class="rp-table"><table><thead><tr>${head.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td${i?' class="num"':""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const G=R.gst;
  box.innerHTML=`${T.gstBills||pf?`<div class="rp-grid">${T.gstBills?stat(t("rpGst"),rs(T.tax)):""}${pf}</div>`:""}${pdet}
    ${T.cancelled?`<p class="note" style="margin:0">${esc(t("rpCancelled",T.cancelled))}</p>`:""}
    <h3 class="rp-h">${esc(t("rpTop"))}</h3>
    <p class="rp-sub" style="margin:0">${esc(t("rpTapItem"))}</p>
    <div class="rp-items">${items.map((it,i)=>{ const k=it.name+"|"+it.unit, open=RP.open===k; return `<div class="rp-iw${open?" open":""}"><button type="button" class="rp-item" data-rpi="${esc(k)}" aria-expanded="${open}"><span class="rk">${i+1}</span><span class="nm">${esc(it.name)}</span><span class="q num">${esc(fmtN(it.qty))} ${esc(unitL(it.unit))}</span><b class="num">${rs(it.amount)}</b><svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>${open?rpItemDetail(it):""}</div>`; }).join("")}</div>
    ${!RP.allItems&&R.items.length>10?`<button type="button" class="btn ghost" id="rp-allitems">${esc(t("rpAll",R.itemCount))}</button>`:""}
    ${T.gstBills?`<h3 class="rp-h">${esc(t("rpGstT"))}</h3>
      ${gt([[t("rpB2B"),G.b2b.count,rs(G.b2b.taxable),rs(G.b2b.cgst),rs(G.b2b.sgst),rs(G.b2b.igst)],[t("rpB2C"),G.b2c.count,rs(G.b2c.taxable),rs(G.b2c.cgst),rs(G.b2c.sgst),rs(G.b2c.igst)]],["",t("rpBills"),t("rpTaxable"),"CGST","SGST","IGST"])}
      <p class="rp-sub">${esc(t("rpByRate"))}</p>${gt(G.rates.map(r=>[fmtN(r.rate)+"%",rs(r.taxable),rs(r.cgst),rs(r.sgst),rs(r.igst)]),["GST",t("rpTaxable"),"CGST","SGST","IGST"])}
      <p class="rp-sub">${esc(t("rpHsn"))}</p>${gt(G.hsn.map(h=>[h.hsn||"—",fmtN(h.rate)+"%",fmtN(h.qty),rs(h.taxable),rs(h.tax)]),["HSN","GST",t("rpQty"),t("rpTaxable"),"Tax"])}`:""}
    <h3 class="rp-h">${esc(t("rpExport"))}</h3>
    <div class="row-btns" style="justify-content:flex-start">${T.gstBills?`<button type="button" class="btn ghost" data-csv="reg">${esc(t("rpReg"))}</button><button type="button" class="btn ghost" data-csv="hsn">${esc(t("rpHsnCsv"))}</button>`:""}<button type="button" class="btn ghost" data-csv="items">${esc(t("rpItemsCsv"))}</button></div>
    <p class="note" style="margin:0">${esc(t("rpExportD"))}</p>`;
  if($("#rp-allitems")) $("#rp-allitems").onclick=()=>{ RP.allItems=true; renderReport(); };
  if($("#rp-pbtn")) $("#rp-pbtn").onclick=()=>{ RP.pOpen=!RP.pOpen; const sc=$("#sheet-body"), st=sc?sc.scrollTop:0; renderReport(); if(sc) sc.scrollTop=st; };
  box.querySelectorAll("[data-rpi]").forEach(b=>b.onclick=()=>{ const k=b.dataset.rpi; RP.open = RP.open===k ? "" : k;
    const sc=$("#sheet-body"), top=b.getBoundingClientRect().top; renderReport();
    const nb=[...document.querySelectorAll("[data-rpi]")].find(x=>x.dataset.rpi===k); if(nb && sc){ sc.scrollTop += nb.getBoundingClientRect().top - top; } });
  box.querySelectorAll("[data-csv]").forEach(b=>b.onclick=()=>exportCsv(b.dataset.csv));
}
/* One item's detail in the report: how many bills, average price, the prices charged, buy cost and profit. */
const rsx=n=>{ const v=Math.round((+n||0)*100)/100; return Number.isInteger(v)?rs(v):rs2(v); };
function rpItemDetail(it){
  const u=unitL(it.unit)||"", per=t("riPer",u||"unit");
  if(it.bills===undefined) return `<div class="rp-idet"><div class="rp-irow"><span>${esc(t("riAvgSell"))}</span><b class="num">${rsx(it.qty?it.amount/it.qty:0)} <small>${esc(per)}</small></b></div><p class="note" style="margin:0">${esc(t("riOld"))}</p></div>`;
  const avg=it.qty?it.amount/it.qty:0;
  const showPf=!!S.cfg.showProfit && !hideBuy();
  const row=(l,v,cls)=>`<div class="rp-irow${cls?" "+cls:""}"><span>${esc(l)}</span><b class="num">${v}</b></div>`;
  let h=`<div class="rp-idet">
    <div class="rp-ichips"><span>${esc(t("riBills",it.bills))}</span><span>${esc(t("riSold"))} ${esc(fmtN(it.qty))} ${esc(u)}</span><span>${esc(t("riSales"))} ${esc(rs(it.amount))}</span></div>
    ${row(t("riAvgSell"),`${rsx(avg)} <small>${esc(per)}</small>`,"big")}
    <p class="rp-calc num">${esc(rs(it.amount))} ÷ ${esc(fmtN(it.qty))} ${esc(u)} = ${esc(rsx(avg))}</p>`;
  if(it.rates && it.rates.length>1){
    h+=`<p class="rp-sub" style="margin:2px 0 0">${esc(t("riRange",rsx(it.min),rsx(it.max)))}</p><div class="rp-rates">${it.rates.map(r=>`<div><b class="num">${rsx(r.rate)}</b><span>${esc(t("riRateRow",fmtN(r.qty),u,r.bills))}</span></div>`).join("")}</div>`;
  }
  if(showPf){
    if(it.costQty>0){
      const avgBuy=it.cost/it.costQty, pf=it.profit, mg=it.cost>0?Math.round(pf/it.cost*1000)/10:null;
      h+=row(t("riAvgBuy"),`${rsx(avgBuy)} <small>${esc(per)}</small>`);
      h+=row(t("riProfit"),`${pf<0?"−":""}${rsx(Math.abs(pf))}${mg!=null?` <small>· ${mg}%</small>`:""}`,pf<0?"neg":"good");
      h+=`<p class="rp-calc num">${esc(fmtN(it.costQty))} ${esc(u)} × (${esc(rsx(it.costAmt/it.costQty))} − ${esc(rsx(avgBuy))}) = ${esc((pf<0?"−":"")+rsx(Math.abs(pf)))}</p>`;
      if(it.costQty < it.qty-1e-9) h+=`<p class="note" style="margin:0">${esc(t("riPartial",fmtN(it.costQty),fmtN(it.qty),u))}</p>`;
    } else h+=`<p class="note" style="margin:0">${esc(t("riNoBuy"))}</p>`;
  }
  if(showPf && it.estQty>0) h+=`<p class="note" style="margin:0">${esc(t("riEst",fmtN(it.estQty),u))}</p>`;
  if(it.gstQty>0) h+=`<p class="note" style="margin:0">${esc(t("riGstNote"))}</p>`;
  return h+`</div>`;
}
function exportCsv(kind){
  const R=RP.data; if(!R) return;
  const q=v=>{ const x=String(v==null?"":v); return /[",\n]/.test(x)?`"${x.replace(/"/g,'""')}"`:x; };
  let rows, name;
  if(kind==="reg"){ name="invoice-register"; rows=[["Date","Invoice No","Customer","GSTIN","Place of supply","Taxable value","CGST","SGST","IGST","Invoice total","Status"]].concat(R.register.map(r=>[r.date,r.no,r.customer,r.gstin,r.pos,r.taxable,r.cgst,r.sgst,r.igst,r.total,r.status])); }
  else if(kind==="hsn"){ name="hsn-summary"; rows=[["HSN","GST rate %","Quantity","Taxable value","Total tax"]].concat(R.gst.hsn.map(h=>[h.hsn,h.rate,h.qty,h.taxable,h.tax])); }
  else { name="item-sales"; const pf=!!S.cfg.showProfit && !hideBuy(); const r2=v=>Math.round(v*100)/100;
    rows=[["Item","Unit","Quantity","Amount","Bills","Avg selling price"].concat(pf?["Avg buy price","Profit"]:[])].concat(R.items.map(i=>[i.name,i.unit,i.qty,i.amount,i.bills==null?"":i.bills,i.qty?r2(i.amount/i.qty):""].concat(pf?[i.costQty?r2(i.cost/i.costQty):"",i.profit==null?"":i.profit]:[]))); }
  const csv="﻿"+rows.map(r=>r.map(q).join(",")).join("\r\n");
  shareFile(new Blob([csv],{type:"text/csv"}), `${name}_${R.from||"all"}_to_${R.to||"all"}.csv`, `${S.cfg.shopName||"Rate Book"} · ${name}`);
}
