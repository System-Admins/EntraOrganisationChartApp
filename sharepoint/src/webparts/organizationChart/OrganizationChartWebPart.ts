import type { IReadonlyTheme } from '@microsoft/sp-component-base';
import { Version } from '@microsoft/sp-core-library';
import {
  PropertyPaneSlider,
  PropertyPaneTextField,
  PropertyPaneToggle,
  type IPropertyPaneConfiguration,
  type IPropertyPaneField,
  type IPropertyPaneToggleProps,
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { CHART_SITE, CHART_TITLE } from '../../generated/chart';
import { CHART_PARTS } from '../../generated/chartParts';
import { addressProblem, frameAddress, lookOf, type LookProperties } from './chartAddress';
import { ChartBridge, type ChartHost } from './chartBridge';
import { STRINGS } from './strings';

export interface IOrganizationChartWebPartProps extends LookProperties {
  /** The code or address from the chart's Settings > Embed this chart; empty for the whole chart. */
  address: string;
  height: number;
}

/** SharePoint's name for Microsoft Graph, whose token carries every permission approved under API access. */
const GRAPH = 'https://graph.microsoft.com';

/** The chart in a frame, signed in through SharePoint: the chart's site is fixed in the package, never a property, as it receives tokens. */
export default class OrganizationChartWebPart extends BaseClientSideWebPart<IOrganizationChartWebPartProps> {
  private frame: HTMLIFrameElement | undefined;
  private bridge: ChartBridge | undefined;
  /** The theme of the section the web part is in; the base class renders again after it changes. */
  private theme: IReadonlyTheme | undefined;

  public render(): void {
    if (!this.frame) {
      this.frame = document.createElement('iframe');
      this.frame.title = CHART_TITLE;
      this.frame.allow = 'clipboard-write; web-share';
      this.frame.style.display = 'block';
      this.frame.style.width = '100%';
      this.frame.style.border = '0';
      this.bridge = new ChartBridge(this.frame, new URL(CHART_SITE).origin, this.chartHost());
      this.domElement.appendChild(this.frame);
    }
    this.frame.style.height = `${this.properties.height}px`;
    const address = frameAddress(CHART_SITE, this.properties.address, lookOf(this.properties, this.theme));
    // Setting the same address again would load the chart anew.
    if (this.frame.src !== address) this.frame.src = address;
  }

  protected override onThemeChanged(theme: IReadonlyTheme | undefined): void {
    this.theme = theme;
  }

  protected override onDispose(): void {
    this.bridge?.dispose();
  }

  protected override get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected override getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    // Web parts added before a switch existed have no value for it, which counts as on.
    const switchFor = (property: keyof LookProperties, label: string): IPropertyPaneField<IPropertyPaneToggleProps> =>
      PropertyPaneToggle(property, { label, checked: this.properties[property] !== false });
    return {
      pages: [
        {
          groups: [
            {
              groupFields: [
                PropertyPaneTextField('address', {
                  label: STRINGS.address,
                  description: STRINGS.addressHint,
                  multiline: true,
                  onGetErrorMessage: (value: string) => addressProblem(CHART_SITE, value),
                }),
                PropertyPaneSlider('height', { label: STRINGS.height, min: 400, max: 2000, step: 50 }),
              ],
            },
            {
              groupName: STRINGS.show,
              groupFields: CHART_PARTS.map((part) => switchFor(part, STRINGS.parts[part])),
            },
            {
              groupName: STRINGS.colours,
              groupFields: [
                switchFor('siteColors', STRINGS.siteColors),
                switchFor('sectionBackground', STRINGS.sectionBackground),
              ],
            },
          ],
        },
      ],
    };
  }

  private chartHost(): ChartHost {
    const { user, aadInfo, cultureInfo } = this.context.pageContext;
    const tokens = this.context.aadTokenProviderFactory;
    return {
      user: {
        id: aadInfo.userId.toString(),
        displayName: user.displayName,
        userPrincipalName: user.loginName,
        isGuest: user.isExternalGuestUser,
      },
      locale: cultureInfo.currentUICultureName,
      graphToken: (fresh) =>
        tokens.getTokenProvider().then((provider) => provider.getToken(GRAPH, { useCachedToken: !fresh })),
    };
  }
}
