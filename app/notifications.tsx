import { methodLabels, notificationsAvailable, statusLabels, type Method, type Status } from '../lib/notifications';
import { query } from '../lib/store';
import { confirmNotification, prepareNotification } from './actions';
import { Notice } from './shell';

type Attempt = { id: string; number: string; body: string; method: Method; status: Status; created: string };

export default async function Notifications({ incident, room, draft, error }: {
  incident: string; room: string; draft?: string; error: boolean;
}) {
  const available = notificationsAvailable();
  const attempts = await query<Attempt>(`
    SELECT n.id, n.number, n.method, n.status, n.created FROM notifications n
    JOIN rooms ON rooms.id = n.room WHERE rooms.incident = $1 AND n.status <> 'draft'
    ORDER BY n.created DESC LIMIT 20
  `, [incident]);
  const [preview] = typeof draft === 'string' && /^[a-f0-9-]{36}$/.test(draft) ? await query<Attempt>(`
    SELECT id, number, body, method FROM notifications WHERE id::text = $1 AND room = $2
      AND status = 'draft' AND created > $3
  `, [draft, room, Date.now() - 900_000]) : [];
  return <section className="roomForm">
    <h3>Alarmierung</h3>
    {error && <Notice>Bitte prüfen Sie Rufnummer und Dienstkonfiguration.</Notice>}
    {!available.android && !available.sip ? <p className="muted">Telefoniedienst nicht eingerichtet.</p>
      : <form className="stack" action={prepareNotification.bind(null, incident, room)}>
        <label>Internationale Rufnummer<input name="number" type="tel" placeholder="+491234567890" required maxLength={16} /></label>
        <label>Aktion<select name="method">
          {available.android && <><option value="sms">SMS</option><option value="android">{methodLabels.android}</option></>}
          {available.sip && <option value="sip">{methodLabels.sip}</option>}
        </select></label>
        <button className="secondary">Vorschau anzeigen</button>
      </form>}
    {preview && <div className="inviteResult">
      <p><strong>{methodLabels[preview.method]}</strong> · {preview.number}</p>
      {preview.body && <p className="description">{preview.body}</p>}
      <form action={confirmNotification.bind(null, incident, room, preview.id)}>
        <button>{preview.method === 'sms' ? 'SMS senden' : 'Anruf auslösen'}</button>
      </form>
    </div>}
    {attempts.length > 0 && <ul className="attempts">{attempts.map(attempt => <li key={attempt.id}>
      {methodLabels[attempt.method]} · {attempt.number} · {statusLabels[attempt.status === 'pending' && Date.now() - Number(attempt.created) > 60_000 ? 'unknown' : attempt.status]}
    </li>)}</ul>}
  </section>;
}
