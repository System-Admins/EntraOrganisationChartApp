import type { ChartPart } from '../../generated/chartParts';

/** The property pane's texts, in English as the chart's are; the toolbox's are in the manifest. */
export const STRINGS = {
  address: 'Chart address',
  addressHint:
    "To show a team or filters, paste the code from the chart's Settings > Embed this chart. Leave it empty for the whole chart.",
  /** Where the pasted code or address is of another site than the one the package was built for. */
  addressElsewhere: (host: string): string => `Paste the code or an address of ${host}, from its Settings > Embed this chart.`,
  height: 'Height in pixels',
  show: 'Show',
  parts: { logo: 'Logo and title', search: 'Search', toolbar: 'Toolbar', statusBar: 'Status bar' } satisfies Record<ChartPart, string>,
  colours: 'Colours',
  /** Each is used only where the chart's text stays readable with it. */
  siteColors: "The site's theme colour",
  sectionBackground: "The section's background",
};
