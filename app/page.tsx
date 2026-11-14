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
    <div className="eyebrow">Digitale Leitstelle</div>
    <h1>Einsatzkoordination</h1>
    <p className="muted">Melden Sie sich an, um Einsätze und Kommunikationsräume zu verwalten.</p>
    {demo ? <form action={enterDemo}><button>Übungsleitstelle öffnen</button></form> : <form className="stack" action={login}>
      {query.fehler === 'anmeldung' && <Notice>Anmeldung fehlgeschlagen.</Notice>}
      <label>Kennung<input name="name" autoComplete="username" required maxLength={80} /></label>
      <label>Passwort<input name="password" type="password" autoComplete="current-password" required maxLength={256} /></label>
      <button>Anmelden</button>
    </form>}
    </div>
    <div className="loginArtwork" aria-hidden="true" />
  </main></>;

  const incidents = await sql<Incident & { room: string }>(`
    SELECT incidents.id, title, summary, rooms.id AS room FROM incidents
    JOIN rooms ON rooms.incident = incidents.id AND rooms.main = 1 ORDER BY created DESC
  `);
  return <><Header name={current.name} /><main className="overview">
    <div className="eyebrow">Leitstelle</div><h1>Lageübersicht</h1>
    <div className="overviewGrid">
      <section className="panel"><h2>Einsätze <span className="count">{incidents.length}</span></h2>
        {incidents.length ? <ul className="listing">{incidents.map(incident => <li key={incident.id}>
          <Link href={roomPath(incident.id, incident.room)}><strong>{incident.title}</strong><span>{incident.summary}</span></Link>
        </li>)}</ul> : <p className="muted">Es sind noch keine Einsätze angelegt.</p>}
      </section>
      <section className="panel"><h2>Neuer Einsatz</h2>
        <form className="stack" action={createIncident}>
          {query.fehler === 'titel' && <Notice>Bitte geben Sie eine Einsatzbezeichnung ein.</Notice>}
          <label>Einsatzbezeichnung<input name="title" required maxLength={100} /></label>
          <label>Lagebeschreibung<textarea name="summary" rows={4} maxLength={1500} /></label>
          <button>Einsatz anlegen</button>
        </form>
      </section>
    </div>
  </main></>;
}
