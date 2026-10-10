import type { Diagnostics } from '@/application/features/diagnostics/getDiagnostics';
import type { HostKind } from '@/application/settings/hostKind';
import type { OrgChart } from '@/domain/orgChart/orgChart';
import { Dialog } from '../../shared/Dialog';
import { useStrings } from '../../shared/languageContext';
import { AboutThisChart } from './AboutThisChart';
import { HelpTopics } from './HelpTopics';
import { HELP_STRINGS } from './strings';

interface HelpDialogProps {
  readonly open: boolean;
  /** The dialog closed itself (its Close button, Escape, a click beside it): set `open` to false. */
  readonly onClose: () => void;
  readonly host: HostKind;
  /** Whether the page has its search field, which the embedding page can leave out (?without=search). */
  readonly searchable: boolean;
  /** The chart on screen; missing until it has loaded. */
  readonly chart?: OrgChart;
  /** Missing until they are known, and while there is no chart to count. */
  readonly diagnostics?: Diagnostics;
  /** The build's: the pipeline's 1.0.<build ID>, or "dev". */
  readonly version: string;
}

/** Help in a modal Dialog of its own, which the owner closes through `open`, because only close() hands the focus back. */
export function HelpDialog({ open, onClose, host, searchable, chart, diagnostics, version }: HelpDialogProps) {
  const t = useStrings(HELP_STRINGS);
  return (
    <Dialog open={open} title={t.title} closeLabel={t.close} onClose={onClose}>
      <HelpTopics host={host} searchable={searchable} chart={chart} />
      {/* Right after whom to ask, as the details are what IT may ask for. */}
      <AboutThisChart diagnostics={diagnostics} host={host} version={version} />
    </Dialog>
  );
}
