# 英検1級 Essay Trainer

英検1級のエッセイ Body パラグラフを「固定テンプレート × スロット（ワイルドカード）」方式で構築・暗記するための Web アプリです。

## コンセプト

Body 1〜3 は次の4文構造（主張 → 原理 → 条件と帰結 → 結論）の固定テンプレートで、埋めるスロットは共通の6つです。

| スロット | 役割 | 例（AI規制） |
|---|---|---|
| Reason | 観点（動詞で考えて名詞化、5〜8語） | the large-scale replacement of workers by AI |
| General principle | 原理（メカニズムまで述べる節、8〜13語） | AI handles complex judgment tasks at minimal cost |
| Condition | 条件 | companies automate without restraint |
| Result | 結果（主張と同じ方向・具体的に） | widespread structural unemployment |
| Key concept | キー概念 | unregulated automation |
| Conclusion | 結論 | destabilizing the labor market |

各 Body は例証文を省いた軽量テンプレート（固定 22 / 18 / 20 語）を使い、浮いた語数を観点・原理・結果の厚みに充て、組み立て後 45〜50 語程度に収まるよう生成されます。

思考の型：**A does B（動き）→ because（なぜ）→ leads to C（どう悪くなる／なぜ必要）**

## 使い方

1. **初回起動時に合言葉を入力** — サーバー側で検証され、この端末に保存されます（スキップするとサンプル練習のみ利用可）
2. **テーマを選ぶ** — カテゴリ別のテーマ案から選択（Gemini で新しいテーマ案の追加生成も可能）
3. **スタンスを選ぶ** — 賛成（YES）／反対（NO）
4. **論点出しトレーニング** — 生成の前に90秒のタイマー付きで自分の論点を3つ入力（A does B の形、日本語可）。Gemini が各論点の有効性を判定し、生成された論点と並べて比較表示（スキップも可能）
5. **Gemini が例文を生成** — テンプレートに沿って Body 1〜3 のスロット値＋和訳を自動生成（各 Body 約45〜55語）
6. **Gemini が試験官として採点** — 構成・内容・英語表現の3観点（各10点）で自己採点し、平均8.0未満なら講評をフィードバックして1回だけ自動再生成。採点結果は学習画面に表示
7. **練習する** — テンプレートのワイルドカード部分が空欄で表示され、シャッフルされた単語チップを正しい順にタップして文章を組み立てる
8. **自分の言葉で書き換える** — 練習中の空欄（「✍️ 自分の言葉で」）や学習画面のスロット（タップ）から自由に英文を入力すると、Gemini が適否を判定（✅問題なし／△修正あり／✖不適合）し、添削文と日本語解説・更新された和訳を提示。ワンタップで模範解答を自分の表現に置き換えられ、「元の模範解答に戻す」も可能
9. **進捗を確認** — Body ごとの実施回数・ベスト正答率を記録

エッセイ1本の生成にかかる Gemini API 呼び出しは通常2回（生成＋採点）、最大でも6回（語数リトライ・再生成・再採点を含む）に制限されています。

合言葉なしでも、同梱のサンプルエッセイ2本（AI規制・大学無償化）で練習できます。

## アーキテクチャとセキュリティ

Gemini API キーは **ブラウザには一切渡されません**。ブラウザは Vercel サーバーレス関数 `/api/generate` を呼び出し、関数がサーバー側の環境変数からキーを読んで Gemini API に中継します。関数の利用には環境変数 `APP_KEYWORD` と一致する合言葉が必要です。

学習データ（生成したエッセイ・進捗）はブラウザの localStorage に保存され、設定画面から JSON エクスポート／インポートができます。

## セットアップ（Vercel）

1. このリポジトリを Vercel に Import（設定変更は不要。`api/` が自動でサーバーレス関数として認識されます）
2. Vercel のプロジェクト設定 → **Environment Variables** に以下を登録して再デプロイ：

| 変数名 | 内容 |
|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) で取得した API キー（必須） |
| `APP_KEYWORD` | アプリ利用時の合言葉（必須・自由な文字列） |
| `GEMINI_MODEL` | 使用モデル（任意。省略時 `gemini-2.5-flash`） |

### ローカル開発

サーバーレス関数を含めて動かすには Vercel CLI を使います：

```bash
npx vercel dev
```

（`GEMINI_API_KEY` と `APP_KEYWORD` を `.env` または環境変数で指定）

## ファイル構成

```
index.html        エントリポイント
css/style.css     スタイル
js/templates.js   Body 1〜3 テンプレート定義（固定テキスト＋スロット）
js/presets.js     プリセットテーマとサンプルエッセイ
js/gemini.js      /api/generate 呼び出し（合言葉付き）
js/app.js         画面・練習ロジック・進捗管理
api/generate.js   Vercel サーバーレス関数（Gemini プロキシ＋合言葉検証）
```
