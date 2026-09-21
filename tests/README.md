# E2E テスト

実ブラウザ（Playwright + Chromium）でアプリを動かし、主要フローの回帰を検出します。
Gemini / クラウド同期の呼び出しはすべてモックするため、ネットワークや API キーは不要です。

## 実行

```bash
npm test          # 全スイートを実行（tests/run-all.js）
node tests/eval-feedback.test.js   # 個別実行
```

## 前提（この開発コンテナ標準。異なる環境では環境変数で上書き）

- `PW_MODULES` … playwright を含む `node_modules`（既定 `/opt/node22/lib/node_modules`）
- `PW_CHROMIUM` … Chromium 実行ファイル（既定 `/opt/pw-browsers/chromium`）

## 構成

- `helpers.js` … 静的サーバ＋ブラウザ起動、PASS/FAIL 集計、セット注入などの共通処理
- `*.test.js` … 各機能のスイート（`helpers.run(名前, fn)` で実行し、失敗時は終了コード 1）
  - `render-edit` … 本文はプレーン表示・機能ラベルは残る・「本文を編集」で全文編集
  - `paste-import` … 自作エッセイの一括貼り付け（空行区切り3段落）
  - `protect-memo` … 保護（再生成/削除/編集の抑止）とメモ自動保存
  - `read-settings` … 音読の速さ/高さ/声/回数の保存と再生反映
  - `eval-feedback` … 採点失敗の通知（429 バナー / 401 合言葉モーダル）
  - `axes-refresh` … 採点相乗りでの3観点最新化と主体×領域タグ
  - `undo` … 二段の Undo（直前に戻す／模範解答リセット）
