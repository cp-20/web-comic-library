---
id: 057
title: お気に入りDOMを安全に匿名化・検証するtoolを実装する
type: quality
status: open
priority: P0
execution: agent
review_required: true
review_status: approved
reviewed_at: 2026-07-28T11:43:31.119Z
depends_on: [038, 039]
umbrella: 037
---

# お気に入りDOMを安全に匿名化・検証するtoolを実装する

## 目的と利用場面

提供者が自分のbrowserからcopyしたお気に入り一覧rootを、raw DOMをfileへ保存せず標準入力から匿名化し、
個人情報、token、tracking、漫画本文を含まないfixture候補だけを出力・検証できるようにする。

このissueはagentがtoolとcontractを実装する。実sessionを使ったsite別の取得、目視確認、fixtureの承認は
#087〜#091で行い、#071で追跡する。

## 背景と現状の問題

login後のお気に入りDOMにはaccount名、avatar、tracking属性、不要なnavigationが混在し得る。
raw HTMLをworkspaceへ保存してから手作業で削るとGit history、editor backup、review toolへ情報が残る。
一方、公開pageからsynthetic fixtureを作ると実際のselectorとpaginationを保証できない。

## 実装判断と代替案

- parserはWXTが間接利用している`linkedom@0.18.13`を`apps/extension`のdev dependencyへ明示追加し、
  標準入力からDOM fragmentをparseする。transitive dependencyへの暗黙依存と、attribute境界・entityを
  安全に扱えないregex編集は使わない。
- sanitizerはallowlist方式にし、許可tag・attribute以外を削除する。denylistは未知のtracking属性や
  新しい個人情報fieldを取り逃すため使わない。
- 出力先は明示pathだけを受け、既定ではstdoutへsanitized HTMLを出す。raw inputをlog、error、
  temporary fileへ出さない。
- 実site selectorはagentが推測せず、#087〜#091が作るmanifestのschemaだけをこのissueで固定する。

## スコープと変更対象

| file                                                  | 操作 | 変更内容                                                                                     |
| ----------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| `apps/extension/scripts/sanitize-favorite-fixture.ts` | 作成 | stdin DOMをallowlistへ縮約し、sanitized HTMLだけをstdoutへ出す。                             |
| `apps/extension/scripts/verify-favorite-fixture.ts`   | 作成 | fixtureとmanifestのschema、個人情報、URL、selector、状態をfail closedで検証する。            |
| `apps/extension/scripts/favorite-fixture.ts`          | 作成 | allowlist、正規化、manifest型、検査関数を共有する。                                          |
| `apps/extension/scripts/favorite-fixture.test.ts`     | 作成 | malicious synthetic input、境界値、raw非出力、決定性を検証する。                             |
| `apps/extension/fixtures/favorites/README.md`         | 作成 | #087〜#091のcapture状態、directory、manifest、禁止data、review手順を定義する。               |
| `apps/extension/package.json`、`bun.lock`             | 変更 | `linkedom@0.18.13`をdev dependencyに固定し、`fixture:sanitize`と`fixture:verify`を追加する。 |
| `docs/testing.md`                                     | 変更 | agent toolと#087〜#091のhuman capture/reviewの境界、command、失敗時処理を記録する。          |

このissueで実siteのHTML fixtureとmanifestは作成しない。

## component間の契約

### sanitizer

- commandは
  `bun run --cwd apps/extension fixture:sanitize -- --source <source> --state <state>`とし、DOMをstdin、
  sanitized HTMLだけをstdoutへ流す。未知のflag、source、state、positional argumentを拒否する。
- stdin上限は2MiB、UTF-8だけを受ける。上限超過、NUL、parse failure、root 0件/複数件は非0終了する。
- 許可tagは`section`、`div`、`ul`、`ol`、`li`、`a`、`span`、`p`、`button`だけとする。
- 許可attributeは`class`、`href`、`aria-label`、`aria-current`、`role`、`data-fixture-state`だけとする。
  `id`、`style`、event handler、`src`、`srcset`、`data-*`は`data-fixture-state`以外すべて削除する。
- URLはHTTPS、manifestの許可host、query/fragmentなしの作品pathだけを残す。画像、account、
  notification、logout、settings linkを削除する。
- textは作品titleと固定empty/more labelだけをplaceholderへ置換し、email、UUID、long token、
  account名候補を検出したら出力せず失敗する。
- 同じinputとmanifest候補はbyte単位で同じoutputになる。raw inputと削除した値をlogへ出さない。

### manifest

site manifestと各entryは次の型に固定する。

```ts
type FavoriteFixtureManifest = Readonly<{
  checkedAt: string;
  entries: readonly FavoriteFixtureManifestEntry[];
  origin: string;
  pagePathname: string;
  paginationMode: 'button' | 'infinite-scroll' | 'none';
  source: 'comic-days' | 'kadocomi' | 'niconico' | 'shonen-jump-plus' | 'tonari-no-young-jump';
}>;

type FavoriteFixtureManifestEntry = Readonly<{
  file: string;
  itemSelector: string;
  linkSelector: string;
  rootSelector: string;
  state: 'empty' | 'normal' | 'pagination' | 'partial';
  titleSelector: string;
}>;
```

selectorはtag、class、direct descendant/descendant combinatorだけを許可し、ID、attribute selector、
`:has`、`:nth-*`を拒否する。`checkedAt`はISO date、`origin`はHTTPSの許可候補、
`pagePathname`はqueryなしabsolute pathとする。全siteで`normal`と`empty`を一件ずつ必須にする。
`paginationMode: none`では`partial`と`pagination`を禁止し、それ以外では両方を一件ずつ必須にする。

### verifier

- commandは
  `bun run --cwd apps/extension fixture:verify -- --directory apps/extension/fixtures/favorites/<source>`とし、
  directory外のfileを読まない。
- manifestにないfile、fileのないentry、duplicate state、pagination modeとの不整合、path traversal、
  symlinkを拒否する。
- fixtureを再parseし、root 1件、item 0..200件、各itemのlink/title 1件、empty時item 0件を確認する。
- 許可外tag/attribute/host/text、scriptable URL、base64、画像、漫画本文候補が一つでもあれば失敗する。
- success時はsite、state、item数、SHA-256だけを出し、DOM本文を出さない。

## 実装手順

1. manifest型、allowlist、入力上限、決定的serializerを実装し、malicious synthetic testを先に作る。
2. stdin sanitizerを実装し、raw値がstdout/stderrへ出ないtestを追加する。
3. verifierを実装し、path traversal、symlink、未知selector、個人情報、画像、scriptを拒否する。
4. package scriptとfixture READMEを追加する。
5. `docs/testing.md`へ#087〜#091がraw DOMをfileへ保存せず使うcommandを記録する。

## 受け入れ条件

- 2MiB境界、malformed HTML、未知tag/attribute、個人情報、token、画像、scriptable URLをfail closedにする。
- raw DOMと削除値をfile、stdout、stderrへ出さない。
- 同じinputから同じsanitized bytesとhashを生成する。
- manifestとfixtureの不一致、path traversal、symlink、selector逸脱を検出する。
- #087〜#091が実DOMをstdinから処理し、sanitized outputだけを保存できる。

## テスト

- sanitizer/verifyのtable-driven unit test
- property-like malicious attribute/URL/text input
- `bun run check`
- `bun test`

## 対象外

- login、browser操作、raw DOM取得、目視review、実fixtureのcommit。#087〜#091で行う。
- extractor、pagination network操作、credential共有。
