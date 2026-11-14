'use server';

import { randomUUID } from 'node:crypto';
import { dispatch, notificationsAvailable, type Method } from '../lib/notifications';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query, demo, endSession, hash, invitation, newId, operatorLogin, roomInIncident, roomPath, session, startSession, token } from '../lib/store';

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
  if (!name || !password || !operatorLogin(name, password)) redirect('/?fehler=anmeldung');
  await startSession(name, null, Date.now() + 8 * 3600_000);
  redirect('/');
}

export async function enterDemo() {
  if (!demo) notFound();
  await startSession('Übungsleitung', null, Date.now() + 8 * 3600_000);
  redirect(roomPath('demo', 'demo-haupt'));
}

export async function logout() {
  await endSession();
  redirect('/');
}

export async function createIncident(form: FormData) {
  await operator();
  const title = field(form, 'title', 100);
  const summary = field(form, 'summary', 1500);
  if (!title) redirect('/?fehler=titel');
  const incident = newId();
  const room = newId();
  await query(`
    WITH created AS (INSERT INTO incidents VALUES ($1, $2, $3, $4) RETURNING id)
    INSERT INTO rooms SELECT $5, id, 'Einsatzleitung', 1 FROM created
  `, [incident, title, summary, Date.now(), room]);
  redirect(roomPath(incident, room));
}

export async function createRoom(incident: string, currentRoom: string, form: FormData) {
  await operator();
  if (!await roomInIncident(incident, currentRoom)) notFound();
  const name = field(form, 'name', 80);
  if (!name) redirect(roomPath(incident, currentRoom) + '?fehler=raum');
  const room = newId();
  await query('INSERT INTO rooms VALUES ($1, $2, $3, 0)', [room, incident, name]);
  redirect(roomPath(incident, room));
}

export async function createInvitation(incident: string, room: string) {
  await operator();
  if (!await roomInIncident(incident, room)) notFound();
  const value = token();
  await query('INSERT INTO invitations VALUES ($1, $2, $3)', [hash(value), room, Date.now() + 3600_000]);
  redirect(roomPath(incident, room) + '?einladung=' + value);
}

export async function join(value: string, form: FormData) {
  const invite = await invitation(value);
  if (!invite) notFound();
  const name = field(form, 'name', 80);
  if (!name) redirect('/einladung/' + value + '?fehler=name');
  await startSession(name, invite.room, Number(invite.expires));
  redirect(roomPath(invite.incident, invite.room));
}

export async function sendMessage(incident: string, room: string, form: FormData) {
  const current = await session();
  if (!current) redirect('/');
  if ((current.room !== null && current.room !== room) || !await roomInIncident(incident, room)) notFound();
  const body = field(form, 'body', 2000);
  const path = roomPath(incident, room);
  if (!body) redirect(path + '?fehler=nachricht');
  await query('INSERT INTO messages(room, name, guest, body, created) VALUES ($1, $2, $3, $4, $5)',
    [room, current.name, Number(current.room !== null), body, Date.now()]);
  revalidatePath(path);
  redirect(path);
}

export async function prepareNotification(incident: string, room: string, form: FormData) {
  const current = await operator();
  const active = await roomInIncident(incident, room);
  if (!active) notFound();
  const path = roomPath(incident, room);
  const available = notificationsAvailable();
  const method = field(form, 'method', 12);
  const number = field(form, 'number', 16);
  if (!/^\+[1-9][0-9]{7,14}$/.test(number) ||
    !((method === 'sms' || method === 'android') && available.android || method === 'sip' && available.sip)) {
    redirect(path + '?fehler=alarmierung');
  }
  const id = randomUUID();
  const now = Date.now();
  if (method === 'sms') {
    const origin = process.env.RESPONSEABLE_PUBLIC_ORIGIN;
    if (!origin) redirect(path + '?fehler=alarmierung');
    const [entry] = await query<{ title: string }>('SELECT title FROM incidents WHERE id = $1', [incident]);
    const linkToken = token();
    const body = `${entry.title} · ${active.name}\nEinladung: ${origin}/einladung/${linkToken}`;
    await query(`
      WITH invite AS (INSERT INTO invitations VALUES ($1, $2, $3) RETURNING hash)
      INSERT INTO notifications (id, room, operator, number, method, status, created, body, invite_hash)
      SELECT $4, $2, $5, $6, 'sms', 'draft', $7, $8, hash FROM invite
    `, [hash(linkToken), room, 0, id, current.name, number, now, body]);
  } else {
    await query(`
      INSERT INTO notifications (id, room, operator, number, method, status, created)
      VALUES ($1, $2, $3, $4, $5, 'draft', $6)
    `, [id, room, current.name, number, method, now]);
  }
  redirect(path + '?vorschau=' + id);
}

export async function confirmNotification(incident: string, room: string, id: string) {
  const current = await operator();
  if (!await roomInIncident(incident, room)) notFound();
  const path = roomPath(incident, room);
  const available = notificationsAvailable();
  const now = Date.now();
  const [claimed] = await query<{ number: string; method: Method; body: string }>(`
    WITH claimed AS (
      UPDATE notifications SET status = 'pending', created = $5
      WHERE id = $1 AND room = $2 AND operator = $3 AND status = 'draft' AND created > $4
        AND ((method IN ('sms', 'android') AND $6) OR (method = 'sip' AND $7))
      RETURNING number, method, body, invite_hash
    ), activated AS (
      UPDATE invitations SET expires = $8 FROM claimed WHERE invitations.hash = claimed.invite_hash
    )
    SELECT number, method, body FROM claimed
  `, [id, room, current.name, now - 900_000, now, available.android, available.sip, now + 3600_000]);
  if (claimed) {
    const status = await dispatch(claimed.method, id, room, claimed.number, claimed.body);
    await query('UPDATE notifications SET status = $2, body = $3 WHERE id = $1', [id, status, '']);
  }
  redirect(path);
}
