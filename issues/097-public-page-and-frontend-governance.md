---
id: 097
title: 公開pageとfrontend運用規則の実装差分を解消する
type: quality
status: unpolished
priority: P2
execution: agent
review_required: true
review_status: not_requested
reviewed_at: null
depends_on: []
umbrella: null
---

# 公開pageとfrontend運用規則の実装差分を解消する

Codex Review PR #067 と #071 の所見。public pageの利用者導線とmetadata、frontend design文書の前提を実装と一致させる。

## 取り込んだ所見

- privacy、terms、copyright、account-deletion pageへcanonicalとOG metadataを付ける。
- copyright連絡先を実際に利用できる窓口へ接続する。
- configured Sentry DSNのingest originとCSPの`connect-src`を整合させる。
- light-only `color-scheme`、Server/Client fetchの説明、E2E前提、AppShellの再利用規則を実装と矛盾させない。
