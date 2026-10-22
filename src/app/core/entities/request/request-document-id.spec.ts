import { createRequestDocumentId } from './request-document-id';

describe('createRequestDocumentId', () => {
  it('incluye el retiro y la fecha sin exponer datos personales', () => {
    expect(createRequestDocumentId({
      retreatNumber: 84,
      createdAt: new Date('2026-10-22T17:00:00Z'),
      suffix: 'A1b2C3d4',
    })).toBe('sol_84_20261022_a1b2c3d4');
  });

  it('rechaza datos insuficientes para crear un ID reconocible y único', () => {
    expect(() => createRequestDocumentId({
      retreatNumber: 84,
      createdAt: new Date('2026-10-22T17:00:00Z'),
      suffix: 'bad',
    })).toThrow();
  });
});
