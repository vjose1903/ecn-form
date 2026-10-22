const assert = require('node:assert/strict');
const {test} = require('node:test');
const {validateRolePermissions} = require('../lib/core/security/authorization.js');

test('valida acciones generales y permisos granulares por sección', () => {
  const permissions = validateRolePermissions({
    requests: {
      list: true,
      history_delete: true,
      fields: {
        couple_basic: {read: true, create: false, update: false},
        identity: {read: false, update: false},
      },
    },
    payments: {read: true, create: true},
  });
  assert.equal(permissions.requests.fields.couple_basic.read, true);
  assert.equal(permissions.requests.fields.identity.read, false);
  assert.equal(permissions.requests.history_delete, true);
  assert.equal(permissions.payments.create, true);
});

test('rechaza acciones y recursos no reconocidos para evitar permisos inventados', () => {
  assert.throws(() => validateRolePermissions({requests: {export: true}}), /no está permitida/);
  assert.throws(() => validateRolePermissions({unknown_resource: {read: true}}), /no está permitido/);
  assert.throws(() => validateRolePermissions({requests: {fields: {identity: {delete: true}}}}), /no es válida/);
});
