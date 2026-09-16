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
      // Los despliegues antiguos con freshness no guardaban index.html.
      // Solo durante esta migración hay que crear una primera versión que pueda conservarse.
      if (!this.hasCachedShell(this.latestHash)) {
        const manifest = await this.fetchLatestManifest();
        const hash = hashManifest(manifest);
        const version = new AppVersion(this.scope, this.adapter, this.db, this.idle, this.debugger, manifest, hash);
        await version.initializeFully();
        this.versions.set(hash, version);
        this.latestHash = hash;
        await this.sync();
      }
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
    const hash = hashManifest(manifest);
    if (this.versions.has(hash)) {
      await this.versions.get(hash).initializeFully();
      this.latestHash = hash;
      await this.sync();
    } else {
      await this.setupUpdate(manifest, hash);
    }
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
    return true;
  }

  onMessage(event) {
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
      if (!version.isNavigationRequest(event.request) && url !== version.indexUrl) {
        return super.handleFetch(event);
      }
      // Incluso un manifiesto antiguo con freshness debe respetar la aprobación guardada.
      return await version.handleFetch(this.adapter.newRequest(version.indexUrl), event);
    } catch (error) {
      this.debugger.log(error, 'manual navigation');
      // No cargar otro deploy silenciosamente si falla la versión aprobada.
      return this.adapter.newResponse('No se pudo abrir la versión guardada. Vuelve a intentarlo con conexión.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    } finally {
      event.waitUntil(this.idle.trigger());
    }
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
