# 配備

## production image

`Dockerfile`は`web`、`api`、`worker`、`migration`のbuild targetを持つ。
全targetはBun 1.3.14のslim imageを使い、production dependencyだけを含め、`bun` userで実行する。
Kubernetesはread-only root filesystemを使い、書き込み可能な`/tmp`を`emptyDir`で提供する。

GitHub Actionsはpull requestと`main`へのpushでtargetをbuildし、non-root、read-only起動、health checkを検証する。
同じrepositoryのpull requestと`main`へのpushでは、次のimageをcommit SHA tagでGHCRへpushする。

- `ghcr.io/cp-20/web-comic-library-web:<commit-sha>`
- `ghcr.io/cp-20/web-comic-library-api:<commit-sha>`
- `ghcr.io/cp-20/web-comic-library-worker:<commit-sha>`

`migration` targetはworker imageと同じproduction dependencyを使うため、配備時はworker imageのcommandをmigration commandへ置き換える。
初回package作成後はGitHubのpackage settingsでvisibilityを`public`へ変更する。

## Asterion

Kubernetes manifestの正本は`cp-20/asterion-manifest`の`web-comic-library` directoryに置く。
production overlayはimage tagをcommit SHAで固定する。
Argo CDはdatabase初期化、migration、Deploymentの順にsyncする。
Cloudflare Tunnelは`comic.cp20.dev/api/*`をAPIへ送り、それ以外の同一hostnameをWebへ送る。

SecretはSOPSで暗号化し、平文をGit履歴とmanifestへ含めない。
