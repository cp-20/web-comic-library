# 操作監査

コード、GitHub履歴、CIログだけでは追跡できないproduction・外部永続データ・意図的障害試験・破壊的操作を記録する。通常のcommit、push、PR、merge、CI成功はGitHubを正本とし、ここには記録しない。

## 2026-07-25 PostgreSQL collation更新

- **対象**：AsterionのPostgreSQL 16（`postgres`、`template1`、`web_comic_library`、`traqing`）。
- **操作**：`REINDEX DATABASE`とcollation metadataのglibc 2.41への更新。
- **危険性**：index lock、CPU・disk・WAL増加、query遅延、一時的write停止。
- **保護策**：復元試験済み経路でfresh physical backupとWCL logical backupを取得し、空き容量と接続を確認してdatabaseごとに実施。
- **結果**：全databaseのcollation versionを2.41へ更新、invalid indexは0件。
- **cleanup**：worker確認用tableと一時Kubernetes Jobを削除。
- **関連**：issue #044。

## 2026-07-25 一時traqing logical backupの削除

- **対象**：R2の`traqing/logical/`に一時保存した1 object。
- **操作**：backup対象外とする指示に基づくlogical dump削除。
- **危険性**：R2 versioning無効のため復元不能。
- **保護策**：削除対象をobject名まで確認し、WCLの`logical/`とphysical backupには非接触。
- **結果**：対象prefixが空であることを確認。
- **cleanup**：なし。

## 2026-07-25 WAL-G backup memory変更

- **対象**：Asterionの`web-comic-library-base-backup` CronJob。
- **操作**：memory requestを128MiBから256MiB、limitを512MiBから1GiBへ変更し、productionへ反映。
- **危険性**：Pod schedulingとnode memoryへの影響、検証backupによるPostgreSQL・disk・network・R2負荷。
- **保護策**：renderとschema検証、node空き容量確認後にone-off Jobで検証。
- **結果**：physical backupは4分44秒で完了、最大観測127MiB、終了理由`Completed`。
- **cleanup**：検証用Kubernetes Jobを削除。backupはretention対象として保持。
- **関連**：issue #046。

## 2026-07-25 backup alert障害試験

- **対象**：Prometheusの`BackupJobFailed` alertとDiscord通知経路。
- **操作**：exit code 23の一時Jobを`backoffLimit: 0`で実行。
- **危険性**：critical alertとDiscord通知が発生し、監視上は実障害と同じ状態。
- **保護策**：database、PVC、Secretをmountしない専用Jobとし、対象名に`alert-test-046`を含めた。
- **結果**：対象Jobのalertが`firing`になった。
- **cleanup**：失敗JobとPodを削除。
- **関連**：issue #046。

## 2026-07-25 catalog schemaのproduction配備

- **対象**：Asterionの`web-comic-library`とPostgreSQL 16の`web_comic_library`。
- **操作**：catalog migrationをArgo CD PreSync hookで適用。
- **危険性**：DDL lockとmigration失敗によるrollout停止。
- **保護策**：migration二重適用、CI、image build、manifest検証後に配備。
- **結果**：migration Jobは53秒で完了、Argo CDは`Synced`/`Healthy`、Web/API healthはHTTP 200。
- **cleanup**：一時production resourceなし。
- **関連**：issue #008。

## 2026-07-25 source policy schemaのproduction配備

- **対象**：Asterionの`web-comic-library`とPostgreSQL 16の`web_comic_library`。
- **操作**：source policy migrationをArgo CD PreSync hookで適用。
- **危険性**：DDL lockとmigration失敗によるrollout停止。
- **保護策**：migration二重適用、CI、image build、manifest検証。既存tableへの追加列はnullable。
- **結果**：migration Jobは43秒で完了、Argo CDは`Synced`/`Healthy`、Web/API/worker healthはHTTP 200。
- **cleanup**：一時production resourceなし。
- **関連**：issue #009。

## 2026-07-25 connector共通基盤のproduction配備

- **対象**：Asterionの`web-comic-library`とPostgreSQL 16の`web_comic_library`。
- **操作**：connector state migrationをArgo CD PreSync hookで適用。
- **危険性**：DDL lockとmigration失敗によるrollout停止。
- **保護策**：migration二重適用、CI、image build、manifest検証。connector設定とcrawl jobは追加しない。
- **結果**：migrationは成功し、新規state tableは0行。connector通信とcrawlは発生せず、Argo CDは`Synced`/`Healthy`。
- **cleanup**：一時production resourceなし。
- **関連**：issue #010。
