---
id: 098
title: E2E、accessibility、性能検査の偽陽性を防ぐ
type: quality
status: unpolished
priority: P1
execution: agent
review_required: true
review_status: not_requested
reviewed_at: null
depends_on: []
umbrella: null
---

# E2E、accessibility、性能検査の偽陽性を防ぐ

Codex Review PR #072 の所見。テストが未知request、未計測LCP、未buildのlocal実行を成功として扱わないようにする。

## 取り込んだ所見

- `e2e/api-mock.ts`の未定義method/pathを成功応答にせず、journeyごとの期待requestを明示する。
- LCP entryがないときnavigation durationへfallbackせず失敗させる。
- clean checkoutの`bun run test:e2e`がcurrent Web buildを使うようにする。
- login入口をjourneyで通し、spoiler reveal後のDOMをaxe scanする。
