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

## 2026-07-25 17:24 JST source policy schemaのproduction配備

- **対象**：Asterionの`web-comic-library` applicationとPostgreSQL 16の`web_comic_library` database。
- **操作**：Web、API、workerをapplication merge commit `e38d9d9`へ更新し、Argo CDのPreSync hookでsource policy migrationを適用した。
- **危険性**：DDLの実行中にtable lockが発生し、migration失敗時には後続のrolloutが停止する可能性があった。
- **保護策**：空のPostgreSQL 16へのmigration二重適用、application CI、image build、Kustomize render、manifest validationを完了してから配備した。既存tableへ追加する列はnullableとした。
- **結果**：migration Jobは43秒で完了し、3個のpolicy table、3個のenum、2個の`publications`列、3件のDrizzle migration記録を確認した。Argo CDは`Synced`かつ`Healthy`になり、Web、API health、worker metricsはHTTP 200を返した。
- **cleanup**：一時的なproduction resourceは作成していない。配備branchはmanifest PRのmerge時に削除した。
- **関連**：application PR #12、manifest PR #134、issue #009。

## 2026-07-25 17:43 JST connector共通基盤の統合試験

- **対象**：local loopback HTTPとTCP server、Docker ComposeのPostgreSQL 16 test database。
- **操作**：redirect、304、429、timeout、本文超過、途中切断、画像request拒否を試験し、#010のmigration、checkpoint transaction、重複排除、rollback、連続失敗停止、明示再開を統合検証した。
- **危険性**：localの一時TCP port、TCP port 55432、Docker container、network、test dataを使用した。
- **保護策**：serverはloopbackだけへbindし、production接続情報を渡さず、repository専用のCompose projectを使った。
- **結果**：最初のdatabase試験でenum代入のcast不足を検出した。修正後のclean databaseでは31 testが成功し、migrationの再適用も成功した。
- **cleanup**：各testでlocal serverを停止し、各試行後にcontainerとnetworkを削除した。repository名を持つtest volumeが残っていないことを確認した。
- **関連**：issue #010。

## 2026-07-25 17:58 JST connector共通基盤のproduction配備

- **対象**：Asterionの`web-comic-library` applicationとPostgreSQL 16の`web_comic_library` database。
- **操作**：Web、API、workerをapplication merge commit `4921bb7`へ更新し、Argo CDのPreSync hookでconnector共通基盤のmigrationを適用した。
- **危険性**：DDLの実行中にtable lockが発生し、migration失敗時には後続のrolloutが停止する可能性があった。
- **保護策**：空のPostgreSQL 16へのmigration二重適用、application CI、image build、Kustomize render、manifest validationを完了してから配備した。connector設定と巡回jobは追加しなかった。
- **結果**：migration Jobは正常終了し、3個の状態管理table、2個のenum、4件のDrizzle migration記録を確認した。新規tableはすべて0行で、connector通信とcrawlは発生していない。Argo CDは`Synced`かつ`Healthy`になり、Web、API health、worker metricsはHTTP 200を返した。
- **cleanup**：一時的なproduction resourceは作成していない。配備branchはmanifest PRのmerge時に削除した。
- **関連**：application PR #14、manifest PR #135、issue #010。

## 2026-07-25 18:09 JST 共通feed connectorの構造確認と統合試験

- **対象**：少年ジャンプ＋、コミックDAYS、となりのヤングジャンプの公開Atom、公開話HTML、公開作品別RSS、local loopback HTTP server。
- **操作**：3サイトの公開metadata構造をread-onlyで確認し、#011のfixture test、差分checkpoint、画像非取得のHTTP統合試験を実行した。
- **危険性**：外部serviceへ少数のHTTP requestを送り、localの一時TCP portを使用した。
- **保護策**：公開metadataだけを対象にし、認証、非公開endpoint、漫画本文、画像、viewer manifestへアクセスしなかった。各hostへの同時requestを1以下に抑えた。
- **結果**：3サイトが共通のAtom、話HTML、作品別RSS構造を維持していることを確認した。全testは35件成功し、画像requestは0件だった。
- **cleanup**：local HTTP serverをtest終了時に停止した。外部serviceとlocalに永続dataを作成していない。
- **関連**：issue #011。

## 2026-07-25 18:28 JST ニコニコ漫画connectorの構造確認と統合試験

- **対象**：ニコニコ漫画の公開更新一覧、公開公式channel、公開作品ページ、local loopback HTTP server。
- **操作**：一覧、page送り、作成順sort、公式channel breadcrumb、作品名、作者、公開話の現行構造をread-onlyで確認し、#012の透かし巡回とbackfill再開を統合試験した。
- **危険性**：外部serviceへ少数のHTTP requestを送り、localの一時TCP portを使用した。
- **保護策**：公開metadataだけを対象にし、認証、年齢確認、非公開endpoint、漫画本文、画像、viewerへアクセスしなかった。外部HTMLは保存せず、画像を除いた最小fixtureを作成した。
- **結果**：公開一覧が20件単位であること、作成順sortが`manga_created`であること、公式作品のbreadcrumb、1回の作品HTMLに170個の公開話要素がある例を確認した。最小fixtureでは公開45話を欠落なく抽出し、全testは40件成功、画像requestは0件だった。
- **cleanup**：local HTTP serverをtest終了時に停止した。外部serviceとlocalに永続dataを作成していない。
- **関連**：issue #012。

## 2026-07-27 00:44 JST ニコニコ漫画connectorのmergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #17、main CI、GitHub Container Registry image build。
- **操作**：成功済みPR #17をsquash mergeし、main commit `1a6a2e1`のCIとImages workflowを完了まで監視した。
- **危険性**：mainへの変更反映とcontainer image公開により、後続のdeploymentがこの成果物を参照可能になる。
- **保護策**：merge前にPRが`CLEAN`であること、qualityとbuildが成功済みであることを確認し、connectorをproduction source、policy、巡回jobへ接続しない設計を維持した。
- **結果**：PRはsquash mergeされ、mainのCIとImagesがともに成功した。
- **cleanup**：不要になったremote作業branchを削除した。production rolloutとconnector通信は実施していない。
- **関連**：PR #17、issue #012。

## 2026-07-27 カドコミ公開HTMLの構造確認

- **対象**：カドコミの公開トップと公開作品ページ、local connector fixture。
- **操作**：`ax`を使い、公開HTMLの`script#__NEXT_DATA__`、`work`、`firstEpisodes.result`、`latestEpisodes.result`の存在とフィールド構造だけをread-onlyで確認した。`kadocomi.com`への1回のrequestはtimeoutしたため、公開の`comic-walker.com`を代替確認先にした。
- **危険性**：外部serviceへ少数のHTTP requestを送る。
- **保護策**：requestは公開HTMLだけ、キャッシュなし、短時間に限定し、非公開API、漫画本文、画像、viewer、認証付き資源にはアクセスしなかった。
- **結果**：対象scriptが1件存在し、作品code、作者と役割、連載状態、年齢区分、公開話のcode、更新日時、話種別を埋め込みJSONから確認できた。127件fixture、構造変更・抽出件数不整合・未知年齢区分の停止、画像と非公開APIへのrequest 0件を含む全testは45件成功、4件skip、0件失敗だった。
- **cleanup**：外部serviceとlocalに永続dataを作成していない。
- **関連**：issue #013。
