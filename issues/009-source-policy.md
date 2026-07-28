---
id: 009
title: 取得元の利用条件と年齢区分を管理する
type: feature
status: done
priority: P0
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: [004]
umbrella: 007
---

# 取得元の利用条件と年齢区分を管理する

## 目的

利用条件を確認していない取得元、R18作品、年齢確認が必要なページを本番収集へ混入させない。

## スコープ

- `SourcePolicyRecord`のdomain model、table、repository。
- 利用規約、robots.txt、API、feed、問い合わせ結果の確認日と根拠URL。
- 収集、営利利用、広告、affiliateの可否。
- 掲載元固有の年齢区分値と公開、除外、要確認の対応表。
- 取得元単位の緊急停止と管理用command。

## 実装方針

- robots.txtが空または404でも許諾済みとは判定しない。
- 未確認のpolicyは本番収集を無効にする。
- 年齢区分が不明な作品は公開カタログへ自動投入しない。
- 認証、CAPTCHA、paywall、年齢確認を回避しない。
- 公式閲覧URLと将来の購入URLを別fieldとして保持する。

## 受け入れ条件

- policyが許可状態の取得元だけをworkerが有効化できる。
- 緊急停止後は新しいHTTP requestとjob投入を行わない。
- R18、年齢確認必須、未確認の年齢区分を検索、通知、共有対象へ渡さない。
- policyの変更者、変更日時、根拠を監査できる。

## テスト

- policy状態ごとの収集可否をdomain単体テストで網羅する。
- 未確認値とR18値が公開queryへ出ない統合テスト。
- 緊急停止中にconnectorを呼ばないworkerテスト。

## 対象外

- 利用規約の法的判断の自動化。
- 年齢確認ページへのアクセス。
