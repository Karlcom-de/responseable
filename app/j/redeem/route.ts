import { redeemInvite } from '../../../lib/invites';

export async function POST(request: Request) {
  const data = await request.json().catch(() => null);
  if (typeof data?.token !== 'string' || typeof data.name !== 'string' ||
    !data.name.trim() || data.name.length > 80 || data.name.includes('\0')) {
    return Response.json({ error: 'invalid_input' }, { status: 400 });
  }
  const result = await redeemInvite(data.token, data.name.trim());
  return Response.json(result, { status: result.error === 'not_found' ? 404 : result.error ? 409 : 200 });
}
