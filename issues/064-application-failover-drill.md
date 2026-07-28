---
id: 064
title: applicationと一時VPSの復旧drillを追跡する
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

# applicationと一時VPSの復旧drillを追跡する

## 目的

初期リリース後にKubernetes上の単一Pod自己回復とfresh VPSへの退避復旧を別々に実施し、各経路の
statusを追跡する。このissueは初期リリースを阻害しない。

## 子issue

- [085 application Pod failover](./085-application-pod-failover-drill.md)
- [086 fresh VPS restore](./086-fresh-vps-restore-drill.md)

## 完了条件

- 全子issueが同じ候補SHAを対象に実施され、`done`である。
- cleanup後に一時VPS、hostname route、Secret、volumeが残っていない。

## 対象外

- production DNS切替、複数Pod同時停止、code・manifest・runbookの修正。

## Blocker

2026-07-28時点で#085と#086が未完了である。

## 解除条件

#085と#086が`done`であること。

## 解除後の着手点

両reportの候補SHA、image digest、cleanupを照合し、このumbrellaを`done`へ進める。

## 禁止する代替

Pod failoverだけでVPS復旧を省略する、既存VPSへ上書きして復旧扱いする方法を禁止する。
