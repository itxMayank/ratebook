/* Minimal stand-ins for Google Apps Script services, enough to run Code.gs / Directory.gs functions in Node (vm). */
const crypto = require('crypto'), fs = require('fs'), vm = require('vm');
function gas(files, opts = {}) {
  const props = Object.assign({}, opts.props), cache = {}, locks = { n: 0 };
  const P = { getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; }, getProperties: () => ({ ...props }) };
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
module.exports = { gas };
