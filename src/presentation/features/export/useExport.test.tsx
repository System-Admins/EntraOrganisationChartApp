// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Request, Sender } from '@/application/common/mediator';
import { ExportEmployeesCommand } from '@/application/features/export/exportEmployees';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { MediatorProvider } from '../../shared/mediatorContext';
import { useExport } from './useExport';

const OPTIONS = { topPersons: ['ceo'], hide: SHOW_EVERYONE };

async function sentOnExport(): Promise<readonly Request<unknown>[]> {
  const sent: Request<unknown>[] = [];
  const mediator: Sender = {
    send: <T,>(request: Request<T>) => {
      sent.push(request);
      return Promise.resolve(undefined as T);
    },
  };
  const wrapper = ({ children }: { children: ReactNode }) => <MediatorProvider mediator={mediator}>{children}</MediatorProvider>;
  const { result } = renderHook(() => useExport(OPTIONS), { wrapper });
  await act(() => result.current.exportToCsv());
  return sent;
}

afterEach(cleanup);

describe('useExport', () => {
  it('writes the file in the language of the page', async () => {
    const [command] = await sentOnExport();

    expect(command).toBeInstanceOf(ExportEmployeesCommand);
    expect(command).toMatchObject({ options: OPTIONS, language: 'en' });
  });
});
