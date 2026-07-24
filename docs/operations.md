# 運用と復旧

## 復旧目標

PostgreSQLの目標復旧時点（RPO）は15分以内、サービスの目標復旧時間（RTO）は4時間以内とする。

R2の`postgresql/16`にはWAL-Gの週次base backupと継続的なWAL archiveを保存する。

R2の`logical/`には日次logical backupを保存し、R2 lifecycleで30日後に削除する。

WAL-Gはlibsodiumでobjectをclient-side暗号化する。

R2の暗号化だけに依存せず、復号鍵はSOPS Secretで管理する。

## 日常確認

PrometheusはAsterion上で8日間のmetricを保持する。

Prometheus UIは外部公開せず、必要なときだけport-forwardする。

```sh
ssh plexus -L 9090:127.0.0.1:9090
sudo kubectl -n monitoring port-forward service/prometheus 9090:9090
```

次のPromQLでnodeとapplicationの状態を確認する。

```promql
1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))
node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes
node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}
kube_persistentvolumeclaim_status_phase
increase(kube_pod_container_status_restarts_total[10m])
argocd_app_info
web_comic_library_jobs_overdue
web_comic_library_connector_runs_total
web_comic_library_connector_duration_seconds
web_comic_library_notification_failures_total
```

Discord通知を受けた運用者は、Prometheusのalert、Argo CD application、対象Podの順に確認する。

Secret、認証header、メール本文、Push鍵、job payloadはログやSentryへ転記しない。

## Backup確認

日次logical backupと週次base backupのJobを確認する。

```sh
ssh plexus
sudo kubectl -n web-comic-library get cronjob,job -l app.kubernetes.io/part-of=web-comic-library
sudo kubectl -n postgresql get cronjob,job -l app.kubernetes.io/part-of=web-comic-library
```

WAL archiveの最終成功時刻はPostgreSQLから確認する。

```sh
sudo kubectl -n postgresql exec statefulset/postgresql -- \
  psql --username postgres --dbname postgres \
  --command 'select archived_count, failed_count, last_archived_time, last_failed_time from pg_stat_archiver'
```

`failed_count`が増加中の場合、R2 credential、network、PostgreSQL logの順に調べる。

## 月次restore drill

restore drillは本番PostgreSQLと別のNamespace、PVC、Serviceで実行する。

本番PVCをrestore先へmountしてはならない。

最初に、復旧対象時刻と比較用件数を記録する。

```sh
sudo kubectl -n postgresql exec statefulset/postgresql -- \
  psql --username postgres --dbname web_comic_library --tuples-only --no-align \
  --command "
    select 'outbox_events', count(*) from outbox_events
    union all
    select 'job_idempotency_keys', count(*) from job_idempotency_keys
    union all
    select 'compatibility_probe', count(*) from compatibility_probe;
  "
```

空のPostgreSQL 16 data directoryへbase backupを取得する。

次の環境変数はSOPS Secretから一時Secretへ渡し、shell履歴へ値を書かない。

```sh
export AWS_ENDPOINT='https://ACCOUNT_ID.r2.cloudflarestorage.com'
export AWS_REGION='auto'
export AWS_S3_FORCE_PATH_STYLE='true'
export WALG_LIBSODIUM_KEY_TRANSFORM='base64'
export WALG_S3_PREFIX='s3://cp20-web-comic-library-backups/postgresql/16'
wal-g backup-fetch "$PGDATA" LATEST
```

指定時点へ復旧する場合は、空の`recovery.signal`と次の設定を作ってからPostgreSQLを起動する。

```conf
restore_command = 'wal-g wal-fetch %f %p'
recovery_target_time = 'YYYY-MM-DD HH:MM:SS+09'
recovery_target_action = 'promote'
```

PostgreSQLがread/writeを受け付けたら、本番と同じqueryで主要件数を比較する。

続いて、restore先へ向けたAPIとworkerを一時起動し、APIの`/api/health`とworkerの`/metrics`を確認する。

drill終了後は一時Deployment、Service、Secret、PVC、Namespaceを削除する。

復旧時刻、所要時間、比較した件数、差分の理由をissueへ記録する。

## Logical backupからの復旧

logical backupは物理backupを利用できない場合の独立した復旧経路として使う。

WAL-Gは取得時にobjectを復号し、`pg_restore`へ渡せるdump fileを作る。

```sh
wal-g st ls logical/
wal-g st get "logical/YYYYMMDDTHHMMSSZ.dump" /tmp/web-comic-library.dump
createdb --owner web_comic_library web_comic_library
pg_restore --dbname web_comic_library --exit-on-error /tmp/web-comic-library.dump
rm -f /tmp/web-comic-library.dump
```

復元後は物理restoreと同じ件数比較とAPI、workerの確認を行う。

## 一時VPSへの退避

Asterionのnodeまたは家庭回線が復旧しない場合は、PostgreSQL 16とDockerを実行できる一時VPSを用意する。

VPSのfirewallはSSHとCloudflare Tunnelから必要な通信だけを許可し、PostgreSQL portをInternetへ公開しない。

次の順序で復旧する。

1. SOPS復号鍵を安全な端末だけに用意する。
2. GHCRからcommit SHA固定のdatabase、Web、API、worker imageを取得する。
3. R2のbase backupとWALから別volumeへPostgreSQLを復旧する。
4. migrationを一度実行する。
5. APIとworkerを起動して主要件数を比較する。
6. Webを起動して内部疎通を確認する。
7. Cloudflare TunnelをVPSへ接続し、Webと`/api/health`を外部から確認する。

復旧作業中もR2 credential、WAL-G暗号鍵、Sentry DSN、Discord Webhookを平文fileへ保存しない。

復旧後はcredentialをrotationし、一時VPSのdiskを破棄する。
