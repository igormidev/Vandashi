export const transcriptionMessagesEn = {
  appTranscriptionSetupFailed:
    'Transcription setup failed. Check your connection and available disk space, then retry.',
  appTranscriptionFailed:
    'The media could not be transcribed. Your file was preserved. Retry to complete its metadata.',
  appTranscriptionCancelled: 'Transcription was cancelled.',
  appTranscriptionChanged: 'The media changed during transcription. Retry with the current file.',
  appTranscriptionUnavailable: 'Transcription tools are unavailable. Complete setup and retry.',
  appTranscriptionClassificationRequired: 'Choose an audio type before importing this file.',
  appTranscriptionChoiceStale: 'The audio changed after review. Choose its type again.',
  appTranscriptionInvalid: 'The transcription metadata is invalid. Retry to regenerate it.',
} as const;
