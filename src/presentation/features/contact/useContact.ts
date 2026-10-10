import { useCallback } from 'react';
import type { ContactChannel } from '@/application/abstractions/contactLauncher';
import { ContactEmployeeCommand } from '@/application/features/contact/contactEmployee';
import type { Employee } from '@/domain/employees/employee';
import { useMediator } from '../../shared/mediatorContext';

/** Call from a click handler: opening Teams or a mail window needs the user gesture. */
export function useContact(): (employee: Employee, channel: ContactChannel) => void {
  const mediator = useMediator();
  return useCallback(
    (employee, channel) => {
      mediator.send(new ContactEmployeeCommand(employee, channel)).catch((error: unknown) => {
        console.error(`Could not start ${channel} with ${employee.displayName}.`, error);
      });
    },
    [mediator],
  );
}
