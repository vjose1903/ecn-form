import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const angularWorker = await readFile(new URL('node_modules/@angular/service-worker/ngsw-worker.js', root), 'utf8');
const policy = await readFile(new URL('scripts/manual-update-policy.js', root), 'utf8');
const monitorCode = ts.transpileModule(await readFile(new URL('src/app/core/services/app-update-monitor.ts', root), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
// Angular difiere la precarga fuera de localhost: reproducir el flujo de producción.
const origin = 'https://ecn.example/';
const sha1 = value => createHash('sha1').update(value).digest('hex');

function release(name, extra = {}) {
  const assets = { '/index.html': `<html>${name}</html>`, [`/main.${sha1(name)}.js`]: name, ...extra };
  const manifest = {
    configVersion: 1, timestamp: name.charCodeAt(0), index: '/index.html',
    assetGroups: [{ name: 'app', installMode: 'prefetch', updateMode: 'prefetch', urls: Object.keys(assets), patterns: [], cacheQueryOptions: {} }],
    dataGroups: [], hashTable: Object.fromEntries(Object.entries(assets).map(([path, value]) => [path, sha1(value)])),
    navigationUrls: [{ positive: true, regex: '^/.*$' }], navigationRequestStrategy: 'performance',
  };
  return { assets, manifest, hash: sha1(JSON.stringify(manifest)) };
}

class BrowserRequest extends Request {
  constructor(input, options) { super(typeof input === 'string' ? new URL(input, origin) : input, options); }
}

// Caché de prueba con copias de Response, igual que Cache API; el driver y los hashes son los reales de Angular.
class MemoryCache {
  entries = new Map();
  key(request) { return typeof request === 'string' ? new URL(request, origin).href : request.url; }
  async match(request) { return this.entries.get(this.key(request))?.clone(); }
  async put(request, response) { this.entries.set(this.key(request), response.clone()); }
  async delete(request) { return this.entries.delete(this.key(request)); }
  async keys() { return [...this.entries.keys()].map(url => new BrowserRequest(url)); }
}
class MemoryCacheStorage {
  entries = new Map();
  async open(name) { if (!this.entries.has(name)) this.entries.set(name, new MemoryCache()); return this.entries.get(name); }
  async keys() { return [...this.entries.keys()]; }
  async delete(name) { return this.entries.delete(name); }
  async has(name) { return this.entries.has(name); }
}

function workerHost(published = release('A')) {
  const caches = new MemoryCacheStorage();
  const clients = new Map();
  const host = { published, requests: [], caches, clients };
  host.restart = (legacy = false) => {
    const scope = {
      caches, registration: { scope: origin }, addEventListener() {},
      clients: { matchAll: async () => [...clients.values()], get: async id => clients.get(id) },
      fetch: async request => {
        const path = new URL(request.url, origin).pathname;
        host.requests.push(path);
        if (path === '/ngsw.json') return Response.json(host.published.manifest);
        if (host.broken === path) return new Response('broken', { status: 503 });
        const asset = host.published.assets[path === '/' ? '/index.html' : path];
        return new Response(asset ?? 'missing', { status: asset === undefined ? 404 : 200 });
      },
    };
    const source = angularWorker.replace('new Driver(scope, adapter, new CacheDatabase(adapter));',
      () => legacy ? 'self.driver = new Driver(scope, adapter, new CacheDatabase(adapter));' : `${policy}\nself.driver = new ManualUpdateDriver(scope, adapter, new CacheDatabase(adapter));`);
    vm.runInNewContext(source, { self: scope, Request: BrowserRequest, Response, Headers, URL, console, setTimeout: () => 1, clearTimeout() {} });
    host.driver = scope.driver;
  };
  host.restart();
  host.navigate = async id => {
    if (!clients.has(id)) clients.set(id, { id, messages: [], postMessage(message) { this.messages.push(message); } });
    const request = new BrowserRequest(origin, { headers: { Accept: 'text/html' } });
    Object.defineProperty(request, 'mode', { value: 'navigate' });
    const response = await host.driver.handleFetch({ request, resultingClientId: id, clientId: '', waitUntil() {} });
    return response.text();
  };
  host.message = async (action, id = 'tab') => {
    const client = clients.get(id);
    await host.driver.handleMessage({ action, nonce: 1 }, client);
    return client.messages.filter(message => message.type === 'OPERATION_COMPLETED').at(-1);
  };
  return host;
}

test('publicar B, recargar, salir y volver conserva A hasta confirmar; también sobrevive al reinicio del worker', async () => {
  const host = workerHost();
  assert.equal(await host.navigate('tab'), '<html>A</html>');
  host.published = release('B');
  await host.driver.idle.execute();
  assert.equal(await host.navigate('reload'), '<html>A</html>');
  assert.equal((await host.message('CHECK_FOR_UPDATES')).result, true);
  assert.equal(await host.navigate('prepared-but-not-approved'), '<html>A</html>');
  host.clients.clear();
  await host.driver.cleanupCaches();
  host.restart();
  assert.equal(await host.navigate('tab'), '<html>A</html>');
  assert.equal((await host.message('ACTIVATE_UPDATE')).result, true);
  assert.equal(await host.navigate('accepted'), '<html>B</html>');
  host.clients.clear();
  host.restart();
  assert.equal(await host.navigate('reopened'), '<html>B</html>');
});

test('una descarga incompleta conserva la versión aprobada y permite reintentar', async () => {
  const host = workerHost();
  await host.navigate('tab');
  host.published = release('B');
  host.broken = Object.keys(host.published.assets).find(path => path.endsWith('.js'));
  assert.ok((await host.message('CHECK_FOR_UPDATES')).error);
  assert.equal(await host.navigate('retry'), '<html>A</html>');
  host.broken = null;
  assert.equal((await host.message('CHECK_FOR_UPDATES')).result, true);
  assert.equal((await host.message('ACTIVATE_UPDATE')).result, true);
  assert.equal(await host.navigate('updated'), '<html>B</html>');
});

test('la limpieza no toca cachés de otras funciones de la aplicación', async () => {
  const host = workerHost();
  await host.caches.open('firebase-notifications');
  await host.navigate('tab');
  host.clients.clear();
  await host.driver.cleanupCaches();
  assert.ok(await host.caches.has('firebase-notifications'));
  assert.equal(await host.navigate('back'), '<html>A</html>');
});

test('un worker antiguo sin index cacheado requiere confirmación para recuperarse', async () => {
  const old = release('A');
  old.manifest.navigationRequestStrategy = 'freshness';
  old.manifest.assetGroups[0].urls = old.manifest.assetGroups[0].urls.filter(url => url !== '/index.html');
  delete old.manifest.hashTable['/index.html'];
  const host = workerHost(old);
  host.restart(true);
  assert.equal(await host.navigate('legacy'), '<html>A</html>');
  host.published = release('B');
  host.clients.clear();
  host.restart();
  assert.match(await host.navigate('migrated'), /Actualización necesaria/);
  assert.equal((await host.message('CHECK_FOR_UPDATES', 'migrated')).result, true);
  assert.equal((await host.message('ACTIVATE_UPDATE', 'migrated')).result, true);
  assert.equal(await host.navigate('accepted'), '<html>B</html>');
  host.published = release('C');
  assert.equal(await host.navigate('next-deploy'), '<html>B</html>');
});

test('el HTML transformado por el hosting no afecta al shell de texto versionado', async () => {
  const deployed = release('A');
  const shell = `/app-shell.${sha1(deployed.assets['/index.html'])}.txt`;
  deployed.assets[shell] = deployed.assets['/index.html'];
  deployed.assets['/index.html'] += '<!-- HTML añadido por el hosting -->';
  deployed.manifest.index = shell;
  deployed.manifest.assetGroups[0].urls = deployed.manifest.assetGroups[0].urls.map(url => url === '/index.html' ? shell : url);
  deployed.manifest.hashTable[shell] = deployed.manifest.hashTable['/index.html'];
  delete deployed.manifest.hashTable['/index.html'];
  const host = workerHost(deployed);
  assert.equal(await host.navigate('tab'), '<html>A</html>');
  host.published = release('B');
  assert.equal(await host.navigate('reopened'), '<html>A</html>');
  assert.ok(!host.requests.includes('/index.html'));
});

test('un fallo inicial conserva la recuperación en SAFE_MODE y permite reintentar el mismo manifiesto', async () => {
  const host = workerHost();
  host.broken = '/index.html';
  assert.match(await host.navigate('tab'), /Actualización necesaria/);
  let response;
  const request = new BrowserRequest(origin, { headers: { Accept: 'text/html' } });
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  host.driver.onFetch({ request, resultingClientId: 'again', clientId: '', waitUntil() {}, respondWith(value) { response = value; } });
  assert.match(await (await response).text(), /Actualización necesaria/);
  host.broken = null;
  let operation;
  let result;
  host.driver.onMessage({
    data: { action: 'ECN_RECOVER_UPDATE' }, source: host.clients.get('tab'),
    ports: [{ postMessage(value) { result = value; }, close() {} }],
    waitUntil(value) { operation = value; },
  });
  await operation;
  assert.equal(result.ok, true);
  assert.equal(await host.navigate('recovered'), '<html>A</html>');
});

test('la versión de una ventana abierta no cambia porque otra ventana apruebe un deploy', async () => {
  const host = workerHost();
  await host.navigate('tab');
  await host.navigate('other-tab');
  host.published = release('B');
  await host.message('CHECK_FOR_UPDATES');
  await host.message('ACTIVATE_UPDATE');
  let status;
  let operation;
  host.driver.onMessage({
    data: { action: 'ECN_VERSION_STATUS' }, source: host.clients.get('other-tab'),
    ports: [{ postMessage(message) { status = message; }, close() {} }],
    waitUntil(promise) { operation = promise; },
  });
  await operation;
  assert.equal(status.hash, release('A').hash);
  assert.equal(status.approvedHash, release('B').hash);
});

function monitorHost(initial = release('A')) {
  const host = { published: initial, available: [], current: 0, calls: 0, intervals: new Map(), timeouts: new Map(), now: Date.now(), requests: [] };
  let timerId = 0;
  const window = new EventTarget();
  window.location = new URL(origin);
  const document = new EventTarget();
  document.baseURI = origin;
  document.visibilityState = 'visible';
  document.querySelectorAll = () => [];
  const exports = {};
  class Channel {
    constructor() {
      this.port1 = { close() {}, onmessage: null };
      this.port2 = { close() {}, postMessage: data => queueMicrotask(() => this.port1.onmessage?.({ data })) };
    }
  }
  vm.runInNewContext(monitorCode, {
    exports, window, document, URL, TextEncoder, Uint8Array, AbortController, crypto: webcrypto,
    Date: class extends Date { static now() { return host.now; } },
    console, MessageChannel: Channel,
    navigator: { serviceWorker: { controller: { postMessage: (_message, ports) => ports[0].postMessage({ hash: initial.hash }) } } },
    setInterval: (callback, ms) => { const id = ++timerId; host.intervals.set(id, { callback, ms }); return id; },
    clearInterval: id => host.intervals.delete(id),
    setTimeout: (callback, ms) => { const id = ++timerId; host.timeouts.set(id, { callback, ms }); return id; },
    clearTimeout: id => host.timeouts.delete(id),
    fetch: async (url, options) => {
      host.calls++;
      host.requests.push({ url, options });
      if (host.hang) return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
      return Response.json(host.published.manifest);
    },
  });
  host.monitor = new exports.AppUpdateMonitor({ available: hash => host.available.push(hash), current: () => host.current++ });
  host.event = name => window.dispatchEvent(new Event(name));
  host.tick = async () => {
    host.now += 300000;
    for (const timer of host.intervals.values()) { assert.equal(timer.ms, 300000); timer.callback(); }
    await host.monitor.check();
  };
  return host;
}

test('consulta inmediata y a los cinco minutos detecta un cambio solo de imagen sin activar el worker', async () => {
  const initial = release('A', { '/logo.png': 'logo anterior' });
  const host = monitorHost(initial);
  host.monitor.start();
  await host.monitor.check();
  assert.equal(host.calls, 1);
  assert.equal(host.current, 1);
  host.published = release('A', { '/logo.png': 'logo nuevo' });
  await host.tick();
  assert.equal(host.calls, 2);
  assert.equal(host.available[0], host.published.hash);
  assert.equal(host.requests[1].options.cache, 'no-store');
  assert.equal(host.requests[1].url.searchParams.get('ngsw-bypass'), 'true');
  host.monitor.stop();
});

test('pagehide cancela consulta e intervalo; pageshow consulta de inmediato sin duplicar timers', async () => {
  const host = monitorHost();
  host.hang = true;
  host.monitor.start();
  const pending = host.monitor.check();
  host.event('pagehide');
  await pending;
  assert.equal(host.requests[0].options.signal.aborted, true);
  assert.equal(host.intervals.size, 0);
  host.hang = false;
  host.event('pageshow');
  host.event('focus');
  await host.monitor.check();
  assert.equal(host.calls, 2);
  assert.equal(host.intervals.size, 1);
  host.monitor.stop();
  assert.equal(host.intervals.size, 0);
  assert.equal(host.timeouts.size, 0);
  host.event('pageshow');
  assert.equal(host.intervals.size, 0);
});

test('un error de red no deja bloqueada la siguiente comprobación', async () => {
  const host = monitorHost();
  host.hang = true;
  host.monitor.start();
  const first = host.monitor.check();
  [...host.timeouts.values()].find(timer => timer.ms === 15000).callback();
  await first;
  host.hang = false;
  host.published = release('B');
  await host.tick();
  assert.equal(host.available[0], host.published.hash);
  host.monitor.stop();
});
