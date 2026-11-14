import { invitation } from '../../../lib/store';

export async function POST(request: Request) {
  const data = await request.json().catch(() => null);
  const invite = typeof data?.token === 'string' ? await invitation(data.token) : undefined;
  return invite ? Response.json({ roomName: invite.name })
    : Response.json({ error: 'not_found' }, { status: 404 });
}
