---
id: 029
title: 利用者followとtimelineを実装する
type: feature
status: done
priority: P1
depends_on: [020, 021]
umbrella: 028
---

# 利用者followとtimelineを実装する

## 目的

利用者が公開可能な読書活動を選んで発信し、follow中の利用者の活動を時系列で確認できるようにする。

## スコープ

- `UserFollow`と`Activity`のdomain model、table、repository。
- follow、解除、申請、承認、拒否。
- 読了、読書状態変更、感想のactivity。
- activityを作らず読書記録だけを更新する選択。
- query時にfollow関係と公開活動を結合するtimeline。
- profile、follow一覧、timelineのHono RPC routeと画面。

## 実装方針

- 公開accountは即時follow、follower限定または非公開accountは承認制にできる。
- follow状態をpending、accepted、rejectedとして明示する。
- activityは元の読書記録を参照し、非公開へ変更された場合はtimelineから除外する。
- 初期版では利用者ごとのtimelineを事前生成しない。
- paginationは安定したcursorを使う。

## 受け入れ条件

- account設定に従って即時followまたは申請になる。
- 申請を本人だけが承認または拒否できる。
- activity作成の有無を読書操作ごとに選べる。
- timelineへaccepted followの閲覧可能なactivityだけを返す。
- 公開範囲変更後に古いactivityが第三者へ表示されない。

## テスト

- follow状態遷移とvisibilityのdomain単体テスト。
- cursor paginationと公開範囲変更の統合テスト。
- follow申請からtimeline表示までのE2E。

## 対象外

- fan-out型timeline。
- 推薦user。
