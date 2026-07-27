---
id: 037
title: 漫画siteのお気に入りを取り込むbrowser extensionを提供する
type: umbrella
status: open
priority: P1
depends_on: []
umbrella: 019
---

# 漫画siteのお気に入りを取り込むbrowser extensionを提供する

## 目的

利用者が各漫画siteで登録済みのお気に入り作品を、browser履歴を使わず読書libraryへ一括で取り込めるようにする。

## 子issue

- [038 WXT基盤とaccount連携](./038-wxt-extension-foundation.md)
- [039 お気に入りimport workflow](./039-favorites-import-workflow.md)
- [040 共通feed型3サイトのextractor](./040-common-feed-favorites-extractors.md)
- [041 ニコニコ漫画のextractor](./041-niconico-favorites-extractor.md)
- [042 カドコミのextractor](./042-kadocomi-favorites-extractor.md)
- [055 extension Web origin権限とE2E](./055-extension-web-origin-e2e.md)
- [056 extension source key解決](./056-extension-source-resolution.md)
- [057 匿名化お気に入りfixture](./057-sanitized-favorite-fixtures.md)

## 完了条件

- 全子issueが`done`である。
- 利用者がsite単位で権限を許可し、表示中のお気に入り一覧を取り込める。
- お気に入りを読書済みと推測せず、確認後にlibraryへ反映する。
- extensionがbrowser履歴、bookmark、Cookieを読む権限を要求しない。

## 対象外

- 読書管理serviceからのdata移行。
- お気に入り解除の自動同期。
- manga viewer上の読了位置監視。
