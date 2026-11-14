'use server';

import { enrolled, required } from '../lib/mfa';
import { redeemInvite, smsInviteToken } from '../lib/invites';
import { randomUUID } from 'node:crypto';
import { dispatch, isMethod, notificationsAvailable, type Method, type Provider } from '../lib/notifications';
import { notFound, redirect } from 'next/navigation';
import { query, demo, accountsEnabled, roomManagement, endSession, hash, newId, operatorLogin, roomInIncident, roomPath, session, startSession, token } from '../lib/store';

function field(form: FormData, name: string, max: number, trim = true) {
  const value = form.get(name);
  if (typeof value !== 'string' || value.length > max) return '';
  return trim ? value.trim() : value;
}

async function operator() {
  const current = await session();
  if (!current) redirect('/');
  if (current.room !== null) notFound();
  return current;
}

export async function login(form: FormData) {
  const name = field(form, 'name', 80);
  const password = field(form, 'password', 256, false);
  if (accountsEnabled() || !name || !password || !operatorLogin(name, password)) redirect('/?fehler=anmeldung');
  if (required() || await enrolled()) redirect('/?fehler=anmeldung');
  await startSession(name, null, Date.now() + 8 * 3600_000);
  redirect('/');
}

export async function enterDemo() {
  if (!demo) notFound();
  await startSession('Exercise lead', null, Date.now() + 8 * 3600_000);
  redirect(roomPath('demo', 'demo-haupt'));
}

export async function logout() {
  await endSession();
  redirect('/');
}

export async function createIncident(form: FormData) {
  const current = await operator();
  if (accountsEnabled() && !demo && current.role !== "admin") notFound();
  const title = field(form, 'title', 100);
  const summary = field(form, 'summary', 1500);
  if (!title) redirect('/?fehler=titel');
  const incident = newId();
  const room = newId();
  await query(`
    WITH created AS (INSERT INTO incidents VALUES ($1, $2, $3, $4) RETURNING id)
    INSERT INTO rooms SELECT $5, id, 'Incident command', 1 FROM created
  `, [incident, title, summary, Date.now(), room]);
  redirect(roomPath(incident, room));
}

export async function createRoom(incident: string, currentRoom: string, form: FormData) {
  if (!await roomManagement(incident, currentRoom)) notFound();
  const name = field(form, 'name', 80);
  if (!name) redirect(roomPath(incident, currentRoom) + '?fehler=raum');
  const room = newId();
  await query('INSERT INTO rooms VALUES ($1, $2, $3, 0)', [room, incident, name]);
  redirect(roomPath(incident, room));
}

export async function createInvitation(incident: string, room: string) {
  if (!await roomManagement(incident, room)) notFound();
  const value = token();
  await query('INSERT INTO invitations (hash, room, expires) VALUES ($1, $2, $3)', [hash(value), room, Date.now() + 3600_000]);
  redirect(roomPath(incident, room) + '?einladung=' + value);
}

export async function join(value: string, form: FormData) {
  const name = field(form, 'name', 80);
  if (!name || name.includes('\0')) notFound();
  const result = await redeemInvite(value, name);
  if (!result.href) notFound();
  redirect(result.href);
}

export async function prepareNotification(incident: string, room: string, form: FormData) {
  const current = await roomManagement(incident, room);
  if (!current) notFound();
  const active = await roomInIncident(incident, room);
  if (!active) notFound();
  const path = roomPath(incident, room);
  const available = notificationsAvailable();
  const method = field(form, 'method', 12);
  const number = field(form, 'number', 16);
  if (!/^\+[1-9][0-9]{7,14}$/.test(number) ||
    !isMethod(method) || !available[method]) {
    redirect(path + '?fehler=alarmierung');
  }
  const provider = available[method];
  const speech = method === 'voice' ? field(form, 'speech', 500) : '';
  if (method === 'voice' && !speech) redirect(path + '?fehler=alarmierung');
  const id = randomUUID();
  const now = Date.now();
  if (method === 'sms') {
    const origin = process.env.RESPONSEABLE_PUBLIC_ORIGIN;
    if (!origin) redirect(path + '?fehler=alarmierung');
    const [entry] = await query<{ title: string }>('SELECT title FROM incidents WHERE id = $1', [incident]);
    const linkToken = smsInviteToken(id);
    const body = `${entry.title} · ${active.name}`;
    await query(`
      WITH invite AS (INSERT INTO invitations (hash, room, expires) VALUES ($1, $2, $3) RETURNING hash)
      INSERT INTO notifications (id, room, operator, number, method, status, created, body, invite_hash, provider)
      SELECT $4, $2, $5, $6, 'sms', 'draft', $7, $8, hash, $9 FROM invite
    `, [hash(linkToken), room, 0, id, current.accountId ?? current.name, number, now, body, provider]);
  } else {
    await query(`
      INSERT INTO notifications (id, room, operator, number, method, status, created, body, provider)
      VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8)
    `, [id, room, current.accountId ?? current.name, number, method, now, speech, provider]);
  }
  redirect(path + '?vorschau=' + id);
}

export async function confirmNotification(incident: string, room: string, id: string) {
  const current = await roomManagement(incident, room);
  if (!current) notFound();
  const path = roomPath(incident, room);
  const available = notificationsAvailable();
  const now = Date.now();
  const [claimed] = await query<{ number: string; method: Method; provider: Provider; body: string }>(`
    WITH claimed AS (
      UPDATE notifications SET status = 'pending', created = $5
      WHERE id = $1 AND room = $2 AND operator = $3 AND status = 'draft' AND created > $4
        AND COALESCE(provider, CASE WHEN method = 'sip' THEN 'sip' ELSE 'android' END) = ($6::jsonb ->> method)
      RETURNING number, method, body, invite_hash, ($6::jsonb ->> method) AS provider
    ), activated AS (
      UPDATE invitations SET expires = $7 FROM claimed WHERE invitations.hash = claimed.invite_hash
    )
    SELECT number, method, body, provider FROM claimed
  `, [id, room, current.accountId ?? current.name, now - 900_000, now, JSON.stringify(available), now + 900_000]);
  if (claimed) {
    const body = claimed.method === 'sms' && !claimed.body.includes('/einladung/')
      ? claimed.body + '\nInvitation: ' + process.env.RESPONSEABLE_PUBLIC_ORIGIN + '/j#' + smsInviteToken(id)
      : claimed.body;
    const status = await dispatch(claimed.provider, claimed.method, id, room, claimed.number, body);
    await query('UPDATE notifications SET status = $2, body = $3 WHERE id = $1', [id, status, '']);
  } else {
    const [draft] = await query('SELECT id FROM notifications WHERE id = $1 AND room = $2 AND operator = $3 AND status = $4',
      [id, room, current.accountId ?? current.name, 'draft']);
    if (draft) redirect(path + '?fehler=alarmierung');
  }
  redirect(path);
}
