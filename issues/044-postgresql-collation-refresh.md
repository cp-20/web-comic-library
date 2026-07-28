---
id: 044
title: PostgreSQLのcollation versionを更新する
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

# PostgreSQLのcollation versionを更新する

## 目的

OS更新後も文字列indexとsort順序の整合性を維持し、PostgreSQLのcollation version mismatch警告を解消する。

## 背景

本番databaseはglibc 2.36で作成されているが、現在のPostgreSQL imageはglibc 2.41を提供している。

PostgreSQLは接続時にversion mismatchを警告し、影響を受けるobjectの再構築とcollation metadataの更新を求めている。

## スコープ

- mismatchがあるdatabaseとcollation依存objectを特定する。
- 作業前にphysical backupとlogical backupを取得する。
- 影響を受けるindexを再構築する。
- 各databaseのcollation version metadataを更新する。
- APIとworkerの主要queryを確認する。

## 実装方針

- 本番databaseごとに`REINDEX DATABASE`を実行する。
- `ALTER DATABASE ... REFRESH COLLATION VERSION`は再構築後に実行する。
- maintenance中のlockと処理時間を事前に確認する。
- restore検証が済んでいないbackupだけを根拠に破壊的な操作をしない。

## 受け入れ条件

- mismatchがある全databaseを記録している。
- collation依存indexを新しいversionで再構築している。
- PostgreSQL接続時にversion mismatch警告が出ない。
- Web、API、workerが正常に動作する。
- 作業手順と所要時間を運用記録へ残している。

## テスト

- `pg_database`のcollation version比較。
- 主要な日本語titleの検索とsort。
- API health checkとworker job実行。
- backupからの復旧可能性確認。

## 実施記録

2026年7月25日にAsterionのPostgreSQL 16で更新した。

`postgres`、`template1`、`traqing`、`web_comic_library`の記録値は2.36、glibcの実値は2.41だった。

collation依存indexは`postgres`が36個と952KiB、`template1`が36個と936KiB、`traqing`が47個と365MiB、`web_comic_library`が42個と1,032KiBだった。

作業前にWCLのlogical backupと、復元試験済みの経路によるcluster全体のphysical backup `base_000000010000015200000046`をR2で確認した。

`REINDEX DATABASE`とmetadata更新は`postgres`、`template1`、`web_comic_library`が各1秒以下、`traqing`が約9分27秒だった。

更新後は四つのdatabaseで記録値と実値が2.41で一致し、invalid indexは0個だった。

一時tableとB-tree indexを使った日本語titleの完全一致検索はIndex Only Scanとなり、prefix検索とsortも成功した。

公開WebとAPIは200を返し、production workerはprobe jobを1件処理した。

更新後の接続ではversion mismatch警告がなく、WAL archiveの最終成功時刻も更新された。

作業前physical backupの512MiB Podが`OOMKilled`となった問題は#046へ分離した。

## 対象外

- PostgreSQL major version upgrade。
- ICU collationへの全面移行。
