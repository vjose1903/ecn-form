const assert = require('node:assert/strict');
const {test} = require('node:test');
const {resolveAuditActor} = require('../lib/functions/audit/auditChanges.js');

test('la auditoría usa el UID autenticado y, en procesos administrativos, el actor registrado', () => {
  assert.equal(resolveAuditActor({authType: 'user', authId: 'auth-user'}, {created_by: 'spoofed'}, null), 'auth-user');
  assert.equal(resolveAuditActor({authType: 'service_account', authId: null}, null, {migration_actor_uid: 'migration-actor'}), 'migration-actor');
  assert.equal(resolveAuditActor({authType: 'service_account', authId: null}, {migration_actor_uid: 'migration-actor'}, null), 'migration-actor');
});
