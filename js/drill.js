/* 観点だしドリル（マトリクス走査）サブシステム — 現在 DRILL_ENABLED=false で非公開。
   app.js のグローバル（state, render, esc, findSet, getSets, saveSetsList, getDrills,
   saveDrills, visibleThemes, requireKeyword, authErrorState, doGenerateEssay 等）、
   gemini.js のドリル用ラッパ、templates.js の DRILL_* 定数に依存する。いずれも呼び出し時
   （全スクリプト読込後）に解決されるため、このファイルは app.js より前後どちらで読み込んでもよい。 */

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
  if (requireKeyword('増減リストの生成には合言葉の入力が必要です')) return;
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
    if (e.code === 'UNAUTHORIZED') authErrorState(); else {
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
  if (requireKeyword('走査の生成には合言葉の入力が必要です')) return;
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
    if (e.code === 'UNAUTHORIZED') authErrorState(); else {
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
  if (requireKeyword('フィルタの生成には合言葉の入力が必要です')) return;
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
    if (e.code === 'UNAUTHORIZED') authErrorState(); else {
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
  if (requireKeyword('講評には合言葉の入力が必要です')) return;
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
    if (e.code === 'UNAUTHORIZED') authErrorState();
    else d.error = '講評に失敗しました：' + e.message;
    d.stage = 4;
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

/* ドリル関連のクリックを処理する。処理したら true、非対象なら false を返す。 */
function handleDrillAction(a, el) {
  const DRILL_ACTIONS = new Set(['drill-start', 'drill-quit', 'drill-restart', 'drill-add-change', 'drill-fill-changes', 'drill-fill-scan', 'drill-fill-filter', 'drill-del-change', 'drill-toggle-change', 'drill-to-2', 'drill-back', 'drill-goto', 'drill-cell', 'drill-cell-change', 'drill-cell-side', 'drill-cell-save', 'drill-cell-del', 'drill-to-3', 'drill-stance', 'drill-finalist', 'drill-to-4', 'drill-judge', 'drill-essay', 'drill-open', 'open-essay-drill', 'drill-delete']);
  if (!DRILL_ACTIONS.has(a)) return false;
    if (a === 'drill-start') {
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
  return true;
}
