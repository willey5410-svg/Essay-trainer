/* Vercel サーバーレス関数：Gemini API プロキシ
   - APIキーは環境変数 GEMINI_API_KEY にのみ保持し、ブラウザには渡さない
   - リクエストは環境変数 APP_KEYWORD と一致する合言葉（keyword）を要求する
   環境変数:
     GEMINI_API_KEY  … Google AI Studio の API キー（必須）
     APP_KEYWORD     … アプリ利用時の合言葉（必須）
     GEMINI_MODEL    … 使用モデル（省略時 gemini-2.5-flash） */

const crypto = require('crypto');

const DEFAULT_MODEL = 'gemini-2.5-flash';

function buildEssayPrompt(topic, stance) {
  const stanceText = stance === 'agree'
    ? 'AGREE — support the statement / answer YES'
    : 'DISAGREE — oppose the statement / answer NO';
  return `You are an expert writing coach for the EIKEN Grade 1 English essay.

TOPIC: ${topic}
STANCE: ${stanceText}

Create the content of THREE body paragraphs, each presenting a DIFFERENT argument supporting the stance.
Do NOT write free-form paragraphs. Instead, fill the slots of the following fixed templates so that each assembled paragraph reads as natural, formal written English.

Body 1 template:
"First and foremost, {reason} is a critical factor that must be considered. This is because {principle}. In essence, when {condition}, it inevitably leads to {result}. A prominent example is seen in {example}, which {explanation}. Therefore, it is evident that {keyConcept} plays a decisive role in {conclusion}."

Body 2 template:
"Another important consideration is {reason}. This stems from the fact that {principle}. Put simply, whenever {condition}, it tends to result in {result}. For instance, {example}, demonstrating how {explanation}. Hence, it is clear that {keyConcept} is essential for {conclusion}."

Body 3 template:
"A further point is {reason}. The primary reason for this is that {principle}. In other words, if {condition}, this can lead to {result}. Evidence for this can be found in {example}, where {explanation}. Accordingly, {keyConcept} plays a vital role in {conclusion}."

Grammar constraints for the slots (CRITICAL — each value must fit its template grammatically):
- reason: a noun phrase, preferably a gerund or nominalized action (e.g. "the replacement of human labor by AI")
- principle: a full clause with subject and verb (follows "because" / "the fact that")
- condition: a clause with subject and verb, NO leading conjunction (follows "when" / "whenever" / "if")
- result: a noun phrase (follows "leads to" / "result in")
- example (Body 1): a noun phrase; explanation (Body 1): a predicate verb phrase continuing "which ..." and agreeing with the example in number
- example (Body 2): a FULL independent clause with subject and verb; explanation (Body 2): a clause following "how"
- example (Body 3): a noun phrase naming a country, industry, field, or organization; explanation (Body 3): a clause following "where"
- keyConcept: a short noun phrase
- conclusion: a gerund phrase or noun phrase (follows "in" / "for")

Word-count constraint (STRICT, HIGHEST PRIORITY):
- The total word count of each ASSEMBLED paragraph (fixed template words + your slot words) must stay within 45–55 words, as close to 45–50 as grammar allows.
- The fixed template words already account for: Body 1 = 38 words, Body 2 = 30 words, Body 3 = 33 words.
- So your slot values must total roughly: Body 1: 8–14 words, Body 2: 15–20 words, Body 3: 12–17 words.
- Keep every slot value extremely concise: 1–2 words each for Body 1; 1–4 words each for Bodies 2 and 3.
- Body 1: aim for 50–55 words total (its template is longer); Bodies 2 and 3: aim for 45–50 words total.

General rules:
- Vocabulary level: CEFR B2–C1, formal but natural written English suitable for EIKEN Grade 1
- Slot values: no sentence-final period, start lowercase unless a proper noun
- The three arguments must be clearly distinct (e.g. economic / social / ethical angles)
- Every {result} must point in the SAME direction as the stance
- For each body, also provide "ja": a natural Japanese translation of the FULL assembled paragraph

Return ONLY this JSON structure:
{"bodies":[{"slots":{"reason":"...","principle":"...","condition":"...","result":"...","example":"...","explanation":"...","keyConcept":"...","conclusion":"..."},"ja":"..."},{...},{...}]}`;
}

function buildThemePrompt(existingTopics) {
  return `You are an expert on the EIKEN Grade 1 English essay test.
Propose 6 NEW essay topics in the style of real EIKEN Grade 1 prompts (agree/disagree statements or yes/no policy questions).
Cover diverse categories. Do not duplicate any of these existing topics:
${existingTopics.map(t => '- ' + t).join('\n')}

For each topic provide:
- "topic": the English prompt
- "topicJa": a concise Japanese translation
- "category": exactly one of テクノロジー, 環境, 教育, 社会, 政治, 医療・健康

Return ONLY this JSON structure:
{"themes":[{"topic":"...","topicJa":"...","category":"..."}]}`;
}

const SLOT_KEYS = ['reason', 'principle', 'condition', 'result', 'example', 'explanation', 'keyConcept', 'conclusion'];
/* 各Bodyテンプレートの固定部分の語数（js/templates.js の固定テキストと一致させること） */
const FIXED_WORDS = [38, 30, 33];
const WORD_MIN = 45;
const WORD_MAX = 55;

/* 組み立て後の各Bodyの総語数。構造が不正なら null */
function bodyWordTotals(parsed) {
  if (!parsed || !Array.isArray(parsed.bodies) || parsed.bodies.length < 3) return null;
  const totals = [];
  for (let i = 0; i < 3; i++) {
    const slots = parsed.bodies[i] && parsed.bodies[i].slots;
    if (!slots) return null;
    let n = FIXED_WORDS[i];
    for (const key of SLOT_KEYS) {
      n += String(slots[key] || '').trim().split(/\s+/).filter(Boolean).length;
    }
    totals.push(n);
  }
  return totals;
}

async function callGemini(prompt, apiKey, model) {
  let r;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, responseMimeType: 'application/json' },
      }),
    });
  } catch (e) {
    const err = new Error('Gemini API への接続に失敗しました');
    err.status = 502;
    throw err;
  }
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json()).error?.message || ''; } catch (e) { /* ignore */ }
    const err = new Error(`Gemini APIエラー (${r.status}) ${detail}`.trim());
    err.status = 502;
    throw err;
  }
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const err = new Error('Gemini から有効な応答が得られませんでした');
    err.status = 502;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error('生成結果の JSON 解析に失敗しました');
    err.status = 502;
    throw err;
  }
}

function keywordMatches(given, expected) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const { mode, keyword, topic, stance, existingTopics } = req.body || {};

  const expected = process.env.APP_KEYWORD;
  if (!expected) {
    return res.status(500).json({ error: 'サーバーに APP_KEYWORD（合言葉）が設定されていません。Vercel の環境変数を確認してください。' });
  }
  if (!keywordMatches(keyword || '', expected)) {
    return res.status(401).json({ error: 'キーワードが正しくありません' });
  }

  if (mode === 'verify') {
    return res.status(200).json({ ok: true });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'サーバーに GEMINI_API_KEY が設定されていません。Vercel の環境変数を確認してください。' });
  }

  let prompt;
  if (mode === 'essay') {
    if (typeof topic !== 'string' || !topic.trim() || !['agree', 'disagree'].includes(stance)) {
      return res.status(400).json({ error: 'topic / stance が不正です' });
    }
    prompt = buildEssayPrompt(topic.trim().slice(0, 300), stance);
  } else if (mode === 'themes') {
    const existing = Array.isArray(existingTopics)
      ? existingTopics.slice(0, 100).map(t => String(t).slice(0, 300))
      : [];
    prompt = buildThemePrompt(existing);
  } else {
    return res.status(400).json({ error: 'mode が不正です' });
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  let parsed;
  try {
    parsed = await callGemini(prompt, apiKey, model);
  } catch (e) {
    return res.status(e.status || 502).json({ error: e.message });
  }

  // 語数制約チェック：範囲外の Body があれば実測値を伝えて1回だけリトライする
  if (mode === 'essay') {
    const totals = bodyWordTotals(parsed);
    if (totals && totals.some(t => t < WORD_MIN || t > WORD_MAX)) {
      const feedback = `\n\nIMPORTANT FEEDBACK: In your previous attempt the assembled paragraphs totaled ${totals.join(', ')} words. Regenerate so that EVERY assembled paragraph stays within ${WORD_MIN}–${WORD_MAX} words (target 45–50). Adjust the length of your slot values accordingly.`;
      try {
        const retry = await callGemini(prompt + feedback, apiKey, model);
        if (bodyWordTotals(retry)) parsed = retry;
      } catch (e) { /* リトライ失敗時は初回結果をそのまま返す */ }
    }
  }

  return res.status(200).json(parsed);
};
