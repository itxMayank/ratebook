/* Rate Book app code (moved out of index.html on 11 Oct 2026). One classic script in global scope: index.html loads strings.js,
   then this file, at the end of <body>, so the page is already built when it runs. Run  node tools/stamp.js  after editing. */
"use strict";

/* ---------------- i18n ---------------- */
const STR = window.RB_STR;   /* texts live in strings.js */
const DEFAULT_UNITS=[{code:"kg",hi:"किलो"},{code:"g",hi:"ग्राम"},{code:"L",hi:"लीटर"},{code:"ml",hi:"मि.ली."},{code:"pc",hi:"नग"},{code:"dozen",hi:"दर्जन"},{code:"packet",hi:"पैकेट"},{code:"box",hi:"डिब्बा"},{code:"bag",hi:"बोरी"},{code:"bottle",hi:"बोतल"},{code:"metre",hi:"मीटर"},{code:"bundle",hi:"गड्डी"}];
const UNIT_ALIASES={kg:["kg","kgs","kilo","kilos","kilogram","किलो","किग्रा","केजी"],g:["g","gm","gms","gram","grams","ग्राम"],L:["l","ltr","litre","liter","litres","लीटर"],ml:["ml","मिली"],pc:["pc","pcs","piece","pieces","nag","नग","पीस"],dozen:["dozen","darjan","दर्जन"],packet:["packet","pkt","packets","पैकेट","पाकेट"],box:["box","dabba","डिब्बा"],bag:["bag","bori","बोरी"],bottle:["bottle","बोतल"],metre:["metre","meter","mtr","मीटर"],bundle:["bundle","gaddi","गड्डी"]};


/* Gap-fix strings */
/* Back-button strings */
/* Theme strings */
/* Text size strings */
/* Refresh strings */
 /* Backup strings */
/* Desktop strings */
/* Test / real mode strings */
/* Credit (udhaar) strings */
const S = { lang: ls.get("rb_lang","en"), hideBuy: ls.get("rb_hidebuy",false), items:[], byId:new Map(), index:[], loaded:false, canWrite:false,
  auth: ls.get("rb_auth",null), rev:null, online:null, lastSync:0, thumbs:{}, q:"", limit:40, tab:"items", bill: ls.get("rb_bill",[]), cust: ls.get("rb_cust",""), mob: ls.get("rb_mob",""), gst: ls.get("rb_gst",false), igst: ls.get("rb_igst",false), custGstin: ls.get("rb_cgstin",""), po: poNorm(ls.get("rb_po",null)), billNoOvr: ls.get("rb_billno",null), posSel: ls.get("rb_pos",""), pendShare: !!ls.get("rb_pshare",0), filter:"all", pay: ls.get("rb_pay","paid"), recv: ls.get("rb_recv",""), pm: ls.get("rb_pm",""), profitShown:false, custAuto:"", custQ:"", editing: ls.get("rb_editing",null), qTabs:{items:"",bill:""}, lastBill: ls.get("rb_lastbill",null), billQ: ls.get("rb_billq",[]),
  cfg:{ shopName:"", units:DEFAULT_UNITS, defaultUnit:"kg", roundTo:1, billFooter:"", nextBill:1, nextGstBill:1, showProfit:false, shopGstin:"", shopAddress:"", defaultGst:18, defaultHsn:"3923", mode:"test" } };
S.canWrite = !!(S.auth && (S.auth.tok || S.auth.pin));
if(S.canWrite && S.auth.prefs && typeof S.auth.prefs.hideBuy==="boolean") S.hideBuy=S.auth.prefs.hideBuy;   // this person's choice beats the phone's
/* Each phone has a random id, so a wrong PIN locks only that phone. */
const DEV = (()=>{ let d=ls.get("rb_dev",""); if(!d){ d=Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4); ls.set("rb_dev",d); } return d; })();
const RANK={staff:1,manager:2,owner:3};
const NEED_SV=34;   // Code.gs SCRIPT_VERSION this app needs
function myRole(){ return S.canWrite ? ((S.auth&&S.auth.role)||"owner") : ""; }
function can(r){ return S.canWrite && (RANK[myRole()]||0)>=RANK[r]; }
const hideBuy=()=>S.hideBuy||S.limited;
/** This person's own settings (from verify / setMyPrefs, kept in rb_auth so they work offline). Empty when locked. */
const myPrefs=()=>(S.canWrite && S.auth && S.auth.prefs) || {};
const myTestOk=()=>!(S.auth && S.auth.testOk===false);
/** Re-work the mode, profit and hide-buy after this person's settings change (or someone else unlocks / the phone locks). */
function applyPrefs(){ const P=myPrefs(); S.hideBuy=typeof P.hideBuy==="boolean"?P.hideBuy:ls.get("rb_hidebuy",false); switchEnv(S.cfg); }
async function setMyPrefs(p){ const j=await apiPost({action:"setMyPrefs",prefs:p}); S.auth={...S.auth,prefs:j.prefs||{},testOk:j.testOk!==false}; ls.set("rb_auth",S.auth); applyPrefs(); return j; }
function noTestNow(){ if(!S.auth) return; const was=S.cfg.mode; S.auth={...S.auth,testOk:false,prefs:{...myPrefs(),mode:"live"}}; ls.set("rb_auth",S.auth); applyPrefs(); if(was==="test") toast(t("noTestNow")); }

const $ = s => document.querySelector(s);
/* Text size, chosen per phone (Settings → Text size). */
const TSIZES=[1,1.12,1.25,1.38];
function fzNow(){ const v=+ls.get("rb_fz",1); return TSIZES.includes(v)?v:1; }
function setFz(v){ if(!TSIZES.includes(v)) v=1; ls.set("rb_fz",v); const r=document.documentElement.style; r.setProperty("--fz",v); r.setProperty("--fz2",1+(v-1)/2); document.documentElement.classList.toggle("fz-big",v>=1.2); }
setFz(fzNow());
document.addEventListener("DOMContentLoaded",()=>{ if(!document.body.dataset.tab) document.body.dataset.tab="items"; });
if(document.body) document.body.dataset.tab="items";
/* Theme and appearance, chosen per phone. [key, light primary, light second, dark primary, status-bar colour] */
const PALETTES=[["ink","#16171A","#4F46E5","#F3F4F6","#F1F2F4"],["maroon","#8C2331","#F6E6E8","#EC8E99","#8C2331"],["forest","#1F6B4A","#E3F1EA","#5CC594","#1F6B4A"],["indigo","#3443A8","#E7EAF9","#9AABFF","#3443A8"],["saffron","#A14B07","#FBEEDC","#F5A524","#A14B07"]];
function palNow(){ const v=ls.get("rb_palette","ink"); return PALETTES.some(p=>p[0]===v)?v:"ink"; }
function appearNow(){ const v=ls.get("rb_appear","auto"); return ["auto","light","dark"].includes(v)?v:"auto"; }
function applyTheme(){
  const r=document.documentElement, pal=palNow(), ap=appearNow();
  if(pal==="ink") r.removeAttribute("data-palette"); else r.setAttribute("data-palette",pal);
  if(ap==="auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme",ap);
  const dark = ap==="dark" || (ap==="auto" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  const m=document.querySelector('meta[name="theme-color"]'), p=PALETTES.find(x=>x[0]===pal);
  if(m) m.setAttribute("content", dark ? (pal==="ink"?"#0E0F11":"#111114") : p[4]);
}
applyTheme();
try{ matchMedia("(prefers-color-scheme: dark)").addEventListener("change",applyTheme); }catch{}
/* Technical details (Apps Script steps, script versions, error codes, the AI model's name) are only for the owner of the original
   shop (Mayank, who runs Rate Book). Every other shop gets the plain "Rate Book support will fix this" version of a message
   (strings with the same key + "_s"); the problem itself reaches the admin dashboard (error log, What to fix). */
const TECH = () => SHOP_MAIN && can("owner");
const t = (k,...a) => { const L=STR[S.lang]||STR.en; if(!TECH() && (k+"_s") in STR.en) k+="_s"; const v = L[k] ?? STR.en[k]; return typeof v==="function"? v(...a) : v; };
/* Small line icons used inside text (one icon style across the app; designinstructions §5). Size follows the text. */
const ICS=p=>`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC={warn:ICS('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
  lock:ICS('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  receipt:ICS('<path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/><path d="M9 7h6M9 11h6M9 15h4"/>'),
  file:ICS('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
  clip:ICS('<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>'),
  cam:ICS('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>'),
  link:ICS('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>')};
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtN = n => Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
const rs = n => "₹" + fmtN(n);
const unitHi = u => (S.cfg.units.find(x=>x.code===u)||{}).hi;
const unitL = u => S.lang==="hi" && unitHi(u) ? unitHi(u) : (u||"");
const devDigits = s => String(s).replace(/[०-९]/g,d=>"०१२३४५६७८९".indexOf(d));
/* Loose quantities: kg and litre lines can be sold in parts (250 g). Saved as kg/L (0.25), shown as grams/ml under 1. */
const fracSub = u => { const x=String(u||"").toLowerCase(); return UNIT_ALIASES.kg.includes(x)?"g" : UNIT_ALIASES.L.includes(x)?"ml" : null; };
const isPart = (q,u) => !!fracSub(u) && +q>0 && +q<1;
/** "250 g" (Hindi unit names when the app is in Hindi; plain codes for the PDF). */
function qtyText(q,u,plain){ const sub=fracSub(u); if(sub && +q>0 && +q<1) return `${fmtN(Math.round(q*1000))} ${plain?sub:unitL(sub)}`; return `${fmtN(q)} ${plain?u:unitL(u)}`; }
/** Short form for the small qty box: "250g", "1.5". */
function qtyShort(q,u){ const sub=fracSub(u); return sub && +q>0 && +q<1 ? `${Math.round(q*1000)}${sub}` : fmtN(q); }
/** Rate, with "/kg" when the quantity is shown in grams, so ₹220 isn't read as the price of 250 g. */
function rateText(l,plain){ return rs(l.rate)+(isPart(l.qty,l.unit)?"/"+(plain?l.unit:unitL(l.unit)):""); }
/** Typed quantity: "250g" / "500 ml" become 0.25 / 0.5 on kg/L lines. */
function parseQty(v,u){ const m=String(v||"").trim().toLowerCase().match(/^([\d.,]+)\s*(g|gm|gms|gram|grams|ml)$/); if(m && fracSub(u)) return toNum(m[1])/1000; return toNum(v); }
/** − and + on kg/L lines move in quarters below 1 (1 → 750 g → 500 g → 250 g), by 1 above. */
function stepQty(q,u,up){ q=+q||0; const r=x=>Math.round(x*1000)/1000;
  if(!fracSub(u)) return Math.max(0,r(q+(up?1:-1)));
  if(up) return q<1 ? r(Math.floor(q*4+1e-9)/4+0.25) : r(q+1);
  return q>1 ? r(q-1) : Math.max(0,r(Math.ceil(q*4-1e-9)/4-0.25)); }
/* Money boxes (class "money"): show Indian commas while typing (1,25,000.50). toNum() strips them again. */
const inrGroup = d => d.length<=3 ? d : d.slice(0,-3).replace(/\B(?=(\d{2})+(?!\d))/g,",")+","+d.slice(-3);
function moneyText(v, neg, dec){ dec=dec||2; let x=devDigits(v==null?"":v).replace(/[^\d.\-]/g,""); const minus=neg&&x.startsWith("-"); x=x.replace(/-/g,"");
  const dot=x.indexOf("."); let i=dot<0?x:x.slice(0,dot), f=dot<0?null:x.slice(dot+1).replace(/\./g,"").slice(0,dec);
  i=i.replace(/^0+(?=\d)/,""); if(i===""&&f!==null) i="0"; return (minus?"-":"")+inrGroup(i)+(f!==null?"."+f:""); }
function moneySet(el, v){ if(el) el.value = v==null||v==="" ? "" : moneyText(typeof v==="number"? String(Math.round(v*1000)/1000) : v, el.dataset.neg!=null, +el.dataset.dp||2); }
/* Show a stored price with commas in a box; leaves text that isn't a number alone (so a bad pasted value still shows as typed). */
const moneyVal = (v, dec) => v==null||v==="" ? "" : isNaN(toNum(v)) ? String(v) : moneyText(String(v), true, dec||2);
document.addEventListener("input", e=>{ const el=e.target; if(!el.classList||!el.classList.contains("money")) return;
  const pos=el.selectionStart==null?el.value.length:el.selectionStart, keep=el.value.slice(0,pos).replace(/[^\d.\-०-९]/g,"").length, nv=moneyText(el.value, el.dataset.neg!=null, +el.dataset.dp||2);
  if(el.dataset.rate!=null) el.style.cssText=rateW(nv);
  if(nv===el.value) return; el.value=nv; let n=0, c=0; while(c<nv.length && n<keep){ if(/[\d.\-]/.test(nv[c])) n++; c++; } try{ el.setSelectionRange(c,c); }catch{} }, true);
/* Bill rate box grows for long amounts (1,12,500) instead of hiding the first digits. */
const rateW = v => { const n=String(v||"").length; return n>5 ? `width:calc(${n}ch + 20px);flex-basis:calc(${n}ch + 20px);max-width:118px` : ""; };
const toNum = v => { if (v==null) return NaN; const s=devDigits(v).replace(/[₹,\s]/g,""); if(s==="") return NaN; return Number(s); };


/** The name shown everywhere: Hindi letters when available, else the English name. */
function itemTitle(it){ return (it && it.name) || (it && it.nameHi) || ""; }
function lineHi(l){ const it=S.byId.get(l.id); return l.nameHi || (it && it.nameHi) || toHindi(l.name); }
function lineName(l){ return l.name || lineHi(l); }
function lineLabel(l){ return l.name || lineHi(l); }   // WhatsApp text: English name only

/* ---------------- Rendering ---------------- */
function applyLang(){
  document.documentElement.lang = S.lang==="hi"?"hi":"en";
  document.querySelectorAll("[data-t]").forEach(el=>{ el.textContent=t(el.dataset.t); });
  document.querySelectorAll("[data-tp]").forEach(el=>{ el.placeholder=t(el.dataset.tp); });
  if(S.tab==="bill") $("#q").placeholder=t("billSearchPh");
  $("#lang-en").setAttribute("aria-pressed",S.lang==="en"); $("#lang-hi").setAttribute("aria-pressed",S.lang==="hi");
  if($("#pay-seg")) renderPay(); duesSub();
  renderAll();
}
function billText(){
  if(S.gst) return gstBillText();
  const d=billDateStr();
  let s=S.cfg.mode==="test"?`${t("testBillLine")}\n`:""; if(S.cfg.shopName) s+=`*${S.cfg.shopName}*\n`;
  s+=`${t("billNoLine",curBillNo())} · ${d}\n`+editedLine(); if(S.cust.trim()) s+=`${t("custL")}: ${S.cust.trim()}\n`; if(normMobile(S.mob)) s+=`${t("mobL")}: ${S.mob.trim()}\n`; s+=poTextLine(S.po)+"\n";
  S.bill.forEach((l,i)=>{ s+=`${i+1}. ${lineLabel(l)} — ${qtyText(l.qty,l.unit)} × ${rateText(l)} = ${rs(l.qty*l.rate)}\n`; });
  s+=`\n*${t("total")}: ${rs(billSum())}*`+payText(billSum()); if(S.cfg.billFooter) s+=`\n\n${S.cfg.billFooter}`; return s;
}
/** Bill shared or marked done: remember it, move the number on (shared with every phone), start a fresh bill. */
/* ---------------- Test / real mode ---------------- */
function syncRaw(){ const r=S.cfg.raw||(S.cfg.raw={}); if(S.cfg.mode==="test"){ r.testNextBill=S.cfg.nextBill; r.testNextGstBill=S.cfg.nextGstBill; } else { r.nextBill=S.cfg.nextBill; r.nextGstBill=S.cfg.nextGstBill; } }
const envKey=k=> S.cfg.mode==="test" ? k+"_test" : k;
/** Called when the mode changes (here or on another phone): start a clean bill so nothing crosses over. */
function switchEnv(cfg){
  const before=S.cfg.mode; applyConfig(cfg); saveCache();
  if(before!==S.cfg.mode){
    if(S.editing){ S.editing=null; ls.set("rb_editing",null); ls.set("rb_stash",null); }
    S.billNoOvr=null; ls.set("rb_billno",null); S.lastBill=null; ls.set("rb_lastbill",null);
    duesCache=null; S.custQ=""; showCustHint(null); for(const k in RPC) delete RPC[k];
  }
  renderEnv(); renderAll();
}
function renderEnv(){
  const test=S.cfg.mode==="test";
  document.body.classList.toggle("env-test",test);
  const b=$("#envbadge"); if(b){ b.hidden=!test; b.textContent=t("testBadge"); } { const br=document.querySelector(".brand"); if(br) br.classList.toggle("nobadge",!test); }
  const bb=$("#bill-envnote"); if(bb){ bb.hidden=!test; bb.textContent=t("envBanner"); }
  duesSub();
}
function draftState(){ return { bill:S.bill, cust:S.cust, mob:S.mob, gst:S.gst, igst:S.igst, custGstin:S.custGstin, po:poOut(S.po), billNoOvr:S.billNoOvr, pay:S.pay, recv:S.recv, pm:S.pm||"" }; }
function applyDraft(d){ d=d||{}; S.bill=d.bill||[]; S.cust=d.cust||""; S.mob=d.mob||""; S.gst=!!d.gst; S.igst=!!d.igst; S.custGstin=d.custGstin||""; S.po=poNorm(d.po); S.poOpen=false; ls.set("rb_po",S.po); if(poHas(S.po)) setOpen("#bh-more","#bh-extra","rb_bh_open",true); S.billNoOvr=d.billNoOvr||null; S.pay=d.pay||"paid"; S.recv=d.recv||""; S.pm=d.pm||""; ls.set("rb_pm",S.pm);
  ls.set("rb_pay",S.pay); ls.set("rb_recv",S.recv); $("#pay-recv").value=S.recv; renderPay();
  ls.set("rb_cust",S.cust); ls.set("rb_mob",S.mob); ls.set("rb_gst",S.gst); ls.set("rb_igst",S.igst); ls.set("rb_cgstin",S.custGstin); ls.set("rb_billno",S.billNoOvr);
  $("#cust").value=S.cust; $("#cust-mob").value=S.mob; $("#cust-gstin").value=S.custGstin; saveBill(); }
/* tap = switch, long-press = remove */
(function(){
  const row=$("#heldrow"); let lpT=0, lpFired=false;
  row.addEventListener("pointerdown",e=>{ const c=e.target.closest("[data-held]"); if(!c) return; lpFired=false; clearTimeout(lpT); lpT=setTimeout(()=>{ lpFired=true; try{navigator.vibrate&&navigator.vibrate(20);}catch{} removeHeld(c.dataset.held); },600); });
  ["pointerup","pointercancel","pointerleave"].forEach(ev=>row.addEventListener(ev,()=>clearTimeout(lpT)));
  row.addEventListener("scroll",()=>clearTimeout(lpT),{passive:true});
  row.addEventListener("contextmenu",e=>{ if(e.target.closest("[data-held]")) e.preventDefault(); });
  row.addEventListener("click",e=>{ if(e.target.closest("#held-add")){ newHeldBill(); return; }
    const c=e.target.closest("[data-held]"); if(!c) return; if(lpFired){ lpFired=false; return; } resumeHeld(c.dataset.held); });
})();
$("#bill-new").onclick=newHeldBill;
$("#addto").onclick=()=>setTab("bill");
document.addEventListener("keydown",e=>{ if(!DESK() || !e.altKey) return; const k=parseInt(e.key,10); if(!(k>=1&&k<=9)) return;
  const chips=[...document.querySelectorAll("#heldrow .hchip:not(.add)")]; const c=chips[k-1]; if(!c) return; e.preventDefault(); if(c.dataset.held) resumeHeld(c.dataset.held); });
$("#cash-open").onclick=()=>{ const open=$("#cash-open").getAttribute("aria-expanded")==="true";
  if(open){ ls.set("rb_cashopen",false); S.cash=""; $("#cash-in").value=""; renderCash(); }
  else { ls.set("rb_cashopen",true); renderCash(); } };
$("#cash-in").addEventListener("input",e=>{ S.cash=e.target.value.replace(/[^0-9.]/g,""); renderCash(); });
$("#cash-in").addEventListener("keydown",e=>{ if(e.key==="Enter") e.target.blur(); });
$("#cashrow").addEventListener("click",e=>{ const c=e.target.closest("[data-cash]"); if(c){ setCash(c.dataset.cash); try{navigator.vibrate&&navigator.vibrate(8);}catch{} return; }
  if(e.target.closest("#cash-x")){ setCash(""); $("#cash-in").value=""; } });

/* Every search box gets a clear (x) button. The main search has its own (#q-clear). */
function addSearchX(inp){
  if(inp.dataset.sx || inp.id==="q") return; inp.dataset.sx="1";
  const w=document.createElement("span"); w.className="sx"; inp.parentNode.insertBefore(w,inp); w.appendChild(inp);
  if(inp.style.width) { w.style.width=inp.style.width; inp.style.width="100%"; }
  const b=document.createElement("button"); b.type="button"; b.className="sx-b"; b.setAttribute("aria-label",t("clearX"));
  b.innerHTML=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`; w.appendChild(b);
  const sync=()=>{ b.hidden=!inp.value; }; sync();
  inp.addEventListener("input",sync);
  b.addEventListener("pointerdown",e=>e.preventDefault());           // keep the keyboard where it is
  b.addEventListener("click",()=>{ inp.value=""; inp.dispatchEvent(new Event("input",{bubbles:true})); sync(); inp.focus(); });
}
new MutationObserver(()=>document.querySelectorAll('input[type="search"]:not([data-sx])').forEach(addSearchX)).observe(document.body,{childList:true,subtree:true});
document.querySelectorAll('input[type="search"]').forEach(addSearchX);
document.addEventListener("visibilitychange",()=>{ if(!document.hidden && S.pendShare) setTimeout(askSent,400); });
window.addEventListener("focus",()=>{ if(S.pendShare) setTimeout(askSent,600); });
function downloadBlob(blob,name){ const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.rel="noopener"; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },8000); }
/** A PDF or CSV is ready: on a laptop it downloads straight away; on a phone you pick Download (saved to the phone) or Share. */
function shareFile(blob,name,text){
  const file=new File([blob],name,{type:blob.type||"application/octet-stream"});
  const canShare=!!(navigator.canShare && navigator.canShare({files:[file]}));
  if(DESK() || !canShare){ downloadBlob(blob,name); toast(t("fileSaved",name)); return Promise.resolve("downloaded"); }
  return new Promise(res=>{
    const old=document.getElementById("fileact"); if(old) old.remove();
    const ext=(name.split(".").pop()||"").toUpperCase(), kb=Math.max(1,Math.round(blob.size/1024));
    const el=document.createElement("div"); el.id="fileact"; el.className="fileact"; el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true");
    el.innerHTML=`<div class="fa-card"><div class="fa-file"><span class="fa-ic">${esc(ext)}</span><div><b>${esc(name)}</b><span>${esc(kb+" KB")}</span></div></div>
      <div class="fa-btns"><button type="button" class="btn ghost" id="fa-dl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>${esc(t("fileDl"))}</button>
      <button type="button" class="btn primary" id="fa-sh"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>${esc(t("fileShare"))}</button></div>
      <button type="button" class="fa-x" id="fa-x">${esc(t("cancel"))}</button></div>`;
    document.body.appendChild(el); requestAnimationFrame(()=>el.classList.add("on"));
    const close=r=>{ el.classList.remove("on"); setTimeout(()=>el.remove(),200); res(r); };
    el.addEventListener("click",e=>{ if(e.target===el) close("cancelled"); });
    el.querySelector("#fa-x").onclick=()=>close("cancelled");
    el.querySelector("#fa-dl").onclick=()=>{ downloadBlob(blob,name); toast(t("fileSaved",name)); close("downloaded"); };
    el.querySelector("#fa-sh").onclick=async()=>{ try{ await navigator.share({files:[file],title:name,text:text||""}); close("shared"); }catch(e){ if(e&&e.name==="AbortError") close("cancelled"); else { downloadBlob(blob,name); toast(t("fileSaved",name)); close("downloaded"); } } };
  });
}

function renderQueue(){
  const el=$("#queuebar"); if(!el) return; const n=S.billQ.length;
  el.hidden=!n; if(!n) return;
  el.classList.toggle("bad",!!S.needCode);
  el.innerHTML=`<span class="dot"></span><span>${esc(S.needCode?t("queueCode"):t("queueN",n))}</span>${S.needCode?"":`<button type="button" id="queue-send">${esc(t("queueSend"))}</button>`}`;
  const b=$("#queue-send"); if(b) b.onclick=()=>{ btnBusy(b,true); flushBills(); };
}
function renderSvNote(){
  const el=$("#sv-note"); if(!el) return; const old=S.online && S.sv!==undefined && S.sv<NEED_SV && TECH();   // other shops: the admin updates their scripts
  el.hidden=!old; if(old) el.innerHTML=`<b>${IC.warn} ${esc(t("svT"))}</b><span>${esc(t("oldScript"))}</span>`;
}
function renderCodeNote(){
  renderSvNote();
  const el=$("#code-note"); if(!el) return;
  const need = !S.canWrite && ((S.codeOn && !ls.get("rb_view","")) || S.needCode);
  el.hidden=!need; if(!need) return;
  el.innerHTML=`<b>${esc(t("codeNeedT"))}</b><span class="note" style="margin:0">${esc(t("codeNeedD"))}</span><div class="codeline"><input id="code-in" autocomplete="off" autocapitalize="characters" maxlength="8" placeholder="${esc(t("codePh"))}"><button type="button" class="btn primary sm" id="code-go">${esc(t("codeOk"))}</button></div>`;
  $("#code-go").onclick=async()=>{ const v=$("#code-in").value.trim().toUpperCase(); if(!v) return; const b=$("#code-go"); btnBusy(b,true);
    try{ const j=await apiGet0({action:"list",k:v}); if(j.limited){ btnBusy(b,false); toast(t("codeBad")); return; } ls.set("rb_view",v); S.needCode=false; toast(t("codeSaved")); S.rev=null; sync(); }
    catch{ btnBusy(b,false); toast(t("codeBad")); } };
}
function showRenumbered(r){
  openSheet(t("renumT"), `<p style="margin:0">${esc(t("renumD",r.from,r.to))}</p>`, `<button class="btn ghost" id="rn-ok">OK</button>${S.canWrite?`<button class="btn primary" id="rn-open">${esc(t("renumOpen"))}</button>`:""}`);
  $("#rn-ok").onclick=closeSheet; if($("#rn-open")) $("#rn-open").onclick=()=>openBills();
}
function renderBillSearch(){
  const box=$("#bill-search-results"); const q=S.q.trim();
  if(q!==renderBillSearch.lastQ) requestAnimationFrame(()=>{ const r=$("#rise"); if(r) r.scrollTop=root.classList.contains("sres-top")?0:r.scrollHeight; });   // start at the best match
  renderBillSearch.lastQ=q;
  const riseOn=on=>{ const r=$("#rise"); if(r) r.classList.toggle("on",on); };   // (a class, not :has(), so older iPhones show it too)
  if(S.tab!=="bill"||!q){ box.innerHTML=""; riseOn(false); return; }
  riseOn(true);
  const {res}=runSearch(q);
  /* Tap the row = add and close the search (as before). The small − qty + (or +) changes the quantity and keeps the search open,
     and shows what's already in the bill when the same item is searched again. */
  box.innerHTML=res.slice(0,6).map(r=>{const it=r.e.it, inB=billQty(it.id), img=!!thumbOf(it); return `<div class="mini${inB?" inb":""}${img?"":" noimg"}" role="button" tabindex="0" data-add="${esc(it.id)}">${img?thumbHTML(it,40):""}<span class="name">${highlight(it.name,q)}${it.nameHi?`<span class="msub" lang="hi">${highlight(it.nameHi,q)}</span>`:""}${hideBuy()?"":`<span class="msub mrates num">${esc(t("buy"))} <b>${rs(it.buy)}</b>${marginPct(it)?` · ${esc(t("margin"))} <b>${marginPct(it)}</b>`:""}</span>`}</span>
    <span class="mright"><span class="mprice"><b class="num">${rs(it.sell)}</b> /${esc(unitL(it.unit))}</span>${inB?`<span class="sstep"><button type="button" data-sstep="-1" data-sid="${esc(it.id)}" aria-label="${esc(t("dec"))}">−</button><b class="num">${esc(qtyShort(inB,it.unit))}</b><button type="button" data-sstep="1" data-sid="${esc(it.id)}" aria-label="${esc(t("addToBill"))}">+</button></span>`
         :`<span class="sstep one"><button type="button" data-sstep="1" data-sid="${esc(it.id)}" aria-label="${esc(t("addToBill"))}">+</button></span>`}</span></div>`}).join("") || `<p class="note">${esc(t("noMatch",q))}</p>`;
}
/** − / + inside a bill-search result: change the quantity, keep the search and keyboard open. */
function searchStep(id,up){ const it=S.byId.get(id); if(!it) return; const i=S.bill.findIndex(x=>x.id===id);
  if(i<0){ if(!up) return; S.bill.push({id,name:it.name,nameHi:it.nameHi||toHindi(it.name),unit:it.unit,rate:+it.sell||0,qty:1,hsn:itemHsn(it),gst:itemGst(it),buy:itemBuyFor(it,false),lp:+it.sell||0}); }
  else { const l=S.bill[i]; l.qty=stepQty(l.qty,l.unit,up); if(l.qty<=0) S.bill.splice(i,1); }
  saveBill(); renderBadge(); renderBill(); try{navigator.vibrate&&navigator.vibrate(8);}catch{} }
{ const bsr=document.getElementById("bill-search-results");
  bsr.addEventListener("pointerdown",e=>{ if(e.target.closest("[data-sstep]") || (!DESK() && e.pointerType!=="mouse")) e.preventDefault(); });   // keep the keyboard up
  bsr.addEventListener("click",e=>{ const b=e.target.closest("[data-sstep]"); if(!b) return; e.stopPropagation(); e.preventDefault(); searchStep(b.dataset.sid, b.dataset.sstep==="1"); },true);
  bsr.addEventListener("keydown",e=>{ const m=e.target.closest(".mini[data-add]"); if(m && (e.key==="Enter"||e.key===" ") && e.target===m){ e.preventDefault(); m.click(); } }); }
function renderAll(){
  renderEnv(); applyDesk();
  renderList(); renderBill(); renderBadge();
  $("#fab").hidden = !(can("manager") && S.tab==="items" && S.loaded);
  $("#ro-note").hidden = S.canWrite || ls.get("rb_ro_x",false);
  document.querySelectorAll("#view-tools [data-w]").forEach(b=>b.disabled=!can("manager"));
  { const r=$("#t-reports"); if(r) r.hidden=!can("manager"); }
  { const r=$("#t-biz"); if(r) r.hidden=!can("owner"); }
  { const r=$("#t-sum"); if(r) r.hidden=!can("owner"); }   // today's summary, ready for WhatsApp (reports.js)   // the owner's business dashboard (admin.html, signed in there with the same name + PIN)
  renderQueue(); renderCodeNote();
  $("#t-unlock-t").textContent = S.canWrite ? t("lockNow") : t("unlockT");
  $("#t-unlock-d").textContent = S.canWrite ? t("lockNowD", (S.auth.by||"—")+(S.auth.role&&S.auth.role!=="owner"?` · ${t("role"+S.auth.role[0].toUpperCase()+S.auth.role.slice(1))}`:"")) : t("unlockD");
  renderNet(); renderInstall();
}

/* ---------------- Keyboard handling ---------------- */
const vv=window.visualViewport, root=document.documentElement;
/* Keyboard open? The visible height drops well below the tallest seen at this width (Chrome's address bar alone moves it
   ~60 px). When it closes while a box is still focused (Android Back closes the keyboard but keeps the cursor), leave the box so
   the tab bar, Add and total come back. Touch screens only (a laptop window being resized isn't a keyboard). */
let kbBaseH=0, kbBaseW=0, kbWas=false; const coarse=window.matchMedia?matchMedia("(pointer:coarse)"):{matches:false};
function kbTrack(){ const w=window.innerWidth, h=vv?vv.height:window.innerHeight;
  if(w!==kbBaseW){ kbBaseW=w; kbBaseH=0; } kbBaseH=Math.max(kbBaseH,window.innerHeight,h);
  const open=coarse.matches && kbBaseH-h>150; document.documentElement.classList.toggle("kbo",open);
  if(kbWas && !open){ const a=document.activeElement; if(a && a.matches && a.matches("input:not([type=checkbox]):not([type=file]):not([readonly]),textarea") && !a.closest("#sheet,#picker,#applock")) a.blur(); }
  kbWas=open; }
window.addEventListener("resize",kbTrack);
function vvSet(){ kbTrack(); if(!vv) return; const kb=Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop)); root.style.setProperty("--kb",(kb>60?kb:0)+"px"); root.style.setProperty("--vvh",Math.round(vv.height+(kb>60?0:kb))+"px"); try{ dockPos(); }catch{} }
if(vv){ vv.addEventListener("resize",vvSet); vv.addEventListener("scroll",vvSet); vvSet(); }
/* ---------------- Back button (installed app / Android) ----------------
 * One extra history entry acts as a guard. Each Back press: close what's open, else step back inside a sheet,
 * else go to Prices, else ask "Press back again to exit" and let a second press within 2 s leave the app.
 */
let backAt=0;
function pushGuard(){ try{ history.pushState({rb:1},""); }catch{} }
try{ if(!history.state || !history.state.rb){ history.replaceState({rb:0},""); pushGuard(); } }catch{}
window.addEventListener("popstate",()=>{
  { const vv=document.getElementById("vview"); if(vv){ vv.remove(); pushGuard(); return; } }
  { const fa=document.getElementById("fileact"); if(fa){ const x=fa.querySelector("#fa-x"); if(x) x.click(); pushGuard(); return; } }
  { const qp=document.getElementById("qpick"); if(qp && !qp.hidden){ qpClose(); pushGuard(); return; } }
  if(!$("#picker").hidden){ closePicker(null); pushGuard(); return; }
  if(!$("#sheet").hidden){
    sheetStep();
    pushGuard(); return;
  }
  if(S.tab!=="items" && !(DESK() && S.tab==="bill")){ setTab("items"); pushGuard(); return; }
  if(Date.now()-backAt<2000){ history.back(); return; }   // second press: leave
  backAt=Date.now(); toast(t("backExit")); pushGuard();
});
/* ---------------- Search at the bottom (phones) ----------------
 * The search box (and the round Add button) live in #dock on phones unless this phone chose "Top" in Settings. On a laptop the
 * search stays in the header. dockPos() measures where the dock goes: above the tab bar (Prices), above the total card (Bill), or
 * on the keyboard while typing; it also sets --docktop (dock's top edge from the bottom) and --toph (header height) for CSS. */
const sposNow=()=>ls.get("rb_spos","bottom")==="top"?"top":"bottom";
const SBOT=()=>!DESK() && sposNow()==="bottom";
function placeSearch(){ const on=SBOT(), dock=$("#dock"), sb=$("#searchbox"), fab=$("#fab"), rise=$("#rise"), bsr=$("#bill-search-results");
  root.classList.toggle("sbot",on); root.classList.toggle("sres-top",ls.get("rb_sres","near")==="top");
  if(on){ if(sb.parentNode!==dock){ dock.appendChild(sb); dock.appendChild(fab); } if(bsr.parentNode!==rise) rise.appendChild(bsr); }
  else { if(sb.parentNode===dock){ $("header.top").insertBefore(sb,$("#mictip")); document.body.insertBefore(fab,rise); } if(bsr.parentNode===rise) $("#view-bill").insertBefore(bsr,$("#heldrow")); }
  dock.hidden=!on; dockPos(); }
/** The total is never cut: if the amount doesn't fit its space, its size steps down until it does. */
/* The total must always be readable: shrink it a little, and if it still doesn't fit beside the buttons (narrow phone, big amount)
   give it its own line above them instead of shrinking it to an unreadable size. */
function sumFit(){ const bs=$("#bill-sum"), tc=$("#bill-total"); if(!bs) return; bs.style.fontSize=""; tc.classList.remove("tot-stack"); if(!bs.clientWidth) return;
  const fit=min=>{ let fs=parseFloat(getComputedStyle(bs).fontSize)||24; while(bs.scrollWidth>bs.clientWidth+1 && fs>min){ fs-=1; bs.style.fontSize=fs+"px"; } return bs.scrollWidth<=bs.clientWidth+1; };
  if(fit(17)) return; if(!DESK()){ bs.style.fontSize=""; tc.classList.add("tot-stack"); } fit(13); }
function bsPos(){ const H=window.innerHeight, t=$("#bill-total"), tb=$("nav.tabs"); let b=96, r=16;
  const tr=tb.getBoundingClientRect(); if(tr.width>0) r=Math.round(window.innerWidth-tr.right);
  if(tr.width>0){ root.style.setProperty("--tabl",Math.round(tr.left)+"px"); root.style.setProperty("--tabr",Math.round(window.innerWidth-tr.right)+"px"); }
  root.classList.toggle("billhas", !t.hidden);
  if(S.tab==="bill" && !t.hidden){ const x=t.getBoundingClientRect(); if(x.height){ b=H-x.top+12; root.style.setProperty("--billpad",Math.round(b+16)+"px"); } } else if(tr.height) b=H-tr.top+12;
  root.style.setProperty("--bsb",Math.max(12,Math.round(b))+"px"); root.style.setProperty("--bsr",Math.max(12,r)+"px"); }
function dockPos(){ try{ bsPos(); sumFit(); }catch{} if(!root.classList.contains("sbot")) return;
  const dock=$("#dock"), H=window.innerHeight, a=document.activeElement, qf=!!a && a.id==="q";
  const kb=parseFloat(root.style.getPropertyValue("--kb"))||0; let b;
  if(qf) b=kb+8;
  else if(S.tab==="bill" && !$("#bill-total").hidden){ const r=$("#bill-total").getBoundingClientRect(); b=r.height?H-r.top+8:96; }
  else { const r=$("nav.tabs").getBoundingClientRect(); b=r.height?H-r.top+10:14; }
  { const tr=$("nav.tabs").getBoundingClientRect(); if(tr.width>0){ root.style.setProperty("--tabl",Math.round(tr.left)+"px"); root.style.setProperty("--tabr",Math.round(window.innerWidth-tr.right)+"px"); } }   // total card as wide as the tab bar
  b=Math.max(8,Math.round(b)); dock.style.bottom=b+"px";
  { const W=window.innerWidth, ref=(S.tab==="bill" && !$("#bill-total").hidden && !qf) ? $("#bill-total").getBoundingClientRect() : $("nav.tabs").getBoundingClientRect();
    if(ref.width>0){ dockPos.l=Math.round(ref.left); dockPos.r=Math.round(W-ref.right); }
    dock.style.left=(dockPos.l??12)+"px"; dock.style.right=(dockPos.r??12)+"px"; }
  root.style.setProperty("--docktop",(b+(dock.offsetHeight||56))+"px");
  const hd=$("header.top"), th=hd?Math.round(hd.getBoundingClientRect().bottom):80; root.style.setProperty("--toph",th+"px");
  { const vt=vv?Math.round(vv.offsetTop):0; root.style.setProperty("--risetop",Math.max(th,vt+8)+"px"); }
  root.style.setProperty("--risemin",Math.max(120,H-th-(b+(dock.offsetHeight||56))-18)+"px"); }
window.addEventListener("resize",()=>dockPos());
/* While searching from the bottom bar, tapping a result's buttons (or a Bill-tab result row) keeps the focus in the search box, so
   the keyboard and the results stay put and the tap lands where it was aimed; several items can be added in a row. */
["pointerdown","mousedown"].forEach(ev=>document.addEventListener(ev,e=>{ if(!root.classList.contains("sbot") || !document.body.classList.contains("qtyp")) return;
  if(e.target.closest && e.target.closest("#rise .mini, #list [data-add], #list [data-decid], #list .mstep, #dock #q-clear")) e.preventDefault(); },true));
if(window.ResizeObserver){ const ro=new ResizeObserver(()=>dockPos()); ["#bill-total","nav.tabs","header.top","#dock"].forEach(s=>{ const e=document.querySelector(s); if(e) ro.observe(e); }); }
/* Header on phones: greeting + full shop name at the top of a page; one compact line once scrolled (iOS large-title pattern).
   Hysteresis (shrink past 72 px, grow back at the very top) and a long-enough page, so it can't flicker. */
let hdrMin=false;
function hdrSync(){ const r=document.documentElement, hd=$("header.top"); if(!hd) return;
  if(DESK() || document.body.classList.contains("typing")){ if(hdrMin){ hdrMin=false; r.classList.remove("hdr-min"); } return; }
  const y=window.scrollY, room=r.scrollHeight-window.innerHeight;
  const want = hdrMin ? y>4 : (y>72 && room>150);
  if(want!==hdrMin){ hdrMin=want; r.classList.toggle("hdr-min",want); try{ dockPos(); }catch{} } }
window.addEventListener("scroll",hdrSync,{passive:true});
/* Laptop / desktop: the bill stays open on the right, so there is no separate Bill tab. */
const deskMQ=window.matchMedia("(min-width:1024px)");
const DESK=()=>deskMQ.matches;
function applyDesk(){
  const d=DESK(); document.documentElement.classList.toggle("desk",d); placeSearch();
  const vb=$("#view-bill"); if(vb) vb.hidden = !(d || S.tab==="bill");
  const f=$("#side-foot"); if(f) f.innerHTML = `<div><kbd>/</kbd><span>${esc(t("kSearch"))}</span></div><div><kbd>Enter</kbd><span>${esc(t("kAdd"))}</span></div><div><kbd>Esc</kbd><span>${esc(t("kClose"))}</span></div>`;
}
deskMQ.addEventListener ? deskMQ.addEventListener("change",()=>{ applyDesk(); setTab(S.tab==="bill"&&DESK()?"items":S.tab); }) : deskMQ.addListener(()=>{ applyDesk(); setTab(S.tab); });
document.addEventListener("keydown",e=>{
  if(!DESK()) return;
  const a=document.activeElement, typing=a && a.matches && a.matches("input,textarea,select,[contenteditable=true]");
  const sheetOpen=!$("#sheet").hidden || !$("#picker").hidden;
  if(!sheetOpen && ((e.key==="/" && !typing) || ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="k"))){ e.preventDefault(); if(S.tab!=="items") setTab("items"); const q=$("#q"); q.focus(); q.select(); return; }
  if(e.key==="Escape" && !sheetOpen && a===$("#q") && $("#q").value){ $("#q").value=""; onQuery(""); }
});
let blurT;
function syncQe(){ const a=document.activeElement, qf=!DESK() && !!a && a.id==="q"; document.body.classList.toggle("qe", qf && !a.value.trim()); document.body.classList.toggle("qtyp",qf); try{ dockPos(); }catch{} }
document.addEventListener("focusin",e=>{
  syncQe();
  if(DESK()) return;   // phone-keyboard helpers are not needed on a laptop
  const el=e.target; if(!el.matches || !el.matches("input:not([type=checkbox]):not([type=file]):not([readonly]),textarea")) return;
  document.body.classList.toggle("tin", !!el.closest("#bill-total"));
  clearTimeout(blurT); document.body.classList.add("typing");
  if(el.closest(".top,#dock")) return;
  [80,350,700].forEach(d=>setTimeout(()=>{ if(document.activeElement===el) el.scrollIntoView({block:"center",behavior:d<100?"auto":"smooth"}); },d));
});
document.addEventListener("focusout",()=>{ blurT=setTimeout(()=>{ const a=document.activeElement; if(!a || !a.matches("input:not([type=checkbox]),textarea")) document.body.classList.remove("typing"); syncQe(); },200); });

/* ---------------- Tabs, search, toast ---------------- */
function setTab(tab){
  if(tab!==S.tab){ S.q=""; S.qTabs={}; S.limit=40; BL.q=""; duesQ=""; }   // moving to another tab starts with an empty search
  S.tab=tab; document.body.dataset.tab=tab; document.body.classList.remove("bsopen");
  if(tab==="bill" && Date.now()-(S._billRevAt||0)>5000){ S._billRevAt=Date.now(); setTimeout(()=>{ try{ checkRev(); }catch{} },0); }   // pick up a number another phone just used
  if(tab!=="tools"){ S.q=S.qTabs[tab]||""; const qi=$("#q"); qi.value=S.q; qi.placeholder=t(tab==="bill"?"billSearchPh":"searchPh"); $("#q-clear").hidden=!S.q; }
  if(DESK() && tab==="bill"){ tab="items"; S.tab="items"; }
  ["items","bill","tools"].forEach(k=>{ $("#view-"+k).hidden = k==="bill" ? !(k===tab || DESK()) : k!==tab; $("#tab-"+k).setAttribute("aria-selected",k===tab); });
  $("#searchbox").hidden = tab==="tools"; if(tab==="tools") $("#mictip").hidden=true;
  renderAll(); window.scrollTo(0,0);
}
const LD=(cls="")=>`<span class="ld ${cls}" role="progressbar" aria-label="${esc(t("loading"))}"></span>`;
const ldBlock=msg=>`<div class="ld-block">${LD("lg")}<span>${esc(msg||t("loading"))}</span></div>`;
const skelCards=(n,bill)=>`<div class="list" aria-busy="true">${Array.from({length:n},()=>bill?`<div class="skel-card bill"><div class="skel b"></div><div class="skel d"></div><div class="skel c"></div></div>`:`<div class="skel-card"><div class="skel a"></div><div class="skel b"></div><div class="skel d"></div><div class="skel c"></div></div>`).join("")}</div>`;
function btnBusy(b,on){ if(!b) return; if(on){ if(!b.dataset.label) b.dataset.label=b.innerHTML; b.classList.add("busy"); b.disabled=true; b.innerHTML=LD("sm on-dark")+b.dataset.label; } else { b.classList.remove("busy"); b.disabled=false; if(b.dataset.label){ b.innerHTML=b.dataset.label; delete b.dataset.label; } } }
/* Thin bar at the top of the screen while the app talks to the sheet (not for the quiet 25-second checks). */
let netBusy=0; function netTrack(p){ netBusy++; $("#topbar").classList.add("on"); const done=()=>{ netBusy=Math.max(0,netBusy-1); if(!netBusy) $("#topbar").classList.remove("on"); }; p.then(done,done); return p; }
const BUSY_MSGS=()=>[t("saving"),t("photoWorking")];
let toastT; function toast(msg){ const el=$("#toast"); /* shown at the top of the screen (see .toast CSS), clear of the bill and the keyboard */ const busy=BUSY_MSGS().includes(msg); el.innerHTML=(busy?LD("sm"):"")+esc(msg); el.classList.add("on"); clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove("on"),2800); }
let raf=0; function onQuery(v){ S.q=v; S.qTabs[S.tab==="bill"?"bill":"items"]=v; S.limit=40; $("#q-clear").hidden=!v; cancelAnimationFrame(raf); raf=requestAnimationFrame(()=>{ if(S.tab==="bill") renderBillSearch(); else renderList(); }); }
$("#q").addEventListener("input",e=>{ onQuery(e.target.value); syncQe(); if(e.target.value) $("#mictip").hidden=true; });
$("#q").addEventListener("keydown",e=>{ if(e.key==="Enter"){ if(can("manager") && looksLikeCommand(S.q)) openCmd(S.q,true);
  else if(DESK() && S.q.trim()){ const top=runSearch(S.q.trim()).res[0]; if(top){ addToBill(top.e.it.id); e.target.value=""; onQuery(""); } }
  else e.target.blur(); } });
/* Bill tab on phones: tap the round search button = the bar opens with the keyboard; ✕ empties it but keeps it open;
   leaving it (keyboard closed, tapped elsewhere, an item added) = back to the button. */
const bsOn=()=>!DESK() && S.tab==="bill";
function bsOpen(){ document.body.classList.add("bsopen"); const q=$("#q"); q.focus(); if(!root.classList.contains("sbot")) window.scrollTo(0,0);   /* search at the Top: results show under the bar, so start from the top */ try{ syncQe(); dockPos(); }catch{} }
function bsClose(){ if(!document.body.classList.contains("bsopen")) return; document.body.classList.remove("bsopen");
  const q=$("#q"); if(q.value){ q.value=""; onQuery(""); } try{ syncQe(); dockPos(); }catch{} }
let bsKeep=0;
$("#bsfab").addEventListener("click",bsOpen); $("#tot-find").addEventListener("click",bsOpen); $("#tot-find").setAttribute("aria-label",t("totFind"));
$("#mic").addEventListener("pointerdown",()=>{ bsKeep=Date.now(); },true);
$("#q").addEventListener("blur",()=>{ if(!bsOn()) return; setTimeout(()=>{ const a=document.activeElement; if(a && a.id==="q") return; if(Date.now()-bsKeep<1500) return; bsClose(); },60); });
document.addEventListener("pointerdown",e=>{ if(!bsOn() || !document.body.classList.contains("bsopen")) return; const a=document.activeElement; if(a && a.id==="q") return;
  if(e.target.closest && e.target.closest("#searchbox,#bill-search-results,#rise,#bsfab")) return; bsClose(); },true);
$("#q-clear").onclick=()=>{ $("#q").value=""; onQuery(""); $("#q").focus(); syncQe(); };
$("#lang-en").onclick=()=>{ S.lang="en"; ls.set("rb_lang","en"); applyLang(); };
$("#lang-hi").onclick=()=>{ S.lang="hi"; ls.set("rb_lang","hi"); applyLang(); };
$("#tab-items").onclick=()=>setTab("items"); $("#tab-bill").onclick=()=>{ setTab("bill"); checkRev(); }; $("#tab-tools").onclick=()=>setTab("tools");

/* Mic: real speech recognition where the browser has it (Chrome on Android, Safari on iPhone); keyboard mic otherwise. */
/* Long dictation for the wand. Phone browsers end a listening session after a short pause,
   so we quietly start a new one and keep everything already said, until the person taps Stop
   (or stays silent for 15 seconds). */
const isAndroid=/android/i.test(navigator.userAgent);
const dict={on:false,rec:null,base:"",said:"",btn:null,onText:null,onFail:null,idle:null,starts:0};
function dictShow(extra){ const body=(dict.said+(extra||"")).replace(/\s+/g," ").trim(); dict.onText&&dict.onText((dict.base?dict.base+"\n":"")+body); }
function dictIdle(){ clearTimeout(dict.idle); dict.idle=setTimeout(()=>{ if(dict.on){ dictStop(); toast(t("micStopped")); } },15000); }
function dictStart(btn,base,onText,onFail){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR||ls.get("rb_sr_bad",false)){ onFail(); return; }
  if(rec){ try{ rec.abort(); }catch{} rec=null; }
  Object.assign(dict,{on:true,base,said:"",btn,onText,onFail,starts:0});
  btn.classList.add("listening"); const l=btn.querySelector("span"); if(l) l.textContent=t("stopListening");
  toast(t("listeningLong")); dictIdle(); dictSession(SR);
}
function dictSession(SR){
  if(!dict.on) return;
  if(++dict.starts>80){ dictStop(); return; }
  let r; try{ r=new SR(); }catch{ dictStop(); dict.onFail&&dict.onFail(); return; }
  dict.rec=r; r.lang=S.lang==="hi"?"hi-IN":"en-IN"; r.interimResults=true; r.maxAlternatives=1;
  r.continuous=!isAndroid;   // Android repeats words in continuous mode; short sessions + restart are cleaner there
  let fin="", mid="", fatal=false;
  r.onresult=e=>{ fin=""; mid=""; for(let i=0;i<e.results.length;i++){ const x=e.results[i]; if(x.isFinal) fin+=x[0].transcript+" "; else mid+=x[0].transcript+" "; } dictShow(fin+mid); dictIdle(); };
  r.onerror=e=>{ if(e.error==="not-allowed"||e.error==="service-not-allowed"){ ls.set("rb_sr_bad",true); fatal=true; } else if(e.error==="audio-capture"||e.error==="network"||e.error==="language-not-supported"){ fatal=true; } };
  r.onend=()=>{ const got=(fin||mid).trim(); if(got) dict.said+=got+" "; dictShow(""); if(dict.rec===r) dict.rec=null;
    if(fatal){ const f=dict.onFail; dictStop(); f&&f(); return; }
    if(dict.on) setTimeout(()=>dictSession(SR), isAndroid?80:150); };
  try{ r.start(); }catch{ setTimeout(()=>dictSession(SR),300); }
}
function dictStop(){
  if(!dict.on && !dict.rec) return;
  dict.on=false; clearTimeout(dict.idle);
  const r=dict.rec; if(r){ try{ r.stop(); }catch{} }
  const b=dict.btn; if(b){ b.classList.remove("listening"); const l=b.querySelector("span"); if(l) l.textContent=t("speak"); }
}

let rec=null;
function listen(btn,onText,onFail){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(rec){ try{ rec.stop(); }catch{} return; }
  if(!SR || ls.get("rb_sr_bad",false)){ onFail(); return; }
  let got=false;
  try{
    rec=new SR(); rec.lang=S.lang==="hi"?"hi-IN":"en-IN"; rec.interimResults=true; rec.continuous=false; rec.maxAlternatives=1;
    btn.classList.add("listening"); toast(t("listening"));
    rec.onresult=e=>{ got=true; let s=""; for(const r of e.results) s+=r[0].transcript; onText(s); };
    rec.onerror=e=>{ if(e.error==="not-allowed"||e.error==="service-not-allowed"){ ls.set("rb_sr_bad",true); } if(e.error!=="no-speech"&&e.error!=="aborted") onFail(); };
    rec.onend=()=>{ btn.classList.remove("listening"); rec=null; };
    rec.start();
  }catch{ btn.classList.remove("listening"); rec=null; onFail(); }
}
$("#mic").onclick=e=>{ if(dict.on) dictStop(); listen(e.currentTarget, s=>{ $("#q").value=s; onQuery(s); $("#mictip").hidden=true; }, ()=>{ $("#mictip").hidden=false; $("#q").focus(); }); };
$("#mictip-x").onclick=()=>{ $("#mictip").hidden=true; };

document.addEventListener("pointerdown",e=>{ const a=e.target.closest&&e.target.closest("[data-add]"); if(a) window.__addSrc=a; },true);
document.addEventListener("click",e=>{
  { const ly=e.target.closest("[data-layout]"); if(ly){ ls.set("rb_layout",gridOn()?"list":"grid"); renderList(); return; } }
  { const so=e.target.closest("[data-sort]"); if(so){ if(so.dataset.sort!==S.sortBy) setSort(so.dataset.sort); return; } }
  const fc=e.target.closest("[data-filter]"); if(fc){ S.filter=fc.dataset.filter; S.limit=40; renderList(); return; }
  const dd=e.target.closest("[data-decid]"); if(dd){ e.stopPropagation(); decFromBill(dd.dataset.decid); return; }
  const a=e.target.closest("[data-add]"); if(a){ e.stopPropagation(); addToBill(a.dataset.add); return; }
  if(e.target.closest(".mstep")) return;
  const card=e.target.closest(".card[data-id]"); if(card){ openDetail(card.dataset.id); return; }
  const pick=e.target.closest("[data-pick]"); if(pick){ $("#q").value=pick.dataset.pick; onQuery(pick.dataset.pick); return; }
  const act=e.target.closest("[data-act]"); if(act){ const k=act.dataset.act;
    if(k==="more"){ S.limit+=40; renderList(); } else if(k==="add") openEdit(null); else if(k==="addq") openEdit(null,S.q.trim());
    else if(k==="bulkadd") openBulkAdd(); else if(k==="bills") openBills(); else if(k==="printlast") printInv(ls.get("rb_lastinv",null)); else if(k==="cmd") openCmd(""); else if(k==="cmdq") openCmd(S.q.trim(),true); return; }
  const inc=e.target.closest("[data-inc]"), dec=e.target.closest("[data-dec]"), rm=e.target.closest("[data-rm]");
  if(inc||dec){ const i=+(inc||dec).dataset[inc?"inc":"dec"]; const l=S.bill[i]; l.qty=stepQty(l.qty,l.unit,!!inc); if(l.qty===0) S.bill.splice(i,1); qpClose(); saveBill(); renderBill(); return; }
  if(rm){ S.bill.splice(+rm.dataset.rm,1); saveBill(); renderBill(); return; }
  const sw=e.target.closest("[data-unitsw]"); if(sw){ const l=S.bill[+sw.dataset.unitsw]; const it=S.byId.get(l.id); if(!it||!hasAlt(it)) return;
    if(l.alt){ l.alt=false; l.unit=it.unit; l.rate=+it.sell||0; } else { l.alt=true; l.unit=it.altUnit; l.rate=altPrice(it); }
    l.buy=itemBuyFor(it,l.alt);
    saveBill(); renderBill(); }
});
document.addEventListener("input",e=>{
  const q=e.target.dataset?.qty, r=e.target.dataset?.rate;
  if(q!=null){ const l=S.bill[+q], v=parseQty(e.target.value,l&&l.unit); if(l && !isNaN(v)&&v>=0){ l.qty=v; saveBill(); updateBillTotals(); qpHint(e.target,+q); } else if(l) qpHint(e.target,+q); }
  if(r!=null){ const v=toNum(e.target.value); if(!isNaN(v)&&v>=0){ S.bill[+r].rate=v; saveBill(); updateBillTotals(); } }
  const h=e.target.dataset?.hsn;
  if(h!=null){ const v=e.target.value.replace(/\D/g,"").slice(0,8); if(v!==e.target.value) e.target.value=v; const l=S.bill[+h]; if(!l) return; if(v) l.hsn=v; else delete l.hsn; saveBill(); updateBillTotals(); }
});
document.addEventListener("click",e=>{ const fq=e.target.closest("[data-fq]"); if(fq){ const i=+fq.dataset.fq, el=$("#qpick"), open=el && !el.hidden && +el.dataset.i===i && !el.classList.contains("hint");
    if(fq.readOnly){ if(open) qpClose(); else qpOpen(i,fq); return; }
    if(!open && DESK()){ qpOpen(i,fq); setTimeout(()=>{ try{ fq.select(); }catch{} },0); } return; }   // laptop: strip opens, and typing still works (it closes the strip)
  if(!e.target.closest("#qpick")) qpClose(); },true);
document.addEventListener("keydown",e=>{ if(e.target.dataset?.fq!=null && (e.key==="Escape"||e.key==="Enter")){ const el=$("#qpick"); if(el && !el.hidden){ if(e.key==="Escape") e.stopPropagation(); qpClose(); } if(e.key==="Enter") e.target.blur(); } },true);
/* Leaving a typed qty box: redraw so it shows "250g" again (and goes back to tap-to-pick). */
document.addEventListener("focusout",e=>{ if(e.target.dataset?.qty!=null && e.target.classList.contains("fq")){ setTimeout(()=>{ const el=$("#qpick"); if(el && el.classList.contains("hint") && !el.hidden) return; if(!document.activeElement || document.activeElement.dataset?.qty==null) renderBill(); },150); } });
document.addEventListener("scroll",qpFollow,{passive:true,capture:true}); window.addEventListener("resize",()=>qpFollow());
/* HSN left empty on a bill line goes back to the item's own HSN. */
document.addEventListener("focusout",e=>{ if(e.target.dataset?.hsn!=null && !e.target.value.trim()){ const l=S.bill[+e.target.dataset.hsn]; if(l) e.target.value=lineInfo(l).hsn; } });
$("#cust").value=S.cust; $("#cust").addEventListener("input",e=>{ S.cust=e.target.value; ls.set("rb_cust",S.cust); updateBillTotals(); });
$("#cust").addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); $("#cust-mob").focus(); } });
$("#cust-mob").value=S.mob; $("#cust-mob").addEventListener("input",e=>{ S.mob=e.target.value; ls.set("rb_mob",S.mob); updateBillTotals(); custLookup(); custXSync(); });
$("#cust-x").onclick=()=>{ custClear(); toast(t("cuCleared")); };
$("#pay-seg").addEventListener("click",e=>{ const b=e.target.closest("[data-pay]"); if(b) setPay(b.dataset.pay); });
$("#pm-row").addEventListener("click",e=>{ const b=e.target.closest("[data-pm]"); if(b) setPm(b.dataset.pm); });
$("#pay-recv").value=S.recv; $("#pay-recv").addEventListener("input",e=>{ S.recv=e.target.value; ls.set("rb_recv",S.recv); e.target.classList.remove("need"); updateBillTotals(); });
["#cust","#cust-mob"].forEach(k=>$(k).addEventListener("input",e=>e.target.classList.remove("need")));
renderPay();
$("#bill-profit").onclick=()=>{ S.profitShown=!S.profitShown; updateBillTotals(); };
document.addEventListener("visibilitychange",()=>{ if(document.hidden && S.profitShown){ S.profitShown=false; updateBillTotals(); } });

$("#cust").addEventListener("input",()=>{ S.custAuto=""; });

[["#cust","name"],["#cust-mob","mob"],["#cust-gstin","gstin"]].forEach(([sel,field])=>{
  const el=$(sel);
  el.addEventListener("input",()=>{ SUG.on=-1; if(!CUSTD) custdGet().then(()=>{ custIdx=null; sugShow(field); }); sugShow(field); });
  el.addEventListener("focus",()=>{ custdRefresh().then(C=>{ if(C){ custIdx=null; if(document.activeElement===el && el.value) sugShow(field); } }); });   // never opens on tap alone
  el.addEventListener("blur",()=>setTimeout(()=>{ if(!["cust","cust-mob","cust-gstin"].includes((document.activeElement||{}).id)) sugClose(); },120));
  el.addEventListener("keydown",e=>{ if(SUG.field!==field || !SUG.list.length) return;   // capture: runs before Enter moves to the next box
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); const n=SUG.list.length; SUG.on = e.key==="ArrowDown" ? (SUG.on+1)%n : (SUG.on<=0?n-1:SUG.on-1); sugShow(field); }
    else if(e.key==="Enter" && SUG.on>=0){ e.preventDefault(); e.stopImmediatePropagation(); sugPick(SUG.on); }
    else if(e.key==="Escape"){ e.stopImmediatePropagation(); sugClose(); } },true);
});
["#sug-cust","#sug-gstin"].forEach(k=>{ const b=$(k); b.addEventListener("pointerdown",e=>e.preventDefault()); b.addEventListener("mousedown",e=>e.preventDefault());
  b.addEventListener("click",e=>{ const x=e.target.closest("[data-sug]"); if(x) sugPick(+x.dataset.sug); }); });
$("#bill-wa").addEventListener("click",e=>{ if($("#bill-wa").classList.contains("busy")){ e.preventDefault(); return; } if(!payCheck()){ e.preventDefault(); return; } if(S.gst && !gstinOk(S.custGstin)){ e.preventDefault(); setOpen("#bh-more","#bh-extra","rb_bh_open",true); $("#cust-gstin").focus(); toast(t("gstinBad")); return; } if(normMobile(S.mob)===null){ e.preventDefault(); $("#cust-mob").focus(); toast(t("mobBad")); return; } if(!S.editing && navigator.onLine!==false && apiUrl()){ e.preventDefault(); shareConfirmed(); return; }   // a new bill: the sheet confirms its number before WhatsApp opens
  $("#bill-wa").href=waLink(); finishBill({keep:true}); S.pendShare=true; ls.set("rb_pshare",1); });
$("#bill-no").addEventListener("input",e=>{ const v=Math.floor(toNum(e.target.value)); if(v>=1){ S.billNoOvr = v===autoBillNo()?null:v; ls.set("rb_billno",S.billNoOvr); const keep=document.activeElement; updateBillTotals(); } });
$("#bill-no").addEventListener("blur",e=>{ const v=Math.floor(toNum(e.target.value)); if(!(v>=1)){ toast(t("billNoManualBad")); } e.target.value=curBillNo(); updateBillTotals(); });
$("#bill-no").addEventListener("keydown",e=>{ if(e.key==="Enter") e.target.blur(); });
document.addEventListener("click",e=>{ if(e.target.closest("#bill-useauto")){ S.billNoOvr=null; ls.set("rb_billno",null); updateBillTotals(); } });
$("#edit-cancel").onclick=()=>{ if(S.editing && S.editing.fresh){ if(draftSig()!==S.editing.sig) saveEdit(); else { endEdit(); } return; } endEdit(); toast(t("editCancelled")); };
$("#gst-chip").onclick=()=>{ S.gst=!S.gst; ls.set("rb_gst",S.gst); if(!S.editing){ S.billNoOvr=null; ls.set("rb_billno",null); } renderBill(); };
$("#igst-chip").onclick=()=>{ S.igst=!S.igst; ls.set("rb_igst",S.igst); updateBillTotals(); };
$("#igst-on").onchange=e=>{ S.igst=e.target.checked; ls.set("rb_igst",S.igst); updateBillTotals(); };
setOpen("#bh-more","#bh-extra","rb_bh_open",ls.get("rb_bh_open",false));
setOpen("#tot-more","#tot-extra","rb_tot_open",ls.get("rb_tot_open",false));
$("#bh-more").onclick=()=>setOpen("#bh-more","#bh-extra","rb_bh_open",$("#bh-extra").hidden);
$("#tot-more").onclick=()=>setOpen("#tot-more","#tot-extra","rb_tot_open",$("#tot-extra").hidden);
$("#bh-no-btn").onclick=()=>{ setOpen("#bh-more","#bh-extra","rb_bh_open",true); if(!S.editing){ const i=$("#bill-no"); i.focus(); i.select(); } };
$("#ro-x").onclick=()=>{ ls.set("rb_ro_x",true); $("#ro-note").hidden=true; };
$("#cust-gstin").value=S.custGstin; $("#cust-gstin").addEventListener("input",e=>{ S.custGstin=e.target.value.toUpperCase(); ls.set("rb_cgstin",S.custGstin);
  const g=S.custGstin.trim(), sh=shopStateCode(); if(gstinOk(g) && g.length===15 && sh){ const other=g.slice(0,2)!==sh; if(other!==S.igst){ S.igst=other; ls.set("rb_igst",S.igst); } }   // out-of-state GSTIN → IGST
  updateBillTotals(); });
$("#pos-sel").innerHTML=`<option value="">—</option>`+STATES.map(([c,n])=>`<option value="${c}">${n} (${c})</option>`).join(""); $("#pos-sel").value=S.posSel;
$("#pos-sel").onchange=e=>{ S.posSel=e.target.value; ls.set("rb_pos",S.posSel); updateBillTotals(); };
$("#po-add").onclick=()=>{ S.poOpen=true; poRender(); $("#po-no").focus(); };
$("#po-x").onclick=()=>{ S.poOpen=false; poSet(null); updateBillTotals(); };
$("#po-no").addEventListener("input",e=>{ poSet({...S.po, no:e.target.value}); updateBillTotals(); });
$("#po-date").addEventListener("input",e=>{ poSet({...S.po, date:e.target.value}); updateBillTotals(); });
$("#bill-done").onclick=()=>{ if(!payCheck()) return; if(S.gst && !gstinOk(S.custGstin)){ setOpen("#bh-more","#bh-extra","rb_bh_open",true); $("#cust-gstin").focus(); toast(t("gstinBad")); return; } if(normMobile(S.mob)===null){ $("#cust-mob").focus(); toast(t("mobBad")); return; } finishBill(); };
$("#bill-copy").onclick=async()=>{ const txt=billText(); try{ await navigator.clipboard.writeText(txt); toast(t("copied")); }catch{ openSheet(t("billTitle"),`<textarea id="bill-txt" readonly>${esc(txt)}</textarea>`); const ta=$("#bill-txt"); ta.select(); toast(t("copyFail")); } };
$("#bill-clear").onclick=()=>{ $("#bill-clear-confirm").hidden=false; };
$("#bill-clear-no").onclick=()=>{ $("#bill-clear-confirm").hidden=true; };
$("#bill-clear-yes").onclick=()=>{ poSet(null); S.poOpen=false; S.cash=""; S.pm=""; ls.set("rb_pm",""); renderPay(); S.custAuto=""; S.custQ=""; showCustHint(null); S.profitShown=false; S.bill=[]; S.cust=""; S.mob=""; $("#cust").value=""; $("#cust-mob").value=""; ls.set("rb_cust",""); ls.set("rb_mob",""); saveBill(); $("#bill-clear-confirm").hidden=true; renderBill(); };

/* ---------------- Sheet ---------------- */
let sheetOnClose=null;
/* ---- Sheet back-stack ----
 * Opening a screen while another is showing puts the current one on SHEET_STK: its live DOM (so its buttons keep working),
 * footer, title, classes, scroll position and onClose. ← / Back / Cancel (sheetBack) put it back exactly as it was.
 * A parent screen opens with a key (sheetKey("settings") just before openSheet): opening a key that's already on the stack
 * (e.g. openSettings() after saving a person) goes back to that level with fresh content and the same scroll position, and
 * a key that's already showing just redraws in place. A legacy "*-back" button click counts as going back, so the parent it
 * re-opens replaces the current level instead of stacking. ✕ (closeSheet) clears everything. */
let SHEET_STK=[], sheetCurKey="", sheetKeyNext="", sheetGoingBack=0, sheetNo=0;
const sheetKey=k=>{ sheetKeyNext=String(k); };
function sheetSnap(){ const b=$("#sheet-body"), f=$("#sheet-foot"), sh=$("#sheet"), x={key:sheetCurKey, title:$("#sheet-title").textContent, scroll:b.scrollTop, cls:sh.className, footHidden:f.hidden, onClose:sheetOnClose, body:document.createDocumentFragment(), foot:document.createDocumentFragment()};
  while(b.firstChild) x.body.appendChild(b.firstChild); while(f.firstChild) x.foot.appendChild(f.firstChild); return x; }
/** Hold a scroll position while the screen's content finishes loading (cards that fill in a moment later). Stops on a touch. */
function sheetKeepScroll(y){ const b=$("#sheet-body"), t0=Date.now(); let stop=false; const halt=()=>{ stop=true; };
  b.addEventListener("touchstart",halt,{once:true,passive:true}); b.addEventListener("wheel",halt,{once:true,passive:true});
  const step=()=>{ if(stop || Date.now()-t0>1500) return; if(Math.abs(b.scrollTop-y)>2 && b.scrollHeight-b.clientHeight>0) b.scrollTop=y; requestAnimationFrame(step); }; step(); }
/** One level back (exactly as it was), or close when nothing is under this screen. */
function sheetBack(){ const prev=SHEET_STK.pop(); if(!prev){ closeSheet(); return; }
  const b=$("#sheet-body"), f=$("#sheet-foot"), sh=$("#sheet");
  b.replaceChildren(prev.body); f.replaceChildren(prev.foot); f.hidden=prev.footHidden; $("#sheet-title").textContent=prev.title;
  sh.className=prev.cls; sheetCurKey=prev.key; sheetOnClose=prev.onClose; b.scrollTop=prev.scroll; sheetKeepScroll(prev.scroll); sheetNavSync(); }
/** Cancel on a screen: back one level if there is one, else close. */
const sheetCancel=()=>sheetBack();
function openSheet(title,body,foot,{full=false,onClose=null,key=""}={}){
  const sh0=$("#sheet"), open=!sh0.hidden && sh0.classList.contains("on"); key=key||sheetKeyNext||("s"+(++sheetNo)); sheetKeyNext=""; let keep=0;
  if(!open) SHEET_STK=[];
  else if(key===sheetCurKey) keep=$("#sheet-body").scrollTop;                       // the same screen redrawn: stay where you were
  else { const i=SHEET_STK.findIndex(x=>x.key===key);
    if(i>=0){ keep=SHEET_STK[i].scroll; SHEET_STK=SHEET_STK.slice(0,i); }           // back to a screen further down, fresh
    else if(!(sheetGoingBack && Date.now()-sheetGoingBack<2000)) SHEET_STK.push(sheetSnap()); }   // a new screen on top
  sheetGoingBack=0; sheetCurKey=key;
  $("#sheet").classList.remove("hero-mode");
  $("#sheet-title").textContent=title; $("#sheet-body").innerHTML=body;
  const f=$("#sheet-foot"); f.innerHTML=foot||""; f.hidden=!foot;
  const sh=$("#sheet"), sc=$("#scrim"); sh.classList.toggle("full",full); sh.hidden=false; sc.hidden=false;
  requestAnimationFrame(()=>{ sh.classList.add("on"); sc.classList.add("on"); });
  $("#sheet-body").scrollTop=0; sheetOnClose=onClose; if(keep) sheetKeepScroll(keep);
  sheetNavSync();
}
function closeSheet(){ SHEET_STK=[]; sheetCurKey=""; if(typeof vSnackHide==="function") vSnackHide(); const sh=$("#sheet"), sc=$("#scrim"); if(document.activeElement && sh.contains(document.activeElement)) document.activeElement.blur(); sh.classList.remove("on"); sc.classList.remove("on"); setTimeout(()=>{ if(!sh.classList.contains("on")){ sh.hidden=true; sc.hidden=true; $("#sheet-body").innerHTML=""; } },220); if(sheetOnClose){ const f=sheetOnClose; sheetOnClose=null; f(); } }
/* Sheet navigation. A sheet showing an inner screen (a bill opened from All bills, a customer from Credit, a vendor's bill …)
   has a "*-back" button in its body. The header ← (left, next to the title), a tap outside and the phone's Back go up ONE
   level through it. ✕ (right) always closes the whole sheet in one tap, from any depth. On inner screens ✕ shows a small
   "all" tag so it reads as "close all". The body's own "← Back" pill is hidden; the header ← replaces it. */
function sheetSubBack(){ return [...document.querySelectorAll('#sheet-body button[id$="-back"]')].find(b=>b.offsetParent!==null && !b.disabled); }
function sheetStep(){ const b=sheetSubBack(); if(b) b.click(); else sheetBack(); }
/* a screen's own "← …" back button (clicked by the user, the header ← or the phone's Back) means "going back" */
$("#sheet-body").addEventListener("click",e=>{ if(e.target.closest('button[id$="-back"]')) sheetGoingBack=Date.now(); },true);
function sheetNavSync(){ const sub=!!sheetSubBack() || SHEET_STK.length>0, sh=$("#sheet"); sh.classList.toggle("has-sub",sub); $("#sheet-back").hidden=!sub;
  $("#sheet-close").setAttribute("aria-label", sub?t("closeAll"):t("close")); }
$("#sheet-close").onclick=closeSheet; $("#sheet-back").onclick=sheetStep; $("#scrim").onclick=sheetStep;
{ let q=0; new MutationObserver(()=>{ if(q) return; q=requestAnimationFrame(()=>{ q=0; sheetNavSync(); }); }).observe($("#sheet-body"),{childList:true,subtree:true,attributes:true,attributeFilter:["hidden","style","class"]}); }
document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ if(!$("#picker").hidden) closePicker(null); else if(!$("#sheet").hidden) closeSheet(); } });

/* ---------------- Unit picker (replaces native dropdowns) ---------------- */
let pickResolve=null;
function pickUnit(current){
  return new Promise(res=>{
    pickResolve=res;
    $("#picker-title").textContent=t("pickUnit");
    $("#picker-grid").innerHTML=S.cfg.units.map(u=>`<button type="button" data-u="${esc(u.code)}" aria-pressed="${u.code===current}"><b>${esc(u.code)}</b>${u.hi?`<span>${esc(u.hi)}</span>`:""}</button>`).join("");
    const known=S.cfg.units.some(u=>u.code===current);
    const oi=$("#picker-other"); oi.value=known?"":(current||""); oi.placeholder=t("otherUnit");
    $("#picker-ok").textContent=t("ok");
    $("#picker").hidden=false;
  });
}
function closePicker(v){ $("#picker").hidden=true; if(document.activeElement===$("#picker-other")) $("#picker-other").blur(); const r=pickResolve; pickResolve=null; r&&r(v); }
$("#picker-grid").addEventListener("click",e=>{ const b=e.target.closest("[data-u]"); if(b) closePicker(b.dataset.u); });
$("#picker-ok").onclick=()=>{ const v=$("#picker-other").value.trim(); closePicker(v||null); };
$("#picker-other").addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); $("#picker-ok").click(); } });
$("#picker").addEventListener("click",e=>{ if(e.target.id==="picker") closePicker(null); });
function unitBtnHTML(id,val,extra=""){ return `<button type="button" class="unitbtn" id="${id}" data-unit="${esc(val)}" ${extra}><span>${esc(unitLabelFull(val))}</span></button>`; }
function unitLabelFull(u){ const h=unitHi(u); return S.lang==="hi"&&h ? `${h} (${u})` : (u||"—"); }
async function onUnitBtn(btn,cb){ const v=await pickUnit(btn.dataset.unit); if(v==null) return; btn.dataset.unit=v; btn.querySelector("span").textContent=unitLabelFull(v); cb&&cb(v); }




/* ---------------- Talking to the Google Sheet ---------------- */
function apiGet(params){ const p=apiGet0(params); return (params.action==="rev"||params.action==="thumbs") ? p : netTrack(p); }
/** Price list and photos: asked for with this phone's sign-in (POST, script v44+; anonymous GETs get nothing since then). An older script answers bad_action: then the old GET. */
async function apiRead(params){
  if(S.auth && S.auth.tok && !S.auth.pending && !(S.sv>0 && S.sv<44)){
    try{ return await apiPost0(params); }catch(e){ if(!(e && e.code==="bad_action")) throw e; } }
  return apiGet0(params); }
const BILL_CHANGES=new Set(["updateBill","cancelBill","restoreBill","recordPayment","undoPayment","takeBill","restoreBackup"]);
function apiPost(body){ const bc=body && BILL_CHANGES.has(body.action); if(bc) blcDirty(); const p=netTrack(apiPost0(body)); if(bc) p.then(()=>blcSoon(600),()=>{}); return p; }
/** Request timings on this phone (per shop), sent to the shop's script about once an hour (perfSend) for the admin dashboard's Speed section. rev/thumbs aren't kept (they're tiny and constant). */
/** This phone's own script errors go to the shop's script (memory only there), so they show on the admin dashboard → Errors.
    Up to 10 different errors per app start; the app's expected failures (offline, wrong PIN…) aren't errors and aren't sent. */
const ERR_SENT=new Set(); let errN=0;
function errReport(m,w,st){ try{ m=String(m||"").slice(0,300); w=String(w||""); st=String(st||"");
  if(!m || /ResizeObserver loop|^Script error\.?$/i.test(m) || /-extension:\/\//.test(w+st)) return;
  const k=m+"|"+w; if(ERR_SENT.has(k) || ++errN>10) return; ERR_SENT.add(k);
  if(navigator.onLine===false || !apiUrl() || !(S.sv>=36)) return;   // older scripts would check a PIN first and count it as wrong
  fetch(apiUrl(),{method:"POST",keepalive:true,redirect:"follow",body:JSON.stringify({action:"clientErr",shop:SHOP.code,dev:DEV,by:(S.auth&&S.auth.by)||"",...(S.auth&&S.auth.tok?{tok:S.auth.tok}:{}),
    e:{m,w:w.slice(0,160),st:st.slice(0,500),ua:navigator.userAgent.slice(0,90),tab:S.tab||""}})}).catch(()=>{}); }catch{} }
window.addEventListener("error",e=>{ if(e && e.message) errReport(e.message,(e.filename||"").split("/").pop().split("?")[0]+":"+e.lineno+":"+e.colno,e.error&&e.error.stack); });
window.addEventListener("unhandledrejection",e=>{ const r=e&&e.reason; if(!r || (r.code && !r.stack)) return; errReport(r.message||String(r),"promise",r.stack); });
function perfAdd(action,t0,j){ if(!action || action==="rev" || action==="thumbs" || action==="perfIn" || action==="clientErr") return;
  try{ const a=ls.get("rb_perf",[]); a.push([action,Math.round(performance.now()-t0),j&&typeof j.ms==="number"?j.ms:null,Date.now()]); ls.set("rb_perf",a.slice(-300)); }catch{} }
/** About once an hour (from the 25-second check): this phone's timings since the last send go to the shop's script (v47+), which keeps 14 days
    of daily summaries for the dashboard. Signed-in phones only; nothing is shown on the phone. */
let perfSending=false;
function perfSend(){ if(perfSending || !(S.auth&&S.auth.tok) || !(S.sv>=47) || navigator.onLine===false) return;
  const sent=ls.get("rb_perf_sent",0), now=Date.now(); if(now-ls.get("rb_perf_try",0)<3600000) return; ls.set("rb_perf_try",now);
  const rows=ls.get("rb_perf",[]).filter(r=>r[3]>sent); if(!rows.length) return;
  perfSending=true; apiPost0({action:"perfIn",rows,dl:devLabel()}).then(j=>{ if(j&&j.ok) ls.set("rb_perf_sent",Math.max(...rows.map(r=>r[3]))); }).catch(()=>{}).finally(()=>{ perfSending=false; }); }
async function apiGet0(params){
  const t0=performance.now();
  const u=apiUrl()+"?"+new URLSearchParams({...params,...(params.action==="list"&&params.k===undefined?{k:ls.get("rb_view","")}:{}),_:String(Date.now())});
  const r=await fetch(u,{cache:"no-store",redirect:"follow"});
  if(!r.ok) throw {code:"http"};
  const j=await r.json(); perfAdd(params.action,t0,j);
  if(j.shop && j.shop!==SHOP.code){ shopMismatch(); throw {code:"wrong_shop"}; }
  if(!j.ok) throw {code:j.error||"server"}; return j;
}
async function apiPost0(body){
  if(navigator.onLine===false) throw {code:"offline"};
  const a=S.auth||{};
  const t0=performance.now();
  const r=await fetch(apiUrl(),{method:"POST",redirect:"follow",body:JSON.stringify({...(a.tok?{tok:a.tok}:{pin:a.pin}),by:a.by||"",env:S.cfg.mode,dev:DEV,k:ls.get("rb_view",""),shop:SHOP.code,...body})});
  if(!r.ok) throw {code:"http"};
  const j=await r.json(); perfAdd(body&&body.action,t0,j);
  if(j.shop && j.shop!==SHOP.code){ shopMismatch(); throw {code:"wrong_shop"}; }
  if(!j.ok){ const c=j.error;
    if(c==="no_test") setTimeout(noTestNow,0);
    if(c==="bad_session" && a.tok && S.auth && S.auth.tok===a.tok) setTimeout(()=>signedOut("siGone"),0);
    if(c==="shop_pin_off" && a.tok && S.auth && S.auth.tok===a.tok) setTimeout(()=>signedOut("shopPinOff"),0);   // signed in with the shop PIN, which the owner has now switched off
    if(c==="pending" && a.tok && S.auth && S.auth.tok===a.tok && !S.auth.pending){ S.auth={...S.auth,pending:true}; ls.set("rb_auth",S.auth); setTimeout(()=>appLock(),0); }
    if(c==="need_signin" && a.pin && !a.tok) setTimeout(()=>signedOut("siNeed"),0);
    if(c==="paused") shopPausedNote();
    throw {code:c||"server", existing:j.existing}; }
  return j;
}
function errMsg(e){ const c=e&&e.code; if(c==="bad_pin") return t("wrongPin"); if(c==="shop_pin_off") return t("shopPinOff"); if(c==="pin_taken") return t("pplTaken"); if(c==="pin_short") return t("pinShort"); if(c==="pin_easy") return t("pinEasy"); if(c==="needs_manager") return t("needsManager"); if(c==="pending") return t("pendStill"); if(c==="paused") return t("pausedNote"); if(c==="need_signin") return t("siNeed"); if(c==="bad_code"||c==="no_dir") return t("shopBad"); if(c==="dir_locked") return t("shopWait"); if(c==="not_ready") return t("shopNotReady"); if(c==="locked") return t("lockedOut"); if(c==="offline") return t("offlineWrite"); if(c==="image_too_large") return t("imgFail"); if(c==="not_allowed") return t("notAllowed"); if(c==="bad_action") return t("oldScript"); if(c==="bill_changed") return t("billChanged"); if(c==="bad_email") return t("bkBadEmail"); if(c==="backup_not_found") return t("bkFail"); return t("writeFail"); }
let chain=Promise.resolve();
function enqueue(fn){ const p=chain.then(fn); chain=p.catch(()=>{}); return p; }
let resyncT; function resyncSoon(){ clearTimeout(resyncT); resyncT=setTimeout(sync,1500); }
/** Send a change. `local` updates the screen right away; if the sheet refuses, we reload the truth. */
async function write(body,local){
  if(navigator.onLine===false){ toast(t("offlineWrite")); throw {code:"offline"}; }
  if(local){ local(); afterLocal(); }
  try{ const j=await enqueue(()=>apiPost(body)); return j; }
  catch(e){ toast(errMsg(e)); if(e.code==="bad_pin"){ S.auth=null; ls.set("rb_auth",null); S.canWrite=false; renderAll(); } sync(); throw e; }
}
function afterLocal(){ sortItems(S.items); const old=S.byId; S.byId=new Map(S.items.map(i=>[i.id,i])); billFollow(old,false); buildIndex(); saveCache(); renderList(); renderBadge(); if(S.tab==="bill") renderBill(); }
function upsertLocal(rec){ const i=S.items.findIndex(x=>x.id===rec.id); if(i>=0) S.items[i]={...S.items[i],...rec}; else if(rec.name) S.items.push(rec); }   /* a change to an item that is gone (deleted on another phone) adds nothing */
function mergeSaved(saved){ for(const it of saved||[]){ const key=it.tmp||it.id; const i=S.items.findIndex(x=>x.id===key); const clean={...it}; delete clean.tmp; clean.pending=false;
    if(i>=0){ const old=S.items[i]; if(it.tmp && S.thumbs[it.tmp]){ S.thumbs[it.id]=S.thumbs[it.tmp]; delete S.thumbs[it.tmp]; } if(it.tmp) S.bill.forEach(l=>{ if(l.id===it.tmp) l.id=it.id; }); S.items[i]={...old,...clean, imgV: clean.imgV||old.imgV||0, imgs: clean.imgV?(clean.imgs||old.imgs||1):(old.imgs||0)}; } else S.items.push(clean); }
  saveBill(); afterLocal(); }
const tmpId=()=>"tmp_"+Math.random().toString(36).slice(2,10);
const byName=()=> (S.auth&&S.auth.by)||"";

/* Local thumbnail store (IndexedDB) so pictures don't download every time. */
const idb=(()=>{ let dbp=null;
  function open(){ if(dbp) return dbp; dbp=new Promise((res,rej)=>{ try{ const r=indexedDB.open(SHOP_MAIN?"ratebook":"ratebook_"+SHOP.code,1); r.onupgradeneeded=()=>{ r.result.createObjectStore("thumbs"); r.result.createObjectStore("images"); }; r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }catch(e){ rej(e); } }); return dbp; }
  function run(store,mode,fn){ return open().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(store,mode); const req=fn(tx.objectStore(store)); tx.oncomplete=()=>res(req&&("result" in req)?req.result:undefined); tx.onerror=()=>rej(tx.error); })); }
  return { get:(s,k)=>run(s,"readonly",st=>st.get(k)).catch(()=>undefined), set:(s,k,v)=>run(s,"readwrite",st=>st.put(v,k)).catch(()=>{}), del:(s,k)=>run(s,"readwrite",st=>st.delete(k)).catch(()=>{}),
    all:s=>open().then(db=>new Promise((res)=>{ const out={}; const tx=db.transaction(s,"readonly"); const c=tx.objectStore(s).openCursor(); c.onsuccess=()=>{ const cur=c.result; if(cur){ out[cur.key]=cur.value; cur.continue(); } }; tx.oncomplete=()=>res(out); tx.onerror=()=>res(out); })).catch(()=>({})) };
})();
async function loadFull(it){
  const c=await idb.get("images",it.id); if(c && c.v===it.imgV) return c.d;
  try{ const j=await netTrack(apiRead({action:"image",id:it.id})); if(j.data){ idb.set("images",it.id,{v:it.imgV,d:j.data}); return j.data; } }catch{}
  return c?c.d:null;
}






$("#t-bills").onclick=()=>{ billBackFn=openBills; openBills(); };
$("#t-dues").onclick=()=>openDues();
$("#t-custs").onclick=()=>openCustomers();
$("#t-vendors").onclick=()=>openVendors();
$("#t-reports").onclick=()=>openReports();
$("#t-sum").onclick=()=>openSummary();
$("#t-biz").onclick=()=>{ const u=new URL("admin.html", location.href); u.search="?shop="+encodeURIComponent(SHOP_MAIN?"main":SHOP.code); window.open(u.href,"_blank","noopener"); };
$("#bill-pdf").onclick=()=>pdfFor(invFromCurrent(), $("#bill-pdf"));
$("#bill-print").onclick=()=>printInv(invFromCurrent(), $("#bill-print"));

/* ---------------- Credit (udhaar) ---------------- */
let billBackFn=null, duesCache=null, duesDirty=false, duesQ="";
function billPayMode(b){ const pays=b.payments||[], atBill=pays.filter(p=>p.at).reduce((x,p)=>x+(+p.a||0),0), pm=String(b.paidBy||"").toLowerCase();
  const pmk=PM_KEYS[pm]?pm:"";
  if(!b.pay || b.pay==="Paid") return {pay:"paid",recv:"",pm:pmk};
  return atBill>0 ? {pay:"part",recv:String(atBill),pm:pmk} : {pay:"credit",recv:"",pm:""}; }
$("#t-hindi").onclick=()=>openToHindi();
$("#t-groups").onclick=()=>openGroups();
$("#fab").onclick=()=>openEdit(null);
$("#cmd-open").onclick=()=>openCmd("");
$("#t-cmd").onclick=()=>openCmd("");
$("#t-add").onclick=()=>openEdit(null);
$("#t-bulkadd").onclick=()=>openBulkAdd();
$("#t-bulkedit").onclick=()=>openBulkEdit();
$("#t-settings").onclick=()=>openSettings();

document.addEventListener("visibilitychange",lockAway);
window.addEventListener("pagehide",()=>{ if(!LOCK.on) ls.set("rb_bgAt",Date.now()); });
$("#t-unlock").onclick=()=>appLock();
document.addEventListener("click",e=>{ if(e.target.closest('[data-act="unlock"]')) openUnlock(); });

/* ---------------- Setup (only when no link is set) ---------------- */
function setupHTML(){ return `<div class="setup"><h2>${esc(t("setupT"))}</h2><p>${esc(t("setupD"))}</p><input id="setup-url" type="url" placeholder="${esc(t("setupPh"))}" autocomplete="off"><div><button class="btn primary" id="setup-go">${esc(t("connect"))}</button></div><div class="err" id="setup-err"></div></div>`; }
document.addEventListener("click",async e=>{ if(!e.target.closest("#setup-go")) return; const u=$("#setup-url").value.trim(); const err=$("#setup-err");
  if(!/^https:\/\/script\.google(usercontent)?\.com\//.test(u)){ err.textContent=t("badUrl"); return; }
  try{ const r=await fetch(u+"?_="+Date.now()); const j=await r.json(); if(!j.ok||j.app!=="ratebook") throw 0; ls.set("rb_api",u); renderAll(); sync(); }catch{ err.textContent=t("badUrl"); } });

/* ---------------- Sync with the sheet ---------------- */
/* Bill numbers this phone just used (per mode). A price-list sync that started before the bill reached the sheet can carry
   the older "next number"; for 15 minutes that never moves this phone's number back onto one it already used. */
function tookNo(n, gst){ const k=envKey("rb_took"), o=ls.get(k,{}); o[gst?"g":"n"]={n:+n, at:Date.now()}; ls.set(k,o); }
function keepTaken(){ const o=ls.get(envKey("rb_took"),{}), fresh=x=>x && Date.now()-x.at < 15*60000;
  if(fresh(o.n) && S.cfg.nextBill<=o.n.n) S.cfg.nextBill=o.n.n+1; if(fresh(o.g) && S.cfg.nextGstBill<=o.g.n) S.cfg.nextGstBill=o.g.n+1; }
function applyConfig(x){
  x=x||{}; if(x.raw) x={...x, ...x.raw};   // saved copy on this phone keeps both sets of bill numbers in raw
  const units=Array.isArray(x.units)&&x.units.length ? x.units.filter(u=>u&&u.code).map(u=>({code:String(u.code),hi:String(u.hi||"")})) : DEFAULT_UNITS;
  S.cfg={ shopName:String(x.shopName||""), units, defaultUnit:String(x.defaultUnit||units[0].code), roundTo: (x.roundTo===undefined||x.roundTo==="")?1:+x.roundTo, billFooter:String(x.billFooter||""), nextBill: Math.max(1, Math.floor(+x.nextBill)||1), nextGstBill: Math.max(1, Math.floor(+x.nextGstBill)||1), showProfit: x.showProfit===true || String(x.showProfit).toLowerCase()==="true",
    shopGstin:String(x.shopGstin||""), shopAddress:String(x.shopAddress||""), fyReset:!(x.fyReset===false||String(x.fyReset)==="false"), gstFy:String(x.gstFy||""), testGstFy:String(x.testGstFy||""), shopState:String(x.shopState||""), defaultGst:(x.defaultGst===undefined||x.defaultGst==="")?18:+x.defaultGst, defaultHsn:String(x.defaultHsn||"3923"), groups:Array.isArray(x.groups)?x.groups.map(String).filter(Boolean):[], bizType:String(x.bizType||""), aiOn:!!x.aiOn };
  /* shopMode / shopProfit = the shop's own setting; mode / showProfit = what this person uses (their choice, else the shop's) */
  const P=myPrefs();
  S.cfg.shopMode = x.shopMode!==undefined ? (x.shopMode==="live"?"live":"test") : (x.mode==="live" ? "live" : "test");
  S.cfg.mode = (P.mode==="live"||P.mode==="test") && !(P.mode==="test" && !myTestOk()) ? P.mode : S.cfg.shopMode;
  S.cfg.shopProfit = x.shopProfit!==undefined ? !!x.shopProfit : !!S.cfg.showProfit;
  S.cfg.showProfit = typeof P.showProfit==="boolean" && can("manager") ? P.showProfit : S.cfg.shopProfit;
  S.cfg.raw = { nextBill:S.cfg.nextBill, nextGstBill:S.cfg.nextGstBill, testNextBill:Math.max(1,Math.floor(+x.testNextBill)||1), testNextGstBill:Math.max(1,Math.floor(+x.testNextGstBill)||1) };
  if(S.cfg.mode==="test"){ S.cfg.nextBill=S.cfg.raw.testNextBill; S.cfg.nextGstBill=S.cfg.raw.testNextGstBill; }
  // bills taken on this phone but not yet recorded keep the number moving forward
  for(const q of S.billQ||[]){ if((q.env||"test")!==S.cfg.mode) continue; if(q.gst){ if(q.n>=S.cfg.nextGstBill) S.cfg.nextGstBill=q.n+1; } else if(q.n>=S.cfg.nextBill) S.cfg.nextBill=q.n+1; }
  try{ keepTaken(); }catch{}
  const ah=document.querySelector(".al-shop"); if(ah) ah.textContent=SHOP_ASK_FAIL && !S.canWrite ? t("shopCodeT",SHOP_ASK_FAIL) : (S.cfg.shopName||"Rate Book");   // lock screen on a first open
}
function applyItems(list){
  const arr=[]; for(const x of list||[]){ if(!x||!x.name) continue; arr.push({ id:String(x.id), name:String(x.name), nameHi:x.nameHi||"", unit:x.unit||"", buy:+x.buy||0, sell:+x.sell||0, imgV:+x.imgV||0, imgs:+x.imgV?(+x.imgs||1):0, updatedAt:+x.updatedAt||0, updatedBy:x.updatedBy||"", hsn:String(x.hsn||""), gst:(x.gst===null||x.gst===undefined||x.gst==="")?null:+x.gst,
    altUnit:String(x.altUnit||""), altQty:+x.altQty||0, altSell:(x.altSell===null||x.altSell===undefined||x.altSell==="")?null:+x.altSell, aliases:String(x.aliases||""), cat:String(x.cat||"").trim() }); }
  sortItems(arr);
  const old=S.byId; S.items=arr; S.byId=new Map(arr.map(i=>[i.id,i])); buildIndex(); S.loaded=true; billFollow(old,true);
}
function saveCache(){ ls.set("rb_cache",{ pop:S.pop||null, items:S.items.filter(x=>!String(x.id).startsWith("tmp_")).map(x=>{ const y={...x}; delete y.pending; return y; }), cfg:S.cfg, rev:S.rev, at:S.lastSync }); }
let syncing=null, bootTried=false;
function sync(){
  if(!apiUrl()) return Promise.resolve();
  if(syncing) return syncing;
  syncing=(async()=>{
    try{ let j=null;
      /* First load after start, signed in: price list + who's signed in + versions in one request (older scripts: two). */
      if(!bootTried && S.canWrite && S.auth && S.auth.tok && !S.auth.pending){ bootTried=true;
        try{ j=await netTrack(apiPost0({action:"boot"})); if(!j || !Array.isArray(j.items) || !j.config) j=null; }   /* only a real price list counts; anything else: the normal request */
        catch(e){ if(e && (e.code==="bad_session"||e.code==="pending"||e.code==="need_signin"||e.code==="wrong_shop")) throw e; j=null; } }
      if(!j) j=await netTrack(apiRead({action:"list"}));
      S.rev=j.rev; { const m0=S.cfg.mode; applyConfig(j.config); if(m0!==S.cfg.mode){ S.cfg.mode=m0; switchEnv(j.config); } } S.limited=!!j.limited; S.codeOn=!!j.codeOn; S.sv=+j.sv||0; if(j.pop && typeof j.pop==="object") S.pop=j.pop; applyItems(j.items); S.online=true; S.lastSync=Date.now(); saveCache(); renderAll(); fetchThumbs(); flushBills(); if(j.me){ meChecked=true; applyMe({me:j.me,view:j.view},j); } else refreshMe(j); }
    catch(e){ if(!(e && e.code==="need_signin")) S.online=false; renderNet(); }   // not signed in yet (script v44+ shares the list only after sign-in): not "offline"
    finally{ syncing=null; }
  })();
  return syncing;
}
let lastBv="";
/** Bills changed somewhere (another phone, a payment, a hand edit): refresh the lists this phone keeps, quietly. */
async function billsChangedBg(){
  if(CUSTD || await custdGet()) custdRefresh(true).then(()=>{ custIdx=null; if($("#cu-list")) cuRender(); }).catch(()=>{});
  if($("#du-body")) loadDues().then(duesShow).catch(()=>{});   // Credit list open: redraw it; otherwise it refreshes when opened
}
async function checkRev(){
  if(!apiUrl() || document.hidden) return;
  try{ const j=await apiGet({action:"rev"}); S.online=true; if(String(j.rev)!==String(S.rev)) await sync(); else { S.lastSync=Date.now(); renderNet(); if(S.billQ.length) flushBills(); }
    const bv=S.cfg.mode==="live"?j.bl:j.bt; if(bv && S.canWrite && (!BLC || BLC.env!==S.cfg.mode || String(BLC.brev)!==String(bv))) blcSoon(300,String(bv));
    /* vendors changed on another phone: fetch now, so Vendors is already current when it's opened */
    if(bv && S.canWrite && lastBv!==S.cfg.mode+":"+bv){ const first=!lastBv; lastBv=S.cfg.mode+":"+bv; if(!first) billsChangedBg(); }
    if(vqGet().length && !vqBusy) vqFlush();
    const vv=S.cfg.mode==="live"?j.vl:j.vt; if(vv && S.canWrite && can("manager") && (!VDB.loaded || VDB.mode!==S.cfg.mode || String(VDB.srv.vrev)!==String(vv))) vSync(true);
    nCheck(j); perfSend(); }
  catch{ S.online=false; renderNet(); }
}
async function fetchThumbs(){
  const need=S.items.filter(it=>it.imgV && (!S.thumbs[it.id] || S.thumbs[it.id].v!==it.imgV)).map(it=>it.id);
  for(let i=0;i<need.length;i+=30){
    try{ const j=await apiRead({action:"thumbs",ids:need.slice(i,i+30).join(",")});
      for(const x of j.thumbs||[]){ if(!x.thumb) continue; S.thumbs[x.id]={v:+x.imgV,d:x.thumb}; idb.set("thumbs",x.id,S.thumbs[x.id]); }
      renderList(); }catch{ break; }
  }
}
function renderNet(){
  const bar=$("#netbar"); if(!apiUrl()){ bar.hidden=true; return; }
  const tm=S.lastSync? new Date(S.lastSync).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"}) : "";
  bar.hidden = S.online!==false;   // only when something's wrong; "updated 12:12 ↻" sits in the items line otherwise
  bar.classList.toggle("off", S.online===false);
  $("#net-txt").textContent = S.online ? t("online",tm) : (S.lastSync ? t("offline",tm) : t("neverSynced"));
}
$("#meta-l").addEventListener("click",e=>{ if(e.target.closest("#meta-sync")){ e.target.closest("#meta-sync").textContent="· "+t("loading"); sync(); } });
$("#net-refresh").onclick=()=>{ $("#net-txt").textContent=t("loading"); sync(); };
window.addEventListener("online",()=>{ checkRev(); setTimeout(flushBills,300); });
window.addEventListener("offline",()=>{ S.online=false; renderNet(); });
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) checkRev(); });
setInterval(checkRev,25000);

/* ---------------- Notifications (vendors; owner + managers) ----------------
   The sheet writes a notice when a vendor / bill / payment is saved (Code.gs notice_). The 25-second rev check carries the
   notices version (nl / nt); when it changes the phone fetches the list. Read state is per person on the sheet; kinds a
   person switched off (prefs.noff) are left out of the bell and the list. Kept on the phone per mode, so the badge shows offline. */
const NT={env:"",nrev:"",list:null,busy:false,again:false};
const NKINDS=["vendor","bill","pay","paid","rm","check","move"];
const nOn=()=>S.canWrite && can("manager") && !(S.sv>0 && S.sv<43);
const nOff=()=>(S.auth&&S.auth.prefs&&S.auth.prefs.noff)||[];
const nShown=n=>{ const off=nOff(); return off.indexOf(n.kind==="adj"?"pay":n.kind)<0; };
function nLoad(){ if(NT.env===S.cfg.mode) return; const c=ls.get(envKey("rb_notes"),null); NT.env=S.cfg.mode; NT.nrev=c&&c.nrev||""; NT.list=c&&Array.isArray(c.list)?c.list:null; }
function nSave(){ ls.set(envKey("rb_notes"),{nrev:NT.nrev,list:(NT.list||[]).slice(0,100)}); }
function nUnread(){ return (NT.list||[]).filter(n=>!n.read && nShown(n)).length; }
function nBadge(){ const b=$("#nbell"); if(!b) return; const on=nOn(); b.hidden=!on; if(!on) return; nLoad();
  const k=nUnread(), el=$("#nbadge"); el.hidden=!k; el.textContent=k>99?"99+":String(k); b.setAttribute("aria-label",t("nBell")+(k?` (${k})`:"")); }
async function nSync(){ if(!nOn()) return; if(NT.busy){ NT.again=true; return; } NT.busy=true; nLoad(); const env=S.cfg.mode;
  try{ const j=await apiPost0({action:"notices"}); if(env!==S.cfg.mode || !Array.isArray(j.list)) return;
    const had=NT.list, known=new Set((had||[]).map(n=>n.id));
    NT.list=j.list; NT.nrev=String(j.nrev||""); nSave(); nBadge();
    if(had){ const fresh=j.list.filter(n=>!known.has(n.id) && !n.read && nShown(n)); if(fresh.length) nSlide(fresh); }
    if($("#n-list")) nRenderList(false); }
  catch{} finally{ NT.busy=false; if(NT.again){ NT.again=false; setTimeout(nSync,200); } } }
function nCheck(j){ if(!nOn()) return; nLoad(); const v=S.cfg.mode==="live"?j.nl:j.nt; if(v!==undefined && String(v)!==String(NT.nrev)) nSync(); }
const N_IC={vendor:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',bill:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',pay:'<path d="M7 17 17 7M8 7h9v9"/>',adj:'<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-2"/>',paid:'<path d="M20 6 9 17l-5-5"/>',rm:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',check:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',move:'<path d="M5 12h14M13 6l6 6-6 6"/>'};
const nIcon=k=>`<span class="n-ic k-${k}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${N_IC[k]||N_IC.bill}</svg></span>`;
function nText(n){ const x=n.extra||{}, v=n.vname||"", a=n.amount!=null?vMoney(n.amount):"", by=n.by?t("nBy",n.by):"", J=a=>a.filter(Boolean).join(" · ");
  const bno=n.billNo==="Opening"?t("nOpening"):n.billNo;
  switch(n.kind){
    case "vendor": return {b:t("nNewVendor",v), s:J([+n.amount?t("nOpenBal",a):"", +x.days?t("nCredit",x.days):"", by])};
    case "bill": return {b:t("nBill",a,v), s:J([n.billNo?t("nBillNo",n.billNo):"", x.due?t("nDue",vDate(x.due)):"", by])};
    case "pay": return {b:t("nPay",a,v), s:J([x.mode?t("vm_"+String(x.mode).toLowerCase()):"", x.bills&&x.bills.length?t("nFor",x.bills.map(s=>s==="Opening"?t("nOpening"):s).join(", ")):"", by])};
    case "adj": return {b:t("nAdj",a,v), s:by};
    case "paid": return {b:t("nPaid",n.billNo==="Opening"?"":n.billNo), s:J([n.billNo==="Opening"?t("nOpening"):"", v, a, by])};
    case "rm": return {b:t(x.type==="bill"?"nRmBill":x.type==="adj"?"nRmAdj":"nRmPay",a,v), s:J([bno?t("nBillNo",bno):"", by])};
    case "check": return {b:t("nCheck",n.billNo,v), s:J([x.n?t("nIssues",x.n):"", a])};
    case "move": return {b:t("nMove",x.n||0), s:J([(x.names||[]).join(", "), by])};
  } return {b:v, s:by}; }
const nTime=at=>{ const d=new Date(at); return Date.now()-at<86400000 && d.toDateString()===new Date().toDateString() && Date.now()-at<3600000 ? ago(at) : d.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"}); };
function nDay(at){ const d=new Date(at), now=new Date(), y=new Date(now); y.setDate(now.getDate()-1);
  return d.toDateString()===now.toDateString()?t("nToday"):d.toDateString()===y.toDateString()?t("nYest"):d.toLocaleDateString("en-IN",{weekday:"short",day:"2-digit",month:"short"}); }
let nSlideT;
function nSlide(fresh){ const el=$("#nslide"); if(!el || !nOn() || document.documentElement.classList.contains("locked")) return;
  const n=fresh[0], x=fresh.length>1?{b:t("nMore",fresh.length),s:nText(n).b}:nText(n);
  el.innerHTML=`${nIcon(fresh.length>1?"bill":n.kind)}<span class="n-mid"><b>${esc(x.b)}</b><small>${esc(x.s)}</small></span><span class="n-x" aria-hidden="true">✕</span>`;
  el.dataset.id=fresh.length>1?"":n.id; el.classList.add("on");
  const b=$("#nbell"); b.classList.remove("ring"); void b.offsetWidth; if(!matchMedia("(prefers-reduced-motion: reduce)").matches) b.classList.add("ring");
  clearTimeout(nSlideT); nSlideT=setTimeout(()=>el.classList.remove("on"),6000); }
$("#nslide").onclick=e=>{ const el=$("#nslide"); el.classList.remove("on"); if(e.target.closest(".n-x")) return; const n=(NT.list||[]).find(x=>x.id===el.dataset.id); if(n){ nGo(n); nMark([n.id]); } else openNotices(); };
async function nMark(ids){ (NT.list||[]).forEach(n=>{ if(!ids||ids.indexOf(n.id)>=0) n.read=true; }); nSave(); nBadge();
  try{ const j=await apiPost0(ids?{action:"noticeRead",ids}:{action:"noticeRead",all:true}); if(Array.isArray(j.list)){ const loc={}; (NT.list||[]).forEach(n=>{ if(n.read) loc[n.id]=1; }); NT.list=j.list.map(n=>loc[n.id]?{...n,read:true}:n); NT.nrev=String(j.nrev||NT.nrev); nSave(); nBadge(); } }catch{} }
function nGo(n){
  if(n.kind==="move" || !n.vendorId){ openVendors(); return; }
  vdbInit().then(()=>{ const D=VD.det[n.vendorId]; openVendor(n.vendorId);
    if(D && n.entryId && n.kind!=="rm" && D.entries.some(e=>e.id===n.entryId)) vEntry(n.vendorId,n.entryId); }); }
function nRenderList(fresh){ const box=$("#n-list"); if(!box) return; nLoad();
  const all=NT.list||[], L=all.filter(nShown), hid=all.length-L.length, keep=box.__unread||new Set();
  if(fresh){ L.forEach(n=>{ if(!n.read) keep.add(n.id); }); box.__unread=keep; }
  if(NT.list===null){ box.innerHTML=skelCards(4,true); return; }
  let day="", h="";
  L.forEach(n=>{ const d=nDay(n.at); if(d!==day){ day=d; h+=`<div class="n-day">${esc(d)}</div>`; } const x=nText(n), un=keep.has(n.id);
    h+=`<button type="button" class="nrow${un?" unread":""}" data-nid="${esc(n.id)}">${nIcon(n.kind)}<span class="n-mid"><b>${esc(x.b)}</b>${x.s?`<small>${esc(x.s)}</small>`:""}</span><span class="n-r"><span class="num">${esc(nTime(n.at))}</span>${un?`<span class="n-dot"></span>`:""}</span></button>`; });
  box.innerHTML=(h||`<div class="n-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>${esc(t("nEmpty"))}</div>`)+(hid?`<p class="note" style="text-align:center">${esc(t("nHidden",hid))}</p>`:""); }
function openNotices(){ if(!nOn()) return; nLoad();
  sheetKey("notices"), openSheet(t("nT"),`<div id="n-list"></div>`,"",{full:true});
  nRenderList(true); $("#n-list").onclick=e=>{ const b=e.target.closest("[data-nid]"); if(!b) return; const n=(NT.list||[]).find(x=>x.id===b.dataset.nid); if(n) nGo(n); };
  if(nUnread()) nMark(null); nSync(); }
$("#nbell").onclick=()=>openNotices();
setTimeout(()=>nSync(),6000);   // once after start (the rev check covers the rest)
function nSetHTML(){ if(!nOn()) return ""; const off=nOff();
  return `<div style="display:grid;gap:8px" id="cf-noti"><div><b>${esc(t("nSetT"))}</b><br><span class="note">${esc(t("nSetD"))}</span></div><div class="n-offs">${NKINDS.map(k=>`<button type="button" data-nk="${k}" aria-pressed="${off.indexOf(k)<0}">${esc(t("nk_"+k))}</button>`).join("")}</div></div>`; }

/* ---------------- Install to home screen ---------------- */
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
const isStandalone=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
const isFileCopy=!/^https?:$/.test(location.protocol);
let installEvt=null;
window.addEventListener("beforeinstallprompt",e=>{ e.preventDefault(); installEvt=e; renderInstall(); });
window.addEventListener("appinstalled",()=>{ installEvt=null; ls.set("rb_inst_x",true); renderInstall(); });
function renderInstall(){
  const w=$("#install-wrap"); const tb=$("#t-install");
  tb.hidden = !(installEvt || (isIOS && !isStandalone()));
  if(isStandalone() || ls.get("rb_inst_x",false) || S.tab!=="items"){ w.innerHTML=""; return; }
  const x=`<button class="x" data-instx aria-label="${esc(t("later"))}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
  if(isFileCopy){ w.innerHTML=`<div class="banner"><img src="icon-iris-192.png" alt=""><div class="txt"><b>${esc(t("fileT"))}</b><span>${esc(t("fileD"))}</span></div>${x}</div>`; return; }
  if(installEvt){ w.innerHTML=`<div class="banner"><img src="icon-iris-192.png" alt=""><div class="txt"><b>${esc(t("installT"))}</b><span>${esc(t("installD"))}</span></div><button class="btn primary" data-inst>${esc(t("install"))}</button>${x}</div>`; return; }
  if(isIOS){ const share=`<svg class="share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8"/></svg>`;
    w.innerHTML=`<div class="banner ios"><img src="apple-touch-icon-iris.png" alt=""><div class="txt"><b>${esc(t("iosT"))}</b><span>${esc(t("iosD")).replace("Share","Share "+share).replace("Share "+share,"Share "+share)} ${esc(t("iosD2"))}</span></div>${x}</div>`; return; }
  w.innerHTML="";
}
async function doInstall(){ if(installEvt){ installEvt.prompt(); try{ await installEvt.userChoice; }catch{} installEvt=null; renderInstall(); } else if(isIOS){ ls.set("rb_inst_x",false); setTab("items"); } }
document.addEventListener("click",e=>{ if(e.target.closest("[data-inst]")) doInstall(); else if(e.target.closest("[data-instx]")){ ls.set("rb_inst_x",true); renderInstall(); } });
$("#t-install").onclick=doInstall;
if("serviceWorker" in navigator && /^https?:$/.test(location.protocol)){ window.addEventListener("load",()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}); });
  /* A newer app was saved in the background (sw.js): it loads by itself on the next open. While locked with no bill in progress
     it loads now; otherwise a small "Update ready" pill offers it. Never reloads in the middle of a bill. */
  /* Bills, customer, payment and edits are saved on the phone as they change, so a reload keeps them. Only a form open in a
     screen (sheet) could lose typing, so the app loads the update by itself only when no screen is open and no box is being typed in:
     straight away on the lock screen, else the next time the app comes back to the screen. Tapping the pill always loads it. */
  let updWaiting=false;
  const updSafe=()=>$("#sheet").hidden && !(document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
  const updGo=()=>{ try{ saveBill(); }catch{} ls.set("rb_updated",Date.now()); location.reload(); };   // say "App updated" once after the next unlock (appUnlock)
  const updReady=()=>{ updWaiting=true; if(LOCK.on && updSafe()){ updGo(); return; }
    let el=$("#updpill"); if(!el){ el=document.createElement("button"); el.id="updpill"; el.type="button"; document.body.appendChild(el); }
    el.textContent=t("updReady"); el.onclick=updGo; };
  document.addEventListener("visibilitychange",()=>{ if(updWaiting && !document.hidden && updSafe() && (LOCK.on || !S.bill.length)) updGo(); });
  navigator.serviceWorker.addEventListener("message",e=>{ if(e.data && e.data.type==="rb-update") updReady(); });
  /* Also check directly (a message can arrive before the page listens): remember which saved copy this page started from, and
     look again shortly after (the background fetch) and whenever the app comes back to the screen. */
  if(window.caches && window.DOMParser){
    /* Fingerprint of a page's code: its inline scripts and styles plus the stamped addresses of its own files (none change while the app runs). This page's own vs the
       saved copy's: different = a newer app is saved. */
    const fp=doc=>{ let h=2166136261; const x=[...doc.querySelectorAll("script:not([src]),style")].map(e=>e.textContent).concat([...doc.querySelectorAll("link[rel=stylesheet][href*='?v='],script[src*='?v=']")].map(e=>e.getAttribute("href")||e.getAttribute("src"))).join("\u0001");   /* + the stamped app.css / strings.js / app.js addresses */
      for(let i=0;i<x.length;i++){ h^=x.charCodeAt(i); h=Math.imul(h,16777619); } return x.length+":"+(h>>>0); };
    const mine=fp(document); let said=false;
    const look=()=>{ if(said) return; caches.match("./index.html").then(r=>r?r.text():"").then(x=>{ if(!x) return; const other=fp(new DOMParser().parseFromString(x,"text/html")); if(other!==mine){ said=true; updReady(); } }).catch(()=>{}); };
    [3000,10000,30000].forEach(ms=>setTimeout(look,ms)); document.addEventListener("visibilitychange",()=>{ if(!document.hidden) look(); }); }
}

/* ---------------- Start ---------------- */
async function boot(){
  const cache=ls.get("rb_cache",null);
  if(!ls.get("rb_sort_v2",false)){ ls.set("rb_sort","pop"); ls.set("rb_sort_v2",true); }
  S.sortBy=ls.get("rb_sort","pop");
  if(cache){ applyConfig(cache.cfg); S.pop=cache.pop||null; applyItems(cache.items); S.rev=cache.rev; S.lastSync=cache.at||0; }
  applyLang(); renderBadge();
  appLock();   // every fresh open: unlock (or sign in) first
  shopFromLink().then(m=>{ if(m && LOCK.on){ const er=$("#al-err"); if(er) er.textContent=m; } }); shopRefresh();
  S.thumbs=await idb.all("thumbs"); if(S.loaded) renderList();
  if(apiUrl()) sync();
  if(S.pendShare) setTimeout(askSent,1200);   // the app was closed while a shared bill waited for confirmation
}
boot();
