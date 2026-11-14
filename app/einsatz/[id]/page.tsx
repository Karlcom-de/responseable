import { notFound, redirect } from 'next/navigation';
import { query, roomPath, session } from '../../../lib/store';

export default async function IncidentEntry({ params }: { params: Promise<{ id: string }> }) {
  const [current, { id }] = await Promise.all([session(), params]);
  if (!current) redirect('/');
  const [room] = current.room === null
    ? await query('SELECT id FROM rooms WHERE incident = $1 AND main = 1', [id])
    : await query('SELECT id FROM rooms WHERE incident = $1 AND id = $2', [id, current.room]);
  if (!room) notFound();
  redirect(roomPath(id, String(room.id)));
}
