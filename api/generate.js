/* Vercel サーバーレス関数：Gemini API プロキシ
   - APIキーは環境変数 GEMINI_API_KEY にのみ保持し、ブラウザには渡さない
   - リクエストは環境変数 APP_KEYWORD と一致する合言葉（keyword）を要求する
   環境変数:
     GEMINI_API_KEY  … Google AI Studio の API キー（必須）
     APP_KEYWORD     … アプリ利用時の合言葉（必須）
     GEMINI_MODEL    … 使用モデル（省略時 gemini-2.5-flash） */

const crypto = require('crypto');

const DEFAULT_MODEL = 'gemini-2.5-flash';

/* 各 Body の役割・語数の目安（新テンプレート：役割の異なる4文で1段落 45〜60語） */
const BODY_ROLE_NAMES = ['因果必然型', '実証型', '譲歩反駁型'];

/* 論点（argument）の3原則。生成・書き換え・論点判定で共有する。 */
const ARGUMENT_PRINCIPLES = `A strong argument follows three principles:
1. NEUTRAL: it describes WHAT changes, with no value judgment baked in (prefer "the labor force is reshaped" over "workers are harmed")
2. STRUCTURAL: it names a structural/systemic change (educational structure, labor-force structure, information flow, decision-making, social institutions, evaluation systems, market structure, technological development, resource allocation) rather than "who benefits"
3. ABSTRACT: it is one level more abstract than a narrow concrete anecdote (e.g. "AI does my homework" → "the learning process is altered")`;

/* 3つの Body に与える「4文アーキテクチャ」。1文=1機能で役割を固定する。 */
const BODY_ARCHITECTURE = `Each body paragraph MUST consist of EXACTLY FOUR sentences, each performing a fixed function. The three bodies use DIFFERENT rhetorical modes so the essay never feels repetitive. Every sentence is a complete sentence: it starts with a capital letter and ends with a period.

BODY 1 — Causal-necessity mode (論理: "it must logically follow"):
  Sentence 1 (Claim): "First of all, [the argument] inevitably leads to [a consequence]."
  Sentence 2 (Mechanism): explain WHY it happens — "As [one change occurs], [a linked change] also grows / weakens."
  Sentence 3 (Escalation): push to a graver stage — "Sooner or later, [a worse consequence follows]." (or "In fact, [real-world backing].")
  Sentence 4 (Stakes): land on who is affected — "This burden on [group] will become intolerable." (or "This will greatly benefit [group].")

BODY 2 — Empirical mode (実証: "it is actually happening"):
  Sentence 1 (Claim): "Secondly, [claim]."
  Sentence 2 (General explanation): "This is because ..." / "[subject] are becoming able to ..."
  Sentence 3 (Evidence): "In fact, [something really occurring]." / "For example, [a concrete case]." / "..., such as [a real broad example like China, India, or developing countries]." Use a real but broad example — do NOT invent statistics or fake proper nouns.
  Sentence 4 (Implication): "This means that [a society-level consequence]."

BODY 3 — Concession-rebuttal mode (防御: "even the counterargument fails"):
  Sentence 1 (Claim): "Finally, [claim]."
  Sentence 2 (Concession): "It is true that [a plausible counterargument]." / "While some may argue that [counterargument],"
  Sentence 3 (Rebuttal): "However, this is not the case, because [why the counterargument fails]." / "However, [the limit of that counterargument]."
  Sentence 4 (Resolution): "Therefore, [why your side prevails]." / "For this reason, [your argument wins]."`;

function buildEssayPrompt(topic, stance, userPoints) {
  const stanceText = stance === 'agree'
    ? 'AGREE — support the statement / answer YES'
    : 'DISAGREE — oppose the statement / answer NO';
  const points = Array.isArray(userPoints) ? userPoints : [];
  const pointsSection = points.length ? `

USER'S BRAINSTORMED ARGUMENTS (the learner wrote these in 90 seconds BEFORE seeing your answer; they may be in Japanese or English):
${points.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Tasks for these arguments:
- Judge each one: is it a valid, distinct, exam-appropriate argument FOR the stance above? Check direction (does it point toward the stance?), and the three argument principles above (neutral / structural / abstract).
- Report the judgments in a "pointsReview" array (one object per argument, same order). Each comment must be IN JAPANESE, short, and say why it works or how to fix it (mention neutrality/structure/abstraction if that's the issue).
- If an argument is valid and strong, ADOPT it as one of your three body arguments — rephrase it to satisfy the three principles so the learner sees their own idea turned into a proper English argument.` : '';
  const bodiesShape = '{"bodies":[{"argument":"...","sentences":["...","...","...","..."],"ja":"..."},{...},{...}]';
  const jsonShape = points.length
    ? bodiesShape + ',"pointsReview":[{"point":"...","verdict":"valid","comment":"..."}]}\n("verdict" must be one of "valid", "weak", "invalid")'
    : bodiesShape + '}';
  return `You are an expert writing coach for the EIKEN Grade 1 English essay.

TOPIC: ${topic}
STANCE: ${stanceText}

Write the THREE body paragraphs of a model answer. Each body presents a DIFFERENT argument that supports the stance, and the three arguments must be clearly distinct (e.g. an individual angle, a social/economic angle, and an international/future angle).

For EACH body, first decide its core "argument": a substantial noun phrase of 5–8 words naming WHAT structurally changes.
${ARGUMENT_PRINCIPLES}

Then write the paragraph itself as four sentences following this fixed architecture:
${BODY_ARCHITECTURE}

Length constraint (STRICT):
- Each body paragraph must total 45–60 words (roughly four sentences of 12–15 words each).
- Use the budget for depth: precise mechanisms and consequences, not filler.

General rules:
- Vocabulary level: CEFR B2–C1, formal but natural written English suitable for EIKEN Grade 1.
- The final consequence of every body must point in the SAME direction as the stance.
- For each body, also provide "ja": a natural Japanese translation of the FULL paragraph.${pointsSection}

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

/* bodies（[{argument, sentences:[...], ja}, ...]）を段落テキスト配列に組み立てる。
   構造が不正（3件揃っていない・文が空）なら null */
function assembleEssay(bodies) {
  if (!Array.isArray(bodies) || bodies.length < 3) return null;
  const paragraphs = [];
  for (let i = 0; i < 3; i++) {
    const b = bodies[i];
    if (!b || !Array.isArray(b.sentences)) return null;
    const text = b.sentences.map(s => String(s || '').trim()).filter(Boolean).join(' ');
    if (!text) return null;
    paragraphs.push(text);
  }
  return paragraphs;
}

/* Gemini から返った1つの body を検証・整形する（不正なら null） */
function normalizeBody(raw) {
  if (!raw) return null;
  const argument = String(raw.argument || '').trim().replace(/[.。]+$/, '').slice(0, 200);
  const sentences = Array.isArray(raw.sentences)
    ? raw.sentences.map(s => String(s || '').trim()).filter(Boolean).map(s => s.slice(0, 300))
    : [];
  if (!argument || sentences.length < 3) return null;
  return { argument, sentences, ja: String(raw.ja || '').trim().slice(0, 1000) };
}

function buildEvalPrompt(topic, stance, paragraphs) {
  return `You are a strict but fair examiner for the EIKEN Grade 1 English writing test.
Evaluate the following THREE body paragraphs written for the prompt below. The introduction and conclusion are intentionally omitted — judge these as body paragraphs only, and do not penalize their absence. By design, each body follows a fixed four-sentence rhetorical role: Body 1 argues by causal necessity, Body 2 by empirical evidence, and Body 3 by concession and rebuttal. Do NOT penalize this deliberate structure; judge the depth and persuasiveness of the reasoning within it.

TOPIC: ${topic}
STANCE: ${stance === 'agree' ? 'AGREE / YES' : 'DISAGREE / NO'}

BODY PARAGRAPHS:
1. ${paragraphs[0]}
2. ${paragraphs[1]}
3. ${paragraphs[2]}

Score each criterion from 0 to 10 (0.5 steps allowed):
- structure: within each paragraph, does the four-sentence flow (claim → development → evidence/escalation → landing) hold together and read logically? Does Body 3's concession-rebuttal actually neutralize the counterargument?
- content: are the three arguments well-chosen, clearly distinct, and developed with real depth (concrete mechanisms, evidence, and consequences rather than vague claims)? Is it clear WHY each argument supports the stance?
- language: grammar accuracy, natural phrasing, and vocabulary range appropriate for EIKEN Grade 1 (CEFR C1).

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

/* 論点だしトレーニングで作った論点を核に、Body 1本を丸ごと書き直すプロンプト */
function buildRewriteBodyPrompt(topic, stance, bodyIndex, userPoint) {
  const stanceText = stance === 'agree'
    ? 'AGREE — support the statement / answer YES'
    : 'DISAGREE — oppose the statement / answer NO';
  return `You are an expert writing coach for the EIKEN Grade 1 English essay.

TOPIC: ${topic}
STANCE: ${stanceText}

The learner wants to rewrite ONE body paragraph built around this argument idea (may be rough, in Japanese or English): "${userPoint}"

This is body number ${bodyIndex + 1}, whose rhetorical role is "${BODY_ROLE_NAMES[bodyIndex]}". Write it as four sentences following that role's fixed architecture:
${BODY_ARCHITECTURE}

First set the paragraph's core "argument": a substantial noun phrase of 5–8 words. ADOPT the learner's idea as this argument — rephrase it to satisfy the three principles below; don't just copy it verbatim.
${ARGUMENT_PRINCIPLES}

Length constraint (STRICT):
- The paragraph must total 45–60 words (roughly four sentences of 12–15 words each).

General rules:
- Vocabulary level: CEFR B2–C1, formal but natural written English suitable for EIKEN Grade 1.
- Every sentence is complete: capitalized start, period at the end.
- The final consequence must point in the SAME direction as the stance.
- Provide "ja": a natural Japanese translation of the FULL paragraph.

Return ONLY this JSON:
{"argument":"...","sentences":["...","...","...","..."],"ja":"..."}`;
}

/* エッセイの採点・論点判定についてGeminiと会話するためのシステム文脈 */
function buildChatSystemContext(topic, stance, bodies, evaluation, pointsReview) {
  const paragraphs = assembleEssay(bodies) || [];
  let s = `You are a friendly, encouraging EIKEN Grade 1 English essay writing coach, chatting with a learner about a specific practice essay they are working on.

TOPIC: ${topic}
STANCE: ${stance === 'agree' ? 'AGREE / YES' : 'DISAGREE / NO'}

CURRENT BODY PARAGRAPHS (Body 1 = causal necessity, Body 2 = empirical evidence, Body 3 = concession-rebuttal):
${paragraphs.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;

  if (evaluation && typeof evaluation.average === 'number') {
    s += `\n\nEXAMINER SCORES (out of 10): structure ${evaluation.structure}, content ${evaluation.content}, language ${evaluation.language} (average ${evaluation.average}).
Examiner comments — structure: ${evaluation.comments?.structure || ''} / content: ${evaluation.comments?.content || ''} / language: ${evaluation.comments?.language || ''}`;
  }
  if (Array.isArray(pointsReview) && pointsReview.length) {
    s += `\n\nLEARNER'S BRAINSTORMED ARGUMENTS AND JUDGMENTS:\n` +
      pointsReview.map((r, i) => `${i + 1}. "${r.point}" — ${r.verdict} (${r.comment})`).join('\n');
  }
  s += `\n\nAnswer the learner's questions IN JAPANESE, concisely (a few sentences unless real detail is needed), in a supportive tone. You may reference specific body paragraphs, scores, or arguments above. Do not regenerate the essay or invent a new template — just discuss and advise.`;
  return s;
}

async function callGeminiChat(systemText, turns, apiKey, model) {
  let r;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: turns.map(t => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: { temperature: 0.6 },
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
  return text.trim();
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

${ARGUMENT_PRINCIPLES}

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
      const bodies = Array.isArray(parsed.bodies) ? parsed.bodies.slice(0, 3).map(normalizeBody) : [];
      if (bodies.length < 3 || bodies.some(b => !b)) {
        return res.status(502).json({ error: '生成結果の形式が不正です（本文が揃っていません）' });
      }
      return res.status(200).json({ bodies, pointsReview: normalizePointsReview(parsed.pointsReview) });
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

  if (mode === 'rewriteBody') {
    if (typeof topic !== 'string' || !topic.trim() || !['agree', 'disagree'].includes(stance)) {
      return res.status(400).json({ error: 'topic / stance が不正です' });
    }
    const bi = Number(req.body.bodyIndex);
    const userPoint = String(req.body.userPoint || '').trim().slice(0, 200);
    if (!(bi >= 0 && bi <= 2) || !userPoint) {
      return res.status(400).json({ error: 'rewriteBody の入力が不正です' });
    }
    try {
      const parsed = await callGemini(buildRewriteBodyPrompt(topic.trim().slice(0, 300), stance, bi, userPoint), apiKey, model);
      const body = normalizeBody(parsed);
      if (!body) {
        return res.status(502).json({ error: '生成結果の形式が不正です（本文が揃っていません）' });
      }
      return res.status(200).json(body);
    } catch (e) {
      return res.status(e.status || 502).json({ error: e.message });
    }
  }

  if (mode === 'chat') {
    if (typeof topic !== 'string' || !topic.trim() || !['agree', 'disagree'].includes(stance)) {
      return res.status(400).json({ error: 'topic / stance が不正です' });
    }
    if (!assembleEssay(req.body.bodies)) {
      return res.status(400).json({ error: 'bodies が不正です' });
    }
    const message = String(req.body.message || '').trim().slice(0, 500);
    if (!message) return res.status(400).json({ error: 'メッセージが入力されていません' });
    const history = Array.isArray(req.body.history)
      ? req.body.history.slice(-24).map(t => ({
          role: t && t.role === 'model' ? 'model' : 'user',
          text: String((t && t.text) || '').trim().slice(0, 1000),
        })).filter(t => t.text)
      : [];
    const turns = history.concat([{ role: 'user', text: message }]);
    try {
      const systemText = buildChatSystemContext(
        topic.trim().slice(0, 300), stance, req.body.bodies, req.body.evaluation || null, req.body.pointsReview || null);
      const reply = await callGeminiChat(systemText, turns, apiKey, model);
      return res.status(200).json({ reply });
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
