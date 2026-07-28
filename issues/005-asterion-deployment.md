---
id: 005
title: Web、API、workerをAsterionへ配備する
type: platform
status: done
priority: P3
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: [002, 003, 004]
umbrella: 001
---

# Web、API、workerをAsterionへ配備する

## 目的

monorepoから別々のimageを作り、既存のArgo CDとCloudflare TunnelでAsterionへ配備する。

## スコープ

- Web、API、worker、migration用のDocker build target。
- GitHub ActionsによるGHCRへのimage push。
- `cp-20/asterion-manifest`のbaseとproduction overlay。
- Deployment、ClusterIP Service、ConfigMap、SOPS Secret、PreSync migration Job。
- cloudflaredの`/`と`/api/*`のroute。
- 専用PostgreSQL databaseと最小権限roleを作る冪等Job。

## 実装方針

- Bun 1.3.14のslim系imageを固定する。
- imageへ開発依存、Playwright、ブラウザbinaryを含めない。
- Web、API、workerを各1 replicaで開始する。
- requestsとlimitsはWebが250m/256Mi、APIが125m/128Mi、workerが250m/256Miから始める。
- ServiceはClusterIPだけにし、NodePort、LoadBalancer、ルーターのport開放を使わない。
- `cp-20/asterion-ansible`へapplication resourceを追加しない。

## 受け入れ条件

- commit SHAで固定した三つのimageをGHCRから取得できる。
- Argo CD syncでmigration後にWeb、API、workerがReadyになる。
- Cloudflare Tunnel経由でWebと`/api/health`へ到達できる。
- Secretの平文がGit履歴とmanifestへ存在しない。
- 各Podを削除してもKubernetesが復旧させる。

## テスト

- imageを非root、read-only root filesystemで起動するsmoke test。
- production overlayのserver-side dry run。
- migration失敗時に新しいAPIとworkerが起動しないことの確認。

## 対象外

- 複数nodeへのanti-affinity。
- 新しいPostgreSQL StatefulSet。
