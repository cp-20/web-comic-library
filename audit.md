# 操作監査

## 2026-07-29T13:48:31+09:00

- 対象: GitHub repository `cp-20/web-comic-library`、PR、`main` branch、ローカルcheckout
- 操作: CI高速化と変更公開手順の変更を専用branchへcommit・pushし、PRを作成して検証成功後に`main`へmergeし、ローカル`main`をfast-forwardする。
- 危険性: GitHubの永続履歴と共有`main`の状態が変わり、誤った変更の公開、必須検証の失敗、または競合が起こり得る。
- 保護策: 変更対象を明示してcommitし、PR上の必要なGitHub Actionsの成功を確認してからmergeする。merge後はremote `main`をfetchしてローカルをfast-forwardする。
- 結果: 実施中。
- cleanup: merge後に不要なremote branchを削除し、ローカルbranchを`main`へ戻す。
- 関連issueまたはPR: #74

## 2026-07-29T13:35:41+09:00

- 対象: GitHub repository `cp-20/web-comic-library` とローカル`main`
- 操作: Codex Review所見のissue workflow変更をbranchへcommit・pushし、PRを`main`へmergeしてローカル追従を行う。
- 危険性: GitHubの永続履歴と`main`の共有状態が変更され、誤った変更の公開または競合が起こり得る。
- 保護策: 差分と検査結果を確認し、専用branchとPRを経由する。merge時はPR head SHAを指定し、remote `main`をfetchしてからlocal `main`をfast-forwardする。
- 結果: 実施中。
- cleanup: 不要になったremote branchはPR merge後に削除し、local branchは`main`へ戻す。
- 関連issueまたはPR: #092〜#129、PR作成後に追記

## 2026-07-29T13:22:16+09:00

- 対象: Modal workspace とローカルの Kimi Code CLI 設定領域
- 操作: Kimi Code CLI を導入し、Modal Shared API 接続に限定した proxy token を1組発行して、owner read/write 限定のローカル領域へ保存した。
- 危険性: proxy token の secret が shell history、標準出力、repository、誤った共有先へ露出する可能性がある。token は対象WorkspaceのHTTP endpointへアクセスできる。
- 保護策: secret値を出力、Git管理下のfile、監査ログへ記録しない。発行結果は owner read/write のみの `~/.kimi-code/private/modal-proxy-token.json` に保存し、通常の Modal API token は流用しない。
- 結果: Kimi Code CLI 0.30.0 を導入し、Modal proxy token を発行した。ユーザー指定のKimi K3 endpointを `~/.kimi-code/config.toml` に設定し、config診断成功後、Kimi Code CLI から最小推論を1回実行して `READY` 応答を確認した。
- cleanup: 不要になった場合はModalのproxy token管理画面または `modalshared workspace proxy-tokens delete` でtokenを削除し、ローカルのtoken fileを消去する。
- 関連issueまたはPR: なし

## 2026-07-28T15:25:08+09:00

- 対象: ローカル開発 API process と Google OAuth 開発用 credential
- 操作: クリップボード上の Google OAuth client ID / client secret を値を出力せず API process の環境変数へ渡し、API を再起動する。
- 危険性: secret が shell history、process list、log、repository に露出する可能性がある。
- 保護策: clipboard値は標準出力へ流さず、repository・永続env file・監査ログには保存しない。process起動時だけ環境へ渡し、secret値を含むcommandを記録しない。
- 結果: 2026-07-28T15:26:35+09:00 にAPIを再起動し、`/api/health`の200応答を確認した。credential値は出力・保存していない。
- cleanup: API停止時にprocess環境から消える。永続ファイルへsecretは残さない。
- 関連issueまたはPR: #060

## 2026-07-28T15:26:35+09:00

- 対象: ローカル開発用`.env.local`とGoogle OAuth開発用credential
- 操作: クリップボード上のGoogle OAuth client ID / client secretを値を出力せず、Git管理外の`.env.local`へ保存する。
- 危険性: secretがrepository、shell history、log、誤った共有先へ露出する可能性がある。
- 保護策: `.env.local`をGit ignoreし、clipboard値は標準出力へ流さず、監査ログへ値を記録しない。ファイル権限をowner read/writeだけに制限する。
- 結果: 実行中API processからGoogle OAuth credential pairを値を出力せず転記し、`.env.local`をowner read/write権限に設定した。
- cleanup: 開発credentialの失効時または不要時に`.env.local`を削除し、Google Cloud Consoleでsecretをrotateする。
- 関連issueまたはPR: #060

## 2026-07-28T15:46:54+09:00

- 対象: ローカル開発 API と Google OAuth 認可endpoint
- 操作: Git管理外の`.env.local`にある開発用credentialをローカルAPI processが参照した状態で、Google OAuth開始URLを生成し、認可endpointが受理することだけを確認した。
- 危険性: credentialの露出、または意図しないGoogle account login・callbackにより外部serviceまたは永続dataを変更する可能性がある。
- 保護策: credential値・認可URLのqueryを出力、保存、Git commit、監査ログへ記録しない。アカウント選択、同意、callbackは実行せず、応答のendpoint・callback URI・statusだけを検証した。
- 結果: Google OAuth開始URLは`accounts.google.com`の認可endpointを指し、`http://127.0.0.1:3000/api/auth/callback/google` callback URIでGoogleに受理された。account、session、databaseは変更していない。
- cleanup: 新規の外部session・データは作成していない。credentialは既存のowner read/write限定`.env.local`にのみ残る。
- 関連issueまたはPR: #060, #69
