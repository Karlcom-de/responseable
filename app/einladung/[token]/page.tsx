import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { notFound } from 'next/navigation';
import { invitation } from '../../../lib/store';
import { join } from '../../actions';
import { Header, Notice } from '../../shell';

export default async function Invite({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ fehler?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const invite = await invitation(token);
  if (!invite) notFound();
  return <><Header guest /><main className="entry">
    <div className="eyebrow">Raumeinladung</div><h1>{invite.name}</h1>
    <form className="stack" action={join.bind(null, token)}>
      {query.fehler === 'name' && <Notice>Bitte geben Sie einen Anzeigenamen ein.</Notice>}
      <label>Anzeigename<Input name="name" required maxLength={80} autoComplete="nickname" /></label>
      <Button type="submit">Raum beitreten</Button>
    </form>
  </main></>;
}
