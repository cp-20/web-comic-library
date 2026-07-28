---
id: 063
title: workerとconnectorの復旧drillを追跡する
type: umbrella
status: blocked
priority: P3
execution: tracking
review_required: true
review_status: pending
reviewed_at: null
depends_on: []
umbrella: 043
---

# workerとconnectorの復旧drillを追跡する

## 目的

初期リリース後にconnector停止・再開とworker停止・再開を別々に実施し、未確認のcomponentを独立した
statusで識別する。このissueは初期リリースを阻害しない。

## 子issue

- [083 connector停止・再開drill](./083-connector-recovery-drill.md)
- [084 worker停止・再開drill](./084-worker-recovery-drill.md)

## 完了条件

- 全子issueが同じ候補SHAを対象に実施され、`done`である。
- catalog、checkpoint、job、通知に説明できない重複や欠落がない。

## 対象外

- PostgreSQL restore、Pod failover、長時間負荷、発見した欠陥の修正。

## Blocker

2026-07-28時点で#083と#084が未完了である。

## 解除条件

#083と#084が`done`であること。

## 解除後の着手点

両reportの候補SHAとcleanup結果を照合し、このumbrellaを`done`へ進める。

## 禁止する代替

connectorとworkerを同時停止する、一方の結果でもう一方を完了扱いする方法を禁止する。
