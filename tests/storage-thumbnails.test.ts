import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';

it('imports release artwork without disabling a clean rendered video and invalidates actual thumbnail dependencies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vandashi-thumbnail-'));
  try {
    const git = new LocalGit();
    const store = new LocalStorage(join(directory, 'settings'), git);
    const brand = await store.createBrand({ parentPath: directory, name: 'Thumbnail studio' });
    const workspace = await store.createVideo({ brandId: brand.id, name: 'Release', ratio: '16:9' });
    const project = await store.projectPath(workspace.scope);
    await writeFile(join(project, 'index.html'), '<main>Static scene</main>');
    await git.commit(project, 'Create scene', 'Prepare the source for rendering.');
    await mkdir(join(project, 'output'));
    const rendered = join(project, 'output', 'final.mp4');
    await writeFile(rendered, 'Rendered fixture');
    await store.setRenderedPath(workspace.scope, rendered);
    await git.commit(project, 'Record render', 'Store the matching render revision.');
    const original = await store.openWorkspace(workspace.scope);
    const image = join(directory, 'city.svg');
    await writeFile(image, '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="600"/>');
    const imported = await store.importThumbnail({ scope: workspace.scope, sourcePath: image });
    expect(imported.video?.packaging.thumbnails).toEqual(['thumbnails/city.svg']);
    expect(imported.video?.renderedPath).toBe(rendered);
    expect(imported.dirty).toBe(false);
    expect(imported.revision).not.toBe(original.revision);
    await writeFile(join(project, 'index.html'), '<img src="thumbnails/city.svg">');
    await git.commit(project, 'Use artwork in scene', 'The thumbnail now affects rendered content.');
    await store.setRenderedPath(workspace.scope, rendered);
    await git.commit(project, 'Record new render', 'Render with the thumbnail dependency.');
    await writeFile(
      join(project, 'thumbnails/city.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"/>',
    );
    await git.commit(project, 'Change used image', 'Update the composition dependency.');
    expect((await store.openWorkspace(workspace.scope)).video?.renderedPath).toBeNull();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
