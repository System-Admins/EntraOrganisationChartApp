import type { IReadonlyTheme } from '@microsoft/sp-component-base';
import { CHART_PARTS, type ChartPart } from '../../generated/chartParts';
import { WEB_PART_HOST } from '../../generated/webPartMessages';
import { STRINGS } from './strings';

/** The switches of the web part's settings, missing in web parts added before them, where each counts as on. */
export type LookProperties = Partial<Record<ChartPart | 'siteColors' | 'sectionBackground', boolean>>;

/** What the frame's address asks of the chart's look; the web part's switches decide it, whatever the pasted code says. */
export interface FrameLook {
  readonly without: readonly ChartPart[];
  readonly accent?: string;
  readonly background?: string;
  readonly theme?: 'light' | 'dark';
}

const LOOK_PARAMETERS = ['without', 'accent', 'background'];

/** The chart's look from the switches and the theme SharePoint gives the section; the chart keeps only colours it stays readable with. */
export function lookOf(properties: LookProperties, theme: IReadonlyTheme | undefined): FrameLook {
  const accent = properties.siteColors !== false ? theme?.palette?.themePrimary : undefined;
  const background = properties.sectionBackground !== false ? theme?.semanticColors?.bodyBackground : undefined;
  return {
    without: CHART_PARTS.filter((part) => properties[part] === false),
    accent,
    background,
    // The section's colours are made for dark text, or for light text where SharePoint inverts the section.
    theme: accent || background ? (theme?.isInverted ? 'dark' : 'light') : undefined,
  };
}

/** The frame's address: the chart's site with the options of `pasted`, the code or address of its Settings > Embed this chart. */
export function frameAddress(site: string, pasted: string, look: FrameLook): string {
  const address = new URL(site);
  const options = pastedAddress(site, pasted);
  if (options) {
    options.searchParams.forEach((value, name) => {
      if (LOOK_PARAMETERS.indexOf(name) === -1) address.searchParams.set(name, value);
    });
  }
  if (look.without.length > 0) address.searchParams.set('without', look.without.join(','));
  if (look.accent) address.searchParams.set('accent', look.accent);
  if (look.background) address.searchParams.set('background', look.background);
  if (look.theme) address.searchParams.set('theme', look.theme);
  address.searchParams.set('host', WEB_PART_HOST);
  return address.href;
}

/** Why `pasted` can't give the chart its options, or '' where it can, as the property pane takes it. */
export function addressProblem(site: string, pasted: string): string {
  return pasted.trim() === '' || pastedAddress(site, pasted) ? '' : STRINGS.addressElsewhere(new URL(site).host);
}

/** Undefined for anything but an address of the chart's site, or an iframe's code with one. */
function pastedAddress(site: string, pasted: string): URL | undefined {
  // The embed code writes the address as an attribute, whose & are &amp;.
  const text = (/src="([^"]*)"/.exec(pasted)?.[1] ?? pasted).trim().replace(/&amp;/g, '&');
  try {
    const address = new URL(text);
    return address.origin === new URL(site).origin ? address : undefined;
  } catch {
    return undefined;
  }
}
