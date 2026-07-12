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
- Judge each one: is it a valid, distinct, exam-appropriate argument FOR the stance above? Check:
  - Direction: does it point toward the stance?
  - Neutrality: is it phrased as a neutral description of WHAT changes, with no value judgment baked in (prefer "the labor force is reshaped" over "workers are harmed")?
  - Structural framing: does it name a structural/systemic change (educational structure, labor-force structure, information flow, decision-making, social institutions, evaluation systems, market structure, technological development, resource allocation) rather than "who benefits"?
  - Abstraction level: is it one level more abstract than a narrow concrete anecdote?
- Report the judgments in a "pointsReview" array (one object per argument, same order). Each comment must be IN JAPANESE, short, and say why it works or how to fix it (mention neutrality/structure/abstraction if that's the issue).
- If an argument is valid and strong, ADOPT it as one of your three body arguments — rephrase it to satisfy the reason-slot principles below (neutral, structural, abstracted) so the learner sees their own idea turned into a proper English argument.` : '';
  const bodiesShape = '{"bodies":[{"slots":{"reason":"...","principle":"...","condition":"...","result":"...","keyConcept":"...","conclusion":"..."},"ja":"..."},{...},{...}]';
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

Grammar and richness constraints for the slots (CRITICAL — each value must fit its template grammatically):
- reason: a substantial noun phrase of 5–8 words with meaningful modifiers, describing WHAT structurally changes — three principles, in order of importance:
  1. NEUTRAL: never bake in a value judgment about whether the change is good or bad (avoid words like "decline", "undermined", "dangerous", "harmed"; describe the change itself — e.g. "the reshaping of the labor force" NOT "the labor force is harmed")
  2. STRUCTURAL: name the structure/system that changes, not who benefits or loses — e.g. educational structure, labor-force structure, information flow, decision-making, social institutions, evaluation systems, market structure, technological development, resource allocation
  3. ABSTRACT: one level more abstract than the concrete phenomenon in the topic — e.g. "students using AI for homework" → "the learning process being altered"; "more women entering the workforce" → "the labor force being reshaped"
  (e.g. "the large-scale reshaping of the labor force by AI")
- principle: a full clause of 8–13 words with subject and verb that explains the underlying MECHANISM — WHY this structural change happens, not just a restatement (follows "because" / "reason is that")
- condition: a clause of 5–7 words with subject and verb, NO leading conjunction (follows "when" / "whenever" / "if")
- result: a specific noun phrase of 4–7 words naming the downstream SOCIAL consequence — the "so what?", not merely the first-order effect (e.g. not just "critical thinking declines" but "a reduced ability to adapt to new challenges") (follows "leads to" / "results in")
- keyConcept: a short noun phrase of 2–4 words
- conclusion: a gerund phrase or noun phrase of 4–6 words (follows "in" / "for")

Word-count constraint (STRICT, HIGHEST PRIORITY):
- The total word count of each ASSEMBLED paragraph (fixed template words + your slot words) must be 45–50 words.
- The fixed template words already account for: Body 1 = 22 words, Body 2 = 18 words, Body 3 = 20 words.
- So your slot values must total roughly: Body 1: 23–28 words, Body 2: 27–32 words, Body 3: 25–30 words.
- Use the budget for depth: precise modifiers and mechanisms, not filler words.

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

const SLOT_KEYS = ['reason', 'principle', 'condition', 'result', 'keyConcept', 'conclusion'];

/* 評価用にサーバー側でも Body を組み立てるためのテンプレート文字列 */
const TEMPLATE_STRINGS = [
  'First and foremost, {reason} is a crucial factor. This is because {principle}. In essence, when {condition}, it leads to {result}. Therefore, {keyConcept} plays a key role in {conclusion}.',
  'Another key point is {reason}. This is largely because {principle}. Put simply, whenever {condition}, it results in {result}. Hence, {keyConcept} is essential for {conclusion}.',
  'A further point is {reason}. The primary reason is that {principle}. In other words, if {condition}, this leads to {result}. Accordingly, {keyConcept} is vital for {conclusion}.',
];

/* bodies（[{slots:{...}}, ...] 形式）からテンプレートに沿った完成文を組み立てる。
   構造が不正（3件揃っていない・スロット欠落）なら null */
function assembleEssay(bodies) {
  if (!Array.isArray(bodies) || bodies.length < 3) return null;
  const paragraphs = [];
  for (let i = 0; i < 3; i++) {
    const slots = bodies[i] && bodies[i].slots;
    if (!slots) return null;
    for (const key of SLOT_KEYS) {
      if (!String(slots[key] || '').trim()) return null;
    }
    paragraphs.push(TEMPLATE_STRINGS[i].replace(/\{(\w+)\}/g, (m, key) => String(slots[key] || '').trim()));
  }
  return paragraphs;
}

function buildEvalPrompt(topic, stance, paragraphs) {
  return `You are a strict but fair examiner for the EIKEN Grade 1 English writing test.
Evaluate the following THREE body paragraphs written for the prompt below. The introduction and conclusion are intentionally omitted — judge these as body paragraphs only, and do not penalize their absence. The paragraphs follow a fixed rhetorical template by design, and concrete examples are intentionally omitted from the template for concision — do NOT penalize the repeated structure or the absence of example sentences; judge the depth of the reasoning instead.

TOPIC: ${topic}
STANCE: ${stance === 'agree' ? 'AGREE / YES' : 'DISAGREE / NO'}

BODY PARAGRAPHS:
1. ${paragraphs[0]}
2. ${paragraphs[1]}
3. ${paragraphs[2]}

Score each criterion from 0 to 10 (0.5 steps allowed):
- structure: within each paragraph, is the flow (topic sentence → underlying principle → condition and consequence → conclusion) consistent and easy for a grader to follow?
- content: are the three arguments well-chosen, clearly distinct, and logically developed with real depth (mechanisms and specific consequences rather than vague claims)? Is it clear WHY each argument supports the stance?
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

/* 学習者が自由入力したスロット値の判定・添削プロンプト */
function buildReviewSlotPrompt(topic, stance, bodyIndex, slotKey, userText, slots) {
  const assembled = TEMPLATE_STRINGS[bodyIndex].replace(/\{(\w+)\}/g, (m, k) =>
    k === slotKey ? `[[${slotKey}]]` : String(slots[k] || '').trim());
  return `You are an expert EIKEN Grade 1 writing coach.

TOPIC: ${topic}
STANCE: ${stance === 'agree' ? 'AGREE / YES' : 'DISAGREE / NO'}

A learner is practicing a fixed-template body paragraph. This is the current paragraph, with the slot they want to fill marked as [[${slotKey}]]:

"${assembled}"

The learner proposes this text for the [[${slotKey}]] slot (it may contain English errors or Japanese):
"${userText}"

Judge the proposal and produce a corrected version:
- Grammar fit: the corrected value must fit the marked position grammatically (same role as expected there: noun phrase / clause etc.), with no sentence-final period and a lowercase start unless a proper noun.
- Direction: the resulting sentence must support the stance above.
- Register: natural, formal written English appropriate for EIKEN Grade 1.
- Length: keep the corrected value concise (roughly 2–8 words) so the whole paragraph stays near 45–50 words.
- verdict: "ok" (usable as-is; return it unchanged as corrected), "minor" (good idea, wording corrected), or "rework" (wrong direction, wrong grammatical role, or does not fit — corrected shows a repaired alternative built on their idea).
- explanation: IN JAPANESE, briefly state what was wrong (or good) and why the correction works.
- ja: a natural Japanese translation of the FULL paragraph with your corrected value in place.

Return ONLY this JSON:
{"verdict":"ok","corrected":"...","explanation":"...","ja":"..."}`;
}

/* 論点だしトレーニング（生成済みエッセイに対する反復練習）の判定プロンプト */
function buildReviewPointsPrompt(topic, stance, userPoints, existingReasons) {
  return `You are an expert coach for the EIKEN Grade 1 English essay brainstorming stage.

TOPIC: ${topic}
STANCE: ${stance === 'agree' ? 'AGREE / YES' : 'DISAGREE / NO'}

A learner is practicing coming up with THREE distinct arguments for this stance in 90 seconds, in the style "A does B" (a verb-based claim, later nominalized when writing). They may write in Japanese or English. Here are their arguments:
${userPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

For reference, here are three model arguments already prepared for this topic (the learner may or may not have seen these before):
${existingReasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}

A strong argument follows three principles:
1. NEUTRAL: it describes WHAT changes, with no value judgment baked in (prefer "the labor force is reshaped" over "workers are harmed")
2. STRUCTURAL: it names a structural/systemic change (educational structure, labor-force structure, information flow, decision-making, social institutions, evaluation systems, market structure, technological development, resource allocation) rather than "who benefits"
3. ABSTRACT: it is one level more abstract than a narrow concrete anecdote (e.g. "AI does my homework" → "the learning process is altered")

For EACH of the learner's arguments, judge:
- Is it a valid, exam-appropriate argument that supports the stance (correct direction)?
- Is it clearly distinct from the learner's other arguments?
- Does it follow the neutral / structural / abstract principles above? If not, say which one is missing.
- verdict: "valid", "weak" (right idea, underdeveloped, or violates one of the three principles), or "invalid" (wrong direction, off-topic, or not really an argument)
- comment: ONE short sentence IN JAPANESE explaining the verdict and, if not "valid", how to fix it (mention neutrality/structure/abstraction if that's the issue)

Return ONLY this JSON:
{"pointsReview":[{"point":"...","verdict":"valid","comment":"..."}]}`;
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
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  if (mode === 'reviewSlot') {
    if (typeof topic !== 'string' || !topic.trim() || !['agree', 'disagree'].includes(stance)) {
      return res.status(400).json({ error: 'topic / stance が不正です' });
    }
    const bi = Number(req.body.bodyIndex);
    const slotKey = req.body.slotKey;
    const userText = String(req.body.userText || '').trim().slice(0, 300);
    if (!(bi >= 0 && bi <= 2) || !SLOT_KEYS.includes(slotKey) || !userText) {
      return res.status(400).json({ error: 'reviewSlot の入力が不正です' });
    }
    const slots = {};
    for (const k of SLOT_KEYS) slots[k] = String((req.body.slots || {})[k] || '').trim().slice(0, 200);
    try {
      const raw = await callGemini(
        buildReviewSlotPrompt(topic.trim().slice(0, 300), stance, bi, slotKey, userText, slots),
        apiKey, model, 0.2);
      const corrected = String((raw && raw.corrected) || '').trim().replace(/[.。]+$/, '').slice(0, 200);
      if (!corrected) return res.status(502).json({ error: '添削結果が取得できませんでした' });
      return res.status(200).json({
        verdict: ['ok', 'minor', 'rework'].includes(raw.verdict) ? raw.verdict : 'minor',
        corrected,
        explanation: String(raw.explanation || '').slice(0, 500),
        ja: String(raw.ja || '').slice(0, 1000),
      });
    } catch (e) {
      return res.status(e.status || 502).json({ error: e.message });
    }
  }

  // 各モードは Gemini 呼び出し1回のみで完結させる（Vercel の関数タイムアウト対策）。
  // 生成と採点を別リクエストに分離しているのもこのため。
  if (mode === 'essay') {
    if (typeof topic !== 'string' || !topic.trim() || !['agree', 'disagree'].includes(stance)) {
      return res.status(400).json({ error: 'topic / stance が不正です' });
    }
    const points = Array.isArray(userPoints)
      ? userPoints.map(p => String(p).trim().slice(0, 200)).filter(Boolean).slice(0, 3)
      : [];
    const prompt = buildEssayPrompt(topic.trim().slice(0, 300), stance, points);
    try {
      const parsed = await callGemini(prompt, apiKey, model);
      if (!assembleEssay(parsed.bodies)) {
        return res.status(502).json({ error: '生成結果の形式が不正です（スロットが不足しています）' });
      }
      return res.status(200).json({ bodies: parsed.bodies, pointsReview: normalizePointsReview(parsed.pointsReview) });
    } catch (e) {
      return res.status(e.status || 502).json({ error: e.message });
    }
  }

  if (mode === 'reviewPoints') {
    if (typeof topic !== 'string' || !topic.trim() || !['agree', 'disagree'].includes(stance)) {
      return res.status(400).json({ error: 'topic / stance が不正です' });
    }
    const points = Array.isArray(userPoints)
      ? userPoints.map(p => String(p).trim().slice(0, 200)).filter(Boolean).slice(0, 3)
      : [];
    if (!points.length) return res.status(400).json({ error: '論点が入力されていません' });
    const reasons = Array.isArray(req.body.existingReasons)
      ? req.body.existingReasons.map(r => String(r).trim().slice(0, 200)).filter(Boolean).slice(0, 3)
      : [];
    if (reasons.length < 3) return res.status(400).json({ error: 'existingReasons が不正です' });
    try {
      const raw = await callGemini(
        buildReviewPointsPrompt(topic.trim().slice(0, 300), stance, points, reasons),
        apiKey, model, 0.3);
      const review = normalizePointsReview(raw && raw.pointsReview);
      if (!review || !review.length) return res.status(502).json({ error: '判定結果の形式が不正です' });
      return res.status(200).json({ pointsReview: review });
    } catch (e) {
      return res.status(e.status || 502).json({ error: e.message });
    }
  }

  if (mode === 'evaluate') {
    if (typeof topic !== 'string' || !topic.trim() || !['agree', 'disagree'].includes(stance)) {
      return res.status(400).json({ error: 'topic / stance が不正です' });
    }
    const paragraphs = assembleEssay(req.body.bodies);
    if (!paragraphs) return res.status(400).json({ error: 'bodies が不正です' });
    try {
      const evaluation = await evaluateEssay(topic.trim().slice(0, 300), stance, paragraphs, apiKey, model);
      return res.status(200).json({ evaluation });
    } catch (e) {
      return res.status(e.status || 502).json({ error: e.message });
    }
  }

  if (mode === 'themes') {
    const existing = Array.isArray(existingTopics)
      ? existingTopics.slice(0, 100).map(t => String(t).slice(0, 300))
      : [];
    try {
      return res.status(200).json(await callGemini(buildThemePrompt(existing), apiKey, model));
    } catch (e) {
      return res.status(e.status || 502).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'mode が不正です' });
};

/* ユーザー論点の判定結果を検証・整形する */
function normalizePointsReview(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, 3).map(r => ({
    point: String((r && r.point) || '').slice(0, 200),
    verdict: ['valid', 'weak', 'invalid'].includes(r && r.verdict) ? r.verdict : 'weak',
    comment: String((r && r.comment) || '').slice(0, 300),
  }));
}

async function evaluateEssay(topic, stance, paragraphs, apiKey, model) {
  const raw = await callGemini(buildEvalPrompt(topic, stance, paragraphs), apiKey, model, 0.2);
  const ev = normalizeEval(raw);
  if (!ev) {
    const err = new Error('採点結果の形式が不正です');
    err.status = 502;
    throw err;
  }
  return ev;
}
