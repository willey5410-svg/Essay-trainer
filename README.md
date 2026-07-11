# 英検1級 Essay Trainer

英検1級のエッセイ Body パラグラフを「固定テンプレート × スロット（ワイルドカード）」方式で構築・暗記するための Web アプリです。

## コンセプト

Body 1〜3 は次の5文構造の固定テンプレートで、埋めるスロットは共通の8つです。

| スロット | 役割 | 例（AI規制） |
|---|---|---|
| Reason | 観点（動詞で考えて名詞化） | the replacement of human labor by AI |
| General principle | 原理（なぜ起きるか） | AI automates tasks that once required human judgment |
| Condition | 条件 | companies adopt AI systems without restriction |
| Result | 結果（主張と同じ方向） | widespread unemployment and social instability |
| Example | 具体例 | the manufacturing and customer service industries |
| Explanation | 説明 | have already cut thousands of jobs through automation |
| Key concept | キー概念 | unregulated automation |
| Conclusion | 結論 | destabilizing the labor market |

思考の型：**A does B（動き）→ because（なぜ）→ leads to C（どう悪くなる／なぜ必要）**

## 使い方

1. **テーマを選ぶ** — カテゴリ別のテーマ案から選択（Gemini で新しいテーマ案の追加生成も可能）
2. **スタンスを選ぶ** — 賛成（YES）／反対（NO）
3. **Gemini が例文を生成** — テンプレートに沿って Body 1〜3 のスロット値＋和訳を自動生成
4. **練習する** — テンプレートのワイルドカード部分が空欄で表示され、シャッフルされた単語チップを正しい順にタップして文章を組み立てる
5. **進捗を確認** — Body ごとの実施回数・ベスト正答率を記録

APIキーなしでも、同梱のサンプルエッセイ2本（AI規制・大学無償化）で練習できます。

## セットアップ

### Gemini API キー

1. [Google AI Studio](https://aistudio.google.com/apikey) で API キーを取得（無料枠あり）
2. アプリ右上の「⚙ 設定」からキーを貼り付けて保存

キーとすべての学習データは **ブラウザの localStorage にのみ保存** され、外部に送信されるのは Gemini API への生成リクエストだけです。設定画面からデータの JSON エクスポート／インポートができます。

### 起動方法

ビルド不要の静的サイトです。

- **ローカル**: `index.html` をブラウザで開くだけ
- **GitHub Pages**: リポジトリの Settings → Pages でブランチを公開すればそのまま動作

## ファイル構成

```
index.html        エントリポイント
css/style.css     スタイル
js/templates.js   Body 1〜3 テンプレート定義（固定テキスト＋スロット）
js/presets.js     プリセットテーマとサンプルエッセイ
js/gemini.js      Gemini API 連携（例文生成・テーマ案生成）
js/app.js         画面・練習ロジック・進捗管理
```
