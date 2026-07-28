---
id: 002
title: 品質検査をGitHub Actionsで必須化する
type: platform
status: done
priority: P0
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: []
umbrella: 001
---

# 品質検査をGitHub Actionsで必須化する

## 目的

ローカルとCIで同じBun、oxfmt、oxlint、TypeScript、テストを実行し、壊れた変更をmerge前に検出する。

## 背景

workspaceと検査scriptは存在するが、GitHub Actionsとbranch protectionは未設定である。

## スコープ

- Bun 1.3.14を固定したGitHub Actions workflow。
- `bun install --frozen-lockfile`、`bun run check`、`bun test`、`bun run build:web`の実行。
- Bunのdownload cacheと依存cache。
- workflowの最小権限と同一branchの古い実行のcancel。
- RenovateがBunと固定依存を更新できる設定。

## 実装方針

- root scriptをCIから呼び、CI専用の検査手順を複製しない。
- package managerとJavaScript runtimeにNode.js、npm、pnpm、Yarnを追加しない。
- lint警告も失敗として扱う。

## 受け入れ条件

- clean checkoutから全検査が成功する。
- format差分、lint違反、型エラー、失敗テスト、Web build失敗の各変更でworkflowが失敗する。
- workflowの権限は`contents: read`を基本とする。
- lockfileとmanifestが不一致ならinstallが失敗する。

## テスト

- workflowをpull requestで実行する。
- 各失敗種別を一時的に作り、該当stepが失敗することを確認する。

## 対象外

- コンテナのbuildとpush。
- Asterionへのdeploy。
