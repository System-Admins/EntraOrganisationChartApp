import { ErrorCode, pages, people } from '@microsoft/teams-js';
import type { PeoplePicker, PickedPerson } from '@/application/abstractions/peoplePicker';
import { MAX_EXPAND_DEPTH } from '@/application/settings/appSettings';
import type { TabSetup } from '@/application/settings/tabSetup';
import { splitList } from '@/domain/text/splitList';
import { parseInteger } from '../config/configReader';

const TAB_ENTITY_ID = 'orgchart';

/** A new tab shows the whole organization, unfolded as config.json says. */
const NEW_TAB: TabSetup = { topPersons: [], depth: null };

/** Teams calls the save handler, so the setup is read then. Returns what the page reports each setup to; null withholds Save. */
export function registerTabConfiguration(displayName: string): (setup: TabSetup | null) => void {
  let current: TabSetup | null = null;
  pages.config.registerOnSaveHandler((saveEvent) => {
    // Teams offers Save only while the validity state is true, so this is a host that pressed it all the same.
    if (!current) {
      saveEvent.notifyFailure('The tab has no setup that can be saved.');
      return;
    }
    pages.config.setConfig({ entityId: TAB_ENTITY_ID, suggestedDisplayName: displayName, ...buildTabUrls(current) }).then(
      () => {
        saveEvent.notifySuccess();
      },
      (error: unknown) => {
        saveEvent.notifyFailure(error instanceof Error ? error.message : String(error));
      },
    );
  });
  return (setup) => {
    current = setup;
    pages.config.setValidityState(setup !== null);
  };
}

/** A tab limited to given top persons shows only their hierarchies, unfolded `depth` levels (see applyUrlOverrides). */
function buildTabUrls({ topPersons, depth }: TabSetup): { contentUrl: string; websiteUrl: string } {
  const website = new URL('/', window.location.origin);
  if (topPersons.length > 0) website.searchParams.set('top', topPersons.join(','));
  if (depth !== null) website.searchParams.set('depth', String(depth));
  const content = new URL(website);
  content.searchParams.set('host', 'teams');
  return { contentUrl: content.href, websiteUrl: website.href };
}

/** The setup of the tab being edited, or a new tab's, so that saving unchanged settings keeps what the tab shows. */
export async function currentTabSetup(): Promise<TabSetup> {
  try {
    const { contentUrl } = await pages.getConfig();
    if (!contentUrl) return NEW_TAB;
    const parameters = new URL(contentUrl).searchParams;
    return { topPersons: splitList(parameters.get('top') ?? ''), depth: depthIn(parameters.get('depth')) };
  } catch {
    return NEW_TAB;
  }
}

/** As applyUrlOverrides reads ?depth=; one it would refuse leaves the depth to config.json, as a new tab does. */
function depthIn(value: string | null): number | null {
  if (value === null) return null;
  try {
    return parseInteger(value, 0, MAX_EXPAND_DEPTH, '?depth');
  } catch {
    return null;
  }
}

/** Teams' own people picker, which Outlook and microsoft365.com don't have. */
export function teamsPeoplePicker(): PeoplePicker | null {
  return people.isSupported() ? { pick: pickPeople } : null;
}

/** Organization-wide also in a channel's or chat's tab, as the people at the top of a department are seldom all its members. */
async function pickPeople(chosenIds: readonly string[]): Promise<readonly PickedPerson[] | null> {
  try {
    const picked = await people.selectPeople({ openOrgWideSearchInChatOrChannel: true, setSelected: [...chosenIds] });
    return picked.map(toPickedPerson);
  } catch (error) {
    const code = errorCodeOf(error);
    if (code === ErrorCode.USER_ABORT) return null;
    throw new Error(`Teams could not show its people picker${code === null ? '' : ` (error ${code})`}.`, { cause: error });
  }
}

/** TeamsJS rejects with SdkError objects rather than Errors. */
function errorCodeOf(error: unknown): number | null {
  return typeof error === 'object' && error !== null && 'errorCode' in error && typeof error.errorCode === 'number'
    ? error.errorCode
    : null;
}

/** By e-mail address where Teams gives one, as people type them and the Link button names people; else by object id. */
function toPickedPerson({ objectId, displayName, email }: people.PeoplePickerResult): PickedPerson {
  return { id: objectId, identifier: email?.trim() || objectId, displayName: displayName?.trim() || null };
}
