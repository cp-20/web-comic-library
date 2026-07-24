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
