# Working on Vandashi

Read `genesis_prompt.md` and `docs/REQUIREMENTS.md` before changing a feature. The brief is the product contract. Update this file and `docs/ARCHITECTURE.md` whenever relevant architecture changes.

## MANDATORY AI test scope

- NEVER run the full test suite, unrelated tests, or existing test cases unless the
  user EXPLICITLY asks for that testing. A request to implement, fix, commit, push,
  build, install, or release is NOT permission to run all tests.
- By default, run ONLY tests you create during the current task. Pass exact test
  file paths. When adding cases to an existing file, also use Vitest's `-t` or
  Playwright's `-g` to select ONLY the newly created cases.
- NEVER use bare `npm test`, `vitest run`, `playwright test`, `npm run check:all`,
  `npm run test:e2e`, or `npm run test:site` as a routine task check. Do not broaden
  testing through default discovery, directory/glob selection, hooks or packaging.
- Review affected code and consumers, and create meaningful focused tests where
  needed. Documentation-only changes do not require invented tests. If wider
  testing would help, report that limitation; do not run it without an explicit request.
- `npm run check` and the pre-commit hook perform static/source/build checks only;
  they MUST NOT invoke test suites. Automated native/site CI remains separate;
  agents must not duplicate those runs locally or dispatch extra suites without
  explicit user authorization.
- This policy takes precedence over older broad-testing instructions in the brief,
  integration guides, historical checklists and agent guidance. NEVER restart a
  large regression sweep merely to finish a small task.

## MANDATORY quality gates

- EVERY commit MUST increase the app version and update the concise release notes. Run
  `npm run version:bump -- "A short user-facing change summary."` before staging, and
  stage `release.json`, `package.json`, and `package-lock.json` together. Keep notes to
  one to three short items. A source version is not an available update until its
  verified installers and update metadata are published as a complete GitHub Release.

- ALWAYS follow dependency boundaries. NEVER bypass a port to reach the filesystem, Codex, Git, Electron, or Hyperframes from the renderer.
- ZERO static analysis warnings or errors. Run `npm run check` before EVERY commit. This includes version consistency, Prettier formatting, strict types, lint, architecture, and production builds, with NO tests. Run only the tests permitted by the AI test-scope policy separately. NEVER disable static checks to make a commit pass. Git hooks and CI enforce the same source gate.
- Add meaningful tests for business rules, concurrency, recovery, schemas, and edge cases. Avoid tests that merely restate code.
- COMMIT after each verified feature or meaningful increment. Ask before every commit: does this meet the brief, handle failure and edge cases, preserve architecture, avoid unnecessary UI text, and require updated documentation?
- Check ALL consumers of a shared component before editing it, especially brand and video assets and chat. Cover affected behavior with task-created tests and focused manual inspection; do not run existing page suites without an explicit request.
- Never claim a feature works from compilation alone. Exercise real integrations and inspect the actual app. Record unavailable external prerequisites honestly.
- NEVER hardcode user-facing text in UI components. The English implementation checkpoint is complete and translation is active. Keep English source keys and every supported UI/diagnostic/native catalog in sync; preserve named interpolation and review natural language in context. Follow `docs/TRANSLATION.md` and its catalog/layout checks.
- Localization checks cover TS helpers, templates, constants, JSX and accessible attributes. Keep machine-token exceptions narrow and file-specific. Layer imports use explicit package allowlists; host APIs belong behind infrastructure ports.
- The pre-commit gate checks the staged snapshot. Stage complete changes and gate helpers; keep installed dependencies consistent with the staged lockfile. Never rely on unstaged fixes or untracked helpers to validate a commit.
- Keep app-owned message descriptors separate from raw provider output and user content. Use `AppFault` with a typed ID from `src/domain/messages.ts` for app-owned errors and retain external diagnostics separately. IPC uses a validated failure envelope, then a versioned marker through Electron's copied Error.message; decode only at the renderer boundary. Never infer a translation key by matching English prose. Keep native dialog text in its typed source catalog and preserve raw user/provider content.

## MANDATORY local macOS update

On Igor's Mac, `/Applications/Vandashi.app` is the ONLY canonical installed copy.
After EVERY completed repository change that increments the version, update and
relaunch that app before reporting the local update complete. This also applies
when working in a Codex worktree: package the checkout containing the completed
changes and install it at the same canonical path. Questions and read-only reviews
do not require a rebuild.

- Updating and gracefully restarting this installed app is already authorized.
  Do not repeatedly ask for installation or restart permission. Check for active
  operations and unsaved work first; wait for operations to settle, and NEVER
  force-quit, discard or silently commit the user's manual drafts to make an update
  possible. Prepare the update while waiting. If a draft still blocks restart,
  report that specific blocker and retain the prepared app.
- Follow the AI test-scope policy and run the required static/build gate. Package
  the host architecture with `npm run package:dir` into a unique private temporary
  directory, explicitly overriding `build.directories.output` and passing
  `--publish never`. `npm run build` alone does NOT regenerate an installed `.app`.
  Do not leave another launchable build in the repository's `release/` directory.
- Validate the packaged bundle ID (`com.vandashi.studio`), app/package/release
  versions and generated output before installation. Gracefully quit the current
  app and verify its processes have exited. Preserve its exact bundle in an owned
  backup outside Spotlight-indexed locations; stage and verify the replacement
  on the same filesystem, then replace `/Applications/Vandashi.app` with guarded
  renames. Preserve the previous bundle for rollback if replacement or startup
  fails. Never overwrite a concurrent installation.
- Preserve the established user-data directory, settings, credentials, brands,
  assets and Git histories. Archive only verified, agent-owned duplicate build
  bundles after the canonical replacement launches successfully; do not remove
  user data or unrelated applications.
- Launch the exact canonical path and verify BOTH the running executable path
  and the About-screen version against the completed source version. A successful
  build, staged bundle or source commit is NOT proof that the installed app was
  updated. Report a failed or blocked installation honestly.
- This local development update is separate from the public updater. Do not
  publish or move release tags to satisfy it; public releases still require the
  complete verified installer matrix and update metadata.

## Design contract

Use Hyperframes' studio visual language: quiet dark surfaces, restrained borders, compact controls, sparse copy. Do not put everything in cards or add empty marketing subtitles. Explain with accessible tooltips. Use official platform marks. Horizontal scrollers carry padding INSIDE their content so scrolling reaches the component edge. Keep keyboard navigation, focus visibility, reduced motion, and error recovery usable.

Browser-picker question text stays neutral; do not color individual social-platform
names inside sentences. Installed app icons come from host-verified app resources,
never a generic MIME-type placeholder or a renderer-provided filesystem path.

## Safety and consistency

Opening an existing brand registers its selected canonical folder in place. Validate
the identity/shared repositories, guides, config and child identity records without
repairing or rewriting them during registration. Publish a missing legacy identity
manifest exclusively, so later moves retain the same ID; never overwrite an existing
manifest. Preserve existing IDs and Git history;
reopen known folders idempotently, relocate only missing registered paths, and reject
conflicting live copies. Import authority requires an exact native directory grant.

Only one AI operation runs globally. Dirty manual drafts block AI and navigation; active AI blocks manual writes. All repository changes must be committed after AI, including failure recovery. Script synchronization has an explicit staged-script exception. Preserve user files, validate path containment and symlinks, and keep recovery backups before repairing invalid YAML. Never expose generic shell or unrestricted filesystem IPC.

Acquire the operation lease before Studio/render workspace preflight and imported-video
checks. Even a workspace read can repair YAML or synchronize files; wrappers must not
perform that read before delegating to the already-gated application method.
Conversation hydration and Studio startup serialize with each other after workspace
reads, rechecking ownership when they wake. This narrow startup coordination must not
queue competing AI edits or duplicate Studio requests behind an active operation.

Video-library reads also repair YAML. Coalesce them per brand, wait for active work,
and retain the silent workspace-read lease through storage completion. Distinguish loading,
failure and confirmed empty results; stale thumbnail responses must not replace current media.

Brand creation checks Git before writing and prepares both initial repositories in a private staging
directory. Never recursively clean a published brand or an existing user folder after failure. An
unregistered brand can resume registration only at the exact requested path with a valid creation
manifest, complete files, and unchanged clean initial commits. Project names cannot start with a dot.
Video/clip media preparation runs under the unpublished storage transaction. Publish prepared files
exclusively with the manifest last, and never reenter the storage queue from a preparation callback.
Clip creation retains one operation lease through publication, workspace hydration and chat
preparation; the accepted AI turn inherits that same lease through final cleanup. Never expose
an idle interval between those stages. Once published, later chat/refresh failure returns the
saved clip receipt and typed retry handoff, never automatic duplicate creation.
Keep the automatic clip instruction separate from raw user guidance in persisted messages
and drafts. Only an untouched app-owned retry seed may retain the typed handoff when sent.

Studio discard retains the exact owned safety commit and its opening baseline until
restoration succeeds. Retry that transaction after a transient failure; its pending diff
continues to block navigation even though the safety snapshot made Git clean. Safety
commits and restore must compare the expected HEAD and preserve concurrent external
content and index changes. The pinned Studio bridge tracks actual source writes, not
render requests, and honors only the vendor’s exact same-content/version 409 success.

Media playback regressions must exercise the production protocol with real native file grants. Fixture protocol replacements do not verify seek behavior or access control. Preserve range metadata and restrictive response policies when changing media delivery.

Provider image capabilities come only from completed Codex items or freshly verified provider history. Never grant access from renderer Markdown or local session metadata alone, and never broaden access to a Codex-home or temporary directory. Revalidate the exact canonical artifact before every read.

Cached open-chat responses during a foreground operation are transiently marked as
history-deferred. Do not treat them as verified provider history or persist the flag.
Retry on idle without changing selection or drafts, and handle idle arriving before
the deferred response. Silent workspace reads must queue hydration rather than defer
it to a foreground event that will never arrive.

An uncertain AI start must await process shutdown before file recovery or lease release. Preserve uncertain edits; never restore staged files merely because the start acknowledgement was lost. History recovery must preserve app receipts and verified undo boundaries.

Every awaited user action needs immediate, visible local loading feedback through its
actual completion, failure or cancellation. Use shared spinners and existing translated
phase labels; disable duplicate actions and expose busy/status semantics. Indeterminate
AI work must not display invented percentages. Respect reduced-motion preferences.
Keep local model overrides only while saving or recovering a failed adoption. After a
successful settings and discovery refresh, every mounted chat must follow the latest
global model, reasoning and speed preference. A swallowed refresh failure is not success.
Attachment picking and sending share a synchronous composer owner. Lock attachment
addition/removal, mode and submission through picker settlement and send acknowledgement;
retain the exact draft and file selections after a failed send so retry is truthful.

Keep UI editing locked through workspace refreshes, not only the preceding operation.
Never replace a dirty local draft with an asynchronous snapshot. Validation belongs to
the complete workspace scope. Async modal actions must lock both controls and dismissal
until they resolve; preserve entered values and offer retry when they fail.

Asset-inspection progress, cancellation, and evidence ownership use a unique request
ID. Reattach to pending work across development StrictMode effect replay; never launch
a duplicate operation and abandon its cancellation handle. Retain the operation lease
until processes stop and temporary evidence is disposed. Preserve the inspected
source hash through review and reject changed source bytes before importing metadata.

Gated mount operations (workspace checks, Studio startup, commit suggestions) retain
their owned promise across effect replay. Key requests by scope and explicit retry;
key preview startup by the provider-adopted workspace snapshot, including unchanged
source revisions after a stopped watcher. Do not independently reread the workspace
from Preview while the provider adopts its refresh. Serialize each Preview instance's
startup promises through actual IPC settlement and skip superseded snapshots before
dispatch. An obsolete failure must not poison the latest attempt or generate a toast.
Keep shared refresh work in
the promise and deliver UI effects only to the current subscriber. A commit dialog
owns the draft that opened it; passive workspace snapshots must not regenerate or
overwrite its reviewed title and description. Verify replay with development React.

A script handoff exempts only its exact accepted draft and originating workspace
snapshot from dirty checks. Later edits, undo/redo, or an adopted snapshot restore
normal dirty tracking, including after a failed refresh or unchanged source revision.

After an owned Brand save, adopt the returned normalized config and documents even
when the revision is unchanged. Bind logo previews and stale-save validation to verified
contained image bytes; cache revisions never replace native path authorization.

Structural changes require a separate read-only agent to check whether the landing page and screenshots are still accurate. Do not add claims for unfinished features. Every agent reads the original brief. Final audits must be independent and section-specific.

Keep Chromium's OS sandbox enabled in both distributed launchers and verification.
Playwright Electron launches must explicitly set `chromiumSandbox: true`; its Linux
default adds `--no-sandbox`. Inspect the actual AppImage's launcher and desktop entry,
then run that extracted launcher and verify the renderer's OS sandbox state. Never
silently disable sandboxing when a host blocks user namespaces. CI may load an exact
executable AppArmor user-namespace profile on its ephemeral runner; it must not change
host-wide restrictions. Preserve the owned AppRun's executable Git mode when packaging.

Resolve app-owned chat labels from stable topics at render time. Preserve user clip/asset
names, unknown historical titles, and all raw content. Persistent failures retain typed
diagnostics so a language change updates the explanation without restarting the request.

The landing page lives in `landing/src`, with its own browser-only TypeScript environment
and eight complete catalogs. It must never import Electron, host adapters, Node, or desktop
renderer code. `npm run check` statically verifies and builds both products without tests.
Run task-created site tests against the production `/Vandashi/` base path; the complete
`npm run test:site` suite requires an explicit user request. Keep screenshots tied
to an identified real app revision; preserve full captures in `docs/screenshots` and record
any lossless web encoding in `docs/SITE.md`. Never replace real screenshots with invented UI.

Clipboard permissions default to denied. Only sanitized writes from the exact top-level
app document may pass the production permission handlers. Keep reads, unknown permissions,
other windows, and embedded Studio frames denied; test native history and both asset consumers.

A native Reload can supersede the first renderer navigation. Keep startup pending until
that replacement successfully loads the exact authorized renderer URL. Do not turn an
aborted request into success without observed replacement navigation, and preserve genuine
load failures and window-close cleanup.

Manual asset and workspace saves retain owned file backups and exact Git index entries before writing.
Writer receipts identify exact intended bytes before installation; never adopt post-write reads as
proof of ownership. Rollback must restore all index entries changed by repository-wide staging,
including unrelated pre-existing entries, while preserving unrelated working files.
On writer or Git failure, restore only when HEAD, index, and owned bytes still match the operation; preserve
external changes and recovery evidence otherwise. When a writer fails after announcing an installation,
only the original bytes or explicitly announced versions can be treated as owned; skip writes that
never installed so their persistent failure cannot prevent restoring earlier files.
A partially committed multi-repository save retries
its original request without repeating writes or replacing reviewed commit text. Asset deletion binds
confirmation to the reviewed media/sidecar revision and checks exact parent references from child clips.

AI writable parent roots include their registered child repositories: capture, validate, reconcile,
report, and Undo that full set. Publishing conversation ownership remains with the parent even when
the selected media belongs to a clip. Revalidate its current media at send time.
After provider forking, Undo rechecks expected Git heads and cleanliness. Restore and compensation
must preserve concurrent external work. Never offer generic Undo for possible external publishing
effects; keep the ledger and history, with an accessible localized explanation.

Discover registered AI repository paths through read-only manifest/registry parsing before
any workspace hydration, YAML recovery or shared-copy write. Reject dirty repositories without
emitting a refresh that could later mutate them. Once preparation writes begin, failed partial
preparation must still refresh the workspace. Settle shared copies for captured parent/clip
scopes only after clean preflight and before AI checkpoint capture. Synchronize again under the same lease before final commits,
verified heads and receipts. Preserve synchronization conflicts and save partial work;
do not emit a success receipt or verified Undo boundary after an incomplete sync.

Prerequisite readiness requires fresh Codex discovery of a valid explicitly enabled exact
`hyperframes` core skill. Filesystem copies and auxiliary skills cannot pass that check.
Host installation chats use only the allowlisted `setup:` topics and a separate app-owned
working directory. Explicitly sending in install mode grants host setup access; creative
project chats retain repository-only writable roots. Never infer installation authority
from user text or a generic repair topic. Fresh Codex authentication/usage is required at
send time. Preserve projects and existing settings; installations have no Git Undo or
project-change receipt. Bundled-runtime failures and Git recovery still need external
guidance. Emit chat settlement only after persistence/recovery and lease release; every
chat on the verification page triggers a fresh check before navigation. Keep the chat
mounted through rechecks and failures, and disable the entire checklist during AI.
For ChatGPT accounts, unavailable usage permission stays unverified and blocks entry/repair;
only a fresh explicit permission establishes recovery. API-key/custom providers do not
inherit a ChatGPT subscription-quota requirement.

Updates use completed published GitHub Releases, never an unbuilt source version.
Keep automatic download and install-on-quit disabled. Download and apply require
separate explicit confirmations tied to the reviewed version. Startup and 20-minute
checks coalesce without replacing a ready download; offline/missing feeds are not
up-to-date success. Verify artifact identity, length and digest before download/apply,
quarantine rejected native cache files before retry, and retain normal quit cleanup
ownership after windows close. Unsigned macOS uses the verified installer fallback
until Developer ID signing/notarization and a real signed update are verified.
Release publication follows the entire platform test matrix, uploads to a draft,
validates any existing tag against the tested commit, and publishes last.

Full-file audio/video evidence belongs to the shared TranscriptionPort/AssetStore path.
Never replace it with sampled inspection speech, trust renderer-provided analysis, or
write derived `_shared` metadata. Bind category decisions to exact asset revisions;
completed empty speech and explicit music/effect skips must not loop on entry.
Keep transcript source hashes distinct from stored container hashes across embedding.
AI preflight and final verification include every captured child repository, hold the
same operation lease, and preserve partial changes before reporting a failed repair.
The app-owned ASSET_TRANSCRIPTION.md and bundled CLI use the same production pipeline;
Codex receives read-only prepared caches, never expanded global writable roots.
New transcription model/runtime downloads must stay pinned and verified. Do not
substitute an unpinned torch.hub load. Keep word alignment limits truthful and retain
full ASR text when an alignment model cannot align individual words.

Editing presets are a third brand-owned repository at `edition_presets`. Discover it
read-only before hydration and capture it in AI reconciliation and Undo. Each named
preset owns `HOW_TO_USE.md`; mentions use the folder's natural name. Never broaden a
missing preset-specific chat to the library. Recognize only the exact clean empty legacy
initial library without a marker; exclusively identify it under owned preparation,
preserving history. Unknown, dirty, symlinked or conflicting folders remain rejected.
Preset initialization cleanup must compare its captured directory device/inode.

Asset creation uses an exact app-owned generation stage outside asset libraries. Add
only that stage to creative writable roots, retain it on failure, and send it to native
Trash only after verification and commits. Compare canonical path/device/inode before
cleanup. Keep app-owned prompt sources in `src/domain/system-prompts`; interpolate
named fields once and never interpret user content as a second template.

Queued creative messages remain bound to their session and complete request snapshot.
Reserve the next global lease only after persistence, recovery and settlement. Failed
or canceled work holds the queue for review; host setup and external publishing cannot
queue. Restoring a held draft shares the synchronous composer owner through removal
and adoption. Cached attachment paths restore selection only, never filesystem access.
Owned pasted images retain exact native byte/hash records and are revalidated after
restart; never grant an attachment directory. PDF/text reads have explicit byte caps.

Chat activity comes from typed provider lifecycle and phase metadata, never prose.
Only observed provider settlement may replace a longer live partial with a shorter final.
Cached sessions do not establish completion. Keep child lifecycle separate from its tool;
historical status is only the last reported status. Structured questions belong to the exact
foreground session/request/thread/turn and remain transient. Plan collaboration is separate
from access mode and requires read-only access; default turns reset a resumed Plan thread.

Branches keep their canonical topic and explicit parent identity. Hydrate by exact session
ID and seed app-prepared prompts only into the intended canonical composer. Rewind verifies
the full current repository set and every crossed checkpoint before one compensated restore.
Pending queues block reset, Undo, rewind and fork. Adopt a returned rewind draft before
workspace refresh; failed refresh retains the UI owner and retries only that read.

Chat Markdown uses text-safe syntax tokens and strict sanitized local Mermaid SVG. Never load
diagram resources, execute provider HTML or enable JavaScript eval. The CSP permits only the
narrower WASM compilation required by the highlighter; retain the OS sandbox. Context/quota
values require native observations and fresh provider reads; unknown remains unavailable.
Manual compaction owns its lease through actual settlement and preserves history/receipts.

Queue ordering compares the complete reviewed session snapshot, preserves other session slots,
and never bypasses held failures or dispatch ownership. Turn navigation indexes accepted user
boundaries within the selected conversation and jumps by exact IDs. Only explicit Remove may
resume fresh work after the final held entry; Edit removal must not race draft adoption. Model
commands preserve draft/mode ownership; hidden composers cannot retain selector portals.
Expanded diagrams retain their sanitized source snapshot and lock dismissal through native
clipboard settlement.

Inline `$` commands replace only their freshly validated caret token and retain surrounding
draft text, attachments and mode ownership. Arrow selection scrolls only its popup, keeping
the editor caret and conversation position. Skill identities are separate from display
aliases. Remaining context comes from native used/max observations; unknown capacity stays
unavailable with a continuous subdued track, never invented progress. Countdown expiry never
renews account allowance. Compact requires an explicit usage-dialog click. Settled message
work duration uses only the exact completed provider turn's safe integer `durationMs`,
never timestamp arithmetic, tool duration or a mounted live timer. Preserve verified timing
only across the same turn; unknown send timestamps remain hidden.

Prompt inspection never hydrates or repairs a workspace. Keep exact app guidance snapshots
separate from raw user content, label current previews/templates honestly, and retain only
snapshots belonging to retained messages. Historical sources load lazily. Native file reads
bind inspection/session/thread identity, renew registered and enabled-skill authority on each
click, and allow only bounded canonical regular text files. Nested skill references stay
inside that freshly verified named skill folder; never grant the provider home. Literal
prompt/README rendering must not execute HTML, load resources or grant media access.
