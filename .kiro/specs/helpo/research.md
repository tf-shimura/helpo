# Research & Design Decisions

## Summary
- **Feature**: `helpo`
- **Discovery Scope**: New Feature（Full Discovery）
- **Key Findings**:
  - リポジトリには実行コード、技術スタック、テスト基盤、プロジェクト固有ステアリングがなく、既存パターンを継承できないグリーンフィールドである。
  - FAQ根拠限定と逐次表示を両立するため、FAQ候補をサーバーで限定し、LLM出力を段落単位で検証してからストリームへ流す境界が必要である。
  - 24時間の絶対セッション、ログインロック、FAQ重複、評価一回制約はUIではなく、DBトランザクションと一意制約を含むサーバー側で保証する。

## Research Log

### コードベースとステアリングの現状
- **Context**: 既存方式との整合性と変更対象を確認した。
- **Sources Consulted**: リポジトリ全体、`AGENTS.md`、`.kiro/specs/helpo/requirements.md`、`.kiro/settings/templates/specs/design.md`
- **Findings**:
  - `src/`、`package.json`、DBスキーマ、テスト、CIは存在しない。
  - `.kiro/steering/product.md`、`tech.md`、`structure.md` は存在しない。
  - 要件は承認済みで、認証、QA、履歴、FAQ、評価、5画面を一つのモックアップとして定義している。
- **Implications**:
  - 既存ファイルの変更ではなく、アプリケーション基盤を含む新規ファイル計画が必要である。
  - 技術判断は本設計に明記し、実装時にプロジェクトステアリングへ昇格できる形にする。

### Webアプリケーション基盤
- **Context**: 5画面、サーバー認可、DBアクセス、ストリーミングを一つの型安全なアプリで提供する必要がある。
- **Sources Consulted**: [Next.js Documentation](https://nextjs.org/docs)、[App Router](https://nextjs.org/docs/app)、[Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)、[TypeScript](https://www.typescriptlang.org/docs/)、[Zod](https://zod.dev/)
- **Findings**:
  - Next.js App RouterはServer Components、Route Handlers、Web Streamsを同一プロジェクトで扱える。
  - Server Componentsや画面ガードのみでは認可にならず、更新APIとデータアクセス直前で再検証が必要である。
  - 外部入力と環境変数にはTypeScript型だけでなくランタイム検証が必要である。
- **Implications**:
  - Next.js App Router、Node.js Runtime、TypeScript strict、Zodを採用する。
  - 依存方向を `domain → application → infrastructure → app` とし、app層からLLM/DB SDKを直接呼ばない。
  - 実装開始時に安定版とセキュリティ勧告を再確認し、ロックファイルで固定する。

### 認証、ロック、セッション
- **Context**: 5回失敗後10分ロックとログインから絶対24時間のセッションを保証する必要がある。
- **Sources Consulted**: [Next.js Authentication Guide](https://nextjs.org/docs/app/guides/authentication)、[OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)、[OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)、[OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)、[MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
- **Findings**:
  - Auth.jsだけでは要件固有の失敗回数とロック状態遷移を提供しない。
  - 長寿命JWTは即時失効と絶対期限の検証が複雑になる。
  - opaque tokenをCookieに置き、DBにはハッシュと絶対期限を置く方式は要件を直接表現できる。
- **Implications**:
  - モックアカウント認証に限定した独自opaque DBセッションを採用する。
  - パスワードはArgon2idハッシュ、セッショントークンは安全な乱数、DBにはSHA-256ハッシュのみを保存する。
  - CookieはHttpOnly、Secure（本番）、SameSite=Lax、Path=/、絶対24時間とする。
  - 失敗回数、`lockedUntil`、期限経過後のリセット、成功時リセットはEmployee更新トランザクションで直列化する。

### 永続化と整合性
- **Context**: ロック状態、FAQ、履歴、評価を再起動後も保持し、競合時も一意性を保証する必要がある。
- **Sources Consulted**: [Prisma ORM](https://www.prisma.io/docs/orm)、[Prisma Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)、[Prisma Unique Constraints](https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-composite-ids-and-constraints)、[SQLite Appropriate Uses](https://www.sqlite.org/whentouse.html)、[SQLite WAL](https://www.sqlite.org/wal.html)
- **Findings**:
  - SQLiteは研修用モックアップの単一Node.jsプロセスには適するが、水平スケールやサーバーレス一時FSには適さない。
  - FAQ質問と評価対象の一意性はDB制約が並行リクエストにも有効である。
  - LLMストリーム中にDBトランザクションを保持すると競合と長時間ロックを招く。
- **Implications**:
  - Prisma + SQLiteをモックアップの永続層に採用し、単一インスタンスと永続ファイルをランタイム前提とする。
  - `Faq.question` と `Feedback.historyId` に一意制約を設定する。
  - 履歴は回答の検証完了後に短いトランザクションで作成し、失敗・切断した未完成回答は保存しない。
  - PostgreSQL、複数インスタンス、FAQバージョニングへの変更は再設計トリガーとする。

### FAQ根拠限定とストリーミング
- **Context**: FAQ外情報を推測せず、生成内容を順次表示する必要がある。
- **Sources Consulted**: [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)、[OpenAI Streaming](https://platform.openai.com/docs/guides/streaming-responses)、[AI SDK](https://sdk.vercel.ai/docs)、[OWASP LLM Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)、[OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/)
- **Findings**:
  - プロンプト指示だけではFAQ外知識の使用を厳密に保証できない。
  - 未検証トークンの直接転送は、根拠違反を検出した時点で利用者に表示済みとなる。
  - 小規模FAQでは全件を候補とする単純方式が、日本語全文検索やembeddingの運用複雑性を避ける。
- **Implications**:
  - 初期版は全登録FAQを上限付きでコンテキスト化し、FAQが0件ならLLMを呼ばず回答不能とする。
  - LLMには根拠FAQ IDとFAQ回答本文からの完全一致引用を構造化出力させ、IDと引用一致を検証し、固定テンプレートで段落化してからSSEで送る。
  - FAQを命令ではなく非信頼データとして区切り、LLMにツール、任意URL、DBアクセスを与えない。
  - 検証不能、根拠IDなし、プロバイダー失敗は回答不能または再試行可能エラーへ変換する。

### セキュリティとプライバシー
- **Context**: 社内情報、認証情報、質問本文を扱う。
- **Sources Consulted**: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)、[OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)、[OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)、[Next.js CSP Guide](https://nextjs.org/docs/app/guides/content-security-policy)
- **Findings**:
  - UI非表示だけでは管理APIと他人の履歴への直接アクセスを防げない。
  - SameSite Cookieに加え、状態変更APIではOrigin検証が必要である。
  - LLM送信先の保持、学習利用、リージョン、契約条件は実装前に組織判断が必要である。
- **Implications**:
  - 認証主体はCookieからのみ解決し、リクエストのemployeeIdを信用しない。
  - 管理APIはサーバー側RBAC、履歴と評価は所有者条件で絞り込む。
  - パスワード、セッショントークン、質問、回答、FAQ本文を通常ログへ出力しない。
  - 外部LLM利用許可とプロバイダー契約確認を実装着手の前提条件とする。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 単一Next.jsモジュラーモノリス | UI、Route Handler、業務サービス、Prismaを一つの配備単位に置く | モックアップに最小、型共有、ストリーム実装が単純 | 境界を守らないとapp層へロジックが集中 | 採用 |
| ヘキサゴナル完全分離 | 全ドメインにport/adapterを配置 | 交換性と単体試験性が高い | 小規模モックには抽象化過多 | LLMとClockのみportを採用 |
| マイクロサービス | 認証、QA、FAQを別配備 | 独立スケール | 分散認証、運用、整合性が過剰 | 不採用 |
| ベクトルRAG | embeddingとvector DBでFAQ検索 | 言い換えに強い | 外部送信、再index、閾値調整が必要 | 初期版では不採用 |

## Design Decisions

### Decision: 画面設計とプロジェクト技術方針の分離
- **Context**: 利用者は本仕様の設計を、画面の振る舞い、入力、出力、境界値に限定することを選択した。
- **Alternatives Considered**:
  1. 技術スタック、API、データモデル、ファイル構造を仕様の`design.md`に保持する
  2. すべての技術判断を実装タスクまで保留する
- **Selected Approach**: `design.md`は観測可能な画面仕様に限定し、複数機能へ適用される技術・構造・プロダクト方針をコアステアリングへ移す。
- **Rationale**: 仕様レビューを利用者体験と境界値へ集中させながら、後工程に必要な共通制約を長期的なプロジェクト知識として保持できる。
- **Trade-offs**: `design.md`単独では実装ファイルやAPIを決定できないため、タスク生成時にステアリングを必ず併読する必要がある。
- **Follow-up**: 実装固有のファイル分割とインターフェースはタスク生成または実装計画で確定する。

### Decision: モジュラーモノリスと限定的なPort採用
- **Context**: グリーンフィールドだが、研修用モックアップの実装量を抑えながらLLM依存を隔離する。
- **Alternatives Considered**:
  1. app層からPrisma/LLM SDKを直接利用
  2. 全層を完全なヘキサゴナル構造にする
- **Selected Approach**: ドメイン別application serviceを持つモジュラーモノリスとし、交換・障害試験が必要な`AnswerGenerator`と`Clock`だけをinterface化する。
- **Rationale**: FAQ、履歴、評価の責務を分離しつつ、不要な抽象層を増やさない。
- **Trade-offs**: 単一配備単位に結合するが、現在の規模と境界には適する。
- **Follow-up**: import制約をlintまたはレビューで検証する。

### Decision: 独自opaque DBセッション
- **Context**: 5回・10分のロックとログインから絶対24時間を厳密に表現する。
- **Alternatives Considered**:
  1. Auth.js Credentials + DB session
  2. JWT session
- **Selected Approach**: 認証サービスがモックEmployeeを検証し、ハッシュ化opaque tokenをSessionへ保存する。
- **Rationale**: 要件固有状態を最小の契約で明示でき、ログアウト時に即時失効できる。
- **Trade-offs**: Cookie、CSRF、固定化防止を自前で検証する責任を負う。
- **Follow-up**: 実装レビューでOWASPセッションチェックリストを適用する。

### Decision: 全FAQコンテキストと検証済み段落ストリーム
- **Context**: FAQ件数・検索品質要件が未提示で、根拠限定が最優先である。
- **Alternatives Considered**:
  1. embedding検索
  2. SQLite FTS5
  3. 未検証トークンの直接ストリーム
- **Selected Approach**: コンテキスト上限内の全FAQを渡し、LLMにはFAQ IDとFAQ回答本文からの完全一致引用だけを選択させる。サーバーが引用一致を検証し、固定テンプレートで段落化してSSE送信する。上限超過時は明示的に回答不能とし、暗黙の切り捨てをしない。
- **Rationale**: 有効なFAQ IDを添えた自由生成による根拠外情報を防ぎ、初期モックで機械的検証可能性を最大化する。
- **Trade-offs**: 自由な要約表現を制限し、FAQ増加時にコンテキスト上限へ達し、生成開始まで選択検証分の遅延がある。
- **Follow-up**: FAQ件数とtoken量を計測し、上限到達時は検索方式を再設計する。

### Decision: 一般化はResult、Actor、Clockに限定
- **Context**: 認証、FAQ、評価に共通するエラーと主体判定がある。
- **Alternatives Considered**:
  1. 各routeで個別例外処理
  2. 汎用repository基底クラス
- **Selected Approach**: 判別共用体の`Result`、`AuthenticatedActor`、差し替え可能な`Clock`を共有し、repositoryは各ドメイン固有にする。
- **Rationale**: 型安全な共通問題だけを一般化し、仮想的な将来用途の抽象化を避ける。
- **Trade-offs**: repository間の定型コードは一部重複する。
- **Follow-up**: 実装後に実際の重複が顕在化した場合のみ再評価する。

## Risks & Mitigations
- FAQ外知識が表示される — 候補限定、根拠ID検証、段落バッファ、検証失敗時拒否で軽減する。
- FAQ内prompt injection — FAQを非信頼データとして分離し、toolを与えず、管理権限をサーバーで限定する。
- SQLite書き込み競合・消失 — 単一インスタンス、短いトランザクション、永続volume、バックアップを前提とする。
- アカウントロックのDoS悪用 — 要件どおり期限付きロックとし、監視可能な認証イベントを本文なしで記録する。追加レート制限は運用要件確定後に検討する。
- 外部LLMへの社内情報送信 — 法務・セキュリティ承認、データ保持/学習利用/リージョン確認を実装前ゲートにする。
- FAQ増加によるコンテキスト超過 — メトリクスで検出し、検索方式導入を再設計トリガーとする。
- 仕様外の監査・保持要件 — 本仕様では分析画面や監査管理機能を実装せず、必要になれば別仕様とする。

## References
- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Zod](https://zod.dev/)
- [Prisma ORM](https://www.prisma.io/docs/orm)
- [SQLite Appropriate Uses](https://www.sqlite.org/whentouse.html)
- [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP LLM Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
