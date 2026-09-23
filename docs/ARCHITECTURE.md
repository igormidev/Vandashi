# Architecture

Vandashi is an Electron desktop application. There is no hosted backend. The renderer talks to a narrow, validated preload bridge; the main process composes use cases and adapters. Hyperframes runs its own loopback-only editor service while a project is open.

## Dependency direction

`renderer → domain contracts ← application ports ← infrastructure`

`desktop` is the composition root and may wire all non-renderer layers together. Domain modules contain serializable models, schemas, prompt construction, and deterministic defaults. Application modules orchestrate workflows against injected ports. Infrastructure implements local files, Git, Codex app-server, and Hyperframes. A future cloud or GitHub-backed store replaces a storage adapter instead of changing UI or business rules. Dependency Cruiser rejects cycles and reversed dependencies; TypeScript strict checking and type-aware ESLint reject unsafe boundaries.

## Persistence

An application registry in the OS user-data directory stores selected brand, brand folders, settings, chat-to-Codex-thread mappings, and layout preferences. Each brand owns `brand_identity/` as a Git repository; each video and each clip is an independent Git repository. Markdown and validated YAML are authoritative. Shared assets have their own tracked metadata and are synchronized into the selected video's asset tree without overwriting local assets. Media binaries remain local. Writes use atomic replacement and revision guards where manual editing could race with external edits.

Manual asset updates/deletions and Brand/Packaging/document saves use `ManualMutation` behind the
storage port. It records owned regular-file copies, absent paths, file modes, and the complete
Git index entries under ignored `.vandashi-recovery/manual-*` directories with a recovery manifest.
The Git port can inspect a prospective staged index using a disposable index file without changing
the user's index. Writer, staging or commit failure rolls back only verified operation-owned files and index
entries, including unrelated entries changed by repository-wide staging. Before writing it captures
repository HEAD, the full index, and owned/dirty file hashes. Writers issue exact intended-byte
receipts before installation; later reads verify that state instead of adopting arbitrary bytes as
operation-owned. Failed writers may leave original bytes or an explicitly announced intermediate version;
recovery accepts only those recorded versions and skips installations that never occurred. Pre-existing
staged and unstaged bytes survive rollback. External edits invalidate ownership and preserve both
current files and recovery evidence. Completed commits are never rewritten: a partial multi-repository
save retains a same-request retry checkpoint for the current storage session and commits the remaining
repositories with the reviewed title/body without repeating writes. It does not provide a cross-repository
atomic commit or a process-crash transaction; preserved manifests/backups support recovery after a crash.

Asset deletion requires the exact media/sidecar revision from the opened confirmation through the
validated IPC contract and rechecks it at the physical deletion boundary. The scanner includes child
clip repositories: their references must identify the parent asset path, so a same-named clip-owned
asset does not block parent removal. Encoded paths, scripts, native Studio state, bounded source reads,
and symlink containment remain part of deletion validation. Shared-library deletion retains the
existing materialized video snapshots.

Reference matching preserves literal native filenames separately from decoded source-string
escapes, including names such as `x64.png` and `u1234.wav` on Windows. Actual mention serialization,
JSON, percent/entity encodings, and independent child-owned basenames have deletion regressions.

Brand creation preflights the Git executable, then prepares both initial repositories and commits in
a private hidden sibling directory. Initialization or commit failure removes only that owned staging
tree and leaves the requested name available for retry. Publication reserves a new directory with
exclusive creation, then copies each prepared directory/file exclusively and the manifest last.
The shared publication helper refuses existing entries, symlinks, and replaced destination roots;
it does not depend on directory-replacement semantics that differ between host operating systems.
Existing folders are never recursively deleted. Leading-dot names are rejected because workspace
indexing hides them.

A small versioned `.vandashi-brand.json` records the new brand ID and its initial commit hashes.
If registry persistence fails after publication, the completed files remain. Retrying the exact same
path/name can register them after validating the manifest, required regular files, empty video
directory, clean unchanged initial repository heads, and absence from the registry. This is structural
recovery evidence, not authentication; recovery never rewrites those files. Publication plus registry
storage is not an atomic transaction: a process crash during publication can leave a partial brand,
which is preserved and rejected on retry. Only a still-owned empty final reservation can be removed.

Composition video/clip creation uses the same publication boundary. Storage initializes a private
hidden sibling repository, invokes an injected media-preparation callback, commits the completed
seed, and validates its receipt before publication. Preparation callbacks must not reenter the
storage write queue. The application always supplies the real media initializer; persistence-only
callers may omit it. Failed initialization, seeding, or commits remove only the owned staging tree
and leave the requested name reusable. Published or externally replaced files are preserved.

`application/clip-creation.ts` holds one operation lease before the parent read and creation.
It retains ownership through publication and hydration, then transfers the same release handle
to `Chats.startOwned` for session preparation, accepted startup and final AI cleanup.
Clip creation returns a saved clip separately from its generation outcome. After publication, a
workspace-refresh, conversation-open, or unaccepted-turn failure returns the saved clip with a typed
diagnostic and `CreatedClip.generation.handoff`. The renderer opens that existing clip and offers
editable chat retry, or an Open clip recovery action if hydration fails; it never repeats creation.
If final video hydration fails after publication, its diagnostic explicitly identifies the saved path
and directs the user back to the video list. It does not suggest repeating creation with that name.

After completion, conversation hydration and Studio startup can mount together. The gate's
narrow `runStartup` path serializes `open-chat` against `studio-open`, including when both
waited behind a silent workspace read. It rechecks the current owner after each wait;
active AI, other mutations and duplicate startups still reject. Hydration retains its
existing cached-history deferral during foreground work. Studio preflight always holds
the lease before storage can repair or synchronize files.

Renderer-local preferences retain the selected conversation and unsent text/read-mode drafts across view changes and restarts. External-file selection grants are owned by the desktop process, not persisted as arbitrary trusted paths. Pane sizing saves merge the latest settings so resizing one workspace cannot erase another workspace's saved width. Settings for chat, commit messages, asset descriptions, chapters, and script synchronization are separate.

Renderer navigation claims a provider-owned transaction synchronously before asynchronous
workspace or Studio reads. It locks every editing/chat/navigation consumer through
destination adoption or failure, rejects duplicate requests and stale workspace versions,
and cannot release another request’s lock. Parent video metadata remains available while
a clip is selected, so parent Creation/Manual capabilities use the parent’s origin.

The renderer keeps editing locked until the current workspace reload finishes. Request
tickets reject older responses; incoming snapshots wait while a local draft is dirty,
and explicit workspace changes invalidate deferred snapshots. Validation state belongs
to a full workspace scope, so progress from one project cannot unlock another. Leaving
Studio for dependency checks follows the same flush/save/discard path as navigation.
Pending destructive or saving operations lock their modal controls and dismissal;
the permanent live region keeps error feedback accessible while a modal remains open.

## Agent execution

Prerequisite checks require fresh Codex discovery of the exact `hyperframes` core skill
with valid name/path and explicit enabled status. Filesystem presence cannot prove readiness;
failed discovery remains unverified. Missing skills link to external installation guidance
because global setup exceeds the repository-only repair sandbox. The bundled runtime and
host media tools likewise require external setup; no current check advertises an AI repair
for an unreachable installation path. Git recovery failures retain their original details
and route to external recovery without weakening clean preflight. The generic prepared,
unsent repair composer is reserved for a future verified repository-writable repair target,
and requires a successful Codex check; failed revalidation hides an existing repair pane.

Use the installed Codex harness and its app-server protocol. Models and reasoning levels come from the live server. Conversation IDs persist per context. Read mode is enforced by the harness sandbox. A global operation lease spans foreground chat, metadata generation, commit generation, script synchronization, and publishing. Prompts repeat required context each turn. Every edit operation captures Git checkpoints across affected repositories. Completion reconciles commits, including interrupted runs. Undo verifies a recoverable Codex turn and Git checkpoint before touching either, preserving a backup ref.

An AI operation whose writable root contains the parent video also includes all registered
child repositories in clean preflight, checkpoints, reconciliation, receipts, and Undo. This
application-only repository resolver leaves manual-save scopes unchanged. Publishing chats
remain visible under their parent while a validated topic selects the clip operation scope;
send-time checks probe its current media and repeat the parent ledger path explicitly.

Undo revalidates clean expected heads after provider forking and before restoring. The Git
adapter uses a non-forcing two-tree checkout and a compare-and-swap HEAD update. Compensation
touches only commits returned by this Undo operation and checks their expected heads again.
Publishing edit checkpoints, legacy checkpoints with unknown mode, and an older read checkpoint
followed by an uncertain publication are not reversible through generic Undo: a local Git change
cannot undo a remote post. Explicit read-only publishing checkpoints retain ordinary Undo.

Successful edit turns also persist an application-owned receipt derived from the net Git
diff between captured and verified final commits in every repository. This includes
changes committed directly by the agent and edits without provider file-change events.
The receipt is emitted only after conversation persistence succeeds, distinguishes no
net file changes, and never replaces the agent's own words. Interrupted or failed turns
retain their error history without a success receipt. The Git port exposes immutable
commit comparison; the adapter validates full commit hashes and uses literal file paths.

Layout/preferences writes are outside the project-operation lease because they do not change creative files or a running turn's captured model selection. Workspace reads use a stable cached snapshot while a lease is active: reading storage can itself synchronize shared assets or repair malformed YAML, so it must not race an agent halfway through a write. Change notifications are deferred until the lease is released.

Studio startup/render origin checks and storage preflight run inside their existing
operation lease. Backend wrappers must not open the workspace before delegating to
those methods: even a preliminary origin check can repair files during another turn.

An uncertain Codex start acknowledgement cannot release that lease or roll back staged
files while its process might still write. The adapter awaits process shutdown, then the
application preserves and reconciles the uncertain edits without claiming success or
changing an older undo checkpoint. Reopening history merges recovered provider items
with local receipts and adjusts message boundaries without inventing Git checkpoints.

## Host security

Node integration is disabled; context isolation and renderer sandboxing are enabled. IPC validates both the top-level sender and runtime payload. The preload exposes use cases, never shell execution. Media access is rooted in registered project directories and rejects escaping symlinks. External links require an allowed HTTP(S) URL. Hyperframes is isolated from the privileged preload. Native window minimum size is 1200 × 720.

Picker and native drop events grant access to specific canonical external files for previews and imports. Grants are rechecked before use. The media protocol serves supported media types only with restrictive response policies. Unfinished edits and operations block window unload until a native confirmation; process disposal happens only after the close is accepted.

Codex-generated images have a separate exact-file capability. The adapter learns the actual
Codex home from initialization and registers only completed image-generation items from live
events or freshly fetched provider history. The saved path must match that home's
`generated_images/<thread>/<item>.png`. Every media request rechecks a regular canonical file
and rejects symlinks in the configured home or artifact subtree. The desktop composes this
resolver with existing file permissions; it exposes no directory grant or extra renderer IPC.
Local session JSON and Markdown paths alone cannot authorize provider files. Selected-chat
hydration restores verified grants after restart without eagerly reading every open chat.

An open-chat response can carry transient `historyDeferred` metadata while another
foreground lease owns the provider. Cached content remains visible but does not refresh
artifact capabilities. The renderer retries on idle, including an idle event delivered
before the cached IPC response. It does not persist that flag or select a conversation
from background hydration. Passive workspace reads have no idle notification, so an
open waits behind their lease and then verifies provider history normally.

`desktop/media-handler.ts` authorizes each media request and streams through Electron's
file fetch. It supplies HTTP byte-range status and size metadata explicitly: Electron's
file fetch can return a sliced body with status 200 and no range headers, which makes
Chromium reset a seek to zero. Full responses and HEAD advertise the file length;
single ranges use 206 and Content-Range, unsatisfiable ranges use 416, and unsupported
multipart or conditional ranges fall back to the complete file. Responses retain the
restrictive CSP and nosniff policy and disable caching. The native media regression
uses actual native selection grants and the production handler, verifies a full HD
H.264 export decodes, seeks to two seconds, advances playback, and serves exact bytes.
It does not replace the protocol with a fixture implementation.

## Asset inspection

`MediaPort.inspectAsset` owns temporary visual samples, local speech recognition,
and a source SHA-256 token. The application passes only bounded evidence to its
configured Codex metadata model and disposes the lease after the turn. Confirmed
import revalidates the source token before applying automatic metadata to a copy.
The pinned speech model lives in app data; its CPU worker runs in a separate process
and exits after inspection. See `ASSET-INSPECTION.md` for sampling, model provenance,
resource limits, and verification.

Inspection progress and cancellation carry a unique request ID. The renderer
reattaches to one pending promise when development StrictMode replays an effect.
Cancellation aborts only that request, interrupts Codex only during its description
turn, and waits for worker/evidence cleanup before releasing the global operation
lease. Late events and cancellation IDs cannot target the next asset in a queue.

## Renderer operation ownership

`renderer/shared/owned-request.ts` retains a component's logical request across React
development effect replay, including its settled result. It is not a global operation
cache and does not bypass the application gate. API identity, scope, and retry attempt
determine when a new request starts; preview startup uses the provider's adopted
workspace snapshot identity so unchanged-revision completions restart stopped watchers
without a competing independent workspace read. Each Preview instance serializes its
startup promises through actual IPC settlement, independently of activity-event timing.
Before dispatch it skips any snapshot already superseded by a newer one. A previous
failure releases the startup queue without suppressing the current request's diagnostic;
obsolete subscribers cannot display an error or toast. Stale effect subscribers
cannot publish results. Workspace checks include their single successful refresh in
the shared promise and unlock only after its final result. Commit confirmations pin
the opening scope, revision, and summary, preserving reviewed text through passive
workspace refreshes. Native regressions use the actual Vite development renderer,
prove StrictMode replay, and hold gated responses so duplicate requests would fail.

The script editor's accepted handoff belongs to the exact submitted text and original
workspace snapshot. Editing, undo/redo, or adopting a later snapshot restores ordinary
dirty tracking. A failed refresh therefore cannot turn subsequent edits into disposable
clean state. Empty script guidance creates an app-owned message descriptor that follows
the current UI language; nonempty guidance remains verbatim user content, even when it
has exactly the same text as the descriptor's English fallback.

Automatic clip requests persist a typed ratio/time descriptor alongside separate raw guidance.
History renders the descriptor in the current language and guidance through the ordinary Markdown
path. Provider prompts use an English fallback plus untouched guidance. A bounded typed handoff
in the draft cache survives tab switches/reopen/reload; it accompanies send only while the text
still equals its app-owned seed. Edited retry text is ordinary user content. Desktop validation
accepts only the clip descriptor shape, and preparation rejects it outside a clip conversation.

## Localization

English UI resources live in `src/renderer/locales/*-en.ts` and `en.ts`, merged through
`resources.ts`. Their literal types augment i18next to reject unknown keys and incorrect
interpolation parameters. Flat, reviewed `<locale>.json` files live beside the source;
diagnostic translations live in `domain/messages/translations`, and native translations
in `domain/native-translations`. Typed catalog indexes connect these independent layers.
Canonical locale IDs and region normalization live in `domain/locales.ts`. Settings list
available languages using autonyms, persist the canonical locale, and update the HTML
language. Native dialogs use the main process's cached saved locale synchronously.

Catalog tests reject duplicate/missing/extra/empty keys and changed interpolation tokens,
exercise every count category, and preserve user/provider text. Reviewed Romance-language
counter forms explicitly handle `many`; Brazilian Portuguese also uses plural numeric-zero
forms. Local Noto Sans JP/KR variable subsets supply CJK glyphs, with a Korean-first fallback
and word wrapping for Hangul. Language changes do not rewrite stored project content.

Known app-owned chat headings resolve from stable topics at render time, sharing the exact
13-guide label map with the Brand editor. Clip names, asset titles, and unknown historical
topics remain content. Preview/Studio failures retain typed diagnostics in component state,
so persistent errors translate without restarting their gated startup requests.

`src/domain/messages.ts` combines framework-free source catalogs into a discriminated
`AppMessage` union with required named parameters. `AppFault` and `DiagnosticError`
preserve that identity separately from optional external details. Application errors,
recovery notices, checks, metadata warnings, and persisted chat errors use descriptors;
raw agent prose, model names, paths, user content, and vendor diagnostics remain verbatim.
The renderer resolves descriptors in its `messages` namespace at presentation time.

The main IPC handler returns a validated failure envelope without changing successful
return values. The preload encodes its diagnostic in a versioned Error.message because
Electron contextBridge discards custom Error fields. The renderer decodes once; an
external diagnostic resembling that marker is never recursively interpreted. Payload
lengths, keys, IDs, and parameters are validated. Translation began after the English
implementation checkpoint; language-specific reviews and actual layout acceptance are
recorded in [TRANSLATION.md](TRANSLATION.md).

## Browser landing page

`landing/src` is a separate browser-only entry with its own strict TypeScript environment,
complete locale catalogs, and production `/Vandashi/` base path. It imports no desktop
runtime, renderer, host adapter, or Node API; dependency rules enforce this in both
directions. It shares only installed UI/font packages. Source checks and builds include
both products; three-engine production browser tests are separate from native Electron
tests. See [SITE.md](SITE.md) for content, screenshot provenance, and deployment.

Desktop permissions still default to denied. `renderer-permissions.ts` permits only
`clipboard-sanitized-write` from the exact top-level app WebContents, requesting document,
and current loaded document. Clipboard reads, embedded Studio, other windows, and all
unrecognized permissions are denied. Native image copying remains behind its validated
asset capability; it does not grant browser clipboard reads.

## Brand drafts and image identity

Brand snapshots include a bounded hash of the contained logo bytes, checked for file
replacement or mutation during reading. Same-path image changes therefore invalidate
stale manual saves and refresh the preview. The media protocol permits an optional
64-character hexadecimal revision solely for cache identity; exact path authorization,
methods, supported extensions and restrictive response policies still apply. Owned Brand
saves explicitly adopt normalized config/documents even if the revision is unchanged;
passive snapshots continue to preserve unsaved drafts.

## Shared assets during AI changes

Shared-asset materialization participates in the AI transaction. Read-only registered
path discovery validates manifests without broad project summaries, YAML recovery or
materialization. `ChatPreparation` checks every captured repository before any write;
an untouched rejection emits no workspace refresh, while partial preparation does.
After strict clean preflight, captured parent/clip scopes synchronize their copies and save deterministic
housekeeping commits before the turn's baseline heads are captured. The same scopes
synchronize again under the operation lease before final reconciliation, verified heads
and receipts, including interrupted or uncertain edits. A conflict preserves partial
work and its commits but prevents a verified receipt/Undo boundary. The narrow serialized
`StoragePort.syncSharedAssets` method avoids broad workspace repair during finalization;
ordinary workspace entry and Checks retain their existing behavior. Final AI edit commits
still use the configured commit-message helper with deterministic failure fallback.

## Source and commit verification

Localization lint validates literals throughout renderer and landing TS/TSX, including
templates, helpers, uppercase constants and accessible attributes. Exact file-specific
machine tokens are the only allowances; translated catalogs and raw user/provider data
retain their separate contracts. Architecture rules constrain both internal layers and
external packages, including Node host modules. The application layer permits the pure
`node:path` utility while filesystem/process capabilities stay behind infrastructure ports.

The pre-commit hook materializes an immutable copy of the Git index and runs the entire
`npm run check` there using a validated matching dependency installation. It preserves
unstaged edits and original index bytes, rejects escaping source symlinks, gitlinks and
checkout-filter substitutions, strips inherited Git routing from test subprocesses, and
rejects concurrent index changes. A commit cannot pass using an unstaged correction or
an untracked helper. Shared dependency symlinks retain package paths during boundary checks.

Video lists hold a coalesced per-brand silent workspace-read lease because YAML recovery
can write files. Reads wait behind active work; mutations cannot overlap those reads.
The renderer separates loading, persistent failure/retry and confirmed empty results.
Thumbnail requests reset on replacement/removal and ignore obsolete replies; failed
grants or image decoding preserve a usable placeholder and explicit retry.

## References

- [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron protocol handlers and streaming schemes](https://www.electronjs.org/docs/latest/api/protocol)
- [HTTP range request semantics](https://httpwg.org/specs/rfc9110.html#range.requests)
- [Type-aware ESLint](https://typescript-eslint.io/getting-started/typed-linting/)
- [Dependency Cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)

See integration-specific documents for pinned upstream versions, protocol details, and upgrade checks.

## Loading feedback

Pending user actions use a shared inline spinner and localized label, with busy semantics
on action controls and status announcements for background waits. The commit dialog
shows an indeterminate progress strip while generating reviewed text; no fabricated
completion percentage is presented. Generation can be dismissed without losing the draft,
and late results cannot reopen the dialog. Reduced-motion mode retains the visible status
without movement. Request ownership also governs loading completion so stale responses
cannot clear the current operation’s indicator. Session-list retry and per-tab closing have
separate owners, so background hydration cannot hide a draft or clear another request.
`PendingIconButton` keeps image/SHA copy actions visible and prevents repeated writes.
`WorkspaceNavigation` renders destination-owned progress, and the global busy header remains
visible at the minimum window width even after a helper dialog is dismissed.
Model selection remains locally owned only while persistence or adoption is pending or
failed. Provider refresh returns an explicit success result; failed state/model discovery
retains the selected value, draft and Retry. Successful adoption clears the override so
every mounted chat follows subsequent global selections, including Settings changes.

## Studio discard recovery and save flushing

Studio retains the opening baseline plus its exact owned discard safety commit until
restore succeeds. Its changes view combines the preserved diff and current working
changes, keeping navigation pending after a failed restore even when Git is clean. Retry
restores from that same safety commit; Save instead synchronizes the complete retained
diff into the script and records the reviewed approval. Guarded safety commits use a
private index, index lock, exact commit parent and compare-and-swap HEAD update; restore
receives that exact expected HEAD. Concurrent external commits/index changes are preserved.

The isolated iframe bridge tracks pinned Hyperframes source-mutation routes. Export,
selection and probe failures do not become editor-save failures. File-write HTTP409 is
accepted only when the vendor’s returned current content exactly matches the attempted
body and a current version exists. Request/response clones preserve vendor streams;
conflicting or malformed replies continue to block flush.

Dependency checks carry the original typed diagnostic and a separate typed recovery
message. The renderer translates both independently, preserving parameters and raw
provider details without converting an app-owned cause into English-only external text.

## Initial renderer navigation

The desktop load helper observes the first main-frame navigation before calling loadURL.
If native Reload supersedes it, only the exact ERR_ABORTED/-3 rejection plus an observed
replacement can keep startup pending. Success requires that replacement to finish at the
authorized renderer URL. Other URLs, genuine initial/replacement failures, stopped loading
and destroyed contents remain failures; temporary listeners are removed on settlement.
Window-close cleanup is registered before loading. The native regression holds an actual
initial resource, reloads through Electron's normal action and releases the replacement.
