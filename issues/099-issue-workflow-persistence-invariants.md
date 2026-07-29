---
id: 099
title: issue workflowの永続化invariantを守る
type: platform
status: unpolished
priority: P1
execution: agent
review_required: true
review_status: not_requested
reviewed_at: null
depends_on: []
umbrella: 001
---

# issue workflowの永続化invariantを守る

Codex Review PR #072 の所見。workflow属性更新の失敗でMarkdown正本を壊さず、umbrellaの完了状態を子issueと矛盾させない。

## 取り込んだ所見

- blocked/humanへ遷移する更新は、rename前に生成後Markdownをschema検証する。
- validation失敗時にinvalid issue fileを残さない。
- umbrellaを`done`へ更新するとき、未完了childが一つでもあれば拒否する。
