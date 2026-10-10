import { useCallback, useState } from 'react';
import { ExportEmployeesCommand } from '@/application/features/export/exportEmployees';
import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import { useLanguage } from '../../shared/languageContext';
import { useMediator } from '../../shared/mediatorContext';

export interface ExportState {
  /** Call from a click handler; see TableFileWriter. Rejects when the export fails. */
  readonly exportToCsv: () => Promise<void>;
  readonly exporting: boolean;
  /** People checked for a photo so far, which is what a large export waits for; null before the first answer. */
  readonly progress: number | null;
}

export function useExport(options: OrgChartOptions): ExportState {
  const mediator = useMediator();
  const language = useLanguage();
  const [state, setState] = useState<Pick<ExportState, 'exporting' | 'progress'>>({ exporting: false, progress: null });

  const exportToCsv = useCallback(async () => {
    setState({ exporting: true, progress: null });
    try {
      await mediator.send(
        new ExportEmployeesCommand(options, language, (progress) => {
          setState({ exporting: true, progress });
        }),
      );
    } finally {
      setState({ exporting: false, progress: null });
    }
  }, [mediator, options, language]);

  return { exportToCsv, ...state };
}
