---
id: 026
title: Web Pushと最小PWAを実装する
type: feature
status: done
priority: P1
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: [020, 025]
umbrella: 024
---

# Web Pushと最小PWAを実装する

## 目的

許可した利用者へ即時Pushを送り、通知から対象作品または活動へ安全に遷移できるようにする。

## スコープ

- Web app manifest、icon、install可能なPWA設定。
- Push受信と通知clickだけを扱うService Worker。
- `PushSubscription`のtable、登録、更新、解除。
- `web-push` adapterとworker job。
- VAPID keyのSecret管理。
- Push許可と通知種別設定のUI。

## 実装方針

- browserの許可を操作前に要求せず、利用者の明示操作からrequestする。
- Push payloadへ非公開情報、ネタバレ本文、認証情報を含めない。
- subscription endpointは利用者とbrowser単位で一意にする。
- 404と410を返したsubscriptionを無効化する。
- 同じNotificationとsubscriptionへの送信を冪等性keyで一度にする。
- offline cacheとbackground syncは実装しない。

## 受け入れ条件

- 対応browserでPWAをhome画面へ追加できる。
- subscriptionを登録、更新、解除できる。
- Push clickで許可された安定URLへ遷移する。
- 無効subscriptionを次回送信対象から除外する。
- 送信失敗を再試行可能と恒久失敗へ分類する。

## テスト

- Push payload、冪等性key、失効判定の単体テスト。
- `web-push` adapterを差し替えたworker統合テスト。
- Service Worker登録と通知設定のbrowser E2E。

## 対象外

- 汎用offline閲覧。
- iOSとAndroidのnative application。
