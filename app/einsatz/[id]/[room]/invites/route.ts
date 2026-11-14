import { activeInvites, issueInvite } from '../../../../../lib/invites';
import { roomManagement } from '../../../../../lib/store';

type Context = { params: Promise<{ id: string; room: string }> };
export async function GET(_: Request, { params }: Context) {
  const { id, room } = await params;
  if (!await roomManagement(id, room)) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json({ invites: await activeInvites(room) });
}

export async function POST(request: Request, { params }: Context) {
  const { id, room } = await params;
  if (!await roomManagement(id, room)) return Response.json({ error: 'not_found' }, { status: 404 });
  const data = await request.json().catch(() => null);
  const maxUses = data?.maxUses ?? 1;
  const expiresInMinutes = data?.expiresInMinutes ?? 15;
  if (!data || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 50 ||
    !Number.isInteger(expiresInMinutes) || expiresInMinutes < 1 || expiresInMinutes > 60) {
    return Response.json({ error: 'invalid_input' }, { status: 400 });
  }
  return Response.json(await issueInvite(room, maxUses, expiresInMinutes), { status: 201 });
}
