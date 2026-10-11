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
$("#bill-wa").addEventListener("click",e=>{ if(!payCheck()){ e.preventDefault(); return; } if(S.gst && !gstinOk(S.custGstin)){ e.preventDefault(); setOpen("#bh-more","#bh-extra","rb_bh_open",true); $("#cust-gstin").focus(); toast(t("gstinBad")); return; } if(normMobile(S.mob)===null){ e.preventDefault(); $("#cust-mob").focus(); toast(t("mobBad")); return; } $("#bill-wa").href=waLink(); finishBill({keep:true}); S.pendShare=true; ls.set("rb_pshare",1); });
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

$("#t-bills").onclick=()=>{ billBackFn=openBills; openBills(); };
$("#t-dues").onclick=()=>openDues();
$("#t-custs").onclick=()=>openCustomers();
$("#t-vendors").onclick=()=>openVendors();
$("#t-reports").onclick=()=>openReports();
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
