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
