import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClipProject } from '../src/infrastructure/media/compositions';
import { applicationFixture } from './application-fixture';

export async function clipCreationFixture() {
  const app = await applicationFixture();
  app.media.createClip.mockImplementation((input) => createClipProject(input, app.media.probeMedia));
  await mkdir(join(app.path, 'renders'));
  const output = join(app.path, 'renders', 'output.mp4');
  await writeFile(output, 'Fixture source bytes (probe supplied separately)');
  await app.store.setRenderedPath(app.scope, output);
  await app.git.commit(app.path, 'Export parent', 'Save current render reference.');
  return {
    ...app,
    input: {
      scope: app.scope,
      name: 'Prepared clip',
      ratio: '9:16' as const,
      start: 2,
      end: 6,
      prompt: '\n  元の説明を残す。 Keep this direction exactly.\n',
      selection: app.request.selection,
    },
  };
}
export type ClipCreationFixture = Awaited<ReturnType<typeof clipCreationFixture>>;
