import { ReadingControls } from './reading-controls';

export default async function WorkPage({
  params,
}: Readonly<{ params: Promise<{ workId: string }> }>) {
  const { workId } = await params;

  return (
    <main>
      <h1>作品</h1>
      <p>作品ID: {workId}</p>
      <ReadingControls workId={workId} />
    </main>
  );
}
