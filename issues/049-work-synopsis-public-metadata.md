---
id: 049
title: 作品概要と公開metadataを管理する
type: feature
status: blocked
priority: P1
depends_on: [008, 017, 058]
umbrella: 007
---

# 作品概要と公開metadataを管理する

## 目的

作品ページに、根拠と公開範囲を明示した作品概要と検索・共有用metadataを表示できるようにする。

## 背景

#017で公開作品の検索、作者、掲載先、Web話、単行本を表示した。現行の`Work`には概要を保存するfieldと根拠がなく、connectorから推測した本文や非公開dataを表示してはならないため、概要管理は独立した変更として扱う。

## Blocked

概要の公開可否を管理者確認で変更し、更新履歴を監査するには、production APIでadministrator roleとpasskeyまたは二要素認証のsession assuranceを解決する必要がある。仮の管理者判定を導入せず、#058の完了後に再開する。

## スコープ

- 作品概要、取得元、確認日時、公開可否を保持するcatalog modelとmigration。
- connector候補または管理者確認による概要の更新と監査。
- 公開作品query、canonical page metadata、OG descriptionへの安全な反映。

## 実装方針

- 概要は根拠URLと確認日時を持つ明示的な公開fieldだけを返す。
- HTML、OG metadata、検索responseへ未確認または非公開の概要を含めない。
- 本文、漫画ページ画像、viewer responseを概要の取得元に使わない。

## 受け入れ条件

- 公開可と確認された概要だけが作品ページとOG metadataに表示される。
- 概要の取得元と更新履歴を監査できる。
- 未確認、非公開、削除済みの概要は検索・HTML・metadataから除外される。

## テスト

- 公開範囲と根拠を含むPostgreSQL統合test。
- Hono RPC responseとOG metadataの公開範囲test。

## 対象外

- 漫画本文、漫画画像、viewerからの自動要約。
- 利用者レビュー本文。
