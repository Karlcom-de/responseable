import { databaseReady } from '../../../lib/store';

export async function GET() {
  const ok = await databaseReady().catch(() => false);
  return Response.json({ ok }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
