'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

type Segment = { id: string; speaker: string; text: string; timestamp: string };
type State = { available: boolean; draftAvailable: boolean; enabled: boolean; canManage: boolean; segments?: Segment[]; notes?: string };
type Capture = { stream: MediaStream; timer?: number; recorder?: MediaRecorder; abort: AbortController };
const time = (value: string) => new Date(Number(value)).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function MeetingNotes({ path, connected }: { path: string; connected: boolean }) {
  const api = path + '/transcript';
  const capture = useRef<Capture | null>(null);
  const requesting = useRef(false);
  const canCapture = useRef(false);
  const [state, setState] = useState<State>();
  const [recording, setRecording] = useState(false);
  const [notes, setNotes] = useState<string>();
  const [draft, setDraft] = useState<string>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function stop() {
    const current = capture.current;
    capture.current = null;
    if (!current) return;
    current.abort.abort();
    clearTimeout(current.timer);
    if (current.recorder?.state === 'recording') current.recorder.stop();
    for (const track of current.stream.getTracks()) track.stop();
  }

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch(api, { cache: 'no-store', signal: controller.signal });
        if (response.ok) setState(await response.json());
      } catch { /* Keep the last successful response while reconnecting. */ }
    }
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [api]);

  useEffect(() => {
    canCapture.current = connected && Boolean(state?.enabled && state.available);
    if (!canCapture.current) { stop(); setRecording(false); }
    return () => { canCapture.current = false; stop(); };
  }, [connected, state?.enabled, state?.available]);

  async function start() {
    if (capture.current || requesting.current || !canCapture.current) return;
    requesting.current = true;
    setError('');
    setStatus('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!canCapture.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const current = { stream, abort: new AbortController() } as Capture;
      capture.current = current;
      function record() {
        if (capture.current !== current) return;
        const recorder = new MediaRecorder(stream);
        current.recorder = recorder;
        const parts: Blob[] = [];
        recorder.ondataavailable = event => parts.push(event.data);
        recorder.onstop = async () => {
          if (capture.current !== current) return;
          const form = new FormData();
          form.set('id', crypto.randomUUID());
          form.set('consent', 'true');
          form.set('audio', new Blob(parts, { type: recorder.mimeType.split(';')[0] }), 'segment');
          try {
            const response = await fetch(api + '/segments', { method: 'POST', body: form, signal: current.abort.signal });
            if (!response.ok) throw new Error();
            record();
          } catch {
            if (capture.current !== current) return;
            stop(); setRecording(false); setError('Transcription stopped because the audio could not be processed.');
          }
        };
        recorder.start();
        current.timer = window.setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 5000);
      }
      record();
      setRecording(true);
    } catch {
      stop(); setRecording(false); setError('Microphone access was declined or unavailable. The meeting is unaffected.');
    } finally { requesting.current = false; }
  }

  async function update(body?: object) {
    if (pending) return;
    setPending(true); setError(''); setStatus('');
    try {
      const response = await fetch(api, body ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      } : { method: 'DELETE' });
      if (!response.ok) throw new Error();
      if (body && 'action' in body && body.action === 'draft') {
        const { draft } = await response.json();
        setDraft(draft ?? undefined);
        if (!draft) setStatus('No draft was available from the current transcript.');
      } else {
        if (!body) {
          stop(); setRecording(false); setNotes(undefined); setDraft(undefined); setDeleteOpen(false);
          setState(current => current && { ...current, enabled: false, notes: '', segments: [] });
        }
        else if ('action' in body && body.action === 'enable' && 'enabled' in body) {
          setState(current => current && { ...current, enabled: Boolean(body.enabled) });
        }
        setStatus(body ? 'Changes saved.' : 'Transcript and notes deleted.');
      }
    } catch { setError('The request could not be completed. Your edits are still here.'); }
    finally { setPending(false); }
  }

  if (!state || (!state.canManage && !state.available)) return null;
  const content = notes ?? state.notes ?? '';
  return <div className="grid gap-3">
    {(recording || state.enabled) && <p role="status"><Badge>{recording ? 'Transcribing your microphone' : 'Room transcription enabled'}</Badge></p>}
    {error && <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <p role="status">{status}</p>
    <Tabs defaultValue="transcript">
      <TabsList aria-label="Meeting records"><TabsTrigger value="transcript">Live transcript</TabsTrigger>
        {state.canManage && <TabsTrigger value="notes">Notes</TabsTrigger>}</TabsList>
      <TabsContent value="transcript" className="grid gap-3">
        {!state.available ? <p className="muted">Live transcription is unavailable.</p> : <>
          {state.canManage && <div><Button variant="outline" disabled={pending} onClick={() => update({ action: 'enable', enabled: !state.enabled })}>
            {state.enabled ? 'Disable room transcription' : 'Enable room transcription'}
          </Button></div>}
          {state.enabled && connected && <>
            <p>Your microphone audio will go to the configured speech-to-text provider after you opt in on this device. Other participants’ audio is not captured by this control.</p>
            <div>{recording ? <Button variant="outline" onClick={() => { stop(); setRecording(false); }}>Stop sharing microphone</Button>
              : <Button onClick={start}>Consent and start transcription</Button>}</div>
          </>}
          {state.enabled && !connected && <p className="muted">Join the meeting to opt in on this device.</p>}
        </>}
        {state.canManage && <ol aria-label="Finalized transcript" className="grid max-h-64 gap-2 overflow-auto">
          {state.segments?.map(segment => <li key={segment.id}><strong>{segment.speaker}</strong> · <time dateTime={new Date(Number(segment.timestamp)).toISOString()}>{time(segment.timestamp)}</time>
            <p className="description">{segment.text}</p></li>)}
        </ol>}
      </TabsContent>
      {state.canManage && <TabsContent value="notes" className="grid gap-3">
        <Field><FieldLabel htmlFor="meeting-notes">Meeting notes</FieldLabel>
          <Textarea id="meeting-notes" value={content} maxLength={30000} rows={6} onChange={event => setNotes(event.target.value)} /></Field>
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => update({ action: 'save', notes: content })}>Save notes</Button>
          <Button variant="outline" onClick={() => {
            const transcript = state.segments?.map(item => time(item.timestamp) + ' ' + item.speaker + ': ' + item.text).join('\n') ?? '';
            const url = URL.createObjectURL(new Blob([content + '\n\n' + transcript], { type: 'text/plain' }));
            const link = document.createElement('a'); link.href = url; link.download = 'meeting-record.txt'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>Export notes and transcript</Button>
        </div>
        {state.draftAvailable && <>
          <p className="muted">Generating a draft sends finalized transcript text to the configured language model. Review the result before saving.</p>
          <div><Button variant="outline" disabled={pending} onClick={() => update({ action: 'draft' })}>Generate draft</Button></div>
          {draft !== undefined && <Field>
            <FieldLabel htmlFor="meeting-draft">Review draft</FieldLabel>
            <Textarea id="meeting-draft" value={draft} maxLength={30000} rows={6} onChange={event => setDraft(event.target.value)} />
            <div><Button variant="outline" onClick={() => { const combined = content ? content + '\n\n' + draft : draft; if (combined.length > 30000) { setError('Shorten your notes or draft before combining them.'); return; } setNotes(combined); setDraft(undefined); }}>Add draft to notes</Button></div>
          </Field>}
        </>}
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}><DialogTrigger render={<Button variant="ghost" />}>Delete transcript and notes</DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Delete transcript and notes?</DialogTitle>
            <DialogDescription>This clears the stored meeting record and disables room transcription.</DialogDescription></DialogHeader>
            <Button variant="destructive" disabled={pending} onClick={() => update()}>Confirm deletion</Button>
          </DialogContent>
        </Dialog>
      </TabsContent>}
    </Tabs>
  </div>;
}
