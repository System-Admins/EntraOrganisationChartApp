import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { SaveUserSettingsCommand } from '@/application/features/settings/saveUserSettings';
import { openingUserSettings, type AppSettings } from '@/application/settings/appSettings';
import type { UserSettings } from '@/application/settings/userSettings';
import { useMediator } from '../../shared/mediatorContext';

type UserSettingsState = readonly [UserSettings, (next: UserSettings) => void];

const UserSettingsContext = createContext<UserSettingsState | null>(null);

/** Above the whole page, as some settings reach every component: the language is one. */
export function UserSettingsProvider({ settings, children }: { settings: AppSettings; children: ReactNode }) {
  const mediator = useMediator();
  const [userSettings, setUserSettings] = useState(() => openingUserSettings(settings));

  const change = useCallback(
    (next: UserSettings) => {
      setUserSettings(next);
      // The change already applies; that it couldn't be remembered for the next visit isn't worth interrupting for.
      mediator.send(new SaveUserSettingsCommand(next)).catch(() => undefined);
    },
    [mediator],
  );

  const state = useMemo(() => [userSettings, change] as const, [userSettings, change]);
  return <UserSettingsContext value={state}>{children}</UserSettingsContext>;
}

/** The person's settings for this visit, starting from those the chart opens with; every change is also remembered. */
export function useUserSettings(): UserSettingsState {
  const state = useContext(UserSettingsContext);
  if (!state) throw new Error('useUserSettings must be used inside <UserSettingsProvider>.');
  return state;
}
