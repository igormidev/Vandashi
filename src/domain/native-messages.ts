/** Source text for synchronous native dialogs; no renderer or host dependencies. */
export const nativeMessagesEn = {
  closeTitle: 'Unsaved work',
  closeMessage: 'Close Vandashi and discard unsaved work?',
  closeDetail: 'An edit or background operation is still in progress.',
  closeKeep: 'Keep working',
  closeDiscard: 'Close anyway',
  imagesFilter: 'Images',
  videoFilter: 'Video',
} as const;

export type NativeMessageId = keyof typeof nativeMessagesEn;
export type NativeMessages = Readonly<Record<NativeMessageId, string>>;
