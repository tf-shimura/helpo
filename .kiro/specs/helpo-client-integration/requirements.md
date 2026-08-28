# Requirements Document

## Introduction

Helpoを利用する一般社員と管理者社員は、既存5画面の操作性を維持したまま、再読み込み後も確定データが残る実サーバーへ安全に接続する必要がある。本仕様は、ブラウザ内モックを先行`helpo-server`の確定済み通信契約へ置き換え、認証状態、APIエラー、回答ストリーム、履歴、FAQ、評価を画面へ反映し、主要導線を決定的に検証する。

## Boundary Context

- **対象範囲**: 既存5画面の実API接続、Cookieに基づくセッション表示と遷移、機械判定可能なエラー表示、回答の逐次表示と中断、FAQ・履歴・評価の再取得、クライアント統合テスト、一般社員・管理者社員のブラウザE2E。
- **対象外**: 認証・認可、ログインロック、FAQ重複、履歴所有者、二重評価、回答根拠、永続化、AI呼出し、同一オリジン判定などサーバー所有の規則およびAPI契約の変更。本番運用、FAQ削除、分析、モバイル最適化も含めない。
- **隣接事項**: `helpo-server`の実装と機械可読契約が接続開始の前提である。クライアントはそのHTTP、Cookie、JSON、SSE、保存条件を変更せず消費し、契約変更時は本仕様を再検証する。

## Requirements

### Requirement 1: 5画面と実データへの移行
**Objective:** 社員として、慣れた5画面を引き続き利用したい。それにより、実サーバーへの移行後も同じ業務導線を利用できる。

#### Acceptance Criteria
1. The Helpoクライアント shall ログイン、質問、履歴、FAQ閲覧、FAQ管理の5画面と既存の共通ナビゲーション、現在地、入力境界、空状態、完了表示を維持する
2. When 認証済み社員が質問、履歴、またはFAQ閲覧を選択した, the Helpoクライアント shall 対応する画面を表示し、その項目を現在地として示す
3. While FAQ管理画面を表示している, the Helpoクライアント shall 共通ナビゲーションを表示し、質問、履歴、FAQ閲覧のいずれも現在地として示さない
4. The Helpoクライアント shall ブラウザ内モックのアカウント、FAQ、回答、履歴、評価を利用者向けデータ源として使用しない
5. When サーバーで確定したFAQ、回答結果、履歴、または評価を再取得した, the Helpoクライアント shall その確定状態を対応画面へ表示する

### Requirement 2: セッションUIとアクセス遷移
**Objective:** 社員として、サーバー管理の認証状態に応じた安全な画面遷移を利用したい。それにより、未認証時に社内情報が表示されない。

#### Acceptance Criteria
1. When 有効な資格情報によるログインが成功した, the Helpoクライアント shall 認証済み社員の役割を反映して質問画面を表示する
2. If ログインが`INVALID_CREDENTIALS`で拒否された, the Helpoクライアント shall 社員IDとパスワードのどちらが不正かを区別しない失敗案内を表示する
3. If ログインが`LOGIN_LOCKED`で拒否された, the Helpoクライアント shall ロック中であることを表示し、ログイン画面に留まる
4. When 認証済み社員がログアウトした, the Helpoクライアント shall 社内情報と認証済みナビゲーションを消去してログイン画面を表示する
5. If 保護対象の取得または変更が`UNAUTHENTICATED`で拒否された, the Helpoクライアント shall 現在の社内情報を表示せずログイン画面を表示する
6. If 一般社員によるFAQ管理が`FORBIDDEN`で拒否された, the Helpoクライアント shall FAQ管理内容を表示せず「権限がありません」と表示する
7. When 再読み込み、保護画面への直接アクセス、または認証済み社員によるログイン画面アクセスが発生した, the Helpoクライアント shall `GET /api/v1/session`でActorと役割を復元し、有効なら質問画面または要求された許可画面を表示し、401なら社内情報を消去してログイン画面を表示する
8. The Helpoクライアント shall セッショントークンを画面、JavaScript状態、要求本文、ログ、文書、またはテストデータへ保持または表示しない

### Requirement 3: HTTPエラーと入力結果の表示
**Objective:** 社員として、失敗理由と次の操作を理解したい。それにより、安全に入力修正、再試行、または再認証できる。

#### Acceptance Criteria
1. The Helpoクライアント shall HTTPステータスと安定した機械判定用コードを組み合わせて画面状態と遷移を決定する
2. If `VALIDATION_ERROR`とフィールドエラーを受信した, the Helpoクライアント shall 入力内容を保持し、該当項目へ利用者向け理由を関連付けて表示する。`fields`は`VALIDATION_ERROR`だけ、`retryAt`は`LOGIN_LOCKED`だけで受理し、それ以外のcodeでこれらを含む応答を契約不適合として扱う
3. If FAQ操作が`FAQ_QUESTION_CONFLICT`で拒否された, the Helpoクライアント shall 入力を保持し、同じ質問が登録済みであることを表示する
4. If 評価が`FEEDBACK_CONFLICT`で拒否された, the Helpoクライアント shall 再評価を許可せず、再取得した既存評価を表示する
5. If 対象操作が`NOT_FOUND`で拒否された, the Helpoクライアント shall 非公開対象の存在を推測せず、一覧へ戻るか再取得できる案内を表示する
6. If 要求が`ORIGIN_FORBIDDEN`、`UNSUPPORTED_MEDIA_TYPE`、または`NOT_ACCEPTABLE`で拒否された, the Helpoクライアント shall 操作が完了していないことと再読み込み可能な案内を表示する
7. If HTTP `INTERNAL_ERROR`/安全な5xx、またはSSE `AI_UNAVAILABLE`、`AI_TIMEOUT`、`GROUNDING_FAILED`、`PERSISTENCE_FAILED`、`INTERNAL_ERROR`を受信した, the Helpoクライアント shall 内部情報を表示せず、SSE codeごとの固定`retryable`値に限って再試行操作を表示する
8. If 未知の機械判定用コードまたは契約不適合の応答を受信した, the Helpoクライアント shall 成功として扱わず安全な一般エラーを表示する
9. While 状態変更要求を処理している, the Helpoクライアント shall 同一操作の重複送信を受け付けない

### Requirement 4: 質問ストリームの表示と中断
**Objective:** 認証済み社員として、質問回答の進行と確定結果を明確に確認したい。それにより、完了、回答不能、失敗、中断を混同しない。

#### Acceptance Criteria
1. When 1以上400 Unicode書記素の質問を送信した, the Helpoクライアント shall 回答処理中を表示し、同一質問の再送信を無効にする
2. While 質問が空白・改行だけである, the Helpoクライアント shall 送信操作を無効にして入力エラーを表示しない
3. When 質問が400書記素に達した, the Helpoクライアント shall 正式文言「質問は400文字以内で入力してください」を文字数カウンターへ関連付けて表示する
4. When 400書記素の質問へ追加入力された, the Helpoクライアント shall 401書記素目以降を入力へ反映しない
5. When `start`を最初に一回受信した, the Helpoクライアント shall 回答IDを内部の進行中結果へ関連付ける
6. While 0から連続する`chunk`を受信している, the Helpoクライアント shall UTF-8文字を欠落・重複させず順序どおり回答へ追記し、出典と評価を表示しない
7. When `complete`を一回受信した, the Helpoクライアント shall 完成回答へ置換し、重複のない使用FAQ質問を出典として表示し、未評価ならGood・Bad操作を有効にする
8. When `unanswerable`を一回受信した, the Helpoクライアント shall 受信した利用者向け案内を表示し、出典およびGood・Bad評価操作を表示しない
9. If `error`を受信した、終端前にストリームが不正終了した、またはイベント順序が契約に違反した, the Helpoクライアント shall 部分回答を確定結果として扱わず、出典と評価を表示せず、安全な失敗と再試行可否を表示する
10. When 利用者が進行中の回答を中断または画面離脱した, the Helpoクライアント shall 受信を中止し、以後のイベントを画面へ反映せず、その結果を履歴へ仮追加しない
11. The Helpoクライアント shall 一つの回答で最初の終端イベントだけを受理し、終端後のデータを成功状態へ反映しない

### Requirement 5: 履歴と保存結果の整合表示
**Objective:** 認証済み社員として、サーバーで確定した本人の結果だけを再確認したい。それにより、失敗や他社員の結果を履歴と誤認しない。

#### Acceptance Criteria
1. When 履歴画面を開いた, the Helpoクライアント shall 本人の履歴をサーバーから取得し、質問日時の新しい順で表示する
2. The Helpoクライアント shall 各履歴に質問日時、質問、完成回答または回答不能案内、使用FAQ、および存在する評価を表示する
3. If 本人の履歴が空である, the Helpoクライアント shall 「質問履歴はありません」と表示する
4. When `complete`または`unanswerable`の後に履歴を表示した, the Helpoクライアント shall サーバーから再取得した確定結果を表示する
5. If 回答がエラー、終端前の中断、または切断で終了した, the Helpoクライアント shall その部分結果を履歴へ追加しない
6. The Helpoクライアント shall 一般社員と管理者社員のいずれにも他社員の履歴を表示しない

### Requirement 6: FAQ閲覧と管理の接続
**Objective:** 社員としてFAQを閲覧し、管理者社員として登録・修正結果を確認したい。それにより、サーバーの確定FAQを5画面から利用できる。

#### Acceptance Criteria
1. When 認証済み社員がFAQ閲覧画面を開いた, the Helpoクライアント shall サーバーから取得したFAQの質問と回答を表示する
2. If FAQ一覧が空である, the Helpoクライアント shall FAQがないことを表示する
3. While 管理者社員がFAQ閲覧画面を表示している, the Helpoクライアント shall 新規登録と各FAQの編集操作を表示し、一般社員には表示しない
4. When 管理者社員が有効な質問と回答でFAQ登録に成功した, the Helpoクライアント shall 「FAQを登録しました」を表示し、再取得した一覧へ新規FAQを反映する
5. When 管理者社員が変更済みまたは未変更の有効なFAQを保存した, the Helpoクライアント shall 「FAQを修正しました」を表示し、再取得した値を反映する
6. While FAQの質問または回答が空白・改行だけである, the Helpoクライアント shall 登録または保存操作を無効にする
7. When FAQの質問または回答が1000 Unicode書記素に達した後に追加入力された, the Helpoクライアント shall 1001書記素目以降を入力へ反映しない
8. The Helpoクライアント shall FAQ削除操作を表示または要求しない

### Requirement 7: 評価の接続
**Objective:** 質問者として、確定結果を一度だけ評価したい。それにより、選択結果をサーバーへ安全に記録できる。

#### Acceptance Criteria
1. While 回答が進行中または失敗状態である, the Helpoクライアント shall Good・Bad評価操作を有効にしない
2. When 未評価の完成回答（`complete` outcome）へGoodまたはBadの登録が成功した, the Helpoクライアント shall 選択値と「評価を受け付けました」を表示し、両操作を非活性にする。回答不能結果には評価操作を表示または送信しない
3. When 評価済み結果を履歴または質問画面へ表示した, the Helpoクライアント shall 保存済み評価を表示し、追加、変更、取消を許可しない
4. The Helpoクライアント shall 評価の集計または分析結果を表示しない

### Requirement 8: クライアント境界のセキュリティ
**Objective:** 社員と研修運営者として、秘密情報がブラウザへ露出しないことを期待する。それにより、安全な研修境界を維持できる。

#### Acceptance Criteria
1. The Helpoクライアント shall AI credential、AI model名、server-only設定をbrowser bundle、HTML、応答表示、ログ、文書、またはテストデータへ含めない
2. The Helpoクライアント shall セッション識別子をCookieの値として読み取り、複製、送信本文化、または表示しない
3. The Helpoクライアント shall 同一オリジンの相対APIだけを使用し、認証情報を第三者オリジンへ送らない
4. If サーバーが認証、認可、所有者、重複、評価回数、根拠、または同一オリジンを拒否した, the Helpoクライアント shall その判定を迂回またはクライアント側の成功状態で上書きしない
5. The Helpoクライアント shall password、質問、回答、FAQ本文、エラー応答本文を通常のクライアントログへ記録しない

### Requirement 9: 決定的な統合・E2E検証と旧計画移管
**Objective:** 研修開発者として、実サーバー境界を利用する主要画面導線を再現可能に検証したい。それにより、旧タスク6・7の画面受入条件を失わず移行できる。

#### Acceptance Criteria
1. The Helpoクライアント shall 外部AIを実呼び出しせず、完成、0チャンク完成、回答不能、ストリームエラー、途中切断、中断、保存失敗を決定的に検証可能にする
2. The Helpoクライアント shall 有効・無効・ロック中ログイン、ログアウト、未認証、期限切れ、一般社員の権限拒否を実HTTP境界で検証可能にする
3. The Helpoクライアント shall 質問の0・1・400・401書記素とFAQ各項目の0・1・1000・1001書記素を画面から検証可能にする
4. The Helpoクライアント shall 一般社員の質問、逐次回答、出典、評価、本人履歴、FAQ閲覧の画面横断導線をブラウザで検証可能にする
5. The Helpoクライアント shall 管理者社員のFAQ登録、未変更を含む修正、完全一致競合、再取得、後続質問への反映をブラウザで検証可能にする
6. The Helpoクライアント shall 完了・回答不能だけが再取得後の履歴に現れ、エラー・保存失敗・commit前切断・利用者中断は現れないことを検証可能にする
7. The Helpoクライアント shall Cookie値、password、AI credential、AI model、質問、回答、FAQ本文がテスト成果物または通常ログへ記録されないことを検証可能にする
8. The Helpoクライアント shall 旧タスク6の画面横断統合と旧タスク7のブラウザ統合・E2E受入条件を本仕様の検証へ対応付ける
