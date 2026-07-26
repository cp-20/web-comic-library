---
id: 018
title: 許可済み10サイトとニコニコ漫画backfillへ拡張する
type: umbrella
status: blocked
priority: P2
depends_on: [009, 010, 011, 012, 013, 014]
umbrella: 007
---

# 許可済み10サイトとニコニコ漫画backfillへ拡張する

## 目的

公開ベータ時に利用条件を確認した10サイトと、活動中のニコニコ漫画ユーザー投稿作品を収録する。

## 子issue

- [050 ヤンマガWeb connector](./050-yanmaga-web-connector.md)
- [051 サンデーうぇぶり connector](./051-sunday-webry-connector.md)
- [052 マガポケ connector](./052-magapoke-connector.md)
- [053 ガンガンONLINE connector](./053-gangan-online-connector.md)
- [054 アルファポリス connector](./054-alphapolis-connector.md)

## 完了条件

- 全子issueが`done`である。
- policyが許可された10サイトを定期巡回できる。
- 活動中のニコニコ漫画ユーザー投稿作品を検索できる。
- backfill停止後にcheckpointから再開できる。
- 通常巡回の95％を公開から30分以内に検出する。

## 共通方針

- API、feed、公開一覧HTML、公開作品HTML、埋め込みJSONの順に選ぶ。
- browserが必要な候補は自動対応せず、別の公式手段か代替siteを選ぶ。
- siteごとのpolicy、connector、fixture、metricsを同じ子issueへ含める。
- backfillは通知を生成せず、通常巡回を常に優先する。

## 対象外

- 公開前の全過去作品取込完了。
- 認証またはアクセス制限の回避。

## Blocker

全子issue（#050〜#054）が、公式利用規約による自動収集の禁止または明示許可の不在により`blocked`である。公式の許可済み取得手段または書面による許可が得られるまで、対象サイトをconnectorへ追加しない。
