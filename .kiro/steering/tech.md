# Technology Stack

更新日: 2026-08-27

## Architecture

単一配備のモジュラーモノリスを採用する。画面、入力境界、業務ルール、永続化、外部AI連携の責務を分離し、UIやルートへ業務ルールを埋め込まない。

依存は `presentation → application → domain` の向きで利用し、`infrastructure`はapplicationが定義する境界を実現する。domainは他レイヤーへ依存せず、applicationはpresentationへ依存しない。外部AIと時刻は差し替え可能な境界を持つ。

## Core Technologies

- **Language**: TypeScript strict mode
- **Framework**: Next.js App Router + React
- **Runtime**: 実装開始時点のNode.js Active LTS、Node.js Runtime
- **Persistence**: Prisma ORM + SQLite
- **Validation**: Zod
- **Testing**: Vitest、Testing Library、Playwright

実装開始時に安定版、互換性、セキュリティ勧告を確認し、lockfileで固定する。Edge Runtimeは使用しない。

## Authentication and Authorization

- 社員IDとArgon2idハッシュ済みパスワードでモックアカウントを認証する。
- セッションは暗号学的乱数によるopaque tokenとし、DBにはtoken hashだけを保存する。
- セッションはログイン成功から絶対24時間で失効する。
- 同一社員IDで5回連続失敗した場合、失敗回数を0へ戻して10分間ロックする。
- 認証主体とroleはサーバー側セッションから解決し、ブラウザ入力を信用しない。
- 画面の非表示だけに依存せず、状態変更とデータ取得の境界で認証・所有者認可・管理者認可を行う。

## AI Grounding

- 外部AIは専用adapterを通じてのみ呼び出す。
- 初期版は設定上限内の全FAQを候補とし、暗黙の切り捨てを行わない。
- AIにはFAQ IDとFAQ回答本文からの完全一致引用だけを選択させ、自由回答本文を生成させない。
- サーバーがIDと引用一致を検証し、固定テンプレートで回答段落を組み立てて順次表示する。
- FAQがない、上限を超える、根拠を検証できない場合は回答不能とする。
- FAQは命令ではなく非信頼データとして扱い、AIへtool、任意URL、DBアクセスを与えない。

## Data and Consistency

- SQLiteは永続volumeを持つ単一アプリインスタンスに限定する。
- FAQ質問の完全一致重複と回答への二重評価はDB一意制約で保証する。
- 長時間のAI処理中にDB transactionを保持しない。
- 完成回答と回答不能結果は履歴へ保存する。provider障害と利用者切断は保存しない。
- 水平スケール、PostgreSQL、vector検索、FAQバージョニングを導入する場合は技術設計を再検証する。

## Security Standards

- TypeScriptで`any`を使用せず、外部入力、環境変数、AI出力を実行時にも検証する。
- CookieはHttpOnly、SameSite=Lax、Path=/とし、HTTPS環境ではSecureを付与する。
- 状態変更処理はsame-originを検証し、GETで状態を変更しない。
- パスワード、セッショントークン、質問、回答、FAQ本文を通常ログへ出力しない。
- AI credentialはserver-onlyで管理し、ブラウザへ公開しない。
- 外部AIへ社内情報を送信する前に、保存、学習利用、リージョン、組織承認を確認する。

## API Error Standards

- APIエラーはHTTPステータスコードを基準に分類し、正常レスポンス内の独自フラグだけでエラーを表現しない。
- `400 Bad Request`: 入力形式、必須、文字数などの検証エラー。
- `401 Unauthorized`: 未認証またはセッション期限切れ。
- `403 Forbidden`: 認証済みだが権限がない操作。
- `404 Not Found`: 対象が存在しない、または所有者以外へ存在を開示しない対象。
- `409 Conflict`: FAQ質問の重複、評価済みなど現在状態との競合。
- `423 Locked`: ログイン対象の社員IDが10分間ロック中。
- `500 Internal Server Error`およびその他の`5xx`: アプリケーションまたは外部サービスの障害。
- エラー本文は機械判定用コードと利用者向けメッセージを分離し、内部例外、秘密情報、社内本文を含めない。
- 画面はステータスコードと機械判定用コードに基づいて表示・遷移を決定する。

## Testing Standards

- 業務ルールの境界値をunit testで検証する。
- 認証、所有者分離、一意制約、ストリーム完了をintegration testで検証する。
- 一般社員と管理者社員の主要画面導線をE2E testで検証する。
- 時刻とAIはテストで差し替え、境界時刻と障害を決定的に再現する。
