type RequestData = Record<string, any>;

const PERSON_SECTIONS = new Set(['couple_basic', 'contact', 'identity', 'family']);

export function mergeRequestDetail(target: RequestData, sectionId: string, value: RequestData): void {
  if (PERSON_SECTIONS.has(sectionId)) {
    for (const person of ['she', 'he']) {
      if (value[person]) target[person] = { ...(target[person] ?? {}), ...value[person] };
    }
    return;
  }

  if (sectionId === 'legacy_extra') {
    const { she, he, ...extraFields } = value;
    Object.assign(target, extraFields);
    for (const [person, fields] of Object.entries({ she, he })) {
      if (fields && typeof fields === 'object') target[person] = { ...(target[person] ?? {}), ...fields };
    }
    return;
  }

  if (sectionId !== 'payments_summary') Object.assign(target, value);
}
