---
id: 074
title: release後の継続負荷scenarioをk6で実装する
type: quality
status: blocked
priority: P3
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: [018, 025, 027, 035, 061]
umbrella: 043
---

# release後の継続負荷scenarioをk6で実装する

## 目的と利用場面

運営者が初期リリース後に#065で24時間のproduction相当負荷を同じ入力とthresholdで実行できるよう、
検索、作品詳細、読書状態更新を含むk6 scenarioと匿名fixture seedを用意する。未実装でも初期リリースを
阻害しない。

## 背景と現状の問題

#035のBun microbenchmarkはpull request向けに短く、network、DB、queue、長時間のresource変化を扱わない。
24時間runner、virtual user、percentile、threshold、summaryを自前実装するよりk6の標準機能を使う方が
実装と運用が少ない。

## 実装判断と代替案

- `k6 v2.1.0`をtest toolとして採用し、application runtimeとpackage managerはBunのまま維持する。
- k6 binaryはlocalでは公式release `v2.1.0`、CIでは公式container `grafana/k6:2.1.0`を使い、
  npm packageとしてBun dependencyへ追加しない。version更新は別pull requestでscenarioとCI smokeを
  再検証してから行う。
- protocol-level HTTP scenarioだけを担当し、browser k6とPlaywrightを重複させない。

## スコープと変更対象

| file                          | 操作 | 変更内容                                                                        |
| ----------------------------- | ---- | ------------------------------------------------------------------------------- |
| `quality/load/pre-release.js` | 作成 | 3 journey、ramping VU、24時間duration、p95/error threshold、summaryを定義する。 |
| `quality/load/seed.ts`        | 作成 | 匿名account、作品、話、sessionを決定的IDで実PostgreSQLへ投入・削除する。        |
| `quality/load/README.md`      | 作成 | k6 v2.1.0、seed、実行、停止、artifact、cleanupを記録する。                      |
| `package.json`                | 変更 | seedと短縮smokeのBun commandを追加する。                                        |
| `.github/workflows/ci.yml`    | 変更 | 5分のk6 smokeを`grafana/k6:2.1.0`で実行する。                                   |
| `docs/testing.md`             | 変更 | #035のmicrobenchmark、k6 smoke、#065の24時間実行の境界を書く。                  |

## component間の契約

- `BASE_URL`はHTTPSまたはloopback HTTPだけ、`LOAD_SESSION_COOKIE`はenvironmentだけから受け、
  sourceとsummaryへ出さない。
- scenarioは検索50％、作品詳細30％、読書状態更新20％で、1→10→20 VUへrampし24時間維持する。
- thresholdは`http_req_failed < 0.01`、対象route別`http_req_duration p(95) < 1500`とする。
- seedは専用prefixの決定的IDだけを作り、cleanupはprefix外のrowを削除しない。
- CI smokeは同じscenarioを5分・最大4 VUへoverrideし、threshold定義は変えない。

## 実装手順

1. seed/cleanupと実DB integration testを作る。
2. k6 scenario、route tag、threshold、Secretを除くsummary JSONを実装する。
3. local APIとPostgreSQLで5分smokeを実行し、cleanup後のrow 0件を確認する。
4. CIへversion固定k6 containerを追加し、docsを更新する。

## 受け入れ条件

- 同じscriptを5分CI smokeと24時間#065で使える。
- 検索、作品詳細、読書状態更新の比率とthresholdが固定されている。
- session、個人情報、response bodyをlog/artifactへ出さない。
- cleanupが専用fixtureだけを削除し、再実行でrowを重複しない。

## テスト

- `bun run check`
- `bun test`
- 実PostgreSQL seed/cleanup integration test
- k6 5分smoke

## 対象外

- browser操作、外部site負荷、production実行、24時間の人による判定。
- 初期リリースの公開条件。

## Blocker

2026-07-28時点で#018と#061が未完了で、release候補のrouteとworker競合条件を固定できない。

## 解除条件

全`depends_on`が`done`で、隔離環境用の匿名fixture account contractが確定すること。

## 解除後の着手点

`quality/load/seed.ts`に専用fixture IDとcleanup境界を実装する。

## 禁止する代替

productionや外部siteへの負荷、実account Cookieの保存、thresholdの実行時変更、Node.js runnerの追加を
禁止する。
