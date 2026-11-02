# 英検1級 Essay Trainer — 仕様書（SPEC）

> 目的：このアプリの仕様を、別のAI／開発者が**正確かつ網羅的に**把握し、改修・拡張を継続できるようにするためのリファレンス。
> 記述は現行コード（main）に準拠。コード内の識別子・環境変数名はそのまま記載する。

---

## 1. 概要

- **何のアプリか**：英検1級の英作文（エッセイ）の**本論 Body 1〜3 を生成・学習・暗記**するためのWebアプリ。導入（Introduction）と結論（Conclusion）は生成対象外で、**本論3段落のみ**を扱う。
- **想定ユーザー**：英検1級エッセイを学習する日本語話者（単一ユーザー運用。アカウント概念なし）。
- **設計思想**：**ビルド不要・ログイン不要・最小コスト**。フロントは素の HTML/CSS/JS（バニラ）。React/TypeScript/バンドラは不使用。

---

## 2. 技術スタック / アーキテクチャ

- **フロントエンド**：バニラ JavaScript + HTML + CSS。ビルド工程なし。`<script>` で直接読み込む。状態駆動の `render()`（HTML文字列を組み立てて `#app.innerHTML` に差し込む）＋ `data-action` 属性によるイベント委譲。
- **バックエンド**：Vercel サーバーレス関数が2つ。
  - `api/generate.js` … Gemini API プロキシ（APIキーを秘匿）。
  - `api/data.js` … クラウド同期（Vercel Blob）。
- **外部API**：Google Gemini（既定モデル `gemini-2.5-flash`）。
- **永続化**：主にブラウザ `localStorage`。任意でクラウド同期（Vercel Blob）。
- **ホスティング/デプロイ**：Vercel。main への push で本番デプロイ。
- **PWA**：`manifest.webmanifest` ＋ `icons/`（ペン先＋原稿行のアイコン）。インストール可能。Service Worker（オフライン）は未実装。

### 環境変数（Vercel 側）
| 変数 | 用途 | 必須 |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio の APIキー。ブラウザには渡さない | 必須 |
| `APP_KEYWORD` | アプリ利用の「合言葉」。ブラウザが送る keyword と一致判定 | 必須 |
| `GEMINI_MODEL` | 使用モデル（省略時 `gemini-2.5-flash`） | 任意 |

---

## 3. ファイル構成

| パス | 役割 |
|---|---|
| `index.html` | 唯一のHTML。`#app` に全UIを描画。`<script>` でJSを順に読み込む。`?v=NN` はキャッシュバスター（クライアント変更時に番号を上げる） |
| `css/style.css` | 全スタイル。テーマは CSS 変数（light/dark、auto対応） |
| `js/templates.js` | 役割・分類の定数（`BODY_ROLES`, `BODY2_VARIANTS`, `ARG_LAYERS`, `ARG_DOMAINS`, ドリル用 `DRILL_*`, `TEMPLATE_PHRASES`）と `roleForBody()`, `bodyText()` |
| `js/presets.js` | プリセットのテーマ一覧（`PRESET_THEMES`, 14件）、サンプルエッセイ、`CATEGORIES` |
| `js/gemini.js` | `/api/generate` 呼び出しラッパ群（`apiCall` と各mode用関数）、`parseBody`（日本語混入ガード付き） |
| `js/drill.js` | 観点だしドリル（マトリクス走査）サブシステム一式＋ `handleDrillAction()`。**現在 `DRILL_ENABLED=false` で非公開** |
| `js/app.js` | アプリ本体（状態・`render()`・各ビュー/モーダル・イベント処理・クラウド同期）。約1,600行 |
| `api/generate.js` | Gemini プロキシ（全モードのプロンプト生成・整形・検証・429処理） |
| `api/data.js` | クラウド同期（load/save を Vercel Blob に） |
| `manifest.webmanifest`, `icons/` | PWA 設定とアイコン |
| `tests/` | E2E テスト（Playwright）。`npm test` で実行 |

---

## 4. データモデル（localStorage に保存される形）

### set（エッセイ1本） — `localStorage['et.sets']` は set の配列（新しい順）
```
{
  id: string,            // 'gen-...'(生成) / 'own-...'(貼り付け) / 'preset-...'(サンプル)
  topic: string,         // お題（英語）
  topicJa: string,       // お題の日本語訳（任意）
  stance: 'agree' | 'disagree',
  source: 'gemini' | 'self' | 'preset',
  createdAt: number,     // epoch ms
  bodies: Body[3],       // 下記
  evaluation: Evaluation | null,
  memo?: string,         // 📝 メモ（自動保存）
  vocab?: Vocab,         // 📒 覚える語彙（抽出結果）
  pinned?: boolean,      // 🔒 保護（再生成・削除・編集を抑止）
  drillId?: string,      // ドリル由来の場合、元ドリル記録ID（現在は非公開）
  chat?: [...]           // 旧チャット履歴。機能削除済みで未参照（残存データは無害）
}
```

### Body（本論1段落）
```
{
  argument: string,      // 「この構成の3観点」。Introductionで使える名詞句（下記 §7）
  sentences: string[],   // 本文（通常4文。1文=1要素）。英語のみ
  ja: string,            // 段落全体の和訳（空のこともある）
  mode?: 'empirical' | 'scenario',  // Body 2 のみ：実証型/思考実験型
  axisLayer?: string,    // 主体軸の en 値（individuals/society/the nation/the world）
  axisDomain?: string,   // 領域軸の en 値（economy/technology/rights/culture/health）
  original?: {...},      // 生成直後の原文スナップショット（「元の模範解答に戻す」用）
  prev?: {...},          // 直前状態スナップショット（「↩️ 直前に戻す」用、1段）
  jaStale?: boolean      // 本文編集後、和訳が未更新の印（再採点で解消）
}
```

### Evaluation（採点結果）
```
{ structure: number, content: number, language: number,  // 各 0〜10
  average: number,                                        // 3項目平均
  comments: { structure: string, content: string, language: string } }  // 日本語講評
```

### Vocab（語彙抽出結果）
```
{ verbs: {en,ja}[], collocations: {en,ja}[], idioms: {en,ja}[] }  // 各最大15、重複除去
```

---

## 5. ストレージ & クラウド同期

### localStorage キー（`LS` オブジェクト）
```
et.keyword        合言葉（この端末に保存）
et.sets           エッセイ配列
et.progress       進捗
et.customThemes   自作テーマ
et.drills         ドリル記録（非公開機能）
et.hiddenThemes   非表示にしたプリセットテーマの topic 一覧
et.seeded.v5      サンプル再シード用バージョン印
et.cloudDirty     クラウド未送信の変更あり印
et.theme          auto | light | dark
et.readRate / et.readPitch / et.readVoice / et.readRepeat   音読設定
```

### クラウド同期（任意・Vercel Blob）
- `saveSetsList` 等が `cloudMarkDirty()` を呼び、約2.5秒後に `/api/data`(op:`save`) へ全データ（sets/progress/customThemes/hiddenThemes/drills を1JSONに束ねる）をアップロード。
- セッション開始時 `cloudInit()`：未送信変更があればローカル優先でアップロード、なければ `/api/data`(op:`load`) でクラウド→ローカル反映。
- Blob 未設定環境では `/api/data` が `501` を返し、**自動でローカルのみ運用**にフォールバック（`CLOUD.enabled=false`）。
- 合言葉をキーにした「1人分まるごと」バックアップ。検索・部分更新はしない（＝KV/オブジェクトストレージ的用途。DBではない）。

---

## 6. サーバーAPI

### 共通
- すべて `POST /api/generate`、本文に `{ mode, keyword, ... }`。
- **合言葉ゲート**：`keyword` が `APP_KEYWORD` と不一致なら `401`。クライアントは401で合言葉をクリアし再入力を促す（`authErrorState`）。
- **429（クオータ）**：per-day（1日の上限）と per-minute（分間上限）を区別し、待機秒数つきのメッセージを返す。
- クライアント側ラッパは `js/gemini.js`。

### /api/generate のモード一覧
| mode | 用途 | 主な入力 | 返り値 |
|---|---|---|---|
| `verify` | 合言葉検証のみ | keyword | ok/401 |
| `essay` | 本論3段落を生成 | topic, stance, (worksheet) | `{ bodies: Body[3], evaluation? }` |
| `evaluate` | 採点＋観点/軸/和訳の最新化（相乗り） | topic, stance, bodies | `{ evaluation, arguments[3], axes[3]{layer,domain}, translations[3] }` |
| `extractVocab` | 動詞/コロケーション/イディオム抽出 | topic, bodies | `{ vocab }` |
| `rewriteBody` | 指定観点で特定Bodyを書き直し | topic, stance, bodyIndex, point, (bodyMode) | Body |
| `switchBody2` | Body2 を実証型⇔思考実験型に変換 | topic, stance, targetMode, argument | Body(mode付) |
| `themes` | 新テーマ案を生成 | existingTopics | `{ themes[] }` |
| `drillChanges`/`drillScan`/`drillFilter`/`reviewDrill` | ドリル用（非公開） | — | — |

- **日本語混入ガード**：`sentences` は英語のみ。かな/カナ/漢字を含む場合、生成を不正として弾く（サーバー `normalizeBody` ＋ クライアント `parseBody` の二重防御）。
- `evaluate` は「採点」1回の応答に、本文に合わせた **arguments（観点）・axes（主体×領域）・translations（和訳）** を相乗りで返す（追加API呼び出しなし）。本文編集→再採点でこれらが最新化される。

### /api/data（クラウド同期）
- `POST /api/data` に `{ keyword, op, data }`。`op: 'load' | 'save'`。Blob 未設定時は `501`。

---

## 7. エッセイの構成仕様（プロンプトの中核）

### Body の役割（固定） — `BODY_ROLES` / `BODY2_VARIANTS`
- **Body 1：因果必然型**（functions: 主張 / メカニズム / 深刻化・拡大 / 利害への着地）
- **Body 2：実証型**（主張 / 一般論の説明 / 証拠 / 含意）… `mode='empirical'`
  - 切替可：**思考実験型** `mode='scenario'`（主張 / 前提設定 / 帰結の連鎖 / 含意）。事実知識が無くても書ける型。
- **Body 3：譲歩反駁型**（主張 / 譲歩 / 反駁 / 決着）

### 4文アーキテクチャ（`BODY_ARCHITECTURE`）
- 各 Body は**ちょうど4文**、各文が固定機能を持つ。1文≒12〜15語、段落計45〜60語。
- 3つの Body は異なる修辞モードを使い、繰り返しを避ける。
- **Body 3 の文法ルール**：譲歩→反駁は「While …, this is not the case …（However無し）」または「It is true that …. However, …」のどちらか一貫した型。**"While …, However …" の二重逆接は禁止**。

### argument（＝「この構成の3観点」） — `ARGUMENT_PRINCIPLES`
- **Introduction でそのまま3点として並べられる名詞句**（例：“this essay will discuss X, Y, and Z”）。
- 原則：①名詞句（約5〜9語、冠詞始まり、文や that 節や動詞始まりは不可）②中立 ③構造的 ④一段抽象 ⑤3つを並列形で。
- UI の「🧭 この構成の3観点」カードに、各観点＋「Introduction 用：X, Y, and Z」の列挙行を表示。

### 2軸分類（`ARG_LAYERS` × `ARG_DOMAINS`、MECE）
- **主体軸**：個人 / 社会 / 国家 / 世界（individuals / society / the nation / the world）
- **領域軸**：経済 / 技術 / 権利 / 文化 / 健康（economy / technology / rights / culture / health）
- 各観点に「主体×領域」を1つずつ付与（例：`個人×経済`）。`evaluate` 相乗りで算出。

### テーマ分類 `CATEGORIES`
`['テクノロジー','環境','教育','社会','政治','医療・健康']`

---

## 8. 機能一覧（ユーザー向け挙動）

- **エッセイ生成**：テーマを選び賛成/反対を決めると、Gemini が Body 1〜3 を生成。生成直後に採点をバックグラウンド実行。
- **採点（evaluate）**：structure/content/language を各10点＋平均、日本語講評。相乗りで観点・2軸・和訳も最新化。失敗時は握りつぶさず通知（429バナー / 401合言葉モーダル）。
- **本文の全文編集**：各 Body を1文＝1テキストエリアで**全文自由編集**（定型表現含む）。保存で再採点、和訳も更新。※色分け表示は廃止（プレーン表示＋機能ラベルのみ）。
- **二段 Undo**：編集/書き直し/型切替/模範解答リセットの直前状態を `prev` に退避。「↩️ 直前に戻す」で現在⇔直前をトグル。「元の模範解答に戻す」は生成直後に復帰。
- **観点を指定して書き直す**：各Bodyに観点（日本語可）を与え、役割を保ったまま Gemini が書き直し。
- **Body2 型切替**：実証型⇔思考実験型。
- **🔒 保護（ピン留め）**：保護中は再生成・削除・本文編集を抑止。一覧に「🔒 保護」バッジ、削除ボタン非表示。
- **📝 メモ**：各エッセイに自動保存のメモ欄。
- **🔊 全文読み上げ**：Web Speech API で英語音読。設定で**速さ・声の高さ・声・繰り返し回数（既定10回）**を調整可、テスト再生あり。
- **📋 全文コピー**：**問題文（お題・立場）＋ Body 1〜3（和訳があれば併記）**をまとめてコピー。
- **📒 覚える語彙**：本文中の**動詞・コロケーション・イディオム**を和訳つきで抽出・一覧（セットに保存、再抽出可）。
- **✍️ 自作エッセイの貼り付け取り込み**：Body 1〜3 を空行区切りで貼り付け→文分割して取り込み（`source:'self'`、一覧に「自作」バッジ）。採点を押すと観点・2軸・スコアが付く。
- **テーマ管理**：プリセット14件＋自作追加＋Gemini でテーマ案生成。非表示/復元可。
- **設定**：合言葉（表示/非表示トグル）、配色テーマ（auto/light/dark）、音読設定、クラウド同期（今すぐ同期/エクスポート/インポート）。
- **観点だしドリル**：マトリクス走査の学習機能。**`DRILL_ENABLED=false` で現在非公開**（コードは `js/drill.js` に保持）。
- **（削除済み）Geminiに質問するチャット**：機能・コードとも削除。

---

## 9. UI / 実装の約束ごと

- **ビュー**：`state.view` = `home` | `study` | `loading` | `drill`。モーダルは `state.modal`（settings/keyword/stance/themeAdd/bodyEdit/bodyRewrite/pasteEssay/drillCell）。
- **描画**：`render()` が現在状態から全HTMLを組み立て `#app` に反映。入力中の値は state に同期して再描画で失わないようにする。
- **イベント**：`#app` への委譲。`data-action="xxx"` を `click` ハンドラの分岐で処理。ドリルは `handleDrillAction()` に委譲。
- **共通ヘルパー（重複排除）**：
  - `requireKeyword(msg)`：合言葉未入力なら合言葉モーダルを開き true（呼び出し側は return）。
  - `authErrorState(msg?)`：401時に合言葉クリア＋再入力促し。
  - `beginBodyMutation(body)`：Body変更直前に `prev` 退避＋初回のみ `original` 退避。
- **フラグ**：`DRILL_ENABLED`（ドリル公開可否）。
- **キャッシュバスター**：クライアント（js/css）変更時は `index.html` の `?v=NN` を全箇所インクリメント。サーバーのみの変更では不要。

---

## 10. テスト

- **場所/実行**：`tests/`。`npm test`（＝`node tests/run-all.js`）で全スイート実行。1つでも失敗で終了コード1。
- **性質**：**本物のフロントコードを実ブラウザ（Chromium/Playwright）で動かす E2E**。ただし**外部連携（`/api/generate`・`/api/data`）はモック**（`page.route` で固定応答）。→ 決定的・無料・オフライン。
- **境界**：ブラウザ側連携コード（`js/gemini.js` の `apiCall` 等）までは本物。`api/*` 以降（サーバー関数＋本物のGemini）は実行されない＝**このテストの対象外**。
- **環境変数**：`PW_MODULES`（playwright の node_modules）、`PW_CHROMIUM`（Chromium 実行ファイル）で上書き可。
- **スイート**：render-edit / paste-import / protect-memo / read-settings / eval-feedback / axes-refresh / undo / vocab-extract / copy-essay。
- **運用**：改修・新機能のたびに `npm test` で退行確認。新機能には対応スイート（check）を1本追加していく。

---

## 11. デプロイ / 開発フロー

1. 作業ブランチ（`claude/eiken-essay-framework-app-*`）で実装・コミット・push。
2. `npm test` で確認。
3. ユーザー承認後、main へ ff マージ＋push。
4. **main への push をトリガーに Vercel が本番デプロイ**。作業ブランチはプレビューデプロイが出ることがある（本番は別）。
- 消えて困る成果は必ず Git にコミット＆push（開発環境はセッション単位で使い捨て）。

---

## 12. 既知の制約・非ゴール

- **既存エッセイの一括更新は不可**：仕様変更（例：観点をIntro名詞句化）は、新規は即時、**既存は次回の再採点時**に反映。各端末の localStorage に外部から書き込めないため。
- **サーバー関数と本物のGeminiはE2E対象外**：最終確認はプレビュー/本番での手動確認が必要。
- **オフライン非対応**（Service Worker 未実装）。
- **単一ユーザー前提**：マルチユーザー・検索・集計が必要になれば DB 導入が前提となる（現状は不要）。
- **クラウド同期は結果整合ではなく即時（Blob）**だが、複数端末同時編集の衝突解決は素朴（最後の保存が勝つ）。

---

*この文書はコード（main）から抽出した事実に基づく。機能追加時は本書の該当節も更新すること。*
