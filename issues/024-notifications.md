---
id: 024
title: 更新をアプリ内、Push、メールで通知する
type: umbrella
status: done
priority: P0
execution: tracking
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: []
---

# 更新をアプリ内、Push、メールで通知する

## 目的

利用者が選んだ作品と掲載先の更新を、重複させず希望した経路へ届ける。

## 子issue

- [025 アプリ内通知](./025-in-app-notifications.md)
- [026 Web PushとPWA](./026-web-push-pwa.md)
- [027 メールdigest](./027-email-digest.md)

## 完了条件

- 全子issueが`done`である。
- 同じeventを再処理しても同じ経路へ二重送信しない。
- 更新検出後5分以内に95％のWeb Pushを送信できる。
- 利用者が通知種別と経路を停止できる。

## 対象外

- mobile native Push。
- SMS通知。
