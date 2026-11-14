'use client';
import { Button } from '@/components/ui/button';

import dynamic from 'next/dynamic';
import MeetingNotes from './meeting-notes';
import { useState } from 'react';

const Media = dynamic(() => import('./media'), { ssr: false });

export default function Meeting({ path, enabled }: { path: string; enabled: boolean }) {
  const [access, setAccess] = useState<{ url: string; token: string }>();
  const [connected, setConnected] = useState(false);
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
      setError('Could not join the meeting.');
    } finally {
      setPending(false);
    }
  }

  return <section className="roomForm">
    <h3>Meeting</h3>
    {!enabled ? <p className="muted">Meetings are not configured.</p>
      : access ? <Media {...access} connected={() => setConnected(true)} leave={() => { setConnected(false); setAccess(undefined); }} fail={() => {
        setConnected(false);
        setAccess(undefined);
        setError('Could not connect to the meeting service.');
      }} />
        : <Button variant="outline" disabled={pending} onClick={connect}>{pending ? 'Connecting…' : 'Join meeting'}</Button>}
    <MeetingNotes path={path} connected={connected} />
    {error && <p className="notice" role="alert">{error}</p>}
  </section>;
}
