import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

const projectId = 'demo-ecn-platform-v2';
const cityId = 'city-test';
const retreatId = '84_2026-10-30_2026-11-01';
const requestId = 'sol_84_20261022_k7f3n2';
const requestPath = `city/${cityId}/requests/${requestId}`;
let testEnv;

const role = (permissions) => ({
  is_active: true,
  permissions,
});

const initialize = async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8180,
      rules: await readFile(new URL('../firestore.v2.rules', import.meta.url), 'utf8'),
    },
  });
};

const seed = async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, `city/${cityId}/roles/reader`), role({
        requests: { read: true, list: true, fields: { couple_basic: { read: true } } },
      })),
      setDoc(doc(db, `city/${cityId}/roles/list-only`), role({
        requests: { list: true },
      })),
      setDoc(doc(db, `city/${cityId}/roles/home-assigner`), role({
        retreat_homes: { assign: true },
      })),
      setDoc(doc(db, `city/${cityId}/members/reader-uid`), {
        role_id: 'reader',
        status: 'active',
      }),
      setDoc(doc(db, 'user/reader-uid'), {uid: 'reader-uid', email: 'reader@example.test'}),
      setDoc(doc(db, 'user/other-uid'), {uid: 'other-uid', email: 'other@example.test'}),
      setDoc(doc(db, `city/${cityId}/members/list-only-uid`), {
        role_id: 'list-only',
        status: 'active',
      }),
      setDoc(doc(db, `city/${cityId}/members/home-assigner-uid`), {
        role_id: 'home-assigner',
        status: 'active',
      }),
      setDoc(doc(db, 'retreat_home/casa_compartida'), {name: 'Casa Compartida'}),
      setDoc(doc(db, `city/${cityId}/retreat/${retreatId}`), { number: 84 }),
      setDoc(doc(db, requestPath), {
        retreat_id: retreatId,
      }),
      setDoc(doc(db, `${requestPath}/details/couple_basic`), {
        she_name: 'Ana',
        he_name: 'Luis',
      }),
      setDoc(doc(db, `${requestPath}/details/contact_private`), {
        phone: '8090000000',
      }),
      setDoc(doc(db, `${requestPath}/payments/pago_existente`), {
        amount: 4000,
        payment_date: Timestamp.fromDate(new Date('2026-10-22T12:00:00Z')),
        created_at: Timestamp.fromDate(new Date('2026-10-22T12:00:00Z')),
        created_by: 'payments-uid',
      }),
      setDoc(doc(db, `city/${cityId}/audit_logs/aud_test`), { action: 'update' }),
      setDoc(doc(db, 'files/global-image'), {name: 'Casa', is_global: true}),
      setDoc(doc(db, 'city/other-city'), {label: 'Otra ciudad'}),
      setDoc(doc(db, `city/other-city/requests/${requestId}`), {retreat_id: retreatId}),
      setDoc(doc(db, `city/other-city/requests/${requestId}/details/couple_basic`), {she_name: 'Inés'}),
    ]);
  });
};

const cases = [];
const testCase = (name, run) => cases.push({ name, run });

testCase('permite listar solicitudes y leer solo los grupos de campos autorizados', async () => {
  await seed();
  const db = testEnv.authenticatedContext('reader-uid').firestore();
  assert.equal((await assertSucceeds(getDocs(collection(db, `city/${cityId}/requests`)))).size, 1);
  const summary = await assertSucceeds(getDoc(doc(db, requestPath)));
  assert.deepEqual(Object.keys(summary.data()).sort(), ['retreat_id']);
  await assertSucceeds(getDoc(doc(db, `${requestPath}/details/couple_basic`)));
  await assertFails(getDoc(doc(db, `${requestPath}/details/contact_private`)));
});

testCase('el permiso de listar no filtra datos personales desde el documento resumen', async () => {
  await seed();
  const db = testEnv.authenticatedContext('list-only-uid').firestore();
  const rows = await assertSucceeds(getDocs(collection(db, `city/${cityId}/requests`)));
  assert.equal(rows.size, 1);
  assert.deepEqual(Object.keys(rows.docs[0].data()).sort(), ['retreat_id']);
  await assertFails(getDoc(doc(db, `${requestPath}/details/couple_basic`)));
});

testCase('permite asignar una casa existente solo con el permiso correspondiente', async () => {
  await seed();
  const assignerDb = testEnv.authenticatedContext('home-assigner-uid').firestore();
  await assertSucceeds(setDoc(doc(assignerDb, `city/${cityId}/retreat_homes/casa_compartida`), {
    home_id: 'casa_compartida',
    is_active: true,
    created_by: 'home-assigner-uid',
    created_at: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(assignerDb, `city/${cityId}/retreat_homes/casa_inexistente`), {
    home_id: 'casa_inexistente',
    is_active: true,
    created_by: 'home-assigner-uid',
    created_at: serverTimestamp(),
  }));

  const readerDb = testEnv.authenticatedContext('reader-uid').firestore();
  await assertFails(setDoc(doc(readerDb, `city/${cityId}/retreat_homes/casa_inexistente`), {
    home_id: 'casa_inexistente',
    is_active: true,
    created_by: 'reader-uid',
    created_at: serverTimestamp(),
  }));
});

testCase('deniega acceso cruzado entre ciudades y escrituras fuera del rol', async () => {
  await seed();
  const db = testEnv.authenticatedContext('reader-uid').firestore();
  await assertFails(getDoc(doc(db, `city/other-city/requests/${requestId}`)));
  await assertFails(updateDoc(doc(db, requestPath), {
    status: 'rejected',
  }));
});

testCase('auditoría es de solo lectura para las cuentas de ciudad', async () => {
  await seed();
  const db = testEnv.authenticatedContext('reader-uid').firestore();
  await assertFails(getDoc(doc(db, `city/${cityId}/audit_logs/aud_test`)));
  await assertFails(setDoc(doc(db, `city/${cityId}/audit_logs/aud_forged`), { action: 'create' }));
});

testCase('el perfil y los tokens privados solo se pueden consultar desde la cuenta propia', async () => {
  await seed();
  const ownDb = testEnv.authenticatedContext('reader-uid').firestore();
  await assertSucceeds(getDoc(doc(ownDb, 'user/reader-uid')));
  await assertSucceeds(setDoc(doc(ownDb, 'user/reader-uid/push_tokens/browser'), {token: 'own-token'}));
  await assertFails(getDoc(doc(ownDb, 'user/other-uid')));
  await assertFails(getDoc(doc(ownDb, 'user/other-uid/push_tokens/browser')));
  await assertSucceeds(getDoc(doc(ownDb, 'files/global-image')));
});

testCase('superadmin lee las ciudades, pero los cambios administrativos pasan por callable', async () => {
  await seed();
  const db = testEnv.authenticatedContext('superadmin-uid', {super_admin: true}).firestore();
  await assertSucceeds(getDocs(collection(db, 'city')));
  await assertSucceeds(getDoc(doc(db, `city/other-city/requests/${requestId}`)));
  await assertSucceeds(getDoc(doc(db, `city/other-city/requests/${requestId}/details/couple_basic`)));
  await assertFails(updateDoc(doc(db, 'city/other-city'), {label: 'Ciudad cambiada'}));
  await assertFails(setDoc(doc(db, 'city/other-city/audit_logs/forged'), {action: 'create'}));
});

testCase('un permiso de pagos no otorga acceso a datos privados de la pareja', async () => {
  await seed();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, `city/${cityId}/roles/payments`), role({
        requests: { read: true, list: true, update: true },
        payments: { create: true, update: true, delete: true },
      })),
      setDoc(doc(db, `city/${cityId}/members/payments-uid`), {
        role_id: 'payments',
        status: 'active',
      }),
    ]);
  });

  const db = testEnv.authenticatedContext('payments-uid').firestore();
  const summary = await assertSucceeds(getDoc(doc(db, requestPath)));
  assert.deepEqual(Object.keys(summary.data()).sort(), ['retreat_id']);
  await assertFails(setDoc(doc(db, `${requestPath}/payments/pago_20261022_4000_a1b2c3`), {
    amount: 4000,
    payment_date: Timestamp.fromDate(new Date('2026-10-22T12:00:00Z')),
    created_at: serverTimestamp(),
    created_by: 'payments-uid',
  }));
  await assertFails(setDoc(doc(db, `city/${cityId}/requests/missing-request/payments/pago_20261022_4000_d4e5f6`), {
    amount: 4000,
    payment_date: Timestamp.fromDate(new Date('2026-10-22T12:00:00Z')),
    created_at: serverTimestamp(),
    created_by: 'payments-uid',
  }));
  const paymentRef = doc(db, `${requestPath}/payments/pago_existente`);
  await assertFails(updateDoc(doc(db, requestPath), {is_archived: true}));
  await assertFails(updateDoc(paymentRef, {amount: 1}));
  await assertFails(deleteDoc(paymentRef));
  await assertFails(getDoc(doc(db, `${requestPath}/details/contact_private`)));
  await assertFails(updateDoc(doc(db, requestPath), {
    status: 'rejected',
  }));
});

try {
  await initialize();
  let failures = 0;
  for (const { name, run } of cases) {
    try {
      await run();
      console.log(`✓ ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${name}`, error);
    }
  }
  console.log(`${cases.length - failures}/${cases.length} pruebas de reglas pasaron`);
  if (failures) process.exitCode = 1;
} finally {
  await testEnv?.cleanup();
}
