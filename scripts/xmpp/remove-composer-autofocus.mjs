// Converse 12 hardcodes autofocus in both message composer templates.
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const original = readFileSync(file, 'utf8');
const autofocus = '<textarea autofocus type=';
if (original.split(autofocus).length !== 3) {
  throw new Error('Unexpected Converse composer markup; review the pinned release.');
}
writeFileSync(file, original.replaceAll(autofocus, '<textarea type='));
