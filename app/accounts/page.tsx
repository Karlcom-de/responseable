import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { accountsEnabled, demo, session } from '@/lib/store';
import { Header } from '../shell';
import { AccountList } from './account-list';

export default async function Accounts() {
  if (demo || !accountsEnabled()) notFound();
  const current = await session();
  if (!current) redirect('/login');
  if (current.role !== 'admin' || !current.accountId) notFound();

  return <><Header name={current.name} admin /><main className="entry max-w-4xl">
    <Link className="back" href="/">← Incident overview</Link>
    <h1 className="mb-4">Accounts</h1>
    <AccountList currentId={current.accountId} />
  </main></>;
}
