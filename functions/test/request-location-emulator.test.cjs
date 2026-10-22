const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {getFirestore} = require('firebase-admin/firestore');

const projectId = 'demo-ecn-platform-v2';
const databaseId = 'ecn-platform-v2';
const cityId = 'request_location_smoke_city';
const sourceRetreatId = '84_2030-10-30_2030-11-01';
const targetRetreatId = '85_2030-11-06_2030-11-08';
const db = getFirestore(admin.initializeApp({projectId}), databaseId);

async function getIdToken() {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: 'retreat.operator@example.test', password: 'Password123!', returnSecureToken: true}),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return {uid: body.localId, token: body.idToken};
}

async function changeLocation(token, data) {
  const response = await fetch(`http://127.0.0.1:5001/${projectId}/us-east1/changeRequestLocation`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify({data: {cityId, ...data}}),
  });
  return {status: response.status, body: await response.json()};
}

async function countRequests(retreatId, archived) {
  const query = db.collection(`city/${cityId}/requests`)
    .where('retreat_id', '==', retreatId)
    .where('is_archived', '==', archived);
  return (await query.count().get()).data().count;
}

(async () => {
  const {uid, token} = await getIdToken();
  await db.doc(`city/${cityId}/members/${uid}`).set({uid, role_id: 'retreat_operator', status: 'active'});
  await db.doc(`city/${cityId}/roles/retreat_operator`).set({
    is_active: true,
    permissions: {
      requests: {
        archive: true,
        unarchive: true,
        transfer: true,
        fields: {status: {update: true}},
      },
    },
  });
  await Promise.all([
    db.doc(`city/${cityId}/retreat/${sourceRetreatId}`).set({number: 84}),
    db.doc(`city/${cityId}/retreat/${targetRetreatId}`).set({number: 85}),
  ]);

  const requestId = 'sol_84_20301022_a1b2c3d4';
  const root = db.doc(`city/${cityId}/requests/${requestId}`);
  await root.set({retreat_id: sourceRetreatId, is_archived: false});
  await root.collection('details').doc('couple_basic').set({she: {full_name: 'Novia de prueba'}});
  await root.collection('payments').doc('pago_20301022_4000_a1b2c3d4').set({amount: 4000});
  assert.equal(await countRequests(sourceRetreatId, false), 1);

  const archived = await changeLocation(token, {requestId, sourceRetreatId, action: 'archive'});
  assert.equal(archived.status, 200, JSON.stringify(archived.body));
  assert.equal((await root.get()).get('is_archived'), true);
  assert.equal(await countRequests(sourceRetreatId, false), 0);
  assert.equal(await countRequests(sourceRetreatId, true), 1);

  const movedArchived = await changeLocation(token, {
    requestId, sourceRetreatId, targetRetreatId, action: 'transfer', isArchived: true,
  });
  assert.equal(movedArchived.status, 200, JSON.stringify(movedArchived.body));
  assert.equal((await root.get()).get('retreat_id'), targetRetreatId);
  assert.equal(await countRequests(sourceRetreatId, true), 0);
  assert.equal(await countRequests(targetRetreatId, true), 1);

  const unarchived = await changeLocation(token, {
    requestId, sourceRetreatId: targetRetreatId, action: 'unarchive',
  });
  assert.equal(unarchived.status, 200, JSON.stringify(unarchived.body));
  assert.equal((await root.get()).get('is_archived'), false);
  assert.equal(await countRequests(targetRetreatId, false), 1);
  assert.equal((await root.collection('details').doc('couple_basic').get()).get('she.full_name'), 'Novia de prueba');
  assert.equal((await root.collection('payments').get()).size, 1);

  const activeRequestId = 'sol_84_20301023_b2c3d4e5';
  const activeRoot = db.doc(`city/${cityId}/requests/${activeRequestId}`);
  await activeRoot.set({retreat_id: sourceRetreatId, is_archived: false});
  const movedActive = await changeLocation(token, {
    requestId: activeRequestId, sourceRetreatId, targetRetreatId, action: 'transfer', isArchived: false,
  });
  assert.equal(movedActive.status, 200, JSON.stringify(movedActive.body));
  assert.equal((await activeRoot.get()).id, activeRequestId);
  assert.equal(await countRequests(sourceRetreatId, false), 0);
  assert.equal(await countRequests(targetRetreatId, false), 2);

  const actions = (await root.collection('history').get()).docs.map(doc => doc.get('action'));
  assert.deepEqual(actions.sort(), ['archived', 'desarchived', 'transferred'].sort());
  console.log('Archivar, desarchivar y transferir conservan el ID y actualizan los conteos de origen y destino');
  await admin.app().delete();
})().catch(async error => {
  console.error(error);
  await admin.app().delete().catch(() => undefined);
  process.exitCode = 1;
});
