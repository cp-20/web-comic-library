---
id: 071
title: お気に入り画面fixtureの取得・承認を追跡する
type: umbrella
status: blocked
priority: P0
execution: tracking
review_required: true
review_status: pending
reviewed_at: null
depends_on: [057]
umbrella: 037
---

# お気に入り画面fixtureの取得・承認を追跡する

## 目的

loginが必要なお気に入り画面のfixtureをsiteごとに独立して取得・匿名化・承認し、未提供siteをstatusで
識別できるようにする。

## 子issue

- [087 少年ジャンプ＋fixture](./087-shonen-jump-plus-favorite-fixture.md)
- [088 コミックDAYS fixture](./088-comic-days-favorite-fixture.md)
- [089 となりのヤングジャンプfixture](./089-tonari-young-jump-favorite-fixture.md)
- [090 ニコニコ漫画fixture](./090-niconico-favorite-fixture.md)
- [091 カドコミfixture](./091-kadocomi-favorite-fixture.md)

## 完了条件

- 全子issueが`done`である。
- raw DOM、credential、個人情報、漫画本文、画像、tracking属性がGit historyにない。

## 対象外

- sanitizerとextractorの実装、credential共有、remote browser操作。

## Blocker

2026-07-28時点で#057と全子issueが未完了である。

## 解除条件

#057と全子issueが`done`であること。

## 解除後の着手点

全manifestとreview reportのhashを照合し、このumbrellaを`done`へ進める。

## 禁止する代替

未取得siteをsynthetic fixtureで完了扱いする、複数siteを一つのstatusで承認する方法を禁止する。
