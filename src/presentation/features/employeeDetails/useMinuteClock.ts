import { useEffect, useState } from 'react';

const MINUTE_MS = 60_000;

/** The time now, as Date.now gives it, renewed as each minute starts while the component is mounted. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const waitForNextMinute = () => {
      // To the minute's start, not a minute on from now: a clock a minute behind would be wrong for most of each minute.
      timer = setTimeout(() => {
        setNow(Date.now());
        waitForNextMinute();
      }, MINUTE_MS - (Date.now() % MINUTE_MS));
    };
    waitForNextMinute();
    return () => {
      clearTimeout(timer);
    };
  }, []);

  return now;
}
