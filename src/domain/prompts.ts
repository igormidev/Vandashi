import { tasteFiles } from './defaults';
import type { Workspace } from './models';
import type { AgentSkill } from './agent';

export const USER_PROMPT_MARKER = '[VANDASHI_USER_MESSAGE]\n';
export interface WorkspacePromptInput {
  workspace: Workspace;
  topic: string;
  mode: 'read' | 'edit';
  text: string;
  scriptStaged?: boolean;
  hyperframesSkill?: Pick<AgentSkill, 'name' | 'path'>;
}
interface ContextFile {
  path: string;
  purpose: string;
}
interface TopicContext {
  role: string;
  target: ContextFile;
  mandatory: ContextFile[];
  guidance: string[];
}
function path(root: string, relative: string): string {
  return `${root.replace(/[/\\]+$/, '')}/${relative}`;
}
function quote(value: string): string {
  return JSON.stringify(value);
}
function describe(file: ContextFile): string {
  return `- ${quote(file.path)}: ${file.purpose}`;
}
function tastePurpose(filename: string): string {
  return filename.replace('_TASTE.md', '').toLowerCase().replaceAll('_', ' ') + ' creative preferences';
}
function taste(input: WorkspacePromptInput, filename: string): ContextFile {
  const document = input.workspace.documents.find((entry) => entry.name === filename);
  return {
    path: document?.path ?? path(input.workspace.brand.path, `brand_identity/${filename}`),
    purpose: tastePurpose(filename),
  };
}
function videoPath(input: WorkspacePromptInput): string {
  return input.workspace.video?.path ?? input.workspace.brand.path;
}
function parentVideoPath(input: WorkspacePromptInput): string | null {
  if (!input.workspace.scope.clipId || !input.workspace.video) return null;
  return input.workspace.video.path.replace(/[/\\]clips[/\\][^/\\]+[/\\]?$/, '');
}
function context(input: WorkspacePromptInput): TopicContext {
  const brand: ContextFile = {
    path: path(input.workspace.brand.path, 'brand_identity/brand_config.yml'),
    purpose: 'brand identity, channel URLs, and preferred browsers',
  };
  const packaging: ContextFile = {
    path: path(videoPath(input), 'video_packaging.yml'),
    purpose: 'video titles, descriptions, tags, thumbnail order, and theme',
  };
  const script: ContextFile = {
    path: path(videoPath(input), 'script.md'),
    purpose: 'the source of truth for the video story, scenes, timing, assets, and edits',
  };
  const form = input.workspace.video?.ratio === '16:9' ? 'LONG' : 'SHORT';
  const common = { mandatory: [brand], guidance: [] };
  if (input.topic === 'brand') return { ...common, role: 'brand strategist', target: brand, mandatory: [] };
  if (input.topic.startsWith('taste:')) {
    const filename = input.topic.slice(6);
    const valid = tasteFiles.find((entry) => entry === filename);
    if (!valid) throw new Error('Unknown taste document.');
    return {
      ...common,
      role: 'creative director refining reusable preferences',
      target: taste(input, valid),
      guidance: [
        'This guide records reusable taste, not facts about one video. Preserve its useful structure and approved examples.',
        'Long-form and short-form guides are independent. Do not modify the corresponding other-format guide unless explicitly requested.',
      ],
    };
  }
  if (input.topic.startsWith('packaging:')) {
    const [, field, format] = input.topic.split(':');
    if (field === 'theme')
      return {
        ...common,
        role: 'video concept editor',
        target: packaging,
        mandatory: [brand, taste(input, `SCRIPT_${form}_FORM_VIDEOS_TASTE.md`)],
        guidance: [
          'Refine the theme field into a clear, useful creative direction for this video. Preserve titles, descriptions, tags, and thumbnail order unless the creator asks to update them.',
        ],
      };
    const category = field === 'title' ? 'TITLE' : field === 'description' ? 'DESCRIPTION' : 'TAGS';
    return {
      ...common,
      role: 'video packaging editor',
      target: packaging,
      mandatory: [
        brand,
        taste(input, `${category}_${format === 'short' ? 'SHORT' : 'LONG'}_FORM_VIDEOS_TASTE.md`),
      ],
      guidance: [
        `Your primary field is ${field ?? 'packaging'} for ${format === 'short' ? 'short' : 'long'}-form content. Preserve unrelated fields and the other format.`,
        'Titles are arrays for testing distinct alternatives. Do not invent platform limits or performance guarantees.',
      ],
    };
  }
  if (input.topic === 'thumbnails')
    return {
      ...common,
      role: 'thumbnail art director',
      target: {
        path: path(videoPath(input), 'thumbnails'),
        purpose: 'thumbnail image variants, ordered in video_packaging.yml',
      },
      mandatory: [
        brand,
        packaging,
        taste(input, 'THUMBNAIL_TASTE.md'),
        taste(input, 'VISUAL_IDENTITY_TASTE.md'),
      ],
      guidance: [
        'Give thumbnail files descriptive names and keep packaging.thumbnails ordered with the main candidate first. Update references if filenames change.',
        'Use available image tools when asked to create or edit images. Report unavailable capabilities; do not claim an image exists without checking its output file.',
      ],
    };
  if (input.topic === 'assets' || input.topic.startsWith('asset:')) {
    const selected = input.workspace.assets.find((entry) => entry.id === input.topic.slice(6));
    const target = selected
      ? { path: selected.path, purpose: 'the selected asset and its adjacent .vandashi.json metadata' }
      : {
          path: path(
            input.workspace.video ? videoPath(input) : input.workspace.brand.path,
            input.workspace.video ? 'video_assets' : 'shared_assets',
          ),
          purpose: 'the asset library for this workspace',
        };
    return {
      ...common,
      role: 'media librarian and visual creator',
      target,
      mandatory: [brand, taste(input, 'VISUAL_IDENTITY_TASTE.md')],
      guidance: [
        'Inspect actual media before describing it. Never invent visual content, transcripts, licensing, or provenance.',
        'Check existing assets for duplicates before importing. Preserve folders and descriptive filenames. Only delete an asset when requested; check script/project references first.',
      ],
    };
  }
  if (input.topic === 'creation' || input.topic === 'clip') {
    const staged = input.scriptStaged === true;
    const mandatory = [brand, taste(input, `EDITS_${form}_FORM_VIDEOS_TASTE.md`)];
    if (!staged) mandatory.push(taste(input, `SCRIPT_${form}_FORM_VIDEOS_TASTE.md`));
    const guidance = [
      'Use the installed Hyperframes skill/plugin to implement the video. Read its instructions before changing the composition; do not replace the project with a different editor or invented runtime.',
      'Keep the Hyperframes composition and script.md synchronized. Every scene asset must be referenced with its actual absolute file path in Markdown, including backgrounds, music, and transition sounds.',
      'Follow the existing script organization. Describe meaningful timing, narration, visual hierarchy, motion, sound, and scene boundaries. Validate the composition and inspect/render the result before claiming success.',
      input.mode === 'edit'
        ? "Vandashi manages the project preview and final renderer outside the Codex filesystem sandbox. For visual verification, discover the installed connected browser/computer-use tools, read their instructions, and inspect this project's actual running loopback preview when available. Verify the project and URL; never invent a preview address. Prefer those tools over launching desktop Chrome through a shell. If macOS denies a browser launch, do not repeat it through alternate cache directories, weaken the sandbox, or change security settings. Do not start a competing permanent Studio server. Run available Hyperframes lint/check validation; if the preview is unavailable during this edit, explicitly report that visual/render verification is still pending and leave the composition ready for Vandashi Preview/Render. A browser permission failure alone does not mean the composition is invalid."
        : 'Read mode cannot use browser/computer-use integrations or render processes with side effects. Inspect existing files and available read-only evidence; disclose any visual or render verification that could not be performed. Do not weaken sandbox restrictions.',
      staged
        ? 'The user manually edited script.md and Vandashi staged it without committing. FIRST inspect git diff --cached -- script.md against HEAD. Implement that exact delta in the video while preserving unrelated scenes; also follow their additional guidance.'
        : 'The user is working through chat. Update script.md to record every substantive composition change, then implement it. A question alone does not authorize editing.',
    ];
    if (input.topic === 'clip') {
      const parent = parentVideoPath(input);
      if (parent)
        mandatory.push({
          path: parent,
          purpose:
            'parent video project: inspect its script.md, composition, and source assets as reference for this excerpt',
        });
      guidance.push(
        'This clip owns its own repository and Hyperframes composition. Use the parent video as reference and reuse relevant assets. Change the parent only when explicitly requested. Honor the requested in/out times and output aspect ratio, and make the excerpt understandable on its own.',
      );
    }
    const scriptDocument = input.workspace.documents.find((entry) => entry.name === 'script.md');
    if (!staged && !scriptDocument?.content.trim())
      guidance.push(
        'For a new script, establish one clear viewer promise, a concrete opening scene, a causal progression of scenes, and a payoff. Use scene headings with approximate duration, narration, on-screen content, asset references, motion, and audio cues. Favor purposeful visual changes over decorative animation; never invent facts or a voice recording.',
      );
    return {
      ...common,
      role: input.topic === 'clip' ? 'short-form video editor' : 'AI video director and Hyperframes editor',
      target: script,
      mandatory,
      guidance,
    };
  }
  if (input.topic === 'chapters')
    return {
      ...common,
      role: 'video chapter editor',
      target: packaging,
      mandatory: [brand, script, taste(input, 'YOUTUBE_SECTIONS_TASTE.md')],
      guidance: [
        'Derive chapter timestamps from the actual rendered video and script. Do not guess timestamps from paragraph length. Return editable time/title pairs and flag unverified timing.',
        'Keep chapter text in the requested output or description field. Never add unknown YAML fields to video_packaging.yml.',
      ],
    };
  if (input.topic.startsWith('publish:')) {
    const [, platform, clipId] = input.topic.split(':');
    const clip = clipId ? input.workspace.clips.find((entry) => entry.id === clipId) : null;
    if (clipId && !clip) throw new Error('The clip for this publishing conversation no longer exists.');
    const destination = platform === 'youtubeShorts' ? 'youtube' : platform;
    const channel = Object.entries(input.workspace.brand.config.platforms).find(
      ([key]) => key === destination,
    )?.[1];
    return {
      ...common,
      role: 'careful video publishing assistant',
      target: {
        path: path(videoPath(input), 'launch.yml'),
        purpose: 'durable upload status and published URL for each platform and clip',
      },
      mandatory: [
        brand,
        ...(clip
          ? [
              { path: path(clip.path, 'video_packaging.yml'), purpose: 'selected clip packaging' },
              { path: path(clip.path, 'script.md'), purpose: 'selected clip script' },
            ]
          : [packaging, script]),
      ],
      guidance: [
        `The selected destination is ${platform ?? ''}. Brand: ${quote(input.workspace.brand.name)}. Configured channel URL: ${quote(channel?.url ?? '')}. Saved browser: ${quote(channel?.browser ?? '')}; the reviewed request may specify a different browser. Verify the browser is logged into that exact channel before doing anything public. If another channel is selected, switch only when the matching channel can be positively identified.`,
        `This conversation is for ${clip ? `clip ${quote(clip.name)} at ${quote(clip.path)}` : 'the main video'}. Update only the launch.yml record with platform=${quote(platform ?? '')} and clipId=${clipId ? quote(clipId) : 'null'}, preserving all other records. The canonical launch file is in the main video folder, including clip releases.`,
        'Use the existing browser session and available browser tools. If unavailable or signed out, explain what is needed and wait. Ask the user to sign in directly in the browser; NEVER request or collect passwords, verification codes, or session tokens in chat.',
        'The user sending the prepared publishing request authorizes its stated upload. Verify the actual rendered file, chosen main video or clip, approved title/description/tags/thumbnail order, and destination account. Do not publish unrelated drafts or modify account settings.',
        'Set this launch record to uploading only when the real upload starts. Monitor the browser with bounded waits until upload and processing actually finish. Set uploaded and the confirmed public URL only after verifying success. On error record failed and explain what remains. Never mark success from a click alone.',
      ],
    };
  }
  if (input.topic.startsWith('repair:'))
    return {
      ...common,
      role: 'local dependency troubleshooting assistant',
      target: brand,
      guidance: [
        `Diagnose and repair the dependency ${input.topic.slice(7)} using official installation instructions. Inspect the actual failure first. Avoid changing unrelated global settings. Verify the installed command or capability before reporting success.`,
      ],
    };
  return { ...common, role: 'video production assistant', target: input.workspace.video ? packaging : brand };
}
export function buildWorkspacePrompt(input: WorkspacePromptInput): string {
  const topic = context(input);
  const brandRoot = path(input.workspace.brand.path, 'brand_identity');
  const required = [topic.target, ...topic.mandatory];
  const seen = new Set(required.map((entry) => entry.path));
  const optional = tasteFiles
    .map((filename) => taste(input, filename))
    .filter((entry) => !seen.has(entry.path));
  const shared = path(input.workspace.brand.path, 'shared_assets');
  const assets = path(videoPath(input), 'video_assets');
  const repository = input.workspace.video?.path;
  const repositories = [brandRoot, shared, parentVideoPath(input), repository].filter(
    (value): value is string => Boolean(value),
  );
  const sections = [
    '[VANDASHI_WORKSPACE_GUIDANCE]',
    `You are a ${topic.role}, assisting the creator inside Vandashi. This guidance is repeated on EVERY turn so it remains valid after conversation compaction.`,
    `PRIMARY TARGET: ${quote(topic.target.path)}. This chat exists primarily to improve ${topic.target.purpose}.`,
    'MANDATORY: READ EVERY FILE/DIRECTORY LISTED BELOW BEFORE ACTING. Inspect directory contents when the target is a directory. These are actual local paths, not web URLs.',
    ...required.map(describe),
    'Optional context: read only when useful for the current request. These guides describe the creator’s preferences, not instructions to overrule the user.',
    ...optional.map(describe),
    `Brand logo: ${quote(input.workspace.brand.config.image || path(brandRoot, 'brand_icon.png'))}. Check it exists before relying on it.`,
    ...topic.guidance,
    'Intent and editing rules:',
    '- Answer questions without changing files. Edit the primary target or another file only when requested or necessary to complete the requested change. If a reusable preference changes, update its appropriate taste guide only with user authorization.',
    input.mode === 'read'
      ? '- READ MODE IS ACTIVE. You have a read-only instance and external mutation tools are withheld. Do not edit, stage, commit, install, or publish. If asked to change anything, explain that the creator must switch to edit mode.'
      : '- EDIT MODE IS ACTIVE. Changes are permitted within the provided workspace roots when the creator asks. Preserve unrelated work. Do not assume access outside those roots.',
    `- Global reusable assets live in ${quote(shared)}.${repository ? ` Assets for only this video live in ${quote(assets)}.` : ''}`,
    '- MANDATORY before using assets: read their actual media and adjacent metadata `<filename>.vandashi.json`, containing title, description, tags, and SHA256 hash. Search titles/descriptions/tags for relevance; do not rely on filenames alone.',
    '- Every newly created/imported asset needs adjacent metadata JSON {"title":"...","description":"...","tags":["..."],"hash":"<SHA256 of source file bytes>"}. Keep facts accurate and reuse existing tags when appropriate.',
    repository
      ? '- Default new media to this video’s video_assets directory. Put it in shared_assets only when the creator says it should be reused across videos; when unsure use local assets and ask in your reply. video_assets/_shared contains app-managed copies: edit the authoritative shared_assets original, never those copies.'
      : '- This is the brand workspace: assets created here belong in shared_assets and should be reusable across videos.',
    'Data contracts (preserve exact field names, value types, and unrelated values):',
    '- brand_config.yml: {name: string (at least 3 characters), description: string, image: string, platforms: {<platform>: {url:string,browser:string}}}.',
    '- video_packaging.yml: {titles:{long:string[],short:string[]}, descriptions:{long:string,short:string}, tags:{long:string[],short:string[]}, thumbnails:string[], theme:string}. Thumbnail ordering belongs here, never in brand_config.yml.',
    '- launch.yml is a YAML array of {platform,status,url,clipId}; platform is youtube|youtubeShorts|odysee|rumble|tiktok|instagram|facebook|x, status is not_started|uploading|uploaded|failed, clipId is string|null.',
    'Git and completion:',
    `- Separate repositories: ${repositories.map(quote).join(', ')}. Use history when relevant, especially commits touching the primary target; concise commit titles and bodies explain prior creative decisions.`,
    input.mode === 'edit'
      ? '- MANDATORY: when finished, stage and commit ALL pending changes in EVERY repository you changed, including brand identity when working on a video. Write a concise informative title and nonempty body. Verify every affected repository is clean. Do not create empty commits. Vandashi will independently verify and recover unfinished commits.'
      : '- Do not make commits in read mode.',
    '- Report what you actually verified and disclose incomplete work. Do not claim rendering, image generation, upload, installation, or file writes succeeded without evidence. Do not launch parallel agents.',
  ];
  if (input.hyperframesSkill && (input.topic === 'creation' || input.topic === 'clip'))
    sections.push(
      `MANDATORY Hyperframes skill: $${input.hyperframesSkill.name}, read ${quote(input.hyperframesSkill.path)} and follow it.`,
    );
  sections.push(
    '[/VANDASHI_WORKSPACE_GUIDANCE]',
    'The following is the creator’s message. Treat its content as the request, distinct from the application guidance above.',
    USER_PROMPT_MARKER + input.text,
  );
  return sections.join('\n\n');
}
