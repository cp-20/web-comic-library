---
id: 007
title: 作品カタログと更新収集を提供する
type: umbrella
status: open
priority: P0
depends_on: []
---

# 作品カタログと更新収集を提供する

## 目的

複数サイトの作品と話を重複させずに収集し、検索、閲覧、運営修正を可能にする。

## 子issue

- [008 カタログmodelとstorage](./008-catalog-model-storage.md)
- [009 取得元policy](./009-source-policy.md)
- [010 connector HTTP基盤](./010-connector-http-core.md)
- [011 共通feed connector](./011-common-feed-connectors.md)
- [012 ニコニコ漫画connector](./012-niconico-connector.md)
- [013 カドコミconnector](./013-kadocomi-connector.md)
- [014 取込、重複判定、release event](./014-ingestion-dedup-release.md)
- [015 カタログ管理画面](./015-catalog-admin.md)
- [016 書誌情報](./016-bibliography.md)
- [017 検索と作品ページ](./017-catalog-search-web.md)
- [018 10サイト対応とbackfill](./018-source-expansion-backfill.md)
- [049 作品概要と公開metadata](./049-work-synopsis-public-metadata.md)

## 完了条件

- 全子issueが`done`である。
- 利用条件を確認した10サイトの作品を検索できる。
- 同じ内容の複数掲載と分割掲載を管理できる。
- ニコニコ漫画の活動中ユーザー投稿作品を収録できる。

## 対象外

- 漫画本文と漫画ページ画像の配信。
- 機械学習による自動統合。
