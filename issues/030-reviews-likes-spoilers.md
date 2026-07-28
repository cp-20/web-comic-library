---
id: 030
title: 感想、いいね、ネタバレ制御を実装する
type: feature
status: done
priority: P1
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: [020, 021, 023]
umbrella: 028
---

# 感想、いいね、ネタバレ制御を実装する

## 目的

話または巻へ感想を投稿し、閲覧者の既読位置より先の内容を伏せて表示する。

## スコープ

- 感想を表す`Activity`と`Reaction`のmodel、table、repository。
- 1,000文字以内のplain text感想。
- `ContentUnit`または`VolumeEdition`との関連。
- 投稿者が指定するネタバレflag。
- 閲覧者の既読記録に基づく自動ネタバレ判定。
- 伏せた本文を明示操作で開くUI。
- activityまたは感想へのいいね。

## ネタバレ規則

- 投稿者がflagを付けた感想を伏せる。
- 閲覧者が未読の話より先、または未読の巻に紐付く感想を伏せる。
- 未loginでは話または巻に紐付く感想を初期状態で伏せる。
- ネタバレ本文を通知、OG画像、SNS共有文へ含めない。

## 実装方針

- 本文はplain textとして保存し、表示時にescapeする。
- 自動判定はapplication queryで閲覧者の既読位置と比較する。
- 伏せるかどうかと本文を返すかどうかを別fieldにせず、権限に応じたread modelを返す。
- いいねは利用者と対象で一意にする。

## 受け入れ条件

- 話または巻へ1,000文字以内の感想を投稿、編集、削除できる。
- 投稿者指定と自動判定のどちらでも伏せられる。
- 未loginでは対象付き感想を初期表示しない。
- 明示操作後だけ本文を表示する。
- 同じ対象へいいねを二重登録できない。
- 非公開感想を公開queryへ返さない。

## テスト

- 既読位置とネタバレ判定のtable-driven単体テスト。
- 文字数、escape、reaction一意制約の統合テスト。
- 未読利用者と未login利用者のE2E。

## 対象外

- 画像添付。
- reply thread。
