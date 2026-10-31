const assert = require('node:assert/strict');
const {test} = require('node:test');
const {historyChanges, mergeHistoryPatch} = require('../lib/core/helpers/history-changes');
const {isValidPhone} = require('../lib/core/helpers/phone');

test('un parche parcial conserva campos omitidos y solo registra diferencias reales', () => {
  const previous = {full_name: 'Ana', nickname: 'Ani', contact: {email: 'ana@example.test', phone: '8092345678'}};
  const patch = {full_name: 'Ana María', contact: {phone: '8293456789'}};
  const merged = mergeHistoryPatch(previous, patch);
  assert.equal(merged.nickname, 'Ani');
  assert.equal(merged.contact.email, 'ana@example.test');
  assert.deepEqual(historyChanges(previous, merged, 'person').map(change => change.label), ['person.full_name', 'person.contact.phone']);
  assert.deepEqual(historyChanges(previous, mergeHistoryPatch(previous, {full_name: 'Ana'}), 'person'), []);
  assert.deepEqual(mergeHistoryPatch({family: ['uno', 'dos']}, {family: []}), {family: []});
  assert.deepEqual(mergeHistoryPatch({map: {a: 1}}, {map: {}}), {map: {}});
});

test('teléfonos del servidor rechazan patrones inválidos y aceptan números con máscara', () => {
  for (const phone of ['(809) 234-5678', '8293456789']) assert.equal(isValidPhone(phone), true);
  for (const phone of ['', '0000000000', '1234567890', '8091115678', '8092340000', '1092345678', '8091345678', 'abc']) assert.equal(isValidPhone(phone), false);
});

test('un reintento transaccional descarta diferencias del intento anterior', async () => {
  const Module = require('node:module');
  const originalLoad = Module._load;
  const attempts = [];
  const rootRef = {collection: () => ({doc: id => ({id})})};
  const db = {
    doc: () => rootRef,
    runTransaction: async callback => {
      let result;
      for (const name of ['Anterior', 'Nuevo']) {
        const events = [];
        result = await callback({
          get: async ref => ref === rootRef
            ? {exists: true, get: key => key === 'retreat_id' ? 'retiro' : false}
            : {data: () => ({she: {full_name: name, nickname: 'Conservado'}})},
          set: () => {},
          create: (_ref, event) => events.push(event),
        });
        attempts.push(events);
      }
      return result;
    },
  };
  Module._load = function(id, parent, ...args) {
    if (parent?.filename.endsWith('/requests/updateRequestDetails.js')) {
      if (id.endsWith('/firebase-admin')) return {v2Db: db};
      if (id.endsWith('/authorization')) return {requireCityPermission: async () => 'actor', hasCityFieldPermission: async () => true};
      if (id.endsWith('/actor-name')) return {getActorName: async () => 'Operador'};
    }
    return originalLoad.call(this, id, parent, ...args);
  };
  try {
    const {updateRequestDetails} = require('../lib/functions/requests/updateRequestDetails');
    const result = await updateRequestDetails.run({data: {cityId: 'ciudad', requestId: 'solicitud', patch: {she: {full_name: 'Nuevo'}}}, auth: {uid: 'actor', token: {}}});
    assert.equal(attempts[0].length, 1);
    assert.equal(attempts[1].length, 0);
    assert.deepEqual(result.updated, []);
  } finally {
    Module._load = originalLoad;
  }
});
