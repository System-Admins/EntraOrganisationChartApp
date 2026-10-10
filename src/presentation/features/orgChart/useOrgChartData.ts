import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SignInRequiredError } from '@/application/abstractions/authenticator';
import { RefreshDirectoryCommand } from '@/application/features/directory/refreshDirectory';
import { GetOrgChartQuery, type OrgChartResult } from '@/application/features/orgChart/getOrgChart';
import type { Language } from '@/application/settings/language';
import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import { describeError } from '../../shared/errors';
import { useLanguageRef } from '../../shared/languageContext';
import { useMediator } from '../../shared/mediatorContext';
import { useQuery } from '../../shared/useQuery';
import { progressTracker, type DirectoryProgress } from './directoryProgress';
import { REFRESH_STRINGS } from './strings';

export interface OrgChartData {
  readonly result: OrgChartResult | undefined;
  readonly error: unknown;
  /** How far the running full read of the directory is, if any. */
  readonly progress: DirectoryProgress | null;
  readonly isRefreshing: boolean;
  readonly refreshError: unknown;
  /** Reads the whole directory again and announces the start and the end. */
  readonly refresh: () => Promise<void>;
  readonly reload: () => void;
  /** Asks for the chart again, which refreshes it in the background where it has grown stale since, as after a suspension. */
  readonly revisit: () => void;
}

interface RefreshFailure {
  readonly message: string;
  /** Label of the button that tries again. */
  readonly action: string;
}

/** What the status bar shows, and screen readers hear, when a refresh failed. */
export function describeRefreshFailure(error: unknown, language: Language): RefreshFailure {
  const texts = REFRESH_STRINGS[language];
  return error instanceof SignInRequiredError
    ? { message: texts.showingSavedData, action: texts.signInToUpdate }
    : { message: texts.failed(describeError(error, language)), action: texts.retry };
}

/** Shows a cached chart at once and refreshes a stale one in the background, announcing only a failure. */
export function useOrgChartData(options: OrgChartOptions, announce: (message: string) => void): OrgChartData {
  const mediator = useMediator();
  // A reload can end after a change of language, and its outcome is said in the new one.
  const languageRef = useLanguageRef();
  const [progress, setProgress] = useState<DirectoryProgress | null>(null);
  const [trackProgress] = useState(() => progressTracker(setProgress));
  const query = useMemo(() => new GetOrgChartQuery(options, trackProgress), [options, trackProgress]);
  const { data, error, reload } = useQuery(query);
  const [refreshing, setRefreshing] = useState<{ running: boolean; error: unknown }>({
    running: false,
    error: undefined,
  });

  const run = useCallback(
    async (byPerson: boolean) => {
      setProgress(null);
      setRefreshing({ running: true, error: undefined });
      if (byPerson) announce(REFRESH_STRINGS[languageRef.current].updating);
      try {
        await mediator.send(new RefreshDirectoryCommand(trackProgress, byPerson));
        setRefreshing({ running: false, error: undefined });
        reload();
        if (byPerson) announce(REFRESH_STRINGS[languageRef.current].updated);
      } catch (refreshError) {
        setRefreshing({ running: false, error: refreshError });
        const { message, action } = describeRefreshFailure(refreshError, languageRef.current);
        announce(`${message} ${action}.`);
      } finally {
        setProgress(null);
      }
    },
    [mediator, reload, announce, languageRef, trackProgress],
  );

  const refresh = useCallback(() => run(true), [run]);

  const staleRefreshStarted = useRef(false);
  useEffect(() => {
    if (!data?.isStale || staleRefreshStarted.current) return;
    staleRefreshStarted.current = true;
    void run(false);
  }, [data, run]);

  const revisit = useCallback(() => {
    staleRefreshStarted.current = false;
    reload();
  }, [reload]);

  return {
    result: data,
    error,
    progress,
    isRefreshing: refreshing.running,
    refreshError: refreshing.error,
    refresh,
    reload,
    revisit,
  };
}
