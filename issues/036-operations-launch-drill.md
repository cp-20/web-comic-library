---
id: 036
title: 初期リリースの機能・安全性証跡をreviewして公開を判断する
type: quality
status: blocked
priority: P1
execution: human
review_required: true
review_status: pending
reviewed_at: null
depends_on: [018, 025, 027, 031, 034, 060]
umbrella: 033
---

# 初期リリースの機能・安全性証跡をreviewして公開を判断する

## 人が操作する理由

公開可否は、未解決riskと事業上の許容範囲を踏まえて責任者が判断し、判断日時と根拠を記録する必要がある。

## Codexでは実行できない理由

Codexには公開を承認する組織上の権限がなく、責任者に代わってriskを受容することもできない。

## 目的と利用場面

運営者が同じrelease候補SHAについて、主要機能、security、privacyの証跡を確認し、初期リリースの
go/no-goを記録する。

## 背景と現状の問題

自動testだけでは権利・security判断を代替できない。一方、accessibility、restore、worker再開、
Pod failover、継続監視、24時間capacityを初期リリースのgateにすると、利用者へ主要機能を届ける前に
運用成熟度の検証によって初期リリースが不要に遅延する。これらは#043、#063〜#065、#074、#078、#083〜#086で
release後に追跡し、このissueは初期リリースに必要な最終reviewだけを担当する。

release前に同一候補へ実施できる証跡だけで判断する。

## 実施判断と代替案

- codeやdrillをこのissue内で実行・修正せず、依存issueの完了済み証跡を確認する。実施と公開判断を
  分離し、未達項目を口頭で免除しないためである。
- 証跡は`docs/releases/public-readiness.md`へ集約し、Secretを含む操作詳細は非Git管理の`audit.md`に残す。
- no-goの場合は修正issueを作って候補SHAを更新し、影響する人手issueを再実施する。結果を見てthresholdを
  緩めない。

## スコープと変更対象

| file                                    | 操作 | 変更内容                                                                                   |
| --------------------------------------- | ---- | ------------------------------------------------------------------------------------------ |
| `docs/releases/public-readiness.md`     | 作成 | 候補SHA、依存issue、証跡link、公開条件、未解決risk、go/no-go、判断責任者、日時を記録する。 |
| `issues/036-operations-launch-drill.md` | 変更 | 判定結果とrelease記録linkを追記し、`done`へ進める。                                        |

application、manifest、runbook、alertはこのissueで変更しない。

## 公開判断手順

1. 全`depends_on`が`done`で、同じ候補commit SHAとimage digestを参照していることを確認する。
2. 候補SHAの`bun run check`、`bun test`、`bun run build:web`、container checkの結果を記録する。
3. Google login、Web話・単行本の読書管理、通知、公開範囲、ネタバレ、block、通報、catalog管理の
   自動test結果を依存issueから確認する。
4. 未解決issueを`data_loss`、`privacy_security`、`task_blocking`、`minor`へ分類する。前3分類が
   一件でもあればno-goにする。
5. 公開条件ごとに証跡link、pass/fail、判断責任者を記録し、go/no-goと日時を確定する。
6. no-goなら修正issue、再実施する人手issue、次の候補SHAを記録する。

## 公開条件

- 許可済み10サイトとニコニコ漫画の対象作品を、許可contractの範囲だけで収録できる。
- Google OAuthの新規login、再login、logout、初回profile設定をrelease originで確認できる。
- Web話と単行本の読書管理、三経路の通知、公開範囲、ネタバレ、block、通報が動作する。
- 作品、話、分割掲載の統合・分割と利用者候補の審査を強いadministrator sessionで行える。
- 主要journeyの既存自動testに重大な失敗がない。

## 受け入れ条件

- 全公開条件に同じ候補SHAの証跡、pass/fail、判断責任者がある。
- `data_loss`、`privacy_security`、`task_blocking`の未解決issueが0件である。
- no-go時は理由、修正issue、再実施対象が記録され、公開操作を行わない。
- go時は候補SHA、image digest、判断責任者、日時、既知minor riskを再確認できる。

## テスト

- `bun run check`
- `bun test`
- `bun run build:web`
- 全依存issueの完了済みreportの照合

## 対象外

- release後Web Vitalsと利用者feedbackの実測。
- drill、負荷、実機確認の実施。
- application、manifest、runbook、alertの修正。
- SLA契約、収益化、公開操作そのもの。
- 継続監視、restore、worker/connector再開、Pod/VPS failover、24時間loadとcapacity判定。
- 自動・手動accessibility検証。

## Blocker

2026-07-28時点で#018と#060を含む直接依存が未完了で、同じ候補SHAの初期リリース証跡がそろっていない。

## 解除条件

全`depends_on`が`done`で、各reportが同じ候補SHAまたは影響なしと明示したSHAを参照すること。

## 解除後の着手点

`docs/releases/public-readiness.md`を作成し、候補SHA、image digest、依存issue一覧を固定する。

## 禁止する代替

未reviewのissueを口頭で免除する、異なる候補SHAの結果を混在させる、結果後にthresholdを緩める、
no-go分類をminorへ変更して公開する方法を禁止する。
