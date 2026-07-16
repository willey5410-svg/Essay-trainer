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

/* 観点だしドリル（マトリクス走査）の2軸。
   横軸=影響を受ける層、縦軸=価値ドメイン。en はプロンプト用の英語名。 */
const DRILL_LAYERS = [
  { ja: '個人', en: 'individuals' },
  { ja: '社会・国家', en: 'society and the nation' },
  { ja: '世界', en: 'the world' },
  { ja: '将来世代', en: 'future generations' },
];
const DRILL_DOMAINS = [
  { ja: '経済', en: 'economy' },
  { ja: '健康', en: 'health' },
  { ja: '制度', en: 'institutions' },
  { ja: '技術', en: 'technology' },
  { ja: '環境', en: 'environment' },
  { ja: '公平', en: 'fairness' },
  { ja: '倫理', en: 'ethics' },
];

/* ドリル各ステージの目安時間（秒）。全体タイマーは5分。 */
const DRILL_STAGE_GUIDE = { 1: 60, 2: 120, 3: 90, 4: 30 };
const DRILL_TOTAL_SECONDS = 300;

/* テンプレート由来の定型表現。学習画面でこれ以外（＝生成された内容部分）を色分け表示する。
   正規表現の選択肢は先頭から順に試されるため、長いフレーズを先に並べること。 */
const TEMPLATE_PHRASES = [
  // 長い/特徴的なフレーズを先に（正規表現は先頭から順に試される）
  'The first thing to consider is that',
  'Another related point is that',
  'The biggest reason is that',
  'is just another example of',
  'It makes no economic sense',
  'more illusory than real',
  'While some may argue that',
  'Studies have shown that',
  'The first point concerns',
  'experience shows that',
  'which would ultimately',
  'thus contributing to',
  'will become intolerable',
  'this is not the case',
  'One reason is that',
  'My final argument',
  'inevitably leads to',
  'Another point is',
  'It is true that',
  'This means that',
  'This is because',
  'This will benefit',
  'A third factor is',
  'Another reason is',
  'Sooner or later,',
  'For this reason,',
  'This burden on',
  'In order to',
  'In the past,',
  'These days,',
  'For example,',
  'First of all,',
  'As a result,',
  'Initially,',
  'In time,',
  'In fact,',
  'Secondly,',
  'Therefore,',
  'Moreover,',
  'However,',
  'Finally,',
  'Lastly,',
  'such as',
  'also grows',
];

/* body.sentences（文の配列）を1つの段落テキストに連結する */
function bodyText(body) {
  return (body && Array.isArray(body.sentences) ? body.sentences : [])
    .map(s => String(s || '').trim())
    .filter(Boolean)
    .join(' ');
}
