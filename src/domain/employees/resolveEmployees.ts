import type { Employee } from './employee';

/** A UPN's suffix is a verified domain, so an address without a dot after the @ is a typing slip. */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OBJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether resolveEmployees could find someone by `value`: an e-mail address or UPN, or an object id, but never a name. */
export function canIdentify(value: string): boolean {
  const identifier = value.trim();
  return ADDRESS.test(identifier) || OBJECT_ID.test(identifier);
}

export interface ResolvedEmployees {
  /** In the order the identifiers were given, without duplicates. */
  readonly found: readonly Employee[];
  readonly unresolved: readonly string[];
}

/** Matches identifiers against object id, UPN and mail, case-insensitively. */
export function resolveEmployees(
  employees: readonly Employee[],
  identifiers: readonly string[],
): ResolvedEmployees {
  const byKey = new Map<string, Employee>();
  for (const employee of employees) {
    for (const key of [employee.id, employee.userPrincipalName, employee.mail]) {
      if (key && !byKey.has(key.toLowerCase())) byKey.set(key.toLowerCase(), employee);
    }
  }

  const found = new Map<string, Employee>();
  const unresolved: string[] = [];
  for (const identifier of identifiers) {
    const employee = byKey.get(identifier.trim().toLowerCase());
    if (employee) found.set(employee.id, employee);
    else unresolved.push(identifier);
  }
  return { found: [...found.values()], unresolved };
}
