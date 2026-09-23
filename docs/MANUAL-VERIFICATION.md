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
- The agent's final text still claimed its own failed commit left files uncommitted even though the application fallback had saved them. The app now adds its own receipt after verifying the repositories and persisting the conversation. Real-Git tests cover direct agent commits, fallback commits, no-change turns, and failure paths; Electron tests verify the saved filenames and expandable diffs. A further live turn will check this complete path in the running app.

## 2026-09-23 — Native video seeking and asset refresh

- The actual six-second exported MP4 decoded correctly with FFmpeg but remained at zero in the clip selector. The production media protocol had forwarded a sliced file response without the required byte-range status and headers. The handler now preserves the range semantics. An actual Electron test with a real native-picker grant decodes an H.264 video, seeks to two seconds, plays beyond 2.5 seconds, and verifies an exact 100-byte partial response. The protocol and IPC are not replaced in this test.
- The complete renderer run exposed an asset-refresh loop that disabled and blurred metadata inputs between focus and text insertion. DOM event capture confirmed no input event reached state in failed attempts. The refresh lifecycle now performs one entry read and coalesces pending focus reads. Both shared and video asset regressions verify bounded reads, retained typed drafts, and delayed external metadata applied only after explicit reset. The original metadata-save scenario also passes unchanged.

## Automated integration evidence

- Real Codex live tests cover sandboxed read-only execution, conversation persistence/resume/fork, and final-answer structured output after a read tool.
- Real media tests start the vendor Studio, render a composition, probe the MP4, and render a trimmed clip containing audio.
- Electron tests cover the native preload boundary, native picker grants, real asset import and media decode, contextual-chat draft preservation, and prepared upload conversations.
- Application tests exercise real Git and local storage with controlled agent failures, interrupted script edits, recovery commits, and compensating undo.

The current test suite is the executable source of exact scenarios and counts. No Windows/Linux runtime, real public upload, translation, or deployed landing-page acceptance is implied by this journal.
