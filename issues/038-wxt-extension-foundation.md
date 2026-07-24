---
id: 038
title: WXT extension基盤と安全なaccount連携を作る
type: platform
status: open
priority: P1
depends_on: [002, 003, 020]
umbrella: 037
---

# WXT extension基盤と安全なaccount連携を作る

## 目的

WXTでChromeとFirefox向けextensionをbuildし、site別の任意権限と限定scopeのtokenでHono APIへ接続できるようにする。

## 背景

通常のWeb pageは別originにある漫画siteのお気に入りDOMを読めない。

extensionは利用者が許可したsiteのpage上でだけextractorを実行する。

## スコープ

- `apps/extension`のBun workspace。
- WXT 0.20.27とvanilla TypeScriptによるpopup、background、runtime content script entrypoint。
- Chrome build、Firefox build、zip、typecheckのscript。
- site単位の`optional_host_permissions`とruntime permission要求。
- pairing codeの発行、交換、失効を行うHono RPC route。
- `favorites:import`だけを許可するextension token。
- tokenとextension設定を保存する`browser.storage.local`。
- root CIのformat、lint、typecheck、extension build。

## 実装方針

- [WXTのfile-based entrypoint](https://wxt.dev/guide/essentials/entrypoints)を使う。
- WXTのcontent scriptは`registration: "runtime"`とし、許可後だけ登録する。
- manifestは`wxt.config.ts`から生成し、手書きの`manifest.json`を持たない。
- `history`、`bookmarks`、`cookies`、`<all_urls>`を要求しない。
- popupとcontent script間は標準の`browser.runtime` messageだけを使い、message libraryを追加しない。
- extensionからbackendを呼ぶ場合も`@web-comic-library/api-client`のHono RPC clientを使う。
- pairing codeは5分で失効し、一度だけ交換できる。
- extension tokenはhashだけをserverへ保存し、scope、発行端末、最終利用日時、失効日時を持つ。
- tokenをsync storage、log、error reportへ出さない。
- remote codeを読み込まず、全実行codeをextension packageへbundleする。

## 受け入れ条件

- `bun run --cwd apps/extension build`でChrome向け成果物を生成できる。
- Firefox向けbuildと両browser向けzipを生成できる。
- 生成manifestに要求していないhostと強い権限が含まれない。
- 利用者がWeb側で作ったpairing codeからextensionを連携できる。
- tokenはお気に入りimport以外のHono RPC routeを実行できない。
- Web側またはextension側からtokenを失効できる。

## テスト

- ChromeとFirefoxの生成manifestをsnapshotで検査する。
- pairing codeの期限、単回利用、scope、失効を統合テストする。
- popup、background、content script間のmessage contractをBun testで検証する。
- unpacked extensionを読み込むbrowser smoke testを実行する。

## 対象外

- Safari向け配布。
- extension storeへの公開申請。
- ReactなどのUI framework追加。
