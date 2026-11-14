'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import QRCode from 'qrcode';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

async function authPost(path: string, body: unknown = {}) {
  const response = await fetch('/auth/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error();
  return response.json();
}

export function SignIn({ identifyPasskey = false }: { identifyPasskey?: boolean }) {
  const [supportsPasskeys, setSupportsPasskeys] = useState(false);
  const [step, setStep] = useState<'password' | 'change_password' | 'totp' | 'recovery' | 'enroll'>('password');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => setSupportsPasskeys(browserSupportsWebAuthn()), []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    setStatus('');
    try {
      const body = step === 'password' ? { name: form.get('name'), password: form.get('password') } : step === 'change_password' ? { password: form.get('password') } : { code: form.get('code') };
      const { next } = await authPost(step.replace('_', '-'), body);
      if (next === 'done') location.replace('/');
      else if (next === 'sign_in') {
        setStatus('Password changed. Sign in with your new password.');
        setStep('password');
      }
      else if (next === 'totp' || next === 'enroll' || next === 'change_password') setStep(next);
      else throw new Error();
    } catch { setError(step === 'change_password'
      ? 'Password could not be changed. Check the requirements and try again.'
      : 'Sign-in could not be completed. Check your details and try again.'); }
    finally { setPending(false); }
  }

  if (step === 'enroll') return <SecuritySetup />;
  return <div className="grid gap-3">
    {status && <p role="status">{status}</p>}
    {error && <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {step === 'password' && supportsPasskeys && <div><Button disabled={pending} onClick={async () => {
      if (identifyPasskey && !name.trim()) {
        setError('Enter your username to use a passkey.');
        document.getElementById('auth-name')?.focus();
        return;
      }
      setPending(true);
      setError('');
      try {
        const optionsJSON = await authPost('passkey/options', identifyPasskey ? { name } : {});
        const credential = await startAuthentication({ optionsJSON });
        await authPost('passkey/verify', { credential });
        location.replace('/');
      } catch { setError('Passkey sign-in did not complete. Try again or sign in with your password.'); }
      finally { setPending(false); }
    }}>Sign in with a passkey</Button></div>}
    <form key={step} onSubmit={signIn}><FieldGroup>
      {step === 'password' ? <>
        <Field><FieldLabel htmlFor="auth-name">Username</FieldLabel><Input id="auth-name" name="name" value={name} onChange={event => setName(event.target.value)} autoComplete="username" required maxLength={80} /></Field>
        <Field><FieldLabel htmlFor="auth-password">Password</FieldLabel><Input id="auth-password" name="password" type="password" autoComplete="current-password" required maxLength={256} /></Field>
      </> : step === 'change_password' ? <Field>
        <FieldLabel htmlFor="new-password">New password</FieldLabel>
        <Input id="new-password" name="password" type="password" autoComplete="new-password" required autoFocus minLength={16} maxLength={256} />
        <p className="muted">Use at least 16 characters.</p>
      </Field> : <Field><FieldLabel htmlFor="auth-code">{step === 'totp' ? 'Authenticator code' : 'Recovery code'}</FieldLabel>
        <Input id="auth-code" name="code" required autoFocus autoComplete={step === 'totp' ? 'one-time-code' : 'off'}
          inputMode={step === 'totp' ? 'numeric' : 'text'} maxLength={step === 'totp' ? 6 : 80} />
      </Field>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={step === 'password' && supportsPasskeys ? 'outline' : 'default'} disabled={pending}>{step === 'password' ? 'Sign in' : step === 'change_password' ? 'Change password' : 'Verify code'}</Button>
        {(step === 'totp' || step === 'recovery') && <Button variant="outline" disabled={pending} onClick={() => { setError(''); setStep(step === 'totp' ? 'recovery' : 'totp'); }}>{step === 'totp' ? 'Use recovery code' : 'Use authenticator code'}</Button>}
        {step !== 'password' && <Button variant="ghost" disabled={pending} onClick={() => { setError(''); setStep('password'); }}>Back to sign-in</Button>}
      </div>
    </FieldGroup></form>
  </div>;
}

export function SecuritySetup({ enrolled = false }: { enrolled?: boolean }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string }>();
  const [codes, setCodes] = useState<string[]>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [supportsPasskeys, setSupportsPasskeys] = useState(false);
  const [passkeys, setPasskeys] = useState<{ id: string; label: string; createdAt: string; lastUsedAt: string | null }[]>([]);
  const [status, setStatus] = useState('');
  const [label, setLabel] = useState('');
  const [confirm, setConfirm] = useState<{ action: 'delete'; id: string } | { action: 'rotate' }>();
  const load = async () => {
    const response = await fetch('/auth/factors', { cache: 'no-store' });
    if (response.ok) setPasskeys((await response.json()).credentials);
  };
  useEffect(() => {
    setSupportsPasskeys(browserSupportsWebAuthn());
    if (enrolled) void load().catch(() => setError('Could not load passkeys.'));
  }, [enrolled]);

  async function action(work: () => Promise<void>) {
    setPending(true);
    setError('');
    try { await work(); }
    catch { setError('The security change could not be completed. Try again.'); }
    finally { setPending(false); }
  }

  if (codes) return <div className="grid gap-3">
    <h2>Save your recovery codes</h2>
    <p>Each code works once. Store them securely. They will only be shown now.</p>
    <ul className="grid gap-1 font-mono text-sm">{codes.map(code => <li key={code} className="break-all">{code}</li>)}</ul>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => {
        const url = URL.createObjectURL(new Blob([codes.join('\n') + '\n'], { type: 'text/plain' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'responseable-recovery-codes.txt';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Download recovery codes</Button>
      <Button onClick={() => { setCodes(undefined); location.replace('/'); }}>I have saved my recovery codes</Button>
    </div>
  </div>;

  return <div className="grid gap-3">
    {error && <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <p role="status">{status}</p>
    {enrolled ? <>
      <h2>Passkeys</h2>
      {passkeys.length > 0 && <ul className="grid gap-2">{passkeys.map(key => <li key={key.id}>
        <p><strong>{key.label || 'Passkey'}</strong> · Added {new Date(key.createdAt).toLocaleDateString('en')} · {key.lastUsedAt ? 'Last used ' + new Date(key.lastUsedAt).toLocaleString('en') : 'Never used'}</p>
        <Button variant="ghost" disabled={pending} onClick={() => setConfirm({ action: 'delete', id: key.id })}>Remove passkey</Button>
      </li>)}</ul>}
      {supportsPasskeys && <FieldGroup>
        <Field><FieldLabel htmlFor="passkey-label">Passkey name</FieldLabel>
          <Input id="passkey-label" value={label} maxLength={80} onChange={event => setLabel(event.target.value)} /></Field>
        <div><Button disabled={pending} onClick={() => action(async () => {
          const optionsJSON = await authPost('factors/passkey/options');
          const credential = await startRegistration({ optionsJSON });
          await authPost('factors/passkey/verify', { credential, label: label.trim() || undefined });
          await load();
          setLabel('');
          setStatus('Passkey added.');
        })}>Add passkey</Button></div>
      </FieldGroup>}
      <div><Button variant="outline" disabled={pending} onClick={() => setConfirm({ action: 'rotate' })}>Replace recovery codes</Button></div>
      {confirm && <Alert>
        <AlertDescription className="grid gap-2">
          <p>{confirm.action === 'rotate' ? 'This invalidates all previous recovery codes.' : 'This passkey will no longer sign in to ResponseAble.'}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={pending} onClick={() => action(async () => {
              if (confirm.action === 'rotate') {
                const { codes } = await authPost('factors/recovery');
                setCodes(codes);
              } else {
                await authPost('factors/passkey/delete', { id: confirm.id });
                await load();
                setStatus('Passkey removed.');
              }
              setConfirm(undefined);
            })}>{confirm.action === 'rotate' ? 'Confirm replacement' : 'Confirm removal'}</Button>
            <Button variant="outline" disabled={pending} onClick={() => setConfirm(undefined)}>Cancel</Button>
          </div>
        </AlertDescription>
      </Alert>}
    </> : <>
      <h2>Set up an authenticator app</h2>
      {!setup ? <div><Button disabled={pending} onClick={() => action(async () => {
        const { secret, uri } = await authPost('factors/totp/options');
        const qr = await QRCode.toDataURL(uri, { width: 180 });
        setSetup({ secret, qr });
      })}>Start authenticator setup</Button></div> : <form onSubmit={event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void action(async () => {
          const { codes } = await authPost('factors/totp/verify', { code: form.get('code') });
          setSetup(undefined);
          setCodes(codes);
        });
      }}><FieldGroup>
        <p>Scan this setup QR code with your authenticator app or enter the setup key manually.</p>
        <img src={setup.qr} width={180} height={180} alt="Authenticator setup QR code" />
        <Field><FieldLabel htmlFor="setup-key">Setup key</FieldLabel><Input id="setup-key" value={setup.secret} readOnly /></Field>
        <Field><FieldLabel htmlFor="setup-code">Authenticator code</FieldLabel><Input id="setup-code" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} /></Field>
        <div><Button type="submit" disabled={pending}>Confirm authenticator</Button></div>
      </FieldGroup></form>}
    </>}
  </div>;
}
