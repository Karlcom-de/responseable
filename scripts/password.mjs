import { randomBytes, scryptSync } from 'node:crypto';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString().replace(/\r?\n$/, '');
if (password.length < 16 || password.length > 256) {
  console.error('Das Passwort muss 16 bis 256 Zeichen lang sein.');
  process.exit(1);
}
const salt = randomBytes(16).toString('hex');
process.stdout.write(salt + ':' + scryptSync(password, salt, 64).toString('hex') + '\n');
