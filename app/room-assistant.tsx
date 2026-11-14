'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

type Answer = { answer: string | null; citations: { title: string; section: string; revision: number; href: string }[] };

export default function RoomAssistant({ path, slug }: { path: string; slug?: string }) {
  const api = path + '/assistant';
  const [available, setAvailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Answer>();
  const [indexed, setIndexed] = useState<number>();

  useEffect(() => {
    const controller = new AbortController();
    fetch(api, { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (response.ok) setAvailable(Boolean((await response.json()).available));
    }).catch(() => {});
    return () => controller.abort();
  }, [api]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const question = new FormData(event.currentTarget).get('question');
    setPending(true);
    setError('');
    setResult(undefined);
    try {
      const response = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slug ? { action: 'index', slug } : { action: 'ask', question }),
      });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      if (slug) setIndexed(payload.revision);
      else setResult(payload);
    } catch { setError('The assistant could not complete this request. Try again later.'); }
    finally { setPending(false); }
  }

  if (!available) return null;
  return <section className="grid gap-3" aria-labelledby="assistant-title">
    <h2 id="assistant-title">{slug ? 'Index for the room assistant' : 'Ask about room documents'}</h2>
    <p className="muted">{slug
      ? 'Indexing sends this saved document, including private content, to the configured embeddings provider.'
      : 'Your question goes to the configured embeddings provider. The language model receives your question and matching excerpts from indexed room documents, including private content.'}</p>
    <form onSubmit={submit}><FieldGroup>
      {!slug && <Field><FieldLabel htmlFor="assistant-question">Question</FieldLabel>
        <Textarea id="assistant-question" name="question" rows={2} required maxLength={1000} /></Field>}
      <div><Button type="submit" variant="outline" disabled={pending}>{pending ? 'Working…' : slug ? 'Index this document' : 'Ask assistant'}</Button></div>
    </FieldGroup></form>
    {error && <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {indexed !== undefined && <p role="status">Indexed revision {indexed}.</p>}
    {result && <div role="status" className="grid gap-2">
      <p className="description">{result.answer || 'No supported answer was found in the indexed room documents.'}</p>
      {result.citations.length > 0 && <ul className="listing">{result.citations.filter(citation => citation.href.startsWith(path + '/wissen/')).map((citation, index) => <li key={index}>
        <Link href={citation.href}>{citation.title} · {citation.section} · Revision {citation.revision}</Link>
      </li>)}</ul>}
    </div>}
  </section>;
}
