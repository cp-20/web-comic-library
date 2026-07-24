# worker実装規則

対象は`apps/worker`と非同期jobを扱うpackageとする。

- worker jobはapplication use caseだけを呼ぶ。
- Graphile WorkerのpayloadはValibotで検証する。
- jobは冪等性keyを持ち、再実行で通知やデータを重複させない。
- 通常巡回をバックフィルより優先する。
- DB transaction中に外部HTTP、Push、メール送信を行わない。
- 連続失敗、再試行回数、処理時間、滞留数を記録する。
- ログへ認証情報、メール本文、Push鍵を出さない。

## 起動とqueue

APIなどのproducerは`JobQueuePort`へtask名、payload、冪等性keyを渡す。
`PostgresJobQueue`は冪等性keyとGraphile Worker jobを同じDB transactionで保存する。
workerは`packages/contracts`のschemaでpayloadを検証してからapplication use caseを呼ぶ。
検証失敗はGraphile Workerの試行失敗として記録し、use caseを呼ばない。
workerを起動する前に`bun run --cwd packages/db migrate`でDrizzleとGraphile Workerのmigrationを適用する。
