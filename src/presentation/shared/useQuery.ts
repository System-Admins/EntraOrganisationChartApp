import { useCallback, useEffect, useState } from 'react';
import type { Request } from '@/application/common/mediator';
import { useMediator } from './mediatorContext';

export interface QueryState<T> {
  /** Latest successful response; kept while a newer request is pending or after it failed. */
  readonly data: T | undefined;
  /** Failure of the current request only. */
  readonly error: unknown;
  readonly isLoading: boolean;
  readonly reload: () => void;
}

interface Settled {
  readonly request: Request<unknown>;
  readonly attempt: number;
  readonly error: unknown;
}

/** Sends `request` when its identity changes (memoize it) or on `reload`. Superseded responses are discarded. */
export function useQuery<T>(request: Request<T> | null): QueryState<T> {
  const mediator = useMediator();
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<T>();
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!request) return;
    let current = true;
    mediator.send(request).then(
      (response) => {
        if (!current) return;
        setData(response);
        setSettled({ request, attempt, error: undefined });
      },
      (error: unknown) => {
        if (current) setSettled({ request, attempt, error });
      },
    );
    return () => {
      current = false;
    };
  }, [mediator, request, attempt]);

  const reload = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const isSettled = settled?.request === request && settled.attempt === attempt;
  return {
    data: request ? data : undefined,
    error: isSettled ? settled.error : undefined,
    isLoading: request !== null && !isSettled,
    reload,
  };
}
