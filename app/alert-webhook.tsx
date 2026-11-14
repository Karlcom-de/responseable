'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

type Result = 'accepted' | 'unclear' | 'pending' | 'retry';
const labels: Record<Result, string> = {
  accepted: 'Acknowledged by the receiver. Alarm activation is unconfirmed.',
  unclear: 'The receiver did not confirm the alert. Check the alarm directly before sending again.',
  pending: 'This request is still pending. Check the alarm directly.',
  retry: 'The response could not be read. Check this same request before starting another alert.',
};

export default function AlertWebhook({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<Result>();
  const [sending, setSending] = useState(false);
  const submission = useRef<{ id: string; message: string } | undefined>(undefined);
  const inFlight = useRef(false);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || (result && result !== 'retry')) return;
    submission.current ??= { id: crypto.randomUUID(), message };
    inFlight.current = true;
    setSending(true);
    try {
      const response = await fetch(path + '/alert-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission.current),
      });
      if (!response.ok) throw new Error();
      const { status } = await response.json();
      if (status !== 'accepted' && status !== 'unclear' && status !== 'pending') throw new Error();
      setResult(status);
    } catch {
      setResult('retry');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return <Dialog open={open} onOpenChange={value => { if (!inFlight.current) setOpen(value); }}>
    <DialogTrigger render={<Button variant="outline" />}>Preview alarm webhook</DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <DialogTitle className="pr-7">Send alarm webhook</DialogTitle>
      <DialogDescription>Destination: configured alarm webhook. Sending may activate the connected alarm.</DialogDescription>
      <form className="stack" onSubmit={send}>
        <label>Message (optional)
          <Textarea rows={3} maxLength={240} value={message} readOnly={sending || result !== undefined}
            onChange={event => setMessage(event.target.value)} />
        </label>
        <p role="status">{sending ? 'Sending…' : result && labels[result]}</p>
        {(!result || result === 'retry') && <Button type="submit" disabled={sending}>
          {result === 'retry' ? 'Check same request' : 'Send alarm webhook'}
        </Button>}
        {result && <Button type="button" variant="outline" disabled={sending} onClick={() => {
          submission.current = undefined;
          setMessage('');
          setResult(undefined);
        }}>Prepare a new alert</Button>}
      </form>
    </DialogContent>
  </Dialog>;
}
