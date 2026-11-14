import { randomUUID } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';
import { demo, roomAccess } from '../../../../../lib/store';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; room: string }> }) {
  const { id, room } = await params;
  const current = await roomAccess(id, room);
  if (!current) return new Response(null, { status: 404 });
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (demo || !LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return new Response(null, { status: 503 });
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    name: current.name, identity: randomUUID(), ttl: '2m',
  });
  token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false });
  return Response.json({ url: LIVEKIT_URL, token: await token.toJwt() });
}
