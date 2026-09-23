# Launch suite

The main video’s `launch.yml` is the canonical release ledger for both the main video and every clip. Each record is identified by `(platform, clipId)`, where `clipId: null` means the main video. Changing one release preserves the other records.

Landscape projects show short-form destinations on the left and long-form destinations on the right. Each clip has its own status and URL under every short-form destination. Portrait projects show short-form destinations for the main video. Preparation also requires every repository in the selected scope (brand, shared assets, main project, and selected clip) to be clean. A fresh, rendered landscape source is required for the long-form destinations; short-form destinations require a fresh portrait or square render.

Review fields, browser selection, thumbnail ordering, and chapters live in the upload draft. Preparing the chat does not change saved packaging and does not upload anything. The user can edit the prepared prompt before sending. Publishing conversations belong to the main workspace, using `publish:<platform>` for the main video and `publish:<platform>:<clipId>` for a clip. This keeps the correct conversation visible without navigating away from the launch dashboard.

The request includes the exact selected rendered file, destination channel URL, chosen browser, reviewed packaging, absolute thumbnail paths, and the parent launch record. Preparing it requires actual discovered Codex browser control methods; a documentation server or plugin name alone does not pass the preflight. Repeated per-turn guidance includes the selected clip’s script and packaging when relevant. The agent must verify the exact account, pause for direct browser login when needed, monitor actual upload and processing, and record only verified success. It must report missing browser capabilities or failures rather than simulating an upload. Credentials are never requested in chat.

## Chapters

YouTube’s documented manual chapter requirements are a first timestamp of `00:00`, at least three timestamps in ascending order, and a minimum chapter length of ten seconds. [YouTube Help](https://support.google.com/youtube/answer/9884579?hl=en). Chapter availability can also depend on the channel’s feature access.

`domain/launch.ts` implements those timing rules, requires single-line titles and whole seconds, and checks the last chapter against actual rendered duration. Both generated chapters and manually reviewed chapters pass the same validation. The editor loads the rendered video, supports native playback, start-time sliders, numeric seconds, capture of the current playhead, and seeking to a chapter. Cancel preserves the prior chapter draft. The application validates the timestamps again before preparing the upload prompt.

## Verification and limits

`tests/launch.test.ts` exercises actual local storage and Git with a deterministic media probe and agent boundary. It verifies distinct clip records and conversations, reviewed packaging isolation, mandatory clean-repository/channel/browser/format checks, chapter bounds, and URL validation.

`tests/e2e/launch.spec.ts` exercises the built Electron renderer with a test-only IPC backend. Its chapter editor decodes `tests/fixtures/chapter-video.mp4`, a generated sixty-second solid-color test video. The tests do not upload to external services. Real external publishing requires working browser tools in the installed Codex environment, a signed-in account in the selected browser, and the platform’s current upload interface. Account-specific experiments such as title or thumbnail testing are used only when actually available.

On the development host, a fresh Codex app-server thread reported both `cua_repl` and `playwright` connected. An actual `mcpServer/tool/call` invoking `cua_repl.js` with `await cua.getState();` succeeded without navigation or uploads. This verifies browser control is available through the spawned CLI, rather than assuming tools from the parent Codex desktop task are inherited. Other hosts must configure an appropriate browser connector.
