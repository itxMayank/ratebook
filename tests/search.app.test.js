/* The text engines (added with the search.js split, 11 Oct 2026; before, only the search bar's position and scrolling were
   tested): phonetic search in English and Hindi, other names and groups, typo "Did you mean", nothing found, most-sold
   order, highlight, the duplicate check; the wand's plain-language reader (add with two rates, % up, sell only, delete,
   buy + sell + unit, two changes spoken in one line); and English → Hindi letters for shop words, acronyms and sizes.
   Any page error fails. Run: node tests/search.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,runSearch,localParse,toHindi,looksLikeCommand,findDup,highlight,appUnlock');
const items = [
  { id: 'i1', name: 'Chawal Basmati', nameHi: 'चावल बासमती', unit: 'kg', buy: 80, sell: 100 },
  { id: 'i2', name: 'Sugar', nameHi: '', unit: 'kg', buy: 40, sell: 46 },
  { id: 'i3', name: 'PP Bag 12x18', unit: 'kg', buy: 150, sell: 180, aliases: 'thaili, poly bag', cat: 'Bags' },
  { id: 'i4', name: 'Paper Cup 150ml', unit: 'pc', buy: 0.5, sell: 0.8, cat: 'Cups' },
  { id: 'i5', name: 'Maida', unit: 'kg', buy: 30, sell: 36 }];
(async () => {
  const b = await launch(); const errs = [];
  const ctx = await b.newContext(); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', rev: '1', items,
    config: { shopName: 'Gupta Plastics', mode: 'live', roundTo: 1, defaultUnit: 'kg' }, sv: 43, pop: { i2: 9, i5: 4, i1: 1 }, me: { name: 'M', role: 'owner', personal: true, prefs: {} } }) }));
  await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'M', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' })));
  await p.goto('https://rb.test/'); await p.waitForTimeout(1500); await p.evaluate(() => T.appUnlock());
  const s = q => p.evaluate(q => { const x = T.runSearch(q); return { r: x.res.map(o => o.e.it.id).join(), s: x.suggest.map(i => i.id).join(), ex: x.exact }; }, q);
  const lp = t => p.evaluate(t => T.localParse(t).map(a => [a.op, a.id || a.name, a.buy, a.sell, a.unit].join('|')), t);

  // A. search
  ok(await p.evaluate(() => T.S.items.map(i => i.id).join()) === 'i2,i5,i1,i4,i3', 'A1 most sold first (bills from the sheet), then A–Z');
  ok((await s('')).r === 'i2,i5,i1,i4,i3', 'A2 empty search lists everything in that order');
  ok((await s('chawal')).r === 'i1' && (await s('चावल')).r === 'i1', 'A3 English and Hindi letters find the same item');
  ok((await s('thaili')).r === 'i3' && (await s('थैली')).r === 'i3', 'A4 another name (alias) finds it, typed in English or Hindi');
  ok((await s('bags')).r === 'i3' && (await s('cup 150')).r === 'i4', 'A5 the group name and name + size find the item');
  ok((await s('maidda')).r === 'i5', 'A6 a small typo still matches');
  const sug = await s('suger'); ok(sug.ex === false && sug.s === 'i2', 'A7 a fuzzier typo: "Did you mean Sugar"');
  const none = await s('xqzw'); ok(none.r === '' && none.s === '', 'A8 nonsense finds nothing and suggests nothing');
  ok(await p.evaluate(() => T.highlight('Chawal Basmati', 'bas')) === 'Chawal <mark>Bas</mark>mati', 'A9 the typed part is highlighted');
  ok(await p.evaluate(() => (T.findDup('chaawal basmati') || {}).id) === 'i1' && await p.evaluate(() => T.findDup('Rice')) === null, 'A10 adding a name that sounds like an existing item is caught; a new one isn\'t');
  ok(await p.evaluate(() => [T.looksLikeCommand('add 51 micron bag 1kg rates 110 and 120'), T.looksLikeCommand('chawal'), T.looksLikeCommand('चीनी 5% बढ़ा दो')].join()) === 'true,false,true', 'A11 a command is told apart from a plain search');

  // B. the wand's plain-language reader
  ok((await lp('add 51 micron bag 1kg rates 110 and 120')).join() === 'add|51 Micron Bag 1kg|110|120|kg', 'B1 add with buy and sell rates ("1kg" stays in the name)');
  ok((await lp('sugar 5% badha do')).join() === 'update|i2|42|48|kg', 'B2 "5% badha do": both rates up 5%, rounded');
  ok((await lp('maida sell 40')).join() === 'update|i5||40|kg', 'B3 sell rate only');
  ok((await lp('delete maida')).join() === 'delete|i5|||kg', 'B4 delete an item');
  ok((await lp('sugar buy 42 sell 50 per kg')).join() === 'update|i2|42|50|kg', 'B5 buy, sell and unit named');
  ok((await lp('add besan rates 60 and 70 maida 5% badha do')).join(';') === 'add|Besan|60|70|kg;update|i5|32|38|kg', 'B6 two changes spoken in one line are split');
  ok((await lp('add 51 micron bag 1kg rates 110 and 120 sugar 5% badha do')).join(';') === 'add|51 Micron Bag 1kg|110|120|kg;update|i2|42|48|kg', 'B7 …also after a size like "1kg"');

  // C. English → Hindi letters
  const hi = await p.evaluate(() => ['Sugar', 'PP Bag', 'Paper Cup 150ml', 'Garbage Bag 27 x 30', 'Silver Foil 9m', 'Thermocol Plate', 'Rubber Band', 'Container'].map(T.toHindi));
  ok(hi[0] === 'शुगर' && hi[1] === 'पीपी बैग', 'C1 word list and acronyms: Sugar → शुगर, PP Bag → पीपी बैग');
  ok(hi[2] === 'पेपर कप 150 एमएल' && hi[3] === 'गार्बेज बैग 27 x 30' && hi[4] === 'सिल्वर फॉयल 9 एम', 'C2 numbers and sizes stay, units in Hindi');
  ok(hi[5] === 'थर्मोकोल प्लेट' && hi[6] === 'रबर बैंड' && hi[7] === 'कंटेनर', 'C3 other packaging words');

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
