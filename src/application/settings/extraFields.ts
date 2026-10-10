/** The directory properties that config.json can show as the organization's own fields (directory.extraFields); User.Read.All reads them all. */
export const EXTRA_FIELD_PROPERTIES = [
  'employeeType',
  'employeeOrgData.division',
  'employeeOrgData.costCenter',
  'onPremisesExtensionAttributes.extensionAttribute1',
  'onPremisesExtensionAttributes.extensionAttribute2',
  'onPremisesExtensionAttributes.extensionAttribute3',
  'onPremisesExtensionAttributes.extensionAttribute4',
  'onPremisesExtensionAttributes.extensionAttribute5',
  'onPremisesExtensionAttributes.extensionAttribute6',
  'onPremisesExtensionAttributes.extensionAttribute7',
  'onPremisesExtensionAttributes.extensionAttribute8',
  'onPremisesExtensionAttributes.extensionAttribute9',
  'onPremisesExtensionAttributes.extensionAttribute10',
  'onPremisesExtensionAttributes.extensionAttribute11',
  'onPremisesExtensionAttributes.extensionAttribute12',
  'onPremisesExtensionAttributes.extensionAttribute13',
  'onPremisesExtensionAttributes.extensionAttribute14',
  'onPremisesExtensionAttributes.extensionAttribute15',
] as const;

/** As the directory names it; a dot leads from a complex property to its member. */
export type ExtraFieldProperty = (typeof EXTRA_FIELD_PROPERTIES)[number];

/** One of the organization's own fields that config.json names; `Employee.extra` holds each person's value by its property. */
export interface ExtraField {
  readonly property: ExtraFieldProperty;
  /** Its name for people, as config.json gives it: the details row's label, the export column's heading, its word in the search's description. */
  readonly label: string;
  /** Whether search finds people by it. */
  readonly search: boolean;
  /** Whether the CSV export has a column for it. */
  readonly export: boolean;
}
