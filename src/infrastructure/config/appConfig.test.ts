import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTheme } from '@/application/settings/appSettings';
import { fetchAppConfig, parseAppConfig, supportDeskIn } from './appConfig';
import { readStoredUserSettings, type StoredUserSettings } from './storageUserSettingsStore';

const TENANT = '11111111-2222-3333-4444-555555555555';
const CLIENT = '66666666-7777-8888-9999-000000000000';

describe('parseAppConfig', () => {
  it('fills defaults for everything but the Graph credentials', () => {
    const config = parseAppConfig({ auth: { tenantId: TENANT, clientId: CLIENT } }, '');

    expect(config.dataSource).toBe('graph');
    expect(config.auth).toEqual({ tenantId: TENANT, clientId: CLIENT });
    expect(config.cacheInBrowser).toBe(true);
    expect(config.settings.chart).toEqual({
      options: {
        topPersons: [],
        hide: {
          withoutManager: true,
          withHiddenManager: true,
          inManagerCycle: true,
          disabledAccounts: true,
          guests: true,
          unlicensed: true,
          withoutJobTitle: false,
          hiddenFromAddressList: true,
          unattached: false,
        },
      },
      team: null,
      expandDepth: 1,
      showPhotos: true,
      showPresence: true,
      showWorkLocation: true,
      showWorkingHours: true,
      showLevels: false,
      startAt: 'top',
    });
    expect(config.settings.defaults).toEqual({
      hide: config.settings.chart.options.hide,
      showLevels: false,
      language: 'auto',
      team: null,
      startAt: 'top',
      theme: 'auto',
      textSize: 'standard',
    });
    expect(config.settings.changePhotoUrl).toBe('https://myaccount.microsoft.com/');
    expect(config.settings.support).toBeNull();
    expect(config.settings.extraFields).toEqual([]);
    expect(config.emailClient).toBe('mailto');
    expect(config.csvSeparator).toBe(',');
    expect(config.settings.allowExport).toBe(true);
    expect(config.settings.allowReports).toBe(true);
    expect(config.settings.initialPerson).toBeNull();
    expect(config.settings.theme).toEqual({ chosen: 'auto', automatic: 'auto' });
    expect(config.settings.textSize).toBe('standard');
    expect(config.settings.language).toEqual({ chosen: 'auto', automatic: 'en' });
    // No title in config.json: the chart names itself in the viewer's language.
    expect(config.settings.branding.title).toBeNull();
  });

  it('needs no credentials in demo mode', () => {
    expect(parseAppConfig({ dataSource: 'demo' }, '').auth).toBeNull();
  });

  it.each([
    [{ auth: { tenantId: '', clientId: CLIENT } }, 'auth.tenantId must be the GUID'],
    [{ dataSource: 'ldap' }, 'dataSource must be one of: "graph", "demo"'],
    [{ dataSource: 'demo', theme: 'high-contrast' }, 'theme must be one of: "auto", "light", "dark", "contrast"'],
    [{ dataSource: 'demo', export: { csvSeparator: '|' } }, 'export.csvSeparator must be one of: ",", ";"'],
    [{ dataSource: 'demo', export: { csv: true } }, 'Unknown export.csv'],
    [{ dataSource: 'demo', reports: { enabled: 'no' } }, 'reports.enabled must be true or false'],
    [{ dataSource: 'demo', reports: { enable: false } }, 'Unknown reports.enable in config.json. Use: enabled.'],
    [{ dataSource: 'demo', report: { enabled: false } }, 'Unknown report in config.json'],
    [{ dataSource: 'demo', reports: true }, 'reports must be a JSON object.'],
    [{ dataSource: 'demo', embedding: { allowedSites: ['contoso.sharepoint.com'] } }, 'embedding.allowedSites may only hold sites'],
    [{ dataSource: 'demo', embedding: { sites: [] } }, 'Unknown embedding.sites'],
    [{ dataSource: 'demo', chart: { hide: { managers: true } } }, 'Unknown chart.hide.managers'],
    [{ dataSource: 'demo', chart: { topPerson: ['ceo@contoso.com'] } }, 'Unknown chart.topPerson'],
    [{ dataSource: 'demo', hide: { guests: false } }, 'Unknown hide in config.json'],
    [{ dataSource: 'demo', contact: { emailclient: 'outlookWeb' } }, 'Unknown contact.emailclient'],
    [{ dataSource: 'demo', chart: { expandDepth: 99 } }, 'chart.expandDepth must be a whole number from 0 to 10'],
    [{ dataSource: 'demo', branding: { colors: { primary: '#000' } } }, 'Unknown branding.colors.primary'],
    [{ dataSource: 'demo', chart: { topPersons: 'ceo@contoso.com' } }, 'chart.topPersons must be a list of strings'],
    [{ dataSource: 'demo', chart: { showLevels: 'no' } }, 'chart.showLevels must be true or false'],
    [{ dataSource: 'demo', chart: { showLevel: false } }, 'Unknown chart.showLevel'],
    [{ dataSource: 'demo', chart: { showWorkLocation: 'office' } }, 'chart.showWorkLocation must be true or false'],
    [{ dataSource: 'demo', chart: { showWorkLocations: false } }, 'Unknown chart.showWorkLocations'],
    [{ dataSource: 'demo', chart: { showWorkingHours: 'office' } }, 'chart.showWorkingHours must be true or false'],
    [{ dataSource: 'demo', chart: { showWorkHours: false } }, 'Unknown chart.showWorkHours'],
    [{ dataSource: 'demo', language: 'de' }, 'language must be one of: "auto", "en" (got "de")'],
    [{ dataSource: 'demo', lang: 'en' }, 'Unknown lang in config.json'],
    [{ dataSource: 'demo', chart: { startAt: 'home' } }, 'chart.startAt must be one of: "top", "me", "lastView" (got "home")'],
    [{ dataSource: 'demo', chart: { startsAt: 'me' } }, 'Unknown chart.startsAt'],
    [{ dataSource: 'demo', support: { link: 'https://help.contoso.com' } }, 'Unknown support.link'],
    [{ dataSource: 'demo', support: { label: 'Service desk' } }, 'support.label needs support.url, the address it links to.'],
    [{ dataSource: 'demo', support: { url: 42 } }, 'support.url must be a string.'],
    [{ dataSource: 'demo', support: 'https://help.contoso.com' }, 'support must be a JSON object.'],
    [{ dataSource: 'demo', helpdesk: { url: 'https://help.contoso.com' } }, 'Unknown helpdesk in config.json'],
    [{ dataSource: 'demo', directory: { extraField: [] } }, 'Unknown directory.extraField'],
    [{ dataSource: 'demo', directory: { extraFields: { property: 'employeeType' } } }, 'directory.extraFields must be a list of JSON objects.'],
    [{ dataSource: 'demo', directory: { extraFields: ['employeeType'] } }, 'directory.extraFields[0] must be a JSON object.'],
    [
      { dataSource: 'demo', directory: { extraFields: [{ property: 'employeeType', label: 'Type', searchable: true }] } },
      'Unknown directory.extraFields[0].searchable',
    ],
    [
      { dataSource: 'demo', directory: { extraFields: [{ property: 'costCenter', label: 'Cost centre' }] } },
      'directory.extraFields[0].property must be one of: "employeeType", "employeeOrgData.division", "employeeOrgData.costCenter", ' +
        '"onPremisesExtensionAttributes.extensionAttribute1" to "onPremisesExtensionAttributes.extensionAttribute15" (got "costCenter").',
    ],
    [
      { dataSource: 'demo', directory: { extraFields: [{ label: 'Cost centre' }] } },
      'directory.extraFields[0].property must be one of: "employeeType", "employeeOrgData.division", "employeeOrgData.costCenter", ' +
        '"onPremisesExtensionAttributes.extensionAttribute1" to "onPremisesExtensionAttributes.extensionAttribute15".',
    ],
    [
      { dataSource: 'demo', directory: { extraFields: [{ property: 'employeeType', label: ' ' }] } },
      'directory.extraFields[0].label must name the field for people, for example "Cost centre".',
    ],
    [{ dataSource: 'demo', directory: { extraFields: [{ property: 'employeeType' }] } }, 'directory.extraFields[0].label must name the field'],
    [
      {
        dataSource: 'demo',
        directory: { extraFields: [{ property: 'employeeType', label: 'Type' }, { property: 'employeeType', label: 'Kind' }] },
      },
      'directory.extraFields[1].property names "employeeType" a second time; list each property once.',
    ],
    [
      {
        dataSource: 'demo',
        directory: { extraFields: [{ property: 'employeeType', label: 'Type' }, { property: 'employeeOrgData.division', label: 'type' }] },
      },
      'directory.extraFields[1].label "type" is another field\'s label too; give each field a label of its own.',
    ],
    [
      { dataSource: 'demo', directory: { extraFields: [{ property: 'employeeType', label: 'Type', search: 'yes' }] } },
      'directory.extraFields[0].search must be true or false.',
    ],
    [
      { dataSource: 'demo', directory: { extraFields: [{ property: 'employeeType', label: 'Type', export: 1 }] } },
      'directory.extraFields[0].export must be true or false.',
    ],
  ])('explains invalid configuration %#', (json, message) => {
    expect(() => parseAppConfig(json, '')).toThrow(message);
  });

  it('reads the text alternative for a logo shown without a title', () => {
    expect(parseAppConfig({ dataSource: 'demo', branding: { title: '', logoAlt: 'Contoso' } }, '').settings.branding.logoAlt).toBe('Contoso');
  });

  it('keeps an explicitly empty title so the logo can stand alone', () => {
    expect(parseAppConfig({ dataSource: 'demo', branding: { title: '' } }, '').settings.branding.title).toBe('');
  });

  it('lets the embedding URL set top persons, depth and theme', () => {
    const json = { dataSource: 'demo', chart: { topPersons: ['ceo@contoso.com'] } };

    const { settings } = parseAppConfig(json, '?top=head@contoso.com;deputy@contoso.com&depth=3&theme=light');

    expect(settings.chart.options.topPersons).toEqual(['head@contoso.com', 'deputy@contoso.com']);
    expect(settings.chart.expandDepth).toBe(3);
    expect(settings.theme.automatic).toBe('light');
  });

  it('lets an embedding leave out parts of the page and give its own colours, in any letter case and without the #', () => {
    const { settings } = parseAppConfig({ dataSource: 'demo' }, '?without=LOGO,statusbar,logo&background=FAF9F8&accent=%230078d4');

    expect(settings.without).toEqual(['logo', 'statusBar']);
    expect(settings.pageColors).toEqual({ background: '#FAF9F8', accent: '#0078d4' });
    expect(parseAppConfig({ dataSource: 'demo' }, '').settings).toMatchObject({ without: [], pageColors: {} });
    expect(() => parseAppConfig({ dataSource: 'demo' }, '?without=footer')).toThrow(
      '?without must be one of: "logo", "search", "toolbar", "statusBar".',
    );
  });

  it('offers the high-contrast theme outside Teams too, from config.json or the URL', () => {
    expect(parseAppConfig({ dataSource: 'demo', theme: 'contrast' }, '').settings.theme.automatic).toBe('contrast');
    expect(parseAppConfig({ dataSource: 'demo', theme: 'dark' }, '?theme=contrast').settings.theme.automatic).toBe('contrast');
  });

  describe('the theme', () => {
    const theme = (json: object, search = '', stored: StoredUserSettings = {}) => {
      const { settings } = parseAppConfig({ dataSource: 'demo', ...json }, search, stored);
      return { ...settings.theme, shown: resolveTheme(settings.theme.chosen, settings.theme.automatic) };
    };

    it('follows ?theme=, else config.json, else the system, while the person leaves it on Automatic', () => {
      expect(theme({}).shown).toBe('auto');
      expect(theme({ theme: 'dark' }).shown).toBe('dark');
      expect(theme({ theme: 'dark' }, '?theme=light').shown).toBe('light');
      // ?theme=auto hands the theme back from config.json to the system.
      expect(theme({ theme: 'dark' }, '?theme=auto').shown).toBe('auto');
    });

    it('lets a theme the person chose win over config.json and the address, which Automatic must still stand for', () => {
      expect(theme({ theme: 'light' }, '?theme=contrast', { theme: 'dark' })).toEqual({
        chosen: 'dark',
        automatic: 'contrast',
        shown: 'dark',
      });
      expect(theme({ theme: 'dark' }, '', { theme: 'light' }).shown).toBe('light');
      // What the settings dialog stores is what differs from Automatic, whatever config.json says.
      expect(parseAppConfig({ dataSource: 'demo', theme: 'dark' }, '', { theme: 'light' }).settings.defaults.theme).toBe('auto');
    });
  });

  it('opens in the standard text size unless this browser remembers another, which is no setting of config.json', () => {
    expect(parseAppConfig({ dataSource: 'demo' }, '').settings.textSize).toBe('standard');
    const { textSize, defaults } = parseAppConfig({ dataSource: 'demo' }, '', { textSize: 'larger' }).settings;
    expect(textSize).toBe('larger');
    expect(defaults.textSize).toBe('standard');
    expect(() => parseAppConfig({ dataSource: 'demo', chart: { textSize: 'large' } }, '')).toThrow('Unknown chart.textSize');
  });

  describe('the support desk', () => {
    const desk = (support: unknown, dataSource = 'demo') =>
      parseAppConfig({ dataSource, auth: { tenantId: TENANT, clientId: CLIENT }, support }, '');

    it('links a web page or a mail address that config.json names, in the words it gives or the page\'s own', () => {
      const named = { label: 'Contoso Service Desk', url: 'https://servicedesk.contoso.com/orgchart' };
      expect(desk(named, 'graph').settings.support).toEqual(named);
      // Unlike Change profile photo, demo data keeps it: the desk belongs to no Microsoft account.
      expect(desk({ url: 'mailto:servicedesk@contoso.com?subject=Organization%20chart' }).settings.support).toEqual({
        label: null,
        url: 'mailto:servicedesk@contoso.com?subject=Organization%20chart',
      });
    });

    it('links nothing where config.json names no address', () => {
      expect(parseAppConfig({ dataSource: 'demo' }, '').settings.support).toBeNull();
      expect(desk({}).settings.support).toBeNull();
      expect(desk({ url: '' }).settings.support).toBeNull();
      expect(desk({ url: null, label: '' }).settings.support).toBeNull();
    });

    it('takes only an https or a mailto address, never a script', () => {
      for (const url of [
        'javascript:alert(1)',
        'JavaScript:alert(document.cookie)',
        'http://servicedesk.contoso.com',
        'data:text/html,<script>alert(1)</script>',
        'servicedesk.contoso.com',
        'https://',
        'mailto:',
        'mailto:servicedesk',
        'tel:+4712345678',
      ]) {
        expect(() => desk({ url }), url).toThrow('support.url must be an https:// or mailto: address, or "" to link nothing');
      }
    });

    it('finds the desk for the error screen where config.json is wrong elsewhere, and nothing where the desk itself is wrong', () => {
      const support = { label: 'Service desk', url: 'https://servicedesk.contoso.com' };

      expect(supportDeskIn({ dataSource: 'ldap', support })).toEqual(support);
      expect(supportDeskIn({ support: { url: 'javascript:alert(1)' } })).toBeNull();
      expect(supportDeskIn({ support: { label: 'Service desk' } })).toBeNull();
      expect(supportDeskIn('not an object')).toBeNull();
      expect(supportDeskIn(null)).toBeNull();
    });
  });

  it('reads the organization\'s own fields in config.json\'s order, each searched and exported only where it says so', () => {
    const json = {
      dataSource: 'demo',
      directory: {
        extraFields: [
          { property: 'employeeOrgData.costCenter', label: ' Cost centre ', search: true, export: true },
          { property: 'onPremisesExtensionAttributes.extensionAttribute15', label: 'Badge number', _note: 'Filled in by HR' },
        ],
      },
    };

    expect(parseAppConfig(json, '').settings.extraFields).toEqual([
      { property: 'employeeOrgData.costCenter', label: 'Cost centre', search: true, export: true },
      { property: 'onPremisesExtensionAttributes.extensionAttribute15', label: 'Badge number', search: false, export: false },
    ]);
  });

  it('lets admins keep where people work today out of their details', () => {
    expect(parseAppConfig({ dataSource: 'demo', chart: { showWorkLocation: false } }, '').settings.chart.showWorkLocation).toBe(false);
  });

  it('lets admins keep the local time and working hours, and so the calendar permission\'s Turn on, out of the details', () => {
    expect(parseAppConfig({ dataSource: 'demo', chart: { showWorkingHours: false } }, '').settings.chart.showWorkingHours).toBe(false);
  });

  it('lets admins turn the directory health report off, and leaves the export as it is', () => {
    const config = parseAppConfig({ dataSource: 'demo', reports: { enabled: false } }, '');

    expect(config.settings.allowReports).toBe(false);
    expect(config.settings.allowExport).toBe(true);
  });

  it('lets admins turn the export off and pick the separator Excel expects', () => {
    const config = parseAppConfig({ dataSource: 'demo', export: { enabled: false, csvSeparator: ';' } }, '');

    expect(config.settings.allowExport).toBe(false);
    expect(config.csvSeparator).toBe(';');
  });

  it('opens on the person a shared link names, ignoring a blank one', () => {
    expect(parseAppConfig({ dataSource: 'demo' }, '?person=anna%40contoso.com').settings.initialPerson).toBe('anna@contoso.com');
    expect(parseAppConfig({ dataSource: 'demo' }, '?person=%20').settings.initialPerson).toBeNull();
  });

  it('shows only the teams of top persons named in the URL', () => {
    const { settings } = parseAppConfig({ dataSource: 'demo' }, '?top=head@contoso.com');

    expect(settings.chart.options.hide.unattached).toBe(true);
    expect(parseAppConfig({ dataSource: 'demo' }, '').settings.chart.options.hide.unattached).toBe(false);
  });

  it('narrows the configured chart with URL top persons instead of replacing it', () => {
    const json = { dataSource: 'demo', chart: { topPersons: ['ceo@contoso.com'] } };

    const { options } = parseAppConfig(json, '?top=head@contoso.com').settings.chart;

    expect(options.within?.topPersons).toEqual(['ceo@contoso.com']);
    expect(options.within?.hide.unattached).toBe(false);
  });

  it('opens on the team a link names, by id, UPN or e-mail, apart from the top persons it narrows', () => {
    const json = { dataSource: 'demo', chart: { topPersons: ['ceo@contoso.com'] } };

    const { chart, defaults } = parseAppConfig(json, '?top=head@contoso.com&team=%20lead@contoso.com%20').settings;

    expect(chart.team).toBe('lead@contoso.com');
    expect(chart.options.topPersons).toEqual(['head@contoso.com']);
    expect(chart.options.within?.topPersons).toEqual(['ceo@contoso.com']);
    // What the chart goes back to: config.json has no team.
    expect(defaults.team).toBeNull();
  });

  it('shows everyone where the link names no team, or a blank one', () => {
    for (const search of ['', '?team=', '?team=%20']) {
      expect(parseAppConfig({ dataSource: 'demo' }, search).settings.chart.team).toBeNull();
    }
  });

  it('ignores a blank ?top=', () => {
    const json = { dataSource: 'demo', chart: { topPersons: ['ceo@contoso.com'] } };

    for (const search of ['?top=', '?top=%20', '?top=,;']) {
      const { options } = parseAppConfig(json, search).settings.chart;
      expect(options.topPersons).toEqual(['ceo@contoso.com']);
      expect(options.within).toBeUndefined();
      expect(options.hide.unattached).toBe(false);
    }
  });

  it('lets a link switch single hide rules off and on, on top of config.json', () => {
    const json = { dataSource: 'demo', chart: { hide: { guests: true, disabledAccounts: false } } };

    const { chart, defaults } = parseAppConfig(json, '?show=guests,WITHOUTMANAGER&hide=disabledAccounts').settings;

    expect(chart.options.hide).toMatchObject({ guests: false, withoutManager: false, disabledAccounts: true, unlicensed: true });
    // What the settings dialog resets to stays config.json's, whatever the link says.
    expect(defaults.hide).toMatchObject({ guests: true, withoutManager: true, disabledAccounts: false, unlicensed: true });
    expect(parseAppConfig(json, '?show=&hide=').settings.chart.options.hide).toEqual(defaults.hide);
  });

  it('applies a link\'s hide rules to the chart that URL top persons narrow', () => {
    const json = { dataSource: 'demo', chart: { topPersons: ['ceo@contoso.com'] } };

    const { options } = parseAppConfig(json, '?top=head@contoso.com&show=guests,unattached').settings.chart;

    expect(options.within?.hide).toMatchObject({ guests: false, unattached: false });
    // The narrowed chart keeps to the named people's teams, whatever the link shows.
    expect(options.hide).toMatchObject({ guests: false, unattached: true });
  });

  it('rejects a hide rule it does not know, or one named in both lists, without repeating the link\'s words', () => {
    expect(() => parseAppConfig({ dataSource: 'demo' }, '?show=everyone')).toThrow(
      '?show must be one of: "withoutManager", "withHiddenManager", "inManagerCycle", "disabledAccounts", "guests", "unlicensed", ' +
        '"withoutJobTitle", "hiddenFromAddressList", "unattached".',
    );
    expect(() => parseAppConfig({ dataSource: 'demo' }, '?show=guests&hide=Guests')).toThrow('?show and ?hide both name "guests".');
  });

  it('hides levels unless config.json switches them on, and lets the choice a browser remembers win', () => {
    const on = { dataSource: 'demo', chart: { showLevels: true } };

    expect(parseAppConfig(on, '').settings.chart.showLevels).toBe(true);
    expect(parseAppConfig({ dataSource: 'demo' }, '', { showLevels: true }).settings.chart.showLevels).toBe(true);
    const { chart, defaults } = parseAppConfig(on, '', { showLevels: false }).settings;
    expect(chart.showLevels).toBe(false);
    // What the settings dialog stores is what differs from config.json, whatever the browser remembers.
    expect(defaults.showLevels).toBe(true);
  });

  it('opens at the top unless config.json says where, and lets the choice a browser remembers win', () => {
    expect(parseAppConfig({ dataSource: 'demo' }, '').settings.chart.startAt).toBe('top');
    expect(parseAppConfig({ dataSource: 'demo', chart: { startAt: 'me' } }, '').settings.chart.startAt).toBe('me');
    const { chart, defaults } = parseAppConfig({ dataSource: 'demo', chart: { startAt: 'me' } }, '', { startAt: 'lastView' }).settings;
    expect(chart.startAt).toBe('lastView');
    // What the settings dialog stores is what differs from config.json, whatever the browser remembers.
    expect(defaults.startAt).toBe('me');
  });

  it('sends people to the page config.json names for a new profile photo, or nowhere when it names none', () => {
    const photoUrl = (changePhotoUrl: unknown) =>
      parseAppConfig({ auth: { tenantId: TENANT, clientId: CLIENT }, account: { changePhotoUrl } }, '').settings.changePhotoUrl;

    expect(photoUrl('https://intranet.contoso.com/photo')).toBe('https://intranet.contoso.com/photo');
    expect(photoUrl('')).toBeNull();
    expect(photoUrl(null)).toBeNull();
  });

  it('offers no new profile photo with demo data, whose people have no Microsoft account, yet still checks the address', () => {
    expect(parseAppConfig({ dataSource: 'demo' }, '').settings.changePhotoUrl).toBeNull();
    expect(
      parseAppConfig({ dataSource: 'demo', account: { changePhotoUrl: 'https://intranet.contoso.com/photo' } }, '').settings
        .changePhotoUrl,
    ).toBeNull();
    expect(() => parseAppConfig({ dataSource: 'demo', account: { changePhotoUrl: 'http://intranet' } }, '')).toThrow(
      'account.changePhotoUrl must be an https:// address',
    );
  });

  it('takes only an https address for the profile photo page, never a script', () => {
    for (const value of ['javascript:alert(1)', 'http://intranet.contoso.com', 'myaccount.microsoft.com', 'https://']) {
      expect(() => parseAppConfig({ dataSource: 'demo', account: { changePhotoUrl: value } }, ''), value).toThrow(
        'account.changePhotoUrl must be an https:// address, or "" to offer no link',
      );
    }
    expect(() => parseAppConfig({ dataSource: 'demo', account: { photoUrl: '' } }, '')).toThrow('Unknown account.photoUrl');
  });

  it('rejects unknown URL values instead of silently ignoring them', () => {
    expect(() => parseAppConfig({ dataSource: 'demo' }, '?theme=blue')).toThrow('?theme must be one of: "auto", "light", "dark", "contrast".');
    expect(() => parseAppConfig({ dataSource: 'demo' }, '?depth=-1')).toThrow('?depth must be a whole number');
    expect(() => parseAppConfig({ dataSource: 'demo' }, '?lang=de')).toThrow('?lang must be one of: "auto", "en".');
  });

  describe('the language', () => {
    const automatic = (json: object, search = '', languages: readonly string[] = []) =>
      parseAppConfig({ dataSource: 'demo', ...json }, search, {}, languages).settings.language.automatic;

    it('follows the host and then the browser, and English where it speaks none of theirs', () => {
      expect(automatic({}, '', ['de-DE', 'en-GB'])).toBe('en');
      expect(automatic({}, '', ['sv-SE', 'de'])).toBe('en');
    });

    it('lets config.json set it for everyone, and ?lang= for the page, in any letter case', () => {
      expect(automatic({ language: 'en' }, '', ['de-DE'])).toBe('en');
      expect(automatic({ language: 'auto' }, '?lang=EN', ['de-DE'])).toBe('en');
      // ?lang=auto hands the choice back from config.json to the host and the browser.
      expect(automatic({ language: 'en' }, '?lang=auto', ['sv-SE'])).toBe('en');
    });

    it('keeps the choice the browser remembers apart, as it wins over the page but Automatic must still mean the page\'s', () => {
      const { language, defaults } = parseAppConfig({ dataSource: 'demo' }, '?lang=auto', { language: 'en' }, ['de-DE']).settings;

      expect(language).toEqual({ chosen: 'en', automatic: 'en' });
      expect(defaults.language).toBe('auto');
    });
  });

  it('accepts keys starting with _ as notes', () => {
    expect(() => parseAppConfig({ dataSource: 'demo', _note: 'CEOs from HR', chart: { _why: 'x' } }, '')).not.toThrow();
  });

  describe('in a browser', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('rejects a branding colour the browser does not understand, naming the key', () => {
      vi.stubGlobal('CSS', { supports: (_property: string, value: string) => value.startsWith('#') });

      expect(() => parseAppConfig({ dataSource: 'demo', branding: { colors: { accent: '0f6cbd' } } }, '')).toThrow(
        'branding.colors.accent must be a CSS colour',
      );
      expect(parseAppConfig({ dataSource: 'demo', branding: { darkColors: { accent: '#479ef5' } } }, '').settings.branding.darkColors).toEqual({
        accent: '#479ef5',
      });
    });

    it("rejects a page colour the browser does not understand, without repeating the link's words", () => {
      vi.stubGlobal('CSS', { supports: (_property: string, value: string) => value.startsWith('#') });

      expect(() => parseAppConfig({ dataSource: 'demo' }, '?accent=not-a-colour')).toThrow(
        /^\?accent must be a CSS colour such as "#0f548c"\.$/,
      );
      expect(parseAppConfig({ dataSource: 'demo' }, '?accent=0f548c').settings.pageColors).toEqual({ accent: '#0f548c' });
    });

    it('opens with what the browser remembers of the person\'s own settings', () => {
      vi.stubGlobal('localStorage', {
        getItem: () => '{"showLevels":true,"language":"en","startAt":"me","theme":"contrast","textSize":"large"}',
      });

      const { settings } = parseAppConfig({ dataSource: 'demo', theme: 'light' }, '', readStoredUserSettings());

      expect(settings.chart.showLevels).toBe(true);
      expect(settings.defaults.showLevels).toBe(false);
      expect(settings.language.chosen).toBe('en');
      expect(settings.chart.startAt).toBe('me');
      expect(settings.theme).toEqual({ chosen: 'contrast', automatic: 'light' });
      expect(settings.textSize).toBe('large');
    });

    it('hands over config.json as it stands, and says why when it cannot', async () => {
      vi.stubGlobal('fetch', () => Promise.resolve(new Response('{ "dataSource": "demo" }')));
      await expect(fetchAppConfig()).resolves.toEqual({ dataSource: 'demo' });

      vi.stubGlobal('fetch', () => Promise.resolve(new Response('{ "dataSource": ', { status: 200 })));
      await expect(fetchAppConfig()).rejects.toThrow('config.json is not valid JSON.');

      vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 404 })));
      await expect(fetchAppConfig()).rejects.toThrow('Could not load config.json (HTTP 404).');
    });
  });
});
