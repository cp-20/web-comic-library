---
id: 046
title: WAL-G physical backupのmemory上限を是正する
type: quality
status: open
priority: P0
depends_on: [006]
umbrella: 001
---

# WAL-G physical backupのmemory上限を是正する

## 目的

PostgreSQL clusterが成長しても、定期physical backupをOOMなしで完了できるresource設定にする。

## 背景

#044の作業前backupでは、512MiBを上限とするWAL-G Podが6個目のtar partを処理中に`OOMKilled`となった。

対象clusterは約7.2GiBで、同じJobの再試行も512MiBの上限を引き継ぐ。

## スコープ

- physical backup中のmemory使用量を計測する。
- WAL-Gの並列度とKubernetes memory request、limitを調整する。
- OOMした試行が残した未完了objectを確認して削除する。
- OOMしたJobを監視alertで検出できることを確認する。
- 変更後のbase backupをR2へ保存する。

## 実装方針

- 現在のdatabase規模で再現する一時Jobを使って上限を決める。
- memory limitだけを外さず、計測値に余裕を加えた上限をmanifestへ明示する。
- 圧縮方式と暗号化方式は変更しない。

## 受け入れ条件

- 約7.2GiBの現行clusterでphysical backupがOOMなしに完了する。
- backup Podのmemory最大値と設定値を運用記録へ残している。
- R2の`backup-list`で新しいbase backupを確認できる。
- 失敗したbackup JobをPrometheusが検出できる。

## テスト

- 定期CronJobと同じ定義から作成したone-off backup。
- Podの終了理由とmemory使用量。
- WAL-Gの`backup-list`。
- `BackupJobFailed` alert。

## 対象外

- backup保存先と暗号化keyの変更。
- PostgreSQL dataの削減。
