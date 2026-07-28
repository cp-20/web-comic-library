---
id: 018
title: 許可済み10サイトとニコニコ漫画backfillへ拡張する
type: umbrella
status: blocked
priority: P2
execution: tracking
review_required: true
review_status: pending
reviewed_at: null
depends_on: [009, 010, 011, 012, 013, 014, 061]
umbrella: 007
---

# 許可済み10サイトとニコニコ漫画backfillへ拡張する

## 目的

公開ベータ時に利用条件を確認した10サイトと、活動中のニコニコ漫画ユーザー投稿作品を収録する。

## 子issue

- [066 ヤンマガWeb permission](./066-yanmaga-permission-decision.md)
- [050 ヤンマガWeb connector](./050-yanmaga-web-connector.md)
- [067 サンデーうぇぶり permission](./067-sunday-webry-permission-decision.md)
- [051 サンデーうぇぶり connector](./051-sunday-webry-connector.md)
- [068 マガポケ permission](./068-magapoke-permission-decision.md)
- [052 マガポケ connector](./052-magapoke-connector.md)
- [069 ガンガンONLINE permission](./069-gangan-online-permission-decision.md)
- [053 ガンガンONLINE connector](./053-gangan-online-connector.md)
- [070 アルファポリス permission](./070-alphapolis-permission-decision.md)
- [054 アルファポリス connector](./054-alphapolis-connector.md)

## 完了条件

- 全子issueが`done`である。
- policyが許可された10サイトを定期巡回できる。
- 活動中のニコニコ漫画ユーザー投稿作品を検索できる。
- backfill停止後にcheckpointから再開できる。
- 通常巡回の95％を公開から30分以内に検出する。

## 共通方針

- 権利者が保存・再公開を文書で許可した、認証不要の公式JSON metadata APIだけを追加する。
- HTML、browser操作、内部API、mobile app解析が必要な候補は実装せず、許可済みの別siteへ差し替える。
- siteごとのpolicy、connector、fixture、metricsを同じ子issueへ含める。
- backfillは通知を生成せず、通常巡回を常に優先する。

## 対象外

- 公開前の全過去作品取込完了。
- 認証またはアクセス制限の回避。

## Blocker

#066〜#070のpermissionは承認済みだが、#050〜#054のconnectorと、それらをproduction巡回する#061が
未完了であるため、10siteのbackfillを開始できない。

## 解除条件

#061と#050〜#054が`done`になり、許可された10siteをproduction巡回できること。または、
許可されなかったsiteを許可済みsiteの新しいpermission/connector issueへ差し替えること。

## 解除後の着手点

解除条件を先に満たした子issue一件のsource policy evidenceとAPI schemaを実装し、#061のregistryへ
追加する。

## 禁止する代替

robots.txtだけを許可根拠にする、HTML/browser/internal APIを解析する、10 siteという件数のために
未許可sourceを追加する方法は採用しない。
