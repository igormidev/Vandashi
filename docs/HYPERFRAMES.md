# Hyperframes integration

Vandashi embeds the actual Hyperframes Studio shipped with **hyperframes 0.8.64**. The preview uses **@hyperframes/player 0.8.64**. Pin both versions together. New compositions copy the pinned **gsap 3.15.0** distribution into `compositions/vendor/` so their initial seekable timeline works without a CDN. No hosted Hyperframes service or API key is required for local editing and rendering.

The source reference is [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes), commit `ed75203cb6aa597269b9821fa293b4e9ad40b7ba`. Studio is `packages/studio` in this same repository, not a separate project. The framework is Apache-2.0; preserve its notices when distributing the bundle.

## Boundary and runtime

`src/domain/media.ts` defines `MediaPort`. `src/infrastructure/media/hyperframes.ts` is the only application integration with the vendor runtime. Application services authorize workspace paths and coordinate Git. The adapter owns one Studio child process and serializes project changes. It rejects a second render and prevents a project switch during rendering.

The adapter invokes the bundled CLI using argument arrays, never shell interpolation:

```sh
hyperframes preview /absolute/project --foreground --force-new --no-open --json --port PORT
```

It reserves an available loopback port, consumes the versioned JSON ready event, verifies that the reported project is the requested project, and constructs its own loopback URLs. The child is forced to bind `127.0.0.1` even if the user's environment requests a LAN listener. A failed startup, application shutdown or project change terminates the owned child. It never kills an unrelated user's preview process.

The default executable is `process.execPath` with `ELECTRON_RUN_AS_NODE=1`; this works in Electron without relying on a separately installed Node binary. Node 22 or newer is required by the vendor. The adapter supports `nodePath`, `cliPath`, and environment overrides for tests or a separately packaged runtime. Hyperframes resolves Chromium and FFmpeg itself. App-side FFprobe also searches standard executable locations, including `/opt/homebrew/bin`, because Finder launches have a minimal PATH. Explicit `HYPERFRAMES_FFMPEG_PATH` / `HYPERFRAMES_FFPROBE_PATH` overrides remain authoritative. Chrome, FFmpeg and FFprobe are machine dependencies, not bundled app resources.

The independent Codex transport detects Node shebang launchers and runs them with the app's Node runtime. Its bootstrap clears `ELECTRON_RUN_AS_NODE` before loading the vendor launcher, so the native Codex process and its tools do not inherit that private Electron switch. Native Codex executables are launched directly. A desktop-launcher PATH must be included in packaged testing, not just the terminal's developer PATH.

For an Electron archive, unpack Hyperframes and its native/transitive runtime dependencies, or use `asar: false` until a packaged-platform smoke test passes. The adapter prefers an `app.asar.unpacked` CLI path when it exists. Test an actual packaged application on each supported platform; running the development renderer does not verify packaged dependency resolution.

`DO_NOT_TRACK=1`, `HYPERFRAMES_NO_TELEMETRY=1`, `HYPERFRAMES_NO_UPDATE_CHECK=1`, and `HYPERFRAMES_SKIP_SKILLS=1` apply to this child only. No global Hyperframes or Codex settings are rewritten.

## Renderer contract

`startStudio(projectPath)` returns:

```ts
{
  url: 'http://127.0.0.1:PORT/#project/ENCODED_PROJECT_NAME',
  previewUrl: 'http://127.0.0.1:PORT/api/projects/ENCODED_PROJECT_NAME/preview',
  projectPath: '/absolute/project'
}
```

Embed `url` in an isolated iframe for manual editing. Give the remote frame **no Electron preload, Node integration, or unrestricted IPC access**. The main-process IPC authorization must check the sender is the trusted top-level application frame. Do not disable web security. Allow only loopback frames in the application's content security policy and reject unexpected navigation/popups.

For the creation preview, import `@hyperframes/player` and set `src=previewUrl`, `controls`, `width` and `height` on `<hyperframes-player>`. The element scales its iframe and communicates with the composition runtime using `postMessage`, including across origins. A bare preview iframe does not supply the player's scaling and transport controls.

The complete `StudioApp` React export is **not** a replacement for the sidecar: its requests are hardcoded to `/api` and it needs the Studio backend. The public `@hyperframes/studio-server` adapter is an option for a future customized host, but reproducing its full render/bundle/mutation behavior is unnecessary here.

Studio changes are saved asynchronously to project files. Before checking Git or saving/discarding, the private native `DesktopStudioHost` bridge blurs editing inputs, dispatches the vendor's `hf-studio-flush-pending-edits` event, awaits its promises, and drains tracked same-origin project writes. HTTP conflicts and save failures keep the editor open. The bridge is injected only into the registered direct child frame with the exact loopback origin and project hash; it exposes no Node or IPC authority. A unit test covers debounce and conflicts, and the packaged test exercises delayed real HTTP saves through the native flush hook. This pinned vendor event and request behavior must be rechecked on upgrades.

The application owns the Save/Discard dialog, script synchronization and final commit. Saving uses the configured script-sync model to update only `script.md` from the actual source and manual override files. A failed synchronization preserves dirty manual edits. Discard first makes a recoverable Git safety commit. While AI is running, the editing iframe is inert. Git snapshots and native frame authorization remain the source of truth.

## Files and synchronization

Each video and clip is a real project with `index.html`, `hyperframes.json`, `compositions/`, and **`video_assets/`**. The config sets `paths.assets` to `video_assets`. HTML media URLs use this same folder. `seedProject` is idempotent and never overwrites an existing composition/config.

Hyperframes persists missing IDs and canonical HTML formatting on preview/file reads. Before seed/clip initialization or final reconciliation of an AI edit, `normalizeProject` runs the official `hyperframes timeline ids --dir PROJECT --json` command, which also covers referenced composition files. The committed result and undo checkpoint therefore already contain those changes. The owned Studio watcher is stopped before AI edit turns to prevent it from stamping a partially written composition; read-only chats keep it running. On completion the player gets a refreshed URL even when the source revision did not change. The live integration test removes nested IDs and changes the doctype, normalizes twice, then proves preview reads leave the source byte-identical.

Track `.hyperframes/studio-manual-edits.json` and `.hyperframes/studio-motion.json` in Git. These contain actual edits. Do **not** ignore all of `.hyperframes/`. Ignore generated caches selectively: `.cache/`, `.thumbnails/`, `.transcode-cache/`, `.waveform-cache/`, `.hyperframes` cache/history artifacts, and `renders/`. Keep exported source/editor manifests independently from caches.

The CLI supplies `/api/events` with `file-change` events and project signatures. Studio consumes them automatically. Vandashi should refresh its workspace/player after its own external-edit watcher or completed AI turn. A refreshed `previewUrl` can carry a `?revision=...` query to invalidate the player document.

Clips have independent source compositions and a local copy of the original render in `video_assets/original.ext`. The media element uses `data-media-start` and `data-duration` so preview, rendered picture, and rendered audio trim consistently. The initial frame uses `object-fit: cover` for portrait/square reframing; users/AI can then change the crop or add animation. Invalid ranges and existing clip projects are rejected.

## Rendering and dependencies

The adapter starts a render with `POST /api/projects/:id/render`, subscribes to `GET /api/render/:jobId/progress`, and requires both a `complete` event and a nonempty MP4 on disk. A disconnected stream is a failure. Cancellation calls `POST /api/render/:jobId/cancel`. Completed videos are saved under the project's `renders/` directory. Rendering requires clean repositories and rejects source changes during export while preserving the generated file. A recorded export is current only while its source fingerprint matches and the source is clean; packaging and launch metadata do not invalidate it. Preview/UI and publishing consume this validated export path, so an older MP4 cannot silently become the current upload.

`hyperframes doctor --json` reports Node.js, FFmpeg, FFprobe and Chrome. Its aggregate `ok` also includes optional Docker, Whisper, voice and music tools; **never block normal editing on aggregate `ok: false`**. The adapter gates only required checks. FFprobe also validates output duration and dimensions in the real smoke test.

The official agent bundle has a `.codex-plugin/plugin.json` and core skills. Skill discovery must ultimately be confirmed by Codex's own skills listing, because plugin caches can be outside the conventional folders. The adapter accepts extra skill roots and checks `~/.agents/skills` and `~/.codex/skills` as a filesystem fallback. An absent conventional file does not prove an installed Codex plugin is absent. The application should prefer the live Codex discovery result.

Repair instructions can recommend:

```sh
npx hyperframes@0.8.64 skills update
```

The adapter does not run it automatically. This avoids unexpectedly changing the user's installed skills. The repair chat can run it after the user sends the prefilled request. Restart or reload skill discovery afterward. The core entry point is the `hyperframes` skill; pass the exact skill path discovered by Codex in each video-editing prompt.

Hyperframes' media metadata endpoint reports codec/color information; it does **not** manage Vandashi's asset title, description or tags. The application asset metadata adapter owns these fields and their persistence.

## Upgrade and verification

1. Read the [Studio documentation](https://hyperframes.heygen.com/packages/studio), [Studio server contract](https://hyperframes.heygen.com/packages/studio-server), and release notes. Inspect the exact installed source/types, not an old example.
2. Bump both pinned packages and the lockfile together. Review `previewLifecycleOutput.ts`, `server/studioServer.ts`, `studio-server/src/routes/{preview,files,render}.ts` and `player` cross-origin behavior.
3. Run `npm run check` and `VANDASHI_MEDIA_SMOKE=1 npx vitest run tests/media-integration.test.ts` with working Chrome, FFmpeg and FFprobe.
4. Manually edit an element in embedded Studio, leave with Save, confirm script synchronization and Git history, then reopen. Repeat with Discard. Render and inspect a landscape video and a trimmed portrait/square clip with audio.
5. Verify the real packaged app, process cleanup, port conflicts, missing dependencies, restart, and external edits. Audit the landing page screenshots after a visible Studio change.

Build an isolated unsigned macOS development bundle with `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --dir --mac --arm64 --config.directories.output=/tmp/vandashi-package-smoke --publish never` after `npm run build`. Then set `VANDASHI_PACKAGED_APP` to its `Contents/MacOS/Vandashi` executable and run `npx vitest run tests/media-package.test.ts`. Add `VANDASHI_PACKAGE_AGENT_SMOKE=1` to include an actual Codex script synchronization. This uses an isolated user-data directory and disposable project, verifies bundled native resources and Electron-as-Node, exercises Studio writes and flush, checks real MP4 dimensions/duration and red title pixels, then verifies its server stops. Linux and Windows packaged runs remain separate platform verification requirements.

The smoke test uses the published CLI and real local rendering. It loads the Studio bundle, reads the runtime preview, saves an edit through the vendor API, renders MP4, probes actual dimensions/duration, and verifies the server stops on disposal.
