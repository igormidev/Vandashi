# Desktop verification journal

Environment: macOS, Electron 44.4.5, Codex CLI 0.155.1, Hyperframes 0.8.64. Tests use the isolated application-data folder `/tmp/vandashi-ui-test-user` and a disposable brand beneath `/tmp/vandashi-manual-projects`; no real channel is published to.

This records observed behavior, including defects still being worked on. It is not an acceptance declaration.

## 2026-09-23 — Brand and workspace entry

- Opened the actual built Electron app with native computer use.
- Chose a temporary parent folder with the native macOS picker and created **Northstar Stories**.
- Edited its description. Navigation and AI controls disabled while the manual draft was dirty.
- Reviewed the commit dialog. The first real helper call failed because the adapter combined commentary with final JSON. Manual title/body entry remained available and the save created a clean Git commit. The adapter was corrected; a separate live Codex schema regression passed afterward.
- Reopened the app. It restored the last brand, its description, and saved creative guides.
- Opened its video library and the existing landscape project. Dependency progress appeared and the page advanced automatically to Packaging after all checks passed.
- Packaging inputs expose accessible labels. Long/short controls and thumbnail actions are present.

## 2026-09-23 — Script and video creation

- Opened Creation workspace. The real Hyperframes player loaded the seeded ten-second composition, including playback controls and duration.
- Entered a six-second title-sequence script in the editor. Navigation and the AI-chat tab disabled while the draft was dirty. Reset, undo, and diff became available.
- Opened the diff dialog and verified the exact inserted script lines. Closing it preserved the draft.
- Opened Save & create. The dialog showed the script diff, optional guidance, the discovered model list, reasoning, and fast-tier control.
- Submitted the real script-to-video task using GPT-6-Astra. It created and committed the six-second composition. Played the actual preview and inspected the final frame: white title, dark green grid, mint underline, and six-second duration matched the requested script.
- The first turn truthfully reported that its direct browser/render verification was blocked by the Codex sandbox. Creation guidance now prefers the installed connected browser tools; the runtime read-mode sandbox remains enforced.
- The vendor preview initially stamped missing nested element IDs after the AI commit, leaving the repository dirty. Normalization now runs before the final checkpoint, with an integration regression proving preview startup does not change the normalized source. The live new-turn/undo walkthrough below also stayed clean.
- Found that Render remained enabled during an unsaved script draft. The control now disables, and the actual Electron script editor regression verifies the lock, exact Unicode diff, undoable reset, redo, and font control.

## 2026-09-23 — Packaged application and interface regressions

- A separate real macOS ARM64 packaged-app test used Finder's minimal PATH. It exercised delayed Studio save flushing, a real Codex turn updating the script from a manual red-title edit, and MP4 export with verified pixels, dimensions, and duration. Closing the app stopped its owned Studio server. See `HYPERFRAMES.md` for the reproducible command and environment limits.
- Actual Electron renderer tests verify keyboard file mentions, portable file-path payloads, IME composition, Shift+Enter, per-tab drafts, selected conversation restoration across reload, reset clearing, and prepared publishing prompts. These renderer tests use deterministic AI responses; live protocol tests separately exercise real Codex.
- Additional renderer tests verify brand edits retain their draft after canceling an unavailable-AI commit helper, permit a reviewed manual commit, and release navigation only after saving. Packaging preserves both format variants through confirmation. History uses 12-item pages, hides Next on the last page, resets after a workspace change, and exposes a multiline body even when it is shorter than 160 characters. Automatic-operation preferences persist independently.

## 2026-09-23 — Real render, recovery, and undo

- Introduced a harmless uncommitted ignore-file comment in the disposable video. Workspace entry invoked the real commit helper and recorded it. Found and fixed an entry-state defect: the renderer now reloads the clean workspace after successful checks before exposing editing controls. Repeated the walkthrough and Render was available.
- Exported the actual title sequence through Render video. FFprobe confirmed H.264, 1920×1080, and exactly six seconds. The output became available to Clips and Launch.
- Asked the real Codex conversation to change the title to THE QUIET CITY in the composition and script. The direct agent commit was sandbox-denied; the application's commit fallback created `b6ea212`, and Git was clean. Playback displayed the changed title. The prior render was correctly marked stale.
- Used Revert last change and confirmed it. The app forked the conversation before the last turn, removed that user turn and its response from the visible chat, and created compensating commit `027c493` with a backup reference. Both source files contained THE HIDDEN CITY again, Git remained clean, and six-second playback visibly restored the original title. The unchanged prior MP4 became fresh and Clips/Launch re-enabled.
- The agent's final text still claimed its own failed commit left files uncommitted even though the application fallback had saved them. The app now adds its own receipt after verifying the repositories and persisting the conversation. Real-Git tests cover direct agent commits, fallback commits, no-change turns, and failure paths; Electron tests verify the saved filenames and expandable diffs. The live clip turn below also verified this complete path.

## 2026-09-23 — Native video seeking and asset refresh

- The actual six-second exported MP4 decoded correctly with FFmpeg but remained at zero in the clip selector. The production media protocol had forwarded a sliced file response without the required byte-range status and headers. The handler now preserves the range semantics. An actual Electron test with a real native-picker grant decodes an H.264 video, seeks to two seconds, plays beyond 2.5 seconds, and verifies an exact 100-byte partial response. The protocol and IPC are not replaced in this test.
- The complete renderer run exposed an asset-refresh loop that disabled and blurred metadata inputs between focus and text insertion. DOM event capture confirmed no input event reached state in failed attempts. The refresh lifecycle now performs one entry read and coalesces pending focus reads. Both shared and video asset regressions verify bounded reads, retained typed drafts, and delayed external metadata applied only after explicit reset. The original metadata-save scenario also passes unchanged.

## 2026-09-23 — Real independent clip generation

- Restarted the built app and reopened the disposable landscape project. Created **A hidden city**, selected portrait 9:16, replaced the numeric start value using ordinary keyboard input, and selected 2–6 seconds. The source preview sought to two seconds, played the selected interval, and returned to the selection start.
- Submitted a real GPT-6-Astra turn asking for a silent four-second title card using the original dark green grid and mint underline. While it ran, the app showed its ongoing conversation and locked conflicting controls. The same conversation remained visible in the clip workspace afterward.
- The app's commit fallback saved `index.html` and `script.md` as `b2e2701`. Its independent **Changes saved.** receipt displayed both filenames, and expanding the composition row showed the actual inserted and removed lines. The clip repository was clean. The parent remained clean at its unchanged `027c493` revision.
- Played the four-second 9:16 composition and rendered it through the actual UI. FFprobe confirmed H.264, 1080×1920, 30 fps, 120 frames, and exactly four seconds. The render manifest was committed as `5e87317`.
- Returned to the parent clip library and clicked the clip row. The exported MP4 played with the complete three-line title and green grid visible. No publishing action ran.

## 2026-09-23 — Real image generation and thumbnail ordering

- Used the actual thumbnail conversation to request a bitmap for **THE HIDDEN CITY**. Codex's image-generation tool produced a PNG; the agent copied it into the video's `thumbnails/` folder, added metadata, and made it the first packaging candidate.
- The saved image is 1664×936 (16:9). The app's fallback commit `a8ec8a6` contains only the PNG, its metadata sidecar, and `video_packaging.yml`. The composition, script, and clips were unchanged; Clips and Launch remained available with the existing render.
- The final Markdown image displayed in chat. Opened its inspector and visually verified the complete dark green city artwork, mint underline, and three-line white title. Packaging displayed the same image.
- The provider's original temporary image was correctly denied by the existing file-permission boundary. A narrowly scoped provider-artifact resolver is being added so this intermediate image can also display; this observation alone does not verify that fix.
- Imported the original generated bitmap as a second candidate using the native picker. Moved it first, verified that navigation and AI were blocked by the dirty order, reviewed the real generated commit title/body, and saved. Commit `8668d3c` persisted the selected order; Git was clean afterward.

## 2026-09-23 — Shared image inspection and finished-video import

- Retested the native asset picker after fixing a focus-refresh race. The real metadata model described the generated city image accurately: white title, teal city, mist, tower, and mint underline. The editable title, description, and tags appeared before import. Import wrote embedded PNG metadata plus its sidecar and committed `96f1e6e` in the shared-assets repository.
- Imported the existing six-second MP4 into a separate **finished-city** project through the native picker. Launch opened directly, with composition and manual editing unavailable for the imported movie. The new file and original render both have SHA-256 `c337d1e8c92bc503e90e0a81bce3992e0a45bdf0b70c2f31b3b0d0d57e926ce9`; commit `c3d8233` records the import.
- The YouTube upload review showed the missing destination channel and disabled Open upload chat. No upload was sent.
- Reopened the saved thumbnail chat. Its provider image initially failed to load because local history rendered before verified provider history granted the exact path. Retry then opened the full original bitmap correctly. A hydration-triggered retry is being implemented; this observation does not yet verify automatic recovery.

## 2026-09-23 — First-use local audio inspection

- Selected two synthetic speech recordings together with the actual native file
  picker, one English and one Brazilian Portuguese. With no model cache present,
  the import dialog displayed the first-use 80 MB model download and inspection
  progress before showing editable metadata.
- The English proposal described a blue bicycle beside a yellow house and three
  children playing in a garden. The Portuguese proposal captured the same subject
  matter, with an imperfect plural on “gardens.” Both reviews showed the sampled
  duration (six and seven seconds respectively) and the speech-recognition caveat.
- Accepted each proposal. Commits `a55450f` and `6958ec4` contain the respective
  MP3 and metadata sidecar in the shared-assets repository. The source recordings
  remain outside the library; embedded metadata is written to the imported copies.
  The actual library accessibility state reported all three assets after import.
- Native automation subsequently returned inconsistent/stale screen captures and
  then reported no available window. This session does not verify audio playback
  or the provider-image automatic hydration fix. Those require a reliable native
  recheck; the earlier import/commit evidence does not establish them.
- A separate packaged macOS ARM64 speech-worker integration passed English and
  Portuguese recognition, timestamp, unchanged-source, timeout, and cancellation
  checks with a minimal PATH. It used the actual bundled worker and ONNX binding,
  not a replacement recognizer; see `ASSET-INSPECTION.md`.
- Restarted the application and reconnected native automation. The two imported
  recordings and metadata persisted. Selecting the Portuguese recording displayed
  the real waveform and a six-second duration; after Play, its accessibility
  playback clock advanced from zero to `6.04671` seconds. Screen captures continued
  lagging accessibility state, so they were not used to claim exact playback frames.

## 2026-09-23 — Recovery checkpoint, automated native verification

- The complete native Electron run exercised 68 cases. Sixty-four passed initially;
  four failed on stale test expectations (a modal hides background navigation from
  accessibility, a macOS caret shortcut, typed IPC diagnostics, and a video fixture’s
  pixel aspect ratio). Corrected assertions and fixtures passed in focused reruns.
- Newly verified cases include first-use inspection cancellation held through cleanup,
  exactly one inspection under real development React StrictMode, an inspected source
  hash carried through multi-file review, real granted MP3 import/playback/seeking,
  provider-image recovery after delayed or retried history grants, saved-clip startup
  and reopen recovery, imported-clip direct playback/packaging, and Home rename refresh.
- These are automated native tests. AI and external account responses are controlled
  in renderer fixtures; the real media-protocol case uses production IPC, file grants,
  imported MP3 metadata, waveform decoding and Chromium playback. This does not claim
  a fresh manual walkthrough or successful publication to a platform account.

## 2026-09-23 — Current-build image history and finished-clip walkthrough

- Reopened `the-hidden-city` in the real app after a fresh launch. The saved thumbnail
  conversation loaded both the provider-generated bitmap and the local Markdown
  thumbnail automatically; no Retry action was used. Opening the generated image
  displayed the complete tower/city artwork in the image inspector.
- Selected the previously rendered 1080×1920 four-second clip through the native
  file picker in YouTube Shorts → Choose a clip → Import a video. The new imported
  clip appeared in the library and opened directly into packaging with native video
  playback; composition editing stayed unavailable as intended.
- Played the clip to its four-second endpoint, edited its short title to
  “A hidden city — finished excerpt,” reviewed a real Luna-generated commit message,
  and saved. Commit `731de8e` follows import `58b90b7`; the independent clip repository
  is clean and its YAML contains the reviewed title. No platform upload was initiated.
- This walkthrough exposed the opaque imported timestamp used as the clip name.
  A separate follow-up replaces that default with the source filename and safe,
  readable collision handling; the observations above used the prior default.

## 2026-09-23 — Fresh brand and composition creation

- Created **Recovery Studio** through Home using the native parent-folder picker.
  The app opened the new brand and its individual taste guides. The identity and
  shared-assets repositories have clean initial commits `527feba` and `0bb9ad8`.
- Created **Fresh canvas**, selected landscape 16:9, and completed the actual
  Codex/Git/Hyperframes prerequisite checks. The video repository contains the
  prepared composition, vendor animation runtime, packaging, script, and asset
  directories; commits `208bf6d` and `255f1e5` are clean.
- Opened Creation workspace. Its live Hyperframes preview rendered **Fresh canvas**
  with a ten-second duration, and version history showed both creation commits.
  This verifies the successful native publication path. Injected failure, retry,
  and preservation cases are established separately by filesystem and native tests.

## 2026-09-23 — Startup, brand recovery, and deferred image hydration

- The focused native run passed all three first-brand recovery cases, all four
  provider-image hydration cases, and imported-clip playback/packaging. The three
  initial development-startup failures used stale test labels. After correcting
  those selectors, all seven development React cases passed in a separate run.
- Development tests prove StrictMode replay with held requests, verify a single
  prerequisite/Studio/commit operation, and retain a manually reviewed commit
  through a passive workspace refresh. Shared commit UI is exercised in Brand,
  Packaging, Shared assets, Video assets, and Manual editing.
- Image tests cover delayed grants, offline retry, opening a cached Creation
  conversation during Studio startup, and idle arriving before the deferred IPC
  response. They assert one subsequent provider read, restored images, and retained
  draft/selection. Brand recovery uses the production bridge, directory grants,
  filesystem, and Git with controlled prerequisite/open failures.
- In the actual app, submitting `.draft` in the New video form showed the invalid
  name diagnostic and retained the form value. Cancelling returned to the unchanged
  video list. Filesystem verification confirmed no hidden `.draft` project existed.

## 2026-09-23 — Readable finished-clip names

- Imported the same four-second 1080×1920 `Final city.mp4` twice through the actual
  native picker. The app showed **Final city** and then **Final city (2)** in the
  corresponding upload review, preserving both entries and the earlier clips.
- Their independent repositories are clean at `4e2e7fe` and `e05a20d`. Both copied
  media files and the selected original have SHA-256
  `476613d948c5714102320e5d533d8b75cfa34db7a0398a443b5ddb936e879acf`.
- No upload ran. The destination is still unconfigured, and Open upload chat
  remains disabled with the existing destination guidance.

## 2026-09-23 — Full startup checkpoint and fresh packaged integrations

- The source gate passed strict types, zero-warning lint, formatting, architecture
  (205 modules, 878 dependencies), production build, and 453 tests. Thirteen
  opt-in or platform-specific tests were skipped and are not claimed as passed.
- The full native Electron run passed 80 of 81 scenarios. Its remaining assertion
  expected the old brand-error toast/Create button; the redesigned dialog retains
  an inline alert and Check again action. Updating those expectations yielded a
  passing four-case modal rerun. All 81 scenarios are verified across those runs,
  rather than claimed as one uninterrupted green run.
- Both saved-receipt regressions pass: the new toast accompanies a durable receipt,
  survives dismissal independently, and is not repeated from duplicate events or
  history reload. No-change/read-only/helper/failure events do not show success.
- Built a fresh unsigned macOS ARM64 application from the verified output. All
  40 production output files match their packaged copies byte for byte. The actual
  bundled speech worker passed both licensed English/Portuguese fixtures, native
  binding checks, model checksums, timestamps, source preservation, cancellation,
  and timeout in 6.91 seconds.
- The fresh packaged Studio integration then passed in 46.21 seconds using a
  desktop-style PATH containing `/usr/bin` Git and OS directories, with explicit
  media/browser paths. It loaded bundled Studio, persisted and flushed real edits,
  used the real Codex harness to synchronize the script, rendered H.264 output,
  verified dimensions/duration and decoded red title pixels, and stopped its
  owned server on exit. This was the production packaged runtime with real
  integrations, exercised by the integration harness rather than a manual UI claim.

## 2026-09-23 — Packaged keyboard editing, live receipt, render, and chapters

- The fresh packaged app opened Northstar Stories and its long-form title guide.
  An inserted sentence changed the draft and locked navigation. Cmd+Z removed the
  latest edit, Cmd+Shift+Z restored it, and Cmd+= / Cmd+- visibly resized only the
  guide text. Discard restored the original text and clean controls.
- In Recovery Studio / Fresh canvas, pasted a complete 40-second, three-scene
  silent script and used Save & create with the real GPT-6-Astra. The app blocked
  editing/navigation, streamed progress, then showed both the durable Changes
  saved receipt and completion toast. Its host completed the clean Git commit
  `0fb9fb0` after the provider reported its own sandbox could not write `.git`.
- Render video produced `renders/Fresh canvas_2026-09-23_12-41-30.mp4`; FFprobe
  confirms H.264, 1920×1080, 30 fps, 1,200 frames, exactly 40 seconds, 1,522,093
  bytes. Render metadata is committed as `616999f`; the repository is clean.
- YouTube review's Generate chapters used the real configured Codex helper and
  displayed its loading/locked state. It opened the actual movie with chapter
  starts 0, 15, and 30 seconds and the three corresponding script titles. Preview
  from chapter two sought the decoded native video to 00:15. Save changes kept
  all three timed titles in the local upload draft.
- No external upload occurred. The test brand has no destination channel; Open
  upload chat remains correctly disabled. Provider-generated composition lint
  reported three structural warnings, distinct from Vandashi's strict source
  gate; the actual app preview and native media render were verified afterward.

## Automated integration evidence

- The localized source gate passes 490 tests with zero static warnings, and the full
  native suite passes all 110 cases. Eight-language settings/persistence/native dialogs,
  glyph loading, plural counts, raw-content preservation, narrow-pane layouts, retained
  startup errors, and live toast/receipt/timer switching have explicit coverage.
- Independent locale visual review and clean recapture are recorded in
  [TRANSLATION.md](TRANSLATION.md). Those screenshots use controlled renderer fixtures;
  the real packaged media/AI workflows above remain the separate integration evidence.

- Real Codex live tests cover sandboxed read-only execution, conversation persistence/resume/fork, and final-answer structured output after a read tool.
- Real media tests start the vendor Studio, render a composition, probe the MP4, and render a trimmed clip containing audio.
- Electron tests cover the native preload boundary, native picker grants, real asset import and media decode, contextual-chat draft preservation, and prepared upload conversations.
- Application tests exercise real Git and local storage with controlled agent failures, interrupted script edits, recovery commits, and compensating undo.

## Localized package and site preparation — 2026-09-23

- The unsigned package frozen at `6795514` passed real speech and Studio/render
  integration, including authenticated Codex script synchronization (2/2).
- Direct computer use switched Settings through English, Japanese, Korean,
  Portuguese, German, French, Spanish, Italian, then English. Every save updated
  the real Recovery Studio workspace and persisted on reopening Settings. Names
  and creative-guide content stayed unchanged. No user project files were translated.
- Opened Northstar Stories and its real Creation, Clips, Shared assets, and creative
  guide screens. Captured four unmodified product screenshots from these workflows.
  The actual six-second composition and four-second portrait clip played to completion.
- Clicking the real History Copy commit SHA exposed a denied Chromium clipboard
  write. The correction keeps reads/Studio denied and permits sanitized writes only
  for the exact trusted top-level document. Two focused native cases then verified
  localized History copying, exact SHA bytes, Studio/read denial, and image copying
  in both brand and video asset consumers; three existing diagnostic cases also passed.
  This native correction still needs a fresh packaged/direct retest.
- The first clipboard regression test failed to restore its initial clipboard
  because Electron requires newly constructed ClipboardItems when writing a snapshot.
  The original pre-test clipboard could not be recovered. The corrected tests eagerly
  clone MIME payloads, preflight restoration, and restore in finally; later runs passed.
- Direct site checks at 390 CSS pixels exercised language selection, Japanese
  installation controls, real prompt copying, screenshot enlargement, keyboard
  dismissal and focus return. The browser-session clipboard was initially empty
  and returned to empty afterward. The production suite then passed all 306 cases
  in Chromium, Firefox and WebKit, with 64 language/viewport captures and eight
  mobile screenshot-dialog captures. It exposed and verified fixes for enlarged-text
  header reflow and WebKit arrow-key image panning. Independent visual review found
  an isolated German letter and awkward Japanese heading breaks; shorter translated
  phrases and phrase-aware headings corrected both. The same reviewer accepted 15
  refreshed Japanese/German/Korean/Portuguese captures, and a fresh complete production
  rerun passed all 306 cases again. The separate language/catalog suite passes 58 tests.

The current test suite is the executable source of exact scenarios and counts. No Windows/Linux runtime, real public upload, or deployed landing-page acceptance is implied by this journal.

## Landing checkpoint native regression follow-up

The first full 112-case native run passed 111 cases and exposed a flaky synthetic
caret setup in the mention test. Eight instrumented fresh-app trials reproduced
two document-start corrections without an application content reset: ProseMirror
ignores that selection change during the first 200 ms after focus. The test now
uses six ordinary Left-arrow presses and verifies DOM caret offsets before typing.
Its mention insertion, Escape, IME Enter, reset and reload assertions are unchanged.
Both cases passed ten repetitions each (20/20); no production chat code changed.
The complete native suite then passed **112/112** in 2.2 minutes. The source gate
passes **553 tests**, with 13 explicitly opt-in integration cases skipped, and
reports zero static-analysis errors/warnings. Separate real packaged integration
evidence remains documented above; skipped live tests are not counted as passed.

## Final-review checkpoint: direct clipboard and history retest

The frozen unsigned `a1d69e1` app at `/tmp/vandashi-site-checkpoint-package/mac-arm64/Vandashi.app`
was opened with the existing isolated manual-test preferences after the Mac was unlocked.
Northstar Stories / the-hidden-city loaded its real six-second Hyperframes preview and
12-entry history page. Copy commit SHA on the latest entry showed Copied; pasting into
an unsent Creation chat draft produced `2b828e0461219295a5e1f8d1c9cfd99d7a04ab24`,
exactly matching the repository's resolved commit. The draft was then cleared without
sending. Expanding the real `index.html` history diff displayed the two-line title
restoration from THE QUIET CITY to THE HIDDEN CITY. The app closed cleanly and the
repository remained clean. This closes the packaged SHA-copy retest for that checkpoint;
it does not verify the later final-review fixes or the remaining image-copy walkthroughs.

## Final-review development build: shared image and public site

The current development build (final-review functional fixes before the Home layout
changes) opened Northstar Stories / Shared assets. Selecting The Hidden City exposed
its actual metadata; an accidental unsaved leading newline during keyboard inspection
was discarded with Reset details. Copy image produced a real clipboard image: Preview's
New from Clipboard displayed the full city artwork. The temporary document was saved
as `/tmp/vandashi-final-manual-inputs/vandashi-shared-image-copy.png` for evidence.
This is the shared-library consumer; the video-assets consumer and final package retest
remain separate checks. Native Electron screenshot capture appeared stale during this
walkthrough, so the actual Preview image and accessibility state establish this result.

The public Pages deployment for `9f93dae` returned HTTP 200. Browser interaction verified
English → Brazilian Portuguese, real screenshot loading, opening the Clips gallery image
(2960×1880), and closing it. See `SITE.md` for the successful workflow link.

The current Home build was exercised directly with the two real isolated brands.
Northstar Stories initially appeared first; opening Recovery Studio and returning
to Home moved Recovery Studio to the first row. Cancelling the native parent-folder
picker returned to the unchanged list. Selecting the isolated temporary parent then
cancelling the untouched single-field name dialog also returned to the same two brands
without creating a folder. The complementary 24-brand layout regression verifies
keyboard access to the final row and retained header controls at 1200×720.

## Final-review current build: animated shared asset

Recovery Studio's Brand → Videos → Shared assets navigation was exercised in the
current build. The native picker selected the prepared three-second, six-frame GIF
`moving-colors.gif`. Actual Codex inspection reported five sampled frames and produced
an accurate editable description of the moving colored bars/timecode. Import completed
as shared-assets commit `94cf259`; that repository remained clean. Both the selected tile
and inspector visibly advanced between timecode frames 00:00:01.000 and 00:00:00.500.
FFprobe independently confirmed the saved metadata-bearing GIF retains six frames at
160×90. This establishes native picker, real GIF inspection/import and animation;
propagation, duplicate/drop behavior and the final packaged build remain separate checks.

Repeating the native picker/import with the same original GIF produced the explicit
already-in-library notice. The count stayed at one and original reviewed metadata stayed
unchanged. Entering Fresh canvas through Videos ran its real prerequisite checks,
materialized the GIF into `_shared`, and committed `fe0aba5`; the video repository was
clean. Its Assets folder displayed the same metadata with edit/delete disabled and a
shared-library explanation. Back returned to the brand Videos tab after checks. This
closes that normal manual-import propagation path, not the separately identified AI
post-turn synchronization defect.

## Final-review current build: real video library and packaging theme

Northstar Stories displayed the imported `finished-city` placeholder and the actual
first thumbnail for `the-hidden-city`. Ordinary Tab navigation and Enter opened
`the-hidden-city`, showing pending controls before prerequisite checks. Packaging accepted
a longer theme; dirty state disabled navigation and chat. The real commit helper supplied
a title/body, the body was reviewed/edited, and save created clean commit `675adf6`.
Back returned to Videos. Show more expanded the persisted theme fully without navigating;
Show less restored clamping and keyboard focus stayed on the control. The app then closed
cleanly for the next native regression run. Together with seven native failure/race/layout
cases, this establishes section11's real packaging-backed library flow on macOS.

## Final-review current build: Brand save normalization and logo replacement

The actual Northstar Stories Brand editor saved a purple-circle SVG through the native
picker and reviewed commit dialog (`9b233b7`), then replaced it with a mint-triangle SVG
at the same canonical `brand_icon.svg` path (`9644046`). Screenshots confirmed each image
immediately after save; the second image retained its different aspect ratio. Navigation
and chat locked while either draft was dirty and unlocked after successful save.

A whitespace-only name edit was saved through the reviewed dialog. The returned field
was normalized to `Northstar Stories`, Save became disabled, and navigation/chat unlocked
although the saved content/revision did not change. A subsequent temporary name edit
restored dirty locks; Discard restored the clean original. The brand repository was clean
and the app exited successfully. Actual AI in-place logo refresh remains separate.

The real commit helper exposed inaccurate pending-edit copy (mentioning no repository
changes and describing unchanged taste guides as additions). Root narrowed Brand
commit context to changed documents and clarified before/after instructions; actual
helper follow-up is pending on the next build. User-reviewed commit text remained editable
and the manual test saved corrected descriptions.

## User-requested loading feedback audit

The commit dialog now displays an animated spinner, phase label and indeterminate bar
while its AI request is pending, plus an inline busy indicator on its action. Nine held
development-native cases passed across Brand, Packaging, Studio, shared assets and video
assets. They verify success, retained reviewed text, typed generation failure with manual
recovery, cancellation with late completion, and visible nonanimated reduced-motion status.
The current renderer capture is `/tmp/vandashi-commit-loading-brand.png`; this is a fixture
screenshot, not evidence of a live Codex request. A real-app follow-up remains planned.

The new onboarding recovery and format cases plus existing video-library cases pass
11/11. The test fixture was corrected to use the production typed failure envelope, wait
for the prerequisite-triggered library reload, and inspect the visible fixed-position
toast rather than its zero-height live-region wrapper. The saved-but-unopened video now
appears in the refreshed list and opens without another create request; preparation
failure retains the form, while both aspect ratios expose selected state and correct tabs.

The broader loading audit passes 18 held-response native cases for creation, History,
conversation opening/reset/Undo/start/Stop, Settings refresh, Studio discard, script
handoff, shared/video imports and waveforms, failed media access, and thumbnail import.
These are controlled backend cases; they explicitly check failure/retry, draft retention,
late-response ownership, and progress through the final refresh.

The rebuilt app at `87b919b` was exercised with real Codex commit generation. A Brand
description edit produced a precise title/body describing only the changed guidance,
then saved successfully as `6589971`, leaving the identity repository clean. Canceling
an earlier completed suggestion retained the draft.
A longer guide-edit request using a temporarily selected GPT-6-Astra/Ultra helper visibly
showed the mint spinner, “Writing a commit message…” label, indeterminate strip, disabled
fields and busy action in the real native app. This supplements the controlled loading
cases; the helper preference was restored after the walkthrough.

The actual guide-save walkthrough exposed a strict-IPC regression: narrowed commit
context accidentally passed display-only document `name`/`kind` into saveWorkspace.
The dialog retained its reviewed text and displayed the validation error. Root corrected
the save payload to path/content pairs. A new native case uses the real desktop validator,
Git and storage to edit all 13 guide controls, save once and reload every persisted guide;
the three-case Brand revision suite passes. The failed manual test draft was discarded
and the temporary commit helper was restored to GPT-6-Luna/Medium. Actual guide save on
the next built renderer remains to be repeated.

## Current loading/recovery build — 0784307

The production renderer saved all 13 creative-guide edits in one reviewed real Codex
commit, `8fc6922`, without the former strict-payload error. Root reloaded the app and
opened every guide control; each retained its new Northstar preference. The identity
repository was clean and Save/Discard returned to disabled.

A real GPT-6-Astra/Medium Brand-attributes turn changed the existing 180×120 SVG logo
background from mint to amber without changing its path or geometry. Working/Stop and
editor/navigation locks were visible during the turn. The provider reported its Git
sandbox denial, then the application's commit recovery saved `34c31dc` and displayed
“Changes saved.” The repository was clean, with exactly the one expected file changed.
The app immediately displayed the amber triangle logo without a reload.

A new real 16:9 project, Quiet Observatory, passed prerequisites before onboarding,
created its clean initial repository (`798ffa9`), and entered Packaging after project
validation. A real read-only Astra turn opened brand configuration and all 13 saved
guides, confirmed every Northstar preference, and applied the custom long-form script,
visual identity and title guidance to this new project. Its answer retained concrete
scientific questions, calm explanations, restrained mint typography and uncluttered
images; no project files changed. Working/Stop and read-only selection remained visible
through the turn.

Portrait creation also passed the real prerequisite/onboarding flow: One Quiet Question
selected 9:16 and created clean initial canvas commit `4e7c7fa`, with 1080×1920 source
geometry versus Quiet Observatory's 1920×1080. Creation displayed PREVIEW 9:16; Clips
was absent for the portrait project, and Launch stayed disabled until an export existed.

The actual embedded Studio edited the title to “One Quiet Question — A Clearer Sky”.
Navigating prompted a source diff. Discard created its safety checkpoint and restored
the original visible title. Repeating the edit and choosing Save opened the real Codex
commit suggestion, then locked Close/Cancel/fields with a busy Save action through script
synchronization. Creation reopened with the edited title and an accurate 10-second
portrait title-card script. History showed reviewed commit `334699f`; all saved editors
were clean. A real render then displayed its percentage and kept editing/navigation locked.

## Current packaged recovery — 0784307

The new macOS ARM64 package's 288 output files match the verified build byte for byte.
Its two live integration cases passed with no skips: actual Studio edit/flush, Codex
script synchronization, 1920×1080 H.264 render, and English/Portuguese CPU speech with
cancellation/timeout. Root then opened this packaged executable with the isolated manual
profile; native window/menu identity is Vandashi and existing conversation history survived.

For a direct YAML recovery check, root backed up the clean Fresh canvas packaging bytes
and deliberately wrote malformed YAML only in this disposable integration project. The
packaged video library immediately showed a persistent notice identifying the Git
restoration and exact `.vandashi-recovery/video_packaging.yml.1790194809878.invalid` path.
SHA256 checks confirm the original packaging was restored exactly, the malformed bytes
were preserved exactly in that backup, and Git stayed clean. Video entry then ran the
normal visible prerequisite sequence.

The same package imported a real PNG through the native video-assets picker. Its
“Understanding your asset…” phase remained visible while Codex inspected the image;
Close was disabled and Cancel remained available. The AI proposed an accurate cityscape
description and tags. Root reviewed the title as “Hidden city reference” and imported
it successfully as clean commit `c9a4539`. The persisted sidecar records the reviewed
metadata and successful embedded storage. Copy image displayed its success feedback;
Preview's New from Clipboard opened the actual 1672×941 city image. The temporary
unsaved Preview document was closed after verification.

The current package's Creation history copied the complete `c9a4539` SHA; pasting into
an unsent chat draft verified the exact value, then the draft was cleared. Native chat
pickers attached the owned city PNG and English MP3. A real Astra/Medium turn imported
both into Fresh canvas's local `video_assets/`, left shared assets unchanged, added both
canonical `@[title](<absolute path>)` mentions to `script.md`, and saved clean commit
`249f5d5`. Working/Stop and conflicting navigation/editor locks remained visible.
The script accurately recorded the dim image's five-second fade and narration treatment.

The subsequent render displayed percentage progress and saved `cd58659`. FFprobe confirms
40 seconds of 1920×1080 H.264 plus AAC audio. Clips and Launch were disabled before the
current export and enabled afterward. Opening Clips showed its empty state; New clip ran
visible prerequisites, then accepted square 1:1 and an exact 0–5-second range. Play selection
displayed actual city/circle/title motion with the square framing guide. Confirming creation
immediately showed “Creating your clip…” and locked global navigation through handoff.

The square AI handoff continued in the same visible conversation and saved `3114dd8`.
It exposed a real completion race: the idle clip Preview retained “Another operation is
running” until Check again. Explicit retry loaded the composition immediately; this is
a reopened source finding, not a passing automatic-refresh result. The app's Render action
then exported the five-second square clip successfully (`b3e6ef4`); parent HEAD remained
`cd58659` with a clean index/worktree.

Launch opened after the valid export. Choose a clip → Import a video used the native
picker to import the owned four-second portrait MP4 as `city-drop`. Its review correctly
required a destination URL and browser before Open upload chat could enable. No upload
was attempted. Back in Clips, selecting the imported item played the actual portrait
title-card video through 0:04. Its Edit packaging page identified it as Imported.
Direct navigation from that imported clip opened parent Creation with Fresh canvas's
40-second script and 16:9 preview; repeating the route to Manual opened actual parent
Studio at `#project/Fresh%20canvas`. Both parent capabilities remained available.

Two CUA Finder drags of the selected disposable MP4 produced no application drop event;
this does not establish native drag/drop acceptance. The subsequent library lifecycle
walkthrough uses the native picker and remains explicitly distinct from that open check.

The native library picker inspected six frames of the four-second MP4, showed
“Understanding your asset…”, and proposed accurate title-card metadata. The reviewed
title “Disposable city clip” saved as `7955303`; its inspector played through 0:04.
The folder-scoped Assets chat then received the owned SVG logo through its native picker.
Its real AI turn read brand/visual guidance, checked references, created two tagged SVG
assets under `video_assets/details/`, and deleted only the unused local MP4 and sidecar.
Commit `39d45d8` contains exactly those six paths; composition and the separate imported
clip stayed unchanged, and the repository was clean. The library refreshed automatically
and cleared the deleted selection. Browsing details showed both SVGs; inspector metadata
described the transparent 1920×1080 frame accurately. Description search `inset` returned
one asset; tag search `frame-kit` returned both nested assets.

## Fresh packaged Preview completion and Undo

The reviewed Preview/chat startup correction was built into the unsigned package at
`/tmp/vandashi-preview-final-package/`. Both live package integrations passed without skips;
the package manifest identifies the exact frozen output separately from HEAD `40c97dd`.
Root opened it with the original isolated manual profile. Fresh canvas's actual render
showed percentage progress and completed as `0d7fe3b` before new clip creation.

New clip “Clear square” used 1:1 and the 0–5-second opening. The real Astra turn kept
Creating/Working feedback and conflicting navigation locked throughout publication and
generation. Completion retained its exact original instruction and conversation, showed
Changes saved, and automatically opened the current Preview without Check again, a busy
error, or an error toast. Playback advanced from 0:00 to 0:05; the actual image, animated
mint circle and “A circle begins” title were visible. The clip committed `f740db9` and
the parent remained `0d7fe3b`; identity/shared repositories were unchanged and all clean.
Evidence: `/tmp/vandashi-preview-completion-manual.json`.

Before any subsequent render/manual save, Revert last change → Continue restored the
clip's original source tree through commit `d76ec87`, preserved `f740db9` at an owned
`refs/vandashi/backups/` ref, and forked the actual Codex conversation to its empty
pre-first-turn boundary. The visible transcript became empty and Undo disabled. All six
participating repositories were clean and their trees matched their checkpoint baselines;
the five unaffected HEADs stayed unchanged. The original provider thread was retained.
Evidence: `/tmp/vandashi-clear-square-session-before-undo.json` and
`/tmp/vandashi-current-package-undo.json`.

For unavailable-history recovery, root copied only registry/session data into
`/tmp/vandashi-undo-missing-boundary-profile`, retained the real Northstar conversation,
and changed only its copied latest checkpoint to a nonexistent provider thread UUID.
The copied checkpoint used current clean identity/shared HEADs for both before/after,
so it could not restore old project content. No actual provider history was deleted.
After native startup hydrated the real conversation, Undo → Continue showed the actual
Codex “no rollout found for thread id” error and retained the confirmation for retry.
Cancel returned to the unchanged visible conversation and amber logo. Exact comparison
showed the entire hydrated session unchanged and both repositories' HEADs, trees and
tracked file bytes unchanged and clean. Evidence: `/tmp/vandashi-undo-missing-before.json`
and `/tmp/vandashi-undo-missing-result.json`. The copied-profile app was then closed.

## Current committed package — chat tab lifecycle

The fresh `83e7e4e` package passed both real integrations again (2/2, zero skips,
49.31 seconds). All 288 output files and 219 source/build inputs were associated with
that commit; resource/notices checks passed. Evidence is under
`/tmp/vandashi-final-startup-package/` including `commit-association.json`.

In the actual Northstar brand page, root opened all 13 guide chats through their own
AI actions. Newest-first order matched the opening sequence; the tab strip reached the
oldest Brand attributes and asset chats by dragging its horizontal scrollbar. The hovered
tab exposed its close action. Closing all 15 tabs returned the centered empty-state copy.
Reopening Brand attributes retained the real earlier logo-edit conversation.

Root then opened Titles · long form and Visual identity, entered an unsent Visual identity
draft, quit and relaunched the same package/profile. The exact three-tab order and selected
Visual identity chat were restored with the complete unsent draft. After clearing that test
draft without sending, Brand attributes still showed the original history. No project
content was edited by this lifecycle check.

The native thumbnail-chat picker attached the retained rendered PNG. A real AI turn
replaced only the first thumbnail with `thumbnails/red-title-on-dark-canvas.png`, renamed
its metadata sidecar, removed the unreferenced old first image/sidecar, and updated the
ordered YAML list. The package immediately displayed the red title image with the Main
badge and the unchanged city image second. Commit `b8e6d44` is clean; the replacement bytes
exactly match the supplied image, and the second candidate, index.html and script.md are
unchanged. Evidence: `/tmp/vandashi-thumbnail-replacement-manual.json`. No image generation,
external upload or account capability was asserted by this filename/reference check.

Fresh canvas's selected-image AI action opened a focused asset conversation. Its real
turn renamed `hidden-city-original.png` and its sidecar to `misty-mint-city-opening.png`,
preserved exact image bytes/metadata, and repaired index.html and the canonical script
mention. Clean commit `8d0084e` contains only those six old/new/reference paths; all three
clip HEADs and independent clip copies were unchanged. The refreshed library cleared the
obsolete selection and selecting the renamed item displayed the original image/metadata.

Delete this asset? → Delete was blocked with “This asset is used by index.html, script.md.”
The confirmation remained recoverable. Cancel returned to the asset; exact HEAD, image
and sidecar bytes remained unchanged and Git stayed clean. Creation opened its preview
automatically and played the original city/circle opening with the new script path.
Evidence: `/tmp/vandashi-asset-rename-before-delete.json` and
`/tmp/vandashi-asset-reference-delete-result.json`.

To isolate the native drop limitation, root created an empty owned Finder subfolder and
attempted to drag the owned SVG into it from both icon and label. Neither generated a
Finder move, although CUA dragging the app's horizontal scrollbar worked. The source
stayed present and target stayed empty; the empty probe folder was removed. This is an
automation limitation and provides no affirmative application drag/drop evidence.

From Fresh canvas's Creation chat, the native picker attached `mint-logo-shared.svg`.
The explicit request made it reusable across Recovery Studio videos and clips, preserving
composition/script/timing and local copies. Real AI immediately showed Working/Stop and
locked attachment controls/navigation, then returned Ready and Changes saved. It created
the authoritative shared asset plus accurate title/description/tags/hash at shared commit
`3719073`. The parent (`f4bf28e`) and all three clips received byte-identical materialized
copies with matching metadata and clean commits. Their scripts/compositions were unchanged;
brand identity HEAD stayed unchanged. Evidence: `/tmp/vandashi-explicit-shared-before.json`
and `/tmp/vandashi-explicit-shared-result.json`. A subsequent read-only check started
normally with visible Working feedback, demonstrating synchronization left no dirty
preflight blockage. Completion and Undo acceptance are recorded separately below.

The read-only follow-up completed with exact-byte/hash confirmation and no repository
changes. Undo removed that conversation turn while preserving every HEAD. A second
Undo restored the shared import's complete six-repository baseline trees, kept all
repositories clean, and retained all five changed commits under backup refs. Evidence:
`/tmp/vandashi-shared-readonly-undo.json` and `/tmp/vandashi-shared-import-undo.json`.
The package was closed before subsequent renderer regression testing.

## Native Codex executable recovery — current package

The `74c15c7` macOS package, whose 219 source/build inputs also match `0ad090b`,
was launched with a disposable profile and a process-local `VANDASHI_CODEX_PATH`
pointing to an absent task-local executable. The complete Recovery Studio brand
was copied and the isolated registry repointed to it. Installed tools, PATH, HOME,
CODEX_HOME and account credentials were unchanged.

Actual ENOENT blocked brand entry, disabled workspace navigation and displayed
Installation guide without an unsupported AI repair action. Check again while the
executable remained absent retained the error and showed the failed-retry toast.
Installation guide opened Arc's Little Arc at the official Codex CLI documentation;
the configured OpenAI URL redirected to `https://learn.chatgpt.com/docs/codex/cli`.
Only that test-opened help window was then closed.

A task-local symlink to the existing native `codex-cli 0.155.1` executable restored
availability. Check again in the same running app entered the brand successfully.
The initially empty model catalog required its existing explicit refresh action;
GPT-6-Astra and Medium then appeared. Fresh canvas passed the actual video runtime
and live core-skill checks. Its Creation preview opened and playback advanced to
0:25 / 0:40. The isolated app was paused and closed before restoring the main manual
profile. All six copied repositories matched the originals' HEADs and trees, and
both sets remained clean.

Evidence: `/var/folders/_8/nmgh3s5j1gncsykp5dm7vdc40000gn/T/vandashi-prerequisite-recovery-o75vh3_n/result.json`.
The original prerequisite reviewer accepted this missing-configured-executable,
official-help and same-process Retry branch. This does not establish a fresh
installation, new/signed-out login, quota recovery or repository-writable AI repair.
