import { useCallback } from 'react';
import type { ShareResult } from '@/application/abstractions/employeeSharing';
import { ShareEmployeeCommand } from '@/application/features/share/shareEmployee';
import type { Employee } from '@/domain/employees/employee';
import { useMediator } from '../../shared/mediatorContext';

/** Call from a click handler; see EmployeeSharing. */
export function useShare(): (employee: Employee) => Promise<ShareResult> {
  const mediator = useMediator();
  return useCallback((employee) => mediator.send(new ShareEmployeeCommand(employee)), [mediator]);
}
