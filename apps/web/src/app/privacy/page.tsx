import { PageHeader } from '../../components/ui/page-header';

export const metadata = { title: 'privacy policy | Web Comic Library' };

export default function PrivacyPage() {
  return (
    <div className="grid gap-8">
      <PageHeader title="privacy policy" />
      <div className="grid max-w-[68ch] gap-6">
        <p>
          email
          address、表示名、profile、読書・所蔵・follow・感想・通知設定を、サービス提供のために処理します。
        </p>
        <p>
          実名、生年月日、住所は収集しません。認証情報、session、二要素認証の秘密情報は公開もdata
          exportもされません。
        </p>
        <p>
          利用者は設定画面から自身のdataをJSONでexportできます。account削除後は直ちに第三者から非表示となり、30日以内に個人dataを削除します。
        </p>
        <p>backup内の削除対象は通常の保持期間で失効し、復元時は削除台帳を再適用します。</p>
      </div>
    </div>
  );
}
