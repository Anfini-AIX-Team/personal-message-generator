# gas/

`index.html` が `GAS_URL` で呼び出す Gemini API プロキシ（Google Apps Script）のソース。

- 対応する GAS プロジェクト: 「応募者メッセージ自動作成_バックエンド」（Google Drive ID `1Cc1ALa1kIc82gu71AXlsj2ecIO7ymHvK09ZJ4FR-AzaEsKpztxP9Kgu5`）
- このフォルダはそのプロジェクトの写し。GAS エディタ側を正として直接編集した場合は、ここにも反映する。

## デプロイ手順

1. GAS エディタで `コード.gs` の中身をこのフォルダの `コード.gs` に置き換えて保存する
2. 「デプロイ」→「デプロイを管理」→ 既存のデプロイの「編集」→ バージョン:「新バージョン」→「デプロイ」
3. 新しいデプロイは作らない（`/exec` の URL を変えないため。`index.html` の `GAS_URL` はそのまま）

フロントエンド（`index.html`）とどちらを先にデプロイしても動く（旧フロントエンドが送る `model` パラメータは無視される）。

## スクリプトプロパティ

| 名前 | 内容 |
| --- | --- |
| `GEMINI_API_KEY` | Gemini API キー |
| `APP_PASSWORDS` | ログイン用パスワード（JSON オブジェクト） |
| `LOG_SHEET_ID` | アクセスログを書くスプレッドシートの ID（任意） |
| `GEMINI_MODEL_CHAT` / `GEMINI_MODEL_GENERATE_MESSAGE` | モデルの上書き（任意） |

## Gemini モデル

モデルはサーバー側で決め、リクエストの `model` パラメータは使わない。解決順は `GEMINI_MODEL_<タスク名>` → `GEMINI_MODEL_<カテゴリ>` → コード内の既定値。

| タスク名 | カテゴリ | 既定モデル | 内容 |
| --- | --- | --- | --- |
| `GENERATE_MESSAGE` | CHAT | `gemini-3.5-flash` | 応募者へのメッセージ文の生成 |
