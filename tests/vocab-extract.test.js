/* 本文から動詞・コロケーション・イディオムを抽出して一覧表示する */
const H = require('./helpers');

const genSet = (id) => ({
  id, topic: 'Should Japan accept more immigrants?', topicJa: 'テ', stance: 'agree', source: 'gemini', createdAt: Date.now(),
  bodies: [
    { argument: 'a1', sentences: ['First of all, immigration reshapes the labor market.', 'As firms rely on cheaper labor, wages fall.', 'In the long run, this takes a toll on society.', 'This burden becomes intolerable.'], ja: '' },
    { argument: 'a2', sentences: ['Secondly, inflows strain public services.', 'Schools struggle to keep up.', 'This means quality declines.', 'People lose trust.'], ja: '' },
    { argument: 'a3', sentences: ['Finally, integration is hard.', 'It is true that diversity brings benefits.', 'However, friction tends to grow.', 'Therefore, caution pays off.'], ja: '' },
  ], evaluation: null,
});

H.run('vocab-extract', async ({ page, base, check }) => {
  let vocabReq = null;
  await page.route('**/api/generate', r => {
    const b = JSON.parse(r.request().postData() || '{}');
    if (b.mode === 'extractVocab') {
      vocabReq = b;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ vocab: {
        verbs: [{ en: 'reshape', ja: '作り変える' }, { en: 'strain', ja: '圧迫する' }],
        collocations: [{ en: 'rely on cheaper labor', ja: '安価な労働力に頼る' }],
        idioms: [{ en: 'take a toll on', ja: '〜に打撃を与える' }, { en: 'pay off', ja: '報われる' }],
      } }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto(base); await page.waitForTimeout(200);
  await H.skipKeyword(page);
  await H.injectSet(page, genSet('gen-vocab'));
  await page.locator('[data-action="open-set"][data-id="gen-vocab"]').click(); await page.waitForTimeout(200);

  check('vocab card present with extract button', await page.locator('[data-action="extract-vocab"]').count() === 1);
  check('no vocab list before extraction', await page.locator('.vocab-list').count() === 0);

  await page.locator('[data-action="extract-vocab"]').click(); await page.waitForTimeout(500);

  check('extractVocab called with bodies', vocabReq && Array.isArray(vocabReq.bodies) && vocabReq.bodies.length === 3);
  check('vocab stored on set', await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('et.sets')).find(s => s.id === 'gen-vocab').vocab; return v && v.verbs.length === 2 && v.idioms.length === 2; }));
  const txt = await page.locator('.vocab-card').innerText();
  check('verbs group shown', txt.includes('動詞') && txt.includes('reshape') && txt.includes('作り変える'));
  check('collocations group shown', txt.includes('コロケーション') && txt.includes('rely on cheaper labor'));
  check('idioms group shown', txt.includes('イディオム') && txt.includes('take a toll on'));
  check('re-extract button shown after result', (await page.locator('[data-action="extract-vocab"]').innerText()).includes('再抽出'));

  // persists after reopening
  await page.locator('[data-action="go-home"]').click(); await page.waitForTimeout(120);
  await page.locator('[data-action="open-set"][data-id="gen-vocab"]').click(); await page.waitForTimeout(150);
  check('vocab persists after reopen', (await page.locator('.vocab-card').innerText()).includes('reshape'));
});
