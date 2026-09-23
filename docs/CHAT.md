# Chat editor and persistence

The composer uses Tiptap 3.31.3 and ProseMirror, following the atomic inline-node approach in the inspected T3 Code `ComposerPromptEditorTiptap.tsx` implementation. The mention menu uses Tiptap's Suggestion plugin. The editor supports IME composition, keyboard navigation, Escape, Enter to send, Shift+Enter for newlines, and atomic selection/deletion of references. Plain-text clipboard serialization retains actual file paths; pasted HTML cannot supply arbitrary mention attributes.

`mention-references.ts` supplies brand config, all workspace taste guides, the saved brand image, and the relevant script/packaging/composition/media files. Taste guides use the same distinct icons as the brand editor. Config, logo, assets, and project files have separate visual types. Filenames and human asset titles are searchable; the full absolute path stays available in the chip tooltip and serialized prompt. A stored reference whose file disappears remains visible and keeps its original path, rather than silently changing the intended input.

Drafts remain plain text with escaped `@[name](<absolute path>)` references in the local preferences store. Existing `@[name](path)` drafts are supported. `mention-document.ts` restores these tokens as editor nodes without interpreting ordinary Markdown. Text and read/edit mode are stored per conversation; the selected conversation is stored per workspace. A fresh conversation resets its draft explicitly. A stale selected ID falls back to an existing open conversation. Prepared publishing requests replace untouched drafts; edited drafts require an explicit choice between “Use prepared request” and “Keep my draft” before sending. The unresolved choice is persisted with the draft and survives tab selection, page navigation, and reopening. Hiding a prepared target does not approve or discard its request.

The renderer keeps open conversation composers mounted when switching tabs. History loads merge stable message IDs with newer streamed content. Authoritative completion refreshes reconcile checkpoints. Workspace refreshes and unrelated helper events preserve the selected conversation and draft. The message list follows output only while the user is near its bottom.

At the application boundary, `chat-history.ts` also merges Codex's persisted history when
reopening a conversation. This recovers final responses or image outputs lost from the
local snapshot during shutdown, retains application receipts/errors, and avoids duplicate
user messages. Recovered insertions adjust each undo checkpoint's message boundary while
leaving its verified Git heads intact. `tests/chat-history.test.ts` exercises recovery,
repeat-open stability, storage round trips, and undo after recovery with real Git files.

Only the selected stored conversation is hydrated from Codex when a chat view opens.
Other open tabs hydrate on their first selection; incoming history never changes selection,
reopens a closed tab, or replaces its unsent draft. A failed read offers the existing retry
action. Image generation items display their completed local artifact as well as tool
progress. Markdown images pass through the same authorized media interface; remote images
are not fetched. Failed local images offer an explicit retry that rechecks authorization.
Provider artifacts outside the workspace require the exact verified grant described in
`CODEX.md`; a filename written only in Markdown cannot create that grant.

A conversation opened during another foreground operation may display its cached
history immediately. `OpenedChat.historyDeferred` is transient response metadata,
never a persisted authorization. The renderer waits for an idle event before reading
provider history and refreshing failed image URLs. A passive workspace read instead
queues the open behind that read because it emits no foreground completion event.
The backend rechecks foreground ownership after reading the cache, so a lease that
has already ended cannot unnecessarily defer hydration.

Pending opens are shared per API/scope/topic. A deferred response does not update the
session list again or mark its images verified, preventing a render/request loop.
An idle-event generation counter covers completion arriving before the deferred IPC
response: exactly one retry is scheduled after that response releases its attempt.
Background completion preserves selected tabs and unsent drafts. Unit tests exercise
the real operation gate with held Studio and workspace reads; native tests hold the
provider grant and order deferred/idle responses explicitly.

An asset-specific conversation keeps its original target. If the current storage index
no longer contains that asset, sending fails before an inference turn, transcript change,
or project edit. It never silently becomes the broader library conversation. The asset
index treats each `relativePath` as already relative to the selected library, including
legitimate nested folders named `assets`, `video_assets`, or `shared_assets`. Real local
and shared filesystem fixtures and deleted-asset transcripts cover these boundaries in
`tests/assets-scope.test.ts`.

Successful edit turns end with an application-owned Git receipt. `application/turn-receipt.ts`
compares each repository's captured starting commit with its verified commit after
reconciliation, so shell edits and commits made directly by the agent are included even
without a provider file-change event. File paths identify their repository and each diff
can be expanded. The receipt describes the net change: an edit committed and then fully
reversed is reported as no file changes. It does not rewrite the agent's original prose.

The application verifies that the repositories are still clean and at the expected heads,
then persists the conversation before emitting its receipt. Interrupted/failed agent turns,
failed commits, failed history persistence, and failed or stale comparisons do not produce
a saved receipt. Read-only conversations do not receive edit receipts. Existing history
without receipt metadata remains valid. Undo removes the receipt with its corresponding
turn, using the same stored checkpoints.

The live saved receipt also triggers the concise **Changes saved.** toast requested
for script synchronization. `renderer/app/receipt-toasts.ts` consumes only complete,
application-owned saved receipts with changed files and deduplicates their session/ID
pair across event resubscriptions. It never infers success from provider prose or an
activity-done event. Read-only answers, helpers, failed turns, and no-change receipts
produce no success toast. Loading persisted history does not toast again, and dismissing
the toast does not remove the independent receipt or its expandable file diffs.

`domain/messages.ts` supplies two English app-owned message IDs in a separate i18next
namespace; this keeps receipts localizable without treating arbitrary agent text as UI
strings. The broader localization boundary remains the work described in
`LOCALIZATION-READINESS.md`. This change does not translate existing content.

`tests/chat-mentions.test.ts` checks serialization, special paths, atom semantics, legacy drafts, and scope filtering. `tests/e2e/chat-mentions.spec.ts`, `chat.spec.ts`, and `chat-drafts.spec.ts` exercise the actual bundled Electron renderer with a deterministic test IPC backend. These UI tests do not imply external model execution; the separate Codex live tests exercise the real installed app-server.

`tests/application-receipt.test.ts` uses real temporary Git/storage repositories with a
deterministic agent. It covers direct and fallback commits, multiple repositories,
unchanged and reversed edits, persistence/restart/undo, and failure without a false success
claim. `tests/git.test.ts` covers immutable comparisons, literal filenames, binary changes,
renames, deletions, and rejection of revision arguments that are not full SHAs.
`tests/e2e/chat-receipt.spec.ts` supplies separate renderer regressions for the keyed
summary, expandable diff beside untouched agent prose, success toast, duplicate delivery,
reloaded receipt history, and suppression for unsuccessful/no-change work. Its dedicated
IPC fixture models persisted history independently of the live event stream; real disk
durability is covered by the application suite. The 12 receipt-consumer and real-Git
application cases pass; the expanded native toast cases await the coordinated rebuild.

On 2026-09-23 the focused Git, application, recovery, receipt, and storage suites passed
54 tests. The production build and three actual Electron chat/receipt regressions passed;
strict type checking, scoped lint, and the architecture gate were clean. Renderer tests
used deterministic IPC fixtures; the receipt backend tests used actual Git and disk I/O.

References: [Tiptap Suggestion](https://tiptap.dev/docs/editor/api/utilities/suggestion), [Tiptap mention rendering](https://tiptap.dev/docs/editor/extensions/nodes/mention). The inspected T3 Code checkout was commit `f5ef0ddb90a8c36584e181b1913e7b8a5df30ffc` in `/tmp/vandashi-references/t3code`; it is a reference checkout outside this repository.
