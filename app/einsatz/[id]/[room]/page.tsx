import RoomDestination from '@/app/room-destination';
import { BookOpen, DoorOpen, GitBranch } from 'lucide-react';
import RoomInvites from '@/app/room-invites';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { query as sql, roomInIncident, roomPath, session, type Incident, type Room } from '../../../../lib/store';
import { createRoom } from '../../../actions';
import WorkspaceChat from '@/app/workspace-chat';
import IncidentStage from '@/app/incident-stage';
import Notifications from "../../../notifications";
import Board from "../../../board";
import { demo } from "../../../../lib/store";
import { Header, Notice } from '../../../shell';


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
  const main = rooms.find(item => item.main);
  return <><Header name={current.name} guest={guest} /><main className="workspace">
    <section className="incident">
      {!guest && <Link className="back" href="/">← Incident overview</Link>}
      <div className="eyebrow">Incident</div><h1>{incident.title}</h1>
    </section>
    <nav className="workspaceShortcuts" aria-label="Incident sections">
      <a href="#chat">Room chat</a><a href="#situation">Stage and call</a><a href="#rooms">Rooms</a>
    </nav>
    <div className="workspaceGrid">
      <Card className="panel rooms" id="rooms" role="complementary"><h2 >Rooms </h2>
        <nav aria-label="Incident rooms"><ul>{rooms.map(item => <li key={item.id}>
          <RoomDestination href={roomPath(id, item.id)} name={item.name} current={item.id === room}>
            {item.main ? <DoorOpen className="navIcon" aria-hidden="true" /> : <GitBranch className="navIcon" aria-hidden="true" />}{item.name}
          </RoomDestination>
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
        {!guest && !active.main && main && <RoomDestination className="back" href={roomPath(id, main.id)} name={main.name}>Back to main room</RoomDestination>}
        <Link href={roomPath(id, room) + "/wissen"} className="iconLabel" target="_blank" rel="noopener noreferrer" title="Opens in a new tab"><BookOpen className="navIcon" aria-hidden="true" />Room knowledge</Link>
        {!guest && <><h3>Situation summary</h3><p className="description">{incident.summary || 'No situation summary yet.'}</p></>}
        {!guest && <div className="invites"><RoomInvites path={roomPath(id, room)} room={active.name} /></div>}
        <IncidentStage key={room} path={roomPath(id, room)}
          enabled={Boolean((!demo || process.env.RESPONSEABLE_EXERCISE_MEDIA === "true") && process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)}
          board={<Board path={roomPath(id, room)} />} />
        {!guest && <Notifications incident={id} room={room} draft={query.vorschau} error={query.fehler === "alarmierung"} />}
      </Card>
      <WorkspaceChat key={room} path={roomPath(id, room)} demo={demo && process.env.XMPP_EXERCISE_LOOPBACK !== 'true'} />
    </div>
  </main></>;
}
