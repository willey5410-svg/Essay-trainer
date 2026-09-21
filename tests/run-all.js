/* 全 E2E テスト（tests/*.test.js）を順に実行し、結果を集計する。
   使い方: npm test  （または node tests/run-all.js）
   1つでも失敗すると終了コード 1。 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();
let failed = 0;
const summary = [];

for (const f of files) {
  process.stdout.write(`\n===== ${f} =====\n`);
  const res = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
  const ok = res.status === 0;
  if (!ok) failed++;
  summary.push({ f, ok });
}

console.log('\n================ SUMMARY ================');
for (const s of summary) console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.f}`);
console.log(`\n${summary.length - failed}/${summary.length} suites passed`);
process.exit(failed === 0 ? 0 : 1);
