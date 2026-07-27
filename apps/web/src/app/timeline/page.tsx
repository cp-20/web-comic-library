import { TimelineList } from './timeline-list';

export const metadata = { title: 'timeline | Web Comic Library' };

export default function TimelinePage() {
  return (
    <main>
      <h1>timeline</h1>
      <TimelineList />
    </main>
  );
}
