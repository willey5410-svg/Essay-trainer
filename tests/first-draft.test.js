/* 初回（自分の下書き）と模範解答をタブで切り替えて比較できる */
const H = require('./helpers');

H.run('first-draft', async ({ page, base, check }) => {
  page.on('dialog', d => d.accept());
  await page.goto(base); await page.waitForTimeout(200);
  await H.skipKeyword(page);

  // 貼り付けフォームで「模範解答」＋「初回」を同時に取り込む
  await page.locator('[data-action="open-paste-essay"]').click(); await page.waitForTimeout(150);
  check('paste form has a first-draft textarea', await page.locator('#pasteFirstText').count() === 1);

  await page.locator('#pasteTopic').fill('Should Japan accept more immigrants?');
  const model = ['First of all, MODEL body one here.', 'Secondly, MODEL body two here.', 'Finally, MODEL body three here.'].join('\n\n');
  const first = ['First, MY draft one here.', 'Second, MY draft two here.', 'Third, MY draft three here.'].join('\n\n');
  await page.locator('#pasteText').fill(model);
  await page.locator('#pasteFirstText').fill(first);
  await page.locator('[data-action="paste-essay-submit"]').click(); await page.waitForTimeout(300);

  const set = await page.evaluate(() => JSON.parse(localStorage.getItem('et.sets'))[0]);
  check('firstBodies stored (3)', Array.isArray(set.firstBodies) && set.firstBodies.length === 3);
  check('model bodies stored separately', set.bodies[0].sentences[0] === 'First of all, MODEL body one here.');
  check('first bodies hold the draft', set.firstBodies[0].sentences[0] === 'First, MY draft one here.');

  // タブが出て、既定は模範解答
  check('three version tabs shown', await page.locator('.version-tabs .vtab').count() === 3);
  check('default tab shows MODEL text', (await page.locator('#app').innerText()).includes('MODEL body one here.'));
  check('default tab does NOT show draft text', !(await page.locator('#app').innerText()).includes('MY draft one here.'));

  // 初回タブに切替
  await page.locator('[data-action="study-tab"][data-tab="first"]').click(); await page.waitForTimeout(150);
  const firstTxt = await page.locator('#app').innerText();
  check('first tab shows the draft', firstTxt.includes('MY draft one here.'));
  check('first tab is read-only (no edit button)', await page.locator('button[data-action="open-body-edit"]').count() === 0);
  check('first tab has replace/delete controls', await page.locator('[data-action="delete-first-draft"]').count() === 1);

  // 比較タブ：初回と模範を1文ずつ左右に並べる
  check('compare tab shown', await page.locator('[data-action="study-tab"][data-tab="compare"]').count() === 1);
  await page.locator('[data-action="study-tab"][data-tab="compare"]').click(); await page.waitForTimeout(150);
  check('compare rows rendered', await page.locator('.cmp-row').count() >= 3);
  check('compare row has first cell', await page.locator('.cmp-row .cmp-first').first().innerText().then(t => t.includes('MY draft one here.')));
  check('compare row has model cell', await page.locator('.cmp-row .cmp-model').first().innerText().then(t => t.includes('MODEL body one here.')));
  check('compare tab read-only (no edit button)', await page.locator('button[data-action="open-body-edit"]').count() === 0);

  // 模範解答タブへ戻ると編集可
  await page.locator('[data-action="study-tab"][data-tab="model"]').click(); await page.waitForTimeout(150);
  check('model tab editable again', await page.locator('button[data-action="open-body-edit"]').count() >= 1);

  // home に戻ると「初回あり」バッジ
  await page.locator('[data-action="go-home"]').click(); await page.waitForTimeout(150);
  check('home card shows 初回あり badge', (await page.locator('.set-card').first().innerText()).includes('初回あり'));

  // --- 既存セット（初回なし）に後から初回を登録 ---
  await page.evaluate(() => {
    const sets = JSON.parse(localStorage.getItem('et.sets'));
    sets.unshift({ id: 'gen-nofirst', topic: 'T?', topicJa: 'テ', stance: 'agree', source: 'gemini', createdAt: Date.now(),
      bodies: [ { argument: 'a', sentences: ['First of all, one.', 'two.', 'three.', 'four.'], ja: '' },
        { argument: 'b', sentences: ['Secondly, s.', 's2.', 's3.', 's4.'], ja: '' },
        { argument: 'c', sentences: ['Finally, s.', 's2.', 's3.', 's4.'], ja: '' } ], evaluation: null });
    localStorage.setItem('et.sets', JSON.stringify(sets));
  });
  await page.reload(); await page.waitForTimeout(200); await H.skipKeyword(page);
  await page.locator('[data-action="open-set"][data-id="gen-nofirst"]').click(); await page.waitForTimeout(200);
  check('no tabs when no first draft', await page.locator('.version-tabs').count() === 0);
  check('register-first button shown', await page.locator('[data-action="open-first-draft"]').count() === 1);
  await page.locator('[data-action="open-first-draft"]').click(); await page.waitForTimeout(150);
  await page.locator('#firstDraftText').fill(first);
  await page.locator('[data-action="first-draft-save"]').click(); await page.waitForTimeout(300);
  check('first draft registered on existing set', await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('et.sets')).find(x => x.id === 'gen-nofirst'); return Array.isArray(s.firstBodies) && s.firstBodies.length === 3; }));
  check('tabs appear after registering', await page.locator('.version-tabs .vtab').count() === 3);
  check('switched to first tab after save', (await page.locator('#app').innerText()).includes('MY draft one here.'));
});
