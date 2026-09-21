/* 採点の失敗を握りつぶさず通知する（クオータ超過→バナー / 合言葉切れ→合言葉モーダル） */
const H = require('./helpers');

const scoredSet = (id) => ({
  id, topic: 'T?', topicJa: 'テ', stance: 'agree', source: 'gemini', createdAt: Date.now(),
  bodies: [
    { argument: 'a1', sentences: ['First of all, one.', 'two.', 'three.', 'four.'], ja: '' },
    { argument: 'a2', sentences: ['Secondly, s.', 's2.', 's3.', 's4.'], ja: '' },
    { argument: 'a3', sentences: ['Finally, s.', 's2.', 's3.', 's4.'], ja: '' },
  ], evaluation: null,
});

H.run('eval-feedback', async ({ page, base, check }) => {
  let mode = 429;
  await page.route('**/api/generate', r => {
    const b = JSON.parse(r.request().postData() || '{}');
    if (b.mode === 'evaluate') {
      if (mode === 429) return r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Quota exceeded（1日の上限）' }) });
      return r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'キーワードが正しくありません' }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto(base); await page.waitForTimeout(200);
  await H.skipKeyword(page);
  await H.injectSet(page, scoredSet('gen-ef'));
  await page.locator('[data-action="open-set"][data-id="gen-ef"]').click(); await page.waitForTimeout(200);

  check('score button visible (unscored)', await page.locator('[data-action="eval-now"]').count() === 1);

  await page.locator('[data-action="eval-now"]').click(); await page.waitForTimeout(400);
  const t1 = await page.locator('#app').innerText();
  check('quota error surfaced in banner', t1.includes('採点に失敗') && t1.includes('Quota exceeded'));
  check('score button still available to retry', await page.locator('[data-action="eval-now"]').count() === 1);

  const x = page.locator('[data-action="dismiss-error"]'); if (await x.count()) { await x.click(); await page.waitForTimeout(100); }

  mode = 401;
  await page.locator('[data-action="eval-now"]').click(); await page.waitForTimeout(400);
  check('unauthorized opens keyword modal', await page.locator('#inpKeyword').count() === 1);
  check('stale keyword cleared', await page.evaluate(() => localStorage.getItem('et.keyword')) === null);
});
