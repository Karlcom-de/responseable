import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RoomCanvas } from '@/app/board';
import { Header } from '@/app/shell';
import { roomAccess, roomInIncident, roomPath } from '@/lib/store';

export default async function WhiteboardPage({ params }: {
  params: Promise<{ id: string; room: string }>;
}) {
  const { id, room } = await params;
  const current = await roomAccess(id, room);
  if (!current) notFound();
  const active = await roomInIncident(id, room);
  if (!active) notFound();
  const path = roomPath(id, room);
  return <><Header name={current.name} guest={Boolean(current.room)} />
    <main className="whiteboardPage">
      <Link href={path} className="back">← Back to room</Link>
      <h1>Whiteboard</h1>
      <p className="muted">{active.name}</p>
      <RoomCanvas path={path} />
    </main>
  </>;
}
