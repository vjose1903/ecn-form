const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { Storage } = require('@google-cloud/storage');
const {
  createMigratedRequestId,
  reconstructLegacyRequest,
  splitLegacyRequest,
} = require('../lib/migration/transform-request');

const projectId = 'ecn-platform';
const databaseId = 'ecn-platform-v2';
const mode = process.argv.includes('--apply') ? 'apply' : 'plan';
const legacyRoot = process.argv.find(value => value.startsWith('--legacy-user='))?.slice('--legacy-user='.length);
const authUid = process.argv.find(value => value.startsWith('--superadmin-uid='))?.slice('--superadmin-uid='.length);
const backupPrefix = process.argv.find(value => value.startsWith('--backup='))?.slice('--backup='.length);
const exportOperation = process.argv.find(value => value.startsWith('--export-operation='))?.slice('--export-operation='.length);
const auditActorUid = process.argv.find(value => value.startsWith('--actor-uid='))?.slice('--actor-uid='.length);
const verifyBackupOnly = process.argv.includes('--verify-backup');

if (!admin.apps.length) admin.initializeApp({ projectId });
const sourceDb = getFirestore(admin.app(), '(default)');
const targetDb = getFirestore(admin.app(), databaseId);
const storage = new Storage();

const slug = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');
const isoDate = value => {
  const date = value?.toDate instanceof Function ? value.toDate() : value instanceof Date ? value : new Date(value);
  assert.ok(Number.isFinite(date.getTime()), 'Fecha ausente o inválida para formar un ID');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const deterministicSuffix = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
const isReference = value => value && typeof value === 'object' && typeof value.path === 'string'
  && value.firestore && typeof value.get === 'function';
const canonical = value => {
  if (isReference(value)) return { reference: value.path };
  if (value && typeof value.toDate === 'function') return { timestamp: value.toDate().toISOString() };
  if (value instanceof Date) return { timestamp: value.toISOString() };
  if (Array.isArray(value)) return value.map(canonical);
  if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
};
const refPaths = (value, output = []) => {
  if (isReference(value)) output.push(value.path);
  else if (Array.isArray(value)) value.forEach(item => refPaths(item, output));
  else if (value && Object.getPrototypeOf(value) === Object.prototype) Object.values(value).forEach(item => refPaths(item, output));
  return output;
};

const legacyCollections = async docRef => {
  const result = [];
  for (const collectionRef of await docRef.listCollections()) {
    const snapshot = await collectionRef.get();
    result.push({ name: collectionRef.id, refs: collectionRef, docs: snapshot.docs });
  }
  return result;
};

const verifyBackup = async expectedDocumentCount => {
  assert.ok(backupPrefix?.startsWith('gs://'), 'El prefijo del respaldo debe ser gs://');
  assert.ok(exportOperation, 'Falta --export-operation para verificar el respaldo de Firestore');
  const operation = JSON.parse(execFileSync('gcloud', [
    'firestore', 'operations', 'describe', exportOperation,
    `--project=${projectId}`, '--format=json',
  ], { encoding: 'utf8' }));
  assert.equal(operation.done, true, 'La exportación de Firestore todavía no termina');
  assert.equal(operation.metadata?.operationState, 'SUCCESSFUL', 'La exportación de Firestore no terminó correctamente');
  assert.equal(Number(operation.metadata?.progressDocuments?.completedWork), expectedDocumentCount, 'El respaldo de Firestore no tiene el total actual de documentos de origen');

  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(backupPrefix);
  assert.ok(match, 'Prefijo de respaldo GCS no válido');
  const [, bucketName, objectPrefix] = match;
  const backupBucket = storage.bucket(bucketName);
  const [metadataExists] = await backupBucket.file(`${objectPrefix}/firestore/firestore.overall_export_metadata`).exists();
  assert.ok(metadataExists, 'Falta el manifiesto global de la exportación Firestore');

  const sourceBucket = storage.bucket('ecn-platform.firebasestorage.app');
  const [sourceObjects] = await sourceBucket.getFiles({ autoPaginate: true });
  const [backupObjects] = await backupBucket.getFiles({ prefix: `${objectPrefix}/storage/`, autoPaginate: true });
  const sourceFiles = sourceObjects.filter(file => !file.name.endsWith('/'));
  const backupFiles = backupObjects.filter(file => !file.name.endsWith('/'));
  const backupByName = new Map(backupFiles.map(file => [file.name.slice(`${objectPrefix}/storage/`.length), file]));
  assert.equal(backupByName.size, sourceFiles.length, 'El respaldo de Storage tiene una cantidad distinta de objetos');
  for (const sourceFile of sourceFiles) {
    const copy = backupByName.get(sourceFile.name);
    assert.ok(copy, `El respaldo de Storage no contiene ${sourceFile.name}`);
    const [[sourceMeta], [backupMeta]] = await Promise.all([sourceFile.getMetadata(), copy.getMetadata()]);
    assert.equal(sourceMeta.size, backupMeta.size, `Tamaño distinto en el respaldo de ${sourceFile.name}`);
    assert.equal(sourceMeta.md5Hash, backupMeta.md5Hash, `Hash distinto en el respaldo de ${sourceFile.name}`);
  }
  return { exportOperation, firestoreDocuments: expectedDocumentCount, storageObjects: sourceFiles.length };
};

const writeChunks = async writes => {
  for (let offset = 0; offset < writes.length; offset += 400) {
    const batch = targetDb.batch();
    for (const write of writes.slice(offset, offset + 400)) batch.set(targetDb.doc(write.path), write.data);
    await batch.commit();
  }
};

const waitForMigrationAudit = async (expectedCounts, timeoutMs = 600000) => {
  const expectedTotal = [...expectedCounts.values()].reduce((sum, count) => sum + count, 0);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [cityLogs, globalLogs] = await Promise.all([
      targetDb.collectionGroup('audit_logs').get(),
      targetDb.collection('global_audit_logs').get(),
    ]);
    const logs = [...cityLogs.docs, ...globalLogs.docs];
    const matching = logs.filter(doc => expectedCounts.has(doc.get('resource_path')));
    const actualCounts = new Map();
    for (const log of matching) {
      const resourcePath = log.get('resource_path');
      actualCounts.set(resourcePath, (actualCounts.get(resourcePath) || 0) + 1);
    }
    if ([...expectedCounts].every(([path, count]) => (actualCounts.get(path) || 0) >= count)) {
      for (const log of matching) assert.ok(log.get('actor_uid'), `La auditoría de ${log.get('resource_path')} no tiene actor`);
      assert.equal(matching.length, expectedTotal, 'La auditoría duplicó eventos de migración');
      return matching.length;
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error(`La auditoría no registró todos los cambios de migración (${expectedTotal} eventos esperados)`);
};

const main = async () => {
  if (mode === 'apply') {
    assert.ok(legacyRoot, 'Falta --legacy-user');
    assert.ok(authUid, 'Falta --superadmin-uid');
    assert.ok(auditActorUid, 'Falta --actor-uid');
    assert.ok(backupPrefix, 'Falta --backup con el respaldo verificado');
  }

  const cityDocs = (await sourceDb.collection('city').get()).docs;
  const homeDocs = (await sourceDb.collection('retreat_home').get()).docs;
  const fileDocs = (await sourceDb.collection('files').get()).docs;
  const users = (await sourceDb.collection('user').get()).docs
    .filter(doc => !legacyRoot || doc.id === legacyRoot);
  assert.ok(users.length, 'No se encontró el usuario legacy solicitado');
  const rootCollections = await sourceDb.listCollections();
  const unexpectedRootCollections = rootCollections.map(collection => collection.id).filter(id => !['city', 'files', 'retreat_home', 'user'].includes(id));
  assert.equal(unexpectedRootCollections.length, 0, `Hay colecciones raíz no contempladas: ${unexpectedRootCollections.join(', ')}`);

  const writes = [];
  const pathMap = new Map();
  const cityIdMap = new Map();
  const homeIdMap = new Map();
  const userIdMap = new Map();
  const retreatIdMap = new Map();
  const requestIdMap = new Map();
  const paymentIdMap = new Map();
  const receiptPathMap = new Map();
  const receiptCopies = [];
  const missingReferences = new Set();
  const sourceInventory = { cities: cityDocs.length, homes: homeDocs.length, files: fileDocs.length, users: users.length, retreats: 0, activeRequests: 0, archivedRequests: 0, payments: 0, history: 0, pushTokens: 0, allDocuments: 0, otherSubcollections: [] };

  const allowedNestedPaths = path => /^(user\/[^/]+\/(retreat|requests-archived|requests-history|push_token|files)|user\/[^/]+\/retreat\/[^/]+\/request)$/.test(path);
  const inspectDescendants = async documentRef => {
    for (const collectionRef of await documentRef.listCollections()) {
      if (!allowedNestedPaths(collectionRef.path)) sourceInventory.otherSubcollections.push(collectionRef.path);
      const snapshot = await collectionRef.get();
      sourceInventory.allDocuments += snapshot.size;
      for (const child of snapshot.docs) await inspectDescendants(child.ref);
    }
  };
  sourceInventory.allDocuments = cityDocs.length + homeDocs.length + fileDocs.length + users.length;
  for (const rootDoc of [...cityDocs, ...homeDocs, ...fileDocs, ...users]) await inspectDescendants(rootDoc.ref);

  for (const doc of cityDocs) {
    let id = slug(doc.get('label'));
    assert.ok(id, `La ciudad ${doc.id} no tiene nombre para crear su ID`);
    if ([...cityIdMap.values()].includes(id)) id = `${id}_${deterministicSuffix(doc.id).slice(0, 4)}`;
    cityIdMap.set(doc.id, id);
    pathMap.set(doc.ref.path, `city/${id}`);
  }
  for (const doc of homeDocs) {
    let id = slug(doc.get('name'));
    assert.ok(id, `La casa ${doc.id} no tiene nombre para crear su ID`);
    if ([...homeIdMap.values()].includes(id)) id = `${id}_${deterministicSuffix(doc.id).slice(0, 4)}`;
    homeIdMap.set(doc.id, id);
    pathMap.set(doc.ref.path, `retreat_home/${id}`);
  }
  for (const doc of fileDocs) pathMap.set(doc.ref.path, `files/${doc.id}`);

  const userContexts = [];
  const firstHistoryAt = new Map();
  for (const userDoc of users) {
    const uid = userDoc.get('uid');
    assert.ok(typeof uid === 'string' && uid, `El usuario ${userDoc.id} no tiene UID de Firebase Auth`);
    userIdMap.set(userDoc.id, uid);
    pathMap.set(userDoc.ref.path, `user/${uid}`);
    const collections = await legacyCollections(userDoc.ref);
    const allowed = new Set(['retreat', 'requests-archived', 'requests-history', 'push_token', 'files']);
    for (const collection of collections) if (!allowed.has(collection.name)) sourceInventory.otherSubcollections.push(`${userDoc.id}/${collection.name}:${collection.docs.length}`);
    const context = { userDoc, uid, collections: Object.fromEntries(collections.map(item => [item.name, item])) };
    userContexts.push(context);

    const retreats = context.collections.retreat?.docs ?? [];
    sourceInventory.retreats += retreats.length;
    for (const retreatDoc of retreats) {
      const data = retreatDoc.data();
      const id = `${data.number}_${isoDate(data.start_date)}_${isoDate(data.end_date)}`;
      const cityId = cityIdMap.get(userDoc.get('city')?.id);
      assert.ok(cityId, `No se pudo asignar ciudad a retiro ${retreatDoc.id}`);
      const targetPath = `city/${cityId}/retreat/${id}`;
      retreatIdMap.set(retreatDoc.id, id);
      pathMap.set(retreatDoc.ref.path, targetPath);
      for (const requestDoc of (await retreatDoc.ref.collection('request').get()).docs) {
        sourceInventory.activeRequests += 1;
        sourceInventory.payments += (requestDoc.get('pre_retreat_payments') || []).length;
        pathMap.set(requestDoc.ref.path, `${cityId}/requests/${requestDoc.id}`);
      }
    }
    for (const archivedDoc of context.collections['requests-archived']?.docs ?? []) {
      sourceInventory.archivedRequests += 1;
      sourceInventory.payments += (archivedDoc.get('pre_retreat_payments') || []).length;
      const data = archivedDoc.data();
      const oldRetreatId = data.archived_retreat_id || data.retreat;
      const targetRetreatId = retreatIdMap.get(oldRetreatId);
      assert.ok(targetRetreatId, `No se encontró el retiro asociado a solicitud archivada ${archivedDoc.id}`);
      pathMap.set(archivedDoc.ref.path, `requests/${archivedDoc.id}`);
    }
    sourceInventory.history += context.collections['requests-history']?.docs.length ?? 0;
    sourceInventory.pushTokens += context.collections.push_token?.docs.length ?? 0;
    for (const historyDoc of context.collections['requests-history']?.docs ?? []) {
      const historyData = historyDoc.data();
      if (!historyData.request_id) continue;
      const happenedAt = historyData.happened_at || historyDoc.createTime;
      const previous = firstHistoryAt.get(historyData.request_id);
      const millis = happenedAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
      if (!previous || millis < previous.millis) firstHistoryAt.set(historyData.request_id, { value: happenedAt, millis });
    }
  }

  const transform = value => {
    if (isReference(value)) {
      const mapped = pathMap.get(value.path);
      if (!mapped) {
        if (writes.some(write => write.path === value.path)) return targetDb.doc(value.path);
        missingReferences.add(value.path);
        return value;
      }
      return targetDb.doc(mapped);
    }
    if (Array.isArray(value)) return value.map(transform);
    if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, transform(item)]));
    return value;
  };
  const add = (path, data) => writes.push({ path, data: transform(data) });

  for (const cityDoc of cityDocs) {
    const id = cityIdMap.get(cityDoc.id);
    add(`city/${id}`, { ...cityDoc.data(), legacy_city_id: cityDoc.id, migration_actor_uid: auditActorUid || authUid });
  }
  for (const homeDoc of homeDocs) {
    const { city: oldCityRef, ...data } = homeDoc.data();
    const cityId = cityIdMap.get(oldCityRef?.id);
    const id = homeIdMap.get(homeDoc.id);
    const images = Array.isArray(data.images) ? data.images.map(image => isReference(image) ? image.id : image) : [];
    add(`retreat_home/${id}`, { ...data, images, legacy_home_id: homeDoc.id, migration_actor_uid: auditActorUid || authUid });
    if (cityId) add(`city/${cityId}/retreat_homes/${id}`, { home_id: id, is_active: data.is_active !== false, legacy_home_id: homeDoc.id, migration_actor_uid: auditActorUid || authUid });
  }
  for (const fileDoc of fileDocs) add(`files/${fileDoc.id}`, { ...fileDoc.data(), is_global: true, migration_actor_uid: auditActorUid || authUid });

  const sourceRequestLookup = new Map();
  const requestEntries = [];
  const orphanHistoryEntries = [];
  for (const context of userContexts) {
    const { userDoc, uid } = context;
    const cityId = cityIdMap.get(userDoc.get('city')?.id);
    const profile = transform({ ...userDoc.data(), city: cityId, primary_city_id: cityId, legacy_user_id: userDoc.id, migration_actor_uid: auditActorUid || authUid });
    add(`user/${uid}`, profile);

    for (const city of cityIdMap.values()) {
      add(`city/${city}/roles/city_admin`, {
        role_id: 'city_admin',
        name: 'Administrador de ciudad',
        description: 'Administra los usuarios y operaciones de su ciudad.',
        is_active: true,
        migration_actor_uid: auditActorUid || authUid,
        permissions: {
          city: { read: true },
          members: { read: true, list: true, create: true, update: true, disable: true, assign_role: true },
          roles: { read: true, list: true, create: true, update: true },
          retreat_homes: { read: true, list: true, create: true, assign: true, update: true, unassign: true },
          retreats: { read: true, list: true, create: true, update: true, delete: true },
          requests: { read: true, list: true, create: true, update: true, delete: true, archive: true, unarchive: true, transfer: true, history_read: true, history_list: true, history_delete: true, fields: Object.fromEntries(['couple_basic', 'contact', 'identity', 'family', 'relationship', 'invitation', 'status', 'legacy_extra'].map(section => [section, { read: true, create: true, update: true }])) },
          payments: { read: true, list: true, create: true, update: true, delete: true },
          files: { read: true, create: true, update: true, delete: true },
          audit: { read: true, list: true },
        },
      });
      add(`city/${city}/members/${uid}`, { uid, role_id: 'city_admin', status: 'active', created_by: auditActorUid || uid, migration_actor_uid: auditActorUid || authUid });
    }

    for (const retreatDoc of context.collections.retreat?.docs ?? []) {
      const city = cityId;
      const oldRetreatId = retreatDoc.id;
      const id = retreatIdMap.get(oldRetreatId);
      const retreatData = retreatDoc.data();
      const {request_count: _legacyRequestCount, ...currentRetreatData} = retreatData;
      add(`city/${city}/retreat/${id}`, {
        ...currentRetreatData,
        city_id: city,
        user_id: uid,
        retreat_home: homeIdMap.get(retreatData.retreat_home?.id) || retreatData.retreat_home?.id || '',
        legacy_retreat_id: oldRetreatId,
        migration_actor_uid: auditActorUid || authUid,
      });
      for (const requestDoc of (await retreatDoc.ref.collection('request').get()).docs) {
        requestEntries.push({ requestDoc, uid, city, retreatId: id, isArchived: false, sourcePath: requestDoc.ref.path });
      }
    }

    for (const archivedDoc of context.collections['requests-archived']?.docs ?? []) {
      const data = archivedDoc.data();
      const oldRetreatId = data.archived_retreat_id || data.retreat;
      const id = retreatIdMap.get(oldRetreatId);
      requestEntries.push({ requestDoc: archivedDoc, uid, city: cityId, retreatId: id, isArchived: true, sourcePath: archivedDoc.ref.path });
    }

    for (const tokenDoc of context.collections.push_token?.docs ?? []) {
      const tokenData = { ...tokenDoc.data(), userId: uid };
      add(`user/${uid}/push_tokens/${tokenDoc.id}`, tokenData);
    }
    for (const fileDoc of context.collections.files?.docs ?? []) {
      add(`user/${uid}/files/${fileDoc.id}`, { ...fileDoc.data(), migration_actor_uid: auditActorUid || authUid });
    }
  }

  for (const context of userContexts) {
    const knownIds = new Set();
    for (const entry of requestEntries.filter(item => item.uid === context.uid)) {
      knownIds.add(entry.requestDoc.id);
      const dataId = entry.requestDoc.get('id');
      if (typeof dataId === 'string') knownIds.add(dataId);
    }
    const grouped = new Map();
    for (const historyDoc of context.collections['requests-history']?.docs ?? []) {
      const legacyRequestId = historyDoc.get('request_id');
      if (!legacyRequestId || knownIds.has(legacyRequestId)) continue;
      const events = grouped.get(legacyRequestId) || [];
      events.push(historyDoc);
      grouped.set(legacyRequestId, events);
    }
    for (const [legacyRequestId, histories] of grouped) {
      const chronological = [...histories].sort((left, right) => {
        const leftTime = (left.get('happened_at') || left.createTime)?.toMillis?.() ?? 0;
        const rightTime = (right.get('happened_at') || right.createTime)?.toMillis?.() ?? 0;
        return leftTime - rightTime;
      });
      const legacyRetreatId = [...chronological].reverse().map(item => item.get('retreat_id')).find(id => id && retreatIdMap.has(id));
      const createdAt = chronological[0].get('happened_at') || chronological[0].createTime;
      const syntheticData = { id: legacyRequestId, created_at: createdAt };
      const syntheticDoc = {
        id: legacyRequestId,
        createTime: createdAt,
        get: field => syntheticData[field],
        data: () => syntheticData,
      };
      requestEntries.push({
        requestDoc: syntheticDoc,
        uid: context.uid,
        city: cityIdMap.get(context.userDoc.get('city')?.id),
        retreatId: legacyRetreatId ? retreatIdMap.get(legacyRetreatId) : '',
        isArchived: true,
        isOrphanedLegacy: true,
        sourcePath: `${context.userDoc.ref.path}/legacy_history_requests/${legacyRequestId}`,
      });
      orphanHistoryEntries.push({ legacyRequestId, eventCount: histories.length });
    }
  }

  for (const entry of requestEntries) {
    const sourceData = entry.requestDoc.data();
    const id = createMigratedRequestId({
      retreatNumber: entry.retreatId.split('_')[0],
      createdAt: sourceData.created_at || firstHistoryAt.get(entry.requestDoc.id)?.value || entry.requestDoc.createTime || sourceData.archived_at,
      legacyId: `${entry.sourcePath}`,
    });
    const mapKey = entry.requestDoc.id;
    if (requestIdMap.has(mapKey)) assert.equal(requestIdMap.get(mapKey), id, `Solicitud duplicada con el mismo ID legacy ${mapKey}`);
    requestIdMap.set(mapKey, id);
    const dataId = entry.requestDoc.get('id');
    if (typeof dataId === 'string') {
      if (requestIdMap.has(dataId)) assert.equal(requestIdMap.get(dataId), id, `Solicitud duplicada con el ID interno ${dataId}`);
      requestIdMap.set(dataId, id);
    }
    const targetPath = `city/${entry.city}/requests/${id}`;
    if (!entry.isOrphanedLegacy) pathMap.set(entry.sourcePath, targetPath);
    sourceRequestLookup.set(entry.requestDoc.id, { ...entry, id, targetPath });
    if (typeof dataId === 'string') sourceRequestLookup.set(dataId, { ...entry, id, targetPath });
  }

  const historyEntries = [];
  for (const context of userContexts) {
    for (const historyDoc of context.collections['requests-history']?.docs ?? []) {
      const data = historyDoc.data();
      const request = sourceRequestLookup.get(data.request_id);
      assert.ok(request, `El historial ${historyDoc.id} no tiene solicitud de origen ${data.request_id}`);
      const id = `hist_${isoDate(data.happened_at)}_${slug(data.action || 'evento')}_${deterministicSuffix(historyDoc.id)}`;
      pathMap.set(historyDoc.ref.path, `${request.targetPath}/history/${id}`);
      historyEntries.push({ historyDoc, request, id });
    }
  }

  for (const entry of requestEntries.map(entry => ({ ...entry, id: requestIdMap.get(entry.requestDoc.id), targetPath: `city/${entry.city}/requests/${requestIdMap.get(entry.requestDoc.id)}` }))) {
    const split = entry.isOrphanedLegacy ? null : splitLegacyRequest(entry.requestDoc.data());
    if (split) assert.deepEqual(canonical(reconstructLegacyRequest(split)), canonical(entry.requestDoc.data()), `La transformación pierde datos de la solicitud ${entry.requestDoc.id}`);
    const rewriteIds = value => {
      if (typeof value === 'string') {
        if (retreatIdMap.has(value)) return retreatIdMap.get(value);
        if (requestIdMap.has(value)) return requestIdMap.get(value);
        if (userIdMap.has(value)) return userIdMap.get(value);
        if (cityIdMap.has(value)) return cityIdMap.get(value);
        return value;
      }
      if (Array.isArray(value)) return value.map(rewriteIds);
      if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteIds(item)]));
      return value;
    };
    const safeSummary = {
      retreat_id: entry.retreatId,
      is_archived: entry.isArchived,
      created_at: entry.requestDoc.get('created_at') || entry.requestDoc.createTime || entry.requestDoc.get('archived_at'),
      migration_actor_uid: auditActorUid || entry.uid,
      ...(entry.isOrphanedLegacy ? { is_orphaned_legacy: true } : {}),
    };
    add(entry.targetPath, safeSummary);
    if (entry.isOrphanedLegacy) continue;
    for (const [sectionId, sectionData] of Object.entries(split.details)) add(`${entry.targetPath}/details/${sectionId}`, rewriteIds(sectionData));
    const mappedPayments = new Map();
    for (const payment of split.payments) {
      const oldPaymentId = String(payment.data.id ?? payment.id);
      mappedPayments.set(oldPaymentId, payment.id);
      const data = { ...payment.data, id: payment.id, legacy_payment_id: oldPaymentId };
      if (typeof data.receipt_path === 'string' && data.receipt_path) {
        const extension = path.extname(data.receipt_name || data.receipt_path) || '.jpg';
        const newReceiptPath = `receipts/${entry.city}/${entry.retreatId}/${entry.id}/${payment.id}/receipt${extension.toLowerCase()}`;
        receiptPathMap.set(data.receipt_path, newReceiptPath);
        receiptCopies.push({ sourcePath: data.receipt_path, targetPath: newReceiptPath });
        data.legacy_receipt_path = data.receipt_path;
        data.receipt_path = newReceiptPath;
      }
      add(`${entry.targetPath}/payments/${payment.id}`, rewriteIds(data));
    }
    paymentIdMap.set(entry.requestDoc.id, mappedPayments);
  }

  const rewriteLegacyValue = (value, request) => {
    if (typeof value === 'string') {
      if (retreatIdMap.has(value)) return retreatIdMap.get(value);
      if (requestIdMap.has(value)) return requestIdMap.get(value);
      if (userIdMap.has(value)) return userIdMap.get(value);
      if (cityIdMap.has(value)) return cityIdMap.get(value);
      const paymentId = paymentIdMap.get(request.requestDoc.id)?.get(value);
      return paymentId || value;
    }
    if (Array.isArray(value)) return value.map(item => rewriteLegacyValue(item, request));
    if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteLegacyValue(item, request)]));
    return value;
  };

  for (const { historyDoc, request, id } of historyEntries) {
    const data = { ...historyDoc.data(), legacy_history_id: historyDoc.id };
    data.request_id = request.id;
    if (data.retreat_id && retreatIdMap.has(data.retreat_id)) data.retreat_id = retreatIdMap.get(data.retreat_id);
    if (data.payment_id) data.payment_id = paymentIdMap.get(request.requestDoc.id)?.get(String(data.payment_id)) || data.payment_id;
    if (data.receipt_path && receiptPathMap.has(data.receipt_path)) {
      data.legacy_receipt_path = data.receipt_path;
      data.receipt_path = receiptPathMap.get(data.receipt_path);
    }
    data.collection_state = request.isArchived ? 'requests-archived' : 'request';
    for (const key of Object.keys(data)) data[key] = rewriteLegacyValue(data[key], request);
    add(`${request.targetPath}/history/${id}`, data);
  }

  const sourcePaths = [...pathMap.keys()];
  for (const context of userContexts) {
    for (const collection of Object.values(context.collections)) {
      for (const doc of collection.docs) sourcePaths.push(doc.ref.path);
    }
  }
  for (const sourceDoc of [...cityDocs, ...homeDocs, ...fileDocs, ...users]) {
    for (const refPath of refPaths(sourceDoc.data())) if (!pathMap.has(refPath)) missingReferences.add(refPath);
  }
  for (const write of writes) {
    for (const refPath of refPaths(write.data)) {
      if (refPath.startsWith('city/') || refPath.startsWith('user/') || refPath.startsWith('retreat_home/') || refPath.startsWith('files/')) {
        const exists = pathMap.has(refPath) || writes.some(candidate => candidate.path === refPath);
        if (!exists) missingReferences.add(refPath);
      }
    }
  }
  assert.equal(missingReferences.size, 0, `Referencias legacy sin mapeo: ${[...missingReferences].join(', ')}. Destinos: ${writes.filter(write => write.path.startsWith('city/')).map(write => write.path).slice(0, 20).join(', ')}`);
  assert.equal(sourceInventory.otherSubcollections.length, 0, `Hay subcolecciones que faltan migrar: ${sourceInventory.otherSubcollections.join(', ')}`);

  const uniquePaths = new Set();
  for (const write of writes) {
    assert.ok(!uniquePaths.has(write.path), `Ruta destino duplicada: ${write.path}`);
    uniquePaths.add(write.path);
  }

  const database = await admin.app().options.projectId;
  const target = await targetDb.listCollections();
  const targetRootDocs = await Promise.all(target.map(async collection => ({ collection: collection.id, count: (await collection.get()).size })));
  const report = {
    mode,
    project: database,
    targetDatabase: databaseId,
    sourceInventory,
    orphanHistoryEntries,
    plannedDocuments: writes.length,
    receiptFiles: receiptCopies.length,
    targetRootDocuments: targetRootDocs,
    sourceDataMutated: false,
    unresolvedReferences: [...missingReferences],
    warning: 'El corte sigue condicionado a terminar la integración Angular y la prueba funcional completa sobre la nueva estructura.',
  };

  if (mode === 'plan') {
    if (verifyBackupOnly) report.verifiedBackup = await verifyBackup(sourceInventory.allDocuments);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  assert.ok(backupPrefix, 'El respaldo de Firestore y Storage debe verificarse antes de aplicar.');
  report.verifiedBackup = await verifyBackup(sourceInventory.allDocuments);
  const authUser = await admin.auth().getUser(authUid);
  assert.equal(userIdMap.get(legacyRoot), authUid, 'La cuenta superadmin debe corresponder al usuario legacy seleccionado.');
  const previousClaims = authUser.customClaims || {};
  assert.ok(targetRootDocs.every(item => item.count === 0), 'La base destino no está vacía; no se sobrescribirá información.');
  if (legacyRoot) assert.ok(userContexts.every(context => context.userDoc.id === legacyRoot), 'La selección de usuario legacy no coincide.');
  for (const copy of receiptCopies) {
    const sourceFile = storage.bucket('ecn-platform.firebasestorage.app').file(copy.sourcePath);
    const [exists] = await sourceFile.exists();
    assert.ok(exists, `No existe el recibo de origen ${copy.sourcePath}`);
    const destinationFile = storage.bucket('ecn-platform.firebasestorage.app').file(copy.targetPath);
    const [destinationExists] = await destinationFile.exists();
    if (destinationExists) {
      const [[sourceMetadata], [destinationMetadata]] = await Promise.all([sourceFile.getMetadata(), destinationFile.getMetadata()]);
      assert.equal(sourceMetadata.md5Hash, destinationMetadata.md5Hash, `El destino ya contiene otro archivo: ${copy.targetPath}`);
    } else {
      await sourceFile.copy(destinationFile);
    }
  }
  report.applied = true;
  await writeChunks(writes);

  const verification = [];
  for (const write of writes) {
    const snapshot = await targetDb.doc(write.path).get();
    assert.ok(snapshot.exists, `Falta el documento migrado ${write.path}`);
    assert.deepEqual(canonical(snapshot.data()), canonical(write.data), `Los datos cambiaron al guardar ${write.path}`);
    verification.push(write.path);
  }
  report.verifiedDocuments = verification.length;
  for (const copy of receiptCopies) {
    const sourceFile = storage.bucket('ecn-platform.firebasestorage.app').file(copy.sourcePath);
    const destinationFile = storage.bucket('ecn-platform.firebasestorage.app').file(copy.targetPath);
    const [[sourceMetadata], [destinationMetadata]] = await Promise.all([sourceFile.getMetadata(), destinationFile.getMetadata()]);
    assert.equal(sourceMetadata.size, destinationMetadata.size, `El recibo copiado tiene tamaño distinto: ${copy.targetPath}`);
    assert.equal(sourceMetadata.md5Hash, destinationMetadata.md5Hash, `El recibo copiado tiene hash distinto: ${copy.targetPath}`);
  }
  report.verifiedReceiptFiles = receiptCopies.length;
  const expectedAuditCounts = new Map(writes.map(write => [write.path, 1]));
  report.initialAuditEvents = await waitForMigrationAudit(expectedAuditCounts);
  const cleanupPaths = writes.filter(write => Object.prototype.hasOwnProperty.call(write.data, 'migration_actor_uid')).map(write => write.path);
  for (let offset = 0; offset < cleanupPaths.length; offset += 400) {
    const batch = targetDb.batch();
    for (const path of cleanupPaths.slice(offset, offset + 400)) batch.update(targetDb.doc(path), { migration_actor_uid: admin.firestore.FieldValue.delete() });
    await batch.commit();
  }
  for (const path of cleanupPaths) expectedAuditCounts.set(path, 2);
  report.cleanupAuditEvents = await waitForMigrationAudit(expectedAuditCounts);
  const nextClaims = { ...previousClaims, super_admin: true };
  const claimChanged = previousClaims.super_admin !== true;
  if (claimChanged) {
    await admin.auth().setCustomUserClaims(authUid, nextClaims);
    const auditId = `aud_${new Date().toISOString().replace(/[-:.]/g, '')}_auth_super_admin_${deterministicSuffix(authUid)}`;
    try {
      await targetDb.doc(`global_audit_logs/${auditId}`).set({
        audit_id: auditId,
        event_id: auditId,
        action: 'super_admin_granted',
        actor_uid: auditActorUid,
        actor_type: 'user',
        resource_path: `firebase_auth/users/${authUid}/customClaims`,
        resource_type: 'auth_claims',
        resource_id: authUid,
        occurred_at: admin.firestore.FieldValue.serverTimestamp(),
        changes: { super_admin: { before: previousClaims.super_admin ?? false, after: true } },
        source: 'firebase_auth',
      });
    } catch (error) {
      await admin.auth().setCustomUserClaims(authUid, previousClaims);
      throw error;
    }
  }
  report.verifiedAuditEvents = [...expectedAuditCounts.values()].reduce((sum, count) => sum + count, 0) + (claimChanged ? 1 : 0);
  report.bootstrap = { uid: authUid, previousClaims, assignedClaim: 'super_admin: true', claimChanged };
  report.applied = true;
  console.log(JSON.stringify(report, null, 2));
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await admin.app().delete().catch(() => undefined);
});
