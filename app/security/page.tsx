import Link from 'next/link';
export const dynamic = "force-dynamic";

import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { canManage, enrolled } from '@/lib/mfa';
import { demo, session } from '@/lib/store';
import { Header } from '@/app/shell';
import { SecuritySetup } from '@/app/operator-auth';

export default async function AccountSecurity() {
  if (demo || !process.env.RESPONSEABLE_PUBLIC_ORIGIN) notFound();
  const current = await session();
  if (!current) redirect('/');
  if (current.room) notFound();
  const [allowed, active] = await Promise.all([canManage(), enrolled()]);
  return <><Header name={current.name} /><main className="entry">
    <Link className="back" href="/">← Incident overview</Link>
    <Card><CardHeader><h1>Account security</h1></CardHeader>
      <CardContent>{allowed ? <SecuritySetup enrolled={active} /> : <Alert>
        <AlertDescription>Sign out and verify your identity again to manage your sign-in methods.</AlertDescription>
      </Alert>}</CardContent>
    </Card>
  </main></>;
}
