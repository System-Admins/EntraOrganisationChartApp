import { createContext, useContext, type ReactNode } from 'react';
import type { SupportDesk } from '@/application/settings/appSettings';

/** None where no provider names one: config.json names none, or could not be read, and in tests that set none. */
const SupportDeskContext = createContext<SupportDesk | null>(null);

export function SupportDeskProvider({ desk, children }: { desk: SupportDesk | null; children: ReactNode }) {
  return <SupportDeskContext value={desk}>{children}</SupportDeskContext>;
}

export function useSupportDesk(): SupportDesk | null {
  return useContext(SupportDeskContext);
}
