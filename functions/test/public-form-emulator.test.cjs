const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {getFirestore} = require('firebase-admin/firestore');

const projectId = 'demo-ecn-platform-v2';
const databaseId = 'ecn-platform-v2';
const cityId = 'public_form_smoke_city';
const retreatId = '84_2030-10-30_2030-11-01';
const db = getFirestore(admin.initializeApp({projectId}), databaseId);
const call = async data => {
  const response = await fetch(`http://127.0.0.1:5001/${projectId}/us-east1/createPublicRequest`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({data}),
  });
  return {status: response.status, body: await response.json()};
};

(async () => {
  await db.doc(`city/${cityId}`).set({label: 'Ciudad de prueba'});
  await db.doc(`city/${cityId}/retreat/${retreatId}`).set({
    number: 84,
    is_active: true,
    accept_requests: true,
    max_request_date: '2030-10-20',
  });
  const payload = {
    she: {full_name: 'Novia de prueba', nickname: 'N', email: 'novia@example.test', cell_phone: '8095550101', identity_number: 'ID-101', extra_private_field: 'no debe guardarse'},
    he: {full_name: 'Novio de prueba', email: 'novio@example.test', cell_phone: '8095550102', identity_number: 'ID-102'},
    how_find_us: 'Prueba',
  };
  const created = await call({cityId, retreatId, payload});
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const requestId = created.body.result?.requestId ?? created.body.data?.requestId;
  assert.match(requestId, /^sol_84_\d{8}_[a-f0-9]{8}$/);
  const rootRef = db.doc(`city/${cityId}/requests/${requestId}`);
  const [root, basic, contact, identity, payments, history] = await Promise.all([
    rootRef.get(),
    rootRef.collection('details').doc('couple_basic').get(),
    rootRef.collection('details').doc('contact').get(),
    rootRef.collection('details').doc('identity').get(),
    rootRef.collection('details').doc('payments_summary').get(),
    rootRef.collection('history').get(),
  ]);
  assert.deepEqual(Object.keys(root.data()).sort(), ['created_at', 'created_by', 'is_archived', 'retreat_id'].sort());
  assert.equal(basic.get('she.full_name'), 'Novia de prueba');
  assert.equal(contact.get('she.email'), 'novia@example.test');
  assert.equal(identity.get('she.identity_number'), 'ID-101');
  assert.equal('extra_private_field' in basic.get('she'), false);
  assert.equal(payments.get('has_payments'), false);
  assert.equal(history.size, 1);

  const duplicate = await call({cityId, retreatId, payload});
  assert.notEqual(duplicate.status, 200);
  assert.match(String(duplicate.body.error?.message ?? duplicate.body.message), /Ya existe/);
  console.log('Flujo público crea solicitud segmentada, minimiza el documento raíz y rechaza duplicados');
  await admin.app().delete();
})().catch(async error => {
  console.error(error);
  await admin.app().delete().catch(() => undefined);
  process.exitCode = 1;
});
