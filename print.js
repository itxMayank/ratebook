/* Rate Book: PDF invoices and printing (bill ⌄ menu, Last bill, past bills, Settings → Printer). Split out of app.js on
   11 Oct 2026. A plain script in global scope, loaded before app.js: while loading it only declares things, so it needs
   nothing from app.js until something is printed or a PDF is made. Uses app.js helpers (S, t, gstCalcFor, PM_EN, shareFile,
   toast…) only when called; jsPDF itself (pdf.js) still loads on first use. Run  node tools/stamp.js  after editing. */
"use strict";
/* ---------------- PDF invoice (jsPDF, loaded from pdf.js only when needed) ---------------- */
let pdfLib=null;
function loadPdf(){ if(window.jspdf) return Promise.resolve(window.jspdf); if(pdfLib) return pdfLib;
  pdfLib=new Promise((res,rej)=>{ const sc=document.createElement("script"); sc.src="pdf.js"; sc.onload=()=>res(window.jspdf); sc.onerror=()=>{ pdfLib=null; rej(new Error("pdf")); }; document.head.appendChild(sc); }); return pdfLib; }
function invFromCurrent(){
  const p=payInfo(billTotal());
  return { gst:!!S.gst, igst:!!S.igst, no:curBillDisp(), date:S.editing&&S.editing.date?S.editing.date:new Date().toISOString(), cust:{name:S.cust.trim(),mobile:mob10(S.mob)||S.mob.trim(),gstin:S.custGstin.trim().toUpperCase()}, pos:S.gst?posLabel():"",
    lines:S.bill.map(l=>({name:l.name,hsn:lineInfo(l).hsn,qty:+l.qty||0,unit:l.unit,rate:+l.rate||0,gst:lineInfo(l).gst})), pay:p, cancelled:false };
}
function invFromBill(b){
  const lines=(b.lines&&b.lines.length?b.lines:linesFromItems(b)).map(l=>({name:l.name,hsn:l.hsn||"",qty:+l.qty||0,unit:l.unit||"",rate:+l.rate||0,gst:+l.gst||0}));
  const pay = !b.pay||b.pay==="Paid"||b.pay==="Cleared" ? {mode:"paid",recv:b.total,due:0} : {mode:b.paid>0?"part":"credit",recv:+b.paid||0,due:+b.due||0};
  pay.pm = PM_KEYS[String(b.paidBy||"").toLowerCase()] ? String(b.paidBy).toLowerCase() : "";
  return { gst:!!b.gst, igst:!!b.igst, no:dispNo(b.n,b.gst,b.fy), date:b.date, cust:{name:b.customer||"",mobile:b.mobile||"",gstin:b.custGstin||""}, pos:b.pos||"", lines, pay, cancelled:!!b.cancelled };
}
async function makeInvoicePdf(inv){
  const lib=await loadPdf(); const doc=new lib.jsPDF({unit:"pt",format:"a4"}); const W=doc.internal.pageSize.getWidth(), M=40;
  const R=n=>"Rs. "+Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
  const asc=v=>String(v||"").replace(/₹/g,"Rs.").replace(/[^\x20-\x7E]/g,"");
  let y=48;
  doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.text(asc(S.cfg.shopName)||"Rate Book", M, y);
  doc.setFontSize(12); doc.text(inv.gst?"TAX INVOICE":"BILL", W-M, y, {align:"right"});
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5); y+=15;
  const left=[]; if(S.cfg.shopAddress) left.push(asc(S.cfg.shopAddress)); if(inv.gst&&S.cfg.shopGstin) left.push("GSTIN: "+S.cfg.shopGstin); if(inv.gst&&shopStateCode()) left.push("State: "+stateName(shopStateCode())+" ("+shopStateCode()+")");
  const right=[(inv.gst?"Invoice No: ":"Bill No: ")+inv.no, "Date: "+fmtDate(inv.date)]; if(inv.gst&&inv.pos) right.push("Place of supply: "+asc(inv.pos));
  const rows=Math.max(left.length,right.length); for(let i=0;i<rows;i++){ if(left[i]) doc.text(left[i],M,y+i*13); if(right[i]) doc.text(right[i],W-M,y+i*13,{align:"right"}); }
  y+=rows*13+6;
  if(S.cfg.mode==="test"){ doc.setTextColor(184,122,11); doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("TEST BILL - practice only, not a valid invoice",W/2,y+2,{align:"center"}); doc.setTextColor(0); doc.setFont("helvetica","normal"); doc.setFontSize(9.5); y+=14; }
  if(inv.cancelled){ doc.setTextColor(200,30,30); doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.text("CANCELLED",W/2,y+4,{align:"center"}); doc.setTextColor(0); doc.setFont("helvetica","normal"); doc.setFontSize(9.5); y+=18; }
  doc.setDrawColor(220); doc.line(M,y,W-M,y); y+=14;
  doc.setFont("helvetica","bold"); doc.text("Bill to",M,y); doc.setFont("helvetica","normal"); y+=13;
  const to=[asc(inv.cust.name)||"Cash customer"]; if(inv.cust.mobile) to.push("Mobile: "+inv.cust.mobile); if(inv.gst&&inv.cust.gstin) to.push("GSTIN: "+inv.cust.gstin);
  to.forEach((l,i)=>doc.text(l,M,y+i*13)); y+=to.length*13+8;
  const g=inv.gst ? gstCalcFor(inv.lines, inv.igst) : null;
  const body=inv.lines.map((l,i)=>{ const amt=r2(l.qty*l.rate);
    return inv.gst ? [i+1, asc(l.name), l.hsn, asc(qtyText(l.qty,l.unit,true)), R(l.rate)+(isPart(l.qty,l.unit)?"/"+asc(l.unit):""), R(amt), fmtN(l.gst)+"%", R(r2(amt*l.gst/100)), R(r2(amt*(1+l.gst/100)))]
                   : [i+1, asc(l.name), asc(qtyText(l.qty,l.unit,true)), R(l.rate)+(isPart(l.qty,l.unit)?"/"+asc(l.unit):""), R(amt)]; });
  doc.autoTable({ startY:y, margin:{left:M,right:M}, head:[inv.gst?["#","Item","HSN","Qty","Rate","Taxable","GST","Tax","Amount"]:["#","Item","Qty","Rate","Amount"]], body,
    styles:{fontSize:8.8,cellPadding:4}, headStyles:{fillColor:[22,23,26],textColor:255}, didParseCell:d=>{ if(d.section==="head" && (inv.gst?[4,5,6,7,8]:[3,4]).includes(d.column.index)) d.cell.styles.halign="right"; }, columnStyles: inv.gst?{0:{cellWidth:20},4:{halign:"right"},5:{halign:"right"},6:{halign:"right"},7:{halign:"right"},8:{halign:"right"}}:{0:{cellWidth:20},3:{halign:"right"},4:{halign:"right"}} });
  y=doc.lastAutoTable.finalY+12;
  const sum=[]; let total;
  if(g){ sum.push(["Taxable value",R(g.taxable)]); g.rows.forEach(r=>sum.push([r.kind==="I"?`IGST ${fmtN(r.rate)}%`:`${r.kind==="C"?"CGST":"SGST"} ${fmtN(r.rate/2)}%`,R(r.v)])); if(g.roundOff) sum.push(["Round off",(g.roundOff>0?"+":"-")+R(Math.abs(g.roundOff)).slice(4)]); total=g.total; }
  else total=r2(inv.lines.reduce((a,l)=>a+l.qty*l.rate,0));
  const totIdx=sum.length; sum.push([inv.gst?"Total (incl. GST)":"Total",R(total)]);
  if(inv.pay && inv.pay.mode!=="paid"){ sum.push(["Paid",R(inv.pay.recv)]); sum.push(["Balance due",R(inv.pay.due)]); }
  if(inv.pay && PM_EN[inv.pay.pm]) sum.push(["Paid by",PM_EN[inv.pay.pm]]);
  doc.autoTable({ startY:y, margin:{left:W/2,right:M}, body:sum, theme:"plain", styles:{fontSize:9.5,cellPadding:3}, columnStyles:{1:{halign:"right"}},
    didParseCell:d=>{ if(d.row.index===totIdx) d.cell.styles.fontStyle="bold"; } });
  y=doc.lastAutoTable.finalY+10;
  doc.setFontSize(9); doc.setFont("helvetica","italic"); doc.text(doc.splitTextToSize("Amount in words: "+inWords(total),W-2*M),M,y); doc.setFont("helvetica","normal"); y+=24;
  if(g){ const hs={}; inv.lines.forEach(l=>{ const k=(l.hsn||"-")+"|"+l.gst; const a=r2(l.qty*l.rate); hs[k]=hs[k]||{hsn:l.hsn||"-",rate:l.gst,tx:0}; hs[k].tx=r2(hs[k].tx+a); });
    const hb=Object.values(hs).map(h=>{ const tax=r2(h.tx*h.rate/100); return inv.igst?[h.hsn,R(h.tx),fmtN(h.rate)+"%","-","-",R(tax),R(tax)]:[h.hsn,R(h.tx),fmtN(h.rate)+"%",R(r2(tax/2)),R(r2(tax/2)),"-",R(tax)]; });
    doc.autoTable({ startY:y, margin:{left:M,right:M}, head:[["HSN","Taxable","Rate","CGST","SGST","IGST","Total tax"]], body:hb, styles:{fontSize:8.5,cellPadding:3}, headStyles:{fillColor:[238,240,243],textColor:20},
      didParseCell:d=>{ if(d.section==="head" && [1,3,4,5,6].includes(d.column.index)) d.cell.styles.halign="right"; },
      columnStyles:{1:{halign:"right"},3:{halign:"right"},4:{halign:"right"},5:{halign:"right"},6:{halign:"right"}} });
    y=doc.lastAutoTable.finalY+14; }
  doc.setFontSize(8.5); doc.setTextColor(110);
  if(S.cfg.billFooter) { doc.text(asc(S.cfg.billFooter),M,y); y+=12; }
  doc.text("This is a computer-generated "+(inv.gst?"invoice":"bill")+".",M,y);
  return doc.output("blob");
}

/* ---------------- Printing (normal and GST bills) ----------------
 * Per phone / laptop (rb_print): paper a4 | a5 | 80 | 58 (mm roll), how a roll printer is reached (via):
 *   system — the phone/laptop print screen (office printers, USB/Wi-Fi receipt printers with a driver)
 *   rawbt  — Android + Bluetooth receipt printer through the free RawBT app (ESC/POS sent straight to it)
 *   image  — share a receipt picture to the printer maker's app (iPhone Bluetooth printers)
 * and auto (print after Done). A4/A5 print a full invoice; 58/80 mm print a narrow receipt. All from one model (inv). */
const PR_PAPERS=["a4","a5","80","58"];
function prGet(){ const d={paper:"a4",via:"system",auto:false}; const v=ls.get("rb_print",null); return v&&typeof v==="object"?{...d,...v}:d; }
function prSet(v){ ls.set("rb_print",v); }
const prRoll=p=>p==="80"||p==="58";
const prCols=p=>p==="58"?32:48;
const prMoney=n=>Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
/** Every number a printout needs, worked out once (same sums as the bill screen and the PDF). */
function prCalc(inv){
  const g=inv.gst ? gstCalcFor(inv.lines, inv.igst) : null;
  const total=g ? g.total : r2(inv.lines.reduce((a,l)=>a+l.qty*l.rate,0));
  const taxes=g ? g.rows.map(r=>({label:r.kind==="I"?`IGST ${fmtN(r.rate)}%`:`${r.kind==="C"?"CGST":"SGST"} ${fmtN(r.rate/2)}%`, v:r.v})) : [];
  return {g,total,taxes,due:inv.pay&&inv.pay.mode!=="paid"};
}
const prDate=d=>{ const x=d?new Date(d):new Date(); return x.toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"})+" "+x.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"}); };
const prAsc=v=>String(v||"").replace(/₹/g,"Rs.").replace(/[–—]/g,"-").replace(/×/g,"x").replace(/[^\x20-\x7E]/g,"");

/* ---- text receipt (RawBT and the shared picture): fixed columns ---- */
function prWrap(s,w){ const out=[]; let line=""; String(s||"").split(/\s+/).forEach(word=>{ while(word.length>w){ if(line){ out.push(line); line=""; } out.push(word.slice(0,w)); word=word.slice(w); } if(!word) return; if(!line) line=word; else if(line.length+1+word.length<=w) line+=" "+word; else { out.push(line); line=word; } }); if(line) out.push(line); return out.length?out:[""]; }
const prLR=(l,r,w)=>{ l=String(l); r=String(r); if(l.length+r.length+1>w) l=l.slice(0,Math.max(0,w-r.length-1)); return l+" ".repeat(Math.max(1,w-l.length-r.length))+r; };
const prC=(s,w)=>{ s=String(s).slice(0,w); const p=Math.floor((w-s.length)/2); return " ".repeat(p)+s; };
/** Lines of {t, b (bold), c (centre), big} for a w-character roll. */
function receiptLines(inv,w){
  const c=prCalc(inv), L=[], hr={t:"-".repeat(w)}, push=(t,o)=>L.push({t,...(o||{})});
  prWrap(prAsc(S.cfg.shopName)||"Rate Book",Math.floor(w/2)).forEach(x=>push(x,{c:1,b:1,big:1}));   // double size: half as many characters fit
  if(S.cfg.shopAddress) prWrap(prAsc(S.cfg.shopAddress),w).forEach(x=>push(x,{c:1}));
  if(inv.gst && S.cfg.shopGstin) push("GSTIN: "+S.cfg.shopGstin,{c:1});
  L.push(hr);
  push(inv.gst?"TAX INVOICE":"BILL",{c:1,b:1});
  if(S.cfg.mode==="test") push("TEST BILL - not a real invoice",{c:1});
  if(inv.cancelled) push("*** CANCELLED ***",{c:1,b:1});
  push((inv.gst?"Invoice":"Bill")+" No: "+inv.no,{b:1}); push("Date: "+prDate(inv.date));
  if(inv.cust.name) prWrap("To: "+prAsc(inv.cust.name),w).forEach(x=>push(x)); if(inv.cust.mobile) push("Mobile: "+inv.cust.mobile);   // wrapped: a 58 mm roll fits only 32 characters
  if(inv.gst && inv.cust.gstin) push("GSTIN: "+inv.cust.gstin); if(inv.gst && inv.pos) prWrap("Place of supply: "+prAsc(inv.pos),w).forEach(x=>push(x));
  L.push(hr); push(prLR("Item","Amount",w),{b:1}); L.push(hr);
  inv.lines.forEach((l,i)=>{ prWrap(`${i+1}. ${prAsc(l.name)}`,w).forEach(x=>push(x));
    const q=prAsc(`${qtyText(l.qty,l.unit,true)} x ${prMoney(l.rate).replace(/\.00$/,"")}${isPart(l.qty,l.unit)?"/"+l.unit:""}`);
    push(prLR("   "+q, prMoney(r2(l.qty*l.rate)), w));
    if(inv.gst) push(`   ${l.hsn?"HSN "+l.hsn+"  ":""}GST ${fmtN(l.gst)}%`); });
  L.push(hr);
  if(c.g){ push(prLR("Taxable value",prMoney(c.g.taxable),w)); c.taxes.forEach(x=>push(prLR(x.label,prMoney(x.v),w))); if(c.g.roundOff) push(prLR("Round off",(c.g.roundOff>0?"+":"-")+prMoney(Math.abs(c.g.roundOff)),w)); }
  if(w>=40) push(prLR("TOTAL","Rs."+prMoney(c.total),Math.floor(w/2)),{b:1,big:1}); else push(prLR("TOTAL","Rs. "+prMoney(c.total),w),{b:1});
  if(c.due){ push(prLR("Paid",prMoney(inv.pay.recv),w)); push(prLR("Balance due",prMoney(inv.pay.due),w),{b:1}); }
  if(inv.pay && PM_EN[inv.pay.pm]) push(prLR("Paid by",PM_EN[inv.pay.pm],w));
  if(inv.gst) prWrap(prAsc(inWords(c.total)),w).forEach(x=>push(x));
  L.push(hr);
  if(S.cfg.billFooter) prWrap(prAsc(S.cfg.billFooter),w).forEach(x=>push(x,{c:1}));
  push("Thank you!",{c:1});
  return L.map(x=>({...x, t: x.c ? prC(x.t, x.big?Math.floor(w/2):w) : x.t}));
}
/** ESC/POS bytes for RawBT: init, centre/bold/double size where marked, feed and cut. */
function escpos(lines){
  const b=[0x1B,0x40]; const txt=s=>{ for(const ch of s) b.push(ch.charCodeAt(0)&0x7F); b.push(0x0A); };
  lines.forEach(x=>{ b.push(0x1B,0x61,x.c?1:0); b.push(0x1B,0x45,x.b?1:0); b.push(0x1D,0x21,x.big?0x11:0x00); txt(x.c?x.t.trim():x.t); });
  b.push(0x1B,0x61,0,0x1B,0x45,0,0x1D,0x21,0); b.push(0x1B,0x64,4); b.push(0x1D,0x56,0x41,0x03);
  return new Uint8Array(b);
}
function prRawbt(inv,paper){
  const bytes=escpos(receiptLines(inv,prCols(paper))); let s=""; bytes.forEach(x=>s+=String.fromCharCode(x));
  const b64=btoa(s);
  location.href=`intent:base64,${b64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;   // opens RawBT (or its Play Store page if not installed)
}
/** Receipt as a picture (384 px wide for 58 mm, 576 px for 80 mm — the printers' dot widths), for printer apps. */
function receiptPng(inv,paper){
  const w=prCols(paper), W=paper==="58"?384:576, cw=W/w, fs=Math.floor(cw/0.6), lh=Math.round(fs*1.35), lines=receiptLines(inv,w);
  const cv=document.createElement("canvas"); cv.width=W; cv.height=lines.reduce((a,x)=>a+lh*(x.big?2:1),0)+lh*3;
  const g=cv.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,cv.width,cv.height); g.fillStyle="#000"; g.textBaseline="top";
  let y=lh;
  lines.forEach(x=>{ const sz=x.big?fs*2:fs; g.font=`${x.b?"bold ":""}${sz}px "Courier New",Courier,monospace`;
    g.fillText(x.t, 0, y); y+=lh*(x.big?2:1); });
  return new Promise(res=>cv.toBlob(res,"image/png"));
}

/* ---- HTML printouts for the print screen ---- */
function prHtmlInvoice(inv){
  const c=prCalc(inv), R=n=>"₹"+prMoney(n), e=esc;
  const head=`<div class="pi-top"><div><h1>${e(S.cfg.shopName||"Rate Book")}</h1>${S.cfg.shopAddress?`<div>${e(S.cfg.shopAddress)}</div>`:""}${inv.gst&&S.cfg.shopGstin?`<div>GSTIN: ${e(S.cfg.shopGstin)}</div>`:""}${inv.gst&&shopStateCode()?`<div>State: ${e(stateName(shopStateCode()))} (${e(shopStateCode())})</div>`:""}</div>
    <div class="r"><h2>${inv.gst?"TAX INVOICE":"BILL"}</h2><div>${inv.gst?"Invoice":"Bill"} No: <b>${e(inv.no)}</b></div><div>Date: ${e(prDate(inv.date))}</div>${inv.gst&&inv.pos?`<div>Place of supply: ${e(inv.pos)}</div>`:""}</div></div>`;
  const flags=(S.cfg.mode==="test"?`<div class="pi-flag test">TEST BILL - practice only, not a valid invoice</div>`:"")+(inv.cancelled?`<div class="pi-flag cx">CANCELLED</div>`:"");
  const to=`<div class="pi-to"><b>Bill to</b><div>${e(inv.cust.name||"Cash customer")}</div>${inv.cust.mobile?`<div>Mobile: ${e(inv.cust.mobile)}</div>`:""}${inv.gst&&inv.cust.gstin?`<div>GSTIN: ${e(inv.cust.gstin)}</div>`:""}</div>`;
  const rows=inv.lines.map((l,i)=>{ const a=r2(l.qty*l.rate), rate=R(l.rate)+(isPart(l.qty,l.unit)?"/"+e(l.unit):"");
    return inv.gst ? `<tr><td>${i+1}</td><td>${e(l.name)}</td><td>${e(l.hsn||"")}</td><td class="r">${e(qtyText(l.qty,l.unit,true))}</td><td class="r">${rate}</td><td class="r">${R(a)}</td><td class="r">${fmtN(l.gst)}%</td><td class="r">${R(r2(a*l.gst/100))}</td><td class="r">${R(r2(a*(1+l.gst/100)))}</td></tr>`
                   : `<tr><td>${i+1}</td><td>${e(l.name)}</td><td class="r">${e(qtyText(l.qty,l.unit,true))}</td><td class="r">${rate}</td><td class="r">${R(a)}</td></tr>`; }).join("");
  const th=inv.gst?`<tr><th>#</th><th>Item</th><th>HSN</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Taxable</th><th class="r">GST</th><th class="r">Tax</th><th class="r">Amount</th></tr>`:`<tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>`;
  let sum=""; if(c.g){ sum+=`<tr><td>Taxable value</td><td class="r">${R(c.g.taxable)}</td></tr>`+c.taxes.map(x=>`<tr><td>${e(x.label)}</td><td class="r">${R(x.v)}</td></tr>`).join(""); if(c.g.roundOff) sum+=`<tr><td>Round off</td><td class="r">${c.g.roundOff>0?"+":"−"}${R(Math.abs(c.g.roundOff))}</td></tr>`; }
  sum+=`<tr class="tot"><td>${inv.gst?"Total (incl. GST)":"Total"}</td><td class="r">${R(c.total)}</td></tr>`;
  if(c.due) sum+=`<tr><td>Paid</td><td class="r">${R(inv.pay.recv)}</td></tr><tr class="tot"><td>Balance due</td><td class="r">${R(inv.pay.due)}</td></tr>`;
  if(inv.pay && PM_EN[inv.pay.pm]) sum+=`<tr><td>Paid by</td><td class="r">${PM_EN[inv.pay.pm]}</td></tr>`;
  let hsn=""; if(c.g){ const hs={}; inv.lines.forEach(l=>{ const k=(l.hsn||"-")+"|"+l.gst; hs[k]=hs[k]||{hsn:l.hsn||"-",rate:l.gst,tx:0}; hs[k].tx=r2(hs[k].tx+r2(l.qty*l.rate)); });
    hsn=`<table class="pi-hsn"><tr><th>HSN</th><th class="r">Taxable</th><th class="r">Rate</th>${inv.igst?`<th class="r">IGST</th>`:`<th class="r">CGST</th><th class="r">SGST</th>`}<th class="r">Total tax</th></tr>${Object.values(hs).map(h=>{ const tax=r2(h.tx*h.rate/100); return `<tr><td>${e(h.hsn)}</td><td class="r">${R(h.tx)}</td><td class="r">${fmtN(h.rate)}%</td>${inv.igst?`<td class="r">${R(tax)}</td>`:`<td class="r">${R(r2(tax/2))}</td><td class="r">${R(r2(tax/2))}</td>`}<td class="r">${R(tax)}</td></tr>`; }).join("")}</table>`; }
  return `<div class="pi">${head}${flags}${to}<table class="pi-items">${th}${rows}</table><table class="pi-sum">${sum}</table><div class="pi-words">Amount in words: ${e(inWords(c.total))}</div>${hsn}
    <div class="pi-foot">${S.cfg.billFooter?`<div>${e(S.cfg.billFooter)}</div>`:""}<div>This is a computer-generated ${inv.gst?"invoice":"bill"}.</div></div></div>`;
}
function prHtmlReceipt(inv){
  const c=prCalc(inv), m=prMoney, e=esc, row=(l,r,cls)=>`<div class="pr-lr${cls?" "+cls:""}"><span>${l}</span><span>${r}</span></div>`;
  let h=`<div class="pr-c pr-shop">${e(S.cfg.shopName||"Rate Book")}</div>`;
  if(S.cfg.shopAddress) h+=`<div class="pr-c">${e(S.cfg.shopAddress)}</div>`; if(inv.gst&&S.cfg.shopGstin) h+=`<div class="pr-c">GSTIN: ${e(S.cfg.shopGstin)}</div>`;
  h+=`<hr><div class="pr-c pr-b">${inv.gst?"TAX INVOICE":"BILL"}</div>`;
  if(S.cfg.mode==="test") h+=`<div class="pr-c">TEST BILL - not a real invoice</div>`; if(inv.cancelled) h+=`<div class="pr-c pr-b">*** CANCELLED ***</div>`;
  h+=`<div>${inv.gst?"Invoice":"Bill"} No: <b>${e(inv.no)}</b></div><div>Date: ${e(prDate(inv.date))}</div>`;
  if(inv.cust.name) h+=`<div>To: ${e(inv.cust.name)}</div>`; if(inv.cust.mobile) h+=`<div>Mobile: ${e(inv.cust.mobile)}</div>`;
  if(inv.gst&&inv.cust.gstin) h+=`<div>GSTIN: ${e(inv.cust.gstin)}</div>`; if(inv.gst&&inv.pos) h+=`<div>Place of supply: ${e(inv.pos)}</div>`;
  h+=`<hr>`+row("<b>Item</b>","<b>Amount</b>")+`<hr>`;
  inv.lines.forEach((l,i)=>{ h+=`<div class="pr-it">${i+1}. ${e(l.name)}</div>`+row(`&nbsp;&nbsp;${e(qtyText(l.qty,l.unit,true))} × ${m(l.rate).replace(/\.00$/,"")}${isPart(l.qty,l.unit)?"/"+e(l.unit):""}`, m(r2(l.qty*l.rate)));
    if(inv.gst) h+=`<div class="pr-sm">&nbsp;&nbsp;${l.hsn?"HSN "+e(l.hsn)+" · ":""}GST ${fmtN(l.gst)}%</div>`; });
  h+=`<hr>`;
  if(c.g){ h+=row("Taxable value",m(c.g.taxable)); c.taxes.forEach(x=>h+=row(e(x.label),m(x.v))); if(c.g.roundOff) h+=row("Round off",(c.g.roundOff>0?"+":"−")+m(Math.abs(c.g.roundOff))); }
  h+=row("TOTAL","₹"+m(c.total),"pr-tot");
  if(c.due){ h+=row("Paid",m(inv.pay.recv)); h+=row("<b>Balance due</b>","<b>"+m(inv.pay.due)+"</b>"); }
  if(inv.pay && PM_EN[inv.pay.pm]) h+=row("Paid by",PM_EN[inv.pay.pm]);
  if(inv.gst) h+=`<div class="pr-sm">${e(inWords(c.total))}</div>`;
  h+=`<hr>`+(S.cfg.billFooter?`<div class="pr-c">${e(S.cfg.billFooter)}</div>`:"")+`<div class="pr-c">Thank you!</div>`;
  return `<div class="pr">${h}</div>`;
}
/** Print through the phone/laptop print screen: the printout goes into #printroot, everything else is hidden for print. */
function prSystem(inv,paper){
  let root=$("#printroot"); if(!root){ root=document.createElement("div"); root.id="printroot"; document.body.appendChild(root); }
  let st=$("#printpage"); if(!st){ st=document.createElement("style"); st.id="printpage"; document.head.appendChild(st); }
  root.className="pp-"+paper; root.innerHTML=prRoll(paper)?prHtmlReceipt(inv):prHtmlInvoice(inv);
  if(prRoll(paper)){ root.style.cssText="position:fixed;left:-9999px;top:0;display:block;visibility:hidden"; const mm=Math.ceil(root.offsetHeight/3.78)+8; root.style.cssText="";
    st.textContent=`@page{size:${paper}mm ${Math.max(60,mm)}mm;margin:0}`; }
  else st.textContent=`@page{size:${paper.toUpperCase()};margin:12mm}`;
  /* Android Chrome fires "afterprint" straight away and builds the printout afterwards, so .printing must NOT be removed on
     afterprint (that printed the whole app). It only matters inside @media print, so it stays on until the next print. */
  document.body.classList.add("printing");
  /* The page title becomes the saved file's name ("Bill 10 - Sunil Traders.pdf"); put back on the next tap. */
  if(!prSystem.title) prSystem.title=document.title;
  document.title=`${inv.gst?"Invoice":"Bill"} ${inv.no}${inv.cust&&inv.cust.name?" - "+inv.cust.name:""}`.replace(/[\\/:*?"<>|]/g,"").slice(0,80);
  const at=Date.now(), back=()=>{ if(Date.now()-at<1500) return; document.title=prSystem.title; prSystem.title=""; document.removeEventListener("pointerdown",back,true); };
  document.addEventListener("pointerdown",back,true);
  setTimeout(()=>{ try{ window.print(); }catch{} },60);
}
async function printInv(inv,btn){
  if(!inv || !inv.lines || !inv.lines.length){ toast(t("prNothing")); return; }
  const P=prGet();
  if(prRoll(P.paper) && P.via==="rawbt"){ prRawbt(inv,P.paper); return; }
  if(prRoll(P.paper) && P.via==="image"){ if(btn) btnBusy(btn,true); try{ const b=await receiptPng(inv,P.paper); await shareFile(b,`Bill-${String(inv.no).replace(/[^\w-]/g,"")}.png`); }catch{} finally{ if(btn) btnBusy(btn,false); } return; }
  prSystem(inv,P.paper);
}

/** Settings → Printer (this phone / laptop). */
function renderPrCfg(){ const box=$("#cf-pr"); if(!box) return; const P=prGet(), roll=prRoll(P.paper);
  const vias=[["system","prViaSys","prViaSysD"],["rawbt","prViaRaw","prViaRawD"],["image","prViaImg","prViaImgD"]];
  box.innerHTML=`<h3 style="margin:0">${esc(t("prT"))}</h3>
    <div class="seg" id="cf-prpaper">${PR_PAPERS.map(k=>`<button type="button" data-pp="${k}" aria-pressed="${P.paper===k}">${esc(t("prP"+k))}</button>`).join("")}</div>
    <p class="note" style="margin:0">${esc(t(roll?"prRollD":"prPageD"))}</p>
    ${roll?`<div class="pr-vias" id="cf-prvia">${vias.map(([k,a,d])=>`<label class="pr-via"><input type="radio" name="prvia" value="${k}" ${P.via===k?"checked":""}><span><b>${esc(t(a))}</b><br><span class="note">${esc(t(d))}</span></span></label>`).join("")}</div>`:""}
    <label class="switch"><span><b>${esc(t("prAuto"))}</b><br><span class="note">${esc(t("prAutoD"))}</span></span><input type="checkbox" id="cf-prauto" ${P.auto?"checked":""}></label>
    <button type="button" class="btn ghost" id="cf-prtest">${esc(t("prTest"))}</button>`;
  $("#cf-prpaper").onclick=e=>{ const b=e.target.closest("[data-pp]"); if(!b) return; prSet({...prGet(),paper:b.dataset.pp}); renderPrCfg(); };
  const v=$("#cf-prvia"); if(v) v.onchange=e=>{ prSet({...prGet(),via:e.target.value}); };
  $("#cf-prauto").onchange=e=>{ prSet({...prGet(),auto:e.target.checked}); };
  $("#cf-prtest").onclick=()=>printInv(prSample(), $("#cf-prtest"));
}
function prSample(){ return { gst:false, igst:false, no:"TEST", date:new Date().toISOString(), cust:{name:"Test customer",mobile:"",gstin:""}, pos:"", cancelled:false, pay:{mode:"paid",recv:0,due:0},
  lines:[{name:"Sample item",hsn:"",qty:0.25,unit:"kg",rate:220,gst:0},{name:"Another item",hsn:"",qty:2,unit:"pc",rate:8,gst:0}] }; }
async function pdfFor(inv,btn){
  if(!inv.lines.length) return;
  btnBusy(btn,true);
  try{ const blob=await makeInvoicePdf(inv); window.__lastPdf=blob; await shareFile(blob, `${inv.gst?"Invoice":"Bill"}-${String(inv.no).replace(/[^\w-]+/g,"-")}.pdf`, `${S.cfg.shopName||"Rate Book"} · ${inv.gst?"Invoice":"Bill"} ${inv.no}`); }
  catch(e){ toast(t("pdfFail")); }
  finally{ btnBusy(btn,false); }
}
