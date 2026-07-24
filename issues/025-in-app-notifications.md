---
id: 025
title: release eventからアプリ内通知を生成する
type: feature
status: open
priority: P0
depends_on: [014, 022, 023]
umbrella: 024
---

# release eventからアプリ内通知を生成する

## 目的

新しい話と新刊を利用者のfollow設定へ照合し、常時利用できるアプリ内通知として一度だけ保存する。

## スコープ

- `Notification`のdomain model、table、repository。
- 通知種別、経路、未読と既読、冪等性key。
- release event consumerと通知対象選択。
- 通常話、番外編、再掲載、公開期間変更、告知、新刊の設定。
- 通知一覧、未読件数、既読化のHono RPC routeと画面。
- 後続のfollowとlike通知が使うapplication port。

## 実装方針

- 通常話と番外編は標準で有効にする。
- 再掲載、公開期間変更、告知は利用者が有効にした場合だけ生成する。
- 過去dataの初回取込とbackfillでは通知を生成しない。
- 冪等性keyは利用者、event、経路、通知種別から作る。
- 通知生成はevent保存transactionと分離し、workerが再実行可能にする。
- 非公開情報とネタバレ本文を通知本文へ含めない。

## 受け入れ条件

- follow方式と掲載先優先順位に従って通知対象を選ぶ。
- 同じeventを繰り返し処理しても通知が一件だけ存在する。
- 利用者が種別ごとに通知を有効または無効にできる。
- 通知一覧をpage単位で取得し、個別または一括で既読にできる。
- backfill eventから通知を作らない。

## テスト

- event種別、follow方式、設定の組合せ単体テスト。
- 冪等な生成と既読化のPostgreSQL統合テスト。
- Hono RPCの認証、pagination、visibility test。

## 対象外

- Web Pushとメールの送信。
- 通知内容の高度なpersonalization。
