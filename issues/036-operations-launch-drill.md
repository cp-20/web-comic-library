---
id: 036
title: 運用試験を完了して一般公開する
type: quality
status: open
priority: P1
depends_on: [006, 018, 025, 027, 031, 034, 035]
umbrella: 033
---

# 運用試験を完了して一般公開する

## 目的

障害、backfill、通知、復元を本番相当条件で試験し、招待制betaの結果から一般公開を判断する。

## スコープ

- connector連続失敗の自動停止と通知。
- worker停止中に蓄積したjobの再開。
- 通常巡回を優先したbackfill。
- PostgreSQLのpoint-in-time restore。
- Web、API、worker、cloudflaredのPod障害試験。
- Asterion停止時のR2から一時VPSへの復旧演習。
- 招待制beta、feedback受付、公開判定記録。
- resource容量と追加費用の確認。

## 公開条件

- 許可済み10サイトとニコニコ漫画の活動中ユーザー投稿作品を収録している。
- Web話と単行本の読書管理、三経路の通知、公開範囲、ネタバレ、block、通報が動作する。
- 作品、話、分割掲載の統合と分割を管理画面から行える。
- restoreを一度完了している。
- Asterionに2GiB以上のmemoryと1 core相当のCPU余力がある。
- PostgreSQL PVCとnode diskの使用率が70％未満である。
- 家庭外監視と障害通知が動作する。
- Argo CDとAdminerがCloudflare Accessで保護されるか、外部経路がない。
- 通常月の追加インフラ費が1,000円以内である。

## 実装方針

- 試験ごとに手順、開始状態、観測結果、復旧時間を記録する。
- 失敗した条件を緩和して公開せず、修正issueを作って再試験する。
- 月間稼働率99.5％はSLOとし、SLAとして表示しない。
- 全過去のニコニコ漫画backfill完了を公開条件にしない。

## 受け入れ条件

- worker再開後にjobを重複処理しない。
- connector構造変更時に既存dataを削除しない。
- point-in-time restore後にAPIとworkerを4時間以内に再接続できる。
- Pod単位の停止からKubernetesまたはArgo CDが復旧させる。
- 招待制betaの重大不具合を解消し、公開条件の証跡をrelease記録へ残す。

## テスト

- backup restore、Pod停止、Tunnel停止、worker backlog、backfill負荷の運用試験。
- 公開beta相当負荷での24時間soak test。
- 外部監視からのalert到達確認。

## 対象外

- ニコニコ漫画の全過去作品取込完了。
- 収益化機能。
