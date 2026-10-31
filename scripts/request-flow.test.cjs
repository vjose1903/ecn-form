const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Run the actual methods without bootstrapping Angular or connecting to production.
function method(file, className, methodName, globals = {}) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(node => ts.isClassDeclaration(node) && node.name.text === className);
  const member = declaration.members.find(node => node.name?.getText(source) === methodName);
  const fn = ts.factory.createFunctionDeclaration(member.modifiers?.filter(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword), undefined, methodName, member.typeParameters, member.parameters, member.type, member.body);
  const printed = ts.createPrinter().printNode(ts.EmitHint.Unspecified, fn, source);
  const code = ts.transpileModule(printed, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  return vm.runInNewContext(`${code}\n${methodName}`, globals);
}
const servicePath = 'src/app/core/entities/request/request.service.ts';

function serviceContext() {
  const calls = [];
  const cache = [];
  const toast = {error() {}};
  const update = method(servicePath, 'RequestService', 'updateRequest', {
    RequestClass: class {}, httpsCallable: () => async payload => calls.push(payload), RequestAction: {UPDATED: 'updated'},
    Ss: {toastService: toast}, console: {error() {}},
  });
  return {calls, cache, update, context: {
    _requests: {value: []}, functions: {},
    areValuesDifferent: (left, right) => JSON.stringify(left) !== JSON.stringify(right),
    updateRequestInCache: result => cache.push(result),
  }};
}

test('editar un nombre conserva los demás campos y no reenvía al integrante sin cambios', async () => {
  const {calls, update, context} = serviceContext();
  const previous = {id: 'sol', she: {full_name: 'Ana', nickname: 'Ani', cell_phone: '8092345678', family_information: [{familiar_full_name: 'Madre'}]}, he: {full_name: 'Juan', cell_phone: '8293456789'}};
  const result = await update.call(context, {...previous, she: {...previous.she, full_name: 'Ana María'}}, {city_id: 'ciudad'}, {previousRequest: previous});
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].patch.she)), {full_name: 'Ana María'});
  assert.equal(calls[0].patch.he, undefined);
  assert.equal(result.she.nickname, 'Ani');
  assert.deepEqual(result.she.family_information, previous.she.family_information);
  assert.deepEqual(JSON.parse(JSON.stringify(result.he)), previous.he);
  await update.call(context, previous, {city_id: 'ciudad'}, {previousRequest: previous});
  assert.equal(calls.length, 1);
  const toggle = await update.call(context, {id: 'sol', is_informado: true}, {city_id: 'ciudad'}, {previousRequest: {...previous, status: 'accepted'}});
  assert.deepEqual(JSON.parse(JSON.stringify(toggle.she)), previous.she);
  assert.equal(toggle.status, 'accepted');
  assert.equal(calls[1].patch.she, undefined);
  assert.equal(calls[1].patch.status, undefined);
});

test('confirmar transmite la versión original que revisó el usuario', async () => {
  let sent;
  const confirm = method(servicePath, 'RequestService', 'confirmRequestInformation', {httpsCallable: () => async payload => {sent = payload;}});
  const request = {id: 'sol', she: {full_name: 'Ana', cell_phone: '8092345678', family_information: [{familiar_full_name: 'Madre'}]}, he: {full_name: 'Juan', cell_phone: '8293456789'}, asJson() {return {...this};}};
  await confirm.call({functions: {}, updateRequestInCache() {}}, request, {city_id: 'ciudad'}, {
    she: {...request.she, full_name: 'Ana María'}, he: {...request.he, emergency_phone: ''},
  });
  assert.equal(sent.expectedValues.she.full_name, 'Ana');
  assert.equal(sent.patch.she.full_name, 'Ana María');
  assert.equal(sent.expectedValues.he.emergency_phone, '');
  assert.deepEqual(sent.expectedValues.she.family_information, request.she.family_information);
});

test('un error de guardado libera el bloqueo y permite advertir al intentar salir', async () => {
  let saving = true;
  const submission = method('src/app/pages/form-page/form-page.ts', 'FormPage', 'processFormSubmission', {Ss: {toastService: {error() {}}}, console: {error() {}}});
  const context = {retreats: () => [{id: 'retiro'}], loading: {set: value => {saving = value;}}, isInModal: () => true,
    requestService: {updateRequest: async () => {throw new Error('network error');}}, request: {}, ref: {close: () => assert.fail('No debe cerrar tras error')}};
  await submission.call(context, {id: 'sol', retreat: 'retiro'});
  assert.equal(saving, false);
  let confirmation;
  let closed = false;
  const dialog = {close() {}};
  const source = ts.transpileModule(fs.readFileSync('src/app/core/typescript/protect-dialog-changes.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
  const exports = {};
  vm.runInNewContext(source, {exports, require: () => ({Ss: {dialogService: {getInstance: () => ({dialog})}, confirmationService: {confirm: config => {confirmation = config;}}}})});
  const ref = {close: () => {closed = true;}};
  const restore = exports.protectDialogChanges(ref, () => true, () => saving);
  dialog.close();
  assert.equal(confirmation.header, 'Cambios sin guardar');
  assert.equal(closed, false);
  confirmation.reject();
  ref.close();
  confirmation.accept();
  assert.equal(closed, true);
  restore();
  saving = true;
  await submission.call(context, {id: 'sol', retreat: 'inexistente'});
  assert.equal(saving, false);
});

test('la PWA conserva en caché su página de entrada para funcionar sin conexión', () => {
  const config = JSON.parse(fs.readFileSync('ngsw-config.json', 'utf8'));
  assert.ok(config.assetGroups.some(group => group.resources.files.includes(config.index)));
});

test('el servidor y el formulario aplican las mismas reglas de teléfono', () => {
  const {isValidPhone} = require('../functions/lib/core/helpers/phone');
  const file = 'src/app/core/typescript/validators/validate-phone.ts';
  const validator = {PHONE_LENGTH: 10, CLEAN_REGEX: /\D/g, SEQUENTIAL_VALUES: new Set(['0123456789', '1234567890', '9876543210'])};
  const globals = {PhoneValidator: validator};
  for (const name of ['isValid', 'isInvalidPattern', 'hasRepeatedDigits']) validator[name] = method(file, 'PhoneValidator', name, globals);
  for (const phone of ['(809) 234-5678', '8293456789', '', '0000000000', '1234567890', '8091115678', '8092340000', '1092345678', '8091345678', 'abc']) {
    assert.equal(isValidPhone(phone), validator.isValid(phone), phone);
  }
});
