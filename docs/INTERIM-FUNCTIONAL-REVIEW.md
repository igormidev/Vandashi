# Interim functionality review

Reviewed the complete current [`genesis_prompt.md`](../genesis_prompt.md) and the
implementation on 2026-09-23, before translations. This is a bounded implementation
gap audit, not the final independent section-by-section acceptance review. Findings
below came from code-path inspection; their resolution requires focused tests and
appropriate native verification. Existing real integration evidence is recorded in
[`MANUAL-VERIFICATION.md`](MANUAL-VERIFICATION.md).

## Findings and resolution status

### F01 — Failed brand creation leaves an unusable reserved name

**Status: implemented; real filesystem/Git regressions pass, native recheck pending.**

`Home.create` calls `createBrand` before workspace checks. `ProjectStore.createBrand`
creates the visible brand directory and documents before initializing its two Git
repositories, and registers the brand only afterward. A missing Git executable or
failed initial commit leaves an unregistered directory; retrying the same name fails
with an existing-directory error. Git preparation currently requires an existing
scope, so the initial brand cannot reach that recovery UI.

Evidence: `src/renderer/features/brands/Home.tsx` (`create`),
`src/infrastructure/storage/projects.ts` (`createBrand`),
`src/application/dependencies.ts` (`check`). Relevant brief: L142–147, L149–155,
L257. Verify initialization/commit failure, unchanged registry, no visible partial
brand, safe same-name retry, and preservation of pre-existing folders.

The original failing path above is retained as historical evidence. Brand creation now preflights
Git and commits both repositories under an owned private staging directory before publication.
Exclusive copies publish the small brand manifest last; failure never recursively deletes a final
folder. A registry-write failure preserves the completed brand, and an exact-path/name retry can
register its unchanged clean initial repositories without rewriting files. Tests cover missing Git,
second initialization/commit failure, same-name retry, existing/raced folders, restart after failed
registration, rejection after later edits, and malformed manifests. A crash during publication can
still leave a preserved partial folder requiring inspection; this is not an atomic registry transaction.

### F02 — AI context receives a relative brand-logo path

**Status: implemented; focused prompt regressions pass.**

`saveBrandImage` stores a relative `brand_icon.<extension>` in brand configuration.
`buildWorkspacePrompt` inserts that value directly into its brand-logo context.
Video and clip Codex turns therefore receive a path relative to their own project,
rather than the actual file inside `brand_identity`. The mention picker already
uses the correct absolute identity path.

Evidence: `src/infrastructure/storage/brand-image.ts` (`saveBrandImage`),
`src/domain/prompts.ts` (`buildWorkspacePrompt`, brand-logo context). Relevant
brief: L283–298, L302–310, L549. Verify saved relative paths, existing absolute
paths, absent logos, spaces, and Windows paths in brand/video/clip prompts.

Relative logo paths now resolve beneath `brand_identity`; absolute Unix, Windows,
and UNC paths remain intact. The fallback uses that same identity directory.
Creation, clip, and asset-context tests cover those cases.

### F03 — Failed video or clip initialization remains visible

**Status: implemented; real filesystem/Git, application, and native saved-clip recovery regressions pass.**

Ordinary video/clip creation publishes its repository record before media seeding
completes. `createVideo` initializes storage before `seedVideo`; `createClip`
initializes storage before `media.createClip` and the initial chat startup. A media
failure leaves an incomplete entry and its occupied name, so the unchanged form
cannot simply retry. This differs from the transactional top-level finished-video
import, which already cleans unpublished work.

Evidence: `src/application/backend.ts` (`seedVideo`, `createVideo`, `createClip`),
`src/infrastructure/storage/projects.ts` (`initialize`, `createVideo`, `createClip`).
Relevant brief: L392–434, L563–568, and its general edge-case requirements. Define
the publication boundary: remove only newly owned unpublished files on setup
failure, and retain a recoverable project once useful work or a retained chat
exists. Verify media, Git, and first-turn startup failures separately.

The former order above has been replaced by a storage preparation callback. Both ordinary video
and clip initialization now seed real Hyperframes composition files in hidden staging, finish Git
commits, and validate the prepared receipt before publishing the manifest. Tests prove that partial
media writes and initialization/final-commit failures stay invisible and allow same-name retries;
existing, raced, and replaced preparation directories retain external files. Application regressions
exercise real local Hyperframes seed generation and copied clip source bytes with a controlled media
probe, separately from the recorded real decoder/render integration tests.

After a clip is saved, session persistence, Codex preflight/start, and snapshot-refresh failures return
`CreatedClip` with a failed generation outcome, diagnostic, and exact original prompt. The saved clip
is preserved and opened for editable retry, with a separate Open clip recovery action if the renderer
cannot hydrate it. Tests verify all four failures, retry through the existing chat, clean Git state,
and exactly one clip. The rebuilt native Electron suite passes the saved-clip failure/retry cases, including failed
workspace hydration followed by reopening the same clip without creating a duplicate.
An accepted video whose final workspace read fails instead reports its saved path and directs the
user to reopen it from the video list. A regression verifies intact seeded files, clean Git, reopening,
and rejection of duplicate creation; this path deliberately does not claim same-name setup retry.

### F04 — Finished-clip imports claim an editable composition that does not exist

**Status: implemented; 35 focused tests and the native imported-clip regression pass.**

`Publishing.importClip` creates a normal composition-origin clip and copies its
movie, but never creates `index.html`. The clip library exposes the ordinary editor;
its `Preview` starts Studio, which fails while opening the absent composition.
The importer also labels every non-square portrait input as 9:16, including 4:5.

Evidence: `src/application/publishing.ts` (`importClip`),
`src/infrastructure/storage/projects.ts` (`createClip`),
`src/renderer/features/clips/ClipsPage.tsx` (`openClip`/edit view),
`src/infrastructure/media/hyperframes.ts` (`startStudio`). Relevant brief:
L554–577, L600–604. Imported finished clips need a truthful origin/aspect contract,
an appropriate preview surface, retained original media, and failure cleanup.

Finished-clip import now uses `ImportedClip` and the staged imported-media writer,
records `origin: imported`, and accepts measured 1:1/9:16 with the same bounded
pixel-rounding tolerance as top-level video imports. It preserves source bytes,
validates the copied movie, commits its independent repository, and publishes its
manifest last. Metadata edits use a sidecar; source changes invalidate the export.
The clip workspace opens packaging chat and direct video playback without starting
Studio or exposing a render button. Normal composition clips retain their editor.

The shared publication helper creates directories and files exclusively, refuses
symlinks/replaced reservations, and never overwrites existing destination entries.
On failure only an empty, still-owned final reservation is removed. Nonempty final
folders are preserved with an explicit path diagnostic; private staging cleanup
also checks ownership. This preserves external work introduced during import.

`npx vitest run tests/finished-clip.test.ts tests/finished-video.test.ts
tests/storage-publication.test.ts tests/launch.test.ts` passes 35 tests covering
aspect classification, exact source bytes, export freshness, packaging/publishing,
failed validation/Git cleanup and retry, native path authorization, preservation of
external destination files, and replaced staging/reservation folders.
`tests/e2e/imported-clip.spec.ts` adds direct decoded playback, packaging save,
return navigation, and zero Studio/create/send calls. The rebuilt native test passes, including playback advancement and the display aspect ratio
reported by Chromium after applying the fixture’s non-square pixel aspect ratio.

### F05 — Returning Home shows stale brand names and access order

**Status: implemented; storage/state and native rename/Home regressions pass.**

Opening a brand updates registry name/last-opened data. The renderer updates only
its workspace; `Home` continues displaying the old `AppState.brands` snapshot.
Returning to the brand list therefore retains old names and ordering until an
unrelated application-state refresh. Renaming a brand has the same stale-list
effect.

Evidence: `src/renderer/features/brands/Home.tsx` (existing-brand click),
`src/renderer/app/store.tsx` (`setWorkspace`, `reload`, `refresh`),
`src/infrastructure/storage/local-storage.ts` (`openBrand`, `getState`). Relevant
brief: L149–155. Verify two brands, opening the older one, returning Home, and
renaming/revisiting without restarting the app.

Accepted workspace snapshots now merge their brand summary into application state
and reorder the Home list by last access. Workspace reads also persist externally
changed brand names into the registry. Tests cover manual and external renames,
restart persistence, two-brand ordering, and exclusion of private configuration
from the summary. The native brand-edit scenario also checks its saved Home name.

### F06 — Dot-prefixed project names become undiscoverable

**Status: implemented; filesystem regressions pass, native invalid-name recheck pending.**

`safeName` allows names such as `.draft`, and ordinary video/clip creation uses it
without rejecting leading dots. Project discovery skips every dot-prefixed
directory, so reopening the new project fails. Top-level finished-video import
already rejects these names explicitly.

Evidence: `src/infrastructure/storage/files.ts` (`safeName`),
`src/infrastructure/storage/projects.ts` (`records`, `createVideo`, `createClip`,
`importVideo`). Relevant brief: L426–434, L563–568. Verify invalid-name rejection
before creating files and preserve hidden implementation/recovery directories.

The shared `safeName` now rejects leading dots for user-created names. Real storage calls verify
brand, video, and clip rejection before creating hidden user projects, with unchanged listings and
directories. Implementation-owned hidden staging and recovery directories do not use this user-name
validation and remain available.

### F07 — Development effect replay duplicates gated startup operations

**Status: pending implementation.**

Read-only review found duplicate mount requests in workspace checks, composition preview,
manual Studio startup, and commit-message generation under React development StrictMode.
The successful first result can be abandoned while the replayed call fails on the operation gate.
Commit generation also depends on the whole workspace snapshot and may overwrite a typed
commit after an unrelated refresh. Reattach to owned pending operations and verify against
an actual development renderer; the production bundle does not replay these effects.
The asset-inspection variant is already fixed and passes its development regression.

### F08 — First-brand missing-Git recovery has no installation action

**Status: pending implementation.**

Brand creation now checks Git safely before writing, but Home still reports a missing
executable only through a toast. The user needs concise installation help and a retry
that preserves the selected parent and name. Checks with no workspace currently exclude
Git; this must be addressed without weakening the creation preflight.

### F09 — Chat opened while another operation runs can skip provider hydration

**Status: pending implementation.**

The backend returns a cached open session while its operation gate is busy. The renderer
currently marks that response as fully hydrated, so opening Creation chat during Studio
startup may retain stale history and unavailable generated images after startup completes.
Distinguish cached content from verified provider history and retry hydration when idle,
without stealing selection or replacing an unsent draft.

## Coverage and remaining acceptance

Brand/taste editing, contextual chat, script/Studio synchronization, assets,
composition preview/render, clips, release review, and upload-only main-video entry
all have implementation and recorded macOS evidence. This audit does not convert
unchecked requirements into acceptance merely because code exists.

Actual public upload/account-switch/login recovery, Windows/Linux runtime behavior,
translations, the deployed landing page, final README screenshots, and the final
independent acceptance reviews remain pending or unverified. Existing launch
fixtures establish preparation/validation behavior, not successful publication to
real platform accounts. Translation and landing work intentionally follow app
completion, as requested in the brief.
