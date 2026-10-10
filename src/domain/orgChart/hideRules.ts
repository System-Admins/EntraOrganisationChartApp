import type { Employee } from '../employees/employee';

export const HIDE_CATEGORIES = [
  'withoutManager',
  'withHiddenManager',
  'inManagerCycle',
  'disabledAccounts',
  'guests',
  'unlicensed',
  'withoutJobTitle',
  'hiddenFromAddressList',
  'unattached',
] as const;

export type HideCategory = (typeof HIDE_CATEGORIES)[number];

/** Configured top persons are never hidden. The three manager rules hide a person with everyone below them; hiddenFromAddressList leaves a nameless place where someone below is shown (buildOrgChart). */
export type HideRules = Readonly<Record<HideCategory, boolean>>;

/** Every rule off: the chart with everyone its top persons and narrowing let in. */
export const NOTHING_HIDDEN: HideRules = Object.fromEntries(HIDE_CATEGORIES.map((category) => [category, false])) as Record<
  HideCategory,
  boolean
>;

/** The rules that look at the person alone; the others look at where the person would sit in the chart. */
export const ATTRIBUTE_RULES = ['disabledAccounts', 'guests', 'unlicensed', 'withoutJobTitle'] as const satisfies readonly HideCategory[];

export type AttributeRule = (typeof ATTRIBUTE_RULES)[number];

const APPLIES_TO: Readonly<Record<AttributeRule, (employee: Employee) => boolean>> = {
  disabledAccounts: (employee) => !employee.accountEnabled,
  guests: (employee) => employee.isGuest,
  unlicensed: (employee) => !employee.isLicensed,
  withoutJobTitle: (employee) => !employee.jobTitle?.trim(),
};

/** The first rule in ATTRIBUTE_RULES' order that hides the person, which is the one to name; null when none does. */
export function hiddenBecause(employee: Employee, rules: HideRules): AttributeRule | null {
  return ATTRIBUTE_RULES.find((rule) => rules[rule] && APPLIES_TO[rule](employee)) ?? null;
}

/** Defined by hiddenBecause, so that a rule and its explanation can't drift apart. */
export function isHiddenByAttributes(employee: Employee, rules: HideRules): boolean {
  return hiddenBecause(employee, rules) !== null;
}

/** Whether the rules keep the person as private as the address list does: nothing may name them, wherever the chart would. */
export function isUnlisted(employee: Employee, rules: HideRules): boolean {
  return rules.hiddenFromAddressList && employee.hiddenFromAddressList;
}

/** The rules with every filter that tidies the chart off: the address list's keeps people private, so it stays as it is. */
export function tidyingOff(rules: HideRules): HideRules {
  return { ...NOTHING_HIDDEN, hiddenFromAddressList: rules.hiddenFromAddressList };
}
