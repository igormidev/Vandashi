import { dirname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
const powershell = (value: string) => "'" + value.replaceAll("'", "''") + "'";

/** App-owned instructions stay outside user repositories and are refreshed with each app release. */
export async function writeTranscriptionGuide(input: {
  path: string;
  executable: string;
  cli: string;
  cache: string;
  worker: string;
}): Promise<void> {
  const args = [
    input.executable,
    input.cli,
    '--cache',
    input.cache,
    '--worker',
    input.worker,
    '--profile',
    dirname(input.cache),
    '--offline',
  ];
  const command =
    process.platform === 'win32'
      ? "$env:ELECTRON_RUN_AS_NODE='1'; & " + args.map(powershell).join(' ')
      : 'ELECTRON_RUN_AS_NODE=1 ' + args.map(quote).join(' ');
  await mkdir(dirname(input.path), { recursive: true });
  await writeFile(
    input.path,
    `# Mandatory asset transcription\n\nEvery added or downloaded audio/video asset must be classified and verified before editing uses it. This includes conversation attachments copied into the project. Do not infer completion from a filename or fabricate timing.\n\n1. Copy/download the original into this video's video_assets directory, or the brand's shared_assets only when requested. Never analyze a copied _shared file: use the original shared_assets source.\n2. Run the exact Vandashi command below with the canonical absolute media path. It uses the same WhisperX/YAMNet pipeline and metadata writer as the app. Use --category dialog, music, or sound-effect only when the user's choice is known; otherwise keep automatic classification. Videos always analyze speech.\n\n\`\`\`sh\n${command} --file '/absolute/path/to/video_assets/media.mp4'\n\`\`\`\n\nThe command follows the saved Vandashi transcription model (initially large-v3-turbo). Optional --model overrides: tiny, base, small, medium, large-v3. Setup downloads are managed by Vandashi. If the sandbox blocks missing model/alignment downloads, report the failure truthfully; the app's final verification will finish this work before accepting the edit. Never broaden sandbox permissions or substitute sampled speech for a full transcript.\n\n3. Require exit code 0 and the JSON result verified:true. Read the adjacent <media filename>.vandashi.json and check analysis.category first. Dialogue must have analysis.transcription.status=complete and a list of source-relative start/end/text segments. Empty segments mean a completed no-speech analysis. Music/sound-effect metadata records not-required; silent video may record no-audio. Do not claim success if any verification fails.\n4. Tell the user whether the asset is audio or video and its category. Mention a failure if metadata remains incomplete.\n\n## Editing with timing evidence\n\nAlways read transcript metadata before manipulating audio/video. Segments and words use seconds in the ORIGINAL asset. Apply source trim offsets and playback speed when placing captions or visuals on the composition timeline. Prefer aligned word times for captions; when alignment is segment-only, use segment boundaries and do not invent word timing. Transcripts provide context for synchronizing image changes with the spoken words. Read the script and active edit guide as well.\n\n## Storage and ownership\n\nThe .vandashi.json sidecar is durable media metadata. analysis.sourceHash identifies analyzed source bytes; analysisContentHash/contentHash bind the transcript to the current stored media. Vandashi preserves that binding across its own metadata embedding and invalidates it after an external media replacement. Never hand-edit these hashes or mark unprocessed media complete. The command preserves source media bytes and does not commit. Vandashi owns final verification, shared-copy synchronization and Git commits after the agent stops.\n`,
    { mode: 0o600 },
  );
}
