---
id: 035
title: 性能、accessibility、主要E2Eを自動検証する
type: quality
status: review
priority: P3
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: [017, 021, 023, 026, 030, 031, 032]
umbrella: 062
---

# 性能、accessibility、主要E2Eを自動検証する

## 目的と利用場面

開発者が初期リリース後の品質改善で、mobile Webの主要journey、WCAG 2.2 A/AAの機械検出可能な違反、
固定fixture条件のLCPとAPI応答時間を同じcommandで検証し、回帰をCIで止められるようにする。

このissueは初期リリースを阻害しない。repository内で再現できる検査だけを担当する。keyboard、
screen reader、
mobile実機による人の知覚確認は#080〜#082、追跡は#062、production相当の長時間負荷とresource確認は
#065へ分ける。field dataは扱わない。

## 背景と現状の問題

`bun test`はdomain、application、adapter、APIを検証するが、実browserでroute間を移動してformを
操作する試験はない。このため、accessible nameの欠落、focus表示の消失、client navigation後の
表示不整合、非公開情報やネタバレ本文の早すぎる表示をcomponent単位のtestだけでは検出できない。

性能も「開発者の端末で速く見えた」だけでは入力、sample数、percentileが一定せず比較できない。
このissueでは外部serviceや実accountを使わない固定fixtureへ限定し、pull requestごとに再現できる
小さなbaselineを作る。

## 実装判断と代替案

- browser E2Eは`@playwright/test`、自動accessibility検査は`@axe-core/playwright`を使う。
  Playwrightは既存のNext.js server起動、mobile Chromium、trace、role locatorを一つのrunnerで扱える。
  Cypressは同じjourneyのために二つ目のbrowser runnerと設定体系を増やすため採用しない。
- E2EのAPI応答は`page.route`によるrepository内fixtureを使う。CIで外部accountや外部serviceを必要とせず、
  Webの表示・操作・公開範囲を決定的に検証するためである。DB adapterは既存integration testで検証し、
  browser E2Eへ実PostgreSQLのseedと認証bootstrapを重複させない。
- API microbenchmarkはBun、Honoの`app.request`、既存portのin-memory実装で自前実装する。k6の利用は
  repository規則上許可するが、今回の64 sample・8並列のin-process smokeでは、k6用HTTP serverの起動、
  fixture認証、別processの終了管理を追加する方が実装量が多い。k6が適するproduction相当の継続負荷は
  #065で別に扱い、このissueでは導入しない。
- browserのLCPはPlaywright内のPerformance Observerで取得する。Lighthouseは新しいrunnerとreport形式を
  増やし、INP/CLSのfield判定は今回の対象外なので導入しない。
- axeは自動判定可能な規則だけを担当する。読み上げの自然さ、動的messageの通知順、mobile拡大時の
  操作可能性をaxeの成功で代替せず、#080〜#082へ分離する。

## スコープと変更対象

| file                                                  | 操作       | 変更内容                                                                                                    |
| ----------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `package.json`、`bun.lock`                            | 変更       | `@playwright/test`と`@axe-core/playwright`をdev dependencyへ追加し、`test:e2e`と`benchmark:api`を定義する。 |
| `playwright.config.ts`                                | 作成       | `127.0.0.1:3100`のproduction build、mobile Chromium、CI retry、trace、screenshot、単一workerを固定する。    |
| `e2e/api-fixture.ts`                                  | 作成       | methodとpathから固定status・JSONを返すI/Oなしのfixture resolverを定義し、Playwrightと#075で共有する。       |
| `e2e/api-mock.ts`                                     | 作成       | fixture resolverをPlaywrightの`page.route`へ接続し、未定義requestを501で失敗させる。                        |
| `e2e/main-journeys.pw.ts`                             | 作成       | profile、検索・読書状態、follow方式、単行本、ネタバレ、共有、moderationのjourneyをrole locatorで検証する。  |
| `e2e/accessibility.pw.ts`                             | 作成       | 主要5画面とネタバレ表示後へaxeのWCAG 2.2 A/AA scanを実行する。                                              |
| `e2e/performance.pw.ts`                               | 作成       | 公開検索画面のLCPと、16 sample・4並列のfixture browser loadのp95を検証する。                                |
| `apps/api/src/benchmark.ts`、`apps/api/package.json`  | 作成・変更 | 読書状態更新を64 sample・8並列で呼ぶBun benchmarkと`benchmark` scriptを追加する。                           |
| `apps/web/src/app/globals.css`                        | 変更       | keyboard focusを常時判別できる`:focus-visible`とmobileで十分な操作対象寸法を定義する。                      |
| `apps/web/src/app/works/[workId]/review-controls.tsx` | 変更       | ネタバレ開示後の本文と操作結果をscreen readerへ通知できるlive regionにする。                                |
| `.github/workflows/ci.yml`                            | 変更       | API benchmark、Chromium導入、E2E、failure時のPlaywright report保存をquality jobへ追加する。                 |
| `docs/testing.md`                                     | 変更       | local/CI実行方法、固定性能条件、自動検査と#075・#080〜#082・#065の境界を記録する。                          |

このissueで既存fileは削除しない。Web Vitals収集endpoint、Prometheusのbrowser metric、Sentry tracing、
k6 scriptは作成しない。

## component間の契約

### fixture E2E

- `playwright.config.ts`は`bun run --cwd apps/web start --hostname 127.0.0.1 --port 3100`を起動し、
  `Pixel 5`相当のChromiumだけを使う。workerは1、timeoutは30秒、CI retryは2回とする。
- `e2e/api-fixture.ts`は
  `resolveApiFixture(method, path): { status: number; body: Readonly<Record<string, unknown>> } | null`
  をexportする。`POST /api/login/google`は`{ url: '/settings/profile' }`を返す。状態変更routeは
  同じprocess内で永続化せず、journeyが期待する成功responseだけを返す。
- `e2e/api-mock.ts`はresolverの結果を返す。`null`の場合は
  `route.fulfill({ status: 501, body: '{"error":"unmocked_e2e_route"}' })`とする。
- locatorはrole、label、accessible nameを使い、CSS class、DOM階層、固定sleepを使わない。
- 次を独立したtestにする。
  1. Google loginからprofileと標準公開範囲を保存し、検索から作品詳細へ進んで読書状態を保存する。
  2. 掲載先優先順位と`fastest`、`source_priority`、`selected_publications`、
     `all_publications`を保存する。
  3. 単行本だけの既読、紙所蔵、電子所蔵を保存する。
  4. 未読者向け感想本文が明示開示前にDOMへ存在せず、開示API成功後だけ表示される。
  5. 公開活動だけが共有pageとtimelineへ表示され、非公開活動は404相当になる。
  6. block、通報、administratorによる非表示操作を完了する。

### accessibilityと固定性能

- axeは`wcag2a`、`wcag2aa`、`wcag22aa` tagを使い、`/`、`/login`、
  `/settings/profile`、`/settings/follows`、`/library/volumes`と、作品詳細のネタバレ開示後をscanする。
  rule除外とviolationのsnapshot承認は行わない。
- `e2e/performance.pw.ts`はmock登録後の公開検索画面でPerformance Observerが報告する最後のLCPを
  2,500ms以下とする。Observerが値を返さない場合はtestを失敗させ、navigation durationで代替しない。
- browser loadは16 sampleを4 browser contextずつ実行し、公開検索のheadingが表示されるまでを計測する。
  昇順配列の`ceil(n * 0.95) - 1`をp95とし、1,500ms以下を合格とする。
- `apps/api/src/benchmark.ts`はin-memory portで`POST /api/library/status`を64回、8並列で実行する。
  200以外は即時失敗し、同じp95定義で1,500ms以下を合格とする。email、session token、request/
  response bodyを標準出力へ出さない。
- これらは固定fixtureの回帰検出値であり、productionのSLO、最大同時利用者数、field実測値として
  文書化しない。

## 実装手順

1. root dependency、script、Playwright config、pure fixture resolver、Playwright adapterを追加し、
   未定義routeが501になるtest fixtureを完成させる。
2. 六つの主要journeyを追加する。失敗箇所を直す場合はaccessible name、focus、live regionを
   production UIで直し、test専用分岐を追加しない。
3. axe scanと固定browser性能testを追加し、CIで`build:web`後にChromiumを導入して実行する。
4. Hono application benchmarkを追加し、CIでbrowser E2Eより前に実行する。
5. `docs/testing.md`へcommand、sample数、並列数、閾値、#075・#080〜#082・#065との境界を転記する。

## 受け入れ条件

- mobile Chromiumで六つの主要journeyが3回連続成功し、未定義API requestが試験を失敗させる。
- 主要5画面とネタバレ開示後のaxe WCAG 2.2 A/AA violationが0件である。
- keyboard操作中のfocusが視覚的に判別でき、ネタバレ開示結果がlive regionから通知される。
- 固定fixtureのLCPとbrowser load p95、Hono application p95が定義した閾値以内である。
- trace、report、標準出力へ非公開情報、ネタバレ本文、session、Secretを保存しない。

## テスト

- `bun run check`
- `bun test`
- `bun run build:web`
- `bun run benchmark:api`
- `bun run test:e2e`

## 対象外

- keyboard、screen reader、mobile実機、拡大表示の手動判定。#080〜#082で行う。
- production相当の継続負荷、Asterion resource、費用の判定。#065で行う。
- release後のfield data、Web Vitals収集、SLO判定。
- WCAG適合宣言。
- production Google accountをCIから操作すること。
- Firefox、WebKit、desktop専用UIのE2E matrix。
- 実PostgreSQLを通すbrowser load、k6、汎用load test framework。
