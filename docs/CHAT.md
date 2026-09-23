# Chat editor and persistence

The composer uses Tiptap 3.31.3 and ProseMirror, following the atomic inline-node approach in the inspected T3 Code `ComposerPromptEditorTiptap.tsx` implementation. The mention menu uses Tiptap's Suggestion plugin. The editor supports IME composition, keyboard navigation, Escape, Enter to send, Shift+Enter for newlines, and atomic selection/deletion of references. Plain-text clipboard serialization retains actual file paths; pasted HTML cannot supply arbitrary mention attributes.

`mention-references.ts` supplies brand config, all workspace taste guides, the saved brand image, and the relevant script/packaging/composition/media files. Taste guides use the same distinct icons as the brand editor. Config, logo, assets, and project files have separate visual types. Filenames and human asset titles are searchable; the full absolute path stays available in the chip tooltip and serialized prompt. A stored reference whose file disappears remains visible and keeps its original path, rather than silently changing the intended input.

Drafts remain plain text with escaped `@[name](<absolute path>)` references in the local preferences store. Existing `@[name](path)` drafts are supported. `mention-document.ts` restores these tokens as editor nodes without interpreting ordinary Markdown. Text and read/edit mode are stored per conversation; the selected conversation is stored per workspace. A fresh conversation resets its draft explicitly. A stale selected ID falls back to an existing open conversation. Prepared publishing requests replace untouched drafts; edited drafts require the explicit “Use prepared request” action.

The renderer keeps open conversation composers mounted when switching tabs. History loads merge stable message IDs with newer streamed content. Authoritative completion refreshes reconcile checkpoints. Workspace refreshes and unrelated helper events preserve the selected conversation and draft. The message list follows output only while the user is near its bottom.

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
`tests/e2e/chat-receipt.spec.ts` supplies a separate renderer regression for the keyed
summary and expandable diff beside untouched agent prose.

On 2026-09-23 the focused Git, application, recovery, receipt, and storage suites passed
54 tests. The production build and three actual Electron chat/receipt regressions passed;
strict type checking, scoped lint, and the architecture gate were clean. Renderer tests
used deterministic IPC fixtures; the receipt backend tests used actual Git and disk I/O.

References: [Tiptap Suggestion](https://tiptap.dev/docs/editor/api/utilities/suggestion), [Tiptap mention rendering](https://tiptap.dev/docs/editor/extensions/nodes/mention). The inspected T3 Code checkout was commit `f5ef0ddb90a8c36584e181b1913e7b8a5df30ffc` in `/tmp/vandashi-references/t3code`; it is a reference checkout outside this repository.
