/** Someone chosen in the host's people picker. */
export interface PickedPerson {
  /** The object id, by which the picker shows people as chosen when it opens. */
  readonly id: string;
  /** What a tab's address names them by (TabSetup): their e-mail address, else their object id. */
  readonly identifier: string;
  /** Null where the picker gave no name. */
  readonly displayName: string | null;
}

/** The host's own people picker (Teams'), which needs no permission or sign-in of the chart's. */
export interface PeoplePicker {
  /** Opens with the people of `chosenIds` chosen, and answers everyone chosen as it closes; null where it was cancelled. */
  pick(chosenIds: readonly string[]): Promise<readonly PickedPerson[] | null>;
}
