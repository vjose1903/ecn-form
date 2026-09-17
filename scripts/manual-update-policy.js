// Se inserta dentro del worker de Angular: reutiliza su descarga, hashes y cachés versionados.
// latestHash es la versión descargada; approvedHash solo cambia con ACTIVATE_UPDATE.
class ManualUpdateDriver extends Driver {
  async initialize() {
    await super.initialize();
    const table = await this.controlTable;
    let approved;
    try {
      approved = await table.read('ecn-approved-version');
    } catch (error) {
      if (!(error instanceof NotFound)) throw error;
      // Primera instalación o migración desde el worker anterior.
    }
    if (approved && !this.versions.has(approved.hash)) {
      throw new Error('No se encuentra la versión aprobada en el almacenamiento local.');
    }
    if (!approved) {
      if (!this.hasCachedShell(this.latestHash)) {
        throw new Error('La versión anterior necesita recuperarse con confirmación.');
      }
      // En producción Angular difiere esta descarga; no aprobar una caché parcial.
      await this.versions.get(this.latestHash).initializeFully();
      approved = { hash: this.latestHash };
      await table.write('ecn-approved-version', approved);
    }
    this.approvedHash = approved.hash;
  }

  hasCachedShell(hash) {
    const manifest = this.versions.get(hash)?.manifest;
    return manifest?.assetGroups.some(group => group.installMode === 'prefetch' && group.urls.includes(manifest.index));
  }

  async checkForUpdate() {
    // Angular también llama a este método al arrancar y navegar. Esas llamadas no instalan.
    return false;
  }

  async handleMessage(message, client) {
    if (message.action === 'CHECK_FOR_UPDATES') {
      this.manualDownload ??= this.downloadPublishedVersion().finally(() => { this.manualDownload = null; });
      await this.completeOperation(client, this.manualDownload, message.nonce);
    } else if (message.action === 'ACTIVATE_UPDATE') {
      await this.completeOperation(client, this.approveVersion(client), message.nonce);
    } else {
      await super.handleMessage(message, client);
    }
  }

  async downloadPublishedVersion() {
    const manifest = await this.fetchLatestManifest();
    if (manifest.configVersion !== SUPPORTED_CONFIG_VERSION) {
      throw new Error('Formato de actualización no compatible.');
    }
    const hash = hashManifest(manifest);
    // Una instancia nueva permite reintentar una descarga fallida (_okay=false).
    // Sin updateFrom: también debe funcionar si falló la inicialización del driver.
    const version = new AppVersion(this.scope, this.adapter, this.db, this.idle, this.debugger, manifest, hash);
    await version.initializeFully();
    this.versions.set(hash, version);
    this.latestHash = hash;
    await this.sync();
    return true;
  }

  async approveVersion(client) {
    if (this.manualDownload) {
      await this.manualDownload;
    }
    const version = this.versions.get(this.latestHash);
    if (!version || !version.okay || !this.hasCachedShell(this.latestHash)) {
      throw new Error('La nueva versión no está descargada completamente.');
    }
    const table = await this.controlTable;
    await table.write('ecn-approved-version', { hash: this.latestHash });
    this.approvedHash = this.latestHash;
    await this.updateClient(client);
    this.initialized = Promise.resolve();
    this.state = DriverReadyState.NORMAL;
    this.stateMessage = '(nominal)';
    return true;
  }

  onMessage(event) {
    const action = event.data?.action;
    if (['CHECK_FOR_UPDATES', 'ACTIVATE_UPDATE', 'ECN_RECOVER_UPDATE'].includes(action) && event.source?.id) {
      event.waitUntil((async () => {
        try {
          // SAFE_MODE de Angular ignora mensajes: mantener disponible la recuperación.
          try { await this.ensureInitialized(event); } catch (error) { this.debugger.log(error, 'manual recovery'); }
          if (action === 'ECN_RECOVER_UPDATE') {
            this.manualDownload ??= this.downloadPublishedVersion().finally(() => { this.manualDownload = null; });
            await this.manualDownload;
            await this.approveVersion(event.source);
            event.ports?.[0]?.postMessage({ ok: true });
          } else {
            await this.handleMessage(event.data, event.source);
          }
        } catch (error) {
          event.ports?.[0]?.postMessage({ error: String(error) });
        } finally {
          event.ports?.[0]?.close();
        }
      })());
      return;
    }
    if (event.data?.action !== 'ECN_VERSION_STATUS') {
      super.onMessage(event);
      return;
    }
    if (!event.source?.id || !event.ports?.[0]) {
      return;
    }
    event.waitUntil((async () => {
      try {
        await this.ensureInitialized(event);
        const hash = this.clientVersionMap.get(event.source.id) ?? this.approvedHash;
        event.ports[0].postMessage({ hash, approvedHash: this.approvedHash });
      } catch (error) {
        event.ports[0].postMessage({ error: String(error) });
      } finally {
        event.ports[0].close();
      }
    })());
  }

  onFetch(event) {
    // SAFE_MODE no debe saltarse la política de consentimiento en una navegación.
    const url = this.adapter.parseUrl(event.request.url, this.scope.registration.scope);
    if (event.request.mode === 'navigate' && url.path !== this.ngswStatePath &&
        !event.request.headers.has('ngsw-bypass') && !/[?&]ngsw-bypass(?:[=&]|$)/i.test(url.search)) {
      event.respondWith(this.handleFetch(event));
      return;
    }
    super.onFetch(event);
  }

  async assignVersion(event) {
    const workerRequest = event.request.destination === 'worker' && event.resultingClientId && event.clientId;
    const clientId = workerRequest ? event.clientId : event.resultingClientId || event.clientId;
    let hash = this.clientVersionMap.get(clientId) ?? this.approvedHash;
    if (!this.hasCachedShell(hash)) {
      hash = this.approvedHash;
    }
    const version = this.lookupVersionByHash(hash, 'manual approval');
    if (clientId && this.clientVersionMap.get(clientId) !== hash) {
      this.clientVersionMap.set(clientId, hash);
      await this.sync();
    }
    if (workerRequest && !this.clientVersionMap.has(event.resultingClientId)) {
      this.clientVersionMap.set(event.resultingClientId, hash);
      await this.sync();
    }
    return version;
  }

  async handleFetch(event) {
    if (event.request.mode !== 'navigate') {
      return super.handleFetch(event);
    }
    try {
      await this.ensureInitialized(event);
      const version = await this.assignVersion(event);
      const url = this.adapter.normalizeUrl(event.request.url);
      const publicIndex = this.adapter.normalizeUrl(new URL('index.html', this.scope.registration.scope).href);
      if (!version.isNavigationRequest(event.request) && url !== version.indexUrl && url !== publicIndex) {
        return super.handleFetch(event);
      }
      // Incluso un manifiesto antiguo con freshness debe respetar la aprobación guardada.
      const response = await version.handleFetch(this.adapter.newRequest(version.indexUrl), event);
      if (!response?.ok) throw new Error('No se pudo leer la versión guardada.');
      const headers = this.adapter.newHeaders(response.headers);
      headers.set('Content-Type', 'text/html; charset=utf-8');
      // La longitud/codificación del recurso de red no corresponde al body ya decodificado.
      headers.delete('Content-Length');
      headers.delete('Content-Encoding');
      return this.adapter.newResponse(response.body, { status: 200, headers });
    } catch (error) {
      this.debugger.log(error, 'manual navigation');
      return this.recoveryPage();
    } finally {
      event.waitUntil(this.idle.trigger());
    }
  }

  recoveryPage() {
    // Independiente de Angular: funciona aunque el HTML anterior nunca se haya cacheado.
    return this.adapter.newResponse(`<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Actualizar ECN Platform</title><style>
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f5f5f5;color:#202020;font:16px system-ui}
main{box-sizing:border-box;width:min(90%,420px);padding:28px;background:white;border-radius:16px}
button{padding:12px 20px;border:0;border-radius:8px;background:#a83044;color:white;font:inherit;cursor:pointer}
button:disabled{opacity:.6}p{line-height:1.5}</style></head><body>
<main role="dialog" aria-modal="true" aria-labelledby="title"><h1 id="title">Actualización necesaria</h1>
<p>La versión guardada no se pudo abrir. Pulsa Refrescar para descargar y abrir la versión disponible.</p>
<p id="status" role="status" aria-live="polite"></p><button id="refresh">Refrescar</button></main>
<script>
const button=document.getElementById('refresh'),status=document.getElementById('status');
button.addEventListener('click',async()=>{
  button.disabled=true;status.textContent='Descargando actualización…';
  try{
    const worker=navigator.serviceWorker.controller;
    if(!worker)throw new Error('Sin controlador');
    await new Promise((resolve,reject)=>{
      const channel=new MessageChannel();
      const finish=(error)=>{clearTimeout(timer);channel.port1.close();error?reject(error):resolve();};
      const timer=setTimeout(()=>finish(new Error('Tiempo agotado')),120000);
      channel.port1.onmessage=event=>finish(event.data.ok?null:new Error(event.data.error));
      try{worker.postMessage({action:'ECN_RECOVER_UPDATE'},[channel.port2]);}catch(error){finish(error);}
    });
    location.reload();
  }catch(error){status.textContent='No se pudo completar la actualización. Comprueba tu conexión y vuelve a intentarlo.';button.disabled=false;}
});
</script></body></html>`, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  async cleanupCaches() {
    // La versión aprobada debe sobrevivir aunque no queden pestañas abiertas.
    if (!this.approvedHash || this.manualDownload) return;
    try {
      const activeClients = new Set((await this.scope.clients.matchAll()).map(client => client.id));
      if (this.manualDownload) return;
      for (const id of this.clientVersionMap.keys()) {
        if (!activeClients.has(id)) this.clientVersionMap.delete(id);
      }
      const retained = new Set([...this.clientVersionMap.values(), this.approvedHash, this.latestHash]);
      for (const hash of this.versions.keys()) {
        if (!retained.has(hash)) this.versions.delete(hash);
      }
      await this.sync();
      const used = new Set(await this.getCacheNames());
      const caches = await this.adapter.caches.keys();
      if (this.manualDownload) return;
      await Promise.all(caches.filter(name => !used.has(name)).map(name => this.adapter.caches.delete(name)));
    } catch (error) {
      this.debugger.log(error, 'manual cleanup');
    }
  }
}
