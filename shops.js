/* Rate Book: which shop this phone uses, and the links to its backend. API_URL (the original shop's Apps Script link),
   DIR_URL (the Directory), SHOP and per-shop phone storage (ls), the ?shop= link, shopGo / dirLookup, apiUrl, shopMismatch.
   Moved unchanged out of app.js (11 Oct 2026). Loads FIRST of the code files (right after strings.js): everything else reads
   phone storage through ls. While loading it needs nothing from the other files. After editing, run: node tools/stamp.js */
"use strict";
/* ============================================================
   PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL BETWEEN THE QUOTES
   (it looks like https://script.google.com/macros/s/AKfy.../exec)
   ============================================================ */
const API_URL = "https://script.google.com/macros/s/AKfycbxbvn-XbelK8mOeearCSHcnewrDevNfInjFggxH-60fzOiHpdEjkb9-BrJdfTOSVx_J/exec";
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
function apiUrl(){ return SHOP_MAIN ? (API_URL || ls.get("rb_api","")) : SHOP.api; }
/** A reply from a different shop than this phone uses: never applied. The saved link is checked with the Directory again. */
function shopMismatch(){ if(SHOP_MAIN || !DIR_URL) return; dirLookup(SHOP.code).then(sh=>{ if(sh.api && sh.api!==SHOP.api){ SHOP.api=sh.api; try{ localStorage.setItem("rb_shop",JSON.stringify({...SHOP,at:Date.now()})); }catch{} } }).catch(()=>{}); }
