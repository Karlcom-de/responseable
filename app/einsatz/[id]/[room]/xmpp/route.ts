import { roomAccess } from '../../../../../lib/store';
import { bootstrap, xmppRoom } from '../../../../../lib/xmpp';

type Context = { params: Promise<{ id: string; room: string }> };

export async function GET(_: Request, { params }: Context) {
  const { id, room } = await params;
  if (!await roomAccess(id, room)) return new Response(null, { status: 404 });
  return Response.json({ enabled: process.env.XMPP_PILOT_ENABLED === "true" && Boolean(await xmppRoom(room)), assetsBase: process.env.XMPP_ASSETS_BASE });
}

export async function POST(_: Request, { params }: Context) {
  const { id, room } = await params;
  const current = await roomAccess(id, room);
  if (!current) return new Response(null, { status: 404 });
  if (process.env.XMPP_PILOT_ENABLED !== "true") return new Response(null, { status: 503 });
  try {
    const credentials = await bootstrap(room, current.sessionHash);
    return credentials ? Response.json(credentials) : new Response(null, { status: 404 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
