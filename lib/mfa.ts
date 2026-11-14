import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { cookies } from 'next/headers';
import { TOTP, Secret } from 'otpauth';
import { accountsEnabled, demo, hash, query, session, startSession, token } from './store';

export type AuthIdentity = { id: string; login: string; generation: number };
const authIdentity = new AsyncLocalStorage<AuthIdentity>();
export const withIdentity = <T>(identity: AuthIdentity, run: () => T) => authIdentity.run(identity, run);
export const account = () => accountsEnabled() ? authIdentity.getStore()?.id : process.env.RESPONSEABLE_OPERATOR;
export async function currentIdentity() {
  const browser = await authCookie();
  if (!browser) return undefined;
  return (await query<AuthIdentity>(`
    SELECT a.id,a.login,a.credential_generation AS generation FROM auth_challenges c
    JOIN accounts a ON a.id::text=c.operator AND a.credential_generation=c.credential_generation
    WHERE c.browser=$1 AND c.expires>$2 AND a.active LIMIT 1
  `, [hash(browser), Date.now()]))[0];
}
export const required = () => accountsEnabled() || process.env.RESPONSEABLE_MFA_REQUIRED === 'true';
export const enrollmentKey = () => {
  const value = process.env.RESPONSEABLE_MFA_KEY ?? '';
  return /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, 'hex') : undefined;
};
export async function enrolled(): Promise<boolean> {
  if (accountsEnabled() && !account()) {
    const identity = await currentIdentity();
    return identity ? await withIdentity(identity, enrolled) : false;
  }
  return Boolean((await query('SELECT 1 FROM operator_mfa WHERE operator = $1', [account()]))[0]);
}
export async function authCookie() {
  const jar = await cookies();
  return jar.get('ra_pre_auth')?.value;
}
export async function challenge(purpose: string, payload: string) {
  const jar = await cookies();
  const key = token();
  const expires = Date.now() + 300_000;
  if (purpose === 'password' || purpose === 'login') {
    const previous = await authCookie();
    if (previous) await query('DELETE FROM auth_challenges WHERE browser = $1', [hash(previous)]);
    jar.set('ra_pre_auth', key, { secure: process.env.RESPONSEABLE_SECURE_COOKIE !== 'false', sameSite: 'strict', httpOnly: true, path: '/', expires: new Date(expires) });
  }
  const browser = purpose === 'password' || purpose === 'login' ? key : await authCookie();
  if (!browser) return false;
  await query(`
    INSERT INTO auth_challenges(browser, purpose, operator, payload, expires, credential_generation) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (browser,purpose) DO UPDATE SET payload=excluded.payload, expires=excluded.expires, credential_generation=excluded.credential_generation
  `, [hash(browser), purpose, account(), payload, expires, authIdentity.getStore()?.generation ?? null]);
  return true;
}

export async function pending(purpose: string, consume = false) {
  const browser = await authCookie();
  if (!browser) return undefined;
  const clause = 'FROM auth_challenges WHERE browser=$1 AND purpose=$2 AND operator=$3 AND expires>$4 AND credential_generation IS NOT DISTINCT FROM $5';
  const [entry] = await query<{ payload: string }>(
    consume ? 'DELETE ' + clause + ' RETURNING payload' : 'SELECT payload ' + clause,
    [hash(browser), purpose, account(), Date.now(), authIdentity.getStore()?.generation ?? null],
  );
  return entry?.payload;
}

export async function limit(request: Request, path: string) {
  const trustedIpHeader = process.env.RESPONSEABLE_TRUSTED_CLIENT_IP_HEADER;
  const source = trustedIpHeader ? request.headers.get(trustedIpHeader)?.trim() : '';
  const cookie = await authCookie();
  // The ingress must replace this header. Without it, credential verification is
  // bounded per browser for established challenges, and perimeter rate limits apply.
  const identity = source && /^[0-9a-f:.]{2,45}$/i.test(source) ? 'ip:' + source : cookie ? 'browser:' + hash(cookie) : '';
  if (!identity) return true;
  const bucket = hash(account() + ':' + identity + ':' + path);
  const now = Date.now();
  const [row] = await query<{ count: number }>(`
    INSERT INTO auth_budget(operator, window_start, count) VALUES ($1,$2,1)
    ON CONFLICT (operator) DO UPDATE SET count = CASE WHEN auth_budget.window_start <= $3 THEN 1 ELSE LEAST(auth_budget.count+1, 1000) END,
    window_start = CASE WHEN auth_budget.window_start <= $3 THEN excluded.window_start ELSE auth_budget.window_start END RETURNING count
  `, [bucket, now, now - 60_000]);
  return row.count <= 20;
}

export function encrypt(seed: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', enrollmentKey()!, iv);
  return Buffer.concat([iv, cipher.update(seed), cipher.final(), cipher.getAuthTag()]).toString('base64url');
}
export function decrypt(value: string) {
  const bytes = Buffer.from(value, 'base64url');
  const cipher = createDecipheriv('aes-256-gcm', enrollmentKey()!, bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString();
}
export function otp(seed?: string) {
  return new TOTP({ issuer: 'ResponseAble', label: account(), secret: seed ? Secret.fromBase32(seed) : new Secret({ size: 20 }) });
}
export function otpStep(seed: string, code: string) {
  if (!/^\d{6}$/.test(code)) return undefined;
  const timestamp = Date.now();
  const delta = otp(seed).validate({ token: code, timestamp, window: 1 });
  return delta === null ? undefined : Math.floor(timestamp / 30_000) + delta;
}
export async function verifyTotp(code: string) {
  if (!enrollmentKey()) return false;
  const [entry] = await query<{ seed: string }>('SELECT seed FROM operator_mfa WHERE operator=$1', [account()]);
  if (!entry) return false;
  const step = otpStep(decrypt(entry.seed), code);
  if (step === undefined) return false;
  return (await query('UPDATE operator_mfa SET last_step=$2 WHERE operator=$1 AND last_step<$2 RETURNING operator', [account(), step])).length === 1;
}
export async function finishLogin(invalidate = false, verified = true) {
  await pending('password', true);
  const identity = authIdentity.getStore();
  if (invalidate) {
    if (identity) await query('DELETE FROM sessions WHERE account_id=$1', [identity.id]);
    else await query('DELETE FROM sessions WHERE room IS NULL AND name=$1', [account()]);
  }
  (await cookies()).delete('ra_pre_auth');
  await startSession(identity?.login ?? account()!, null, Date.now() + 8 * 3600_000, verified, identity);
}
export async function canManage(): Promise<boolean> {
  if (accountsEnabled() && !account()) {
    const identity = await currentIdentity();
    return identity ? await withIdentity(identity, canManage) : false;
  }
  return !demo && (await pending('password')) === 'verified' &&
    (!(await enrolled()) || (accountsEnabled() ? (await session())?.accountId : (await session())?.name) === account());
}
