import { createContext, useContext, type ReactNode } from 'react';
import type { Sender } from '@/application/common/mediator';

const MediatorContext = createContext<Sender | null>(null);

export function MediatorProvider({ mediator, children }: { mediator: Sender; children: ReactNode }) {
  return <MediatorContext value={mediator}>{children}</MediatorContext>;
}

export function useMediator(): Sender {
  const mediator = useContext(MediatorContext);
  if (!mediator) throw new Error('useMediator must be used inside <MediatorProvider>.');
  return mediator;
}
