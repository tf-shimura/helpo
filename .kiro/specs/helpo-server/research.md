# Research & Design Decisions

## Summary
- **Feature**: `helpo-server`
- **Discovery Scope**: Complex Integration（既存ViteモックからNext.jsサーバー基盤への移行）
- **調査日**: 2026-08-28
- **主要所見**:
  - Next.js 16.3.3はNode.js 20.9以上を要求するが、OpenAI Node SDK 7.8.0はNode.js 22以上、Prisma 7.10.0はNode.js `^20.19 || ^22.12 || >=24.0`を要求する。共通互換範囲かつ2026-08時点のActive LTSとしてNode.js 24系を固定対象とする。
  - Prismaのnpm `latest`が調査時点で8.0.0 RCを指したため採用せず、安定系列の`prev`であるPrisma CLI / Client / SQLite adapter 7.10.0を明示固定する。
  - OpenAI Responses APIのストリームはprovider固有イベントを返す。本システムはそれをブラウザへ透過せず、検証済み引用から構成する独自SSE契約へ変換する。

## Research Log

### Next.js App RouterとNode Runtime
- **Sources Consulted**: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)、[Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)、[Environment variables](https://nextjs.org/docs/app/guides/environment-variables)、npm package metadata。
- **Findings**: Next.js 16.3.3のengineはNode.js `>=20.9.0`。Route HandlerはWeb `Request`/`Response`とストリーム応答を扱える。`NEXT_PUBLIC_`接頭辞の変数はクライアントへインライン化される。
- **Implications**: 全API Route Handlerに`runtime = 'nodejs'`を明示し、秘密変数へ`NEXT_PUBLIC_`を付けない。Node.js 24系の正確なパッチは実装開始時に公式リリースとセキュリティ情報を確認しlock/toolchainで固定する。

### PrismaとSQLite
- **Sources Consulted**: [Prisma SQLite connector](https://www.prisma.io/docs/orm/overview/databases/sqlite)、[Prisma system requirements](https://www.prisma.io/docs/orm/reference/system-requirements)、npm package metadata。
- **Findings**: SQLite connectorはローカルファイルDBをサポートする。Prisma 7はdriver adapterを使用し、7.10.0はNode 24をサポートする。CLI、client、adapterの同一version固定が安全である。
- **Implications**: `prisma`, `@prisma/client`, `@prisma/adapter-better-sqlite3`を7.10.0へ揃える。単一プロセス前提、WALと短いtransaction、一意制約で競合を処理する。Prisma 8 RCへ暗黙更新しない。

### OpenAI Responses APIとストリーミング
- **Sources Consulted**: [Responses create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)、[Streaming Responses](https://developers.openai.com/api/docs/guides/streaming-responses)、[Models](https://developers.openai.com/api/docs/models)、npm `openai` metadata。
- **Findings**: Responses APIは`stream: true`で型付きserver-sent eventsを返し、Structured Outputsを指定できる。`store`は明示制御可能。SDK 7.8.0はNode.js 22以上を要求する。モデル利用可否とデータ統制はorganization/projectに依存する。
- **Implications**: SDK 7.8.0、`responses.create`、`stream: true`、`store: false`、厳格JSON schemaを使用する。モデル名は仕様へ推測固定せず、`OPENAI_MODEL`と`OPENAI_ALLOWED_MODELS`の一致、Models APIでの利用可否、Responses・Structured Outputs対応、組織承認を実装前ゲートで検証し、その結果をlockされた非秘密設定に固定する。未検証時は起動またはAI readinessを失敗させる。

### Zod
- **Sources Consulted**: [Zod documentation](https://zod.dev/)、npm metadata。
- **Findings**: Zod 4はTypeScript strict modeを要求・推奨し、Zod 4.4.3はMIT。外部入力の型推論と実行時検証を同じschemaから得られる。
- **Implications**: Zod 4.4.3をHTTP、環境変数、AI出力の境界に限定して採用する。Unicode書記素数は`Intl.Segmenter`による独自refinementで検証する。

### Argon2idとOWASP
- **Sources Consulted**: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)、[node-argon2](https://github.com/ranisalt/node-argon2)、npm metadata。
- **Findings**: OWASPはArgon2idを推奨し、最低構成として19 MiB memory、2 iterations、parallelism 1を提示する。`argon2` 0.45.1はMIT、Node 16.17以上、Argon2id既定、prebuilt binariesを提供する。
- **Implications**: `argon2` 0.45.1を採用し、最低でも`memoryCost=19456`, `timeCost=2`, `parallelism=1`, `hashLength=32`を明示する。研修ホストでベンチマークし、ログインDoSを悪化させず約1秒未満となる範囲で最低値以上へ増強する。pepperは本仕様では導入しない。

### Cookie、CSRF、セッション
- **Sources Consulted**: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)、[OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)、[MDN Set-Cookie](https://developer.mozilla.org/docs/Web/HTTP/Headers/Set-Cookie)。
- **Findings**: HttpOnly、Secure、SameSiteは多層防御であり、状態変更にはOrigin検証が必要。セッションIDは十分なentropyを持つべきである。
- **Implications**: 32 random bytesのtoken、SHA-256 hash保存、`HttpOnly; SameSite=Lax; Path=/`、HTTPS時`Secure`、絶対24時間。POST/PATCHは`Origin`を公開originと厳密比較し、欠落時は同一originを証明できないため拒否する。

## Architecture Pattern Evaluation

| Option | Strengths | Risks / Limitations | Decision |
|---|---|---|---|
| Route Handler直結CRUD | 小規模 | 業務規則・ORM・AIがpresentationへ漏れる | 不採用 |
| Clean/Hexagonal modular monolith | portで時刻・DB・AIを差替可能、steering準拠 | 初期ファイル数が増える | 採用 |
| 別AI service | 独立scale | ローカル単一instanceには過剰 | 不採用 |

## Design Decisions

### 安定版を明示固定し、変動項目へ検証ゲートを置く
- **Selected Approach**: Next.js 16.3.3、React 19.1.1、TypeScript 5.9.2、Node.js 24.x、Prisma三package 7.10.0、OpenAI 7.8.0、Zod 4.4.3、argon2 0.45.1、Vitest 4.1.6を互換組として採用する。
- **Trade-offs**: NodeパッチとOpenAIモデルは時間・組織依存のため、実装開始時に公式情報で固定する必須ゲートを残す。ゲート未通過で実装完了扱いにしない。

### Provider streamを公開契約へしない
- **Selected Approach**: Responses APIイベントをadapter内に閉じ、applicationが`start/chunk/complete/unanswerable/error`のSSEへ変換する。
- **Rationale**: provider変更と未検証deltaの漏出を防ぎ、保存条件を終端イベントと一致させる。

### AIに自由回答を生成させない
- **Selected Approach**: 全FAQのIDと回答本文から、IDと完全一致引用の配列だけをStructured Outputsで選ばせ、server固定テンプレートで構成する。
- **Trade-offs**: FAQ総量が上限を超えると回答不能になるが、暗黙の切捨てやhallucinationを避ける。

### 長時間transactionを分割する
- **Selected Approach**: 質問受理時にDB transactionを保持せず、AI完了後に履歴と使用FAQ snapshotを短いtransactionで保存してから成功終端を送る。
- **Rationale**: SQLite writer lockと「成功表示されたが未保存」を防ぐ。

### 最小限のportだけを設ける
- **Selected Approach**: Repository、AnswerProvider、Clockをport化し、Unicode、cookie、HTTP変換は共有境界utilityとする。
- **Rationale**: テスト差替えが必要な依存だけを抽象化し、仮想的な汎用repositoryを作らない。

## Risks & Mitigations
- FAQ総量がprovider contextを超える — UTF-8 byte/token予算を呼出前に検査し、全件不可なら回答不能。
- SSE開始後はHTTP statusを変更できない — 開始前検証を完了し、開始後は単一error終端を用いる。
- disconnectと保存のrace — AbortSignalを伝播し、保存開始前にabort確認。保存済み後のtransport切断は確定履歴として扱う境界をテストする。
- SQLite並行writer競合 — WAL、短いtransaction、DB一意制約、限定retry後の安定した競合/5xx変換。
- モデル/data governanceの時間依存 — 実装開始ゲートを未解決blockerとして保持し、承認記録なしに実AIを有効化しない。

## References
- [Next.js Installation](https://nextjs.org/docs/app/getting-started/installation)
- [Prisma SQLite](https://www.prisma.io/docs/orm/overview/databases/sqlite)
- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [OpenAI Streaming Responses](https://developers.openai.com/api/docs/guides/streaming-responses)
- [OpenAI Models](https://developers.openai.com/api/docs/models)
- [Zod](https://zod.dev/)
- [node-argon2](https://github.com/ranisalt/node-argon2)
- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
