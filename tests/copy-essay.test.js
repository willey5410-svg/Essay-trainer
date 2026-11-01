/* 全文コピーは、問題文（お題）＋立場＋ Body 1〜3 をまとめてコピーする */
const H = require('./helpers');

const genSet = (id) => ({
  id, topic: 'Should Japan accept more immigrants?', topicJa: '日本はより多くの移民を受け入れるべきか', stance: 'disagree', source: 'gemini', createdAt: Date.now(),
  bodies: [
    { argument: 'a1', sentences: ['First of all, immigration reshapes the labor market.', 'Wages fall.', 'This is a problem.', 'It becomes intolerable.'], ja: '' },
    { argument: 'a2', sentences: ['Secondly, services are strained.', 'Schools struggle.', 'Quality declines.', 'Trust erodes.'], ja: '' },
    { argument: 'a3', sentences: ['Finally, integration is hard.', 'Friction grows.', 'Caution is wise.', 'Therefore we should be careful.'], ja: '' },
  ], evaluation: null,
});

H.run('copy-essay', async ({ page, base, check }) => {
  // navigator.clipboard.writeText を差し替えてコピー内容を捕捉する
  await page.addInitScript(() => {
    window.__copied = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } });
  });
  await page.goto(base); await page.waitForTimeout(200);
  await H.skipKeyword(page);
  await H.injectSet(page, genSet('gen-copy'));
  await page.locator('[data-action="open-set"][data-id="gen-copy"]').click(); await page.waitForTimeout(200);

  check('copy button present', await page.locator('[data-action="copy-essay"]').count() === 1);
  await page.locator('[data-action="copy-essay"]').click(); await page.waitForTimeout(200);

  const copied = await page.evaluate(() => window.__copied);
  check('copied text captured', typeof copied === 'string' && copied.length > 0);
  check('includes 問題文 header', copied.includes('【問題文】'));
  check('includes the English topic', copied.includes('Should Japan accept more immigrants?'));
  check('includes the Japanese topic', copied.includes('日本はより多くの移民を受け入れるべきか'));
  check('includes stance', copied.includes('【立場】') && copied.includes('Disagree'));
  check('includes Body 1 text', copied.includes('First of all, immigration reshapes the labor market.'));
  check('includes Body 3 text', copied.includes('Finally, integration is hard.'));
  check('topic appears before the bodies', copied.indexOf('【問題文】') < copied.indexOf('First of all'));
  const notice = await page.locator('#app').innerText();
  check('success notice mentions 問題文', notice.includes('問題文') && notice.includes('コピーしました'));
});
