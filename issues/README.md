# issue一覧

issueの書式と状態管理は[docs/issues.md](../docs/issues.md)に従う。

## umbrella

- [001 実行基盤](./001-platform-foundation.md)
- [007 作品カタログと更新収集](./007-catalog-ingestion.md)
- [019 アカウントと読書管理](./019-library-management.md)
- [024 通知](./024-notifications.md)
- [028 読書活動と共有](./028-social-sharing.md)
- [033 公開ベータ](./033-launch-readiness.md)
- [037 お気に入りimport extension](./037-favorites-import-extension.md)

## critical path

```text
002 CI
  -> 003 Bun互換性
  -> 004 DBとjob
      +-> 008 catalog model
      |   +-> 021 読書進捗
      |   |   +-> 022 follow方式
      |   |   +-> 023 単行本記録
      |   |       +-> 025 アプリ内通知
      |   |           +-> 026 Push
      |   |           +-> 027 メール
      |   +-> 014 取込とrelease event
      |       +-> 015 catalog管理
      |       +-> 016 書誌
      +-> 009 取得元policy
          +-> 010 connector基盤
              +-> 011 共通feed
              +-> 012 ニコニコ漫画
              +-> 013 カドコミ
      +-> 020 認証
          +-> 038 WXT基盤

005 Asterion配備
  -> 006 バックアップと監視
      +-> 043 運用baselineと定期drill
      +-> 044 PostgreSQL collation更新
      +-> 045 database同期Jobの接続待機
      +-> 046 WAL-G physical backupのmemory上限

{008 catalog model, 021 読書進捗, 022 follow方式, 038 WXT基盤}
  -> 039 お気に入りimport
      +-> 040 共通feed型3サイト
      +-> 041 ニコニコ漫画
      +-> 042 カドコミ
```

identity、social、配備、品質試験は、各issueの`depends_on`を満たした時点でこのpathと並行して進める。
