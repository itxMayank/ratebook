/* Minimal stand-ins for Google Apps Script services, enough to run Code.gs / Directory.gs functions in Node (vm). */
const crypto = require('crypto'), fs = require('fs'), vm = require('vm');
function gas(files, opts = {}) {
  const props = Object.assign({}, opts.props), cache = {}, locks = { n: 0 };
  const P = { getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; }, getProperties: () => ({ ...props }), getKeys: () => Object.keys(props) };
  const C = { get: k => (k in cache ? cache[k] : null), put: (k, v) => { if (opts.cacheLimit && String(v).length > opts.cacheLimit) throw new Error('too big'); cache[k] = String(v); }, remove: k => { delete cache[k]; },
    getAll: ks => { const o = {}; ks.forEach(k => { if (k in cache) o[k] = cache[k]; }); return o; }, putAll: o => { Object.keys(o).forEach(k => C.put(k, o[k])); } };
  const dig = (alg, s) => [...crypto.createHash(alg === 'MD5' ? 'md5' : 'sha256').update(String(s), 'utf8').digest()];
  const ctx = {
    console, props, cache, locks,
    PropertiesService: { getScriptProperties: () => P },
    CacheService: { getScriptCache: () => C },
    LockService: { getScriptLock: () => ({ tryLock: () => { locks.n++; return true; }, waitLock: () => { locks.n++; }, releaseLock: () => { locks.n--; } }) },
    Utilities: { getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'SHA_256', MD5: 'MD5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (a, s) => dig(a, s), base64Encode: b => Buffer.from(b.map(x => x & 255)).toString('base64'),
      base64EncodeWebSafe: b => Buffer.from(b.map(x => x & 255)).toString('base64url') + '=', formatDate: (d, tz, f) => new Date(d).toISOString().slice(0, f.length) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
    Logger: { log: () => {} }, SpreadsheetApp: opts.SpreadsheetApp || {}, DriveApp: opts.DriveApp || {}, ScriptApp: opts.ScriptApp || { getProjectTriggers: () => [], getOAuthToken: () => 'tok' },
    UrlFetchApp: opts.UrlFetchApp || { fetch: () => ({ getContentText: () => '{}', getResponseCode: () => 200 }) },
  };
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  ctx.R = c => vm.runInContext(c, ctx);
  return ctx;
}
/* (v66) The sheet now adds up every bill it saves (money.js). Test bills made with a total and no real lines get one line worth
   that total (GST 0%), so they add up; a bill that brings its own lines is left as it is. */
function fitBill(b) { b = Object.assign({}, b); const t = Number(b.total) || 0;
  if (!Array.isArray(b.lines) || !b.lines.length) b.lines = [{ id: 'i1', name: 'Item', unit: 'pc', qty: 1, rate: t, gst: 0 }];
  if (b.gst && b.taxable === undefined && b.tax === undefined) { b.taxable = t; b.tax = 0; }
  return b; }
module.exports = { gas, fitBill };
