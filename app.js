/* Rate Book app code (moved out of index.html on 11 Oct 2026). One classic script in global scope: index.html loads strings.js,
   then this file, at the end of <body>, so the page is already built when it runs. Run  node tools/stamp.js  after editing. */
"use strict";
/* ============================================================
   PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL BETWEEN THE QUOTES
   (it looks like https://script.google.com/macros/s/AKfy.../exec)
   ============================================================ */
const API_URL = "https://script.google.com/macros/s/AKfycbxbvn-XbelK8mOeearCSHcnewrDevNfInjFggxH-60fzOiHpdEjkb9-BrJdfTOSVx_J/exec";

/* ---------------- i18n ---------------- */
const STR = window.RB_STR;   /* texts live in strings.js */
const DEFAULT_UNITS=[{code:"kg",hi:"किलो"},{code:"g",hi:"ग्राम"},{code:"L",hi:"लीटर"},{code:"ml",hi:"मि.ली."},{code:"pc",hi:"नग"},{code:"dozen",hi:"दर्जन"},{code:"packet",hi:"पैकेट"},{code:"box",hi:"डिब्बा"},{code:"bag",hi:"बोरी"},{code:"bottle",hi:"बोतल"},{code:"metre",hi:"मीटर"},{code:"bundle",hi:"गड्डी"}];
const UNIT_ALIASES={kg:["kg","kgs","kilo","kilos","kilogram","किलो","किग्रा","केजी"],g:["g","gm","gms","gram","grams","ग्राम"],L:["l","ltr","litre","liter","litres","लीटर"],ml:["ml","मिली"],pc:["pc","pcs","piece","pieces","nag","नग","पीस"],dozen:["dozen","darjan","दर्जन"],packet:["packet","pkt","packets","पैकेट","पाकेट"],box:["box","dabba","डिब्बा"],bag:["bag","bori","बोरी"],bottle:["bottle","बोतल"],metre:["metre","meter","mtr","मीटर"],bundle:["bundle","gaddi","गड्डी"]};

/* ---------------- Which shop this phone uses ----------------
 * "main" is the original shop: the fixed API_URL, storage keys and IndexedDB name exactly as before (nothing changes for its phones).
 * Other shops are reached by a code (a ?shop=CODE link, or typed on the sign-in screen); the Directory (admin/Directory.gs) turns the
 * code into that shop's backend link. Each shop's data on the phone is kept apart: localStorage keys get "<code>:" in front and the
 * IndexedDB is "ratebook_<code>". A code is only an address: each shop has its own people, PINs and sign-ins, and a phone signed in
 * to one shop ignores another shop's link or code until it signs out. Switching shops reloads the app, so nothing in memory crosses. */
const DIR_URL = "https://script.google.com/macros/s/AKfycbwFArKraCzF-asuI-8RI5NBGNUbmcmAp0lz1H1G98TqtZNWOlfp3L5hE-vY86vxC99K/exec";   // the Rate Book Directory web app link (admin/Directory.gs). Empty: only the original shop.
const SHOP = (()=>{ let x=null; try{ x=JSON.parse(localStorage.getItem("rb_shop")||"null"); }catch{} return x && x.code && x.code!=="main" && x.api ? x : {code:"main"}; })();
const SHOP_MAIN = SHOP.code==="main";
const LS_GLOBAL = new Set(["rb_shop","rb_shops","rb_dev","rb_lang","rb_fz","rb_palette","rb_appear"]);   // per phone, not per shop
const lsKey = k => SHOP_MAIN || LS_GLOBAL.has(k) ? k : SHOP.code+":"+k;
const ls = { get(k,d){try{const v=localStorage.getItem(lsKey(k));return v==null?d:JSON.parse(v)}catch{return d}}, set(k,v){try{localStorage.setItem(lsKey(k),JSON.stringify(v))}catch{}} };
const shopsKnown = ()=>{ try{ const a=JSON.parse(localStorage.getItem("rb_shops")||"[]"); return Array.isArray(a)?a:[]; }catch{ return []; } };
/** Is this phone signed in to that shop? (its own stored sign-in, read without switching) */
const shopSignedIn = code => { try{ const a=JSON.parse(localStorage.getItem(code==="main"?"rb_auth":code+":rb_auth")||"null"); return !!(a && (a.tok||a.pin)); }catch{ return false; } };
function shopRemember(sh){ try{ const a=shopsKnown().filter(x=>x.code!==sh.code); a.unshift({code:sh.code,name:sh.name||"",api:sh.api||""}); localStorage.setItem("rb_shops",JSON.stringify(a.slice(0,10))); }catch{} }
/** Open another shop: saves it as this phone's shop and reloads (a fresh start, so nothing in memory crosses over). */
function shopGo(sh){ try{ localStorage.setItem("rb_shop", JSON.stringify(sh.code==="main"?null:{code:sh.code,api:sh.api,name:sh.name||"",at:Date.now()})); }catch{} shopRemember(sh); location.replace(location.pathname); }
/** Code → that shop's backend link, from the Directory. Wrong codes are counted there (too many = this phone waits). */
async function dirLookup(code){ if(!DIR_URL) throw {code:"no_dir"};
  const r=await fetch(DIR_URL+"?"+new URLSearchParams({action:"shop",code,dev:DEV,_:String(Date.now())}),{cache:"no-store",redirect:"follow"});
  const j=await r.json(); if(!j.ok) throw {code:j.error||"bad_code"}; return {code:j.code||code, api:j.api, name:j.name||"", status:j.status||"live"}; }
/* The shop code in the link (?shop=CODE), read once at start; the address bar is cleaned so a reload doesn't repeat it. */
const SHOP_ASK = (()=>{ try{ const q=new URLSearchParams(location.search).get("shop"); if(!q) return ""; history.replaceState(null,"",location.pathname+location.hash); return q.trim().toLowerCase()==="main" ? "main" : q.trim().toUpperCase().replace(/[^A-Z0-9-]/g,"").slice(0,40); }catch{ return ""; } })();

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
  auth: ls.get("rb_auth",null), rev:null, online:null, lastSync:0, thumbs:{}, q:"", limit:40, tab:"items", bill: ls.get("rb_bill",[]), cust: ls.get("rb_cust",""), mob: ls.get("rb_mob",""), gst: ls.get("rb_gst",false), igst: ls.get("rb_igst",false), custGstin: ls.get("rb_cgstin",""), billNoOvr: ls.get("rb_billno",null), posSel: ls.get("rb_pos",""), pendShare: !!ls.get("rb_pshare",0), filter:"all", pay: ls.get("rb_pay","paid"), recv: ls.get("rb_recv",""), pm: ls.get("rb_pm",""), profitShown:false, custAuto:"", custQ:"", editing: ls.get("rb_editing",null), qTabs:{items:"",bill:""}, lastBill: ls.get("rb_lastbill",null), billQ: ls.get("rb_billq",[]),
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
const t = (k,...a) => { const v = (STR[S.lang]||STR.en)[k] ?? STR.en[k]; return typeof v==="function"? v(...a) : v; };
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

/* ---------------- Phonetic search ---------------- */
const DC={"क":"k","ख":"kh","ग":"g","घ":"gh","ङ":"n","च":"ch","छ":"chh","ज":"j","झ":"jh","ञ":"n","ट":"t","ठ":"th","ड":"d","ढ":"dh","ण":"n","त":"t","थ":"th","द":"d","ध":"dh","न":"n","प":"p","फ":"ph","ब":"b","भ":"bh","म":"m","य":"y","र":"r","ल":"l","व":"v","श":"sh","ष":"sh","स":"s","ह":"h","ळ":"l"};
const DN={"क":"q","ख":"kh","ग":"g","ज":"z","ड":"r","ढ":"rh","फ":"f"};
const DV={"अ":"a","आ":"aa","इ":"i","ई":"ee","उ":"u","ऊ":"oo","ऋ":"ri","ए":"e","ऐ":"ai","ओ":"o","औ":"au","ऑ":"o"};
const DM={"ा":"aa","ि":"i","ी":"ee","ु":"u","ू":"oo","ृ":"ri","े":"e","ै":"ai","ो":"o","ौ":"au","ॉ":"o"};
function translit(str){
  if(!/[ऀ-ॿ]/.test(str)) return str;
  const s=str.normalize("NFD"); let o="";
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(DC[c]){ let cons=DC[c]; if(s[i+1]==="़"){ cons=DN[c]||cons; i++; }
      const n=s[i+1];
      if(DM[n]){ o+=cons+DM[n]; i++; } else if(n==="्"){ o+=cons; i++; } else o+=cons+"a";
    } else if(DV[c]) o+=DV[c];
    else if(c==="ं"||c==="ँ") o+="n";
    else if(c==="ः") o+="h";
    else if(c>="०"&&c<="९") o+=String(c.charCodeAt(0)-0x966);
    else if(c==="़") {}
    else o+=c;
  }
  return o;
}
function phonWord(w){
  w=w.replace(/ch/g,"\u0001").replace(/c/g,"k").replace(/\u0001/g,"ch").replace(/ai/g,"a").replace(/au/g,"o").replace(/aa/g,"a").replace(/ee/g,"i").replace(/oo/g,"u").replace(/ph/g,"f").replace(/ck/g,"k").replace(/x/g,"ks")
     .replace(/([kgcjtdpbs])h/g,"$1").replace(/([kgcjtdpbs])h/g,"$1").replace(/w/g,"v").replace(/z/g,"j").replace(/q/g,"k")
     .replace(/y$/,"i").replace(/(.)\1+/g,"$1");
  if(w.length>3 && w.endsWith("a")) w=w.slice(0,-1);
  return w;
}
function phonTokens(s){ return translit(String(s||"").toLowerCase()).replace(/[^a-z0-9]+/g," ").trim().split(" ").filter(Boolean).map(phonWord); }
function skel(w){ return w.length<3 ? w : w[0]+w.slice(1).replace(/[aeiou]/g,""); }
function lev(a,b,max){
  if(a===b) return 0; const al=a.length, bl=b.length; if(Math.abs(al-bl)>max) return max+1;
  let prev=new Array(bl+1); for(let j=0;j<=bl;j++) prev[j]=j;
  for(let i=1;i<=al;i++){ const cur=[i]; let best=i;
    for(let j=1;j<=bl;j++){ const v=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1)); cur[j]=v; if(v<best) best=v; }
    if(best>max) return max+1; prev=cur; }
  return prev[bl];
}
function tokScore(q,toks){
  let best=0; const allow=q.length<=2?0:q.length<=4?1:2;
  for(const tk of toks){
    let s=0;
    if(tk===q) s=120;
    else if(tk.startsWith(q)) s=100-Math.min(20,tk.length-q.length);
    else if(q.length>=2 && tk.includes(q)) s=72;
    else if(allow){ const d=lev(q,tk.slice(0,q.length),allow); if(d<=allow) s=56-12*d; else { const d2=lev(q,tk,allow); if(d2<=allow) s=50-12*d2; } }
    if(!s && q.length>=3){ const sq=skel(q), st=skel(tk); if(sq.length>=3){ if(st===sq) s=54; else if(st.startsWith(sq)) s=50; } }
    if(s>best) best=s; if(best>=120) break;
  }
  return best;
}
/* Item order: "Most sold" = how many real bills an item was on (from the sheet, not quantity), then A–Z.
   The count comes with the price list (S.pop) and only changes when the list reloads, so cards don't jump while billing. */
const popN=id=>(S.pop && +S.pop[id])||0;
const nameCmp=(a,b)=>a.name.localeCompare(b.name,"en",{sensitivity:"base"});
function sortItems(arr){ if(S.sortBy==="az" || !S.pop) arr.sort(nameCmp); else arr.sort((a,b)=>popN(b.id)-popN(a.id) || nameCmp(a,b)); return arr; }
function setSort(m){ S.sortBy=m; ls.set("rb_sort",m); sortItems(S.items); buildIndex(); S.limit=40; renderList(); window.scrollTo({top:0}); }
function buildIndex(){
  CAT_M=null; S.index = S.items.map(it => { const toks=[...phonTokens(it.name),...phonTokens(it.nameHi),...phonTokens(it.aliases),...phonTokens(it.cat)]; /* other names and group are searchable too */ return { it, toks, key: phonTokens(it.name).join(" ") }; });
}
function runSearch(q){
  const qt=phonTokens(q);
  if(!qt.length) return { res:S.index.map(e=>({e,score:0})), suggest:[], exact:true };
  const joined=qt.join(" "); const out=[];
  for(const e of S.index){
    let total=0, fuzzy=false;
    for(const tq of qt){ const s=tokScore(tq,e.toks); if(s<=0){ total=-1; break; } if(s<60) fuzzy=true; total+=s; }
    if(total>0){ if(e.key.startsWith(joined)) total+=30; out.push({e,score:total,fuzzy}); }
  }
  out.sort((a,b)=>b.score-a.score || (S.sortBy==="az"?0:popN(b.e.it.id)-popN(a.e.it.id)) || a.e.it.name.localeCompare(b.e.it.name));
  let suggest=[];
  const exact = out.some(o=>!o.fuzzy);
  if(exact) return { res:out.filter(o=>!o.fuzzy), suggest, exact };
  if(out.length){ suggest=out.slice(0,4).map(o=>o.e.it); }
  else {
    const L=Math.max(joined.replace(/ /g,"").length,1);
    const cand=S.index.map(e=>{ let tsum=0; for(const tq of qt){ let b=tq.length; for(const tk of e.toks){ const dd=lev(tq,tk.slice(0,tq.length+1),tq.length); if(dd<b) b=dd; } tsum+=b; } return {e,sim:1-tsum/L}; })
      .filter(x=>x.sim>=0.45).sort((a,b)=>b.sim-a.sim).slice(0,4);
    suggest=cand.map(x=>x.e.it); out.push(...cand.map(x=>({e:x.e,score:x.sim,fuzzy:true})));
  }
  return { res:out, suggest, exact };
}
function highlight(name,q){
  const raw=String(q||"").trim().toLowerCase(); if(!raw) return esc(name);
  const idx=name.toLowerCase().indexOf(raw);
  if(idx<0) return esc(name);
  return esc(name.slice(0,idx))+"<mark>"+esc(name.slice(idx,idx+raw.length))+"</mark>"+esc(name.slice(idx+raw.length));
}
function findDup(name,exceptId){ const k=phonTokens(name).join(" "); if(!k) return null; return S.index.find(e=>e.key===k && e.it.id!==exceptId)?.it || null; }

/* ---------------- Plain-language commands ---------------- */
const RE_ADD=/\b(add|new|create|insert)\b|जोड़|जोड|\bjod(o|do|en|ein)?\b|\bnaya\b|नया|नई/i;
const RE_DEL=/\b(delete|remove|hatao|hata do|mitao)\b|हटा|मिटा/i;
const RE_UPD=/\b(update|change|set|edit|make|increase|raise|decrease|reduce|badlo|badal do|kar do|karo|badha|badhao|badha do|ghata|ghatao)\b|बदल|कर दो|करो|कर दें|बढ़ा|बढ़ा|बढा|घटा/i;
const RE_VERBWORD=/[\u0900-\u097F]*(?:जोड़|जोड़|जोड|बदल|हटा|मिटा|बढ़ा|बढ़ा|बढा|घटा)[\u0900-\u097F]*/g;
const RE_DOWN=/\b(decrease|reduce|less|lower|kam|ghata|ghatao|down|minus)\b|कम|घटा/i;
function looksLikeCommand(q){ const s=q.trim(); if(s.length<6) return false; return (RE_ADD.test(s)||RE_UPD.test(s)||RE_DEL.test(s)) && (/\d|[०-९]/.test(s)||RE_DEL.test(s)); }
function unitFromWord(w){
  const x=String(w||"").toLowerCase().replace(/[.]/g,"");
  for(const u of S.cfg.units){ if(u.code.toLowerCase()===x || (u.hi && u.hi===w)) return u.code; }
  for(const [code,al] of Object.entries(UNIT_ALIASES)){ if(al.includes(x)||al.includes(w)) { const u=S.cfg.units.find(z=>z.code===code); return u?u.code:code; } }
  return null;
}
function candidates(text,n=20){
  const qt=phonTokens(text).filter(x=>x.length>=3 && !/^\d+$/.test(x));
  if(!qt.length) return [];
  return S.index.map(e=>{ let s=0; for(const q of qt){ const v=tokScore(q,e.toks); if(v>=50) s+=v; } return {it:e.it,s}; })
    .filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,n).map(x=>x.it);
}
function bestMatch(name){
  const d=findDup(name); if(d) return d;
  const qt=phonTokens(name).filter(x=>!/^\d+$/.test(x)); if(!qt.length) return null;
  let best=null, bs=0;
  for(const e of S.index){ let s=0, ok=true; for(const q of qt){ const v=tokScore(q,e.toks); if(v<50){ ok=false; break; } s+=v; }
    if(ok){ const cover=qt.length/Math.max(e.toks.length,1); s*=cover; if(s>bs){ bs=s; best=e.it; } } }
  return bs>=60 ? best : null;
}
function parseOne(src){
  let s=" "+devDigits(src).replace(/\s+/g," ").trim()+" ";
  if(!s.trim()) return null;
  let op = RE_DEL.test(s) ? "delete" : RE_ADD.test(s) ? "add" : RE_UPD.test(s) ? "update" : null;
  const num="(\\d+(?:\\.\\d+)?)";
  let buy=null, sell=null, pct=null, unit=null;
  const mPct=s.match(new RegExp(num+"\\s*(%|percent|pratishat|प्रतिशत|फ़ीसदी|फीसदी)","i"));
  if(mPct){ pct=+mPct[1]; if(RE_DOWN.test(s)) pct=-pct; s=s.replace(mPct[0]," "); }
  const mBuy=s.match(new RegExp("(?:buy(?:ing)?|purchase|cost|kharid|khareed|ख़रीद|खरीद|लागत)[^\\d]{0,14}?"+num,"i"));
  const mSell=s.match(new RegExp("(?:sell(?:ing)?|sale|bikri|bechne|बिक्री|बेच|mrp)[^\\d]{0,14}?"+num,"i"));
  if(mBuy) buy=+mBuy[1]; if(mSell) sell=+mSell[1];
  const mUnit=s.match(/(?:\bper\b|\/|प्रति|\bunit\b|इकाई|\bfi\b)\s*([a-zऀ-ॿ.]+)/i);
  if(mUnit){ unit=unitFromWord(mUnit[1]); s=s.replace(mUnit[0]," "); }
  // name part: before first rate keyword
  const kw=/\b(with|rates?|price|prices|rs|inr|at|for|buy(?:ing)?|purchase|cost|sell(?:ing)?|sale|mrp|kharid|khareed|bikri|bhav|daam|to|by)\b|₹|@|रेट|भाव|दाम|ख़रीद|खरीद|बिक्री|लागत|का रेट|की रेट|से/i;
  const km=s.match(kw);
  let namePart = km ? s.slice(0,km.index) : s;
  let ratePart = km ? s.slice(km.index) : "";
  if(!km){ const mTail=s.match(/(\s+\d+(?:\.\d+)?(?:\s*(?:,|and|aur|और|&)?\s+\d+(?:\.\d+)?)*)\s*(?:rs|rupees?|रुपये|रुपए)?\s*$/i); if(mTail){ namePart=s.slice(0,mTail.index); ratePart=mTail[1]; } }
  namePart = namePart.replace(RE_VERBWORD," ").replace(new RegExp(RE_ADD.source,"gi")," ").replace(new RegExp(RE_UPD.source,"gi")," ").replace(new RegExp(RE_DEL.source,"gi")," ")
    .replace(/\b(the|item|product|of|please|ka|ki|ke|ko|ek|aur|and|price|rate|do|de|dena|by|increase|decrease|raise|reduce|kam|badha|ghata)\b|(?:^|\s)(?:का|की|के|को|एक|आइटम|सामान|दो|दें|देना|और|कम)(?=\s|$)/gi," ")
    .replace(new RegExp("(?:\\bper\\b|/|प्रति)\\s*[a-z\\u0900-\\u097F.]+","gi")," ").replace(/[,;:।]+/g," ").replace(/\s+/g," ").trim();
  const nums=(ratePart.replace(mBuy?mBuy[0]:"\u0000"," ").replace(mSell?mSell[0]:"\u0000"," ").match(/\d+(?:\.\d+)?/g)||[]).map(Number);
  if(buy==null && sell==null && !pct){ if(nums.length>=2){ buy=nums[0]; sell=nums[1]; } else if(nums.length===1){ sell=nums[0]; } }
  else if(buy!=null && sell==null && nums.length) sell=nums[0];
  else if(sell!=null && buy==null && nums.length) buy=nums[0];
  if(!namePart) return null;
  const match=bestMatch(namePart);
  if(!op) op = match ? "update" : "add";
  if(op==="add" && match){ op="update"; }
  if(op!=="add" && !match){ if(op==="delete") return null; op="add"; }
  const name = op==="add" ? titleCase(namePart) : match.name;
  if(op==="update" && pct!=null){ const f=x=>roundPrice(x*(1+pct/100)); if(buy==null) buy=f(match.buy); if(sell==null) sell=f(match.sell); }
  if(op==="add" && sell==null) return { op, id:null, name, nameHi:"", unit:unit||S.cfg.defaultUnit, buy, sell:null };
  return { op, id: match?match.id:null, name, nameHi: match?match.nameHi:"", unit: unit || (match?match.unit:S.cfg.defaultUnit), buy, sell };
}
function titleCase(s){ return s.replace(/(^|\s)([a-z])/g,(m,a,b)=>a+b.toUpperCase()); }
function roundPrice(n){ const r=+S.cfg.roundTo; if(r===1) return Math.round(n); if(r===0.5) return Math.round(n*2)/2; return Math.round(n*100)/100; }
/* Spoken commands arrive as one long line. Split it where one complete change ends and the next begins,
   e.g. "add 51 micron bag 1kg rates 110 and 120 चीनी 5% बढ़ा दो" → two changes. */
const SPLIT_TAIL=/^\s*(?:(?:%|percent|pratishat|प्रतिशत|rs\.?|rupees?|रुपये|रुपए|रुपया|kam|badha|badhao|ghata|ghatao|kar|karo|do|de|dena|please|कम|बढ़ा|बढ़ा|बढा|घटा|कर|करो|करें|दो|दें|दीजिए)(?=\s|$)\s*)+/i;
function completeAct(a){ return !!a && (a.op==="delete" || a.sell!=null || a.buy!=null); }
function splitCommands(line){
  const out=[]; let rest=line.trim(), guard=0;
  const okRight=b=>completeAct(b) && !(b.op==="add" && !RE_ADD.test(b._src||""));
  while(rest && guard++<25){
    const cands=[];
    // after a rate: "…120 | चीनी 5% बढ़ा दो"
    const re=/\d+(?:\.\d+)?/g; let m;
    while((m=re.exec(rest))){
      let end=m.index+m[0].length;
      if(/[a-zऀ-ॿ]/i.test(rest[end]||"")) continue;          // "1kg": part of a name
      const tail=rest.slice(end).match(SPLIT_TAIL); if(tail) end+=tail[0].length;
      const pu=rest.slice(end).match(/^\s*(?:per\s+|प्रति\s*|\/\s*)?([a-zऀ-ॿ.]+)/i); if(pu && unitFromWord(pu[1])) end+=pu[0].length;
      cands.push(end);
    }
    // before an English verb that starts a new change: "delete maida | add besan …"
    const rv=/\s(add|delete|remove|update|change|set|increase|decrease|reduce)\b/gi; let v;
    while((v=rv.exec(rest))) cands.push(v.index+1);
    cands.sort((a,b)=>a-b);
    let cut=-1;
    for(const end of cands){
      const left=rest.slice(0,end).trim(), right=rest.slice(end).trim();
      if(!left||!right) continue;
      if(/^(?:,|and|aur|और|&|\+|\/|-|to|se|से)?\s*\d/i.test(right)) continue;   // "110 and 120"
      const a=parseOne(left), b=parseOne(right); if(b) b._src=right;
      if(completeAct(a) && okRight(b)){ cut=end; break; }
    }
    if(cut<0){ out.push(rest); break; }
    out.push(rest.slice(0,cut).trim()); rest=rest.slice(cut).trim();
  }
  return out;
}
function localParse(text){ return devDigits(text).split(/\n|;|\.\s|।|\b(?:and then|phir|fir)\b|फिर/i).map(x=>x.trim()).filter(Boolean).flatMap(splitCommands).map(parseOne).filter(Boolean); }

/* ---------------- English → Hindi letters (transliteration, not translation) ---------------- */
const HI_WORDS={
  bag:"बैग",bags:"बैग्स",gauge:"गेज",micron:"माइक्रोन",microns:"माइक्रोन",drone:"ड्रोन",jumbo:"जंबो",film:"फ़िल्म",stretch:"स्ट्रेच",sugar:"शुगर",paper:"पेपर",cup:"कप",cups:"कप्स",
  plate:"प्लेट",plates:"प्लेट्स",glass:"ग्लास",box:"बॉक्स",boxes:"बॉक्सेस",roll:"रोल",rolls:"रोल्स",tape:"टेप",pouch:"पाउच",zip:"ज़िप",lock:"लॉक",ziplock:"ज़िपलॉक",carry:"कैरी",
  garbage:"गार्बेज",black:"ब्लैक",white:"व्हाइट",blue:"ब्लू",green:"ग्रीन",red:"रेड",yellow:"येलो",silver:"सिल्वर",gold:"गोल्ड",golden:"गोल्डन",foil:"फॉयल",rubber:"रबर",band:"बैंड",
  plastic:"प्लास्टिक",poly:"पॉली",polythene:"पॉलीथीन",large:"लार्ज",medium:"मीडियम",small:"स्मॉल",big:"बिग",extra:"एक्स्ट्रा",heavy:"हैवी",super:"सुपर",premium:"प्रीमियम",
  transparent:"ट्रांसपेरेंट",printed:"प्रिंटेड",print:"प्रिंट",plain:"प्लेन",milk:"मिल्क",powder:"पाउडर",oil:"ऑयल",mustard:"मस्टर्ड",rice:"राइस",tea:"टी",coffee:"कॉफ़ी",salt:"सॉल्ट",
  soap:"सोप",packet:"पैकेट",packets:"पैकेट्स",pack:"पैक",piece:"पीस",pieces:"पीस",size:"साइज़",inch:"इंच",inches:"इंच",thread:"थ्रेड",rope:"रोप",container:"कंटेनर",containers:"कंटेनर",
  bottle:"बॉटल",bottles:"बॉटल्स",spoon:"स्पून",straw:"स्ट्रॉ",straws:"स्ट्रॉ",bowl:"बाउल",tray:"ट्रे",lid:"लिड",tissue:"टिशू",napkin:"नैपकिन",napkins:"नैपकिन",wrap:"रैप",cling:"क्लिंग",
  aluminium:"एल्युमिनियम",aluminum:"एल्युमिनियम",sheet:"शीट",sheets:"शीट्स",max:"मैक्स",mini:"मिनी",brown:"ब्राउन",pink:"पिंक",orange:"ऑरेंज",color:"कलर",colour:"कलर",clear:"क्लियर",
  thick:"थिक",thin:"थिन",light:"लाइट",sack:"सैक",jute:"जूट",nylon:"नायलॉन",cotton:"कॉटन",wire:"वायर",pipe:"पाइप",brush:"ब्रश",bucket:"बकेट",mug:"मग",tub:"टब",
  basmati:"बासमती",chawal:"चावल",dal:"दाल",daal:"दाल",atta:"आटा",aata:"आटा",besan:"बेसन",maida:"मैदा",sooji:"सूजी",suji:"सूजी",poha:"पोहा",toor:"तूर",tur:"तूर",chana:"चना",
  masala:"मसाला",haldi:"हल्दी",mirch:"मिर्च",dona:"दोना",pattal:"पत्तल",thali:"थाली",katori:"कटोरी",sutli:"सुतली",gilas:"गिलास",chini:"चीनी",namak:"नमक",
  food:"फ़ूड",grade:"ग्रेड",quality:"क्वालिटी",double:"डबल",single:"सिंगल",layer:"लेयर",party:"पार्टी",shopping:"शॉपिंग",shopper:"शॉपर",handle:"हैंडल",loop:"लूप",cut:"कट",
  d:"डी",u:"यू",w:"डब्ल्यू",flat:"फ़्लैट",round:"राउंड",square:"स्क्वायर",star:"स्टार",card:"कार्ड",cards:"कार्ड्स",jar:"जार",can:"कैन",tin:"टिन",sticker:"स्टिकर",label:"लेबल",
  wrapper:"रैपर",packing:"पैकिंग",packaging:"पैकेजिंग",courier:"कूरियर",envelope:"एनवेलप",cover:"कवर",covers:"कवर",net:"नेट",mesh:"मेश",bubble:"बबल",cello:"सेलो",cellotape:"सेलोटेप",
  masking:"मास्किंग",kraft:"क्राफ़्ट",corrugated:"कोरुगेटेड",carton:"कार्टन",cartons:"कार्टन",thermocol:"थर्मोकोल",silicone:"सिलिकॉन",gloves:"ग्लव्स",glove:"ग्लव",
  cap:"कैप",caps:"कैप्स",mask:"मास्क",masks:"मास्क",apron:"एप्रन",cutter:"कटर",scissor:"सीज़र",scissors:"सीज़र",stapler:"स्टेपलर",pin:"पिन",pins:"पिन्स",clip:"क्लिप",clips:"क्लिप्स",
  kg:"किलो",kgs:"किलो",kilo:"किलो",g:"ग्राम",gm:"ग्राम",gms:"ग्राम",gram:"ग्राम",grams:"ग्राम",ml:"एमएल",l:"लीटर",ltr:"लीटर",litre:"लीटर",liter:"लीटर",pc:"पीस",pcs:"पीस",
  mm:"एमएम",cm:"सेमी",mtr:"मीटर",meter:"मीटर",metre:"मीटर",ft:"फ़ुट",feet:"फ़ीट",dozen:"दर्जन",no:"नंबर",number:"नंबर",and:"एंड",with:"विद",of:"ऑफ़",for:"फ़ॉर",the:"द",
  new:"न्यू",old:"ओल्ड",special:"स्पेशल",deluxe:"डीलक्स",regular:"रेगुलर",standard:"स्टैंडर्ड",economy:"इकोनॉमी",eco:"इको",natural:"नैचुरल",fresh:"फ़्रेश",pure:"प्योर",
  water:"वॉटर",juice:"जूस",sweet:"स्वीट",sweets:"स्वीट्स",cake:"केक",biscuit:"बिस्किट",bread:"ब्रेड",egg:"एग",ice:"आइस",cream:"क्रीम",chocolate:"चॉकलेट",pizza:"पिज़्ज़ा",burger:"बर्गर",
  sandwich:"सैंडविच",meal:"मील",tiffin:"टिफ़िन",lunch:"लंच",kitchen:"किचन",disposable:"डिस्पोज़ेबल",wooden:"वुडन",butter:"बटर",kurkure:"कुरकुरे",laddu:"लड्डू",ladoo:"लड्डू",kaju:"काजू",katli:"कतली",biryani:"बिरयानी",patanjali:"पतंजलि",rasgulla:"रसगुल्ला",gulab:"गुलाब",jamun:"जामुन",barfi:"बर्फ़ी",namkeen:"नमकीन",peda:"पेड़ा",laminated:"लैमिनेटेड",non:"नॉन",woven:"वोवन",zipper:"ज़िपर",degree:"डिग्री",steel:"स्टील",dish:"डिश",dishes:"डिशेज़",bundle:"बंडल",kit:"किट",set:"सेट",pair:"पेयर",home:"होम",hotel:"होटल",shop:"शॉप",store:"स्टोर",hand:"हैंड",towel:"टॉवल"
};
const HI_LETTERS={a:"ए",b:"बी",c:"सी",d:"डी",e:"ई",f:"एफ़",g:"जी",h:"एच",i:"आई",j:"जे",k:"के",l:"एल",m:"एम",n:"एन",o:"ओ",p:"पी",q:"क्यू",r:"आर",s:"एस",t:"टी",u:"यू",v:"वी",w:"डब्ल्यू",x:"एक्स",y:"वाई",z:"ज़ेड"};
const HI_ACRONYMS=new Set(["pp","hd","ld","hdpe","ldpe","lldpe","bopp","pvc","pet","gsm","led","cfl","abs","eps","ms","ss","gi"]);
// consonant patterns, longest first
const HI_CONS=[["ksh","क्ष"],["chh","छ"],["sch","स्क"],["tch","च"],["sh","श"],["ch","च"],["th","थ"],["dh","ध"],["ph","फ़"],["bh","भ"],["gh","घ"],["kh","ख"],["jh","झ"],["ck","क"],["qu","क्व"],["wh","व"],["gn","न"],
  ["b","ब"],["c","क"],["d","ड"],["f","फ़"],["g","ग"],["h","ह"],["j","ज"],["k","क"],["l","ल"],["m","म"],["n","न"],["p","प"],["q","क"],["r","र"],["s","स"],["t","ट"],["v","व"],["w","व"],["x","क्स"],["y","य"],["z","ज़"]];
const HI_VOW_IND={"a":"अ","aa":"आ","e":"ए","ee":"ई","ea":"ई","i":"इ","ie":"आई","o":"ओ","oo":"ऊ","ou":"आउ","ow":"ओ","u":"अ","ai":"ए","ay":"ए","au":"ऑ","oa":"ओ","oi":"ऑय","oy":"ऑय"};
const HI_VOW_MAT={"a":"","aa":"ा","e":"े","ee":"ी","ea":"ी","i":"ि","ie":"ाइ","o":"ो","oo":"ू","ou":"ाउ","ow":"ो","u":"","ai":"े","ay":"े","au":"ॉ","oa":"ो","oi":"ॉय","oy":"ॉय","ar":"ा"};
const isV=ch=>"aeiou".includes(ch);
function hiWordRules(w){
  // w: lowercase letters only
  let out="", i=0, prevCons=false;
  const n=w.length;
  const vowelCount=(w.match(/[aeiouy]+/g)||[]).length;
  while(i<n){
    const rest=w.slice(i);
    // vowels
    if(isV(w[i]) || (w[i]==="y" && i>0 && !isV(w[i-1]) && (i===n-1 || !isV(w[i+1])))){
      let v;
      if(w[i]==="y"){ v = i===n-1 ? "ee" : "i"; i++; }
      else {
        const two=rest.slice(0,2);
        if(["aa","ee","ea","oo","ou","ow","ai","ay","au","oa","oi","oy","ie"].includes(two) && !(two==="ie" && i+2<n)){ v=two; i+=2; }
        else { v=w[i]; i++;
          // silent final e after a consonant (magic e): lengthen previous vowel handled below
          if(v==="e" && i===n && prevCons && vowelCount>1){ break; }
          const nextC=w.slice(i).match(/^[^aeiouy]+/); const after=nextC? w.slice(i+nextC[0].length):"";
          if(v==="u" && i===n){ v="oo"; }
          else if(v==="i" && i===n){ v="ee"; }
          else if(v==="a"){
            if(i===n) v="aa";                                   // final a
            else if(nextC && nextC[0][0]==="r" && (nextC[0].length>1 || !after)) v="ar";   // car, card, star
            else if(nextC && nextC[0].length===1 && after==="e") v="e";   // tape, cake, plate
            else if(vowelCount===1) v="ae";                     // bag, max, pack
          } else if(v==="i"){
            if(nextC && nextC[0].length===1 && after==="e") v="ie";   // wire, pipe, size
          } else if(v==="o"){
            if(nextC && nextC[0].length===1 && after==="e") v="o";    // drone, rope
            else if(vowelCount===1 && nextC) v="au";            // box, lock, pot
          } else if(v==="u"){
            if(nextC && nextC[0].length===1 && after==="e") v="oo";   // tube, jute
          }
        }
      }
      const ind = v==="ae" ? "ऐ" : (HI_VOW_IND[v]||"अ");
      const mat = v==="ae" ? "ै" : (HI_VOW_MAT[v]??"");
      if(prevCons){ if(out.endsWith("्")) out=out.slice(0,-1); out+=mat; } else out+=ind;
      prevCons=false; continue;
    }
    // consonants
    let hit=null;
    for(const [k,val] of HI_CONS){ if(rest.startsWith(k)){ hit=[k,val]; break; } }
    if(!hit){ i++; continue; }
    let [k,val]=hit;
    // soft c / g before e,i,y
    if(k==="c" && /^[eiy]/.test(w.slice(i+1))) val="स";
    if(k==="g" && /^[eiy]/.test(w.slice(i+1)) && i>0) val="ज";
    // doubled consonant → one sound
    if(k.length===1 && w[i+1]===k){ if(/[aiuo]$/.test(w)) { out+=val+"्"; } i++; }
    if(prevCons) out+="";                         // previous already has virama
    out+=val+"्"; prevCons=true; i+=k.length;
  }
  if(out.endsWith("्")) out=out.slice(0,-1);    // final consonant keeps no virama (schwa dropped when read)
  return out;
}
function toHindi(name){
  const src=String(name||"").trim(); if(!src) return "";
  if(/[ऀ-ॿ]/.test(src) && !/[A-Za-z]/.test(src)) return src;      // already Hindi
  const toks=src.split(/(\s+|[,/()+&-])/);
  const words=toks.filter(x=>x && !/^\s+$/.test(x));
  return toks.map((tok,ti)=>{
    if(!tok || /^\s+$/.test(tok) || /^[,/()+&-]$/.test(tok)) return tok;
    // split leading/trailing digits from letters: "1kg" → "1" "kg", "200gsm"
    const m=tok.match(/^(\d+(?:\.\d+)?)([A-Za-z]+)\.?$/);
    if(m) return m[1]+" "+hiToken(m[2],tok);
    return hiToken(tok,tok,toks,ti);
  }).join("").replace(/\s+/g," ").trim();
}
function hiToken(tok,orig,toks,ti){
  if(/^[\d.]+$/.test(tok)) return tok;                                   // numbers stay
  if(/^\d+(\.\d+)?[x*]\d+(\.\d+)?$/i.test(tok)) return tok.replace(/\*/,"x");   // 12x18
  if(/[ऀ-ॿ]/.test(tok)) return tok;
  if(tok==="x"||tok==="X"||tok==="*") return "x";                        // 27 x 30
  const clean=tok.replace(/[^A-Za-z]/g,""); if(!clean) return tok;
  const low=clean.toLowerCase();
  if(low==="no" && /\.$/.test(tok)) return "नंबर";
  if(HI_WORDS[low]) return HI_WORDS[low];
  const isCaps = clean===clean.toUpperCase() && clean.length>1;
  if(HI_ACRONYMS.has(low) || (isCaps && clean.length<=4 && !/[aeiou]/i.test(clean.slice(1))) || !/[aeiouy]/.test(low))
    return [...low].map(c=>HI_LETTERS[c]||"").join("");
  // plural s on a known word: "drones" → ड्रोन्स
  if(low.endsWith("s") && HI_WORDS[low.slice(0,-1)]) return HI_WORDS[low.slice(0,-1)]+"्स";
  return hiWordRules(low);
}

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
function thumbHTML(it,size){
  const st=size?` style="width:${size}px;height:${size}px;font-size:${Math.round(size*.4)}px"`:"";
  const th=thumbOf(it);
  return th ? `<div class="thumb"${st}><img src="${esc(th)}" alt="" loading="lazy" decoding="async"></div>` : `<div class="thumb"${st}>${esc((it.name||"?").trim().charAt(0).toUpperCase())}</div>`;
}
function thumbOf(it){ const c=it.imgV && S.thumbs[it.id]; return c && c.v===it.imgV ? c.d : (c && it.imgV ? c.d : null); }
function marginPct(it){ const b=+it.buy, s=+it.sell; if(!(b>0)||!(s>=0)) return ""; return Math.round((s-b)/b*100)+"%"; }
function billQty(id){ const l=S.bill.find(x=>x.id===id); return l? l.qty : 0; }
function cardHTML(it,q){
  const inB=billQty(it.id);
  const rates = hideBuy() ? "" : `<div class="rates num"><span>${t("buy")} <b>${rs(it.buy)}</b></span>${marginPct(it)?`<span>${t("margin")} <b>${marginPct(it)}</b></span>`:""}${popN(it.id)?`<span class="sold">${esc(t("soldIn",popN(it.id)))}</span>`:""}</div>`;
  return `<div class="card${it.pending?" pending":""}${thumbOf(it)?"":" noimg"}" data-id="${esc(it.id)}">
    ${thumbHTML(it)}
    <div class="info"><div class="name">${highlight(it.name,q)}</div>
      ${it.nameHi?`<div class="sub" lang="hi">${highlight(it.nameHi,q)}</div>`:""}${akaHTML(it,q)}${rates}
    </div>
    <div class="price"><div class="sell num">${rs(it.sell)}</div><div class="per">/ ${esc(unitL(it.unit))}</div>${hasAlt(it)?`<div class="per num">${rs(altPrice(it))} / ${esc(unitL(it.altUnit))}</div>`:""}
      ${inB?`<div class="mstep"><button type="button" data-decid="${esc(it.id)}" aria-label="${esc(t("dec"))}">−</button><span class="num">${esc(qtyShort(inB,it.unit))}</span><button type="button" data-add="${esc(it.id)}" aria-label="${esc(t("addToBill"))}">+</button></div>`
        :`<button class="addbtn" data-add="${esc(it.id)}" aria-label="${esc(t("addToBill"))}">+ ${esc(t("tabBill"))}</button>`}</div>
  </div>`;
}
/** Searching by another name ("thaili") shows that name under the item, so it's clear why it matched. */
function akaHTML(it,q){ if(!q || !it.aliases) return ""; const raw=q.trim().toLowerCase(); if(it.name.toLowerCase().includes(raw) || (it.nameHi||"").includes(q.trim())) return "";
  const qt=phonTokens(q), hit=aliasList(it.aliases).filter(a=>{ const at=phonTokens(a); return qt.every(x=>at.some(y=>y.startsWith(x)||x.startsWith(y))); });
  return hit.length ? `<div class="aka">${esc(t("akaL"))} ${hit.slice(0,2).map(a=>highlight(a,q)).join(", ")}</div>` : ""; }
const aliasList = s => String(s||"").split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
/** Groups in use, most items first. */
/* ---------------- Item groups ----------------
 * Group names and the words that suggest them depend on the type of business (Settings → Item groups → Type of business,
 * Config "bizType"). A new item's group is guessed from (1) items already in a group with a similar name (learned from this
 * shop), then (2) the business type's word list. The guess is filled in automatically; it can be changed or cleared. */
const BIZ={
  plastics:{ groups:["Bags","Cups & glasses","Plates & bowls","Containers & boxes","Foil","Film & wrap","Tape","Spoons & straws","Tissue & napkins","Cleaning & housekeeping","Bottles","Rubber bands"],
    rules:[["Bags",/\b(bags?|thail[ia]|carry|pouch(es)?|zip ?lock|ziplock|garbage|d-?cut|w-?cut|polythene|panni|bori|sack|liner)\b/i],
      ["Cups & glasses",/\b(cups?|glass(es)?|tumblers?|kulhad|gilas)\b/i],["Plates & bowls",/\b(plates?|thali|bowls?|dona|donna|katori|pattal)\b/i],
      ["Containers & boxes",/\b(containers?|box(es)?|dabba|tub|jar|lunch ?box|meal ?tray|tray)\b/i],["Foil",/\b(foil|silver|alumin(i)?um)\b/i],
      ["Film & wrap",/\b(film|stretch|cling|wrap|shrink|bubble)\b/i],["Tape",/\b(tapes?|cello)\b/i],["Spoons & straws",/\b(spoons?|forks?|straws?|stirrers?|chammach)\b/i],
      ["Tissue & napkins",/\b(tissues?|napkins?)\b/i],["Cleaning & housekeeping",/\b(phenyl|mop|pocha|broom|jhadu|jharu|wiper|duster|scrubber|scrub|cleaner|harpic|lizol|naphthalene|bucket|dustbin|toilet|brush|gloves?|sponge|odonil)\b/i],
      ["Bottles",/\b(bottles?)\b/i],["Rubber bands",/\b(rubber ?bands?)\b/i]] },
  kirana:{ groups:["Atta & flour","Rice & grains","Dal & pulses","Oil & ghee","Spices & masala","Sugar, salt & jaggery","Tea & coffee","Dry fruits","Snacks & biscuits","Dairy","Packaged food","Beverages","Soap & detergent","Personal care","Cleaning"],
    rules:[["Atta & flour",/\b(atta|aata|maida|besan|suji|sooji|rava|flour)\b/i],["Rice & grains",/\b(rice|chawal|basmati|poha|dalia|jowar|bajra|ragi|millet|sabudana)\b/i],
      ["Dal & pulses",/\b(dal|daal|moong|masoor|chana|rajma|urad|toor|tuar|arhar|lobia|matar|kabuli)\b/i],["Oil & ghee",/\b(oil|tel|ghee|sarso|sarson|mustard|refined|vanaspati|dalda)\b/i],
      ["Spices & masala",/\b(masala|haldi|turmeric|mirch|chilli|chili|dhaniya|coriander|jeera|cumin|hing|elaichi|laung|clove|pepper|kali ?mirch|ajwain|methi|rai|spices?)\b/i],
      ["Sugar, salt & jaggery",/\b(sugar|cheeni|chini|shakkar|gud|jaggery|salt|namak|mishri)\b/i],["Tea & coffee",/\b(tea|chai|patti|coffee)\b/i],
      ["Dry fruits",/\b(kaju|badam|kishmish|almonds?|cashews?|raisins?|akhrot|walnuts?|pista|dates|khajur|makhana)\b/i],
      ["Snacks & biscuits",/\b(biscuits?|namkeen|chips|kurkure|bhujia|cookies|rusk|toast|wafers?|mixture)\b/i],["Dairy",/\b(milk|doodh|paneer|curd|dahi|butter|cheese|makhan)\b/i],
      ["Packaged food",/\b(noodles|maggi|pasta|sauce|ketchup|jam|cornflakes|oats|vermicelli|seviyan|papad|pickle|achar)\b/i],["Beverages",/\b(cold ?drink|juice|pepsi|coke|cola|sprite|frooti|maaza|water|bisleri|soda)\b/i],
      ["Soap & detergent",/\b(soap|sabun|detergent|surf|washing|rin|tide|ariel|vim|nirma|wheel)\b/i],["Personal care",/\b(shampoo|toothpaste|tooth ?brush|paste|cream|lotion|deo|talc|powder|razor|hair ?oil|face ?wash|sanitary|pads?)\b/i],
      ["Cleaning",/\b(phenyl|harpic|lizol|broom|jhadu|mop|pocha|cleaner|colin|naphthalene|agarbatti|matchbox)\b/i]] },
  stationery:{ groups:["Notebooks & registers","Pens & pencils","Art & colours","Files & folders","Paper & charts","Office supplies","School & geometry","Gifts & cards"],
    rules:[["Notebooks & registers",/\b(note ?books?|copy|copies|registers?|diary|diaries|note ?pad|drawing ?book|long ?book)\b/i],
      ["Pens & pencils",/\b(pens?|pencils?|refills?|markers?|highlighters?|gel|ball ?pen|sketch ?pens?|fountain)\b/i],
      ["Art & colours",/\b(colou?rs?|crayons?|paints?|brush(es)?|canvas|wax|poster|water ?colou?r|oil ?pastel|glitter)\b/i],
      ["Files & folders",/\b(files?|folders?|envelopes?|clip ?board|binder|sleeve)\b/i],["Paper & charts",/\b(paper|a4|a3|charts?|sheets?|ream|bond|card ?sheet|photo ?paper)\b/i],
      ["Office supplies",/\b(stapler|staples?|pins?|clips?|glue|fevicol|fevi ?stick|tape|scissors?|cutter|punch|calculator|stamp|ink|pad)\b/i],
      ["School & geometry",/\b(geometry|scale|ruler|eraser|rubber|sharpener|compass|protractor|school ?bag|tiffin|bottle|lab ?coat)\b/i],
      ["Gifts & cards",/\b(gift|greeting|cards?|wrapping|ribbon|toys?)\b/i]] },
  hardware:{ groups:["Pipes & fittings","Tools","Electrical","Paints","Fasteners","Sanitary","Locks & handles","Adhesives & sealants"],
    rules:[["Pipes & fittings",/\b(pipes?|elbow|tee|socket|coupler|valve|pvc|cpvc|gi|bend|reducer)\b/i],["Tools",/\b(hammer|spanner|screw ?driver|plier|drill|saw|chisel|wrench|tools?|measuring ?tape)\b/i],
      ["Electrical",/\b(wire|cable|switch|bulb|led|mcb|holder|plug|socket|tube ?light|fan|extension)\b/i],["Paints",/\b(paints?|primer|putty|distemper|enamel|thinner|brush|roller)\b/i],
      ["Fasteners",/\b(nails?|screws?|bolts?|nuts?|washers?|anchors?|rivets?|kil)\b/i],["Sanitary",/\b(tap|faucet|shower|basin|flush|commode|sink|health ?faucet)\b/i],
      ["Locks & handles",/\b(locks?|handles?|hinges?|latch|tower ?bolt|aldrop|knob)\b/i],["Adhesives & sealants",/\b(m-?seal|araldite|fevicol|sealant|silicone|adhesive|teflon)\b/i]] },
  other:{ groups:[], rules:[] }
};
const BIZ_KEYS=["plastics","kirana","stationery","hardware","other"];
/** The shop's business type: the setting, or worked out from groups already in use (so this shop needs no setup). */
function bizType(){ if(S.cfg.bizType && BIZ[S.cfg.bizType]) return S.cfg.bizType;
  const have=new Set(allGroups().map(g=>g.toLowerCase())); let best="", bn=1;
  for(const k of BIZ_KEYS){ const n=BIZ[k].groups.filter(g=>have.has(g.toLowerCase())).length; if(n>bn){ bn=n; best=k; } } if(best) return best;
  const sn=String(S.cfg.shopName||"").toLowerCase();   // else a hint from the shop name, until the owner picks one
  return /plastic|packag|disposable|housekeep/.test(sn)?"plastics" : /kirana|grocer|provision|general store|super ?mart|mart\b/.test(sn)?"kirana" : /stationer|book ?(depot|store|shop)|xerox/.test(sn)?"stationery" : /hardware|paint|sanitary|electric/.test(sn)?"hardware" : ""; }
function bizRules(){ const b=bizType(); return b ? BIZ[b].rules : []; }
/** Every group: the shop's list (Config "groups") plus any group used on an item, list order first. */
function allGroups(){ const out=[], seen=new Set(), add=g=>{ const v=String(g||"").trim(); if(v && !seen.has(v.toLowerCase())){ seen.add(v.toLowerCase()); out.push(v); } };
  (S.cfg.groups||[]).forEach(add); catsInUse().forEach(([c])=>add(c)); return out; }
/* Learned from this shop: words in item names → groups. Built with the search index. */
const CAT_STOP=new Set(["kg","gm","gms","g","ml","ltr","litre","liter","pc","pcs","piece","pieces","pkt","packet","pack","box","inch","inches","mm","cm","micron","gauge","guage","no","size","small","big","large","medium","jumbo","mini","new","best","super","premium","special","white","black","red","blue","green","yellow","pink","plain","printed","with","and","for","of","x"]);
const CAT_UNITS=new Set(["kg","gm","gms","ml","ltr","litre","liter","pcs","pkt","inch","inches","mm","cm","micron","gauge","guage","grams","gram"]);
/** Words that tell what an item is. Size words ("jumbo", "large") are skipped unless they're all the name has. */
function catWords(n){ const all=String(n||"").toLowerCase().replace(/[^a-z\u0900-\u097f ]+/g," ").split(/\s+/).filter(w=>w.length>=3);
  const main=all.filter(w=>!CAT_STOP.has(w)); return [...new Set(main.length?main:all.filter(w=>!CAT_UNITS.has(w)))]; }
let CAT_M=null;
function catModel(){ if(CAT_M) return CAT_M; const tok=new Map(), items=[];
  S.items.forEach(it=>{ if(!it.cat) return; const ws=catWords(it.name); items.push({ws:new Set(ws),cat:it.cat}); ws.forEach(w=>{ const m=tok.get(w)||new Map(); m.set(it.cat,(m.get(it.cat)||0)+1); tok.set(w,m); }); });
  return CAT_M={tok,items}; }
/** Best group for a name, with where it came from: {cat, from:"like"|"word"|"rule"} or null. */
function guessCatInfo(name){ const ws=catWords(name); if(!ws.length) return null; const M=catModel();
  // 1) an item in a group with mostly the same words ("PP Bag 300 Gauge" → same group as "PP Bag 200 Gauge")
  let best=null, bs=0; for(const x of M.items){ let c=0; ws.forEach(w=>{ if(x.ws.has(w)) c++; }); const j=c/(ws.length+x.ws.size-c); if(j>bs){ bs=j; best=x; } }
  if(best && bs>=0.5) return {cat:best.cat, from:"like"};
  // 2) words that, in this shop, almost always mean one group
  const votes=new Map(); ws.forEach(w=>{ const m=M.tok.get(w); if(!m) return; let tot=0, top="", tn=0; m.forEach((n,c)=>{ tot+=n; if(n>tn){ tn=n; top=c; } }); if(tn/tot>=0.75) votes.set(top,(votes.get(top)||0)+tn/tot*Math.min(3,tot)); });
  if(votes.size){ const [c]=[...votes.entries()].sort((a,b)=>b[1]-a[1])[0]; return {cat:c, from:"word"}; }
  // 3) the business type's word list
  for(const [c,re] of bizRules()) if(re.test(name)){ const have=allGroups().find(g=>g.toLowerCase()===c.toLowerCase()); return {cat:have||c, from:"rule"}; }
  return null; }
function guessCat(name){ const g=guessCatInfo(name); return g?g.cat:""; }
/** Save the shop's group list (all phones get it with the next sync). */
function saveGroups(list){ const clean=[]; list.forEach(g=>{ const v=String(g||"").trim(); if(v && !clean.some(x=>x.toLowerCase()===v.toLowerCase())) clean.push(v); });
  const old=S.cfg.groups; S.cfg.groups=clean; saveCache(); if(!can("manager")) return Promise.resolve();
  return write({action:"setGroups",groups:clean}).then(j=>{ if(j&&j.config&&Array.isArray(j.config.groups)) S.cfg.groups=j.config.groups; saveCache(); }).catch(()=>{ S.cfg.groups=old; }); }
function addGroup(g){ if(allGroups().some(x=>x.toLowerCase()===g.toLowerCase()) && (S.cfg.groups||[]).some(x=>x.toLowerCase()===g.toLowerCase())) return Promise.resolve(); return saveGroups([...allGroups(),g]); }
/** Rename or remove a group: re-save its items, then the list. */
async function renameGroup(from,to){ const items=S.items.filter(it=>it.cat===from).map(it=>({id:it.id, base:it.updatedAt, cat:to||""}));
  for(let i=0;i<items.length;i+=100){ const j=await write({action:"upsert",items:items.slice(i,i+100)}); mergeSaved(j.items); }
  await saveGroups(allGroups().map(g=>g===from?to:g).filter(Boolean)); afterLocal(); }
/** New items saved without a group get the guess (bulk add, plain-language add). */
const withCat = rec => rec.cat ? rec : (()=>{ const c=guessCat(rec.name); return c?{...rec,cat:c}:rec; })();
/** "bags " / "BAGS" → the spelling already in use ("Bags"), else first letter capital. */
function normCat(v){ const x=String(v||"").replace(/\s+/g," ").trim().slice(0,40); if(!x) return ""; const have=allGroups().find(c=>c.toLowerCase()===x.toLowerCase()); return have||x.charAt(0).toUpperCase()+x.slice(1); }
/** Tools → Groups & other names: every item in one list, groups pre-suggested from the name, saved in batches. */
function openGroups(){
  let onlyEmpty=false; const ed={};   // id → {cat, aliases}
  const rows=()=>S.items.filter(it=>!onlyEmpty || !it.cat).slice().sort((a,b)=>(a.cat||guessCat(a.name)||"~").localeCompare(b.cat||guessCat(b.name)||"~")||a.name.localeCompare(b.name));
  const val=(it,k)=> ed[it.id]&&ed[it.id][k]!==undefined ? ed[it.id][k] : k==="cat" ? (it.cat||guessCat(it.name)) : (it.aliases||"");
  const changed=()=>S.items.filter(it=>{ const c=normCat(val(it,"cat")), a=aliasList(val(it,"aliases")).join(", "); return c!==(it.cat||"") || a!==(it.aliases||""); });
  const body=`<div class="grp-man" id="gr-man"></div>
    <p class="note" style="margin:0 0 8px">${esc(t("grpHelp"))}</p>
    <label class="note" style="display:flex;gap:6px;align-items:center;margin-bottom:8px"><input type="checkbox" id="gr-only"> ${esc(t("grpOnlyEmpty"))}</label>
    <datalist id="gr-cats">${allGroups().map(c=>`<option value="${esc(c)}">`).join("")}</datalist>
    <div class="grp-head"><span>${esc(t("catField"))}</span><span>${esc(t("akaField"))}</span></div><div class="grp-list" id="gr-body"></div>
    <p class="note" id="gr-prog"></p>`;
  sheetKey("groups"), openSheet(t("grpT"), body, `<button class="btn ghost" id="gr-cancel">${esc(t("cancel"))}</button><button class="btn primary" id="gr-save"></button>`, {full:true});
  const tb=$("#gr-body");
  const upd=()=>{ const n=changed().length, b=$("#gr-save"); b.textContent=n?t("grpSaveN",n):t("grpNone"); b.disabled=!n; };
  const draw=()=>{ tb.innerHTML=rows().map(it=>{ const sug=!it.cat && !(ed[it.id]&&ed[it.id].cat!==undefined) && guessCat(it.name);
      return `<div class="grp-row"><b>${esc(it.name)}</b>
      <input data-gid="${esc(it.id)}" data-k="cat" list="gr-cats" maxlength="40" value="${esc(val(it,"cat"))}" class="${sug?"sugg":""}" placeholder="—" aria-label="${esc(t("catField"))}: ${esc(it.name)}">
      <input data-gid="${esc(it.id)}" data-k="aliases" maxlength="300" value="${esc(val(it,"aliases"))}" placeholder="${esc(t("akaPhShort"))}" aria-label="${esc(t("akaField"))}: ${esc(it.name)}"></div>`; }).join("") || `<p class="note">${esc(t("grpAllDone"))}</p>`; upd(); };
  /* Top: type of business (owner), the group list (+ add, tap to rename/remove), suggested groups for the business type. */
  let editing=null;
  const drawMan=()=>{ const m=$("#gr-man"); if(!m) return; const b=bizType(), sug=b?BIZ[b].groups.filter(g=>!allGroups().some(x=>x.toLowerCase()===g.toLowerCase())):[];
    m.innerHTML=`<div class="field"><label for="gr-biz">${esc(t("bizL"))}</label><select id="gr-biz" ${can("owner")?"":"disabled"}><option value="">${esc(t("bizPick"))}</option>${BIZ_KEYS.map(k=>`<option value="${k}" ${b===k?"selected":""}>${esc(t("biz_"+k))}</option>`).join("")}</select></div>
      <div class="catpick" id="gr-chips">${allGroups().map(g=>`<button type="button" data-gedit="${esc(g)}" aria-pressed="${editing===g}">${esc(g)}<span class="n">${S.items.filter(it=>it.cat===g).length}</span></button>`).join("")}<button type="button" class="cat-add" data-gnew>+ ${esc(t("catNew"))}</button></div>
      <div class="catnew" id="gr-new" hidden><input id="gr-new-in" maxlength="40" autocomplete="off" placeholder="${esc(t("catNewPh"))}"><button type="button" class="btn primary" id="gr-new-ok">${esc(t("add"))}</button></div>
      ${editing?`<div class="catnew"><input id="gr-ren" maxlength="40" value="${esc(editing)}" aria-label="${esc(t("catRename"))}"><button type="button" class="btn primary" id="gr-ren-ok">${esc(t("catRename"))}</button><button type="button" class="btn ghost" id="gr-del">${esc(t("catRemove"))}</button></div><p class="note" style="margin:0">${esc(t("catRemoveD"))}</p>`:""}
      ${sug.length?`<button type="button" class="btn ghost" id="gr-sug">${esc(t("bizAddSug",sug.length))}</button><p class="note" style="margin:0">${esc(sug.join(" · "))}</p>`:""}`;
    $("#gr-biz").onchange=async e=>{ const v=e.target.value; try{ await write({action:"setConfig",config:{bizType:v}}); }catch{} S.cfg.bizType=v; saveCache(); drawMan(); draw(); };
    $("#gr-chips").onclick=e=>{ if(e.target.closest("[data-gnew]")){ $("#gr-new").hidden=false; $("#gr-new-in").focus(); return; } const c=e.target.closest("[data-gedit]"); if(c){ editing = editing===c.dataset.gedit?null:c.dataset.gedit; drawMan(); } };
    const addN=async()=>{ const v=normCat($("#gr-new-in").value); if(!v) return; await addGroup(v); drawMan(); };
    $("#gr-new-ok").onclick=addN; $("#gr-new-in").addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); addN(); } });
    if(editing){ $("#gr-ren-ok").onclick=async()=>{ const to=$("#gr-ren").value.replace(/\s+/g," ").trim(); if(!to||to===editing) return; btnBusy($("#gr-ren-ok"),true); try{ await renameGroup(editing,to); toast(t("catRenamed")); }catch{} editing=null; drawMan(); draw(); };
      $("#gr-del").onclick=async()=>{ btnBusy($("#gr-del"),true); try{ await renameGroup(editing,""); toast(t("catRemoved")); }catch{} editing=null; drawMan(); draw(); }; }
    const sb=$("#gr-sug"); if(sb) sb.onclick=async()=>{ btnBusy(sb,true); await saveGroups([...allGroups(),...sug]); drawMan(); };
  };
  drawMan();
  tb.addEventListener("input",e=>{ const id=e.target.dataset.gid; if(!id) return; (ed[id]=ed[id]||{})[e.target.dataset.k]=e.target.value; e.target.classList.remove("sugg"); upd(); });
  $("#gr-only").onchange=e=>{ onlyEmpty=e.target.checked; draw(); };
  $("#gr-cancel").onclick=sheetCancel;
  $("#gr-save").onclick=async()=>{ if(navigator.onLine===false){ toast(t("offlineWrite")); return; }
    const recs=changed().map(it=>({id:it.id, base:it.updatedAt, cat:normCat(val(it,"cat")), aliases:aliasList(val(it,"aliases")).join(", ")}));
    if(!recs.length) return; $("#gr-save").disabled=true;
    try{ for(let i=0;i<recs.length;i+=100){ const part=recs.slice(i,i+100); const j=await write({action:"upsert",items:part}); mergeSaved(j.items); const p=$("#gr-prog"); if(p) p.textContent=t("savingN",Math.min(i+100,recs.length),recs.length); }
      if(SHEET_STK.length) sheetBack(); else closeSheet(); toast(t("savedN",recs.length)); resyncSoon(); }
    catch{ const b=$("#gr-save"); if(b) b.disabled=false; } };
  draw();
}
/** Photo grid (per phone): big tiles to look through by eye. */
const gridOn = () => ls.get("rb_layout","list")==="grid";
function catsInUse(){ const m=new Map(); S.items.forEach(it=>{ if(it.cat) m.set(it.cat,(m.get(it.cat)||0)+1); }); return [...m.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])); }
function renderHeader(){
  $("#shopname").textContent = S.cfg.shopName || (S.lang==="hi"?"रेट बुक":"Rate Book");
  $("#count").textContent = S.loaded && S.items.length ? " · "+t("items",S.items.length) : "";
  $("#cmd-open").hidden = !can("manager"); nBadge();
  const nm=byName(); $("#hello").textContent = nm ? t("helloName",nm) : t("hello");
}
function renderList(){
  renderHeader();
  const list=$("#list"), more=$("#list-more"), sug=$("#suggest"), hint=$("#cmdhint-wrap");
  const q=S.q.trim();
  hint.innerHTML = (apiUrl() && can("manager") && looksLikeCommand(q)) ? `<button class="cmdhint" data-act="cmdq"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 20 10-10M15 4v3M13.5 5.5h3M19 9v2M18 10h2M8 4v2M7 5h2"/></svg><span>${esc(t("cmdHintL"))} <b>${esc(t("cmdHintA"))} →</b></span></button>` : "";
  $("#setup-wrap").innerHTML = apiUrl() ? "" : setupHTML();
  if(!apiUrl()){ list.innerHTML=""; more.innerHTML=""; sug.innerHTML=""; $("#meta-l").textContent=""; return; }
  if(!S.loaded){ $("#meta-l").textContent=t("loading"); $("#meta-r").textContent=""; if(!S.items.length){ list.innerHTML=skelCards(6); more.innerHTML=""; sug.innerHTML=""; } return; }
  if(!S.items.length){
    sug.innerHTML=""; more.innerHTML=""; $("#meta-l").textContent=""; $("#meta-r").textContent="";
    list.innerHTML=`<div class="empty"><h2>${esc(t("emptyT"))}</h2><p>${esc(t("emptyD"))}</p>${can("manager")?`<div class="row-btns"><button class="btn primary" data-act="add">${esc(t("addItem"))}</button><button class="btn ghost" data-act="bulkadd">${esc(t("bulkAdd"))}</button><button class="btn ghost" data-act="cmd">${esc(t("cmdTitle"))}</button></div>`:`<div class="row-btns"><button class="btn primary" data-act="unlock">${esc(t("unlockT"))}</button></div>`}</div>`;
    return;
  }
  let {res,suggest,exact}=runSearch(q);
  renderFilters();
  if(S.filter==="bill") res=res.filter(r=>billQty(r.e.it.id)>0);
  else if(S.filter==="recent") res=res.filter(r=>Date.now()-(+r.e.it.updatedAt||0)<7*864e5);
  else if(S.filter==="photo") res=res.filter(r=>r.e.it.imgV);
  else if(String(S.filter).startsWith("c:")){ const c=S.filter.slice(2); res=res.filter(r=>r.e.it.cat===c); }
  $("#meta-l").textContent = q ? t("results", exact?res.length:0) : t("items",res.length);
  if(!q && S.lastSync && S.online) $("#meta-l").insertAdjacentHTML("beforeend",`<button type="button" class="netsync" id="meta-sync" aria-label="${esc(t("refresh"))}">· ${esc(t("syncedAt",new Date(S.lastSync).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})))} ↻</button>`);
  document.body.classList.toggle("qhas",!!q);
  { const mr=$("#meta-r"); const hasPop=!!S.pop && Object.keys(S.pop).length>0;
    mr.innerHTML = (hasPop && !q ? `<span class="sortseg" role="group" aria-label="${esc(t("sortL"))}"><button type="button" data-sort="pop" aria-pressed="${S.sortBy!=="az"}">${esc(t("sortPop"))}</button><button type="button" data-sort="az" aria-pressed="${S.sortBy==="az"}">${esc(t("sortAz"))}</button></span>` : "")
      + `<button type="button" class="layoutbtn" data-layout aria-label="${esc(t(gridOn()?"layList":"layGrid"))}" title="${esc(t(gridOn()?"layList":"layGrid"))}">${gridOn()?`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>`}</button>`; }
  list.classList.toggle("gridv", gridOn());
  if(q && !exact && !hint.innerHTML){
    sug.innerHTML=`<div class="suggest"><p>${esc(t("noMatch",q))} ${suggest.length?esc(t("didYouMean")):""}</p>
      ${suggest.length?`<div class="chips">${suggest.map(it=>`<button class="chip" data-pick="${esc(it.name)}">${esc(itemTitle(it))}</button>`).join("")}</div>`:""}
      ${can("manager")?`<div><button class="btn ghost" data-act="addq">${esc(t("addAsNew",q))}</button></div>`:""}</div>`;
  } else sug.innerHTML="";
  const shown=(q && !exact && hint.innerHTML) ? [] : res.slice(0,S.limit);
  list.innerHTML = shown.map(r=>cardHTML(r.e.it,q)).join("");
  list.classList.toggle("rows", !gridOn() && shown.length>0);   /* phones: one grouped list with dividers */
  /* jump to the best match only when the search text changes, never on a redraw (photos arriving, a sync), so scrolling the results isn't pulled back */
  if(q && q!==renderList.lastQ && document.body.classList.contains("qtyp") && document.documentElement.classList.contains("sbot")) requestAnimationFrame(()=>window.scrollTo(0,document.documentElement.classList.contains("sres-top")?0:document.documentElement.scrollHeight));
  renderList.lastQ=q;   // best match next to the search (or at the top, Settings)
  more.innerHTML = shown.length && res.length>S.limit ? `<button class="more" data-act="more">${esc(t("showMore",Math.min(40,res.length-S.limit)))}</button>` : "";
}
function renderFilters(){
  const box=$("#fchips"); if(!box) return;
  const inBill=S.bill.length, recent=S.items.filter(it=>Date.now()-(+it.updatedAt||0)<7*864e5).length, photo=S.items.filter(it=>it.imgV).length;
  const opts=[["all",t("fAll"),0],["bill",t("fInBill"),inBill],["recent",t("fRecent"),recent],["photo",t("fPhoto"),photo]].filter(o=>o[0]==="all"||o[2]>0||S.filter===o[0]);
  const hasPop=!!S.pop && Object.keys(S.pop).length>0;
  const cats=catsInUse();
  if(String(S.filter).startsWith("c:") && !cats.some(([c])=>"c:"+c===S.filter)) S.filter="all";
  box.hidden = opts.length<2 && !cats.length;
  /* All · groups (the main way to browse) · then In bill / Changed this week / With photo — one scrolling row, no extra height */
  const chip=([k,l,n])=>`<button type="button" class="fchip" data-filter="${k}" aria-pressed="${S.filter===k}">${esc(l)}${k!=="all"?`<span class="n">${n}</span>`:""}</button>`;
  const rest=opts.filter(o=>o[0]!=="all");
  box.innerHTML=chip(opts[0])
    + cats.map(([c,n])=>`<button type="button" class="fchip cat" data-filter="c:${esc(c)}" aria-pressed="${S.filter==="c:"+c}">${esc(c)}<span class="n">${n}</span></button>`).join("")
    + (rest.length?(cats.length?`<span class="fsep" aria-hidden="true"></span>`:"")+rest.map(chip).join(""):"");
  const on=box.querySelector('[aria-pressed="true"]'); if(on && on.offsetLeft>box.clientWidth-40) box.scrollLeft=on.offsetLeft-60;   // keep the picked chip in view
}
function renderBadge(){ const n=S.bill.length; const b=$("#bill-badge"); b.hidden=!n; b.textContent=n; }
function billText(){
  if(S.gst) return gstBillText();
  const d=billDateStr();
  let s=S.cfg.mode==="test"?`${t("testBillLine")}\n`:""; if(S.cfg.shopName) s+=`*${S.cfg.shopName}*\n`;
  s+=`${t("billNoLine",curBillNo())} · ${d}\n`+editedLine(); if(S.cust.trim()) s+=`${t("custL")}: ${S.cust.trim()}\n`; if(normMobile(S.mob)) s+=`${t("mobL")}: ${S.mob.trim()}\n`; s+="\n";
  S.bill.forEach((l,i)=>{ s+=`${i+1}. ${lineLabel(l)} — ${qtyText(l.qty,l.unit)} × ${rateText(l)} = ${rs(l.qty*l.rate)}\n`; });
  s+=`\n*${t("total")}: ${rs(billSum())}*`+payText(billSum()); if(S.cfg.billFooter) s+=`\n\n${S.cfg.billFooter}`; return s;
}
/* ---------------- Credit (udhaar) on the bill ---------------- */
/** How the money was taken (Paid by tiles): "" = not marked (as before), cash / upi / cheque. Not used on credit bills. */
const PM_KEYS={cash:"pmCash",upi:"pmUpi",cheque:"pmCheque"};
const pmLabel=k=>PM_KEYS[k]?t(PM_KEYS[k]):"";
const PM_EN={cash:"Cash",upi:"UPI",cheque:"Cheque"};   // printed / PDF bills are in English (ASCII)
function payInfo(total){ total=+total||0; const pm=S.pay==="credit"?"":(S.pm||"");
  if(S.pay==="credit") return {mode:"credit",recv:0,due:total,pm:""};
  if(S.pay==="part"){ const r=toNum(S.recv); const v=isNaN(r)?0:Math.max(0,r); return {mode:"part",recv:v,due:r2(Math.max(0,total-v)),pm}; }
  return {mode:"paid",recv:total,due:0,pm}; }
function payText(total){ const p=payInfo(total), by=p.pm?pmLabel(p.pm):"";
  if(p.mode==="paid") return by?`\n${t("pmL")}: ${by}`:"";
  return p.mode==="credit" ? `\n${t("waPayCredit")}\n*${t("waBal")}: ${rs(p.due)}*` : `\n${t("waPaid")}: ${rs(p.recv)}${by?` (${by})`:""}\n*${t("waBal")}: ${rs(p.due)}*`; }
function setPay(m){ S.pay=m; ls.set("rb_pay",m); renderPay(); updateBillTotals(); }
/** Tap a tile to pick it; tap it again to un-pick (nothing picked works as before). */
function setPm(k){ S.pm = S.pm===k ? "" : k; ls.set("rb_pm",S.pm); renderPay(); updateBillTotals(); }
function renderPay(){
  document.querySelectorAll("#pay-seg [data-pay]").forEach(b=>b.setAttribute("aria-checked",String(b.dataset.pay===S.pay)));
  $("#pay-part").hidden = S.pay!=="part";
  const pr=$("#pm-row"); if(pr){ pr.hidden = S.pay==="credit"; pr.querySelectorAll("[data-pm]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.pm===S.pm))); }
  const cr=S.pay!=="paid";
  $("#cust").placeholder = t("custName")+(cr?" *":""); $("#cust-mob").placeholder = t("custMob")+(cr?" *":"");
  if(!cr) ["#cust","#cust-mob","#pay-recv"].forEach(k=>$(k).classList.remove("need"));
}
/** Credit and part-paid bills need a name and a mobile, and part paid needs a sensible amount. */
function payCheck(){
  if(S.pay==="paid") return true;
  const nameOk=!!S.cust.trim(), mob=normMobile(S.mob), mobOk=!!mob;
  $("#cust").classList.toggle("need",!nameOk); $("#cust-mob").classList.toggle("need",!mobOk);
  if(!nameOk||!mobOk){ (nameOk?$("#cust-mob"):$("#cust")).focus(); toast(t("creditNeeds")); return false; }
  if(S.pay==="part"){ const tot=billTotal(), r=toNum(S.recv);
    if(isNaN(r)||r<=0||r>tot){ $("#pay-recv").classList.add("need"); $("#pay-recv").focus(); toast(t("recvBad")); return false; }
    if(r===tot){ $("#pay-recv").classList.add("need"); toast(t("recvAll")); return false; } }
  return true;
}
/* Financial year (April–March). GST invoices can restart from 1 each April (setting, on by default). */
function curFY(d){ d=d?new Date(d):new Date(); const y=d.getFullYear(), m=d.getMonth()+1, st=m>=4?y:y-1; return st+"-"+String(st+1).slice(2); }
const fyShort=fy=>String(fy||"").replace(/^20(\d\d)-(\d\d)$/,"$1-$2");
const fyOn=()=>S.cfg.fyReset!==false;
function seriesNext(gst){ const raw=Math.max(1, Math.floor(+(gst?S.cfg.nextGstBill:S.cfg.nextBill))||1);
  if(gst && fyOn()){ const k=S.cfg.mode==="test"?S.cfg.testGstFy:S.cfg.gstFy; if(k && k!==curFY()) return 1; } return raw; }
/** How a bill number is shown: always the plain number (the shop doesn't use a year prefix like 26-27/7). */
function dispNo(n,gst,fy){ return String(n); }
function curBillDisp(){ return dispNo(curBillNo(), S.gst, S.editing&&S.editing.fy ? S.editing.fy : curFY(S.editing&&S.editing.date ? S.editing.date : undefined)); }
const STATES=[["01","Jammu & Kashmir"],["02","Himachal Pradesh"],["03","Punjab"],["04","Chandigarh"],["05","Uttarakhand"],["06","Haryana"],["07","Delhi"],["08","Rajasthan"],["09","Uttar Pradesh"],["10","Bihar"],["11","Sikkim"],["12","Arunachal Pradesh"],["13","Nagaland"],["14","Manipur"],["15","Mizoram"],["16","Tripura"],["17","Meghalaya"],["18","Assam"],["19","West Bengal"],["20","Jharkhand"],["21","Odisha"],["22","Chhattisgarh"],["23","Madhya Pradesh"],["24","Gujarat"],["26","Dadra & Nagar Haveli and Daman & Diu"],["27","Maharashtra"],["29","Karnataka"],["30","Goa"],["31","Lakshadweep"],["32","Kerala"],["33","Tamil Nadu"],["34","Puducherry"],["35","Andaman & Nicobar Islands"],["36","Telangana"],["37","Andhra Pradesh"],["38","Ladakh"],["97","Other Territory"]];
const stateName=c=>(STATES.find(x=>x[0]===c)||[])[1]||"";
function shopStateCode(){ const g=String(S.cfg.shopGstin||""); return S.cfg.shopState || (/^\d\d/.test(g)?g.slice(0,2):""); }
/** Place of supply: the customer's GSTIN state, else the state picked for an IGST bill, else the shop's own state. */
function posCode(){ const g=String(S.custGstin||"").trim(); if(/^\d\d/.test(g) && gstinOk(g)) return g.slice(0,2); if(S.igst && S.posSel) return S.posSel; return shopStateCode(); }
function posLabel(){ const c=posCode(); return c ? `${stateName(c)} (${c})` : ""; }
function seriesNextRaw(gst){ return Math.max(1, Math.floor(+(gst?S.cfg.nextGstBill:S.cfg.nextBill))||1); }
function autoBillNo(){ return seriesNext(S.gst); }
function gstBillText(){
  const d=billDateStr();
  const g=gstCalc(); let s=S.cfg.mode==="test"?`${t("testBillLine")}\n`:"";
  if(S.cfg.shopName) s+=`*${S.cfg.shopName}*\n`;
  if(S.cfg.shopAddress) s+=`${S.cfg.shopAddress}\n`;
  if(S.cfg.shopGstin) s+=`${t("gstinL")}: ${S.cfg.shopGstin}\n`;
  s+=`\n*${t("taxInvoice")}*\n${t("invNoLine",curBillDisp())} · ${d}\n`+editedLine();
  if(S.cust.trim()) s+=`${t("custL")}: ${S.cust.trim()}\n`;
  if(S.custGstin.trim()) s+=`${t("gstinL")}: ${S.custGstin.trim().toUpperCase()}\n`;
  if(normMobile(S.mob)) s+=`${t("mobL")}: ${S.mob.trim()}\n`;
  if(posLabel()) s+=`${t("posL")}: ${posLabel()}\n`;
  s+="\n";
  S.bill.forEach((l,i)=>{ const li=lineInfo(l); s+=`${i+1}. ${lineLabel(l)} (${t("hsnShort")} ${li.hsn}, ${t("gstPctL").replace(" %","")} ${fmtN(li.gst)}%)\n    ${qtyText(l.qty,l.unit)} × ${rateText(l)} = ${rs(l.qty*l.rate)}\n`; });
  s+=`\n${t("taxable")}: ${rs2(g.taxable)}\n`;
  g.rows.forEach(r=>{ s+=`${r.label}: ${rs2(r.v)}\n`; });
  if(g.roundOff) s+=`${t("roundOff")}: ${g.roundOff>0?"+":"−"}${rs2(Math.abs(g.roundOff))}\n`;
  s+=`*${t("grandTotal")}: ${rs(g.total)}*\n_${t("inWordsL")}: ${inWords(g.total)}_`+payText(g.total);
  if(S.cfg.billFooter) s+=`\n\n${S.cfg.billFooter}`;
  return s;
}
/** Indian-style amount in words, e.g. 1,25,430.50 → "Rupees One Lakh Twenty Five Thousand Four Hundred Thirty and Fifty Paise Only". */
function inWords(amount){
  const ones=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  const two=n=>n<20?ones[n]:tens[Math.floor(n/10)]+(n%10?" "+ones[n%10]:"");
  const three=n=>{ const h=Math.floor(n/100), r=n%100; return (h?ones[h]+" Hundred"+(r?" ":""):"")+(r?two(r):""); };
  const words=n=>{ if(!n) return "Zero"; const out=[]; const cr=Math.floor(n/1e7); n%=1e7; const l=Math.floor(n/1e5); n%=1e5; const th=Math.floor(n/1000); n%=1000;
    if(cr) out.push(words(cr)+" Crore"); if(l) out.push(two(l)+" Lakh"); if(th) out.push(two(th)+" Thousand"); if(n) out.push(three(n)); return out.join(" "); };
  const neg=amount<0, paiseAll=Math.round(Math.abs(+amount||0)*100), r=Math.floor(paiseAll/100), p=paiseAll%100;
  return `${neg?"Minus ":""}Rupees ${words(r)}${p?` and ${two(p)} Paise`:""} Only`;
}
function curBillNo(){ if(S.editing) return S.editing.n; const o=Math.floor(+S.billNoOvr); return o>=1 ? o : autoBillNo(); }
const fmtDate=d=>new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
const fmtDT=d=>{ const x=new Date(d); return x.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})+", "+x.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"}); };
function billDateStr(){ return S.editing && S.editing.date ? fmtDate(S.editing.date) : fmtDate(Date.now()); }
function editedLine(){ return S.editing && !S.editing.fresh ? `_${t("editedLine",fmtDT(Date.now()))}_\n` : ""; }
const draftSig=()=>JSON.stringify([S.bill,S.cust,S.mob,S.gst,S.igst,S.custGstin,S.pay,S.recv,S.posSel,S.pm||""]);
function hasAlt(it){ return !!(it && it.altUnit && +it.altQty>0); }
function altPrice(it){ return (it.altSell!=null && it.altSell!=="" && !isNaN(+it.altSell)) ? +it.altSell : r2((+it.sell||0)/(+it.altQty||1)); }
function itemHsn(x){ return (x && x.hsn) || S.cfg.defaultHsn || "3923"; }
function itemGst(x){ return (x && x.gst!=null && x.gst!=="" && !isNaN(+x.gst)) ? +x.gst : (+S.cfg.defaultGst||0); }
/** Buy rate for one unit of this bill line (pack lines use buy ÷ packs). Saved on the line when it's added. */
function itemBuyFor(it,alt){ if(!it) return null; const b=+it.buy||0; return alt && hasAlt(it) ? r2(b/(+it.altQty||1)) : b; }
function lineBuy(l){ if(l.buy!=null && l.buy!=="" && !isNaN(+l.buy)) return +l.buy; return itemBuyFor(S.byId.get(l.id), l.alt); }
/** Profit on the sale before GST. % is on cost, the same way margins are shown on price cards. */
function profitOf(lines){ let sale=0, csale=0, cost=0, known=true; const per=[];
  for(const l of lines||[]){ const q=+l.qty||0, amt=r2(q*(+l.rate||0)), b=lineBuy(l); sale+=amt;
    if(b==null || !(+b>0)){ known=false; per.push({name:l.name,amt,cost:null,p:null}); continue; }   // no buy price: not counted as profit
    const c=r2(q*b); cost+=c; csale+=amt; per.push({name:l.name,amt,cost:c,p:r2(amt-c)}); }
  sale=r2(sale); csale=r2(csale); cost=r2(cost); const p=r2(csale-cost);
  return { sale, cost, profit:p, pct: cost>0 ? Math.round(p/cost*1000)/10 : null, known, per }; }
function lineInfo(l){ const it=S.byId.get(l.id); return { hsn: l.hsn || itemHsn(it), gst: (l.gst!=null? +l.gst : itemGst(it)) }; }
const r2=n=>Math.round((+n||0)*100)/100;
const rs2=n=>"₹"+Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
/** GST is added on top of the rate. Groups tax by rate; total rounded to the nearest rupee. */
function gstCalc(){ return gstCalcFor(S.bill, S.igst, l=>lineInfo(l).gst); }
function gstCalcFor(lines, igst, rateOf){
  rateOf=rateOf||(l=>+l.gst||0);
  const groups={}; let taxable=0;
  lines.forEach(l=>{ const amt=r2((+l.qty||0)*(+l.rate||0)); const g=rateOf(l); taxable+=amt; groups[g]=(groups[g]||0)+amt; });
  taxable=r2(taxable);
  const rows=[]; let tax=0;
  Object.keys(groups).map(Number).sort((a,b)=>a-b).forEach(rate=>{ if(!rate) return;
    if(igst){ const v=r2(groups[rate]*rate/100); tax+=v; rows.push({label:t("igst",fmtN(rate)),v,rate,kind:"I"}); }
    else { const half=rate/2, v=r2(groups[rate]*half/100); tax+=2*v; rows.push({label:t("cgst",fmtN(half)),v,rate,kind:"C"},{label:t("sgst",fmtN(half)),v,rate,kind:"S"}); } });
  tax=r2(tax); const exact=r2(taxable+tax), total=Math.round(exact), roundOff=r2(total-exact);
  return { taxable, tax, rows, roundOff, total };
}
function billTotal(){ return S.gst ? gstCalc().total : billSum(); }
function gstinOk(v){ const x=String(v||"").trim().toUpperCase(); return !x || /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$/.test(x); }
/** Indian mobile → "91XXXXXXXXXX" for WhatsApp, "" if empty, null if invalid. */
/** Indian mobile → "91XXXXXXXXXX" for WhatsApp links; "" when empty, null when it isn't a mobile number.
 *  Accepts 98765 43210, 098765…, 91 98765…, +91-98765…, 0091 98765…, Hindi digits. Every place that builds a wa.me/tel link uses this. */
function normMobile(v){ let d=devDigits(String(v||"")).replace(/\D/g,""); if(!d) return "";
  if(d.startsWith("0091")) d=d.slice(4); else if(d.length===13&&d.startsWith("910")) d=d.slice(3); else if(d.length===12&&d.startsWith("91")) d=d.slice(2);
  if(d.length===11&&d[0]==="0") d=d.slice(1);
  return d.length===10&&/^[6-9]/.test(d) ? "91"+d : null; }
const mob10=v=>{ const m=normMobile(v); return m?m.slice(2):""; };   /* the plain 10 digits, for saving */
const telHref=v=>{ const m=normMobile(v); return m?"tel:+"+m:"tel:"+String(v||"").replace(/[^\d+]/g,""); };
function waLink(){ const m=normMobile(S.mob); return (m?`https://wa.me/${m}`:"https://wa.me/")+"?text="+encodeURIComponent(billText()); }
function billSum(){ return Math.round(S.bill.reduce((a,l)=>a+(+l.qty||0)*(+l.rate||0),0)*100)/100; }
function saveBill(){ ls.set("rb_bill",S.bill); renderBadge(); }
function renderBill(){
  const wrap=$("#bill-lines");
  if(!S.bill.length){
    wrap.innerHTML=`<div class="empty"><h2>${esc(t("billEmptyT"))}</h2><p>${esc(t(DESK()?"billEmptyDesk":"billEmptyD"))}</p>${DESK()?"":`<button type="button" class="btn primary empty-find" id="empty-find"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>${esc(t("billEmptyBtn"))}</button>`}</div>`;
    { const f=$("#empty-find"); if(f) f.onclick=()=>bsOpen(); }
    $("#bill-total").hidden=true;
  } else {
    wrap.innerHTML=S.bill.map((l,i)=>`<div class="bill-line" data-i="${i}">
      <div class="name">${esc(lineName(l))}${(()=>{ const hi=lineHi(l)&&lineHi(l)!==l.name?`<span lang="hi">${esc(lineHi(l))}</span>`:"", chip=hasAlt(S.byId.get(l.id))?`<button type="button" class="unitchip" data-unitsw="${i}" aria-label="${esc(t("switchUnit"))}">${esc(unitL(l.unit))} ⇄</button>`:""; return hi||chip?`<div class="sub bl-sub" style="font-size:13px;margin-top:0">${hi}${chip}</div>`:""; })()}${S.gst?`<div class="taxline num"><label class="hsned">${esc(t("hsnShort"))}<input id="bh-${i}" data-hsn="${i}" inputmode="numeric" maxlength="8" value="${esc(lineInfo(l).hsn)}" aria-label="${esc(t("hsnL"))}"></label> · GST ${fmtN(lineInfo(l).gst)}%</div>`:""}</div><div class="amt num" data-amt="${i}">${rs(l.qty*l.rate)}</div>
      <div class="ctrl">
        <div class="step"><button data-dec="${i}" aria-label="-">−</button><input id="bq-${i}" class="num${fracSub(l.unit)?" fq":""}" inputmode="decimal" value="${fracSub(l.unit)?qtyShort(l.qty,l.unit):String(l.qty)}" data-qty="${i}"${fracSub(l.unit)?` data-fq="${i}"${DESK()?"":" readonly"}`:""} aria-label="${esc(t("qty"))}"><button data-inc="${i}" aria-label="+">+</button></div>
        <div class="uwrap">${hasAlt(S.byId.get(l.id))||isPart(l.qty,l.unit)?"":`<span class="note">${esc(unitL(l.unit))}</span>`}
        <label class="rate">× ₹<input id="br-${i}" class="num money" data-dp="3" inputmode="decimal" value="${esc(moneyVal(l.rate,3))}" data-rate="${i}" style="${rateW(moneyVal(l.rate,3))}">${isPart(l.qty,l.unit)?`<span class="per">/${esc(unitL(l.unit))}</span>`:""}</label></div>
        <button class="x" data-rm="${i}" aria-label="Remove"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div></div>`).join("");
    $("#bill-total").hidden=false;
  }
  updateBillTotals();
  renderBillSearch();
  try{ dockPos(); }catch{}
}
function updateBillTotals(){ try{ custXSync(); }catch{}
  const bp=$("#bill-profit"), pb=$("#bill-pbox");
  if(S.cfg.showProfit && S.bill.length){ const pf=profitOf(S.bill);
    bp.hidden=false;
    if(S.profitShown){ bp.classList.remove("peek"); bp.classList.toggle("neg",pf.profit<0); bp.textContent=`${pf.profit<0?"−":"+"}${rs(Math.abs(pf.profit))}${pf.pct!=null?` · ${pf.pct}%`:""}`; pb.innerHTML=profitBox({...pf,est:false}); }
    else { bp.classList.add("peek"); bp.classList.remove("neg"); bp.innerHTML=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>${esc(t("tapProfit"))}`; pb.innerHTML=""; } }
  else { bp.hidden=true; pb.innerHTML=""; }
  const gs=$("#gst-sum");
  if(S.gst && S.bill.length){ const g=gstCalc();
    gs.hidden=false;
    gs.innerHTML=`<div><span>${esc(t("taxable"))}</span><b>${rs2(g.taxable)}</b></div>`+g.rows.map(r=>`<div><span>${esc(r.label)}</span><b>${rs2(r.v)}</b></div>`).join("")+(g.roundOff?`<div><span>${esc(t("roundOff"))}</span><b>${g.roundOff>0?"+":"−"}${rs2(Math.abs(g.roundOff))}</b></div>`:"")+`<div class="inwords">${esc(inWords(g.total))}</div>`;
    $("#bill-sum").textContent=rs(g.total); $("#sum-label").textContent=t("totalInclGst");
  } else { gs.hidden=true; $("#bill-sum").textContent=rs(billSum()); $("#sum-label").textContent=t("total"); }
  tsSync();
  { const bs=$("#bill-sum"), n=bs.textContent.length; bs.classList.toggle("long",n>=9 && n<11); bs.classList.toggle("xlong",n>=11); sumFit(); }
  S.bill.forEach((l,i)=>{ const el=document.querySelector(`[data-amt="${i}"]`); if(el) el.textContent=rs(l.qty*l.rate); });
  { const p=payInfo(billTotal()), dc=$("#bill-duechip"); dc.hidden = p.mode==="paid" || !S.bill.length; dc.textContent=t("dueAmt",rs(p.due));
  tsSync();
    $("#pay-due").textContent = S.pay==="part" ? t("dueAmt",rs(p.due)) : ""; }
  renderCash(); renderHeld();
  $("#bill-wa").href=waLink();
  const bn=$("#bill-no"); if(document.activeElement!==bn) bn.value=curBillNo(); bn.readOnly=!!S.editing;
  const eb=$("#editbar"); eb.hidden=!S.editing; if(S.editing){ $("#editbar-t").textContent = S.editing.fresh ? t("savedBar",dispNo(S.editing.n,S.gst,S.editing.fy)) : t("editing",S.editing.n,S.editing.date?fmtDate(S.editing.date):""); $("#edit-cancel").textContent = S.editing.fresh ? t("newBill") : t("cancelEdit"); eb.classList.toggle("fresh",!!S.editing.fresh); }
  $("#bill-done").textContent = S.editing && !(S.editing.fresh && draftSig()===S.editing.sig) ? t("saveShort") : t("billDone");
  $("#wa-label").textContent = S.editing && !(S.editing.fresh && draftSig()===S.editing.sig) ? t("saveShareShort") : t("shareShort");
  $("#bh-no").textContent = curBillDisp();
  const man=!S.editing && Math.floor(+S.billNoOvr)>=1 && Math.floor(+S.billNoOvr)!==autoBillNo(); $("#bh-manual").hidden=!man; if(man) $("#bh-manual").textContent=t("manualNo");
  const au=$("#bill-auto"); const ovr=!S.editing && Math.floor(+S.billNoOvr)>=1 && Math.floor(+S.billNoOvr)!==autoBillNo();
  au.hidden=!ovr; if(ovr) au.innerHTML=`${Math.floor(+S.billNoOvr)<autoBillNo()?`<b class="warn">${IC.warn} ${esc(t("manualWarn"))}</b> · `:""}${esc(t("autoNo",autoBillNo()))} <button type="button" id="bill-useauto">${esc(t("useAuto"))}</button>`;
  { const pw=$("#pos-wrap"); if(pw){ pw.hidden=!(S.gst && S.igst && !(/^\d\d/.test(S.custGstin||"") && gstinOk(S.custGstin))); } }
  $("#gst-chip").setAttribute("aria-pressed",S.gst); const ic=$("#igst-chip"); ic.hidden=!S.gst; ic.setAttribute("aria-pressed",S.igst); ic.textContent=S.igst?t("igstShort"):t("local");
  $("#igst-row").hidden=!S.gst; $("#igst-on").checked=S.igst; $("#cgstin-wrap").hidden=!S.gst;
  $("#gstin-err").textContent = gstinOk(S.custGstin)?"":t("gstinBad");
  const bad=normMobile(S.mob)===null; $("#mob-err").textContent=bad?t("mobBad"):"";
  renderLastBill();
}
function renderLastBill(){
  const el=$("#lastbill"), lb=(S.editing && S.lastBill && S.editing.fresh) ? null : S.lastBill;   // the saved bill is already on screen
  if(!lb){ el.hidden=true; return; }
  el.hidden=false;
  el.innerHTML=`<span>${esc(t("lastBill",lb.n))}${lb.customer?` · ${esc(lb.customer)}`:""} · ${esc(rs(lb.total))}</span><a href="${esc(lb.link)}" target="_blank" rel="noopener">${esc(t("shareAgain"))}</a>${ls.get("rb_lastinv",null)?`<button type="button" class="lb-print" data-act="printlast" aria-label="${esc(t("printBtn"))}" title="${esc(t("printBtn"))}"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg></button>`:""}<button type="button" data-act="bills">${esc(t("allBills"))}</button>`;
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
function draftState(){ return { bill:S.bill, cust:S.cust, mob:S.mob, gst:S.gst, igst:S.igst, custGstin:S.custGstin, billNoOvr:S.billNoOvr, pay:S.pay, recv:S.recv, pm:S.pm||"" }; }
function applyDraft(d){ d=d||{}; S.bill=d.bill||[]; S.cust=d.cust||""; S.mob=d.mob||""; S.gst=!!d.gst; S.igst=!!d.igst; S.custGstin=d.custGstin||""; S.billNoOvr=d.billNoOvr||null; S.pay=d.pay||"paid"; S.recv=d.recv||""; S.pm=d.pm||""; ls.set("rb_pm",S.pm);
  ls.set("rb_pay",S.pay); ls.set("rb_recv",S.recv); $("#pay-recv").value=S.recv; renderPay();
  ls.set("rb_cust",S.cust); ls.set("rb_mob",S.mob); ls.set("rb_gst",S.gst); ls.set("rb_igst",S.igst); ls.set("rb_cgstin",S.custGstin); ls.set("rb_billno",S.billNoOvr);
  $("#cust").value=S.cust; $("#cust-mob").value=S.mob; $("#cust-gstin").value=S.custGstin; saveBill(); }
/* ---------------- Open (held) bills ----------------
 * Several bills can be open at once on this phone. The one on screen is the normal bill state (S.bill, S.cust …);
 * the others sit in localStorage "rb_held" (per test/real mode). Nothing is numbered until Done/Share, so whichever
 * bill finishes first takes the next number in its own series (normal or GST) and there are never gaps. */
const HELD_MAX=8;
function heldGet(){ const h=ls.get(envKey("rb_held"),[]); return Array.isArray(h)?h:[]; }
function heldSet(h){ ls.set(envKey("rb_held"),h); }
function draftAt(){ let a=ls.get(envKey("rb_draftat"),0); if(!a){ a=Date.now(); ls.set(envKey("rb_draftat"),a); } return a; }
function draftEmpty(){ return !S.bill.length && !S.cust.trim() && !S.mob.trim() && !S.editing; }
function snapDraft(){ return { hid:"h"+Date.now().toString(36)+Math.random().toString(36).slice(2,6), at:draftAt(), held:Date.now(),
  d:{...draftState(), posSel:S.posSel||"", cash:S.cash||""}, editing:S.editing||null, stash:S.editing?ls.get("rb_stash",null):null }; }
function blankDraft(){
  S.editing=null; ls.set("rb_editing",null); ls.set("rb_stash",null); S.pendShare=false; ls.set("rb_pshare",0);
  applyDraft({}); S.cash=""; $("#cash-in").value=""; S.posSel=""; ls.set("rb_pos",""); $("#pos-sel").value="";
  S.profitShown=false; S.custAuto=""; S.custQ=""; showCustHint(null); ls.set(envKey("rb_draftat"),Date.now());
}
function loadDraft(e){
  applyDraft(e.d||{}); S.cash=(e.d&&e.d.cash)||""; $("#cash-in").value=S.cash; S.posSel=(e.d&&e.d.posSel)||""; ls.set("rb_pos",S.posSel); $("#pos-sel").value=S.posSel;
  S.editing=e.editing||null; ls.set("rb_editing",S.editing); ls.set("rb_stash",e.stash||null);
  S.profitShown=false; S.custAuto=""; S.custQ=""; showCustHint(null); ls.set(envKey("rb_draftat"),e.at||Date.now());
}
function heldLabel(d,editing){
  if(d.cust && d.cust.trim()) return d.cust.trim();
  if(editing && !editing.fresh) return t("heldNoteEditing",dispNo(editing.n,d.gst,editing.fy));
  if(editing && editing.fresh) return "#"+dispNo(editing.n,d.gst,editing.fy);
  if(d.mob && d.mob.trim()) return d.mob.trim();
  const b=d.bill||[]; if(b.length) return lineName(b[0])+(b.length>1?` +${b.length-1}`:"");
  return t("heldEmpty");
}
function heldTotal(d){   // same total the bill would show (GST, round-off), worked out by briefly swapping the bill fields
  const keep={bill:S.bill,gst:S.gst,igst:S.igst,custGstin:S.custGstin,posSel:S.posSel};
  try{ S.bill=d.bill||[]; S.gst=!!d.gst; S.igst=!!d.igst; S.custGstin=d.custGstin||""; S.posSel=d.posSel||""; return billTotal(); }
  catch{ return (d.bill||[]).reduce((a,l)=>a+(+l.qty||0)*(+l.rate||0),0); }
  finally{ Object.assign(S,keep); } }
/** Put the bill on screen aside and start an empty one. */
function newHeldBill(){
  if(draftEmpty()) return;
  const h=heldGet(); if(h.length+1>=HELD_MAX){ toast(t("heldMax",h.length+1)); return; }
  const snap=snapDraft(); h.push(snap); heldSet(h);
  blankDraft(); renderBill(); renderList(); renderHeld();
  try{ navigator.vibrate && navigator.vibrate(10); }catch{}
  toast(t("heldToast",heldLabel(snap.d,snap.editing)));
  if(S.tab==="bill" && !DESK()) window.scrollTo({top:0,behavior:"smooth"});
}
/** Bring an open bill back on screen; the current one (if it has anything) goes aside in its place. */
function resumeHeld(hid){
  const h=heldGet(); const i=h.findIndex(x=>x.hid===hid); if(i<0) return;
  const e=h.splice(i,1)[0];
  let put=null; if(!draftEmpty()){ put=snapDraft(); h.push(put); }
  if(put && e.editing && !e.editing.fresh && !h.some(x=>x.hid===e.editing.from)) e.editing={...e.editing, from:put.hid};   // ending this edit returns to the bill just left
  heldSet(h); loadDraft(e); renderBill(); renderList(); renderHeld();
  if(S.tab!=="bill" && !DESK()) setTab("bill");
}
function removeHeld(hid){
  const h=heldGet(), e=h.find(x=>x.hid===hid); if(!e) return;
  const n=(e.d.bill||[]).length;
  openSheet(t("heldDelQ"), `<p style="margin:0 0 6px"><b>${esc(heldLabel(e.d,e.editing))}</b> · ${esc(t("heldItems",n))} · ${esc(rs(heldTotal(e.d)))}</p><p class="note" style="margin:0">${esc(t("heldDelD"))}</p>`,
    `<button class="btn ghost" id="hd-no">${esc(t("cancel"))}</button><button class="btn danger" id="hd-yes">${esc(t("heldDelYes"))}</button>`);
  $("#hd-no").onclick=closeSheet;
  $("#hd-yes").onclick=()=>{ heldSet(heldGet().filter(x=>x.hid!==hid)); closeSheet(); renderHeld(); toast(t("heldDeleted")); };
}
function renderHeld(){
  const row=$("#heldrow"); if(!row) return;
  const h=heldGet();
  const nb=$("#bill-new"); if(nb) nb.hidden = !!h.length || draftEmpty();
  const at=$("#addto");
  if(!h.length){ row.hidden=true; row.innerHTML=""; if(at) at.hidden=true; return; }
  const today=new Date().toDateString();
  const cur={hid:"", at:draftAt(), d:draftState(), editing:S.editing, cur:true};
  const all=[...h,cur].sort((a,b)=>(a.at||0)-(b.at||0));
  row.hidden=false;
  row.innerHTML=all.map(e=>{ const n=(e.d.bill||[]).length; const old=!e.cur && new Date(e.held||e.at).toDateString()!==today;
    return `<button type="button" class="hchip${e.cur?" on":""}" role="tab" aria-selected="${e.cur?"true":"false"}" ${e.cur?"":`data-held="${esc(e.hid)}"`}>${old?`<span class="old">${esc(t("heldOld"))}</span>`:""}<span class="hn">${esc(heldLabel(e.d,e.editing))}</span><span class="ht">${n?`<b class="num">${esc(rs(e.cur?billTotal():heldTotal(e.d)))}</b> · ${esc(t("heldItems",n))}`:esc(t("heldNoItems"))}</span></button>`; }).join("")
    + (draftEmpty()?"":`<button type="button" class="hchip add" id="held-add" aria-label="${esc(t("newBillChip"))}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>${esc(t("heldNew"))}</button>`);
  const on=row.querySelector(".hchip.on"); if(on && row.scrollWidth>row.clientWidth){ const r=on.offsetLeft-row.clientWidth/2+on.offsetWidth/2; row.scrollLeft=Math.max(0,r); }
  if(at){ at.hidden=DESK(); at.innerHTML=`<span class="at-l">${esc(t("addingTo"))}</span><span class="at-n">${esc(heldLabel(cur.d,cur.editing))}</span><span class="at-m">${esc(t("heldMore",h.length))} ›</span>`; }
}
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
/* Editing a past bill is just another open bill: the bill on screen (if any) goes into the open-bills row as a chip (no hidden
   copy), and a bill already open for editing (on screen or as a chip) is brought back instead of opened twice, so two copies can
   never be saved over each other ("someone else changed it"). */
const sameBill=(e,b)=>!!e && (e.id && b.id ? e.id===b.id : (+e.row||0)===(+b.row||0) && String(e.n)===String(b.n));
/* An open copy is out of date when the sheet's bill was saved again after that copy was opened (edit counts differ). */
const editStale=(e,b)=>e.edits!=null && b.edits!=null && b.edits!=="" && (+e.edits||0)!==(+b.edits||0);
function startEdit(b){
  let from="";
  if(S.editing && !S.editing.fresh && sameBill(S.editing,b)){
    if(!editStale(S.editing,b)){ closeSheet(); setTab("bill"); toast(t("editAlready",b.n)); return; }
    from=S.editing.from||""; S.editing=null; ls.set("rb_editing",null); applyDraft({});   // old copy on screen: replaced by the latest below
  }
  const open=heldGet().find(x=>x.editing && !x.editing.fresh && sameBill(x.editing,b));
  if(open){
    if(!editStale(open.editing,b)){ closeSheet(); resumeHeld(open.hid); setTab("bill"); toast(t("editAlready",b.n)); return; }
    heldSet(heldGet().filter(x=>x.hid!==open.hid)); from=from||open.editing.from||"";   // old copy as a chip: dropped, the latest opens
  }
  if(!draftEmpty()){ const h=heldGet(); if(h.length+1>=HELD_MAX){ toast(t("heldMax",h.length+1)); return; }
    const snap=snapDraft(); h.push(snap); heldSet(h); from=snap.hid; }
  blankDraft();
  S.editing={ id:b.id||"", row:b.row||0, n:b.n, date:b.date||"", edits:(b.edits===undefined||b.edits===null||b.edits==="")?null:+b.edits||0, fy:b.fy||"", from };   // edits null = count not known: don't block the save
  ls.set("rb_editing",S.editing);
  applyDraft({ bill:b.lines.map(l=>({id:l.id,name:l.name,nameHi:l.nameHi,unit:l.unit,rate:+l.rate||0,qty:+l.qty||1,hsn:l.hsn,gst:l.gst,alt:!!l.alt,buy:l.buy})), cust:b.customer, mob:b.mobile, gst:b.gst, igst:b.igst, custGstin:b.custGstin, ...billPayMode(b) });
  renderHeld(); closeSheet(); setTab("bill"); toast(from?t("editStarted",b.n):t("editStartedPlain",b.n));
}
/** Editing finished (saved or cancelled): the bill that was on screen when it started comes back if it's still open; otherwise a
   new empty bill. (Older phones may still hold a hidden copy in rb_stash: that comes back as before.) */
function endEdit(){ const ed=S.editing||{};
  S.cash=""; S.editing=null; ls.set("rb_editing",null);
  const st=ls.get("rb_stash",null); ls.set("rb_stash",null);
  const h=heldGet(), i=ed.from?h.findIndex(x=>x.hid===ed.from):-1;
  if(st){ applyDraft(st); ls.set(envKey("rb_draftat"),Date.now()); }
  else if(i>=0){ const e=h.splice(i,1)[0]; heldSet(h); loadDraft(e); }
  else { blankDraft(); }
  renderBill(); renderList(); renderHeld();
}
async function saveEdit(opts){
  opts=opts||{};
  const ed=S.editing;
  if(!opts.keep && ed.fresh && draftSig()===ed.sig){ const n=dispNo(ed.n,S.gst,ed.fy); endEdit(); toast(t("billDoneN",n)); return; }   // nothing changed since Share
  if(ed.fresh){ const qi=S.billQ.findIndex(q=>q.id===ed.id);
    if(qi>=0){   // still waiting to be sent: just replace it in the queue
      const old=S.billQ[qi]; S.billQ[qi]=draftRec({ id:old.id, n:old.n, env:old.env }); ls.set("rb_billq",S.billQ); blcAdd(S.billQ[qi]); flushBills();
      if(opts.keep){ ed.sig=draftSig(); ls.set("rb_editing",ed); updateBillTotals(); } else { toast(t("billDoneN",dispNo(ed.n,S.gst,ed.fy))); endEdit(); }
      return; } }
  if(navigator.onLine===false){ toast(t("editOffline")); return; }
  const g=S.gst?gstCalc():null;
  const rec={ id:ed.id, row:ed.row, n:ed.n, customer:S.cust.trim(), mobile:mob10(S.mob)||S.mob.trim(), total:billTotal(),
    items:S.bill.map(l=>`${l.name} ${fmtN(l.qty)} ${l.unit} x ${l.rate}`+(S.gst?` [HSN ${lineInfo(l).hsn}, ${lineInfo(l).gst}%]`:"")).join("; "),
    gst:!!S.gst, taxable:g?g.taxable:"", tax:g?g.tax:"", custGstin:S.gst?S.custGstin.trim().toUpperCase():"", igst:!!(S.gst&&S.igst),
    text:billText(), lines:S.bill.map(l=>({id:l.id,name:l.name,nameHi:lineName(l),unit:l.unit,rate:l.rate,qty:l.qty,hsn:lineInfo(l).hsn,gst:lineInfo(l).gst,alt:!!l.alt,buy:lineBuy(l)})) };
  { const pf=profitOf(S.bill); rec.cost=pf.cost; rec.profit=pf.profit; }
  { const p=payInfo(rec.total); rec.pay=p.mode; rec.received=p.mode==="part"?p.recv:0; rec.paidBy=p.pm; }
  if(ed.edits!==null && ed.edits!==undefined) rec.baseEdits=+ed.edits||0; rec.pos=S.gst?posLabel():""; if(ed.fresh) rec.fresh=true;
  const btn=$("#bill-done"); btn.disabled=true;
  try{ const j=await apiPost({action:"updateBill",bill:rec});
    S.lastBill={n:ed.n,customer:rec.customer,total:rec.total,link:billWa(rec.text,rec.mobile)}; ls.set("rb_lastbill",S.lastBill);
    if(opts.keep){ ed.edits=(j.bill&&j.bill.edits)||(ed.edits==null?null:(+ed.edits||0)+1); ed.sig=draftSig(); ls.set("rb_editing",ed); updateBillTotals(); }
    else { toast(ed.fresh?t("billDoneN",dispNo(ed.n,S.gst,ed.fy)):t("billUpdated",ed.n)); endEdit(); } }
  catch(e){ toast(e&&e.code==="bad_pin"?t("wrongPin"):e&&e.code==="offline"?t("editOffline"):e&&e.code==="bill_changed"?t("billChanged"):e&&e.code==="not_allowed"?t("notAllowed"):t("editFail")); }
  finally{ btn.disabled=false; }
}
/** The bill on screen as a record for the sheet. */
function draftRec(extra){
  const g=S.gst?gstCalc():null;
  const rec={ customer:S.cust.trim(), mobile:mob10(S.mob)||S.mob.trim(), total:billTotal(), link:waLink(),
    items:S.bill.map(l=>`${l.name} ${fmtN(l.qty)} ${l.unit} x ${l.rate}`+(S.gst?` [HSN ${lineInfo(l).hsn}, ${lineInfo(l).gst}%]`:"")).join("; "),
    gst:!!S.gst, taxable:g?g.taxable:"", tax:g?g.tax:"", custGstin:S.gst?S.custGstin.trim().toUpperCase():"", igst:!!(S.gst&&S.igst),
    text:billText(), lines:S.bill.map(l=>({id:l.id,name:l.name,nameHi:lineName(l),unit:l.unit,rate:l.rate,qty:l.qty,hsn:lineInfo(l).hsn,gst:lineInfo(l).gst,alt:!!l.alt,buy:lineBuy(l)})),
    noToken:curBillDisp(), noLine:(S.gst?t("invNoLine",curBillDisp()):t("billNoLine",curBillDisp())), pos:S.gst?posLabel():"", ...extra };
  { const pf=profitOf(S.bill); rec.cost=pf.cost; rec.profit=pf.profit; }
  { const p=payInfo(rec.total); rec.pay=p.mode; rec.received=p.mode==="part"?p.recv:0; rec.due=p.due; rec.paidBy=p.pm; }
  return rec;
}
/** keep:true (Share) saves the bill but leaves it on screen as "saved"; later changes update the same bill. */
function finishBill(opts){
  opts=opts||{};
  if(!S.bill.length) return;
  if(S.editing){ saveEdit(opts); return; }
  const n=curBillNo(), auto=autoBillNo();
  const g=S.gst?gstCalc():null;
  const rec={ n, customer:S.cust.trim(), mobile:mob10(S.mob)||S.mob.trim(), total:billTotal(), link:waLink(),
    items:S.bill.map(l=>`${l.name} ${fmtN(l.qty)} ${l.unit} x ${l.rate}`+(S.gst?` [HSN ${lineInfo(l).hsn}, ${lineInfo(l).gst}%]`:"")).join("; "),
    gst:!!S.gst, taxable:g?g.taxable:"", tax:g?g.tax:"", custGstin:S.gst?S.custGstin.trim().toUpperCase():"", igst:!!(S.gst&&S.igst),
    text:billText(), lines:S.bill.map(l=>({id:l.id,name:l.name,nameHi:lineName(l),unit:l.unit,rate:l.rate,qty:l.qty,hsn:lineInfo(l).hsn,gst:lineInfo(l).gst,alt:!!l.alt,buy:lineBuy(l)})),
    id:Date.now().toString(36)+Math.random().toString(36).slice(2,8), env:S.cfg.mode,
    noToken:curBillDisp(), noLine:(S.gst?t("invNoLine",curBillDisp()):t("billNoLine",curBillDisp())), pos:S.gst?posLabel():"" };
  { const pf=profitOf(S.bill); rec.cost=pf.cost; rec.profit=pf.profit; }
  { const p=payInfo(rec.total); rec.pay=p.mode; rec.received=p.mode==="part"?p.recv:0; rec.due=p.due; rec.paidBy=p.pm; }
  S.lastBill={n:rec.n,customer:rec.customer,total:rec.total,link:rec.link}; ls.set("rb_lastbill",S.lastBill);
  const lastInv=invFromCurrent(); ls.set("rb_lastinv",lastInv);
  blcAdd(rec);
  rec.shared=!!opts.keep; tookNo(rec.n, !!S.gst);
  const wasGst=!!S.gst; if(wasGst) S.cfg.nextGstBill=Math.max(auto, n+1); else S.cfg.nextBill=Math.max(auto, n+1); S.billNoOvr=null; ls.set("rb_billno",null); syncRaw(); saveCache();
  if(opts.keep){
    rememberCustomer(rec.mobile,rec.customer,rec.custGstin,rec.total,rec.due);
    if(rec.due>0){ const ds=ls.get(envKey("rb_dues_sum"),{total:0,n:0}); ds.total=r2((+ds.total||0)+rec.due); ls.set(envKey("rb_dues_sum"),ds); duesSub(); }
    S.editing={ id:rec.id, row:0, n:rec.n, date:new Date().toISOString(), edits:0, fy:curFY(), fresh:true }; S.editing.sig=draftSig();
    ls.set("rb_editing",S.editing); ls.set("rb_stash",null);
    S.billQ.push(rec); ls.set("rb_billq",S.billQ); flushBills();
    renderBill(); renderList(); toast(t("billSavedKeep",dispNo(n,wasGst,curFY())));
    return;
  }
  ls.set(envKey("rb_draftat"),Date.now());
  S.bill=[]; S.cust=""; S.mob=""; S.custGstin=""; S.gst=false; S.igst=false; ls.set("rb_gst",false); ls.set("rb_igst",false); ls.set("rb_cust",""); ls.set("rb_mob",""); ls.set("rb_cgstin",""); $("#cust").value=""; $("#cust-mob").value=""; $("#cust-gstin").value="";
  saveBill(); renderBill(); renderList();
  toast(t("billSent",n,seriesNext(wasGst)));
  rememberCustomer(rec.mobile,rec.customer,rec.custGstin,rec.total,rec.due);
  if(rec.due>0){ const ds=ls.get(envKey("rb_dues_sum"),{total:0,n:0}); ds.total=r2((+ds.total||0)+rec.due); ls.set(envKey("rb_dues_sum"),ds); duesSub(); }
  S.pay="paid"; S.recv=""; S.pm=""; ls.set("rb_pay","paid"); ls.set("rb_recv",""); ls.set("rb_pm",""); $("#pay-recv").value=""; renderPay(); S.cash=""; $("#cash-in").value="";
  S.profitShown=false; S.custAuto=""; S.custQ=""; showCustHint(null); updateBillTotals();
  S.billQ.push(rec); ls.set("rb_billq",S.billQ); flushBills();
  if(prGet().auto) setTimeout(()=>printInv(lastInv),250);   // "Print automatically after Done" (this phone / laptop)
}
/* Cash given -> how much to give back. Only on this phone; never saved with the bill. */
function cashDue(){ if(S.pm && S.pm!=="cash") return 0;   // UPI / cheque: no change to give
  const tot=billTotal(); if(S.pay==="paid") return tot; if(S.pay==="part"){ const r=parseFloat(S.recv); return r>0?r:0; } return 0; }
function cashNotes(T){ const out=[]; [50,100,500,2000].forEach(m=>{ const v=Math.ceil(T/m)*m; if(v>T && !out.includes(v)) out.push(v); }); return out.slice(0,3); }
function renderCash(){
  const row=$("#cashrow"); if(!row) return;
  const due=cashDue(), can_=S.bill.length>0 && due>0, open=can_ && (ls.get("rb_cashopen",false) || !!S.cash), show=open;
  const co=$("#cash-open"); if(co){ co.hidden=!can_; co.setAttribute("aria-expanded",String(open)); co.querySelector("span").textContent=t(open?"cashClose":"cashOpen"); }
  row.hidden=!show; tsSync(); if(!show) return;
  const inp=$("#cash-in"); if(document.activeElement!==inp) inp.value=S.cash||"";
  const g=parseFloat(S.cash), chips=$("#cash-chips"), res=$("#cash-res");
  if(!(g>0)){ res.hidden=true; chips.hidden=false; chips.innerHTML=cashNotes(due).map(v=>`<button type="button" data-cash="${v}">${rs(v)}</button>`).join(""); return; }
  chips.hidden=true; res.hidden=false;
  const d=Math.round((g-due)*100)/100;
  const pill = d>0 ? `<span class="pill ret"><small>${esc(t("cashRet"))}</small><b class="num">${rs(d)}</b></span>`
             : d<0 ? `<span class="pill short"><small>${esc(t("cashShort"))}</small><b class="num">${rs(-d)}</b></span>`
             : `<span class="pill exact">${esc(t("cashExact"))} ✓</span>`;
  const key=d+"|"+g; if(res.dataset.k!==key){ res.dataset.k=key; res.innerHTML=pill+`<button type="button" class="x" id="cash-x" aria-label="${esc(t("clearX"))}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`; }
}
function setCash(v){ S.cash=v; renderCash(); }
/** Total card's second line (Due · Profit · Cash given?) shows only when one of them does. */
function tsSync(){ const w=document.querySelector(".total .ts2"); if(w) w.classList.toggle("empty",![...w.children].some(c=>!c.hidden)); }
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
let flushing=false;
async function flushBills(){
  if(flushing || !S.billQ.length || !apiUrl()) return;
  renderQueue();
  if(navigator.onLine===false){ toast(t("billQueued")); return; }
  flushing=true;
  try{
    while(S.billQ.length){
      const rec=S.billQ[0];
      blcDirty(); const r=await fetch(apiUrl(),{method:"POST",redirect:"follow",body:JSON.stringify({action:"takeBill",n:rec.n,by:byName(),env:rec.env||"test",bill:rec,shop:SHOP.code,k:ls.get("rb_view",""),...(S.auth&&S.auth.tok?{tok:S.auth.tok}:{pin:(S.auth&&S.auth.pin)||""}),dev:DEV})});
      const j=await r.json();
      if(j.shop && j.shop!==SHOP.code){ shopMismatch(); throw 0; }   /* never record a bill in another shop's sheet; it stays queued */
      if(!j.ok){ if(j.error==="need_code"){ S.needCode=true; renderQueue(); renderCodeNote(); } if(j.error==="paused") shopPausedNote(); throw 0; }
      S.needCode=false;
      if(j.renumbered){ { const li=ls.get("rb_lastinv",null); if(li && String(li.no)===String(j.renumbered.from) && S.lastBill && S.lastBill.n===rec.n){ li.no=String(j.renumbered.to); ls.set("rb_lastinv",li); } }
        if(S.lastBill && S.lastBill.n===rec.n){ S.lastBill.n=j.renumbered.to; ls.set("rb_lastbill",S.lastBill); }
        tookNo(j.renumbered.to, !!rec.gst);
        if(S.editing && S.editing.id===rec.id){ S.editing.n=j.renumbered.to; ls.set("rb_editing",S.editing); updateBillTotals(); }
        if(rec.shared) showRenumbered(j.renumbered); else toast(t("renumToast",j.renumbered.from,j.renumbered.to)); }
      S.billQ.shift(); ls.set("rb_billq",S.billQ);
      if(j.config){ const tm=(j.config.mode||"test")==="test"; const nb=+(tm?j.config.testNextBill:j.config.nextBill)||1, ng=+(tm?j.config.testNextGstBill:j.config.nextGstBill)||1; if(nb>S.cfg.nextBill) S.cfg.nextBill=nb; if(ng>S.cfg.nextGstBill) S.cfg.nextGstBill=ng; syncRaw(); }
    }
    saveCache(); updateBillTotals(); blcBump(); blcSoon();
  }catch{ /* try again on next sync */ }
  finally{ flushing=false; renderQueue(); }
}
/* After Share opens WhatsApp, ask on return whether it really went, instead of saving the bill blindly. */
let askingSent=false;
function askSent(){
  if(!S.pendShare || askingSent) return;
  if(!S.bill.length || !S.editing){ S.pendShare=false; ls.set("rb_pshare",0); return; }
  askingSent=true;
  openSheet(t("sentQ"), `<p class="note" style="margin:0">${esc(t("sentQD"))}</p>`, `<button class="btn ghost" id="sq-no">${esc(t("sentNo"))}</button><button class="btn primary" id="sq-yes">${esc(t("sentYes"))}</button>`, {onClose:()=>{ askingSent=false; }});
  const done=()=>{ S.pendShare=false; ls.set("rb_pshare",0); };
  $("#sq-yes").onclick=()=>{ done(); closeSheet(); if(S.editing) saveEdit(); else finishBill(); };
  $("#sq-no").onclick=()=>{ done(); closeSheet(); };
}
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
/** Why a Gemini key couldn't be saved: our own message, plus Google's exact words when there are any. */
function aiErrText(e){ const c=String(e&&e.code||""); if(c==="ai_key") return t("aiBadKey"); if(c==="ai_auth") return t("aiNeedAuth"); if(c==="ai_limit") return t("aiLimitNow");
  if(c==="bad_action") return t("aiOldScript"); const p=c.split("|"); if(p[0]==="ai_http") return t("aiGoogleSaid",p[1]&&p[1]!=="0"?p[1]:"",p.slice(2).join("|").replace(/[.\s]+$/,"")); return c&&c!=="offline"?t("aiFail")+" ("+c+")":t("aiFail"); }
/** Settings → Bill reading (Google Gemini key; owner only). */
function renderAiCfg(){ const box=$("#cf-ai"); if(!box) return; const on=!!S.cfg.aiOn, w=can("owner");
  box.innerHTML=`<h3 style="margin:0">${esc(t("aiT"))} <span class="pill ${on?"paid":"open"}">${esc(t(on?"aiOnL":"aiOffL"))}</span></h3><p class="note" style="margin:0">${esc(t("aiD"))}</p>
    ${w?`<ol class="ai-steps"><li>${t("aiStep1")}</li><li>${esc(t("aiStep2"))}</li><li>${esc(t("aiStep3"))}</li></ol>
    <div class="catnew"><input id="cf-aikey" type="password" autocomplete="off" placeholder="${esc(t(on?"aiKeyPhOn":"aiKeyPh"))}"><button type="button" class="btn primary" id="cf-aisave">${esc(t("aiSave"))}</button></div>
    ${on?`<button type="button" class="btn ghost" id="cf-aioff" style="justify-self:start">${esc(t("aiRemove"))}</button>`:""}<p class="err" id="cf-aierr" style="margin:0"></p>`:""}`;
  if(!w) return;
  const go=async key=>{ const b=key?$("#cf-aisave"):$("#cf-aioff"); btnBusy(b,true); $("#cf-aierr").textContent="";
    try{ const r=await apiPost0({action:"aiSetKey",key}); S.cfg.aiOn=!!r.aiOn; saveCache(); toast(t(r.warn==="ai_limit"?"aiSavedLimit":r.aiOn?"aiSaved":"aiRemoved")); renderAiCfg(); }
    catch(e){ btnBusy(b,false); $("#cf-aierr").textContent=aiErrText(e); } };
  $("#cf-aisave").onclick=()=>{ const k=$("#cf-aikey").value.trim(); if(k) go(k); };
  if($("#cf-aioff")) $("#cf-aioff").onclick=()=>go("");
}

/* ---------------- Owner settings: people & PINs, shop code ---------------- */
let pplCache=null;
async function loadOwnerCards(){
  if(!can("owner")) return;
  try{ const [u,a]=await Promise.all([apiPost({action:"listUsers"}),apiPost({action:"getAccess"})]); pplCache=u.users||[]; renderPeople(); renderAccess(a.access); }
  catch(e){ const b=$("#ppl-body"); if(b) b.innerHTML=`<p class="err">${esc(errMsg(e))}</p>`; }
  apiPost({action:"listSessions"}).then(renderSessions).catch(()=>{ const b=$("#sess-body"); if(b) b.innerHTML=`<p class="note">${esc(t("oldScript"))}</p>`; });
}
/** Settings → Speed: this phone's request timings per action: typical (median) / slowest (95th), and the sheet's own share. */
function speedHTML(){ const a=ls.get("rb_perf",[]); if(!a.length) return `<p class="note" style="margin:0">${esc(t("speedNone"))}</p>`;
  const by={}; a.forEach(x=>{ (by[x[0]]=by[x[0]]||[]).push(x); });
  const q=(v,f)=>{ const y=v.slice().sort((m,n)=>m-n); return y[Math.min(y.length-1,Math.floor(f*y.length))]; }, sec=ms=>ms==null?"—":(ms/1000).toFixed(ms<10000?1:0)+" s";
  return Object.keys(by).sort((m,n)=>by[n].length-by[m].length).slice(0,8).map(k=>{ const tot=by[k].map(x=>x[1]), srv=by[k].map(x=>x[2]).filter(x=>x!=null);
    return `<div class="speed-row"><span>${esc(k)} <small style="color:var(--muted)">×${by[k].length}</small></span><b class="num">${sec(q(tot,.5))} / ${sec(q(tot,.95))}</b><small class="num" style="color:var(--muted)">${srv.length?"sheet "+sec(q(srv,.5)):""}</small></div>`; }).join(""); }
/** Owner: every signed-in phone, newest use first; sign any of them out. */
function renderSessions(j){ const box=$("#sess-body"); if(!box) return; const L=(j&&j.sessions)||[];
  const appr=j&&j.approveNew!==undefined?`<label class="switch"><span><b>${esc(t("apprT"))}</b><br><span class="note">${esc(t("apprD"))}</span></span><input type="checkbox" id="sess-appr" ${j.approveNew?"checked":""}></label>`:"";
  box.innerHTML=appr+(L.length?L.map(x=>`<div class="sess-row"><div><b>${esc(x.name)}</b>${x.me?` <span class="pill">${esc(t("sessThis"))}</span>`:""}${x.shopPin?` <span class="pill">${esc(t("sessShop"))}</span>`:""}${x.pending?` <span class="pill wait">${esc(t("apprWait"))}</span>`:""}<small>${esc(x.label||"—")} · ${esc(t("sessUsed",x.seen?fmtDT(new Date(x.seen)):"—"))}</small></div>${x.me?"":`<div class="row-btns" style="gap:6px">${x.pending?`<button type="button" class="btn primary sm" data-sessok="${esc(x.id)}">${esc(t("apprOk"))}</button>`:""}<button type="button" class="btn ghost sm" data-sess="${esc(x.id)}">${esc(t("sessOut"))}</button></div>`}</div>`).join("")
    :`<p class="note" style="margin:0">${esc(t("sessNone"))}</p>`);
  const ap=$("#sess-appr"); if(ap) ap.onchange=async()=>{ const v=ap.checked; ap.disabled=true; try{ await write({action:"setConfig",config:{approveNew:v}}); }catch{ ap.checked=!v; } finally{ ap.disabled=false; } };
  box.querySelectorAll("[data-sessok]").forEach(b=>b.onclick=async()=>{ btnBusy(b,true); try{ renderSessions(await apiPost({action:"approveSession",id:b.dataset.sessok})); }catch(e){ btnBusy(b,false); toast(errMsg(e)); } });
  box.querySelectorAll("[data-sess]").forEach(b=>b.onclick=async()=>{ btnBusy(b,true); try{ renderSessions(await apiPost({action:"endSession",id:b.dataset.sess})); }catch(e){ btnBusy(b,false); toast(errMsg(e)); } }); }
function renderPeople(){
  const box=$("#ppl-body"); if(!box) return; const list=pplCache||[];
  box.innerHTML=(list.length?list.map(u=>`<div class="ppl-row${u.active?"":" off"}"><span class="av">${esc((u.name||"?").charAt(0).toUpperCase())}</span><div><b>${esc(u.name)}</b><span class="pill role-${u.role}">${esc(t("role"+u.role[0].toUpperCase()+u.role.slice(1)))}</span></div><button type="button" class="btn ghost sm" data-ppl="${esc(u.id)}">${esc(t("pplEdit"))}</button></div>`).join(""):`<p class="note" style="margin:0">${esc(t("pplNone"))}</p>`)
    +`<button type="button" class="btn ghost" id="ppl-add">+ ${esc(t("pplAdd"))}</button>`;
  $("#ppl-add").onclick=()=>openPerson(null);
  box.querySelectorAll("[data-ppl]").forEach(b=>b.onclick=()=>openPerson(list.find(u=>u.id===b.dataset.ppl)));
}
function openPerson(u){
  let role=(u&&u.role)||"staff";
  const roles=["owner","manager","staff"];
  openSheet(u?u.name:t("pplAdd"), `<div class="form">
    <div class="field"><label for="pp-name">${esc(t("pplName"))}</label><input id="pp-name" value="${esc(u?u.name:"")}" maxlength="40"></div>
    <div class="field"><label for="pp-pin">${esc(u?t("pplNewPin"):t("pplPin"))}</label><input id="pp-pin" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password"></div>
    <div class="field"><label>${esc(t("pplRole"))}</label><div class="role-list" id="pp-roles">${roles.map(r=>`<button type="button" data-role="${r}" aria-pressed="${r===role}"><b>${esc(t("role"+r[0].toUpperCase()+r.slice(1)))}</b><span>${esc(t("role"+r[0].toUpperCase()+r.slice(1)+"D"))}</span></button>`).join("")}</div></div>
    <label class="switch"><span><b>${esc(t("pplTest"))}</b><br><span class="note">${esc(t("pplTestD"))}</span></span><input type="checkbox" id="pp-test" ${!u||u.testOk!==false?"checked":""}></label>
    ${u?`<label class="switch"><span><b>${esc(t("pplActive"))}</b></span><input type="checkbox" id="pp-active" ${u.active?"checked":""}></label>`:""}
    <div class="err" id="pp-err"></div>
    ${u?`<div><button type="button" class="btn danger" id="pp-remove">${esc(t("pplRemove"))}</button></div>`:""}</div>`,
    `<button class="btn ghost" id="pp-cancel">${esc(t("cancel"))}</button><button class="btn primary" id="pp-save">${esc(t("save"))}</button>`);
  $("#pp-roles").onclick=e=>{ const b=e.target.closest("[data-role]"); if(!b) return; role=b.dataset.role; $("#pp-roles").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); };
  $("#pp-cancel").onclick=sheetBack;
  $("#pp-save").onclick=async()=>{ const name=$("#pp-name").value.trim(), pin=$("#pp-pin").value.trim(), err=$("#pp-err");
    if(!name){ err.textContent=t("needYourName"); return; } if((!u||pin) && !/^\d{4,8}$/.test(pin)){ err.textContent=t("pplPin"); return; }
    const b=$("#pp-save"); btnBusy(b,true);
    try{ const j=await apiPost({action:"saveUser",user:{id:u?u.id:undefined,name,pin,role,active:u?$("#pp-active").checked:true,testOk:$("#pp-test").checked}}); pplCache=j.users; toast(t("pplSaved")); openSettings(); }
    catch(e){ btnBusy(b,false); err.textContent = e&&e.code==="pin_taken"?t("pplTaken"):errMsg(e); } };
  if($("#pp-remove")) $("#pp-remove").onclick=async()=>{ const b=$("#pp-remove"); btnBusy(b,true); try{ const j=await apiPost({action:"removeUser",id:u.id}); pplCache=j.users; openSettings(); }catch(e){ btnBusy(b,false); toast(errMsg(e)); } };
}
function renderAccess(a){
  const box=$("#acc-body"); if(!box||!a) return;
  box.innerHTML=`<label class="switch"><span><b>${esc(t("accOn"))}</b></span><input type="checkbox" id="acc-on" ${a.on?"checked":""}></label>
    ${a.on?`<div class="acc-code num">${esc(a.code)}</div><div class="row-btns" style="justify-content:flex-start"><a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(t("accMsg",a.code))}">${esc(t("accShare"))}</a><button type="button" class="btn ghost" id="acc-new">${esc(t("accNew"))}</button></div>`:""}`;
  const set=async(on,regen)=>{ try{ const j=await apiPost({action:"setAccess",on,regen}); if(j.access.code) ls.set("rb_view",j.access.code); renderAccess(j.access); }catch(e){ toast(errMsg(e)); } };
  $("#acc-on").onchange=e=>set(e.target.checked,false);
  if($("#acc-new")) $("#acc-new").onclick=()=>set(true,true);
}
function renderQueue(){
  const el=$("#queuebar"); if(!el) return; const n=S.billQ.length;
  el.hidden=!n; if(!n) return;
  el.classList.toggle("bad",!!S.needCode);
  el.innerHTML=`<span class="dot"></span><span>${esc(S.needCode?t("queueCode"):t("queueN",n))}</span>${S.needCode?"":`<button type="button" id="queue-send">${esc(t("queueSend"))}</button>`}`;
  const b=$("#queue-send"); if(b) b.onclick=()=>{ btnBusy(b,true); flushBills(); };
}
function renderSvNote(){
  const el=$("#sv-note"); if(!el) return; const old=S.online && S.sv!==undefined && S.sv<NEED_SV && can("manager");
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
let meChecked=false;
/** Once per app start: refresh this phone's role (the owner may have changed it) and pick up the shop code if needed. */
async function refreshMe(j){
  if(meChecked || !S.canWrite) return; meChecked=true;
  try{ const old=S.auth.pin && !S.auth.tok, r=await apiPost({action:"verify",by:(S.auth&&S.auth.by)||"",...(old?{wantTok:true,dl:devLabel()}:{})}); const me=r.me||{};
    if(old && r.tok){ const pin=S.auth.pin, chk=await pinCheckSet(pin); S.auth={...S.auth,...chk,tok:r.tok,pinLen:pin.length,personal:!!me.personal}; delete S.auth.pin; ls.set("rb_auth",S.auth); }
    applyMe(r,j);
  }catch(e){ if(e&&(e.code==="bad_pin"||e.code==="bad_session")) signedOut("siGone"); }
}
/** Use who-am-I from the sheet (verify, or the boot reply): role, name, own settings, shop code. */
function applyMe(r,j){ const me=r.me||{}; if(!S.auth) return;
    const role=me.role||"owner", name=me.personal?me.name:S.auth.by; const changed=role!==S.auth.role || name!==S.auth.by;
    const P0=JSON.stringify(myPrefs())+(S.auth.testOk!==false);
    S.auth={...S.auth,role,by:name}; if(me.prefs) S.auth.prefs=me.prefs; if(me.testOk!==undefined) S.auth.testOk=me.testOk!==false; ls.set("rb_auth",S.auth);
    const prefsChanged=JSON.stringify(myPrefs())+(S.auth.testOk!==false)!==P0;
    const hadCode=ls.get("rb_view",""); if(r.view && r.view!==hadCode){ ls.set("rb_view",r.view); if(j&&j.limited){ S.rev=null; sync(); return; } }
    if(prefsChanged) applyPrefs(); else if(changed) renderAll();
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
  if(i<0){ if(!up) return; S.bill.push({id,name:it.name,nameHi:it.nameHi||toHindi(it.name),unit:it.unit,rate:+it.sell||0,qty:1,hsn:itemHsn(it),gst:itemGst(it),buy:itemBuyFor(it,false)}); }
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

/* ---------------- Bill actions ---------------- */
function decFromBill(id){
  const i=S.bill.findIndex(x=>x.id===id); if(i<0) return;
  const l=S.bill[i]; l.qty=stepQty(l.qty,l.unit,false); if(l.qty<=0) S.bill.splice(i,1);
  saveBill(); if(S.tab==="bill") renderBill(); else renderList();
}
function addToBill(id,qty=1){
  const it=S.byId.get(id); if(!it) return;
  const l=S.bill.find(x=>x.id===id);
  if(l) l.qty=Math.round((+l.qty+qty)*1000)/1000; else S.bill.push({id,name:it.name,nameHi:it.nameHi||toHindi(it.name),unit:it.unit,rate:+it.sell||0,qty,hsn:itemHsn(it),gst:itemGst(it),buy:itemBuyFor(it,false)});
  saveBill();
  const fromSearch = (DESK() || S.tab==="bill") && S.q;
  if(fromSearch){ const qi=$("#q"); qi.value=""; S.q=""; S.qTabs={}; S.limit=40; $("#q-clear").hidden=true; if(!DESK()) qi.blur(); renderBillSearch(); }
  if(DESK()){ renderBill(); renderList(); const i=S.bill.findIndex(x=>x.id===id), el=document.querySelector(`.bill-line[data-i="${i}"]`); if(el){ el.classList.add("flash"); el.scrollIntoView({block:"nearest",behavior:"smooth"}); } return; }
  if(S.tab==="bill"){ if(!l) toast(`${it.name} ${t("added")}`); renderBill(); if(fromSearch){ const i=S.bill.findIndex(x=>x.id===id), el=document.querySelector(`.bill-line[data-i="${i}"]`); if(el){ el.classList.add("flash"); setTimeout(()=>el.scrollIntoView({block:"center",behavior:"smooth"}),120); } } }
  else { const src=window.__addSrc; window.__addSrc=null;
    let r0=src && src.isConnected ? src.getBoundingClientRect() : null;      // measure before the card re-draws
    renderList();
    if(!r0 || (!r0.width && !r0.height)){ const c=document.querySelector(`#list [data-add="${CSS.escape(id)}"]`)||document.querySelector(`#list [data-decid="${CSS.escape(id)}"]`); if(c) r0=c.getBoundingClientRect(); }
    flyToBill(r0); }
}
/* Phones: show "added" by flying a dot into the Bill tab (no message in the middle of the screen). */
function flyToBill(a){
  const tab=$("#tab-bill"), badge=$("#bill-badge"); if(!tab) return;
  try{ navigator.vibrate && navigator.vibrate(12); }catch{}
  const pop=()=>{ badge.classList.remove("pop"); tab.classList.remove("nudge"); void badge.offsetWidth; badge.classList.add("pop"); tab.classList.add("nudge"); };
  const reduce=window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(!a || (!a.width && !a.height) || reduce || !document.body.animate){ pop(); return; }
  let b=tab.querySelector("svg").getBoundingClientRect();
  if(!b.width && !b.height && document.documentElement.classList.contains("sbot") && document.body.classList.contains("qtyp")){ pop(); return; }   // search at the bottom: keep typing, just a buzz + badge pop
  if(!b.width && !b.height){            // tab bar hidden because the search box was focused: close the keyboard, show the bar, then aim
    const ae=document.activeElement; if(ae && ae.blur && ae.matches("input,textarea")) ae.blur();
    document.body.classList.remove("typing"); syncQe(); b=tab.querySelector("svg").getBoundingClientRect();
    if(!b.width && !b.height){ pop(); return; } }
  if(vv){ const maxY=vv.offsetTop+vv.height-28; if(b.top>maxY) b={left:b.left,width:b.width,top:maxY,height:b.height}; }   // keyboard still closing: stay on screen
  const x0=a.left+a.width/2, y0=a.top+a.height/2, x1=b.left+b.width/2, y1=b.top+b.height/2;
  const d=document.createElement("div"); d.className="flydot"; d.style.left=x0+"px"; d.style.top=y0+"px"; document.body.appendChild(d);
  const dx=x1-x0, dy=y1-y0;
  d.animate([{transform:"translate(0,0) scale(1)",opacity:1},{transform:`translate(${dx*.45}px,${dy*.45-70}px) scale(1.1)`,opacity:1,offset:.45},{transform:`translate(${dx}px,${dy}px) scale(.5)`,opacity:.6}],{duration:520,easing:"cubic-bezier(.3,.7,.4,1)"}).onfinish=()=>{ d.remove(); pop(); };
}
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
/* ---------------- Quick quantity strip (kg / litre lines) ----------------
 * Tapping the qty box on a kg or L line opens a small strip under it instead of the keyboard: 250 g · 500 g · 750 g ·
 * 1 · 1.5 · 2 · 5 · Type. It floats over the next line and closes after a pick, so the bill line itself takes no extra
 * space. "Type" opens the keyboard (decimal) for odd amounts. Typing 250 on a kg line offers a one-tap "250 g?" fix. */
const QP_PARTS=[0.25,0.5,0.75], QP_WHOLE=[1,1.5,2,5];
function qpEl(){ let el=$("#qpick"); if(!el){ el=document.createElement("div"); el.id="qpick"; el.className="qpick"; el.setAttribute("role","listbox"); el.hidden=true; document.body.appendChild(el);
    el.addEventListener("pointerdown",e=>e.preventDefault());
    el.addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; const i=+el.dataset.i, l=S.bill[i]; if(!l){ qpClose(); return; }
      if(b.dataset.type!=null){ qpClose(); const inp=$("#bq-"+i); if(inp && !inp.readOnly){ inp.focus(); try{ inp.select(); }catch{} return; } if(inp){ inp.blur(); inp.readOnly=false; inp.value=String(l.qty); inp.focus(); try{ inp.select(); }catch{} } return; }
      l.qty=+b.dataset.q; qpClose(); saveBill(); renderBill(); try{navigator.vibrate&&navigator.vibrate(8);}catch{}
      const ln=document.querySelector(`.bill-line[data-i="${i}"]`); if(ln){ ln.classList.remove("flash"); void ln.offsetWidth; ln.classList.add("flash"); } }); }
  return el; }
function qpPlace(el,anchor){ const r=anchor.getBoundingClientRect(), w=Math.min(window.innerWidth-16, el.offsetWidth||320);
  const h=el.offsetHeight||48, top=(document.querySelector("header.top")||{getBoundingClientRect:()=>({bottom:0})}).getBoundingClientRect().bottom;
  let x=Math.max(8, Math.min(r.left-8, window.innerWidth-w-8)), y=r.top-h-6;   // above the box, over its own line, so the next line stays free to tap
  const vh=(window.visualViewport?window.visualViewport.height:window.innerHeight); if(y<Math.max(8,top+4)) y=Math.min(r.bottom+6, vh-h-8);
  el.style.left=x+"px"; el.style.top=y+"px"; }
function qpOpen(i,anchor){ const l=S.bill[i]; if(!l) return; const sub=fracSub(l.unit); if(!sub) return; const el=qpEl(); el.dataset.i=i;
  const chip=(q,lab)=>`<button type="button" data-q="${q}" aria-selected="${Math.abs(q-l.qty)<1e-9}">${esc(lab)}</button>`;
  el.innerHTML=QP_PARTS.map(q=>chip(q,`${q*1000}${sub}`)).join("")+`<i></i>`+QP_WHOLE.map(q=>chip(q,fmtN(q))).join("")+`<i></i><button type="button" class="qp-t" data-type aria-label="${esc(t("qpType"))}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg></button>`;
  el.classList.remove("hint"); el.hidden=false; qpPlace(el,anchor); anchor.classList.add("qp-on"); }
function qpClose(){ const el=$("#qpick"); if(el && !el.hidden){ el.hidden=true; document.querySelectorAll(".qp-on").forEach(x=>x.classList.remove("qp-on")); } }
/** Typed a whole number of 50+ on a kg/L line (keyboard has no "g"): offer "250 g?" — never changed on its own. */
function qpHint(inp,i){ const l=S.bill[i], sub=l&&fracSub(l.unit), raw=String(inp.value).trim();
  if(!sub || !/^\d+$/.test(raw) || +raw<50 || +raw>=1000){ qpClose(); return; }
  const el=qpEl(); el.dataset.i=i; el.innerHTML=`<button type="button" data-q="${+raw/1000}">${esc(t("qpHint",raw+" "+unitL(sub)))}</button>`; el.classList.add("hint"); el.hidden=false; qpPlace(el,inp); }
document.addEventListener("click",e=>{ const fq=e.target.closest("[data-fq]"); if(fq){ const i=+fq.dataset.fq, el=$("#qpick"), open=el && !el.hidden && +el.dataset.i===i && !el.classList.contains("hint");
    if(fq.readOnly){ if(open) qpClose(); else qpOpen(i,fq); return; }
    if(!open && DESK()){ qpOpen(i,fq); setTimeout(()=>{ try{ fq.select(); }catch{} },0); } return; }   // laptop: strip opens, and typing still works (it closes the strip)
  if(!e.target.closest("#qpick")) qpClose(); },true);
document.addEventListener("keydown",e=>{ if(e.target.dataset?.fq!=null && (e.key==="Escape"||e.key==="Enter")){ const el=$("#qpick"); if(el && !el.hidden){ if(e.key==="Escape") e.stopPropagation(); qpClose(); } if(e.key==="Enter") e.target.blur(); } },true);
/* Leaving a typed qty box: redraw so it shows "250g" again (and goes back to tap-to-pick). */
document.addEventListener("focusout",e=>{ if(e.target.dataset?.qty!=null && e.target.classList.contains("fq")){ setTimeout(()=>{ const el=$("#qpick"); if(el && el.classList.contains("hint") && !el.hidden) return; if(!document.activeElement || document.activeElement.dataset?.qty==null) renderBill(); },150); } });
/* Scrolling moves the strip with its line; it closes once the line leaves the screen. */
function qpFollow(e){ const el=$("#qpick"); if(!el || el.hidden || (e && e.target && e.target.closest && e.target.closest("#qpick"))) return;
  const a=$("#bq-"+el.dataset.i); if(!a){ qpClose(); return; } const r=a.getBoundingClientRect(), vh=window.visualViewport?window.visualViewport.height:innerHeight;
  if(r.bottom<0 || r.top>vh || (!r.width && !r.height)) qpClose(); else qpPlace(el,a); }
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

/* ---------------- Returning customers ---------------- */
// Remembered on this phone from bills made here; unlocked phones also ask the sheet (all phones' bills).
function custKey(m){ const n=normMobile(m); return n ? n.slice(-10) : ""; }
function custCache(){ return ls.get(envKey("rb_customers"),{}); }
function rememberCustomer(mob,name,gstin,total,due){ const k=custKey(mob); if(!k) return; const c=custCache(); const o=c[k]||{count:0,total:0};
  c[k]={ name:name||o.name||"", gstin:gstin||o.gstin||"", count:(o.count||0)+1, total:r2((o.total||0)+(+total||0)), last:new Date().toISOString(), due:r2((+o.due||0)+(+due||0)) };
  const keys=Object.keys(c); if(keys.length>2000){ keys.sort((a,b)=>String(c[a].last).localeCompare(String(c[b].last))).slice(0,keys.length-2000).forEach(x=>delete c[x]); }
  ls.set(envKey("rb_customers"),c); custLV++; }
let custLV=0;
function showCustHint(info){ const h=$("#cust-hint"); h.classList.remove("looking"); if(!info||!info.count){ h.hidden=true; h.innerHTML=""; return; }
  const d=info.last?new Date(info.last).toLocaleDateString("en-IN",{day:"2-digit",month:"short"}):"";
  h.hidden=false; h.innerHTML=`<span><b>${esc(info.name||"")}</b>${info.name?" · ":""}${esc(t("custBack","",info.count,d))}${info.total?` · ${esc(t("custTotal",rs(info.total)))}`:""}${info.due>0?` · <b class="due">${esc(t("pendingHint",rs(info.due)))}</b>`:""}</span>`; }
function applyCustomer(info){
  if(!info) return;
  const nameEl=$("#cust"), gEl=$("#cust-gstin");
  if(info.name && (!S.cust.trim() || S.cust===S.custAuto)){ S.cust=info.name; S.custAuto=info.name; nameEl.value=info.name; ls.set("rb_cust",S.cust); }
  if(info.gstin && !S.custGstin.trim()){ S.custGstin=info.gstin; gEl.value=info.gstin; ls.set("rb_cgstin",S.custGstin); }
  showCustHint(info); updateBillTotals();
}
let custT=null;
function custLookup(){
  clearTimeout(custT);
  const k=custKey(S.mob);
  if(!k){ S.custQ=""; showCustHint(null); if(S.custAuto && S.cust===S.custAuto){ S.cust=""; S.custAuto=""; $("#cust").value=""; ls.set("rb_cust",""); } return; }
  if(k===S.custQ) return; S.custQ=k;
  const local=custCache()[k]; if(local) applyCustomer(local);
  if(!S.canWrite || !apiUrl() || navigator.onLine===false) return;
  const h=$("#cust-hint");
  if(!local){ h.hidden=false; h.classList.add("looking"); h.innerHTML=`${LD("sm")}<span>${esc(t("custLooking"))}</span>`; }
  custT=setTimeout(async()=>{ try{ const j=await apiPost({action:"findCustomer",mobile:k}); if(S.custQ!==k) return;
      h.classList.remove("looking");
      if(j.customer){ const c=custCache(); c[k]={...(c[k]||{}),name:j.customer.name||(c[k]||{}).name||"",gstin:j.customer.gstin||(c[k]||{}).gstin||"",count:j.customer.count,total:j.customer.total,last:j.customer.last,due:+j.customer.due||0}; ls.set(envKey("rb_customers"),c); applyCustomer(c[k]); }
      else if(!local){ h.hidden=false; h.innerHTML=`<span>${esc(t("custNew"))}</span>`; }
    }catch{ if(S.custQ===k && !local){ h.classList.remove("looking"); showCustHint(null); } } },350);
}
$("#cust").addEventListener("input",()=>{ S.custAuto=""; });

/* ---------------- Customer suggestions while typing (name, mobile, GSTIN) ----------------
 * Nothing shows on tap; suggestions appear only once something typed matches (name: 1+ letters, mobile: 3+ digits, GSTIN: 2+).
 * Source: every customer on the sheet (cached on the phone in IndexedDB, refreshed with the same bills version as Past bills,
 * so it downloads only when bills changed on some phone) plus customers remembered on this phone that aren't on the sheet yet. */
let CUSTD=null, custdLoading=null, custdLoadingEnv="", custdAt=0, custIdx=null, custIdxKey="";
async function custdGet(){ if(CUSTD && CUSTD.env===S.cfg.mode) return CUSTD; const v=await idb.get("images","cust:"+S.cfg.mode); if(v && v.env===S.cfg.mode && Array.isArray(v.list)) CUSTD=v; return CUSTD && CUSTD.env===S.cfg.mode ? CUSTD : null; }
function custdRefresh(force){
  if(!S.canWrite || !apiUrl() || navigator.onLine===false) return Promise.resolve(null);
  if(custdLoading && custdLoadingEnv!==S.cfg.mode) return custdLoading.then(()=>custdRefresh(force));   // started before a test/real switch
  if(custdLoading) return custdLoading;
  if(!force && Date.now()-custdAt<15000 && CUSTD && CUSTD.env===S.cfg.mode) return Promise.resolve(CUSTD);
  const env=S.cfg.mode; custdLoadingEnv=env;
  custdLoading=(async()=>{ await custdGet(); const have=CUSTD && CUSTD.env===env ? CUSTD : null;
      const j=await apiPost0({action:"listCustomers",brev:have&&have.brev||""});
      if(j.same && have){ custdAt=Date.now(); return have; }
      if(!Array.isArray(j.customers)) return have;
      const C={env, brev:j.brev||"", list:j.customers};
      if(env===S.cfg.mode){ CUSTD=C; custdAt=Date.now(); custIdx=null; }
      idb.set("images","cust:"+env,C); return C; })().catch(()=>null).finally(()=>{ custdLoading=null; });
  return custdLoading;
}
function custIndex(){
  const local=custCache(), key=(CUSTD&&CUSTD.brev||"")+"|"+S.cfg.mode+"|"+custLV+"|"+Object.keys(local).length+"|"+((CUSTD&&CUSTD.list.length)||0);
  if(custIdx && custIdxKey===key) return custIdx;
  const m=new Map();
  for(const r of (CUSTD && CUSTD.env===S.cfg.mode ? CUSTD.list : [])) m.set(r[0],{mob:r[0],name:r[1],gstin:r[2],count:r[3],total:r[4],last:r[5],due:r[6],addr:r[7]||"",note:r[8]||"",lastNo:r[9]||""});
  for(const k of Object.keys(local)){ const o=local[k], e=m.get(k); if(!e) m.set(k,{mob:k,name:o.name||"",gstin:o.gstin||"",count:o.count||0,total:o.total||0,last:o.last||"",due:+o.due||0});
    else { if(!e.name && o.name) e.name=o.name; if(!e.gstin && o.gstin) e.gstin=o.gstin; } }
  custIdx=[...m.values()].map(c=>({...c, ln:String(c.name||"").toLowerCase(), lg:String(c.gstin||"").toUpperCase()})); custIdxKey=key; return custIdx;
}
function custMatches(field,raw){
  const L=custIndex(); let q, out=[];
  if(field==="mob"){ q=String(raw||"").replace(/\D/g,""); if(q.length>10) q=q.slice(-10); if(q.length<3) return [];
    for(const c of L){ const i=c.mob.indexOf(q); if(i>=0) out.push({c,s:i===0?3:1}); } }
  else if(field==="gstin"){ q=String(raw||"").toUpperCase().replace(/\s/g,""); if(q.length<2) return [];
    for(const c of L){ if(!c.lg) continue; const i=c.lg.indexOf(q); if(i>=0) out.push({c,s:i===0?3:1}); } }
  else { q=String(raw||"").trim().toLowerCase(); if(!q) return [];
    for(const c of L){ if(!c.ln) continue; const s2=c.ln.startsWith(q)?3:(" "+c.ln).includes(" "+q)?2:c.ln.includes(q)?1:0; if(s2) out.push({c,s:s2}); } }
  out.sort((a,b)=>b.s-a.s || (b.c.count||0)-(a.c.count||0) || String(b.c.last).localeCompare(String(a.c.last)));
  return out.slice(0,5).map(x=>x.c);
}
const SUG={field:"", list:[], on:-1};
function hiMark(text,q,digits){ const s=String(text||""); if(!q) return esc(s); let i, len=q.length;
  if(digits){ i=s.indexOf(q); } else { i=s.toLowerCase().indexOf(q.toLowerCase()); }
  return i<0 ? esc(s) : esc(s.slice(0,i))+"<mark>"+esc(s.slice(i,i+len))+"</mark>"+esc(s.slice(i+len)); }
function sugBox(field){ return field==="gstin" ? $("#sug-gstin") : $("#sug-cust"); }
function sugClose(){ ["#sug-cust","#sug-gstin"].forEach(k=>{ const b=$(k); if(b){ b.hidden=true; b.innerHTML=""; } }); ["#cust","#cust-mob","#cust-gstin"].forEach(k=>$(k).setAttribute("aria-expanded","false")); SUG.field=""; SUG.list=[]; SUG.on=-1; }
function sugShow(field){
  const el=field==="mob"?$("#cust-mob"):field==="gstin"?$("#cust-gstin"):$("#cust");
  if(document.activeElement!==el){ sugClose(); return; }
  const raw=el.value, list=custMatches(field,raw);
  const q=field==="mob"?String(raw).replace(/\D/g,"").slice(-10):field==="gstin"?String(raw).toUpperCase():String(raw).trim();
  const exact=list.length===1 && ((field==="mob"&&list[0].mob===q) || (field==="gstin"&&list[0].lg===q) || (field==="name"&&list[0].ln===q.toLowerCase() && (!S.mob||custKey(S.mob)===list[0].mob)));
  if(!list.length || exact){ sugClose(); return; }
  if(SUG.field && SUG.field!==field) sugClose();
  SUG.field=field; SUG.list=list; if(SUG.on>=list.length) SUG.on=-1;
  const box=sugBox(field);
  box.innerHTML=list.map((c,i)=>`<button type="button" class="sug${i===SUG.on?" on":""}" role="option" aria-selected="${i===SUG.on}" data-sug="${i}">
      <span class="sn">${c.name?hiMark(c.name,field==="name"?q:""):`<span style="color:var(--muted)">${esc(t("sugNoName"))}</span>`}</span>
      <span class="sm">${hiMark(c.mob,field==="mob"?q:"",true)}${c.gstin?` · ${hiMark(c.gstin,field==="gstin"?q:"")}`:""}</span>
      <span class="sr"><span>${esc(t("sugBills",c.count||0))}</span>${c.due>0?`<span class="due">${esc(t("dueAmt",rs(c.due)))}</span>`:""}</span></button>`).join("");
  box.hidden=false; el.setAttribute("aria-expanded","true");
}
function sugPick(i){
  const c=SUG.list[i]; if(!c) return; const field=SUG.field; sugClose();
  S.cust=c.name||S.cust; S.custAuto=""; $("#cust").value=S.cust; ls.set("rb_cust",S.cust);
  S.mob=c.mob; $("#cust-mob").value=S.mob; ls.set("rb_mob",S.mob); $("#mob-err").textContent=""; $("#cust-mob").classList.remove("need"); $("#cust").classList.remove("need");
  if(c.gstin){ S.custGstin=c.gstin; $("#cust-gstin").value=c.gstin; ls.set("rb_cgstin",S.custGstin); const ge=$("#gstin-err"); if(ge) ge.textContent=""; }
  { const cc=custCache(); cc[c.mob]={...(cc[c.mob]||{}), name:c.name||(cc[c.mob]||{}).name||"", gstin:c.gstin||(cc[c.mob]||{}).gstin||"", count:c.count||0, total:c.total||0, last:c.last||"", due:+c.due||0}; ls.set(envKey("rb_customers"),cc); }   // hint shows at once
  S.custQ=""; custLookup(); updateBillTotals();
  const el=field==="gstin"?$("#cust-gstin"):field==="mob"?$("#cust-mob"):$("#cust"); el.blur();
  try{ navigator.vibrate && navigator.vibrate(8); }catch{}
}
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
$("#bill-wa").addEventListener("click",e=>{ if(!payCheck()){ e.preventDefault(); return; } if(S.gst && !gstinOk(S.custGstin)){ e.preventDefault(); setOpen("#bh-more","#bh-extra","rb_bh_open",true); $("#cust-gstin").focus(); toast(t("gstinBad")); return; } if(normMobile(S.mob)===null){ e.preventDefault(); $("#cust-mob").focus(); toast(t("mobBad")); return; } $("#bill-wa").href=waLink(); finishBill({keep:true}); S.pendShare=true; ls.set("rb_pshare",1); });
$("#bill-no").addEventListener("input",e=>{ const v=Math.floor(toNum(e.target.value)); if(v>=1){ S.billNoOvr = v===autoBillNo()?null:v; ls.set("rb_billno",S.billNoOvr); const keep=document.activeElement; updateBillTotals(); } });
$("#bill-no").addEventListener("blur",e=>{ const v=Math.floor(toNum(e.target.value)); if(!(v>=1)){ toast(t("billNoManualBad")); } e.target.value=curBillNo(); updateBillTotals(); });
$("#bill-no").addEventListener("keydown",e=>{ if(e.key==="Enter") e.target.blur(); });
document.addEventListener("click",e=>{ if(e.target.closest("#bill-useauto")){ S.billNoOvr=null; ls.set("rb_billno",null); updateBillTotals(); } });
$("#edit-cancel").onclick=()=>{ if(S.editing && S.editing.fresh){ if(draftSig()!==S.editing.sig) saveEdit(); else { endEdit(); } return; } endEdit(); toast(t("editCancelled")); };
$("#gst-chip").onclick=()=>{ S.gst=!S.gst; ls.set("rb_gst",S.gst); if(!S.editing){ S.billNoOvr=null; ls.set("rb_billno",null); } renderBill(); };
$("#igst-chip").onclick=()=>{ S.igst=!S.igst; ls.set("rb_igst",S.igst); updateBillTotals(); };
$("#igst-on").onchange=e=>{ S.igst=e.target.checked; ls.set("rb_igst",S.igst); updateBillTotals(); };
function setOpen(btnSel,panelSel,key,open){ $(panelSel).hidden=!open; $(btnSel).setAttribute("aria-expanded",open); ls.set(key,open); }
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
$("#bill-done").onclick=()=>{ if(!payCheck()) return; if(S.gst && !gstinOk(S.custGstin)){ setOpen("#bh-more","#bh-extra","rb_bh_open",true); $("#cust-gstin").focus(); toast(t("gstinBad")); return; } if(normMobile(S.mob)===null){ $("#cust-mob").focus(); toast(t("mobBad")); return; } finishBill(); };
$("#bill-copy").onclick=async()=>{ const txt=billText(); try{ await navigator.clipboard.writeText(txt); toast(t("copied")); }catch{ openSheet(t("billTitle"),`<textarea id="bill-txt" readonly>${esc(txt)}</textarea>`); const ta=$("#bill-txt"); ta.select(); toast(t("copyFail")); } };
$("#bill-clear").onclick=()=>{ $("#bill-clear-confirm").hidden=false; };
$("#bill-clear-no").onclick=()=>{ $("#bill-clear-confirm").hidden=true; };
$("#bill-clear-yes").onclick=()=>{ S.cash=""; S.pm=""; ls.set("rb_pm",""); renderPay(); S.custAuto=""; S.custQ=""; showCustHint(null); S.profitShown=false; S.bill=[]; S.cust=""; S.mob=""; $("#cust").value=""; $("#cust-mob").value=""; ls.set("rb_cust",""); ls.set("rb_mob",""); saveBill(); $("#bill-clear-confirm").hidden=true; renderBill(); };

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

function ago(ms){ if(!ms) return ""; const s=(Date.now()-ms)/1000; if(s<60) return t("just"); if(s<3600) return t("min",Math.floor(s/60)); if(s<86400) return t("hr",Math.floor(s/3600)); return t("day",Math.floor(s/86400)); }

async function openDetail(id){
  const it=S.byId.get(id); if(!it) return;
  const inB=billQty(id);
  const body=`
    ${it.imgV?`<div class="gal-wrap"><div class="gal" id="d-gal"><img class="hero" id="d-img" src="${esc(thumbOf(it)||"")}" alt="">${Array.from({length:(it.imgs||1)-1},(_,j)=>`<img class="hero" data-gi="${j+1}" alt="">`).join("")}</div>${(it.imgs||1)>1?`<span class="gal-n" id="d-gn">1/${it.imgs}</span>`:""}</div>`:""}
    ${it.imgV?`<div class="d-card"><h2 class="d-title">${esc(itemTitle(it))}</h2>${it.nameHi?`<div class="sub" lang="hi" style="font-size:16px">${esc(it.nameHi)}</div>`:""}</div>`:(it.nameHi?`<div class="sub" lang="hi" style="margin-top:10px;font-size:16px">${esc(it.nameHi)}</div>`:"")}
    <div class="kv num">
      <div class="s"><span>${esc(t("sell"))}</span><b>${rs(it.sell)}</b></div>
      ${hideBuy()?"":`<div><span>${esc(t("buy"))}</span><b>${rs(it.buy)}</b></div>`}
      <div><span>${esc(t("unit"))}</span><b>${esc(unitL(it.unit))}</b></div>
      <div><span>${esc(t("hsnShort"))}</span><b>${esc(itemHsn(it))}</b></div>
      <div><span>GST</span><b>${fmtN(itemGst(it))}%</b></div>
      ${hasAlt(it)?`<div class="s"><span>${esc(unitL(it.altUnit))}</span><b>${rs(altPrice(it))}</b></div>`:""}
    </div>
    ${!hideBuy()&&marginPct(it)?`<p class="note">${esc(t("margin"))}: ${rs((+it.sell)-(+it.buy))} / ${esc(unitL(it.unit))} (${marginPct(it)})</p>`:""}
    <p class="note" id="d-upd">${esc(t("updatedAgo",ago(it.updatedAt),it.updatedBy||""))}</p>
    ${can("manager")&&!hideBuy()?`<div class="d-buys" id="d-buys" hidden></div>`:""}
    <div class="qtyrow"><div class="step"><button id="dq-dec">−</button><input id="dq" class="num" inputmode="decimal" value="1"><button id="dq-inc">+</button></div><span class="note">${esc(unitL(it.unit))}</span>${inB?`<span class="note">· ${esc(t("inBill"))}: ${fmtN(inB)}</span>`:""}</div>`;
  const foot=`${can("manager")?`<button class="btn ghost" id="d-edit">${esc(t("edit"))}</button>`:""}<button class="btn primary" id="d-add">${esc(t("addToBill"))}</button>`;
  sheetKey("item:"+id), openSheet(itemTitle(it), body, foot);
  $("#sheet").classList.toggle("hero-mode", !!it.imgV);
  $("#dq-dec").onclick=()=>{ const v=Math.max(0.25,(toNum($("#dq").value)||1)-1); $("#dq").value=v; };
  $("#dq-inc").onclick=()=>{ $("#dq").value=(toNum($("#dq").value)||0)+1; };
  $("#d-add").onclick=()=>{ const v=toNum($("#dq").value); addToBill(id, v>0?v:1); closeSheet(); };
  if(can("manager")) $("#d-edit").onclick=()=>openEdit(id);
  if($("#d-buys")) itemBuysInto(id,$("#d-buys"));
  if(it.imgV){
    const g=$("#d-gal"); if(g && (it.imgs||1)>1) g.addEventListener("scroll",()=>{ const n=$("#d-gn"); if(n) n.textContent=`${Math.round(g.scrollLeft/g.clientWidth)+1}/${it.imgs}`; },{passive:true});
    const list=await loadAllPhotos(it).catch(()=>[]);
    if($("#sheet-title").textContent!==itemTitle(it) || !$("#d-gal")) return;
    list.forEach((x,j)=>{ const el=j?$(`#d-gal [data-gi="${j}"]`):$("#d-img"); if(el && x.data) el.src=x.data; });
  }
}

/* ---------------- Image processing ---------------- */
function loadImg(file){
  const viaImg=()=>new Promise((res,rej)=>{ const url=URL.createObjectURL(file); const im=new Image(); im.onload=()=>{ res(im); setTimeout(()=>URL.revokeObjectURL(url),1000); }; im.onerror=()=>{ URL.revokeObjectURL(url); rej(); }; im.src=url; });
  if(window.createImageBitmap){
    return createImageBitmap(file,{imageOrientation:"from-image"}).then(bm=>({naturalWidth:bm.width,naturalHeight:bm.height,_src:bm})).catch(viaImg);
  }
  return viaImg();
}
function drawImg(im,max,square){
  const c=document.createElement("canvas"); let w=im.naturalWidth, h=im.naturalHeight, sx=0, sy=0, sw=w, sh=h;
  if(square){ const m=Math.min(w,h); sx=(w-m)/2; sy=(h-m)/2; sw=sh=m; w=h=Math.min(max,m); }
  else { const r=Math.min(1,max/Math.max(w,h)); w=Math.round(w*r); h=Math.round(h*r); }
  c.width=w; c.height=h; const x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,w,h); x.drawImage(im._src||im,sx,sy,sw,sh,0,0,w,h); return c;
}
function toJpeg(c,maxBytes){ let q=0.8, d=c.toDataURL("image/jpeg",q); while(d.length>maxBytes && q>0.35){ q-=0.1; d=c.toDataURL("image/jpeg",q); } return d; }
async function processImage(file){ const im=await loadImg(file); return { thumb: toJpeg(drawImg(im,112,true),9000), full: toJpeg(drawImg(im,640,false),45000) }; }
function pickImage(){ return new Promise(res=>{ const f=$("#file"); f.value=""; f.onchange=()=>res(f.files[0]||null); f.click(); }); }

/* ---------------- Talking to the Google Sheet ---------------- */
function apiUrl(){ return SHOP_MAIN ? (API_URL || ls.get("rb_api","")) : SHOP.api; }
function apiGet(params){ const p=apiGet0(params); return (params.action==="rev"||params.action==="thumbs") ? p : netTrack(p); }
const BILL_CHANGES=new Set(["updateBill","cancelBill","restoreBill","recordPayment","undoPayment","takeBill","restoreBackup"]);
function apiPost(body){ const bc=body && BILL_CHANGES.has(body.action); if(bc) blcDirty(); const p=netTrack(apiPost0(body)); if(bc) p.then(()=>blcSoon(600),()=>{}); return p; }
/** Request timings on this phone (per shop): Settings → Speed. rev/thumbs aren't kept (they're tiny and constant). */
/** This phone's own script errors go to the shop's script (memory only there), so they show on the admin dashboard → Errors.
    Up to 10 different errors per app start; the app's expected failures (offline, wrong PIN…) aren't errors and aren't sent. */
const ERR_SENT=new Set(); let errN=0;
function errReport(m,w,st){ try{ m=String(m||"").slice(0,300); w=String(w||""); st=String(st||"");
  if(!m || /ResizeObserver loop|^Script error\.?$/i.test(m) || /-extension:\/\//.test(w+st)) return;
  const k=m+"|"+w; if(ERR_SENT.has(k) || ++errN>10) return; ERR_SENT.add(k);
  if(navigator.onLine===false || !apiUrl() || !(S.sv>=36)) return;   // older scripts would check a PIN first and count it as wrong
  fetch(apiUrl(),{method:"POST",keepalive:true,redirect:"follow",body:JSON.stringify({action:"clientErr",shop:SHOP.code,dev:DEV,by:(S.auth&&S.auth.by)||"",
    e:{m,w:w.slice(0,160),st:st.slice(0,500),ua:navigator.userAgent.slice(0,90),tab:S.tab||""}})}).catch(()=>{}); }catch{} }
window.addEventListener("error",e=>{ if(e && e.message) errReport(e.message,(e.filename||"").split("/").pop().split("?")[0]+":"+e.lineno+":"+e.colno,e.error&&e.error.stack); });
window.addEventListener("unhandledrejection",e=>{ const r=e&&e.reason; if(!r || (r.code && !r.stack)) return; errReport(r.message||String(r),"promise",r.stack); });
function perfAdd(action,t0,j){ if(!action || action==="rev" || action==="thumbs") return;
  try{ const a=ls.get("rb_perf",[]); a.push([action,Math.round(performance.now()-t0),j&&typeof j.ms==="number"?j.ms:null,Date.now()]); ls.set("rb_perf",a.slice(-100)); }catch{} }
/** A reply from a different shop than this phone uses: never applied. The saved link is checked with the Directory again. */
function shopMismatch(){ if(SHOP_MAIN || !DIR_URL) return; dirLookup(SHOP.code).then(sh=>{ if(sh.api && sh.api!==SHOP.api){ SHOP.api=sh.api; try{ localStorage.setItem("rb_shop",JSON.stringify({...SHOP,at:Date.now()})); }catch{} } }).catch(()=>{}); }
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
    if(c==="pending" && a.tok && S.auth && S.auth.tok===a.tok && !S.auth.pending){ S.auth={...S.auth,pending:true}; ls.set("rb_auth",S.auth); setTimeout(()=>appLock(),0); }
    if(c==="need_signin" && a.pin && !a.tok) setTimeout(()=>signedOut("siNeed"),0);
    if(c==="paused") shopPausedNote();
    throw {code:c||"server"}; }
  return j;
}
function errMsg(e){ const c=e&&e.code; if(c==="bad_pin") return t("wrongPin"); if(c==="pending") return t("pendStill"); if(c==="paused") return t("pausedNote"); if(c==="need_signin") return t("siNeed"); if(c==="bad_code"||c==="no_dir") return t("shopBad"); if(c==="dir_locked") return t("shopWait"); if(c==="not_ready") return t("shopNotReady"); if(c==="locked") return t("lockedOut"); if(c==="offline") return t("offlineWrite"); if(c==="image_too_large") return t("imgFail"); if(c==="not_allowed") return t("notAllowed"); if(c==="bad_action") return t("oldScript"); if(c==="bill_changed") return t("billChanged"); if(c==="bad_email") return t("bkBadEmail"); if(c==="backup_not_found") return t("bkFail"); return t("writeFail"); }
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
function afterLocal(){ sortItems(S.items); S.byId=new Map(S.items.map(i=>[i.id,i])); buildIndex(); saveCache(); renderList(); renderBadge(); if(S.tab==="bill") renderBill(); }
function upsertLocal(rec){ const i=S.items.findIndex(x=>x.id===rec.id); if(i>=0) S.items[i]={...S.items[i],...rec}; else S.items.push(rec); }
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
  try{ const j=await apiGet({action:"image",id:it.id}); if(j.data){ idb.set("images",it.id,{v:it.imgV,d:j.data}); return j.data; } }catch{}
  return c?c.d:null;
}
const MAX_PHOTOS=5;
const photoKey=(id,j)=> j?`${id}#${j+1}`:id;
/** All photos of an item, in order: [{k, data}]. Cached on the phone per photo, keyed by the item's photo version. */
async function loadAllPhotos(it){
  const n=it.imgV?(it.imgs||1):0; if(!n) return [];
  if(n===1){ const d=await loadFull(it); return d?[{k:it.id,data:d}]:[]; }
  const keys=Array.from({length:n},(_,j)=>photoKey(it.id,j));
  const cached=await Promise.all(keys.map(k=>idb.get("images",k)));
  if(cached.every(c=>c&&c.v===it.imgV)) return keys.map((k,j)=>({k,data:cached[j].d}));
  const j=await apiGet({action:"images",id:it.id});
  const list=(j.images||[]).filter(x=>x.data);
  list.forEach(x=>idb.set("images",x.k,{v:it.imgV,d:x.data}));
  return list;
}
function thumbFromData(d){ return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(toJpeg(drawImg(im,112,true),9000)); im.onerror=rej; im.src=d; }); }

function openEdit(id,prefill=""){
  const it = id? S.byId.get(id) : null;
  // photos: [{k (existing key) | isNew, thumb, full, src}]; the first is the cover
  let photos = it&&it.imgV ? Array.from({length:it.imgs||1},(_,j)=>({k:photoKey(it.id,j), thumb:j?null:thumbOf(it), src:j?null:thumbOf(it)})) : [];
  let photosChanged=false, photosFail=false;
  const camIcon=`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.5"/></svg>`;
  const body=`<form class="form" id="ef" novalidate>
    <div class="field"><label for="ef-name">${esc(t("itemName"))}</label><input id="ef-name" value="${esc(it?.name||prefill)}" autocomplete="off" enterkeyhint="next"></div>
    <div class="two">
      <div class="field"><label for="ef-buy">${esc(t("buyRate"))}</label><input id="ef-buy" class="num money" data-dp="3" inputmode="decimal" enterkeyhint="next" value="${it?esc(moneyVal(it.buy,3)):""}"></div>
      <div class="field"><label for="ef-sell">${esc(t("sellRate"))}</label><input id="ef-sell" class="num money" data-dp="3" inputmode="decimal" enterkeyhint="done" value="${it?esc(moneyVal(it.sell,3)):""}"></div>
    </div>
    <div class="field"><label>${esc(t("unit"))}</label>${unitBtnHTML("ef-unit",it?.unit||S.cfg.defaultUnit)}</div>
    <div class="two">
      <div class="field"><label for="ef-hsn">${esc(t("hsnL"))}</label><input id="ef-hsn" class="num" inputmode="numeric" maxlength="10" value="${esc(it?itemHsn(it):(S.cfg.defaultHsn||"3923"))}"></div>
      <div class="field"><label for="ef-gst">${esc(t("gstPctL"))}</label><input id="ef-gst" class="num" inputmode="decimal" value="${esc(it?itemGst(it):S.cfg.defaultGst)}"></div>
    </div>
    <details class="alt" id="ef-alt" ${hasAlt(it)?"open":""}><summary>${esc(t("altSec"))}</summary>
      <div class="form" style="margin-top:8px">
        <div class="field"><label>${esc(t("packUnit"))}</label>${unitBtnHTML("ef-aunit",(it&&it.altUnit)||"packet")}</div>
        <div class="two">
          <div class="field"><label for="ef-aqty" id="ef-aqty-l">${esc(t("perMain",unitL(it?.unit||S.cfg.defaultUnit)))}</label><input id="ef-aqty" class="num" inputmode="decimal" value="${hasAlt(it)?esc(it.altQty):""}" placeholder="5"></div>
          <div class="field"><label for="ef-asell">${esc(t("packPrice"))}</label><input id="ef-asell" class="num money" data-dp="3" inputmode="decimal" value="${it&&it.altSell!=null&&hasAlt(it)?esc(moneyVal(it.altSell,3)):""}" placeholder="${esc(t("packAuto"))}"></div>
        </div>
        <p class="note" id="ef-ahint" style="margin:0"></p>
      </div>
    </details>
    <div class="field"><label for="ef-hi">${esc(t("hiName"))}</label><input id="ef-hi" value="${esc(it?.nameHi||"")}" autocomplete="off" lang="hi"></div>
    <div class="field"><label for="ef-aka">${esc(t("akaField"))}</label><input id="ef-aka" value="${esc(it?.aliases||"")}" autocomplete="off" placeholder="${esc(t("akaPh"))}"><p class="note" style="margin:0">${esc(t("akaD"))}</p></div>
    <div class="field"><label>${esc(t("catField"))} <span class="autotag" id="ef-cauto" hidden>${esc(t("catAuto"))}</span></label><input type="hidden" id="ef-cat" value="${esc(it?.cat||"")}">
      <div class="catpick" id="ef-catpick"></div>
      <div class="catnew" id="ef-catnew" hidden><input id="ef-catnew-in" maxlength="40" autocomplete="off" placeholder="${esc(t("catNewPh"))}"><button type="button" class="btn primary" id="ef-catnew-ok">${esc(t("add"))}</button></div></div>
    <div class="field"><label id="ef-phl">${esc(t("photosL"))}</label>
      <div class="ph-strip" id="ef-ph"></div>
      <p class="note" id="ef-phn" style="margin:0"></p>
    <div class="img-pick">
      <div class="row-btns" style="justify-content:flex-start" id="ef-phb">
        <label class="btn ghost" for="ef-cam"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>${esc(t("takePhoto"))}</span></label>
        <label class="btn ghost" for="ef-gal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/></svg><span>${esc(t("fromGallery"))}</span></label>
      </div>
      <span class="img-busy" id="ef-busy" hidden></span>
      <input type="file" id="ef-cam" class="vh" accept="image/*" capture="environment" tabindex="-1">
      <input type="file" id="ef-gal" class="vh" accept="image/*" multiple tabindex="-1">
    </div>
    </div>
    <div class="err" id="ef-err" role="alert"></div>
    ${it?`<div><button type="button" class="btn danger" id="ef-del">${esc(t("delItem"))}</button></div><div class="confirm" id="ef-delc" hidden><span>${esc(t("delQ"))}</span><div class="row-btns" style="justify-content:flex-start"><button type="button" class="btn danger" id="ef-dely">${esc(t("yesDel"))}</button><button type="button" class="btn ghost" id="ef-deln">${esc(t("cancel"))}</button></div></div>`:""}
  </form>`;
  openSheet(it?t("editItem"):t("newItem"), body, `<button class="btn ghost" id="ef-cancel">${esc(t("cancel"))}</button><button class="btn primary" id="ef-save">${esc(t("save"))}</button>`, {full:true});
  if(!it) setTimeout(()=>$("#ef-name")?.focus(),260);
  const renderPhotos=()=>{
    const box=$("#ef-ph"); if(!box) return;
    box.innerHTML = photos.map((p,i)=>`<div class="ph" data-pi="${i}">${p.src?`<img src="${esc(p.src)}" alt="">`:`<span class="ph-spin ld"></span>`}${i===0?`<span class="ph-cover">${esc(t("photoCover"))}</span>`:""}<button type="button" class="ph-x" data-px="${i}" aria-label="${esc(t("removePhoto"))}">✕</button></div>`).join("")
      + (photos.length<MAX_PHOTOS?`<label class="ph ph-add" for="ef-gal" aria-label="${esc(t("addPhoto"))}">${camIcon}</label>`:"");
    $("#ef-phl").textContent=`${t("photosL")}${photos.length?` (${photos.length}/${MAX_PHOTOS})`:""}`;
    $("#ef-phn").textContent = photosFail ? t("photoLoadFail") : photos.length>=MAX_PHOTOS ? t("photoMax") : photos.length>1 ? t("photoTapCover") : "";
    $("#ef-phb").hidden = photos.length>=MAX_PHOTOS;
  };
  const photosReady = (it&&it.imgV) ? loadAllPhotos(it).then(list=>{ const m={}; list.forEach(x=>m[x.k]=x.data);
      photos.forEach(p=>{ if(!p.isNew && m[p.k]){ p.full=m[p.k]; p.src=m[p.k]; } });
      if(!list.length && (it.imgs||1)>1) photosFail=true; renderPhotos(); }).catch(()=>{ photosFail=true; renderPhotos(); }) : Promise.resolve();
  renderPhotos();
  $("#ef-ph").addEventListener("click",e=>{
    const x=e.target.closest("[data-px]"); if(x){ e.preventDefault(); photos.splice(+x.dataset.px,1); photosChanged=true; renderPhotos(); return; }
    const t0=e.target.closest("[data-pi]"); if(t0 && +t0.dataset.pi>0){ const [p]=photos.splice(+t0.dataset.pi,1); photos.unshift(p); photosChanged=true; renderPhotos(); }
  });
  const altHint=()=>{ const u=$("#ef-unit").dataset.unit, a=$("#ef-aunit").dataset.unit, n=toNum($("#ef-aqty").value), sell=toNum($("#ef-sell").value), ap=toNum($("#ef-asell").value);
    $("#ef-aqty-l").textContent=t("perMain",unitL(u));
    $("#ef-ahint").textContent = n>0 ? t("packHint",unitL(u),fmtN(n),unitL(a),rs(!isNaN(ap)?ap:(isNaN(sell)?0:r2(sell/n)))) : ""; };
  let hiAuto = !it || !it.nameHi || it.nameHi===toHindi(it.name);
  if(!it && prefill && !$("#ef-hi").value) $("#ef-hi").value=toHindi(prefill);
  $("#ef-name").addEventListener("input",e=>{ if(hiAuto) $("#ef-hi").value=toHindi(e.target.value); });
  $("#ef-hi").addEventListener("input",e=>{ hiAuto = !e.target.value.trim(); });
  $("#ef-unit").onclick=e=>onUnitBtn(e.currentTarget,altHint);
  $("#ef-aunit").onclick=e=>onUnitBtn(e.currentTarget,altHint);
  ["ef-aqty","ef-asell","ef-sell"].forEach(k=>$("#"+k).addEventListener("input",altHint)); altHint();
  const onPhoto=async e=>{ const inp=e.target, files=Array.from(inp.files||[]).slice(0,MAX_PHOTOS-photos.length); inp.value=""; if(!files.length) return;
    const busy=$("#ef-busy"); busy.hidden=false; busy.innerHTML=LD("sm")+esc(t("photoWorking"));
    for(const f of files){ try{ const r=await processImage(f); if(photos.length<MAX_PHOTOS){ photos.push({isNew:true,thumb:r.thumb,full:r.full,src:r.thumb}); photosChanged=true; renderPhotos(); } } catch{ toast(t("imgFail")); } }
    busy.hidden=true; };
  $("#ef-cam").addEventListener("change",onPhoto); $("#ef-gal").addEventListener("change",onPhoto);
  /* Group: chips for every group + "New group". A new item (or one without a group) gets the guess automatically until a chip is tapped. */
  let catTouched=!!(it&&it.cat), catAuto=false;
  const drawCats=()=>{ const cur=$("#ef-cat").value, list=allGroups(); if(cur && !list.some(g=>g.toLowerCase()===cur.toLowerCase())) list.unshift(cur);
    $("#ef-catpick").innerHTML=list.map(c=>`<button type="button" data-cpick="${esc(c)}" aria-pressed="${c===cur}">${esc(c)}</button>`).join("")+`<button type="button" class="cat-add" data-cnew aria-label="${esc(t("catNew"))}">+ ${esc(t("catNew"))}</button>`;
    $("#ef-cauto").hidden=!(catAuto && cur); };
  const autoCat=()=>{ if(catTouched) return; const g=guessCat($("#ef-name").value); $("#ef-cat").value=g; catAuto=!!g; drawCats(); };
  $("#ef-catpick").onclick=e=>{ const n=e.target.closest("[data-cnew]"); if(n){ $("#ef-catnew").hidden=false; $("#ef-catnew-in").focus(); return; }
    const b=e.target.closest("[data-cpick]"); if(!b) return; catTouched=true; catAuto=false; $("#ef-cat").value = $("#ef-cat").value===b.dataset.cpick ? "" : b.dataset.cpick; drawCats(); };
  const addNew=()=>{ const v=normCat($("#ef-catnew-in").value); if(!v) return; catTouched=true; catAuto=false; $("#ef-cat").value=v; $("#ef-catnew-in").value=""; $("#ef-catnew").hidden=true; addGroup(v); drawCats(); };
  $("#ef-catnew-ok").onclick=addNew; $("#ef-catnew-in").addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); addNew(); } });
  $("#ef-name").addEventListener("input",autoCat);
  if(!catTouched) autoCat(); else drawCats();
  $("#ef-cancel").onclick=sheetCancel;
  $("#ef").onsubmit=e=>{ e.preventDefault(); $("#ef-save").click(); };
  ["ef-name","ef-buy"].forEach((k,i)=>$("#"+k).addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); $(i?"#ef-sell":"#ef-buy").focus(); } }));
  if(it){
    $("#ef-del").onclick=()=>{ $("#ef-del").hidden=true; const c=$("#ef-delc"); c.hidden=false; setTimeout(()=>c.scrollIntoView({block:"center",behavior:"smooth"}),30); };
    $("#ef-deln").onclick=()=>{ $("#ef-delc").hidden=true; $("#ef-del").hidden=false; };
    $("#ef-dely").onclick=()=>{ closeSheet(); toast(t("saving")); const snapshot=S.items.slice();
      write({action:"delete",ids:[id]},()=>{ S.items=S.items.filter(x=>x.id!==id); S.bill=S.bill.filter(l=>l.id!==id); saveBill(); }).then(()=>toast(t("deleted"))).catch(()=>{ S.items=snapshot; afterLocal(); }); };
  }
  $("#ef-save").onclick=()=>{
    const name=$("#ef-name").value.trim(), nameHi=$("#ef-hi").value.trim(), unit=$("#ef-unit").dataset.unit, buyS=$("#ef-buy").value.trim(), buy=toNum(buyS), sell=toNum($("#ef-sell").value);
    const err=$("#ef-err");
    if(!name){ err.textContent=t("needName"); return; }
    if(isNaN(sell)||sell<0 || (buyS!=="" && (isNaN(buy)||buy<0))){ err.textContent=t("needRate"); return; }
    if(findDup(name,id)){ err.textContent=t("dup"); return; }
    if(navigator.onLine===false){ err.textContent=t("offlineWrite"); return; }
    const key=id||tmpId();
    const hsn=$("#ef-hsn").value.replace(/\s/g,""), gstV=toNum($("#ef-gst").value);
    if(isNaN(gstV)||gstV<0||gstV>100){ err.textContent=t("gstPctL")+": 0–100"; return; }
    const aqS=$("#ef-aqty").value.trim(), aq=toNum(aqS), asS=$("#ef-asell").value.trim(), aSell=toNum(asS);
    if(aqS!=="" && !(aq>0)){ err.textContent=t("packBad"); $("#ef-alt").open=true; return; }
    if(asS!=="" && (isNaN(aSell)||aSell<0)){ err.textContent=t("needRate"); $("#ef-alt").open=true; return; }
    const altUnit = aq>0 ? $("#ef-aunit").dataset.unit : "", altQty = aq>0 ? aq : 0, altSell = (aq>0 && asS!=="") ? aSell : null;
    const hiFinal = nameHi || toHindi(name);
    const aliases=aliasList($("#ef-aka").value).join(", "), cat=normCat($("#ef-cat").value);
    const rec={ base: it?it.updatedAt:undefined, id: id||undefined, tmp: id?undefined:key, name, nameHi:hiFinal, unit, buy:isNaN(buy)?0:buy, sell, hsn, gst:gstV, altUnit, altQty, altSell, aliases, cat };
    const imgChange=photosChanged ? photos.slice() : null;
    closeSheet(); toast(t("saving"));
    write({action:"upsert",items:[rec]},()=>{
      upsertLocal({ id:key, name, nameHi:hiFinal, unit, buy:rec.buy, sell, hsn, gst:gstV, altUnit, altQty, altSell, aliases, cat, imgV: imgChange ? (imgChange.length?Date.now():0) : (it?it.imgV:0), imgs: imgChange ? imgChange.length : (it?it.imgs||0:0), updatedAt:Date.now(), updatedBy:byName(), pending:true });
      if(imgChange && imgChange.length) S.thumbs[key]={v:S.items.find(x=>x.id===key).imgV,d:imgChange[0].thumb||imgChange[0].src||""};
      const bl=S.bill.find(l=>l.id===key); if(bl){ bl.name=name; bl.nameHi=hiFinal; bl.unit=unit; saveBill(); }
    }).then(async j=>{
      if(j.conflicts && j.conflicts.length){ toast(t("conflictItem", j.conflicts[0].by)); S.rev=null; sync(); return; }
      mergeSaved(j.items);
      const realId=(j.items&&j.items[0]&&j.items[0].id)||key;
      if(imgChange){
        await photosReady;
        let th="";
        if(imgChange.length){ const c=imgChange[0]; th=c.thumb || (c.full||c.src ? await thumbFromData(c.full||c.src).catch(()=>"") : ""); if(!th) throw new Error("photo"); }
        const r=await write({action:"setImages",id:realId,thumb:th,photos:imgChange.map(p=>p.isNew?{data:p.full}:{k:p.k})});
        const x=S.byId.get(realId); if(x){ x.imgV=r.imgV; x.imgs=r.imgs||0;
          if(r.imgV){ S.thumbs[realId]={v:r.imgV,d:th}; idb.set("thumbs",realId,S.thumbs[realId]); imgChange.forEach((p,j)=>{ if(p.full) idb.set("images",photoKey(realId,j),{v:r.imgV,d:p.full}); }); }
          else { delete S.thumbs[realId]; idb.del("thumbs",realId); idb.del("images",realId); }
          afterLocal(); } }
      toast(t("saved")); resyncSoon();
    }).catch(()=>{});
  };
}

/* ---------------- Bulk add ---------------- */
function parseLines(txt){
  const rows=[];
  txt.split(/\r?\n/).forEach(line=>{ if(!line.trim()) return; const parts=(line.includes("\t")?line.split("\t"):line.split(/,|;|\|/)).map(s=>s.trim());
    const [name,unit,buy,sell,hi,hsn]=parts; if(!name) return;
    if(rows.length===0 && isNaN(toNum(buy)) && isNaN(toNum(sell)) && /item|name|सामान/i.test(name)) return;
    rows.push({name,unit:unitFromWord(unit)||unit||S.cfg.defaultUnit,buy:buy||"",sell:sell||"",hi:hi||"",hsn:(hsn||"").replace(/\s/g,"")}); });
  return rows;
}
function openBulkAdd(){
  const blank=()=>({name:"",unit:S.cfg.defaultUnit,buy:"",sell:"",hi:"",hsn:""});
  let rows=Array.from({length:5},blank);
  const tagFor=r=>{ const dup=r.name.trim()?findDup(r.name):null; const bad=r.name.trim()&&(isNaN(toNum(r.sell))||(r.buy!==""&&isNaN(toNum(r.buy)))); return bad?`<span class="tag bad">${esc(t("badRow"))}</span>`:dup?`<span class="tag">${esc(t("willUpdate"))}</span>`:""; };
  const rowHTML=(r,i)=>`<tr data-r="${i}"><td class="c-name"><input id="ba-n-${i}" data-f="name" value="${esc(r.name)}" autocomplete="off" enterkeyhint="next">${tagFor(r)}</td>
      <td class="c-unit">${unitBtnHTML("ba-u-"+i,r.unit,'data-ur="'+i+'"')}</td>
      <td class="c-num"><input id="ba-b-${i}" data-f="buy" class="money" data-dp="3" inputmode="decimal" value="${esc(moneyVal(r.buy,3))}"></td>
      <td class="c-num"><input id="ba-s-${i}" data-f="sell" class="money" data-dp="3" inputmode="decimal" value="${esc(moneyVal(r.sell,3))}"></td>
      <td class="c-name"><input id="ba-h-${i}" data-f="hi" value="${esc(r.hi)}" lang="hi"></td>
      <td class="c-unit"><input id="ba-x-${i}" data-f="hsn" inputmode="numeric" value="${esc(r.hsn||"")}" placeholder="${esc(S.cfg.defaultHsn||"3923")}"></td></tr>`;
  const valid=()=>rows.filter(r=>r.name.trim() && !isNaN(toNum(r.sell)) && (r.buy===""||!isNaN(toNum(r.buy))));
  const body=`<p class="note">${esc(t("bulkHelp"))}</p>
    <details id="ba-paste"><summary class="btn ghost" style="display:inline-flex">${esc(t("pasteList"))}</summary>
      <div style="display:grid;gap:8px;margin-top:8px"><textarea id="ba-txt" placeholder="Basmati Rice, kg, 85, 100&#10;Toor Dal, kg, 120, 140, तूर दाल"></textarea><div><button class="btn primary" id="ba-parse" type="button">${esc(t("parse"))}</button></div></div></details>
    <div class="gridwrap" style="margin-top:10px"><table class="g"><thead><tr><th>${esc(t("item"))}</th><th>${esc(t("unit"))}</th><th>${esc(t("buy"))} ₹</th><th>${esc(t("sell"))} ₹</th><th>${esc(t("hiName"))}</th><th>${esc(t("hsnShort"))}</th></tr></thead><tbody id="ba-body"></tbody></table></div>
    <div class="toolbar"><button class="btn ghost" id="ba-row" type="button">${esc(t("addRow"))}</button><span class="note" id="ba-prog"></span></div>`;
  openSheet(t("bulkAdd"), body, `<button class="btn ghost" id="ba-cancel">${esc(t("cancel"))}</button><button class="btn primary" id="ba-save"></button>`, {full:true});
  const tb=$("#ba-body");
  const draw=()=>{ tb.innerHTML=rows.map(rowHTML).join(""); upd(); };
  const upd=()=>{ const n=valid().length; const b=$("#ba-save"); b.textContent=t("saveN",n); b.disabled=!n; };
  tb.addEventListener("input",e=>{ const tr=e.target.closest("tr"); if(!tr||!e.target.dataset.f) return; rows[+tr.dataset.r][e.target.dataset.f]=e.target.value; upd(); });
  tb.addEventListener("change",e=>{ const tr=e.target.closest("tr"); if(!tr) return; const i=+tr.dataset.r; const cell=tr.querySelector(".c-name"); cell.querySelector(".tag")?.remove(); cell.insertAdjacentHTML("beforeend",tagFor(rows[i])); });
  tb.addEventListener("click",e=>{ const b=e.target.closest("[data-ur]"); if(b) onUnitBtn(b,v=>{ rows[+b.dataset.ur].unit=v; }); });
  $("#ba-row").onclick=()=>{ rows.push(blank()); draw(); $(`#ba-n-${rows.length-1}`)?.focus(); };
  $("#ba-parse").onclick=()=>{ const p=parseLines($("#ba-txt").value); if(!p.length) return; rows=[...rows.filter(r=>r.name.trim()),...p]; $("#ba-txt").value=""; $("#ba-paste").open=false; draw(); };
  $("#ba-cancel").onclick=sheetCancel;
  $("#ba-save").onclick=async()=>{
    const v=valid(); if(!v.length) return; if(navigator.onLine===false){ toast(t("offlineWrite")); return; }
    $("#ba-save").disabled=true; $("#ba-prog").textContent=t("saving");
    const seen=new Set();
    const recs=v.filter(r=>{ const k=phonTokens(r.name).join(" "); if(seen.has(k)) return false; seen.add(k); return true; }).map(r=>{
      const dup=findDup(r.name); const buy=r.buy===""?(dup?+dup.buy:0):toNum(r.buy);
      const hsn=String(r.hsn||"").replace(/\s/g,"");
      if(dup) return { id:dup.id, buy, sell:toNum(r.sell), unit:r.unit||dup.unit, ...(r.hi.trim()?{nameHi:r.hi.trim()}:(dup.nameHi?{}:{nameHi:toHindi(dup.name)})), ...(hsn?{hsn}:{}) };
      return withCat({ tmp:tmpId(), name:r.name.trim(), nameHi:r.hi.trim()||toHindi(r.name.trim()), unit:r.unit||S.cfg.defaultUnit, buy, sell:toNum(r.sell), hsn:hsn||S.cfg.defaultHsn||"3923", gst:+S.cfg.defaultGst });
    });
    try{
      for(let i=0;i<recs.length;i+=100){ const part=recs.slice(i,i+100); const j=await write({action:"upsert",items:part}); mergeSaved(j.items); const p=$("#ba-prog"); if(p) p.textContent=t("savingN",Math.min(i+100,recs.length),recs.length); }
      closeSheet(); toast(t("savedN",recs.length)); resyncSoon();
    }catch{ const b=$("#ba-save"); if(b) b.disabled=false; }
  };
  draw();
}

/* ---------------- Bulk edit ---------------- */
function openBulkEdit(){
  const changes=new Map(); const sel=new Set(); let filter="", which="both";
  const val=(it,f)=> changes.get(it.id)?.[f] ?? (f==="hsn"?itemHsn(it):f==="gst"?itemGst(it):it[f]);
  const visible=()=>{ if(!filter.trim()) return [...S.items]; return runSearch(filter).res.filter(r=>!r.fuzzy).map(r=>r.e.it); };
  const body=`<input id="be-f" type="search" placeholder="${esc(t("filter"))}" style="width:100%;border:1.5px solid var(--line);background:var(--bg);border-radius:var(--r-md);padding:10px 12px;font-size:16px">
    <div class="toolbar"><div class="seg" id="be-which"><button type="button" data-w="both" aria-pressed="true">${esc(t("both"))}</button><button type="button" data-w="sell" aria-pressed="false">${esc(t("onlySell"))}</button><button type="button" data-w="buy" aria-pressed="false">${esc(t("onlyBuy"))}</button></div>
      <input id="be-pct" inputmode="decimal" placeholder="${esc(t("pctPh"))}" style="width:110px">
      <button class="btn ghost" id="be-apply" type="button">${esc(t("apply"))}</button><span class="note" id="be-sel"></span></div>
    <div class="gridwrap"><table class="g"><thead><tr><th style="width:36px"><input type="checkbox" id="be-all" aria-label="All"></th><th>${esc(t("item"))}</th><th>${esc(t("unit"))}</th><th>${esc(t("buy"))} ₹</th><th>${esc(t("sell"))} ₹</th><th>${esc(t("hsnShort"))}</th><th>GST %</th></tr></thead><tbody id="be-body"></tbody></table></div>
    <p class="note" id="be-prog"></p>`;
  openSheet(t("bulkEdit"), body, `<button class="btn ghost" id="be-cancel">${esc(t("cancel"))}</button><button class="btn primary" id="be-save"></button>`, {full:true});
  const tb=$("#be-body");
  const cell=(it,f)=>{ const ch=changes.get(it.id)?.[f]!==undefined; return `<input id="be-${f}-${esc(it.id)}" data-id="${esc(it.id)}" data-f="${f}" inputmode="decimal" class="${ch?"changed":""}${f==="buy"||f==="sell"?" money\" data-dp=\"3":""}" value="${esc(f==="buy"||f==="sell"?moneyVal(val(it,f),3):val(it,f))}">`; };
  const draw=()=>{ const v=visible(); tb.innerHTML=v.slice(0,300).map(it=>`<tr><td><input type="checkbox" data-sel="${esc(it.id)}" ${sel.has(it.id)?"checked":""} aria-label="Select"></td><td class="c-name">${esc(it.name)}</td><td class="c-unit">${unitBtnHTML("be-unit-"+it.id,val(it,"unit"),`data-uid="${esc(it.id)}"`).replace('class="unitbtn"',`class="unitbtn${changes.get(it.id)?.unit!==undefined?" changed":""}"`)}</td><td class="c-num">${cell(it,"buy")}</td><td class="c-num">${cell(it,"sell")}</td><td class="c-unit">${cell(it,"hsn")}</td><td class="c-num">${cell(it,"gst")}</td></tr>`).join(""); info(); };
  const info=()=>{ $("#be-sel").textContent = sel.size? t("selected",sel.size) : t("allShown"); const n=changes.size; const b=$("#be-save"); b.textContent=n?t("saveN",n):t("unchanged"); b.disabled=!n; };
  const setChange=(id,f,v)=>{ const it=S.byId.get(id); if(!it) return; const o=changes.get(id)||{}; const cur=f==="hsn"?itemHsn(it):f==="gst"?itemGst(it):it[f]; if(String(v)===String(cur)) delete o[f]; else o[f]=v; if(Object.keys(o).length) changes.set(id,o); else changes.delete(id); };
  tb.addEventListener("input",e=>{ const el=e.target; if(el.dataset.f){ let n; if(el.dataset.f==="hsn"){ n=el.value.replace(/\s/g,""); if(!n) return; } else { n=toNum(el.value); if(isNaN(n)) return; if(el.dataset.f==="gst"&&(n<0||n>100)) return; } setChange(el.dataset.id,el.dataset.f,n); el.classList.toggle("changed", changes.get(el.dataset.id)?.[el.dataset.f]!==undefined); info(); } });
  tb.addEventListener("change",e=>{ const id=e.target.dataset.sel; if(id){ e.target.checked?sel.add(id):sel.delete(id); info(); } });
  tb.addEventListener("click",e=>{ const b=e.target.closest("[data-uid]"); if(b) onUnitBtn(b,v=>{ setChange(b.dataset.uid,"unit",v); b.classList.toggle("changed",changes.get(b.dataset.uid)?.unit!==undefined); info(); }); });
  $("#be-which").addEventListener("click",e=>{ const b=e.target.closest("[data-w]"); if(!b) return; which=b.dataset.w; $("#be-which").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b)); });
  $("#be-all").onchange=e=>{ visible().forEach(it=>e.target.checked?sel.add(it.id):sel.delete(it.id)); draw(); };
  let ft; $("#be-f").addEventListener("input",e=>{ filter=e.target.value; clearTimeout(ft); ft=setTimeout(draw,80); });
  $("#be-apply").onclick=()=>{ const p=toNum(String($("#be-pct").value).replace("%","")); if(isNaN(p)||p===0) return;
    const targets = sel.size ? [...sel].map(id=>S.byId.get(id)).filter(Boolean) : visible();
    targets.forEach(it=>{ (which==="both"?["buy","sell"]:[which]).forEach(f=>{ setChange(it.id,f,roundPrice((+val(it,f)||0)*(1+p/100))); }); });
    draw(); };
  $("#be-cancel").onclick=sheetCancel;
  $("#be-save").onclick=()=>{ if(!changes.size) return; if(navigator.onLine===false){ toast(t("offlineWrite")); return; }
    const recs=[...changes].map(([id,ch])=>({id,...ch})); const n=recs.length; const snapshot=S.items.map(x=>({...x}));
    closeSheet(); toast(t("saving"));
    write({action:"upsert",items:recs},()=>{ recs.forEach(r=>upsertLocal({...r,pending:true,updatedAt:Date.now(),updatedBy:byName()})); })
      .then(j=>{ mergeSaved(j.items); toast(t("savedN",n)); resyncSoon(); }).catch(()=>{ S.items=snapshot; afterLocal(); }); };
  draw();
}

/* ---------------- Settings ---------------- */
/* Settings in groups: each is a card that opens and closes. All closed when Settings opens; the ones opened stay open while
   you go into a screen inside (a person, Groups) and come back, until Settings is closed. */
const CG_OPEN=new Set();
const CG_IC={user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',printer:'<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',store:'<path d="M3 9 4.5 4h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M10 20v-5h4v5"/>',receipt:'<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',tag:'<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',scan:'<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',cloud:'<path d="M17.5 19a4.5 4.5 0 1 0-1-8.9A6 6 0 0 0 5 12a4 4 0 0 0 1 7.9z"/>',gauge:'<path d="m12 14 4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>'};
function cg(key,ic,title,sum,inner){ if(!String(inner).trim()) return "";
  return `<details class="cg" data-cg="${key}" ${CG_OPEN.has(key)?"open":""}><summary><span class="cg-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CG_IC[ic]||""}</svg></span><span class="cg-t"><b>${esc(title)}</b><small class="cg-s">${esc(sum||"")}</small></span><svg class="cg-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary><div class="cg-b">${inner}</div></details>`; }
const cgJ=a=>a.filter(Boolean).join(" · "), cgCap=x=>x?x[0].toUpperCase()+x.slice(1):"";
const cgSumMe=()=>cgJ([byName(), myRole()?t("role"+cgCap(myRole())):"", S.canWrite?t(S.cfg.mode==="test"?"cgTest":"cgReal"):""]);
const cgSumLook=()=>cgJ([t("ts"+(TSIZES.indexOf(fzNow())+1)), t("th"+cgCap(palNow())), t("ap"+cgCap(appearNow())), t(sposNow()==="bottom"?"cgSBot":"cgSTop")]);
const cgSumPr=()=>{ const P=prGet(); return cgJ([t("prP"+P.paper), P.auto?t("cgAuto"):""]); };
const cgSumShop=c=>cgJ([c.shopName, c.shopGstin?"GSTIN "+c.shopGstin:t("cgNoGst")]);
const cgSumBills=c=>cgJ([t("cgNext",c.nextBill), t("cgNextG",c.nextGstBill), t(+c.roundTo===1?"r1":+c.roundTo===0.5?"r05":"r0")]);
const cgSumItems=c=>cgJ([t("cgUnits",c.units.length), t("grpCount",allGroups().length)]);
const cgSumAi=()=>t(S.cfg.aiOn?"aiOnL":"aiOffL");
function cgSync(){ const f={me:cgSumMe,look:cgSumLook,pr:cgSumPr,ai:cgSumAi};
  Object.keys(f).forEach(k=>{ const el=document.querySelector(`#sheet-body details.cg[data-cg="${k}"] .cg-s`); if(el) el.textContent=f[k](); }); }
function cgWire(){ $("#sheet-body").querySelectorAll("details.cg").forEach(d=>{
  const sm=d.querySelector("summary"); sm.addEventListener("click",()=>{ d.__user=Date.now(); });
  d.addEventListener("toggle",()=>{ const k=d.dataset.cg; if(d.open) CG_OPEN.add(k); else CG_OPEN.delete(k);
    if(d.open && Date.now()-(d.__user||0)<800) setTimeout(()=>{ const r=d.getBoundingClientRect(), h=(window.visualViewport||{}).height||innerHeight; if(r.bottom>h-90) sm.scrollIntoView({block:"start",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}); },60); });
  d.addEventListener("click",()=>setTimeout(cgSync,80)); d.addEventListener("change",()=>setTimeout(cgSync,80)); }); }
function cgFocus(sel){ const el=$(sel); if(!el) return; const d=el.closest("details"); if(d) d.open=true; el.scrollIntoView({block:"center"}); el.focus(); }
function openSettings(){
  const c={ shopName:S.cfg.shopName, units:S.cfg.units.map(u=>({...u})), defaultUnit:S.cfg.defaultUnit, roundTo:S.cfg.roundTo, billFooter:S.cfg.billFooter, nextBill:seriesNext(false), nextGstBill:seriesNext(true), shopGstin:S.cfg.shopGstin, shopAddress:S.cfg.shopAddress, defaultGst:S.cfg.defaultGst, defaultHsn:S.cfg.defaultHsn };
  const w=can("owner"), me=S.canWrite, test=S.cfg.mode==="test";
  if($("#sheet").hidden || (sheetCurKey!=="settings" && !SHEET_STK.some(x=>x.key==="settings"))) CG_OPEN.clear();
  const body=`
    <div class="cg-lbl">${esc(t("cgYou"))}</div>
${cg("me","user",t("meT"),cgSumMe(),`
    ${me?`<div class="cfg-sec" style="display:grid;gap:10px" id="cf-me"><div><h3 style="margin:0">${esc(t("meT"))}</h3><p class="note" style="margin:2px 0 0">${esc(t("meD",S.auth.by||""))}</p></div>
      <div class="env-sec${test?" test":""}"><label class="switch"><span><b>${esc(t("envT"))}</b><br><span class="note">${esc(myTestOk()?t("myEnvD"):t("noTestD"))}</span></span><input type="checkbox" id="cf-env" ${test?"checked":""} ${myTestOk()||test?"":"disabled"}></label>
        <div class="confirm" id="cf-envc" hidden><span id="cf-envq"></span><div class="row-btns" style="justify-content:flex-start"><button type="button" class="btn primary" id="cf-envy"></button><button type="button" class="btn ghost" id="cf-envn">${esc(t("cancel"))}</button></div></div></div>
      ${can("manager")?`<label class="switch"><span><b>${esc(t("profitSet"))}</b><br><span class="note">${esc(t("profitSetD"))}</span></span><input type="checkbox" id="cf-myprofit" ${S.cfg.showProfit?"checked":""}></label>`:""}
      ${nSetHTML()}
      <label class="switch"><span><b>${esc(t("hideBuy"))}</b><br><span class="note">${esc(t("hideBuyD"))}</span></span><input type="checkbox" id="cf-hide" ${S.hideBuy?"checked":""}></label>
      <div id="cf-bio"></div>
      <div><button type="button" class="btn ghost" id="cf-signout">${esc(t("signOutBtn"))}</button></div>
      <div class="err" id="cf-meerr" role="alert"></div></div>`:""}
    ${me?"":`<div class="cfg-sec" style="border:0"><h3>${esc(t("thisPhone"))}</h3>
      <label class="switch"><span><b>${esc(t("hideBuy"))}</b><br><span class="note">${esc(t("hideBuyD"))}</span></span><input type="checkbox" id="cf-hide" ${S.hideBuy?"checked":""}></label></div>`}`)}
${cg("look","phone",t("cgLook"),cgSumLook(),`
    <div class="cfg-sec" style="display:grid;gap:8px"><h3 style="margin:0">${esc(t("tsizeT"))}</h3>
      <div class="tsize" id="cf-tsize" role="group">${TSIZES.map((v,i)=>`<button type="button" data-fz="${v}" aria-pressed="${Math.abs(fzNow()-v)<.01}"><b style="font-size:${14+i*3}px">A</b><span>${esc(t("ts"+(i+1)))}</span></button>`).join("")}</div>
      <p class="note" style="margin:0">${esc(t("tsizeD"))}</p>
      <h3 style="margin:6px 0 0;font-size:14px">${esc(t("sposT"))}</h3>
      <div class="appear" id="cf-spos" role="group" style="grid-template-columns:1fr 1fr">${["bottom","top"].map(k=>`<button type="button" data-spos="${k}" aria-pressed="${sposNow()===k}">${esc(t(k==="bottom"?"sposB":"sposTop"))}</button>`).join("")}</div>
      <p class="note" style="margin:0">${esc(t("sposD"))}</p>
      <div id="cf-sres-w" class="cf-sres-w" ${sposNow()==="bottom"?"":"hidden"}><h3 style="margin:6px 0 0;font-size:14px">${esc(t("sresT"))}</h3>
      <div class="appear" id="cf-sres" role="group" style="grid-template-columns:1fr 1fr">${["near","top"].map(k=>`<button type="button" data-sres="${k}" aria-pressed="${ls.get("rb_sres","near")===k}">${esc(t(k==="near"?"sresNear":"sresTop"))}</button>`).join("")}</div>
      <p class="note" style="margin:0">${esc(t("sresD"))}</p></div></div>
    <div class="cfg-sec" style="display:grid;gap:8px"><h3 style="margin:0">${esc(t("themeT"))}</h3>
      <div class="swatches" id="cf-pal" role="group">${PALETTES.map(([k,a,b])=>`<button type="button" data-pal="${k}" aria-pressed="${palNow()===k}"><span class="sw" style="background:${a};--sw2:${b}"></span>${esc(t("th"+k[0].toUpperCase()+k.slice(1)))}</button>`).join("")}</div>
      <h3 style="margin:6px 0 0;font-size:14px">${esc(t("appearT"))}</h3>
      <div class="appear" id="cf-appear" role="group">${["auto","light","dark"].map(k=>`<button type="button" data-ap="${k}" aria-pressed="${appearNow()===k}">${esc(t("ap"+k[0].toUpperCase()+k.slice(1)))}</button>`).join("")}</div>
      <p class="note" style="margin:0">${esc(t("appearD"))}</p></div>`)}
${cg("pr","printer",t("cgPr"),cgSumPr(),`
    <div class="cfg-sec" style="display:grid;gap:8px" id="cf-pr"></div>`)}
    ${can("manager")?`<div class="cg-lbl">${esc(t("cgShopL"))}</div>`:""}
${can("manager")?cg("shop","store",t("cgShop"),cgSumShop(c),`
    <div class="cfg-sec"><div class="field"><label for="cf-shop">${esc(t("shopName"))}</label><input id="cf-shop" value="${esc(c.shopName)}" ${w?"":"disabled"}></div></div>
    <div class="cfg-sec"><h3>${esc(t("gstSet"))}</h3>
      <div class="field"><label for="cf-gstin">${esc(t("shopGstin"))}</label><input id="cf-gstin" value="${esc(c.shopGstin)}" maxlength="15" style="text-transform:uppercase" autocomplete="off" ${w?"":"disabled"}></div>
      <div class="field"><label for="cf-addr">${esc(t("shopAddress"))}</label><input id="cf-addr" value="${esc(c.shopAddress)}" maxlength="200" ${w?"":"disabled"}></div>
      <div class="field"><label for="cf-state">${esc(t("shopStateL"))}</label><select id="cf-state" ${w?"":"disabled"}><option value="">—</option>${STATES.map(([sc,n])=>`<option value="${sc}" ${shopStateCode()===sc?"selected":""}>${esc(n)} (${sc})</option>`).join("")}</select></div>
      <label class="switch"><span><b>${esc(t("fyResetL"))}</b><br><span class="note">${esc(t("fyResetD"))}</span></span><input type="checkbox" id="cf-fy" ${fyOn()?"checked":""} ${w?"":"disabled"}></label>
      <div class="two"><div class="field"><label for="cf-dgst">${esc(t("defGst"))}</label><input id="cf-dgst" class="num" inputmode="decimal" value="${esc(c.defaultGst)}" ${w?"":"disabled"}></div>
        <div class="field"><label for="cf-dhsn">${esc(t("defHsn"))}</label><input id="cf-dhsn" class="num" inputmode="numeric" maxlength="10" value="${esc(c.defaultHsn)}" ${w?"":"disabled"}></div></div>
    </div>
    <div class="cfg-sec"><div class="field"><label for="cf-foot">${esc(t("billFooter"))}</label><input id="cf-foot" value="${esc(c.billFooter)}" placeholder="${esc(t("billFooterPh"))}" ${w?"":"disabled"}></div></div>`):""}
${can("manager")?cg("bills","receipt",t("cgBills"),cgSumBills(c),`
    <div class="cfg-sec"><h3>${esc(t("billNoT"))}</h3><div class="two"><div class="field"><label for="cf-bill">${esc(t("nextBillL"))}</label><input id="cf-bill" class="num" inputmode="numeric" value="${c.nextBill}" ${w?"":"disabled"}></div>
      <div class="field"><label for="cf-gbill">${esc(t("nextGstBillL"))}</label><input id="cf-gbill" class="num" inputmode="numeric" value="${c.nextGstBill}" ${w?"":"disabled"}></div></div><p class="note" style="margin:0">${esc(t("nextBillD"))}${S.cfg.mode==="test"?` ${esc(t("envNumsNote"))}`:""}</p></div>
    <div class="cfg-sec"><h3>${esc(t("rounding"))}</h3><div class="seg" id="cf-round">${[[1,"r1"],[0.5,"r05"],[0,"r0"]].map(([v,k])=>`<button type="button" data-r="${v}" aria-pressed="${+c.roundTo===v}" ${w?"":"disabled"}>${esc(t(k))}</button>`).join("")}</div></div>`):""}
${can("manager")?cg("items","tag",t("cgItems"),cgSumItems(c),`
    <div class="cfg-sec"><h3>${esc(t("units"))}</h3><div class="unit-chips" id="cf-units"></div>
      ${w?`<div class="addunit"><input id="cf-ucode" placeholder="${esc(t("unitCode"))}" autocomplete="off"><input id="cf-uhi" placeholder="${esc(t("unitHi"))}" autocomplete="off" lang="hi"><button class="btn primary" id="cf-uadd" type="button">${esc(t("add"))}</button></div>`:""}</div>
    <div class="cfg-sec"><div class="field"><label>${esc(t("defUnit"))}</label>${unitBtnHTML("cf-def",c.defaultUnit,w?"":"disabled")}</div></div>
    <div class="cfg-sec" style="display:grid;gap:8px"><h3 style="margin:0">${esc(t("grpSetT"))}</h3><p class="note" style="margin:0">${esc(bizType()?t("biz_"+bizType()):t("bizPick"))} · ${esc(t("grpCount",allGroups().length))}</p><button type="button" class="btn ghost" id="cf-groups" ${can("manager")?"":"disabled"}>${esc(t("grpManage"))}</button></div>`):""}
${can("manager")?cg("ai","scan",t("aiT"),cgSumAi(),`
    <div class="cfg-sec" style="display:grid;gap:8px" id="cf-ai"></div>`):""}
    ${w?`<div class="cg-lbl">${esc(t("cgOwnerL"))}</div>`:""}
${w?cg("ppl","users",t("cgPpl"),t("cgPplD"),`
    <div class="cfg-sec bk-sec"><h3 style="margin:0">${esc(t("pplT"))}</h3><p class="note" style="margin:0">${esc(t("pplD"))}</p><div id="ppl-body" class="ppl-list">${ldBlock()}</div></div>
    <div class="cfg-sec bk-sec"><h3 style="margin:0">${esc(t("sessT"))}</h3><p class="note" style="margin:0">${esc(t("sessD"))}</p><div id="sess-body">${ldBlock()}</div></div>
    <div class="cfg-sec bk-sec"><h3 style="margin:0">${esc(t("accT"))}</h3><p class="note" style="margin:0">${esc(t("accD"))}</p><div id="acc-body">${ldBlock()}</div></div>
    <div class="cfg-sec"><h3>${esc(t("changePin"))}</h3><div class="two"><div class="field"><label for="cf-p1">${esc(t("newPin"))}</label><input id="cf-p1" inputmode="numeric" type="password" autocomplete="new-password" maxlength="8"></div><div class="field"><label for="cf-p2">${esc(t("newPin2"))}</label><input id="cf-p2" inputmode="numeric" type="password" autocomplete="new-password" maxlength="8"></div></div><div><button class="btn ghost" id="cf-pin" type="button">${esc(t("changePin"))}</button></div><div class="err" id="cf-perr"></div></div>`):""}
${w?cg("bk","cloud",t("bkT"),t("cgBkD"),`
    <div class="cfg-sec bk-sec" id="cf-bk"><div class="bk-head"><h3 style="margin:0">${esc(t("bkT"))}</h3><button type="button" class="btn ghost sm" id="bk-now">${esc(t("bkNow"))}</button></div><div id="bk-body">${ldBlock()}</div></div>`):""}
${w?cg("speed","gauge",t("speedT"),t("cgSpeedD"),`
    <div class="cfg-sec bk-sec"><h3 style="margin:0" class="cg-hide">${esc(t("speedT"))}</h3><p class="note" style="margin:0">${esc(t("speedD"))}</p><div id="speed-body">${speedHTML()}</div></div>`):""}
    <div class="err" id="cf-err" role="alert"></div>`;
  sheetKey("settings"), openSheet(t("settings"), body, w?`<button class="btn ghost" id="cf-cancel">${esc(t("cancel"))}</button><button class="btn primary" id="cf-save">${esc(t("save"))}</button>`:"", {full:true});
  cgWire();
  const drawUnits=()=>{ $("#cf-units").innerHTML=c.units.map((u,i)=>`<span class="uchip"><b>${esc(u.code)}</b>${u.hi?`<span>${esc(u.hi)}</span>`:""}${w&&c.units.length>1?`<button type="button" data-rmu="${i}" aria-label="Remove ${esc(u.code)}">×</button>`:"<i style='width:6px'></i>"}</span>`).join(""); };
  drawUnits();
  $("#cf-units").addEventListener("click",e=>{ const b=e.target.closest("[data-rmu]"); if(!b) return; c.units.splice(+b.dataset.rmu,1); if(!c.units.some(u=>u.code===c.defaultUnit)){ c.defaultUnit=c.units[0].code; const d=$("#cf-def"); d.dataset.unit=c.defaultUnit; d.querySelector("span").textContent=c.defaultUnit; } drawUnits(); });
  $("#cf-pal").onclick=e=>{ const b=e.target.closest("[data-pal]"); if(!b) return; ls.set("rb_palette",b.dataset.pal); applyTheme(); $("#cf-pal").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); };
  $("#cf-appear").onclick=e=>{ const b=e.target.closest("[data-ap]"); if(!b) return; ls.set("rb_appear",b.dataset.ap); applyTheme(); $("#cf-appear").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); };
  renderPrCfg(); renderAiCfg(); $("#cf-groups").onclick=()=>openGroups();
  $("#cf-spos").onclick=e=>{ const b=e.target.closest("[data-spos]"); if(!b) return; ls.set("rb_spos",b.dataset.spos); $("#cf-spos").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); $("#cf-sres-w").hidden=b.dataset.spos!=="bottom"; placeSearch(); };
  $("#cf-sres").onclick=e=>{ const b=e.target.closest("[data-sres]"); if(!b) return; ls.set("rb_sres",b.dataset.sres); $("#cf-sres").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); placeSearch(); };
  $("#cf-tsize").onclick=e=>{ const b=e.target.closest("[data-fz]"); if(!b) return; setFz(+b.dataset.fz); $("#cf-tsize").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); };
  /* Just for you: saved with the person on the sheet (follows them to any phone); without signing in, hide-buy stays per phone */
  const mySet=async(el,p,undo)=>{ el.disabled=true; $("#cf-meerr").textContent="";
    try{ await setMyPrefs(p); }catch(er){ undo(); $("#cf-meerr").textContent=errMsg(er); } finally{ el.disabled=false; } };
  $("#cf-hide").onchange=e=>{ const v=e.target.checked; if(!me){ S.hideBuy=v; ls.set("rb_hidebuy",v); renderList(); return; }
    S.hideBuy=v; renderList(); mySet(e.target,{hideBuy:v},()=>{ e.target.checked=!v; S.hideBuy=!v; renderList(); }); };
  if($("#cf-signout")) $("#cf-signout").onclick=()=>{ if(confirm(t("signOutQ"))){ closeSheet(); lockPhone(); } };
  if($("#cf-bio")) bioAvail().then(ok=>{ const box=$("#cf-bio"); if(!ok||!box) return;
    box.innerHTML=`<label class="switch"><span><b>${esc(t("bioSet"))}</b><br><span class="note">${esc(t("bioSetD"))}</span></span><input type="checkbox" id="cf-bioon" ${S.auth.bio?"checked":""}></label>`;
    $("#cf-bioon").onchange=async e=>{ const on=e.target.checked;
      if(on){ try{ await bioRegister(); }catch{ e.target.checked=false; $("#cf-meerr").textContent=t("bioFail"); } }
      else { delete S.auth.bio; ls.set("rb_auth",S.auth); ls.set("rb_bio_"+(S.auth.by||""),null); ls.set("rb_bio_no_"+(S.auth.by||""),true); } }; });
  if($("#cf-noti")) $("#cf-noti").onclick=e=>{ const b=e.target.closest("[data-nk]"); if(!b) return; const box=$("#cf-noti .n-offs"), was=[...box.querySelectorAll("[data-nk]")].map(x=>[x,x.getAttribute("aria-pressed")]);
    b.setAttribute("aria-pressed",String(b.getAttribute("aria-pressed")!=="true"));
    const noff=[...box.querySelectorAll('[data-nk][aria-pressed="false"]')].map(x=>x.dataset.nk);
    mySet(box,{noff},()=>was.forEach(([x,v])=>x.setAttribute("aria-pressed",v))).then(()=>{ nBadge(); if($("#n-list")) nRenderList(false); }); };
  if($("#cf-myprofit")) $("#cf-myprofit").onchange=e=>{ const v=e.target.checked; mySet(e.target,{showProfit:v},()=>{ e.target.checked=!v; }); };
  if($("#cf-env")){
    const env=$("#cf-env"), box=$("#cf-envc");
    env.onchange=()=>{ const toLive=!env.checked; env.checked=toLive;   /* stays as it was until confirmed */ box.hidden=false; $("#cf-envq").textContent=t(toLive?"myEnvOffQ":"myEnvOnQ"); $("#cf-envy").textContent=t(toLive?"envYesLive":"envYesTest"); $("#cf-envy").dataset.to=toLive?"live":"test"; box.scrollIntoView({block:"center",behavior:"smooth"}); };
    $("#cf-envn").onclick=()=>{ box.hidden=true; };
    $("#cf-envy").onclick=async()=>{ const to=$("#cf-envy").dataset.to, b=$("#cf-envy"); btnBusy(b,true);
      try{ await setMyPrefs({mode:to}); closeSheet(); toast(t(to==="live"?"myLiveNow":"envTestNow")); }
      catch(er){ btnBusy(b,false); $("#cf-meerr").textContent=errMsg(er); } };
  }
  if(!w) return;
  $("#cf-uadd").onclick=()=>{ const code=$("#cf-ucode").value.trim(), hi=$("#cf-uhi").value.trim(); if(!code) return; if(c.units.some(u=>u.code.toLowerCase()===code.toLowerCase())){ $("#cf-ucode").value=""; return; } c.units.push({code,hi}); $("#cf-ucode").value=""; $("#cf-uhi").value=""; drawUnits(); };
  $("#cf-def").onclick=async e=>{ const btn=e.currentTarget; const saved=S.cfg.units; S.cfg.units=c.units; const v=await pickUnit(btn.dataset.unit); S.cfg.units=saved; if(v){ c.defaultUnit=v; btn.dataset.unit=v; btn.querySelector("span").textContent=v; if(!c.units.some(u=>u.code===v)){ c.units.push({code:v,hi:""}); drawUnits(); } } };
  $("#cf-round").addEventListener("click",e=>{ const b=e.target.closest("[data-r]"); if(!b) return; c.roundTo=+b.dataset.r; $("#cf-round").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b)); });
  $("#cf-cancel").onclick=sheetCancel;
  $("#cf-pin").onclick=async()=>{ const p1=$("#cf-p1").value.trim(), p2=$("#cf-p2").value.trim(), er=$("#cf-perr");
    if(!/^\d{4,8}$/.test(p1)){ er.textContent=t("pinRule"); return; } if(p1!==p2){ er.textContent=t("pinMismatch"); return; }
    $("#cf-pin").disabled=true; try{ await write({action:"setPin",newPin:p1}); if(S.auth.tok){ if(!S.auth.personal) S.auth={...S.auth,...await pinCheckSet(p1),pinLen:p1.length}; } else S.auth={...S.auth,pin:p1}; ls.set("rb_auth",S.auth); $("#cf-p1").value=""; $("#cf-p2").value=""; er.textContent=""; toast(t("pinChanged")); }catch(e){ er.textContent=errMsg(e); } finally{ const b=$("#cf-pin"); if(b) b.disabled=false; } };
  if($("#cf-bk")) loadBackupCard();
  if($("#ppl-body")) loadOwnerCards();
  $("#cf-save").onclick=async()=>{ const btn=$("#cf-save"); btn.disabled=true;
    const nb=Math.floor(toNum($("#cf-bill").value)); if(!(nb>=1)){ btn.disabled=false; $("#cf-err").textContent=t("billNoBad"); cgFocus("#cf-bill"); return; }
    const ngb=Math.floor(toNum($("#cf-gbill").value)); if(!(ngb>=1)){ btn.disabled=false; $("#cf-err").textContent=t("billNoBad"); cgFocus("#cf-gbill"); return; }
    const gstin=$("#cf-gstin").value.trim().toUpperCase(); if(!gstinOk(gstin)){ btn.disabled=false; $("#cf-err").textContent=t("gstinBad"); cgFocus("#cf-gstin"); return; }
    const dg=toNum($("#cf-dgst").value); if(isNaN(dg)||dg<0||dg>100){ btn.disabled=false; $("#cf-err").textContent=t("defGst")+": 0–100"; cgFocus("#cf-dgst"); return; }
    const dh=$("#cf-dhsn").value.replace(/\s/g,"")||"3923";
    const data={ shopName:$("#cf-shop").value.trim(), units:c.units, defaultUnit:c.defaultUnit, roundTo:c.roundTo, billFooter:$("#cf-foot").value.trim(), ...(S.cfg.mode==="test"?{testNextBill:nb,testNextGstBill:ngb}:{nextBill:nb,nextGstBill:ngb}), shopGstin:gstin, shopAddress:$("#cf-addr").value.trim(), shopState:$("#cf-state").value, fyReset:$("#cf-fy").checked, defaultGst:dg, defaultHsn:dh };
    try{ const j=await write({action:"setConfig",config:data}); applyConfig(j.config||data); saveCache(); closeSheet(); renderAll(); toast(t("settingsSaved")); }catch(er){ btn.disabled=false; $("#cf-err").textContent=errMsg(er); } };
}

/* ---------------- Backups ---------------- */
let bkInfo=null;
const fmtDTs=d=>d?fmtDT(d):"";
async function loadBackupCard(){
  const box=$("#bk-body"); if(!box) return;
  $("#bk-now").onclick=async()=>{ const b=$("#bk-now"); btnBusy(b,true);
    try{ const j=await apiPost({action:"backupNow"}); bkInfo=j.info.backups; toast(t("bkDone")); renderBackupCard(); }
    catch(e){ toast(e&&/permission|authoriz|DriveApp|ScriptApp/i.test(e.code||"")?t("bkPerm"):t("bkFail")); }
    finally{ btnBusy($("#bk-now"),false); } };
  try{ const j=await apiPost({action:"backupInfo"}); bkInfo=j.backups; renderBackupCard(); }
  catch(e){ if($("#bk-body")) $("#bk-body").innerHTML=`<p class="note" style="margin:0">${esc(/permission|authoriz|DriveApp|ScriptApp/i.test(e&&e.code||"")?t("bkPerm"):t("bkFail"))}</p>`; }
}
function renderBackupCard(){
  const box=$("#bk-body"), b=bkInfo; if(!box||!b) return;
  box.innerHTML=`<div class="bk-status ${b.auto?"ok":"off"}"><span class="dot"></span><span>${b.auto?esc(t("bkAutoOn")):""}${b.auto&&b.last?" · ":""}${b.last?esc(t("bkLast",fmtDTs(b.last))):""}${b.count?` · ${esc(t("bkCopies",b.count))}`:""}${!b.last?esc((b.auto?" · ":"")+t("bkNone")):""}</span></div>
    ${b.auto?"":`<p class="note bk-warn">${esc(t("bkOff"))}</p>`}
    ${b.restoredAt?`<p class="note" style="margin:0">${esc(t("bkRestoredNote",fmtDTs(b.restoredAt),b.restoredFrom))}</p>`:""}
    ${b.count?`<button type="button" class="btn ghost" id="bk-see">${esc(t("bkSee"))} →</button>`:""}
    <div class="field"><label for="bk-mail">${esc(t("bkMailL"))}</label><div class="bk-mailrow"><input id="bk-mail" type="email" inputmode="email" autocomplete="email" placeholder="${esc(t("bkMailPh"))}" value="${esc(b.email)}"><button type="button" class="btn ghost" id="bk-mail-save">${esc(t("bkMailSave"))}</button></div>
      <p class="note" style="margin:0">${esc(t("bkMailD"))}${b.lastMail?` ${esc(t("bkMailLast",fmtDTs(b.lastMail)))}.`:""}</p>${b.mailError?`<p class="err" style="margin:0">${esc(t("bkMailErr"))} ${esc(b.mailError)}</p>`:""}</div>`;
  if($("#bk-see")) $("#bk-see").onclick=()=>openBackups();
  $("#bk-mail-save").onclick=async()=>{ const v=$("#bk-mail").value.trim(), btn=$("#bk-mail-save");
    if(v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){ toast(t("bkBadEmail")); $("#bk-mail").focus(); return; }
    btnBusy(btn,true); try{ const j=await apiPost({action:"setBackupEmail",email:v}); bkInfo=j.backups; toast(t("bkMailSaved")); renderBackupCard(); }catch(e){ btnBusy(btn,false); toast(errMsg(e)); } };
}
function openBackups(){
  const b=bkInfo||{list:[]};
  const tag=n=>/before restore/.test(n)?`<span class="pill edited">${esc(t("bkBefore"))}</span>`:/\(manual\)/.test(n)?`<span class="pill gst">${esc(t("bkManual"))}</span>`:"";
  const body=`<div style="display:grid;gap:12px">
    <div><button type="button" class="btn ghost" id="bkl-back">← ${esc(t("back"))}</button></div>
    <p class="note" style="margin:0">${esc(t("bkListD"))}</p>
    <a class="btn ghost" href="${esc(b.current||"#")}" target="_blank" rel="noopener">${esc(t("bkCurrent"))} ↗</a>
    <div class="bills-list" style="margin-top:0">${b.list.map((x,i)=>`<div class="bk-item" data-bk="${i}">
      <div><b>${esc(fmtDT(x.date))}</b> ${tag(x.name)}</div>
      <div class="bk-acts"><a class="btn ghost sm" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(t("bkOpen"))} ↗</a><button type="button" class="btn ghost sm" data-bkr="${i}">${esc(t("bkRestore"))}</button></div>
      <div class="confirm" id="bkc-${i}" hidden><span>${esc(t("bkRestoreQ",fmtDT(x.date)))}</span><div class="row-btns" style="justify-content:flex-start"><button type="button" class="btn primary" data-bky="${i}">${esc(t("bkRestoreYes"))}</button><button type="button" class="btn ghost" data-bkn="${i}">${esc(t("cancel"))}</button></div></div>
    </div>`).join("")||`<p class="note">${esc(t("bkNone"))}</p>`}</div></div>`;
  sheetKey("backups"), openSheet(t("bkListT"), body, "", {full:true});
  $("#bkl-back").onclick=()=>openSettings();
  $("#sheet-body").addEventListener("click",async e=>{
    const r=e.target.closest("[data-bkr]"), n=e.target.closest("[data-bkn]"), y=e.target.closest("[data-bky]");
    if(r){ document.querySelectorAll('[id^="bkc-"]').forEach(c=>c.hidden=true); const c=$("#bkc-"+r.dataset.bkr); c.hidden=false; c.scrollIntoView({block:"center",behavior:"smooth"}); }
    if(n) $("#bkc-"+n.dataset.bkn).hidden=true;
    if(y){ const x=b.list[+y.dataset.bky]; btnBusy(y,true);
      try{ await apiPost({action:"restoreBackup",id:x.id}); toast(t("bkRestored")); closeSheet(); S.rev=null; duesCache=null; sync(); }
      catch(er){ btnBusy(y,false); toast(errMsg(er)); } }
  });
}

/* ---------------- Change by typing / speaking ---------------- */
let cmdCtl=null;
function openCmd(prefill="",auto=false){
  const ex = S.lang==="hi"
    ? ["51 माइक्रोन बैग 1kg जोड़ो रेट 110 और 120","तूर दाल का बिक्री रेट 145 कर दो","चीनी 5% बढ़ा दो"]
    : ["add 51 micron bag 1kg with rates 110 and 120","change toor dal sell rate to 145","increase sugar by 5%"];
  const body=`<p class="note" style="margin:0 0 10px">${esc(t("cmdHelp"))}</p>
    <textarea id="cmd-text" style="min-height:96px" placeholder="${esc(t("cmdPh"))}">${esc(prefill)}</textarea>
    <div class="cmd-mic"><button class="btn ghost" id="cmd-mic" type="button"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg> <span>${esc(t("speak"))}</span></button></div>
    <div class="mictip" id="cmd-tip" style="margin-top:8px" hidden><div class="kb" aria-hidden="true"><i></i><i></i><i></i><i class="m"></i><i></i><i></i><i></i><i></i></div><p>${esc(t("micTip"))}</p></div>
    <div id="cmd-out" style="margin-top:12px;display:grid;gap:10px"></div>
    <div id="cmd-ex" style="margin-top:12px"><p class="note" style="margin:0 0 6px">${esc(t("examples"))}</p><div class="examples">${ex.map(x=>`<button type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join("")}</div></div>`;
  openSheet(t("cmdTitle"), body, `<button class="btn ghost" id="cmd-cancel">${esc(t("cancel"))}</button><button class="btn primary" id="cmd-go">${esc(t("preview"))}</button>`, {full:true, onClose:()=>{ cmdCtl?.abort(); cmdCtl=null; dictStop(); }});
  const ta=$("#cmd-text");
  $("#cmd-ex").addEventListener("click",e=>{ const b=e.target.closest("[data-ex]"); if(b){ ta.value=b.dataset.ex; ta.focus(); } });
  $("#cmd-cancel").onclick=sheetCancel;
  $("#cmd-mic").onclick=e=>{ if(dict.on){ dictStop(); return; } dictStart(e.currentTarget, ta.value.trim(), txt=>{ ta.value=txt; ta.scrollTop=ta.scrollHeight; }, ()=>{ $("#cmd-tip").hidden=false; ta.focus(); }); };
  $("#cmd-go").onclick=()=>runCmd();
  if(auto && prefill) runCmd(); else setTimeout(()=>ta.focus(),260);
}
function runCmd(){
  dictStop();
  const text=$("#cmd-text").value.trim(); if(!text) return;
  $("#cmd-ex").hidden=true; $("#cmd-text").blur(); const tip=$("#cmd-tip"); if(tip) tip.hidden=true;
  renderPreview(localParse(text).map(a=>({...a,on:true})),"",false);
}
function renderPreview(actions,note,local){
  const out=$("#cmd-out"), go=$("#cmd-go");
  if(!actions.length){ out.innerHTML=`<div class="suggest"><p>${esc(t("nothing"))}</p></div>`; go.textContent=t("preview"); go.onclick=()=>runCmd(); return; }
  const opL={add:t("opAdd"),update:t("opUpdate"),delete:t("opDelete")};
  out.innerHTML = (note?`<p class="note" style="margin:0">${esc(note)}</p>`:"") + 
    actions.map((a,i)=>{ const it=a.id?S.byId.get(a.id):null;
      const was = it ? `<div class="was num">${esc(t("now"))}: ${esc(t("buy"))} ${rs(it.buy)} · ${esc(t("sell"))} ${rs(it.sell)} / ${esc(unitL(it.unit))}</div>` : "";
      if(a.op==="delete") return `<div class="act" data-ai="${i}"><div class="act-h"><span class="pill delete">${esc(opL.delete)}</span><b>${esc(a.name)}</b><label><input type="checkbox" data-on="${i}" checked> ${esc(t("include"))}</label></div>${was}<div class="note">${esc(t("willDel"))}</div></div>`;
      return `<div class="act" data-ai="${i}">
        <div class="act-h"><span class="pill ${a.op}">${esc(opL[a.op])}</span><span class="note">${esc(a.op==="update"?t("exists"):t("notFound"))}</span><label><input type="checkbox" data-on="${i}" checked> ${esc(t("include"))}</label></div>
        ${a.op==="add"?`<input class="t" id="pa-n-${i}" data-pf="name" value="${esc(a.name)}" aria-label="${esc(t("itemName"))}">`:`<b>${esc(a.name)}</b>`}
        ${was}
        <div class="three">
          <label>${esc(t("unit"))}${unitBtnHTML("pa-u-"+i,a.unit,`data-pu="${i}"`)}</label>
          <label>${esc(t("buy"))} ₹<input class="t num" id="pa-b-${i}" data-pf="buy" inputmode="decimal" value="${a.buy==null?(it?it.buy:""):a.buy}"></label>
          <label>${esc(t("sell"))} ₹<input class="t num" id="pa-s-${i}" data-pf="sell" inputmode="decimal" value="${a.sell==null?(it?it.sell:""):a.sell}"></label>
        </div></div>`; }).join("");
  const count=()=>actions.filter(a=>a.on).length;
  const updBtn=()=>{ go.textContent=t("applyN",count()); go.disabled=!count(); };
  updBtn();
  out.oninput=e=>{ const card=e.target.closest("[data-ai]"); if(!card) return; const a=actions[+card.dataset.ai]; const f=e.target.dataset.pf; if(f==="name") a.name=e.target.value; else if(f){ const n=toNum(e.target.value); a[f]=isNaN(n)?null:n; } };
  out.onchange=e=>{ const i=e.target.dataset.on; if(i!=null){ actions[+i].on=e.target.checked; e.target.closest(".act").classList.toggle("off",!e.target.checked); updBtn(); } };
  out.onclick=e=>{ const b=e.target.closest("[data-pu]"); if(b) onUnitBtn(b,v=>{ actions[+b.dataset.pu].unit=v; }); };
  go.onclick=()=>applyActions(actions);
}
async function applyActions(actions){
  const todo=actions.filter(a=>a.on); if(!todo.length) return;
  for(const a of todo){ if(a.op==="add" && (!a.name.trim() || a.sell==null || isNaN(a.sell))){ toast(t("needRate")); return; } }
  if(navigator.onLine===false){ toast(t("offlineWrite")); return; }
  const go=$("#cmd-go"); go.disabled=true;
  const ups=[], dels=[];
  for(const a of todo){
    if(a.op==="delete"){ dels.push(a.id); continue; }
    if(a.op==="update"){ const it=S.byId.get(a.id); const ch={id:a.id}; if(a.buy!=null&&a.buy!==it.buy) ch.buy=a.buy; if(a.sell!=null&&a.sell!==it.sell) ch.sell=a.sell; if(a.unit&&a.unit!==it.unit) ch.unit=a.unit; if(Object.keys(ch).length>1) ups.push(ch); continue; }
    ups.push(withCat({ tmp:tmpId(), name:a.name.trim(), nameHi:a.nameHi||toHindi(a.name.trim()), unit:a.unit||S.cfg.defaultUnit, buy:a.buy==null?0:a.buy, sell:a.sell }));
  }
  try{
    if(ups.length){ const j=await write({action:"upsert",items:ups}); mergeSaved(j.items); }
    if(dels.length){ await write({action:"delete",ids:dels},()=>{ S.items=S.items.filter(x=>!dels.includes(x.id)); S.bill=S.bill.filter(l=>!dels.includes(l.id)); saveBill(); }); }
    closeSheet(); toast(t("appliedN",todo.length)); resyncSoon();
    if(looksLikeCommand(S.q)){ $("#q").value=""; onQuery(""); }
  }catch{ const b=$("#cmd-go"); if(b) b.disabled=false; }
}

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
    paidBy:rec.paidBy||"", pay:rec.pay==="credit"?"Credit":rec.pay==="part"?"Part paid":"Paid", paid:r2((+rec.total||0)-due), due, payments:[], clearedAt:"", fy:curFY(), cancelled:false, pos:rec.pos||"", text:rec.text, lines:rec.lines, _t:Date.now() });
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
      cost:q.cost, profit:q.profit, paidBy:q.paidBy||"", pay:q.pay==="credit"?"Credit":q.pay==="part"?"Part paid":"Paid", paid:r2((+q.total||0)-due), due, payments:[], fy:curFY(), cancelled:false, pos:q.pos||"", text:q.text, lines:q.lines, pending:true }; });
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
      ["edits","fy","igst","custGstin","pos","total","items","cancelled","cancelReason","cancelledBy","cancelledAt","editedAt","editedBy","pay","paid","due","payments","clearedAt"].forEach(k=>{ if(g[k]!==undefined) b[k]=g[k]; });   // always the sheet's latest: payments, cancel and edits made on other phones   // the saved values, so an edit keeps GST details and knows the edit count
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
    S.cust=b.customer||""; S.mob=b.mobile||""; S.gst=!!b.gst; S.igst=!!b.igst; S.custGstin=b.custGstin||""; S.billNoOvr=null;
    ls.set("rb_cust",S.cust); ls.set("rb_mob",S.mob); ls.set("rb_gst",S.gst); ls.set("rb_igst",S.igst); ls.set("rb_cgstin",S.custGstin); ls.set("rb_billno",null);
    $("#cust").value=S.cust; $("#cust-mob").value=S.mob; $("#cust-gstin").value=S.custGstin;
    saveBill(); closeSheet(); setTab("bill"); toast(t("repeated")); };
  if($("#bd-edit")) $("#bd-edit").onclick=()=>startEdit(b);
  if($("#bd-repeat")){ $("#bd-repeat").onclick=()=>{ if(S.bill.length) $("#bd-rq").hidden=false; else doRepeat(); }; $("#bd-ry").onclick=doRepeat; $("#bd-rn").onclick=()=>{ $("#bd-rq").hidden=true; }; }
}
$("#t-bills").onclick=()=>{ billBackFn=openBills; openBills(); };
$("#t-dues").onclick=()=>openDues();
$("#t-custs").onclick=()=>openCustomers();
$("#t-vendors").onclick=()=>openVendors();
$("#t-reports").onclick=()=>openReports();
$("#bill-pdf").onclick=()=>pdfFor(invFromCurrent(), $("#bill-pdf"));
$("#bill-print").onclick=()=>printInv(invFromCurrent(), $("#bill-print"));

/* ---------------- Credit (udhaar) ---------------- */
let billBackFn=null, duesCache=null, duesDirty=false, duesQ="";
function billBack(){ (billBackFn||openBills)(); }
function billPayMode(b){ const pays=b.payments||[], atBill=pays.filter(p=>p.at).reduce((x,p)=>x+(+p.a||0),0), pm=String(b.paidBy||"").toLowerCase();
  const pmk=PM_KEYS[pm]?pm:"";
  if(!b.pay || b.pay==="Paid") return {pay:"paid",recv:"",pm:pmk};
  return atBill>0 ? {pay:"part",recv:String(atBill),pm:pmk} : {pay:"credit",recv:"",pm:""}; }
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
function duesSub(){ const el=$("#t-dues-sub"); if(!el) return; const c=ls.get(envKey("rb_dues_sum"),null); el.textContent = c&&c.total>0 ? (c.n>0?t("duesSum",rs(c.total),c.n):t("pendingHint",rs(c.total))) : t("duesD"); }
const daysSince=d=>d?Math.max(0,Math.floor((Date.now()-new Date(d).getTime())/864e5)):0;
const duesKey=()=>"dues:"+S.cfg.mode;
/** The Credit list as last loaded on this phone (IndexedDB), so the screen opens at once; null if none for this mode. */
async function duesLocal(){ if(duesCache && duesCache.env===S.cfg.mode) return duesCache; try{ const c=await idb.get("images",duesKey()); return c && c.env===S.cfg.mode && Array.isArray(c.customers) ? c : null; }catch{ return null; } }
/** Redraw the Credit list in place (only while it's the screen showing), keeping the search box's focus and cursor. */
function duesShow(){ if(!$("#du-body")) return; const q=$("#du-q"), had=q && document.activeElement===q, pos=had?q.selectionStart:0; renderDues();
  const n=$("#du-q"); if(had && n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch{} } }
async function loadDues(){
  const env=S.cfg.mode, j=await apiPost({action:"listDues"}); if(env!==S.cfg.mode) return j; j.env=env; duesCache=j; duesDirty=false; idb.set("images",duesKey(),j);
  ls.set(envKey("rb_dues_sum"),{total:j.total||0,n:(j.customers||[]).length}); duesSub(); return j;
}
/* ---------------- Bill page: one ✕ clears customer name, mobile and GSTIN ---------------- */
function custXSync(){ const b=$("#cust-x"); if(!b) return; const on=!!(S.cust.trim()||S.mob.trim()||String(S.custGstin||"").trim()); b.hidden=!on; $(".bh-cust").classList.toggle("has-x",on); }
function custClear(){ S.cust=""; S.mob=""; S.custGstin=""; S.custAuto=""; S.custQ="";
  ["#cust","#cust-mob","#cust-gstin"].forEach(k=>{ const el=$(k); if(el){ el.value=""; el.classList.remove("need"); } }); ["rb_cust","rb_mob","rb_cgstin"].forEach(k=>ls.set(k,""));
  const me=$("#mob-err"); if(me) me.textContent=""; const ge=$("#gstin-err"); if(ge) ge.textContent=""; sugClose(); showCustHint(null); updateBillTotals(); custXSync(); }
/** Put a customer on the bill (Customers page → "Start a bill"). A bill already in progress for someone else is kept as an open bill. */
function custFill(c){ if(S.editing && !S.editing.fresh){ toast(t("cuFinishEdit")); return false; }
  if(S.bill.length && (S.cust.trim()||S.mob.trim()) && custKey(S.mob)!==c.mob) newHeldBill();
  S.cust=c.name||""; S.custAuto=""; S.mob=c.mob; S.custGstin=c.gstin||""; $("#cust").value=S.cust; $("#cust-mob").value=S.mob; $("#cust-gstin").value=S.custGstin;
  ls.set("rb_cust",S.cust); ls.set("rb_mob",S.mob); ls.set("rb_cgstin",S.custGstin); S.custQ=""; custLookup(); updateBillTotals(); custXSync(); return true; }
/* ---------------- Customers page: list → customer → their bills (same bill view as Past bills) ---------------- */
const CU={q:"",sort:"recent",lim:150};
async function openCustomers(){
  if(!S.canWrite){ toast(t("billsNeedPin")); openUnlock(); return; }
  sheetKey("customers"), openSheet(t("cuT"), `<div id="cu-page"><div class="bl-bar"><input id="cu-q" type="search" placeholder="${esc(t("cuSearch"))}" autocomplete="off" value="${esc(CU.q)}">
      <div class="bl-chips" id="cu-sort">${["recent","top","due","az"].map(k=>`<button type="button" class="chip" data-cs="${k}" aria-pressed="${CU.sort===k}">${esc(t("cuSort_"+k))}</button>`).join("")}</div></div>
    <p class="note" id="cu-sum" style="margin:2px 2px 8px"></p><div id="cu-list">${skelCards(5,true)}</div></div>`, "", {full:true});
  $("#cu-q").oninput=e=>{ CU.q=e.target.value; CU.lim=150; cuRender(); };
  $("#cu-sort").onclick=e=>{ const b=e.target.closest("[data-cs]"); if(!b) return; CU.sort=b.dataset.cs; $("#cu-sort").querySelectorAll("[data-cs]").forEach(x=>x.setAttribute("aria-pressed",x===b)); cuRender(); };
  await custdGet(); if(CUSTD) cuRender(); custIdx=null;
  custdRefresh(true).then(()=>{ custIdx=null; if($("#cu-list")) cuRender(); }).catch(()=>{});
}
function cuAll(){ const q=CU.q.trim().toLowerCase(), qd=q.replace(/\D/g,"");
  let L=custIndex().filter(c=>!q || c.ln.includes(q) || (qd.length>=3 && c.mob.includes(qd)) || c.lg.toLowerCase().includes(q));
  const ts=c=>c.last?Date.parse(c.last)||0:0;
  L=L.slice().sort(CU.sort==="top"?(a,b)=>(b.total||0)-(a.total||0):CU.sort==="due"?(a,b)=>(b.due||0)-(a.due||0)||ts(b)-ts(a):CU.sort==="az"?(a,b)=>(a.name||a.mob).localeCompare(b.name||b.mob,"en",{sensitivity:"base"}):(a,b)=>ts(b)-ts(a));
  if(CU.sort==="due") L=L.filter(c=>c.due>0); return L; }
function cuRender(){ const el=$("#cu-list"); if(!el) return; const L=cuAll(), due=r2(L.reduce((a,c)=>a+(+c.due||0),0));
  $("#cu-sum").textContent=t("cuSummary",L.length,due>0?rs(due):"");
  if(!L.length){ el.innerHTML=`<div class="empty"><p>${esc(CU.q?t("cuNone",CU.q):t("cuEmpty"))}</p></div>`; return; }
  el.innerHTML=`<div class="bills-list" style="margin-top:0">${L.slice(0,CU.lim).map(c=>`<button type="button" class="billcard cucard" data-cm="${esc(c.mob)}"><b>${esc(c.name||("+91 "+c.mob))}</b><span class="amt num"${c.due>0?' style="color:var(--danger)"':""}>${c.due>0?esc(t("cuDue",rs(c.due))):rs(c.total||0)}</span>
      <span class="meta2">${c.name?esc(c.mob)+" · ":""}${esc(t("billsN",c.count||0))}${c.last?` · ${esc(t("cuLast",fmtShort(c.last)))}`:""}${c.gstin?` <span class="pill gst">GSTIN</span>`:""}</span></button>`).join("")}</div>
    ${L.length>CU.lim?`<button type="button" class="btn ghost" id="cu-more" style="width:100%;margin-top:8px">${esc(t("cuMore",L.length-CU.lim))}</button>`:""}`;
  el.querySelectorAll("[data-cm]").forEach(b=>b.onclick=()=>openCustomer(b.dataset.cm));
  const mo=$("#cu-more"); if(mo) mo.onclick=()=>{ CU.lim+=300; cuRender(); }; }
async function openCustomer(mob){ const c=custIndex().find(x=>x.mob===mob)||{mob,name:"",gstin:"",count:0,total:0,due:0,addr:"",note:""};
  const m=normMobile(mob), title=c.name||("+91 "+mob);
  const stat=(k,v,cls)=>`<div class="cu-stat"><span>${esc(k)}</span><b class="num${cls?" "+cls:""}">${v}</b></div>`;
  sheetKey("cust:"+mob), openSheet(title, `<div class="cu-page" style="display:grid;gap:12px"><div><button type="button" class="btn ghost" id="cu-back">← ${esc(t("cuT"))}</button></div>
    <div class="cu-card"><div class="cu-top"><div class="cu-av">${esc((c.name||"#").trim().charAt(0).toUpperCase())}</div><div style="min-width:0"><b class="cu-name">${esc(c.name||t("cuNoName"))}</b><span class="cu-mob num">+91 ${esc(mob.slice(0,5)+" "+mob.slice(5))}</span></div>
      <span class="cu-acts">${can("manager")?`<button type="button" class="iconbtn" id="cu-edit" aria-label="${esc(t("edit"))}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg></button>`:""}${m?`<a class="iconbtn" href="${esc(telHref(mob))}" aria-label="${esc(t("call"))}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg></a><a class="iconbtn" target="_blank" rel="noopener" href="https://wa.me/${esc(m)}" aria-label="WhatsApp"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.5A8.4 8.4 0 1 1 21 11.5z"/></svg></a>`:""}</span></div>
      ${c.gstin||c.addr||c.note?`<div class="cu-info">${c.gstin?`<div class="vkv"><span>GSTIN</span><b class="num">${esc(c.gstin)}</b></div>`:""}${c.addr?`<div class="vkv"><span>${esc(t("cuAddr"))}</span><span class="cu-txt">${esc(c.addr)}</span></div>`:""}${c.note?`<div class="vkv"><span>${IC.lock} ${esc(t("cuNote"))}</span><span class="cu-txt">${esc(c.note)}</span></div>`:""}</div>`:""}
    </div>
    <div class="cu-stats">${stat(t("cuBills"),fmtN(c.count||0))}${stat(t("cuTotal"),rs(c.total||0))}${stat(t("cuDueL"),rs(c.due||0),c.due>0?"bad":"")}${stat(t("cuLastL"),c.last?esc(fmtShort(c.last)):"—")}</div>
    <div class="row-btns" style="justify-content:flex-start"><button type="button" class="btn primary" id="cu-bill">${esc(t("cuStartBill"))}</button>${c.due>0?`<button type="button" class="btn ghost" id="cu-credit">${esc(t("cuSeeCredit"))}</button>`:""}</div>
    <h4 style="margin:6px 0 0">${esc(t("cuBillsH"))}</h4><div id="cu-bills">${skelCards(3,true)}</div></div>`, "", {full:true});
  $("#cu-back").onclick=()=>openCustomers();
  $("#cu-bill").onclick=()=>{ if(custFill(c)){ closeSheet(); setTab("bill"); toast(t("cuOnBill",c.name||mob)); } };
  if($("#cu-edit")) $("#cu-edit").onclick=()=>cuEdit(c);
  if($("#cu-credit")) $("#cu-credit").onclick=async()=>{ sheetKey("duec:"+mob), openSheet(t("duesT"), ldBlock(), "", {full:true}); try{ await loadDues(); }catch{} const d=(duesCache&&duesCache.customers||[]).find(x=>custKey(x.mobile)===mob); if(d) openDueCustomer(d); else openDues(); };
  cuBills(mob);
}
/** This customer's bills: from the phone's copy of Past bills (refreshed first if it's old), newest first. */
async function cuBills(mob){ const draw=C=>{ const el=$("#cu-bills"); if(!el||!C) return;
    const L=C.bills.filter(b=>custKey(b.mobile)===mob).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    if(!L.length){ el.innerHTML=`<p class="note">${esc(t("cuNoBills"))}</p>`; return; }
    el.innerHTML=`<div class="bills-list" style="margin-top:0">${L.slice(0,200).map((b,i)=>{ const d=b.date?new Date(b.date):null; return `<button type="button" class="billcard${b.cancelled?" cancelled":""}" data-ci="${i}"><b>${b.gst?"GST ":""}${esc(t("billNoL"))} ${esc(dispNo(b.n,b.gst,b.fy))}</b><span class="amt num">${rs(b.total)}</span>
      <span class="meta2">${d?esc(fmtShort(b.date)+" · "+d.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})):""}${b.gst?` <span class="pill gst">${esc(t("gstShort"))}</span>`:""}${b.editedAt?` <span class="pill edited">${esc(t("editedPill"))}</span>`:""}${b.cancelled?` <span class="pill cancel">${esc(t("cancelledPill"))}</span>`:payPill(b)}</span></button>`; }).join("")}</div>
      ${L.length>200?`<p class="note">${esc(t("cuOlder"))}</p>`:""}`;
    el.querySelectorAll("[data-ci]").forEach(x=>x.onclick=()=>{ billBackFn=()=>openCustomer(mob); showBill(L[+x.dataset.ci]); }); };
  const C=await blcGet(); if(C) draw(C);
  try{ if(!C || Date.now()-(C.at||0)>20000){ const C2=await blcRefresh(); if(C2) draw(C2); else if(!C){ const el=$("#cu-bills"); if(el) el.innerHTML=`<p class="note">${esc(t("cuBillsOld"))}</p>`; } } }
  catch{ if(!C){ const el=$("#cu-bills"); if(el) el.innerHTML=`<p class="err">${esc(t("billsFail"))}</p>`; } } }
/** Edit: name, mobile, GSTIN, address, private note. Past bills keep what was sent; a new mobile moves this customer's bills to it. */
function cuEdit(c){
  openSheet(t("cuEditT"), `<div class="form"><div><button type="button" class="btn ghost" id="ce-back">← ${esc(c.name||c.mob)}</button></div>
    <div class="field"><label for="ce-name">${esc(t("cuNameL"))}</label><input id="ce-name" value="${esc(c.name||"")}" maxlength="80" autocomplete="off"></div>
    <div class="field"><label for="ce-mob">${esc(t("mobL"))}</label><input id="ce-mob" inputmode="tel" value="${esc(c.mob)}" maxlength="20" autocomplete="off"><small class="note" id="ce-mobnote" hidden>${esc(t("cuMobMove"))}</small></div>
    <div class="field"><label for="ce-gst">GSTIN</label><input id="ce-gst" value="${esc(c.gstin||"")}" maxlength="15" autocomplete="off" style="text-transform:uppercase" placeholder="${esc(t("optional"))}"></div>
    <div class="field"><label for="ce-addr">${esc(t("cuAddr"))}</label><textarea id="ce-addr" rows="2" maxlength="200" placeholder="${esc(t("optional"))}">${esc(c.addr||"")}</textarea></div>
    <div class="field"><label for="ce-note">${IC.lock} ${esc(t("cuNote"))}</label><textarea id="ce-note" rows="2" maxlength="300" placeholder="${esc(t("cuNotePh"))}">${esc(c.note||"")}</textarea></div>
    <p class="note" style="margin:0">${esc(t("cuEditInfo"))}</p><p class="err" id="ce-err"></p></div>`,
    `<button class="btn ghost" id="ce-cancel">${esc(t("cancel"))}</button><button class="btn primary" id="ce-save">${esc(t("save"))}</button>`);
  $("#ce-back").onclick=$("#ce-cancel").onclick=()=>openCustomer(c.mob);
  $("#ce-mob").oninput=()=>{ $("#ce-mobnote").hidden=custKey($("#ce-mob").value)===c.mob; };
  $("#ce-save").onclick=async()=>{ const err=$("#ce-err"); err.textContent=""; const nm=custKey($("#ce-mob").value), g=$("#ce-gst").value.trim().toUpperCase();
    if(!nm){ err.textContent=t("mobBad"); return; } if(g && !gstinOk(g)){ err.textContent=t("gstinBad"); return; }
    if(navigator.onLine===false){ err.textContent=t("vNeedNet"); return; }
    const b=$("#ce-save"); btnBusy(b,true);
    try{ const r=await apiPost({action:"saveCustomer",customer:{mobile:c.mob,newMobile:nm,name:$("#ce-name").value.trim(),gstin:g,address:$("#ce-addr").value.trim(),note:$("#ce-note").value.trim()}});
      const cc=custCache(); delete cc[c.mob]; if(nm!==c.mob) delete cc[nm]; ls.set(envKey("rb_customers"),cc); custLV++;
      await custdRefresh(true); custIdx=null; if(r.moved){ try{ await blcRefresh(); }catch{} }   /* bills now carry the new number */
      toast(r.moved?t("cuMoved",r.moved):t("saved")); openCustomer(nm); }
    catch(e){ btnBusy(b,false); err.textContent=e&&e.code==="bad_gstin"?t("gstinBad"):e&&e.code==="bad_mobile"?t("mobBad"):e&&e.code==="not_allowed"?t("notAllowed"):errMsg(e); } };
}
async function openDues(){
  if(!S.canWrite){ toast(t("billsNeedPin")); openUnlock(); return; }
  sheetKey("dues"), openSheet(t("duesT"), `<div id="du-body">${skelCards(4,true)}</div>`, "", {full:true});
  const have=await duesLocal(); if(have){ duesCache=have; duesShow(); }   // the saved list at once; the fresh one replaces it below
  try{ await loadDues(); } catch(e){ const el=$("#du-body"); if(el && !have) el.innerHTML=`<p class="err">${esc(e&&e.code==="bad_pin"?t("wrongPin"):t("billsFail"))}</p>`; return; }
  duesShow();
}
function renderDues(){
  const box=$("#du-body"); if(!box||!duesCache) return;
  const j=duesCache, list=j.customers||[];
  if(!list.length){ box.innerHTML=`<div class="empty"><h2>${esc(t("duesNone"))}</h2><p>${esc(t("duesTabHint"))}</p></div>`; return; }
  box.innerHTML=`<div style="display:grid;gap:10px">
    <div class="dues-sum"><b class="num">${rs(j.total)}</b><span>${esc(t("duesFrom",list.length,j.bills))}</span></div>
    <input id="du-q" type="search" placeholder="${esc(t("duesSearch"))}" autocomplete="off" value="${esc(duesQ)}" style="width:100%;border:1.5px solid var(--line);background:var(--bg);border-radius:var(--r-md);padding:10px 12px;font-size:16px;color:var(--fg)">
    <div class="bills-list" id="du-list" style="margin-top:0"></div></div>`;
  const draw=()=>{ const q=duesQ.trim().toLowerCase(), dq=q.replace(/\D/g,"");
    const rows=list.map((c,i)=>({c,i})).filter(({c})=>!q || (c.name||"").toLowerCase().includes(q) || (dq.length>=3 && (c.mobile||"").includes(dq)));
    $("#du-list").innerHTML = rows.map(({c,i})=>{ const days=daysSince(c.oldest);
      return `<button type="button" class="duecard" data-dc="${i}"><span class="av">${esc((c.name||"?").trim().charAt(0).toUpperCase())}</span><b>${esc(c.name||c.mobile||"?")}</b><span class="amt num">${rs(c.due)}</span>
        <span class="m">${esc(c.mobile||"")}${c.mobile?" · ":""}${esc(t("billsN",c.bills.length))}</span><span class="age${days>30?" old":""}">${esc(t("since",fmtShort(c.oldest),days))}</span></button>`; }).join("") || `<p class="note">${esc(t("billsNone"))}</p>`; };
  draw();
  $("#du-q").addEventListener("input",e=>{ duesQ=e.target.value; draw(); });
  $("#du-list").addEventListener("click",e=>{ const c=e.target.closest("[data-dc]"); if(c) openDueCustomer(list[+c.dataset.dc]); });
}
const fmtShort=d=>d?new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short"}):"";
/** "PP Bag 200 Gauge 1 kg x 220 [HSN 3923, 18%]; Drone 1 pc x 8" → readable lines with each line's amount. */
function itemLinesText(items){
  return String(items||"").split("; ").filter(Boolean).map((part,i)=>{ const x=part.replace(/\s*\[[^\]]*\]\s*$/,""); const m=x.match(/^(.*) ([\d.]+) (\S+) x ([\d.]+)$/);
    return m ? `   ${i+1}. ${m[1]} — ${qtyText(+m[2],m[3],true)} × ${rs(+m[4])}${isPart(+m[2],m[3])?"/"+m[3]:""} = ${rs(r2(+m[2]*+m[4]))}` : `   ${i+1}. ${x}`; }).join("\n");
}
function remindText(c){
  const blocks=c.bills.map(b=>{ const head=`*${b.gst?"GST ":""}Bill No. ${b.n}* · ${fmtDate(b.date)}`;
    const items=itemLinesText(b.items);
    const tot=`Total ${rs(b.total)}${b.gst?" (incl. GST)":""}`, money=b.paid>0 ? `   ${tot} · Paid ${rs(b.paid)} · *Due ${rs(b.due)}*` : `   ${tot} · *Due ${rs(b.due)}*`;
    return [head, items, money].filter(Boolean).join("\n"); }).join("\n\n");
  return STR.en.remindMsg(c.name||"",S.cfg.shopName,rs(c.due),blocks);
}
function openDueCustomer(c){
  const m=normMobile(c.mobile||"");
  const body=`<div style="display:grid;gap:12px">
    <div><button type="button" class="btn ghost" id="dc-back">← ${esc(t("back"))}</button></div>
    <div class="dues-sum"><b class="num">${rs(c.due)}</b><span>${esc(c.mobile||"")}${c.mobile?" · ":""}${esc(t("billsN",c.bills.length))} · ${esc(t("since",fmtShort(c.oldest),daysSince(c.oldest)))}</span></div>
    <div class="row-btns" style="justify-content:flex-start">
      <button type="button" class="btn primary" id="dc-pay">${esc(t("recordPay"))}</button>
      ${m?`<a class="btn wa" id="dc-wa" target="_blank" rel="noopener" href="${esc(`https://wa.me/${m}?text=${encodeURIComponent(remindText(c))}`)}">${esc(t("remind"))}</a><a class="btn ghost" href="${esc(telHref(c.mobile))}">${esc(t("call"))}</a>`:""}
    </div>
    <div class="bills-list" style="margin-top:0">${c.bills.map((b,i)=>`<button type="button" class="billcard" data-db="${i}"><b>${b.gst?"GST ":""}${esc(t("billNoL"))} ${esc(b.n)} · ${esc(fmtShort(b.date))}</b><span class="amt num" style="color:var(--danger)">${rs(b.due)}</span>
      <span class="meta2">${esc(t("ofTotal",rs(b.paid),rs(b.total)))}${payPill(b)}</span></button>`).join("")}</div></div>`;
  sheetKey("duec:"+(c.mobile||c.name)), openSheet(c.name||c.mobile||t("duesT"), body, "", {full:true});
  $("#dc-back").onclick=()=>{ if(duesDirty) openDues(); else { sheetKey("dues"), openSheet(t("duesT"), `<div id="du-body"></div>`, "", {full:true}); renderDues(); } };
  $("#dc-pay").onclick=()=>openRecordPay(c);
  $("#sheet-body").querySelectorAll("[data-db]").forEach(el=>el.onclick=()=>{ const b=c.bills[+el.dataset.db]; billBackFn=()=>backToCustomer(c); showBill({...b, customer:c.name, mobile:c.mobile}); });
}
/** Record money received: for one bill (c.bill) or across the customer's open bills, oldest first. */
async function backToCustomer(c){
  if(!duesDirty){ openDueCustomer(c); return; }
  sheetKey("duec:"+(c.mobile||c.name)), openSheet(c.name||t("duesT"), ldBlock(), "", {full:true});
  try{ await loadDues(); }catch{}
  const again=(duesCache&&duesCache.customers||[]).find(x=>x.mobile===c.mobile && (x.mobile || x.name===c.name)); if(again) openDueCustomer(again); else openDues();
}
function openRecordPay(c){
  const due=r2(c.bill?(+c.bill.due||0):c.due), bills=c.bill?[c.bill]:c.bills;
  let note="";
  const body=`<div class="form">
    <div class="dues-sum"><b class="num">${rs(due)}</b><span>${esc(c.name||"")}${c.mobile?` · ${esc(c.mobile)}`:""}${c.bill?` · ${esc(t("billNoL"))} ${esc(c.bill.n)}`:""}</span></div>
    <div class="field"><label for="rp-amt">${esc(t("payAmt"))}</label><input id="rp-amt" class="num money" inputmode="decimal" value="${esc(moneyText(String(due)))}" style="font-size:22px;font-weight:700"></div>
    <div class="chips" id="rp-quick"><button type="button" data-q="${due}">${esc(t("fullAmt",rs(due)))}</button>${due>=2?`<button type="button" data-q="${r2(due/2)}">½ · ${rs(r2(due/2))}</button>`:""}</div>
    <div class="field"><label>${esc(t("payNote"))}</label><div class="chips" id="rp-note"><button type="button" data-n="Cash">Cash</button><button type="button" data-n="UPI">UPI</button><button type="button" data-n="Bank">Bank</button><button type="button" data-n="Cheque">Cheque</button></div></div>
    <div class="preview" id="rp-prev"></div>
    <div class="err" id="rp-err"></div></div>`;
  openSheet(t("recordPay"), body, `<button class="btn ghost" id="rp-cancel">${esc(t("cancel"))}</button><button class="btn primary" id="rp-save"></button>`);
  const prev=()=>{ const a=toNum($("#rp-amt").value); const ok=!isNaN(a)&&a>0;
    $("#rp-save").textContent=t("paySave",rs(ok?Math.min(a,due):0)); $("#rp-save").disabled=!ok;
    if(!ok){ $("#rp-prev").innerHTML=""; return; }
    let left=a; const out=[];
    for(const b of bills){ if(left<=0) break; const take=Math.min(+b.due||0,left); left=r2(left-take); const rest=r2((+b.due||0)-take); out.push(rest>0?t("leavesBill",b.n,rs(rest)):t("clearsBill",b.n)); }
    $("#rp-prev").innerHTML=`<span>${esc(t("payPreview"))}</span>`+out.map(x=>`<span>• ${esc(x)}</span>`).join("")+(left>0?`<span style="color:var(--gold)">${esc(t("payMore",rs(left)))}</span>`:""); };
  $("#rp-amt").addEventListener("input",prev); prev();
  $("#rp-quick").onclick=e=>{ const b=e.target.closest("[data-q]"); if(b){ moneySet($("#rp-amt"),b.dataset.q); prev(); } };
  $("#rp-note").onclick=e=>{ const b=e.target.closest("[data-n]"); if(!b) return; note = note===b.dataset.n ? "" : b.dataset.n; $("#rp-note").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x.dataset.n===note)); };
  $("#rp-cancel").onclick=()=>{ if(c.bill) showBill(c.bill); else backToCustomer(c); };
  $("#rp-save").onclick=async()=>{ const a=toNum($("#rp-amt").value); if(isNaN(a)||a<=0) return;
    const btn=$("#rp-save"); btnBusy(btn,true);
    try{ const req={action:"recordPayment",amount:Math.min(a,due),note};
      if(c.bill){ req.billId=c.bill.id; req.row=c.bill.row; req.n=c.bill.n; } else req.mobile=c.mobile;
      const r=await apiPost(req); toast(t("payDone",rs(r.used),r.cleared)); duesDirty=true;
      const ck=custKey(c.mobile); if(ck){ const cc=custCache(); if(cc[ck]){ cc[ck].due=r2(Math.max(0,(+cc[ck].due||0)-r.used)); ls.set(envKey("rb_customers"),cc); } }
      if(c.bill){ const b=c.bill; const pays=(b.payments||[]).concat([{d:new Date().toISOString(),a:r.used,by:byName(),note}]); const paid=r2((+b.paid||0)+r.used), dd=r2(Math.max(0,(+b.total||0)-paid));
        Object.assign(b,{payments:pays,paid,due:dd,pay:dd>0?"Part paid":"Cleared",clearedAt:dd>0?"":new Date().toISOString()}); showBill(b); loadDues().catch(()=>{}); }
      else { await loadDues().catch(()=>{}); const again=(duesCache&&duesCache.customers||[]).find(x=>x.mobile===c.mobile); if(again) openDueCustomer(again); else openDues(); }
    }catch(e){ btnBusy(btn,false); $("#rp-err").textContent=e&&e.code==="bad_pin"?t("wrongPin"):t("payFail"); } };
}
$("#t-hindi").onclick=()=>openToHindi();
$("#t-groups").onclick=()=>openGroups();
function openToHindi(){
  let onlyMissing=false;
  const rows=()=>S.items.filter(it=>!onlyMissing || !it.nameHi).map(it=>({it, hi:toHindi(it.name)}));
  let data=rows(); const sel=new Set(data.map(r=>r.it.id)); const edits={};
  const body=`<p class="note" style="margin:0 0 8px">${esc(t("toHindiHelp"))}</p>
    <label class="note" style="display:flex;gap:6px;align-items:center;margin-bottom:8px"><input type="checkbox" id="th-only"> ${esc(t("onlyMissing"))}</label>
    <div class="gridwrap"><table class="g"><thead><tr><th style="width:36px"><input type="checkbox" id="th-all" checked aria-label="All"></th><th>${esc(t("item"))}</th><th>${esc(t("hiName"))}</th></tr></thead><tbody id="th-body"></tbody></table></div>
    <p class="note" id="th-prog"></p>`;
  openSheet(t("toHindiT"), body, `<button class="btn ghost" id="th-cancel">${esc(t("cancel"))}</button><button class="btn primary" id="th-save"></button>`, {full:true});
  const tb=$("#th-body");
  const count=()=>[...sel].filter(id=>{ const it=S.byId.get(id); const v=(edits[id]??toHindi(it.name)).trim(); return v && v!==it.nameHi; }).length;
  const upd=()=>{ const n=count(); const b=$("#th-save"); b.textContent=n?t("convertN",n):t("hiNone"); b.disabled=!n; };
  const draw=()=>{ tb.innerHTML=data.map(r=>`<tr><td><input type="checkbox" data-sel="${esc(r.it.id)}" ${sel.has(r.it.id)?"checked":""} aria-label="Select"></td>
      <td class="c-name">${esc(r.it.name)}${r.it.nameHi?`<span class="tag" style="color:var(--muted)">${esc(t("current"))}: ${esc(r.it.nameHi)}</span>`:""}</td>
      <td class="c-name"><input id="th-${esc(r.it.id)}" data-hid="${esc(r.it.id)}" lang="hi" value="${esc(edits[r.it.id]??r.hi)}"></td></tr>`).join(""); upd(); };
  tb.addEventListener("input",e=>{ const id=e.target.dataset.hid; if(id){ edits[id]=e.target.value; upd(); } });
  tb.addEventListener("change",e=>{ const id=e.target.dataset.sel; if(id){ e.target.checked?sel.add(id):sel.delete(id); upd(); } });
  $("#th-all").onchange=e=>{ data.forEach(r=>e.target.checked?sel.add(r.it.id):sel.delete(r.it.id)); draw(); };
  $("#th-only").onchange=e=>{ onlyMissing=e.target.checked; data=rows(); sel.clear(); data.forEach(r=>sel.add(r.it.id)); draw(); };
  $("#th-cancel").onclick=sheetCancel;
  $("#th-save").onclick=async()=>{ if(navigator.onLine===false){ toast(t("offlineWrite")); return; }
    const recs=[...sel].map(id=>{ const it=S.byId.get(id); const v=(edits[id]??toHindi(it.name)).trim(); return v && v!==it.nameHi ? {id, nameHi:v} : null; }).filter(Boolean);
    if(!recs.length) return; $("#th-save").disabled=true;
    try{ for(let i=0;i<recs.length;i+=100){ const part=recs.slice(i,i+100); const j=await write({action:"upsert",items:part}); mergeSaved(j.items); const p=$("#th-prog"); if(p) p.textContent=t("savingN",Math.min(i+100,recs.length),recs.length); }
      if(SHEET_STK.length) sheetBack(); else closeSheet(); toast(t("savedN",recs.length)); resyncSoon(); }
    catch{ const b=$("#th-save"); if(b) b.disabled=false; } };
  draw();
}
$("#fab").onclick=()=>openEdit(null);
$("#cmd-open").onclick=()=>openCmd("");
$("#t-cmd").onclick=()=>openCmd("");
$("#t-add").onclick=()=>openEdit(null);
$("#t-bulkadd").onclick=()=>openBulkAdd();
$("#t-bulkedit").onclick=()=>openBulkEdit();
$("#t-settings").onclick=()=>openSettings();

/* ---------------- Unlock / lock ---------------- */
function openUnlock(){ appLock(); }
/* ---------------- Sign-in and app lock ----------------
 * Signing in (PIN, online) gets a token from the sheet. The phone keeps the token, never the PIN, plus a PBKDF2 check value
 * (pinH/pinS) so the lock screen works offline. The app locks on every fresh open and after LOCK_MS in the background; while
 * locked nothing shows (html.locked hides everything but #applock), but bills waiting to send still go. Fingerprint/face uses
 * the phone's own unlock (WebAuthn, platform authenticator) as a local gate; the token stays the real credential. */
const LOCK_MS=5*60000, LOCK={on:false, fails:ls.get("rb_lockfail",{n:0,until:0})};
const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u))), unb64=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
async function pinHash(pin,salt){ const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:unb64(salt),iterations:150000},k,256)); }
async function pinCheckSet(pin){ const pinS=b64(crypto.getRandomValues(new Uint8Array(16))); return {pinS, pinH:await pinHash(pin,pinS)}; }
function devLabel(){ const u=navigator.userAgent, os=/iPhone|iPad/.test(u)?"iPhone":/Android/.test(u)?"Android":/Mac/.test(u)?"Mac":/Windows/.test(u)?"Windows":"Phone",
  br=/EdgA?\//.test(u)?"Edge":/SamsungBrowser/.test(u)?"Samsung":/CriOS|Chrome/.test(u)?"Chrome":/Firefox|FxiOS/.test(u)?"Firefox":/Safari/.test(u)?"Safari":"";
  return (os+(br?" · "+br:"")+(isStandalone()?" · app":"")).slice(0,60); }
const bioAvail=async()=>{ try{ return !!(window.PublicKeyCredential && isSecureContext && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }catch{ return false; } };
async function bioRegister(){ const nm=(S.auth&&S.auth.by)||"Rate Book";
  const c=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)), rp:{name:"Rate Book"}, user:{id:crypto.getRandomValues(new Uint8Array(16)), name:nm, displayName:nm},
    pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}], authenticatorSelection:{authenticatorAttachment:"platform",userVerification:"required",residentKey:"discouraged"}, timeout:60000, attestation:"none"}});
  S.auth={...S.auth,bio:b64(c.rawId)}; ls.set("rb_auth",S.auth); ls.set("rb_bio_"+(S.auth.by||""),S.auth.bio); }
async function bioCheck(){ await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)), allowCredentials:[{type:"public-key",id:unb64(S.auth.bio)}], userVerification:"required", timeout:60000}}); }
function lockEl(){ let el=$("#applock"); if(!el){ el=document.createElement("div"); el.id="applock"; el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true"); el.hidden=true; document.body.appendChild(el); } return el; }
function lockInert(on){ for(const c of document.body.children){ if(c.id!=="applock" && c.id!=="toast" && c.id!=="updpill"){ if(on) c.setAttribute("inert",""); else c.removeAttribute("inert"); } } }
/** Lock the app (or show sign-in when nobody is signed in on this phone). */
function appLock(msg){ LOCK.on=true; document.documentElement.classList.add("locked"); lockInert(true); const el=lockEl(); el.hidden=false; if(!el.dataset.lw){ el.dataset.lw=1; el.addEventListener("click",e=>{ const b=e.target.closest("[data-al-lang]"); if(!b) return; S.lang=b.dataset.alLang; ls.set("rb_lang",S.lang); applyLang(); if(LOCK.re) LOCK.re(); else el.querySelectorAll("[data-al-lang]").forEach(x=>x.setAttribute("aria-pressed",x===b)); }); } el.classList.add("al-enter"); setTimeout(()=>el.classList.remove("al-enter"),900);
  if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if(S.canWrite && S.auth.pending) pendingUI(msg); else if(S.canWrite && (S.auth.pinH || S.auth.pin || S.auth.bio)) lockPinUI(msg); else signInUI(msg); }
/** Signed in, but the owner hasn't approved this phone yet: nothing opens; checks again every 15 s. */
function pendingUI(msg){ LOCK.re=null; const el=lockEl(); let tm=0;
  el.innerHTML=`<div class="al-box">${lockHead()}<div class="al-hi" style="font-size:18px;color:var(--fg);font-weight:700">${esc(t("pendT"))}</div><p class="note" style="margin:0">${esc(t("pendD",S.cfg.shopName||"this shop"))}</p>
    <button type="button" class="al-bio" id="al-pchk">${esc(t("pendCheck"))}</button><div class="al-err" id="al-err" role="alert">${esc(msg||"")}</div><button type="button" class="al-link" id="al-other">${esc(t("alOther",S.auth.by||""))}</button></div>`;
  const check=async(quiet)=>{ if(!$("#al-pchk")) return; clearTimeout(tm);
    try{ await apiPost0({action:"verify"}); S.auth={...S.auth}; delete S.auth.pending; ls.set("rb_auth",S.auth); bootTried=false; sync(); afterPinUnlock(); return; }
    catch(e){ if(!quiet && $("#al-err")) $("#al-err").textContent=errMsg(e); }
    tm=setTimeout(()=>check(true),15000); };
  $("#al-pchk").onclick=()=>check(false); $("#al-other").onclick=()=>{ if(confirm(t("signOutQ"))) lockPhone(); };
  tm=setTimeout(()=>check(true),15000); }
function appUnlock(){ if(S.canWrite) shopRemember({code:SHOP.code, name:S.cfg.shopName||"", api:SHOP_MAIN?"":SHOP.api}); LOCK.on=false; LOCK.fails={n:0,until:0}; ls.set("rb_lockfail",LOCK.fails); lockEl().hidden=true; lockEl().innerHTML=""; lockInert(false);
  document.documentElement.classList.remove("locked"); renderAll(); if(S.pendShare) setTimeout(askSent,400); }
/** Signed out (here, remotely, or after too many wrong PINs): forget the token and ask to sign in. */
function signedOut(msgKey){ S.auth=null; ls.set("rb_auth",null); S.canWrite=false; applyPrefs(); appLock(msgKey?t(msgKey):""); }
let SHOP_ASK_FAIL="";
/* App mark (white ₹ tag on Iris), the same in light and dark: the brand colour doesn't change with the theme. */
const APP_MARK=`<svg class="al-mark" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="14" fill="#4F46E5"/><g transform="translate(24 24) scale(1) translate(-24 -24)"><path d="M7 24 19.5 11.5H41v25H19.5z" fill="#fff"/><circle cx="17" cy="24" r="2.6" fill="#4F46E5"/><g fill="#4F46E5"><path transform="translate(24.627 31) scale(0.009396 -0.009396)" d="M1118 1115H910C901 1174 883 1227 855 1273L1063 1274L1119 1490H142L78 1207H347C450 1207 513 1172 545 1115H132L78 903H556C526 828 458 774 347 774H106L105 575L592 0H966V14L536 542L550 548C761 612 873 722 906 903H1063Z"/></g></g></svg>`;
function lockHead(){ return `<div class="al-lang" role="group" aria-label="Language"><button type="button" data-al-lang="en" aria-pressed="${S.lang!=="hi"}">EN</button><button type="button" data-al-lang="hi" aria-pressed="${S.lang==="hi"}" lang="hi">हि</button></div>${APP_MARK}<div class="al-shop">${esc(SHOP_ASK_FAIL && !S.canWrite ? t("shopCodeT",SHOP_ASK_FAIL) : (S.cfg.shopName||(SHOP_MAIN?"":SHOP.name)||"Rate Book"))}</div>`; }
/** "Switch shop": only on a phone that is already signed in to more than one shop (e.g. the admin supporting a shop). */
function shopSwitchList(){ const here=SHOP.code, L=shopsKnown().filter(x=>x.code!==here && shopSignedIn(x.code)); return L; }
function shopSwitchHTML(){ const L=shopSwitchList(); if(!L.length) return "";
  return `<div class="al-shopbox"><b style="font-size:13px;color:var(--muted)">${esc(t("shopSwitchT"))}</b>${L.map(x=>`<button type="button" class="btn ghost" data-shopgo="${esc(x.code)}">${esc(t("shopSwitch"))}: ${esc(x.name||x.code)}</button>`).join("")}</div>`; }
/** "Different shop? Enter its shop code": on the sign-in screen, and on the lock screen for owners only (the admin supporting a
    shop keeps this sign-in; the other shop still needs its own PIN). Staff phones never see it while signed in. */
function shopCodeHTML(signin){ if(!DIR_URL || (!signin && myRole()!=="owner")) return "";
  return `<div class="al-shopbox"><button type="button" class="al-link" id="al-shopq">${esc(t("shopOther"))}</button>
    <form class="al-form" id="al-sf" hidden novalidate><input id="al-scode" placeholder="${esc(t("shopCodePh"))}" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="40">
    <button type="submit" class="btn ghost" id="al-sgo">${esc(t("shopGoBtn"))}</button></form></div>`; }
function shopCodeWire(){ if(!$("#al-shopq")) return;
  $("#al-shopq").onclick=()=>{ $("#al-sf").hidden=false; $("#al-shopq").hidden=true; $("#al-scode").focus(); };
  $("#al-sf").onsubmit=async e=>{ e.preventDefault(); const code=$("#al-scode").value.trim().toUpperCase().replace(/[^A-Z0-9-]/g,""), err=$("#al-err"); if(!code) return;
    if(navigator.onLine===false){ err.textContent=t("siNet"); return; } btnBusy($("#al-sgo"),true);
    try{ const sh=code==="MAIN"?{code:"main"}:await dirLookup(code); if(sh.code===SHOP.code){ btnBusy($("#al-sgo"),false); $("#al-sf").hidden=true; return; } shopGo(sh); }
    catch(er){ btnBusy($("#al-sgo"),false); err.textContent=errMsg(er); } }; }
function shopSwitchWire(){ document.querySelectorAll("#applock [data-shopgo]").forEach(b=>b.onclick=()=>{ const x=shopsKnown().find(y=>y.code===b.dataset.shopgo); if(x) shopGo(x); }); }
/** Paused shop (subscription): say so once per app start; bills stay queued on the phone, nothing is lost. */
let pausedSaid=false; function shopPausedNote(){ if(pausedSaid) return; pausedSaid=true; S.paused=true; setTimeout(()=>toast(t("pausedNote")),300); }
/** The shop link (?shop=CODE): honoured only when this phone isn't signed in to another shop (or already holds a sign-in there). */
async function shopFromLink(){ if(!SHOP_ASK || SHOP_ASK===SHOP.code) return "";
  if(S.canWrite && !shopSignedIn(SHOP_ASK) && myRole()!=="owner") return t("shopBusy", S.cfg.shopName||SHOP.name||"another shop");   // staff phones stay in their shop
  if(SHOP_ASK==="main"){ shopGo({code:"main"}); return ""; }
  try{ const known=shopsKnown().find(x=>x.code===SHOP_ASK && x.api); shopGo(known && shopSignedIn(SHOP_ASK) ? known : await dirLookup(SHOP_ASK)); return ""; }
  catch(e){ if(!S.canWrite){ SHOP_ASK_FAIL=SHOP_ASK; const h=$("#applock .al-shop"); if(h) h.textContent=t("shopCodeT",SHOP_ASK);
      if($("#al-sf")){ $("#al-sf").hidden=false; if($("#al-shopq")) $("#al-shopq").hidden=true; $("#al-scode").value=SHOP_ASK; } }
    return errMsg(e); } }
/** Non-main shops: re-check the backend link with the Directory once a day (in case it moved); learn if the shop is paused. */
function shopRefresh(){ if(SHOP_MAIN || !DIR_URL || Date.now()-(+SHOP.at||0)<864e5) return;
  dirLookup(SHOP.code).then(sh=>{ if(sh.api) SHOP.api=sh.api; SHOP.name=sh.name||SHOP.name; SHOP.at=Date.now(); try{ localStorage.setItem("rb_shop",JSON.stringify(SHOP)); }catch{} shopRemember(SHOP); if(sh.status==="paused") shopPausedNote(); }).catch(()=>{}); }
/** Same person? Names compared without case or extra spaces. */
const samePerson=(a,b)=>String(a||"").trim().replace(/\s+/g," ").toLowerCase()===String(b||"").trim().replace(/\s+/g," ").toLowerCase();
function lockPinUI(msg){ LOCK.re=()=>lockPinUI(); const el=lockEl(), a=S.auth, pinLen=()=>(S.auth&&(S.auth.pinLen||(S.auth.pin||"").length))||0; let pin="";
  el.innerHTML=`<div class="al-box">${lockHead()}<div class="al-av">${esc((a.by||"?").charAt(0).toUpperCase())}</div><div class="al-hi">${esc(t("alHello",a.by||""))}</div>
    <div id="al-biobox"></div><div class="al-hi" id="al-lbl">${esc(t("alPin"))}</div><div class="al-dots" id="al-dots"></div><div class="al-err" id="al-err" role="alert">${esc(msg||"")}</div>
    <div class="al-pad" id="al-pad">${[1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-k="${n}">${n}</button>`).join("")}<button type="button" data-k="del" aria-label="Delete">⌫</button><button type="button" data-k="0">0</button><button type="button" class="al-ok" data-k="ok">OK</button></div>
    <button type="button" class="al-link" id="al-other">${esc(t("alOther",a.by||""))}</button><p class="note" style="margin:0;font-size:12px">${esc(t("alForgot",a.by||""))}</p>${shopSwitchHTML()}${shopCodeHTML()}</div>`;
  shopSwitchWire(); shopCodeWire();
  const dots=()=>{ const n=Math.max(pinLen()||4,pin.length); $("#al-dots").innerHTML=Array.from({length:n},(_,i)=>`<i class="${i<pin.length?"on":""}"></i>`).join(""); };
  const wait=()=>{ const left=Math.ceil((LOCK.fails.until-Date.now())/1000); if(left>0){ $("#al-err").textContent=t("alWait",left); return true; } return false; };
  /* At the signed-in PIN's length, check quietly on the phone: a match opens at once; otherwise keep taking digits
     (another person's PIN may be longer) until OK. */
  const quick=async()=>{ if(wait()) return; const A=S.auth||{}, p0=pin; let good=false; try{ good = A.pinH ? (await pinHash(p0,A.pinS))===A.pinH : p0===A.pin; }catch{}
    if(good && pin===p0){ check(); } };
  const check=async()=>{ if(pin.length<4 || wait()) return; const try_=pin; pin=""; dots();
    const A=S.auth||{}; let good=false; try{ good = A.pinH ? (await pinHash(try_,A.pinS))===A.pinH : try_===A.pin; }catch{}   /* S.auth may have switched to a token meanwhile */
    if(good){ if(A.pin && !A.pinH){ Object.assign(S.auth, await pinCheckSet(try_)); S.auth.pinLen=try_.length; ls.set("rb_auth",S.auth); } afterPinUnlock(); return; }
    /* Not the PIN saved on this phone. The lock screen only ever opens for the person shown on it: online, ask the sheet whose
       PIN it is, and accept it only if it's this same person's own PIN (e.g. they set a personal PIN after signing in with the
       shop PIN). Anyone else's PIN is a wrong PIN here; changing person is the "Not X? Switch person" step below. */
    if(navigator.onLine!==false && A.by){ $("#al-err").innerHTML=LD("sm");
      try{ const j=await apiPost0({action:"verify",tok:"",pin:try_,by:A.by}); const me=j.me||{};
        if(me.personal && samePerson(me.name,A.by)){ const k=await apiPost0({action:"verify",tok:"",pin:try_,by:A.by,wantTok:true,dl:devLabel()}); await adoptSignIn(k,try_,A.by); afterPinUnlock(); return; }
        $("#al-err").textContent=""; }
      catch(e){ $("#al-err").textContent=""; if(e&&e.code==="locked"){ $("#al-err").textContent=t("lockedOut"); return; } } }
    LOCK.fails.n++; if(LOCK.fails.n>=5) LOCK.fails.until=Date.now()+30000*Math.pow(2,LOCK.fails.n-5); ls.set("rb_lockfail",LOCK.fails);
    if(LOCK.fails.n>=10){ LOCK.fails={n:0,until:0}; ls.set("rb_lockfail",LOCK.fails); lockPhone(); $("#al-err") && ($("#al-err").textContent=t("alOut")); return; }
    const box=$(".al-box"); box.classList.remove("al-shake"); void box.offsetWidth; box.classList.add("al-shake"); try{ navigator.vibrate&&navigator.vibrate(60); }catch{}
    if(!wait()) $("#al-err").textContent=t("alWrong",10-LOCK.fails.n); };
  $("#al-pad").onclick=e=>{ const b=e.target.closest("[data-k]"); if(!b) return; const k=b.dataset.k;
    if(k==="del") pin=pin.slice(0,-1); else if(k==="ok"){ check(); return; } else if(pin.length<8){ pin+=k; if(pinLen() && pin.length===pinLen()){ dots(); quick(); return; } } dots(); };
  el.onkeydown=e=>{ if(/^\d$/.test(e.key)){ $(`#al-pad [data-k="${e.key}"]`).click(); } else if(e.key==="Backspace") $('#al-pad [data-k="del"]').click(); else if(e.key==="Enter") $('#al-pad [data-k="ok"]').click(); };
  $("#al-other").onclick=()=>{ if(confirm(t("alOtherQ",a.by||""))) lockPhone(); };
  dots(); wait(); el.tabIndex=-1; el.focus();
  if(a.bio) bioAvail().then(ok=>{ if(!ok || !$("#al-biobox")) return; $("#al-biobox").innerHTML=`<button type="button" class="al-bio" id="al-bio"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 11v3M8.5 8.5a5 5 0 0 1 7 0M6 6a8.5 8.5 0 0 1 12 0M9 14c0 3 1 5 2 6M15 13c0 3-.5 5-1.5 7"/></svg>${esc(t("alBio"))}</button>`;
    const go=async()=>{ try{ await bioCheck(); appUnlock(); }catch{ const er=$("#al-err"); if(er && LOCK.on) er.textContent=t("bioFail"); } };
    $("#al-bio").onclick=go; if(!/iPhone|iPad/.test(navigator.userAgent) && document.visibilityState==="visible") go(); }); }
/** After a PIN unlock: offer fingerprint once per person per phone, then open. */
async function afterPinUnlock(){ const a=S.auth; if(a && a.pending){ pendingUI(); return; }
  shopRemember({code:SHOP.code, name:S.cfg.shopName||"", api:SHOP_MAIN?"":SHOP.api}); if(a.bio || ls.get("rb_bio_no_"+(a.by||""),false) || !(await bioAvail())){ appUnlock(); return; }
  const el=lockEl(); el.innerHTML=`<div class="al-box">${lockHead()}<div class="al-hi" style="font-size:18px;color:var(--fg)">${esc(t("bioAsk"))}</div>
    <button type="button" class="al-bio" id="al-by">${esc(t("bioYes"))}</button><button type="button" class="al-link" id="al-bn">${esc(t("bioNo"))}</button><div class="al-err" id="al-err"></div></div>`;
  $("#al-by").onclick=async()=>{ try{ await bioRegister(); appUnlock(); }catch{ $("#al-err").textContent=t("bioFail"); setTimeout(appUnlock,1200); } };
  $("#al-bn").onclick=()=>{ ls.set("rb_bio_no_"+(a.by||""),true); appUnlock(); }; }
function signInUI(msg){ LOCK.re=()=>{ const n=$("#al-name"), p=$("#al-pin"), nv=n&&n.value, pv=p&&p.value; signInUI(); if(n) $("#al-name").value=nv; if(p) $("#al-pin").value=pv; }; const el=lockEl();
  el.innerHTML=`<div class="al-box">${lockHead()}<div class="al-hi" style="font-size:18px;color:var(--fg);font-weight:700">${esc(t("siT"))}</div><p class="note" style="margin:0">${esc(t("siD"))}</p>
    <form class="al-form" id="al-f" novalidate><input id="al-name" placeholder="${esc(t("siName"))}" autocomplete="name" value="${esc(ls.get("rb_name",""))}" enterkeyhint="next" aria-label="${esc(t("siName"))}">
    <input id="al-pin" type="password" inputmode="numeric" maxlength="8" placeholder="${esc(t("siPin"))}" autocomplete="current-password" enterkeyhint="go" aria-label="${esc(t("siPin"))}">
    <button type="submit" class="btn primary" id="al-go">${esc(t("siBtn"))}</button></form><div class="al-err" id="al-err" role="alert">${esc(msg||"")}</div>
    ${shopSwitchHTML()}${shopCodeHTML(true)}</div>`;
  shopSwitchWire(); shopCodeWire();
  $("#al-f").onsubmit=async e=>{ e.preventDefault(); const by=$("#al-name").value.trim(), pin=$("#al-pin").value.trim(), err=$("#al-err");
    if(!/^\d{4,8}$/.test(pin)){ $("#al-pin").focus(); return; } if(navigator.onLine===false){ err.textContent=t("siNet"); return; }
    btnBusy($("#al-go"),true);
    try{ const j=await apiPost0({action:"verify",tok:"",pin,by,wantTok:true,dl:devLabel()}); const me=j.me||{};
      if(!me.personal && !by){ btnBusy($("#al-go"),false); err.textContent=t("needYourName"); $("#al-name").focus(); return; }
      await adoptSignIn(j,pin,by); afterPinUnlock(); }
    catch(er){ btnBusy($("#al-go"),false); err.textContent=errMsg(er); $("#al-pin").value=""; $("#al-pin").focus(); } };
  setTimeout(()=>{ const f=$(ls.get("rb_name","")?"#al-pin":"#al-name"); if(f) f.focus(); },200); }
/** A PIN sign-in worked (sign-in screen, or a different person's PIN typed on the lock screen): this phone is now theirs. */
async function adoptSignIn(j,pin,by){ const me=j.me||{}, old=S.auth&&S.auth.tok;
  S.auth={by:me.personal?me.name:by, role:me.role||"owner", personal:!!me.personal, prefs:me.prefs||{}, testOk:me.testOk!==false, pinLen:pin.length, ...(j.tok?{tok:j.tok}:{pin}), ...await pinCheckSet(pin), ...(j.pending?{pending:true}:{})};
  const bio=ls.get("rb_bio_"+S.auth.by,null); if(bio) S.auth.bio=bio;
  if(j.view) ls.set("rb_view",j.view); ls.set("rb_auth",S.auth); ls.set("rb_name",S.auth.by); S.canWrite=true; meChecked=true; applyPrefs();
  if(old && old!==S.auth.tok) apiPost0({action:"signOut",tok:old}).catch(()=>{});   // end the previous sign-in on the sheet
}
/* Away for LOCK_MS → lock. While away, cover the screen so the phone's app switcher shows nothing. */
function lockAway(){ if(document.visibilityState==="hidden"){ if(!LOCK.on) ls.set("rb_bgAt",Date.now()); document.documentElement.classList.add("cover"); }
  else { document.documentElement.classList.remove("cover"); const at=+ls.get("rb_bgAt",0); if(!LOCK.on && at && Date.now()-at>LOCK_MS) appLock(); ls.set("rb_bgAt",0); } }
document.addEventListener("visibilitychange",lockAway);
window.addEventListener("pagehide",()=>{ if(!LOCK.on) ls.set("rb_bgAt",Date.now()); });
/** Sign this phone out (the token is ended on the sheet when online). */
function lockPhone(){ const a=S.auth; if(a&&a.tok) apiPost0({action:"signOut"}).catch(()=>{}); signedOut(); }
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
  S.items=arr; S.byId=new Map(arr.map(i=>[i.id,i])); buildIndex(); S.loaded=true;
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
      if(!j) j=await apiGet({action:"list"});
      S.rev=j.rev; { const m0=S.cfg.mode; applyConfig(j.config); if(m0!==S.cfg.mode){ S.cfg.mode=m0; switchEnv(j.config); } } S.limited=!!j.limited; S.codeOn=!!j.codeOn; S.sv=+j.sv||0; if(j.pop && typeof j.pop==="object") S.pop=j.pop; applyItems(j.items); S.online=true; S.lastSync=Date.now(); saveCache(); renderAll(); fetchThumbs(); flushBills(); if(j.me){ meChecked=true; applyMe({me:j.me,view:j.view},j); } else refreshMe(j); }
    catch{ S.online=false; renderNet(); }
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
    nCheck(j); }
  catch{ S.online=false; renderNet(); }
}
async function fetchThumbs(){
  const need=S.items.filter(it=>it.imgV && (!S.thumbs[it.id] || S.thumbs[it.id].v!==it.imgV)).map(it=>it.id);
  for(let i=0;i<need.length;i+=30){
    try{ const j=await apiGet({action:"thumbs",ids:need.slice(i,i+30).join(",")});
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
  if(isFileCopy){ w.innerHTML=`<div class="banner"><img src="icon-192.png" alt="" onerror="this.remove()"><div class="txt"><b>${esc(t("fileT"))}</b><span>${esc(t("fileD"))}</span></div>${x}</div>`; return; }
  if(installEvt){ w.innerHTML=`<div class="banner"><img src="icon-192.png" alt=""><div class="txt"><b>${esc(t("installT"))}</b><span>${esc(t("installD"))}</span></div><button class="btn primary" data-inst>${esc(t("install"))}</button>${x}</div>`; return; }
  if(isIOS){ const share=`<svg class="share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8"/></svg>`;
    w.innerHTML=`<div class="banner ios"><img src="apple-touch-icon.png" alt=""><div class="txt"><b>${esc(t("iosT"))}</b><span>${esc(t("iosD")).replace("Share","Share "+share).replace("Share "+share,"Share "+share)} ${esc(t("iosD2"))}</span></div>${x}</div>`; return; }
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
  const updGo=()=>{ try{ saveBill(); }catch{} location.reload(); };
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
