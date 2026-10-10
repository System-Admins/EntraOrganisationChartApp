/** Who has a photo, as the directory health report's photo check found out; kept for the page's session, so that it isn't asked again. */
export class PhotoAnswers {
  private readonly known = new Map<string, boolean>();

  /** By person; someone not asked yet, or whom the photo source gave no answer for, is missing. */
  get answers(): ReadonlyMap<string, boolean> {
    return this.known;
  }

  keep(answers: ReadonlyMap<string, boolean>): void {
    for (const [employeeId, hasPhoto] of answers) this.known.set(employeeId, hasPhoto);
  }
}
