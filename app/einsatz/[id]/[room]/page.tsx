import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { query as sql, invitation, roomInIncident, roomPath, session, type Incident, type Message, type Room } from '../../../../lib/store';
import { createInvitation, createRoom, sendMessage } from '../../../actions';
import Refresh from '../../../refresh';
import Notifications from "../../../notifications";
import Board from "../../../board";
import Meeting from "../../../meeting";
import { demo } from "../../../../lib/store";
import { Header, Notice } from '../../../shell';

const clock = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

export default async function Workspace({ params, searchParams }: {
  params: Promise<{ id: string; room: string }>;
  searchParams: Promise<{ einladung?: string; fehler?: string; vorschau?: string }>;
}) {
  const [current, { id, room }, query] = await Promise.all([session(), params, searchParams]);
  if (!current) redirect('/');
  const guest = current.room !== null;
  if (guest && current.room !== room) notFound();
  const active = await roomInIncident(id, room);
  if (!active) notFound();
  const incident = (await sql<Incident>('SELECT id, title, summary FROM incidents WHERE id = $1', [id]))[0];
  const rooms = guest ? [active] : await sql<Room>('SELECT id, name, main FROM rooms WHERE incident = $1 ORDER BY main DESC, name, id', [id]);
  const messages = await sql<Message>('SELECT id, name, guest, body, created FROM messages WHERE room = $1 ORDER BY id DESC LIMIT 100', [room]);
  const invitePath = !guest && typeof query.einladung === 'string' && (await invitation(query.einladung))?.room === room
    ? '/einladung/' + query.einladung : undefined;
  return <><Header name={current.name} guest={guest} /><main className="workspace">
    <section className="incident">
      {!guest && <Link className="back" href="/">← Lageübersicht</Link>}
      <div className="eyebrow">Einsatz</div><h1>{incident.title}</h1>
    </section>
    <nav className="workspaceShortcuts" aria-label="Bereiche im Einsatz">
      <a href="#rooms">Räume</a><a href="#situation">Lage</a><a href="#chat">Raumchat</a>
    </nav>
    <div className="workspaceGrid">
      <aside className="panel rooms" id="rooms"><h2>Räume <span className="count">{rooms.length}</span></h2>
        <nav aria-label="Einsatzräume"><ul>{rooms.map(item => <li key={item.id}>
          <Link href={roomPath(id, item.id)} aria-current={item.id === room ? 'page' : undefined}>
            <span aria-hidden="true">{item.main ? '◈' : '#'}</span>{item.name}
          </Link>
        </li>)}</ul></nav>
        {!guest && <form className="stack roomForm" action={createRoom.bind(null, id, room)}>
          {query.fehler === 'raum' && <Notice>Bitte geben Sie einen Raumnamen ein.</Notice>}
          <label>Neuer Unterraum<input name="name" placeholder="z. B. Abschnitt Nord" required maxLength={80} /></label>
          <button className="secondary">Raum anlegen</button>
        </form>}
      </aside>
      <section className="panel situation" id="situation">
        <div className="eyebrow">{active.main ? 'Hauptraum' : 'Unterraum'}</div>
        <h2 className="roomTitle">{active.name}</h2>
        {!guest && <><h3>Lagebeschreibung</h3><p className="description">{incident.summary || 'Keine Lagebeschreibung erfasst.'}</p></>}
        {!guest && <div className="invites">
          <form action={createInvitation.bind(null, id, room)}><button className="secondary">Gästelink erstellen</button></form>
          {invitePath && <div className="inviteResult"><Link href={invitePath} prefetch={false}>Gästelink öffnen</Link>
            <p className="muted">Gültig für diesen Raum. Zum Teilen die Linkadresse kopieren.</p></div>}
        </div>}
        <Board key={"board-" + room} path={roomPath(id, room)} />
        <Meeting key={"meeting-" + room} path={roomPath(id, room)} enabled={Boolean(!demo && process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)} />
        {!guest && <Notifications incident={id} room={room} draft={query.vorschau} error={query.fehler === "alarmierung"} />}
      </section>
      <section className="panel chat" id="chat"><Refresh /><h2>Raumchat</h2>
        <div className="messages" role="log" aria-label="Chatverlauf" tabIndex={0}>
          {messages.length ? messages.map(message => <article key={message.id}>
            <div className="messageMeta"><strong>{message.name}</strong>{message.guest === 1 && <span>Gast</span>}
              <time dateTime={new Date(Number(message.created)).toISOString()}>{clock.format(Number(message.created))}</time></div>
            <p>{message.body}</p>
          </article>) : <p className="muted">In diesem Raum gibt es noch keine Nachrichten.</p>}
        </div>
        <form className="stack composer" action={sendMessage.bind(null, id, room)}>
          {query.fehler === 'nachricht' && <Notice>Bitte geben Sie eine Nachricht ein.</Notice>}
          <label>Nachricht<textarea name="body" rows={2} required maxLength={2000} /></label>
          <button>Senden</button>
        </form>
      </section>
    </div>
  </main></>;
}
