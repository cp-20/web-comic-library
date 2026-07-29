import { ShareButton } from '../../share-button';
import { ActivityDetails } from './activity-details';

export const generateMetadata = async ({
  params,
}: Readonly<{ params: Promise<{ activityId: string }> }>) => {
  const { activityId } = await params;
  return {
    alternates: { canonical: `/activities/${activityId}` },
    description: 'Web Comic Libraryの公開読書記録',
    title: '公開読書記録 | Web Comic Library',
  };
};

export default async function ActivityPage({
  params,
}: Readonly<{ params: Promise<{ activityId: string }> }>) {
  const { activityId } = await params;
  return (
    <div className="grid gap-8">
      <ActivityDetails activityId={activityId} />
      <ShareButton title="公開読書記録 | Web Comic Library" url={`/activities/${activityId}`} />
    </div>
  );
}
