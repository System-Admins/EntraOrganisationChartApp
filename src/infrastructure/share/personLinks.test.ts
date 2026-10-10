import { describe, expect, it } from 'vitest';
import { makeEmployee } from '@/testing/makeEmployee';
import { embedLink, teamsPersonLink, webPersonLink } from './personLinks';

describe('webPersonLink', () => {
  it('keeps ?top= and drops what belongs to the current viewer or host', () => {
    const current = new URL('https://chart.contoso.com/?host=teams&top=ceo@contoso.com&depth=3&theme=dark&person=old');

    expect(webPersonLink(makeEmployee('anna'), current)).toBe(
      'https://chart.contoso.com/?top=ceo%40contoso.com&person=anna%40contoso.com',
    );
  });

  it('keeps the hide rules a link switched, without which the person might not be in the chart', () => {
    const current = new URL('https://chart.contoso.com/?hide=guests&show=withoutManager');

    expect(webPersonLink(makeEmployee('anna'), current)).toBe(
      'https://chart.contoso.com/?show=withoutManager&hide=guests&person=anna%40contoso.com',
    );
  });

  it('keeps the team the chart shows alone, beside the top persons it narrows', () => {
    const current = new URL('https://chart.contoso.com/?top=ceo@contoso.com&depth=2&team=lead@contoso.com');

    expect(webPersonLink(makeEmployee('anna'), current)).toBe(
      'https://chart.contoso.com/?top=ceo%40contoso.com&team=lead%40contoso.com&person=anna%40contoso.com',
    );
  });

  it('names the person by e-mail, or by UPN when they have no mailbox', () => {
    const anna = makeEmployee('anna', null, { mail: null, userPrincipalName: 'anna@contoso.onmicrosoft.com' });

    const link = new URL(webPersonLink(anna, new URL('https://chart.contoso.com/')));

    expect(link.searchParams.get('person')).toBe('anna@contoso.onmicrosoft.com');
  });
});

describe('embedLink', () => {
  it('keeps only what decides who is in the chart, so nobody\'s details open and the host and the viewer\'s choices stay out', () => {
    const current = new URL(
      'https://chart.contoso.com/?host=teams&view=tab-config&top=ceo@contoso.com&depth=3&team=lead@contoso.com' +
        '&theme=dark&lang=en&show=guests&person=anna@contoso.com&hide=unlicensed',
    );

    expect(embedLink(current)).toBe(
      'https://chart.contoso.com/?top=ceo@contoso.com&team=lead@contoso.com&show=guests&hide=unlicensed',
    );
  });

  it('keeps the page and leaves @ and commas readable, escaping only what would break the address', () => {
    const current = new URL('https://contoso.com/orgchart/?top=r%26d%40contoso.com,anna%40contoso.com&person=anna%40contoso.com');

    expect(embedLink(current)).toBe('https://contoso.com/orgchart/?top=r%26d@contoso.com,anna@contoso.com');
  });

  it('is the plain address of the chart where nothing narrows it', () => {
    expect(embedLink(new URL('https://chart.contoso.com/?person=anna@contoso.com&depth=2'))).toBe('https://chart.contoso.com/');
  });
});

describe('teamsPersonLink', () => {
  it('opens the personal tab with the person as sub-entity, percent-encoding every value', () => {
    const anna = makeEmployee('anna', null, { displayName: 'Anna Lund' });

    const link = teamsPersonLink('app-id', anna, 'https://chart.contoso.com/?person=anna%40contoso.com');

    expect(link).toBe(
      'https://teams.microsoft.com/l/entity/app-id/orgchart' +
        '?webUrl=https%3A%2F%2Fchart.contoso.com%2F%3Fperson%3Danna%2540contoso.com' +
        '&label=Anna%20Lund' +
        '&context=%7B%22subEntityId%22%3A%22anna%22%7D',
    );
  });
});
