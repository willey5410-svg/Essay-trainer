/* 英検1級 Essay Trainer — メインアプリ */

const LS = {
  keyword: 'et.keyword',
  sets: 'et.sets',
  progress: 'et.progress',
  themes: 'et.customThemes',
  seeded: 'et.seeded.v2', // サンプル内容を更新したらバージョンを上げて再シードする
};

let state = {
  view: 'home',        // home | brainstorm | study | exercise | loading
  modal: null,         // settings | stance | keyword | null
  keywordError: null,
  busyKeyword: false,
  pendingTheme: null,
  pendingStance: null,
  bsTimerId: null,
  loadingText: '',
  setId: null,
  showJa: {},
  ex: null,
  error: null,
  notice: null,
  busyThemes: false,
};

const $app = document.getElementById('app');

/* ---------- utilities ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
}

/* ---------- storage ---------- */

function getSets() { return readJSON(LS.sets, []); }
function saveSetsList(sets) { localStorage.setItem(LS.sets, JSON.stringify(sets)); }
function getProgress() { return readJSON(LS.progress, {}); }
function saveProgress(p) { localStorage.setItem(LS.progress, JSON.stringify(p)); }
function getCustomThemes() { return readJSON(LS.themes, []); }
function saveCustomThemes(t) { localStorage.setItem(LS.themes, JSON.stringify(t)); }

function seedPresets() {
  if (localStorage.getItem(LS.seeded)) return;
  // 旧バージョンのサンプルは新しい内容に置き換える（生成済みエッセイは残す）
  const sets = PRESET_SETS.concat(getSets().filter(s => s.source !== 'preset'));
  saveSetsList(sets);
  localStorage.setItem(LS.seeded, '1');
}

function findSet(id) { return getSets().find(s => s.id === id); }

/* ---------- rendering ---------- */

function render() {
  let html = '';
  if (state.view === 'home') html = viewHome();
  else if (state.view === 'brainstorm') html = viewBrainstorm();
  else if (state.view === 'study') html = viewStudy();
  else if (state.view === 'exercise') html = viewExercise();
  else if (state.view === 'loading') html = viewLoading();
  if (state.modal === 'settings') html += modalSettings();
  if (state.modal === 'stance') html += modalStance();
  if (state.modal === 'keyword') html += modalKeyword();
  $app.innerHTML = html;
}

function banner() {
  let h = '';
  if (state.error) h += `<div class="banner error">${esc(state.error)} <button class="banner-x" data-action="dismiss-error">×</button></div>`;
  if (state.notice) h += `<div class="banner notice">${esc(state.notice)} <button class="banner-x" data-action="dismiss-notice">×</button></div>`;
  return h;
}

function stanceBadge(stance) {
  return stance === 'agree'
    ? '<span class="badge agree">賛成</span>'
    : '<span class="badge disagree">反対</span>';
}

/* ---------- home ---------- */

function viewHome() {
  const sets = getSets();
  const progress = getProgress();

  const setItems = sets.map(s => {
    const p = progress[s.id] || {};
    const badges = [0, 1, 2].map(i => {
      const bp = p[i];
      const cls = bp ? (bp.best >= 90 ? 'done' : 'part') : '';
      return `<span class="body-dot ${cls}" title="Body ${i + 1}${bp ? ` 正答率 ${bp.best}%` : ' 未実施'}">${i + 1}</span>`;
    }).join('');
    return `<div class="card set-card">
      <div class="set-info" data-action="open-set" data-id="${esc(s.id)}">
        <div class="set-topic">${esc(s.topic)}</div>
        <div class="set-sub">${esc(s.topicJa || '')} ${stanceBadge(s.stance)} ${s.source === 'gemini' ? '<span class="badge src">Gemini</span>' : '<span class="badge src">サンプル</span>'}</div>
      </div>
      <div class="set-side">
        <div class="body-dots">${badges}</div>
        <button class="btn small ghost" data-action="delete-set" data-id="${esc(s.id)}">削除</button>
      </div>
    </div>`;
  }).join('') || '<p class="empty">まだエッセイがありません。下のテーマから作成してください。</p>';

  const themes = PRESET_THEMES.concat(getCustomThemes());
  const cats = [...new Set(themes.map(t => t.category))];
  const themeHtml = cats.map(cat => {
    const items = themes.filter(t => t.category === cat).map(t => {
      const idx = themes.indexOf(t);
      return `<button class="theme-item" data-action="pick-theme" data-idx="${idx}">
        <span class="theme-en">${esc(t.topic)}</span>
        <span class="theme-ja">${esc(t.topicJa || '')}</span>
      </button>`;
    }).join('');
    return `<div class="theme-group"><h3>${esc(cat)}</h3>${items}</div>`;
  }).join('');

  return `<header class="topbar">
      <h1>英検1級 Essay Trainer</h1>
      <button class="btn ghost" data-action="open-settings">⚙ 設定</button>
    </header>
    ${banner()}
    <section>
      <h2>📚 学習中のエッセイ</h2>
      ${setItems}
    </section>
    <section>
      <h2>✨ 新しいテーマを選ぶ</h2>
      <p class="hint-text">テーマを選ぶと賛成/反対を選択後、Gemini が Body 1〜3 の例文を生成します。</p>
      ${themeHtml}
      <button class="btn wide" data-action="gen-themes" ${state.busyThemes ? 'disabled' : ''}>
        ${state.busyThemes ? '生成中…' : '🤖 Gemini でテーマ案を追加生成'}
      </button>
    </section>`;
}

/* ---------- brainstorm view（生成前の論点出しトレーニング） ---------- */

const BS_SECONDS = 90;

function viewBrainstorm() {
  const t = state.pendingTheme;
  return `<header class="topbar">
      <button class="btn ghost" data-action="go-home">← 中止</button>
      <span class="topbar-title">論点出しトレーニング</span>
    </header>
    <div class="topic-head">
      <h2>${esc(t.topic)}</h2>
      <p class="set-sub">${esc(t.topicJa || '')} ${stanceBadge(state.pendingStance)}</p>
    </div>
    <div class="card">
      <div class="body-head">
        <span class="slot-label">90秒で論点を3つ（<strong>A does B</strong> の形で考える）</span>
        <span id="bsTimer" class="bs-timer">1:30</span>
      </div>
      <input type="text" class="bs-input" id="bsPoint0" placeholder="論点① 例：AIが仕事を奪う">
      <input type="text" class="bs-input" id="bsPoint1" placeholder="論点②">
      <input type="text" class="bs-input" id="bsPoint2" placeholder="論点③">
      <button class="btn small ghost" data-action="bs-hint">💡 観点カテゴリのヒント</button>
      <div id="bsHints" class="bs-hints" hidden>経済・雇用 ／ 社会・公平性 ／ 倫理・人権 ／ 健康・安全 ／ 環境 ／ 教育・文化 ／ 国際関係</div>
      <div class="row">
        <button class="btn" data-action="bs-generate">答え合わせ（Gemini で生成）</button>
        <button class="btn ghost" data-action="bs-skip">スキップして生成</button>
      </div>
      <p class="hint-text">入力した論点は Gemini が有効性を判定し、生成された論点と並べて比較表示されます。日本語でもOKです。</p>
    </div>`;
}

function startBrainstorm() {
  state.modal = null;
  state.view = 'brainstorm';
  render();
  stopBsTimer();
  const deadline = Date.now() + BS_SECONDS * 1000;
  // 再レンダリングで入力値が消えないよう、タイマーは DOM を直接更新する
  state.bsTimerId = setInterval(() => {
    const el = document.getElementById('bsTimer');
    if (!el || state.view !== 'brainstorm') { stopBsTimer(); return; }
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (left > 0) {
      el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    } else {
      el.textContent = '⏰ 時間切れ';
      el.classList.add('over');
      stopBsTimer();
    }
  }, 250);
}

function stopBsTimer() {
  if (state.bsTimerId) { clearInterval(state.bsTimerId); state.bsTimerId = null; }
}

function collectBrainstormPoints() {
  return [0, 1, 2]
    .map(i => (document.getElementById('bsPoint' + i) || {}).value || '')
    .map(v => v.trim())
    .filter(Boolean);
}

/* ---------- study view ---------- */

function viewStudy() {
  const set = findSet(state.setId);
  if (!set) { state.view = 'home'; return viewHome(); }
  const progress = getProgress()[set.id] || {};

  const bodiesHtml = set.bodies.map((body, bi) => {
    const tpl = TEMPLATES[bi];
    const linesHtml = tpl.lines.map(line =>
      `<p class="study-line">${line.map(p =>
        p.text !== undefined
          ? esc(p.text)
          : `<span class="slot done" title="${SLOT_LABELS[p.slot]}">${esc(body.slots[p.slot])}</span>`
      ).join('')}</p>`
    ).join('');
    const bp = progress[bi];
    const wc = assembleBody(bi, body.slots).split(/\s+/).filter(Boolean).length;
    const stat = `<span class="stat">${wc} 語 ・ ${bp ? `実施 ${bp.count} 回 / ベスト ${bp.best}%` : '未実施'}</span>`;
    const jaShown = state.showJa[bi];
    return `<div class="card body-card">
      <div class="body-head"><h3>${tpl.name}</h3>${stat}</div>
      ${linesHtml}
      ${jaShown && body.ja ? `<p class="ja-text">${esc(body.ja)}</p>` : ''}
      <div class="row">
        ${body.ja ? `<button class="btn small ghost" data-action="toggle-ja" data-body="${bi}">${jaShown ? '和訳を隠す' : '和訳を表示'}</button>` : ''}
        <button class="btn small" data-action="start-ex" data-id="${esc(set.id)}" data-body="${bi}">▶ この Body を練習</button>
      </div>
    </div>`;
  }).join('');

  return `<header class="topbar">
      <button class="btn ghost" data-action="go-home">← 一覧へ</button>
    </header>
    ${banner()}
    <div class="topic-head">
      <h2>${esc(set.topic)}</h2>
      <p class="set-sub">${esc(set.topicJa || '')} ${stanceBadge(set.stance)}</p>
    </div>
    ${compareCard(set)}
    ${set.evaluation ? evalCard(set.evaluation) : ''}
    ${bodiesHtml}`;
}

function compareCard(set) {
  if (!set.userPoints || !set.userPoints.length) return '';
  const badge = v => v === 'valid' ? '<span class="verdict valid">✅ 有効</span>'
    : v === 'invalid' ? '<span class="verdict invalid">✖ 要注意</span>'
    : '<span class="verdict weak">△ 弱い</span>';
  const reviews = set.pointsReview || [];
  const mine = set.userPoints.map((pt, i) => {
    const r = reviews[i];
    return `<li>${esc(pt)} ${r ? badge(r.verdict) : ''}
      ${r && r.comment ? `<div class="verdict-comment">${esc(r.comment)}</div>` : ''}</li>`;
  }).join('');
  const gemini = set.bodies.map(b => `<li>${esc(b.slots.reason)}</li>`).join('');
  return `<div class="card compare-card">
    <h3>🧠 論点の答え合わせ</h3>
    <div class="compare-cols">
      <div><h4>あなたの論点</h4><ol>${mine}</ol></div>
      <div><h4>Gemini の論点</h4><ol>${gemini}</ol></div>
    </div>
  </div>`;
}

function evalCard(ev) {
  const pass = ev.average >= 8;
  return `<div class="card eval-card">
    <div class="body-head">
      <h3>🧪 Gemini 採点</h3>
      <span class="eval-avg ${pass ? 'pass' : 'warn'}">平均 ${ev.average} / 10</span>
    </div>
    <div class="eval-scores">構成 <strong>${ev.structure}</strong> ・ 内容 <strong>${ev.content}</strong> ・ 英語表現 <strong>${ev.language}</strong></div>
    <ul class="eval-comments">
      ${ev.comments.structure ? `<li><strong>構成：</strong>${esc(ev.comments.structure)}</li>` : ''}
      ${ev.comments.content ? `<li><strong>内容：</strong>${esc(ev.comments.content)}</li>` : ''}
      ${ev.comments.language ? `<li><strong>英語表現：</strong>${esc(ev.comments.language)}</li>` : ''}
    </ul>
  </div>`;
}

/* ---------- exercise view ---------- */

function viewExercise() {
  const ex = state.ex;
  const set = findSet(ex.setId);
  const tpl = TEMPLATES[ex.bodyIdx];
  const totalSlots = ex.slots.length;

  let slotIdx = 0;
  const bodyHtml = tpl.lines.map((line, li) => {
    const html = line.map(p => {
      if (p.text !== undefined) return esc(p.text);
      const gi = slotIdx++;
      const slot = ex.slots[gi];
      if (ex.done || gi < ex.slotPos) {
        return `<span class="slot done">${esc(slot.words.join(' '))}</span>`;
      }
      if (gi === ex.slotPos) {
        const placed = slot.words.slice(0, ex.wordPos).join(' ');
        const blanks = slot.words.slice(ex.wordPos).map(() => '<span class="blank">___</span>').join(' ');
        return `<span class="slot current">${esc(placed)}${placed ? ' ' : ''}${blanks}</span>`;
      }
      return `<span class="slot pending">[${SLOT_LABELS[p.slot]}]</span>`;
    }).join('');
    const active = !ex.done && ex.slots[ex.slotPos] && ex.slots[ex.slotPos].line === li;
    return `<p class="ex-line${active ? ' active' : ''}">${html}</p>`;
  }).join('');

  let bottom;
  if (ex.done) {
    const total = ex.slots.reduce((n, s) => n + s.words.length, 0);
    const acc = Math.max(0, Math.round(100 * total / (total + ex.mistakes + ex.hints)));
    const body = set.bodies[ex.bodyIdx];
    const hasNext = ex.bodyIdx < 2;
    bottom = `<div class="card result-card">
      <h3>🎉 ${tpl.name} 完成！</h3>
      <p class="stat">正答率 <strong>${acc}%</strong>（ミス ${ex.mistakes} / ヒント ${ex.hints}）</p>
      ${body.ja ? `<p class="ja-text">${esc(body.ja)}</p>` : ''}
      <div class="row">
        <button class="btn small ghost" data-action="ex-retry">もう一度</button>
        ${hasNext ? `<button class="btn small" data-action="ex-next-body">次の Body へ ▶</button>` : ''}
        <button class="btn small ghost" data-action="ex-quit">学習画面へ</button>
      </div>
    </div>`;
  } else {
    const curSlot = ex.slots[ex.slotPos];
    const chips = ex.chips.map((w, i) =>
      `<button class="chip${state.wrongChip === i ? ' wrong' : ''}" data-action="chip" data-idx="${i}">${esc(w)}</button>`
    ).join('');
    bottom = `<div class="chip-panel">
      <div class="chip-head">
        <span class="slot-label">空欄：<strong>${SLOT_LABELS[curSlot.key]}</strong>（${curSlot.words.length - ex.wordPos} 語）</span>
        <span class="stat">ミス ${ex.mistakes}</span>
      </div>
      <div class="chips">${chips}</div>
      <div class="row">
        <button class="btn small ghost" data-action="hint">💡 ヒント（1語）</button>
        <button class="btn small ghost" data-action="ex-quit">中断</button>
      </div>
    </div>`;
  }

  const pct = Math.round(100 * (ex.done ? totalSlots : ex.slotPos) / totalSlots);
  return `<header class="topbar">
      <button class="btn ghost" data-action="ex-quit">← 戻る</button>
      <span class="topbar-title">${tpl.name}</span>
    </header>
    <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>
    <p class="topic-line">${esc(set.topic)} ${stanceBadge(set.stance)}</p>
    <div class="card ex-body">${bodyHtml}</div>
    ${bottom}`;
}

function viewLoading() {
  return `<div class="loading">
    <div class="spinner"></div>
    <p>${esc(state.loadingText || '生成中…')}</p>
  </div>`;
}

/* ---------- modals ---------- */

function modalSettings() {
  return `<div class="overlay" data-action="close-modal">
    <div class="modal" data-stop>
      <h3>設定</h3>
      <label>合言葉（キーワード）</label>
      <input type="password" id="inpKeyword" value="${esc(localStorage.getItem(LS.keyword) || '')}" placeholder="合言葉を入力">
      ${state.keywordError ? `<p class="field-error">${esc(state.keywordError)}</p>` : ''}
      <p class="hint-text">Gemini での生成に必要な合言葉です。確認のうえこの端末に保存されます。</p>
      <div class="row">
        <button class="btn" data-action="save-keyword" data-from="settings" ${state.busyKeyword ? 'disabled' : ''}>${state.busyKeyword ? '確認中…' : '確認して保存'}</button>
        <button class="btn ghost" data-action="close-modal">閉じる</button>
      </div>
      <hr>
      <div class="row">
        <button class="btn small ghost" data-action="export-data">データをエクスポート</button>
        <button class="btn small ghost" data-action="import-data">インポート</button>
      </div>
    </div>
  </div>`;
}

function modalKeyword() {
  return `<div class="overlay">
    <div class="modal" data-stop>
      <h3>ようこそ 👋</h3>
      <p class="hint-text">英検1級エッセイの構築・暗記トレーナーです。Gemini による例文生成を利用するには、合言葉（キーワード）を入力してください。</p>
      <label>合言葉（キーワード）</label>
      <input type="password" id="inpKeyword" placeholder="合言葉を入力">
      ${state.keywordError ? `<p class="field-error">${esc(state.keywordError)}</p>` : ''}
      <div class="row">
        <button class="btn wide" data-action="save-keyword" data-from="welcome" ${state.busyKeyword ? 'disabled' : ''}>${state.busyKeyword ? '確認中…' : '確認して開始'}</button>
      </div>
      <button class="btn ghost wide" data-action="skip-keyword">あとで入力（サンプル練習のみ）</button>
    </div>
  </div>`;
}

function modalStance() {
  const t = state.pendingTheme;
  return `<div class="overlay" data-action="close-modal">
    <div class="modal" data-stop>
      <h3>スタンスを選択</h3>
      <p class="theme-en">${esc(t.topic)}</p>
      <p class="theme-ja">${esc(t.topicJa || '')}</p>
      <div class="row">
        <button class="btn" data-action="choose-stance" data-stance="agree">賛成（YES）で書く</button>
        <button class="btn" data-action="choose-stance" data-stance="disagree">反対（NO）で書く</button>
      </div>
      <button class="btn ghost wide" data-action="close-modal">キャンセル</button>
    </div>
  </div>`;
}

/* ---------- exercise logic ---------- */

function startExercise(setId, bodyIdx) {
  const set = findSet(setId);
  if (!set) return;
  const tpl = TEMPLATES[bodyIdx];
  const slots = [];
  tpl.lines.forEach((line, li) => {
    line.forEach(p => {
      if (p.slot) {
        const value = String(set.bodies[bodyIdx].slots[p.slot] || '').trim();
        slots.push({ key: p.slot, line: li, words: value.split(/\s+/) });
      }
    });
  });
  state.ex = {
    setId, bodyIdx, slots,
    slotPos: 0, wordPos: 0,
    chips: shuffle(slots[0].words.slice()),
    mistakes: 0, hints: 0, done: false,
  };
  state.wrongChip = null;
  state.view = 'exercise';
  render();
}

function advanceExercise() {
  const ex = state.ex;
  const slot = ex.slots[ex.slotPos];
  if (ex.wordPos >= slot.words.length) {
    ex.slotPos++;
    ex.wordPos = 0;
    if (ex.slotPos >= ex.slots.length) {
      ex.done = true;
      recordProgress(ex);
    } else {
      ex.chips = shuffle(ex.slots[ex.slotPos].words.slice());
    }
  }
  render();
}

function tapChip(i) {
  const ex = state.ex;
  if (!ex || ex.done) return;
  const slot = ex.slots[ex.slotPos];
  const target = slot.words[ex.wordPos];
  if (ex.chips[i] === target) {
    ex.chips.splice(i, 1);
    ex.wordPos++;
    state.wrongChip = null;
    advanceExercise();
  } else {
    ex.mistakes++;
    state.wrongChip = i;
    render();
    setTimeout(() => {
      if (state.wrongChip === i) { state.wrongChip = null; render(); }
    }, 400);
  }
}

function useHint() {
  const ex = state.ex;
  if (!ex || ex.done) return;
  const slot = ex.slots[ex.slotPos];
  const target = slot.words[ex.wordPos];
  const idx = ex.chips.indexOf(target);
  if (idx >= 0) {
    ex.chips.splice(idx, 1);
    ex.wordPos++;
    ex.hints++;
    advanceExercise();
  }
}

function recordProgress(ex) {
  const total = ex.slots.reduce((n, s) => n + s.words.length, 0);
  const acc = Math.max(0, Math.round(100 * total / (total + ex.mistakes + ex.hints)));
  const progress = getProgress();
  const p = progress[ex.setId] || (progress[ex.setId] = {});
  const prev = p[ex.bodyIdx] || { count: 0, best: 0 };
  p[ex.bodyIdx] = { count: prev.count + 1, best: Math.max(prev.best, acc), last: acc };
  saveProgress(progress);
}

/* ---------- generation flows ---------- */

async function doGenerateEssay(theme, stance, userPoints) {
  if (!localStorage.getItem(LS.keyword)) {
    state.modal = 'keyword';
    state.keywordError = 'エッセイ生成には合言葉の入力が必要です';
    render();
    return;
  }
  state.modal = null;
  state.view = 'loading';
  state.loadingText = 'Gemini が例文を生成し、試験官として採点中…（論点の判定と再生成を含め、最大1分ほどかかることがあります）';
  render();
  try {
    const set = await generateEssaySet(theme, stance, userPoints);
    const sets = getSets();
    sets.unshift(set);
    saveSetsList(sets);
    state.setId = set.id;
    state.showJa = {};
    state.view = 'study';
    state.error = null;
  } catch (e) {
    state.view = 'home';
    if (e.code === 'UNAUTHORIZED') {
      localStorage.removeItem(LS.keyword);
      state.modal = 'keyword';
      state.keywordError = '合言葉が正しくありません。もう一度入力してください。';
    } else {
      state.error = '生成に失敗しました：' + e.message;
    }
  }
  render();
}

async function doGenerateThemes() {
  if (!localStorage.getItem(LS.keyword)) {
    state.modal = 'keyword';
    state.keywordError = 'テーマ生成には合言葉の入力が必要です';
    render();
    return;
  }
  state.busyThemes = true;
  render();
  try {
    const existing = PRESET_THEMES.concat(getCustomThemes()).map(t => t.topic);
    const themes = await generateThemes(existing);
    const custom = getCustomThemes();
    for (const t of themes) {
      if (!existing.includes(t.topic)) custom.push(t);
    }
    saveCustomThemes(custom);
    state.notice = `${themes.length} 件のテーマ案を追加しました`;
    state.error = null;
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') {
      localStorage.removeItem(LS.keyword);
      state.modal = 'keyword';
      state.keywordError = '合言葉が正しくありません。もう一度入力してください。';
    } else {
      state.error = 'テーマ生成に失敗しました：' + e.message;
    }
  }
  state.busyThemes = false;
  render();
}

async function doSaveKeyword(from) {
  const input = document.getElementById('inpKeyword');
  const keyword = input ? input.value.trim() : '';
  if (!keyword) {
    state.keywordError = '合言葉を入力してください';
    render();
    return;
  }
  state.busyKeyword = true;
  state.keywordError = null;
  render();
  try {
    await verifyKeyword(keyword);
    localStorage.setItem(LS.keyword, keyword);
    state.modal = null;
    state.notice = '合言葉を確認しました。生成機能が利用できます。';
    state.error = null;
  } catch (e) {
    state.keywordError = e.code === 'UNAUTHORIZED' ? '合言葉が正しくありません' : e.message;
    state.modal = from === 'settings' ? 'settings' : 'keyword';
  }
  state.busyKeyword = false;
  render();
}

/* ---------- export / import ---------- */

function exportData() {
  const data = { sets: getSets(), progress: getProgress(), customThemes: getCustomThemes() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'essay-trainer-data.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data.sets)) {
        const sets = getSets();
        for (const s of data.sets) {
          if (s && s.id && !sets.some(x => x.id === s.id)) sets.push(s);
        }
        saveSetsList(sets);
      }
      if (data.progress) {
        saveProgress(Object.assign(getProgress(), data.progress));
      }
      if (Array.isArray(data.customThemes)) {
        const custom = getCustomThemes();
        const topics = PRESET_THEMES.concat(custom).map(t => t.topic);
        for (const t of data.customThemes) {
          if (t && t.topic && !topics.includes(t.topic)) custom.push(t);
        }
        saveCustomThemes(custom);
      }
      state.notice = 'インポートが完了しました';
      state.error = null;
    } catch (e) {
      state.error = 'インポートに失敗しました：' + e.message;
    }
    render();
  };
  reader.readAsText(file);
}

/* ---------- event handling ---------- */

$app.addEventListener('click', (ev) => {
  const stop = ev.target.closest('[data-stop]');
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  // モーダル内部のクリックがオーバーレイの close-modal に化けないようにする
  if (stop && el.dataset.action === 'close-modal' && !stop.contains(el)) return;
  const a = el.dataset.action;

  if (a === 'open-settings') { state.modal = 'settings'; state.keywordError = null; render(); }
  else if (a === 'close-modal') { state.modal = null; state.keywordError = null; render(); }
  else if (a === 'save-keyword') { doSaveKeyword(el.dataset.from); }
  else if (a === 'skip-keyword') { state.modal = null; state.keywordError = null; render(); }
  else if (a === 'dismiss-error') { state.error = null; render(); }
  else if (a === 'dismiss-notice') { state.notice = null; render(); }
  else if (a === 'pick-theme') {
    const themes = PRESET_THEMES.concat(getCustomThemes());
    state.pendingTheme = themes[Number(el.dataset.idx)];
    state.modal = 'stance';
    render();
  }
  else if (a === 'choose-stance') {
    if (!localStorage.getItem(LS.keyword)) {
      state.modal = 'keyword';
      state.keywordError = 'エッセイ生成には合言葉の入力が必要です';
      render();
      return;
    }
    state.pendingStance = el.dataset.stance;
    startBrainstorm();
  }
  else if (a === 'bs-hint') {
    const hints = document.getElementById('bsHints');
    if (hints) hints.hidden = !hints.hidden;
  }
  else if (a === 'bs-generate') {
    const points = collectBrainstormPoints();
    stopBsTimer();
    doGenerateEssay(state.pendingTheme, state.pendingStance, points);
  }
  else if (a === 'bs-skip') {
    stopBsTimer();
    doGenerateEssay(state.pendingTheme, state.pendingStance, []);
  }
  else if (a === 'gen-themes') { doGenerateThemes(); }
  else if (a === 'open-set') {
    state.setId = el.dataset.id;
    state.showJa = {};
    state.view = 'study';
    render();
  }
  else if (a === 'delete-set') {
    const set = findSet(el.dataset.id);
    if (set && confirm(`「${set.topic}」を削除しますか？`)) {
      saveSetsList(getSets().filter(s => s.id !== el.dataset.id));
      const progress = getProgress();
      delete progress[el.dataset.id];
      saveProgress(progress);
      render();
    }
  }
  else if (a === 'go-home') { stopBsTimer(); state.view = 'home'; render(); }
  else if (a === 'toggle-ja') {
    const bi = Number(el.dataset.body);
    state.showJa[bi] = !state.showJa[bi];
    render();
  }
  else if (a === 'start-ex') { startExercise(el.dataset.id, Number(el.dataset.body)); }
  else if (a === 'chip') { tapChip(Number(el.dataset.idx)); }
  else if (a === 'hint') { useHint(); }
  else if (a === 'ex-quit') {
    state.setId = state.ex ? state.ex.setId : state.setId;
    state.ex = null;
    state.view = 'study';
    render();
  }
  else if (a === 'ex-retry') { startExercise(state.ex.setId, state.ex.bodyIdx); }
  else if (a === 'ex-next-body') { startExercise(state.ex.setId, state.ex.bodyIdx + 1); }
  else if (a === 'export-data') { exportData(); }
  else if (a === 'import-data') { document.getElementById('importFile').click(); }
});

$app.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.id === 'inpKeyword') {
    doSaveKeyword(state.modal === 'settings' ? 'settings' : 'welcome');
  }
});

document.getElementById('importFile').addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  if (file) importData(file);
  ev.target.value = '';
});

/* ---------- init ---------- */

seedPresets();
if (!localStorage.getItem(LS.keyword)) state.modal = 'keyword';
render();
