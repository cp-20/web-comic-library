---
id: 055
title: extensionのWeb originを固定してimportをbrowser検証する
type: quality
status: blocked
priority: P1
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: [038, 039, 040, 041, 042]
umbrella: 037
---

# extensionのWeb originを固定してimportをbrowser検証する

## 目的と利用場面

配布したextensionが運営中のWeb application一つだけへ接続し、利用者がpairing codeを交換してから
お気に入り候補を確認・適用するまでを実browserで保証する。配備先を利用者が入力する必要をなくし、
誤入力または悪意あるoriginへextension tokenやお気に入りを送信しない。

## 背景と現状の問題

`apps/extension/src/popup.ts`はpopupの`WebのURL`入力を`apiOrigin`としてstorageへ保存し、そのoriginへ
extension tokenとお気に入りを送る。生成manifestの`host_permissions`にはWeb originがなく、設定した
originへ通信できる保証もない。入力値をruntimeで選べるため、利用者が偽siteを指定するとtokenと
favorite metadataがそのsiteへ送信される。

#038と#039のBun testはpairing/importの部品を検証するが、生成manifest、runtime permission、
content script、popup、Next.js proxy、Hono、PostgreSQL、確認画面を一続きには検証していない。
また`confirmationUrl`をAPI responseのoriginのまま開く実装は、Next.js rewriteの内部originを開く恐れが
ある。

## 実装判断と代替案

- 配布artifactごとに`WXT_WEB_ORIGIN`をbuild時に一つ指定する。WXTがclient codeへ公開する環境変数は
  `WXT_` prefixへ限定されるため、この名前を使う。runtimeのorigin入力とstorage保存は削除する。
- Web originはHTTPSだけを許可し、E2E/local buildだけ`http://127.0.0.1:{port}`を許可する。
  wildcard、path、query、fragment、credential、`localhost`の曖昧な名前解決は拒否する。
- manifestの必須`host_permissions`へ`${origin}/*`を一件入れる。漫画siteは利用者操作時だけ要求する
  `optional_host_permissions`のまま分離する。Web originまでoptionalにするとpairingがpermission UIに
  依存するため採用しない。
- popupはAPIが返すabsolute `confirmationUrl`を信頼せず、検証済みWeb originと返却`batchId`から
  `/settings/extension/imports/{batchId}`を自前構築する。これによりAPI proxyの内部originやhost
  injectionを開かない。
- browser E2Eは`@playwright/test`のChromium persistent contextを使う。Playwrightがextensionを
  自動loadしてservice workerを制御できるのはChromiumのpersistent contextであり、Firefox extension
  E2Eを同じrunnerで装う方式は採用しない。Firefox実機確認はhuman issue #072へ分離する。
- 漫画siteへのnetworkはPlaywright routeで遮断し、#087〜#091の承認済みfixtureをresponseとして返す。実account、
  Cookie、外部site request、credentialを使わない。
- E2E APIは`createApp`へtest固定sessionと実PostgreSQL adapterを注入するlocal-only composition rootを
  使う。production auth bypass routeやtest headerは追加しない。

## スコープと変更対象

| file                                          | 操作 | 変更内容                                                                               |
| --------------------------------------------- | ---- | -------------------------------------------------------------------------------------- |
| `apps/extension/src/web-origin.ts`            | 作成 | build値を検証・正規化し、API/確認URLを組み立てるpure functionを定義する。              |
| `apps/extension/src/web-origin.test.ts`       | 作成 | HTTPS、loopback、wildcard、credential、path/query/fragmentを検証する。                 |
| `apps/extension/wxt.config.ts`                | 変更 | function形式のmanifestで固定Web host permissionを生成し、未設定時はbuildを失敗させる。 |
| `apps/extension/entrypoints/popup.html`       | 変更 | Web URL label/inputを削除する。                                                        |
| `apps/extension/src/popup.ts`                 | 変更 | build originだけでpairing/importし、storageはtokenだけ、確認URLはbatch IDから作る。    |
| `apps/extension/src/messages.ts`              | 変更 | runtime content script登録結果をmessage contractへ追加する。                           |
| `apps/extension/entrypoints/background.ts`    | 変更 | permission取得後に対象originだけのruntime content scriptを一度登録する。               |
| `apps/extension/src/site-permissions.ts`      | 変更 | Web originと漫画site permissionを別型として扱う。                                      |
| `apps/extension/src/site-permissions.test.ts` | 変更 | Web originがoptional側へ混ざらないことを検証する。                                     |
| `apps/extension/src/manifest.test.ts`         | 作成 | Chrome/Firefox生成manifestの権限snapshotを検査する。                                   |
| `apps/extension/playwright.config.ts`         | 作成 | Chromium persistent context、Web/API server、timeout、artifactを設定する。             |
| `apps/extension/e2e/favorite-import.spec.ts`  | 作成 | pairing、permission、抽出、確認、適用、DB反映を一続きで検証する。                      |
| `apps/extension/e2e/support/api-server.ts`    | 作成 | test固定sessionと実adapterでHonoをloopbackだけにserveする。                            |
| `apps/extension/e2e/support/seed.ts`          | 作成 | user、source policy、作品、pairing codeを実DBへ作り、test後に削除する。                |
| `apps/extension/package.json`                 | 変更 | `@playwright/test`、`postgres`とE2E/manifest test scriptを追加する。                   |
| `package.json`                                | 変更 | `test:extension:e2e` scriptを追加する。                                                |
| `bun.lock`                                    | 変更 | Bunで解決したdev dependencyを固定する。                                                |
| `.gitignore`                                  | 変更 | Playwrightの`test-results`とreportだけを除外する。                                     |
| `.github/workflows/ci.yml`                    | 変更 | PostgreSQL、migration、Web build、extension build、Chromium E2Eを実行する。            |
| `docs/web.md`                                 | 変更 | same-origin `/api` proxyとextension confirmation pathを記載する。                      |
| `docs/deployment.md`                          | 変更 | release buildの`WXT_WEB_ORIGIN`、artifactとoriginの対応を記載する。                    |
| `docs/testing.md`                             | 変更 | Chromium自動E2Eと#072のFirefox実機確認の境界、fixture-only networkを記載する。         |

fileの削除はない。`apiOrigin` storage keyはmigrationせず起動時に削除する。extension tokenは維持する。

## component間の契約

### Web originとmanifest

`normalizeWebOrigin(value, allowLoopback)`は、末尾slashなしの`URL.origin`を返す。

- release: `https:`、hostnameあり、明示credentialなし、default port以外も許可。
- test: 上記に加えて`http://127.0.0.1:{1..65535}`。
- pathは`/`だけ、search/hashは空、wildcardとopaque originは禁止。

`wxt.config.ts`は`process.env.WXT_WEB_ORIGIN`を同じfunctionで検証し、
`host_permissions: [`${webOrigin}/*`]`を生成する。popup bundleは
`import.meta.env.WXT_WEB_ORIGIN`を同じfunctionで読む。未設定・不正ならbuildと起動をfail fastする。
Chrome/Firefox manifestは次を満たす。

- `host_permissions`はWeb origin一件だけ。
- `optional_host_permissions`は`favoriteSiteOrigins`と完全一致。
- `permissions`は`activeTab`、`scripting`、`storage`だけ。
- `<all_urls>`、`cookies`、`history`、`bookmarks`はない。

### popupとstorage

storage shapeは`{ extensionToken: string }`だけにする。起動時に旧`apiOrigin` keyをremoveする。

- pairing: `POST {webOrigin}/api/extension/pairing-codes/exchange`
- import: `POST {webOrigin}/api/extension/favorite-imports`
- confirmation:
  `new URL(`/settings/extension/imports/${encodeURIComponent(batchId)}`, webOrigin).href`

API responseは`batchId`とtokenを既存Valibot/Hono contractで検証する。`confirmationUrl`は互換のため
responseに残ってもpopupでは使わない。responseがHTML、invalid JSON、invalid UUID、401/403/410/429/
5xxならtokenを上書きせず、確認tabを開かない。logへtoken、pairing code、favorite titleを出さない。

permissionが許可されたらbackgroundはID`favorites-{sourceKey}`、該当originのmatch一件、
`content-scripts/favorites.js`を`browser.scripting.registerContentScripts`へ登録する。既に同IDなら
matchesを比較し、同一なら成功、異なるなら古い登録を削除して再登録する。拒否時は登録も抽出も行わない。

### E2E topology

- Web: `http://127.0.0.1:3100`、`API_ORIGIN=http://127.0.0.1:3101`
- test API: `http://127.0.0.1:3101`
- extension build: `WXT_WEB_ORIGIN=http://127.0.0.1:3100`
- DB: repository標準integration DB

`api-server.ts`はloopbackへだけbindし、`createApp`の`resolveSession`をseed userへ固定する。通常の
production `apps/api/src/index.ts`、環境変数、routeは変更しない。pairing codeはserver起動前に
application use caseとreal repositoryで発行する。

Playwrightは#087 manifestで確定した少年ジャンプ＋お気に入りURLをfixtureでfulfillし、それ以外の外部networkを
abortする。extension popupでcodeを入力し、site permissionをgrant、import、確認tabを開き、標準の
`follow_only`を適用する。最後にDBでbatchが`applied`、follow一件、不要なlibrary reading statusが
ないことを確認する。

## 実装手順

1. origin validatorとmanifest testを追加し、popupからorigin入力/storageを削除する。
2. backgroundのruntime registrationとerror stateを実装し、message/permission unit testを通す。
3. Playwrightとloopback API composition root、seed/cleanupを追加する。
4. Chromiumを固定originでbuildし、fixture route、popup、確認画面、DB assertionを実装する。
5. Firefox manifest contract testを追加し、#072が使うrelease artifactをbuildできるようにする。
6. CIと恒久文書を更新する。

## 受け入れ条件

- release artifactは指定したWeb originだけへAPI requestでき、利用者が接続先を変更できない。
- pairing code交換後もstorageにWeb origin、pairing code、favorite dataを残さず、tokenだけを保存する。
- APIが別originの`confirmationUrl`を返しても固定Web origin以外のtabを開かない。
- 漫画site permissionを拒否した場合はcontent scriptを登録・実行しない。
- Chromium E2Eでpairing、site permission、fixture抽出、batch確認、follow-only適用、DB反映が通る。
- E2E中の外部network requestは0件で、生成manifestに不要なhost/permissionがない。
- Firefox buildとmanifest contractが通り、#072が同じartifact hashを実機確認へ使える。

## テスト

- Bun: origin boundary、storage migration、message、permission、manifest snapshots。
- Playwright Chromium: 正常flow、permission拒否、失効token、invalid batch ID、別origin URL、batch所有者。
- 実PostgreSQL: pairing単回利用、batch applied、follow冪等性、reading status非作成、cleanup。
- `bun run check`
- `bun test`
- `bun run build:web`
- `bun run test:extension:e2e`
- `WXT_WEB_ORIGIN=https://<release-origin> bun run --cwd apps/extension build`
- `WXT_WEB_ORIGIN=https://<release-origin> bun run --cwd apps/extension build:firefox`

## 対象外

- Chrome Web Store、Firefox Add-onsへの申請、Safari、任意origin/self-hosted backend。
- FirefoxのPlaywright extension自動化、外部漫画siteや実accountを使うE2E。
- favorite解除同期、定期同期、extension UI framework追加。

## Blocker

#040、#041、#042のextractorが未完了で、browser flowが送る確定dataをまだ作れない。

## 解除条件

#040、#041、#042がすべて`done`になり、5 siteのnormal/empty、該当時のpartial/paginationと
agentが作るstructure-changed fixtureがrepositoryに存在する。

## 解除後の着手点

`apps/extension/src/web-origin.ts`とtestを作り、popupから`webOrigin` input/storageを削除する。

## 禁止する代替

実account、Cookie、外部siteへのE2E request、runtime origin入力、`<all_urls>`、test専用production route、
Firefox実機確認を#055のagent作業へ混在させることを禁止する。
