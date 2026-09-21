/* 保護（ピン留め）とメモ：保護中は再生成・削除・本文編集を不可にし、メモは自動保存 */
const H = require('./helpers');

const genSet = (id) => ({
  id, topic: 'T?', topicJa: 'テ', stance: 'agree', source: 'gemini', createdAt: Date.now(),
  bodies: [
    { argument: 'a1', sentences: ['First of all, one.', 'two.', 'three.', 'four.'], ja: '和1' },
    { argument: 'a2', sentences: ['Secondly, s.', 's2.', 's3.', 's4.'], ja: '和2' },
    { argument: 'a3', sentences: ['Finally, s.', 's2.', 's3.', 's4.'], ja: '和3' },
  ], evaluation: null,
});

H.run('protect-memo', async ({ page, base, check }) => {
  page.on('dialog', d => d.accept());
  await page.route('**/api/generate', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(base); await page.waitForTimeout(200);
  await H.skipKeyword(page);
  await H.injectSet(page, genSet('gen-pm'));
  const open = () => page.locator('[data-action="open-set"][data-id="gen-pm"]').click();
  await open(); await page.waitForTimeout(200);

  // memo
  await page.locator('#essayMemo').fill('覚えた表現：mitigate'); await page.waitForTimeout(150);
  check('memo auto-saved', await page.evaluate(() => JSON.parse(localStorage.getItem('et.sets')).find(s => s.id === 'gen-pm').memo) === '覚えた表現：mitigate');
  await page.locator('[data-action="go-home"]').click(); await page.waitForTimeout(120);
  await open(); await page.waitForTimeout(150);
  check('memo persists after reopen', (await page.locator('#essayMemo').inputValue()) === '覚えた表現：mitigate');

  // before pin
  check('regenerate visible before pin', await page.locator('[data-action="regenerate-essay"]').count() === 1);
  check('edit button visible before pin', await page.locator('button[data-action="open-body-edit"]').count() >= 1);

  await page.locator('[data-action="toggle-pin"]').click(); await page.waitForTimeout(150);
  check('pinned flag set', await page.evaluate(() => JSON.parse(localStorage.getItem('et.sets')).find(s => s.id === 'gen-pm').pinned === true));
  check('regenerate hidden when pinned', await page.locator('[data-action="regenerate-essay"]').count() === 0);
  check('edit button hidden when pinned', await page.locator('button[data-action="open-body-edit"]').count() === 0);
  check('protected hint shown', (await page.locator('#app').innerText()).includes('保護中'));

  await page.locator('[data-action="go-home"]').click(); await page.waitForTimeout(150);
  const card = page.locator('.set-card', { has: page.locator('[data-action="open-set"][data-id="gen-pm"]') });
  check('home: delete hidden for pinned', await card.locator('[data-action="delete-set"]').count() === 0);
  check('home: 🔒 badge shown', (await card.innerText()).includes('保護'));

  await open(); await page.waitForTimeout(150);
  await page.locator('[data-action="toggle-pin"]').click(); await page.waitForTimeout(150);
  check('unpin restores regenerate', await page.locator('[data-action="regenerate-essay"]').count() === 1);
  check('unpin restores edit button', await page.locator('button[data-action="open-body-edit"]').count() >= 1);
});
