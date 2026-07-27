import { ProfileFollow } from './profile-follow';

export default async function ProfilePage({
  params,
}: Readonly<{ params: Promise<{ userId: string }> }>) {
  const { userId } = await params;
  return (
    <main>
      <ProfileFollow userId={userId} />
    </main>
  );
}
