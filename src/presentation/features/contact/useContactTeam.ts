import { useCallback } from 'react';
import type { TeamChannel } from '@/application/abstractions/contactLauncher';
import { ContactTeamCommand } from '@/application/features/contact/contactTeam';
import type { Employee } from '@/domain/employees/employee';
import { useMediator } from '../../shared/mediatorContext';

/** Call from a click handler: opening Teams or a mail window needs the user gesture. */
export function useContactTeam(): (team: readonly Employee[], channel: TeamChannel, topic: string) => void {
  const mediator = useMediator();
  return useCallback(
    (team, channel, topic) => {
      mediator.send(new ContactTeamCommand(team, channel, topic)).catch((error: unknown) => {
        console.error(`Could not start a team ${channel} with ${topic}.`, error);
      });
    },
    [mediator],
  );
}
