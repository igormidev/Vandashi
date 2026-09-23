/** Codex adapter messages owned by Vandashi, separate from provider output. */
export const codexMessagesEn = {
  codexNativeBinaryRequired:
    'Set VANDASHI_CODEX_PATH to the native codex.exe executable, not a command shell wrapper.',
  codexModelCursorRepeated: 'Codex model pagination repeated a cursor.',
  codexBrowserCursorRepeated: 'Browser capability pagination repeated a cursor.',
  codexHistoryCursorRepeated: 'Codex history pagination repeated a cursor.',
  codexMessageTooLarge: 'Codex message exceeded the size limit.',
  codexStartFailed: 'Could not start Codex:',
  codexExited: 'Codex exited ({{code}}).',
  codexDisconnected: 'Codex is disconnected.',
  codexRequestTimeout: 'Codex did not respond to {{method}}.',
  codexConnectionClosed: 'Codex connection closed.',
  codexProgressTimeout: 'Codex stopped reporting progress.',
  codexUncertainStart:
    'Codex did not confirm the turn start. Its process was stopped; any changes will be preserved.',
  codexDifferentThread: 'Codex returned a different conversation.',
  codexBusy: 'Another AI operation is already running.',
  codexModelUnavailable: 'The selected model is unavailable: {{model}}',
  codexReasoningUnavailable: 'The selected reasoning level is unavailable for {{model}}.',
  codexFastUnavailable: 'Fast mode is unavailable for {{model}}.',
  codexWaitBeforeUndo: 'Wait for the active AI operation before undoing.',
  codexRequestWithheld:
    'Codex requested {{method}}. This action was withheld; reply to any question in the conversation.',
} as const;
