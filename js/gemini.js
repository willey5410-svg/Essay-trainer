/* Gemini API 連携
   - generateEssaySet(theme, stance): テーマ×スタンスから Body1〜3 のスロット値＋和訳を生成
   - generateThemes(existingTopics): 新しいテーマ案を生成 */

const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';

async function geminiJSON(promptText) {
  const apiKey = localStorage.getItem('et.apiKey');
  if (!apiKey) throw new Error('Gemini APIキーが未設定です（設定画面から登録してください）');
  const model = localStorage.getItem('et.model') || GEMINI_DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { temperature: 0.8, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error?.message || ''; } catch (e) { /* ignore */ }
    throw new Error(`Gemini APIエラー (${res.status}) ${detail}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini から有効な応答が得られませんでした');
  return JSON.parse(text);
}

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

function cleanSlotValue(v) {
  return String(v || '').trim().replace(/[.。]+$/, '');
}

async function generateEssaySet(theme, stance) {
  const data = await geminiJSON(buildEssayPrompt(theme.topic, stance));
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
  };
}

async function generateThemes(existingTopics) {
  const data = await geminiJSON(buildThemePrompt(existingTopics));
  if (!data || !Array.isArray(data.themes)) throw new Error('生成結果の形式が不正です');
  return data.themes
    .filter(t => t && t.topic)
    .map(t => ({
      topic: String(t.topic).trim(),
      topicJa: String(t.topicJa || '').trim(),
      category: CATEGORIES.includes(t.category) ? t.category : '社会',
    }));
}
