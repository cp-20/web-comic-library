---
id: 004
title: PostgreSQL migrationとjob基盤を作る
type: platform
status: done
priority: P0
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: [003]
umbrella: 001
---

# PostgreSQL migrationとjob基盤を作る

## 目的

各機能が同じtransaction、migration、非同期jobの仕組みを再実装せずに使えるようにする。

## スコープ

- Drizzleの接続設定とSQL migration runner。
- applicationが宣言するtransaction portとDB adapter。
- Graphile Workerの起動、queue、job payload検証。
- transaction内で業務状態とoutbox eventを保存する仕組み。
- 冪等性keyによるjobとeventの重複防止。
- local test用PostgreSQLの起動方法。

## 実装方針

- migrationは前進方向だけを作り、APIとworkerの前に一度だけ実行する。
- domainとapplicationへDrizzle型を公開しない。
- application use caseがtransaction境界を決める。
- 外部HTTP、Push、メールはcommit後にworkerが処理する。
- job payloadは`packages/contracts`のValibot schemaで検証する。

## 受け入れ条件

- 空のPostgreSQLへ全migrationを適用できる。
- 同じmigrationを再実行してもschemaが壊れない。
- transaction失敗時に業務状態とoutbox eventが両方rollbackされる。
- 同じ冪等性keyのjobまたはeventを二重登録しない。
- 不正なjob payloadを実行せず失敗として記録する。

## テスト

- 実PostgreSQLを使ったmigrationとtransactionの統合テスト。
- worker停止中にjobを蓄積し、再起動後に一度だけ処理するテスト。

## 対象外

- 個別業務テーブル。
- 通知adapterの実送信。
