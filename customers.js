/* Rate Book: Credit (udhaar) screen and the Customers page (Tools → Credit, Tools → Customers). Split out of app.js on
   11 Oct 2026. A plain script in global scope, loaded before app.js: while loading it only declares things, so it needs
   nothing from app.js until a screen opens. Uses app.js helpers (S, t, apiPost, openSheet, showBill, payBoxHTML, the
   duesCache / duesDirty / duesQ / billBackFn variables…) only when called. Run  node tools/stamp.js  after editing. */
"use strict";
function duesSub(){ const el=$("#t-dues-sub"); if(!el) return; const c=ls.get(envKey("rb_dues_sum"),null); el.textContent = c&&c.total>0 ? (c.n>0?t("duesSum",rs(c.total),c.n):t("pendingHint",rs(c.total))) : t("duesD"); }
const daysSince=d=>d?Math.max(0,Math.floor((Date.now()-new Date(d).getTime())/864e5)):0;
const duesKey=()=>"dues:"+S.cfg.mode;
/** The Credit list as last loaded on this phone (IndexedDB), so the screen opens at once; null if none for this mode. */
async function duesLocal(){ if(duesCache && duesCache.env===S.cfg.mode) return duesCache; try{ const c=await idb.get("images",duesKey()); return c && c.env===S.cfg.mode && Array.isArray(c.customers) ? c : null; }catch{ return null; } }
/** Redraw the Credit list in place (only while it's the screen showing), keeping the search box's focus and cursor. */
function duesShow(){ if(!$("#du-body")) return; const q=$("#du-q");
  if(q && document.activeElement===q && duesDraw && (duesCache.customers||[]).length){ duesDraw(); return; }   // typing in the search: redraw only the cards, so the keyboard stays
  renderDues(); }
let duesDraw=null;
async function loadDues(){
  const env=S.cfg.mode, j=await apiPost({action:"listDues"}); if(env!==S.cfg.mode) return j; j.env=env; duesCache=wqDuesView(j); duesDirty=false; idb.set("images",duesKey(),j);
  ls.set(envKey("rb_dues_sum"),{total:j.total||0,n:(j.customers||[]).length}); duesSub(); return j;
}

/** Put a customer on the bill (Customers page → "Start a bill"). A bill already in progress for someone else is kept as an open bill. */
function custFill(c){ if(S.editing && !S.editing.fresh){ toast(t("cuFinishEdit")); return false; }
  if(S.bill.length && (S.cust.trim()||S.mob.trim()) && (c.mob ? custKey(S.mob)!==c.mob : S.cust.trim().toLowerCase()!==String(c.name||"").trim().toLowerCase())) newHeldBill();
  S.cust=c.name||""; S.custAuto=""; S.mob=c.mob||""; S.custGstin=c.gstin||""; caddrSet(c.addr||""); $("#cust").value=S.cust; $("#cust-mob").value=S.mob; $("#cust-gstin").value=S.custGstin;
  ls.set("rb_cust",S.cust); ls.set("rb_mob",S.mob); ls.set("rb_cgstin",S.custGstin); igstFromGstin(); S.custQ=""; custLookup(); updateBillTotals(); custXSync(); return true; }
/* ---------------- Customers page: list → customer → their bills (same bill view as Past bills) ---------------- */
const CU={q:"",sort:"recent",lim:150};
async function openCustomers(){
  if(!S.canWrite){ toast(t("billsNeedPin")); openUnlock(); return; }
  sheetKey("customers"), openSheet(t("cuT"), `<div id="cu-page"><div class="bl-bar"><input id="cu-q" type="search" placeholder="${esc(t("cuSearch"))}" autocomplete="off" value="${esc(CU.q)}">
      <div class="bl-chips" id="cu-sort">${["recent","top","due","az"].map(k=>`<button type="button" class="chip" data-cs="${k}" aria-pressed="${CU.sort===k}">${esc(t("cuSort_"+k))}</button>`).join("")}</div></div>
    ${can("manager")?`<button type="button" class="btn ghost cu-addbtn" id="cu-add"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>${esc(t("cuAdd"))}</button>`:""}
    <p class="note" id="cu-sum" style="margin:2px 2px 8px"></p><div id="cu-list">${skelCards(5,true)}</div></div>`, "", {full:true});
  $("#cu-q").oninput=e=>{ CU.q=e.target.value; CU.lim=150; cuRender(); };
  if($("#cu-add")) $("#cu-add").onclick=()=>cuEdit(null);
  $("#cu-sort").onclick=e=>{ const b=e.target.closest("[data-cs]"); if(!b) return; CU.sort=b.dataset.cs; $("#cu-sort").querySelectorAll("[data-cs]").forEach(x=>x.setAttribute("aria-pressed",x===b)); cuRender(); };
  await custdGet(); if(CUSTD) cuRender(); custIdx=null;
  custdRefresh(true).then(()=>{ custIdx=null; if($("#cu-list")) cuRender(); }).catch(()=>{});
}
function cuAll(){ const q=CU.q.trim().toLowerCase(), qd=q.replace(/\D/g,"");
  let L=custIndex().filter(c=>!q || c.ln.includes(q) || (qd.length>=3 && c.mob && c.mob.includes(qd)) || c.lg.toLowerCase().includes(q));
  const ts=c=>c.last?Date.parse(c.last)||0:0;
  L=L.slice().sort(CU.sort==="top"?(a,b)=>(b.total||0)-(a.total||0):CU.sort==="due"?(a,b)=>(b.due||0)-(a.due||0)||ts(b)-ts(a):CU.sort==="az"?(a,b)=>(a.name||a.mob||"").localeCompare(b.name||b.mob||"","en",{sensitivity:"base"}):(a,b)=>ts(b)-ts(a));
  if(CU.sort==="due") L=L.filter(c=>c.due>0); return L; }
function cuRender(){ const el=$("#cu-list"); if(!el) return; const L=cuAll(), due=r2(L.reduce((a,c)=>a+(+c.due||0),0));
  $("#cu-sum").textContent=t("cuSummary",L.length,due>0?rs(due):"");
  if(!L.length){ el.innerHTML=`<div class="empty"><p>${esc(CU.q?t("cuNone",CU.q):t("cuEmpty"))}</p></div>`; return; }
  el.innerHTML=`<div class="bills-list" style="margin-top:0">${L.slice(0,CU.lim).map(c=>`<button type="button" class="billcard cucard" data-cm="${esc(c.key||c.mob)}"><b>${esc(c.name||("+91 "+c.mob))}</b><span class="amt num"${c.due>0?' style="color:var(--danger)"':""}>${c.due>0?esc(t("cuDue",rs(c.due))):rs(c.total||0)}</span>
      <span class="meta2">${c.name&&c.mob?esc(c.mob)+" · ":""}${esc(t("billsN",c.count||0))}${c.last?` · ${esc(t("cuLast",fmtShort(c.last)))}`:""}${c.gstin?` <span class="pill gst">GSTIN</span>`:""}</span></button>`).join("")}</div>
    ${L.length>CU.lim?`<button type="button" class="btn ghost" id="cu-more" style="width:100%;margin-top:8px">${esc(t("cuMore",L.length-CU.lim))}</button>`:""}`;
  el.querySelectorAll("[data-cm]").forEach(b=>b.onclick=()=>openCustomer(b.dataset.cm));
  const mo=$("#cu-more"); if(mo) mo.onclick=()=>{ CU.lim+=300; cuRender(); }; }
async function openCustomer(key){ const c=custIndex().find(x=>(x.key||x.mob)===key)||{key,mob:/^\d{10}$/.test(key)?key:"",name:"",gstin:"",count:0,total:0,due:0,addr:"",note:""};
  const mob=c.mob||"", m=mob?normMobile(mob):"", title=c.name||("+91 "+mob);
  const stat=(k,v,cls)=>`<div class="cu-stat"><span>${esc(k)}</span><b class="num${cls?" "+cls:""}">${v}</b></div>`;
  sheetKey("cust:"+key), openSheet(title, `<div class="cu-page" style="display:grid;gap:12px"><div><button type="button" class="btn ghost" id="cu-back">← ${esc(t("cuT"))}</button></div>
    <div class="cu-card"><div class="cu-top"><div class="cu-av">${esc((c.name||"#").trim().charAt(0).toUpperCase())}</div><div style="min-width:0"><b class="cu-name">${esc(c.name||t("cuNoName"))}</b><span class="cu-mob num">${mob?"+91 "+esc(mob.slice(0,5)+" "+mob.slice(5)):esc(t("cuNoMob"))}</span></div>
      <span class="cu-acts">${can("manager")?`<button type="button" class="iconbtn" id="cu-edit" aria-label="${esc(t("edit"))}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg></button>`:""}${m?`<a class="iconbtn" href="${esc(telHref(mob))}" aria-label="${esc(t("call"))}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg></a><a class="iconbtn" target="_blank" rel="noopener" href="https://wa.me/${esc(m)}" aria-label="WhatsApp"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.5A8.4 8.4 0 1 1 21 11.5z"/></svg></a>`:""}</span></div>
      ${c.gstin||c.addr||c.note||c.contact||c.email?`<div class="cu-info">${c.gstin?`<div class="vkv"><span>GSTIN</span><b class="num">${esc(c.gstin)}</b></div>`:""}${c.contact?`<div class="vkv"><span>${esc(t("cuContact"))}</span><span class="cu-txt">${esc(c.contact)}</span></div>`:""}${c.email?`<div class="vkv"><span>${esc(t("cuEmail"))}</span><a class="cu-txt" href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>`:""}${c.addr?`<div class="vkv"><span>${esc(t("cuAddr"))}</span><span class="cu-txt">${esc(c.addr)}</span></div>`:""}${c.note?`<div class="vkv"><span>${IC.lock} ${esc(t("cuNote"))}</span><span class="cu-txt">${esc(c.note)}</span></div>`:""}</div>`:""}
    </div>
    <div class="cu-stats">${stat(t("cuBills"),fmtN(c.count||0))}${stat(t("cuTotal"),rs(c.total||0))}${stat(t("cuDueL"),rs(c.due||0),c.due>0?"bad":"")}${stat(t("cuLastL"),c.last?esc(fmtShort(c.last)):"—")}</div>
    <div class="row-btns" style="justify-content:flex-start"><button type="button" class="btn primary" id="cu-bill">${esc(t("cuStartBill"))}</button>${c.due>0?`<button type="button" class="btn ghost" id="cu-credit">${esc(t("cuSeeCredit"))}</button>`:""}</div>
    <h4 style="margin:6px 0 0">${esc(t("cuBillsH"))}</h4><div id="cu-bills">${skelCards(3,true)}</div></div>`, "", {full:true});
  $("#cu-back").onclick=()=>openCustomers();
  $("#cu-bill").onclick=()=>{ if(custFill(c)){ closeSheet(); setTab("bill"); toast(t("cuOnBill",c.name||mob)); } };
  if($("#cu-edit")) $("#cu-edit").onclick=()=>cuEdit(c);
  if($("#cu-credit") && mob) $("#cu-credit").onclick=async()=>{ sheetKey("duec:"+mob), openSheet(t("duesT"), ldBlock(), "", {full:true}); try{ await loadDues(); }catch{} const d=(duesCache&&duesCache.customers||[]).find(x=>custKey(x.mobile)===mob); if(d) openDueCustomer(d); else openDues(); };
  cuBills(c);
}
/** This customer's bills: from the phone's copy of Past bills (refreshed first if it's old), newest first. */
async function cuBills(c){ const mob=c.mob||"", g=String(c.gstin||"").toUpperCase(), nm=String(c.name||"").trim().toLowerCase(), key=c.key||mob;
  /* the same bills the sheet counts for them: their mobile; or, for a bill made without a mobile, their GSTIN (a company GST bill),
     else (a customer with neither) the exact name */
  const mine=b=>{ const bm=custKey(b.mobile); if(bm) return !!mob && bm===mob;
    return g ? String(b.custGstin||"").trim().toUpperCase()===g : !mob && !!nm && String(b.customer||"").trim().toLowerCase()===nm; };
  const draw=C=>{ const el=$("#cu-bills"); if(!el||!C) return;
    const L=C.bills.filter(mine).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    if(!L.length){ el.innerHTML=`<p class="note">${esc(t(mob?"cuNoBills":"cuNoBillsC"))}</p>`; return; }
    el.innerHTML=`<div class="bills-list" style="margin-top:0">${L.slice(0,200).map((b,i)=>{ const d=b.date?new Date(b.date):null; return `<button type="button" class="billcard${b.cancelled?" cancelled":""}" data-ci="${i}"><b>${b.gst?"GST ":""}${esc(t("billNoL"))} ${esc(dispNo(b.n,b.gst,b.fy))}</b><span class="amt num">${rs(b.total)}</span>
      <span class="meta2">${d?esc(fmtShort(b.date)+" · "+d.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})):""}${b.gst?` <span class="pill gst">${esc(t("gstShort"))}</span>`:""}${b.editedAt?` <span class="pill edited">${esc(t("editedPill"))}</span>`:""}${b.cancelled?` <span class="pill cancel">${esc(billMovedTo(b)?t("movedPill",dispNo(billMovedTo(b),b.gst,b.fy)):t("cancelledPill"))}</span>`:payPill(b)}</span></button>`; }).join("")}</div>
      ${L.length>200?`<p class="note">${esc(t("cuOlder"))}</p>`:""}`;
    el.querySelectorAll("[data-ci]").forEach(x=>x.onclick=()=>{ billBackFn=()=>openCustomer(key); showBill(L[+x.dataset.ci]); }); };
  const C=await blcGet(); if(C) draw(C);
  try{ if(!C || Date.now()-(C.at||0)>20000){ const C2=await blcRefresh(); if(C2) draw(C2); else if(!C){ const el=$("#cu-bills"); if(el) el.innerHTML=`<p class="note">${esc(t("cuBillsOld"))}</p>`; } } }
  catch{ if(!C){ const el=$("#cu-bills"); if(el) el.innerHTML=`<p class="err">${esc(t("billsFail"))}</p>`; } } }
/** Add (c = null) or edit a customer: name (needed), mobile, address, private note, and for a company its GSTIN, contact person
    and email. Past bills keep what was sent; a new mobile moves this customer's bills to it. */
function cuEdit(c){
  const isNew=!c; c=c||{key:"",mob:"",name:"",gstin:"",addr:"",note:"",contact:"",email:""};
  const back=()=>isNew?openCustomers():openCustomer(c.key||c.mob);
  openSheet(t(isNew?"cuNewT":"cuEditT"), `<div class="form cu-form"><div><button type="button" class="btn ghost" id="ce-back">← ${esc(isNew?t("cuT"):(c.name||c.mob))}</button></div>
    <div class="field"><label for="ce-name">${esc(t("cuNameReq"))}</label><input id="ce-name" value="${esc(c.name||"")}" maxlength="80" autocomplete="off" enterkeyhint="next"></div>
    <div class="field"><label for="ce-mob">${esc(t("cuMobOpt"))}</label><input id="ce-mob" type="text" inputmode="tel" value="${esc(c.mob||"")}" maxlength="20" autocomplete="off"><small class="note" id="ce-mobnote" hidden>${esc(t("cuMobMove"))}</small></div>
    <div class="field"><label for="ce-addr">${esc(t("cuAddr"))}</label><textarea id="ce-addr" rows="3" maxlength="300" placeholder="${esc(t("cuAddrPh"))}">${esc(c.addr||"")}</textarea></div>
    <fieldset class="cu-co"><legend>${esc(t("cuCompanyH"))}</legend><p class="note" style="margin:0 0 4px">${esc(t("cuCompanyD"))}</p>
      <div class="field"><label for="ce-gst">GSTIN</label><input id="ce-gst" value="${esc(c.gstin||"")}" maxlength="15" autocomplete="off" autocorrect="off" spellcheck="false" style="text-transform:uppercase" placeholder="${esc(t("optional"))}"><small class="note" id="ce-gststate"></small></div>
      <div class="field"><label for="ce-contact">${esc(t("cuContact"))}</label><input id="ce-contact" value="${esc(c.contact||"")}" maxlength="80" autocomplete="off" placeholder="${esc(t("optional"))}"></div>
      <div class="field"><label for="ce-email">${esc(t("cuEmail"))}</label><input id="ce-email" type="email" inputmode="email" value="${esc(c.email||"")}" maxlength="100" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(t("optional"))}"></div></fieldset>
    <div class="field"><label for="ce-note">${IC.lock} ${esc(t("cuNote"))}</label><textarea id="ce-note" rows="2" maxlength="300" placeholder="${esc(t("cuNotePh"))}">${esc(c.note||"")}</textarea></div>
    ${isNew?"":`<p class="note" style="margin:0">${esc(t("cuEditInfo"))}</p>`}<p class="err" id="ce-err" role="alert"></p></div>`,
    `<button class="btn ghost" id="ce-cancel">${esc(t("cancel"))}</button><button class="btn primary" id="ce-save">${esc(t("save"))}</button>`);
  $("#ce-back").onclick=$("#ce-cancel").onclick=back;
  const gstState=()=>{ const g=$("#ce-gst").value.trim().toUpperCase(), el=$("#ce-gststate"); el.textContent = g.length===15 && gstinOk(g) && stateName(g.slice(0,2)) ? stateName(g.slice(0,2))+" ("+g.slice(0,2)+")" : ""; };
  $("#ce-gst").oninput=gstState; gstState();
  $("#ce-mob").oninput=()=>{ $("#ce-mobnote").hidden=isNew || !c.mob || custKey($("#ce-mob").value)===c.mob; };
  if(isNew) setTimeout(()=>$("#ce-name").focus(),50);
  $("#ce-save").onclick=async()=>{ const err=$("#ce-err"); err.innerHTML=""; const name=$("#ce-name").value.trim(), mobRaw=$("#ce-mob").value.trim(), nm=custKey(mobRaw), g=$("#ce-gst").value.trim().toUpperCase(), em=$("#ce-email").value.trim();
    const bad=(id,msg)=>{ err.textContent=msg; const el=$(id); if(el) el.focus(); };
    if(!name) return bad("#ce-name",t("cuNameNeed"));
    if(mobRaw && !nm) return bad("#ce-mob",t("mobBad"));
    if(!isNew && c.mob && !nm) return bad("#ce-mob",t("mobBad"));
    if(g && !gstinOk(g)) return bad("#ce-gst",t("gstinBad"));
    if(em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return bad("#ce-email",t("emailBad"));
    if(navigator.onLine===false){ err.textContent=t("vNeedNet"); return; }
    const b=$("#ce-save"); btnBusy(b,true);
    const cust={name,gstin:g,address:$("#ce-addr").value.trim(),note:$("#ce-note").value.trim(),contact:$("#ce-contact").value.trim(),email:em};
    if(isNew) cust.mobile=nm; else { cust.key=c.key||c.mob; cust.mobile=c.mob||""; cust.newMobile=nm; }   // mobile too: an older script (v54 or less) edits by it
    /* (v59) saved in the background, shown at once. A new or changed mobile number still waits for the sheet: a new number moves
       the customer's bills over to it, and the sheet has to check no one else already has that number. */
    const mobChange=!isNew && nm!==(c.mob||"");
    if(wqOn() && !mobChange){
      if(isNew && (nm||g)){ const ex=custIndex().find(x=>nm ? x.mob===nm : (!x.mob && String(x.gstin||"").toUpperCase()===g)); if(ex){ /* the sheet's duplicate rule, checked here too: the save goes in the background */ btnBusy(b,false); err.innerHTML=`${esc(t("cuExists",ex.name||nm||g))} <button type="button" class="linkbtn" id="ce-open">${esc(t("cuOpenIt"))}</button>`; $("#ce-open").onclick=()=>openCustomer(ex.key||nm); return; } }
      if(isNew) cust.cid=custNewIdJS();
      const key=isNew?(nm||cust.cid):(c.key||c.mob);
      wqAdd({k:"cust", key:"cust:"+key, body:{action:"saveCustomer",customer:cust}});
      custIdx=null; toast(isNew?t("cuAdded",name):t("saved")); openCustomer(key); return; }
    try{ const r=await apiPost({action:"saveCustomer",customer:cust});
      const cc=custCache(); if(c.mob) delete cc[c.mob]; if(nm) delete cc[nm]; ls.set(envKey("rb_customers"),cc); custLV++;
      await custdRefresh(true); custIdx=null; if(r.moved){ try{ await blcRefresh(); }catch{} }   /* bills now carry the new number */
      toast(r.moved?t("cuMoved",r.moved):isNew?t("cuAdded",name):t("saved")); openCustomer(r.key||nm||c.key); }
    catch(e){ btnBusy(b,false);
      if(e&&e.code==="cust_exists" && e.existing){ err.innerHTML=`${esc(t("cuExists",e.existing.name||e.existing.key))} <button type="button" class="linkbtn" id="ce-open">${esc(t("cuOpenIt"))}</button>`; $("#ce-open").onclick=async()=>{ await custdRefresh(true).catch(()=>{}); custIdx=null; openCustomer(e.existing.key); }; return; }
      err.textContent=e&&e.code==="bad_gstin"?t("gstinBad"):e&&e.code==="bad_mobile"?t("mobBad"):e&&e.code==="bad_name"?t("cuNameNeed"):e&&e.code==="bad_email"?t("emailBad"):e&&e.code==="not_allowed"?t("notAllowed"):errMsg(e); } };
}
async function openDues(){ duesSort="date";   // opens with the oldest dues first
  if(!S.canWrite){ toast(t("billsNeedPin")); openUnlock(); return; }
  sheetKey("dues"), openSheet(t("duesT"), `<div id="du-body">${skelCards(4,true)}</div>`, "", {full:true});
  const have=await duesLocal(); if(have){ duesCache=wqDuesView(have); duesShow(); }   // the saved list at once; the fresh one replaces it below
  try{ await loadDues(); } catch(e){ const el=$("#du-body"); if(el && !have) el.innerHTML=`<p class="err">${esc(e&&e.code==="bad_pin"?t("wrongPin"):t("billsFail"))}</p>`; return; }
  duesShow();
}
/* Credit list order (15 Oct 2026): oldest unpaid bill first by default (who has waited longest), or most owed first. */
let duesSort="date";
const duesSorted=L=>{ const ts=c=>c.oldest?Date.parse(c.oldest)||0:Infinity;
  return L.slice().sort(duesSort==="amt" ? (a,b)=>(b.c.due||0)-(a.c.due||0) || ts(a.c)-ts(b.c) : (a,b)=>ts(a.c)-ts(b.c) || (b.c.due||0)-(a.c.due||0)); };
function renderDues(){
  const box=$("#du-body"); if(!box||!duesCache) return;
  const j=duesCache; let list=j.customers||[];
  if(!list.length){ box.innerHTML=`<div class="empty"><h2>${esc(t("duesNone"))}</h2><p>${esc(t("duesTabHint"))}</p></div>`; return; }
  box.innerHTML=`<div style="display:grid;gap:10px">
    <div class="dues-sum"><b class="num">${rs(j.total)}</b><span>${esc(t("duesFrom",list.length,j.bills))}</span></div>
    <input id="du-q" type="search" placeholder="${esc(t("duesSearch"))}" autocomplete="off" value="${esc(duesQ)}">
    <div class="bl-chips" id="du-sort" role="group" aria-label="${esc(t("duSortL"))}">${["date","amt"].map(k=>`<button type="button" class="chip" data-ds="${k}" aria-pressed="${duesSort===k}">${esc(t(k==="date"?"duSortDate":"duSortAmt"))}</button>`).join("")}</div>
    <div class="bills-list" id="du-list" style="margin-top:0"></div></div>`;
  const draw=()=>{ list=duesCache.customers||[]; const sm=document.querySelector("#du-body .dues-sum"); if(sm) sm.innerHTML=`<b class="num">${rs(duesCache.total)}</b><span>${esc(t("duesFrom",list.length,duesCache.bills))}</span>`; const q=duesQ.trim().toLowerCase(), dq=q.replace(/\D/g,"");
    const rows=duesSorted(list.map((c,i)=>({c,i})).filter(({c})=>!q || (c.name||"").toLowerCase().includes(q) || (dq.length>=3 && (c.mobile||"").includes(dq))));
    $("#du-list").innerHTML = rows.map(({c,i})=>{ const days=daysSince(c.oldest);
      return `<button type="button" class="duecard" data-dc="${i}"><span class="av">${esc((c.name||"?").trim().charAt(0).toUpperCase())}</span><b>${esc(c.name||c.mobile||"?")}</b><span class="amt num">${rs(c.due)}</span>
        <span class="m">${esc(c.mobile||"")}${c.mobile?" · ":""}${esc(t("billsN",c.bills.length))}</span><span class="age${days>30?" old":""}">${esc(t("since",fmtShort(c.oldest),days))}</span></button>`; }).join("") || `<p class="note">${esc(t("billsNone"))}</p>`; };
  draw(); duesDraw=draw;
  $("#du-q").addEventListener("input",e=>{ duesQ=e.target.value; draw(); });
  $("#du-sort").addEventListener("click",e=>{ const b=e.target.closest("[data-ds]"); if(!b) return; duesSort=b.dataset.ds; $("#du-sort").querySelectorAll("[data-ds]").forEach(x=>x.setAttribute("aria-pressed",x===b)); draw(); });
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
/** Record payment without waiting (v59): the money is laid out over the bills the same way the sheet does it (oldest first, or
    the one bill), shown at once on the Credit list, the customer and the bills, and sent through the outbox with its own id so it
    can never be saved twice. */
/** A new customer's id made on the phone (same shape as the sheet's: c- and 10 letters, never read as a mobile). */
function custNewIdJS(){ const L="abcdefghijkmnpqrstuvwxyz"; let x="c-"; const r=crypto.getRandomValues(new Uint8Array(10)); for(const v of r) x+=L.charAt(v%L.length); return x; }
function payInBg(c,amount,note,bills){
  let left=amount, cleared=0; const alloc=[];
  for(const b of bills){ if(left<=0) break; const take=r2(Math.min(+b.due||0,left)); if(!(take>0)) continue; left=r2(left-take); if(r2((+b.due||0)-take)<=0) cleared++; alloc.push({id:b.id||"",row:b.row||0,n:b.n,take}); }
  const used=r2(amount-left); if(!(used>0)) return;
  const body={action:"recordPayment",amount:used,note,pid:wqId()};
  if(c.bill){ body.billId=c.bill.id; body.row=c.bill.row; body.n=c.bill.n; } else body.mobile=c.mobile;
  wqAdd({k:"pay", body, alloc, who:c.name||c.mobile||""});
  toast(t("payDone",rs(used),cleared)); duesDirty=true;
  const ck=custKey(c.mobile); if(ck){ const cc=custCache(); if(cc[ck]){ cc[ck].due=r2(Math.max(0,(+cc[ck].due||0)-used)); ls.set(envKey("rb_customers"),cc); } }
  if(duesCache) duesCache=wqDuesView(duesCache);
  if(c.bill) showBill(c.bill._base||c.bill);
  else { const again=(duesCache&&duesCache.customers||[]).find(x=>x.mobile===c.mobile); if(again) openDueCustomer(again); else openDues(); }
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
    if(wqOn()){ payInBg(c,Math.min(a,due),note,bills); return; }   // (v59) shown at once, saved in the background
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
