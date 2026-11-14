import RoomInvites from '@/app/room-invites';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupTextarea } from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { query as sql, roomInIncident, roomPath, session, type Incident, type Message, type Room } from '../../../../lib/store';
import { createRoom, sendMessage } from '../../../actions';
import Refresh from '../../../refresh';
import Notifications from "../../../notifications";
import Board from "../../../board";
import Meeting from "../../../meeting";
import { demo } from "../../../../lib/store";
import { Header, Notice } from '../../../shell';

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

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
  return <><Header name={current.name} guest={guest} /><main className="workspace">
    <section className="incident">
      {!guest && <Link className="back" href="/">← Incident overview</Link>}
      <div className="eyebrow">Incident</div><h1>{incident.title}</h1>
    </section>
    <nav className="workspaceShortcuts" aria-label="Incident sections">
      <a href="#rooms" >Rooms</a><a href="#situation">Situation</a><a href="#chat">Room chat</a>
    </nav>
    <div className="workspaceGrid">
      <Card className="panel rooms" id="rooms" role="complementary"><h2 >Rooms <span className="count">{rooms.length}</span></h2>
        <nav aria-label="Incident rooms"><ul>{rooms.map(item => <li key={item.id}>
          <Link href={roomPath(id, item.id)} aria-current={item.id === room ? 'page' : undefined}>
            <span aria-hidden="true">{item.main ? '◈' : '#'}</span>{item.name}
          </Link>
        </li>)}</ul></nav>
        {!guest && <form className="stack roomForm" action={createRoom.bind(null, id, room)}>
          {query.fehler === 'raum' && <Notice>Enter a room name.</Notice>}
          <label>New subroom<Input name="name" placeholder="e.g. North sector" required maxLength={80} /></label>
          <Button type="submit" variant="outline">Create room</Button>
        </form>}
      </Card>
      <Card className="panel situation" id="situation" role="region">
        <div className="eyebrow">{active.main ? 'Main room' : 'Subroom'}</div>
        <h2 className="roomTitle">{active.name}</h2>
        <Link href={roomPath(id, room) + "/wissen"}>Room knowledge</Link>
        {!guest && <><h3>Situation summary</h3><p className="description">{incident.summary || 'No situation summary yet.'}</p></>}
        {!guest && <div className="invites"><RoomInvites path={roomPath(id, room)} room={active.name} /></div>}
        <Board key={"board-" + room} path={roomPath(id, room)} />
        <Meeting key={"meeting-" + room} path={roomPath(id, room)} enabled={Boolean(!demo && process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)} />
        {!guest && <Notifications incident={id} room={room} draft={query.vorschau} error={query.fehler === "alarmierung"} />}
      </Card>
      <Card className="panel chat" id="chat" role="region"><Refresh /><h2>Room chat</h2>
        <ScrollArea className="chatScroll"><div className="messages" role="log" aria-label="Chat history">
          {messages.length ? messages.map(message => <article key={message.id}>
            <div className="messageMeta"><strong>{message.name}</strong>{message.guest === 1 && <span>Guest</span>}
              <time dateTime={new Date(Number(message.created)).toISOString()}>{clock.format(Number(message.created))}</time></div>
            <p>{message.body}</p>
          </article>) : <p className="muted">No messages yet.</p>}
        </div></ScrollArea>
        <form className="stack composer" action={sendMessage.bind(null, id, room)}>
          {query.fehler === 'nachricht' && <Notice>Enter a message.</Notice>}
          <Field><FieldLabel htmlFor="room-message">Message</FieldLabel><InputGroup><InputGroupTextarea id="room-message" name="body" rows={2} required maxLength={2000} /></InputGroup></Field>
          <Button type="submit">Send</Button>
        </form>
      </Card>
    </div>
  </main></>;
}
