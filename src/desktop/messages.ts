/** English source strings; translations are added after feature verification. */
export const desktopMessages = {
  closeTitle: 'Unsaved work',
  closeMessage: 'Close Vandashi and discard unsaved work?',
  closeDetail: 'An edit or background operation is still in progress.',
  closeKeep: 'Keep working',
  closeDiscard: 'Close anyway',
  recovery: (name: string, backupPath: string | null) =>
    backupPath
      ? `Recovered ${name} from Git. Your previous text is preserved at ${backupPath}.`
      : `Restored the missing ${name} from Git.`,
};
