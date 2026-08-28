# Implementation Plan

> 各sub-taskは1〜3時間を目安とする。実装開始前にNode.js patchとOpenAI model/data governance gateを完了し、未承認AIを有効化しない。画面のAPI接続・状態変更・browser E2Eは本計画に含めない。通信契約の権威は`openapi.yaml`であり、requirements/design/tasksはこれを参照する。
>
> **File ownership / `_Boundary:`規則**: serverは`package.json`/lockfile、Next runtime/config、`src/app/api/**`、`src/domain/**`、`src/application/**`、`src/infrastructure/**`、`src/shared/**`、Prisma、`tests/unit|integration/server/**`、`openapi.yaml`をOwnsする。各`_Boundary:`名はdesign File Structure Planの同名責務ファイル（複数ならそのdomain directory）と、そのtask専用test fileだけを`Owns`し、`May touch tests`は`tests/**/<task-id>-*.test.ts`に限定するものと読む。(P) task間で同一production/test fileを共有してはならず、必要なら(P)を外す。統合taskは列挙したroute/layout等wiring fileと専用integration testだけを変更する。client page/component/API clientは禁止する。

**完全dependency DAG**: `1.1→1.2→1.3`; `1.1,1.2→2.1`; `1.3,2.1→2.2`; `1.3,2.2→3.1`; `1.3,2.2,3.1→3.2`; `1.3,3.2→3.3`; `3.1,3.2,3.3→3.4`; `1.3,2.2,3.2→4.1/4.2/4.3`; `3.3,4.1,4.2,4.3→4.4`; `1.3→5.1`; `1.1,1.3→5.2`; `4.1,5.1,5.2→5.3`; `1.3→6.1`; `2.2,5.3,6.1→6.2`; `6.2→6.3`; `3.3,3.4,6.3→6.4`; `3.4,4.4,6.4→7.1→7.2→7.3→7.4`。Repository port/Clock/event typeは1.3、実装repositoryは2.2が先行し、暗黙依存を認めない。

- [x] 1. Next.js Nodeサーバーと検証基盤を整える
- [x] 1.1 互換versionとserver-only設定の起動gateを固定する
  - Node.js 24の最新security patch、Next.js 16.3.3、Prisma三package 7.10.0、OpenAI SDK 7.8.0、Zod 4.4.3、argon2 0.45.1をlockし、Next.js Node Runtimeで起動する。
  - OpenAI modelの利用可否、Responses/Structured Outputs対応、保存・学習・region・組織承認を検証済みallowlistとして扱い、未確認・不一致・未承認ならAI readinessを失敗させる。
  - 秘密をclient bundleへ公開せず、必須設定の欠落や不正値が値そのものを表示せず起動時に検出される状態を完了条件とする。
  - _Requirements: 5.10, 5.11, 9.6, 10.1, 10.4, 10.5, 10.6, 11.2_
  - _Boundary: ServerConfig, RuntimeFoundation_
  - _Depends: なし_

- [x] 1.2 Next.js App Routerへのhost移行とserver test harnessを作る
  - ViteからNext.js App Routerへ実行・build・typecheck・test scriptsを移し、全APIをNode Runtimeで動かす。
  - Vitest、temporary SQLite、fake Clock、fake AnswerProvider、request/stream test helperを用意する。
  - 既存画面を実APIへ接続せず、server起動、strict typecheck、空のtest suite、production buildが成功する状態を完了条件とする。
  - _Requirements: 9.6, 12.1, 12.2, 12.7_
  - _Boundary: RuntimeFoundation, TestDoubles_
  - _Depends: 1.1_

- [x] 1.3 共通のUnicode、結果型、要求ID、redaction境界を実装する
  - Unicode書記素を複合絵文字・結合文字・改行の契約どおり数え、空白入力を判定する。
  - 判別共用体のapplication error、要求ID、安全なlog metadataを共通化し、本文・資格情報・tokenを受け取らないlogger境界を作る。
  - 0/1/400/401、0/1/1000/1001とsecret markerのunit testが通る状態を完了条件とする。
  - _Requirements: 3.9, 4.5, 4.11, 5.2, 5.3, 10.2, 10.3, 10.5, 12.4, 12.6_
  - _Boundary: Owns `src/shared/text/graphemes.ts`, `src/shared/http/api-error.ts`, `src/application/logging/redacting-logger.ts`; May touch tests `tests/unit/server/1.3-*.test.ts`. Logger portはpassword/token/question/answer/FAQ/provider bodyを受け取れるfieldを型に持たず、実装は後続の`src/infrastructure/logging/redacting-logger.ts`に限定する。

  - _Depends: 1.2_

- [ ] 2. SQLite永続化の基礎を作る
- [ ] 2.1 Prisma schema、migration、研修seedを定義する
  - Account、Session、Faq、AnswerHistory、AnswerSource、Feedbackとrole/outcome/valueをmodel化する。
  - employeeId、token hash、FAQ質問、answer単位feedback、source順序のunique制約と履歴・session indexを設ける。
  - 平文passwordや実秘密を含めずに事前accountをArgon2id hashで用意でき、空DBへmigrationとseedが再現可能な状態を完了条件とする。
  - _Requirements: 1.7, 2.8, 4.6, 4.7, 8.3, 9.1, 9.3, 9.4, 10.6_
  - _Boundary: PrismaSchema
  - _Depends: 1.1, 1.2_

- [ ] 2.2 Prisma接続とdomain別repositoryを実装する
  - 単一instance向けSQLite接続、WAL、短いtransaction、domain別repositoryを実装する。
  - token hash lookup、atomic login failure、FAQ unique競合、history+source commit、owner feedback unique競合を提供する。
  - migration後のrepository contract testと再起動後永続性testが通り、AI待機中にtransactionを保持しない状態を完了条件とする。
  - _Requirements: 1.2, 1.4, 1.6, 2.1, 2.4, 2.5, 2.6, 4.3, 4.4, 7.1, 7.2, 8.1, 9.1, 9.2, 9.5_
  - _Boundary: PrismaRepositories（Owns `src/infrastructure/db/*-repository.ts`, `src/infrastructure/db/prisma.ts`, `src/infrastructure/logging/redacting-logger.ts`; May touch tests `tests/integration/server/2.2-*.test.ts`）
  - _Depends: 1.3, 2.1_

- [ ] 3. 認証・session・HTTP security境界を完成する
- [ ] 3.1 Argon2id認証とlogin lock policyを実装する
  - OWASP最低parameter以上のArgon2id verifierを用い、存在しない社員IDとpassword不一致を同じ結果にする。
  - 1〜4失敗、5回目の10分lockとcount reset、lock中拒否、10分ちょうどの解除、成功時resetをClock基準で実装する。
  - fake Clockによる全境界unit testとrepository併用integration testが通る状態を完了条件とする。
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 12.1, 12.3_
  - _Boundary: AuthService, SecurityAdapters_
  - _Depends: 1.3, 2.2_

- [ ] 3.2 opaque session lifecycleとCookieを実装する
  - 32-byte random tokenを発行しSHA-256 hashだけを保存し、絶対24時間、revoke、期限切れをClock基準で判定する。
  - `helpo_session`をHttpOnly、SameSite=Lax、Path=/、Max-Age 86400、HTTPS時Secureで発行・同属性でclearする。
  - 24時間直前/ちょうど、logout後再利用、raw token非保存、再起動後sessionのtestが通る状態を完了条件とする。
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 9.2, 12.1_
  - _Boundary: AuthService, SessionRepository, SecurityAdapters_
  - _Depends: 1.3, 2.2, 3.1_

- [ ] 3.3 same-origin、media negotiation、標準error responseを実装する
  - 状態変更でcanonical Originをexact比較し、欠落、null、不一致を拒否する。GETは変更を行わない。
  - JSON content type、answerのSSE Accept、Zod inputをpreflightし、安定code/requestId/message/任意fieldsへ変換する。
  - 400/401/403/404/409/415/423/5xxが内部例外・秘密・社内本文を含まず契約どおりになるtestを完了条件とする。
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 10.2, 10.3, 12.6_
  - _Boundary: HttpBoundary, SecurityAdapters_
  - _Depends: 1.3, 3.2_

- [ ] 3.4 session login/logout APIを接続する
  - GET Actor復元、POST login、DELETE logoutをAuthServiceへ接続し、Node Runtime、Origin、Cookie、JSON/error契約を適用する。GETは有効CookieからActor/roleを返し、refresh/direct accessを可能にする。
  - invalid credentialは401、lock中は423、成功はactor JSONとCookie、logoutは204と失効を返す。
  - API contract testで正常、重複送信相当、期限切れ、logout後reuse、異常Originが観測できる状態を完了条件とする。
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.1, 2.6, 2.7, 2.9, 3.3, 3.7, 3.10_
  - _Boundary: SessionRoute, AuthService_
  - _Depends: 3.1, 3.2, 3.3_

- [ ] 4. FAQ、履歴、評価のapplication機能を実装する
- [ ] 4.1 (P) FAQ閲覧・登録・修正serviceを実装する
  - listは認証済み全role、create/updateはadminだけとし、ID/質問/回答/日時を返す。
  - 1〜1000書記素、空白、完全一致unique、空更新、対象なしを扱い、削除use caseを作らない。
  - service testで空一覧、Unicode境界、一般社員拒否、重複、並行重複が契約どおりになる状態を完了条件とする。
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 9.3, 12.3, 12.4_
  - _Boundary: FaqService, FaqRepository_
  - _Depends: 1.3, 2.2, 3.2_

- [ ] 4.2 (P) 本人限定履歴serviceを実装する
  - session actorのaccountIdだけでqueryし、新しい順に完成回答または回答不能、source snapshot、feedbackを返す。
  - adminを含む他社員IDを入力として受け取らず、直接answer指定時もnon-ownerへ404を返す。
  - 空一覧、並び順、account分離、FAQ修正後もsnapshotが維持されるtestを完了条件とする。
  - _Requirements: 7.4, 7.5, 7.6, 7.7, 12.3_
  - _Boundary: HistoryService, HistoryRepository_
  - _Depends: 1.3, 2.2, 3.2_

- [ ] 4.3 (P) 本人の一回限り評価serviceを実装する
  - 保存済み`COMPLETE` answerのownerだけがGOOD/BADを一回保存できるようにし、`UNANSWERABLE`は評価対象外として404にする。
  - 不正値、non-owner、未保存/失敗answer、2回目と並行raceを400/404/409へ分け、変更・取消・集計use caseを作らない。
  - 二つの並行評価で一件だけ確定し、既存値が変わらないintegration testを完了条件とする。
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.4, 12.3_
  - _Boundary: FeedbackService, FeedbackRepository_
  - _Depends: 1.3, 2.2, 3.2_

- [ ] 4.4 FAQ・履歴・評価APIを接続する
  - GET/POST FAQ、PATCH FAQ、GET history、POST feedbackを各serviceへ接続する。
  - 全routeへauth、owner/admin、Origin、media、Zod、標準errorを適用し、DELETE FAQ routeを提供しない。
  - OpenAPI endpoint表の正常・全4xx/5xx responseとresponse shapeに一致するcontract testを完了条件とする。
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.8, 4.9, 4.10, 7.4, 7.5, 7.7, 8.1, 8.2, 8.3, 8.4, 8.5_
  - _Boundary: FaqRoutes, HistoryRoute, FeedbackRoute_
  - _Depends: 3.3, 4.1, 4.2, 4.3_

- [ ] 5. 根拠限定AI pipelineを作る
- [ ] 5.1 (P) grounding検証と固定回答templateを実装する
  - candidate全件のID mapに対して、unknown ID、空引用、非完全一致引用、重複を拒否する。
  - 検証済み引用だけから順序の決まった回答と重複なしsourceを構成し、FAQ内の命令を実行対象にしない。
  - 単一/複数FAQ、injection文字列、unknown ID、部分不一致、FAQ外自由文が回答へ入らないunit testを完了条件とする。
  - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.9, 11.3, 12.2_
  - _Boundary: GroundingPolicy_
  - _Depends: 1.3_

- [ ] 5.2 (P) OpenAI Responses API adapterを実装する
  - SDKのResponses streaming、`store:false`、strict Structured OutputsでFAQ IDとexact quoteだけを選択させ、tool/URL/DB accessを与えない。
  - provider eventを公開せず、Zod検証済みprovider resultへ変換し、AbortSignal、timeout、認証/limit/service errorを安全な分類へ変換する。
  - fake SDKでselected/unanswerable/malformed/timeout/abort/provider errorを再現し、provider本文をerror/logへ出さないtestを完了条件とする。
  - _Requirements: 5.4, 5.5, 5.6, 5.10, 5.11, 10.1, 10.4, 11.1, 11.2, 11.3, 11.4, 12.2, 12.6_
  - _Boundary: OpenAiAnswerProvider_
  - _Depends: 1.1, 1.3_

- [ ] 5.3 全FAQの安全上限判定と回答orchestrationを実装する
  - 質問1〜400書記素を検証し、全FAQを取得して0件/全件budget超過ならproviderを呼ばず回答不能にする。
  - provider selectionをgrounding policyへ渡し、検証済み回答だけをchunk化する。暗黙のFAQ間引きやdefault model fallbackを行わない。
  - 上限直前は全件、超過は0件送信で回答不能、400/401境界、FAQ0件、grounding失敗が観測できるtestを完了条件とする。
  - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 12.2, 12.4_
  - _Boundary: AnswerService, GroundingPolicy_
  - _Depends: 4.1, 5.1, 5.2_

- [ ] 6. SSE lifecycleと保存条件を完成する
- [ ] 6.1 typed SSE encoderとsingle-terminal guardを実装する
  - UTF-8の`event`/single-line JSON/blank-line frameを生成し、startを最初に一回、chunk sequenceを0から連番にする。
  - complete/unanswerable/errorの一つだけをterminalとして許し、terminal後のwriteを拒否する。
  - Unicode、改行escape、byte分割、0/複数chunk、重複terminalをparser contract testで確認できる状態を完了条件とする。
  - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.10, 12.5_
  - _Boundary: SseEncoder
  - _Depends: 1.3_

- [ ] 6.2 回答terminalと履歴保存をtransaction境界へ接続する
  - complete時は質問、固定回答、source snapshot、時刻、ownerを、unanswerable時は理由と案内を短いtransactionで保存する。
  - DB commit後だけcomplete/unanswerableを送信し、provider障害、timeout、grounding処理障害、save失敗では履歴を残さずerrorへする。
  - complete/unanswerableの再起動後履歴と各失敗の非保存をintegration testで観測できる状態を完了条件とする。
  - _Requirements: 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.5, 9.1, 9.2, 9.5, 11.1, 11.2, 11.3, 11.5, 11.6, 12.5_
  - _Boundary: AnswerService, HistoryRepository_
  - _Depends: 2.2, 5.3, 6.1_

- [ ] 6.3 disconnectとtimeoutをanswer streamへ伝播する
  - request signal、server timeout、provider signalを連結し、commit前disconnectでproviderとevent送信を止めて保存しない。
  - commit後transport disconnectは確定履歴を維持し、部分履歴や複数terminalを作らない。
  - commit前/後のrace、timeout、provider abort、writableでないerror eventを決定的なintegration testで再現できる状態を完了条件とする。
  - _Requirements: 6.7, 6.9, 6.10, 7.3, 11.1, 11.4, 11.5, 11.6, 12.2, 12.5_
  - _Boundary: AnswerService, OpenAiAnswerProvider, SseEncoder_
  - _Depends: 6.2_

- [ ] 6.4 POST answer APIをpreflightとSSEへ接続する
  - stream開始前にOrigin、Accept、Content-Type、session、questionを検証し、失敗時はJSON errorを返す。
  - 成功時はno-store/no-buffering headersとSSEを返し、AnswerServiceのeventだけをencodeする。
  - 正常、回答不能、400/401/403/406/415、AI failure、timeout、disconnect、save failureがAPI contractどおり観測できる状態を完了条件とする。
  - _Requirements: 3.2, 3.3, 3.8, 3.10, 3.12, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 11.1, 11.2, 11.4, 11.5_
  - _Boundary: AnswerRoute, HttpBoundary, SseEncoder_
  - _Depends: 3.3, 3.4, 6.3_

- [ ] 7. 契約・security・旧受入条件を横断検証する
- [ ] 7.1 OpenAPIと全HTTP responseのcontract testを完成する
  - 権威artifact `openapi.yaml`の全route、全request/success envelope、status別のstrict HTTP error code union、Cookie security、SSE discriminator payload/code/retryableをRoute Handler実応答と照合する。SSE errorは5 codeそれぞれでdiscriminator mapping先schemaへの適合と固定`retryable`（AI_UNAVAILABLE=true、AI_TIMEOUT=true、GROUNDING_FAILED=false、PERSISTENCE_FAILED=true、INTERNAL_ERROR=false）をcontract testで検証する。YAML構文、全`$ref`、operation数も検査する。
  - unknown field、誤content type、欠落Origin、期限切れsession、owner/admin境界、GET非変更、存在秘匿を検証する。
  - designのendpoint表にある全正常/異常pathがcontract suiteで成功する状態を完了条件とする。
  - _Requirements: 2.2, 2.3, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 4.8, 7.6, 8.4_
  - _Boundary: ApiContractTests_
  - _Depends: 3.4, 4.4, 6.4_

- [ ] 7.2 security・privacy regressionを完成する
  - password hash parameter、raw password/token非保存、Cookie全属性、Origin exact match、AI `store:false`とtoolなしを検証する。
  - 全error/log pathへmarkerを流し、password、session token、question、answer、FAQ本文、provider bodyが出ないことを確認する。
  - 実secretや未承認modelを使わずsecurity suiteが成功する状態を完了条件とする。
  - _Requirements: 1.3, 1.7, 2.2, 2.3, 2.8, 3.9, 3.10, 5.4, 5.5, 5.10, 5.11, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 12.6_
  - _Boundary: SecurityIntegrationTests_
  - _Depends: 7.1_

- [ ] 7.3 persistence、競合、外部障害のserver regressionを完成する
  - DB再起動、FAQ/feedback並行race、owner分離、AI中に長時間transactionなし、全FAQ上限を検証する。
  - complete/unanswerable保存とprovider error/timeout/disconnect/save failure非保存、SSE順序・single terminalを一つのmatrixで確認する。
  - 外部OpenAIを呼ばず旧タスク7のserver側受入条件がすべて成功する状態を完了条件とする。
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4, 12.5_
  - _Boundary: ServerRegressionTests_
  - _Depends: 7.2_

- [ ] 7.4 runtime、migration、boundaryの最終gateを実行する
  - clean DBでmigration/seed、strict typecheck、全test、production build、Node Runtime smokeを実行する。
  - Node patch、native argon2、Prisma adapter互換とArgon2id host benchmarkを確認し、OWASP最低値を下げない。
  - 画面API接続、画面横断E2E、FAQ削除、複数instance、実秘密が差分に含まれず、後続client仕様が確定契約を利用可能な状態を完了条件とする。
  - _Requirements: 9.6, 10.6, 12.3, 12.7_
  - _Boundary: RuntimeValidation, SpecificationBoundary_
  - _Depends: 7.3_
