---
id: 075
title: 手動accessibility確認のfixture環境とchecklistを実装する
type: quality
status: blocked
priority: P3
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: [035, 060]
umbrella: 062
---

# 手動accessibility確認のfixture環境とchecklistを実装する

## 目的と利用場面

初期リリース後、#080〜#082の確認者がproduction accountや外部serviceを使わず、desktopと同一LANの
Android実機から固定dataのWebへ接続し、同じID・順序・期待結果のchecklistを実施できるようにする。
未完了でも初期リリースを阻害しない。

## 背景と現状の問題

Playwrightの`page.route` fixtureは実機Chromeから利用できず、#080〜#082にserver実装を混在させると
statusが曖昧になる。agentがlocal fixture serverとchecklistを先に実装し、人は完成済み環境だけを使う。

## 実装判断と代替案

- #035のpure fixture resolverをBun.serveへ接続し、APIはloopbackだけ、Next.js WebだけをLANへbindする。
- Docker、mock service library、production auth bypassは追加しない。小さなlocal serverに既存Bun APIで
  足りるためである。
- server lifecycleは一commandで管理し、SIGINT/SIGTERMで子processを必ず停止する。

## スコープと変更対象

| file                                        | 操作 | 変更内容                                                                          |
| ------------------------------------------- | ---- | --------------------------------------------------------------------------------- |
| `quality/accessibility/serve.ts`            | 作成 | fixture API、Next build/start、signal、exit、port cleanupを管理する。             |
| `quality/accessibility/manual-checklist.md` | 作成 | `KEY-01..07`、`SR-01..05`、`MOB-01..04`の環境、操作、期待結果、結果欄を定義する。 |
| `quality/accessibility/serve.test.ts`       | 作成 | loopback API、未知route、signal cleanup、LAN host validationを検証する。          |
| `package.json`                              | 変更 | `accessibility:serve` scriptを追加する。                                          |
| `docs/testing.md`                           | 変更 | 起動、実機接続、firewall、終了、#080〜#082 reportの手順を記録する。               |

## component間の契約

- fixture APIは`127.0.0.1:3101`だけへbindし、`e2e/api-fixture.ts`以外のresponseを持たない。未知routeは501。
- `API_ORIGIN=http://127.0.0.1:3101`でWebをbuildし、Webだけを`0.0.0.0:3100`へbindする。
- 起動前に両portの使用を検査し、既存processがいれば上書きせず失敗する。
- child exit、SIGINT、SIGTERM、build failureのいずれでもAPI serverとNext childを停止する。
- stdoutへdesktop URLとprivate LANから使うportだけを出し、LAN address、request body、fixture本文を
  logへ出さない。
- checklistは各項目にID、環境、開始route、操作、期待結果、結果、発見issueを持つ。

## 実装手順

1. fixture resolverをBun HTTP responseへ変換するloopback serverとtestを作る。
2. API起動、Web build/start、signal cleanupを一つのprocessへまとめる。
3. #080〜#082に定義された全check IDを具体的な操作と期待結果へ展開する。
4. root scriptと`docs/testing.md`を更新し、desktopとLAN内test clientからsmokeする。

## 受け入れ条件

- `bun run accessibility:serve`一つでfixture APIとWebが起動する。
- desktopと同一LAN clientからWebを開け、API portへLANから直接接続できない。
- unknown API routeが501になり、production accountや外部networkを使わない。
- signalと失敗終了後にport 3100/3101とchild processが残らない。
- #080〜#082の全check IDに操作と期待結果がある。

## テスト

- `bun run check`
- `bun test`
- `bun run build:web`
- loopback/LAN境界とsignal cleanup test

## 対象外

- 手動checkの実施・判定、production account、外部site、OS firewallの恒久変更。

## Blocker

2026-07-28時点で#035と#060が未完了で、共有fixture contractとGoogle専用loginが確定していない。

## 解除条件

#035と#060が`done`で、`e2e/api-fixture.ts`がGoogle loginを含む主要journeyを返すこと。

## 解除後の着手点

`quality/accessibility/serve.ts`へfixture resolverを接続するloopback Bun serverを実装する。

## 禁止する代替

production auth bypass、外部site接続、APIのLAN bind、手動作業をこのagent issueへ記録する方法を禁止する。
