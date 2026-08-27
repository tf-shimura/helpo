# Project Structure

更新日: 2026-08-27

## Organization Philosophy

レイヤー分離を伴うドメイン別構成を採用する。機能固有の業務ルールをapplication領域へ集約し、presentation、永続化、外部サービスから独立させる。ファイル一覧ではなく、責務と依存方向を構造の基準とする。

## Directory Patterns

### Presentation
**Location**: `src/app/`, `src/components/`  
**Purpose**: 画面、HTTP境界、入力表示、画面状態、レスポンス変換を担当する。  
**Rule**: 認証状態遷移、重複判定、所有者判定などの業務ルールを置かない。

### Domain Types
**Location**: `src/domain/<domain>/`  
**Purpose**: 認証、質問回答、FAQ、履歴、評価の型と不変条件を表す。  
**Rule**: framework、ORM、外部SDKへ依存しない。

### Application Services
**Location**: `src/application/<domain>/`  
**Purpose**: ユースケース、認可、状態遷移、transaction境界を調停する。  
**Rule**: presentationから入力を受け、repositoryまたは明示的portを利用する。

### Infrastructure
**Location**: `src/infrastructure/`  
**Purpose**: DB、外部AI、ログなどの技術依存を実装する。  
**Rule**: 業務ルールを再定義せず、application契約を実現する。

### Shared
**Location**: `src/shared/`  
**Purpose**: `Result`、Clock、共通validation、security utilityなど複数ドメインで意味が同一の要素を置く。  
**Rule**: 仮想的な再利用のための汎用repositoryや巨大utilityを作らない。

### Tests
**Location**: `tests/unit/`, `tests/integration/`, `tests/e2e/`  
**Purpose**: 業務ルール、境界統合、利用者導線をレベル別に検証する。

## Naming Conventions

- **Files**: kebab-case。責務を表す接尾辞を使用する（`*-service.ts`, `*-repository.ts`）。
- **React Components**: PascalCaseのnamed export。
- **Types and Interfaces**: PascalCase。入力は`*Input`、出力は`*Result`または業務名を使用する。
- **Functions and Variables**: camelCase。booleanは`is`, `has`, `can`で始める。
- **Constants**: 実行時固定値はUPPER_SNAKE_CASE。
- **Route Paths**: 小文字の複数名詞を基本とし、管理機能は`admin`境界下に置く。

## Import Organization

```typescript
import type { Faq } from '@/domain/faq/types'
import { createFaq } from '@/application/faq/faq-service'
import { prisma } from '@/infrastructure/db/prisma'
import { LocalView } from './local-view'
```

- `@/`は`src/`へ対応する。
- 型importを明示する。
- レイヤーをまたぐ相対importを避け、同一ディレクトリ内だけ相対importを許可する。
- presentationからORMや外部AI SDKを直接importしない。
- domainとapplicationからpresentationをimportしない。

## Code Organization Principles

- 一つのファイルは一つの主要責務を持つ。
- APIとUIは共通するapplication serviceを利用し、業務規則を二重実装しない。
- repositoryはドメイン固有契約とし、汎用CRUD基底クラスを作らない。
- 外部AI、Clockなど障害再現や交換が必要な依存だけをport化する。
- エラーは判別共用体で表し、presentation境界で利用者向け表示へ変換する。
- Server Componentやmiddlewareだけを認可境界とみなさず、データアクセス直前にも認可する。
