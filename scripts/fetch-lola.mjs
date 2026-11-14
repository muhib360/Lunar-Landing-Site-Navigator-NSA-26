// Downloads the LOLA DEM products used by the app into data/raw/ (gitignored).
// Usage: node scripts/fetch-lola.mjs
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const BASE = 'https://imbrium.mit.edu/DATA/LOLA_GDR';
const FILES = [
  ['POLAR/IMG/LDEM_75S_240M.IMG', 29062688],
  ['POLAR/IMG/LDEM_75S_240M.LBL', 0],
  ['CYLINDRICAL/IMG/LDEM_16.IMG', 33177600],
  ['CYLINDRICAL/IMG/LDEM_16.LBL', 0],
  ['CYLINDRICAL/IMG/LDEM_4.IMG', 2073600],
  ['CYLINDRICAL/IMG/LDEM_4.LBL', 0],
];

const outDir = join(import.meta.dirname, '..', 'data', 'raw');
mkdirSync(outDir, { recursive: true });

for (const [path, size] of FILES) {
  const name = path.split('/').pop();
  const dest = join(outDir, name);
  if (existsSync(dest) && (size === 0 || statSync(dest).size === size)) {
    console.log(`ok      ${name}`);
    continue;
  }
  console.log(`fetch   ${name}`);
  // curl is used instead of fetch() because it follows the OS certificate store on Windows.
  execFileSync('curl', ['-sSfL', '--retry', '3', '-o', dest, `${BASE}/${path}`], { stdio: 'inherit' });
  if (size && statSync(dest).size !== size) throw new Error(`${name}: unexpected size ${statSync(dest).size}`);
}
console.log('done');
