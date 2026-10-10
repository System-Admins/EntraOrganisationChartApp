import type { IReadonlyTheme } from '@microsoft/sp-component-base';
import { addressProblem, frameAddress, lookOf, type FrameLook } from './chartAddress';

const SITE = 'https://chart.contoso.com/';
const PLAIN: FrameLook = { without: [] };

/** A section's theme as SharePoint gives it: the site's main colour and the section's background. */
const theme = (themePrimary: string, bodyBackground: string, isInverted = false): IReadonlyTheme => ({
  palette: { themePrimary },
  semanticColors: { bodyBackground },
  isInverted,
});

describe('frameAddress', () => {
  it('opens the whole chart, asking the web part for its sign-in, where nothing is pasted', () => {
    expect(frameAddress(SITE, '', PLAIN)).toBe('https://chart.contoso.com/?host=sharepoint');
  });

  it("takes the options of the code from the chart's Settings > Embed this chart", () => {
    const code =
      '<iframe src="https://chart.contoso.com/?team=anna%40contoso.com&amp;hide=withoutJobTitle" title="Organization chart" ' +
      'width="100%" height="800" style="border:0"></iframe>';

    expect(frameAddress(SITE, code, PLAIN)).toBe(
      'https://chart.contoso.com/?team=anna%40contoso.com&hide=withoutJobTitle&host=sharepoint',
    );
  });

  it('takes the options of an address, and keeps its own host whatever the address says', () => {
    expect(frameAddress(SITE, ' https://chart.contoso.com/?theme=dark&host=teams ', PLAIN)).toBe(
      'https://chart.contoso.com/?theme=dark&host=sharepoint',
    );
  });

  it("opens the chart's own site, never one the pasted code names", () => {
    expect(frameAddress(SITE, '<iframe src="https://fabrikam.example/?team=anna"></iframe>', PLAIN)).toBe(
      'https://chart.contoso.com/?host=sharepoint',
    );
  });

  it("asks for the look of the web part's switches, over what the pasted address says", () => {
    const look: FrameLook = { without: ['logo', 'statusBar'], accent: '#0078d4', background: '#faf9f8', theme: 'light' };

    expect(frameAddress(SITE, 'https://chart.contoso.com/?team=anna&theme=dark&without=search&accent=000', look)).toBe(
      'https://chart.contoso.com/?team=anna&theme=light&without=logo%2CstatusBar&accent=%230078d4&background=%23faf9f8&host=sharepoint',
    );
    expect(frameAddress(SITE, 'https://chart.contoso.com/?without=search&theme=dark', PLAIN)).toBe(
      'https://chart.contoso.com/?theme=dark&host=sharepoint',
    );
  });
});

describe('lookOf', () => {
  it("takes the site's colour and the section's background in the section's own theme, with every part shown", () => {
    expect(lookOf({}, theme('#0078d4', '#faf9f8'))).toEqual({
      without: [],
      accent: '#0078d4',
      background: '#faf9f8',
      theme: 'light',
    });
    expect(lookOf({}, theme('#ffffff', '#0078d4', true)).theme).toBe('dark');
  });

  it('leaves out the parts and the colours that are switched off', () => {
    const properties = { logo: false, search: true, statusBar: false, siteColors: false, sectionBackground: false };

    expect(lookOf(properties, theme('#0078d4', '#faf9f8'))).toEqual({
      without: ['logo', 'statusBar'],
      accent: undefined,
      background: undefined,
      theme: undefined,
    });
  });

  it('asks for no colours or theme before SharePoint names one', () => {
    expect(lookOf({}, undefined)).toEqual({ without: [], accent: undefined, background: undefined, theme: undefined });
  });
});

describe('addressProblem', () => {
  it("accepts nothing, and the code or an address of the chart's site", () => {
    expect(addressProblem(SITE, '')).toBe('');
    expect(addressProblem(SITE, 'https://chart.contoso.com/?team=anna')).toBe('');
    expect(addressProblem(SITE, '<iframe src="https://chart.contoso.com/"></iframe>')).toBe('');
  });

  it('names the site to paste from where the code or address is of another', () => {
    expect(addressProblem(SITE, 'https://fabrikam.example/')).toBe(
      'Paste the code or an address of chart.contoso.com, from its Settings > Embed this chart.',
    );
    expect(addressProblem(SITE, 'the chart')).not.toBe('');
  });
});
