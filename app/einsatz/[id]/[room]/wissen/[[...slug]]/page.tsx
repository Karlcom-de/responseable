import { notFound } from 'next/navigation';
import { Header } from '@/app/shell';
import Documents from '@/app/documents';
import { roomAccess, roomInIncident, roomPath } from '@/lib/store';

export default async function Knowledge({ params }: {
  params: Promise<{ id: string; room: string; slug?: string[] }>;
}) {
  const { id, room, slug } = await params;
  const current = await roomAccess(id, room);
  if (!current || (slug && slug.length !== 1)) notFound();
  const active = await roomInIncident(id, room);
  if (!active) notFound();
  return <><Header name={current.name} guest={Boolean(current.room)} /><main className="overview">
    <Documents key={slug?.[0] ?? ''} path={roomPath(id, room)} slug={slug?.[0]} room={active.name} />
  </main></>;
}
