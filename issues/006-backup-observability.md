---
id: 006
title: バックアップ、監視、障害通知を整備する
type: platform
status: done
priority: P0
depends_on: [005]
umbrella: 001
---

# バックアップ、監視、障害通知を整備する

## 目的

単一nodeと家庭回線の障害を検知し、RPO 15分、RTO 4時間で復旧できるようにする。

## スコープ

- WAL-Gによる週次base backupと15分以内のWAL archive。
- Cloudflare R2への暗号化済み日次logical backupと30日保持。
- SentryによるWebとAPIの重大error通知。
- connector成功率、応答時間、job滞留、通知失敗、Pod再起動のmetrics。
- 家庭外からのWebとTunnel監視。
- Argo CD sync失敗、disk、PVC、node resourceのalert。
- 別PostgreSQLへの復元手順と一時VPSへの退避runbook。

## 実装方針

- local-path PVCだけをbackupとして扱わない。
- token、メール本文、Push鍵をlogとSentryへ送らない。
- connectorは3回連続失敗、jobは10分超の滞留で通知する。
- Prometheusでnodeとapplicationのmetricsを8日間保持する。

## 受け入れ条件

- 指定時点のPostgreSQLを別環境へ復元できる。
- 復元後のAPIとworkerが同じ主要件数を読み取れる。
- 外部監視がTunnel停止を検出する。
- AsterionのCPU、memory、disk、PVC、Pod再起動、Argo CD差分を確認できる。
- 復旧runbookだけを使い4時間以内に復旧できる。

## テスト

- 初回のrestore drill。
- Web、API、worker、cloudflaredを個別停止する障害試験。
- R2 credentialがない環境でbackup jobが安全に失敗する試験。

## 実施記録

2026年7月25日にAsterionとCloudflare R2を使って初回drillを実施した。

logical backup `logical/20260724T163639Z.dump.lz4`を暗号化して保存し、別databaseへ復元した。

physical backup `base_00000001000001520000003E`と必要なWALを暗号化して保存した。

本番と別のNamespace、32Gi PVC、PostgreSQLへLSN `152/3F000078`をtargetとして復元し、timeline 2へpromoteした。

成功したphysical restoreはbase backup選択からread/write受付まで3分42秒だった。

`drizzle_migrations=1`、`graphile_migrations=19`、`job_idempotency_keys=0`、`outbox_events=0`が本番、physical restore、logical restoreで一致した。

restore先のAPIはhealth check 200、workerはmetrics 200とdatabase接続を確認した。

Web、API、cloudflaredの停止は外部監視workflowがそれぞれ検出した。

worker停止ではPrometheusの`ScrapeTargetDown`がfiringになり、復旧後に解消した。

node、memory、disk、PVC、Pod restart、Argo CDのmetricをPrometheusから取得できた。

PIIを含まないcontrolled errorをSentryへ送信し、SDKのflush成功を確認した。

collation mismatchは#044へ、database同期Jobの接続待機は#045へ分離した。

## 対象外

- 99.5％を超えるSLA保証。
- 常時稼働する外部standby。
