# Packaged desktop verification

The desktop workflow builds installers for its native macOS, Windows and Linux
runners, then tests their packaged runtime before uploading installers. Linux checks
and launches the actual extracted AppImage; macOS/Windows use the unpacked application
produced by the same build. Development Electron tests and successful installer creation
alone do not establish that the packaged native resources work.

AI agents follow [AGENTS.md](../AGENTS.md): routine tasks run only newly created
tests. The commands below describe package-specific checks for an explicit testing
request and the automated release workflow; they are not a mandatory local test sweep.

## Account-free CI boundary

`scripts/prepare-packaged-smoke.mjs` finds exactly one unpacked native executable.
It resolves Git, FFmpeg and FFprobe to absolute paths, installs Chrome headless shell
**152.0.7977.30** using Hyperframes' locked Puppeteer dependency, and records tool
versions. The browser pin must still match Hyperframes 0.8.64's managed revision.
Linux installs Chromium's system libraries with Playwright and runs the GUI check
under Xvfb. `prepare-linux-package.mjs` extracts the single generated AppImage, verifies
the exact owned launcher and desktop command, and selects its native binary and AppRun.
Both Electron launch sites explicitly set `chromiumSandbox: true`. When Ubuntu restricts
user namespaces, `prepare-linux-sandbox.mjs` loads a profile for only the exact test
binary on the ephemeral Actions runner; host-wide AppArmor settings remain unchanged.

The owned `build/AppRun` must retain its executable Git mode. Its launcher and the
AppImage desktop entry must not add `--no-sandbox`, including when namespace creation
fails. A blocked host reports the prerequisite failure rather than weakening sandboxing.

The helper writes validated UTF-8 values to GitHub's environment file. The subsequent
test step runs:

```sh
npx vitest run tests/media-package.test.ts tests/media-speech-package.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile=test-results/packaged-smoke.json
```

`VANDASHI_REQUIRE_PACKAGED_SMOKE=1` makes a missing application path a failure rather
than silently skipping both tests. `VANDASHI_PACKAGE_AGENT_SMOKE=0` keeps the optional
live Codex turn disabled; the CI test rejects an attempt to enable it. No account,
API key, saved Codex conversation or user project is needed. All created projects,
application preferences and temporary audio are isolated and cleaned afterward.

Child PATH contains Git's resolved directory and operating-system directories,
excluding the developer's Node/npm paths. Windows keeps `SystemRoot` and `System32`.
FFmpeg, FFprobe and Chrome use their explicit absolute paths. Hyperframes and the
speech worker run through the packaged Electron executable in Node mode.

## Observable checks

- The renderer is sandboxed at the OS level. macOS/Windows report this through the
  renderer's `ProcessMetric.sandboxed`; Linux must show seccomp filtering, no new
  privileges and more seccomp filters than its browser parent. The main command line
  must not contain sandbox-disabling switches. Missing evidence fails the check.
- Studio loads from bundled resources, persists a real edit, drains a delayed
  pending write, and renders a real H.264 MP4. The test probes dimensions/duration,
  inspects decoded red title pixels, verifies the current export, and checks that
  the owned Studio server stops when the application closes.
- Speech requires `speech-worker.js`, the current OS/architecture's ONNX native
  binding and its adjacent runtime DLL, dylib or shared library. It then runs actual
  CPU inference using the package, checks English/Portuguese subject matter,
  language labels and timestamp bounds, and verifies timeout and cancellation.
- The two tiny, explicitly licensed WAV fixtures are committed with provenance,
  full license, source revision, original identities, sizes and hashes. See
  [their reproduction instructions](../tests/fixtures/speech/README.md). CI needs
  FFmpeg to decode temporary 16 kHz PCM; it does not need eSpeak or a recording service.

The speech cache is keyed by the exact `speech-model.json` manifest. Restoring a
cache never bypasses the production `ensureSpeechModel()` byte-length and SHA-256
checks. Missing or corrupt files are fetched from the revision-pinned public model
repository; a first run downloads 79,680,095 bytes. The browser cache is keyed by
OS, architecture and browser revision. Neither cache contains user audio or account data.

## Local reproduction

Build the application before running package tests, for example with
`npm run package:dir`. To inspect the helper's resolved configuration without
launching a GUI, run `node scripts/prepare-packaged-smoke.mjs`; outside Actions it
prints the environment values rather than changing your shell. An existing app or
browser can be selected with `--app /absolute/executable` and `--browser /absolute/browser`.

Set `VANDASHI_PACKAGED_APP` to the native executable, optionally set
`VANDASHI_SPEECH_MODEL_CACHE` to an existing verified cache root, and run the test
command above. Explicit `HYPERFRAMES_BROWSER_PATH`, `HYPERFRAMES_FFMPEG_PATH` and
`HYPERFRAMES_FFPROBE_PATH` values can select installed tools. Linux requires a display
or the same `xvfb-run --auto-servernum` prefix as CI. Windows environment values can
be assigned with PowerShell's `$env:NAME='value'` syntax.

Linux CI additionally requires `VANDASHI_PACKAGED_LAUNCHER` to identify the verified
extracted `AppRun`. For local AppImage reproduction, run `prepare-linux-package.mjs`
and use the two paths it prints; an existing unpacked native binary remains valid for
local runtime-only testing. The launcher never changes system policy or adds unsafe
flags. Ubuntu's [user-namespace policy](https://documentation.ubuntu.com/release-notes/24.04/)
may require an administrator to approve the exact application through AppArmor.
Packaging uses ordinary file copies: `USE_HARD_LINKS=true` or an inherited `VITEST`
environment makes the pinned builder reject the existing generated AppRun with
`EEXIST`, rather than silently shipping that default. Run standalone packaging without
those test/hardlink environment variables.

## Release evidence

The [desktop workflow](../.github/workflows/verify.yml) verifies all three native
platforms and the packaged runtime before publication. Each completed release must
identify its exact source commit and include the complete installers, update metadata,
verified lengths/digests, license notices and native source archives. The publisher
uploads to a draft, validates an existing tag against that commit, and publishes last.
A built source version or an uploaded workflow artifact is not an available update.
See [update delivery](UPDATES.md) and [native source provenance](NATIVE-SOURCES.md).

Historical source `672e790` (0.1.5) passed the three-platform native and packaged
matrix in [workflow 36261488348](https://github.com/igormidev/Vandashi/actions/runs/36261488348),
including the extracted Linux launcher and OS sandbox checks. That workflow's
publishing step failed on installer filename validation and did not publish an update.
Earlier runs and their correction notes remain in Git history; they do not approve
later source changes or installer artifacts.
