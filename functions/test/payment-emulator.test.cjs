const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {getFirestore} = require('firebase-admin/firestore');

const projectId = 'demo-ecn-platform-v2';
const databaseId = 'ecn-platform-v2';
const cityId = 'payment_smoke_city';
const retreatId = '84_2030-10-30_2030-11-01';
const requestId = 'sol_84_20301022_a1b2c3d4';
const paymentId = 'pago_20301022_4000_a1b2c3d4';
const receiptPath = `receipts/${cityId}/${retreatId}/${requestId}/${paymentId}/receipt.jpg`;
const db = getFirestore(admin.initializeApp({projectId}), databaseId);

async function getIdToken() {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: 'payment.operator@example.test', password: 'Password123!', returnSecureToken: true}),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return {uid: body.localId, token: body.idToken};
}

async function record(token) {
  const response = await fetch(`http://127.0.0.1:5001/${projectId}/us-east1/recordPayment`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify({data: {
      cityId, requestId, paymentId, receiptPath, receiptName: 'recibo.jpg', amount: 4000, paymentDate: new Date(Date.now() - 60_000).toISOString(),
    }}),
  });
  return {status: response.status, body: await response.json()};
}

(async () => {
  const {uid, token} = await getIdToken();
  await db.doc(`city/${cityId}/members/${uid}`).set({uid, role_id: 'payment_operator', status: 'active'});
  await db.doc(`city/${cityId}/roles/payment_operator`).set({is_active: true, permissions: {payments: {create: true}}});
  const request = db.doc(`city/${cityId}/requests/${requestId}`);
  await request.set({retreat_id: retreatId, is_archived: false});
  const bucket = admin.storage().bucket('ecn-platform.firebasestorage.app');
  await bucket.file(receiptPath).save(Buffer.from('emulator receipt bytes'), {metadata: {contentType: 'image/jpeg'}});

  const created = await record(token);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const [payment, summary, history] = await Promise.all([
    request.collection('payments').doc(paymentId).get(),
    request.collection('details').doc('payments_summary').get(),
    request.collection('history').get(),
  ]);
  assert.equal(payment.get('amount'), 4000);
  assert.equal(payment.get('receipt_path'), receiptPath);
  assert.equal(summary.get('payments_count'), 1);
  assert.equal(summary.get('total_paid'), 4000);
  assert.equal(summary.get('has_payments'), true);
  assert.equal(history.size, 1);
  assert.equal(history.docs[0].get('actor_uid'), uid);

  const duplicate = await record(token);
  assert.equal(duplicate.body.error?.status, 'ALREADY_EXISTS');
  assert.equal((await request.collection('payments').get()).size, 1);
  console.log('Registrar pago conserva recibo, resumen e historial y evita duplicados');
  await admin.app().delete();
})().catch(async error => {
  console.error(error);
  await admin.app().delete().catch(() => undefined);
  process.exitCode = 1;
});
