import { createContext, useContext, useMemo, type ReactNode } from 'react';

export interface DisplayOptions {
  readonly showPhotos: boolean;
  readonly showLevels: boolean;
}

const DisplayOptionsContext = createContext<DisplayOptions>({ showPhotos: false, showLevels: false });

/** Sets the options it is given; the others stay as the provider around it has them. */
export function DisplayOptionsProvider({ value, children }: { value: Partial<DisplayOptions>; children: ReactNode }) {
  const outer = useContext(DisplayOptionsContext);
  const showPhotos = value.showPhotos ?? outer.showPhotos;
  const showLevels = value.showLevels ?? outer.showLevels;
  // One object while the options stay the same: the page renders on every zoom step, and a new one renders every card.
  const options = useMemo(() => ({ showPhotos, showLevels }), [showPhotos, showLevels]);
  return <DisplayOptionsContext value={options}>{children}</DisplayOptionsContext>;
}

export function useDisplayOptions(): DisplayOptions {
  return useContext(DisplayOptionsContext);
}
