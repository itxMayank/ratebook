/* Rate Book: the bill page. Paid / Credit / Part paid and "Paid by", bill numbers (normal / GST series, financial year),
   GST sums and the WhatsApp text, renderBill / updateBillTotals, test/real switching of the bill, open (held) bills, editing
   a past bill, finishBill and the queue of bills to send, cash given, adding items (addToBill, flyToBill), the quick qty strip,
   returning customers and customer suggestions, and the customer ✕. Declarations moved unchanged out of app.js (11 Oct 2026);
   the lines that wire buttons as the page loads stay in app.js (they need $ and run after everything is declared). Loads
   just before app.js; only declares things while loading. After editing, run: node tools/stamp.js */
"use strict";
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
  s+=poTextLine(S.po);
  if(normMobile(S.mob)) s+=`${t("mobL")}: ${S.mob.trim()}\n`;
  if(posLabel()) s+=`${t("posL")}: ${posLabel()}\n`;
  s+="\n";
  S.bill.forEach((l,i)=>{ const li=lineInfo(l); s+=`${i+1}. ${lineLabel(l)} (${li.hsn?t("hsnShort")+" "+li.hsn+", ":""}${t("gstPctL").replace(" %","")} ${fmtN(li.gst)}%)\n    ${qtyText(l.qty,l.unit)} × ${rateText(l)} = ${rs(l.qty*l.rate)}\n`; });
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
const draftSig=()=>JSON.stringify([S.bill,S.cust,S.mob,S.gst,S.igst,S.custGstin,S.pay,S.recv,S.posSel,S.pm||""].concat(poHas(S.po)?[S.po]:[]));   // (PO only when set, so older saved signatures still match)
/* The customer's purchase order (PO) a bill is made against: optional, mostly for company GST bills. S.po = {no, date (yyyy-mm-dd)}. */
function poNorm(p){ p=p||{}; return { no:String(p.no||"").slice(0,40), date:/^\d{4}-\d\d-\d\d$/.test(p.date||"")?p.date:"" }; }
function poHas(p){ return !!(p && (String(p.no||"").trim() || p.date)); }
function poOut(p){ return poHas(p) ? { no:String(p.no||"").trim(), date:p.date||"" } : null; }   // what's saved with the bill
function poDate(d){ return d ? d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4) : ""; }
function poTextLine(p){ if(!poHas(p)) return ""; const no=String(p.no||"").trim(); return [no?`${t("poLine")}: ${no}`:"", p.date?`${t("poDateLine")}: ${poDate(p.date)}`:""].filter(Boolean).join(" · ")+"\n"; }
function poSet(p){ S.po=poNorm(p); ls.set("rb_po",S.po); }
function poRender(){ const f=$("#po-f"); if(!f) return; const open=!!S.poOpen || poHas(S.po); f.hidden=!open; $("#po-add").hidden=open;
  const a=$("#po-no"), b=$("#po-date"); if(document.activeElement!==a) a.value=S.po.no; if(document.activeElement!==b) b.value=S.po.date; }
function hasAlt(it){ return !!(it && it.altUnit && +it.altQty>0); }
function altPrice(it){ return (it.altSell!=null && it.altSell!=="" && !isNaN(+it.altSell)) ? +it.altSell : r2((+it.sell||0)/(+it.altQty||1)); }
/* "NA" in the sheet = this item has no HSN (an empty cell means "use the shop's default HSN"). */
const HSN_NONE="NA";
function itemHsn(x){ if(x && String(x.hsn||"").toUpperCase()===HSN_NONE) return ""; return (x && x.hsn) || S.cfg.defaultHsn || "3923"; }
/** What to save from an item's HSN box: an emptied box = no HSN. */
function hsnSave(v){ v=String(v||"").replace(/\s/g,""); return v||HSN_NONE; }
/** " [HSN 3923, 18%]" on the bill's items summary; no HSN = " [18%]". */
function hsnTag(l){ const li=lineInfo(l); return ` [${li.hsn?"HSN "+li.hsn+", ":""}${li.gst}%]`; }
function itemGst(x){ return (x && x.gst!=null && x.gst!=="" && !isNaN(+x.gst)) ? +x.gst : (+S.cfg.defaultGst||0); }
/** Buy rate for one unit of this bill line (pack lines use buy ÷ packs). Saved on the line when it's added. */
function itemBuyFor(it,alt){ if(!it) return null; const b=+it.buy||0; return alt && hasAlt(it) ? r2(b/(+it.altQty||1)) : b; }
/** The item's list price (per its own unit) when the line was billed; lines from before 14 Oct 2026 use today's. Saved with the
    bill so the business page compares a discount with the price on that day, not a later one. */
function lineLp(l){ if(+l.lp>0) return +l.lp; const it=S.byId.get(l.id); return it && +it.sell>0 ? +it.sell : 0; }
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
/** The price list changed (another phone, this phone's edit, a reload): every bill still being made follows its items. Name,
    unit, HSN, GST and buy rate come from the item; the rate follows only if it was the item's price (a rate typed for this
    bill stays). Bills being edited or already shared are left as they were billed. Returns how many lines changed visibly. */
function billFollowLines(lines, old){ let n=0;
  (lines||[]).forEach(l=>{ const o=old.get(l.id), it=S.byId.get(l.id); if(!o||!it||o===it) return; let vis=false;
    const set=(k,v,quiet)=>{ if(v!==undefined && l[k]!==v){ l[k]=v; if(!quiet) vis=true; } };
    set("name",it.name); if(it.nameHi) set("nameHi",it.nameHi); set("unit",it.unit);
    const wasP = l.alt&&hasAlt(o) ? altPrice(o) : +o.sell||0;
    if(l.alt && !hasAlt(it)){ l.alt=false; l.rate=+it.sell||0; vis=true; }   // the pack size was removed from the item
    else { const nowP = l.alt ? altPrice(it) : +it.sell||0; if(Math.abs((+l.rate||0)-wasP)<0.005) set("rate",nowP); }
    if(String(l.hsn==null?"":l.hsn)===itemHsn(o)) set("hsn",itemHsn(it));
    if(l.gst!=null && +l.gst===itemGst(o)) set("gst",itemGst(it));
    if(l.buy!=null && +l.buy===itemBuyFor(o,!!l.alt)) set("buy",itemBuyFor(it,!!l.alt),true);
    if(+it.sell>0) set("lp",+it.sell,true);
    if(vis) n++; });
  return n; }
function billFollow(old, tell){ if(!old || !old.size || !S.byId) return;
  let n=0; if(!S.editing){ n=billFollowLines(S.bill, old); if(n){ saveBill(); if(document.getElementById("bill-lines")) renderBill(); } }
  const h=heldGet(); let hc=0; h.forEach(x=>{ if(!x.editing && x.d) hc+=billFollowLines(x.d.bill, old); }); if(hc){ heldSet(h); try{ renderHeld(); }catch{} }
  if(n && tell && !LOCK.on) toast(t("billFollowed")); }
function saveBill(){ ls.set("rb_bill",S.bill); renderBadge(); }
function renderBill(){
  const wrap=$("#bill-lines");
  { const n=$("#bill-n"); if(n){ n.hidden=!S.bill.length; n.textContent=S.bill.length?t("billN",S.bill.length):""; } }   // items on the bill (lines, not quantities)
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
  poRender();
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
  applyDraft({ bill:b.lines.map(l=>({id:l.id,name:l.name,nameHi:l.nameHi,unit:l.unit,rate:+l.rate||0,qty:+l.qty||1,hsn:l.hsn,gst:l.gst,alt:!!l.alt,buy:l.buy,lp:l.lp})), cust:b.customer, mob:b.mobile, gst:b.gst, igst:b.igst, custGstin:b.custGstin, po:b.po, ...billPayMode(b) });
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
    items:S.bill.map(l=>`${l.name} ${fmtN(l.qty)} ${l.unit} x ${l.rate}`+(S.gst?hsnTag(l):"")).join("; "),
    gst:!!S.gst, taxable:g?g.taxable:"", tax:g?g.tax:"", custGstin:S.gst?S.custGstin.trim().toUpperCase():"", igst:!!(S.gst&&S.igst), po:poOut(S.po),
    text:billText(), lines:S.bill.map(l=>({id:l.id,name:l.name,nameHi:lineName(l),unit:l.unit,rate:l.rate,qty:l.qty,hsn:lineInfo(l).hsn,gst:lineInfo(l).gst,alt:!!l.alt,buy:lineBuy(l),lp:lineLp(l)})) };
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
    items:S.bill.map(l=>`${l.name} ${fmtN(l.qty)} ${l.unit} x ${l.rate}`+(S.gst?hsnTag(l):"")).join("; "),
    gst:!!S.gst, taxable:g?g.taxable:"", tax:g?g.tax:"", custGstin:S.gst?S.custGstin.trim().toUpperCase():"", igst:!!(S.gst&&S.igst), po:poOut(S.po),
    text:billText(), lines:S.bill.map(l=>({id:l.id,name:l.name,nameHi:lineName(l),unit:l.unit,rate:l.rate,qty:l.qty,hsn:lineInfo(l).hsn,gst:lineInfo(l).gst,alt:!!l.alt,buy:lineBuy(l),lp:lineLp(l)})),
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
    items:S.bill.map(l=>`${l.name} ${fmtN(l.qty)} ${l.unit} x ${l.rate}`+(S.gst?hsnTag(l):"")).join("; "),
    gst:!!S.gst, taxable:g?g.taxable:"", tax:g?g.tax:"", custGstin:S.gst?S.custGstin.trim().toUpperCase():"", igst:!!(S.gst&&S.igst), po:poOut(S.po),
    text:billText(), lines:S.bill.map(l=>({id:l.id,name:l.name,nameHi:lineName(l),unit:l.unit,rate:l.rate,qty:l.qty,hsn:lineInfo(l).hsn,gst:lineInfo(l).gst,alt:!!l.alt,buy:lineBuy(l),lp:lineLp(l)})),
    id:Date.now().toString(36)+Math.random().toString(36).slice(2,8), env:S.cfg.mode,
    noToken:curBillDisp(), noLine:(S.gst?t("invNoLine",curBillDisp()):t("billNoLine",curBillDisp())), pos:S.gst?posLabel():"" };
  { const pf=profitOf(S.bill); rec.cost=pf.cost; rec.profit=pf.profit; }
  { const p=payInfo(rec.total); rec.pay=p.mode; rec.received=p.mode==="part"?p.recv:0; rec.due=p.due; rec.paidBy=p.pm; }
  S.lastBill={n:rec.n,customer:rec.customer,total:rec.total,link:rec.link}; ls.set("rb_lastbill",S.lastBill);
  const lastInv=invFromCurrent(); ls.set("rb_lastinv",lastInv);
  blcAdd(rec);
  rec.shared=!!opts.keep && !opts.wait; tookNo(rec.n, !!S.gst);   // wait: Share waits for the sheet before WhatsApp opens (shareConfirmed)
  const wasGst=!!S.gst; if(wasGst) S.cfg.nextGstBill=Math.max(auto, n+1); else S.cfg.nextBill=Math.max(auto, n+1); S.billNoOvr=null; ls.set("rb_billno",null); syncRaw(); saveCache();
  if(opts.keep){
    rememberCustomer(rec.mobile,rec.customer,rec.custGstin,rec.total,rec.due);
    if(rec.due>0){ const ds=ls.get(envKey("rb_dues_sum"),{total:0,n:0}); ds.total=r2((+ds.total||0)+rec.due); ls.set(envKey("rb_dues_sum"),ds); duesSub(); }
    S.editing={ id:rec.id, row:0, n:rec.n, date:new Date().toISOString(), edits:0, fy:curFY(), fresh:true }; S.editing.sig=draftSig();
    ls.set("rb_editing",S.editing); ls.set("rb_stash",null);
    S.billQ.push(rec); ls.set("rb_billq",S.billQ); flushBills();
    renderBill(); renderList(); if(!opts.wait) toast(t("billSavedKeep",dispNo(n,wasGst,curFY())));
    return;
  }
  ls.set(envKey("rb_draftat"),Date.now());
  S.bill=[]; S.cust=""; S.mob=""; S.custGstin=""; poSet(null); S.poOpen=false; S.gst=false; S.igst=false; ls.set("rb_gst",false); ls.set("rb_igst",false); ls.set("rb_cust",""); ls.set("rb_mob",""); ls.set("rb_cgstin",""); $("#cust").value=""; $("#cust-mob").value=""; $("#cust-gstin").value="";
  saveBill(); renderBill(); renderList();
  toast(t("billSent",n,seriesNext(wasGst)));
  rememberCustomer(rec.mobile,rec.customer,rec.custGstin,rec.total,rec.due);
  if(rec.due>0){ const ds=ls.get(envKey("rb_dues_sum"),{total:0,n:0}); ds.total=r2((+ds.total||0)+rec.due); ls.set(envKey("rb_dues_sum"),ds); duesSub(); }
  S.pay="paid"; S.recv=""; S.pm=""; ls.set("rb_pay","paid"); ls.set("rb_recv",""); ls.set("rb_pm",""); $("#pay-recv").value=""; renderPay(); S.cash=""; $("#cash-in").value="";
  S.profitShown=false; S.custAuto=""; S.custQ=""; showCustHint(null); updateBillTotals();
  S.billQ.push(rec); ls.set("rb_billq",S.billQ); flushBills();
  if(prGet().auto) billConfirmed(rec.id, NO_WAIT_MS).then(()=>{ const li=ls.get("rb_lastinv",null); printInv(li && li.date===lastInv.date ? li : lastInv); });   // "Print automatically after Done": with the number the sheet confirmed
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
        if(S.lastBill && S.lastBill.n===rec.n){ S.lastBill.n=j.renumbered.to;
          if(S.lastBill.link && rec.noLine){ const tk=String(rec.noToken||j.renumbered.from), nl=String(rec.noLine).replace(tk, tk.replace(new RegExp(j.renumbered.from+"$"), String(j.renumbered.to))); S.lastBill.link=S.lastBill.link.replace(encodeURIComponent(rec.noLine), encodeURIComponent(nl)); }   // "Share again" with the new number
          ls.set("rb_lastbill",S.lastBill); renderLastBill(); }
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
/* Two phones can show the same next number (both read it before either bill reached the sheet). The sheet never saves a
   number twice (takeBill gives the second one the next free number), so what matters is what the customer sees: Share of a
   new bill saves it first and opens WhatsApp only once the sheet has confirmed its number (usually 1-2 s; the Share button
   spins meanwhile). Offline, or no answer within NO_WAIT_MS: WhatsApp opens with this phone's number as before, and if the
   sheet renumbers it later the "Bill number changed" note says to send it again. */
const NO_WAIT_MS=4000;
/** Resolves true once bill `id` has left the send queue (the sheet has it, renumbered if needed), false if sending
    stopped (offline, refused) or took longer than ms. */
function billConfirmed(id, ms){
  const t0=Date.now();
  return new Promise(res=>{ const tick=()=>{
    if(!S.billQ.some(x=>x.id===id)) return res(true);
    if(!flushing || Date.now()-t0>ms) return res(false);
    setTimeout(tick,80); }; tick(); });
}
async function shareConfirmed(){
  const btn=$("#bill-wa");
  finishBill({keep:true, wait:true});
  const ed=S.editing; if(!ed || !ed.fresh) return;
  const al=btn.getAttribute("aria-label"); btn.classList.add("busy"); btn.setAttribute("aria-busy","true"); btn.setAttribute("aria-label",t("saving"));   // a centred spinner, same width (app.css)
  btn.insertAdjacentHTML("beforeend",`<span class="wa-wait" aria-hidden="true">${LD("sm on-dark")}</span>`);
  const okNo=await billConfirmed(ed.id, NO_WAIT_MS);
  btn.classList.remove("busy"); btn.removeAttribute("aria-busy"); if(al) btn.setAttribute("aria-label",al); else btn.removeAttribute("aria-label"); const ww=btn.querySelector(".wa-wait"); if(ww) ww.remove();
  if(S.editing!==ed) return;   // the bill was closed meanwhile
  if(!okNo){ const q=S.billQ.find(x=>x.id===ed.id); if(q){ q.shared=true; ls.set("rb_billq",S.billQ); } }   // still waiting: a later renumber must say "send it again"
  const url=waLink(), no=dispNo(ed.n,S.gst,ed.fy); btn.href=url;
  S.pendShare=true; ls.set("rb_pshare",1);
  const w=window.open(url,"_blank");
  if(w){ try{ w.opener=null; }catch{} toast(t("billSavedKeep",no)); return; }
  // the phone blocked opening WhatsApp after the wait (some iPhones): one more tap
  S.pendShare=false; ls.set("rb_pshare",0);
  openSheet(t("billSavedKeep",no), `<p class="note" style="margin:0">${esc(t("shareTapD"))}</p>`, `<a class="btn wa" id="sc-wa" target="_blank" rel="noopener" href="${esc(url)}">${esc(t("shareWa"))}</a>`);
  $("#sc-wa").onclick=()=>{ S.pendShare=true; ls.set("rb_pshare",1); setTimeout(closeSheet,300); };
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
/* ---------------- Bill actions ---------------- */
function decFromBill(id){
  const i=S.bill.findIndex(x=>x.id===id); if(i<0) return;
  const l=S.bill[i]; l.qty=stepQty(l.qty,l.unit,false); if(l.qty<=0) S.bill.splice(i,1);
  saveBill(); if(S.tab==="bill") renderBill(); else renderList();
}
function addToBill(id,qty=1){
  const it=S.byId.get(id); if(!it) return;
  const l=S.bill.find(x=>x.id===id);
  if(l) l.qty=Math.round((+l.qty+qty)*1000)/1000; else S.bill.push({id,name:it.name,nameHi:it.nameHi||toHindi(it.name),unit:it.unit,rate:+it.sell||0,qty,hsn:itemHsn(it),gst:itemGst(it),buy:itemBuyFor(it,false),lp:+it.sell||0});
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
/* Scrolling moves the strip with its line; it closes once the line leaves the screen. */
function qpFollow(e){ const el=$("#qpick"); if(!el || el.hidden || (e && e.target && e.target.closest && e.target.closest("#qpick"))) return;
  const a=$("#bq-"+el.dataset.i); if(!a){ qpClose(); return; } const r=a.getBoundingClientRect(), vh=window.visualViewport?window.visualViewport.height:innerHeight;
  if(r.bottom<0 || r.top>vh || (!r.width && !r.height)) qpClose(); else qpPlace(el,a); }
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
function setOpen(btnSel,panelSel,key,open){ $(panelSel).hidden=!open; $(btnSel).setAttribute("aria-expanded",open); ls.set(key,open); }
/* ---------------- Bill page: one ✕ clears customer name, mobile and GSTIN ---------------- */
function custXSync(){ const b=$("#cust-x"); if(!b) return; const on=!!(S.cust.trim()||S.mob.trim()||String(S.custGstin||"").trim()); b.hidden=!on; $(".bh-cust").classList.toggle("has-x",on); }
function custClear(){ S.cust=""; S.mob=""; S.custGstin=""; S.custAuto=""; S.custQ="";
  ["#cust","#cust-mob","#cust-gstin"].forEach(k=>{ const el=$(k); if(el){ el.value=""; el.classList.remove("need"); } }); ["rb_cust","rb_mob","rb_cgstin"].forEach(k=>ls.set(k,""));
  const me=$("#mob-err"); if(me) me.textContent=""; const ge=$("#gstin-err"); if(ge) ge.textContent=""; sugClose(); showCustHint(null); updateBillTotals(); custXSync(); }
/* Sign-in and app lock: lock.js. LOCK stays here because it reads phone storage while loading. */
const LOCK_MS=5*60000, LOCK={on:false, fails:ls.get("rb_lockfail",{n:0,until:0})};
