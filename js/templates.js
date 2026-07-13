/* Body 役割定義
   各 Body は「役割の異なる4文」で構成される（新テンプレート）。
   - Body 1: 因果必然型 … 論理で「必ずそうなる」と示す
   - Body 2: 実証型     … 事実・例証で「現に起きている」と示す
   - Body 3: 譲歩反駁型 … 想定反論を潰して「反論しても崩れない」と示す
   各文には固定の機能（主張／メカニズム…）があり、学習画面でラベル表示する。 */

const BODY_ROLES = [
  { name: 'Body 1', type: '因果必然型', functions: ['主張', 'メカニズム', '深刻化・拡大', '利害への着地'] },
  { name: 'Body 2', type: '実証型', functions: ['主張', '一般論の説明', '証拠', '含意'] },
  { name: 'Body 3', type: '譲歩反駁型', functions: ['主張', '譲歩', '反駁', '決着'] },
];

/* body.sentences（文の配列）を1つの段落テキストに連結する */
function bodyText(body) {
  return (body && Array.isArray(body.sentences) ? body.sentences : [])
    .map(s => String(s || '').trim())
    .filter(Boolean)
    .join(' ');
}
