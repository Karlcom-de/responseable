import { createDocument, documentInput, listDocuments } from '../../../../../lib/documents';
import { roomAccess } from '../../../../../lib/store';

type Context = { params: Promise<{ id: string; room: string }> };
export async function GET(_: Request, { params }: Context) {
  const { id, room } = await params;
  const current = await roomAccess(id, room);
  if (!current) return Response.json({ error: 'not_found' }, { status: 404 });
  const canEdit = current.room === null;
  return Response.json({ documents: await listDocuments(room, canEdit), canEdit });
}

export async function POST(request: Request, { params }: Context) {
  const { id, room } = await params;
  if ((await roomAccess(id, room))?.room !== null) return Response.json({ error: 'not_found' }, { status: 404 });
  const data = await documentInput(request);
  if (!data || typeof data.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug) || data.slug.length > 80 ||
    (data.kind !== 'wiki' && data.kind !== 'playbook')) return Response.json({ error: 'invalid_input' }, { status: 400 });
  const document = await createDocument(room, data);
  return document ? Response.json({ document }, { status: 201 }) : Response.json({ error: 'slug_conflict' }, { status: 409 });
}
