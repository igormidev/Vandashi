# Working on Vandashi

Read `genesis_prompt.md` and `docs/REQUIREMENTS.md` before changing a feature. The brief is the product contract. Update this file and `docs/ARCHITECTURE.md` whenever relevant architecture changes.

## MANDATORY quality gates

- ALWAYS follow dependency boundaries. NEVER bypass a port to reach the filesystem, Codex, Git, Electron, or Hyperframes from the renderer.
- ZERO static analysis warnings or errors. Run `npm run check` before EVERY commit. This includes consistent Prettier formatting, strict types, lint, architecture, tests, and a production build. NEVER disable checks to make a commit pass. Git hooks and CI enforce the same gate.
- Add meaningful tests for business rules, concurrency, recovery, schemas, and edge cases. Avoid tests that merely restate code.
- COMMIT after each verified feature or meaningful increment. Ask before every commit: does this meet the brief, handle failure and edge cases, preserve architecture, avoid unnecessary UI text, and require updated documentation?
- Check ALL consumers of a shared component before editing it. Test it on EVERY affected page, especially brand and video assets and chat.
- Never claim a feature works from compilation alone. Exercise real integrations and inspect the actual app. Record unavailable external prerequisites honestly.
- NEVER hardcode user-facing text in UI components. The English implementation checkpoint is complete and translation is active. Keep English source keys and every supported UI/diagnostic/native catalog in sync; preserve named interpolation and review natural language in context. Follow `docs/TRANSLATION.md` and its catalog/layout checks.
- Localization checks cover TS helpers, templates, constants, JSX and accessible attributes. Keep machine-token exceptions narrow and file-specific. Layer imports use explicit package allowlists; host APIs belong behind infrastructure ports.
- The pre-commit gate checks the staged snapshot. Stage complete changes and gate helpers; keep installed dependencies consistent with the staged lockfile. Never rely on unstaged fixes or untracked helpers to validate a commit.
- Keep app-owned message descriptors separate from raw provider output and user content. Use `AppFault` with a typed ID from `src/domain/messages.ts` for app-owned errors and retain external diagnostics separately. IPC uses a validated failure envelope, then a versioned marker through Electron's copied Error.message; decode only at the renderer boundary. Never infer a translation key by matching English prose. Keep native dialog text in its typed source catalog and preserve raw user/provider content.

## Design contract

Use Hyperframes' studio visual language: quiet dark surfaces, restrained borders, compact controls, sparse copy. Do not put everything in cards or add empty marketing subtitles. Explain with accessible tooltips. Use official platform marks. Horizontal scrollers carry padding INSIDE their content so scrolling reaches the component edge. Keep keyboard navigation, focus visibility, reduced motion, and error recovery usable.

## Safety and consistency

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
renderer code. `npm run check` verifies and builds both products. Run `npm run test:site`
against the production `/Vandashi/` base path before site delivery. Keep screenshots tied
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
Global skill installation belongs in external setup guidance, outside the repository-only
repair sandbox. Bundled-runtime and host-tool failures also need external setup; Git
recovery failures must never bypass clean preflight. Offer AI repair only for a verified
repository-writable target while Codex is usable, including after retries. Current host
checks have no such target and must not advertise unsupported repair turns.
For ChatGPT accounts, unavailable usage permission stays unverified and blocks entry/repair;
only a fresh explicit permission establishes recovery. API-key/custom providers do not
inherit a ChatGPT subscription-quota requirement.
