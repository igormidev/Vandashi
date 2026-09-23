import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test, expect } from './fixtures';

test('the real media protocol decodes, seeks, and plays a selected full HD export', async ({
  desktopApp,
  page,
  userData,
}) => {
  const path = join(userData, 'Full HD export.mp4');
  await promisify(execFile)('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1920x1080:rate=30',
    '-t',
    '6',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-profile:v',
    'high',
    '-level:v',
    '5.0',
    '-pix_fmt',
    'yuv420p',
    path,
  ]);
  const bytes = await readFile(path);
  const rawUrl = `vandashi-media://local/file?path=${encodeURIComponent(path)}`;
  expect(await desktopApp.evaluate(async ({ net }, url) => (await net.fetch(url)).status, rawUrl)).toBe(403);
  await desktopApp.evaluate(({ dialog }, selection) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selection] });
  }, path);
  const url = await page.evaluate(async () => {
    if (!window.vandashi) throw new Error('Missing preload');
    const [selected] = await window.vandashi.chooseFiles('video');
    if (!selected) throw new Error('The native picker did not grant a file');
    return window.vandashi.mediaUrl(selected);
  });
  // Exercise the production handler; no protocol or IPC handlers are replaced in this test.
  await page.evaluate((url) => {
    const video = document.createElement('video');
    video.id = 'protocol-video';
    video.controls = true;
    video.muted = true;
    video.src = url;
    document.body.append(video);
  }, url);
  const video = page.locator('#protocol-video');
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBe(4);
  expect(
    await video.evaluate((element: HTMLVideoElement) => [element.videoWidth, element.videoHeight]),
  ).toEqual([1920, 1080]);
  await video.evaluate((element: HTMLVideoElement) => {
    element.currentTime = 2;
  });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.seeking)).toBe(false);
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(2, 1);
  await video.evaluate((element: HTMLVideoElement) => element.play());
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThan(2.5);
  expect(
    await video.evaluate((element: HTMLVideoElement) => element.getVideoPlaybackQuality().totalVideoFrames),
  ).toBeGreaterThan(2);
  await video.evaluate((element: HTMLVideoElement) => {
    element.pause();
  });
  const partial = await desktopApp.evaluate(async ({ net }, url) => {
    const response = await net.fetch(url, { headers: { Range: 'bytes=50-149' } });
    return {
      status: response.status,
      length: response.headers.get('Content-Length'),
      range: response.headers.get('Content-Range'),
      accepts: response.headers.get('Accept-Ranges'),
      policy: response.headers.get('Content-Security-Policy'),
      sniff: response.headers.get('X-Content-Type-Options'),
      bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
    };
  }, url);
  expect(partial).toEqual({
    status: 206,
    length: '100',
    range: `bytes 50-149/${String(bytes.length)}`,
    accepts: 'bytes',
    policy: "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    sniff: 'nosniff',
    bytes: Array.from(bytes.subarray(50, 150)),
  });
});
