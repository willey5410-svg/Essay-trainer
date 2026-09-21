/* E2E テスト共通ハーネス
   - 静的サーバ＋Playwright(Chromium) を起動し、アプリを実ブラウザで動かす
   - 環境依存パスは環境変数で上書き可（既定はこのコンテナの標準パス）
     PW_MODULES  … playwright を含む node_modules（既定 /opt/node22/lib/node_modules）
     PW_CHROMIUM … Chromium 実行ファイル（既定 /opt/pw-browsers/chromium） */
module.paths.push(process.env.PW_MODULES || '/opt/node22/lib/node_modules');
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function startServer() {
  const server = http.createServer((req, res) => {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const fp = path.join(ROOT, p);
    if (!fs.existsSync(fp)) { res.statusCode = 404; return res.end('nf'); }
    res.setHeader('Content-Type', MIME[path.extname(fp)] || 'text/plain');
    res.end(fs.readFileSync(fp));
  });
  return new Promise(resolve => server.listen(0, () => resolve({ server, base: `http://localhost:${server.address().port}` })));
}

function launch() {
  return chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
}

/* PASS/FAIL を集計するチェッカ */
function checker() {
  const results = [];
  const check = (name, cond) => results.push({ name, ok: !!cond });
  const report = (suite) => {
    let failed = 0;
    for (const r of results) { console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}`); if (!r.ok) failed++; }
    console.log(`\n[${suite}] ${results.length - failed}/${results.length} passed`);
    return failed === 0;
  };
  return { check, report };
}

/* JS エラーを拾う（501 は Blob 未設定の想定内なので除外） */
function trackErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // モックした API のHTTPステータス（401/403/429/501/502 等）はブラウザが
    // "Failed to load resource" として error ログに出すが JS 例外ではないので除外する
    if (/Failed to load resource/i.test(t)) return;
    errors.push('CONSOLE: ' + t);
  });
  return errors;
}

/* /api/data を 501（Blob 未設定）で塞ぐ */
async function stubData(page) {
  await page.route('**/api/data', r => r.fulfill({ status: 501, contentType: 'application/json', body: '{}' }));
}

/* ようこそ画面の合言葉入力をスキップ（あれば） */
async function skipKeyword(page) {
  if (await page.locator('[data-action="skip-keyword"]').count()) {
    await page.locator('[data-action="skip-keyword"]').click();
    await page.waitForTimeout(120);
  }
}

/* セットを localStorage 先頭に注入して再読み込み（合言葉も保持） */
async function injectSet(page, set, keyword = 'secret') {
  await page.evaluate(({ set, keyword }) => {
    if (keyword) localStorage.setItem('et.keyword', keyword);
    const sets = JSON.parse(localStorage.getItem('et.sets') || '[]');
    sets.unshift(set);
    localStorage.setItem('et.sets', JSON.stringify(sets));
  }, { set, keyword });
  await page.reload();
  await page.waitForTimeout(200);
  await skipKeyword(page);
}

/* テスト本体を実行し、成否で process を終了する共通ラッパ */
async function run(suite, fn) {
  const { server, base } = await startServer();
  const browser = await launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = trackErrors(page);
  const { check, report } = checker();
  let threw = null;
  try {
    await stubData(page);
    await fn({ page, base, check });
  } catch (e) { threw = e; }
  if (threw) { console.log('THREW: ' + (threw && threw.message)); }
  check('no JS errors', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  const ok = report(suite) && !threw;
  await browser.close();
  server.close();
  process.exit(ok ? 0 : 1);
}

module.exports = { ROOT, startServer, launch, checker, trackErrors, stubData, skipKeyword, injectSet, run };
