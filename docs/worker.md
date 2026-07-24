# worker実装規則

対象は`apps/worker`と非同期jobを扱うpackageとする。

- worker jobはapplication use caseだけを呼ぶ。
- Graphile WorkerのpayloadはValibotで検証する。
- jobは冪等性keyを持ち、再実行で通知やデータを重複させない。
- 通常巡回をバックフィルより優先する。
- DB transaction中に外部HTTP、Push、メール送信を行わない。
- 連続失敗、再試行回数、処理時間、滞留数を記録する。
- ログへ認証情報、メール本文、Push鍵を出さない。
