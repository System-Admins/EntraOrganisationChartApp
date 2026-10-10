// The SharePoint web part's build copies this file (scripts/package-sharepoint-app.mjs): no imports, nothing past ES2015.

/** The parts of the page that an embedding can leave out with ?without=; the logo goes with the title. */
export const CHART_PARTS = ['logo', 'search', 'toolbar', 'statusBar'] as const;

export type ChartPart = (typeof CHART_PARTS)[number];
