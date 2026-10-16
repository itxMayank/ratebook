/* Rate Book: the text engines. Phonetic search (Hindi or English, fuzzy; buildIndex / runSearch / highlight, item order),
   the wand's plain-language command reader (localParse, parseOne, splitCommands; rules, no AI) and English → Hindi letters
   (toHindi, HI_WORDS). Moved unchanged out of app.js (11 Oct 2026). Loads before app.js; only declares things while loading.
   Uses app.js state (S, devDigits, toNum…) only when called. After editing, run: node tools/stamp.js */
"use strict";
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
  plate:"प्लेट",plates:"प्लेट्स",glass:"ग्लास",box:"बॉक्स",boxes:"बॉक्सेस",roll:"रोल",rolls:"रोल्स",liner:"लाइनर",liners:"लाइनर्स",tape:"टेप",pouch:"पाउच",zip:"ज़िप",lock:"लॉक",ziplock:"ज़िपलॉक",carry:"कैरी",
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

/* ---------------- Recent items (15 Oct 2026) ----------------
   The items this phone last added to a bill, newest first (Samsung-style "recent searches", but the item itself so it's one tap).
   Shown when the search is tapped with nothing typed; while typing, the ones that match come first under "Recent".
   Per phone (and per shop, through ls). While the panel is open its order is frozen (recSnap), so adding doesn't make rows jump. */
const RECENT_MAX=8;
let recSnap=null;
function recentAll(){ const a=ls.get("rb_recent",[]); return Array.isArray(a)?a.filter(x=>typeof x==="string"):[]; }
const RECENT_PILLS=16;   // pills are small, so more fit
function rcPills(){ return ls.get("rb_rcstyle","list")==="pills"; }
function recentIds(n){ return (recSnap||recentAll()).filter(id=>S.byId.has(id)).slice(0,n||(rcPills()?RECENT_PILLS:RECENT_MAX)); }
function recentAdd(id){ if(!id) return; const a=recentAll().filter(x=>x!==id); a.unshift(id); ls.set("rb_recent",a.slice(0,RECENT_PILLS+8)); }   // a few spare, for items deleted meanwhile
function recentDel(id){ ls.set("rb_recent",recentAll().filter(x=>x!==id)); if(recSnap) recSnap=recSnap.filter(x=>x!==id); }
function recentClear(){ ls.set("rb_recent",[]); if(recSnap) recSnap=[]; }
/** Search results with recent items that match moved to the front (only real matches near the top, so a weak fuzzy hit never jumps a good one). */
/* With Pills chosen, typing shows the plain results in match order (no "Recent" group on top). */
function recentSplit(res,exact){ const ids=exact && !rcPills() ? recentAll() : []; if(!ids.length) return {rec:[],rest:res};
  const has=new Set(ids), rec=res.slice(0,30).filter(r=>has.has(r.e.it.id)); if(!rec.length) return {rec,rest:res};
  const got=new Set(rec.map(r=>r.e.it.id)); return {rec,rest:res.filter(r=>!got.has(r.e.it.id))}; }
