---
id: 027
title: 更新日のメールdigestを送信する
type: feature
status: open
priority: P1
depends_on: [020, 025]
umbrella: 024
---

# 更新日のメールdigestを送信する

## 目的

利用者が有効にした場合だけ、その日に発生した更新を一通へまとめて送る。

## スコープ

- email digestの有効化、timezone、送信時刻の設定。
- 未送信の対象通知を日単位でまとめるquery。
- Resend adapterとGraphile Worker job。
- HTMLとplain textのtemplate。
- bounce、complaint、unsubscribeの処理。
- 送信履歴と冪等性key。

## 実装方針

- 標準ではemailを無効にする。
- 更新がない日は送らない。
- 一利用者、一ローカル日付につき一通を上限とする。
- 公式閲覧linkを使い、将来のaffiliate linkへ書き換えない。
- 非公開情報とネタバレ本文をsubjectと本文へ含めない。
- email本文をapplication logへ記録しない。

## 受け入れ条件

- 有効な利用者へ更新があった日だけdigestを送る。
- 同じ日を再処理しても二重送信しない。
- timezoneの日付境界を正しく扱う。
- unsubscribe後は新しいdigestを作らない。
- bounceとcomplaintを記録し、恒久的な宛先を停止する。

## テスト

- timezone、日付境界、空digest、冪等性の単体テスト。
- Resend adapterを差し替えたworker統合テスト。
- templateに非公開fieldとネタバレ本文がないsnapshot test。

## 対象外

- 即時email。
- marketing email。
