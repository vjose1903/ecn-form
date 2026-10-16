import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const commit = process.env.COMMIT_REF || process.env.HEAD || (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
})();
const commitShort = commit === 'local' ? commit : commit.slice(0, 7);
const builtAt = new Date().toISOString();
const label = `v${packageJson.version}`;
const version = { label, version: packageJson.version, commit: commitShort, builtAt };

await mkdir(new URL('../src/environments/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../src/environments/build-version.ts', import.meta.url),
  `export const buildVersion = ${JSON.stringify(version)} as const;\n`,
);
await writeFile(
  new URL('../public/version.json', import.meta.url),
  `${JSON.stringify(version, null, 2)}\n`,
);
