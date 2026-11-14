import 'server-only';
import { reconcileXmpp } from "./xmpp";
import { createHmac } from 'node:crypto';
import { demo, hash, query, roomPath, session, setSessionCookie, token, validToken } from './store';

const fields = 'id, expires, max_uses AS "maxUses", max_uses - uses AS "remainingUses"';
type Invite = { id: string; expires: string; maxUses: number; remainingUses: number };
export const activeInvites = (room: string) => query<Invite>(`
  SELECT ${fields} FROM invitations
  WHERE room = $1 AND expires > $2 AND revoked_at IS NULL AND uses < max_uses ORDER BY expires
`, [room, Date.now()]);

export async function issueInvite(room: string, maxUses = 1, minutes = 15) {
  const value = token();
  const [invite] = await query<Invite>(`
    INSERT INTO invitations (hash, room, expires, max_uses) VALUES ($1, $2, $3, $4)
    RETURNING ${fields}
  `, [hash(value), room, Date.now() + minutes * 60_000, maxUses]);
  return { invite, href: '/j#' + value };
}

export async function revokeInvite(room: string, id: string) {
  const revoked = (await query(`
    UPDATE invitations SET revoked_at = $3 WHERE id = $1 AND room = $2 AND revoked_at IS NULL RETURNING id
  `, [id, room, Date.now()])).length > 0;
  if (revoked && process.env.XMPP_ADMIN_URL) await reconcileXmpp(true, room).catch(() => {});
  return revoked;
}

export async function redeemInvite(value: string, name: string) {
  if (!validToken(value)) return { error: 'not_found' } as const;
  if ((await session())?.room === null) return { error: 'operator_signed_in' } as const;
  const sessionToken = token();
  const [entry] = await query<{ incident: string; room: string; expires: string }>(`
    WITH claimed AS (
      UPDATE invitations SET uses = uses + 1
      WHERE hash = $1 AND expires > $2 AND revoked_at IS NULL AND uses < max_uses
        AND EXISTS (SELECT 1 FROM responseable_mode WHERE demo = $5)
      RETURNING id, room, expires
    ), created AS (
      INSERT INTO sessions (hash, name, room, expires, invite_id)
      SELECT $3, $4, room, expires, id FROM claimed
      RETURNING room, expires
    )
    SELECT rooms.incident, created.room, created.expires FROM created JOIN rooms ON rooms.id = created.room
  `, [hash(value), Date.now(), hash(sessionToken), name, demo]);
  if (!entry) return { error: 'not_found' } as const;
  await setSessionCookie(sessionToken, Number(entry.expires));
  return { href: roomPath(entry.incident, entry.room) } as const;
}

export function smsInviteToken(id: string) {
  const key = process.env.RESPONSEABLE_INVITE_KEY || process.env.RESPONSEABLE_PASSWORD_HASH;
  if (!key) throw new Error('Invite signing key unavailable.');
  return createHmac('sha256', key).update('responseable/sms-invite/v1:' + id).digest('base64url');
}
