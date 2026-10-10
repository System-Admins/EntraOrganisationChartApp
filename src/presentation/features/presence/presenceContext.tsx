import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ConsentToPresenceCommand } from '@/application/features/presence/consentToPresence';
import { GetPresencesQuery } from '@/application/features/presence/getPresences';
import type { Presence } from '@/domain/presence/presence';
import { useMediator } from '../../shared/mediatorContext';
import { PresenceTracker, type PresenceStatus } from './presenceTracker';

const PresenceContext = createContext<PresenceTracker | null>(null);

const noSubscription = () => () => undefined;

export function PresenceProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const mediator = useMediator();
  const [tracker] = useState(() => new PresenceTracker((ids) => mediator.send(new GetPresencesQuery(ids))));
  useEffect(
    () => () => {
      tracker.dispose();
    },
    [tracker],
  );
  return <PresenceContext value={enabled ? tracker : null}>{children}</PresenceContext>;
}

/** With `watch`, keeps this person's presence fresh while mounted; otherwise only reads what others watch. */
export function usePresence(employeeId: string, watch: boolean): Presence | undefined {
  const tracker = useContext(PresenceContext);
  useEffect(() => (tracker && watch ? tracker.watch(employeeId) : undefined), [tracker, employeeId, watch]);
  return useSyncExternalStore(tracker?.subscribe ?? noSubscription, () => tracker?.get(employeeId));
}

/** Why presence is off, for telling the user; null when presence is switched off in config.json. */
export function usePresenceStatus(): PresenceStatus | null {
  const tracker = useContext(PresenceContext);
  return useSyncExternalStore(tracker?.subscribe ?? noSubscription, () => tracker?.status ?? null);
}

/** Call from a click handler. Rejects with a message to show when consent could not be given. */
export function useConsentToPresence(): () => Promise<void> {
  const tracker = useContext(PresenceContext);
  const mediator = useMediator();
  return useCallback(async () => {
    await mediator.send(new ConsentToPresenceCommand());
    tracker?.retry();
  }, [mediator, tracker]);
}
