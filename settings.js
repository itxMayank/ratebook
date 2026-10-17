/* Rate Book: Settings (the grouped cards, `openSettings`), Settings → Bill reading key, the owner's People & security cards
   (people, PINs, signed-in phones, approval) and Backups. Split out of app.js on 11 Oct 2026. A plain script in
   global scope, loaded before app.js: while loading it only declares things, so it needs nothing from app.js until
   Settings opens. Uses app.js helpers (S, t, apiPost, openSheet, setFz, applyTheme, renderPrCfg…) only when called.
   Run  node tools/stamp.js  after editing. */
"use strict";
/** Why a Gemini key couldn't be saved: our own message, plus Google's exact words when there are any. */
function aiErrText(e){ const c=String(e&&e.code||""); if(c==="ai_key") return t("aiBadKey"); if(c==="ai_auth") return t("aiNeedAuth"); if(c==="ai_limit") return t("aiLimitNow");
  if(c==="bad_action") return t("aiOldScript"); const p=c.split("|"); if(p[0]==="ai_http") return t("aiGoogleSaid",p[1]&&p[1]!=="0"?p[1]:"",p.slice(2).join("|").replace(/[.\s]+$/,"")); return c&&c!=="offline"&&TECH()?t("aiFail")+" ("+c+")":t("aiFail"); }
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
let pplCache=null, pplShopOff=false;
/** The same PIN rules as the sheet (owner and manager 6–8 digits; no repeats, runs, common picks or 4-digit years), said at once. */
/** Owners and managers need 6–8 digits since 12 Oct 2026; a PIN from before can still be 4. */
function pinNeed6(){ return myRole()==="owner" || myRole()==="manager"; }
function pinShortMe(){ const a=S.auth||{}; return !!a.personal && pinNeed6() && a.pinLen>0 && a.pinLen<6; }
function pinProblem(p, role){ if(!/^\d{4,8}$/.test(p)) return t("pplPin"); if((role==="owner"||role==="manager") && p.length<6) return t("pinShort");
  if(/^(\d)\1+$/.test(p) || "01234567890".indexOf(p)>=0 || "09876543210".indexOf(p)>=0 || (p.length===4 && /^(19|20)\d\d$/.test(p)) || ["1212","1122","1313","2580","0852","1379","6969","1004","121212","112233","123123","696969","159753","147258","258369","102030","101010","123321","789456","456789"].includes(p)) return t("pinEasy"); return ""; }
async function loadOwnerCards(){
  if(!can("owner")) return;
  try{ const [u,a]=await Promise.all([apiPost({action:"listUsers"}),apiPost({action:"getAccess"})]); pplCache=u.users||[]; pplShopOff=!!u.shopPinOff; renderPeople(); renderAccess(a.access); }
  catch(e){ const b=$("#ppl-body"); if(b) b.innerHTML=`<p class="err">${esc(errMsg(e))}</p>`; }
  apiPost({action:"listSessions"}).then(renderSessions).catch(()=>{ const b=$("#sess-body"); if(b) b.innerHTML=`<p class="note">${esc(t("oldScript"))}</p>`; });
}
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
  { const sec=box.closest(".cfg-sec"); let n=sec&&sec.querySelector(".ppl-shop"); if(sec && !n){ n=document.createElement("p"); n.className="note ppl-shop"; sec.insertBefore(n,box); }
    if(n){ n.textContent=t(pplShopOff?"pplShopOff":"pplShopOn"); n.classList.toggle("warn",!pplShopOff); }
    const cp=$("#cf-pin"); const cs=cp&&cp.closest(".cfg-sec"); if(cs) cs.hidden=pplShopOff; }   // the shop PIN can't be changed once it's off
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
    if(!name){ err.textContent=t("needYourName"); return; } if((!u||pin) && pinProblem(pin,role)){ err.textContent=pinProblem(pin,role); return; }
    const b=$("#pp-save"); btnBusy(b,true);
    try{ const j=await apiPost({action:"saveUser",user:{id:u?u.id:undefined,name,pin,role,active:u?$("#pp-active").checked:true,testOk:$("#pp-test").checked}}); pplCache=j.users; const was=pplShopOff; pplShopOff=!!j.shopPinOff;
      if(pplShopOff && !was && S.auth && S.auth.personal===false){ toast(t("pplSaved")); setTimeout(()=>signedOut("shopPinOff"),300); return; }   // this phone used the shop PIN: sign in with the new personal PIN
      if(pin && u && S.auth && S.auth.personal && samePerson(u.name,S.auth.by)){ S.auth={...S.auth,...await pinCheckSet(pin),pinLen:pin.length}; ls.set("rb_auth",S.auth); toast(t("myPinDone")); openSettings(); return; }   // your own PIN: this device stays signed in and opens with the new PIN
      toast(t("pplSaved")); openSettings(); }
    catch(e){ btnBusy(b,false); err.textContent = e&&e.code==="pin_taken"?t("pplTaken"):errMsg(e); } };
  if($("#pp-remove")) $("#pp-remove").onclick=async()=>{ const b=$("#pp-remove"); btnBusy(b,true); try{ const j=await apiPost({action:"removeUser",id:u.id}); pplCache=j.users; pplShopOff=!!j.shopPinOff; openSettings(); }catch(e){ btnBusy(b,false); toast(errMsg(e)); } };
}
function renderAccess(a){
  const box=$("#acc-body"); if(!box||!a) return;
  box.innerHTML=`<label class="switch"><span><b>${esc(t("accOn"))}</b></span><input type="checkbox" id="acc-on" ${a.on?"checked":""}></label>
    ${a.on?`<div class="acc-code num">${esc(a.code)}</div><div class="row-btns" style="justify-content:flex-start"><a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(t("accMsg",a.code))}">${esc(t("accShare"))}</a><button type="button" class="btn ghost" id="acc-new">${esc(t("accNew"))}</button></div>`:""}`;
  const set=async(on,regen)=>{ try{ const j=await apiPost({action:"setAccess",on,regen}); if(j.access.code) ls.set("rb_view",j.access.code); renderAccess(j.access); }catch(e){ toast(errMsg(e)); } };
  $("#acc-on").onchange=e=>set(e.target.checked,false);
  if($("#acc-new")) $("#acc-new").onclick=()=>set(true,true);
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
const cgSumLook=()=>cgJ([t("ts"+(TSIZES.indexOf(fzNow())+1)), t("th"+cgCap(palNow())), t("ap"+cgCap(appearNow())), DESK()?"":t(sposNow()==="bottom"?"cgSBot":"cgSTop")]);   // the laptop has no search bar choice
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
      ${S.auth.personal && !(S.sv>0 && S.sv<57)?`<div class="mypin" id="cf-mypin"><div><button type="button" class="btn ghost" id="cf-mpopen" aria-expanded="false">${esc(t("myPinT"))}</button></div>
        ${pinShortMe()?`<p class="note mpwarn">${IC.warn} ${esc(t("myPinShort"))}</p>`:""}
        <div id="cf-mpform" class="mpform" hidden><div class="field"><label for="cf-mp0">${esc(t("myPinOld"))}</label><input id="cf-mp0" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8"></div>
          <div class="two"><div class="field"><label for="cf-mp1">${esc(t("newPin"))}</label><input id="cf-mp1" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8"></div><div class="field"><label for="cf-mp2">${esc(t("newPin2"))}</label><input id="cf-mp2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8"></div></div>
          <p class="note" style="margin:0">${esc(t(pinNeed6()?"myPinD6":"myPinD4"))}</p>
          <div><button type="button" class="btn primary" id="cf-mpsave">${esc(t("myPinSave"))}</button></div><div class="err" id="cf-mperr" role="alert"></div></div></div>`:""}
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
      <p class="note" style="margin:0">${esc(t("sresD"))}</p></div>
      <h3 style="margin:6px 0 0;font-size:14px">${esc(t("rcStyleT"))}</h3>
      <div class="appear" id="cf-rcs" role="group" style="grid-template-columns:1fr 1fr">${["list","pills"].map(k=>`<button type="button" data-rcs="${k}" aria-pressed="${ls.get("rb_rcstyle","list")===k}">${esc(t(k==="list"?"rcStyleL":"rcStyleP"))}</button>`).join("")}</div>
      <p class="note" style="margin:0">${esc(t("rcStyleD"))}</p>
      ${DESK()?`<p class="note lookphone" style="margin:4px 0 0;font-weight:600">${esc(t("lookPhone"))}</p>`:""}</div>
    <div class="cfg-sec" style="display:grid;gap:8px"><p class="note lookfollow" style="margin:0">${esc(t("lookFollow"))}</p><h3 style="margin:0">${esc(t("themeT"))}</h3>
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
    <div class="err" id="cf-err" role="alert"></div>`;
  sheetKey("settings"), openSheet(t("settings"), body, w?`<button class="btn ghost" id="cf-cancel">${esc(t("cancel"))}</button><button class="btn primary" id="cf-save">${esc(t("save"))}</button>`:"", {full:true});
  cgWire();
  const drawUnits=()=>{ const ue=$("#cf-units"); if(!ue) return;   /* staff have no Items & units card */ ue.innerHTML=c.units.map((u,i)=>`<span class="uchip"><b>${esc(u.code)}</b>${u.hi?`<span>${esc(u.hi)}</span>`:""}${w&&c.units.length>1?`<button type="button" data-rmu="${i}" aria-label="Remove ${esc(u.code)}">×</button>`:"<i style='width:6px'></i>"}</span>`).join(""); };
  drawUnits();
  if($("#cf-units")) $("#cf-units").addEventListener("click",e=>{ const b=e.target.closest("[data-rmu]"); if(!b) return; c.units.splice(+b.dataset.rmu,1); if(!c.units.some(u=>u.code===c.defaultUnit)){ c.defaultUnit=c.units[0].code; const d=$("#cf-def"); d.dataset.unit=c.defaultUnit; d.querySelector("span").textContent=c.defaultUnit; } drawUnits(); });
  $("#cf-pal").onclick=e=>{ const b=e.target.closest("[data-pal]"); if(!b) return; ls.set("rb_palette",b.dataset.pal); applyTheme(); $("#cf-pal").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); };
  $("#cf-appear").onclick=e=>{ const b=e.target.closest("[data-ap]"); if(!b) return; ls.set("rb_appear",b.dataset.ap); applyTheme(); $("#cf-appear").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); };
  renderPrCfg(); renderAiCfg(); if($("#cf-groups")) $("#cf-groups").onclick=()=>openGroups();
  $("#cf-spos").onclick=e=>{ const b=e.target.closest("[data-spos]"); if(!b) return; ls.set("rb_spos",b.dataset.spos); $("#cf-spos").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); $("#cf-sres-w").hidden=b.dataset.spos!=="bottom"; placeSearch(); };
  $("#cf-rcs").onclick=e=>{ const b=e.target.closest("[data-rcs]"); if(!b) return; ls.set("rb_rcstyle",b.dataset.rcs); $("#cf-rcs").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); };
  $("#cf-sres").onclick=e=>{ const b=e.target.closest("[data-sres]"); if(!b) return; ls.set("rb_sres",b.dataset.sres); $("#cf-sres").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); placeSearch(); };
  $("#cf-tsize").onclick=e=>{ const b=e.target.closest("[data-fz]"); if(!b) return; setFz(+b.dataset.fz); $("#cf-tsize").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); };
  /* Just for you: saved with the person on the sheet (follows them to any phone); without signing in, hide-buy stays per phone */
  const mySet=async(el,p,undo)=>{ el.disabled=true; $("#cf-meerr").textContent="";
    try{ await setMyPrefs(p); }catch(er){ undo(); $("#cf-meerr").textContent=errMsg(er); } finally{ el.disabled=false; } };
  $("#cf-hide").onchange=e=>{ const v=e.target.checked; if(!me){ S.hideBuy=v; ls.set("rb_hidebuy",v); renderList(); return; }
    S.hideBuy=v; renderList(); mySet(e.target,{hideBuy:v},()=>{ e.target.checked=!v; S.hideBuy=!v; renderList(); }); };
  if($("#cf-mpopen")){ $("#cf-mpopen").onclick=()=>{ const f=$("#cf-mpform"); f.hidden=!f.hidden; $("#cf-mpopen").setAttribute("aria-expanded",String(!f.hidden)); if(!f.hidden) $("#cf-mp0").focus(); };
    $("#cf-mpsave").onclick=async()=>{ const o=$("#cf-mp0").value.trim(), p1=$("#cf-mp1").value.trim(), p2=$("#cf-mp2").value.trim(), er=$("#cf-mperr"); er.textContent="";
      if(!/^\d{4,8}$/.test(o)){ er.textContent=t("myPinOldReq"); $("#cf-mp0").focus(); return; }
      const pp=pinProblem(p1,myRole()); if(pp){ er.textContent=pp; $("#cf-mp1").focus(); return; } if(p1!==p2){ er.textContent=t("pinMismatch"); $("#cf-mp2").focus(); return; }
      const b=$("#cf-mpsave"); btnBusy(b,true);
      try{ await apiPost0({action:"setMyPin",oldPin:o,newPin:p1}); S.auth={...S.auth,...await pinCheckSet(p1),pinLen:p1.length}; ls.set("rb_auth",S.auth);
        ["#cf-mp0","#cf-mp1","#cf-mp2"].forEach(s=>{ const x=$(s); if(x) x.value=""; }); $("#cf-mpform").hidden=true; $("#cf-mpopen").setAttribute("aria-expanded","false");
        const w=document.querySelector("#cf-mypin .mpwarn"); if(w) w.remove(); toast(t("myPinDone")); }
      catch(e){ const c=e&&e.code; er.textContent=c==="bad_old_pin"?t("myPinBadOld"):c==="pin_same"?t("myPinSame"):c==="not_personal"?t("myPinNoOwn"):c==="pin_taken"?t("myPinTaken"):errMsg(e); }
      finally{ const bb=$("#cf-mpsave"); if(bb) btnBusy(bb,false); } }; }
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
    if(pinProblem(p1,"owner")){ er.textContent=pinProblem(p1,"owner"); return; } if(p1!==p2){ er.textContent=t("pinMismatch"); return; }
    $("#cf-pin").disabled=true; try{ await write({action:"setPin",newPin:p1}); if(S.auth.tok){ if(!S.auth.personal) S.auth={...S.auth,...await pinCheckSet(p1),pinLen:p1.length}; } else S.auth={...S.auth,pin:p1}; ls.set("rb_auth",S.auth); $("#cf-p1").value=""; $("#cf-p2").value=""; er.textContent=""; toast(t("pinChanged")); }catch(e){ er.textContent=errMsg(e); } finally{ const b=$("#cf-pin"); if(b) b.disabled=false; } };
  if($("#cf-bk")) loadBackupCard();
  if($("#ppl-body")) loadOwnerCards();
  $("#cf-save").onclick=async()=>{ const btn=$("#cf-save");
    /* a PIN typed but not saved with its own button: say so instead of closing Settings and losing it */
    const pend=[["#cf-mp0","#cf-mp1","#cf-mp2","#cf-mperr","#cf-mpsave"],["#cf-p1","#cf-p2","#cf-perr","#cf-pin"]].find(g=>g.slice(0,-2).some(q=>{ const x=$(q); return x&&x.value.trim(); }));
    if(pend){ const er=$(pend[pend.length-2]), b=$(pend[pend.length-1]); if(er) er.textContent=t("pinUnsaved"); $("#cf-err").textContent=t("pinUnsaved"); cgFocus(pend[0]); if(b) b.scrollIntoView({block:"center"}); return; }
    btn.disabled=true;
    const nb=Math.floor(toNum($("#cf-bill").value)); if(!(nb>=1)){ btn.disabled=false; $("#cf-err").textContent=t("billNoBad"); cgFocus("#cf-bill"); return; }
    const ngb=Math.floor(toNum($("#cf-gbill").value)); if(!(ngb>=1)){ btn.disabled=false; $("#cf-err").textContent=t("billNoBad"); cgFocus("#cf-gbill"); return; }
    const gstin=$("#cf-gstin").value.trim().toUpperCase(); if(!gstinOk(gstin)){ btn.disabled=false; $("#cf-err").textContent=t("gstinBad"); cgFocus("#cf-gstin"); return; }
    const dg=toNum($("#cf-dgst").value); if(isNaN(dg)||dg<0||dg>100){ btn.disabled=false; $("#cf-err").textContent=t("defGst")+": 0–100"; cgFocus("#cf-dgst"); return; }
    const dh=$("#cf-dhsn").value.replace(/\s/g,"")||"3923";
    const data={ shopName:$("#cf-shop").value.trim(), units:c.units, defaultUnit:c.defaultUnit, roundTo:c.roundTo, billFooter:$("#cf-foot").value.trim(), ...(S.cfg.mode==="test"?{testNextBill:nb,testNextGstBill:ngb}:{nextBill:nb,nextGstBill:ngb}), shopGstin:gstin, shopAddress:$("#cf-addr").value.trim(), shopState:$("#cf-state").value, fyReset:$("#cf-fy").checked, defaultGst:dg, defaultHsn:dh };
    if(wqOn()){   // (v59) shown at once, saved in the background
      const x={...S.cfg, ...S.cfg.raw, ...data}; delete x.raw; applyConfig(x); wqAdd({k:"cfg", key:"cfg", body:{action:"setConfig",config:data}});
      saveCache(); closeSheet(); renderAll(); toast(t("settingsSaved")); return; }
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
