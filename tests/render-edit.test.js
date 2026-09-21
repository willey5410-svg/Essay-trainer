/* 本文は色分けなしのプレーン表示で、機能ラベルは残り、「本文を編集」で全文編集できる */
const H = require('./helpers');

const genSet = (id) => ({
  id, topic: 'T?', topicJa: 'テ', stance: 'agree', source: 'gemini', createdAt: Date.now(),
  bodies: [
    { argument: 'a1', sentences: ['First of all, the labor force is reshaped.', 'This is because machines take over.', 'In fact, jobs vanish.', 'This burden is intolerable.'], ja: '和' },
    { argument: 'a2', sentences: ['Secondly, s.', 's2.', 's3.', 's4.'], ja: '' },
    { argument: 'a3', sentences: ['Finally, s.', 's2.', 's3.', 's4.'], ja: '' },
  ], evaluation: null,
});

H.run('render-edit', async ({ page, base, check }) => {
  await page.route('**/api/generate', r => {
    const b = JSON.parse(r.request().postData() || '{}');
    if (b.mode === 'evaluate') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ evaluation: { structure: 8, content: 8, language: 8, average: 8, comments: {} }, arguments: ['a', 'b', 'c'], axes: [] }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto(base); await page.waitForTimeout(200);
  await H.skipKeyword(page);
  await H.injectSet(page, genSet('gen-nocolor'));
  await page.locator('[data-action="open-set"][data-id="gen-nocolor"]').click(); await page.waitForTimeout(200);

  check('no colored .free spans in body', await page.locator('.body-card .free').count() === 0);
  check('no tap-to-edit spans', await page.locator('.free.tap').count() === 0);
  check('sentence text shown plainly', (await page.locator('.body-card').first().innerText()).includes('First of all, the labor force is reshaped.'));
  check('function labels still shown', await page.locator('.body-card .fn-tag').count() >= 4);
  check('hint drops 色付き', !(await page.locator('#app').innerText()).includes('色付き'));

  await page.locator('.body-card').first().locator('button[data-action="open-body-edit"]').click(); await page.waitForTimeout(200);
  check('editor shows 4 full-sentence textareas', await page.locator('.sent-input').count() === 4);
  await page.locator('#es-0').fill('To begin with, automation transforms the workforce.'); await page.waitForTimeout(50);
  await page.locator('[data-action="body-edit-save"]').click(); await page.waitForTimeout(300);
  const b0 = await page.evaluate(() => JSON.parse(localStorage.getItem('et.sets')).find(s => s.id === 'gen-nocolor').bodies[0]);
  check('edit incl template phrase saved', b0.sentences[0] === 'To begin with, automation transforms the workforce.');
  check('edited text shown, still no color', (await page.locator('.body-card').first().innerText()).includes('To begin with, automation transforms the workforce.') && await page.locator('.body-card .free').count() === 0);
});
