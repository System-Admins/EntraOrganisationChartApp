import type { EmployeePhotos } from '../../abstractions/employeePhotos';
import { Command, type RequestHandler } from '../../common/mediator';
import type { PhotoAnswers } from './photoAnswers';

/** What the session knows of the people's photos once a check ends. */
export interface PhotoCheckResult {
  /** How many of the people have an answer, earlier ones included; the photo source had none for the others. */
  readonly answered: number;
  /** How many of those have no photo. */
  readonly withoutPhoto: number;
}

/** Finds out who of the people has a photo, asking only about those without an answer yet. Resolves as the check ends or is cancelled. */
export class CheckPhotosCommand extends Command<PhotoCheckResult> {
  constructor(
    readonly employeeIds: readonly string[],
    /** Gets how many of the people are checked so far, those checked earlier in the session included. */
    readonly onProgress?: (checkedCount: number) => void,
    /** Cancels the check; the answers so far are kept. */
    readonly signal?: AbortSignal,
  ) {
    super();
  }
}

export class CheckPhotosHandler implements RequestHandler<CheckPhotosCommand> {
  constructor(
    private readonly photos: EmployeePhotos,
    private readonly answers: PhotoAnswers,
  ) {}

  async handle({ employeeIds, onProgress, signal }: CheckPhotosCommand): Promise<PhotoCheckResult> {
    const known = this.answers.answers;
    const unasked = employeeIds.filter((employeeId) => !known.has(employeeId));
    const checkedBefore = employeeIds.length - unasked.length;
    onProgress?.(checkedBefore);
    const found = await this.photos.havePhotos(
      unasked,
      (askedCount) => {
        onProgress?.(checkedBefore + askedCount);
      },
      signal,
    );
    this.answers.keep(found);
    const answers = employeeIds.map((employeeId) => known.get(employeeId));
    return {
      answered: answers.filter((hasPhoto) => hasPhoto !== undefined).length,
      withoutPhoto: answers.filter((hasPhoto) => hasPhoto === false).length,
    };
  }
}
