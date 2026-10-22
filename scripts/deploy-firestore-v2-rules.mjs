import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const projectId = 'ecn-platform';
const databaseId = 'ecn-platform-v2';
const releaseName = `projects/${projectId}/releases/cloud.firestore/${databaseId}`;
const projectNumber = execFileSync('gcloud', ['projects', 'describe', projectId, '--format=value(projectNumber)'], { encoding: 'utf8' }).trim();
const apiBase = 'https://firebaserules.googleapis.com/v1';
const applying = process.argv.includes('--apply');
const source = await readFile(new URL('../firestore.v2.rules', import.meta.url), 'utf8');
const token = execFileSync('gcloud', ['auth', 'print-access-token', `--project=${projectId}`], { encoding: 'utf8' }).trim();
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'x-goog-user-project': projectId,
};

const api = async (path, method = 'GET', body) => {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Firebase Rules API ${method} ${path} falló (${response.status}): ${text}`);
  }
  return text ? JSON.parse(text) : {};
};

const releasePath = `/${releaseName}`;
const currentRelease = await api(releasePath);

if (!applying) {
  console.log(JSON.stringify({
    mode: 'dry-run',
    database: databaseId,
    release: releaseName,
    previousRuleset: currentRelease?.rulesetName ?? null,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    action: currentRelease ? 'replace named-database release' : 'create named-database release',
  }, null, 2));
  process.exit(0);
}

const fingerprint = createHash('sha256').update(source).digest('base64');
const ruleset = await api(`/projects/${projectId}/rulesets`, 'POST', {
  source: {
    files: [{ name: 'firestore.v2.rules', content: source, fingerprint }],
  },
  attachment_point: `firestore.googleapis.com/projects/${projectNumber}/databases/${databaseId}`,
});

const releaseBody = { name: releaseName, rulesetName: ruleset.name };
if (currentRelease) {
  await api(releasePath, 'PATCH', { release: releaseBody });
} else {
  await api(`/projects/${projectId}/releases`, 'POST', releaseBody);
}

const deployed = await api(releasePath);
if (deployed?.rulesetName !== ruleset.name) {
  throw new Error(`La verificación del release falló: esperado ${ruleset.name}, recibido ${deployed?.rulesetName ?? 'ninguno'}`);
}

console.log(JSON.stringify({
  mode: 'deployed',
  database: databaseId,
  release: deployed.name,
  ruleset: deployed.rulesetName,
  sourceSha256: createHash('sha256').update(source).digest('hex'),
}, null, 2));
