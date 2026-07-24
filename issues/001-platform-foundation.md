---
id: 001
title: 実行基盤を公開ベータ対応にする
type: umbrella
status: open
priority: P0
depends_on: []
---

# 実行基盤を公開ベータ対応にする

## 目的

Bun monorepoを継続的に検証し、Asterionへ安全に配備して復旧できる状態にする。

## 子issue

- [002 品質検査とCI](./002-quality-ci.md)
- [003 Bun互換性スパイク](./003-bun-runtime-spike.md)
- [004 DBとjob基盤](./004-database-job-foundation.md)
- [005 Asterionへの配備](./005-asterion-deployment.md)
- [006 バックアップと監視](./006-backup-observability.md)
- [043 運用baselineと定期drill](./043-operational-baseline-drills.md)
- [044 PostgreSQL collation更新](./044-postgresql-collation-refresh.md)
- [045 database同期Jobの接続待機](./045-database-hook-readiness.md)

## 完了条件

- 全子issueが`done`である。
- Web、API、worker、migrationを独立して配備できる。
- PostgreSQLをクラスタ外のバックアップから復元できる。
- 通常月の追加インフラ費を1,000円以内に保てる。

## 対象外

- 複数ノード化。
- Redisと専用検索エンジン。
- 恒常的な外部VPS運用。
