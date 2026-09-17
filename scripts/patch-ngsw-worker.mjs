import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

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
// Netlify puede inyectar metadatos en HTML después de generar ngsw.json.
// Conservar los bytes originales en un recurso de texto con nombre inmutable.
// El worker lo entrega como HTML únicamente al navegar dentro de la aplicación.
const index = manifest.index;
const html = await readFile(new URL(`../dist/ecn-form${index}`, import.meta.url));
const shellHash = createHash('sha1').update(html).digest('hex');
const shell = `/app-shell.${shellHash}.html`;
await writeFile(new URL(`../dist/ecn-form${shell}`, import.meta.url), html);
manifest.index = shell;
for (const group of manifest.assetGroups) {
  group.urls = group.urls.map(url => url === index ? shell : url);
}
delete manifest.hashTable[index];
manifest.hashTable[shell] = shellHash;
await writeFile(new URL('../dist/ecn-form/ngsw.json', import.meta.url), JSON.stringify(manifest, null, 2));
await writeFile(workerPath, worker.replace(entrypoint, () => `${policy}\nnew ManualUpdateDriver(scope, adapter, new CacheDatabase(adapter));`));
