/** Where the chart runs: on a site of its own, in another page's iframe (SharePoint, an intranet), in its SharePoint web part, or as a Teams app. */
export const HOST_KINDS = ['standalone', 'embedded', 'sharepoint', 'teams'] as const;

export type HostKind = (typeof HOST_KINDS)[number];
