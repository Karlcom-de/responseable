'use client';

import { useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

type Invite = { id: string; expires: string; maxUses: number; remainingUses: number };
const expiry = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export default function RoomInvites({ path, room }: { path: string; room: string }) {
  const api = path + '/invites';
  const [invites, setInvites] = useState<Invite[]>([]);
  const [created, setCreated] = useState<{ id: string; link: string; qr: string }>();
  const [group, setGroup] = useState(false);
  const [pending, setPending] = useState(false);
  const [revoke, setRevoke] = useState<string>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function load() {
    try {
      const response = await fetch(api, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      setInvites((await response.json()).invites);
    } catch { setError('Could not load active invitations.'); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxUses: group ? Number(form.get('maxUses')) : 1, expiresInMinutes: Number(form.get('minutes')) }),
      });
      if (!response.ok) throw new Error();
      const { invite, href } = await response.json() as { invite: Invite; href: string };
      const link = new URL(href, location.origin);
      if (link.origin !== location.origin || link.pathname !== '/j' || !link.hash) throw new Error();
      setCreated({ id: invite.id, link: link.href, qr: '' });
      setInvites(current => [invite, ...current]);
      try {
        const qr = await QRCode.toDataURL(link.href, { margin: 2, width: 180 });
        setCreated(current => current?.id === invite.id ? { ...current, qr } : current);
      } catch { setStatus('QR code unavailable. You can still copy the guest link.'); }
    } catch { setError('Could not create the invitation.'); }
    finally { setPending(false); }
  }

  async function remove(id: string) {
    setPending(true);
    setError('');
    try {
      const response = await fetch(api + '/' + encodeURIComponent(id), { method: 'DELETE' });
      if (!response.ok) throw new Error();
      setInvites(current => current.filter(item => item.id !== id));
      setCreated(current => current?.id === id ? undefined : current);
      setRevoke(undefined);
      setStatus('Invitation revoked.');
    } catch { setError('Could not revoke the invitation.'); }
    finally { setPending(false); }
  }

  return <Dialog onOpenChange={open => {
    setError('');
    setStatus('');
    if (open) void load();
    else setRevoke(undefined);
  }}>
    <DialogTrigger render={<Button variant="outline" />}>Invite</DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Invite responders</DialogTitle>
        <DialogDescription>Room: {room}. The guest link grants room access. Share it only with the intended guests.</DialogDescription>
      </DialogHeader>
      {error && <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <form onSubmit={create}><FieldGroup>
        <Field><FieldLabel htmlFor="invite-type">Invitation type</FieldLabel>
          <NativeSelect id="invite-type" value={group ? 'group' : 'single'} onChange={event => setGroup(event.target.value === 'group')}>
            <option value="single">One guest</option><option value="group">Group invite</option>
          </NativeSelect></Field>
        {group && <Field><FieldLabel htmlFor="invite-count">Maximum guests</FieldLabel>
          <Input id="invite-count" name="maxUses" type="number" min={2} max={50} defaultValue={2} required /></Field>}
        <Field><FieldLabel htmlFor="invite-expiry">Expires in minutes</FieldLabel>
          <Input id="invite-expiry" name="minutes" type="number" min={1} max={60} defaultValue={15} required /></Field>
        <Button type="submit" disabled={pending}>Create invite</Button>
      </FieldGroup></form>
      {created && <div className="grid gap-3">
        <Field><FieldLabel htmlFor="guest-link">Guest link</FieldLabel><Input id="guest-link" value={created.link} readOnly onFocus={event => event.target.select()} /></Field>
        <p className="muted">Host: {new URL(created.link).host}</p>
        <Button type="button" variant="outline" onClick={async () => {
          try { await navigator.clipboard.writeText(created.link); setStatus('Guest link copied.'); }
          catch { setStatus('Select the guest link and copy it manually.'); }
        }}>Copy guest link</Button>
        {created.qr && <img src={created.qr} width={180} height={180} alt={'Guest invitation QR code for ' + room} />}
      </div>}
      <p role="status">{status}</p>
      {invites.length > 0 && <section>
        <h3>Active invitations</h3>
        <ul className="grid gap-3">{invites.map(invite => <li key={invite.id}>
          <p>{invite.remainingUses} of {invite.maxUses} uses left · Expires {expiry.format(Number(invite.expires))}</p>
          {revoke === invite.id ? <div className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={pending} onClick={() => remove(invite.id)}>Confirm revoke</Button>
            <Button variant="ghost" disabled={pending} onClick={() => setRevoke(undefined)}>Cancel</Button>
          </div> : <Button variant="ghost" disabled={pending} onClick={() => setRevoke(invite.id)}>Revoke invite</Button>}
        </li>)}</ul>
      </section>}
    </DialogContent>
  </Dialog>;
}
