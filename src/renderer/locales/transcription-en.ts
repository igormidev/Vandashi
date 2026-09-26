export const transcriptionEn = {
  transcriptionPreparing: 'Preparing audio and video',
  transcriptionInstalling: 'Installing transcription tools…',
  transcriptionDownloading: 'Downloading speech model…',
  transcriptionChecking: 'Checking audio metadata…',
  transcriptionClassifying: 'Identifying audio type…',
  transcriptionTranscribing: 'Transcribing speech…',
  transcriptionAligning: 'Aligning words…',
  transcriptionSaving: 'Saving transcription…',
  transcriptionCount: '{{completed}} / {{total}} files',
  transcriptionModel: 'Transcription model',
  transcriptionModelHelp:
    'Runs locally with WhisperX. Selecting a model downloads it if needed; larger models use more disk space and take longer. Existing transcripts are kept.',
  audioCategory: 'Audio type',
  audioCategoryChoose: 'Choose an audio type',
  audioDialog: 'Dialogue',
  audioMusic: 'Music',
  audioSoundEffect: 'Sound effect',
  audioCategoryHelp:
    'Dialogue is transcribed with timestamps. Music and sound effects are tagged without transcription.',
} as const;
