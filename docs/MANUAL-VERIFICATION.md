# Desktop verification record

Verification evidence is tied to a source revision and actual artifacts. The detailed
superseded walkthroughs remain in Git history; the durable product acceptance and
remaining scope live in [REQUIREMENTS.md](REQUIREMENTS.md).

AI agents follow [AGENTS.md](../AGENTS.md): run only tests created during the current
task unless the user explicitly requests broader testing. The historical results
below are evidence, not instructions to repeat whole suites.

## October 7, 2026 — chat refactor, version 0.1.18

- The static source gate passed formatting, strict types, zero-warning lint, architecture,
  version/catalog consistency and desktop/landing production builds. All eight desktop
  catalogs include the new app-owned labels. No existing or complete suite was run.
- **61 task-created unit cases** passed, including indexed streaming settlement, Markdown
  safety, structured request ownership, queue edit races, complete multi-repository rewind
  and compensation, usage/compaction, citation parsing, stash recovery and enabled skills.
- **Four real Codex integration cases** verified live command streaming/history/fork
  boundaries, structured Plan questions, usage/compaction/follow-up and fresh enabled
  skill discovery against Codex 0.160.1. The question case used GPT-6.1-Sol; older Luna
  reported that tool unavailable. These checks do not establish every model's capabilities.
- **32 task-created native UI cases** passed across the composer, queue, focus, anchored
  timeline, copying/quotes, work logs, syntax/diagrams, questions/plans, history recovery,
  context, commands and stash. Development cases use real React StrictMode and Chromium's
  OS sandbox. Export/timing additionally passed against the production `file:` renderer;
  the browser download saved the exact Unicode Markdown without navigation or filesystem IPC.
- Native clipboard cases preserve all pre-existing clipboard flavors. Controlled provider/UI
  fixtures establish interaction and layout, while actual Codex checks remain separate.
  Native acceptance here is English; catalog/type/layout source checks cover all eight languages.
- Independent read-only audits checked the original brief, section-specific safety/UX and
  landing accuracy. Authentic September screenshots remain visibly historical; no fixture
  capture replaces them. Full upstream T3 parity is not claimed; see [CHAT.md](CHAT.md).

The local installer is prepared separately from public update publication. macOS was locked
at the pre-install inspection, so the canonical app could not yet be safely restarted or its
About screen verified. Preserve the prepared bundle and existing user drafts until that check.

## October 6, 2026 — source 00e3d07, version 0.1.12

- Source checks passed with strict formatting, types, zero-warning lint, dependency
  boundaries and desktop/landing production builds. Before the new test-scope policy,
  the former combined gate also passed 1,001 tests with 14 explicit skips; the staged
  snapshot gate passed independently. Those counts do not describe today's static-only
  `npm run check` command.
- Focused actual Electron verification covered 57 scenarios across independent Brand
  saves, browser selection, packaging titles/tags, asset imports, chat/attachment
  ownership, queueing and workspace refresh. Two stale fixture assertions were corrected
  and verified in an 11-case rerun. This is combined evidence, not one uninterrupted run.
- The unsigned macOS ARM64 app was packaged, installed at `/Applications/Vandashi.app`
  and opened with the existing profile. The native About panel displayed version 0.1.12.
  All 303 generated output files matched the packaged copies by SHA-256. The previous
  installed bundle was backed up; user preferences, brands and repositories were preserved.
- A separate isolated-profile launch exercised the installed executable, observed
  successful renderer startup, and verified the renderer's OS sandbox. A direct native
  walkthrough opened an existing brand and inspected the current controls and presets.

## Boundaries

The local checks above do not establish a completed public release or current
Windows/Linux installer acceptance. Verify the exact release workflow and published
artifacts for that claim; see [packaged verification](PACKAGED-VERIFICATION.md) and
[update delivery](UPDATES.md).

Controlled UI/provider fixtures do not establish live AI image generation, a complete
WhisperX/YAMNet runtime/model installation, or an external platform upload. Actual native
Finder drag initiation also remains outside the current automation evidence. Keep these
limits explicit rather than marking combined product requirements complete.

Integration-specific commands, pinned versions and ownership contracts are maintained in
[Codex integration](CODEX.md), [Hyperframes integration](HYPERFRAMES.md),
[asset inspection](ASSET-INSPECTION.md), [transcription](TRANSCRIPTION.md), and
[translation](TRANSLATION.md).
