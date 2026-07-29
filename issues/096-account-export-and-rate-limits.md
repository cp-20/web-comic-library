---
id: 096
title: account data exportとAPI rate limitを安全にする
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

# account data exportとAPI rate limitを安全にする

Codex Review PR #067 の所見。export jobを繰り返し投入してworker・DBを圧迫できず、利用者が完了したexportを取得できるようにする。

## 取り込んだ所見

- accountごとの未完了export数またはrequest rateを制限する。
- UIは一回待つだけでなく、queued exportを完了または失敗までpollしてdownloadへ進める。
- rate-limit keyを任意の`X-Forwarded-For`先頭値に依存させず、deploymentで信頼したproxy headerから導出する。
