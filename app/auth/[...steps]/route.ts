import { randomBytes, scryptSync } from 'node:crypto';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { account, currentIdentity, withIdentity, type AuthIdentity, canManage, challenge, decrypt, encrypt, enrolled, enrollmentKey, finishLogin, limit, otp, otpStep, pending, required, verifyTotp } from '../../../lib/mfa';
import { accountsEnabled, demo, passwordMatches, hash, operatorLogin, query, token } from '../../../lib/store';

type Context = { params: Promise<{ steps: string[] }> };
const failure = (error = 'verification_failed', status = 401) => Response.json({ error }, { status });
const ok = () => Response.json({ next: 'done' });
function origin() {
  try {
    const url = new URL(process.env.RESPONSEABLE_PUBLIC_ORIGIN || '');
    if (url.origin !== process.env.RESPONSEABLE_PUBLIC_ORIGIN) return;
    if (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return url;
  } catch { return; }
}

export async function GET(request: Request, context: Context) {
  if (!accountsEnabled()) return getFactors(request, context);
  const identity = await currentIdentity();
  return identity ? withIdentity(identity, () => getFactors(request, context)) : failure();
}

async function getFactors(_: Request, { params }: Context) {
  if ((await params).steps.join('/') !== 'factors' || !await canManage()) return failure();
  const credentials = await query('SELECT id, label, created_at AS "createdAt", last_used_at AS "lastUsedAt" FROM operator_credentials WHERE operator=$1 ORDER BY created_at', [account()]);
  return Response.json({ enrolled: await enrolled(), credentials });
}

export async function POST(request: Request, context: Context) {
  if (!accountsEnabled()) return authenticate(request, context);
  if (demo || request.headers.get('origin') !== origin()?.origin) return failure('invalid_origin', 403);
  const path = (await context.params).steps.join('/');
  let identity: AuthIdentity | undefined;
  if (path === 'password' || path === 'passkey/options') {
    const data = await request.clone().json().catch(() => null);
    if (typeof data?.name !== 'string' || data.name.length > 80) return failure();
    if (!await limit(request, path, data.name)) return failure('rate_limited', 429);
    identity = (await query<AuthIdentity>(
      'SELECT id,login,credential_generation AS generation FROM accounts WHERE login=$1 AND active AND ($2 OR NOT require_password_change)', [data.name, path === "password"],
    ))[0];
  } else {
    identity = await currentIdentity();
  }
  return identity ? withIdentity(identity, () => authenticate(request, context, identity)) : failure();
}

async function authenticate(request: Request, { params }: Context, identity?: AuthIdentity) {
  if (demo || !account()) return failure('not_found', 404);
  const url = origin();
  if (!url || request.headers.get('origin') !== url.origin) return failure('invalid_origin', 403);
  const path = (await params).steps.join('/');
  if (!['password', 'change-password', 'totp', 'recovery', 'passkey/options', 'passkey/verify', 'factors/totp/options',
    'factors/totp/verify', 'factors/recovery', 'factors/passkey/delete', 'factors/passkey/options', 'factors/passkey/verify'].includes(path)) {
    return failure('not_found', 404);
  }
  if (path.startsWith('factors/') && !await canManage()) return failure();
  if ((!identity || !['password', 'passkey/options'].includes(path)) && !await limit(request, path)) return failure('rate_limited', 429);
  const data = await request.json().catch(() => null);
  try {
    if (path === 'password') {
      if (typeof data?.name !== 'string' || typeof data.password !== 'string' ||
        data.password.length > 256 || !(identity
          ? passwordMatches(data.password, (await query<{password_hash: string}>('SELECT password_hash FROM accounts WHERE id=$1 AND active AND credential_generation=$2', [identity.id, identity.generation]))[0]?.password_hash)
          : operatorLogin(data.name, data.password))) return failure();
      if (identity && (await query('SELECT 1 FROM accounts WHERE id=$1 AND require_password_change', [identity.id])).length) {
        await challenge('password', 'change');
        return Response.json({ next: 'change_password' });
      }
      if (await enrolled()) {
        await challenge('password', 'factor');
        return Response.json({ next: 'totp' });
      }
      if (required() && !enrollmentKey()) return failure('unavailable', 503);
      if (!required()) await finishLogin(false, false);
      await challenge('password', 'verified');
      return Response.json({ next: required() ? 'enroll' : 'done' });
    }
    if (path === 'change-password') {
      if (!identity || typeof data?.password !== 'string' || data.password.length < 16 || data.password.length > 256 ||
        await pending('password', true) !== 'change') return failure();
      const salt = randomBytes(16).toString('hex');
      const value = salt + ':' + scryptSync(data.password, salt, 64).toString('hex');
      const [updated] = await query(`
        WITH changed AS (
          UPDATE accounts SET password_hash=$2, require_password_change=false, credential_generation=credential_generation+1
          WHERE id=$1 AND active AND require_password_change AND credential_generation=$3 RETURNING id
        )
        INSERT INTO account_audit(actor_id,subject_id,action)
        SELECT id,id,'change_password' FROM changed RETURNING subject_id
      `, [identity.id, value, identity.generation]);
      return updated ? Response.json({ next: 'sign_in' }) : failure();
    }
    if (path === 'totp' || path === 'recovery') {
      if (typeof data?.code !== 'string' || data.code.length > 80 || await pending('password') !== 'factor') return failure();
      const valid = path === 'totp' ? await verifyTotp(data.code) : Boolean((await query(
        'DELETE FROM operator_recovery WHERE operator=$1 AND hash=$2 RETURNING hash', [account(), hash(data.code.trim())],
      ))[0]);
      if (!valid) return failure();
      if (await pending('password', true) !== 'factor') return failure();
      await finishLogin(path === 'recovery');
      await challenge('password', 'verified');
      return ok();
    }
    if (path === 'passkey/options') {
      if (!await enrolled()) return failure();
      const options = await generateAuthenticationOptions({ rpID: url.hostname, userVerification: 'required' });
      await challenge('login', options.challenge);
      return Response.json(options);
    }
    if (path === 'passkey/verify') {
      const expectedChallenge = await pending('login', true);
      if (!expectedChallenge || typeof data?.credential?.id !== 'string') return failure();
      const [entry] = await query<{ id: string; public_key: Buffer; counter: string }>(
        'SELECT id,public_key,counter FROM operator_credentials WHERE id=$1 AND operator=$2', [data.credential.id, account()],
      );
      if (!entry) return failure();
      const result = await verifyAuthenticationResponse({ response: data.credential, expectedChallenge,
        expectedOrigin: url.origin, expectedRPID: url.hostname, requireUserVerification: true,
        credential: { id: entry.id, publicKey: new Uint8Array(entry.public_key), counter: Number(entry.counter) } });
      if (!result.verified) return failure();
      if (!(await query('UPDATE operator_credentials SET counter=$2,last_used_at=now() WHERE id=$1 AND counter=$3 RETURNING id',
        [entry.id, result.authenticationInfo.newCounter, entry.counter]))[0]) return failure();
      await finishLogin();
      await challenge('password', 'verified');
      return ok();
    }
    if (path === 'factors/totp/options') {
      if (!enrollmentKey()) return failure('unavailable', 503);
      if (await enrolled()) return failure('already_enrolled', 409);
      const generated = otp();
      await challenge('totp', encrypt(generated.secret.base32));
      return Response.json({ secret: generated.secret.base32, uri: generated.toString() });
    }
    if (path === 'factors/totp/verify') {
      const seed = await pending('totp');
      if (!seed || typeof data?.code !== 'string' || !enrollmentKey()) return failure();
      const step = otpStep(decrypt(seed), data.code);
      if (step === undefined || !await pending('totp', true)) return failure();
      const codes = Array.from({ length: 8 }, () => token());
      const [activation] = await query(`
        WITH activation AS (
          INSERT INTO operator_mfa(operator,seed,last_step) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING operator
        )
        INSERT INTO operator_recovery SELECT operator, unnest($4::text[]) FROM activation RETURNING operator
      `, [account(), seed, step, codes.map(hash)]);
      if (!activation) return failure('already_enrolled', 409);
      await finishLogin(true);
      await challenge('password', 'verified');
      return Response.json({ codes });
    }
    if (path === 'factors/recovery') {
      if (!await enrolled()) return failure();
      const codes = Array.from({ length: 8 }, () => token());
      await query(`
        WITH removed AS (DELETE FROM operator_recovery WHERE operator=$1)
        INSERT INTO operator_recovery SELECT $1, unnest($2::text[])
      `, [account(), codes.map(hash)]);
      return Response.json({ codes });
    }
    if (path === 'factors/passkey/delete') {
      if (typeof data?.id !== 'string') return failure('invalid_input', 400);
      await query('DELETE FROM operator_credentials WHERE id=$1 AND operator=$2', [data.id, account()]);
      return ok();
    }
    if (path === 'factors/passkey/options') {
      if (!await enrolled()) return failure('totp_required', 409);
      const options = await generateRegistrationOptions({ rpName: 'ResponseAble', rpID: url.hostname, userName: identity?.login ?? account()!,
        userID: new TextEncoder().encode(hash(identity?.login ?? account()!)), attestationType: 'none',
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' } });
      await challenge('register', options.challenge);
      return Response.json(options);
    }
    if (path === 'factors/passkey/verify') {
      const expectedChallenge = await pending('register', true);
      if (!expectedChallenge || !data?.credential) return failure();
      const result = await verifyRegistrationResponse({ response: data.credential, expectedChallenge,
        expectedOrigin: url.origin, expectedRPID: url.hostname, requireUserVerification: true });
      if (!result.verified) return failure();
      const { credential } = result.registrationInfo;
      if (!(await query('INSERT INTO operator_credentials(id,operator,public_key,counter,label) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id',
        [credential.id, account(), Buffer.from(credential.publicKey), credential.counter, typeof data.label === 'string' && !data.label.includes('\0') ? data.label.trim().slice(0, 80) : '']))[0]) return failure('already_registered', 409);
      return ok();
    }
    return failure('not_found', 404);
  } catch {
    return failure();
  }
}
