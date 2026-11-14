import { scryptSync, randomBytes } from 'node:crypto';
import { Client } from 'pg';

const [mode, login] = process.argv.slice(2);
if (!['new', 'legacy'].includes(mode) || !login || login.length > 80 || login !== login.trim() || /[\p{C}]/u.test(login) || !process.env.DATABASE_URL) {
  throw Error('Usage: bootstrap-admin.mjs new|legacy LOGIN with DATABASE_URL; new reads a password from stdin');
}
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(70601925)');
  const existing = await db.query('SELECT login, role, active FROM accounts');
  if (existing.rowCount) {
    if (!existing.rows.some(row => row.login === login && row.role === 'admin' && row.active)) throw Error('Account bootstrap is already complete');
  } else {
    if ((await db.query('SELECT demo FROM responseable_mode WHERE singleton')).rows[0]?.demo !== false) throw Error('Bootstrap requires a production database');
    let passwordHash;
    if (mode === 'legacy') {
      passwordHash = process.env.RESPONSEABLE_PASSWORD_HASH;
      if (login !== process.env.RESPONSEABLE_OPERATOR || !/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(passwordHash || '')) throw Error('Legacy identity does not exactly match configuration');
    } else {
      let pass = '';
      for await (const chunk of process.stdin.setEncoding('utf8')) {
        pass += chunk;
        if (pass.length > 258) throw Error('Invalid password length');
      }
      pass = pass.replace(/\r?\n$/, '');
      if (pass.length < 16 || pass.length > 256) throw Error('Password must contain 16 to 256 characters');
      const salt = randomBytes(16).toString('hex');
      passwordHash = salt + ':' + scryptSync(pass, salt, 64).toString('hex');
    }
    const { rows: [account] } = await db.query(
      "INSERT INTO accounts(login,display_name,password_hash,role) VALUES($1,$1,$2,'admin') RETURNING id",
      [login, passwordHash],
    );
    if (mode === 'legacy') {
      await db.query('INSERT INTO operator_mfa(operator,seed,last_step) SELECT $1,seed,last_step FROM operator_mfa WHERE operator=$2', [account.id, login]);
      for (const table of ['operator_credentials', 'operator_recovery']) {
        await db.query(`UPDATE ${table} SET operator=$1 WHERE operator=$2`, [account.id, login]);
      }
      await db.query('DELETE FROM operator_mfa WHERE operator=$1', [login]);
      await db.query("UPDATE notifications SET operator=$1 WHERE operator=$2 AND status='draft'", [account.id, login]);
      await db.query('DELETE FROM auth_challenges WHERE operator=$1', [login]);
      await db.query('DELETE FROM sessions WHERE account_id IS NULL AND room IS NULL AND name=$1', [login]);
    }
    await db.query('INSERT INTO account_audit(subject_id,action) VALUES($1,$2)', [account.id, mode === 'legacy' ? 'legacy_import' : 'bootstrap']);
  }
  await db.query('COMMIT');
  console.log('Initial administrator present');
} finally {
  await db.end();
}
