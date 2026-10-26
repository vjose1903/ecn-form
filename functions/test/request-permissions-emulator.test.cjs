const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const admin = require('firebase-admin');
const {getFirestore} = require('firebase-admin/firestore');

const projectId = 'demo-ecn-platform-v2';
const databaseId = 'ecn-platform-v2';
const cityId = 'request_permissions_smoke_city';
const requestId = 'sol_84_20301022_smoke001';
const retreatId = '84_2030-10-30_2030-11-01';
const db = getFirestore(admin.initializeApp({projectId}), databaseId);

async function getIdToken() {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: 'operator@example.test', password: 'Password123!', returnSecureToken: true}),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return {uid: body.localId, token: body.idToken};
}

async function callUpdate(token, city, patch) {
  const response = await fetch(`http://127.0.0.1:5001/${projectId}/us-east1/updateRequestDetails`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify({data: {cityId: city, requestId, patch}}),
  });
  return {status: response.status, body: await response.json()};
}

(async () => {
  const {uid, token} = await getIdToken();
  await db.doc(`city/${cityId}/members/${uid}`).set({uid, role_id: 'payment_operator', status: 'active'});
  await db.doc(`city/${cityId}/roles/payment_operator`).set({
    is_active: true,
    permissions: {requests: {update: true, fields: {contact: {update: true}, identity: {update: false}}}},
  });
  const root = db.doc(`city/${cityId}/requests/${requestId}`);
  await root.set({retreat_id: retreatId, is_archived: false});
  await root.collection('details').doc('contact').set({she: {email: 'old@example.test'}});
  await root.collection('details').doc('identity').set({she: {identity_number: 'ID-OLD'}});

  const allowed = await callUpdate(token, cityId, {she: {email: 'new@example.test'}});
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
  assert.equal((await root.collection('details').doc('contact').get()).get('she.email'), 'new@example.test');
  const identityLockId = createHash('sha256').update(`${retreatId}:email:new@example.test`).digest('hex');
  assert.equal((await db.doc(`city/${cityId}/request_identity_keys/${identityLockId}`).get()).get('request_id'), requestId);
  assert.equal((await root.collection('history').get()).size, 1);

  const deniedField = await callUpdate(token, cityId, {she: {identity_number: 'ID-NEW'}});
  assert.equal(deniedField.body.error?.status, 'PERMISSION_DENIED', JSON.stringify(deniedField.body));
  assert.equal((await root.collection('details').doc('identity').get()).get('she.identity_number'), 'ID-OLD');

  const deniedCity = await callUpdate(token, 'another_city', {she: {email: 'cross@example.test'}});
  assert.equal(deniedCity.body.error?.status, 'PERMISSION_DENIED', JSON.stringify(deniedCity.body));
  console.log('Callable de actualización aplica permisos por sección y limita el acceso a su ciudad');
  await admin.app().delete();
})().catch(async error => {
  console.error(error);
  await admin.app().delete().catch(() => undefined);
  process.exitCode = 1;
});
