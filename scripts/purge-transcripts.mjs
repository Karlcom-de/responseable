import { Client } from 'pg';

if (!process.env.DATABASE_URL) throw Error('DATABASE_URL required');
const db = new Client({ connectionString: process.env.DATABASE_URL });
const retention = Math.max(1, Math.min(365, Number(process.env.RESPONSEABLE_TRANSCRIPT_RETENTION_DAYS) || 7));
await db.connect();
try {
  await db.query('DELETE FROM transcript_segments WHERE created <= $1', [Date.now() - retention * 86_400_000]);
} finally {
  await db.end();
}
