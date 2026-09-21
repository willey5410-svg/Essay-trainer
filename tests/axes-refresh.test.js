/* 採点に相乗りして「この構成の3観点」を最新化し、主体×領域タグを付与する */
const H = require('./helpers');

const genSet = (id) => ({
  id, topic: 'T?', topicJa: 'テ', stance: 'agree', source: 'gemini', createdAt: Date.now(),
  bodies: [
    { argument: 'OLD one', sentences: ['First of all, one.', 'two.', 'three.', 'four.'], ja: '' },
    { argument: 'OLD two', sentences: ['Secondly, s.', 's2.', 's3.', 's4.'], ja: '' },
    { argument: 'OLD three', sentences: ['Finally, s.', 's2.', 's3.', 's4.'], ja: '' },
  ], evaluation: null,
});

H.run('axes-refresh', async ({ page, base, check }) => {
  await page.route('**/api/generate', r => {
    const b = JSON.parse(r.request().postData() || '{}');
    if (b.mode === 'evaluate') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      evaluation: { structure: 8, content: 8, language: 8, average: 8, comments: {} },
      arguments: ['refreshed one', 'refreshed two', 'refreshed three'],
      axes: [{ layer: 'individuals', domain: 'economy' }, { layer: 'the nation', domain: 'technology' }, { layer: 'the world', domain: 'rights' }],
    }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto(base); await page.waitForTimeout(200);
  await H.skipKeyword(page);
  await H.injectSet(page, genSet('gen-ax'));
  await page.locator('[data-action="open-set"][data-id="gen-ax"]').click(); await page.waitForTimeout(200);

  check('shows OLD argument before scoring', (await page.locator('.arg-summary').innerText()).includes('OLD one'));
  check('no axis badge before scoring', await page.locator('.badge.axis').count() === 0);

  await page.locator('[data-action="eval-now"]').click(); await page.waitForTimeout(500);
  const summary = await page.locator('.arg-summary').innerText();
  check('argument refreshed', summary.includes('refreshed one') && !summary.includes('OLD one'));
  check('axis tag 個人×経済', summary.includes('個人×経済'));
  check('axis tag 国家×技術', summary.includes('国家×技術'));
  check('axis tag 世界×権利', summary.includes('世界×権利'));
});
