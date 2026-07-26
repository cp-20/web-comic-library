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

`bibliography_sync`は`workId`、ISBN、`initial`または`incremental`のmodeを受け、openBDとNDLをtransaction外で照会してから書誌同期use caseを呼ぶ。定期同期のproducerは同じ版・同期時刻でstableなidempotency keyを指定する。初回は通知抑止、後続に新規検出した版だけが通知候補になる。

## 取得元の緊急停止

巡回処理は`runSourceCollection`を使い、HTTP requestの前とjob投入の前に取得元policyを確認する。

productionで取得元を停止または再開する場合は、worker Podの`DATABASE_URL`を利用して管理commandを実行する。

```sh
sudo kubectl -n web-comic-library exec deployment/worker -- \
  bun run --cwd apps/worker source-policy -- \
  stop SOURCE_ID OPERATOR inquiry https://example.com/evidence

sudo kubectl -n web-comic-library exec deployment/worker -- \
  bun run --cwd apps/worker source-policy -- \
  resume SOURCE_ID OPERATOR inquiry https://example.com/evidence
```

`OPERATOR`には変更者を識別できる値を指定し、最後の引数には判断根拠のHTTPまたはHTTPS URLを指定する。

このcommandはpolicy revisionを追記し、過去の判断を上書きしない。

## connectorの停止状態

連続失敗で停止したconnectorの状態は次のcommandで確認する。

```sh
sudo kubectl -n web-comic-library exec deployment/worker -- \
  bun run --cwd apps/worker connector-state -- status SOURCE_ID
```

取得元の構造変更、利用条件、失敗原因を確認してから明示的に再開する。

```sh
sudo kubectl -n web-comic-library exec deployment/worker -- \
  bun run --cwd apps/worker connector-state -- resume SOURCE_ID
```

再開commandは連続失敗数を0へ戻すが、checkpointを変更しない。
