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
