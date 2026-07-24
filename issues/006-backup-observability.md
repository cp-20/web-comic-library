---
id: 006
title: バックアップ、監視、障害通知を整備する
type: platform
status: in_progress
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
- node memoryとdiskの実測値を一週間記録する。

## 受け入れ条件

- 指定時点のPostgreSQLを別環境へ復元できる。
- 復元後のAPIとworkerが同じ主要件数を読み取れる。
- 外部監視がTunnel停止を検出する。
- AsterionのCPU、memory、disk、PVC、Pod再起動、Argo CD差分を確認できる。
- 復旧runbookだけを使い4時間以内に復旧できる。

## テスト

- 月次のrestore drill。
- Web、API、worker、cloudflaredを個別停止する障害試験。
- R2 credentialがない環境でbackup jobが安全に失敗する試験。

## 対象外

- 99.5％を超えるSLA保証。
- 常時稼働する外部standby。
