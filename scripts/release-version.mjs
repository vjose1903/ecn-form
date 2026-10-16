import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const root = new URL('../', import.meta.url);
const packagePath = new URL('../package.json', import.meta.url);
const lockPath = new URL('../package-lock.json', import.meta.url);

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

function runGit(...args) {
  execFileSync('git', args, { cwd: root, stdio: 'inherit' });
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`La versión actual no tiene el formato X.Y.Z: ${version}`);
  }
  return match.slice(1).map(Number);
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const branch = git('branch', '--show-current');
if (!['dev', 'main'].includes(branch)) {
  throw new Error(`La rama actual es "${branch}". El script solo trabaja en "dev" o "main".`);
}

const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
const [major, minor, patch] = parseVersion(packageJson.version);
const currentVersion = `${major}.${minor}.${patch}`;
const rl = readline.createInterface({ input, output });

try {
  console.log('\n¿Qué número deseas actualizar?\n');
  console.log(`1. mayor   = cambio grande o incompatible (${currentVersion} → ${major + 1}.0.0)`);
  console.log(`2. versión = nueva funcionalidad compatible (${currentVersion} → ${major}.${minor + 1}.0)`);
  console.log(`3. parche  = corrección o ajuste pequeño (${currentVersion} → ${major}.${minor}.${patch + 1})`);
  console.log(`\nVersión actual: v${currentVersion}\n`);

  let option;
  while (!['1', '2', '3'].includes(option)) {
    option = (await rl.question('Elige 1, 2 o 3: ')).trim();
  }

  const nextVersion = option === '1'
    ? `${major + 1}.0.0`
    : option === '2'
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;
  const versionLabel = `v${nextVersion}`;
  const description = (await rl.question(`\nNueva versión: ${versionLabel}\n\n¿Qué incluye la actualización? `)).trim();

  if (!description) {
    throw new Error('La descripción de la actualización no puede estar vacía.');
  }

  packageJson.version = nextVersion;
  await writeFile(packagePath, formatJson(packageJson));

  const lockJson = JSON.parse(await readFile(lockPath, 'utf8'));
  lockJson.version = nextVersion;
  if (lockJson.packages?.['']) {
    lockJson.packages[''].version = nextVersion;
  }
  await writeFile(lockPath, formatJson(lockJson));

  const subject = `PROXIMA ACTUALIZACION ${versionLabel}`;
  runGit('add', '-A');
  runGit('commit', '-m', subject, '-m', description);

  if (branch === 'main') {
    runGit('push', 'origin', 'main');
    console.log(`\nPublicado ${versionLabel} en main.`);
  } else {
    runGit('push', 'origin', 'dev');
    runGit('checkout', 'main');
    runGit('pull', '--ff-only', 'origin', 'main');
    runGit('merge', '--no-ff', 'dev', '-m', subject, '-m', description);
    runGit('push', 'origin', 'main');
    console.log(`\nPublicado ${versionLabel} en main mediante merge desde dev.`);
  }
} finally {
  rl.close();
}
