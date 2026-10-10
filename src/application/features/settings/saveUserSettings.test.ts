import { describe, expect, it, vi } from 'vitest';
import type { UserSettings } from '@/application/settings/userSettings';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { SaveUserSettingsCommand, SaveUserSettingsHandler } from './saveUserSettings';

describe('SaveUserSettingsHandler', () => {
  const settings: UserSettings = {
    hide: { ...SHOW_EVERYONE, guests: true },
    showLevels: false,
    language: 'auto',
    team: null,
    startAt: 'top',
    theme: 'auto',
    textSize: 'standard',
  };

  it('hands the settings to every store', async () => {
    const stores = [{ save: vi.fn() }, { save: vi.fn() }];

    await new SaveUserSettingsHandler(stores).handle(new SaveUserSettingsCommand(settings));

    for (const { save } of stores) expect(save).toHaveBeenCalledExactlyOnceWith(settings);
  });

  it('lets the other stores remember their part when one fails, and then reports the failure', async () => {
    const failing = {
      save: vi.fn(() => {
        throw new Error('The address could not be changed.');
      }),
    };
    const other = { save: vi.fn() };

    const saving = new SaveUserSettingsHandler([failing, other]).handle(new SaveUserSettingsCommand(settings));

    await expect(saving).rejects.toThrow('The address could not be changed.');
    expect(other.save).toHaveBeenCalledExactlyOnceWith(settings);
  });
});
