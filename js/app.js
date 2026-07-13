/* 英検1級 Essay Trainer — メインアプリ */

const LS = {
  keyword: 'et.keyword',
  sets: 'et.sets',
  progress: 'et.progress',
  themes: 'et.customThemes',
  hiddenThemes: 'et.hiddenThemes', // 非表示にしたプリセットテーマの topic 一覧
  seeded: 'et.seeded.v5', // サンプル内容を更新したらバージョンを上げて再シードする
  dirty: 'et.cloudDirty', // クラウド未送信の変更がある印
  theme: 'et.theme', // auto | light | dark
};

/* テーマ（配色）を <html data-theme> に適用する */
function applyTheme() {
  const t = localStorage.getItem(LS.theme) || 'auto';
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

let state = {
  view: 'home',        // home | brainstorm | study | loading
  modal: null,         // settings | stance | keyword | null
  keywordError: null,
  busyKeyword: false,
  pendingTheme: null,
  pendingStance: null,
  bsMode: 'generate', // generate（新規生成前）| practice（既存エッセイへの反復練習）
  bsSetId: null,
  bsTimerId: null,
  themeAddError: null,
  themeDraft: { en: '', ja: '', cat: null },
  loadingText: '',
  setId: null,
  showJa: {},
  error: null,
  notice: null,
  busyThemes: false,
  evaluatingSetId: null, // 採点をバックグラウンドで実行中のセットID
  bodyRewrite: null,     // {setId, point, bodyIdx, result, error, busy}
  chatSetId: null,
  chatDraft: '',
  chatBusy: false,
  chatError: null,
};

const $app = document.getElementById('app');

/* ---------- utilities ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* テンプレート定型表現の検出用正規表現（1つの捕捉グループを持つので split で偶数=自由部/奇数=定型部になる） */
const TPL_RE = new RegExp('(' + TEMPLATE_PHRASES.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');

/* 1文をHTMLへ：テンプレ定型表現は通常色、それ以外（生成された内容）は .free で色を変える */
function renderSentence(s) {
  return String(s).split(TPL_RE).map((seg, i) =>
    i % 2 ? esc(seg) : (seg ? `<span class="free">${esc(seg)}</span>` : '')
  ).join('');
}

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
}

/* ---------- storage ---------- */

function getSets() { return readJSON(LS.sets, []); }
function saveSetsList(sets) { localStorage.setItem(LS.sets, JSON.stringify(sets)); cloudMarkDirty(); }
function getProgress() { return readJSON(LS.progress, {}); }
function saveProgress(p) { localStorage.setItem(LS.progress, JSON.stringify(p)); cloudMarkDirty(); }
function getCustomThemes() { return readJSON(LS.themes, []); }
function saveCustomThemes(t) { localStorage.setItem(LS.themes, JSON.stringify(t)); cloudMarkDirty(); }
function getHiddenThemes() { return readJSON(LS.hiddenThemes, []); }
function saveHiddenThemes(t) { localStorage.setItem(LS.hiddenThemes, JSON.stringify(t)); cloudMarkDirty(); }

/* ---------- クラウド同期（Vercel Blob）----------
   Blob を正、localStorage をキャッシュ兼オフライン用とする。
   変更は dirty フラグ＋デバウンスで自動アップロードし、起動時にクラウドから取得する。 */

const CLOUD = { enabled: null, syncing: false, error: null, lastSync: 0, timer: null };

function cloudPayload() {
  return {
    sets: getSets(),
    progress: getProgress(),
    customThemes: getCustomThemes(),
    hiddenThemes: getHiddenThemes(),
    savedAt: Date.now(),
  };
}

async function cloudCall(op, data, opts) {
  const keyword = localStorage.getItem(LS.keyword) || '';
  let res;
  try {
    res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, op, data }),
      keepalive: !!(opts && opts.keepalive),
    });
  } catch (e) {
    throw new Error('サーバーに接続できません');
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 501) { const e = new Error('Blob 未設定'); e.code = 'NOT_CONFIGURED'; throw e; }
  if (res.status === 401) { const e = new Error('合言葉が不一致'); e.code = 'UNAUTHORIZED'; throw e; }
  if (!res.ok) throw new Error(body.error || `同期エラー (${res.status})`);
  return body;
}

function cloudMarkDirty() {
  if (CLOUD.enabled === false) return; // Blob 未設定環境ではローカルのみで運用
  localStorage.setItem(LS.dirty, '1');
  if (CLOUD.timer) clearTimeout(CLOUD.timer);
  CLOUD.timer = setTimeout(() => cloudFlush(), 2500);
}

async function cloudFlush(opts) {
  if (CLOUD.enabled === false) return;
  if (!localStorage.getItem(LS.keyword) || !localStorage.getItem(LS.dirty)) return;
  CLOUD.syncing = true;
  updateCloudBadge();
  try {
    await cloudCall('save', cloudPayload(), opts);
    localStorage.removeItem(LS.dirty);
    CLOUD.enabled = true;
    CLOUD.error = null;
    CLOUD.lastSync = Date.now();
  } catch (e) {
    if (e.code === 'NOT_CONFIGURED') CLOUD.enabled = false;
    else if (e.code !== 'UNAUTHORIZED') CLOUD.error = e.message;
  }
  CLOUD.syncing = false;
  updateCloudBadge();
}

/* クラウドのデータをローカルに反映（dirty を立てないよう直接書き込む） */
function applyCloudData(d) {
  if (Array.isArray(d.sets)) localStorage.setItem(LS.sets, JSON.stringify(migrateSets(d.sets)));
  if (d.progress && typeof d.progress === 'object') localStorage.setItem(LS.progress, JSON.stringify(d.progress));
  if (Array.isArray(d.customThemes)) localStorage.setItem(LS.themes, JSON.stringify(d.customThemes));
  if (Array.isArray(d.hiddenThemes)) localStorage.setItem(LS.hiddenThemes, JSON.stringify(d.hiddenThemes));
  localStorage.setItem(LS.seeded, '1');
}

async function cloudInit() {
  if (!localStorage.getItem(LS.keyword)) return; // 合言葉入力後に呼び直される
  CLOUD.syncing = true;
  updateCloudBadge();
  try {
    if (localStorage.getItem(LS.dirty)) {
      // 未送信のローカル変更が残っている場合はローカルを優先してアップロード
      CLOUD.syncing = false;
      await cloudFlush();
      return;
    }
    const resp = await cloudCall('load');
    CLOUD.enabled = true;
    CLOUD.error = null;
    CLOUD.lastSync = Date.now();
    if (resp.data) {
      applyCloudData(resp.data);
      render();
    } else {
      // クラウドが空：手元のデータを初回アップロード
      localStorage.setItem(LS.dirty, '1');
      CLOUD.syncing = false;
      await cloudFlush();
      return;
    }
  } catch (e) {
    if (e.code === 'NOT_CONFIGURED') CLOUD.enabled = false;
    else if (e.code !== 'UNAUTHORIZED') CLOUD.error = e.message;
  }
  CLOUD.syncing = false;
  updateCloudBadge();
}

function cloudBadgeHtml() {
  return `<span id="cloudBadge" class="cloud-badge">${cloudBadgeText()}</span>`;
}

function cloudBadgeText() {
  if (CLOUD.syncing) return '☁ 同期中…';
  if (CLOUD.error) return '⚠ 同期エラー';
  if (CLOUD.enabled === false) return '💾 ローカル保存';
  if (CLOUD.enabled === true) return '☁ 同期済み';
  return '';
}

/* 再レンダリングせずバッジだけ更新する（練習中の画面を乱さないため） */
function updateCloudBadge() {
  const el = document.getElementById('cloudBadge');
  if (el) el.textContent = cloudBadgeText();
}

/* 画面に表示するテーマ一覧（非表示プリセットを除外し、自作テーマを合流） */
function visibleThemes() {
  const hidden = getHiddenThemes();
  return PRESET_THEMES.filter(t => !hidden.includes(t.topic)).concat(getCustomThemes());
}

/* 旧スロット形式（reason/principle/…）で保存された Body を、新しい4文形式へ変換するための
   固定テンプレート。生成済みの旧エッセイを読めるまま移行するためだけに使う。 */
const LEGACY_TEMPLATES = [
  ['First and foremost, {reason} is a crucial factor.', 'This is because {principle}.', 'In essence, when {condition}, it leads to {result}.', 'Therefore, {keyConcept} plays a key role in {conclusion}.'],
  ['Another key point is {reason}.', 'This is largely because {principle}.', 'Put simply, whenever {condition}, it results in {result}.', 'Hence, {keyConcept} is essential for {conclusion}.'],
  ['A further point is {reason}.', 'The primary reason is that {principle}.', 'In other words, if {condition}, this leads to {result}.', 'Accordingly, {keyConcept} is vital for {conclusion}.'],
];

/* 1つの Body を新形式（argument / sentences / ja）に正規化する。既に新形式ならそのまま返す。 */
function migrateBody(body, bodyIdx) {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body.sentences)) return body; // 既に新形式
  if (body.slots) {
    const tpl = LEGACY_TEMPLATES[bodyIdx] || LEGACY_TEMPLATES[0];
    const sentences = tpl.map(t => t.replace(/\{(\w+)\}/g, (m, k) => String(body.slots[k] || '').trim()));
    return { argument: String(body.slots.reason || '').trim(), sentences, ja: body.ja || '' };
  }
  return { argument: body.argument || '', sentences: [], ja: body.ja || '' };
}

/* sets 配列内の全 Body を新形式へ変換した新しい配列を返す（変換不要ならそのまま） */
function migrateSets(sets) {
  if (!Array.isArray(sets)) return sets;
  return sets.map(s => {
    if (!s || !Array.isArray(s.bodies) || !s.bodies.some(b => b && !Array.isArray(b.sentences))) return s;
    return Object.assign({}, s, { bodies: s.bodies.map((b, i) => migrateBody(b, i)) });
  });
}

function seedPresets() {
  const legacy = migrateSets(getSets());
  localStorage.setItem(LS.sets, JSON.stringify(legacy)); // 旧形式の生成済みエッセイを移行
  if (localStorage.getItem(LS.seeded)) return;
  // 旧バージョンのサンプルは新しい内容に置き換える（生成済みエッセイは残す）
  // 注意：dirty を立てない（新端末でクラウドデータをシードで上書きしないため）
  const sets = PRESET_SETS.concat(getSets().filter(s => s.source !== 'preset'));
  localStorage.setItem(LS.sets, JSON.stringify(sets));
  localStorage.setItem(LS.seeded, '1');
}

function findSet(id) { return getSets().find(s => s.id === id); }

/* ---------- rendering ---------- */

function render() {
  let html = '';
  if (state.view === 'home') html = viewHome();
  else if (state.view === 'brainstorm') html = viewBrainstorm();
  else if (state.view === 'study') html = viewStudy();
  else if (state.view === 'loading') html = viewLoading();
  if (state.modal === 'settings') html += modalSettings();
  if (state.modal === 'stance') html += modalStance();
  if (state.modal === 'keyword') html += modalKeyword();
  if (state.modal === 'themeAdd') html += modalThemeAdd();
  if (state.modal === 'bodyRewrite') html += modalBodyRewrite();
  if (state.modal === 'chat') html += modalChat();
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

  const setItems = sets.map(s => {
    const ev = s.evaluation;
    const scoreBadge = ev && typeof ev.average === 'number'
      ? `<span class="eval-avg ${ev.average >= 8 ? 'pass' : 'warn'}" title="Gemini 採点の平均">平均 ${ev.average}</span>`
      : '<span class="cloud-badge">未採点</span>';
    return `<div class="card set-card">
      <div class="set-info" data-action="open-set" data-id="${esc(s.id)}">
        <div class="set-topic">${esc(s.topic)}</div>
        <div class="set-sub">${esc(s.topicJa || '')} ${stanceBadge(s.stance)} ${s.source === 'gemini' ? '<span class="badge src">Gemini</span>' : '<span class="badge src">サンプル</span>'}</div>
      </div>
      <div class="set-side">
        ${scoreBadge}
        <button class="btn small ghost" data-action="delete-set" data-id="${esc(s.id)}">削除</button>
      </div>
    </div>`;
  }).join('') || '<p class="empty">まだエッセイがありません。下のテーマから作成してください。</p>';

  const themes = visibleThemes();
  const cats = [...new Set(themes.map(t => t.category))];
  const themeHtml = cats.map(cat => {
    const items = themes.filter(t => t.category === cat).map(t => {
      const idx = themes.indexOf(t);
      return `<div class="theme-item">
        <button class="theme-pick" data-action="pick-theme" data-idx="${idx}">
          <span class="theme-en">${esc(t.topic)}</span>
          <span class="theme-ja">${esc(t.topicJa || '')}</span>
        </button>
        <button class="theme-del" data-action="delete-theme" data-idx="${idx}" title="このテーマを削除">×</button>
      </div>`;
    }).join('');
    return `<div class="theme-group"><h3>${esc(cat)}</h3>${items}</div>`;
  }).join('');
  const hiddenCount = getHiddenThemes().length;

  return `<header class="topbar">
      <h1>英検1級 Essay Trainer</h1>
      <div class="topbar-right">
        ${cloudBadgeHtml()}
        <button class="btn ghost" data-action="open-settings">⚙ 設定</button>
      </div>
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
      <button class="btn wide ghost" data-action="open-add-theme">＋ テーマを自分で追加</button>
      <button class="btn wide" data-action="gen-themes" ${state.busyThemes ? 'disabled' : ''}>
        ${state.busyThemes ? '生成中…' : '🤖 Gemini でテーマ案を追加生成'}
      </button>
      ${hiddenCount ? `<button class="btn small ghost wide" data-action="restore-themes">非表示にしたプリセットテーマを復元（${hiddenCount}件）</button>` : ''}
    </section>`;
}

/* ---------- brainstorm view（生成前の論点出しトレーニング） ---------- */

const BS_SECONDS = 90;

function viewBrainstorm() {
  const practice = state.bsMode === 'practice';
  const set = practice ? findSet(state.bsSetId) : null;
  if (practice && !set) { state.view = 'home'; return viewHome(); }
  const topic = practice ? set.topic : state.pendingTheme.topic;
  const topicJa = practice ? set.topicJa : state.pendingTheme.topicJa;
  const stance = practice ? set.stance : state.pendingStance;
  return `<header class="topbar">
      <button class="btn ghost" data-action="bs-cancel">← 中止</button>
      <span class="topbar-title">論点出しトレーニング</span>
    </header>
    ${banner()}
    <div class="topic-head">
      <h2>${esc(topic)}</h2>
      <p class="set-sub">${esc(topicJa || '')} ${stanceBadge(stance)}</p>
    </div>
    <div class="card">
      <div class="body-head">
        <span class="slot-label">90秒で論点を3つ（<strong>A does B</strong> の形で考える）</span>
        <span id="bsTimer" class="bs-timer">1:30</span>
      </div>
      <input type="text" class="bs-input" id="bsPoint0" placeholder="論点① 例：AIが仕事を奪う">
      <input type="text" class="bs-input" id="bsPoint1" placeholder="論点②">
      <input type="text" class="bs-input" id="bsPoint2" placeholder="論点③">
      <button class="btn small ghost" data-action="bs-hint">💡 観点の作り方のコツ</button>
      <div id="bsHints" class="bs-hints" hidden>
        <p><strong>① 中立に書く</strong>：賛成・反対の評価を含めず「何が変わるか」だけを書く<br>
          <span class="ex-good">○ 労働力構造が再編される</span>／<span class="ex-bad">× 批判的思考力が低下する</span></p>
        <p><strong>② 構造で考える</strong>：「誰が得するか」ではなく、どの構造・仕組みが変わるかを探す<br>
          教育構造／労働力構造／情報流通／意思決定／社会制度／評価制度／市場構造／技術開発／資源配分</p>
        <p><strong>③ 一段抽象化する</strong>：具体的な現象ではなく、一段上の概念で表現する<br>
          「AIで宿題をする」→「学習プロセスが変化しうる」</p>
      </div>
      <div class="row">
        <button class="btn" data-action="bs-generate">${practice ? '判定する（Gemini で採点）' : '答え合わせ（Gemini で生成）'}</button>
        <button class="btn ghost" data-action="bs-skip">${practice ? 'キャンセル' : 'スキップして生成'}</button>
      </div>
      <p class="hint-text">入力した論点は Gemini が有効性を判定し、${practice ? 'このエッセイの観点と並べて比較表示されます' : '生成された論点と並べて比較表示されます'}。日本語でもOKです。</p>
    </div>`;
}

/* 生成済みエッセイに対する論点だしの反復練習を開始する（本文は変更しない） */
function startBrainstormPractice(setId) {
  state.bsMode = 'practice';
  state.bsSetId = setId;
  state.error = null;
  startBrainstorm();
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

  const bodiesHtml = set.bodies.map((body, bi) => {
    const role = BODY_ROLES[bi] || BODY_ROLES[0];
    const sentences = Array.isArray(body.sentences) ? body.sentences : [];
    const linesHtml = sentences.map((s, si) =>
      `<p class="study-line"><span class="fn-tag">${esc(role.functions[si] || '')}</span>${renderSentence(s)}</p>`
    ).join('');
    const wc = bodyText(body).split(/\s+/).filter(Boolean).length;
    const jaShown = state.showJa[bi];
    return `<div class="card body-card">
      <div class="body-head">
        <h3>${role.name} <span class="badge src">${esc(role.type)}</span>${body.original ? ' <span class="badge src">✍️ 書き換え済み</span>' : ''}</h3>
        <span class="stat">${wc} 語</span>
      </div>
      ${linesHtml}
      ${jaShown && body.ja ? `<p class="ja-text">${esc(body.ja)}</p>` : ''}
      <div class="row">
        ${body.ja ? `<button class="btn small ghost" data-action="toggle-ja" data-body="${bi}">${jaShown ? '和訳を隠す' : '和訳を表示'}</button>` : ''}
        ${body.original ? `<button class="btn small ghost" data-action="undo-body" data-body="${bi}">元の模範解答に戻す</button>` : ''}
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
      <div class="row">
        ${set.source === 'gemini' ? `<button class="btn small ghost" data-action="regenerate-essay" data-id="${esc(set.id)}">🔄 別パターンで再生成</button>` : ''}
        <button class="btn small ghost" data-action="open-chat" data-id="${esc(set.id)}">💬 Geminiに質問する</button>
      </div>
    </div>
    <p class="hint-text">3つの Body は役割が異なります（<strong>因果必然</strong>／<strong>実証</strong>／<strong>譲歩反駁</strong>）。文頭のラベルは各文の機能、<span class="free">色付きの部分</span>がテーマに応じて変わる内容で、黒字はテンプレートの定型表現です。</p>
    ${compareCard(set)}
    ${evalSection(set)}
    ${bodiesHtml}`;
}

function compareCard(set) {
  const practiceBtn = `<button class="btn small ghost" data-action="bs-practice" data-id="${esc(set.id)}">🧠 論点だしトレーニングをもう一度</button>`;
  if (!set.userPoints || !set.userPoints.length) {
    return `<div class="card compare-card">
      <h3>🧠 論点だしトレーニング</h3>
      <p class="hint-text">このテーマで自分なりの論点を3つ考える練習ができます。</p>
      ${practiceBtn}
    </div>`;
  }
  const badge = v => v === 'valid' ? '<span class="verdict valid">✅ 有効</span>'
    : v === 'invalid' ? '<span class="verdict invalid">✖ 要注意</span>'
    : '<span class="verdict weak">△ 弱い</span>';
  const reviews = set.pointsReview || [];
  const mine = set.userPoints.map((pt, i) => {
    const r = reviews[i];
    const canReflect = r && r.verdict !== 'invalid';
    return `<li>${esc(pt)} ${r ? badge(r.verdict) : ''}
      ${r && r.comment ? `<div class="verdict-comment">${esc(r.comment)}</div>` : ''}
      ${canReflect ? `<button class="btn small ghost" data-action="open-rewrite-body" data-set="${esc(set.id)}" data-point="${esc(pt)}">→ Bodyに反映</button>` : ''}</li>`;
  }).join('');
  const gemini = set.bodies.map(b => `<li>${esc(b.argument || '')}</li>`).join('');
  return `<div class="card compare-card">
    <h3>🧠 論点の答え合わせ</h3>
    <div class="compare-cols">
      <div><h4>あなたの論点</h4><ol>${mine}</ol></div>
      <div><h4>Gemini の論点</h4><ol>${gemini}</ol></div>
    </div>
    <div class="row">${practiceBtn}</div>
  </div>`;
}

/* 採点カード：採点済み／採点中／未採点（採点ボタン表示）の3状態 */
function evalSection(set) {
  if (set.evaluation) return evalCard(set);
  if (state.evaluatingSetId === set.id) {
    return `<div class="card eval-card">
      <div class="body-head"><h3>🧪 Gemini 採点</h3><span class="stat">採点中…</span></div>
    </div>`;
  }
  return `<div class="card eval-card">
    <div class="body-head"><h3>🧪 Gemini 採点</h3></div>
    <button class="btn small ghost" data-action="eval-now" data-id="${esc(set.id)}">この構成を採点する</button>
  </div>`;
}

function evalCard(set) {
  const ev = set.evaluation;
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
    ${!pass ? '<p class="hint-text">スコアが低いため、再生成をおすすめします。</p>' : ''}
  </div>`;
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
      <label>テーマ（配色）</label>
      <div class="seg">
        ${[['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']].map(([v, lbl]) => {
          const cur = localStorage.getItem(LS.theme) || 'auto';
          return `<button class="seg-btn${cur === v ? ' active' : ''}" data-action="set-theme" data-theme="${v}">${lbl}</button>`;
        }).join('')}
      </div>
      <p class="hint-text">「自動」は端末の設定（OS のダークモード）に追従します。</p>
      <hr>
      <label>クラウド同期（Vercel Blob）</label>
      <p class="hint-text">状態：${cloudBadgeText() || '未確認'}${CLOUD.lastSync ? `（最終同期 ${new Date(CLOUD.lastSync).toLocaleTimeString()}）` : ''}${CLOUD.error ? ` — ${esc(CLOUD.error)}` : ''}${CLOUD.enabled === false ? ' — Vercel で Blob ストアを接続すると端末間で自動同期されます' : ''}</p>
      <div class="row">
        <button class="btn small ghost" data-action="cloud-sync-now">今すぐ同期</button>
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

/* ---------- 論点をBodyに反映（丸ごと書き直し） ---------- */

function modalBodyRewrite() {
  const br = state.bodyRewrite;
  const set = findSet(br.setId);
  if (!set) return '';
  let inner;
  if (br.result) {
    inner = `<p class="study-line">${br.result.sentences.map(renderSentence).join(' ')}</p>
      <p class="ja-text">${esc(br.result.ja)}</p>
      <div class="row">
        <button class="btn small" data-action="apply-rewrite-body">この内容で Body ${br.bodyIdx + 1} を置き換える</button>
        <button class="btn small ghost" data-action="pick-rewrite-body" data-body="${br.bodyIdx}">もう一度書き直す</button>
        <button class="btn small ghost" data-action="close-modal">キャンセル</button>
      </div>`;
  } else if (br.bodyIdx !== null) {
    inner = br.busy
      ? `<p class="hint-text">Gemini が Body ${br.bodyIdx + 1} を書き直し中…</p>`
      : `${br.error ? `<p class="field-error">${esc(br.error)}</p>` : ''}
        <div class="row">
          <button class="btn small ghost" data-action="pick-rewrite-body" data-body="${br.bodyIdx}">もう一度試す</button>
          <button class="btn small ghost" data-action="close-modal">キャンセル</button>
        </div>`;
  } else {
    inner = `<p class="hint-text">この論点を使って書き換える Body を選んでください。</p>
      <div class="row">
        ${[0, 1, 2].map(i => `<button class="btn small" data-action="pick-rewrite-body" data-body="${i}">Body ${i + 1}</button>`).join('')}
      </div>
      <button class="btn ghost wide" data-action="close-modal">キャンセル</button>`;
  }
  return `<div class="overlay" data-action="close-modal">
    <div class="modal" data-stop>
      <h3>🔁 論点をBodyに反映</h3>
      <p class="hint-text slot-edit-context">「${esc(br.point)}」</p>
      ${inner}
    </div>
  </div>`;
}

async function doRewriteBody(bodyIdx) {
  const br = state.bodyRewrite;
  if (!br) return;
  br.bodyIdx = bodyIdx;
  br.result = null;
  br.error = null;
  if (!localStorage.getItem(LS.keyword)) {
    state.modal = 'keyword';
    state.keywordError = '書き換えには合言葉の入力が必要です';
    render();
    return;
  }
  br.busy = true;
  render();
  try {
    const set = findSet(br.setId);
    br.result = await rewriteBodyWithPoint(set, bodyIdx, br.point);
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') {
      localStorage.removeItem(LS.keyword);
      state.modal = 'keyword';
      state.keywordError = '合言葉が正しくありません。もう一度入力してください。';
      state.bodyRewrite = null;
      render();
      return;
    }
    br.error = e.message;
  }
  br.busy = false;
  render();
}

function applyBodyRewrite() {
  const br = state.bodyRewrite;
  if (!br || !br.result) return;
  const sets = getSets();
  const set = sets.find(s => s.id === br.setId);
  if (!set) return;
  const body = set.bodies[br.bodyIdx];
  // 書き換え前の Body 全体をスナップショット（元に戻す用）。二重書き換えでも初回の元文を保持する。
  if (!body.original) body.original = { argument: body.argument, sentences: body.sentences, ja: body.ja || '' };
  body.argument = br.result.argument;
  body.sentences = br.result.sentences;
  body.ja = br.result.ja;
  set.evaluation = null; // 内容が変わったため採点をやり直す
  saveSetsList(sets);
  state.modal = null;
  state.bodyRewrite = null;
  state.notice = `Body ${br.bodyIdx + 1} をあなたの論点で書き換えました`;
  render();
}

/* ---------- 採点・論点判定についてGeminiと会話する ---------- */

function modalChat() {
  const set = findSet(state.chatSetId);
  if (!set) return '';
  const history = set.chat || [];
  const messages = history.length
    ? history.map(m => `<div class="chat-msg ${m.role}">${esc(m.text)}</div>`).join('')
    : '<p class="hint-text">この構成やスコア、論点について、何でも聞いてください。</p>';
  return `<div class="overlay" data-action="close-modal">
    <div class="modal chat-modal" data-stop>
      <h3>💬 Geminiに質問する</h3>
      <div class="chat-history" id="chatHistory">${messages}</div>
      ${state.chatBusy ? '<p class="hint-text">Gemini が考え中…</p>' : ''}
      ${state.chatError ? `<p class="field-error">${esc(state.chatError)}</p>` : ''}
      <input type="text" id="chatInput" value="${esc(state.chatDraft)}" placeholder="例：なぜ内容のスコアが低いのですか？" ${state.chatBusy ? 'disabled' : ''}>
      <div class="row">
        <button class="btn small" data-action="chat-send" ${state.chatBusy ? 'disabled' : ''}>送信</button>
        ${history.length ? `<button class="btn small ghost" data-action="chat-reset" data-id="${esc(set.id)}">🗑 会話をリセット</button>` : ''}
        <button class="btn small ghost" data-action="close-modal">閉じる</button>
      </div>
    </div>
  </div>`;
}

function scrollChatToBottom() {
  const el = document.getElementById('chatHistory');
  if (el) el.scrollTop = el.scrollHeight;
}

async function doChatSend() {
  const input = document.getElementById('chatInput');
  const message = (input ? input.value : state.chatDraft).trim();
  if (!message) return;
  if (!localStorage.getItem(LS.keyword)) {
    state.modal = 'keyword';
    state.keywordError = 'チャットには合言葉の入力が必要です';
    render();
    return;
  }
  const setId = state.chatSetId;
  const sets = getSets();
  const set = sets.find(s => s.id === setId);
  if (!set) return;
  set.chat = set.chat || [];
  const historyForApi = set.chat.map(m => ({ role: m.role, text: m.text }));
  set.chat.push({ role: 'user', text: message });
  saveSetsList(sets);
  state.chatDraft = '';
  state.chatBusy = true;
  state.chatError = null;
  render();
  scrollChatToBottom();
  try {
    const reply = await chatWithGemini(set, historyForApi, message);
    const sets2 = getSets();
    const s2 = sets2.find(s => s.id === setId);
    if (s2) {
      s2.chat = s2.chat || [];
      s2.chat.push({ role: 'model', text: reply });
      saveSetsList(sets2);
    }
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') {
      localStorage.removeItem(LS.keyword);
      state.modal = 'keyword';
      state.keywordError = '合言葉が正しくありません。もう一度入力してください。';
      state.chatBusy = false;
      render();
      return;
    }
    state.chatError = '送信に失敗しました：' + e.message;
  }
  state.chatBusy = false;
  render();
  scrollChatToBottom();
}

function modalThemeAdd() {
  return `<div class="overlay" data-action="close-modal">
    <div class="modal" data-stop>
      <h3>＋ テーマを自分で追加</h3>
      <label>英語のテーマ（必須）</label>
      <input type="text" id="inpThemeEn" value="${esc(state.themeDraft.en)}" placeholder="例：Should Japan introduce a four-day workweek?">
      <label>日本語訳（任意）</label>
      <input type="text" id="inpThemeJa" value="${esc(state.themeDraft.ja)}" placeholder="例：日本は週休3日制を導入すべきか">
      <label>カテゴリ</label>
      <select id="inpThemeCat">
        ${CATEGORIES.map(c => `<option value="${esc(c)}"${c === state.themeDraft.cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      ${state.themeAddError ? `<p class="field-error">${esc(state.themeAddError)}</p>` : ''}
      <div class="row">
        <button class="btn" data-action="save-theme">追加する</button>
        <button class="btn ghost" data-action="close-modal">キャンセル</button>
      </div>
    </div>
  </div>`;
}

function doSaveTheme() {
  const en = (document.getElementById('inpThemeEn') || {}).value?.trim() || '';
  const ja = (document.getElementById('inpThemeJa') || {}).value?.trim() || '';
  const cat = (document.getElementById('inpThemeCat') || {}).value || CATEGORIES[0];
  state.themeDraft = { en, ja, cat };
  if (!en) {
    state.themeAddError = '英語のテーマを入力してください';
    render();
    return;
  }
  const exists = PRESET_THEMES.concat(getCustomThemes())
    .some(t => t.topic.toLowerCase() === en.toLowerCase());
  if (exists) {
    state.themeAddError = '同じテーマが既に存在します';
    render();
    return;
  }
  const custom = getCustomThemes();
  custom.push({ topic: en, topicJa: ja, category: cat });
  saveCustomThemes(custom);
  state.modal = null;
  state.themeAddError = null;
  state.themeDraft = { en: '', ja: '', cat: CATEGORIES[0] };
  state.notice = 'テーマを追加しました';
  render();
}

function deleteTheme(idx) {
  const theme = visibleThemes()[idx];
  if (!theme || !confirm(`テーマ「${theme.topic}」を削除しますか？`)) return;
  const custom = getCustomThemes();
  const ci = custom.findIndex(t => t.topic === theme.topic);
  if (ci >= 0) {
    custom.splice(ci, 1);
    saveCustomThemes(custom);
  } else {
    // プリセットは削除できないため非表示リストに入れる（復元可能）
    const hidden = getHiddenThemes();
    if (!hidden.includes(theme.topic)) hidden.push(theme.topic);
    saveHiddenThemes(hidden);
  }
  render();
}

/* ---------- generation flows ---------- */

/* 採点を単独リクエストで実行する（生成とは非同期・別チェーン）。
   同時に1件までとし、完了時に学習画面を表示中ならその場で更新する。 */
async function runBackgroundEvaluation(setId) {
  if (state.evaluatingSetId) return;
  state.evaluatingSetId = setId;
  if (state.view === 'study' && state.setId === setId) render();
  try {
    const set = findSet(setId);
    if (set) {
      const evaluation = await evaluateEssaySet(set);
      const sets = getSets();
      const s2 = sets.find(s => s.id === setId);
      if (s2) { s2.evaluation = evaluation; saveSetsList(sets); }
    }
  } catch (e) {
    // 採点は付加機能のため、失敗時は静かに諦める（「採点する」ボタンから再試行できる）
  }
  state.evaluatingSetId = null;
  if (state.view === 'study' && state.setId === setId) render();
}

/* 同じテーマ・スタンス・論点で作り直す（現在の構成は削除して差し替える） */
function regenerateEssay(setId) {
  const set = findSet(setId);
  if (!set) return;
  if (!confirm('この構成を削除し、同じテーマ・立場で新しく作り直しますか？')) return;
  saveSetsList(getSets().filter(s => s.id !== setId));
  const progress = getProgress();
  delete progress[setId];
  saveProgress(progress);
  doGenerateEssay({ topic: set.topic, topicJa: set.topicJa }, set.stance, set.userPoints || []);
}

async function doGenerateEssay(theme, stance, userPoints) {
  if (!localStorage.getItem(LS.keyword)) {
    state.modal = 'keyword';
    state.keywordError = 'エッセイ生成には合言葉の入力が必要です';
    render();
    return;
  }
  state.modal = null;
  state.view = 'loading';
  state.loadingText = 'Gemini が例文を生成中…（論点の判定を含め、通常10〜20秒ほどです）';
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
    runBackgroundEvaluation(set.id); // 採点は別リクエストでバックグラウンド実行（生成をブロックしない）
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

/* 論点だしトレーニングの反復練習：エッセイ本文は変えず、最新の判定結果だけ上書き保存する */
async function doReviewPointsPractice(points) {
  const setId = state.bsSetId;
  if (!points.length) {
    state.view = 'study';
    state.setId = setId;
    state.error = '論点を1つ以上入力してください';
    render();
    return;
  }
  if (!localStorage.getItem(LS.keyword)) {
    state.modal = 'keyword';
    state.keywordError = '判定には合言葉の入力が必要です';
    render();
    return;
  }
  state.modal = null;
  state.view = 'loading';
  state.loadingText = 'Gemini が論点を判定中…';
  render();
  try {
    const set = findSet(setId);
    const result = await reviewPoints(set, points);
    const sets = getSets();
    const s2 = sets.find(s => s.id === setId);
    if (s2) {
      s2.userPoints = result.userPoints;
      s2.pointsReview = result.pointsReview;
      saveSetsList(sets);
    }
    state.error = null;
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') {
      localStorage.removeItem(LS.keyword);
      state.modal = 'keyword';
      state.keywordError = '合言葉が正しくありません。もう一度入力してください。';
    } else {
      state.error = '判定に失敗しました：' + e.message;
    }
  }
  state.view = 'study';
  state.setId = setId;
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
    cloudInit(); // 合言葉が確定したのでクラウドデータを取得
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
  else if (a === 'close-modal') {
    state.modal = null; state.keywordError = null;
    state.bodyRewrite = null; state.chatError = null;
    render();
  }
  else if (a === 'undo-body') {
    const bi = Number(el.dataset.body);
    const sets = getSets();
    const set = sets.find(s => s.id === state.setId);
    const body = set && set.bodies[bi];
    if (body && body.original && confirm('この Body を元の模範解答に戻しますか？')) {
      body.argument = body.original.argument;
      body.sentences = body.original.sentences;
      body.ja = body.original.ja;
      delete body.original;
      set.evaluation = null; // 内容が変わったため採点をやり直す
      saveSetsList(sets);
      state.notice = '元の模範解答に戻しました';
      render();
    }
  }
  else if (a === 'save-keyword') { doSaveKeyword(el.dataset.from); }
  else if (a === 'skip-keyword') { state.modal = null; state.keywordError = null; render(); }
  else if (a === 'dismiss-error') { state.error = null; render(); }
  else if (a === 'dismiss-notice') { state.notice = null; render(); }
  else if (a === 'pick-theme') {
    state.pendingTheme = visibleThemes()[Number(el.dataset.idx)];
    state.modal = 'stance';
    render();
  }
  else if (a === 'open-add-theme') {
    state.themeDraft = { en: '', ja: '', cat: CATEGORIES[0] };
    state.themeAddError = null;
    state.modal = 'themeAdd';
    render();
  }
  else if (a === 'save-theme') { doSaveTheme(); }
  else if (a === 'delete-theme') { deleteTheme(Number(el.dataset.idx)); }
  else if (a === 'restore-themes') {
    saveHiddenThemes([]);
    state.notice = '非表示にしていたプリセットテーマを復元しました';
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
    state.bsMode = 'generate';
    startBrainstorm();
  }
  else if (a === 'bs-hint') {
    const hints = document.getElementById('bsHints');
    if (hints) hints.hidden = !hints.hidden;
  }
  else if (a === 'bs-generate') {
    const points = collectBrainstormPoints();
    stopBsTimer();
    if (state.bsMode === 'practice') doReviewPointsPractice(points);
    else doGenerateEssay(state.pendingTheme, state.pendingStance, points);
  }
  else if (a === 'bs-skip') {
    stopBsTimer();
    if (state.bsMode === 'practice') { state.view = 'study'; state.setId = state.bsSetId; render(); }
    else doGenerateEssay(state.pendingTheme, state.pendingStance, []);
  }
  else if (a === 'bs-cancel') {
    stopBsTimer();
    if (state.bsMode === 'practice') { state.view = 'study'; state.setId = state.bsSetId; }
    else state.view = 'home';
    render();
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
      render();
    }
  }
  else if (a === 'go-home') { stopBsTimer(); state.view = 'home'; render(); }
  else if (a === 'toggle-ja') {
    const bi = Number(el.dataset.body);
    state.showJa[bi] = !state.showJa[bi];
    render();
  }
  else if (a === 'export-data') { exportData(); }
  else if (a === 'import-data') { document.getElementById('importFile').click(); }
  else if (a === 'set-theme') {
    localStorage.setItem(LS.theme, el.dataset.theme);
    applyTheme();
    render();
  }
  else if (a === 'cloud-sync-now') {
    localStorage.setItem(LS.dirty, '1');
    cloudFlush().then(() => { if (state.modal === 'settings') render(); });
  }
  else if (a === 'eval-now') { runBackgroundEvaluation(el.dataset.id); }
  else if (a === 'regenerate-essay') { regenerateEssay(el.dataset.id); }
  else if (a === 'bs-practice') { startBrainstormPractice(el.dataset.id); }
  else if (a === 'open-rewrite-body') {
    state.bodyRewrite = { setId: el.dataset.set, point: el.dataset.point, bodyIdx: null, result: null, error: null, busy: false };
    state.modal = 'bodyRewrite';
    render();
  }
  else if (a === 'pick-rewrite-body') { doRewriteBody(Number(el.dataset.body)); }
  else if (a === 'apply-rewrite-body') { applyBodyRewrite(); }
  else if (a === 'open-chat') {
    state.chatSetId = el.dataset.id;
    state.chatDraft = '';
    state.chatError = null;
    state.modal = 'chat';
    render();
  }
  else if (a === 'chat-send') { doChatSend(); }
  else if (a === 'chat-reset') {
    if (confirm('この会話履歴を削除しますか？')) {
      const sets = getSets();
      const set = sets.find(s => s.id === el.dataset.id);
      if (set) { set.chat = []; saveSetsList(sets); }
      render();
    }
  }
});

// タブを閉じる・切り替える際に未送信の変更を送っておく
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (CLOUD.timer) clearTimeout(CLOUD.timer);
    cloudFlush({ keepalive: true });
  }
});

$app.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.id === 'inpKeyword') {
    doSaveKeyword(state.modal === 'settings' ? 'settings' : 'welcome');
  }
  if (ev.key === 'Enter' && ev.target.id === 'chatInput') {
    doChatSend();
  }
});

// 再レンダリングで入力値が失われないよう、編集モーダルの入力を state に同期する
$app.addEventListener('input', (ev) => {
  if (ev.target.id === 'chatInput') state.chatDraft = ev.target.value;
});

document.getElementById('importFile').addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  if (file) importData(file);
  ev.target.value = '';
});

/* ---------- init ---------- */

applyTheme();
seedPresets();
if (!localStorage.getItem(LS.keyword)) state.modal = 'keyword';
render();
cloudInit();
