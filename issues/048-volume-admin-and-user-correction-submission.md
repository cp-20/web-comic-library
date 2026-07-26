---
id: 048
title: 単行本管理と利用者修正候補の投稿をcatalog管理へ接続する
type: feature
status: open
priority: P1
depends_on: [015, 016, 020, 023]
umbrella: 007
---

# 単行本管理と利用者修正候補の投稿をcatalog管理へ接続する

## 目的

単行本の統合・分割を管理者が監査付きで操作し、認証済み利用者が作品・話・巻の修正候補をreview queueへ安全に投稿できるようにする。

## 背景

#015で作品と話の管理操作、review queue、強い管理者認可の境界を導入した。`VolumeEdition`と利用者identityは#016、#020、#023で初めてstorageと認証主体を持つため、それらが存在する前に巻操作や利用者由来の候補を安全に実装できない。

## スコープ

- `VolumeEdition`と`VolumeContentMapping`の統合、分割、redirect、監査。
- 認証済み利用者からのcatalog修正候補のvalidation、rate limit、queue登録。
- 管理者画面での巻操作と利用者候補の根拠確認。

## 実装方針

- #015の`catalog_merge_audits`と`catalog_review_items`を拡張し、操作者、理由、根拠、変更前後を追跡する。
- 利用者候補は確認されるまで他利用者の読書状態や公開catalogへ反映しない。
- 巻と話の未確認mappingから既読を推測しない。

## 受け入れ条件

- 管理者が巻と巻・話mappingを統合・分割でき、旧IDは正規IDへredirectする。
- 認証済み利用者だけが修正候補を投稿でき、rate limitとinput validationが機能する。
- 操作と候補の処理履歴を監査できる。

## テスト

- 単行本・巻話mappingのPostgreSQL統合test。
- Hono RPCの認証、認可、validation、rate limit test。
- 管理画面のE2E。

## 対象外

- 複数管理者の承認workflow。
