/* 二段のUndo：編集/模範解答リセットの直前状態を prev に退避し「直前に戻す」で往復できる */
const H = require('./helpers');

const genSet = (id) => ({
  id, topic: 'T?', topicJa: 'テ', stance: 'agree', source: 'gemini', createdAt: Date.now(),
  bodies: [
    { argument: 'a1', sentences: ['First of all, ORIGINAL one.', 'Original two.', 'Original three.', 'Original four.'], ja: '和' },
    { argument: 'a2', sentences: ['Secondly, s.', 's2.', 's3.', 's4.'], ja: '' },
    { argument: 'a3', sentences: ['Finally, s.', 's2.', 's3.', 's4.'], ja: '' },
  ], evaluation: null,
});

H.run('undo', async ({ page, base, check }) => {
  let confirmMsg = null;
  page.on('dialog', d => { confirmMsg = d.message(); d.accept(); });
  await page.route('**/api/generate', r => { const b = JSON.parse(r.request().postData() || '{}'); if (b.mode === 'evaluate') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ evaluation: { structure: 8, content: 8, language: 8, average: 8, comments: {} }, arguments: ['a', 'b', 'c'], axes: [] }) }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await page.goto(base); await page.waitForTimeout(200);
  await H.skipKeyword(page);
  await H.injectSet(page, genSet('gen-undo'));
  await page.locator('[data-action="open-set"][data-id="gen-undo"]').click(); await page.waitForTimeout(200);
  const b0 = () => page.evaluate(() => JSON.parse(localStorage.getItem('et.sets')).find(s => s.id === 'gen-undo').bodies[0]);

  check('no undo-last before any change', await page.locator('[data-action="undo-last"]').count() === 0);

  // edit body 0
  await page.locator('.body-card').first().locator('button[data-action="open-body-edit"]').click(); await page.waitForTimeout(200);
  await page.locator('#es-0').fill('First of all, EDITED one.'); await page.waitForTimeout(50);
  await page.locator('[data-action="body-edit-save"]').click(); await page.waitForTimeout(300);
  let body = await b0();
  check('edit applied', body.sentences[0] === 'First of all, EDITED one.');
  check('prev stored', !!body.prev);
  check('undo-last now visible', await page.locator('[data-action="undo-last"]').count() >= 1);

  // revert to original model answer (confirm warns)
  await page.locator('.body-card').first().locator('[data-action="undo-body"]').click(); await page.waitForTimeout(300);
  check('confirm warns edits lost', confirmMsg && confirmMsg.includes('編集内容は失われます'));
  body = await b0();
  check('reverted to ORIGINAL', body.sentences[0].includes('ORIGINAL') && !body.sentences[0].includes('EDITED'));
  check('prev holds the edited version', body.prev && body.prev.sentences[0].includes('EDITED'));

  // undo the revert
  await page.locator('.body-card').first().locator('[data-action="undo-last"]').click(); await page.waitForTimeout(300);
  body = await b0();
  check('undo-last restores EDITED', body.sentences[0].includes('EDITED'));
  check('書き換え済み badge restored (original present)', !!body.original);

  // toggle back
  await page.locator('.body-card').first().locator('[data-action="undo-last"]').click(); await page.waitForTimeout(300);
  body = await b0();
  check('toggles back to ORIGINAL', body.sentences[0].includes('ORIGINAL') && !body.sentences[0].includes('EDITED'));
});
