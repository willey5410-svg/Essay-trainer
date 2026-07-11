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

General rules:
- Vocabulary level: CEFR B2–C1, formal but natural written English suitable for EIKEN Grade 1
- Each slot value: at most 14 words, no sentence-final period, start lowercase unless a proper noun
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, responseMimeType: 'application/json' },
      }),
    });
  } catch (e) {
    return res.status(502).json({ error: 'Gemini API への接続に失敗しました' });
  }

  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json()).error?.message || ''; } catch (e) { /* ignore */ }
    return res.status(502).json({ error: `Gemini APIエラー (${r.status}) ${detail}`.trim() });
  }

  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return res.status(502).json({ error: 'Gemini から有効な応答が得られませんでした' });
  }
  try {
    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    return res.status(502).json({ error: '生成結果の JSON 解析に失敗しました' });
  }
};
