const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {getFirestore} = require('firebase-admin/firestore');

const projectId = 'demo-ecn-platform-v2';
const databaseId = 'ecn-platform-v2';
const cityId = 'access_management_smoke_city';
const db = getFirestore(admin.initializeApp({projectId}), databaseId);

async function signUp(email) {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password: 'Password123!', returnSecureToken: true}),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return {uid: body.localId, token: body.idToken};
}

async function call(name, token, data) {
  const response = await fetch(`http://127.0.0.1:5001/${projectId}/us-east1/${name}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify({data: {cityId, ...data}}),
  });
  return {status: response.status, body: await response.json()};
}

(async () => {
  const {uid, token} = await signUp('city.admin@example.test');
  const adminPermissions = {
    members: {create: true, list: true, disable: true, assign_role: true},
    roles: {create: true, update: true},
    requests: {list: true, fields: {couple_basic: {read: true}}},
  };
  await db.doc(`city/${cityId}/members/${uid}`).set({uid, role_id: 'city_admin_test', status: 'active'});
  await db.doc(`city/${cityId}/roles/city_admin_test`).set({is_active: true, permissions: adminPermissions});

  const rolePermissions = {requests: {list: true, fields: {couple_basic: {read: true}}}};
  const savedRole = await call('saveCityRole', token, {name: 'Consulta básica', permissions: rolePermissions});
  assert.equal(savedRole.status, 200, JSON.stringify(savedRole.body));
  const roleId = savedRole.body.result?.roleId ?? savedRole.body.data?.roleId;
  assert.equal(roleId, 'consulta_basica');
  assert.deepEqual((await db.doc(`city/${cityId}/roles/${roleId}`).get()).get('permissions'), rolePermissions);

  const escalatedRole = await call('saveCityRole', token, {
    name: 'Acceso identidad',
    permissions: {requests: {fields: {identity: {read: true}}}},
  });
  assert.notEqual(escalatedRole.status, 200);
  assert.equal(escalatedRole.body.error?.status, 'PERMISSION_DENIED');

  const created = await call('createCityMember', token, {
    email: 'city.operator@example.test', displayName: 'Operador de prueba', phone: '8095550100', roleId,
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const member = created.body.result ?? created.body.data;
  const [authUser, profile, membership] = await Promise.all([
    admin.auth().getUser(member.uid),
    db.doc(`user/${member.uid}`).get(),
    db.doc(`city/${cityId}/members/${member.uid}`).get(),
  ]);
  assert.equal(authUser.email, 'city.operator@example.test');
  assert.equal(profile.get('primary_city_id'), cityId);
  assert.equal(membership.get('role_id'), roleId);
  assert.equal(membership.get('status'), 'active');

  const listed = await call('listCityMembers', token, {});
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  const members = (listed.body.result ?? listed.body.data).members;
  assert.ok(members.some(item => item.uid === member.uid && item.display_name === 'Operador de prueba'));

  const disabled = await call('updateCityMember', token, {uid: member.uid, status: 'disabled'});
  assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
  assert.equal((await admin.auth().getUser(member.uid)).disabled, true);
  assert.equal((await db.doc(`city/${cityId}/members/${member.uid}`).get()).get('status'), 'disabled');

  console.log('Roles limitan permisos por campo; administración crea, lista y desactiva miembros de la ciudad');
  await admin.app().delete();
})().catch(async error => {
  console.error(error);
  await admin.app().delete().catch(() => undefined);
  process.exitCode = 1;
});
