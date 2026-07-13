/* サーバーレス関数（/api/generate）経由の Gemini 連携
   Gemini APIキーはサーバー側（Vercel 環境変数）にのみ存在し、
   ブラウザは合言葉（keyword）を添えてプロキシを呼び出す。 */

async function apiCall(payload, keywordOverride) {
  const keyword = keywordOverride !== undefined
    ? keywordOverride
    : (localStorage.getItem('et.keyword') || '');
  let res;
  try {
    res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, payload, { keyword })),
    });
  } catch (e) {
    throw new Error('サーバーに接続できません（Vercel 上で動作している必要があります）');
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* ignore */ }
  if (res.status === 401) {
    const err = new Error(data.error || 'キーワードが正しくありません');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  if (!res.ok) throw new Error(data.error || `サーバーエラー (${res.status})`);
  return data;
}

/* 合言葉の検証（正しければ true、違えば UNAUTHORIZED エラー） */
async function verifyKeyword(keyword) {
  await apiCall({ mode: 'verify' }, keyword);
  return true;
}

function cleanSlotValue(v) {
  return String(v || '').trim().replace(/[.。]+$/, '');
}

/* サーバーが整形して返す body（argument / sentences / ja）を検証・整形する */
function parseBody(b, i) {
  const argument = cleanSlotValue(b && b.argument);
  const sentences = (b && Array.isArray(b.sentences) ? b.sentences : [])
    .map(s => String(s || '').trim()).filter(Boolean);
  if (!argument || sentences.length < 3) {
    // アプリ更新直後に古いページがサーバーの新形式を受け取ると起きる
    throw new Error(`生成結果の形式が不正です（Body ${i + 1} の本文が揃っていません）。アプリが更新された直後の可能性があるため、ページを再読み込みしてからもう一度お試しください。`);
  }
  return { argument, sentences, ja: String((b && b.ja) || '').trim() };
}

async function generateEssaySet(theme, stance, userPoints) {
  const points = (userPoints || []).map(p => String(p).trim()).filter(Boolean).slice(0, 3);
  const data = await apiCall({ mode: 'essay', topic: theme.topic, stance, userPoints: points });
  if (!data || !Array.isArray(data.bodies) || data.bodies.length < 3) {
    throw new Error('生成結果の形式が不正です（Body が3つ揃っていません）');
  }
  const bodies = data.bodies.slice(0, 3).map(parseBody);
  return {
    id: 'gen-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    topic: theme.topic,
    topicJa: theme.topicJa || '',
    stance,
    source: 'gemini',
    createdAt: Date.now(),
    bodies,
    evaluation: data.evaluation || null,
    userPoints: points,
    pointsReview: Array.isArray(data.pointsReview) ? data.pointsReview : null,
  };
}

/* 生成済みエッセイの採点（生成とは別リクエストで、Gemini呼び出し1回のみ） */
async function evaluateEssaySet(set) {
  const data = await apiCall({ mode: 'evaluate', topic: set.topic, stance: set.stance, bodies: set.bodies });
  if (!data || !data.evaluation) throw new Error('採点結果の形式が不正です');
  return data.evaluation;
}

/* 論点だしトレーニングの反復練習（エッセイ本文は変更しない） */
async function reviewPoints(set, userPoints) {
  const points = (userPoints || []).map(p => String(p).trim()).filter(Boolean).slice(0, 3);
  const data = await apiCall({
    mode: 'reviewPoints',
    topic: set.topic,
    stance: set.stance,
    userPoints: points,
    existingReasons: set.bodies.map(b => b.argument),
  });
  if (!data || !Array.isArray(data.pointsReview) || !data.pointsReview.length) {
    throw new Error('判定結果の形式が不正です');
  }
  return { userPoints: points, pointsReview: data.pointsReview };
}

/* 論点だしトレーニングで作った論点を核に、Body 1本を丸ごと書き直す */
async function rewriteBodyWithPoint(set, bodyIndex, userPoint) {
  const data = await apiCall({ mode: 'rewriteBody', topic: set.topic, stance: set.stance, bodyIndex, userPoint });
  return parseBody(data, bodyIndex);
}

/* 採点・論点判定についてGeminiと会話する（履歴は呼び出し側が保持） */
async function chatWithGemini(set, history, message) {
  const data = await apiCall({
    mode: 'chat',
    topic: set.topic,
    stance: set.stance,
    bodies: set.bodies,
    evaluation: set.evaluation || null,
    pointsReview: set.pointsReview || null,
    history,
    message,
  });
  if (!data || !data.reply) throw new Error('応答の形式が不正です');
  return data.reply;
}

async function generateThemes(existingTopics) {
  const data = await apiCall({ mode: 'themes', existingTopics });
  if (!data || !Array.isArray(data.themes)) throw new Error('生成結果の形式が不正です');
  return data.themes
    .filter(t => t && t.topic)
    .map(t => ({
      topic: String(t.topic).trim(),
      topicJa: String(t.topicJa || '').trim(),
      category: CATEGORIES.includes(t.category) ? t.category : '社会',
    }));
}
