---
id: 042
title: カドコミのお気に入りextractorを作る
type: feature
status: open
priority: P1
depends_on: [009, 013, 039]
umbrella: 037
---

# カドコミのお気に入りextractorを作る

## 目的

カドコミのlogin済み利用者に表示されるお気に入り作品をimport候補へ変換する。

## 背景

公開作品pageの埋め込みJSONと、お気に入りpageの利用者固有dataは別の入力として扱う。

## スコープ

- カドコミのお気に入りpageを識別するURL規則。
- WXT runtime content scriptとextractor。
- `work.code`またはcanonical作品URLと表示titleの抽出。
- paginationまたは追加読込済みDOMの走査。
- 年齢区分とcatalog公開可否の照合。
- 個人情報を除去した最小HTML fixture。

## 実装方針

- カドコミhostの権限を利用者の操作時にだけ要求する。
- お気に入りpageに表示された作品linkと公開DOMだけを読む。
- page内部の非公開APIとaccount storageを読まない。
- hash付きCSS classを主要selectorにせず、作品URLとstable attributeを優先する。
- R18、年齢確認必須、年齢区分未確認の作品を自動importせず除外理由を表示する。
- selector不一致や急減を0件として送信しない。

## 受け入れ条件

- fixtureからwork code、canonical URL、titleを抽出できる。
- 重複表示された作品を一件へまとめる。
- 除外対象をlibraryへ反映せず、利用者へ件数と理由を示す。
- 未許可host、別page、構造変更時にpayloadを送らない。
- raw HTML、account情報、年齢確認pageの内容をbackendへ送らない。

## テスト

- 正常、空、pagination、年齢区分、構造変更のfixture test。
- local fixture pageを使ったWXT browser E2E。
- 抽出payloadとnetwork request先のprivacy検査。

## 対象外

- 年齢確認の自動通過。
- 公開作品page connectorの置き換え。
