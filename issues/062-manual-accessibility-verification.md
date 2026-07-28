---
id: 062
title: 手動accessibility確認を追跡する
type: umbrella
status: blocked
priority: P3
execution: tracking
review_required: true
review_status: pending
reviewed_at: null
depends_on: [075]
umbrella: null
---

# 手動accessibility確認を追跡する

## 目的

初期リリース後に、自動検査で判定できないkeyboard、screen reader、Android実機の結果を環境ごとに
独立したstatusで追跡する。このumbrellaと全子issueは初期リリースを阻害しない。

## 子issue

- [035 自動accessibility・性能・主要E2E](./035-performance-accessibility-e2e.md)
- [075 手動確認環境とchecklist](./075-accessibility-manual-test-environment.md)
- [080 keyboard操作確認](./080-keyboard-accessibility-verification.md)
- [081 NVDA読み上げ確認](./081-nvda-accessibility-verification.md)
- [082 Android実機確認](./082-android-accessibility-verification.md)

## 完了条件

- 全子issueが同じ候補SHAを対象に実施され、`done`である。
- 未解決blocker/majorが0件で、minorは追跡issueとriskが記録されている。

## 対象外

- fixture環境とchecklistの実装。#075で行う。
- code修正、WCAG適合宣言。

## Blocker

2026-07-28時点で#075と全子issueが未完了である。

## 解除条件

#075と全子issueが`done`であること。

## 解除後の着手点

全子issueの成果が同じ候補SHAを参照することを確認し、このumbrellaを`done`へ進める。

## 禁止する代替

一つの環境の結果を別環境へ流用する、未実施の子issueを一括で完了扱いする方法を禁止する。
