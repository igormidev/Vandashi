# Codex integration

Vandashi embeds the installed Codex CLI through its local app-server JSONL protocol. It does not call the model API directly or read/copy login credentials. Authentication, model access, inference, and durable conversation history remain owned by Codex.

## Requirements and verification

The integration was verified with `codex-cli 0.155.1` on macOS on 2026-09-23. The runtime discovers the CLI through `VANDASHI_CODEX_PATH`, `PATH`, or conventional Homebrew/local paths. Finder launches on macOS often omit Homebrew Node from `PATH`. `launch.ts` detects a Node shebang and runs that official Codex launcher with Electron's bundled Node runtime, preserves the existing environment, and appends conventional executable directories. Its bootstrap removes `ELECTRON_RUN_AS_NODE` before vendor code spawns native children. Native binaries keep direct execution and argument boundaries; no shell is enabled. The local account must already be signed in (`codex login`). Windows installations must expose an executable Codex binary through that setting or PATH; a shell script is not accepted as arbitrary executable code.

Run:

```sh
npm test -- tests/codex.test.ts tests/codex-discovery.test.ts tests/codex-launch.test.ts tests/codex-prompts.test.ts
VANDASHI_CODEX_LIVE=1 npm test -- tests/codex-live.test.ts
```

The optional live test uses the installed signed-in account, two short GPT-6 Luna/low turns, and one Luna/medium structured-output turn. It creates temporary workspaces and archives its test conversations. It checks the actual read-only OS sandbox, streaming completion, persisted history, process restart, forking exactly before a turn, and schema-constrained JSON following a real read tool call. The normal test suite never makes inference calls.

A packaged macOS regression also launched with `PATH=/usr/bin:/bin:/usr/sbin:/sbin`, completed a real Codex script-sync turn, and verified the requested title change in the saved composition. This specifically verifies the npm launcher no longer fails with `env: node: No such file or directory` when started from Finder. Its separate media-render checks are documented with the media integration.

## Boundaries

- `src/domain/agent.ts` defines vendor-independent operations and events.
- `src/domain/prompts.ts` builds repeated, scope-specific context with mandatory files, assets, data contracts, and completion requirements.
- `src/infrastructure/codex/transport.ts` owns the child process, JSON framing, correlation, request deadlines, and failure fanout.
- `launch.ts` supplies a Node runtime to official npm launchers when the desktop process has a minimal PATH.
- `shutdown.ts` waits for the owned process to close, including termination of its launcher/process group; a kill signal alone is not treated as completion.
- `schemas.ts` validates inbound protocol data while accepting unknown future fields.
- `discovery.ts` maps real model, account, plugin, and skill capabilities.
- `policy.ts` enforces filesystem and external-tool restrictions.
- `execution.ts` waits for actual turn completion and reconciles early events.
- `events.ts` reduces streamed deltas to stable message snapshots; completed items replace accumulated text. All messages remain visible to chat, while returned output prefers the protocol's `final_answer` phase. Interim `commentary` must never be concatenated into schema-constrained JSON returned to automatic helpers.
- `history.ts` pages persisted turns without repeated-cursor loops.
- `client.ts` owns connection lifecycle and local inference exclusion.
- Application services own global exclusion, dirty-file locks, Git recovery, and scope-to-thread persistence.

No raw RPC, shell, filesystem, or credentials interface is exposed to the renderer.

## Protocol behavior

The client starts `codex app-server --stdio`, sends `initialize` with its Vandashi identity and experimental API capability, then `initialized`. Stdout is JSONL; stderr is bounded diagnostic text. The client rejects pending requests if the process exits. A turn has a ten-minute inactivity timeout, refreshed by actual protocol events. Normal model work has no fixed overall deadline.

`turn/start` only acknowledges acceptance. Completion is `turn/completed`, whose status can be completed, interrupted, or failed. File reconciliation must run after all three outcomes. A process failure is also a recovery condition. Stop sends `turn/interrupt` and keeps the operation locked until completion.

A lost, malformed, or internally failed start acknowledgement is an uncertain outcome.
The adapter closes the connection and awaits actual process termination before returning
`uncertain-start`. POSIX launches own an isolated process group; shutdown allows graceful
EOF/SIGTERM cleanup, escalates after five seconds, and removes remaining owned children.
Windows uses native `taskkill /T /F`. The application preserves staged source and partial
edits, reconciles them while still holding its lease, and records the failure without a
success receipt or an invented undo checkpoint. Only protocol validation rejections are
treated as definite non-starts. The real-process fixture in `codex-startup.test.ts` withholds
an ACK while a subprocess writes; it verifies shutdown completes before recovery can run.
The subprocess smoke is verified on macOS; Windows process-tree shutdown needs native CI.

Server requests cannot hang indefinitely. Command/file approvals are declined, structured questions receive an empty answer, and unsupported requests receive a clear RPC rejection. The UI receives a recoverable warning; the agent is instructed to ask questions in its reply. The transport does not auto-approve escalation or external actions. A future interactive approval UI can extend this single boundary.

Model names, reasoning levels, image support, and speed tiers come from paginated `model/list`. Standard mode clears the persisted service tier; Fast uses the catalog's priority tier. Explicit unavailable selections fail instead of silently changing models.

## Read and edit modes

Read mode uses an OS read-only sandbox and disables discovered MCP servers, installed plugins, app tools, browser use, and computer use. This is necessary because filesystem sandboxing alone does not constrain external MCP side effects. Web search remains available. Switching modes restarts the connection so loaded threads cannot retain prior tool capabilities. Configuration overrides affect the app-server session, never the user's saved configuration.

Edit mode limits writable roots to the repositories approved by the application. Both modes use approval policy `never`, and both disable Codex subagent features. Application helpers must share the same global operation gate as ordinary chat.

Publishing preflight calls the actual paginated MCP tool catalog. A connector name or documentation plugin alone is insufficient: it requires `cua_repl.js` or browser navigation, snapshot, and file-upload methods. Failed catalogs do not count. On this host a fresh app-server thread reported the CUA and Playwright servers connected, and a real `mcpServer/tool/call` for `cua_repl.js` successfully read available surfaces. No external upload was performed. See [PUBLISHING.md](PUBLISHING.md) for the release contract.

Creation and clip guidance prefer those connected browser controls for inspecting an existing verified project preview. They explicitly preserve the sandbox and report visual/render verification as pending when unavailable. Vandashi owns the separate preview/render runtime; the agent must not start competing persistent Studio servers. The read-mode prompt never grants browser capabilities.

Images can be passed as actual local image inputs when the selected model supports them. Other attachments are explicitly identified by absolute paths for tool access. The asset importer owns copying and metadata.

Actual `imageGeneration` items retain status and structured failure details. Completed,
nonfailed provider-reported saved paths become `ChatMessage.generatedImages`; raw base64
result data is never persisted in chat. Streamed items and paginated history use the same
mapping. A real Vandashi thumbnail turn on 2026-09-23 generated an image through the installed
tool, saved its provider artifact, then copied a 1664 × 936 PNG into the project's thumbnails.
The workspace copy decoded in the app and its uncropped inspection modal was checked.

Provider artifacts usually live outside the workspace. `image-artifacts.ts` records only
paths learned from completed normalized provider items and the initialization response's
actual `codexHome`. An artifact must match `generated_images/<threadId>/<itemId>.png` exactly.
Only that file is eligible, and each resolution checks a regular file and rejects symlinks
at the configured home and throughout the artifact subtree. The desktop media authorization
boundary consults the resolver; arbitrary Markdown and local session snapshots cannot add
grants. After restart, reading the matching Codex history restores this capability. Servers
without a reported Codex home fail closed. Images inherited from another thread after a
fork need the original thread's verified grant or an authorized workspace copy.

`codex-artifacts.test.ts` covers live and reopened-history grants, mismatched thread/item
paths, failed/unfinished items, arbitrary Markdown, missing files, non-regular files, and
symlink replacements. The upstream path convention is documented by
`codex-rs/ext/image-generation/src/artifact.rs` in the inspected reference checkout.

## Durable conversations and undo

New conversations use `historyMode: paginated`. Read through `thread/read` metadata and `thread/turns/list` with full items. Resume only when the thread is not already loaded: newly created threads may not materialize a rollout until the first turn.

Only a genuine missing-history error invalidates the saved scope-to-thread mapping. Authentication, timeout, and transport errors preserve it. Reset switches to a fresh conversation; it does not delete the old Codex history.

Opening a conversation merges recovered Codex snapshots into local history, updates
partial messages, and restores missing final/tool/image items. It preserves application
receipts, local errors, stable user-message IDs, and recorded timestamps. Undo message
boundaries are remapped to their original anchors when recovered items are inserted;
recovery never invents a verified file checkpoint for an unacknowledged turn.

Undo uses `thread/fork {threadId,beforeTurnId}`. It retains the prefix before that turn and preserves the source conversation for recovery. Forking changes conversation history only; application code separately restores repository snapshots and updates the active mapping. Before restoration, every repository must be clean and its current HEAD must equal the recorded post-run HEAD. This prevents undo from discarding later manual work or another chat's commits. Missing boundaries leave files untouched.

`thread/rollback` is obsolete in current Codex main. `thread/revert` exists for paginated history but destructively truncates the original conversation, so Vandashi uses the reversible fork path.

## Renderer editor verification

The chat composer uses Tiptap/ProseMirror atomic inline file references, with typed icons and preserved absolute-path serialization. It keeps draft text, read/edit mode, and selected conversations across renderer restarts. The built Electron regression suite verified caret-aware keyboard mentions, IME Enter handling, Shift+Enter, actual submitted file paths, workspace/helper refresh stability, prepared-request replacement, cache reset, and reopening drafts. These tests use a deterministic IPC fixture; they are separate from actual Codex inference verification. See [CHAT.md](CHAT.md).

## Updating compatibility

Generate protocol types from the installed target version before editing the adapter:

```sh
codex app-server generate-ts --experimental --out /tmp/vandashi-codex-protocol
```

Compare method and event shapes, then run both ordinary and live tests. Keep runtime checks tolerant of additional fields, but never infer successful operations from absent events or invented capabilities. Verify model and plugin discovery dynamically.

References inspected:

- [Official app-server documentation](https://learn.chatgpt.com/docs/app-server)
- [Codex source](https://github.com/openai/codex), revision `0b23f365f8dc24eeb6c1cf6fc2da7292621b4ba1`, especially protocol v2 and thread lifecycle processors.
- [T3 Code](https://github.com/pingdotgg/t3code), revision `f5ef0ddb90a8c36584e181b1913e7b8a5df30ffc`, especially `CodexProvider.ts`, `CodexSessionRuntime.ts`, model option mapping, paginated history, and stream reduction. The implementation here is independently written around Vandashi's smaller domain boundary.

The app-server protocol is experimental. Pin supported release testing, preserve errors, and re-run the live suite when upgrading the CLI integration.
