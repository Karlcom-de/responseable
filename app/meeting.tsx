'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';

const Media = dynamic(() => import('./media'), { ssr: false });

export default function Meeting({ path, enabled }: { path: string; enabled: boolean }) {
  const [access, setAccess] = useState<{ url: string; token: string }>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function connect() {
    setError('');
    setPending(true);
    try {
      const response = await fetch(path + '/meeting', { method: 'POST' });
      if (!response.ok) throw Error();
      setAccess(await response.json());
    } catch {
      setError('Der Meetingbeitritt ist fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }

  return <section className="roomForm">
    <h3>Meeting</h3>
    {!enabled ? <p className="muted">Meetingdienst nicht eingerichtet.</p>
      : access ? <Media {...access} leave={() => setAccess(undefined)} fail={() => {
        setAccess(undefined);
        setError('Verbindung zum Meetingdienst fehlgeschlagen.');
      }} />
        : <button className="secondary" disabled={pending} onClick={connect}>{pending ? 'Verbindung läuft …' : 'Meeting beitreten'}</button>}
    {error && <p className="notice" role="alert">{error}</p>}
  </section>;
}
