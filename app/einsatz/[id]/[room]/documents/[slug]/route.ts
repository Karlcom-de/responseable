import { documentInput, getDocument, updateDocument } from '../../../../../../lib/documents';
import { roomAccess, roomManagement } from '../../../../../../lib/store';

type Context = { params: Promise<{ id: string; room: string; slug: string }> };
const missing = () => Response.json({ error: 'not_found' }, { status: 404 });

export async function GET(_: Request, { params }: Context) {
  const { id, room, slug } = await params;
  const current = await roomAccess(id, room);
  if (!current) return missing();
  const canEdit = Boolean(await roomManagement(id, room));
  const document = await getDocument(room, slug, canEdit);
  return document ? Response.json({ document, canEdit }) : missing();
}

export async function PATCH(request: Request, { params }: Context) {
  const { id, room, slug } = await params;
  if (!await roomManagement(id, room)) return missing();
  const data = await documentInput(request);
  if (!data || !Number.isInteger(data.revision) || data.revision < 1 || data.revision > 2147483647) {
    return Response.json({ error: 'invalid_input' }, { status: 400 });
  }
  const document = await updateDocument(room, slug, data);
  if (document) return Response.json({ document });
  return await getDocument(room, slug, true)
    ? Response.json({ error: 'revision_conflict' }, { status: 409 }) : missing();
}
