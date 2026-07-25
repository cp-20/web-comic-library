# 操作監査ログ

production環境、外部service、Secret、database、永続dataへ影響する操作と、意図的な障害試験を記録する。

Secretの値と個人情報は記録しない。

## 2026-07-25 PostgreSQL collation更新

- **対象**：AsterionのPostgreSQL 16。
- **操作**：`postgres`、`template1`、`web_comic_library`、`traqing`へ`REINDEX DATABASE`を実行し、collation metadataをglibc 2.41へ更新した。
- **危険性**：index再構築中のlock、CPU負荷、disk使用量、WAL増加により、query遅延や一時的なwrite停止が起こる可能性があった。
- **保護策**：復元試験済みの経路でfresh physical backupとWCL logical backupを取得し、169GiBの空き容量と接続状態を確認してからdatabaseを一つずつ処理した。
- **結果**：四つのdatabaseで記録値と実値が2.41になり、invalid indexは0個だった。
- **確認**：日本語文字列のindex検索とsort、production worker job、公開Web、API、WAL archive、Argo CDを確認した。
- **cleanup**：worker確認用tableと一時Kubernetes Jobを削除した。
- **関連**：application PR #8、issue #044。

## 2026-07-25 一時traqing logical backupの削除

- **対象**：R2の`traqing/logical/`へ一時保存した1 object。
- **操作**：collation更新前に作成したlogical dumpを、traqingはbackup対象外という利用者の指示後に削除した。
- **危険性**：R2 versioningを無効にしているため、削除したobjectは復元できない。
- **保護策**：削除対象をobject名まで確認し、WCLの`logical/`とclusterのphysical backupには触れなかった。
- **結果**：`traqing/logical/`が空であることを確認した。

## 2026-07-25 WAL-G backup memory変更

- **対象**：Asterionの`web-comic-library-base-backup` CronJob。
- **操作**：memory requestを128MiBから256MiB、limitを512MiBから1GiBへ変更し、Argo CDでproductionへ反映した。
- **危険性**：resource増加によりPod schedulingとnode memoryへ影響する可能性があり、検証backupはPostgreSQL、disk、network、R2へ負荷を加える。
- **保護策**：Kustomize renderとstrict schema検証後にmanifest PR #132をmergeし、nodeに十分な空きがある状態でone-off Jobを実行した。
- **結果**：更新後CronJob由来のphysical backupは4分44秒で完了し、5秒間隔の最大観測値は127MiB、終了理由は`Completed`だった。
- **確認**：R2の`backup-list`で`base_000000010000015300000009`を確認した。
- **cleanup**：検証用Kubernetes Jobを削除し、base backupはretention対象として保持した。
- **関連**：manifest PR #132、issue #046。

## 2026-07-25 backup alert障害試験

- **対象**：Prometheusの`BackupJobFailed` alertとDiscord通知経路。
- **操作**：production backup Jobと同じ名前patternを持ち、exit code 23で終了する一時Jobを`backoffLimit: 0`で作成した。
- **危険性**：意図したcritical alertとDiscord通知が発生し、監視上は実障害と同じ状態になる。
- **保護策**：database、PVC、SecretをmountしないJobを使い、対象名へ`alert-test-046`を含めた。
- **結果**：Prometheusで対象Jobのalertが`firing`になった。
- **cleanup**：確認後に失敗JobとPodを削除した。

## 2026-07-25 catalog migration統合試験

- **対象**：local Docker ComposeのPostgreSQL 16 test database。
- **操作**：#008のmigrationを2回適用し、domain、constraint、repository、query port、多対多mappingの統合テストを実行した。
- **危険性**：localのTCP port 55432、Docker container、network、匿名volumeを一時的に使用し、cleanupではtest dataを削除する。
- **保護策**：production接続情報を渡さず、repository専用のCompose projectだけを対象にした。
- **結果**：13 testが成功し、migrationの再適用も成功した。
- **cleanup**：対象container、network、匿名test volumeを`docker compose down --volumes`で削除した。
- **関連**：issue #008。

## 2026-07-25 17:00 JST catalog schemaのproduction配備

- **対象**：Asterionの`web-comic-library` applicationとPostgreSQL 16の`web_comic_library` database。
- **操作**：Web、API、workerをapplication merge commit `5ef26bf`へ更新し、Argo CDのPreSync hookでcatalog migrationを適用した。
- **危険性**：DDLの実行中にtable lockが発生し、migration失敗時には後続のrolloutが停止する可能性があった。
- **保護策**：空のPostgreSQL 16へmigrationを2回適用する統合試験、application CI、image build、Kustomize render、manifest validationを完了してから配備した。
- **結果**：migration Jobは53秒で完了し、9個のcatalog tableと2件のDrizzle migration記録を確認した。Argo CDは`Synced`かつ`Healthy`になり、WebとAPI healthは外部経路からHTTP 200を返した。
- **cleanup**：一時的なproduction resourceは作成していない。配備branchはmanifest PRのmerge時に削除した。
- **関連**：application PR #10、manifest PR #133、issue #008。

## 2026-07-25 17:14 JST source policy統合試験

- **対象**：local Docker ComposeのPostgreSQL 16 test database。
- **操作**：#009のmigrationを2回適用し、policy revision、年齢区分mapping、公開query、緊急停止の統合試験を実行した。
- **危険性**：localのTCP port 55432、Docker container、network、test dataを一時的に使用した。
- **保護策**：production接続情報を渡さず、repository専用のCompose projectだけを対象にした。
- **結果**：20 testが成功し、R18、年齢確認必須、未確認値の公開除外と緊急停止後の収集停止を確認した。
- **cleanup**：対象containerとnetworkを削除し、repository名を持つtest volumeが残っていないことを確認した。
- **関連**：issue #009。
