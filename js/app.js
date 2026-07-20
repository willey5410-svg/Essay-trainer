/* 英検1級 Essay Trainer — メインアプリ */

/* 機能スイッチ：観点だしドリルの公開可否。false にするとコードは残したまま
   全入口（ホームのドリル欄・履歴、エッセイからの導線）を隠して非公開にできる。 */
const DRILL_ENABLED = false;

const LS = {
  keyword: 'et.keyword',
  sets: 'et.sets',
  progress: 'et.progress',
  themes: 'et.customThemes',
  drills: 'et.drills', // 観点だしドリル（マトリクス走査）の記録
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
  view: 'home',        // home | study | drill | loading
  modal: null,         // settings | stance | keyword | drillCell | null
  drill: null,         // 観点だしドリルの進行状態（viewDrill 参照）
  cellDraft: null,     // {layer, domain, note, side} セル編集モーダルの下書き
  keywordError: null,
  busyKeyword: false,
  pendingTheme: null,
  pendingStance: null,
  themeAddError: null,
  themeDraft: { en: '', ja: '', cat: null },
  loadingText: '',
  setId: null,
  showJa: {},
  error: null,
  notice: null,
  busyThemes: false,
  evaluatingSetId: null, // 採点をバックグラウンドで実行中のセットID
  bodyEdit: null,        // {setId, bodyIdx, vals, error} 色付き部分だけの手直し
  bodyRewrite: null,     // {setId, bodyIdx, text, busy, error} 指定観点での書き直し
  switchingBody2: false, // Body 2 の型切り替え中フラグ
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

/* 1文をHTMLへ：テンプレ定型表現は通常色、それ以外（生成された内容）は .free で色を変える。
   ctx（{bi, si}）を渡すと、色付き部分をタップで編集できるようにする（スタディ画面用）。 */
function renderSentence(s, ctx) {
  return String(s).split(TPL_RE).map((seg, i) => {
    if (i % 2) return esc(seg); // 定型表現
    if (!seg.trim()) return seg ? esc(seg) : '';
    if (ctx) {
      return `<span class="free tap" data-action="open-body-edit" data-body="${ctx.bi}" data-focus="fe-${ctx.si}-${i}" title="タップして編集">${esc(seg)}</span>`;
    }
    return `<span class="free">${esc(seg)}</span>`;
  }).join('');
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
function getDrills() { return readJSON(LS.drills, []); }
function saveDrills(d) { localStorage.setItem(LS.drills, JSON.stringify(d.slice(0, 30))); cloudMarkDirty(); }
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
    drills: getDrills(),
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
  if (Array.isArray(d.drills)) localStorage.setItem(LS.drills, JSON.stringify(d.drills));
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
  else if (state.view === 'study') html = viewStudy();
  else if (state.view === 'drill') html = viewDrill();
  else if (state.view === 'loading') html = viewLoading();
  if (state.modal === 'settings') html += modalSettings();
  if (state.modal === 'stance') html += modalStance();
  if (state.modal === 'keyword') html += modalKeyword();
  if (state.modal === 'themeAdd') html += modalThemeAdd();
  if (state.modal === 'bodyEdit') html += modalBodyEdit();
  if (state.modal === 'bodyRewrite') html += modalBodyRewrite();
  if (state.modal === 'drillCell') html += modalDrillCell();
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
    ${DRILL_ENABLED ? `<section>
      <h2>🧠 観点だしドリル（マトリクス走査）</h2>
      <div class="card">
        <p class="hint-text">「増減リスト → 4層×7ドメイン走査 → 3基準フィルタ → 配役」を5分で回す反復練習です。立場は走査の結果から決めます。</p>
        <select id="drillThemeSel">${visibleThemes().map((t, i) => `<option value="${i}">${esc(t.topic)}</option>`).join('')}</select>
        <div class="row"><button class="btn" data-action="drill-start">▶ ドリルを開始</button></div>
      </div>
      ${drillHistoryHtml()}
    </section>` : ''}
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

/* ---------- study view ---------- */

function viewStudy() {
  const set = findSet(state.setId);
  if (!set) { state.view = 'home'; return viewHome(); }

  const bodiesHtml = set.bodies.map((body, bi) => {
    const role = roleForBody(bi, body);
    const sentences = Array.isArray(body.sentences) ? body.sentences : [];
    const linesHtml = sentences.map((s, si) =>
      `<p class="study-line"><span class="fn-tag">${esc(role.functions[si] || '')}</span>${renderSentence(s, { bi, si })}</p>`
    ).join('');
    const wc = bodyText(body).split(/\s+/).filter(Boolean).length;
    const jaShown = state.showJa[bi];
    // Body 2 だけ「実証型 ⇄ 思考実験型」を切り替えられる（実例が浮かばないとき用）
    let switchBtn = '';
    if (bi === 1) {
      const cur = body.mode || 'empirical';
      const target = cur === 'empirical' ? 'scenario' : 'empirical';
      const label = state.switchingBody2 ? '🔀 変換中…'
        : (target === 'scenario' ? '🔀 思考実験型に変える（例が不要）' : '🔀 実証型に戻す');
      switchBtn = `<button class="btn small ghost" data-action="switch-body2" data-target="${target}" ${state.switchingBody2 ? 'disabled' : ''}>${label}</button>`;
    }
    return `<div class="card body-card">
      <div class="body-head">
        <h3>${role.name} <span class="badge src">${esc(role.type)}</span>${body.original ? ' <span class="badge src">✍️ 書き換え済み</span>' : ''}</h3>
        <span class="stat">${wc} 語</span>
      </div>
      ${linesHtml}
      ${jaShown && body.ja ? `<p class="ja-text">${esc(body.ja)}</p>` : ''}
      <div class="row">
        <button class="btn small ghost" data-action="open-body-edit" data-body="${bi}">✏️ 色付き部分を編集</button>
        <button class="btn small ghost" data-action="open-rewrite-body" data-body="${bi}">🔁 観点を指定して書き直す</button>
        ${switchBtn}
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
        <button class="btn small ghost" data-action="copy-essay" data-id="${esc(set.id)}">📋 全文コピー</button>
        ${set.source === 'gemini' ? `<button class="btn small ghost" data-action="regenerate-essay" data-id="${esc(set.id)}">🔄 別パターンで再生成</button>` : ''}
        ${DRILL_ENABLED && set.drillId && getDrills().some(d => d.id === set.drillId) ? `<button class="btn small ghost" data-action="open-essay-drill" data-id="${esc(set.drillId)}">🧠 元の観点だしドリルを見る</button>` : ''}
        <button class="btn small ghost" data-action="open-chat" data-id="${esc(set.id)}">💬 Geminiに質問する</button>
      </div>
    </div>
    ${argSummaryCard(set)}
    <p class="hint-text">3つの Body は役割が異なります（<strong>因果必然</strong>／<strong>実証</strong>／<strong>譲歩反駁</strong>）。文頭のラベルは各文の機能、<span class="free">色付きの部分</span>がテーマに応じて変わる内容で、黒字はテンプレートの定型表現です。色付き部分は<strong>タップで編集</strong>でき、保存すると再採点されます。</p>
    ${evalSection(set)}
    ${bodiesHtml}`;
}

/* 各 Body の観点（argument）を役割ごとに一覧表示する */
function argSummaryCard(set) {
  const items = set.bodies.map((b, i) => {
    const role = roleForBody(i, b);
    return `<li><span class="arg-role">${role.name}</span> <span class="badge src">${esc(role.type)}</span>
      <div class="arg-text">${esc(b.argument || '（観点未設定）')}</div></li>`;
  }).join('');
  return `<div class="card arg-summary">
    <h3>🧭 この構成の3観点</h3>
    <ol class="arg-list">${items}</ol>
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

/* ---------- 色付き（自由作文）部分の手直し ---------- */

/* 文を「定型表現（ロック）」と「自由部分（入力欄）」に分け、自由部分だけ編集させる。
   保存時は編集値と定型表現を元の順序で連結し直し、余分な空白を整えて1文に戻す。 */
function normalizeSentence(parts) {
  return parts.map(x => String(x).trim()).filter(Boolean).join(' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function modalBodyEdit() {
  const be = state.bodyEdit;
  const set = findSet(be.setId);
  if (!set) return '';
  const body = set.bodies[be.bodyIdx];
  const role = roleForBody(be.bodyIdx, body);
  const linesHtml = (body.sentences || []).map((s, si) => {
    const inner = String(s).split(TPL_RE).map((seg, gi) => {
      if (gi % 2) return esc(seg); // 定型表現はロック
      if (!seg.trim()) return ''; // 定型表現の前後などの構造的な空白には入力欄を出さない
      const id = `fe-${si}-${gi}`;
      const val = (be.vals && id in be.vals) ? be.vals[id] : seg.trim();
      const size = Math.max(6, Math.min(44, val.length + 2));
      return `<input class="free-input" id="${id}" value="${esc(val)}" size="${size}" spellcheck="false">`;
    }).join(' ');
    return `<p class="study-line"><span class="fn-tag">${esc(role.functions[si] || '')}</span>${inner}</p>`;
  }).join('');
  return `<div class="overlay" data-action="close-modal">
    <div class="modal" data-stop>
      <h3>✏️ ${role.name} の内容を編集</h3>
      <p class="hint-text">黒字の定型表現は固定です。<span class="free">色付きの入力欄</span>だけを書き換えられます。保存すると採点をやり直します（元に戻すこともできます）。</p>
      ${linesHtml}
      ${be.error ? `<p class="field-error">${esc(be.error)}</p>` : ''}
      <div class="row">
        <button class="btn" data-action="body-edit-save">保存して採点</button>
        <button class="btn ghost" data-action="close-modal">キャンセル</button>
      </div>
    </div>
  </div>`;
}

function applyBodyEdit() {
  const be = state.bodyEdit;
  if (!be) return;
  const sets = getSets();
  const set = sets.find(s => s.id === be.setId);
  if (!set) return;
  const body = set.bodies[be.bodyIdx];
  const newSentences = (body.sentences || []).map((s, si) => {
    const parts = String(s).split(TPL_RE).map((seg, gi) => {
      if (gi % 2) return seg; // 定型表現はそのまま
      const id = `fe-${si}-${gi}`;
      const dom = document.getElementById(id);
      return dom ? dom.value : (be.vals && id in be.vals ? be.vals[id] : seg);
    });
    return normalizeSentence(parts);
  });
  if (newSentences.some(s => !s)) {
    be.error = '空になった文があります。各文に内容を入力してください。';
    render();
    return;
  }
  // 書き換え前の Body をスナップショット（初回のみ）。以降の編集でも真の原文を保持する。
  if (!body.original) body.original = { argument: body.argument, sentences: body.sentences, ja: body.ja || '', mode: body.mode };
  body.sentences = newSentences;
  set.evaluation = null; // 内容が変わったため採点をやり直す
  saveSetsList(sets);
  state.modal = null;
  state.bodyEdit = null;
  state.notice = `${(BODY_ROLES[be.bodyIdx] || {}).name || 'Body'} を編集しました。再採点します。`;
  render();
  autoRescore(set.id);
}

/* 合言葉があれば採点をバックグラウンドで走らせる（無ければ「採点する」ボタンから手動実行） */
function autoRescore(setId) {
  if (localStorage.getItem(LS.keyword)) runBackgroundEvaluation(setId);
}

/* Body 1〜3 の全文（段落を空行で区切る）をクリップボードにコピーする */
async function doCopyEssay(setId) {
  const set = findSet(setId);
  if (!set) return;
  const text = set.bodies.map(b => bodyText(b)).filter(Boolean).join('\n\n');
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch (e) { ok = false; }
  if (!ok) {
    // クリップボードAPIが使えない環境（非HTTPS等）向けのフォールバック
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { ok = false; }
  }
  state.error = ok ? null : 'コピーできませんでした。本文を長押し（右クリック）で選択してください。';
  state.notice = ok ? 'Body 1〜3 の全文をコピーしました' : null;
  render();
}

/* 指定観点での Body 書き直しモーダル */
function modalBodyRewrite() {
  const br = state.bodyRewrite;
  if (!br) return '';
  const set = findSet(br.setId);
  if (!set) return '';
  const role = roleForBody(br.bodyIdx, set.bodies[br.bodyIdx]);
  return `<div class="overlay" data-action="close-modal">
    <div class="modal" data-stop>
      <h3>🔁 ${role.name}（${esc(role.type)}）を観点で書き直す</h3>
      <p class="hint-text">この Body の核にしたい観点を入力してください（日本語でもOK）。${role.name} の役割（<strong>${esc(role.type)}</strong>）は保ったまま、その観点で書き直します。</p>
      <input type="text" id="rewritePointInput" value="${esc(br.text)}" placeholder="例：AIが人間の意思決定を代替する" ${br.busy ? 'disabled' : ''}>
      ${br.error ? `<p class="field-error">${esc(br.error)}</p>` : ''}
      <div class="row">
        <button class="btn" data-action="rewrite-body-submit" ${br.busy ? 'disabled' : ''}>${br.busy ? 'Gemini が書き直し中…' : 'この観点で書き直す'}</button>
        <button class="btn ghost" data-action="close-modal">キャンセル</button>
      </div>
    </div>
  </div>`;
}

async function doRewriteBody() {
  const br = state.bodyRewrite;
  if (!br || br.busy) return;
  const input = document.getElementById('rewritePointInput');
  if (input) br.text = input.value;
  const point = (br.text || '').trim();
  if (!point) { br.error = '観点を入力してください'; render(); return; }
  if (!localStorage.getItem(LS.keyword)) {
    state.modal = 'keyword';
    state.keywordError = '書き直しには合言葉の入力が必要です';
    render();
    return;
  }
  br.busy = true;
  br.error = null;
  render();
  try {
    const nb = await rewriteBodyWithPoint(findSet(br.setId), br.bodyIdx, point);
    const sets = getSets();
    const s2 = sets.find(s => s.id === br.setId);
    const body = s2.bodies[br.bodyIdx];
    if (!body.original) body.original = { argument: body.argument, sentences: body.sentences, ja: body.ja || '', mode: body.mode };
    body.argument = nb.argument;
    body.sentences = nb.sentences;
    body.ja = nb.ja;
    if (br.bodyIdx === 1) body.mode = nb.mode;
    s2.evaluation = null; // 内容が変わったため採点をやり直す
    saveSetsList(sets);
    state.modal = null;
    state.bodyRewrite = null;
    state.notice = `${(BODY_ROLES[br.bodyIdx] || {}).name || 'Body'} をあなたの観点で書き直しました。再採点します。`;
    render();
    autoRescore(s2.id);
    return;
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') {
      localStorage.removeItem(LS.keyword);
      state.modal = 'keyword';
      state.keywordError = '合言葉が正しくありません。もう一度入力してください。';
      state.bodyRewrite = null;
      render();
      return;
    }
    br.error = '書き直しに失敗しました：' + e.message;
  }
  br.busy = false;
  render();
}

/* Body 2 を実証型／思考実験型に切り替えて再生成する（核となる論点は保持・元に戻せる） */
async function doSwitchBody2(targetMode) {
  if (state.switchingBody2) return;
  const set = findSet(state.setId);
  if (!set) return;
  if (!localStorage.getItem(LS.keyword)) {
    state.modal = 'keyword';
    state.keywordError = '型の切り替えには合言葉の入力が必要です';
    render();
    return;
  }
  state.switchingBody2 = true;
  state.error = null;
  render();
  try {
    const nb = await switchBody2Mode(set, targetMode);
    const sets = getSets();
    const s2 = sets.find(s => s.id === set.id);
    const body = s2.bodies[1];
    if (!body.original) body.original = { argument: body.argument, sentences: body.sentences, ja: body.ja || '', mode: body.mode };
    body.argument = nb.argument;
    body.sentences = nb.sentences;
    body.ja = nb.ja;
    body.mode = nb.mode;
    s2.evaluation = null; // 内容が変わったため採点をやり直す
    saveSetsList(sets);
    state.notice = `Body 2 を${nb.mode === 'scenario' ? '思考実験型（例が不要）' : '実証型'}に変えました。再採点します。`;
    state.switchingBody2 = false;
    render();
    autoRescore(s2.id);
    return;
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') {
      localStorage.removeItem(LS.keyword);
      state.modal = 'keyword';
      state.keywordError = '合言葉が正しくありません。もう一度入力してください。';
    } else {
      state.error = '型の切り替えに失敗しました：' + e.message;
    }
  }
  state.switchingBody2 = false;
  render();
}

/* ---------- 観点だしドリル（マトリクス走査） ----------
   増減リスト → 4層×7ドメイン走査 → 立場決定＋3基準フィルタ → 配役 → Gemini講評。
   立場は入力ではなく「観点数が多い側」として走査から導く。講評はGemini呼び出し1回。 */

function drillCand(id) { return state.drill.candidates.find(c => c.id === id); }

function fmtClock(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function startDrill(theme) {
  state.drill = {
    stage: 1,
    topic: theme.topic, topicJa: theme.topicJa || '',
    changes: [{ dir: 'inc', text: '' }, { dir: 'dec', text: '' }, { dir: 'inc', text: '' }],
    candidates: [],
    stance: null,
    finalists: [], details: {},
    casting: [0, 1, 2], // Body i に割り当てる finalists 配列上の添字
    concession: '',
    review: null, busy: false, error: null, fillingChanges: false, fillingScan: false, fillingFilter: false,
    fromHistory: false,
    deadline: Date.now() + DRILL_TOTAL_SECONDS * 1000,
    timerId: null,
  };
  state.view = 'drill';
  state.error = null;
  render();
  startDrillTimer();
}

function startDrillTimer() {
  stopDrillTimer();
  state.drill.timerId = setInterval(() => {
    const el = document.getElementById('drillTimer');
    if (!el || state.view !== 'drill' || !state.drill) { stopDrillTimer(); return; }
    const left = Math.ceil((state.drill.deadline - Date.now()) / 1000);
    if (left > 0) {
      el.textContent = fmtClock(left);
    } else {
      el.textContent = '⏰ 時間切れ';
      el.classList.add('over');
      stopDrillTimer();
    }
  }, 250);
}

function stopDrillTimer() {
  if (state.drill && state.drill.timerId) { clearInterval(state.drill.timerId); state.drill.timerId = null; }
}

/* clickable=true のとき各ステージを押して移動できる（講評済みのドリルで各記入ページを見返す用） */
function drillStageBar(stage, clickable) {
  const names = ['増減', '走査', 'フィルタ', '配役', '講評'];
  return `<div class="drill-stages">${names.map((n, i) => {
    const cls = `drill-stage${i + 1 === stage ? ' cur' : ''}${i + 1 < stage ? ' done' : ''}${clickable ? ' clickable' : ''}`;
    const attrs = clickable ? ` data-action="drill-goto" data-stage="${i + 1}" title="このステージを見返す"` : '';
    return `<span class="${cls}"${attrs}>${i + 1} ${n}</span>`;
  }).join('<span class="drill-arrow">→</span>')}</div>`;
}

function viewDrill() {
  const d = state.drill;
  if (!d) { state.view = 'home'; return viewHome(); }
  const guide = DRILL_STAGE_GUIDE[d.stage];
  let stageHtml = '';
  if (d.stage === 1) stageHtml = drillStage1(d);
  else if (d.stage === 2) stageHtml = drillStage2(d);
  else if (d.stage === 3) stageHtml = drillStage3(d);
  else if (d.stage === 4) stageHtml = drillStage4(d);
  else stageHtml = drillStage5(d);
  const done = !!d.review; // 講評済み＝完了。タイマーは止める
  const navigable = done && !d.fromHistory; // 各ステージを押して見返せる（データが完全なとき）
  return `<header class="topbar">
      <button class="btn ghost" data-action="drill-quit">${done ? '← ホームへ' : '← 中止'}</button>
      <span class="topbar-title">🧠 観点だしドリル</span>
      ${done ? '<span class="drill-timer">✓ 完了</span>' : `<span id="drillTimer" class="drill-timer">${fmtClock(Math.max(0, Math.ceil((d.deadline - Date.now()) / 1000)))}</span>`}
    </header>
    ${banner()}
    <div class="topic-head">
      <h2>${esc(d.topic)}</h2>
      <p class="set-sub">${esc(d.topicJa)}${!done && guide ? ` <span class="stat">このステージの目安 ${fmtClock(guide)}</span>` : ''}</p>
    </div>
    ${drillStageBar(d.stage, navigable)}
    ${navigable ? '<p class="hint-text">各ステージ名を押すと、その記入内容を見返せます。編集して再判定することもできます。</p>' : ''}
    ${d.error ? `<p class="field-error">${esc(d.error)}</p>` : ''}
    ${stageHtml}`;
}

/* Stage 1: トピックを「何が増え、何が減るか」の中立な増減リストに変換する */
function drillStage1(d) {
  const rows = d.changes.map((c, i) => `<div class="drill-ch-row">
    <button class="btn small ${c.dir === 'inc' ? '' : 'ghost'}" data-action="drill-toggle-change" data-i="${i}">${c.dir === 'inc' ? '📈 増' : '📉 減'}</button>
    <input type="text" class="dr-ch" data-i="${i}" value="${esc(c.text)}" placeholder="例：${c.dir === 'inc' ? 'AIに任せる判断が増える' : '人間が判断する場面が減る'}">
    ${d.changes.length > 2 ? `<button class="theme-del" data-action="drill-del-change" data-i="${i}">×</button>` : ''}
  </div>`).join('');
  return `<div class="card">
    <h3>Stage 1: 増減リスト</h3>
    <p class="hint-text">主張のままだと観点は出ません。まずテーマを「<strong>何が増え、何が減るか</strong>」の中立な変化に変換します（3〜6件）。思いつかないときは Gemini に叩き台を作らせて構いません。</p>
    ${rows}
    <div class="row">
      ${d.changes.length < 6 ? '<button class="btn small ghost" data-action="drill-add-change">＋ 行を追加</button>' : ''}
      <button class="btn small ghost" data-action="drill-fill-changes" ${d.fillingChanges ? 'disabled' : ''}>${d.fillingChanges ? '🤖 Gemini が作成中…' : '🤖 増減リストをGeminiに埋めてもらう'}</button>
    </div>
    <div class="row"><button class="btn" data-action="drill-to-2">次へ（マトリクス走査）</button></div>
  </div>`;
}

/* Stage 1 の増減リストを Gemini に埋めてもらう（既存の入力は残し、空きを埋める） */
async function doFillDrillChanges() {
  const d = state.drill;
  if (!d || d.fillingChanges) return;
  if (!localStorage.getItem(LS.keyword)) {
    state.modal = 'keyword';
    state.keywordError = '増減リストの生成には合言葉の入力が必要です';
    render();
    return;
  }
  d.fillingChanges = true;
  d.error = null;
  render();
  try {
    const gen = await generateDrillChanges(d.topic);
    // 入力済みの行は保持し、Gemini の項目のうち重複しないものを追加（最大6件）
    const existing = d.changes.filter(c => c.text.trim());
    const seen = new Set(existing.map(c => c.text.trim()));
    const additions = gen.filter(c => !seen.has(c.text.trim()));
    d.changes = existing.concat(additions).slice(0, 6);
    if (!d.changes.length) d.changes = gen.slice(0, 6);
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') {
      localStorage.removeItem(LS.keyword);
      state.modal = 'keyword';
      state.keywordError = '合言葉が正しくありません。もう一度入力してください。';
    } else {
      d.error = '増減リストの生成に失敗しました：' + e.message;
    }
  }
  d.fillingChanges = false;
  render();
}

/* Stage 2: 4層×7ドメインのグリッドを走査して候補を出す */
function drillStage2(d) {
  const filled = d.candidates.length;
  const grid = `<table class="dg-table"><thead><tr><th></th>${DRILL_LAYERS.map(l => `<th>${esc(l.ja)}</th>`).join('')}</tr></thead>
    <tbody>${DRILL_DOMAINS.map((dom, di) => `<tr><th>${esc(dom.ja)}</th>${DRILL_LAYERS.map((l, li) => {
      const c = d.candidates.find(x => x.layer === li && x.domain === di);
      const mark = c ? (c.side === 'agree' ? '<span class="dg-plus">＋</span>' : '<span class="dg-minus">−</span>') : '<span class="dg-dot">·</span>';
      const sup = c && typeof c.changeIdx === 'number' ? `<sup class="dg-sup">${c.changeIdx + 1}</sup>` : '';
      const titleNote = c ? ` — ${c.note}` : '';
      return `<td><button class="dg-cell${c ? ' filled' : ''}" data-action="drill-cell" data-layer="${li}" data-domain="${di}" title="${esc(l.ja)} × ${esc(dom.ja)}${esc(titleNote)}">${mark}${sup}</button></td>`;
    }).join('')}</tr>`).join('')}</tbody></table>`;
  const chSummary = d.changes.filter(c => c.text.trim()).map(c => {
    const realIdx = d.changes.indexOf(c);
    return `<li>${c.dir === 'inc' ? '📈' : '📉'}${esc(c.text)}<span class="stat"> — ${d.candidates.filter(x => x.changeIdx === realIdx).length}セルで走査済み</span></li>`;
  }).join('');
  return `<div class="card">
    <h3>Stage 2: マトリクス走査 <span class="stat">候補 ${filled} / 5個以上</span></h3>
    <p class="hint-text">セルをタップすると、まず<strong>Stage 1のどの変化を問うか</strong>を選び、その変化が「この層のこのドメインにプラスかマイナスか」を機械的に問います。思いつきを待たず、リストを走査して生成します。同じ変化を複数セルで問っても構いません。<strong>両側（賛成に利する／反対に利する）を出す</strong>のがコツです。埋まらないときは Gemini に走査させて構いません。</p>
    <ol class="drill-ch-summary">${chSummary}</ol>
    <div class="dg-wrap">${grid}</div>
    <div class="row">
      <button class="btn small ghost" data-action="drill-fill-scan" ${d.fillingScan ? 'disabled' : ''}>${d.fillingScan ? '🤖 Gemini が走査中…' : '🤖 走査をGeminiに埋めてもらう'}</button>
    </div>
    <div class="row">
      <button class="btn" data-action="drill-to-3" ${filled < 5 ? 'disabled' : ''}>次へ（フィルタ）</button>
      <button class="btn ghost" data-action="drill-back" data-stage="1">← 戻る</button>
    </div>
  </div>`;
}

/* Stage 2 のマトリクス走査を Gemini に埋めてもらう（既存のセルは残し、空きセルだけ追加） */
async function doFillDrillScan() {
  const d = state.drill;
  if (!d || d.fillingScan) return;
  const changes = d.changes.filter(c => c.text.trim());
  if (changes.length < 2) { d.error = '先に増減リストを2件以上入力してください'; render(); return; }
  if (!localStorage.getItem(LS.keyword)) {
    state.modal = 'keyword';
    state.keywordError = '走査の生成には合言葉の入力が必要です';
    render();
    return;
  }
  d.fillingScan = true;
  d.error = null;
  render();
  try {
    const cells = await generateDrillScan(d.topic, changes);
    let added = 0;
    for (const cell of cells) {
      const li = DRILL_LAYERS.findIndex(l => l.ja === cell.layer);
      const di = DRILL_DOMAINS.findIndex(dm => dm.ja === cell.domain);
      if (li < 0 || di < 0) continue;
      const id = `c${li}-${di}`;
      if (d.candidates.some(x => x.id === id)) continue; // 自分で埋めたセルは上書きしない
      const srcChange = changes[(cell.changeIndex || 1) - 1] || changes[0];
      const changeIdx = d.changes.indexOf(srcChange);
      d.candidates.push({ id, layer: li, domain: di, note: cell.note, side: cell.side === 'disagree' ? 'disagree' : 'agree', changeIdx: changeIdx >= 0 ? changeIdx : 0 });
      added++;
    }
    if (!added) d.error = 'Gemini の走査結果はすべて既存セルと重複していました';
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') {
      localStorage.removeItem(LS.keyword);
      state.modal = 'keyword';
      state.keywordError = '合言葉が正しくありません。もう一度入力してください。';
    } else {
      d.error = '走査の生成に失敗しました：' + e.message;
    }
  }
  d.fillingScan = false;
  render();
}

/* Stage 3: 立場決定（観点数が多い側）＋3基準フィルタで3つに絞る */
function drillStage3(d) {
  const nAgree = d.candidates.filter(c => c.side === 'agree').length;
  const nDis = d.candidates.filter(c => c.side === 'disagree').length;
  if (!d.stance) d.stance = nDis > nAgree ? 'disagree' : 'agree';
  const side = d.candidates.filter(c => c.side === d.stance);
  const items = side.map(c => {
    const on = d.finalists.includes(c.id);
    const det = d.details[c.id] || {};
    const srcChange = d.changes[c.changeIdx];
    return `<div class="card drill-cand${on ? ' picked' : ''}">
      <label class="drill-cand-head">
        <input type="checkbox" data-action="drill-finalist" data-id="${esc(c.id)}" ${on ? 'checked' : ''}>
        <span class="badge src">${esc(DRILL_LAYERS[c.layer].ja)} × ${esc(DRILL_DOMAINS[c.domain].ja)}</span> ${esc(c.note)}
      </label>
      ${srcChange ? `<div class="drill-cand-src">← ${srcChange.dir === 'inc' ? '📈' : '📉'} ${esc(srcChange.text)}</div>` : ''}
      ${on ? `<div class="drill-checks">
        <label>① メカニズム：「As X…, Y also grows」の連動を英語1文で</label>
        <input type="text" class="dr-fd" data-cid="${esc(c.id)}" data-f="mech" value="${esc(det.mech || '')}" placeholder="As AI takes over routine tasks, demand for retraining also grows.">
        <label>② 実例：China / India 級の実在例（単語で）</label>
        <input type="text" class="dr-fd" data-cid="${esc(c.id)}" data-f="example" value="${esc(det.example || '')}" placeholder="China, developing countries">
        <label>③ 語彙：この観点を支える英単語（2〜3語）</label>
        <input type="text" class="dr-fd" data-cid="${esc(c.id)}" data-f="vocab" value="${esc(det.vocab || '')}" placeholder="automation, displacement, retraining">
      </div>` : ''}
    </div>`;
  }).join('');
  return `<div class="card">
    <h3>Stage 3: 立場決定＋3基準フィルタ <span class="stat">選択 ${d.finalists.length} / 3</span></h3>
    <p class="hint-text">走査結果：賛成側に利する観点 <strong>${nAgree}</strong> ／ 反対側 <strong>${nDis}</strong>。立場は信念ではなく<strong>観点数が多い側</strong>で決めます。</p>
    <div class="seg">
      <button class="seg-btn${d.stance === 'agree' ? ' active' : ''}" data-action="drill-stance" data-stance="agree">賛成で書く（${nAgree}個）</button>
      <button class="seg-btn${d.stance === 'disagree' ? ' active' : ''}" data-action="drill-stance" data-stance="disagree">反対で書く（${nDis}個）</button>
    </div>
    <p class="hint-text">3基準（①メカニズム ②実例 ③語彙 — <strong>語彙が無い観点は本番では存在しないのと同じ</strong>）を自己チェックして3つ選択。<strong>層もドメインも互いに別のマス</strong>から選ぶこと。迷ったら Gemini に絞らせて構いません。</p>
    <div class="row"><button class="btn small ghost" data-action="drill-fill-filter" ${d.fillingFilter ? 'disabled' : ''}>${d.fillingFilter ? '🤖 Gemini が選定中…' : '🤖 3つの選定と①②③をGeminiに埋めてもらう'}</button></div>
  </div>
  ${items || '<p class="empty">この側の候補がありません。走査に戻って追加してください。</p>'}
  <div class="row">
    <button class="btn" data-action="drill-to-4">次へ（配役）</button>
    <button class="btn ghost" data-action="drill-back" data-stage="2">← 走査に戻る</button>
  </div>`;
}

/* Stage 3 のフィルタ（3つの選定＋①②③記入）を Gemini に埋めてもらう */
async function doFillDrillFilter() {
  const d = state.drill;
  if (!d || d.fillingFilter) return;
  const side = d.candidates.filter(c => c.side === d.stance);
  if (side.length < 3) { d.error = 'この側の候補が3つ未満です。走査に戻って追加してください'; render(); return; }
  if (!localStorage.getItem(LS.keyword)) {
    state.modal = 'keyword';
    state.keywordError = 'フィルタの生成には合言葉の入力が必要です';
    render();
    return;
  }
  d.fillingFilter = true;
  d.error = null;
  render();
  try {
    const res = await generateDrillFilter(d.topic, d.stance,
      side.map(c => ({ layer: DRILL_LAYERS[c.layer].ja, domain: DRILL_DOMAINS[c.domain].ja, note: c.note })));
    // 層・ドメインが互いに別になるよう先勝ちで3つ選ぶ（構造的な重複防止）
    const picked = [];
    const usedLayer = new Set();
    const usedDomain = new Set();
    for (const f of res) {
      const li = DRILL_LAYERS.findIndex(l => l.ja === f.layer);
      const di = DRILL_DOMAINS.findIndex(dm => dm.ja === f.domain);
      if (li < 0 || di < 0 || usedLayer.has(li) || usedDomain.has(di)) continue;
      const cand = side.find(c => c.layer === li && c.domain === di);
      if (!cand || picked.includes(cand.id)) continue;
      usedLayer.add(li);
      usedDomain.add(di);
      picked.push(cand.id);
      d.details[cand.id] = {
        mech: String(f.mech || '').trim(),
        example: String(f.example || '').trim(),
        vocab: String(f.vocab || '').trim(),
      };
      if (picked.length === 3) break;
    }
    if (picked.length) d.finalists = picked;
    else d.error = 'フィルタの生成結果を候補に対応づけられませんでした';
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') {
      localStorage.removeItem(LS.keyword);
      state.modal = 'keyword';
      state.keywordError = '合言葉が正しくありません。もう一度入力してください。';
    } else {
      d.error = 'フィルタの生成に失敗しました：' + e.message;
    }
  }
  d.fillingFilter = false;
  render();
}

/* Stage 4: Body 1/2/3 への配役と譲歩素材の選択 */
function drillStage4(d) {
  const roles = ['Body 1（因果必然型）— メカニズムが固い観点', 'Body 2（実証型）— 実例が鮮明な観点', 'Body 3（譲歩反駁型）— 反論が見えやすい観点'];
  const rows = roles.map((r, bi) => `<label class="drill-cast-label">${r}</label>
    <select class="dr-cast" data-bi="${bi}">
      ${d.finalists.map((id, fi) => {
        const c = drillCand(id);
        return `<option value="${fi}"${d.casting[bi] === fi ? ' selected' : ''}>${esc(c.note)}（${esc(DRILL_LAYERS[c.layer].ja)}×${esc(DRILL_DOMAINS[c.domain].ja)}）</option>`;
      }).join('')}
    </select>`).join('');
  const discarded = d.candidates.filter(c => c.side !== d.stance);
  const concSel = `<label class="drill-cast-label">譲歩素材（捨てた側から1つ — Body 3 の「It is true that…」に回収）</label>
    <select id="drillConcession">
      <option value="">（選ばない）</option>
      ${discarded.map(c => `<option value="${esc(c.id)}"${d.concession === c.id ? ' selected' : ''}>${esc(c.note)}（${esc(DRILL_LAYERS[c.layer].ja)}×${esc(DRILL_DOMAINS[c.domain].ja)}）</option>`).join('')}
    </select>`;
  return `<div class="card">
    <h3>Stage 4: 配役</h3>
    <p class="hint-text">3観点をそれぞれ得意な役に割り当てます（重複不可）。</p>
    ${rows}
    ${discarded.length ? concSel : '<p class="hint-text">捨てた側の候補が無いため、譲歩素材はGeminiに任せます。</p>'}
    <div class="row">
      <button class="btn" data-action="drill-judge" ${d.busy ? 'disabled' : ''}>${d.busy ? 'Gemini が講評中…' : '📋 判定する（Gemini講評）'}</button>
      <button class="btn ghost" data-action="drill-back" data-stage="3">← フィルタに戻る</button>
    </div>
  </div>`;
}

/* Stage 5: Gemini講評の表示（履歴からの閲覧もこの画面） */
function drillStage5(d) {
  if (d.busy) return '<div class="loading"><div class="spinner"></div><p>Gemini がワークシートを講評中…</p></div>';
  const r = d.review;
  if (!r) return '<p class="empty">講評がありません。</p>';
  // 直後表示は candidate ID 参照、履歴閲覧（fromHistory）は保存済みの詳細オブジェクト。両対応に正規化する。
  const fs = d.fromHistory
    ? d.finalists.map(f => ({ layerJa: f.layer, domainJa: f.domain, note: f.note, mech: f.mech || '' }))
    : d.finalists.map(id => {
        const c = drillCand(id);
        const det = d.details[id] || {};
        return { layerJa: DRILL_LAYERS[c.layer].ja, domainJa: DRILL_DOMAINS[c.domain].ja, note: c.note, mech: det.mech || '' };
      });
  const ws = fs.map((f, fi) => {
    const bi = d.casting.indexOf(fi);
    return `<li><strong>${['因果必然', '実証', '譲歩反駁'][bi] || '?'}型</strong>：${esc(f.note)}
      <span class="badge src">${esc(f.layerJa)}×${esc(f.domainJa)}</span>
      ${f.mech ? `<div class="verdict-comment">🔗 ${esc(f.mech)}</div>` : ''}</li>`;
  }).join('');
  const missed = (r.missedCells || []).map(m => `<li><span class="badge src">${esc(m.layer)}×${esc(m.domain)}</span> ${esc(m.idea)}</li>`).join('');
  const mech = (r.mechCorrections || []).map(m => `<li>観点${m.index}：<span class="free">${esc(m.corrected)}</span>${m.comment ? `<div class="verdict-comment">${esc(m.comment)}</div>` : ''}</li>`).join('');
  const picks = (r.modelPicks || []).map(p => `<li><strong>${esc(p.role)}</strong>：${esc(p.argument)} <span class="badge src">${esc(p.layer)}×${esc(p.domain)}</span></li>`).join('');
  return `<div class="card eval-card">
      <h3>📋 総評</h3><p class="drill-review-text">${esc(r.overall)}</p>
    </div>
    <div class="card">
      <h3>あなたのワークシート（${d.stance === 'agree' ? '賛成' : '反対'}で立論）</h3><ol class="drill-review-list">${ws}</ol>
    </div>
    <div class="card">
      <h3>講評の詳細</h3>
      <ul class="drill-review-list">
        ${r.changesReview ? `<li><strong>増減リスト：</strong>${esc(r.changesReview)}</li>` : ''}
        ${r.scanReview ? `<li><strong>走査：</strong>${esc(r.scanReview)}</li>` : ''}
        ${r.filterReview ? `<li><strong>フィルタ：</strong>${esc(r.filterReview)}</li>` : ''}
        ${r.castingReview ? `<li><strong>配役・譲歩：</strong>${esc(r.castingReview)}</li>` : ''}
      </ul>
      ${missed ? `<h3>見落としていた有望セル</h3><ul class="drill-review-list">${missed}</ul>` : ''}
      ${mech ? `<h3>メカニズム文の添削</h3><ul class="drill-review-list">${mech}</ul>` : ''}
      ${picks ? `<h3>Gemini の模範ピック</h3><ul class="drill-review-list">${picks}</ul>` : ''}
    </div>
    <div class="row">
      <button class="btn" data-action="drill-essay">📝 このワークシートでエッセイを生成</button>
      <button class="btn ghost" data-action="drill-restart">🔁 同じテーマでもう一度</button>
      <button class="btn ghost" data-action="drill-quit">ホームへ</button>
    </div>`;
}

/* セル編集モーダル：Stage 1の変化を1つ選び、その変化がこの層×ドメインにプラスかマイナスかを一言＋賛否で記録 */
function modalDrillCell() {
  const cd = state.cellDraft;
  if (!cd) return '';
  const d = state.drill;
  const existing = d && d.candidates.find(c => c.layer === cd.layer && c.domain === cd.domain);
  const changes = d.changes.filter(c => c.text.trim());
  const changeChips = changes.map((c, i) => {
    // cd.changeIdx は d.changes 内の実インデックス。filter 後の表示順とズレるため元配列で引き直す
    const realIdx = d.changes.indexOf(c);
    return `<button class="chip drill-change-chip${cd.changeIdx === realIdx ? ' active' : ''}" data-action="drill-cell-change" data-idx="${realIdx}">${c.dir === 'inc' ? '📈' : '📉'} ${esc(c.text)}</button>`;
  }).join('');
  return `<div class="overlay" data-action="close-modal">
    <div class="modal" data-stop>
      <h3>${esc(DRILL_LAYERS[cd.layer].ja)} × ${esc(DRILL_DOMAINS[cd.domain].ja)}</h3>
      <p class="hint-text">Stage 1で挙げた<strong>どの変化</strong>について、この層×ドメインを問いますか？</p>
      <div class="chips">${changeChips || '<span class="hint-text">Stage 1に変化がありません</span>'}</div>
      <p class="hint-text">選んだ変化がこの層のこのドメインで<strong>具体的に何を引き起こすか</strong>を一言で（中立に・構造で・一段抽象化して）。</p>
      <input type="text" id="dcNote" value="${esc(cd.note)}" placeholder="例：再教育の需要が拡大する">
      <label>この観点はどちらの立場に利するか</label>
      <div class="seg">
        <button class="seg-btn${cd.side === 'agree' ? ' active' : ''}" data-action="drill-cell-side" data-side="agree">賛成に利する ＋</button>
        <button class="seg-btn${cd.side === 'disagree' ? ' active' : ''}" data-action="drill-cell-side" data-side="disagree">反対に利する −</button>
      </div>
      <div class="row">
        <button class="btn" data-action="drill-cell-save" ${cd.changeIdx === null ? 'disabled' : ''}>保存</button>
        ${existing ? '<button class="btn ghost" data-action="drill-cell-del">この観点を削除</button>' : ''}
        <button class="btn ghost" data-action="close-modal">キャンセル</button>
      </div>
    </div>
  </div>`;
}

/* ステージ遷移の検証 */
function drillGoStage2() {
  const d = state.drill;
  d.changes = d.changes.map(c => ({ dir: c.dir, text: c.text.trim() }));
  if (d.changes.filter(c => c.text).length < 3) {
    d.error = '増減リストを3件以上入力してください（空行は無視されます）';
  } else {
    d.error = null;
    d.stage = 2;
  }
  render();
}

function drillGoStage4() {
  const d = state.drill;
  if (d.finalists.length !== 3) { d.error = '観点を3つ選んでください'; render(); return; }
  const cands = d.finalists.map(drillCand);
  const layers = new Set(cands.map(c => c.layer));
  const domains = new Set(cands.map(c => c.domain));
  if (layers.size < 3 || domains.size < 3) {
    d.error = '重複を構造的に防ぐため、3つの観点は層もドメインも互いに別のマスから選んでください';
    render();
    return;
  }
  for (const id of d.finalists) {
    const det = d.details[id] || {};
    if (!String(det.mech || '').trim() || !String(det.example || '').trim() || !String(det.vocab || '').trim()) {
      d.error = '選んだ3観点すべてに ①メカニズム文 ②実例 ③語彙 を記入してください（3基準フィルタ）';
      render();
      return;
    }
  }
  d.error = null;
  d.casting = [0, 1, 2];
  d.stage = 4;
  render();
}

/* Gemini講評（1コール）→ 記録を保存して Stage 5 へ */
async function doDrillJudge() {
  const d = state.drill;
  if (!d || d.busy) return;
  const seen = new Set(d.casting);
  if (seen.size !== 3) { d.error = '配役が重複しています。3観点を別々の Body に割り当ててください'; render(); return; }
  if (!localStorage.getItem(LS.keyword)) {
    state.modal = 'keyword';
    state.keywordError = '講評には合言葉の入力が必要です';
    render();
    return;
  }
  stopDrillTimer();
  d.busy = true;
  d.error = null;
  d.stage = 5;
  render();
  const finalists = d.finalists.map(id => {
    const c = drillCand(id);
    const det = d.details[id] || {};
    return {
      layer: DRILL_LAYERS[c.layer].ja, domain: DRILL_DOMAINS[c.domain].ja,
      note: c.note, mech: det.mech || '', example: det.example || '', vocab: det.vocab || '',
    };
  });
  const concessionNote = d.concession ? (drillCand(d.concession) || {}).note || '' : '';
  try {
    const review = await reviewDrillWorksheet({
      topic: d.topic,
      stance: d.stance,
      changes: d.changes.filter(c => c.text),
      candidates: d.candidates.map(c => ({
        layer: DRILL_LAYERS[c.layer].ja, domain: DRILL_DOMAINS[c.domain].ja, side: c.side, note: c.note,
        change: (d.changes[c.changeIdx] || {}).text || '',
      })),
      finalists,
      casting: d.casting,
      concession: concessionNote,
    });
    d.review = review;
    // 記録を保存（履歴から再閲覧・エッセイ生成できる形で自己完結させる）
    const recordId = 'drill-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    d.recordId = recordId; // 生成したエッセイから元ドリルへ辿れるようにする
    const drills = getDrills();
    drills.unshift({
      id: recordId,
      topic: d.topic, topicJa: d.topicJa, createdAt: Date.now(),
      stance: d.stance,
      changes: d.changes.filter(c => c.text),
      candidates: d.candidates,
      finalists, casting: d.casting.slice(), concession: concessionNote,
      review,
    });
    saveDrills(drills);
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') {
      localStorage.removeItem(LS.keyword);
      state.modal = 'keyword';
      state.keywordError = '合言葉が正しくありません。もう一度入力してください。';
      d.stage = 4;
    } else {
      d.error = '講評に失敗しました：' + e.message;
      d.stage = 4;
    }
  }
  d.busy = false;
  render();
}

/* ドリル記録（保存形式）からワークシートを組み立ててエッセイ生成へ */
function drillWorksheetFromFinalists(finalists, casting, concession) {
  return {
    points: [0, 1, 2].map(bi => {
      const f = finalists[casting[bi]];
      return { layer: f.layer, domain: f.domain, idea: f.note, mech: f.mech, example: f.example, vocab: f.vocab };
    }),
    concession: concession || '',
  };
}

function doDrillEssay() {
  const d = state.drill;
  if (!d || !d.review) return;
  const finalists = d.fromHistory ? d.finalists : d.finalists.map(id => {
    const c = drillCand(id);
    const det = d.details[id] || {};
    return { layer: DRILL_LAYERS[c.layer].ja, domain: DRILL_DOMAINS[c.domain].ja, note: c.note, mech: det.mech || '', example: det.example || '', vocab: det.vocab || '' };
  });
  const concessionNote = d.fromHistory ? d.concession : (d.concession ? (drillCand(d.concession) || {}).note || '' : '');
  const worksheet = drillWorksheetFromFinalists(finalists, d.casting, concessionNote);
  const theme = { topic: d.topic, topicJa: d.topicJa };
  const stance = d.stance;
  const drillId = d.recordId || null;
  stopDrillTimer();
  state.drill = null;
  doGenerateEssay(theme, stance, worksheet, drillId);
}

/* 講評済みドリル記録を履歴から Stage 5 表示用に読み込む */
function openDrillRecord(id) {
  const rec = getDrills().find(x => x.id === id);
  if (!rec) return;
  const candidates = rec.candidates || [];
  const base = {
    topic: rec.topic, topicJa: rec.topicJa,
    changes: rec.changes || [], candidates,
    stance: rec.stance,
    review: rec.review, busy: false, error: null,
    fillingChanges: false, fillingScan: false, fillingFilter: false,
    recordId: rec.id, // 生成したエッセイからこの記録へ辿れるようにする
    deadline: 0, timerId: null,
  };
  // 保存済みの finalist（layer/domain 名＋①②③）を候補ID＋details に復元し、全ステージを見返せる形に戻す
  const finalistIds = [];
  const details = {};
  let mapped = Array.isArray(rec.finalists) && rec.finalists.length > 0;
  for (const f of (rec.finalists || [])) {
    const li = DRILL_LAYERS.findIndex(l => l.ja === f.layer);
    const di = DRILL_DOMAINS.findIndex(dm => dm.ja === f.domain);
    const cand = candidates.find(c => c.layer === li && c.domain === di);
    if (!cand) { mapped = false; break; }
    finalistIds.push(cand.id);
    details[cand.id] = { mech: f.mech || '', example: f.example || '', vocab: f.vocab || '' };
  }
  if (mapped) {
    const conc = rec.concession ? candidates.find(c => c.note === rec.concession) : null;
    state.drill = Object.assign(base, {
      stage: 5, finalists: finalistIds, details,
      casting: (rec.casting || [0, 1, 2]).slice(), concession: conc ? conc.id : '',
      fromHistory: false, // セッション形式に復元済み → 各ステージがそのまま機能する
    });
  } else {
    // 復元に失敗した古い記録は従来どおり Stage 5 のみ閲覧（fromHistory=true）
    state.drill = Object.assign(base, {
      stage: 5, finalists: rec.finalists, details: {},
      casting: rec.casting, concession: rec.concession, fromHistory: true,
    });
  }
  state.view = 'drill';
  render();
}

function drillHistoryHtml() {
  const drills = getDrills();
  if (!drills.length) return '';
  const items = drills.slice(0, 5).map(r => `<div class="theme-item">
    <button class="theme-pick" data-action="drill-open" data-id="${esc(r.id)}">
      <span class="theme-en">${esc(r.topic)}</span>
      <span class="theme-ja">${new Date(r.createdAt).toLocaleString()} ・ ${r.stance === 'agree' ? '賛成' : '反対'}で立論</span>
    </button>
    <button class="theme-del" data-action="drill-delete" data-id="${esc(r.id)}" title="この記録を削除">×</button>
  </div>`).join('');
  return `<h3 class="drill-history-h">最近のドリル記録</h3>${items}`;
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
  let failure = null;
  try {
    const set = findSet(setId);
    if (set) {
      const evaluation = await evaluateEssaySet(set);
      const sets = getSets();
      const s2 = sets.find(s => s.id === setId);
      if (s2) { s2.evaluation = evaluation; saveSetsList(sets); }
    }
  } catch (e) {
    failure = e;
  }
  state.evaluatingSetId = null;
  // 失敗時は静かに諦めず、理由を伝える（合言葉切れ・クオータ超過などで
  // 「採点する」を押しても画面が変わらない、という状態を防ぐ）
  if (failure) {
    if (failure.code === 'UNAUTHORIZED') {
      localStorage.removeItem(LS.keyword);
      state.modal = 'keyword';
      state.keywordError = '採点には合言葉が必要です。もう一度入力してください。';
    } else {
      state.error = '採点に失敗しました：' + failure.message;
    }
  }
  if (state.view === 'study' && state.setId === setId) render();
  else if (failure) render();
}

/* 同じテーマ・スタンスで作り直す（現在の構成は削除して差し替える） */
function regenerateEssay(setId) {
  const set = findSet(setId);
  if (!set) return;
  if (!confirm('この構成を削除し、同じテーマ・立場で新しく作り直しますか？')) return;
  saveSetsList(getSets().filter(s => s.id !== setId));
  doGenerateEssay({ topic: set.topic, topicJa: set.topicJa }, set.stance);
}

async function doGenerateEssay(theme, stance, worksheet, drillId) {
  if (!localStorage.getItem(LS.keyword)) {
    state.modal = 'keyword';
    state.keywordError = 'エッセイ生成には合言葉の入力が必要です';
    render();
    return;
  }
  state.modal = null;
  state.view = 'loading';
  state.loadingText = worksheet
    ? 'あなたのワークシートを核に Gemini が例文を生成中…'
    : 'Gemini が例文を生成中…（通常10〜20秒ほどです）';
  render();
  try {
    const set = await generateEssaySet(theme, stance, worksheet);
    if (drillId) set.drillId = drillId; // 元ドリルへのリンク
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
  const data = { sets: getSets(), progress: getProgress(), customThemes: getCustomThemes(), drills: getDrills() };
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
      if (Array.isArray(data.drills)) {
        const drills = getDrills();
        for (const r of data.drills) {
          if (r && r.id && !drills.some(x => x.id === r.id)) drills.push(r);
        }
        drills.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        saveDrills(drills);
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
    state.bodyEdit = null; state.chatError = null; state.cellDraft = null;
    state.bodyRewrite = null;
    render();
  }
  /* ---- 観点だしドリル ---- */
  else if (a === 'drill-start') {
    const sel = document.getElementById('drillThemeSel');
    const theme = visibleThemes()[Number(sel ? sel.value : 0)];
    if (theme) startDrill(theme);
  }
  else if (a === 'drill-quit') {
    // 講評前（未保存）のみ破棄確認。講評済み＝保存済みなので確認不要
    if (state.drill && !state.drill.review && state.drill.stage < 5 && !confirm('ドリルを中止しますか？（入力内容は破棄されます）')) return;
    stopDrillTimer();
    state.drill = null;
    state.view = 'home';
    render();
  }
  else if (a === 'drill-restart') {
    const d = state.drill;
    stopDrillTimer();
    startDrill({ topic: d.topic, topicJa: d.topicJa });
  }
  else if (a === 'drill-add-change') { state.drill.changes.push({ dir: 'inc', text: '' }); render(); }
  else if (a === 'drill-fill-changes') { doFillDrillChanges(); }
  else if (a === 'drill-fill-scan') { doFillDrillScan(); }
  else if (a === 'drill-fill-filter') { doFillDrillFilter(); }
  else if (a === 'drill-del-change') { state.drill.changes.splice(Number(el.dataset.i), 1); render(); }
  else if (a === 'drill-toggle-change') {
    const c = state.drill.changes[Number(el.dataset.i)];
    c.dir = c.dir === 'inc' ? 'dec' : 'inc';
    render();
  }
  else if (a === 'drill-to-2') { drillGoStage2(); }
  else if (a === 'drill-back') { state.drill.error = null; state.drill.stage = Number(el.dataset.stage); render(); }
  else if (a === 'drill-goto') { state.drill.error = null; state.drill.stage = Number(el.dataset.stage); render(); }
  else if (a === 'drill-cell') {
    const layer = Number(el.dataset.layer), domain = Number(el.dataset.domain);
    const c = state.drill.candidates.find(x => x.layer === layer && x.domain === domain);
    const filled = state.drill.changes.filter(ch => ch.text.trim());
    const defaultIdx = filled.length === 1 ? state.drill.changes.indexOf(filled[0]) : null;
    state.cellDraft = {
      layer, domain, note: c ? c.note : '', side: c ? c.side : 'agree',
      changeIdx: c ? c.changeIdx : defaultIdx,
    };
    state.modal = 'drillCell';
    render();
    const inp = document.getElementById('dcNote');
    if (inp) inp.focus();
  }
  else if (a === 'drill-cell-change') { state.cellDraft.changeIdx = Number(el.dataset.idx); render(); }
  else if (a === 'drill-cell-side') { state.cellDraft.side = el.dataset.side; render(); }
  else if (a === 'drill-cell-save') {
    const cd = state.cellDraft;
    if (cd.changeIdx === null || cd.changeIdx === undefined) return;
    const note = ((document.getElementById('dcNote') || {}).value || cd.note).trim();
    if (!note) return;
    const d = state.drill;
    const id = `c${cd.layer}-${cd.domain}`;
    const existing = d.candidates.find(x => x.id === id);
    if (existing) { existing.note = note; existing.side = cd.side; existing.changeIdx = cd.changeIdx; }
    else d.candidates.push({ id, layer: cd.layer, domain: cd.domain, note, side: cd.side, changeIdx: cd.changeIdx });
    state.modal = null;
    state.cellDraft = null;
    render();
  }
  else if (a === 'drill-cell-del') {
    const cd = state.cellDraft;
    const d = state.drill;
    const id = `c${cd.layer}-${cd.domain}`;
    d.candidates = d.candidates.filter(x => x.id !== id);
    d.finalists = d.finalists.filter(x => x !== id);
    state.modal = null;
    state.cellDraft = null;
    render();
  }
  else if (a === 'drill-to-3') { state.drill.error = null; state.drill.stage = 3; render(); }
  else if (a === 'drill-stance') {
    if (state.drill.stance !== el.dataset.stance) {
      state.drill.stance = el.dataset.stance;
      state.drill.finalists = []; // 立場が変わったら選択をやり直す
    }
    render();
  }
  else if (a === 'drill-finalist') {
    const d = state.drill;
    const id = el.dataset.id;
    if (d.finalists.includes(id)) d.finalists = d.finalists.filter(x => x !== id);
    else if (d.finalists.length < 3) d.finalists.push(id);
    else { d.error = '選べるのは3つまでです。先にどれかのチェックを外してください'; render(); return; }
    d.error = null;
    render();
  }
  else if (a === 'drill-to-4') { drillGoStage4(); }
  else if (a === 'drill-judge') { doDrillJudge(); }
  else if (a === 'drill-essay') { doDrillEssay(); }
  else if (a === 'drill-open') { openDrillRecord(el.dataset.id); }
  else if (a === 'open-essay-drill') { openDrillRecord(el.dataset.id); }
  else if (a === 'drill-delete') {
    if (confirm('このドリル記録を削除しますか？')) {
      saveDrills(getDrills().filter(x => x.id !== el.dataset.id));
      render();
    }
  }
  else if (a === 'open-body-edit') {
    const bi = Number(el.dataset.body);
    const set = findSet(state.setId);
    if (!set) return;
    const vals = {};
    (set.bodies[bi].sentences || []).forEach((s, si) => {
      String(s).split(TPL_RE).forEach((seg, gi) => { if (gi % 2 === 0) vals[`fe-${si}-${gi}`] = seg.trim(); });
    });
    state.bodyEdit = { setId: set.id, bodyIdx: bi, vals, error: null };
    state.modal = 'bodyEdit';
    render();
    const focusId = el.dataset.focus; // 色付き部分を直接タップした場合はその入力欄へ
    if (focusId) {
      const inp = document.getElementById(focusId);
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
  }
  else if (a === 'body-edit-save') { applyBodyEdit(); }
  else if (a === 'switch-body2') { doSwitchBody2(el.dataset.target); }
  else if (a === 'open-rewrite-body') {
    const bi = Number(el.dataset.body);
    const set = findSet(state.setId);
    if (!set) return;
    state.bodyRewrite = { setId: set.id, bodyIdx: bi, text: '', busy: false, error: null };
    state.modal = 'bodyRewrite';
    render();
    const inp = document.getElementById('rewritePointInput');
    if (inp) inp.focus();
  }
  else if (a === 'rewrite-body-submit') { doRewriteBody(); }
  else if (a === 'undo-body') {
    const bi = Number(el.dataset.body);
    const sets = getSets();
    const set = sets.find(s => s.id === state.setId);
    const body = set && set.bodies[bi];
    if (body && body.original && confirm('この Body を元の模範解答に戻しますか？')) {
      body.argument = body.original.argument;
      body.sentences = body.original.sentences;
      body.ja = body.original.ja;
      body.mode = body.original.mode;
      delete body.original;
      set.evaluation = null; // 内容が変わったため採点をやり直す
      saveSetsList(sets);
      state.notice = '元の模範解答に戻しました。再採点します。';
      render();
      autoRescore(set.id);
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
    doGenerateEssay(state.pendingTheme, state.pendingStance);
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
  else if (a === 'go-home') { state.view = 'home'; render(); }
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
  else if (a === 'copy-essay') { doCopyEssay(el.dataset.id); }
  else if (a === 'eval-now') { runBackgroundEvaluation(el.dataset.id); }
  else if (a === 'regenerate-essay') { regenerateEssay(el.dataset.id); }
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
  if (ev.key === 'Enter' && ev.target.id === 'dcNote') {
    const btn = $app.querySelector('[data-action="drill-cell-save"]');
    if (btn) btn.click();
  }
  if (ev.key === 'Enter' && ev.target.id === 'rewritePointInput') {
    doRewriteBody();
  }
});

// 再レンダリングで入力値が失われないよう、編集モーダルの入力を state に同期する
$app.addEventListener('input', (ev) => {
  if (ev.target.id === 'chatInput') state.chatDraft = ev.target.value;
  if (ev.target.classList.contains('free-input') && state.bodyEdit) {
    state.bodyEdit.vals[ev.target.id] = ev.target.value;
  }
  // ドリルの各入力を state に同期
  if (ev.target.classList.contains('dr-ch') && state.drill) {
    const c = state.drill.changes[Number(ev.target.dataset.i)];
    if (c) c.text = ev.target.value;
  }
  if (ev.target.classList.contains('dr-fd') && state.drill) {
    const cid = ev.target.dataset.cid;
    state.drill.details[cid] = state.drill.details[cid] || {};
    state.drill.details[cid][ev.target.dataset.f] = ev.target.value;
  }
  if (ev.target.id === 'dcNote' && state.cellDraft) state.cellDraft.note = ev.target.value;
  if (ev.target.id === 'rewritePointInput' && state.bodyRewrite) state.bodyRewrite.text = ev.target.value;
});

// ドリルのセレクト（配役・譲歩素材）を state に同期
$app.addEventListener('change', (ev) => {
  if (ev.target.classList.contains('dr-cast') && state.drill) {
    state.drill.casting[Number(ev.target.dataset.bi)] = Number(ev.target.value);
  }
  if (ev.target.id === 'drillConcession' && state.drill) {
    state.drill.concession = ev.target.value;
  }
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
