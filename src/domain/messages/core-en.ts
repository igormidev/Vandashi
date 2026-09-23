export const coreMessagesEn = {
  turnSaved: 'Changes saved.',
  turnUnchanged: 'No file changes.',
  scriptHandoff: 'Update the video to match the script.',
  clipHandoff: 'Create the first {{ratio}} clip from {{start}}s to {{end}}s.',
  invalidDiagnostic: 'Vandashi received an invalid response. Try again.',
  assetMetadataConflict:
    'This asset changed outside the editor. Reset its details to load the latest version before saving.',
  storageAssetDeleteConflict:
    'This asset changed outside the editor. Close this confirmation and review the latest asset before deleting it.',
  appPublishUndoUnavailable:
    'Publishing may have changed an external platform. Revert is unavailable; verify the release in the browser and update its status here.',
  appHyperframesSkillMissing:
    'Codex has not discovered an enabled hyperframes core skill. Open the installation guide to install or enable it outside Vandashi, then check again.',
  appHyperframesSkillUnverified:
    'Could not verify with Codex whether the hyperframes core skill is enabled. Check Codex setup and retry.',
  appUsageUnverified: 'Could not verify your available Codex usage. Check your connection and try again.',
  appWorkspaceRecoveryRequired:
    'Workspace recovery failed. Resolve the reported Git or file error outside Vandashi without discarding your changes, then check again.',
  imageCannotCopy: 'This image cannot be copied.',
  untrustedRequest: 'Untrusted request.',
  unknownOperation: 'Unknown operation.',
  selectedFileUnavailable: 'The selected file is unavailable.',
  recoveredDocument: 'Recovered {{name}} from Git. Your previous text is preserved at {{path}}.',
  restoredDocument: 'Restored the missing {{name}} from Git.',
} as const;
