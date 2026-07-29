# 配備

## production image

`Dockerfile`は`web`、`api`、`worker`、`migration`のbuild targetを持つ。
全targetはBun 1.3.14のslim imageを使い、production dependencyだけを含め、`bun` userで実行する。
Kubernetesはread-only root filesystemを使い、書き込み可能な`/tmp`を`emptyDir`で提供する。

GitHub Actionsは、application、container定義、CI設定などの変更を含むpull requestと`main`へのpushでtargetをbuildし、non-root、read-only起動、health checkを検証する。`docs/**`、`issues/**`、`audit.md`だけの変更ではCIとimage buildを起動しない。
同じrepositoryのpull requestと`main`へのpushでは、次のimageをcommit SHA tagでGHCRへpushする。

- `ghcr.io/cp-20/web-comic-library-web:<commit-sha>`
- `ghcr.io/cp-20/web-comic-library-api:<commit-sha>`
- `ghcr.io/cp-20/web-comic-library-worker:<commit-sha>`

`migration` targetはworker imageと同じproduction dependencyを使うため、配備時はworker imageのcommandをmigration commandへ置き換える。
imageはpublic repositoryへ関連付け、認証情報のない環境からpullできる公開packageとして配布する。

PostgreSQLの初期化PreSync Jobとmigration PreSync Jobは、`pg_isready`でDNS解決と接続受付を5秒間隔・最大300秒まで待機してから接続する。migrationはPostgreSQL clientを持つinit containerで待機するため、一時的なdatabase起動待ちはmigration containerの失敗回数へ含めない。

## Asterion

Kubernetes manifestの正本は`cp-20/asterion-manifest`の`web-comic-library` directoryに置く。
production overlayはimage tagをcommit SHAで固定する。
Argo CDはdatabase初期化、migration、Deploymentの順にsyncする。
Cloudflare Tunnelは`comic.cp20.dev/api/*`をAPIへ送り、それ以外の同一hostnameをWebへ送る。

SecretはSOPSで暗号化し、平文をGit履歴とmanifestへ含めない。

APIには`DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`を設定する。Google OAuth credentialは必ず組で与え、片方または両方がないAPIは起動しない。profile iconとOG image cacheを有効にする場合は`R2_ENDPOINT`、`R2_BUCKET`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_PUBLIC_BASE_URL`の全てを設定する。OG imageは公開内容のversion keyを使用し、R2 objectの存在確認後に未保存の場合だけPUTする。R2 access keyとauth secretはSOPS Secretのみで管理し、URL以外をログ、監査記録、Gitへ出さない。

Web Pushを有効にする場合はAPIへ`VAPID_PUBLIC_KEY`、workerへ`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`をSOPS Secretで与える。三つの値は同じVAPID key pairから設定し、秘密鍵をAPI、Web、ログ、監査記録へ渡さない。

メールdigestを有効にする場合はworkerへ`RESEND_API_KEY`、`RESEND_FROM`、`PUBLIC_APP_URL`を組で設定し、APIへ`RESEND_WEBHOOK_SECRET`を設定する。Resend API keyとwebhook secretはSOPS Secretだけで管理し、送信元と公開URLを含めて値をログ、監査記録、Gitへ出さない。Resend側では`/api/webhooks/resend`へ`email.bounced`と`email.complained`を登録する。
