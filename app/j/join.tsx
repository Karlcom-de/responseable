'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export default function GuestJoin() {
  const originalToken = useRef<string | undefined>(undefined);
  const [token, setToken] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [room, setRoom] = useState('');
  const unavailable = 'This invitation is unavailable. Ask the incident lead for a new link.';
  useEffect(() => {
    const value = originalToken.current ?? location.hash.slice(1);
    originalToken.current = value;
    if (location.hash) history.replaceState(history.state, '', location.pathname);
    if (!value) { setError(unavailable); return; }
    setToken(value);
    const controller = new AbortController();
    fetch('/j/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: value }), signal: controller.signal,
    }).then(async response => {
      if (response.ok) setRoom((await response.json()).roomName);
      else if (response.status === 404) { setToken(undefined); setError(unavailable); }
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || pending) return;
    setPending(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/j/redeem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: form.get('name') }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.error === 'operator_signed_in') setError('You are signed in as an operator. Open the original invitation in a separate browser session.');
        else if (response.status === 404) { setToken(undefined); setError(unavailable); }
        else setError('Could not join. Check your display name and try again.');
        return;
      }
      const destination = new URL(result.href, location.origin);
      if (destination.origin !== location.origin || !destination.pathname.startsWith('/einsatz/')) throw new Error();
      location.replace(destination.href);
    } catch { setError('Could not join. Try again or ask the incident lead for a new link.'); }
    finally { setPending(false); }
  }

  return <Card><CardHeader><h1>{room || 'Room invitation'}</h1></CardHeader>
    <CardContent className="grid gap-4">
      {error && <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {token && <form onSubmit={join}><FieldGroup>
        <Field><FieldLabel htmlFor="guest-name">Display name</FieldLabel><Input id="guest-name" name="name" autoComplete="nickname" required maxLength={80} /></Field>
        <Button type="submit" disabled={pending}>Join room</Button>
      </FieldGroup></form>}
    </CardContent>
  </Card>;
}
