/* Rate Book: sign-in, the lock screen (PIN, fingerprint/face), new-phone approval wait, shop code / switch shop on the
   lock screen, signing out, and refreshMe/applyMe (role and settings re-checked once per start). Moved unchanged out of
   app.js (11 Oct 2026). Loads before app.js; only declares things while loading. LOCK / LOCK_MS live in app.js.
   After editing, run: node tools/stamp.js */
"use strict";
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
/* ---------------- Unlock / lock ---------------- */
function openUnlock(){ appLock(); }
/* ---------------- Sign-in and app lock ----------------
 * Signing in (PIN, online) gets a token from the sheet. The phone keeps the token, never the PIN, plus a PBKDF2 check value
 * (pinH/pinS) so the lock screen works offline. The app locks on every fresh open and after LOCK_MS in the background; while
 * locked nothing shows (html.locked hides everything but #applock), but bills waiting to send still go. Fingerprint/face uses
 * the phone's own unlock (WebAuthn, platform authenticator) as a local gate; the token stays the real credential. */
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
  document.documentElement.classList.remove("locked"); renderAll(); if(S.pendShare) setTimeout(askSent,400);
  { const u=ls.get("rb_updated",0); if(u){ ls.set("rb_updated",0); if(Date.now()-u<6*3600e3) setTimeout(()=>toast(t("appUpdated")),500); } } }   // the app loaded a newer version by itself (updGo): say so once
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
/** Sign this phone out (the token is ended on the sheet when online). */
function lockPhone(){ const a=S.auth; if(a&&a.tok) apiPost0({action:"signOut"}).catch(()=>{}); signedOut(); }
