---
id: 041
title: ニコニコ漫画のお気に入りextractorを作る
type: feature
status: open
priority: P1
depends_on: [009, 012, 039, 057]
umbrella: 037
---

# ニコニコ漫画のお気に入りextractorを作る

## 目的

ニコニコ漫画のlogin済み利用者に表示されるお気に入りseriesをimport候補へ変換する。

## 背景

お気に入りpageは利用者固有dataを含むため、server crawlerではなく利用者端末上のextensionだけで処理する。

## スコープ

- ニコニコ漫画のお気に入りpageを識別するURL規則。
- WXT runtime content scriptとextractor。
- `/comic/{id}`、canonical URL、表示titleの抽出。
- 公式、ユーザー投稿、種別不明のcatalog照合。
- paginationまたは追加読込済みDOMの走査。
- 個人情報を除去した最小HTML fixture。

## 実装方針

- `manga.nicovideo.jp`の権限を利用者の操作時にだけ要求する。
- pageに表示された作品linkを読み、account情報と閲覧履歴を読まない。
- 非公開内部API、viewer、認証endpointを呼ばない。
- `/comic/{id}`以外の単発画像、watch URL、広告linkを候補にしない。
- page取得が必要な場合は同一originの公式paginationだけを低速で辿る。
- selector不一致を0件として送信しない。

## 受け入れ条件

- fixtureからseries ID、canonical URL、titleを抽出できる。
- 公式とユーザー投稿のどちらも同じcandidate contractへ変換できる。
- 重複表示されたseriesを一件へまとめる。
- 未許可host、別page、構造変更時にpayloadを送らない。
- raw HTMLとaccount固有fieldをbackendへ送らない。

## テスト

- 公式、ユーザー投稿、空、pagination、構造変更のfixture test。
- local fixture pageを使ったWXT browser E2E。
- 抽出payloadとnetwork request先のprivacy検査。

## 対象外

- viewerの読了位置。
- 限定公開と年齢制限付き作品の回避。
