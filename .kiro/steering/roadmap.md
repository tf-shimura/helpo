# Roadmap

## Overview

既存の `helpo` モックアップで確立した5画面と利用者体験を維持しながら、ローカル研修用の実システムへ段階的に移行する。Path Eとして、既存仕様の未実施タスクを整理し、契約先行でサーバー基盤とクライアント統合を別仕様に分割する。

新仕様の開始前に既存 `helpo` の旧タスク6・7の置換先を移管記録として確定する。その後、まず `helpo-server` のrequirements/designでHTTP/APIおよびストリーム契約を確定する。契約確定後は `helpo-client-integration` を仕様化できるが、既存モック画面を契約済みAPIへ実装接続するのは `helpo-server` 実装後とする。これにより、永続化・認証・外部AIの責務と、画面状態・エラー表示・ストリーム表示の責務を分離する。

## Approach Decision
- **Chosen**: Path E（既存 `helpo` 更新 + 新規2仕様）による契約先行の段階移行
- **Why**: 完了済みモック画面を維持しつつ、サーバー契約を先に固定することで、クライアント統合時の責務とテスト境界を明確にできるため
- **Rejected alternatives**: 既存 `helpo` だけへ全作業を追加する案は仕様境界が過大になるため不採用。サーバーとクライアントを単一の新規仕様にまとめる案は依存順とレビュー境界が曖昧になるため不採用。モックを破棄して全面再実装する案は完了済みUI資産を活用できないため不採用

## Scope
- **In**: Next.js App Router/Node Runtimeへの基盤移行、domain/application分離、Prisma + SQLite永続化、Argon2id認証、HTTP/API、POST `fetch` + `ReadableStream`のストリーム契約、OpenAI Responses API adapter、サーバーテスト、既存画面の実API接続、セッション・エラー・ストリームUI、統合/E2Eテスト
- **Out**: 本番配備、複数アプリインスタンス、監視、バックアップ、CI/CD、ユーザー管理、パスワードリセット、FAQ削除、分析ダッシュボード、社外公開、音声入力、スマートフォン最適化

## Constraints

ローカル研修用途に限定し、SQLiteは単一ローカルアプリインスタンスだけで使用する。`OPENAI_API_KEY` はserver-onlyとして扱い、ブラウザへ公開せず、秘密を仕様・コード・コミットへ記載しない。OpenAIモデルは検証済みの環境変数から取得する。

実装開始前に、Next.js/Node.js/Prisma等の実装バージョン、Argon2idに用いるnpmパッケージ、OpenAIモデルをrequirements/designで公式情報に照らして再確認し、互換性とセキュリティを確認したうえで固定する。

## Boundary Strategy
- **Why this split**: `helpo-server` は業務規則、永続化、認証、AI adapter、通信契約を所有し、`helpo-client-integration` は既存画面からその契約を利用する責務だけを所有する。サーバー契約を先に確定することで、クライアント側に業務規則や秘密を持ち込まない
- **Shared seams to watch**: セッションCookie、HTTPステータスと機械判定用エラーコード、質問回答のストリームイベント、切断・失敗・完了時の保存条件、FAQ・履歴・評価の入出力形式

## Existing Spec Updates
- [x] helpo -- 旧タスク6・7をチェックボックス付き実装タスクから外し、受入条件の追跡を伴う新規2仕様への移管記録へ置換済み。この記録完了を新仕様開始の前提とする。Dependencies: none

## Direct Implementation Candidates
- [x] 該当なし -- 今回の実装対象はすべて既存仕様整理または新規2仕様の契約・実装境界に属し、仕様を経由しない作業は設けない。この完了チェックは候補が存在しないことを示す終端記録であり、実装タスクではない

`kiro-discovery` のPath Eテンプレートに合わせてチェックリスト形式を維持する。ただし、`kiro-spec-batch` は本セクションをawareness-onlyとしてdependency waveへ含めず、完了済みの「該当なし」とすることで後続の未完了作業にも数えない。

## Specs (dependency order)

このセクションの完了チェックは仕様生成の完了を示すものであり、実装の完了を示すものではない。

- [x] helpo-server -- ローカル研修用のNext.jsサーバー基盤、業務・永続化・認証・HTTP/ストリーム契約、OpenAI adapter、サーバーテストを定義する。仕様開始前提: helpo移管記録。Dependencies: none
- [x] helpo-client-integration -- 既存モック画面を実APIへ接続し、セッション・エラー・ストリームUIと統合/E2Eテストを定義する。Dependencies: helpo-server
  - 補足: `helpo-server` のrequirements/design/API契約確定後に仕様化可能とし、実装接続は `helpo-server` 実装後とする。
