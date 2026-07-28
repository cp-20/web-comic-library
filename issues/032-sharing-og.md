---
id: 032
title: SNS共有、公開URL、OG画像を実装する
type: feature
status: done
priority: P1
depends_on: [017, 020, 021, 030]
umbrella: 028
---

# SNS共有、公開URL、OG画像を実装する

## 目的

公開した作品、読書記録、感想、profileをSNSへ共有し、共有先から安定した公開ページへ戻れるようにする。

## スコープ

- 作品、読了記録、感想、profileの安定した公開URL。
- Web Share API。
- X、Bluesky、LINE向け共有link。
- 作品名、読書状態、利用者名を使う動的OG画像。
- canonical URL、OG metadata、構造化data。
- R2への生成画像保存とcache。

## 実装方針

- 公開範囲をserver側で判定し、非公開対象は404として扱う。
- ネタバレ本文を共有文、metadata、OG画像へ含めない。
- OG画像のkeyは公開内容のversionから決定し、同じ内容を再生成しない。
- 作品や利用者の統合後も旧URLから正規URLへredirectする。
- Web Share API非対応環境では共有linkとURL copyを表示する。

## 受け入れ条件

- 四種の公開対象へ安定URLで到達できる。
- mobileでWeb Share APIを呼び、非対応環境でも共有できる。
- X、Bluesky、LINE用URLが正しくencodeされる。
- OG画像とmetadataに許可されたfieldだけが入る。
- 非公開、follower限定の未許可閲覧者、ネタバレ本文が公開されない。

## テスト

- visibilityとOG payloadの単体テスト。
- metadata、canonical、redirect、R2 cacheの統合テスト。
- SNS crawler相当の未login requestとmobile共有のE2E。

## 対象外

- SNSへの自動投稿。
- 動画またはanimation付きOG。

## 完了記録

- 公開作品、profile、読書activity（読了記録を含む）、review activityへ安定URLを付与した。
- 共有用activity APIは現在もpublicな対象だけを404以外で返し、review本文、spoiler、既読位置を含めない。
- Web Share API、copy fallback、X、Bluesky、LINE link、canonical metadata、作品OG SVGとR2 version-key cacheを実装した。
- 検証：`bun run check`、権限付き`bun test`（123 pass、20 skip、0 fail）、権限付き`bun run build:web`。
