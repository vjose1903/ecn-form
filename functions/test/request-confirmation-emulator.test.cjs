const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {getFirestore, Timestamp} = require('firebase-admin/firestore');

const projectId = 'demo-ecn-platform-v2';
const databaseId = 'ecn-platform-v2';
const cityId = 'request_confirmation_smoke_city';
const retreatId = '84_2030-10-30_2030-11-01';
const requestId = 'sol_84_20301022_confirm01';
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

async function expectedValues(id, values) {
  const root = db.doc(`city/${cityId}/requests/${id}`);
  const sections = await Promise.all(['couple_basic', 'contact', 'family'].map(group => root.collection('details').doc(group).get()));
  return Object.fromEntries(['she', 'he'].map(person => {
    const current = Object.assign({}, ...sections.map(section => section.get(person) ?? {}));
    return [person, Object.fromEntries(Object.keys(values[person]).map(field => [field, current[field] ?? (field === 'family_information' ? [] : '')]))];
  }));
}

async function call(token, id, values, expected) {
  expected ??= await expectedValues(id, values);
  const response = await fetch(`http://127.0.0.1:5001/${projectId}/us-east1/updateRequestDetails`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify({data: {cityId, requestId: id, confirmInformation: true, patch: values, expectedValues: expected}}),
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
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  const relativeDate = days => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return Timestamp.fromDate(date);
  };
  const retreatRef = db.doc(`city/${cityId}/retreat/${retreatId}`);
  await retreatRef.set({start_date: relativeDate(-2), end_date: relativeDate(0)});
  await db.doc(`user/${uid}`).set({display_name: 'Operador de prueba'});
  const root = db.doc(`city/${cityId}/requests/${requestId}`);
  await root.set({retreat_id: retreatId, is_archived: false});
  await root.collection('details').doc('couple_basic').set({she: {full_name: 'Nombre anterior', nickname: 'Apodo conservado'}, he: {full_name: 'Nombre anterior 2'}});
  await root.collection('details').doc('contact').set({she: {cell_phone: '8092345678', email: 'conservar@example.test'}, he: {cell_phone: '8293456789'}});

  const values = {she: {full_name: 'Nombre confirmado', cell_phone: '8093456789'}, he: {full_name: 'Otro confirmado', cell_phone: '8294567892'}};
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
  assert.equal(history.docs[0].get('actor_name'), 'Operador de prueba');
  assert.deepEqual(history.docs[0].get('changes').map(change => change.label).sort(), ['contact.he.cell_phone', 'contact.she.cell_phone', 'couple_basic.he.full_name', 'couple_basic.she.full_name']);
  assert.equal((await root.collection('details').doc('couple_basic').get()).get('she.nickname'), 'Apodo conservado');
  assert.equal((await root.collection('details').doc('contact').get()).get('she.email'), 'conservar@example.test');

  const correctedValues = {...values, she: {...values.she, full_name: 'Nombre corregido'}};
  const corrected = await call(token, requestId, correctedValues);
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  history = await root.collection('history').get();
  assert.equal(history.size, 2, 'Cada corrección confirmada debe quedar en el trazo');
  assert.ok(history.docs.some(event => event.get('message') === 'Información confirmada nuevamente'));

  const noChange = await call(token, requestId, correctedValues);
  assert.equal(noChange.status, 200, JSON.stringify(noChange.body));
  history = await root.collection('history').orderBy('happened_at', 'desc').get();
  assert.deepEqual(history.docs[0].get('changes'), []);

  await db.doc(`city/${cityId}/roles/confirm_operator`).update({'permissions.requests.fields.family': {read: true, update: true}});
  const mother = {familiar_full_name: 'Ana Perez', familiar_relationship: 'Madre', familiar_phone: '8095678923'};
  const father = {familiar_full_name: 'Juan delgado', familiar_relationship: 'Padre', familiar_phone: '8296789234'};
  await root.collection('details').doc('family').set({she: {family_information: [mother, father], have_children: true}});
  const familyValues = {...correctedValues, she: {...correctedValues.she, family_information: [mother, {...father, familiar_full_name: 'Juan Delgado'}]}};
  const familySaved = await call(token, requestId, familyValues);
  assert.equal(familySaved.status, 200, JSON.stringify(familySaved.body));
  history = await root.collection('history').orderBy('happened_at', 'desc').get();
  assert.equal(history.docs[0].get('changes').length, 1);
  assert.equal(history.docs[0].get('changes')[0].label, 'family.she.family_information');
  assert.equal((await root.collection('details').doc('family').get()).get('she.have_children'), true);

  const stale = await expectedValues(requestId, familyValues);
  const newestFamily = [mother, {...father, familiar_full_name: 'Juan Delgado actualizado'}];
  await root.collection('details').doc('family').update({'she.family_information': newestFamily});
  const countBefore = (await root.collection('history').get()).size;
  const conflict = await call(token, requestId, familyValues, stale);
  assert.equal(conflict.body.error?.status, 'ABORTED', JSON.stringify(conflict.body));
  assert.deepEqual((await root.collection('details').doc('family').get()).get('she.family_information'), newestFamily);
  assert.equal((await root.collection('history').get()).size, countBefore);

  for (const phone of ['0000000000', '1234567890', '8091115678', '8092340000', 'abc']) {
    const invalid = await call(token, requestId, {...correctedValues, she: {...correctedValues.she, cell_phone: phone}});
    assert.equal(invalid.body.error?.status, 'INVALID_ARGUMENT', JSON.stringify(invalid.body));
    const invalidFamily = await call(token, requestId, {...correctedValues, she: {...correctedValues.she, family_information: [{...mother, familiar_phone: phone}]}});
    assert.equal(invalidFamily.body.error?.status, 'INVALID_ARGUMENT', JSON.stringify(invalidFamily.body));
  }
  await db.doc(`city/${cityId}/roles/confirm_operator`).update({'permissions.requests.fields.family.update': false});
  const forbidden = await call(token, requestId, familyValues);
  assert.equal(forbidden.body.error?.status, 'PERMISSION_DENIED', JSON.stringify(forbidden.body));

  for (const [start, end, allowed] of [[1, 2, false], [-10, -8, false], [-10, -7, true], [0, 0, true]]) {
    await retreatRef.set({start_date: relativeDate(start), end_date: relativeDate(end)});
    const result = await call(token, requestId, correctedValues);
    assert.equal(result.status === 200, allowed, JSON.stringify(result.body));
    if (!allowed) assert.equal(result.body.error?.status, 'FAILED_PRECONDITION');
  }
  await retreatRef.set({start_date: relativeDate(0)});
  const missingEnd = await call(token, requestId, correctedValues);
  assert.equal(missingEnd.body.error?.status, 'FAILED_PRECONDITION');
  await retreatRef.set({start_date: relativeDate(0), end_date: relativeDate(0)});
  await root.update({is_archived: true});
  const archived = await call(token, requestId, correctedValues);
  assert.equal(archived.body.error?.status, 'FAILED_PRECONDITION');

  console.log('Confirmación: persistencia, historial exacto, nombres, familiares, conflictos, teléfonos, permisos y límites de fechas verificados');
  await admin.app().delete();
})().catch(async error => {
  console.error(error);
  await admin.app().delete();
  process.exitCode = 1;
});
