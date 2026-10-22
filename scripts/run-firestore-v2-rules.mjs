import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const emulator = spawn('firebase', [
  'emulators:start',
  '--config', 'firebase.v2-emulator.json',
  '--only', 'firestore',
  '--project', 'demo-ecn-platform-v2',
  '--non-interactive',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });

let emulatorOutput = '';
const capture = (chunk) => {
  const value = chunk.toString();
  emulatorOutput += value;
  process.stdout.write(value);
};
emulator.stdout.on('data', capture);
emulator.stderr.on('data', capture);

const stopEmulator = async () => {
  if (emulator.exitCode !== null) return;
  const exited = once(emulator, 'exit');
  try {
    process.kill(-emulator.pid, 'SIGINT');
  } catch {
    emulator.kill('SIGINT');
  }
  await Promise.race([exited, delay(10000)]);
  if (emulator.exitCode === null) {
    try {
      process.kill(-emulator.pid, 'SIGKILL');
    } catch {
      emulator.kill('SIGKILL');
    }
  }
};

try {
  const deadline = Date.now() + 60000;
  while (!emulatorOutput.includes('All emulators ready')) {
    if (emulator.exitCode !== null) throw new Error(`Firestore Emulator terminó con código ${emulator.exitCode}`);
    if (emulatorOutput.includes('default to allowing all reads and writes')) {
      throw new Error('El emulador inició sin reglas; se cancelan las pruebas por seguridad.');
    }
    if (Date.now() > deadline) throw new Error('Tiempo agotado esperando el emulador Firestore.');
    await delay(200);
  }

  const testRun = spawn(process.execPath, ['scripts/test-firestore-v2-rules.mjs'], { stdio: 'inherit' });
  const [code] = await once(testRun, 'exit');
  if (code !== 0) process.exitCode = code ?? 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await stopEmulator();
}
