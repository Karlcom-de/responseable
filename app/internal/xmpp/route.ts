import { timingSafeEqual } from 'node:crypto';
import { reconcileXmpp } from '../../../lib/xmpp';

export async function GET(request: Request) {
  const secret = process.env.XMPP_RECONCILE_TOKEN;
  const provided = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from('Bearer ' + (secret || ''));
  if (!secret || secret.length < 32 || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return new Response(null, { status: 404 });
  }
  try {
    return Response.json({ reconciled: await reconcileXmpp(true) });
  } catch {
    return new Response(null, { status: 503 });
  }
}
