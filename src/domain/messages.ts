/** App-authored messages remain distinct from raw agent output and user content. */
export const appMessagesEn = {
  turnSaved: 'Changes saved.',
  turnUnchanged: 'No file changes.',
};

export interface AppMessage {
  id: keyof typeof appMessagesEn;
}
