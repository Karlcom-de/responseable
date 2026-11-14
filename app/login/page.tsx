import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accountsEnabled, demo, query, session } from '../../lib/store';
import { login } from '../actions';
import { SignIn } from '../operator-auth';
import { Header, Notice } from '../shell';

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (demo || await session()) redirect('/');
  const { error } = await searchParams;
  const origin = process.env.RESPONSEABLE_PUBLIC_ORIGIN;

  const needsAdmin = accountsEnabled() && !(await query(
    "SELECT 1 FROM accounts WHERE role='admin' AND active LIMIT 1",
  )).length;

  return <><Header /><main className="entry max-w-lg">
    <div className="loginContent">
      <h1>Sign in to ResponseAble</h1>
      {origin && <p className="muted break-all">{new URL(origin).host}</p>}
      {needsAdmin ? <p role="status">Setup pending. Ask your instance administrator to create the first administrator account.</p> : origin ? <SignIn identifyPasskey={accountsEnabled()} /> : <form className="stack" action={login}>
        {error === 'sign-in' && <Notice>Sign-in failed. Check your username and password and try again.</Notice>}
        <label>Username<Input name="name" autoComplete="username" required maxLength={80} /></label>
        <label>Password<Input name="password" type="password" autoComplete="current-password" required maxLength={256} /></label>
        <Button type="submit">Sign in</Button>
      </form>}
    </div>
  </main></>;
}
