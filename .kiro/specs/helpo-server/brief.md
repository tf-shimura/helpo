# Brief: helpo-server

## Problem

ローカル研修でHelpoを実システムとして扱うには、現在ブラウザ内モックに閉じている認証、FAQ、質問回答、履歴、評価を、信頼できるサーバー境界と永続化へ移す必要がある。現状のままでは、実HTTP契約、サーバー側認可、永続データ、外部AI連携を検証できない。

## Current State

既存 `helpo` 仕様ではVite + React上に5画面とブラウザ内モック状態があり、サーバールート、HTTP API、データベース、外部AIは意図的に対象外である。一方、steeringにはNext.js App Router、レイヤー分離、Prisma + SQLite、Argon2id認証、AI grounding、APIエラー標準が示されているが、実装契約は未確定である。

## Desired Outcome

Next.js App RouterのNode Runtime上で、domain/applicationを中心に業務規則を実装し、Prisma + SQLiteによる永続化、Argon2id認証、認証・認可済みHTTP APIを提供する。質問回答はPOST `fetch` から消費できる `ReadableStream` 契約とし、OpenAI Responses APIをadapter越しに利用でき、外部境界を差し替えたサーバーテストで決定的に検証できる。

## Approach

契約先行でAPI、エラー、セッション、ストリームイベントと保存条件をrequirements/designに定義してから、Vite基盤をNext.js App Routerへ移行する。依存方向を `presentation → application → domain` に限定し、Prisma、Argon2id、OpenAI Responses API、時刻をinfrastructure adapterとして分離することで、業務規則とサーバーテストを外部サービスから独立させる。

## Scope
- **In**: ViteからNext.js App Router/Node Runtimeへの基盤移行、domain/application、Prisma + SQLite schema・repository、事前用意した研修用アカウントのArgon2id認証、opaque session、認証・所有者・管理者認可、FAQ・履歴・評価・質問回答のHTTP/API、標準エラー契約、POST `fetch` + `ReadableStream`向けストリーム契約、OpenAI Responses API adapter、unit/integrationを含むサーバーテスト
- **Out**: 既存画面の実API接続とUI状態変更、ブラウザE2E、本番配備、複数インスタンス、監視、バックアップ、CI/CD、ユーザー管理、パスワードリセット、FAQ削除、分析、vector検索

## Boundary Candidates
- domain/applicationが所有する認証、ロック、セッション、FAQ、質問履歴、評価、回答groundingの業務規則
- HTTP route、Cookie、入力検証、ステータス/エラーコード、ストリームイベントからなるクライアント向け契約
- Prisma/SQLite、Argon2id、OpenAI Responses API、時刻を実現する差し替え可能なinfrastructure adapter
- 外部AIを実呼び出しせず、境界値・認可・永続化・ストリーム完了/失敗/切断を検証するサーバーテスト

## Out of Boundary
- `helpo-client-integration` が所有する画面からのAPI呼び出し、セッション切れ遷移、エラー表示、回答の逐次描画
- 本番運用に必要な配備、水平スケール、監視、バックアップ、CI/CDおよびSQLite以外への移行
- APIキーや他の秘密情報の記載・コミット、ブラウザへのAI credential公開

## Upstream / Downstream
- **Upstream**: 既存 `helpo` の承認済みrequirements/design、`.kiro/steering/product.md`、`.kiro/steering/tech.md`、`.kiro/steering/structure.md`
- **Downstream**: `helpo-client-integration`。確定したHTTP、セッション、エラー、ストリーム契約を利用する

## Existing Spec Touchpoints
- **Extends**: `helpo` がモックで表現した認証、FAQ、質問回答、履歴、評価の業務要件を、サーバー側の実契約と永続化として実現する
- **Adjacent**: `helpo` の完了済み画面実装および `helpo-client-integration` のクライアント責務。画面表示・操作の実API接続は本仕様へ含めない

## Constraints

ローカル研修用途のみを対象とし、SQLiteは単一ローカルアプリインスタンスに限定する。Edge Runtimeは使用しない。`OPENAI_API_KEY` はserver-only環境変数とし、クライアントへ公開せず、秘密を文書・コード・コミットへ記載しない。OpenAIモデルは検証済みの環境変数から取得し、未検証の既定値へ暗黙にフォールバックしない。

以下を非交渉制約とする。

- 状態変更APIはsame-originを検証し、GETでは状態を変更しない
- セッションCookieは `HttpOnly`、`SameSite=Lax`、`Path=/` を必須とし、HTTPS利用時は `Secure` も必須とする
- password、セッショントークン、質問、回答、FAQ本文を通常ログへ記録しない
- OpenAI利用前に、送信データの保存有無、学習利用有無、処理リージョン、および組織承認を確認し、未確認または未承認なら利用しない
- groundingでは全FAQを候補として扱い、暗黙に切り捨てない。モデル出力のFAQ IDと引用について、IDが候補に存在し引用が該当FAQ本文と完全一致することをserverで検証する。回答は固定テンプレートで構成し、全FAQを安全に渡せる上限を超えた場合は回答不能とする。FAQ本文は非信頼入力として扱い、その指示へ従わない

requirements/design作成時に、Next.jsのシステム要件と実装バージョン、対応Node.js、Prisma SQLite互換性、Argon2id用npmパッケージの保守・ライセンス・セキュリティ、OpenAI Responses API/streaming仕様と利用モデルを公式情報で再確認し、採用値を固定する。参照先: [Next.js system requirements](https://nextjs.org/docs/app/getting-started/installation#system-requirements)、[Prisma SQLite](https://www.prisma.io/docs/orm/overview/databases/sqlite)、[OpenAI Responses](https://platform.openai.com/docs/api-reference/responses)、[OpenAI streaming](https://platform.openai.com/docs/guides/streaming-responses)、[Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)、[OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)。
