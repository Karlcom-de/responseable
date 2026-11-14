'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupTextarea } from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Message } from '@/lib/store';

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

export default function RoomChat({ path }: { path: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const attempt = ++revision.current;
    try {
      const response = await fetch(path + '/chat', { cache: 'no-store' });
      if (!response.ok) throw Error();
      const received = (await response.json()).messages;
      if (attempt === revision.current) setMessages(received);
    } catch {
      if (attempt === revision.current) setError('Could not refresh chat. Try Refresh chat.');
    }
  }, [path]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
    return () => { ++revision.current; clearInterval(timer); };
  }, [refresh]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch(path + '/chat', { method: 'POST', body: draft });
      if (!response.ok) throw Error();
      setDraft(current => current === draft ? '' : current);
      await refresh();
    } catch {
      setError('Could not confirm delivery. Refresh chat before sending again.');
    } finally { setSending(false); }
  }

  return <Card className="panel chat" id="chat" role="region">
    <h2 className="iconLabel"><MessageSquare className="navIcon" aria-hidden="true" />Room chat</h2>
    <Button type="button" variant="ghost" onClick={() => { setError(''); void refresh(); }}>Refresh chat</Button>
    <ScrollArea className="chatScroll"><div className="messages" role="log" aria-label="Chat history">
      {messages.length ? messages.map(message => <article key={message.id}>
        <div className="messageMeta"><strong>{message.name}</strong>{message.guest === 1 && <span>Guest</span>}
          <time dateTime={new Date(Number(message.created)).toISOString()}>{clock.format(Number(message.created))}</time></div>
        <p>{message.body}</p>
      </article>) : <p className="muted">No messages yet.</p>}
    </div></ScrollArea>
    <form className="stack composer" onSubmit={send}>
      {error && <p role="alert">{error}</p>}
      <Field><FieldLabel htmlFor="room-message">Message</FieldLabel><InputGroup><InputGroupTextarea id="room-message"
        value={draft} onChange={event => setDraft(event.target.value)} rows={2} required maxLength={2000} /></InputGroup></Field>
      <Button type="submit" disabled={sending}>Send</Button>
    </form>
  </Card>;
}
