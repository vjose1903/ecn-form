const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {getFirestore, Timestamp} = require('firebase-admin/firestore');

const projectId = 'demo-ecn-platform-v2';
const databaseId = 'ecn-platform-v2';
const cityId = 'request_confirmation_smoke_city';
const retreatId = '84_2030-10-30_2030-11-01';
const requestId = 'sol_84_20301022_confirm01';
const expiredRequestId = 'sol_84_20301022_confirm02';
const db = getFirestore(admin.initializeApp({projectId}), databaseId);

async function getIdToken() {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: 'confirm@example.test', password: 'Password123!', returnSecureToken: true}),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return {uid: body.localId, token: body.idToken};
}

async function call(token, id, values) {
  const response = await fetch(`http://127.0.0.1:5001/${projectId}/us-east1/updateRequestDetails`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify({data: {cityId, requestId: id, confirmInformation: true, patch: values}}),
  });
  return {status: response.status, body: await response.json()};
}

(async () => {
  const {uid, token} = await getIdToken();
  await db.doc(`city/${cityId}/members/${uid}`).set({uid, role_id: 'confirm_operator', status: 'active'});
  await db.doc(`city/${cityId}/roles/confirm_operator`).set({
    is_active: true,
    permissions: {requests: {list: true, update: true, fields: {couple_basic: {read: true, update: true}, contact: {read: true, update: true}}}},
  });
  await db.doc(`city/${cityId}/retreat/${retreatId}`).set({start_date: Timestamp.fromDate(new Date('2030-10-30T16:00:00.000Z'))});
  const root = db.doc(`city/${cityId}/requests/${requestId}`);
  await root.set({retreat_id: retreatId, is_archived: false});
  await root.collection('details').doc('couple_basic').set({she: {full_name: 'Nombre anterior'}, he: {full_name: 'Nombre anterior 2'}});
  await root.collection('details').doc('contact').set({she: {cell_phone: '8090000001'}, he: {cell_phone: '8090000002'}});

  const values = {she: {full_name: 'Nombre confirmado', cell_phone: '8091111111'}, he: {full_name: 'Otro confirmado', cell_phone: '8092222222'}};
  const confirmed = await call(token, requestId, values);
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal((await root.get()).get('isConfirmed'), true);
  assert.equal((await root.collection('details').doc('couple_basic').get()).get('she.full_name'), values.she.full_name);
  assert.equal((await root.collection('details').doc('contact').get()).get('he.cell_phone'), values.he.cell_phone);
  let history = await root.collection('history').get();
  assert.equal(history.size, 1, 'La confirmación debe quedar registrada en el trazo');
  assert.equal(history.docs[0].get('action'), 'information_confirmed');
  assert.equal(history.docs[0].get('actor_uid'), uid);
  assert.ok(history.docs[0].get('actor_name'));
  assert.ok(history.docs[0].get('happened_at'));

  const correctedValues = {...values, she: {...values.she, full_name: 'Nombre corregido'}};
  const corrected = await call(token, requestId, correctedValues);
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  history = await root.collection('history').get();
  assert.equal(history.size, 2, 'Cada corrección confirmada debe quedar en el trazo');
  assert.ok(history.docs.some(event => event.get('message') === 'Información confirmada nuevamente'));

  await db.doc(`city/${cityId}/retreat/expired_retreat`).set({start_date: Timestamp.fromDate(new Date('2020-10-30T16:00:00.000Z'))});
  const expiredRoot = db.doc(`city/${cityId}/requests/${expiredRequestId}`);
  await expiredRoot.set({retreat_id: 'expired_retreat', is_archived: false});
  await expiredRoot.collection('details').doc('couple_basic').set({she: {full_name: 'Sin cambiar'}, he: {full_name: 'Sin cambiar 2'}});
  await expiredRoot.collection('details').doc('contact').set({she: {cell_phone: '8093333333'}, he: {cell_phone: '8094444444'}});
  const expired = await call(token, expiredRequestId, values);
  assert.equal(expired.body.error?.status, 'FAILED_PRECONDITION', JSON.stringify(expired.body));
  assert.equal((await expiredRoot.get()).get('isConfirmed'), undefined);
  assert.equal((await expiredRoot.collection('details').doc('couple_basic').get()).get('she.full_name'), 'Sin cambiar');

  console.log('Confirmación de información actualiza datos e indicador sin activar el trigger de correo y rechaza confirmaciones fuera de plazo');
  await admin.app().delete();
})().catch(async error => {
  console.error(error);
  await admin.app().delete();
  process.exitCode = 1;
});
