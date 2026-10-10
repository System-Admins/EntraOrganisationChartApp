import { getNode, type OrgChart } from '@/domain/orgChart/orgChart';
import { formatPeople } from '../../shared/formatPeople';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { ModeBar } from './ModeBar';
import { PAGE_STRINGS, TEAM_BAR_STRINGS } from './strings';

interface TeamBarProps {
  readonly chart: OrgChart;
  /** The person whose team the chart shows alone; null where that person was not found or is hidden. */
  readonly headId: string | null;
  readonly onShowEveryone: () => void;
}

/** Over a chart that shows one team alone: what the chart shows, and the way back to everyone. */
export function TeamBar({ chart, headId, onShowEveryone }: TeamBarProps) {
  const language = useLanguage();
  const t = useStrings(TEAM_BAR_STRINGS);
  const { showingTeam } = useStrings(PAGE_STRINGS);
  const head = headId === null ? null : getNode(chart, headId).employee;
  return (
    <ModeBar
      icon={head ? 'team' : 'warning'}
      text={head ? showingTeam(head.displayName, formatPeople(chart.peopleCount, language)) : t.teamMissing}
      action={t.showEveryone}
      onAction={onShowEveryone}
      warning={!head}
    />
  );
}
