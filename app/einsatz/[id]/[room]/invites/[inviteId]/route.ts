import { revokeInvite } from '../../../../../../lib/invites';
import { roomManagement } from '../../../../../../lib/store';

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; room: string; inviteId: string }> }) {
  const { id, room, inviteId } = await params;
  if (!await roomManagement(id, room) || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(inviteId) ||
    !await revokeInvite(room, inviteId)) return Response.json({ error: 'not_found' }, { status: 404 });
  return new Response(null, { status: 204 });
}
