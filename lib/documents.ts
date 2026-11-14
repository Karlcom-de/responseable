import 'server-only';
import { query, newId } from './store';

export type Document = {
  id: string; slug: string; kind: 'wiki' | 'playbook'; title: string; body: string;
  visibility: 'private' | 'room'; revision: number; updatedAt: string;
};
const metadata = 'id, slug, kind, title, visibility, revision, updated_at AS "updatedAt"';
export const listDocuments = (room: string, canEdit: boolean) =>
  query<Omit<Document, 'body'>>(`SELECT ${metadata} FROM documents WHERE room = $1 AND ($2 OR visibility = 'room') ORDER BY title, slug`, [room, canEdit]);
export async function getDocument(room: string, slug: string, canEdit: boolean) {
  return (await query<Document>(`SELECT ${metadata}, body FROM documents WHERE room = $1 AND slug = $2 AND ($3 OR visibility = 'room')`, [room, slug, canEdit]))[0];
}

export async function documentInput(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 192_000) { await reader.cancel(); return; }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (!data || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 120 ||
      typeof data.body !== 'string' || data.body.length > 40_000 ||
      (data.visibility !== 'room' && data.visibility !== 'private')) return;
    if (data.title.includes('\0') || data.body.includes('\0')) return;
    return { ...data, title: data.title.trim() } as Document;
  } catch {
    return;
  }
}

export async function createDocument(room: string, doc: Document) {
  return (await query<Document>(`
    INSERT INTO documents (id, room, slug, kind, title, body, visibility)
    VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (room, slug) DO NOTHING
    RETURNING ${metadata}, body
  `, [newId(), room, doc.slug, doc.kind, doc.title, doc.body, doc.visibility]))[0];
}

export async function updateDocument(room: string, slug: string, doc: Document) {
  return (await query<Document>(`
    UPDATE documents SET title = $3, body = $4, visibility = $5, revision = revision + 1, updated_at = now()
    WHERE room = $1 AND slug = $2 AND revision = $6 RETURNING ${metadata}, body
  `, [room, slug, doc.title, doc.body, doc.visibility, doc.revision]))[0];
}
