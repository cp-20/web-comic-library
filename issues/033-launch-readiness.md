---
id: 033
title: 公開ベータの品質条件を満たす
type: umbrella
status: open
priority: P1
depends_on: []
---

# 公開ベータの品質条件を満たす

## 目的

security、privacy、accessibility、性能、復旧の条件を検証し、招待制betaから一般公開へ進める。

## 子issue

- [034 security、法務、data権利](./034-security-legal-data-rights.md)
- [035 性能、accessibility、E2E](./035-performance-accessibility-e2e.md)
- [036 運用試験と公開判定](./036-operations-launch-drill.md)

## 完了条件

- 全子issueが`done`である。
- 公開判定の証跡と未解決riskがrelease記録へ残っている。
- 重大なaccessibility違反と既知の高危険度脆弱性がない。

## 対象外

- SLA契約。
- 収益化。
- native application。
