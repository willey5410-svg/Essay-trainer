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
  readRate: 'et.readRate',     // 音読の速さ
  readPitch: 'et.readPitch',   // 音読の声の高さ
  readVoice: 'et.readVoice',   // 音読の声（voice.name）
  readRepeat: 'et.readRepeat', // 音読の繰り返し回数
};

/* ---- 音読（読み上げ）設定の読み取り。未設定時は既定値にフォールバック ---- */
function readRate() { const v = parseFloat(localStorage.getItem(LS.readRate)); return isFinite(v) ? Math.min(2, Math.max(0.5, v)) : 0.95; }
function readPitch() { const v = parseFloat(localStorage.getItem(LS.readPitch)); return isFinite(v) ? Math.min(2, Math.max(0, v)) : 1.0; }
function readRepeat() { const v = parseInt(localStorage.getItem(LS.readRepeat), 10); return isFinite(v) ? Math.min(20, Math.max(1, v)) : 10; }
function readVoiceName() { return localStorage.getItem(LS.readVoice) || ''; }
function availableEnVoices() {
  const s = window.speechSynthesis;
  const vs = s && s.getVoices ? s.getVoices() : [];
  return vs.filter(v => /^en/i.test(v.lang));
}
/* 保存済みの声（無ければ en-US 優先の自動選択） */
function pickReadVoice() {
  const s = window.speechSynthesis;
  const vs = s && s.getVoices ? s.getVoices() : [];
  const name = readVoiceName();
  if (name) { const m = vs.find(v => v.name === name); if (m) return m; }
  return vs.find(v => /^en[-_]?US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
}

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
  showKeyword: false,   // 設定画面で合言葉を平文表示するか
  pendingTheme: null,
  pendingStance: null,
  themeAddError: null,
  themeDraft: { en: '', ja: '', cat: null },
  pasteDraft: { topic: '', topicJa: '', stance: 'agree', text: '' }, // 自作エッセイ貼り付けフォーム
  pasteError: null,
  loadingText: '',
  setId: null,
  showJa: {},
  error: null,
  notice: null,
  busyThemes: false,
  evaluatingSetId: null, // 採点をバックグラウンドで実行中のセットID
  readingSetId: null,    // 全文読み上げ中のセットID（Web Speech API）
  readingPass: 0,        // 読み上げの現在の周回数
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

/* 1文をHTMLへ：色分けはせず、そのまま表示する（本文の編集は「本文を編集」ボタンから）。 */
function renderSentence(s) {
  return esc(String(s));
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
  if (state.modal === 'pasteEssay') html += modalPasteEssay();
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
        <div class="set-sub">${esc(s.topicJa || '')} ${stanceBadge(s.stance)} ${s.source === 'gemini' ? '<span class="badge src">Gemini</span>' : s.source === 'self' ? '<span class="badge src">自作</span>' : '<span class="badge src">サンプル</span>'}</div>
      </div>
      <div class="set-side">
        ${s.pinned ? '<span class="cloud-badge" title="保護中（削除・再生成で消えません）">🔒 保護</span>' : ''}
        ${scoreBadge}
        ${s.pinned ? '' : `<button class="btn small ghost" data-action="delete-set" data-id="${esc(s.id)}">削除</button>`}
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
      <h2>✍️ 自分のエッセイを取り込む</h2>
      <p class="hint-text">自分で書いた Body 1〜3 を空行で区切って貼り付けると、同じ表示形式で取り込めます。取り込み後に「採点する」を押すと、観点（3観点）・主体×領域・スコアも埋まります。</p>
      <button class="btn wide ghost" data-action="open-paste-essay">＋ 本文を貼り付けて取り込む</button>
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
    const locked = !!set.pinned; // 保護中は本文を編集不可（タップ編集・書き直し・切替を無効化）
    const sentences = Array.isArray(body.sentences) ? body.sentences : [];
    const linesHtml = sentences.map((s, si) =>
      `<p class="study-line"><span class="fn-tag">${esc(role.functions[si] || '')}</span>${renderSentence(s)}</p>`
    ).join('');
    const wc = bodyText(body).split(/\s+/).filter(Boolean).length;
    const jaShown = state.showJa[bi];
    // Body 2 だけ「実証型 ⇄ 思考実験型」を切り替えられる（実例が浮かばないとき用）
    let switchBtn = '';
    if (bi === 1 && !locked) {
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
      ${jaShown && body.ja ? `<p class="ja-text${body.jaStale ? ' stale' : ''}">${body.jaStale ? '<span class="ja-stale-note">⚠️ 編集前の和訳です（再採点で編集後の内容に更新されます）</span>' : ''}${esc(body.ja)}</p>` : ''}
      <div class="row">
        ${locked ? '' : `<button class="btn small ghost" data-action="open-body-edit" data-body="${bi}">✏️ 本文を編集</button>`}
        ${locked ? '' : `<button class="btn small ghost" data-action="open-rewrite-body" data-body="${bi}">🔁 観点を指定して書き直す</button>`}
        ${switchBtn}
        ${body.ja ? `<button class="btn small ghost" data-action="toggle-ja" data-body="${bi}">${jaShown ? '和訳を隠す' : '和訳を表示'}</button>` : ''}
        ${locked || !body.prev ? '' : `<button class="btn small ghost" data-action="undo-last" data-body="${bi}">↩️ 直前に戻す</button>`}
        ${locked || !body.original ? '' : `<button class="btn small ghost" data-action="undo-body" data-body="${bi}">元の模範解答に戻す</button>`}
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
        <button class="btn small ${set.pinned ? '' : 'ghost'}" data-action="toggle-pin" data-id="${esc(set.id)}">${set.pinned ? '🔒 保護中（解除）' : '🔓 保護する'}</button>
        <button class="btn small ghost" data-action="copy-essay" data-id="${esc(set.id)}">📋 全文コピー</button>
        ${('speechSynthesis' in window) ? `<button class="btn small ghost" data-action="read-essay" data-id="${esc(set.id)}">${state.readingSetId === set.id ? `⏹ 読み上げを停止（${state.readingPass}/${readRepeat()}）` : `🔊 全文読み上げ（${readRepeat()}回）`}</button>` : ''}
        ${set.source === 'gemini' && !set.pinned ? `<button class="btn small ghost" data-action="regenerate-essay" data-id="${esc(set.id)}">🔄 別パターンで再生成</button>` : ''}
        ${DRILL_ENABLED && set.drillId && getDrills().some(d => d.id === set.drillId) ? `<button class="btn small ghost" data-action="open-essay-drill" data-id="${esc(set.drillId)}">🧠 元の観点だしドリルを見る</button>` : ''}
        <button class="btn small ghost" data-action="open-chat" data-id="${esc(set.id)}">💬 Geminiに質問する</button>
      </div>
      ${set.pinned ? '<p class="hint-text">🔒 このエッセイは保護中です。再生成・削除で消えません（保護を解除すると通常どおり操作できます）。</p>' : ''}
    </div>
    ${argSummaryCard(set)}
    <p class="hint-text">3つの Body は役割が異なります（<strong>因果必然</strong>／<strong>実証</strong>／<strong>譲歩反駁</strong>）。文頭のラベルは各文の機能です。<strong>「✏️ 本文を編集」</strong>から<strong>全文を自由に修正</strong>でき、保存すると再採点され、和訳も編集後の内容に更新されます。</p>
    ${evalSection(set)}
    ${bodiesHtml}
    <div class="card memo-card">
      <div class="body-head"><h3>📝 メモ</h3><span class="stat">自動保存</span></div>
      <textarea id="essayMemo" class="memo-input" data-id="${esc(set.id)}" rows="4" placeholder="このエッセイについてのメモ（覚えた表現、改善点、次回の狙いなど）。入力すると自動で保存されます。">${esc(set.memo || '')}</textarea>
    </div>`;
}

/* 各 Body の観点（argument）を役割・2軸分類（主体×領域）とともに一覧表示する */
function argSummaryCard(set) {
  const items = set.bodies.map((b, i) => {
    const role = roleForBody(i, b);
    const layerJa = argLayerJa(b.axisLayer);
    const domainJa = argDomainJa(b.axisDomain);
    const axisLabel = (layerJa && domainJa) ? `${layerJa}×${domainJa}` : (layerJa || domainJa);
    const axisTags = axisLabel
      ? `<div class="arg-axes"><span class="badge axis">${esc(axisLabel)}</span></div>`
      : '';
    return `<li><span class="arg-role">${role.name}</span> <span class="badge src">${esc(role.type)}</span>
      <div class="arg-text">${esc(b.argument || '（観点未設定）')}</div>${axisTags}</li>`;
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

/* 音読設定（速さ・声の高さ・声・繰り返し回数＋テスト再生） */
function modalReadSettings() {
  if (!('speechSynthesis' in window)) {
    return '<p class="hint-text">このブラウザは読み上げ（音声合成）に対応していません。</p>';
  }
  const voices = availableEnVoices();
  const curVoice = readVoiceName();
  const voiceOpts = ['<option value="">自動（en-US を優先）</option>']
    .concat(voices.map(v => `<option value="${esc(v.name)}" ${v.name === curVoice ? 'selected' : ''}>${esc(v.name)}（${esc(v.lang)}）</option>`))
    .join('');
  const repeatOpts = [1, 2, 3, 5, 10, 15, 20]
    .map(n => `<option value="${n}" ${readRepeat() === n ? 'selected' : ''}>${n}回</option>`).join('');
  return `
    <div class="read-setting">
      <span>速さ <b id="rateVal">${readRate().toFixed(2)}</b></span>
      <input type="range" id="readRate" min="0.5" max="1.5" step="0.05" value="${readRate()}">
    </div>
    <div class="read-setting">
      <span>声の高さ <b id="pitchVal">${readPitch().toFixed(2)}</b></span>
      <input type="range" id="readPitch" min="0.5" max="1.5" step="0.05" value="${readPitch()}">
    </div>
    <label class="sub">声（ブラウザ・端末により異なります）</label>
    <select id="readVoice">${voiceOpts}</select>
    ${voices.length === 0 ? '<p class="hint-text">利用可能な英語音声が読み込まれていません。少し待つか、端末に英語音声を追加してください。</p>' : ''}
    <label class="sub">繰り返し回数</label>
    <select id="readRepeat">${repeatOpts}</select>
    <div class="row">
      <button class="btn small ghost" data-action="test-read" type="button">🔊 テスト再生</button>
      <button class="btn small ghost" data-action="test-read-stop" type="button">⏹ 停止</button>
    </div>`;
}

function modalSettings() {
  return `<div class="overlay" data-action="close-modal">
    <div class="modal" data-stop>
      <h3>設定</h3>
      <label>合言葉（キーワード）</label>
      <div class="row">
        <input type="${state.showKeyword ? 'text' : 'password'}" id="inpKeyword" value="${esc(localStorage.getItem(LS.keyword) || '')}" placeholder="合言葉を入力">
        <button class="btn small ghost" data-action="toggle-keyword-vis" type="button">${state.showKeyword ? '🙈 隠す' : '👁 表示'}</button>
      </div>
      ${state.keywordError ? `<p class="field-error">${esc(state.keywordError)}</p>` : ''}
      <p class="hint-text">Gemini での生成に必要な合言葉です。確認のうえこの端末に保存されます。「👁 表示」で保存済みの合言葉を確認できます。</p>
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
      <label>音読（全文読み上げ）</label>
      ${modalReadSettings()}
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

/* ---------- 本文の手直し（全文編集） ---------- */

function modalBodyEdit() {
  const be = state.bodyEdit;
  const set = findSet(be.setId);
  if (!set) return '';
  const body = set.bodies[be.bodyIdx];
  const role = roleForBody(be.bodyIdx, body);
  const linesHtml = (body.sentences || []).map((s, si) => {
    const id = `es-${si}`;
    const val = (be.vals && id in be.vals) ? be.vals[id] : String(s);
    return `<div class="edit-line">
      <label class="fn-tag" for="${id}">${esc(role.functions[si] || `文${si + 1}`)}</label>
      <textarea class="sent-input" id="${id}" rows="2" spellcheck="false">${esc(val)}</textarea>
    </div>`;
  }).join('');
  return `<div class="overlay" data-action="close-modal">
    <div class="modal" data-stop>
      <h3>✏️ ${role.name} の本文を編集</h3>
      <p class="hint-text">各文を全文そのまま自由に書き換えられます（定型表現も含めてすべて編集できます）。保存すると採点をやり直し、和訳も編集後の内容に作り直します（元に戻すこともできます）。</p>
      ${linesHtml}
      ${be.error ? `<p class="field-error">${esc(be.error)}</p>` : ''}
      <div class="row">
        <button class="btn" data-action="body-edit-save">保存して採点</button>
        <button class="btn ghost" data-action="close-modal">キャンセル</button>
      </div>
    </div>
  </div>`;
}

/* Body の内容（本文・観点・和訳・型・模範解答スナップショット）を1つのオブジェクトに写す。
   prev 自身は含めない（履歴の入れ子を防ぐ）。 */
function bodySnapshot(body) {
  return {
    argument: body.argument,
    sentences: (body.sentences || []).slice(),
    ja: body.ja || '',
    jaStale: !!body.jaStale, // 和訳が本文より古いかどうかも一緒に持ち回る
    mode: body.mode,
    original: body.original ? Object.assign({}, body.original) : undefined,
  };
}

/* 変更を加える直前に「1つ前の状態」を prev に退避する（直前に戻す＝取り消しの取り消し用）。 */
function snapshotPrev(body) {
  body.prev = bodySnapshot(body);
}

/* Body を書き換える（編集・書き直し・型切替）直前の共通処理：
   直前状態を prev に退避し、初回だけ「生成直後の原文」を original に退避する。 */
function beginBodyMutation(body) {
  snapshotPrev(body);
  if (!body.original) body.original = { argument: body.argument, sentences: body.sentences, ja: body.ja || '', mode: body.mode };
}

/* 現在の状態と prev を入れ替える（もう一度押すと元に戻る＝二段のトグル）。 */
function swapPrev(body) {
  if (!body.prev) return;
  const cur = bodySnapshot(body);
  const p = body.prev;
  body.argument = p.argument;
  body.sentences = p.sentences;
  body.ja = p.ja;
  if (p.jaStale) body.jaStale = true; else delete body.jaStale;
  body.mode = p.mode;
  if (p.original) body.original = p.original; else delete body.original;
  body.prev = cur; // 押し直しで戻れるように現在の状態を保持
}

function applyBodyEdit() {
  const be = state.bodyEdit;
  if (!be) return;
  const sets = getSets();
  const set = sets.find(s => s.id === be.setId);
  if (!set) return;
  const body = set.bodies[be.bodyIdx];
  const newSentences = (body.sentences || []).map((s, si) => {
    const id = `es-${si}`;
    const dom = document.getElementById(id);
    const raw = dom ? dom.value : (be.vals && id in be.vals ? be.vals[id] : s);
    return String(raw).replace(/\s+/g, ' ').trim(); // 改行・連続空白を1つに詰める
  });
  if (newSentences.some(s => !s)) {
    be.error = '空になった文があります。各文に内容を入力してください。';
    render();
    return;
  }
  beginBodyMutation(body); // 直前状態を退避し、初回だけ原文を保持
  body.sentences = newSentences;
  // 和訳は本文と食い違った状態になる。再採点（evaluate）が本文に合わせて作り直すまで、
  // 「編集前の和訳」であることを画面に示すための印を立てておく。
  if (body.ja) body.jaStale = true;
  set.evaluation = null; // 内容が変わったため採点をやり直す
  saveSetsList(sets);
  state.modal = null;
  state.bodyEdit = null;
  state.notice = `${(BODY_ROLES[be.bodyIdx] || {}).name || 'Body'} を編集しました。再採点し、和訳も編集後の内容に更新します。`;
  render();
  autoRescore(set.id);
}

/* 合言葉があれば採点をバックグラウンドで走らせる（無ければ「採点する」ボタンから手動実行） */
function autoRescore(setId) {
  if (localStorage.getItem(LS.keyword)) runBackgroundEvaluation(setId);
}

/* 合言葉が未入力なら合言葉モーダルを開いて true を返す（呼び出し側は return する）。 */
function requireKeyword(message) {
  if (localStorage.getItem(LS.keyword)) return false;
  state.modal = 'keyword';
  state.keywordError = message;
  render();
  return true;
}

/* 401（合言葉不一致）時：合言葉をクリアして再入力を促す状態にする（render はしない）。 */
function authErrorState(message) {
  localStorage.removeItem(LS.keyword);
  state.modal = 'keyword';
  state.keywordError = message || '合言葉が正しくありません。もう一度入力してください。';
}

/* Body 1〜3 の全文（段落を空行で区切る）をクリップボードにコピーする。
   和訳（body.ja）があれば、各段落の直後に「【和訳】…」として一緒にコピーする。 */
async function doCopyEssay(setId) {
  const set = findSet(setId);
  if (!set) return;
  let hasJa = false;
  const text = set.bodies.map(b => {
    const en = bodyText(b);
    if (!en) return '';
    const ja = String((b && b.ja) || '').trim();
    if (!ja) return en;
    hasJa = true;
    return `${en}\n【和訳】${ja}`;
  }).filter(Boolean).join('\n\n');
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
  state.notice = ok ? (hasJa ? 'Body 1〜3 の全文と和訳をコピーしました' : 'Body 1〜3 の全文をコピーしました') : null;
  render();
}

/* 読み上げを停止する（Web Speech API のキューを破棄） */
function stopReading() {
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  state.readingSetId = null;
  state.readingPass = 0;
}

/* Body 1〜3 の全文を英語で設定回数くり返し読み上げる。読み上げ中に
   再度押すと停止（トグル）。長文が途中で切れるブラウザ対策として、文単位に
   分割して順に読む。速さ・声の高さ・声・回数は設定から反映する。 */
function doReadEssay(setId) {
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    state.error = 'このブラウザは読み上げ（音声合成）に対応していません。';
    render();
    return;
  }
  if (state.readingSetId) { // すでに読み上げ中 → 停止
    stopReading();
    render();
    return;
  }
  const set = findSet(setId);
  if (!set) return;
  const sentences = [];
  set.bodies.forEach(b => (b.sentences || []).forEach(s => {
    const t = String(s).trim();
    if (t) sentences.push(t);
  }));
  if (!sentences.length) return;

  const enVoice = pickReadVoice();
  const rate = readRate();
  const pitch = readPitch();
  const repeat = readRepeat(); // 開始時の設定で固定（読み上げ中の変更は次回反映）

  synth.cancel(); // 念のため既存キューを破棄
  state.readingSetId = setId;
  state.readingPass = 1; // 現在何周目か（1〜repeat）
  state.error = null;
  render();

  let idx = 0;
  let pass = 1;
  const speakNext = () => {
    // ユーザーが停止した／別セットに切り替わったら中断
    if (state.readingSetId !== setId) return;
    if (idx >= sentences.length) {
      if (pass >= repeat) { // 全周終了
        state.readingSetId = null;
        state.readingPass = 0;
        render();
        return;
      }
      pass += 1; // 次の周へ
      idx = 0;
      state.readingPass = pass;
      render();
    }
    const u = new SpeechSynthesisUtterance(sentences[idx++]);
    u.lang = 'en-US';
    if (enVoice) u.voice = enVoice;
    u.rate = rate;
    u.pitch = pitch;
    u.onend = speakNext;
    u.onerror = () => {
      if (state.readingSetId === setId) { state.readingSetId = null; state.readingPass = 0; render(); }
    };
    synth.speak(u);
  };
  speakNext();
}

/* 設定画面：現在の音読設定で短いサンプルを再生する */
function testRead() {
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    state.error = 'このブラウザは読み上げ（音声合成）に対応していません。';
    render();
    return;
  }
  synth.cancel();
  const u = new SpeechSynthesisUtterance('This is a sample of the reading voice for your essay.');
  u.lang = 'en-US';
  const v = pickReadVoice();
  if (v) u.voice = v;
  u.rate = readRate();
  u.pitch = readPitch();
  synth.speak(u);
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
  if (requireKeyword('書き直しには合言葉の入力が必要です')) return;
  br.busy = true;
  br.error = null;
  render();
  try {
    const nb = await rewriteBodyWithPoint(findSet(br.setId), br.bodyIdx, point);
    const sets = getSets();
    const s2 = sets.find(s => s.id === br.setId);
    const body = s2.bodies[br.bodyIdx];
    beginBodyMutation(body);
    body.argument = nb.argument;
    body.sentences = nb.sentences;
    body.ja = nb.ja;
    delete body.jaStale; // 書き直しでは和訳も一緒に作り直されている
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
    if (e.code === 'UNAUTHORIZED') { authErrorState(); state.bodyRewrite = null; render(); return; }
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
  if (set.pinned) { state.notice = '保護中のエッセイは変更できません。先に保護を解除してください。'; render(); return; }
  if (requireKeyword('型の切り替えには合言葉の入力が必要です')) return;
  state.switchingBody2 = true;
  state.error = null;
  render();
  try {
    const nb = await switchBody2Mode(set, targetMode);
    const sets = getSets();
    const s2 = sets.find(s => s.id === set.id);
    const body = s2.bodies[1];
    beginBodyMutation(body);
    body.argument = nb.argument;
    body.sentences = nb.sentences;
    body.ja = nb.ja;
    delete body.jaStale; // 型の切り替えでは和訳も一緒に作り直されている
    body.mode = nb.mode;
    s2.evaluation = null; // 内容が変わったため採点をやり直す
    saveSetsList(sets);
    state.notice = `Body 2 を${nb.mode === 'scenario' ? '思考実験型（例が不要）' : '実証型'}に変えました。再採点します。`;
    state.switchingBody2 = false;
    render();
    autoRescore(s2.id);
    return;
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') authErrorState(); else {
      state.error = '型の切り替えに失敗しました：' + e.message;
    }
  }
  state.switchingBody2 = false;
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
  if (requireKeyword('チャットには合言葉の入力が必要です')) return;
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
    if (e.code === 'UNAUTHORIZED') { authErrorState(); state.chatBusy = false; render(); return; }
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

/* 自作エッセイの貼り付けフォーム */
function modalPasteEssay() {
  const d = state.pasteDraft;
  return `<div class="overlay" data-action="close-modal">
    <div class="modal" data-stop>
      <h3>✍️ 自分のエッセイを貼り付け</h3>
      <p class="hint-text">本論の <strong>Body 1〜3</strong> を、段落の間を<strong>空行</strong>で区切って貼り付けてください（導入・結論は除く）。各段落は文ごとに分割され、今の表示形式で保存されます。取り込み後に「採点する」で観点・主体×領域・スコアが付きます。</p>
      <label>お題（英語・任意）</label>
      <input type="text" id="pasteTopic" value="${esc(d.topic)}" placeholder="例：Should Japan accept more immigrants?">
      <label>お題の日本語訳（任意）</label>
      <input type="text" id="pasteTopicJa" value="${esc(d.topicJa)}" placeholder="例：日本はより多くの移民を受け入れるべきか">
      <label>立場</label>
      <select id="pasteStance">
        <option value="agree"${d.stance === 'agree' ? ' selected' : ''}>賛成（YES）</option>
        <option value="disagree"${d.stance === 'disagree' ? ' selected' : ''}>反対（NO）</option>
      </select>
      <label>本文（Body 1〜3 を空行で区切る）</label>
      <textarea id="pasteText" class="paste-input" rows="10" spellcheck="false" placeholder="First of all, …（Body 1）&#10;&#10;Secondly, …（Body 2）&#10;&#10;Finally, …（Body 3）">${esc(d.text)}</textarea>
      ${state.pasteError ? `<p class="field-error">${esc(state.pasteError)}</p>` : ''}
      <div class="row">
        <button class="btn" data-action="paste-essay-submit">取り込む</button>
        <button class="btn ghost" data-action="close-modal">キャンセル</button>
      </div>
    </div>
  </div>`;
}

function doCreateFromPaste() {
  const val = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
  const topic = val('pasteTopic').trim();
  const topicJa = val('pasteTopicJa').trim();
  const stance = val('pasteStance') === 'disagree' ? 'disagree' : 'agree';
  const text = val('pasteText');
  state.pasteDraft = { topic, topicJa, stance, text }; // 再描画で入力が消えないよう保持

  // 空行で段落（Body）に分割
  const paras = text.split(/\n\s*\n+/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (paras.length !== 3) {
    state.pasteError = `Body 1〜3 を空行で区切って3段落で貼り付けてください（現在 ${paras.length} 段落を検出）。`;
    render();
    return;
  }
  // 各段落を文単位に分割（.?! の後ろで区切る）
  const splitSentences = (p) => p.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const bodies = paras.map(p => {
    const sentences = splitSentences(p);
    return { argument: '', sentences: sentences.length ? sentences : [p], ja: '' };
  });

  const set = {
    id: 'own-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    topic: topic || '自作エッセイ',
    topicJa,
    stance,
    source: 'self',
    createdAt: Date.now(),
    bodies,
    evaluation: null,
  };
  const sets = getSets();
  sets.unshift(set);
  saveSetsList(sets);
  state.modal = null;
  state.pasteError = null;
  state.pasteDraft = { topic: '', topicJa: '', stance: 'agree', text: '' };
  state.setId = set.id;
  state.showJa = {};
  state.view = 'study';
  state.notice = '自作エッセイを取り込みました。「この構成を採点する」で観点・主体×領域・スコアを付けられます。';
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
      const { evaluation, arguments: args, axes, translations: trans } = await evaluateEssaySet(set);
      const sets = getSets();
      const s2 = sets.find(s => s.id === setId);
      if (s2) {
        s2.evaluation = evaluation;
        // 「この構成の3観点」を本文に合わせて最新化（採点結果に相乗り、追加の呼び出しなし）
        if (Array.isArray(args) && args.length === 3) {
          args.forEach((a, i) => { if (a && s2.bodies[i]) s2.bodies[i].argument = a; });
        }
        // 各観点を2軸（主体×領域）で分類してタグ付け
        if (Array.isArray(axes) && axes.length === 3) {
          axes.forEach((ax, i) => {
            if (ax && s2.bodies[i]) { s2.bodies[i].axisLayer = ax.layer || null; s2.bodies[i].axisDomain = ax.domain || null; }
          });
        }
        // 和訳も本文（編集後の内容）に合わせて最新化し、「編集前の和訳」の印を外す
        if (Array.isArray(trans) && trans.length === 3) {
          trans.forEach((t, i) => {
            if (t && s2.bodies[i]) { s2.bodies[i].ja = t; delete s2.bodies[i].jaStale; }
          });
        }
        saveSetsList(sets);
      }
    }
  } catch (e) {
    failure = e;
  }
  state.evaluatingSetId = null;
  // 失敗時は静かに諦めず、理由を伝える（合言葉切れ・クオータ超過などで
  // 「採点する」を押しても画面が変わらない、という状態を防ぐ）
  if (failure) {
    if (failure.code === 'UNAUTHORIZED') authErrorState('採点には合言葉が必要です。もう一度入力してください。');
    else state.error = '採点に失敗しました：' + failure.message;
  }
  if (state.view === 'study' && state.setId === setId) render();
  else if (failure) render();
}

/* 同じテーマ・スタンスで作り直す（現在の構成は削除して差し替える） */
function regenerateEssay(setId) {
  const set = findSet(setId);
  if (!set) return;
  if (set.pinned) { state.notice = '保護中のエッセイは再生成できません。先に保護を解除してください。'; render(); return; }
  if (!confirm('この構成を削除し、同じテーマ・立場で新しく作り直しますか？')) return;
  saveSetsList(getSets().filter(s => s.id !== setId));
  doGenerateEssay({ topic: set.topic, topicJa: set.topicJa }, set.stance);
}

async function doGenerateEssay(theme, stance, worksheet, drillId) {
  if (requireKeyword('エッセイ生成には合言葉の入力が必要です')) return;
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
    if (e.code === 'UNAUTHORIZED') authErrorState(); else {
      state.error = '生成に失敗しました：' + e.message;
    }
  }
  render();
}

async function doGenerateThemes() {
  if (requireKeyword('テーマ生成には合言葉の入力が必要です')) return;
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
    if (e.code === 'UNAUTHORIZED') authErrorState(); else {
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
  if (handleDrillAction(a, el)) return; // ドリル関連は drill.js に委譲

  if (a === 'open-settings') { state.modal = 'settings'; state.keywordError = null; state.showKeyword = false; render(); }
  else if (a === 'toggle-keyword-vis') {
    // 入力欄の内容を保持するため、再描画せず type だけ切り替える
    state.showKeyword = !state.showKeyword;
    const inp = document.getElementById('inpKeyword');
    if (inp) inp.type = state.showKeyword ? 'text' : 'password';
    el.textContent = state.showKeyword ? '🙈 隠す' : '👁 表示';
  }
  else if (a === 'test-read') { testRead(); }
  else if (a === 'test-read-stop') { try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {} }
  else if (a === 'close-modal') {
    state.modal = null; state.keywordError = null;
    state.bodyEdit = null; state.chatError = null; state.cellDraft = null;
    state.bodyRewrite = null; state.pasteError = null;
    render();
  }
  else if (a === 'open-body-edit') {
    const bi = Number(el.dataset.body);
    const set = findSet(state.setId);
    if (!set) return;
    if (set.pinned) { state.notice = '保護中のエッセイは本文を編集できません。先に保護を解除してください。'; render(); return; }
    const vals = {};
    (set.bodies[bi].sentences || []).forEach((s, si) => { vals[`es-${si}`] = String(s); });
    state.bodyEdit = { setId: set.id, bodyIdx: bi, vals, error: null };
    state.modal = 'bodyEdit';
    render();
    const focusId = el.dataset.focus; // タップした文の入力欄へ
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
    if (set.pinned) { state.notice = '保護中のエッセイは書き直せません。先に保護を解除してください。'; render(); return; }
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
    if (set && set.pinned) { state.notice = '保護中のエッセイは変更できません。先に保護を解除してください。'; render(); return; }
    const body = set && set.bodies[bi];
    if (body && body.original && confirm('この Body を生成直後の模範解答に戻します。今の編集内容は失われます（「↩️ 直前に戻す」で1回だけ元に戻せます）。よろしいですか？')) {
      snapshotPrev(body); // 直前（編集済み）の状態を退避して「直前に戻す」で復帰できるようにする
      body.argument = body.original.argument;
      body.sentences = body.original.sentences;
      body.ja = body.original.ja;
      delete body.jaStale; // 模範解答の和訳は本文と対応している
      body.mode = body.original.mode;
      delete body.original;
      set.evaluation = null; // 内容が変わったため採点をやり直す
      saveSetsList(sets);
      state.notice = '元の模範解答に戻しました。再採点します。（「↩️ 直前に戻す」で編集内容に復帰できます）';
      render();
      autoRescore(set.id);
    }
  }
  else if (a === 'undo-last') {
    const bi = Number(el.dataset.body);
    const sets = getSets();
    const set = sets.find(s => s.id === state.setId);
    if (set && set.pinned) { state.notice = '保護中のエッセイは変更できません。先に保護を解除してください。'; render(); return; }
    const body = set && set.bodies[bi];
    if (body && body.prev) {
      swapPrev(body); // 現在 ⇄ 直前 を入れ替え（もう一度押すと戻る）
      set.evaluation = null; // 内容が変わったため採点をやり直す
      saveSetsList(sets);
      state.notice = '直前の状態に戻しました。再採点します。（もう一度押すと元に戻ります）';
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
  else if (a === 'open-paste-essay') { state.pasteError = null; state.modal = 'pasteEssay'; render(); }
  else if (a === 'paste-essay-submit') { doCreateFromPaste(); }
  else if (a === 'delete-theme') { deleteTheme(Number(el.dataset.idx)); }
  else if (a === 'restore-themes') {
    saveHiddenThemes([]);
    state.notice = '非表示にしていたプリセットテーマを復元しました';
    render();
  }
  else if (a === 'choose-stance') {
    if (requireKeyword('エッセイ生成には合言葉の入力が必要です')) return;
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
  else if (a === 'toggle-pin') {
    const sets = getSets();
    const set = sets.find(s => s.id === el.dataset.id);
    if (set) {
      set.pinned = !set.pinned;
      saveSetsList(sets);
      state.notice = set.pinned
        ? 'このエッセイを保護しました。再生成・削除では消えません。'
        : '保護を解除しました。';
      render();
    }
  }
  else if (a === 'delete-set') {
    const set = findSet(el.dataset.id);
    if (set && set.pinned) { state.notice = '保護中のエッセイは削除できません。先に保護を解除してください。'; render(); return; }
    if (set && confirm(`「${set.topic}」を削除しますか？`)) {
      saveSetsList(getSets().filter(s => s.id !== el.dataset.id));
      render();
    }
  }
  else if (a === 'go-home') { stopReading(); state.view = 'home'; render(); }
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
  else if (a === 'read-essay') { doReadEssay(el.dataset.id); }
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
  if (ev.target.classList.contains('sent-input') && state.bodyEdit) {
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
  // エッセイのメモを自動保存（再描画せず、フォーカスを保つ）
  if (ev.target.id === 'essayMemo') {
    const sets = getSets();
    const s = sets.find(x => x.id === ev.target.dataset.id);
    if (s) { s.memo = ev.target.value; saveSetsList(sets); }
  }
  // 音読の速さ・声の高さは即保存し、表示値だけ更新する（スライダーを飛ばさない）
  if (ev.target.id === 'readRate') {
    localStorage.setItem(LS.readRate, ev.target.value);
    const b = document.getElementById('rateVal'); if (b) b.textContent = Number(ev.target.value).toFixed(2);
  }
  if (ev.target.id === 'readPitch') {
    localStorage.setItem(LS.readPitch, ev.target.value);
    const b = document.getElementById('pitchVal'); if (b) b.textContent = Number(ev.target.value).toFixed(2);
  }
});

// ドリルのセレクト（配役・譲歩素材）を state に同期
$app.addEventListener('change', (ev) => {
  if (ev.target.classList.contains('dr-cast') && state.drill) {
    state.drill.casting[Number(ev.target.dataset.bi)] = Number(ev.target.value);
  }
  if (ev.target.id === 'drillConcession' && state.drill) {
    state.drill.concession = ev.target.value;
  }
  if (ev.target.id === 'readVoice') localStorage.setItem(LS.readVoice, ev.target.value);
  if (ev.target.id === 'readRepeat') localStorage.setItem(LS.readRepeat, ev.target.value);
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

// 音声リストは非同期で読み込まれる。読み込まれたら設定画面を再描画して声の一覧を反映する。
if (window.speechSynthesis) {
  try { window.speechSynthesis.getVoices(); } catch (e) { /* prompt loading */ }
  if (typeof window.speechSynthesis.addEventListener === 'function') {
    window.speechSynthesis.addEventListener('voiceschanged', () => { if (state.modal === 'settings') render(); });
  }
}
