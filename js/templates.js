/* Body テンプレート定義
   各テンプレートは「固定テキスト」と「スロット（ワイルドカード）」の列で構成される。
   スロット値を流し込むと完成文になる。 */

const SLOT_KEYS = ['reason', 'principle', 'condition', 'result', 'example', 'explanation', 'keyConcept', 'conclusion'];

const SLOT_LABELS = {
  reason: '観点',
  principle: '原理',
  condition: '条件',
  result: '結果',
  example: '具体例',
  explanation: '説明',
  keyConcept: 'キー概念',
  conclusion: '結論',
};

function T(text) { return { text }; }
function S(slot) { return { slot }; }

const TEMPLATES = [
  {
    name: 'Body 1',
    lines: [
      [T('First and foremost, '), S('reason'), T(' is a critical factor that must be considered.')],
      [T('This is because '), S('principle'), T('.')],
      [T('In essence, when '), S('condition'), T(', it inevitably leads to '), S('result'), T('.')],
      [T('A prominent example is seen in '), S('example'), T(', which '), S('explanation'), T('.')],
      [T('Therefore, it is evident that '), S('keyConcept'), T(' plays a decisive role in '), S('conclusion'), T('.')],
    ],
  },
  {
    name: 'Body 2',
    lines: [
      [T('Another important consideration is '), S('reason'), T('.')],
      [T('This stems from the fact that '), S('principle'), T('.')],
      [T('Put simply, whenever '), S('condition'), T(', it tends to result in '), S('result'), T('.')],
      [T('For instance, '), S('example'), T(', demonstrating how '), S('explanation'), T('.')],
      [T('Hence, it is clear that '), S('keyConcept'), T(' is essential for '), S('conclusion'), T('.')],
    ],
  },
  {
    name: 'Body 3',
    lines: [
      [T('A further point is '), S('reason'), T('.')],
      [T('The primary reason for this is that '), S('principle'), T('.')],
      [T('In other words, if '), S('condition'), T(', this can lead to '), S('result'), T('.')],
      [T('Evidence for this can be found in '), S('example'), T(', where '), S('explanation'), T('.')],
      [T('Accordingly, '), S('keyConcept'), T(' plays a vital role in '), S('conclusion'), T('.')],
    ],
  },
];

/* テンプレートとスロット値から完成文（プレーンテキスト）を組み立てる */
function assembleBody(tplIndex, slots) {
  return TEMPLATES[tplIndex].lines
    .map(line => line.map(p => p.text !== undefined ? p.text : (slots[p.slot] || '')).join(''))
    .join(' ');
}
