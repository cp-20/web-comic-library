---
id: 078
title: logical backup restore drillを実施する
type: quality
status: review
priority: P3
execution: human
review_required: true
review_status: pending
reviewed_at: null
depends_on: [006]
umbrella: 043
---

# logical backup restore drillを実施する

## 人が操作する理由

隔離したdatabase環境を選び、backupの復元とcleanupが運用上安全であることを担当者が確認する必要がある。

## Codexでは実行できない理由

Codexには対象database、backup保管先、Secretへの権限がなく、永続dataへ影響する操作を独断で実行できない。

## 目的と利用場面

運営者が初期リリース後に最新の日次logical backupだけから空databaseへ復旧し、physical backupが
使えない場合の独立したdata復旧経路を検証する。未完了でも初期リリースを阻害しない。

## 背景と現状の問題

physical restoreとlogical restoreは入力、command、失敗条件が異なる。一方の成功をもう一方のstatusへ
流用すると、dumpの破損、role/extension不足、`pg_restore` errorを検出できない。

## 実施判断と代替案

- `template0`から作った空databaseへ`pg_restore --exit-on-error`で復元する。
- physical restore済みdatabaseへの上書きやschema-only restoreは独立性とdata完全性を確認できないため使わない。
- 個別rowや個人情報ではなくmigrationと主要table件数、healthだけを比較する。

## 変更対象

| file                                   | 操作            | 変更内容                                                          |
| -------------------------------------- | --------------- | ----------------------------------------------------------------- |
| `operations/drills/logical-restore.md` | 作成            | dump ID、command、件数、health、時間、cleanup、reviewを記録する。 |
| `operations/drills/README.md`          | 変更            | report linkと次回due dateを追加する。                             |
| `issues/078-logical-restore-drill.md`  | 変更            | report linkと結果を追記し、`done`へ進める。                       |
| `audit.md`                             | 変更・非Git管理 | 一時database、credential、restore、cleanupを記録する。            |

## 実施手順

1. 最新成功dumpのID、作成時刻、checksum、開始前の主要table件数を記録する。
2. 隔離PostgreSQLの`template0`から空databaseと一時roleを作る。
3. `pg_restore --exit-on-error`を実行し、stderrとexit codeをSecretなしで記録する。
4. migration、主要table件数、constraint、extension、API healthを比較する。
5. 一時database、role、Secretを削除し、残存接続がないことを確認する。

## 受け入れ条件

- checksum確認済みdumpをerrorなしで空databaseへrestoreできる。
- migration、主要table件数、constraint、extension、healthが期待値と一致する。
- reportにdump ID、時間、結果、reviewerがあり、一時resourceが残っていない。

## テスト

- logical backup checksum
- `pg_restore --exit-on-error`
- SQL件数とhealth比較
- `bun run check`
- `bun test`

## 対象外

- physical restore、dump schedule・formatの修正、production databaseへのrestore。

## 禁止する代替

既存databaseへの上書き、error無視、schema-only restore、個別rowのreport記載を禁止する。
