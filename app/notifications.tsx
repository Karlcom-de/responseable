import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { methodLabels, notificationsAvailable, statusLabels, providerLabels, type Provider, type Method, type Status } from '../lib/notifications';
import { smsInviteToken } from '../lib/invites';
import { query } from '../lib/store';
import { confirmNotification, prepareNotification } from './actions';
import { Notice } from './shell';

type Attempt = { id: string; number: string; body: string; method: Method; provider: Provider | null; status: Status; created: string };

export default async function Notifications({ incident, room, draft, error }: {
  incident: string; room: string; draft?: string; error: boolean;
}) {
  const available = notificationsAvailable();
  const attempts = await query<Attempt>(`
    SELECT n.id, n.number, n.method, n.provider, n.status, n.created FROM notifications n
    JOIN rooms ON rooms.id = n.room WHERE rooms.incident = $1 AND n.status <> 'draft'
    ORDER BY n.created DESC LIMIT 20
  `, [incident]);
  const [preview] = typeof draft === 'string' && /^[a-f0-9-]{36}$/.test(draft) ? await query<Attempt>(`
    SELECT id, number, body, method, provider FROM notifications WHERE id::text = $1 AND room = $2
      AND status = 'draft' AND created > $3
  `, [draft, room, Date.now() - 900_000]) : [];
  return <section className="roomForm">
    <h3>Alerting</h3>
    {error && <Notice>Check the phone number and provider configuration.</Notice>}
    {!Object.values(available).some(Boolean) ? <p className="muted">Phone alerting is not configured.</p>
      : <form className="stack" action={prepareNotification.bind(null, incident, room)}>
        <label>International phone number<Input name="number" type="tel" placeholder="+491234567890" required maxLength={16} /></label>
        <label>Action<NativeSelect name="method">
          {Object.entries(available).map(([method, provider]) => provider && <option key={method} value={method}>
            {methodLabels[method as Method]}{method === 'sms' || method === 'voice' ? ' · ' + providerLabels[provider] : ''}
          </option>)}
        </NativeSelect></label>
        {available.voice && <label>Voice alert message<Textarea name="speech" maxLength={500} rows={2} /></label>}
        <Button type="submit" variant="outline">Preview</Button>
      </form>}
    {preview && <div className="inviteResult">
      <p><strong>{methodLabels[preview.method]}</strong> · {preview.number}{preview.provider && ' · ' + providerLabels[preview.provider]}</p>
      {preview.body && <p className="description">{preview.body}
        {preview.method === 'sms' && !preview.body.includes('/einladung/') &&
          '\nInvitation: ' + process.env.RESPONSEABLE_PUBLIC_ORIGIN + '/j#' + smsInviteToken(preview.id)}
      </p>}
      <form action={confirmNotification.bind(null, incident, room, preview.id)}>
        <Button type="submit">{preview.method === 'sms' ? 'Send SMS' : preview.method === 'voice' ? 'Send voice alert' : 'Place call'}</Button>
      </form>
    </div>}
    {attempts.length > 0 && <ul className="attempts">{attempts.map(attempt => <li key={attempt.id}>
      {methodLabels[attempt.method]} · {attempt.number} · {statusLabels[attempt.status === 'pending' && Date.now() - Number(attempt.created) > 60_000 ? 'unknown' : attempt.status]}{attempt.provider && ' · ' + providerLabels[attempt.provider]}
    </li>)}</ul>}
  </section>;
}
