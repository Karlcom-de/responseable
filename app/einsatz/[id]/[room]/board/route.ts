import { db, query, roomAccess } from '../../../../../lib/store';

type Context = { params: Promise<{ id: string; room: string }> };
type Element = { id: string; version: number; versionNonce: number; type: string; isDeleted: boolean };
const supported = new Set(['rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'freedraw', 'text', 'frame']);
function valid(element: Element) {
  return element && typeof element.id === 'string' && /^[\w-]{1,80}$/.test(element.id)
    && supported.has(element.type) && typeof element.isDeleted === 'boolean'
    && Number.isSafeInteger(element.version) && element.version > 0 && Number.isSafeInteger(element.versionNonce);
}

export async function GET(_: Request, { params }: Context) {
  const { id, room } = await params;
  if (!await roomAccess(id, room)) return new Response(null, { status: 404 });
  const [board] = await query<{ elements: Record<string, Element>; revision: number }>(
    'SELECT elements, revision FROM boards WHERE room = $1', [room],
  );
  return Response.json({ elements: Object.values(board?.elements ?? {}), revision: board?.revision ?? 0 });
}

export async function POST(request: Request, { params }: Context) {
  const { id, room } = await params;
  if (!await roomAccess(id, room)) return new Response(null, { status: 404 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 256_000) {
      await reader.cancel();
      return new Response(null, { status: 413 });
    }
    chunks.push(value);
  }
  let incoming: Element[];
  try {
    incoming = JSON.parse(Buffer.concat(chunks).toString());
    if (!Array.isArray(incoming) || incoming.length > 300 || !incoming.every(valid)) throw Error();
  } catch {
    return new Response(null, { status: 400 });
  }
  const connection = await db().connect();
  try {
    await connection.query('BEGIN');
    await connection.query('INSERT INTO boards(room) VALUES ($1) ON CONFLICT DO NOTHING', [room]);
    const { rows: [{ elements }] } = await connection.query<{ elements: Record<string, Element> }>(
      'SELECT elements FROM boards WHERE room = $1 FOR UPDATE', [room],
    );
    const merged = new Map(Object.entries(elements));
    let changed = false;
    for (const next of incoming) {
      const old = merged.get(next.id);
      if (old?.isDeleted) continue;
      if (!old || next.version > old.version || (next.version === old.version &&
        (next.isDeleted || next.versionNonce > old.versionNonce))) {
        merged.set(next.id, next);
        changed = true;
      }
    }
    if (changed) {
      const document = JSON.stringify(Object.fromEntries(merged));
      if (merged.size > 2000 || Buffer.byteLength(document) > 2_000_000) {
        await connection.query('ROLLBACK');
        return new Response(null, { status: 413 });
      }
      await connection.query('UPDATE boards SET elements = $1, revision = revision + 1 WHERE room = $2', [document, room]);
    }
    await connection.query('COMMIT');
    return new Response(null, { status: 204 });
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
}
