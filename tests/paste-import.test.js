/* 自作エッセイの一括貼り付け：空行区切りの3段落を Body として取り込む */
const H = require('./helpers');

H.run('paste-import', async ({ page, base, check }) => {
  await page.goto(base); await page.waitForTimeout(200);
  await H.skipKeyword(page);

  check('home shows paste entry', await page.locator('[data-action="open-paste-essay"]').count() === 1);
  await page.locator('[data-action="open-paste-essay"]').click(); await page.waitForTimeout(150);
  check('paste modal opened', await page.locator('#pasteText').count() === 1);

  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('et.sets') || '[]').length);
  await page.locator('#pasteText').fill('Only one.\n\nOnly two.');
  await page.locator('[data-action="paste-essay-submit"]').click(); await page.waitForTimeout(200);
  check('wrong paragraph count errors', (await page.locator('.field-error').count()) > 0);
  check('no set created on error', await page.evaluate(() => JSON.parse(localStorage.getItem('et.sets') || '[]').length) === before);
  check('text preserved after error', (await page.locator('#pasteText').inputValue()).includes('Only one.'));

  await page.locator('#pasteTopic').fill('Should Japan accept more immigrants?');
  await page.locator('#pasteStance').selectOption('disagree');
  const essay = [
    'First of all, mass immigration reshapes the labor market. As cheaper labor arrives, wages fall. This burden is intolerable.',
    'Secondly, rapid inflows strain public services. Schools cannot expand fast enough. This means quality declines.',
    'Finally, integration is difficult. It is true that diversity brings benefits. However, friction grows. Therefore, caution is wise.',
  ].join('\n\n');
  await page.locator('#pasteText').fill(essay);
  await page.locator('[data-action="paste-essay-submit"]').click(); await page.waitForTimeout(300);

  check('landed on study view (3 bodies)', await page.locator('.body-card').count() === 3);
  const set = await page.evaluate(() => JSON.parse(localStorage.getItem('et.sets'))[0]);
  check('source is self', set.source === 'self');
  check('topic stored', set.topic === 'Should Japan accept more immigrants?');
  check('stance stored', set.stance === 'disagree');
  check('body1 split into 3 sentences', set.bodies[0].sentences.length === 3);
  check('body1 first sentence intact', set.bodies[0].sentences[0] === 'First of all, mass immigration reshapes the labor market.');
  check('body3 split into 4 sentences', set.bodies[2].sentences.length === 4);
  check('arguments empty until scored', set.bodies.every(b => b.argument === ''));
  check('evaluation null (unscored)', set.evaluation === null);
  check('score button available', await page.locator('[data-action="eval-now"]').count() === 1);

  await page.locator('[data-action="go-home"]').click(); await page.waitForTimeout(150);
  check('home card marked 自作', (await page.locator('.set-card').first().innerText()).includes('自作'));
});
