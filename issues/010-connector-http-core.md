---
id: 010
title: fetchだけで動くconnector共通基盤を作る
type: platform
status: done
priority: P0
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: [003, 009]
umbrella: 007
---

# fetchだけで動くconnector共通基盤を作る

## 目的

各漫画サイトconnectorが安全なHTTP取得、差分検出、検証、失敗記録を共通利用できるようにする。

## スコープ

- `Connector.discover`と`Connector.fetchPublication`のinterface。
- `Bun.fetch`を使うHTTP client。
- host allowlist、redirect検証、timeout、本文上限、Content-Type検証。
- host別の同時接続数、取得間隔、jitter、`Retry-After`、指数backoff。
- ETag、Last-Modified、本文hashを持つ`FetchResourceState`。
- checkpointと連続失敗数を持つ`SourceCrawlState`。
- `CrawlRun`の成功件数、解析失敗、所要時間の記録。
- HTML、Atom、埋め込みJSONのfixture test基盤。

## 実装方針

- browser、Playwright、Chromiumをruntime依存へ追加しない。
- `redirect: "manual"`で最大3回追跡し、各hostを検証する。
- timeoutは10秒、本文上限は5MiBから始める。
- hostごとの同時接続数を1、通常巡回の間隔を最低2秒とする。
- 304では本文を解析せず確認日時だけを更新する。
- Valibotの`safeParse`に失敗した値を補完せず解析失敗として残す。
- checkpointは取得結果と保存が同じtransactionで成功した後だけ進める。
- 漫画本文と漫画ページ画像をrequest、fixture、保存対象にしない。

## 受け入れ条件

- 許可外hostと許可外redirectをrequest前に拒否する。
- timeout、本文超過、誤Content-Typeを分類して記録する。
- ETagとLast-Modifiedを次回requestへ送り、304を解析しない。
- 同じfixtureの再処理で候補とcheckpointが重複しない。
- 連続失敗でconnectorを停止し、成功後に明示的に再開できる。

## テスト

- Bunのlocal HTTP serverを使う統合テスト。
- redirect、304、429、timeout、本文超過、途中切断の各ケース。
- 画像URLへのrequestが0件であることを記録するテスト。

## 対象外

- 個別サイトのselector。
- proxyとbrowser fallback。
