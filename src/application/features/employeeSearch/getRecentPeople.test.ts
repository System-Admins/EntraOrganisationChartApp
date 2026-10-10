import { describe, expect, it } from 'vitest';
import type { DirectorySnapshot } from '@/application/abstractions/employeeDirectory';
import type { RecentPeopleStore } from '@/application/abstractions/recentPeopleStore';
import type { SignedInUser } from '@/application/abstractions/signedInUser';
import type { Employee } from '@/domain/employees/employee';
import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import { directoryOf } from '@/testing/directory';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import type { RequestHandler } from '../../common/mediator';
import { OrgChartProvider } from '../../common/orgChartProvider';
import { ClearRecentPeopleCommand, ClearRecentPeopleHandler } from './clearRecentPeople';
import { GetRecentPeopleHandler, GetRecentPeopleQuery } from './getRecentPeople';
import { RememberPersonCommand, RememberPersonHandler } from './rememberPerson';

/** A store in memory, newest first, as the browser's keeps them. */
function storeOf(ids: readonly string[] = []): RecentPeopleStore & { readonly ids: string[] } {
  const store = {
    ids: [...ids],
    list: () => store.ids,
    remember: (id: string) => {
      store.ids = [id, ...store.ids.filter((other) => other !== id)];
    },
    clear: () => {
      store.ids = [];
    },
    forget: () => Promise.resolve(),
  };
  return store;
}

const LEAD: SignedInUser = { id: 'lead', displayName: 'Lead', userPrincipalName: 'lead@contoso.com', isGuest: false };

function askWith(employees: readonly Employee[], user: SignedInUser | null, store: RecentPeopleStore) {
  const snapshot: DirectorySnapshot = { employees, loadedAt: new Date(2026, 9, 1) };
  const handler = new GetRecentPeopleHandler(new OrgChartProvider(directoryOf(() => snapshot)), { getSignedInUser: () => user }, store);
  return (options: OrgChartOptions) => handler.handle(new GetRecentPeopleQuery(options));
}

describe('GetRecentPeopleHandler', () => {
  const company = [
    makeEmployee('ceo'),
    makeEmployee('director', 'ceo'),
    makeEmployee('lead', 'director'),
    makeEmployee('dev', 'lead'),
    makeEmployee('aide', 'ceo'),
    makeEmployee('guest', 'ceo', { isGuest: true }),
  ];
  const everyone: OrgChartOptions = { topPersons: ['ceo'], hide: SHOW_EVERYONE };

  it('offers the signed-in user and their manager, then the people opened lately, as search hits', async () => {
    const ask = askWith(company, LEAD, storeOf(['aide', 'dev']));

    const offered = await ask(everyone);

    expect(offered.you).toMatchObject({ employee: { id: 'lead' }, path: ['ceo', 'director'], managerName: 'Director', matchedFields: [] });
    expect(offered.yourManager).toMatchObject({ employee: { id: 'director' }, path: ['ceo'], managerName: 'Ceo' });
    expect(offered.recent.map((hit) => hit.employee.id)).toEqual(['aide', 'dev']);
    expect(offered.recent[1]).toMatchObject({ path: ['ceo', 'director', 'lead'], managerName: 'Lead' });
  });

  it('leaves out of the recent people whoever is offered above, and whoever the chart does not show', async () => {
    const ask = askWith(company, LEAD, storeOf(['director', 'guest', 'gone', 'lead', 'aide']));

    const offered = await ask({ topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, guests: true } });

    expect(offered.recent.map((hit) => hit.employee.id)).toEqual(['aide']);
  });

  it('offers nobody the address list hides while its rule is on: not as the manager, not among the recent people, and not their place', async () => {
    const hidden = company.map((employee) => (['director', 'aide'].includes(employee.id) ? { ...employee, hiddenFromAddressList: true } : employee));
    const ask = askWith(hidden, LEAD, storeOf(['aide', 'director', 'dev']));

    const offered = await ask({ topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, hiddenFromAddressList: true } });

    expect(offered.you).toMatchObject({ employee: { id: 'lead' }, path: ['ceo', 'director'], managerName: null });
    expect(offered.yourManager).toBeNull();
    expect(offered.recent.map((hit) => hit.employee.id)).toEqual(['dev']);
  });

  it('offers only the people of the team the chart shows alone', async () => {
    const ask = askWith(company, LEAD, storeOf(['aide', 'dev']));

    const offered = await ask({ topPersons: ['director'], hide: { ...SHOW_EVERYONE, unattached: true }, within: everyone });

    expect(offered.recent.map((hit) => hit.employee.id)).toEqual(['dev']);
    expect(offered.yourManager?.path).toEqual([]);
  });

  it('offers the manager of a user whom the chart leaves out, as the directory records them', async () => {
    const guest: SignedInUser = { id: 'guest', displayName: 'Guest', userPrincipalName: 'guest@contoso.com', isGuest: true };
    const ask = askWith(company, guest, storeOf());

    const offered = await ask({ topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, guests: true } });

    expect(offered.you).toBeNull();
    expect(offered.yourManager?.employee.id).toBe('ceo');
  });

  it('offers no one in particular where nobody is signed in, nor a manager to someone without one', async () => {
    expect(await askWith(company, null, storeOf(['dev']))(everyone)).toMatchObject({ you: null, yourManager: null });

    const ceo: SignedInUser = { id: 'ceo', displayName: 'Ceo', userPrincipalName: 'ceo@contoso.com', isGuest: false };
    const offered = await askWith(company, ceo, storeOf())(everyone);
    expect(offered.you?.employee.id).toBe('ceo');
    expect(offered.yourManager).toBeNull();
  });
});

describe('RememberPersonHandler and ClearRecentPeopleHandler', () => {
  it('put a person opened first, and clear the list', async () => {
    const store = storeOf(['aide']);

    await new RememberPersonHandler(store).handle(new RememberPersonCommand('dev'));
    expect(store.ids).toEqual(['dev', 'aide']);

    const clear: RequestHandler<ClearRecentPeopleCommand> = new ClearRecentPeopleHandler(store);
    await clear.handle(new ClearRecentPeopleCommand());
    expect(store.ids).toEqual([]);
  });
});
