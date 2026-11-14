'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';

function Notice({ children }: { children: ReactNode }) {
  return <Alert role="alert" variant="destructive"><AlertDescription>{children}</AlertDescription></Alert>;
}

const roles = ['admin', 'coordinator', 'responder'] as const;
const labels = { admin: 'Administrator', coordinator: 'Coordinator', responder: 'Responder' };
type Account = {
  id: string; login: string; displayName: string; role: typeof roles[number];
  active: boolean; requiresPasswordChange: boolean; mfaEnrolled: boolean; incidentIds?: string[];
};
type Incident = { id: string; title: string };

function RoleField({ value }: { value: Account['role'] }) {
  return <label>Role
    <NativeSelect className="w-full" name="role" defaultValue={value}>
      {roles.map(role => <option key={role} value={role}>{labels[role]}</option>)}
    </NativeSelect>
  </label>;
}

function AccountDialog({ title, description, submit, children, save }: {
  title: string; description: string; submit: string; children?: ReactNode;
  save: (form: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError('');
    setBusy(true);
    try {
      await save(data);
      setOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The change could not be saved.');
    } finally { setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={value => {
    if (!busy) { setOpen(value); setError(''); }
  }}>
    <DialogTrigger render={<Button variant="outline" />}>{title}</DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <DialogTitle className="pr-7">{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      <form className="stack" onSubmit={onSubmit}>
        {error && <Notice>{error}</Notice>}
        {children}
        <Button type="submit" disabled={busy}>{submit}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}

async function request(path = '', method = 'GET', body?: unknown) {
  const response = await fetch('/api/accounts' + path, {
    method, cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 409) throw new Error('That change conflicts with the current account settings.');
    if (response.status === 400) throw new Error('Check the account details and try again.');
    throw new Error('The account request could not be completed. Refresh and try again.');
  }
  return response.status === 204 ? undefined : response.json();
}

export function AccountList({ currentId }: { currentId: string }) {
  const [accounts, setAccounts] = useState<Account[]>();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  async function refresh() {
    const { accounts, incidents, assignments } = await request() as {
      accounts: Account[]; incidents: Incident[]; assignments: { accountId: string; incidentId: string }[];
    };
    const byAccount = new Map<string, string[]>();
    for (const { accountId, incidentId } of assignments) {
      const ids = byAccount.get(accountId) ?? [];
      ids.push(incidentId);
      byAccount.set(accountId, ids);
    }
    setAccounts(accounts.map(account => ({ ...account, incidentIds: byAccount.get(account.id) })));
    setIncidents(incidents);
  }
  useEffect(() => { void refresh().catch(() => setError('Could not load accounts.')); }, []);

  async function update(path: string, method: string, body: unknown, message: string) {
    await request(path, method, body);
    setStatus(message);
    await refresh().catch(() => setError('The change was saved. Reload to see the account list.'));
  }

  return <div className="grid gap-4">
    <p className="muted">Administrators manage accounts and all incidents. Coordinators manage assigned incidents. Responders participate in assigned incidents.</p>
    {accounts && <div><AccountDialog title="Add account" submit="Create account"
      description="Give the new account a unique username and a temporary password."
      save={form => update('', 'POST', Object.fromEntries(form), 'Account created.')}>
      <label>Username<Input name="login" autoComplete="off" required maxLength={80} /></label>
      <label>Display name<Input name="displayName" required maxLength={80} /></label>
      <RoleField value="responder" />
      <label>Temporary password<Input name="password" type="password" autoComplete="new-password" required minLength={16} maxLength={256} /></label>
    </AccountDialog></div>}
    <p role="status">{status || (!accounts && !error ? 'Loading accounts…' : '')}</p>
    {error && <Notice>{error}</Notice>}
    {accounts?.length === 0 && <p>No accounts found.</p>}
    {accounts?.map(account => {
      const self = account.id === currentId;
      const path = '/' + encodeURIComponent(account.id);
      return <Card key={account.id}>
        <CardHeader>
          <h2 className="[overflow-wrap:anywhere] font-semibold">{account.displayName}</h2>
          <p className="muted [overflow-wrap:anywhere]">{account.login} · {labels[account.role]} · {account.active ? 'Active' : 'Deactivated'}{self ? ' · You' : ''}</p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="muted">{account.requiresPasswordChange ? 'Password change pending' :
            account.mfaEnrolled ? 'Authenticator enrolled' : 'Authenticator setup pending'}</p>
          <p>{account.role === 'admin' ? 'All incidents' :
            incidents.filter(incident => account.incidentIds?.includes(incident.id)).map(incident => incident.title).join(', ') || 'No incident assignments'}</p>
          {!self && <div className="flex flex-wrap gap-2">
            <AccountDialog title="Change role" submit="Save role" description={`Update permissions for ${account.displayName}.`}
              save={form => update(path, 'PATCH', { role: form.get('role') }, 'Role updated.')}>
              <RoleField value={account.role} />
            </AccountDialog>
            {account.role !== 'admin' && <AccountDialog title="Assign incidents" submit="Save assignments"
              description={`Choose the incidents ${account.displayName} can access.`}
              save={form => update(path + '/incidents', 'PUT', { incidentIds: form.getAll('incidentIds') }, 'Assignments updated.')}>
              <fieldset className="grid gap-2"><legend className="mb-2 font-medium">Incidents</legend>
                {incidents.length === 0 && <p>No incidents available.</p>}
                {incidents.map(incident => <label className="flex items-start gap-2 [overflow-wrap:anywhere]" key={incident.id}>
                  <input type="checkbox" name="incidentIds" value={incident.id} defaultChecked={account.incidentIds?.includes(incident.id)} />{incident.title}
                </label>)}
              </fieldset>
            </AccountDialog>}
            <AccountDialog title={account.active ? 'Deactivate' : 'Reactivate'} submit={account.active ? 'Deactivate account' : 'Reactivate account'}
              description={account.active ? `${account.displayName} will lose access to new protected requests. An existing call may continue until the connection ends.` : `${account.displayName} will regain access with their current role and assignments.`}
              save={() => update(path, 'PATCH', { active: !account.active }, account.active ? 'Account deactivated.' : 'Account reactivated.')} />
            <AccountDialog title="Reset password" submit="Set temporary password"
              description={`Set a temporary password for ${account.displayName}. Share it through a secure channel.`}
              save={form => update(path, 'PATCH', { password: form.get('password') }, 'Temporary password set.')}>
              <label>Temporary password<Input name="password" type="password" autoComplete="new-password" required minLength={16} maxLength={256} /></label>
            </AccountDialog>
          </div>}
        </CardContent>
      </Card>;
    })}
  </div>;
}
