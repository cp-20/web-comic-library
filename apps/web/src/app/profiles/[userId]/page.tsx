import { ShareButton } from '../../share-button';
import { ProfileFollow } from './profile-follow';

export const generateMetadata = async ({
  params,
}: Readonly<{ params: Promise<{ userId: string }> }>) => {
  const { userId } = await params;
  return {
    alternates: { canonical: `/profiles/${userId}` },
    title: 'プロフィール | Web Comic Library',
  };
};

export default async function ProfilePage({
  params,
}: Readonly<{ params: Promise<{ userId: string }> }>) {
  const { userId } = await params;
  return (
    <main>
      <ProfileFollow userId={userId} />
      <ShareButton title="プロフィール | Web Comic Library" url={`/profiles/${userId}`} />
    </main>
  );
}
