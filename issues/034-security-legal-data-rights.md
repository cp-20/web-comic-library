---
id: 034
title: security、法務、利用者dataの権利を実装する
type: feature
status: done
priority: P0
depends_on: [020, 031]
umbrella: 033
---

# security、法務、利用者dataの権利を実装する

## 目的

公開サービスとして必要なWeb security、個人dataのexportと削除、連絡窓口を提供する。

## スコープ

- 利用者dataのJSON export。
- account削除と第三者からの即時非表示。
- 運用logとbackupを除く個人dataの30日以内の削除job。
- 利用規約、privacy policy、削除依頼、著作権侵害の窓口。
- CSRF、XSS、clickjacking、SQL injectionへの防御。
- CSPを含むsecurity header。
- auth、感想、いいね、通報のrate limit。
- dependencyとcontainer imageの脆弱性scan。
- administratorのpasskeyまたは二要素認証。

## 実装方針

- exportは本人確認後に非同期生成し、期限付きURLで渡す。
- exportへ他利用者の非公開dataとSecretを含めない。
- 削除開始時にsessionを失効させ、公開queryから即時除外する。
- backup内の削除dataは通常の保持期限で失効させ、復元時に削除台帳を再適用する。
- user入力はplain textで保存し、表示時にescapeする。
- Turnstileは実際にspamが観測された場合だけ追加する。
- 実名、生年月日、住所を収集しない。

## 受け入れ条件

- 利用者が自分のprofile、読書、所蔵、follow、感想、通知設定をJSONで取得できる。
- 削除確定直後にaccountと記録を第三者が閲覧できない。
- 30日以内に対象の個人dataを削除し、監査可能な完了記録を残す。
- CSRFとframe埋め込みを拒否し、user入力をscriptとして実行しない。
- administratorが追加認証なしに管理操作できない。
- 法務文書と四つの連絡窓口へ公開URLから到達できる。

## テスト

- export内容と除外fieldの統合テスト。
- 削除直後、削除job後、backup復元後のprivacy test。
- security header、CSRF、rate limit、権限昇格の自動test。
- dependencyとimage scanをCIで実行する。

## 対象外

- 決済と契約管理。
- spamがない段階でのCAPTCHA。
