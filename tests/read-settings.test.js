/* 音読設定：速さ・声の高さ・声・繰り返し回数を保存し、再生に反映する */
const H = require('./helpers');

H.run('read-settings', async ({ page, base, check }) => {
  // Web Speech API をスタブ化（読み取り専用アクセサなので defineProperty で置換）
  await page.addInitScript(() => {
    window.__spoken = [];
    let pending = null;
    function U(t) { this.text = t; this.onend = null; this.onerror = null; this.lang = ''; this.voice = null; this.rate = 1; this.pitch = 1; }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, writable: true, value: U });
    const synth = {
      getVoices() { return [{ lang: 'en-US', name: 'Alpha EN' }, { lang: 'en-GB', name: 'Bravo GB' }, { lang: 'ja-JP', name: 'JP' }]; },
      speak(u) { window.__spoken.push({ rate: u.rate, pitch: u.pitch, voice: u.voice && u.voice.name }); pending = setTimeout(() => { pending = null; if (u.onend) u.onend(); }, 40); },
      cancel() { if (pending) { clearTimeout(pending); pending = null; } },
      addEventListener() {}, removeEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, get() { return synth; } });
  });
  await page.goto(base); await page.waitForTimeout(200);
  await H.skipKeyword(page);
  await page.locator('[data-action="open-settings"]').click(); await page.waitForTimeout(200);

  check('rate slider present', await page.locator('#readRate').count() === 1);
  check('pitch slider present', await page.locator('#readPitch').count() === 1);
  check('only english voices + auto (3 options)', await page.locator('#readVoice option').count() === 3);
  check('repeat default 10', (await page.locator('#readRepeat').inputValue()) === '10');

  const setRange = (id, v) => page.evaluate(([i, val]) => { const el = document.getElementById(i); el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  await setRange('readRate', '1.25'); await setRange('readPitch', '0.8');
  await page.locator('#readVoice').selectOption('Bravo GB');
  await page.locator('#readRepeat').selectOption('3');
  await page.waitForTimeout(50);
  check('rate saved', await page.evaluate(() => localStorage.getItem('et.readRate')) === '1.25');
  check('pitch saved', await page.evaluate(() => localStorage.getItem('et.readPitch')) === '0.8');
  check('voice saved', await page.evaluate(() => localStorage.getItem('et.readVoice')) === 'Bravo GB');
  check('repeat saved', await page.evaluate(() => localStorage.getItem('et.readRepeat')) === '3');

  await page.locator('[data-action="test-read"]').click(); await page.waitForTimeout(120);
  const spoken = await page.evaluate(() => window.__spoken);
  check('test-read uses saved rate/pitch/voice', spoken.length === 1 && spoken[0].rate === 1.25 && spoken[0].pitch === 0.8 && spoken[0].voice === 'Bravo GB');

  await page.locator('button[data-action="close-modal"]').first().click(); await page.waitForTimeout(120);
  await page.locator('.set-info').first().click(); await page.waitForTimeout(200);
  check('read button shows 3回', (await page.locator('[data-action="read-essay"]').innerText()).includes('3回'));
});
