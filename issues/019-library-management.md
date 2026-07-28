---
id: 019
title: アカウントと読書管理を提供する
type: umbrella
status: open
priority: P0
execution: tracking
review_required: true
review_status: approved
reviewed_at: 2026-07-28T10:52:40.929Z
depends_on: []
---

# アカウントと読書管理を提供する

## 目的

利用者がWeb話と単行本のどちらからでも、公開範囲を選んで読書状態と所蔵を管理できるようにする。

## 子issue

- [020 認証、profile、公開範囲](./020-identity-profile-privacy.md)
- [021 読書状態とWeb話の既読](./021-reading-state-web-progress.md)
- [022 掲載先優先順位とfollow方式](./022-source-preferences-follow-modes.md)
- [023 単行本の既読と所蔵](./023-volume-records-mapping.md)
- [037 漫画siteのお気に入りimport extension](./037-favorites-import-extension.md)
- [060 Google OAuth専用のloginへ移行する](./060-google-oauth-only-login.md)

## 完了条件

- 全子issueが`done`である。
- Web話だけ、単行本だけ、両方を読む利用者が記録を管理できる。
- 公開範囲を全表示経路で一貫して適用できる。
- 同じ内容の別掲載先へ確認済みの既読だけを反映できる。
- 漫画siteのお気に入りを確認付きで一括登録できる。

## 対象外

- 購入価格、購入店、貸出管理。
- 読書管理serviceからのdata移行。
