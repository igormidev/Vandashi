# Packaged desktop verification

The desktop workflow builds installers for its native macOS, Windows and Linux
runners, then tests the unpacked application produced by that same build before
uploading installers. Development Electron tests and successful installer creation
alone do not establish that the packaged native resources work.

## Account-free CI boundary

`scripts/prepare-packaged-smoke.mjs` finds exactly one unpacked native executable.
It resolves Git, FFmpeg and FFprobe to absolute paths, installs Chrome headless shell
**152.0.7977.30** using Hyperframes' locked Puppeteer dependency, and records tool
versions. The browser pin must still match Hyperframes 0.8.64's managed revision.
Linux installs Chromium's system libraries with Playwright and runs the GUI check
under Xvfb. No sandbox flags or application security settings are relaxed.

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

## Local reproduction and current evidence

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

On 2026-09-23, a fresh unsigned macOS ARM64 package was created from the verified
12:25:20 production build, without rebuilding or modifying `out`. All 40 output
files retained their hashes and modification times and matched the packaged copies
byte for byte. The application occupied 942 MiB and contained ARM64 ONNX Runtime
binding and dylib files under their required resource paths.

The current speech test passed against that package in 6.91 seconds using the
committed recordings and production-verified cache. It exercised actual inference,
subject matter, language detection, timestamps, source preservation, timeout and
cancellation. The local executable is
`/tmp/vandashi-recovery-package/mac-arm64/Vandashi.app/Contents/MacOS/Vandashi`;
the machine-readable result is `/tmp/vandashi-recovery-package/speech-results.json`.
Its frozen build manifest is `/tmp/vandashi-recovery-package/frozen-input.json`.

The fresh package's Studio/render integration also passed in 46.21 seconds with
the optional real Codex script synchronization enabled. It loaded the bundled
editor, saved and drained real pending edits, rendered a 1920×1080 H.264 movie,
verified red title pixels and export metadata, and confirmed server cleanup.
Git came from `/usr/bin` and the child PATH contained OS directories, with explicit
FFmpeg, FFprobe and pinned browser paths. No host Node/npm path was supplied.
This establishes the macOS English checkpoint, not the later translated release.
Windows/Linux native execution and the full matrix remain unverified until their
actual jobs run. The Windows process-tree regression also awaits its Windows runner.

Workflow syntax and environment-file behavior follow
[GitHub's current documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#environment-files).
Browser installation uses the official
[Puppeteer install API](https://pptr.dev/browsers-api/browsers.install);
Linux display setup follows
[Electron's headless CI guidance](https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci).
