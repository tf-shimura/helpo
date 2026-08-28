# Implementation Plan

> 各sub-taskは1〜3時間を目安とする。`spec.json`のapprovals/ready=trueはbatch skill上「仕様が実装計画としてready」を意味し維持するが、client接続taskは`helpo-server` task 7.4実装完了と`.kiro/specs/helpo-server/openapi.yaml` version `1.0.0`・レビュー記録済みSHA-256 checksumの一致まで開始禁止とする。server contract、業務規則、秘密をclientへ複製しない。
>
> **File ownership / `_Boundary:`規則**: clientは`src/app`のpage route（`/`, `/ask`, `/history`, `/faqs`, `/admin/faqs`系）、`src/components/**`、`src/presentation/**`、`tests/unit/client/**`、`tests/integration/client/**`、`tests/e2e/**`をOwnsする。各`_Boundary:`名はdesign File Structure Planの同名production fileとtask専用`tests/**/<task-id>-*`だけを`Owns/May touch tests`するものと読む。(P)同士はproduction/test fileを共有しない。統合taskは明記したlayout/provider/navigation wiring filesと専用integration testsだけを変更する。serverの`src/app/api/**`、OpenAPI/schema、domain/application/infrastructure、Prisma、server依存は禁止する。`package.json`/lockfileは承認済みclient依存（Testing Library/Playwright等）だけを公式version gate後に変更可能とする。

**完全dependency DAG**: server `7.4`完了 + OpenAPI version/checksum gate `→1.1`; `1.1→1.2`; `1.1→1.3`; `1.1,1.3→2.1/2.2`; `2.1,2.2→2.3`; `1.1,1.3→3.1/3.2`; `2.1,2.2,3.1,3.2→3.3`; `2.3,3.3→4.1`; `2.3→4.2/4.3`; `4.1,4.2→4.4`; `4.1–4.4→4.5→5.1→5.2`; `5.2→6.1/6.2`; `6.1,6.2→6.3→6.4`。`spec.json.ready=true`でもこの接続gateを迂回しない。

- [ ] 1. 上流契約とNext client hostの基礎を整える
- [ ] 1.1 上流契約の実装開始gateと型生成を固定する
  - `/api/v1`の9操作（GET/POST/DELETE sessionを含む）、Actor/Faq/Source/History/Feedback、全request/success envelope、分離済みHTTP/SSE code union、Cookie、SSE discriminator/framing/retryableが上流artifactへ展開されていることを検証する。artifact version `1.0.0`とSHA-256 checksumをレビュー記録へ固定する。
  - artifactからstatus/codeごとのstrict error envelope（`fields`はVALIDATION_ERRORだけ、`retryAt`はLOGIN_LOCKEDだけ）を含むclient DTO/runtime schemaを生成し、手書きfield補完、`any`、unchecked castを禁止する。
  - 契約欠落またはdriftでbuildが失敗し、完全な上流artifactからtypecheckが成功する状態を完了条件とする。
  - _Requirements: 1.4, 3.1, 3.8, 8.4, 9.8_
  - _Boundary: ContractTypes_
  - _Depends: helpo-server 7.4完了, OpenAPI version/checksum gate_

- [ ] 1.2 Vite画面資産をNext App Routerの5 route shellへ移す
  - 上流が用意したNext host上にログイン、質問、履歴、FAQ閲覧、FAQ管理のrouteとglobal styleを配置する。
  - 既存navigation、現在地、空状態、tooltip association、page markupを維持し、server domain/infrastructureへ依存しない。
  - API未接続のstatic screen regressionで5画面とrole別表示がNext production build上に現れる状態を完了条件とする。
  - _Requirements: 1.1, 1.2, 1.3, 6.3, 9.8_
  - _Boundary: FivePages, NextClientHost_
  - _Depends: 1.1_

- [ ] 1.3 client test harnessと安全なbrowser artifact既定値を作る
  - Vitest/Testing LibraryにFetch、ReadableStream、TextDecoder、AbortSignalの決定的fixtureを用意する。
  - Playwrightをlocal server fixtureへ接続し、storageStateを永続化せず、trace/video/screenshotとconsole/network loggingを秘密・本文非記録の既定値にする。
  - 外部AIや実秘密なしでunit、integration、空のE2E smokeが実行できる状態を完了条件とする。
  - _Requirements: 8.1, 8.2, 8.5, 9.1, 9.7_
  - _Boundary: ClientTestHarness, PlaywrightSuites_
  - _Depends: 1.1_

- [ ] 2. 型安全なHTTP・session境界を作る
- [ ] 2.1 同一origin JSON API clientを実装する
  - 相対`/api/v1` URL、same-origin credentials、JSON Content-Type、no-storeを各契約操作へ適用し、成功応答をruntime検証する。
  - GET session Actor復元、login/logout、FAQ list/create/update、history、feedbackを上流method/path/statusどおり提供し、tokenやmodelを引数・body・logへ含めない。
  - 実route contract fixtureで全正常status/schemaとmalformed successのfail-closedが観測できる状態を完了条件とする。
  - _Requirements: 1.4, 1.5, 3.8, 6.1, 6.4, 6.5, 7.2, 8.1, 8.2, 8.3_
  - _Boundary: ApiClient_
  - _Depends: 1.1, 1.3_

- [ ] 2.2 (P) 標準HTTP errorをUI outcomeへ変換する
  - OpenAPIで各operation/statusに許可されたstrict envelopeだけを受理して400/401/403/404/409/406/415/423/500と全安定codeを判別し、validation fields、再認証、権限拒否、競合、retryを型付き結果へ変換する。`fields`はVALIDATION_ERRORだけ、`retryAt`はLOGIN_LOCKEDだけで受理する。
  - status/code不一致、未知code、許可されない`fields`/`retryAt`を含む未知field、不正JSONを成功扱いせず、response bodyや内部情報をlogしないsafe fallbackにする。
  - 全公開codeとmalformed/unknown fixtureで期待するUI outcomeが返るunit testを完了条件とする。
  - _Requirements: 2.2, 2.3, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 8.4, 8.5_
  - _Boundary: ErrorMapper_
  - _Depends: 1.1_

- [ ] 2.3 token-free session stateと保護画面遷移を実装する
  - actorだけをunknown/authenticated/unauthenticated stateで管理し、Cookie値を読まず、login成功、logout、保護APIの401を全画面へ反映する。
  - refresh/direct access時は`GET /api/v1/session`でActor/roleを復元し、401では社内情報を消去してloginへ遷移する。
  - login成功、invalid/locked、logout、期限切れ401、認証済みlogin access、一般社員admin拒否が画面testで観測できる状態を完了条件とする。
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 8.2, 8.4, 9.2_
  - _Boundary: SessionState, ScreenAdapters_
  - _Depends: 2.1, 2.2_

- [ ] 3. 回答stream protocolとUI lifecycleを作る
- [ ] 3.1 (P) incremental UTF-8 SSE parserを実装する
  - byte境界を跨ぐUnicodeをstreaming decodeし、LF/CRLF、`event`、single-line JSON `data`、空行frameを解析する。
  - 上流5 eventをruntime検証し、unknown event、不正JSON、不正field、terminalなしEOFをprotocol failureにする。
  - byte/frame分割、複数frame、改行escape、0 chunk用fixtureが欠落・重複なしでparseされるunit testを完了条件とする。
  - _Requirements: 4.5, 4.6, 4.7, 4.8, 4.9, 4.11, 9.1_
  - _Boundary: SseParser_
  - _Depends: 1.1, 1.3_

- [ ] 3.2 (P) answer event reducerとsingle-terminal guardを実装する
  - idle、awaiting start、streaming、completed、unanswerable、failed、abortedを判別し、同一answerIdと0始まり連番を強制する。
  - completeだけにanswer/source、unanswerableにmessage、error/invalid EOFにsafe retry stateを与え、部分回答を確定扱いしない。
  - start重複、sequence gap、ID不一致、terminal重複、terminal後data、abortで最初の確定状態が上書きされないunit testを完了条件とする。
  - _Requirements: 4.5, 4.6, 4.7, 4.8, 4.9, 4.11, 5.5, 7.1_
  - _Boundary: AnswerState_
  - _Depends: 1.3_

- [ ] 3.3 POST answer clientとAbort lifecycleを統合する
  - JSON questionと`Accept: text/event-stream`でPOSTし、preflight JSON errorと200 streamをcontent typeに基づいて分ける。
  - request単位AbortControllerとgeneration IDを用い、中断・画面離脱後のeventと古いretry eventをUIへ反映しない。
  - 400/401/403/406/415、0/複数chunk complete、unanswerable、error、unexpected EOF、利用者中断が実ReadableStream testで観測できる状態を完了条件とする。
  - _Requirements: 3.6, 3.7, 4.1, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 8.3, 9.1_
  - _Boundary: ApiClient, SseParser, AnswerState_
  - _Depends: 2.1, 2.2, 3.1, 3.2_

- [ ] 4. 5画面を実API stateへ接続する
- [ ] 4.1 質問入力・stream・source表示を接続する
  - 既存0/1/400/401 Unicode書記素、空白、tooltip、処理中重複防止を維持してanswer clientへ接続する。
  - streamingはchunkを順次表示し、completeで完成本文と重複なしFAQ質問、unanswerableで案内、failureでsafe retryを表示する。
  - 生成中・回答不能・失敗ではsourceを表示せず、abort結果をlocal historyへ追加しない画面testを完了条件とする。
  - _Requirements: 3.2, 3.7, 3.9, 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 4.8, 4.9, 4.10, 5.5, 9.3_
  - _Boundary: AskAdapter, AskPage_
  - _Depends: 2.3, 3.3_

- [ ] 4.2 (P) 履歴画面をserver authorityへ接続する
  - 画面表示時にGET historyを実行し、newest-firstの本人結果、日時、質問、outcome、source、任意feedbackを表示する。
  - 空一覧の正式文言、401 global遷移、失敗時safe retryを扱い、client actor IDでfilterやowner推測を行わない。
  - complete/unanswerableだけが再取得後に現れ、error/abortは仮追加されないintegration testを完了条件とする。
  - _Requirements: 1.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 9.6_
  - _Boundary: HistoryAdapter, HistoryPage_
  - _Depends: 2.3_

- [ ] 4.3 (P) FAQ閲覧・管理画面をserver authorityへ接続する
  - GET listとadmin create/updateを接続し、empty state、role別導線、新規/編集mode、未変更保存、成功文言を維持する。
  - 0/1/1000/1001 Unicode書記素、空白入力、field error、FAQ conflict、403、404で入力を保持し、成功後に一覧を再取得する。
  - 一般社員に管理操作がなく、adminの登録・修正・競合が実responseと一致し、削除requestが存在しない画面testを完了条件とする。
  - _Requirements: 1.5, 3.2, 3.3, 3.5, 3.9, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 9.3, 9.5_
  - _Boundary: FaqAdapter, FaqPages_
  - _Depends: 2.3_

- [ ] 4.4 feedbackを確定回答と履歴へ接続する
  - `complete`の未評価結果だけにGOOD/BADを送信し、成功時に選択値と受付完了を表示して両操作を非活性にする。`unanswerable`には評価UI/requestを作らない。
  - 409では再取得済み評価へ同期し、404/401/5xxを成功扱いせず、変更・取消・集計操作を作らない。
  - 進行中/失敗/評価済みでは送信不能で、質問画面と履歴の評価表示がserver結果へ一致するintegration testを完了条件とする。
  - _Requirements: 3.4, 3.5, 3.9, 4.7, 4.8, 7.1, 7.2, 7.3, 7.4, 8.4_
  - _Boundary: AskAdapter, ApiClient, AskPage, HistoryAdapter_
  - _Depends: 4.1, 4.2_

- [ ] 4.5 navigationと全画面error/session transitionを統合する
  - 質問、履歴、FAQ閲覧、FAQ管理間の導線とlogoutをAPI-connected providerへ統合する。
  - 任意画面の401でconfidential stateを一括消去し、403/404/409/5xxは各画面の安全なoutcomeへ留める。
  - 一般社員・管理者社員・未認証で直接URLとnavigationがscreen mapどおりになるintegration testを完了条件とする。
  - _Requirements: 1.1, 1.2, 1.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.5, 3.7, 8.4, 9.2, 9.8_
  - _Boundary: HelpoClient, SessionState, ScreenAdapters, FivePages_
  - _Depends: 4.1, 4.2, 4.3, 4.4_

- [ ] 5. 実server境界の統合検証を完成する
- [ ] 5.1 HTTP/session/error contract integration matrixを作る
  - login 200/401/423、logout 204、全保護route 401、admin 403、FAQ/feedback 404/409、400 fields、406/415、5xxを実Route Handlerで検証する。
  - Cookie jarはbrowser mechanismだけで扱い、値をtest assertion、snapshot、logへ取り出さない。
  - 上流endpoint表の全client-observable pathと未知/不正response fail-closedが成功する状態を完了条件とする。
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 8.2, 8.4, 9.2_
  - _Boundary: ClientIntegrationTests_
  - _Depends: 4.5_

- [ ] 5.2 stream・persistence・disconnect integration matrixを作る
  - fake provider/test DBでcomplete、0 chunk complete、unanswerable、AI failure、timeout、grounding failure、save failure、commit前/後disconnectを実HTTP streamから再現する。
  - start first、chunk 0連番、single terminal、sourceを照合する。errorは5 codeすべてについてOpenAPI discriminator mapping先の対応schemaと固定`retryable`（AI_UNAVAILABLE=true、AI_TIMEOUT=true、GROUNDING_FAILED=false、PERSISTENCE_FAILED=true、INTERNAL_ERROR=false）をclient runtime schema/parserで検証し、履歴再取得の保存/非保存を確認する。
  - complete/unanswerableだけ保存、error/save failure/commit前abortは非保存、commit後disconnectは確定履歴維持のmatrixが成功する状態を完了条件とする。
  - _Requirements: 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 5.4, 5.5, 9.1, 9.6_
  - _Boundary: ClientIntegrationTests, SseParser, AnswerState_
  - _Depends: 5.1_

- [ ] 6. 旧6・7の画面横断E2Eとsecurity gateを完成する
- [ ] 6.1 (P) 一般社員の主要Playwright導線を実装する
  - login、0/1/400/401質問、逐次表示、単一/複数source、Good/Bad、本人履歴、FAQ、logoutを実serverで操作する。
  - 回答不能、AI failure/retry、利用者中断、期限切れ401、空履歴/FAQを決定的fixtureで確認する。
  - 旧タスク6の一般社員画面統合と旧タスク7のbrowser条件が一つのrepeatable suiteで成功する状態を完了条件とする。
  - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.4, 2.5, 3.7, 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 4.8, 4.9, 4.10, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 9.1, 9.2, 9.3, 9.4, 9.6, 9.8_
  - _Boundary: PlaywrightEmployeeSuite_
  - _Depends: 5.2_

- [ ] 6.2 (P) 管理者の主要Playwright導線を実装する
  - admin login、`/admin/faqs`系UI routeでFAQ 0/1/1000/1001、登録、未変更修正、完全一致競合、一覧再取得、後続質問への反映を実serverで操作する（APIは`/api/v1/faqs`を維持）。
  - 一般社員の管理導線非表示と直接access 403、存在しない編集404、FAQ削除操作なしを確認する。
  - 旧タスク6の管理者画面統合と旧タスク7のbrowser条件がrepeatable suiteで成功する状態を完了条件とする。
  - _Requirements: 1.1, 1.2, 1.3, 2.6, 3.2, 3.3, 3.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 9.2, 9.3, 9.5, 9.8_
  - _Boundary: PlaywrightAdminSuite_
  - _Depends: 5.2_

- [ ] 6.3 browser security・privacy regressionを実装する
  - production bundle、HTML、client env、network bodyへOpenAI credential/model/server-only設定またはsession token fieldがないことを検査する。
  - third-party requestがなく、console/test report/trace/video/screenshot/storageStateへpassword、Cookie値、質問、回答、FAQ本文が保存されないことを検証する。
  - 実秘密を使わずsecurity suiteが成功し、role表示だけではserver拒否を迂回できない状態を完了条件とする。
  - _Requirements: 2.8, 8.1, 8.2, 8.3, 8.4, 8.5, 9.7_
  - _Boundary: PlaywrightSecuritySuite_
  - _Depends: 6.1, 6.2_

- [ ] 6.4 production mock data pathを除去して最終gateを実行する
  - production import graphからmock-store、controlled-answer、manual-clock、screen-access authorityを除去し、test determinismをserver fixtureへ限定する。
  - strict typecheck、unit、integration、全Playwright E2E、production buildを実行し、server route/schema/dependency/lockfileを本仕様の都合で変更していないことを確認する。
  - 5画面、全9 requirements、旧6/7移管matrix、秘密非露出が通り、実装可能なclient integrationとして完成する状態を完了条件とする。
  - _Requirements: 1.1, 1.4, 9.1, 9.4, 9.5, 9.6, 9.7, 9.8_
  - _Boundary: RuntimeValidation, SpecificationBoundary_
  - _Depends: 6.3_
