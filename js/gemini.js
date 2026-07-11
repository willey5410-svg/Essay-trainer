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

async function generateEssaySet(theme, stance) {
  const data = await apiCall({ mode: 'essay', topic: theme.topic, stance });
  if (!data || !Array.isArray(data.bodies) || data.bodies.length < 3) {
    throw new Error('生成結果の形式が不正です（Body が3つ揃っていません）');
  }
  const bodies = data.bodies.slice(0, 3).map((b, i) => {
    const slots = {};
    for (const key of SLOT_KEYS) {
      const v = cleanSlotValue(b.slots && b.slots[key]);
      if (!v) throw new Error(`生成結果の形式が不正です（Body ${i + 1} の ${key} が空です）`);
      slots[key] = v;
    }
    return { slots, ja: String(b.ja || '').trim() };
  });
  return {
    id: 'gen-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    topic: theme.topic,
    topicJa: theme.topicJa || '',
    stance,
    source: 'gemini',
    createdAt: Date.now(),
    bodies,
    evaluation: data.evaluation || null,
  };
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
