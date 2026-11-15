// Copies CesiumJS's runtime files (web workers, textures, widget CSS) into public/cesium so the
// globe works offline in both `npm run dev` and the static build. Runs automatically before
// dev and build (see package.json "predev"/"prebuild"); public/cesium is gitignored.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const src = join(root, 'node_modules', 'cesium', 'Build', 'Cesium');
const dest = join(root, 'public', 'cesium');
const version = JSON.parse(readFileSync(join(root, 'node_modules', 'cesium', 'package.json'), 'utf8')).version;
const stamp = join(dest, '.version');

if (existsSync(stamp) && readFileSync(stamp, 'utf8') === version) {
  console.log(`cesium ${version} assets already in public/cesium`);
} else {
  for (const dir of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) cpSync(join(src, dir), join(dest, dir), { recursive: true });
  writeFileSync(stamp, version);
  console.log(`copied cesium ${version} assets to public/cesium`);
}
