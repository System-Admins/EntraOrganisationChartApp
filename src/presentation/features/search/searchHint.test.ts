import { describe, expect, it } from 'vitest';
import type { ExtraField } from '@/application/settings/extraFields';
import { searchHint } from './searchHint';

describe('searchHint', () => {
  it('names everything the search looks in, each once, what people look up most first', () => {
    expect(searchHint('en')).toBe('Finds people by name, phone, e-mail, office, company, job title, department, city, or country.');
  });

  it('names the organization\'s own fields that search looks in last, by the labels config.json gives them, and not the others', () => {
    const fields: ExtraField[] = [
      { property: 'employeeOrgData.costCenter', label: 'Cost centre', search: true, export: false },
      { property: 'employeeType', label: 'Employee type', search: false, export: true },
      { property: 'onPremisesExtensionAttributes.extensionAttribute3', label: 'SAP number', search: true, export: true },
    ];

    expect(searchHint('en', fields)).toBe(
      'Finds people by name, phone, e-mail, office, company, job title, department, city, country, Cost centre, or SAP number.',
    );
  });
});
