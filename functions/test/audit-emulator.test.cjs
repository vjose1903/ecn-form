const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {getFirestore} = require('firebase-admin/firestore');

const projectId = 'demo-ecn-platform-v2';
const databaseId = 'ecn-platform-v2';
const cityId = 'audit_smoke_city';
const documentPath = `city/${cityId}`;
const db = getFirestore(admin.initializeApp({projectId}), databaseId);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForAudit(expectedCount) {
  const ref = db.collection(`city/${cityId}/audit_logs`);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const snapshot = await ref.get();
    if (snapshot.size >= expectedCount) return snapshot.docs.map(item => item.data());
    await delay(250);
  }
  throw new Error(`No llegaron ${expectedCount} eventos de auditoría en 30 segundos`);
}

async function waitForGlobalAudit(expectedCount) {
  const ref = db.collection('global_audit_logs');
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const snapshot = await ref.get();
    if (snapshot.size >= expectedCount) return snapshot.docs.map(item => item.data());
    await delay(250);
  }
  throw new Error(`No llegaron ${expectedCount} eventos globales de auditoría en 30 segundos`);
}

(async () => {
  const ref = db.doc(documentPath);
  await ref.set({name: 'Prueba', created_by: 'smoke-user'});
  const created = await waitForAudit(1);
  assert.equal(created[0].action, 'create');
  assert.equal(created[0].actor_uid, 'smoke-user');
  assert.equal(created[0].actor_type, 'user');
  assert.equal(created[0].resource_path, documentPath);
  assert.equal(created[0].changes.name.after, 'Prueba');

  const nestedRef = ref.collection('requests').doc('sol_84_20261022_a1b2c3d4');
  await nestedRef.set({name: 'Solicitud', created_by: 'smoke-user'});
  const nestedCreated = await waitForAudit(2);
  const nestedCreateEvent = nestedCreated.find(item => item.action === 'create' && item.resource_path === nestedRef.path);
  assert.ok(nestedCreateEvent);
  assert.equal(nestedCreateEvent.actor_uid, 'smoke-user');

  await nestedRef.update({name: 'Actualizada', updated_by: 'smoke-user'});
  const updated = await waitForAudit(3);
  const updateEvent = updated.find(item => item.action === 'update');
  assert.ok(updateEvent);
  assert.equal(updateEvent.actor_uid, 'smoke-user');
  assert.equal(updateEvent.resource_path, nestedRef.path);
  assert.equal(updateEvent.changes.name.before, 'Solicitud');
  assert.equal(updateEvent.changes.name.after, 'Actualizada');

  const userRef = db.doc('user/audit_smoke_user');
  await userRef.set({email: 'audit@example.test', migration_actor_uid: 'migration-agent'});
  const profileAudit = await waitForGlobalAudit(1);
  assert.equal(profileAudit[0].resource_path, userRef.path);
  assert.equal(typeof profileAudit[0].actor_uid, 'string');

  const tokenRef = userRef.collection('push_tokens').doc('web-token');
  await tokenRef.set({token: 'emulator-only'});
  await delay(750);
  const tokenAudit = await db.collection('global_audit_logs').get();
  assert.equal(tokenAudit.docs.some(item => item.get('resource_path') === tokenRef.path), false);

  const fileRef = db.doc('files/audit_smoke_file');
  await fileRef.set({name: 'emulator-only', migration_actor_uid: 'migration-agent'});
  const fileAudit = await waitForGlobalAudit(2);
  assert.equal(typeof fileAudit.find(item => item.resource_path === fileRef.path)?.actor_uid, 'string');
  console.log('6 eventos de auditoría de documentos de ciudad, usuario y archivos confirmados');
  await admin.app().delete();
})().catch(async error => {
  console.error(error);
  await admin.app().delete().catch(() => undefined);
  process.exitCode = 1;
});
