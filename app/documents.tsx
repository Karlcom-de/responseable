'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import RoomAssistant from './room-assistant';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Document } from '@/lib/documents';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

type Draft = Pick<Document, 'slug' | 'kind' | 'title' | 'body' | 'visibility'>;
type Data = { documents?: Omit<Document, 'body'>[]; document?: Document; canEdit: boolean };
const empty: Draft = { slug: '', kind: 'wiki', title: '', body: '', visibility: 'private' };
const labels = { wiki: 'Wiki', playbook: 'Runbook / Playbook', private: 'Private to operators', room: 'Published to the room' };

function Reading({ body }: { body: string }) {
  return <div className="markdown-content"><Markdown skipHtml remarkPlugins={[remarkGfm]}
    disallowedElements={['img']} urlTransform={url => /^(?:#[\w-]*|https?:\/\/)/i.test(url) ? url : ''}
    components={{ a: ({ href, children }) => href ? <a href={href}>{children}</a> : <span>{children}</span> }}>
    {body}
  </Markdown></div>;
}

export default function Documents({ path, slug, room }: { path: string; slug?: string; room: string }) {
  const router = useRouter();
  const api = path + '/documents' + (slug ? '/' + encodeURIComponent(slug) : '');
  const knowledge = path + '/wissen';
  const [data, setData] = useState<Data>();
  const [draft, setDraft] = useState<Draft>();
  const [conflict, setConflict] = useState<Document>();
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(api, { cache: 'no-store', signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then(setData).catch(() => {
      if (!controller.signal.aborted) setError('Documents are unavailable.');
    });
    return () => controller.abort();
  }, [api]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || pending || conflict) return;
    setPending(true);
    setError('');
    try {
      const { title, body, visibility } = draft;
      const response = await fetch(api, {
        method: slug ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slug ? { title, body, visibility, revision: data?.document?.revision } : draft),
      });
      if (response.status === 409) {
        if (!slug) { setError('This URL slug is already in use.'); return; }
        const latest = await fetch(api, { cache: 'no-store' });
        if (!latest.ok) throw new Error();
        setConflict((await latest.json()).document);
        return;
      }
      if (!response.ok) throw new Error();
      const { document } = await response.json() as { document: Document };
      if (slug) setData({ document, canEdit: true });
      else router.push(knowledge + '/' + encodeURIComponent(document.slug));
      setDraft(undefined);
    } catch {
      setError('Could not save. Your draft is still open.');
    } finally {
      setPending(false);
    }
  }

  const document = data?.document;
  const matches = data?.documents?.filter(item => (item.title + ' ' + labels[item.kind]).toLowerCase().includes(search.toLowerCase().trim()));
  return <>
    <Link className="back" href={slug ? knowledge : path}>{slug ? '← Room knowledge' : '← Back to room'}</Link>
    <Card><CardHeader><p className="muted">{room}</p><h1>{document?.title ?? 'Room knowledge'}</h1></CardHeader>
      <CardContent className="grid gap-4">
        {error && <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {!data && !error && <Skeleton className="h-12" aria-label="Loading documents" />}
        {draft ? <form onSubmit={save}><FieldGroup>
          {!slug && <>
            <Field><FieldLabel htmlFor="doc-slug">URL slug</FieldLabel><Input id="doc-slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} placeholder="network-outage" value={draft.slug} onChange={e => setDraft({ ...draft, slug: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="doc-kind">Document type</FieldLabel><NativeSelect id="doc-kind" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as Draft['kind'] })}><option value="wiki">Wiki</option><option value="playbook">Runbook / Playbook</option></NativeSelect></Field>
          </>}
          <Field><FieldLabel htmlFor="doc-title">Title</FieldLabel><Input id="doc-title" required maxLength={120} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></Field>
          <Field><FieldLabel htmlFor="doc-visibility">Visibility</FieldLabel><NativeSelect id="doc-visibility" value={draft.visibility} onChange={e => setDraft({ ...draft, visibility: e.target.value as Draft['visibility'] })}><option value="private">Private to operators</option><option value="room">Publish to the room</option></NativeSelect></Field>
          <Tabs defaultValue="edit">
            <TabsList aria-label="Markdown editor"><TabsTrigger value="edit">Write</TabsTrigger><TabsTrigger value="preview">Preview</TabsTrigger></TabsList>
            <TabsContent value="edit"><Field><FieldLabel htmlFor="doc-body">Markdown</FieldLabel><Textarea id="doc-body" rows={12} maxLength={40000} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} /></Field></TabsContent>
            <TabsContent value="preview"><Reading body={draft.body} /></TabsContent>
          </Tabs>
          {conflict && <Alert role="alert"><AlertDescription>
            This document has changed. Compare the latest version with your draft.
            <h2>{conflict.title}</h2><Reading body={conflict.body} />
            <Button type="button" variant="outline" onClick={() => {
              setData({ document: conflict, canEdit: true });
              setConflict(undefined);
            }}>Use latest revision and keep draft</Button>
          </AlertDescription></Alert>}
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending || Boolean(conflict)}>Save document</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => { setDraft(undefined); setConflict(undefined); }}>Cancel</Button></div>
        </FieldGroup></form> : document ? <>
          <div className="flex flex-wrap gap-2"><Badge variant="outline">{labels[document.kind]}</Badge><Badge variant="secondary">{labels[document.visibility]}</Badge></div>
          <Reading body={document.body} />
          {data?.canEdit && <div><Button onClick={() => setDraft(document)}>Edit document</Button></div>}
        </> : matches && <>
          <Field><FieldLabel htmlFor="doc-search">Search documents</FieldLabel><Input id="doc-search" type="search" value={search} onChange={e => setSearch(e.target.value)} /></Field>
          {matches.length ? <ul className="listing">{matches.map(item => <li key={item.id}>
            <Link href={knowledge + '/' + encodeURIComponent(item.slug)}><strong>{item.title}</strong><span>{labels[item.kind]} · {labels[item.visibility]}</span></Link>
          </li>)}</ul> : <Empty><EmptyDescription>{search ? 'No matching documents.' : 'No documents are visible in this room.'}</EmptyDescription></Empty>}
          {data?.canEdit && <div><Button onClick={() => setDraft(empty)}>New document</Button></div>}
        </>}
        {data?.canEdit && !draft && <RoomAssistant key={document?.revision ?? 0} path={path} slug={slug} />}
      </CardContent>
    </Card>
  </>;
}
