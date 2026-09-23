# Architecture

Vandashi is an Electron desktop application. There is no hosted backend. The renderer talks to a narrow, validated preload bridge; the main process composes use cases and adapters. Hyperframes runs its own loopback-only editor service while a project is open.

## Dependency direction

`renderer → domain contracts ← application ports ← infrastructure`

`desktop` is the composition root and may wire all non-renderer layers together. Domain modules contain serializable models, schemas, prompt construction, and deterministic defaults. Application modules orchestrate workflows against injected ports. Infrastructure implements local files, Git, Codex app-server, and Hyperframes. A future cloud or GitHub-backed store replaces a storage adapter instead of changing UI or business rules. Dependency Cruiser rejects cycles and reversed dependencies; TypeScript strict checking and type-aware ESLint reject unsafe boundaries.

## Persistence

An application registry in the OS user-data directory stores selected brand, brand folders, settings, chat-to-Codex-thread mappings, and layout preferences. Each brand owns `brand_identity/` as a Git repository; each video and each clip is an independent Git repository. Markdown and validated YAML are authoritative. Shared assets have their own tracked metadata and are synchronized into the selected video's asset tree without overwriting local assets. Media binaries remain local. Writes use atomic replacement and revision guards where manual editing could race with external edits.

Renderer-local preferences retain the selected conversation and unsent text/read-mode drafts across view changes and restarts. External-file selection grants are owned by the desktop process, not persisted as arbitrary trusted paths. Pane sizing saves merge the latest settings so resizing one workspace cannot erase another workspace's saved width. Settings for chat, commit messages, asset descriptions, chapters, and script synchronization are separate.

The renderer keeps editing locked until the current workspace reload finishes. Request
tickets reject older responses; incoming snapshots wait while a local draft is dirty,
and explicit workspace changes invalidate deferred snapshots. Validation state belongs
to a full workspace scope, so progress from one project cannot unlock another. Leaving
Studio for dependency checks follows the same flush/save/discard path as navigation.
Pending destructive or saving operations lock their modal controls and dismissal;
the permanent live region keeps error feedback accessible while a modal remains open.

## Agent execution

Use the installed Codex harness and its app-server protocol. Models and reasoning levels come from the live server. Conversation IDs persist per context. Read mode is enforced by the harness sandbox. A global operation lease spans foreground chat, metadata generation, commit generation, script synchronization, and publishing. Prompts repeat required context each turn. Every edit operation captures Git checkpoints across affected repositories. Completion reconciles commits, including interrupted runs. Undo verifies a recoverable Codex turn and Git checkpoint before touching either, preserving a backup ref.

Successful edit turns also persist an application-owned receipt derived from the net Git
diff between captured and verified final commits in every repository. This includes
changes committed directly by the agent and edits without provider file-change events.
The receipt is emitted only after conversation persistence succeeds, distinguishes no
net file changes, and never replaces the agent's own words. Interrupted or failed turns
retain their error history without a success receipt. The Git port exposes immutable
commit comparison; the adapter validates full commit hashes and uses literal file paths.

Layout/preferences writes are outside the project-operation lease because they do not change creative files or a running turn's captured model selection. Workspace reads use a stable cached snapshot while a lease is active: reading storage can itself synchronize shared assets or repair malformed YAML, so it must not race an agent halfway through a write. Change notifications are deferred until the lease is released.

## Host security

Node integration is disabled; context isolation and renderer sandboxing are enabled. IPC validates both the top-level sender and runtime payload. The preload exposes use cases, never shell execution. Media access is rooted in registered project directories and rejects escaping symlinks. External links require an allowed HTTP(S) URL. Hyperframes is isolated from the privileged preload. Native window minimum size is 1200 × 720.

Picker and native drop events grant access to specific canonical external files for previews and imports. Grants are rechecked before use. The media protocol serves supported media types only with restrictive response policies. Unfinished edits and operations block window unload until a native confirmation; process disposal happens only after the close is accepted.

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

## Localization

English UI resources live in `src/renderer/locales/*.ts` and are merged by
`src/renderer/i18n.ts`. UI reads through `react-i18next`. The shell persists a supported
locale and falls back to English; only English is currently registered and selectable.
The resource objects are not yet augmented into i18next's key/interpolation types, so
strict TypeScript does not currently reject unknown translation keys or parameters.

`src/domain/messages.ts` is a small, framework-free English catalog and typed descriptor
contract for app-owned turn receipts. Optional `ChatMessage.appMessage` metadata persists
that identity; the renderer resolves it through a separate `messages` namespace. Raw
agent prose, provider model names, and user-authored content remain separate and are not
translated. Broader backend errors, native dialogs, and diagnostics still need the typed
message/IPC boundary documented in `docs/LOCALIZATION-READINESS.md`; their English prose
must not become a runtime lookup key. Actual target-language resources and contextual
translation review begin only after functional implementation is complete.

## References

- [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron protocol handlers and streaming schemes](https://www.electronjs.org/docs/latest/api/protocol)
- [HTTP range request semantics](https://httpwg.org/specs/rfc9110.html#range.requests)
- [Type-aware ESLint](https://typescript-eslint.io/getting-started/typed-linting/)
- [Dependency Cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)

See integration-specific documents for pinned upstream versions, protocol details, and upgrade checks.
