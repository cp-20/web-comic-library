import { ReadingControls } from './reading-controls';
import { ReviewControls } from './review-controls';
import { WorkDetails } from './work-details';

export const generateMetadata = async ({
  params,
}: Readonly<{ params: Promise<{ workId: string }> }>) => {
  const { workId } = await params;
  return { alternates: { canonical: `/works/${workId}` }, title: '作品 | Web Comic Library' };
};

export default async function WorkPage({
  params,
}: Readonly<{ params: Promise<{ workId: string }> }>) {
  const { workId } = await params;

  return (
    <main>
      <WorkDetails workId={workId} />
      <ReadingControls workId={workId} />
      <ReviewControls workId={workId} />
    </main>
  );
}
