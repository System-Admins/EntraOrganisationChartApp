import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { SignInRequiredError } from '@/application/abstractions/authenticator';
import type { HostLifecycle } from '@/application/abstractions/hostLifecycle';
import { ForgetBrowserCopyCommand } from '@/application/features/authentication/forgetBrowserCopy';
import { SignOutCommand } from '@/application/features/authentication/signOut';
import { ForgetViewCommand } from '@/application/features/chartView/forgetView';
import { GetSavedViewQuery } from '@/application/features/chartView/getSavedView';
import { SaveViewCommand } from '@/application/features/chartView/saveView';
import { GetRulesShowingQuery } from '@/application/features/dataQuality/getRulesShowing';
import { GetDiagnosticsQuery } from '@/application/features/diagnostics/getDiagnostics';
import { RememberPersonCommand } from '@/application/features/employeeSearch/rememberPerson';
import type { EmployeeSearchHit } from '@/application/features/employeeSearch/searchEmployees';
import { TrackOpenLayersCommand } from '@/application/features/navigation/trackOpenLayers';
import { GetFilterEffectsQuery } from '@/application/features/orgChart/getFilterEffects';
import { GetEmbedAddressQuery } from '@/application/features/share/getEmbedAddress';
import type { AppSettings } from '@/application/settings/appSettings';
import type { HostKind } from '@/application/settings/hostKind';
import type { Language } from '@/application/settings/language';
import type { Employee } from '@/domain/employees/employee';
import { resolveEmployees } from '@/domain/employees/resolveEmployees';
import { departmentPath, type DepartmentNode } from '@/domain/orgChart/departmentTree';
import type { HideRules } from '@/domain/orgChart/hideRules';
import { namedEmployee, narrowsChart, narrowTo, withHideRules, type OrgChart } from '@/domain/orgChart/orgChart';
import type { TeamShareFilter } from '@/domain/orgChart/teamSummary';
import { Brand } from '../../app/Brand';
import { classNames } from '../../shared/classNames';
import { DisplayOptionsProvider } from '../../shared/displayOptions';
import { describeError, errorDetail, pointsToSupport } from '../../shared/errors';
import { IconButton } from '../../shared/IconButton';
import { formatPeople } from '../../shared/formatPeople';
import { useLanguage, useLanguageRef, useStrings } from '../../shared/languageContext';
import { useMediator } from '../../shared/mediatorContext';
import { Panel } from '../../shared/Panel';
import { SupportLink } from '../../shared/SupportLink';
import { useAnnouncer } from '../../shared/useAnnouncer';
import { useQuery } from '../../shared/useQuery';
import { useRovingTabIndex } from '../../shared/useRovingTabIndex';
import { useTooltip } from '../../shared/useTooltip';
import { chartTitle } from '../../theme/branding';
import { SignInPrompt } from '../authentication/SignInPrompt';
import { UserProfile } from '../authentication/UserProfile';
import { useSignedInUser } from '../authentication/useSignedInUser';
import { DirectoryHealthDialog } from '../dataQuality/DirectoryHealthDialog';
import { DepartmentCanvas } from '../departments/DepartmentCanvas';
import { isDepartmentShown, planDepartmentExpandAll } from '../departments/departmentPlans';
import { departmentRowIn, departmentsOf, NO_DEPARTMENT } from '../departments/departmentsOf';
import { DepartmentsPanel } from '../departments/DepartmentsPanel';
import { keptTrail, nextTrail } from '../departments/departmentTrail';
import { DepartmentView, type DepartmentBack } from '../departments/DepartmentView';
import { DEPARTMENT_STRINGS } from '../departments/strings';
import { DETAILS_PANEL_ID } from '../employeeDetails/detailsPanelId';
import { EmployeeDetailsPanel } from '../employeeDetails/EmployeeDetailsPanel';
import { useExport } from '../export/useExport';
import { HelpDialog } from '../help/HelpDialog';
import type { PeopleLayout } from '../peopleList/PeopleList';
import { usePrint } from '../print/printContext';
import { SearchBox, type SearchBoxHandle } from '../search/SearchBox';
import { SearchResults } from '../search/SearchResults';
import { AccountSettings } from '../settings/AccountSettings';
import { DisplaySettings } from '../settings/DisplaySettings';
import { describeFilterChanges } from '../settings/describeFilterChanges';
import { EmbedSettings } from '../settings/EmbedSettings';
import { FilterSettings } from '../settings/FilterSettings';
import { ReportsSettings } from '../settings/ReportsSettings';
import { SettingsDialog } from '../settings/SettingsDialog';
import { useUserSettings } from '../settings/userSettingsContext';
import { TeamView } from '../teamView/TeamView';
import { ChartViewStore } from './chartViewStore';
import { describeProgress } from './directoryProgress';
import { initialExpandDepth, planExpandAll } from './expansionPlan';
import { ModeBar } from './ModeBar';
import { OrgChartCanvas } from './OrgChartCanvas';
import styles from './OrgChartPage.module.css';
import { ProgressBar } from './ProgressBar';
import { StatusBar } from './StatusBar';
import { PAGE_STRINGS } from './strings';
import { TeamBar } from './TeamBar';
import { isOutline } from './treeCanvas';
import { findTreeItem, revealTargetOf, type RevealTarget } from './treeItems';
import { useOrgChartData } from './useOrgChartData';
import { useZoom } from './useZoom';

interface OrgChartPageProps {
  readonly settings: AppSettings;
  readonly host: HostKind;
  readonly canSignOut: boolean;
  /** Forget this browser's copy, where Sign out is not offered and the chart keeps a copy of Graph's directory. */
  readonly canForget: boolean;
  /** The build's, for Help > About this chart. */
  readonly version: string;
  /** What the host says of the page's life: Teams suspends it, and may resume it hours later. */
  readonly lifecycle: HostLifecycle;
}

/** How long the view waits after a change before it is saved for the next visit; leaving the page saves it at once. */
const SAVE_VIEW_DELAY_MS = 1000;

/** A notice in the status bar until the next one, or an action that clears it. */
interface Notice {
  /** Found in the language of the moment, so that a notice still on screen follows a change of language. */
  readonly words: (language: Language) => string;
  /** Whether the words send people to their IT support, whose desk then follows them (pointsToSupport). */
  readonly support: boolean;
}

/** A change of team, which waits for the chart built for it: `from` is the chart on screen when it was asked for. */
interface TeamChange {
  /** 'narrow' opens `headId`'s team, 'widen' reveals the former head `headId` among everyone, 'restart' is the logo's. */
  readonly kind: 'narrow' | 'widen' | 'restart';
  readonly headId: string | null;
  readonly from: OrgChart;
}

/** Show in chart from the directory health report, with filters that hide the person: it waits for the chart built with those that show them. */
interface FilteredReveal {
  readonly id: string;
  /** The person's name, for a notice where the new chart still leaves them out. */
  readonly name: string;
  /** The chart on screen when it was asked for. */
  readonly from: OrgChart;
  /** The hide rules before and after, whose difference the page announces. */
  readonly before: HideRules;
  readonly after: HideRules;
}

/** Where a trail of departments started, which Back returns to once it has walked the trail back. */
type DepartmentBase = { readonly kind: 'panel' } | { readonly kind: 'details'; readonly personId: string };

/** A list in the side panel, in place of the details: every match of a search, the whole team of the selected manager, or the departments. */
type SideList =
  | {
      readonly kind: 'results';
      readonly term: string;
      /** Counts Show all's presses, so that each one opens the list afresh and moves the focus into it. */
      readonly opening: number;
    }
  /** `filter` for the team's people in one department or city, from its row in the Team section. */
  | { readonly kind: 'team'; readonly managerId: string; readonly filter: TeamShareFilter | null }
  /** `opening` counts the toolbar's presses, as Show all's are; `returnTo` is the row that takes the focus as Back returns to the panel. */
  | { readonly kind: 'departments'; readonly opening: number; readonly returnTo: string | null }
  /** A department's people, the last of `trail`, each department of which was opened from the one before. */
  | { readonly kind: 'department'; readonly base: DepartmentBase; readonly trail: readonly string[]; readonly returnTo: string | null };

export function OrgChartPage({ settings, host, canSignOut, canForget, version, lifecycle }: OrgChartPageProps) {
  const [userSettings, changeUserSettings] = useUserSettings();
  const language = useLanguage();
  // An export or a sign-out can end after a change of language, and its outcome is said in the new one.
  const languageRef = useLanguageRef();
  const t = useStrings(PAGE_STRINGS);
  const dt = useStrings(DEPARTMENT_STRINGS);
  const { team } = userSettings;
  const options = useMemo(() => {
    const chosen = team === null ? settings.chart.options : narrowTo(settings.chart.options, team);
    return withHideRules(chosen, userSettings.hide);
  }, [settings.chart.options, team, userSettings.hide]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [store] = useState(() => new ChartViewStore(settings.chart.expandDepth));
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const { region, announce } = useAnnouncer();
  const { result, error, progress, isRefreshing, refreshError, refresh, reload, revisit } = useOrgChartData(options, announce);
  const zoom = useZoom(viewport);
  const { print, preparing: preparingPrint, opensBrowser: printOpensBrowser } = usePrint();
  const { exportToCsv, exporting, progress: exportProgress } = useExport(options);
  const mediator = useMediator();
  const toolbar = useRovingTabIndex();
  const mainId = useId();
  const search = useRef<SearchBoxHandle>(null);
  const chart = result?.chart;
  const hasPeople = chart !== undefined && chart.rootIds.length > 0;
  // The team of the chart on screen, which lags behind the setting until the chart built for that arrives.
  const [shown, setShown] = useState({ chart, team });
  if (shown.chart !== chart) setShown({ chart, team });
  // The top person of the team that the chart on screen shows alone; null where it shows everyone, or misses them.
  const teamHeadId = shown.team === null || !chart ? null : teamHeadIn(chart, shown.team);
  const teamChange = useRef<TeamChange | null>(null);
  const filteredReveal = useRef<FilteredReveal | null>(null);
  // Set as the logo leads to "/", which opens afresh, so that this page saves no view on its way out.
  const leavingForStart = useRef(false);
  const { user: signedInUser, isLoading: signedInUserLoading } = useSignedInUser(chart !== undefined);
  // Only while Settings is open, as it builds the chart once per filter, and again for every chart, such as a refreshed one.
  const filterEffectsQuery = useMemo(
    () => (settingsOpen && chart ? new GetFilterEffectsQuery(options) : null),
    [settingsOpen, chart, options],
  );
  const { data: filterEffects } = useQuery(filterEffectsQuery);
  // Asked as Help opens, and again for every chart, as a refresh changes what it says.
  const diagnosticsQuery = useMemo(
    () => (helpOpen && chart ? new GetDiagnosticsQuery(options) : null),
    [helpOpen, chart, options],
  );
  const { data: diagnostics } = useQuery(diagnosticsQuery);
  // Teams and other pages' iframes have addresses of their own; asked again for every change, as the code holds the filters and the team.
  const embedAddressQuery = useMemo(
    () => (settingsOpen && host === 'standalone' ? new GetEmbedAddressQuery(userSettings) : null),
    [settingsOpen, host, userSettings],
  );
  const { data: embedAddress } = useQuery(embedAddressQuery);
  // Teams and other pages' iframes hold their setup in their address and own the Microsoft sign-in.
  const embedded = host !== 'standalone';
  // Teams shows the app's own name and icon, so the header keeps no logo or title there (the owner's choice), nor the logo's restart.
  const showsBrand = host !== 'teams' && !settings.without.includes('logo');
  const showsSearch = !settings.without.includes('search');
  const showsToolbar = !settings.without.includes('toolbar');
  const showsHeader = showsBrand || showsSearch || showsToolbar;
  // Without a header, a bare block holds its live regions and keeps the page's first row.
  const Banner = showsHeader ? 'header' : 'div';
  const offersSignOut = canSignOut && !(error instanceof SignInRequiredError);
  const zoomPercent = Math.round(zoom.zoom * 100);
  // The zoom is said when it changes; a change of language only empties the region, which screen readers leave unsaid.
  const [zoomStatus, setZoomStatus] = useState({ percent: zoomPercent, language, said: true });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the language can change once LANGUAGES has two
  if (zoomStatus.percent !== zoomPercent || zoomStatus.language !== language) {
    setZoomStatus({ percent: zoomPercent, language, said: zoomStatus.percent !== zoomPercent });
  }
  const resetZoomTooltip = useTooltip(t.toolbar.resetZoom, !chart);
  const { initialPerson } = settings;
  const linkedPerson = useMemo(
    () => (chart && initialPerson ? findPerson(chart, initialPerson) : null),
    [chart, initialPerson],
  );
  // Asked once, for the chart as it opens; a link to a person always comes first, so then nothing is asked.
  const [savedViewQuery] = useState(() => (initialPerson === null ? new GetSavedViewQuery(options, userSettings.startAt) : null));
  const { data: savedView, isLoading: savedViewLoading } = useQuery(savedViewQuery);
  // initialExpandDepth walks the whole chart, so it only runs until the store has started.
  if (chart && !store.hasStarted) {
    const depth = initialExpandDepth(chart, settings.chart.expandDepth);
    const startsAtMe = userSettings.startAt === 'me';
    // The saved view takes a moment's read of the browser's storage, and one's own card waits for the account as well.
    if (initialPerson !== null) store.startFrom(depth, linkedPerson);
    else if (savedView) store.restore(savedView, chart);
    else if (!savedViewLoading && !(startsAtMe && signedInUserLoading)) {
      const me = startsAtMe && signedInUser && namedEmployee(chart, signedInUser.id) ? signedInUser.id : null;
      store.startFrom(depth, me === null ? null : revealTargetOf(chart, me));
    }
  }
  // Until then the loading panel stays, as a chart shown at the top would jump to where it opens.
  const started = store.hasStarted;
  const selectedId = useSyncExternalStore(store.subscribe, () => store.selectedId);
  const [sideList, setSideList] = useState<SideList | null>(null);
  const departments = chart ? departmentsOf(chart) : null;
  // The results and the departments belong to nobody, a team to its manager and a department opened from the details to that person: anyone else selected, by a row, a card or a search, brings back the details.
  const listOwner =
    sideList?.kind === 'team'
      ? sideList.managerId
      : sideList?.kind === 'department' && sideList.base.kind === 'details'
        ? sideList.base.personId
        : null;
  if (sideList && (selectedId !== listOwner || (listOwner !== null && !(chart && namedEmployee(chart, listOwner))))) setSideList(null);
  else if (sideList?.kind === 'department' && departments) {
    // A refresh or other filters can take departments away: the trail ends before the first, and goes back where it started without any.
    const kept = keptTrail(departments, sideList.trail);
    if (kept.length > 0 && kept.length < sideList.trail.length) setSideList({ ...sideList, trail: kept, returnTo: null });
    else if (kept.length === 0) setSideList(sideList.base.kind === 'panel' ? { kind: 'departments', opening: 0, returnTo: null } : null);
  }
  // Folded or unfolded by hand in the departments panel, kept while the page is open.
  const [departmentFolds, setDepartmentFolds] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const departmentsButton = useRef<HTMLButtonElement>(null);
  // The departments in the chart's place, entered from the departments panel; never saved, nor in the address.
  const [chartView, setChartView] = useState<'people' | 'departments'>('people');
  const showsDepartments = chartView === 'departments' && departments !== null;
  // The departments' own folding, selection and card in the tab order, by id, as `store` keeps people's.
  const [departmentStore] = useState(() => new ChartViewStore(1));
  const selectedDepartment = useSyncExternalStore(departmentStore.subscribe, () => departmentStore.selectedId);
  // A card picked in the chart of departments brings up its department in place of any list, as a person's card brings up their details.
  const [pickedDepartment, setPickedDepartment] = useState<string | null>(null);
  if (selectedDepartment !== pickedDepartment) {
    setPickedDepartment(selectedDepartment);
    if (selectedDepartment !== null) setSideList(null);
  }
  // Set as the chart switches between people and departments, for the layout effect that moves the focus and says so.
  const modeChange = useRef<'departments' | 'people' | null>(null);
  // Anything about a person opens them in the people chart: a search pick, a list's row, Show me.
  const leaveDepartments = useCallback(() => {
    departmentStore.select(null);
    setChartView('people');
  }, [departmentStore]);
  // The person a list's row opened, whose details then take the focus in the sheet, as the row was in the sheet too.
  const [openedFromList, setOpenedFromList] = useState<string | null>(null);
  if (openedFromList !== null && openedFromList !== selectedId) setOpenedFromList(null);
  // Kept from team to team while the page is open.
  const [teamLayout, setTeamLayout] = useState<PeopleLayout>('list');
  const seeTeamButton = useRef<HTMLButtonElement>(null);
  // The department's or city's row that opened the team list: the details show it again, unfolded if need be, as Back returns to them.
  const [openedShare, setOpenedShare] = useState<{ readonly managerId: string; readonly filter: TeamShareFilter } | null>(null);
  if (openedShare !== null && openedShare.managerId !== selectedId) setOpenedShare(null);

  // Other filters, or a refresh, can take the selected person out of the chart, and the item in the tab order out of the tree.
  useEffect(() => {
    if (chart) store.retain(chart);
  }, [store, chart]);

  // The same for the departments, which they can take away with the card selected or in the tab order.
  useEffect(() => {
    if (!departments) return;
    const unfolded = ({ id, depth }: DepartmentNode) => departmentStore.isExpanded(id, depth);
    departmentStore.retainWhere(
      (id) => departments.nodes.has(id),
      (id) => isDepartmentShown(departments, unfolded, id),
    );
  }, [departmentStore, departments]);

  // Before the paint, once the canvas that takes the chart's place has rendered: the focus lost with what switched goes to its tree.
  useLayoutEffect(() => {
    const change = modeChange.current;
    if (change === null) return;
    modeChange.current = null;
    zoom.restart();
    if (document.activeElement === document.body) cardInTabOrder(document.getElementById(mainId))?.focus({ preventScroll: true });
    const texts = DEPARTMENT_STRINGS[languageRef.current];
    announce(change === 'departments' ? texts.showing(departments?.nodes.size ?? 0) : texts.showingPeople);
  }, [chartView, departments, zoom, mainId, announce, languageRef]);

  // Announces a selection unless the panel took the focus itself, which screen readers report on their own.
  useEffect(() => {
    let announcedId = store.selectedId;
    let frame = 0;
    const unsubscribe = store.subscribe(() => {
      const id = store.selectedId;
      if (id === announcedId) return;
      announcedId = id;
      cancelAnimationFrame(frame);
      const person = id === null || !chart ? undefined : namedEmployee(chart, id);
      if (!person) return;
      // A frame on, the panel has rendered and its effects have moved the focus, if they were going to.
      frame = requestAnimationFrame(() => {
        if (document.getElementById(DETAILS_PANEL_ID)?.contains(document.activeElement)) return;
        announce(t.detailsShown(person.displayName));
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [store, chart, announce, t]);

  // Search offers the people opened lately, however they were opened.
  useEffect(() => {
    if (selectedId !== null) mediator.send(new RememberPersonCommand(selectedId)).catch(() => undefined);
  }, [mediator, selectedId]);

  // Where the person is, for the next visit: a moment after each change, and at once as the page goes or the host suspends it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(timer);
      timer = undefined;
      // Before the chart has started there is no view yet, and saving one would replace the view it may still open with.
      if (!store.hasStarted || leavingForStart.current) return;
      mediator.send(new SaveViewCommand(options, store.toSnapshot())).catch(() => undefined);
    };
    const saveSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(save, SAVE_VIEW_DELAY_MS);
    };
    // Back from "/" can bring this very page back from the browser's back/forward cache, which then saves its view again.
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) leavingForStart.current = false;
    };
    const unsubscribe = store.subscribe(saveSoon);
    const stopListening = lifecycle.onSuspend(save);
    window.addEventListener('pagehide', save);
    window.addEventListener('pageshow', restored);
    return () => {
      // Under the options the change was made with: the next run of this effect has others.
      if (timer !== undefined) save();
      unsubscribe();
      stopListening();
      window.removeEventListener('pagehide', save);
      window.removeEventListener('pageshow', restored);
    };
  }, [store, mediator, options, lifecycle]);

  // Teams may resume the page hours later, with the directory as it was then.
  useEffect(() => lifecycle.onResume(revisit), [lifecycle, revisit]);

  // Before the paint, so that a team's chart never shows with the folding of the chart before it.
  useLayoutEffect(() => {
    const change = teamChange.current;
    if (!chart || !change || chart === change.from) return;
    teamChange.current = null;
    const texts = PAGE_STRINGS[languageRef.current];
    const people = formatPeople(chart.peopleCount, languageRef.current);
    const head = change.headId === null ? undefined : namedEmployee(chart, change.headId);
    // Nothing announces the head's details over this: the effect above starts anew with this chart and drops what it had planned.
    switch (change.kind) {
      case 'narrow':
        // Where the head is missing, as after a refresh that took them away, the status bar says so.
        if (!head || chart.topPersonIds[0] !== head.id) return;
        store.restart(initialExpandDepth(chart, 1), head.id);
        zoom.restart();
        announce(texts.showingTeam(head.displayName, people));
        return;
      case 'widen':
        if (head) store.revealEmployee(revealTargetOf(chart, head.id));
        // Without a head to reveal, the focus lost with the button of the team's bar, gone with the bar, goes to the tree.
        else if (document.activeElement === document.body) {
          cardInTabOrder(document.getElementById(mainId))?.focus({ preventScroll: true });
        }
        announce(texts.showingEveryone(people));
        return;
      case 'restart':
        store.restart(initialExpandDepth(chart, settings.chart.expandDepth));
        zoom.restart();
    }
  }, [chart, store, zoom, announce, languageRef, settings.chart.expandDepth, mainId]);

  // Before the paint, as for a team; the selection effect starts anew with this chart, so only this says what happened.
  useLayoutEffect(() => {
    const reveal = filteredReveal.current;
    if (!chart || !reveal || chart === reveal.from) return;
    filteredReveal.current = null;
    const texts = PAGE_STRINGS[languageRef.current];
    if (!namedEmployee(chart, reveal.id)) {
      setNotice({ words: (language) => PAGE_STRINGS[language].notShown(reveal.name), support: false });
      announce(texts.notShown(reveal.name));
      return;
    }
    store.revealEmployee(revealTargetOf(chart, reveal.id));
    const changes = describeFilterChanges(reveal.before, reveal.after, languageRef.current);
    announce(changes === null ? texts.detailsShown(reveal.name) : texts.shownWithFilters(reveal.name, changes));
  }, [chart, store, announce, languageRef]);

  // The chart on screen says which pages lead to the person; a hit that a refresh has since taken out of it keeps its own path, and one that other filters have made unlisted opens nothing.
  const revealHit = useCallback(
    (hit: EmployeeSearchHit) => {
      const { id } = hit.employee;
      const node = chart?.nodes.get(id);
      if (node?.unlisted) return;
      store.revealEmployee(chart && node ? revealTargetOf(chart, id) : { id, ancestorIds: hit.path });
    },
    [store, chart],
  );

  // A pick always shows the person's details, also the manager's whose team the panel lists.
  const pickHit = useCallback(
    (hit: EmployeeSearchHit) => {
      setSideList(null);
      leaveDepartments();
      revealHit(hit);
    },
    [revealHit, leaveDepartments],
  );

  const showPerson = useCallback(
    (employeeId: string) => {
      if (chart && namedEmployee(chart, employeeId)) store.revealEmployee(revealTargetOf(chart, employeeId));
    },
    [store, chart],
  );

  // The details are nobody's while the results are shown, so that no card stays marked as the one the panel is about.
  const showResults = useCallback(
    (term: string) => {
      store.select(null);
      departmentStore.select(null);
      setSideList((shown) => ({ kind: 'results', term, opening: (shown?.kind === 'results' ? shown.opening : 0) + 1 }));
    },
    [store, departmentStore],
  );

  const showTeam = useCallback((managerId: string, filter: TeamShareFilter | null = null) => {
    setSideList({ kind: 'team', managerId, filter });
    setOpenedShare(filter && { managerId, filter });
  }, []);

  // The departments are nobody's, as the results are, so that no card stays marked as the one the panel is about.
  const showDepartments = useCallback(() => {
    store.select(null);
    departmentStore.select(null);
    setSideList((shown) => ({ kind: 'departments', opening: (shown?.kind === 'departments' ? shown.opening : 0) + 1, returnTo: null }));
  }, [store, departmentStore]);

  // From the departments panel; the people chart's selection goes, as the departments take its place.
  const showDepartmentChart = useCallback(() => {
    modeChange.current = 'departments';
    store.select(null);
    setSideList(null);
    setChartView('departments');
  }, [store]);

  const showPeople = useCallback(() => {
    modeChange.current = 'people';
    departmentStore.select(null);
    setChartView('people');
  }, [departmentStore]);

  // A department opened in the chart of departments: unfolded down to, selected and centred, which brings up its people.
  const revealDepartment = useCallback(
    (id: string) => {
      if (!departments?.nodes.has(id)) return;
      departmentStore.revealEmployee({ id, ancestorIds: departmentPath(departments, id).slice(0, -1).map((above) => above.id) });
    },
    [departments, departmentStore],
  );

  const openDepartment = useCallback((id: string) => {
    setSideList({ kind: 'department', base: { kind: 'panel' }, trail: [id], returnTo: null });
  }, []);

  // From the person's department path in their details, who stays selected, as the manager does while their team is listed.
  const showDepartment = useCallback((personId: string, id: string) => {
    setSideList({ kind: 'department', base: { kind: 'details', personId }, trail: [id], returnTo: null });
  }, []);

  // From a department's path or the departments below it, one step further along the trail, which Back walks back.
  const openNextDepartment = useCallback((id: string) => {
    setSideList((shown) => (shown?.kind === 'department' ? { ...shown, trail: nextTrail(shown.trail, id), returnTo: null } : shown));
  }, []);

  const foldDepartment = useCallback((id: string, unfolded: boolean) => {
    setDepartmentFolds((folds) => new Map(folds).set(id, unfolded));
  }, []);

  // The person's card, or the nearest item above it still shown, a manager or the heading over a flagged branch, for focus that would otherwise be lost.
  const focusCard = useCallback(
    (id: string) => {
      if (!viewport || !chart?.nodes.has(id)) return;
      const { ancestorIds: managers, heading } = revealTargetOf(chart, id);
      const card = [id, ...managers.toReversed(), ...(heading === undefined ? [] : [heading])]
        .map((key) => findTreeItem(viewport, key))
        .find((element) => element !== null);
      card?.focus({ preventScroll: true });
    },
    [viewport, chart],
  );

  // To the manager's details, with the focus on what opened the list (See the whole team, or a department's or a city's row), unless a refresh has taken it away.
  const backToDetails = useCallback(() => {
    const filter = sideList?.kind === 'team' ? sideList.filter : null;
    flushSync(() => {
      setSideList(null);
    });
    const opener = filter ? shareRowFor(filter) : seeTeamButton.current;
    if (opener) opener.focus();
    else if (store.selectedId !== null) focusCard(store.selectedId);
  }, [sideList, store, focusCard]);

  // To the department before, the panel or the details, with the focus on the row or the part that opened the department left.
  const backFromDepartment = useCallback(() => {
    if (sideList?.kind !== 'department' || !departments) return;
    const { base, trail } = sideList;
    const left = trail.at(-1) ?? null;
    if (trail.length > 1) {
      setSideList({ ...sideList, trail: trail.slice(0, -1), returnTo: left });
      return;
    }
    if (base.kind === 'panel') {
      // Its row shows again, below the departments it is in, unfolded for it.
      if (left !== null && departments.nodes.has(left)) {
        const above = departmentPath(departments, left).slice(0, -1);
        setDepartmentFolds((folds) => new Map([...folds, ...above.map(({ id }) => [id, true] as const)]));
      }
      setSideList({ kind: 'departments', opening: 0, returnTo: left });
      return;
    }
    flushSync(() => {
      setSideList(null);
    });
    const part = left === null ? null : departmentRowIn(document.getElementById(DETAILS_PANEL_ID), left);
    if (part) part.focus();
    else if (store.selectedId !== null) focusCard(store.selectedId);
  }, [sideList, departments, store, focusCard]);

  // Through the chart on screen: a list made for the chart before a refresh can show someone who has left or moved since.
  const openFromList = useCallback(
    (employeeId: string) => {
      if (!chart || !namedEmployee(chart, employeeId)) return;
      leaveDepartments();
      setOpenedFromList(employeeId);
      showPerson(employeeId);
    },
    [chart, showPerson, leaveDepartments],
  );

  // Focus that was inside the panel goes to the person's card, or the nearest manager still shown; from the results, to the search; from the departments, to their button; from a department's card, to the card.
  const closeSidePanel = useCallback(() => {
    const id = store.selectedId;
    const departmentId = departmentStore.selectedId;
    const fromDepartments = sideList?.kind === 'departments' || (sideList?.kind === 'department' && sideList.base.kind === 'panel');
    // The panel is gone when this returns, and with it the focus it held.
    flushSync(() => {
      setSideList(null);
      store.select(null);
      departmentStore.select(null);
    });
    if (document.activeElement !== document.body) return;
    if (fromDepartments) departmentsButton.current?.focus();
    else if (departmentId !== null && viewport) findTreeItem(viewport, departmentId)?.focus({ preventScroll: true });
    else if (id === null) search.current?.returnFocus();
    else focusCard(id);
  }, [store, departmentStore, focusCard, sideList, viewport]);

  const skipToChart = (event: MouseEvent) => {
    // The address only makes this a link; following it would add a history entry.
    event.preventDefault();
    const card = cardInTabOrder(viewport);
    if (!card) return;
    card.focus({ preventScroll: true });
    zoom.focus(card, { fit: false, align: 'nearest' });
  };

  // A failure's words may send people to their IT support; other notices never do.
  const showNotice = (words: Notice['words'], failure?: unknown) => {
    setNotice({ words, support: failure !== undefined && pointsToSupport(failure) });
    announce(words(languageRef.current));
  };

  const expandAll = () => {
    if (chartView === 'departments' && departments) {
      const plan = planDepartmentExpandAll(departments);
      departmentStore.expandToDepth(plan.depth);
      if (plan.complete) setNotice(null);
      else showNotice((language) => DEPARTMENT_STRINGS[language].expandedPartly(plan.visibleLevels, plan.totalLevels));
      return;
    }
    if (!chart) return;
    const plan = planExpandAll(chart, store);
    store.expandToDepth(plan.depth);
    if (plan.complete) setNotice(null);
    else showNotice((language) => PAGE_STRINGS[language].expandedPartly(plan.visibleLevels, plan.totalLevels));
  };

  // Back to the zoom the chart opens with: the one that fitted an unfolded team would leave the top persons small.
  const collapseAll = () => {
    (showsDepartments ? departmentStore : store).expandToDepth(0);
    zoom.restart();
    setNotice(null);
  };

  // As for teams: the focus stays on the card where '*' was pressed.
  const expandedDepartments = (unfolded: number, folded: number) => {
    if (folded === 0) announce(dt.nothingToUnfold);
    else if (unfolded < folded) announce(dt.unfoldedPartly(unfolded, folded));
    else announce(dt.unfolded(unfolded));
  };

  // The focus stays on the item where '*' was pressed, which says nothing of the teams beside it, or the groups beside a heading.
  const expandedSiblings = (unfolded: number, folded: number, groups: boolean) => {
    if (folded === 0) announce(groups ? t.nothingToUnfoldInGroups : t.nothingToUnfold);
    else if (unfolded < folded) announce(groups ? t.unfoldedGroupsPartly(unfolded, folded) : t.unfoldedTeamsPartly(unfolded, folded));
    else announce(groups ? t.unfoldedGroups(unfolded) : t.unfoldedTeams(unfolded));
  };

  const focusSearch = () => {
    search.current?.focus();
  };

  const startRefresh = () => {
    void refresh();
  };

  // Before the first chart, restarting would use up startFrom and lose the person a shared link opens on.
  const restart = () => {
    if (!chart) return;
    setNotice(null);
    // The restart selects nobody, which alone would leave the search results open, and the chart opens with its people.
    setSideList(null);
    leaveDepartments();
    if (team === settings.chart.team && shown.team === team) {
      store.restart(initialExpandDepth(chart, settings.chart.expandDepth));
      zoom.restart();
      return;
    }
    // Back to the team the chart opened with, if any: the address of an embedding names it, as it names the top persons.
    teamChange.current = { kind: 'restart', headId: null, from: chart };
    if (team !== settings.chart.team) changeUserSettings({ ...userSettings, team: settings.chart.team });
  };

  // On a site of its own the logo leads to "/", the chart config.json sets up, which would otherwise take up a view saved moments ago.
  const startAfresh = () => {
    leavingForStart.current = true;
    mediator.send(new ForgetViewCommand(settings.chart.options.within ?? settings.chart.options)).catch(() => undefined);
  };

  // The person's mail or UPN, as the Link button names people, keeps the address readable.
  const showOnlyTeam = (employeeId: string) => {
    const employee = chart && namedEmployee(chart, employeeId);
    if (!chart || !employee) return;
    teamChange.current = { kind: 'narrow', headId: employeeId, from: chart };
    setNotice(null);
    changeUserSettings({ ...userSettings, team: employee.mail ?? employee.userPrincipalName });
  };

  const showEveryone = () => {
    if (!chart) return;
    teamChange.current = { kind: 'widen', headId: teamHeadId, from: chart };
    setNotice(null);
    changeUserSettings({ ...userSettings, team: null });
  };

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
  }, []);

  const closeReport = useCallback(() => {
    setReportOpen(false);
  }, []);

  // Settings closes first, so that the report, opened in the same render after it, hands the focus back to the cog.
  const openReport = () => {
    closeSettings();
    setReportOpen(true);
  };

  // Closed first, as Settings is for Show me in the chart: the card that takes the focus can't take it behind an open dialog.
  const showInChart = (person: Employee) => {
    closeReport();
    if (!chart) return;
    leaveDepartments();
    if (namedEmployee(chart, person.id)) {
      showPerson(person.id);
      return;
    }
    const before = userSettings.hide;
    const from = chart;
    mediator.send(new GetRulesShowingQuery(options, person.id)).then(
      (after) => {
        if (after === null) {
          showNotice((language) => PAGE_STRINGS[language].notShown(person.displayName));
          return;
        }
        filteredReveal.current = { id: person.id, name: person.displayName, from, before, after };
        setNotice(null);
        changeUserSettings({ ...userSettings, hide: after });
      },
      (failure: unknown) => {
        showNotice((language) => PAGE_STRINGS[language].showFailed(person.displayName, describeError(failure, language)), failure);
      },
    );
  };

  // A department card picked in the chart of departments, whose people the side panel shows when no list stands in their place.
  const departmentShown = chartView === 'departments' && selectedDepartment !== null && departments?.nodes.has(selectedDepartment) === true;
  // The side panel's layers, which Back closes one at a time: a list opened from the details lies over them, and each department over the one it was opened from.
  const sideLayers =
    sideList?.kind === 'team'
      ? 2
      : sideList?.kind === 'department'
        ? 1 + sideList.trail.length
        : sideList !== null || (selectedId !== null && chart && namedEmployee(chart, selectedId)) || departmentShown
          ? 1
          : 0;
  // The chart of departments lies under the panel, so Back closes it last, before it leaves the chart.
  const panelLayers = sideLayers + (showsDepartments ? 1 : 0);

  // What Back closes first, the browser's or that of Teams on phones: a dialog, then a list over the details or a department over another, then the panel, then the departments.
  const closeTopmost = useCallback(() => {
    if (settingsOpen) closeSettings();
    else if (helpOpen) closeHelp();
    else if (reportOpen) closeReport();
    else if (sideList?.kind === 'team') backToDetails();
    else if (sideList?.kind === 'department') backFromDepartment();
    else if (sideLayers > 0) closeSidePanel();
    else if (showsDepartments) showPeople();
  }, [
    settingsOpen,
    helpOpen,
    reportOpen,
    sideList,
    sideLayers,
    showsDepartments,
    closeSettings,
    closeHelp,
    closeReport,
    backToDetails,
    backFromDepartment,
    closeSidePanel,
    showPeople,
  ]);

  useEffect(() => {
    mediator
      .send(new TrackOpenLayersCommand({ panel: panelLayers, dialog: settingsOpen || helpOpen || reportOpen }, closeTopmost))
      .catch(() => undefined);
  }, [mediator, panelLayers, settingsOpen, helpOpen, reportOpen, closeTopmost]);

  const signOut = () => {
    mediator.send(new SignOutCommand()).catch((signOutError: unknown) => {
      showNotice((language) => PAGE_STRINGS[language].signOutFailed(describeError(signOutError, language)), signOutError);
    });
  };

  // The page reloads once the copy is gone, so only a failure is left to say.
  const forgetBrowserCopy = () => {
    mediator.send(new ForgetBrowserCopyCommand()).catch((forgetError: unknown) => {
      showNotice((language) => PAGE_STRINGS[language].forgetFailed(describeError(forgetError, language)), forgetError);
    });
  };

  const showMe = () => {
    if (!chart || !signedInUser) return;
    // Hide rules and ?top= can leave out the very person who is looking, or leave them unnamed.
    if (namedEmployee(chart, signedInUser.id)) {
      leaveDepartments();
      showPerson(signedInUser.id);
    } else showNotice((language) => PAGE_STRINGS[language].notInChart);
  };

  // Finding out who has a photo can take a while in a large organization, so both ends are said.
  const startExport = () => {
    setNotice(null);
    announce(t.preparingExport);
    exportToCsv().then(
      () => {
        announce(PAGE_STRINGS[languageRef.current].exportReady);
      },
      (exportError: unknown) => {
        showNotice((language) => PAGE_STRINGS[language].exportFailed(describeError(exportError, language)), exportError);
      },
    );
  };

  // The department on screen, as far as the trail is still in the tree: the render that cuts the trail shows nothing that has gone.
  const departmentTrail = sideList?.kind === 'department' && departments ? keptTrail(departments, sideList.trail) : [];
  const shownDepartment = departmentTrail.at(-1);
  const previousDepartment = departmentTrail.at(-2);
  const departmentBack: DepartmentBack =
    previousDepartment !== undefined
      ? { to: 'department', id: previousDepartment }
      : sideList?.kind === 'department' && sideList.base.kind === 'details'
        ? { to: 'details', name: chart?.nodes.get(sideList.base.personId)?.employee.displayName ?? '' }
        : { to: 'departments' };

  return (
    <div className={styles.page}>
      {showsHeader && hasPeople && started && (
        <a className={styles.skipLink} href={`#${mainId}`} onClick={skipToChart}>
          {t.skipToChart}
        </a>
      )}
      <Banner className={showsHeader ? classNames(styles.header, !showsBrand && styles.headerWithoutBrand) : undefined}>
        {showsBrand && (
          <Brand branding={settings.branding} onHome={embedded ? restart : undefined} onLeave={embedded ? undefined : startAfresh} />
        )}
        {showsSearch && (
          <SearchBox
            options={options}
            extraFields={settings.extraFields}
            disabled={!chart}
            onSelect={pickHit}
            onShowAll={showResults}
            handleRef={search}
          />
        )}
        {showsToolbar && (
          <div className={styles.toolbar} role="toolbar" aria-label={t.toolbar.name} {...toolbar}>
            <IconButton icon="expandAll" label={t.toolbar.expandAll} onClick={expandAll} disabled={!chart} />
            <IconButton icon="collapseAll" label={t.toolbar.collapseAll} onClick={collapseAll} disabled={!chart} />
            <IconButton ref={departmentsButton} icon="departments" label={t.toolbar.departments} onClick={showDepartments} disabled={!chart} />
            <span className={`${styles.separator} ${styles.zoomControl}`} aria-hidden="true" />
            <IconButton
              icon="zoomOut"
              label={t.toolbar.zoomOut}
              onClick={zoom.zoomOut}
              disabled={!chart}
              className={styles.zoomControl}
            />
            <button
              type="button"
              className={`${styles.zoomLevel} ${styles.zoomControl}`}
              onClick={zoom.reset}
              disabled={!chart}
              // The zoom it shows, then what it does in its tooltip's words.
              aria-label={`${t.toolbar.zoom(zoomPercent)}. ${t.toolbar.resetZoom}`}
              {...resetZoomTooltip.hostProps}
            >
              {t.toolbar.zoomLevel(zoomPercent)}{resetZoomTooltip.tooltip}
            </button>
            <IconButton
              icon="zoomIn"
              label={t.toolbar.zoomIn}
              onClick={zoom.zoomIn}
              disabled={!chart}
              className={styles.zoomControl}
            />
            <IconButton
              icon="fit"
              label={t.toolbar.fitToScreen}
              onClick={zoom.fit}
              disabled={!chart}
              className={styles.zoomControl}
            />
            <span className={styles.separator} aria-hidden="true" />
            <IconButton
              icon="print"
              label={preparingPrint ? t.toolbar.preparingPrint : printOpensBrowser ? t.toolbar.printInBrowser : t.toolbar.print}
              onClick={print}
              disabled={!chart || preparingPrint}
            />
            {settings.allowExport && (
              <IconButton
                icon="download"
                label={exporting ? t.preparingExport : t.toolbar.exportToCsv}
                onClick={startExport}
                disabled={!chart || exporting}
              />
            )}
            <IconButton
              icon="refresh"
              label={t.toolbar.reload}
              onClick={startRefresh}
              disabled={!chart || isRefreshing}
              className={isRefreshing ? styles.spinning : undefined}
            />
            {/* Never disabled: in the narrow header it is also the way to Sign out, which needs no chart. */}
            <IconButton
              icon="settings"
              label={t.toolbar.settings}
              aria-haspopup="dialog"
              onClick={() => {
                setSettingsOpen(true);
              }}
            />
            <IconButton
              icon="help"
              label={t.toolbar.help}
              aria-haspopup="dialog"
              onClick={() => {
                setHelpOpen(true);
              }}
            />
            {offersSignOut && (
              <>
                <span className={styles.separator} aria-hidden="true" />
                {signedInUser && <UserProfile user={signedInUser} onShow={showMe} className={styles.accountControl} />}
                <IconButton
                  icon="signOut"
                  label={t.toolbar.signOut}
                  onClick={signOut}
                  className={classNames(styles.accountControl, styles.signOut)}
                />
              </>
            )}
          </div>
        )}
        {/* Live regions exist from the first render, because screen readers skip text inserted along with one. */}
        <span className="visually-hidden" role="status">{zoomStatus.said ? t.toolbar.zoom(zoomPercent) : ''}</span>
        <span className="visually-hidden" role="status">
          {error instanceof SignInRequiredError ? t.signInToSee : ''}
        </span>
        <span ref={region} className="visually-hidden" role="status" />
      </Banner>

      <div className={styles.bars}>
        {chart && shown.team !== null && <TeamBar chart={chart} headId={teamHeadId} onShowEveryone={showEveryone} />}
        {showsDepartments && (
          <ModeBar icon="departments" text={dt.showing(departments.nodes.size)} action={dt.showPeople} onAction={showPeople} />
        )}
      </div>

      <main id={mainId} className={styles.main}>
        <DisplayOptionsProvider value={{ showLevels: userSettings.showLevels }}>
          {chart && started && hasPeople && chartView === 'departments' && departments ? (
            departments.rootIds.length > 0 ? (
              <DepartmentCanvas
                chart={chart}
                tree={departments}
                store={departmentStore}
                zoom={zoom.zoom}
                viewport={viewport}
                viewportRef={setViewport}
                onFocus={zoom.focus}
                label={dt.treeName(chartTitle(settings.branding, language))}
                onSearchShortcut={focusSearch}
                onExpandSiblings={expandedDepartments}
              />
            ) : (
              <Panel title={dt.title}>
                <p>{dt.noDepartments}</p>
              </Panel>
            )
          ) : chart && started && hasPeople ? (
            <OrgChartCanvas
              chart={chart}
              store={store}
              zoom={zoom.zoom}
              viewport={viewport}
              viewportRef={setViewport}
              onFocus={zoom.focus}
              label={chartTitle(settings.branding, language)}
              onSearchShortcut={focusSearch}
              onExpandSiblings={expandedSiblings}
            />
          ) : chart && started ? (
            <Panel title={t.noPeople.title}>
              <p>
                <span title={t.noPeople.forAdministrators}>{t.noPeople.text}</span>
                <SupportLink />
              </p>
            </Panel>
          ) : error instanceof SignInRequiredError ? (
            <SignInPrompt onSignedIn={reload} />
          ) : error ? (
            <Panel title={t.loadFailed} tone="error" detail={errorDetail(error)}>
              <p>
                {describeError(error, language)}
                {pointsToSupport(error) && <SupportLink />}
              </p>
              <button type="button" onClick={reload}>
                {t.tryAgain}
              </button>
            </Panel>
          ) : (
            <Panel title={t.loading} busy>
              {progress !== null && (
                <>
                  <ProgressBar progress={progress} className={styles.progressBar} />
                  <p>{describeProgress(progress, language)}</p>
                </>
              )}
            </Panel>
          )}
          {/* One side panel at a time: a list, or the selected person's details. */}
          {chart && sideList?.kind === 'results' ? (
            <SearchResults
              key={sideList.opening}
              chart={chart}
              options={options}
              term={sideList.term}
              onOpen={openFromList}
              onClose={closeSidePanel}
            />
          ) : chart && sideList?.kind === 'team' ? (
            <TeamView
              key={`${sideList.managerId}|${sideList.filter?.field ?? ''}|${sideList.filter?.name ?? ''}`}
              chart={chart}
              managerId={sideList.managerId}
              filter={sideList.filter}
              onShowWholeTeam={() => {
                showTeam(sideList.managerId);
              }}
              layout={teamLayout}
              onLayoutChange={setTeamLayout}
              onOpen={openFromList}
              onBack={backToDetails}
              onClose={closeSidePanel}
            />
          ) : departments && sideList?.kind === 'departments' ? (
            <DepartmentsPanel
              key={sideList.opening}
              tree={departments}
              folds={departmentFolds}
              onFold={foldDepartment}
              // With the departments in the chart's place, a row picks its card; the people without one are no card.
              onOpen={
                showsDepartments
                  ? (id) => {
                      if (id === NO_DEPARTMENT) openDepartment(id);
                      else revealDepartment(id);
                    }
                  : openDepartment
              }
              returnTo={sideList.returnTo}
              onShowAsChart={showsDepartments ? undefined : showDepartmentChart}
              onClose={closeSidePanel}
            />
          ) : chart && departments && shownDepartment !== undefined && sideList?.kind === 'department' ? (
            <DepartmentView
              key={shownDepartment}
              chart={chart}
              tree={departments}
              departmentId={shownDepartment}
              layout={teamLayout}
              onLayoutChange={setTeamLayout}
              onOpenDepartment={openNextDepartment}
              onOpen={openFromList}
              back={departmentBack}
              onBack={backFromDepartment}
              returnTo={sideList.returnTo}
              onClose={closeSidePanel}
            />
          ) : chart && departments && departmentShown ? (
            <DepartmentView
              key={`card:${selectedDepartment}`}
              chart={chart}
              tree={departments}
              departmentId={selectedDepartment}
              layout={teamLayout}
              onLayoutChange={setTeamLayout}
              onOpenDepartment={revealDepartment}
              onOpen={openFromList}
              returnTo={null}
              // As a person's details do: the card keeps the focus, but in the outline the sheet takes it.
              takesFocus={viewport !== null && isOutline(viewport)}
              onClose={closeSidePanel}
            />
          ) : (
            chart &&
            selectedId && (
              <EmployeeDetailsPanel
                chart={chart}
                options={options}
                employeeId={selectedId}
                showWorkLocation={settings.chart.showWorkLocation}
                showWorkingHours={settings.chart.showWorkingHours}
                extraFields={settings.extraFields}
                onClose={closeSidePanel}
                onShowPerson={showPerson}
                onShowOnlyTeam={showOnlyTeam}
                onShowEveryone={teamHeadId !== null && teamHeadId === selectedId ? showEveryone : undefined}
                onSeeTeam={showTeam}
                seeTeamRef={seeTeamButton}
                shownShare={openedShare?.filter ?? null}
                openedFromList={openedFromList === selectedId}
                onShowDepartment={showDepartment}
              />
            )
          )}
        </DisplayOptionsProvider>
      </main>

      <footer className={styles.status}>
        {/* Left out, the bar still comes back while a refresh has failed, as the chart is then out of date. */}
        {result && (!settings.without.includes('statusBar') || refreshError !== undefined) && (
          <StatusBar
            chart={result.chart}
            loadedAt={result.loadedAt}
            isRefreshing={isRefreshing}
            progress={progress}
            exportProgress={exporting ? (exportProgress ?? 0) : null}
            refreshError={refreshError}
            onRefresh={startRefresh}
            notice={notice && { text: notice.words(language), support: notice.support }}
            // Asked of the chart of the link's own team only: another team leaves the person out by the person's choice.
            linkedPersonMissing={initialPerson !== null && linkedPerson === null && shown.team === settings.chart.team}
            topPersonsFromLink={options.within !== undefined}
            filterNote={describeFilterChanges(settings.defaults.hide, userSettings.hide, language)}
            showsTeam={shown.team !== null}
            teamHeadId={teamHeadId}
            announce={announce}
          />
        )}
      </footer>

      <SettingsDialog open={settingsOpen} onClose={closeSettings}>
        <FilterSettings
          hide={userSettings.hide}
          defaults={settings.defaults.hide}
          hasTopPersons={(options.within ?? options).topPersons.length > 0}
          peopleCount={chart?.peopleCount ?? null}
          effects={filterEffects}
          onChange={(hide) => {
            changeUserSettings({ ...userSettings, hide });
          }}
        />
        {/* Teams sets the theme itself, whatever the person chose (syncTheme). */}
        <DisplaySettings settings={userSettings} onChange={changeUserSettings} themeFromTeams={host === 'teams'} />
        {(signedInUser || offersSignOut || canForget) && (
          <AccountSettings
            user={signedInUser}
            // Closed first: the card that showMe focuses can't take the focus behind an open dialog.
            onShow={
              chart &&
              (() => {
                closeSettings();
                showMe();
              })
            }
            onShowTeam={
              chart && signedInUser && signedInUser.id !== teamHeadId && narrowsChart(chart, signedInUser.id)
                ? () => {
                    closeSettings();
                    showOnlyTeam(signedInUser.id);
                  }
                : undefined
            }
            changePhotoUrl={settings.changePhotoUrl}
            onSignOut={
              offersSignOut
                ? () => {
                    closeSettings();
                    signOut();
                  }
                : undefined
            }
            // Where there is no Sign out, as the host page owns the sign-in; closed first, so that a failure can be read.
            onForget={
              canForget
                ? () => {
                    closeSettings();
                    forgetBrowserCopy();
                  }
                : undefined
            }
          />
        )}
        {embedAddress !== undefined && <EmbedSettings address={embedAddress} title={chartTitle(settings.branding, language)} />}
        {settings.allowReports && chart && <ReportsSettings onShowDirectoryHealth={openReport} />}
      </SettingsDialog>
      {/* After Settings, whose close() hands the focus back to the cog before the report records where to hand it back. */}
      {settings.allowReports && (
        <DirectoryHealthDialog open={reportOpen} options={options} chart={chart} onClose={closeReport} onShowInChart={showInChart} />
      )}
      <HelpDialog
        open={helpOpen}
        onClose={closeHelp}
        host={host}
        searchable={showsSearch}
        chart={chart}
        diagnostics={diagnostics}
        version={version}
      />
    </div>
  );
}

/** A department's or a city's row in the open details, which listed that part of the team; null where the details no longer show it. */
function shareRowFor({ field, name }: TeamShareFilter): HTMLElement | null {
  const rows = document.getElementById(DETAILS_PANEL_ID)?.querySelectorAll<HTMLElement>('[data-share-field]') ?? [];
  return Array.from(rows).find((row) => row.dataset.shareField === field && row.dataset.shareName === name) ?? null;
}

/** The tree's card in the tab order: the current one (ChartViewStore.currentId), else the first top person. */
function cardInTabOrder(container: ParentNode | null): HTMLElement | null {
  return container?.querySelector<HTMLElement>('[role=treeitem][tabindex="0"]') ?? null;
}

/** Null where nobody of that name is in the chart, which then is the one the team would narrow (buildOrgChart). */
function teamHeadIn(chart: OrgChart, team: string): string | null {
  const [headId] = chart.topPersonIds;
  return headId !== undefined && findPerson(chart, team)?.id === headId ? headId : null;
}

/** Null when the chart leaves the person out or unnamed: a wrong address, a hide rule, or outside ?top=. */
function findPerson(chart: OrgChart, identifier: string): RevealTarget | null {
  const employees = Array.from(chart.nodes.values()).flatMap((node) => (node.unlisted ? [] : [node.employee]));
  const [employee] = resolveEmployees(employees, [identifier]).found;
  return employee ? revealTargetOf(chart, employee.id) : null;
}
