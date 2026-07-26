---
id: 017
title: 作品検索と作品ページを提供する
type: feature
status: done
priority: P0
depends_on: [008, 021]
umbrella: 007
---

# 作品検索と作品ページを提供する

## 目的

利用者が作品を見つけ、作者、掲載先、話、単行本、公開活動を一つの作品ページで確認できるようにする。

## スコープ

- 作品名、別名、読み仮名、作者名の検索。
- 掲載先、連載状態、公式、ユーザー投稿の絞り込み。
- 最近更新、人気、新着の一覧query。
- 作品詳細のHono RPC route。
- Next.jsの検索画面と安定した作品URL。
- 公開閲覧ページへの外部link。

## 実装方針

- 検索文字列をUnicode NFKCで正規化する。
- PostgreSQLの`pg_trgm`と前方一致を使う。
- 短い日本語titleは完全一致、前方一致、部分一致の順に優先する。
- 人気は直近30日間に`LibraryEntry`へ追加された利用者数で順位付けし、利用者情報と件数は公開しない。
- WebはHono RPC clientだけを使い、DBとapplicationをimportしない。
- 公開作品ページはCDN cache可能なresponseとcanonical URLを持つ。
- R18、年齢確認必須、未確認、非公開dataをqueryで除外する。

## 受け入れ条件

- title、alias、読み仮名、作者名から作品を検索できる。
- 指定した絞り込みを組み合わせられる。
- 作品ページに作者、概要、連載状態、掲載先、Web話、単行本を表示する。
- 旧IDがある場合は正規URLへredirectする。
- 漫画本文を配信せず公式閲覧先へ遷移できる。

## テスト

- 日本語の表記揺れ、短いtitle、同名作品のsearch統合テスト。
- Hono RPC responseと公開範囲のテスト。
- mobile viewportで検索から作品表示までのE2E。

## 対象外

- 専用検索engine。
- 個人推薦。
