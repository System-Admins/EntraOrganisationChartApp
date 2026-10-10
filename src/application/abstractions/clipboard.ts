export interface Clipboard {
  /** Call from a click handler: only a user's gesture may write to the clipboard. False where nothing could, so offer the text instead. */
  copy(text: string): Promise<boolean>;
}
