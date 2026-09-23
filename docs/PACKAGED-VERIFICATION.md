# Packaged desktop verification

The desktop workflow builds installers for its native macOS, Windows and Linux
runners, then tests their packaged runtime before uploading installers. Linux checks
and launches the actual extracted AppImage; macOS/Windows use the unpacked application
produced by the same build. Development Electron tests and successful installer creation
alone do not establish that the packaged native resources work.

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

Historical Linux runs before this correction used Playwright's implicit `--no-sandbox`
default. Their Studio/render/speech results remain functional evidence, but the earlier
statement that no sandbox flags were added was incorrect. They do not establish OS
sandbox acceptance. The `0ad090b` AppImage also contained two independent builder-created
sandbox-disabling paths, described in the artifact follow-up below.

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
Windows/Linux execution was not yet verified at that checkpoint. The later cross-platform
checkpoint below records the completed native and packaged matrix.

Workflow syntax and environment-file behavior follow
[GitHub's current documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#environment-files).
Browser installation uses the official
[Puppeteer install API](https://pptr.dev/browsers-api/browsers.install);
Linux display setup follows
[Electron's headless CI guidance](https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci).

## Localized macOS checkpoint

The localized source commit `6795514` was packaged with
`CSC_IDENTITY_AUTO_DISCOVERY=false`, explicitly skipping code signing. The app is
`/tmp/vandashi-localized-package/mac-arm64/Vandashi.app`. All 288 generated output
files matched the packaged payload; this includes 248 local CJK font subsets.
The notice bundle contains 175 distinct notices and the original Noto font license.
The frozen inputs are recorded in `/tmp/vandashi-localized-package/frozen-input.json`.

Both real package tests passed: speech in 6.77 seconds, Studio/Codex/render in
58.74 seconds. The latter used the authenticated optional agent smoke path, minimal
desktop PATH, `/usr/bin/git`, and explicit verified FFmpeg/FFprobe/browser paths.
Results are `/tmp/vandashi-localized-package/smoke-results.json` and
`/tmp/vandashi-localized-package-smoke.log`. Direct packaged Settings/language and
existing-project walkthroughs followed. These observations verify this checkpoint;
the subsequent clipboard correction and any final audit changes require fresh
package verification before final release acceptance.

## Cross-platform checkpoint before final audit fixes

[Desktop CI 35904172451](https://github.com/igormidev/Vandashi/actions/runs/35904172451)
succeeded at `e5548d46` on macOS, Windows and Linux. Linux and macOS each passed
556 unit/integration tests with 13 existing opt-in skips; Windows passed 555 with
14 existing opt-in/platform skips. Each platform passed 112 native-renderer cases
and two actual packaged Studio/render/local-speech integration cases. The native-source
job and installer artifact uploads also succeeded: macOS ARM64 DMG/ZIP, Windows NSIS,
and Linux AppImage/Debian.

These jobs establish real execution on all three platforms at that identified commit.
They do not validate subsequent final-audit changes or replace manual installation and
resizing checks of the eventual delivered artifacts. Current-state package verification
remains part of final delivery.

## Historical local package — 0784307

A fresh unsigned macOS ARM64 package was prepared without rebuilding the frozen current
output. All 288 packaged output files match SHA256 hashes and source output modification
times remained unchanged. License generation/native-source checks passed; all eight
pinned speech-model payloads (79,680,095 bytes) were verified before using the cache.

Both live packaged tests passed with zero skips in 63.99 seconds. Actual Studio/Codex
synchronization/render took 60.41 seconds; English/Portuguese CPU speech plus cancellation
and timeout took 3.14 seconds. The retained H.264 render is 1920×1080 and 0.4 seconds; its
extracted frame shows the flushed red title and the synchronized script describes it.
All test-owned processes exited. Evidence is under
`/tmp/vandashi-current-package-0784307/`, with the log at
`/tmp/vandashi-current-package-0784307-live-smoke.log`. Root separately opened the same
package and verified native Vandashi identity, retained history and actual YAML recovery.
Cross-platform workflow 35913950753 was still in progress when this checkpoint was
recorded. That historical status is not a statement about the workflow's current result;
the local evidence does not replace Windows/Linux verification or final installer checks.

## Fresh local package — preview startup fixes

On 2026-09-23, the unsigned macOS ARM64 package at
`/tmp/vandashi-preview-final-package/mac-arm64/Vandashi.app/Contents/MacOS/Vandashi`
was tested with the reviewed preview-startup fixes still in the working tree. HEAD was
`40c97dd48b3f69853ce4e3ae98a869b781055029`, whose change was test portability; it did
not contain those application fixes. This evidence therefore identifies the frozen
working-tree build, not a package built from committed `40c97dd` source alone.
The fixes included Preview startup serialization and conversation/Studio startup
coordination in the application layer.

The package reused the production output recorded in
`/tmp/vandashi-preview-race-build.log`, without a rebuild during verification.
All 288 packaged output files (12,833,050 bytes) matched the current `out` SHA-256
hashes. Source output hashes and modification times remained unchanged after the
tests. Six required Studio, CLI, GSAP, sharp and ARM64 ONNX resource paths were present;
all five shipped license/notice files matched their source bytes. The native executable
was ARM64, and its bundle identifier, executable and icon entries resolved correctly.
The dependency graph was unchanged. Packaging is recorded in
`/tmp/vandashi-preview-final-package-unsigned.log`; the exact output hashes and resource
checks are in `/tmp/vandashi-preview-final-package/frozen-input.json` and
`/tmp/vandashi-preview-final-package/input-verification.log`.

The run reused the verified speech cache and explicit tool paths from the `0784307`
checkpoint, overriding only the executable and live-test flags:

```sh
source /tmp/vandashi-current-package-0784307/smoke-environment.sh
VANDASHI_PACKAGED_APP=/tmp/vandashi-preview-final-package/mac-arm64/Vandashi.app/Contents/MacOS/Vandashi \
  VANDASHI_REQUIRE_PACKAGED_SMOKE=0 VANDASHI_PACKAGE_AGENT_SMOKE=1 \
  npx vitest run tests/media-package.test.ts tests/media-speech-package.test.ts \
  --maxWorkers=1 --reporter=default --reporter=json \
  --outputFile=/tmp/vandashi-preview-final-package/live-smoke.json
```

Both suites and both tests passed with zero skips and exit code 0 in 51.74 seconds.
Actual bundled Studio, pending-edit flush, live Codex script synchronization and real
rendering passed in 48.16 seconds. English/Portuguese CPU speech, source preservation,
timestamp checks, timeout and cancellation passed in 3.15 seconds. The retained H.264
MP4 was independently probed as 1920×1080 and 0.400000 seconds; its extracted frame
was visually inspected and shows the red “Flushed manual edit persisted” title.
The retained synchronized script describes that title and timing. The Studio-server
cleanup assertion passed, and no owned packaged app/Studio processes remained.

The run log, machine-readable results and checked summary are respectively
`/tmp/vandashi-preview-final-package/live-smoke.log`, `live-smoke.json` and
`live-smoke-verification.json` in the same directory. Actual fixture artifacts are
retained under `live-artifacts/`, including `script.md`, `render-frame.png` and
`renders/Packaged composition_2026-09-23_17-57-33.mp4`. This establishes packaged
macOS integration for the frozen working-tree output; it does not establish a Windows
or Linux run, signed distribution, installer acceptance or CI result for those fixes.

## CI follow-up — `40c97dd`

The exact committed revision `40c97dd48b3f69853ce4e3ae98a869b781055029` completed
[desktop run 35917027752](https://github.com/igormidev/Vandashi/actions/runs/35917027752)
with a failure on 2026-09-23. This is separate from the working-tree package above.

| Job            | Observed result                                                                                                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native sources | Passed: 395 native payloads and 704 archive files verified.                                                                                                                                                                                               |
| Linux          | Full gate passed: 834 tests passed, 13 opt-in skips. All 209 Electron cases and both packaged Studio/render and CPU speech/ONNX tests passed.                                                                                                             |
| macOS          | Full gate passed: 834 tests passed, 13 opt-in skips. Electron: 207 passed, two failed during initial fixture reload. Packaging did not run.                                                                                                               |
| Windows        | Full gate passed: 831 tests passed, 16 platform/opt-in skips, including both prior portability corrections. The 30-minute job deadline canceled the Electron step after 145 passed, two failed and 62 unrun. Packaging and diagnostic upload did not run. |

The retained artifacts are
[native sources](https://github.com/igormidev/Vandashi/actions/runs/35917027752/artifacts/10776070281),
[Linux X64 installers](https://github.com/igormidev/Vandashi/actions/runs/35917027752/artifacts/10775937010),
and [macOS failure diagnostics](https://github.com/igormidev/Vandashi/actions/runs/35917027752/artifacts/10775918532).
The Linux artifact is 532,465,879 bytes, with SHA-256
`e193a71d391ce609935b1c2f789f6d4ec85b6c9bfa2b3766c63e4f5cec5d1134`.
Logs and downloaded macOS traces are retained locally under
`/tmp/vandashi-ci-40c97dd.eUeTsm/`.

Both macOS failures and one Windows failure occur at the first `page.reload()` after
the test fixture exposed `DOMContentLoaded`, before initial loading necessarily finished.
The macOS traces show process loss 53–62 ms after that reload, not a test timeout.
The fixture now waits for `load`; a separate desktop startup fix and deterministic
native regression cover an actual early native Reload. The subsequent local native
run passed all 214 cases, including the held-initial-load/native-Reload regression
and all four Preview completion/startup cases. Its log is
`/tmp/vandashi-renderer-startup-full-native.log`. The current package checkpoint below
records the associated `83e7e4e` source and actual packaged tests. Genuine load failures
remain failures; this local run does not establish the newer cross-platform CI result.

The remaining Windows failure is the five-second observation of a native save of all
13 taste documents. Without a timeout artifact, slow Git is a hypothesis rather than
a verified cause. That specific observation now allows 20 seconds while retaining
file-content, clean-Git and restart assertions. The Windows job budget is now 60 minutes:
the observed unit step alone took 17.4 minutes, followed by 10 minutes of partial native
testing. No tests are skipped or automatically retried by these changes. A fresh Windows
run is required before accepting either correction.

[Pages run 35917027797](https://github.com/igormidev/Vandashi/actions/runs/35917027797)
passed at the same SHA: 58 unit tests, 312 browser tests and successful deployment to
[the public site](https://igormidev.github.io/Vandashi/). Its uploaded
[Pages artifact](https://github.com/igormidev/Vandashi/actions/runs/35917027797/artifacts/10776180579)
does not establish desktop acceptance.

## Current local package — 83e7e4e

The fresh unsigned macOS ARM64 package at
`/tmp/vandashi-final-startup-package/mac-arm64/Vandashi.app/Contents/MacOS/Vandashi`
includes the early native Reload and Preview startup fixes. Its original
`frozen-input.json` truthfully records HEAD `40c97dd` while those fixes were staged.
They were subsequently committed as `83e7e4eb31da7d1b6a3a952cf451b9d4b24c9ffb`
without rebuilding the root output. The separate `commit-association.json` records
that provenance and verifies all 219 current source/build-input files byte for byte
against the new commit; the original frozen manifest was not rewritten.

All 288 packaged output files (12,835,040 bytes) match the frozen SHA-256 hashes,
and root output hashes and modification times remained unchanged through testing.
Six runtime/Studio/native resource paths and five shipped license/notice files were
verified. The existing eight speech-model payloads were checked against the production
manifest again. Packaging and checks are recorded under
`/tmp/vandashi-final-startup-package/` in `package-build.log`,
`package-verification.json`, `cache-verification.json` and `bundle-verification.json`.

Both real tests passed with zero skips and exit code 0 in **49.31 seconds**. Studio,
pending-edit flush, live Codex script synchronization and rendering passed in 45.61
seconds; English/Portuguese CPU speech, timeout and cancellation passed in 3.25
seconds. The run used `live-smoke-environment.sh` in that directory, with the new
executable, verified cache/tool paths, `VANDASHI_REQUIRE_PACKAGED_SMOKE=0` and
`VANDASHI_PACKAGE_AGENT_SMOKE=1`. Results are `live-smoke.log`, `live-smoke.json` and
`live-smoke-verification.json` in the same directory.

The retained MP4 at
`live-artifacts/renders/Packaged composition_2026-09-23_18-20-29.mp4` was independently
probed as H.264, 1920×1080, 0.400000 seconds. Its `live-artifacts/render-frame.png`
was visually inspected and shows the red flushed title; `live-artifacts/script.md`
contains the matching synchronized script. The Studio cleanup assertion passed and
no owned packaged app/Studio processes remained. Together with the 214/214 local
native run above, this is current local macOS evidence. It does not claim a completed
cross-platform CI matrix, signed distribution or final installer acceptance.

## CI follow-up — `83e7e4e`

[Desktop run 35921832182](https://github.com/igormidev/Vandashi/actions/runs/35921832182)
finished on 2026-09-23. Linux and macOS passed the full 854-test gate (13 opt-in skips),
all 214 Electron cases and both actual packaged integrations. Windows passed its full
gate (851 tests, 16 platform/opt-in skips) and 213/214 Electron cases; packaging did not
run because one test failed. The corrected initial native Reload passed on Windows.

The remaining Windows failure is a strict locator ambiguity in `creation-text.spec.ts`:
“Creation workspace” matches both navigation and the intentionally open chat tab after
session hydration. The trace shows the normal Packaging page, not an application failure.
The same fixture is used by the loading handoff check. Scope navigation selectors to
Video studio and deliberately await the matching chat tab before the Unicode cases;
retain all content, Undo, focus and single-start assertions. The correction requires a
new native run and fresh CI rather than treating this partial matrix as acceptance.

Retained artifacts:

- [Linux X64](https://github.com/igormidev/Vandashi/actions/runs/35921832182/artifacts/10777747769),
  SHA256 `e0101a95892fdfff13d11943698877b09ab53a549c2530f3bbe9c1965f51ab6d`.
- [macOS ARM64](https://github.com/igormidev/Vandashi/actions/runs/35921832182/artifacts/10778657079),
  SHA256 `30d2e2a0024781eb24e98ce31179e90c457d7813ecd06252ae68eb909cc6cb51`.
- [Windows diagnostics](https://github.com/igormidev/Vandashi/actions/runs/35921832182/artifacts/10779221028),
  SHA256 `4fa8ce500235932bac3fc1bf343161b2eec56e389d3a181469bcbaf1f62d3aef`.

Exact logs and metadata are under `/tmp/vandashi-ci-83e7e4e.C8hqpT/`.
[Pages run 35921832193](https://github.com/igormidev/Vandashi/actions/runs/35921832193)
passed 58 catalog tests and 312 browser cases and deployed successfully. Its result does
not establish desktop acceptance.

## Attachment-loading package — `74c15c7`

The final shared-composer loading correction passed the immutable staged gate (854 tests,
13 explicit skips, both builds, zero static-analysis warnings/errors), followed by a fresh
228/228 Electron run in 5.0 minutes. The unsigned macOS ARM64 package is retained at
`/tmp/vandashi-final-attachments-package/mac-arm64/Vandashi.app`.

Its `frozen-input.json` records `74c15c7efcff979c22042860ed023a72ecc351aa` directly:
219 source/build inputs match the commit; all 288 output files (12,835,801 bytes) match
SHA256 and source modification times. Six runtime/Studio/native resources, five license
notices, the bundle identifier and icon were verified in `package-verification.json`.

Both actual packaged tests passed with zero skips in 100.23 seconds. Bundled Studio,
pending-edit flush, real Codex script synchronization and real render passed in 96.63s;
English/Portuguese CPU speech, native ONNX, cancellation and timeout passed in 3.19s.
The render test verifies 1920×1080 dimensions, short duration, actual red frame pixels,
saved output metadata and Studio shutdown. The temporary render fixture was cleaned up.
Logs/results are `live-smoke.log`, `live-smoke.json` and `live-smoke-verification.json`.
All frozen output hashes/mtimes still matched after testing, and no owned package or
Studio processes remained. This is local macOS evidence, not a Windows result.

The Windows selector correction was reproduced locally by awaiting the matching open
chat tab before the old navigation click. The corrected three-file suite passed 21/21
in 27.8 seconds with that hydration precondition, preserving all prior assertions.
Evidence: `/tmp/vandashi-creation-selector-red.log` and
`/tmp/vandashi-creation-selector-green.log`. The independent reviewer accepted the
correction; no production source or package input changes are involved.

## CI follow-up — `0ad090b`

[Desktop run 35926614889](https://github.com/igormidev/Vandashi/actions/runs/35926614889)
completed on 2026-09-23. Linux passed 854 unit tests (13 opt-in skips), all 228 Electron
cases and both packaged runtime checks. Windows passed 851 unit tests (16 platform/opt-in
skips), all 228 Electron cases and both packaged checks. Windows completed within its
60-minute job budget; its native suite took 15.2 minutes. Actual packaged Studio/render
and CPU speech/ONNX tests passed on both platforms without a Codex account.

macOS passed the full unit/static/build gate and 226 native cases. Two newly added
attachment-routing tests resolved the previous chat's mounted button before asynchronous
selection finished; the button then became hidden. Their diagnostics show the correct
new conversation and visible Attach control. Packaging was skipped after those failures.
The test-only readiness correction is in `c44545f`, with a deterministic held-open RED,
12 passing routing cases and a passing final hardened regression. No production source
or frozen package input changed; a fresh exact-revision CI run remains required.

Native-source verification passed for 395 payloads and 705 archive files. Retained
artifacts and upload-reported SHA-256 digests:

- [Linux X64](https://github.com/igormidev/Vandashi/actions/runs/35926614889/artifacts/10780126636),
  `bef54f3f281281c30691ea388f7f3e1322123b2a2e6810b25d1c6fc1e6c2112a`.
- [Windows X64](https://github.com/igormidev/Vandashi/actions/runs/35926614889/artifacts/10781305456),
  `f1d8a9526e16049ed4dd4862d24096971829db5de30e5f08067e2799079d9fa0`.
- [Native sources](https://github.com/igormidev/Vandashi/actions/runs/35926614889/artifacts/10779566097),
  `0758d84ca2ccae1c11333ba50ddabfb927e7b237071bc41c7211e59cb4796c0a`.
- [macOS diagnostics](https://github.com/igormidev/Vandashi/actions/runs/35926614889/artifacts/10780425698),
  `3b5f71cf829ac2961c11dbf9813f934428e01e89b7ee7f763787d79582848488`.

The [Pages run](https://github.com/igormidev/Vandashi/actions/runs/35926615008) passed
58 catalog and 312 browser cases, then deployed the exact revision. Full terminal
snapshots, six job logs and artifact metadata are retained under
`/tmp/vandashi-ci-0ad090b.oiG15O/`. These results preserve the distinction between the
two successful platform packages and the failed macOS test run.

## Artifact inspection and sandbox correction

Read-only inspection of the actual `0ad090b` installers verified Vandashi identity
and icon resources: Windows's NSIS installer and shipped executable both contain
the seven matching mint-V icon sizes (16–256px); Linux AppImage and Debian include
the correct desktop name/icon/window class and a 1024px icon byte-identical to
`build/icon.png`. This is artifact-resource evidence, not an installed Windows/Linux
desktop-shell walkthrough. Installer hashes and extracted metadata remain in
`/tmp/vandashi-artifact-identity-0ad090b/`.

The same inspection exposed an AppImage defect: its desktop entry supplied
`--no-sandbox`, while its separate AppRun wrapper also added that switch after a
failed namespace probe. Electron's [sandbox documentation](https://www.electronjs.org/docs/latest/tutorial/sandbox#disabling-chromiums-sandbox-testing-only)
confirms that this disables Chromium's OS sandbox even when renderer preferences
specify `sandbox: true`. The owned launcher and empty AppImage argument list remove
both automatic paths. The new artifact verifier rejects the exact old extracted
AppImage. Functional launcher tests cover unavailable/failed namespace probes, exact
arguments, paths with spaces, runtime environment, native failure propagation and
the installed builder's actual copy behavior.

The strengthened macOS package test passed against the unchanged local runtime at
`/tmp/vandashi-final-attachments-package/mac-arm64/Vandashi.app`: OS sandbox metric,
bundled Studio, delayed save flush, real H.264 render, decoded pixels and server
cleanup all passed in 13.43 seconds. Evidence is
`/tmp/vandashi-sandbox-macos-smoke.json` and its companion log. This account-free check
does not replace the separately recorded real-Codex walkthrough. The new Linux
launcher, exact-path CI policy and packaged sandbox checks require the next native
Linux run; the historical artifacts and frozen package manifest remain unchanged.

The first corrected [Linux CI attempt at `27794c3`](https://github.com/igormidev/Vandashi/actions/runs/35932492153)
passed 895 unit tests and the complete static/build gate, then stopped before native
tests with `ENOENT` in sandbox setup. Electron 44 installs its binary lazily on its
first package import; the helper had tried to canonicalize the expected binary path
before that initialization. The follow-up uses Electron's own exported executable
path through `--electron`, retaining all hosted-runner and exact-path guards. A fake
package regression creates its previously missing executable during resolution;
explicit packaged paths bypass that resolver. No AppArmor change occurred in the
failed attempt. That functional fix still requires a new CI run.
