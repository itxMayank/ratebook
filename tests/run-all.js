/* Runs every test file; fails if any prints FAIL or a page error, or exits non-zero. Run: node tests/run-all.js */
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const files = [...fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).map(f => path.join(__dirname, f)),
  ...fs.readdirSync(path.join(__dirname, 'suites')).filter(f => f.endsWith('.test.js')).map(f => path.join(__dirname, 'suites', f))];
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || ''), pass = (out.match(/^PASS /gm) || []).length, fail = (out.match(/^FAIL |PAGEERR/gm) || []).length;
  const okk = r.status === 0 && !fail; if (!okk) bad++;
  console.log(`${okk ? 'ok  ' : 'FAIL'} ${path.relative(__dirname, f)}  (${pass} passed${fail ? ', ' + fail + ' failed' : ''}${r.status ? ', exit ' + r.status : ''})`);
  if (!okk) console.log(out.split('\n').filter(l => /^FAIL|PAGEERR|Error/.test(l)).slice(0, 10).map(l => '     ' + l).join('\n'));
}
console.log(bad ? `\n${bad} file(s) failed` : '\nAll tests passed'); process.exit(bad ? 1 : 0);
