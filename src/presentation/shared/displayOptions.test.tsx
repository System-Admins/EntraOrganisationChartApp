// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisplayOptionsProvider, useDisplayOptions, type DisplayOptions } from './displayOptions';

afterEach(cleanup);

describe('DisplayOptionsProvider', () => {
  const changed = vi.fn<(options: DisplayOptions) => void>();

  /** Reports the options each time their object is another one, as a card would render again. */
  function Consumer() {
    const options = useDisplayOptions();
    useEffect(() => {
      changed(options);
    }, [options]);
    return null;
  }

  const page = (showLevels: boolean) => (
    <DisplayOptionsProvider value={{ showPhotos: true }}>
      <DisplayOptionsProvider value={{ showLevels }}>
        <Consumer />
      </DisplayOptionsProvider>
    </DisplayOptionsProvider>
  );

  afterEach(() => {
    changed.mockClear();
  });

  it('shows neither photos nor levels where nothing sets the options', () => {
    render(<Consumer />);

    expect(changed).toHaveBeenCalledExactlyOnceWith({ showPhotos: false, showLevels: false });
  });

  it('sets the options it is given and keeps the others from the provider around it', () => {
    render(page(false));

    expect(changed).toHaveBeenCalledExactlyOnceWith({ showPhotos: true, showLevels: false });
  });

  it('hands out the same options while they stay the same, however often the page renders', () => {
    const { rerender } = render(page(true));
    rerender(page(true));
    rerender(page(true));
    expect(changed).toHaveBeenCalledOnce();

    rerender(page(false));
    expect(changed).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenLastCalledWith({ showPhotos: true, showLevels: false });
  });
});
