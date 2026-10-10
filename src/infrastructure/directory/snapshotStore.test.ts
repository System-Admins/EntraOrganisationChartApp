import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeIndexedDb } from '@/testing/fakeIndexedDb';
import { makeEmployee } from '@/testing/makeEmployee';
import { fromRecord, IndexedDbSnapshotStore, toRecord, type StoredDirectory } from './snapshotStore';

const directory: StoredDirectory = {
  employees: [makeEmployee('ceo'), makeEmployee('lead', 'ceo')],
  loadedAt: new Date(2026, 9, 1, 9, 5),
  changesLink: 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=abc',
  fullReadAt: new Date(2026, 8, 30, 14, 3),
};

describe('snapshot records', () => {
  it('read back what was written, the time of the last full read included', () => {
    expect(fromRecord(toRecord(directory))).toEqual(directory);
  });

  it('read a record from before change tracking and full-read times as having neither', () => {
    const { schemaVersion, extraFields } = toRecord(directory);

    expect(fromRecord({ schemaVersion, extraFields, employees: directory.employees, loadedAt: directory.loadedAt })).toEqual({
      ...directory,
      changesLink: null,
      fullReadAt: null,
    });
  });

  it('ignore no record, and a record of another schema version, which may hold people in another shape', () => {
    expect(fromRecord(undefined)).toBeNull();
    expect(fromRecord({ ...toRecord(directory), schemaVersion: toRecord(directory).schemaVersion - 1 })).toBeNull();
  });
});

describe('IndexedDbSnapshotStore', () => {
  const SCOPE = '11111111-2222-3333-4444-555555555555/66666666-7777-8888-9999-000000000000';
  /** Read with an employee type and a cost centre, the organization's own fields that config.json names. */
  const withFields: StoredDirectory = {
    ...directory,
    employees: [
      makeEmployee('ceo', null, { extra: { employeeType: 'Employee', 'employeeOrgData.costCenter': '4100' } }),
      makeEmployee('lead', 'ceo', { extra: { employeeType: 'Contractor' } }),
    ],
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the people\'s own fields, and reads them back where config.json names the same fields, in any order', async () => {
    installFakeIndexedDb();
    await new IndexedDbSnapshotStore(SCOPE, ['employeeType', 'employeeOrgData.costCenter']).write(withFields);

    await expect(new IndexedDbSnapshotStore(SCOPE, ['employeeOrgData.costCenter', 'employeeType']).read()).resolves.toEqual(withFields);
  });

  it('starts over where config.json names a field more or a field less, which the people and the changes link would lack or keep', async () => {
    installFakeIndexedDb();
    await new IndexedDbSnapshotStore(SCOPE, ['employeeType', 'employeeOrgData.costCenter']).write(withFields);
    await new IndexedDbSnapshotStore(`${SCOPE}-none`).write(directory);

    await expect(new IndexedDbSnapshotStore(SCOPE, ['employeeType']).read()).resolves.toBeNull();
    await expect(new IndexedDbSnapshotStore(`${SCOPE}-none`, ['employeeType']).read()).resolves.toBeNull();
    await expect(new IndexedDbSnapshotStore(`${SCOPE}-none`).read()).resolves.toEqual(directory);
  });
});
