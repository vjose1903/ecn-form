import { mergeRequestDetail } from './request-details';

describe('mergeRequestDetail', () => {
  it('preserva nombres al combinar los campos adicionales legacy', () => {
    const request: Record<string, any> = {};
    mergeRequestDetail(request, 'couple_basic', {
      she: { full_name: 'Claurileidy Coronado Montero' },
      he: { full_name: 'Jan Michael Pérez Feliz' },
    });

    mergeRequestDetail(request, 'legacy_extra', {
      she: {},
      he: {},
      id: 'legacy-id',
      retreat: '84_2026-10-30_2026-11-01',
    });

    expect(request['she'].full_name).toBe('Claurileidy Coronado Montero');
    expect(request['he'].full_name).toBe('Jan Michael Pérez Feliz');
    expect(request['id']).toBe('legacy-id');
  });
});
