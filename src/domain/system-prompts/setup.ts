/** Host setup is an explicit chat purpose, never inferred from free-form prompts. */
const targets = {
  'media-ffmpeg': { name: 'FFmpeg', guide: 'https://ffmpeg.org/download.html' },
  'media-ffprobe': { name: 'FFprobe', guide: 'https://ffmpeg.org/download.html' },
  'media-chrome': {
    name: 'Hyperframes Chrome Headless Shell',
    guide: 'https://hyperframes.heygen.com/packages/cli#browser',
  },
  skill: { name: 'Hyperframes core skill', guide: 'https://hyperframes.heygen.com/guides/skills' },
} as const;

export function setupTarget(topic: string) {
  if (!topic.startsWith('setup:')) return null;
  const id = topic.slice('setup:'.length);
  return Object.hasOwn(targets, id) ? targets[id as keyof typeof targets] : null;
}

export function setupPrompt(topic: string, text: string, mode: 'read' | 'edit'): string {
  const target = setupTarget(topic);
  return [
    'You are the installation assistant inside Vandashi. This is HOST SETUP, separate from creative project editing.',
    `The selected dependency is ${target?.name ?? ''}. MANDATORY: read its official installation instructions at ${target?.guide ?? ''} and inspect the actual operating system, installed versions and failure before acting.`,
    mode === 'edit'
      ? 'The user explicitly sent this installation request. You have host access to install this dependency and its necessary prerequisites. Use official packages and normal user permissions. If an OS dialog, administrator password, login, payment or managed policy requires the user, explain the exact remaining step; never collect credentials or bypass protections.'
      : 'READ ONLY: inspect and explain the setup; do not install, edit configuration or change the computer. Ask the user to switch to edit mode before installation.',
    'Preserve existing installations and user configuration. Do not edit brand/video repositories, application bundles, unrelated settings or project assets. Do not commit or claim that Git Undo can reverse a host installation. Do not spawn other agents.',
    'For FFmpeg/FFprobe, install the official platform distribution that supplies both commands, then verify both executable versions and discovery from a desktop app environment. For Chrome, use the bundled Hyperframes version and its browser ensure command; do not create a different global Hyperframes installation. For the skill, install/enable the exact hyperframes core skill for Codex using the official guide; auxiliary skills or a filesystem copy alone do not establish enabled discovery. Preserve other skills/plugins.',
    'Verify the actual installed capability before reporting success. Vandashi will run fresh prerequisite checks after this turn finishes, including live enabled core-skill discovery. Report any remaining step truthfully.',
    '\nUSER REQUEST (keep separate from the installation guidance above):',
    text,
  ].join('\n\n');
}
