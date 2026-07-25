---
id: 011
title: 共通feed型の3サイトを収集する
type: feature
status: done
priority: P0
depends_on: [010]
umbrella: 007
---

# 共通feed型の3サイトを収集する

## 目的

少年ジャンプ＋、コミックDAYS、となりのヤングジャンプを一つの設定可能なconnectorで扱う。

## スコープ

- 三サイトの全体Atomによる更新候補の発見。
- 各話ページから作品名、作者、作品別RSSを補完する処理。
- 作品別RSSによる公開話履歴と差分取得。
- サイトごとのbase URL、feed URL、許可hostの設定。
- 漫画本文と画像を除いた最小fixture。

## 抽出規則

- Atomの`entry`から`title`、`updated`、`link[href]`、`author > name`を読む。
- 話ページの`a[href*="/rss/series/"]`から作品別RSSを発見する。
- `h1.episode-header-title`、`h1.series-header-title`、`h2.series-header-author`を読む。
- 外部keyには正規化した話URLを使う。

## 実装方針

- 三つのclassを作らず、一つのconnectorへサイト設定を渡す。
- サイト差異はfixtureで検出し、条件分岐が必要な場合だけ明示する。
- HTML要素が欠けた場合は既存データを削除しない。
- feedまたはHTML構造が変わった場合は解析失敗として停止する。

## 受け入れ条件

- 各サイトのfixtureから作品、作者、話、更新日時、閲覧URLを抽出できる。
- 全体Atomから作品別RSSへ遷移して履歴を取得できる。
- 同じentryを再処理しても同じ外部keyを返す。
- 通常話、番外編、判定不能を安全に区別できる。

## テスト

- サイトごとのAtom、作品RSS、話HTMLのfixture test。
- 必須要素欠落、日時異常、URL変更の回帰テスト。
- 漫画画像へrequestしないlocal HTTP統合テスト。

## 対象外

- 各サイトの漫画viewer。
- JavaScript実行が必要な非公開endpoint。
