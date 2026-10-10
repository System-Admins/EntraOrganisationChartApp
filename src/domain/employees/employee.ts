/** A directory user reduced to what the organization chart needs. Optional directory fields are null when empty. */
export interface Employee {
  readonly id: string;
  readonly displayName: string;
  readonly mail: string | null;
  /** Identifies the person for Teams chat and calls. */
  readonly userPrincipalName: string;
  readonly businessPhone: string | null;
  readonly mobilePhone: string | null;
  readonly jobTitle: string | null;
  readonly department: string | null;
  readonly companyName: string | null;
  readonly employeeId: string | null;
  readonly officeLocation: string | null;
  readonly city: string | null;
  readonly country: string | null;
  /** Manager as recorded in the directory; that object may be hidden, deleted or not a user. */
  readonly managerId: string | null;
  readonly accountEnabled: boolean;
  readonly isGuest: boolean;
  readonly isLicensed: boolean;
  /** Whether the organization hides the person from its address list, the global address list of Outlook and Teams. */
  readonly hiddenFromAddressList: boolean;
  /** The organization's own fields, such as a cost centre, by the directory property that holds them; one left empty is left out. */
  readonly extra: Readonly<Record<string, string>>;
}

/** The number shown on the card: the desk phone when there is one. */
export function primaryPhone(employee: Employee): string | null {
  return employee.businessPhone ?? employee.mobilePhone;
}

export const ACCOUNT_STATES = ['disabled', 'guest', 'unlicensed'] as const;

/** How an account differs from an enabled, licensed member's. */
export type AccountState = (typeof ACCOUNT_STATES)[number];

/** The one that matters most where several apply; a guest's license is their own organization's, so it never counts. */
export function accountStateOf(employee: Employee): AccountState | null {
  if (!employee.accountEnabled) return 'disabled';
  if (employee.isGuest) return 'guest';
  return employee.isLicensed ? null : 'unlicensed';
}

/** What people look a person up by and the directory can lack; only the photo source knows about the photo. */
export const MISSING_DETAILS = ['jobTitle', 'department', 'officeLocation', 'mail', 'phone', 'photo'] as const;

export type MissingDetail = (typeof MISSING_DETAILS)[number];

/** In MISSING_DETAILS' order. A photo is missing only where the photo source said so, not where it gave no answer. */
export function missingDetailsOf(employee: Employee, hasPhoto: boolean | undefined): MissingDetail[] {
  const missing = (value: string | null) => !value?.trim();
  const lacks: Readonly<Record<MissingDetail, boolean>> = {
    jobTitle: missing(employee.jobTitle),
    department: missing(employee.department),
    officeLocation: missing(employee.officeLocation),
    mail: missing(employee.mail),
    phone: missing(employee.businessPhone) && missing(employee.mobilePhone),
    photo: hasPhoto === false,
  };
  return MISSING_DETAILS.filter((detail) => lacks[detail]);
}
