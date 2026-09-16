interface UpdateMonitorCallbacks {
  available: (version: string) => void;
  current: () => void;
}

/** Consulta metadatos; nunca descarga ni activa un deploy. Vive únicamente en el documento abierto. */
export class AppUpdateMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private request: AbortController | null = null;
  private inFlight: Promise<void> | null = null;
  private started = false;
  private active = false;
  private currentHash: string | null = null;
  private lastCheckAt = 0;
  private readonly resume = (): void => {
    if (!this.started) return;
    this.active = true;
    this.timer ??= setInterval(() => { void this.check(); }, 5 * 60 * 1000);
    void this.check();
  };
  private readonly leave = (): void => {
    this.active = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.request?.abort();
    this.inFlight = null;
    this.lastCheckAt = 0;
  };
  private readonly becameVisible = (): void => {
    if (document.visibilityState === 'visible') this.resume();
  };

  constructor(private readonly callbacks: UpdateMonitorCallbacks) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('pagehide', this.leave);
    window.addEventListener('pageshow', this.resume);
    window.addEventListener('focus', this.resume);
    window.addEventListener('online', this.resume);
    document.addEventListener('visibilitychange', this.becameVisible);
    this.resume();
  }

  stop(): void {
    this.started = false;
    this.leave();
    window.removeEventListener('pagehide', this.leave);
    window.removeEventListener('pageshow', this.resume);
    window.removeEventListener('focus', this.resume);
    window.removeEventListener('online', this.resume);
    document.removeEventListener('visibilitychange', this.becameVisible);
  }

  check(): Promise<void> {
    if (!this.active) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    // focus, pageshow y visibilitychange suelen llegar juntos. Una consulta cubre ese grupo.
    if (Date.now() - this.lastCheckAt < 2000) return Promise.resolve();
    this.lastCheckAt = Date.now();
    const operation = this.fetchVersion().finally(() => {
      if (this.inFlight === operation) this.inFlight = null;
    });
    this.inFlight = operation;
    return operation;
  }

  private async fetchVersion(): Promise<void> {
    const request = new AbortController();
    this.request = request;
    const requestTimeout = setTimeout(() => request.abort(), 15000);
    try {
      const url = new URL('ngsw.json', document.baseURI);
      url.searchParams.set('ngsw-bypass', 'true');
      url.searchParams.set('t', String(Date.now()));
      const [response, currentHash] = await Promise.all([
        fetch(url, { cache: 'no-store', signal: request.signal, headers: { 'ngsw-bypass': 'true' } }),
        this.readCurrentHash(request.signal),
      ]);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = await response.json() as { configVersion?: number; hashTable?: Record<string, string> };
      if (manifest.configVersion !== 1 || !manifest.hashTable || typeof manifest.hashTable !== 'object') {
        throw new Error('Manifiesto de actualización inválido');
      }
      const bytes = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(JSON.stringify(manifest)));
      const publishedHash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
      if (!this.active || request.signal.aborted) return;

      // Comparación del manifiesto completo: incluye chunks diferidos, imágenes y cambios de HTML.
      const changed = currentHash ? currentHash !== publishedHash : this.hasDifferentBundles(manifest.hashTable);
      if (changed) this.callbacks.available(publishedHash);
      else this.callbacks.current();
    } catch (error) {
      if (!request.signal.aborted) console.warn('No se pudo consultar la versión publicada', error);
    } finally {
      clearTimeout(requestTimeout);
      if (this.request === request) this.request = null;
    }
  }

  private readCurrentHash(signal: AbortSignal): Promise<string | null> {
    if (this.currentHash) return Promise.resolve(this.currentHash);
    const worker = navigator.serviceWorker?.controller;
    if (!worker || signal.aborted) return Promise.resolve(null);
    return new Promise(resolve => {
      const channel = new MessageChannel();
      const finish = (hash: string | null): void => {
        clearTimeout(waitTimeout);
        signal.removeEventListener('abort', abort);
        channel.port1.close();
        channel.port2.close();
        if (hash) this.currentHash = hash;
        resolve(hash);
      };
      const abort = (): void => finish(null);
      const waitTimeout = setTimeout(abort, 2000);
      signal.addEventListener('abort', abort, { once: true });
      channel.port1.onmessage = event => {
        const hash = event.data?.hash;
        finish(typeof hash === 'string' && /^[a-f0-9]{40}$/.test(hash) ? hash : null);
      };
      try {
        worker.postMessage({ action: 'ECN_VERSION_STATUS' }, [channel.port2]);
      } catch {
        finish(null);
      }
    });
  }

  private hasDifferentBundles(hashes: Record<string, string>): boolean {
    // Compatibilidad durante la transición desde workers anteriores que no responden al protocolo.
    return Array.from(document.querySelectorAll('script[src], link[rel="stylesheet"][href]'))
      .map(element => new URL(element.getAttribute('src') ?? element.getAttribute('href')!, document.baseURI))
      .filter(url => url.origin === window.location.origin && /\/(main|runtime|styles)\.[a-f0-9]+\.(js|css)$/.test(url.pathname))
      .some(url => !Object.hasOwn(hashes, url.pathname));
  }
}
