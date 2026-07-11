/* Vercel サーバーレス関数：Gemini API プロキシ
   - APIキーは環境変数 GEMINI_API_KEY にのみ保持し、ブラウザには渡さない
   - リクエストは環境変数 APP_KEYWORD と一致する合言葉（keyword）を要求する
   環境変数:
     GEMINI_API_KEY  … Google AI Studio の API キー（必須）
     APP_KEYWORD     … アプリ利用時の合言葉（必須）
     GEMINI_MODEL    … 使用モデル（省略時 gemini-2.5-flash） */

const crypto = require('crypto');

const DEFAULT_MODEL = 'gemini-2.5-flash';

function buildEssayPrompt(topic, stance, userPoints) {
  const stanceText = stance === 'agree'
    ? 'AGREE — support the statement / answer YES'
    : 'DISAGREE — oppose the statement / answer NO';
  const points = Array.isArray(userPoints) ? userPoints : [];
  const pointsSection = points.length ? `

USER'S BRAINSTORMED ARGUMENTS (the learner wrote these in 90 seconds BEFORE seeing your answer; they may be in Japanese or English):
${points.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Tasks for these arguments:
- Judge each one: is it a valid, distinct, exam-appropriate argument FOR the stance above? Check especially whether its direction matches the stance.
- Report the judgments in a "pointsReview" array (one object per argument, same order). Each comment must be IN JAPANESE, short, and say why it works or how to fix it.
- If an argument is valid and strong, ADOPT it (rephrased into proper form) as one of your three body arguments so the learner sees their own idea turned into English.` : '';
  const bodiesShape = '{"bodies":[{"slots":{"reason":"...","principle":"...","condition":"...","result":"...","example":"...","explanation":"...","keyConcept":"...","conclusion":"..."},"ja":"..."},{...},{...}]';
  const jsonShape = points.length
    ? bodiesShape + ',"pointsReview":[{"point":"...","verdict":"valid","comment":"..."}]}\n("verdict" must be one of "valid", "weak", "invalid")'
    : bodiesShape + '}';
  return `You are an expert writing coach for the EIKEN Grade 1 English essay.

TOPIC: ${topic}
STANCE: ${stanceText}

Create the content of THREE body paragraphs, each presenting a DIFFERENT argument supporting the stance.
Do NOT write free-form paragraphs. Instead, fill the slots of the following fixed templates so that each assembled paragraph reads as natural, formal written English.

Body 1 template:
"${TEMPLATE_STRINGS[0]}"

Body 2 template:
"${TEMPLATE_STRINGS[1]}"

Body 3 template:
"${TEMPLATE_STRINGS[2]}"

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
- The total word count of each ASSEMBLED paragraph (fixed template words + your slot words) must be 45–50 words.
- The fixed template words already account for: Body 1 = 26 words, Body 2 = 22 words, Body 3 = 25 words.
- So your slot values must total roughly: Body 1: 19–24 words, Body 2: 23–28 words, Body 3: 20–25 words.
- Keep every slot value concise: typically 2–4 words each.

General rules:
- Vocabulary level: CEFR B2–C1, formal but natural written English suitable for EIKEN Grade 1
- Slot values: no sentence-final period, start lowercase unless a proper noun
- The three arguments must be clearly distinct (e.g. economic / social / ethical angles)
- Every {result} must point in the SAME direction as the stance
- For each body, also provide "ja": a natural Japanese translation of the FULL assembled paragraph${pointsSection}

Return ONLY this JSON structure:
${jsonShape}`;
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
const FIXED_WORDS = [26, 22, 25];
const WORD_MIN = 45;
const WORD_MAX = 55;
/* 採点の合格ライン（3観点の平均） */
const EVAL_THRESHOLD = 8;

/* 評価用にサーバー側でも Body を組み立てるためのテンプレート文字列 */
const TEMPLATE_STRINGS = [
  'First and foremost, {reason} is a crucial factor. This is because {principle}. In essence, when {condition}, it leads to {result}. One example is {example}, which {explanation}. Therefore, {keyConcept} plays a key role in {conclusion}.',
  'Another key point is {reason}. This is largely because {principle}. Put simply, whenever {condition}, it results in {result}. For instance, {example}, demonstrating how {explanation}. Hence, {keyConcept} is essential for {conclusion}.',
  'A further point is {reason}. The primary reason is that {principle}. In other words, if {condition}, this leads to {result}. This is evident in {example}, where {explanation}. Accordingly, {keyConcept} is vital for {conclusion}.',
];

function assembleEssay(parsed) {
  if (!bodyWordTotals(parsed)) return null;
  return parsed.bodies.slice(0, 3).map((b, i) =>
    TEMPLATE_STRINGS[i].replace(/\{(\w+)\}/g, (m, key) => String(b.slots[key] || '').trim()));
}

function buildEvalPrompt(topic, stance, paragraphs) {
  return `You are a strict but fair examiner for the EIKEN Grade 1 English writing test.
Evaluate the following THREE body paragraphs written for the prompt below. The introduction and conclusion are intentionally omitted — judge these as body paragraphs only, and do not penalize their absence. The paragraphs follow a fixed rhetorical template by design; do not penalize the repeated structure itself.

TOPIC: ${topic}
STANCE: ${stance === 'agree' ? 'AGREE / YES' : 'DISAGREE / NO'}

BODY PARAGRAPHS:
1. ${paragraphs[0]}
2. ${paragraphs[1]}
3. ${paragraphs[2]}

Score each criterion from 0 to 10 (0.5 steps allowed):
- structure: within each paragraph, is the flow (topic sentence → reason → restatement → example → conclusion) consistent and easy for a grader to follow?
- content: are the three arguments well-chosen, clearly distinct, logically developed, and supported by concrete examples? Is it clear WHY each argument supports the stance?
- language: grammar accuracy, natural phrasing, and vocabulary range appropriate for EIKEN Grade 1 (CEFR C1)

For each criterion also write one short comment IN JAPANESE: what is good and what specifically should be improved.

Return ONLY this JSON:
{"structure": 0.0, "content": 0.0, "language": 0.0, "comments": {"structure": "...", "content": "...", "language": "..."}}`;
}

function normalizeEval(raw) {
  if (!raw) return null;
  const ev = {};
  for (const k of ['structure', 'content', 'language']) {
    const v = Number(raw[k]);
    if (!isFinite(v)) return null;
    ev[k] = Math.max(0, Math.min(10, v));
  }
  ev.average = Math.round(((ev.structure + ev.content + ev.language) / 3) * 10) / 10;
  const c = raw.comments || {};
  ev.comments = {
    structure: String(c.structure || '').slice(0, 500),
    content: String(c.content || '').slice(0, 500),
    language: String(c.language || '').slice(0, 500),
  };
  return ev;
}

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

async function callGemini(prompt, apiKey, model, temperature) {
  let r;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: temperature === undefined ? 0.8 : temperature, responseMimeType: 'application/json' },
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
  const { mode, keyword, topic, stance, existingTopics, userPoints } = req.body || {};

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
    const points = Array.isArray(userPoints)
      ? userPoints.map(p => String(p).trim().slice(0, 200)).filter(Boolean).slice(0, 3)
      : [];
    prompt = buildEssayPrompt(topic.trim().slice(0, 300), stance, points);
  } else if (mode === 'themes') {
    const existing = Array.isArray(existingTopics)
      ? existingTopics.slice(0, 100).map(t => String(t).slice(0, 300))
      : [];
    prompt = buildThemePrompt(existing);
  } else {
    return res.status(400).json({ error: 'mode が不正です' });
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  if (mode === 'themes') {
    try {
      return res.status(200).json(await callGemini(prompt, apiKey, model));
    } catch (e) {
      return res.status(e.status || 502).json({ error: e.message });
    }
  }

  // essay モード：生成 →（語数リトライ）→ 採点 → 平均が閾値未満なら講評付きで1回だけ再生成
  try {
    const result = await essayPipeline(prompt, topic, stance, apiKey, model);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(e.status || 502).json({ error: e.message });
  }
};

/* 生成1回分（語数制約チェック＋1回リトライ込み） */
async function genBodiesOnce(prompt, apiKey, model) {
  let parsed = await callGemini(prompt, apiKey, model);
  const totals = bodyWordTotals(parsed);
  if (totals && totals.some(t => t < WORD_MIN || t > WORD_MAX)) {
    const feedback = `\n\nIMPORTANT FEEDBACK: In your previous attempt the assembled paragraphs totaled ${totals.join(', ')} words. Regenerate so that EVERY assembled paragraph stays within ${WORD_MIN}–${WORD_MAX} words (target 45–50). Adjust the length of your slot values accordingly.`;
    try {
      const retry = await callGemini(prompt + feedback, apiKey, model);
      if (bodyWordTotals(retry)) parsed = retry;
    } catch (e) { /* リトライ失敗時は初回結果をそのまま返す */ }
  }
  return parsed;
}

/* 採点（失敗しても生成結果は返せるよう、エラー時は null） */
async function evaluateEssay(topic, stance, paragraphs, apiKey, model) {
  try {
    return normalizeEval(await callGemini(buildEvalPrompt(topic, stance, paragraphs), apiKey, model, 0.2));
  } catch (e) {
    return null;
  }
}

/* ユーザー論点の判定結果を検証・整形する */
function normalizePointsReview(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, 3).map(r => ({
    point: String((r && r.point) || '').slice(0, 200),
    verdict: ['valid', 'weak', 'invalid'].includes(r && r.verdict) ? r.verdict : 'weak',
    comment: String((r && r.comment) || '').slice(0, 300),
  }));
}

async function essayPipeline(prompt, topic, stance, apiKey, model) {
  const first = await genBodiesOnce(prompt, apiKey, model);
  const paragraphs = assembleEssay(first);
  if (!paragraphs) return first; // 構造が不正な場合はクライアント側の検証に委ねる
  const review1 = normalizePointsReview(first.pointsReview);

  const eval1 = await evaluateEssay(topic, stance, paragraphs, apiKey, model);
  if (!eval1) return { bodies: first.bodies, evaluation: null, attempts: 1, pointsReview: review1 };
  if (eval1.average >= EVAL_THRESHOLD) {
    return { bodies: first.bodies, evaluation: eval1, attempts: 1, pointsReview: review1 };
  }

  // 閾値未満：試験官の講評をフィードバックして1回だけ再生成し、良い方を採用する
  const feedback = `\n\nEXAMINER FEEDBACK on your previous attempt (scores out of 10 — structure ${eval1.structure}, content ${eval1.content}, language ${eval1.language}):
- structure: ${eval1.comments.structure}
- content: ${eval1.comments.content}
- language: ${eval1.comments.language}
Regenerate the slot values to address these weaknesses — especially concrete, specific examples and clear logical development of WHY each argument supports the stance — while STRICTLY keeping every template, grammar, and word-count constraint above.`;

  let second = null;
  let eval2 = null;
  try {
    second = await genBodiesOnce(prompt + feedback, apiKey, model);
    const paragraphs2 = assembleEssay(second);
    if (paragraphs2) eval2 = await evaluateEssay(topic, stance, paragraphs2, apiKey, model);
  } catch (e) { /* 再生成に失敗した場合は初回結果を返す */ }

  if (second && eval2 && eval2.average >= eval1.average) {
    return { bodies: second.bodies, evaluation: eval2, attempts: 2, pointsReview: normalizePointsReview(second.pointsReview) || review1 };
  }
  return { bodies: first.bodies, evaluation: eval1, attempts: 2, pointsReview: review1 };
}
