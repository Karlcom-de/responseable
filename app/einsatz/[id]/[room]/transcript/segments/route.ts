import { aiBudget, aiConfig, aiRequest } from '../../../../../../lib/ai';
import { query, roomAccess } from '../../../../../../lib/store';

export async function POST(request: Request, { params }: { params: Promise<{ id: string; room: string }> }) {
  const { id, room } = await params;
  const current = await roomAccess(id, room);
  if (!current) return new Response(null, { status: 404 });
  if (!aiConfig('STT')) return new Response(null, { status: 503 });
  const [settings] = await query<{ enabled: boolean; generation: number }>('SELECT enabled,generation FROM transcript_settings WHERE room=$1', [room]);
  if (!settings?.enabled) return new Response(null, { status: 409 });
  const size = Number(request.headers.get('content-length'));
  if (!Number.isSafeInteger(size) || size < 1 || size > 1_500_000) return new Response(null, { status: 413 });
  const data = await request.formData().catch(() => undefined);
  const audio = data?.get('audio');
  const segment = data?.get('id');
  if (!(audio instanceof File) || !audio.size || audio.size > 1_400_000 ||
    !/^audio\/(webm|ogg|mp4|wav)(?:;|$)/.test(audio.type) ||
    typeof segment !== 'string' || !/^[a-f0-9-]{36}$/.test(segment) || data?.get('consent') !== 'true') {
    return new Response(null, { status: 400 });
  }
  if (!await aiBudget(current.name, 'STT')) return new Response(null, { status: 429 });
  const [claimed] = await query(`
    INSERT INTO transcript_segments (room,id,speaker,text,created,generation)
    SELECT room,$2,$3,'',$4,generation FROM transcript_settings WHERE room=$1 AND enabled AND generation=$5
    ON CONFLICT DO NOTHING RETURNING id
  `, [room, segment, current.name, Date.now(), settings.generation]);
  if (!claimed) return new Response(null, { status: 204 });
  try {
    const form = new FormData();
    form.set('file', audio, { 'audio/ogg': 'segment.ogg', 'audio/mp4': 'segment.m4a', 'audio/wav': 'segment.wav' }[audio.type.split(';')[0]] ?? 'segment.webm');
    const result = await aiRequest('STT', form);
    const text = typeof result.text === 'string' ? result.text.trim().slice(0, 4000).replaceAll('\0', '') : '';
    if (text) await query(`
      UPDATE transcript_segments t SET text=$3 FROM transcript_settings s
      WHERE t.room=$1 AND t.id=$2 AND s.room=t.room AND s.generation=t.generation
    `, [room, segment, text]);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 502 });
  }
}
