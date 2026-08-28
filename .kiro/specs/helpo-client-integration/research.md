# Research & Design Decisions

## Summary
- **Feature**: `helpo-client-integration`
- **Discovery Scope**: Complex Integration（既存Vite UI、先行Next.js server契約、security-sensitive session、SSE、browser E2E）
- **Key Findings**:
  - `helpo-server/design.md`の`/api/v1` endpoint表、Cookie名・属性、error code、SSE frame/order/save境界を唯一の通信契約とする。
  - Vite固有entryとbrowser mockをNext.js App Routerのclient boundaryへ移す一方、既存5画面の表示・入力受入条件は維持する。
  - POST response streamは`EventSource`ではなくFetch APIの`Response.body`をincremental UTF-8 decodeしてSSE framingを解析し、AbortControllerで中断する。

## Research Log

### 上流HTTP・session・SSE契約
- **Context**: クライアントがserver-owned規則を複製せず正確に接続する必要がある。
- **Sources Consulted**: `.kiro/specs/helpo-server/{requirements.md,design.md,tasks.md,spec.json}`、[MDN Using Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)、[MDN Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams)、[HTML Living Standard Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- **Findings**: Base pathは`/api/v1`。状態変更はOrigin、JSON Content-Type、Cookie認証をserverが検証する。回答だけPOST `fetch`、`Accept: text/event-stream`、`ReadableStream`で受信する。frameは`event:`とsingle-line JSONの`data:`、空行終端。start first/once、chunk sequence 0連番、terminal once。
- **Implications**: endpoint/schema/errorをclient独自定義せず、serverのmachine-readable OpenAPI artifactから境界型を生成または検証する。parserはbyte chunkとevent frameが一致しない前提でincremental decodeする。

### HttpOnly CookieとNext.js client境界
- **Context**: tokenをJavaScriptへ露出せず同一origin要求へ含める必要がある。
- **Sources Consulted**: [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)、[MDN Request credentials](https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials)、[Next.js Environment Variables](https://nextjs.org/docs/app/guides/environment-variables)、[Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- **Findings**: HttpOnly CookieはJSから読めないがfetchへ送信される。同一origin相対URLと`credentials: same-origin`を明示する。`NEXT_PUBLIC_`値はbrowser bundleへinlineされる。
- **Implications**: session stateはtokenではなくserverが返すActorと401結果だけで管理する。OpenAI key/modelおよびserver-only envをclient moduleへimportしない。認可はserver判定が正で、roleは表示制御にだけ使う。

### 既存UIとVite-to-Next移行
- **Context**: `src/MockApp.tsx`が5画面とmemory mockを統合し、`src/main.tsx`がVite entryである。
- **Sources Consulted**: 現行`src/`、`tests/unit/`、`package.json`、[Next.js App Router](https://nextjs.org/docs/app)、[Next.js use client](https://nextjs.org/docs/app/api-reference/directives/use-client)
- **Findings**: 画面component、navigation、grapheme入力制御は再利用できる。mock-store、controlled-answer、manual-clock、screen-accessはproduction data pathから除去する。上流server task 1.2がNext hostを先に作る。
- **Implications**: 本仕様はserver実装後のNext hostを前提に、`src/app` page shellとclient providerへ既存画面を接続する。server route/domain/infrastructureは変更しない。

### 決定的browser test
- **Context**: 外部AI、実時間、秘密に依存せず実HTTP/SSE境界を検証する必要がある。
- **Sources Consulted**: [Playwright webServer](https://playwright.dev/docs/test-webserver)、[Playwright authentication](https://playwright.dev/docs/auth)、[Playwright network](https://playwright.dev/docs/network)
- **Findings**: Playwrightはlocal web serverを起動でき、browser contextごとにCookieを分離できる。保存済み認証stateには機密Cookieが含まれ得る。
- **Implications**: tokenを含むstorageState artifactは保存しない。test専用server fixture/fake provider/clockを上流server test seam経由で選び、実routeを通す。trace/video/screenshotは失敗時にも秘密・本文を残し得るため、security scenarioでは無効化またはredactionを検証する。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Decision |
|---|---|---|---|---|
| 画面から直接fetch | 各画面がHTTP/SSEを個別処理 | 小規模 | error/session/parserが重複 | 不採用 |
| Typed client + UI state adapters | transport、session、stream reducerを画面から分離 | 契約整合、決定的test、単一責務 | 境界componentが増える | 採用 |
| client-side business repository | server規則をbrowserへ複製 | offline風動作 | authority二重化、security違反 | 不採用 |
| EventSource | SSE native client | parser不要 | POST bodyを送れない | 不採用 |

## Design Decisions

### Decision: 上流契約を生成・検証元にする
- **Context**: endpointとschemaのdriftを防ぐ。
- **Alternatives Considered**: 手書きDTO、上流OpenAPI由来の型とruntime parse。
- **Selected Approach**: server task 7.1のmachine-readable OpenAPIをsourceとして型生成し、SSE event unionは上流designの5 eventを厳密runtime parseする。
- **Rationale**: clientがserver-owned contractを再定義しない。
- **Trade-offs**: server artifact完成まで実装開始不可。
- **Follow-up**: Actor、History、Feedbackを含む全success schemaがartifactへ展開済みであることをintegration gateで確認する。

### Decision: token-free session state
- **Context**: `helpo_session`はHttpOnlyでなければならない。
- **Selected Approach**: Actorの`unknown | authenticated | unauthenticated`だけをmemory stateに保持し、保護APIの401を全画面共通でlogout transitionへ変換する。
- **Rationale**: tokenを読まずにUIを同期できる。
- **Trade-offs**: refresh時はserver確認が必要。

### Decision: protocol parserとanswer reducerを分離する
- **Context**: byte fragmentation、UTF-8分割、event順序違反とUI lifecycleは異なる責務。
- **Selected Approach**: parserはframe→validated event、reducerはstart/chunk/terminal→UI stateだけを担当する。
- **Rationale**: protocol fixtureとUI integrationを独立検証できる。
- **Trade-offs**: terminal後dataやsequence gapをfail closedで一般エラーにする。

### Decision: optimistic persistenceを行わない
- **Context**: complete/unanswerableはserver commit後、error/disconnectは非保存。
- **Selected Approach**: terminal表示後も履歴・FAQ・feedbackはserver再取得値をauthorityとする。
- **Rationale**: persistence raceとclient推測を排除する。
- **Trade-offs**: 更新後に追加requestが必要。

## Risks & Mitigations
- 上流OpenAPIのsuccess schema不足 — client実装開始gateでActor/FAQ/History/Feedback/Error全schemaの存在を検証し、推測型を作らない。
- UTF-8/SSE byte分割 — streaming `TextDecoder`とbuffer、EOF flush、fixture matrixで検証する。
- unmount後state更新 — request単位AbortControllerとgeneration IDで古いeventを破棄する。
- Cookie/本文がtest artifactへ残る — storageStateを永続化せず、trace/video/screenshots/log policyをsecurity testで検査する。
- Vite UI regression —既存unit acceptanceをNext hostで維持し、旧6/7 matrixをPlaywrightへ移す。

## References
- [Fetch Standard](https://fetch.spec.whatwg.org/)
- [HTML Living Standard: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [MDN: Using readable streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams)
- [MDN: Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js Environment Variables](https://nextjs.org/docs/app/guides/environment-variables)
- [Playwright documentation](https://playwright.dev/docs/intro)
