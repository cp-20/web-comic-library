---
id: 045
title: database依存の同期Jobに接続待機を追加する
type: quality
status: done
priority: P3
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: [006]
umbrella: 001
---

# database依存の同期Jobに接続待機を追加する

## 目的

PostgreSQL rolloutと同時に起動する同期Jobが、一時的なDNS未解決や接続拒否を通常の失敗として記録しないようにする。

## 背景

#006の本番rolloutでは、PostgreSQL PodがReadyになる前に`initialize-database` Jobが起動した。

Jobは既定のbackoffで最終的に成功したが、三つのError Podを残し、不要な監視alertを発生させる状態だった。

## スコープ

- `initialize-database`とmigration Jobのdatabase接続前提を整理する。
- PostgreSQLのDNS解決と接続受付を上限時間付きで待機する。
- timeout時に原因が分かる短いerrorを出す。
- rollout中の一時的な待機を失敗回数へ含めない。

## 実装方針

- shellの無制限retryを使わない。
- PostgreSQL clientの`pg_isready`を利用する。
- 待機時間と間隔をmanifestで明示する。
- Argo CD hookの削除policyとbackoffを併せて確認する。

## 受け入れ条件

- PostgreSQL停止中に同期を開始しても、Jobは接続可能になるまで待機する。
- PostgreSQL復旧後に同じJobが成功する。
- 待機中にError Podを生成しない。
- timeout時はJobが失敗し、原因と待機時間をlogで確認できる。

## テスト

- PostgreSQL rolloutと同期Jobの同時実行。
- DNS未解決、接続拒否、認証失敗の切り分け。
- 最大待機時間超過。

## 対象外

- PostgreSQLの高可用性構成。
- Job全体の共通workflow engine化。
