/* Rate Book: the price list and items. Item cards (cardHTML, thumbs, margin), item groups and business types (BIZ, guessCat,
   the Groups tool), the list itself (renderHeader / renderList / renderFilters), the item screen (openDetail), photo handling,
   Edit item (openEdit), Bulk add / Bulk edit, the wand's screen (openCmd, preview, applyActions) and Tools → Convert names to
   Hindi (openToHindi). Declarations moved unchanged out of app.js and billing.js (11 Oct 2026); the lines that wire buttons as
   the page loads stay in app.js. Loads before billing.js and app.js; only declares things while loading.
   After editing, run: node tools/stamp.js */
"use strict";
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
  const body=`<input id="be-f" type="search" placeholder="${esc(t("filter"))}">
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
