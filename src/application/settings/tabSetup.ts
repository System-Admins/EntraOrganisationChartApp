/** What a Teams channel, chat or meeting tab shows, which its address holds as ?top= and ?depth= (applyUrlOverrides). */
export interface TabSetup {
  /** By e-mail address, UPN or object id; none for the whole organization. */
  readonly topPersons: readonly string[];
  /** Levels unfolded at start; null leaves them to config.json's chart.expandDepth. */
  readonly depth: number | null;
}
