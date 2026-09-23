import { describe, expect, it } from 'vitest';
import { buildWorkspacePrompt, USER_PROMPT_MARKER } from '../src/domain/prompts';
import type { Workspace } from '../src/domain/models';

const workspace: Workspace = {
  scope: { brandId: 'brand', videoId: 'video', clipId: null },
  brand: {
    id: 'brand',
    name: 'Example',
    path: '/studio/Example',
    lastOpened: '',
    config: { name: 'Example', description: '', image: '', platforms: {} },
  },
  video: {
    id: 'video',
    brandId: 'brand',
    name: 'video',
    path: '/studio/Example/videos/video',
    ratio: '16:9',
    updatedAt: '',
    renderedPath: null,
    packaging: {
      titles: { long: [], short: [] },
      descriptions: { long: '', short: '' },
      tags: { long: [], short: [] },
      thumbnails: [],
      theme: '',
    },
  },
  documents: [],
  assets: [],
  clips: [],
  launches: [],
  revision: 'head',
  dirty: false,
};
const base = { workspace, mode: 'edit' as const, text: 'Make the opening clearer.' };
describe('workspace prompts', () => {
  it('requires the correct format guide and preserves the other format', () => {
    const prompt = buildWorkspacePrompt({ ...base, topic: 'packaging:title:short' });
    const mandatory = prompt.split('Optional context:')[0];
    expect(mandatory).toContain('TITLE_SHORT_FORM_VIDEOS_TASTE.md');
    expect(mandatory).not.toContain('TITLE_LONG_FORM_VIDEOS_TASTE.md');
    expect(prompt).toContain('Preserve unrelated fields and the other format');
    expect(prompt.endsWith(USER_PROMPT_MARKER + base.text)).toBe(true);
  });
  it('distinguishes staged script implementation from writing a new script', () => {
    const staged = buildWorkspacePrompt({
      ...base,
      topic: 'creation',
      scriptStaged: true,
      hyperframesSkill: { name: 'hyperframes', path: '/skills/hyperframes/SKILL.md' },
    });
    expect(staged).toContain('git diff --cached -- script.md');
    expect(staged).toContain('EDITS_LONG_FORM_VIDEOS_TASTE.md');
    expect(staged.split('Optional context:')[0]).not.toContain('SCRIPT_LONG_FORM_VIDEOS_TASTE.md');
    expect(staged).toContain('/skills/hyperframes/SKILL.md');
    expect(buildWorkspacePrompt({ ...base, topic: 'creation' })).toContain(
      'For a new script, establish one clear viewer promise',
    );
  });
  it('withholds edits and commits in read mode', () => {
    const prompt = buildWorkspacePrompt({ ...base, topic: 'brand', mode: 'read' });
    expect(prompt).toContain('READ MODE IS ACTIVE');
    expect(prompt).toContain('Do not make commits in read mode');
    expect(prompt).not.toContain('stage and commit ALL');
  });
  it('uses connected preview controls in edit mode and preserves read-mode tool restrictions', () => {
    for (const topic of ['creation', 'clip']) {
      const edit = buildWorkspacePrompt({ ...base, topic });
      expect(edit).toContain('installed connected browser/computer-use tools');
      expect(edit).toContain('never invent a preview address');
      expect(edit).toContain('visual/render verification is still pending');
      const read = buildWorkspacePrompt({ ...base, topic, mode: 'read' });
      expect(read).toContain('Read mode cannot use browser/computer-use integrations');
      expect(read).not.toContain('discover the installed connected');
    }
  });
  it('requires verified publishing and keeps credentials out of chat', () => {
    const prompt = buildWorkspacePrompt({ ...base, topic: 'publish:youtube' });
    expect(prompt).toContain('exact channel');
    expect(prompt).toContain('NEVER request or collect passwords');
    expect(prompt).toContain('only after verifying success');
    expect(prompt).toContain('launch.yml is a YAML array');
    expect(prompt).toContain('video_assets/_shared contains app-managed copies');
  });
  it('rejects unknown taste paths rather than granting arbitrary file ownership', () => {
    expect(() => buildWorkspacePrompt({ ...base, topic: 'taste:../../secret' })).toThrow('Unknown taste');
  });
  it('gives theme editing the script guide and clip editing the actual parent project', () => {
    const theme = buildWorkspacePrompt({ ...base, topic: 'packaging:theme' });
    expect(theme.split('Optional context:')[0]).toContain('SCRIPT_LONG_FORM_VIDEOS_TASTE.md');
    expect(theme).toContain('Refine the theme field');
    if (!workspace.video) throw new Error('Fixture is missing its video.');
    const clip = buildWorkspacePrompt({
      ...base,
      topic: 'clip',
      workspace: {
        ...workspace,
        scope: { ...workspace.scope, clipId: 'excerpt' },
        video: { ...workspace.video, path: '/studio/Example/videos/video/clips/Excerpt', ratio: '9:16' },
      },
    });
    expect(clip.split('Optional context:')[0]).toContain(
      '"/studio/Example/videos/video": parent video project',
    );
    expect(clip).toContain('SCRIPT_SHORT_FORM_VIDEOS_TASTE.md');
  });
});
