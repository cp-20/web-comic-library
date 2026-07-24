---
id: 043
title: 運用baselineと定期drillを検証する
type: quality
status: open
priority: P0
depends_on: [006]
umbrella: 001
---

# 運用baselineと定期drillを検証する

## 目的

実測値と継続的な復旧訓練によって、#006で設定したalert閾値と4時間のRTOを検証する。

## 背景

一週間の実測と月次作業は、監視とbackup基盤を実装するpull requestの完了時点では評価できない。

初回観測期間と月次restore drillを独立して記録し、運用規則へ反映する。

## スコープ

- nodeのCPU、memory、disk、PVC使用量を一週間記録する。
- 平常時の範囲とalert閾値を比較する。
- 指定時点へ復旧する月次restore drillを一回実施する。
- drillの開始時刻、終了時刻、主要件数、発生した問題を記録する。
- 次回以降の月次作業をissue templateまたはcalendarへ登録する。

## 実装方針

- Prometheusの8日保持dataを使う。
- 復旧先は本番と別のNamespace、PVC、PostgreSQLにする。
- 本番PVCをrestore先へmountしない。
- alert閾値を変更する場合は実測値と変更理由を残す。

## 受け入れ条件

- 連続した七日間のCPU、memory、disk、PVC dataを確認できる。
- alert閾値が実測値に対して妥当かを判定している。
- 指定時点のPostgreSQLを別環境へ復旧できる。
- APIとworkerが復旧前と同じ主要件数を読み取れる。
- restore開始からサービス確認まで4時間以内である。
- 次回の月次drillが登録されている。

## テスト

- Tunnel停止とPod停止のalert発火、Discord通知、解消通知。
- 指定時点へのphysical restore。
- logical backupからの独立したrestore。
- runbookだけを参照した一時VPSへの退避手順の机上確認。

## 対象外

- 常時稼働する外部standby。
- 複数node化。
- 99.5％を超えるSLA保証。
