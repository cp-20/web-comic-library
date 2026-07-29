---
id: 102
title: image buildとrelease tagの再現性を守る
type: platform
status: unpolished
priority: P2
execution: agent
review_required: true
review_status: not_requested
reviewed_at: null
depends_on: []
umbrella: 001
---

# image buildとrelease tagの再現性を守る

Codex Review PR #004: tag対象と同じcommitをbuildし、GHCR公開前提とimage build contextからのlocal secret除外を確認する。
