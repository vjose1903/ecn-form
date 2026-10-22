const assert = require('node:assert/strict');
const {test} = require('node:test');
const {
  createMigratedPaymentId,
  createMigratedRequestId,
  reconstructLegacyRequest,
  splitLegacyRequest,
} = require('../lib/migration/transform-request.js');

const request = {
  id: 'old-request-id',
  retreat: 'old-retreat-id',
  status: 'accepted',
  action: 'new',
  is_active: true,
  created_at: new Date('2026-10-22T17:00:00Z'),
  how_find_us: 'Parroquia',
  how_find_us_other: '',
  have_wedding_date: true,
  wedding_date: new Date('2027-02-01T00:00:00Z'),
  dating_period_year: 3,
  dating_period_month: 2,
  who_invited_you: 'Amigo',
  who_invited_you_phone: '8090000000',
  she: {
    full_name: 'María Teresa',
    nickname: 'Mari',
    email: 'she@example.test',
    identity_number: '12345678901',
    family_information: [{familiar_full_name: 'Familiar', familiar_relationship: 'Madre', familiar_phone: '8090000001'}],
    additional_source_field: 'preserved',
  },
  he: {
    full_name: 'Luis Hernández',
    address: 'Dirección',
  },
  pre_retreat_payments: [{
    id: 'old-payment-id',
    payment_date: new Date('2026-10-20T00:00:00Z'),
    amount: 4000,
    receipt_path: 'old/path/receipt.jpg',
    receipt_name: 'receipt.jpg',
  }],
};

test('genera IDs operativos legibles sin incluir nombres', () => {
  const id = createMigratedRequestId({
    retreatNumber: 84,
    createdAt: request.created_at,
    legacyId: 'old-request-id',
  });
  assert.match(id, /^sol_84_20261022_[a-f0-9]{8}$/);
  assert.equal(id.includes('maria'), false);
  assert.match(createMigratedPaymentId(request.pre_retreat_payments[0], 'old-payment-id', request.created_at), /^pago_20261020_4000_[a-f0-9]{8}$/);
});

test('divide una solicitud por grupos y conserva los datos y recibos de origen', () => {
  const {summary, details, payments} = splitLegacyRequest(request);
  assert.deepEqual(summary, {});
  assert.deepEqual(details.couple_basic, {
    she: {full_name: 'María Teresa', nickname: 'Mari'},
    he: {full_name: 'Luis Hernández'},
  });
  assert.equal(details.contact.she.email, 'she@example.test');
  assert.equal(details.identity.she.identity_number, '12345678901');
  assert.equal(details.family.she.family_information[0].familiar_full_name, 'Familiar');
  assert.equal(details.legacy_extra.she.additional_source_field, 'preserved');
  assert.equal(details.legacy_extra.id, request.id);
  assert.equal(details.legacy_extra.retreat, request.retreat);
  assert.deepEqual(payments[0].data, request.pre_retreat_payments[0]);
  assert.equal(payments[0].id.startsWith('pago_20261020_4000_'), true);

  assert.deepEqual(reconstructLegacyRequest({summary, details, payments}), request);
});

test('conserva la presencia de objetos de pareja y pagos vacíos', () => {
  const source = {she: {}, he: {}, pre_retreat_payments: []};
  const split = splitLegacyRequest(source);
  assert.deepEqual(reconstructLegacyRequest(split), source);
});
