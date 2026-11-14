import { Client } from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL fehlt.');
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(70601924)');
  await db.query(`
    CREATE TABLE IF NOT EXISTS responseable_schema (version integer PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS incidents (id text PRIMARY KEY, title text NOT NULL, summary text NOT NULL, created bigint NOT NULL);
    CREATE TABLE IF NOT EXISTS rooms (id text PRIMARY KEY, incident text NOT NULL REFERENCES incidents(id), name text NOT NULL, main integer NOT NULL CHECK (main IN (0, 1)));
    CREATE UNIQUE INDEX IF NOT EXISTS main_room ON rooms(incident) WHERE main = 1;
    CREATE TABLE IF NOT EXISTS invitations (hash text PRIMARY KEY, room text NOT NULL REFERENCES rooms(id), expires bigint NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash text PRIMARY KEY, name text NOT NULL, room text REFERENCES rooms(id), expires bigint NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, room text NOT NULL REFERENCES rooms(id), name text NOT NULL, guest integer NOT NULL, body text NOT NULL, created bigint NOT NULL);
    CREATE INDEX IF NOT EXISTS room_messages ON messages(room, id);
    INSERT INTO responseable_schema VALUES (1) ON CONFLICT DO NOTHING;
    CREATE TABLE IF NOT EXISTS responseable_mode (singleton boolean PRIMARY KEY CHECK (singleton), demo boolean NOT NULL);
    CREATE TABLE IF NOT EXISTS boards (room text PRIMARY KEY REFERENCES rooms(id), elements jsonb NOT NULL DEFAULT '{}'::jsonb, revision integer NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS notifications (id uuid PRIMARY KEY, room text NOT NULL REFERENCES rooms(id), operator text NOT NULL, number text NOT NULL, method text NOT NULL, status text NOT NULL, created bigint NOT NULL);
    INSERT INTO responseable_schema VALUES (2) ON CONFLICT DO NOTHING;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT '';
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS invite_hash text REFERENCES invitations(hash);
    INSERT INTO responseable_schema VALUES (3) ON CONFLICT DO NOTHING;
  `);
  const demo = process.env.RESPONSEABLE_MODE === 'demo';
  await db.query('INSERT INTO responseable_mode VALUES (true, $1) ON CONFLICT DO NOTHING', [demo]);
  const mode = await db.query('SELECT demo FROM responseable_mode');
  if (mode.rows[0].demo !== demo) throw new Error('Demo- und Realbetrieb benötigen getrennte Datenbanken.');
  if (demo) await db.query(`
    INSERT INTO incidents VALUES ('demo', 'Hochwasser Süd', 'Übungslage. Wasserstände beobachten und Rückmeldungen koordinieren.', 0) ON CONFLICT DO NOTHING;
    INSERT INTO rooms VALUES ('demo-haupt', 'demo', 'Einsatzleitung', 1), ('demo-nord', 'demo', 'Abschnitt Nord', 0) ON CONFLICT DO NOTHING;
  `);
  await db.query('COMMIT');
} finally {
  await db.end();
}
