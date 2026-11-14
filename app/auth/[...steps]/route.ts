import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { account, canManage, challenge, decrypt, encrypt, enrolled, enrollmentKey, finishLogin, limit, otp, otpStep, pending, required, verifyTotp } from '../../../lib/mfa';
import { demo, hash, operatorLogin, query, token } from '../../../lib/store';

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

export async function GET(_: Request, { params }: Context) {
  if ((await params).steps.join('/') !== 'factors' || !await canManage()) return failure();
  const credentials = await query('SELECT id, label, created_at AS "createdAt", last_used_at AS "lastUsedAt" FROM operator_credentials WHERE operator=$1 ORDER BY created_at', [account()]);
  return Response.json({ enrolled: await enrolled(), credentials });
}

export async function POST(request: Request, { params }: Context) {
  if (demo || !account()) return failure('not_found', 404);
  const url = origin();
  if (!url || request.headers.get('origin') !== url.origin) return failure('invalid_origin', 403);
  const path = (await params).steps.join('/');
  if (!await limit()) return failure('rate_limited', 429);
  const data = await request.json().catch(() => null);
  try {
    if (path === 'password') {
      if (typeof data?.name !== 'string' || typeof data.password !== 'string' ||
        data.password.length > 256 || !operatorLogin(data.name, data.password)) return failure();
      if (await enrolled()) {
        await challenge('password', 'factor');
        return Response.json({ next: 'totp' });
      }
      if (required() && !enrollmentKey()) return failure('unavailable', 503);
      if (!required()) await finishLogin(false, false);
      await challenge('password', 'verified');
      return Response.json({ next: required() ? 'enroll' : 'done' });
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
    if (!await canManage()) return failure();
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
      const options = await generateRegistrationOptions({ rpName: 'ResponseAble', rpID: url.hostname, userName: account()!,
        userID: new TextEncoder().encode(hash(account()!)), attestationType: 'none',
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
