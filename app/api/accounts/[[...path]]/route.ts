import { randomBytes, scryptSync } from 'node:crypto';
import { accountsEnabled, db, query, session } from '../../../../lib/store';

type Context = { params: Promise<{ path?: string[] }> };
const missing = () => new Response(null, { status: 404 });
const invalid = () => new Response(null, { status: 400 });
const role = (value: unknown) => ['admin', 'coordinator', 'responder'].includes(String(value));
const name = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 80 && value.trim() === value && !/[\p{C}]/u.test(value);
const password = (value: unknown): value is string => typeof value === 'string' && value.length >= 16 && value.length <= 256;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function encoded(value: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(value, salt, 64).toString('hex');
}

export async function GET() {
  if (!accountsEnabled() || (await session())?.role !== 'admin') return missing();
  const accounts = await query('SELECT id,login,display_name AS "displayName",role,active FROM accounts ORDER BY login');
  const incidents = await query('SELECT id,title FROM incidents ORDER BY title,id');
  const assignments = await query('SELECT account_id AS "accountId",incident_id AS "incidentId" FROM incident_accounts');
  return Response.json({ accounts, incidents, assignments });
}

async function change(request: Request, context: Context) {
  if (!accountsEnabled() || !process.env.RESPONSEABLE_PUBLIC_ORIGIN ||
      request.headers.get('origin') !== process.env.RESPONSEABLE_PUBLIC_ORIGIN) return missing();
  const actor = await session();
  if (actor?.role !== 'admin' || !actor.accountId) return missing();
  const [id, suffix, ...extra] = (await context.params).path ?? [];
  const data = await request.json().catch(() => null);
  if (!data || extra.length) return invalid();
  const create = request.method === 'POST' && !id;
  const assign = request.method === 'PUT' && suffix === 'incidents';
  const update = request.method === 'PATCH' && !suffix;
  if (create ? !name(data.login) || !name(data.displayName) || !password(data.password) || !role(data.role)
    : !id || !uuid.test(id) || (!assign && !update)) return invalid();
  if (assign && (!Array.isArray(data.incidentIds) || data.incidentIds.length > 500 ||
    !data.incidentIds.every((value: unknown) => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value)))) return invalid();
  if (update && ((data.role !== undefined && !role(data.role)) || (data.active !== undefined && typeof data.active !== 'boolean') ||
    (data.password !== undefined && !password(data.password)) || (data.role === undefined && data.active === undefined && data.password === undefined))) return invalid();

  const hash = data.password ? encoded(data.password) : null;
  const connection = await db().connect();
  try {
    await connection.query('BEGIN');
    await connection.query('SELECT pg_advisory_xact_lock(70601925)');
    if (!(await connection.query(`
      SELECT 1 FROM accounts a JOIN sessions s ON s.account_id=a.id
      WHERE a.id=$1 AND a.active AND a.role='admin' AND NOT a.require_password_change
        AND s.hash=$2 AND s.expires>$3 AND s.credential_generation=a.credential_generation
    `, [actor.accountId, actor.sessionHash, Date.now()])).rowCount) return missing();
    let subject = id;
    let action;
    if (create) {
      const { rows } = await connection.query(
        'INSERT INTO accounts(login,display_name,password_hash,role,require_password_change) VALUES($1,$2,$3,$4,true) RETURNING id',
        [data.login, data.displayName, hash, data.role],
      );
      subject = rows[0].id;
      action = 'create';
    } else {
      const { rows: [target] } = await connection.query('SELECT role,active FROM accounts WHERE id=$1', [id]);
      if (!target) return missing();
      if (assign) {
        await connection.query('DELETE FROM incident_accounts WHERE account_id=$1', [id]);
        await connection.query('INSERT INTO incident_accounts SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING', [id, data.incidentIds]);
        action = 'assign_incidents';
      } else {
        const removesAdmin = target.active && target.role === 'admin' &&
          (data.active === false || (data.role && data.role !== 'admin'));
        if (removesAdmin && !(await connection.query(
          "SELECT 1 FROM accounts WHERE active AND role='admin' AND id<>$1 LIMIT 1", [id],
        )).rowCount) return new Response(null, { status: 409 });
        await connection.query(`
          UPDATE accounts SET role=COALESCE($2,role),active=COALESCE($3,active),password_hash=COALESCE($4,password_hash),
            require_password_change=CASE WHEN $4 IS NULL THEN require_password_change ELSE true END,
            credential_generation=credential_generation+1 WHERE id=$1
        `, [id, data.role ?? null, data.active ?? null, hash]);
        action = hash ? 'reset_password' : 'update_access';
      }
    }
    await connection.query('INSERT INTO account_audit(actor_id,subject_id,action) VALUES($1,$2,$3)', [actor.accountId, subject, action]);
    await connection.query('COMMIT');
    return create ? Response.json({ id: subject }, { status: 201 }) : new Response(null, { status: 204 });
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && (error.code === '23505' || error.code === '23503')) return new Response(null, { status: 409 });
    throw error;
  } finally {
    await connection.query('ROLLBACK').finally(() => connection.release());
  }
}

export const POST = change;
export const PATCH = change;
export const PUT = change;
