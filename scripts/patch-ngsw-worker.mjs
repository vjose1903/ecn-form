import { readFile, writeFile } from 'node:fs/promises';

const workerPath = new URL('../dist/ecn-form/ngsw-worker.js', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('../dist/ecn-form/ngsw.json', import.meta.url), 'utf8'));
if (manifest.navigationRequestStrategy !== 'performance' || manifest.applicationMaxAge !== undefined ||
    !manifest.assetGroups.some(group => group.installMode === 'prefetch' && group.urls.includes(manifest.index))) {
  throw new Error('La actualización manual requiere index.html precargado, estrategia performance y ninguna caducidad automática.');
}

const worker = await readFile(workerPath, 'utf8');
const policy = await readFile(new URL('./manual-update-policy.js', import.meta.url), 'utf8');
const entrypoint = 'new Driver(scope, adapter, new CacheDatabase(adapter));';
if (worker.split(entrypoint).length !== 2) {
  throw new Error('Cambió el punto de entrada de Angular Service Worker; revisar la política de actualización manual.');
}
await writeFile(workerPath, worker.replace(entrypoint, () => `${policy}\nnew ManualUpdateDriver(scope, adapter, new CacheDatabase(adapter));`));
