import type { UserSettings } from '../settings/userSettings';

/** Another page that shows the chart in an iframe, such as a SharePoint page. */
export interface ChartEmbedding {
  /** The chart's own address with who `settings` put in it (KEPT_PARAMETERS), and nothing of its viewer's, such as an open person. */
  address(settings: UserSettings): string;
}
