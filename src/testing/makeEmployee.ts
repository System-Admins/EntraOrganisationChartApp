import type { Employee } from '@/domain/employees/employee';

/** Test fixture: an enabled, licensed member with a job title, in the address list, keyed by a short id. */
export function makeEmployee(id: string, managerId: string | null = null, overrides: Partial<Employee> = {}): Employee {
  const name = id.charAt(0).toUpperCase() + id.slice(1);
  return {
    id,
    displayName: name,
    mail: `${id}@contoso.com`,
    userPrincipalName: `${id}@contoso.com`,
    businessPhone: null,
    mobilePhone: null,
    jobTitle: 'Engineer',
    department: 'Engineering',
    companyName: null,
    employeeId: null,
    officeLocation: null,
    city: null,
    country: null,
    managerId,
    accountEnabled: true,
    isGuest: false,
    isLicensed: true,
    hiddenFromAddressList: false,
    extra: {},
    ...overrides,
  };
}
