# データベース実装規則

対象は`packages/db`、SQL migration、transactionを伴うuse caseとする。

- schema変更には前進方向のSQL migrationを付ける。
- unique、foreign key、check、not nullをDBでも保証する。
- transaction境界はapplication use caseが決める。
- 状態変更と通知用eventを同じtransactionへ保存する。
- adapterはapplicationが宣言したportを実装する。
- Drizzleのmodelをdomain modelまたはAPI responseとして公開しない。
- migrationはAPIとworkerの起動前に一度だけ実行する。

migrationには適用後の制約と主要queryを確認する統合テストを付ける。

## ローカル開発

PostgreSQL 16を起動する。

```sh
docker compose up -d --wait postgres
```

接続先は`postgres://postgres:postgres@127.0.0.1:55432/web_comic_library`である。

migrationだけを適用する場合は次を実行する。

```sh
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/web_comic_library \
  bun run --cwd packages/db migrate
```

実PostgreSQLを使う統合テストは次を実行する。

```sh
bun run test:integration
```

作業後はPostgreSQLを停止する。

```sh
docker compose down
```

## transactionとoutbox

applicationは`TransactionPort`でtransaction境界を定め、同じ`TransactionContext`をDB repositoryと`OutboxPort`へ渡す。
`PostgresFoundation`は業務状態とoutbox eventを同じtransactionへ保存し、rollback時はcommit後処理を実行しない。
outbox eventとGraphile Worker jobは呼び出し側が安定した冪等性keyを指定する。
同じ冪等性keyを再登録した場合は既存データを変更せず`duplicate`を返す。
