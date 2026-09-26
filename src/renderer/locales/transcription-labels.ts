export const transcriptionPhaseLabels = {
  installing: 'transcriptionInstalling',
  'model-download': 'transcriptionDownloading',
  checking: 'transcriptionChecking',
  classifying: 'transcriptionClassifying',
  transcribing: 'transcriptionTranscribing',
  aligning: 'transcriptionAligning',
  saving: 'transcriptionSaving',
} as const;
export const audioCategoryLabels = {
  dialog: 'audioDialog',
  music: 'audioMusic',
  'sound-effect': 'audioSoundEffect',
} as const;
