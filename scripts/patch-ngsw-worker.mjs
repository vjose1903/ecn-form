import { readFile, writeFile } from 'node:fs/promises';

const workerPath = new URL('../dist/ecn-form/ngsw-worker.js', import.meta.url);
let worker = await readFile(workerPath, 'utf8');

const replacements = [
  [
    `        this.idle.schedule("init post-load (update)", async () => {\n          await this.checkForUpdate();\n        });\n`,
    '',
  ],
  [
    `      if (event.request.mode === "navigate" && !this.scheduledNavUpdateCheck) {\n        this.scheduledNavUpdateCheck = true;\n        this.idle.schedule("check-updates-on-navigation", async () => {\n          this.scheduledNavUpdateCheck = false;\n          await this.checkForUpdate();\n        });\n      }\n`,
    '',
  ],
  [
    `          if (this.state === DriverReadyState.NORMAL && hash !== this.latestHash && appVersion.isNavigationRequest(event.request)) {\n            if (this.latestHash === null) {\n              throw new Error(\`Invariant violated (assignVersion): latestHash was null\`);\n            }\n            const client = await this.scope.clients.get(clientId);\n            if (client) {\n              await this.updateClient(client);\n            }\n            appVersion = this.lookupVersionByHash(this.latestHash, "assignVersion");\n          }\n`,
    '',
  ],
];

for (const [from, to] of replacements) {
  const occurrences = worker.split(from).length - 1;
  if (occurrences !== 1) {
    throw new Error(`No se encontró exactamente una sección esperada del service worker (${occurrences})`);
  }
  worker = worker.replace(from, to);
}

await writeFile(workerPath, worker);
