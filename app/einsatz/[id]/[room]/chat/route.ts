import { query, roomAccess, type Message } from '../../../../../lib/store';

type Context = { params: Promise<{ id: string; room: string }> };

export async function GET(_: Request, { params }: Context) {
  const { id, room } = await params;
  if (!await roomAccess(id, room)) return new Response(null, { status: 404 });
  const messages = await query<Message>('SELECT id, name, guest, body, created FROM messages WHERE room = $1 ORDER BY id DESC LIMIT 100', [room]);
  return Response.json({ messages });
}

export async function POST(request: Request, { params }: Context) {
  const { id, room } = await params;
  const current = await roomAccess(id, room);
  if (!current) return new Response(null, { status: 404 });
  if ((await query("SELECT 1 FROM xmpp_rooms WHERE room=$1", [room])).length) return new Response(null, { status: 409 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8000) {
      await reader.cancel();
      return new Response(null, { status: 413 });
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  if (text.length > 2000 || !text.trim() || text.includes('\0')) return new Response(null, { status: 400 });
  const key = request.headers.get('idempotency-key');
  if (!key || !/^[a-f0-9-]{36}$/.test(key)) return new Response(null, { status: 400 });
  await query('INSERT INTO messages(room, name, guest, body, created, submission) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (room, submission) DO NOTHING',
    [room, current.name, Number(current.room !== null), text.trim(), Date.now(), key]);
  return new Response(null, { status: 204 });
}
