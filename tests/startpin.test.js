/* A new shop's starting PIN (20 Oct 2026): the shop's health says whether it still signs in ('on'), was changed ('changed') or
   is off because an owner has their own PIN ('off'), so the dashboard offers it only while it's useful. Run: node tests/startpin.test.js */
const { gas } = require('./gas-mock');
const path = require('path'), CODE = path.join(__dirname, '..', 'Code.gs');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const fresh = () => { const g = gas([CODE], {}); g.R("var SHOP_BOOT={code:'NEW-ABCDEFGH23', sheetId:'s1', healthKey:'hk', initPin:'482913'}");
  g.R("ss_=()=>({getId:()=>'s',getSheets:()=>[],getSheetByName:()=>null}); readConfig_=()=>({})"); return g; };
const H = g => { g.cache = g.cache || {}; Object.keys(g.cache).filter(k => /^HEALTH/.test(k)).forEach(k => delete g.cache[k]); return g.R("health_('hk')"); };
let g = fresh(); g.props.PIN = '482913';
ok(H(g).startPin === 'on', 'new shop, starting PIN untouched: on');
ok(g.props.PIN === '482913' && !g.props.PINH, 'checking it changes nothing (plain PIN not converted by health)');
g.R("shopPinIs_('482913')"); ok(!!g.props.PINH && H(g).startPin === 'on', 'after first sign-in (PIN kept as a digest): still on');
g.R("PropertiesService.getScriptProperties().setProperty('PINH', hashPin_('739164'))"); ok(H(g).startPin === 'changed', 'shop PIN changed: changed');
g = fresh(); g.props.PIN = '482913'; g.R("saveUser_({name:'Ravi',pin:'846193',role:'owner'})"); ok(H(g).startPin === 'off', 'owner has their own PIN: off');
const m = gas([CODE]); m.props.HEALTH_KEY = 'hk'; m.R("ss_=()=>({getId:()=>'s',getSheets:()=>[],getSheetByName:()=>null}); readConfig_=()=>({})");
ok(m.R("health_('hk')").startPin === undefined, 'original shop (no Shop.gs): nothing sent');
ok(!JSON.stringify(H(fresh())).includes('482913'), 'health never carries the PIN itself');
process.exit(fails ? 1 : 0);
