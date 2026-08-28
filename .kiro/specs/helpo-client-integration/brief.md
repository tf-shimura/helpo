# Brief: helpo-client-integration

## Problem

既存の5画面はブラウザ内モックだけで動作しており、再読み込みで状態が消え、実際の認証・認可、永続化、HTTPエラー、回答ストリームを利用できない。利用者体験を維持しながら、画面をサーバー契約へ安全に接続する必要がある。

## Current State

`helpo` ではログイン、質問、履歴、FAQ閲覧、FAQ管理の画面とモック状態が実装済みである。未実施のタスク6・7は画面とモック状態の統合およびモックアップ全体の自動検証であり、実API統合ではない。サーバー契約は先行する `helpo-server` で新たに定義される。

## Desired Outcome

既存モック画面が `helpo-server` の実APIを使用し、サーバー管理セッション、HTTPステータスと機械判定用コードに基づくエラー、POST `fetch` レスポンスの `ReadableStream` による回答の逐次表示へ接続される。主要な一般社員・管理者社員フローが統合テストとE2Eテストで検証される。

## Approach

`helpo-server` の確定済み契約を唯一の通信境界として、ブラウザ内モックrepository/回答シナリオをAPI clientへ置換する。画面コンポーネントの既存表示と入力境界を可能な限り維持し、セッション期限切れ、権限拒否、競合、生成失敗、利用者による中断、正常完了を明示的なUI状態として接続する。

## Scope
- **In**: 既存5画面の実API接続、Cookieベースセッションに伴う認証状態と遷移、HTTPステータス/機械判定用コードに基づくエラーUI、POST `fetch` + `ReadableStream`の消費・逐次描画・完了・失敗・中断、FAQ・履歴・評価の再取得/更新、クライアント統合テスト、一般社員・管理者社員の主要E2E
- **Out**: domain/applicationの業務規則、データベースschema/repository、パスワードhash、セッショントークン発行、OpenAI API呼び出し、サーバー契約の所有、本番配備、監視、バックアップ、CI/CD

## Boundary Candidates
- `helpo-server` 契約を型安全に利用し、成功・HTTPエラー・ストリームイベントをUI向け結果へ変換するAPI client
- ログイン、ログアウト、24時間失効、未認証/権限拒否を各画面の表示と遷移へ反映するセッションUI
- 回答ストリームの開始、追記、完了、回答不能、失敗、中断と再試行を管理する質問UI状態
- 実サーバー境界を用いた統合/E2Eシナリオと、外部AIに依存しない決定的なテスト構成

## Out of Boundary
- 認証・認可、FAQ重複、履歴所有者、二重評価、回答groundingなどのサーバー業務規則をクライアントへ複製すること
- OpenAI credentialやモデル選択などのserver-only情報をブラウザへ公開すること。これらとセッショントークンは別の秘密境界として扱う
- セッショントークンをHttpOnly Cookie以外へ露出させ、JavaScriptから参照可能にすること、response body・ログ・文書・test dataへ記録すること
- 本番運用、モバイル最適化、ユーザー管理、パスワードリセット、FAQ削除、分析機能

## Upstream / Downstream
- **Upstream**: `helpo-server` の確定済みHTTP、セッション、エラー、ストリーム契約、および既存 `helpo` の完了済み5画面と入力境界
- **Downstream**: ローカル研修で利用する実API接続済みHelpo。後続仕様がある場合は画面/API契約を前提として利用する

## Existing Spec Touchpoints
- **Extends**: `helpo` の完了済みモック画面と利用者体験を実APIへ接続し、未実施だった画面横断フローと自動検証を実サーバー前提で置換する
- **Adjacent**: `helpo-server` が所有する業務規則、永続化、認証情報、HTTP/ストリーム契約。クライアント側からこれらの仕様を再定義しない

## Constraints

`helpo-server` のrequirements/designとAPI契約確定後に本仕様を作成できるが、実装接続は `helpo-server` 実装後に着手し、その確定済み契約へ依存する。通信はブラウザのPOST `fetch` とレスポンス `ReadableStream` を用いる。セッショントークンはHttpOnly Cookieだけで取り扱い、JavaScriptへ公開せず、response body・ログ・文書・test dataへ値を記録しない。これはOpenAI credentialのserver-only境界とは別の制約である。`OPENAI_API_KEY` はserver-onlyであり、ブラウザへ置かず、本仕様のコード・文書・テストデータへ秘密を記載・コミットしない。OpenAIモデルの選択はサーバー側の検証済み環境変数に限定し、クライアントはモデルを指定しない。

ローカル研修用の単一インスタンスだけを対象とし、本番配備、監視、バックアップ、CI/CDは含めない。実装バージョンやブラウザ/Next.js互換性はrequirements/designで `helpo-server` の固定値と公式情報を再確認する。環境変数境界の参照先: [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)。
