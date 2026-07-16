/* Vercel サーバーレス関数：Gemini API プロキシ
   - APIキーは環境変数 GEMINI_API_KEY にのみ保持し、ブラウザには渡さない
   - リクエストは環境変数 APP_KEYWORD と一致する合言葉（keyword）を要求する
   環境変数:
     GEMINI_API_KEY  … Google AI Studio の API キー（必須）
     APP_KEYWORD     … アプリ利用時の合言葉（必須）
     GEMINI_MODEL    … 使用モデル（省略時 gemini-2.5-flash） */

const crypto = require('crypto');

const DEFAULT_MODEL = 'gemini-2.5-flash';

/* 論点（argument）の3原則。各 Body の核となる論点の質を担保する。 */
const ARGUMENT_PRINCIPLES = `A strong argument follows three principles:
1. NEUTRAL: it describes WHAT changes, with no value judgment baked in (prefer "the labor force is reshaped" over "workers are harmed")
2. STRUCTURAL: it names a structural/systemic change (educational structure, labor-force structure, information flow, decision-making, social institutions, evaluation systems, market structure, technological development, resource allocation) rather than "who benefits"
3. ABSTRACT: it is one level more abstract than a narrow concrete anecdote (e.g. "AI does my homework" → "the learning process is altered")`;

/* 3つの Body に与える「4文アーキテクチャ」。1文=1機能で役割を固定しつつ、
   模範解答12本から抽出した「展開の武器」「実証の格付け」で②③を強くする。 */
const BODY_ARCHITECTURE = `Each body paragraph MUST consist of EXACTLY FOUR sentences, each performing a fixed function (about 12–15 words each). The three bodies use DIFFERENT rhetorical modes so the essay never feels repetitive. Every sentence is complete: capitalized start, period at the end.

BODY 1 — Causal-necessity mode (論理: "it must logically follow"):
  1 Claim: "First of all, [the argument] inevitably leads to [a consequence]."
  2 Mechanism: explain WHY — the linked-growth pattern is the default: "As [one change occurs], [a linked change] also grows / will fail."
  3 Escalation: push to a graver stage: "Sooner or later, [a worse consequence follows]." (or "In fact, [real-world backing].")
  4 Stakes: land on who is affected: "This burden on [group] will become intolerable." / "This will greatly benefit [group]."

BODY 2 — Empirical mode (実証: "it is actually happening"):
  1 Claim: "Secondly, [claim]."
  2 General explanation: "This is because ..." / "[subject] are becoming able to ..."
  3 Evidence: use the STRONGEST phrase you can honestly support, in descending strength:
     "Studies have shown that ..." > "experience shows that ..." > "In fact, [something really occurring]." > "[subject] are already -ing ..." > "These days, we often see ..." > "For example, [a concrete case]." > "..., such as [a real broad example like China, India, developing countries]."
     Use a real but broad example — NEVER invent statistics or fake proper nouns.
  4 Implication: "This means that [a society-level consequence]."

BODY 3 — Concession-rebuttal mode (防御: "even the counterargument fails"):
  1 Claim: "Finally, [claim]."
  2 Concession: "It is true that [a plausible counterargument]." / "While some may argue that [counterargument],"
  3 Rebuttal: "However, this is not the case, because [why it fails]." / "However, [the limit of that counterargument]."
  4 Resolution: "Therefore, [why your side prevails]." / "For this reason, [your argument wins]."
  ALTERNATIVE when a clean rebuttal is hard — CONTRAST type: 1 Claim → 2 "In [the conventional approach], [a drawback]." → 3 "With [the approach you support], [an advantage]." → 4 resolution.

EXPANSION WEAPONS for sentences 2–3 (choose the ONE that best fits the topic; do NOT force every body to use one):
- Time-contrast: "In the past, [old state]. Now, thanks to [cause], [new state]." — turns the change itself into the argument.
- Conditional-scenario (powerful for a negative stance): "If [X] were to [happen], [a bad thing] could [occur], which would ultimately harm [a large value such as democracy or public trust]." — escalate to a big value.
- Appearance-vs-reality (front-loads rebuttal; good for Body 1 on a negative stance): "Initially, [X] seems to [bring a benefit]. These benefits, however, are more illusory than real, because [reality]."
- Principle-vs-reality: "The principle of [X] is important. However, experience shows that [the reality falls short]."
- Time-chain: "When [event happens], [a first effect]. In time, [a later effect], thus contributing to [an outcome]."

CONSEQUENCE endings for sentence 4 (vary them; use "This means that" in AT MOST one body): "As a result, ..." (Body 1) / "This means that ..." (Body 2) / "Therefore, ..." or "For this reason, ..." (Body 3) / "..., which would ultimately harm [a large value]" / "..., thus contributing to [an outcome]".

CAUSAL-STRENGTH verbs to vary force: inevitably leads to / puts a great strain on / exacerbates / helps alleviate / enables [A] to [do] / "It makes no economic sense to ... when ...".

PARAGRAPH MARKERS — keep ONE system, but you MAY drop the marker on exactly ONE body if its subject already signals a new point: standard (First of all / Secondly / Finally); noun-subject (One reason is that / Another reason is / A third factor is); emphatic (The biggest reason is that / Another related point is that / My final argument ...). Content-bearing markers read better than a bare "Thirdly".`;

function buildEssayPrompt(topic, stance, worksheet) {
  const stanceText = stance === 'agree'
    ? 'AGREE — support the statement / answer YES'
    : 'DISAGREE — oppose the statement / answer NO';
  const wsSection = worksheet ? `

LEARNER'S BRAINSTORMING WORKSHEET (from a matrix-scan drill; notes may be in Japanese or rough English):
${worksheet.points.map((p, i) => `Body ${i + 1} (${['causal-necessity', 'empirical', 'concession-rebuttal'][i]}) — perspective: [${p.layer} × ${p.domain}]
  idea: ${p.idea}
  mechanism draft: ${p.mech || '(none)'}
  example: ${p.example || '(none)'}
  vocabulary the learner has: ${p.vocab || '(none)'}`).join('\n')}${worksheet.concession ? `
Concession material for Body 3 (a point favoring the OPPOSITE side, to concede then rebut): ${worksheet.concession}` : ''}

Worksheet rules (IMPORTANT):
- ADOPT each idea as that body's core argument — rephrase it into a proper English noun phrase satisfying the three principles; do not silently replace it with a different argument.
- Body 1: build sentence 2 on the learner's mechanism draft, correcting the English.
- Body 2: use the learner's example in the evidence sentence if it is real and appropriate.
- Body 3: build the concession sentence from the concession material when provided.
- Prefer the learner's vocabulary where natural, upgrading only when needed.` : '';
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
- For each body, also provide "ja": a natural Japanese translation of the FULL paragraph.${wsSection}

Return ONLY this JSON structure:
{"bodies":[{"argument":"...","sentences":["...","...","...","..."],"ja":"..."},{...},{...}]}`;
}

/* 観点だしドリル（マトリクス走査）のワークシート全体を講評するプロンプト */
function buildReviewDrillPrompt(topic, ws) {
  const stanceText = ws.stance === 'agree' ? 'AGREE / YES' : 'DISAGREE / NO';
  return `You are an expert coach for the EIKEN Grade 1 English essay brainstorming stage.
A learner practiced a structured "matrix scan" drill: convert the topic into a list of increases/decreases, then mechanically scan a matrix of affected layers (individuals / society and the nation / the world / future generations) × value domains (economy / health / institutions / technology / environment / fairness / ethics), asking at each cell "is this a plus or minus for this layer's domain?". Then they picked a stance (the side with MORE candidates), filtered candidates by three criteria (① a one-sentence mechanism like "As X grows, Y also grows" ② a real broad example like China/India ③ having the English vocabulary), keeping 3 finalists from mutually different rows AND columns, and cast them into Body roles (solid mechanism → causal, vivid example → empirical, visible counterargument → rebuttal). Discarded opposite-side points become Body 3 concession material.

TOPIC: ${topic}

STEP 1 — CHANGE LIST (what increases / decreases):
${ws.changes.map(c => `- ${c.dir === 'dec' ? 'DECREASES' : 'INCREASES'}: ${c.text}`).join('\n')}

STEP 2 — MATRIX SCAN CANDIDATES (each candidate traces back to ONE change from Step 1; cell = layer × domain; side = which stance it favors):
${ws.candidates.map((c, i) => `${i + 1}. from change "${c.change}" → [${c.layer} × ${c.domain}] (favors ${c.side === 'agree' ? 'AGREE' : 'DISAGREE'}): ${c.note}`).join('\n')}

STEP 3 — CHOSEN STANCE: ${stanceText}
FINALISTS (3, self-checked against the three criteria):
${ws.finalists.map((f, i) => `${i + 1}. [${f.layer} × ${f.domain}] ${f.note}
   mechanism draft: ${f.mech || '(none)'}
   example: ${f.example || '(none)'}
   vocabulary: ${f.vocab || '(none)'}`).join('\n')}

STEP 4 — CASTING: Body 1 (causal) = finalist ${ws.casting[0] + 1}, Body 2 (empirical) = finalist ${ws.casting[1] + 1}, Body 3 (rebuttal) = finalist ${ws.casting[2] + 1}
CONCESSION MATERIAL: ${ws.concession || '(none chosen)'}

Review the worksheet IN JAPANESE, concretely and encouragingly:
- changesReview: is the change list truly neutral increases/decreases, or did claims/judgments leak in? Quote the problematic item if any.
- scanReview: quality and coverage of the scan — were ALL change-list items actually traced into at least one cell (name any change from Step 1 that was never scanned), were both sides scanned, and were cells well spread across layers/domains rather than clustered?
- missedCells: up to 3 promising cells the learner did NOT fill, each with a one-line idea (use the Japanese layer names 個人/社会・国家/世界/将来世代 and domain names 経済/健康/制度/技術/環境/公平/倫理).
- filterReview: are the three finalists really the strongest picks? Was the three-criteria self-check honest?
- mechCorrections: for each finalist whose mechanism draft has English errors or is weak, give a corrected one-sentence version (index = finalist number 1-3; skip good ones).
- castingReview: is each finalist in the right Body role, and is the concession material usable? Suggest swaps if better.
- modelPicks: YOUR OWN best 3 picks for this stance — layer (Japanese), domain (Japanese), argument (English noun phrase, 5-8 words), role (one of 因果必然型/実証型/譲歩反駁型).
- overall: 2-3 sentence summary with the single most important next step.

Return ONLY this JSON:
{"overall":"...","changesReview":"...","scanReview":"...","missedCells":[{"layer":"...","domain":"...","idea":"..."}],"filterReview":"...","mechCorrections":[{"index":1,"corrected":"...","comment":"..."}],"castingReview":"...","modelPicks":[{"layer":"...","domain":"...","argument":"...","role":"..."}]}`;
}

/* ドリル講評の検証・整形（不正なら null） */
function normalizeDrillReview(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const s = (v, n) => String(v || '').slice(0, n);
  const overall = s(raw.overall, 600);
  if (!overall) return null;
  return {
    overall,
    changesReview: s(raw.changesReview, 600),
    scanReview: s(raw.scanReview, 600),
    missedCells: (Array.isArray(raw.missedCells) ? raw.missedCells : []).slice(0, 4).map(m => ({
      layer: s(m && m.layer, 20), domain: s(m && m.domain, 20), idea: s(m && m.idea, 200),
    })).filter(m => m.idea),
    filterReview: s(raw.filterReview, 600),
    mechCorrections: (Array.isArray(raw.mechCorrections) ? raw.mechCorrections : []).slice(0, 3).map(m => ({
      index: Math.max(1, Math.min(3, Number((m && m.index) || 1))),
      corrected: s(m && m.corrected, 300), comment: s(m && m.comment, 300),
    })).filter(m => m.corrected),
    castingReview: s(raw.castingReview, 600),
    modelPicks: (Array.isArray(raw.modelPicks) ? raw.modelPicks : []).slice(0, 3).map(m => ({
      layer: s(m && m.layer, 20), domain: s(m && m.domain, 20),
      argument: s(m && m.argument, 200), role: s(m && m.role, 20),
    })).filter(m => m.argument),
  };
}

/* ドリルのマトリクス軸（templates.js の DRILL_LAYERS/DRILL_DOMAINS と一致させること） */
const DRILL_LAYER_NAMES = ['個人', '社会・国家', '世界', '将来世代'];
const DRILL_DOMAIN_NAMES = ['経済', '健康', '制度', '技術', '環境', '公平', '倫理'];

/* ドリル Stage 1 の増減リストが出せない学習者のために、Gemini に叩き台を作らせるプロンプト */
function buildDrillChangesPrompt(topic) {
  return `You are a coach for the EIKEN Grade 1 essay brainstorming stage.
A learner is doing a "matrix scan" drill and is stuck at Step 1: converting the topic into a NEUTRAL inventory of what would INCREASE and what would DECREASE if the proposition were realized/true. This is NOT a list of opinions — it is neutral raw material that perspectives will later be scanned from.

TOPIC: ${topic}

Produce 6 items, a mix of increases and decreases (aim for roughly 3 each). Each item MUST:
- be a NEUTRAL description of WHAT changes, with no value judgment (write "the amount of judgment delegated to AI", NOT "AI harms workers")
- be concrete enough to later scan against affected layers (individuals / society / world / future generations) and value domains (economy / health / institutions / technology / environment / fairness / ethics)
- be written IN JAPANESE, as one short phrase
- collectively span diverse domains and BOTH directions, so the later scan has material favoring either stance

Return ONLY this JSON:
{"changes":[{"dir":"inc","text":"..."},{"dir":"dec","text":"..."}]}
("dir" is "inc" for an increase, "dec" for a decrease)`;
}

function normalizeDrillChanges(raw) {
  if (!raw || !Array.isArray(raw.changes)) return null;
  const changes = raw.changes.slice(0, 6).map(c => ({
    dir: c && c.dir === 'dec' ? 'dec' : 'inc',
    text: String((c && c.text) || '').trim().slice(0, 120),
  })).filter(c => c.text);
  return changes.length ? changes : null;
}

/* ドリル Stage 2 のマトリクス走査を Gemini に代行させるプロンプト（増減リストを各交点で問う） */
function buildDrillScanPrompt(topic, changes) {
  return `You are a coach for the EIKEN Grade 1 essay brainstorming stage.
The learner is doing a "matrix scan" drill Step 2. From a neutral change list, they must scan a matrix of affected LAYERS × value DOMAINS, asking at each intersection "for THIS layer's THIS domain, does the proposition act as a plus (favoring AGREE) or a minus (favoring DISAGREE)?".

TOPIC: ${topic}

CHANGE LIST (numbered — cite which change each candidate traces back to):
${changes.map((c, i) => `${i + 1}. [${c.dir === 'dec' ? 'DECREASE' : 'INCREASE'}] ${c.text}`).join('\n')}

LAYERS (choose the exact Japanese name): ${DRILL_LAYER_NAMES.join(' / ')}
DOMAINS (choose the exact Japanese name): ${DRILL_DOMAIN_NAMES.join(' / ')}

Produce 6 candidate perspectives by scanning changes against intersections. Requirements:
- Spread them across DIFFERENT layers and DIFFERENT domains (avoid clustering in one row or column).
- Cover BOTH sides: some candidates must favor AGREE and some must favor DISAGREE, so a stance can later be chosen by count.
- Each candidate: cite the change it comes from (changeIndex, 1-based), the layer and domain (EXACT Japanese names from the lists above), the side it favors ("agree" or "disagree"), and a note.
- The note is IN JAPANESE: one short, NEUTRAL, structural phrase describing what happens at that intersection (describe the change, not "who is harmed"), one level more abstract than a narrow anecdote.

Return ONLY this JSON:
{"cells":[{"changeIndex":1,"layer":"個人","domain":"経済","side":"agree","note":"..."}]}`;
}

function normalizeDrillScan(raw, nChanges) {
  if (!raw || !Array.isArray(raw.cells)) return null;
  const cells = raw.cells.slice(0, 10).map(c => ({
    changeIndex: Math.max(1, Math.min(nChanges, Number((c && c.changeIndex) || 1))),
    layer: String((c && c.layer) || '').trim(),
    domain: String((c && c.domain) || '').trim(),
    side: c && c.side === 'disagree' ? 'disagree' : 'agree',
    note: String((c && c.note) || '').trim().slice(0, 200),
  })).filter(c => c.note && DRILL_LAYER_NAMES.includes(c.layer) && DRILL_DOMAIN_NAMES.includes(c.domain));
  // 同一セル（層×ドメイン）は先勝ちで一意化
  const seen = new Set();
  const out = [];
  for (const c of cells) {
    const k = c.layer + '|' + c.domain;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out.length ? out : null;
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
- structure: within each paragraph, does the four-sentence flow (claim → development → evidence/escalation → landing) hold together and read logically? Does each body use a rhetorical mode suited to its role, and does the essay VARY its argumentation (causal mechanism, empirical evidence, concession-rebuttal) rather than repeating one pattern or one consequence marker? Does Body 3 actually neutralize the counterargument?
- content: are the three arguments well-chosen, clearly distinct, and developed with real depth? Reward concrete mechanisms ("As X grows, Y also grows"), strong evidence phrasing (studies/experience/"in fact"/"already"), and escalation to a large value ("which would ultimately harm ...") over vague claims. Is it clear WHY each argument supports the stance?
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

/* エッセイの採点についてGeminiと会話するためのシステム文脈 */
function buildChatSystemContext(topic, stance, bodies, evaluation) {
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
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  // 各モードは Gemini 呼び出し1回のみで完結させる（Vercel の関数タイムアウト対策）。
  // 生成と採点を別リクエストに分離しているのもこのため。
  if (mode === 'essay') {
    if (typeof topic !== 'string' || !topic.trim() || !['agree', 'disagree'].includes(stance)) {
      return res.status(400).json({ error: 'topic / stance が不正です' });
    }
    const worksheet = sanitizeWorksheet(req.body.worksheet);
    const prompt = buildEssayPrompt(topic.trim().slice(0, 300), stance, worksheet);
    try {
      const parsed = await callGemini(prompt, apiKey, model);
      const bodies = Array.isArray(parsed.bodies) ? parsed.bodies.slice(0, 3).map(normalizeBody) : [];
      if (bodies.length < 3 || bodies.some(b => !b)) {
        return res.status(502).json({ error: '生成結果の形式が不正です（本文が揃っていません）' });
      }
      return res.status(200).json({ bodies });
    } catch (e) {
      return res.status(e.status || 502).json({ error: e.message });
    }
  }

  if (mode === 'drillChanges') {
    if (typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ error: 'topic が不正です' });
    }
    try {
      const raw = await callGemini(buildDrillChangesPrompt(topic.trim().slice(0, 300)), apiKey, model, 0.5);
      const changes = normalizeDrillChanges(raw);
      if (!changes) return res.status(502).json({ error: '増減リストの生成に失敗しました' });
      return res.status(200).json({ changes });
    } catch (e) {
      return res.status(e.status || 502).json({ error: e.message });
    }
  }

  if (mode === 'drillScan') {
    if (typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ error: 'topic が不正です' });
    }
    const changes = (Array.isArray(req.body.changes) ? req.body.changes : []).slice(0, 6)
      .map(c => ({ dir: c && c.dir === 'dec' ? 'dec' : 'inc', text: String((c && c.text) || '').trim().slice(0, 120) }))
      .filter(c => c.text);
    if (changes.length < 2) return res.status(400).json({ error: '増減リストが不足しています' });
    try {
      const raw = await callGemini(buildDrillScanPrompt(topic.trim().slice(0, 300), changes), apiKey, model, 0.5);
      const cells = normalizeDrillScan(raw, changes.length);
      if (!cells) return res.status(502).json({ error: '走査の生成に失敗しました' });
      return res.status(200).json({ cells });
    } catch (e) {
      return res.status(e.status || 502).json({ error: e.message });
    }
  }

  if (mode === 'reviewDrill') {
    if (typeof topic !== 'string' || !topic.trim() || !['agree', 'disagree'].includes(req.body.stance)) {
      return res.status(400).json({ error: 'topic / stance が不正です' });
    }
    const ws = sanitizeDrillWorksheet(req.body);
    if (!ws) return res.status(400).json({ error: 'ワークシートの形式が不正です' });
    try {
      const raw = await callGemini(buildReviewDrillPrompt(topic.trim().slice(0, 300), ws), apiKey, model, 0.3);
      const review = normalizeDrillReview(raw);
      if (!review) return res.status(502).json({ error: '講評の形式が不正です' });
      return res.status(200).json({ review });
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
        topic.trim().slice(0, 300), stance, req.body.bodies, req.body.evaluation || null);
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

/* ドリル→エッセイ生成に添えるワークシートの検証・整形（不正・欠落なら null＝通常生成） */
function sanitizeWorksheet(raw) {
  if (!raw || !Array.isArray(raw.points) || raw.points.length !== 3) return null;
  const s = (v, n) => String(v || '').trim().slice(0, n);
  const points = raw.points.map(p => ({
    layer: s(p && p.layer, 40), domain: s(p && p.domain, 40),
    idea: s(p && p.idea, 200), mech: s(p && p.mech, 300),
    example: s(p && p.example, 100), vocab: s(p && p.vocab, 100),
  }));
  if (points.some(p => !p.idea)) return null;
  return { points, concession: s(raw.concession, 200) };
}

/* reviewDrill リクエスト全体の検証・整形（不正なら null） */
function sanitizeDrillWorksheet(body) {
  const s = (v, n) => String(v || '').trim().slice(0, n);
  const changes = (Array.isArray(body.changes) ? body.changes : []).slice(0, 6)
    .map(c => ({ dir: c && c.dir === 'dec' ? 'dec' : 'inc', text: s(c && c.text, 120) }))
    .filter(c => c.text);
  const candidates = (Array.isArray(body.candidates) ? body.candidates : []).slice(0, 28)
    .map(c => ({
      layer: s(c && c.layer, 20), domain: s(c && c.domain, 20),
      side: c && c.side === 'disagree' ? 'disagree' : 'agree', note: s(c && c.note, 200),
      change: s(c && c.change, 120),
    })).filter(c => c.note && c.layer && c.domain);
  const finalists = (Array.isArray(body.finalists) ? body.finalists : []).slice(0, 3)
    .map(f => ({
      layer: s(f && f.layer, 20), domain: s(f && f.domain, 20), note: s(f && f.note, 200),
      mech: s(f && f.mech, 300), example: s(f && f.example, 100), vocab: s(f && f.vocab, 100),
    })).filter(f => f.note);
  const casting = Array.isArray(body.casting) ? body.casting.slice(0, 3).map(n => Math.max(0, Math.min(2, Number(n) || 0))) : null;
  if (changes.length < 2 || candidates.length < 3 || finalists.length !== 3 || !casting || casting.length !== 3) return null;
  return { stance: body.stance, changes, candidates, finalists, casting, concession: s(body.concession, 200) };
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
