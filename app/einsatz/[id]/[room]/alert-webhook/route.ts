import { alertEndpoint, deliverAlert } from '../../../../../lib/alert-webhook.mjs';
import { accountsEnabled, demo, query, roomManagement } from '../../../../../lib/store';

export async function POST(request: Request, context: { params: Promise<{ id: string; room: string }> }) {
  const { id, room } = await context.params;
  const missing = () => new Response(null, { status: 404 });
  const token = process.env.RESPONSEABLE_ALERT_WEBHOOK_TOKEN;
  const endpoint = alertEndpoint(process.env.RESPONSEABLE_ALERT_WEBHOOK_URL, token);
  if (demo || !accountsEnabled() || !endpoint || !process.env.RESPONSEABLE_PUBLIC_ORIGIN ||
      request.headers.get('origin') !== process.env.RESPONSEABLE_PUBLIC_ORIGIN) return missing();
  const actor = await roomManagement(id, room);
  if (!actor?.accountId) return missing();
  const data = await request.json().catch(() => null);
  if (typeof data?.id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(data.id) ||
      (data.message !== undefined && (typeof data.message !== 'string' || data.message.length > 240 || data.message.includes('\0')))) {
    return new Response(null, { status: 400 });
  }

  const [delivery] = await query<{ created: Date }>(`
    INSERT INTO alert_webhook_deliveries (id, room, account_id, status)
    VALUES ($1, $2, $3, 'pending') ON CONFLICT DO NOTHING RETURNING created
  `, [data.id, room, actor.accountId]);
  if (!delivery) {
    const [existing] = await query<{ status: string }>(`
      SELECT CASE WHEN status='pending' AND created < now()-interval '10 seconds'
        THEN 'unclear' ELSE status END AS status
      FROM alert_webhook_deliveries WHERE id=$1 AND room=$2 AND account_id=$3
    `, [data.id, room, actor.accountId]);
    return existing ? Response.json(existing) : new Response(null, { status: 409 });
  }
  const message = data.message?.trim();
  const status = await deliverAlert(endpoint, token, {
    type: 'incident.alert.requested', id: data.id, timestamp: delivery.created.toISOString(),
    incidentId: id, roomId: room, ...(message ? { message } : {}),
  });
  await query('UPDATE alert_webhook_deliveries SET status=$2 WHERE id=$1', [data.id, status]);
  return Response.json({ status });
}
