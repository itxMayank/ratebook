/* Past bills end to end (added with the bills.js split, 11 Oct 2026; there was no test for this screen before): month → day
   groups with exact totals, older months closed, search (name, 4+ mobile digits, bill number, item, dd/mm/yyyy date), quick
   filters and the date filter, a bill's screen (latest copy read from the sheet, payment box, edited note, WhatsApp to the
   saved or a typed number), cancel with a reason and restore, Repeat as new bill, Edit bill, changes from another phone
   arriving as a delta, and a bill still waiting to send showing in the list. Any page error fails.
   Run: node tests/bills.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,openBills,setTab,addToBill');
const pad = n => String(n).padStart(2, '0'), dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (daysAgo, h) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d; };
const mk = (n, d, o) => ({ n, id: 'b' + n, row: n + 1, date: d.toISOString(), day: dk(d), customer: '', mobile: '', total: 100, items: 'PP Bag 1 kg = 100', gst: false, edits: 0, pay: 'Paid', paid: 0, due: 0, payments: [], fy: '2026-27', cancelled: false, ...o });
const T0 = at(0, 11), T1 = at(0, 9), Y = at(1, 16), OLD = at(45, 12), OLDER = at(400, 12);
let bills = [
  mk(12, T0, { customer: 'Sunil Traders', mobile: '9876543210', total: 500, pay: 'Credit', due: 500, items: 'PP Bag 2 kg = 240; Paper Cup 130 pc = 260' }),
  mk(5, T1, { gst: true, customer: 'Ravi Stores', custGstin: '09ABCDE1234F1Z5', total: 236, items: 'Tape 2 pc = 236', editedAt: T1.toISOString(), editedBy: 'Dad', edits: 1 }),
  mk(11, Y, { customer: 'Sunil Traders', mobile: '9876543210', total: 300, pay: 'Part paid', paid: 100, due: 200, payments: [{ d: Y.toISOString(), a: 100, by: 'Mayank', at: 1, note: 'UPI' }] }),
  mk(10, Y, { customer: 'Amit', total: 50, cancelled: true, cancelReason: 'Wrong items', cancelledBy: 'Mayank', cancelledAt: Y.toISOString() }),
  mk(4, OLD, { customer: 'Old Customer', total: 700 }),
  mk(1, OLDER, { customer: 'First Ever', total: 999 })];
const lines = { b12: [{ id: 'i1', name: 'PP Bag', unit: 'kg', rate: 120, qty: 2, buy: 90 }, { id: 'i2', name: 'Paper Cup', unit: 'pc', rate: 2, qty: 130, buy: 1 }] };
(async () => {
  const b = await launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); const sent = []; let brev = '1', delta = null, takeOk = true;
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const me = { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } }, cfg = { shopName: 'Gupta Plastics', mode: 'live', nextBill: 13, nextGstBill: 6 };
    const items = [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 90, sell: 120 }, { id: 'i2', name: 'Paper Cup', unit: 'pc', buy: 1, sell: 2 }];
    if (req.method() === 'GET') return send({ rev: '1', items, config: cfg, sv: 60 });
    const bd = JSON.parse(req.postData()); sent.push(bd);
    if (bd.action === 'listBills') { if (bd.brev && bd.brev === brev) return send({ full: true, same: true, brev });
      if (bd.brev && delta && bd.brev === delta.from) return send({ full: true, delta: true, brev, bills: delta.bills, years: ['2026', '2025'] });
      return send({ full: true, brev, bills, years: ['2026', '2025'] }); }
    if (bd.action === 'getBill') { const x = bills.find(y => y.id === bd.id) || {}; return send({ bill: { ...x, text: `*Gupta Plastics*\nBill No. ${x.n}\n${x.customer}\nTotal ₹${x.total}`, lines: lines[x.id] || [] } }); }
    if (bd.action === 'cancelBill' || bd.action === 'restoreBill') return send({});
    if (bd.action === 'takeBill') return takeOk ? send({}) : r.abort();
    if (bd.action === 'boot') return send({ rev: '1', items, config: cfg, sv: 60, me });
    return send({ me }); });
  await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })));
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
  const txt = s => p.textContent(s).catch(() => ''), title = () => txt('#sheet-title');
  const shot = async n => { if (process.env.SHOT) { await p.waitForTimeout(300); await p.screenshot({ path: require('path').join(process.env.SHOT, 'b-' + n + '.png') }); } };   // SHOT=<dir>: screenshots for comparing versions
  const cards = () => p.$$eval('#bl-list .billcard', x => x.filter(e => e.offsetParent !== null).map(e => e.querySelector('b').textContent.trim()));
  const search = async q => { await p.fill('#bl-q', q); await p.dispatchEvent('#bl-q', 'input'); await p.waitForTimeout(400); };

  await p.evaluate(() => T.openBills()); await p.waitForTimeout(1200);
  const heads = await p.$$eval('.bl-mh, .bl-day', x => x.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(/Today/.test(heads.join('|')) && /Yesterday/.test(heads.join('|')), 'grouped by day: Today, Yesterday (' + heads.slice(0, 4).join(' | ') + ')');
  const todayH = heads.find(h => /Today/.test(h)) || '';
  ok(/2 bills/.test(todayH) && /736/.test(todayH), 'Today: 2 bills · ₹736');
  ok(/Yesterday/.test(heads.join('|')) && /1 bill\b.*300|300.*1 bill\b/.test(heads.find(h => /Yesterday/.test(h)) || ''), 'Yesterday: the cancelled bill is left out of the count and total (1 bill · ₹300)');
  ok((await p.$$('.bl-month')).length === 3 && (await p.$$('.bl-month.shut')).length >= 1 && !(await p.$('.bl-month:first-child.shut')), 'months: this month open, older months closed');
  ok((await cards()).length === 4, 'visible: this month\'s 4 bills (older months folded)');
  await shot('list');
  await p.click('.bl-month.shut .bl-mh'); await p.waitForTimeout(200);
  ok((await cards()).length === 5, 'tapping an older month opens it');

  await search('sunil'); ok((await cards()).length === 2 && /2 bills · ₹800/.test(await txt('.bl-sum')), 'search "sunil": 2 bills · ₹800');
  await search('3210'); ok((await cards()).length === 2, 'search by 4 digits of the mobile');
  await search('12'); ok((await cards()).some(c => /Bill No\. 12/.test(c)), 'search by bill number');
  await search('paper cup'); ok((await cards()).length === 1, 'search by item name');
  await search(`${pad(OLD.getDate())}/${pad(OLD.getMonth() + 1)}/${OLD.getFullYear()}`); ok((await cards()).join() .includes('Old Customer') && (await cards()).length === 1, 'search by date dd/mm/yyyy');
  await search('');
  await p.click('[data-blf="gst"]'); await p.waitForTimeout(300); ok((await cards()).length === 1 && /GST/.test((await cards())[0]), 'filter GST');
  await p.click('[data-blf="due"]'); await p.waitForTimeout(300); ok((await cards()).length === 2 && /Due ₹700/.test(await txt('.bl-sum')), 'filter Credit / due: 2 bills, total due ₹700');
  await shot('due');
  await p.click('[data-blf="cancelled"]'); await p.waitForTimeout(300); ok((await cards()).length === 1 && /Amit/.test((await cards())[0]), 'filter Cancelled');
  await p.click('[data-blf="edited"]'); await p.waitForTimeout(300); ok((await cards()).length === 1 && /Ravi/.test((await cards())[0]), 'filter Edited');
  await p.click('#bl-clr'); await p.waitForTimeout(300); ok((await cards()).length >= 4 && await p.isHidden('#bl-clr'), '✕ clears the filters');
  await p.evaluate(d => { const i = document.querySelector('#bl-date'); i.value = d; i.dispatchEvent(new Event('change')); }, dk(Y)); await p.waitForTimeout(300);
  ok((await cards()).length === 2 && /Yesterday|\d/.test(await txt('#bl-dl')), 'date filter: only that day\'s 2 bills');
  await p.click('#bl-clr'); await p.waitForTimeout(300);

  await p.click('[data-bid="b11"]'); await p.waitForTimeout(700);
  const gb = sent.filter(x => x.action === 'getBill').pop();
  ok(gb && gb.id === 'b11' && gb.row === 12 && gb.n === 11, 'opening a bill reads its latest copy from the sheet (id, row, number)');
  ok(await title() === 'Bill No. 11' && /Total ₹300/.test(await txt('#bd-text')), 'bill screen: title and the saved text');
  const pbox = await txt('#sheet-body .paybox, #sheet-body [class*="pay"]');
  ok(/200/.test(pbox) && /100/.test(pbox), 'payment box: paid ₹100, due ₹200');
  await shot('bill');
  ok(/wa\.me\/919876543210\?text=/.test(await p.getAttribute('#bd-wa', 'href')), 'WhatsApp goes to the saved mobile');
  await p.fill('#bd-mob', '12345'); await p.dispatchEvent('#bd-mob', 'input'); await p.waitForTimeout(100);
  ok(/valid|10/.test(await txt('#bd-err')), 'a bad number is flagged');
  await p.fill('#bd-mob', '09123456780'); await p.dispatchEvent('#bd-mob', 'input'); await p.waitForTimeout(100);
  ok(/wa\.me\/919123456780/.test(await p.getAttribute('#bd-wa', 'href')) && !(await txt('#bd-err')), 'a typed number (with leading 0) is used instead');
  await p.click('#sheet-back'); await p.waitForTimeout(400); ok(await title() === 'Past bills', 'header ← goes back to the list');

  await p.click('[data-bid="b5"]'); await p.waitForTimeout(700);
  ok(/Edited/.test(await txt('#sheet-body .editnote')) && /Dad/.test(await txt('#sheet-body .editnote')) && /GST Bill No\. 5/.test(await title()), 'edited bill: "Edited … by Dad" note, GST title');
  await p.click('#bd-cancel'); await p.waitForTimeout(200); await p.click('#bd-cy'); await p.waitForTimeout(300);
  ok(!sent.some(x => x.action === 'cancelBill'), 'cancel needs a reason (nothing sent without one)');
  await p.click('#bd-cr button'); await p.click('#bd-cy'); await p.waitForTimeout(800);
  const cb = sent.find(x => x.action === 'cancelBill');
  ok(cb && cb.id === 'b5' && cb.n === 5 && cb.reason.length > 2 && /Cancelled/i.test(await txt('#sheet-body .cancelnote')) && /CANCELLED/i.test(await txt('#bd-text')) && !(await p.$('#bd-edit')), 'cancelled with the reason; the note shows, the text is marked, Edit is gone');
  await shot('cancelled');
  await p.click('#bd-restore'); await p.waitForTimeout(800);
  ok(sent.some(x => x.action === 'restoreBill' && x.id === 'b5') && !(await p.$('#sheet-body .cancelnote')), 'Restore brings it back');
  await p.click('#sheet-back'); await p.waitForTimeout(400);

  await p.click('[data-bid="b12"]'); await p.waitForTimeout(700); await p.click('#bd-repeat'); await p.waitForTimeout(600);
  ok(await p.evaluate(() => document.body.dataset.tab) === 'bill' && (await p.evaluate(() => T.S.bill.map(l => l.name + ' ' + l.qty).join(','))) === 'PP Bag 2,Paper Cup 130' && (await p.inputValue('#cust')) === 'Sunil Traders', 'Repeat as new bill: same lines and customer on the Bill tab, as a new bill');
  ok(!(await p.evaluate(() => T.S.editing)), '…not as an edit of the old bill');
  await p.evaluate(() => { T.S.bill = []; }); await p.click('#bill-clear').catch(() => {}); await p.evaluate(() => { const y = document.querySelector('#bill-clear-yes'); if (y && !y.closest('[hidden]')) y.click(); });
  await p.evaluate(() => T.openBills()); await p.waitForTimeout(800); await p.click('[data-bid="b12"]'); await p.waitForTimeout(700);
  await p.click('#bd-edit'); await p.waitForTimeout(600);
  ok(await p.evaluate(() => !!T.S.editing && T.S.editing.n == 12) && /12/.test(await txt('#view-bill')) && await p.evaluate(() => document.body.dataset.tab) === 'bill', 'Edit bill: the Bill tab opens in edit mode for Bill 12');
  await p.evaluate(() => { const c = document.querySelector('#edit-cancel,[data-act="canceledit"],#bill-edit-cancel'); if (c) c.click(); });
  await p.waitForTimeout(300);

  // another phone: a new bill and a payment arrive as a delta
  delta = { from: brev, bills: [mk(13, at(0, 12), { customer: 'New From Other Phone', total: 420 }), { ...bills[0], pay: 'Cleared', paid: 500, due: 0 }] }; brev = '2';
  bills = [delta.bills[0], delta.bills[1], ...bills.slice(1)];
  await p.evaluate(() => T.openBills()); await p.waitForTimeout(1500);
  const lb = sent.filter(x => x.action === 'listBills').pop();
  ok(lb.brev === '1' && /New From Other Phone/.test((await cards())[0] || ''), 'another phone\'s new bill arrives as a change and shows on top (asked with the copy\'s version)');
  ok(!/Due/.test(await txt('[data-bid="b12"]')), '…and Bill 12, now paid on the other phone, no longer shows a due');
  await p.evaluate(() => closeSheet()); await p.waitForTimeout(200);
  await p.evaluate(() => T.openBills()); await p.waitForTimeout(900);
  ok(sent.filter(x => x.action === 'listBills').pop().brev === '2', 'next open asks with the new version (nothing to download when nothing changed)');
  await p.evaluate(() => closeSheet());

  // a bill made on this phone that couldn't be sent yet
  takeOk = false; await p.evaluate(() => { T.setTab('bill'); T.addToBill('i1', 3); }); await p.fill('#cust', 'Waiting Customer'); await p.dispatchEvent('#cust', 'input');
  await p.evaluate(() => document.querySelector('#bill-done').click()); await p.waitForTimeout(1200);
  await p.evaluate(() => T.openBills()); await p.waitForTimeout(1000);
  ok((await cards()).some(c => /Waiting Customer/.test(c)), 'a bill still waiting to send shows in Past bills');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
