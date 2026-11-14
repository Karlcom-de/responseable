import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import Image from 'next/image';
import exercisePreview from '../docs/incident-room-desktop.webp';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query as sql, demo, roomPath, session, type Incident } from '../lib/store';
import { createIncident, enterDemo } from './actions';
import { Header, Notice } from './shell';

export default async function Home({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  const [current, query] = await Promise.all([session(), searchParams]);
  if (current?.room) {
    const room = (await sql<{ incident: string }>('SELECT incident FROM rooms WHERE id = $1', [current.room]))[0];
    redirect(roomPath(room.incident, current.room));
  }
  if (!current && !demo && query.fehler === 'anmeldung') redirect('/login?error=sign-in');
  if (!current && !demo) return <><Header /><main className="entry max-w-3xl">
    <div className="loginContent">
      <h1>Incident response workspace</h1>
      <p className="muted">Coordinate incidents in private rooms with chat, calls, and a shared whiteboard.</p>
      <div><Button render={<Link href="/login" />}>Sign in</Button></div>
    </div>
  </main></>;
  if (!current) return <><Header /><main className="entry loginEntry">
    <div className="loginContent">
      <h1>Run an incident response exercise</h1>
      <p className="muted">Coordinate a simulated outage, invite another participant, and record decisions on the whiteboard.</p>
      <form action={enterDemo}><Button type="submit">Run the exercise</Button></form>
    </div>
    <figure className="loginProof">
      <Image src={exercisePreview} alt="Exercise with two incident rooms, a situation summary and room chat" unoptimized />
      <figcaption>Synthetic exercise · Customer portal outage</figcaption>
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
