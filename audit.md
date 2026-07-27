# 操作監査ログ

production環境、外部service、Secret、database、永続dataへ影響する操作と、意図的な障害試験を記録する。

Secretの値と個人情報は記録しない。

## 2026-07-27 #047 catalog履歴正規ID解決 GitHub pull request

- **対象**：GitHubの`cp-20/web-comic-library`、branch `agent/047-catalog-history-reconciliation`、pull request、CI、container image build。
- **操作**：検証済みcommitをpushし、main向けdraft PRを作成してCIとImages成功後にsquash mergeする。
- **危険性**：remote branch、PR、mainへの変更反映、container image公開により後続deploymentが参照できる成果物が更新される。
- **保護策**：保護されたmainへ直接pushせず、CI・Images成功とPR差分を確認してからsquash mergeする。production database migration、rollout、外部serviceへの接続を実施しない。Secret、token、個人情報をcommit、PR本文、監査ログへ含めない。
- **結果**：branch `agent/047-catalog-history-reconciliation`へcommit `613ec05`をpushし、PR #49を作成した。PR quality `30230620311`とImages `30230620287`の成功後、main commit `57295bf5bd1259d7c9237994131ad7393c67745a`としてsquash mergeした。main CI `30230742660`とImages `30230742681`はともに成功した。
- **cleanup**：merge後に不要なremote作業branchを削除する。
- **関連**：issue #047。

## 2026-07-27 #047 catalog履歴正規ID解決 PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、catalog redirect、読書・所蔵・通知の匿名test data。
- **操作**：migrationを適用し、作品・話の統合と分割の前後で既読、所蔵、通知履歴を正規IDへ解決する統合試験を実行する。
- **危険性**：local TCP port 55432、Docker container、network、匿名test dataを一時的に使用する。
- **保護策**：production接続情報、実利用者data、Secretを渡さず、repository専用Compose projectだけを使用する。試験後にcontainer、network、volumeを削除する。
- **結果**：migrationの初期適用・再適用、作品・話の統合と分割、既読・所蔵・通知履歴の正規ID解決、通知の再実行時の重複防止を含む125 testsが成功（0 fail）した。
- **cleanup**：`docker compose down --volumes`でtest containerとnetworkを削除した。
- **関連**：issue #047。

## 2026-07-27 #045 database接続待機 local検証

- **対象**：local Docker network、使い捨てPostgreSQL 16 container、`pg_isready` wait command。
- **操作**：databaseなしで同期相当のwaitを開始し、その後にPostgreSQLを起動して接続待機から成功すること、および短いtimeoutで原因が出ることを検証する。
- **危険性**：local Docker container、network、匿名test databaseを一時的に作成する。
- **保護策**：production接続情報を渡さず、ランダムな一時network/container名だけを使用する。test完了後にcontainerとnetworkを削除し、Secret値、個人情報、実database dataを使用しない。
- **結果**：database起動前にDNS未解決の`no response`を3回確認した後、PostgreSQL起動後に`accepting connections`となりwait commandが成功した。timeoutを0秒にした別試行では`timed out waiting 0s for PostgreSQL DNS resolution and connections`を出して失敗した。
- **cleanup**：test containerとnetworkを削除する。
- **関連**：issue #045、manifest PR #136。

## 2026-07-27 #045 database同期Job接続待機 rollout

- **対象**：Asterion production Argo CD、PostgreSQL、`initialize-database` PreSync Job、Web Comic Library migration PreSync Job。
- **操作**：manifest PRをmergeしてArgo CDにbounded `pg_isready` waitを反映し、同期Jobがdatabase接続可能になるまで待機することを確認する。
- **危険性**：Argo CD syncによりproduction Jobが作成され、database初期化・migrationが実行される。timeoutやmanifest不備はrollout停止、Job失敗、alert発火につながり得る。
- **保護策**：PR validate成功と差分を確認してからsquash mergeする。待機は300秒・5秒間隔で上限を持たせ、hookの成功削除policyと既存のbackoffを維持する。Secret値を表示せず、API/worker rollout前にJob状態と短いerrorだけを確認する。
- **結果**：manifest PR #136をmain commit `784fadbac277d5a0dcc621b6db307d1cad949981`としてsquash mergeした。Argo CD applicationは同revisionで`Synced`かつ`Healthy`、operationは`Succeeded`となり、両namespaceにFailed Podはなかった。成功hookは削除policyどおり残っていない。
- **cleanup**：成功hookはArgo CDの`HookSucceeded` policyで削除する。追加したwait container以外のproduction resourceは作成しない。
- **関連**：issue #045、manifest PR #136。

## 2026-07-27 #045 database同期Job manifest確認

- **対象**：Asterion production Argo CD application、PostgreSQL service、Web Comic Libraryの`initialize-database`とmigration Job manifest source。
- **操作**：SSHと`kubectl get`、Argo CD application specをread-onlyで確認し、同期Jobの実際のmanifest repositoryとdatabase接続前提を特定する。
- **危険性**：production control planeへ接続し、誤ったcommandはworkloadや同期状態へ影響し得る。
- **保護策**：read-onlyの`get`と`describe`だけを実行し、Argo CD sync、workload再起動、database接続、Secret参照を行わない。Secret値と個人情報をlog、監査記録へ出さない。
- **結果**：Argo CD applicationのsourceは`cp-20/asterion-manifest`の`web-comic-library/overlays/production`であることを確認した。local checkoutをfast-forwardして`initialize-database`とmigration Jobの現行manifestを確認した。production resourceとdatabaseを変更しなかった。
- **cleanup**：read-only確認後にSSH接続を終了し、production resourceを作成・変更しない。
- **関連**：issue #045。

## 2026-07-27 #043 運用baseline事前確認

- **対象**：Asterion production Kubernetes、Prometheus、PostgreSQL backup metadata、Web Comic Library APIとworkerのread-only health/metrics。
- **操作**：SSHと`kubectl get`、Prometheus read query、PostgreSQLのread-only system viewだけで、連続7日間の観測可能期間、backup状態、restore drill前の比較用件数を確認する。
- **危険性**：production監視・databaseへ接続し、誤ったcommandはworkloadやdataへ影響し得る。
- **保護策**：mutation command、port-forward、alert障害試験、restore、Secret参照を行わない。read-only queryを対象namespaceとsystem viewへ限定し、Secret値・個人情報・認証headerをlogと監査記録へ出さない。
- **結果**：Prometheus serviceとbase backup CronJobは約2日8時間、Web/API/workerは約2日11時間の稼働だった。backup Jobは直近成功を確認したが、連続7日間のbaselineは未達である。production resourceとdatabaseを変更せず、restore drillと意図的なalert試験は実施しなかった。
- **cleanup**：read-only確認後にSSH接続を終了し、production resourceを作成・変更しない。
- **関連**：issue #043。

## 2026-07-27 #040 共通feedお気に入りページ公開構造確認

- **対象**：少年ジャンプ＋、コミックDAYS、となりのヤングジャンプの公開Web pageと、local extension fixture。
- **操作**：`ax`で公開ページだけをread-only確認し、お気に入りpageへの匿名アクセス可否と、作品linkに使える安定した公開URL規則を調べる。
- **危険性**：外部serviceへ少数のHTTP requestを送る。
- **保護策**：認証、Cookie、account情報、内部API、漫画本文、画像、viewerへアクセスしない。ログインが必要な画面は回避せず、公開情報だけで判定する。
- **結果**：各siteの公開トップをread-only確認したが、「お気に入り」への公開導線は検出できなかった。login後の利用者固有DOMにはアクセスせず、公開情報だけではstable selectorを確定できないため、匿名化fixture取得をissue #057へ分離した。
- **cleanup**：read-only確認だけであり、外部serviceとlocalに永続dataを作成しない。
- **関連**：issue #040。

## 2026-07-27 #056 source key解決 GitHub pull request

- **対象**：GitHubの`cp-20/web-comic-library`、branch `agent/056-extension-source-resolution`、pull request、CI、container image build。
- **操作**：検証済みcommitをpushし、main向けdraft PRを作成してCIとImages成功後にsquash mergeする。
- **危険性**：remote branch、PR、mainへの変更反映、container image公開により後続deploymentが参照できる成果物が更新される。
- **保護策**：保護されたmainへ直接pushせず、CI・Images成功とPR差分を確認してからsquash mergeする。production database migration、rollout、外部serviceへの接続を実施しない。Secret、token、個人情報をcommit、PR本文、監査ログへ含めない。
- **結果**：branch `agent/056-extension-source-resolution`へcommit `0254299`をpushし、draft PR #44を作成した。PR #44はmain commit `70d1eb1`としてsquash mergeされ、main CI `30228224407`とImages `30228224457`はともに成功した。
- **cleanup**：merge後に不要なremote作業branchを削除する。
- **関連**：issue #056。

## 2026-07-27 #056 source key解決 PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、catalog source、source policy revision、extension favorite import source key解決。
- **操作**：migrationを再適用し、許可済みsource keyのUUID解決、未登録keyの拒否、緊急停止後の拒否を統合試験する。
- **危険性**：localのTCP port 55432、Docker container、network、匿名test dataを一時的に使用する。
- **保護策**：production接続情報を渡さず、repository専用Compose projectだけを使用する。extension token、Cookie、個人情報をlog、fixture、監査ログへ記録しない。
- **結果**：migrationの初期適用・再適用、許可済みsource keyのUUID解決、未登録keyの拒否、緊急停止後の拒否を含む124 testsが成功（0 fail）した。
- **cleanup**：試験後に`docker compose down --volumes`でtest container、network、volumeを削除する。
- **関連**：issue #056。

## 2026-07-27 #039 GitHub pull request

- **対象**：GitHubの`cp-20/web-comic-library`、#039実装branch、pull request、CI、container image build。
- **操作**：検証済みcommitをpushし、draft PRを作成してCIとImages成功後にsquash mergeする。
- **危険性**：remote branch、PR、mainへの変更反映、container image公開により後続deploymentが参照できる成果物が更新される。
- **保護策**：保護されたmainへ直接pushせず、CI・Images成功とPR差分を確認してからsquash mergeする。Secret、token、個人情報をcommit、PR本文、監査ログへ含めない。
- **結果**：branch `agent/039-favorites-import-workflow`へcommit `d5a0caf`をpushし、draft PR #41を作成した。PR #41はmain commit `1dca840`としてsquash mergeされ、main CI `30226856899`とImages `30226856896`はともに成功した。
- **cleanup**：merge後に作業branchを削除する。
- **関連**：issue #039。

## 2026-07-27 #039 favorite import PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、favorite import migration、library/follow transaction。
- **操作**：migrationを再適用し、完全一致・曖昧・未照合、batch所有者、単回適用、library/followの同一transaction反映を統合試験する。
- **危険性**：local TCP port 55432、Docker container、network、匿名test dataを一時的に使用する。
- **保護策**：production接続情報を渡さず、repository専用Compose projectだけを使用する。token、Cookie、個人情報をlog、fixture、監査ログへ記録しない。
- **結果**：migrationの初期適用・再適用、完全一致・曖昧・未照合のsnapshot、batch単回適用、library/followのtransaction反映を含む123 testsが成功（0 fail）した。
- **cleanup**：`docker compose down --volumes`でtest containerとnetworkを削除した。
- **関連**：issue #039。

## 2026-07-27 #038 extension pairing PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、extension pairing migration、pairing codeと限定scope token。
- **操作**：migrationを再適用し、5分期限・単回交換・token hash保存・所有者限定失効を統合試験する。
- **危険性**：localのTCP port 55432、Docker container、network、test dataを一時的に使用する。
- **保護策**：production接続情報を渡さず、repository専用Compose projectだけを使用する。tokenの平文をlog、fixture、監査ログへ記録しない。
- **結果**：migrationを初期状態から適用・再適用し、pairing codeの単回使用、5分期限、token hashのみの保存、所有者限定の失効を含む120 testsが成功（0 fail）した。Chrome/Firefox MV3のextension buildとzip、生成manifestの最小権限検査も成功した。
- **cleanup**：`docker compose down --volumes`でtest containerとnetworkを削除した。
- **関連**：issue #038。

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

## 2026-07-27 01:07 JST カドコミconnectorのmergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #18、main CI、GitHub Container Registry image build。
- **操作**：成功済みPR #18をsquash mergeし、main commit `cb9669b`のCIとImages workflowを完了まで監視した。
- **危険性**：mainへの変更反映とcontainer image公開により、後続のdeploymentがこの成果物を参照可能になる。
- **保護策**：merge前にPRが`CLEAN`であること、qualityとbuildが成功済みであることを確認し、connectorをproduction source、policy、巡回jobへ接続しない設計を維持した。
- **結果**：PRはsquash mergeされ、mainのCIとImagesがともに成功した。
- **cleanup**：不要になったremote作業branchを削除した。production rolloutとconnector通信は実施していない。
- **関連**：PR #18、issue #013。

## 2026-07-27 #014 ingestion PostgreSQL統合試験

- **対象**：local Docker ComposeのPostgreSQL 16 test database、local loopback HTTP server。
- **操作**：#014 migrationを2回適用し、候補保存、release event、初回通知抑止、媒体横断の一対一話mapping、重複再処理、transaction rollbackを統合試験した。
- **危険性**：localのTCP port 55432、Docker container、network、test dataを一時的に使用する。
- **保護策**：production接続情報を渡さず、repository専用Compose projectを使用した。外部serviceとproduction databaseには接続していない。
- **結果**：55 testが成功し、migrationの再適用も成功した。保存失敗後もcheckpointは進まず、初回eventは通知抑止、incremental eventは通知対象として保存された。
- **cleanup**：test終了後にcontainer、network、匿名volumeを削除する。
- **関連**：issue #014。

## 2026-07-27 01:29 JST #014 ingestion mergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #19、main CI、GitHub Container Registry image build。
- **操作**：成功済みPR #19をsquash mergeし、main commit `3b0f0b4e83ec4e787ad105ac0f4c41b65977d9`のCIとImages workflowを完了まで監視した。
- **危険性**：mainへの変更反映とcontainer image公開により、後続のdeploymentがこの成果物を参照可能になる。
- **保護策**：merge前にPRが`CLEAN`であること、qualityとbuildが成功済みであることを確認した。migrationはlocal統合試験で2回適用を確認済みであり、production rolloutは実施していない。
- **結果**：PRはsquash mergeされ、mainのCIとImagesがともに成功した。
- **cleanup**：不要になったremote作業branchを削除した。production databaseへのmigration、rollout、connector通信は実施していない。
- **関連**：PR #19、issue #014。

## 2026-07-27 #015 catalog管理 PostgreSQL統合試験

- **対象**：local Docker ComposeのPostgreSQL 16 test database。
- **操作**：#015 migrationを2回適用し、作品・話の統合と分割、旧ID redirect、操作監査、解析失敗review queue、Hono RPCの認可とvalidationを統合試験した。
- **危険性**：localのTCP port 55432、Docker container、network、test dataを一時的に使用した。clean databaseを得るためrepository専用test volumeを削除した。
- **保護策**：production接続情報を渡さず、repository専用Compose projectだけを対象にした。外部service、production database、永続user dataへ接続していない。
- **結果**：migrationの再適用を含め61 testが成功した。統合・分割は同一transactionで完了し、旧ID redirect、監査履歴、解析失敗queue、未認証401・一般利用者403・不正入力400を確認した。
- **cleanup**：container、network、test volumeを削除した。
- **関連**：issue #015。

## 2026-07-27 02:02 JST #015 catalog管理 mergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #20、main CI、GitHub Container Registry image build。
- **操作**：成功済みPR #20をsquash mergeし、main commit `cea421dd5f86a18071c2f67b82f4b404128ec90a`のCIとImages workflowを完了まで監視した。
- **危険性**：mainへの変更反映とcontainer image公開により、後続のdeploymentがこの成果物を参照可能になる。
- **保護策**：merge前にPRが`CLEAN`であること、qualityとbuildが成功済みであることを確認した。migrationはlocal PostgreSQL統合試験で2回適用を確認済みであり、production rolloutは実施していない。
- **結果**：PRはsquash mergeされ、mainのCIとImagesがともに成功した。
- **cleanup**：不要になったremote作業branchを削除した。production databaseへのmigrationとrolloutは実施していない。
- **関連**：PR #20、issue #015。

## 2026-07-27 #016 書誌provider公開API構造確認

- **対象**：openBDの公開`/v1/get?isbn=` endpoint、国立国会図書館サーチの公開SRU endpoint。
- **操作**：公開ISBN 2件について、read-onlyのJSONおよびDC-NDL XML検索responseと、各providerの公開API仕様・利用条件を確認した。
- **危険性**：外部serviceへ少数のHTTP requestを送る。
- **保護策**：公開metadata endpointだけを各providerへ2回ずつ短時間に照会し、認証、書影、本文、非公開endpointへはアクセスしなかった。responseをrepositoryへ保存していない。
- **結果**：openBDは未収録を`[null]`で、NDL SRUは該当なしをdiagnostic XMLで返した。adapterではこれらを例外にせず、補完不能または削除候補のprovider結果として扱う。
- **cleanup**：外部serviceとlocalに永続dataを作成していない。
- **関連**：issue #016。

## 2026-07-27 #016 書誌同期 PostgreSQL統合試験

- **対象**：local Docker ComposeのPostgreSQL 16 test database、#016 migration、書誌同期repository。
- **操作**：migrationを2回適用し、openBD・NDLのfield provenance、ISBN収録率、初回通知抑止、再同期、新刊eventの冪等性、削除検知、巻と話の同一作品mapping制約を統合試験した。
- **危険性**：localのTCP port 55432、Docker container、network、test dataを一時的に使用した。
- **保護策**：production接続情報を渡さず、repository専用Compose projectだけを対象にした。外部provider、production database、永続user dataへ接続していない。
- **結果**：migration再適用を含む69 testが成功した。書誌削除は`withdrawn`へ更新され、初回eventは通知抑止、同一ISBNと出版社商品IDの再同期ではeventを重複作成しないことを確認した。
- **cleanup**：検証後にcontainer、network、test volumeを削除した。
- **関連**：issue #016。

## 2026-07-27 #016 書誌同期 GitHub pull request作成

- **対象**：GitHubの`cp-20/web-comic-library`、作業branch `agent/016-bibliography`、draft PR #21。
- **操作**：検証済みcommit `02fc07c`を作業branchへpushし、main向けdraft PRを作成した。
- **危険性**：GitHub上の共有branchとPRへ変更を公開し、CIとcontainer image workflowの実行対象になる。
- **保護策**：push前に`bun run check`、`bun test`、local PostgreSQL統合試験を成功させ、production rolloutと書誌providerの巡回job投入は行っていない。
- **結果**：PR #21を作成した。CI結果を確認後、merge可否を判断する。
- **cleanup**：不要になったremote作業branchはmerge確認後に削除する。production databaseと外部providerの永続dataは変更していない。
- **関連**：PR #21、issue #016。

## 2026-07-27 #016 書誌同期 mergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #21、main commit `8ba7236f7e8dd4aeda3b21020875b9c180d85277`、CI、Images workflow。
- **操作**：qualityとbuild成功後にPR #21をsquash mergeし、mainのCIとImages workflowを完了まで監視した。
- **危険性**：mainへの変更反映とcontainer image公開により、後続のdeploymentがこの成果物を参照可能になる。
- **保護策**：merge前にPRが`CLEAN`であること、qualityとbuildが成功したことを確認した。production database migration、rollout、書誌providerの巡回job投入は実施していない。
- **結果**：main CIは成功し、Images workflowもread-only検査とGHCR image pushを成功した。
- **cleanup**：remote作業branchはPR merge時に削除した。production databaseと外部providerの永続dataは変更していない。
- **関連**：PR #21、issue #016。

## 2026-07-27 #020 identity PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、#020 identity migration、profile/session adapter。
- **操作**：migrationを2回適用し、未設定profileの非公開、follower限定公開、有効session、disabled account sessionを統合試験した。
- **危険性**：localのTCP port 55432、Docker container、network、test dataを一時的に使用した。
- **保護策**：production接続情報を渡さず、repository専用Compose projectのみを使用した。Google OAuth、メール送信、R2、production databaseには接続していない。
- **結果**：83 testが成功し、migration再適用、未設定profileの非公開、follower限定公開、有効・disabled accountのsession identityを確認した。
- **cleanup**：検証後にcontainer、network、test volumeを削除した。
- **関連**：issue #020。

## 2026-07-27 #020 identity GitHub pull request作成

- **対象**：GitHubの`cp-20/web-comic-library`、作業branch `agent/020-identity-profile-privacy`、draft PR #22。
- **操作**：検証済みcommit `32545bf`を作業branchへpushし、main向けdraft PRを作成した。
- **危険性**：GitHub上の共有branchとPRへ変更を公開し、CIとcontainer image workflowの実行対象になる。
- **保護策**：push前に`bun run check`、`bun test`、`bun run test:integration`、`bun run build:web`を成功させ、production database migration、OAuth、メール送信、R2 upload、rolloutを実施していない。
- **結果**：PR #22を作成した。CI結果を確認後にmerge可否を判断する。
- **cleanup**：不要になったremote作業branchはmerge確認後に削除する。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #22、issue #020。

## 2026-07-27 #020 CI container smoke test修正

- **対象**：GitHubのPR #22、Images workflow、API container smoke test。
- **操作**：失敗logからAPIの必須auth環境変数がImagesとcompatibilityのcontainerへ渡っていないことを確認し、両workflowのtest専用設定をAPI containerへ明示的に渡すよう修正した。
- **危険性**：再実行したImages workflowはPR branchのcontainer imageをGHCRへ公開する可能性がある。
- **保護策**：production用Secretを追加せず、test専用の非機密値だけをworkflowに置いた。OAuth、メール送信、R2 upload、production database migration、rolloutは実施していない。
- **結果**：localの`bun run check`と`bun test`、test専用設定を渡したcompatibility imageのsmoke testが成功した。修正commitをpush後、CIを再確認する。
- **cleanup**：local PostgreSQLのcontainer、network、test volumeを削除した。PR merge後にremote作業branchを削除する。外部serviceの永続dataは変更していない。
- **関連**：PR #22、issue #020。

## 2026-07-27 #020 identity mergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #22、main commit `9d51e7ab511979a89e72de2bbd461839da9b9472`、CI、Images workflow。
- **操作**：qualityとbuild成功後にPR #22をsquash mergeし、mainのCIとImages workflowを完了まで監視した。
- **危険性**：mainへの変更反映とcontainer image公開により、後続のdeploymentがこの成果物を参照可能になる。
- **保護策**：merge前にPRが`CLEAN`であること、qualityとbuildが成功したことを確認した。production database migration、OAuth、メール送信、R2 upload、rolloutを実施していない。
- **結果**：main CIとImages workflowはいずれも成功した。ImagesのCI smoke testはtest専用設定でAPIを起動し、外部認証・メール・R2へ接続していない。
- **cleanup**：PR merge時にremote作業branchを削除した。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #22、issue #020。

## 2026-07-27 #021 library PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、#021 library migration、read-record adapter。
- **操作**：migrationを2回適用し、読書状態履歴、confirmed mappingだけの掲載ページ既読反映、既読取消を統合試験した。
- **危険性**：localのTCP port 55432、Docker container、network、test dataを一時的に使用した。
- **保護策**：production接続情報を渡さず、repository専用Compose projectのみを使用した。OAuth、メール送信、R2、production databaseには接続していない。
- **結果**：88 testが成功し、#021の多対多mappingと既読取消を確認した。
- **cleanup**：container、network、test volumeを削除した。
- **関連**：issue #021。

## 2026-07-27 #021 library GitHub pull request作成

- **対象**：GitHubの`cp-20/web-comic-library`、作業branch `agent/021-reading-state-web-progress`、draft PR #23。
- **操作**：検証済みcommit `b91cba8`を作業branchへpushし、main向けdraft PRを作成した。
- **危険性**：GitHub上の共有branchとPRへ変更を公開し、CIとcontainer image workflowの実行対象になる。
- **保護策**：push前に`bun run check`、`bun test`、`bun run test:integration`、`bun run build:web`を成功させ、production database migration、rollout、外部serviceへの接続を実施していない。
- **結果**：PR #23を作成した。CI結果を確認後にmerge可否を判断する。
- **cleanup**：不要になったremote作業branchはmerge確認後に削除する。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #23、issue #021。

## 2026-07-27 #021 library mergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #23、main commit `8140821c39e5212441658892623b05feeb2931a6`、CI、Images workflow。
- **操作**：qualityとbuild成功後にPR #23をsquash mergeし、mainのCIとImages workflowを完了まで監視した。
- **危険性**：mainへの変更反映とcontainer image公開により、後続のdeploymentがこの成果物を参照可能になる。
- **保護策**：merge前にPRが`CLEAN`であること、qualityとbuildが成功したことを確認した。production database migration、rollout、外部serviceへの接続を実施していない。
- **結果**：main CIとImages workflowはいずれも成功した。
- **cleanup**：PR merge時にremote作業branchを削除した。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #23、issue #021。

## 2026-07-27 #017 catalog search PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、#017 catalog search migration、公開catalog query。
- **操作**：migrationを2回適用し、NFKC検索、title・別名・作者名・短いtitle、filter、公開範囲、popular順を統合試験する。
- **危険性**：localのTCP port 55432、Docker container、network、test dataを一時的に使用する。
- **保護策**：production接続情報を渡さず、repository専用Compose projectだけを使用する。外部service、production database、永続user dataへ接続しない。
- **結果**：migration再適用を含む90 testが成功した。NFKCのtitle・別名・作者名・短いtitle検索、同名作品、filter、公開範囲を確認した。
- **cleanup**：container、network、test volumeを削除した。
- **関連**：issue #017。

## 2026-07-27 #017 catalog search GitHub pull request作成

- **対象**：GitHubの`cp-20/web-comic-library`、作業branch `agent/017-catalog-search-web`、draft PR #24。
- **操作**：検証済みcommit `d97a6a1`を作業branchへpushし、main向けdraft PRを作成した。
- **危険性**：GitHub上の共有branchとPRへ変更を公開し、CIとcontainer image workflowの実行対象になる。
- **保護策**：push前に`bun run check`、`bun test`、`bun run test:integration`、`bun run build:web`を成功させた。production database migration、rollout、外部serviceへの接続を実施していない。
- **結果**：PR #24を作成した。CI結果を確認後にmerge可否を判断する。
- **cleanup**：不要になったremote作業branchはmerge確認後に削除する。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #24、issue #017。

## 2026-07-27 #017 catalog search mergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #24、main commit `bf1ba499cbf3dc7e75916cc09bd3da4ee9248d8b`、CI、Images workflow。
- **操作**：qualityとImages workflow成功後にPR #24をsquash mergeし、mainのCIとImages workflowを完了まで監視した。
- **危険性**：mainへの変更反映とcontainer image公開により、後続のdeploymentがこの成果物を参照可能になる。
- **保護策**：merge前にPRが`CLEAN`であること、CIのqualityとImagesが成功したことを確認した。production database migration、rollout、外部serviceへの接続を実施していない。
- **結果**：main CIとImages workflowはいずれも成功した。
- **cleanup**：PR merge時にremote作業branchを削除した。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #24、issue #017。

## 2026-07-27 #022 follow設定 PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、#022 follow設定migration、設定adapter。
- **操作**：migrationを2回適用し、利用者単位の掲載先優先順位、作品ごとのfollow方式、掲載先指定を統合試験する。
- **危険性**：localのTCP port 55432、Docker container、network、test dataを一時的に使用する。
- **保護策**：production接続情報を渡さず、repository専用Compose projectだけを使用する。外部service、production database、永続user dataへ接続しない。
- **結果**：migration再適用を含む94 testが成功した。優先順位の0始まり、作品ごとの方式、掲載先指定、foreign key制約を確認した。
- **cleanup**：container、network、test volumeを削除した。
- **関連**：issue #022。

## 2026-07-27 #022 follow設定 GitHub pull request作成

- **対象**：GitHubの`cp-20/web-comic-library`、作業branch `agent/022-source-preferences-follow-modes`、draft PR #25。
- **操作**：検証済みcommit `ad2e6b2`を作業branchへpushし、main向けdraft PRを作成した。
- **危険性**：GitHub上の共有branchとPRへ変更を公開し、CIとcontainer image workflowの実行対象になる。
- **保護策**：push前に`bun run check`、`bun test`、`bun run test:integration`、`bun run build:web`を成功させた。production database migration、rollout、外部serviceへの接続を実施していない。
- **結果**：PR #25を作成した。CI結果を確認後にmerge可否を判断する。
- **cleanup**：不要になったremote作業branchはmerge確認後に削除する。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #25、issue #022。

## 2026-07-27 #022 follow設定 mergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #25、main commit `f47a7df0c0b418dd5272d70b3ed7c21d7e80c27e`、CI、Images workflow。
- **操作**：qualityとImages workflow成功後にPR #25をsquash mergeし、mainのCIとImages workflowを完了まで監視した。
- **危険性**：mainへの変更反映とcontainer image公開により、後続のdeploymentがこの成果物を参照可能になる。
- **保護策**：merge前にPRが`CLEAN`であること、CIとImagesが成功したことを確認した。production database migration、rollout、外部serviceへの接続を実施していない。
- **結果**：main CIとImages workflowはいずれも成功した。
- **cleanup**：PR merge時にremote作業branchを削除した。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #25、issue #022。

## 2026-07-27 #023 単行本library PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、#023 volume library migration、巻記録adapter。
- **操作**：migrationを2回適用し、巻の読書状態、紙・電子所蔵、個人memo、confirmed mappingだけのWeb話既読反映、取消後のWeb話既読保持、修正候補queue登録を統合試験する。
- **危険性**：localのTCP port 55432、Docker container、network、test dataを一時的に使用する。
- **保護策**：production接続情報を渡さず、repository専用Compose projectだけを使用する。外部service、production database、永続user dataへ接続しない。
- **結果**：migration再適用を含む100 testが成功した。紙・電子の独立保存、mappingなしの巻記録、confirmed mappingだけのWeb話既読反映、巻の既読取消後のWeb話既読保持、修正候補のqueue登録を確認した。
- **cleanup**：container、network、test volumeを削除した。
- **関連**：issue #023。

## 2026-07-27 #023 単行本library GitHub pull request作成

- **対象**：GitHubの`cp-20/web-comic-library`、作業branch `agent/023-volume-records-mapping`、draft PR #26。
- **操作**：検証済みcommit `f4db728`を作業branchへpushし、main向けdraft PRを作成した。
- **危険性**：GitHub上の共有branchとPRへ変更を公開し、CIとcontainer image workflowの実行対象になる。
- **保護策**：push前に`bun run check`、`bun test`、`bun run test:integration`、`bun run build:web`を成功させた。production database migration、rollout、外部serviceへの接続を実施していない。
- **結果**：PR #26を作成した。CI結果を確認後にmerge可否を判断する。
- **cleanup**：不要になったremote作業branchはmerge確認後に削除する。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #26、issue #023。

## 2026-07-27 #023 単行本library mergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #26、main commit `f77aaf69c6382b66f8f641939355e41574f21c45`、CI、Images workflow。
- **操作**：qualityとImages workflow成功後にPR #26をsquash mergeし、mainのCIとImages workflowを完了まで監視した。
- **危険性**：mainへの変更反映とcontainer image公開により、後続のdeploymentがこの成果物を参照可能になる。
- **保護策**：merge前にPRが`CLEAN`であること、CIとImagesが成功したことを確認した。production database migration、rollout、外部serviceへの接続を実施していない。
- **結果**：main CIとImages workflowはいずれも成功した。
- **cleanup**：PR merge時にremote作業branchを削除した。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #26、issue #023。

## 2026-07-27 #025 アプリ内通知 PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、#025 notification migration、通知consumer。
- **操作**：migrationを2回適用し、follow選択、通知設定、冪等生成、一覧pagination、個別・一括既読を統合試験する。CIで検出したworker終了確認も同じtest databaseで互換性smoke testする。
- **危険性**：localのTCP port 55432、Docker container、network、test dataを一時的に使用する。
- **保護策**：production接続情報を渡さず、repository専用Compose projectだけを使用する。外部service、production database、永続user dataへ接続しない。
- **結果**：migrationを2回適用し、通知storageとconsumerを含む105 testsが成功（0 fail）した。通知は冪等生成され、既読操作は所有者に限定されることを確認した。workerが通知処理後のDB接続を閉じてSIGTERMで終了することも互換性smoke testで確認した。
- **cleanup**：`docker compose down --volumes`でtest container、network、test volumeを削除した。
- **関連**：issue #025。

## 2026-07-27 #025 アプリ内通知 PR作成

- **対象**：GitHubの`cp-20/web-comic-library`、branch `agent/025-in-app-notifications`、PR #27。
- **操作**：検証済みの通知実装をpushし、ドラフトPR #27を作成してCIを開始した。
- **危険性**：GitHub上の共有branchとPRへ変更を公開し、CIとcontainer image workflowの実行対象になる。
- **保護策**：push前に`bun run check`、`bun test`、`bun run test:integration`、`bun run build:web`を成功させた。production database migration、rollout、外部serviceへの接続を実施していない。
- **結果**：PR #27を作成した。CI結果を確認後にmerge可否を判断する。
- **cleanup**：不要になったremote作業branchはmerge確認後に削除する。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #27、issue #025。

## 2026-07-27 #025 アプリ内通知 mergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #27、main commit `9eea605a1978c918c11a698ec76ddd8d5d1f963c`、CI、Images workflow。
- **操作**：qualityとImages workflow成功後にPR #27をsquash mergeし、mainのCIとImages workflowを完了まで監視した。
- **危険性**：mainへの変更反映とcontainer image公開により、後続のdeploymentがこの成果物を参照可能になる。
- **保護策**：merge前にPRが`CLEAN`であること、CIとImagesが成功したことを確認した。production database migration、rollout、外部serviceへの接続を実施していない。
- **結果**：main CIとImages workflowはいずれも成功した。
- **cleanup**：PR merge時にremote作業branchを削除した。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #27、issue #025。

## 2026-07-27 #026 Web Push PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、#026 Web Push migration、subscriptionとdelivery処理。
- **操作**：migrationの再適用、subscription登録、通知・subscription単位のdelivery冪等化、恒久失敗時のsubscription無効化を統合試験する。
- **危険性**：localのTCP port 55432、Docker container、network、test dataを一時的に使用する。
- **保護策**：production接続情報を渡さず、repository専用Compose projectだけを使用する。外部Push service、production database、永続user dataへ接続しない。
- **結果**：migrationを再適用し、Web Push subscription、delivery冪等化、恒久失敗時の無効化を含む109 testsが成功（0 fail）した。
- **cleanup**：`docker compose down --volumes`でtest container、network、test volumeを削除する。
- **関連**：issue #026。

## 2026-07-27 #026 Web Push/PWA PR作成

- **対象**：GitHubの`cp-20/web-comic-library`、branch `agent/026-web-push-pwa`、PR #28。
- **操作**：検証済みのWeb Push/PWA実装をpushし、ドラフトPR #28を作成してCIを開始した。
- **危険性**：GitHub上の共有branchとPRへ変更を公開し、CIとcontainer image workflowの実行対象になる。
- **保護策**：push前に`bun run check`、`bun test`、`bun run test:integration`、`bun run build:web`を成功させた。production database migration、rollout、外部Push serviceへの接続を実施していない。
- **結果**：PR #28を作成した。CI結果を確認後にmerge可否を判断する。
- **cleanup**：不要になったremote作業branchはmerge確認後に削除する。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #28、issue #026。

## 2026-07-27 #026 Web Push/PWA mergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #28、main commit `751189400cf70cdaa2ec4257cc652df5ac2f2412`、CI、Images workflow。
- **操作**：qualityとImages workflow成功後にPR #28をsquash mergeし、mainのCIとImages workflowを完了まで監視した。
- **危険性**：mainへの変更反映とcontainer image公開により、後続のdeploymentがこの成果物を参照可能になる。
- **保護策**：merge前にPRが`CLEAN`であること、CIとImagesが成功したことを確認した。production database migration、rollout、外部Push serviceへの接続を実施していない。
- **結果**：main CIとImages workflowはいずれも成功した。
- **cleanup**：PR merge時にremote作業branchを削除した。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #28、issue #026。

## 2026-07-27 #027 email digest PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、#027 email digest migration、設定とdelivery adapter。
- **操作**：migrationの再適用、timezoneの日付境界、日次digestの冪等化、unsubscribe後の作成停止を統合試験する。
- **危険性**：localのTCP port 55432、Docker container、network、test dataを一時的に使用する。
- **保護策**：production接続情報を渡さず、repository専用Compose projectだけを使用する。外部メールservice、production database、永続user dataへ接続しない。
- **結果**：migrationを初期状態から適用・再適用し、timezoneの日付境界、日次digestの冪等化、unsubscribe後の作成停止、既存通知・worker統合を含む117 testsが成功（0 fail）した。外部メールserviceへの送信はしていない。
- **cleanup**：`docker compose down --volumes`でtest container、network、test volumeを削除した。
- **関連**：issue #027。

## 2026-07-27 #027 email digest PR作成

- **対象**：GitHubの`cp-20/web-comic-library`、branch `agent/027-email-digest`。
- **操作**：検証済みcommitをpushし、main向けdraft PRを作成してCIを開始する。
- **危険性**：GitHub上の共有branchとPRへ変更を公開し、CIとcontainer image workflowの実行対象になる。
- **保護策**：push前に`bun run check`、`bun test`、`bun run test:integration`、`bun run build:web`を成功させた。production database migration、rollout、外部メールserviceへの接続を実施していない。
- **結果**：draft PR #29を作成し、CIを開始した。CI結果を確認後にmerge可否を判断する。
- **cleanup**：不要になったremote作業branchはmerge確認後に削除する。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #29、issue #027。

## 2026-07-27 #050 ヤンマガWeb policy確認

- **対象**：ヤンマガWebの公開Webページ、利用規約、robots.txt、公式の公開情報。
- **操作**：connector実装可否を判断するため、公開情報だけをread-onlyで確認する。
- **危険性**：外部Web serviceへのrequestが発生し、利用条件を誤読すると不適切な自動取得につながる可能性がある。
- **保護策**：漫画本文、画像、認証が必要なresource、非公開APIへアクセスしない。明示的な収集許可を確認できない場合はconnectorを実装せずfail closedとする。
- **結果**：公式[利用規約](https://yanmaga.jp/term)が自動化されたbot、robot、crawler、spider、scraper等によるアクセスとコンテンツの収集・処理を明示的に禁止していることを確認した。収集を実装せず、issue #050をblockedとした。
- **cleanup**：read-only確認だけであり、外部service、production、永続dataを変更しない。
- **関連**：issue #050。

## 2026-07-27 #051 サンデーうぇぶり policy確認

- **対象**：サンデーうぇぶりの公開Webページ、利用規約、robots.txt、公式の公開情報。
- **操作**：connector実装可否を判断するため、公開情報だけをread-onlyで確認する。
- **危険性**：外部Web serviceへのrequestが発生し、利用条件を誤読すると不適切な自動取得につながる可能性がある。
- **保護策**：漫画本文、画像、認証が必要なresource、非公開APIへアクセスしない。明示的な収集許可を確認できない場合はconnectorを実装せずfail closedとする。
- **結果**：公式[利用規約](https://blog.www.sunday-webry.com/terms_of_service)で本サービスおよび本コンテンツの複製が禁止されていることを確認した。公開metadataの自動収集を明示許可するfeed、API、または条件は確認できず、`https://www.sunday-webry.com/robots.txt`は404だった。robots.txtは許可根拠にしないため、fail closedでconnectorを実装せずissue #051をblockedとした。判定を含むPR #34はsquash mergeし、mainのCIとImages workflowは成功した。
- **cleanup**：read-only確認だけであり、外部service、production、永続dataを変更しない。
- **関連**：issue #051、PR #34。

## 2026-07-27 #052 マガポケ policy確認

- **対象**：マガポケの公開Webページ、利用規約、robots.txt、公式の公開情報。
- **操作**：connector実装可否を判断するため、公開情報だけをread-onlyで確認する。
- **危険性**：外部Web serviceへのrequestが発生し、利用条件を誤読すると不適切な自動取得につながる可能性がある。
- **保護策**：漫画本文、画像、認証が必要なresource、非公開APIへアクセスしない。明示的な収集許可を確認できない場合はconnectorを実装せずfail closedとする。
- **結果**：公式の[利用規約改定告知](https://pocket.shonenmagazine.com/article/entry/2026/06/03)が、情報収集ボット、ロボット、クローラ、スパイダー、スクレーパーなどの自動化手段によるアクセスとコンテンツの収集・処理を明示的に禁止していることを確認した。[robots.txt](https://pocket.shonenmagazine.com/robots.txt)は`Allow: /`だが、利用規約の禁止を上書きする許可根拠にはしない。fail closedでconnectorを実装せずissue #052をblockedとした。判定を含むPR #35はsquash mergeし、mainのCIとImages workflowは成功した。
- **cleanup**：read-only確認だけであり、外部service、production、永続dataを変更しない。
- **関連**：issue #052、PR #35。

## 2026-07-27 #053 ガンガンONLINE policy確認

- **対象**：ガンガンONLINEの公開Webページ、利用規約、robots.txt、公式の公開情報。
- **操作**：connector実装可否を判断するため、公開情報だけをread-onlyで確認する。
- **危険性**：外部Web serviceへのrequestが発生し、利用条件を誤読すると不適切な自動取得につながる可能性がある。
- **保護策**：漫画本文、画像、認証が必要なresource、非公開APIへアクセスしない。明示的な収集許可を確認できない場合はconnectorを実装せずfail closedとする。
- **結果**：公式の[サービス案内](https://support.jp.square-enix.com/faqarticle.php?c=16&id=10241&kid=75230&la=0&ret=faqtop&sc=0)を確認したが、公開metadataの自動収集を明示許可するfeed、API、または条件は確認できなかった。`https://www.ganganonline.com/robots.txt`は404であり、robots.txtは許可根拠にしない。fail closedでconnectorを実装せずissue #053をblockedとした。判定を含むPR #36はsquash mergeし、mainのCIとImages workflowは成功した。
- **cleanup**：read-only確認だけであり、外部service、production、永続dataを変更しない。
- **関連**：issue #053、PR #36。

## 2026-07-27 #054 アルファポリス policy確認

- **対象**：アルファポリスの公開Webページ、利用規約、robots.txt、公式の公開情報。
- **操作**：connector実装可否を判断するため、公開情報だけをread-onlyで確認する。
- **危険性**：外部Web serviceへのrequestが発生し、利用条件を誤読すると不適切な自動取得につながる可能性がある。
- **保護策**：漫画本文、画像、認証が必要なresource、非公開APIへアクセスしない。明示的な収集許可を確認できない場合はconnectorを実装せずfail closedとする。
- **結果**：公式の[利用規約](https://www.alphapolis.co.jp/pages/terms_of_service)で配信コンテンツの複製その他の利用が禁止されていることを確認した。公開metadataの自動収集を明示許可するfeed、API、または条件は確認できず、[robots.txt](https://www.alphapolis.co.jp/robots.txt)の許可は利用規約を上書きする許可根拠にしない。fail closedでconnectorを実装せずissue #054をblockedとした。判定を含むPR #37はsquash mergeし、mainのCIとImages workflowは成功した。
- **cleanup**：read-only確認だけであり、外部service、production、永続dataを変更しない。
- **関連**：issue #054、PR #37。

## 2026-07-27 #027 email digest mergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #29、main commit `75bf3bcbf78e300fc5523d23dbacb0e2b0d524c1`、CI、Images workflow。
- **操作**：qualityとImages workflow成功後にPR #29をsquash mergeし、mainのCIとImages workflowを完了まで監視した。
- **危険性**：mainへの変更反映とcontainer image公開により、後続のdeploymentがこの成果物を参照可能になる。
- **保護策**：merge前にPRが`CLEAN`であること、CIとImagesが成功したことを確認した。production database migration、rollout、外部メールserviceへの接続を実施していない。
- **結果**：main CIとImages workflowはいずれも成功した。
- **cleanup**：PR merge時にremote作業branchを削除した。production databaseと外部serviceの永続dataは変更していない。
- **関連**：PR #29、issue #027。

## 2026-07-27 #059 session assurance PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、#059 identity/TOTP migration、session assurance query。
- **操作**：migrationを初期状態から適用・再適用し、通常session、TOTP verification後のassurance、assurance期限、session削除時のcascadeを統合試験する。
- **危険性**：localのTCP port 55432、Docker container、network、test dataを一時的に使用する。
- **保護策**：production接続情報を渡さず、repository専用Compose projectだけを使用する。TOTP secret、backup code、session tokenを出力・保存・監査記録しない。外部service、production database、永続user dataへ接続しない。
- **結果**：migrationを初期状態から適用・再適用し、magic link session、実TOTP enrollment・verification、署名cookieのadapter検証、session assurance保存、期限切れ時の非強認証化、session削除時のcascadeを確認した。PostgreSQL統合を含む128 testsが成功（0 fail）し、`bun run check`、通常test、Web buildも成功した。
- **cleanup**：`docker compose down --volumes`でtest container、network、test volumeを削除した。
- **関連**：issue #059。

## 2026-07-27 #059 session assurance PR作成

- **対象**：GitHubの`cp-20/web-comic-library`、branch `agent/059-session-assurance`、PR #54。
- **操作**：#059の実装commitをGitHubへpushし、ドラフトPRを作成してCI検証を開始した。
- **危険性**：外部GitHub上に変更内容が公開され、CIが実行される。
- **保護策**：production、Secret、database、外部認証serviceの変更を伴わない実装だけを含め、PRをドラフトとして作成した。CI成功とreview可能な差分を確認するまでmainへmergeしない。
- **結果**：PR #54を作成し、CI検証を開始した。
- **cleanup**：remote branchはmerge完了時に削除する。production環境と永続dataは変更していない。
- **関連**：issue #059、PR #54。

## 2026-07-27 #059 session assurance mergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #54、main commit `b2a150c33c45cfb213a51245a2a9fec9ea5db878`、CI、Images workflow、GHCR。
- **操作**：PR #54のqualityとImages成功後にsquash mergeし、mainのCIとImages workflowを完了まで監視した。Images初回の外部image pull失敗は安全に再実行した。
- **危険性**：mainへの変更反映とGHCRへのcontainer image公開により、後続deploymentが当該成果物を参照可能になる。workflow再実行は外部registryへのrequestを追加する。
- **保護策**：merge前にPRが`CLEAN`であることとCI・Images成功を確認した。初回Images失敗は`postgres:16`のDocker Hub pull接続タイムアウトであり、実装のbuild・migration・service検証の失敗ではないことをログで確認してから再実行した。production deployment、production database migration、Secretの変更を実施していない。
- **結果**：PR #54をsquash mergeした。main CIは成功し、再実行したmain Images workflowもbuild、migration read-only、service checks、GHCR image pushを含めて成功した。
- **cleanup**：PR merge時にremote作業branchを削除した。production環境、database、外部認証serviceの永続dataは変更していない。
- **関連**：issue #059、PR #54、CI run #30233192008、Images run #30233192014。

## 2026-07-27 #058 catalog管理認可 PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、#058 role・session assurance migration、catalog管理者解決query。
- **操作**：migrationを初期状態から適用・再適用し、通常user、administrator role、TOTP assurance、role/assurance audit、session失効と削除を統合試験した。
- **危険性**：local TCP port 55432、Docker container、network、test dataを一時的に使用する。
- **保護策**：production接続情報を渡さずrepository専用Compose projectだけを使用した。session token、Cookie、emailなどの値を出力・保存・監査記録しない。production databaseと外部serviceへ接続しない。
- **結果**：通常user・弱いsessionの拒否、administratorと二要素認証済みsessionの解決、role変更とassurance記録の履歴、session削除後の無効化を確認した。PostgreSQL統合を含む128 testsが成功（0 fail）した。
- **cleanup**：`docker compose down --volumes`でtest container、network、test volumeを削除した。
- **関連**：issue #058。

## 2026-07-27 #058 catalog管理認可 mergeとmain検証

- **対象**：GitHubの`cp-20/web-comic-library`、PR #56、main commit `cc72e42183230f3f00b6b3047d3e00449389adce`、CI、Images workflow、GHCR。
- **操作**：PR #56のqualityとImages成功後にsquash mergeし、mainのCIとImages workflowを完了まで監視した。
- **危険性**：mainへの変更反映とGHCRへのcontainer image公開により、後続deploymentが当該成果物を参照可能になる。
- **保護策**：merge前にPRが`CLEAN`であることとCI・Images成功を確認した。production deployment、production database migration、Secretの変更を実施していない。
- **結果**：PR #56をsquash mergeした。main CIとImages workflowはいずれも成功し、Imagesはmigration read-only、service checks、GHCR image pushを完了した。
- **cleanup**：PR merge時にremote作業branchを削除した。production環境、database、外部認証serviceの永続dataは変更していない。
- **関連**：issue #058、PR #56、CI run #30234120995、Images run #30234120989。

## 2026-07-27 #029 followとtimeline PostgreSQL統合試験

- **対象**：local Docker Compose PostgreSQL 16 test database、#029 social migration、follow・timeline query。
- **操作**：migrationを初期状態から適用・再適用し、公開profileの即時follow、承認制profileの申請・拒否、読書activity、公開範囲変更後のtimeline除外を統合試験した。
- **危険性**：local TCP port 55432、Docker container、network、test dataを一時的に使用する。
- **保護策**：production接続情報を渡さずrepository専用Compose projectだけを使用した。session token、Cookie、emailなどの値を出力・保存・監査記録しない。production databaseと外部serviceへ接続しない。
- **結果**：公開範囲がprivateへ変更された既存activityがaccepted followerのtimelineから除外されることを含め、migrationとsocial storageを確認した。
- **cleanup**：`docker compose down --volumes`でtest container、network、test volumeを削除した。
- **関連**：issue #029。
