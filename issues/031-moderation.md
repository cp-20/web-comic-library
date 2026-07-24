---
id: 031
title: block、mute、通報、moderationを実装する
type: feature
status: open
priority: P1
depends_on: [020, 029, 030]
umbrella: 028
---

# block、mute、通報、moderationを実装する

## 目的

利用者が望まない相手と活動を非表示にし、運営が通報対象を監査付きで処理できるようにする。

## スコープ

- `Block`、`Report`、利用停止状態のmodelとtable。
- block、解除、mute、解除。
- activity、感想、profileの通報。
- moderatorとadministratorのrole。
- 非表示、警告、利用停止、解除の管理command。
- moderation queue、証跡、監査logのHono RPC routeと画面。

## 実装方針

- block時に相互followとpending申請を解除する。
- block対象のprofile、activity、reaction、通知を双方のqueryから除外する。
- muteはfollow関係を変えずtimelineと通知だけを非表示にする。
- 通報本文をplain textで保存し、外部linkへ`nofollow ugc noopener`を付ける。
- 操作者、理由、変更前後、時刻を監査logへ残す。
- 登録、感想、いいね、通報へrate limitを設定する。

## 受け入れ条件

- block後に相互followがなくなり、双方の活動と通知を返さない。
- mute後に対象activityをtimelineへ返さない。
- 同じ対象を通報し、運営queueで状態管理できる。
- moderatorは非表示と警告、administratorは利用停止を実行できる。
- 権限のない利用者は管理routeへ到達できない。
- moderation操作を監査logから追跡できる。

## テスト

- block、mute、follow解除のdomain単体テスト。
- timeline、通知、profile queryへの横断的な統合テスト。
- role別Hono RPC認可と管理画面E2E。

## 対象外

- 自動content moderation。
- IP ban。
