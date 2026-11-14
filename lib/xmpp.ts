import 'server-only';
import { affiliate, identity, password } from '../scripts/xmpp/admin.mjs';
import { db } from './store';

export async function xmppRoom(room: string) {
  return (await db().query<{ muc: string }>('SELECT muc FROM xmpp_rooms WHERE room=$1', [room])).rows[0];
}

function settings() {
  const { XMPP_ADMIN_URL: admin, XMPP_ADMIN_TOKEN: bearer, XMPP_JWT_SECRET: secret,
    XMPP_DOMAIN: domain, XMPP_MUC_DOMAIN: service, XMPP_WEBSOCKET_URL: websocketUrl } = process.env;
  if (!admin || !bearer || !secret || secret.length < 32 || !domain || !service ||
    !websocketUrl || (new URL(websocketUrl).protocol !== 'wss:' && !(process.env.RESPONSEABLE_MODE === 'demo' && process.env.XMPP_EXERCISE_LOOPBACK === 'true' && websocketUrl === 'ws://127.0.0.1:7883/xmpp-websocket'))) throw Error('XMPP unavailable');
  return { admin, bearer, secret, domain, service, websocketUrl };
}

export async function bootstrap(room: string, sessionHash: string) {
  const config = settings();
  const connection = await db().connect();
  try {
    await connection.query('BEGIN');
    const { rows: [grant] } = await connection.query<{ expires: string; muc: string }>(`
      SELECT s.expires, x.muc FROM sessions s JOIN xmpp_rooms x ON x.room=$1
      WHERE s.hash=$2 AND (s.room IS NULL OR s.room=$1) AND s.expires>$3
      AND (s.invite_id IS NULL OR EXISTS (
        SELECT 1 FROM invitations i WHERE i.id=s.invite_id AND i.revoked_at IS NULL AND i.expires>$3
      )) FOR UPDATE OF s
    `, [room, sessionHash, Date.now()]);
    if (!grant) return;
    const user = identity(config.secret, sessionHash, room);
    const jid = user + '@' + config.domain;
    const expiresAt = Math.min(Number(grant.expires), Date.now() + 60_000);
    await connection.query(`
      INSERT INTO xmpp_grants (room,session_hash,jid) VALUES ($1,$2,$3)
      ON CONFLICT (room,session_hash) DO NOTHING
    `, [room, sessionHash, jid]);
    // Persist the reconciliation record before making an external change.
    await connection.query('COMMIT');
    await reconcileXmpp(false, room, sessionHash);
    return { jid, nick: user, password: password(config.secret, jid, expiresAt),
      roomJid: grant.muc + '@' + config.service, websocketUrl: config.websocketUrl, expiresAt };
  } finally {
    await connection.query('ROLLBACK').catch(() => {});
    connection.release();
  }
}

export async function reconcileXmpp(revocationsOnly: boolean, room?: string, sessionHash?: string) {
  const config = settings();
  const connection = await db().connect();
  try {
    await connection.query('BEGIN');
    const { rows } = await connection.query<{ room: string; session_hash: string; jid: string; muc: string; active: boolean }>(`
      SELECT g.room,g.session_hash,g.jid,x.muc,
        COALESCE(s.expires>$1 AND (s.invite_id IS NULL OR (i.revoked_at IS NULL AND i.expires>$1)),false) AS active
      FROM xmpp_grants g JOIN xmpp_rooms x ON x.room=g.room
      LEFT JOIN sessions s ON s.hash=g.session_hash LEFT JOIN invitations i ON i.id=s.invite_id
      WHERE ($2::text IS NULL OR g.room=$2) AND ($3::text IS NULL OR g.session_hash=$3)
        AND (NOT $4 OR NOT COALESCE(s.expires>$1 AND (s.invite_id IS NULL OR (i.revoked_at IS NULL AND i.expires>$1)),false))
      LIMIT 20 FOR UPDATE OF g SKIP LOCKED
    `, [Date.now(), room ?? null, sessionHash ?? null, revocationsOnly]);
    if (!revocationsOnly && !rows[0]?.active) throw Error('XMPP grant no longer active');
    for (const grant of rows) {
      await affiliate(config.admin, config.bearer, grant.muc, config.service, grant.jid, grant.active);
      if (!grant.active) {
        await connection.query('DELETE FROM xmpp_grants WHERE room=$1 AND session_hash=$2', [grant.room, grant.session_hash]);
      }
    }
    await connection.query('COMMIT');
    return rows.length;
  } finally {
    await connection.query('ROLLBACK').catch(() => {});
    connection.release();
  }
}
