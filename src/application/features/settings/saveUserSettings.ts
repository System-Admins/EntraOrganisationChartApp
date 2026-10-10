import type { UserSettingsStore } from '../../abstractions/userSettingsStore';
import { Command, type RequestHandler } from '../../common/mediator';
import type { UserSettings } from '../../settings/userSettings';

export class SaveUserSettingsCommand extends Command {
  constructor(readonly settings: UserSettings) {
    super();
  }
}

export class SaveUserSettingsHandler implements RequestHandler<SaveUserSettingsCommand> {
  constructor(private readonly stores: readonly UserSettingsStore[]) {}

  handle({ settings }: SaveUserSettingsCommand): Promise<void> {
    let failure: Error | null = null;
    for (const store of this.stores) {
      // A store that fails must not keep the others from remembering their part.
      try {
        store.save(settings);
      } catch (error) {
        failure ??= error instanceof Error ? error : new Error(String(error));
      }
    }
    return failure ? Promise.reject(failure) : Promise.resolve();
  }
}
