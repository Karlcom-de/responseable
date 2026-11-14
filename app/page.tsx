import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import Image from 'next/image';
import exercisePreview from '../docs/responseable.webp';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query as sql, demo, roomPath, session, type Incident } from '../lib/store';
import { createIncident, enterDemo, login } from './actions';
import { Header, Notice } from './shell';

export default async function Home({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  const [current, query] = await Promise.all([session(), searchParams]);
  if (current?.room) {
    const room = (await sql<{ incident: string }>('SELECT incident FROM rooms WHERE id = $1', [current.room]))[0];
    redirect(roomPath(room.incident, current.room));
  }
  if (!current) return <><Header /><main className="entry loginEntry">
    <div className="loginContent">
      <div className="eyebrow">Self-hosted · Open Source</div>
      <h1>Open an incident room. Get the right people in.</h1>
      <p className="muted">If your usual chat or company sign-in is down, coordinate in a separately hosted instance. Invite internal teams and external responders by link and record decisions on a shared whiteboard.</p>
      {demo ? <form action={enterDemo}><Button type="submit">Run the exercise</Button></form> : <form className="stack" action={login}>
        {query.fehler === 'anmeldung' && <Notice>Sign-in failed.</Notice>}
        <label>Username<Input name="name" autoComplete="username" required maxLength={80} /></label>
        <label>Password<Input name="password" type="password" autoComplete="current-password" required maxLength={256} /></label>
        <Button type="submit">Sign in</Button>
      </form>}
    </div>
    <figure className="loginProof">
      <Image src={exercisePreview} alt="Exercise with two incident rooms, a situation summary and room chat" unoptimized />
      <figcaption>Exercise · Incident command and North sector</figcaption>
    </figure>
  </main></>;

  const incidents = await sql<Incident & { room: string }>(`
    SELECT incidents.id, title, summary, rooms.id AS room FROM incidents
    JOIN rooms ON rooms.incident = incidents.id AND rooms.main = 1 ORDER BY created DESC
  `);
  return <><Header name={current.name} /><main className="overview">
    <div className="eyebrow">Response workspace</div><h1>Incident overview</h1>
    <div className="overviewGrid">
      <Card className="panel" role="region"><h2>Incidents <span className="count">{incidents.length}</span></h2>
        {incidents.length ? <ul className="listing">{incidents.map(incident => <li key={incident.id}>
          <Link href={roomPath(incident.id, incident.room)}><strong>{incident.title}</strong><span>{incident.summary}</span></Link>
        </li>)}</ul> : <p className="muted">No incidents yet.</p>}
      </Card>
      <Card className="panel" role="region"><h2>New incident</h2>
        <form className="stack" action={createIncident}>
          {query.fehler === 'titel' && <Notice>Enter an incident title.</Notice>}
          <label>Incident title<Input name="title" required maxLength={100} /></label>
          <label>Situation summary<Textarea name="summary" rows={4} maxLength={1500} /></label>
          <Button type="submit">Create incident</Button>
        </form>
      </Card>
    </div>
  </main></>;
}
