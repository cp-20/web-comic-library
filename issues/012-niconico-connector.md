---
id: 012
title: ニコニコ漫画の公式作品とユーザー投稿作品を収集する
type: feature
status: done
priority: P0
depends_on: [010]
umbrella: 007
---

# ニコニコ漫画の公式作品とユーザー投稿作品を収集する

## 目的

ニコニコ漫画の更新作品を低負荷で検出し、公式、ユーザー投稿、種別不明を区別して収集する。

## スコープ

- 更新順一覧の差分巡回。
- 作成順一覧を使う初回backfill。
- 作品ページから公開話と公開状態を取得する処理。
- 公式channelへのbreadcrumbによる種別判定。
- 活動中、長期休載、完結に応じた再確認間隔。
- 一覧のpage番号、最終作品ID、透かし位置のcheckpoint。

## 抽出規則

- `li.mg_item.item`から作品link、`.mg_author`、`.date.updated`、`.serial_status`を読む。
- `li.episode_item`ごとに`div.description div.title a`と`.status`を読む。
- `/comic/{id}`と`/watch/{id}`のIDを外部keyにする。
- 公式判定の根拠がない場合はユーザー投稿と推測せず種別不明にする。

## 実装方針

- 通常巡回は更新順の先頭から前回の透かし位置まで走査する。
- backfillは通常巡回より低いqueueで実行する。
- 直近90日更新、一覧またはranking掲載、残りの公開作品の順に取り込む。
- 削除済み、限定公開、年齢制限付き、漫画seriesでない単発画像を除外する。
- 認証やアクセス制限を回避しない。

## 受け入れ条件

- 更新一覧で透かし位置まで走査し、変更作品だけを詳細取得対象にする。
- 公式、ユーザー投稿、種別不明を根拠付きで返す。
- 45話以上のfixtureを一回の作品取得から欠落なく解析できる。
- checkpoint再開時に作品と話を重複させない。
- backfill中も通常巡回を先に処理する。

## テスト

- 一覧の複数page、透かし一致、透かし消失のfixture test。
- 公式breadcrumbあり、なし、構造変更のfixture test。
- backfill停止と再開の統合テスト。

## 対象外

- ログイン限定作品。
- 全過去作品の公開前取り込み完了。
