import { access, rename, rmdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';

const outputRoot = resolve(process.argv[2] ?? 'dist/client');
const nestedRoot = resolve(outputRoot, 'frontier-radar');
const nestedAssets = resolve(nestedRoot, '_next');
const publicAssets = resolve(outputRoot, '_next');

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(nestedAssets))) {
  if (await exists(publicAssets)) {
    console.log('GitHub Pages assets are already in the expected location.');
    process.exit(0);
  }
  throw new Error(`Static asset directory was not generated: ${nestedAssets}`);
}

if (await exists(publicAssets)) {
  throw new Error(
    `Both nested and public static asset directories exist; refusing to overwrite ${publicAssets}`,
  );
}

await rename(nestedAssets, publicAssets);
await rmdir(nestedRoot);
console.log('Prepared GitHub Pages assets at /frontier-radar/_next/.');
