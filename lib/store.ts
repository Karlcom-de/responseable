import 'server-only';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { cookies } from 'next/headers';

export const demo = process.env.RESPONSEABLE_MODE === 'demo';
const cookieName = demo ? 'ra_demo_session' : 'ra_session';
let pool: Pool | undefined;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL fehlt.');
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000, query_timeout: 5000 });
    pool.on('error', () => console.warn('PostgreSQL: Leerlaufverbindung verloren.'));
  }
  return pool;
}

export async function databaseReady() {
  const result = await db().query<{ demo: boolean }>(
    'SELECT demo FROM responseable_mode WHERE EXISTS (SELECT 1 FROM responseable_schema WHERE version = 12)',
  );
  return result.rows[0]?.demo === demo;
}

export async function query<T extends Record<string, unknown>>(sql: string, values: unknown[] = []) {
  return (await db().query<T>(sql, values)).rows;
}

export const token = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const newId = () => randomBytes(12).toString('hex');
export const validToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

export function operatorLogin(name: string, password: string) {
  const operator = process.env.RESPONSEABLE_OPERATOR;
  return name === operator && passwordMatches(password, process.env.RESPONSEABLE_PASSWORD_HASH);
}

export function passwordMatches(password: string, encoded?: string) {
  const [salt, digest, extra] = (encoded || '').split(':');
  if (extra !== undefined || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(digest ?? '')) return false;
  const matches = timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(digest, 'hex'));
  return matches;
}

export type AccountRole = 'admin' | 'coordinator' | 'responder';
export type Session = { sessionHash: string; name: string; room: string | null; accountId: string | null; role: AccountRole | null };

export const accountsEnabled = () => process.env.RESPONSEABLE_ACCOUNTS_ENABLED === "true";

// The prefix keeps authenticated account sessions out of the old SHA-256-only lookup.
const accountSessionHash = (value: string) => 'account:' + hash(value);

export async function incidentCapability(current: Session, incident: string, manage = false) {
  if (current.room !== null) return false;
  if (current.role === 'admin' || ((demo || !accountsEnabled()) && current.accountId === null)) return true;
  if (!current.accountId || (manage && current.role !== 'coordinator')) return false;
  return Boolean((await query('SELECT 1 FROM incident_accounts WHERE account_id=$1 AND incident_id=$2', [current.accountId, incident]))[0]);
}
export async function session() {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value || !validToken(value)) return undefined;
  return (await query<Session>(
    'SELECT sessions.hash AS "sessionHash", COALESCE(accounts.display_name,sessions.name) AS name, room, accounts.id AS "accountId", accounts.role FROM sessions LEFT JOIN accounts ON accounts.id=sessions.account_id JOIN responseable_mode ON demo = $3 WHERE (sessions.hash = $1 OR ($4 AND sessions.hash = $6)) AND expires > $2 AND (sessions.account_id IS NULL OR (accounts.active AND NOT accounts.require_password_change AND accounts.credential_generation=sessions.credential_generation AND sessions.mfa_verified)) AND NOT EXISTS (SELECT 1 FROM invitations WHERE id = sessions.invite_id AND revoked_at IS NOT NULL) AND (room IS NOT NULL OR demo OR sessions.account_id IS NOT NULL OR (NOT $4 AND (mfa_verified OR (NOT $5 AND NOT EXISTS (SELECT 1 FROM operator_mfa WHERE operator = sessions.name)))))',
    [hash(value), Date.now(), demo, accountsEnabled(), process.env.RESPONSEABLE_MFA_REQUIRED === "true", accountSessionHash(value)],
  ))[0];
}

export async function endSession() {
  const jar = await cookies();
  const value = jar.get(cookieName)?.value;
  if (value && validToken(value)) await query('DELETE FROM sessions WHERE hash IN ($1,$2)', [hash(value), accountSessionHash(value)]);
  jar.delete(cookieName);
}

export async function startSession(name: string, room: string | null, expires: number, verified = false, identity?: { id: string; generation: number }) {
  if (!await databaseReady()) throw new Error('Datenbankmodus oder Schema stimmt nicht.');
  await endSession();
  const value = token();
  if (identity) {
    const inserted = await query('INSERT INTO sessions (hash,name,room,expires,mfa_verified,account_id,credential_generation) SELECT $1,$2,$3,$4,$5,id,credential_generation FROM accounts WHERE id=$6 AND active AND NOT require_password_change AND credential_generation=$7 RETURNING hash', [accountSessionHash(value), name, room, expires, verified, identity.id, identity.generation]);
    if (!inserted.length) throw Error('Account credentials changed');
  } else {
    await query('INSERT INTO sessions (hash, name, room, expires, mfa_verified) VALUES ($1, $2, $3, $4, $5)', [hash(value), name, room, expires, verified]);
  }
  await setSessionCookie(value, expires);
}

export async function setSessionCookie(value: string, expires: number) {
  (await cookies()).set(cookieName, value, {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.RESPONSEABLE_SECURE_COOKIE !== 'false',
    path: '/', expires: new Date(expires),
  });
}

export type Incident = { id: string; title: string; summary: string };
export type Room = { id: string; name: string; main: number };
export type Message = { id: string; name: string; guest: number; body: string; created: string };

export async function roomInIncident(incident: string, room: string) {
  return (await query<Room>('SELECT id, name, main FROM rooms WHERE incident = $1 AND id = $2', [incident, room]))[0];
}

export async function roomAccess(incident: string, room: string) {
  const current = await session();
  if (!current || (current.room !== null && current.room !== room) || !await roomInIncident(incident, room)) return undefined;
  if (current.room === null && !await incidentCapability(current, incident)) return undefined;
  return current;
}

export async function roomManagement(incident: string, room: string) {
  const current = await roomAccess(incident, room);
  return current && await incidentCapability(current, incident, true) ? current : undefined;
}

export async function invitation(value: string) {
  if (!validToken(value)) return undefined;
  return (await query<{ room: string; incident: string; name: string; expires: string }>(`
    SELECT rooms.id AS room, rooms.incident, rooms.name, invitations.expires
    FROM invitations JOIN rooms ON rooms.id = invitations.room JOIN responseable_mode ON demo = $3
    WHERE hash = $1 AND expires > $2 AND revoked_at IS NULL AND uses < max_uses
  `, [hash(value), Date.now(), demo]))[0];
}

export const roomPath = (incident: string, room: string) => `/einsatz/${incident}/${room}`;
