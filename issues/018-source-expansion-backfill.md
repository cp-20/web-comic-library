---
id: 018
title: 許可済み10サイトとニコニコ漫画backfillへ拡張する
type: feature
status: open
priority: P2
depends_on: [009, 010, 011, 012, 013, 014]
umbrella: 007
---

# 許可済み10サイトとニコニコ漫画backfillへ拡張する

## 目的

公開ベータ時に利用条件を確認した10サイトと、活動中のニコニコ漫画ユーザー投稿作品を収録する。

## 対象候補

優先候補はヤンマガWeb、サンデーうぇぶり、マガポケ、ガンガンONLINE、アルファポリスとする。

自動取得できない候補はwebアクション、MAGCOMI、くらげバンチ、チャンピオンクロス、ヤンチャンWebの順で置き換える。

## スコープ

- 各候補の規約、robots.txt、公式API、feed、問い合わせ先のpolicy記録。
- 許可された取得手段だけを使うconnectorとfixture。
- ニコニコ漫画の直近90日更新作品、一覧またはranking掲載作品の取込。
- 残りの公開seriesを走査する低優先度backfill。
- 長期休載と完結作品の低頻度再確認。
- 通常巡回とbackfillのresource計測。

## 実装方針

- API、feed、公開一覧HTML、公開作品HTML、埋め込みJSONの順に選ぶ。
- browserが必要な候補は自動対応せず、別の公式手段か代替siteを選ぶ。
- 一つのsite追加につきpolicy、connector、fixture、metricsを同じ変更へ含める。
- backfillは通知を生成せず、通常巡回を常に優先する。
- workerを増強せずAsterionの余剰CPUで処理する。

## 受け入れ条件

- policyが許可された10サイトを定期巡回できる。
- 各connectorが同じfixtureを再処理しても重複しない。
- 活動中のニコニコ漫画ユーザー投稿作品を検索できる。
- backfill停止後にcheckpointから再開できる。
- 通常巡回の95％を公開から30分以内に検出する。

## テスト

- siteごとのfixture、構造変更、削除、公開終了、URL変更のtest。
- 通常queue優先とbackfill再開の統合テスト。
- worker上限時のAsterion resource試験。

## 対象外

- 公開前の全過去作品取込完了。
- 認証またはアクセス制限の回避。
