---
id: 093
title: 感想の可視性と利用者操作を整える
type: feature
status: unpolished
priority: P1
execution: agent
review_required: true
review_status: not_requested
reviewed_at: null
depends_on: []
umbrella: null
---

# 感想の可視性と利用者操作を整える

Codex Review PR #060 と #072 の所見。感想がfollowers公開で実際に読めること、reveal後の操作・通知、reaction表示、本人編集削除を一つの利用者機能として整理する。

## 取り込んだ所見

- #060: accepted followerを`followers` visibilityの感想から除外していないか確認する。
- #060: inactive / pending deletion accountの感想をlist・revealから除外する。
- #060: reaction後に件数と失敗を画面へ反映する。reviewの編集・削除をWeb UIから呼べるようにする。
- #060 / #072: spoiler revealの本文表示、screen readerへの通知、focus、reveal後のaxe scanを整える。
- #060: 感想一覧のcursor paginationを導入する。
