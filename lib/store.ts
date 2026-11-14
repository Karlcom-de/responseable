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
    'SELECT demo FROM responseable_mode WHERE EXISTS (SELECT 1 FROM responseable_schema WHERE version = 10)',
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
  const [salt, digest, extra] = (process.env.RESPONSEABLE_PASSWORD_HASH || '').split(':');
  if (!operator || extra !== undefined || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(digest ?? '')) return false;
  const matches = timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(digest, 'hex'));
  return name === operator && matches;
}

type Session = { sessionHash: string; name: string; room: string | null };
export async function session() {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value || !validToken(value)) return undefined;
  return (await query<Session>(
    'SELECT sessions.hash AS "sessionHash", sessions.name, room FROM sessions JOIN responseable_mode ON demo = $3 WHERE hash = $1 AND expires > $2 AND NOT EXISTS (SELECT 1 FROM invitations WHERE id = sessions.invite_id AND revoked_at IS NOT NULL) AND (room IS NOT NULL OR demo OR mfa_verified OR (NOT $4 AND NOT EXISTS (SELECT 1 FROM operator_mfa WHERE operator = sessions.name)))',
    [hash(value), Date.now(), demo, process.env.RESPONSEABLE_MFA_REQUIRED === 'true'],
  ))[0];
}

export async function endSession() {
  const jar = await cookies();
  const value = jar.get(cookieName)?.value;
  if (value && validToken(value)) await query('DELETE FROM sessions WHERE hash = $1', [hash(value)]);
  jar.delete(cookieName);
}

export async function startSession(name: string, room: string | null, expires: number, verified = false) {
  if (!await databaseReady()) throw new Error('Datenbankmodus oder Schema stimmt nicht.');
  await endSession();
  const value = token();
  await query('INSERT INTO sessions (hash, name, room, expires, mfa_verified) VALUES ($1, $2, $3, $4, $5)', [hash(value), name, room, expires, verified]);
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
  return current;
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
