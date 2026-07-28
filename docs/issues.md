# issue管理

この文書をissueの書式、状態、一覧、依存関係の正本とする。個々の作業内容は
`issues/NNN-slug.md`へ置き、`issues` directoryには別のREADMEや運用規則を置かない。

番号は再利用しない。番号は作成順だけを示し、実行順はfrontmatterの`depends_on`だけで
判断する。

## 種類

- `umbrella`：子issueの完了状況と共通の成果だけを追跡する。
- `feature`：利用者または運営者へ一つの成果を届ける。
- `platform`：複数機能が使う実行基盤を整える。
- `quality`：品質目標を再現可能な方法で検証し、失敗条件を残す。

umbrella以外は、単独のpull requestで受け入れ条件を満たせる大きさにする。独立した成果、
異なる外部判断、別々にrollbackできる変更を一つのissueへ混在させない。

## frontmatter

全issueに次を記載する。

```yaml
---
id: 092
title: 利用者が理解できる成果を動詞で表す
type: feature
status: review
priority: P1
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: [020]
umbrella: 019
---
```

`umbrella`は子issueだけに記載する。`depends_on`は、そのissueが未完了では実装または検証を
完了できない直接依存だけを書く。単なる着手順の希望は依存にしない。

`execution`は次のいずれかとする。

- `agent`：code、test、文書の変更として自動化された環境で実装する。
- `human`：実機確認、権利者との連絡、production drill、公開判断など、人が実行して証跡を残す。
- `tracking`：umbrellaとして子issueだけを追跡する。

agent実装とhuman作業を一つのissueへ混在させない。agentが準備するtoolやchecklistと、それを使う人の
作業も別issueにし、`depends_on`で接続する。`execution: human`では本文に
`## 人が操作する理由`と`## Codexでは実行できない理由`を置き、必要な権限、実機、本人同意、
責任判断などをそのissue固有の内容で説明する。「人が確認するため」のような循環した理由は使わない。

全issueは`review_required: true`とし、実装へ着手する前にissue本文そのものを人がreviewする。
review対象は実装後の成果物ではなく、目的、判断、変更対象、手順、受け入れ条件が必要十分で、
実装者に未解決の判断を残していないかである。

- `review_status: not_requested`：issue本文の作成中で、まだreviewを依頼していない。
- `review_status: pending`：issue本文が実装可能な粒度になり、人のreviewを待っている。
- `review_status: approved`：人がissue本文を実装指示書として承認した。
- `review_status: changes_requested`：人がissue本文へ修正を求め、再reviewを待っている。
- `review_status: legacy_unrecorded`：この規則の導入前に`done`で、review記録を復元できない。

`approved`と`changes_requested`では決定時刻を`reviewed_at`へ記録する。それ以外は`null`とする。
reviewer名はissue属性として管理しない。`pending`と`changes_requested`は通常`status: review`と
組み合わせるが、外部blockerがある場合は`status: blocked`を維持できる。`open`、`in_progress`、
`human_action`、`done`へ進めるには`review_status: approved`が必要である。
`legacy_unrecorded`は`done`だけで使い、そのissueを変更する場合は本文reviewを実施して
`approved`または`changes_requested`へ置き換える。

## 本文の必須内容

issueは、実装者が`PLAN.md`、作成者との会話、未記録の前提を参照せず、そのまま実装へ
着手できる作業指示書にする。umbrellaは「目的」「子issue」「完了条件」「対象外」だけでも
よい。umbrella以外は次を含める。

### 目的と利用場面

- 誰が、どの場面で、何を達成するための変更かを書く。
- 新規機能では、入口、主要操作、得られる結果を書く。
- qualityとplatformでは、その検証または基盤がないとどの失敗を検出・防止できないかを書く。

### 背景と現状の問題

- 現在の実装、制約、再現する問題を具体的なfile、route、table、画面名で示す。
- 「必要だから」「未実装だから」だけを理由にしない。
- 既存機能の改善では、現在の挙動、問題になる条件、変更後の挙動を対比する。

### 実装判断と代替案

- 採用する方式を一つに決め、なぜ要件とrepository規則に合うかを書く。
- libraryを追加する場合はpackage名、用途、選定理由、比較して採用しない候補を書く。
- 自前実装では、対象が小さい、Web標準だけで足りる、既存libraryでは境界を守れないなど、
  libraryを追加しない理由を書く。
- 「AまたはB」「必要に応じて」「検討する」のような実装者へ判断を残す表現を使わない。
- 外部仕様によって分岐する場合は、分岐条件と各結果を受け入れ条件として固定する。

### スコープと変更対象

変更する既存file、作成するfile、削除するfileをtableで列挙し、各fileの責務と変更内容を書く。
同種のfixtureなどはglobでまとめてよい。

```markdown
| file                                | 操作 | 変更内容                                            |
| ----------------------------------- | ---- | --------------------------------------------------- |
| `packages/contracts/src/example.ts` | 作成 | HTTP入力のValibot schemaを公開する。                |
| `apps/api/src/app.ts`               | 変更 | schemaを検証してuse caseだけを呼ぶrouteを追加する。 |
| `packages/old/src/example.ts`       | 削除 | 新経路へ置換した旧adapterを除去する。               |
```

新しいfile名が確定していないissueは実装可能な状態ではない。既存fileを大きく分割する場合も、
移動元と移動先を記載する。

### 実装手順とcomponent間の契約

- domain、application、adapter、deliveryの順に、dataと制御がどう流れるかを書く。
- 新しい型、状態、DB制約、port method、HTTP method・path・status、job payload、画面状態を
  実装に必要な粒度で固定する。
- transaction、冪等性、認可、公開範囲、失敗時の挙動を該当するissueで明示する。
- migration番号のように着手時の最新状態で決まる値は「次の連番」と書き、table・column・制約名は
  issueで確定する。
- 実装順を番号付きで書き、各段階でどのtestを追加するか対応付ける。

### 受け入れ条件、テスト、対象外

- 受け入れ条件は利用者から見える結果、保存される状態、失敗時の結果を観測可能な文で書く。
- 正常系、境界値、認証・認可、失敗、回帰、必要な実DBまたはbrowser testを列挙する。
- repositoryの通常完了条件である`bun run check`と`bun test`を含める。Web変更では
  `bun run build:web`も含める。
- あえて実装しない隣接機能と、採用しなかった実装へscopeが広がらないための対象外を書く。

### 人が操作する理由

`execution: human`だけで必須とする。人が行う具体的な操作と、本人の認証session、実機での知覚、
外部への連絡、production権限、法的・事業上の責任など、人にしか担えない理由を書く。

### Codexでは実行できない理由

`execution: human`だけで必須とする。Codexに不足する権限、接続、同意、責任能力を具体的に書く。
「AIだから」ではなく、どの境界のため実行不能なのかを示す。準備codeやread-only検証をCodexが
実行できる場合はhuman issueへ混在させず、別の`execution: agent` issueに分ける。

## blocked issue

`blocked`でも、blocker解消後に再設計せず着手できる本文を維持する。本文末尾に次を追加する。

- `Blocker`：確認済みの事実と確認日。
- `解除条件`：誰からどの形式の入力を得る、どの依存issueが`done`になる、何日経過する、などの
  二値で判定できる条件。
- `解除後の着手点`：最初に変更するfileまたは実行するread-only確認。
- `禁止する代替`：推測実装、規約回避、仮の認可など、blockerを迂回する方法。

blockerを解消する外部操作や判断そのものは、実装者へ暗黙に委ねない。
`status: blocked`では`## Blocker`を必須とし、依存issue番号の列挙ではなく、「どの成果・判断・環境が
ないため、何を確定または実行できないか」を最初の段落だけで説明する。この段落はWeb一覧とCLIの
`blocker` fieldへ表示されるため、解除条件や禁止事項を混在させない。

## 状態

`status`は`open`、`in_progress`、`blocked`、`human_action`、`review`、`done`のいずれかとする。

- `open`：本文が承認済みの`execution: agent`、または未完了の子を持つ`tracking`で、直接依存と外部入力がそろっている。
- `in_progress`：agentまたはhumanが作業中である。
- `blocked`：未完了の直接依存または外部判断が必要で、本文に解除条件がある。
- `human_action`：本文が承認済みの`execution: human`で、依存がそろい人の作業を待っている。
- `review`：issue本文が`pending`または`changes_requested`で、人のreviewを待っている。
- `done`：承認済みのissue本文に従う実装または人の操作と検証が完了している。

`execution: human`を`open`、`execution: agent`または`tracking`を`human_action`にしない。
`review_status: legacy_unrecorded`は規則導入時に既に`done`だったissueだけの例外とする。

umbrellaは未完了の子issueがある間は`open`または`blocked`、全子issueが`done`になった時点で
`done`にする。

## 変更

スコープが独立して完了できる場合は新しいissueへ分割する。受け入れ条件を変えた場合は、
依存issueとumbrellaも同じ変更で更新する。

実装中に判明した恒久的な設計判断は対象の`docs/`へ反映する。完了issueには実装時点の結果を
残してよいが、将来の実装者が従う規則を完了issueだけに置かない。

## issueの操作

issueの検索、閲覧、検証、workflow属性の更新方法は、記述規則と混在させず
[issue操作ガイド](./issue-tooling.md)を正本とする。Coding AgentはWeb UIではなく同ガイドのCLIを使う。

## umbrella一覧

- [001 実行基盤](../issues/001-platform-foundation.md)
- [007 作品カタログと更新収集](../issues/007-catalog-ingestion.md)
- [018 10サイト対応とbackfill](../issues/018-source-expansion-backfill.md)
- [019 アカウントと読書管理](../issues/019-library-management.md)
- [024 通知](../issues/024-notifications.md)
- [028 読書活動と共有](../issues/028-social-sharing.md)
- [033 公開ベータ](../issues/033-launch-readiness.md)
- [037 お気に入りimport extension](../issues/037-favorites-import-extension.md)
- [043 release後の運用品質drill](../issues/043-operational-baseline-drills.md)
- [062 手動accessibility確認](../issues/062-manual-accessibility-verification.md)
- [063 workerとconnectorの復旧drill](../issues/063-worker-connector-recovery-drill.md)
- [064 applicationとVPSの復旧drill](../issues/064-application-failover-drill.md)
- [071 お気に入りfixtureの取得・承認](../issues/071-capture-sanitized-favorite-fixtures.md)
