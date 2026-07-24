---
id: 035
title: 性能、accessibility、主要E2Eを検証する
type: quality
status: open
priority: P1
depends_on: [017, 021, 023, 026, 030, 032]
umbrella: 033
---

# 性能、accessibility、主要E2Eを検証する

## 目的

mobile利用者が主要操作を完了でき、公開beta相当の負荷で性能目標を満たすことを自動検証する。

## 性能目標

- mobileの75 percentileでLCP 2.5秒以下。
- mobileの75 percentileでINP 200ms以下。
- CLS 0.1以下。
- 認証済み主要操作の95 percentileで1.5秒以内。
- 登録から作品検索とfollowまで3分以内。

## スコープ

- 主要画面のresponsive layoutとkeyboard操作。
- WCAG 2.2 AAの自動検査と手動checklist。
- focus表示、見出し、form label、error説明、色以外の状態表現。
- ネタバレ開閉のscreen reader通知。
- 公開作品pageのCDN cache header。
- 公開beta相当のAPI、DB、通知queueの負荷試験。
- 主要journeyのPlaywright E2E。

## 必須E2E

- 登録、公開範囲選択、検索、作品follow、既読。
- 掲載先優先順位変更と四つのfollow方式。
- 単行本だけを使う既読、所蔵、新刊通知。
- 未読閲覧者への感想伏せ表示。
- 公開記録のSNS共有とOG metadata。
- 非公開記録の公開URL、検索、timelineからの除外。
- block、通報、管理者非表示。

## 実装方針

- CIのE2EにPlaywrightを使い、巡回処理へ流用しない。
- 性能測定条件、data量、同時利用者数をrepositoryへ固定する。
- failure時にpercentileと遅いrouteをartifactへ残す。
- 自動accessibility検査だけで完了にせずkeyboardとscreen readerの手動結果を残す。

## 受け入れ条件

- 全必須E2Eが安定して成功する。
- 記載した性能目標を同じ負荷条件で満たす。
- keyboardだけで登録、検索、follow、既読、設定変更を完了できる。
- 重大なWCAG 2.2 AA違反がない。
- workerを上限まで動かしてもWebと既存Asterion workloadが停止しない。

## テスト

- Playwright E2E、accessibility scan、Web Vitals計測。
- API load testとjob backlog test。
- mobile実機または同等viewportでの手動checklist。

## 対象外

- WCAG適合宣言。
- desktop専用UI。
