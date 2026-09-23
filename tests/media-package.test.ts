import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { _electron, type ElectronApplication } from '@playwright/test';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { parseMediaProbe } from '../src/infrastructure/media/diagnostics';
import { resolveMediaBinary } from '../src/infrastructure/media/binaries';
import { packagedEnvironment } from './package-environment';

const execute = promisify(execFile);
const executablePath = process.env['VANDASHI_PACKAGED_APP'];
const required = process.env['VANDASHI_REQUIRE_PACKAGED_SMOKE'] === '1';

it.skipIf(!executablePath && !required)(
  'runs bundled Studio and a real video render from a packaged Electron app with a desktop-launcher PATH',
  async () => {
    if (!executablePath) throw new Error('Set VANDASHI_PACKAGED_APP to the packaged executable.');
    if (required && process.env['VANDASHI_PACKAGE_AGENT_SMOKE'] === '1')
      throw new Error('CI packaged verification must not use a Codex account.');
    const directory = await mkdtemp(join(tmpdir(), 'vandashi-package-test-'));
    let desktop: ElectronApplication | undefined;
    let studioUrl = '';
    try {
      const environment = packagedEnvironment();
      environment['VANDASHI_USER_DATA'] = join(directory, 'settings');
      environment['ELECTRON_RENDERER_URL'] = '';
      desktop = await _electron.launch({ executablePath, env: environment, timeout: 30_000 });
      const packaged = await desktop.evaluate(({ app }) => ({
        packaged: app.isPackaged,
        path: app.getAppPath(),
        electron: process.versions.electron,
        node: process.versions.node,
      }));
      expect(packaged.packaged).toBe(true);
      expect(packaged.electron).toBeTruthy();
      expect(Number(packaged.node.split('.')[0])).toBeGreaterThanOrEqual(22);
      for (const file of [
        'hyperframes/bin/hyperframes.mjs',
        'hyperframes/dist/studio/index.html',
        'gsap/dist/gsap.min.js',
        'sharp/package.json',
      ])
        await access(join(packaged.path, 'node_modules', file));
      const sidecar = await execute(
        executablePath,
        [join(packaged.path, 'node_modules/hyperframes/bin/hyperframes.mjs'), '--version'],
        {
          env: {
            ...environment,
            ELECTRON_RUN_AS_NODE: '1',
            HYPERFRAMES_NO_UPDATE_CHECK: '1',
            HYPERFRAMES_NO_TELEMETRY: '1',
          },
        },
      );
      expect(sidecar.stdout).toContain('0.8.64');
      const page = await desktop.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      await desktop.evaluate(({ dialog }, selected) => {
        dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selected] });
      }, directory);
      const workspace = await page.evaluate(async () => {
        const api = window.vandashi;
        if (!api) throw new Error('Desktop preload unavailable');
        const parentPath = await api.chooseDirectory();
        if (!parentPath) throw new Error('Fixture folder not selected');
        const brand = await api.createBrand({ parentPath, name: 'Packaged media test' });
        return api.createVideo({ brandId: brand.id, name: 'Packaged composition', ratio: '16:9' });
      });
      if (!workspace.video) throw new Error('Packaged app did not create a video');
      const project = workspace.video.path;
      const source = join(project, 'index.html');
      const html = (await readFile(source, 'utf8'))
        .replaceAll('data-duration="10"', 'data-duration="0.4"')
        .replace('duration:10', 'duration:0.4');
      await writeFile(source, html);
      await execute('git', ['-C', project, 'add', '--all']);
      await execute('git', [
        '-C',
        project,
        'commit',
        '-m',
        'Shorten test canvas',
        '-m',
        'Use a short real render in the packaged smoke test.',
      ]);
      const studio = await page.evaluate(async (scope) => {
        if (!window.vandashi) throw new Error('Missing preload');
        return window.vandashi.startStudio(scope);
      }, workspace.scope);
      studioUrl = studio.url;
      await page.evaluate((url) => {
        const frame = document.createElement('iframe');
        frame.id = 'media-package-studio';
        frame.src = url;
        frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:10000;border:0';
        frame.sandbox.add('allow-scripts', 'allow-same-origin');
        document.body.append(frame);
      }, studio.url);
      await page.waitForFunction(
        () => document.querySelector<HTMLIFrameElement>('#media-package-studio')?.contentWindow !== null,
      );
      await expect
        .poll(() => page.frames().find((frame) => frame.url() === studio.url), { timeout: 20_000 })
        .toBeDefined();
      const frame = page.frames().find((candidate) => candidate.url() === studio.url);
      if (!frame) throw new Error('Studio iframe missing');
      await frame.waitForLoadState('domcontentloaded');
      expect(await frame.locator('body').innerText()).not.toContain('Cannot find module');
      const fileUrl = studio.previewUrl.replace(/\/preview$/, '/files/index.html');
      const current = z
        .object({ content: z.string(), version: z.string() })
        .parse((await (await fetch(fileUrl)).json()) as unknown);
      const content = current.content
        .replaceAll('Packaged composition', 'Manual edit persisted')
        .replace('color:#fafafa', 'color:#ff0000');
      const saved = await frame.evaluate(
        async ({ url, version, content }) => {
          const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'text/html', 'If-Match': version },
            body: content,
          });
          return response.status;
        },
        { url: fileUrl, version: current.version, content },
      );
      expect(saved).toBe(200);
      expect(await readFile(source, 'utf8')).toContain('Manual edit persisted');
      await frame.evaluate((url) => {
        window.addEventListener(
          'hf-studio-flush-pending-edits',
          (event) => {
            const detail = (event as CustomEvent<{ promises: Promise<unknown>[] }>).detail;
            detail.promises.push(
              (async () => {
                await new Promise((resolve) => {
                  setTimeout(resolve, 80);
                });
                const current: unknown = await (await fetch(url)).json();
                if (
                  !current ||
                  typeof current !== 'object' ||
                  !('content' in current) ||
                  !('version' in current) ||
                  typeof current.content !== 'string' ||
                  typeof current.version !== 'string'
                )
                  throw new Error('Invalid Studio file response');
                const response = await fetch(url, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'text/html', 'If-Match': current.version },
                  body: current.content.replaceAll('Manual edit persisted', 'Flushed manual edit persisted'),
                });
                if (!response.ok) throw new Error('Pending Studio save failed');
              })(),
            );
          },
          { once: true },
        );
      }, fileUrl);
      const changes = await page.evaluate(async (scope) => {
        if (!window.vandashi) throw new Error('Missing preload');
        return window.vandashi.studioChanges(scope);
      }, workspace.scope);
      expect(changes.dirty).toBe(true);
      expect(await readFile(source, 'utf8')).toContain('Flushed manual edit persisted');
      if (process.env['VANDASHI_PACKAGE_AGENT_SMOKE'] === '1') {
        await page.evaluate(async (scope) => {
          if (!window.vandashi) throw new Error('Missing preload');
          await window.vandashi.saveStudio({
            scope,
            title: 'Save the red title',
            body: 'Synchronize the script with the actual manually changed red title and short duration.',
          });
        }, workspace.scope);
        expect(await readFile(join(project, 'script.md'), 'utf8')).toMatch(/red|ff0000/iu);
      } else {
        await execute('git', ['-C', project, 'add', '--all']);
        await execute('git', [
          '-C',
          project,
          'commit',
          '-m',
          'Save manual edit',
          '-m',
          'Verify the real Studio file persistence in the packaged runtime.',
        ]);
      }
      const output = await page
        .evaluate(async (scope) => {
          if (!window.vandashi) throw new Error('Missing preload');
          return window.vandashi.renderVideo(scope);
        }, workspace.scope)
        .catch(async (error: unknown) => {
          const status = await execute('git', ['-C', project, 'status', '--porcelain']);
          const diff = await execute('git', ['-C', project, 'diff', 'HEAD']);
          throw new Error(
            `${error instanceof Error ? error.message : 'Render failed'}\n${status.stdout}\n${diff.stdout}`,
          );
        });
      const probe = await execute(resolveMediaBinary('ffprobe', environment), [
        '-v',
        'error',
        '-show_entries',
        'format=duration,format_name:stream=codec_type,width,height',
        '-of',
        'json',
        output,
      ]);
      const metadata = parseMediaProbe(probe.stdout);
      expect(metadata.width).toBe(1920);
      expect(metadata.height).toBe(1080);
      expect(metadata.duration).toBeLessThan(0.5);
      const pixels = await execute(
        resolveMediaBinary('ffmpeg', environment),
        [
          '-v',
          'error',
          '-i',
          output,
          '-vf',
          'scale=160:90',
          '-frames:v',
          '1',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgb24',
          '-',
        ],
        { encoding: 'buffer' },
      );
      let redPixels = 0;
      for (let pixel = 0; pixel < pixels.stdout.length; pixel += 3)
        if (
          (pixels.stdout[pixel] ?? 0) > (pixels.stdout[pixel + 1] ?? 0) + 40 &&
          (pixels.stdout[pixel] ?? 0) > (pixels.stdout[pixel + 2] ?? 0) + 40
        )
          redPixels += 1;
      expect(redPixels).toBeGreaterThan(8);
      const latest = await page.evaluate(async (scope) => {
        if (!window.vandashi) throw new Error('Missing preload');
        return window.vandashi.openWorkspace(scope);
      }, workspace.scope);
      expect(latest.video?.renderedPath).toBe(output);
    } finally {
      if (desktop) {
        await desktop
          .evaluate(({ dialog }) => {
            dialog.showMessageBoxSync = () => 1;
          })
          .catch(() => undefined);
        await desktop.close();
      }
      await rm(directory, { recursive: true, force: true });
    }
    if (studioUrl) await expect(fetch(studioUrl, { signal: AbortSignal.timeout(1_000) })).rejects.toThrow();
  },
  240_000,
);
