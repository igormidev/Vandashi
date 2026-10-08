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

`domain/messages.ts` supplies typed app-owned message IDs in a separate i18next
namespace; this keeps receipts localizable without treating arbitrary agent text as UI
strings. The current [translation contract](TRANSLATION.md) also covers diagnostics
and native dialogs. Existing user and provider content remains unchanged.

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

## October 7 chat refactor

The fresh reference is [T3 Code at `f570bd21663f56ce94c41829d3b7d72886e25a34`](https://github.com/pingdotgg/t3code/tree/f570bd21663f56ce94c41829d3b7d72886e25a34),
cloned outside this repository. The comparison covers its Codex adapter, work log, composer,
Markdown, proposed plans and context controls against the original Vandashi brief.

Model, reasoning and speed controls form a centered attached pill. Model families have distinct
icons with a generic fallback; selected reasoning and menu options share their icons. Accessible
menus open above triggers. Text fields have quiet focus cues while buttons/non-text inputs retain
keyboard focus visibility. Attachments sit beside Send, and the scroll extends behind the composer.

The Query pill separates queued text from the transcript. Cards show two lines and expand on
hover/keyboard focus to five scrollable lines with Edit/Remove beneath. Edit owns removal through
acknowledgement and exact text/mode/collaboration/attachment adoption. Already dispatched entries
cannot become duplicate drafts. Hover/focus arrows reorder a complete reviewed session snapshot;
stale ordering is rejected and held failures cannot be bypassed by moving another entry ahead.
Sent messages fold long text and copy complete original content.
Arrow Up/Down recalls sent prompts from an empty draft; selected assistant text can be quoted.
Quotes retain a source link that navigates only within the current conversation. Reading positions
use stable row anchors, preserving the visible row through tab switches and font/content reflow.
One timeline selection listener and memoized settled rows avoid reparsing the full history for
each streamed delta; this is bounded rendering optimization, not transcript virtualization.
Jump to message searches accepted user turns and their last answer within the selected conversation.
Keyboard navigation and bounded result pages reuse the same exact-ID scroll anchors. It is local
conversation navigation; upstream T3's cross-thread search and visual minimap remain separate.
Only known timestamps are displayed; recovered provider history does not invent send times.

The command menu provides Read/Edit/Plan, model selection and draft stashes plus freshly discovered enabled
Codex skills. Skill insertion passes a native `$name` mention without expanding writable roots.
`/model` opens the normal model picker while preserving remaining text, attachments and mode;
selection uses the existing settings-save/discovery ownership and failure recovery.
Per-conversation prompt stashes retain exact text, mode, Plan selection and attachment selections;
restoring over an occupied draft requires a reviewed swap that retains the previous draft. Stored
paths remain selections and never grant filesystem access. Failed preference writes preserve a
recoverable copy rather than silently clearing the live draft.

Work logs distinguish reasoning, read/search/command, file edits, browser, MCP/dynamic tools,
images, review, compaction, plans and child history. Commands, output and diffs expand individually.
Completed tools do not imply their children completed. Historical child status is last reported;
later observations update the current turn without rewriting raw snapshots. Only reasoning
actually supplied by Codex is displayed.
Elapsed Working indicators measure the interval observed by the mounted live UI, not a guessed
historical duration. Proposed plans download their exact Markdown through a browser-owned Blob.

The October 8 follow-up moves command discovery into the `$` caret suggestion, alongside the
existing `@` file suggestions. Choosing an item in the middle of a draft replaces only that
token. Native enabled skills remain project scoped; reserved names have distinct identities
even when their display aliases overlap. The visible Commands/Stash/Compact buttons are gone;
stash commands and their existing keyboard access remain available. Low-to-medium thinking
levels use increasing bars; the higher levels use distinct brain/circuit/processor/orbit icons,
with an unknown-level fallback.

An icon-only circular context indicator sits before the access selector inside the composer.
Its fill uses native current-thread occupancy, with a separate unknown appearance. The same
dialog retains explicit compaction and account allowance; each observed reset includes a
live days/hours/minutes countdown. Reaching that time requests a refresh and never fabricates
fresh allowance. All eight catalogs include these controls and explanations.

User and assistant metadata now sits below and outside message content, with mirrored footer
order. Timestamps remain visible and their tooltip includes elapsed days/hours/minutes; action
groups appear on hover/focus or touch and remain visible while pending. Completed answers and
plans display “Worked for…” only when the exact native turn reports a valid `durationMs`.
The adapter stores it on the last answer and preserves it through same-turn history/fork
merges. Historical timestamp arithmetic and the live UI timer cannot supply that duration.

Plan collaboration is read-only. Real GPT-6.1-Sol questions, exact replies and settlement were
verified against Codex 0.160.1; older Luna reported the tool unavailable. Proposed plans differ
from progress checklists. Implement sends through normal composer ownership; Revise prepares a
Plan draft for extra guidance. Failed sends retain that exact draft.

Context/quota controls distinguish unknown from zero. Native usage provides context occupancy;
account limits refresh from the provider. Explicit compaction waits for completion and preserves
history. Markdown supports tables/task lists, literal-text syntax highlighting, code copying and
sanitized local Mermaid diagrams with source switching.
Tables copy native plaintext, Markdown or CSV and offer a wrap toggle. Expanded diagrams retain
the reviewed sanitized SVG/source, support source copying, bounded zoom and pointer/keyboard
panning, and return focus after dismissal. Copying locks both viewport interaction and dismissal.
Mermaid's KaTeX dependency is pinned to the fixed `0.18.2` through a scoped override for
[GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7); native diagram verification
covers that installed dependency. Existing unrelated audit findings remain outside this change.

Historical Edit rewinds one verified transaction across all captured repositories, preserves
Git/Codex history and compensates owned partial failures. A saved rewind followed by failed
refresh retains the restored draft and retries only the read. Branches keep their topic, show
a branch mark, hydrate by exact session ID and have no inherited workspace Undo rights. Queues
block history replacement; hidden branches never receive canonical app-prepared prompts.

This does not claim unrestricted T3 parity. Vandashi retains its one-operation lease,
repository-scoped creative access and `approvalPolicy: never`. External approval prompts,
arbitrary terminal management, queued turn steering and new child-agent execution remain outside
this contract. Child history display does not enable concurrent child writes. Cross-platform
release acceptance and external publishing require their separate verification.
