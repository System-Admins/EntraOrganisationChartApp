/** Entra ID codes for disabled, locked, foreign, unassigned and Conditional Access-blocked accounts. */
export const ACCOUNT_BLOCKED: ReadonlySet<string> = new Set(['50020', '50053', '50057', '50105', '53003']);

/** The number Entra ID starts its description of an error with, which support can look up; null in a description without one. */
export function entraErrorNumber(description: string): string | null {
  return /AADSTS(\d+)/.exec(description)?.[1] ?? null;
}
